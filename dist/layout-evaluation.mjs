import {baseSteps} from './hexboard.mjs';
import {chromaticDirection,melodicBaseScore} from './layout-direction.mjs';
import {hexDistance,chordPlacements} from './hexboard-chords.mjs';
import {placeRealization} from './chord-realization-v2.mjs';
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
const clamp=x=>Math.max(0,Math.min(1,x));
const geometryCache=new WeakMap();
const vector=(a,b)=>[(b.x-a.x+b.y-a.y)/2,a.y-b.y];
function patternScore(vectors){const counts=new Map();for(const v of vectors){const k=v.join(',');counts.set(k,(counts.get(k)||0)+1);}return vectors.length?[...counts.values()].sort((a,b)=>b-a).slice(0,2).reduce((a,b)=>a+b,0)/vectors.length:0;}
export function evaluateScale(s,board,cfg={}){
 const cached=geometryCache.get(board);if(cached)return cached;
 const keys=board.keys.filter(k=>k.enabled&&k.degree>=0),byDegree=Array.from({length:s.n},()=>[]);for(const k of keys)byDegree[k.degree]?.push(k);
 const steps=[],vectors=[];
 for(let d=0;d<s.n;d++){
  let best=null;const step=board.target.steps[d];
  for(const a of byDegree[d])for(const b of byDegree[(d+1)%s.n])if(Math.abs(b.c-a.c-step)<1e-6){const distance=hexDistance(a,b);if(!best||distance<best.distance)best={distance,v:vector(a,b)};}
  if(best){steps.push(best.distance);vectors.push(best.v);}
 }
 const continuity=steps.length/s.n,meanStep=mean(steps),repetition=patternScore(vectors);
 const melodic=clamp(continuity*(.75/(meanStep||Infinity)+.25*repetition));
 let base;try{base=baseSteps(s,cfg.base);}catch{}const baseQuality=melodicBaseScore(base);
 let horizontal=[],upward=[];const angle=(cfg.deviceRotation||0)*Math.PI/2;
 for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++){
  let a=keys[i],b=keys[j];if(hexDistance(a,b)!==1)continue;
  let v=vector(a,b);if(v[0]<0||v[0]===0&&v[1]<0){[a,b]=[b,a];v=v.map(x=>-x);}
  const dx=(b.x-a.x)/2,dy=(b.y-a.y)*Math.sqrt(3)/2,screenX=dx*Math.cos(angle)-dy*Math.sin(angle),screenY=dx*Math.sin(angle)+dy*Math.cos(angle),dc=b.c-a.c;
  if(Math.abs(screenX)>.1)horizontal.push(Math.sign(screenX)*Math.sign(dc));if(Math.abs(screenY)>.1)upward.push(-Math.sign(screenY)*Math.sign(dc));
 }
 const chromatic=chromaticDirection(s,board,cfg.deviceRotation||0),direction=chromatic.score,axis=chromatic.axis;
 const consistency=xs=>xs.length?Math.max(xs.filter(v=>v>0).length,xs.filter(v=>v<0).length)/xs.length:0;
 const pitch=mean([horizontal,upward].map(xs=>.65*consistency(xs)+.35*(xs.length?xs.filter(v=>v>0).length/xs.length:0))),coverage=byDegree.filter(xs=>xs.length).length/s.n;
 const reachability=coverage*mean(byDegree.map(xs=>Math.min(1,xs.length/3)));
 const result={melodic,baseMos:baseQuality.score,baseQuality,chromatic,direction,pitch,reachability,scaleCoverage:coverage,continuity,meanStep,repetition,axis,horizontal:mean(horizontal)>=0?'rises right':'falls right',vertical:mean(upward)>=0?'rises upward':'falls upward'};geometryCache.set(board,result);return result;
}
export function evaluateChord(s,board,target,near=65){
 const coords=target.coords,keys=board.keys.filter(k=>k.enabled);
 // Tone identity modulo the actual period: generator coordinates, never cent aliases.
 const shifts=target.exact?[0]:[...new Set(keys.map(k=>k.m[1]-coords[0][1]))];
 const represented=Math.max(0,...shifts.map(shift=>coords.filter(m=>keys.some(k=>k.m[1]===m[1]+shift)).length));
 const realizationFit=target.realization?placeRealization(s,target.realization,board,near):null;
 const variants=target.variants||[coords],sets=realizationFit?[realizationFit.placements]:variants.map(v=>chordPlacements(board,v,near,{exact:target.exact,periodCopies:target.periodCopies}));
 const limited=realizationFit?.limited||sets.some(p=>p.limited),unique=new Map();
 for(const p of sets.flat()){const key=[...p.keys].sort((a,b)=>a-b).join(',');if(!unique.has(key))unique.set(key,p);}
 let placements=[...unique.values()];
 placements=placements.map(p=>{const ks=p.keys.map(i=>board.keys[i]);return {...p,totalDistance:ks.reduce((sum,a,i)=>sum+ks.slice(i+1).reduce((n,b)=>n+hexDistance(a,b),0),0)};}).sort((a,b)=>a.reach-b.reach||a.totalDistance-b.totalDistance||Math.abs(a.periodShift||0)-Math.abs(b.periodShift||0));
 const easyOccurrences=placements.filter(p=>p.reach<=4).length;
 const best=placements[0]||null,coverage=represented/coords.length,complete=!!best;
 return {label:target.label,kind:target.kind||'selected',voicingCount:target.variants?.length??target.realization?.variants?.length??null,represented,required:coords.length,coverage,complete,occurrences:placements.length,easyOccurrences,limited,best,diameter:best?.reach??null,totalDistance:best?.totalDistance??null,compactness:best?.6/Math.max(1,best.reach)+.4*Math.min(1,Math.log1p(easyOccurrences)/Math.log(33)):0,harmony:.35*coverage+.65*Number(complete)};
}
export function evaluateLayout(s,candidate,targets=[]){const scale=evaluateScale(s,candidate.board,candidate.config),chords=targets.map(t=>evaluateChord(s,candidate.board,t,candidate.config.center)),groups=[chords.filter(c=>c.kind==='selected'),chords.filter(c=>c.kind==='catalogue')].filter(g=>g.length),chordScore=metric=>mean(groups.map(g=>mean(g.map(c=>c[metric]))));return {...candidate,metrics:{melodic:scale.melodic,baseMos:scale.baseMos,harmony:chordScore('harmony'),compactness:chordScore('compactness'),direction:scale.direction,pitch:scale.pitch,reachability:scale.reachability},scale,chords};}
