import assert from 'node:assert/strict';
import {makeState} from '../src/core/catalog.mjs';
import {chordIdentity} from '../src/chords/chord-identity.mjs';
import {harmonicIdentity} from '../src/harmonic/harmonic-equivalence.mjs';
import {buildShapeTargets} from '../src/shapes/shape-targets.mjs';

const state = makeState('meantone'),
  run = options =>
    buildShapeTargets({state, settings: {limit: 5}, yieldControl: async () => {}, ...options});
const explicit = await run({
  includeCatalogue: false,
  inputs: ['4:5:6', '5:6:8', '6:4:5:4', '1:81/80', '4:5:6:7'],
  sizes: [3]
});
assert.equal(explicit.complete, true);
assert.equal(explicit.targets.length, 5);
const byInput = input => explicit.targets.find(target => target.input === input);
assert.deepEqual(
  byInput('6:4:5:4').members.map(member => member.inputIndex),
  [0, 1, 2, 3]
);
assert.deepEqual(byInput('6:4:5:4').coordinates[1], byInput('6:4:5:4').coordinates[3]);
assert.equal(byInput('6:4:5:4').outsideFilters, true);
assert.equal(
  byInput('5:6:8').rootMember,
  2,
  'the family root in an inverted exact spelling is retained'
);
assert.equal(byInput('5:6:8').familyId, byInput('4:5:6').familyId);
assert.equal(byInput('1:81/80').outsideLimits, true);
assert.deepEqual(byInput('1:81/80').collisionGroups, [{coordinate: [0, 0], members: [0, 1]}]);
assert.equal(byInput('4:5:6:7').mappingStatus, 'outside-basis');
assert.ok(byInput('4:5:6:7').missingPrimes.includes(7));
assert.deepEqual(
  await run({
    state: {...state, g: state.g + 0.2, p: state.p + 0.1},
    includeCatalogue: false,
    inputs: ['4:5:6', '5:6:8', '6:4:5:4', '1:81/80', '4:5:6:7'],
    sizes: [3]
  }),
  explicit,
  'retuning does not alter the source universe'
);

const family = harmonicIdentity(chordIdentity('4:5:6'), 'octave').familyId;
const filtered = await run({sizes: [2, 3], familyIds: [family]});
assert.ok(filtered.targets.length > 0);
assert.ok(filtered.targets.every(target => target.familyId === family));
assert.equal(filtered.complete, true);
assert.equal((await run({sizes: [2, 3], familyIds: []})).targets.length, 0);
const exceptions = await run({sizes: [2], familyIds: [], inputs: ['4:5:6']});
assert.equal(exceptions.targets.length, 1);
assert.equal(exceptions.targets[0].outsideFilters, true);
const forms = await run({sizes: [3], form: 'utonal'});
assert.ok(forms.targets.length);
assert.ok(forms.targets.every(target => target.form === 'utonal'));

// The chord-space image producer drops these sources; the explorer must retain
// their identities before projection merges their voices into one physical key.
const collapsed = await run({settings: {limit: 81}, sizes: [2]});
assert.equal(collapsed.complete, true);
assert.ok(
  collapsed.targets.some(
    target => target.sourceKinds.includes('chord-space') && target.harmonicCollisionGroups.length
  ),
  'enumerated quotient-collision sources survive without needing a manual input'
);
assert.equal((await run({sizes: [2, 3], maxTargets: 1})).reason, 'target-limit');
let cancel = false;
const cancelled = await run({
  shouldCancel: () => cancel,
  yieldControl: async () => {
    cancel = true;
  }
});
assert.equal(cancelled.reason, 'cancelled');
assert.equal(cancelled.complete, false);
await assert.rejects(run({sizes: [9]}), /two through eight/);
await assert.rejects(run({inputs: ['1:2:3:4:5:6:7:8:9']}), /two to eight/);
await assert.rejects(run({form: 'not-a-form'}), /supported chord form/);
console.log(
  'Shape sources preserve exact voices, collapsed interpretations, directory filters, explicit exceptions and tuning independence.'
);
