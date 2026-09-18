// Reconnecting WebSocket with liveness detection.
// The server pushes env state every second, so silence for STALE_MS means the
// link is dead: the socket is closed, all timers are cleared and we retry.
(function () {
  const STALE_MS = 6000;
  const PING_MS = 4000;

  function Link(role, handlers) {
    this.role = role;
    this.h = handlers || {};
    this.ws = null;
    this.id = null;
    this.retry = 0;
    this.timers = { watch: null, ping: null, reconnect: null };
    this.lastMsg = 0;
    this.stopped = false;
    this.queue = [];
    this.connect();
    window.addEventListener("pagehide", () => this.stop());
  }

  Link.prototype.url = function () {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/ws?role=${this.role}`;
  };

  Link.prototype.clearTimers = function () {
    clearInterval(this.timers.watch);
    clearInterval(this.timers.ping);
    clearTimeout(this.timers.reconnect);
    this.timers = { watch: null, ping: null, reconnect: null };
  };

  Link.prototype.teardown = function () {
    this.clearTimers();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try { ws.close(); } catch (_) {}
    }
  };

  Link.prototype.connect = function () {
    if (this.stopped) return;
    this.teardown();
    this.status("connecting");
    let ws;
    try { ws = new WebSocket(this.url()); } catch (e) { return this.scheduleReconnect(); }
    this.ws = ws;

    ws.onopen = () => {
      this.retry = 0;
      this.lastMsg = Date.now();
      this.status("open");
      const q = this.queue; this.queue = [];
      q.forEach((m) => this.send(m));
      this.timers.ping = setInterval(() => this.send({ type: "ping" }), PING_MS);
      this.timers.watch = setInterval(() => {
        if (Date.now() - this.lastMsg > STALE_MS) {
          console.warn("[link] timed out, reconnecting");
          this.drop();
        }
      }, 1000);
      this.h.open && this.h.open();
    };
    ws.onmessage = (ev) => {
      this.lastMsg = Date.now();
      let m;
      try { m = JSON.parse(ev.data); } catch (_) { return; }
      if (m.type === "welcome") this.id = m.id;
      this.h.message && this.h.message(m);
    };
    ws.onclose = () => this.drop();
    ws.onerror = () => this.drop();
  };

  Link.prototype.drop = function () {
    if (!this.ws && this.timers.reconnect) return;
    this.teardown();
    this.id = null;
    this.status("closed");
    this.h.close && this.h.close();
    this.scheduleReconnect();
  };

  Link.prototype.scheduleReconnect = function () {
    if (this.stopped) return;
    const delay = Math.min(8000, 400 * Math.pow(1.7, this.retry++)) + Math.random() * 300;
    this.timers.reconnect = setTimeout(() => this.connect(), delay);
  };

  Link.prototype.send = function (m) {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(m));
      return true;
    }
    // keep only a few non-ping messages for when we're back
    if (m.type !== "ping" && m.type !== "stats") {
      this.queue.push(m);
      if (this.queue.length > 50) this.queue.shift();
    }
    return false;
  };

  Link.prototype.status = function (s) {
    this.state = s;
    this.h.status && this.h.status(s);
  };

  Link.prototype.stop = function () {
    this.stopped = true;
    this.teardown();
  };

  // Markdown → sanitized HTML
  function renderMarkdown(src) {
    const html = window.marked ? marked.parse(src || "", { gfm: true, breaks: true }) : escapeHTML(src || "");
    return window.DOMPurify ? DOMPurify.sanitize(html) : html;
  }
  function escapeHTML(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.Link = Link;
  window.renderMarkdown = renderMarkdown;
  window.escapeHTML = escapeHTML;
})();
