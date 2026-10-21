// The papers and the desk lamp, drawn by one fragment shader. Every texture is made
// from noise in code, so nothing is copied and it stays sharp at any resolution.

/** id, name, a one-line feel, and the recipe the shader mixes. */
export const PAPERS = [
  { id: 'matte', name: 'Matte', feel: 'A clean, even finish', grain: 0.075, fiber: 0, weave: 0, tooth: 0, blotch: 0, scale: 1, length: 1, tint: '#f6f1e7', tintAmt: 0.035 },
  { id: 'newsprint', name: 'Newsprint', feel: 'Fine grey grain with tiny fibres', grain: 0.09, fiber: 0.045, weave: 0, tooth: 0, blotch: 0.015, scale: 1, length: 0.6, tint: '#e9e6dd', tintAmt: 0.06 },
  { id: 'linen', name: 'Linen', feel: 'A soft woven cloth', grain: 0.03, fiber: 0, weave: 0.085, tooth: 0, blotch: 0, scale: 1, length: 1, tint: '#efe5d3', tintAmt: 0.05 },
  { id: 'coldpress', name: 'Cold press', feel: 'Watercolour paper with real tooth', grain: 0.03, fiber: 0, weave: 0, tooth: 0.13, blotch: 0, scale: 1, length: 1, tint: '#f5efe4', tintAmt: 0.04 },
  { id: 'parchment', name: 'Parchment', feel: 'Warm, aged and a little uneven', grain: 0.05, fiber: 0.02, weave: 0, tooth: 0.03, blotch: 0.09, scale: 1, length: 0.8, tint: '#f0d9aa', tintAmt: 0.1 },
  { id: 'kraft', name: 'Kraft', feel: 'Brown paper, full of fibres', grain: 0.06, fiber: 0.075, weave: 0, tooth: 0, blotch: 0.02, scale: 1, length: 0.9, tint: '#c9a274', tintAmt: 0.17 },
  { id: 'rice', name: 'Rice paper', feel: 'Light, with long silky fibres', grain: 0.02, fiber: 0.16, weave: 0, tooth: 0, blotch: 0.01, scale: 1, length: 2.2, tint: '#f8f4ea', tintAmt: 0.05 },
  { id: 'felt', name: 'Felt', feel: 'Dense and fuzzy, very calm', grain: 0.1, fiber: 0.05, weave: 0, tooth: 0.02, blotch: 0, scale: 1.8, length: 0.4, tint: '#e4dacb', tintAmt: 0.06 },
  { id: 'frost', name: 'Frost', feel: 'A frosted haze that softens glare', grain: 0.02, fiber: 0, weave: 0, tooth: 0, blotch: 0.035, scale: 1, length: 1, tint: '#ffffff', tintAmt: 0.075 },
];

export const paper = (id) => PAPERS.find((p) => p.id === id) || PAPERS[0];

/** Where the lamp stands, as a fraction of the screen (it can sit just off screen). */
export const LAMP_SPOTS = {
  'top-left': [0.08, -0.05],
  top: [0.5, -0.12],
  'top-right': [0.92, -0.05],
  left: [-0.08, 0.45],
  right: [1.08, 0.45],
  'bottom-left': [0.06, 1.05],
  'bottom-right': [0.94, 1.05],
};

/** Lamp centre and reach in pixels. Height lifts the lamp: higher means a wider, softer pool. */
export function lampGeometry(where, w, h, height = 0.5, cursor = null) {
  const [fx, fy] = where === 'mouse' && cursor ? [cursor.x / w, cursor.y / h] : LAMP_SPOTS[where] || LAMP_SPOTS['top-left'];
  const diag = Math.hypot(w, h);
  return { x: fx * w, y: fy * h, radius: diag * (0.35 + height * 0.55) };
}

/** Kelvin to an sRGB colour, good enough for lamp light between 1800 K and 6500 K. */
export function kelvin(k) {
  const t = Math.min(Math.max(k, 1000), 40000) / 100;
  const r = t <= 66 ? 255 : 329.7 * Math.pow(t - 60, -0.1332);
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.12 : 288.12 * Math.pow(t - 60, -0.0755);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  const c = (v) => Math.round(Math.min(255, Math.max(0, v)));
  return [c(r), c(g), c(b)];
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uDpr; uniform float uSeed;
uniform vec4 uMixA; // grain, fiber, weave, tooth
uniform vec4 uMixB; // blotch, scale, fibre length, unused
uniform vec3 uTint; uniform float uTintAmt; uniform float uIntensity;
uniform float uLamp; uniform vec2 uLampPos; uniform float uLampRadius; uniform vec3 uLampColor;
uniform float uLampStrength; uniform float uEdge;

float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx + uSeed * 17.0) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y) * 2.0 - 1.0;
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float fibres(vec2 p, float len){
  float v = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 q = rot(float(i) * 1.13 + 0.4) * p;
    float n = noise(vec2(q.x * 0.06 / len, q.y * 0.9) + float(i) * 31.7);
    v += smoothstep(0.55, 0.95, n) - smoothstep(0.55, 0.95, -n) * 0.6;
  }
  return v * 0.5;
}
float weave(vec2 p){
  float k = 0.9;
  float over = sign(sin(p.x * k * 0.5) * sin(p.y * k * 0.5));
  float a = abs(sin(p.x * k)), b = abs(sin(p.y * k));
  return (over > 0.0 ? a : b) * 2.0 - 1.0 + noise(p * 0.35) * 0.4;
}
float tooth(vec2 p){ return fbm(p * 0.11) * 0.7 + fbm(p * 0.33) * 0.3; }

float height(vec2 p){
  float s = uMixB.y;
  float h = noise(p / s * 1.1) * uMixA.x + noise(p / s * 0.5 + 9.0) * uMixA.x * 0.6;
  h += fibres(p / s, uMixB.z) * uMixA.y;
  h += weave(p) * uMixA.z;
  h += fbm(p * 0.004) * uMixB.x * 1.6 + fbm(p * 0.02) * uMixB.x * 0.6;
  return h;
}

void main(){
  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr; // CSS pixels, y down
  float d = height(px);
  if (uMixA.w > 0.0) {
    // Tooth gets light from the top left, so it reads as relief, not dirt.
    float t0 = tooth(px), tx = tooth(px + vec2(1.0, 0.0)), ty = tooth(px + vec2(0.0, 1.0));
    d += (t0 - tx + t0 - ty) * 2.5 * uMixA.w + t0 * uMixA.w * 0.35;
  }
  d *= uIntensity;
  // Paper colour first, as a thin veil that softens contrast...
  float ta = uTintAmt * uIntensity * 1.4;
  vec4 col = vec4(uTint * ta, ta);
  // ...then the grain: lighter specks and darker pits.
  float ga = clamp(abs(d), 0.0, 0.5);
  vec4 g = d > 0.0 ? vec4(vec3(ga), ga) : vec4(vec3(0.0), ga);
  col = g + col * (1.0 - g.a);
  if (uLamp > 0.5) {
    float dist = distance(px, uLampPos) / uLampRadius;
    float pool = exp(-dist * dist * 1.6) * uLampStrength * 0.32;
    vec4 light = vec4(uLampColor * pool, pool);
    float dim = smoothstep(0.55, 1.6, dist) * uEdge * 0.55;
    vec4 shade = vec4(0.0, 0.0, 0.0, dim);
    col = light + col * (1.0 - light.a);
    col = shade + col * (1.0 - shade.a);
  }
  gl_FragColor = col;
}`;

/** Draws a paper onto a canvas with WebGL. Returns null where WebGL isn't available. */
export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
  if (!gl) return null;
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = (n) => gl.getUniformLocation(prog, n);
  const U = Object.fromEntries(['uRes', 'uDpr', 'uSeed', 'uMixA', 'uMixB', 'uTint', 'uTintAmt', 'uIntensity', 'uLamp', 'uLampPos', 'uLampRadius', 'uLampColor', 'uLampStrength', 'uEdge'].map((n) => [n, u(n)]));

  return {
    /**
     * @param p paper recipe from PAPERS
     * @param o { intensity 0..1, dpr, seed, lamp: null | { x, y, radius, color:[r,g,b], strength, edge } }
     */
    draw(p, o) {
      const w = canvas.width;
      const h = canvas.height;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(U.uRes, w, h);
      gl.uniform1f(U.uDpr, o.dpr || 1);
      gl.uniform1f(U.uSeed, o.seed ?? 0.37);
      gl.uniform4f(U.uMixA, p.grain, p.fiber, p.weave, p.tooth);
      gl.uniform4f(U.uMixB, p.blotch, p.scale, p.length, 0);
      const [r, g, b] = hexToRgb(p.tint);
      gl.uniform3f(U.uTint, r / 255, g / 255, b / 255);
      gl.uniform1f(U.uTintAmt, p.tintAmt);
      gl.uniform1f(U.uIntensity, o.intensity);
      const L = o.lamp;
      gl.uniform1f(U.uLamp, L ? 1 : 0);
      if (L) {
        gl.uniform2f(U.uLampPos, L.x, L.y);
        gl.uniform1f(U.uLampRadius, L.radius);
        gl.uniform3f(U.uLampColor, L.color[0] / 255, L.color[1] / 255, L.color[2] / 255);
        gl.uniform1f(U.uLampStrength, L.strength);
        gl.uniform1f(U.uEdge, L.edge);
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
