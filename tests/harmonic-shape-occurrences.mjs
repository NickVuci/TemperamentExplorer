import assert from 'node:assert/strict';
import {makeState} from '../src/core/engine.mjs';
import {chordIdentity} from '../src/chords/chord-identity.mjs';
import {projectChord,projectCoordinateShape} from '../src/chords/chord-projection.mjs';
import {scaleMembership,searchShapeOccurrences,searchOccurrences} from '../src/chords/chord-occurrence.mjs';
import {analyzeShape} from '../src/chords/chord-analysis.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {equivalencePolicy} from '../src/harmonic/harmonic-equivalence.mjs';
import {validateTemperedShape} from '../src/harmonic/harmonic-types.mjs';
const s={...makeState('meantone'),n:7,mode:0},major=projectChord(s,chordIdentity('4:5:6')),raised=projectChord(s,chordIdentity('5:6:8'));
const shape=p=>p.shapeIdentities.octave;
const a=searchShapeOccurrences(s,shape(major)),b=searchShapeOccurrences(s,shape(raised));
assert.equal(a.shapeId,b.shapeId);
assert.deepEqual(a.completeOccurrences.map(row=>row.id).sort(),b.completeOccurrences.map(row=>row.id).sort(),'inversion aliases share occurrence truth');
assert.equal(a.completeOccurrences.length,3);assert.equal(a.tonicOccurrences.length,1);
assert.equal(searchShapeOccurrences(s,shape(major),{tonicOnly:true}).completeOccurrences.length,1);
for(const n of [5,7,19])for(const mode of [0,n-1]){
 const state={...s,n,mode},result=searchShapeOccurrences(state,shape(major)),membership=scaleMembership(state);
 assert.equal(result.shapeId,a.shapeId,'scale/mode changes never change harmonic shape identity');
 const brute=membership.notes.filter(root=>major.notes.every(note=>membership.notes.some(member=>member.generator===root.generator+note.coordinate[1]))).map(root=>root.degree);
 assert.deepEqual(result.completeOccurrences.map(row=>row.root),brute);
 for(const occurrence of result.completeOccurrences)for(const assignment of occurrence.assignments){
  const base=membership.notes[assignment.degree];
  assert.deepEqual(assignment.coordinate,[base.coordinate[0]+assignment.periodLift,base.coordinate[1]]);
  assert.deepEqual(assignment.relativeCoordinate,major.notes[assignment.member].coordinate);
 }
}
const rotated=searchShapeOccurrences({...s,mode:1},shape(major));
assert.notEqual(rotated.scaleId,a.scaleId);assert.notDeepEqual(rotated.completeOccurrences.map(row=>row.root),a.completeOccurrences.map(row=>row.root));
const etCoordinates=[[0,0],[-1,2],[0,1],[-1,3]],et=projectCoordinateShape(s,etCoordinates).identities.octave;
assert.equal(analyzeShape(s,et).occurrences.completeOccurrences.length,4);
assert.ok(searchShapeOccurrences(s,et).completeOccurrences.every(row=>row.assignments.every(member=>!('ratio' in member))), 'ET coordinates need no invented JI root');
const doubled=searchShapeOccurrences(s,{coordinates:[[0,0],[1,0],[1,0]]}).completeOccurrences[0];
assert.equal(doubled.requiredCardinality,1);assert.equal(doubled.voiceCount,3);assert.equal(new Set(doubled.degrees).size,1);
assert.deepEqual(doubled.assignments.map(member=>member.periodLift),[0,1,1]);
// DTO quotient classes cannot erase full source voices or require undeclared metadata.
const policy=equivalencePolicy(s,'octave'),dto={id:doubled.shapeId,mappingId:policy.mappingKey,
 equivalence:{kind:'octave',mappingKey:policy.mappingKey},coordinatesOrClasses:[[0,0]],
 sourceMemberLinks:[{memberIndex:2,coordinate:[1,0]},{memberIndex:0,coordinate:[0,0]},{memberIndex:1,coordinate:[1,0]}],cardinalities:[3]};
validateTemperedShape(dto);
const dtoOccurrence=searchShapeOccurrences(s,dto).completeOccurrences[0];
assert.equal(dtoOccurrence.id,doubled.id);assert.deepEqual(dtoOccurrence.coords,doubled.coords);assert.equal(dtoOccurrence.voiceCount,3);
assert.deepEqual(searchShapeOccurrences(s,{...dto,coordinates:[[0,0]]}).completeOccurrences[0].coords,doubled.coords,'full source links precede reduced coordinates');
const minimal={...dto,sourceMemberLinks:[],cardinalities:[1]};
assert.equal(searchShapeOccurrences(s,minimal).completeOccurrences[0].voiceCount,1);
assert.throws(()=>searchShapeOccurrences(s,{...minimal,cardinalities:[3]}),/full source member coordinates/);
const mutable={coordinates:[[0,0],[1,0]]},injected=scaleMembership(s),analyzed=analyzeShape(s,mutable,{membership:injected});
assert.equal(Object.isFrozen(mutable),false);assert.equal(Object.isFrozen(mutable.coordinates[0]),false);
assert.equal(Object.isFrozen(injected.notes[0].coordinate),false);
mutable.coordinates[0][0]=9;injected.notes[0].coordinate[0]=9;
assert.deepEqual(analyzed.shape.coordinates[0],[0,0]);
assert.deepEqual(analyzed.occurrences.completeOccurrences[0].assignments[0].degreeCoordinate,[0,0]);
const augmented={...fromCommas('128/125','2.3.5','Computed CWE'),n:2,mode:0},triad=projectChord(augmented,chordIdentity('1:5/4:25/16'));
assert.equal(triad.shapeIdentities.octave.cardinality,3);assert.equal(triad.shapeIdentities.period.cardinality,1);
const aug=searchShapeOccurrences(augmented,triad.shapeIdentities.octave).completeOccurrences[0];
assert.equal(aug.voiceCount,3);assert.equal(aug.requiredCardinality,1);
assert.equal(new Set(aug.assignments.map(member=>member.harmonicClass.key)).size,3,'octave residues survive shared scale degree membership');
const native={...fromCommas('245/243','3.5.7','Computed CWE'),n:7,mode:0};
const nat=searchShapeOccurrences(native,{coordinates:[[0,0],[1,0]],equivalence:'exact'});
assert.deepEqual(searchShapeOccurrences(native,projectCoordinateShape(native,[[0,0],[1,0]]).identities.native),nat,'canonical native-exact projection uses exact identity policy');
assert.equal(nat.completeOccurrences.length,7);assert.equal(nat.completeOccurrences[0].assignments[1].periodLift,1);
assert.throws(()=>searchShapeOccurrences(native,{coordinates:[[0,0],[1,0]],equivalence:'octave'}),/prime 2/);
assert.throws(()=>searchShapeOccurrences(s,{...shape(major),id:'wrong'}),/ID/);
assert.throws(()=>searchShapeOccurrences(s,{...shape(major),mappingId:'wrong'}),/mapping/);
// Existing identifiers and the frozen corpus remain intentionally compatible.
const old=searchOccurrences(s,major);assert.ok(old.completeOccurrences.every(row=>row.id.startsWith('occ2:')&&row.shapeOccurrenceId.startsWith('shape-occurrence-v1:')));
console.log('Shared shape occurrences preserve alias truth, tonic status, full voices, octave residues and native periods.');
