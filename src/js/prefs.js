// Settings kept in local storage and shared by every Vellum window. A change in the
// settings window is announced to the overlays with an event.
import { emit } from './api.js';
import { PAPERS } from './paper.js';

const KEY = 'vellum:prefs';
export const DEFAULTS = {
  paper: 'matte',
  intensity: {}, // "<paper>:light" / "<paper>:dark" -> 0..1, remembered per paper and appearance
  favorites: ['matte', 'linen', 'coldpress', 'parchment'],
  lamp: false,
  lampWhere: 'top-left', // a spot from LAMP_SPOTS, or "mouse"
  lampKelvin: 3000,
  lampHeight: 0.5,
  lampStrength: 0.6,
  lampEdge: 0.35,
  schedule: false,
  dayPaper: 'matte',
  nightPaper: 'parchment',
  dayStart: '07:00',
  nightStart: '19:00',
  appMode: 'except', // "except": everywhere but the listed apps; "only": just in them
  apps: [],
};
export const DEFAULT_INTENSITY = 0.55;

export function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function save(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {}
  emit('vellum://prefs', prefs);
}

const minutes = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** True between nightStart and dayStart, across midnight. */
export function isNight(date, dayStart, nightStart) {
  const now = date.getHours() * 60 + date.getMinutes();
  const day = minutes(dayStart);
  const night = minutes(nightStart);
  if (day === night) return false;
  return day < night ? now < day || now >= night : now >= night && now < day;
}

/** Which paper to show right now. */
export function currentPaper(prefs, date = new Date()) {
  const id = prefs.schedule ? (isNight(date, prefs.dayStart, prefs.nightStart) ? prefs.nightPaper : prefs.dayPaper) : prefs.paper;
  return PAPERS.some((p) => p.id === id) ? id : 'matte';
}

export function intensityOf(prefs, id, dark) {
  const v = prefs.intensity[`${id}:${dark ? 'dark' : 'light'}`];
  return typeof v === 'number' ? v : DEFAULT_INTENSITY;
}

/** Whether paper should show while `app` is in front. Unknown apps follow the mode's default. */
export function showFor(prefs, app) {
  const listed = Boolean(app) && prefs.apps.includes(app);
  return prefs.appMode === 'only' ? listed : !listed;
}

/** The next paper in the favourites (or all papers), for the tray's "Next paper". */
export function nextPaper(prefs) {
  const ring = prefs.favorites.length ? prefs.favorites : PAPERS.map((p) => p.id);
  const i = ring.indexOf(prefs.paper);
  return ring[(i + 1) % ring.length];
}
