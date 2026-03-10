// ============================================================
// main.js - 应用入口
// ============================================================

(function () {
    const ui = new UI();
    let game = null;

    // ==================== 启动界面 ====================
    const setupScreen = document.getElementById('setup-screen');
    const modeBtns = document.querySelectorAll('.mode-btn');
    const startBtn = document.getElementById('start-btn');
    const playerCountSelect = document.getElementById('player-count');
    const startingChipsInput = document.getElementById('starting-chips');
    const smallBlindInput = document.getElementById('small-blind');
    const bigBlindInput = document.getElementById('big-blind');

    let selectedMode = GameMode.STANDARD;

    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedMode = btn.dataset.mode;
        });
    });

    startBtn.addEventListener('click', () => {
        const settings = {
            gameMode: selectedMode,
            playerCount: parseInt(playerCountSelect.value),
            startingChips: parseInt(startingChipsInput.value) || 1000,
            smallBlind: parseInt(smallBlindInput.value) || 5,
            bigBlind: parseInt(bigBlindInput.value) || 10
        };

        // 验证
        if (settings.bigBlind <= settings.smallBlind) {
            settings.bigBlind = settings.smallBlind * 2;
        }

        startGame(settings);
    });

    // ==================== 游戏逻辑 ====================
    function startGame(settings) {
        ui.showGameScreen();
        ui.clearLog();
        ui.hideNextHandButton();
        ui.hideRestartButton();

        game = new Game(settings);
        ui.game = game;

        // 初始化玩家座位
        ui.initPlayerSeats(game.players);

        // 绑定回调
        game.onStateChange = (state) => {
            ui.updateState(state);
        };

        game.onMessage = (msg) => {
            ui.addLogMessage(msg);
        };

        game.onHandComplete = () => {
            // 检查人类玩家是否出局
            const human = game.players[0];
            if (human.isBusted) {
                ui.addLogMessage('你已出局!');
                ui.showRestartButton(() => {
                    ui.showSetupScreen();
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
                ui.showSetupScreen();
            });
        };

        // 开始第一手
        game.startNewHand();
    }

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
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
                // 下一手按钮
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
