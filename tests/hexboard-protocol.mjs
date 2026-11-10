import assert from 'node:assert/strict';
import {
  encodeEnter,
  encodeExit,
  encodeLeds,
  decodeKey,
  decodeEncoder,
  hexToLed,
  BUTTON_COUNT
} from '../src/hexboard/hexboard-protocol.mjs';
import {palettes} from '../src/hexboard/hexboard-colors.mjs';
import {assertLedColour, firmwareRgb} from './support/hexboard-firmware.mjs';

// Byte examples are the ones documented in HexBoard docs/delegated-control.md.
assert.deepEqual(encodeEnter(''), [0xf0, 0x7d, 0x01, 0xf7]);
assert.deepEqual(encodeEnter('Hi'), [0xf0, 0x7d, 0x01, 0x48, 0x69, 0xf7]);
assert.equal(encodeEnter().length, 4 + 'Temperament Lab'.length, 'default app name is sent');
assert.deepEqual(encodeExit(), [0xf0, 0x7d, 0x02, 0xf7]);
assert.throws(() => encodeEnter('x'.repeat(21)), RangeError);
assert.throws(() => encodeEnter('é'), RangeError);

assert.deepEqual(
  encodeLeds([{led: 5, h: 0, s: 127, v: 127}]),
  [0xf0, 0x7d, 0x03, 0, 5, 0, 0x7f, 0x7f, 0xf7],
  'LED 5 red'
);
assert.deepEqual(
  encodeLeds([{led: 130, h: 0, s: 127, v: 127}]),
  [0xf0, 0x7d, 0x03, 1, 2, 0, 0x7f, 0x7f, 0xf7],
  'LED 130 splits into 7+7 bits'
);
assert.deepEqual(
  encodeLeds([
    {led: 0, h: 1, s: 2, v: 3},
    {led: 1, h: 4, s: 5, v: 6}
  ]),
  [0xf0, 0x7d, 0x03, 0, 0, 1, 2, 3, 0, 1, 4, 5, 6, 0xf7],
  'records batch into one frame'
);
assert.deepEqual(encodeLeds([]), [0xf0, 0x7d, 0x03, 0xf7]);
for (const bad of [
  {led: 140, h: 0, s: 0, v: 0},
  {led: -1, h: 0, s: 0, v: 0},
  {led: 0, h: 128, s: 0, v: 0},
  {led: 0, h: 0, s: 0.5, v: 0},
  {led: 0, h: 0, s: 0, v: -1}
])
  assert.throws(() => encodeLeds([bad]), RangeError);
assert.equal(BUTTON_COUNT, 140);

assert.deepEqual(decodeKey([0x90, 0, 127]), {index: 0, down: true});
assert.deepEqual(decodeKey([0x90, 60, 127]), {index: 60, down: true});
assert.deepEqual(
  decodeKey([0x91, 30, 127]),
  {index: 130, down: true},
  'channel 2 note 30 is button 130'
);
assert.deepEqual(decodeKey([0x81, 30, 0]), {index: 130, down: false});
assert.deepEqual(
  decodeKey([0x90, 60, 0]),
  {index: 60, down: false},
  'NoteOn with velocity 0 is a release'
);
assert.equal(decodeKey([0xb0, 1, 2]), null);
assert.equal(decodeKey([0x93, 50, 127]), null, 'index 350 is not a key');
assert.equal(decodeKey([0x90]), null);
assert.equal(decodeKey(null), null);
assert.deepEqual(decodeKey([0x91, 39, 127]), {index: 139, down: true});
assert.equal(decodeKey([0x91, 40, 127]), null, 'index 140 is out of range');

for (const [byte, name] of [
  [1, 'up'],
  [2, 'down'],
  [3, 'press'],
  [4, 'release']
])
  assert.equal(decodeEncoder([0xf0, 0x7d, 0x06, byte, 0xf7]), name);
assert.equal(decodeEncoder([0xf0, 0x7d, 0x06, 9, 0xf7]), null);
assert.equal(decodeEncoder([0xf0, 0x7d, 0x03, 1, 0xf7]), null);
assert.equal(decodeEncoder([0xf0, 0x7e, 0x06, 1, 0xf7]), null);

// Colour conversion is pinned against the firmware's output, not RGB hue bytes.
assert.deepEqual(hexToLed('#ff0000'), {h: 126, s: 127, v: 127});
assert.deepEqual(hexToLed('#ffffff'), {h: 1, s: 0, v: 127});
assert.deepEqual(
  hexToLed('#00ff00'),
  {h: 50, s: 127, v: 127},
  'green compensates for the firmware perceptual hue mapping'
);
assert.deepEqual(hexToLed('#0000ff'), {h: 89, s: 127, v: 127});
assert.deepEqual(hexToLed('#000000'), {h: 1, s: 0, v: 0});
assert.equal(hexToLed('#ff0000', 0.5).v, 97, 'half output brightness survives firmware gamma');
assert.equal(hexToLed('#ff0000', 0.5).s, 127);
assert.equal(hexToLed('#ff0000', 2).v, 127, 'level is clamped');
assert.equal(hexToLed('#ff0000', -1).v, 0);
// All palettes, custom colours, greys and both sides of the red wraparound.
const colours = [
  '#ff0000',
  '#ffff00',
  '#00ff00',
  '#00ffff',
  '#0000ff',
  '#ff00ff',
  '#ffffff',
  '#808080',
  '#010101',
  '#000000',
  '#ff0100',
  '#ff0001',
  '#83cebe',
  '#f5c76e',
  '#a855ca',
  '#ad6262',
  '#414957',
  ...Object.values(palettes).flatMap(palette => palette.colors)
];
for (const hex of colours) {
  for (const level of [0, 0.025, 0.05, 0.25, 0.5, 1]) {
    const record = hexToLed(hex, level);
    encodeLeds([{led: 130, ...record}]);
    for (const brightness of [110, 255]) assertLedColour(record, hex, level, brightness);
    if (level > 0) {
      assert.equal(record.h, hexToLed(hex).h, 'brightness does not change hue');
      assert.equal(record.s, hexToLed(hex).s, 'brightness does not change saturation');
    }
  }
}
assert.deepEqual(firmwareRgb({h: 36, s: 127, v: 127}, 255), [255, 255, 0], 'reference yellow');
assert.deepEqual(firmwareRgb({h: 1, s: 0, v: 127}), [29, 29, 29], 'reference factory white');
const green = firmwareRgb(hexToLed('#65bd9c', 0.5));
assert.ok(green[1] >= 9 && green[1] > green[0], 'normal palette green is visibly green');
assert.equal(hexToLed('#65bd9c').s, 59, 'green retains the layout saturation');
assert.equal(hexToLed('#d879a0').s, 56, 'pink is not softened by inverse channel gamma');
assert.equal(hexToLed('#55b5ba').s, 69, 'cyan retains the layout saturation');
assert.throws(() => firmwareRgb({h: 0, s: 0, v: 0}), /zero-degree/);
assert.throws(() => firmwareRgb({h: 127, s: 127, v: 127}), /zero-degree/);

console.log('hexboard-protocol: ok');
