// ============================================================
// ai.js - AI 决策引擎
// ============================================================

class AI {
    static decide(player, gameState) {
        const { communityCards, currentBet, pot, phase, gameMode, minRaise, bigBlind } = gameState;
        const toCall = currentBet - player.currentBet;

        const strength = AI.evaluateStrength(player.holeCards, communityCards, gameMode, phase);

        // 每位AI风格微调 (id产生固定偏移)
        const styleOffset = ((player.id * 7 + 3) % 10 - 5) / 100; // -0.05 ~ +0.04
        const randomFactor = Math.random() * 0.12 - 0.06;
        const adjustedStrength = Math.max(0, Math.min(1, strength + randomFactor + styleOffset));

        const positionBonus = AI.getPositionBonus(player, gameState);
        const playersInHand = gameState.players
            ? gameState.players.filter(p => !p.isFolded && !p.isBusted).length
            : 6;
        const isAggressor = gameState.preflopAggressorIndex === player.seatIndex;

        if (phase === GamePhase.PRE_FLOP) {
            return AI.preFlopStrategy(player, adjustedStrength, toCall, gameState, positionBonus, playersInHand);
        }

        return AI.postFlopStrategy(player, adjustedStrength, toCall, gameState, positionBonus, playersInHand, isAggressor);
    }

    // ==================== 位置 ====================

    static getPositionBonus(player, gameState) {
        const { players, dealerIndex } = gameState;
        if (!players || players.length === 0) return 0;
        const totalActive = players.filter(p => !p.isBusted).length;
        if (totalActive <= 1) return 0;

        let pos = 0;
        let idx = (dealerIndex + 1) % players.length;
        while (idx !== player.seatIndex) {
            if (!players[idx].isBusted) pos++;
            idx = (idx + 1) % players.length;
        }
        return (pos / totalActive) * 0.1;
    }

    // ==================== 牌力评估 ====================

    static evaluateStrength(holeCards, communityCards, gameMode, phase) {
        if (communityCards.length === 0) {
            return AI.preFlopStrength(holeCards);
        }

        const allCards = [...holeCards, ...communityCards];
        const result = HandEvaluator.evaluate(allCards, gameMode);
        const rank = result.rank;

        // 基础分 (大幅提高一对和两对)
        const baseScores = {
            0: 0.12,  // 高牌
            1: 0.42,  // 一对 (核心改动: 从0.3提到0.42)
            2: 0.62,  // 两对 (核心改动: 从0.48提到0.62)
            3: 0.72,  // 三条
            4: 0.76,  // 顺子
            5: 0.82,  // 同花
            6: 0.88,  // 葫芦
            7: 0.94,  // 四条
            8: 0.97,  // 同花顺
            9: 1.0    // 皇家同花顺
        };

        let strength = baseScores[rank] || 0.12;

        // 手牌参与牌型加成
        if (rank >= 1 && result.bestHand) {
            let holeCardsUsed = 0;
            for (const card of result.bestHand) {
                if (holeCards.some(h => h.suit === card.suit && h.rank === card.rank)) {
                    holeCardsUsed++;
                }
            }
            // 两张手牌都参与更强
            strength += holeCardsUsed >= 2 ? 0.08 : (holeCardsUsed >= 1 ? 0.04 : 0);
        }

        // 一对的质量细分
        if (rank === 1 && communityCards.length >= 3) {
            const boardValues = communityCards.map(c => c.value).sort((a, b) => b - a);
            const holeMax = Math.max(holeCards[0].value, holeCards[1].value);
            const holeMin = Math.min(holeCards[0].value, holeCards[1].value);
            const isPocket = holeCards[0].value === holeCards[1].value;

            if (isPocket && holeCards[0].value > boardValues[0]) {
                strength += 0.12; // 超对 (口袋对子 > 面板最大牌)
            } else if (holeMax === boardValues[0]) {
                // 顶对, 按踢脚牌质量加分
                strength += 0.08;
                if (holeMin >= 10) strength += 0.04; // 好踢脚
            } else if (holeMax === boardValues[1]) {
                strength += 0.03; // 中对
            }
            // 底对不加分
        }

        // 听牌价值 (翻牌/转牌)
        if (communityCards.length <= 4) {
            strength += AI.drawStrength(holeCards, communityCards);
        }

        return Math.min(1, strength);
    }

    static drawStrength(holeCards, communityCards) {
        const allCards = [...holeCards, ...communityCards];
        let bonus = 0;

        // 同花听牌
        const suitCounts = {};
        for (const c of allCards) {
            suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
        }
        for (const s in suitCounts) {
            if (suitCounts[s] === 4) {
                bonus += 0.1;
                // 坚果同花听牌 (手持A)
                if (holeCards.some(h => h.suit === s && h.value === 14)) {
                    bonus += 0.04;
                }
            }
        }

        // 顺子听牌
        const values = [...new Set(allCards.map(c => c.value))].sort((a, b) => a - b);
        for (let i = 0; i < values.length - 3; i++) {
            const span = values[i + 3] - values[i];
            if (span === 4) bonus += 0.07; // 两头顺子听牌
            else if (span === 3) bonus += 0.04; // 卡顺
        }

        return Math.min(0.14, bonus);
    }

    // ==================== Preflop 手牌强度 ====================

    static preFlopStrength(holeCards) {
        const [c1, c2] = holeCards;
        const high = Math.max(c1.value, c2.value);
        const low = Math.min(c1.value, c2.value);
        const suited = c1.suit === c2.suit;
        const paired = c1.value === c2.value;
        const gap = high - low;

        // 口袋对子
        if (paired) {
            if (high === 14) return 0.95; // AA
            if (high === 13) return 0.92; // KK
            if (high === 12) return 0.88; // QQ
            if (high === 11) return 0.82; // JJ
            if (high === 10) return 0.78; // TT
            if (high === 9) return 0.68;  // 99
            if (high === 8) return 0.62;  // 88
            if (high === 7) return 0.56;  // 77
            return 0.46 + (high - 2) * 0.02; // 66-22
        }

        // 特殊高牌组合 (硬编码更精准)
        if (high === 14 && low === 13) return suited ? 0.88 : 0.82; // AK
        if (high === 14 && low === 12) return suited ? 0.80 : 0.74; // AQ
        if (high === 14 && low === 11) return suited ? 0.72 : 0.66; // AJ
        if (high === 14 && low === 10) return suited ? 0.66 : 0.60; // AT
        if (high === 13 && low === 12) return suited ? 0.76 : 0.70; // KQ
        if (high === 13 && low === 11) return suited ? 0.68 : 0.62; // KJ
        if (high === 13 && low === 10) return suited ? 0.63 : 0.57; // KT
        if (high === 12 && low === 11) return suited ? 0.66 : 0.60; // QJ
        if (high === 12 && low === 10) return suited ? 0.60 : 0.54; // QT
        if (high === 11 && low === 10) return suited ? 0.62 : 0.56; // JT

        // 通用公式
        let strength = ((high + low) / 28) * 0.4;

        if (high === 14) strength += 0.12;
        else if (high === 13) strength += 0.08;
        else if (high === 12) strength += 0.05;

        if (gap === 1) strength += 0.08;       // 连牌
        else if (gap === 2) strength += 0.05;   // 一间隔
        else if (gap === 3) strength += 0.02;

        if (suited) strength += 0.06;

        // Ax suited: 同花A有额外价值
        if (high === 14 && suited) strength += 0.04;

        return Math.min(1, Math.max(0, strength));
    }

    // ==================== Preflop 策略 ====================

    static preFlopStrategy(player, strength, toCall, gameState, positionBonus, playersInHand) {
        const { bigBlind, minRaise, currentBet } = gameState;
        const s = strength + positionBonus;
        const raiseX = currentBet / bigBlind;

        // --- 未加注 (limped / 大盲位) ---
        if (raiseX <= 1) {
            if (s >= 0.75) {
                // 强牌 open raise 3x
                return AI.makeRaise(bigBlind * 3, minRaise, player);
            }
            if (s >= 0.55) {
                // 中强牌 open raise 2-3x
                const size = bigBlind * (2 + Math.floor(Math.random() * 2));
                return AI.makeRaise(size, minRaise, player);
            }
            if (s >= 0.38) {
                // 可玩牌: 后位open, 前位limp
                if (positionBonus >= 0.04 && Math.random() > 0.35) {
                    return AI.makeRaise(bigBlind * 2, minRaise, player);
                }
                if (toCall === 0) return { action: Action.CHECK, amount: 0 };
                return { action: Action.CALL, amount: toCall };
            }
            if (s >= 0.25) {
                if (toCall === 0) return { action: Action.CHECK, amount: 0 };
                // 大盲位 defend: 只补差价
                if (toCall <= bigBlind) return Math.random() > 0.25
                    ? { action: Action.CALL, amount: toCall }
                    : { action: Action.FOLD, amount: 0 };
                return { action: Action.FOLD, amount: 0 };
            }
            if (toCall === 0) return { action: Action.CHECK, amount: 0 };
            return { action: Action.FOLD, amount: 0 };
        }

        // --- 面对 open raise (2-4x) ---
        if (raiseX >= 2 && raiseX <= 4) {
            if (s >= 0.82) {
                // 强牌 3bet
                return AI.makeRaise(currentBet * 3, minRaise, player);
            }
            if (s >= 0.58) {
                return { action: Action.CALL, amount: toCall };
            }
            if (s >= 0.42) {
                // 可玩的牌: 大多跟注
                return Math.random() > 0.2
                    ? { action: Action.CALL, amount: toCall }
                    : { action: Action.FOLD, amount: 0 };
            }
            if (s >= 0.32) {
                // 边缘牌: 位置好偶尔跟, suited连牌set mine
                if (positionBonus >= 0.04) {
                    return Math.random() > 0.4
                        ? { action: Action.CALL, amount: toCall }
                        : { action: Action.FOLD, amount: 0 };
                }
                return Math.random() > 0.7
                    ? { action: Action.CALL, amount: toCall }
                    : { action: Action.FOLD, amount: 0 };
            }
            return { action: Action.FOLD, amount: 0 };
        }

        // --- 面对 3bet+ (>4x) ---
        if (s >= 0.88) {
            return AI.makeRaise(Math.floor(currentBet * 2.5), minRaise, player);
        }
        if (s >= 0.72) {
            return { action: Action.CALL, amount: toCall };
        }
        if (s >= 0.55 && toCall <= bigBlind * 10) {
            return Math.random() > 0.35
                ? { action: Action.CALL, amount: toCall }
                : { action: Action.FOLD, amount: 0 };
        }
        return { action: Action.FOLD, amount: 0 };
    }

    // ==================== Postflop 策略 ====================

    static postFlopStrategy(player, strength, toCall, gameState, positionBonus, playersInHand, isAggressor) {
        const { bigBlind, pot, minRaise, phase } = gameState;
        const s = strength + positionBonus;
        const betRatio = toCall / Math.max(pot, 1);
        const isHeadsUp = playersInHand <= 2;

        // ------ C-Bet: 翻前加注者在翻牌有优先下注权 ------
        if (isAggressor && phase === GamePhase.FLOP && toCall === 0) {
            // 强牌: 大c-bet
            if (s >= 0.55) {
                const size = Math.floor(pot * (0.5 + Math.random() * 0.25));
                return AI.makeRaise(size, minRaise, player);
            }
            // 中等牌或空气: 小c-bet (65%频率)
            if (Math.random() < 0.65) {
                const size = Math.floor(pot * (0.3 + Math.random() * 0.2));
                return AI.makeRaise(size, minRaise, player);
            }
            return { action: Action.CHECK, amount: 0 };
        }

        // ------ 坚果牌 (三条+, 0.72+) ------
        if (s >= 0.72) {
            if (toCall === 0) {
                // check-raise 陷阱 (20%概率, 仅单挑且有位置)
                if (s >= 0.82 && isHeadsUp && positionBonus < 0.04 && Math.random() < 0.2) {
                    return { action: Action.CHECK, amount: 0 };
                }
                // 慢打 (10%概率, 极强牌)
                if (s >= 0.88 && Math.random() < 0.1) {
                    return { action: Action.CHECK, amount: 0 };
                }
                // 价值下注 50-75% pot
                const size = Math.floor(pot * (0.5 + Math.random() * 0.25));
                return AI.makeRaise(size, minRaise, player);
            }
            // 面对下注: 加注或跟注
            if (s >= 0.82 && Math.random() > 0.35) {
                const raiseSize = Math.floor(toCall * 2.5 + pot * 0.3);
                return AI.makeRaise(raiseSize, minRaise, player);
            }
            return { action: Action.CALL, amount: toCall };
        }

        // ------ 强牌 (顶对好踢脚, 两对 ~0.55-0.72) ------
        if (s >= 0.55) {
            if (toCall === 0) {
                // 下注 33-60% pot
                if (Math.random() > 0.2) {
                    const size = Math.floor(pot * (0.33 + Math.random() * 0.27));
                    return AI.makeRaise(size, minRaise, player);
                }
                return { action: Action.CHECK, amount: 0 };
            }
            // 面对下注: 绝大多数情况跟注
            if (betRatio <= 1.0) {
                return { action: Action.CALL, amount: toCall };
            }
            // 超池下注仍有80%跟注
            return Math.random() > 0.2
                ? { action: Action.CALL, amount: toCall }
                : { action: Action.FOLD, amount: 0 };
        }

        // ------ 中等牌 (中对, 顶对差踢脚, 听牌 ~0.38-0.55) ------
        if (s >= 0.38) {
            if (toCall === 0) {
                // 半诈唬/保护 (40%频率)
                if (Math.random() < 0.4) {
                    const size = Math.floor(pot * (0.25 + Math.random() * 0.25));
                    return AI.makeRaise(size, minRaise, player);
                }
                return { action: Action.CHECK, amount: 0 };
            }
            // 面对下注
            if (betRatio <= 0.5) {
                return { action: Action.CALL, amount: toCall };
            }
            if (betRatio <= 0.75) {
                return Math.random() > 0.25
                    ? { action: Action.CALL, amount: toCall }
                    : { action: Action.FOLD, amount: 0 };
            }
            // 大下注
            return Math.random() > 0.55
                ? { action: Action.CALL, amount: toCall }
                : { action: Action.FOLD, amount: 0 };
        }

        // ------ 弱牌 (底对, 高牌, 弱听牌 ~0.20-0.38) ------
        if (s >= 0.20) {
            if (toCall === 0) {
                // 诈唬: 后位 + 单挑
                if (isHeadsUp && positionBonus >= 0.05 && Math.random() < 0.3) {
                    const size = Math.floor(pot * (0.4 + Math.random() * 0.2));
                    return AI.makeRaise(size, minRaise, player);
                }
                // 河牌诈唬
                if (phase === GamePhase.RIVER && isHeadsUp && Math.random() < 0.2) {
                    const size = Math.floor(pot * (0.5 + Math.random() * 0.3));
                    return AI.makeRaise(size, minRaise, player);
                }
                return { action: Action.CHECK, amount: 0 };
            }
            // 面对小注: 赔率跟注
            if (betRatio <= 0.33) {
                return Math.random() > 0.3
                    ? { action: Action.CALL, amount: toCall }
                    : { action: Action.FOLD, amount: 0 };
            }
            // 单挑抓诈唬
            if (isHeadsUp && betRatio <= 0.5 && Math.random() < 0.25) {
                return { action: Action.CALL, amount: toCall };
            }
            return { action: Action.FOLD, amount: 0 };
        }

        // ------ 空气 (<0.20) ------
        if (toCall === 0) {
            // 纯诈唬 (后位单挑, 低频率)
            if (isHeadsUp && positionBonus >= 0.06 && Math.random() < 0.15) {
                const size = Math.floor(pot * (0.5 + Math.random() * 0.25));
                return AI.makeRaise(size, minRaise, player);
            }
            return { action: Action.CHECK, amount: 0 };
        }
        return { action: Action.FOLD, amount: 0 };
    }

    // ==================== 工具 ====================

    static makeRaise(amount, minRaise, player) {
        const maxAmount = player.chips + player.currentBet;
        const clampedAmount = Math.max(minRaise, Math.min(Math.floor(amount), maxAmount));
        return { action: Action.RAISE, amount: clampedAmount };
    }
}

if (typeof module !== 'undefined') {
    module.exports = { AI };
}
