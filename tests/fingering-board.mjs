import assert from 'node:assert/strict';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';
import {makeState} from '../src/core/catalog.mjs';
import {createFingeringGame} from '../src/composition/fingering-game.mjs';
import {ledFrame} from '../src/hexboard/hexboard-sync.mjs';
import {getHarmonicEntry} from './support/harmonic-catalogue.mjs';
import {harmonicSelection} from '../src/harmonic/harmonic-selection.mjs';

const TRIAD = [
  [0, 0],
  [-2, 4],
  [0, 1]
];

const state = makeState('meantone');
let refreshes = 0;
const refreshModes = new Set();
const ws = createHexboardWorkspace({
  getStates: () => [state],
  play: () => {},
  refresh: mode => {
    refreshes++;
    refreshModes.add(mode);
  },
  notify: m => {
    throw Error(m);
  },
  getHz: () => 220
});
const litKeys = () =>
  ws
    .deviceSnapshot()
    .keys.filter(k => k.lit)
    .map(k => k.index)
    .sort((a, b) => a - b);

// No chord yet.
assert.equal(ws.fingerings(), null);
assert.equal(ws.showFingering(0), false);

// A chord on the board exposes its fingerings, nearest the tonic first.
ws.showChord(
  [
    [0, 0],
    [-2, 4],
    [0, 1]
  ],
  'major triad',
  {exact: true}
);
const f = ws.fingerings();
assert.equal(f.label, 'major triad');
assert.equal(f.source, 'finder');
assert.ok(f.placements.length > 20, `many fingerings (${f.placements.length})`);
assert.equal(f.index, 0);
assert.ok(f.placements.every(p => p.keys.length === 3 && new Set(p.keys).size === 3));
const board = ws.deviceSnapshot();
assert.ok(
  f.placements.every(p => p.keys.every(k => board.keys[k].enabled)),
  'every fingering uses enabled keys'
);
assert.deepEqual(
  litKeys(),
  [...f.placements[0].keys].sort((a, b) => a - b),
  'the current fingering is the one lit'
);
// The fingerings are genuinely different, and each one sounds the same chord pitches (root, third, fifth) by coordinate.
assert.ok(new Set(f.placements.map(p => p.keys.join(','))).size === f.placements.length);
for (const p of f.placements.slice(0, 10)) {
  const coords = p.keys.map(k => board.keys[k].m.join(','));
  assert.equal(new Set(coords).size, 3, 'three distinct pitches');
}

// Lighting any fingering moves the highlight and asks the app to redraw.
const before = refreshes;
for (const i of [3, 7, f.placements.length - 1, 0]) {
  assert.equal(ws.showFingering(i), true);
  assert.deepEqual(
    litKeys(),
    [...f.placements[i].keys].sort((a, b) => a - b),
    `fingering ${i} is lit`
  );
  assert.equal(ws.fingerings().index, i);
}
assert.equal(refreshes - before, 4, 'each change redraws the board once');
assert.deepEqual(
  [...refreshModes],
  ['highlight'],
  'a highlight-only redraw, so the keys being played keep sounding'
);
assert.equal(ws.showFingering(-1), false);
assert.equal(ws.showFingering(f.placements.length), false);
assert.equal(ws.showFingering(1.5), false);
assert.equal(ws.fingerings().index, 0, 'a refused index changes nothing');

// The physical board's picture follows: the lit fingering is brighter, the layout stays.
ws.showFingering(2);
const frame = ledFrame(ws.deviceSnapshot()),
  plain = (() => {
    ws.clearHighlight();
    return ledFrame(ws.deviceSnapshot());
  })();
assert.equal(ws.fingerings(), null, 'clearing the highlight removes the fingerings');
ws.showChord(
  [
    [0, 0],
    [-2, 4],
    [0, 1]
  ],
  'major triad',
  {exact: true}
);
ws.showFingering(2);
const again = ledFrame(ws.deviceSnapshot());
for (const k of f.placements[2].keys)
  assert.ok(again.get(k).v > plain.get(k).v, `key ${k} is brighter on the board`);
void frame;

// A whole game over the real board, driven only by which keys are held.
{
  ws.clearHighlight();
  ws.showChord(
    [
      [0, 0],
      [-2, 4],
      [0, 1]
    ],
    'major triad',
    {exact: true}
  );
  const game = createFingeringGame({
    getFingerings: () => ws.fingerings(),
    showFingering: i => ws.showFingering(i)
  });
  game.start({count: 5});
  const seen = [];
  for (let round = 0; round < 5; round++) {
    const lit = litKeys();
    seen.push(lit.join(','));
    assert.equal(game.state().position, round);
    assert.deepEqual(
      [...game.state().target].sort((a, b) => a - b),
      lit,
      'the game wants exactly the lit keys'
    );
    game.onHeld(new Set(lit));
    game.onHeld(new Set());
  }
  assert.equal(game.state().phase, 'done');
  assert.equal(game.state().played, 5);
  assert.equal(new Set(seen).size, 5, 'five different fingerings were lit');
  assert.deepEqual(
    litKeys(),
    [...f.placements[0].keys].sort((a, b) => a - b),
    'the original highlight is restored'
  );
  // All of them.
  game.start();
  assert.equal(game.state().total, f.placements.length);
  game.stop();
}

const fresh = () =>
  createHexboardWorkspace({
    getStates: () => [state],
    play: () => {},
    refresh: () => {},
    notify: m => {
      throw Error(m);
    },
    getHz: () => 220
  });
const keysOf = f => f.placements.map(p => p.keys.join(','));
const moveTonic = (w, value) => w.change({dataset: {hexField: 'center'}, value: String(value)});

// A layout change keeps the board's order: the rebuilt list matches placing the chord on that layout.
{
  const a = fresh(),
    b = fresh();
  a.showChord(TRIAD, 'major triad', {exact: true});
  moveTonic(a, 66);
  moveTonic(b, 66);
  b.showChord(TRIAD, 'major triad', {exact: true});
  assert.deepEqual(
    keysOf(a.fingerings()),
    keysOf(b.fingerings()),
    'same fingerings in the same order after a layout change'
  );
}

// A layout change during a game ends it rather than waiting for keys that are no longer lit.
{
  const w = fresh();
  w.showChord(TRIAD, 'major triad', {exact: true});
  const game = createFingeringGame({
    getFingerings: () => w.fingerings(),
    showFingering: i => w.showFingering(i)
  });
  game.start({count: 5});
  game.onHeld(new Set(game.state().target));
  game.onHeld(new Set());
  moveTonic(w, 66);
  game.check();
  assert.equal(game.state().phase, 'idle');
  assert.match(game.state().message, /layout changed/);
}

// Choosing another chord during a game keeps the place the player chose for it.
{
  const w = fresh();
  w.showChord(TRIAD, 'major triad', {exact: true});
  const game = createFingeringGame({
    getFingerings: () => w.fingerings(),
    showFingering: i => w.showFingering(i)
  });
  game.start({count: 5});
  w.showChord(
    [
      [0, 0],
      [2, -3],
      [0, 1]
    ],
    'minor triad',
    {exact: false}
  );
  w.showFingering(3);
  game.check();
  assert.equal(game.state().phase, 'idle');
  assert.equal(w.fingerings().label, 'minor triad');
  assert.equal(w.fingerings().index, 3);
}

// A chord sent from Discover: its fingerings come from the harmonic selection, start with none
// chosen, and a finished game clears the highlight again.
{
  const s19 = {...makeState('meantone'), n: 19, mode: 0};
  const w = createHexboardWorkspace({
    getStates: () => [s19],
    play: () => {},
    refresh: () => {},
    notify: m => {
      throw Error(m);
    },
    getHz: () => 220
  });
  w.acceptHarmonicSelection(harmonicSelection(s19, await getHarmonicEntry({state: s19}, '4:5:6')));
  const h = w.fingerings();
  assert.equal(h.source, 'harmonic');
  assert.equal(h.index, -1, 'no fingering is chosen silently');
  assert.ok(h.placements.length >= 3);
  const lit = () =>
    w
      .deviceSnapshot()
      .keys.filter(k => k.lit)
      .map(k => k.index)
      .sort((a, b) => a - b);
  const game = createFingeringGame({
    getFingerings: () => w.fingerings(),
    showFingering: i => w.showFingering(i)
  });
  game.start({count: 3});
  for (let round = 0; round < 3; round++) {
    assert.deepEqual(
      [...game.state().target].sort((a, b) => a - b),
      lit(),
      `Discover fingering ${round} is lit`
    );
    assert.equal(w.fingerings().index, round);
    game.onHeld(new Set(lit()));
    game.onHeld(new Set());
  }
  assert.equal(game.state().phase, 'done');
  assert.equal(w.fingerings().index, -1, 'the highlight goes back to none chosen');
  assert.deepEqual(lit(), []);
  // A placed chord does not take over while a Discover fingering is highlighted.
  w.showFingering(1);
  w.showChord(TRIAD, 'major triad', {exact: true});
  assert.equal(w.fingerings().source, 'finder', 'placing a chord replaces the Discover highlight');
}

console.log('fingering-board: ok');
