// 8-Bit Web Audio API Sound Generator for Pixel Adventure Math
// 零外部檔案依賴，支援所有現代瀏覽器與行動裝置

class SoundController {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.initialized = true;
        } catch (e) {
            console.warn("Web Audio API not supported", e);
        }
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }

    playTone(freq, type = 'square', duration = 0.1, delay = 0, gainLevel = 0.1) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }

        setTimeout(() => {
            try {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

                gain.gain.setValueAtTime(gainLevel, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

                osc.connect(gain);
                gain.connect(this.ctx.destination);

                osc.start();
                osc.stop(this.ctx.currentTime + duration);
            } catch (err) {
                // ignore audio glitch
            }
        }, delay * 1000);
    }

    // 點擊按鈕聲
    click() {
        this.playTone(600, 'square', 0.05, 0, 0.05);
    }

    // 答對/融合音效（輕快上升琶音）
    correct() {
        if (!this.enabled) return;
        this.playTone(440, 'triangle', 0.08, 0, 0.1);
        this.playTone(554, 'triangle', 0.08, 0.06, 0.1);
        this.playTone(659, 'triangle', 0.1, 0.12, 0.12);
        this.playTone(880, 'triangle', 0.2, 0.18, 0.15);
    }

    // 答錯/破裂/受傷音效（低沈下墜雜音感）
    wrong() {
        if (!this.enabled) return;
        this.playTone(280, 'sawtooth', 0.12, 0, 0.15);
        this.playTone(200, 'sawtooth', 0.15, 0.08, 0.15);
        this.playTone(130, 'sawtooth', 0.25, 0.16, 0.2);
    }

    // 融合魔法音效
    fusion() {
        if (!this.enabled) return;
        this.playTone(523, 'sine', 0.08, 0, 0.1);
        this.playTone(659, 'sine', 0.08, 0.05, 0.1);
        this.playTone(783, 'sine', 0.12, 0.1, 0.12);
        this.playTone(1046, 'triangle', 0.15, 0.15, 0.15);
    }

    // 武器破裂 / 門碎
    crack() {
        if (!this.enabled) return;
        this.playTone(320, 'sawtooth', 0.06, 0, 0.15);
        this.playTone(180, 'sawtooth', 0.1, 0.05, 0.2);
        this.playTone(90, 'square', 0.18, 0.1, 0.25);
    }

    // 獲得傳奇武器 / 道具神裝
    treasure() {
        if (!this.enabled) return;
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((freq, idx) => {
            this.playTone(freq, 'square', 0.18, idx * 0.1, 0.12);
        });
        this.playTone(1318.51, 'triangle', 0.4, 0.45, 0.15);
    }

    // 勇者攻擊
    heroAttack() {
        if (!this.enabled) return;
        this.playTone(400, 'sawtooth', 0.05, 0, 0.15);
        this.playTone(700, 'sawtooth', 0.08, 0.04, 0.2);
        this.playTone(950, 'square', 0.12, 0.09, 0.15);
    }

    // 魔龍吼叫/吐火攻擊
    dragonAttack() {
        if (!this.enabled) return;
        this.playTone(140, 'sawtooth', 0.15, 0, 0.25);
        this.playTone(110, 'sawtooth', 0.2, 0.1, 0.25);
        this.playTone(85, 'sawtooth', 0.35, 0.2, 0.3);
    }

    // 重生之盾啟動
    rebirth() {
        if (!this.enabled) return;
        const notes = [300, 450, 600, 750, 900, 1200];
        notes.forEach((f, i) => {
            this.playTone(f, 'sine', 0.15, i * 0.08, 0.12);
        });
    }

    // 最終全破勝利音樂
    victory() {
        if (!this.enabled) return;
        const melody = [
            { f: 523, d: 0.12, t: 0 },
            { f: 523, d: 0.12, t: 0.13 },
            { f: 523, d: 0.12, t: 0.26 },
            { f: 659, d: 0.25, t: 0.39 },
            { f: 783, d: 0.25, t: 0.65 },
            { f: 1046, d: 0.45, t: 0.92 }
        ];
        melody.forEach(item => {
            this.playTone(item.f, 'triangle', item.d, item.t, 0.15);
        });
    }
}

window.soundCtrl = new SoundController();
