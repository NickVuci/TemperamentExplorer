import {DEFAULT_ODD_LIMIT,scale} from './engine.mjs';
import {validateJILimits} from './ji-limit-engine.mjs';
import {enumerateCoordinateChords,createCoordinateInspector} from './harmonic-inspection.mjs';
import {MAX_CHORD_TONES} from './chord-identity-v2.mjs';
import {approximationSpan,noteCoordinate,sameCoordinate} from './pitch.mjs';
export function hexDistance(a,b){const x=(b.x-a.x+b.y-a.y)/2,y=a.y-b.y;return Math.max(Math.abs(x),Math.abs(y),Math.abs(x+y));}
export function chordCoordinates(s,degrees,octaves={}){const ns=scale(s).notes;return degrees.map(i=>{const n=ns[i];if(!n)throw Error('A chord degree is absent from this scale.');const m=noteCoordinate(s,n);return [m[0]+(octaves[i]||0),m[1]];});}
export function chordPlacements(board,coordinates,near=65,{exact=false,periodCopies=false}={}){
 if(coordinates.length<2||coordinates.length>MAX_CHORD_TONES||coordinates.some(m=>!Array.isArray(m)||m.length!==2||!m.every(Number.isInteger)))throw Error('Choose two to eight chord notes.');
 const deltas=coordinates.map(m=>m.map((v,i)=>v-coordinates[0][i]));
 if(new Set(deltas.map(m=>m.join(','))).size!==deltas.length)throw Error('Choose distinct chord notes.');
 const keys=board.keys.filter(k=>k.enabled),byCoord=new Map();
 for(const key of keys){const id=key.m.join(',');if(!byCoord.has(id))byCoord.set(id,[]);byCoord.get(id).push(key);}
 const result=[],distance=k=>hexDistance(k,board.keys[near]);let limited=false;
 for(const root of keys.toSorted((a,b)=>distance(a)-distance(b)||a.index-b.index).filter(root=>!exact||(periodCopies?root.m[1]===coordinates[0][1]:sameCoordinate(root.m,coordinates[0])))){
  const choices=deltas.map((d,i)=>i?byCoord.get(d.map((v,j)=>v+root.m[j]).join(','))||[]:[root]);
  if(choices.some(c=>!c.length))continue;
  for(const group of choices)group.sort((a,b)=>hexDistance(root,a)-hexDistance(root,b)||a.index-b.index);
  function visit(notes){
   if(limited)return;
   if(notes.length===choices.length){if(result.length===20000){limited=true;return;}result.push({keys:notes.map(k=>k.index),reach:Math.max(...notes.flatMap(a=>notes.map(b=>hexDistance(a,b)))),...(exact?{periodShift:notes[0].m[0]-coordinates[0][0]}:{})});return;}
   for(const key of choices[notes.length]){visit([...notes,key]);if(limited)break;}
  }
  visit([]);if(limited)break;
 }
 result.sort((a,b)=>distance(board.keys[a.keys[0]])-distance(board.keys[b.keys[0]])||a.keys[0]-b.keys[0]||a.reach-b.reach);
 if(limited)Object.defineProperty(result,'limited',{value:true});
 return result;
}
export function discoverBoardChords(s,board,{size=3,limit=DEFAULT_ODD_LIMIT,primeLimit=null,tolerance=10,other=false,reach=4}={}){
 validateJILimits({oddLimit:limit,primeLimit});
 if(![3,4].includes(size)||!Number.isFinite(tolerance)||tolerance<0||tolerance>100||!Number.isInteger(reach)||reach<1||reach>12)throw Error('Choose a supported chord size, target set, tolerance and reach.');
 const keys=board.keys.filter(k=>k.enabled).sort((a,b)=>a.c-b.c||a.index-b.index).map(k=>({...k,coordinate:k.m})),groups=new Map();
 const groupKey=notes=>{const root=notes[0];return notes.map(k=>k.m.map((v,i)=>v-root.m[i]).join(',')).join(';');};
 const search=enumerateCoordinateChords(s,keys,{size,groupKey,options:{limit,primeLimit,tolerance,other,span:board.wrapping?s.p:approximationSpan(s)},compatible:(a,b)=>hexDistance(a,b)<=reach,onChord:(notes,ps)=>{
  const root=notes[0],shape=notes.map(k=>k.m.map((v,i)=>v-root.m[i])),id=groupKey(notes);
  const max=Math.max(...ps.map(p=>Math.abs(p.error))),mapped=ps.filter(p=>p.identity).length;
  // Pair order follows the shared search: root edges precede inner edges.
  const labels=['1/1',...ps.slice(0,size-1).map(p=>p.label)];
  const g=groups.get(id)||{shape,label:labels.join(' · '),max,mapped,total:ps.length,placements:[]};
  g.placements.push({keys:notes.map(k=>k.index),reach:Math.max(...notes.flatMap(a=>notes.map(b=>hexDistance(a,b))))});groups.set(id,g);
 }});
 const result=[...groups.values()].sort((a,b)=>a.max-b.max||b.mapped-a.mapped||a.placements[0].reach-b.placements[0].reach);
 for(const g of result)g.placements.sort((a,b)=>hexDistance(board.keys[a.keys[0]],board.keys[65])-hexDistance(board.keys[b.keys[0]],board.keys[65]));
 return {groups:result,count:search.count,limited:search.limited,complete:search.complete,bounds:search.bounds,visited:search.visited};
}

/**
 * Every chord shape of `size` notes that includes board key `keyIndex`, with each place on the
 * board it can be played that includes that key. Uses the same pair rules as discoverBoardChords
 * (JI targets within tolerance, pairwise reach), but starts from the key, so the search is small
 * enough to be exhaustive instead of hitting the whole-board result caps.
 */
export function chordsWithKey(s,board,keyIndex,{size=3,reach=6,other=false,limit=DEFAULT_ODD_LIMIT,primeLimit=null,tolerance=10}={}){
 validateJILimits({oddLimit:limit,primeLimit});
 if(![3,4].includes(size)||!Number.isFinite(tolerance)||tolerance<0||tolerance>100||!Number.isInteger(reach)||reach<1||reach>12)throw Error('Choose a supported chord size, tolerance and reach.');
 const target=board.keys[keyIndex];
 if(!target||target.command||!target.enabled)throw Error('Choose an enabled key.');
 const inspector=createCoordinateInspector(s,{limit,primeLimit,tolerance,other,span:board.wrapping?s.p:approximationSpan(s)});
 const byPitch=(a,b)=>a.c-b.c||a.index-b.index,cache=new Map();
 // `lo` is the lower note, as in the board search, so the same interval gets the same answer.
 const pairBest=(lo,hi)=>{
  const delta=hi.m.map((v,i)=>v-lo.m[i]),raw=hi.c-lo.c,id=JSON.stringify([delta,raw]);
  if(!cache.has(id))cache.set(id,inspector.pair(lo.m,hi.m,raw).best);
  return cache.get(id);
 };
 const ordered=(a,b)=>byPitch(a,b)<=0?[a,b]:[b,a];
 const compatible=(a,b)=>hexDistance(a,b)<=reach&&!!pairBest(...ordered(a,b));
 const candidates=board.keys.filter(k=>k.enabled&&!k.command&&k.index!==keyIndex&&compatible(k,target)).sort(byPitch);
 const groups=new Map();
 function record(chosen){
  const notes=[target,...chosen].sort(byPitch),ps=[];
  for(let i=0;i<notes.length;i++)for(let j=i+1;j<notes.length;j++)ps.push(pairBest(notes[i],notes[j]));
  const root=notes[0],shape=notes.map(k=>k.m.map((v,i)=>v-root.m[i])),id=shape.map(m=>m.join(',')).join(';');
  const g=groups.get(id)||{shape,label:['1/1',...ps.slice(0,size-1).map(p=>p.label)].join(' · '),max:Math.max(...ps.map(p=>Math.abs(p.error))),mapped:ps.filter(p=>p.identity).length,total:ps.length,placements:[]};
  g.placements.push({keys:notes.map(k=>k.index),reach:Math.max(...notes.flatMap(a=>notes.map(b=>hexDistance(a,b))))});
  groups.set(id,g);
 }
 function visit(chosen,start){
  if(chosen.length===size-1){record(chosen);return;}
  for(let j=start;j<candidates.length;j++)if(chosen.every(c=>compatible(c,candidates[j])))visit([...chosen,candidates[j]],j+1);
 }
 visit([],0);
 const result=[...groups.values()];
 for(const g of result)g.placements.sort((a,b)=>a.reach-b.reach||a.keys[0]-b.keys[0]||a.keys[1]-b.keys[1]);
 result.sort((a,b)=>a.max-b.max||b.mapped-a.mapped||a.placements[0].reach-b.placements[0].reach||(a.label<b.label?-1:a.label>b.label?1:0));
 return {groups:result,count:result.reduce((n,g)=>n+g.placements.length,0),complete:true};
}
