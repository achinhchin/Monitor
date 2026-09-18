(() => {
const R = Math.random, rr = (a, b) => a + R() * (b - a), mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const PENTA = [0, 2, 4, 7, 9];
const CHORDS = [[[57, 64, 69, 71], [53, 60, 65, 69], [55, 62, 67, 71], [52, 59, 64, 67]], [[60, 67, 71, 74], [57, 64, 67, 72], [53, 60, 64, 69], [55, 62, 67, 69]],
  [[50, 57, 62, 65], [46, 53, 58, 62], [48, 55, 60, 63], [45, 52, 57, 60]], [[52, 59, 62, 67], [48, 55, 60, 64], [50, 57, 60, 65], [45, 52, 55, 60]]];
// per-scene ambient bed levels: [wind, waves, city, leaves, water]
const BEDS = { meadow: [.5, 0, 0, .25, .06], forest: [.3, 0, 0, .6, 0], mountain: [.9, 0, 0, .1, .5], beach: [.5, 1, 0, 0, 0], city: [.25, 0, .8, 0, 0] };

class Ambience {
  constructor() { this.ctx = null; this.on = false; this.vol = .6; this.muted = false; this.voices = 0; this.T = { chime: 8, cricket: 1, chord: 0, drop: 0 }; }

  start() {
    if (this.ctx) return this.ctx.resume();
    const C = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
    this.master = C.createGain(); this.master.gain.value = 0;
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -16; this.master.connect(comp).connect(C.destination);
    const n = C.sampleRate * 3.2, rb = C.createBuffer(2, n, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = rb.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (R() * 2 - 1) * (1 - i / n) ** 2.6; }
    this.verb = C.createConvolver(); this.verb.buffer = rb; this.send = C.createGain(); this.send.gain.value = .45; this.send.connect(this.verb).connect(this.master);
    const nb = (this.noise = C.createBuffer(1, C.sampleRate * 4, C.sampleRate)).getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0; for (let i = 0; i < nb.length; i++) { const w = R() * 2 - 1; b0 = .997 * b0 + w * .029; b1 = .985 * b1 + w * .032; b2 = .95 * b2 + w * .048; nb[i] = (b0 + b1 + b2 + w * .02) * .5; }
    const bed = (...f) => { const s = C.createBufferSource(); s.buffer = this.noise; s.loop = true; s.start(0, R() * 3); const g = C.createGain(); g.gain.value = 0; f.reduce((a, [t, fr, q = .7]) => { const b = C.createBiquadFilter(); b.type = t; b.frequency.value = fr; b.Q.value = q; a.connect(b); return b; }, s).connect(g).connect(this.master); g.f = null; return g; };
    this.b = { rain: bed(["highpass", 500], ["lowpass", 7000]), rumble: bed(["lowpass", 350]), wind: bed(["bandpass", 420, 1.2]), waves: bed(["lowpass", 900]), city: bed(["lowpass", 260]), leaves: bed(["highpass", 2600], ["lowpass", 7000]), water: bed(["bandpass", 1200, .5]) };
    this.padF = C.createBiquadFilter(); this.padF.type = "lowpass"; this.padF.frequency.value = 900; this.padG = C.createGain(); this.padG.gain.value = 0;
    this.padF.connect(this.padG); this.padG.connect(this.master); this.padG.connect(this.send);
    this.pad = Array.from({ length: 4 }, (_, i) => { const o = C.createOscillator(), g = C.createGain(); g.gain.value = .25; o.type = i % 2 ? "triangle" : "sine"; o.detune.value = rr(-6, 6); o.connect(g).connect(this.padF); o.start(); return o; });
    this.on = true; return C.resume();
  }
  stop() { this.on = false; if (this.ctx) { this.ctx.close(); this.ctx = null; } }
  set(p, v, tc = .8) { p.setTargetAtTime(v, this.ctx.currentTime, tc); }

  // one-shot voice building blocks
  out(pan = 0, vol = 1, verb = .5) {
    const C = this.ctx, g = C.createGain(), p = C.createStereoPanner(); g.gain.value = vol; p.pan.value = pan; g.connect(p).connect(this.master);
    if (verb) { const s = C.createGain(); s.gain.value = verb; p.connect(s).connect(this.send); }
    return g;
  }
  tone(dst, type, f0, f1, t0, dur, vol, vib = 0) {
    const C = this.ctx, o = C.createOscillator(), g = C.createGain(), t = C.currentTime + t0;
    o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur * .8);
    if (vib) { const l = C.createOscillator(), lg = C.createGain(); l.frequency.value = vib; lg.gain.value = f0 * .03; l.connect(lg).connect(o.frequency); l.start(t); l.stop(t + dur); }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(.02, dur * .2)); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(dst); o.start(t); o.stop(t + dur + .05); this.voices++; o.onended = () => { o.disconnect(); g.disconnect(); this.voices--; };
  }
  hiss(dst, type, f, q, t0, dur, vol) {
    const C = this.ctx, s = C.createBufferSource(), b = C.createBiquadFilter(), g = C.createGain(), t = C.currentTime + t0;
    s.buffer = this.noise; b.type = type; b.frequency.value = f; b.Q.value = q;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(b).connect(g).connect(dst); s.start(t, R() * 3); s.stop(t + dur + .05); this.voices++; s.onended = () => { s.disconnect(); b.disconnect(); g.disconnect(); this.voices--; };
  }

  call(name, pan = 0, v = 1) {
    if (!this.on || this.voices > 40) return;
    const o = this.out(pan, v), T = this.tone.bind(this, o), N = this.hiss.bind(this, o);
    switch (name) {
      case "chirp": { const f = rr(2400, 4200), n = 2 + (R() * 5 | 0); for (let i = 0; i < n; i++) T("sine", f * rr(.9, 1.15), f * rr(.7, 1.5), i * rr(.08, .14), rr(.06, .12), .05); break; }
      case "coo": T("triangle", 420, 360, 0, .35, .06); T("triangle", 400, 330, .45, .5, .05); break;
      case "gull": for (let i = 0; i < 3; i++) T("sawtooth", 950, 620, i * .28, .24, .025, 7); break;
      case "screech": T("sawtooth", 1900, 1250, 0, 1.1, .03, 9); break;
      case "hoot": T("sine", 390, 360, 0, .45, .09); T("sine", 380, 350, .6, .8, .08); break;
      case "croak": for (let i = 0; i < 2; i++) { T("square", 120, 100, i * .3, .2, .03); N("bandpass", 700, 3, i * .3, .2, .06); } break;
      case "meow": T("sawtooth", 560, 880, 0, .3, .03); T("sawtooth", 880, 480, .28, .35, .025); break;
      case "bark": for (let i = 0; i < 2; i++) { T("square", 300, 190, i * .22, .12, .05); N("bandpass", 900, 1, i * .22, .1, .12); } break;
      case "bleat": T("sine", 950, 720, 0, .45, .05, 6); break;
      case "yip": T("sine", 1200, 800, 0, .12, .06); T("sine", 1150, 750, .18, .14, .05); break;
      case "squeak": T("sine", 2600, 3300, 0, .09, .04); break;
      case "whistle": T("sine", 2900, 2800, 0, .4, .05); break;
      case "rattle": for (let i = 0; i < 12; i++) N("bandpass", 3200, 6, i * .035, .03, .25); break;
      case "click": for (let i = 0; i < 3; i++) N("highpass", 3500, 1, i * .07, .02, .2); break;
      case "splash": N("bandpass", 1500, .8, 0, .45, .35); N("highpass", 3000, .5, .05, .3, .15); break;
      case "whale": T("sine", 180, 420, 0, 2.6, .12); T("sine", 400, 240, 2.2, 2.4, .09); break;
      case "thunder": setTimeout(() => this.on && N("lowpass", 120, .5, 0, 5, 1.6), rr(300, 2000)); break;
      case "rustle": N("highpass", 2800, .5, 0, .6, .22); N("highpass", 4000, .5, .15, .5, .15); break;
      case "boing": T("sine", 260, 620, 0, .35, .12); break;
      case "knock": N("lowpass", 500, 1, 0, .1, .7); N("lowpass", 500, 1, .18, .1, .6); break;
      case "bell": for (const [f, a] of [[880, .08], [1320, .05], [2090, .03], [2640, .02]]) T("sine", f, f, 0, 3, a); break;
      case "echo": for (let i = 0; i < 4; i++) T("sine", mtof(76 + PENTA[i]), mtof(76 + PENTA[i]), i * .5, 1.2, .07 * .6 ** i); break;
      case "wave": N("lowpass", 700, .5, 0, 1.4, .5); break;
      case "chime": { const r = 72 + [0, 2, -3, -5][this.season || 0]; for (let i = 0; i < 3; i++) { const f = mtof(r + PENTA[R() * 5 | 0] + 12 * (R() < .3)); T("sine", f, f, i * rr(.15, .4), 2.5, .04); } break; }
      case "alarm": for (let i = 0; i < 3; i++) T("sine", mtof([79, 83, 86][i]), mtof([79, 83, 86][i]), i * .18, 1.4, .12); break;
    }
    setTimeout(() => o.disconnect(), 8000);
  }

  update(st, scene) {
    if (!this.on || !st) return;
    const b = this.b, bd = BEDS[scene] || BEDS.meadow, T = this.T, dt = st.dt, rain = st.rain * (1 - st.snow * .85), t = st.t;
    this.season = st.si;
    if (!this.bt || t - this.bt > .25) {
      this.bt = t;
      this.set(this.master.gain, this.muted ? 0 : this.vol * .9, .4);
      this.set(b.rain.gain, rain * .55); this.set(b.rumble.gain, rain * .3 + st.storm * .2);
      this.set(b.wind.gain, (.03 + st.wind * .09) * (.5 + bd[0]) + st.snow * .03);
      this.set(b.waves.gain, bd[1] * (.12 + .18 * (Math.sin(t * .55) * .5 + .5)) * (1 + st.wind * .5), .3);
      this.set(b.city.gain, bd[2] * (.1 + .08 * st.light)); this.set(b.leaves.gain, bd[3] * .035 * (.4 + st.wind));
      this.set(b.water.gain, bd[4] * .1);
      this.set(this.padG.gain, .04 * (1 - rain * .4), 2); this.set(this.padF.frequency, 500 + st.light * 900, 3);
    }
    if ((T.chord -= dt) <= 0) { T.chord = rr(12, 20); const ch = CHORDS[st.si][R() * 4 | 0]; this.pad.forEach((o, i) => this.set(o.frequency, mtof(ch[i] - 12 * (i === 0)), 1.8)); }
    if ((T.chime -= dt) <= 0) { T.chime = rr(12, 35); this.call("chime", rr(-.6, .6), .8); }
    if (st.night > .6 && st.pal.fireflies > .3 && rain < .4 && (T.cricket -= dt) <= 0) { T.cricket = rr(.4, 1.6); const o = this.out(rr(-.8, .8), 1, .2), f = rr(4200, 4800); for (let i = 0; i < 3; i++) this.tone(o, "sine", f, f, i * .07, .05, .012 * st.pal.fireflies); }
    if (rain > .05 && (T.drop -= dt) <= 0) { T.drop = rr(.05, .5) / (rain + .2); const o = this.out(rr(-1, 1), 1, .6); this.tone(o, "sine", rr(1200, 3200), 800, 0, .08, .02 * rain); }
  }
}
window.Ambience = Ambience;
})();
