// ============================================================
// network.js - 客户端 WebSocket 网络层
// ============================================================

class Network {
    constructor() {
        this.ws = null;
        this.callbacks = {};
        this.playerId = null;
        this.roomId = null;
        this._reconnectTimer = null;
        this._url = null;
        this._playerName = null;
    }

    connect(url) {
        return new Promise((resolve, reject) => {
            this._url = url;
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this._clearReconnect();
                resolve();
            };

            this.ws.onerror = (err) => {
                console.error('WebSocket error:', err);
                reject(err);
            };

            this.ws.onclose = () => {
                console.log('WebSocket closed');
                this._emit('disconnected');
                this._scheduleReconnect();
            };

            this.ws.onmessage = (event) => {
                let msg;
                try {
                    msg = JSON.parse(event.data);
                } catch (e) {
                    return;
                }
                this._handleMessage(msg);
            };
        });
    }

    _handleMessage(msg) {
        switch (msg.type) {
            case MessageType.ROOM_CREATED:
                this.roomId = msg.roomId;
                this._emit('room_created', msg);
                break;
            case MessageType.ROOM_JOINED:
                this.roomId = msg.roomId;
                this._emit('room_joined', msg);
                break;
            case MessageType.ROOM_ERROR:
                this._emit('room_error', msg);
                break;
            case MessageType.GAME_STATE:
                if (msg.state && msg.state.myPlayerId) {
                    this.playerId = msg.state.myPlayerId;
                }
                this._emit('game_state', msg.state);
                break;
            case MessageType.YOUR_TURN:
                this._emit('your_turn', msg);
                break;
            case MessageType.MESSAGE:
                this._emit('message', msg);
                break;
            case MessageType.HAND_COMPLETE:
                this._emit('hand_complete', msg);
                break;
            case MessageType.GAME_OVER:
                this._emit('game_over', msg);
                break;
        }
    }

    createRoom(playerName, settings) {
        this._playerName = playerName;
        this._send({
            type: MessageType.CREATE_ROOM,
            playerName: playerName,
            gameMode: settings.gameMode,
            playerCount: settings.playerCount,
            startingChips: settings.startingChips,
            smallBlind: settings.smallBlind,
            bigBlind: settings.bigBlind
        });
    }

    joinRoom(roomId, playerName) {
        this._playerName = playerName;
        this._send({
            type: MessageType.JOIN_ROOM,
            roomId: roomId,
            playerName: playerName
        });
    }

    startGame() {
        this._send({ type: MessageType.START_GAME });
    }

    sendAction(action, amount) {
        this._send({
            type: MessageType.PLAYER_ACTION,
            action: action,
            amount: amount || 0
        });
    }

    sendNextHand() {
        this._send({ type: MessageType.NEXT_HAND });
    }

    on(event, callback) {
        if (!this.callbacks[event]) {
            this.callbacks[event] = [];
        }
        this.callbacks[event].push(callback);
    }

    off(event, callback) {
        if (!this.callbacks[event]) return;
        this.callbacks[event] = this.callbacks[event].filter(cb => cb !== callback);
    }

    _emit(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(cb => cb(data));
        }
    }

    _send(msg) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }

    _scheduleReconnect() {
        if (this._reconnectTimer) return;
        this._reconnectTimer = setTimeout(() => {
            this._reconnectTimer = null;
            if (this._url) {
                console.log('Attempting reconnect...');
                this.connect(this._url).then(() => {
                    // 重新加入房间
                    if (this.roomId && this._playerName) {
                        this.joinRoom(this.roomId, this._playerName);
                    }
                    this._emit('reconnected');
                }).catch(() => {
                    this._scheduleReconnect();
                });
            }
        }, 3000);
    }

    _clearReconnect() {
        if (this._reconnectTimer) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
    }

    disconnect() {
        this._clearReconnect();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.roomId = null;
        this.playerId = null;
        this.callbacks = {};
    }
}
