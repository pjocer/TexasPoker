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
        this.isVacant = false;     // 真人离桌后留下的空座
        this.pendingLeave = false; // 当前手结束后真正清空座位
        this.characterId = null;
        this.avatarType = 'preset';
        this.avatarData = null;
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

    markVacant() {
        this.name = '空座';
        this.chips = 0;
        this.isHuman = false;
        this.playerId = null;
        this.holeCards = [];
        this.currentBet = 0;
        this.totalBet = 0;
        this.isFolded = true;
        this.isAllIn = false;
        this.isBusted = true;
        this.isDealer = false;
        this.lastAction = null;
        this.handResult = null;
        this.isVacant = true;
        this.pendingLeave = false;
        this.characterId = null;
        this.avatarType = 'preset';
        this.avatarData = null;
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
            seatIndex: this.seatIndex,
            isVacant: this.isVacant,
            characterId: this.characterId,
            avatarType: this.avatarType,
            avatarData: this.avatarData
        };
    }
}

if (typeof module !== 'undefined') {
    module.exports = { Player };
}
