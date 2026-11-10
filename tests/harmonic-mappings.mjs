import assert from 'node:assert/strict';
import {makeState} from '../src/core/catalog.mjs';
import {validateMappingVariant} from '../src/harmonic/harmonic-mappings.mjs';
import {mappingContext} from '../src/harmonic/harmonic-context.mjs';

const meantone = makeState('meantone');
mappingContext(meantone);

const same = validateMappingVariant(meantone, {
  mapping: {
    basis: [2, 5, 3],
    rows: [
      [1, 0, 1],
      [0, 4, 1]
    ]
  }
});
assert.equal(same.status, 'compatible');
assert.equal(same.relation, 'same-map', 'paired basis-column reordering keeps the same mapping ID');
assert.equal(same.alternative, false);

const rebased = validateMappingVariant(meantone, {
  mapping: {
    basis: [2, 3, 5],
    rows: [
      [1, 2, 4],
      [0, 1, 4]
    ]
  }
});
assert.equal(rebased.relation, 'coordinate-rebase');
assert.deepEqual(rebased.rebaseMatrix, [
  [1, 1],
  [0, 1]
]);
assert.equal(
  rebased.alternative,
  false,
  'a unimodular coordinate change is not a second musical mapping'
);

const exactFifth = validateMappingVariant(meantone, {
  assignments: [{ratio: '5/4', coordinate: [-2, 4]}]
});
assert.equal(exactFifth.status, 'compatible');
assert.equal(exactFifth.relation, 'same-map');
assert.equal(exactFifth.targetReports[0].baseStatus, 'mapped');
assert.deepEqual(exactFifth.targetReports[0].alternativesWithinFixedMapping, []);
assert.deepEqual(
  exactFifth.alternativesWithinFixedMapping,
  [],
  'a fixed in-basis target has no alternate image under the same map'
);

const fifthConflict = validateMappingVariant(meantone, {
  assignments: [{ratio: '5/4', coordinate: [0, 0]}]
});
assert.equal(fifthConflict.status, 'conflict');
assert.equal(fifthConflict.relation, 'conflict');
assert.equal(fifthConflict.validation.status, 'conflict');

const extensionA = validateMappingVariant(meantone, {
  assignments: [{ratio: '7/4', coordinate: [-5, 10]}]
});
const extensionB = validateMappingVariant(meantone, {
  assignments: [{ratio: '7/4', coordinate: [2, -2]}]
});
assert.equal(extensionA.status, 'compatible');
assert.equal(extensionB.status, 'compatible');
assert.equal(extensionA.relation, 'preserved-column-extension');
assert.equal(extensionB.relation, 'preserved-column-extension');
assert.notEqual(extensionA.candidateMappingId, extensionB.candidateMappingId);
assert.deepEqual(
  extensionA.preservedColumns.map(column => column.prime),
  [2, 3, 5]
);
assert.deepEqual(extensionA.addedPrimes, [7]);
assert.deepEqual(extensionA.candidateContext.rows[0], [1, 1, 0, -3]);
assert.deepEqual(extensionA.candidateContext.rows[1], [0, 1, 4, 10]);
assert.deepEqual(extensionB.candidateContext.rows[0], [1, 1, 0, 4]);
assert.deepEqual(extensionB.candidateContext.rows[1], [0, 1, 4, -2]);

const unresolved = validateMappingVariant(meantone, {
  assignments: [{ratio: '77/32', coordinate: [0, 0]}]
});
assert.equal(
  unresolved.status,
  'unresolved',
  'one relation involving two absent primes cannot determine both columns'
);
assert.equal(unresolved.relation, 'unresolved');
assert.match(unresolved.validation.message, /More assignments needed/);

const fractional = validateMappingVariant(meantone, {
  assignments: [{ratio: '7/4', coordinate: [-4.5, 10]}]
});
assert.equal(fractional.status, 'conflict');
assert.equal(fractional.validation.reason, 'invalid-coordinate');

const changed = validateMappingVariant(meantone, {
  mapping: {
    basis: [2, 3, 5],
    rows: [
      [1, 1, 1],
      [0, 1, 4]
    ]
  }
});
assert.equal(changed.status, 'compatible');
assert.equal(changed.relation, 'changed-mapping');
assert.equal(changed.alternative, true);
assert.deepEqual(
  changed.changedColumns.map(column => column.prime),
  [5]
);
const changedAssignment = validateMappingVariant(meantone, {
  mapping: changed.candidateContext,
  assignments: [{ratio: '5/4', coordinate: [-1, 4]}]
});
assert.equal(
  changedAssignment.status,
  'compatible',
  'explicit target assignments are checked against the candidate context'
);
assert.equal(changedAssignment.relation, 'changed-mapping');
assert.equal(
  validateMappingVariant(meantone, {
    mapping: changed.candidateContext,
    assignments: [{ratio: '5/4', coordinate: [0, 0]}]
  }).status,
  'conflict'
);

console.log('Alternative mapping classification and exact extensions passed.');
