import {chordIdentity} from './chord-identity.mjs';
import {projectChord} from './chord-projection.mjs';
import {searchOccurrences,searchShapeOccurrences,largerScaleDiagnostics} from './chord-occurrence.mjs';
import {BoundedCache,immutable} from '../core/cache.mjs';
const cache=new BoundedCache(64);
export function analyzeChord(s,text,{tolerance=10,larger=false}={}){
 const key=JSON.stringify([2,s.basis,s.rows,s.p,s.g,s.n,s.mode,text,tolerance,larger]);
 return cache.get(key,()=>{const identity=chordIdentity(text),projection=projectChord(s,identity,{tolerance}),occurrences=searchOccurrences(s,projection);return immutable({identity,projection,occurrences,largerScales:larger?largerScaleDiagnostics(s,projection):[]});});
}
/** Coordinate-only catalogue shapes require no invented JI interpretation. */
export function analyzeShape(s,shape,options={}){return immutable({shape:structuredClone(shape),occurrences:searchShapeOccurrences(s,shape,options)});}
