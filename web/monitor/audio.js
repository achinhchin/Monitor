(() => {
const R = Math.random, rr = (a, b) => a + R() * (b - a);
const PENTA = [0, 2, 4, 7, 9];
const CHORDS = [[[57, 64, 69, 71], [53, 60, 65, 69], [55, 62, 67, 71], [52, 59, 64, 67]], [[60, 67, 71, 74], [57, 64, 67, 72], [53, 60, 64, 69], [55, 62, 67, 69]],
  [[50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 63], [45, 52, 57, 60]], [[52, 59, 62, 67], [48, 55, 60, 64], [50, 57, 60, 65], [45, 52, 55, 60]]];
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

class Ambience {
  constructor() { this.ctx = null; this.on = false; this.vol = .6; this.muted = false; this.timers = { bird: 3, chime: 8, drop: 0, cricket: 1, chord: 0 }; }

  start() {
    if (this.ctx) return this.ctx.resume();
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = 0;
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -18;
    this.master.connect(comp).connect(C.destination);
    this.verb = this.reverb(3.2); this.verbIn = C.createGain(); this.verbIn.gain.value = .5; this.verbIn.connect(this.verb).connect(this.master);

    const noise = C.createBuffer(2, C.sampleRate * 4, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = noise.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < d.length; i++) { const w = R() * 2 - 1; b0 = .997 * b0 + w * .029; b1 = .985 * b1 + w * .032; b2 = .95 * b2 + w * .048; d[i] = (b0 + b1 + b2 + w * .02) * .5; } }
    const src = (f) => { const s = C.createBufferSource(); s.buffer = noise; s.loop = true; s.start(0, R() * 3); return s; };
    const chain = (s, ...nodes) => nodes.reduce((a, n) => (a.connect(n), n), s);
    const filt = (type, f, q = .7) => { const n = C.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; };
    const gain = (v = 0) => { const g = C.createGain(); g.gain.value = v; return g; };

    this.rainG = gain(); chain(src(), filt("highpass", 500), filt("lowpass", 7000), this.rainG, this.master);
    this.rumbleG = gain(); chain(src(), filt("lowpass", 380), this.rumbleG, this.master);
    this.windF = filt("bandpass", 420, 1.2); this.windG = gain(); chain(src(), this.windF, this.windG, this.master);

    this.padF = filt("lowpass", 900, .5); this.padG = gain(.0); this.padF.connect(this.padG); this.padG.connect(this.master); this.padG.connect(this.verbIn);
    this.voices = Array.from({ length: 4 }, (_, i) => { const o = C.createOscillator(), g = gain(.25); o.type = i % 2 ? "triangle" : "sine"; o.detune.value = rr(-6, 6); o.connect(g).connect(this.padF); o.start(); return o; });
    this.on = true;
    return C.resume();
  }

  reverb(sec) {
    const C = this.ctx, n = C.sampleRate * sec, b = C.createBuffer(2, n, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
    const c = C.createConvolver(); c.buffer = b; return c;
  }

  set(p, v, tc = .8) { p.setTargetAtTime(v, this.ctx.currentTime, tc); }

  blip(freq, dur, vol, type = "sine", toVerb = .6, bend = 0) {
    const C = this.ctx, t = C.currentTime, o = C.createOscillator(), g = C.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (bend) o.frequency.exponentialRampToValueAtTime(freq * bend, t + dur * .6);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(this.master); if (toVerb) { const s = C.createGain(); s.gain.value = toVerb; g.connect(s).connect(this.verbIn); }
    o.start(t); o.stop(t + dur + .05); o.onended = () => { o.disconnect(); g.disconnect(); };
  }

  bird() {
    const base = rr(2200, 4200), n = 2 + (R() * 5 | 0);
    for (let i = 0; i < n; i++) setTimeout(() => this.on && this.blip(base * rr(.85, 1.2), rr(.06, .14), .035, "sine", .5, rr(.6, 1.5)), i * rr(90, 160));
  }

  thunder(delay, amt) {
    if (!this.on) return;
    setTimeout(() => {
      if (!this.on) return;
      const C = this.ctx, t = C.currentTime, s = C.createBufferSource(), f = C.createBiquadFilter(), g = C.createGain();
      s.buffer = this._tb ||= (() => { const b = C.createBuffer(1, C.sampleRate * 5, C.sampleRate), d = b.getChannelData(0); let l = 0; for (let i = 0; i < d.length; i++) { l = l * .98 + (R() * 2 - 1) * .02; d[i] = l * 8; } return b; })();
      f.type = "lowpass"; f.frequency.value = 160;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.9 * amt, t + .25); g.gain.exponentialRampToValueAtTime(.001, t + 4.5);
      s.connect(f).connect(g).connect(this.master); g.connect(this.verbIn);
      s.start(t); s.stop(t + 5); s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
    }, delay * 1000);
  }

  update(st, dt) {
    if (!this.on || !st) return;
    const T = this.timers, { rain, snow, night, light, wind, pal, season } = st;
    this.set(this.master.gain, this.muted ? 0 : this.vol * .9, .5);
    this.set(this.rainG.gain, rain * (1 - snow * .9) * .55);
    this.set(this.rumbleG.gain, rain * (1 - snow * .8) * .35);
    this.set(this.windG.gain, .04 + wind * .09 + snow * .05);
    this.set(this.windF.frequency, 300 + wind * 500 + Math.sin(performance.now() / 3100) * 120, 1.5);
    this.set(this.padG.gain, .05 * (1 - rain * .4), 2);
    this.set(this.padF.frequency, 500 + light * 900, 3);

    if ((T.chord -= dt) <= 0) {
      T.chord = rr(12, 20);
      const ch = CHORDS[season][R() * 4 | 0];
      this.voices.forEach((o, i) => this.set(o.frequency, mtof(ch[i] - 12 * (i === 0)), 1.8));
    }
    if ((T.chime -= dt) <= 0) {
      T.chime = rr(9, 28);
      const root = 72 + [0, 2, -3, -5][season], n = 1 + (R() * 3 | 0);
      for (let i = 0; i < n; i++) setTimeout(() => this.on && this.blip(mtof(root + PENTA[R() * 5 | 0] + 12 * (R() < .3)), 3, .025, "sine", 1), i * rr(200, 700));
    }
    if ((pal.pollen + pal.petals > .3) && light > .5 && rain < .3 && (T.bird -= dt) <= 0) { T.bird = rr(3, 11); this.bird(); }
    if (night > .6 && pal.fireflies > .3 && rain < .4 && (T.cricket -= dt) <= 0) {
      T.cricket = rr(.4, 1.6); const f = rr(4200, 4800);
      for (let i = 0; i < 3; i++) setTimeout(() => this.on && this.blip(f, .05, .01 * pal.fireflies, "sine", .2), i * 70);
    }
    if (rain > .05 && snow < .5 && (T.drop -= dt) <= 0) { T.drop = rr(.05, .5) / (rain + .2); this.blip(rr(1200, 3200), .08, .02 * rain, "sine", .7, .5); }
  }

  stop() { this.on = false; if (this.ctx) { this.ctx.close(); this.ctx = null; } }
}
window.Ambience = Ambience;
})();
