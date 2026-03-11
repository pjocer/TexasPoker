// ============================================================
// game.js - 游戏核心逻辑
// ============================================================

class Game {
    constructor(settings = {}) {
        this.settings = { ...DEFAULT_SETTINGS, ...settings };
        this.gameMode = this.settings.gameMode;
        this.players = [];
        this.deck = new Deck(this.gameMode);
        this.communityCards = [];
        this.pot = 0;
        this.sidePots = [];
        this.currentBet = 0;
        this.minRaise = this.settings.bigBlind;
        this.dealerIndex = 0;
        this.currentPlayerIndex = -1;
        this.phase = GamePhase.WAITING;
        this.handNumber = 0;
        this.actionHistory = [];
        this.lastRaiserIndex = -1;
        this.preflopAggressorIndex = -1;
        this.lastHandSummary = null;
        this._handPayoutSummary = this._createEmptyHandSummary();

        // 回调函数
        this.onStateChange = null;
        this.onPlayerAction = null;
        this.onHandComplete = null;
        this.onGameOver = null;
        this.onMessage = null;

        this._initPlayers();
    }

    _createEmptyHandSummary() {
        return {
            totalPot: 0,
            winners: new Map()
        };
    }

    _resetHandSummary() {
        this.lastHandSummary = null;
        this._handPayoutSummary = this._createEmptyHandSummary();
    }

    _recordHandPayout(winners, potAmount) {
        if (!Array.isArray(winners) || winners.length === 0 || potAmount <= 0) return;

        this._handPayoutSummary.totalPot += potAmount;
        winners.forEach((player) => {
            if (!player) return;
            const key = player.playerId || `seat:${player.seatIndex}:${player.id}`;
            if (!this._handPayoutSummary.winners.has(key)) {
                this._handPayoutSummary.winners.set(key, player.name);
            }
        });
    }

    _finalizeHandSummary() {
        const winnerNames = Array.from(this._handPayoutSummary.winners.values());
        this.lastHandSummary = {
            winnerNames,
            totalPot: this._handPayoutSummary.totalPot
        };
    }

    getLastHandSummary() {
        if (!this.lastHandSummary) return null;
        return {
            winnerNames: [...this.lastHandSummary.winnerNames],
            totalPot: this.lastHandSummary.totalPot
        };
    }

    _initPlayers() {
        // 创建人类玩家
        this.players.push(new Player(0, '你', this.settings.startingChips, true));

        // 创建AI玩家
        for (let i = 1; i < this.settings.playerCount; i++) {
            this.players.push(new Player(i, AI_NAMES[i - 1], this.settings.startingChips, false));
        }

        // 设置座位索引
        this.players.forEach((p, i) => p.seatIndex = i);
    }

    /**
     * 获取当前游戏状态
     */
    getState() {
        return {
            players: this.players,
            communityCards: this.communityCards,
            pot: this.pot,
            sidePots: this.sidePots,
            currentBet: this.currentBet,
            minRaise: this.minRaise,
            dealerIndex: this.dealerIndex,
            currentPlayerIndex: this.currentPlayerIndex,
            phase: this.phase,
            handNumber: this.handNumber,
            gameMode: this.gameMode,
            bigBlind: this.settings.bigBlind,
            smallBlind: this.settings.smallBlind,
            preflopAggressorIndex: this.preflopAggressorIndex
        };
    }

    /**
     * 获取存活(有筹码)的玩家
     */
    getActivePlayers() {
        return this.players.filter(p => !p.isBusted);
    }

    /**
     * 获取本手牌还在场上的玩家
     */
    getPlayersInHand() {
        return this.players.filter(p => p.isInHand);
    }

    /**
     * 获取还能行动的玩家 (未弃牌, 未全下, 未出局)
     */
    getActionablePlayers() {
        return this.players.filter(p => p.isActive);
    }

    finalizePendingLeaves() {
        this.players.forEach((player) => {
            if (player.pendingLeave) {
                player.markVacant();
            }
        });
    }

    /**
     * 开始新一手牌
     */
    async startNewHand() {
        this.finalizePendingLeaves();
        this._resetHandSummary();

        const activeBeforeHand = this.getActivePlayers();
        if (activeBeforeHand.length <= 1) {
            if (activeBeforeHand.length === 1) {
                this._emitMessage(`🎉 ${activeBeforeHand[0].name} 赢得了整场比赛!`);
            }
            if (this.onGameOver) {
                this.onGameOver(activeBeforeHand[0] || null);
            }
            return;
        }

        this.handNumber++;

        // 重置
        this.communityCards = [];
        this.pot = 0;
        this.sidePots = [];
        this.currentBet = 0;
        this.minRaise = this.settings.bigBlind;
        this.actionHistory = [];
        this.lastRaiserIndex = -1;
        this.preflopAggressorIndex = -1;

        // 重置玩家状态
        this.players.forEach(p => {
            if (!p.isBusted) p.reset();
        });

        // 移动庄家按钮
        this._moveDealer();

        // 发牌
        this.deck.reset();
        this._dealHoleCards();

        // 强制下注 (盲注)
        this._postBlinds();

        this.phase = GamePhase.PRE_FLOP;
        this._emitStateChange();
        this._emitMessage(`--- 第 ${this.handNumber} 手 ---`);

        // 开始Pre-flop投注
        await this._startBettingRound();
    }

    _moveDealer() {
        const active = this.getActivePlayers();
        if (active.length < 2) return;

        this.players.forEach(p => p.isDealer = false);

        let next = (this.dealerIndex + 1) % this.players.length;
        while (this.players[next].isBusted) {
            next = (next + 1) % this.players.length;
        }
        this.dealerIndex = next;
        this.players[next].isDealer = true;
    }

    _dealHoleCards() {
        const activePlayers = this.getActivePlayers();
        // 发两轮牌
        for (let round = 0; round < 2; round++) {
            for (const player of activePlayers) {
                player.holeCards.push(this.deck.deal());
            }
        }
    }

    _postBlinds() {
        const active = this.getActivePlayers();
        if (active.length < 2) return;

        let sbIndex = this._getNextActiveIndex(this.dealerIndex);
        let bbIndex = this._getNextActiveIndex(sbIndex);

        // 2人对战时庄家是小盲
        if (active.length === 2) {
            sbIndex = this.dealerIndex;
            bbIndex = this._getNextActiveIndex(this.dealerIndex);
        }

        const sbPlayer = this.players[sbIndex];
        const bbPlayer = this.players[bbIndex];

        const sbAmount = sbPlayer.bet(this.settings.smallBlind);
        const bbAmount = bbPlayer.bet(this.settings.bigBlind);

        this.pot += sbAmount + bbAmount;
        this.currentBet = this.settings.bigBlind;

        sbPlayer.lastAction = `小盲 ${sbAmount}`;
        bbPlayer.lastAction = `大盲 ${bbAmount}`;

        this._emitMessage(`${sbPlayer.name} 下小盲 ${sbAmount}`);
        this._emitMessage(`${bbPlayer.name} 下大盲 ${bbAmount}`);
    }

    _getNextActiveIndex(fromIndex) {
        let index = (fromIndex + 1) % this.players.length;
        while (this.players[index].isBusted) {
            index = (index + 1) % this.players.length;
        }
        return index;
    }

    /**
     * 开始一轮投注
     */
    async _startBettingRound() {
        const active = this.getActivePlayers();
        if (active.length < 2) return;

        let startIndex;
        if (this.phase === GamePhase.PRE_FLOP) {
            // Pre-flop从大盲下家开始
            let sbIndex = this._getNextActiveIndex(this.dealerIndex);
            let bbIndex = this._getNextActiveIndex(sbIndex);
            if (active.length === 2) {
                sbIndex = this.dealerIndex;
                bbIndex = this._getNextActiveIndex(this.dealerIndex);
            }
            startIndex = this._getNextActiveIndex(bbIndex);
        } else {
            // Post-flop从庄家下家开始
            startIndex = this._getNextActiveIndex(this.dealerIndex);
        }

        // 追踪谁已经行动过 (且下注额匹配当前最高下注)
        const acted = new Set();
        this.lastRaiserIndex = -1;
        this.currentPlayerIndex = startIndex;

        // 防止无限循环的安全计数器
        let maxIterations = this.players.length * 10;

        while (maxIterations-- > 0) {
            // 检查是否只剩一个未弃牌的人
            const playersInHand = this.getPlayersInHand();
            if (playersInHand.length <= 1) break;

            // 检查可行动玩家
            const actionablePlayers = this.getActionablePlayers();
            if (actionablePlayers.length === 0) break;

            const player = this.players[this.currentPlayerIndex];

            // 跳过不能行动的玩家
            if (player.isBusted || player.isFolded || player.isAllIn) {
                this.currentPlayerIndex = this._getNextActiveIndex(this.currentPlayerIndex);
                continue;
            }

            // 检查此玩家是否已行动且下注额已匹配
            if (acted.has(this.currentPlayerIndex) && player.currentBet === this.currentBet) {
                break;
            }

            // 只剩一个可行动的人且已匹配下注
            if (actionablePlayers.length === 1 &&
                actionablePlayers[0].currentBet === this.currentBet &&
                acted.has(this.players.indexOf(actionablePlayers[0]))) {
                break;
            }

            this._emitStateChange();

            let action;
            if (player.isHuman) {
                action = await this._waitForHumanAction(player);
            } else {
                await this._delay(600 + Math.random() * 800);
                action = AI.decide(player, this.getState());
            }

            const betBefore = this.currentBet;
            this._processAction(player, action);

            // 如果有人加注了（当前最高下注增加），清除之前的行动记录
            if (this.currentBet > betBefore) {
                acted.clear();
            }

            acted.add(this.currentPlayerIndex);

            this.currentPlayerIndex = this._getNextActiveIndex(this.currentPlayerIndex);
        }

        this.currentPlayerIndex = -1;

        // 重置每轮下注
        this.players.forEach(p => p.currentBet = 0);
        this.currentBet = 0;
        this.minRaise = this.settings.bigBlind;

        // 检查是否只剩一人
        const playersInHand = this.getPlayersInHand();
        if (playersInHand.length <= 1) {
            if (playersInHand.length === 1 && this.pot > 0) {
                const potAmount = this.pot;
                playersInHand[0].chips += potAmount;
                this._recordHandPayout([playersInHand[0]], potAmount);
                this._emitMessage(`${playersInHand[0].name} 赢得 ${potAmount} 筹码!`);
                this.pot = 0;
            }
            await this._endHand();
            return;
        }

        // 进入下一阶段
        await this._nextPhase();
    }

    _processAction(player, action) {
        const toCall = this.currentBet - player.currentBet;

        switch (action.action) {
            case Action.FOLD:
                player.fold();
                player.lastAction = '弃牌';
                this._emitMessage(`${player.name} 弃牌`);
                break;

            case Action.CHECK:
                player.lastAction = '过牌';
                this._emitMessage(`${player.name} 过牌`);
                break;

            case Action.CALL: {
                const callAmount = player.bet(toCall);
                this.pot += callAmount;
                player.lastAction = `跟注 ${callAmount}`;
                this._emitMessage(`${player.name} 跟注 ${callAmount}`);
                break;
            }

            case Action.RAISE: {
                let raiseAmount = action.amount;
                // 确保加注金额合法
                const totalNeeded = raiseAmount;
                if (totalNeeded >= player.chips + player.currentBet) {
                    // All-in
                    const allInAmount = player.bet(player.chips);
                    this.pot += allInAmount;
                    if (player.currentBet > this.currentBet) {
                        this.minRaise = Math.max(this.minRaise, player.currentBet - this.currentBet);
                        this.currentBet = player.currentBet;
                    }
                    player.lastAction = `全下 ${allInAmount}`;
                    this._emitMessage(`${player.name} 全下! ${allInAmount}`);
                } else {
                    // 保证加注额至少是minRaise
                    const actualRaise = Math.max(raiseAmount, this.currentBet + this.minRaise);
                    const needed = actualRaise - player.currentBet;
                    const betAmount = player.bet(needed);
                    this.pot += betAmount;
                    this.minRaise = player.currentBet - this.currentBet;
                    this.currentBet = player.currentBet;
                    this.lastRaiserIndex = this.players.indexOf(player);
                    if (this.phase === GamePhase.PRE_FLOP) {
                        this.preflopAggressorIndex = this.lastRaiserIndex;
                    }
                    player.lastAction = `加注到 ${player.currentBet}`;
                    this._emitMessage(`${player.name} 加注到 ${player.currentBet}`);
                }
                break;
            }

            case Action.ALL_IN: {
                const allInAmount = player.bet(player.chips);
                this.pot += allInAmount;
                if (player.currentBet > this.currentBet) {
                    this.minRaise = Math.max(this.minRaise, player.currentBet - this.currentBet);
                    this.currentBet = player.currentBet;
                    this.lastRaiserIndex = this.players.indexOf(player);
                }
                player.lastAction = `全下 ${allInAmount}`;
                this._emitMessage(`${player.name} 全下! ${allInAmount}`);
                break;
            }
        }

        if (this.onPlayerAction) {
            this.onPlayerAction(player, action);
        }
    }

    async _nextPhase() {
        switch (this.phase) {
            case GamePhase.PRE_FLOP:
                this.phase = GamePhase.FLOP;
                this._dealCommunity(3);
                this._emitMessage(`--- 翻牌 ---`);
                break;
            case GamePhase.FLOP:
                this.phase = GamePhase.TURN;
                this._dealCommunity(1);
                this._emitMessage(`--- 转牌 ---`);
                break;
            case GamePhase.TURN:
                this.phase = GamePhase.RIVER;
                this._dealCommunity(1);
                this._emitMessage(`--- 河牌 ---`);
                break;
            case GamePhase.RIVER:
                this.phase = GamePhase.SHOWDOWN;
                await this._showdown();
                return;
        }

        this._emitStateChange();
        await this._delay(800);
        await this._startBettingRound();
    }

    _dealCommunity(count) {
        // 烧一张牌
        this.deck.deal();
        for (let i = 0; i < count; i++) {
            this.communityCards.push(this.deck.deal());
        }
    }

    async _showdown() {
        this._emitMessage(`--- 摊牌 ---`);

        const playersInHand = this.getPlayersInHand();

        // 评估每个玩家的手牌
        for (const player of playersInHand) {
            const allCards = [...player.holeCards, ...this.communityCards];
            player.handResult = HandEvaluator.evaluate(allCards, this.gameMode);
        }

        this._emitStateChange();
        await this._delay(1500);

        // 分配奖池
        this._distributePots(playersInHand);

        await this._endHand();
    }

    _distributePots(playersInHand) {
        // 收集所有下注信息
        const bets = this.players
            .filter(p => !p.isBusted)
            .map(p => ({ player: p, totalBet: p.totalBet, inHand: p.isInHand }));

        // 收集所有唯一的下注额
        const allInAmounts = [...new Set(
            bets.filter(b => b.player.isAllIn || b.inHand).map(b => b.totalBet)
        )].sort((a, b) => a - b);

        if (allInAmounts.length <= 1) {
            // 简单情况: 无side pot
            this._awardPot(this.pot, playersInHand);
            return;
        }

        // 计算side pots
        let previousLevel = 0;
        let remainingPot = this.pot;

        for (const level of allInAmounts) {
            const contribution = level - previousLevel;
            let potAmount = 0;
            const eligible = [];

            for (const b of bets) {
                if (b.totalBet >= level) {
                    potAmount += contribution;
                    if (b.inHand) {
                        eligible.push(b.player);
                    }
                } else if (b.totalBet > previousLevel) {
                    potAmount += b.totalBet - previousLevel;
                    if (b.inHand) {
                        eligible.push(b.player);
                    }
                }
            }

            if (potAmount > 0 && eligible.length > 0) {
                this._awardPot(potAmount, eligible);
                remainingPot -= potAmount;
            }

            previousLevel = level;
        }

        // 分配剩余的底池
        if (remainingPot > 0) {
            this._awardPot(remainingPot, playersInHand.filter(p => p.isActive || p.isAllIn));
        }
    }

    _awardPot(potAmount, eligiblePlayers) {
        if (eligiblePlayers.length === 0) return;

        if (eligiblePlayers.length === 1) {
            eligiblePlayers[0].chips += potAmount;
            this._recordHandPayout([eligiblePlayers[0]], potAmount);
            this._emitMessage(`${eligiblePlayers[0].name} 赢得 ${potAmount} 筹码!`);
            return;
        }

        // 找出最佳手牌
        let bestScore = null;
        let winners = [];

        for (const player of eligiblePlayers) {
            if (!player.handResult) continue;

            if (!bestScore) {
                bestScore = player.handResult.score;
                winners = [player];
            } else {
                const cmp = HandEvaluator.compareScores(player.handResult.score, bestScore);
                if (cmp > 0) {
                    bestScore = player.handResult.score;
                    winners = [player];
                } else if (cmp === 0) {
                    winners.push(player);
                }
            }
        }

        // 平分底池
        const share = Math.floor(potAmount / winners.length);
        const remainder = potAmount - share * winners.length;

        for (let i = 0; i < winners.length; i++) {
            winners[i].chips += share + (i === 0 ? remainder : 0);
        }
        this._recordHandPayout(winners, potAmount);

        if (winners.length === 1) {
            const w = winners[0];
            this._emitMessage(`${w.name} 以 ${w.handResult.rankName} 赢得 ${potAmount} 筹码!`);
        } else {
            const names = winners.map(w => w.name).join(', ');
            this._emitMessage(`${names} 平分 ${potAmount} 筹码 (${winners[0].handResult.rankName})`);
        }
    }

    async _endHand() {
        this.phase = GamePhase.SHOWDOWN;
        this._emitStateChange();

        // 淘汰筹码为0的玩家
        this.players.forEach(p => {
            if (p.chips <= 0 && !p.isBusted) {
                p.isBusted = true;
                this._emitMessage(`${p.name} 已淘汰!`);
            }
        });

        this.finalizePendingLeaves();
        this._finalizeHandSummary();
        this._emitStateChange();

        await this._delay(2500);

        // 检查游戏是否结束
        const activePlayers = this.getActivePlayers();
        if (activePlayers.length <= 1) {
            if (activePlayers.length === 1) {
                this._emitMessage(`🎉 ${activePlayers[0].name} 赢得了整场比赛!`);
            }
            if (this.onGameOver) {
                this.onGameOver(activePlayers[0] || null);
            }
            return;
        }

        if (this.onHandComplete) {
            this.onHandComplete(this.getLastHandSummary());
        }
    }

    /**
     * 等待人类玩家操作
     */
    _waitForHumanAction(player) {
        return new Promise((resolve) => {
            this._humanActionResolve = resolve;
            this._emitStateChange();
        });
    }

    /**
     * 人类玩家提交操作
     */
    submitHumanAction(action) {
        if (this._humanActionResolve) {
            const resolve = this._humanActionResolve;
            this._humanActionResolve = null;
            resolve(action);
        }
    }

    /**
     * 获取人类玩家可用的操作
     */
    getAvailableActions() {
        const player = this.players[this.currentPlayerIndex];
        if (!player || !player.isHuman) return [];

        const toCall = this.currentBet - player.currentBet;
        const actions = [];

        // 弃牌 (如果需要跟注)
        if (toCall > 0) {
            actions.push({ action: Action.FOLD, label: '弃牌' });
        }

        // 过牌 (如果不需要跟注)
        if (toCall === 0) {
            actions.push({ action: Action.CHECK, label: '过牌' });
        }

        // 跟注
        if (toCall > 0 && toCall < player.chips) {
            actions.push({ action: Action.CALL, label: `跟注 ${toCall}`, amount: toCall });
        }

        // 加注
        const minRaiseTotal = this.currentBet + this.minRaise;
        if (player.chips + player.currentBet > minRaiseTotal) {
            actions.push({
                action: Action.RAISE,
                label: '加注',
                min: minRaiseTotal,
                max: player.chips + player.currentBet
            });
        }

        // 全下
        if (player.chips > 0) {
            actions.push({ action: Action.ALL_IN, label: `全下 ${player.chips}`, amount: player.chips });
        }

        return actions;
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _emitStateChange() {
        if (this.onStateChange) {
            this.onStateChange(this.getState());
        }
    }

    _emitMessage(msg) {
        if (this.onMessage) {
            this.onMessage(msg);
        }
    }
}

if (typeof module !== 'undefined') {
    module.exports = { Game };
}
