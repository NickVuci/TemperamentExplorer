import assert from 'node:assert/strict';
import {makeState} from '../dist/engine.mjs';
import {fromCommas} from '../dist/tuning.mjs';
import {targetSet} from '../dist/ji-limit-engine.mjs';
import {chordIdentity} from '../dist/chord-identity-v2.mjs';
import {harmonicIdentity} from '../dist/harmonic-equivalence.mjs';
import {harmonicLines,enumerateJISubsets,analyzeJIDyads,curatedJIChords,simplestRotation,orientedJIInterpretation,maxOddHarmonic} from '../dist/harmonic-ji-chords.mjs';

const limits=(state,oddLimit,representationPolicy='octave',primeFilter=state.basis)=>({
 oddLimit,primeFilter,mappingSubgroup:state.basis,representationPolicy
});
const meantone=makeState('meantone'),l5Spec=limits(meantone,5),l5=harmonicLines(meantone,l5Spec);
const majorFamily=harmonicIdentity(chordIdentity('4:5:6'),'octave');
const l5Otonal=l5.lines.find(line=>line.form==='otonal'),l5Utonal=l5.lines.find(line=>line.form==='utonal');
assert.ok(l5Otonal&&l5Utonal);assert.deepEqual(l5Otonal.partialNumbers,[1,3,5]);
assert.equal(l5Otonal.familyId,majorFamily.familyId,'the source-axis 1:3:5 line is the same octave family as 4:5:6');
assert.notEqual(l5Otonal.identity.fingerprint,chordIdentity('4:5:6').fingerprint,'exact odd-axis spelling is preserved independently from its family');
const curatedMajor=curatedJIChords().find(chord=>chord.label==='4:5:6');
const curatedMajorDual=curatedJIChords().find(chord=>chord.identity.fingerprint===curatedMajor.exactDualId);
assert.equal(curatedMajor.familyId,l5Otonal.familyId);assert.equal(curatedMajorDual.familyId,l5Utonal.familyId);
assert.equal(l5Utonal.familyId,majorFamily.dualFamilyId);assert.equal(l5Otonal.dualFamilyId,l5Utonal.familyId);
assert.equal(chordIdentity(l5Utonal.label).fingerprint,l5Utonal.identity.fingerprint,'compact utonal spelling is the exact dual');
assert.equal(l5Otonal.dyadAssessment.dyadic,true);assert.equal(l5Otonal.sourceCells.length,3);
assert.deepEqual(l5Otonal.sourceAxisRows.map(axis=>axis.denominatorAxis),[1,3,5]);
assert.deepEqual(l5Otonal.members.map(member=>member.coordinate),[[0,0],[1,1],[0,4]]);

const l7State=makeState('miracle11'),l7Spec=limits(l7State,7),l7=harmonicLines(l7State,l7Spec);
const seventhFamily=harmonicIdentity(chordIdentity('4:5:6:7'),'octave');
const l7Line=l7.lines.find(line=>line.form==='otonal');
assert.deepEqual(l7Line.partialNumbers,[1,3,5,7]);assert.equal(l7Line.familyId,seventhFamily.familyId);

const magic=makeState('magic11'),l11Spec=limits(magic,11),l11=harmonicLines(magic,l11Spec);
const magicHexadFamily=harmonicIdentity(chordIdentity('4:5:6:7:9:11'),'octave');
const l11Line=l11.lines.find(line=>line.form==='otonal');
assert.deepEqual(l11Line.partialNumbers,[1,3,5,7,9,11]);assert.equal(l11Line.familyId,magicHexadFamily.familyId);
const fullHexad=enumerateJISubsets(l11,{lineId:l11Line.id,size:6,pageSize:1});
assert.equal(fullHexad.items[0].familyId,magicHexadFamily.familyId);assert.equal(fullHexad.items[0].dyadicAssessment.dyadic,true);
assert.throws(()=>enumerateJISubsets(l11,{lineId:l11Line.id,minSize:7,maxSize:8}),/explicit single-size/);
const sevenOnly=enumerateJISubsets(l11,{lineId:l11Line.id,size:7,pageSize:4});assert.equal(sevenOnly.totalCombinations,0);

const firstPage=enumerateJISubsets(l11,{lineId:l11Line.id,size:3,pageSize:2});
assert.equal(firstPage.complete,false);assert.ok(firstPage.nextCursor);
const secondPage=enumerateJISubsets(l11,{lineId:l11Line.id,size:3,pageSize:2,cursor:firstPage.nextCursor});
const allTriads=enumerateJISubsets(l11,{lineId:l11Line.id,size:3,pageSize:20});
assert.deepEqual([...firstPage.items,...secondPage.items].map(item=>item.id),allTriads.items.slice(0,4).map(item=>item.id),'cursor resumes deterministically without repeats');
assert.throws(()=>enumerateJISubsets(l11,{lineId:l11Line.id,size:4,cursor:firstPage.nextCursor}),/does not match/);

const highSpec=limits(magic,31),high=harmonicLines(magic,highSpec),large=high.collections.find(collection=>collection.form==='otonal'&&collection.partialNumbers.length>8);
assert.ok(large,'large source line remains a collection');assert.equal(large.identity,null);assert.equal(large.completeAsChord,false);
assert.ok(large.partialNumbers.length>8);assert.equal(large.collectionReason,'over-eight-members');
const largePage=enumerateJISubsets(high,{lineId:large.id,size:7,pageSize:3});
assert.equal(largePage.items.length,3);assert.equal(largePage.totalCombinations,120);assert.ok(largePage.nextCursor);

const custom=analyzeJIDyads('1/5,1,5',l5Spec,meantone);
assert.equal(custom.dyadic,false);assert.equal(custom.status,'limit-failure');assert.equal(custom.edges.length,3);
assert.equal(custom.edges.filter(edge=>edge.status==='mapped').length,2);
assert.equal(custom.limitFailures.length,1);assert.equal(custom.limitFailures[0].reason,'odd-limit');
assert.equal(custom.mappingFailures.length,0,'a dyad outside the selected limit is not described as an unmapped ratio');
const repeated=analyzeJIDyads('1:1',l5Spec,meantone);assert.equal(repeated.status,'degenerate');assert.equal(repeated.dyadic,false);
const outsideBasis=analyzeJIDyads('1,7/4',limits(meantone,7,'octave',null),meantone);
assert.equal(outsideBasis.status,'mapping-failure');assert.deepEqual(outsideBasis.mappingFailures[0].missingPrimes,[7]);
const widenedAxes=harmonicLines(meantone,limits(meantone,7,'octave',null));
assert.ok(widenedAxes.bounds.sourceCellCounts.mappingFailure>0,'outside-subgroup source cells remain diagnosable');
const primeFilteredAxes=harmonicLines(meantone,limits(meantone,7,'octave',[2,3]));
assert.ok(primeFilteredAxes.bounds.excludedByTargetLimits>0,'filtered target cells are reported separately from unmapped cells');

const tritave=fromCommas('245/243','3.5.7','Computed CWE'),nativeSpec=limits(tritave,15,'native-exact',[3,5,7]);
const native=harmonicLines(tritave,nativeSpec),nativeOtonal=native.lines.find(line=>line.form==='otonal');
assert.ok(nativeOtonal);assert.deepEqual(nativeOtonal.partialNumbers,[1,3,5,7,9,15]);
assert.throws(()=>harmonicLines(tritave,limits(tritave,15,'octave',[3,5,7])),/native-exact/);

const originalSet=targetSet(l5Spec),permutedSet={...originalSet,targets:[...originalSet.targets].reverse().map(target=>({...target,sourcePairs:[...target.sourcePairs].reverse()}))};
const permuted=harmonicLines(meantone,permutedSet,{cache:false}),permutedLine=permuted.lines.find(line=>line.form==='otonal');
assert.deepEqual(permutedLine.partialNumbers,l5Otonal.partialNumbers);
assert.deepEqual(permutedLine.sourceAxisRows,l5Otonal.sourceAxisRows,'axis and cell provenance is stable under target/source ordering');
assert.equal(permutedLine.familyId,l5Otonal.familyId);

// Octave doublings and rotations are one chord. Even-rooted harmonic runs (2n:2n+1:…) win, then the smallest terms.
const rotation=(input,octave=true)=>{const best=simplestRotation(chordIdentity(input),octave);return best&&orientedJIInterpretation(best.spelling,{kind:'test'}).preferredLabel;};
for(const input of ['4:5:6','5:6:8','3:4:5','1:3:5','2:3:4:5:6'])assert.equal(rotation(input),'4:5:6',input);
for(const input of ['10:12:15','1/6:5:4','1/8:6:5:4'])assert.equal(rotation(input),rotation('10:12:15'),input);
assert.equal(rotation('4:6:7'),'6:7:8');assert.equal(rotation('10:12:15'),'1/6:5:4','minor pairs with the major run');assert.equal(rotation('3:5:7'),'5:6:7','without an even-rooted run the smallest terms win');assert.equal(rotation('2:3:4'),'2:3','a doubled fifth is the two-note chord');
assert.notEqual(rotation('4:5:6'),rotation('10:12:15'),'major and minor stay distinct');
assert.equal(simplestRotation(chordIdentity('1:2'),true),null,'a single pitch class has no chord');

// Ambitonal means self-reciprocal; otherwise the lower maximum odd harmonic is the otonal side.
assert.equal(maxOddHarmonic(['8','9','10','12']),9n);
const formOf=input=>orientedJIInterpretation(input,{kind:'test'});
assert.equal(formOf('4:5:6').presentationForm,'otonal');assert.equal(formOf('10:12:15').presentationForm,'utonal');assert.equal(formOf('10:12:15').preferredLabel,'1/6:5:4');
assert.equal(formOf('8:9:10:12').presentationForm,'otonal','max odd 9 beats the reciprocal 30:36:40:45 at 45');
assert.equal(formOf('1:3:9').presentationForm,'self');assert.equal(formOf('1:3:9').preferredLabel,'1:3:9','ambitonal chords are written otonally');
assert.deepEqual(['1:3:15','1:5:15'].map(input=>formOf(input).presentationForm),['otonal','utonal'],'equal maxima are not ambitonal unless self-reciprocal');
const fifthPair=curatedJIChords().filter(row=>row.pairId===curatedJIChords().find(row=>row.label==='2:3:4').pairId);
assert.deepEqual(fifthPair.map(row=>[row.label,row.form]),[['2:3:4','otonal'],['1/4:3:2','utonal']]);

console.log('Target-derived harmonic axes, reciprocal families, bounded subsets, dyad failures and source provenance passed.');
