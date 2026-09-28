import {chordVoicings} from './chord-voicings.mjs';
import {chordPlacements} from './hexboard-chords.mjs';
import {coordinateCents} from './pitch.mjs';
import {scaleMembership} from './chord-occurrence-v2.mjs';
export const realizationDefaults=()=>({inversion:0,style:'original',order:'pitch',periodShift:0,registerMin:-8,registerMax:8,reach:0});
export function validateRealization(request={}){
 const r={...realizationDefaults(),...request};
 for(const [key,lo,hi]of [['inversion',0,7],['periodShift',-8,8],['registerMin',-8,8],['registerMax',-8,8],['reach',0,20]])if(!Number.isInteger(r[key])||r[key]<lo||r[key]>hi)throw Error(`Invalid ${key}.`);
 if(r.registerMin>r.registerMax||!['compact','original','open'].includes(r.style)||!['pitch','input'].includes(r.order))throw Error('Invalid voicing options.');return r;
}
export function realizeChord(s,analysis,occurrence,request={}){
 occurrence=analysis.occurrences.completeOccurrences.find(o=>o.id===occurrence?.id);
 if(!occurrence)throw Error('Select a complete exact occurrence.');
 const r=validateRealization(request),seen=new Set(),indices=[];
 analysis.projection.notes.forEach((n,i)=>{if(!seen.has(n.periodClass)){seen.add(n.periodClass);indices.push(i);}});
 const tones=indices.map(i=>{const q=analysis.identity.canonicalRatios[i];return {n:Number(q.n),d:Number(q.d),label:q.label,c:analysis.projection.notes[i].idealCents};});
 const instance={coords:indices.map(i=>occurrence.coords[i]),degrees:indices.map(i=>occurrence.degrees[i])};
 const signatures=new Set(),variants=chordVoicings(s,{tones},instance,{style:r.style,tol:analysis.projection.tolerance}).filter(v=>{const signature=JSON.stringify(v.coords.map(m=>[m[0]-v.coords[0][0],m[1]]));if(signatures.has(signature))return false;signatures.add(signature);return true;});
 const voice=variants.find(v=>Number(v.id)===r.inversion)||variants[0];
 r.inversion=Number(voice.id);
 const order=indices.map((_,i)=>i).sort((a,b)=>r.order==='input'?analysis.identity.orderedRatios.indexOf(tones[a].label)-analysis.identity.orderedRatios.indexOf(tones[b].label):voice.pitches[a]-voice.pitches[b]||a-b);
 const coords=order.map(i=>[voice.coords[i][0]+r.periodShift,voice.coords[i][1]]),degrees=order.map(i=>instance.degrees[i]),base=scaleMembership(s).notes;
 const registers=coords.map((m,i)=>m[0]-base[degrees[i]].coordinate[0]);
 const id='voice2:'+JSON.stringify([occurrence.id,r,coords]);
 return {id,occurrenceId:occurrence.id,chordId:analysis.identity.fingerprint,request:r,coords,degrees,registers,pitches:coords.map(m=>coordinateCents(s,m)),ratios:order.map(i=>voice.ratios[i]),variants:variants.map(v=>({id:Number(v.id),label:v.label})),inversion:Number(voice.id),withinRegisterRange:registers.every(x=>x>=r.registerMin&&x<=r.registerMax),collapsedMembers:analysis.projection.originalCardinality-indices.length,reference:voice.reference};
}
export function placeRealization(s,realization,board,near=65){
 const r=realization.request,base=scaleMembership(s).notes,byG=new Map(base.map(n=>[n.generator,n]));
 let raw;if(realization.coords.length===1)raw=board.keys.filter(k=>k.enabled&&k.m[1]===realization.coords[0][1]).map(k=>({keys:[k.index],periodShift:k.m[0]-realization.coords[0][0],reach:0}));else raw=chordPlacements(board,realization.coords,near,{exact:true,periodCopies:true});
 const all=raw.filter(f=>(!r.reach||f.reach<=r.reach)&&f.keys.every(i=>{const k=board.keys[i],n=byG.get(k.m[1]),register=n?k.m[0]-n.coordinate[0]:Infinity;return register>=r.registerMin&&register<=r.registerMax;}));
 all.sort((a,b)=>a.reach-b.reach||Math.abs(a.periodShift)-Math.abs(b.periodShift)||a.keys.join(',').localeCompare(b.keys.join(','),'en'));
 return {realizationId:realization.id,occurrenceId:realization.occurrenceId,limited:!!raw.limited,placements:all.map(f=>({...f,realizationId:realization.id,coords:f.keys.map(i=>board.keys[i].m),pitches:f.keys.map(i=>board.keys[i].c),duplicates:f.keys.map(i=>board.keys.filter(k=>k.enabled&&k.m[0]===board.keys[i].m[0]&&k.m[1]===board.keys[i].m[1]).map(k=>k.index)),compactness:f.reach,layout:{wrapping:!!board.wrapping,anchor:near}}))};
}
