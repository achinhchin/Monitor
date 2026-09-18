const $ = (s) => document.querySelector(s);
const scene = new Scene($("#sky")), amb = new Ambience(), els = new Map();
const hhmm = (h) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;
const SEASON = ["spring", "summer", "autumn", "winter"];
let env = null, fps = 0;

const sendScreen = () => link.send({ type: "screen", screen: { w: $("#notes").clientWidth, h: $("#notes").clientHeight, dpr: devicePixelRatio || 1 } });
const link = new Link("monitor", {
  open: sendScreen,
  status: (s) => $("#off").classList.toggle("show", s !== "open"),
  message: (m) => {
    if (m.type === "kicked") { link.stop(); amb.stop(); $("#kicked").hidden = false; }
    else if (m.type === "welcome") { [...els.keys()].forEach(drop); m.notes.forEach(upsert); setEnv(m.env); }
    else if (m.type === "note.upsert") upsert(m.note);
    else if (m.type === "note.remove") drop(m.id);
    else if (m.type === "env") setEnv(m.env);
  },
});

function upsert(n) {
  if (!n.enabled) return drop(n.id);
  let el = els.get(n.id);
  if (!el || el.classList.contains("bye")) {
    if (el) el.remove();
    el = document.createElement("div"); el.className = "note"; el.innerHTML = `<div class="t"></div><div class="b"></div>`;
    $("#notes").appendChild(el); els.set(n.id, el);
  }
  Object.assign(el.style, { left: n.x * 100 + "%", top: n.y * 100 + "%", width: n.w * 100 + "%", height: n.h * 100 + "%", fontSize: n.fontSize + "px", zIndex: n.z });
  if (el._t !== n.title) el.firstChild.textContent = el._t = n.title;
  if (el._c !== n.content) el.lastChild.innerHTML = renderMarkdown(el._c = n.content);
}
function drop(id) {
  const el = els.get(id); if (!el) return;
  els.delete(id); el.classList.add("bye"); setTimeout(() => el.remove(), 500);
}

function setEnv(e) {
  env = e; scene.setEnv(e);
  amb.vol = e.volume; amb.muted = e.muted;
  $("#hud").classList.toggle("hide", !e.showHud);
  $("#hSeason").textContent = SEASON[e.season];
  $("#hWx").textContent = e.raining ? (e.season === 3 ? "❄ snow" : "☂ rain") : "";
}

let rt; addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { scene.resize(); sendScreen(); }, 200); });

scene.onThunder = (d, a) => amb.thunder(d, a);
let last = performance.now(), frames = 0, fpsT = 0, themeT = 0;
function loop(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  const st = scene.frame(now, dt);
  amb.update(st, dt);
  frames++; fpsT += dt; if (fpsT >= 1) { fps = frames / fpsT; frames = fpsT = 0; }
  if (st && (themeT -= dt) <= 0) {
    themeT = .5;
    $("#hClock").textContent = `${st.day ? "☀" : "☾"} ${hhmm(st.hour)}`;
    const n = st.night, r = document.documentElement.style;
    r.setProperty("--nbg", `rgba(${255 - n * 200 | 0},${255 - n * 200 | 0},${255 - n * 170 | 0},${.34 - n * .1})`);
    r.setProperty("--nfg", n > .5 ? "#eeeaff" : "#2c2a3e");
    r.setProperty("--ndim", n > .5 ? "rgba(238,234,255,.6)" : "rgba(44,42,62,.6)");
    r.setProperty("--nline", `rgba(255,255,255,${.45 - n * .3})`);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
setInterval(() => link.send({ type: "stats", fps: Math.round(fps), audio: !!(amb.ctx && amb.ctx.state === "running") }), 3000);

const enableSound = () => { if (!link.stopped) amb.start().then(() => amb.ctx.state === "running" && $("#sound").classList.add("gone")).catch(() => {}); };
$("#sound").onclick = enableSound;
addEventListener("pointerdown", enableSound); addEventListener("keydown", enableSound);
enableSound(); // works under autoplay-permissive kiosk flags

let idle; addEventListener("mousemove", () => { document.body.classList.add("cur"); clearTimeout(idle); idle = setTimeout(() => document.body.classList.remove("cur"), 2500); });
addEventListener("dblclick", () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}));
const wake = () => navigator.wakeLock && navigator.wakeLock.request("screen").catch(() => {});
wake(); document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && wake());
addEventListener("pagehide", () => amb.stop());
