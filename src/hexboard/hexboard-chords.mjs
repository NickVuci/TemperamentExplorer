import {DEFAULT_ODD_LIMIT,scale} from '../core/engine.mjs';
import {validateJILimits} from '../core/ji-limit-engine.mjs';
import {enumerateCoordinateChords,createCoordinateInspector} from '../harmonic/harmonic-inspection.mjs';
import {MAX_CHORD_TONES} from '../chords/chord-identity.mjs';
import {approximationSpan,noteCoordinate,sameCoordinate} from '../core/pitch.mjs';
import {physicalDistance} from '../shapes/geometric-shapes.mjs';
export function hexDistance(a,b){const x=(b.x-a.x+b.y-a.y)/2,y=a.y-b.y;return Math.max(Math.abs(x),Math.abs(y),Math.abs(x+y));}
export function chordCoordinates(s,degrees,octaves={}){const ns=scale(s).notes;return degrees.map(i=>{const n=ns[i];if(!n)throw Error('A chord degree is absent from this scale.');const m=noteCoordinate(s,n);return [m[0]+(octaves[i]||0),m[1]];});}

/** One physical-key/coordinate index for fixed voicings and bounded shape searches. */
export function createBoardPlacementIndex(board,{eligible=key=>key.enabled&&!key.command}={}){
 if(!Array.isArray(board?.keys))throw Error('Use a built HexBoard.');
 const keys=board.keys.filter(eligible),byIndex=new Map(board.keys.map(key=>[key.index,key])),byCoordinate=new Map(),distances=new Map();
 for(const key of keys){const id=key.m.join(',');if(!byCoordinate.has(id))byCoordinate.set(id,[]);byCoordinate.get(id).push(key);}
 const distance=(a,b)=>{
  a=typeof a==='number'?byIndex.get(a):a;b=typeof b==='number'?byIndex.get(b):b;
  const id=a.index<b.index?`${a.index},${b.index}`:`${b.index},${a.index}`;
  if(!distances.has(id))distances.set(id,{reach:hexDistance(a,b),span:physicalDistance(a,b)});
  return distances.get(id);
 };
 return {board,keys,byIndex,byCoordinate,distance};
}

/**
 * Enumerate one choice per domain. A choice is a board key or {key, ...certificate}.
 * Search events are placements or bounded-work checkpoints; the return value is a
 * completeness certificate. Sharing `budget` makes multiple roots one bounded job.
 */
export function* iteratePlacementAssignments(index,domains,{span=0,reach=0,distinctCoordinates=false,distinctKeys=true,
 maxNodes=Infinity,maxPlacements=Infinity,signal,shouldCancel,checkpointEvery=256,preserveOrder=false,
 budget={visited:0,placements:0}}={}){
 if(!Array.isArray(domains)||domains.some(domain=>!Array.isArray(domain)))throw Error('Placement domains must be arrays.');
 if(!Number.isFinite(span)||span<0||!Number.isFinite(reach)||reach<0||
  !(maxNodes===Infinity||Number.isSafeInteger(maxNodes)&&maxNodes>=0)||!(maxPlacements===Infinity||Number.isSafeInteger(maxPlacements)&&maxPlacements>=0)||
  !Number.isSafeInteger(checkpointEvery)||checkpointEvery<1)throw Error('Invalid placement search bounds.');
 const asKey=choice=>{const key=choice?.key??choice;return typeof key==='number'?index.byIndex.get(key):key;};
 const order=domains.map((_,i)=>i);if(!preserveOrder)order.sort((a,b)=>domains[a].length-domains[b].length||a-b);
 const chosen=Array(domains.length),chosenKeys=Array(domains.length),usedKeys=new Set(),usedCoordinates=new Set();
 let reason=null;
 const cancelled=()=>signal?.aborted||shouldCancel?.();
 function* visit(depth,currentReach,currentSpan){
  if(cancelled()){reason='cancelled';return;}
  if(depth===order.length){
   if(budget.placements>=maxPlacements){reason='max-placements';return;}
   budget.placements++;
   yield {type:'placement',keys:chosenKeys.map(key=>key.index),choices:[...chosen],reach:currentReach,span:currentSpan};return;
  }
  const slot=order[depth];
  for(const choice of domains[slot]){
   if(cancelled()){reason='cancelled';return;}
   if(budget.visited>=maxNodes){reason='max-nodes';return;}
   budget.visited++;
   if(budget.visited%checkpointEvery===0)yield {type:'search-checkpoint',visited:budget.visited,placements:budget.placements};
   const key=asKey(choice);if(!key||!key.enabled||key.command)continue;
   const coordinate=key.m.join(',');
   if(distinctKeys&&usedKeys.has(key.index)||distinctCoordinates&&usedCoordinates.has(coordinate))continue;
   let nextReach=currentReach,nextSpan=currentSpan,valid=true;
   for(let i=0;i<depth;i++){
    const distance=index.distance(key,chosenKeys[order[i]]);
    nextReach=Math.max(nextReach,distance.reach);nextSpan=Math.max(nextSpan,distance.span);
    if(reach&&nextReach>reach||span&&nextSpan>span+1e-10){valid=false;break;}
   }
   if(!valid)continue;
   chosen[slot]=choice;chosenKeys[slot]=key;usedKeys.add(key.index);usedCoordinates.add(coordinate);
   yield* visit(depth+1,nextReach,nextSpan);
   usedKeys.delete(key.index);usedCoordinates.delete(coordinate);
   if(reason)return;
  }
 }
 if(domains.length&&domains.every(domain=>domain.length))yield* visit(0,0,0);
 else if(cancelled())reason='cancelled';
 return {complete:reason===null,limited:reason!==null&&reason!=='cancelled',cancelled:reason==='cancelled',reason,visited:budget.visited,placements:budget.placements};
}

export function chordPlacements(board,coordinates,near=65,{exact=false,periodCopies=false}={}){
 if(coordinates.length<2||coordinates.length>MAX_CHORD_TONES||coordinates.some(m=>!Array.isArray(m)||m.length!==2||!m.every(Number.isInteger)))throw Error('Choose two to eight chord notes.');
 const deltas=coordinates.map(m=>m.map((v,i)=>v-coordinates[0][i]));
 if(new Set(deltas.map(m=>m.join(','))).size!==deltas.length)throw Error('Choose distinct chord notes.');
 const index=createBoardPlacementIndex(board),keys=index.keys,byCoord=index.byCoordinate;
 const result=[],distance=k=>hexDistance(k,board.keys[near]),budget={visited:0,placements:0};let limited=false;
 for(const root of keys.toSorted((a,b)=>distance(a)-distance(b)||a.index-b.index).filter(root=>!exact||(periodCopies?root.m[1]===coordinates[0][1]:sameCoordinate(root.m,coordinates[0])))){
  const choices=deltas.map((d,i)=>i?[...(byCoord.get(d.map((v,j)=>v+root.m[j]).join(','))||[])]:[root]);
  if(choices.some(c=>!c.length))continue;
  for(const group of choices)group.sort((a,b)=>hexDistance(root,a)-hexDistance(root,b)||a.index-b.index);
  const iterator=iteratePlacementAssignments(index,choices,{preserveOrder:true,maxPlacements:20000,budget});let step;
  while(!(step=iterator.next()).done)if(step.value.type==='placement')result.push({keys:step.value.keys,reach:step.value.reach,...(exact?{periodShift:root.m[0]-coordinates[0][0]}:{})});
  limited=step.value.limited;if(limited)break;
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
