// Frozen pre-refactor results protect mathematical output, modes and exports.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { presets, makeState, scale, targets, classifyTargets } from '../dist/engine.mjs';
import { fromCommas } from '../dist/tuning.mjs';
import { matrixScale, matrixInterval } from '../dist/matrix.mjs';
import { buildBoard, exportHexboard } from '../dist/hexboard.mjs';
import { bestApproximations, bestModeApproximations } from '../dist/assignments.mjs';
import { discoverChords } from '../dist/chords.mjs';
import { diamondApproximation } from '../dist/tonality-diamond.mjs';

const digest = values => createHash('sha256').update(JSON.stringify(values)).digest('hex');
const scales = [], matches = [], approximations = [], boards = [], chords = [];
const states = [...Object.keys(presets).map(makeState), fromCommas('245/243', '3.5.7')];
const ts = targets(13);
for (const original of states) {
  for (const n of [7, 19, 31, 81, 128, 256]) for (const mode of [0, Math.floor(n / 2), n - 1]) {
    const s = {...original, n, mode};
    scales.push(scale(s));
  }
  for (const mode of [0, 3, original.n - 1]) {
    const s = {...original, mode};
    const matrix = matrixScale({...s, matrixOctave:true});
    for (let i = 0; i < matrix.n; i++) for (let j = 0; j <= matrix.n; j++) {
      matches.push(classifyTargets(s, matrixInterval(matrix, i, j), ts, 10));
    }
    for (const t of ts) {
      // This frozen pre-split snapshot used "scale" for the mode-only view.
      const priorView = diamondApproximation(s,t,{scope:'mode',filter:'mapped',outside:true,tol:10});
      approximations.push([bestApproximations(s, t), bestModeApproximations(s, t), {...priorView,source:'scale'}]);
    }
    const cfg = {base:2, style:'period', center:65, rotation:0, offset:0, register:0, outside:false};
    const board = buildBoard(s, cfg), exported = exportHexboard(s, cfg).file;
    boards.push([board, exported.tuningBundle.tuning, exported.tuningBundle.layouts[0].buttonOverrides]);
  }
  chords.push(discoverChords(original,3,13,10,false));
}
const actual = Object.fromEntries(Object.entries({scales,matches,approximations,boards,chords}).map(([key,value])=>[key,digest(value)]));
const expected = {
  scales:'f237641d57a3c32fd0ac4906e0ef48606fd4ca97da46b85c073c30da7aad4944',
  matches:'4073cd55a1fd8ec265a68f893b901342878d8dc7c332a1fdb374086d33899105',
  approximations:'fc19b27261785c31b11e67e15eb3914400c60719baff518ce8c67038158ab964',
  boards:'3ad3401de409b34b541c6e79691993c0b8d87b7ae62c61596ff69fa0df800a82',
  chords:'34bebe589f6830d0d6b970ae7c82068b8d338039721a3503d522a60ac40d4098'
};
assert.deepEqual(actual,expected);
console.log('Pre-refactor scales, matrices, JI classifications, modes, chords and exports match exactly.');
