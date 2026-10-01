// Tiny WebAudio synth – no asset files needed. Everything is generated on the fly.

type OscType = OscillatorType;

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;
  /** Set while the attract-mode demo runs so it stays silent. */
  suppress = false;
  private lastPop = 0;

  /** Must be called from a user gesture at least once. */
  unlock() {
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.02);
    }
  }

  private tone(
    freq: number,
    dur: number,
    type: OscType = "sine",
    vol = 0.3,
    slideTo?: number,
    delay = 0
  ) {
    if (!this.ctx || !this.master || this.muted || this.suppress) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private noise(dur: number, vol = 0.3, freq = 1200, delay = 0, type: BiquadFilterType = "lowpass") {
    if (!this.ctx || !this.master || !this.noiseBuf || this.muted || this.suppress) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.15), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.master);
    s.start(t);
    s.stop(t + dur + 0.03);
  }

  // ---- game sounds -----------------------------------------------------
  eat(combo: number) {
    // Pentatonic climb: each consecutive pickup is a higher note.
    const scale = [0, 2, 4, 7, 9];
    const n = Math.max(0, combo - 1);
    const semis = scale[n % 5] + 12 * Math.floor(n / 5);
    const f = 392 * Math.pow(2, Math.min(semis, 24) / 12);
    this.tone(f, 0.14, "triangle", 0.34, f * 1.5);
    this.tone(f * 2, 0.1, "sine", 0.12, undefined, 0.02);
    this.noise(0.05, 0.08, 6000, 0, "highpass");
  }

  dice(roll: number) {
    for (let i = 0; i < 5; i++) this.tone(300 + Math.random() * 500, 0.04, "square", 0.08, undefined, i * 0.045);
    const base = 523;
    const notes = roll === 6 ? [0, 4, 7, 12, 16] : [0, 4, 7];
    notes.forEach((n, i) => this.tone(base * Math.pow(2, n / 12), 0.18, "triangle", 0.26, undefined, 0.24 + i * 0.07));
  }

  climb() {
    this.tone(220, 0.35, "sawtooth", 0.16, 1400);
    [0, 4, 7, 12].forEach((n, i) =>
      this.tone(440 * Math.pow(2, n / 12), 0.16, "triangle", 0.26, undefined, 0.05 + i * 0.06)
    );
    this.noise(0.25, 0.12, 5000, 0, "bandpass");
  }

  bite() {
    this.tone(700, 0.45, "sawtooth", 0.22, 90);
    this.tone(180, 0.3, "square", 0.18, 60, 0.05);
    this.noise(0.25, 0.2, 3000);
  }

  die() {
    this.noise(0.6, 0.45, 2500);
    this.tone(220, 0.7, "sawtooth", 0.28, 40);
    this.tone(110, 0.8, "sine", 0.4, 35);
  }

  pop(i: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastPop < 0.025) return;
    this.lastPop = now;
    const f = 300 + Math.min(i, 30) * 28;
    this.tone(f, 0.07, "square", 0.1, f * 1.8);
  }

  levelUp() {
    [0, 4, 7, 12, 16, 19].forEach((n, i) =>
      this.tone(330 * Math.pow(2, n / 12), 0.22, "triangle", 0.28, undefined, i * 0.07)
    );
    this.tone(165, 0.5, "sine", 0.3, 330);
  }

  turn() {
    this.tone(180, 0.035, "square", 0.045);
  }

  click() {
    this.tone(520, 0.06, "triangle", 0.2, 780);
  }

  pause(on: boolean) {
    this.tone(on ? 440 : 660, 0.09, "triangle", 0.2, on ? 330 : 880);
  }

  go() {
    this.tone(392, 0.1, "triangle", 0.25);
    this.tone(587, 0.2, "triangle", 0.25, undefined, 0.09);
  }

  tick() {
    this.tone(640, 0.05, "sine", 0.18);
  }

  expire() {
    this.tone(300, 0.15, "triangle", 0.15, 150);
  }
}

export const sfx = new Sfx();

export function vibrate(pattern: number | number[]) {
  if (sfx.muted || sfx.suppress) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}
