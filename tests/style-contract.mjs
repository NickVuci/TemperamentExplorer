// Protect the retained cascade (including responsive rule order) while removing
// unused legacy selectors and extracting constants. No browser is required.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {transform} from 'esbuild';
import {cssRules} from './support/dom.mjs';

const extracted = [
  '--board-bg',
  '--border-strong',
  '--control-bg',
  '--detail-text',
  '--font-mono',
  '--font-ui',
  '--inset-bg'
];
async function canonical(source) {
  source = (await transform(source, {loader: 'css', minifyWhitespace: true})).code;
  // Formatting is not part of the cascade: custom-property values and media queries keep their own
  // spacing through minification, and decimals may be written with or without a leading zero.
  source = source.replace(/([:,(])\s+/g, '$1').replace(/(?<![\w.])0\.(?=\d)/g, '.');
  const root = source.match(/:root\{([^}]+)\}/)[1];
  const constants = Object.fromEntries(
    [...root.matchAll(/(--[\w-]+):([^;]+);?/g)].map(m => [m[1], m[2]])
  );
  for (const name of extracted) source = source.replace(new RegExp(name + ':[^;}]+;?'), '');
  source = source.replace(/var\((--[\w-]+)\)/g, (match, name) => constants[name] ?? match);
  return (await transform(source, {loader: 'css', minifyWhitespace: true})).code;
}
const source = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const current = await canonical(source.split('/* Period wrapping controls */')[0]);
if (process.argv[2]) {
  const baseline = await canonical(readFileSync(process.argv[2], 'utf8'));
  assert.equal(current, baseline, 'Retained rules must match the pre-refactor cascade.');
  console.log(createHash('sha256').update(baseline).digest('hex'));
} else {
  const expected = '1b3a178b19f2cf89dc3b885574b62f349eceb24913137e68c7117fbcac023a35';
  assert.equal(createHash('sha256').update(current).digest('hex'), expected);
}

// Individual rules, read through the parsed stylesheet.
const css = cssRules(source),
  top = {media: null},
  value = (selector, name, options = top) => css.value(selector, name, options),
  values = (selector, names, options = top) => names.map(name => value(selector, name, options)),
  // One rule lists all of these selectors.
  grouped = (...selectors) =>
    css
      .find(selectors[0], top)
      .some(rule => selectors.every(selector => css.find(selector, top).includes(rule)));
assert.equal(value('.matrix', '--matrix-cell-height'), '32px');
assert.equal(value('.matrixscroll', 'overflow'), 'auto');
assert.ok(css.rules.some(rule => rule.selector.includes('.hex-primary-controls')));
assert.deepEqual(
  values('.discover-module select', ['height', 'border-radius']),
  ['32px', '6px'],
  'Discover dropdowns share one height and control style'
);
assert.equal(
  value('.discover-scale .formrow', 'grid-template-columns'),
  'repeat(2, minmax(0, 1fr))',
  'the scale size and mode controls share one row'
);
assert.equal(
  value('.discover-scale .scale-advanced', 'border-width'),
  '0px',
  'the Discover scale disclosure has no outline'
);
assert.equal(
  value('.discover-module .tuning-choice > .tuning-summary', 'margin'),
  '15px 0px 0px',
  'Generator and Period align with the tuning select field'
);
for (const selector of [
  '.discover-module .tuning-summary > span',
  '.discover-module .tuning-summary .period-summary > span'
])
  assert.deepEqual(
    values(selector, ['width', 'justify-content']),
    ['100%', 'space-between'],
    'Generator and Period labels are left aligned while cent values share a right edge'
  );
assert.match(
  value('.hex-custom-color .hex-controls', 'grid-template-columns'),
  /^96px /,
  'selected-button title width stays fixed as its number changes'
);
assert.equal(value('.hex-custom-color .hex-controls h4', 'width'), '96px');
assert.deepEqual(
  values('.hex-live-chord-readout', ['height', 'min-height']),
  ['100px', '100px'],
  'live chord readout reserves a fixed desktop footprint'
);
assert.equal(
  value('.hex-live-chord-readout', 'height', {media: 'max-width:560px'}),
  '124px',
  'mobile live chord readout keeps a fixed responsive footprint'
);
const topControls = '#play-view .hex-primary-controls.hex-top-controls';
assert.ok(
  value(topControls, 'grid-template-columns').includes('repeat(2, minmax(100px, 1fr))') &&
    value(topControls, 'gap') === '8px',
  'instrument and primary controls share one grid row'
);
assert.deepEqual(
  values('#play-view .hex-primary-controls > label > span', ['min-height', 'align-items']),
  ['32px', 'flex-end'],
  'control captions have a shared height so their fields align'
);
const pressed = '#play-view .hex-primary-controls .hex-toggle-button[aria-pressed="true"]';
assert.ok(
  /^rgb/.test(value(pressed, 'background')) && value(pressed, 'box-shadow'),
  'active layout toggles have a visible illuminated state'
);

// The advanced menus share one wrapper, summary and expanded style.
const menus = [
  '.discover-module .advanced-temperament-options',
  '.discover-module .advanced-tuning-options',
  '#play-view .layout-settings'
];
const wrapper = ['margin', 'padding', 'border-width', 'background', 'border-radius'],
  wrapperValues = ['8px 0px 0px', '0px', '0px', 'transparent', '0px'],
  summary = ['padding', 'line-height', 'font-size', 'color', 'margin'],
  summaryValues = ['6px 0px', '20px', '14px', 'var(--muted)', '0px'];
assert.ok(grouped(...menus), 'layout and Discover advanced menus share their wrapper styling');
assert.ok(grouped(...menus.map(menu => `${menu} > summary`)));
assert.ok(grouped(...menus.map(menu => `${menu}[open]`)));
for (const menu of [...menus, '.advanced-approximation-options']) {
  assert.deepEqual(values(menu, wrapper), wrapperValues, `${menu} uses the advanced-menu wrapper`);
  assert.deepEqual(
    values(`${menu} > summary`, summary),
    summaryValues,
    `${menu} uses the advanced-menu typography`
  );
  assert.deepEqual(
    values(`${menu}[open]`, ['padding-bottom', 'border-bottom-width']),
    ['14px', '0px'],
    `${menu} uses the advanced-menu expanded spacing`
  );
}
assert.equal(
  value('.advanced-approximation-options > label', 'margin'),
  '8px 0px',
  'the nested odd-limit selector has advanced-menu label spacing'
);
const position = (selector, options) => css.rules.indexOf(css.find(selector, options).at(-1));
assert.ok(
  css.find(menus[0]).every(rule => rule.media === null) &&
    position(menus[0], top) > position(topControls, {media: 'max-width:450px'}),
  'advanced menu rules remain outside responsive grid media queries'
);
