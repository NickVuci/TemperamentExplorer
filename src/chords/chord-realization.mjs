import {shapeVoicings} from './chord-voicings.mjs';
import {chordPlacements} from '../hexboard/hexboard-chords.mjs';
import {coordinateCents} from '../core/pitch.mjs';
import {scaleMembership,searchShapeOccurrences,occurrenceShape} from './chord-occurrence.mjs';
import {harmonicIdentity} from '../harmonic/harmonic-equivalence.mjs';
export const realizationDefaults=()=>({inversion:0,style:'original',order:'pitch',periodShift:0,registerMin:-8,registerMax:8,reach:0,memberPolicy:'preserve'});
export function validateRealization(request={}){
 const r={...realizationDefaults(),...request};
 for(const [key,lo,hi]of [['inversion',0,7],['periodShift',-8,8],['registerMin',-8,8],['registerMax',-8,8],['reach',0,20]])if(!Number.isInteger(r[key])||r[key]<lo||r[key]>hi)throw Error(`Invalid ${key}.`);
 if(r.registerMin>r.registerMax||!['compact','original','open'].includes(r.style)||!['pitch','input'].includes(r.order)||!['preserve','exact-unique'].includes(r.memberPolicy))throw Error('Invalid voicing options.');return r;
}
function realizeAt(s,shape,occurrence,request,tones=null,tolerance=10){
 const r=validateRealization(request),seen=new Set(),indices=[];
 occurrence.coords.forEach((coordinate,index)=>{const key=JSON.stringify(coordinate);if(r.memberPolicy==='preserve'||!seen.has(key)){indices.push(index);seen.add(key);}});
 const selectedTones=tones?indices.map(index=>tones[index]):null;
 const instance={coords:indices.map(i=>occurrence.coords[i]),degrees:indices.map(i=>occurrence.degrees[i])};
 const signatures=new Set(),variants=shapeVoicings(s,instance,{tones:selectedTones,style:r.style,tol:tolerance}).filter(v=>{const signature=JSON.stringify(v.coords.map(m=>[m[0]-v.coords[0][0],m[1]-v.coords[0][1]]));if(signatures.has(signature))return false;signatures.add(signature);return true;});
 const voice=variants.find(v=>Number(v.id)===r.inversion)||variants[0];
 r.inversion=Number(voice.id);
 const order=indices.map((_,i)=>i).sort((a,b)=>r.order==='input'?shape.members[indices[a]].inputIndex-shape.members[indices[b]].inputIndex:voice.pitches[a]-voice.pitches[b]||a-b);
 const coords=order.map(i=>[voice.coords[i][0]+r.periodShift,voice.coords[i][1]]),base=scaleMembership(s).notes,byG=new Map(base.map(note=>[note.generator,note]));
 const degrees=coords.map(coordinate=>byG.get(coordinate[1])?.degree??null),registers=coords.map(coordinate=>{const found=byG.get(coordinate[1]);return found?coordinate[0]-found.coordinate[0]:null;});
 const id='shape-voice-v1:'+JSON.stringify([occurrence.id,r,coords]);
 const voices=order.map((i,position)=>({memberId:shape.members[indices[i]].memberId,memberIndex:indices[i],inputIndex:shape.members[indices[i]].inputIndex,
  coordinate:coords[position],occurrenceCoordinate:occurrence.coords[indices[i]],degree:degrees[position],sourceDegree:instance.degrees[i],
  periodLift:registers[position],registerLift:voice.referenceLifts[i],referenceLift:voice.referenceLifts[i],referenceCoordinateLift:voice.coordinateLifts[i],
  ratio:voice.ratios?.[i]??null,idealCents:selectedTones?selectedTones[i].c+voice.referenceLifts[i]*voice.reference.idealCents:null}));
 const positions=new Map(order.map((index,position)=>[index,position]));
 const pairErrors=voice.pairErrors.map(pair=>({...pair,sourceI:pair.i,sourceJ:pair.j,i:positions.get(pair.i),j:positions.get(pair.j)}));
 return {id,shapeId:shape.id,mappingId:shape.mappingId,familyId:shape.familyId,occurrenceId:occurrence.id,request:r,voices,coords,degrees,registers,pitches:coords.map(m=>coordinateCents(s,m)),
  ratios:voice.ratios?order.map(i=>voice.ratios[i]):null,variants:variants.map(v=>({id:Number(v.id),label:v.label})),inversion:Number(voice.id),
  withinScale:degrees.every(degree=>degree!==null),withinRegisterRange:registers.every(x=>Number.isSafeInteger(x)&&x>=r.registerMin&&x<=r.registerMax),
  collapsedMembers:shape.members.length-indices.length,reference:voice.reference,pairErrors,maxErrorCents:voice.max,rmsErrorCents:voice.rms,allMapped:voice.allMapped};
}

/** Coordinate-only realization; optional JI tones are interpretation overlays. */
export function realizeShape(s,input,occurrence,request={}, {tones=null,tolerance=10}={}){
 const shape=occurrenceShape(s,input),canonical=searchShapeOccurrences(s,input).completeOccurrences.find(item=>item.id===occurrence?.id);
 if(!canonical)throw Error('Select a complete exact shape occurrence.');
 if(tones&&(!Array.isArray(tones)||tones.length!==shape.members.length))throw Error('Interpretation tone count must match shape voices.');
 return realizeAt(s,shape,canonical,request,tones,tolerance);
}

/** Preserve canonical occurrence resolution and every JI input voice. */
export function realizeChord(s,analysis,occurrence,request={}){
 occurrence=analysis.occurrences.completeOccurrences.find(o=>o.id===occurrence?.id);
 if(!occurrence)throw Error('Select a complete exact occurrence.');
 const indices=[],inputIndices=[];
 analysis.identity.canonicalRatios.forEach((ratio,index)=>analysis.identity.orderedRatios.forEach((label,inputIndex)=>{if(label===ratio.label){indices.push(index);inputIndices.push(inputIndex);}}));
 const kind=s.basis.includes(2)?'octave':'exact',family=harmonicIdentity(analysis.identity,kind);
 const shape=occurrenceShape(s,{coordinates:indices.map(index=>analysis.projection.notes[index].coordinate),familyId:family.familyId,
  members:inputIndices.map(inputIndex=>({memberId:`input:${inputIndex}`,inputIndex}))});
 const expanded={...occurrence,coords:indices.map(index=>occurrence.coords[index]),degrees:indices.map(index=>occurrence.degrees[index])};
 const tones=indices.map(index=>{const q=analysis.identity.canonicalRatios[index];return {n:q.n,d:q.d,label:q.label,c:analysis.projection.notes[index].idealCents};});
 const realized=realizeAt(s,shape,expanded,request,tones,analysis.projection.tolerance);
 const idRequest={...realized.request};if(idRequest.memberPolicy==='preserve')delete idRequest.memberPolicy;
 return {...realized,id:'voice2:'+JSON.stringify([occurrence.id,idRequest,realized.coords]),chordId:analysis.identity.fingerprint};
}
export function placeRealization(s,realization,board,near=65){
 const r=realization.request,base=scaleMembership(s).notes,byG=new Map(base.map(n=>[n.generator,n]));
 let raw;if(realization.coords.length===1)raw=board.keys.filter(k=>k.enabled&&k.m[1]===realization.coords[0][1]).map(k=>({keys:[k.index],periodShift:k.m[0]-realization.coords[0][0],reach:0}));else raw=chordPlacements(board,realization.coords,near,{exact:true,periodCopies:true});
 const all=raw.filter(f=>(!r.reach||f.reach<=r.reach)&&f.keys.every(i=>{const k=board.keys[i],n=byG.get(k.m[1]),register=n?k.m[0]-n.coordinate[0]:Infinity;return register>=r.registerMin&&register<=r.registerMax;}));
 all.sort((a,b)=>a.reach-b.reach||Math.abs(a.periodShift)-Math.abs(b.periodShift)||a.keys.join(',').localeCompare(b.keys.join(','),'en'));
 return {realizationId:realization.id,occurrenceId:realization.occurrenceId,limited:!!raw.limited,placements:all.map(f=>({...f,realizationId:realization.id,coords:f.keys.map(i=>board.keys[i].m),pitches:f.keys.map(i=>board.keys[i].c),duplicates:f.keys.map(i=>board.keys.filter(k=>k.enabled&&k.m[0]===board.keys[i].m[0]&&k.m[1]===board.keys[i].m[1]).map(k=>k.index)),compactness:f.reach,layout:{wrapping:!!board.wrapping,anchor:near}}))};
}
