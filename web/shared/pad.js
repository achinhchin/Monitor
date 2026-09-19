// Scratch pad: pressure-sensitive ink with palm rejection, live streaming and undo.
// Points are x,y,pressure triples; x and y are normalised by the canvas width so ink keeps its shape.
(() => {
const INK = ["#2b2b3a", "#3d6fd6", "#e0564f", "#3aa76d", "#f2a93b", "#f4f1ea"], SIZES = [.004, .008, .016];
const r4 = (v) => Math.round(v * 1e4) / 1e4;

class PadView {
  constructor(canvas, send) {
    this.c = canvas; this.g = canvas.getContext("2d"); this.send = send;
    this.strokes = []; this.live = new Map(); this.cur = null; this.penAt = -1e9; this.lastLive = 0;
    this.tool = { c: INK[0], w: SIZES[1], e: false };
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
    if (P.length === 3 && !from) { g.beginPath(); g.arc(P[0] * W, P[1] * W, base * (s.e ? 1.25 : .2 + P[2] * .7), 0, 7); g.fill(); }
    for (let i = Math.max(3, from - 3); i < P.length; i += 3) {
      const mx = (a) => ((P[a - 3] + P[a]) / 2) * W, my = (a) => ((P[a - 2] + P[a + 1]) / 2) * W;
      g.lineWidth = base * (s.e ? 2.5 : .35 + P[i + 2] * 1.3); g.beginPath();
      if (i < 6) g.moveTo(P[0] * W, P[1] * W); else g.moveTo(mx(i - 3), my(i - 3));
      g.quadraticCurveTo(P[i - 3] * W, P[i - 2] * W, mx(i), my(i)); g.stroke();
    }
    g.globalCompositeOperation = "source-over";
  }
  tail(s) { const P = s.p, n = P.length, W = this.c.width; if (n < 6) return; const g = this.g; g.globalCompositeOperation = s.e ? "destination-out" : "source-over"; g.strokeStyle = s.c; g.lineWidth = s.w * W * (s.e ? 2.5 : .35 + P[n - 1] * 1.3); g.beginPath(); g.moveTo(((P[n - 6] + P[n - 3]) / 2) * W, ((P[n - 5] + P[n - 2]) / 2) * W); g.lineTo(P[n - 3] * W, P[n - 2] * W); g.stroke(); g.globalCompositeOperation = "source-over"; }
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

// toolbar: ink colours, pen size, eraser, undo, clear (tap twice)
function padTools(box, view, act, dark) {
  if (dark) view.tool.c = INK[5];
  box.innerHTML = INK.map((c) => `<button class="pt ink" data-c="${c}" style="--ink:${c}"></button>`).join("") + `<button class="pt sz" title="size">●</button><button class="pt er" title="eraser">⌫</button><button class="pt un" title="undo">↶</button><button class="pt cl" title="clear">✕</button>`;
  const sync = () => { box.querySelectorAll(".ink").forEach((b) => b.classList.toggle("on", !view.tool.e && b.dataset.c === view.tool.c)); box.querySelector(".er").classList.toggle("on", view.tool.e); box.querySelector(".sz").style.fontSize = 6 + SIZES.indexOf(view.tool.w) * 4 + "px"; };
  let armed = 0;
  box.addEventListener("pointerdown", (e) => e.stopPropagation());
  box.addEventListener("click", (e) => {
    const b = e.target.closest(".pt"); if (!b) return; e.stopPropagation();
    if (b.dataset.c) { view.tool.c = b.dataset.c; view.tool.e = false; }
    else if (b.classList.contains("sz")) view.tool.w = SIZES[(SIZES.indexOf(view.tool.w) + 1) % SIZES.length];
    else if (b.classList.contains("er")) view.tool.e = !view.tool.e;
    else if (b.classList.contains("un")) act("undo");
    else if (b.classList.contains("cl")) { if (Date.now() - armed < 2500) { act("clear"); armed = 0; b.classList.remove("warn"); } else { armed = Date.now(); b.classList.add("warn"); setTimeout(() => b.classList.remove("warn"), 2500); } }
    sync();
  });
  sync();
}
window.PadView = PadView; window.padTools = padTools; window.PAD_BGS = ["paper", "grid", "dark", "glass"];
})();
