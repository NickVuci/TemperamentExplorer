import {scale,mod} from './engine.mjs';

import {octavePeriods} from './pitch.mjs';
export {octavePeriods} from './pitch.mjs';
export function matrixScale(s){
  const periods=s.matrixOctave===true?octavePeriods(s):1;
  const base=scale(s).notes;
  return {periods,n:s.n*periods,p:s.p*periods,
    notes:Array.from({length:s.n*periods},(_,i)=>({...base[i%s.n],c:base[i%s.n].c+Math.floor(i/s.n)*s.p}))};
}
export function matrixInterval(m,i,j,layout='distance'){
  if(layout==='distance'&&j===m.n)return {c:m.p,k:0,end:i,period:true};
  const end=layout==='distance'?(i+j)%m.n:j;
  return {c:mod(m.notes[end].c-m.notes[i].c,m.p),k:m.notes[end].k-m.notes[i].k,end};
}
export function matrixWindow(m,ascending,rowPage=0,colPage=0){
  const columns=m.n+(ascending?1:0),size=m.n>96?48:columns;
  const rows=m.n>96?24:m.n;
  const rp=Math.max(0,Math.min(Math.floor(rowPage)||0,Math.ceil(m.n/rows)-1));
  const cp=Math.max(0,Math.min(Math.floor(colPage)||0,Math.ceil(columns/size)-1));
  return {rowStart:rp*rows,rowEnd:Math.min(m.n,(rp+1)*rows),colStart:cp*size,colEnd:Math.min(columns,(cp+1)*size),rowPage:rp,colPage:cp,rowPages:Math.ceil(m.n/rows),colPages:Math.ceil(columns/size)};
}
