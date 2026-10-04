import assert from 'node:assert/strict';
import {makeState} from '../dist/engine.mjs';
import {chordIdentity} from '../dist/chord-identity-v2.mjs';
import {makeJIInterpretation} from '../dist/harmonic-ji-chords.mjs';
import {mappingContext} from '../dist/harmonic-context.mjs';
import {searchChordApproximations,searchIntervalApproximations} from '../dist/harmonic-approximations.mjs';
import {targetSet} from '../dist/ji-limit-engine.mjs';
import {div,rational} from '../dist/rational.mjs';
import {fromCommas} from '../dist/tuning.mjs';

const state=makeState('meantone'),context=mappingContext(state),tuning={mappingId:context.id,periodCents:state.p,generatorCents:state.g};
const interpret=input=>makeJIInterpretation(chordIdentity(input));
const coordinateSum=(a,b)=>a.map((value,index)=>value+b[index]);
const equalCoordinate=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// The independently best approximation of each edge in this three-note JI
// interpretation violates cycle consistency. The chord search must never
// return those edge choices as though they formed a realizable coordinate set.
const inconsistentInterpretation=interpret('1:16/15:11/10');
const edgeBest={
 rootToSixteenFifteenths:searchIntervalApproximations(context,tuning,'16/15').candidates[0].coordinate,
 rootToElevenTenths:searchIntervalApproximations(context,tuning,'11/10').candidates[0].coordinate,
 sixteenFifteenthsToElevenTenths:searchIntervalApproximations(context,tuning,'33/32').candidates[0].coordinate,
};
assert.deepEqual(edgeBest.rootToSixteenFifteenths,[-15,26]);
assert.deepEqual(edgeBest.rootToElevenTenths,[10,-17]);
assert.deepEqual(edgeBest.sixteenFifteenthsToElevenTenths,[7,-12]);
assert.notDeepEqual(coordinateSum(edgeBest.rootToSixteenFifteenths,edgeBest.sixteenFifteenthsToElevenTenths),edgeBest.rootToElevenTenths,
 'independent edge optima do not cancel around the chord cycle');
const coherent=searchChordApproximations(inconsistentInterpretation,{context,tuning,generatorBound:1,memberCandidateLimit:8,
 combinationCap:100,cancellationCap:1000,maxResults:20,minimumImprovementCents:0});
assert.equal(coherent.canonicalComparison.status,'incomplete','11/10 lacks a canonical coordinate in the selected 2.3.5 subgroup');
assert.equal(coherent.interpretation.identityId,inconsistentInterpretation.identity.fingerprint);
assert.ok(coherent.candidates.length>0);
for(const candidate of coherent.candidates){
 for(const edge of candidate.edges){
  assert.deepEqual(edge.coordinate,candidate.memberCoordinates[edge.toMember].map((value,index)=>value-candidate.memberCoordinates[edge.fromMember][index]),
   'every edge must be recomputable from one root-relative coordinate assignment');
 }
}

// Independent brute-force oracle for the complete 3-note, B=1 domain. Every
// Each non-root member has three generator choices, so the product is 3^2 = 9.
const smallBound=1,small=searchChordApproximations(inconsistentInterpretation,{context,tuning,generatorBound:smallBound,
 memberCandidateLimit:8,combinationCap:100,cancellationCap:1000,maxResults:20,minimumImprovementCents:0});
const idealCents=ratio=>1200*Math.log2(Number(ratio[0])/Number(ratio[1]));
function nearestDomain(ratio){
 const ideal=idealCents(ratio),coords=[];
 for(let generator=-smallBound;generator<=smallBound;generator++){
  const period=(ideal-generator*state.g)/state.p,lower=Math.floor(period),upper=Math.ceil(period);
  const distance=Math.min(period-lower,upper-period);
  for(const p of new Set([lower,upper].filter(value=>Math.abs(Math.abs(period-value)-distance)<=1e-12)))coords.push([p,generator]);
 }
 return coords;
}
const chordMembers=inconsistentInterpretation.identity.canonicalRatios.map(member=>rational(BigInt(member.n),BigInt(member.d)));
const memberDomains=chordMembers.map((ratio,index)=>index===0?[[0,0]]:nearestDomain(ratio));
const brute=[];
for(const first of memberDomains[1])for(const second of memberDomains[2]){
 const coordinates=[[0,0],first,second];let score=0;
 for(let from=0;from<coordinates.length;from++)for(let to=from+1;to<coordinates.length;to++){
  const ratio=div(chordMembers[to],chordMembers[from]),dyad=coordinates[to].map((value,index)=>value-coordinates[from][index]);
  score+=Math.abs(dyad[0]*state.p+dyad[1]*state.g-idealCents(ratio));
 }
 brute.push({coordinates,score});
}
const compareCoordinates=(a,b)=>{const left=a.flat(),right=b.flat();for(let index=0;index<left.length;index++)if(left[index]!==right[index])return left[index]-right[index];return 0;};
brute.sort((a,b)=>a.score-b.score||compareCoordinates(a.coordinates,b.coordinates));
assert.equal(small.completeness.candidateProductCount,'9');
assert.equal(small.completeness.combinationsExplored,9);
assert.equal(small.completeness.complete,true);
assert.equal(small.candidates.length,brute.length);
for(let index=0;index<brute.length;index++){
 assert.deepEqual(small.candidates[index].memberCoordinates,brute[index].coordinates);
 assert.ok(Math.abs(small.candidates[index].scoreCents-brute[index].score)<1e-8);
}

// A mapped 4:5:6 chord keeps its canonical projection only in the comparison
// record. Better chord alternatives have a separate approximate-shape ID.
const major=interpret('4:5:6'),majorResult=searchChordApproximations(major,{context,tuning});
assert.equal(majorResult.canonicalComparison.status,'complete');
assert.deepEqual(majorResult.canonicalComparison.members.map(member=>member.coordinate),[[0,0],[-2,4],[0,1]]);
assert.ok(majorResult.candidates.length>0);
assert.ok(majorResult.candidates.every(candidate=>candidate.kind==='approximate-chord-shape'));
assert.ok(majorResult.candidates.every(candidate=>!equalCoordinate(candidate.memberCoordinates,[[0,0],[-2,4],[0,1]])));
assert.ok(majorResult.candidates.every(candidate=>candidate.improvementCents>=0.1));
assert.ok(majorResult.candidates.every(candidate=>candidate.interpretationId===major.id));
assert.ok(majorResult.candidates.every(candidate=>candidate.exactDualId===major.exactDualId));
const utonal=makeJIInterpretation(chordIdentity('1/6:1/5:1/4'),{preferredLabel:'1/6:1/5:1/4',legacyForm:'utonal'});
const utonalResult=searchChordApproximations(utonal,{context,tuning,generatorBound:1,combinationCap:100,cancellationCap:1000,minimumImprovementCents:0});
assert.notEqual(utonal.identity.fingerprint,major.identity.fingerprint,'the reciprocal keeps a distinct exact JI identity');
assert.equal(utonalResult.interpretation.identityId,utonal.identity.fingerprint);
assert.equal(utonalResult.interpretation.exactDualId,major.identity.fingerprint);
assert.equal(utonalResult.interpretation.presentationForm,'utonal');

// A supplied exact target set labels coordinate collisions without changing
// the requested 7/4 identity. The chosen synthetic tuning makes [-2,4] exact.
const set=targetSet({oddLimit:15,primeFilter:[2,3,5],mappingSubgroup:[2,3,5]}),sevenFour=interpret('1:7/4'),idealSevenFour=1200*Math.log2(7/4);
const collisionTuning={...tuning,generatorCents:(idealSevenFour+2*state.p)/4};
const collisionResult=searchChordApproximations(sevenFour,{context,tuning:collisionTuning,targetSet:set,generatorBound:4,
 memberCandidateLimit:16,combinationCap:100,cancellationCap:100,maxResults:20,minimumImprovementCents:0});
const collided=collisionResult.candidates.find(candidate=>equalCoordinate(candidate.memberCoordinates[1],[-2,4]));
assert.ok(collided);
assert.ok(collided.edges[0].collisionTargetIds.includes(set.targets.find(value=>value.ratio.label==='5/4').id));
assert.equal(collided.interpretationId,sevenFour.id);

// Native non-octave chord targets retain their JI octave/register while the
// actual temperament period is used for every coordinate error.
const tritave=fromCommas('245/243','3.5.7','Computed CWE'),tritaveIdentity=interpret('1:11/3');
const tritaveResult=searchChordApproximations(tritaveIdentity,{state:tritave,generatorBound:2,memberCandidateLimit:8,
 combinationCap:100,cancellationCap:100,maxResults:5,minimumImprovementCents:0});
assert.notEqual(tritave.p,1200);
assert.equal(tritaveResult.canonicalComparison.status,'incomplete');
for(const candidate of tritaveResult.candidates){
 const edge=candidate.edges[0];
 assert.equal(edge.targetRatio,'11/3');
 assert.ok(Math.abs(edge.tunedCents-(edge.coordinate[0]*tritave.p+edge.coordinate[1]*tritave.g))<1e-8);
 assert.ok(Math.abs(edge.idealCents-1200*Math.log2(11/3))<1e-8,'JI interval cents remain octave-based even in a tritave temperament');
}

// Search limits are explicit and report partial coverage instead of pretending
// that a prefix of a Cartesian product is exhaustive.
const eightTone=interpret('1:16/15:11/10:9/8:7/5:5/4:3/2:8/5');
const capped=searchChordApproximations(eightTone,{context,tuning,generatorBound:1,memberCandidateLimit:4,
 combinationCap:2,cancellationCap:1000,maxResults:5,minimumImprovementCents:0});
assert.equal(capped.completeness.partial,true);
assert.equal(capped.completeness.combinationCapReached,true);
assert.equal(capped.completeness.combinationsExplored,2);
const cancellationCapped=searchChordApproximations(inconsistentInterpretation,{context,tuning,generatorBound:1,memberCandidateLimit:8,
 combinationCap:100,cancellationCap:5,maxResults:5,minimumImprovementCents:0});
assert.equal(cancellationCapped.completeness.partial,true);
assert.equal(cancellationCapped.completeness.cancellationCapReached,true);
assert.equal(cancellationCapped.completeness.cancellationCount,3);

assert.throws(()=>searchChordApproximations(major,{context,tuning,generatorBound:257}),/bound/);
assert.throws(()=>searchChordApproximations(major,{context,tuning,combinationCap:100001}),/combination cap/);
assert.throws(()=>searchChordApproximations(major,{context,tuning,targetSet:targetSet({oddLimit:15,primeFilter:[2,3,5],mappingSubgroup:[2,3]})}),/exact prime subgroup/);
console.log('Coherent chord approximation search, brute-force oracle, exact collisions and work caps passed.');
