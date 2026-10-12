import assert from 'node:assert/strict';
import {chordIdentity as id} from '../src/chords/chord-identity.mjs';
import {projectChord, projectCoordinateShape} from '../src/chords/chord-projection.mjs';
import {mapRatio} from '../src/core/engine.mjs';
import {makeState} from '../src/core/catalog.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
const s = makeState('meantone'),
  a = projectChord(s, id('4:5:6'), {tolerance: 0});
assert.equal(a.basisStatus, 'mapped');
assert.equal(a.qualityStatus, 'above-tolerance');
assert.equal(projectChord(s, id('4:5:6'), {tolerance: 100}).qualityStatus, 'within-tolerance');
assert.deepEqual(
  a.notes.map(n => n.coordinate),
  [
    [0, 0],
    [-2, 4],
    [0, 1]
  ]
);
assert.equal(a.shapeIdentities.exact.cardinality, 3);
assert.equal(a.shapeIdentities.period.cardinality, 3);
assert.equal(a.shapeIdentities.octave.cardinality, 3);
assert.equal(a.memberLinks.length, 3);
assert.equal(a.legacyCardinalityEquivalence, 'period');
assert.equal(projectChord(s, id('4:5:6:11')).basisStatus, 'outside-basis');
assert.equal(projectChord(s, id('4:5:6:11')).notes[3].coordinate, null);
const collapse = projectChord(s, id('1:81/80'));
assert.equal(collapse.cardinalityStatus, 'collapsed');
assert.equal(collapse.temperedCardinality, 1);
assert.deepEqual(collapse.collisionGroups[0].members, [0, 1]);
assert.equal(collapse.shapeIdentities.exact.cardinality, 1);
assert.deepEqual(
  collapse.memberLinks.map(link => link.exactClassIndex),
  [0, 0]
);
assert.equal(projectChord(s, id('6:4:5')).temperedFingerprint, a.temperedFingerprint);
const octaveDyad = projectChord(s, id('1:2'));
assert.equal(octaveDyad.shapeIdentities.exact.cardinality, 2);
assert.equal(octaveDyad.shapeIdentities.period.cardinality, 1);
assert.equal(octaveDyad.shapeIdentities.octave.cardinality, 1);
const octaveFamily = a.harmonicIdentity.familyId;
assert.equal(
  projectChord(s, id('5:6:8')).harmonicIdentity.familyId,
  octaveFamily,
  'independent octave displacement preserves harmonic family'
);
const utonal = projectChord(s, id('1/6:1/5:1/4'));
assert.equal(utonal.harmonicIdentity.familyId, a.dualFamilyId);
assert.equal(
  utonal.dualFamilyId,
  octaveFamily,
  'otonal and utonal families are linked as duals, not collapsed'
);
for (let x = 1; x < 8; x++) {
  const m = mapRatio(3 ** x, 2 ** x, s);
  assert.deepEqual(
    m,
    mapRatio(3, 2, s).map(v => v * x)
  );
}
assert.equal(
  projectChord({...s, g: (s.p * 7) / 12}, id('1:3/2')).cardinalityStatus,
  'preserved',
  'EDO tuning does not lower formal rank'
);
assert.throws(() => projectChord(s, id('4:5:6'), {tolerance: -1}));

const augmented = fromCommas('128/125', '2.3.5', 'Computed CWE');
const augmentedShape = projectCoordinateShape(augmented, [
  [0, 0],
  [1, 0],
  [2, 0]
]);
assert.equal(augmentedShape.identities.exact.cardinality, 3);
assert.equal(augmentedShape.identities.period.cardinality, 1);
assert.equal(
  augmentedShape.identities.octave.cardinality,
  3,
  'three equal-period residues remain distinct modulo the mapped octave'
);
assert.deepEqual(
  augmentedShape.memberLinks.map(link => link.octaveClassIndex),
  [0, 1, 2]
);

const pajara = projectCoordinateShape(makeState('pajara7'), [
  [0, 0],
  [2, 0],
  [1, 0]
]);
assert.equal(pajara.identities.exact.cardinality, 3);
assert.equal(pajara.identities.period.cardinality, 1);
assert.equal(pajara.identities.octave.cardinality, 2, 'Pajara octave is two periods');
assert.equal(
  pajara.memberLinks[0].octaveClassIndex,
  pajara.memberLinks[1].octaveClassIndex,
  'members separated by an octave share a class'
);
assert.notEqual(pajara.memberLinks[0].octaveClassIndex, pajara.memberLinks[2].octaveClassIndex);

const native = projectCoordinateShape(fromCommas('245/243', '3.5.7', 'Computed CWE'), [
  [0, 0],
  [1, 0],
  [0, 1]
]);
assert.equal(native.identities.octave.available, false, 'unmapped octave must stay unavailable');
assert.equal(native.identities.native.available, true);
assert.equal(native.identities.native.cardinality, 3);
