const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
document.head.appendChild(Object.assign(document.createElement("link"), { rel: "stylesheet", href: FONT_CSS }));
const items = new Map(), SEASON = ["🌸 spring", "☀️ summer", "🍂 autumn", "❄️ winter"], SCENE_I = { meadow: "🌾", forest: "🌲", mountain: "🏔", beach: "🏖", city: "🏘" }, WX = { clear: "☀ clear", cloudy: "☁ cloudy", rain: "☂ rain", storm: "⛈ storm" };
let screens = [], env = null, pads = {}, sel = null, scr = localStorage.getItem("selScr"), skew = 0;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), pad = (n) => String(Math.floor(n)).padStart(2, "0");
const hhmm = (h) => `${pad(h)}:${pad((h % 1) * 60)}`, mmss = (ms) => { const s = Math.max(0, ms) / 1000; return s >= 3600 ? `${s / 3600 | 0}h${pad(s / 60 % 60)}m` : `${s / 60 | 0}m${pad(s % 60)}s`; };
const dur = (ms) => { const s = Math.max(0, ms) / 1000, h = s / 3600 | 0; return (h ? h + ":" : "") + pad(s / 60 % 60) + ":" + pad(s % 60); };
const throttle = (fn, ms) => { let t = 0, a; return (...x) => { a = x; if (!t) t = setTimeout(() => { t = 0; fn(...a); }, ms); }; };

const link = new Link("control", {
  status: (s) => { const c = $("#conn"); c.className = "pill " + (s === "open" ? "on-link" : "off-link"); c.lastChild.textContent = s; },
  message(m) {
    switch (m.type) {
      case "welcome": items.clear(); pads = m.pads || {}; m.items.forEach((i) => items.set(i.id, i)); screens = m.screens; pickScreen(); setEnv(m.env); renderAll(); break;
      case "item.upsert": { const mine = m.by === link.id, fresh = !items.has(m.item.id); items.set(m.item.id, m.item); if (fresh && mine) select(m.item.id); renderList(); renderStage(); if (m.item.id === sel) fillEditor(); break; }
      case "item.remove": items.delete(m.id); if (sel === m.id) select(null); renderList(); renderStage(); break;
      case "env": setEnv(m.env); break;
      case "pad.stroke": (pads[m.id] ||= []).push(m.stroke); if (m.id === sel && m.by !== link.id) pv.add(m.stroke); break;
      case "pad.live": if (m.id === sel) pv.liveIn(m.k, m.s); break;
      case "pad.set": pads[m.id] = m.strokes || []; if (m.id === sel) pv.set(pads[m.id]); break;
      case "screens": screens = m.screens; pickScreen(); renderScreens(); renderList(); fillPos(); renderStage(); renderStatus(); break;
    }
  },
});
const send = (m) => link.send(m);
const setE = (p) => send({ type: "env.set", patch: p });
const cur = () => items.get(sel), curScr = () => screens.find((s) => s.id === scr);
const size = () => { const s = curScr(); return s && s.w ? { w: s.w, h: s.h } : { w: 1920, h: 1080 }; };
const lay = (it) => it && it.layouts && it.layouts[scr];
const renderAll = () => { renderScreens(); renderList(); fillEditor(); renderStatus(); renderStage(); };

// ── screens ──
function pickScreen() { if (!screens.some((s) => s.id === scr)) scr = (screens.find((s) => s.online) || screens[0] || {}).id || null; }
function renderScreens() {
  const ul = $("#screens"); ul.innerHTML = "";
  if (!screens.length) ul.innerHTML = `<li class="dim">No screens yet — open /monitor/ on a device</li>`;
  for (const s of screens) {
    const li = document.createElement("li"); li.className = s.id === scr ? "sel" : "";
    const bat = s.battery ? ` ${s.battery.charging ? "⚡" : "🔋"}${Math.round(s.battery.level * 100)}%` : "";
    li.innerHTML = `<i class="dot ${s.online ? "on" : ""}"></i><span class="t"></span><span class="meta">${SCENE_I[s.scene] || ""}${bat}</span>`;
    li.querySelector(".t").textContent = s.name;
    li.onclick = () => { scr = s.id; localStorage.setItem("selScr", scr); renderAll(); };
    ul.appendChild(li);
  }
  const s = curScr(); $("#scrEdit").hidden = !s; if (!s) return;
  if (document.activeElement !== $("#scrName")) $("#scrName").value = s.name;
  $("#scrScene").value = s.scene; $("#scrFps").value = String(s.fpsCap || 0); $("#scrLock").checked = !!s.locked; $("#scrDel").disabled = s.online;
  $("#layScr").textContent = "· " + s.name;
}
const scrUpd = (p) => scr && send({ type: "screen.update", screen: scr, patch: p });
$("#scrName").onchange = (e) => scrUpd({ name: e.target.value.trim() });
$("#scrScene").onchange = (e) => scrUpd({ scene: e.target.value });
$("#scrFps").onchange = (e) => scrUpd({ fpsCap: +e.target.value });
$("#scrLock").onchange = (e) => scrUpd({ locked: e.target.checked });
$("#scrDel").onclick = () => { const s = curScr(); if (s && !s.online && confirm(`Forget screen "${s.name}"?`)) send({ type: "screen.delete", screen: s.id }); };
$("#scrLink").onclick = () => { const u = `${location.origin}/monitor/?screen=${encodeURIComponent(scr)}`; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => ($("#scrLink").textContent = "✓"), () => prompt("Monitor link", u)); setTimeout(() => ($("#scrLink").textContent = "🔗"), 1500); };
$("#newScreen").onclick = () => window.open(`/monitor/?screen=screen-${Math.random().toString(36).slice(2, 6)}`, "_blank");

// ── items list & editor ──
const patchItem = (id, p) => { const it = items.get(id); if (!it) return; for (const k in p) (k === "clock" || k === "pad") && it[k] ? Object.assign(it[k], p[k]) : (it[k] = p[k]); send({ type: "item.update", id, patch: p }); };
const setLay = (id, p, screen = scr) => { const it = items.get(id); if (!it || !screen) return; if (screen === "*") for (const k in it.layouts) Object.assign(it.layouts[k], p); else Object.assign(it.layouts[screen] || {}, p); send({ type: "layout.set", id, screen, patch: p }); };
function renderList() {
  const ul = $("#list"); ul.innerHTML = "";
  [...items.values()].sort((a, b) => a.created - b.created).forEach((it) => {
    const L = lay(it), li = document.createElement("li");
    li.className = (it.id === sel ? "sel " : "") + (L && L.on ? "" : "off");
    li.innerHTML = `<span>${it.kind === "clock" ? { clock: "🕰", timer: "⏱", countdown: "⏳", alarm: "⏰", pomodoro: "🍅" }[it.clock.mode] : it.kind === "pad" ? "✏️" : "📝"}</span><span class="t"></span><span class="meta"></span><label class="sw"><input type="checkbox" ${L && L.on ? "checked" : ""} ${L ? "" : "disabled"}><span></span></label>`;
    li.querySelector(".t").textContent = it.title || "Untitled";
    li.onclick = (e) => { if (!e.target.closest(".sw")) select(it.id); };
    li.querySelector("input").onchange = (e) => { setLay(it.id, { on: e.target.checked }); renderList(); renderStage(); if (it.id === sel) $("#enabled").checked = e.target.checked; };
    ul.appendChild(li);
  });
}
function select(id) { sel = id; renderList(); fillEditor(); renderStage(); }
function fillEditor() {
  const it = cur(); $("#editor").hidden = !it; $("#empty").hidden = !!it; fillPos(); if (!it) return;
  const set = (el, v) => { if (document.activeElement !== el) el.value = v; };
  set($("#title"), it.title); set($("#fs"), it.fontSize); $("#font").value = it.font || "blex";
  const L = lay(it); $("#enabled").checked = !!(L && L.on); $("#enabled").disabled = !L;
  const clock = it.kind === "clock", pad = it.kind === "pad"; $("#noteEd").hidden = clock || pad; $("#clockEd").hidden = !clock; $("#padEd").hidden = !pad;
  if (pad) {
    const bg = (it.pad && it.pad.bg) || "paper", s = size(); $("#padPrev").className = "padbox bg-" + bg;
    $$("#padBg .seg").forEach((b) => b.classList.toggle("on", b.dataset.v === bg));
    if (L) $("#padPrev").style.aspectRatio = `${(L.w * s.w).toFixed(0)} / ${(L.h * s.h).toFixed(0)}`;
    if (pv._for !== it.id) { pv._for = it.id; pv.set(pads[it.id]); }
    return;
  }
  if (!clock) { set($("#content"), it.content); $("#preview").innerHTML = renderMarkdown(it.content); return; }
  const c = it.clock;
  $$("#cMode .seg").forEach((b) => b.classList.toggle("on", b.dataset.v === c.mode));
  $$("#cDisp .seg").forEach((b) => b.classList.toggle("on", b.dataset.v === c.display));
  $$("#cStyle .seg").forEach((b) => b.classList.toggle("on", b.dataset.v === (c.style || "glass")));
  $("#cDur").hidden = c.mode !== "countdown"; $("#cAlarm").hidden = c.mode !== "alarm"; $("#cCtl").hidden = c.mode === "clock"; $("#cPomo").hidden = c.mode !== "pomodoro"; $("#skipBtn").hidden = c.mode !== "pomodoro";
  const p = c.pomo || {};
  $$("[data-pk]").forEach((i) => set(i, p[i.dataset.pk] ?? "")); $$("[data-pb]").forEach((i) => (i.checked = !!p[i.dataset.pb])); set($("#pLabel"), p.label || "");
  $$("#pPre .seg").forEach((b) => b.classList.toggle("on", b.dataset.p === [p.focus, p.short, p.long, p.rounds].join(",")));
  $("#pDone").textContent = `${p.done || 0} focus session${p.done === 1 ? "" : "s"} done`;
  $$("#cCtl [data-act=start],#cCtl [data-act=pause],#cCtl [data-act=reset]").forEach((b) => (b.hidden = c.mode === "alarm"));
  $("#dismiss").hidden = !c.ringing;
  const d = c.duration; $$("#cDur input").forEach((i) => set(i, Math.floor(d / +i.dataset.u) % (i.dataset.u === "3600000" ? 1000 : 60)));
  const [ah, am] = (c.alarm || "07:00").split(":"); set($("#alH"), +ah); set($("#alM"), am); $("#armed").checked = c.running;
  liveClock();
}
function liveClock() {
  const it = cur(); if (!it || it.kind !== "clock") return;
  const c = it.clock, now = Date.now() + skew, el = c.acc + (c.running ? now - c.startAt : 0);
  const [big, sub] = c.ringing ? ["⏰", "ringing — press stop"] : c.mode === "timer" ? [dur(el), c.running ? "running" : "paused"] : c.mode === "countdown" ? [dur(c.duration - el + (c.running ? 999 : 0)), c.running ? "running" : "paused"]
    : c.mode === "alarm" ? [c.alarm, c.running ? "armed" : "off"]
    : c.mode === "pomodoro" && c.pomo ? [dur(c.duration - el + (c.running ? 999 : 0)), `${c.pomo.phase === "focus" ? c.pomo.label || "Focus" : c.pomo.phase === "short" ? "Short break" : "Long break"} · round ${c.pomo.round}/${c.pomo.rounds}${c.running ? "" : " · paused"}`]
    : [new Date(now).toLocaleTimeString("en-US"), "local time on monitor"];
  const v = `${big}<small>${sub}</small>`; if ($("#cLive")._v !== v) $("#cLive").innerHTML = $("#cLive")._v = v;
  $("#dismiss").hidden = !c.ringing;
}
setInterval(liveClock, 250);

$("#font").innerHTML = Object.entries(FONTS).map(([k, [n]]) => `<option value="${k}">${n}</option>`).join("");
$("#cStyle").innerHTML = CLOCK_STYLES.map((s) => `<button class="seg" data-v="${s}">${s}</button>`).join("");
const pushText = throttle(() => { const it = cur(); if (it) patchItem(it.id, { title: $("#title").value, ...(it.kind === "note" ? { content: $("#content").value } : {}) }); }, 120);
$("#title").oninput = () => { pushText(); const it = cur(); if (it) { it.title = $("#title").value; renderList(); } };
$("#content").oninput = () => { pushText(); $("#preview").innerHTML = renderMarkdown($("#content").value); };
$("#content").onkeydown = (e) => { if (e.key !== "Tab") return; e.preventDefault(); const t = e.target; t.setRangeText("  ", t.selectionStart, t.selectionEnd, "end"); pushText(); };
$("#fs").onchange = (e) => sel && patchItem(sel, { fontSize: +e.target.value });
$("#font").onchange = (e) => sel && patchItem(sel, { font: e.target.value });
$("#enabled").onchange = (e) => { if (sel) { setLay(sel, { on: e.target.checked }); renderList(); renderStage(); } };
$("#del").onclick = () => { const it = cur(); if (it && confirm(`Delete "${it.title}"?`)) send({ type: "item.delete", id: it.id }); };
$("#newNote").onclick = () => send({ type: "item.create", kind: "note" });
$("#newClock").onclick = () => send({ type: "item.create", kind: "clock" });
$("#newPad").onclick = () => send({ type: "item.create", kind: "pad" });
const pv = new PadView($("#padPrev canvas"), (t, s) => sel && send(t === "live" ? { type: "pad.live", id: sel, k: s.k, s } : { type: "pad.stroke", id: sel, stroke: s }));
padTools($("#padTools"), pv, (a) => sel && send({ type: "pad." + a, id: sel }));
$("#padBg").innerHTML = PAD_BGS.map((b) => `<button class="seg" data-v="${b}">${b}</button>`).join("");
$("#padBg").onclick = (e) => { const b = e.target.closest(".seg"); if (b && sel) { patchItem(sel, { pad: { bg: b.dataset.v } }); fillEditor(); } };
$$(".tabs .seg").forEach((b) => (b.onclick = () => { $$(".tabs .seg").forEach((x) => x.classList.toggle("on", x === b)); $("#panes").className = "panes " + b.dataset.view; }));
const clk = (p) => { if (sel) { patchItem(sel, { clock: p }); fillEditor(); renderList(); } };
$$("#cMode .seg").forEach((b) => (b.onclick = () => clk({ mode: b.dataset.v, running: false, acc: 0, ringing: false })));
$$("#cDisp .seg").forEach((b) => (b.onclick = () => clk({ display: b.dataset.v })));
$("#cStyle").onclick = (e) => { const b = e.target.closest(".seg"); if (b) clk({ style: b.dataset.v }); };
$$("#cDur input").forEach((i) => (i.onchange = () => clk({ duration: Math.max(1000, $$("#cDur input").reduce((a, x) => a + (+x.value || 0) * +x.dataset.u, 0)), acc: 0, running: false })));
const setAlarm = () => clk({ alarm: `${pad(clamp(+$("#alH").value || 0, 0, 23))}:${pad(clamp(+$("#alM").value || 0, 0, 59))}`, fired: "" });
$("#alH").onchange = $("#alM").onchange = setAlarm;
const pomo = (patch) => { const it = cur(); if (it && it.clock) clk({ pomo: { ...(it.clock.pomo || {}), ...patch } }); };
$$("[data-pk]").forEach((i) => (i.onchange = () => pomo({ [i.dataset.pk]: +i.value })));
$$("[data-pb]").forEach((i) => (i.onchange = () => pomo({ [i.dataset.pb]: i.checked })));
$("#pLabel").onchange = (e) => pomo({ label: e.target.value.trim() || "Focus" });
$$("#pPre .seg").forEach((b) => (b.onclick = () => { const [focus, short, long, rounds] = b.dataset.p.split(",").map(Number); pomo({ focus, short, long, rounds }); }));
$("#pResetCount").onclick = () => sel && send({ type: "clock.act", id: sel, act: "resetcount" });
$("#armed").onchange = (e) => sel && send({ type: "clock.act", id: sel, act: e.target.checked ? "start" : "pause" });
$$("#cCtl [data-act]").forEach((b) => (b.onclick = () => sel && send({ type: "clock.act", id: sel, act: b.dataset.act })));

// ── layout on selected screen ──
function fillPos() {
  const L = lay(cur()); $("#posBox").classList.toggle("dis", !L); if (!L) return;
  const s = size(), v = { x: L.x * s.w, y: L.y * s.h, w: L.w * s.w, h: L.h * s.h };
  $$(".grid4 input[data-k]").forEach((i) => { if (document.activeElement !== i) i.value = Math.round(v[i.dataset.k]); });
}
function setGeom(p) {
  const it = cur(), L = lay(it); if (!L) return;
  const g = { x: L.x, y: L.y, w: L.w, h: L.h, ...p };
  g.w = clamp(g.w, .02, 1); g.h = clamp(g.h, .02, 1); g.x = clamp(g.x, 0, 1 - g.w); g.y = clamp(g.y, 0, 1 - g.h);
  setLay(it.id, g); fillPos(); renderStage();
}
function move(dx, dy, fast, resize) {
  const L = lay(cur()); if (!L) return; const s = size(), st = +(fast ? $("#fastStep").value : $("#fineStep").value) || 1;
  setGeom(resize ? { w: L.w + dx * st / s.w, h: L.h + dy * st / s.h } : { x: L.x + dx * st / s.w, y: L.y + dy * st / s.h });
}
const hold = (b, fn) => { let r; const stop = () => { clearTimeout(r); clearInterval(r); }; b.onpointerdown = (e) => { e.preventDefault(); fn(); r = setTimeout(() => (r = setInterval(fn, 60)), 350); }; b.onpointerup = b.onpointerleave = b.onpointercancel = stop; };
$$("[data-mv]").forEach((b) => { const [dx, dy, f] = b.dataset.mv.split(",").map(Number); hold(b, () => move(dx, dy, f)); });
$$("[data-rz]").forEach((b) => { const [dx, dy] = b.dataset.rz.split(",").map(Number); hold(b, () => move(dx, dy, 1, 1)); });
$$(".grid4 input[data-k]").forEach((i) => (i.onchange = () => { const s = size(), k = i.dataset.k; setGeom({ [k]: +i.value / (k === "x" || k === "w" ? s.w : s.h) }); }));
$$("[data-snap]").forEach((b) => (b.onclick = () => { const L = lay(cur()); if (!L) return; const mx = .015, my = .025; setGeom({ br: { x: 1 - L.w - mx, y: 1 - L.h - my }, tl: { x: mx, y: my }, tr: { x: 1 - L.w - mx, y: my }, bl: { x: mx, y: 1 - L.h - my }, c: { x: (1 - L.w) / 2, y: (1 - L.h) / 2 } }[b.dataset.snap]); }));
$("#toAll").onclick = () => { const it = cur(), L = lay(it); if (L && confirm("Copy this position/size to every screen?")) setLay(it.id, { x: L.x, y: L.y, w: L.w, h: L.h, on: L.on }, "*"); };

// ── virtual screen ──
$("#openScreen").onclick = () => { $("#modal").hidden = false; renderStage(); };
$("#closeScreen").onclick = () => ($("#modal").hidden = true);
$("#modal").onclick = (e) => { if (e.target.id === "modal") $("#modal").hidden = true; };
addEventListener("resize", () => renderStage());
document.addEventListener("keydown", (e) => {
  if ($("#modal").hidden) return; if (e.key === "Escape") return ($("#modal").hidden = true);
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (d) { e.preventDefault(); move(d[0], d[1], e.shiftKey, e.altKey); }
});
let drag = null;
const place = (d, L) => Object.assign(d.style, { left: L.x * 100 + "%", top: L.y * 100 + "%", width: L.w * 100 + "%", height: L.h * 100 + "%" });
function renderStage() {
  if ($("#modal").hidden || drag) return;
  const s = size(), wrap = $("#stageWrap"), st = $("#stage"), k = Math.min(wrap.clientWidth / s.w, wrap.clientHeight / s.h);
  st.style.width = s.w * k + "px"; st.style.height = s.h * k + "px";
  const sc = curScr(); $("#scrLbl").textContent = `${sc ? sc.name + " · " : ""}${s.w}×${s.h}${sc && sc.w ? "" : " (default)"}`;
  st.innerHTML = "";
  [...items.values()].sort((a, b) => a.z - b.z).forEach((it) => {
    const L = lay(it); if (!L) return;
    const d = document.createElement("div"); d.className = "vn" + (L.on ? "" : " off") + (it.id === sel ? " sel" : ""); d.dataset.id = it.id;
    d.textContent = (it.kind === "clock" ? "⏰ " : "📝 ") + it.title; d.appendChild(Object.assign(document.createElement("i"), { className: "rz" }));
    place(d, L); st.appendChild(d);
  });
}
$("#stage").addEventListener("pointerdown", (e) => {
  const d = e.target.closest(".vn"); if (!d) return;
  const it = items.get(d.dataset.id), L = lay(it); if (sel !== it.id) { sel = it.id; renderList(); fillEditor(); $$(".vn").forEach((x) => x.classList.toggle("sel", x === d)); }
  send({ type: "item.front", id: it.id });
  drag = { d, it, L, r: $("#stage").getBoundingClientRect(), sx: e.clientX, sy: e.clientY, o: { ...L }, rz: e.target.classList.contains("rz") };
  d.setPointerCapture(e.pointerId); d.style.zIndex = 999;
});
const sendGeom = throttle((id, g) => send({ type: "layout.set", id, screen: scr, patch: g }), 30);
$("#stage").addEventListener("pointermove", (e) => {
  if (!drag) return; const { L, r, o } = drag, dx = (e.clientX - drag.sx) / r.width, dy = (e.clientY - drag.sy) / r.height;
  const g = drag.rz ? { w: clamp(o.w + dx, .02, 1 - o.x), h: clamp(o.h + dy, .02, 1 - o.y) } : { x: clamp(o.x + dx, 0, 1 - o.w), y: clamp(o.y + dy, 0, 1 - o.h) };
  Object.assign(L, g); place(drag.d, L); fillPos(); sendGeom(drag.it.id, g);
});
const endDrag = () => { if (!drag) return; const { it, L } = drag; drag = null; send({ type: "layout.set", id: it.id, screen: scr, patch: { x: L.x, y: L.y, w: L.w, h: L.h } }); renderStage(); };
$("#stage").addEventListener("pointerup", endDrag); $("#stage").addEventListener("pointercancel", endDrag);

// ── environment ──
const knobs = {};
$$(".knob").forEach((el) => {
  const k = el.dataset.k, def = () => (env && env.knobDefs[k]) ?? .5;
  el.innerHTML = `<div class="kn" tabindex="0"><svg viewBox="0 0 40 40"><circle class="kt" cx="20" cy="20" r="16" pathLength="100" stroke-dasharray="75 100"/><circle class="kv" cx="20" cy="20" r="16" pathLength="100" stroke-dasharray="0 100"/></svg><span class="kval"></span></div><span>${el.dataset.l}</span><button class="kr" title="reset to default">↺</button>`;
  const kn = el.firstChild, push = throttle((v) => setE({ knobs: { [k]: v } }), 80); let v = .5, dr = null;
  const set = (nv, p) => { v = clamp(nv, 0, 1); el.querySelector(".kv").setAttribute("stroke-dasharray", `${v * 75} 100`); el.querySelector(".kval").textContent = Math.round(v * 100); el.querySelector(".kr").classList.toggle("def", Math.abs(v - def()) < .005); if (p) push(v); };
  kn.onpointerdown = (e) => { dr = { x: e.clientX, y: e.clientY, v }; kn.setPointerCapture(e.pointerId); };
  kn.onpointermove = (e) => dr && set(dr.v + (dr.y - e.clientY + e.clientX - dr.x) / 160, true);
  kn.onpointerup = kn.onpointercancel = () => (dr = null);
  kn.onwheel = (e) => { e.preventDefault(); set(v - Math.sign(e.deltaY) * .02, true); };
  kn.onkeydown = (e) => { const d = { ArrowUp: .02, ArrowRight: .02, ArrowDown: -.02, ArrowLeft: -.02 }[e.key]; if (d) { e.preventDefault(); set(v + d, true); } };
  kn.ondblclick = el.querySelector(".kr").onclick = () => set(def(), true);
  knobs[k] = (x) => !dr && set(x, false);
});

function setEnv(e) {
  env = e; skew = e.serverTime - Date.now(); const E = e.env, act = document.activeElement;
  $("#stClock").textContent = `${e.isDay ? "☀" : "☾"} ${hhmm(e.hour)}${E.paused ? " ❚❚" : ""}`;
  $("#stSeason").textContent = SEASON[e.season] + (E.seasonLocked ? " 🔒" : "");
  $("#stWx").textContent = (WX[e.weather.state] || "").replace("rain", e.season === 3 ? "snow" : "rain") + (E.weatherMode === "auto" ? "" : " 📌");
  if (act !== $("#hour")) $("#hour").value = e.hour; $("#hourLbl").textContent = hhmm(e.hour);
  $("#pause").textContent = E.paused ? "▶ play" : "❚❚ pause"; $("#pause").classList.toggle("on", E.paused); $("#speed").value = String(E.speed);
  if (act !== $("#dayMin")) $("#dayMin").value = E.dayMin; if (act !== $("#nightMin")) $("#nightMin").value = E.nightMin;
  $$("#seasons .seg").forEach((b) => b.classList.toggle("on", +b.dataset.s === e.season)); $("#lockSeason").checked = E.seasonLocked;
  $("#seasonBar").style.width = e.seasonProgress * 100 + "%";
  $$("[data-sl]").forEach((i) => act !== i && (i.value = E.seasonMin[+i.dataset.sl]));
  $$("#weather .seg").forEach((b) => b.classList.toggle("on", b.dataset.w === E.weatherMode));
  for (const k in knobs) knobs[k](E.knobs[k] ?? .5);
  const gv = E.knobs.grain ?? .5; if (act !== $("#grain")) $("#grain").value = gv; $("#grainV").textContent = Math.round(gv * 100); $("#grainR").style.opacity = Math.abs(gv - e.knobDefs.grain) < .005 ? .3 : 1;
  $("#mute").textContent = E.muted ? "🔇 muted" : "🔊 sound"; $("#hud").checked = E.showHud;
  renderStatus();
}
$("#hour").oninput = throttle(() => setE({ hour: +$("#hour").value }), 60);
$$("[data-hr]").forEach((b) => (b.onclick = () => setE({ hour: +b.dataset.hr })));
$("#pause").onclick = () => env && setE({ paused: !env.env.paused });
$("#speed").onchange = (e) => setE({ speed: +e.target.value });
$("#dayMin").onchange = (e) => setE({ dayMin: +e.target.value }); $("#nightMin").onchange = (e) => setE({ nightMin: +e.target.value });
$$("#seasons .seg").forEach((b) => (b.onclick = () => setE({ season: +b.dataset.s })));
$("#lockSeason").onchange = (e) => setE({ seasonLocked: e.target.checked });
$$("[data-sl]").forEach((i) => (i.onchange = () => setE({ seasonMin: $$("[data-sl]").map((x) => +x.value || 60) })));
$$("#weather .seg").forEach((b) => (b.onclick = () => setE({ weatherMode: b.dataset.w })));
$("#reroll").onclick = () => setE({ weatherMode: "auto", reroll: true });
$("#grain").oninput = throttle(() => { $("#grainV").textContent = Math.round($("#grain").value * 100); setE({ knobs: { grain: +$("#grain").value } }); }, 60);
$("#grainR").onclick = () => env && setE({ knobs: { grain: env.knobDefs.grain } });
$("#mute").onclick = () => env && setE({ muted: !env.env.muted });
$("#hud").onchange = (e) => setE({ showHud: e.target.checked });

function renderStatus() {
  if (!env) return; const E = env.env, on = screens.filter((s) => s.online);
  const rows = [
    ["season", `${SEASON[env.season]} ${Math.round(env.seasonProgress * 100)}% · next in ${mmss(env.seasonLeftMs / E.speed)}`],
    ["time", `${hhmm(env.hour)} ${env.isDay ? "day" : "night"} · ${E.dayMin}+${E.nightMin} min · ${E.speed}×${E.paused ? " paused" : ""}`],
    ["weather", `${WX[env.weather.state]}${env.weather.intensity ? " " + Math.round(env.weather.intensity * 100) + "%" : ""}${E.weatherMode === "auto" ? " · changes in " + mmss(E.w.left / E.speed) : " · fixed"}`],
    ["screens", `${on.length} online / ${screens.length}`],
    ...screens.map((s) => [(s.online ? "● " : "○ ") + s.name, s.online ? `${SCENE_I[s.scene]} ${s.w}×${s.h} · ${Math.round(s.fps)}fps${s.fpsCap ? "/" + s.fpsCap : ""} · ${s.audio ? "♪" : "muted"}${s.battery ? ` · ${s.battery.charging ? "⚡" : ""}${Math.round(s.battery.level * 100)}%` : ""}` : "offline"]),
  ];
  $("#status").innerHTML = rows.map(([k, v]) => `<div class="it"><span class="dim">${escapeHTML(k)}</span><span>${escapeHTML(String(v))}</span></div>`).join("");
}
