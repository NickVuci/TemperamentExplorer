import {bigintGcd} from '../core/rational.mjs';
import {isZeroMonzoImage,mapMonzo} from '../core/ji-monzo.mjs';
import {validateState} from '../core/state.mjs';

const SCHEMA_VERSION=1;
const COORDINATE_CONVENTION='period-generator';
const MAX_WITNESS_EXPONENT=1000;

function freezeRecord(value){
 if(Array.isArray(value))return Object.freeze(value.map(freezeRecord));
 if(value&&typeof value==='object'){
  const result={};for(const [key,item]of Object.entries(value))result[key]=freezeRecord(item);
  return Object.freeze(result);
 }
 return value;
}

function validatedMapping(input){
 if(!input||typeof input!=='object')throw Error('A mapping context needs a prime basis and mapping rows.');
 const basis=Array.isArray(input.basis)?[...input.basis]:input.basis;
 const rows=Array.isArray(input.rows)?input.rows.map(row=>Array.isArray(row)?[...row]:row):input.rows;

 // Reuse the state validator for matrix invariants with a derived pure tuning.
 // The caller's tuning, scale, labels and comma strings do not enter the key.
 const q=Array.isArray(rows)&&Array.isArray(rows[0])?rows[0][0]:null;
 const referencePrime=Array.isArray(basis)?basis[0]:null;
 const pure=Number.isInteger(referencePrime)&&referencePrime>1&&Number.isInteger(q)&&q>0
  ?1200*Math.log2(referencePrime)/q:1200;
 const period=Number.isFinite(pure)&&pure>0?pure:1200;
 const state={name:'Harmonic mapping',basis,rows,p:period,g:period/2,n:2,mode:0};
 validateState(state);
 return {basis:[...state.basis],rows:state.rows.map(row=>[...row])};
}

/** Retain working column order while canonicalizing paired columns in the key. */
export function mappingContext(stateOrMapping){
 const {basis,rows}=validatedMapping(stateOrMapping);
 const order=basis.map((prime,index)=>({prime,index})).sort((a,b)=>a.prime-b.prime);
 const canonicalBasis=order.map(column=>column.prime);
 const canonicalRows=rows.map(row=>order.map(column=>row[column.index]));
 const payload=[SCHEMA_VERSION,COORDINATE_CONVENTION,canonicalBasis,canonicalRows];
 const id=`mapping-v${SCHEMA_VERSION}:${JSON.stringify(payload)}`;
 return freezeRecord({schemaVersion:SCHEMA_VERSION,coordinateConvention:COORDINATE_CONVENTION,basis,rows,canonicalBasis,canonicalRows,id});
}

export function mappingKey(stateOrMapping){return mappingContext(stateOrMapping).id;}

function normalizedMonzo(context,monzo,{witness=false}={}){
 if(!Array.isArray(monzo)||monzo.length!==context.basis.length)throw Error('Monzo length must match the mapping basis.');
 return monzo.map((value,index)=>{
  let number;
  if(typeof value==='bigint'){
   if(value>BigInt(Number.MAX_SAFE_INTEGER)||value<BigInt(Number.MIN_SAFE_INTEGER))throw Error(`Monzo coordinate ${index} must be a safe integer.`);
   number=Number(value);
  }else if(Number.isSafeInteger(value))number=value;
  else throw Error(`Monzo coordinate ${index} must be a safe integer or BigInt.`);
  if(witness&&Math.abs(number)>MAX_WITNESS_EXPONENT)throw Error(`Kernel witness exponents must be within ±${MAX_WITNESS_EXPONENT}.`);
  return number;
 });
}

/** Test Mv=0 using the actual integer matrix, in its working basis order. */
export function isKernelVector(stateOrContext,monzo){
 const context=mappingContext(stateOrContext),vector=normalizedMonzo(context,monzo);
 return isZeroMonzoImage(context.rows,vector);
}

function ratioFromMonzo(basis,monzo){
 let numerator=1n,denominator=1n;
 for(let index=0;index<basis.length;index++){
  const exponent=monzo[index];if(exponent===0)continue;
  const factor=BigInt(basis[index])**BigInt(Math.abs(exponent));
  if(exponent>0)numerator*=factor;else denominator*=factor;
 }
 const divisor=bigintGcd(numerator,denominator),n=numerator/divisor,d=denominator/divisor;
 return {numerator:String(n),denominator:String(d),ratio:d===1n?String(n):`${n}/${d}`};
}

/** Return a ratio witness only for a bounded vector in the exact matrix kernel. */
export function validateKernelWitness(stateOrContext,monzo){
 const context=mappingContext(stateOrContext),vector=normalizedMonzo(context,monzo,{witness:true});
 const image=mapMonzo(context.rows,vector),base={mappingKey:context.id,monzo:vector,image};
 if(image.some(coordinate=>coordinate!==0))return freezeRecord({valid:false,reason:'not-in-kernel',...base});
 return freezeRecord({valid:true,...base,...ratioFromMonzo(context.basis,vector)});
}
