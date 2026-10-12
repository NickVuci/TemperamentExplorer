import {searchCheckpoint} from './harmonic-cooperative.mjs';
import {BoundedCache,immutable} from '../core/cache.mjs';
import {mappingContext} from './harmonic-context.mjs';
import {equivalencePolicy,quotientCoordinate,shapeKey} from './harmonic-equivalence.mjs';
import {mappedIntervals} from './harmonic-intervals.mjs';
import {ratioMonzo} from '../core/ji-monzo.mjs';
import {targetId,targetSetIdentity} from '../core/ji-limit-engine.mjs';
import {MAX_CHORD_TONES} from '../chords/chord-identity.mjs';

const cache=new BoundedCache(12);
const compareCoordinate=(a,b)=>a[0]-b[0]||a[1]-b[1];
const pairKey=coordinate=>JSON.stringify(coordinate);

function requestedEquivalence(targetSet,equivalence){
 const expected=targetSet.spec.representationPolicy==='native-exact'?'exact':'octave';
 if(equivalence!==undefined&&equivalence!==expected)throw Error(`The ${targetSet.spec.representationPolicy} target policy requires ${expected} equivalence.`);
 return expected;
}

function targetInverseId(spec,ratio){
 return targetId(spec,{n:ratio.d,d:ratio.n});
}

/**
 * Index every mapped interpretation in one finite target set by its exact
 * temperament class. A class is one graph vertex; distinct JI targets that
 * collapse to that class remain separate interpretations of the same vertex.
 */
export function buildDyadIndex(targetSet,mapping,{equivalence:requested}={}){
 if(!targetSet||!targetSet.spec||!Array.isArray(targetSet.targets)||typeof targetSet.id!=='string')throw Error('Use a shared JI target set.');
 if(targetSet.id!==targetSetIdentity(targetSet.spec))throw Error('Dyad indexing requires a canonical shared target set.');
 const context=mappingContext(mapping),equivalence=requestedEquivalence(targetSet,requested),policy=equivalencePolicy(context,equivalence);
 const cacheKey=JSON.stringify([targetSet.id,context.id,context.basis,context.rows,equivalence]);
 return cache.get(cacheKey,()=>{
  const intervals=mappedIntervals(targetSet,context,{equivalences:[equivalence]}),targetById=new Map(targetSet.targets.map(target=>[target.id,target]));
  const mapped=[],unmappedTargets=[];
  for(const interval of intervals){
   if(!interval.coordinate){unmappedTargets.push({targetId:interval.targetId,ratio:interval.ratio.label,missingPrimes:interval.missingPrimes});continue;}
   const classEntry=interval.classKeys[equivalence];
   if(!classEntry?.available)throw Error(`Mapped target ${interval.targetId} has no ${equivalence} class.`);
   const target=targetById.get(interval.targetId),factorization=ratioMonzo(interval.ratio,context.basis);
   const inverseTargetId=targetInverseId(targetSet.spec,interval.ratio),inversePresent=targetById.has(inverseTargetId);
   mapped.push({
    targetId:interval.targetId,
    ratio:interval.ratio.label,
    monzo:factorization.basisMonzo,
    coordinate:[...interval.coordinate],
    classCoordinate:[...classEntry.classCoordinate],
    classKey:classEntry.key,
    idealCents:interval.idealCents,
    inverseTargetId:inversePresent?inverseTargetId:null,
    collapsed:classEntry.key===quotientCoordinate(policy,[0,0]).key&&interval.ratio.label!=='1/1',
   });
  }
  mapped.sort((a,b)=>a.classKey.localeCompare(b.classKey,'en')||a.targetId.localeCompare(b.targetId,'en'));

  const groups=new Map();
  for(const interpretation of mapped){
   // Graph differences use period/generator coordinates, not the transformed quotient labels.
   // They differ when the mapped octave is not on the period axis.
   if(!groups.has(interpretation.classKey))groups.set(interpretation.classKey,{key:interpretation.classKey,
    coordinate:quotientCoordinate(policy,interpretation.coordinate).representative,interpretations:[]});
   groups.get(interpretation.classKey).interpretations.push(interpretation);
  }
  const vertices=[...groups.values()].sort((a,b)=>compareCoordinate(a.coordinate,b.coordinate)).map(group=>({
   ...group,
   interpretations:group.interpretations.sort((a,b)=>a.targetId.localeCompare(b.targetId,'en')),
   targetIds:group.interpretations.map(item=>item.targetId),
   isUnisonClass:group.key===quotientCoordinate(policy,[0,0]).key,
  }));
  const byClassKey=Object.fromEntries(vertices.map(vertex=>[vertex.key,vertex.interpretations]));
  return immutable({
   schemaVersion:1,
   mappingId:context.id,
   basis:[...context.basis],
   rows:context.rows.map(row=>[...row]),
   targetSetId:targetSet.id,
   targetSetSpec:targetSet.spec,
   equivalence,
   policy,
   vertices,
   byClassKey,
   collapsedTargets:mapped.filter(item=>item.collapsed),
   unmappedTargets:unmappedTargets.sort((a,b)=>a.targetId.localeCompare(b.targetId,'en')),
   completeness:{complete:targetSet.completeness?.complete===true,targetCount:intervals.length,mappedCount:mapped.length,unmappedCount:unmappedTargets.length},
  });
 });
}

function shapeEquivalence(shape){
 return typeof shape.equivalence==='string'?shape.equivalence:shape.equivalence?.kind;
}
function shapeCoordinates(shape){
 if(Array.isArray(shape.coordinates))return shape.coordinates;
 if(Array.isArray(shape.coordinatesOrClasses))return shape.coordinatesOrClasses;
 if(Array.isArray(shape.memberLinks)&&shape.memberLinks.length)return [...shape.memberLinks].sort((a,b)=>a.memberIndex-b.memberIndex).map(item=>item.coordinate);
 if(Array.isArray(shape.classes))return shape.classes.map(item=>Array.isArray(item)?item:item?.coordinate);
 throw Error('Shape must supply coordinates or coordinate classes.');
}

/** Build all directed target-interpretation domains for a supplied shape. */
export function domainsForShape(shape,index){
 if(!shape||typeof shape!=='object'||!index||index.schemaVersion!==1)throw Error('Use a shape and a dyad index.');
 if(shape.mappingId!==index.mappingId)throw Error('Shape and dyad index use different mapping contexts.');
 if(shapeEquivalence(shape)!==index.equivalence)throw Error('Shape and dyad index use different equivalence policies.');
 if(shape.policyId&&shape.policyId!==index.policy.id)throw Error('Shape and dyad index use different quotient policies.');
 const coordinates=shapeCoordinates(shape);
 if(!coordinates.length||coordinates.some(point=>!Array.isArray(point)||point.length!==2||!point.every(Number.isSafeInteger)))throw Error('Shape coordinates must be integer [period, generator] pairs.');
 if(coordinates.length>MAX_CHORD_TONES)throw Error(`Dyad shape inspection is limited to ${MAX_CHORD_TONES} members.`);
 const pointKeys=coordinates.map(point=>quotientCoordinate(index.policy,point).key),edges=[];
 for(let fromMember=0;fromMember<coordinates.length;fromMember++)for(let toMember=0;toMember<coordinates.length;toMember++){
  if(fromMember===toMember)continue;
  const coordinateDifference=coordinates[toMember].map((value,axis)=>value-coordinates[fromMember][axis]);
  const quotient=quotientCoordinate(index.policy,coordinateDifference),interpretations=index.byClassKey[quotient.key]??[];
  edges.push({fromMember,toMember,coordinateDifference,classCoordinate:quotient.classCoordinate,classKey:quotient.key,
   inverseFromMember:toMember,inverseToMember:fromMember,inverseTargetIds:interpretations.map(item=>item.inverseTargetId).filter(Boolean),
   interpretations,empty:interpretations.length===0});
 }
 const emptyEdges=edges.filter(edge=>edge.empty).map(({fromMember,toMember,classCoordinate})=>({fromMember,toMember,classCoordinate}));
 const degenerate=coordinates.length<2||new Set(pointKeys).size!==pointKeys.length;
 return immutable({
  mappingId:index.mappingId,targetSetId:index.targetSetId,equivalence:index.equivalence,
  shapeId:shape.id??null,vertexCount:coordinates.length,distinctVertexCount:new Set(pointKeys).size,
  edgeCount:edges.length,dyadic:!degenerate&&emptyEdges.length===0,degenerate,
  status:degenerate?'degenerate':emptyEdges.length?'not-dyadic':'dyadic',emptyEdges,edges,
 });
}

const ENUMERATION_BOUNDS=Object.freeze({maxNeighborVertices:128,maxCandidateShapes:5000,maxSearchNodes:1_000_000,maxDomainChecks:50_000});
const ENUMERATION_HARD_CAPS=Object.freeze({maxNeighborVertices:512,maxCandidateShapes:50_000,maxSearchNodes:10_000_000,maxDomainChecks:2_000_000});

function enumerationOptions(options={}){
 if(!options||typeof options!=='object'||Array.isArray(options))throw Error('Shape enumeration options must be an object.');
 const bounds={};
 for(const name of Object.keys(ENUMERATION_BOUNDS)){
  const value=options[name]??ENUMERATION_BOUNDS[name];
  if(!Number.isSafeInteger(value)||value<1||value>ENUMERATION_HARD_CAPS[name])throw Error(`${name} must be an integer from 1 through ${ENUMERATION_HARD_CAPS[name]}.`);
  bounds[name]=value;
 }
 const rawSizes=options.sizes??[3,4];
 if(!Array.isArray(rawSizes)||!rawSizes.length||rawSizes.some(size=>!Number.isSafeInteger(size)||size<2||size>MAX_CHORD_TONES))throw Error(`Request chord sizes from 2 through ${MAX_CHORD_TONES}.`);
 const sizes=[...new Set(rawSizes)].sort((a,b)=>a-b);
 if(options.signal!==undefined&&(!options.signal||typeof options.signal.aborted!=='boolean'))throw Error('Enumeration signal must be an AbortSignal.');
 if(options.shouldCancel!==undefined&&typeof options.shouldCancel!=='function')throw Error('Enumeration shouldCancel must be a function.');
 return {bounds,sizes,signal:options.signal??null,shouldCancel:options.shouldCancel??null};
}

function snapshot(state){
 return immutable({schemaVersion:1,mappingId:state.mappingId,targetSetId:state.targetSetId,equivalence:state.equivalence,
  bounds:{...state.bounds},sizes:[...state.sizes],availableNeighborVertices:state.availableNeighborVertices,
  includedNeighborVertices:state.includedNeighborVertices,truncatedNeighborVertices:state.truncatedNeighborVertices,
  searchNodes:state.searchNodes,domainChecks:state.domainChecks,candidateShapesChecked:state.candidateShapesChecked,
  uniqueShapesYielded:state.uniqueShapesYielded,duplicateShapes:state.duplicateShapes,
  complete:state.complete,partial:!state.complete,reason:state.reason});
}

/**
 * Enumerate bounded rooted dyadic cliques. The returned one-shot iterator has
 * a live `progress` snapshot so callers can report truncation honestly.
 */
export function enumerateDyadicShapeSteps(index,options={}){
 if(!index||index.schemaVersion!==1||!index.policy||!Array.isArray(index.vertices)||!index.byClassKey)throw Error('Use a shared dyad index.');
 const normalized=enumerationOptions(options),state={mappingId:index.mappingId,targetSetId:index.targetSetId,equivalence:index.equivalence,
  bounds:normalized.bounds,sizes:normalized.sizes,availableNeighborVertices:0,includedNeighborVertices:0,truncatedNeighborVertices:0,
  searchNodes:0,domainChecks:0,candidateShapesChecked:0,uniqueShapesYielded:0,duplicateShapes:0,complete:false,reason:null};
 const stopped=()=>{
  if(state.reason)return true;
  if(normalized.signal?.aborted||normalized.shouldCancel?.()){state.reason='cancelled';return true;}
  return false;
 };
 const spendDomainChecks=amount=>{
  if(state.domainChecks+amount>state.bounds.maxDomainChecks){state.reason='domain-check-cap';return false;}
  state.domainChecks+=amount;return true;
 };
 const hasDomain=(from,to)=>{
  const difference=to.map((value,axis)=>value-from[axis]),key=quotientCoordinate(index.policy,difference).key;
  return (index.byClassKey[key]?.length??0)>0;
 };
 function* generate(){
  let naturallyFinished=false;
  try{
   const root=index.vertices.find(vertex=>vertex.isUnisonClass);
   if(!root){state.reason='missing-unison-vertex';return;}
   const candidates=[];
   for(const vertex of index.vertices){
    if(stopped())return;
    if(vertex.key===root.key)continue;
    if(!spendDomainChecks(2))return;
    if((state.domainChecks&255)===0)yield searchCheckpoint;
    const forward=hasDomain(root.coordinate,vertex.coordinate),reverse=hasDomain(vertex.coordinate,root.coordinate);
    if(forward&&reverse)candidates.push(vertex);
   }
   candidates.sort((a,b)=>compareCoordinate(a.coordinate,b.coordinate)||a.key.localeCompare(b.key,'en'));
   state.availableNeighborVertices=candidates.length;
   const selected=candidates.slice(0,state.bounds.maxNeighborVertices);
   state.includedNeighborVertices=selected.length;
   state.truncatedNeighborVertices=candidates.length-selected.length;
   const neighborLimit=state.truncatedNeighborVertices>0;

   const vertices=[root,...selected],adjacency=Array.from({length:vertices.length},()=>Array(vertices.length).fill(false));
   for(let a=1;a<vertices.length;a++){
    adjacency[0][a]=adjacency[a][0]=true;
    for(let b=a+1;b<vertices.length;b++){
     if(stopped())return;
     if(!spendDomainChecks(2))return;
    if((state.domainChecks&255)===0)yield searchCheckpoint;
     const forward=hasDomain(vertices[a].coordinate,vertices[b].coordinate),reverse=hasDomain(vertices[b].coordinate,vertices[a].coordinate);
     const compatible=forward&&reverse;
     adjacency[a][b]=adjacency[b][a]=compatible;
    }
   }
   // Class of every vertex difference. A shape found rooted at each of its members appears once
   // per rooting; only the rooting whose class list is least is yielded, so shapeKey runs once per
   // shape. A truncated neighbourhood can omit that rooting, so it keeps the identity check instead.
   const classIds=new Map(),classId=point=>{const key=quotientCoordinate(index.policy,point).key;let id=classIds.get(key);if(id===undefined){id=classIds.size;classIds.set(key,id);}return id;};
   const difference=neighborLimit?null:vertices.map(a=>vertices.map(b=>classId([b.coordinate[0]-a.coordinate[0],b.coordinate[1]-a.coordinate[1]])));
   const rootingList=(anchor,members)=>members.map(member=>difference[anchor][member]).sort((x,y)=>x-y);
   const lessList=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]<b[i];return false;};
   const canonicalRooting=members=>{const own=rootingList(members[0],members);for(let i=1;i<members.length;i++)if(lessList(rootingList(members[i],members),own))return false;return true;};
   const seenShapeIds=new Set();
   for(const size of normalized.sizes){
    if(size>vertices.length)continue;
    function* walk(chosen,candidateIndices,chosenIndices){
     if(stopped())return;
     if(chosen.length===size){
      if(state.candidateShapesChecked>=state.bounds.maxCandidateShapes){state.reason=state.reason??'candidate-cap';return;}
      state.candidateShapesChecked++;
      if(difference&&!canonicalRooting(chosenIndices)){state.duplicateShapes++;return;}
      const coordinates=chosen.map(vertex=>vertex.coordinate),id=shapeKey(index.policy,coordinates);
      if(seenShapeIds.has(id)){state.duplicateShapes++;return;}
      seenShapeIds.add(id);state.uniqueShapesYielded++;
      yield immutable({id,mappingId:index.mappingId,targetSetId:index.targetSetId,equivalence:index.equivalence,
       policyId:index.policy.id,coordinates:coordinates.map(point=>[...point]),
       memberTargetIds:chosen.map(vertex=>[...vertex.targetIds]),source:'rooted-dyadic-clique'});
      return;
     }
     const needed=size-chosen.length;
     for(let position=0;position<candidateIndices.length;position++){
      if(stopped())return;
      if(state.searchNodes>=state.bounds.maxSearchNodes){state.reason=state.reason??'search-node-cap';return;}
      state.searchNodes++;if((state.searchNodes&255)===0)yield searchCheckpoint;
      const candidateIndex=candidateIndices[position],candidate=vertices[candidateIndex];
      const rest=candidateIndices.slice(position+1).filter(other=>adjacency[candidateIndex][other]);
      if(rest.length<needed-1)continue;
      yield* walk([...chosen,candidate],rest,[...chosenIndices,candidateIndex]);
      if(state.reason)return;
     }
    }
    yield* walk([root],selected.map((_,position)=>position+1),[0]);
    if(state.reason)break;
   }
   naturallyFinished=!state.reason;
   if(naturallyFinished&&!neighborLimit)state.complete=true;
   else if(naturallyFinished&&neighborLimit)state.reason='neighbor-limit';
  }finally{
   if(!naturallyFinished&&!state.reason)state.reason='consumer-stopped';
   if(state.truncatedNeighborVertices)state.complete=false;
  }
 }
 const iterator=generate();
 Object.defineProperty(iterator,'progress',{enumerable:true,get:()=>snapshot(state)});
 return iterator;
}

export function enumerateDyadicShapes(index,options={}){
 const steps=enumerateDyadicShapeSteps(index,options);
 const iterator=(function*(){try{for(const value of steps)if(value!==searchCheckpoint)yield value;}finally{steps.return();}})();
 Object.defineProperty(iterator,"progress",{get:()=>steps.progress});return iterator;
}
