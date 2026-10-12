import {exactRatio} from './chord-identity-v2.mjs';
import {ratioWithinJILimits} from './ji-limit-engine.mjs';
import {legacyJIChordCandidates} from './harmonic-ji-chords.mjs';
// Transitional public entry for board-independent catalogue consumers.
export {queryCatalogue,getHarmonicEntry,resolveSelection} from './harmonic-catalogue.mjs';
let legacyCandidates;
export function chordCandidates(){
 if(legacyCandidates)return legacyCandidates;
 legacyCandidates=legacyJIChordCandidates();
 return legacyCandidates;
}
export function withinJILimits(identity,oddLimit,primeLimit=null){const q=identity.canonicalRatios.map(exactRatio);for(let i=0;i<q.length;i++)for(let j=i+1;j<q.length;j++){const a=q[i],b=q[j];if(!ratioWithinJILimits(b[0]*a[1],b[1]*a[0],{oddLimit,primeLimit}))return false;}return true;}
export function withinOddLimit(identity,limit){return withinJILimits(identity,limit,null);}
