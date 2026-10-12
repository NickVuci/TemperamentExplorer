import assert from 'node:assert/strict';
import {presets, makeState} from '../src/core/engine.mjs';
import {buildBoard} from '../src/hexboard/hexboard.mjs';
import {
  layoutPresetSnapshot,
  layoutPresetForState,
  mappingKey
} from '../src/hexboard/layout-preset-data.mjs';
import {BUILTIN_LAYOUTS, builtinLayoutsFor} from '../src/hexboard/builtin-layouts.mjs';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';
import {activeLayout} from '../src/hexboard/layout-chooser.mjs';

// Every built-in layout is a valid layout record for its own temperament and gives a playable board.
assert.ok(BUILTIN_LAYOUTS.length > 0);
assert.equal(
  new Set(BUILTIN_LAYOUTS.map(p => p.id)).size,
  BUILTIN_LAYOUTS.length,
  'built-in ids are unique'
);
for (const preset of BUILTIN_LAYOUTS) {
  const key = preset.id.split(':')[1],
    s = makeState(key);
  assert.ok(
    preset.builtin && Object.isFrozen(preset) && Object.isFrozen(preset.state.config),
    `${preset.id} is read-only`
  );
  assert.doesNotThrow(
    () => layoutPresetSnapshot(preset.name, preset.state),
    `${preset.id} is a valid layout record`
  );
  const fit = layoutPresetForState(preset.state, s);
  assert.equal(fit.error, undefined, `${preset.id} fits ${key}`);
  assert.equal(
    builtinLayoutsFor(s)[0].id,
    'builtin:' + key,
    `${key} lists its recommended layout first`
  );
  const board = buildBoard(fit.state, fit.config),
    played = board.keys.filter(k => k.enabled && !k.command);
  assert.ok(played.length >= 40, `${preset.id} fills the board`);
  for (let degree = 0; degree < fit.state.n; degree++)
    assert.ok(
      played.some(k => k.degree === degree),
      `${preset.id} reaches degree ${degree}`
    );
}
assert.ok(BUILTIN_LAYOUTS.every(p => / · (?:Recommended|Bosanquet|Wicki-Hayden)$/.test(p.name)));
for (const key of Object.keys(presets))
  for (const id of ['builtin:' + key, `builtin:${key}:bosanquet`])
    assert.ok(
      BUILTIN_LAYOUTS.some(p => p.id === id),
      `${key} has ${id}`
    );
assert.equal(
  new Set(BUILTIN_LAYOUTS.map(p => mappingKey(p.state.context))).size,
  Object.keys(presets).length,
  'each built-in temperament has its own mapping'
);

// Conventional layouts point the conventional way on screen (meantone): Wicki-Hayden has the whole tone
// to the right, the fifth up-right and the fourth up-left; Bosanquet has the chroma straight up.
function neighbour(board, cfg, deg) {
  const angle = (cfg.deviceRotation * Math.PI) / 2,
    pos = k => {
      const x = k.x / 2,
        y = (k.y * Math.sqrt(3)) / 2;
      return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
    };
  const center = board.keys[cfg.center],
    c = pos(center),
    t = [Math.cos((deg * Math.PI) / 180), -Math.sin((deg * Math.PI) / 180)];
  const k = board.keys.find(k => {
    const p = pos(k);
    return Math.hypot(p[0] - c[0] - t[0], p[1] - c[1] - t[1]) < 0.05;
  });
  return k.c - center.c;
}
const fit = id => {
  const p = BUILTIN_LAYOUTS.find(p => p.id === id),
    f = layoutPresetForState(p.state, makeState('meantone'));
  return [buildBoard(f.state, f.config), f.config];
};
const [wicki, wickiCfg] = fit('builtin:meantone:wicki-hayden'),
  near = (a, b) => Math.abs(a - b) < 1;
assert.ok(
  near(neighbour(wicki, wickiCfg, 0), 193.3) &&
    near(neighbour(wicki, wickiCfg, 60), 696.7) &&
    near(neighbour(wicki, wickiCfg, 120), 503.4),
  'Wicki-Hayden: tone right, fifth up-right, fourth up-left'
);
const [bos, bosCfg] = fit('builtin:meantone:bosanquet');
assert.ok(
  near(neighbour(bos, bosCfg, 90), 76.0) &&
    near(neighbour(bos, bosCfg, 30), 193.3) &&
    near(neighbour(bos, bosCfg, -30), 117.3),
  'Bosanquet: chroma up, tone up-right, semitone down-right'
);

// Without a saved default (here the saved-layout store is unreachable) a temperament opens on its built-in layout.
const offline = async () => new Response('{}', {status: 503});
for (const key of ['meantone', 'hanson']) {
  let exported = null;
  const s = {...makeState(key), n: 5, mode: 0},
    ui = createHexboardWorkspace({
      request: offline,
      getStates: () => [s],
      play: () => {},
      refresh: () => {},
      notify: () => {},
      download: (name, text) => (exported = {name, file: JSON.parse(text)}),
      getHz: () => 220
    });
  await ui.initLayouts();
  const cfg = ui.serialize().configs[0],
    builtin = builtinLayoutsFor(s)[0];
  assert.equal(cfg.savedLayoutId, builtin.id, `${key} opens on its built-in layout`);
  assert.equal(s.n, builtin.state.context.n);
  for (const field of ['base', 'style', 'rotation', 'ap', 'ag', 'bp', 'bg'])
    assert.equal(cfg[field], builtin.state.config[field], `${key}: ${field}`);
  const html = ui.render();
  assert.match(html, /label="Built-in layouts"/);
  assert.ok(
    html.includes(`${builtin.name} · Default`),
    'the built-in layout is marked as the default'
  );
  assert.doesNotMatch(
    html,
    /data-hex-action="layout-(?:delete|default|save-new)"/,
    'a built-in layout is not updated, deleted or made the default'
  );
  // Exports name the built-in layout; once the board is changed it exports as a custom layout.
  ui.click({closest: () => ({dataset: {hexAction: 'export'}})});
  assert.equal(exported.file.tuningBundle.layouts[0].name, 'Recommended');
  assert.equal(exported.file.details.layout.source, 'Built-in');
  assert.equal(exported.file.title, `${s.name}[${s.n}] · Recommended`);
  assert.match(exported.name, /-Recommended-HexBoard\.json$/);
  assert.equal(activeLayout(s, cfg, {items: []}), builtin);
  assert.equal(activeLayout(s, {...cfg, center: cfg.center + 1}, {items: []}), null);
  ui.change({dataset: {hexField: 'center'}, value: String(cfg.center + 1)});
  ui.click({closest: () => ({dataset: {hexAction: 'export'}})});
  assert.equal(exported.file.details.layout.source, 'Custom');
  assert.doesNotMatch(exported.name, /Recommended/);
}
console.log(
  'Built-in layouts: valid records, playable boards, recommended/Bosanquet/Wicki-Hayden per temperament, conventional orientation, applied without a saved default, read-only, named in exports passed.'
);
