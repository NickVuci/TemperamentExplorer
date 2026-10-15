import assert from 'node:assert/strict';
import {bootApp} from './support/dom.mjs';
import {physicalKey, commands} from '../src/hexboard/hexboard.mjs';
import {fingeringInstances} from '../src/hexboard/hexboard-chords.mjs';

const page = await bootApp(),
  {$} = page;
page.chooseTemperament('meantone');
page.section('play');
if ($('[data-shape-action="clear-targets"]')) page.click('[data-shape-action="clear-targets"]');
page.input('[data-shape-draft]', '4:5:6');
page.click('[data-shape-action="add"]');
page.change('[data-shape-field="rootKey"]', 65);
await page.until(
  () =>
    !!$('[data-shape-action="select"]') &&
    $('.shape-explorer').textContent.includes('complete within the selected limits'),
  {message: 'the root-restricted chord shape search'}
);
page.click('[data-shape-action="select"]');
await page.until(() => !!$('#fingering-game [data-fg="start"]'), {message: 'the practice panel'});
const source = $('.fingering-choice[aria-pressed="true"]')
    .getAttribute('aria-label')
    .match(/buttons ([\d, ]+)/)[1]
    .split(',')
    .map(Number),
  node = index => $(`.hex-workspace .hex-board [data-hex-key="${index}"]`),
  board = {
    keys: Array.from({length: 140}, (_, index) => {
      const key = node(index),
        coord = key?.querySelector('title')?.textContent.match(/(-?\d+)P \+ (-?\d+)G/),
        cents = key?.getAttribute('aria-label').match(/([\d.-]+) cents/);
      return {
        ...physicalKey(index),
        command: commands.has(index),
        enabled: key?.getAttribute('aria-disabled') === 'false',
        m: coord ? [Number(coord[1]), Number(coord[2])] : [0, 0],
        c: Number(cents?.[1] ?? 0)
      };
    })
  },
  expected = fingeringInstances(board, source),
  lit = () =>
    page
      .$$('.hex-workspace .hex-board [data-hex-key].is-lit')
      .map(key => Number(key.dataset.hexKey))
      .sort((a, b) => a - b);
assert.ok(expected.length > 5, 'more than the old five positions fit this shape');
assert.equal($('#fingering-game [data-fg-count]').value, String(expected.length), 'All is default');
page.change('#fingering-game [data-fg-count]', 3);
page.click('[data-shape-action="practise"]');
assert.equal(
  $('#fingering-game [data-fg-count]').value,
  String(expected.length),
  'Practise this pattern resets a previous short drill to every matching position'
);
// Practice presses must not edit the chord even if its selection checkbox was left on.
page.click('[data-hex-action="chord-mode"][data-mode="notes"]');
page.change('[data-hex-field="selectChord"]', true);
page.click('[data-hex-action="chord-mode"][data-mode="shapes"]');
await page.until(() => !!$('[data-shape-action="select"]'), {message: 'the shape gallery'});
page.click('[data-shape-action="select"]');
page.click('#fingering-game [data-fg="start"]');
const visited = new Set();
for (let position = 0; position < expected.length; position++) {
  const target = [...expected[position].keys].sort((a, b) => a - b);
  assert.match(
    $('#fingering-game').textContent,
    new RegExp(`Position ${position + 1} of ${expected.length}`)
  );
  assert.deepEqual(lit(), target, 'the running app highlights the next matching bass position');
  visited.add(target.join(','));
  for (const key of target)
    page.pointer(node(key), 'pointerdown', {pointerId: key + 1, pointerType: 'touch'});
  for (const key of target)
    page.pointer(node(key), 'pointerup', {pointerId: key + 1, pointerType: 'touch'});
}
assert.equal(visited.size, expected.length);
assert.match(
  $('#fingering-game').textContent,
  new RegExp(`Done. ${expected.length} of ${expected.length} positions`)
);
assert.deepEqual(
  lit(),
  [...source].sort((a, b) => a - b),
  'the selected fingering is restored'
);
assert.deepEqual(page.errors, []);
console.log(
  `Fingering practice in the running app visits all ${expected.length} matching bass positions.`
);
await page.close();
