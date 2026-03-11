// ============================================================
// server.js - 德州扑克联网服务端
// ============================================================

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');

// 加载共享模块
// 先把 constants 注入 global, 因为 card.js/deck.js 等在浏览器中依赖全局变量
const constants = require('./js/constants.js');
Object.assign(global, constants);

const { Card } = require('./js/card.js');
const { Deck } = require('./js/deck.js');
const { HandEvaluator } = require('./js/evaluator.js');
const { Player } = require('./js/player.js');
const { AI } = require('./js/ai.js');

// 注入类到 global, 因为 game.js 等在浏览器中依赖全局类
Object.assign(global, { Card, Deck, HandEvaluator, Player, AI });

const { Game } = require('./js/game.js');
Object.assign(global, { Game });

const { MessageType, GameMode, GamePhase, Action, AI_NAMES, DEFAULT_SETTINGS } = constants;
const NEXT_HAND_DELAY_MS = 2600;

const CHARACTER_MANIFEST_PATH = path.join(__dirname, 'src', 'characters', 'manifest.json');

function loadCharacterManifest() {
    try {
        const manifest = JSON.parse(fs.readFileSync(CHARACTER_MANIFEST_PATH, 'utf8'));
        if (!Array.isArray(manifest.characters) || manifest.characters.length === 0) {
            throw new Error('Character manifest is empty');
        }
        return manifest;
    } catch (error) {
        console.error('Failed to load character manifest:', error);
        return {
            version: 1,
            defaultCharacterId: null,
            aiCharacterIds: [],
            characters: []
        };
    }
}

const characterManifest = loadCharacterManifest();
const characterMap = new Map(
    (characterManifest.characters || []).map((character) => [character.id, character])
);

function normalizeCharacterId(characterId) {
    if (characterId && characterMap.has(characterId)) {
        return characterId;
    }

    if (characterManifest.defaultCharacterId && characterMap.has(characterManifest.defaultCharacterId)) {
        return characterManifest.defaultCharacterId;
    }

    const firstCharacter = characterManifest.characters && characterManifest.characters[0];
    return firstCharacter ? firstCharacter.id : null;
}

function getAICharacterId(index) {
    const pool = (characterManifest.aiCharacterIds || []).filter((characterId) => characterMap.has(characterId));
    if (pool.length > 0) {
        return pool[index % pool.length];
    }
    return normalizeCharacterId(null);
}

function getAvatarType(user) {
    if (user.avatar_type === 'custom' || user.avatar_type === 'preset') {
        return user.avatar_type;
    }
    return user.avatar === 'custom' ? 'custom' : 'preset';
}

// ==================== 用户数据库 ====================

const DB_DIR = path.join(os.homedir(), '.funplus', 'texas_poker');
fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(path.join(DB_DIR, 'users.db'));
db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        nickname TEXT,
        avatar TEXT DEFAULT 'default',
        created_at TEXT DEFAULT (datetime('now'))
    )
`);

function ensureUserSchema() {
    const columns = new Set(
        db.prepare(`PRAGMA table_info(users)`).all().map((column) => column.name)
    );
    const migrations = [
        {
            name: 'nickname',
            sql: `ALTER TABLE users ADD COLUMN nickname TEXT`
        },
        {
            name: 'avatar',
            sql: `ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT 'default'`
        },
        {
            name: 'avatar_data',
            sql: `ALTER TABLE users ADD COLUMN avatar_data TEXT`
        },
        {
            name: 'avatar_type',
            sql: `ALTER TABLE users ADD COLUMN avatar_type TEXT DEFAULT 'preset'`
        },
        {
            name: 'character_id',
            sql: `ALTER TABLE users ADD COLUMN character_id TEXT`
        }
    ];

    migrations.forEach(({ name, sql }) => {
        if (columns.has(name)) return;
        db.exec(sql);
    });

    db.prepare(
        `UPDATE users
         SET avatar_type = CASE WHEN avatar = 'custom' THEN 'custom' ELSE 'preset' END
         WHERE avatar_type IS NULL OR avatar_type = ''`
    ).run();

    const defaultCharacterId = normalizeCharacterId(null);
    if (defaultCharacterId) {
        db.prepare(
            `UPDATE users
             SET character_id = ?
             WHERE character_id IS NULL OR character_id = ''`
        ).run(defaultCharacterId);
    }
}

ensureUserSchema();

function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString('hex');
}

// 会话管理
const sessions = new Map(); // token -> username

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function getSessionUser(req) {
    const token = req.headers['x-auth-token'];
    return token ? sessions.get(token) : null;
}

function serializeUserProfile(user) {
    const avatarType = getAvatarType(user);
    return {
        nickname: user.nickname || user.username,
        characterId: normalizeCharacterId(user.character_id),
        avatarType,
        avatarData: avatarType === 'custom' ? (user.avatar_data || null) : null
    };
}

function getUserProfile(username) {
    const user = db
        .prepare('SELECT username, nickname, avatar, avatar_type, avatar_data, character_id FROM users WHERE username = ?')
        .get(username);
    return user ? serializeUserProfile(user) : null;
}

function getProfileFromAuthToken(token) {
    const username = token ? sessions.get(token) : null;
    if (!username) return null;
    const user = db
        .prepare('SELECT username, nickname, avatar, avatar_type, avatar_data, character_id FROM users WHERE username = ?')
        .get(username);
    if (!user) return null;
    return {
        username: user.username,
        profile: serializeUserProfile(user)
    };
}

// ==================== Express + HTTP ====================

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const MAX_CHAT_LENGTH = 80;
const CHAT_COOLDOWN_MS = 500;

// ==================== 用户认证 API ====================

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.json({ success: false, message: '用户名和密码不能为空' });
    }
    if (username.length < 2 || username.length > 12) {
        return res.json({ success: false, message: '用户名长度需为 2-12 个字符' });
    }
    if (password.length < 4) {
        return res.json({ success: false, message: '密码至少 4 个字符' });
    }

    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
        return res.json({ success: false, message: '用户名已被注册' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);

    db.prepare(
        `INSERT INTO users (username, password_hash, salt, nickname, avatar, avatar_type, character_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(username, hash, salt, username, 'default', 'preset', normalizeCharacterId(null));
    res.json({ success: true, username });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.json({ success: false, message: '用户名和密码不能为空' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user) {
        return res.json({ success: false, message: '用户名或密码错误' });
    }

    const hash = hashPassword(password, user.salt);
    if (hash !== user.password_hash) {
        return res.json({ success: false, message: '用户名或密码错误' });
    }

    const token = generateToken();
    sessions.set(token, user.username);

    res.json({
        success: true,
        username: user.username,
        ...serializeUserProfile(user),
        token
    });
});

// ==================== 个人信息 API ====================

app.post('/api/profile/update', (req, res) => {
    try {
        const username = getSessionUser(req);
        if (!username) return res.json({ success: false, message: '未登录' });

        const { nickname, characterId, avatarType } = req.body;

        if (nickname !== undefined) {
            const trimmed = (nickname || '').trim();
            if (trimmed.length < 1 || trimmed.length > 12) {
                return res.json({ success: false, message: '昵称长度需为 1-12 个字符' });
            }
            db.prepare('UPDATE users SET nickname = ? WHERE username = ?').run(trimmed, username);
        }

        if (characterId !== undefined) {
            const normalizedCharacterId = normalizeCharacterId(characterId);
            if (!normalizedCharacterId || normalizedCharacterId !== characterId) {
                return res.json({ success: false, message: '角色参数无效' });
            }
            db.prepare(
                `UPDATE users
                 SET character_id = ?
                 WHERE username = ?`
            ).run(normalizedCharacterId, username);
        }

        if (avatarType !== undefined) {
            if (avatarType !== 'preset' && avatarType !== 'custom') {
                return res.json({ success: false, message: '头像类型无效' });
            }

            if (avatarType === 'preset') {
                db.prepare(
                    `UPDATE users
                     SET avatar = 'default',
                         avatar_type = 'preset',
                         avatar_data = NULL
                     WHERE username = ?`
                ).run(username);
            } else {
                db.prepare(
                    `UPDATE users
                     SET avatar = 'custom',
                         avatar_type = 'custom'
                     WHERE username = ?`
                ).run(username);
            }
        }

        const profile = getUserProfile(username);
        res.json({ success: true, ...profile });
    } catch (error) {
        console.error('Profile update failed:', error);
        res.status(500).json({ success: false, message: '保存个人信息失败' });
    }
});

app.post('/api/profile/avatar-upload', (req, res) => {
    try {
        const username = getSessionUser(req);
        if (!username) return res.json({ success: false, message: '未登录' });

        const { imageData } = req.body;
        if (!imageData || !imageData.startsWith('data:image/')) {
            return res.json({ success: false, message: '无效的图片数据' });
        }

        // 限制大小 (~500KB base64)
        if (imageData.length > 700000) {
            return res.json({ success: false, message: '图片过大，请裁剪后上传' });
        }

        db.prepare(
            `UPDATE users
             SET avatar = 'custom',
                 avatar_type = 'custom',
                 avatar_data = ?
             WHERE username = ?`
        ).run(imageData, username);
        res.json({ success: true, avatarType: 'custom', avatarData: imageData });
    } catch (error) {
        console.error('Avatar upload failed:', error);
        res.status(500).json({ success: false, message: '头像上传接口异常' });
    }
});

app.post('/api/profile/password', (req, res) => {
    try {
        const username = getSessionUser(req);
        if (!username) return res.json({ success: false, message: '未登录' });

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.json({ success: false, message: '请填写完整' });
        }
        if (newPassword.length < 4) {
            return res.json({ success: false, message: '新密码至少 4 个字符' });
        }

        const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
        const hash = hashPassword(currentPassword, user.salt);
        if (hash !== user.password_hash) {
            return res.json({ success: false, message: '当前密码错误' });
        }

        const newSalt = crypto.randomBytes(16).toString('hex');
        const newHash = hashPassword(newPassword, newSalt);
        db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE username = ?').run(newHash, newSalt, username);

        res.json({ success: true, message: '密码修改成功' });
    } catch (error) {
        console.error('Password update failed:', error);
        res.status(500).json({ success: false, message: '密码修改失败' });
    }
});

app.get('/api/avatars', (req, res) => {
    const srcDir = path.join(__dirname, 'src');
    const avatars = ['default'];
    try {
        const files = fs.readdirSync(srcDir);
        files.forEach(f => {
            if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(f)) {
                avatars.push(f);
            }
        });
    } catch (e) {}
    res.json({ avatars });
});

app.use((err, req, res, next) => {
    if (!err) return next();

    if (req.path.startsWith('/api/')) {
        if (err.type === 'entity.too.large') {
            return res.status(413).json({ success: false, message: '请求数据过大，请重新裁剪图片' });
        }
        if (err instanceof SyntaxError && 'body' in err) {
            return res.status(400).json({ success: false, message: '请求体不是有效的 JSON' });
        }

        console.error('Unhandled API error:', err);
        return res.status(500).json({ success: false, message: '服务器内部错误' });
    }

    next(err);
});

// ==================== WebSocket ====================

const wss = new WebSocketServer({ server });
const WS_HEARTBEAT_MS = 15000;

// 房间管理
const rooms = new Map();
// ws -> 玩家映射
const wsPlayerMap = new Map();

function generateRoomId() {
    let id;
    do {
        id = String(Math.floor(1000 + Math.random() * 9000));
    } while (rooms.has(id));
    return id;
}

function generatePlayerId() {
    return Math.random().toString(36).substring(2, 10);
}

wss.on('connection', (ws) => {
    const playerId = generatePlayerId();
    ws.isAlive = true;
    wsPlayerMap.set(ws, { playerId, roomId: null, playerName: null, lastChatAt: 0 });

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('message', (data) => {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch (e) {
            return;
        }
        handleMessage(ws, msg);
    });

    ws.on('close', () => {
        leaveRoom(ws, '连接断开，已离开牌桌');
        wsPlayerMap.delete(ws);
    });
});

const wsHeartbeatTimer = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            ws.terminate();
            return;
        }

        ws.isAlive = false;
        try {
            ws.ping();
        } catch (error) {
            ws.terminate();
        }
    });
}, WS_HEARTBEAT_MS);

server.on('close', () => {
    clearInterval(wsHeartbeatTimer);
});

function send(ws, msg) {
    if (ws.readyState === 1) {
        ws.send(JSON.stringify(msg));
    }
}

function getRoomPlayerList(room) {
    return room.players.map((player) => ({
        playerId: player.playerId,
        playerName: player.playerName,
        characterId: normalizeCharacterId(player.characterId)
    }));
}

function sendRoomSnapshot(ws, room, playerId, type = MessageType.ROOM_JOINED) {
    send(ws, {
        type,
        roomId: room.id,
        players: getRoomPlayerList(room),
        settings: room.settings,
        hostPlayerId: room.hostPlayerId,
        yourPlayerId: playerId
    });
}

function broadcastRoomSnapshot(room) {
    room.players.forEach((player) => {
        sendRoomSnapshot(player.ws, room, player.playerId, MessageType.ROOM_JOINED);
    });
}

function clearActionTimeout(game) {
    if (game && game._actionTimeout) {
        clearTimeout(game._actionTimeout);
        game._actionTimeout = null;
    }
}

function clearNextHandTimer(room) {
    if (room && room._nextHandTimer) {
        clearTimeout(room._nextHandTimer);
        room._nextHandTimer = null;
    }
}

function finishRoomGameIfNeeded(room) {
    if (!room.game) return false;

    const activePlayers = room.game.getActivePlayers();
    if (activePlayers.length > 1) return false;

    room._nextHandPending = false;
    clearNextHandTimer(room);
    if (room.game.onGameOver) {
        room.game.onGameOver(activePlayers[0] || null);
    }
    return true;
}

function leaveRoom(ws, reasonText = '离开牌桌') {
    const info = wsPlayerMap.get(ws);
    if (!info || !info.roomId) return;

    const roomId = info.roomId;
    info.roomId = null;

    const room = rooms.get(roomId);
    if (!room) return;

    room.players = room.players.filter((player) => player.playerId !== info.playerId);

    if (room.game) {
        const gamePlayer = room.game.players.find((player) => player.playerId === info.playerId);
        if (gamePlayer) {
            const playerName = gamePlayer.name;
            const handSettled = !!room._nextHandPending;
            gamePlayer.pendingLeave = true;
            gamePlayer.isHuman = false;
            gamePlayer.playerId = null;

            broadcastMessage(room, `${playerName} ${reasonText}`);

            if (handSettled) {
                room.game.finalizePendingLeaves();
                if (!finishRoomGameIfNeeded(room)) {
                    broadcastGameState(room);
                }
            } else if (
                room.game.currentPlayerIndex >= 0 &&
                room.game.players[room.game.currentPlayerIndex] === gamePlayer &&
                room.game._humanActionResolve
            ) {
                clearActionTimeout(room.game);
                const resolve = room.game._humanActionResolve;
                room.game._humanActionResolve = null;
                resolve({ action: Action.FOLD, amount: 0 });
            } else {
                if (gamePlayer.isInHand && !gamePlayer.isAllIn && !gamePlayer.isFolded) {
                    gamePlayer.fold();
                }
                if (!gamePlayer.isAllIn) {
                    gamePlayer.lastAction = '离桌';
                }
                broadcastGameState(room);
            }
        }
    }

    if (room.players.length === 0) {
        clearNextHandTimer(room);
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted (no online players)`);
        return;
    }

    if (room.hostPlayerId === info.playerId) {
        room.hostPlayerId = room.players[0].playerId;
        broadcastMessage(room, `房主已变更为 ${room.players[0].playerName}`);
    }

    if (room.state === 'waiting') {
        broadcastRoomSnapshot(room);
    }

    console.log(`Player ${info.playerName} left room ${roomId}`);
}

// ==================== 消息处理 ====================

function handleMessage(ws, msg) {
    switch (msg.type) {
        case MessageType.CREATE_ROOM:
            handleCreateRoom(ws, msg);
            break;
        case MessageType.JOIN_ROOM:
            handleJoinRoom(ws, msg);
            break;
        case MessageType.LEAVE_ROOM:
            leaveRoom(ws, '主动离开牌桌');
            break;
        case MessageType.START_GAME:
            handleStartGame(ws);
            break;
        case MessageType.PLAYER_ACTION:
            handlePlayerAction(ws, msg);
            break;
        case MessageType.NEXT_HAND:
            handleNextHand(ws);
            break;
        case MessageType.SEND_CHAT:
            handleChatMessage(ws, msg);
            break;
    }
}

function handleCreateRoom(ws, msg) {
    const sessionProfile = getProfileFromAuthToken(msg.authToken);
    const fallbackName = sessionProfile ? sessionProfile.profile.nickname : '玩家';
    const playerName = (msg.playerName || '').trim() || fallbackName;
    const info = wsPlayerMap.get(ws);
    info.playerName = playerName;
    info.username = sessionProfile ? sessionProfile.username : null;

    const roomId = generateRoomId();
    const settings = {
        ...DEFAULT_SETTINGS,
        gameMode: msg.gameMode || GameMode.STANDARD,
        playerCount: Math.min(6, Math.max(2, parseInt(msg.playerCount) || 6)),
        startingChips: parseInt(msg.startingChips) || 1000,
        smallBlind: parseInt(msg.smallBlind) || 10,
        bigBlind: parseInt(msg.bigBlind) || 20
    };
    if (settings.bigBlind <= settings.smallBlind) {
        settings.bigBlind = settings.smallBlind * 2;
    }

    const room = {
        id: roomId,
        hostPlayerId: info.playerId,
        players: [{
            playerId: info.playerId,
            playerName: playerName,
            characterId: sessionProfile ? sessionProfile.profile.characterId : normalizeCharacterId(null),
            avatarType: sessionProfile ? sessionProfile.profile.avatarType : 'preset',
            ws: ws
        }],
        settings: settings,
        state: 'waiting',
        game: null
    };

    rooms.set(roomId, room);
    info.roomId = roomId;

    sendRoomSnapshot(ws, room, info.playerId, MessageType.ROOM_CREATED);

    console.log(`Room ${roomId} created by ${playerName}`);
}

function handleJoinRoom(ws, msg) {
    const roomId = (msg.roomId || '').trim();
    const sessionProfile = getProfileFromAuthToken(msg.authToken);
    const fallbackName = sessionProfile ? sessionProfile.profile.nickname : '玩家';
    const playerName = (msg.playerName || '').trim() || fallbackName;
    const info = wsPlayerMap.get(ws);
    info.playerName = playerName;
    info.username = sessionProfile ? sessionProfile.username : null;

    const room = rooms.get(roomId);
    if (!room) {
        send(ws, { type: MessageType.ROOM_ERROR, message: '房间不存在' });
        return;
    }
    if (room.state !== 'waiting') {
        send(ws, { type: MessageType.ROOM_ERROR, message: '游戏已开始，无法加入' });
        return;
    }
    if (room.players.length >= room.settings.playerCount) {
        send(ws, { type: MessageType.ROOM_ERROR, message: '房间已满' });
        return;
    }

    room.players.push({
        playerId: info.playerId,
        playerName: playerName,
        characterId: sessionProfile ? sessionProfile.profile.characterId : normalizeCharacterId(null),
        avatarType: sessionProfile ? sessionProfile.profile.avatarType : 'preset',
        ws: ws
    });
    info.roomId = roomId;

    broadcastRoomSnapshot(room);

    console.log(`${playerName} joined room ${roomId} (${room.players.length}/${room.settings.playerCount})`);
}

function handleStartGame(ws) {
    const info = wsPlayerMap.get(ws);
    const room = rooms.get(info.roomId);
    if (!room) return;
    if (room.hostPlayerId !== info.playerId) {
        send(ws, { type: MessageType.ROOM_ERROR, message: '只有房主可以开始游戏' });
        return;
    }
    if (room.players.length < 2 && room.settings.playerCount - room.players.length === 0) {
        send(ws, { type: MessageType.ROOM_ERROR, message: '至少需要2名玩家' });
        return;
    }

    room.state = 'playing';
    startRoomGame(room);
}

function handlePlayerAction(ws, msg) {
    const info = wsPlayerMap.get(ws);
    const room = rooms.get(info.roomId);
    if (!room || !room.game) return;

    const game = room.game;
    const currentPlayer = game.players[game.currentPlayerIndex];
    if (!currentPlayer || currentPlayer.playerId !== info.playerId) {
        send(ws, { type: MessageType.ROOM_ERROR, message: '还没轮到你' });
        return;
    }

    // 验证操作合法性
    const action = msg.action;
    const amount = parseInt(msg.amount) || 0;

    if (!Object.values(Action).includes(action)) {
        send(ws, { type: MessageType.ROOM_ERROR, message: '无效操作' });
        return;
    }

    // 提交操作
    if (game._humanActionResolve) {
        clearActionTimeout(game);
        const resolve = game._humanActionResolve;
        game._humanActionResolve = null;
        resolve({ action, amount });
    }
}

function getRoomGamePlayer(room, playerId) {
    if (!room || !room.game) return null;
    return room.game.players.find((player) => player.playerId === playerId) || null;
}

function getAliveHumanRoomPlayers(room) {
    if (!room || !room.game) return [];
    return room.players.filter((roomPlayer) => {
        const gamePlayer = getRoomGamePlayer(room, roomPlayer.playerId);
        return !!gamePlayer && !gamePlayer.isBusted;
    });
}

function handleNextHand(ws) {
    return;
}

function handleChatMessage(ws, msg) {
    const info = wsPlayerMap.get(ws);
    if (!info || !info.roomId) return;

    const room = rooms.get(info.roomId);
    if (!room || !room.game || room.state !== 'playing') return;

    const roomPlayer = room.players.find((player) => player.playerId === info.playerId);
    if (!roomPlayer) return;

    const now = Date.now();
    if (now - (info.lastChatAt || 0) < CHAT_COOLDOWN_MS) {
        return;
    }

    const text = String(msg.text || '').replace(/\s+/g, ' ').trim();
    if (!text) return;

    const normalizedText = text.slice(0, MAX_CHAT_LENGTH);
    info.lastChatAt = now;

    broadcastChatMessage(room, {
        playerId: roomPlayer.playerId,
        playerName: roomPlayer.playerName,
        text: normalizedText
    });
}

// ==================== 游戏逻辑 ====================

function startRoomGame(room) {
    const game = new Game(room.settings);
    clearNextHandTimer(room);
    room._nextHandPending = false;

    // 覆盖 _initPlayers: 真人 + AI 填位
    game.players = [];

    // 添加真人玩家
    room.players.forEach((p, i) => {
        const player = new Player(i, p.playerName, room.settings.startingChips, true);
        player.playerId = p.playerId;
        player.seatIndex = i;
        player.characterId = normalizeCharacterId(p.characterId);
        player.avatarType = p.avatarType || 'preset';
        game.players.push(player);
    });

    // AI 填位
    const aiStartIndex = room.players.length;
    for (let i = aiStartIndex; i < room.settings.playerCount; i++) {
        const aiPlayer = new Player(i, AI_NAMES[i - aiStartIndex] || `AI-${i}`, room.settings.startingChips, false);
        aiPlayer.seatIndex = i;
        aiPlayer.characterId = getAICharacterId(i - aiStartIndex);
        aiPlayer.avatarType = 'preset';
        game.players.push(aiPlayer);
    }

    room.game = game;

    // 绑定回调
    game.onStateChange = () => {
        broadcastGameState(room);
    };

    game.onMessage = (msg) => {
        broadcastMessage(room, msg);
    };

    game.onHandComplete = (summary) => {
        room._nextHandPending = true;
        clearNextHandTimer(room);

        const handSummary = {
            winnerNames: Array.isArray(summary && summary.winnerNames) ? summary.winnerNames : [],
            totalPot: Number.isFinite(summary && summary.totalPot) ? summary.totalPot : 0
        };

        room.players.forEach((p) => {
            send(p.ws, {
                type: MessageType.HAND_COMPLETE,
                summary: handSummary,
                nextHandDelayMs: NEXT_HAND_DELAY_MS
            });
        });

        room._nextHandTimer = setTimeout(() => {
            room._nextHandTimer = null;
            if (!room._nextHandPending || !room.game) return;
            room._nextHandPending = false;
            room.game.startNewHand();
        }, NEXT_HAND_DELAY_MS);
    };

    game.onGameOver = (winner) => {
        clearNextHandTimer(room);
        room._nextHandPending = false;
        room.players.forEach(p => {
            send(p.ws, {
                type: MessageType.GAME_OVER,
                winner: winner ? { name: winner.name, chips: winner.chips } : null
            });
        });
        room.state = 'waiting';
        room.game = null;
    };

    // 重写等待人类操作
    game._waitForHumanAction = (player) => {
        // 找到对应的ws连接
        const roomPlayer = room.players.find(p => p.playerId === player.playerId);
        if (!roomPlayer) {
            return Promise.resolve({ action: Action.FOLD, amount: 0 });
        }

        // 计算可用操作
        const actions = getAvailableActions(game, player);

        // 发送 your_turn 消息
        send(roomPlayer.ws, {
            type: MessageType.YOUR_TURN,
            actions: actions
        });

        // 广播状态
        broadcastGameState(room);

        // 30秒超时
        return new Promise((resolve) => {
            game._humanActionResolve = resolve;

            game._actionTimeout = setTimeout(() => {
                if (game._humanActionResolve === resolve) {
                    game._humanActionResolve = null;
                    // 超时自动过牌或弃牌
                    const checkAction = actions.find(a => a.action === Action.CHECK);
                    if (checkAction) {
                        resolve({ action: Action.CHECK, amount: 0 });
                    } else {
                        resolve({ action: Action.FOLD, amount: 0 });
                    }
                }
                game._actionTimeout = null;
            }, 30000);
        });
    };

    // 重写延迟方法，服务端缩短延迟
    game._delay = (ms) => new Promise(resolve => setTimeout(resolve, Math.min(ms, 500)));

    game.startNewHand();
}

function getAvailableActions(game, player) {
    const toCall = game.currentBet - player.currentBet;
    const actions = [];

    if (toCall > 0) {
        actions.push({ action: Action.FOLD, label: '弃牌' });
    }
    if (toCall === 0) {
        actions.push({ action: Action.CHECK, label: '过牌' });
    }
    if (toCall > 0 && toCall < player.chips) {
        actions.push({ action: Action.CALL, label: `跟注 ${toCall}`, amount: toCall });
    }
    const minRaiseTotal = game.currentBet + game.minRaise;
    if (player.chips + player.currentBet > minRaiseTotal) {
        actions.push({
            action: Action.RAISE,
            label: '加注',
            min: minRaiseTotal,
            max: player.chips + player.currentBet
        });
    }
    if (player.chips > 0) {
        actions.push({ action: Action.ALL_IN, label: `全下 ${player.chips}`, amount: player.chips });
    }

    return actions;
}

function broadcastGameState(room) {
    if (!room.game) return;
    const game = room.game;
    const state = game.getState();
    const isShowdown = state.phase === GamePhase.SHOWDOWN;

    room.players.forEach(rp => {
        // 为每个玩家定制状态（隐藏他人手牌）
        const playerState = {
            ...state,
            players: state.players.map(p => {
                const show = isShowdown && p.isInHand;
                const isMe = p.playerId === rp.playerId;
                return {
                    id: p.id,
                    name: p.name,
                    chips: p.chips,
                    isHuman: p.isHuman,
                    playerId: p.playerId,
                    characterId: normalizeCharacterId(p.characterId),
                    holeCards: (isMe || show) ? p.holeCards.map(c => c.toJSON ? c.toJSON() : c) : p.holeCards.map(() => null),
                    currentBet: p.currentBet,
                    totalBet: p.totalBet,
                    isFolded: p.isFolded,
                    isAllIn: p.isAllIn,
                    isBusted: p.isBusted,
                    isDealer: p.isDealer,
                    lastAction: p.lastAction,
                    handResult: (isMe || show) ? p.handResult : null,
                    seatIndex: p.seatIndex,
                    isVacant: !!p.isVacant
                };
            }),
            communityCards: state.communityCards.map(c => c.toJSON ? c.toJSON() : c),
            myPlayerId: rp.playerId
        };

        send(rp.ws, {
            type: MessageType.GAME_STATE,
            state: playerState
        });
    });
}

function broadcastMessage(room, text) {
    room.players.forEach(p => {
        send(p.ws, { type: MessageType.MESSAGE, text });
    });
}

function broadcastChatMessage(room, payload) {
    room.players.forEach((player) => {
        send(player.ws, {
            type: MessageType.CHAT_MESSAGE,
            playerId: payload.playerId,
            playerName: payload.playerName,
            text: payload.text
        });
    });
}

// ==================== 启动 ====================

server.listen(PORT, () => {
    console.log(`Texas Poker server running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser to play`);
});
