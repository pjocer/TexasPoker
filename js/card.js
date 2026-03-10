// ============================================================
// card.js - 扑克牌类
// ============================================================

class Card {
    constructor(suit, rank) {
        this.suit = suit;
        this.rank = rank;
        this.value = RANK_VALUES[rank];
    }

    get symbol() {
        return SUIT_SYMBOLS[this.suit];
    }

    get color() {
        return SUIT_COLORS[this.suit];
    }

    toString() {
        return `${this.rank}${this.symbol}`;
    }

    equals(other) {
        return this.suit === other.suit && this.rank === other.rank;
    }
}
