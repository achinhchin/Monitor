(() => {
const R = Math.random, TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const rng = (s) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const cv = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0); return c; };
const U = (window.U = { R, TAU, lerp, clamp, sstep, hex, mix, css, rng, cv, rr: (a, b) => a + R() * (b - a), pick: (a) => a[(R() * a.length) | 0] });

const P = (o) => { for (const k in o) if (typeof o[k] === "string") o[k] = hex(o[k]); return o; };
// colors + weights that drive particles/creatures; crossfaded between seasons
const SEASONS = [
  P({ g1: "#b4e08a", g2: "#8ccb68", g3: "#5a9a52", far: "#98b9df", l1: "#ffc9dc", l2: "#9fd46e", l3: "#5f9f55", pine: "#3f7d5a", trunk: "#735446", fl1: "#fff39a", fl2: "#ffc3da", water: "#78b6dc", rock: "#8a93a8", snow: 0, bare: 0, petals: 1, leaves: 0, fireflies: .25, pollen: .3, flowers: 1, bloom: 1 }),
  P({ g1: "#94d46a", g2: "#62b04e", g3: "#3b8740", far: "#84a9d6", l1: "#86cd62", l2: "#5aa94b", l3: "#377b3c", pine: "#2f6f4c", trunk: "#654b3e", fl1: "#ffffff", fl2: "#ffe070", water: "#5aa7d8", rock: "#8790a3", snow: 0, bare: 0, petals: 0, leaves: 0, fireflies: 1, pollen: .8, flowers: .7, bloom: 0 }),
  P({ g1: "#dcc476", g2: "#bda65a", g3: "#877a45", far: "#b4a7c8", l1: "#f3a64c", l2: "#e2793e", l3: "#b24e38", pine: "#46745a", trunk: "#654638", fl1: "#f6d37a", fl2: "#ea8d5c", water: "#7a9dc6", rock: "#8e8c9c", snow: 0, bare: .15, petals: 0, leaves: 1, fireflies: .08, pollen: .1, flowers: .25, bloom: 0 }),
  P({ g1: "#f7f9fd", g2: "#e6edf6", g3: "#c2cedf", far: "#c7d3e7", l1: "#eef3f9", l2: "#dbe4ef", l3: "#8aa39d", pine: "#4f7468", trunk: "#6a5f6c", fl1: "#ffffff", fl2: "#e4ecf7", water: "#98b1cf", rock: "#9aa1b3", snow: 1, bare: 1, petals: 0, leaves: 0, fireflies: 0, pollen: 0, flowers: 0, bloom: 0 }),
];
const lerpPal = (a, b, t) => { const o = {}; for (const k in a) o[k] = Array.isArray(a[k]) ? mix(a[k], b[k], t) : lerp(a[k], b[k], t); return o; };
// [hour, top, mid, horizon] saturated Ghibli skies
const SKY = [[0, "#0b1230", "#172554", "#2d3f73"], [4.6, "#0f1838", "#22306a", "#3d4f86"], [5.5, "#28336d", "#6f6aa8", "#f0a8a8"], [6.4, "#4f86cf", "#f3b3a5", "#ffd7a0"], [8, "#3f8fdc", "#86c3ee", "#e3f2fa"], [12, "#2f86dc", "#74bff0", "#d8eefb"], [16, "#3f86d3", "#8cc2ea", "#f1e6d3"], [17.4, "#4e6fc0", "#e79e9e", "#ffc98a"], [18.3, "#2f3b80", "#9a6aa6", "#f28f7a"], [19.2, "#172155", "#2f3a78", "#56507e"], [24, "#0b1230", "#172554", "#2d3f73"]].map(([h, ...c]) => [h, c.map(hex)]);
const NIGHT = hex("#1a2246"), WARM = hex("#ffb070"), GREY = hex("#8d97ab"), WHITE = [255, 255, 255];

class World {
  constructor(canvas) {
    this.c = canvas; this.g = canvas.getContext("2d", { alpha: false });
    this.q = 1; this.t = 0; this.env = null; this.phase = null; this.pal = null;
    this.cloud = .3; this.rain = 0; this.storm = 0; this.memo = new Map();
    this.caches = [cv(1, 1), cv(1, 1), cv(1, 1), cv(1, 1)]; this.cur = 0; this.key = ""; this.builtAt = -1e9; this.fadeAt = -1e9;
    this.parts = []; this.ripples = []; this.bolt = 0; this.nextBolt = 6; this.ver = 0;
    this.onFlash = this.onSound = null; this.W = 0;
  }
  setScene(n) { if (n !== this.name && window.SCENES[n]) { this.name = n; this.scene = window.SCENES[n]; if (this.W) this.layout(); } }
  setEnv(e) { this.env = e; this.envAt = performance.now(); }
  setQuality(q) { this.q = q; this.size(); this.key = ""; this.builtAt = -1e9; }
  size() {
    this.s = Math.min(devicePixelRatio || 1, 1.5) * this.q;
    this.c.width = this.W * this.s | 0; this.c.height = this.H * this.s | 0;
  }
  layout() {
    this.W = this.c.clientWidth || innerWidth; this.H = this.c.clientHeight || innerHeight; this.k = Math.min(this.W, this.H) / 900;
    this.size(); const { W, H, k } = this;
    this.stars = cv(W, H * .7); const sg = this.stars.getContext("2d"); sg.fillStyle = "#fff";
    for (let i = 0; i < W * H / 3000; i++) { sg.globalAlpha = R() * .8 + .2; const r = R() * 1.3 + .3; sg.fillRect(R() * W, Math.pow(R(), 1.5) * H * .7, r, r); }
    this.twinkle = Array.from({ length: 30 }, () => ({ x: R() * W, y: R() * H * .5, p: R() * TAU }));
    const glow = (r, stops) => { const c = cv(r * 2, r * 2), g = c.getContext("2d"), gr = g.createRadialGradient(r, r, 0, r, r, r); stops.forEach(([o, s]) => gr.addColorStop(o, s)); g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return c; };
    const sr = 42 * k;
    this.sunS = [glow(sr * 8, [[0, "rgba(255,250,225,1)"], [.12, "rgba(255,246,210,1)"], [.14, "rgba(255,238,190,.55)"], [.4, "rgba(255,225,170,.16)"], [1, "rgba(255,220,160,0)"]]),
                 glow(sr * 8, [[0, "rgba(255,210,150,1)"], [.12, "rgba(255,190,120,1)"], [.14, "rgba(255,160,110,.6)"], [.45, "rgba(255,140,100,.2)"], [1, "rgba(255,120,90,0)"]])];
    this.moonS = glow(sr * 5, [[0, "rgba(210,220,255,.45)"], [.2, "rgba(190,200,255,.18)"], [1, "rgba(180,190,255,0)"]]);
    const md = this.moonD = cv(sr * 2.2, sr * 2.2), mg = md.getContext("2d"), mc = sr * 1.1;
    mg.fillStyle = "#f6f3ff"; mg.beginPath(); mg.arc(mc, mc, sr * .8, 0, TAU); mg.fill();
    mg.fillStyle = "rgba(180,180,215,.35)"; [[-.3, -.2, .2], [.2, .25, .13], [-.1, .38, .1]].forEach(([x, y, r]) => { mg.beginPath(); mg.arc(mc + x * sr, mc + y * sr, r * sr, 0, TAU); mg.fill(); });
    mg.globalCompositeOperation = "destination-out"; mg.beginPath(); mg.arc(mc + sr * .45, mc - sr * .2, sr * .74, 0, TAU); mg.fill();
    this.glowS = glow(32, [[0, "rgba(255,240,180,1)"], [.25, "rgba(255,230,160,.45)"], [1, "rgba(255,220,140,0)"]]);
    this.clouds = Array.from({ length: 14 }, (_, i) => this.makeCloud(i));
    this.seed = 1 + [...this.name].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) % 9999;
    this.scene.init(this, rng(this.seed));
    this.life && this.life.reset();
    this.key = ""; this.builtAt = -1e9; this.parts.length = 0;
  }
  // puffy cumulus: blue-grey belly, white sunlit crowns
  makeCloud(i) {
    const k = this.k, big = i % 3 === 0, w = (big ? U.rr(320, 520) : U.rr(160, 320)) * k, h = w * (big ? .5 : .32), pad = w * .42, c = cv(w + pad * 2, h + pad * 2), g = c.getContext("2d");
    const blobs = Array.from({ length: big ? 22 : 12 }, () => { const u = R(), top = Math.sin(u * Math.PI); return [pad + u * w, pad + h - (R() * .7 + .3) * top * h * .8, (R() * .14 + .16) * w * (.55 + top * .5)]; });
    const puff = (col, dy, sc) => { for (const [x, y, r] of blobs) { const gr = g.createRadialGradient(x, y + dy, 0, x, y + dy, r * sc); gr.addColorStop(0, col(1)); gr.addColorStop(.65, col(.85)); gr.addColorStop(1, col(0)); g.fillStyle = gr; g.fillRect(x - r * sc, y + dy - r * sc, r * sc * 2, r * sc * 2); } };
    puff((a) => `rgba(180,193,218,${a})`, 0, 1);
    puff((a) => `rgba(255,255,255,${a})`, -h * .12, .82);
    g.globalCompositeOperation = "source-atop"; const sh = g.createLinearGradient(0, pad, 0, pad + h); sh.addColorStop(.55, "rgba(150,165,200,0)"); sh.addColorStop(1, "rgba(150,165,200,.55)"); g.fillStyle = sh; g.fillRect(0, 0, c.width, c.height);
    return { base: c, spr: cv(c.width, c.height), x: R() * (this.W + c.width) - c.width, y: (big ? U.rr(.08, .3) : U.rr(.03, .38)) * this.H, v: U.rr(3, 9) * k * (big ? .6 : 1), th: i / 14 };
  }

  // lighting: depth mixes toward horizon haze, then golden hour, overcast, night
  shade(c, d = 0) {
    const s = this.st; let o = mix(c, s.sky[2], d * .6);
    o = mix(o, WARM, s.golden * .22); o = mix(o, GREY, s.cloud * .22 + s.rain * .1);
    return mix(o, NIGHT, s.night * .74);
  }
  col(c, d = 0, a = 1) { const key = c + "|" + d + "|" + a; let v = this.memo.get(key); if (!v) this.memo.set(key, (v = css(this.shade(c, d), a))); return v; }
  pc(name, d = 0, a = 1) { return this.col(this.pal[name], d, a); }
  hx(h, d = 0, a = 1) { return this.col(hex(h), d, a); }
  snd(name, x, v = 1) { this.onSound && this.onSound(name, clamp(x / this.W * 2 - 1, -1, 1), v); }

  state(now, dt) {
    const e = this.env, E = e.env, run = E.paused ? 0 : (now - this.envAt) * E.speed;
    const dl = E.dayMin * 6e4, nl = E.nightMin * 6e4, tm = (E.dayMs + run) % (dl + nl), tp = tm < dl ? .5 * tm / dl : .5 + .5 * (tm - dl) / nl;
    if (this.phase == null) this.phase = tp;
    const d = ((tp - this.phase + 1.5) % 1) - .5;
    this.phase = Math.abs(d) < .002 ? tp : (this.phase + d * Math.min(1, dt * 2) + 1) % 1;
    let si = e.season, sp = e.seasonProgress + (E.seasonLocked || E.paused ? 0 : run / (E.seasonMin[si] * 6e4));
    if (sp >= 1) { si = (si + 1) % 4; sp -= 1; }
    const blend = sstep(.92, 1, sp), target = lerpPal(SEASONS[si], SEASONS[(si + 1) % 4], blend);
    const w = e.weather, first = !this.pal;
    this.pal = first ? target : lerpPal(this.pal, target, Math.min(1, dt * 1.2));
    const ease = (v, to, r) => (first ? to : v + (to - v) * Math.min(1, dt * r));
    this.cloud = ease(this.cloud, w.cloud, .12); this.rain = ease(this.rain, w.intensity, .15); this.storm = ease(this.storm, w.state === "storm" ? 1 : 0, .2);
    const p = this.phase, day = p < .5, sunA = p / .5 * Math.PI, moonA = (p - .5) / .5 * Math.PI;
    const sunEl = day ? Math.sin(sunA) : -Math.sin(moonA), light = sstep(-.15, .35, sunEl), hour = (6 + p * 24) % 24;
    const kn = E.knobs, wind = kn.wind * (.7 + .3 * Math.sin(this.t * .09)) + this.storm * .6 + this.rain * .2;
    let i = 0; while (SKY[i + 1][0] <= hour) i++;
    const [h0, c0] = SKY[i], [h1, c1] = SKY[i + 1], f = (hour - h0) / (h1 - h0), night = 1 - light, cl = this.cloud;
    const over = mix(hex("#a3adbf"), hex("#20263f"), night);
    const sky = c0.map((c, j) => mix(mix(c, c1[j], f), over, cl * (.62 - j * .1)));
    return { t: this.t, dt, hour, day, p, sunA, moonA, light, night, golden: day ? (1 - sstep(.08, .5, Math.sin(sunA))) * light : 0,
      cloud: cl, rain: this.rain, storm: this.storm, snow: this.pal.snow, wind, sky, pal: this.pal, si, blend, kn, W: this.W, H: this.H, k: this.k };
  }

  build(now, st) {
    const key = [st.light * 40 | 0, st.golden * 24 | 0, st.cloud * 14 | 0, st.rain * 8 | 0, st.si, st.blend * 14 | 0, this.c.width, this.c.height, this.ver].join();
    if (key === this.key || now - this.builtAt < 350) return;
    const first = !this.key; this.key = key; this.builtAt = now; this.fadeAt = first ? -1e9 : now;
    this.memo.clear(); this.st = st; this.cur ^= 1;
    const [sky, land] = [this.caches[this.cur * 2], this.caches[this.cur * 2 + 1]], { W, H, s } = this;
    for (const c of [sky, land]) if (c.width !== this.c.width || c.height !== this.c.height) { c.width = this.c.width; c.height = this.c.height; }
    const g = sky.getContext("2d"); g.setTransform(s, 0, 0, s, 0, 0);
    const gr = g.createLinearGradient(0, 0, 0, H * .75); gr.addColorStop(0, css(st.sky[0])); gr.addColorStop(.55, css(st.sky[1])); gr.addColorStop(1, css(st.sky[2]));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const l = land.getContext("2d"); l.setTransform(1, 0, 0, 1, 0, 0); l.clearRect(0, 0, land.width, land.height); l.setTransform(s, 0, 0, s, 0, 0);
    this.scene.build(l, this, rng(this.seed), st);
    const fog = l.createLinearGradient(0, H * .45, 0, H); fog.addColorStop(0, css(st.sky[2], 0)); fog.addColorStop(1, css(st.sky[2], st.rain * .3 + st.cloud * .08));
    l.globalCompositeOperation = "source-atop"; l.fillStyle = fog; l.fillRect(0, H * .45, W, H * .55); l.globalCompositeOperation = "source-over";
    const tint = css(mix(mix(mix(WHITE, WARM, st.golden * .5), GREY, st.cloud * .5 + st.rain * .3), NIGHT, st.night * .8), .85);
    for (const c of this.clouds) { const cg = c.spr.getContext("2d"); cg.globalCompositeOperation = "copy"; cg.drawImage(c.base, 0, 0); cg.globalCompositeOperation = "source-atop"; cg.fillStyle = tint; cg.globalAlpha = .25 + st.night * .6 + st.cloud * .25; cg.fillRect(0, 0, c.spr.width, c.spr.height); cg.globalAlpha = 1; }
  }

  frame(now, dt) {
    if (!this.env || !this.scene) return null;
    if (this.c.clientWidth !== this.W || this.c.clientHeight !== this.H) this.layout();
    this.t += dt;
    const st = this.state(now, dt); this.build(now, st); this.st = Object.assign(this.st || {}, st);
    const { g, W, H, s } = this, f = clamp((now - this.fadeAt) / 800, 0, 1), A = this.cur, B = A ^ 1;
    const layer = (i) => { g.setTransform(1, 0, 0, 1, 0, 0); if (f < 1) { g.drawImage(this.caches[B * 2 + i], 0, 0); g.globalAlpha = f; } g.drawImage(this.caches[A * 2 + i], 0, 0); g.globalAlpha = 1; g.setTransform(s, 0, 0, s, 0, 0); };
    layer(0);
    const starA = st.night * (1 - st.cloud * .9);
    if (starA > .02) {
      g.globalAlpha = starA; g.drawImage(this.stars, 0, 0, W, H * .7); g.fillStyle = "#fff";
      for (const p of this.twinkle) { g.globalAlpha = starA * (.5 + .5 * Math.sin(st.t * 2 + p.p)); g.fillRect(p.x, p.y, 1.6, 1.6); }
      g.globalAlpha = 1;
    }
    const hz = H * (this.scene.horizon || .62), ax = (a) => W * (.08 + .84 * a / Math.PI), ay = (a) => hz - Math.sin(a) * hz * .85;
    const dim = 1 - st.cloud * .75;
    if (st.day) {
      const x = ax(st.sunA), y = ay(st.sunA), sz = this.sunS[0].width;
      g.globalAlpha = dim; g.drawImage(this.sunS[0], x - sz / 2, y - sz / 2);
      if (st.golden > .02) { g.globalAlpha = dim * st.golden; g.drawImage(this.sunS[1], x - sz / 2, y - sz / 2); }
      this.body = { x, y };
    } else {
      const x = ax(st.moonA), y = ay(st.moonA);
      g.globalAlpha = dim; g.drawImage(this.moonS, x - this.moonS.width / 2, y - this.moonS.height / 2); g.drawImage(this.moonD, x - this.moonD.width / 2, y - this.moonD.height / 2);
      this.body = { x, y };
    }
    g.globalAlpha = 1;
    for (const c of this.clouds) {
      c.x += c.v * dt * (.4 + st.wind);
      if (c.x > W + 20) { c.x = -c.spr.width; c.y = U.rr(.03, .36) * H; }
      const a = clamp((st.cloud - c.th * .9) * 3.5, 0, 1) * .95;
      if (a > .01) { g.globalAlpha = a; g.drawImage(c.spr, c.x, c.y, c.spr.width, c.spr.height); }
    }
    g.globalAlpha = 1;
    layer(1);
    this.scene.fg(g, this, st);
    this.life && this.life.frame(g, st);
    this.scene.front && this.scene.front(g, this, st);
    this.particles(g, st);
    this.lightning(g, st, dt);
    return st;
  }

  lightning(g, st, dt) {
    if ((this.nextBolt -= dt) < 0) {
      this.nextBolt = U.rr(6, 22);
      if (st.storm > .5 && st.snow < .5) {
        this.bolt = .25; this.onFlash && this.onFlash(1);
        const x = U.rr(.1, .9) * this.W, pts = [[x, 0]]; let y = 0, cx = x;
        while (y < this.H * .55) { y += U.rr(15, 45) * this.k; cx += U.rr(-30, 30) * this.k; pts.push([cx, y]); }
        this.boltPts = pts; this.snd("thunder", x, 1);
      }
    }
    if (this.bolt > 0) {
      this.bolt -= dt; g.strokeStyle = `rgba(245,240,255,${this.bolt * 4})`; g.lineWidth = 2.5 * this.k;
      g.beginPath(); this.boltPts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    }
  }

  // seasonal + weather particles, batched per kind
  particles(g, st) {
    const { W, H, k, parts, pal } = this, dt = st.dt, q = this.q, sc = this.scene;
    const rate = { rain: st.rain * (1 - st.snow) * 900 * q, snow: (st.rain * 300 + (st.snow > .5 ? 25 : 0)) * st.snow * q, petal: pal.petals * 5 * (.4 + st.wind), leaf: pal.leaves * 5 * (.4 + st.wind),
      fly: sc.fireflies ? pal.fireflies * st.night * 3 * (1 - st.rain) : 0, pollen: pal.pollen * st.light * 2.5 * (1 - st.rain) };
    for (const kd in rate) { let n = rate[kd] * dt; while (n > 0 && parts.length < 1400) { if (R() < n) parts.push(this.spawn(kd)); n--; } }
    const rp = new Path2D(), sp = new Path2D(), lean = st.wind * .35, gy = sc.floor || H;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life += dt;
      if (p.k === "rain") {
        p.x += p.v * lean * dt; p.y += p.v * dt;
        if (p.y > p.fl) { if (R() < .3) this.ripples.push({ x: p.x, y: p.fl, r: 1, a: .45 }); parts.splice(i, 1); continue; }
        rp.moveTo(p.x, p.y); rp.lineTo(p.x - p.l * lean, p.y - p.l);
      } else if (p.k === "snow") {
        p.x += (Math.sin(p.life * p.f + p.ph) * 14 + st.wind * 40) * dt * k; p.y += p.v * dt;
        if (p.y > p.fl) { parts.splice(i, 1); continue; }
        sp.moveTo(p.x + p.r, p.y); sp.arc(p.x, p.y, p.r, 0, TAU);
      } else if (p.k === "fly" || p.k === "pollen") {
        p.x += Math.cos(p.life * .7 + p.ph) * 12 * dt + (p.k === "pollen" ? st.wind * 16 * dt : 0); p.y += Math.sin(p.life * .9 + p.ph * 2) * 9 * dt;
        if (p.life > p.max) { parts.splice(i, 1); continue; }
        const a = Math.sin(Math.PI * p.life / p.max);
        if (p.k === "fly") { const s = 24 * k; g.globalAlpha = a * (.5 + .5 * Math.sin(p.life * 3 + p.ph)) * st.night; g.drawImage(this.glowS, p.x - s / 2, p.y - s / 2, s, s); }
        else { g.globalAlpha = a * .7 * st.light; g.fillStyle = "#fffbe8"; g.fillRect(p.x, p.y, 2.2 * k, 2.2 * k); }
        g.globalAlpha = 1;
      } else {
        p.x += (st.wind * 60 + Math.sin(p.life * p.f + p.ph) * 25) * dt * k; p.y += p.v * dt; p.rot += p.vr * dt;
        if (p.y > gy + 20 || p.x > W + 40 || p.life > 30) { parts.splice(i, 1); continue; }
        const cs = Math.cos(p.rot), sn = Math.sin(p.rot), fl = Math.sin(p.life * p.f * 1.3 + p.ph) * .8 + .2;
        g.setTransform(this.s * cs, this.s * sn, -this.s * sn * fl, this.s * cs * fl, p.x * this.s, p.y * this.s);
        g.fillStyle = p.c; g.beginPath(); g.ellipse(0, 0, p.r, p.r * .55, 0, 0, TAU); g.fill();
      }
    }
    g.setTransform(this.s, 0, 0, this.s, 0, 0);
    if (st.rain > .01 && st.snow < 1) { g.strokeStyle = this.hx("#e2e6ff", 0, .35); g.lineWidth = k; g.stroke(rp); }
    g.fillStyle = "rgba(255,255,255,.88)"; g.fill(sp);
    g.strokeStyle = "rgba(255,255,255,.45)"; g.lineWidth = k;
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i]; r.r += dt * 20; r.a -= dt * .9;
      if (r.a <= 0) { this.ripples.splice(i, 1); continue; }
      g.globalAlpha = r.a; g.beginPath(); g.ellipse(r.x, r.y, r.r * k, r.r * .3 * k, 0, 0, TAU); g.stroke();
    }
    g.globalAlpha = 1;
  }
  spawn(kd, x, y) {
    const { W, H, k } = this, q = { k: kd, life: 0, ph: R() * TAU }, fl = this.scene.floor || H;
    switch (kd) {
      case "rain": return Object.assign(q, { x: U.rr(-W * .2, W), y: U.rr(-60, -10), v: U.rr(750, 1050) * k, l: U.rr(12, 24) * k, fl: U.rr(H * .55, H) });
      case "snow": return Object.assign(q, { x: U.rr(-W * .2, W), y: -8, v: U.rr(25, 70) * k, r: U.rr(1, 3.2) * k, f: U.rr(.5, 1.5), fl: U.rr(H * .6, H) });
      case "fly": return Object.assign(q, { x: x ?? R() * W, y: y ?? U.rr(H * .55, fl), max: U.rr(5, 11) });
      case "pollen": return Object.assign(q, { x: x ?? R() * W, y: y ?? U.rr(H * .3, fl), max: U.rr(5, 10) });
      default: {
        const e = this.scene.emit && this.scene.emit(this), pal = this.pal, cols = kd === "petal" ? [mix(pal.l1, WHITE, .3), pal.l1] : [pal.l1, pal.l2, pal.l3];
        return Object.assign(q, { x: x ?? (e ? e[0] + U.rr(-40, 40) * k : R() * W), y: y ?? (e ? e[1] : -10), v: U.rr(18, 42) * k, r: U.rr(3, 6) * k, f: U.rr(1, 2.5), rot: R() * TAU, vr: U.rr(-2, 2), c: this.col(U.pick(cols)) });
      }
    }
  }
  burst(kind, x, y, n) { for (let i = 0; i < n; i++) this.parts.push(this.spawn(kind, x + U.rr(-30, 30) * this.k, y + U.rr(-20, 10) * this.k)); }
  ripple(x, y, n = 3) { for (let i = 0; i < n; i++) this.ripples.push({ x, y, r: 1 + i * 6, a: .7 - i * .15 }); }

  tap(x, y) {
    if (this.life && this.life.tap(x, y)) return;
    if (this.scene.tap && this.scene.tap(this, x, y)) return;
    const st = this.st, pal = this.pal;
    this.life && this.life.startle(x, y, 160 * this.k);
    const kind = st.night > .6 && this.scene.fireflies && pal.fireflies > .2 ? "fly" : pal.petals > .5 ? "petal" : pal.leaves > .5 ? "leaf" : pal.snow > .5 ? "snow" : "pollen";
    this.burst(kind, x, y, 6 + (R() * 6 | 0)); this.ripple(x, y, 2); this.snd(U.pick(["chime", "rustle", "chime"]), x, .6);
  }
}

// ── shared drawing helpers used by scenes ──
Object.assign(World.prototype, {
  ridge(rnd, base, amp, sharp = 0, step = 6) {
    const W = this.W, f = [1 + rnd() * 1.5, 3 + rnd() * 2, 7 + rnd() * 6, 15 + rnd() * 10], ph = f.map(() => rnd() * TAU), ys = new Float32Array(Math.ceil(W / step) + 2);
    for (let i = 0; i < ys.length; i++) {
      const u = i * step / W * TAU; let v = Math.sin(u * f[0] + ph[0]) * .55 + Math.sin(u * f[1] + ph[1]) * .25 + Math.sin(u * f[2] + ph[2]) * .12 + Math.sin(u * f[3] + ph[3]) * .06;
      if (sharp) v = lerp(v, 1 - Math.abs(Math.sin(u * f[1] * .5 + ph[1])) * 2, sharp);
      ys[i] = base - amp * v;
    }
    ys.step = step; return ys;
  },
  ry(ys, x) { const i = clamp(x / ys.step, 0, ys.length - 1.001), j = i | 0; return lerp(ys[j], ys[j + 1], i - j); },
  fillRidge(g, ys, fill, bottom = this.H) { g.fillStyle = fill; g.beginPath(); g.moveTo(0, bottom); for (let i = 0; i < ys.length; i++) g.lineTo(i * ys.step, ys[i]); g.lineTo(this.W, bottom); g.fill(); },
  vgrad(g, y0, y1, c0, c1) { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; },
  // Ghibli tree: clumped canopy with shadow/mid/light passes; bare branches + snow blend in by season
  tree(g, x, y, sz, type, d = 0, sw = 0, seed = x) {
    const r = rng(seed * 997 | 0), P = this.pal, bare = type === "pine" || type === "palm" ? 0 : P.bare;
    if (type === "pine") {
      const h = sz * 1.3, w = sz * .42; g.fillStyle = this.pc("trunk", d); g.fillRect(x - sz * .03, y - h * .15, sz * .06, h * .15);
      for (let i = 0; i < 4; i++) {
        const t = i / 4, yb = y - h * (.12 + t * .62), yt = yb - h * .36, ww = w * (1 - t * .55), ox = sw * (t + .3);
        g.fillStyle = this.pc("pine", d); g.beginPath(); g.moveTo(x - ww + ox * .5, yb); g.quadraticCurveTo(x - ww * .3 + ox, yb - h * .08, x + ox, yt); g.lineTo(x + ww + ox * .5, yb); g.quadraticCurveTo(x, yb + h * .04, x - ww + ox * .5, yb); g.fill();
        g.fillStyle = this.col(mix(P.pine, [255, 245, 200], .22), d); g.beginPath(); g.moveTo(x - ww + ox * .5, yb); g.quadraticCurveTo(x - ww * .3 + ox, yb - h * .08, x + ox, yt); g.lineTo(x + ox * .7 - ww * .1, yb); g.fill();
        if (P.snow > .05) { g.fillStyle = this.hx("#ffffff", d, P.snow); g.beginPath(); g.moveTo(x - ww * .55 + ox * .7, yt + h * .14); g.lineTo(x + ox, yt); g.lineTo(x + ww * .55 + ox * .7, yt + h * .14); g.quadraticCurveTo(x + ox * .8, yt + h * .1, x - ww * .55 + ox * .7, yt + h * .14); g.fill(); }
      }
      return;
    }
    if (type === "palm") {
      const h = sz * 1.5, tx = x + h * .18 + sw * 2, ty = y - h;
      g.strokeStyle = this.hx("#8b6a4e", d); g.lineWidth = sz * .07; g.lineCap = "round"; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + h * .02, y - h * .6, tx, ty); g.stroke();
      g.lineWidth = sz * .025;
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (i - 3.5) * .42 + Math.sin(this.t * 1.3 + i) * .04 * (1 + sw), L = sz * (.55 + r() * .2), ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * .5 + L * .35;
        g.strokeStyle = this.col(i % 2 ? P.l3 : mix(P.l2, [90, 170, 90], .5), d); g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo((tx + ex) / 2, ty + Math.sin(a) * L * .6 - L * .15, ex, ey); g.stroke();
      }
      return;
    }
    const h = sz * (type === "poplar" ? 1.4 : 1), cr = sz * (type === "poplar" ? .3 : .45), cy = y - h * .62;
    g.fillStyle = this.pc("trunk", d); g.beginPath(); g.moveTo(x - sz * .06, y); g.quadraticCurveTo(x - sz * .02, y - h * .4, x - sz * .025 + sw * .5, cy); g.lineTo(x + sz * .025 + sw * .5, cy); g.quadraticCurveTo(x + sz * .02, y - h * .4, x + sz * .06, y); g.fill();
    if (bare > .02) {
      g.strokeStyle = this.pc("trunk", d, bare); g.lineCap = "round";
      const br = (bx, by, a, l, w, n) => { if (n < 0) return; const ex = bx + Math.cos(a) * l + sw * (3 - n) * .3, ey = by + Math.sin(a) * l; g.lineWidth = w; g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke(); br(ex, ey, a - .4 - r() * .3, l * .7, w * .65, n - 1); br(ex, ey, a + .35 + r() * .3, l * .68, w * .65, n - 1); };
      br(x + sw * .5, cy + cr * .3, -Math.PI / 2, cr * .7, sz * .035, 3);
      if (P.snow > .05) { g.fillStyle = this.hx("#ffffff", d, P.snow * .85); g.beginPath(); g.ellipse(x + sw * .5, cy - cr * .25, cr * .55, cr * .12, 0, 0, TAU); g.fill(); }
    }
    const ca = 1 - bare * .96; if (ca < .03) return;
    const n = type === "poplar" ? 9 : 11, bl = [];
    for (let i = 0; i < n; i++) { const a = r() * TAU, rr2 = Math.sqrt(r()); bl.push([Math.cos(a) * rr2 * cr * (type === "poplar" ? .5 : 1), Math.sin(a) * rr2 * cr * (type === "poplar" ? 1.6 : .7), cr * (.35 + r() * .3)]); }
    const bloom = type === "bloom" || (type === "round" && (seed % 3 < 1) && P.bloom > .3);
    const [c1, c2, c3] = bloom ? [mix(P.l1, [255, 255, 255], .3), P.l1, mix(P.l1, P.l3, .45)] : [mix(P.l2, [255, 250, 200], .25), P.l2, P.l3];
    g.globalAlpha = ca;
    const pass = (col, ox, oy, sc) => { g.fillStyle = this.col(col, d); g.beginPath(); for (const [bx, by, br2] of bl) { const s2 = (1 - (by / cr + 1) * .5) * sw; g.moveTo(x + bx + ox + s2 + br2 * sc, cy + by + oy); g.arc(x + bx + ox + s2, cy + by + oy, br2 * sc, 0, TAU); } g.fill(); };
    pass(c3, cr * .06, cr * .1, 1); pass(c2, -cr * .02, -cr * .04, .86); pass(c1, -cr * .12, -cr * .16, .5);
    g.globalAlpha = 1;
  },
  house(g, x, y, w, h, wall, roof, d = 0, lit = 0, r = R) {
    g.fillStyle = this.hx(wall, d); g.fillRect(x, y - h, w, h);
    g.fillStyle = this.col(mix(hex(wall), [60, 50, 80], .18), d); g.fillRect(x + w * .72, y - h, w * .28, h);
    g.fillStyle = this.hx(roof, d); g.beginPath(); g.moveTo(x - w * .08, y - h); g.lineTo(x + w * .5, y - h - w * .42); g.lineTo(x + w * 1.08, y - h); g.fill();
    if (this.pal.snow > .05) { g.fillStyle = this.hx("#ffffff", d, this.pal.snow * .9); g.beginPath(); g.moveTo(x - w * .02, y - h - w * .04); g.lineTo(x + w * .5, y - h - w * .42); g.lineTo(x + w * 1.02, y - h - w * .04); g.lineTo(x + w * .5, y - h - w * .3); g.fill(); }
    const win = (wx, wy, on) => { g.fillStyle = on ? `rgba(255,214,130,${.35 + lit * .65})` : this.hx("#4a5a78", d); g.fillRect(wx, wy, w * .16, h * .22); };
    win(x + w * .18, y - h * .7, r() < .6 && lit > .1); win(x + w * .5, y - h * .7, r() < .5 && lit > .1);
  },
});
window.World = World;
})();
