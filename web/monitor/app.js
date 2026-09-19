const $ = (s) => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const store = (k, v) => { try { return v === undefined ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch (_) { return null; } };
const SID = (qs.get("screen") || store("screenId") || "screen-" + Math.random().toString(36).slice(2, 6)).replace(/[^\w-]/g, "").slice(0, 40);
store("screenId", SID);
document.head.appendChild(Object.assign(document.createElement("link"), { rel: "stylesheet", href: FONT_CSS }));

const world = new World($("#sky")), amb = new Ambience(), els = new Map(), items = new Map();
world.life = new Life(world);
const grain = new Grain($("#grain")); if (!grain.gl) document.body.classList.add("nogl");
const SEASON = ["🌸 spring", "☀ summer", "🍂 autumn", "❄ winter"], WX = { clear: "", cloudy: "☁", rain: "☂ rain", storm: "⛈ storm" };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), throttle = (fn, ms) => { let t = 0, a; return (...x) => { a = x; if (!t) t = setTimeout(() => { t = 0; fn(...a); }, ms); }; };
const pad = (n, l = 2) => String(Math.floor(n)).padStart(l, "0");
const hhmm = (h) => `${pad(h)}:${pad((h % 1) * 60)}`;
let env = null, me = {}, skew = 0, fps = 0, battery = null, pads = {};

const stats = () => link.send({ type: "stats", patch: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1, fps: Math.round(fps), audio: !!(amb.ctx && amb.ctx.state === "running"), battery } });
const link = new Link("monitor", {
  open: stats,
  status: (s) => $("#off").classList.toggle("show", s === "closed"),
  message: (m) => {
    if (m.type === "kicked") { link.stop(); amb.stop(); $("#kicked").hidden = false; }
    else if (m.type === "welcome") { [...els.keys()].forEach(drop); items.clear(); pads = m.pads || {}; m.items.forEach(upsert); screens(m.screens); setEnv(m.env); }
    else if (m.type === "item.upsert") upsert(m.item);
    else if (m.type === "item.remove") { items.delete(m.id); drop(m.id); }
    else if (m.type === "env") setEnv(m.env);
    else if (m.type === "screens") screens(m.screens);
    else if (m.type === "pad.stroke") { (pads[m.id] ||= []).push(m.stroke); if (m.by !== link.id) els.get(m.id)?._pv?.add(m.stroke); }
    else if (m.type === "pad.live") els.get(m.id)?._pv?.liveIn(m.k, m.s);
    else if (m.type === "pad.set") { pads[m.id] = m.strokes || []; els.get(m.id)?._pv?.set(pads[m.id]); }
  },
}, "&screen=" + encodeURIComponent(SID));

function screens(list) { me = list.find((s) => s.id === SID) || me; world.setScene(me.scene || "meadow"); document.body.classList.toggle("locked", !!me.locked); }
function setEnv(e) {
  env = e; skew = e.serverTime - Date.now(); world.setEnv(e);
  amb.vol = e.env.knobs.volume; amb.muted = e.env.muted;
  const gv = e.env.knobs.grain ?? .5; grain.on = gv > .005; document.documentElement.style.setProperty("--grainA", (gv * .6).toFixed(3));
  $("#hud").classList.toggle("hide", !e.env.showHud);
  $("#hSeason").textContent = SEASON[e.season]; $("#hWx").textContent = (WX[e.weather.state] || "").replace("rain", e.season === 3 ? "snow" : "rain");
}

// ── notes & clocks ──
function upsert(it) {
  items.set(it.id, it);
  const L = it.layouts && it.layouts[SID];
  if (!L || !L.on) return drop(it.id);
  let el = els.get(it.id);
  const sig = it.kind + (it.clock ? it.clock.display + it.clock.style : "") + (it.pad ? it.pad.bg : "");
  if (!el || el.classList.contains("bye") || el._sig !== sig) {
    if (el) el.remove();
    el = document.createElement("div"); el._sig = sig; el.dataset.id = it.id; els.set(it.id, el);
    if (it.kind === "note") { el.className = "it note glassy"; el.innerHTML = `<div class="t"></div><div class="b"></div>`; }
    else if (it.kind === "pad") {
      const bg = (it.pad && it.pad.bg) || "paper"; el.className = `it pad padbox bg-${bg}`;
      el.innerHTML = `<div class="hdr"><span class="t"></span><span class="ptools"></span></div><canvas class="ink-c"></canvas>`;
      const id = it.id, pv = (el._pv = new PadView(el.querySelector("canvas"), (t, s) => link.send(t === "live" ? { type: "pad.live", id, k: s.k, s } : { type: "pad.stroke", id, stroke: s })));
      padTools(el.querySelector(".ptools"), pv, (a) => link.send({ type: "pad." + a, id }), bg === "dark"); pv.set(pads[id]);
    }
    else {
      const c = it.clock, st = c.style || "glass"; el.className = `it clk ${c.display} ${st === "glass" ? "glassy" : "s-" + st}`;
      el.innerHTML = c.display === "analog" ? analogSVG() : `<div class="dg"><div class="big"><span class="mn"></span><small></small></div><div class="sub"></div><div class="bar"><i></i></div></div>`;
    }
    el.appendChild(Object.assign(document.createElement("i"), { className: "rz" }));
    $("#items").appendChild(el);
  }
  if (!(drag && drag.el === el)) el._L = L;
  Object.assign(el.style, { zIndex: it.z, fontFamily: fontCss(it.font) });
  el.style.setProperty("--fs", it.fontSize + "px");
  if (it.kind === "pad") { if (el._t !== it.title) el.querySelector(".t").textContent = el._t = it.title; }
  else if (it.kind === "note") {
    if (el._t !== it.title) el.querySelector(".t").textContent = el._t = it.title;
    if (el._c !== it.content) el.querySelector(".b").innerHTML = renderMarkdown((el._c = it.content));
  } else tickClock(el, it);
}
function drop(id) { const el = els.get(id); if (!el) return; els.delete(id); el._pv && el._pv.ro.disconnect(); el.classList.add("bye"); setTimeout(() => el.remove(), 500); }

function analogSVG() {
  let t = ""; for (let i = 0; i < 60; i++) { const a = i * 6 * Math.PI / 180, r1 = i % 5 ? 43 : 39; t += `<line class="tk" x1="${50 + Math.sin(a) * r1}" y1="${50 - Math.cos(a) * r1}" x2="${50 + Math.sin(a) * 45}" y2="${50 - Math.cos(a) * 45}" stroke-width="${i % 5 ? .6 : 1.6}" opacity="${i % 5 ? .4 : .85}"/>`; }
  return `<svg viewBox="0 0 100 100"><circle class="face" cx="50" cy="50" r="48"/><circle class="arc" cx="50" cy="50" r="48" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/>${t}<text class="lbl" x="50" y="68"></text>
  <line class="hand al" x1="50" y1="50" x2="50" y2="22" stroke-width="1.2"/><line class="hand h" x1="50" y1="54" x2="50" y2="27" stroke-width="3.2"/><line class="hand m" x1="50" y1="56" x2="50" y2="14" stroke-width="2"/><line class="hand sec" x1="50" y1="58" x2="50" y2="9" stroke-width=".9"/><circle cx="50" cy="50" r="2.2" fill="var(--acc)"/></svg>`;
}
const dur = (ms, tenth) => { const s = Math.max(0, ms) / 1000, h = s / 3600 | 0, m = (s / 60 | 0) % 60; return (h ? h + ":" + pad(m) : pad(m)) + ":" + pad(s % 60) + (tenth ? `<small>.${Math.floor(s * 10) % 10}</small>` : ""); };
function clockData(c, now) {
  const el = c.acc + (c.running ? now - c.startAt : 0), d = new Date(now);
  switch (c.mode) {
    case "timer": return { big: dur(el, true), sub: c.running ? "timer" : el ? "paused" : "timer · ready", t: el, bar: null };
    case "countdown": { const rem = Math.max(0, c.duration - el); return { big: c.ringing ? "00:00" : dur(rem + (c.running ? 999 : 0)), sub: c.ringing ? "⏰ time's up" : c.running ? "countdown" : "paused", t: rem, bar: rem / c.duration }; }
    case "alarm": { const [ah, am] = c.alarm.split(":").map(Number); let left = ((ah * 60 + am) - (d.getHours() * 60 + d.getMinutes())) * 60 - d.getSeconds(); if (left <= 0) left += 86400; return { big: c.alarm, sub: c.ringing ? "⏰ wake up!" : c.running ? `in ${left / 3600 | 0}h ${pad((left / 60 | 0) % 60)}m` : "off", clock: d, alarm: [ah, am], bar: null }; }
    default: return { big: `${pad(d.getHours())}:${pad(d.getMinutes())}<small>${pad(d.getSeconds())}</small>`, sub: d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }), clock: d, bar: null };
  }
}
function tickClock(el, it) {
  const c = it.clock, now = Date.now() + skew, d = clockData(c, now), title = it.title && it.title !== "Clock" ? it.title : "";
  el.classList.toggle("ring", !!c.ringing);
  if (c.display !== "analog") {
    const b = el.querySelector(".big"), s = el.querySelector(".sub"), bar = el.querySelector(".bar");
    const [, mn, sm] = d.big.match(/^(.*?)(?:<small>(.*)<\/small>)?$/); roll(b.firstChild, mn); roll(b.lastChild, sm || "");
    const sub = title ? `${title} · ${d.sub}` : d.sub; if (s._v !== sub) s.textContent = s._v = sub;
    bar.style.display = d.bar == null ? "none" : ""; if (d.bar != null) bar.firstChild.style.width = d.bar * 100 + "%";
    return;
  }
  const al = el.querySelector(".al"); al.style.display = d.alarm && c.running ? "" : "none"; if (d.alarm) rot(el, ".al", ((d.alarm[0] % 12) + d.alarm[1] / 60) * 30);
  el.querySelector(".arc").style.strokeDashoffset = d.bar == null ? 100 : 100 * (1 - d.bar);
  const lbl = el.querySelector(".lbl"), txt = c.mode === "clock" ? title : c.mode === "alarm" ? c.alarm : d.big.replace(/<[^>]+>/g, ""); if (lbl._v !== txt) lbl.textContent = lbl._v = txt;
}
const rot = (el, sel, deg) => { const e = el._h?.[sel] || ((el._h ||= {})[sel] = el.querySelector(sel)); e.setAttribute("transform", `rotate(${(deg % 360).toFixed(2)} 50 50)`); };
// digits that change slide in; alternate animation names to retrigger without reflow
function roll(box, str) {
  if (box._v === str) return; const old = box._v || ""; box._v = str;
  while (box.childNodes.length > str.length) box.lastChild.remove();
  while (box.childNodes.length < str.length) box.appendChild(document.createElement("span"));
  [...str].forEach((ch, i) => { const sp = box.childNodes[i]; if (sp.textContent !== ch) { sp.textContent = ch; if (old) sp.className = sp.className === "r1" ? "r2" : "r1"; } });
}
function hands(el, it) {
  const c = it.clock, now = Date.now() + skew;
  let t; if (c.mode === "clock" || c.mode === "alarm") { const d = new Date(now); t = now / 1000 - d.getTimezoneOffset() * 60; }
  else { const e = c.acc + (c.running ? now - c.startAt : 0); t = (c.mode === "countdown" ? Math.max(0, c.duration - e) : e) / 1000; }
  rot(el, ".h", t / 3600 * 30); rot(el, ".m", t / 60 * 6); rot(el, ".sec", t * 6);
}
// notes & clocks glide to their layout with a critically-damped follow (no restarted CSS transitions)
let snap = true;
function moveItems(dt) {
  const W = innerWidth, H = innerHeight, k = snap ? 1 : 1 - Math.exp(-dt * 10); snap = false;
  for (const el of els.values()) {
    const L = el._L; if (!L) continue;
    const t = [L.x * W, L.y * H, L.w * W, L.h * H], c = el._pos || (el._pos = t.slice()); let mv = !el._set;
    for (let i = 0; i < 4; i++) { const d = t[i] - c[i]; if (Math.abs(d) > .15) { c[i] += d * k; mv = true; } else if (d) { c[i] = t[i]; mv = true; } }
    if (mv) { el._set = 1; el.style.transform = `translate3d(${c[0].toFixed(1)}px,${c[1].toFixed(1)}px,0)`; el.style.width = c[2].toFixed(1) + "px"; el.style.height = c[3].toFixed(1) + "px"; }
    const it = items.get(el.dataset.id); if (it && it.clock && it.clock.display === "analog") hands(el, it);
  }
}
// drag to move, corner handle to resize (unless the control locked this screen)
let drag = null;
const sendLay = throttle((id, p) => link.send({ type: "layout.set", id, screen: SID, patch: p }), 40);
$("#items").addEventListener("pointerdown", (e) => {
  gesture(); wakeUi();
  const el = e.target.closest(".it"); if (!el || me.locked) return;
  if (el.classList.contains("pad") && !e.target.closest(".hdr, .rz")) return; // pads: move by header only, ink area draws
  e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add("drag");
  drag = { el, id: el.dataset.id, x: e.clientX, y: e.clientY, o: { ...el._L }, rz: e.target.classList.contains("rz") };
  link.send({ type: "item.front", id: drag.id, screen: SID });
});
$("#items").addEventListener("pointermove", (e) => {
  if (!drag) return; const { el, o } = drag, dx = (e.clientX - drag.x) / innerWidth, dy = (e.clientY - drag.y) / innerHeight;
  const p = drag.rz ? { w: clamp(o.w + dx, .03, 1 - o.x), h: clamp(o.h + dy, .03, 1 - o.y) } : { x: clamp(o.x + dx, 0, 1 - o.w), y: clamp(o.y + dy, 0, 1 - o.h) };
  el._L = { ...el._L, ...p }; sendLay(drag.id, p);
});
const endDrag = () => { if (!drag) return; const { el, id } = drag, L = el._L; el.classList.remove("drag"); drag = null; link.send({ type: "layout.set", id, screen: SID, patch: { x: L.x, y: L.y, w: L.w, h: L.h } }); };
$("#items").addEventListener("pointerup", endDrag); $("#items").addEventListener("pointercancel", endDrag);
let ringT = 0;
setInterval(() => {
  let ring = false;
  for (const [id, el] of els) { const it = items.get(id); if (it && it.clock) { tickClock(el, it); ring ||= it.clock.ringing; } }
  if (ring && (ringT -= .25) <= 0) { ringT = 1.6; amb.call("alarm", 0, 1); }
}, 250);

// ── render loop: fps cap + adaptive resolution keep CPU/GPU low ──
world.onSound = (n, p, v) => amb.call(n, p, v);
world.onFlash = () => { const f = $("#flash"); f.style.transition = "none"; f.style.opacity = .5; requestAnimationFrame(() => { f.style.transition = ""; f.style.opacity = 0; }); };
let last = performance.now(), frames = 0, fpsT = 0, themeT = 0, cost = 4, gap = 16.7, qT = 0, q = 1;
function loop(now) {
  requestAnimationFrame(loop);
  grain.frame(now);
  const cap = me.fpsCap || 0, dtms = now - last;
  if (cap && dtms < 1000 / cap - 1.5) return;
  gap += (dtms - gap) * .05; last = now;
  const t0 = performance.now(), st = world.frame(now, Math.min(.1, dtms / 1000));
  cost += (performance.now() - t0 - cost) * .05;
  amb.update(st, world.name);
  moveItems(dtms / 1000);
  frames++; fpsT += dtms; if (fpsT >= 1000) { fps = frames * 1000 / fpsT; frames = fpsT = 0; }
  if ((qT += dtms) > 2000) {
    qT = 0; const budget = cap ? 1000 / cap : gap;
    const nq = cost > budget * .55 ? Math.max(.5, q - .15) : cost < budget * .22 ? Math.min(1, q + .1) : q;
    if (nq !== q) world.setQuality((q = nq));
    document.body.classList.toggle("lite", q < .75);
  }
  if (st && (themeT -= dtms) <= 0) {
    themeT = 500; $("#hClock").textContent = `${st.day ? "☀" : "☾"} ${hhmm(st.hour)}`;
    const n = st.night, r = document.documentElement.style;
    r.setProperty("--nbg", `rgba(${255 - n * 200 | 0},${255 - n * 200 | 0},${255 - n * 170 | 0},${.34 - n * .1})`);
    r.setProperty("--nfg", n > .5 ? "#eeeaff" : "#2c2a3e"); r.setProperty("--ndim", n > .5 ? "rgba(238,234,255,.6)" : "rgba(44,42,62,.6)"); r.setProperty("--nline", `rgba(255,255,255,${.45 - n * .3})`);
    r.setProperty("--leak", (st.golden * .9 * (1 - st.cloud * .6)).toFixed(2)); if (world.body) r.setProperty("--lx", (world.body.x / world.W * 100).toFixed(1) + "%");
  }
}
requestAnimationFrame(loop);
setInterval(stats, 5000);

const scaleUI = () => document.documentElement.style.setProperty("--sc", Math.max(.45, Math.min(3, Math.min(innerWidth, innerHeight) / 800)));
let rt; addEventListener("resize", () => { snap = true; scaleUI(); clearTimeout(rt); rt = setTimeout(stats, 300); }); scaleUI();
{ const c = document.createElement("canvas"); c.width = c.height = 160; const g = c.getContext("2d"), d = g.createImageData(160, 160); for (let i = 0; i < d.data.length; i += 4) { d.data[i] = d.data[i + 1] = d.data[i + 2] = Math.random() * 255; d.data[i + 3] = 14; } g.putImageData(d, 0, 0); document.documentElement.style.setProperty("--grain", `url(${c.toDataURL()})`); }

// battery (top right)
navigator.getBattery && navigator.getBattery().then((b) => {
  const up = () => { battery = { level: b.level, charging: b.charging }; const e = $("#bat"); e.hidden = false; e.querySelector("b").style.width = b.level * 100 + "%"; e.querySelector("span").textContent = Math.round(b.level * 100) + "%"; e.classList.toggle("low", b.level < .2 && !b.charging); e.classList.toggle("chg", b.charging); };
  up(); b.addEventListener("levelchange", up); b.addEventListener("chargingchange", up);
}).catch(() => {});

// sound, fullscreen (auto on first gesture), taps
const de = document.documentElement, fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const goFs = () => !fsEl() && Promise.resolve((de.requestFullscreen || de.webkitRequestFullscreen || (() => {})).call(de)).catch(() => {});
const toggleFs = () => { if (fsEl()) { store("fsOff", 1); (document.exitFullscreen || document.webkitExitFullscreen).call(document); } else { store("fsOff", ""); goFs(); } };
const fsLabel = () => ($("#fs").textContent = fsEl() ? "✕ exit fullscreen" : "⛶ fullscreen");
document.addEventListener("fullscreenchange", fsLabel); document.addEventListener("webkitfullscreenchange", fsLabel);
const enableSound = () => { if (!link.stopped) amb.start().then(() => amb.ctx.state === "running" && $("#sound").classList.add("gone")).catch(() => {}); };
let firstGesture = true;
const gesture = () => { enableSound(); if (firstGesture && !store("fsOff")) goFs(); firstGesture = false; };
$("#fs").onclick = (e) => { e.stopPropagation(); toggleFs(); };
$("#sound").onclick = (e) => { e.stopPropagation(); gesture(); };
$("#sky").addEventListener("pointerdown", (e) => { gesture(); world.tap(e.clientX, e.clientY); });
addEventListener("keydown", (e) => { gesture(); if (e.key === "f") toggleFs(); });
if (!store("fsOff")) goFs(); // works in kiosk / when the browser allows it
enableSound();
let idle; const wakeUi = () => { document.body.classList.add("cur"); clearTimeout(idle); idle = setTimeout(() => document.body.classList.remove("cur"), 2500); };
addEventListener("pointermove", wakeUi); addEventListener("pointerdown", wakeUi);
const wake = () => navigator.wakeLock && navigator.wakeLock.request("screen").catch(() => {});
wake(); document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && wake());
addEventListener("pagehide", () => amb.stop());
