import assert from 'node:assert/strict';
import {makeState,targetSet} from '../src/core/engine.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {chordIdentity} from '../src/chords/chord-identity.mjs';
import {projectChord} from '../src/chords/chord-projection.mjs';
import {mappingContext} from '../src/harmonic/harmonic-context.mjs';
import {mapMonzo} from '../src/core/ji-monzo.mjs';
import {buildDyadIndex,domainsForShape} from '../src/harmonic/harmonic-dyad-graph.mjs';
import {findCoherentJILift} from '../src/harmonic/harmonic-ji-lift.mjs';

function indexFor(state,oddLimit,representationPolicy='octave',primeFilter=null){
 const targets=targetSet({oddLimit,primeFilter,mappingSubgroup:state.basis,representationPolicy});
 return buildDyadIndex(targets,state);
}
function projectedShape(state,chord,equivalence='octave'){
 const projection=projectChord(state,chordIdentity(chord));
 return projection.shapeIdentities[equivalence];
}
function coordinates(shape){return Array.isArray(shape.memberLinks)?[...shape.memberLinks].sort((a,b)=>a.memberIndex-b.memberIndex).map(item=>item.coordinate):shape.coordinates;}

function independentBruteForce(shape,index){
 const domains=domainsForShape(shape,index),points=coordinates(shape),edges=new Map(domains.edges.map(edge=>[`${edge.fromMember}:${edge.toMember}`,new Set(edge.interpretations.map(item=>monzoClass(item.monzo,index)))]));
 if(domains.status!=='dyadic')return false;
 const options=points.map((_,member)=>member===0?[index.basis.map(()=>0)]:domains.edges.find(edge=>edge.fromMember===0&&edge.toMember===member).interpretations.map(item=>item.monzo));
 const assignment=Array(points.length);
 function visit(member){
  if(member===points.length){
   for(let from=0;from<assignment.length;from++)for(let to=from+1;to<assignment.length;to++)if(!edges.get(`${from}:${to}`).has(monzoClass(subtract(assignment[to],assignment[from]),index)))return false;
   return true;
  }
  for(const candidate of options[member]){assignment[member]=candidate;if(visit(member+1))return true;}
  return false;
 }
 return visit(0);
}
function subtract(a,b){return a.map((value,index)=>value-b[index]);}
function monzoClass(monzo,index){
 return JSON.stringify(monzo.map((value,position)=>index.equivalence==='octave'&&index.basis[position]===2?0:value));
}
function verifyWitness(result,index,shape){
 const points=coordinates(shape),witness=result.witness;
 assert.equal(witness.vertices.length,points.length);
 for(const vertex of witness.vertices){
  const expected=vertex.memberIndex===0?[0,0]:subtract(points[vertex.memberIndex],points[0]);
  assert.deepEqual(mapMonzo(index.rows,vertex.monzo),expected,`vertex ${vertex.memberIndex} maps to its exact relative coordinate`);
 }
 assert.equal(witness.edgeAssignments.length,points.length*(points.length-1)/2);
 for(const edge of witness.edgeAssignments){
  const vertexDifference=subtract(witness.vertices[edge.toMember].monzo,witness.vertices[edge.fromMember].monzo);
  assert.deepEqual(edge.liftedMonzo,vertexDifference,'edge spelling lifts to the difference of the assigned vertex labels');
  assert.deepEqual(mapMonzo(index.rows,edge.liftedMonzo),edge.coordinate,'every dyad has the exact expected mapped difference');
 }
}

const meantone=makeState('meantone'),limit5=indexFor(meantone,5,'octave',[2,3,5]);
for(const label of ['4:5:6','10:12:15']){
 const shape=projectedShape(meantone,label),result=findCoherentJILift(shape,limit5);
 assert.equal(result.status,'liftable',`${label} has a coherent JI lift`);
 verifyWitness(result,limit5,shape);
 assert.equal(result.status==='liftable',independentBruteForce(shape,limit5),'solver agrees with independent exhaustive assignments');
}

const didymic=projectedShape(meantone,'1:9/8:3/2:5/3'),limit9=indexFor(meantone,9,'octave',[2,3,5]),limit27=indexFor(meantone,27,'octave',[2,3,5]);
assert.equal(didymic.id,projectedShape(meantone,'1:9/8:3/2:5/3').id,'shape identity is target-set independent');
assert.equal(domainsForShape(didymic,limit9).status,'dyadic','all meantone didymic edges have target interpretations at limit 9');
const limited=findCoherentJILift(didymic,limit9);
assert.equal(limited.status,'no-lift');assert.equal(limited.complete,true);
assert.equal(limited.obstruction.exhaustive,true);
assert.equal(limited.status==='liftable',independentBruteForce(didymic,limit9),'complete failure matches the small Cartesian-product oracle');

const expanded=findCoherentJILift(didymic,limit27);
assert.equal(expanded.status,'liftable','the wider target set supplies a conventional interpretation');
assert.ok(expanded.stats.branchNodes>0,'an initially failing dyad interpretation does not hide a later successful branch');
assert.equal(expanded.status==='liftable',independentBruteForce(didymic,limit27));
verifyWitness(expanded,limit27,didymic);
assert.ok(expanded.witness.vertices.some(vertex=>vertex.ratio==='10/9'),'the successful witness is not limited to the first edge label');

const bounded=findCoherentJILift(didymic,limit27,{maxStates:1});
assert.equal(bounded.status,'unknown');assert.equal(bounded.complete,false);assert.equal(bounded.reason,'state-budget');assert.equal(bounded.witness,null);
const cancelled=findCoherentJILift(didymic,limit27,{shouldCancel:()=>true});
assert.equal(cancelled.status,'unknown');assert.equal(cancelled.reason,'cancelled');

const tritave=fromCommas('245/243','3.5.7','Computed CWE'),nativeIndex=indexFor(tritave,15,'native-exact',[3,5,7]);
const nativeShape={id:'native-tritave-dyad',mappingId:nativeIndex.mappingId,equivalence:'exact',coordinates:[[0,0],[1,0]]};
const nativeResult=findCoherentJILift(nativeShape,nativeIndex);
assert.equal(nativeResult.status,'liftable');
assert.equal(nativeResult.witness.vertices[1].ratio,'3/1');
verifyWitness(nativeResult,nativeIndex,nativeShape);
assert.equal(nativeResult.status==='liftable',independentBruteForce(nativeShape,nativeIndex));

const porcupine=makeState('porcupine'),porcupineIndex=indexFor(porcupine,15,'octave',[2,3,5]);
const porcupineShape=projectedShape(porcupine,'4:5:6'),porcupineResult=findCoherentJILift(porcupineShape,porcupineIndex);
assert.equal(porcupineResult.status,'liftable');
assert.equal(porcupineResult.status==='liftable',independentBruteForce(porcupineShape,porcupineIndex));
verifyWitness(porcupineResult,porcupineIndex,porcupineShape);

// This finite dreamtone shape's first root-label branch closes to a domain
// wipeout; a later exact JI interpretation supplies the valid global lift.
const dreamtone=makeState('dreamtone'),dreamtoneIndex=indexFor(dreamtone,15,'octave',dreamtone.basis);
const backtrackingShape={id:'dreamtone-backtracking-fixture',mappingId:dreamtoneIndex.mappingId,equivalence:'octave',coordinates:[[0,0],[0,-2],[0,1],[0,3]]};
const backtracked=findCoherentJILift(backtrackingShape,dreamtoneIndex);
assert.equal(backtracked.status,'liftable');
assert.ok(backtracked.stats.failedBranches>=1,'a failed assignment is followed by a successful alternative');
assert.equal(backtracked.status==='liftable',independentBruteForce(backtrackingShape,dreamtoneIndex));
verifyWitness(backtracked,dreamtoneIndex,backtrackingShape);

console.log('Bounded coherent JI lifting agrees with exhaustive oracles and preserves octave and native exact lifts.');
