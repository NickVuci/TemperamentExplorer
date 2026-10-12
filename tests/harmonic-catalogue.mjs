import assert from 'node:assert/strict';
import {makeState} from '../src/core/engine.mjs';
import {chordIdentity} from '../src/chords/chord-identity.mjs';
import {projectChord} from '../src/chords/chord-projection.mjs';
import {queryCatalogue,getHarmonicEntry,resolveSelection,catalogueContext} from '../src/harmonic/harmonic-catalogue.mjs';
import {fromCommas} from '../src/core/tuning.mjs';

const state=makeState('meantone');
const query={state,directInputs:['4:5:6','5:6:8','1/6:1/5:1/4'],pageSize:5};
const result=await queryCatalogue(query),major=await getHarmonicEntry(result,chordIdentity('4:5:6').fingerprint);
const raised=await getHarmonicEntry(result,chordIdentity('5:6:8').fingerprint);
// Rotations and octave doublings are one chord, written with the power-of-two root 4:5:6.
assert.equal(result.status,'complete');assert.equal(major.id,raised.id);assert.equal(major.preferredLabel,'4:5:6');
assert.ok(major.mergedInterpretationIds.includes(chordIdentity('4:5:6').fingerprint)&&major.mergedInterpretationIds.includes(chordIdentity('5:6:8').fingerprint));
assert.ok(major.aliases.includes('5:6:8')&&major.aliases.includes('2:3:4:5:6'));
assert.equal(result.items.filter(row=>row.kind==='ji'&&row.familyId===major.familyId).length,1);
assert.ok(result.dualLinks[major.id]);assert.equal(result.dualLinks[result.dualLinks[major.id]],major.id);
assert.ok(major.aliases.includes('4:5:6'));assert.ok(Object.isFrozen(result.items));
const unchanged=await queryCatalogue({...query,state:{...state,n:19,mode:4},tolerance:0});
assert.deepEqual(result,unchanged,'scale/mode/tolerance do not filter structural catalogue records');
const retuned=await queryCatalogue({...query,state:{...state,g:700}}),retunedMajor=await getHarmonicEntry(retuned,major.interpretationId);
assert.equal(retunedMajor.shapeId,major.shapeId);assert.notEqual(retunedMajor.tuning.maxErrorCents,major.tuning.maxErrorCents);
assert.notEqual(result.contextId,retuned.contextId);
const selected=resolveSelection(result,{version:1,mappingId:result.mappingId,shapeId:major.shapeId,harmonicId:major.familyId,source:'test'});
assert.equal(selected.status,'resolved');assert.ok(selected.aliases.includes(raised.id));
assert.throws(()=>resolveSelection(retuned,{version:1,mappingId:'other',shapeId:major.shapeId,source:'test'}),/mismatch/);
const next=await queryCatalogue({...query,cursor:result.nextCursor});assert.deepEqual(next.page,result.items.slice(5,10));
await assert.rejects(queryCatalogue({...query,state:{...state,g:700},cursor:result.nextCursor}),/cursor context mismatch/);
const custom=await getHarmonicEntry({state,maxRecords:1},'1:31:97');
assert.equal(custom.mappingStatus,'outside-basis');assert.equal(custom.interpretation.identity.fingerprint,chordIdentity('1:31:97').fingerprint);
assert.equal(custom.shapeId,null);assert.deepEqual(custom.missingPrimes,[31,97]);
const limited=await queryCatalogue({state,maxRecords:1});assert.equal(limited.status,'incomplete');assert.equal(limited.recordCap,true);
const empty=await queryCatalogue({state,categories:[]});assert.equal(empty.status,'complete-empty');
const aborted=new AbortController();aborted.abort();assert.equal((await queryCatalogue(query,{signal:aborted.signal})).status,'cancelled');
// A typed spelling with doublings and another root joins the one merged chord and marks it as a lookup.
const shared=await queryCatalogue({state,categories:['ji'],directInputs:['6:4:5:4']}),typed=shared.items.find(row=>row.mergedInterpretationIds.includes(chordIdentity('6:4:5:4').fingerprint));
assert.ok(typed&&typed.custom&&typed.preferredLabel==='4:5:6'&&typed.aliases.includes('6:4:5:4'));
assert.equal(shared.items.filter(row=>row.kind==='ji'&&row.familyId===typed.familyId).length,1);
const chordQuery=limit=>({state,categories:['ji','chords'],targetSpec:{oddLimit:limit,primeFilter:state.basis,mappingSubgroup:state.basis,representationPolicy:'octave'},chordSizes:[4]});
const low=await queryCatalogue(chordQuery(9)),high=await queryCatalogue(chordQuery(27));
const shape=projectChord(state,chordIdentity('1:9/8:3/2:5/3')).shapeIdentities.octave.id;
assert.equal(low.items.find(row=>row.shapeId===shape&&row.kind!=='ji')?.status,'essentially-tempered','the didymic tetrad is ET at the 9-limit');
assert.ok(!low.items.some(row=>row.shapeId===shape&&row.kind==='ji'&&row.dyads.dyadic),'no dyadic JI chord maps onto an ET shape');
assert.ok(high.items.some(row=>row.shapeId===shape&&row.kind==='ji'&&row.dyads.dyadic),'the same shape is JI at the 27-limit');
assert.ok(!high.items.some(row=>row.shapeId===shape&&row.kind==='tempered'));
assert.equal(low.status,'complete');assert.ok(low.sources.some(source=>source.kind==='chords'&&source.complete));
assert.notEqual(low.targetSetId,high.targetSetId);assert.ok(low.items.some(row=>row.kind==='ji'&&row.shapeId===major.shapeId));
const other=await queryCatalogue({state,categories:['mappings','approximations'],mappingTargets:['7/4'],approximationTargets:['16/15'],approximationChords:['1:7/4'],approximationOptions:{generatorBound:4,memberCandidateLimit:16,combinationCap:100,maxResults:3}});
assert.ok(other.items.some(row=>row.kind==='mapping'));assert.ok(other.items.some(row=>row.kind==='approximation'&&row.shapeId));
assert.ok(other.items.filter(row=>row.kind==='mapping').every(row=>row.activeMappingId===result.mappingId&&row.mappingId!==result.mappingId));
for(const entry of other.items){const selection={version:1,mappingId:other.mappingId,source:'test',
 ...(entry.harmonicId?{harmonicId:entry.harmonicId}:{}),...(entry.shapeId?{shapeId:entry.shapeId}:{}),
 ...(entry.interpretationId?{interpretationId:entry.interpretationId}:{})};
 assert.equal(resolveSelection(other,selection).status,'resolved',`${entry.kind} uses the shared selection contract`);}
const interval=result.items.find(entry=>entry.kind==='interval');
assert.equal(resolveSelection(result,{version:1,mappingId:result.mappingId,harmonicId:interval.harmonicId,source:'test'}).status,'resolved');
const native=fromCommas('245/243','3.5.7','Computed CWE'),nativeEntry=await getHarmonicEntry({state:native},'1:3');
assert.equal(nativeEntry.shape.equivalence,'exact');assert.notEqual(nativeEntry.familyId,major.familyId);
assert.equal(catalogueContext({state}).id,catalogueContext({state:{...state,n:20,mode:5}}).id);
console.log('Unified catalogue preserves aliases, duals, target-relative ET truth, direct lookup, context and pagination.');
const outsideIntervals=await queryCatalogue({state,categories:['intervals'],targetSpec:{oddLimit:15,primeFilter:null,mappingSubgroup:state.basis,representationPolicy:'octave'}});
const eleventh=outsideIntervals.items.find(row=>row.preferredLabel==='11/6');
assert.equal(eleventh.coordinate,null,'approximation does not invent a canonical mapping');
assert.deepEqual(eleventh.approximation.coordinate,[9,-14]);
assert.ok(Math.abs(eleventh.approximation.signedErrorCents-(9*state.p-14*state.g-1200*Math.log2(11/6)))<1e-8);
