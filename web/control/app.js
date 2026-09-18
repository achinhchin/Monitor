const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const notes = new Map();
let sel = null, env = null, clients = [], view = "split";
const SEASON = ["🌸 spring", "☀️ summer", "🍂 autumn", "❄️ winter"];

const link = new Link("control", {
  status: (s) => { const c = $("#conn"); c.className = "pill " + (s === "open" ? "on-link" : "off-link"); c.lastChild.textContent = s; },
  message: onMsg,
});

function onMsg(m) {
  switch (m.type) {
    case "welcome":
      notes.clear(); m.notes.forEach((n) => notes.set(n.id, n));
      clients = m.clients; setEnv(m.env); renderAll(); break;
    case "note.upsert": {
      const mine = m.by === link.id;
      notes.set(m.note.id, m.note);
      if (m.created && mine) select(m.note.id);
      renderList(); renderStage();
      if (m.note.id === sel) fillEditor(mine); break;
    }
    case "note.remove":
      notes.delete(m.id); if (sel === m.id) select(null); renderList(); renderStage(); break;
    case "env": setEnv(m.env); break;
    case "clients": clients = m.clients; renderStatus(); renderStage(); break;
  }
}

// ── monitor screen ──
const monitors = () => clients.filter((c) => c.role === "monitor" && c.screen);
const screen = () => { const m = monitors(); return m.length ? m[m.length - 1].screen : { w: 1920, h: 1080, dpr: 1 }; };

// ── notes list / editor ──
const cur = () => notes.get(sel);
const send = (m) => link.send(m);
const patch = (id, p) => { const n = notes.get(id); if (n) Object.assign(n, p); send({ type: "note.update", id, patch: p }); };

function renderAll() { renderList(); fillEditor(false); renderStatus(); renderStage(); }

function renderList() {
  const ul = $("#list"); ul.innerHTML = "";
  [...notes.values()].sort((a, b) => a.created - b.created).forEach((n) => {
    const li = document.createElement("li");
    li.className = (n.id === sel ? "sel " : "") + (n.enabled ? "" : "off");
    li.innerHTML = `<label class="sw"><input type="checkbox" ${n.enabled ? "checked" : ""}><span></span></label><span></span>`;
    li.lastChild.textContent = n.title || "Untitled";
    li.onclick = (e) => { if (!e.target.closest(".sw")) select(n.id); };
    li.querySelector("input").onchange = (e) => { patch(n.id, { enabled: e.target.checked }); renderList(); renderStage(); if (n.id === sel) $("#enabled").checked = e.target.checked; };
    ul.appendChild(li);
  });
}

function select(id) {
  sel = id; renderList(); fillEditor(false); renderStage();
}

function fillEditor(fromSelf) {
  const n = cur();
  $("#editor").hidden = !n; $("#empty").hidden = !!n;
  $("#posBox").classList.toggle("dis", !n);
  if (!n) return;
  const set = (el, v) => { if (!(fromSelf && document.activeElement === el) && document.activeElement !== el) el.value = v; };
  set($("#title"), n.title); set($("#content"), n.content); set($("#fs"), n.fontSize);
  $("#enabled").checked = n.enabled;
  $("#preview").innerHTML = renderMarkdown(n.content);
  fillPos();
}

function fillPos() {
  const n = cur(); if (!n) return; const s = screen();
  const v = { x: n.x * s.w, y: n.y * s.h, w: n.w * s.w, h: n.h * s.h };
  $$(".grid4 input").forEach((i) => { if (document.activeElement !== i) i.value = Math.round(v[i.dataset.k]); });
}

const throttle = (fn, ms) => { let t = 0, last; return (...a) => { last = a; if (!t) t = setTimeout(() => { t = 0; fn(...last); }, ms); }; };
const pushText = throttle(() => { const n = cur(); if (n) patch(n.id, { title: $("#title").value, content: $("#content").value }); }, 120);

$("#title").oninput = () => { pushText(); const n = cur(); if (n) { n.title = $("#title").value; renderList(); } };
$("#content").oninput = () => { pushText(); $("#preview").innerHTML = renderMarkdown($("#content").value); };
$("#content").onkeydown = (e) => {
  if (e.key !== "Tab") return;
  e.preventDefault(); const t = e.target, s = t.selectionStart;
  t.setRangeText("  ", s, t.selectionEnd, "end"); pushText();
};
$("#fs").onchange = (e) => sel && patch(sel, { fontSize: +e.target.value });
$("#enabled").onchange = (e) => { if (sel) { patch(sel, { enabled: e.target.checked }); renderList(); renderStage(); } };
$("#del").onclick = () => { const n = cur(); if (n && confirm(`Delete "${n.title}"?`)) send({ type: "note.delete", id: n.id }); };
$("#newNote").onclick = () => send({ type: "note.create", title: "Note " + (notes.size + 1), content: "# Hello\n\nWrite **markdown** here." });
$$(".tabs .seg").forEach((b) => b.onclick = () => {
  view = b.dataset.view; $$(".tabs .seg").forEach((x) => x.classList.toggle("on", x === b)); $("#panes").className = "panes " + view;
});

// ── position ──
function move(dx, dy, fast, resize) {
  const n = cur(); if (!n) return; const s = screen();
  const st = +(fast ? $("#fastStep").value : $("#fineStep").value) || 1;
  const p = resize ? { w: n.w + dx * st / s.w, h: n.h + dy * st / s.h } : { x: n.x + dx * st / s.w, y: n.y + dy * st / s.h };
  setGeom(n, p);
}
function setGeom(n, p) {
  const g = { x: n.x, y: n.y, w: n.w, h: n.h, ...p };
  g.w = clamp(g.w, 0.02, 1); g.h = clamp(g.h, 0.02, 1);
  g.x = clamp(g.x, 0, 1 - g.w); g.y = clamp(g.y, 0, 1 - g.h);
  patch(n.id, g); fillPos(); renderStage();
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

$$("[data-mv]").forEach((b) => {
  const [dx, dy, f] = b.dataset.mv.split(",").map(Number);
  let rep;
  const stop = () => { clearTimeout(rep); clearInterval(rep); };
  b.onpointerdown = () => { move(dx, dy, f); rep = setTimeout(() => (rep = setInterval(() => move(dx, dy, f), 60)), 350); };
  b.onpointerup = b.onpointerleave = b.onpointercancel = stop;
});
$$(".grid4 input").forEach((i) => i.onchange = () => {
  const n = cur(); if (!n) return; const s = screen(), k = i.dataset.k;
  setGeom(n, { [k]: +i.value / (k === "x" || k === "w" ? s.w : s.h) });
});
$$("[data-snap]").forEach((b) => b.onclick = () => {
  const n = cur(); if (!n) return; const mx = 0.015, my = 0.025;
  const pos = { br: [1 - n.w - mx, 1 - n.h - my], tl: [mx, my], tr: [1 - n.w - mx, my], bl: [mx, 1 - n.h - my], c: [(1 - n.w) / 2, (1 - n.h) / 2] }[b.dataset.snap];
  setGeom(n, { x: pos[0], y: pos[1] });
});

// ── virtual screen ──
$("#openScreen").onclick = () => { $("#modal").hidden = false; renderStage(); };
$("#closeScreen").onclick = () => ($("#modal").hidden = true);
$("#modal").onclick = (e) => { if (e.target.id === "modal") $("#modal").hidden = true; };
window.addEventListener("resize", renderStage);
document.addEventListener("keydown", (e) => {
  if ($("#modal").hidden) return;
  if (e.key === "Escape") return ($("#modal").hidden = true);
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
  if (d) { e.preventDefault(); move(d[0], d[1], e.shiftKey, e.altKey); }
});

let drag = null;
function renderStage() {
  if ($("#modal").hidden || drag) return;
  const s = screen(), wrap = $("#stageWrap"), st = $("#stage");
  const k = Math.min(wrap.clientWidth / s.w, wrap.clientHeight / s.h);
  st.style.width = s.w * k + "px"; st.style.height = s.h * k + "px";
  $("#scrLbl").textContent = `${s.w}×${s.h}` + (monitors().length ? "" : " (no monitor, default)");
  st.innerHTML = "";
  [...notes.values()].sort((a, b) => a.z - b.z).forEach((n) => {
    const d = document.createElement("div");
    d.className = "vn" + (n.enabled ? "" : " off") + (n.id === sel ? " sel" : "");
    d.dataset.id = n.id; d.textContent = n.title;
    d.appendChild(Object.assign(document.createElement("i"), { className: "rz" }));
    place(d, n); st.appendChild(d);
  });
}
const place = (d, n) => Object.assign(d.style, { left: n.x * 100 + "%", top: n.y * 100 + "%", width: n.w * 100 + "%", height: n.h * 100 + "%" });

$("#stage").addEventListener("pointerdown", (e) => {
  const d = e.target.closest(".vn"); if (!d) return;
  const n = notes.get(d.dataset.id); if (sel !== n.id) { sel = n.id; renderList(); fillEditor(false); $$(".vn").forEach((x) => x.classList.toggle("sel", x === d)); }
  send({ type: "note.front", id: n.id });
  const r = $("#stage").getBoundingClientRect();
  drag = { d, n, r, sx: e.clientX, sy: e.clientY, o: { ...n }, rz: e.target.classList.contains("rz") };
  d.setPointerCapture(e.pointerId); d.style.cursor = "grabbing"; d.style.zIndex = 999;
});
$("#stage").addEventListener("pointermove", (e) => {
  if (!drag) return;
  const { n, r, o } = drag, dx = (e.clientX - drag.sx) / r.width, dy = (e.clientY - drag.sy) / r.height;
  const g = drag.rz ? { w: clamp(o.w + dx, 0.02, 1 - o.x), h: clamp(o.h + dy, 0.02, 1 - o.y) } : { x: clamp(o.x + dx, 0, 1 - o.w), y: clamp(o.y + dy, 0, 1 - o.h) };
  Object.assign(n, g); place(drag.d, n); fillPos(); sendGeom(n.id, g);
});
const sendGeom = throttle((id, g) => send({ type: "note.update", id, patch: g }), 30);
const endDrag = () => { if (!drag) return; const n = drag.n; drag = null; send({ type: "note.update", id: n.id, patch: { x: n.x, y: n.y, w: n.w, h: n.h } }); renderStage(); };
$("#stage").addEventListener("pointerup", endDrag);
$("#stage").addEventListener("pointercancel", endDrag);

// ── environment ──
const setE = (p) => send({ type: "env.set", patch: p });
const hhmm = (h) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;
const mmss = (ms) => `${Math.floor(ms / 60000)}m${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}s`;

function setEnv(e) {
  env = e;
  $("#stClock").textContent = `${e.isDay ? "☀" : "☾"} ${hhmm(e.hour)}${e.timePaused ? " ❚❚" : ""}`;
  $("#stSeason").textContent = SEASON[e.season] + (e.seasonLocked ? " 🔒" : "");
  $("#stRain").textContent = e.raining ? `${e.season === 3 ? "❄ snow" : "☔ rain"} ${Math.round(e.intensity * 100)}%` : "clear";
  $$("#seasons .seg").forEach((b) => b.classList.toggle("on", +b.dataset.s === e.season));
  $("#lockSeason").checked = e.seasonLocked;
  $("#seasonBar").style.width = e.seasonProgress * 100 + "%";
  if (document.activeElement !== $("#hour")) $("#hour").value = e.hour;
  $("#hourLbl").textContent = hhmm(e.hour);
  $("#pause").textContent = e.timePaused ? "▶ play" : "❚❚ pause"; $("#pause").classList.toggle("on", e.timePaused);
  $("#speed").value = String(e.speed);
  $$("#rain .seg").forEach((b) => b.classList.toggle("on", b.dataset.r === e.rainMode));
  if (document.activeElement !== $("#intensity")) $("#intensity").value = e.rainMode === "on" ? e.rainIntensity : e.intensity || e.rainIntensity;
  $("#intensity").disabled = e.rainMode !== "on";
  if (document.activeElement !== $("#vol")) $("#vol").value = e.volume;
  $("#mute").textContent = e.muted ? "🔇" : "🔊";
  $("#hud").checked = e.showHud;
  renderStatus();
}

$$("#seasons .seg").forEach((b) => b.onclick = () => setE({ season: +b.dataset.s }));
$("#lockSeason").onchange = (e) => setE({ seasonLocked: e.target.checked });
$("#hour").oninput = throttle((e) => setE({ hour: +$("#hour").value }), 60);
$$("[data-hr]").forEach((b) => b.onclick = () => setE({ hour: +b.dataset.hr }));
$("#pause").onclick = () => env && setE({ timePaused: !env.timePaused });
$("#speed").onchange = (e) => setE({ speed: +e.target.value });
$$("#rain .seg").forEach((b) => b.onclick = () => setE({ rainMode: b.dataset.r }));
$("#reroll").onclick = () => setE({ rainMode: "auto", rerollRain: true });
$("#intensity").oninput = throttle(() => setE({ rainIntensity: +$("#intensity").value }), 80);
$("#vol").oninput = throttle(() => setE({ volume: +$("#vol").value }), 80);
$("#mute").onclick = () => env && setE({ muted: !env.muted });
$("#hud").onchange = (e) => setE({ showHud: e.target.checked });

function renderStatus() {
  const s = screen(), mons = monitors(), ctl = clients.filter((c) => c.role === "control").length;
  $("#scr").textContent = mons.length ? `▭ ${s.w}×${s.h}` : "no monitor";
  if (!env) return;
  const rows = [
    ["season", `${SEASON[env.season]} · ${Math.round(env.seasonProgress * 100)}% · next in ${mmss((1 - env.seasonProgress) * env.seasonLenMs / env.speed)}`],
    ["time", `${hhmm(env.hour)} ${env.isDay ? "day" : "night"} · ${env.speed}×${env.timePaused ? " paused" : ""}`],
    ["weather", env.raining ? `${env.season === 3 ? "snow" : "rain"} ${Math.round(env.intensity * 100)}%` : "clear"],
    ["auto rain", env.rainMode === "auto" ? `${env.autoRaining ? "stops" : "starts"} in ${mmss(env.autoTimerMs / env.speed)}` : "manual"],
    ["sound", env.muted ? "muted" : Math.round(env.volume * 100) + "%"],
    ["controls", ctl],
    ...mons.map((m, i) => [`monitor ${i + 1}`, `${m.screen.w}×${m.screen.h}@${m.screen.dpr}x · ${Math.round(m.fps || 0)}fps · ${m.audio ? "♪" : "no audio"}`]),
  ];
  $("#status").innerHTML = rows.map(([k, v]) => `<div class="it"><span class="dim">${k}</span><span>${escapeHTML(String(v))}</span></div>`).join("");
}
