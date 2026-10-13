import assert from 'node:assert/strict';
import {makeState} from '../src/core/catalog.mjs';
import {
  DEFAULT_ODD_LIMIT,
  ODD_LIMIT_VALUES,
  PRIME_LIMIT_VALUES
} from '../src/core/ji-limit-engine.mjs';
import {createChordWorkspace} from '../src/ui/chord-ui.mjs';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';
import {bootApp, cssRules, parseHtml} from './support/dom.mjs';
const states = [makeState('meantone')];
assert.equal(DEFAULT_ODD_LIMIT, 15);
let ji = {limit: 5, primeLimit: 3, tol: 2};
const opts = {
  getStates: () => states,
  getJI: () => ji,
  play: () => {},
  refresh: () => {},
  notify: e => {
    throw Error(e);
  },
  getHz: () => 220
};
const chords = createChordWorkspace(opts),
  hex = createHexboardWorkspace(opts);
chords.render();
hex.render();
assert.equal(chords.serialize().limit, 5);
assert.equal(chords.serialize().primeLimit, 3);
assert.equal(hex.serialize().configs[0].limit, 5);
assert.equal(hex.serialize().configs[0].primeLimit, 3);
ji = {limit: 11, primeLimit: 7, tol: 20};
chords.render();
hex.render();
assert.equal(chords.serialize().tol, 20);
assert.equal(chords.serialize().primeLimit, 7);
assert.equal(hex.serialize().configs[0].tolerance, 20);
assert.equal(hex.serialize().configs[0].limit, 11);
assert.equal(hex.serialize().configs[0].primeLimit, 7);
ji = {limit: 15, primeLimit: [2, 3, 5, 11], tol: 6};
chords.render();
hex.render();
assert.deepEqual(chords.serialize().primeLimit, [2, 3, 5, 11]);
assert.deepEqual(hex.serialize().configs[0].primeLimit, [2, 3, 5, 11]);
const subgroupChord = chords.serialize(),
  subgroupHex = hex.serialize();
chords.restore(subgroupChord, () => {});
hex.restore(subgroupHex);
assert.deepEqual(chords.serialize().primeLimit, [2, 3, 5, 11]);
assert.deepEqual(hex.serialize().configs[0].primeLimit, [2, 3, 5, 11]);
ji = {limit: 11, primeLimit: 7, tol: 20};
assert.doesNotMatch(chords.render(), /data-chord-field="(?:limit|tol)"/);
assert.doesNotMatch(hex.render(), /data-hex-field="(?:limit|tolerance)"/);
const saved = chords.serialize();
saved.limit = 13;
saved.tol = 1;
delete saved.primeLimit;
chords.restore(saved, () => {});
assert.equal(chords.serialize().limit, 11);
assert.equal(chords.serialize().primeLimit, 7);
assert.equal(chords.serialize().tol, 20);
assert.ok(ODD_LIMIT_VALUES.every(n => n % 2 === 1));
assert.ok(
  PRIME_LIMIT_VALUES.every(n =>
    PRIME_LIMIT_VALUES.filter(p => p <= n).every(p => n === p || n % p !== 0)
  )
);

// One shared set of JI controls in the page.
const html = parseHtml();
for (const id of ['limit', 'primeLimit', 'tolerance', 'target-controls', 'matrix-controls'])
  assert.equal(html.querySelectorAll(`#${id}`).length, 1, `one #${id}`);
assert.equal(html.querySelector('#showoutside'), null);
assert.equal(html.querySelector('#ji-controls-parking').hidden, true);
const limitInput = html.querySelector('#limit');
assert.deepEqual(
  ['type', 'min', 'max', 'step', 'value'].map(name => limitInput.getAttribute(name)),
  ['number', '3', '97', '2', '15']
);
const primeInput = html.querySelector('#primeLimit');
assert.deepEqual([primeInput.type, primeInput.getAttribute('value')], ['text', 'basis']);
assert.match(html.body.textContent, /Prime-limit\/basis/);
assert.equal(html.querySelector('#tolerance').type, 'hidden');
assert.ok(html.querySelector('#target-controls.target-controls'));
const module = html.querySelector('#approximation-module');
assert.ok(module.querySelector('#limit') && module.querySelector('#primeLimit'));
const advanced = html.querySelector('details#ji-controls.advanced-approximation-options');
assert.ok(advanced.querySelector('#diamond-scope[data-diamond-scope]'));
assert.ok(advanced.querySelector('[data-diamond-settings]'));
assert.doesNotMatch(advanced.textContent, /Tolerance · cents/);
assert.equal(
  html.querySelector('details.advanced-approximation-options[open]'),
  null,
  'advanced options start closed'
);

const css = cssRules();
assert.deepEqual(
  ['margin', 'padding', 'border-width'].map(name =>
    css.value('.advanced-approximation-options', name)
  ),
  ['8px 0px 0px', '0px', '0px']
);
assert.equal(css.value('.advanced-approximation-options[open]', 'display'), 'grid');
assert.equal(
  css.value('.advanced-approximation-options[open]', 'grid-template-columns', {media: null}),
  'repeat(3, minmax(0, 1fr))'
);
assert.deepEqual(css.find('.diamond-gradient'), []);
assert.equal(css.value('.matrix .cell .target-chip', 'color'), 'rgb(17, 21, 28)');

// In the app, the target controls sit in the approximation module and sessions carry the shared
// settings.
const page = await bootApp(),
  {$} = page,
  save = async () => {
    page.click('#save');
    return JSON.parse(await page.downloaded(/session\.json$/));
  };
await page.until(
  () => /chords · complete/.test($('[data-unified-pane="directory"]')?.textContent ?? ''),
  {message: 'the first catalogue'}
);
assert.equal($('#target-controls').parentElement, $('#approximation-module'));
assert.equal($('#target-controls').nextElementSibling, $('#diamond-tolerance-host'));
assert.equal(page.document.querySelector('[data-compare], .compare-matrices'), null);
page.change('#primeLimit', '7');
page.change('#limit', 9);
await page.settle();
let session = await save();
assert.equal(session.workflowVersion, 8);
assert.equal(session.states.length, 1, 'one temperament per session');
assert.deepEqual(
  [session.settings.limit, session.settings.primeLimit, session.settings.manualTolerance],
  ['9', '7', null]
);
assert.equal(session.settings.tonic, 220);
page.change('#primeLimit', 'not a prime');
await page.settle();
assert.equal((await save()).settings.primeLimit, 'basis', 'an invalid prime filter falls back');

// Older sessions: no prime filter before version 5 means the basis, and a manual tolerance is
// only read from version 7.
const older = (workflowVersion, settings) =>
  page.openSession({...session, workflowVersion, settings: {...session.settings, ...settings}});
await older(4, {primeLimit: undefined, manualTolerance: 5});
session = await save();
assert.deepEqual([session.settings.primeLimit, session.settings.manualTolerance], ['basis', null]);
await older(7, {primeLimit: '7', manualTolerance: 5});
session = await save();
assert.deepEqual([session.settings.primeLimit, session.settings.manualTolerance], ['7', 5]);

// Reset restores the default odd limit.
page.click('#reset');
await page.settle();
assert.equal($('#limit').value, String(DEFAULT_ODD_LIMIT));
assert.deepEqual(page.errors, []);
console.log(
  'Odd and prime filters share settings across chord and HexBoard workspaces; valid selector ranges are generated centrally.'
);
await page.close();
