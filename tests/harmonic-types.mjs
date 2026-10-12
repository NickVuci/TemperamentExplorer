import assert from 'node:assert/strict';
import {makeState, presets} from '../src/core/catalog.mjs';
import {mappingContext} from '../src/harmonic/harmonic-context.mjs';
import {equivalencePolicy, shapeKey} from '../src/harmonic/harmonic-equivalence.mjs';
import {
  canonicalHarmonicJSON,
  harmonicMappingKey,
  tuningKey,
  targetSetKey,
  scaleContextKey,
  harmonicLayoutKey,
  validateMappingContext,
  validateTemperedShape,
  validateHarmonicSelection,
  validateAssessment
} from '../src/harmonic/harmonic-types.mjs';

const state = makeState('meantone'),
  context = mappingContext(state),
  mappingId = context.id;
assert.deepEqual(validateMappingContext(context), context);
assert.ok(Object.isFrozen(validateMappingContext(context).rows[0]));
assert.throws(() => validateMappingContext({...context, id: 'wrong'}), /ID does not match/);
assert.equal(harmonicMappingKey({...state, p: state.p + 1, n: 19, mode: 2}), mappingId);
assert.equal(
  harmonicMappingKey({
    basis: [2, 5, 3],
    rows: [
      [1, 0, 1],
      [0, 4, 1]
    ]
  }),
  mappingId
);

const tuning = tuningKey({mappingId, periodCents: state.p, generatorCents: state.g});
assert.equal(tuning, tuningKey({generatorCents: state.g, mappingId, periodCents: state.p}));
assert.notEqual(
  tuning,
  tuningKey({mappingId, periodCents: state.p, generatorCents: state.g + 0.01})
);
const target = targetSetKey({
  mappingSubgroup: [5, 2, 3],
  oddLimit: 15,
  primeFilter: [5, 2, 3],
  representationPolicy: 'octave'
});
assert.equal(
  target,
  targetSetKey({
    mappingSubgroup: [2, 3, 5],
    oddLimit: 15,
    primeFilter: [2, 3, 5],
    representationPolicy: 'octave'
  })
);
assert.notEqual(
  target,
  targetSetKey({
    mappingSubgroup: [2, 3, 5],
    oddLimit: 17,
    primeFilter: [2, 3, 5],
    representationPolicy: 'octave'
  })
);
assert.notEqual(
  target,
  targetSetKey({
    mappingSubgroup: [2, 3, 5],
    oddLimit: 15,
    primeFilter: [2, 3, 5],
    representationPolicy: 'native-exact'
  })
);
assert.equal(
  target,
  targetSetKey({
    mappingSubgroup: [2, 3, 5],
    oddLimit: 15,
    primeFilter: 5,
    representationPolicy: 'octave'
  }),
  'prime-limit shorthand and its exact subgroup have the same meaning'
);
assert.throws(
  () =>
    targetSetKey({
      mappingSubgroup: [2, 3, 5],
      oddLimit: 15,
      primeFilter: [2, 4],
      representationPolicy: 'octave'
    }),
  /prime/i
);

const notes = [
  [0, 0],
  [0, 1],
  [1, 0]
];
const scale = scaleContextKey({mappingId, coordinates: notes, mode: 0});
assert.notEqual(scale, scaleContextKey({mappingId, coordinates: notes, mode: 1}));
assert.notEqual(
  scale,
  scaleContextKey({
    mappingId,
    coordinates: [
      [0, 0],
      [0, 2],
      [1, 0]
    ],
    mode: 0
  })
);
const layout = harmonicLayoutKey({scaleId: scale, config: {ap: 1, bg: 2, periodWrapping: true}});
assert.equal(
  layout,
  harmonicLayoutKey({scaleId: scale, config: {periodWrapping: true, bg: 2, ap: 1}})
);
assert.notEqual(
  layout,
  harmonicLayoutKey({scaleId: scale, config: {ap: 1, bg: 2, periodWrapping: false}})
);
assert.notEqual(
  layout,
  harmonicLayoutKey({
    scaleId: scaleContextKey({mappingId, coordinates: notes, mode: 1}),
    config: {ap: 1, bg: 2, periodWrapping: true}
  })
);
assert.equal(
  tuning,
  tuningKey({mappingId, periodCents: state.p, generatorCents: state.g}),
  'scale/layout changes do not change tuning key'
);
assert.equal(
  target,
  targetSetKey({
    mappingSubgroup: [2, 3, 5],
    oddLimit: 15,
    primeFilter: [2, 3, 5],
    representationPolicy: 'octave'
  }),
  'scale/layout/tuning changes do not change targets'
);
assert.equal(canonicalHarmonicJSON({z: 1, a: {b: 2, a: 3}}), '{"a":{"a":3,"b":2},"z":1}');
assert.throws(() => canonicalHarmonicJSON({ratio: 1n}), /plain object|value/);
assert.throws(() => canonicalHarmonicJSON({n: Number.MAX_SAFE_INTEGER + 1}), /plain object|value/);
const cycle = {};
cycle.self = cycle;
assert.throws(() => canonicalHarmonicJSON(cycle), /circular/);

const policy = equivalencePolicy(context, 'octave'),
  points = [
    [0, 0],
    [-2, 4],
    [0, 1]
  ];
const shape = {
  id: shapeKey(policy, points),
  mappingId,
  equivalence: policy,
  coordinatesOrClasses: points,
  sourceMemberLinks: [{inputIndex: 0, memberIndex: 0}],
  cardinalities: [1, 1, 1]
};
assert.deepEqual(structuredClone(validateTemperedShape(shape)), JSON.parse(JSON.stringify(shape)));
assert.throws(
  () => validateTemperedShape({...shape, mappingId: 'other-map'}),
  /equivalence\/mapping mismatch/
);
assert.throws(
  () => validateTemperedShape({...shape, cardinalities: [1, 0, 1]}),
  /positive cardinalities/
);

const selection = {
  version: 1,
  mappingId,
  harmonicId: 'ji-family-v1:sample',
  shapeId: shape.id,
  source: 'diamond',
  assessmentContext: {mappingId, targetSetId: target, equivalence: 'octave'},
  voicing: {shapeId: shape.id, voices: [{memberId: 'm0', coordinate: [0, 0], registerLift: 0}]}
};
const checked = validateHarmonicSelection(selection);
assert.deepEqual(structuredClone(checked), JSON.parse(JSON.stringify(selection)));
assert.ok(Object.isFrozen(checked.voicing.voices[0]));
assert.throws(
  () =>
    validateHarmonicSelection({
      ...selection,
      assessmentContext: {...selection.assessmentContext, mappingId: 'other'}
    }),
  /different mapping ID/
);
assert.throws(
  () =>
    validateHarmonicSelection({...selection, voicing: {...selection.voicing, shapeId: 'other'}}),
  /different shape ID/
);
assert.throws(
  () =>
    validateHarmonicSelection({
      ...selection,
      voicing: {
        ...selection.voicing,
        voices: [{memberId: 'm0', coordinate: [0, 0], registerLift: 0.5}]
      }
    }),
  /register lift/
);
assert.throws(
  () =>
    validateHarmonicSelection({
      ...selection,
      voicing: {
        ...selection.voicing,
        voices: [{memberId: 'm0', coordinate: [0, 0], registerLift: 1n}]
      }
    }),
  /register lift/
);
assert.throws(
  () => validateHarmonicSelection({version: 1, mappingId, source: 'diamond'}),
  /needs a harmonic or shape ID/
);

const base = {
  shapeId: shape.id,
  mappingId,
  targetSetId: target,
  equivalence: 'octave',
  exploredStates: 7,
  algorithmVersion: 'solver-v1'
};
const et = {
  ...base,
  status: 'essentially-tempered',
  complete: true,
  obstruction: {allEdgesNonempty: true, exhaustive: true, domainCounts: [2, 1, 1]}
};
assert.deepEqual(
  structuredClone(validateAssessment(et, {mappingId, targetSetId: target, shapeId: shape.id})),
  JSON.parse(JSON.stringify(et))
);
assert.throws(() => validateAssessment({...et, complete: false}), /complete nonempty dyads/);
assert.throws(
  () => validateAssessment({...et, obstruction: {allEdgesNonempty: true}}),
  /exhaustive search evidence/
);
assert.throws(() => validateAssessment(et, {targetSetId: 'old-limit'}), /context mismatch/);
assert.equal(
  validateAssessment({...et, mappingId: 'other'}).targetSetId,
  target,
  'JI target identity does not depend on a temperament matrix'
);
assert.deepEqual(validateAssessment({...base, status: 'unknown', complete: false}), {
  ...base,
  status: 'unknown',
  complete: false
});
assert.throws(
  () => validateAssessment({...base, status: 'unknown', complete: true}),
  /unknown assessment/
);
assert.deepEqual(
  validateAssessment({
    ...base,
    status: 'ji-liftable',
    complete: true,
    liftWitness: {vertices: ['1/1', '5/4', '3/2']}
  }).status,
  'ji-liftable'
);
assert.throws(
  () => validateAssessment({...base, status: 'ji-liftable', complete: true}),
  /lift witness/
);
assert.throws(
  () => validateAssessment({...base, status: 'ji-liftable', complete: true, liftWitness: null}),
  /lift witness/
);
assert.deepEqual(
  validateAssessment({
    ...base,
    status: 'not-dyadic',
    complete: true,
    obstruction: {emptyEdge: [0, 1]}
  }).status,
  'not-dyadic'
);
assert.throws(
  () => validateAssessment({...base, status: 'not-dyadic', complete: true}),
  /empty edge witness/
);
assert.throws(
  () =>
    validateAssessment({
      ...base,
      status: 'not-dyadic',
      complete: true,
      obstruction: {emptyEdge: []}
    }),
  /empty edge witness/
);
assert.throws(
  () =>
    validateAssessment({
      ...base,
      status: 'not-dyadic',
      complete: true,
      obstruction: {emptyEdge: [0, 0]}
    }),
  /empty edge witness/
);

mappingContext({
  basis: [3, 5, 7],
  rows: [
    [1, 0, 0],
    [0, 1, 2]
  ]
});
assert.notEqual(
  targetSetKey({
    mappingSubgroup: [3, 5, 7],
    oddLimit: 15,
    primeFilter: [3, 5, 7],
    representationPolicy: 'native-exact'
  }),
  target
);
assert.notEqual(
  targetSetKey({
    mappingSubgroup: [3, 5, 7],
    oddLimit: 15,
    primeFilter: [3, 5, 7],
    representationPolicy: 'octave'
  }),
  target
);
const divided = mappingContext({basis: presets.pajara7.basis, rows: presets.pajara7.rows});
assert.equal(validateMappingContext(divided).rows[0][0], 2);
console.log('Harmonic DTO boundaries and dependency-specific keys passed.');
