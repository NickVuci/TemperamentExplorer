// The one-hand ergonomic model: fingerings, strain counted from the natural hand, grades, the left
// hand as a mirror image, two-key presses, disabled fingers and board rotation. Fixture fingerings
// and strains were produced by the reference implementation this module was ported from.
import assert from 'node:assert/strict';
import {
  createHandRater,
  handBasis,
  handModelDefaults,
  normalizeHandModel
} from '../src/shapes/hand-model.mjs';

const near = (actual, expected, tolerance = 0.06) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${expected}`);
const right = createHandRater(handModelDefaults(), {hand: 'R'}),
  left = createHandRater(handModelDefaults(), {hand: 'L'}),
  doubling = createHandRater({...handModelDefaults(), double: true}, {hand: 'R'});
const shapes = {
  tri: [
    [0, 0],
    [1, 0],
    [1, -1]
  ],
  triDown: [
    [0, 0],
    [1, -1],
    [0, -1]
  ],
  wedge: [
    [0, 0],
    [2, 0],
    [1, -1]
  ],
  wedgeFlip: [
    [0, 0],
    [-2, 0],
    [0, -1]
  ],
  bar5: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0]
  ],
  home: [
    [0, 0],
    [1, -2],
    [2, -2],
    [3, -2],
    [4, -2]
  ],
  rhomb: [
    [0, 0],
    [1, 0],
    [1, -1],
    [2, -1]
  ]
};

// Board axes as the player sees them: x right, y away. A quarter turn moves q onto the y axis.
near(handBasis(0)[0][0], 1, 1e-12);
near(handBasis(0)[0][1], 0, 1e-12);
near(handBasis(0)[1][0], 0.5, 1e-12);
near(handBasis(0)[1][1], -Math.sqrt(3) / 2, 1e-12);
near(handBasis(1)[0][1], -1, 1e-12);

// Natural-hand baselines per key count, and the resting hand itself scoring zero.
[0, 5.2, 8.7, 11.4, 20.7].forEach((value, i) => near(right.baseline(i + 1), value));
const home = right.rate(shapes.home);
assert.deepEqual(home.fingers, [1, 2, 3, 4, 5]);
assert.equal(home.grade, 'A');
near(home.strain, 0, 1e-9);
near(home.turn, 5);
assert.equal(home.tier, 0);

// Right-hand fixtures: fingers, grade, strain above the natural hand.
for (const [name, fingers, grade, strain] of [
  ['tri', [1, 3, 2], 'B', 68],
  ['triDown', [1, 3, 2], 'B', 38.8],
  ['wedge', [2, 4, 3], 'B', 30],
  ['wedgeFlip', [4, 2, 3], 'B', 32.9],
  ['bar5', [1, 2, 3, 4, 5], 'B', 38.5],
  ['rhomb', [2, 1, 3, 4], 'B', 87.5]
]) {
  const rated = right.rate(shapes[name]);
  assert.deepEqual(rated.fingers, fingers, name);
  assert.equal(rated.grade, grade, name);
  near(rated.strain, strain);
  assert.ok(
    rated.alternatives.every(other => other.strain >= rated.strain - 1e-9),
    name
  );
}

// The left hand is the mirror image: the mirrored cells take the same fingers and strain.
const mirror = ([q, r]) => [-q - r, r];
for (const [name, cells] of Object.entries(shapes)) {
  const a = right.rate(cells),
    b = left.rate(cells.map(mirror));
  assert.deepEqual(b.fingers, a.fingers, name);
  near(b.strain, a.strain, 1e-9);
}
assert.deepEqual(left.rate(shapes.wedge).fingers, [4, 2, 3]);
assert.equal(left.rate(shapes.home).grade, 'B');

// Translation does not change a rating.
const moved = shapes.wedge.map(([q, r]) => [q + 7, r - 3]);
assert.deepEqual(right.rate(moved).fingers, right.rate(shapes.wedge).fingers);
near(right.rate(moved).strain, right.rate(shapes.wedge).strain, 1e-9);

// Two touching keys under one finger: only when allowed, only on touching keys, at most two each.
assert.deepEqual(right.rate(shapes.tri).doubled, []);
const pressed = doubling.rate(shapes.tri);
assert.deepEqual(pressed.fingers, [2, 3, 3]);
assert.deepEqual(pressed.doubled, [3]);
near(pressed.strain, 34.8);
assert.deepEqual(doubling.rate(shapes.wedge).fingers, [2, 4, 3]);
const six = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [4, 0],
  [5, 0]
];
assert.equal(right.rate(six), null);
assert.deepEqual(doubling.rate(six).fingers, [1, 1, 2, 3, 4, 5]);
const apart = [
  [0, 0],
  [2, 0],
  [4, 0],
  [6, 0],
  [8, 0],
  [10, 0]
];
assert.equal(doubling.rate(apart), null);

// Disabled fingers are never used; keys beyond the fingers left are not rated.
const fingers = handModelDefaults().fingers.map((finger, i) => ({...finger, on: i !== 0}));
const noThumb = createHandRater({...handModelDefaults(), fingers}, {hand: 'R'});
assert.ok(!noThumb.rate(shapes.tri).fingers.includes(1));
assert.equal(noThumb.rate(shapes.bar5), null);

// Every key count keeps a grade-A position across hand sizes, key spacings, hands and board turns:
// the model's own natural position rates zero by construction, so some shape must reach A.
for (const spacing of [12, 20, 30])
  for (const scale of [70, 100, 130])
    for (const hand of ['R', 'L'])
      for (const rotation of [0, 1]) {
        const rater = createHandRater({...handModelDefaults(), spacing, scale}, {hand, rotation});
        for (let n = 1; n <= 5; n++) assert.ok(rater.baseline(n) >= 0);
        assert.ok(rater.rate([[0, 0]]).grade === 'A');
      }

// A quarter turn changes which shapes are easy: a row becomes a column.
const turned = createHandRater(handModelDefaults(), {hand: 'R', rotation: 1});
assert.notEqual(turned.rate(shapes.bar5).strain, right.rate(shapes.bar5).strain);

// Input checks and tolerant normalization of saved models.
assert.throws(
  () =>
    right.rate([
      [0, 0],
      [0, 0]
    ]),
  /distinct/
);
assert.throws(() => createHandRater(handModelDefaults(), {hand: 'X'}), /hand/);
const saved = normalizeHandModel({scale: 9999, spacing: 'wide', grades: [5, 4, 3], double: true});
assert.equal(saved.scale, 150);
assert.equal(saved.spacing, 20);
assert.deepEqual(saved.grades, [30, 90, 170]);
assert.equal(saved.double, true);
const none = handModelDefaults().fingers.map(finger => ({...finger, on: false}));
assert.ok(normalizeHandModel({fingers: none}).fingers[1].on);

console.log(
  'Hand model: natural baselines, fixtures, mirror hands, two-key presses, disabled fingers and saved-model normalization passed.'
);
