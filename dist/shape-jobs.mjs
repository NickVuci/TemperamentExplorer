import {BoundedCache,immutable} from './cache.mjs';
import {mappingContext} from './harmonic-context.mjs';
import {canonicalHarmonicJSON} from './harmonic-types.mjs';
import {scaleMembership} from './chord-occurrence-v2.mjs';
import {coordinateCents} from './pitch.mjs';
import {DEFAULT_ODD_LIMIT} from './ji-limit-engine.mjs';
import {createSearchJobs} from './harmonic-catalogue-jobs.mjs';
import {finishSearchAsync} from './harmonic-cooperative.mjs';
import {searchChordShapesSteps,identifySelectedShapeSteps,selectedSoundingKeys} from './chord-shapes.mjs';
import {buildShapeTargets,SHAPE_SOURCE_SIZES} from './shape-targets.mjs';

const kinds=new Set(['shape-search','shape-identify']);
export function shapeJobContextId(kind,payload){
 if(!kinds.has(kind)||!payload?.state||!Array.isArray(payload.board?.keys))throw Error('Invalid shape search request.');
 const {state,board}=payload;
 // Cents are a presentation layer. Exact scale/board coordinates bind the structural cache.
 return 'shape-job-v1:'+canonicalHarmonicJSON({kind,mappingId:mappingContext(state).id,basis:state.basis,
  scale:scaleMembership(state).notes.map(n=>n.coordinate),
  board:board.keys.map(k=>[k.index,k.x,k.y,!!k.enabled,!!k.command,!!k.conflict,k.m,k.degree??null,k.register??null]).sort((a,b)=>a[0]-b[0]),
  inputs:payload.inputs??[],universe:payload.universe??'selected',directoryComplete:payload.directoryComplete!==false,
  settings:{limit:payload.settings?.limit??payload.settings?.oddLimit??DEFAULT_ODD_LIMIT,primeLimit:payload.settings?.primeLimit??payload.settings?.primeFilter??null},
  filters:payload.filters??{},constraints:payload.constraints??{},keys:kind==='shape-identify'?(payload.keys??[]).toSorted((a,b)=>a-b):[]});
}

/** Derive sound from exact stored coordinates after every retune, including cache hits. */
export function presentShapeResult(source,state){
 const result=structuredClone(source);
 const refreshReading=association=>{
  const pitches=association.coordinates?.map(m=>coordinateCents(state,m));
  if(!pitches?.length)return;
  const lowest=Math.min(...pitches);
  association.bassMembers=pitches.flatMap((cents,i)=>Math.abs(cents-lowest)<1e-7?[i]:[]);
  association.soundingBassMembers=[...association.bassMembers];
  association.soundingBassKeys=[...new Set(association.bassMembers.map(i=>association.memberKeys?.[i]).filter(Number.isSafeInteger))];
 };
 for(const shape of result.shapes??[]){
  for(const association of shape.associations??[])refreshReading(association);
  for(const placement of shape.placements??[]){
   placement.pitches=placement.coords.map(m=>coordinateCents(state,m));
   for(const association of placement.associations??[])refreshReading(association);
  }
 }
 if(result.selected?.coordinates)result.selected.pitches=result.selected.coordinates.map(m=>coordinateCents(state,m));
 for(const match of [...result.matches??[],...result.doublingReadings??[]])refreshReading(match);
 return result;
}

export function createShapeJobDispatcher({emit=()=>{},cacheEntries=4,maxCachePlacements=5000}={}){
 if(!Number.isInteger(cacheEntries)||cacheEntries<1||cacheEntries>16||!Number.isInteger(maxCachePlacements)||maxCachePlacements<1||maxCachePlacements>20000)throw Error('Invalid shape cache bounds.');
 const cache=new BoundedCache(cacheEntries);let current=null,destroyed=false;
 const metrics={hits:0,misses:0,stored:0,skippedLarge:0};
 const cancel=()=>{if(current)current.cancelled=true;};
 async function dispatch(envelope){
  if(destroyed)return;
  if(envelope?.kind==='cancel'){if(current?.requestId===envelope.requestId&&current?.contextId===envelope.contextId)cancel();return;}
  cancel();const job={requestId:envelope?.requestId,contextId:envelope?.contextId,cancelled:false};current=job;
  const stopped=()=>destroyed||current!==job||job.cancelled;
  const send=(type,extra)=>{if(!stopped())emit(immutable({requestId:job.requestId,contextId:job.contextId,kind:envelope.kind,type,...extra}));};
  try{
   const payload=envelope.payload;
   if(!Number.isSafeInteger(job.requestId)||job.requestId<1||shapeJobContextId(envelope.kind,payload)!==job.contextId)throw Error('Shape search context mismatch.');
   if(cache.entries.has(job.contextId)){metrics.hits++;send('complete',{result:presentShapeResult(cache.get(job.contextId,()=>null),payload.state),cached:true});return;}
   metrics.misses++;
   const reverse=envelope.kind==='shape-identify';
   // A source chord can only read selected keys when it has at least as many tones as distinct sounding keys.
   const sounding=reverse?selectedSoundingKeys(payload.board,payload.keys??[]).keys.length:0;
   const sources=await buildShapeTargets({state:payload.state,settings:payload.settings??{},inputs:payload.inputs??[],
    sizes:reverse?SHAPE_SOURCE_SIZES.filter(size=>size>=sounding):payload.filters?.sizes??[3,4,5,6],form:reverse?'all':payload.filters?.form??'all',
    familyIds:reverse?null:payload.filters?.familyIds??null,
    includeCatalogue:reverse||payload.universe==='directory',shouldCancel:stopped,onProgress:p=>send('progress',{progress:{stage:'sources',...p}})});
   if(stopped())return;
   const options={state:payload.state,board:payload.board,targets:sources.targets,constraints:payload.constraints??{},keys:payload.keys??[],shouldCancel:stopped};
   const result=structuredClone(await finishSearchAsync((reverse?identifySelectedShapeSteps:searchChordShapesSteps)(options),{onCheckpoint:progress=>send('progress',{progress:{stage:'placements',...progress}})}));
   if(stopped())return;
   const directoryComplete=reverse||payload.universe!=='directory'||payload.directoryComplete!==false;
   result.sourceUniverse={complete:sources.complete&&directoryComplete,reason:sources.reason??(!directoryComplete?'directory-incomplete':null),directoryComplete,counts:sources.counts,bounds:sources.bounds};
   result.complete=result.complete&&result.sourceUniverse.complete;
   result.limited=!result.complete;
   if(!result.sourceUniverse.complete&&!result.reason)result.reason=result.sourceUniverse.reason??'source-limit';
   if(result.complete){if(result.placementCount<=maxCachePlacements){cache.get(job.contextId,()=>immutable(result));metrics.stored++;}else metrics.skippedLarge++;}
   send('complete',{result:presentShapeResult(result,payload.state),cached:false});
  }catch(error){send('error',{message:error.message});}
 }
 return {dispatch,cancel,destroy(){destroyed=true;cancel();cache.entries.clear();},get metrics(){return {...metrics,entries:cache.entries.size,cacheEntries,maxCachePlacements};}};
}

export const createShapeJobs=options=>createSearchJobs({...options,getContextId:shapeJobContextId,dispatcherFactory:createShapeJobDispatcher});
