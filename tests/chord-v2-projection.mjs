import assert from 'node:assert/strict';
import {chordIdentity as id} from '../dist/chord-identity-v2.mjs';
import {projectChord} from '../dist/chord-projection-v2.mjs';
import {makeState,mapRatio} from '../dist/engine.mjs';
const s=makeState('meantone'),a=projectChord(s,id('4:5:6'),{tolerance:0});
assert.equal(a.basisStatus,'mapped');assert.equal(a.qualityStatus,'above-tolerance');
assert.equal(projectChord(s,id('4:5:6'),{tolerance:100}).qualityStatus,'within-tolerance');
assert.deepEqual(a.notes.map(n=>n.coordinate),[[0,0],[-2,4],[0,1]]);
assert.equal(projectChord(s,id('4:5:6:11')).basisStatus,'outside-basis');assert.equal(projectChord(s,id('4:5:6:11')).notes[3].coordinate,null);
const collapse=projectChord(s,id('1:81/80'));assert.equal(collapse.cardinalityStatus,'collapsed');assert.equal(collapse.temperedCardinality,1);assert.deepEqual(collapse.collisionGroups[0].members,[0,1]);
assert.equal(projectChord(s,id('6:4:5')).temperedFingerprint,a.temperedFingerprint);
for(let x=1;x<8;x++){const m=mapRatio(3**x,2**x,s);assert.deepEqual(m,mapRatio(3,2,s).map(v=>v*x));}
assert.equal(projectChord({...s,g:s.p*7/12},id('1:3/2')).cardinalityStatus,'preserved','EDO tuning does not lower formal rank');
assert.throws(()=>projectChord(s,id('4:5:6'),{tolerance:-1}));
