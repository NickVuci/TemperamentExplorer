import assert from 'node:assert/strict';
import {makeState} from '../dist/engine.mjs';
import {discoverChords,chordCandidates,validateDiscovery,withinJILimits,withinOddLimit} from '../dist/chord-discovery-v2.mjs';
import {chordIdentity} from '../dist/chord-identity-v2.mjs';
assert.ok(chordCandidates().length<=256);assert.equal(new Set(chordCandidates().map(c=>c.identity.fingerprint)).size,chordCandidates().length);
assert.ok(withinOddLimit(chordIdentity('4:5:6:7:9:11'),11));assert.ok(!withinOddLimit(chordIdentity('4:5:6:7:9:11'),9));
assert.ok(withinJILimits(chordIdentity('4:5:6'),11,5));assert.ok(!withinJILimits(chordIdentity('4:5:6'),11,3));
const porkypine=[2,3,5,11];assert.ok(withinJILimits(chordIdentity('8:11:12'),15,porkypine));assert.ok(!withinJILimits(chordIdentity('4:5:7'),15,porkypine));assert.deepEqual(validateDiscovery({oddLimit:15,primeLimit:[11,3,2,5]}).primeLimit,porkypine);
const s=makeState('miracle11');const search=async c=>{let result;await discoverChords(s,c,r=>result=r);return result;};
const a=await search({}),b=await search({});assert.deepEqual(a.rows.map(r=>r.id),b.rows.map(r=>r.id));assert.equal(a.status,'ready');assert.equal(a.done,a.total);
for(const c of [{minTones:2,maxTones:2},{form:'utonal'},{maxError:0},{maxSpan:0},{oddLimit:3},{occurrence:'any',collisions:'allow'},{sort:'roots'},{sort:'span'},{sort:'name'},{contains:'4:5:6'},{minTones:4,maxTones:5,form:'otonal',oddLimit:7,maxSpan:10,maxError:5}]){
 const result=await search(c),v=validateDiscovery(c);for(const row of result.rows){assert.ok(row.identity.cardinality>=v.minTones&&row.identity.cardinality<=v.maxTones);assert.ok(row.analysis.projection.maxErrorCents<=v.maxError);assert.ok(row.analysis.projection.generatorSpan<=v.maxSpan);if(v.form!=='both')assert.ok([v.form,'self'].includes(row.form));}
}
let stop=false,ready=false;await discoverChords(s,{},r=>{if(r.done>=8)stop=true;if(r.status==='ready')ready=true;},()=>stop);assert.equal(ready,false);
const primeLimited=await search({minTones:3,maxTones:4,primeLimit:3});assert.ok(primeLimited.rows.length<a.rows.length);for(const row of primeLimited.rows)assert.ok(withinJILimits(row.identity,primeLimited.bounds.oddLimit,3));
assert.equal(validateDiscovery({}).oddLimit,15);assert.equal(validateDiscovery({}).primeLimit,null);for(const c of [{oddLimit:98},{oddLimit:9,primeLimit:9},{oddLimit:13,primeLimit:4},{maxTones:9},{maxError:-1},{form:'x'},{maxSpan:1.2},{contains:'x'}])assert.throws(()=>validateDiscovery(c));

for(const text of ['4:5:6','6:9:11','4:6:7','8:10:11:12']){
 const identity=chordIdentity(text),pair=chordCandidates().filter(c=>c.pairId===chordCandidates().find(c=>c.identity.fingerprint===identity.fingerprint).pairId);
 assert.equal(pair.find(c=>c.form==='otonal').label,text);
 const reciprocal='1/'+text.split(':').reverse().join(':');
 assert.equal(pair.find(c=>c.form==='utonal').label,reciprocal);
 assert.equal(chordIdentity(reciprocal).fingerprint,pair.find(c=>c.form==='utonal').identity.fingerprint);
}
