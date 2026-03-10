// ============================================================
// server.js - 德州扑克联网服务端
// ============================================================

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

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

// ==================== Express + HTTP ====================

const app = express();
app.use(express.static(path.join(__dirname)));

const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ==================== WebSocket ====================

const wss = new WebSocketServer({ server });

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
    wsPlayerMap.set(ws, { playerId, roomId: null, playerName: null });

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
        handleDisconnect(ws);
        wsPlayerMap.delete(ws);
    });
});

function send(ws, msg) {
    if (ws.readyState === 1) {
        ws.send(JSON.stringify(msg));
    }
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
        case MessageType.START_GAME:
            handleStartGame(ws);
            break;
        case MessageType.PLAYER_ACTION:
            handlePlayerAction(ws, msg);
            break;
        case MessageType.NEXT_HAND:
            handleNextHand(ws);
            break;
    }
}

function handleCreateRoom(ws, msg) {
    const playerName = (msg.playerName || '').trim() || '玩家';
    const info = wsPlayerMap.get(ws);
    info.playerName = playerName;

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
            ws: ws
        }],
        settings: settings,
        state: 'waiting',
        game: null
    };

    rooms.set(roomId, room);
    info.roomId = roomId;

    send(ws, {
        type: MessageType.ROOM_CREATED,
        roomId: roomId,
        settings: settings,
        players: room.players.map(p => ({ playerId: p.playerId, playerName: p.playerName }))
    });

    console.log(`Room ${roomId} created by ${playerName}`);
}

function handleJoinRoom(ws, msg) {
    const roomId = (msg.roomId || '').trim();
    const playerName = (msg.playerName || '').trim() || '玩家';
    const info = wsPlayerMap.get(ws);
    info.playerName = playerName;

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
        ws: ws
    });
    info.roomId = roomId;

    const playerList = room.players.map(p => ({ playerId: p.playerId, playerName: p.playerName }));

    // 通知所有人
    room.players.forEach(p => {
        send(p.ws, {
            type: MessageType.ROOM_JOINED,
            roomId: roomId,
            players: playerList,
            settings: room.settings
        });
    });

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
        const resolve = game._humanActionResolve;
        game._humanActionResolve = null;
        resolve({ action, amount });
    }
}

function handleNextHand(ws) {
    const info = wsPlayerMap.get(ws);
    const room = rooms.get(info.roomId);
    if (!room || !room.game) return;

    // 任何玩家都可以触发下一手
    if (room._nextHandPending) {
        room._nextHandPending = false;
        room.game.startNewHand();
    }
}

function handleDisconnect(ws) {
    const info = wsPlayerMap.get(ws);
    if (!info || !info.roomId) return;

    const room = rooms.get(info.roomId);
    if (!room) return;

    // 从房间中移除玩家
    room.players = room.players.filter(p => p.playerId !== info.playerId);

    if (room.players.length === 0) {
        rooms.delete(info.roomId);
        console.log(`Room ${info.roomId} deleted (empty)`);
        return;
    }

    // 如果游戏进行中，将断线玩家标记为AI接管
    if (room.game) {
        const gamePlayer = room.game.players.find(p => p.playerId === info.playerId);
        if (gamePlayer) {
            gamePlayer.isHuman = false;
            gamePlayer.playerId = null;
            broadcastMessage(room, `${gamePlayer.name} 断线，由AI接管`);

            // 如果当前轮到断线玩家，用AI决策
            if (room.game.currentPlayerIndex >= 0 &&
                room.game.players[room.game.currentPlayerIndex] === gamePlayer &&
                room.game._humanActionResolve) {
                const aiAction = AI.decide(gamePlayer, room.game.getState());
                const resolve = room.game._humanActionResolve;
                room.game._humanActionResolve = null;
                resolve(aiAction);
            }
        }
    }

    // 如果房主离开，转移房主
    if (room.hostPlayerId === info.playerId && room.players.length > 0) {
        room.hostPlayerId = room.players[0].playerId;
    }

    // 通知剩余玩家
    const playerList = room.players.map(p => ({ playerId: p.playerId, playerName: p.playerName }));
    room.players.forEach(p => {
        send(p.ws, {
            type: MessageType.ROOM_JOINED,
            roomId: room.id,
            players: playerList,
            settings: room.settings
        });
    });

    console.log(`Player ${info.playerName} disconnected from room ${info.roomId}`);
}

// ==================== 游戏逻辑 ====================

function startRoomGame(room) {
    const game = new Game(room.settings);

    // 覆盖 _initPlayers: 真人 + AI 填位
    game.players = [];

    // 添加真人玩家
    room.players.forEach((p, i) => {
        const player = new Player(i, p.playerName, room.settings.startingChips, true);
        player.playerId = p.playerId;
        player.seatIndex = i;
        game.players.push(player);
    });

    // AI 填位
    const aiStartIndex = room.players.length;
    for (let i = aiStartIndex; i < room.settings.playerCount; i++) {
        const aiPlayer = new Player(i, AI_NAMES[i - aiStartIndex] || `AI-${i}`, room.settings.startingChips, false);
        aiPlayer.seatIndex = i;
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

    game.onHandComplete = () => {
        room._nextHandPending = true;
        // 通知所有人
        room.players.forEach(p => {
            send(p.ws, { type: MessageType.HAND_COMPLETE });
        });
    };

    game.onGameOver = (winner) => {
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
    const originalWait = game._waitForHumanAction.bind(game);
    game._waitForHumanAction = (player) => {
        // 找到对应的ws连接
        const roomPlayer = room.players.find(p => p.playerId === player.playerId);
        if (!roomPlayer) {
            // 玩家断线，AI接管
            return Promise.resolve(AI.decide(player, game.getState()));
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
                    holeCards: (isMe || show) ? p.holeCards.map(c => c.toJSON ? c.toJSON() : c) : p.holeCards.map(() => null),
                    currentBet: p.currentBet,
                    totalBet: p.totalBet,
                    isFolded: p.isFolded,
                    isAllIn: p.isAllIn,
                    isBusted: p.isBusted,
                    isDealer: p.isDealer,
                    lastAction: p.lastAction,
                    handResult: (isMe || show) ? p.handResult : null,
                    seatIndex: p.seatIndex
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

// ==================== 启动 ====================

server.listen(PORT, () => {
    console.log(`Texas Poker server running at http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser to play`);
});
