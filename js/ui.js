// ============================================================
// ui.js - UI渲染和交互管理
// ============================================================

class UI {
    constructor() {
        this.tableArea = document.querySelector('.table-area');
        this.communityCardsEl = document.querySelector('.community-cards');
        this.potAmountEl = document.querySelector('.pot-amount');
        this.actionPanel = document.querySelector('.action-panel');
        this.logContent = document.querySelector('.log-content');
        this.nextHandBtn = document.querySelector('.next-hand-btn');
        this.restartBtn = document.querySelector('.restart-btn');
        this.infoPanel = document.querySelector('.info-panel');

        this.playerSeats = [];
        this.game = null;
        this.network = null;
        this._currentOnlineActions = null;

        // 倒计时
        this.timerInterval = null;
        this.timerSeconds = 30;
    }

    /**
     * 创建一张扑克牌的DOM
     */
    createCardElement(card, small = false, faceDown = false) {
        const el = document.createElement('div');
        el.className = `card ${small ? 'small' : ''} ${card ? card.color : ''} dealing`;

        if (faceDown || !card) {
            el.innerHTML = '<div class="card-back"></div>';
        } else {
            el.innerHTML = `
                <div class="card-front">
                    <span class="card-rank-top">${card.rank}</span>
                    <span class="card-suit-top">${card.symbol}</span>
                    <span class="card-suit-center">${card.symbol}</span>
                    <span class="card-rank-bottom">${card.rank}</span>
                    <span class="card-suit-bottom">${card.symbol}</span>
                </div>
            `;
        }

        return el;
    }

    /**
     * 初始化玩家座位
     */
    initPlayerSeats(players) {
        // 清除旧座位
        this.playerSeats.forEach(el => el.remove());
        this.playerSeats = [];

        players.forEach((player, index) => {
            const seat = document.createElement('div');
            seat.className = 'player-seat';
            seat.dataset.seat = index;
            seat.innerHTML = `
                <div class="player-info">
                    <div class="player-name">${player.name}</div>
                    <div class="player-chips">${player.chips}</div>
                    <div class="player-action"></div>
                </div>
                <div class="player-cards"></div>
                <div class="player-bet-chip" style="display:none;"></div>
            `;
            this.tableArea.appendChild(seat);
            this.playerSeats.push(seat);
        });
    }

    /**
     * 更新整个游戏状态
     */
    updateState(state) {
        this._lastState = state;
        this.updatePot(state.pot);
        this.updateCommunityCards(state.communityCards);
        this.updatePlayers(state);
        this.updateInfoPanel(state);

        // 单机模式: 操作面板由本地 game 控制
        if (!this.network) {
            if (state.currentPlayerIndex >= 0 &&
                state.players[state.currentPlayerIndex] &&
                state.players[state.currentPlayerIndex].isHuman) {
                this.showActionPanel(state);
            } else {
                this.hideActionPanel();
            }
        }
        // 联网模式: 操作面板由 your_turn 消息触发 (showOnlineActionPanel)
    }

    updatePot(pot) {
        this.potAmountEl.textContent = pot;
    }

    updateCommunityCards(cards) {
        const currentCount = this.communityCardsEl.children.length;
        // 新一手牌: 牌数减少，清空重来
        if (cards.length < currentCount) {
            this.communityCardsEl.innerHTML = '';
        }
        const existingCount = this.communityCardsEl.children.length;
        // 牌数没变化，不重建
        if (existingCount === cards.length) return;
        // 只追加新增的牌，保留已有的
        for (let i = existingCount; i < cards.length; i++) {
            const el = this.createCardElement(cards[i]);
            el.style.animationDelay = `${(i - existingCount) * 0.1}s`;
            this.communityCardsEl.appendChild(el);
        }
    }

    updatePlayers(state) {
        const isOnline = !!this.network;
        const myPlayerId = state.myPlayerId;

        state.players.forEach((player, index) => {
            const seat = this.playerSeats[index];
            if (!seat) return;

            // 状态类
            seat.classList.toggle('busted', player.isBusted);
            seat.classList.toggle('vacant', !!player.isVacant);
            seat.classList.toggle('active-turn', index === state.currentPlayerIndex);
            seat.classList.toggle('dealer', player.isDealer);

            // 信息
            const nameEl = seat.querySelector('.player-name');
            const chipsEl = seat.querySelector('.player-chips');
            const actionEl = seat.querySelector('.player-action');
            const cardsEl = seat.querySelector('.player-cards');
            const betChipEl = seat.querySelector('.player-bet-chip');

            if (player.isVacant) {
                nameEl.textContent = '空座';
                chipsEl.textContent = '';
                actionEl.textContent = '';
                actionEl.dataset.lastAction = '';
                cardsEl.dataset.cardKey = 'vacant';
                cardsEl.innerHTML = '';
                betChipEl.style.display = 'none';
                const resultEl = seat.querySelector('.player-hand-result');
                if (resultEl) resultEl.style.display = 'none';
                return;
            }

            nameEl.textContent = player.name;
            chipsEl.textContent = `${player.chips}`;

            // 上一个动作
            if (player.lastAction) {
                const prevAction = actionEl.dataset.lastAction || '';
                actionEl.textContent = player.lastAction;
                actionEl.className = 'player-action' + (player.isFolded ? ' fold' : '');

                // 动作变化时弹出气泡
                if (player.lastAction !== prevAction) {
                    actionEl.dataset.lastAction = player.lastAction;
                    // 移除旧气泡
                    const oldBubble = seat.querySelector('.action-bubble');
                    if (oldBubble) oldBubble.remove();
                    // 新气泡
                    const bubble = document.createElement('div');
                    bubble.className = 'action-bubble';
                    if (player.isFolded) bubble.classList.add('fold');
                    else if (player.lastAction.includes('加注') || player.lastAction.includes('全下')) bubble.classList.add('raise');
                    else if (player.lastAction.includes('跟注')) bubble.classList.add('call');
                    else if (player.lastAction.includes('过牌')) bubble.classList.add('check');
                    bubble.textContent = player.lastAction;
                    seat.appendChild(bubble);
                    setTimeout(() => bubble.remove(), 1800);
                }
            } else {
                actionEl.textContent = '';
                actionEl.dataset.lastAction = '';
            }

            // 手牌
            // 联网模式: 服务端已经处理了手牌可见性 (自己的牌有数据, 别人的为null)
            // 单机模式: 本地判断
            let showCards;
            if (isOnline) {
                // 有非null的牌数据就显示
                const hasCardData = player.holeCards && player.holeCards.length > 0 && player.holeCards[0] !== null;
                showCards = hasCardData;
            } else {
                showCards = player.isHuman ||
                    (state.phase === GamePhase.SHOWDOWN && player.isInHand);
            }

            const cardCount = (player.holeCards && !player.isBusted) ? player.holeCards.length : 0;
            const cardKey = cardCount > 0
                ? `${cardCount}-${showCards ? player.holeCards.map(c => c ? (c.rank + c.suit) : 'x').join(',') : 'hidden'}`
                : 'none';

            if (cardsEl.dataset.cardKey !== cardKey) {
                cardsEl.dataset.cardKey = cardKey;
                cardsEl.innerHTML = '';
                if (cardCount > 0) {
                    player.holeCards.forEach(card => {
                        const cardEl = this.createCardElement(
                            showCards ? card : null,
                            true,
                            !showCards
                        );
                        cardsEl.appendChild(cardEl);
                    });
                }
            }

            // 当前轮下注
            if (player.currentBet > 0) {
                betChipEl.style.display = 'block';
                betChipEl.textContent = player.currentBet;
            } else {
                betChipEl.style.display = 'none';
            }

            // 手牌结果
            let resultEl = seat.querySelector('.player-hand-result');
            if (state.phase === GamePhase.SHOWDOWN && player.handResult && player.isInHand) {
                if (!resultEl) {
                    resultEl = document.createElement('div');
                    resultEl.className = 'player-hand-result';
                    seat.querySelector('.player-info').appendChild(resultEl);
                }
                resultEl.textContent = player.handResult.rankName;
                resultEl.style.display = 'block';
            } else {
                if (resultEl) resultEl.style.display = 'none';
            }
        });
    }

    updateInfoPanel(state) {
        const modeLabel = state.gameMode === GameMode.SHORT_DECK ? '短牌德州' : '标准德州';
        this.infoPanel.innerHTML = `
            <div class="game-mode-label">${modeLabel}</div>
            <div class="hand-number">第 ${state.handNumber} 手</div>
            <div style="margin-top:4px; color:#888; font-size:12px;">
                盲注 ${state.smallBlind}/${state.bigBlind}
            </div>
        `;
    }

    /**
     * 显示操作面板 (单机模式)
     */
    showActionPanel(state) {
        if (!this.game) return;

        const actions = this.game.getAvailableActions();
        this._renderActionPanel(actions, state, (action) => {
            this.hideActionPanel();
            this.game.submitHumanAction(action);
        });
    }

    /**
     * 显示操作面板 (联网模式)
     */
    showOnlineActionPanel(actions) {
        this._currentOnlineActions = actions;
        // 从最近的game_state中获取大盲注和当前下注用于preset计算
        // 我们使用一个简单的默认state对象
        const state = this._lastState || { bigBlind: 20, currentBet: 0, pot: 0 };
        this._renderActionPanel(actions, state, (action) => {
            this._currentOnlineActions = null;
            this.hideActionPanel();
            this.network.sendAction(action.action, action.amount);
        });
    }

    /**
     * 通用操作面板渲染
     */
    _renderActionPanel(actions, state, onAction) {
        this.actionPanel.innerHTML = '';
        this.actionPanel.classList.remove('hidden');

        // 倒计时条
        this._clearTimer();
        const timerBar = document.createElement('div');
        timerBar.className = 'timer-bar';
        const timerFill = document.createElement('div');
        timerFill.className = 'timer-fill';
        const timerText = document.createElement('span');
        timerText.className = 'timer-text';
        timerBar.appendChild(timerFill);
        timerBar.appendChild(timerText);
        this.actionPanel.appendChild(timerBar);

        let remaining = this.timerSeconds;
        timerText.textContent = remaining;
        timerFill.style.width = '100%';

        this.timerInterval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                this._clearTimer();
                const check = actions.find(a => a.action === Action.CHECK);
                if (check) {
                    onAction({ action: Action.CHECK, amount: 0 });
                } else {
                    onAction({ action: Action.FOLD, amount: 0 });
                }
                return;
            }
            timerText.textContent = remaining;
            timerFill.style.width = `${(remaining / this.timerSeconds) * 100}%`;
            if (remaining <= 10) timerFill.classList.add('urgent');
        }, 1000);

        let raiseAction = null;

        actions.forEach(act => {
            if (act.action === Action.RAISE) {
                raiseAction = act;
                return;
            }

            const btn = document.createElement('button');
            btn.className = 'action-btn';

            switch (act.action) {
                case Action.FOLD:
                    btn.className += ' fold-btn';
                    btn.textContent = act.label;
                    break;
                case Action.CHECK:
                    btn.className += ' check-btn';
                    btn.textContent = act.label;
                    break;
                case Action.CALL:
                    btn.className += ' call-btn';
                    btn.textContent = act.label;
                    break;
                case Action.ALL_IN:
                    btn.className += ' allin-btn';
                    btn.textContent = act.label;
                    break;
            }

            btn.addEventListener('click', () => {
                onAction({
                    action: act.action,
                    amount: act.amount || 0
                });
            });

            this.actionPanel.appendChild(btn);
        });

        // 加注控件
        if (raiseAction) {
            const raiseControls = document.createElement('div');
            raiseControls.className = 'raise-controls';

            const presetRow = document.createElement('div');
            presetRow.className = 'raise-presets';

            const presets = [];
            const bb = state.bigBlind || 20;
            const currentBet = state.currentBet || 0;

            if (currentBet <= bb) {
                presets.push({ label: '2.5x', amount: Math.floor(bb * 2.5) });
                presets.push({ label: '3x', amount: bb * 3 });
                presets.push({ label: '4x', amount: bb * 4 });
            } else {
                presets.push({ label: '3Bet', amount: currentBet * 3 });
                presets.push({ label: '4Bet', amount: Math.floor(currentBet * 3.5) });
                presets.push({ label: '5Bet', amount: Math.min(currentBet * 5, raiseAction.max) });
            }
            presets.push({ label: 'Pot', amount: (state.pot || 0) + currentBet * 2 });

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.className = 'raise-slider';
            slider.min = raiseAction.min;
            slider.max = raiseAction.max;
            slider.value = raiseAction.min;
            slider.step = bb;

            const amountDisplay = document.createElement('span');
            amountDisplay.className = 'raise-amount-display';
            amountDisplay.textContent = raiseAction.min;

            slider.addEventListener('input', () => {
                amountDisplay.textContent = slider.value;
            });

            presets.forEach(p => {
                const clamped = Math.max(raiseAction.min, Math.min(p.amount, raiseAction.max));
                const btn = document.createElement('button');
                btn.className = 'action-btn preset-btn';
                btn.textContent = p.label;
                btn.addEventListener('click', () => {
                    slider.value = clamped;
                    amountDisplay.textContent = clamped;
                });
                presetRow.appendChild(btn);
            });

            const raiseBtn = document.createElement('button');
            raiseBtn.className = 'action-btn raise-btn';
            raiseBtn.textContent = '加注';

            raiseBtn.addEventListener('click', () => {
                onAction({
                    action: Action.RAISE,
                    amount: parseInt(slider.value)
                });
            });

            raiseControls.appendChild(presetRow);
            raiseControls.appendChild(slider);
            raiseControls.appendChild(amountDisplay);
            raiseControls.appendChild(raiseBtn);
            this.actionPanel.appendChild(raiseControls);
        }
    }

    hideActionPanel() {
        this._clearTimer();
        this._currentOnlineActions = null;
        this.actionPanel.classList.add('hidden');
    }

    _clearTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    /**
     * 添加日志消息
     */
    addLogMessage(msg) {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        if (msg.includes('赢得') || msg.includes('---')) {
            entry.className += ' highlight';
        }
        entry.textContent = msg;
        this.logContent.appendChild(entry);
        this.logContent.scrollTop = this.logContent.scrollHeight;
    }

    clearLog() {
        this.logContent.innerHTML = '';
    }

    showNextHandButton(callback) {
        this.nextHandBtn.classList.remove('hidden');
        this.nextHandBtn.onclick = () => {
            this.nextHandBtn.classList.add('hidden');
            callback();
        };
    }

    hideNextHandButton() {
        this.nextHandBtn.classList.add('hidden');
    }

    showRestartButton(callback) {
        this.restartBtn.classList.remove('hidden');
        this.restartBtn.onclick = () => {
            this.restartBtn.classList.add('hidden');
            callback();
        };
    }

    hideRestartButton() {
        this.restartBtn.classList.add('hidden');
    }

    showWinnerOverlay(winner) {
        const overlay = document.createElement('div');
        overlay.className = 'winner-overlay';
        overlay.innerHTML = `
            <div class="winner-content">
                <h2>${winner ? winner.name + ' 获胜!' : '游戏结束'}</h2>
                <p>${winner ? `最终筹码: ${winner.chips}` : ''}</p>
            </div>
        `;
        document.body.appendChild(overlay);

        overlay.addEventListener('click', () => {
            overlay.remove();
        });

        setTimeout(() => overlay.remove(), 5000);
    }

    /**
     * 切换界面
     */
    showSetupScreen() {
        document.getElementById('setup-screen').style.display = 'flex';
        document.getElementById('room-screen').style.display = 'none';
        document.getElementById('game-screen').style.display = 'none';
    }

    showGameScreen() {
        document.getElementById('setup-screen').style.display = 'none';
        document.getElementById('room-screen').style.display = 'none';
        document.getElementById('game-screen').style.display = 'block';
        const badge = document.getElementById('user-badge');
        if (badge) badge.style.display = 'none';
    }
}
