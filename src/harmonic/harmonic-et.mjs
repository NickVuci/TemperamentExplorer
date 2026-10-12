import {finishSearch,finishSearchAsync} from './harmonic-cooperative.mjs';
import {immutable} from '../core/cache.mjs';
import {domainsForShape} from './harmonic-dyad-graph.mjs';
import {isKernelVector,validateKernelWitness} from './harmonic-context.mjs';
import {mapMonzo} from '../core/ji-monzo.mjs';
import {canonicalHarmonicJSON,validateAssessment} from './harmonic-types.mjs';
import {findCoherentJILift,coherentJILiftSteps,JI_LIFT_ALGORITHM_VERSION,jiMonzoClassKey,liftJIIntervalInterpretation} from './harmonic-ji-lift.mjs';

export const ET_ALGORITHM_VERSION='et-assessment-v1';
const subtract=(a,b)=>a.map((value,index)=>value-b[index]);
const add=(a,b)=>a.map((value,index)=>value+b[index]);
const zero=vector=>vector.every(value=>value===0);

function shapeCoordinates(shape,index){
 if(!shape||typeof shape!=='object'||shape.mappingId!==index.mappingId)throw Error('Shape and dyad index use different mapping contexts.');
 const kind=typeof shape.equivalence==='string'?shape.equivalence:shape.equivalence?.kind;
 if(kind!==index.equivalence)throw Error('Shape and dyad index use different equivalence policies.');
 const points=Array.isArray(shape.coordinates)?shape.coordinates:Array.isArray(shape.coordinatesOrClasses)?shape.coordinatesOrClasses:
  Array.isArray(shape.memberLinks)&&shape.memberLinks.length?[...shape.memberLinks].sort((a,b)=>a.memberIndex-b.memberIndex).map(item=>item.coordinate):
  Array.isArray(shape.classes)?shape.classes.map(item=>Array.isArray(item)?item:item?.coordinate):null;
 if(!points?.length||points.some(point=>!Array.isArray(point)||point.length!==2||!point.every(Number.isSafeInteger)))throw Error('Shape coordinates must be integer [period, generator] pairs.');
 if(!shape.id||typeof shape.id!=='string')throw Error('ET assessment requires a stable shape ID.');
 return points.map(point=>[...point]);
}

function exactSum(vectors,width){return vectors.reduce((sum,vector)=>add(sum,vector),Array(width).fill(0));}
/** Construct exact comma evidence for an explicitly selected directed cycle. */
export function cycleWitness(shape,index,cycle){
 const coordinates=shapeCoordinates(shape,index),domains=domainsForShape(shape,index);
 if(domains.status!=='dyadic')throw Error('Cycle evidence requires a dyadic, nondegenerate shape.');
 if(!cycle||!Array.isArray(cycle.edges)||cycle.edges.length<3)throw Error('A comma witness needs a directed cycle of at least three edges.');
 const edges=cycle.edges;
 for(let position=0;position<edges.length;position++){
  const edge=edges[position],next=edges[(position+1)%edges.length];
  if(!Number.isSafeInteger(edge.fromMember)||!Number.isSafeInteger(edge.toMember)||edge.fromMember<0||edge.fromMember>=coordinates.length||edge.toMember<0||edge.toMember>=coordinates.length||edge.fromMember===edge.toMember)throw Error('Cycle edge has invalid member indices.');
  if(edge.toMember!==next.fromMember)throw Error('Cycle edges must form a closed directed path.');
 }
 const domainByPair=new Map(domains.edges.map(edge=>[`${edge.fromMember}:${edge.toMember}`,edge]));
 const selected=edges.map(edge=>{
  const domain=domainByPair.get(`${edge.fromMember}:${edge.toMember}`),interpretation=domain?.interpretations.find(item=>item.targetId===edge.targetId);
  if(!interpretation)throw Error(`Target ${edge.targetId} is not an interpretation of directed edge ${edge.fromMember}→${edge.toMember}.`);
  const coordinate=coordinates[edge.toMember].map((value,axis)=>value-coordinates[edge.fromMember][axis]);
  const lifted=liftJIIntervalInterpretation(interpretation,coordinate,index);
  return {fromMember:edge.fromMember,toMember:edge.toMember,targetId:interpretation.targetId,ratio:interpretation.ratio,
   monzo:[...interpretation.monzo],liftedMonzo:lifted.monzo,coordinate,registerLift:lifted.registerLift};
 });
 const mappedCoordinateSum=exactSum(selected.map(edge=>edge.coordinate),2);
 if(!zero(mappedCoordinateSum))throw Error('Cycle coordinates do not close in the supplied shape.');
 const rawMonzoSum=exactSum(selected.map(edge=>edge.monzo),index.basis.length),correctedMonzo=exactSum(selected.map(edge=>edge.liftedMonzo),index.basis.length);
 const registerCorrectionMonzo=subtract(correctedMonzo,rawMonzoSum),rawMappedSum=mapMonzo(index.rows,rawMonzoSum),correctedMappedSum=mapMonzo(index.rows,correctedMonzo);
 const kernel=validateKernelWitness({basis:index.basis,rows:index.rows},correctedMonzo);
 if(!kernel.valid||!isKernelVector({basis:index.basis,rows:index.rows},correctedMonzo))throw Error('Corrected cycle monzo is not an exact mapping-kernel vector.');
 const nontrivial=!zero(correctedMonzo);
 return immutable({
  kind:nontrivial?'comma':'register-only-cycle',mappingId:index.mappingId,targetSetId:index.targetSetId,equivalence:index.equivalence,shapeId:shape.id,
  vertices:[edges[0].fromMember,...edges.map(edge=>edge.toMember)],edges:selected,
  rawMonzoSum,registerCorrectionMonzo,correctedMonzo,rawMappedSum,correctedMappedSum,
  commaRatio:kernel.ratio,nontrivial,kernel:{valid:kernel.valid,mappingKey:kernel.mappingKey,image:kernel.image},
 });
}

function solverSummary(lift){
 return {algorithmVersion:JI_LIFT_ALGORITHM_VERSION,bounds:{...lift.bounds},complete:lift.complete,stats:{...lift.stats}};
}

function representativeCycleWitnesses(shape,index,lift,domains){
 const edgeByPair=new Map(domains.edges.map(edge=>[`${edge.fromMember}:${edge.toMember}`,edge])),witnesses=[],seen=new Set();
 for(const conflict of lift.obstruction?.representativeConflicts??[]){
  const memberRoot=edgeByPair.get(`0:${conflict.member}`)?.interpretations.find(item=>item.targetId===conflict.memberTargetId);
  const otherRoot=edgeByPair.get(`0:${conflict.otherMember}`)?.interpretations.find(item=>item.targetId===conflict.otherTargetId);
  const pairTarget=edgeByPair.get(`${conflict.member}:${conflict.otherMember}`)?.interpretations.find(item=>item.targetId===conflict.pairTargetId);
  const reverseTarget=otherRoot?.inverseTargetId?edgeByPair.get(`${conflict.otherMember}:0`)?.interpretations.find(item=>item.targetId===otherRoot.inverseTargetId):null;
  if(!memberRoot||!otherRoot||!pairTarget||!reverseTarget)continue;
  const cycle={edges:[
   {fromMember:0,toMember:conflict.member,targetId:memberRoot.targetId},
   {fromMember:conflict.member,toMember:conflict.otherMember,targetId:pairTarget.targetId},
   {fromMember:conflict.otherMember,toMember:0,targetId:reverseTarget.targetId},
  ]};
  const witness=cycleWitness(shape,index,cycle),key=JSON.stringify(witness.correctedMonzo);
  if(witness.nontrivial&&!seen.has(key)){seen.add(key);witnesses.push(witness);}
  if(witnesses.length>=6)break;
 }
 return witnesses;
}

/** Assess dyadic status and coherent JI lift relative to this exact target set. */
export function* assessETSteps(shape,index,budget={}){
 shapeCoordinates(shape,index);
 const domains=domainsForShape(shape,index);
 if(domains.degenerate)throw Error('ET assessment requires distinct temperament vertices.');
 const lift=yield* coherentJILiftSteps(shape,index,budget);const base={shapeId:shape.id,mappingId:index.mappingId,targetSetId:index.targetSetId,equivalence:index.equivalence,algorithmVersion:ET_ALGORITHM_VERSION,
  exploredStates:lift.stats.exploredStates,complete:lift.complete,search:solverSummary(lift)};
 let assessment;
 if(lift.status==='not-dyadic'){
  const first=domains.emptyEdges[0];
  assessment={...base,status:'not-dyadic',obstruction:{emptyEdge:[first.fromMember,first.toMember],allEdgesNonempty:false,domainCounts:domains.edges.map(edge=>({fromMember:edge.fromMember,toMember:edge.toMember,count:edge.interpretations.length}))}};
 }else if(lift.status==='liftable'){
  assessment={...base,status:'ji-liftable',liftWitness:lift.witness};
 }else if(lift.status==='no-lift'){
  const representativeCycles=representativeCycleWitnesses(shape,index,lift,domains);
  assessment={...base,status:'essentially-tempered',obstruction:{allEdgesNonempty:true,exhaustive:true,
   domainCounts:domains.edges.map(edge=>({fromMember:edge.fromMember,toMember:edge.toMember,count:edge.interpretations.length})),
   certificate:{kind:'complete-finite-all-pairs-search',algorithmVersion:JI_LIFT_ALGORITHM_VERSION,bounds:{...lift.bounds},stats:{...lift.stats},deadStateCount:lift.obstruction.deadStateCount},
   representativeCycles}};
 }else if(lift.status==='unknown'){
  assessment={...base,status:'unknown',complete:false,reason:lift.reason};
 }else throw Error(`Cannot assess a ${lift.status} shape as ET.`);
 return validateAssessment(assessment,{mappingId:index.mappingId,targetSetId:index.targetSetId,shapeId:shape.id});
}

function validLiftWitness(shape,index,witness){
 const coordinates=shapeCoordinates(shape,index),domains=domainsForShape(shape,index);
 if(witness.rootMember!==0||witness.vertices?.length!==coordinates.length)return false;
 const vertices=witness.vertices;
 for(let member=0;member<vertices.length;member++){
  const expected=member===0?[0,0]:subtract(coordinates[member],coordinates[0]);
  const vertex=vertices[member];
  if(vertex.memberIndex!==member||!Array.isArray(vertex.monzo)||mapMonzo(index.rows,vertex.monzo).some((value,axis)=>value!==expected[axis])||JSON.stringify(vertex.coordinate)!==JSON.stringify(expected))return false;
  if(member===0){if(vertex.targetId!==null||vertex.ratio!=='1/1'||vertex.monzo.some(value=>value!==0))return false;}
  else{
   const rootDomain=domains.edges.find(edge=>edge.fromMember===0&&edge.toMember===member),interpretation=rootDomain?.interpretations.find(item=>item.targetId===vertex.targetId);
   if(!interpretation||interpretation.ratio!==vertex.ratio)return false;
   const lifted=liftJIIntervalInterpretation(interpretation,expected,index);
   if(lifted.registerLift!==vertex.registerLift||JSON.stringify(lifted.monzo)!==JSON.stringify(vertex.monzo))return false;
  }
 }
 const edgeByPair=new Map(domains.edges.map(edge=>[`${edge.fromMember}:${edge.toMember}`,edge]));
 if(!Array.isArray(witness.edgeAssignments)||witness.edgeAssignments.length!==coordinates.length*(coordinates.length-1)/2)return false;
 const seen=new Set();
 for(const edge of witness.edgeAssignments){
  if(!Number.isSafeInteger(edge.fromMember)||!Number.isSafeInteger(edge.toMember)||edge.fromMember<0||edge.toMember<0||edge.fromMember>=coordinates.length||edge.toMember>=coordinates.length||edge.fromMember===edge.toMember)return false;
  const pairKey=[Math.min(edge.fromMember,edge.toMember),Math.max(edge.fromMember,edge.toMember)].join(':'),directedKey=`${edge.fromMember}:${edge.toMember}`;
  if(seen.has(pairKey))return false;seen.add(pairKey);
  const domain=edgeByPair.get(directedKey),interpretation=domain?.interpretations.find(item=>item.targetId===edge.targetId);
  if(!interpretation)return false;
  const expectedCoordinate=subtract(vertices[edge.toMember].coordinate,vertices[edge.fromMember].coordinate);
  if(JSON.stringify(expectedCoordinate)!==JSON.stringify(edge.coordinate))return false;
  const difference=subtract(vertices[edge.toMember].monzo,vertices[edge.fromMember].monzo);
  const lifted=liftJIIntervalInterpretation(interpretation,expectedCoordinate,index);
  if(lifted.registerLift!==edge.registerLift||JSON.stringify(lifted.monzo)!==JSON.stringify(edge.liftedMonzo)||JSON.stringify(difference)!==JSON.stringify(edge.liftedMonzo)||mapMonzo(index.rows,edge.liftedMonzo).some((value,axis)=>value!==edge.coordinate[axis]))return false;
  if(jiMonzoClassKey(difference,index.basis,index.equivalence)!==jiMonzoClassKey(interpretation.monzo,index.basis,index.equivalence))return false;
 }
 return true;
}

/** Recheck a stored ET result against the exact shape, mapping and target set. */
export function verifyETEvidence(assessment,shape,index){
 try{
  shapeCoordinates(shape,index);
  validateAssessment(assessment,{mappingId:index.mappingId,targetSetId:index.targetSetId,shapeId:shape.id});
  const domains=domainsForShape(shape,index);
  if(assessment.status==='not-dyadic'){
   const [fromMember,toMember]=assessment.obstruction.emptyEdge;
   const counts=domains.edges.map(edge=>({fromMember:edge.fromMember,toMember:edge.toMember,count:edge.interpretations.length}));
   const valid=domains.emptyEdges.some(edge=>edge.fromMember===fromMember&&edge.toMember===toMember)&&canonicalHarmonicJSON(counts)===canonicalHarmonicJSON(assessment.obstruction.domainCounts);
   return immutable({valid,proofComplete:true,status:assessment.status,reason:valid?null:'empty-edge-witness-mismatch'});
  }
  if(assessment.status==='ji-liftable'){
   const valid=domains.status==='dyadic'&&validLiftWitness(shape,index,assessment.liftWitness);
   return immutable({valid,proofComplete:true,status:assessment.status,reason:valid?null:'lift-witness-mismatch'});
  }
  if(assessment.status==='essentially-tempered'){
   if(domains.status!=='dyadic'||assessment.obstruction.allEdgesNonempty!==true||assessment.obstruction.exhaustive!==true||assessment.search?.algorithmVersion!==JI_LIFT_ALGORITHM_VERSION)return immutable({valid:false,proofComplete:false,status:assessment.status,reason:'incomplete-or-version-mismatched-certificate'});
   const certificate=assessment.obstruction.certificate,bounds=certificate?.bounds;
   if(certificate?.algorithmVersion!==JI_LIFT_ALGORITHM_VERSION||!bounds||JSON.stringify(bounds)!==JSON.stringify(assessment.search.bounds)||!Array.isArray(assessment.obstruction.representativeCycles)||assessment.obstruction.representativeCycles.length===0)return immutable({valid:false,proofComplete:false,status:assessment.status,reason:'missing-search-or-cycle-evidence'});
   const counts=domains.edges.map(edge=>({fromMember:edge.fromMember,toMember:edge.toMember,count:edge.interpretations.length}));
   if(canonicalHarmonicJSON(counts)!==canonicalHarmonicJSON(assessment.obstruction.domainCounts))return immutable({valid:false,proofComplete:false,status:assessment.status,reason:'dyad-domain-count-mismatch'});
   const replay=findCoherentJILift(shape,index,bounds);
   if(replay.status!=='no-lift'||replay.complete!==true||canonicalHarmonicJSON(replay.stats)!==canonicalHarmonicJSON(certificate.stats)||replay.obstruction.deadStateCount!==certificate.deadStateCount||canonicalHarmonicJSON(assessment.search.stats)!==canonicalHarmonicJSON(certificate.stats))return immutable({valid:false,proofComplete:false,status:assessment.status,reason:'search-certificate-replay-failed'});
   const cycles=assessment.obstruction.representativeCycles??[];
   for(const stored of cycles){
    const replayed=cycleWitness(shape,index,{edges:stored.edges});
    if(!replayed.nontrivial||!replayed.kernel.valid||JSON.stringify(replayed.correctedMonzo)!==JSON.stringify(stored.correctedMonzo)||replayed.commaRatio!==stored.commaRatio)return immutable({valid:false,proofComplete:true,status:assessment.status,reason:'cycle-witness-mismatch'});
   }
   return immutable({valid:true,proofComplete:true,status:assessment.status,verifiedCycles:cycles.length,exploredStates:replay.stats.exploredStates});
  }
  if(assessment.status==='unknown'){
   let valid=assessment.complete===false&&!assessment.liftWitness&&domains.status==='dyadic'&&assessment.search?.complete===false&&assessment.search.algorithmVersion===JI_LIFT_ALGORITHM_VERSION;
   if(valid&&['state-budget','compatibility-budget'].includes(assessment.reason)){
    const replay=findCoherentJILift(shape,index,assessment.search.bounds);
    valid=replay.status==='unknown'&&replay.reason===assessment.reason&&canonicalHarmonicJSON(replay.stats)===canonicalHarmonicJSON(assessment.search.stats);
   }else if(valid&&assessment.reason!=='cancelled')valid=false;
   return immutable({valid,proofComplete:false,status:assessment.status,reason:valid?assessment.reason:'invalid-unknown-state'});
  }
  return immutable({valid:false,proofComplete:false,status:assessment.status,reason:'unsupported-assessment-status'});
 }catch(error){return immutable({valid:false,proofComplete:false,status:assessment?.status??null,reason:'invalid-evidence',detail:error.message});}
}

export function assessET(shape,index,budget={}){return finishSearch(assessETSteps(shape,index,budget));}
export function assessETAsync(shape,index,budget={},scheduler={}){return finishSearchAsync(assessETSteps(shape,index,budget),scheduler);}
