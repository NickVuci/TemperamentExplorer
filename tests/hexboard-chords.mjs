import assert from 'node:assert/strict';
import {scale} from '../src/core/engine.mjs';
import {makeState} from '../src/core/catalog.mjs';
import {buildBoard, fillBoard, exportHexboard} from '../src/hexboard/hexboard.mjs';
import {
  chordCoordinates,
  chordPlacements,
  discoverBoardChords,
  hexDistance
} from '../src/hexboard/hexboard-chords.mjs';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';
import {createChordWorkspace} from '../src/ui/chord-ui.mjs';
const cfg = {
  base: 7,
  style: 'bosanquet',
  center: 65,
  rotation: 0,
  offset: 0,
  register: 0,
  outside: false
};
const s = makeState('meantone'),
  ns = scale(s).notes,
  ds = [0, ns.findIndex(t => t.k === 4), ns.findIndex(t => t.k === 1)],
  coords = chordCoordinates(s, ds);
for (const rotation of [0, 2, 5]) {
  const b = buildBoard(s, {...cfg, rotation}),
    placements = chordPlacements(b, coords);
  assert.ok(placements.length);
  for (const p of placements)
    for (let i = 0; i < p.keys.length; i++) {
      const key = b.keys[p.keys[i]],
        root = b.keys[p.keys[0]];
      assert.ok(key.enabled && !key.command);
      assert.deepEqual(
        key.m.map((v, j) => v - root.m[j]),
        coords[i].map((v, j) => v - coords[0][j])
      );
    }
}
assert.deepEqual(
  chordPlacements(
    {...buildBoard(s, cfg), keys: buildBoard(s, cfg).keys.map(k => ({...k, enabled: false}))},
    coords
  ),
  []
);
const fit = fillBoard(s, {...cfg, scaleFilter: '2'}),
  large = {...s, n: fit.n, mode: fit.mode},
  board = buildBoard(large, {...cfg, offset: fit.offset}),
  found = discoverBoardChords(large, board);
assert.ok(large.n > 96 && found.groups.length);
assert.ok(!found.limited);
assert.ok(found.groups.some(g => g.label === '1/1 · 5/4 · 3/2'));
for (const g of found.groups) {
  assert.equal(g.mapped, g.total);
  for (const p of g.placements)
    for (const i of p.keys)
      for (const j of p.keys) assert.ok(hexDistance(board.keys[i], board.keys[j]) <= 4);
}
const without = discoverBoardChords(large, board, {reach: 6}),
  withOthers = discoverBoardChords(large, board, {reach: 6, other: true}),
  primeRestricted = discoverBoardChords(large, board, {reach: 6, limit: 13, primeLimit: 3});
assert.ok(withOthers.count >= without.count);
assert.ok(primeRestricted.count <= without.count);
let played = [],
  downloaded = null;
const states = [s];
const ui = createHexboardWorkspace({
  getStates: () => states,
  play: p => (played = p),
  refresh: () => {},
  notify: () => {},
  download: (name, data) => (downloaded = JSON.parse(data)),
  getHz: () => 220
});
const click = act => ui.click({closest: () => ({dataset: {hexAction: act}})});
const saved = JSON.parse(JSON.stringify(ui.serialize()));
saved.configs[0].periodWrapping = false;
ui.restore(saved);
const before = exportHexboard(s, saved.configs[0], 220).file.tuningBundle.layouts[0]
  .buttonOverrides;
assert.ok(ui.showChord(coords, 'Major triad'));
ui.render();
// Showing a chord changes only the panel mode (to Chord → places), never the saved layout.
{
  const after = ui.serialize();
  assert.equal(after.chordMode, 'places');
  assert.deepEqual({...after, chordMode: saved.chordMode}, saved);
}
click('chords-play');
assert.equal(played.length, 3);
const old = played;
click('chords-next');
click('chords-play');
assert.notDeepEqual(played, old);
for (let i = 1; i < 3; i++) assert.ok(Math.abs(played[i] - played[0] - (old[i] - old[0])) < 1e-7);
click('export');
assert.deepEqual(downloaded.tuningBundle.layouts[0].buttonOverrides, before);
click('chords-clear');
played = [];
click('chords-play');
assert.deepEqual(played, []);
ui.showChord(coords, 'Major');
ui.change({dataset: {hexField: 'rotation'}, type: 'select-one', value: '2'});
played = [];
click('chords-play');
assert.equal(played.length, 3, 'Selected chord is remapped after layout changes');
click('chords-search');
ui.render();
ui.clearHighlight();
played = [];
click('chords-play');
assert.deepEqual(played, []);
let transferred;
const cw = createChordWorkspace({
  getStates: () => states,
  play: () => {},
  refresh: () => {},
  notify: () => {},
  onHexboard: (...args) => (transferred = args)
});
cw.fromInterval(ds[0], ds[1]);
cw.click({dataset: {chord: 'up', i: String(ds[0])}});
cw.click({dataset: {chord: 'hexboard'}});
assert.deepEqual(transferred[0], chordCoordinates(s, [ds[0], ds[1]], {[ds[0]]: 1}));
console.log(
  'Chord placements preserve voicing; large-layout search, reach, highlights, clearing, export colors and workspace transfer passed.'
);
