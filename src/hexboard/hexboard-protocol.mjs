// HexBoard delegated-control wire format (pure: no DOM, no Web MIDI).
// Source: HexBoard docs/delegated-control.md, manufacturer ID 0x7D. In this mode the
// board sends each key as a MIDI note (channel = index/100+1, note = index%100) and
// shows whatever LED colours the host sends.
import {hexToHSV} from './hexboard-colors.mjs';

const START = 0xf0,
  END = 0xf7,
  MANUFACTURER = 0x7d;
const CMD_ENTER = 0x01,
  CMD_EXIT = 0x02,
  CMD_LED = 0x03,
  CMD_ENCODER = 0x06;
export const BUTTON_COUNT = 140,
  APP_NAME = 'Temperament Lab';
const ENCODER = {1: 'up', 2: 'down', 3: 'press', 4: 'release'};

const frame = (command, payload = []) => [START, MANUFACTURER, command, ...payload, END];
const byte7 = (v, what) => {
  if (!Number.isInteger(v) || v < 0 || v > 127)
    throw new RangeError(`${what} must be an integer 0..127, got ${v}`);
};

export function encodeEnter(name = APP_NAME) {
  const bytes = [...new TextEncoder().encode(name)];
  if (bytes.length > 20 || bytes.some(b => b < 32 || b > 126))
    throw new RangeError('app name must be at most 20 printable ASCII characters');
  return frame(CMD_ENTER, bytes);
}
export const encodeExit = () => frame(CMD_EXIT);

/** One frame carrying every record: {led 0..139, h,s,v each 0..127}. */
export function encodeLeds(records) {
  const payload = [];
  for (const {led, h, s, v} of records) {
    if (!Number.isInteger(led) || led < 0 || led >= BUTTON_COUNT)
      throw new RangeError(`LED index must be 0..${BUTTON_COUNT - 1}, got ${led}`);
    byte7(h, 'hue');
    byte7(s, 'saturation');
    byte7(v, 'value');
    payload.push(led >> 7, led & 0x7f, h, s, v);
  }
  return frame(CMD_LED, payload);
}

/** Channel NoteOn/NoteOff -> {index, down}; null for anything else or an out-of-range index. */
export function decodeKey(data) {
  if (!data || data.length < 3) return null;
  const status = data[0] & 0xf0;
  if (status !== 0x90 && status !== 0x80) return null;
  const index = (data[0] & 0x0f) * 100 + data[1];
  if (index >= BUTTON_COUNT) return null;
  return {index, down: status === 0x90 && data[2] > 0};
}

export function decodeEncoder(data) {
  if (
    !data ||
    data.length !== 5 ||
    data[0] !== START ||
    data[1] !== MANUFACTURER ||
    data[2] !== CMD_ENCODER ||
    data[4] !== END
  )
    return null;
  return ENCODER[data[3]] ?? null;
}

/** '#rrggbb' scaled by `level` (0..1) onto the firmware's 0..127 hue/saturation/value. */
export function hexToLed(hex, level = 1) {
  const {hueTenthDegrees, saturation, value} = hexToHSV(hex);
  return {
    h: Math.round((hueTenthDegrees / 3600) * 128) % 128,
    s: Math.round((saturation * 127) / 255),
    v: Math.round((Math.min(1, Math.max(0, level)) * value * 127) / 255)
  };
}
