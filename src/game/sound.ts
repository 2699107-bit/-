import { MUTE_STORAGE_KEY } from './constants';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    try {
      const saved = localStorage.getItem(MUTE_STORAGE_KEY);
      this.muted = saved === 'true';
    } catch {
      this.muted = false;
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    try {
      localStorage.setItem(MUTE_STORAGE_KEY, String(mute));
    } catch {
      // Ignore storage failures
    }
  }

  private getContext(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    volume = 0.08,
    delay = 0,
    endFreq?: number
  ) {
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playMove(): void {
    this.playTone(260, 0.035, 'triangle', 0.045, 0, 220);
  }

  public playRotate(): void {
    this.playTone(420, 0.055, 'sine', 0.06, 0, 560);
  }

  public playHold(): void {
    this.playTone(330, 0.05, 'triangle', 0.06, 0);
    this.playTone(440, 0.06, 'triangle', 0.06, 0.045);
  }

  public playHardDrop(): void {
    this.playTone(150, 0.09, 'triangle', 0.11, 0, 58);
  }

  public playLock(): void {
    this.playTone(190, 0.045, 'sine', 0.055, 0, 130);
  }

  public playLineClear(lines: number, isTSpin: boolean): void {
    if (lines === 4 || isTSpin) {
      // Crisp 4-note major chord arpeggio
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((n, idx) => {
        this.playTone(n, 0.14, 'triangle', 0.09, idx * 0.045);
      });
    } else {
      const base = 440 + lines * 75;
      this.playTone(base, 0.1, 'triangle', 0.075, 0);
      this.playTone(base * 1.25, 0.13, 'triangle', 0.075, 0.05);
    }
  }

  public playLevelUp(): void {
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((n, idx) => {
      this.playTone(n, 0.11, 'sine', 0.07, idx * 0.06);
    });
  }

  public playGameOver(): void {
    const notes = [392, 349.23, 311.13, 261.63];
    notes.forEach((n, idx) => {
      this.playTone(n, 0.18, 'sawtooth', 0.05, idx * 0.11);
    });
  }
}

export const soundEngine = new SoundEngine();
