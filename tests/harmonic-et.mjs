import assert from 'node:assert/strict';
import {targetSet} from '../src/core/ji-limit-engine.mjs';
import {makeState} from '../src/core/catalog.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {chordIdentity} from '../src/chords/chord-identity.mjs';
import {projectChord, projectCoordinateShape} from '../src/chords/chord-projection.mjs';
import {mapMonzo} from '../src/core/ji-monzo.mjs';
import {buildDyadIndex} from '../src/harmonic/harmonic-dyad-graph.mjs';
import {assessET, cycleWitness, verifyETEvidence} from '../src/harmonic/harmonic-et.mjs';
import {validateAssessment} from '../src/harmonic/harmonic-types.mjs';

function indexFor(state, oddLimit, representationPolicy = 'octave', primeFilter = state.basis) {
  const targets = targetSet({
    oddLimit,
    primeFilter,
    mappingSubgroup: state.basis,
    representationPolicy
  });
  return buildDyadIndex(targets, state);
}

const meantone = makeState('meantone'),
  didymic = projectChord(meantone, chordIdentity('1:9/8:3/2:5/3')).shapeIdentities.octave;
const l9 = indexFor(meantone, 9),
  l15 = indexFor(meantone, 15),
  l27 = indexFor(meantone, 27);
const at9 = assessET(didymic, l9),
  at15 = assessET(didymic, l15),
  at27 = assessET(didymic, l27);
assert.equal(at9.status, 'essentially-tempered');
assert.equal(at15.status, 'essentially-tempered');
assert.equal(at27.status, 'ji-liftable');
assert.equal(at9.shapeId, at27.shapeId, 'ET context changes do not rename the tempered shape');
assert.notEqual(at9.targetSetId, at27.targetSetId);
assert.equal(verifyETEvidence(at9, didymic, l9).valid, true);
assert.equal(verifyETEvidence(at15, didymic, l15).valid, true);
assert.equal(verifyETEvidence(at27, didymic, l27).valid, true);
assert.ok(at9.obstruction.allEdgesNonempty && at9.obstruction.exhaustive);
assert.ok(at9.obstruction.certificate.stats.exploredStates > 0);
assert.ok(at9.obstruction.representativeCycles.length > 0);
assert.ok(
  at9.obstruction.representativeCycles.some(cycle => ['81/80', '80/81'].includes(cycle.commaRatio)),
  'meantone proof exposes the exact didymic comma'
);
for (const cycle of at9.obstruction.representativeCycles) {
  assert.deepEqual(cycle.correctedMappedSum, [0, 0]);
  assert.equal(cycle.kernel.valid, true);
  assert.ok(cycle.nontrivial);
}
assert.throws(() => validateAssessment(at9, {targetSetId: l27.targetSetId}), /context mismatch/);
assert.equal(
  verifyETEvidence(at9, didymic, l27).valid,
  false,
  'an assessment cannot be reused under a different odd-limit context'
);
const corruptCycle = {
  ...at9,
  obstruction: {
    ...at9.obstruction,
    representativeCycles: [{...at9.obstruction.representativeCycles[0], correctedMonzo: [0, 0, 0]}]
  }
};
assert.equal(
  verifyETEvidence(corruptCycle, didymic, l9).valid,
  false,
  'cycle evidence is recomputed before it is trusted'
);

const bounded = assessET(didymic, l27, {maxStates: 1});
assert.equal(bounded.status, 'unknown');
assert.equal(bounded.complete, false);
assert.equal(verifyETEvidence(bounded, didymic, l27).valid, true);
const cancelled = assessET(didymic, l27, {shouldCancel: () => true});
assert.equal(cancelled.status, 'unknown');
assert.equal(cancelled.reason, 'cancelled');
const notDyadicShape = {
  id: 'empty-edge-shape',
  mappingId: l9.mappingId,
  equivalence: 'octave',
  coordinates: [
    [0, 0],
    [0, 1000000]
  ]
};
const notDyadic = assessET(notDyadicShape, l9);
assert.equal(notDyadic.status, 'not-dyadic');
assert.deepEqual(notDyadic.obstruction.emptyEdge, [0, 1]);
assert.equal(verifyETEvidence(notDyadic, notDyadicShape, l9).valid, true);
assert.throws(
  () =>
    assessET(
      {
        id: 'duplicate-vertices',
        mappingId: l9.mappingId,
        equivalence: 'octave',
        coordinates: [
          [0, 0],
          [1, 0],
          [2, 0],
          [3, 0]
        ]
      },
      l9
    ),
  /distinct temperament vertices/
);

// Correct an octave-bearing cycle before calling it a comma.
const augmented = fromCommas('128/125', '2.3.5', 'Computed CWE'),
  augmentedShape = projectCoordinateShape(augmented, [
    [0, 0],
    [1, 0],
    [2, 0]
  ]).identities.octave;
const augmentedIndex = indexFor(augmented, 5),
  fiveFour = Object.values(augmentedIndex.byClassKey)
    .flat()
    .find(item => item.ratio === '5/4');
const correctedCycle = cycleWitness(augmentedShape, augmentedIndex, {
  edges: [
    {fromMember: 0, toMember: 1, targetId: fiveFour.targetId},
    {fromMember: 1, toMember: 2, targetId: fiveFour.targetId},
    {fromMember: 2, toMember: 0, targetId: fiveFour.targetId}
  ]
});
assert.deepEqual(
  correctedCycle.rawMappedSum,
  [3, 0],
  'the uncorrected target cycle sums to the mapped octave'
);
assert.notDeepEqual(
  correctedCycle.rawMappedSum,
  [0, 0],
  'an octave-summing raw cycle is not itself a comma witness'
);
assert.deepEqual(correctedCycle.registerCorrectionMonzo, [-1, 0, 0]);
assert.deepEqual(correctedCycle.correctedMonzo, [-7, 0, 3]);
assert.deepEqual(correctedCycle.correctedMappedSum, [0, 0]);
assert.equal(correctedCycle.commaRatio, '125/128');
assert.deepEqual(mapMonzo(augmentedIndex.rows, correctedCycle.correctedMonzo), [0, 0]);
assert.throws(
  () =>
    cycleWitness(augmentedShape, augmentedIndex, {
      edges: [
        {fromMember: 0, toMember: 1, targetId: fiveFour.targetId},
        {fromMember: 1, toMember: 2, targetId: fiveFour.targetId},
        {fromMember: 1, toMember: 0, targetId: fiveFour.targetId}
      ]
    }),
  /closed directed path/
);
const corruptedMappingIndex = {
  ...augmentedIndex,
  rows: [
    [3, 4, 6],
    [0, 1, 0]
  ]
};
assert.notDeepEqual(
  mapMonzo(corruptedMappingIndex.rows, fiveFour.monzo),
  fiveFour.coordinate,
  'the corrupted matrix gives the candidate dyad a nonzero coordinate discrepancy'
);
assert.throws(
  () =>
    cycleWitness(augmentedShape, corruptedMappingIndex, {
      edges: [
        {fromMember: 0, toMember: 1, targetId: fiveFour.targetId},
        {fromMember: 1, toMember: 2, targetId: fiveFour.targetId},
        {fromMember: 2, toMember: 0, targetId: fiveFour.targetId}
      ]
    }),
  /does not map/,
  'an altered matrix cannot turn a nonzero-image cycle into comma evidence'
);
const augmentedAt5 = assessET(augmentedShape, augmentedIndex),
  augmentedAt25Index = indexFor(augmented, 25),
  augmentedAt25 = assessET(augmentedShape, augmentedAt25Index);
assert.equal(augmentedAt5.status, 'essentially-tempered');
assert.equal(augmentedAt25.status, 'ji-liftable');
assert.equal(augmentedAt5.shapeId, augmentedAt25.shapeId);
assert.ok(
  augmentedAt5.obstruction.representativeCycles.some(cycle =>
    ['125/128', '128/125'].includes(cycle.commaRatio)
  )
);
assert.equal(verifyETEvidence(augmentedAt5, augmentedShape, augmentedIndex).valid, true);
assert.equal(verifyETEvidence(augmentedAt25, augmentedShape, augmentedAt25Index).valid, true);

const tritave = fromCommas('245/243', '3.5.7', 'Computed CWE'),
  nativeIndex = indexFor(tritave, 15, 'native-exact', [3, 5, 7]);
const nativeShape = projectCoordinateShape(tritave, [
    [0, 0],
    [1, 0]
  ]).identities.exact,
  nativeAssessment = assessET(nativeShape, nativeIndex);
assert.equal(nativeAssessment.status, 'ji-liftable');
assert.equal(nativeAssessment.equivalence, 'exact');
assert.equal(verifyETEvidence(nativeAssessment, nativeShape, nativeIndex).valid, true);

console.log(
  'ET assessments are target-set relative, cycle commas are exactly kernel checked, and incomplete proofs remain unknown.'
);
