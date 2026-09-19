// Scratch pad: pressure-sensitive ink with palm rejection, live streaming and undo.
// Points are x,y,pressure triples; x and y are normalised by the canvas width so ink keeps its shape.
(() => {
const r4 = (v) => Math.round(v * 1e4) / 1e4;

class PadView {
  constructor(canvas, send) {
    this.c = canvas; this.g = canvas.getContext("2d"); this.send = send;
    this.strokes = []; this.live = new Map(); this.cur = null; this.penAt = -1e9; this.lastLive = 0;
    this.tool = { c: "#2b2b3a", w: .0064, e: false };
    let t; this.ro = new ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => this.fit(), 120); }); this.ro.observe(canvas);
    this.bind(); this.fit();
  }
  fit() {
    const r = this.c.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2), w = Math.round(r.width * d), h = Math.round(r.height * d);
    if (w && h && (w !== this.c.width || h !== this.c.height)) { this.c.width = w; this.c.height = h; this.redraw(); }
  }
  set(list) { this.strokes = (list || []).slice(); this.live.clear(); this.redraw(); }
  add(s) { if (s.k && this.live.has(s.k)) { this.live.delete(s.k); this.strokes.push(s); this.tail(s); } else { this.strokes.push(s); this.draw(s); } }
  liveIn(k, s) { const old = this.live.get(k); this.live.set(k, s); this.draw(s, old ? old.p.length : 0); }
  redraw() { this.g.clearRect(0, 0, this.c.width, this.c.height); for (const s of this.strokes) this.draw(s); for (const s of this.live.values()) this.draw(s); if (this.cur) this.draw(this.cur); }
  // midpoint-quadratic segments; width follows pressure; eraser cuts through with destination-out
  draw(s, from = 0) {
    const g = this.g, P = s.p, W = this.c.width, base = s.w * W;
    g.globalCompositeOperation = s.e ? "destination-out" : "source-over"; g.strokeStyle = g.fillStyle = s.c; g.lineCap = g.lineJoin = "round";
    if (P.length === 3 && !from) { g.beginPath(); g.arc(P[0] * W, P[1] * W, base * (s.e ? .5 : .2 + P[2] * .7), 0, 7); g.fill(); }
    for (let i = Math.max(3, from - 3); i < P.length; i += 3) {
      const mx = (a) => ((P[a - 3] + P[a]) / 2) * W, my = (a) => ((P[a - 2] + P[a + 1]) / 2) * W;
      g.lineWidth = base * (s.e ? 1 : .35 + P[i + 2] * 1.3); g.beginPath();
      if (i < 6) g.moveTo(P[0] * W, P[1] * W); else g.moveTo(mx(i - 3), my(i - 3));
      g.quadraticCurveTo(P[i - 3] * W, P[i - 2] * W, mx(i), my(i)); g.stroke();
    }
    g.globalCompositeOperation = "source-over";
  }
  tail(s) { const P = s.p, n = P.length, W = this.c.width; if (n < 6) return; const g = this.g; g.globalCompositeOperation = s.e ? "destination-out" : "source-over"; g.strokeStyle = s.c; g.lineWidth = s.w * W * (s.e ? 1 : .35 + P[n - 1] * 1.3); g.beginPath(); g.moveTo(((P[n - 6] + P[n - 3]) / 2) * W, ((P[n - 5] + P[n - 2]) / 2) * W); g.lineTo(P[n - 3] * W, P[n - 2] * W); g.stroke(); g.globalCompositeOperation = "source-over"; }
  bind() {
    const c = this.c, pt = (e) => { const r = c.getBoundingClientRect(); return [r4((e.clientX - r.left) / r.width), r4((e.clientY - r.top) / r.width), e.pointerType === "mouse" || !e.pressure ? .5 : Math.round(e.pressure * 100) / 100]; };
    c.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "pen") this.penAt = performance.now();
      else if (e.pointerType === "touch" && performance.now() - this.penAt < 3000) return; // palm rejection
      e.preventDefault(); e.stopPropagation(); c.setPointerCapture(e.pointerId);
      this.cur = { k: Math.random().toString(36).slice(2, 9), c: this.tool.c, w: this.tool.w, e: this.tool.e, p: pt(e) }; this.draw(this.cur);
    });
    c.addEventListener("pointermove", (e) => {
      const s = this.cur; if (!s) return; e.preventDefault();
      if (e.pointerType === "pen") this.penAt = performance.now();
      const from = s.p.length, W = c.getBoundingClientRect().width;
      for (const ev of (e.getCoalescedEvents && e.getCoalescedEvents()) || [e]) { const p = pt(ev), n = s.p.length; if (Math.hypot(p[0] - s.p[n - 3], p[1] - s.p[n - 2]) * W > 1.2) s.p.push(...p); }
      if (s.p.length > from) this.draw(s, from);
      const now = performance.now(); if (now - this.lastLive > 50) { this.lastLive = now; this.send("live", s); }
    });
    const end = () => { const s = this.cur; if (!s) return; this.cur = null; this.tail(s); this.strokes.push(s); this.send("stroke", s); };
    c.addEventListener("pointerup", end); c.addEventListener("pointercancel", end);
  }
}

// tool panel: 5 editable inks (tap the selected one to recolour), pen + eraser size sliders, undo/redo/clear.
// Choices are per device (localStorage) so every writer keeps their own pens.
const PREF = "padPrefs", DEF = { ink: ["#2b2b3a", "#3d6fd6", "#e0564f", "#3aa76d", "#f4f1ea"], ci: 0, pen: 8, er: 40, e: false };
const loadP = () => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(PREF)) }; } catch (_) { return { ...DEF }; } };
const saveP = (p) => { try { localStorage.setItem(PREF, JSON.stringify(p)); } catch (_) {} };
function padTools(box, view, act) {
  const P = loadP();
  box.innerHTML = `<div class="pt-row"><span class="grip" title="move">⠿</span>${P.ink.map((c, i) => `<button class="pt ink" data-i="${i}" style="--ink:${c}"><input type="color" value="${c}" tabindex="-1"></button>`).join("")}<span class="sep"></span><button class="pt er" title="eraser">⌫</button><button class="pt un" title="undo">↶</button><button class="pt re" title="redo">↷</button><button class="pt cl" title="clear (tap twice)">✕</button></div>
<div class="pt-row sl"><span class="pv"><i></i></span><input class="psz" type="range" min="1" max="40" step="1" title="pen size"><b class="nv pn"></b></div>
<div class="pt-row sl"><span class="pv er-pv"><i></i></span><input class="esz" type="range" min="4" max="120" step="1" title="eraser size"><b class="nv en"></b></div>`;
  const $ = (q) => box.querySelector(q), inks = [...box.querySelectorAll(".ink")];
  const apply = () => {
    view.tool = P.e ? { c: "#000", w: P.er * .001, e: true } : { c: P.ink[P.ci], w: P.pen * .0008, e: false };
    inks.forEach((b, i) => { b.style.setProperty("--ink", P.ink[i]); b.classList.toggle("on", !P.e && i === P.ci); });
    $(".er").classList.toggle("on", P.e); $(".psz").value = P.pen; $(".esz").value = P.er;
    const pv = $(".pv i"), ev = $(".er-pv i"); pv.style.cssText = `width:${4 + P.pen * .9}px;height:${4 + P.pen * .9}px;background:${P.ink[P.ci]}`; ev.style.cssText = `width:${6 + P.er * .35}px;height:${6 + P.er * .35}px`;
    $(".pn").textContent = P.pen; $(".en").textContent = P.er; box.classList.toggle("erasing", P.e); saveP(P);
  };
  let armed = 0;
  box.addEventListener("pointerdown", (e) => { if (!e.target.closest(".grip")) e.stopPropagation(); });
  box.addEventListener("click", (e) => {
    const b = e.target.closest(".pt"); if (!b) return; e.stopPropagation();
    if (b.dataset.i) { const i = +b.dataset.i; if (!P.e && i === P.ci && e.target === b) b.firstChild.click(); P.ci = i; P.e = false; }
    else if (b.classList.contains("er")) P.e = !P.e;
    else if (b.classList.contains("un")) act("undo");
    else if (b.classList.contains("re")) act("redo");
    else if (b.classList.contains("cl")) { if (Date.now() - armed < 2500) { act("clear"); armed = 0; b.classList.remove("warn"); } else { armed = Date.now(); b.classList.add("warn"); setTimeout(() => b.classList.remove("warn"), 2500); } }
    apply();
  });
  inks.forEach((b, i) => b.firstChild.addEventListener("input", (e) => { P.ink[i] = e.target.value; P.ci = i; P.e = false; apply(); }));
  $(".psz").addEventListener("input", (e) => { P.pen = +e.target.value; P.e = false; apply(); });
  $(".esz").addEventListener("input", (e) => { P.er = +e.target.value; P.e = true; apply(); });
  apply();
}
window.PadView = PadView; window.padTools = padTools; window.PAD_BGS = ["paper", "grid", "dark", "glass", "clear"];
})();
