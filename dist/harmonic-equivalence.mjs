import {immutable} from './cache.mjs';
import {mapMonzo} from './ji-monzo.mjs';
import {mappingContext} from './harmonic-context.mjs';
import {compareExactRatios} from './chord-identity-v2.mjs';
import {div,rational} from './rational.mjs';

const VERSION=1;
const MAX_SAFE=BigInt(Number.MAX_SAFE_INTEGER);

function safeInteger(value,name){
 if(!Number.isSafeInteger(value))throw Error(`${name} must be a safe integer.`);
 return BigInt(value);
}
function safeNumber(value,name){
 if(value>MAX_SAFE||value< -MAX_SAFE)throw Error(`${name} exceeds the safe integer range.`);
 return Number(value);
}
function pair(coordinate){
 if(!Array.isArray(coordinate)||coordinate.length!==2)throw Error('Use an integer [period, generator] coordinate.');
 return coordinate.map((value,index)=>safeInteger(value,`Coordinate ${index}`));
}
function bezout(a,b){
 let oldR=BigInt(a),r=BigInt(b),oldU=1n,u=0n,oldV=0n,v=1n;
 while(r!==0n){
  const q=oldR/r;
  [oldR,r]=[r,oldR-q*r];
  [oldU,u]=[u,oldU-q*u];
  [oldV,v]=[v,oldV-q*v];
 }
 if(oldR<0n)return {g:-oldR,u:-oldU,v:-oldV};
 return {g:oldR,u:oldU,v:oldV};
}
const mod=(value,period)=>((value%period)+period)%period;

/** Exact, period, or mapped-octave coordinate equivalence for one mapping. */
export function equivalencePolicy(stateOrContext,kind='exact'){
 const context=mappingContext(stateOrContext);
 if(!['exact','period','octave'].includes(kind))throw Error('Choose exact, period, or octave equivalence.');
 let vector=null;
 if(kind==='period')vector=[1,0];
 if(kind==='octave'){
  const index=context.basis.indexOf(2);
  if(index<0)throw Error('Octave equivalence requires prime 2 in the mapping subgroup.');
  const monzo=context.basis.map((_,i)=>Number(i===index));
  vector=mapMonzo(context.rows,monzo);
  if(vector[0]===0&&vector[1]===0)throw Error('A zero mapped octave cannot define octave equivalence.');
 }
 const {g,u,v}=vector?bezout(...vector):{g:null,u:1n,v:0n};
 const [a,b]=vector??[0,0];
 const transform=vector?[[u,v],[-BigInt(b)/g,BigInt(a)/g]]:[[1n,0n],[0n,1n]];
 const inverse=vector?[[BigInt(a)/g,-v],[BigInt(b)/g,u]]:[[1n,0n],[0n,1n]];
 const asNumbers=(matrix)=>matrix.map(row=>row.map(value=>safeNumber(value,'Quotient transform')));
 const id=`equivalence-v${VERSION}:${JSON.stringify([context.id,kind,vector])}`;
 return immutable({schemaVersion:VERSION,id,mappingKey:context.id,kind,vector,
  modulus:g===null?null:safeNumber(g,'Quotient modulus'),
  transform:asNumbers(transform),inverse:asNumbers(inverse)});
}

/**
 * Return a canonical representative and the exact removed multiple of the
 * policy vector. The original equals `representative + removed` coordinatewise.
 */
export function quotientCoordinate(policy,coordinate){
 if(policy?.schemaVersion!==VERSION||!['exact','period','octave'].includes(policy.kind))throw Error('Use a valid coordinate equivalence policy.');
 const x=pair(coordinate);
 if(policy.kind==='exact')return immutable({classCoordinate:coordinate.slice(),key:JSON.stringify(coordinate),
  representative:coordinate.slice(),lift:0,removed:[0,0]});
 const [[u,v],[w,z]]=policy.transform.map(row=>row.map(BigInt));
 const [[i,j],[k,l]]=policy.inverse.map(row=>row.map(BigInt));
 const h=BigInt(policy.modulus),y0=u*x[0]+v*x[1],y1=w*x[0]+z*x[1];
 const residue=mod(y0,h),lift=(y0-residue)/h;
 const representative=[i*residue+j*y1,k*residue+l*y1];
 const classCoordinate=[safeNumber(residue,'Quotient residue'),safeNumber(y1,'Quotient class')];
 const removed=x.map((value,index)=>safeNumber(value-representative[index],'Removed lift'));
 return immutable({classCoordinate,key:JSON.stringify(classCoordinate),
  representative:representative.map(value=>safeNumber(value,'Quotient representative')),
  lift:safeNumber(lift,'Quotient lift'),removed});
}

const compareTuple=(a,b)=>a[0]-b[0]||a[1]-b[1];

/** Canonical set key modulo common translation, permutation, and the policy. */
export function shapeKey(policy,coordinates){
 if(!Array.isArray(coordinates)||coordinates.length===0)throw Error('A shape needs at least one coordinate.');
 const points=coordinates.map(point=>pair(point));
 const candidates=points.map(anchor=>{
  const classes=points.map(point=>{
   const difference=point.map((value,index)=>safeNumber(value-anchor[index],'Shape displacement'));
   return quotientCoordinate(policy,difference).classCoordinate;
  });
  const distinct=[...new Map(classes.map(value=>[JSON.stringify(value),value])).values()];
  return JSON.stringify(distinct.sort(compareTuple));
 });
 const best=candidates.sort()[0];
 return `shape-v${VERSION}:${JSON.stringify([policy.id,best])}`;
}

const ratioLabel=ratio=>`${ratio[0]}/${ratio[1]}`;
function parseRatioLabel(label){
 const match=/^(\d+)\/(\d+)$/.exec(label);
 if(!match)throw Error('Use a reduced positive ratio label.');
 const ratio=rational(BigInt(match[1]),BigInt(match[2]));
 if(ratio[0]<=0n||ratio[1]<=0n)throw Error('JI family ratios must be positive.');
 return ratio;
}
function familyPolicy(policy){
 const kind=typeof policy==='string'?policy:policy?.kind;
 if(kind!=='exact'&&kind!=='octave')throw Error('Choose an explicit exact or octave JI family policy.');
 return kind;
}
function octaveRepresentative(value){
 let [n,d]=value,lift=0;
 while(n<d){n*=2n;lift--;}
 while(n>=2n*d){d*=2n;lift++;}
 return {ratio:rational(n,d),octaveLift:lift};
}
function relativeClass(value,kind){
 return kind==='octave'?octaveRepresentative(value):{ratio:value,octaveLift:0};
}
function uniqueSortedRatios(ratios){
 return [...new Map(ratios.map(ratio=>[ratioLabel(ratio),ratio])).values()].sort(compareExactRatios);
}
function familyFromRatios(ratios,kind){
 const unique=uniqueSortedRatios(ratios);
 if(!unique.length)throw Error('A JI family needs at least one ratio.');
 let best=null;
 for(const [anchorIndex,anchor]of (kind==='exact'?unique.slice(0,1):unique).entries()){
  const classes=uniqueSortedRatios(unique.map(ratio=>relativeClass(div(ratio,anchor),kind).ratio));
  const familyRatios=classes.map(ratioLabel),serialization=JSON.stringify(familyRatios);
  if(best===null||serialization<best.serialization)best={anchor,anchorIndex,familyRatios,serialization};
 }
 return {...best,familyId:`ji-family-v${VERSION}:${JSON.stringify([kind,best.serialization])}`};
}
function invertedFamily(source,kind){
 const inverted=source.familyRatios.map(label=>{
  const [n,d]=parseRatioLabel(label);return [d,n];
 });
 return familyFromRatios(inverted,kind);
}

/**
 * Link an existing exact `ji2:` chord to an explicitly chosen JI family.
 * Member records retain source order, exact spelling, doublings and the octave
 * lifts needed to reconstruct every original normalized ratio.
 */
export function harmonicIdentity(exactIdentity,policy){
 const kind=familyPolicy(policy);
 if(exactIdentity?.version!==2||!Array.isArray(exactIdentity.canonicalRatios)||!Array.isArray(exactIdentity.orderedRatios)||typeof exactIdentity.fingerprint!=='string')throw Error('Use a chordIdentity record.');
 const canonical=exactIdentity.canonicalRatios.map(ratio=>rational(BigInt(ratio.n),BigInt(ratio.d)));
 const family=familyFromRatios(canonical,kind),anchorLabel=ratioLabel(family.anchor);
 const familyIndices=new Map(family.familyRatios.map((label,index)=>[label,index]));
 const exactIndices=new Map(exactIdentity.canonicalRatios.map((ratio,index)=>[ratio.label,index]));
 const members=exactIdentity.orderedRatios.map((label,inputIndex)=>{
  const relative=relativeClass(div(parseRatioLabel(label),family.anchor),kind);
  const familyIndex=familyIndices.get(ratioLabel(relative.ratio));
  if(familyIndex===undefined||!exactIndices.has(label))throw Error('Exact chord members do not match their canonical ratios.');
  return {inputIndex,exactIndex:exactIndices.get(label),exactRatio:label,familyIndex,octaveLift:relative.octaveLift};
 });
 return immutable({schemaVersion:VERSION,policy:kind,exactId:exactIdentity.fingerprint,
  familyId:family.familyId,dualFamilyId:invertedFamily(family,kind).familyId,
  anchorExactIndex:family.anchorIndex,anchorExactRatio:anchorLabel,
  familyRatios:family.familyRatios,members,
  exactCardinality:exactIdentity.cardinality,inputCardinality:exactIdentity.inputCardinality,
  doublings:exactIdentity.repeatedMembers,classCardinality:family.familyRatios.length});
}

/** Return the reciprocal family link; applying it twice restores the family. */
export function dualIdentity(source,policy=source?.policy){
 const kind=familyPolicy(policy);
 const family=Array.isArray(source?.familyRatios)?source:harmonicIdentity(source,kind);
 if(family.policy!==kind)throw Error('A dual must use the same JI family policy.');
 const dual=invertedFamily(family,kind);
 return immutable({schemaVersion:VERSION,policy:kind,familyId:dual.familyId,
  familyRatios:dual.familyRatios,dualFamilyId:family.familyId});
}
