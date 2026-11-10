import assert from 'node:assert/strict';

// Independent reference for the current HexBoard DelegatedControl.cpp/LedRender.cpp
// and Adafruit_NeoPixel ColorHSV/gamma32. No production colour helpers are imported.
// The literal gamma8 table is the library's rounded gamma-2.6 table.
const GAMMA = [
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6, 7, 7, 7,
  8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12, 13, 13, 13, 14, 14, 15, 15, 16, 16, 17, 17, 18,
  18, 19, 19, 20, 20, 21, 21, 22, 22, 23, 24, 24, 25, 25, 26, 27, 27, 28, 29, 29, 30, 31, 31, 32,
  33, 34, 34, 35, 36, 37, 38, 38, 39, 40, 41, 42, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53,
  54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 68, 69, 70, 71, 72, 73, 75, 76, 77, 78, 80,
  81, 82, 84, 85, 86, 88, 89, 90, 92, 93, 94, 96, 97, 99, 100, 102, 103, 105, 106, 108, 109, 111,
  112, 114, 115, 117, 119, 120, 122, 124, 125, 127, 129, 130, 132, 134, 136, 137, 139, 141, 143,
  145, 146, 148, 150, 152, 154, 156, 158, 160, 162, 164, 166, 168, 170, 172, 174, 176, 178, 180,
  182, 184, 186, 188, 191, 193, 195, 197, 199, 202, 204, 206, 209, 211, 213, 215, 218, 220, 223,
  225, 227, 230, 232, 235, 237, 240, 242, 245, 247, 250, 252, 255
];
const HUE_KNOTS = [
  [0, 0],
  [9, 3640],
  [18, 5861],
  [102, 10922],
  [117, 12743],
  [135, 16384],
  [142, 21845],
  [155, 27306],
  [203, 32768],
  [240, 38229],
  [252, 43690],
  [261, 49152],
  [306, 54613],
  [333, 58254],
  [360, 65535]
];

export function firmwareRgb({h, s, v}, brightness = 110) {
  for (const byte of [h, s, v]) assert.ok(Number.isInteger(byte) && byte >= 0 && byte <= 127);
  assert.ok(h > 0 && h < 127, 'generated colours must avoid the zero-degree firmware endpoint');
  const degrees = Math.fround(Math.fround(h * 360) / 127),
    upper = HUE_KNOTS.findIndex(([angle]) => angle >= degrees),
    [start, from] = HUE_KNOTS[upper - 1],
    [end, to] = HUE_KNOTS[upper],
    amount = Math.fround((degrees - start) / (end - start)),
    transformed = Math.trunc(Math.fround(from * Math.fround(1 - amount) + to * amount)),
    hue = Math.floor((transformed * 1530 + 32768) / 65536);
  // Adafruit's integer hexcone has 1530 distinct positions, then fixed-point S/V.
  const rgb =
    hue < 255
      ? [255, hue, 0]
      : hue < 510
        ? [510 - hue, 255, 0]
        : hue < 765
          ? [0, 255, hue - 510]
          : hue < 1020
            ? [0, 1020 - hue, 255]
            : hue < 1275
              ? [hue - 1020, 0, 255]
              : [255, 0, 1530 - hue];
  const expand = byte => 2 * byte + (byte > 63 ? 1 : 0),
    saturation = expand(s),
    value = Math.floor((expand(v) * brightness) / 255);
  return rgb.map(channel => {
    const linear = Math.floor(
      ((Math.floor((channel * (saturation + 1)) / 256) + 255 - saturation) * (value + 1)) / 256
    );
    return GAMMA[linear];
  });
}

/** Layout HSV contrast through firmware gamma, with the requested peak output level. */
export function assertLedColour(record, hex, level = 1, brightness = 110) {
  const actual = firmwareRgb(record, brightness),
    channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)),
    peak = Math.max(...channels),
    expected = channels.map(channel =>
      peak ? (channel / peak) ** 2.6 * peak * level * (brightness / 255) ** 2.6 : 0
    ),
    tolerance = brightness === 255 ? 12 : 2;
  actual.forEach((channel, i) => {
    assert.ok(
      Math.abs(channel - expected[i]) <= tolerance,
      `${hex} at level ${level}, board brightness ${brightness}: RGB ${actual} vs ${expected.map(v => v.toFixed(1))}`
    );
  });
  return actual;
}

/** Accumulate real SysEx LED records, validating framing, indices and MIDI-safe bytes. */
export function ledRecords(messages) {
  const records = new Map();
  for (const bytes of messages) {
    if (bytes[2] !== 0x03) continue;
    assert.deepEqual(bytes.slice(0, 3), [0xf0, 0x7d, 0x03]);
    assert.equal(bytes.at(-1), 0xf7);
    assert.equal((bytes.length - 4) % 5, 0);
    assert.ok(bytes.slice(3, -1).every(byte => Number.isInteger(byte) && byte >= 0 && byte < 128));
    for (let i = 3; i < bytes.length - 1; i += 5) {
      const index = (bytes[i] << 7) | bytes[i + 1];
      assert.ok(index < 140);
      records.set(index, {h: bytes[i + 2], s: bytes[i + 3], v: bytes[i + 4]});
    }
  }
  return records;
}
