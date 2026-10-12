import assert from 'node:assert/strict';
import {physicalKey} from '../src/hexboard/hexboard.mjs';
import {
  axialCell,
  canonicalGeometricShape,
  geometricShapeForKeys,
  physicalDistance,
  boardStructureKey,
  shapeOrientations
} from '../src/shapes/geometric-shapes.mjs';

const pattern = [
    [0, 0],
    [1, 0],
    [0, 2]
  ],
  shape = canonicalGeometricShape(pattern);
assert.equal(
  shape.id,
  canonicalGeometricShape([
    [5, -2],
    [5, 0],
    [6, -2]
  ]).id,
  'translation and input order do not change a physical pattern'
);
assert.deepEqual(shape.cells, [
  [0, 0],
  [0, 2],
  [1, 0]
]);
assert.deepEqual(
  shape.cellIndices,
  [0, 2, 1],
  'musical member order has an explicit link to canonical cells'
);
assert.notEqual(
  shape.id,
  canonicalGeometricShape(pattern.map(([q, r]) => [-r, q + r])).id,
  'a rotation is a different oriented pattern'
);
assert.notEqual(
  shape.id,
  canonicalGeometricShape(pattern.map(([q, r]) => [r, q])).id,
  'a reflection is a different oriented pattern'
);
// Optional orientation grouping lists the twelve lattice symmetries as their own exact IDs.
{
  const orientations = shapeOrientations(pattern),
    ids = orientations.map(o => o.id);
  assert.equal(ids[0], shape.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(orientations.length, 12, 'an asymmetric triangle has twelve orientations');
  assert.ok(
    ids.includes(canonicalGeometricShape(pattern.map(([q, r]) => [-r, q + r])).id) &&
      ids.includes(canonicalGeometricShape(pattern.map(([q, r]) => [r, q])).id)
  );
  for (const o of orientations)
    assert.deepEqual(
      o.cells.flatMap(a => o.cells.map(b => physicalDistance(a, b))).sort(),
      shape.cells.flatMap(a => shape.cells.map(b => physicalDistance(a, b))).sort(),
      'every orientation preserves physical distances'
    );
  assert.equal(
    shapeOrientations([
      [0, 0],
      [1, 0]
    ]).length,
    3,
    'a symmetric pair has three orientations'
  );
  assert.equal(shapeOrientations([[0, 0]]).length, 1);
}
assert.equal(
  canonicalGeometricShape([
    [0, 0],
    [0, 0],
    [1, 0]
  ]).cells.length,
  2,
  'one physical cell is not duplicated by voice multiplicity'
);
assert.deepEqual(axialCell(physicalKey(65)), [2, 6]);
const board = {
  keys: Array.from({length: 140}, (_, i) => ({...physicalKey(i), enabled: i % 20 !== 0, m: [i, 0]}))
};
const even = geometricShapeForKeys(board, [65, 66, 75]),
  odd = geometricShapeForKeys(board, [75, 76, 86]);
assert.equal(
  even.id,
  odd.id,
  'translation across row parity uses axial rather than raw column coordinates'
);
for (const [q, r] of [
  [1, 0],
  [0, 1],
  [-1, 1]
])
  assert.equal(physicalDistance([0, 0], [q, r]), 1);
assert.ok(Math.abs(physicalDistance([0, 0], [1, 1]) - Math.sqrt(3)) < 1e-12);
assert.equal(shape.metrics.reach, 2);
assert.equal(shape.metrics.span, 2);
assert.equal(shape.metrics.score, 100 / (1 + shape.metrics.span + shape.metrics.meanPairDistance));
const signature = boardStructureKey(board),
  tuned = {keys: board.keys.map(key => ({...key, c: key.index * 12, color: '#abcdef'}))};
assert.equal(
  boardStructureKey(tuned),
  signature,
  'pitch and presentation do not rename a structural board'
);
tuned.keys[65].m = [1, 1];
assert.notEqual(boardStructureKey(tuned), signature);
assert.throws(() => canonicalGeometricShape([]), /at least one/);
assert.throws(() => canonicalGeometricShape([{x: 1, y: 0}]), /integer axial/);
assert.throws(() => geometricShapeForKeys(board, [999]), /absent/);
console.log(
  'Geometric shapes preserve orientation, translation across staggered rows, member links and physical-distance units.'
);
