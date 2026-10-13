import assert from 'node:assert/strict';
import {bootApp, cssRules, parseHtml} from './support/dom.mjs';

const css = cssRules(),
  wide = {media: 'min-width:641px'},
  phone = {media: 'max-width:640px'};

// The header floats above the page on every screen that is wide enough to afford it.
assert.equal(css.value('.app-header', 'position', wide), 'sticky', 'an opaque sticky header');
assert.equal(css.value('.app-header', 'top', wide), '0px');
assert.equal(css.value('.app-header', 'z-index', wide), '200');
assert.equal(css.value('.app-header', 'background', wide), 'var(--bg)');
assert.match(
  css.value('html', 'scroll-padding-top', wide),
  /^calc\(var\(--header-h/,
  'scroll targets clear the header'
);
assert.ok(
  css
    .find('.app-header')
    .filter(rule => !(rule.media ?? '').replace(/\s+/g, '').includes('min-width:641px'))
    .every(rule => rule.style.getPropertyValue('position') !== 'sticky'),
  'phones keep a scrolling header: it is several rows tall there'
);

// It sits above every other layer, including its own popovers, so panels never fall behind page
// content.
const zIndexes = css.rules
  .map(rule => Number(rule.style.getPropertyValue('z-index')))
  .filter(Number.isFinite);
assert.equal(Math.max(...zIndexes), 200, 'the header is the topmost layer');
assert.ok(parseHtml().querySelector('header.app-header'));

// Discover panels move with the page rather than sticking below the header.
for (const panel of ['.unified-directory', '.unified-analysis'])
  assert.ok(
    css.find(panel).every(rule => rule.style.getPropertyValue('position') !== 'sticky'),
    `${panel} scrolls with the page`
  );

// In a stacked phone header the row flex-bases must not become heights.
for (const section of ['#temperament-section', '#tuning-section']) {
  assert.match(css.value(`.header-setup ${section}`, 'flex', phone), /^none$|^0 0 auto$/);
  assert.equal(css.value(`.header-setup ${section}`, 'max-width', phone), 'none');
}

// The header height is measured and tracked.
const page = await bootApp(),
  height = () => page.document.documentElement.style.getPropertyValue('--header-h');
assert.equal(height(), '0px');
page.resize('.app-header', {width: 1200, height: 132});
assert.equal(height(), '132px', 'the header height follows resizes');
page.resize('.app-header', {width: 400, height: 260});
assert.equal(height(), '260px');
console.log('sticky-header: ok');
await page.close();
