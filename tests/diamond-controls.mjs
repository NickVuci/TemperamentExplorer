import assert from 'node:assert/strict';
import {bootApp, cssRules, parseHtml} from './support/dom.mjs';

// The page: one set of approximation controls, parked until a view places them.
const index = parseHtml(),
  $index = selector => index.querySelector(selector),
  count = selector => index.querySelectorAll(selector).length;
assert.equal(count('#target-controls'), 1);
assert.equal(count('#targetfilter'), 1);
assert.ok($index('#approximation-module.approximation-module'));
assert.ok($index('section.analysis-workspace#analysis-explore'));
assert.equal(
  count('[data-view]'),
  0,
  'Discover has no sub-tab buttons; the diamond is the centre pane of the unified screen'
);
assert.equal(count('.toolbar'), 0);
const module = $index('section#approximation-module');
assert.ok(module.querySelector('#limit') && module.querySelector('#primeLimit'));
const toleranceHost = module.querySelector('div#diamond-tolerance-host.diamond-tolerance-host');
assert.ok(
  toleranceHost.hidden && toleranceHost.innerHTML === '',
  'tolerance control host lives in the approximation module'
);
assert.equal($index('#tolerance').type, 'hidden');

const matrixOptions = $index(
  'details#matrix-controls.matrix-controls.advanced-approximation-options'
);
assert.equal(
  matrixOptions.querySelector(':scope > summary').textContent,
  'Advanced matrix options'
);
assert.equal(matrixOptions.open, false);
const arrangement = matrixOptions.querySelector('div.matrix-option-fields > label');
assert.equal(arrangement.firstChild.textContent, 'Arrangement');
assert.ok(arrangement.querySelector('select#layout'));
assert.equal(matrixOptions.querySelector('.targetlegend, .legend, .labeltoggle'), null);
const labelControls = $index('#matrix-label-controls.labeltoggle');
assert.match(labelControls.textContent, /Cell labels/);
assert.ok(labelControls.querySelector('[data-label="cents"]'));

const advanced = $index('details#ji-controls.advanced-approximation-options');
assert.equal(advanced.open, false);
assert.equal(advanced.querySelector('#tolerance'), null);
assert.doesNotMatch(advanced.textContent, /Tolerance · cents/);
const sourceLabel = advanced.querySelector('#diamond-scope[data-diamond-scope]').closest('label');
assert.match(sourceLabel.firstChild.textContent, /^Approximation source/);
const help = sourceLabel.querySelector('span#diamond-scope-help.viewnote');
assert.equal(help.getAttribute('aria-live'), 'polite');
assert.equal(help.textContent, '');
const span = advanced.querySelector('div#diamond-span-controls');
assert.equal(span.innerHTML, '');
assert.ok(span.nextElementSibling.matches('div[data-diamond-settings]:empty'));

// The stylesheet.
const css = cssRules(),
  top = {media: null},
  // Top-level rules unless a media query is named.
  value = (selector, name, options = top) => css.value(selector, name, options),
  values = (selector, names, options = top) => names.map(name => value(selector, name, options)),
  narrow = {media: 'max-width:900px'};
assert.deepEqual(
  css.find('#play-view .sectionhead.has-diamond-tolerance'),
  [],
  'the Play tab has no tolerance-control layout rule'
);
assert.equal(
  value('.diamond-tolerance-host', 'margin-left'),
  'auto',
  'tolerance control aligns to the right of the analysis tabs'
);
assert.equal(value('.diamond-canvas', 'position', top), 'relative');
assert.deepEqual(values('.diamond-source-control .viewnote', ['display', 'min-height', 'color']), [
  'block',
  '2.7em',
  'var(--muted)'
]);
assert.equal(
  value('.diamond-source-control .viewnote.is-empty', 'visibility'),
  'hidden',
  'an empty helper reserves the same height so the source selector does not shift'
);
assert.deepEqual(
  values(
    '.diamond-source-control',
    ['position', 'inset', 'z-index', 'border-width', 'background', 'box-shadow'],
    top
  ),
  ['absolute', 'auto auto 14px 0', '3', '0px', 'transparent', 'none']
);
assert.deepEqual(
  values('.diamond-canvas-tools', ['position', 'flex-wrap', 'pointer-events'], top),
  ['static', 'wrap', 'auto'],
  'readout occupies normal flow and cannot cover the diamond'
);
assert.deepEqual(
  values(
    '.diamond-detail',
    [
      'width',
      'max-width',
      'overflow-x',
      'background',
      'min-height',
      'overflow-y',
      'pointer-events'
    ],
    top
  ),
  ['max-content', '100%', 'auto', 'transparent', '0px', 'auto', 'auto'],
  'readout shrinks to its data and scrolls inside its own transparent area'
);
assert.deepEqual(
  values('.diamond-canvas-tools', ['grid-template-columns', 'height'], {media: 'min-width:901px'}),
  ['minmax(0, 1fr)', '180px'],
  'a stable desktop band prevents live chord updates from moving the keys under the pointer'
);
assert.deepEqual(values('.diamond-canvas-tools', ['position', 'order'], narrow), ['static', '1']);
assert.equal(value('.diamond-scroll', 'order', narrow), '0');
assert.deepEqual(values('.diamond-source-control', ['position', 'order'], narrow), ['static', '2']);
assert.deepEqual(values('.diamond-pointer-controls', ['position', 'order'], narrow), [
  'static',
  '3'
]);
assert.ok(
  css
    .find('.diamond-detail')
    .every(rule => !rule.selector.replace(/\s+/g, ' ').includes('.diamond-pointer-controls')),
  'the readout is never grouped with the pointer controls, whose margin and width would move it'
);
assert.deepEqual(
  values(
    '.diamond-pointer-controls',
    [
      'position',
      'display',
      'flex-direction',
      'min-height',
      'margin',
      'padding-bottom',
      'background'
    ],
    top
  ),
  ['relative', 'flex', 'column', '104px', '12px 0px 0px auto', '14px', 'transparent'],
  'pointer action sits at the bottom right in flow below the diamond, so it cannot cover cells, and is tall enough to hold the source control beside it'
);
assert.deepEqual(
  values('.diamond-pointer-controls .diamond-selection-actions', [
    'display',
    'grid-template-columns'
  ]),
  ['grid', 'repeat(2, minmax(0, 1fr))'],
  'select-mode actions are compact so they stay clear of the diamond'
);
assert.deepEqual(
  values('.diamond-chord-heading', ['height', 'overflow', 'white-space']),
  ['20px', 'hidden', 'nowrap'],
  'the chord notation has a fixed reserved row that cannot push interval data down'
);
assert.deepEqual(
  values('.diamond-interval-table', ['width', 'border-collapse', 'background']),
  ['max-content', 'collapse', 'transparent'],
  'table columns shrink to their values'
);
assert.equal(
  value('.diamond-interval-table thead', 'border-bottom'),
  '1px solid var(--border-strong)',
  'one shared divider spans all intervals'
);
assert.ok(
  css.rules.every(
    rule =>
      !/\.diamond-interval-columns|\.diamond-interval-column\b/.test(rule.selector) &&
      rule.style.getPropertyValue('width') !== 'min(45%, 540px)'
  ),
  'the expanded per-ratio layout is removed'
);
assert.deepEqual(values('.diamond-controls', ['grid-template-columns', 'max-width'], top), [
  'repeat(2, minmax(0, 250px))',
  '520px'
]);
assert.deepEqual(values('.tonality-diamond', ['max-width', 'min-width'], top), [
  'none',
  'var(--diamond-min-width, 0)'
]);
// Mobile canvases constrain and centre the entire diamond instead of keeping its desktop minimum
// width.
assert.deepEqual(
  values('.diamond-scroll', ['box-sizing', 'width', 'min-width', 'overflow-x'], narrow),
  ['border-box', '100%', '0px', 'hidden']
);
assert.deepEqual(
  values(
    '.diamond-scroll > .tonality-diamond',
    ['box-sizing', 'width', 'min-width', 'max-width', 'height', 'margin'],
    narrow
  ),
  ['border-box', '100%', '0px', '100%', 'auto', '0px auto']
);
assert.equal(
  value('.matrix-option-fields', 'grid-template-columns'),
  'repeat(2, minmax(0, 300px))'
);
assert.equal(value('.matrix-option-fields label', 'max-width'), '300px');
assert.equal(value('.matrix-options-host', 'padding'), '0px 14px 10px');
assert.ok(css.find('.diamond-panel > .advanced-approximation-options').length);
const options = '#analysis-explore .advanced-approximation-options[open]';
assert.equal(
  value('.advanced-approximation-options[open]', 'grid-template-columns', top),
  'repeat(3, minmax(0, 1fr))'
);
assert.deepEqual(values(options, ['max-width', 'grid-template-columns'], top), [
  'none',
  'repeat(3, minmax(0, 1fr))'
]);
assert.deepEqual(values(`${options} > label`, ['grid-column', 'width'], top), ['auto', '100%']);
assert.equal(
  value(`${options} .diamond-selection-controls`, 'grid-template-columns', top),
  'repeat(2, minmax(0, 1fr))'
);
assert.equal(value(options, 'grid-template-columns', narrow), 'repeat(2, minmax(0, 1fr))');
assert.equal(value(options, 'grid-template-columns', {media: 'max-width:620px'}), 'minmax(0, 1fr)');

// The running app: views place the parked controls, and leaving a view parks them again.
const page = await bootApp(),
  {$} = page,
  ready = () =>
    page.until(
      () => /chords · complete/.test($('[data-unified-pane="directory"]')?.textContent ?? ''),
      {message: 'the catalogue'}
    ),
  host = () => $('#diamond-tolerance-host');
await ready();

// Discover with the diamond in the centre: the tolerance control is shown in the approximation
// module, the advanced options sit in the diamond panel, and the source selector on its canvas.
assert.equal(host().hidden, false, 'Discover keeps the tolerance control visible');
assert.ok(host().querySelector('[data-diamond-tolerance]'));
assert.ok(host().parentElement.classList.contains('has-diamond-tolerance'));
assert.equal($('#ji-controls').parentElement, $('.diamond-pair .diamond-panel'));
const source = $('#diamond-scope').closest('label');
assert.ok(source.classList.contains('diamond-source-control'));
assert.equal(source.parentElement, $('.diamond-canvas'));
assert.notEqual($('[data-diamond-settings]').innerHTML, '', 'diamond options are mounted');
assert.equal(
  $('.harmony-heading #ji-controls'),
  null,
  'diamond controls are not in the chord header'
);
for (const control of [
  'Pointer action',
  'Diamond layout options',
  'Harmonics in display order',
  'Select otonal line',
  'Select utonal line'
])
  assert.ok($('#discover-view').textContent.includes(control), control);
assert.ok($('.diamond-canvas > .diamond-canvas-tools:first-child'));
assert.doesNotMatch($('#discover-view').textContent, /Pure · 0¢/);

// The source explanation follows the approximation-source selection, not the interval detail.
for (const [scope, text] of [
  ['scale', 'Scale checks all intervals in the current scale matrix.'],
  ['mode', 'Mode checks tonic-relative notes in the current mode.'],
  ['mapping', '']
]) {
  page.change('#diamond-scope', scope);
  await page.settle();
  assert.equal($('#diamond-scope-help').textContent, text);
  assert.equal($('#diamond-scope-help').classList.contains('is-empty'), !text);
  if (text) assert.ok(!$('#diamond-detail-0').textContent.includes(text));
}

// The matrix in the centre takes the matrix options and cell-label controls; the diamond's go back.
page.click('[data-unified-center="matrix"]');
await page.settle();
assert.equal($('#matrix-controls').parentElement, $('[data-matrix-controls-host]'));
assert.equal($('#matrix-label-controls').parentElement, $('[data-matrix-labels-host]'));
assert.equal($('#ji-controls').parentElement, $('#ji-controls-parking'));
assert.equal(host().hidden, false, 'the matrix keeps the tolerance control visible');
page.click('[data-unified-center="diamond"]');
await page.settle();
assert.equal($('#matrix-controls').parentElement, $('#matrix-controls-parking'));
assert.equal($('#matrix-label-controls').parentElement, $('#matrix-label-controls-parking'));

// Play and Create hide the tolerance control and park the diamond controls.
for (const section of ['play', 'create']) {
  page.section(section);
  await page.settle();
  assert.equal(host().hidden, true, `${section} hides the tolerance control`);
  assert.equal(host().innerHTML, '');
  assert.ok(!host().parentElement.classList.contains('has-diamond-tolerance'));
  assert.equal($('#ji-controls').parentElement, $('#ji-controls-parking'));
}

// The chord and HexBoard workspaces read the shared JI settings.
page.section('discover');
await page.settle();
page.change('#limit', 9);
await page.settle();
page.section('play');
await page.settle();
page.click('#save');
const saved = JSON.parse(await page.downloaded(/session\.json$/)),
  tolerance = Number($('#tolerance').value);
assert.equal(saved.chords.limit, 9);
assert.equal(saved.hexboard.configs[0].limit, 9);
assert.equal(saved.chords.tol, tolerance);
assert.equal(saved.hexboard.configs[0].tolerance, tolerance);

// A divided octave offers the target span beside the diamond.
page.chooseTemperament('pajara7');
page.section('discover');
await page.settle();
await ready();
assert.match($('#diamond-span-controls').textContent, /^Target span/);
assert.deepEqual(page.errors, []);
console.log(
  'Diamond controls are parked centrally and placed in the diamond and matrix workspaces.'
);
await page.close();
