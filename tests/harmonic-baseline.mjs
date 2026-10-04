import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeState,mapRatio} from '../dist/engine.mjs';
import {chordIdentity} from '../dist/chord-identity-v2.mjs';
import {projectChord,periodClass} from '../dist/chord-projection-v2.mjs';
import {createLiveChordRecognizer} from '../dist/live-chord-recognition.mjs';
import {fromCommas} from '../dist/tuning.mjs';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/harmonic-discovery/reference.json',import.meta.url)));
for(const state of Object.values(fixture.states))assert.equal(state.expectedNew.status,'not-implemented');
const meantone=makeState('meantone'),settings={limit:15,primeLimit:null,tol:10};
const harmonic=chordIdentity('4:5:6'),inversion=chordIdentity('5:6:8'),otherRegister=chordIdentity('2:5:6');
assert.notEqual(harmonic.fingerprint,inversion.fingerprint,'exact JI spelling retains independent note registers');
assert.notEqual(harmonic.fingerprint,otherRegister.fingerprint);
assert.deepEqual(harmonic.canonicalRatios.map(note=>note.label),['1/1','5/4','3/2']);
assert.deepEqual(projectChord(meantone,harmonic).notes.map(note=>note.coordinate),[[0,0],[-2,4],[0,1]]);
const reciprocal=chordIdentity('1/6:5:4');
assert.equal(reciprocal.aliases.otonal,'10:12:15');
assert.notEqual(reciprocal.fingerprint,harmonic.fingerprint,'reciprocal duality is a relationship, not exact identity');

const recognizer=createLiveChordRecognizer();
function recognized(text){
 const notes=projectChord(meantone,chordIdentity(text)).notes.map((note,index)=>({coordinate:note.coordinate,cents:index*100}));
 return recognizer.recognize(meantone,notes,settings);
}
for(const label of ['4:5:6','5:6:8','2:5:6','1/6:5:4']){
 const result=recognized(label);
 assert.equal(result.status,'match');
 assert.ok(result.matches.some(match=>match.label===label),`${label} has a seeded complete-coordinate recognition`);
}
const comma=projectChord(meantone,chordIdentity('1:81/80'));
assert.deepEqual(comma.notes.map(note=>note.coordinate),[[0,0],[0,0]]);
assert.equal(comma.originalCardinality,2);
assert.equal(comma.temperedCardinality,1);

const augmented=fromCommas('128/125','2.3.5','Computed CWE');
const augmentedTriad=projectChord(augmented,chordIdentity('1:5/4:25/16'));
const fullCoordinates=augmentedTriad.notes.map(note=>note.coordinate);
assert.deepEqual(fullCoordinates,[[0,0],[1,0],[2,0]],'three full lattice coordinates survive');
assert.deepEqual(fullCoordinates.map(periodClass),['0','0','0'],'legacy generator-only classes collapse them');
assert.equal(augmentedTriad.temperedCardinality,1,'current projection cardinality is period based');
assert.deepEqual(mapRatio(2,1,augmented),[3,0]);

const tritave=fromCommas('245/243','3.5.7','Computed CWE');
assert.deepEqual(mapRatio(3,1,tritave),[1,0]);
assert.equal(mapRatio(2,1,tritave),null);
assert.equal(mapRatio(3,2,tritave),null);
assert.deepEqual(mapRatio(245,243,tritave),[0,0]);
console.log('Exact chord labels, complete live shapes, current period collapse and non-octave subgroup boundaries passed.');
