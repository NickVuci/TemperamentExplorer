import assert from 'node:assert/strict';
import {makeState,targetSet} from '../src/core/engine.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {mappingContext} from '../src/harmonic/harmonic-context.mjs';
import {projectCoordinateShape} from '../src/chords/chord-projection.mjs';
import {mapMonzo,ratioMonzo} from '../src/core/ji-monzo.mjs';
import {buildDyadIndex,domainsForShape} from '../src/harmonic/harmonic-dyad-graph.mjs';
import {quotientCoordinate} from '../src/harmonic/harmonic-equivalence.mjs';

function targetsFor(state,{oddLimit=27,representationPolicy='octave',primeFilter=null}={}){
 return targetSet({oddLimit,primeFilter,mappingSubgroup:state.basis,representationPolicy});
}

const meantone=makeState('meantone'),meantoneTargets=targetsFor(meantone),meantoneContext=mappingContext(meantone);
const meantoneIndex=buildDyadIndex(meantoneTargets,meantoneContext);
assert.equal(meantoneIndex.equivalence,'octave');
assert.ok(Object.isFrozen(meantoneIndex)&&Object.isFrozen(meantoneIndex.vertices));

// Every target is classified by exact subgroup mapping, independently of cents.
for(const target of meantoneTargets.targets){
 const factorization=ratioMonzo(target.ratio,meantoneContext.basis);
 const coordinate=factorization.missingPrimes.length?null:mapMonzo(meantoneContext.rows,factorization.basisMonzo);
 const appearances=Object.values(meantoneIndex.byClassKey).flat().filter(item=>item.targetId===target.id);
 if(coordinate){
  assert.equal(appearances.length,1,`${target.ratio.label} has exactly one indexed quotient class`);
  assert.deepEqual(appearances[0].coordinate,coordinate);
 }else{
  assert.equal(appearances.length,0,`${target.ratio.label} outside the basis is not indexed`);
  assert.ok(meantoneIndex.unmappedTargets.some(item=>item.targetId===target.id));
 }
}

const aliases=meantoneIndex.vertices.find(vertex=>vertex.interpretations.some(item=>item.ratio==='9/8'));
assert.ok(aliases.interpretations.some(item=>item.ratio==='10/9'),'enharmonic target identities remain in the same dyad domain');
assert.ok(meantoneIndex.unmappedTargets.some(item=>item.ratio==='7/4'),'targets outside the actual subgroup remain explicitly excluded');
const expandedMeantoneIndex=buildDyadIndex(targetsFor(meantone,{oddLimit:97}),meantoneContext);
assert.ok(expandedMeantoneIndex.collapsedTargets.some(item=>item.ratio==='81/80'),'a non-unison JI target collapsed to unison is retained as an interpretation');
const unisonVertex=expandedMeantoneIndex.vertices.find(vertex=>vertex.isUnisonClass);
assert.ok(unisonVertex.interpretations.some(item=>item.ratio==='1/1'));
assert.ok(unisonVertex.interpretations.some(item=>item.ratio==='81/80'));

const testShape=projectCoordinateShape(meantone,[[0,0],[-1,2]]).identities.octave;
const shapeDomains=domainsForShape(testShape,meantoneIndex);
const forward=shapeDomains.edges.find(edge=>edge.fromMember===0&&edge.toMember===1);
const reverse=shapeDomains.edges.find(edge=>edge.fromMember===1&&edge.toMember===0);
assert.equal(shapeDomains.status,'dyadic');
assert.deepEqual(forward.coordinateDifference,[-1,2]);
assert.ok(forward.interpretations.some(item=>item.ratio==='9/8'));
assert.ok(forward.interpretations.some(item=>item.ratio==='10/9'));
assert.ok(reverse.interpretations.some(item=>item.ratio==='16/9'));
assert.ok(reverse.interpretations.some(item=>item.ratio==='9/5'));
assert.ok(forward.inverseTargetIds.includes(reverse.interpretations.find(item=>item.ratio==='16/9').targetId));
assert.deepEqual(domainsForShape({mappingId:meantoneContext.id,equivalence:'octave',coordinates:[[0,0],[0,1000000]]},meantoneIndex).status,'not-dyadic');
assert.throws(()=>domainsForShape({mappingId:meantoneContext.id,equivalence:'octave',coordinates:Array.from({length:9},(_,index)=>[0,index])},meantoneIndex),/limited to 8 members/);
assert.throws(()=>domainsForShape({...testShape,mappingId:'other'},meantoneIndex),/different mapping contexts/);
assert.throws(()=>buildDyadIndex(meantoneTargets,meantoneContext,{equivalence:'period'}),/requires octave equivalence/);

// Tuning is not an input to interval identity or graph membership.
const retuned={...meantone,p:meantone.p+0.1,g:meantone.g+0.2};
assert.deepEqual(buildDyadIndex(meantoneTargets,retuned),meantoneIndex);

// Pajara's mapped octave has two periods: [1,0] is a distinct octave residue.
const pajara=makeState('pajara11'),pajaraIndex=buildDyadIndex(targetsFor(pajara,{oddLimit:15}),pajara);
const residue=pajaraIndex.vertices.find(vertex=>vertex.interpretations.some(item=>item.ratio==='10/7'));
assert.ok(residue,'the exact target set contains a mapped first-octave-residue witness');
assert.deepEqual(residue.coordinate,[1,0]);
assert.notEqual(residue.key,pajaraIndex.vertices.find(vertex=>vertex.isUnisonClass).key);
assert.deepEqual(pajaraIndex.policy.vector,[2,0]);

// A reference prime other than 2 can put the mapped octave off the period axis. Vertices must
// remain physical coordinates even though quotient classes use a different coordinate basis.
for(const rows of [[[1,0,-1],[0,1,4]],[[1,1,0],[0,-1,4]],[[1,2,1],[0,2,3]]]){
 const mapping={basis:[3,2,5],rows},index=buildDyadIndex(targetsFor(mapping,{oddLimit:9}),mapping);
 assert.notEqual(index.policy.vector[1],0);
 assert.ok(index.vertices.some(vertex=>JSON.stringify(vertex.coordinate)!==vertex.key));
 for(const vertex of index.vertices){
  assert.equal(quotientCoordinate(index.policy,vertex.coordinate).key,vertex.key);
  for(const item of vertex.interpretations){
   assert.deepEqual(vertex.coordinate,quotientCoordinate(index.policy,item.coordinate).representative);
   assert.equal(JSON.stringify(item.classCoordinate),vertex.key,'target quotient labels retain their original meaning');
  }
 }
}

// Native exact analysis on a non-octave subgroup must retain 3/1 and its reciprocal.
const tritave=fromCommas('245/243','3.5.7','Computed CWE'),nativeTargets=targetsFor(tritave,{oddLimit:15,representationPolicy:'native-exact',primeFilter:[3,5,7]});
const nativeIndex=buildDyadIndex(nativeTargets,tritave);
assert.equal(nativeIndex.equivalence,'exact');
const tritaveInterval=Object.values(nativeIndex.byClassKey).flat().find(item=>item.ratio==='3/1');
assert.deepEqual(tritaveInterval.coordinate,[1,0]);
assert.equal(Object.values(nativeIndex.byClassKey).flat().find(item=>item.targetId===tritaveInterval.inverseTargetId).ratio,'1/3');
assert.throws(()=>buildDyadIndex(nativeTargets,tritave,{equivalence:'octave'}),/requires exact equivalence/);

console.log('Exact dyad domains preserve all mapped interpretations, inverses, collapsed targets, subgroup boundaries and non-octave residues.');
