import assert from 'node:assert/strict';
import {makeState} from '../src/core/catalog.mjs';
import {validateState} from '../src/core/state.mjs';
import {createMaterialWorkspace} from '../src/ui/material-ui.mjs';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';
import {chordCoordinates} from '../src/hexboard/hexboard-chords.mjs';
import {bootApp, cssRules, parseHtml} from './support/dom.mjs';

// The collection and the HexBoard workspace: a 7-note Discover scale beside a 31-note Play layout.
const states = [{...makeState('meantone'), n: 7, mode: 2}],
  board = [{...structuredClone(states[0]), n: 31, mode: 0}];
let placed, heard, notice, loaded;
const collection = createMaterialWorkspace({
  getState: () => states[0],
  play: (p, k) => (heard = {p, k}),
  place: x => (placed = x),
  load: x => (loaded = x),
  refresh: () => {},
  notify: x => (notice = x),
  validate: validateState
});
collection.addScale();
const scaleItem = collection.serialize()[0];
assert.equal(scaleItem.state.n, 7);
assert.equal(scaleItem.coords.length, 7);
const coords = chordCoordinates(states[0], [0, 2, 4], {2: 1});
collection.add('chord', states[0], coords, 'Test chord');
collection.change({dataset: {materialName: '1'}, value: 'Renamed chord'});
collection.click({dataset: {material: 'hear', i: '0'}});
assert.equal(heard.k, 'scale');
assert.equal(heard.p.length, 7);
collection.click({dataset: {material: 'place', i: '1'}});
assert.deepEqual(placed.coords, coords);
const saved = JSON.parse(JSON.stringify(collection.serialize()));
collection.restore(null);
collection.restore(saved);
assert.equal(collection.serialize()[1].label, 'Renamed chord');
assert.deepEqual(collection.serialize()[1].coords, coords);
let exported;
const hex = createHexboardWorkspace({
  getStates: () => board,
  play: () => {},
  refresh: () => {},
  notify: e => (notice = e),
  download: (name, body) => (exported = body),
  getHz: () => 220
});
const click = action => hex.click({closest: () => ({dataset: {hexAction: action}})});
click('export');
const before = exported;
const count = hex.showScale(scaleItem.coords, scaleItem.label);
assert.ok(count > 0);
const html = hex.render();
assert.match(html, /7\/7 notes represented/);
assert.match(html, /scale-highlight/);
assert.equal(board[0].n, 31);
assert.equal(states[0].n, 7);
click('export');
assert.deepEqual(
  JSON.parse(exported, (k, v) => (/IdHex$/.test(k) ? undefined : v)),
  JSON.parse(before, (k, v) => (/IdHex$/.test(k) ? undefined : v)),
  'Temporary scale highlight must not change export'
);
hex.clearHighlight();
assert.ok(!hex.render().includes('class="scale-highlight"'));
assert.ok(hex.showChord(coords, 'Voiced chord') > 0);
assert.equal(hex.chordMode(), 'places', 'a placed collection chord opens Chord → places');
assert.match(hex.render(), /Voiced chord/);
assert.equal(board[0].n, 31);
const original = states[0].g;
states[0].g += 0.1;
placed = null;
collection.click({dataset: {material: 'place', i: '1'}});
assert.equal(placed, null);
assert.match(notice, /source tuning/);
collection.click({dataset: {material: 'load', i: '1'}});
assert.equal(loaded.g, original);
collection.click({dataset: {material: 'remove', i: '0'}});
assert.equal(collection.serialize().length, 1);

// Page structure: three sections; temperament and tuning live in the header on every page; there
// is no setup row, top scale control or comparison view.
const index = parseHtml(),
  $index = selector => index.querySelector(selector);
assert.deepEqual(
  [...index.querySelectorAll('[id^="tab-"]')].map(tab => tab.id),
  ['tab-discover', 'tab-play', 'tab-create']
);
assert.equal($index('#create-view h2').textContent, 'Composition suite');
assert.equal($index('[data-view="hexboard"]'), null, 'Play is the sole HexBoard entry point.');
assert.equal(
  $index('#tab-compare, #compare-view, #compare-chooser, [data-view^="compare-"]'),
  null
);
assert.equal($index('#choose-view, #explore-view, .explore-scale-controls, .discover-setup'), null);
assert.equal($index('#explore-scale-controls, #discover-setup'), null);
assert.ok($index('#discover-view #analysis-explore'));
const inspector = $index('#inspector');
assert.ok(inspector.hidden && inspector.childNodes.length === 0, 'the empty inspector is hidden');
const header = $index('header.app-header'),
  setup = header.querySelector('.header-setup'),
  follows = (a, b) => Boolean(a.compareDocumentPosition(b) & 4);
assert.ok(follows(header.querySelector('.main-tabs'), setup));
assert.ok(
  follows(setup.querySelector('#temperament-section'), setup.querySelector('#tuning-section'))
);
const temperamentOptions = setup.querySelector('details#advanced-temperament-options');
assert.equal(
  temperamentOptions.querySelector(':scope > summary').textContent,
  'Advanced temperament options'
);
assert.ok(
  temperamentOptions.querySelector(':scope > summary + div.header-popover-panel'),
  'advanced temperament options open as a panel below the header'
);
assert.ok(temperamentOptions.querySelector('details#advanced-temperament'));
assert.ok(temperamentOptions.querySelector('#advanced-temperament-editor'));
const css = cssRules();
assert.ok(css.find('#play-view .hex-layout').length);
assert.deepEqual(css.find('#create-view .hex-layout'), []);

// The running app.
const page = await bootApp(),
  {$, $$, document} = page,
  ready = () =>
    page.until(
      () => /chords · complete/.test($('[data-unified-pane="directory"]')?.textContent ?? ''),
      {message: 'the catalogue'}
    );
await ready();

// Discover scale controls: concise labels, and coverage milestones inside Advanced scale options
// after the scale filter.
const scaleHead = $('.scale-head');
assert.deepEqual(
  [...scaleHead.querySelectorAll('label')].map(label => label.firstChild.textContent),
  ['Scale', 'Mode']
);
const advancedScale = $('details.scale-advanced');
assert.equal(advancedScale.querySelector('summary').textContent, 'Advanced scale options');
assert.ok(
  follows(
    advancedScale.querySelector('[data-scale-filter]'),
    advancedScale.querySelector('section.scale-milestones')
  ),
  'coverage milestones are inside Advanced scale options, after the scale filter'
);
assert.equal($('header [data-field="n"]'), null, 'the header has no scale control');
assert.doesNotMatch(document.body.textContent, /Select an interval cell to inspect it/);
assert.ok(document.body.textContent.includes('Use scale in Play'));
assert.doesNotMatch(document.body.textContent, /Use scale in Create/);

// The app has no global keyboard note map.
for (const key of ['z', 's', 'q', '1', '0', '-', '=']) page.key(document.body, key);
await page.settle();
assert.equal(page.audio.started.length, 0, 'typing does not play notes');

// Only one temperament editor remains, inside Advanced temperament options, after redraws.
page.change('[data-field="tuning"]', 'Minimax');
await page.settle();
page.change('[data-field="tuning"]', 'Weil–Euclidean');
await page.settle();
assert.equal($$('.temperament-editor').length, 1);
assert.ok($('#advanced-temperament-editor .temperament-editor'));

// Use scale in Play hands the Discover scale to Play.
page.change('[data-field="mode"]', '2');
await page.settle();
page.click('[data-hex-open="0"]');
await page.settle();
assert.equal($('#play-view').hidden, false, 'Use scale in Play opens Play');
assert.deepEqual(
  [$('[data-hex-field="target"]').value, $('[data-hex-field="mode"]').value],
  ['7', '2']
);
assert.deepEqual(page.errors, []);

// Each section shows its own view. The analysis workspace moves between Discover and Play, and the
// material collection belongs to Create.
for (const section of ['discover', 'play', 'create', 'discover']) {
  page.section(section);
  await page.settle();
  for (const name of ['discover', 'play', 'create'])
    assert.equal($(`#${name}-view`).hidden, name !== section, `${section}: #${name}-view`);
  const workspace = $('#analysis-explore'),
    material = $('#material-host');
  if (section === 'create') {
    assert.notEqual(
      workspace.parentElement,
      $('#create-view'),
      'Create does not take the workspace'
    );
    assert.equal(material.parentElement, $('#create-view'), 'the collection belongs in Create');
    assert.equal(material.hidden, false);
    assert.ok(!$('#create-view').contains($('#ji-controls')), 'Create has no shared JI controls');
  } else {
    assert.equal(workspace.parentElement, $(`#${section}-view`));
    assert.ok(!$('#discover-view').contains(material), 'the collection is not in Discover');
    assert.equal(material.hidden, true, 'the collection stays hidden outside Create');
  }
}

// Discover is one unified screen: every older Discover view restores into it, and the old matrix
// view keeps the matrix in the centre.
for (const [settings, want, center] of [
  [{view: 'choose', lastViews: {explore: 'targets'}}, 'discover', 'diamond'],
  [{view: 'matrices', lastViews: {explore: 'scales'}}, 'discover', 'matrix'],
  [{view: 'chords', lastViews: {discover: 'chords'}}, 'discover', 'diamond'],
  [{view: 'unified', unifiedCenter: 'matrix'}, 'discover', 'matrix'],
  [{view: 'hexboard', lastViews: {create: 'hexboard'}}, 'play', 'diamond'],
  [{view: 'composition', lastViews: {create: 'composition'}}, 'create', 'diamond'],
  [{view: 'compare-matrices', lastViews: {discover: 'targets'}}, 'discover', 'diamond'],
  [{}, 'discover', 'diamond']
]) {
  const label = JSON.stringify(settings);
  await page.openSession({
    format: 'temperament-lab-v1',
    workflowVersion: 8,
    states: [makeState('meantone')],
    settings
  });
  assert.equal(page.toast(), 'Session opened', label);
  assert.equal($(`#${want}-view`).hidden, false, `${label} opens ${want}`);
  page.click('#save');
  const {lastViews} = JSON.parse(await page.downloaded(/session\.json$/)).settings;
  assert.deepEqual(
    lastViews,
    {discover: 'unified', play: 'hexboard', create: 'composition'},
    label
  );
  page.section('discover');
  await page.settle();
  assert.equal($('.unified-workspace').dataset.unifiedCenterView, center, label);
  assert.equal(
    $('.scale-details').dataset.scaleView,
    'line',
    'sessions without a scale view open on the line'
  );
}
assert.deepEqual(page.errors, []);
console.log(
  'Discover/Play/Create routing; independent layout scale; collection naming, playback, source checks, persistence; 7-note highlight on 31-note board; voiced chord placement; unchanged exports; legacy session navigation passed.'
);
await page.close();
