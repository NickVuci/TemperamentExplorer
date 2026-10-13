import assert from 'node:assert/strict';
import {scale, mapRatio, targets, generatedSizes} from '../src/core/engine.mjs';
import {presets, makeState} from '../src/core/catalog.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {defaultScale, withDefaultScale} from '../src/core/default-scale.mjs';
import {findScaleMilestones, scaleCoverageTarget} from '../src/core/scale-milestones.mjs';
import {createPresetWorkspace} from '../src/presets/preset-ui.mjs';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';
import {applyTuningMethod} from '../src/core/tuning-methods.mjs';
import {bootApp} from './support/dom.mjs';

// Interval complete: every mapped diamond interval occurs between two notes of the scale, in any mode.
function intervalCovers(s, options) {
  const cfg = scaleCoverageTarget(s, options),
    ks = scale(s).notes.map(v => v.k),
    differences = new Set(ks.flatMap(a => ks.map(b => b - a)));
  return targets(cfg.limit, cfg.primeLimit).every(t => {
    const m = mapRatio(t.n, t.d, s);
    return !m || differences.has(m[1]);
  });
}
for (const s of [
  ...Object.keys(presets).map(makeState),
  fromCommas('128/125'),
  fromCommas('245/243', '3.5.7')
]) {
  const before = structuredClone(s),
    chosen = defaultScale(s);
  assert.ok(chosen, s.name);
  assert.equal(chosen.mode, 0, `${s.name}: the default opens on mode 1`);
  const mos = generatedSizes(s).filter(size => size.mos);
  assert.ok(
    mos.some(size => size.n === chosen.n),
    `${s.name}: the default is a MOS`
  );
  assert.ok(
    intervalCovers({...s, ...chosen}),
    `${s.name}: the default contains every mapped diamond interval`
  );
  for (const size of mos.filter(size => size.n < chosen.n))
    assert.equal(
      intervalCovers({...s, n: size.n, mode: 0}),
      false,
      `${s.name}: no smaller MOS is interval complete`
    );
  assert.deepEqual(s, before, 'selection calculation does not mutate the source');
}
assert.deepEqual(defaultScale(makeState('meantone')), {n: 7, mode: 0});
assert.deepEqual(defaultScale(makeState('meantone'), {limit: 5, primeLimit: 5}), {n: 5, mode: 0});
const closed = {...makeState('meantone'), g: 700};
assert.ok(intervalCovers(withDefaultScale(closed)));
// Without an interval-complete MOS the temperament opens on a 7–9-note MOS, with a warning, or keeps its scale.
for (const s of [
  {...closed, g: 600},
  {
    ...closed,
    rows: [
      [1, 1, 0],
      [0, 1, 1000]
    ]
  }
]) {
  let warning = '';
  assert.equal(defaultScale(s), null);
  const result = withDefaultScale(s, text => (warning = text));
  assert.match(warning, /approximates that limit poorly|no 7–9-note MOS/);
  if (result !== s) {
    assert.ok([7, 8, 9].includes(result.n) && result.mode === 0);
    assert.ok(generatedSizes(s).some(size => size.mos && size.n === result.n));
  }
}
const saved = {...makeState('meantone'), n: 7, mode: 4},
  states = [saved];
let ji = {limit: 5, primeLimit: 5, tol: 10};
const ui = createPresetWorkspace({
  getStates: () => states,
  getJI: () => ji,
  apply: (i, s) => (states[i] = s),
  refresh: () => {},
  notify: () => {},
  request: async () => Response.json({presets: [{id: 'saved', name: saved.name, state: saved}]})
});
await ui.init();
for (const value of ['builtin:meantone', 'saved:saved']) {
  ui.change({dataset: {savedPreset: '0'}, value});
  assert.deepEqual({n: states[0].n, mode: states[0].mode}, {n: 5, mode: 0});
  assert.ok(intervalCovers(states[0], ji));
}
assert.equal(saved.n, 7, 'loading a preset does not overwrite its saved scale');
ji = {limit: 15, primeLimit: 5, tol: 10};
ui.receiveCommas(0, [2, 3, 5], [{label: '81/80'}]);
ui.click({dataset: {userPreset: 'generate', s: '0'}});
assert.equal(states[0].n, 7);
assert.ok(intervalCovers(states[0], ji));
const hex = createHexboardWorkspace({
  getStates: () => states,
  getJI: () => ji,
  refresh: () => {},
  notify: () => {},
  play: () => {},
  getHz: () => 220
});
hex.render();
assert.equal(hex.serialize().configs[0].base, findScaleMilestones(states[0], ji).intervalMOS.n);
hex.change({dataset: {hexField: 'base'}, value: '5'});
hex.render();
assert.equal(hex.serialize().configs[0].base, 5, 'manual base survives unchanged context');
// A retuning changes only tuning: the layout (base MOS, offset, style and every other field) is kept.
{
  const before = structuredClone(hex.serialize().configs[0]);
  for (const tuned of [
    applyTuningMethod(states[0], {method: 'Minimax'}),
    {...states[0], g: states[0].g + 0.4, tuning: 'Manual'}
  ]) {
    states[0] = tuned;
    hex.render();
    assert.deepEqual(
      hex.serialize().configs[0],
      before,
      `retuning to ${tuned.tuning} keeps the layout`
    );
  }
}
const session = hex.serialize();
hex.restore(session);
hex.render();
assert.equal(hex.serialize().configs[0].base, 5, 'saved manual base survives restore');
ji = {limit: 9, primeLimit: 3, tol: 10};
hex.render();
assert.equal(
  hex.serialize().configs[0].base,
  findScaleMilestones(states[0], ji).intervalMOS.n,
  'new JI target updates base default'
);
hex.restore(null);
ji = {limit: 15, primeLimit: 5, tol: 10};
hex.render();
assert.equal(hex.serialize().configs[0].base, 7, 'reset reapplies first interval-complete MOS');
console.log(
  'Shared scale defaults: first interval-complete MOS on mode 1, poor-temperament fallback, selected limits, presets, non-octave periods, collision bounds, base MOS, manual edits and restoration passed.'
);

// In the app, Discover and Play keep independent scale choices. Both take the default scale when the
// temperament or JI limits change, and keep a manual choice through redraws and retunings.
const page = await bootApp(),
  {$} = page;
async function choose(selector, value) {
  const el = page.element(selector);
  if (el.tagName === 'SELECT')
    assert.ok(
      [...el.options].some(option => option.value === String(value)),
      `${value} is offered`
    );
  page.change(el, value);
  await page.settle();
}
async function show(section) {
  page.section(section);
  await page.settle();
}
async function scales() {
  await show('discover');
  const discover = ['n', 'mode'].map(field => Number($(`[data-field="${field}"]`).value));
  await show('play');
  const play = ['target', 'mode'].map(field => Number($(`[data-hex-field="${field}"]`).value));
  return {discover, play};
}
async function chooseScales({discover, play} = manual) {
  await show('discover');
  await choose('[data-field="n"]', discover[0]);
  await choose('[data-field="mode"]', discover[1]);
  await show('play');
  await choose('[data-hex-field="target"]', play[0]);
  await choose('[data-hex-field="mode"]', play[1]);
}
const manual = {discover: [7, 4], play: [12, 2]};
await page.until(
  () => /chords · complete/.test($('[data-unified-pane="directory"]')?.textContent ?? ''),
  {message: 'the first catalogue'}
);
assert.deepEqual(await scales(), {discover: [7, 0], play: [7, 0]});
await chooseScales();
assert.deepEqual(await scales(), manual, 'manual Discover and Play scales survive redraws');
await choose('#limit', 5);
assert.deepEqual(await scales(), {discover: [5, 0], play: [5, 0]}, 'a new limit applies defaults');

// Retuning cannot silently substitute a scale, and Play receives the new tuning.
await chooseScales();
let generator, period;
for (const [method, optimizePeriod] of [
  ['Minimax', false],
  ['EDO', false],
  ['Least Squares', false],
  ['Minimax', true]
]) {
  await choose('[data-field="tuning"]', method);
  const box = $('[data-optimize-period="0"]');
  if (box && box.checked !== optimizePeriod) await choose(box, optimizePeriod);
  [generator, period] = [...$('.tuning-summary').textContent.matchAll(/(-?[\d.]+) ¢/g)].map(match =>
    Number(match[1])
  );
  assert.deepEqual(await scales(), manual, `retuning to ${method} preserves both scales`);
  page.click('[data-hex-action="export"]');
  const {details} = JSON.parse(await page.downloaded(/HexBoard\.json$/));
  assert.equal(details.generatorCents, generator, `Play receives the ${method} generator`);
  assert.equal(details.periodCents, period, `Play receives the ${method} period`);
  assert.deepEqual([details.scale.notes, details.scale.mode - 1], manual.play);
}
assert.notEqual(period, 1200, 'an optimized period reaches Play');

// A new temperament still applies the defaults: the default scale in Discover, and in Play the size
// of the recommended layout, on mode 1.
page.chooseTemperament('porcupine');
await page.settle();
const porcupine = defaultScale(makeState('porcupine'), {limit: 5, primeLimit: 5}),
  after = await scales(),
  layout = $('#layout-recommendation-choice');
assert.deepEqual(after.discover, [porcupine.n, 0]);
assert.match(layout.selectedOptions[0].textContent, new RegExp(`· ${after.play[0]} notes$`));
assert.equal(after.play[1], 0);

// A restored session keeps its saved scales.
const kept = {discover: [8, 2], play: [7, 1]};
await chooseScales(kept);
page.click('#save');
const savedSession = await page.downloaded(/session\.json$/);
page.click('#reset');
await page.settle();
await page.openSession(savedSession);
assert.equal(page.toast(), 'Session opened');
assert.deepEqual(await scales(), kept, 'opening a session preserves its saved scales');
assert.deepEqual(page.errors, []);
console.log(
  'App scale defaults: independent Discover and Play choices, limit and temperament defaults, retuning and session restore passed.'
);
await page.close();
