import assert from 'node:assert/strict';
import {bootApp} from './support/dom.mjs';
import {assertLedColour, firmwareRgb, ledRecords} from './support/hexboard-firmware.mjs';

const sent = [],
  requests = [],
  input = {id: 'hex-in', name: 'HexBoard', onmidimessage: null},
  output = {id: 'hex-out', name: 'HexBoard', send: bytes => sent.push([...bytes])},
  access = {inputs: new Map([[input.id, input]]), outputs: new Map([[output.id, output]])};
const page = await bootApp({
  requestMIDIAccess: async options => {
    requests.push(options);
    return access;
  }
});
const {$} = page,
  keys = () => page.$$('.hex-workspace [data-hex-key]'),
  record = index => ledRecords(sent).get(index),
  sameRecord = (a, b) => JSON.stringify(a) === JSON.stringify(b);
page.chooseTemperament('meantone');
page.section('play');
await page.until(() => keys().length === 133, {message: 'the Play board'});
page.click('#hexboard-connect');
await page.until(() => ledRecords(sent).size === 140, {message: 'the connected LED frame'});
assert.deepEqual(requests, [{sysex: true}]);
assert.equal($('#hexboard-connect').textContent, 'Disconnect HexBoard');
assert.equal($('.hexboard-brightness').hidden, false);
assert.equal(sent[0][2], 1, 'enter delegated mode before painting');

// Actual on-screen fills feed actual MIDI bytes, including all physical indices.
const enabled = new Set();
for (const key of keys()) {
  const index = Number(key.dataset.hexKey);
  if (key.getAttribute('aria-disabled') === 'true') {
    assert.deepEqual(firmwareRgb(record(index)), [0, 0, 0]);
    continue;
  }
  enabled.add(index);
  assertLedColour(record(index), key.querySelector('polygon').getAttribute('fill'), 0.5);
}
for (let index = 0; index < 140; index++)
  if (!enabled.has(index)) assert.deepEqual(firmwareRgb(record(index)), [0, 0, 0]);
assert.ok(
  [...enabled].some(index => index >= 128),
  'two-byte LED indices are exercised'
);

const index = Number(
    $('[data-hex-custom-color]')
      .getAttribute('aria-label')
      .match(/button (\d+)/)[1]
  ),
  keyNode = () => $(`.hex-workspace [data-hex-key="${index}"]`),
  fill = () => keyNode().querySelector('polygon').getAttribute('fill');
assert.ok(enabled.has(index));
async function editColour(hex) {
  const before = record(index),
    beforeFill = fill();
  page.change('[data-hex-custom-color]', hex);
  await page.until(() => fill() === hex, {message: `the ${hex} screen edit`});
  await page.until(() => beforeFill === hex || !sameRecord(record(index), before), {
    message: `the ${hex} LED edit`
  });
  assertLedColour(record(index), hex, 0.5);
}
await editColour('#65bd9c');
assert.ok(firmwareRgb(record(index))[1] >= 9, 'normal green is visible at factory brightness');
await editColour('#d879a0');
const pink = firmwareRgb(record(index));
assert.ok(pink[1] > 0 && pink[2] > pink[1], 'pink retains green and blue instead of becoming red');

// Remove the button override, then edit the shared degree through the real editor.
page.click('[data-hex-action="clear-custom-color"]');
page.change('[data-hex-color-scope]', 'degree');
await editColour('#55b5ba');
const degree = keyNode()
    .getAttribute('aria-label')
    .match(/degree (\d+),/)[1],
  twins = keys().filter(
    key =>
      key.getAttribute('aria-disabled') === 'false' &&
      key.getAttribute('aria-label').includes(`degree ${degree},`)
  );
assert.ok(twins.length > 1, 'the scale degree repeats on multiple keys');
for (const twin of twins) {
  assert.equal(twin.querySelector('polygon').getAttribute('fill'), '#55b5ba');
  assertLedColour(record(Number(twin.dataset.hexKey)), '#55b5ba', 0.5);
}

// The header slider scales the displayed output, and MIDI holds use the same compensation.
page.input('#hexboard-brightness', 40);
await page.until(() => record(index).v < 80, {message: 'the brightness repaint'});
assertLedColour(record(index), '#55b5ba', 0.5 * 0.4);
assert.equal(page.window.localStorage.getItem('temperament-lab-hexboard-brightness'), '40');
input.onmidimessage({data: [0x90 | Math.floor(index / 100), index % 100, 127], timeStamp: 0});
await page.until(() => record(index).s === 0, {message: 'held-key white'});
assertLedColour(record(index), '#ffffff', 0.4);
input.onmidimessage({data: [0x80 | Math.floor(index / 100), index % 100, 0], timeStamp: 0});
await page.until(() => record(index).s > 0, {message: 'release restores cyan'});
assertLedColour(record(index), '#55b5ba', 0.5 * 0.4);

// Selecting a chord key on screen gives the physical highlight strong contrast.
page.click('[data-hex-action="chord-mode"][data-mode="notes"]');
page.change('[data-hex-field="selectChord"]', true);
page.pointer(keyNode(), 'pointerdown');
page.pointer(keyNode(), 'pointerup');
const twinIndex = Number(twins.find(key => Number(key.dataset.hexKey) !== index).dataset.hexKey);
await page.until(() => record(twinIndex).v < 50, {message: 'the dimmed highlight background'});
assertLedColour(record(index), '#55b5ba', 0.4);
assertLedColour(record(twinIndex), '#55b5ba', 0.1 * 0.4);
assert.ok(
  Math.max(...firmwareRgb(record(index))) >= 5 * Math.max(...firmwareRgb(record(twinIndex))),
  'the physical highlighted key strongly outshines the same-colour background'
);
page.click('[data-hex-action="clear"]');
await page.until(() => record(twinIndex).v >= 50, {message: 'clearing restores layout brightness'});
assertLedColour(record(index), '#55b5ba', 0.5 * 0.4);
assertLedColour(record(twinIndex), '#55b5ba', 0.5 * 0.4);

// Disconnect safely blanks all keys; reconnect restores edited colours and remembered brightness.
page.click('#hexboard-connect');
assert.equal(sent.at(-1)[2], 2, 'exit delegated mode');
for (const led of ledRecords(sent).values()) assert.deepEqual(firmwareRgb(led), [0, 0, 0]);
const start = sent.length;
page.click('#hexboard-connect');
await page.until(() => ledRecords(sent.slice(start)).size === 140, {
  message: 'the reconnect frame'
});
assert.equal(sent[start][2], 1);
assertLedColour(record(index), '#55b5ba', 0.5 * 0.4);
assert.equal($('#hexboard-brightness').value, '40');
assert.deepEqual(requests, [{sysex: true}, {sysex: true}]);
assert.ok(
  sent.every(bytes => [1, 2, 3].includes(bytes[2])),
  'only delegated commands are sent'
);
page.click('#hexboard-connect');
assert.deepEqual(page.errors, []);
console.log(
  'Connected HexBoard colours: screen fills, edits, degree copies, highlight contrast, brightness, holds and reconnect passed.'
);
await page.close();
