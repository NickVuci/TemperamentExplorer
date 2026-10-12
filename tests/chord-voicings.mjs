import assert from 'node:assert/strict';
import {makeState} from '../src/core/catalog.mjs';
import {fromCommas, edoTune} from '../src/core/tuning.mjs';
import {applyTuningMethod} from '../src/core/tuning-methods.mjs';
import {chordIdentity} from '../src/chords/chord-identity.mjs';
import {analyzeChord} from './support/chord-analysis.mjs';
const parseJIChord = text => ({
  text,
  tones: chordIdentity(text).canonicalRatios.map(q => ({
    n: Number(q.n),
    d: Number(q.d),
    label: q.label,
    c: 1200 * Math.log2(Number(q.n) / Number(q.d))
  }))
});
const findJIChordOccurrences = (s, c) => ({
  occurrences: analyzeChord(s, c.text).occurrences.completeOccurrences
});
import {buildBoard} from '../src/hexboard/hexboard.mjs';
import {chordPlacements} from '../src/hexboard/hexboard-chords.mjs';
import {shapeVoicings} from '../src/chords/chord-voicings.mjs';
// Voicings of a JI chord occurrence: its shape voicings with the chord's tones as overlays.
const chordVoicings = (s, chord, instance, options = {}) =>
  shapeVoicings(s, instance, {...options, tones: chord.tones});
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const chord = parseJIChord('4:5:6:7:9:11');
const fixed = makeState('miracle11');
const optimized = applyTuningMethod(fixed, {method: 'Weil–Euclidean', fixed: false});
assert.ok(Math.abs(optimized.p - 1200) > 0.001);
for (const s of [fixed, optimized]) {
  const o = findJIChordOccurrences(s, chord).occurrences[0],
    voices = chordVoicings(s, chord, o, {style: 'compact'});
  assert.equal(voices.length, 6);
  for (const [bass, v] of voices.entries()) {
    assert.equal(v.bassTone, bass);
    assert.deepEqual(v.degreeByTone, o.degrees);
    assert.deepEqual(v.coords[bass], o.coords[bass]);
    assert.ok(
      v.pitches.every(
        p => p >= v.pitches[bass] - 1e-7 && p < v.pitches[bass] + v.reference.cents - 1e-7
      )
    );
    for (const p of v.pairErrors) {
      const ideal =
        chord.tones[p.j].c -
        chord.tones[p.i].c +
        (v.referenceLifts[p.j] - v.referenceLifts[p.i]) * v.reference.idealCents;
      close(p.error, v.pitches[p.j] - v.pitches[p.i] - ideal);
      assert.ok(p.mapped);
    }
  }
  if (s === optimized)
    assert.ok(
      Math.max(...voices.map(v => v.max)) - Math.min(...voices.map(v => v.max)) > 0.001,
      'Optimized period changes actual inversion errors.'
    );
}
for (const [s, text, reference, periods] of [
  [fromCommas('128/125', '2.3.5', 'Computed CWE'), '1:3:9', '2/1', 3],
  [fromCommas('245/243', '3.5.7', 'Computed CWE'), '3:5:7', '3/1', 1]
]) {
  const c = parseJIChord(text),
    o = findJIChordOccurrences(s, c).occurrences[0];
  assert.ok(o);
  const voices = chordVoicings(s, c, o);
  for (const v of voices) {
    assert.equal(v.reference.ratio, reference);
    assert.equal(v.reference.periods, periods);
    close(v.reference.cents, periods * s.p);
    assert.ok(v.periodLifts.every(l => l % periods === 0));
    v.coords.forEach((m, i) => {
      close(m[0] - o.coords[i][0], v.periodLifts[i]);
      assert.equal(m[1], o.coords[i][1]);
    });
  }
  assert.ok(voices.some(v => v.periodLifts.some(l => l !== 0)));
}
const base = makeState('meantone'),
  edo = {...base, ...edoTune(base, 31, '18'), n: 31};
const eChord = parseJIChord('4:5:6'),
  e = findJIChordOccurrences(edo, eChord).occurrences[0];
assert.ok(chordVoicings(edo, eChord, e).every(v => v.allMapped));
const occurrence = findJIChordOccurrences(fixed, chord).occurrences.find(o => o.root === 14);
const cfg = {
  periodWrapping: true,
  periodPlacement: null,
  base: 7,
  offset: 0,
  style: 'bosanquet',
  rotation: 0,
  mirror: false,
  center: 65,
  register: 0,
  outside: false
};
const board = buildBoard(fixed, cfg),
  placements = chordPlacements(board, occurrence.coords, 65, {exact: true, periodCopies: true});
assert.equal(
  placements.length,
  4,
  'Scale-aligned copies retain four exact placements for this voicing.'
);
assert.equal(
  chordPlacements(buildBoard(fixed, {...cfg, registerAlignment: 'manual'}), occurrence.coords, 65, {
    exact: true,
    periodCopies: true
  }).length,
  32,
  'The previous manual-copy arrangement remains available.'
);
const shifted = [-2, 4].map(register => {
  const b = buildBoard(fixed, {...cfg, register});
  return {
    board: b,
    placements: chordPlacements(b, occurrence.coords, 65, {exact: true, periodCopies: true})
  };
});
assert.ok(
  shifted[0].placements.some(p => p.periodShift < 0) &&
    shifted[1].placements.some(p => p.periodShift > 0)
);
for (const {board: b, placements: ps} of shifted)
  for (const p of ps)
    for (let i = 0; i < occurrence.coords.length; i++)
      close(b.keys[p.keys[i]].c, occurrence.pitches[i] + p.periodShift * fixed.p);
for (const p of placements)
  for (let i = 0; i < occurrence.coords.length; i++) {
    const k = board.keys[p.keys[i]];
    assert.deepEqual(k.m, [occurrence.coords[i][0] + p.periodShift, occurrence.coords[i][1]]);
    close(k.c, occurrence.pitches[i] + p.periodShift * fixed.p);
  }
console.log(
  'Voiced scoring, fixed and optimized periods, divided octaves, non-octave reference, EDO identity and signed wrapped copies passed.'
);
