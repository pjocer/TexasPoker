// ============================================================
// audio.js - 简易音效管理
// ============================================================

class AudioManager {
    constructor() {
        this.context = null;
        this.masterGain = null;
        this.enabled = true;
        this._boundUnlock = () => this.unlock();

        document.addEventListener('pointerdown', this._boundUnlock, { passive: true });
        document.addEventListener('keydown', this._boundUnlock, { passive: true });
    }

    unlock() {
        const context = this._ensureContext();
        if (context && context.state === 'suspended') {
            context.resume().catch(() => {});
        }
    }

    play(name) {
        if (!this.enabled) return;
        const context = this._ensureContext();
        if (!context) return;

        const startTime = context.currentTime;

        switch (name) {
            case 'fold':
                this._tone({ startTime, frequency: 260, duration: 0.08, type: 'triangle', gain: 0.04, slideTo: 180 });
                break;
            case 'check':
                this._tone({ startTime, frequency: 520, duration: 0.05, type: 'sine', gain: 0.03 });
                break;
            case 'call':
                this._tone({ startTime, frequency: 420, duration: 0.05, type: 'triangle', gain: 0.04 });
                this._tone({ startTime: startTime + 0.05, frequency: 560, duration: 0.05, type: 'triangle', gain: 0.035 });
                break;
            case 'raise':
                this._tone({ startTime, frequency: 360, duration: 0.06, type: 'sawtooth', gain: 0.035 });
                this._tone({ startTime: startTime + 0.04, frequency: 620, duration: 0.08, type: 'triangle', gain: 0.05, slideTo: 760 });
                break;
            case 'all_in':
                this._tone({ startTime, frequency: 240, duration: 0.08, type: 'square', gain: 0.04 });
                this._tone({ startTime: startTime + 0.05, frequency: 480, duration: 0.1, type: 'sawtooth', gain: 0.045, slideTo: 980 });
                this._tone({ startTime: startTime + 0.11, frequency: 820, duration: 0.18, type: 'triangle', gain: 0.05 });
                break;
            case 'win':
                this._tone({ startTime, frequency: 440, duration: 0.08, type: 'triangle', gain: 0.045 });
                this._tone({ startTime: startTime + 0.08, frequency: 554, duration: 0.08, type: 'triangle', gain: 0.045 });
                this._tone({ startTime: startTime + 0.16, frequency: 660, duration: 0.16, type: 'triangle', gain: 0.05 });
                break;
            default:
                break;
        }
    }

    _ensureContext() {
        if (this.context) return this.context;
        const ContextClass = window.AudioContext || window.webkitAudioContext;
        if (!ContextClass) return null;

        this.context = new ContextClass();
        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = 0.7;
        this.masterGain.connect(this.context.destination);
        return this.context;
    }

    _tone({ startTime, frequency, duration, type, gain, slideTo = null }) {
        const context = this.context;
        if (!context || !this.masterGain) return;

        const oscillator = context.createOscillator();
        const gainNode = context.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, startTime);
        if (slideTo) {
            oscillator.frequency.exponentialRampToValueAtTime(slideTo, startTime + duration);
        }

        gainNode.gain.setValueAtTime(0.0001, startTime);
        gainNode.gain.exponentialRampToValueAtTime(gain, startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        oscillator.connect(gainNode);
        gainNode.connect(this.masterGain);

        oscillator.start(startTime);
        oscillator.stop(startTime + duration + 0.02);
    }
}
