import assert from 'node:assert/strict';
import {makeState} from '../src/core/catalog.mjs';
import {createHarmonicCatalogueWorkspace} from '../src/harmonic/harmonic-catalogue-ui.mjs';
import {bootApp, cssRules, parseHtml} from './support/dom.mjs';
import {
  syncUnifiedPanelHeights,
  renderUnified,
  unifiedCenterToggle,
  unifiedCenterView,
  normalizeUnifiedCenter,
  unifiedDirectory,
  unifiedDetail
} from '../src/ui/discover-unified.mjs';

// The centre pane shows the diamond by default and borrows the single views' behaviour.
assert.equal(normalizeUnifiedCenter('matrix'), 'matrix');
assert.equal(
  normalizeUnifiedCenter('chords'),
  'diamond',
  'unknown saved values fall back to the diamond'
);
assert.equal(normalizeUnifiedCenter(undefined), 'diamond');
assert.equal(unifiedCenterView('diamond'), 'targets');
assert.equal(unifiedCenterView('matrix'), 'matrices');

const toggle = unifiedCenterToggle('matrix');
assert.match(toggle, /data-unified-center="matrix" aria-pressed="true" class="active"/);
assert.match(toggle, /data-unified-center="diamond" aria-pressed="false"/);

// Directory and analysis come from one catalogue's parts; the layout only places them.
const parts = {
  controls: '<div class="harmony-controls">C</div>',
  list: '<ol class="harmony-list">L</ol>',
  detail: '<h4>4:5:6</h4>',
  info: '<details>I</details>'
};
assert.equal(
  unifiedDirectory(parts),
  '<div class="harmony-controls">C</div><div class="unified-directory-list"><ol class="harmony-list">L</ol></div><details>I</details>'
);
assert.equal(unifiedDetail(parts), '<h4>4:5:6</h4>');

const html = renderUnified({
  center: 'diamond',
  centerMarkup: '<div class="diamond-pair">D</div>',
  directory: unifiedDirectory(parts),
  detail: unifiedDetail(parts),
  scaleControls: '<div class="formrow"><select data-field="n"></select></div>',
  scaleMarkup: '<section class="scale-details">S</section>'
});
const order = ['unified-directory', 'unified-center', 'unified-analysis', 'unified-scale'].map(
  name => html.indexOf('unified-pane ' + name)
);
assert.ok(
  order.every(i => i >= 0) && order.every((v, i, a) => !i || v > a[i - 1]),
  'directory, centre, analysis, then scale'
);
assert.match(html, /data-unified-pane="directory">[^]*harmony-list/);
assert.match(html, /data-unified-pane="detail"[^>]*>[^]*4:5:6/);
assert.match(html, /diamond-pair[^]*unified-analysis/, 'the centre markup sits in the centre pane');
assert.match(
  html,
  /unified-pane unified-scale[^]*unified-scale-controls[^]*data-field="n"[^]*scale-details/,
  'scale and mode controls sit inside the scale pane, above the scale details'
);
assert.equal(
  (html.match(/data-unified-pane=/g) || []).length,
  2,
  'only directory and analysis are refreshed by the catalogue'
);

/// The catalogue's standalone render is the same parts the unified screen places.
{
  const ui = createHarmonicCatalogueWorkspace({
    getState: () => makeState('meantone'),
    getSettings: () => ({limit: 15, primeLimit: [2, 3, 5], tol: 20})
  });
  const parts = ui.renderParts(),
    full = ui.render();
  assert.ok(
    full.includes(parts.list) && full.includes(parts.detail),
    'the standalone catalogue and the unified screen share one renderer'
  );
  ui.destroy();
}

// Static page structure: no Discover sub-tabs, and approximation settings follow the workspace.
const index = parseHtml();
assert.equal(
  index.querySelectorAll('[data-view], .workspace-tabs').length,
  0,
  'Discover has no sub-tabs'
);
const workspace = index.querySelector('#workspace'),
  approximation = index.querySelector('#approximation-settings');
assert.equal(workspace.nextElementSibling.id, 'inspector');
assert.equal(
  workspace.nextElementSibling.nextElementSibling,
  approximation,
  'approximation settings are a collapsible section after the workspace'
);
assert.equal(approximation.tagName, 'DETAILS');
assert.equal(approximation.querySelector('summary').textContent, 'Approximation settings');
assert.ok(approximation.querySelector('#approximation-settings-body'));

// The running app.
const page = await bootApp(),
  {$, $$} = page,
  directoryPane = () => $('[data-unified-pane="directory"]'),
  detailPane = () => $('[data-unified-pane="detail"]');
await page.until(() => /chords · complete/.test(directoryPane()?.textContent ?? ''), {
  message: 'the chord directory'
});
assert.ok($('.unified-main'), 'the app opens Discover on the unified screen');

// The scale pane holds the only scale and mode controls.
assert.equal($$('[data-field="n"]').length, 1);
assert.ok($('.unified-scale .unified-scale-controls [data-field="n"]'));
assert.ok($('.unified-scale .scale-details'));
assert.equal($('.explore-scale-controls'), null);

// Every redraw shows the focused harmony on the diamond and the matrix.
page.click('[data-harmony-action="directory-group"][data-group="size-3"]');
page.click('[data-harmony-action="directory-group"][data-group="size-3-otonal"]');
await page.settle();
page.click($$('[data-harmony-action="select"]').find(row => /4:5:6/.test(row.textContent)));
await page.settle();
assert.ok(
  $$('[data-diamond-key].focus-highlight').length >= 3,
  'every note of the triad is marked on the diamond'
);
page.click('[data-unified-center="matrix"]');
await page.settle();
assert.ok($$('.matrix .focus-cell').length > 0, 'and on the matrix');
page.click($('.matrix [data-cell]'), {shiftKey: true});
assert.equal($$('.matrix .chord-pick').length, 1, 'Shift-click picks a matrix cell for a chord');

// A catalogue refresh rewrites the directory but keeps the centre pane.
$('.unified-center').dataset.kept = 'yes';
const directoryBefore = directoryPane().innerHTML;
page.input('[data-harmony-field="search"]', '5:6');
await page.settle();
assert.notEqual(directoryPane().innerHTML, directoryBefore);
assert.equal($('.unified-center').dataset.kept, 'yes', 'a catalogue refresh keeps the centre');

// The manual note inspector opens in the analysis pane and survives a catalogue refresh.
page.click('[data-harmony-action="inspect"]');
await page.settle();
const inspector = detailPane().firstElementChild;
assert.ok(inspector.classList.contains('chord-workspace'));
page.input('[data-harmony-field="search"]', '');
await page.settle();
assert.equal(detailPane().firstElementChild, inspector, 'the open inspector is not replaced');

// The centre choice is saved with the session.
page.click('#save');
assert.equal(JSON.parse(await page.downloaded(/session/)).settings.unifiedCenter, 'matrix');

// Approximation settings sit below Discover and return to the header in Play.
assert.equal($('#approximation-module').parentElement.id, 'approximation-settings-body');
assert.equal($('#approximation-settings').hidden, false);
page.section('play');
await page.settle();
assert.ok(
  $('#approximation-module').parentElement.matches('#analysis-explore .sectionhead'),
  'approximation controls move back to the header in Play'
);
assert.equal($('#approximation-settings').hidden, true);
page.section('discover');
await page.settle();
assert.equal($('#approximation-module').parentElement.id, 'approximation-settings-body');
assert.deepEqual(page.errors, []);

// The scale pane follows the three main modules.
assert.match(
  html,
  /<div class="unified-main">[^]*unified-directory[^]*unified-center[^]*unified-analysis[^]*<\/div>\s*<section class="unified-pane unified-scale"/,
  'directory, centre and analysis share one wrapper that closes before the scale pane'
);
const css = cssRules();
assert.equal(
  css.value('.unified-main', 'grid-template-areas', {media: null}),
  '"directory center analysis"',
  'on wide screens directory, centre and analysis sit side by side'
);
assert.equal(
  css.value('.unified-workspace', 'grid-template-areas'),
  '',
  'the scale row follows the main grid'
);
for (const pane of ['.unified-directory', '.unified-analysis'])
  for (const [property, value] of Object.entries({
    position: 'static',
    height: 'var(--unified-center-height,auto)',
    'min-height': '0px',
    'overflow-y': 'auto'
  }))
    assert.equal(css.value(pane, property, {media: null}), value, `${pane} ${property}`);

console.log('discover-unified: ok');
await page.close();

let height = 480,
  callback,
  disconnected = 0;
const props = {};
const wrapper = {style: {setProperty: (key, value) => (props[key] = value)}};
const center = {closest: () => wrapper, getBoundingClientRect: () => ({height})};
class Observer {
  constructor(fn) {
    callback = fn;
  }
  observe(node) {
    assert.equal(node, center);
  }
  disconnect() {
    disconnected++;
  }
}
syncUnifiedPanelHeights({querySelector: () => center}, Observer);
assert.equal(props['--unified-center-height'], '480px');
height = 640;
callback();
assert.equal(props['--unified-center-height'], '640px');
syncUnifiedPanelHeights({querySelector: () => null}, Observer);
assert.equal(disconnected, 1);
