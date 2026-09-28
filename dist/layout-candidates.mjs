import {baseOptions,baseSteps,buildBoard} from './hexboard.mjs';
import {melodicBaseScore} from './layout-direction.mjs';
import {BoundedCache} from './cache.mjs';
const cache=new BoundedCache(4);
export const layoutFields=['base','offset','style','rotation','mirror','flipHorizontal','flipVertical','center','register','deviceRotation','outside','ap','ag','bp','bg','periodWrapping','periodPlacement','copyPeriodStep','registerAlignment'];
export const layoutConfig=cfg=>Object.fromEntries(layoutFields.map(k=>[k,cfg[k]]));
export const layoutKey=cfg=>JSON.stringify(layoutConfig(cfg));
export function generateLayoutCandidates(s,cfg){
 const key=JSON.stringify([s.basis,s.rows,s.p,s.g,s.n,s.mode,layoutConfig(cfg)]);return cache.get(key,()=>{
 const candidates=[],seen=new Set();
 function add(config){try{const board=buildBoard(s,config);if(board.wrapping?.overlaps.length)return;const id=JSON.stringify([config.base,config.offset,config.deviceRotation,board.keys.map(k=>[k.enabled,k.m])]);if(seen.has(id))return;seen.add(id);candidates.push({id:layoutKey(config),config:layoutConfig(config),board});}catch{/* Unsupported bases and collisions are not layout candidates. */}}
 add(cfg);
 const bases=baseOptions(s).filter(v=>{try{baseSteps(s,v.n);return true;}catch{return false;}}).sort((a,b)=>Number(b.n===cfg.base)-Number(a.n===cfg.base)||Number(b.n>=5&&b.n<=9)-Number(a.n>=5&&a.n<=9)||melodicBaseScore(baseSteps(s,b.n)).score-melodicBaseScore(baseSteps(s,a.n)).score||Math.abs(a.n-7)-Math.abs(b.n-7)).slice(0,5);
 // Bounded dihedral variations of canonical unimodular layout families.
 for(const base of bases)for(const style of ['bosanquet','compressed'])for(let rotation=0;rotation<6;rotation++)for(const flipVertical of [false,true])add({...cfg,base:base.n,offset:0,style,rotation,mirror:false,flipHorizontal:false,flipVertical,periodPlacement:null});
 for(let rotation=0;rotation<6;rotation++)for(const flipVertical of [false,true])add({...cfg,style:'period',rotation,mirror:false,flipHorizontal:false,flipVertical,periodPlacement:null});
 return candidates;});
}
