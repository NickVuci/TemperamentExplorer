import assert from 'node:assert/strict';
import {makeState,targetSet} from '../dist/engine.mjs';
import {projectChord,projectCoordinateShape} from '../dist/chord-projection-v2.mjs';
import {chordIdentity} from '../dist/chord-identity-v2.mjs';
import {harmonicIdentity} from '../dist/harmonic-equivalence.mjs';
import {fromCommas} from '../dist/tuning.mjs';
import {buildDyadIndex,enumerateDyadicShapes} from '../dist/harmonic-dyad-graph.mjs';
import {discoverDyadicHarmony} from '../dist/harmonic-et.mjs';
import {mapMonzo} from '../dist/ji-monzo.mjs';
import {canonicalHarmonicJSON} from '../dist/harmonic-types.mjs';

function indexFor(state,oddLimit){
 const targets=targetSet({oddLimit,primeFilter:state.basis,mappingSubgroup:state.basis,representationPolicy:'octave'});
 return buildDyadIndex(targets,state);
}

async function collect(job){
 const events=[];
 for await(const event of job)events.push(event);
 assert.equal(events.at(-1)?.type,'complete','every consumed discovery job ends with a completeness envelope');
 return {events,batches:events.filter(event=>event.type==='batch'),summary:events.at(-1)};
}

function recordsOf(batches,key){return batches.flatMap(batch=>batch.records[key]);}

const meantone=makeState('meantone'),l9=indexFor(meantone,9),l27=indexFor(meantone,27);
const didymic=projectChord(meantone,chordIdentity('1:9/8:3/2:5/3')).shapeIdentities.octave;
const majorShape=projectChord(meantone,chordIdentity('4:5:6')).shapeIdentities.octave;
const ordinary=await collect(discoverDyadicHarmony(l9,{sizes:[3,4],batchSize:4}));
const jiRows=recordsOf(ordinary.batches,'jiInterpretations'),etRows=recordsOf(ordinary.batches,'essentiallyTempered');
assert.equal(ordinary.summary.status,'complete');assert.equal(ordinary.summary.complete,true);
assert.equal(ordinary.summary.counts.unassessedCandidateCount,0);
assert.ok(jiRows.length>0,'ordinary coherent JI chords remain in the discovery stream');
assert.ok(etRows.some(row=>row.shape.id===didymic.id),'the unliftable meantone tetrad is found by the same discovery job');
const majorRow=jiRows.find(row=>row.shape.id===majorShape.id);
assert.ok(majorRow,'mapped 4:5:6 is identified as a coherent JI chord');
assert.equal(majorRow.interpretation.identityId,harmonicIdentity(chordIdentity('5:6:8'),'octave').familyId,
 'the existing JI family identity recognizes octave-displaced 5:6:8 as the same underlying 4:5:6 harmony');
assert.ok(jiRows.every(row=>row.interpretation.type==='ji-chord-interpretation'&&row.interpretation.form==='generic-ji'),
 'coherent lifts are returned as generic exact JI interpretations, without filtering to named otonal forms');
for(const row of jiRows){
 const interpretation=row.interpretation;
 assert.match(interpretation.identityId,/^ji-family-v1:/);assert.equal(interpretation.members[0].targetRatio,'1/1');
 assert.deepEqual(interpretation.members[0].monzo,meantone.basis.map(()=>0));
 assert.equal(interpretation.members.length,row.shape.coordinates.length);
 for(const member of interpretation.members){
  assert.deepEqual(mapMonzo(l9.rows,member.monzo),member.coordinate);
  assert.ok(Number.isSafeInteger(member.registerLift));
 }
 for(const dyad of interpretation.dyads)assert.deepEqual(mapMonzo(l9.rows,dyad.liftedMonzo),dyad.coordinate);
 assert.ok(Object.isFrozen(row)&&Object.isFrozen(interpretation)&&Object.isFrozen(interpretation.members[0]));
}
assert.ok(etRows.every(row=>row.assessment.status==='essentially-tempered'&&!row.interpretation));
assert.ok(Object.isFrozen(ordinary.batches[0])&&Object.isFrozen(ordinary.batches[0].records));

const rerun=await collect(discoverDyadicHarmony(l9,{sizes:[3,4],batchSize:4}));
assert.equal(canonicalHarmonicJSON(ordinary.events),canonicalHarmonicJSON(rerun.events),'batching and stable IDs are deterministic');

const wider=await collect(discoverDyadicHarmony(l27,{sizes:[4],batchSize:8}));
assert.notEqual(ordinary.summary.targetSetId,wider.summary.targetSetId);
assert.ok(recordsOf(ordinary.batches,'essentiallyTempered').some(row=>row.shape.id===didymic.id));
assert.ok(recordsOf(wider.batches,'jiInterpretations').some(row=>row.shape.id===didymic.id),
 'the same tempered shape changes from ET to an ordinary JI interpretation when the selected target set expands');

const boundedPerShape=await collect(discoverDyadicHarmony(l27,{sizes:[3,4],maxCompatibilityChecksPerShape:1,batchSize:16}));
const unknownRows=recordsOf(boundedPerShape.batches,'unknown');
assert.ok(unknownRows.length>0);assert.equal(boundedPerShape.summary.status,'incomplete');
assert.equal(boundedPerShape.summary.reason,'shape-assessment-unknown');
assert.equal(boundedPerShape.summary.complete,false);assert.ok(boundedPerShape.summary.counts.unknown>0);
assert.equal(boundedPerShape.summary.counts.essentiallyTempered,0,'budget-limited unknown shapes never become ET records');
assert.ok(unknownRows.every(row=>row.assessment.status==='unknown'&&row.assessment.complete===false));

const totalStateBound=await collect(discoverDyadicHarmony(l9,{sizes:[3,4],maxTotalStates:1,maxTotalCompatibilityChecks:100_000}));
assert.ok(totalStateBound.summary.work.states<=1);assert.equal(totalStateBound.summary.status,'incomplete');
assert.equal(totalStateBound.summary.reason,'total-state-budget');assert.equal(totalStateBound.summary.complete,false);
assert.ok(totalStateBound.summary.counts.knownUnassessedCandidates>=1);
assert.equal(totalStateBound.summary.counts.essentiallyTempered,0);

const totalCheckBound=await collect(discoverDyadicHarmony(l9,{sizes:[3,4],maxTotalStates:100_000,maxTotalCompatibilityChecks:1}));
assert.ok(totalCheckBound.summary.work.compatibilityChecks<=1);assert.equal(totalCheckBound.summary.status,'incomplete');
assert.equal(totalCheckBound.summary.reason,'total-compatibility-budget');
assert.equal(totalCheckBound.summary.counts.knownUnassessedCandidates,1);
assert.equal(totalCheckBound.summary.counts.essentiallyTempered,0);

const empty=await collect(discoverDyadicHarmony(l9,{sizes:[8]}));
assert.equal(empty.summary.status,'complete-empty');assert.equal(empty.summary.complete,true);
assert.equal(empty.summary.counts.shapesAssessed,0);assert.equal(empty.summary.reason,null);
const truncated=await collect(discoverDyadicHarmony(l9,{sizes:[3,4],maxCandidateShapes:1}));
assert.equal(truncated.summary.status,'incomplete');assert.equal(truncated.summary.reason,'candidate-cap');
assert.equal(truncated.summary.complete,false);assert.equal(truncated.summary.enumeration.complete,false);

const tritave=fromCommas('245/243','3.5.7','Computed CWE'),nativeTargets=targetSet({oddLimit:15,primeFilter:[3,5,7],
 mappingSubgroup:[3,5,7],representationPolicy:'native-exact'}),nativeIndex=buildDyadIndex(nativeTargets,tritave);
const nativeShape=projectCoordinateShape(tritave,[[0,0],[1,0]]).identities.exact;
const native=await collect(discoverDyadicHarmony(nativeIndex,{sizes:[2]})),nativeRow=recordsOf(native.batches,'jiInterpretations').find(row=>row.shape.id===nativeShape.id);
assert.ok(nativeRow,'the exact 3/1 tritave dyad is discovered');assert.equal(nativeRow.interpretation.equivalence,'exact');
assert.equal(nativeRow.interpretation.identityId,harmonicIdentity(chordIdentity('1:3'),'exact').familyId,
 'native-exact chord identity does not silently fold 3/1 by octave');

const abortedBeforeStart=new AbortController();abortedBeforeStart.abort();
const cancelledBefore=await collect(discoverDyadicHarmony(l9,{sizes:[3,4],signal:abortedBeforeStart.signal}));
assert.equal(cancelledBefore.summary.status,'cancelled');assert.equal(cancelledBefore.summary.counts.shapesAssessed,0);
const abortedAfterBatch=new AbortController(),cancellable=discoverDyadicHarmony(l9,{sizes:[3,4],batchSize:1,signal:abortedAfterBatch.signal});
const first=await cancellable.next();assert.equal(first.value.type,'batch');assert.equal(first.value.progress.counts.shapesAssessed,1);
abortedAfterBatch.abort();const final=await cancellable.next();
assert.equal(final.value.type,'complete');assert.equal(final.value.status,'cancelled');
assert.equal(final.value.counts.shapesAssessed,1,'cancellation between batches prevents another shape assessment');

let enumerationChecks=0;const countEnumerationChecks=enumerateDyadicShapes(l9,{sizes:[3],shouldCancel:()=>{enumerationChecks++;return false;}});
assert.equal(countEnumerationChecks.next().done,false);countEnumerationChecks.return();
let discoveryChecks=0;const duringSolver=await collect(discoverDyadicHarmony(l9,{sizes:[3],shouldCancel:()=>++discoveryChecks>=enumerationChecks+2}));
assert.equal(duringSolver.summary.status,'cancelled','cancellation is passed through to the synchronous lift solver');
assert.equal(duringSolver.summary.counts.unknown,1);
assert.equal(recordsOf(duringSolver.batches,'unknown')[0].assessment.reason,'cancelled');
assert.equal(duringSolver.summary.counts.essentiallyTempered,0);

const consumerStopped=discoverDyadicHarmony(l9,{sizes:[3,4],batchSize:1});
await consumerStopped.next();await consumerStopped.return();
assert.equal(consumerStopped.progress.status,'incomplete');assert.equal(consumerStopped.progress.reason,'consumer-stopped');

assert.throws(()=>discoverDyadicHarmony(l9,{sizes:[3],maxTotalStates:0}),/maxTotalStates/);
assert.throws(()=>discoverDyadicHarmony(l9,{sizes:[3],typo:true}),/Unknown dyadic harmony discovery option/);

console.log('ET discovery emits deterministic immutable batches, respects strict budgets and cancellation, and reports incomplete searches honestly.');
