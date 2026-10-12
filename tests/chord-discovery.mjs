import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chordCandidates, withinJILimits, withinOddLimit} from '../src/chords/chord-discovery.mjs';
import {chordIdentity} from '../src/chords/chord-identity.mjs';
import {curatedJIChords, makeJIInterpretation} from '../src/harmonic/harmonic-ji-chords.mjs';
assert.ok(chordCandidates().length <= 256);
assert.equal(
  new Set(chordCandidates().map(c => c.identity.fingerprint)).size,
  chordCandidates().length
);
assert.deepEqual(
  chordCandidates().map(({identity, text, label, form, pairId}) => ({
    identity,
    text,
    label,
    form,
    pairId
  })),
  curatedJIChords().map(({identity, text, label, form, pairId}) => ({
    identity,
    text,
    label,
    form,
    pairId
  })),
  'compatibility wrapper projects the shared curated records into the old shape'
);
assert.equal(
  'interpretation' in chordCandidates()[0],
  false,
  'legacy consumers do not receive the richer catalogue payload'
);
const compatibility = chordCandidates().map(({identity, text, label, form, pairId}) => ({
  fingerprint: identity.fingerprint,
  text,
  label,
  form,
  pairId
}));
assert.equal(compatibility.length, 224);
assert.equal(
  createHash('sha256').update(JSON.stringify(compatibility)).digest('hex'),
  'ab3f6fb3ec16fd2ca3333c5f0651228fea5c37b8ffea7a6cdab43047b9b1ed92',
  'old candidate order, labels, forms, and pair IDs stay unchanged'
);
const triad = curatedJIChords().find(c => c.label === '4:5:6'),
  inversion = curatedJIChords().find(c => c.label === '5:6:8');
assert.notEqual(
  triad.identity.fingerprint,
  inversion.identity.fingerprint,
  'exact spellings remain separate'
);
assert.equal(triad.familyId, inversion.familyId, 'octave/register equivalents share a family');
assert.equal(triad.exactDualId, chordIdentity('1/6:1/5:1/4').fingerprint);
assert.equal(
  makeJIInterpretation(triad.interpretation.exactDual).exactDualId,
  triad.identity.fingerprint,
  'exact dual round trip'
);
assert.equal(triad.interpretation.preferredLabel, triad.label);
assert.equal(triad.provenance.kind, 'curated-seed');
const customIdentity = chordIdentity('1:31:97'),
  customProvenance = {kind: 'custom-input'};
const custom = makeJIInterpretation(customIdentity, {
  preferredLabel: 'custom 31–97',
  provenance: customProvenance
});
assert.equal(
  custom.presentationForm,
  null,
  'a general custom chord is not inferred to be otonal or utonal'
);
assert.equal(Object.isFrozen(customIdentity), false);
assert.equal(
  Object.isFrozen(customProvenance),
  false,
  'constructor does not freeze caller-owned input'
);
assert.equal(
  Object.isFrozen(chordCandidates()[0].identity),
  false,
  'rich records do not mutate the legacy candidate identity'
);
assert.ok(withinOddLimit(chordIdentity('4:5:6:7:9:11'), 11));
assert.ok(!withinOddLimit(chordIdentity('4:5:6:7:9:11'), 9));
assert.ok(withinJILimits(chordIdentity('4:5:6'), 11, 5));
assert.ok(!withinJILimits(chordIdentity('4:5:6'), 11, 3));
const porkypine = [2, 3, 5, 11];
assert.ok(withinJILimits(chordIdentity('8:11:12'), 15, porkypine));
assert.ok(!withinJILimits(chordIdentity('4:5:7'), 15, porkypine));

for (const text of ['4:5:6', '6:9:11', '4:6:7', '8:10:11:12']) {
  const identity = chordIdentity(text),
    pair = chordCandidates().filter(
      c =>
        c.pairId ===
        chordCandidates().find(c => c.identity.fingerprint === identity.fingerprint).pairId
    );
  assert.equal(pair.find(c => c.form === 'otonal').label, text);
  const reciprocal = '1/' + text.split(':').reverse().join(':');
  assert.equal(pair.find(c => c.form === 'utonal').label, reciprocal);
  assert.equal(
    chordIdentity(reciprocal).fingerprint,
    pair.find(c => c.form === 'utonal').identity.fingerprint
  );
}
