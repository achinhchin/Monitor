// Film grain: fresh multi-scale noise every film frame (24fps), overlay-blended over the scene
(() => {
const FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 r; uniform float s, amt, fl;
float h(vec2 p){ p = fract(p * vec2(.1031, .1030) + s); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
void main(){
  vec2 p = gl_FragCoord.xy;
  // clumped silver grain: fine + medium + coarse, luminance-neutral around .5
  float n = h(p) * .55 + h(floor(p * .5) + 17.) * .3 + h(floor(p * .25) + 71.) * .15;
  float g = .5 + (n - .5) * amt + fl;
  float d = h(floor(p / 3.) + s * 9.1);
  if (d > .99988) g += h(p + 3.) > .5 ? .14 : -.14; // dust specks
  gl_FragColor = vec4(vec3(g), 1.);
}`;
const VS = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

class Grain {
  constructor(c) {
    this.c = c; const gl = (this.gl = c.getContext("webgl", { alpha: false, antialias: false, depth: false, powerPreference: "low-power" }));
    if (!gl) return;
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { this.gl = null; return; }
    gl.useProgram(pr); gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = Object.fromEntries(["r", "s", "amt", "fl"].map((n) => [n, gl.getUniformLocation(pr, n)]));
    this.last = 0; this.amt = .16; this.ok = true;
  }
  frame(now) {
    const gl = this.gl; if (!gl || now - this.last < 41) return; this.last = now;
    const w = Math.ceil(this.c.clientWidth / 1.4), h = Math.ceil(this.c.clientHeight / 1.4); // grain ≈1.4 css px, bilinear upscale softens it
    if (this.c.width !== w || this.c.height !== h) { this.c.width = w; this.c.height = h; gl.viewport(0, 0, w, h); }
    gl.uniform2f(this.u.r, w, h); gl.uniform1f(this.u.s, Math.random() * 97); gl.uniform1f(this.u.amt, this.amt); gl.uniform1f(this.u.fl, (Math.random() - .5) * .012);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
window.Grain = Grain;
})();
