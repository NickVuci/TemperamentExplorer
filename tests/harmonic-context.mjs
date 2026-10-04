import assert from 'node:assert/strict';
import {fromCommas} from '../dist/tuning.mjs';
import {makeState,presets} from '../dist/engine.mjs';
import {mappingContext,mappingKey,isKernelVector,validateKernelWitness} from '../dist/harmonic-context.mjs';
import {ratioMonzo} from '../dist/ji-monzo.mjs';

const meantone=makeState('meantone'),context=mappingContext(meantone);
assert.deepEqual(context.basis,[2,3,5]);
assert.deepEqual(context.rows,[[1,1,0],[0,1,4]]);
assert.deepEqual(context.canonicalBasis,[2,3,5]);
assert.equal(context.coordinateConvention,'period-generator');
assert.equal(context.id,mappingKey(meantone));
assert.ok(Object.isFrozen(context)&&Object.isFrozen(context.rows[0]));
assert.equal(Object.hasOwn(context,'p'),false);
assert.equal(Object.hasOwn(context,'commas'),false);

const comma=ratioMonzo('81/80',context.basis).basisMonzo;
assert.deepEqual(comma,[-4,4,-1]);
assert.equal(isKernelVector(context,comma),true);
assert.deepEqual(validateKernelWitness(context,comma),{
 valid:true,mappingKey:context.id,monzo:[-4,4,-1],image:[0,0],
 numerator:'81',denominator:'80',ratio:'81/80',
});
const scaledComma=ratioMonzo('6561/6400',context.basis).basisMonzo;
assert.deepEqual(scaledComma,[-8,8,-2]);
assert.equal(isKernelVector(context,scaledComma),true);
assert.equal(validateKernelWitness(context,scaledComma).ratio,'6561/6400');
const redundantInput=fromCommas('81/80,6561/6400','2.3.5');
assert.equal(mappingKey(redundantInput),context.id);

const nonKernel=ratioMonzo('128/125',context.basis).basisMonzo;
assert.deepEqual(nonKernel,[7,0,-3]);
assert.equal(isKernelVector(context,nonKernel),false);
assert.equal(isKernelVector(context,[Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER,0]),false,'large nonzero images remain decidable without unsafe coordinate conversion');
assert.deepEqual(validateKernelWitness(context,nonKernel),{
 valid:false,reason:'not-in-kernel',mappingKey:context.id,monzo:[7,0,-3],image:[7,-12],
});
const edoTuned={...meantone,p:1200,g:700,n:31,mode:7};
assert.equal(7*edoTuned.p-12*edoTuned.g,0,'128/125 happens to have a zero-cent image in this EDO tuning');
assert.equal(isKernelVector(edoTuned,nonKernel),false,'cent coincidence does not imply kernel membership');
assert.equal(mappingKey(edoTuned),context.id,'tuning and scale do not change mapping identity');

const permuted={basis:[2,5,3],rows:[[1,0,1],[0,4,1]]};
const permutedContext=mappingContext(permuted);
assert.deepEqual(permutedContext.basis,[2,5,3]);
assert.deepEqual(permutedContext.rows,[[1,0,1],[0,4,1]]);
assert.equal(mappingKey(permutedContext),context.id,'paired basis-column permutation preserves the key');
const changedColumn={basis:[2,3,5],rows:[[1,1,1],[0,1,4]]};
assert.notEqual(mappingKey(changedColumn),context.id);
assert.equal(mappingKey({...meantone,commas:'arbitrary text',tuning:'EDO'}),context.id);
assert.equal(mappingKey({basis:meantone.basis,rows:meantone.rows,commas:'omitted'}),context.id);

const pajara=presets.pajara7;
const pajaraContext=mappingContext({basis:pajara.basis,rows:pajara.rows});
assert.equal(pajaraContext.rows[0][0],2);
assert.equal(isKernelVector(pajaraContext,ratioMonzo('50/49',pajara.basis).basisMonzo),true);
assert.equal(isKernelVector(pajaraContext,ratioMonzo('64/63',pajara.basis).basisMonzo),true);

assert.throws(()=>mappingContext({basis:[2,3,3],rows:[[1,1,0],[0,1,4]]}),/distinct basis primes/);
assert.throws(()=>mappingContext({basis:[2,3,5],rows:[[1,1],[0,1]]}),/two integer mapping rows/);
assert.throws(()=>isKernelVector(context,[-4,4]),/length must match/);
assert.throws(()=>validateKernelWitness(context,[-1001,1001,0]),/within ±1000/);
console.log('Canonical mapping contexts, exact kernel witnesses and tuning-independent keys passed.');
