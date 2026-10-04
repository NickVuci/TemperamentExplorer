import assert from 'node:assert/strict';
import {diamondTargets,mapRatio,targetId,targetSet,targetSetIdentity,targets,validateJILimits,primeFilterForBasis} from '../dist/engine.mjs';
import {targetSetKey} from '../dist/harmonic-types.mjs';

const spec={oddLimit:3,primeFilter:null,mappingSubgroup:[2,3],representationPolicy:'octave'};
const set=targetSet(spec);
assert.equal(set.id,targetSetIdentity(spec));
assert.deepEqual(set.targets.map(target=>target.ratio.label),['1/1','4/3','3/2']);
assert.equal(set.completeness.complete,true);
assert.equal(set.completeness.sourcePairCount,4);
assert.equal(set.targets[0].sourcePairs.length,2,'all odd-axis unison cells are retained as one target');
assert.deepEqual(set.targets.find(t=>t.ratio.label==='3/2').sourcePairs,[
 {numeratorIndex:1,denominatorIndex:0,numerator:3,denominator:1,octaveLift:1},
]);
assert.equal(set.targets.find(t=>t.ratio.label==='4/3').sourcePairs[0].octaveLift,-2);
assert.equal(set.targets.every(t=>Object.isFrozen(t)&&Object.isFrozen(t.sourcePairs)),true);
assert.equal(targetId(spec,'3/1'),targetId(spec,{n:3,d:2}),'octave policy folds an exact target identity consistently');
assert.notEqual(targetId(spec,'3/1'),targetId({...spec,oddLimit:5},'3/1'));
assert.notEqual(targetSetIdentity(spec),targetSetIdentity({...spec,mappingSubgroup:[3,5]}));
assert.notEqual(targetSetIdentity(spec),targetSetIdentity({...spec,primeFilter:[3]}));
assert.throws(()=>targetSet({...spec,mappingSubgroup:[]}),/Prime subgroup/);
assert.throws(()=>targetSet({...spec,mappingSubgroup:11}),/actual prime subgroup as an explicit array/,'a simple prime-limit shorthand must not replace an incomplete temperament subgroup');

const limit5=targetSet({...spec,oddLimit:5});
for(const ratio of ['4/3','3/2','5/4','6/5','5/3'])assert.ok(limit5.targets.some(t=>t.ratio.label===ratio),`${ratio} in shared odd-axis enumeration`);
for(const oddLimit of [3,15,97]){
 const bounded=targetSet({...spec,oddLimit});
 assert.equal(bounded.completeness.sourcePairCount,((oddLimit+1)/2)**2);
 assert.ok(bounded.targets.some(t=>t.ratio.label==='1/1'));
 assert.ok(bounded.targets.every(t=>t.sourcePairs.every(pair=>pair.numerator<=oddLimit&&pair.denominator<=oddLimit)));
}

const inverseClosed=targetSet({...spec,oddLimit:15});
const labels=new Set(inverseClosed.targets.map(t=>t.ratio.label));
for(const target of inverseClosed.targets){
 const n=target.ratio.n,d=target.ratio.d;
 const reciprocal=targetId({...spec,oddLimit:15},{n:d,numerator:d,d});
 assert.ok(labels.has(reciprocal.slice(reciprocal.lastIndexOf(':ratio:')+7)),`inverse of ${n}/${d} is included`);
}

const subgroup=[2,3,5,11],filter=primeFilterForBasis(subgroup);
const restricted=targetSet({oddLimit:15,primeFilter:filter,mappingSubgroup:subgroup,representationPolicy:'octave'});
assert.ok(restricted.targets.some(t=>t.ratio.label==='11/8'&&t.inMappingSubgroup));
assert.ok(!restricted.targets.some(t=>t.ratio.label==='7/4'),'omitted 7 is excluded by the explicit subgroup filter');
const widened=targetSet({oddLimit:15,primeFilter:null,mappingSubgroup:subgroup,representationPolicy:'octave'});
assert.ok(widened.targets.some(t=>t.ratio.label==='7/4'&&!t.inMappingSubgroup),'unfiltered display can retain outside-subgroup targets without claiming they map');
assert.equal(targetSetKey({...spec,mappingSubgroup:[3,2]}),targetSetKey({...spec,mappingSubgroup:[2,3]}));
assert.deepEqual(validateJILimits({oddLimit:15,primeLimit:filter}).primeLimit,subgroup);

const nonOctave={basis:[3,5,7],rows:[[1,0,0],[0,1,2]]},nativeSpec={oddLimit:15,primeFilter:[3,5,7],mappingSubgroup:nonOctave.basis,representationPolicy:'native-exact'};
const nativeTargets=targetSet(nativeSpec),nativeLabels=new Set(nativeTargets.targets.map(t=>t.ratio.label));
assert.ok(nativeLabels.has('3/1')&&nativeLabels.has('5/3'));
assert.ok(!nativeLabels.has('3/2')&&!nativeLabels.has('2/1'),'native target set introduces no powers of two');
assert.ok(nativeTargets.targets.every(t=>t.ratio.n%2===1&&t.ratio.d%2===1&&t.sourcePairs.every(p=>p.octaveLift===0)));
assert.ok(nativeTargets.targets.find(t=>t.ratio.label==='3/1').inMappingSubgroup);
assert.ok(nativeTargets.targets.find(t=>t.ratio.label==='5/3').inMappingSubgroup);
assert.ok(['3/5','3/7','5/7'].every(label=>nativeLabels.has(label)),'native target pairs from the subgroup remain eligible');
for(const item of nativeTargets.targets){const reciprocal=targetId(nativeSpec,{n:item.ratio.d,d:item.ratio.n});assert.ok(nativeLabels.has(reciprocal.slice(reciprocal.lastIndexOf(':ratio:')+7)));}
assert.deepEqual(mapRatio(3,1,nonOctave),[1,0]);
assert.deepEqual(mapRatio(5,3,nonOctave),[-1,1]);
assert.equal(mapRatio(3,2,nonOctave),null,'octave ratio remains outside the actual subgroup');
assert.notEqual(nativeTargets.id,targetSet({...nativeSpec,representationPolicy:'octave'}).id,'representation policy changes target identity');
assert.ok(!diamondTargets(15,[3,5,7]).some(t=>t.label==='3/2'),'existing octave diamond keeps its unavailable 2-based cell');

assert.deepEqual(targets(5).map(t=>t.label),['6/5','5/4','4/3','3/2','8/5','5/3'],'legacy target array and sort order remain unchanged');
console.log('Shared octave target sets preserve identities, all source pairs and legacy target ordering.');
