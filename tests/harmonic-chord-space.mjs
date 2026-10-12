import assert from 'node:assert/strict';
import {makeState, targetSet} from '../src/core/engine.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {mappingContext} from '../src/harmonic/harmonic-context.mjs';
import {buildDyadIndex} from '../src/harmonic/harmonic-dyad-graph.mjs';
import {assessET} from '../src/harmonic/harmonic-et.mjs';
import {projectChord} from '../src/chords/chord-projection.mjs';
import {chordIdentity} from '../src/chords/chord-identity.mjs';
import {harmonicIdentity} from '../src/harmonic/harmonic-equivalence.mjs';
import {
  classifyChordSpace,
  enumerateJIChordSpace,
  temperedImage,
  chordDyads
} from '../src/harmonic/harmonic-chord-space.mjs';

const indexFor = (state, oddLimit) =>
  buildDyadIndex(
    targetSet({
      oddLimit,
      primeFilter: null,
      mappingSubgroup: state.basis,
      representationPolicy: state.basis.includes(2) ? 'octave' : 'native-exact'
    }),
    mappingContext(state)
  );

// The 9-odd-limit 7-limit JI chords up to transposition, counted independently of this module.
const septimal = makeState('septimal'),
  nine = enumerateJIChordSpace(indexFor(septimal, 9));
const bySize = {};
for (const chord of nine.chords) bySize[chord.size] = (bySize[chord.size] ?? 0) + 1;
assert.deepEqual(bySize, {2: 9, 3: 19, 4: 12, 5: 2});
assert.equal(nine.complete, true);
const family = input => harmonicIdentity(chordIdentity(input), 'octave').familyId;
assert.ok(
  nine.chords.some(
    chord => family(chord.members.map(member => member.ratio).join(':')) === family('4:5:6:7')
  ),
  '4:5:6:7 is a 9-limit JI chord'
);
assert.equal(
  enumerateJIChordSpace(indexFor(makeState('septimal'), 9)),
  nine,
  'JI chord space is cached by target set and basis'
);
const porcupine = fromCommas('250/243', '2.3.5', 'Computed CWE'),
  wide = enumerateJIChordSpace(indexFor(makeState('meantone'), 15), {sizes: [2, 3, 4, 5]}),
  narrow = enumerateJIChordSpace(indexFor(porcupine, 15), {sizes: [3]});
assert.ok(
  narrow.chords.length &&
    narrow.chords.every(chord => chord.size === 3 && wide.chords.includes(chord)),
  'temperaments sharing a basis and size ranges inside a computed range reuse one JI enumeration'
);

// Mapping identity ignores paired prime-column permutations, but interpretation monzos use the
// caller's working basis order. Cached chord-space records must preserve that order.
for (const mapping of [
  makeState('meantone'),
  {
    basis: [2, 5, 3],
    rows: [
      [1, 0, 1],
      [0, 4, 1]
    ]
  }
]) {
  const index = indexFor(mapping, 9),
    space = classifyChordSpace(index, {sizes: [3]});
  for (const shape of space.shapes)
    for (const chord of shape.interpretations)
      assert.equal(
        temperedImage(chord, index).id,
        shape.id,
        'cached JI monzos map correctly after paired basis-column permutation'
      );
}

// Image lookup must agree with the per-shape coherent JI lift proof, including native-exact subgroups.
for (const [state, oddLimit, sizes] of [
  [makeState('meantone'), 9, [2, 3, 4, 5]],
  [makeState('meantone'), 27, [3, 4]],
  [septimal, 15, [2, 3, 4]],
  [fromCommas('250/243', '2.3.5', 'Computed CWE'), 15, [3, 4, 5]],
  [fromCommas('245/243', '3.5.7', 'Computed CWE'), 9, [2, 3, 4]],
  [makeState('mohajira'), 15, [3]],
  [makeState('mohajira'), 27, [3]],
  [
    {
      name: 'Vertical octave',
      basis: [3, 2, 5],
      rows: [
        [1, 0, -1],
        [0, 1, 4]
      ]
    },
    9,
    [2, 3, 4]
  ],
  [
    {
      name: 'Tilted octave',
      basis: [3, 2, 5],
      rows: [
        [1, 1, 0],
        [0, -1, 4]
      ]
    },
    9,
    [2, 3, 4]
  ],
  [
    {
      name: 'Divided tilted octave',
      basis: [3, 2, 5],
      rows: [
        [1, 2, 1],
        [0, 2, 3]
      ]
    },
    9,
    [2, 3, 4]
  ]
]) {
  const index = indexFor(state, oddLimit),
    space = classifyChordSpace(index, {sizes});
  assert.equal(space.complete, true);
  assert.equal(space.counts.unknown, 0);
  assert.equal(space.counts.unenumeratedImages, 0);
  for (const shape of space.shapes) {
    const proof = assessET(shape.shape, index);
    assert.equal(proof.complete, true);
    assert.equal(
      shape.status === 'ji' ? 'ji-liftable' : shape.status,
      proof.status,
      `${state.name} ${oddLimit}-limit shape ${shape.id}`
    );
    for (const chord of shape.interpretations)
      assert.equal(
        temperedImage(chord, index).id,
        shape.id,
        'every attached JI chord maps onto its shape'
      );
  }
}

// The didymic tetrad is ET at the 9-limit and JI once 27/16 joins the target set.
const meantone = makeState('meantone'),
  didymic = projectChord(meantone, chordIdentity('1:9/8:3/2:5/3')).shapeIdentities.octave.id;
const status = limit =>
  classifyChordSpace(indexFor(meantone, limit), {sizes: [4]}).shapes.find(
    shape => shape.id === didymic
  )?.status;
assert.equal(status(9), 'essentially-tempered');
assert.equal(status(27), 'ji');

// A diamond spelling is not a coherent in-limit JI chord merely because its root intervals are
// in the target set. Mohajira equates 11/9 and 27/22 by 243/242; the exact 18:22:27 chord needs
// the pairwise interval 27/22, which first enters the odd-limit target set at 27.
const mohajira = makeState('mohajira'),
  diamondInput = '1/1:11/9:3/2',
  etSpelling = '1/1:4/3:18/11';
const diamondShape = projectChord(mohajira, chordIdentity(diamondInput)).shapeIdentities.octave.id;
assert.equal(
  projectChord(mohajira, chordIdentity(etSpelling)).shapeIdentities.octave.id,
  diamondShape
);
assert.notEqual(
  family(diamondInput),
  family(etSpelling),
  'tempered equality does not make these exact JI chords inversions'
);
for (const limit of [11, 15, 25, 27]) {
  const index = indexFor(mohajira, limit),
    space = classifyChordSpace(index, {sizes: [3]}),
    shape = space.shapes.find(item => item.id === diamondShape);
  assert.equal(space.complete, true);
  const targets = index.vertices.flatMap(vertex => vertex.interpretations).map(item => item.ratio);
  assert.ok(targets.includes('11/9') && targets.includes('3/2'));
  assert.equal(targets.includes('27/22'), limit >= 27);
  assert.equal(
    shape.status,
    limit >= 27 ? 'ji' : 'essentially-tempered',
    `Mohajira 18:22:27 at odd limit ${limit}`
  );
  assert.equal(
    assessET(shape.shape, index).status,
    limit >= 27 ? 'ji-liftable' : 'essentially-tempered'
  );
  assert.equal(
    shape.interpretations.some(
      chord => family(chord.members.map(member => member.ratio).join(':')) === family(diamondInput)
    ),
    limit >= 27
  );
}

// Every pair of a shape lists the JI intervals mapped to its tempered class.
const index = indexFor(meantone, 9),
  et = classifyChordSpace(index, {sizes: [4]}).shapes.find(shape => shape.id === didymic);
const dyads = chordDyads(et.shape, index);
assert.equal(dyads.length, 6);
assert.ok(
  dyads.every(
    dyad =>
      dyad.interpretations.length > 0 &&
      dyad.interpretations.every(item => Number.isFinite(item.idealCents))
  )
);
assert.ok(
  dyads.some(dyad => dyad.interpretations.length > 1),
  'the comma merges JI intervals on at least one pair'
);

// Tempering that merges two members (25/24 is inside the 25-limit) leaves no image rather than a smaller chord.
const dicot = fromCommas('25/24', '2.3.5', 'Computed CWE'),
  dicotIndex = indexFor(dicot, 25);
const merged = enumerateJIChordSpace(dicotIndex, {sizes: [3]}).chords.find(
  chord => family(chord.members.map(member => member.ratio).join(':')) === family('1/1:6/5:5/4')
);
assert.ok(merged);
assert.equal(temperedImage(merged, dicotIndex), null);
assert.ok(classifyChordSpace(dicotIndex, {sizes: [3]}).counts.degenerateJIChords > 0);

const heptads = classifyChordSpace(indexFor(septimal, 15), {sizes: [7]});
assert.equal(heptads.complete, true);
assert.ok(heptads.shapes.every(shape => shape.size === 7));
assert.throws(() => classifyChordSpace(index, {sizes: [1]}), /sizes/);
assert.throws(() => classifyChordSpace(index, {sizes: [9]}), /sizes/);
console.log(
  'Chord space enumerates JI chords per target set and classifies every dyadic shape by image lookup, matching the JI lift proof.'
);
