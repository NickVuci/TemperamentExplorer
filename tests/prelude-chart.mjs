// The Prelude panel's harmony chart: selection, keyboard editing, drag to reorder, renaming and
// the inspector, through the real app in a DOM.
import assert from 'node:assert/strict';
import {bootApp} from './support/dom.mjs';

const page = await bootApp();
const {$, $$} = page;
page.section('create');
page.click('[data-comp="new"]');
await page.settle();
$('.prelude-panel').open = true;
for (const id of ['open', 'fall', 'cadence']) {
  page.click(`[data-comp="prelude-template"][data-value="${id}"]`);
  await page.settle();
}

const chord = i => $(`[data-comp="prelude-slot"][data-index="${i}"]`);
const roots = () => $$('.harm-root').map(n => n.textContent);
const sections = () =>
  $$('.harm-section').map(s => [
    s.querySelector('.harm-section-name').textContent,
    s.querySelectorAll('.harm-cell').length
  ]);
const selected = () =>
  $$('.harm-cell').flatMap((c, i) => (c.classList.contains('is-selected') ? [i] : []));

// ---- the chart: one cell per harmony, grouped by section, each with its voicing ----
assert.deepEqual(
  sections().map(s => s[0]),
  ['Opening', 'Falling bass', 'Cadence']
);
const count = $$('.harm-cell').length;
assert.ok(count >= 8, 'three sections of harmonies');
assert.equal(
  $$('.harm-cell .harm-voicing circle.is-bass').length,
  count,
  'each cell draws its bass'
);
assert.match(
  $('.harm-inspector').getAttribute('aria-label'),
  /Selected section/,
  'a newly added section is selected'
);
assert.ok($$('.harm-section')[2].classList.contains('is-selected'));
assert.equal($$('[data-comp="prelude-slot"][tabindex="0"]').length, 1, 'the chart is one tab stop');

// ---- selecting a chord opens the inspector on it, and pressing again keeps it selected ----
page.click(chord(1));
assert.deepEqual(selected(), [1]);
assert.match($('.harm-inspector').getAttribute('aria-label'), /Selected chord/);
assert.match($('.harm-what').textContent, /chord 2 of/);
page.click(chord(1));
assert.deepEqual(selected(), [1], 'a second press sounds it again rather than deselecting');

// ---- keyboard: arrows select, Shift+arrows move, up/down change the root ----
const before = roots();
page.key(chord(1), 'ArrowRight');
assert.deepEqual(selected(), [2]);
assert.equal(page.document.activeElement?.dataset.index, '2', 'focus follows the selection');
page.key(chord(2), 'ArrowLeft', {shiftKey: true});
assert.deepEqual(selected(), [1], 'the moved chord stays selected');
assert.deepEqual(roots(), [before[0], before[2], before[1], ...before.slice(3)], 'neighbours swap');
const rootNow = Number.parseInt(roots()[1], 10);
page.key(chord(1), 'ArrowUp');
assert.equal(Number.parseInt(roots()[1], 10), (rootNow + 1) % 7, 'the root steps up a degree');

// ---- Ctrl+D repeats, Delete removes and passes the selection on, Ctrl+Z undoes ----
page.key(chord(1), 'd', {ctrlKey: true});
assert.equal($$('.harm-cell').length, count + 1);
assert.deepEqual(selected(), [2]);
page.key(chord(2), 'Delete');
assert.equal($$('.harm-cell').length, count);
assert.deepEqual(selected(), [2], 'the next chord takes the selection');
page.key(chord(2), 'z', {ctrlKey: true});
assert.equal($$('.harm-cell').length, count + 1, 'undo from the chart restores the chord');
page.key($('.harm-chart'), 'y', {ctrlKey: true});
assert.equal($$('.harm-cell').length, count, 'redo removes it again');

// ---- the + on a bar line adds a copy of that chord after it ----
page.click($$('.harm-plus')[0]);
assert.equal($$('.harm-cell').length, count + 1);
assert.deepEqual(selected(), [1]);
assert.equal(roots()[1], roots()[0]);

// ---- dragging a chord into another section, and a section to the end ----
const rect = (el, left, width) => {
  el.getBoundingClientRect = () => ({left, width, top: 0, height: 100, right: left + width});
};
async function drag(from, to, x) {
  page.document.elementFromPoint = () => to;
  page.pointer(from, 'pointerdown', {clientX: 0, clientY: 0});
  page.pointer(from, 'pointermove', {clientX: x, clientY: 0});
  assert.ok(to.closest('.harm-cell, .harm-section').hasAttribute('data-drop'), 'drop is marked');
  page.pointer(from, 'pointerup', {clientX: x, clientY: 0});
  await page.settle();
}
const [openingSize, fallSize] = sections().map(s => s[1]);
const lastOfFall = openingSize + fallSize - 1;
const target = chord(lastOfFall).closest('.harm-cell');
rect(target, 100, 72);
const moved = roots()[0];
await drag(chord(0), chord(lastOfFall), 160);
assert.deepEqual(
  sections().map(s => s[1]),
  [openingSize - 1, fallSize + 1, sections()[2][1]],
  'the chord leaves its section for the one it was dropped in'
);
assert.equal(roots()[lastOfFall], moved, 'it lands after the target');
assert.deepEqual(selected(), [lastOfFall]);
assert.equal($$('[data-drop]').length, 0, 'the drop mark is cleared');

const lastSection = $$('.harm-section')[2];
rect(lastSection, 400, 200);
await drag($('.harm-section-name'), lastSection, 590);
assert.deepEqual(
  sections().map(s => s[0]),
  ['Falling bass', 'Cadence', 'Opening'],
  'the section moves to the end'
);

// ---- a selected section can be renamed ----
page.click($$('.harm-section-name')[1]);
assert.match($('.harm-inspector').getAttribute('aria-label'), /Selected section/);
page.change('[data-comp-field="preludesection-name"]', '  Close  ');
assert.equal(sections()[1][0], 'Close');
page.change('[data-comp-field="preludesection-name"]', '   ');
assert.equal(sections()[1][0], 'Close', 'a blank name is ignored');

// ---- Escape clears the selection ----
page.click(chord(0));
page.key(chord(0), 'Escape');
assert.deepEqual(selected(), []);
assert.ok($('.harm-inspector.is-idle'));

assert.deepEqual(page.errors, []);
console.log('prelude-chart: ok');
await page.close();
