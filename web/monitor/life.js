(() => {
const { R, TAU, rr, pick, clamp, lerp } = U;
const calm = (s) => 1 - s.rain * .7;
// hab: g ground, a air, w water, p perch · sp: [walk, run] px/s · size: unit→px scale
const SP = {
  deer: { hab: "g", size: 2.4, sh: 20, h: 62, sp: [26, 150], cols: ["#b07a4f", "#c38b5c", "#9c6b47"], fear: ["fox", "dog"], friends: ["rabbit", "spirit"], call: "bleat", tap: ["flee", "look", "heart", "look"], mate: 1, act: (s) => (.4 + .6 * (1 - Math.abs(s.light - .5) * 2) + .3 * s.light) * calm(s) },
  rabbit: { hab: "g", size: 1.7, sh: 9, h: 26, sp: [30, 190], cols: ["#c9a27e", "#ece6dc", "#8f7d6e"], fear: ["fox", "hawk", "dog", "cat"], friends: ["deer", "rabbit", "spirit"], call: "squeak", tap: ["hop", "flee", "hide", "look", "hop"], mate: 1.4, hop: 1, burrow: 1, act: (s) => (.5 + .5 * s.light) * calm(s) },
  fox: { hab: "g", size: 1.5, sh: 15, h: 30, sp: [38, 220], cols: ["#e07a3a", "#d86a2e"], prey: ["rabbit", "marmot", "squirrel", "crab", "fuzz"], call: "yip", tap: ["look", "flee", "spin", "look"], mate: .5, act: (s) => .6 + .4 * s.golden + .3 * s.night },
  squirrel: { hab: "g", size: 1.2, sh: 7, h: 26, sp: [45, 200], cols: ["#b5673a", "#8a5a3a"], fear: ["fox", "hawk", "cat"], friends: ["spirit"], call: "squeak", tap: ["hop", "spin", "flee"], hop: 1, burrow: 1, mate: 1, act: (s) => s.light * calm(s) * (1 - s.snow * .6) },
  marmot: { hab: "g", size: 1.3, sh: 8, h: 28, sp: [25, 150], cols: ["#8a6a4e", "#a07a58"], fear: ["fox", "hawk"], friends: ["marmot"], call: "whistle", tap: ["look", "hide", "whistle"], burrow: 1, mate: 1, act: (s) => s.light * calm(s) * (1 - s.snow) },
  cat: { hab: "g", size: 1.5, sh: 11, h: 30, sp: [28, 200], cols: ["#2c2a33", "#e39a4f", "#9a98a6", "#f2eee6"], prey: ["pigeon", "bird", "fuzz"], friends: ["cat", "dog"], call: "meow", tap: ["heart", "roll", "look", "meow", "flee"], mate: .6, act: () => 1 },
  dog: { hab: "g", size: 1.5, sh: 15, h: 32, sp: [45, 230], cols: ["#c7955e", "#f2eee6", "#5a4a42"], prey: ["pigeon", "gull"], friends: ["dog", "cat"], call: "bark", tap: ["heart", "hop", "spin", "bark"], mate: .4, act: (s) => .5 + .5 * s.light },
  crab: { hab: "g", size: 1.1, sh: 9, h: 16, sp: [22, 90], cols: ["#e2574c", "#f07a4a"], fear: ["gull", "dog"], friends: ["crab", "turtle"], call: "click", tap: ["hide", "flee", "look", "snap"], side: 1, burrow: 1, mate: .8, act: (s) => (1 - s.snow * .7) },
  turtle: { hab: "g", size: 1.3, sh: 11, h: 16, sp: [7, 14], cols: ["#6f9a6a"], friends: ["crab"], tap: ["hide", "look"], act: (s) => s.light * (1 - s.snow) },
  spirit: { hab: "g", size: 1.2, sh: 6, h: 30, sp: [16, 60], cols: ["#f4f3ec"], fear: ["fox"], friends: ["spirit", "deer", "rabbit", "squirrel"], call: "rattle", tap: ["rattle", "hop", "look", "hide", "rattle"], burrow: 1, mate: .6, act: (s) => .6 + .4 * s.night },
  fuzz: { hab: "g", size: 1.1, sh: 7, h: 18, sp: [40, 170], cols: ["#1d1b22"], fear: ["cat", "dog"], friends: ["fuzz"], call: "squeak", tap: ["hide", "hop", "flee"], hop: 1, burrow: 1, act: (s) => .25 + .75 * s.night },
  frog: { hab: "g", size: 1.4, sh: 7, h: 14, sp: [20, 140], cols: ["#6cbf5a", "#8fcf62"], fear: ["fox", "bird"], friends: ["frog"], call: "croak", tap: ["hop", "croak", "hop"], hop: 1, mate: 1, act: (s) => (.3 + .7 * s.night) * (1 + s.rain * 2) * (1 - s.snow) * s.pal.fireflies * 1.3 + s.rain * .5 },
  bird: { hab: "a", size: 1.8, sh: 5, h: 14, sp: [90, 280], cols: ["#6d8fc9", "#e9956b", "#8a6a58", "#f2d25a"], fear: ["cat", "hawk", "fox", "dog"], friends: ["bird"], call: "chirp", tap: ["fly", "sing", "look", "fly"], flock: 1, lands: 1, mate: 1, act: (s) => (.1 + s.light) * calm(s) * (1 - s.snow * .4) },
  pigeon: { hab: "a", size: 2.2, sh: 5, h: 14, sp: [80, 250], cols: ["#8f93a6", "#a7a9b8", "#6f7286"], fear: ["cat", "dog"], friends: ["pigeon"], call: "coo", tap: ["fly", "look", "coo"], flock: 1, lands: 1, mate: 1, act: (s) => (.2 + s.light) * calm(s) },
  gull: { hab: "a", size: 1.7, sh: 7, h: 16, sp: [70, 250], cols: ["#f7f6f2"], prey: ["fish", "crab"], friends: ["gull"], call: "gull", tap: ["fly", "call"], glide: 1, lands: 1, act: (s) => (.2 + s.light) * (1 - s.storm * .6) },
  hawk: { hab: "a", size: 1.6, sh: 0, h: 10, sp: [55, 320], cols: ["#6a4a3a"], prey: ["rabbit", "marmot", "squirrel", "fish"], call: "screech", tap: ["fly", "call"], glide: 1, circle: 1, act: (s) => s.light * calm(s) },
  butterfly: { hab: "a", size: 1.6, sh: 0, h: 10, sp: [40, 110], cols: ["#ffd36e", "#f7a8c8", "#b8a4f5", "#ffffff", "#8fd3ff"], fear: ["bird"], friends: ["butterfly"], tap: ["fly", "heart"], flutter: 1, mate: 1, act: (s) => s.light * (1 - s.rain) * (s.pal.flowers + .1) },
  owl: { hab: "p", size: 1.1, sh: 0, h: 40, cols: ["#8a7060", "#a08a70"], call: "hoot", tap: ["hoot", "look", "spin", "hoot"], act: (s) => s.night * (1 - s.rain * .5) },
  fish: { hab: "w", size: 1.2, sh: 0, h: 10, sp: [20, 90], cols: ["#f08a4b", "#f4f1ea", "#e24c3c", "#5b6b7a"], fear: ["gull", "hawk"], friends: ["fish"], call: "splash", tap: ["jump"], act: () => 1 },
  whale: { hab: "w", size: 2, sh: 0, h: 30, sp: [8, 12], cols: ["#4a5f7a"], call: "whale", tap: ["spout"], act: () => .5 },
};
for (const k in SP) for (const p of SP[k].prey || []) (SP[p].fear ||= []).includes(k) || SP[p].fear.push(k);
const MATE = [1, .5, .25, .08], d0 = (a) => a.d.hab === "w" || a.d.hab === "p";

class Life {
  constructor(S) { this.S = S; this.a = []; this.n = 0; this.soc = 0; this.pop = 0; }
  reset() { this.a.length = 0; this.first = true; }
  get sc() { return this.S.scene; }
  gy(a) { return lerp(this.sc.gt(a.x), this.sc.gb, a.z); }
  scale(a) { return this.S.k * a.d.size * (a.d.hab === "g" ? lerp(.55, 1.15, a.z) : 1) * (a.baby ? .55 + a.age * .45 : 1); }
  emo(a, ch, t = 2) { a.emo = ch; a.emoT = t; }
  call(a, v = 1) { a.d.call && this.S.snd(a.d.call, a.x, v * (a.d.hab === "g" ? .4 + a.z * .6 : .7)); }
  go(a, st, tt, tx, tz) { a.st = st; a.tt = tt; if (tx != null) a.tx = tx; if (tz != null) a.tz = tz; }

  spawn(sp, on, near) {
    const d = SP[sp], S = this.S, sc = this.sc, { W, H, k } = S;
    const a = { sp, d, id: ++this.n, z: R(), dir: R() < .5 ? 1 : -1, st: "idle", tt: rr(1, 5), an: R() * TAU, col: pick(d.cols), love: R() * .6, hunger: R() * .8, male: R() < .5, jump: 0, hide: 0, fade: on ? 1 : 0, emoT: 0, tapN: 0, spin: 0, walk: 0, age: 1, vx: 0, vy: 0, ph: R() * TAU };
    if (d.hab === "g") {
      a.x = on ? R() * W : a.dir > 0 ? -50 * k : W + 50 * k; if (!on) this.go(a, "walk", 20, rr(.15, .85) * W, a.z);
      if (near) Object.assign(a, { x: near.x + rr(-30, 30) * k, z: near.z, dir: near.dir });
    } else if (d.hab === "a") {
      a.x = on ? R() * W : R() < .5 ? -60 * k : W + 60 * k; a.y = rr(.06, .42) * H; a.dir = a.x < W / 2 ? 1 : -1; a.vx = a.dir * d.sp[0] * k; this.go(a, "fly", rr(3, 10));
      if (d.flutter) a.y = rr(.55, .85) * H;
      if (d.circle) Object.assign(a, { cx: rr(.2, .8) * W, cy: rr(.1, .3) * H, cr: rr(80, 200) * k, st: "circle" });
      if (on && d.lands && R() < .5) { a.z = R(); a.x = R() * W; a.y = this.gy(a); a.st = "ground"; a.tt = rr(3, 10); }
    } else if (d.hab === "w") {
      const w = sc.water; if (!w) return null;
      if (sp === "whale") { if (!w.rect) return null; Object.assign(a, { x: R() * W, y: w.surf + rr(4, 20) * k, st: "deep", tt: rr(10, 40), dir: R() < .5 ? 1 : -1 }); }
      else this.waterPos(a);
      a.fade = 1;
    } else {
      if (!sc.perches || !sc.perches.length) return null;
      const [x, y] = pick(sc.perches); Object.assign(a, { x, y, st: "perch", tt: rr(5, 20), look: 0 });
    }
    if (near) Object.assign(a, { baby: 1, age: 0, follow: near });
    this.a.push(a); return a;
  }
  waterPos(a) {
    const w = this.sc.water, k = this.S.k;
    if (w.ell) { const e = w.ell, t = R() * TAU, u = Math.sqrt(R()) * .8; a.x = e.cx + Math.cos(t) * u * e.rx; a.y = e.cy + Math.sin(t) * u * e.ry * .7; }
    else { const [x0, y0, x1, y1] = w.rect; a.x = rr(x0, x1); a.y = rr(y0 + 20 * k, y1 - 10 * k); }
    a.st = "swim"; a.tt = rr(4, 12); a.vx = a.dir * a.d.sp[0] * k;
  }
  inWater(x, y) { const w = this.sc.water; if (!w) return false; if (w.ell) return this.S.hit(x, y, w.ell.cx, w.ell.cy, w.ell.rx * .9, w.ell.ry * .8); const [x0, y0, x1, y1] = w.rect; return x > x0 && x < x1 && y > y0 && y < y1; }

  // population follows the animals knob × each species' activity (time, weather, season)
  census(st) {
    const kn = st.kn.animals * 2, life = this.sc.life;
    for (const sp in life) {
      const want = Math.round(life[sp] * kn * clamp(SP[sp].act(st), 0, 2) + (this.first ? 0 : 0));
      const have = this.a.filter((a) => a.sp === sp && !a.leave);
      if (this.first) { for (let i = 0; i < want; i++) this.spawn(sp, true); continue; }
      if (have.length < want && R() < .3) this.spawn(sp, false);
      else if (have.length > want && R() < .25) { const a = pick(have.filter((a) => !a.baby)); if (a) this.leave(a); }
    }
    this.first = false;
  }
  leave(a) {
    a.leave = 1; const { W, k } = this.S;
    if (a.d.burrow || a.d.hab === "w" || a.d.hab === "p") this.go(a, "hide", 3);
    else if (a.d.hab === "g") this.go(a, "walk", 60, a.x < W / 2 ? -80 * k : W + 80 * k);
    else { this.go(a, "fly", 30); a.tx = a.x < W / 2 ? -200 * k : W + 200 * k; a.ty = -100 * k; }
  }

  frame(g, st) {
    const S = this.S; if (!this.sc.life) return;
    if ((this.pop -= st.dt) <= 0) { this.pop = 1; this.census(st); }
    if ((this.soc -= st.dt) <= 0) { this.soc = .3; this.social(st); }
    for (let i = this.a.length - 1; i >= 0; i--) { const a = this.a[i]; this.update(a, st); if (a.gone) this.a.splice(i, 1); }
    const w = [], gr = [], air = [];
    for (const a of this.a) (a.d.hab === "w" ? w : a.d.hab === "g" || a.st === "ground" ? gr : air).push(a);
    gr.sort((a, b) => a.y - b.y);
    for (const list of [w, gr, air]) for (const a of list) this.draw(g, a, st);
    g.setTransform(S.s, 0, 0, S.s, 0, 0);
    g.textAlign = "center"; g.font = `${14 * S.k + 6}px "Blex Mono Local",monospace`;
    for (const a of this.a) if (a.emoT > 0) { g.globalAlpha = Math.min(1, a.emoT); g.fillStyle = a.emo === "♥" ? "#ff7a9c" : "#fff"; g.fillText(a.emo, a.x, a.y - (a.s || S.k) * (a.d.h || 22) - 8 * S.k - (2 - a.emoT) * 10 * S.k); }
    g.globalAlpha = 1;
  }

  near(a, test, r) { let best = null, bd = r * r; for (const b of this.a) if (b !== a && !b.gone && test(b)) { const d = (b.x - a.x) ** 2 + (b.y - a.y) ** 2; if (d < bd) { bd = d; best = b; } } return best; }

  social(st) {
    const k = this.S.k, mf = MATE[st.si];
    for (const a of this.a) {
      if (a.leave || a.st === "hide" || a.fade < 1 || d0(a)) continue;
      const d = a.d, busy = ["run", "court", "greet", "pounce", "dive"].includes(a.st);
      const threat = d.fear && this.near(a, (b) => d.fear.includes(b.sp) && b.st !== "hide" && (b.hunt || b.st === "dive" || b.d.hab === "g"), 170 * k * (d.hab === "a" ? .8 : 1));
      if (threat && a.st !== "run" && !(a.d.hab === "a" && a.st !== "ground" && a.st !== "perch")) { this.flee(a, threat.x, threat.y); if (R() < .5) this.call(a, .8); continue; }
      if (d.prey && !busy) {
        a.hunger += .3 / 30;
        if (a.hunger > 1) { const p = this.near(a, (b) => d.prey.includes(b.sp) && b.st !== "hide" && !b.leave, 450 * k); if (p) { a.hunt = p; if (d.hab === "a") this.go(a, "dive", 4); else this.go(a, "stalk", 8); } }
      }
      if (busy || a.baby || a.follow) continue;
      a.love += .3 * (d.mate || 0) * mf * .05;
      if (a.love > 1 && (a.st === "idle" || a.st === "walk" || a.st === "ground")) {
        const m = this.near(a, (b) => b.sp === a.sp && b.male !== a.male && b.love > .8 && !b.baby && !b.follow && !b.leave, 260 * k);
        if (m) { for (const x of [a, m]) { this.go(x, "court", 3.5); x.mate = x === a ? m : a; x.love = 0; this.emo(x, "♥", 3); } this.call(a, .7); continue; }
      }
      if ((a.st === "idle" || a.st === "ground") && d.friends && R() < .12) {
        const f = this.near(a, (b) => d.friends.includes(b.sp) && (b.st === "idle" || b.st === "walk" || b.st === "ground"), 150 * k);
        if (f) for (const x of [a, f]) { this.go(x, "greet", 2.5); x.mate = x === a ? f : a; this.emo(x, R() < .5 ? "♪" : "!", 2); }
      }
    }
  }

  flee(a, fx, fy) {
    const { k, W } = this.S; this.emo(a, "!", 1.2);
    if (a.d.hab === "a") { this.takeOff(a, fx); return; }
    if (a.d.burrow && R() < .35) { this.go(a, "hide", 2); return; }
    a.dir = a.x > fx ? 1 : -1; this.go(a, "run", rr(1.5, 3), clamp(a.x + a.dir * rr(200, 400) * k, -60 * k, W + 60 * k), clamp(a.z + rr(-.3, .3), 0, 1));
  }
  takeOff(a, fx) { const k = this.S.k; a.dir = a.x > fx ? 1 : -1; a.vx = a.dir * a.d.sp[1] * k * .6; a.vy = -a.d.sp[1] * k * .5; this.go(a, "fly", rr(3, 8)); a.ty = rr(.05, .3) * this.S.H; a.tx = a.x + a.dir * rr(200, 600) * k; }

  update(a, st) {
    const S = this.S, d = a.d, dt = st.dt, k = S.k, { W, H } = S;
    a.fade = Math.min(1, a.fade + dt); a.emoT -= dt; a.spin = Math.max(0, a.spin - dt * 1.5); a.jump = Math.max(0, a.jump - dt * 1.8);
    if (a.baby) { a.age = Math.min(1, a.age + dt / 180); if (a.age >= 1) { a.baby = 0; a.follow = null; } }
    if (a.follow && (a.follow.gone || a.follow.leave)) a.follow = null;
    a.tt -= dt; a.walk = 0; a.s = this.scale(a);
    if (a.st === "hide") { a.hide += dt * 1.5; if (a.hide >= 1) a.gone = 1; return this.place(a); }
    if (d.hab === "w") return this.swim(a, st);
    if (d.hab === "p") { a.look = Math.sin(st.t * .5 + a.ph) * (R() < .003 ? 3 : 1); if (a.tt < 0) { a.tt = rr(6, 20); if (st.night > .5) this.call(a, .8); } return; }
    if (d.hab === "a" && a.st !== "ground" && a.st !== "hopg") return this.fly(a, st);
    const spd = (s) => s * k * lerp(.55, 1.15, a.z) * (a.baby ? .8 : 1);
    const moveTo = (tx, tz, v) => { const dx = tx - a.x; if (Math.abs(dx) > 3) { a.dir = d.side ? a.dir : Math.sign(dx); a.x += Math.sign(dx) * Math.min(Math.abs(dx), v * dt); a.walk = 1; } if (tz != null) a.z += clamp(tz - a.z, -dt * .15, dt * .15); a.an += dt * v / (8 * k * d.size + 1) * (d.hop ? .6 : 1); return Math.abs(dx) <= 3; };
    switch (a.st) {
      case "idle": case "ground":
        if (a.follow) { const f = a.follow; if (Math.abs(f.x - a.x) > 40 * k) moveTo(f.x - f.dir * 30 * k, f.z, spd(f.st === "run" ? d.sp[1] : d.sp[0] * 1.3)); break; }
        if (a.tt < 0) {
          if (a.st === "ground" && R() < .3) { this.takeOff(a, a.x - a.dir); break; }
          a.pose = pick(["graze", "look", "sit", "graze"]);
          if (R() < .65) this.go(a, a.st === "ground" ? "hopg" : "walk", 20, clamp(a.x + rr(-300, 300) * k, 20 * k, W - 20 * k), clamp(a.z + rr(-.25, .25), 0, 1));
          else a.tt = rr(2, 7);
          if (R() < .15) this.call(a, .6);
        }
        break;
      case "hopg": if (moveTo(a.tx, a.tz, spd(20)) || a.tt < 0) this.go(a, "ground", rr(2, 6)); break;
      case "walk": if (moveTo(a.tx, a.tz, spd(d.sp[0])) || a.tt < 0) { if (a.leave) a.gone = 1; else this.go(a, "idle", rr(2, 8)); } break;
      case "run": if (moveTo(a.tx, a.tz, spd(d.sp[1])) || a.tt < 0) this.go(a, "idle", rr(1, 3)); break;
      case "court": case "greet":
        if (a.mate && !a.mate.gone) { const m = a.mate; if (Math.abs(m.x - a.x) > 26 * k) moveTo(m.x, m.z, spd(d.sp[0])); else a.dir = Math.sign(m.x - a.x) || a.dir; }
        if (a.tt < 0) {
          const m = a.mate; a.mate = null; this.go(a, "idle", rr(1, 3));
          if (a.st === "idle" && m && !a.male && d.hab === "g" && st.si < 2 && R() < .5 && this.a.filter((b) => b.sp === a.sp).length < (this.sc.life[a.sp] || 1) * st.kn.animals * 2 + 1) { const b = this.spawn(a.sp, true, a); if (b) this.emo(b, "✿", 2); }
          else if (m && !m.gone && R() < .5 && !m.follow) m.follow = a, setTimeout(() => (m.follow === a ? (m.follow = null) : 0), rr(20, 40) * 1000);
        }
        break;
      case "stalk": case "pounce": {
        const p = a.hunt; if (!p || p.gone || p.st === "hide" || a.tt < 0) { a.hunt = null; this.go(a, "idle", rr(2, 5)); break; }
        const dx = Math.abs(p.x - a.x);
        if (a.st === "stalk") { moveTo(p.x, p.z, spd(d.sp[0] * .6)); if (dx < 110 * k) { this.go(a, "pounce", 2.5); a.jump = .8; this.call(a, .6); } }
        else if (moveTo(p.x, p.z, spd(d.sp[1])) || dx < 14 * k) { if (R() < .25 && p.st !== "hide") { p.leave = 1; this.go(p, "hide", 1); this.emo(a, "♪"); a.hunger = 0; } a.hunt = null; this.go(a, "idle", rr(3, 6)); }
        break;
      }
    }
    this.place(a);
  }
  place(a) { if (a.d.hab === "g" || a.st === "ground" || a.st === "hopg") { a.y = this.gy(a); a.s = this.scale(a); } }

  fly(a, st) {
    const S = this.S, d = a.d, dt = st.dt, k = S.k, { W, H } = S, v = d.sp[0] * k;
    a.an += dt * (d.glide ? 3 : d.flutter ? 18 : 12); a.s = this.scale(a);
    let tx = a.tx, ty = a.ty;
    if (a.st === "circle") { const t = st.t * .3 + a.ph; tx = a.cx + Math.cos(t) * a.cr; ty = a.cy + Math.sin(t) * a.cr * .4; if (a.tt < 0) { a.tt = rr(8, 20); a.cx = clamp(a.cx + rr(-200, 200) * k, 100 * k, W - 100 * k); if (R() < .3) this.call(a, .6); } }
    else if (a.st === "dive") {
      const p = a.hunt; if (!p || p.gone || a.tt < 0) { a.hunt = null; this.go(a, d.circle ? "circle" : "fly", rr(4, 10)); a.cy = rr(.1, .3) * H; }
      else { tx = p.x; ty = p.y - 6 * k; if (Math.hypot(tx - a.x, ty - a.y) < 14 * k) { if (p.d.hab === "w") S.ripple(p.x, p.y, 3), S.snd("splash", p.x, .7); if (R() < .3) { p.leave = 1; this.go(p, "hide", 1); a.hunger = 0; } a.hunt = null; this.go(a, d.circle ? "circle" : "fly", rr(4, 8)); a.vy = -v * 2; } }
    } else if (a.st === "perch") { a.vx = a.vy = 0; if (a.tt < 0) this.takeOff(a, a.x - a.dir); a.an = 0; return; }
    else if (a.st === "land") { if (Math.hypot(a.tx - a.x, a.ty - a.y) < 6 * k) { if (a.perch) this.go(a, "perch", rr(5, 20)); else { this.go(a, "ground", rr(3, 12)); a.y = this.gy(a); } a.vx = a.vy = 0; return; } }
    else if (a.tt < 0 || tx == null || Math.hypot(tx - a.x, ty - a.y) < 30 * k) {
      if (a.leave && (a.x < -100 * k || a.x > W + 100 * k || a.y < -60 * k)) { a.gone = 1; return; }
      if (a.leave) { tx = a.tx; ty = a.ty; }
      else if (d.lands && R() < .35) {
        const sc = this.sc;
        if (sc.perches && sc.perches.length && R() < .4) { const [px, py] = pick(sc.perches); Object.assign(a, { tx: px + rr(-20, 20) * k, ty: py, perch: 1 }); }
        else { a.z = R(); a.tx = clamp(a.x + rr(-300, 300) * k, 20 * k, W - 20 * k); a.x0 = a.x; const x = a.x; a.x = a.tx; a.ty = this.gy(a); a.x = x; a.perch = 0; }
        this.go(a, "land", 12); tx = a.tx; ty = a.ty;
      } else { this.go(a, "fly", rr(3, 9)); tx = a.tx = rr(.05, .95) * W; ty = a.ty = d.flutter ? rr(.5, .9) * H : rr(.05, .45) * H; }
    }
    if (a.st === "land") { tx = a.tx; ty = a.ty; }
    // steer + flock alignment
    const dx = tx - a.x, dy = ty - a.y, dd = Math.hypot(dx, dy) || 1, sp = a.st === "dive" ? d.sp[1] * k : v * (a.st === "land" ? .8 : 1);
    let ax = dx / dd * sp - a.vx, ay = dy / dd * sp - a.vy;
    if (d.flock && a.st === "fly") { const f = this.near(a, (b) => b.sp === a.sp && b.st === "fly", 140 * k); if (f) { ax += (f.vx - a.vx) * .8; ay += (f.vy - a.vy) * .8; } }
    if (d.flutter) { ax += Math.sin(st.t * 3 + a.ph) * 120 * k; ay += Math.cos(st.t * 4.3 + a.ph) * 140 * k; }
    const turn = Math.min(1, dt * (d.glide ? 1.2 : 2.5)); a.vx += ax * turn; a.vy += ay * turn;
    a.vx += st.wind * 10 * k * dt; a.x += a.vx * dt; a.y += a.vy * dt;
    if (Math.abs(a.vx) > 5 * k) a.dir = Math.sign(a.vx);
  }

  swim(a, st) {
    const S = this.S, dt = st.dt, k = S.k;
    a.an += dt * 6; a.s = this.scale(a);
    if (a.sp === "whale") {
      if (a.tt < 0) { const nx = { deep: "surf", surf: R() < .5 ? "tail" : "deep", tail: "deep" }[a.st]; this.go(a, nx, nx === "deep" ? rr(25, 70) : nx === "surf" ? rr(6, 10) : 3); if (nx === "surf") { this.call(a, .8); a.spout = 2; } }
      a.x += a.dir * a.d.sp[0] * k * dt; a.spout = Math.max(0, (a.spout || 0) - dt);
      if (a.x < -300 * k || a.x > S.W + 300 * k) a.dir *= -1;
      return;
    }
    if (a.st === "jump") { a.jt += dt / 1.1; a.x += a.vx * dt; if (a.jt >= 1) { S.ripple(a.x, a.y, 3); a.st = "swim"; a.tt = rr(4, 12); } return; }
    if (a.lure) { const [lx, ly] = a.lure; a.vx += (lx - a.x) * dt * .8; a.vy = (ly - a.y) * .8; if (Math.hypot(lx - a.x, ly - a.y) < 20 * k) { a.lure = null; this.jump(a); } }
    else { a.vx += Math.sin(st.t * .4 + a.ph) * 8 * k * dt; a.vy = Math.sin(st.t * .6 + a.ph) * 6 * k; }
    a.vx = clamp(a.vx, -a.d.sp[1] * k, a.d.sp[1] * k);
    const nx = a.x + a.vx * dt, ny = a.y + a.vy * dt;
    if (this.inWater(nx, ny)) { a.x = nx; a.y = ny; } else { a.vx *= -1; }
    if (Math.abs(a.vx) > 2) a.dir = Math.sign(a.vx);
    if (a.tt < 0) { a.tt = rr(5, 15); if (R() < .35) this.jump(a); }
  }
  jump(a) { a.st = "jump"; a.jt = 0; a.vx = a.dir * 40 * this.S.k; this.S.ripple(a.x, a.y, 3); this.call(a, .6); }

  // ── interaction ──
  tap(x, y) {
    const k = this.S.k; let best = null, bd = 1e9;
    for (const a of this.a) { if (a.st === "hide" || a.sp === "whale" && a.st === "deep") continue; const r = Math.max(30 * k, (a.s || k) * (a.d.h || 22) * .8), dy = a.d.hab === "g" || a.st === "ground" || a.d.hab === "p" ? (a.s || k) * (a.d.h || 22) * .5 : 0, d = Math.hypot(a.x - x, a.y - dy - y); if (d < r && d < bd) { bd = d; best = a; } }
    if (!best) return false;
    const a = best, now = this.S.t; a.tapN = now - a.tapT < 5 ? a.tapN + 1 : 1; a.tapT = now;
    let r = a.tapN > 3 ? "flee" : pick(a.d.tap);
    if (a.d.hab === "a" && a.st !== "ground" && a.st !== "perch" && r !== "call") r = pick(["spin", "call", "sing"]);
    this.react(a, r, x, y); return true;
  }
  react(a, r, x, y) {
    const k = this.S.k;
    switch (r) {
      case "flee": this.flee(a, x, y); break;
      case "fly": a.d.hab === "a" ? this.takeOff(a, x) : this.flee(a, x, y); this.call(a); break;
      case "hop": a.jump = 1; this.emo(a, "♪"); this.call(a, .6); break;
      case "look": a.dir = Math.sign(x - a.x) || a.dir; a.pose = "look"; a.tt = 3; this.emo(a, "?"); break;
      case "heart": case "roll": a.pose = r === "roll" ? "roll" : "sit"; a.tt = 4; this.emo(a, "♥", 2.5); this.call(a, .8); break;
      case "spin": a.spin = 1; this.emo(a, "✦"); this.call(a, .6); break;
      case "hide": this.go(a, "hide", 2); this.emo(a, "…", 1); a.leave = 1; break;
      case "rattle": for (const b of this.a) if (b.sp === a.sp && Math.abs(b.x - a.x) < 400 * k) { b.rattle = 1.6; this.emo(b, "♪", 1.5); } this.call(a, 1); break;
      case "jump": this.jump(a); break;
      case "spout": a.st = "surf"; a.tt = 6; a.spout = 2; this.call(a); break;
      default: this.call(a); this.emo(a, "♪"); a.pose = "look"; a.tt = 2;
    }
  }
  startle(x, y, r) { for (const a of this.a) if (Math.hypot(a.x - x, a.y - y) < r && a.d.hab !== "w" && a.d.hab !== "p") { if (a.d.prey) { a.dir = Math.sign(x - a.x); a.pose = "look"; this.emo(a, "?"); } else this.flee(a, x, y); } }
  flush(x, y, r, only) { for (const a of this.a) if ((!only || a.sp === only) && a.d.hab === "a" && Math.hypot(a.x - x, a.y - y) < r) { this.takeOff(a, x); if (R() < .4) this.call(a, .6); } }
  lure(x, y, only) {
    for (const a of this.a) {
      if (only && a.sp !== only) continue;
      if (a.d.hab === "w" && a.sp !== "whale" && a.st !== "jump" && Math.hypot(a.x - x, a.y - y) < 300 * this.S.k) a.lure = [x, y];
      else if (only && a.d.hab === "g") { this.go(a, "walk", 8, x + rr(-40, 40) * this.S.k, a.z); this.emo(a, "!", 1.5); }
    }
    if (!only && this.sc.water && !this.a.some((a) => a.lure) && R() < .5) { const f = this.a.find((a) => a.sp === "whale"); if (f) this.react(f, "spout"); }
  }

  // ── drawing: local units, facing +x, feet at y=0 ──
  draw(g, a, st) {
    const S = this.S; let s = a.s || S.k;
    const hideA = (1 - a.hide) * a.fade; if (hideA <= 0) return;
    let y = a.y, jy = 0;
    if (a.jump > 0) jy = -Math.sin(a.jump * Math.PI) * 30 * s;
    if (a.d.hop && a.walk) jy -= Math.abs(Math.sin(a.an)) * 7 * s;
    if (a.d.hab === "g" || a.st === "ground" || a.st === "hopg") { g.setTransform(S.s, 0, 0, S.s, 0, 0); g.globalAlpha = .18 * hideA; g.fillStyle = S.hx("#1a1a30"); g.beginPath(); g.ellipse(a.x, y, (a.d.sh || 6) * s, 2.2 * s, 0, 0, TAU); g.fill(); }
    if (a.st === "hide" && a.d.burrow) y += a.hide * 12 * s;
    const sx = a.spin ? Math.cos(a.spin * TAU * 2) : 1, rot = a.pose === "roll" && a.st === "idle" && a.tt > 0 ? Math.PI : 0;
    const c = Math.cos(rot), sn = Math.sin(rot);
    g.setTransform(S.s * s * a.dir * sx * c, S.s * s * sn, -S.s * s * a.dir * sx * sn, S.s * s * c, a.x * S.s, (y + jy + (rot ? -12 * s : 0)) * S.s);
    g.globalAlpha = hideA * (a.d.hab === "w" && a.st !== "jump" && a.sp !== "whale" ? .35 : 1);
    (DRAW[a.sp] || DRAW.bird)(g, a, st, (h, d = 0, al = 1) => S.hx(h, d, al), S);
    g.globalAlpha = 1;
  }
}

const el = (g, x, y, rx, ry, f, r = 0) => { g.fillStyle = f; g.beginPath(); g.ellipse(x, y, rx, ry, r, 0, TAU); g.fill(); };
const ln = (g, pts, w, s) => { g.strokeStyle = s; g.lineWidth = w; g.lineCap = "round"; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
const legs = (g, a, xs, top, len, col, w) => { const sw = a.walk ? 6 : 0; xs.forEach((x, i) => ln(g, [[x, top], [x + Math.sin(a.an + i * Math.PI * (i % 2 ? 1 : .5)) * sw, top + len]], w, col)); };
const eye = (g, x, y, r = 1.4) => el(g, x, y, r, r, "#1a1420");
const graze = (a) => a.st === "idle" && a.pose === "graze" && !a.follow;

const DRAW = {
  deer(g, a, st, C) {
    const b = C(a.col), gz = graze(a), hb = a.pose === "look" ? -56 : gz ? -8 : -50;
    legs(g, a, [-16, -10, 12, 18], -24, 24, C("#6a4a38"), 3);
    el(g, 0, -32, 23, 10, b); el(g, -2, -28, 16, 5, C("#e8d6bc"));
    if (a.baby) for (const [x, y] of [[-10, -35], [0, -37], [8, -34], [-4, -31]]) el(g, x, y, 1.5, 1.5, C("#fff5e6"));
    el(g, -22, -36, 4, 3, C("#fff8ee"));
    g.fillStyle = b; g.beginPath(); g.moveTo(12, -40); g.quadraticCurveTo(22, hb + 8, 26, hb); g.lineTo(30, hb + 4); g.quadraticCurveTo(26, -30, 18, -28); g.fill();
    el(g, 28, hb, 8, 5, b, gz ? .9 : .2); el(g, 22, hb - 5, 2.5, 5, b, -.6); eye(g, 29, hb - 1); el(g, 35, hb + (gz ? 4 : 1), 1.6, 1.4, "#1a1420");
    if (a.male && !a.baby && st.si !== 3) ln(g, [[24, hb - 5], [22, hb - 16], [18, hb - 22]], 1.6, C("#e8dcc4"));
  },
  rabbit(g, a, st, C) {
    const b = C(st.pal.snow > .5 && a.col !== "#8f7d6e" ? "#f7f5f2" : a.col), up = a.pose === "look" ? -4 : 0;
    el(g, 0, -8, 10, 7.5, b); el(g, 8, -14 + up, 5.5, 5, b); el(g, -9, -9, 3, 3, C("#ffffff"));
    el(g, 6, -23 + up, 2, 8, b, -.15); el(g, 9, -22 + up, 2, 7.5, b, .25); el(g, 9, -22 + up, 1, 5, C("#f3b6c0"), .25);
    eye(g, 10, -15 + up, 1.2); el(g, 13, -13 + up, 1, .8, C("#e89aa6"));
  },
  fox(g, a, st, C) {
    const b = C(a.col), gz = a.st === "stalk";
    legs(g, a, [-10, -6, 8, 12], -12, 12, C("#3a2a2a"), 2.4);
    g.fillStyle = b; g.save(); g.translate(-14, -16); g.rotate(-.5 + Math.sin(st.t * 2 + a.ph) * .15); g.beginPath(); g.ellipse(-10, 0, 13, 5.5, 0, 0, TAU); g.fill(); el(g, -21, 0, 4, 3.4, C("#fff8ee")); g.restore();
    el(g, 0, -16 + (gz ? 3 : 0), 16, 6.5, b); el(g, 4, -12, 8, 3, C("#fff4e6"));
    const hy = gz ? -12 : -21; el(g, 17, hy, 7, 5.5, b);
    g.fillStyle = b; g.beginPath(); g.moveTo(13, hy - 3); g.lineTo(14, hy - 11); g.lineTo(18, hy - 4); g.moveTo(17, hy - 4); g.lineTo(20, hy - 11); g.lineTo(22, hy - 3); g.fill();
    g.beginPath(); g.moveTo(21, hy - 2); g.lineTo(29, hy + 1); g.lineTo(21, hy + 3); g.fill(); el(g, 28.5, hy + 1, 1.3, 1.2, "#1a1420"); eye(g, 20, hy - 1, 1.1);
  },
  squirrel(g, a, st, C) { const b = C(a.col); el(g, 0, -7, 7, 6, b); g.fillStyle = b; g.beginPath(); g.moveTo(-5, -6); g.bezierCurveTo(-20, -8, -16, -30, -6, -26); g.bezierCurveTo(-12, -20, -10, -12, -2, -9); g.fill(); el(g, 6, -12, 4.5, 4, b); el(g, 5, -17, 1.4, 2.5, b); eye(g, 7.5, -13, 1); },
  marmot(g, a, st, C) { const b = C(a.col), up = a.pose === "look" || a.pose === "sit"; if (up) { el(g, 0, -12, 7, 12, b); el(g, 0, -10, 4, 7, C("#d8c0a0")); el(g, 1, -26, 5.5, 5, b); eye(g, 3, -27); } else { el(g, 0, -7, 12, 7, b); el(g, 10, -11, 5, 4.5, b); eye(g, 12, -12); } },
  cat(g, a, st, C) {
    const b = C(a.col), sit = a.st === "idle" && (a.pose === "sit" || a.pose === "look"), hx = sit ? 5 : 13, hy = sit ? -24 : -17;
    g.strokeStyle = b; g.lineWidth = 2.6; g.lineCap = "round"; g.beginPath(); g.moveTo(-10, sit ? -4 : -12); g.quadraticCurveTo(-20, -14, -16 + Math.sin(st.t * 2.2 + a.ph) * 5, -28); g.stroke();
    if (sit) el(g, 0, -10, 8, 10, b); else { legs(g, a, [-8, -5, 7, 10], -9, 9, b, 2.4); el(g, 0, -12, 12, 5.5, b); }
    el(g, hx, hy, 6, 5.5, b); g.fillStyle = b; g.beginPath(); g.moveTo(hx - 5, hy - 2); g.lineTo(hx - 4, hy - 10); g.lineTo(hx - 1, hy - 4); g.moveTo(hx + 1, hy - 4); g.lineTo(hx + 4, hy - 10); g.lineTo(hx + 5, hy - 2); g.fill();
    const blink = Math.sin(st.t * .7 + a.ph) > .97; el(g, hx + 2.5, hy - .5, 1.3, blink ? .2 : 1.5, st.night > .5 ? "#d8f07a" : "#2a2a20");
  },
  dog(g, a, st, C) {
    const b = C(a.col), happy = a.emoT > 0 || a.walk, sit = a.st === "idle" && a.pose === "sit";
    g.strokeStyle = b; g.lineWidth = 3; g.lineCap = "round"; g.beginPath(); g.moveTo(-15, -17); g.lineTo(-22, -26 + Math.sin(st.t * (happy ? 18 : 3)) * 4); g.stroke();
    if (sit) { el(g, -2, -12, 10, 11, b); } else { legs(g, a, [-11, -7, 9, 13], -12, 12, b, 3.2); el(g, 0, -17, 16, 7, b); }
    el(g, 16, -24, 7, 6.5, b); el(g, 22, -21, 4.5, 3.5, b); el(g, 26, -22, 1.6, 1.4, "#1a1420"); el(g, 12, -22, 3, 6, C("#5a4034"), .3); eye(g, 18, -26);
  },
  crab(g, a, st, C) {
    const b = C(a.col), cl = Math.sin(st.t * 4 + a.ph) * .3; a.dir = 1;
    for (const s of [-1, 1]) { for (let i = 0; i < 3; i++) ln(g, [[s * 5, -3], [s * (9 + i * 2), -1 + Math.sin(a.an + i) * a.walk * 2]], 1.2, b); el(g, s * 11, -8, 3.5, 2.6, b, s * cl); }
    el(g, 0, -5, 8, 5, b); ln(g, [[-2, -8], [-3, -13]], 1, b); ln(g, [[2, -8], [3, -13]], 1, b); eye(g, -3, -13.5, 1.2); eye(g, 3, -13.5, 1.2);
  },
  turtle(g, a, st, C) { const hide = a.pose === "look" ? 0 : 1; el(g, 11 * hide, -4, 4, 3, C("#8fb87a")); legs(g, a, [-6, 6], -3, 3, C("#8fb87a"), 2.5); el(g, 0, -6, 12, 7, C(a.col)); for (const x of [-5, 0, 5]) el(g, x, -8, 2.5, 2, C("#557a52")); },
  spirit(g, a, st, C, S) {
    if (st.night > .3) { const s = 40; g.globalAlpha *= st.night * .5; g.drawImage(S.glowS, -s / 2, -18 - s / 2, s, s); g.globalAlpha /= st.night * .5; }
    a.rattle = Math.max(0, (a.rattle || 0) - st.dt); const r = Math.sin(st.t * 38 + a.ph) * .35 * Math.min(1, a.rattle) + Math.sin(st.t * .8 + a.ph) * .08;
    const b = C("#f4f3ec"); el(g, 0, -6, 5, 6.5, b); legs(g, a, [-2, 2], -2, 2, b, 2);
    g.save(); g.translate(0, -13); g.rotate(r); el(g, 0, -6, 8, 7, b); eye(g, -3, -7, 1.3); eye(g, 2.5, -6, 1.3); if (a.ph > 3) eye(g, -.5, -3.5, .9); g.restore();
  },
  fuzz(g, a, st, C) {
    const b = C("#1d1b22", 0); g.strokeStyle = b; g.lineWidth = 1.2; g.beginPath();
    for (let i = 0; i < 16; i++) { const t = i / 16 * TAU; g.moveTo(Math.cos(t) * 5, -7 + Math.sin(t) * 5); g.lineTo(Math.cos(t) * 8.5, -7 + Math.sin(t) * 8.5); } g.stroke();
    el(g, 0, -7, 6.5, 6.5, b); el(g, -2.2, -8, 2, 2.2, "#fff"); el(g, 2.5, -8, 2, 2.2, "#fff"); eye(g, -1.8, -7.6, 1); eye(g, 2.9, -7.6, 1);
  },
  frog(g, a, st, C) { const b = C(a.col), cr = a.emoT > 0 ? Math.abs(Math.sin(st.t * 8)) * 3 : 0; el(g, 0, -5, 8, 5, b); el(g, 6, -3 + 1, 3 + cr, 2 + cr, C("#e7f0b0")); el(g, -6, -2, 4, 2.5, b); el(g, 3, -9, 2.5, 2.5, b); el(g, 7, -9, 2.5, 2.5, b); eye(g, 3.5, -9.5, 1.1); eye(g, 7.5, -9.5, 1.1); },
  bird(g, a, st, C) {
    const b = C(a.col), gr = a.st === "ground" || a.st === "hopg" || a.st === "perch";
    if (gr) { const peck = a.st === "ground" && Math.sin(st.t * 3 + a.ph) > .6 ? 3 : 0; ln(g, [[-1, -3], [-2, 0]], .8, C("#6a4a38")); ln(g, [[1.5, -3], [1, 0]], .8, C("#6a4a38")); el(g, 0, -6, 6, 4.2, b); el(g, -6, -6.5, 3.5, 1.4, b, -.3); el(g, 4.5, -9 + peck, 3.2, 3, b); el(g, 1, -5, 3, 2, C("#f4ead8")); g.fillStyle = C("#e8a040"); g.beginPath(); g.moveTo(7, -9.5 + peck); g.lineTo(10, -8.8 + peck); g.lineTo(7, -8 + peck); g.fill(); eye(g, 5.5, -9.5 + peck, .8); return; }
    const w = Math.sin(a.an) * 7; el(g, 0, 0, 6, 3.5, b); el(g, 5, -1, 2.8, 2.6, b); g.fillStyle = C(a.col, .1); g.beginPath(); g.moveTo(-2, -1); g.lineTo(2, -1); g.lineTo(-1, -2 - w); g.fill(); eye(g, 6, -1.5, .7);
  },
  pigeon(g, a, st, C, S) { DRAW.bird(g, a, st, C, S); },
  gull(g, a, st, C) {
    if (a.st === "ground" || a.st === "hopg" || a.st === "perch") { ln(g, [[0, -4], [0, 0]], 1, C("#e8a040")); el(g, 0, -8, 9, 5, C("#ffffff")); el(g, -2, -9, 8, 3, C("#aab4c4")); el(g, 7, -12, 3.5, 3.3, C("#ffffff")); ln(g, [[10, -12], [13, -11]], 1.4, C("#e8b040")); eye(g, 8, -13, .8); return; }
    const w = Math.sin(a.an) * 5; ln(g, [[-18, -4 - w], [-8, -6 + w * .3], [0, 0], [8, -6 + w * .3], [18, -4 - w]], 2.4, C("#e9edf2")); ln(g, [[-18, -4 - w], [-14, -4.5 - w]], 2.6, C("#3a3a48")); ln(g, [[18, -4 - w], [14, -4.5 - w]], 2.6, C("#3a3a48")); el(g, 0, 0, 6, 2.4, C("#ffffff"));
  },
  hawk(g, a, st, C) { const w = Math.sin(a.an) * (a.st === "dive" ? 0 : 4), b = C(a.col); ln(g, [[-22, -2 - w], [-10, -5], [0, 0], [10, -5], [22, -2 - w]], 4, b); for (const s of [-1, 1]) for (let i = 0; i < 3; i++) ln(g, [[s * 20, -2 - w], [s * (24 + i), -1 - w + i * 1.5]], 1, b); el(g, 0, 0, 7, 3, b); el(g, 7, -1, 2.5, 2.2, C("#e8dcc4")); },
  butterfly(g, a, st, C) { const f = Math.abs(Math.sin(a.an)) * .9 + .1, b = C(a.col); el(g, -3 * f, -4, 5 * f, 4, b, -.4); el(g, 3 * f, -4, 5 * f, 4, b, .4); el(g, -2 * f, 1, 3 * f, 2.5, b, .3); el(g, 2 * f, 1, 3 * f, 2.5, b, -.3); ln(g, [[0, -5], [0, 2]], 1, C("#3a2a2a")); },
  owl(g, a, st, C) {
    const b = C(a.col), lk = clamp(a.look || 0, -1, 1) * 3, bl = Math.sin(st.t * .9 + a.ph) > .96;
    el(g, 0, -14, 9, 13, b); el(g, 0, -12, 6, 8, C("#e8d8c0")); el(g, lk, -26, 9, 8, b);
    g.fillStyle = b; g.beginPath(); g.moveTo(lk - 8, -30); g.lineTo(lk - 7, -37); g.lineTo(lk - 3, -32); g.moveTo(lk + 3, -32); g.lineTo(lk + 7, -37); g.lineTo(lk + 8, -30); g.fill();
    for (const s of [-1, 1]) { el(g, lk + s * 3.6, -26, 3.2, 3.2, C("#fff4d8")); el(g, lk + s * 3.6, -26, 1.8, bl ? .2 : 1.8, st.night > .5 ? "#f2c040" : "#1a1420"); }
    el(g, lk, -23.5, 1, 1.4, C("#d8a040"));
  },
  fish(g, a, st, C) {
    let y = 0; if (a.st === "jump") { y = -Math.sin(a.jt * Math.PI) * 40; g.rotate(Math.cos(a.jt * Math.PI) * -.9); }
    const b = C(a.col), t = Math.sin(a.an) * 3; el(g, 0, y, 9, 3.6, b); g.fillStyle = b; g.beginPath(); g.moveTo(-7, y); g.lineTo(-14, y - 4 + t); g.lineTo(-14, y + 4 + t); g.fill();
    if (a.col === "#f4f1ea") el(g, 2, y - 1, 3, 2, C("#e24c3c")); eye(g, 5, y - 1, .8);
  },
  whale(g, a, st, C) {
    if (a.st === "deep") return;
    const b = C(a.col, .3), up = a.st === "surf" ? Math.min(1, (6 - a.tt) / 2, a.tt) : 0;
    if (up > 0) { el(g, 0, 2 - up * 6, 40, 7 * up, b); if (a.spout > 0) { g.globalAlpha *= Math.min(1, a.spout); for (let i = 0; i < 8; i++) el(g, 18 + Math.sin(i) * 3, -10 - i * 4 - (2 - a.spout) * 8, 2 + i * .5, 2 + i * .4, "rgba(255,255,255,.8)"); } }
    if (a.st === "tail") { const t = Math.sin(Math.min(1, (3 - a.tt) / 3) * Math.PI); g.fillStyle = b; g.beginPath(); g.moveTo(-4, 2); g.lineTo(0, -20 * t); g.lineTo(-10, -26 * t); g.moveTo(0, -20 * t); g.lineTo(10, -26 * t); g.lineTo(4, 2); g.fill(); }
  },
};
window.Life = Life;
})();
