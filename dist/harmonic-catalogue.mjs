import {immutable} from './cache.mjs';
import {mappingContext} from './harmonic-context.mjs';
import {canonicalHarmonicJSON,tuningKey,validateHarmonicSelection} from './harmonic-types.mjs';
import {targetSet} from './ji-limit-engine.mjs';
import {mappedIntervals,intervalError} from './harmonic-intervals.mjs';
import {curatedJIChords,makeJIInterpretation,harmonicLines,enumerateJISubsets,analyzeJIDyads} from './harmonic-ji-chords.mjs';
import {projectChord,projectCoordinateShape} from './chord-projection-v2.mjs';
import {harmonicIdentity} from './harmonic-equivalence.mjs';
import {ratioMonzo} from './ji-monzo.mjs';
import {buildDyadIndex} from './harmonic-dyad-graph.mjs';
import {discoverDyadicHarmony} from './harmonic-et.mjs';
import {enumerateMappingExtensions} from './harmonic-mappings.mjs';
import {searchIntervalApproximations,searchChordApproximationsAsync} from './harmonic-approximations.mjs';

export const CATALOGUE_VERSION='harmonic-catalogue-v1';
const categories=['intervals','ji','et','mappings','approximations'];
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const bounded=(value,fallback,max,name)=>{const n=value??fallback;if(!Number.isSafeInteger(n)||n<1||n>max)throw Error(`${name} must be from 1 through ${max}.`);return n;};
const compare=(a,b)=>a<b?-1:a>b?1:0;
const ratioIdentity=ratio=>{const value=ratioMonzo(ratio,null,{includeBasis:false});return `ji-ratio-v1:${value.numerator}/${value.denominator}`;};

/** Complete catalogue scope: no selected scale, board or display tolerance. */
export function catalogueContext(query){
 const mapping=mappingContext(query.mapping??query.state),source=query.tuning??query.state;
 const tuning=source?{mappingId:mapping.id,periodCents:source.periodCents??source.p,generatorCents:source.generatorCents??source.g}:null;
 if(source?.mappingId&&source.mappingId!==mapping.id)throw Error('Catalogue tuning uses another mapping.');
 if(tuning)tuning.id=tuningKey(tuning);
 const targets=targetSet(query.targetSpec??{oddLimit:15,primeFilter:mapping.basis,mappingSubgroup:mapping.basis,
  representationPolicy:mapping.basis.includes(2)?'octave':'native-exact'});
 // The shared projector validates subgroup identity, including missing primes.
 mappedIntervals(targets,mapping,{equivalences:[]});
 const requested=query.categories??['intervals','ji'];
 if(!Array.isArray(requested)||requested.some(kind=>!categories.includes(kind)))throw Error('Unknown catalogue category.');
 const options={categories:[...new Set(requested)].sort(),directInputs:query.directInputs??[],
  subsets:query.subsets??null,et:query.et??{},mappingTargets:query.mappingTargets??[],mappingOptions:query.mappingOptions??{},
  approximationTargets:query.approximationTargets??[],approximationChords:query.approximationChords??[],approximationOptions:query.approximationOptions??{},
  maxRecords:bounded(query.maxRecords,512,2000,'Catalogue record limit'),pageSize:bounded(query.pageSize,50,128,'Catalogue page size')};
 for(const name of ['directInputs','mappingTargets','approximationTargets','approximationChords'])if(!Array.isArray(options[name]))throw Error(`${name} must be an array.`);
 if(options.directInputs.length>64||options.mappingTargets.length>32||options.approximationTargets.length>64||options.approximationChords.length>16)throw Error('Too many direct catalogue inputs.');
 const id=`${CATALOGUE_VERSION}:${canonicalHarmonicJSON({mapping,tuning,targetSetId:targets.id,options})}`;
 return immutable({id,mapping,tuning,targets,options});
}

/** Merge existing producers without changing their mathematical definitions. */
export async function queryCatalogue(query,{signal,shouldCancel,onProgress,yieldControl=tick}={}){
 const context=catalogueContext(query),{mapping,tuning,targets,options}=context;
 const records=new Map(),sources=[],pending=new Map();let cancelled=false,recordCap=false;
 const isCancelled=()=>Boolean(signal?.aborted||shouldCancel?.());
 const boundary=async()=>{await yieldControl();if(isCancelled())cancelled=true;};
 const add=row=>{if(records.has(row.id))return;if(records.size>=options.maxRecords){recordCap=true;return;}records.set(row.id,immutable(row));};
 const state={...mapping,p:tuning?.periodCents??1200*Math.log2(mapping.basis[0])/mapping.rows[0][0],g:tuning?.generatorCents??1};
 const addJI=interpretation=>{
  const projection=projectChord(state,interpretation.identity),kind=targets.spec.representationPolicy==='native-exact'?'exact':'octave',shape=projection.shapeIdentities[kind];
  const id=`catalogue-ji-v1:${canonicalHarmonicJSON([mapping.id,interpretation.id])}`;
  const family=kind==='exact'?harmonicIdentity(interpretation.identity,'exact'):interpretation.harmonicIdentity;
  const row={id,kind:'ji',mappingId:mapping.id,targetSetId:targets.id,harmonicId:family.familyId,
   interpretationId:interpretation.id,interpretation,preferredLabel:interpretation.preferredLabel,
   aliases:[...new Set([interpretation.preferredLabel,interpretation.identity.displayLabel,...Object.values(interpretation.identity.aliases)])].sort(compare),
   familyId:family.familyId,dualFamilyId:family.dualFamilyId,exactDualId:interpretation.exactDualId,
   shapeId:shape.available?shape.id:null,shape:shape.available?shape:null,
   mappingStatus:projection.basisStatus,missingPrimes:projection.missingPrimes,
   dyads:analyzeJIDyads(interpretation.identity,targets,mapping),
   tuning:tuning?{id:tuning.id,maxErrorCents:projection.maxErrorCents,pairwiseMaxErrorCents:projection.pairwiseMaxErrorCents}:null};
  add(row);return row;
 };
 const run=async(kind,fn)=>{if(cancelled||isCancelled()){cancelled=true;return;}await fn();onProgress?.(immutable({contextId:context.id,category:kind,count:records.size}));await boundary();};
 // Exact custom lookup precedes browse bounds, so a small browse cannot hide it.
 for(const input of options.directInputs){if(isCancelled()){cancelled=true;break;}addJI(makeJIInterpretation(input));await boundary();}
 if(options.categories.includes('intervals'))await run('intervals',async()=>{
  for(const interval of mappedIntervals(targets,mapping)){
   const approximation=!interval.coordinate&&tuning?searchIntervalApproximations(mapping,tuning,interval.ratio,{generatorBound:32,maxResults:1}).candidates[0]??null:null;
   add({...interval,kind:'interval',harmonicId:ratioIdentity(interval.ratio),approximation,
    preferredLabel:interval.ratio.label,tuning:tuning?intervalError(interval,tuning):null});
  }
  sources.push({kind:'intervals',complete:true});
 });
 if(options.categories.includes('ji'))await run('ji',async()=>{
  let count=0;
  for(const seed of curatedJIChords()){if(cancelled||isCancelled()){cancelled=true;break;}addJI(seed.interpretation);if(++count%16===0)await boundary();}
  if(!cancelled){
   const lines=harmonicLines(mapping,targets);for(const line of lines.lines)addJI(line.interpretation);
   sources.push({kind:'ji-curated-and-lines',complete:true,bounds:lines.bounds});
   if(options.subsets){const page=enumerateJISubsets(lines,options.subsets);for(const item of page.items)addJI(item.interpretation);sources.push({kind:'ji-subsets',complete:page.complete,nextCursor:page.nextCursor,totalCombinations:page.totalCombinations,doneCombinations:page.doneCombinations});}
  }
 });
 if(options.categories.includes('et'))await run('et',async()=>{
  const job=discoverDyadicHarmony(buildDyadIndex(targets,mapping),{...options.et,signal,shouldCancel:isCancelled});
  for await(const event of job){
   if(event.type==='complete'){sources.push({kind:'et',...event});continue;}
   for(const [category,rows]of Object.entries(event.records))for(const row of rows){
    const id=`catalogue-assessment-v1:${canonicalHarmonicJSON([mapping.id,targets.id,row.shape.id])}`;
    add({...row,id,kind:'assessment',mappingId:mapping.id,targetSetId:targets.id,shapeId:row.shape.id,
     harmonicId:row.interpretation?.identityId??null,familyId:row.interpretation?.identityId??null,
     interpretationId:row.interpretation?.id??null,status:row.assessment.status,category});
   }
   onProgress?.(immutable({contextId:context.id,category:'et',count:records.size,progress:event.progress}));
  }
  cancelled ||= isCancelled();
 });
 if(options.categories.includes('mappings'))await run('mappings',async()=>{
  if(!tuning)throw Error('Mapping candidate ranking needs a tuning.');
  for(const target of options.mappingTargets){if(isCancelled()){cancelled=true;break;}
   const result=enumerateMappingExtensions(mapping,target,{...options.mappingOptions,tuning});
   for(const candidate of result.candidates)add({...candidate,kind:'mapping',activeMappingId:mapping.id,
    harmonicId:ratioIdentity(candidate.targetRatio),interpretationId:candidate.variantId});
   sources.push({kind:'mappings',target,complete:result.completeness.domainExhausted&&!result.completeness.truncated,result});await boundary();
  }
 });
 if(options.categories.includes('approximations'))await run('approximations',async()=>{
  if(!tuning)throw Error('Approximation search needs a tuning.');
  for(const target of options.approximationTargets){if(isCancelled()){cancelled=true;break;}
   const result=searchIntervalApproximations(mapping,tuning,target,{...options.approximationOptions,targetSet:targets});
   for(const candidate of result.candidates){const shapes=projectCoordinateShape(mapping,[[0,0],candidate.coordinate]);
    const shape=shapes.identities[targets.spec.representationPolicy==='native-exact'?'exact':'octave'];
    add({...candidate,kind:'approximation',harmonicId:ratioIdentity(candidate.targetRatio),shapeId:shape.id,shape});}
   sources.push({kind:'approximations',complete:result.completeness.domainExhausted&&!result.completeness.truncated,result});await boundary();
  }
  for(const input of options.approximationChords){if(isCancelled()){cancelled=true;break;}
   const result=await searchChordApproximationsAsync(makeJIInterpretation(input),{...options.approximationOptions,context:mapping,tuning,targetSet:targets,shouldCancel:isCancelled});
   for(const candidate of result.candidates){const shapes=projectCoordinateShape(mapping,candidate.memberCoordinates);
    const shape=shapes.identities[targets.spec.representationPolicy==='native-exact'?'exact':'octave'];
    add({...candidate,kind:'approximation',shapeId:shape.id,shape});}
   sources.push({kind:'chord-approximations',complete:result.completeness.complete,result});await boundary();
  }
 });
 const items=[...records.values()].sort((a,b)=>compare(a.kind,b.kind)||compare(a.id,b.id));
 const groups=key=>{const result={};for(const item of items)if(item[key]){(result[item[key]]??=[]).push(item.id);}return result;};
 const shapeGroups=groups('shapeId'),familyGroups=groups('familyId');
 for(const item of items)if(item.kind==='ji')pending.set(item.interpretationId,item.id);
 const dualLinks=Object.fromEntries(items.filter(item=>item.kind==='ji').map(item=>[item.id,pending.get(item.exactDualId)??null]));
 const complete=!cancelled&&!recordCap&&sources.every(source=>source.complete),status=cancelled?'cancelled':!complete?'incomplete':items.length?'complete':'complete-empty';
 let offset=0;if(query.cursor){let cursor;try{cursor=JSON.parse(query.cursor);}catch{throw Error('Invalid catalogue cursor.');}
  if(cursor.contextId!==context.id||!Number.isSafeInteger(cursor.offset)||cursor.offset<0||cursor.offset>items.length)throw Error('Catalogue cursor context mismatch.');offset=cursor.offset;}
 const page=items.slice(offset,offset+options.pageSize),nextOffset=offset+page.length;
 return immutable({version:1,contextId:context.id,mappingId:mapping.id,tuningId:tuning?.id??null,targetSetId:targets.id,
  items,page,nextCursor:nextOffset<items.length?JSON.stringify({contextId:context.id,offset:nextOffset}):null,
  shapeGroups,familyGroups,dualLinks,sources,status,complete,recordCap,total:items.length});
}

/** Stable in-result lookup; direct custom input also works outside browse bounds. */
export async function getHarmonicEntry(queryOrResult,idOrInput){
 if(queryOrResult?.version===1&&Array.isArray(queryOrResult.items))return queryOrResult.items.find(item=>item.id===idOrInput||item.interpretationId===idOrInput)??null;
 const result=await queryCatalogue({...queryOrResult,categories:[],directInputs:[idOrInput],cursor:null});return result.items[0]??null;
}

export function resolveSelection(result,selection){
 const value=validateHarmonicSelection(selection);
 if(result.mappingId!==value.mappingId||value.assessmentContext&&value.assessmentContext.targetSetId!==result.targetSetId)throw Error('Selection context mismatch.');
 const matches=result.items.filter(item=>(!value.shapeId||item.shapeId===value.shapeId)&&(!value.harmonicId||item.familyId===value.harmonicId||item.harmonicId===value.harmonicId)&&(!value.interpretationId||item.interpretationId===value.interpretationId));
 return immutable({selection:value,entry:matches[0]??null,aliases:matches.map(item=>item.id),status:matches.length?'resolved':'unavailable'});
}
