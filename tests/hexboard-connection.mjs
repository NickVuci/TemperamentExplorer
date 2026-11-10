import assert from 'node:assert/strict';
import {bootApp} from './support/dom.mjs';

// The header's HexBoard controls in the running app. The test page has no Web MIDI.
const page = await bootApp(),
  {$} = page;
assert.equal($('#hexboard-connect').textContent, 'Connect HexBoard');
assert.equal($('#hexboard-brightness').value, '100', 'full brightness by default');
assert.equal($('#hexboard-brightness-value').textContent, '100%');
assert.equal($('.hexboard-brightness').hidden, true, 'brightness shows only while connected');

// The brightness is remembered in this browser.
page.input('#hexboard-brightness', 40);
assert.equal($('#hexboard-brightness-value').textContent, '40%');
assert.equal(
  page.window.localStorage.getItem('temperament-lab-hexboard-brightness'),
  '40',
  'the brightness is remembered'
);

// Without Web MIDI, Connect explains why and stays available.
page.click('#hexboard-connect');
await page.settle();
const reason = 'Web MIDI is not available. Use Chrome or Edge.';
assert.equal($('#hexboard-status').textContent, reason);
assert.equal(page.toast(), reason);
assert.equal($('#hexboard-connect').disabled, false);
assert.equal($('.hexboard-brightness').hidden, true);
assert.deepEqual(page.errors, []);
console.log('HexBoard connection: brightness memory and the no-MIDI explanation passed.');
await page.close();
