import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeChord} from '../src/chords/chord-analysis.mjs';
import {DEFAULT_ODD_LIMIT, MANUAL_PRIME_LIMIT_VALUES} from '../src/core/ji-limit-engine.mjs';
const session = JSON.parse(
  readFileSync(new URL('./fixtures/magic19-session.json', import.meta.url))
);
let s = {...session.states[0], ...session.layoutScale};
assert.equal(DEFAULT_ODD_LIMIT, 15);
assert.deepEqual(MANUAL_PRIME_LIMIT_VALUES, [3, 5, 7, 11, 13]);
// Projection: mapping, tuning quality and cardinality of a chord in this temperament.
let p = analyzeChord(s, '4:5:6:7:9:11').projection;
assert.equal(p.basisStatus, 'mapped');
assert.equal(p.qualityStatus, 'within-tolerance');
assert.equal(p.originalCardinality, 6);
assert.equal(p.temperedCardinality, 6);
assert.notEqual(
  analyzeChord(s, '4:5:6:13').projection.basisStatus,
  'mapped',
  '13 is outside the 2.3.5.7.11 basis'
);
assert.throws(() => analyzeChord(s, 'bad'));
assert.equal(analyzeChord(s, '1:100/99').projection.cardinalityStatus, 'collapsed');
assert.equal(analyzeChord(s, '4:5:6', {tolerance: 0}).projection.qualityStatus, 'above-tolerance');
// Exact occurrences in the selected scale.
s = {...s, n: 21};
assert.ok(analyzeChord(s, '4:5:6:7:9:11').occurrences.completeOccurrences.length >= 1);
console.log('Chord analysis: limits, projection status and occurrences passed.');
