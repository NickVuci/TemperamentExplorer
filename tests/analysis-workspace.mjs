import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {targets} from '../src/core/engine.mjs';
import {makeState} from '../src/core/catalog.mjs';
import {primeFilterForBasis} from '../src/core/ji-limit-engine.mjs';
import {target} from '../src/core/assignments.mjs';
import {renderDiamond, diamondApproximation} from '../src/diamond/tonality-diamond.mjs';
import {errorColor} from '../src/core/ji-error-color.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {createDiamondWorkspace} from '../src/diamond/diamond-workspace.mjs';
import {renderMatrix} from '../src/app/matrix-view.mjs';
import {intervalDetails, fillDiamondDetails} from '../src/app/diamond-details.mjs';
import {createJISettings} from '../src/app/ji-settings.mjs';
import {bootApp, cssRules, parseHtml} from './support/dom.mjs';

// Shared settings as the app resolves them from its controls, with a fixed 10 ¢ tolerance.
const controls = {
  limit: '13',
  primeLimit: 'basis',
  layout: 'distance',
  labels: 'ratios',
  filter: 'all'
};
const state = makeState('meantone');
let current = state,
  scope = 'mapping';
const settings = (s = current) => {
  const limit = Number(controls.limit),
    primeLimit = controls.primeLimit === 'basis' ? primeFilterForBasis(s.basis) : null;
  return {
    limit,
    primeLimit,
    layout: controls.layout,
    labels: controls.labels,
    ts: targets(limit, primeLimit),
    tol: 10,
    maxError: 10,
    filter: controls.filter,
    outside: true
  };
};

// One scale's interval matrix; the diamond is the single centre panel, with its approximation
// settings in the collapsed advanced menu.
const matrixHtml = () => renderMatrix(current, settings()).html;
assert.match(matrixHtml(), /aria-label="Scale interval matrix"/);
assert.doesNotMatch(matrixHtml(), /Difference|B minus A|aria-label="[AB] interval matrix"/);
assert.match(matrixHtml(), /style="background:#fff;color:#11151c"/);
const diamondHtml = renderDiamond(current, 0, {...settings(), scope}, '1/1', '');
assert.doesNotMatch(
  diamondHtml,
  /Approximation source<select data-diamond-scope>/,
  'approximation settings live in the collapsed advanced menu'
);
assert.equal((diamondHtml.match(/class="diamond-panel"/g) || []).length, 1);
assert.equal((diamondHtml.match(/data-diamond-scope/g) || []).length, 0);
const renderedMatrix = matrixHtml();
assert.ok(
  renderedMatrix.indexOf('data-matrix-labels-host') < renderedMatrix.indexOf('<table'),
  'cell-label options host stays above the matrix canvas'
);
assert.equal((renderedMatrix.match(/data-matrix-labels-host/g) || []).length, 1);
assert.ok(
  renderedMatrix.indexOf('</table>') < renderedMatrix.indexOf('data-matrix-controls-host'),
  'matrix options host follows the matrix canvas'
);
assert.equal((renderedMatrix.match(/data-matrix-controls-host/g) || []).length, 1);
const advanced = parseHtml().querySelector('details#ji-controls.advanced-approximation-options'),
  source = advanced.querySelector('select#diamond-scope[data-diamond-scope]');
assert.match(source.closest('label').firstChild.textContent, /^Approximation source/);
assert.ok(advanced.querySelector('#diamond-span-controls'));
assert.ok(advanced.querySelector('[data-diamond-settings]'));
assert.equal(errorColor(0, 10), '#fff');
// A cell as the diamond builds it: its status is the one approximation it sounds.
const cellFor = (ratio, cellScope = scope) => {
  const t = target(ratio);
  return {
    ...t,
    label: ratio,
    c: 1200 * Math.log2(t.n / t.d),
    status: diamondApproximation(current, t, {...settings(), scope: cellScope})
  };
};
const jiDetails = intervalDetails(cellFor('3/2'), 10);
assert.match(jiDetails, /<th scope="col" title="JI interval">3\/2<\/th>/);
assert.match(jiDetails, /<td title="JI cents">701\.955¢<\/td>/);
assert.doesNotMatch(
  jiDetails,
  /data-ji-target|Play JI interval|<button|¢ error|approximation-heading-row|Mapped · best|<small>/
);
assert.match(jiDetails, /style="--approximation-color:/);
for (const [first, second] of [
  ['JI interval', 'JI cents'],
  ['JI cents', 'Tempered cents'],
  ['Tempered cents', 'Signed deviation from JI']
])
  assert.ok(jiDetails.indexOf(`title="${first}"`) < jiDetails.indexOf(`title="${second}"`));
// The selected target's details in every approximation source, span and filter.
for (const s of [
  state,
  makeState('porkypine'),
  fromCommas('128/125', '2.3.5'),
  fromCommas('245/243', '3.5.7')
]) {
  current = s;
  for (const octave of [false, true])
    for (const cellScope of ['mapping', 'scale', 'mode'])
      for (const filter of ['all', 'mapped', 'hits']) {
        s.matrixOctave = octave;
        scope = cellScope;
        controls.filter = filter;
        for (const ratio of ['3/2', '5/3']) {
          const details = intervalDetails(cellFor(ratio), 10);
          assert.ok(details.includes(ratio));
          assert.doesNotMatch(details, /data-ji-target|Play JI interval|undefined|NaN/);
        }
      }
}
scope = 'mapping';
controls.filter = 'all';
controls.limit = '15';
// A mapped interval absent from the scale shows only the reading the cell sounds, not a second candidate.
current = {...makeState('meantone'), n: 5, mode: 0};
{
  const cell = cellFor('16/15'),
    single = intervalDetails(cell, 10);
  assert.equal((single.match(/title="Tempered cents"/g) || []).length, 1, 'one reading per cell');
  assert.match(single, new RegExp(cell.status.approximation.c.toFixed(3)));
}
controls.labels = 'cents';
current = makeState('porkypine');
assert.equal(settings().primeLimit.join('.'), '2.3.5.11');
assert.ok(!settings().ts.some(t => t.label === '7/4'));
assert.ok(settings().ts.some(t => t.label === '11/8'));

// The app's shared settings resolver: defaults and overrides.
const fields = {
  '#limit': {value: '15'},
  '#primeLimit': {value: 'basis', dataset: {}},
  '#layout': {value: 'distance'},
  '#labels': {value: 'cents'},
  '#tolerance': {value: ''},
  '#targetfilter': {value: 'mapped'}
};
let resolved = makeState('meantone'),
  manual = null;
const ji = createJISettings({
  $: id => fields[id],
  getState: () => resolved,
  getDiamondScope: () => 'mapping',
  getManualTolerance: () => manual,
  diamondLayout: () => ({})
});
for (const [s, expected] of [
  [makeState('meantone'), 5],
  [makeState('porkypine'), [2, 3, 5, 11]],
  [fromCommas('245/243', '3.5.7'), [3, 5, 7]]
]) {
  resolved = s;
  const cfg = ji.current();
  assert.equal(cfg.limit, 15);
  assert.equal(JSON.stringify(cfg.primeLimit), JSON.stringify(expected));
  assert.ok(Number.isFinite(cfg.tol) && cfg.tol >= 0);
  assert.equal(cfg.tol, ji.automaticTolerance(), 'the automatic tolerance applies by default');
  assert.equal(fields['#tolerance'].value, String(cfg.tol), 'the active tolerance is published');
}
manual = 7;
assert.deepEqual([ji.current().tol, ji.current().toleranceAutomatic], [7, false]);
manual = null;
resolved = makeState('porkypine');
assert.ok(!ji.current().ts.some(t => t.label === '7/4'));
fields['#primeLimit'].value = '11';
assert.ok(ji.current().ts.some(t => t.label === '7/4'));
resolved = makeState('meantone');
assert.equal(ji.current().primeLimit, 11, 'explicit override survives temperament changes');
fields['#primeLimit'].value = '';
assert.equal(ji.current().primeLimit, null);
fields['#primeLimit'] = {value: '2.3.5', dataset: {basisValue: '2.3.5'}};
assert.equal(
  ji.coverage(resolved).primeLimitSelection,
  'basis',
  'the shown basis follows the basis'
);

// The real selection/playback -> details path, without replacing the SVG.
current = state;
controls.filter = 'mapped';
const cellDetail = {innerHTML: '', hidden: false},
  chordDetail = {innerHTML: '', hidden: true};
const detailPanel = {
  hidden: true,
  querySelector: selector =>
    selector === '[data-diamond-cell-detail]'
      ? cellDetail
      : selector === '[data-diamond-chord]'
        ? chordDetail
        : null
};
const liveDiamond = createDiamondWorkspace({
  document: {querySelector: () => null, querySelectorAll: () => []},
  getState: () => current,
  refresh() {},
  notify() {},
  play() {},
  onInspect() {},
  onChordChange: () => fill()
});
const fill = () => fillDiamondDetails(detailPanel, liveDiamond, () => 10);
liveDiamond.restore({harmonics: '4:5:6', fold: false, interaction: 'select', selected: []});
liveDiamond.render(settings(), '');
fill();
assert.equal(
  detailPanel.hidden,
  true,
  'no default interval details without selected or playing cells'
);
assert.equal(cellDetail.innerHTML, '');
assert.equal(chordDetail.innerHTML, '');
liveDiamond.press({dataset: {diamondKey: '1:0'}});
assert.equal(detailPanel.hidden, false);
assert.match(cellDetail.innerHTML, /title="JI interval">5\/4/);
liveDiamond.press({dataset: {diamondKey: '1:0'}});
assert.equal(detailPanel.hidden, true, 'deselecting the final cell clears the readout');
assert.equal(cellDetail.innerHTML, '');

liveDiamond.press({dataset: {diamondKey: '0:0'}});
assert.equal(cellDetail.hidden, false);
assert.equal(chordDetail.hidden, true);
assert.match(cellDetail.innerHTML, /1\/1/);
liveDiamond.press({dataset: {diamondKey: '1:0'}});
liveDiamond.press({dataset: {diamondKey: '2:0'}});
assert.equal(cellDetail.hidden, true);
assert.equal(cellDetail.innerHTML, '', 'single interval data disappears during a chord');
assert.equal(chordDetail.hidden, false);
assert.match(chordDetail.innerHTML, /<h4>4:5:6<\/h4>/);
assert.equal(
  (chordDetail.innerHTML.match(/scope="col"/g) || []).length,
  3,
  'each distinct played interval has its own compact column'
);
assert.equal(
  (chordDetail.innerHTML.match(/<thead>/g) || []).length,
  1,
  'one shared JI group supplies the continuous divider'
);
assert.doesNotMatch(chordDetail.innerHTML, /diamond-detail-heading/, 'no per-ratio dividers');
const rows = [...chordDetail.innerHTML.matchAll(/<tr>(.*?)<\/tr>/g)].map(match =>
  [...match[1].matchAll(/<(?:th|td)[^>]*>(.*?)<\/(?:th|td)>/g)].map(cell => cell[1])
);
assert.equal(rows.length, 4);
liveDiamond.chordDisplay().tuning.intervals.forEach((interval, index) => {
  assert.equal(rows[0][index], interval.ratio);
  assert.equal(rows[1][index], `${interval.idealCents.toFixed(3)}¢`);
  assert.equal(rows[2][index], `${interval.temperedCents.toFixed(3)}¢`);
  assert.equal(
    rows[3][index],
    `${interval.errorCents >= 0 ? '+' : ''}${interval.errorCents.toFixed(2)}¢`
  );
});
for (const [index, interval] of liveDiamond.chordDisplay().tuning.intervals.entries()) {
  const single = intervalDetails(
    liveDiamond.displayCells().find(cell => cell.label === interval.ratio),
    10
  );
  const singleRows = [...single.matchAll(/<tr>(.*?)<\/tr>/g)].map(match =>
    [...match[1].matchAll(/<(?:th|td)[^>]*>(.*?)<\/(?:th|td)>/g)].map(cell => cell[1])
  );
  assert.equal(singleRows.length, 4, 'single intervals have exactly the same four rows as chords');
  for (let row = 0; row < 4; row++)
    assert.equal(
      singleRows[row][0],
      rows[row][index],
      'the single interval and chord column display the same data'
    );
  assert.doesNotMatch(
    single,
    /class="approximation|<small>|diamond-detail-heading/,
    'no extra mapping text or separate block layout'
  );
}

assert.ok(
  chordDetail.innerHTML.indexOf('diamond-chord-heading') <
    chordDetail.innerHTML.indexOf('diamond-chord-approximation'),
  'JI above tempered'
);
assert.doesNotMatch(chordDetail.innerHTML, /Playing ·|Selected ·|Tempered ·|JI chord/);
assert.doesNotMatch(chordDetail.innerHTML, /¢ total error|¢ error/);
const selectedChord = liveDiamond.chordDisplay();
const colouredRows = [...chordDetail.innerHTML.matchAll(/<tr>(.*?)<\/tr>/g)]
  .slice(2)
  .map(match => [...match[1].matchAll(/--approximation-color:([^"]+)/g)].map(cell => cell[1]));
const expectedColors = selectedChord.tuning.intervals.map(interval =>
  errorColor(interval.errorCents, settings().maxError)
);
assert.ok(
  new Set(expectedColors).size > 1,
  'fixture distinguishes interval colours from an aggregate colour'
);
for (const row of colouredRows)
  assert.deepEqual(
    row,
    Array.from(expectedColors),
    'each tempered value and error matches its diamond interval colour'
  );
assert.match(chordDetail.innerHTML, /all 3 note pairs/);
liveDiamond.restore({...liveDiamond.serialize(), interaction: 'play'});
liveDiamond.render(settings(), '');
liveDiamond.updatePlaying([{id: '0:0'}, {id: '0:1'}, {id: '0:2'}]);
assert.match(chordDetail.innerHTML, /1\/6:5:4/);
assert.doesNotMatch(chordDetail.innerHTML, /Playing ·|JI chord/);
assert.equal(cellDetail.hidden, true);
liveDiamond.updatePlaying([{id: '0:1'}]);
assert.equal(chordDetail.hidden, true);
assert.equal(cellDetail.hidden, false);
assert.match(
  cellDetail.innerHTML,
  /4\/5/,
  'the remaining active interval replaces the chord, rather than the last pressed cell'
);
liveDiamond.updatePlaying([]);
assert.equal(chordDetail.hidden, false);
assert.match(
  chordDetail.innerHTML,
  /<h4>4:5:6<\/h4>/,
  'a persistent selection returns after release'
);
liveDiamond.click({closest: () => ({dataset: {diamondAction: 'clear'}})});
assert.equal(detailPanel.hidden, true, 'clear selection clears both readouts');
assert.equal(cellDetail.innerHTML, '');
assert.equal(chordDetail.innerHTML, '');
liveDiamond.updatePlaying([{id: '0:1'}]);
assert.equal(detailPanel.hidden, false, 'a playing interval shows data without selection');
assert.match(cellDetail.innerHTML, /title="JI interval">4\/5/);
liveDiamond.updatePlaying([]);
assert.equal(detailPanel.hidden, true, 'releasing the final playing interval clears the readout');
assert.equal(cellDetail.innerHTML, '');
liveDiamond.updatePlaying([{id: '0:0'}, {id: '0:1'}, {id: '0:2'}]);
assert.equal(chordDetail.hidden, false);
liveDiamond.updatePlaying([]);
assert.equal(detailPanel.hidden, true, 'releasing an unselected chord clears the readout');
assert.equal(chordDetail.innerHTML, '');
liveDiamond.restore({
  harmonics: '4:5:6',
  fold: false,
  interaction: 'select',
  selected: ['0:0', '1:0']
});
liveDiamond.render(settings(), '');
fill();
liveDiamond.press({dataset: {diamondKey: '1:0'}});
assert.match(
  cellDetail.innerHTML,
  /title="JI interval">1\/1/,
  'deselecting one of two cells shows the remaining selected interval'
);
liveDiamond.render({...settings(), scope: 'mode'}, '');
fill();
assert.equal(detailPanel.hidden, true, 'invalidated selections leave no stale details');

liveDiamond.restore({
  harmonics: '4:5:7',
  fold: false,
  interaction: 'select',
  selected: ['0:0', '1:0', '2:0']
});
liveDiamond.render(settings(), '');
fill();
assert.match(chordDetail.innerHTML, /4:5:7/);
assert.match(chordDetail.innerHTML, /Some notes have no available approximation/);
assert.match(chordDetail.innerHTML, /title="Tempered cents">—/);
assert.match(
  chordDetail.innerHTML,
  /title="Signed deviation from JI">—/,
  'unavailable notes never masquerade as zero error'
);
assert.doesNotMatch(
  chordDetail.innerHTML,
  /Total chord error:/,
  'incomplete chord has no aggregate score'
);
assert.match(
  chordDetail.innerHTML,
  /title="JI interval">5\/4/,
  'available member columns remain visible'
);
assert.match(
  jiDetails,
  /^<div class="diamond-chord-heading" aria-hidden="true"><\/div>/,
  'single intervals reserve the chord heading row'
);
assert.equal(
  cssRules().value('.diamond-chord-heading h4', 'color'),
  'rgb(255, 255, 255)',
  'the JI chord stays white'
);

// Sessions: one temperament per file, and older files restore their primary temperament. Only the
// temperament is checked here, so the fixture's odd-limit setting is left out.
const page = await bootApp(),
  legacy = JSON.parse(
    readFileSync(new URL('./fixtures/magic19-session.json', import.meta.url), 'utf8')
  );
delete legacy.settings.limit;
await page.openSession(legacy);
assert.equal(page.toast(), 'Session opened');
page.click('#save');
const restored = JSON.parse(await page.downloaded(/session\.json$/)).states;
assert.equal(restored.length, 1);
assert.equal(restored[0].key, legacy.states[0].key);
assert.deepEqual(restored[0].basis, legacy.states[0].basis);
assert.equal(restored[0].n, legacy.states[0].n);
await page.openSession({...legacy, states: []});
assert.match(page.toast(), /Temperament Lab session/);
assert.deepEqual(page.errors, []);
console.log(
  'Single-state matrix and JI diamond rendering, exact subgroup targets, shared settings, one-state session export, and legacy primary-state restoration passed.'
);
await page.close();
