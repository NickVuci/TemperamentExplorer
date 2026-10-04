import assert from 'node:assert/strict';
import {chordIdentity as id} from '../dist/chord-identity-v2.mjs';
import {dualIdentity,harmonicIdentity} from '../dist/harmonic-equivalence.mjs';
import {mul,rational} from '../dist/rational.mjs';

const source=id('4:5:6'),originalFingerprint=source.fingerprint;
const major=harmonicIdentity(source,'octave');
for(const spelling of ['5:6:8','2:5:6','16:5:12','4:10:6','8:10:12']){
 const other=harmonicIdentity(id(spelling),'octave');
 assert.equal(other.familyId,major.familyId,`${spelling} shares the octave family`);
 if(spelling!=='8:10:12')assert.notEqual(other.exactId,major.exactId);
}
assert.equal(source.fingerprint,originalFingerprint,'existing exact identity remains unchanged');
assert.equal(harmonicIdentity(source,'exact').exactId,source.fingerprint);
assert.notEqual(harmonicIdentity(source,'exact').familyId,harmonicIdentity(id('5:6:8'),'exact').familyId);

for(const member of major.members){
 const classLabel=major.familyRatios[member.familyIndex];
 const [an,ad]=major.anchorExactRatio.split('/').map(BigInt);
 const [cn,cd]=classLabel.split('/').map(BigInt);
 const shifted=member.octaveLift>=0?rational(2n**BigInt(member.octaveLift)):rational(1n,2n**BigInt(-member.octaveLift));
 const recovered=mul(mul(rational(an,ad),rational(cn,cd)),shifted);
 assert.deepEqual(recovered,member.exactRatio.split('/').map(BigInt),'member link reconstructs exact normalized spelling');
}
assert.deepEqual(major.members.map(m=>m.inputIndex),[0,1,2]);
assert.equal(major.exactCardinality,3);
assert.equal(major.inputCardinality,3);

const dual=dualIdentity(major);
assert.notEqual(dual.familyId,major.familyId,'otonal and reciprocal utonal families stay distinct');
assert.equal(major.dualFamilyId,dual.familyId);
assert.equal(dual.dualFamilyId,major.familyId);
assert.equal(dualIdentity(dual).familyId,major.familyId);
assert.equal(dualIdentity(source,'octave').familyId,dual.familyId);
const reciprocal=harmonicIdentity(id('1/6:5:4'),'octave');
assert.equal(reciprocal.familyId,dual.familyId);

const octaveDyad=harmonicIdentity(id('1:2'),'octave');
assert.equal(octaveDyad.inputCardinality,2);
assert.equal(octaveDyad.exactCardinality,2);
assert.equal(octaveDyad.classCardinality,1);
assert.deepEqual(octaveDyad.members.map(m=>m.familyIndex),[0,0]);
assert.deepEqual(octaveDyad.members.map(m=>m.octaveLift),[0,1]);
const doubled=harmonicIdentity(id('4:4:5:6'),'octave');
assert.equal(doubled.familyId,major.familyId);
assert.equal(doubled.inputCardinality,4);
assert.equal(doubled.exactCardinality,3);
assert.equal(doubled.doublings,1);
assert.equal(doubled.members[0].familyIndex,doubled.members[1].familyIndex);

const native=harmonicIdentity(id('3:5:7'),'exact');
assert.equal(native.classCardinality,3);
assert.notEqual(native.familyId,harmonicIdentity(id('6:5:7'),'exact').familyId);
assert.deepEqual(JSON.parse(JSON.stringify(major)),major,'family DTO is JSON-safe');
assert.throws(()=>harmonicIdentity(source),/explicit/);
assert.throws(()=>harmonicIdentity(source,'period'),/explicit/);
assert.throws(()=>dualIdentity(major,'exact'),/same JI family policy/);
console.log('JI octave families, exact spellings, member lifts, doublings and reciprocal duals passed.');
