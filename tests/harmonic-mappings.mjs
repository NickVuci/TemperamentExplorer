import assert from 'node:assert/strict';
import {makeState} from '../src/core/engine.mjs';
import {validateMappingVariant,previewMappingVariant} from '../src/harmonic/harmonic-mappings.mjs';
import {mappingContext} from '../src/harmonic/harmonic-context.mjs';

const meantone=makeState('meantone');
const active=mappingContext(meantone);

const same=validateMappingVariant(meantone,{mapping:{basis:[2,5,3],rows:[[1,0,1],[0,4,1]]}});
assert.equal(same.status,'compatible');
assert.equal(same.relation,'same-map','paired basis-column reordering keeps the same mapping ID');
assert.equal(same.alternative,false);

const rebased=validateMappingVariant(meantone,{mapping:{basis:[2,3,5],rows:[[1,2,4],[0,1,4]]}});
assert.equal(rebased.relation,'coordinate-rebase');
assert.deepEqual(rebased.rebaseMatrix,[[1,1],[0,1]]);
assert.equal(rebased.alternative,false,'a unimodular coordinate change is not a second musical mapping');

const exactFifth=validateMappingVariant(meantone,{assignments:[{ratio:'5/4',coordinate:[-2,4]}]});
assert.equal(exactFifth.status,'compatible');
assert.equal(exactFifth.relation,'same-map');
assert.equal(exactFifth.targetReports[0].baseStatus,'mapped');
assert.deepEqual(exactFifth.targetReports[0].alternativesWithinFixedMapping,[]);
assert.deepEqual(exactFifth.alternativesWithinFixedMapping,[],'a fixed in-basis target has no alternate image under the same map');

const fifthConflict=validateMappingVariant(meantone,{assignments:[{ratio:'5/4',coordinate:[0,0]}]});
assert.equal(fifthConflict.status,'conflict');
assert.equal(fifthConflict.relation,'conflict');
assert.equal(fifthConflict.validation.status,'conflict');

const extensionA=validateMappingVariant(meantone,{assignments:[{ratio:'7/4',coordinate:[-5,10]}]});
const extensionB=validateMappingVariant(meantone,{assignments:[{ratio:'7/4',coordinate:[2,-2]}]});
assert.equal(extensionA.status,'compatible');
assert.equal(extensionB.status,'compatible');
assert.equal(extensionA.relation,'preserved-column-extension');
assert.equal(extensionB.relation,'preserved-column-extension');
assert.notEqual(extensionA.candidateMappingId,extensionB.candidateMappingId);
assert.deepEqual(extensionA.preservedColumns.map(column=>column.prime),[2,3,5]);
assert.deepEqual(extensionA.addedPrimes,[7]);
assert.deepEqual(extensionA.candidateContext.rows[0],[1,1,0,-3]);
assert.deepEqual(extensionA.candidateContext.rows[1],[0,1,4,10]);
assert.deepEqual(extensionB.candidateContext.rows[0],[1,1,0,4]);
assert.deepEqual(extensionB.candidateContext.rows[1],[0,1,4,-2]);

const unresolved=validateMappingVariant(meantone,{assignments:[{ratio:'77/32',coordinate:[0,0]}]});
assert.equal(unresolved.status,'unresolved','one relation involving two absent primes cannot determine both columns');
assert.equal(unresolved.relation,'unresolved');
assert.match(unresolved.validation.message,/More assignments needed/);

const fractional=validateMappingVariant(meantone,{assignments:[{ratio:'7/4',coordinate:[-4.5,10]}]});
assert.equal(fractional.status,'conflict');
assert.equal(fractional.validation.reason,'invalid-coordinate');

const changed=validateMappingVariant(meantone,{mapping:{basis:[2,3,5],rows:[[1,1,1],[0,1,4]]}});
assert.equal(changed.status,'compatible');
assert.equal(changed.relation,'changed-mapping');
assert.equal(changed.alternative,true);
assert.deepEqual(changed.changedColumns.map(column=>column.prime),[5]);
const changedAssignment=validateMappingVariant(meantone,{mapping:changed.candidateContext,
 assignments:[{ratio:'5/4',coordinate:[-1,4]}]});
assert.equal(changedAssignment.status,'compatible','explicit target assignments are checked against the candidate context');
assert.equal(changedAssignment.relation,'changed-mapping');
assert.equal(validateMappingVariant(meantone,{mapping:changed.candidateContext,
 assignments:[{ratio:'5/4',coordinate:[0,0]}]}).status,'conflict');

const candidateSnapshot=JSON.stringify(extensionA.candidateContext),activeSnapshot=JSON.stringify(meantone);
const chordPreview=previewMappingVariant(meantone,extensionA,'4:5:6');
assert.equal(chordPreview.status,'fully-mapped');
assert.equal(chordPreview.identityId,'ji2:1/1:5/4:3/2');
assert.equal(chordPreview.members.length,3);
assert.equal(chordPreview.pairs.length,3);
assert.ok(chordPreview.pairs.every(pair=>pair.consistent===true));
assert.equal(chordPreview.tuningErrors,null,'mapping preview does not invent a candidate tuning');
assert.equal(JSON.stringify(extensionA.candidateContext),candidateSnapshot);
assert.equal(JSON.stringify(meantone),activeSnapshot,'preview leaves the active temperament state untouched');
assert.throws(()=>previewMappingVariant(makeState('porcupine11'),extensionA,'4:5:6'),/different active context/);

const septimalPreview=previewMappingVariant(meantone,extensionA,'1:7/4');
assert.deepEqual(septimalPreview.members[1].coordinate,[-5,10]);
const changedPreview=previewMappingVariant(meantone,changedAssignment,'4:5:6');
assert.deepEqual(changedPreview.members[1].coordinate,[-1,4]);
assert.ok(changedPreview.pairs.every(pair=>pair.consistent===true));
console.log('Alternative mapping classification, exact extensions and pure chord previews passed.');
