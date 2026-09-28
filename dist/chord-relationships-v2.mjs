import {jiSubset} from './chord-identity-v2.mjs';
import {chordCandidates,DISCOVERY_BOUNDS} from './chord-discovery-v2.mjs';
import {projectChord} from './chord-projection-v2.mjs';
import {scaleMembership} from './chord-occurrence-v2.mjs';
import {coordinateCents} from './pitch.mjs';
export function nearestSubstitutes(s,projection,occurrence,{tolerance=10,limit=3}={}){
 if(!Number.isFinite(tolerance)||tolerance<0||tolerance>100)throw Error('Substitute tolerance must be 0–100 cents.');
 const notes=scaleMembership(s).notes,used=new Set(occurrence.degrees.filter(d=>d!==null)),out=[];
 for(const missing of occurrence.missingCoordinates){const target=coordinateCents(s,missing.coordinate),choices=[];
  for(const note of notes){if(used.has(note.degree))continue;const offset=(target-note.pitchCents)/s.p,lo=Math.floor(offset),hi=Math.ceil(offset),nearest=Math.round(offset),shifts=offset-lo===hi-offset?[...new Set([lo,hi])]:[nearest];for(const periodShift of shifts){const pitchCents=note.pitchCents+periodShift*s.p,errorCents=pitchCents-target;if(Math.abs(errorCents)<=tolerance)choices.push({member:missing.member,ratio:missing.ratio,degree:note.degree,coordinate:[note.coordinate[0]+periodShift,note.coordinate[1]],periodShift,pitchCents,errorCents,exact:false});}}
  choices.sort((a,b)=>Math.abs(a.errorCents)-Math.abs(b.errorCents)||a.degree-b.degree||a.periodShift-b.periodShift);out.push(...choices.slice(0,Math.max(0,Math.min(8,limit))));
 }
 return out;
}
export async function chordRelationships(s,analysis,emit=()=>{},cancelled=()=>false){
 const source=chordCandidates(),out={status:'loading',subsets:[],supersets:[],aliases:[],done:0,total:source.length,limit:DISCOVERY_BOUNDS.relationships,limited:false};
 const add=(key,value)=>{if(out[key].length<out.limit)out[key].push(value);else out.limited=true;};
 for(const candidate of source){if(cancelled())return;out.done++;const id=candidate.identity;if(id.fingerprint!==analysis.identity.fingerprint){const row={id:id.fingerprint,text:candidate.text,label:candidate.label,form:candidate.form};
  if(id.cardinality<analysis.identity.cardinality&&jiSubset(id,analysis.identity))add('subsets',row);
  if(id.cardinality>analysis.identity.cardinality&&jiSubset(analysis.identity,id))add('supersets',row);
  const p=projectChord(s,id,{tolerance:analysis.projection.tolerance});if(p.temperedFingerprint&&p.temperedFingerprint===analysis.projection.temperedFingerprint)add('aliases',row);
 }
 if(out.done%8===0){emit(structuredClone(out));await new Promise(r=>setTimeout(r,0));}
 }
 if(!cancelled())emit({...out,status:'ready'});
}
