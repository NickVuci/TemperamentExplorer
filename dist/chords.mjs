// Degree/session compatibility adapters. Harmonic analysis has a shared owner.
import {DEFAULT_ODD_LIMIT,scale} from './engine.mjs';
import {noteCoordinate} from './pitch.mjs';
import {searchShapeOccurrences} from './chord-occurrence-v2.mjs';
import {createCoordinateInspector,inspectCoordinateChord,enumerateCoordinateChords} from './harmonic-inspection.mjs';
export function chordOccurrences(s,degrees){
 if(!degrees.length)return [];
 const notes=scale(s).notes,coordinates=degrees.map(i=>noteCoordinate(s,notes[i]));
 return searchShapeOccurrences(s,{coordinates}).completeOccurrences.map(o=>o.degrees.toSorted((a,b)=>a-b));
}
export function chordPair(s,i,j,ts,tol){
 const notes=scale(s).notes;
 return createCoordinateInspector(s,{tolerance:tol,span:s.p,targetRows:ts}).pair(noteCoordinate(s,notes[i]),noteCoordinate(s,notes[j]),notes[j].c-notes[i].c);
}
export function analyzeChord(s,degrees,limit=DEFAULT_ODD_LIMIT,tol=10,other=true,primeLimit=null,periodLifts={}){
 const ds=[...new Set(degrees)].sort((a,b)=>a-b),notes=scale(s).notes;
 if(!ds.length)return {pairs:[],qualified:false,max:null,covered:0,total:0,assessment:null};
 const coordinates=ds.map(i=>{const m=noteCoordinate(s,notes[i]);return [m[0]+(periodLifts[i]||0),m[1]];});
 const result=inspectCoordinateChord(s,coordinates,{limit,tolerance:tol,other,primeLimit,span:s.p});
 return {...result,pairs:result.pairs.map(p=>({...p,i:ds[p.i],j:ds[p.j]}))};
}
export function discoverChords(s,size=3,limit=DEFAULT_ODD_LIMIT,tol=10,other=true,primeLimit=null){
 if(s.n>96)throw Error('Automatic chord discovery supports up to 96 notes. Choose a smaller scale to search, or select chords manually in the HexBoard workspace.');
 if(![3,4].includes(size))throw Error('Choose triads or tetrads.');
 if(scale(s).collision)return {groups:[],count:0,collision:true};
 const notes=scale(s).notes.map((n,i)=>({degree:i,k:n.k,c:n.c,coordinate:noteCoordinate(s,n)})),groups=new Map();
 const groupKey=notes=>{const ks=notes.map(n=>n.k).sort((a,b)=>a-b);return ks.map(k=>k-ks[0]).join(',');};
 const search=enumerateCoordinateChords(s,notes,{size,groupKey,options:{limit,tolerance:tol,other,primeLimit,span:s.p},onChord:(notes,pairs)=>{
  const key=groupKey(notes),shape=key.split(',').map(Number),errors=pairs.map(t=>Math.abs(t.error)),score=Math.max(...errors),rms=Math.sqrt(errors.reduce((a,v)=>a+v*v,0)/errors.length);
  const item={degrees:notes.map(n=>n.degree),max:score,rms,mapped:pairs.filter(t=>t.identity).length,total:errors.length,labels:pairs.map(t=>t.label)};
  let group=groups.get(key);if(!group){group={shape,occurrences:[],best:item};groups.set(key,group);}
  group.occurrences.push(item);if(score<group.best.max-1e-8||Math.abs(score-group.best.max)<1e-8&&rms<group.best.rms)group.best=item;
 }});
 const result={groups:[...groups.values()].sort((a,b)=>a.best.max-b.best.max||a.best.rms-b.best.rms||a.shape.at(-1)-b.shape.at(-1)),count:search.count,collision:false};
 // Retain historical JSON/session envelopes; new UI reads bounded-search status.
 Object.defineProperties(result,{limited:{value:search.limited},complete:{value:search.complete},bounds:{value:search.bounds},visited:{value:search.visited}});
 return result;
}
