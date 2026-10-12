import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {scale} from '../src/core/engine.mjs';
import {coordinateCents, noteCoordinate} from '../src/core/pitch.mjs';
import {frequencyFor} from '../src/ui/audio.mjs';
import {buildBoard} from '../src/hexboard/hexboard.mjs';
import {analyzeChord} from '../src/chords/chord-analysis.mjs';
import {realizeChord, placeRealization} from '../src/chords/chord-realization.mjs';
import {
  createEditorBenchmark,
  createVoiceStressRecipe,
  EDITOR_BENCHMARK
} from './fixtures/composition/phase0-benchmark.mjs';

const corpus = JSON.parse(
  await readFile(new URL('./fixtures/composition/phase0-corpus.json', import.meta.url), 'utf8')
);
const demo = JSON.parse(
  await readFile(new URL('./fixtures/composition/phase0-demo.json', import.meta.url), 'utf8')
);
const centsTolerance = corpus.tolerances.cents,
  relativeHzTolerance = corpus.tolerances.relativeHz;
const close = (actual, expected, tolerance = centsTolerance) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} (±${tolerance})`);
const relClose = (actual, expected, tolerance = relativeHzTolerance) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)),
    `${actual} != ${expected} (relative ±${tolerance})`
  );
const canonicalCoord = coordinate =>
  coordinate.map(component => {
    assert.ok(Number.isInteger(component), 'coordinate components are integers');
    return component === 0 ? 0 : component;
  });
const eqCoord = (actual, expected) =>
  assert.deepEqual(
    canonicalCoord(actual),
    canonicalCoord(expected),
    'coordinates are exact integer identities (signed zero canonicalizes to zero)'
  );
const pitch = (m, s) => m[0] * s.p + m[1] * s.g;

const dot = (row, vector) => row.reduce((sum, value, index) => sum + value * vector[index], 0);

function monzoOf(ratio, basis) {
  const [numeratorText, denominatorText] = ratio.split('/');
  let numerator = BigInt(numeratorText),
    denominator = BigInt(denominatorText);
  const exponents = [];
  for (const prime of basis) {
    const p = BigInt(prime);
    let exponent = 0;
    while (numerator % p === 0n) {
      numerator /= p;
      exponent++;
    }
    while (denominator % p === 0n) {
      denominator /= p;
      exponent--;
    }
    exponents.push(exponent);
  }
  assert.equal(numerator, 1n, `${ratio} numerator must factor through the frozen basis`);
  assert.equal(denominator, 1n, `${ratio} denominator must factor through the frozen basis`);
  return exponents;
}
function ratioCoordinate(ratio, state) {
  const exponents = monzoOf(ratio, state.basis);
  return state.rows.map(row => dot(row, exponents));
}
function assertProjectionOracle(analysis, fixture) {
  const expectedByRatio = new Map(
    fixture.v2.projectedMembers.map(member => [member.ratio, member.coordinate])
  );
  assert.deepEqual(
    analysis.identity.canonicalRatios.map(q => q.label),
    fixture.v2.canonicalRatios
  );
  assert.deepEqual(
    analysis.projection.notes.map(n => ({ratio: n.ratio, coordinate: n.coordinate})),
    fixture.v2.projectedMembers
  );
  for (const note of analysis.projection.notes) {
    eqCoord(note.coordinate, ratioCoordinate(note.ratio, fixture.state));
    eqCoord(note.coordinate, expectedByRatio.get(note.ratio));
  }
}

assert.equal(corpus.format, 'temperament-lab-composition-phase0-corpus-v1');
assert.equal(corpus.fixtures.length, 5);
assert.deepEqual(
  corpus.fixtures.map(f => f.id),
  [
    'meantone-7-mode4',
    'meantone-31edo',
    'tritave-245-243',
    'divided-octave-128-125',
    'optimized-meantone-we'
  ]
);
assert.equal(corpus.tonicHz, 220);

for (const fixture of corpus.fixtures) {
  const s = structuredClone(fixture.state),
    before = structuredClone(s),
    generated = scale(s);
  assert.equal(s.rows.length, 2);
  assert.equal(generated.collision, fixture.scale.collision);
  assert.equal(generated.notes.length, fixture.state.n);
  assert.equal(fixture.scale.coordinates.length, fixture.state.n);
  const storedCoordinates = fixture.scale.coordinates.map(note => note.coordinate);
  for (let degree = 0; degree < generated.notes.length; degree++) {
    const actual = generated.notes[degree],
      stored = fixture.scale.coordinates[degree];
    eqCoord(noteCoordinate(s, actual), stored.coordinate);
    assert.equal(actual.k, stored.generator);
    eqCoord(stored.coordinate, noteCoordinate(s, actual));
    const independentCents = pitch(stored.coordinate, s);
    close(independentCents, stored.pitchCents);
    close(actual.c, independentCents);
    close(coordinateCents(s, stored.coordinate), independentCents);
    const hzProduct =
      corpus.tonicHz *
      2 ** ((stored.coordinate[0] * s.p) / 1200) *
      2 ** ((stored.coordinate[1] * s.g) / 1200);
    relClose(frequencyFor(independentCents, corpus.tonicHz), hzProduct);
  }
  assert.deepEqual(s, before, 'scale and pitch inspection must not mutate the frozen source state');

  const referenceCents = fixture.reference.periods * s.p;
  const actualReferenceRatio = 2 ** (referenceCents / 1200);
  const idealRatio =
    fixture.reference.idealRatio.numerator / fixture.reference.idealRatio.denominator;
  if (fixture.reference.expectsPure) relClose(actualReferenceRatio, idealRatio);
  else {
    assert.equal(fixture.id, 'optimized-meantone-we');
    assert.equal(fixture.state.tuneConfig.method, 'Weil–Euclidean');
    assert.equal(fixture.state.tuneConfig.fixed, false);
    assert.ok(
      Math.abs(actualReferenceRatio - idealRatio) > 1e-3,
      'optimized p is deliberately not forced to the ideal octave ratio'
    );
    close(s.p, 1201.390585549339, 1e-9);
  }

  if (fixture.edo) {
    assert.equal(fixture.state.tuning, 'EDO');
    assert.equal(fixture.state.tuneConfig.method, 'EDO');
    assert.equal(fixture.state.tuneConfig.n, '31');
    assert.equal(fixture.state.tuneConfig.k, '18');
    assert.equal(fixture.state.tuneConfig.h, '31');
    for (let degree = 0; degree < storedCoordinates.length; degree++) {
      const [period, generator] = storedCoordinates[degree];
      const integerSteps =
        period * fixture.edo.stepsPerOctave + generator * fixture.edo.generatorStep;
      assert.equal(integerSteps, degree, '31-EDO cents follow exact integer step arithmetic');
      close(generated.notes[degree].c, (integerSteps * 1200) / fixture.edo.stepsPerOctave);
    }
    const samePitchA = [0, 0],
      samePitchB = [-18, 31];
    assert.equal(samePitchA[0] * 31 + samePitchA[1] * 18, 0);
    assert.equal(samePitchB[0] * 31 + samePitchB[1] * 18, 0);
    close(pitch(samePitchA, s), pitch(samePitchB, s));
    assert.notDeepEqual(
      samePitchA,
      samePitchB,
      'EDO coincidence does not erase exact coordinate identity'
    );
  }

  for (const wrapping of ['off', 'on']) {
    const expected = fixture.layouts[wrapping],
      boardState = structuredClone(s),
      boardBefore = structuredClone(boardState);
    const board = buildBoard(boardState, structuredClone(expected.config));
    assert.deepEqual(
      boardState,
      boardBefore,
      'board construction must not mutate its temperament snapshot'
    );
    assert.equal(!!board.wrapping, wrapping === 'on');
    assert.deepEqual(board.a, expected.axes.a);
    assert.deepEqual(board.b, expected.axes.b);
    assert.deepEqual(board.wrapping?.vector ?? null, expected.vector);
    assert.equal(board.playable, expected.playable);
    assert.equal(board.coverage, expected.coverage);
    for (const probe of expected.probes) {
      const key = board.keys[probe.index];
      assert.equal(key.enabled, probe.enabled);
      assert.equal(key.degree, probe.degree);
      assert.equal(!!key.wrapped, probe.wrapped);
      assert.equal(!!key.conflict, probe.conflict);
      assert.ok(key.enabled && !key.conflict, 'stored probe is an enabled, non-overlapping button');
      eqCoord(key.m, probe.coordinate);
      close(key.c, probe.cents);
      if (wrapping === 'on') {
        eqCoord(key.baseM, probe.baseCoordinate);
        assert.equal(key.register, probe.register);
        eqCoord(key.baseM, storedCoordinates[key.degree]);
        const once = [key.baseM[0] + key.register, key.baseM[1]];
        eqCoord(key.m, once);
        close(key.c, pitch(key.baseM, s) + key.register * s.p);
      } else {
        const index = probe.index,
          row = Math.floor(index / 10),
          column = index % 10;
        const x = 2 * column + (row & 1),
          y = row,
          rootRow = Math.floor(expected.config.center / 10),
          rootColumn = expected.config.center % 10;
        const rootX = 2 * rootColumn + (rootRow & 1),
          rootY = rootRow;
        const across = (x - rootX + y - rootY) / 2,
          up = -(y - rootY);
        const independent = [
          across * expected.axes.a[0] + up * expected.axes.b[0] + expected.config.register,
          across * expected.axes.a[1] + up * expected.axes.b[1]
        ];
        eqCoord(key.m, independent);
        close(key.c, pitch(independent, s));
      }
    }
  }

  const analysis = analyzeChord(s, fixture.v2.chordText);
  assertProjectionOracle(analysis, fixture);
  assert.equal(analysis.projection.cardinalityStatus, fixture.v2.projectionCardinality.status);
  assert.equal(analysis.projection.originalCardinality, fixture.v2.projectionCardinality.source);
  assert.equal(analysis.projection.temperedCardinality, fixture.v2.projectionCardinality.tempered);
  assert.equal(analysis.occurrences.completeOccurrences.length, fixture.v2.completeOccurrenceCount);
  const occurrence = analysis.occurrences.completeOccurrences.find(
    o => o.root === fixture.v2.occurrence.root
  );
  assert.ok(occurrence);
  assert.equal(occurrence.id, fixture.v2.occurrence.id);
  assert.deepEqual(occurrence.coords, fixture.v2.occurrence.coordinates);
  assert.deepEqual(occurrence.degrees, fixture.v2.occurrence.degrees);
  for (let i = 0; i < occurrence.coords.length; i++)
    close(occurrence.pitches[i], pitch(occurrence.coords[i], s));
  const realization = realizeChord(s, analysis, occurrence, {
    periodShift: fixture.v2.realization.periodShift
  });
  // Stage 8 deliberately restores the 400-cent 5/4 voice omitted by the
  // historical period-class deduplication. Keep the original corpus unchanged.
  const preservesDividedVoices = fixture.id === 'divided-octave-128-125';
  const expectedRealization = preservesDividedVoices
    ? {
        ...fixture.v2.realization,
        coordinates: [
          [0, 0],
          [1, 0],
          [1, 1]
        ],
        degrees: [0, 0, 14],
        registers: [0, 1, 1],
        pitches: [0, 400, 705.0691154305116],
        collapsedMembers: 0
      }
    : fixture.v2.realization;
  const expectedIdParts = JSON.parse(fixture.v2.realization.id.slice('voice2:'.length));
  expectedIdParts[2] = expectedRealization.coordinates;
  assert.equal(realization.id, 'voice2:' + JSON.stringify(expectedIdParts));
  assert.deepEqual(realization.coords, expectedRealization.coordinates);
  assert.deepEqual(realization.degrees, expectedRealization.degrees);
  assert.deepEqual(realization.registers, expectedRealization.registers);
  assert.equal(realization.collapsedMembers, expectedRealization.collapsedMembers);
  assert.equal(realization.withinRegisterRange, expectedRealization.withinRegisterRange);
  for (let i = 0; i < realization.coords.length; i++) {
    close(realization.pitches[i], pitch(realization.coords[i], s));
    close(realization.pitches[i], expectedRealization.pitches[i]);
  }
  const wrappedBoard = buildBoard(s, fixture.layouts.on.config),
    placementResult = placeRealization(s, realization, wrappedBoard, 65);
  const expectedFingering = preservesDividedVoices
    ? {
        ...fixture.v2.fingering,
        keys: [65, 66, 56],
        coordinates: expectedRealization.coordinates,
        pitches: expectedRealization.pitches
      }
    : fixture.v2.fingering;
  const placed = placementResult.placements.find(
    p =>
      p.periodShift === expectedFingering.periodShift &&
      p.keys.join(',') === expectedFingering.keys.join(',')
  );
  assert.ok(placed, 'frozen exact-register fingering remains available');
  assert.deepEqual(placed.coords, expectedFingering.coordinates);
  for (let i = 0; i < placed.pitches.length; i++)
    close(placed.pitches[i], expectedFingering.pitches[i]);
  assert.equal(placed.reach, expectedFingering.reach);
  assert.equal(placed.periodShift, 0);
  for (let i = 0; i < placed.keys.length; i++) {
    const key = wrappedBoard.keys[placed.keys[i]];
    assert.ok(key.enabled && !key.conflict);
    eqCoord(key.m, placed.coords[i]);
    close(key.c, pitch(placed.coords[i], s));
  }
  if (fixture.id === 'divided-octave-128-125') {
    assert.equal(analysis.projection.cardinalityStatus, 'collapsed');
    assert.equal(realization.collapsedMembers, 0);
    assert.equal(
      realization.coords.length,
      3,
      'the 5/4 voice survives sharing a period class with unison'
    );
    const unison = analysis.projection.notes.find(n => n.ratio === '1/1'),
      fifth = analysis.projection.notes.find(n => n.ratio === '5/4');
    assert.ok(unison && fifth);
    eqCoord(unison.coordinate, [0, 0]);
    eqCoord(fifth.coordinate, [1, 0]);
    assert.equal(unison.periodClass, fifth.periodClass, 'v2 collapse here is by period class');
    close(pitch(fifth.coordinate, s) - pitch(unison.coordinate, s), 400);
    assert.notEqual(
      pitch(fifth.coordinate, s),
      pitch(unison.coordinate, s),
      'period-class collapse is not equal absolute frequency'
    );
  }
  assert.deepEqual(
    s,
    before,
    'chord analysis and realization must not mutate the frozen source state'
  );
}

const demoState = structuredClone(demo.musicalContext.state);
const corpusMeantone = corpus.fixtures.find(f => f.id === demo.musicalContext.sourceFixtureId);
assert.ok(corpusMeantone);
assert.deepEqual(demoState, corpusMeantone.state);
assert.equal(
  demo.status,
  'Specification/test fixture only. It is not an importable project or a claim that composition playback/editor features exist.'
);
assert.equal(demo.musicalContext.tonicHz, 220);
assert.equal(demo.musicalContext.tempoQuarterBpm, 100);
assert.deepEqual(demo.musicalContext.meter, {numerator: 4, denominator: 4});
assert.equal(demo.musicalContext.ppq, 960);
assert.equal(demo.musicalContext.totalTicks, 30720);
relClose(
  ((demo.musicalContext.totalTicks / demo.musicalContext.ppq) * 60) /
    demo.musicalContext.tempoQuarterBpm,
  19.2
);
const demoBoard = buildBoard(demoState, demo.layout);
assert.equal(demoBoard.playable, 133);
assert.deepEqual(demoBoard.wrapping.vector, demo.layout.boardVector);
assert.equal(demo.chordEvents.length, 8);
assert.equal(demo.melodyEvents.length, 31);
assert.deepEqual(demo.progression, ['I', 'IV', 'V', 'I', 'I', 'ii', 'V', 'I']);
assert.deepEqual(demo.melodyPatternByBar, [
  [0, 2, 4, 2],
  [3, 5, 0, 5],
  [4, 6, 1, 6],
  [2, 1, 0, 0],
  [0, 1, 2, 4],
  [1, 3, 5, 3],
  [4, 6, 1, 6],
  [2, 1, 0]
]);
assert.deepEqual(demo.melodyPeriodShiftsByBar, [
  [0, 0, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 1, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 1, 0],
  [0, 0, 0]
]);
const expectedChordRoots = [0, 3, 4, 0, 0, 1, 4, 0];
const expectedChordTexts = [
  '4:5:6',
  '4:5:6',
  '4:5:6',
  '4:5:6',
  '4:5:6',
  '10:12:15',
  '4:5:6',
  '4:5:6'
];
const allDemoEventIds = [...demo.chordEvents.map(e => e.id), ...demo.melodyEvents.map(e => e.id)];
assert.equal(new Set(allDemoEventIds).size, allDemoEventIds.length, 'demo event IDs are unique');
for (let bar = 0; bar < 8; bar++) {
  const chordEvent = demo.chordEvents[bar],
    voicing = demo.voicings.find(v => v.id === chordEvent.voicingId);
  assert.ok(voicing);
  assert.equal(chordEvent.bar, bar + 1);
  assert.equal(chordEvent.startTick, bar * 3840);
  assert.equal(chordEvent.durationTick, 3840);
  assert.equal(voicing.rootDegree, expectedChordRoots[bar]);
  assert.equal(voicing.sourceChord, expectedChordTexts[bar]);
  assert.equal(voicing.selectedFingering.periodShift, 0);
  const chordAnalysis = analyzeChord(demoState, voicing.sourceChord);
  assertProjectionOracle(chordAnalysis, {...voicing, state: demoState, v2: voicing});
  const occurrence = chordAnalysis.occurrences.completeOccurrences.find(
    o => o.root === voicing.rootDegree
  );
  assert.ok(occurrence);
  assert.equal(occurrence.id, voicing.occurrenceId);
  const realization = realizeChord(demoState, chordAnalysis, occurrence, {periodShift: 0});
  assert.equal(realization.id, voicing.realizationId);
  assert.deepEqual(realization.coords, voicing.realizationCoordinates);
  const placed = placeRealization(demoState, realization, demoBoard, 65).placements.find(
    p => p.periodShift === 0 && p.keys.join(',') === voicing.selectedFingering.keys.join(',')
  );
  assert.ok(placed, 'each progression chord has one stored exact-register board fingering');
  assert.deepEqual(placed.coords, voicing.selectedFingering.coordinates);
  for (let i = 0; i < placed.pitches.length; i++)
    close(placed.pitches[i], voicing.selectedFingering.pitches[i]);
  assert.deepEqual(
    chordEvent.tones.map(t => t.coordinate),
    voicing.selectedFingering.coordinates,
    'event stores the selected placement coordinates exactly once'
  );
}
for (let i = 0; i < demo.melodyEvents.length; i++) {
  const event = demo.melodyEvents[i],
    row = demo.melodyPatternByBar[event.bar - 1],
    degree = row[event.beat - 1];
  assert.equal(event.sourceDegree, degree);
  assert.equal(event.periodShift, demo.melodyPeriodShiftsByBar[event.bar - 1][event.beat - 1]);
  assert.equal(
    event.startTick,
    (event.bar - 1) * 3840 + (event.beat - 1) * 960,
    'melody onset follows the frozen quarter-note grid'
  );
  assert.equal(event.durationTick, event.bar === 8 && event.beat === 3 ? 1920 : 960);
  const source = corpusMeantone.scale.coordinates[degree].coordinate;
  const expected = [source[0] + event.periodShift, source[1]];
  eqCoord(event.coordinate, expected);
  const key = demoBoard.keys[event.boardCell];
  assert.ok(key.enabled && !key.conflict, 'every specified melody pitch has a playable board cell');
  eqCoord(key.m, event.coordinate);
  close(key.c, pitch(event.coordinate, demoState));
  assert.equal(event.startTick % 1, 0);
  assert.equal(event.durationTick % 1, 0);
  assert.ok(event.durationTick >= 1);
}
assert.deepEqual(
  demo.melodyEvents.slice(-3).map(e => e.durationTick),
  [960, 960, 1920]
);
for (let bar = 1; bar <= 8; bar++) {
  const chord = demo.chordEvents.find(e => e.bar === bar),
    notes = demo.melodyEvents.filter(e => e.bar === bar).sort((a, b) => a.beat - b.beat);
  assert.equal(chord.startTick, (bar - 1) * 3840);
  assert.equal(chord.startTick + chord.durationTick, bar * 3840);
  assert.equal(notes[0].startTick, (bar - 1) * 3840);
  for (let i = 1; i < notes.length; i++)
    assert.equal(
      notes[i].startTick,
      notes[i - 1].startTick + notes[i - 1].durationTick,
      'melody events are contiguous inside each bar'
    );
  assert.equal(
    notes.at(-1).startTick + notes.at(-1).durationTick,
    bar * 3840,
    'melody exactly covers each bar'
  );
}
assert.equal(Math.max(...demo.chordEvents.map(e => e.startTick + e.durationTick)), 30720);
assert.equal(Math.max(...demo.melodyEvents.map(e => e.startTick + e.durationTick)), 30720);
const demoToneIds = [
  ...demo.chordEvents.flatMap(e => e.tones.map(t => t.toneId)),
  ...demo.melodyEvents.map(e => e.toneId)
];
assert.equal(new Set(demoToneIds).size, demoToneIds.length, 'demo tone IDs are unique');

const benchmark = createEditorBenchmark();
assert.equal(benchmark.sourceFixtureId, 'meantone-7-mode4');
assert.equal(benchmark.format, 'composition-benchmark-recipe-v1');
assert.equal(benchmark.tracks.length, EDITOR_BENCHMARK.trackCount);
assert.equal(benchmark.totalTicks, 491520);
assert.equal(benchmark.durationSeconds, 256);
assert.equal(
  benchmark.tracks.reduce((sum, track) => sum + track.events.length, 0),
  4096
);
const benchmarkIds = new Set();
for (let trackIndex = 0; trackIndex < benchmark.tracks.length; trackIndex++) {
  const track = benchmark.tracks[trackIndex];
  assert.equal(track.events.length, 1024);
  let previous = -1;
  for (let eventIndex = 0; eventIndex < track.events.length; eventIndex++) {
    const event = track.events[eventIndex];
    assert.ok(!benchmarkIds.has(event.id));
    benchmarkIds.add(event.id);
    assert.ok(Number.isSafeInteger(event.startTick) && event.startTick >= 0);
    assert.ok(event.startTick >= previous, 'events are monotonic within each benchmark track');
    previous = event.startTick;
    assert.ok(Number.isSafeInteger(event.durationTick) && event.durationTick >= 1);
    assert.ok(event.startTick + event.durationTick <= benchmark.totalTicks);
    assert.ok(event.tones.length >= 1 && event.tones.length <= 8);
    assert.ok(Number.isInteger(event.velocity) && event.velocity >= 1 && event.velocity <= 127);
    const bar = Math.floor(eventIndex / 8),
      eighth = eventIndex % 8,
      degree = (bar + eighth + trackIndex) % corpusMeantone.scale.coordinates.length,
      shift = trackIndex % 2;
    const base = corpusMeantone.scale.coordinates[degree].coordinate;
    assert.equal(event.bar, bar + 1);
    assert.equal(event.eighth, eighth + 1);
    assert.equal(event.sourceDegree, degree);
    assert.equal(event.periodShift, shift);
    assert.deepEqual(
      event.tones[0].coordinate,
      [base[0] + shift, base[1]],
      'benchmark pitches are frozen Meantone degrees plus an explicit register'
    );
    for (const coordinate of event.tones.map(t => t.coordinate))
      assert.ok(coordinate.every(n => Number.isInteger(n) && Math.abs(n) <= 10000));
  }
}
assert.equal(benchmarkIds.size, 4096);
assert.deepEqual(
  createEditorBenchmark(),
  benchmark,
  'benchmark recipe IDs and event order are deterministic'
);
const stress = createVoiceStressRecipe();
assert.deepEqual(
  stress.polyphonyLevels.map(x => x.tones),
  [1, 8, 16, 32]
);
assert.equal(
  stress.mixedSourceCeiling.transport +
    stress.mixedSourceCeiling.live +
    stress.mixedSourceCeiling.preview,
  64
);
assert.equal(stress.maxConcurrentSoundingVoices, 64);
assert.equal(stress.releaseTailsCountTowardCeiling, true);
assert.equal(
  stress.lookaheadQueueEventsCountTowardCeiling,
  false,
  'scheduled queue entries are not concurrent voices'
);
assert.match(stress.status, /unmeasured/);

console.log(
  'Phase 0 corpus, independent lattice/EDO/reference/pitch oracles, exact v2 voicings, board probes, demo timing, and benchmark recipes passed.'
);
