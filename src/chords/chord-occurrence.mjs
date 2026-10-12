import {scale,MAX_SCALE_SIZE} from '../core/engine.mjs';
import {noteCoordinate,coordinateCents} from '../core/pitch.mjs';
import {periodClass} from './chord-projection.mjs';
import {equivalencePolicy,quotientCoordinate,shapeKey} from '../harmonic/harmonic-equivalence.mjs';
import {mappingContext} from '../harmonic/harmonic-context.mjs';
import {scaleContextKey} from '../harmonic/harmonic-types.mjs';
import {immutable} from '../core/cache.mjs';
export function scaleMembership(s){
 if(!Number.isInteger(s.n)||s.n<2||s.n>MAX_SCALE_SIZE)throw Error(`Scale size must be 2–${MAX_SCALE_SIZE}.`);
 const generated=scale(s),notes=generated.notes.map((note,degree)=>({degree,coordinate:noteCoordinate(s,note),pitchCents:note.c,generator:note.k}));
 return {n:s.n,mode:s.mode||0,notes,scaleCollision:!!generated.collision,periodCents:s.p};
}
/** Resolve source members first; quotient-only DTOs use the canonical inverse. */
export function occurrenceShape(s,input){
 const mapping=mappingContext(s),source=input?.shape??input;
 if(source?.mappingId&&source.mappingId!==mapping.id)throw Error('Shape mapping context mismatch.');
 const declaredKind=typeof source?.equivalence==='string'?source.equivalence:source?.equivalence?.kind??(s.basis.includes(2)?'octave':'exact');
 const kind=declaredKind==='native-exact'?'exact':declaredKind;
 const policy=equivalencePolicy(s,kind);
 let coordinates=Array.isArray(source)?source:source?.coordinates??source?.coords;
 const rawLinks=source?.sourceMemberLinks?.length?source.sourceMemberLinks:source?.memberLinks;
 const links=rawLinks?.length?[...rawLinks].sort((a,b)=>a.memberIndex-b.memberIndex):null;
 if(links)coordinates=links.map(member=>member.coordinate);
 if(!coordinates&&source?.coordinatesOrClasses){
  if(source.cardinalities?.some(count=>count>1))throw Error('Repeated quotient classes need full source member coordinates.');
  coordinates=source.coordinatesOrClasses;
  if(typeof source.equivalence==='object')coordinates=coordinates.map(point=>policy.inverse.map(row=>row[0]*point[0]+row[1]*point[1]));
 }
 if(!coordinates&&source?.classes)coordinates=source.classes.map(item=>item.coordinate??item);
 if(!Array.isArray(coordinates)||!coordinates.length||coordinates.length>8||coordinates.some(point=>!Array.isArray(point)||point.length!==2||!point.every(Number.isSafeInteger)))throw Error('Shape needs one through eight full integer coordinates.');
 const id=shapeKey(policy,coordinates);
 if(source?.id&&source.id!==id)throw Error('Shape ID does not match its coordinates.');
 const origin=coordinates[0],members=coordinates.map((coordinate,index)=>({member:index,memberId:source?.members?.[index]?.memberId??links?.[index]?.memberId??`member:${index}`,inputIndex:source?.members?.[index]?.inputIndex??links?.[index]?.inputIndex??index,
  sourceCoordinate:[...coordinate],relativeCoordinate:coordinate.map((value,axis)=>value-origin[axis]),
  harmonicClass:quotientCoordinate(policy,coordinate.map((value,axis)=>value-origin[axis]))}));
 const generators=members.map(member=>member.relativeCoordinate[1]);
 return immutable({id,mappingId:mapping.id,periodShapeId:shapeKey(equivalencePolicy(s,'period'),coordinates),policy,familyId:input?.familyId??input?.harmonicId??null,members,
  minimumGenerator:Math.min(...generators),generatorSpan:Math.max(...generators)-Math.min(...generators)});
}

/** Period-repeated scale membership, with every source voice and quotient lift. */
export function searchShapeOccurrences(s,input,{membership=scaleMembership(s),partialLimit=24,tonicOnly=false}={}){
 const shape=occurrenceShape(s,input);
 if(!Array.isArray(membership.notes)||membership.notes.length!==membership.n||membership.n<2||membership.n>MAX_SCALE_SIZE||
  membership.notes.some((note,index)=>note.degree!==index||!Array.isArray(note.coordinate)||note.coordinate.length!==2||!note.coordinate.every(Number.isSafeInteger)||note.generator!==note.coordinate[1]))throw Error('Invalid scale membership.');
 if(!Number.isInteger(partialLimit)||partialLimit<0||partialLimit>256)throw Error('Partial occurrence limit must be 0–256.');
 const scaleId=scaleContextKey({mappingId:shape.mappingId,coordinates:membership.notes.map(note=>note.coordinate),mode:membership.mode});
 const bounds={roots:membership.notes.length,mode:membership.mode,partialLimit,periodCents:s.p,domain:'period-repeated-scale'};
 const result={shapeId:shape.id,mappingId:shape.mappingId,scaleId,status:'absent',completeOccurrences:[],bestPartialOccurrences:[],
  generatorSpan:shape.generatorSpan,minimumChainSize:shape.generatorSpan+1,searchedModes:[membership.mode],searchBounds:bounds,scaleCollision:membership.scaleCollision};
 const byClass=new Map(membership.notes.map(n=>[periodClass(n.coordinate),n]));
 const unique=[...new Map(shape.members.map(member=>[member.relativeCoordinate[1],member])).values()];
 const partial=[];
 for(const root of membership.notes){
  const assignments=shape.members.map(member=>{const coordinate=member.relativeCoordinate.map((v,i)=>v+root.coordinate[i]),found=byClass.get(periodClass(coordinate));
   return {...member,coordinate,degree:found?.degree??null,register:found?coordinate[0]-found.coordinate[0]:null,
    periodLift:found?coordinate[0]-found.coordinate[0]:null,degreeCoordinate:found?[...found.coordinate]:null};});
  const missing=unique.map(member=>assignments[member.member]).filter(a=>a.degree===null),matched=unique.length-missing.length;
  const anchorGenerator=root.generator+shape.minimumGenerator;
  const id='shape-occurrence-v1:'+JSON.stringify([shape.id,shape.periodShapeId,scaleId,anchorGenerator]);
  const occurrence={id,shapeId:shape.id,mappingId:shape.mappingId,scaleId,familyId:shape.familyId,root:root.degree,rootGenerator:root.generator,
   anchorGenerator,tonicAnchored:root.degree===0,mode:membership.mode,assignments,coords:assignments.map(a=>a.coordinate),degrees:assignments.map(a=>a.degree),pitches:assignments.map(a=>coordinateCents(s,a.coordinate)),matchedCardinality:matched,requiredCardinality:unique.length,voiceCount:assignments.length,missingCoordinates:missing,generatorSpan:shape.generatorSpan};
  if(!missing.length)result.completeOccurrences.push(occurrence);else partial.push(occurrence);
 }
 partial.sort((a,b)=>b.matchedCardinality-a.matchedCardinality||a.generatorSpan-b.generatorSpan||a.root-b.root);
 result.tonicOccurrences=result.completeOccurrences.filter(occurrence=>occurrence.tonicAnchored);
 // A merged chord has no fixed root, so scope "tonic" also needs the occurrences that use the tonic as any member.
 result.tonicMemberOccurrences=result.completeOccurrences.filter(occurrence=>occurrence.assignments.some(a=>a.degree===0));
 result.anywhereCount=result.completeOccurrences.length;
 if(tonicOnly)result.completeOccurrences=result.tonicOccurrences;
 result.bestPartialOccurrences=(tonicOnly?partial.filter(occurrence=>occurrence.tonicAnchored):partial).slice(0,bounds.partialLimit);
 result.status=result.completeOccurrences.length?'complete':partial.some(p=>p.matchedCardinality>0)?'partial':'absent';
 result.reason=result.completeOccurrences.length?`${result.completeOccurrences.length} complete occurrences in the selected scale.`:`No complete ${tonicOnly?'tonic-anchored ':''}occurrence in this ${membership.n}-note scale. Generator span ${shape.generatorSpan} requires at least ${shape.generatorSpan+1} consecutive generator positions.`;
 return immutable(result);
}

/** Legacy IDs/order/counts remain stable while all math comes from shapes. */
export function searchOccurrences(s,projection,{membership=scaleMembership(s),partialLimit=24}={}){
 const bounds={roots:membership.notes.length,mode:membership.mode,partialLimit:Math.max(0,Math.min(256,partialLimit)),periodCents:s.p};
 if(projection.basisStatus!=='mapped')return {status:'unavailable',completeOccurrences:[],bestPartialOccurrences:[],generatorSpan:projection.generatorSpan,minimumChainSize:null,searchedModes:[membership.mode],searchBounds:bounds,scaleCollision:membership.scaleCollision};
 const shared=searchShapeOccurrences(s,{coordinates:projection.notes.map(note=>note.coordinate)},{membership,partialLimit:bounds.partialLimit});
 const minGenerator=Math.min(...membership.notes.map(note=>note.generator));
 const adapt=occurrence=>({...occurrence,shapeOccurrenceId:occurrence.id,
  id:'occ2:'+JSON.stringify([projection.identity.fingerprint,s.basis,s.rows,membership.n,occurrence.rootGenerator-minGenerator]),
  chordId:projection.identity.fingerprint,assignments:occurrence.assignments.map((member,index)=>({...member,ratio:projection.notes[index].ratio})),
  missingCoordinates:occurrence.missingCoordinates.map(member=>({...member,ratio:projection.notes[member.member].ratio}))});
 return {...shared,searchBounds:bounds,completeOccurrences:shared.completeOccurrences.map(adapt),bestPartialOccurrences:shared.bestPartialOccurrences.map(adapt),tonicOccurrences:shared.tonicOccurrences.map(adapt),tonicMemberOccurrences:shared.tonicMemberOccurrences.map(adapt)};
}
export function largerScaleDiagnostics(s,projection,{count=4}={}){
 if(projection.basisStatus!=='mapped')return [];
 const start=Math.max(s.n+1,projection.generatorSpan+1),out=[];
 for(let n=start;n<=MAX_SCALE_SIZE&&out.length<Math.min(8,count);n++){const next={...s,n,mode:Math.min(s.mode||0,n-1)},result=searchOccurrences(next,projection,{partialLimit:0});out.push({n,mode:next.mode,count:result.completeOccurrences.length,scaleCollision:result.scaleCollision});}
 return out;
}
