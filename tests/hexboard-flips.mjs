import assert from 'node:assert/strict';
import {makeState} from '../src/core/catalog.mjs';
import {
  buildBoard,
  physicalKey,
  flipPlacementVector,
  migrateLayoutMirrors,
  exportHexboard
} from '../src/hexboard/hexboard.mjs';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';

const s = makeState('meantone');
const base = {
  base: 7,
  style: 'bosanquet',
  rotation: 0,
  center: 65,
  register: 0,
  offset: 0,
  outside: true
};
let checked = 0;
for (let rotation = 0; rotation < 6; rotation++)
  for (let deviceRotation = 0; deviceRotation < 4; deviceRotation++)
    for (const periodWrapping of [false, true]) {
      const cfg = {...base, rotation, deviceRotation, periodWrapping},
        normal = buildBoard(s, cfg),
        root = physicalKey(cfg.center);
      // Fix the effective copy vector so the test exercises the entire wrapped
      // pattern, including manual placement, rather than a new packing choice.
      if (periodWrapping) cfg.periodPlacement = normal.wrapping.vector;
      for (const [flipHorizontal, flipVertical] of [
        [true, false],
        [false, true],
        [true, true]
      ]) {
        const conf = {...cfg, flipHorizontal, flipVertical};
        if (conf.periodPlacement)
          for (const f of ['flipHorizontal', 'flipVertical'])
            if (conf[f]) conf.periodPlacement = flipPlacementVector(conf.periodPlacement, conf, f);
        const b = buildBoard(s, conf),
          swap = deviceRotation % 2;
        const reflectX = swap ? flipHorizontal : flipVertical,
          reflectY = swap ? flipVertical : flipHorizontal;
        for (const key of b.keys.filter(k => !k.command)) {
          const x = root.x + (key.x - root.x) * (reflectX ? -1 : 1),
            y = root.y + (key.y - root.y) * (reflectY ? -1 : 1);
          const other = normal.keys.find(k => !k.command && k.x === x && k.y === y);
          if (!other) continue;
          assert.equal(key.enabled, other.enabled);
          assert.deepEqual(
            key.m.map(v => v || 0),
            other.m.map(v => v || 0)
          );
          assert.equal(key.degree, other.degree);
          assert.equal(key.base, other.base);
          assert.ok(Math.abs(key.c - other.c) < 1e-7);
          checked++;
        }
        assert.equal(b.keys[cfg.center].c, normal.keys[cfg.center].c);
      }
      const legacy = {...cfg, mirror: true};
      assert.equal(
        JSON.stringify(buildBoard(s, legacy).keys),
        JSON.stringify(buildBoard(s, migrateLayoutMirrors(legacy)).keys)
      );
    }
assert.ok(checked > 10000);
let exported;
const ui = createHexboardWorkspace({
  getStates: () => [s],
  play: () => {},
  refresh: () => {},
  notify: () => {},
  download: (name, text) => (exported = JSON.parse(text)),
  getHz: () => 220
});
assert.match(ui.render(), /Flip horizontal axis/);
assert.match(ui.render(), /Flip vertical axis/);
assert.doesNotMatch(ui.render(), />Mirror layout/);
ui.change({dataset: {hexField: 'periodWrapping'}, value: 'on'});
ui.change({dataset: {hexPeriod: 'column'}, value: '4'});
ui.change({dataset: {hexPeriod: 'row'}, value: '-3'});
const before = ui.serialize();
for (const f of ['flipHorizontal', 'flipVertical']) {
  ui.click({closest: () => ({dataset: {hexToggle: f}})});
  assert.equal(ui.serialize().configs[0][f], true);
}
assert.deepEqual(ui.serialize().configs[0].periodPlacement, {column: -4, row: 3});
const session = ui.serialize();
ui.restore(session);
assert.deepEqual(ui.serialize(), session);
const board = buildBoard(s, session.configs[0]);
const key = board.keys.find(k => k.enabled);
assert.equal(ui.press({dataset: {hexKey: String(key.index)}, closest: () => null}).c, key.c);
ui.click({closest: () => ({dataset: {hexAction: 'export'}})});
assert.equal(exported.temperamentLab.layout.flipHorizontal, true);
assert.equal(exported.temperamentLab.layout.flipVertical, true);
assert.equal(
  JSON.stringify(exported.temperamentLab.coordinates),
  JSON.stringify(exportHexboard(s, session.configs[0]).file.temperamentLab.coordinates)
);
for (const f of ['flipHorizontal', 'flipVertical'])
  ui.click({closest: () => ({dataset: {hexToggle: f}})});
assert.deepEqual(ui.serialize().configs[0].periodPlacement, before.configs[0].periodPlacement);
const legacy = ui.serialize();
for (const c of legacy.configs) {
  delete c.flipHorizontal;
  delete c.flipVertical;
  c.mirror = true;
}
const old = buildBoard(s, legacy.configs[0]);
ui.restore(legacy);
assert.equal(
  JSON.stringify(buildBoard(s, ui.serialize().configs[0]).keys),
  JSON.stringify(old.keys)
);
console.log(
  `${checked} reflected button assignments verified across rotations and orientations; wrapped offsets, independent toggles, audio pitches, export and legacy sessions passed.`
);
