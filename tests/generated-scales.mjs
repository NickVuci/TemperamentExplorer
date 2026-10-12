import assert from 'node:assert/strict';
import {makeState, scale, generatedSizes, scaleChoices, stepSymbol} from '../src/core/engine.mjs';
import {buildBoard, fillBoard} from '../src/hexboard/hexboard.mjs';
import {mosLayers} from '../src/hexboard/hexboard-colors.mjs';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';
const s = makeState('meantone');
assert.equal(generatedSizes(s).length, 255);
assert.ok(generatedSizes(s, '3').some(a => a.n === 8));
for (const filter of ['2', '3'])
  assert.ok(generatedSizes(s, filter).every(a => a.sizes.length === +filter));
assert.equal(scaleChoices({...s, n: 7}, '3').find(a => a.n === 7).retained, true);
assert.equal(generatedSizes({...s, g: 700}).at(-1).n, 12);
assert.equal(generatedSizes({...s, g: 600}, '2').length, 0);
const cfg = {
  base: 7,
  offset: 0,
  style: 'bosanquet',
  rotation: 0,
  center: 65,
  register: 0,
  outside: false,
  scaleFilter: 'all'
};
for (const n of [8, 9, 20, 256]) {
  const t = {...s, n, mode: n - 1},
    a = scale(t),
    board = buildBoard(t, cfg),
    colors = mosLayers(t, cfg, board);
  assert.ok(!a.collision);
  assert.ok(a.steps.every(v => stepSymbol(a, v) !== '?'));
  assert.ok(colors.degreeLayers.every(i => i >= 0));
  assert.equal(colors.layers.at(-1).n, n);
}
for (const filter of ['all', '2', '3']) {
  const fit = fillBoard(s, {...cfg, scaleFilter: filter}),
    t = {...s, ...fit};
  assert.equal(buildBoard(t, {...cfg, offset: fit.offset}).playable, 133);
  if (filter !== 'all') assert.equal(scale(t).sizes.length, +filter);
}
const equal = {...s, n: 2, g: 600};
assert.doesNotThrow(() => buildBoard(equal, {...cfg, base: 2, style: 'period'}));
const workspace = createHexboardWorkspace({
  getStates: () => [s],
  play: () => {},
  refresh: () => {},
  notify: () => {},
  download: () => {},
  getHz: () => 220
});
workspace.change({dataset: {hexField: 'scaleFilter'}, value: '3'});
assert.match(workspace.render(), /8 ·/);
const saved = workspace.serialize();
workspace.restore(saved);
assert.equal(workspace.serialize().configs[0].scaleFilter, '3');
assert.equal(s.n, 19);
console.log(
  'Generated sizes, step filters, retained selection, finite EDO cycles, non-MOS colors, filtered board filling, and filter persistence passed.'
);
