export {presets,makeState,publishedTuning} from './catalog.mjs';
import {mod,noteCoordinate} from './pitch.mjs';
import {BoundedCache,immutable} from './cache.mjs';
import {DEFAULT_ODD_LIMIT,MANUAL_PRIME_LIMIT_VALUES,ODD_LIMIT_VALUES,PRIME_LIMIT_VALUES,diamondTargets,formatPrimeFilter,primeFilterForBasis,primeLimitForBasis,ratioWithinJILimits,targetsForLimits,validateJILimits} from './ji-limit-engine.mjs';
export {mod,gcd,purePeriod,periodUnits,referenceCents,periodDescription,leastSquares} from './pitch.mjs';
export {DEFAULT_ODD_LIMIT,MANUAL_PRIME_LIMIT_VALUES,ODD_LIMIT_VALUES,PRIME_LIMIT_VALUES,diamondTargets,formatPrimeFilter,primeFilterForBasis,primeLimitForBasis,ratioWithinJILimits,validateJILimits};
const notesCache=new BoundedCache(512);
export function scale(s,n=s.n){return notesCache.get(JSON.stringify([s.p,s.g,n,mod(s.mode,n)]),()=>immutable(computeScale(s,n)));}
function computeScale(s,n){let raw=Array.from({length:n},(_,k)=>({c:mod(k*s.g,s.p),k})).sort((a,b)=>a.c-b.c);const collision=raw.some((v,i)=>i&&v.c-raw[i-1].c<1e-6)||(n>1&&s.p-raw.at(-1).c+raw[0].c<1e-6);const m=mod(s.mode,n),root=raw[m];let notes=raw.map(v=>({c:mod(v.c-root.c,s.p),k:v.k-root.k})).sort((a,b)=>a.c-b.c);let steps=notes.map((v,i)=>(i===n-1?s.p:notes[i+1].c)-v.c);let sizes=[];steps.forEach(v=>{if(!sizes.some(t=>Math.abs(t-v)<1e-5))sizes.push(v);});sizes.sort((a,b)=>a-b);let small=sizes[0],large=sizes.at(-1),l=steps.filter(v=>Math.abs(v-large)<1e-5).length;return {notes,steps,sizes,collision,mos:!collision&&sizes.length===2,equal:!collision&&sizes.length===1,signature:collision?'Pitch collisions':sizes.length===1?`${n} equal steps`:sizes.length===2?`${l}L ${n-l}s`:sizes.length===3?`${l}L ${steps.filter(v=>Math.abs(v-sizes[1])<1e-5).length}M ${steps.filter(v=>Math.abs(v-small)<1e-5).length}s`:`${sizes.length} step sizes`,small,large};}
export const MAX_SCALE_SIZE=256;
const scaleCache=new Map();
export function generatedSizes(s,filter='all'){
 const key=JSON.stringify([s.p,s.g]);
 if(!scaleCache.has(key)){
  const out=[];
  for(let n=2;n<=MAX_SCALE_SIZE;n++){const a=scale({...s,mode:0},n);if(a.collision)break;out.push({n,...a});}
  if(scaleCache.size>=4)scaleCache.clear();scaleCache.set(key,out);
 }
 const all=scaleCache.get(key);return filter==='2'||filter==='3'?all.filter(a=>a.sizes.length===Number(filter)):all;
}
export function mosSizes(s){return generatedSizes(s).filter(a=>a.mos||a.equal);}
export function scaleChoices(s,filter='all'){
 const choices=generatedSizes(s,filter).map(a=>({...a,retained:false}));
 if(!choices.some(a=>a.n===s.n))choices.push({n:s.n,...scale({...s,mode:0}),retained:true});
 return choices.sort((a,b)=>a.n-b.n);
}
export function stepSymbol(a,v){return a.equal?'=':a.sizes.length===2?(Math.abs(v-a.large)<1e-5?'L':'s'):['s','M','L'][a.sizes.findIndex(x=>Math.abs(x-v)<1e-5)]||'?';}
export function mapRatio(num,den,s){let exps=[];for(const p of s.basis){let e=0;while(num%p===0){num/=p;e++;}while(den%p===0){den/=p;e--;}exps.push(e);}if(num!==1||den!==1)return null;return s.rows.map(row=>row.reduce((t,v,i)=>t+v*exps[i],0));}
export function targets(limit=DEFAULT_ODD_LIMIT,primeLimit=null){return targetsForLimits(limit,primeLimit);}
export function interval(s,i,j,layout='notes'){const a=scale(s).notes;if(layout==='distance'&&j===s.n)return {c:s.p,k:0,end:i,period:true};const end=layout==='distance'?(i+j)%s.n:j;return {c:mod(a[end].c-a[i].c,s.p),k:a[end].k-a[i].k,end};}
export function classifyTargets(s,v,ts,tolerance){return createTargetClassifier(s,ts,tolerance)(v);}
// Compile mapped target coordinates once per matrix/search, not once per cell.
export function createTargetClassifier(s,ts,tolerance){
 const prepared=ts.map(t=>({t,m:mapRatio(t.n,t.d,s)}));
 const cache=new BoundedCache(1024),pitch={p:s.p,g:s.g};
 return v=>cache.get(`${v.c},${v.k}`,()=>{
 const q=noteCoordinate(pitch,v)[0],mapped=[],hits=[];
 for(const {t,m} of prepared){const error=v.c-t.c,within=Math.abs(error)<=tolerance+1e-8;
  const identity=!!m&&m[0]===q&&m[1]===v.k;
  const item={...t,error,within,identity,reason:m?'Mapped to another interval':'Outside temperament basis'};
  if(identity)mapped.push(item);else if(within)hits.push(item);
 }
 const order=(a,b)=>Math.abs(a.error)-Math.abs(b.error)||a.c-b.c;
 return immutable({mapped:mapped.sort(order),hits:hits.sort(order)});
 });
}
