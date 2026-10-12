import assert from 'node:assert/strict';
import {MAX_FACTOR_COMPONENT,isZeroMonzoImage,mapMonzo,ratioMonzo} from '../src/core/ji-monzo.mjs';

const meantoneBasis=[2,3,5];
const unison=ratioMonzo('14/14',meantoneBasis);
assert.equal(unison.numerator,'1');
assert.equal(unison.denominator,'1');
assert.deepEqual(unison.sparseMonzo,{});
assert.deepEqual(unison.basisMonzo,[0,0,0]);
assert.equal(unison.withinBasis,true);

const didymicComma=ratioMonzo({n:81n,d:80n},meantoneBasis);
assert.deepEqual(didymicComma.sparseMonzo,{'2':-4,'3':4,'5':-1});
assert.deepEqual(didymicComma.basisMonzo,[-4,4,-1]);
assert.deepEqual(mapMonzo([[1,1,0],[0,1,4]],didymicComma.basisMonzo),[0,0]);
assert.deepEqual(mapMonzo([[1,1,0],[0,1,4]],[-2,0,1]),[-2,4]);
const sparseOnly=ratioMonzo('81/80');
assert.deepEqual(sparseOnly.sparseMonzo,didymicComma.sparseMonzo);
assert.equal(sparseOnly.basisMonzo,undefined);
assert.equal(sparseOnly.withinBasis,null,'sparse-only factorization makes no subgroup claim');

const reordered=ratioMonzo('81/80',[5,2,3]);
assert.deepEqual(reordered.sparseMonzo,didymicComma.sparseMonzo);
assert.deepEqual(reordered.basisMonzo,[-1,-4,4]);

const reduced=ratioMonzo(['21','14'],[2,3,5]);
assert.equal(reduced.ratio,'3/2');
assert.deepEqual(reduced.sparseMonzo,{'2':-1,'3':1});
assert.deepEqual(reduced.basisMonzo,[-1,1,0]);
assert.equal(reduced.withinBasis,true);
const largeCommon=1_000_000_000_001n;
assert.equal(ratioMonzo([3n*largeCommon,2n*largeCommon],[2,3,5]).ratio,'3/2');

const missingSeven=ratioMonzo('7/4',[2,3,5,11]);
assert.deepEqual(missingSeven.sparseMonzo,{'2':-2,'7':1});
assert.deepEqual(missingSeven.basisMonzo,[-2,0,0,0]);
assert.deepEqual(missingSeven.missingPrimes,[7]);
assert.equal(missingSeven.remainingNumerator,'7');
assert.equal(missingSeven.withinBasis,false);

const largePrime=ratioMonzo('9999999967',[2,3]);
assert.deepEqual(largePrime.missingPrimes,[9999999967]);
assert.equal(largePrime.sparseMonzo['9999999967'],1);
assert.equal(MAX_FACTOR_COMPONENT,1_000_000_000_000);
const noVector=ratioMonzo('97/64',[2,3,5,7,11],{includeBasis:false});
assert.equal(Object.hasOwn(noVector,'basisMonzo'),false);
assert.deepEqual(noVector.missingPrimes,[97]);
assert.deepEqual(JSON.parse(JSON.stringify(didymicComma)),didymicComma);

assert.deepEqual(mapMonzo([[1,2,3],[0,1,4]],[-1n,2n,0n]),[3,2]);
assert.deepEqual(mapMonzo([[1,0,0],[0,1,0],[0,0,1]],[4,-5,6]),[4,-5,6]);
assert.equal(isZeroMonzoImage([[1,1],[0,1]],[Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER]),false);
assert.equal(isZeroMonzoImage([[1,1],[0,1]],[0,0]),true);
assert.throws(()=>mapMonzo([[Number.MAX_SAFE_INTEGER,0]],[2,0]),/safe integer range/);
assert.throws(()=>mapMonzo([[1,0],[0,1]],[1]),/width/);
assert.throws(()=>mapMonzo([[1,0],[0,1]],[0.5,1]),/safe integer/);
assert.throws(()=>mapMonzo([[1,0],[0,1]],[Number.MAX_SAFE_INTEGER+1,1]),/safe integer/);

for(const ratio of ['0/1','-1/2','1/0','1.5/2','',`1/${MAX_FACTOR_COMPONENT+1}`])assert.throws(()=>ratioMonzo(ratio,meantoneBasis));
assert.throws(()=>ratioMonzo(Number.MAX_SAFE_INTEGER+1,meantoneBasis),/safe integer/);
assert.throws(()=>ratioMonzo(MAX_FACTOR_COMPONENT+1,meantoneBasis),/factorization bound/);
assert.throws(()=>ratioMonzo('5/4',[2,3,9]),/Unsupported basis prime/);
assert.throws(()=>ratioMonzo('5/4',[2,3,3]),/duplicate/);
assert.throws(()=>ratioMonzo('5/4',[2]),/two to ten/);
console.log('Exact bounded ratio monzos, basis diagnostics, JSON boundaries and BigInt matrix mapping passed.');
