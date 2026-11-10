import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureContext} from '../src/composition/composition-context.mjs';
import {
  createProject,
  makeEvent,
  addEvent,
  applyFiguration,
  serializeProject,
  parseProject
} from '../src/composition/composition-project.mjs';
import {
  generateTexturePattern,
  playableChordTones,
  patternNotes,
  patternFromNotes,
  compileFiguration,
  validatePattern,
  figurationPresetSnapshot
} from '../src/composition/composition-figuration.mjs';
import {compositionBoard} from '../src/composition/composition-board.mjs';
import {buildCueTimeline} from '../src/composition/composition-cues.mjs';

const demo = JSON.parse(
  readFileSync(new URL('./fixtures/composition/phase0-demo.json', import.meta.url))
);
const context = captureContext(demo.musicalContext.state, 220);
const chord = makeEvent({
  startTick: 0,
  durationTick: 3840,
  tones: [
    [0, 0],
    [-2, 4],
    [0, 1]
  ].map(coordinate => ({coordinate}))
});
// Literal octave copies, with disabled/command extremes and an equal-sounding non-octave coordinate.
const allowed = [];
for (let octave = -2; octave <= 2; octave++)
  allowed.push([octave, 0], [octave - 2, 4], [octave, 1]);
const cells = [
  ...allowed.map(coordinate => ({coordinate})),
  {coordinate: [-3, 0], enabled: false},
  {coordinate: [3, 1], command: true},
  {coordinate: [-18, 31]}
];
const candidates = playableChordTones(context, chord, cells);
assert.equal(candidates.length, 15);
assert.deepEqual(
  candidates.map(c => c.coordinate),
  allowed,
  'only exact mapped-octave copies count, ordered by pitch'
);
const options = {
  context,
  chord,
  cells,
  name: 'Full-range texture',
  lengthTick: 3840,
  boundaries: Array.from({length: 17}, (_, i) => i * 240),
  seed: 234
};
const pattern = generateTexturePattern(options);
assert.equal(pattern.version, 2);
assert.deepEqual(pattern, generateTexturePattern(options), 'seeded counterpoint is reproducible');
assert.notDeepEqual(pattern.events, generateTexturePattern({...options, seed: 235}).events);
assert.deepEqual(
  [0, 1, 2].map(v => pattern.events.filter(e => e.voice === v).length),
  [4, 8, 16]
);
const notes = patternNotes(context, chord, pattern, 'preview', {cells});
const bass = notes.filter(e => e.source.voice === 0),
  upper = notes.filter(e => e.source.voice > 0);
assert.deepEqual(
  bass.map(e => [e.startTick, e.durationTick, e.velocity, e.tones[0].coordinate]),
  [
    [0, 960, 106, [-2, 0]],
    [960, 960, 106, [-2, 0]],
    [1920, 960, 106, [-2, 0]],
    [2880, 960, 106, [-2, 0]]
  ]
);
assert.ok(upper.every(e => e.velocity < bass[0].velocity && e.durationTick < 960));
assert.ok(notes.every(e => allowed.some(m => m.join() === e.tones[0].coordinate.join())));
assert.ok(
  notes.some(e => e.tones[0].coordinate.join() === '2,1'),
  'treble reaches the highest playable chord tone'
);
assert.equal(
  new Set(notes.filter(e => e.startTick === 0).map(e => e.tones[0].coordinate.join())).size,
  3,
  'distinct simultaneous voices'
);
const recovered = patternFromNotes(context, chord, {...pattern, events: notes}, {cells});
const {seed, ...withoutSeed} = pattern;
assert.equal(seed, options.seed);
assert.deepEqual(recovered, withoutSeed);
assert.deepEqual(
  figurationPresetSnapshot(pattern.name, pattern),
  pattern,
  'library snapshots retain adaptive register positions and voice identity'
);

// The written bass is preserved through inversion, but moved to its lowest playable copy.
const inversion = {
  ...chord,
  tones: [
    {toneId: 'a', coordinate: [-2, 4]},
    {toneId: 'b', coordinate: [0, 1]},
    {toneId: 'c', coordinate: [1, 0]}
  ]
};
const inverted = patternNotes(context, inversion, pattern, 'inverted', {cells});
assert.deepEqual(inverted.find(e => e.source.voice === 0).tones[0].coordinate, [-4, 4]);
assert.ok(inverted.every(e => allowed.some(m => m.join() === e.tones[0].coordinate.join())));

const thin = generateTexturePattern({...options, rests: 1});
assert.equal(thin.events.length, 4, 'rest control never removes the prominent bass foundation');
assert.ok(thin.events.every(e => e.voice === 0));
for (const parts of [1, 2, 3, 4]) {
  const generated = generateTexturePattern({...options, parts, contour: 'alternating'});
  assert.equal(new Set(generated.events.map(e => e.voice)).size, parts);
  assert.ok(
    patternNotes(context, chord, generated, 'voices', {cells}).every(e =>
      allowed.some(m => m.join() === e.tones[0].coordinate.join())
    )
  );
}
const manual = generateTexturePattern({...options, range: 'manual', lowOctave: 0, highOctave: 0});
assert.equal(manual.version, 1);
assert.ok(
  manual.events.every(e => e.tones.every(t => t.position === undefined && t.octaves === 0))
);
assert.throws(() => generateTexturePattern({...options, cells: []}), /no playable chord tones/);
assert.throws(() => generateTexturePattern({...options, rests: NaN}), /rest probability/);
assert.throws(
  () =>
    validatePattern({
      ...pattern,
      events: [{...pattern.events[0], tones: [{rank: 1, octaves: 0, position: 1.1}]}]
    }),
  /register position/
);
assert.throws(() => validatePattern({...pattern, version: 1}), /register position/);

// A real saved board fits each harmony independently, without changing the random pattern.
let project = createProject({context, layout: demo.layout});
project = addEvent(project, project.clips[0].id, chord);
const next = makeEvent({
  startTick: 3840,
  durationTick: 3840,
  tones: [
    [0, 0],
    [1, -1],
    [-1, 3]
  ].map(coordinate => ({coordinate}))
});
project = addEvent(project, project.clips[0].id, next);
const boardCells = compositionBoard(project).board.keys;
const onBoard = generateTexturePattern({...options, cells: boardCells});
project = applyFiguration(
  project,
  onBoard,
  project.clips[0].events.map(e => ({
    chordClipId: project.clips[0].id,
    chordEventId: e.id,
    trackId: project.tracks[1].id
  }))
);
assert.deepEqual(compileFiguration(project).errors, []);
assert.ok(
  buildCueTimeline(project)
    .filter(c => c.trackKind === 'melody')
    .every(c => c.cells.length > 0),
  'every generated note remains playable after applying to a different harmony'
);
assert.deepEqual(parseProject(serializeProject(project)), project);
assert.deepEqual(
  compileFiguration(parseProject(serializeProject(project))).events,
  compileFiguration(project).events
);
assert.deepEqual(
  project.figuration.patterns[0].pattern,
  onBoard,
  'fitting never rerolls or rewrites the portable pattern'
);

const divided = {
  ...context,
  rows: [
    [3, 4, 7],
    [0, 1, 0]
  ]
};
const one = {...chord, tones: [{toneId: 'one', coordinate: [0, 0]}]};
assert.deepEqual(
  playableChordTones(divided, one, [
    {coordinate: [0, 0]},
    {coordinate: [1, 0]},
    {coordinate: [3, 0]}
  ]).map(c => c.coordinate),
  [
    [0, 0],
    [3, 0]
  ],
  'a divided period is not substituted for an octave'
);
const noOctave = {...context, basis: [3, 5, 7]};
assert.deepEqual(
  playableChordTones(noOctave, one, [{coordinate: [0, 0]}, {coordinate: [1, 0]}]).map(
    c => c.coordinate
  ),
  [[0, 0]],
  'non-octave overlays retain exact written pitches'
);
console.log(
  'figuration-texture: full playable range, bass prominence, independent voices, adaptive harmonies and exact register policy passed'
);
