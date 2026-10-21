// The settings window: papers, the desk lamp, day and night, and per-app rules.
import { autostart, call, listen, native } from './api.js';
import { load, save, currentPaper, intensityOf } from './prefs.js';
import { PAPERS, paper, createRenderer } from './paper.js';

const $ = (id) => document.getElementById(id);
const dark = matchMedia('(prefers-color-scheme: dark)');
let prefs = load();

function change(patch) {
  prefs = { ...prefs, ...patch };
  save(prefs);
  show();
}

// ---------- Paper swatches, drawn with the same shader as the overlay.
const papersEl = $('papers');
for (const p of PAPERS) {
  const el = document.createElement('div');
  el.className = 'paper';
  el.dataset.id = p.id;
  el.setAttribute('role', 'button');
  el.tabIndex = 0;
  el.innerHTML = `<canvas></canvas><b>${p.name}</b><small>${p.feel}</small><button class="star" title="Favourite">★</button>`;
  papersEl.appendChild(el);
  const pick = () => change({ paper: p.id, schedule: false });
  el.addEventListener('click', (e) => (e.target.closest('.star') ? toggleFav(p.id) : pick()));
  el.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick()));
}
function toggleFav(id) {
  const favs = prefs.favorites.includes(id) ? prefs.favorites.filter((f) => f !== id) : [...prefs.favorites, id].slice(-4);
  change({ favorites: favs });
}
function drawSwatches() {
  for (const el of papersEl.children) {
    const cv = el.querySelector('canvas');
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    const gl = createRenderer(cv);
    // Swatches show the paper a bit stronger than on screen, so the differences read.
    if (gl) gl.draw(paper(el.dataset.id), { intensity: 0.95, dpr });
  }
}

// ---------- Lamp spots
const SPOTS = [
  ['top-left', 'Top left'],
  ['top', 'Top'],
  ['top-right', 'Top right'],
  ['left', 'Left'],
  ['right', 'Right'],
  ['bottom-left', 'Bottom left'],
  ['bottom-right', 'Bottom right'],
  ['mouse', 'Follows the mouse'],
];
$('spots').innerHTML = SPOTS.map(([id, t]) => `<button data-id="${id}">${t}</button>`).join('');
$('spots').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) change({ lampWhere: b.dataset.id });
});

// ---------- Sliders and switches
const FMT = {
  intensity: (v) => `${Math.round(v * 100)}%`,
  lampKelvin: (v) => `${v} K`,
  lampHeight: (v) => `${Math.round(v * 100)}%`,
  lampStrength: (v) => `${Math.round(v * 100)}%`,
  lampEdge: (v) => `${Math.round(v * 100)}%`,
};
$('intensity').addEventListener('input', (e) => {
  const id = currentPaper(prefs);
  change({ intensity: { ...prefs.intensity, [`${id}:${dark.matches ? 'dark' : 'light'}`]: Number(e.target.value) } });
});
for (const id of ['lampKelvin', 'lampHeight', 'lampStrength', 'lampEdge']) $(id).addEventListener('input', (e) => change({ [id]: Number(e.target.value) }));
for (const id of ['lamp', 'schedule']) $(id).addEventListener('change', (e) => change({ [id]: e.target.checked }));
for (const id of ['dayStart', 'nightStart', 'dayPaper', 'nightPaper']) $(id).addEventListener('change', (e) => change({ [id]: e.target.value }));
for (const id of ['dayPaper', 'nightPaper']) $(id).innerHTML = PAPERS.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
document.querySelectorAll('input[name=appMode]').forEach((r) => r.addEventListener('change', () => change({ appMode: r.value })));

// ---------- Apps
function addApp() {
  const name = $('app-name').value.trim().toLowerCase().replace(/\.exe$/, '');
  if (!name) return;
  $('app-name').value = '';
  if (!prefs.apps.includes(name)) change({ apps: [...prefs.apps, name] });
}
$('add-app').addEventListener('click', addApp);
$('app-name').addEventListener('keydown', (e) => e.key === 'Enter' && addApp());
$('apps').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) change({ apps: prefs.apps.filter((a) => a !== b.dataset.app) });
});
function seenApps() {
  try {
    return JSON.parse(localStorage.getItem('vellum:apps') || '[]').filter((a) => !/^vellum$/.test(a));
  } catch {
    return [];
  }
}

// ---------- On / off
let on = true;
function showOn() {
  $('on').checked = on;
  $('chip').textContent = on ? 'On' : 'Off';
  $('chip').dataset.status = on ? 'tracking' : 'paused';
}
$('on').addEventListener('change', (e) => {
  on = e.target.checked;
  call('set_on', { on });
  showOn();
});
listen('vellum://on', (v) => {
  on = v;
  showOn();
});
if (native) call('get_on').then((v) => ((on = v), showOn()));
$('snooze').addEventListener('click', () => call('snooze'));
$('quit').addEventListener('click', () => call('quit'));
$('autostart').addEventListener('change', (e) => autostart.set(e.target.checked).catch(() => (e.target.checked = !e.target.checked)));
autostart.isEnabled().then((v) => ($('autostart').checked = v)).catch(() => {});

// ---------- Render the current settings
function show() {
  const current = currentPaper(prefs);
  for (const el of papersEl.children) {
    el.classList.toggle('on', el.dataset.id === current);
    el.querySelector('.star').classList.toggle('fav', prefs.favorites.includes(el.dataset.id));
  }
  const v = intensityOf(prefs, current, dark.matches);
  $('intensity').value = v;
  $('intensity-out').textContent = FMT.intensity(v);
  $('strength-note').textContent = `For ${paper(current).name} in ${dark.matches ? 'dark' : 'light'} mode. Each paper remembers its own.`;
  $('lamp').checked = prefs.lamp;
  $('lamp-options').dataset.disabled = String(!prefs.lamp);
  for (const b of $('spots').children) b.classList.toggle('on', b.dataset.id === prefs.lampWhere);
  for (const id of ['lampKelvin', 'lampHeight', 'lampStrength', 'lampEdge']) {
    $(id).value = prefs[id];
    $(`${id}-out`).textContent = FMT[id](prefs[id]);
  }
  $('schedule').checked = prefs.schedule;
  $('schedule-options').dataset.disabled = String(!prefs.schedule);
  for (const id of ['dayStart', 'nightStart', 'dayPaper', 'nightPaper']) $(id).value = prefs[id];
  document.querySelectorAll('input[name=appMode]').forEach((r) => (r.checked = r.value === prefs.appMode));
  $('apps').innerHTML = prefs.apps.map((a) => `<span>${a.replace(/[<>&"]/g, '')}<button data-app="${a.replace(/"/g, '')}" title="Remove">×</button></span>`).join('');
  $('seen').innerHTML = seenApps().map((a) => `<option value="${a.replace(/"/g, '')}">`).join('');
}

listen('vellum://prefs', (p) => {
  prefs = p;
  show();
});
dark.addEventListener('change', show);
addEventListener('resize', drawSwatches);
show();
showOn();
requestAnimationFrame(drawSwatches);
