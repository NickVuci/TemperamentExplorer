import {BoundedCache,immutable} from './cache.mjs';

const isPrime=n=>{if(n<2)return false;for(let d=2;d*d<=n;d++)if(n%d===0)return false;return true;};
export const ODD_LIMIT_VALUES=Object.freeze(Array.from({length:48},(_,i)=>i*2+3));
export const PRIME_LIMIT_VALUES=Object.freeze(Array.from({length:97},(_,i)=>i+2).filter(isPrime));
export const DEFAULT_ODD_LIMIT=15;
export const MANUAL_PRIME_LIMIT_VALUES=Object.freeze(PRIME_LIMIT_VALUES.filter(value=>value>=3&&value<=13));
const oddSet=new Set(ODD_LIMIT_VALUES),primeSet=new Set(PRIME_LIMIT_VALUES);
const diamondCache=new BoundedCache(48),targetCache=new BoundedCache(48),targetSetCache=new BoundedCache(48);

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

/** A single prime denotes a limit; several primes denote an exact subgroup. */
export function parsePrimeFilterInput(value,basis){
 const text=String(value??'').trim();
 if(text.toLowerCase()==='basis')return primeFilterForBasis(basis);
 if(!text)return null;
 if(!/^\d+(?:[.\s,]+\d+)*$/.test(text))throw Error('Enter a prime such as 11, or a basis such as 2.3.5.11.');
 const primes=text.split(/[.\s,]+/).map(Number);
 return validateJILimits({primeLimit:primes.length===1?primes[0]:primes}).primeLimit;
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
 return immutable(sourceAxisPairs(oddLimit,'octave').filter(source=>ratioWithinJILimits(source.n,source.d,{oddLimit,primeLimit}))
  .map(source=>({i:source.i,j:source.j,n:source.n,d:source.d,label:`${source.n}/${source.d}`,c:1200*Math.log2(source.n/source.d)})));
}

function foldOctave(numerator,denominator){
 let n=BigInt(numerator),d=BigInt(denominator),lift=0;
 const common=gcd(n,d);n/=common;d/=common;
 while(n>=2n*d){d*=2n;lift++;}
 while(n<d){n*=2n;lift--;}
 const divisor=gcd(n,d);n/=divisor;d/=divisor;
 return {n:Number(n),d:Number(d),octaveLift:lift};
}
function sourceAxisPairs(oddLimit,policy){
 const odds=Array.from({length:(oddLimit+1)/2},(_,index)=>index*2+1),pairs=[];
 for(let i=0;i<odds.length;i++)for(let j=0;j<odds.length;j++){
  const rawN=odds[i],rawD=odds[j];
  const ratio=policy==='octave'?foldOctave(rawN,rawD):(()=>{const common=gcd(rawN,rawD);return {n:rawN/common,d:rawD/common,octaveLift:0};})();
  pairs.push({i,j,rawN,rawD,...ratio});
 }
 return pairs;
}

function normalizedPrimeSet(value,name,{allowNull=false}={}){
 if(value===null&&allowNull)return null;
 const limits=validateJILimits({oddLimit:DEFAULT_ODD_LIMIT,primeLimit:value});
 if(Array.isArray(limits.primeLimit))return limits.primeLimit;
 if(limits.primeLimit===null)return null;
 return PRIME_LIMIT_VALUES.filter(prime=>prime<=limits.primeLimit);
}

/** Normalize the finite analytical target identity without depending on tuning or mapping matrix. */
export function normalizeTargetSetSpec({oddLimit=DEFAULT_ODD_LIMIT,primeFilter=null,mappingSubgroup,representationPolicy='octave'}={}){
 const limits=validateJILimits({oddLimit,primeLimit:primeFilter});
 if(!['octave','native-exact'].includes(representationPolicy))throw Error('Target representation must be octave or native-exact.');
 if(!Array.isArray(mappingSubgroup))throw Error('Target sets require the actual prime subgroup as an explicit array.');
 const subgroup=validateJILimits({oddLimit:DEFAULT_ODD_LIMIT,primeLimit:mappingSubgroup}).primeLimit;
 const primeSetValue=normalizedPrimeSet(limits.primeLimit,'prime filter',{allowNull:true});
 return immutable({schemaVersion:1,oddLimit:limits.oddLimit,primeFilter:primeSetValue,mappingSubgroup:subgroup,representationPolicy});
}

export function targetSetIdentity(spec){
 const normalized=normalizeTargetSetSpec(spec);
 return `ji-target-set-v1:${JSON.stringify([normalized.schemaVersion,normalized.oddLimit,normalized.primeFilter,normalized.mappingSubgroup,normalized.representationPolicy])}`;
}

function exactRatio(n,d){const common=gcd(BigInt(n),BigInt(d));const numerator=Number(BigInt(n)/common),denominator=Number(BigInt(d)/common);return {n:numerator,d:denominator,label:`${numerator}/${denominator}`};}
const compareRatio=(a,b)=>BigInt(a.n)*BigInt(b.d)<BigInt(b.n)*BigInt(a.d)?-1:BigInt(a.n)*BigInt(b.d)>BigInt(b.n)*BigInt(a.d)?1:0;

/** Stable versioned identity for one reduced ratio inside a specific target set. */
export function targetId(spec,ratio){
 const normalized=normalizeTargetSetSpec(spec),value=typeof ratio==='string'?ratio.split('/').map(Number):[ratio?.n,ratio?.d];
 if(value.length!==2||!value.every(Number.isSafeInteger)||value.some(n=>n<=0))throw Error('Target identity needs a positive integer ratio.');
 const [n,d]=value,common=gcd(BigInt(n),BigInt(d)),reduced={n:Number(BigInt(n)/common),d:Number(BigInt(d)/common)};
 const canonical=normalized.representationPolicy==='octave'?foldOctave(reduced.n,reduced.d):{n:reduced.n,d:reduced.d};
 return `${targetSetIdentity(normalized)}:ratio:${canonical.n}/${canonical.d}`;
}

function computeTargetSet(normalized){
 const id=targetSetIdentity(normalized),byRatio=new Map();
 for(const source of sourceAxisPairs(normalized.oddLimit,normalized.representationPolicy)){
  const ratio=exactRatio(source.n,source.d);
  if(!ratioWithinJILimits(ratio.n,ratio.d,{oddLimit:normalized.oddLimit,primeLimit:normalized.primeFilter}))continue;
  const key=ratio.label;
  if(!byRatio.has(key))byRatio.set(key,{ratio,sources:[]});
  byRatio.get(key).sources.push({numeratorIndex:source.i,denominatorIndex:source.j,numerator:source.rawN,denominator:source.rawD,octaveLift:source.octaveLift});
 }
 if(!byRatio.has('1/1'))byRatio.set('1/1',{ratio:{n:1,d:1,label:'1/1'},sources:[]});
 const targets=[...byRatio.values()].sort((a,b)=>compareRatio(a.ratio,b.ratio)).map(({ratio,sources})=>immutable({
  id:`${id}:ratio:${ratio.label}`,ratio,idealCents:1200*Math.log2(ratio.n/ratio.d),
  sourcePairs:sources,registerPolicy:normalized.representationPolicy,
  inMappingSubgroup:ratioWithinJILimits(ratio.n,ratio.d,{oddLimit:normalized.oddLimit,primeLimit:normalized.mappingSubgroup}),
 }));
 return immutable({id,spec:normalized,targets,completeness:{complete:true,sourcePairCount:((normalized.oddLimit+1)/2)**2}});
}

/** Eager finite target set under an explicit octave or native-exact policy. */
export function targetSet(spec){
 const normalized=normalizeTargetSetSpec(spec);
 const id=targetSetIdentity(normalized);
 return targetSetCache.get(id,()=>computeTargetSet(normalized));
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
