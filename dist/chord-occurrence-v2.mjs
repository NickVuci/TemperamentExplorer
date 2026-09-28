import {scale,MAX_SCALE_SIZE} from './engine.mjs';
import {noteCoordinate,coordinateCents} from './pitch.mjs';
import {periodClass} from './chord-projection-v2.mjs';
export function scaleMembership(s){
 if(!Number.isInteger(s.n)||s.n<2||s.n>MAX_SCALE_SIZE)throw Error(`Scale size must be 2–${MAX_SCALE_SIZE}.`);
 const generated=scale(s),notes=generated.notes.map((note,degree)=>({degree,coordinate:noteCoordinate(s,note),pitchCents:note.c,generator:note.k}));
 return {n:s.n,mode:s.mode||0,notes,scaleCollision:!!generated.collision,periodCents:s.p};
}
export function searchOccurrences(s,projection,{membership=scaleMembership(s),partialLimit=24}={}){
 const bounds={roots:membership.notes.length,mode:membership.mode,partialLimit:Math.max(0,Math.min(256,partialLimit)),periodCents:s.p};
 const result={status:'unavailable',completeOccurrences:[],bestPartialOccurrences:[],generatorSpan:projection.generatorSpan,minimumChainSize:projection.generatorSpan===null?null:projection.generatorSpan+1,searchedModes:[membership.mode],searchBounds:bounds,scaleCollision:membership.scaleCollision};
 if(projection.basisStatus!=='mapped')return result;
 const byClass=new Map(membership.notes.map(n=>[periodClass(n.coordinate),n]));
 const unique=[...new Map(projection.notes.map(n=>[n.periodClass,n])).values()],minGenerator=Math.min(...membership.notes.map(n=>n.generator));
 const partial=[];
 for(const root of membership.notes){
  const assignments=projection.notes.map(note=>{const coordinate=note.coordinate.map((v,i)=>v+root.coordinate[i]),found=byClass.get(periodClass(coordinate));return {member:note.index,ratio:note.ratio,coordinate,degree:found?.degree??null,register:found?coordinate[0]-found.coordinate[0]:null};});
  const missing=unique.map(n=>assignments[n.index]).filter(a=>a.degree===null),matched=unique.length-missing.length;
  const id='occ2:'+JSON.stringify([projection.identity.fingerprint,s.basis,s.rows,membership.n,root.generator-minGenerator]);
  const occurrence={id,chordId:projection.identity.fingerprint,root:root.degree,rootGenerator:root.generator,mode:membership.mode,assignments,coords:assignments.map(a=>a.coordinate),degrees:assignments.map(a=>a.degree),pitches:assignments.map(a=>coordinateCents(s,a.coordinate)),matchedCardinality:matched,requiredCardinality:unique.length,missingCoordinates:missing,generatorSpan:projection.generatorSpan};
  if(!missing.length)result.completeOccurrences.push(occurrence);else partial.push(occurrence);
 }
 partial.sort((a,b)=>b.matchedCardinality-a.matchedCardinality||a.generatorSpan-b.generatorSpan||a.root-b.root);
 result.bestPartialOccurrences=partial.slice(0,bounds.partialLimit);
 result.status=result.completeOccurrences.length?'complete':partial.some(p=>p.matchedCardinality>0)?'partial':'absent';
 result.reason=result.completeOccurrences.length?`${result.completeOccurrences.length} complete occurrences in the selected scale.`:`Mapped, but no complete occurrence in this ${membership.n}-note scale. Generator span ${projection.generatorSpan} requires at least ${projection.generatorSpan+1} consecutive generator positions.`;
 return result;
}
export function largerScaleDiagnostics(s,projection,{count=4}={}){
 if(projection.basisStatus!=='mapped')return [];
 const start=Math.max(s.n+1,projection.generatorSpan+1),out=[];
 for(let n=start;n<=MAX_SCALE_SIZE&&out.length<Math.min(8,count);n++){const next={...s,n,mode:Math.min(s.mode||0,n-1)},result=searchOccurrences(next,projection,{partialLimit:0});out.push({n,mode:next.mode,count:result.completeOccurrences.length,scaleCollision:result.scaleCollision});}
 return out;
}
