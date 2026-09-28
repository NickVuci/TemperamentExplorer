// Display geometry is separate from the canonical JI target/filter engine.
import {ratioWithinJILimits,validateJILimits} from './ji-limit-engine.mjs';
import {gcd,scale} from './engine.mjs';
import {chordIdentity} from './chord-identity-v2.mjs';
export function parseDiamondHarmonics(text){
 if(/[:,]\s*[:,]/.test(String(text)))throw Error('Separate each harmonic with a single colon or comma.');
 const parts=String(text).trim().split(/[\s,:]+/);
 if(parts.length<2||parts.length>16||parts.some(x=>!/^\d+$/.test(x)||Number(x)<1||Number(x)>256)||new Set(parts.map(Number)).size!==parts.length)throw Error('Enter 2–16 distinct whole-number harmonics from 1 to 256, separated by colons.');
 return parts.map(Number);
}
export function diamondLayout(cfg,layout={}){
 const {oddLimit,primeLimit}=validateJILimits({oddLimit:cfg.limit,primeLimit:cfg.primeLimit??null});
 // Filtering the axes removes holes. Octave normalization remains the canonical
 // default; a subgroup without 2 may consequently have unavailable cells.
 const axisFilter=Array.isArray(primeLimit)?[...new Set([2,...primeLimit])]:primeLimit;
 const harmonics=layout.harmonics?parseDiamondHarmonics(layout.harmonics):Array.from({length:(oddLimit+1)/2},(_,i)=>2*i+1).filter(n=>ratioWithinJILimits(n,1,{oddLimit,primeLimit:axisFilter}));
 const fold=layout.harmonics?layout.fold===true:true,count=harmonics.length,w=64,h=52,pad=8,cells=[];
 for(let i=0;i<count;i++)for(let j=0;j<count;j++){
  let n=harmonics[i],d=harmonics[j];if(fold){while(n>=2*d)d*=2;while(n<d)n*=2;}const common=gcd(n,d);n/=common;d/=common;
  cells.push({id:`${i}:${j}`,i,j,n,d,label:`${n}/${d}`,c:1200*Math.log2(n/d),x:pad+(i+j+1)*w,y:pad+(count+j-i)*h});
 }
 return {harmonics,cells,count,w,h,pad,width:count*w*2+pad*2,height:count*h*2+pad*2,custom:!!layout.harmonics,fold};
}
export function selectedDiamondCoordinates(cells,ids){
 const chosen=new Set(ids),selected=cells.filter(t=>chosen.has(t.id));
 if(!selected.length)throw Error('Select diamond cells first.');
 if(selected.some(t=>!t.status?.approximation))throw Error('Some selected cells have no available approximation. Change the source or target display filter.');
 const unique=new Map();for(const t of selected){const m=t.status.approximation.m;unique.set(m.join(','),[...m]);}
 return [...unique.values()];
}
function reciprocalLabel(label){return `1/${label.split(':').reverse().join(':')}`;}
export function selectedDiamondChord(cells,ids){
 const chosen=new Set(ids),selected=cells.filter(t=>chosen.has(t.id)),tones=new Map();
 for(const t of selected){const ratio=`${t.n}/${t.d}`;if(!tones.has(ratio))tones.set(ratio,[]);tones.get(ratio).push(t);}
 if(tones.size<2)return null;
 const hasCommonAxis=axis=>[...new Set(selected.map(t=>t[axis]))].some(index=>[...tones.values()].every(group=>group.some(t=>t[axis]===index)));
 const otonalLine=hasCommonAxis('j'),utonalLine=hasCommonAxis('i');
 const form=otonalLine&&!utonalLine?'otonal':utonalLine&&!otonalLine?'utonal':'paired';
 if(tones.size>8)return {kind:'collection',form,cardinality:tones.size};
 const ratios=[...tones.keys()],identity=chordIdentity(ratios.join(':'));
 const otonal=identity.aliases.otonal;
 const utonal=form==='utonal'
  ?reciprocalLabel(chordIdentity(ratios.map(r=>{const [n,d]=r.split('/');return `${d}/${n}`;}).join(':')).aliases.otonal)
  :reciprocalLabel(otonal);
 return {kind:'chord',form,cardinality:identity.cardinality,otonal,utonal};
}
// Find a generated scale containing the exact generator coordinates. Period
// lifts are retained by the chord inspector, including divided/non-octave periods.
export function fitDiamondChord(s,coords){
 if(coords.length<2||coords.length>8)throw Error('Choose 2–8 distinct notes for the chord view.');
 const ks=coords.map(m=>m[1]);if(new Set(ks).size!==ks.length)throw Error('The chord view needs distinct scale degrees; collect this register voicing instead.');
 const fits=state=>{const a=scale(state);return !a.collision&&ks.every(k=>a.notes.some(n=>n.k===k));};
 if(fits(s))return s;
 const n=Math.max(2,Math.max(0,...ks)-Math.min(0,...ks)+1);
 if(n<=256)for(let mode=0;mode<n;mode++){const candidate={...s,n,mode};if(fits(candidate))return candidate;}
 throw Error('These notes do not fit a collision-free generated scale within 256 notes. They can still be collected.');
}
