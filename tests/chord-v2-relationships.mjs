import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeChord} from '../dist/chord-analysis-v2.mjs';
import {nearestSubstitutes,chordRelationships} from '../dist/chord-relationships-v2.mjs';
import {coordinateCents} from '../dist/pitch.mjs';
import {renderPartialMatches} from '../dist/chord-relationships-view-v2.mjs';
const session=JSON.parse(readFileSync(new URL('./fixtures/magic19-session.json',import.meta.url))),s={...session.states[0],...session.layoutScale},a=analyzeChord(s,'4:5:6:7:9:11');
const partial=a.occurrences.bestPartialOccurrences[0];assert.equal(partial.matchedCardinality,5);
const near=nearestSubstitutes(s,a.projection,partial,{tolerance:100});assert.ok(near.length);for(const n of near){const missing=partial.missingCoordinates.find(x=>x.member===n.member);assert.equal(n.errorCents,n.pitchCents-coordinateCents(s,missing.coordinate));assert.equal(n.exact,false);assert.ok(!partial.degrees.includes(n.degree));}
const boundary=Math.abs(near[0].errorCents);assert.ok(nearestSubstitutes(s,a.projection,partial,{tolerance:boundary}).length);assert.equal(nearestSubstitutes(s,a.projection,partial,{tolerance:boundary-1e-8}).length,0);
assert.deepEqual(near,nearestSubstitutes(s,a.projection,partial,{tolerance:100}));
let r;await chordRelationships(s,a,x=>r=x);assert.equal(r.status,'ready');assert.ok(r.subsets.some(x=>x.label==='4:5:6'));assert.ok(r.supersets.length);assert.ok(r.subsets.length<=24);
let stop=false,ready=false;await chordRelationships(s,a,x=>{if(x.done>=8)stop=true;if(x.status==='ready')ready=true;},()=>stop);assert.equal(ready,false);
assert.match(renderPartialMatches(s,a),/Partial matches/);assert.ok(!renderPartialMatches(s,a).includes('<h4>Exact occurrences'));
