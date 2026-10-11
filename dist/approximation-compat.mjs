import {mapRatio,mod} from './engine.mjs';
import {ratios} from './tuning.mjs';
import {sameCoordinate as same,noteCoordinate} from './pitch.mjs';
import {matrixScale} from './matrix.mjs';
import {immutable} from './cache.mjs';
import {rankApproximationCoordinates} from './harmonic-approximations.mjs';

const coordinateKey=m=>JSON.stringify(m);

function domainId(kind,s,coordinates){
 return `approximation-domain-v1:${JSON.stringify([kind,s.basis,s.rows,s.p,s.g,s.n,s.mode,s.matrixOctave===true,coordinates])}`;
}

function availableIntervals(s){
 const key=[s.p,s.g,s.n,s.mode,s.matrixOctave===true].join();
 if(availableIntervals.cache.has(key))return availableIntervals.cache.get(key);
 const span=matrixScale(s),notes=span.notes,list=new Map();
 for(const a of notes)for(const b of notes){
  const c=mod(b.c-a.c,span.p),k=b.k-a.k,m=[Math.round((c-k*s.g)/s.p),k];
  list.set(m.join(),m);
 }
 list.set(`${span.periods},0`,[span.periods,0]);
 if(availableIntervals.cache.size>8)availableIntervals.cache.clear();
 const result=[...list.values()];
 availableIntervals.cache.set(key,result);
 return result;
}
availableIntervals.cache=new Map();

/** Finite approximation domains retained for the legacy diamond workflow. */
export function approximationDomain(kind,s){
 if(!['temperament','scale-intervals','tonic-mode'].includes(kind))throw Error('Choose temperament, scale-intervals, or tonic-mode approximation domain.');
 if(kind==='temperament')return immutable({schemaVersion:1,id:domainId(kind,s,null),kind,finite:false,coordinates:null,
  search:{api:'searchIntervalApproximations',defaultGeneratorBound:32,maximumGeneratorBound:256}});
 const span=matrixScale(s),observations=kind==='tonic-mode'?span.notes.map(note=>({coordinate:noteCoordinate(s,note),actualCents:note.c})):null;
 const coordinates=kind==='scale-intervals'?availableIntervals(s):observations.map(value=>value.coordinate);
 return immutable({schemaVersion:1,id:domainId(kind,s,coordinates),kind,finite:true,coordinates:coordinates.map(value=>[...value]),
  ...(observations?{observations}:{}),
  sourceCount:kind==='scale-intervals'?span.notes.length*span.notes.length+1:span.notes.length,
  span:{periods:span.periods,noteCount:span.notes.length,periodCents:span.p,basePeriodCents:s.p},
  description:kind==='scale-intervals'?'Unique coordinates from all ordered matrix-note dyads plus the displayed span period.':'Tonic-relative coordinates for notes in the selected mode and matrix span.'});
}

function legacyCandidate(record,available=true){
 return {m:[...record.coordinate],c:record.tunedCents,error:record.signedErrorCents,available,mapped:record.mapped};
}

export function candidates(s,t){
 const domain=approximationDomain('scale-intervals',s),mapped=mapRatio(t.n,t.d,s),availableCoordinates=new Set(domain.coordinates.map(coordinateKey));
 const coordinates=[...domain.coordinates,...(mapped?[mapped]:[])];
 return rankApproximationCoordinates(s,s,t,coordinates,{policy:'candidate-list'})
  .map(record=>legacyCandidate(record,availableCoordinates.has(coordinateKey(record.coordinate))));
}

export function bestModeApproximations(s,t){
 const domain=approximationDomain('tonic-mode',s),best=rankApproximationCoordinates(s,s,t,domain.observations,{policy:'best-set'}).map(record=>legacyCandidate(record));
 return {best,secondary:null};
}

export function bestApproximations(s,t){
 const domain=approximationDomain('scale-intervals',s),all=candidates(s,t),best=rankApproximationCoordinates(s,s,t,domain.coordinates,{policy:'best-set'}).map(record=>legacyCandidate(record));
 const mapped=all.find(v=>v.mapped);
 return {best,secondary:mapped&&!best.some(v=>same(v.m,mapped.m))?mapped:null};
}

export function nearestReport(s,ts){
 let mapped=0,alternative=0,outside=0,absent=0;
 for(const t of ts){
  const m=mapRatio(t.n,t.d,s),all=candidates(s,t),available=all.filter(v=>v.available);
  if(!m){outside++;continue;}
  mapped++;
  const own=all.find(v=>v.mapped);
  if(!own.available)absent++;
  if(available.length&&Math.abs(available[0].error)+1e-7<Math.abs(own.error))alternative++;
 }
 return {mapped,alternative,outside,absent};
}
