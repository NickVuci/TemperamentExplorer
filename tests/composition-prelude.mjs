import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {
  parseProject,
  writePrelude,
  createHistory
} from '../src/composition/composition-project.mjs';
import {compileFiguration} from '../src/composition/composition-figuration.mjs';
import {compositionBoard} from '../src/composition/composition-board.mjs';
import {coordinateCents} from '../src/core/pitch.mjs';
import {
  PRELUDE_PLANS,
  PRELUDE_FIGURES,
  composePrelude,
  figureSequence,
  normalizePreludeOptions,
  preludeMaterial,
  preludeSections,
  preludeTiming,
  writtenPreludeOptions
} from '../src/composition/composition-prelude.mjs';

const dir = new URL('../examples/compositions/', import.meta.url);
const open = name => parseProject(readFileSync(new URL(name, dir), 'utf8'));
const cellsOf = p => compositionBoard(p).board?.keys ?? [];
const meantone = open('02-lantern-waltz-meantone-bosanquet.composition.json'),
  cells = cellsOf(meantone),
  key = m => m.join(',');

// The figure of BWV 846: five voices rise, then the upper three sound again.
assert.deepEqual(figureSequence('rise', 5, 8), [0, 1, 2, 3, 4, 2, 3, 4]);
assert.deepEqual(figureSequence('wave', 4, 8), [0, 1, 2, 3, 2, 1, 0, 1]);
assert.deepEqual(figureSequence('rock', 4, 6), [0, 3, 1, 3, 2, 3]);
assert.deepEqual(figureSequence('fall', 4, 4), [0, 3, 2, 1]);
assert.deepEqual(figureSequence('weave', 4, 4), [0, 3, 1, 2]);
for (const f of PRELUDE_FIGURES)
  for (const voices of [3, 4, 5])
    for (const steps of [2, 3, 6, 8, 12, 16]) {
      const s = figureSequence(f.id, voices, steps);
      assert.equal(s.length, steps);
      assert.equal(s[0], 0, 'every figure starts on the bass');
      assert.ok(s.every(v => Number.isInteger(v) && v >= 0 && v < voices));
    }

assert.deepEqual(preludeTiming({numerator: 4, denominator: 4}, normalizePreludeOptions({})), {
  harmony: 3840,
  stepTick: 240,
  cycle: 1920,
  steps: 8,
  repeats: 2
});
assert.equal(
  preludeTiming({numerator: 3, denominator: 4}, normalizePreludeOptions({division: 8})).steps,
  3
);
assert.equal(normalizePreludeOptions({plan: 'nonsense', voices: 99, home: 40}, 7).home, 6);
assert.equal(normalizePreludeOptions({voices: 99}).voices, 5);

// Meantone, seven-note major scale: the plan is C. P. E. Bach's — frame, bass octave, pedal, frame.
const made = composePrelude(meantone, {plan: 'octave', voices: 4}, {cells});
assert.equal(made.plan.home, 0);
assert.equal(made.plan.directional, 4, 'the leading harmony stands a fifth above home');
assert.equal(made.plan.neighbour, 3);
assert.deepEqual(
  made.slots.map(s => s.fn),
  [
    ...Array(4).fill('frame'),
    ...Array(6).fill('motion'),
    'approach',
    'pedal',
    'pedal',
    'cadence',
    ...Array(4).fill('close')
  ]
);
assert.deepEqual(
  made.slots.filter(s => s.fn === 'motion').map(s => s.bass),
  [6, 5, 4, 3, 2, 1],
  'the bass falls by step through the scale'
);
assert.deepEqual(
  made.slots.slice(0, 4).map(s => [s.bass, s.chord.root]),
  [
    [0, 0],
    [0, 3],
    [0, 4],
    [0, 0]
  ],
  'the frame holds the home bass under its neighbour and leading harmonies'
);
// Rule of the octave: passing degrees carry first inversions, the fifth degree its own chord.
assert.deepEqual(
  made.slots.filter(s => s.fn === 'motion').map(s => s.chord.root),
  [4, 3, 4, 1, 0, 6]
);
const playable = new Set(cells.filter(c => c.enabled).map(c => key(c.coordinate ?? c.m)));
for (const [i, s] of made.slots.entries()) {
  assert.equal(s.tones.length, 4, `harmony ${i + 1} has four voices`);
  assert.ok(
    s.cents.every((c, v) => !v || c > s.cents[v - 1] + 1),
    `harmony ${i + 1}: voices do not cross`
  );
  assert.ok(
    s.tones.every(t => playable.has(key(t))),
    `harmony ${i + 1}: every tone has a key`
  );
  assert.equal(coordinateCents(meantone.context, s.tones[0]), s.cents[0]);
}
// Upper voices move by small steps: no voice leaps more than a fifth between harmonies.
for (let i = 1; i < made.slots.length; i++)
  for (let v = 1; v < 4; v++)
    assert.ok(
      Math.abs(made.slots[i].cents[v] - made.slots[i - 1].cents[v]) <= 720,
      `voice ${v} into harmony ${i + 1}`
    );
assert.deepEqual(
  composePrelude(meantone, {plan: 'octave', voices: 4}, {cells}),
  made,
  'deterministic'
);

// Writing: one undoable edit that fills the chord lane and attaches the figure.
const history = createHistory(meantone);
history.execute('Write prelude', p => writePrelude(p, made));
const written = history.project;
assert.equal(written.format, 'temperament-lab-composition-v2');
assert.equal(written.clips[0].events.length, 18);
assert.equal(written.figuration.attachments.length, 18);
assert.equal(written.figuration.soundHarmony, false);
assert.deepEqual(
  written.figuration.patterns.map(p => p.pattern.name),
  ['Rise and echo', 'Closing arpeggio']
);
assert.equal(written.clips[1].events.length, meantone.clips[1].events.length, 'melody is kept');
const compiled = compileFiguration(written);
assert.equal(compiled.errors.length, 0);
// Every figure note is one of its harmony's voices: the surface only spreads the structure in time.
for (const e of compiled.events) {
  const chord = written.clips[0].events.find(c => c.id === e.source.chordEventId);
  assert.ok(chord.tones.some(t => key(t.coordinate) === key(e.tones[0].coordinate)));
  assert.ok(e.startTick >= chord.startTick && e.startTick < chord.startTick + chord.durationTick);
}
// 3/4 in sixteenths, twice per bar: six attacks a cycle, twelve notes a bar; the close has four.
assert.equal(compiled.events.length, 17 * 12 + 4);
assert.deepEqual(writtenPreludeOptions(written), made.options);
assert.equal(writtenPreludeOptions(meantone), null);
assert.deepEqual(
  preludeSections(written).map(s => [s.group, s.count]),
  [
    ['frame', 4],
    ['motion', 6],
    ['pedal', 4],
    ['close', 4]
  ]
);
history.undo();
assert.equal(history.project, meantone);

// A developing figure changes with the form; the strict one only at the close.
const developing = composePrelude(meantone, {variety: 'developing'}, {cells});
assert.deepEqual(Object.keys(developing.patterns).sort(), [
  'answer',
  'cadence',
  'close',
  'main',
  'pedal'
]);
assert.equal(developing.harmonies.at(-1).pattern, 'close');
assert.equal(developing.harmonies.find(h => h.source.fn === 'pedal').pattern, 'pedal');

// Another chord on the same bass can be chosen for any harmony.
const swapped = composePrelude(meantone, {choices: {5: 1}}, {cells});
assert.notEqual(swapped.slots[5].chord.set, made.slots[5].chord.set);
assert.equal(swapped.slots[5].bass, made.slots[5].bass);
assert.equal(swapped.slots[5].choice, 1);

// Directory chords are used where the directory lists them, most concordant three-note chord first.
const home = d => meantone.context.scale.degrees[d].coordinate;
const up = (d, i) => {
  const m = home((d + i) % 7);
  return [m[0] + Math.floor((d + i) / 7), m[1]];
};
const material = preludeMaterial(meantone.context, {
  entriesFor: d =>
    d === 0
      ? [
          {
            rootPosition: true,
            root: home(0),
            chord: '8:10:15',
            coords: [up(0, 0), up(0, 2), up(0, 6)]
          },
          {
            rootPosition: true,
            root: home(0),
            chord: '4:5:6',
            coords: [up(0, 0), up(0, 2), up(0, 4)]
          },
          {
            rootPosition: false,
            root: home(0),
            chord: '4:5:6',
            coords: [up(0, 2), up(0, 4), up(0, 7)]
          }
        ]
      : []
});
assert.equal(material.source, 'mixed');
assert.deepEqual(
  material.byRoot[0].map(c => c.label),
  ['4:5:6', '8:10:15']
);
assert.equal(material.byRoot[1][0].kind, 'stack');
assert.equal(preludeMaterial(meantone.context, {entriesFor: () => null}).pending, true);

// My chords: the chord lane keeps its harmonies and order and is voiced again.
const own = composePrelude(written, {plan: 'own', voices: 3}, {cells});
assert.equal(own.slots.length, 18);
assert.equal(own.plan.source, 'own');
assert.deepEqual(
  own.slots.map(s => s.bass),
  made.slots.map(s => s.bass)
);
assert.ok(own.slots.every(s => s.tones.length === 3));
assert.throws(
  () =>
    composePrelude(
      {...meantone, clips: meantone.clips.map(c => ({...c, events: []}))},
      {plan: 'own'}
    ),
  /chord lane is empty/
);

// Every sample tuning, divided octaves included, takes every plan and voice count without errors.
for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const p = open(file);
  for (const plan of PRELUDE_PLANS.map(x => x.id))
    for (const voices of [3, 4])
      for (const figure of ['rise', 'weave']) {
        const c = composePrelude(
          p,
          {plan, voices, figure, variety: 'developing'},
          {cells: cellsOf(p)}
        );
        const w = writePrelude(p, c);
        assert.equal(compileFiguration(w).errors.length, 0, `${file} ${plan} ${voices}`);
        assert.equal(c.slots.at(-1).bass, plan === 'own' ? c.slots.at(-1).bass : 0);
        const board = new Set(
          cellsOf(p)
            .filter(k => k.enabled)
            .map(k => key(k.coordinate ?? k.m))
        );
        assert.ok(
          c.slots.every(s => s.tones.every(t => board.has(key(t)))),
          `${file} ${plan}: keys`
        );
      }
}
// Without a saved layout the voices take octave copies around the tonic.
const bare = composePrelude({...meantone, layout: null}, {plan: 'frame'}, {cells: []});
assert.equal(bare.slots.length, 7);
console.log('composition-prelude: ok');
