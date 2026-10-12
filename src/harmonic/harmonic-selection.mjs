import {projectChord} from '../chords/chord-projection.mjs';
import {occurrenceShape} from '../chords/chord-occurrence.mjs';
import {coordinateCents} from '../core/pitch.mjs';
import {validateHarmonicSelection} from './harmonic-types.mjs';
import {mappingContext} from './harmonic-context.mjs';

/** Preserve exact source voices; JI spelling is an optional interpretation. */
export function harmonicEntryGeometry(state,entry){
 if(entry.kind==='mapping')return null;
 if(entry.kind==='ji'){
  const identity=entry.interpretation.identity,projection=projectChord(state,identity);
  if(projection.basisStatus!=='mapped')return null;
  const members=[],tones=[],coordinates=[];
  identity.canonicalRatios.forEach((ratio,index)=>identity.orderedRatios.forEach((label,inputIndex)=>{
   if(label!==ratio.label)return;
   coordinates.push([...projection.notes[index].coordinate]);members.push({memberId:`input:${inputIndex}`,inputIndex});
   tones.push({n:ratio.n,d:ratio.d,label,c:projection.notes[index].idealCents});
  }));
  return {shape:{coordinates,members,familyId:entry.familyId,equivalence:state.basis.includes(2)?'octave':'exact'},tones,projection};
 }
 if(entry.kind==='interval'){
  if(!entry.coordinate)return null;
  return {shape:{coordinates:[[0,0],[...entry.coordinate]],familyId:entry.harmonicId},tones:[{n:1,d:1,label:'1/1',c:0},{...entry.ratio,c:entry.idealCents}]};
 }
 if(entry.shape)return {shape:entry.shape,tones:null};
 return null;
}

export function sourceShapeVoicing(state,input){
 const shape=occurrenceShape(state,input),coords=shape.members.map(member=>[...member.sourceCoordinate]);
 return {id:`harmonic-source-voice-v1:${JSON.stringify([shape.id,coords])}`,shapeId:shape.id,mappingId:shape.mappingId,
  coords,pitches:coords.map(m=>coordinateCents(state,m)),voices:shape.members.map((member,index)=>({memberId:member.memberId,inputIndex:member.inputIndex,coordinate:coords[index],registerLift:0}))};
}

export function harmonicSelection(state,entry,{voicing,source='catalogue',provenance}={}){
 const geometry=harmonicEntryGeometry(state,entry);
 if(!geometry)throw Error('This harmony has no sounding coordinates in the active mapping.');
 const realized=voicing??sourceShapeVoicing(state,geometry.shape);
 const selection={version:1,mappingId:mappingContext(state).id,shapeId:realized.shapeId,source,voicing:realized,
  ...(entry.harmonicId?{harmonicId:entry.harmonicId}:{}),...(entry.interpretationId?{interpretationId:entry.interpretationId}:{}),
  ...(realized.occurrenceId?{occurrenceId:realized.occurrenceId}:{}),
  ...(entry.assessment?{assessmentContext:{mappingId:entry.mappingId,targetSetId:entry.targetSetId},assessment:entry.assessment}:{}),
  label:entry.preferredLabel??entry.targetRatio??entry.status??'Coordinate harmony',
  shape:structuredClone(geometry.shape),...(geometry.tones?{tones:structuredClone(geometry.tones)}:{}),
  ...(provenance?{provenance:structuredClone(provenance)}:{})};
 return validateHarmonicSelection(selection);
}

/** Optional metadata cannot invalidate otherwise valid saved sounding material. */
export function restoredHarmonicProvenance(value,state,coords){
 if(!value)return null;
 try{
  const selection=validateHarmonicSelection(value);
  if(selection.mappingId!==mappingContext(state).id)return null;
  if(selection.voicing&&JSON.stringify(selection.voicing.voices.map(v=>v.coordinate))!==JSON.stringify(coords))return null;
  return selection;
 }catch{return null;}
}
