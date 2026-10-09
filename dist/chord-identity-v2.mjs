// Exact, tuning-independent JI identity. Public values use decimal strings so
// worker messages and saved sessions require no BigInt serialization policy.
import {rational,div,bigintGcd} from './rational.mjs';
import {ratioMonzo} from './ji-monzo.mjs';
import {BoundedCache} from './cache.mjs';
export const CHORD_INPUT_BOUNDS=Object.freeze({characters:300,tones:8,integer:1000000});
export const MAX_CHORD_TONES=CHORD_INPUT_BOUNDS.tones;
export const compareExactRatios=(a,b)=>a[0]*b[1]<b[0]*a[1]?-1:a[0]*b[1]>b[0]*a[1]?1:0;
const cmp=compareExactRatios;
const key=q=>`${q[0]}/${q[1]}`;
export const exactRatio=q=>rational(q.n,q.d);
export function chordIdentity(input){
 if(typeof input!=='string'||!input.trim())throw Error('Enter two to eight positive ratios.');
 if(input.length>300)throw Error('Chord input is limited to 300 characters.');
 const originalInput=input,trim=input.trim(),compact=/^1\/\d+(?::\d+)+$/.test(trim);
 if(/(^|:)\s*(?=:|$)/.test(trim))throw Error('Chord members cannot be empty.');
 const tokens=compact?trim.slice(2).split(':').map(x=>'1/'+x):trim.split(/[:\s,]+/);
 if(tokens.length<2||tokens.length>8)throw Error('Enter two to eight chord members.');
 const raw=tokens.map(token=>{if(!/^\d+(?:\/\d+)?$/.test(token))throw Error(`Invalid ratio: ${token}. Use positive integers or fractions.`);const [n,d='1']=token.split('/').map(BigInt);if(n<1n||d<1n)throw Error('Ratios must be positive and denominators cannot be zero.');if(n>1000000n||d>1000000n)throw Error('Each numerator and denominator must be at most 1000000.');return rational(n,d);});
 const sorted=[...raw].sort(cmp),base=sorted[0],normalized=raw.map(q=>div(q,base));
 const ratios=[...new Map([...normalized].sort(cmp).map(q=>[key(q),q])).values()];
 const canonicalRatios=ratios.map(q=>({n:String(q[0]),d:String(q[1]),label:key(q),exponents:ratioMonzo(q,null,{includeBasis:false}).sparseMonzo}));
 const integerLcm=ratios.reduce((a,q)=>a*q[1]/bigintGcd(a,q[1]),1n),ints=ratios.map(q=>q[0]*(integerLcm/q[1]));
 const otonal=ints.join(':'),reciprocal='1/'+[...ints].reverse().join(':');
 return {version:2,originalInput,orderedInput:tokens,orderedRatios:normalized.map(key),canonicalRatios,cardinality:ratios.length,inputCardinality:tokens.length,repeatedMembers:tokens.length-ratios.length,fingerprint:'ji2:'+canonicalRatios.map(q=>q.label).join(':'),displayLabel:compact?trim:originalInput.trim(),aliases:{otonal,reciprocal},primeSupport:[...new Set(canonicalRatios.flatMap(q=>Object.keys(q.exponents).map(Number)))].sort((a,b)=>a-b)};
}
// Factorization depends only on the ratios and basis; temperament changes reuse it.
const monzoCache=new BoundedCache(4096);
export function chordMonzos(identity,basis){return monzoCache.get(JSON.stringify([identity.canonicalRatios.map(q=>q.label??`${q.n}/${q.d}`),basis]),()=>Object.freeze(identity.canonicalRatios.map(q=>{const result=ratioMonzo(q,basis);return Object.freeze({monzo:Object.freeze(result.basisMonzo),missingPrimes:Object.freeze(result.missingPrimes)});})));}
// Proportional subsets: test each possible common scale factor exactly.
export function jiSubset(a,b){
 if(a.cardinality>b.cardinality)return false;
 const A=a.canonicalRatios.map(exactRatio),B=b.canonicalRatios.map(exactRatio),set=new Set(B.map(key));
 return B.some(root=>{const factor=div(root,A[0]);return A.every(q=>set.has(key(rational(q[0]*factor[0],q[1]*factor[1]))));});
}
