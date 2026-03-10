// ============================================================
// player.js - 玩家类
// ============================================================

class Player {
    constructor(id, name, chips, isHuman = false) {
        this.id = id;
        this.name = name;
        this.chips = chips;
        this.isHuman = isHuman;
        this.playerId = null;      // 网络标识 (WebSocket 连接 ID)
        this.holeCards = [];
        this.currentBet = 0;       // 当前轮下注额
        this.totalBet = 0;         // 本手牌总下注额
        this.isFolded = false;
        this.isAllIn = false;
        this.isBusted = false;     // 筹码为0已出局
        this.isDealer = false;
        this.lastAction = null;
        this.handResult = null;    // 摊牌结果
        this.seatIndex = 0;
    }

    reset() {
        this.holeCards = [];
        this.currentBet = 0;
        this.totalBet = 0;
        this.isFolded = false;
        this.isAllIn = false;
        this.lastAction = null;
        this.handResult = null;
    }

    bet(amount) {
        const actual = Math.min(amount, this.chips);
        this.chips -= actual;
        this.currentBet += actual;
        this.totalBet += actual;
        if (this.chips === 0) {
            this.isAllIn = true;
        }
        return actual;
    }

    fold() {
        this.isFolded = true;
        this.lastAction = Action.FOLD;
    }

    get isActive() {
        return !this.isFolded && !this.isBusted && !this.isAllIn;
    }

    get isInHand() {
        return !this.isFolded && !this.isBusted;
    }

    toJSON(showCards = false) {
        return {
            id: this.id,
            name: this.name,
            chips: this.chips,
            isHuman: this.isHuman,
            playerId: this.playerId,
            holeCards: showCards ? this.holeCards.map(c => c.toJSON()) : this.holeCards.map(() => null),
            currentBet: this.currentBet,
            totalBet: this.totalBet,
            isFolded: this.isFolded,
            isAllIn: this.isAllIn,
            isBusted: this.isBusted,
            isDealer: this.isDealer,
            lastAction: this.lastAction,
            handResult: this.handResult,
            seatIndex: this.seatIndex
        };
    }
}

if (typeof module !== 'undefined') {
    module.exports = { Player };
}
