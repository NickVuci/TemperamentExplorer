// Frozen pre-refactor results protect mathematical output, modes and exports.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {scale, targets, classifyTargets} from '../src/core/engine.mjs';
import {presets, makeState} from '../src/core/catalog.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {matrixScale, matrixInterval} from '../src/core/matrix.mjs';
import {buildBoard, exportHexboard} from '../src/hexboard/hexboard.mjs';
import {bestApproximations, bestModeApproximations} from '../src/core/approximation-compat.mjs';
import {discoverScaleChords} from '../src/harmonic/harmonic-inspection.mjs';
import {diamondApproximation} from '../src/diamond/tonality-diamond.mjs';

const digest = values => createHash('sha256').update(JSON.stringify(values)).digest('hex');
const scales = [],
  matches = [],
  approximations = [],
  boards = [],
  chords = [];
// The digests were frozen over the original built-in presets; later presets are covered by tests/catalog.mjs.
const FROZEN_PRESETS = [
  'meantone',
  'dreamtone',
  'septimal',
  'porcupine',
  'magic',
  'hanson',
  'porcupine11',
  'porcupine7',
  'porkypine',
  'porcupinefowl',
  'porcupinefish',
  'magic7',
  'magic11',
  'miracle7',
  'miracle11',
  'pajara7',
  'pajara11',
  'diaschismic',
  'schismic',
  'garibaldi'
];
assert.ok(FROZEN_PRESETS.every(key => presets[key]));
const states = [...FROZEN_PRESETS.map(makeState), fromCommas('245/243', '3.5.7')];
const ts = targets(13);
for (const original of states) {
  for (const n of [7, 19, 31, 81, 128, 256])
    for (const mode of [0, Math.floor(n / 2), n - 1]) {
      const s = {...original, n, mode};
      scales.push(scale(s));
    }
  for (const mode of [0, 3, original.n - 1]) {
    const s = {...original, mode};
    const matrix = matrixScale({...s, matrixOctave: true});
    for (let i = 0; i < matrix.n; i++)
      for (let j = 0; j <= matrix.n; j++) {
        matches.push(classifyTargets(s, matrixInterval(matrix, i, j), ts, 10));
      }
    for (const t of ts) {
      // This frozen pre-split snapshot used "scale" for the mode-only view.
      const priorView = diamondApproximation(s, t, {
        scope: 'mode',
        filter: 'mapped',
        outside: true,
        tol: 10
      });
      approximations.push([
        bestApproximations(s, t),
        bestModeApproximations(s, t),
        {...priorView, source: 'scale'}
      ]);
    }
    const cfg = {
      base: 2,
      style: 'period',
      center: 65,
      rotation: 0,
      offset: 0,
      register: 0,
      outside: false
    };
    const board = buildBoard(s, cfg),
      exported = exportHexboard(s, cfg).file;
    // Display names are presentation, not exported pitch data; tests/hexboard.mjs covers them.
    const {name, description, ...tuning} = exported.tuningBundle.tuning;
    boards.push([board, tuning, exported.tuningBundle.layouts[0].buttonOverrides]);
  }
  chords.push(discoverScaleChords(original, 3, 13, 10, false));
}
const actual = Object.fromEntries(
  Object.entries({scales, matches, approximations, boards, chords}).map(([key, value]) => [
    key,
    digest(value)
  ])
);
const expected = {
  scales: 'f237641d57a3c32fd0ac4906e0ef48606fd4ca97da46b85c073c30da7aad4944',
  matches: '4073cd55a1fd8ec265a68f893b901342878d8dc7c332a1fdb374086d33899105',
  approximations: 'fc19b27261785c31b11e67e15eb3914400c60719baff518ce8c67038158ab964',
  boards: 'c2103e7113ac0c3044f0282316ffaa8a53a9cd1df6d2dc14f1759cbe804daf5d',
  chords: '34bebe589f6830d0d6b970ae7c82068b8d338039721a3503d522a60ac40d4098'
};
assert.deepEqual(actual, expected);
console.log(
  'Pre-refactor scales, matrices, JI classifications, modes, chords and exports match exactly.'
);
