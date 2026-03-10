// ============================================================
// deck.js - 牌组管理
// ============================================================

class Deck {
    constructor(gameMode) {
        this.gameMode = gameMode;
        this.cards = [];
        this.build();
    }

    build() {
        this.cards = [];
        const ranks = this.gameMode === GameMode.SHORT_DECK ? RANKS_SHORT : RANKS_STANDARD;
        for (const suit of SUITS) {
            for (const rank of ranks) {
                this.cards.push(new Card(suit, rank));
            }
        }
    }

    shuffle() {
        // Fisher-Yates 洗牌算法
        for (let i = this.cards.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
        }
    }

    deal() {
        if (this.cards.length === 0) {
            throw new Error('牌组已空');
        }
        return this.cards.pop();
    }

    reset() {
        this.build();
        this.shuffle();
    }

    get remaining() {
        return this.cards.length;
    }
}
