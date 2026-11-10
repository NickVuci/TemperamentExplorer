import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureContext} from '../src/composition/composition-context.mjs';
import {
  createProject,
  makeEvent,
  addEvent,
  applyFiguration,
  updateEvent,
  duplicateEvent,
  removeEvent,
  removeFiguration,
  setSoundHarmony,
  serializeProject,
  parseProject,
  createHistory,
  editMelodyEvents,
  validateProject
} from '../src/composition/composition-project.mjs';
import {
  orderedChord,
  referenceFor,
  patternFromNotes,
  patternNotes,
  generatePattern,
  compileFiguration,
  validatePattern,
  octaveVector
} from '../src/composition/composition-figuration.mjs';
import {expandProject, createPlan} from '../src/composition/composition-transport.mjs';
import {buildCueTimeline, toPracticeTargets} from '../src/composition/composition-cues.mjs';
import {buildChart} from '../src/composition/composition-game.mjs';
import {createPresetStore, PRESET_BACKUP_FORMAT} from '../src/presets/preset-store.mjs';

const fixtures = JSON.parse(
  readFileSync(new URL('./fixtures/composition/phase0-corpus.json', import.meta.url))
).fixtures;
const ctx = captureContext(fixtures[0].state, 220);
const voices = [
  [0, 0],
  [-2, 4],
  [0, 1]
];
const chord = coordinates =>
  makeEvent({
    startTick: 0,
    durationTick: 1000,
    tones: coordinates.map(coordinate => ({coordinate}))
  });
const source = chord([voices[2], voices[0], voices[1], voices[0]]);
assert.deepEqual(orderedChord(ctx, source), voices, 'sounding order, exact duplicate collapsed');
assert.deepEqual(referenceFor(ctx, source, [-1, 4]), {rank: 2, octaves: 1});
assert.throws(() => referenceFor(ctx, source, [0, 2]), /not a chord tone/);
const pattern = {
  version: 1,
  name: '1–3–2',
  lengthTick: 600,
  events: [
    {id: 'a', startTick: 0, durationTick: 300, velocity: 80, tones: [{rank: 1, octaves: 0}]},
    {
      id: 'b',
      startTick: 200,
      durationTick: 200,
      velocity: 90,
      tones: [
        {rank: 3, octaves: 0},
        {rank: 1, octaves: -1}
      ]
    },
    {id: 'c', startTick: 400, durationTick: 100, velocity: 100, tones: [{rank: 2, octaves: 1}]}
  ]
};
const pitches = patternNotes(ctx, source, pattern).map(e => e.tones.map(t => t.coordinate));
assert.deepEqual(pitches, [
  [[0, 0]],
  [
    [0, 1],
    [-1, 0]
  ],
  [[-1, 4]]
]);
assert.deepEqual(
  patternFromNotes(ctx, source, {...pattern, events: patternNotes(ctx, source, pattern)}),
  pattern
);
assert.throws(
  () => validatePattern({...pattern, events: [{...pattern.events[0], startTick: 599}]}),
  /outside/
);
assert.throws(
  () =>
    validatePattern({...pattern, events: [{...pattern.events[0], tones: [{rank: 0, octaves: 0}]}]}),
  /reference/
);

// Independent literal mapping expectations: octave is three periods in the divided case.
const divided = captureContext(fixtures.find(f => f.id.startsWith('divided-octave')).state, 220);
assert.deepEqual(octaveVector(divided), [3, 0]);
assert.deepEqual(
  patternNotes(divided, chord([[0, 0]]), {
    version: 1,
    name: 'up',
    lengthTick: 1,
    events: [
      {id: 'up', startTick: 0, durationTick: 1, velocity: 90, tones: [{rank: 1, octaves: 1}]}
    ]
  })[0].tones[0].coordinate,
  [3, 0]
);
assert.throws(() => referenceFor(divided, chord([[0, 0]]), [1, 0]), /not a chord tone/);
const diagonal = {
  ...ctx,
  basis: [3, 2, 5],
  rows: [
    [1, 1, 0],
    [0, 1, 4]
  ]
};
assert.deepEqual(octaveVector(diagonal), [1, 1]);
assert.deepEqual(
  patternNotes(diagonal, chord([[0, 0]]), {
    version: 1,
    name: 'Diagonal octave',
    lengthTick: 1,
    events: [
      {id: 'x', startTick: 0, durationTick: 1, velocity: 90, tones: [{rank: 1, octaves: -1}]}
    ]
  })[0].tones[0].coordinate,
  [-1, -1],
  'mapped octave can move both axes'
);
assert.throws(
  () => validatePattern({...pattern, events: [{...pattern.events[0], id: 'x'.repeat(129)}]}),
  /IDs/
);
const tritave = captureContext(fixtures.find(f => f.id.startsWith('tritave')).state, 220);
assert.equal(octaveVector(tritave), null);
assert.throws(() => patternNotes(tritave, source, pattern), /no octave equivalence/);
assert.deepEqual(
  patternNotes(tritave, chord([[0, 0]]), {
    version: 1,
    name: 'plain',
    lengthTick: 1,
    events: [{id: 'x', startTick: 0, durationTick: 1, velocity: 90, tones: [{rank: 1, octaves: 0}]}]
  })[0].tones[0].coordinate,
  [0, 0]
);

let p = createProject({context: ctx}),
  cc = p.clips[0].id,
  mt = p.tracks[1].id;
p = addEvent(p, cc, source);
p = applyFiguration(p, pattern, [{chordClipId: cc, chordEventId: source.id, trackId: mt}]);
const compiled = compileFiguration(p);
assert.equal(p.format, 'temperament-lab-composition-v2');
assert.equal(p.clips[1].events.length, 0, 'generated notes are not source melody');
assert.deepEqual(
  compiled.events.map(e => [e.startTick, e.durationTick]),
  [
    [0, 300],
    [200, 200],
    [400, 100],
    [600, 300],
    [800, 200]
  ]
);
assert.equal(compiled.errors.length, 0);
assert.deepEqual(
  expandProject(p).map(e => e.eventId),
  compiled.events.map(e => e.id),
  'template chords are silent by default'
);
assert.equal(expandProject(setSoundHarmony(p, true)).length, compiled.events.length + 1);
const cues = buildCueTimeline(p).filter(e => e.trackKind === 'melody');
assert.deepEqual(
  cues.map(c => [c.onsetTick, c.releaseTick, c.coordinate]),
  compiled.events.flatMap(e =>
    e.tones.map(t => [e.startTick, e.startTick + e.durationTick, t.coordinate])
  )
);
assert.deepEqual(
  buildChart(p).targets.map(t => t.coordinate),
  cues.map(c => c.coordinate)
);
assert.deepEqual(
  toPracticeTargets(p, undefined, {trackKinds: ['melody']}).targets.map(t => t.coordinate),
  cues.map(c => c.coordinate)
);
assert.deepEqual(parseProject(serializeProject(p)), p);
assert.deepEqual(
  compileFiguration(parseProject(serializeProject(p))).events,
  compiled.events,
  'stable generated identities survive reopening'
);
const attachment = p.figuration.attachments[0].id;
const moved = updateEvent(p, cc, source.id, {
  startTick: 1200,
  durationTick: 450,
  tones: [
    {toneId: 'iv-1', coordinate: [-2, 4]},
    {toneId: 'iv-2', coordinate: [0, 1]},
    {toneId: 'iv-3', coordinate: [1, 0]}
  ]
});
assert.deepEqual(
  compileFiguration(moved).events.map(e => [e.startTick, e.durationTick]),
  [
    [1200, 300],
    [1400, 200],
    [1600, 50]
  ]
);
assert.deepEqual(
  compileFiguration(moved).events[0].tones[0].coordinate,
  [-2, 4],
  'inversion follows bass order'
);
assert.deepEqual(compileFiguration(moved).events[1].tones[0].coordinate, [1, 0]);
const duplicate = duplicateEvent(p, cc, source.id, 1500);
assert.equal(duplicate.figuration.attachments.length, 2);
assert.equal(compileFiguration(duplicate).events.length, compiled.events.length * 2);
assert.equal(removeEvent(duplicate, cc, source.id).figuration.attachments.length, 1);
const invalid = updateEvent(p, cc, source.id, {tones: source.tones.slice(0, 2)});
assert.match(compileFiguration(invalid).errors[0].message, /needs tone 3/);
assert.throws(() => createPlan(invalid), /needs tone 3/);
const overlap = addEvent(p, cc, {...chord(voices), startTick: 500});
assert.match(compileFiguration(overlap).errors[0].message, /overlapping/);
assert.throws(
  () =>
    applyFiguration(overlap, pattern, [{chordClipId: cc, chordEventId: source.id, trackId: mt}]),
  /overlapping/
);
const manual = addEvent(
  p,
  p.clips[1].id,
  makeEvent({startTick: 100, durationTick: 500, tones: [{coordinate: [0, 0]}]})
);
assert.equal(compileFiguration(manual).warnings.length, 1);
assert.equal(manual.clips[1].events.length, 1);
const history = createHistory(p);
history.execute('detach', pr => removeFiguration(pr, attachment, {detach: true}));
const detached = history.project.clips.flatMap(c => c.events).filter(e => e.id !== source.id);
assert.equal(detached.length, compiled.events.length);
assert.ok(detached.every(e => !e.source));
assert.equal(compileFiguration(history.project).events.length, 0);
const edited = editMelodyEvents(history.project, {put: [{...detached[0], velocity: 66}]});
assert.equal(edited.clips.flatMap(c => c.events).find(e => e.id === detached[0].id).velocity, 66);
history.undo();
assert.deepEqual(history.project, p);
history.redo();
assert.equal(history.project.figuration.attachments.length, 0);

const repeated = structuredClone(p);
repeated.clips[0].startTick = 250;
repeated.clips[0].lengthTick = 1200;
repeated.clips[0].repeat = 2;
validateProject(repeated);
assert.deepEqual(
  compileFiguration(repeated).events.map(e => e.startTick),
  [250, 450, 650, 850, 1050, 1450, 1650, 1850, 2050, 2250]
);
assert.equal(new Set(compileFiguration(repeated).events.map(e => e.id)).size, 10);
const nextChord = addEvent(p, cc, {...chord(voices.map(m => [m[0] + 1, m[1]])), startTick: 1200});
const all = applyFiguration(
  nextChord,
  pattern,
  nextChord.clips[0].events.map(e => ({chordClipId: cc, chordEventId: e.id, trackId: mt}))
);
assert.equal(
  compileFiguration(all).events.filter(e => e.startTick >= 1000 && e.startTick < 1200).length,
  0,
  'harmony gaps are silent'
);
assert.deepEqual(compileFiguration(all).events[5].tones[0].coordinate, [1, 0]);

const options = {
  lengthTick: 960,
  boundaries: [0, 160, 320, 480, 640, 800, 960],
  voiceCount: 3,
  seed: 991,
  lowOctave: -1,
  highOctave: 1,
  rests: 0.2
};
assert.deepEqual(generatePattern(options), generatePattern(options));
assert.notDeepEqual(
  generatePattern(options).events,
  generatePattern({...options, seed: 992}).events
);
assert.deepEqual(
  generatePattern({
    ...options,
    lowOctave: 0,
    highOctave: 0,
    rests: 0,
    contour: 'rising'
  }).events.map(e => e.tones[0].rank),
  [1, 2, 3, 1, 2, 3]
);
assert.ok(
  generatePattern(options).events.every(
    e => e.durationTick === 160 && e.tones[0].octaves >= -1 && e.tones[0].octaves <= 1
  )
);
assert.equal(generatePattern({...options, rests: 1}).events.length, 0);

const data = new Map(),
  storage = {getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v)};
const store = createPresetStore({storage});
const id = '0a000000-0000-4000-8000-000000000001';
let saved = await store.save('figuration', id, {name: pattern.name, state: pattern, revision: 0});
assert.equal((await store.list('figuration')).length, 1);
await assert.rejects(
  store.save('figuration', id, {name: 'stale', state: pattern, revision: 0}),
  /another session/
);
saved = await store.save('figuration', id, {
  name: 'Changed library',
  state: {...pattern, events: []},
  revision: saved.revision
});
assert.equal(
  p.figuration.patterns[0].pattern.events.length,
  3,
  'library changes do not alter embedded patterns'
);
const backup = await store.exportBackup();
assert.equal(backup.figuration, undefined);
assert.equal(backup.figurations.length, 1);
assert.equal(backup.format, PRESET_BACKUP_FORMAT);
const memory = new Map(),
  other = createPresetStore({
    storage: {getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v)}
  });
assert.equal((await other.importBackup(backup)).figurations, 1);
assert.deepEqual((await other.list('figuration'))[0].state, saved.state);
await store.remove('figuration', id, saved.revision);
assert.deepEqual(await store.list('figuration'), []);
assert.throws(
  () =>
    parseProject({
      ...p,
      figuration: {
        ...p.figuration,
        attachments: [{...p.figuration.attachments[0], chordEventId: 'missing'}]
      }
    }),
  /attachment/
);
console.log(
  'composition-figuration: exact pitches, registers, compilation, harmony edits, practice, persistence and generation passed'
);
