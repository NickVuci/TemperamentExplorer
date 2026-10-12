// The finite JI source universe for physical-shape searches. Geometry and tuning
// do not decide membership; importantly, enumeration precedes collision removal.
import {chordIdentity,MAX_CHORD_TONES} from './chord-identity-v2.mjs';
import {projectChord} from './chord-projection-v2.mjs';
import {mappingContext} from './harmonic-context.mjs';
import {harmonicIdentity} from './harmonic-equivalence.mjs';
import {curatedJIChords,orientedJIInterpretation,simplestRotation,analyzeJIDyads} from './harmonic-ji-chords.mjs';
import {enumerateJIChordSpace} from './harmonic-chord-space.mjs';
import {buildDyadIndex} from './harmonic-dyad-graph.mjs';
import {targetSet,validateJILimits,DEFAULT_ODD_LIMIT} from './ji-limit-engine.mjs';
import {eventLoopBoundary} from './harmonic-cooperative.mjs';
import {immutable} from './cache.mjs';

export const SHAPE_TARGET_VERSION=1;
export const SHAPE_SOURCE_SIZES=Object.freeze(Array.from({length:MAX_CHORD_TONES-1},(_,i)=>i+2));
const forms=new Set(['all','ji','otonal','utonal','ambitonal','custom']);
const presentation=form=>form==='self'?'ambitonal':form;
const inputText=value=>typeof value==='string'?value:value?.input??value?.identity?.originalInput??value?.originalInput;

/**
 * Prepared records are also accepted by searchChordShapes. Explicit inputs are
 * retained outside browse filters and limits, but unavailable mappings stay
 * unavailable. Completeness refers only to this declared, bounded universe.
 */
export async function buildShapeTargets({state,settings={},inputs=[],sizes=SHAPE_SOURCE_SIZES,form='all',familyIds=null,includeCatalogue=true,maxTargets=20000,
 shouldCancel=()=>false,signal,onProgress=()=>{},yieldControl=eventLoopBoundary}={}){
 const mapping=mappingContext(state),limits=validateJILimits({oddLimit:settings.limit??settings.oddLimit??DEFAULT_ODD_LIMIT,primeLimit:settings.primeLimit??settings.primeFilter??null});
 const requested=[...new Set(sizes)].sort((a,b)=>a-b);
 if(!requested.length||requested.some(size=>!SHAPE_SOURCE_SIZES.includes(size)))throw Error('Choose source chord sizes from two through eight.');
 if(!forms.has(form))throw Error('Choose a supported chord form.');
 if(familyIds!==null&&(!Array.isArray(familyIds)||familyIds.length>20000||familyIds.some(id=>typeof id!=='string'||!id)))throw Error('Choose valid source chord families.');
 const families=familyIds===null?null:new Set(familyIds);
 if(!Array.isArray(inputs)||inputs.length>512)throw Error('Choose at most 512 explicit source chords.');
 if(!Number.isSafeInteger(maxTargets)||maxTargets<1||maxTargets>20000)throw Error('Choose a target limit from 1 through 20000.');
 const kind=mapping.basis.includes(2)?'octave':'exact';
 const set=targetSet({oddLimit:limits.oddLimit,primeFilter:limits.primeLimit,mappingSubgroup:mapping.basis,representationPolicy:kind==='octave'?'octave':'native-exact'});
 const records=new Map(),counts={explicit:0,enumerated:0,curated:0,unmapped:0,collapsed:0,filtered:0},bounds={sizes:requested,form,familyIds:families?[...families].sort():null,maxTargets,includeCatalogue:!!includeCatalogue};
 let cancelled=false,truncated=false,enumerationComplete=true,processed=0;
 const stopped=()=>{cancelled=!!(signal?.aborted||shouldCancel());return cancelled;};
 const checkpoint=async()=>{onProgress({stage:'sources',count:records.size,processed});await yieldControl();return stopped();};
 function add(value,sourceKind,explicit=false){
  const input=inputText(value),identity=chordIdentity(input);
  let interpretation=typeof value==='object'?value.interpretation:null;
  if(!interpretation)try{interpretation=orientedJIInterpretation(input,{kind:sourceKind});}catch{
   // Valid source ratios can have a reciprocal integer form beyond the public
   // parser's bound. Preserve that source rather than claiming a classification.
   interpretation={identity,preferredLabel:identity.displayLabel,presentationForm:'other'};
  }
  const family=harmonicIdentity(identity,kind),dyads=analyzeJIDyads(identity,set,mapping),projection=projectChord(state,identity);
  let representative=interpretation;
  const best=simplestRotation(identity,kind==='octave');
  if(best)try{representative=orientedJIInterpretation(best.spelling,{kind:'shape-family'});}catch{/* An exact source can exceed the parser bound after rotation. */}
  const sourceForm=presentation(representative.presentationForm),outsideLimits=!dyads.dyadic;
  const outsideFilters=!requested.includes(identity.inputCardinality)||families!==null&&!families.has(family.familyId)||!(form==='all'||form==='ji'||form==='custom'&&explicit||form===sourceForm);
  if(!explicit&&(outsideLimits||outsideFilters||projection.basisStatus!=='mapped')){counts.filtered++;return;}
  // Ordered source voices matter even when their exact set fingerprint is equal.
  const id=`shape-target-v1:${JSON.stringify([identity.fingerprint,identity.orderedRatios])}`,old=records.get(id);
  if(old){if(!old.sourceKinds.includes(sourceKind))old.sourceKinds.push(sourceKind);old.explicit||=explicit;return;}
  if(records.size>=maxTargets){truncated=true;return;}
  const members=identity.orderedRatios.map((ratio,inputIndex)=>{
   const exactIndex=identity.canonicalRatios.findIndex(item=>item.label===ratio);
   return {memberId:`input:${inputIndex}`,inputIndex,exactIndex,familyIndex:family.members[inputIndex].familyIndex};
  });
  const coordinates=members.map(member=>projection.notes[member.exactIndex].coordinate),tones=members.map(member=>{
   const ratio=identity.canonicalRatios[member.exactIndex];return {n:ratio.n,d:ratio.d,label:ratio.label,c:projection.notes[member.exactIndex].idealCents};
  });
  const referenceFamily=harmonicIdentity(representative.identity,kind),rootClass=referenceFamily.members[0].familyIndex;
  const inferredRoot=members.findIndex(member=>member.familyIndex===rootClass),rootMember=typeof value==='object'&&value?.rootMember!=null?value.rootMember:Math.max(0,inferredRoot);
  if(!Number.isInteger(rootMember)||rootMember<0||rootMember>=members.length)throw Error('The chord root must name a source member.');
  const collisionGroups=[];
  if(projection.basisStatus==='mapped'){
   const groups=new Map();coordinates.forEach((coordinate,index)=>{const key=coordinate.join(',');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(index);});
   for(const [key,indices]of groups)if(indices.length>1)collisionGroups.push({coordinate:key.split(',').map(Number),members:indices});
  }
  const label=typeof value==='object'&&typeof value.label==='string'?value.label.slice(0,300):representative.preferredLabel;
  records.set(id,{version:SHAPE_TARGET_VERSION,id,input,identity,label,form:sourceForm,familyId:family.familyId,dualFamilyId:family.dualFamilyId,
   mappingId:mapping.id,targetSetId:set.id,rootMember,members,coordinates,tones,sourceKinds:[sourceKind],explicit,outsideLimits,outsideFilters,
   mappingStatus:projection.basisStatus,missingPrimes:projection.missingPrimes,collisionGroups,
   harmonicCollisionGroups:projection.shapeIdentities[kind]?.collisionGroups??[],sourceId:typeof value==='object'?value.id??null:null});
  if(projection.basisStatus!=='mapped')counts.unmapped++;
  if(collisionGroups.length)counts.collapsed++;
 }
 // Explicit sources precede enumeration so a catalogue cap never silently hides them.
 for(const input of inputs){if(stopped())break;add(input,'explicit',true);counts.explicit++;processed++;if(processed%32===0&&await checkpoint())break;}
 if(includeCatalogue&&!stopped()){
  // Yield before the canonical synchronous enumerator. Workers can be terminated;
  // fallback callers also get a cancellation boundary before this bounded stage.
  if(!await checkpoint()){
   const index=buildDyadIndex(set,mapping),space=enumerateJIChordSpace(index,{sizes:requested});enumerationComplete=space.complete;
   for(const chord of space.chords){
    if(stopped()||truncated)break;
    // Chord-space monzos omit octave factors. Reparse its actual ratios so full
    // source coordinates describe the displayed exact spelling.
    add(chord.members.map(member=>member.ratio).join(':'),'chord-space');counts.enumerated++;processed++;
    if(processed%32===0&&await checkpoint())break;
   }
   if(!cancelled&&!truncated)for(const chord of curatedJIChords()){
    if(stopped()||truncated)break;add({input:chord.identity.originalInput,interpretation:chord.interpretation},'curated');counts.curated++;processed++;
    if(processed%32===0&&await checkpoint())break;
   }
  }
 }
 const targets=[...records.values()],reason=cancelled?'cancelled':truncated?'target-limit':!enumerationComplete?'ji-search-bound':null;
 counts.targets=targets.length;
 onProgress({stage:'sources',count:targets.length,processed,complete:!reason});
 return immutable({version:SHAPE_TARGET_VERSION,mappingId:mapping.id,targetSetId:set.id,targets,complete:!reason,reason,counts,bounds,
  targetSpec:set.spec,enumerationComplete:includeCatalogue?enumerationComplete:null});
}
