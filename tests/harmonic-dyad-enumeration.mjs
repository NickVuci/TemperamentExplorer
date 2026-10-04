import assert from 'node:assert/strict';
import {makeState,targetSet} from '../dist/engine.mjs';
import {fromCommas} from '../dist/tuning.mjs';
import {chordIdentity} from '../dist/chord-identity-v2.mjs';
import {projectChord} from '../dist/chord-projection-v2.mjs';
import {buildDyadIndex,domainsForShape,enumerateDyadicShapes} from '../dist/harmonic-dyad-graph.mjs';
import {quotientCoordinate,shapeKey} from '../dist/harmonic-equivalence.mjs';

function indexFor(state,{oddLimit=9,representationPolicy='octave',primeFilter=state.basis}={}){
 return buildDyadIndex(targetSet({oddLimit,primeFilter,mappingSubgroup:state.basis,representationPolicy}),state);
}
function enumerate(index,options){const iterator=enumerateDyadicShapes(index,options),shapes=[...iterator];return {shapes,progress:iterator.progress};}

function bruteForceRootedShapes(index,size){
 const root=index.vertices.find(vertex=>vertex.isUnisonClass),neighbors=index.vertices.filter(vertex=>vertex.key!==root.key),ids=new Set();
 const compatible=(a,b)=>{
  const ab=quotientCoordinate(index.policy,b.coordinate.map((value,axis)=>value-a.coordinate[axis])).key;
  const ba=quotientCoordinate(index.policy,a.coordinate.map((value,axis)=>value-b.coordinate[axis])).key;
  return (index.byClassKey[ab]?.length??0)>0&&(index.byClassKey[ba]?.length??0)>0;
 };
 function choose(selected,start,needed){
  if(!needed){const all=[root,...selected];if(all.every((vertex,i)=>all.slice(i+1).every(other=>compatible(vertex,other))))ids.add(shapeKey(index.policy,all.map(vertex=>vertex.coordinate)));return;}
  for(let position=start;position<=neighbors.length-needed;position++)choose([...selected,neighbors[position]],position+1,needed-1);
 }
 choose([],0,size-1);
 return ids;
}

const meantone=makeState('meantone'),index=indexFor(meantone),triads=enumerate(index,{sizes:[3]});
const oracle=bruteForceRootedShapes(index,3);
assert.deepEqual(new Set(triads.shapes.map(shape=>shape.id)),oracle,'bounded triangle enumeration matches an independent rooted-subset oracle');
assert.equal(triads.progress.complete,true);assert.equal(triads.progress.partial,false);
assert.ok(triads.progress.duplicateShapes>0,'rooted translations collapse by the shared shape key');
assert.equal(new Set(triads.shapes.map(shape=>shape.id)).size,triads.shapes.length);
for(const shape of triads.shapes)assert.equal(domainsForShape(shape,index).status,'dyadic');

const didymic=projectChord(meantone,chordIdentity('1:9/8:3/2:5/3')).shapeIdentities.octave;
const tetrads=enumerate(index,{sizes:[4]});
assert.ok(tetrads.shapes.some(shape=>shape.id===didymic.id),'the didymic temperament-specific shape is discovered from the finite graph');
const major=projectChord(meantone,chordIdentity('4:5:6')).shapeIdentities.octave;
assert.ok(triads.shapes.some(shape=>shape.id===major.id),'ordinary JI-liftable shapes remain candidates too');
const reflectedId=shapeKey(index.policy,[[0,0],[0,-1],[0,-4]]);
assert.notEqual(shapeKey(index.policy,[[0,0],[0,1],[0,4]]),reflectedId,'reflection/otonal-utonal duality is not collapsed into shape identity');

const capped=enumerate(index,{sizes:[3],maxCandidateShapes:1});
assert.equal(capped.shapes.length,1);assert.equal(capped.progress.complete,false);assert.equal(capped.progress.partial,true);assert.equal(capped.progress.reason,'candidate-cap');
const vertexCapped=enumerate(index,{sizes:[3],maxNeighborVertices:1});
assert.equal(vertexCapped.progress.complete,false);assert.equal(vertexCapped.progress.reason,'neighbor-limit');assert.ok(vertexCapped.progress.truncatedNeighborVertices>0);
const nodeCapped=enumerate(index,{sizes:[3],maxSearchNodes:1});
assert.equal(nodeCapped.progress.reason,'search-node-cap');assert.equal(nodeCapped.progress.partial,true);
const domainCapped=enumerate(index,{sizes:[3],maxDomainChecks:1});
assert.equal(domainCapped.progress.reason,'domain-check-cap');assert.equal(domainCapped.progress.uniqueShapesYielded,0);
const cancelled=enumerate(index,{sizes:[3],shouldCancel:()=>true});
assert.equal(cancelled.progress.reason,'cancelled');assert.equal(cancelled.progress.complete,false);
const early=enumerateDyadicShapes(index,{sizes:[3]});early.next();early.return();
assert.equal(early.progress.reason,'consumer-stopped');assert.equal(early.progress.complete,false);

const tritave=fromCommas('245/243','3.5.7','Computed CWE'),nativeIndex=indexFor(tritave,{oddLimit:15,representationPolicy:'native-exact',primeFilter:[3,5,7]});
const native=enumerate(nativeIndex,{sizes:[2]});
const tritaveVertex=nativeIndex.vertices.find(vertex=>vertex.interpretations.some(item=>item.ratio==='3/1'));
assert.deepEqual(tritaveVertex.coordinate,[1,0],'native exact indexing retains the reference-period interval');
assert.ok(native.shapes.some(shape=>shape.id===shapeKey(nativeIndex.policy,[[0,0],[1,0]])),'native exact enumeration retains the reference dyad shape');
assert.equal(native.progress.equivalence,'exact');

for(const bad of [{sizes:[]},{sizes:[9]},{maxNeighborVertices:0},{maxCandidateShapes:50001}])assert.throws(()=>enumerateDyadicShapes(index,bad));

console.log('Rooted dyadic enumeration matches the finite oracle, deduplicates translations and reports bounded coverage.');
