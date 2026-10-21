import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAPERS, paper, lampGeometry, kelvin, hexToRgb } from '../src/js/paper.js';
import { DEFAULTS, isNight, currentPaper, intensityOf, showFor, nextPaper, DEFAULT_INTENSITY } from '../src/js/prefs.js';

const at = (h, m = 0) => new Date(2026, 9, 21, h, m);

test('there are nine papers with unique ids and sane recipes', () => {
  assert.equal(PAPERS.length, 9);
  assert.equal(new Set(PAPERS.map((p) => p.id)).size, 9);
  for (const p of PAPERS) {
    for (const k of ['grain', 'fiber', 'weave', 'tooth', 'blotch', 'tintAmt']) assert.ok(p[k] >= 0 && p[k] < 0.3, `${p.id}.${k}`);
    assert.equal(hexToRgb(p.tint).length, 3);
  }
  assert.equal(paper('nope').id, 'matte');
});

test('night runs from the night time to the day time, across midnight', () => {
  assert.equal(isNight(at(12), '07:00', '19:00'), false);
  assert.equal(isNight(at(19), '07:00', '19:00'), true);
  assert.equal(isNight(at(2), '07:00', '19:00'), true);
  assert.equal(isNight(at(6, 59), '07:00', '19:00'), true);
  assert.equal(isNight(at(7), '07:00', '19:00'), false);
  // A night that starts after midnight.
  assert.equal(isNight(at(1), '09:00', '00:30'), true);
  assert.equal(isNight(at(23), '09:00', '00:30'), false);
  assert.equal(isNight(at(5), '07:00', '07:00'), false);
});

test('the schedule picks the day or night paper', () => {
  const p = { ...DEFAULTS, schedule: true, dayPaper: 'linen', nightPaper: 'kraft' };
  assert.equal(currentPaper(p, at(10)), 'linen');
  assert.equal(currentPaper(p, at(22)), 'kraft');
  assert.equal(currentPaper({ ...p, schedule: false, paper: 'felt' }, at(22)), 'felt');
  assert.equal(currentPaper({ ...p, schedule: false, paper: 'gone' }), 'matte');
});

test('strength is remembered per paper and per appearance', () => {
  const p = { ...DEFAULTS, intensity: { 'linen:dark': 0.3 } };
  assert.equal(intensityOf(p, 'linen', true), 0.3);
  assert.equal(intensityOf(p, 'linen', false), DEFAULT_INTENSITY);
});

test('app rules: everywhere except, or only in', () => {
  const except = { ...DEFAULTS, apps: ['photoshop'] };
  assert.equal(showFor(except, 'photoshop'), false);
  assert.equal(showFor(except, 'notes'), true);
  assert.equal(showFor(except, null), true);
  const only = { ...except, appMode: 'only' };
  assert.equal(showFor(only, 'photoshop'), true);
  assert.equal(showFor(only, 'notes'), false);
});

test('next paper cycles through favourites', () => {
  const p = { ...DEFAULTS, favorites: ['a', 'b', 'c'], paper: 'c' };
  assert.equal(nextPaper(p), 'a');
  assert.equal(nextPaper({ ...p, paper: 'x' }), 'a');
  assert.equal(nextPaper({ ...p, favorites: [], paper: 'matte' }), 'newsprint');
});

test('lamp geometry: spots, height and following the mouse', () => {
  const low = lampGeometry('top-left', 1000, 500, 0);
  const high = lampGeometry('top-left', 1000, 500, 1);
  assert.ok(high.radius > low.radius);
  assert.ok(low.x < 200 && low.y < 0);
  const m = lampGeometry('mouse', 1000, 500, 0.5, { x: 300, y: 200 });
  assert.equal(Math.round(m.x), 300);
  assert.equal(Math.round(m.y), 200);
  assert.deepEqual(lampGeometry('nowhere', 100, 100), lampGeometry('top-left', 100, 100));
});

test('lamp colours get warmer at lower temperatures', () => {
  const [r1, , b1] = kelvin(1800);
  const [r2, , b2] = kelvin(5600);
  assert.equal(r1, 255);
  assert.ok(b1 < b2);
  assert.ok(r2 >= 240);
});
