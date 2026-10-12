import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeState} from '../src/core/catalog.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {analyzeChord} from '../src/chords/chord-analysis.mjs';
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/magic19-session.json', import.meta.url))
);
// The frozen corpus names the 128/125 state 'From commas'; it now resolves to the built-in Augmented preset, same mapping and tuning.
const states = [
  ...['meantone', 'magic11', 'miracle11', 'pajara11', 'dreamtone'].map(makeState),
  {...fixture.states[0], ...fixture.layoutScale},
  {...fixture.states[0], n: 21, mode: 10},
  {...fixture.states[0], n: 22, mode: 0},
  {...makeState('meantone'), g: 700, n: 19},
  {...fromCommas('128/125', '2.3.5', 'Computed CWE'), name: 'From commas', n: 19, mode: 0},
  {...fromCommas('245/243', '3.5.7', 'Computed CWE'), n: 19, mode: 0}
];
const chords = [
  '4:5:6',
  '1/6:5:4',
  '4:5:6:7:9:11',
  '4:5:6:7:9:11:13:15',
  '1:81/80',
  '1:100/99',
  '3:5:7',
  '1:97/64',
  '4:4:5:6'
];
const baseline = JSON.parse(readFileSync(new URL('./fixtures/chord-corpus.json', import.meta.url)));
let index = 0;
for (const state of states)
  for (const text of chords) {
    const a = analyzeChord(state, text, {tolerance: 10}),
      expected = baseline[index++];
    assert.equal(expected.temperament, state.name);
    assert.equal(expected.n, state.n);
    assert.equal(expected.chord, text);
    assert.equal(
      a.occurrences.completeOccurrences.length,
      expected.newCount,
      `${state.name}[${state.n}] ${text}`
    );
    assert.equal(a.projection.basisStatus, expected.basis);
    assert.equal(a.projection.qualityStatus, expected.quality);
    assert.equal(a.projection.cardinalityStatus, expected.cardinality);
    assert.ok(expected.classification, 'Pre-retirement legacy difference remains documented');
  }
assert.equal(index, baseline.length);
console.log(`${index} frozen corpus cases passed; original comparison evidence retained.`);
