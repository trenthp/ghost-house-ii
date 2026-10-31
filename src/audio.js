// All sounds are synthesized — no audio files needed.
export class SpookyAudio {
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.ctx.resume();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    this._ambient();
  }

  _ambient() {
    const c = this.ctx;
    this.amb = c.createGain();
    this.amb.gain.value = 0;
    this.amb.connect(this.master);

    // Low detuned drone
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 400;
    lp.connect(this.amb);
    for (const f of [55, 55.7, 82.4]) {
      const o = c.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = f;
      const g = c.createGain(); g.gain.value = 0.05;
      o.connect(g).connect(lp); o.start();
    }

    // Wind: filtered noise with a slowly wandering band
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.8;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lfoGain = c.createGain(); lfoGain.gain.value = 300;
    lfo.connect(lfoGain).connect(bp.frequency); lfo.start();
    const ng = c.createGain(); ng.gain.value = 0.12;
    noise.connect(bp).connect(ng).connect(this.amb);
    noise.start();
  }

  /** 0 = silent, 1 = fully haunted */
  setIntensity(x) {
    if (!this.ctx) return;
    this.amb.gain.setTargetAtTime(x * 0.6, this.ctx.currentTime, 1.5);
  }

  /** Classic ghostly "woooOOoo". pan: -1..1 */
  wooo(pan = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    const base = 260 + Math.random() * 120;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 1.7, t + 0.7);
    o.frequency.linearRampToValueAtTime(base * 0.8, t + 1.8);
    const vib = c.createOscillator(); vib.frequency.value = 5.5;
    const vibG = c.createGain(); vibG.gain.value = 12;
    vib.connect(vibG).connect(o.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.3);
    g.gain.linearRampToValueAtTime(0.18, t + 1.4);
    g.gain.linearRampToValueAtTime(0, t + 2);
    this._out(o, g, pan);
    o.start(t); vib.start(t); o.stop(t + 2.1); vib.stop(t + 2.1);
  }

  /** Banish shriek: rising squeal + noise puff. */
  shriek(pan = 0) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(500, t);
    o.frequency.exponentialRampToValueAtTime(2400, t + 0.35);
    o.frequency.exponentialRampToValueAtTime(200, t + 0.8);
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    o.connect(f);
    this._out(f, g, pan);
    o.start(t); o.stop(t + 0.9);
  }

  _out(node, gain, pan) {
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    node.connect(gain);
    if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); gain.connect(p).connect(this.master); }
    else gain.connect(this.master);
  }
}
