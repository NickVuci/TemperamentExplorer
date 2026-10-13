import assert from 'node:assert/strict';
import {makeState} from '../src/core/catalog.mjs';
import {bootApp, parseHtml} from './support/dom.mjs';

// The harmony directory is the only catalogue: the page has no classic-view toggle.
const index = parseHtml();
assert.equal(index.querySelector('#harmonic-version, .harmony-ab-selector'), null);
assert.doesNotMatch(index.body.textContent, /Classic view/, 'the classic-view toggle is removed');

const page = await bootApp(),
  {$, $$, document} = page,
  directory = () => $('[data-unified-pane="directory"]'),
  complete = () => /\d+ chords · complete/.test(directory()?.textContent ?? ''),
  chordCount = () => Number(directory().textContent.match(/(\d+) chords · complete/)[1]);

// Redraws replace the workspace, so the shared JI controls must be parked and returned rather
// than rebuilt: the same nodes stay connected through every redraw.
const controls = $('#ji-controls'),
  limit = $('#limit'),
  primeLimit = $('#primeLimit');
function controlsSurvive() {
  assert.equal($('#ji-controls'), controls, 'shared controls stay connected');
  assert.equal($('#limit'), limit, 'odd-limit control keeps its identity');
  assert.equal($('#primeLimit'), primeLimit, 'prime-limit control keeps its identity');
  assert.equal($$('#ji-controls').length, 1);
}
async function ready(message) {
  await page.until(complete, {message});
  controlsSurvive();
  assert.ok(chordCount() > 0, `${message}: the directory lists chords`);
}
await ready('the first catalogue');

// Each kind of mapping: 5-limit, higher limit, subgroups with gaps, divided octaves.
for (const key of ['meantone', 'magic11', 'porkypine', 'rastmic', 'pajara7', 'ennealimmal']) {
  page.chooseTemperament(key);
  controlsSurvive();
  await ready(`${key}: the catalogue refreshes`);
  assert.equal(
    $('[data-saved-preset="0"]').value,
    `builtin:${key}`,
    `${key} is the current temperament`
  );
}

// Changing the shared limit launches a new catalogue for the new target set.
page.chooseTemperament('meantone');
await ready('meantone again');
const at15 = chordCount();
page.change(limit, 9);
controlsSurvive();
await ready('the 9-odd-limit catalogue');
assert.ok(chordCount() < at15, 'a smaller limit lists fewer chords');

// Native selects close after committing a choice: the redraw does not refocus the replacement.
// Text fields keep focus and caret while the result list redraws.
const scope = $('[data-harmony-field="scope"]');
scope.focus();
page.change(scope, 'discover');
await page.settle();
assert.notEqual(
  document.activeElement?.dataset?.harmonyField,
  'scope',
  'Browse selection does not reopen its native picker during redraw'
);
page.change('[data-harmony-field="scope"]', 'temperament');
await ready('the whole-temperament catalogue');
const search = $('[data-harmony-field="search"]');
search.focus();
search.value = '4:5:6';
search.setSelectionRange(3, 3);
page.input(search);
await page.settle();
const typed = document.activeElement;
assert.equal(typed?.dataset?.harmonyField, 'search', 'typing retains focus after the redraw');
assert.equal(typed.value, '4:5:6');
assert.deepEqual(
  [typed.selectionStart, typed.selectionEnd],
  [3, 3],
  'the search caret is preserved'
);
page.input(typed, '');
await ready('the full directory');

// Leaving Discover while a catalogue is still loading keeps the controls available.
page.change(limit, 15);
page.section('play');
await page.settle();
controlsSurvive();
assert.doesNotMatch(
  $('#play-view').textContent,
  /layout alternatives|Classic/,
  'Play has no classic catalogue or layout-alternatives search'
);
page.section('discover');
await ready('the catalogue after returning to Discover');
assert.equal(chordCount(), at15);

// Old Discover view names (from sessions or handoffs) open the unified screen, and an old
// harmony-mode preference has no effect.
await page.openSession({
  format: 'temperament-lab-v1',
  workflowVersion: 7,
  harmonicMode: 'a',
  states: [makeState('meantone')],
  settings: {view: 'scales', harmonicMode: 'a'}
});
assert.equal(page.toast(), 'Session opened');
assert.equal($('#discover-view').hidden, false);
assert.ok($('.unified-main'), 'the unified screen is shown');
controlsSurvive();
await ready('the restored catalogue');
assert.deepEqual(page.errors, []);
console.log(
  'Application discovery redraws preserve shared JI controls through temperament and limit changes, pending navigation, focus handling and old session views.'
);
await page.close();
