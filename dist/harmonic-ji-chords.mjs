import {chordIdentity} from './chord-identity-v2.mjs';
import {harmonicIdentity} from './harmonic-equivalence.mjs';
import {BoundedCache,immutable} from './cache.mjs';
import {targetIdFactory,targetSet as buildTargetSet,targetSetIdentity,ratioWithinJILimits} from './ji-limit-engine.mjs';
import {mappedIntervals} from './harmonic-intervals.mjs';
import {mappingContext} from './harmonic-context.mjs';
import {mapMonzo,ratioMonzo} from './ji-monzo.mjs';
import {bigintGcd,div,rational,show} from './rational.mjs';

const MAX_CURATED=256;
const EXPLICIT_SEEDS=Object.freeze([
 '1:2','2:5:6','4:5:6','5:6:8','4:6:7','6:9:11','4:5:6:7','4:5:6:7:9',
 '4:5:6:7:9:11','4:5:6:7:9:11:13','4:5:6:7:9:11:13:15',
 '8:10:11:12','8:9:10:12','8:9:10:11:12','1:3:5','1:5:7','1:7:11','1:31:97'
]);

function normalizeIdentity(input){
 if(typeof input==='string')return chordIdentity(input);
 if(input?.version===2&&Array.isArray(input.canonicalRatios))return input;
 throw Error('Use a JI chord input or an exact chord identity.');
}

/** Add octave-family and exact reciprocal links without changing exact identity. */
export function makeJIInterpretation(input,{preferredLabel=null,legacyForm=null,provenance={kind:'custom'}}={}){
 const source=normalizeIdentity(input),identity=JSON.parse(JSON.stringify(source)),family=harmonicIdentity(identity,'octave');
 const reciprocalInput=identity.canonicalRatios.map(ratio=>`${ratio.d}/${ratio.n}`).join(':');
 const exactDual=chordIdentity(reciprocalInput),dualFamily=harmonicIdentity(exactDual,'octave');
 if(dualFamily.familyId!==family.dualFamilyId)throw Error('Exact reciprocal does not match the octave-family dual.');
 const label=preferredLabel??identity.displayLabel;
 if(typeof label!=='string'||!label.length)throw Error('A preferred JI label must be nonempty text.');
 return immutable({schemaVersion:1,id:identity.fingerprint,type:'ji-chord-interpretation',identity,
  familyId:family.familyId,dualFamilyId:family.dualFamilyId,harmonicIdentity:family,
  exactDual,exactDualId:exactDual.fingerprint,
  preferredLabel:label,presentationForm:legacyForm,
  provenance:provenance&&typeof provenance==='object'?JSON.parse(JSON.stringify(provenance)):{kind:'custom'}});
}

function seedSources(){
 const sources=EXPLICIT_SEEDS.map((input,index)=>({input,provenance:{kind:'curated-seed',seedId:`curated:${index+1}`,seedIndex:index,input}}));
 for(let start=2;start<=16;start++)for(let size=2;size<=8;size++){
  const partials=Array.from({length:size},(_,index)=>start+index);
  sources.push({input:partials.join(':'),provenance:{kind:'harmonic-series-segment',seedId:`harmonic:${start}:${size}`,start,size,partials}});
 }
 return sources;
}

/** Largest odd part of a reduced integer chord form (`4:5:6` → 5, `10:12:15` → 15). */
export function maxOddHarmonic(terms){
 let best=0n;
 for(const term of terms){let n=BigInt(term);while(n>0n&&n%2n===0n)n/=2n;if(n>best)best=n;}
 return best;
}
// A chord identical to its exact reciprocal is ambitonal ('self'). Otherwise the side whose reduced
// harmonic representation has the lower maximum odd harmonic is otonal and its reciprocal utonal.
// Equal maxima fall back to smaller term sums, then fingerprints, so pairing stays deterministic.
function orientPair(base,dual){
 const terms=identity=>identity.aliases.otonal.split(':'),a=maxOddHarmonic(terms(base)),b=maxOddHarmonic(terms(dual));
 if(a!==b)return a<b?[base,dual]:[dual,base];
 const score=identity=>terms(identity).map(Number).reduce((sum,value)=>sum+value,0),x=score(base),y=score(dual);
 return x<y||x===y&&base.fingerprint<dual.fingerprint?[base,dual]:[dual,base];
}

/** Present any exact chord with the curated seeds' otonal/utonal orientation and labels. */
export function orientedJIInterpretation(input,provenance){
 const base=chordIdentity(input),dual=chordIdentity(base.aliases.reciprocal),[otonal,utonal]=orientPair(base,dual);
 const form=otonal.fingerprint===utonal.fingerprint?'self':base.fingerprint===otonal.fingerprint?'otonal':'utonal';
 return makeJIInterpretation(base,{preferredLabel:form==='utonal'?otonal.aliases.reciprocal:base.aliases.otonal,legacyForm:form,provenance});
}

// Pitch-class form of a chord: octave doublings merge and every rotation (choice of root) is one
// chord. A rotation whose integer form (or exact reciprocal's) starts on a power of two, 2^k:…, is
// rooted on the harmonic fundamental and preferred (4:5:6 over 3:4:5, 4:6:7 over 6:7:8); otherwise the
// smallest terms win. Both tests read the otonal side of the rotation's exact otonal/utonal pair, so a
// chord and its reciprocal choose matching rotations (major 4:5:6, minor 1/6:5:4).
const gcdBig=(a,b)=>{while(b){[a,b]=[b,a%b];}return a<0n?-a:a;};
const foldOctave=(n,d)=>{while(n>=2n*d)d*=2n;while(n<d)n*=2n;const g=gcdBig(n,d);return [n/g,d/g];};
const compareRatio=(a,b)=>{const x=a[0]*b[1],y=b[0]*a[1];return x<y?-1:x>y?1:0;};
function rotationTerms(classes,root,fold){
 const rel=classes.map(([n,d])=>{const g=gcdBig(n*root[1],d*root[0]);const r=[n*root[1]/g,d*root[0]/g];return fold?foldOctave(r[0],r[1]):r;});
 rel.sort(compareRatio);
 let lcm=1n;for(const [,d] of rel)lcm=lcm/gcdBig(lcm,d)*d;
 let terms=rel.map(([n,d])=>n*(lcm/d));const g=terms.reduce(gcdBig,0n);terms=terms.map(t=>t/g);
 return {ratios:rel,terms};
}
// Integer form of a rotation's exact reciprocal (unfolded), as the otonal/utonal orientation reads it.
function reciprocalTerms(ratios){
 const flipped=ratios.map(([n,d])=>[d,n]).sort(compareRatio);
 let lcm=1n;for(const [,d] of flipped)lcm=lcm/gcdBig(lcm,d)*d;
 const terms=flipped.map(([n,d])=>n*(lcm/d)),g=terms.reduce(gcdBig,0n);
 return terms.map(t=>t/g);
}
/** Every rotation of a chord's pitch-class set, in canonical member order: rotation k is rooted on member k. */
export function chordRotations(identity,octave){
 const seen=new Set(),classes=[];
 for(const q of identity.canonicalRatios.map(q=>[BigInt(q.n),BigInt(q.d)])){const r=octave?foldOctave(q[0],q[1]):(()=>{const g=gcdBig(q[0],q[1]);return [q[0]/g,q[1]/g];})(),key=r.join('/');if(!seen.has(key)){seen.add(key);classes.push(r);}}
 return classes.map((root,index)=>{const own=rotationTerms(classes,root,octave);
  return {index,root:`${root[0]}/${root[1]}`,ratios:own.ratios.map(([n,d])=>`${n}/${d}`),terms:own.terms,dualTerms:reciprocalTerms(own.ratios),label:own.terms.join(':')};});
}
/** The rotation key (`chordRotations(...).root`) of one JI member n/d: octave-reduced when `octave`. */
export function rotationRootKey(n,d,octave){
 const q=[BigInt(n),BigInt(d)],r=octave?foldOctave(q[0],q[1]):(()=>{const g=gcdBig(q[0],q[1]);return [q[0]/g,q[1]/g];})();
 return `${r[0]}/${r[1]}`;
}
export function simplestRotation(identity,octave){
 const rotations=chordRotations(identity,octave);
 if(rotations.length<2)return null;
 const sum=terms=>terms.reduce((a,b)=>a+b,0n),powerOfTwoRoot=terms=>(terms[0]&(terms[0]-1n))===0n;
 let best=null;
 for(const rotation of rotations){
  const own=rotation.terms,dual=rotation.dualTerms;
  const rank=[powerOfTwoRoot(own)||powerOfTwoRoot(dual)?0n:1n,sum(own)<sum(dual)?sum(own):sum(dual),own.at(-1),sum(own)];
  const spelling=rotation.ratios.join(':');
  const order=best?rank.reduce((d,v,i)=>d||(v<best.rank[i]?-1:v>best.rank[i]?1:0),0)||(spelling<best.spelling?-1:spelling>best.spelling?1:0):-1;
  if(order<0)best={rank,spelling,classCount:rotations.length,index:rotation.index};
 }
 return best;
}

let seedCandidates,legacyCandidates,curated;
const harmonicLineCache=new BoundedCache(24);
function generatedSeedCandidates(){
 if(seedCandidates)return seedCandidates;
 const records=new Map();
 for(const {input,provenance}of seedSources()){
  const base=chordIdentity(input),dual=chordIdentity(base.aliases.reciprocal),[otonal,utonal]=orientPair(base,dual);
  const pairId=[otonal.fingerprint,utonal.fingerprint].sort().join('|');
  for(const [identity,form,label]of [[otonal,'otonal',otonal.aliases.otonal],[utonal,'utonal',otonal.aliases.reciprocal]]){
   if(records.has(identity.fingerprint)||records.size>=MAX_CURATED)continue;
   records.set(identity.fingerprint,{identity,text:label,label,form:otonal.fingerprint===utonal.fingerprint?'self':form,pairId,provenance});
  }
 }
 seedCandidates=Object.freeze([...records.values()]);
 return seedCandidates;
}

/** Curated first-page identities plus bounded harmonic-series seeds, in legacy order. */
export function curatedJIChords(){
 if(curated)return curated;
 curated=Object.freeze(generatedSeedCandidates().map(candidate=>{
  const interpretation=makeJIInterpretation(candidate.identity,{preferredLabel:candidate.label,legacyForm:candidate.form,provenance:candidate.provenance});
  return immutable({...candidate,identity:interpretation.identity,interpretation,familyId:interpretation.familyId,dualFamilyId:interpretation.dualFamilyId,
   exactDualId:interpretation.exactDualId,provenance:interpretation.provenance});
 }));
 return curated;
}

/** Preserve the previous five-field record shape for existing consumers. */
export function legacyJIChordCandidates(){
 if(legacyCandidates)return legacyCandidates;
 legacyCandidates=Object.freeze(generatedSeedCandidates().map(({identity,text,label,form,pairId})=>({identity,text,label,form,pairId})));
 return legacyCandidates;
}

function asTargetSet(value){
 return Array.isArray(value?.targets)&&value.spec&&value.id?value:buildTargetSet(value);
}
function ratioValue(value){
 if(Array.isArray(value)&&value.length===2)return rational(BigInt(value[0]),BigInt(value[1]));
 if(value&&typeof value==='object'&&value.n!==undefined&&value.d!==undefined)return rational(BigInt(value.n),BigInt(value.d));
 if(typeof value==='string'&&/^\d+(?:\/\d+)?$/.test(value)){const [n,d='1']=value.split('/');return rational(BigInt(n),BigInt(d));}
 throw Error('Use a positive integer ratio.');
}
function ratioText(value){return show(value);}
function safeRatioNumber(value,name){
 if(value>BigInt(Number.MAX_SAFE_INTEGER))throw Error(`${name} exceeds the safe integer range.`);
 return Number(value);
}
function targetLabelFromId(id){return id.slice(id.lastIndexOf(':ratio:')+7);}
function parseTargetLabel(label){const [n,d]=label.split('/').map(BigInt);return rational(n,d);}
function targetLimitReason(targetSet,id){
 const ratio=parseTargetLabel(targetLabelFromId(id)),[n,d]=ratio;
 if(!ratioWithinJILimits(n,d,{oddLimit:targetSet.spec.oddLimit,primeLimit:null}))return 'odd-limit';
 if(targetSet.spec.primeFilter!==null&&!ratioWithinJILimits(n,d,{oddLimit:targetSet.spec.oddLimit,primeLimit:targetSet.spec.primeFilter}))return 'prime-filter';
 if(targetSet.spec.representationPolicy==='native-exact'&&(n%2n===0n||d%2n===0n))return 'representation-policy';
 return 'outside-selected-target-set';
}
function sourcePairOrder(a,b){return a.numerator-b.numerator||a.denominator-b.denominator||a.numeratorIndex-b.numeratorIndex||a.denominatorIndex-b.denominatorIndex||a.octaveLift-b.octaveLift;}
function matchingSourcePairs(target,ratio){
 const [n,d]=ratio;let oddN=n,oddD=d;
 while(oddN%2n===0n)oddN/=2n;
 while(oddD%2n===0n)oddD/=2n;
 const divisor=(a,b)=>{while(b)[a,b]=[b,a%b];return a;};
 const common=divisor(oddN,oddD);oddN/=common;oddD/=common;
 return [...(target?.sourcePairs??[])].filter(pair=>BigInt(pair.numerator)*oddD===BigInt(pair.denominator)*oddN).sort(sourcePairOrder);
}

function makeTargetResolver(targetSet,mapping){
 const context=mappingContext(mapping);
 if(targetSet.spec.representationPolicy==='octave'&&!context.basis.includes(2))throw Error('Use a native-exact target set when the mapping subgroup does not contain prime 2.');
 const intervalRecords=mappedIntervals(targetSet,context),targetById=new Map(targetSet.targets.map(target=>[target.id,target]));
 const intervalByTargetId=new Map(intervalRecords.map(record=>[record.targetId,record])),idFor=targetIdFactory(targetSet.spec);
 const resolve=value=>{
  const ratio=ratioValue(value),[n,d]=ratio,id=idFor({n:safeRatioNumber(n,'Target numerator'),d:safeRatioNumber(d,'Target denominator')}),target=targetById.get(id);
  if(!target)return {status:'limit-failure',failureKind:'limit',reason:targetLimitReason(targetSet,id),ratio:ratioText(ratio),targetId:id,coordinate:null,canonicalCoordinate:null,missingPrimes:[],sourcePairs:[]};
  const interval=intervalByTargetId.get(target.id),factorization=ratioMonzo(ratio,context.basis);
  if(!interval||!interval.coordinate||factorization.missingPrimes.length||!target.inMappingSubgroup){
   const missingPrimes=[...new Set([...(interval?.missingPrimes??[]),...factorization.missingPrimes])].sort((a,b)=>a-b);
   return {status:'mapping-failure',failureKind:'mapping',reason:'outside-mapping-subgroup',ratio:ratioText(ratio),targetId:id,coordinate:null,canonicalCoordinate:interval?.coordinate??null,missingPrimes,sourcePairs:matchingSourcePairs(target,ratio)};
  }
  const coordinate=mapMonzo(context.rows,factorization.basisMonzo),targetRatio=[BigInt(target.ratio.n),BigInt(target.ratio.d)];
  const twoPower=value=>{let exponent=0;while(value%2n===0n){value/=2n;exponent++;}return exponent;};
  const registerLift=targetSet.spec.representationPolicy==='octave'?twoPower(n)-twoPower(d)-twoPower(targetRatio[0])+twoPower(targetRatio[1]):0;
  return {status:'mapped',failureKind:null,reason:null,ratio:ratioText(ratio),targetId:id,coordinate,canonicalCoordinate:interval.coordinate,registerLift,missingPrimes:[],sourcePairs:matchingSourcePairs(target,ratio)};
 };
 return {context,resolve,targetById,intervalByTargetId};
}

function analyzeRatioMembers(ratios,targetSet,resolver){
 const edges=[];
 for(let i=0;i<ratios.length;i++)for(let j=i+1;j<ratios.length;j++){
  const left=ratioValue(ratios[i]),right=ratioValue(ratios[j]),interval=div(right,left),result=resolver.resolve(interval);
  edges.push({fromMember:i,toMember:j,...result});
 }
 const limitFailures=edges.filter(edge=>edge.status==='limit-failure'),mappingFailures=edges.filter(edge=>edge.status==='mapping-failure');
 const degenerate=edges.length===0,dyadic=!degenerate&&edges.every(edge=>edge.status==='mapped');
 const status=degenerate?'degenerate':dyadic?'dyadic':limitFailures.length&&mappingFailures.length?'mixed-failure':limitFailures.length?'limit-failure':'mapping-failure';
 return immutable({complete:true,dyadic,degenerate,status,mappingId:resolver.context.id,targetSetId:targetSet.id,edgeCount:edges.length,
  limitFailures,mappingFailures,edges});
}

/** Check every unordered JI dyad and keep target-limit failures distinct from unmapped dyads. */
// One resolver per target set and mapping: building it maps every target interval.
const resolverCache=new BoundedCache(8);
export function analyzeJIDyads(input,targetSpec,mapping){
 const identity=normalizeIdentity(input),set=asTargetSet(targetSpec);
 const resolver=resolverCache.get(JSON.stringify([set.id,mappingContext(mapping).id]),()=>makeTargetResolver(set,mapping));
 const ratios=identity.canonicalRatios.map(ratio=>[BigInt(ratio.n),BigInt(ratio.d)]);
 return analyzeRatioMembers(ratios,set,resolver);
}

function compareNumbers(a,b){return a-b;}
function comparePartialLists(a,b){for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return a[i]-b[i];return a.length-b.length;}
function compareAxisCells(a,b){return a.numerator-b.numerator||a.denominator-b.denominator||a.numeratorIndex-b.numeratorIndex||a.denominatorIndex-b.denominatorIndex;}
function mappedMembers(identity,resolver){
 return identity.canonicalRatios.map((ratio,index)=>{
  const resolved=resolver.resolve([BigInt(ratio.n),BigInt(ratio.d)]);
  return {memberIndex:index,ratio:ratio.label,targetId:resolved.targetId,coordinate:resolved.coordinate,status:resolved.status};
 });
}
function sourceAxisRows(targetSet,resolver){
 const axes=new Map(),sourceCellCounts={mapped:0,limitFailure:0,mappingFailure:0};
 for(const target of targetSet.targets)for(const pair of [...target.sourcePairs].sort(sourcePairOrder)){
  const numerator=pair.numerator,denominator=pair.denominator,resolved=resolver.resolve([BigInt(numerator),BigInt(denominator)]);
  if(resolved.status!=='mapped'){sourceCellCounts[resolved.status==='limit-failure'?'limitFailure':'mappingFailure']++;continue;}
  sourceCellCounts.mapped++;
  if(!axes.has(denominator))axes.set(denominator,{denominatorAxis:denominator,memberAxes:new Set(),sourceCells:[]});
  const axis=axes.get(denominator);axis.memberAxes.add(numerator);
  axis.sourceCells.push({numerator,denominator,numeratorIndex:pair.numeratorIndex,denominatorIndex:pair.denominatorIndex,
   octaveLift:pair.octaveLift,targetId:resolved.targetId,coordinate:resolved.coordinate});
 }
 return {axes:[...axes.values()].map(axis=>({...axis,memberAxes:[...axis.memberAxes].sort(compareNumbers),sourceCells:axis.sourceCells.sort(compareAxisCells)}))
  .filter(axis=>axis.memberAxes.includes(axis.denominatorAxis)&&axis.memberAxes.length>1).sort((a,b)=>a.denominatorAxis-b.denominatorAxis),sourceCellCounts};
}

function chordOrCollection(group,targetSet,resolver){
 const partialNumbers=group.partialNumbers,baseRatioMembers=partialNumbers.map(partial=>[BigInt(partial),1n]);
 const assessment=analyzeRatioMembers(baseRatioMembers,targetSet,resolver),withinChordBound=partialNumbers.length<=8,canCreateChord=assessment.dyadic&&withinChordBound;
 const sourceProvenance={kind:'target-harmonic-axes',targetSetId:targetSet.id,partialNumbers,denominatorAxes:group.sourceAxisRows.map(axis=>axis.denominatorAxis)};
 const membersFor=(identity,orientation)=>{
  if(identity)return mappedMembers(identity,resolver);
  const base=partialNumbers.map(partial=>rational(BigInt(partial),BigInt(partialNumbers[0])));
  const ratios=orientation==='utonal'?base.map(ratio=>rational(ratio[1],ratio[0])):base;
  return ratios.map((ratio,index)=>{const resolved=resolver.resolve(ratio);return {memberIndex:index,ratio:ratioText(ratio),targetId:resolved.targetId,coordinate:resolved.coordinate,status:resolved.status};});
 };
 const makeRecord=(form,identity,interpretation,dyadAssessment,dualOf=null)=>{
  const kind=identity?'harmonic-line':'harmonic-collection',lineId=`harmonic-${identity?'line':'collection'}-v1:${JSON.stringify([resolver.context.id,targetSet.id,partialNumbers,form])}`;
  return immutable({id:lineId,kind,form,label:interpretation?.preferredLabel??(form==='utonal'?`reciprocal of ${partialNumbers.join(':')}`:partialNumbers.join(':')),
   identity:identity??null,interpretation:interpretation??null,familyId:interpretation?.familyId??null,dualFamilyId:interpretation?.dualFamilyId??null,
   exactDualId:interpretation?.exactDualId??null,partialNumbers,members:membersFor(identity,form),sourceAxisRows:group.sourceAxisRows,
   sourceCells:dyadAssessment.edges,dyadAssessment,completeAsChord:!!identity,
   collectionReason:identity?null:!assessment.dyadic?'contains-nondyadic-dyads':!withinChordBound?'over-eight-members':null,
   targetSetId:targetSet.id,mappingId:resolver.context.id,provenance:sourceProvenance,dualOf});
 };
 if(canCreateChord){
  const identity=chordIdentity(partialNumbers.join(':'));
  const interpretation=makeJIInterpretation(identity,{preferredLabel:identity.aliases.otonal,legacyForm:'otonal',provenance:sourceProvenance});
  const dual=interpretation.exactDual,dualAssessment=analyzeRatioMembers(dual.canonicalRatios.map(ratio=>[BigInt(ratio.n),BigInt(ratio.d)]),targetSet,resolver);
  if(!dualAssessment.dyadic)throw Error('The selected JI target set must be reciprocal-closed under its declared policy.');
  const base=makeRecord('otonal',identity,interpretation,assessment);
  if(dual.fingerprint===identity.fingerprint){const selfId=base.id.replace('otonal','self');return [immutable({...base,form:'self',id:selfId,dualFamilyId:interpretation.familyId,exactDualId:identity.fingerprint,dualOf:selfId})];}
  const dualInterpretation=makeJIInterpretation(dual,{preferredLabel:identity.aliases.reciprocal,legacyForm:'utonal',provenance:{...sourceProvenance,kind:'reciprocal-target-harmonic-axes',dualOf:identity.fingerprint}});
  const dualRecord=makeRecord('utonal',dual,dualInterpretation,dualAssessment,base.id);
  const linkedBase=immutable({...base,dualOf:dualRecord.id});
  return [linkedBase,dualRecord];
 }
 const base=makeRecord('otonal',null,null,assessment),dualRatios=baseRatioMembers.map(ratio=>rational(ratio[1],ratio[0]));
 const dualAssessment=analyzeRatioMembers(dualRatios,targetSet,resolver);
 return [immutable({...base,dualOf:`harmonic-collection-v1:${JSON.stringify([resolver.context.id,targetSet.id,partialNumbers,'utonal'])}`}),
  makeRecord('utonal',null,null,dualAssessment,base.id)];
}

/**
 * Build lines by grouping mapped target-set source cells on their denominator
 * harmonic axis. The common integer divisor is removed for chord identity;
 * every original axis row and cell remains attached as provenance. The finite
 * source-axis domain is exhaustive, while arbitrary dyadic chords are a
 * separate search domain handled by later catalogue/CSP stages.
 */
export function harmonicLines(mapping,targetSpec,{cache=true}={}){
 const set=asTargetSet(targetSpec),context=mappingContext(mapping),cacheKey=JSON.stringify([context.id,set.id]);
 if(set.id!==targetSetIdentity(set.spec))throw Error('Harmonic lines require a canonical shared target set.');
 const compute=()=>{
  const resolver=makeTargetResolver(set,context),{axes,sourceCellCounts}=sourceAxisRows(set,resolver),groups=new Map();
  for(const axis of axes){const divisor=axis.memberAxes.reduce((g,value)=>bigintGcd(g,BigInt(value)),0n),partialNumbers=axis.memberAxes.map(value=>Number(BigInt(value)/divisor)),key=partialNumbers.join(':');if(!groups.has(key))groups.set(key,{partialNumbers,sourceAxisRows:[]});groups.get(key).sourceAxisRows.push(axis);}
  const objects=[...groups.values()].sort((a,b)=>comparePartialLists(a.partialNumbers,b.partialNumbers)).flatMap(group=>chordOrCollection(group,set,resolver));
  const lines=objects.filter(object=>object.kind==='harmonic-line'),collections=objects.filter(object=>object.kind==='harmonic-collection');
  return immutable({schemaVersion:1,mapping:{basis:context.basis,rows:context.rows},mappingId:context.id,targetSetSpec:set.spec,targetSetId:set.id,
   sourceAxis:'odd-harmonic-target-cells',objects,lines,collections,
   bounds:{oddLimit:set.spec.oddLimit,sourceAxisRows:axes.length,distinctPartialSets:groups.size,maxChordMembers:8,
    sourceCellCounts,excludedByTargetLimits:set.completeness.sourcePairCount-set.targets.reduce((sum,target)=>sum+target.sourcePairs.length,0)},
   completeness:{complete:true,domain:'finite-shared-target-source-axis-cells',classifiedSourcePairCount:set.targets.reduce((sum,target)=>sum+target.sourcePairs.length,0),
    sourcePairCount:set.completeness.sourcePairCount}});
 };
 return cache?harmonicLineCache.get(cacheKey,compute):compute();
}

function chooseCount(n,k){
 if(k<0||k>n)return 0;
 let result=1n;for(let index=1;index<=Math.min(k,n-k);index++)result=result*BigInt(n-Math.min(k,n-k)+index)/BigInt(index);
 if(result>BigInt(Number.MAX_SAFE_INTEGER))throw Error('Subset count exceeds the safe integer range.');
 return Number(result);
}
function combinationAt(n,k,rank){
 let remaining=BigInt(rank),start=0;const output=[];
 for(let position=0;position<k;position++){
  const slots=k-position-1;
  for(let value=start;value<=n-slots-1;value++){
   const count=chooseCount(n-value-1,slots);
   if(remaining<BigInt(count)){output.push(value);start=value+1;break;}
   remaining-=BigInt(count);
  }
 }
 return output;
}
function sizesFromOptions(options){
 if(options.size!==undefined){if(!Number.isInteger(options.size)||options.size<2||options.size>8)throw Error('Select one chord size from two through eight.');return [options.size];}
 const min=options.minSize??3,max=options.maxSize??6;
 if(!Number.isInteger(min)||!Number.isInteger(max)||min<2||max>8||min>max)throw Error('Choose valid subset size bounds from two through eight.');
 if(max>6)throw Error('Sizes seven and eight require an explicit single-size selection.');
 return Array.from({length:max-min+1},(_,index)=>min+index);
}
function combinationAtSizes(memberCount,sizes,offset){
 let position=offset;
 for(const size of sizes){const count=chooseCount(memberCount,size);if(position<count)return {size,indices:combinationAt(memberCount,size,position)};position-=count;}
 return null;
}

/** Lazily enumerate bounded dyadic subsets with a deterministic resumable cursor. */
export function enumerateJISubsets(spec,options={}){
 if(spec?.schemaVersion!==1||!spec.targetSetSpec||!spec.mapping||!Array.isArray(spec.objects))throw Error('Use a harmonicLines catalogue result.');
 const set=buildTargetSet(spec.targetSetSpec),context=mappingContext(spec.mapping);
 if(set.id!==spec.targetSetId||context.id!==spec.mappingId)throw Error('Harmonic subset context does not match the catalogue.');
 const sizes=sizesFromOptions(options),line=options.lineId?spec.objects.find(object=>object.id===options.lineId):spec.objects.find(object=>object.form==='otonal'||object.form==='self');
 if(options.lineId&&!line)throw Error('Unknown harmonic line ID.');
 if(!line)return immutable({status:'ready',items:[],cursor:null,nextCursor:null,complete:true,totalCombinations:0,doneCombinations:0});
 const pageSize=options.pageSize??48,maxScan=options.maxScan??Math.min(1024,pageSize*4);
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>128)throw Error('Subset page size must be from one through 128.');
 if(!Number.isInteger(maxScan)||maxScan<1||maxScan>4096)throw Error('Subset scan bound must be from one through 4096.');
 const counts=sizes.map(size=>chooseCount(line.partialNumbers.length,size)),totalCombinations=counts.reduce((sum,count)=>sum+count,0);
 const cursorKey={version:1,mappingId:spec.mappingId,targetSetId:spec.targetSetId,lineId:line.id,sizes};
 let offset=0;
 if(options.cursor!==undefined&&options.cursor!==null){
  let parsed;try{parsed=JSON.parse(options.cursor);}catch{throw Error('Invalid subset cursor.');}
  if(parsed.version!==cursorKey.version||parsed.mappingId!==cursorKey.mappingId||parsed.targetSetId!==cursorKey.targetSetId||parsed.lineId!==cursorKey.lineId||JSON.stringify(parsed.sizes)!==JSON.stringify(sizes)||!Number.isSafeInteger(parsed.offset)||parsed.offset<0||parsed.offset>totalCombinations)throw Error('Subset cursor does not match this search.');
  offset=parsed.offset;
 }
 const resolver=makeTargetResolver(set,context),items=[];let scanned=0,rejectedNonDyadic=0;
 while(offset<totalCombinations&&items.length<pageSize&&scanned<maxScan){
  const selection=combinationAtSizes(line.partialNumbers.length,sizes,offset);offset++;scanned++;
  if(!selection)break;
  const partials=selection.indices.map(index=>line.partialNumbers[index]),baseIdentity=chordIdentity(partials.join(':'));
  const baseInterpretation=makeJIInterpretation(baseIdentity,{preferredLabel:baseIdentity.aliases.otonal,legacyForm:'otonal',provenance:{kind:'harmonic-subset',lineId:line.id,sourceMemberIndices:selection.indices,partials}});
  const identity=line.form==='utonal'?baseInterpretation.exactDual:baseIdentity;
  const dyadAssessment=analyzeRatioMembers(identity.canonicalRatios.map(ratio=>[BigInt(ratio.n),BigInt(ratio.d)]),set,resolver);
  if(!dyadAssessment.dyadic){rejectedNonDyadic++;continue;}
  const form=identity.fingerprint===baseIdentity.fingerprint?'self':line.form==='utonal'?'utonal':'otonal';
  const preferredLabel=form==='utonal'?baseIdentity.aliases.reciprocal:baseIdentity.aliases.otonal;
  const interpretation=makeJIInterpretation(identity,{preferredLabel,legacyForm:form,provenance:{kind:form==='utonal'?'reciprocal-harmonic-subset':'harmonic-subset',lineId:line.id,sourceMemberIndices:selection.indices,partials}});
  const id=`harmonic-subset-v1:${JSON.stringify([spec.mappingId,spec.targetSetId,line.id,identity.fingerprint,selection.indices])}`;
  items.push(immutable({id,identity,interpretation,familyId:interpretation.familyId,dualFamilyId:interpretation.dualFamilyId,
   exactDualId:interpretation.exactDualId,preferredLabel:interpretation.preferredLabel,form,partials,sourceMemberIndices:selection.indices,
   dyadicAssessment:dyadAssessment,sourceCells:dyadAssessment.edges}));
 }
 const nextCursor=offset<totalCombinations?JSON.stringify({...cursorKey,offset}):null;
 return immutable({status:'ready',lineId:line.id,items,cursor:options.cursor??null,nextCursor,complete:nextCursor===null,
  totalCombinations,doneCombinations:offset,scanned,rejectedNonDyadic,sizes,pageSize,maxScan});
}
