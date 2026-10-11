// Display-only suggestions from the chart's canonical matching keys.
import {hexDistance} from './hexboard-chords.mjs';

const BEAM_WIDTH=64;
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
const identity=(t,match)=>match==='degree'&&t.degree!==null&&t.degree!==undefined?`d${t.degree}`:`c${t.coordinate.join(',')}`;
const compare=(a,b)=>{
 for(let i=0;i<a.score.length;i++)if(a.score[i]!==b.score[i])return a.score[i]-b.score[i];
 for(let i=0;i<a.keys.length;i++)if(a.keys[i].index!==b.keys[i].index)return a.keys[i].index-b.keys[i].index;
 return 0;
};

/** One suggestion per matching pitch at each cue; every matching key still counts. */
export function suggestedRoute(targets,board,{center=65,match='exact',played=new Map()}={}){
 const route=new Map();
 if(!board?.keys?.length)return route;
 const valid=k=>k&&k.enabled&&!k.command&&Number.isFinite(k.x)&&Number.isFinite(k.y);
 const home=board.keys[center]??board.keys.find(valid);
 if(!home)return route;
 const byTick=new Map(),shapes=new Map();
 for(const t of targets){if(!byTick.has(t.tick))byTick.set(t.tick,[]);byTick.get(t.tick).push(t);}
 let previous=home,melody=[];
 const options=t=>{
  const ids=match==='degree'&&t.degree!==null&&t.degree!==undefined?t.degreeKeys:t.keys;
  const keys=[...new Set(ids??[])].map(i=>board.keys[i]).filter(valid).sort((a,b)=>a.index-b.index);
  let preferred=null,order=-Infinity;
  for(const key of keys)if(played.has(key.index)&&played.get(key.index)>order){preferred=key;order=played.get(key.index);}
  return preferred?[preferred]:keys;
 };
 const score=keys=>{
  let bends=0,reach=0,travel=hexDistance(previous,keys[0]),central=0;
  for(let i=0;i<keys.length;i++){
   central+=hexDistance(home,keys[i]);
   if(i)travel+=hexDistance(keys[i-1],keys[i]);
   if(i>1&&cross(keys[i-2],keys[i-1],keys[i])!==0)bends++;
   for(let j=0;j<i;j++)reach=Math.max(reach,hexDistance(keys[j],keys[i]));
  }
  return {keys,score:[bends,reach,travel,central]};
 };
 const search=choices=>{
  let beam=[{keys:[],score:[]}];
  for(const list of choices){
   const next=[];
   for(const partial of beam)for(const key of list)next.push(score([...partial.keys,key]));
   next.sort(compare);beam=next.slice(0,BEAM_WIDTH);
  }
  return beam[0];
 };
 for(const [,group] of [...byTick].sort((a,b)=>a[0]-b[0])){
  const pitches=new Map();
  for(const t of [...group].sort((a,b)=>a.cents-b.cents||a.index-b.index)){
   const id=identity(t,match);
   if(!pitches.has(id))pitches.set(id,{targets:[],choices:options(t)});
   pitches.get(id).targets.push(t);
  }
  const notes=[...pitches.values()].filter(n=>n.choices.length),choices=notes.map(n=>n.choices);
  if(!notes.length)continue;
  let best;
  if(notes.length===1){
   best=choices[0].map(key=>({keys:[key],score:[melody.length===2&&cross(melody[0],melody[1],key)!==0?1:0,hexDistance(previous,key),hexDistance(home,key)]})).sort(compare)[0];
  }else{
   const shape=JSON.stringify([previous.index,choices.map(list=>list.map(k=>k.index))]);
   best=shapes.get(shape);
   if(!best){
   // Seed every line through the first two pitches before bounded shape search.
   // A complete straight fingering survives even when its first pair is distant.
   const lines=new Set();
   for(const a of choices[0])for(const b of choices[1]){
    const dx=b.x-a.x,dy=b.y-a.y;
    if(!dx&&!dy)continue;
    const divisor=dy||dx,line=[dy/divisor,-dx/divisor,(dx*a.y-dy*a.x)/divisor].join(',');
    if(lines.has(line))continue;lines.add(line);
    const onLine=choices.map(list=>list.filter(k=>cross(a,b,k)===0));
    if(onLine.some(list=>!list.length))continue;
    const candidate=search(onLine);
    if(!best||compare(candidate,best)<0)best=candidate;
   }
   if(!best)best=search(choices);
   shapes.set(shape,best);
   }
  }
  best.keys.forEach((key,i)=>{for(const t of notes[i].targets)route.set(t.index,key.index);});
  previous=best.keys[0];
  if(notes.length===1){
   if(!melody.length||melody.at(-1).index!==previous.index)melody=[...melody,previous].slice(-2);
  }else melody=[];
 }
 return route;
}
