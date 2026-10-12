import assert from 'node:assert/strict';
import {makeState} from '../src/core/catalog.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {
  equivalencePolicy,
  quotientCoordinate,
  shapeKey
} from '../src/harmonic/harmonic-equivalence.mjs';

function checkLift(policy, coordinate) {
  const q = quotientCoordinate(policy, coordinate);
  assert.deepEqual(
    q.representative.map((value, index) => value + q.removed[index]),
    coordinate
  );
  if (policy.vector)
    assert.deepEqual(
      q.removed,
      policy.vector.map(value => (value === 0 ? 0 : value * q.lift))
    );
  return q;
}

const meantone = makeState('meantone'),
  exact = equivalencePolicy(meantone, 'exact');
const period = equivalencePolicy(meantone, 'period'),
  octave = equivalencePolicy(meantone, 'octave');
assert.deepEqual(octave.vector, [1, 0]);
assert.deepEqual(checkLift(exact, [-2, 5]).classCoordinate, [-2, 5]);
assert.deepEqual(checkLift(period, [-2, 5]).classCoordinate, [0, 5]);
assert.deepEqual(checkLift(octave, [-2, 5]).classCoordinate, [0, 5]);
assert.equal(checkLift(period, [-2, 5]).lift, -2);

const pajara = makeState('pajara11'),
  pajaraOctave = equivalencePolicy(pajara, 'octave');
assert.deepEqual(pajaraOctave.vector, [2, 0]);
assert.deepEqual(checkLift(pajaraOctave, [-1, 3]).classCoordinate, [1, 3]);
assert.deepEqual(checkLift(pajaraOctave, [-1, 3]).representative, [1, 3]);
assert.equal(checkLift(pajaraOctave, [-1, 3]).lift, -1);

const augmented = fromCommas('128/125', '2.3.5', 'Computed CWE');
const augmentedPeriod = equivalencePolicy(augmented, 'period'),
  augmentedOctave = equivalencePolicy(augmented, 'octave');
assert.deepEqual(augmentedOctave.vector, [3, 0]);
assert.deepEqual(checkLift(augmentedOctave, [-1, 0]).classCoordinate, [2, 0]);
const triad = [
  [0, 0],
  [1, 0],
  [2, 0]
];
assert.equal(new Set(triad.map(point => quotientCoordinate(augmentedPeriod, point).key)).size, 1);
assert.equal(new Set(triad.map(point => quotientCoordinate(augmentedOctave, point).key)).size, 3);
assert.notEqual(shapeKey(augmentedPeriod, triad), shapeKey(augmentedOctave, triad));

const oblique = {
  basis: [3, 2, 5],
  rows: [
    [1, 2, 0],
    [0, 3, 1]
  ]
};
const obliqueOctave = equivalencePolicy(oblique, 'octave');
assert.deepEqual(obliqueOctave.vector, [2, 3]);
assert.deepEqual(
  obliqueOctave.transform.map(row =>
    row.reduce((sum, value, index) => sum + value * obliqueOctave.vector[index], 0)
  ),
  [1, 0]
);
assert.deepEqual(checkLift(obliqueOctave, [-1, 8]).classCoordinate, [0, 19]);
assert.equal(
  quotientCoordinate(obliqueOctave, [0, 0]).key,
  quotientCoordinate(obliqueOctave, [2, 3]).key
);
assert.notEqual(
  quotientCoordinate(obliqueOctave, [0, 0]).key,
  quotientCoordinate(obliqueOctave, [1, 0]).key
);
assert.equal(
  shapeKey(obliqueOctave, [
    [0, 0],
    [1, 0]
  ]),
  shapeKey(obliqueOctave, [
    [2, 3],
    [1, 0]
  ]),
  'an octave move of one member preserves its octave-class shape'
);
const obliqueNonprimitive = equivalencePolicy(
  {
    basis: [3, 2, 5],
    rows: [
      [1, 4, 0],
      [0, 6, 1]
    ]
  },
  'octave'
);
assert.equal(obliqueNonprimitive.modulus, 2);
assert.deepEqual(
  obliqueNonprimitive.transform.map(row =>
    row.reduce((sum, value, index) => sum + value * obliqueNonprimitive.vector[index], 0)
  ),
  [2, 0]
);
checkLift(obliqueNonprimitive, [-3, 8]);
assert.notEqual(
  quotientCoordinate(obliqueNonprimitive, [0, 0]).key,
  quotientCoordinate(obliqueNonprimitive, [2, 3]).key
);
assert.equal(
  quotientCoordinate(obliqueNonprimitive, [0, 0]).key,
  quotientCoordinate(obliqueNonprimitive, [4, 6]).key
);
const negativeVector = equivalencePolicy(
  {
    basis: [3, 2, 5],
    rows: [
      [1, -4, 0],
      [0, -6, 1]
    ]
  },
  'octave'
);
assert.deepEqual(negativeVector.vector, [-4, -6]);
assert.deepEqual(
  negativeVector.transform.map(row =>
    row.reduce((sum, value, index) => sum + value * negativeVector.vector[index], 0)
  ),
  [2, 0]
);
checkLift(negativeVector, [-3, 8]);

const asymmetric = [
    [0, 0],
    [0, 1],
    [0, 3]
  ],
  reflection = [
    [0, 0],
    [0, -1],
    [0, -3]
  ];
assert.equal(
  shapeKey(exact, asymmetric),
  shapeKey(exact, asymmetric.map(([p, g]) => [p + 7, g - 2]).reverse())
);
assert.notEqual(shapeKey(exact, asymmetric), shapeKey(exact, reflection));
assert.equal(
  shapeKey(period, asymmetric),
  shapeKey(period, asymmetric.map(([p, g]) => [p + 7, g - 2]).reverse())
);
assert.notEqual(shapeKey(period, asymmetric), shapeKey(period, reflection));
assert.equal(
  shapeKey(pajaraOctave, [
    [0, 0],
    [1, 0]
  ]),
  shapeKey(
    pajaraOctave,
    [
      [9, 2],
      [10, 2]
    ].reverse()
  )
);
assert.equal(
  equivalencePolicy(
    {
      basis: [2, 5, 3],
      rows: [
        [1, 0, 1],
        [0, 4, 1]
      ]
    },
    'octave'
  ).id,
  octave.id,
  'paired basis-column reorder does not change the policy'
);
assert.deepEqual(JSON.parse(JSON.stringify(obliqueOctave)), obliqueOctave);

const tritave = fromCommas('245/243', '3.5.7', 'Computed CWE');
assert.deepEqual(checkLift(equivalencePolicy(tritave, 'period'), [-2, 5]).classCoordinate, [0, 5]);
assert.throws(() => equivalencePolicy(tritave, 'octave'), /requires prime 2/);
assert.throws(
  () =>
    equivalencePolicy(
      {
        basis: [3, 2, 5],
        rows: [
          [1, 0, 0],
          [0, 0, 1]
        ]
      },
      'octave'
    ),
  /zero mapped octave/
);
assert.throws(() => equivalencePolicy(meantone, 'reference'), /Choose exact/);
assert.throws(() => quotientCoordinate(period, [0, 0.5]), /safe integer/);
assert.throws(() => shapeKey(exact, []), /at least one/);
console.log(
  'Exact, period and mapped-octave quotients, lifts and translation-invariant shape keys passed.'
);
