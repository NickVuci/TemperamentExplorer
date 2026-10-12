import {target,assignment} from '../core/assignments.mjs';
import {validateState} from '../core/state.mjs';
import {presets} from '../core/engine.mjs';
export function presetSnapshot(name,input){
 if(typeof name!=='string'||!name.trim()||name.trim().length>80)throw Error('Enter a preset name from 1 to 80 characters.');
 if(!input||typeof input!=='object'||JSON.stringify(input).length>32000)throw Error('This temperament is too large to save as a preset.');
 const fields=['basis','rows','p','g','n','mode','assignments'];
 const s=Object.fromEntries(fields.filter(k=>input[k]!==undefined).map(k=>[k,structuredClone(input[k])]));
 s.name=name.trim();s.key=Object.hasOwn(presets,input.key)?input.key:'custom';s.commas=String(input.commas||'').slice(0,4000);s.generatorLabel=String(input.generatorLabel||'').slice(0,160);s.matrixOctave=input.matrixOctave===true;
 const methods=['Weil–Euclidean','Least Squares','Prime Least Squares','EDO','JI Target','Published WE','Published CWE','Computed WE','Computed CWE','Prime least squares','Minimax','Least squares','Pure intervals','EDO target','Quarter comma','Manual'];
 s.tuning=methods.includes(input.tuning)||/^EDO [1-9]\d{0,3}$/.test(input.tuning)?input.tuning:'Manual';
 if(input.tuneConfig){const c=input.tuneConfig;s.tuneConfig={method:methods.includes(c.method)?c.method:'Computed CWE',edoMax:[100,500,1000,5000].includes(Number(c.edoMax))?String(c.edoMax):'500',edoVariants:c.edoVariants===true,n:String(Math.max(2,Math.min(5000,Math.round(Number(c.n)||31)))),k:typeof c.k==='string'&&/^-?\d{0,5}$/.test(c.k)?c.k:'',h:typeof c.h==='string'&&/^\d{0,5}$/.test(c.h)?c.h:'',pure:String(c.pure||'5/4').slice(0,2000),targets:['primes','custom','5','7','9','13'].includes(String(c.targets))?String(c.targets):'primes',custom:String(c.custom||'').slice(0,2000),fixed:c.fixed!==false,period:Number.isFinite(Number(c.period))&&Number(c.period)>0?Number(c.period):s.p,jiAll:c.jiAll===true};}
 if(input.explore?.ratio){try{const t=target(input.explore.ratio);s.explore={ratio:t.label,...(input.explore.m?{m:assignment(t,input.explore.m).m}:{})};}catch{}}
 return validateState(s);
}

// randomUUID requires a secure context; getRandomValues also supports local previews.
export function createPresetId(random=globalThis.crypto){
 if(typeof random.randomUUID==='function')return random.randomUUID();
 const bytes=random.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
 const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
