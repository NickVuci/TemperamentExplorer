import assert from 'node:assert/strict';
import {makeState} from '../src/core/engine.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {analyzeChord} from '../src/chords/chord-analysis.mjs';
import {realizeChord, realizeShape} from '../src/chords/chord-realization.mjs';
import {shapeVoicings} from '../src/chords/chord-voicings.mjs';
import {searchShapeOccurrences} from '../src/chords/chord-occurrence.mjs';
import {validateHarmonicSelection} from '../src/harmonic/harmonic-types.mjs';
import {projectCoordinateShape} from '../src/chords/chord-projection.mjs';
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
function realize(state, input, request = {}) {
  const analysis = analyzeChord(state, input),
    occurrence = analysis.occurrences.completeOccurrences[0];
  assert.ok(occurrence);
  return realizeChord(state, analysis, occurrence, request);
}
const s = {...makeState('meantone'), n: 7, mode: 0};
const major = realize(s, '4:5:6'),
  inverted = realize(s, '4:5:6', {inversion: 1}),
  voiced = realize(s, '5:6:8');
assert.equal(major.familyId, voiced.familyId);
assert.equal(major.familyId, inverted.familyId);
assert.equal(major.shapeId, inverted.shapeId);
assert.deepEqual(
  inverted.ratios,
  ['5/4', '3/2', '2/1'],
  'raising the lowest major member produces the general 5:6:8 inversion'
);
const octave = realize(s, '1:2');
assert.equal(octave.voices.length, 2);
assert.equal(new Set(octave.degrees).size, 1);
assert.equal(octave.collapsedMembers, 0);
close(octave.pitches[1] - octave.pitches[0], s.p);
const repeated = realize(s, '6:4:5:4', {order: 'input'});
assert.equal(repeated.voices.length, 4);
assert.deepEqual(
  repeated.voices.map(voice => voice.inputIndex),
  [0, 1, 2, 3]
);
assert.equal(new Set(repeated.voices.map(voice => voice.memberId)).size, 4);
assert.equal(realize(s, '6:4:5:4', {memberPolicy: 'exact-unique'}).voices.length, 3);
const comma = realize(s, '1:81/80');
assert.equal(comma.voices.length, 2);
assert.deepEqual(comma.coords[0], comma.coords[1]);
const augmented = {...fromCommas('128/125', '2.3.5', 'Computed CWE'), n: 2, mode: 0};
for (const inversion of [0, 1, 2]) {
  const triad = realize(augmented, '1:5/4:25/16', {inversion});
  assert.equal(triad.voices.length, 3);
  assert.equal(new Set(triad.degrees).size, 1);
  assert.equal(new Set(triad.coords.map(JSON.stringify)).size, 3);
  assert.equal(triad.reference.periods, 3);
}
const native = {...fromCommas('245/243', '3.5.7', 'Computed CWE'), n: 19, mode: 0};
const nativeShape = projectCoordinateShape(native, [
  [0, 0],
  [1, 0]
]).identities.native;
assert.equal(
  realizeShape(
    native,
    nativeShape,
    searchShapeOccurrences(native, nativeShape).completeOccurrences[0]
  ).voices.length,
  2
);
const nativeRoot = realize(native, '1:3'),
  nativeMoved = realize(native, '1:3', {inversion: 1});
assert.equal(nativeMoved.reference.kind, 'reference');
assert.equal(nativeMoved.reference.ratio, '3/1');
assert.ok(nativeMoved.variants[1].label.includes('3/1 period voicing'));
assert.equal(nativeRoot.shapeId, nativeMoved.shapeId);
assert.ok(nativeMoved.voices.some(voice => voice.referenceLift === 1));
const stretched = realize({...s, p: 1210}, '1:2');
close(stretched.pairErrors[0].error, 10);
const stretchedNative = realize({...native, p: native.p + 5}, '1:3');
close(stretchedNative.pairErrors[0].error, 5);
for (const state of [s, {...s, p: 1210}, native, {...native, p: native.p + 5}])
  for (const text of [state === s ? '4:5:6' : state.basis.includes(2) ? '4:5:6' : '3:5:7'])
    for (const inversion of [0, 1, 2]) {
      const result = realize(state, text, {inversion, style: 'open', periodShift: 1});
      for (let i = 0; i < result.voices.length; i++) {
        const voice = result.voices[i],
          lift = voice.referenceLift;
        assert.deepEqual(
          voice.coordinate,
          voice.occurrenceCoordinate.map(
            (value, axis) => value + lift * result.reference.vector[axis] + (axis === 0 ? 1 : 0)
          )
        );
        close(result.pitches[i], voice.coordinate[0] * state.p + voice.coordinate[1] * state.g);
      }
      for (const pair of result.pairErrors)
        close(
          pair.error,
          result.pitches[pair.j] -
            result.pitches[pair.i] -
            (result.voices[pair.j].idealCents - result.voices[pair.i].idealCents)
        );
    }
const shape = {
    coordinates: [
      [0, 0],
      [-1, 2],
      [0, 1],
      [-1, 3]
    ]
  },
  occurrence = searchShapeOccurrences(s, shape).completeOccurrences[0];
const et = realizeShape(s, shape, occurrence, {inversion: 1});
assert.equal(et.voices.length, 4);
assert.equal(et.ratios, null);
assert.equal(et.allMapped, null);
assert.equal(et.maxErrorCents, null);
assert.equal(
  validateHarmonicSelection({
    version: 1,
    mappingId: et.mappingId,
    shapeId: et.shapeId,
    occurrenceId: et.occurrenceId,
    voicing: et,
    source: 'test'
  }).voicing.voices.length,
  4
);
const tampered = structuredClone(occurrence);
tampered.coords[0][0] += 99;
assert.deepEqual(
  realizeShape(s, shape, tampered).coords,
  realizeShape(s, shape, occurrence).coords
);
assert.equal(
  shapeVoicings(s, {
    coords: [
      [0, 0],
      [1, 0]
    ]
  })[0].ratios,
  null
);
// An octave with a generator component uses the actual M(2), never [q,0].
const mixed = {
  name: 'mixed',
  basis: [3, 2, 5],
  rows: [
    [1, 0, 0],
    [0, 1, 4]
  ],
  p: 1901.9550008653874,
  g: 1200,
  n: 7,
  mode: 0
};
const mixedVoices = shapeVoicings(mixed, {
  coords: [
    [0, 0],
    [0, 1]
  ]
});
assert.deepEqual(mixedVoices[0].reference.vector, [0, 1]);
assert.equal(mixedVoices[0].reference.periods, null);
assert.deepEqual(mixedVoices[1].coordinateLifts[0], [0, 1]);
console.log(
  'Shape/JI realization preserves voices, exact coordinates, general inversions, reference lifts and stretched errors.'
);
