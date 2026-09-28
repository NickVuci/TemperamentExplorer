import {chordMonzos} from './chord-identity-v2.mjs';
import {mapRatio} from './engine.mjs';
import {coordinateCents} from './pitch.mjs';
// Quotient by the actual rank-2 period: (P,G) ~ (P+k,G).
export const periodClass=m=>String(m[1]);
export function projectChord(s,identity,{tolerance=10}={}){
 if(!Number.isFinite(tolerance)||tolerance<0||tolerance>100)throw Error('Tolerance must be between 0 and 100 cents.');
 const monzos=chordMonzos(identity,s.basis);
 const notes=identity.canonicalRatios.map((q,i)=>{const {monzo,missingPrimes}=monzos[i],coordinate=missingPrimes.length?null:mapRatio(Number(q.n),Number(q.d),s),idealCents=1200*Math.log2(Number(q.n)/Number(q.d)),tunedCents=coordinate?coordinateCents(s,coordinate):null,errorCents=coordinate?tunedCents-idealCents:null;return {index:i,ratio:q.label,monzo,missingPrimes,coordinate,periodClass:coordinate?periodClass(coordinate):null,idealCents,tunedCents,errorCents,absoluteErrorCents:errorCents===null?null:Math.abs(errorCents)};});
 const mapped=notes.every(n=>n.coordinate),missingPrimes=[...new Set(notes.flatMap(n=>n.missingPrimes))].sort((a,b)=>a-b);
 const groups=new Map();for(const n of notes)if(n.coordinate){const k=n.periodClass;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(n.index);}
 const errors=notes.map(n=>n.errorCents),maxErrorCents=mapped?Math.max(...errors.map(Math.abs)):null,rmsErrorCents=mapped?Math.sqrt(errors.reduce((a,e)=>a+e*e,0)/errors.length):null;
 const pairErrors=mapped?notes.flatMap((a,i)=>notes.slice(i+1).map(b=>b.errorCents-a.errorCents)):[];
 const pairwiseMaxErrorCents=mapped?Math.max(0,...pairErrors.map(Math.abs)):null,pairwiseRmsErrorCents=mapped?(pairErrors.length?Math.sqrt(pairErrors.reduce((a,e)=>a+e*e,0)/pairErrors.length):0):null;
 const gens=[...groups.keys()].map(Number).sort((a,b)=>a-b);
 // Translation-invariant discrete shape; mapping signature prevents cross-map aliases.
 const temperedFingerprint=mapped?'temp2:'+JSON.stringify([s.basis,s.rows,gens.map(g=>g-gens[0])]):null;
 return {version:2,identity,notes,basisStatus:mapped?'mapped':'outside-basis',missingPrimes,tolerance,maxErrorCents,rmsErrorCents,pairwiseMaxErrorCents,pairwiseRmsErrorCents,qualityStatus:!mapped?'unavailable':maxErrorCents<=tolerance?'within-tolerance':'above-tolerance',originalCardinality:identity.cardinality,temperedCardinality:mapped?groups.size:null,cardinalityStatus:!mapped?'unavailable':groups.size<identity.cardinality?'collapsed':'preserved',collisionGroups:[...groups].filter(([,v])=>v.length>1).map(([coordinate,members])=>({periodClass:coordinate,members})),temperedFingerprint,generatorSpan:mapped?gens.at(-1)-gens[0]:null};
}
