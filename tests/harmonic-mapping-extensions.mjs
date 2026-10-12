import assert from 'node:assert/strict';
import {makeState} from '../src/core/engine.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {mappingContext} from '../src/harmonic/harmonic-context.mjs';
import {targetSet} from '../src/core/ji-limit-engine.mjs';
import {mapMonzo,ratioMonzo} from '../src/core/ji-monzo.mjs';
import {enumerateMappingExtensions,validateMappingVariant} from '../src/harmonic/harmonic-mappings.mjs';

const meantone=makeState('meantone'),active=mappingContext(meantone);
const alreadyMapped=enumerateMappingExtensions(active,'16/15');
assert.equal(alreadyMapped.status,'already-mapped');
assert.deepEqual(alreadyMapped.canonicalCoordinate,[3,-5]);
assert.deepEqual(alreadyMapped.candidates,[],'a mapped ratio has one image under a fixed map');

const defaultSearch=enumerateMappingExtensions(meantone,'11/8');
assert.equal(defaultSearch.status,'ready');
assert.deepEqual(defaultSearch.bounds.generatorCoefficient,[-16,16]);
assert.deepEqual(defaultSearch.bounds.periodOffsets,[-1,0,1]);
assert.equal(defaultSearch.completeness.domainExhausted,true);
assert.equal(defaultSearch.completeness.candidateCount,99);
assert.equal(defaultSearch.candidates.length,20);
assert.equal(defaultSearch.completeness.truncated,true);
assert.ok(defaultSearch.limitations.some(text=>text.includes('not a complete list')));
assert.ok(defaultSearch.candidates.every(candidate=>candidate.relation==='preserved-column-extension'));
assert.ok(defaultSearch.candidates.every(candidate=>candidate.mappingId===candidate.mappingContext.id));
assert.ok(defaultSearch.candidates.every(candidate=>candidate.validationEvidence.status==='compatible'));
assert.ok(defaultSearch.candidates.every(candidate=>candidate.primeCoordinate.every(value=>Number.isSafeInteger(value)&&Math.abs(value)<=1000)));

const sharedTargets=targetSet({oddLimit:11,primeFilter:null,mappingSubgroup:meantone.basis,representationPolicy:'octave'});
const target11=sharedTargets.targets.find(target=>target.ratio.label==='11/8');
assert.ok(target11);
const fromSharedTarget=enumerateMappingExtensions(meantone,target11,{maxResults:2});
assert.equal(fromSharedTarget.sourceTargetId,target11.id,'the target-set record and its provenance pass through unchanged');

const originalColumns=new Map(active.basis.map((prime,index)=>[prime,[active.rows[0][index],active.rows[1][index]]]));
for(const candidate of defaultSearch.candidates){
 const extended=candidate.mappingContext;
 for(const [prime,coordinate] of originalColumns){
  const column=extended.basis.indexOf(prime);
  assert.notEqual(column,-1);
  assert.deepEqual([extended.rows[0][column],extended.rows[1][column]],coordinate,'every old prime column is preserved');
 }
 const b=candidate.primeCoordinate[1],a=candidate.primeCoordinate[0];
 const ideal=(1200*Math.log2(11)-b*meantone.g)/meantone.p;
 const nearest=[Math.floor(ideal),Math.ceil(ideal)],distance=Math.min(...nearest.map(value=>Math.abs(value-ideal)));
 assert.ok(nearest.some(value=>Math.abs(Math.abs(value-ideal)-distance)<1e-12&&Math.abs(a-value)<=1));
 const exactTarget=ratioMonzo('11/8',extended.basis);
 assert.deepEqual(mapMonzo(extended.rows,exactTarget.basisMonzo),candidate.targetCoordinate);
 const confirmed=validateMappingVariant(meantone,{mapping:extended,
  assignments:[{ratio:'11/8',coordinate:candidate.targetCoordinate}]});
 assert.equal(confirmed.status,'compatible','every returned extension passes the exact assignment solver');
 assert.equal(confirmed.candidateMappingId,candidate.mappingId);
 assert.equal(candidate.signedErrorCents,candidate.tunedCents-candidate.idealCents);
}
assert.ok(defaultSearch.candidates.every((candidate,index,list)=>index===0||
 candidate.absoluteErrorCents>=list[index-1].absoluteErrorCents),
 'rank candidates by target absolute tuning error');

const fiveOnly=enumerateMappingExtensions(meantone,'11/8',{maxResults:5});
assert.equal(fiveOnly.candidates.length,5);
assert.equal(fiveOnly.completeness.candidateCount,defaultSearch.completeness.candidateCount);
assert.deepEqual(fiveOnly.candidates.map(candidate=>candidate.id),defaultSearch.candidates.slice(0,5).map(candidate=>candidate.id));

const wider=enumerateMappingExtensions(meantone,'11/8',{generatorBound:32});
assert.deepEqual(wider.bounds.generatorCoefficient,[-32,32]);
assert.ok(wider.completeness.candidateCount>=defaultSearch.completeness.candidateCount);
for(const candidate of defaultSearch.candidates){
 const stillValid=validateMappingVariant(meantone,{mapping:candidate.mappingContext,
  assignments:[{ratio:'11/8',coordinate:candidate.targetCoordinate}]});
 assert.equal(stillValid.status,'compatible','a larger search bound does not invalidate earlier contexts');
}
assert.throws(()=>enumerateMappingExtensions(meantone,'11/8',{generatorBound:24}),/16, 32 or 64/);
assert.throws(()=>enumerateMappingExtensions(active,'11/8'),/tuned period and generator/);
assert.throws(()=>enumerateMappingExtensions(meantone,'11/8',{tuning:{mappingId:'other',periodCents:1200,generatorCents:700}}),/different mapping context/);

const powerSearch=enumerateMappingExtensions(meantone,'49/4',{maxResults:4});
assert.equal(powerSearch.bounds.primeExponent,2);
assert.ok(powerSearch.candidates.length>0);
for(const candidate of powerSearch.candidates){
 const [a,b]=candidate.primeCoordinate;
 assert.deepEqual(candidate.targetCoordinate,[-2+2*a,2*b],
  'the target containing 7² maps through twice one integral 7-column');
 const exact=ratioMonzo('49/4',candidate.mappingContext.basis);
 assert.deepEqual(mapMonzo(candidate.mappingContext.rows,exact.basisMonzo),candidate.targetCoordinate);
}
const fractionalPower=validateMappingVariant(meantone,{assignments:[{ratio:'49/4',coordinate:[3,0]}]});
assert.equal(fractionalPower.status,'conflict','subtracting known columns and dividing by exponent 2 cannot yield a fractional prime column');
assert.match(fractionalPower.validation.message,/fractional/);

const multiMissing=enumerateMappingExtensions(meantone,'77/32');
assert.equal(multiMissing.status,'unresolved');
assert.equal(multiMissing.reason,'multiple-missing-primes');
assert.deepEqual(multiMissing.candidates,[],'multi-prime Cartesian search remains disabled');
const explicitMulti=validateMappingVariant(meantone,{assignments:[
 {ratio:'7/4',coordinate:[-5,10]},{ratio:'11/8',coordinate:[0,4]}]});
assert.equal(explicitMulti.status,'compatible','complete explicit multi-prime assignments remain valid');
assert.equal(explicitMulti.relation,'preserved-column-extension');
assert.deepEqual(explicitMulti.addedPrimes,[7,11]);

const tritave=fromCommas('245/243','3.5.7','Computed CWE');
const nonOctave=enumerateMappingExtensions(tritave,'11/3',{maxResults:3});
assert.equal(nonOctave.status,'ready');
assert.notEqual(tritave.p,1200);
for(const candidate of nonOctave.candidates){
 const computed=candidate.targetCoordinate[0]*tritave.p+candidate.targetCoordinate[1]*tritave.g;
 assert.ok(Math.abs(candidate.tunedCents-computed)<1e-10);
 assert.ok(Math.abs(candidate.signedErrorCents-(computed-1200*Math.log2(11/3)))<1e-8);
}

assert.throws(()=>enumerateMappingExtensions(meantone,'11/8',{maxResults:21}),/at most 20/);
assert.throws(()=>enumerateMappingExtensions(meantone,'11/8',{generatorBound:65}),/16, 32 or 64/);
console.log('Bounded one-prime extensions, tuning-error ranking, powers and non-octave bounds passed.');
