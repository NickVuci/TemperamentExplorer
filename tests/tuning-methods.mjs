import assert from 'node:assert/strict';
import {mapRatio} from '../src/core/engine.mjs';
import {makeState} from '../src/core/catalog.mjs';
import {purePeriod} from '../src/core/pitch.mjs';
import {
  tuningMethods,
  tuningMethod,
  tuningConfig,
  applyTuningMethod
} from '../src/core/tuning-methods.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {weilTune} from '../src/core/weil-tuning.mjs';
import {presetSnapshot} from '../src/presets/preset-data.mjs';
import {canonicalHarmonicJSON} from '../src/harmonic/harmonic-types.mjs';
import {validateState} from '../src/core/state.mjs';
import {mappingContext} from '../src/harmonic/harmonic-context.mjs';
import {bootApp} from './support/dom.mjs';
const close = (a, b, t = 1e-6) => assert.ok(Math.abs(a - b) < t, `${a} != ${b}`),
  s = makeState('meantone');
assert.equal(tuningMethods.length, 5);
for (const method of tuningMethods) {
  const r = applyTuningMethod({...s, g: 690}, {method});
  assert.equal(r.tuning, method);
  assert.ok(Number.isFinite(r.g));
  assert.notEqual(r.g, 690);
  if (method !== 'EDO') close(r.p, 1200);
}
for (const method of ['Weil–Euclidean', 'Minimax', 'Least Squares']) {
  const fixed = applyTuningMethod(s, {method, fixed: true, period: 1190});
  close(fixed.p, purePeriod(s));
  const free = applyTuningMethod(s, {method, fixed: false});
  assert.ok(Math.abs(free.p - 1190) > 1);
  assert.equal(free.tuneConfig.fixed, false);
  const saved = presetSnapshot('Saved ' + method, free);
  assert.equal(saved.tuning, method);
  assert.equal(saved.tuneConfig.fixed, false);
}
const we = applyTuningMethod(s, {method: 'Weil–Euclidean', fixed: true, period: 1200});
close(we.g, weilTune(s, true).g);
const j = applyTuningMethod(s, {method: 'JI Target'}),
  m = mapRatio(5, 4, j);
close(m[0] * j.p + m[1] * j.g, 1200 * Math.log2(5 / 4));
const freeJI = applyTuningMethod(j, {fixed: false});
close(m[0] * freeJI.p + m[1] * freeJI.g, 1200 * Math.log2(5 / 4));
assert.notEqual(freeJI.p, j.p);
const outside = applyTuningMethod(
  {...s, explore: {ratio: '7/4', m: [-5, 10]}},
  {method: 'JI Target', fixed: true}
);
close(-5 * outside.p + 10 * outside.g, 1200 * Math.log2(7 / 4));
assert.deepEqual(outside.rows, s.rows);
const saved = presetSnapshot('Outside target', outside);
assert.deepEqual(saved.explore.m, [-5, 10]);
assert.equal(saved.explore.ratio, '7/4');
assert.equal(saved.tuning, 'JI Target');
const multi = {
  ...j,
  assignments: [
    {label: '3/2', c: 1200 * Math.log2(3 / 2), m: [0, 1]},
    {label: '5/4', c: 1200 * Math.log2(5 / 4), m: [-2, 4]}
  ]
};
assert.throws(
  () => applyTuningMethod(multi, {method: 'JI Target', jiAll: true, fixed: true}),
  /cannot all be pure/
);
const fitted = applyTuningMethod(multi, {method: 'JI Target', jiAll: true, fixed: false});
for (const t of multi.assignments) close(t.m[0] * fitted.p + t.m[1] * fitted.g, t.c);
for (const comma of ['128/125', '245/243']) {
  const temp = fromCommas(comma, comma === '128/125' ? '2.3.5' : '3.5.7');
  const r = applyTuningMethod(temp, {
    method: 'Weil–Euclidean',
    fixed: true,
    period: purePeriod(temp)
  });
  close(r.p, purePeriod(temp));
}
assert.equal(tuningMethod({...s, tuning: 'Prime least squares'}), 'Least Squares');
assert.equal(tuningConfig({...s, tuning: 'Published WE'}).fixed, true);
console.log(
  'All five tuning methods apply, fixed/free periods, WE/CWE equivalence, single and multiple JI constraints, outside mappings, non-octave periods and preset round trips passed.'
);
for (const comma of ['81/80', '128/125', '245/243']) {
  const temp = fromCommas(comma, comma === '245/243' ? '3.5.7' : '2.3.5');
  assert.equal(tuningConfig(temp).fixed, true);
  close(temp.p, purePeriod(temp));
  const free = applyTuningMethod(temp, {method: 'Weil–Euclidean', fixed: false});
  const restored = applyTuningMethod(free, {fixed: true, period: 999});
  close(restored.p, purePeriod(temp));
}
assert.equal(tuningConfig(makeState('porcupine11')).fixed, true);
close(makeState('porcupine11').p, 1200);
console.log('Optimize-period defaults, inverse checkbox, and reference-period restoration passed.');

assert.equal(tuningConfig(s).targets, 'primes');
for (const tuning of ['Prime Least Squares', 'Prime least squares']) {
  const legacy = {...s, tuning, tuneConfig: {targets: '13', method: tuning}};
  assert.equal(tuningMethod(legacy), 'Least Squares');
  assert.equal(tuningConfig(legacy).targets, 'primes');
}
// Harmonic jobs serialize the whole temperament state and reject undefined values, so every tuning
// method must leave a state that has never explored a target without an `explore` key at all.
for (const start of [
  makeState('meantone'),
  validateState(makeState('meantone')),
  makeState('miracle11')
])
  for (const method of tuningMethods) {
    let tuned;
    try {
      tuned = applyTuningMethod(start, {method});
    } catch (e) {
      continue;
    }
    assert.ok(
      !Object.values(tuned).includes(undefined),
      `${method}: no field of the tuned state is undefined`
    );
    assert.equal(
      Object.hasOwn(tuned, 'explore'),
      method === 'JI Target',
      `${method}: explore is present only when a target was explored`
    );
    assert.doesNotThrow(
      () => canonicalHarmonicJSON({state: tuned}),
      `${method}: the tuned state serializes for harmonic jobs`
    );
    assert.equal(
      mappingContext(tuned).id,
      mappingContext(start).id,
      `${method}: tuning does not change the mapping`
    );
  }
// An existing exploration survives retuning.
{
  const explored = applyTuningMethod(s, {method: 'JI Target', pure: '5/4'});
  assert.ok(explored.explore);
  const retuned = applyTuningMethod(explored, {method: 'Minimax'});
  assert.deepEqual(retuned.explore, explored.explore);
  assert.doesNotThrow(() => canonicalHarmonicJSON({state: retuned}));
}
console.log('Visible period checkbox retunes immediately and restores the pure period.');

// In the app, the tuning menu and its options apply immediately.
const page = await bootApp(),
  {$, $$} = page;
await page.until(
  () => /chords · complete/.test($('[data-unified-pane="directory"]')?.textContent ?? ''),
  {message: 'the first catalogue'}
);
async function current() {
  page.click('#save');
  return JSON.parse(await page.downloaded(/session\.json$/)).states[0];
}
async function choose(selector, value) {
  page.change(selector, value);
  await page.settle();
  return current();
}
for (const method of tuningMethods) {
  const before = await current(),
    after = await choose('[data-field="tuning"]', method);
  assert.equal(tuningMethod(after), method, `${method} is applied from the menu`);
  assert.notEqual(after.g, before.g, `${method} retunes the generator`);
  assert.equal($('[data-field="tuning"]').value, method);
}
// Optimize period is a visible checkbox: checked frees the period, unchecked restores the pure one.
await choose('[data-field="tuning"]', 'Weil–Euclidean');
let tuned = await choose('[data-optimize-period="0"]', true);
assert.equal(tuningConfig(tuned).fixed, false);
assert.notEqual(tuned.p, 1200);
tuned = await choose('[data-optimize-period="0"]', false);
assert.equal(tuningConfig(tuned).fixed, true);
close(tuned.p, 1200);

await choose('[data-field="tuning"]', 'Minimax');
const targets = await choose('.advanced-tuning-options [data-tune="targets"]', '7');
assert.equal(tuningConfig(targets).targets, '7', 'method options apply immediately');

// The tuning menu and the stacked tuning values share the primary row; period optimization and
// method-specific controls sit in the collapsed Advanced tuning options below them.
const choice = $('.tuning-choice'),
  advanced = $('.advanced-tuning-options'),
  follows = (a, b) =>
    Boolean(a.compareDocumentPosition(b) & page.window.Node.DOCUMENT_POSITION_FOLLOWING);
assert.equal(choice.firstElementChild.tagName, 'LABEL');
assert.ok(choice.firstElementChild.querySelector('select[data-field="tuning"]'));
assert.ok(choice.firstElementChild.nextElementSibling.matches('.tuning-summary'));
assert.ok($('.tuning-summary .period-summary'));
assert.ok(follows($('.tuning-summary'), advanced));
assert.equal(advanced.querySelector('summary').textContent, 'Advanced tuning options');
const optimize = $('[data-optimize-period="0"]').closest('label');
assert.equal(optimize.textContent, 'Optimize period');
assert.ok(advanced.contains(optimize), 'period optimization is inside the advanced section');
assert.ok(advanced.querySelector('.header-popover-panel [data-tune="targets"]'));
assert.equal($('#tuning-panel .tuning-report'), null);
assert.equal($('[data-tune="period"]'), null);
assert.equal($('.tuning-controls'), null, 'the separate Tuning options menu is removed');
assert.ok(
  $$('summary').every(summary => summary.textContent !== 'Tuning options'),
  'the separate Tuning options menu is removed'
);

// The JI target explorer plays the chosen interval.
await choose('[data-field="tuning"]', 'JI Target');
const voices = page.audio.started.length;
page.click('[data-explore="listen"]');
await page.settle();
assert.equal(page.audio.started.length - voices, 2, 'Hear interval plays both notes');

// The custom mapping editor applies a mapping and keeps the tuning; an invalid one changes nothing.
const before = await current();
$('[data-custom="rows"]').value = '1 1 0\n0 1 4\n0 0 1';
page.click('[data-action="mapping"]');
await page.settle();
assert.notEqual(page.toast(), 'Custom mapping applied; choose a tuning next');
assert.deepEqual(await current(), before, 'an invalid mapping changes nothing');
$('[data-custom="rows"]').value = '1 1 0\n0 1 4';
page.click('[data-action="mapping"]');
await page.settle();
assert.equal(page.toast(), 'Custom mapping applied; choose a tuning next');
const custom = await current();
assert.deepEqual(
  [custom.key, custom.name, custom.tuning, custom.rows, custom.g],
  ['custom', 'Custom temperament', 'Manual', before.rows, before.g]
);
assert.deepEqual(page.errors, []);
console.log(
  'Actual dropdown, tuning-option, Optimize period, JI explorer and custom mapping controls apply immediately.'
);
await page.close();
