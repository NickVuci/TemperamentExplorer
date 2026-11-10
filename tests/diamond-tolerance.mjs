import assert from 'node:assert/strict';
import {bootApp} from './support/dom.mjs';

const page = await bootApp(),
  {$} = page,
  field = () => $('[data-diamond-tolerance]'),
  reset = () => $('[data-diamond-tolerance-reset]'),
  shared = () => Number($('#tolerance').value);
async function enter(value) {
  page.change(field(), value);
  await page.settle();
}
await page.until(
  () => /chords · complete/.test($('[data-unified-pane="directory"]')?.textContent ?? ''),
  {message: 'the first catalogue'}
);

// The automatic maximum is the initial tolerance, and shared consumers receive it.
const automatic = shared();
assert.ok(automatic > 0, 'meantone has a positive automatic tolerance');
assert.equal(field().value, automatic.toFixed(3));
assert.equal(reset().disabled, true, 'Auto is already active');

// Editing the diamond value overrides the automatic tolerance everywhere.
await enter('7.25');
assert.equal(field().value, '7.250');
assert.equal(shared(), 7.25, 'shared consumers receive the active tolerance');
assert.equal(reset().disabled, false, 'Auto can restore the computed tolerance');
await enter('0');
assert.equal(shared(), 0, 'zero is a valid manual tolerance');

// Values are limited to 0–100 cents; text that is not a number keeps the current value.
await enter('-5');
assert.equal(shared(), 0);
await enter('120');
assert.equal(shared(), 100);
await enter('');
assert.equal(shared(), 100, 'an empty entry keeps the current tolerance');
assert.equal(Number(field().value), 100);

// Manual tolerance is stored in session files.
await enter('7.25');
page.click('#save');
const saved = JSON.parse(await page.downloaded(/session\.json$/));
assert.equal(saved.workflowVersion, 8);
assert.equal(saved.settings.manualTolerance, 7.25, 'manual tolerance is stored in session files');

// Auto restores the computed tolerance; opening the session brings the manual value back.
page.click(reset());
await page.settle();
assert.equal(shared(), automatic);
assert.equal(reset().disabled, true);
await page.openSession(saved);
assert.equal(shared(), 7.25, 'opening a session restores its manual tolerance');
assert.deepEqual(page.errors, []);
console.log(
  'Diamond tolerance editing, automatic fallback, range limits, shared settings and session version passed.'
);
await page.close();
