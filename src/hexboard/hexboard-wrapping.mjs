// Periodic scale strips on the existing staggered board. This layer does not
// change the temperament mapping, generator, period, or scale calculation.
import {noteCoordinate,coordinateCents} from '../core/pitch.mjs';
import {BoundedCache} from '../core/cache.mjs';

const automaticVectors = new BoundedCache(64);
export function validatePeriodPlacement(vector) {
  if (!vector || !['column','row'].every(k=>Number.isInteger(vector[k])&&Math.abs(vector[k])<=1000))
    throw Error('Period placement needs integer column and row shifts between −1000 and 1000.');
  if (!vector.column && !vector.row) throw Error('Period copies need a non-zero placement vector.');
  return vector;
}

export function validateCopyPeriodStep(step) {
  if(!Number.isInteger(step)||Math.abs(step)>8)throw Error('Copy pitch shift must be an integer from −8 to +8 periods.');
  return step;
}

// Axial columns move horizontally; axial rows follow the down-right stagger.
// In doubled board coordinates, a vector is (2*column + row, row).
export const placementDelta = vector => ({x:2*vector.column+vector.row,y:vector.row});
function latticePosition(m,a,b,root) {
  const d=a[0]*b[1]-a[1]*b[0];
  const across=(m[0]*b[1]-m[1]*b[0])/d,up=(a[0]*m[1]-a[1]*m[0])/d;
  return {x:root.x+2*across+up,y:root.y-up};
}

// A scale-order coordinate counts degrees, not cents: N*P + H*G.
// Derive H from the selected mode, then verify every degree. Some generated
// (e.g. three-step) scales cannot share one linear degree coordinate.
function scaleOrder(template) {
  const n=template.length,t=template.find(t=>t.baseM[1]!==0);
  if(!t)return null;
  const h=(t.degree-n*t.baseM[0])/t.baseM[1];
  return Number.isInteger(h)&&template.every(t=>n*t.baseM[0]+h*t.baseM[1]===t.degree)?h:null;
}
function orderedCopyStep(vector,a,b,n,h) {
  if(h===null)return null;
  const across=vector.column+vector.row,up=-vector.row;
  const p=across*a[0]+up*b[0],g=across*a[1]+up*b[1];
  const degrees=n*p+h*g;
  return degrees%n===0?degrees/n:null;
}

function place(template,physical,vector,native,copyPeriodStep=1) {
  const delta=placementDelta(validatePeriodPlacement(vector));
  const det=native.x*delta.y-native.y*delta.x;
  const claims=physical.map(()=>[]);
  // Solve position = degree + extension*native + copy*delta directly.
  // Both registers range over all integers; there is no arbitrary scan cap.
  for(const key of physical) {
    if(key.command)continue;
    for(const note of template) {
      const x=key.x-note.x,y=key.y-note.y;
      if(det) {
        const extension=(x*delta.y-y*delta.x)/det,copy=(native.x*y-native.y*x)/det;
        if(Number.isInteger(extension)&&Number.isInteger(copy))
          claims[key.index].push({degree:note.degree,copyRegister:copy,extensionRegister:extension});
      } else if(native.x*y===native.y*x) {
        const axis=native.x?'x':'y',extension=(axis==='x'?x:y)/native[axis];
        if(!Number.isInteger(extension))continue;
        claims[key.index].push({degree:note.degree,copyRegister:0,extensionRegister:extension});
        const multiple=delta[axis]/native[axis];
        // Parallel vectors describe the same physical strip. Identical period
        // displacement is harmless only when its pitch agrees with native extension.
        if(multiple!==copyPeriodStep)claims[key.index].push({degree:note.degree,copyRegister:1,extensionRegister:extension-multiple});
      }
    }
  }
  return claims;
}

function autoVector(s,template,physical,a,b,center,native,h=null) {
  const key=JSON.stringify([s.p,s.g,s.n,s.mode,a,b,center,h]);
  return automaticVectors.get(key,()=>{
    const candidates=[];
    const positive=(column,row)=>{
      const pitch=(column+row)*coordinateCents(s,a)-row*coordinateCents(s,b);
      return pitch>1e-7||Math.abs(pitch)<=1e-7&&(column>0||!column&&row<0);
    };
    for(let column=-10;column<=10;column++)for(let row=-13;row<=13;row++)
      if((column||row)&&positive(column,row))candidates.push({column,row});
    // A whole generator window tiles the strips without degree collisions.
    // Its vector can exceed the visible board dimensions (large scales or
    // period/generator axes), so do not restrict Auto to the local search box.
    const window=latticePosition([0,template.length],a,b,{x:0,y:0});
    const shear=Math.round(-(window.x*native.x+window.y*native.y)/(native.x**2+native.y**2));
    for(let q=shear-2;q<=shear+2;q++){
      const x=window.x+q*native.x,y=window.y+q*native.y;
      let column=(x-y)/2,row=y;
      if(!positive(column,row)){column=-column;row=-row;}
      if(Math.abs(column)<=1000&&Math.abs(row)<=1000)candidates.push({column,row});
    }
    // Native continuation alone is a collision-free fallback for unusual axes.
    const fallback={column:(native.x-native.y)/2,row:native.y};
    if(Object.values(fallback).every(v=>Math.abs(v)<=1000))candidates.push(fallback);
    let best;
    for(const vector of candidates) {
      const step=orderedCopyStep(vector,a,b,template.length,h);
      if(h!==null&&step===null)continue;
      const claims=place(template,physical,vector,native,step??1);
      if(claims.some(items=>items.length>1))continue;
      const notes=claims.flat(),coverage=new Set(notes.map(n=>n.degree)).size;
      const maxRegister=Math.max(0,...notes.map(n=>Math.abs(n.copyRegister+n.extensionRegister)));
      const score=[coverage,notes.length,-maxRegister,-(vector.column**2+vector.row**2)];
      if(!best||score.some((v,i)=>v>best.score[i]&&score.slice(0,i).every((x,j)=>x===best.score[j])))
        best={vector,score};
    }
    if(!best)throw Error('No collision-free automatic period placement fits these axes. Try another layout family.');
    return Object.freeze(best.vector);
  });
}

export function wrapBoardKeys(s,cfg,target,baseNotes,physical,a,b,root) {
  const baseGenerators=new Set(baseNotes.map(n=>n.k));
  const template=target.notes.map((note,degree)=>{
    const baseM=noteCoordinate(s,note);
    return {degree,baseM,basePitch:coordinateCents(s,baseM),pc:note.c,
      base:baseGenerators.has(note.k),...latticePosition(baseM,a,b,root)};
  });
  const native=latticePosition([1,0],a,b,{x:0,y:0});
  const align=cfg.registerAlignment!=='manual',h=scaleOrder(template);
  const automatic=autoVector(s,template,physical,a,b,cfg.center,native,align?h:null);
  const vector=cfg.periodPlacement??automatic;
  const orderedStep=orderedCopyStep(vector,a,b,template.length,h);
  const aligned=align&&orderedStep!==null;
  const copyPeriodStep=aligned?orderedStep:validateCopyPeriodStep(cfg.copyPeriodStep??1);
  const alignmentIssue=!align?'':h===null?'This scale has no single linear degree order on these axes. Copy-based registers are in use; inspect the seams or choose a MOS scale.':orderedStep===null?'This placement does not preserve the scale-degree order. Use Reset / Auto for an aligned placement, or choose Manual copy shifts.':'';
  const claims=place(template,physical,vector,native,copyPeriodStep);
  const keys=physical.map((key,i)=>{
    const placements=claims[i],conflict=placements.length>1;
    if(placements.length!==1)return {...key,m:[0,0],c:0,pc:0,degree:-1,inMOS:false,
      base:false,alias:false,enabled:false,wrapped:true,conflict,placements};
    const {degree,copyRegister,extensionRegister}=placements[0],note=template[degree];
    const copyPeriods=copyRegister*copyPeriodStep;
    const register=copyPeriods+extensionRegister+(cfg.register||0);
    // m is the existing two-coordinate sounding identity consumed by chord
    // matching/export; baseM and register preserve the separate layout model.
    return {...key,baseM:[...note.baseM],basePitch:note.basePitch,copyRegister,copyPeriods,extensionRegister,register,
      m:[note.baseM[0]+register,note.baseM[1]],c:note.basePitch+register*s.p,
      pc:note.pc,degree,inMOS:true,base:note.base,alias:false,enabled:!key.command,
      wrapped:true,conflict:false};
  });
  return {keys,wrapping:{vector:{...vector},automatic:{...automatic},copyPeriodStep,aligned,alignmentIssue,
    degreeOrder:h===null?null:{period:template.length,generator:h},
    manual:cfg.periodPlacement!=null,template,native,
    overlaps:keys.filter(k=>k.conflict).map(k=>({button:k.index,placements:k.placements})),
    registers:[...new Set(keys.filter(k=>k.enabled).map(k=>k.copyRegister))].sort((a,b)=>a-b)}};
}
