import {immutable} from './cache.mjs';
import {mappingContext} from './harmonic-context.mjs';
import {equivalencePolicy,quotientCoordinate} from './harmonic-equivalence.mjs';
import {mapMonzo,ratioMonzo} from './ji-monzo.mjs';

const EQUIVALENCES=['exact','period','octave'];
const pairKey=coordinate=>JSON.stringify(coordinate);
function targetRatio(target){
 const n=target?.ratio?.n??target?.n,d=target?.ratio?.d??target?.d;
 if(!Number.isSafeInteger(n)||n<=0||!Number.isSafeInteger(d)||d<=0)throw Error('JI target must contain a positive integer ratio.');
 return {n,d,label:target?.ratio?.label??target?.label??`${n}/${d}`,idealCents:target?.idealCents??target?.c??1200*Math.log2(n/d)};
}
function samePrimeSet(a,b){return a.length===b.length&&[...a].sort((x,y)=>x-y).every((value,index)=>value===[...b].sort((x,y)=>x-y)[index]);}
export function signedIntervalError(actualCents,idealCents){
 if(!Number.isFinite(actualCents)||!Number.isFinite(idealCents))throw Error('Interval error requires finite cents values.');
 return actualCents-idealCents;
}

/**
 * Project a finite JI target set through one fixed integer mapping. Tuning is
 * deliberately absent: a mapped target stays mapped at every tuning.
 */
export function mappedIntervals(targetSet,mapping,{equivalences=EQUIVALENCES}={}){
 if(!targetSet||!Array.isArray(targetSet.targets)||!targetSet.spec||!targetSet.id)throw Error('Use a validated JI target set.');
 const context=mappingContext(mapping),basis=[...context.basis];
 if(!samePrimeSet(targetSet.spec.mappingSubgroup,basis))throw Error('Target-set subgroup does not match the mapping basis.');
 return projectTargets(targetSet.targets,context,targetSet.id,equivalences);
}

/** Compatibility projection for caller-supplied target rows; uses the same exact mapper/index. */
export function mappedIntervalsFromTargets(targets,mapping,{targetSetId='explicit-target-list',equivalences=EQUIVALENCES}={}){
 if(!Array.isArray(targets))throw Error('Explicit JI targets must be an array.');
 const context=mappingContext(mapping);
 const records=targets.map((target,index)=>{
  const ratio=targetRatio(target);
  return {...target,id:target.id??`explicit-target-v1:${index}:${ratio.label}`,ratio:{n:ratio.n,d:ratio.d,label:ratio.label},idealCents:ratio.idealCents};
 });
 return projectTargets(records,context,targetSetId,equivalences);
}

function projectTargets(targets,context,targetSetId,equivalences){
 const basis=[...context.basis];
 if(!Array.isArray(equivalences)||equivalences.some(kind=>!EQUIVALENCES.includes(kind)))throw Error('Request exact, period, or octave equivalence.');
 const policies={};
 for(const kind of new Set(['exact','period',...equivalences])){
  try{policies[kind]=equivalencePolicy(context,kind);}catch(error){if(kind!=='octave')throw error;}
 }
 return immutable(targets.map(target=>{
  const ratio=targetRatio(target),factorization=ratioMonzo([ratio.n,ratio.d],basis);
  const coordinate=factorization.withinBasis?mapMonzo(context.rows,factorization.basisMonzo):null;
  const classKeys={};
  for(const kind of equivalences){
   const policy=policies[kind];
   if(!policy){classKeys[kind]={available:false,reason:'Octave is not in the mapping subgroup.'};continue;}
   if(!coordinate){classKeys[kind]={available:false,reason:'JI interval is outside the mapping subgroup.'};continue;}
   const quotient=quotientCoordinate(policy,coordinate);
   classKeys[kind]={available:true,policyId:policy.id,policy,key:quotient.key,classCoordinate:quotient.classCoordinate};
  }
  return {
   id:`mapped-interval-v1:${JSON.stringify([target.id,context.id])}`,
   targetId:target.id,targetSetId,mappingId:context.id,
   ratio,monzo:factorization.sparseMonzo,missingPrimes:factorization.missingPrimes,
   coordinate,fullKey:coordinate?pairKey(coordinate):null,classKeys,
   idealCents:ratio.idealCents,registerPolicy:target.registerPolicy,
  };
 }));
}

/** Index every JI interpretation at its exact or declared quotient coordinate. */
export function indexByCoordinate(intervals,{equivalence='exact'}={}){
 if(!Array.isArray(intervals)||!intervals.length)throw Error('Index at least one mapped-interval record.');
 if(!EQUIVALENCES.includes(equivalence))throw Error('Choose exact, period, or octave coordinate indexing.');
 const mappingId=intervals[0].mappingId;
 if(intervals.some(record=>record.mappingId!==mappingId))throw Error('Interval index cannot mix mapping contexts.');
 const groups=new Map();let policy=null;
 for(const interval of intervals){
  const entry=interval.classKeys?.[equivalence];
  if(!entry?.available)continue;
  if(policy&&policy.id!==entry.policyId)throw Error('Interval index cannot mix equivalence policies.');
  policy=entry.policy;
  if(!groups.has(entry.key))groups.set(entry.key,[]);
  groups.get(entry.key).push(interval);
 }
 if(!policy)throw Error(`No ${equivalence} quotient policy is available for this mapping.`);
 const keys=Object.fromEntries([...groups].sort(([a],[b])=>a.localeCompare(b,'en')).map(([key,values])=>[key,values.sort((a,b)=>a.targetId.localeCompare(b.targetId,'en'))]));
 return immutable({schemaVersion:1,mappingId,equivalence,policyId:policy?.id??null,policy,available:!!policy,keys});
}

/** Return all exact target interpretations for one coordinate/class, not just the first alias. */
export function edgeInterpretations(index,coordinate){
 if(!index||index.schemaVersion!==1||!EQUIVALENCES.includes(index.equivalence)||!index.keys)throw Error('Use a mapped interval coordinate index.');
 if(!index.available)throw Error(`Index has no ${index.equivalence} quotient policy for this mapping.`);
 if(!Array.isArray(coordinate)||coordinate.length!==2||!coordinate.every(Number.isSafeInteger))throw Error('Use an integer [period, generator] coordinate.');
 const key=quotientCoordinate(index.policy,coordinate).key;
 return index.keys[key]??[];
}

/** Compute a tuning-specific error view without changing the interval record. */
export function intervalError(interval,tuning){
 if(!interval||interval.coordinate!==null&&!Array.isArray(interval.coordinate))throw Error('Use a mapped-interval record.');
 if(!tuning||tuning.mappingId!==interval.mappingId)throw Error('Tuning context does not match the mapped interval.');
 const periodCents=tuning.periodCents??tuning.p,generatorCents=tuning.generatorCents??tuning.g;
 if(!Number.isFinite(periodCents)||periodCents<=0||!Number.isFinite(generatorCents)||generatorCents<=0)throw Error('Tuning needs positive finite period and generator cents.');
 const common={intervalId:interval.id,targetId:interval.targetId,mappingId:interval.mappingId,tuningId:tuning.id??null,idealCents:interval.idealCents};
 if(!interval.coordinate)return immutable({...common,mapped:false,temperedCents:null,signedErrorCents:null,absoluteErrorCents:null});
 const [periods,generators]=interval.coordinate,temperedCents=periods*periodCents+generators*generatorCents;
 const signedErrorCents=signedIntervalError(temperedCents,interval.idealCents);
 return immutable({...common,mapped:true,temperedCents,signedErrorCents,absoluteErrorCents:Math.abs(signedErrorCents)});
}
