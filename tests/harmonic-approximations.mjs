import assert from 'node:assert/strict';
import {makeState} from '../src/core/engine.mjs';
import {mappingContext} from '../src/harmonic/harmonic-context.mjs';
import {
  searchIntervalApproximations,
  rankApproximationCoordinates
} from '../src/harmonic/harmonic-approximations.mjs';
import {targetSet} from '../src/core/ji-limit-engine.mjs';

const state = makeState('meantone');
const context = mappingContext(state);
const tuning = {mappingId: context.id, periodCents: state.p, generatorCents: state.g};
const absError = (coordinate, p, g, ideal) =>
  Math.abs(coordinate[0] * p + coordinate[1] * g - ideal);

// Independent reference values from the frozen harmonic-discovery plan.
const sixteenFifteenths = searchIntervalApproximations(context, tuning, '16/15');
assert.deepEqual(sixteenFifteenths.canonical.coordinate, [3, -5]);
assert.ok(Math.abs(sixteenFifteenths.canonical.signedErrorCents - 5.0127147302) < 1e-8);
assert.deepEqual(sixteenFifteenths.candidates[0].coordinate, [-15, 26]);
assert.ok(Math.abs(sixteenFifteenths.candidates[0].signedErrorCents - 1.1999147302) < 1e-8);
assert.ok(Math.abs(sixteenFifteenths.candidates[0].improvementCents - 3.8128) < 1e-8);

// For a small domain, checking the closest period coefficient for each
// generator must agree with a separate rectangular brute-force oracle.
const bounded = searchIntervalApproximations(context, tuning, '7/4', {generatorBound: 4});
const idealSevenFour = 1200 * Math.log2(7 / 4);
let oracle = {coordinate: null, error: Infinity};
for (let b = -4; b <= 4; b++)
  for (let a = -40; a <= 40; a++) {
    const error = absError([a, b], state.p, state.g, idealSevenFour);
    if (error < oracle.error) {
      oracle = {coordinate: [a, b], error};
    }
  }
assert.equal(bounded.completeness.domainExhausted, true);
assert.equal(bounded.completeness.generatorSamples, 9);
assert.ok(Math.abs(bounded.candidates[0].absoluteErrorCents - oracle.error) < 1e-9);

// Negative generator coefficients are in the search domain, not just positive
// representatives. Tune one exact lattice point to make the case explicit.
const negativeCoordinate = [4, -4];
const negativeGenerator = (idealSevenFour - 4 * 1200) / -4;
const negativeResult = searchIntervalApproximations(
  context,
  {...tuning, generatorCents: negativeGenerator},
  '7/4',
  {generatorBound: 4}
);
assert.ok(
  negativeResult.candidates.some(
    value =>
      JSON.stringify(value.coordinate) === JSON.stringify(negativeCoordinate) &&
      value.absoluteErrorCents < 1e-9
  )
);

// An exact half-period tie includes both neighboring period coefficients.
const tiePeriod = idealSevenFour / 1.5;
const tied = searchIntervalApproximations(
  context,
  {...tuning, periodCents: tiePeriod, generatorCents: 100},
  '7/4',
  {generatorBound: 0}
);
assert.deepEqual(
  tied.candidates.map(value => value.coordinate),
  [
    [1, 0],
    [2, 0]
  ]
);
assert.ok(
  Math.abs(tied.candidates[0].absoluteErrorCents - tied.candidates[1].absoluteErrorCents) < 1e-9
);

// Tuning-specific errors use the supplied (possibly non-octave or stretched)
// period and generator rather than a hard-coded 1200-cent period.
const stretched = {...tuning, periodCents: 1187.3, generatorCents: 701.2};
const stretchedResult = searchIntervalApproximations(context, stretched, '11/8', {
  generatorBound: 12
});
assert.ok(stretchedResult.candidates.length > 0);
for (const candidate of stretchedResult.candidates) {
  const expectedCents = candidate.coordinate[0] * 1187.3 + candidate.coordinate[1] * 701.2;
  assert.ok(Math.abs(candidate.tunedCents - expectedCents) < 1e-9);
  assert.ok(Math.abs(candidate.signedErrorCents - (expectedCents - candidate.idealCents)) < 1e-9);
}

// Keep the canonical result even when its coordinate is outside the bounded
// alternative search. A bounded miss does not mean the JI target is unmapped.
const narrow = searchIntervalApproximations(context, tuning, '16/15', {generatorBound: 0});
assert.deepEqual(narrow.canonical.coordinate, [3, -5]);
assert.equal(narrow.canonical.inSearchDomain, false);
assert.ok(narrow.canonical.absoluteErrorCents > 0);

// An alternative coordinate may coincide exactly with another mapped JI
// identity. This is a collision, never a reassignment of the searched target.
const collisionSet = targetSet({oddLimit: 15, primeFilter: [2, 3, 5], mappingSubgroup: [2, 3, 5]});
const coordinate = [-2, 4];
const collisionTuning = {...tuning, generatorCents: (idealSevenFour + 2 * 1200) / 4};
const collisionResult = searchIntervalApproximations(context, collisionTuning, '7/4', {
  generatorBound: 4,
  targetSet: collisionSet
});
const collision = collisionResult.candidates.find(
  value => JSON.stringify(value.coordinate) === JSON.stringify(coordinate)
);
assert.ok(collision, 'the deliberately exact alternative is retained');
assert.ok(
  collision.collisionTargetIds.includes(
    collisionSet.targets.find(value => value.ratio.label === '5/4').id
  )
);
assert.equal(collision.targetRatio, '7/4', 'a collision does not change the requested JI identity');

// Coordinate identities remain exact even when tuning creates enharmonic
// equality: cents can rank candidates but never merge their IDs.
const tiedCoordinates = rankApproximationCoordinates(
  context,
  {...tuning, periodCents: 100, generatorCents: 100},
  '7/4',
  [
    [1, 0],
    [0, 1],
    [1, 0]
  ]
);
assert.equal(tiedCoordinates.length, 2);
assert.notEqual(tiedCoordinates[0].id, tiedCoordinates[1].id);

assert.throws(
  () => searchIntervalApproximations(context, tuning, '16/15', {generatorBound: 257}),
  /bound/
);
assert.throws(
  () => searchIntervalApproximations(context, tuning, '16/15', {minimumImprovementCents: 0}),
  /improvement/
);
assert.throws(
  () =>
    searchIntervalApproximations(context, tuning, '16/15', {
      targetSet: targetSet({oddLimit: 15, primeFilter: [2, 3, 5], mappingSubgroup: [2, 3]})
    }),
  /exact prime subgroup/
);

console.log(
  'Bounded interval approximation search, exact identities, and collision lookups passed.'
);
