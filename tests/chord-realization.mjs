import assert from 'node:assert/strict';
import {makeState} from '../src/core/engine.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {analyzeChord} from '../src/chords/chord-analysis.mjs';
import {
  realizationDefaults,
  realizeChord,
  placeRealization
} from '../src/chords/chord-realization.mjs';
import {buildBoard} from '../src/hexboard/hexboard.mjs';
const s = makeState('miracle11'),
  a = analyzeChord(s, '4:5:6:7:9:11'),
  occ = a.occurrences.completeOccurrences.find(o => o.root === 14);
assert.equal(
  realizationDefaults().style,
  'original',
  'Harmonic spelling is the default chord spacing.'
);
let cfg = {
  base: 7,
  style: 'bosanquet',
  center: 65,
  offset: 0,
  rotation: 0,
  register: 0,
  outside: false,
  periodWrapping: true
};
const v = realizeChord(s, a, occ, {style: 'original'}),
  placed = placeRealization(s, v, buildBoard(s, cfg));
assert.ok(placed.placements.length > 1);
for (const r of [
  {inversion: 1},
  {periodShift: 1},
  {periodShift: -1},
  {order: 'input'},
  {style: 'open'}
]) {
  const x = realizeChord(s, a, occ, r);
  assert.equal(x.occurrenceId, v.occurrenceId);
  assert.equal(x.chordId, v.chordId);
  assert.deepEqual(
    x.pitches,
    x.coords.map(m => m[0] * s.p + m[1] * s.g)
  );
}
for (const config of [
  {...cfg, periodPlacement: {column: 2, row: -1}},
  {...cfg, flipHorizontal: true},
  {...cfg, flipVertical: true},
  {...cfg, deviceRotation: 2}
]) {
  const board = buildBoard(s, config),
    p = placeRealization(s, v, board);
  assert.equal(p.occurrenceId, occ.id);
  for (const f of p.placements)
    assert.deepEqual(
      f.pitches,
      f.coords.map(m => m[0] * s.p + m[1] * s.g)
    );
}
assert.equal(placeRealization(s, v, {keys: []}).placements.length, 0);
for (const state of [
  {...makeState('meantone'), g: 700},
  {...fromCommas('128/125', '2.3.5', 'Computed CWE'), n: 19, mode: 0},
  {...fromCommas('245/243', '3.5.7', 'Computed CWE'), n: 19, mode: 0}
]) {
  const aa = analyzeChord(state, state.basis.includes(2) ? '4:5:6' : '3:5:7'),
    oo = aa.occurrences.completeOccurrences[0];
  assert.ok(oo);
  const vv = realizeChord(state, aa, oo, {periodShift: 1}),
    zz = realizeChord(state, aa, oo);
  assert.ok(vv.pitches.every((p, i) => Math.abs(p - zz.pitches[i] - state.p) < 1e-8));
}

const altered = structuredClone(occ);
altered.coords[0][0] += 10;
altered.degrees[0] = 999;
assert.deepEqual(
  realizeChord(s, a, altered).coords,
  realizeChord(s, a, occ).coords,
  'Resolve canonical occurrence data by ID'
);
const collapsedAnalysis = analyzeChord(makeState('meantone'), '1:81/80');
const cv = realizeChord(
  makeState('meantone'),
  collapsedAnalysis,
  collapsedAnalysis.occurrences.completeOccurrences[0],
  {inversion: 5}
);
assert.equal(cv.request.inversion, cv.inversion);
assert.equal(cv.inversion, 0);
