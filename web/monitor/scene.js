(() => {
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const R = Math.random, rr = (a, b) => a + R() * (b - a), TAU = Math.PI * 2;

// [hour, top, mid, horizon]
const SKY = [[0, "#1b1a36", "#2b2852", "#463f6e"], [4.8, "#1f1d3d", "#39335f", "#5a4d7c"], [5.6, "#34335f", "#7a68a0", "#e9a9bb"], [6.6, "#8a9ed6", "#f2b9c9", "#ffd8b4"], [9, "#9ccaf0", "#c4e0f6", "#f4e8f1"], [12, "#8dc4ef", "#bde0f7", "#ebf4fb"], [16, "#a2c2ee", "#d3d5f3", "#f9e2dc"], [17.6, "#7473bb", "#e59cb7", "#ffc7a2"], [18.6, "#433d72", "#8a64a0", "#e28fa6"], [19.6, "#25234a", "#3d3566", "#5e4a78"], [24, "#1b1a36", "#2b2852", "#463f6e"]]
  .map(([h, ...c]) => [h, c.map(hex)]);

const P = (o) => { for (const k in o) if (typeof o[k] === "string") o[k] = hex(o[k]); return o; };
const PAL = [
  P({ far: "#c9cfe8", mid: "#bfdcc4", near: "#a6d4ae", f0: "#ffc4d8", f1: "#ffdce8", f2: "#f5a6c3", pine: "#86bfa0", trunk: "#8a6a7a", water: "#a9cde0", tint: "#ffd6e6", bare: 0, snow: 0, petals: 1, leaves: 0, fireflies: .25, pollen: .35, snowfall: 0, wind: .1 }),
  P({ far: "#b9d0ea", mid: "#a6d8b8", near: "#86c89f", f0: "#8fd3a4", f1: "#b2e5bd", f2: "#6fbf8f", pine: "#6fb08e", trunk: "#7b6a5c", water: "#9fd0e6", tint: "#fff1c9", bare: 0, snow: 0, petals: 0, leaves: 0, fireflies: 1, pollen: .7, snowfall: 0, wind: 0 }),
  P({ far: "#d8c8dc", mid: "#efcaa8", near: "#e2ae8e", f0: "#f4a46e", f1: "#f8cc86", f2: "#e5807a", pine: "#7aa58e", trunk: "#7a5a55", water: "#b8c4dc", tint: "#ffd2b0", bare: .12, snow: 0, petals: 0, leaves: 1, fireflies: .1, pollen: 0, snowfall: 0, wind: .35 }),
  P({ far: "#d7deee", mid: "#e6ebf5", near: "#f3f5fb", f0: "#e9eef7", f1: "#ffffff", f2: "#d8e0ee", pine: "#7e9fa0", trunk: "#8a8398", water: "#b9c6dd", tint: "#dfe8ff", bare: 1, snow: 1, petals: 0, leaves: 0, fireflies: 0, pollen: 0, snowfall: .6, wind: .45 }),
];
const lerpPal = (a, b, t) => { const o = {}; for (const k in a) o[k] = Array.isArray(a[k]) ? mix(a[k], b[k], t) : lerp(a[k], b[k], t); return o; };
const NIGHT = hex("#26244a"), STORM = hex("#6d6f86"), WHITE = [255, 255, 255];

class Scene {
  constructor(canvas) {
    this.c = canvas; this.x = canvas.getContext("2d");
    this.cloudLayer = document.createElement("canvas"); this.cx = this.cloudLayer.getContext("2d");
    this.env = null; this.envAt = 0; this.phase = null; this.seasonF = null;
    this.pal = null; this.rain = 0; this.t = 0; this.flash = 0; this.nextBolt = 8; this.onThunder = null;
    this.parts = []; this.ripples = []; this.wind = 0;
    this.glow = this.sprite(64, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, "rgba(240,255,190,1)"); r.addColorStop(.2, "rgba(220,255,170,.5)"); r.addColorStop(1, "rgba(200,255,150,0)"); g.fillStyle = r; g.fillRect(0, 0, s, s); });
    this.grain = this.sprite(200, (g, s) => { const d = g.createImageData(s, s); for (let i = 0; i < d.data.length; i += 4) { const v = R() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; } g.putImageData(d, 0, 0); });
    this.resize();
  }
  sprite(s, fn, h = s) { const c = document.createElement("canvas"); c.width = s; c.height = h; fn(c.getContext("2d"), s, h); return c; }

  resize() {
    const s = Math.min(devicePixelRatio || 1, 1.5), W = this.c.clientWidth || innerWidth, H = this.c.clientHeight || innerHeight;
    Object.assign(this, { W, H, s, lakeY: H * .8 });
    for (const c of [this.c, this.cloudLayer]) { c.width = W * s | 0; c.height = H * s | 0; }
    const hill = (base, amp) => { const f = [rr(1, 2), rr(3, 5), rr(8, 13)], p = [rr(0, TAU), rr(0, TAU), rr(0, TAU)], ys = new Float32Array(Math.ceil(W / 6) + 2);
      for (let i = 0; i < ys.length; i++) { const u = i * 6 / W * TAU; ys[i] = H * (base + amp * (Math.sin(u * f[0] + p[0]) * .6 + Math.sin(u * f[1] + p[1]) * .3 + Math.sin(u * f[2] + p[2]) * .1)); }
      return ys; };
    this.hills = [hill(.56, .07), hill(.66, .045), hill(.75, .025)];
    const k = H / 900;
    this.trees = Array.from({ length: Math.ceil(W / 48) }, () => {
      const x = rr(-30, W + 30), sc = rr(.55, 1.2) * k, pine = R() < .35;
      return { x, sc, pine, y: this.hy(2, x) + rr(3, 12) * k, ph: R() * TAU,
        blobs: Array.from({ length: 6 }, () => ({ dx: rr(-22, 22), dy: rr(-18, 14), r: rr(14, 24), c: R() * 3 | 0 })),
        br: Array.from({ length: 5 }, (_, i) => ({ a: -Math.PI / 2 + (i - 2) * .45 + rr(-.2, .2), l: rr(18, 34), y: rr(.35, .9) })) };
    }).sort((a, b) => a.sc - b.sc);
    this.stars = Array.from({ length: Math.round(W * H / 5500) }, () => ({ x: R() * W, y: R() * H * .6, r: rr(.4, 1.4), ph: R() * TAU, sp: rr(.5, 2) }));
    this.clouds = Array.from({ length: 8 }, () => this.makeCloud(R() * W));
    this.shimmer = Array.from({ length: 90 }, () => ({ x: R() * W, y: rr(this.lakeY + 4, H), l: rr(10, 60), ph: R() * TAU }));
    this.mist = this.sprite(W, (g, w, h) => { for (let i = 0; i < 16; i++) { const x = R() * w, y = h * rr(.4, .6), rx = rr(120, 320), ry = rr(30, 50); for (const o of [-w, 0, w]) this.puff(g, x + o, y, ry, rx / ry, .8); } }, H * .3 | 0);
    const mr = Math.min(W, H) * .045;
    this.moon = this.sprite(mr * 2 + 4 | 0, (g, sz) => { const c = sz / 2; g.fillStyle = "#f4f1ff"; g.beginPath(); g.arc(c, c, mr, 0, TAU); g.fill(); g.fillStyle = "rgba(190,185,220,.35)"; [[-.3, -.2, .18], [.2, .25, .12], [-.1, .35, .09]].forEach(([dx, dy, r]) => { g.beginPath(); g.arc(c + dx * mr, c + dy * mr, r * mr, 0, TAU); g.fill(); }); g.globalCompositeOperation = "destination-out"; g.fillStyle = "rgba(0,0,0,.93)"; g.beginPath(); g.arc(c + mr * .55, c - mr * .25, mr * .92, 0, TAU); g.fill(); });
    this.vig = this.sprite(W, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * .35, w / 2, h / 2, Math.max(w, h) * .75); r.addColorStop(0, "rgba(20,15,40,0)"); r.addColorStop(1, "rgba(20,15,40,.45)"); g.fillStyle = r; g.fillRect(0, 0, w, h); }, H);
    this.grainPat = this.x.createPattern(this.grain, "repeat");
  }
  makeCloud(x) {
    const k = this.H / 900, w = rr(180, 380) * k, h = w * .45, pad = w * .45;
    const spr = this.sprite(w + pad * 2 | 0, (g, sw, sh) => {
      for (let i = 0; i < 14; i++) { const u = i / 13, r = rr(.2, .34) * w * (.55 + Math.sin(u * Math.PI) * .6); this.puff(g, pad + u * w, sh - pad * .8 - r * .3 - Math.sin(u * Math.PI) * h * rr(.2, .5), r, 1.2, .75); } }, h + pad * 2 | 0);
    return { x, y: rr(.05, .38) * this.H, spr, v: rr(4, 12) * k, a: rr(.55, .95) };
  }
  puff(g, x, y, r, sx = 1, a = 1) { // soft radial blob, no ctx.filter (Safari)
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(.55, `rgba(255,255,255,${a * .6})`); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.save(); g.translate(x, y); g.scale(sx, 1); g.fillStyle = gr; g.fillRect(-r, -r, r * 2, r * 2); g.restore();
  }
  hy(i, x) { const ys = this.hills[i]; return ys[clamp(Math.round(x / 6), 0, ys.length - 1)]; }

  setEnv(e) { this.env = e; this.envAt = performance.now(); }

  frame(now, dt) {
    const e = this.env; if (!e) return null;
    if (this.c.clientWidth !== this.W || this.c.clientHeight !== this.H) this.resize();
    this.t += dt;
    const run = e.timePaused ? 0 : (now - this.envAt) * e.speed;
    const tp = ((e.dayMs + run) / e.dayLenMs) % 1;
    const sMs = e.seasonLocked ? e.seasonMs : e.seasonMs + run, sIdx = Math.floor(sMs / e.seasonLenMs) % 4, sProg = (sMs % e.seasonLenMs) / e.seasonLenMs;
    // ease visible time/season/rain toward server state so jumps animate
    if (this.phase == null) this.phase = tp;
    const d = ((tp - this.phase + 1.5) % 1) - .5;
    this.phase = Math.abs(d) < .0015 ? tp : (this.phase + d * Math.min(1, dt * 2.2) + 1) % 1;
    const target = lerpPal(PAL[sIdx], PAL[(sIdx + 1) % 4], sstep(.93, 1, sProg));
    if (!this.pal) this.rain = e.raining ? e.intensity : 0;
    this.pal = this.pal ? lerpPal(this.pal, target, Math.min(1, dt * 1.2)) : target;
    this.rain = lerp(this.rain, e.raining ? e.intensity : 0, Math.min(1, dt * .35));
    this.wind = .25 + .25 * Math.sin(this.t * .07) + .15 * Math.sin(this.t * .23) + this.pal.wind + this.rain * .5;

    const p = this.phase, hour = (6 + p * 24) % 24, day = p < .5;
    const sunA = (p / .5) * Math.PI, moonA = ((p - .5) / .5) * Math.PI;
    const sunEl = day ? Math.sin(sunA) : -Math.sin(moonA);
    const light = sstep(-.12, .3, sunEl), night = 1 - light;
    const st = { hour, day, light, night, rain: this.rain, snow: this.pal.snow, wind: this.wind, pal: this.pal, season: sIdx, flash: this.flash };
    this.draw(st, sunA, moonA, dt);
    return st;
  }

  draw(st, sunA, moonA, dt) {
    const { x: g, W, H, lakeY, pal } = this, { night, light, rain } = st, t = this.t;
    g.setTransform(this.s, 0, 0, this.s, 0, 0);

    let i = 0; while (SKY[i + 1][0] <= st.hour) i++;
    const [h0, c0] = SKY[i], [h1, c1] = SKY[i + 1], k = (st.hour - h0) / (h1 - h0);
    const sky = c0.map((c, j) => mix(mix(mix(c, c1[j], k), pal.tint, .1), STORM, rain * (.45 - j * .08)));
    const shade = (c) => mix(mix(mix(c, sky[2], .12), NIGHT, night * .66), STORM, rain * .22);

    const sg = g.createLinearGradient(0, 0, 0, lakeY);
    sg.addColorStop(0, css(sky[0])); sg.addColorStop(.6, css(sky[1])); sg.addColorStop(1, css(sky[2]));
    g.fillStyle = sg; g.fillRect(0, 0, W, lakeY + 2);

    if (night > .05) {
      g.fillStyle = "#fff";
      for (const s of this.stars) { g.globalAlpha = night * (1 - rain * .85) * (.45 + .55 * Math.sin(t * s.sp + s.ph)) * (1 - s.y / H); g.fillRect(s.x, s.y, s.r, s.r); }
      g.globalAlpha = 1;
    }

    const arcY = (a) => lakeY - Math.sin(a) * lakeY * .82, arcX = (a) => W * (.06 + .88 * (a / Math.PI));
    const R0 = Math.min(W, H) * .045, dim = 1 - rain * .75;
    const body = st.day ? { x: arcX(sunA), y: arcY(sunA), c: mix(hex("#fff3d6"), hex("#ffb38a"), 1 - sstep(0, .45, Math.sin(sunA))), glow: "255,214,170" }
                        : { x: arcX(moonA), y: arcY(moonA), c: hex("#f4f1ff"), glow: "200,200,255" };
    {
      const r = g.createRadialGradient(body.x, body.y, 0, body.x, body.y, R0 * (st.day ? 9 : 6));
      r.addColorStop(0, `rgba(${body.glow},${.55 * dim})`); r.addColorStop(1, `rgba(${body.glow},0)`);
      g.fillStyle = r; g.fillRect(0, 0, W, lakeY);
      g.globalAlpha = .35 + .65 * dim;
      if (st.day) { g.fillStyle = css(body.c); g.beginPath(); g.arc(body.x, body.y, R0, 0, TAU); g.fill(); }
      else g.drawImage(this.moon, body.x - this.moon.width / 2, body.y - this.moon.height / 2);
      g.globalAlpha = 1;
    }

    // clouds rendered on their own layer, then tinted in one pass
    const cx = this.cx; cx.setTransform(this.s, 0, 0, this.s, 0, 0); cx.clearRect(0, 0, W, H);
    for (const c of this.clouds) {
      c.x += c.v * dt * (1 + this.wind);
      if (c.x > W + 50) Object.assign(c, this.makeCloud(-c.spr.width));
      cx.globalAlpha = Math.min(1, c.a * (.55 + rain * .6)); cx.drawImage(c.spr, c.x, c.y);
    }
    cx.globalAlpha = 1; cx.globalCompositeOperation = "source-atop";
    cx.fillStyle = css(mix(mix(mix(WHITE, sky[2], .35), hex("#9a98b0"), rain * .7), hex("#35325a"), night * (.75 + rain * .15)), .75); cx.fillRect(0, 0, W, H);
    cx.globalCompositeOperation = "source-over";
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(this.cloudLayer, 0, 0); g.setTransform(this.s, 0, 0, this.s, 0, 0);

    const hillPath = (ys) => { g.beginPath(); g.moveTo(0, lakeY + 2); for (let j = 0; j < ys.length; j++) g.lineTo(j * 6, ys[j]); g.lineTo(W, lakeY + 2); g.closePath(); };
    const mistBand = (y, a) => { g.globalAlpha = a * (.3 + .7 * light); const o = (t * 6 * (1 + this.wind)) % W; g.drawImage(this.mist, o, y); g.drawImage(this.mist, o - W, y); g.globalAlpha = 1; };
    const layer = (i, col) => { g.fillStyle = css(shade(mix(col, sky[2], [.45, .2, 0][i]))); hillPath(this.hills[i]); g.fill(); };
    layer(0, pal.far); mistBand(H * .45, .35 + rain * .3);
    layer(1, pal.mid); mistBand(H * .55, .3 + rain * .3);
    layer(2, pal.near);
    if (pal.snow > .01) { g.fillStyle = css(shade(WHITE), pal.snow * .5); hillPath(this.hills[1]); g.fill(); }

    const trunk = css(shade(pal.trunk)), pine = shade(pal.pine), fol = [pal.f0, pal.f1, pal.f2].map(shade), snowC = css(shade(WHITE));
    for (const tr of this.trees) {
      const s = tr.sc, sw = Math.sin(t * (.6 + this.wind * .8) + tr.ph) * 2.5 * s * (.5 + this.wind), bx = tr.x, by = tr.y;
      if (tr.pine) {
        for (let j = 0; j < 3; j++) {
          const w = (34 - j * 8) * s, y0 = by - (18 + j * 22) * s, y1 = y0 - 38 * s, ox = sw * (j + 1) / 3;
          g.fillStyle = css(mix(pine, WHITE, j * .06)); g.beginPath(); g.moveTo(bx - w + ox * .5, y0); g.lineTo(bx + ox, y1); g.lineTo(bx + w + ox * .5, y0); g.fill();
          if (pal.snow > .01) { g.fillStyle = snowC; g.globalAlpha = pal.snow; g.beginPath(); g.moveTo(bx - w * .45 + ox * .7, y1 + 17 * s); g.lineTo(bx + ox, y1); g.lineTo(bx + w * .45 + ox * .7, y1 + 17 * s); g.fill(); g.globalAlpha = 1; }
        }
        g.fillStyle = trunk; g.fillRect(bx - 2.5 * s, by - 18 * s, 5 * s, 18 * s);
        continue;
      }
      const th = 58 * s, top = by - th;
      g.strokeStyle = trunk; g.lineCap = "round"; g.lineWidth = 6 * s;
      g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx, by - th * .5, bx + sw, top); g.stroke();
      if (pal.bare > .01) {
        g.globalAlpha = pal.bare; g.lineWidth = 2.2 * s;
        for (const b of tr.br) { const y = by - th * b.y, x0 = bx + sw * b.y; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + Math.cos(b.a) * b.l * s + sw, y + Math.sin(b.a) * b.l * s); g.stroke(); }
        if (pal.snow > .01) { g.fillStyle = snowC; g.globalAlpha = pal.snow * .9; for (const b of tr.br) { g.beginPath(); g.arc(bx + Math.cos(b.a) * b.l * s * .7 + sw * 1.5, by - th * b.y + Math.sin(b.a) * b.l * s * .7 - 1.5 * s, 2.4 * s, 0, TAU); g.fill(); } }
        g.globalAlpha = 1;
      }
      const ca = 1 - pal.bare * .97;
      if (ca > .02) {
        g.globalAlpha = ca;
        for (const b of tr.blobs) { g.fillStyle = css(fol[b.c]); g.beginPath(); g.arc(bx + sw * 1.3 + b.dx * s, top - 6 * s + b.dy * s, b.r * s, 0, TAU); g.fill(); }
        g.fillStyle = css(WHITE, .18 * light); g.beginPath(); g.arc(bx + sw * 1.3 - 8 * s, top - 18 * s, 10 * s, 0, TAU); g.fill();
        g.globalAlpha = 1;
      }
    }

    // lake
    const wg = g.createLinearGradient(0, lakeY, 0, H);
    wg.addColorStop(0, css(shade(mix(pal.water, sky[2], .55)))); wg.addColorStop(1, css(shade(mix(pal.water, sky[0], .5))));
    g.fillStyle = wg; g.fillRect(0, lakeY, W, H - lakeY);
    g.save(); g.translate(0, lakeY * 2); g.scale(1, -1);
    g.globalAlpha = .22; g.fillStyle = css(shade(pal.mid)); hillPath(this.hills[1]); g.fill();
    g.globalAlpha = .3; g.fillStyle = css(shade(pal.near)); hillPath(this.hills[2]); g.fill();
    g.restore(); g.globalAlpha = 1;
    if (body.y < lakeY) {
      g.fillStyle = css(body.c);
      for (let j = 0; j < 16; j++) { const y = lakeY + 3 + j * (H - lakeY) / 16, w = R0 * (1.4 - j * .05) * (.6 + .4 * Math.sin(t * 2 + j * 1.7)); g.globalAlpha = .45 * dim * (1 - j / 16) * sstep(lakeY, lakeY * .8, body.y); g.fillRect(body.x - w, y, w * 2, 2); }
    }
    g.fillStyle = "#fff";
    for (const s of this.shimmer) { s.x = (s.x + dt * 8 * (1 + this.wind)) % (W + 60); g.globalAlpha = (.08 + .08 * Math.sin(t * 1.3 + s.ph)) * (.4 + .6 * light) * (1 - rain * .5); g.fillRect(s.x - 60, s.y, s.l, 1); }
    g.globalAlpha = 1;

    this.particles(st, dt, fol, shade);

    // fog + storm tint
    const fg = g.createLinearGradient(0, H * .55, 0, H);
    fg.addColorStop(0, css(sky[2], 0)); fg.addColorStop(1, css(sky[2], .12 + rain * .25));
    g.fillStyle = fg; g.fillRect(0, H * .55, W, H * .45);
    if (rain > .01) { g.fillStyle = css(STORM, rain * .12); g.fillRect(0, 0, W, H); }

    this.nextBolt -= dt;
    if (this.nextBolt < 0) {
      this.nextBolt = rr(14, 40);
      if (rain > .7 && pal.snow < .5) { this.flash = 1; this.onThunder && this.onThunder(rr(.4, 2.2), rain); }
    }
    if (this.flash > 0) { g.fillStyle = `rgba(235,230,255,${this.flash * .35 * (Math.sin(this.flash * 40) * .3 + .7)})`; g.fillRect(0, 0, W, H); this.flash = Math.max(0, this.flash - dt * 2.2); }

    g.drawImage(this.vig, 0, 0);
    g.globalAlpha = .045; g.save(); g.translate(R() * 200, R() * 200); g.fillStyle = this.grainPat; g.fillRect(-200, -200, W + 200, H + 200); g.restore(); g.globalAlpha = 1;
  }

  particles(st, dt, fol, shade) {
    const { x: g, W, H, lakeY, pal, parts } = this, { night, light, rain } = st, snowy = pal.snow, wind = this.wind, k = H / 900;
    const rate = { rain: rain * (1 - snowy) * 900, snow: rain * snowy * 260 + pal.snowfall * 30, petal: pal.petals * 5 * (.5 + wind), leaf: pal.leaves * 4 * (.5 + wind), fly: pal.fireflies * night * 3 * (1 - rain), pollen: pal.pollen * light * 3 * (1 - rain) };
    for (const kind in rate) {
      let n = rate[kind] * dt; while (n > 0 && parts.length < 1600) { if (R() < n) parts.push(this.spawn(kind, k)); n--; }
    }
    const rainPath = new Path2D(), snowPath = new Path2D(), ang = wind * .35;
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.life += dt;
      switch (q.k) {
        case "rain": q.x += (q.v * ang) * dt; q.y += q.v * dt;
          if (q.y > q.floor) { if (q.floor > lakeY && R() < .35) this.ripples.push({ x: q.x, y: q.floor, r: 1, a: .5 }); parts.splice(i, 1); continue; }
          rainPath.moveTo(q.x, q.y); rainPath.lineTo(q.x - q.l * ang, q.y - q.l); break;
        case "snow": q.x += (Math.sin(q.life * q.f + q.ph) * 14 + wind * 40) * dt * k; q.y += q.v * dt;
          if (q.y > q.floor) { parts.splice(i, 1); continue; }
          snowPath.moveTo(q.x + q.r, q.y); snowPath.arc(q.x, q.y, q.r, 0, TAU); break;
        case "fly": q.x += Math.cos(q.life * .7 + q.ph) * 12 * dt; q.y += Math.sin(q.life * .9 + q.ph * 2) * 9 * dt;
          if (q.life > q.max) { parts.splice(i, 1); continue; }
          { const a = Math.sin(Math.PI * q.life / q.max) * (.5 + .5 * Math.sin(q.life * 3 + q.ph)), s = 26 * k; g.globalAlpha = a * night; g.drawImage(this.glow, q.x - s / 2, q.y - s / 2, s, s); g.globalAlpha = 1; } break;
        case "pollen": q.x += (wind * 18 + Math.sin(q.life + q.ph) * 6) * dt; q.y += Math.sin(q.life * .8 + q.ph) * 6 * dt - 2 * dt;
          if (q.life > q.max) { parts.splice(i, 1); continue; }
          g.fillStyle = `rgba(255,250,220,${Math.sin(Math.PI * q.life / q.max) * .7 * light})`; g.fillRect(q.x, q.y, 2 * k, 2 * k); break;
        default: // petal, leaf
          q.x += (wind * 55 + Math.sin(q.life * q.f + q.ph) * 25) * dt * k; q.y += q.v * dt; q.rot += q.vr * dt;
          if (q.y > H + 20 || q.x > W + 40) { parts.splice(i, 1); continue; }
          g.save(); g.translate(q.x, q.y); g.rotate(q.rot); g.scale(1, Math.sin(q.life * q.f * 1.3 + q.ph) * .8 + .2);
          g.fillStyle = css(q.k === "petal" ? shade(mix(pal.f0, [255, 240, 246], q.c * .5)) : fol[q.c]);
          g.beginPath(); if (q.k === "petal") g.ellipse(0, 0, q.r, q.r * .6, 0, 0, TAU); else { g.moveTo(-q.r, 0); g.quadraticCurveTo(0, -q.r * .8, q.r, 0); g.quadraticCurveTo(0, q.r * .8, -q.r, 0); }
          g.fill(); g.restore();
      }
    }
    if (rain > .01) { g.strokeStyle = css(mix([225, 225, 255], STORM, night * .3), .32); g.lineWidth = 1; g.stroke(rainPath); }
    g.fillStyle = "rgba(255,255,255,.85)"; g.fill(snowPath);
    g.strokeStyle = "rgba(255,255,255,.5)"; g.lineWidth = 1;
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i]; r.r += dt * 18; r.a -= dt * .8;
      if (r.a <= 0) { this.ripples.splice(i, 1); continue; }
      g.globalAlpha = r.a; g.beginPath(); g.ellipse(r.x, r.y, r.r * k, r.r * .3 * k, 0, 0, TAU); g.stroke();
    }
    g.globalAlpha = 1;
  }

  spawn(kind, k) {
    const { W, H, lakeY } = this, q = { k: kind, life: 0, ph: R() * TAU };
    switch (kind) {
      case "rain": return Object.assign(q, { x: rr(-W * .2, W), y: rr(-60, -10), v: rr(700, 1000) * k, l: rr(10, 22) * k, floor: R() < .5 ? rr(lakeY, H) : rr(H * .6, H) });
      case "snow": return Object.assign(q, { x: rr(-W * .2, W), y: -8, v: rr(25, 70) * k, r: rr(1, 3) * k, f: rr(.5, 1.5), floor: rr(H * .7, H) });
      case "fly": return Object.assign(q, { x: R() * W, y: rr(H * .6, H * .92), max: rr(5, 11) });
      case "pollen": return Object.assign(q, { x: R() * W, y: rr(H * .3, H * .9), max: rr(5, 10) });
      default: { const tr = this.trees[R() * this.trees.length | 0]; return Object.assign(q, { x: tr ? tr.x + rr(-20, 20) : R() * W, y: tr ? tr.y - 60 * tr.sc : -10, v: rr(20, 45) * k, r: rr(3, 6) * k, f: rr(1, 2.5), rot: R() * TAU, vr: rr(-2, 2), c: R() * 3 | 0 }); }
    }
  }
}
window.Scene = Scene;
})();
