import {chordIdentity} from './chord-identity-v2.mjs';
import {projectChord} from './chord-projection-v2.mjs';
import {searchOccurrences,largerScaleDiagnostics} from './chord-occurrence-v2.mjs';
import {BoundedCache,immutable} from './cache.mjs';
const cache=new BoundedCache(64);
export function analyzeChord(s,text,{tolerance=10,larger=false}={}){
 const key=JSON.stringify([2,s.basis,s.rows,s.p,s.g,s.n,s.mode,text,tolerance,larger]);
 return cache.get(key,()=>{const identity=chordIdentity(text),projection=projectChord(s,identity,{tolerance}),occurrences=searchOccurrences(s,projection);return immutable({identity,projection,occurrences,largerScales:larger?largerScaleDiagnostics(s,projection):[]});});
}
