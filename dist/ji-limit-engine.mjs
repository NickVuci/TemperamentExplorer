import {BoundedCache,immutable} from './cache.mjs';

const isPrime=n=>{if(n<2)return false;for(let d=2;d*d<=n;d++)if(n%d===0)return false;return true;};
export const ODD_LIMIT_VALUES=Object.freeze(Array.from({length:48},(_,i)=>i*2+3));
export const PRIME_LIMIT_VALUES=Object.freeze(Array.from({length:97},(_,i)=>i+2).filter(isPrime));
export const DEFAULT_ODD_LIMIT=15;
export const MANUAL_PRIME_LIMIT_VALUES=Object.freeze(PRIME_LIMIT_VALUES.filter(value=>value>=3&&value<=13));
const oddSet=new Set(ODD_LIMIT_VALUES),primeSet=new Set(PRIME_LIMIT_VALUES);
const diamondCache=new BoundedCache(48),targetCache=new BoundedCache(48);

/** Use prime-limit shorthand only when the basis is the complete prime prefix. */
export function primeFilterForBasis(basis){
 if(!Array.isArray(basis)||basis.length===0||basis.some(value=>!primeSet.has(value)))throw Error('Temperament basis must contain supported primes.');
 const primes=[...new Set(basis)].sort((a,b)=>a-b),highest=primes.at(-1),complete=PRIME_LIMIT_VALUES.filter(value=>value<=highest);
 return primes.length===complete.length&&primes.every((value,index)=>value===complete[index])?highest:primes;
}

/** Compatibility name; a basis can resolve to a prime limit or an explicit subgroup. */
export const primeLimitForBasis=primeFilterForBasis;

export function formatPrimeFilter(primeFilter){
 if(primeFilter==null)return 'No prime limit';
 return Array.isArray(primeFilter)?`${primeFilter.join('.')}-prime subgroup`:`${primeFilter}-prime-limit`;
}

export function validateJILimits({oddLimit=DEFAULT_ODD_LIMIT,primeLimit=null}={}){
 if(!Number.isInteger(oddLimit)||!oddSet.has(oddLimit))throw Error('Odd limit must be an odd number from 3 through 97.');
 if(Array.isArray(primeLimit)){
  if(!primeLimit.length||primeLimit.some(value=>!Number.isInteger(value)||!primeSet.has(value))||new Set(primeLimit).size!==primeLimit.length)throw Error('Prime subgroup must contain distinct primes from 2 through 97.');
  primeLimit=[...primeLimit].sort((a,b)=>a-b);
 }else if(primeLimit!==null&&(!Number.isInteger(primeLimit)||!primeSet.has(primeLimit)))throw Error('Prime limit must be a prime from 2 through 97, an explicit prime subgroup, or unset.');
 return {oddLimit,primeLimit};
}

const asPositiveBigInt=(value,name)=>{
 let out;
 try{out=typeof value==='bigint'?value:Number.isSafeInteger(value)?BigInt(value):0n;}catch{out=0n;}
 if(out<=0n)throw Error(`${name} must be a positive integer.`);
 return out;
};
const gcd=(a,b)=>{while(b)[a,b]=[b,a%b];return a;};

/** Whether a positive ratio satisfies the mandatory odd-limit and optional prime-limit bounds. */
export function ratioWithinJILimits(n,d,{oddLimit=DEFAULT_ODD_LIMIT,primeLimit=null}={}){
 validateJILimits({oddLimit,primeLimit});
 let numerator=asPositiveBigInt(n,'Ratio numerator'),denominator=asPositiveBigInt(d,'Ratio denominator');
 const common=gcd(numerator,denominator);numerator/=common;denominator/=common;
 let oddNumerator=numerator,oddDenominator=denominator;
 while(oddNumerator%2n===0n)oddNumerator/=2n;
 while(oddDenominator%2n===0n)oddDenominator/=2n;
 const bound=BigInt(oddLimit);
 if(oddNumerator>bound||oddDenominator>bound)return false;
 if(primeLimit===null)return true;
 let remainingNumerator=numerator,remainingDenominator=denominator;
 const allowedPrimes=Array.isArray(primeLimit)?primeLimit:PRIME_LIMIT_VALUES.filter(prime=>prime<=primeLimit);
 for(const prime of allowedPrimes){const factor=BigInt(prime);while(remainingNumerator%factor===0n)remainingNumerator/=factor;while(remainingDenominator%factor===0n)remainingDenominator/=factor;}
 return remainingNumerator===1n&&remainingDenominator===1n;
}

function computeDiamond(oddLimit,primeLimit){
 const odds=Array.from({length:(oddLimit+1)/2},(_,i)=>2*i+1),out=[];
 for(let i=0;i<odds.length;i++)for(let j=0;j<odds.length;j++){
  let numerator=BigInt(odds[i]),denominator=BigInt(odds[j]);
  while(numerator>=2n*denominator)denominator*=2n;
  while(numerator<denominator)numerator*=2n;
  const common=gcd(numerator,denominator);numerator/=common;denominator/=common;
  if(!ratioWithinJILimits(numerator,denominator,{oddLimit,primeLimit}))continue;
  const n=Number(numerator),d=Number(denominator);
  out.push({i,j,n,d,label:`${n}/${d}`,c:1200*Math.log2(n/d)});
 }
 return immutable(out);
}

/** Coordinate-preserving tonality-diamond cells under both selected limits. */
export function diamondTargets(oddLimit=DEFAULT_ODD_LIMIT,primeLimit=null){
 const limits=validateJILimits({oddLimit,primeLimit});
 return diamondCache.get(JSON.stringify([limits.oddLimit,limits.primeLimit]),()=>computeDiamond(limits.oddLimit,limits.primeLimit));
}

function computeTargets(oddLimit,primeLimit){
 const out=[],seen=new Set();
 for(const target of diamondTargets(oddLimit,primeLimit)){
  if(target.n===target.d||seen.has(target.label))continue;
  seen.add(target.label);out.push({n:target.n,d:target.d,label:target.label,c:target.c});
 }
 return immutable(out.sort((a,b)=>a.c-b.c));
}

/** Unique octave-reduced ratio targets used by all JI interval searches. */
export function targetsForLimits(oddLimit=DEFAULT_ODD_LIMIT,primeLimit=null){
 const limits=validateJILimits({oddLimit,primeLimit});
 return targetCache.get(JSON.stringify([limits.oddLimit,limits.primeLimit]),()=>computeTargets(limits.oddLimit,limits.primeLimit));
}
