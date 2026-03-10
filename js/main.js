// ============================================================
// main.js - 应用入口
// ============================================================

(function () {
    const ui = new UI();
    let game = null;
    let network = null;
    let isOnlineMode = false;

    // ==================== 启动界面 ====================
    const setupScreen = document.getElementById('setup-screen');
    const roomScreen = document.getElementById('room-screen');
    const playModeBtns = document.querySelectorAll('.play-mode-btn');
    const modeBtns = document.querySelectorAll('.mode-btn');
    const startBtn = document.getElementById('start-btn');
    const playerCountSelect = document.getElementById('player-count');
    const startingChipsInput = document.getElementById('starting-chips');
    const smallBlindInput = document.getElementById('small-blind');
    const bigBlindInput = document.getElementById('big-blind');
    const playerNameInput = document.getElementById('player-name');
    const onlineNameGroup = document.getElementById('online-name-group');
    const onlineButtons = document.getElementById('online-buttons');
    const localSettings = document.getElementById('local-settings');
    const createRoomBtn = document.getElementById('create-room-btn');
    const joinRoomBtn = document.getElementById('join-room-btn');
    const roomIdInput = document.getElementById('room-id-input');

    // 房间界面
    const roomIdDisplay = document.getElementById('room-id-display');
    const roomSettingsInfo = document.getElementById('room-settings-info');
    const roomPlayersList = document.getElementById('room-players-list');
    const roomHostControls = document.getElementById('room-host-controls');
    const roomWaitMsg = document.getElementById('room-wait-msg');
    const roomStartBtn = document.getElementById('room-start-btn');
    const roomBackBtn = document.getElementById('room-back-btn');

    let selectedMode = GameMode.STANDARD;
    let selectedPlayMode = 'local';
    let isHost = false;

    // 游戏类型切换 (单机/联网)
    playModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            playModeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedPlayMode = btn.dataset.playMode;

            if (selectedPlayMode === 'online') {
                startBtn.style.display = 'none';
                onlineNameGroup.style.display = 'block';
                onlineButtons.style.display = 'block';
            } else {
                startBtn.style.display = 'block';
                onlineNameGroup.style.display = 'none';
                onlineButtons.style.display = 'none';
            }
        });
    });

    // 游戏模式切换 (标准/短牌)
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedMode = btn.dataset.mode;
        });
    });

    // 单机开始
    startBtn.addEventListener('click', () => {
        const settings = {
            gameMode: selectedMode,
            playerCount: parseInt(playerCountSelect.value),
            startingChips: parseInt(startingChipsInput.value) || 1000,
            smallBlind: parseInt(smallBlindInput.value) || 5,
            bigBlind: parseInt(bigBlindInput.value) || 10
        };

        if (settings.bigBlind <= settings.smallBlind) {
            settings.bigBlind = settings.smallBlind * 2;
        }

        isOnlineMode = false;
        startLocalGame(settings);
    });

    // ==================== 联网模式 ====================

    function getWsUrl() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${location.host}`;
    }

    function getSettings() {
        return {
            gameMode: selectedMode,
            playerCount: parseInt(playerCountSelect.value),
            startingChips: parseInt(startingChipsInput.value) || 1000,
            smallBlind: parseInt(smallBlindInput.value) || 10,
            bigBlind: parseInt(bigBlindInput.value) || 20
        };
    }

    function getPlayerName() {
        return (playerNameInput.value || '').trim() || '玩家';
    }

    // 创建房间
    createRoomBtn.addEventListener('click', async () => {
        const name = getPlayerName();
        const settings = getSettings();
        try {
            network = new Network();
            await network.connect(getWsUrl());
            bindNetworkEvents();
            network.createRoom(name, settings);
        } catch (e) {
            alert('连接服务器失败，请确认服务器已启动');
        }
    });

    // 加入房间
    joinRoomBtn.addEventListener('click', async () => {
        const name = getPlayerName();
        const roomId = (roomIdInput.value || '').trim();
        if (!roomId || roomId.length !== 4) {
            alert('请输入4位房间号');
            return;
        }
        try {
            network = new Network();
            await network.connect(getWsUrl());
            bindNetworkEvents();
            network.joinRoom(roomId, name);
        } catch (e) {
            alert('连接服务器失败，请确认服务器已启动');
        }
    });

    // 房间界面按钮
    roomStartBtn.addEventListener('click', () => {
        if (network) network.startGame();
    });

    roomBackBtn.addEventListener('click', () => {
        if (network) network.disconnect();
        network = null;
        isHost = false;
        showScreen('setup');
    });

    function bindNetworkEvents() {
        network.on('room_created', (msg) => {
            isHost = true;
            showRoomScreen(msg.roomId, msg.players, msg.settings, true);
        });

        network.on('room_joined', (msg) => {
            // 保留已有的 isHost 状态 (房主收到join更新时仍是host)
            showRoomScreen(msg.roomId, msg.players, msg.settings, isHost);
        });

        network.on('room_error', (msg) => {
            alert(msg.message);
        });

        network.on('game_state', (state) => {
            // 旋转玩家数组，让当前用户始终在 index 0 (屏幕正下方)
            const rotatedState = rotatePlayersToMe(state);

            if (!isOnlineMode) {
                isOnlineMode = true;
                ui.showGameScreen();
                ui.clearLog();
                ui.hideNextHandButton();
                ui.hideRestartButton();
                ui.network = network;
                // 初始化座位 (首次)
                ui.initPlayerSeats(rotatedState.players.map(p => ({
                    name: p.name,
                    chips: p.chips
                })));
            }
            // 将服务端state中的card JSON恢复为Card对象 (用于UI渲染)
            const uiState = restoreStateCards(rotatedState);
            ui.updateState(uiState);
        });

        network.on('your_turn', (msg) => {
            ui.showOnlineActionPanel(msg.actions);
        });

        network.on('message', (msg) => {
            ui.addLogMessage(msg.text);
        });

        network.on('hand_complete', () => {
            ui.showNextHandButton(() => {
                if (network) network.sendNextHand();
            });
        });

        network.on('game_over', (msg) => {
            ui.showWinnerOverlay(msg.winner);
            ui.showRestartButton(() => {
                isOnlineMode = false;
                if (network) network.disconnect();
                network = null;
                ui.network = null;
                showScreen('setup');
            });
        });

        network.on('disconnected', () => {
            // 可以在UI上显示连接断开提示
        });
    }

    function rotatePlayersToMe(state) {
        const myId = state.myPlayerId;
        const players = state.players;
        const myIndex = players.findIndex(p => p.playerId === myId);
        if (myIndex <= 0) return state; // 已在 index 0 或未找到

        const rotated = [...players.slice(myIndex), ...players.slice(0, myIndex)];
        const newState = { ...state, players: rotated };

        // 调整 currentPlayerIndex
        if (state.currentPlayerIndex >= 0) {
            newState.currentPlayerIndex = (state.currentPlayerIndex - myIndex + players.length) % players.length;
        }

        return newState;
    }

    function restoreStateCards(state) {
        // 将JSON card数据恢复为带有 symbol/color 等属性的对象
        const restored = { ...state };
        restored.communityCards = (state.communityCards || []).map(c => {
            if (!c) return null;
            return new Card(c.suit, c.rank);
        });
        restored.players = state.players.map(p => {
            const rp = { ...p };
            rp.holeCards = (p.holeCards || []).map(c => {
                if (!c) return null;
                return new Card(c.suit, c.rank);
            });
            // 恢复 isInHand getter 语义
            rp.isInHand = !p.isFolded && !p.isBusted;
            rp.isActive = !p.isFolded && !p.isBusted && !p.isAllIn;
            return rp;
        });
        return restored;
    }

    function showRoomScreen(roomId, players, settings, isHost) {
        showScreen('room');
        roomIdDisplay.textContent = roomId;

        const modeLabel = settings.gameMode === GameMode.SHORT_DECK ? '短牌德州' : '标准德州';
        roomSettingsInfo.innerHTML = `
            <div>${modeLabel} | ${settings.playerCount}人桌</div>
            <div>起始筹码: ${settings.startingChips} | 盲注: ${settings.smallBlind}/${settings.bigBlind}</div>
        `;

        updateRoomPlayers(players, settings.playerCount);

        if (isHost) {
            roomHostControls.style.display = 'block';
            roomWaitMsg.style.display = 'none';
        } else {
            roomHostControls.style.display = 'none';
            roomWaitMsg.style.display = 'block';
        }
    }

    function updateRoomPlayers(players, maxPlayers) {
        roomPlayersList.innerHTML = '';
        players.forEach((p, i) => {
            const div = document.createElement('div');
            div.className = 'room-player-item';
            div.textContent = `${i + 1}. ${p.playerName}` + (i === 0 ? ' (房主)' : '');
            roomPlayersList.appendChild(div);
        });
        // AI 填位提示
        const aiCount = maxPlayers - players.length;
        if (aiCount > 0) {
            const div = document.createElement('div');
            div.className = 'room-player-item ai-slot';
            div.textContent = `+ ${aiCount} 个AI将填补空位`;
            roomPlayersList.appendChild(div);
        }
    }

    function showScreen(name) {
        setupScreen.style.display = name === 'setup' ? 'flex' : 'none';
        roomScreen.style.display = name === 'room' ? 'flex' : 'none';
        document.getElementById('game-screen').style.display = name === 'game' ? 'block' : 'none';
    }

    // ==================== 单机游戏逻辑 ====================
    function startLocalGame(settings) {
        ui.showGameScreen();
        ui.clearLog();
        ui.hideNextHandButton();
        ui.hideRestartButton();
        ui.network = null;

        game = new Game(settings);
        ui.game = game;

        ui.initPlayerSeats(game.players);

        game.onStateChange = (state) => {
            ui.updateState(state);
        };

        game.onMessage = (msg) => {
            ui.addLogMessage(msg);
        };

        game.onHandComplete = () => {
            const human = game.players[0];
            if (human.isBusted) {
                ui.addLogMessage('你已出局!');
                ui.showRestartButton(() => {
                    showScreen('setup');
                });
                return;
            }

            ui.showNextHandButton(() => {
                game.startNewHand();
            });
        };

        game.onGameOver = (winner) => {
            ui.showWinnerOverlay(winner);
            ui.showRestartButton(() => {
                showScreen('setup');
            });
        };

        game.startNewHand();
    }

    // ==================== 键盘快捷键 ====================
    document.addEventListener('keydown', (e) => {
        // 联网模式下的快捷键
        if (isOnlineMode && network) {
            if (!ui._currentOnlineActions) return;
            const actions = ui._currentOnlineActions;
            switch (e.key) {
                case 'f':
                case 'F': {
                    const fold = actions.find(a => a.action === Action.FOLD);
                    if (fold) {
                        ui.hideActionPanel();
                        network.sendAction(Action.FOLD, 0);
                    }
                    break;
                }
                case 'c':
                case 'C': {
                    const check = actions.find(a => a.action === Action.CHECK);
                    const call = actions.find(a => a.action === Action.CALL);
                    if (check) {
                        ui.hideActionPanel();
                        network.sendAction(Action.CHECK, 0);
                    } else if (call) {
                        ui.hideActionPanel();
                        network.sendAction(Action.CALL, call.amount);
                    }
                    break;
                }
                case ' ':
                case 'Enter': {
                    const nextBtn = document.querySelector('.next-hand-btn:not(.hidden)');
                    if (nextBtn) { nextBtn.click(); e.preventDefault(); }
                    break;
                }
            }
            return;
        }

        // 单机模式快捷键
        if (!game) return;
        const actions = game.getAvailableActions();
        if (actions.length === 0) return;

        switch (e.key) {
            case 'f':
            case 'F': {
                const fold = actions.find(a => a.action === Action.FOLD);
                if (fold) {
                    ui.hideActionPanel();
                    game.submitHumanAction({ action: Action.FOLD, amount: 0 });
                }
                break;
            }
            case 'c':
            case 'C': {
                const call = actions.find(a => a.action === Action.CALL);
                const check = actions.find(a => a.action === Action.CHECK);
                if (check) {
                    ui.hideActionPanel();
                    game.submitHumanAction({ action: Action.CHECK, amount: 0 });
                } else if (call) {
                    ui.hideActionPanel();
                    game.submitHumanAction({ action: Action.CALL, amount: call.amount });
                }
                break;
            }
            case ' ':
            case 'Enter': {
                const nextBtn = document.querySelector('.next-hand-btn:not(.hidden)');
                if (nextBtn) {
                    nextBtn.click();
                    e.preventDefault();
                }
                break;
            }
        }
    });
})();
