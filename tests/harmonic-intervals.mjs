import assert from 'node:assert/strict';
import {makeState,primeFilterForBasis,targetSet} from '../dist/engine.mjs';
import {mappingContext} from '../dist/harmonic-context.mjs';
import {mappedIntervals,indexByCoordinate,edgeInterpretations,intervalError} from '../dist/harmonic-intervals.mjs';
import {ratioMonzo,mapMonzo} from '../dist/ji-monzo.mjs';

const meantone=makeState('meantone'),subgroup=meantone.basis;
const spec={oddLimit:97,primeFilter:null,mappingSubgroup:subgroup,representationPolicy:'octave'};
const targets=targetSet(spec),context=mappingContext(meantone),records=mappedIntervals(targets,context);
const find=label=>records.find(record=>record.ratio.label===label);
const ninth=find('9/8'),tenNinth=find('10/9'),comma=find('81/80'),unison=find('1/1'),outside=find('7/4');
assert.ok(ninth&&tenNinth&&comma&&unison&&outside);
assert.deepEqual(ninth.coordinate,[-1,2]);
assert.deepEqual(tenNinth.coordinate,[-1,2]);
assert.equal(ninth.fullKey,tenNinth.fullKey);
assert.notEqual(ninth.targetId,tenNinth.targetId,'enharmonic mapped targets retain distinct JI identities');
assert.deepEqual(outside.missingPrimes,[7]);
assert.equal(outside.coordinate,null);
assert.equal(outside.fullKey,null);
assert.equal(outside.classKeys.exact.available,false);
assert.equal(unison.coordinate[0],0);
assert.ok(Object.isFrozen(records)&&Object.isFrozen(ninth.classKeys));

const exactIndex=indexByCoordinate(records);
const aliases=edgeInterpretations(exactIndex,[-1,2]);
assert.ok(aliases.some(record=>record.targetId===ninth.targetId));
assert.ok(aliases.some(record=>record.targetId===tenNinth.targetId));
assert.deepEqual(edgeInterpretations(exactIndex,[900,900]),[]);
assert.throws(()=>edgeInterpretations(exactIndex,[0,0.5]),/integer/);
const unisonAliases=edgeInterpretations(exactIndex,[0,0]);
assert.ok(unisonAliases.some(record=>record.targetId===comma.targetId));
assert.ok(unisonAliases.some(record=>record.targetId===unison.targetId),'unison and a nonzero comma target remain separate interpretations');

const meantoneTuning={mappingId:context.id,id:'meantone-reference',periodCents:meantone.p,generatorCents:meantone.g};
const ninthError=intervalError(ninth,meantoneTuning),tenNinthError=intervalError(tenNinth,meantoneTuning);
assert.equal(ninthError.temperedCents,tenNinthError.temperedCents);
assert.notEqual(ninthError.idealCents,tenNinthError.idealCents);
assert.notEqual(ninthError.signedErrorCents,tenNinthError.signedErrorCents,'one tempered interval can carry different JI target errors');
assert.equal(intervalError(outside,meantoneTuning).mapped,false);
assert.throws(()=>intervalError(ninth,{...meantoneTuning,mappingId:'another-map'}),/does not match/);
assert.notDeepEqual(intervalError(ninth,{...meantoneTuning,id:'new-tuning',generatorCents:meantone.g+1}),ninthError,'tuning recomputes errors');

const periodIndex=indexByCoordinate(records,{equivalence:'period'});
assert.ok(edgeInterpretations(periodIndex,[-1,2]).some(record=>record.targetId===ninth.targetId));
const octaveIndex=indexByCoordinate(records,{equivalence:'octave'});
assert.ok(edgeInterpretations(octaveIndex,[-1,2]).some(record=>record.targetId===tenNinth.targetId));
assert.throws(()=>indexByCoordinate([...records,{...records[0],mappingId:'other'}]),/mix mapping contexts/);

const edo={...meantoneTuning,id:'coincident-edo',periodCents:1200,generatorCents:600};
assert.equal(intervalError(ninth,edo).temperedCents,intervalError(comma,edo).temperedCents,'tuning coincidence is acoustic only');
assert.notDeepEqual(ninth.coordinate,comma.coordinate);
assert.notEqual(ninth.fullKey,comma.fullKey);
assert.ok(edgeInterpretations(exactIndex,[-1,2]).some(record=>record.targetId===ninth.targetId));
assert.ok(edgeInterpretations(exactIndex,[0,0]).some(record=>record.targetId===comma.targetId));

const tritave={basis:[3,5,7],rows:[[1,0,0],[0,1,2]]},tritaveContext=mappingContext(tritave);
const nativeSpec={oddLimit:15,primeFilter:[3,5,7],mappingSubgroup:[3,5,7],representationPolicy:'native-exact'};
const native=mappedIntervals(targetSet(nativeSpec),tritaveContext),three=native.find(record=>record.ratio.label==='3/1');
assert.deepEqual(three.coordinate,[1,0]);
assert.equal(native.find(record=>record.ratio.label==='3/5').coordinate!==null,true);
assert.equal(native.find(record=>record.ratio.label==='3/2'),undefined);
assert.equal(native.every(record=>record.registerPolicy==='native-exact'),true);
assert.throws(()=>indexByCoordinate(native,{equivalence:'octave'}),/No octave quotient policy/);
const tritavePeriod=1200*Math.log2(3),periodError=intervalError(three,{mappingId:tritaveContext.id,periodCents:tritavePeriod,generatorCents:700});
assert.ok(Math.abs(periodError.signedErrorCents)<1e-9,'mapped non-octave period uses actual period tuning');
assert.ok(Math.abs(intervalError(three,{mappingId:tritaveContext.id,periodCents:1200,generatorCents:700}).signedErrorCents)>500,'does not substitute 1200 cents for the temperament period');

const swapped=ratioMonzo('10/9',meantone.basis);
assert.deepEqual(mapMonzo(meantone.rows,swapped.basisMonzo),[-1,2]);
console.log('Mapped interval identities, enharmonic index, tuning errors and non-octave behavior passed.');
