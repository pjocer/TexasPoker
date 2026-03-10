// ============================================================
// player.js - 玩家类
// ============================================================

class Player {
    constructor(id, name, chips, isHuman = false) {
        this.id = id;
        this.name = name;
        this.chips = chips;
        this.isHuman = isHuman;
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
}
