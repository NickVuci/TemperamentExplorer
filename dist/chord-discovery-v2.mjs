import {chordIdentity,jiSubset,exactRatio} from './chord-identity-v2.mjs';
import {DEFAULT_ODD_LIMIT,ratioWithinJILimits,validateJILimits} from './ji-limit-engine.mjs';
import {analyzeChord} from './chord-analysis-v2.mjs';
import {legacyJIChordCandidates} from './harmonic-ji-chords.mjs';
import {eventLoopBoundary} from './harmonic-cooperative.mjs';
// Transitional public entry for board-independent catalogue consumers. Legacy
// Play discovery retains its verified scale/tolerance semantics until Stage 11.
export {queryCatalogue,getHarmonicEntry,resolveSelection} from './harmonic-catalogue.mjs';
export const DISCOVERY_BOUNDS=Object.freeze({candidates:256,harmonicStart:16,harmonicMaximum:23,tones:8,relationships:24});
export const discoveryDefaults=()=>({minTones:3,maxTones:6,oddLimit:DEFAULT_ODD_LIMIT,primeLimit:null,form:'both',maxError:10,maxSpan:255,occurrence:'complete',collisions:'preserved',sort:'accuracy',contains:''});
export function validateDiscovery(config={}){
 const c={...discoveryDefaults(),...config};
 if(c.primeLimit===undefined)c.primeLimit=null;
 for(const [k,lo,hi]of [['minTones',2,8],['maxTones',2,8],['oddLimit',3,97],['maxSpan',0,10000]])if(!Number.isInteger(c[k])||c[k]<lo||c[k]>hi)throw Error(`Invalid ${k}.`);
 c.primeLimit=validateJILimits({oddLimit:c.oddLimit,primeLimit:c.primeLimit}).primeLimit;
 if(c.minTones>c.maxTones||!Number.isFinite(c.maxError)||c.maxError<0||c.maxError>100)throw Error('Invalid discovery bounds.');
 for(const [k,values]of Object.entries({form:['both','otonal','utonal'],occurrence:['complete','any'],collisions:['preserved','allow'],sort:['accuracy','roots','span','name']}))if(!values.includes(c[k]))throw Error(`Invalid ${k}.`);
 if(typeof c.contains!=='string'||c.contains.length>300)throw Error('Invalid contains-chord input.');if(c.contains.trim())chordIdentity(c.contains);
 return c;
}
let legacyCandidates;
export function chordCandidates(){
 if(legacyCandidates)return legacyCandidates;
 legacyCandidates=legacyJIChordCandidates();
 return legacyCandidates;
}
export function withinJILimits(identity,oddLimit,primeLimit=null){const q=identity.canonicalRatios.map(exactRatio);for(let i=0;i<q.length;i++)for(let j=i+1;j<q.length;j++){const a=q[i],b=q[j];if(!ratioWithinJILimits(b[0]*a[1],b[1]*a[0],{oddLimit,primeLimit}))return false;}return true;}
export function withinOddLimit(identity,limit){return withinJILimits(identity,limit,null);}
export function discoveryOrder(sort){return (a,b)=> (sort==='roots'?b.analysis.occurrences.completeCount-a.analysis.occurrences.completeCount:sort==='span'?a.analysis.projection.generatorSpan-b.analysis.projection.generatorSpan:sort==='name'?a.label.localeCompare(b.label,'en'):a.analysis.projection.maxErrorCents-b.analysis.projection.maxErrorCents)||a.id.localeCompare(b.id,'en');}
export async function discoverChords(s,config,emit=()=>{},cancelled=()=>false){
 const c=validateDiscovery(config),source=chordCandidates(),contains=c.contains.trim()?chordIdentity(c.contains):null,rows=[];let done=0;
 const report=status=>{const grouped=new Map();for(const row of [...rows].sort(discoveryOrder(c.sort))){const key=row.analysis.projection.temperedFingerprint;if(!grouped.has(key))grouped.set(key,{...row,aliases:[]});else grouped.get(key).aliases.push(row);}return {status,rows:[...grouped.values()].sort(discoveryOrder(c.sort)),done,total:source.length,bounds:{...DISCOVERY_BOUNDS,actualCandidates:source.length,...c}};};
 emit(report('loading'));
 for(const candidate of source){if(cancelled())return;done++;const id=candidate.identity;
  if(id.cardinality>=c.minTones&&id.cardinality<=c.maxTones&&(c.form==='both'||candidate.form===c.form||candidate.form==='self')&&withinJILimits(id,c.oddLimit,c.primeLimit)&&(!contains||jiSubset(contains,id))){
   const analysis=analyzeChord(s,candidate.text,{tolerance:c.maxError}),p=analysis.projection,o=analysis.occurrences;
   if(p.basisStatus==='mapped'&&p.maxErrorCents<=c.maxError&&p.generatorSpan<=c.maxSpan&&(c.collisions==='allow'||p.cardinalityStatus==='preserved')&&(c.occurrence==='any'||o.completeOccurrences.length))rows.push({...candidate,id:id.fingerprint,analysis:{projection:{basisStatus:p.basisStatus,maxErrorCents:p.maxErrorCents,rmsErrorCents:p.rmsErrorCents,generatorSpan:p.generatorSpan,cardinalityStatus:p.cardinalityStatus,temperedCardinality:p.temperedCardinality,temperedFingerprint:p.temperedFingerprint},occurrences:{completeCount:o.completeOccurrences.length,status:o.status}}});
  }
  if(done%8===0){emit(report('loading'));await eventLoopBoundary();}
 }
 if(!cancelled())emit(report('ready'));
}
