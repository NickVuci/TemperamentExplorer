import {searchCheckpoint,finishSearch,finishSearchAsync} from './harmonic-cooperative.mjs';
import {immutable} from './cache.mjs';
import {domainsForShape} from './harmonic-dyad-graph.mjs';
import {mapMonzo} from './ji-monzo.mjs';

const DEFAULT_MAX_STATES=100_000;
const MAX_STATES=1_000_000;
const DEFAULT_MAX_COMPATIBILITY_CHECKS=1_000_000;
const MAX_COMPATIBILITY_CHECKS=10_000_000;
const subtract=(a,b)=>a.map((value,index)=>value-b[index]);
export const JI_LIFT_ALGORITHM_VERSION='ji-lift-csp-v1';
export const jiMonzoClassKey=(monzo,basis,equivalence)=>JSON.stringify(monzo.map((value,index)=>equivalence==='octave'&&basis[index]===2?0:value));

function normalizeBudget(value){
 const budget=Number.isSafeInteger(value)?{maxStates:value}:value??{};
 if(!budget||typeof budget!=='object'||Array.isArray(budget))throw Error('Lift budget must be a state limit or budget object.');
 const maxStates=budget.maxStates??DEFAULT_MAX_STATES,maxCompatibilityChecks=budget.maxCompatibilityChecks??DEFAULT_MAX_COMPATIBILITY_CHECKS;
 if(!Number.isSafeInteger(maxStates)||maxStates<1||maxStates>MAX_STATES)throw Error(`Lift state budget must be between 1 and ${MAX_STATES}.`);
 if(!Number.isSafeInteger(maxCompatibilityChecks)||maxCompatibilityChecks<1||maxCompatibilityChecks>MAX_COMPATIBILITY_CHECKS)throw Error(`Lift compatibility budget must be between 1 and ${MAX_COMPATIBILITY_CHECKS}.`);
 if(budget.signal!==undefined&&(!budget.signal||typeof budget.signal.aborted!=='boolean'))throw Error('Lift signal must be an AbortSignal.');
 if(budget.shouldCancel!==undefined&&typeof budget.shouldCancel!=='function')throw Error('Lift shouldCancel must be a function.');
 return {maxStates,maxCompatibilityChecks,signal:budget.signal??null,shouldCancel:budget.shouldCancel??null};
}

function coordinateDifferenceMultiple(targetCoordinate,desiredCoordinate,vector){
 if(!vector){if(targetCoordinate.some((value,index)=>value!==desiredCoordinate[index]))throw Error('Exact dyad target does not match the requested coordinate.');return 0;}
 const difference=desiredCoordinate.map((value,index)=>BigInt(value)-BigInt(targetCoordinate[index]));
 const basisIndex=vector.findIndex(value=>value!==0);
 if(basisIndex<0)throw Error('Mapped octave vector cannot be zero.');
 const component=BigInt(vector[basisIndex]);
 if(difference[basisIndex]%component!==0n)throw Error('Dyad target does not share the requested temperament class.');
 const multiple=difference[basisIndex]/component;
 if(difference.some((value,index)=>value!==multiple*BigInt(vector[index])))throw Error('Dyad target does not share the requested temperament class.');
 if(multiple>BigInt(Number.MAX_SAFE_INTEGER)||multiple<BigInt(Number.MIN_SAFE_INTEGER))throw Error('Dyad register lift exceeds the safe integer range.');
 return Number(multiple);
}

function liftMonzo(monzo,basis,registerLift){
 const result=[...monzo];
 if(registerLift){
  const octaveIndex=basis.indexOf(2);
  if(octaveIndex<0)throw Error('An octave lift requires prime 2 in the mapping subgroup.');
  result[octaveIndex]+=registerLift;
  if(!Number.isSafeInteger(result[octaveIndex]))throw Error('Lifted JI monzo exceeds the safe integer range.');
 }
 return result;
}

/** Lift one target representative so its exact map equals the requested edge coordinate. */
export function liftJIIntervalInterpretation(interpretation,coordinateDifference,index){
 if(!interpretation||!Array.isArray(interpretation.monzo)||!Array.isArray(interpretation.coordinate)||!index?.policy||!Array.isArray(index.basis)||!Array.isArray(index.rows))throw Error('Use a mapped JI interpretation and dyad index.');
 if(!Array.isArray(coordinateDifference)||coordinateDifference.length!==2||!coordinateDifference.every(Number.isSafeInteger))throw Error('Use an integer dyad coordinate.');
 const registerLift=coordinateDifferenceMultiple(interpretation.coordinate,coordinateDifference,index.policy.vector),monzo=liftMonzo(interpretation.monzo,index.basis,registerLift);
 const mapped=mapMonzo(index.rows,monzo);
 if(mapped.some((value,axis)=>value!==coordinateDifference[axis]))throw Error('Lifted JI interval does not map to the requested dyad coordinate.');
 return immutable({targetId:interpretation.targetId,ratio:interpretation.ratio,sourceMonzo:[...interpretation.monzo],monzo,
  sourceCoordinate:[...interpretation.coordinate],coordinate:[...coordinateDifference],registerLift,inverseTargetId:interpretation.inverseTargetId??null});
}

function makeCandidate(interpretation,memberIndex,rootCoordinate,index){
 const coordinateDifference=memberIndex===0?[0,0]:rootCoordinate,lifted=liftJIIntervalInterpretation(interpretation,coordinateDifference,index);
 return {
  ...lifted,
 };
}

function makeRootCandidate(basis){
 return {targetId:'root:unison',ratio:'1/1',sourceMonzo:basis.map(()=>0),monzo:basis.map(()=>0),coordinate:[0,0],sourceCoordinate:[0,0],registerLift:0};
}

function normalizeShapeCoordinates(shape,index){
 const raw=Array.isArray(shape.coordinates)?shape.coordinates:Array.isArray(shape.coordinatesOrClasses)?shape.coordinatesOrClasses:
  Array.isArray(shape.memberLinks)&&shape.memberLinks.length?[...shape.memberLinks].sort((a,b)=>a.memberIndex-b.memberIndex).map(member=>member.coordinate):
  Array.isArray(shape.classes)?shape.classes.map(item=>Array.isArray(item)?item:item?.coordinate):null;
 if(!raw?.length||raw.some(point=>!Array.isArray(point)||point.length!==2||!point.every(Number.isSafeInteger)))throw Error('Shape coordinates must be integer [period, generator] pairs.');
 if(shape.mappingId!==index.mappingId)throw Error('Shape and dyad index use different mapping contexts.');
 const kind=typeof shape.equivalence==='string'?shape.equivalence:shape.equivalence?.kind;
 if(kind!==index.equivalence)throw Error('Shape and dyad index use different equivalence policies.');
 return raw.map(point=>[...point]);
}

/**
 * Find one exact JI interpretation for every vertex of a supplied tempered
 * shape. Exhaustive failure is distinct from cancellation or budget exhaustion.
 */
export function* coherentJILiftSteps(shape,dyadIndex,budgetInput={}){
 const budget=normalizeBudget(budgetInput);
 if(!dyadIndex||dyadIndex.schemaVersion!==1||!Array.isArray(dyadIndex.basis)||!Array.isArray(dyadIndex.rows))throw Error('Use a shared exact dyad index.');
 const coordinates=normalizeShapeCoordinates(shape,dyadIndex);
 if(coordinates.length>8)throw Error('JI lift search is limited to 8 members.');
 const domains=domainsForShape(shape,dyadIndex),vertexCount=coordinates.length;
 const common={mappingId:dyadIndex.mappingId,targetSetId:dyadIndex.targetSetId,equivalence:dyadIndex.equivalence,shapeId:shape.id??null,
  bounds:{maxStates:budget.maxStates,maxCompatibilityChecks:budget.maxCompatibilityChecks}};
 const stats={exploredStates:0,compatibilityChecks:0,branchNodes:0,failedBranches:0,propagatedRemovals:0,domainWipeouts:0,memoHits:0,maxDepth:0,rootDomainCounts:[]};
 const result=(status,complete,extra={})=>immutable({...common,status,complete,stats:{...stats},...extra});

 if(domains.degenerate)return result('degenerate',true,{witness:null,reason:'repeated-or-insufficient-temperament-vertices'});
 if(domains.status==='not-dyadic')return result('not-dyadic',true,{witness:null,emptyEdges:domains.emptyEdges});
 if(domains.status!=='dyadic')throw Error('Dyad domains are incomplete or invalid.');

 const coordinatesRelative=coordinates.map((point,index)=>index===0?[0,0]:subtract(point,coordinates[0]));
 const edgeByPair=new Map(domains.edges.map(edge=>[`${edge.fromMember}:${edge.toMember}`,edge]));
 const allowed=new Map();
 for(const edge of domains.edges){
  allowed.set(`${edge.fromMember}:${edge.toMember}`,new Set(edge.interpretations.map(item=>jiMonzoClassKey(item.monzo,dyadIndex.basis,dyadIndex.equivalence))));
 }
 const root=makeRootCandidate(dyadIndex.basis),variableDomains=[ [root] ];
 for(let member=1;member<vertexCount;member++){
  const edge=edgeByPair.get(`0:${member}`);
  if(!edge)throw Error('Dyad index omitted a root edge.');
  const candidates=edge.interpretations.map(item=>makeCandidate(item,member,coordinatesRelative[member],dyadIndex))
   .sort((a,b)=>a.targetId.localeCompare(b.targetId,'en'));
  variableDomains.push(candidates);
 }
 stats.rootDomainCounts=[1,...variableDomains.slice(1).map(domain=>domain.length)];

 let stopReason=null;
 const deadStates=new Set(),compatibilityMemo=new Map();
 const representativeConflicts=[];
 const seenConflictKeys=new Set();
 const stopped=()=>{
  if(stopReason)return true;
  if(budget.signal?.aborted||budget.shouldCancel?.()){stopReason='cancelled';return true;}
  return false;
 };
 function* pairCompatible(fromMember,toMember,fromCandidate,toCandidate){
  const memoKey=JSON.stringify([fromMember,toMember,fromCandidate.targetId,toCandidate.targetId]);
  if(stopped())return false;
  if(compatibilityMemo.has(memoKey))return compatibilityMemo.get(memoKey);
  if(stats.compatibilityChecks>=budget.maxCompatibilityChecks){stopReason='compatibility-budget';return false;}
  stats.compatibilityChecks++;
  if((stats.compatibilityChecks&255)===0)yield searchCheckpoint;
  if((stats.compatibilityChecks&255)===0&&stopped())return false;
  const difference=subtract(toCandidate.monzo,fromCandidate.monzo),key=jiMonzoClassKey(difference,dyadIndex.basis,dyadIndex.equivalence);
  const compatible=allowed.get(`${fromMember}:${toMember}`)?.has(key)??false;
  compatibilityMemo.set(memoKey,compatible);
  return compatible;
 }

 function* propagate(inputDomains){
  const current=inputDomains.map(domain=>[...domain]);
  let changed=true;
  while(changed){
   if(stopped())return {unknown:true};
   changed=false;
   for(let member=1;member<vertexCount;member++){
    for(let other=0;other<vertexCount;other++){
     if(member===other)continue;
     const kept=[];
     for(const candidate of current[member]){
      let supported=false;
      let firstConflict=null;
      for(const alternative of current[other]){
       if(yield* pairCompatible(member,other,candidate,alternative)){supported=true;break;}
       if(stopReason)return {unknown:true};
       if(!firstConflict)firstConflict=alternative;
      }
      if(supported)kept.push(candidate);
      else if(firstConflict&&member!==0&&other!==0){
       const pairEdge=edgeByPair.get(`${member}:${other}`),pairInterpretation=pairEdge?.interpretations[0];
       const conflict={member,memberTargetId:candidate.targetId,memberRatio:candidate.ratio,otherMember:other,
        otherTargetId:firstConflict.targetId,otherRatio:firstConflict.ratio,pairTargetId:pairInterpretation?.targetId??null};
       const conflictKey=JSON.stringify(conflict);
       if(pairInterpretation&&!seenConflictKeys.has(conflictKey)&&representativeConflicts.length<16){seenConflictKeys.add(conflictKey);representativeConflicts.push(conflict);}
      }
     }
     if(kept.length!==current[member].length){stats.propagatedRemovals+=current[member].length-kept.length;current[member]=kept;changed=true;}
     if(!current[member].length){stats.domainWipeouts++;return {contradiction:true,domains:current};}
    }
   }
  }
  return {domains:current};
 }

 function stateKey(current){return JSON.stringify(current.map(domain=>domain.map(item=>item.targetId).sort()));}
 function chooseBranch(current){
  let chosen=-1;
  for(let member=1;member<vertexCount;member++)if(current[member].length>1&&
    (chosen<0||current[member].length<current[chosen].length||current[member].length===current[chosen].length&&member<chosen))chosen=member;
  return chosen;
 }
 function* search(current,depth){
  if(stopped())return {unknown:true};
  if(stats.exploredStates>=budget.maxStates){stopReason='state-budget';return {unknown:true};}
  stats.exploredStates++;if((stats.exploredStates&255)===0)yield searchCheckpoint;stats.maxDepth=Math.max(stats.maxDepth,depth);
  const propagated=yield* propagate(current);
  if(propagated.unknown)return {unknown:true};
  if(propagated.contradiction)return {failure:true};
  const reduced=propagated.domains,key=stateKey(reduced);
  if(deadStates.has(key)){stats.memoHits++;return {failure:true};}
  const branch=chooseBranch(reduced);
  if(branch<0)return {witness:reduced.map(domain=>domain[0])};
  stats.branchNodes++;
  for(const candidate of reduced[branch]){
   const next=reduced.map(domain=>[...domain]);next[branch]=[candidate];
   const found=yield* search(next,depth+1);
   if(found.witness||found.unknown)return found;
   stats.failedBranches++;
  }
  deadStates.add(key);
  return {failure:true};
 }

 const solved=yield* search(variableDomains,0);
 if(solved.unknown)return result('unknown',false,{reason:stopReason??'cancelled',witness:null});
 if(!solved.witness)return result('no-lift',true,{witness:null,obstruction:{exhaustive:true,rootDomainCounts:[...stats.rootDomainCounts],deadStateCount:deadStates.size,representativeConflicts}});

 const assigned=solved.witness,vertices=assigned.map((candidate,memberIndex)=>({memberIndex,targetId:candidate.targetId==='root:unison'?null:candidate.targetId,
  ratio:candidate.ratio,monzo:[...candidate.monzo],sourceMonzo:[...candidate.sourceMonzo],coordinate:[...candidate.coordinate],registerLift:candidate.registerLift}));
 const edgeAssignments=[];
 for(let fromMember=0;fromMember<vertexCount;fromMember++)for(let toMember=fromMember+1;toMember<vertexCount;toMember++){
  const difference=subtract(assigned[toMember].monzo,assigned[fromMember].monzo),key=jiMonzoClassKey(difference,dyadIndex.basis,dyadIndex.equivalence);
  const matching=edgeByPair.get(`${fromMember}:${toMember}`).interpretations.filter(item=>jiMonzoClassKey(item.monzo,dyadIndex.basis,dyadIndex.equivalence)===key);
  if(!matching.length)throw Error('Internal lift verification failed for a chord dyad.');
  const interpretation=matching[0],coordinate=coordinatesRelative[toMember].map((value,index)=>value-coordinatesRelative[fromMember][index]);
  const lifted=liftJIIntervalInterpretation(interpretation,coordinate,dyadIndex);
  edgeAssignments.push({fromMember,toMember,targetId:interpretation.targetId,ratio:interpretation.ratio,monzo:[...interpretation.monzo],
   liftedMonzo:lifted.monzo,registerLift:lifted.registerLift,coordinate:[...coordinate]});
 }
 for(const edge of edgeAssignments){
  const compatible=yield* pairCompatible(edge.fromMember,edge.toMember,assigned[edge.fromMember],assigned[edge.toMember]);
  if(stopReason)return result('unknown',false,{reason:stopReason,witness:null});
  if(!compatible)throw Error('Internal lift verification failed for a chord dyad.');
 }
 return result('liftable',true,{witness:{rootMember:0,vertices,edgeAssignments}});
}

export function findCoherentJILift(shape,index,budget={}){return finishSearch(coherentJILiftSteps(shape,index,budget));}
export function findCoherentJILiftAsync(shape,index,budget={},scheduler={}){return finishSearchAsync(coherentJILiftSteps(shape,index,budget),scheduler);}
