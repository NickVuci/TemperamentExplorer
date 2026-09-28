import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chordIdentity} from '../dist/chord-identity-v2.mjs';
import {projectChord} from '../dist/chord-projection-v2.mjs';
import {searchOccurrences,scaleMembership,largerScaleDiagnostics} from '../dist/chord-occurrence-v2.mjs';
import {makeState} from '../dist/engine.mjs';
const session=JSON.parse(readFileSync(new URL('./fixtures/magic19-session.json',import.meta.url))),s={...session.states[0],...session.layoutScale},p=projectChord(s,chordIdentity('4:5:6:7:9:11'));
assert.equal(p.basisStatus,'mapped');assert.equal(p.qualityStatus,'within-tolerance');assert.equal(p.cardinalityStatus,'preserved');
const a=searchOccurrences(s,p);assert.equal(a.completeOccurrences.length,0);assert.equal(a.generatorSpan,20);assert.equal(a.bestPartialOccurrences[0].matchedCardinality,5);assert.equal(a.bestPartialOccurrences[0].missingCoordinates.length,1);
assert.deepEqual(largerScaleDiagnostics(s,p).slice(0,2).map(x=>[x.n,x.count]),[[21,1],[22,2]]);
for(let mode=0;mode<19;mode++)assert.equal(searchOccurrences({...s,mode},p).completeOccurrences.length,0);
for(const key of ['meantone','magic11','miracle11'])for(const n of [7,19,31,64,256])for(const mode of [0,n-1]){
 const state={...makeState(key),n,mode},proj=projectChord(state,chordIdentity('4:5:6')),m=scaleMembership(state),out=searchOccurrences(state,proj);
 // Deliberately naive reference: for each root scan every note for every member.
 const brute=m.notes.filter(root=>proj.notes.every(t=>m.notes.some(v=>v.generator===root.generator+t.coordinate[1]))).map(r=>r.degree);
 assert.deepEqual(out.completeOccurrences.map(o=>o.root),brute);
 const shifted={...m,notes:m.notes.map(v=>({...v,generator:v.generator+7,coordinate:[v.coordinate[0]-3,v.coordinate[1]+7]}))};
 assert.deepEqual(searchOccurrences(state,proj,{membership:shifted}).completeOccurrences.map(o=>o.id),out.completeOccurrences.map(o=>o.id));
}
const third={name:'tritave',basis:[3,5],rows:[[1,0],[0,1]],p:1901.955,g:2786.314,n:9,mode:4};assert.ok(searchOccurrences(third,projectChord(third,chordIdentity('3:5'))).completeOccurrences.length);
const collapsed=searchOccurrences(makeState('meantone'),projectChord(makeState('meantone'),chordIdentity('1:81/80')));assert.equal(collapsed.completeOccurrences[0].requiredCardinality,1);
