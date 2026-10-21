// One overlay per screen. It draws the paper (and the lamp) once, and again only
// when something changes. Every click and key goes straight through it.
import { call, currentWindow, listen, native } from './api.js';
import { load, save, currentPaper, intensityOf, showFor, nextPaper } from './prefs.js';
import { paper, createRenderer, lampGeometry, kelvin } from './paper.js';

const canvas = document.getElementById('c');
const renderer = createRenderer(canvas);
const dark = matchMedia('(prefers-color-scheme: dark)');
const label = native ? currentWindow().label : 'overlay-0';
const params = new URLSearchParams(location.search);

let prefs = load();
let W = 0;
let H = 0;
let dpr = 1;
let cursor = null;
let shownPaper = '';

if (!native) {
  document.documentElement.classList.add('preview');
  // The preview takes settings from the address too, e.g. ?paper=linen&lamp
  if (params.get('paper')) prefs = { ...prefs, paper: params.get('paper'), schedule: false };
  if (params.has('lamp')) prefs = { ...prefs, lamp: true };
  if (params.get('intensity')) prefs = { ...prefs, intensity: { [`${prefs.paper}:light`]: Number(params.get('intensity')), [`${prefs.paper}:dark`]: Number(params.get('intensity')) } };
}

function resize() {
  dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  render();
}

function render() {
  if (!renderer || !W) return;
  const id = currentPaper(prefs);
  shownPaper = id;
  const lamp = prefs.lamp
    ? { ...lampGeometry(prefs.lampWhere, W, H, prefs.lampHeight, cursor), color: kelvin(prefs.lampKelvin), strength: prefs.lampStrength, edge: prefs.lampEdge }
    : null;
  renderer.draw(paper(id), { intensity: intensityOf(prefs, id, dark.matches), dpr, lamp });
}

// ---------- The app in front, and the mouse when the lamp follows it.
const SEEN = 'vellum:apps';
function remember(app) {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN) || '[]');
    if (seen[0] === app) return;
    localStorage.setItem(SEEN, JSON.stringify([app, ...seen.filter((a) => a !== app)].slice(0, 40)));
  } catch {}
}

let lastApp = 0;
async function poll() {
  const followMouse = prefs.lamp && prefs.lampWhere === 'mouse';
  const now = performance.now();
  const wantApp = now - lastApp > 700;
  if (native && (followMouse || wantApp)) {
    try {
      const s = await call('status', { wantApp });
      if (wantApp) {
        lastApp = now;
        if (s.app) remember(s.app);
        canvas.style.opacity = showFor(prefs, s.app) ? '1' : '0';
      }
      if (followMouse && s.cursor) {
        const moved = !cursor || Math.abs(cursor.x - s.cursor[0]) + Math.abs(cursor.y - s.cursor[1]) > 2;
        cursor = { x: s.cursor[0], y: s.cursor[1] };
        if (moved) render();
      }
    } catch {}
  }
  setTimeout(poll, followMouse ? 40 : 350);
}

// ---------- Events
listen('vellum://prefs', (next) => {
  prefs = next;
  render();
});
// The tray's shortcuts change settings once, from the first overlay only.
listen('vellum://toggle-lamp', () => label === 'overlay-0' && save({ ...prefs, lamp: !prefs.lamp }));
listen('vellum://next-paper', () => label === 'overlay-0' && save({ ...prefs, paper: nextPaper(prefs), schedule: false }));
dark.addEventListener('change', render);
window.addEventListener('resize', resize);
setInterval(() => currentPaper(prefs) !== shownPaper && render(), 30000); // day and night papers
if (!native) {
  window.addEventListener('pointermove', (e) => {
    cursor = { x: e.clientX, y: e.clientY };
    if (prefs.lamp && prefs.lampWhere === 'mouse') render();
  });
  window.vellumSet = (patch) => {
    prefs = { ...prefs, ...patch };
    render();
  };
}

resize();
poll();
