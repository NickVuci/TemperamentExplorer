import assert from 'node:assert/strict';
import {targets} from '../src/core/engine.mjs';
import {
  DEFAULT_ODD_LIMIT,
  ODD_LIMIT_VALUES,
  PRIME_LIMIT_VALUES,
  diamondTargets,
  formatPrimeFilter,
  primeFilterForBasis,
  ratioWithinJILimits,
  targetId,
  targetSet,
  targetSetIdentity,
  validateJILimits
} from '../src/core/ji-limit-engine.mjs';

assert.equal(DEFAULT_ODD_LIMIT, 15);
assert.deepEqual(validateJILimits(), {oddLimit: 15, primeLimit: null});
assert.deepEqual(
  ODD_LIMIT_VALUES,
  Array.from({length: 48}, (_, i) => 2 * i + 3)
);
assert.deepEqual(
  PRIME_LIMIT_VALUES,
  [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97]
);
assert.deepEqual(
  targets(5).map(t => t.label),
  ['6/5', '5/4', '4/3', '3/2', '8/5', '5/3'],
  'odd-only search preserves existing target sets'
);
assert.deepEqual(
  targets(5, 3).map(t => t.label),
  ['4/3', '3/2']
);
assert.deepEqual(
  targets(13, 3).map(t => t.label),
  ['9/8', '4/3', '3/2', '16/9']
);
assert.ok(targets(13, 5).some(t => t.label === '5/4'));
assert.ok(!targets(13, 5).some(t => t.label === '7/4'));
assert.equal(targets(5, 2).length, 0);
assert.equal(diamondTargets(5).length, 9);
assert.equal(
  diamondTargets(5, 3).length,
  5,
  'prime filtering retains diamond coordinates while removing disallowed ratios'
);
assert.deepEqual(
  diamondTargets(5, 3)
    .filter(t => t.i === t.j)
    .map(t => t.label),
  ['1/1', '1/1', '1/1']
);
assert.ok(
  ratioWithinJILimits(27, 24, {oddLimit: 9, primeLimit: 3}),
  'reduce ratios before checking factors'
);
assert.ok(ratioWithinJILimits(9, 8, {oddLimit: 9, primeLimit: 3}));
assert.ok(!ratioWithinJILimits(9, 8, {oddLimit: 7, primeLimit: 3}));
assert.ok(!ratioWithinJILimits(11, 8, {oddLimit: 13, primeLimit: 3}));
assert.ok(!ratioWithinJILimits(25, 24, {oddLimit: 13, primeLimit: 3}));
assert.ok(ratioWithinJILimits(2, 1, {oddLimit: 3, primeLimit: 2}));
const octaveTargetSpec = {
  oddLimit: 15,
  primeFilter: [2, 3, 5],
  mappingSubgroup: [2, 3, 5],
  representationPolicy: 'octave'
};
assert.equal(
  targetId(octaveTargetSpec, '5/8'),
  targetId(octaveTargetSpec, '5/4'),
  'octave-folded target IDs reduce after folding'
);
assert.ok(
  targetSet(octaveTargetSpec).targets.some(
    target => target.id === targetId(octaveTargetSpec, '5/8')
  )
);
assert.notEqual(
  targetSetIdentity(octaveTargetSpec),
  targetSetIdentity({...octaveTargetSpec, representationPolicy: 'native-exact'})
);
const porkypine = [2, 3, 5, 11],
  porkypineFilter = primeFilterForBasis(porkypine);
assert.deepEqual(
  porkypineFilter,
  porkypine,
  'an incomplete basis remains its exact prime subgroup'
);
assert.ok(ratioWithinJILimits(11, 8, {oddLimit: 15, primeLimit: porkypineFilter}));
assert.ok(
  !ratioWithinJILimits(7, 4, {oddLimit: 15, primeLimit: porkypineFilter}),
  'Porkypine subgroup excludes the missing 7'
);
assert.ok(targets(15, porkypineFilter).some(t => t.label === '11/8'));
assert.ok(!targets(15, porkypineFilter).some(t => t.label === '7/4'));
assert.ok(
  targets(15, 11).some(t => t.label === '7/4'),
  'an 11-prime-limit includes 7'
);
assert.ok(!diamondTargets(15, porkypineFilter).some(t => t.label === '7/4'));
assert.deepEqual(validateJILimits({oddLimit: 13, primeLimit: null}), {
  oddLimit: 13,
  primeLimit: null
});
assert.deepEqual(validateJILimits({oddLimit: 15, primeLimit: [11, 3, 2, 5]}), {
  oddLimit: 15,
  primeLimit: porkypine
});
assert.equal(primeFilterForBasis([2, 3, 5]), 5);
assert.deepEqual(primeFilterForBasis([3, 5, 11]), [3, 5, 11]);
assert.equal(primeFilterForBasis([2]), 2);
assert.equal(formatPrimeFilter(11), '11-prime-limit');
assert.equal(formatPrimeFilter(porkypineFilter), '2.3.5.11-prime subgroup');
for (const basis of [[], [2, 4], [3, 101]]) assert.throws(() => primeFilterForBasis(basis));
for (const value of [1, 2, 4, 98, 99, '13'])
  assert.throws(() => validateJILimits({oddLimit: value}));
for (const value of [0, 1, 4, 9, 97.1, 101, '5'])
  assert.throws(() => validateJILimits({oddLimit: 13, primeLimit: value}));
for (const value of [[], [2, 2], [2, 4], [2, 101], [2, '3']])
  assert.throws(() => validateJILimits({oddLimit: 15, primeLimit: value}));
for (const invalid of [
  [0, 1],
  [1, 0],
  [-3, 2],
  [1.5, 1]
])
  assert.throws(() => ratioWithinJILimits(...invalid, {oddLimit: 13}));
console.log(
  'Odd and prime limits share one validated target engine; optional prime filtering intersects the mandatory odd-limit bound.'
);

const {parsePrimeFilterInput} = await import('../src/core/ji-limit-engine.mjs');
assert.equal(parsePrimeFilterInput('11', [2, 3, 5]), 11);
assert.deepEqual(parsePrimeFilterInput('2.3.5.11', [2, 3, 5]), [2, 3, 5, 11]);
assert.deepEqual(parsePrimeFilterInput('11, 2, 5', [2, 3, 5]), [2, 5, 11]);
assert.deepEqual(parsePrimeFilterInput('basis', [2, 3, 5, 11]), [2, 3, 5, 11]);
assert.equal(parsePrimeFilterInput('', [2, 3, 5]), null);
for (const invalid of ['9', '2.3.3', '2x3', '101'])
  assert.throws(() => parsePrimeFilterInput(invalid, [2, 3, 5]));
assert.ok(!targets(15, parsePrimeFilterInput('2.3.5.11', [2, 3, 5])).some(t => t.label === '7/4'));
