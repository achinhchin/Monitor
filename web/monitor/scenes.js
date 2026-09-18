(() => {
const { R, TAU, rr, mix, hex, css, clamp, pick } = U;

// shared grass: blades batched into 3 color paths; a travelling gust wave sweeps across the field
World.prototype.blades = function (r, n, top, h0, h1, bottom = this.H) {
  const out = [];
  for (let i = 0; i < n; i++) { const x = r() * this.W, y0 = top(x), u = Math.pow(r(), .75), y = y0 + (bottom - y0) * u; out.push({ x, y, h: (h0 + r() * (h1 - h0)) * this.k * (.45 + u), c: (r() * 3) | 0, p: r() * TAU }); }
  return out.sort((a, b) => a.y - b.y);
};
World.prototype.grass = function (g, bl, st, d = 0) {
  const ps = [new Path2D(), new Path2D(), new Path2D()], t = st.t, w = st.wind;
  for (const b of bl) {
    const s = (Math.sin(t * 1.5 - b.x * .005) * .45 * (.3 + w) + w * .7 + Math.sin(t * 3 + b.p) * .1) * b.h * .5, p = ps[b.c];
    p.moveTo(b.x, b.y); p.quadraticCurveTo(b.x + s * .25, b.y - b.h * .55, b.x + s, b.y - b.h * (1 - Math.abs(s) / b.h * .3));
  }
  g.lineWidth = 2 * this.k; g.lineCap = "round";
  ["g1", "g2", "g3"].forEach((c, i) => { g.strokeStyle = this.pc(c, d); g.stroke(ps[i]); });
};
World.prototype.hit = (x, y, cx, cy, rx, ry = rx) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1;
World.prototype.flowers = function (g, list, d = 0) {
  const P = this.pal; if (P.flowers < .02) return;
  const a = [new Path2D(), new Path2D()];
  for (const [x, y, v, s] of list) if (v < P.flowers) { const p = a[v * 7 & 1], r = (1.5 + s * 2) * this.k; p.moveTo(x + r, y); p.arc(x, y, r, 0, TAU); }
  g.fillStyle = this.pc("fl1", d); g.fill(a[0]); g.fillStyle = this.pc("fl2", d); g.fill(a[1]);
};
const scatter = (S, r, n, top, bottom) => Array.from({ length: n | 0 }, () => { const x = r() * S.W, y0 = top(x); return [x, y0 + (bottom - y0) * Math.pow(r(), .7), r(), r()]; });
const shakeTree = (S, o, x, y) => { o.shake = 1; const P = S.pal; S.burst(P.snow > .5 ? "snow" : P.petals > .3 ? "petal" : "leaf", x, y, 10 + R() * 10 | 0); S.snd("rustle", x, 1); S.life && S.life.flush(x, y, 250 * S.k); };
const swayOf = (S, o, st, x) => { o.shake = Math.max(0, (o.shake || 0) - st.dt * .8); return (Math.sin(st.t * 1.1 + x * .01) * (1 + st.wind * 3) + o.shake * Math.sin(st.t * 22) * 9) * S.k; };

const meadow = {
  horizon: .6, fireflies: 1, amb: "meadow",
  life: { deer: 3, rabbit: 4, fox: 1, bird: 7, butterfly: 5, frog: 3, fish: 4, hawk: 1 },
  init(S, r) {
    const { W, H, k } = S;
    this.far = S.ridge(r, H * .47, H * .1, .5); this.mid = S.ridge(r, H * .585, H * .035); this.near = S.ridge(r, H * .74, H * .025);
    this.lake = { cx: W * .34, cy: H * .69, rx: W * .3, ry: H * .042 };
    this.trees = Array.from({ length: Math.ceil(W / 60) }, () => { const x = r() * W; return [x, S.ry(this.mid, x) + H * .012, (35 + r() * 45) * k, r() < .3 ? "pine" : r() < .2 ? "poplar" : "round"]; }).sort((a, b) => a[2] - b[2]);
    this.hero = { x: W * .8, y: S.ry(this.near, W * .8) + 26 * k, sz: 250 * k };
    this.house = [W * .14, S.ry(this.mid, W * .14) + H * .02];
    this.fl = scatter(S, r, W * H / 2200, (x) => S.ry(this.near, x) + 6 * k, H);
    this.bl = S.blades(r, Math.min(900, W * H / 1500), (x) => S.ry(this.near, x) + 4 * k, 12, 30);
    this.fb = S.blades(r, W / 9, () => H * .985, 28, 64);
    const L = this.lake; this.shim = Array.from({ length: 50 }, () => { const a = r() * TAU, u = Math.sqrt(r()); return [L.cx + Math.cos(a) * u * L.rx * .92, L.cy + Math.sin(a) * u * L.ry * .8, (8 + r() * 30) * k, r() * TAU]; });
    const h = this.hero; this.perches = [[h.x - 55 * k, h.y - h.sz * .78], [h.x + 45 * k, h.y - h.sz * .85], [h.x, h.y - h.sz * .98]];
    this.gt = (x) => S.ry(this.near, x) + 14 * k; this.gb = H * .97; this.floor = H * .95;
    this.water = { ell: L, surf: L.cy - L.ry * .2 };
  },
  build(g, S, r, st) {
    const { W, H, k } = S, L = this.lake;
    S.fillRidge(g, this.far, S.vgrad(g, H * .3, H * .55, S.pc("far", .45), S.pc("far", .6)));
    if (S.pal.snow < .5) { g.save(); S.fillRidge(g, this.far, "rgba(0,0,0,0)"); g.clip(); g.fillStyle = S.hx("#ffffff", .5, .75); g.beginPath(); for (let x = 0; x <= W; x += 12) g.lineTo(x, H * .41 + Math.sin(x * .05) * 6 * k); g.lineTo(W, 0); g.lineTo(0, 0); g.fill(); g.restore(); }
    S.fillRidge(g, this.mid, S.vgrad(g, H * .52, H * .7, S.pc("g2", .32), S.pc("g3", .25)));
    S.house(g, this.house[0], this.house[1], 46 * k, 30 * k, "#f4ead8", "#c9584a", .25, st.night, r);
    for (const [x, y, sz, t] of this.trees) S.tree(g, x, y, sz, t, .3);
    g.save(); g.beginPath(); g.ellipse(L.cx, L.cy, L.rx, L.ry, 0, 0, TAU); g.clip();
    const wl = S.shade(S.pal.water);
    g.fillStyle = S.vgrad(g, L.cy - L.ry, L.cy + L.ry, css(mix(st.sky[2], wl, .35)), css(mix(st.sky[1], wl, .7))); g.fillRect(L.cx - L.rx, L.cy - L.ry, L.rx * 2, L.ry * 2);
    g.restore();
    S.fillRidge(g, this.near, S.vgrad(g, H * .7, H, S.pc("g1"), S.pc("g3")));
    for (let i = 0; i < 9; i++) { g.fillStyle = S.pc(i % 2 ? "g1" : "g3", 0, .28); g.beginPath(); g.ellipse(r() * W, H * (.8 + r() * .18), (80 + r() * 200) * k, (14 + r() * 26) * k, 0, 0, TAU); g.fill(); }
    g.strokeStyle = S.hx("#e2cfa0", 0, .75 * (1 - S.pal.snow * .6)); g.lineWidth = 26 * k; g.lineCap = "round";
    g.beginPath(); g.moveTo(W * .56, H + 20); g.bezierCurveTo(W * .6, H * .9, W * .5, H * .82, W * .47, H * .745); g.stroke();
    S.flowers(g, this.fl);
  },
  fg(g, S, st) {
    const L = this.lake, k = S.k; g.fillStyle = "#fff";
    for (const [x, y, l, p] of this.shim) { g.globalAlpha = (.12 + .12 * Math.sin(st.t * 1.4 + p)) * (.3 + .7 * st.light); g.fillRect(x + Math.sin(st.t * .3 + p) * 6, y, l, k); }
    if (S.body && Math.abs(S.body.x - L.cx) < L.rx * .9) for (let i = 0; i < 6; i++) { g.globalAlpha = .25 * (1 - st.cloud) * (1 - i / 6); g.fillRect(S.body.x - 18 * k * (1 + Math.sin(st.t * 2 + i)), L.cy - L.ry * .6 + i * L.ry * .28, 36 * k, 1.5 * k); }
    g.globalAlpha = 1;
    const h = this.hero; S.tree(g, h.x, h.y, h.sz, "round", 0, swayOf(S, h, st, h.x), 7);
    S.grass(g, this.bl, st);
  },
  front(g, S, st) { S.grass(g, this.fb, st); },
  emit(S) { const h = this.hero; return R() < .6 ? [h.x + rr(-.4, .4) * h.sz, h.y - h.sz * .75] : [R() * S.W, -10]; },
  tap(S, x, y) {
    const h = this.hero, L = this.lake;
    if (S.hit(x, y, h.x, h.y - h.sz * .65, h.sz * .55, h.sz * .45)) return shakeTree(S, h, x, y), true;
    if (S.hit(x, y, L.cx, L.cy, L.rx, L.ry)) { S.ripple(x, y, 4); S.snd("splash", x, .7); S.life && S.life.lure(x, y); return true; }
  },
};

const forest = {
  horizon: .45, fireflies: 1, amb: "forest",
  life: { deer: 2, rabbit: 3, fox: 1, spirit: 7, owl: 1, bird: 5, butterfly: 3, squirrel: 2 },
  init(S, r) {
    const { W, H, k } = S;
    this.ground = S.ridge(r, H * .78, H * .02); this.canopy = S.ridge(r, H * .2, H * .09);
    this.trunks = [.62, .4, .18].map((d) => Array.from({ length: Math.ceil(W / (140 * k) * (1.4 - d)) }, () => [r() * W, (14 + r() * 16) * k * (1.3 - d) * (1.4 - d), d]));
    this.big = [[W * .14, 110 * k], [W * .9, 80 * k]];
    this.mush = Array.from({ length: 9 }, () => { const x = r() * W; return { x, y: S.ry(this.ground, x) + rr(8, 60) * k, s: rr(7, 15) * k, c: pick(["#e8584f", "#f2a65a", "#f4efe2"]), b: 0 }; });
    this.ferns = Array.from({ length: W / 50 | 0 }, () => { const x = r() * W; return [x, S.ry(this.ground, x) + r() * 30 * k, (24 + r() * 30) * k, r()]; });
    this.rays = Array.from({ length: 4 }, (_, i) => [W * (.15 + i * .22 + r() * .08), (60 + r() * 90) * k, r() * TAU]);
    const c = U.cv(64, 256), rg = c.getContext("2d"), gr = rg.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, "rgba(255,245,200,.9)"); gr.addColorStop(1, "rgba(255,245,200,0)"); rg.fillStyle = gr; rg.fillRect(0, 0, 64, 256); this.ray = c;
    this.fl = scatter(S, r, W * H / 4000, (x) => S.ry(this.ground, x) + 6 * k, H);
    this.bl = S.blades(r, Math.min(700, W * H / 2200), (x) => S.ry(this.ground, x) + 4 * k, 10, 24);
    this.perches = this.big.map(([x, w]) => [x + w * .9, H * .42]).concat(this.trunks[2].slice(0, 3).map(([x]) => [x, H * .45]));
    this.gt = (x) => S.ry(this.ground, x) + 12 * k; this.gb = H * .97; this.floor = H * .95;
  },
  build(g, S, r, st) {
    const { W, H, k } = S;
    g.fillStyle = S.vgrad(g, H * .3, H * .8, S.pc("g2", .5, 0), S.pc("g2", .45, .55)); g.fillRect(0, H * .3, W, H * .7);
    for (const layer of this.trunks) for (const [x, w, d] of layer) {
      g.fillStyle = S.pc("trunk", d); g.fillRect(x - w / 2, 0, w, H * .82);
      g.fillStyle = S.hx("#ffffff", d, .12); g.fillRect(x - w / 2, 0, w * .3, H * .82);
    }
    S.fillRidge(g, this.canopy, S.pc("l3", .25), 0);
    for (let x = -40; x < W + 40; x += 34 * k) { const y = S.ry(this.canopy, clamp(x, 0, W)); for (const [c, dy, s] of [["l3", 0, 1], ["l2", -8, .8], ["l1", -16, .5]]) { g.fillStyle = S.pc(c, .2); g.beginPath(); g.arc(x + r() * 10, y + dy * k + r() * 8 * k, 26 * k * s * (.7 + r() * .6), 0, TAU); g.fill(); } }
    for (let i = 0; i < W / 30; i++) { const x = r() * W, y = S.ry(this.canopy, x); g.strokeStyle = S.pc("l2", .2, .8); g.lineWidth = 2 * k; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 6 * k, y + 30 * k, x, y + (30 + r() * 60) * k); g.stroke(); }
    S.fillRidge(g, this.ground, S.vgrad(g, H * .75, H, S.pc("g2"), S.pc("g3")));
    for (let i = 0; i < 10; i++) { g.fillStyle = S.pc(i % 2 ? "g1" : "g3", 0, .3); g.beginPath(); g.ellipse(r() * W, H * (.82 + r() * .15), (60 + r() * 140) * k, (10 + r() * 18) * k, 0, 0, TAU); g.fill(); }
    for (const [x, w] of this.big) {
      g.fillStyle = S.pc("trunk", .05); g.beginPath(); g.moveTo(x - w * 1.3, H * .86); g.quadraticCurveTo(x - w * .5, H * .7, x - w * .5, 0); g.lineTo(x + w * .5, 0); g.quadraticCurveTo(x + w * .5, H * .7, x + w * 1.3, H * .86); g.fill();
      g.fillStyle = S.hx("#2a1d24", .05, .6); g.beginPath(); g.ellipse(x, H * .72, w * .22, w * .35, 0, 0, TAU); g.fill();
      g.strokeStyle = S.hx("#000000", .05, .12); g.lineWidth = 3 * k; for (let i = 0; i < 6; i++) { const bx = x - w * .4 + i * w * .16; g.beginPath(); g.moveTo(bx, 0); g.bezierCurveTo(bx + 8 * k, H * .3, bx - 8 * k, H * .5, bx, H * .8); g.stroke(); }
      if (S.pal.snow > .1) { g.fillStyle = S.hx("#ffffff", 0, S.pal.snow); g.beginPath(); g.ellipse(x, H * .855, w * 1.2, 10 * k, 0, 0, TAU); g.fill(); }
    }
    g.lineWidth = 1.6 * k;
    for (const [x, y, s, v] of this.ferns) { g.strokeStyle = S.pc(v < .5 ? "l3" : "g3"); for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + i * s * .2, y - s * .8, x + i * s * .35, y - s * (.6 + (3 - Math.abs(i)) * .1)); g.stroke(); } }
    S.flowers(g, this.fl);
  },
  fg(g, S, st) {
    const a = st.light * (1 - st.cloud * .9) * .22;
    if (a > .01) { g.globalCompositeOperation = "lighter"; for (const [x, w, p] of this.rays) { g.globalAlpha = a * (.7 + .3 * Math.sin(st.t * .3 + p)); g.setTransform(S.s, 0, S.s * .35, S.s, (x - S.H * .1) * S.s, 0); g.drawImage(this.ray, 0, 0, w, S.H * .85); } g.setTransform(S.s, 0, 0, S.s, 0, 0); g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; }
    for (const m of this.mush) {
      m.b = Math.max(0, m.b - st.dt * 2); const s = m.s * (1 + Math.sin(m.b * 12) * m.b * .3), y = m.y;
      g.fillStyle = S.hx("#f4ecdc"); g.fillRect(m.x - s * .25, y - s * .9, s * .5, s * .9);
      g.fillStyle = S.hx(m.c); g.beginPath(); g.ellipse(m.x, y - s * .9, s, s * .6, 0, Math.PI, 0); g.fill();
      if (m.c === "#e8584f") { g.fillStyle = S.hx("#ffffff", 0, .9); g.beginPath(); g.arc(m.x - s * .4, y - s * 1.1, s * .14, 0, TAU); g.arc(m.x + s * .3, y - s * 1.2, s * .12, 0, TAU); g.fill(); }
    }
    S.grass(g, this.bl, st);
  },
  emit(S) { const x = R() * S.W; return [x, S.ry(this.canopy, x)]; },
  tap(S, x, y) {
    for (const m of this.mush) if (S.hit(x, y, m.x, m.y - m.s, m.s * 1.8)) { m.b = 1; S.snd("boing", x, .8); S.burst("pollen", m.x, m.y - m.s * 2, 8); S.life && S.life.lure(x, y, "spirit"); return true; }
    for (const [bx, w] of this.big) if (Math.abs(x - bx) < w * .6 && y < S.H * .85) { S.snd("knock", x, 1); S.burst(S.pal.snow > .5 ? "snow" : "leaf", x, S.ry(this.canopy, x), 8); S.life && S.life.flush(x, y, 300 * S.k); return true; }
  },
};

const mountain = {
  horizon: .5, amb: "mountain",
  life: { deer: 2, rabbit: 3, fox: 1, hawk: 2, bird: 4, butterfly: 2, marmot: 3 },
  peaks(r, base, hmax, n) {
    const W = this.S.W, pk = Array.from({ length: n }, () => [r() * W, hmax * (.5 + r() * .5), .5 + r() * .5]), ys = new Float32Array(Math.ceil(W / 6) + 2);
    for (let i = 0; i < ys.length; i++) { const x = i * 6; let m = 0; for (const [px, h, s] of pk) m = Math.max(m, h - Math.abs(x - px) * s); ys[i] = base - m - Math.sin(x * .05) * 4 - Math.sin(x * .013) * 10; }
    ys.step = 6; ys.pk = pk; return ys;
  },
  init(S, r) {
    const { W, H, k } = S; this.S = S;
    this.far = this.peaks(r, H * .56, H * .38, 4); this.mid = this.peaks(r, H * .66, H * .26, 5); this.near = S.ridge(r, H * .76, H * .025);
    this.pines = Array.from({ length: W / 12 | 0 }, () => { const x = r() * W, y = S.ry(this.mid, x); return [x, y + (10 + r() * (H * .66 - y)) * .9, (14 + r() * 16) * k]; }).sort((a, b) => a[1] - b[1]);
    const wx = W * .64; this.fall = { x: wx, y0: S.ry(this.mid, wx) + 20 * k, y1: S.ry(this.near, wx), w: 22 * k };
    this.fl = scatter(S, r, W * H / 2000, (x) => S.ry(this.near, x) + 6 * k, H);
    this.bl = S.blades(r, Math.min(900, W * H / 1500), (x) => S.ry(this.near, x) + 4 * k, 10, 26);
    this.lone = [W * .2, S.ry(this.near, W * .2) + 30 * k, 200 * k];
    this.perches = [[W * .2, this.lone[1] - 260 * k]];
    this.gt = (x) => S.ry(this.near, x) + 14 * k; this.gb = H * .97; this.floor = H * .95;
  },
  layer(g, S, ys, base, d, snowY, r) {
    const { W, H } = S;
    S.fillRidge(g, ys, S.col(mix(S.pal.rock, S.pal.far, d), d));
    g.save(); S.fillRidge(g, ys, "rgba(0,0,0,0)"); g.clip();
    g.fillStyle = S.hx("#fff4dc", d, .18); for (const [px, h] of ys.pk) { g.beginPath(); g.moveTo(px, base - h); g.lineTo(px - h * 1.4, H); g.lineTo(px - h * .1, H); g.fill(); }
    g.fillStyle = S.hx("#ffffff", d, .95); g.beginPath(); g.moveTo(0, 0);
    for (let x = 0; x <= W; x += 10) g.lineTo(x, snowY + Math.sin(x * .07) * 8 * S.k + Math.sin(x * .023) * 14 * S.k + (r() - .5) * 8 * S.k);
    g.lineTo(W, 0); g.fill(); g.restore();
  },
  build(g, S, r, st) {
    const { W, H, k } = S, sn = S.pal.snow;
    this.layer(g, S, this.far, H * .56, .55, H * (.3 + .1 * sn), r);
    this.layer(g, S, this.mid, H * .66, .3, H * (.44 + .14 * sn), r);
    g.globalAlpha = .9; for (const [x, y, s] of this.pines) S.tree(g, x, y, s, "pine", .28); g.globalAlpha = 1;
    const f = this.fall, w = f.w; g.fillStyle = S.col(mix(S.pal.rock, [60, 60, 80], .25), .15); g.beginPath(); g.moveTo(f.x - w * 3.4, f.y1 + 6 * k); g.lineTo(f.x - w * 2.2, f.y0 + 20 * k); g.lineTo(f.x - w * 1.2, f.y0 - 12 * k); g.lineTo(f.x + w * 1.4, f.y0 - 16 * k); g.lineTo(f.x + w * 2.4, f.y0 + 30 * k); g.lineTo(f.x + w * 3.6, f.y1 + 6 * k); g.fill();
    g.fillStyle = S.pc("g3", .15, .8); for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(f.x + (r() - .5) * w * 5, f.y0 + r() * (f.y1 - f.y0), w * .5, w * .25, 0, 0, TAU); g.fill(); }
    S.fillRidge(g, this.near, S.vgrad(g, H * .72, H, S.pc("g1"), S.pc("g3")));
    for (let i = 0; i < 7; i++) { const x = r() * W, y = H * (.8 + r() * .17), s = (8 + r() * 20) * k; g.fillStyle = S.col(S.pal.rock); g.beginPath(); g.ellipse(x, y, s * 1.4, s, 0, Math.PI, 0); g.fill(); g.fillStyle = S.hx("#ffffff", 0, .25); g.beginPath(); g.ellipse(x - s * .3, y - s * .5, s * .5, s * .25, 0, 0, TAU); g.fill(); }
    S.flowers(g, this.fl);
  },
  fg(g, S, st) {
    const f = this.fall, k = S.k, p = new Path2D(), H = f.y1 - f.y0, wx = (y) => f.w * (.5 + .35 * (y - f.y0) / H);
    g.fillStyle = S.vgrad(g, f.y0, f.y1, S.hx("#bfe0f2", .1, .75), S.hx("#e6f4fb", .1, .9));
    g.beginPath(); g.moveTo(f.x - wx(f.y0), f.y0); g.lineTo(f.x + wx(f.y0), f.y0); g.lineTo(f.x + wx(f.y1), f.y1); g.lineTo(f.x - wx(f.y1), f.y1); g.fill();
    for (let i = 0; i < 18; i++) { const u = (i * .618) % 1, sp = 120 + (i * 37 % 60), L = (20 + i * 13 % 30) * k, o = (st.t * sp * k + i * 53) % (H + L); const y = f.y0 + o - L, x = f.x + (u - .5) * 2 * wx(Math.max(f.y0, y)) * .9; p.moveTo(x, Math.max(f.y0, y)); p.lineTo(x, Math.min(f.y1, y + L)); }
    g.strokeStyle = S.hx("#ffffff", .1, .7); g.lineWidth = 1.3 * k; g.stroke(p);
    this.mist = Math.max(0, (this.mist || 0) - st.dt * .5);
    g.fillStyle = S.hx("#ffffff", 0, .35 + this.mist * .4); for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(f.x + Math.sin(st.t * .7 + i * 2) * f.w * 1.2, f.y1 - 4 * k, (14 + i * 5 + this.mist * 20) * k, 0, TAU); g.fill(); }
    const [lx, ly, ls] = this.lone; this.lt = this.lt || {}; S.tree(g, lx, ly, ls, "round", 0, swayOf(S, this.lt, st, lx), 3);
    S.grass(g, this.bl, st);
  },
  emit(S) { const [x, y, s] = this.lone; return R() < .5 ? [x + rr(-.4, .4) * s, y - s * .7] : [R() * S.W, -10]; },
  tap(S, x, y) {
    const f = this.fall, [lx, ly, ls] = this.lone;
    if (Math.abs(x - f.x) < f.w * 2 && y > f.y0 && y < f.y1 + 20 * S.k) { this.mist = 1; S.snd("splash", x, 1); S.ripple(f.x, f.y1, 3); return true; }
    if (S.hit(x, y, lx, ly - ls * .65, ls * .55, ls * .45)) return shakeTree(S, this.lt, x, y), true;
    if (y < S.ry(this.mid, x)) { S.snd("echo", x, 1); S.life && S.life.flush(x, y, 9999, "bird"); return true; }
  },
};

const beach = {
  horizon: .52, amb: "beach",
  life: { gull: 5, crab: 5, fish: 5, dog: 1, whale: 1, turtle: 1 },
  init(S, r) {
    const { W, H, k } = S, hz = H * .52; this.hz = hz;
    this.shore = (x) => H * .74 + Math.sin(x * .004 + 1) * H * .015 + Math.sin(x * .011) * H * .006;
    this.isl = [W * .72, hz, W * .16, H * .06];
    this.palms = [{ x: W * .09, y: H * .93, s: 230 * k }, { x: W * .9, y: H * .9, s: 190 * k }, { x: W * .97, y: H * .96, s: 150 * k }];
    this.boat = { x: r() * W, y: hz + 10 * k };
    this.glint = Array.from({ length: 70 }, () => [r() * W, hz + Math.pow(r(), 1.6) * (H * .72 - hz), r() * TAU, (4 + r() * 16) * k]);
    this.shells = Array.from({ length: 22 }, () => { const x = r() * W; return [x, this.shore(x) + (20 + r() * (H * .25)) * k * 1.2, r()]; });
    this.perches = [[this.isl[0], hz - this.isl[3] * 1.4]];
    this.gt = (x) => this.shore(x) + 22 * k; this.gb = H * .97; this.floor = H * .96;
    this.water = { rect: [0, hz + 12 * k, W, H * .7], surf: hz + 12 * k };
  },
  build(g, S, r, st) {
    const { W, H, k } = S, hz = this.hz, P = S.pal;
    const deep = S.col(mix(hex("#2f7fae"), P.water, .3)), shal = S.col(mix(hex("#5fd0cf"), P.water, .25));
    g.fillStyle = S.vgrad(g, hz, H * .76, css(mix(st.sky[2], S.shade(hex("#6aaed0")), .55)), shal); g.fillRect(0, hz, W, H - hz);
    g.fillStyle = deep; g.globalAlpha = .35; g.fillRect(0, hz + (H * .74 - hz) * .15, W, (H * .74 - hz) * .4); g.globalAlpha = 1;
    const [ix, iy, iw, ih] = this.isl;
    g.fillStyle = S.pc("g3", .5); g.beginPath(); g.ellipse(ix, iy, iw, ih, 0, Math.PI, 0); g.fill();
    for (let i = 0; i < 7; i++) S.tree(g, ix - iw * .6 + i * iw * .2, iy - ih * .3 + Math.abs(i - 3) * ih * .15, 26 * k, "round", .5);
    g.fillStyle = S.hx("#f6f1ea", .45); g.fillRect(ix + iw * .45, iy - ih * 1.6, 8 * k, ih * 1.2); g.fillStyle = S.hx("#d5584c", .45); g.fillRect(ix + iw * .45, iy - ih * 1.7, 8 * k, 6 * k);
    g.fillStyle = S.vgrad(g, H * .72, H, S.hx(P.snow > .5 ? "#eef1f6" : "#f4e2b6"), S.hx(P.snow > .5 ? "#d9e0ec" : "#e2c48e"));
    g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 8) g.lineTo(x, this.shore(x)); g.lineTo(W, H); g.fill();
    g.fillStyle = S.hx("#c9a878", 0, .35); g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, this.shore(x) + 14 * k); for (let x = W; x >= 0; x -= 8) g.lineTo(x, this.shore(x)); g.fill();
    for (const [x, y, v] of this.shells) { g.fillStyle = S.hx(v < .3 ? "#f2a08c" : v < .6 ? "#fff4e6" : "#e9c7a2"); g.beginPath(); g.ellipse(x, y, 4 * k, 3 * k, v * 3, 0, TAU); g.fill(); }
    for (let i = 0; i < 4; i++) { const x = r() * W, y = H * (.86 + r() * .1), s = (14 + r() * 22) * k; g.fillStyle = S.col(P.rock); g.beginPath(); g.ellipse(x, y, s * 1.5, s, 0, Math.PI, 0); g.fill(); g.fillStyle = S.pc("l3", 0, .6); g.fillRect(x - s * 1.2, y - 3 * k, s * 2.4, 3 * k); }
  },
  fg(g, S, st) {
    const { W, H, k } = S, t = st.t, hz = this.hz;
    g.fillStyle = "#fff";
    for (const [x, y, p, l] of this.glint) { const near = S.body ? Math.max(0, 1 - Math.abs(x - S.body.x) / (W * .15)) : 0; g.globalAlpha = Math.max(0, Math.sin(t * 2 + p)) * (.15 + near * .6 * (1 - st.cloud)) * (.3 + st.light * .7); g.fillRect(x, y, l, 1.2 * k); }
    g.globalAlpha = 1;
    const b = this.boat; b.x = (b.x + st.dt * (4 + st.wind * 6) * k) % (W + 60 * k);
    const by = b.y + Math.sin(t) * 1.5 * k; g.fillStyle = S.hx("#7a4e3a", .35); g.beginPath(); g.moveTo(b.x - 18 * k, by); g.lineTo(b.x + 18 * k, by); g.lineTo(b.x + 12 * k, by + 6 * k); g.lineTo(b.x - 12 * k, by + 6 * k); g.fill();
    g.fillStyle = S.hx("#fbf6ec", .35); g.beginPath(); g.moveTo(b.x, by - 30 * k); g.lineTo(b.x + 14 * k, by - 2 * k); g.lineTo(b.x, by - 2 * k); g.fill();
    if (st.night > .4) { const [ix, iy, iw, ih] = this.isl, lx = ix + iw * .45 + 4 * k, ly = iy - ih * 1.6, a = Math.sin(t * .8); g.globalCompositeOperation = "lighter"; g.fillStyle = `rgba(255,240,190,${.18 * st.night})`; g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + a * W * .4, ly - 30 * k); g.lineTo(lx + a * W * .4, ly + 20 * k); g.fill(); g.globalCompositeOperation = "source-over"; }
    g.strokeStyle = S.hx("#ffffff", 0, .5); g.lineWidth = 1.5 * k;
    for (let i = 0; i < 4; i++) {
      const u = ((t * .07 + i / 4) % 1), a = Math.sin(u * Math.PI) * .6; g.globalAlpha = a; g.beginPath();
      for (let x = 0; x <= W; x += 16) { const y = hz + (this.shore(x) - hz) * (.35 + u * .63); x ? g.lineTo(x, y + Math.sin(x * .02 + t) * 2 * k) : g.moveTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
    const wash = (Math.sin(t * .55) * .5 + .5) * (20 + st.wind * 14) * k;
    g.fillStyle = S.hx("#ffffff", 0, .7); g.beginPath();
    for (let x = 0; x <= W; x += 10) g.lineTo(x, this.shore(x) - 4 * k); for (let x = W; x >= 0; x -= 10) g.lineTo(x, this.shore(x) + wash + Math.sin(x * .05 + t * 2) * 3 * k); g.fill();
    for (const p of this.palms) { p.o = p.o || {}; S.tree(g, p.x, p.y, p.s, "palm", 0, swayOf(S, p.o, st, p.x) / S.k * .4); }
  },
  tap(S, x, y) {
    for (const p of this.palms) if (S.hit(x, y, p.x + p.s * .2, p.y - p.s * 1.4, p.s * .6)) { p.o.shake = 1; S.snd("rustle", x, 1); return true; }
    if (y > this.hz && y < this.shore(x)) { S.ripple(x, y, 4); S.snd("splash", x, .8); S.life && S.life.lure(x, y); return true; }
    if (y >= this.shore(x) && y < this.shore(x) + 40 * S.k) { S.snd("wave", x, 1); S.burst("snow", x, y, 10); return true; }
  },
};

const city = {
  horizon: .48, amb: "city",
  life: { pigeon: 7, cat: 3, dog: 2, fuzz: 5, butterfly: 1, bird: 2 },
  init(S, r) {
    const { W, H, k } = S; this.S = S; this.tog = this.tog || new Set();
    this.hills = S.ridge(r, H * .5, H * .05);
    const walls = ["#f6e7cf", "#f3cdb5", "#d8e8e0", "#f7dcc6", "#e6d7ee", "#fbeec0", "#cfe0f0"], roofs = ["#c55a45", "#d9744f", "#3f8f8a", "#5a6f9a", "#b34a4a"];
    this.rows = [[H * .58, .55, .42], [H * .7, .8, .2], [H * .86, 1.1, 0]].map(([base, sc, d], ri) => {
      const out = []; let x = -20 * k;
      while (x < W) {
        const w = (60 + r() * 70) * k * sc, h = (70 + r() * 120) * k * sc * (ri === 1 && x > W * .5 && x < W * .6 ? 2.4 : 1), b = { x, y: base + (ri < 2 ? Math.sin(x * .004) * 20 * k : 0), w, h, d, wall: pick(walls), roof: pick(roofs), rt: r() < .7 ? "gable" : "flat", win: [] };
        const cols = Math.max(1, (w / (24 * k * sc)) | 0), rows = Math.max(1, ((h - 20 * k) / (30 * k * sc)) | 0);
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) b.win.push({ x: b.x + (i + .5) * w / cols - 5 * k * sc, y: b.y - h + 14 * k * sc + j * 30 * k * sc, w: 10 * k * sc, h: 14 * k * sc, th: .25 + r() * .7, id: out.length * 100 + i * 10 + j + ri * 1e4 });
        b.chim = r() < .35; out.push(b); x += w + (ri === 2 ? r() * 8 * k : 0);
      }
      return out;
    });
    this.lamps = Array.from({ length: Math.ceil(W / (200 * k)) }, (_, i) => [i * 200 * k + 100 * k, H * .9]);
    this.tram = { x: -1e4, next: 8 };
    this.perches = this.rows[2].filter((b) => b.rt === "gable").map((b) => [b.x + b.w / 2, b.y - b.h - b.w * .38]);
    this.smoke = [];
    this.gt = () => H * .895; this.gb = H * .975; this.floor = H * .97;
  },
  build(g, S, r, st) {
    const { W, H, k } = S, P = S.pal;
    S.fillRidge(g, this.hills, S.pc("g3", .5));
    for (let i = 0; i < W / 40; i++) S.tree(g, r() * W, S.ry(this.hills, r() * W) + 10 * k, 20 * k, "round", .5);
    for (const row of this.rows) for (const b of row) {
      const { x, y, w, h, d } = b;
      g.fillStyle = S.hx(b.wall, d); g.fillRect(x, y - h, w, h);
      g.fillStyle = S.hx("#3a3050", d, .12); g.fillRect(x + w * .8, y - h, w * .2, h);
      g.fillStyle = S.hx(b.roof, d); g.beginPath();
      if (b.rt === "gable") { g.moveTo(x - 4 * k, y - h); g.lineTo(x + w / 2, y - h - w * .38); g.lineTo(x + w + 4 * k, y - h); } else g.rect(x - 3 * k, y - h - 6 * k, w + 6 * k, 6 * k);
      g.fill();
      if (P.snow > .05) { g.fillStyle = S.hx("#ffffff", d, P.snow); g.beginPath(); if (b.rt === "gable") { g.moveTo(x, y - h - 3 * k); g.lineTo(x + w / 2, y - h - w * .38); g.lineTo(x + w, y - h - 3 * k); g.lineTo(x + w / 2, y - h - w * .3); } else g.rect(x - 3 * k, y - h - 9 * k, w + 6 * k, 4 * k); g.fill(); }
      if (b.chim) { g.fillStyle = S.hx("#8a5a50", d); g.fillRect(x + w * .7, y - h - w * .32, 7 * k, 16 * k); }
      for (const wi of b.win) {
        const on = (st.night > wi.th) !== this.tog.has(wi.id);
        g.fillStyle = on ? `rgba(255,${200 + (wi.th * 40 | 0)},130,${.6 + st.night * .4})` : S.hx("#5a6a8a", d, .85); g.fillRect(wi.x, wi.y, wi.w, wi.h);
        if (P.flowers > .3 && wi.id % 3 === 0) { g.fillStyle = S.pc("fl2", d); g.fillRect(wi.x - 1 * k, wi.y + wi.h, wi.w + 2 * k, 3 * k); }
      }
    }
    g.fillStyle = S.hx("#8b8795"); g.fillRect(0, H * .86, W, H * .14);
    g.fillStyle = S.hx("#a9a4ae"); g.fillRect(0, H * .86, W, H * .025);
    g.strokeStyle = S.hx("#6f6b7a", 0, .5); g.lineWidth = k;
    for (let y = H * .9; y < H; y += 9 * k) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    g.strokeStyle = S.hx("#4a4658"); g.lineWidth = 2 * k; g.beginPath(); g.moveTo(0, H * .84); g.lineTo(W, H * .84); g.stroke();
    for (const [x, y] of this.lamps) { g.fillStyle = S.hx("#3f3b4f"); g.fillRect(x - 2 * k, y - 70 * k, 4 * k, 70 * k); g.fillRect(x - 8 * k, y - 76 * k, 16 * k, 8 * k); }
    const tw = this.rows[1].reduce((a, b) => (b.h > a.h ? b : a));
    this.clock = [tw.x + tw.w / 2, tw.y - tw.h * .75, tw.w * .28];
    g.fillStyle = S.hx("#fffaf0", tw.d); g.beginPath(); g.arc(...this.clock, 0, TAU); g.fill();
  },
  fg(g, S, st) {
    const { W, H, k } = S, t = st.t;
    const [cx, cy, cr] = this.clock; g.strokeStyle = S.hx("#3a3050", .2); g.lineCap = "round";
    [[st.hour / 12 * TAU, .5, 3], [(st.hour % 1) * TAU, .8, 2]].forEach(([a, l, w]) => { g.lineWidth = w * k; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.sin(a) * cr * l, cy - Math.cos(a) * cr * l); g.stroke(); });
    if (st.night > .3) { g.globalCompositeOperation = "lighter"; for (const [x, y] of this.lamps) { const s = 110 * k * (this.flick && this.flick[x] > 0 ? R() : 1); g.globalAlpha = st.night * .9; g.drawImage(S.glowS, x - s / 2, y - 72 * k - s / 2, s, s); } g.globalCompositeOperation = "source-over"; g.globalAlpha = 1; }
    if (this.flick) for (const x in this.flick) this.flick[x] -= st.dt;
    const tr = this.tram;
    if ((tr.next -= st.dt) < 0 && tr.x < -1e3) { tr.x = -260 * k; tr.v = 90 * k; S.snd("bell", 0, .6); }
    if (tr.x > -1e3) {
      tr.x += tr.v * st.dt; const y = H * .86, w = 220 * k, h = 60 * k;
      g.fillStyle = S.hx("#3f8f8a"); g.fillRect(tr.x, y - h, w, h * .55); g.fillStyle = S.hx("#f6ead0"); g.fillRect(tr.x, y - h * .45, w, h * .4);
      g.fillStyle = st.night > .3 ? "rgba(255,220,150,.95)" : S.hx("#9bc0d8"); for (let i = 0; i < 6; i++) g.fillRect(tr.x + 10 * k + i * 34 * k, y - h * .88, 24 * k, h * .35);
      g.strokeStyle = S.hx("#3a3050"); g.lineWidth = 2 * k; g.beginPath(); g.moveTo(tr.x + w * .5, y - h); g.lineTo(tr.x + w * .4, H * .84); g.stroke();
      if (tr.x > W + 10) { tr.x = -1e4; tr.next = U.rr(15, 40); }
    }
    if ((st.snow > .3 || st.night > .5 || st.pal.leaves > .5) && R() < st.dt * 3) { const b = pick(this.rows[1].concat(this.rows[2]).filter((b) => b.chim)); if (b) this.smoke.push({ x: b.x + b.w * .7 + 3 * k, y: b.y - b.h - b.w * .32, a: .5, r: 4 * k }); }
    g.fillStyle = S.hx("#e8e6ef", 0, 1);
    for (let i = this.smoke.length - 1; i >= 0; i--) { const s = this.smoke[i]; s.y -= 12 * k * st.dt; s.x += st.wind * 14 * k * st.dt; s.r += 5 * k * st.dt; s.a -= st.dt * .12; if (s.a <= 0) { this.smoke.splice(i, 1); continue; } g.globalAlpha = s.a * .6; g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
  },
  emit(S) { return [R() * S.W, -10]; },
  tap(S, x, y) {
    const [cx, cy, cr] = this.clock;
    if (S.hit(x, y, cx, cy, cr * 1.6)) { S.snd("bell", x, 1); setTimeout(() => S.snd("bell", x, .7), 900); return true; }
    const tr = this.tram; if (tr.x > -1e3 && x > tr.x && x < tr.x + 220 * S.k && y > S.H * .78 && y < S.H * .87) { S.snd("bell", x, 1); return true; }
    for (const [lx, ly] of this.lamps) if (S.hit(x, y, lx, ly - 70 * S.k, 22 * S.k, 40 * S.k)) { (this.flick ||= {})[lx] = 1.2; S.snd("click", x, .6); return true; }
    for (const row of [this.rows[2], this.rows[1]]) for (const b of row) for (const w of b.win) if (x > w.x - 4 && x < w.x + w.w + 4 && y > w.y - 4 && y < w.y + w.h + 4) {
      this.tog.has(w.id) ? this.tog.delete(w.id) : this.tog.add(w.id); S.ver++; S.snd("click", x, .7); return true;
    }
  },
};

window.SCENES = { meadow, forest, mountain, beach, city };
})();
