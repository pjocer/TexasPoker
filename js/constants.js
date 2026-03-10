// ============================================================
// constants.js - 游戏常量定义
// ============================================================

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const SUIT_SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' };
const SUIT_COLORS = { spades: 'black', hearts: 'red', diamonds: 'red', clubs: 'black' };

// 标准德州所有牌面值 (2-A)
const RANKS_STANDARD = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
// 短牌德州牌面值 (6-A)
const RANKS_SHORT = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// 牌面值数值映射 (用于比较大小)
const RANK_VALUES = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
    '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// 游戏模式
const GameMode = {
    STANDARD: 'standard',   // 标准德州扑克 (52张)
    SHORT_DECK: 'shortDeck' // 短牌德州 (36张, 6-A)
};

// 游戏阶段
const GamePhase = {
    WAITING: 'waiting',
    PRE_FLOP: 'preFlop',
    FLOP: 'flop',
    TURN: 'turn',
    RIVER: 'river',
    SHOWDOWN: 'showdown'
};

// 玩家动作
const Action = {
    FOLD: 'fold',
    CHECK: 'check',
    CALL: 'call',
    RAISE: 'raise',
    ALL_IN: 'allIn'
};

// 标准德州手牌等级 (从低到高)
const HandRank = {
    HIGH_CARD: 0,
    ONE_PAIR: 1,
    TWO_PAIR: 2,
    THREE_OF_A_KIND: 3,
    STRAIGHT: 4,
    FLUSH: 5,
    FULL_HOUSE: 6,
    FOUR_OF_A_KIND: 7,
    STRAIGHT_FLUSH: 8,
    ROYAL_FLUSH: 9
};

// 短牌德州手牌等级 (Flush > Full House, Three of a Kind > Straight)
const HandRankShortDeck = {
    HIGH_CARD: 0,
    ONE_PAIR: 1,
    TWO_PAIR: 2,
    STRAIGHT: 3,
    THREE_OF_A_KIND: 4,
    FULL_HOUSE: 5,
    FLUSH: 6,
    FOUR_OF_A_KIND: 7,
    STRAIGHT_FLUSH: 8,
    ROYAL_FLUSH: 9
};

const HAND_RANK_NAMES = {
    0: '高牌',
    1: '一对',
    2: '两对',
    3: '三条',
    4: '顺子',
    5: '同花',
    6: '葫芦',
    7: '四条',
    8: '同花顺',
    9: '皇家同花顺'
};

const HAND_RANK_NAMES_SHORT = {
    0: '高牌',
    1: '一对',
    2: '两对',
    3: '顺子',
    4: '三条',
    5: '葫芦',
    6: '同花',
    7: '四条',
    8: '同花顺',
    9: '皇家同花顺'
};

// 网络消息类型
const MessageType = {
    // 客户端 → 服务端
    CREATE_ROOM: 'create_room',
    JOIN_ROOM: 'join_room',
    START_GAME: 'start_game',
    PLAYER_ACTION: 'player_action',
    NEXT_HAND: 'next_hand',
    // 服务端 → 客户端
    ROOM_CREATED: 'room_created',
    ROOM_JOINED: 'room_joined',
    ROOM_ERROR: 'room_error',
    GAME_STATE: 'game_state',
    YOUR_TURN: 'your_turn',
    MESSAGE: 'message',
    HAND_COMPLETE: 'hand_complete',
    GAME_OVER: 'game_over'
};

// AI 玩家名字
const AI_NAMES = ['Alice', 'Bob', 'Charlie', 'Diana', 'Edward'];

// 默认设置
const DEFAULT_SETTINGS = {
    playerCount: 6,
    startingChips: 1000,
    smallBlind: 10,
    bigBlind: 20,
    gameMode: GameMode.STANDARD
};

if (typeof module !== 'undefined') {
    module.exports = {
        SUITS, SUIT_SYMBOLS, SUIT_COLORS, RANKS_STANDARD, RANKS_SHORT, RANK_VALUES,
        GameMode, GamePhase, Action, HandRank, HandRankShortDeck,
        HAND_RANK_NAMES, HAND_RANK_NAMES_SHORT, MessageType,
        AI_NAMES, DEFAULT_SETTINGS
    };
}
