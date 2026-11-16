import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {
  parseProject,
  writePrelude,
  createHistory
} from '../src/composition/composition-project.mjs';
import {compileFiguration} from '../src/composition/composition-figuration.mjs';
import {compositionBoard} from '../src/composition/composition-board.mjs';
import {coordinateCents, octavePeriods} from '../src/core/pitch.mjs';
import {mapMonzo, ratioMonzo} from '../src/core/ji-monzo.mjs';
import {degreeOf} from '../src/composition/composition-context.mjs';
import {buildChart} from '../src/composition/composition-game.mjs';
import {createHandRater, handModelDefaults} from '../src/shapes/hand-model.mjs';
import {
  PRELUDE_PLANS,
  PRELUDE_FIGURES,
  composePrelude,
  figureSequence,
  normalizePreludeOptions,
  preludeMaterial,
  preludePumps,
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

// --- Comma pumps: closed walks of the root by just intervals whose just sum is a tempered comma.
const near = (a, b) => Math.abs(a - b) < 0.0001;
const syntonic = preludePumps(meantone.context, 0, 4)[0];
assert.equal(syntonic.ratio, '81/80');
assert.ok(near(syntonic.cents, 21.5063));
// The syntonic comma pump in its classic order: I, vi, ii, V, I.
assert.deepEqual(syntonic.moves, ['5/3', '4/3', '4/3', '4/3']);
assert.deepEqual(
  syntonic.roots.map(r => r.degree),
  [5, 1, 4, 0]
);
const expectedPumps = {
  '04-seven-quills-porcupine.composition.json': ['250/243', 49.1661],
  '05-glass-harbor-magic.composition.json': ['3125/3072', 29.6136],
  '06-half-octave-mirrors-pajara.composition.json': ['50/49', 34.9756]
};
for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const p = open(file),
    pumps = preludePumps(p.context, 0);
  assert.ok(pumps.length, `${file}: a pump inside the scale`);
  if (expectedPumps[file]) {
    assert.equal(pumps[0].ratio, expectedPumps[file][0], file);
    assert.ok(near(pumps[0].cents, expectedPumps[file][1]), file);
  }
  for (const pump of pumps) {
    // The moves sum to the comma: not a unison in just intonation, a whole number of octaves here.
    const monzos = pump.moves.map(r => ratioMonzo(r.split('/').map(Number), p.context.basis)),
      sum = p.context.basis.map((_, i) => monzos.reduce((t, m) => t + m.basisMonzo[i], 0)),
      image = mapMonzo(p.context.rows, sum);
    assert.ok(
      sum.some((e, i) => p.context.basis[i] !== 2 && e !== 0),
      `${file} ${pump.ratio}: just sum is not a unison`
    );
    assert.equal(image[1], 0, `${file} ${pump.ratio}: tempered sum has no generator part`);
    assert.equal(image[0] % octavePeriods(p.context), 0, `${file} ${pump.ratio}: whole octaves`);
    assert.deepEqual(pump.roots.at(-1), {degree: 0, shift: 0});
    assert.equal(pump.roots.length, pump.moves.length);
  }
}
// Pajara's 64/63 is there too, and its shortest pump moves the root by the half octave.
const pajara = open('06-half-octave-mirrors-pajara.composition.json'),
  pajaraPumps = preludePumps(pajara.context, 0);
assert.ok(near(pajaraPumps.find(x => x.ratio === '64/63').cents, 27.2641));
assert.deepEqual(pajaraPumps[0].roots, [
  {degree: 0, shift: 1},
  {degree: 0, shift: 0}
]);
const pumped = composePrelude(meantone, {plan: 'pump'}, {cells});
assert.equal(pumped.plan.pump.ratio, '81/80');
assert.deepEqual(
  pumped.slots.map(s => s.chord.root),
  [0, 5, 1, 4, 0, 5, 1, 4, 0],
  'a short pump is walked twice'
);
assert.deepEqual(
  pumped.slots.map(s => s.fn),
  ['frame', 'motion', 'motion', 'cadence', 'frame', 'motion', 'motion', 'cadence', 'close']
);
assert.deepEqual(
  pumped.slots.slice(1, 5).map(s => s.move),
  ['5/3', '4/3', '4/3', '4/3']
);
assert.ok(pumped.slots.every(s => s.bass === s.chord.root));
assert.equal(
  compileFiguration(writePrelude(pajara, composePrelude(pajara, {plan: 'pump'}))).errors.length,
  0
);

// --- Non-chord tones: one voice of one harmony, held over or passing by step, never crossing.
const position = (p, m) => {
  const d = degreeOf(p.context, m);
  return d.degree + p.context.scale.n * d.register;
};
assert.ok(composePrelude(meantone, {}, {cells}).slots.every(s => !s.decoration));
const decorated = composePrelude(meantone, {dissonance: 'all'}, {cells}),
  suspended = decorated.slots.filter(s => s.decoration?.kind === 'suspension'),
  passing = decorated.slots.filter(s => s.decoration?.kind === 'passing');
assert.ok(suspended.length > 0 && passing.length > 0);
assert.deepEqual(
  decorated.slots.map(s => s.tones),
  made.slots.map(s => s.tones),
  'decoration leaves the harmonies as they were'
);
decorated.slots.forEach((slot, i) => {
  const d = slot.decoration;
  if (!d) return;
  assert.notEqual(slot.fn, 'frame', 'the opening frame stays plain');
  assert.ok(d.voice >= 1, 'the bass is never decorated');
  const cents = coordinateCents(meantone.context, d.tone);
  assert.ok(cents > slot.cents[d.voice - 1] && cents < (slot.cents[d.voice + 1] ?? Infinity));
  assert.ok(playable.has(key(d.tone)));
  if (d.kind === 'suspension') {
    assert.deepEqual(d.tone, decorated.slots[i - 1].tones[d.voice], 'prepared in the same voice');
    assert.equal(position(meantone, d.tone) - position(meantone, slot.tones[d.voice]), 1);
  } else {
    const from = position(meantone, slot.tones[d.voice]),
      to = position(meantone, decorated.slots[i + 1].tones[d.voice]);
    assert.equal(Math.abs(to - from), 2);
    assert.equal(position(meantone, d.tone), (from + to) / 2);
  }
});
assert.ok(
  composePrelude(meantone, {dissonance: 'suspensions'}, {cells}).slots.every(
    s => s.decoration?.kind !== 'passing'
  )
);
// A decorated harmony is two chord events: the decoration takes one sounding of the figure.
const decoratedWritten = writePrelude(meantone, decorated),
  decoratedEvents = decoratedWritten.clips[0].events;
assert.equal(compileFiguration(decoratedWritten).errors.length, 0);
const lastSuspended = decorated.slots.at(-1).decoration ? 1 : 0;
assert.equal(decoratedEvents.length, 18 + suspended.length + passing.length);
assert.equal(
  decorated.lengthTick,
  made.lengthTick + lastSuspended * decorated.timing.harmony,
  'only a delayed close lengthens the piece'
);
for (const e of decoratedEvents) {
  const slot = decorated.slots[e.source.slot],
    d = e.source.decoration ? slot.decoration : null;
  assert.deepEqual(
    e.tones.map(t => t.coordinate),
    slot.tones.map((t, v) => (d && v === d.voice ? d.tone : t))
  );
  if (d) assert.equal(e.source.decoration, d.kind);
}
for (const slot of suspended.filter(s => s !== decorated.slots.at(-1))) {
  const [first, second] = decoratedEvents.filter(
    e => e.source.slot === decorated.slots.indexOf(slot)
  );
  assert.equal(first.source.decoration, 'suspension', 'the suspension sounds first');
  assert.equal(second.source.decoration, undefined);
  assert.equal(first.durationTick, decorated.timing.cycle);
  assert.equal(second.startTick, first.startTick + first.durationTick);
}
for (const slot of passing) {
  const parts = decoratedEvents.filter(e => e.source.slot === decorated.slots.indexOf(slot));
  assert.deepEqual(
    parts.map(e => e.source.decoration),
    [undefined, 'passing'],
    'the passing tone comes last'
  );
}
assert.deepEqual(writtenPreludeOptions(decoratedWritten), decorated.options);
assert.deepEqual(
  preludeSections(decoratedWritten).map(s => s.group),
  ['frame', 'motion', 'pedal', 'close']
);
// Read back as My chords, the decorations are not harmonies of their own.
assert.equal(composePrelude(decoratedWritten, {plan: 'own'}, {cells}).slots.length, 18);
// With the figure once per harmony only a delayed close can sound.
assert.ok(
  composePrelude(meantone, {dissonance: 'all', repeats: 1}, {cells})
    .slots.slice(0, -1)
    .every(s => !s.decoration)
);

// --- Hand shapes: with the hand model, each harmony reports how the two hands take it.
const rotation = meantone.layout.deviceRotation ?? 0,
  hands = {
    left: createHandRater(handModelDefaults(), {hand: 'L', rotation}),
    right: createHandRater(handModelDefaults(), {hand: 'R', rotation})
  };
const comfortable = composePrelude(meantone, {hand: 'comfort'}, {cells, hands});
for (const slot of comfortable.slots) {
  assert.equal(slot.hand.left, 'A', 'the left hand has the bass alone');
  assert.ok(['A', 'B', 'C', 'D', null].includes(slot.hand.right));
  assert.ok(slot.tones.every(t => playable.has(key(t))));
  assert.ok(slot.cents.every((c, v) => !v || c > slot.cents[v - 1] + 1));
}
assert.deepEqual(composePrelude(meantone, {hand: 'comfort'}, {cells, hands}), comfortable);
// Without raters, or when the closest voice leading is asked for, the voicing is the plain one.
assert.deepEqual(
  composePrelude(meantone, {hand: 'any'}, {cells, hands}).slots.map(s => s.tones),
  made.slots.map(s => s.tones)
);
assert.ok(composePrelude(meantone, {hand: 'any'}, {cells, hands}).slots.every(s => !s.hand));
// The hands never make a harmony harder than the plain voicing's hardest.
const worst = list => Math.max(...list.map(s => 'ABCD'.indexOf(s.hand.right ?? 'D')));
const graded = handed =>
  handed.slots.map(s => ({
    hand: {right: hands.right.rate(shapeOf(s.tones.slice(-3)))?.grade ?? null}
  }));
function shapeOf(tones) {
  return tones.map(t => {
    const k = cells.find(c => c.enabled && !c.command && key(c.m) === key(t));
    return [(k.x - k.y) / 2, k.y];
  });
}
assert.ok(worst(comfortable.slots) <= worst(graded(made)));

// --- One voice alone: Play can chart the bass, the top voice or the inner voices of the figure.
const chart = voice => buildChart(written, {part: 'melody', voice}).targets,
  chordAt = tick =>
    written.clips[0].events.find(e => e.startTick <= tick && tick < e.startTick + e.durationTick);
const whole = chart('all'),
  bassLine = chart('bass'),
  topLine = chart('top'),
  inner = chart('inner');
// Every figure note belongs to one voice; the melody notes written by hand belong to none.
assert.equal(bassLine.length + topLine.length + inner.length, 17 * 12 + 4);
assert.ok(whole.length > 17 * 12 + 4);
// Two soundings of the figure in each of seventeen harmonies, and the closing arpeggio's first note.
assert.equal(bassLine.length, 17 * 2 + 1);
for (const t of bassLine) assert.deepEqual(t.coordinate, chordAt(t.tick).tones[0].coordinate);
for (const t of topLine) assert.deepEqual(t.coordinate, chordAt(t.tick).tones.at(-1).coordinate);
// The block harmonies can be taken one voice at a time as well.
assert.equal(buildChart(written, {part: 'chords', voice: 'bass'}).targets.length, 18);
assert.equal(buildChart(written, {part: 'chords'}).targets.length, 18 * 4);

console.log('composition-prelude: ok');
