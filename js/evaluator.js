// ============================================================
// evaluator.js - 手牌评估器
// ============================================================

class HandEvaluator {
    /**
     * 从7张牌中找出最佳5张牌组合
     * @param {Card[]} cards - 7张牌 (2手牌 + 5公共牌)
     * @param {string} gameMode - 游戏模式
     * @returns {{ rank: number, rankName: string, score: number[], bestHand: Card[] }}
     */
    static evaluate(cards, gameMode = GameMode.STANDARD) {
        const combos = HandEvaluator.combinations(cards, 5);
        let bestResult = null;

        for (const combo of combos) {
            const result = HandEvaluator.evaluateFive(combo, gameMode);
            if (!bestResult || HandEvaluator.compareScores(result.score, bestResult.score) > 0) {
                bestResult = result;
                bestResult.bestHand = [...combo];
            }
        }

        return bestResult;
    }

    /**
     * 评估5张牌的牌型
     */
    static evaluateFive(cards, gameMode) {
        const values = cards.map(c => c.value).sort((a, b) => b - a);
        const suits = cards.map(c => c.suit);

        const isFlush = suits.every(s => s === suits[0]);
        const isStraight = HandEvaluator.checkStraight(values, gameMode);

        // 统计每个面值出现的次数
        const counts = {};
        for (const v of values) {
            counts[v] = (counts[v] || 0) + 1;
        }

        const countEntries = Object.entries(counts)
            .map(([v, c]) => ({ value: parseInt(v), count: c }))
            .sort((a, b) => b.count - a.count || b.value - a.value);

        const isShortDeck = gameMode === GameMode.SHORT_DECK;
        const rankMap = isShortDeck ? HandRankShortDeck : HandRank;
        const nameMap = isShortDeck ? HAND_RANK_NAMES_SHORT : HAND_RANK_NAMES;

        let rank, score;

        // 获取顺子的最高牌值
        const straightHigh = isStraight ? HandEvaluator.getStraightHigh(values, gameMode) : 0;

        if (isFlush && isStraight) {
            if (straightHigh === 14) {
                rank = rankMap.ROYAL_FLUSH;
                score = [rank, 14];
            } else {
                rank = rankMap.STRAIGHT_FLUSH;
                score = [rank, straightHigh];
            }
        } else if (countEntries[0].count === 4) {
            rank = rankMap.FOUR_OF_A_KIND;
            const quad = countEntries[0].value;
            const kicker = countEntries[1].value;
            score = [rank, quad, kicker];
        } else if (isShortDeck && isFlush && countEntries[0].count === 3 && countEntries[1].count === 2) {
            // 短牌德州: Flush > Full House, 同时是同花和葫芦时算同花
            rank = rankMap.FLUSH;
            score = [rank, ...values];
        } else if (isShortDeck && isFlush) {
            // 短牌德州: Flush > Full House
            rank = rankMap.FLUSH;
            score = [rank, ...values];
        } else if (countEntries[0].count === 3 && countEntries[1].count === 2) {
            rank = rankMap.FULL_HOUSE;
            score = [rank, countEntries[0].value, countEntries[1].value];
        } else if (isFlush) {
            rank = rankMap.FLUSH;
            score = [rank, ...values];
        } else if (isShortDeck && countEntries[0].count === 3 && isStraight) {
            // 短牌德州: Three of a Kind > Straight
            rank = rankMap.THREE_OF_A_KIND;
            const trips = countEntries[0].value;
            const kickers = countEntries.filter(e => e.count === 1).map(e => e.value).sort((a, b) => b - a);
            score = [rank, trips, ...kickers];
        } else if (isStraight) {
            rank = rankMap.STRAIGHT;
            score = [rank, straightHigh];
        } else if (countEntries[0].count === 3) {
            rank = rankMap.THREE_OF_A_KIND;
            const trips = countEntries[0].value;
            const kickers = countEntries.filter(e => e.count === 1).map(e => e.value).sort((a, b) => b - a);
            score = [rank, trips, ...kickers];
        } else if (countEntries[0].count === 2 && countEntries[1].count === 2) {
            rank = rankMap.TWO_PAIR;
            const pairs = [countEntries[0].value, countEntries[1].value].sort((a, b) => b - a);
            const kicker = countEntries[2].value;
            score = [rank, ...pairs, kicker];
        } else if (countEntries[0].count === 2) {
            rank = rankMap.ONE_PAIR;
            const pair = countEntries[0].value;
            const kickers = countEntries.filter(e => e.count === 1).map(e => e.value).sort((a, b) => b - a);
            score = [rank, pair, ...kickers];
        } else {
            rank = rankMap.HIGH_CARD;
            score = [rank, ...values];
        }

        return {
            rank,
            rankName: nameMap[rank],
            score
        };
    }

    /**
     * 检查是否为顺子
     */
    static checkStraight(sortedValues, gameMode) {
        const unique = [...new Set(sortedValues)].sort((a, b) => b - a);
        if (unique.length < 5) return false;

        // 普通顺子检查
        if (unique[0] - unique[4] === 4) return true;

        // A-2-3-4-5 (标准德州中的最小顺子)
        if (gameMode === GameMode.STANDARD) {
            if (unique[0] === 14 && unique[1] === 5 && unique[2] === 4 && unique[3] === 3 && unique[4] === 2) {
                return true;
            }
        }

        // A-6-7-8-9 (短牌德州中的最小顺子, A当5用)
        if (gameMode === GameMode.SHORT_DECK) {
            if (unique[0] === 14 && unique[1] === 9 && unique[2] === 8 && unique[3] === 7 && unique[4] === 6) {
                return true;
            }
        }

        return false;
    }

    /**
     * 获取顺子的最高牌值
     */
    static getStraightHigh(sortedValues, gameMode) {
        const unique = [...new Set(sortedValues)].sort((a, b) => b - a);

        if (unique[0] - unique[4] === 4) return unique[0];

        // A-2-3-4-5 -> 最高是5
        if (gameMode === GameMode.STANDARD) {
            if (unique[0] === 14 && unique[1] === 5) return 5;
        }

        // A-6-7-8-9 -> 最高是9
        if (gameMode === GameMode.SHORT_DECK) {
            if (unique[0] === 14 && unique[1] === 9) return 9;
        }

        return unique[0];
    }

    /**
     * 比较两个分数数组
     * @returns {number} 正数表示a更大, 负数表示b更大, 0表示相等
     */
    static compareScores(a, b) {
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            const va = a[i] || 0;
            const vb = b[i] || 0;
            if (va !== vb) return va - vb;
        }
        return 0;
    }

    /**
     * 从数组中生成所有k个元素的组合
     */
    static combinations(arr, k) {
        const results = [];
        const combo = [];

        function backtrack(start) {
            if (combo.length === k) {
                results.push([...combo]);
                return;
            }
            for (let i = start; i < arr.length; i++) {
                combo.push(arr[i]);
                backtrack(i + 1);
                combo.pop();
            }
        }

        backtrack(0);
        return results;
    }

    /**
     * 比较两手牌
     * @returns {number} 正数表示hand1更大, 负数表示hand2更大, 0表示平局
     */
    static compareHands(hand1, hand2) {
        return HandEvaluator.compareScores(hand1.score, hand2.score);
    }
}
