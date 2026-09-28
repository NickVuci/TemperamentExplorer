import {mapRatio,mod,gcd} from './engine.mjs';
import {ratios} from './tuning.mjs';
import {sameCoordinate as same,noteCoordinate,coordinateCents} from './pitch.mjs';
import {matrixScale} from './matrix.mjs';
export {sameCoordinate as same} from './pitch.mjs';
export const coordinate=m=>`${m[0]} periods + ${m[1]} generators`;
export function target(text){const list=ratios(text);if(list.length!==1)throw Error('Explore one ratio at a time.');const t=list[0],g=gcd(t.n,t.d);t.n/=g;t.d/=g;t.label=`${t.n}/${t.d}`;return t;}
const intervalCache=new Map();
function availableIntervals(s){const key=[s.p,s.g,s.n,s.mode,s.matrixOctave===true].join();if(intervalCache.has(key))return intervalCache.get(key);const span=matrixScale(s),notes=span.notes,list=new Map();for(const a of notes)for(const b of notes){const c=mod(b.c-a.c,span.p),k=b.k-a.k,m=[Math.round((c-k*s.g)/s.p),k];list.set(m.join(),m);}list.set(`${span.periods},0`,[span.periods,0]);if(intervalCache.size>8)intervalCache.clear();intervalCache.set(key,[...list.values()]);return intervalCache.get(key);}
export function candidates(s,t){
 const mapped=mapRatio(t.n,t.d,s),list=new Map(),put=(m,available)=>{const key=m.join(',');if(list.has(key)){list.get(key).available ||= available;return;}const c=coordinateCents(s,m);list.set(key,{m,c,error:c-t.c,available,mapped:same(m,mapped)});};
 for(const m of availableIntervals(s))put(m,true);
 if(mapped)put(mapped,false);
 return [...list.values()].sort((a,b)=>Math.abs(a.error)-Math.abs(b.error)||Math.abs(a.m[1])-Math.abs(b.m[1]));
}
export function assignment(t,m){if(!Array.isArray(m)||m.length!==2||!m.every(x=>Number.isInteger(x)&&Math.abs(x)<=1000))throw Error('Use integer coordinates between −1000 and 1000.');return {...target(t.label),m:[...m]};}
export function bestModeApproximations(s,t){
 const mapped=mapRatio(t.n,t.d,s),list=matrixScale(s).notes.map(v=>{const m=noteCoordinate(s,v);return {m,c:v.c,error:v.c-t.c,available:true,mapped:same(m,mapped)};});
 const error=Math.min(...list.map(v=>Math.abs(v.error))),best=list.filter(v=>Math.abs(v.error)<=error+1e-7).sort((a,b)=>Number(b.mapped)-Number(a.mapped)||Math.abs(a.m[1])-Math.abs(b.m[1]));
 return {best,secondary:null};
}
export function bestApproximations(s,t){
 const all=candidates(s,t),available=all.filter(v=>v.available),error=Math.min(...available.map(v=>Math.abs(v.error)));
 const best=available.filter(v=>Math.abs(v.error)<=error+1e-7).sort((a,b)=>Number(b.mapped)-Number(a.mapped)||Math.abs(a.m[1])-Math.abs(b.m[1]));
 const mapped=all.find(v=>v.mapped);
 return {best,secondary:mapped&&!best.some(v=>same(v.m,mapped.m))?mapped:null};
}
import {rational as q,sub,mul,div,show} from './rational.mjs';
function factors(t){let n=t.n,d=t.d;const out=new Map();for(let p=2;p<=97;p++){let e=0;while(n%p===0){n/=p;e++;}while(d%p===0){d/=p;e--;}if(e)out.set(p,e);}if(n!==1||d!==1)throw Error(`${t.label}: mapping checks support primes up to 97. You can still tune this interval pure.`);return out;}
// Exact rational elimination. Underdetermined extensions are left unresolved,
// never declared integer-compatible based on a floating-point solution.
export function checkAssignments(s,input){
 const list=input.map(t=>assignment(t,t.m));if(!list.length)return {status:'empty',message:'Choose an interval and add its target assignment.'};
 try{
 for(const t of list){const m=mapRatio(t.n,t.d,s);if(m&&!same(m,t.m))return {status:'conflict',message:`${t.label} is assigned to a different interval in the current mapping.`,detail:`The mapping requires ${coordinate(m)}; you selected ${coordinate(t.m)}. Both assignments cannot be used for this ratio while preserving the current temperament mapping. You can still tune or audition your chosen interval.`};}
 const fs=list.map(factors),basis=[...s.basis,...[...new Set(fs.flatMap(f=>[...f.keys()]))].filter(p=>!s.basis.includes(p)).sort((a,b)=>a-b)],unknown=basis.filter(p=>!s.basis.includes(p));
 if(basis.length>10)return {status:'unresolved',message:'This extension exceeds the supported maximum of 10 basis primes.'};
 const labels=[...s.basis.map(p=>`${p}/1 (existing mapping)`),...list.map(t=>t.label)];
 const eqs=s.basis.map((p,i)=>({f:new Map([[p,1]]),m:s.rows.map(r=>r[i])})).concat(list.map((t,i)=>({f:fs[i],m:t.m})));
 const A=eqs.map((e,i)=>({v:[...basis.map(p=>q(e.f.get(p)||0)),...e.m.map(x=>q(x))],w:eqs.map((_,j)=>q(i===j?1:0))}));let row=0;const pivots=[];
 for(let c=0;c<basis.length;c++){const k=A.findIndex((r,i)=>i>=row&&r.v[c][0]!==0n);if(k<0)continue;[A[row],A[k]]=[A[k],A[row]];const pivot=A[row].v[c];A[row].v=A[row].v.map(x=>div(x,pivot));A[row].w=A[row].w.map(x=>div(x,pivot));for(let j=0;j<A.length;j++)if(j!==row){const f=A[j].v[c];A[j].v=A[j].v.map((x,i)=>sub(x,mul(f,A[row].v[i])));A[j].w=A[j].w.map((x,i)=>sub(x,mul(f,A[row].w[i])));}pivots.push(c);row++;}
 const bad=A.find(r=>r.v.slice(0,basis.length).every(x=>x[0]===0n)&&r.v.slice(basis.length).some(x=>x[0]!==0n));
 if(bad)return {status:'conflict',message:'These assignments conflict with the existing mapping or each other.',detail:`Relationship: ${bad.w.map((x,i)=>x[0]!==0n?`(${labels[i]}) × ${show(x)}`:null).filter(Boolean).join(' + ')}. Its ratio exponents cancel, so its coordinates must be [0, 0]; these assignments give [${bad.v.slice(basis.length).map(show).join(', ')}]. Coefficients mean powers of ratios (addition of mapped intervals).`};
 if(row<basis.length)return {status:'unresolved',message:`More assignments needed to determine the added primes (${unknown.join(', ')}).`,detail:'No contradictory equation was found, but a complete integer extension has not yet been established. Assign an interval isolating each remaining prime, such as 7/4 or 11/8.'};
 const rows=[[],[]];pivots.forEach((c,i)=>{rows[0][c]=A[i].v[basis.length];rows[1][c]=A[i].v[basis.length+1];});
 if(rows.flat().some(x=>x[1]!==1n))return {status:'conflict',message:'These assignments require fractional generator or period coordinates.',detail:'They cannot extend this integer mapping without changing its generator basis or period subdivision.'};
 const result=rows.map(r=>r.map(x=>Number(x[0])));if(result.flat().some(x=>Math.abs(x)>1000))return {status:'unresolved',message:'The extension exceeds the supported coordinate range (±1000).'};
 return {status:'compatible',message:unknown.length?'Compatible extension — ready to adopt.':'All selected assignments agree with the existing mapping.',basis,rows:result,extended:unknown.length>0};
 }catch(e){return {status:'unresolved',message:e.message};}
}
export function nearestReport(s,ts){let mapped=0,alternative=0,outside=0,absent=0;for(const t of ts){const m=mapRatio(t.n,t.d,s),all=candidates(s,t),available=all.filter(v=>v.available);if(!m){outside++;continue;}mapped++;const own=all.find(v=>v.mapped);if(!own.available)absent++;if(available.length&&Math.abs(available[0].error)+1e-7<Math.abs(own.error))alternative++;}return {mapped,alternative,outside,absent};}
