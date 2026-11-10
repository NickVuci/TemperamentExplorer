import assert from 'node:assert/strict';
import {
  ledFrame,
  createHexboardSync,
  LEVEL,
  BRIGHTNESS,
  clampBrightness
} from '../src/hexboard/hexboard-sync.mjs';
import {hexToLed, BUTTON_COUNT} from '../src/hexboard/hexboard-protocol.mjs';
import {buildBoard} from '../src/hexboard/hexboard.mjs';
import {makeState} from '../src/core/catalog.mjs';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';
import {mosLayers, keyColor, palettes} from '../src/hexboard/hexboard-colors.mjs';
import {assertLedColour, firmwareRgb} from './support/hexboard-firmware.mjs';

// ---------- frame builder ----------
const key = (index, extra = {}) => ({
  index,
  command: false,
  enabled: true,
  color: '#5686df',
  layoutColor: '#5686df',
  dim: false,
  marked: false,
  lit: false,
  m: [0, index],
  c: index * 10,
  ...extra
});
const keys = Array.from({length: BUTTON_COUNT}, (_, i) =>
  i % 20 === 0
    ? {
        index: i,
        command: true,
        enabled: false,
        color: null,
        layoutColor: null,
        dim: false,
        marked: false,
        lit: false
      }
    : key(i)
);
const snap = {keys};
const frame = ledFrame(snap);
assert.equal(frame.size, BUTTON_COUNT, 'every LED is described');
assert.deepEqual(frame.get(0), {h: 1, s: 0, v: 0}, 'command keys stay dark');
assert.deepEqual(
  frame.get(5),
  hexToLed('#5686df', LEVEL.normal),
  'a normal key shows its layout colour'
);
const lit = ledFrame({
  keys: keys.map(k =>
    k.index === 5
      ? {...k, lit: true, marked: true, color: '#f5c76e'}
      : k.index === 7
        ? {...k, enabled: false}
        : k
  )
});
assert.ok(lit.get(5).v > frame.get(5).v, 'a highlighted key is brighter');
assert.deepEqual(
  lit.get(5),
  hexToLed('#5686df', LEVEL.lit),
  'a highlighted key keeps its layout colour, at full brightness (not the screen highlight colour)'
);
assert.deepEqual(lit.get(6), hexToLed('#5686df', LEVEL.dim), 'other keys dim during a highlight');
assert.deepEqual(lit.get(7), {h: 1, s: 0, v: 0}, 'a disabled key is dark');
assert.deepEqual(
  ledFrame(snap, new Set([5])).get(5),
  {h: 1, s: 0, v: 127},
  'a sounding key is white'
);
assert.ok(ledFrame(null).get(10).v === 0, 'no snapshot means a dark board');
assert.ok(LEVEL.normal < LEVEL.lit);
assert.ok(LEVEL.dim < LEVEL.normal, 'background dimming is limited to active highlights');
// Brightness scales every LED value, keeps hue and saturation, and is clamped.
const half = ledFrame(
  {keys: keys.map(k => (k.index === 5 ? {...k, lit: true, marked: true} : k))},
  new Set([9]),
  0.5
);
assert.deepEqual(
  half.get(5),
  hexToLed('#5686df', LEVEL.lit * 0.5),
  'brightness scales a highlighted key'
);
assert.deepEqual(
  half.get(6),
  hexToLed('#5686df', LEVEL.dim * 0.5),
  'brightness scales the dimmed background'
);
assert.deepEqual(half.get(9), hexToLed('#ffffff', 0.5), 'brightness scales a sounding key');
assert.deepEqual(half.get(0), {h: 1, s: 0, v: 0});
assert.equal(clampBrightness(0), BRIGHTNESS.min);
assert.equal(clampBrightness(3), 1);
assert.equal(clampBrightness('x'), BRIGHTNESS.default);
assert.deepEqual(ledFrame(snap, new Set(), 1), frame, 'full brightness is the original picture');

// Check the rendered firmware colours too, including held white and low slider settings.
for (const brightness of [0.05, 0.4, 1]) {
  const picture = {
    keys: [
      key(0, {color: '#65bd9c', layoutColor: '#65bd9c'}),
      key(1, {color: '#d879a0', layoutColor: '#d879a0', lit: true}),
      key(2),
      key(3, {enabled: false}),
      key(4, {command: true})
    ]
  };
  const leds = ledFrame(picture, new Set([2]), brightness);
  assertLedColour(leds.get(0), '#65bd9c', LEVEL.dim * brightness);
  assertLedColour(leds.get(1), '#d879a0', LEVEL.lit * brightness);
  assertLedColour(leds.get(2), '#ffffff', brightness);
  for (const index of [3, 4, 139]) assert.deepEqual(firmwareRgb(leds.get(index)), [0, 0, 0]);
}

// Contrast is measured after firmware gamma, not by comparing encoded value bytes.
for (const colour of Object.values(palettes).flatMap(palette => palette.colors)) {
  for (const brightness of [0.4, 1]) {
    const picture = {
        keys: [key(0, {layoutColor: colour}), key(1, {layoutColor: colour, lit: true})]
      },
      leds = ledFrame(picture, new Set(), brightness),
      background = Math.max(...firmwareRgb(leds.get(0))),
      highlight = Math.max(...firmwareRgb(leds.get(1)));
    assert.ok(
      highlight >= 5 * background,
      `${colour}: highlight must strongly outshine its background`
    );
    assertLedColour(leds.get(0), colour, 0.1 * brightness);
    assertLedColour(leds.get(1), colour, brightness);
    picture.keys[1].lit = false;
    const restored = ledFrame(picture, new Set(), brightness);
    assertLedColour(restored.get(0), colour, 0.5 * brightness);
    assert.deepEqual(restored.get(0), restored.get(1), 'clearing restores the ordinary layout');
  }
}
// A disabled or command key cannot cause the rest of the layout to dim.
for (const extra of [{enabled: false}, {command: true}]) {
  const picture = {keys: [key(0), key(1, {...extra, lit: true})]};
  assert.deepEqual(ledFrame(picture).get(0), frame.get(5));
}

// ---------- controller with fakes ----------
function setup({withNode = true, hiddenNode = false} = {}) {
  const events = [],
    voices = [],
    released = [],
    sentFrames = [],
    queued = [],
    device = {connected: true, setLeds: f => sentFrames.push(f)};
  const shown = withNode && !hiddenNode;
  let snapshot = snap;
  const sync = createHexboardSync({
    device,
    getSnapshot: () => snapshot,
    startVoice: c => {
      voices.push(c);
      return () => released.push(c);
    },
    pressKey: (i, t) => {
      if (!shown) return false;
      events.push(['press', i, t]);
      return true;
    },
    releaseKey: i => events.push(['release', i]),
    queue: fn => queued.push(fn),
    now: () => 10
  });
  const flush = () => {
    while (queued.length) queued.shift()();
  };
  return {
    sync,
    events,
    voices,
    released,
    sentFrames,
    queued,
    flush,
    device,
    set snapshot(v) {
      snapshot = v;
    }
  };
}

// On the Play view a board press plays the real on-screen key through the board player.
{
  const t = setup();
  t.sync.keyDown(65, 4);
  t.sync.keyDown(65, 4);
  assert.deepEqual(t.events, [['press', 65, 4]], 'a repeated down is ignored');
  assert.equal(t.voices.length, 0, 'sound comes from the board player, not from this module');
  assert.deepEqual([...t.sync.held], [65]);
  assert.equal(t.sentFrames.length, 0, 'the LEDs wait until the sound has started');
  assert.equal(t.queued.length, 1);
  t.flush();
  assert.deepEqual(
    t.sentFrames.at(-1).get(65),
    {h: 1, s: 0, v: 127},
    'the pressed key lights white on the board'
  );
  assert.equal(t.sync.brightness, 1);
  assert.equal(t.sync.setBrightness(0.25), 0.25);
  t.flush();
  assert.deepEqual(
    t.sentFrames.at(-1).get(65),
    hexToLed('#ffffff', 0.25),
    'changing brightness repaints the connected board'
  );
  assert.deepEqual(t.sentFrames.at(-1).get(66), hexToLed('#5686df', LEVEL.normal * 0.25));
  t.sync.setBrightness(1);
  t.flush();
  assert.equal(t.sync.inputDelay(), 6, 'the probe reports MIDI arrival to sound');
  t.sync.keyDown(66);
  t.sync.keyDown(67);
  assert.equal(t.queued.length, 1, 'changes within one event share one LED update');
  t.flush();
  const sent = t.sentFrames.length;
  t.sync.schedule();
  t.sync.schedule();
  assert.equal(t.queued.length, 1, 'a picture change between events queues one LED update');
  t.flush();
  assert.equal(t.sentFrames.length, sent + 1);
  t.sync.keyUp(67);
  t.sync.keyUp(65);
  assert.deepEqual(t.events.at(-1), ['release', 65], 'release goes to that same key');
  assert.deepEqual([...t.sync.held], [66]);
  t.flush();
  assert.notDeepEqual(
    t.sentFrames.at(-1).get(65),
    {h: 1, s: 0, v: 127},
    'the light returns to its colour'
  );
  t.sync.keyUp(65);
  assert.equal(
    t.events.filter(e => e[0] === 'release').length,
    2,
    'releasing an unheld key does nothing'
  );
  t.sync.releaseAll();
  assert.equal(t.sync.held.size, 0);
  assert.equal(t.events.filter(e => e[0] === 'release').length, 3);
}

// Off the Play view (key not on screen) the key sounds directly in the layout's tuning.
for (const opts of [{withNode: false}, {hiddenNode: true}]) {
  const t = setup(opts);
  t.sync.keyDown(30);
  assert.deepEqual(t.voices, [300], 'the key sounds at its layout pitch');
  assert.equal(t.events.length, 0);
  t.sync.keyUp(30);
  assert.deepEqual(t.released, [300], 'and releases that same voice');
  t.sync.keyDown(0);
  t.sync.keyDown(500);
  assert.equal(t.voices.length, 1, 'command and unknown keys are silent');
  const dis = setup(opts);
  dis.snapshot = {keys: keys.map(k => (k.index === 30 ? {...k, enabled: false} : k))};
  dis.sync.keyDown(30);
  assert.equal(dis.voices.length, 0, 'a disabled key is silent');
  assert.equal(dis.sync.held.size, 0);
}

// Mouse-played notes light the board too, merged with the board's own presses.
{
  const t = setup();
  t.sync.setActive([{id: '7'}, {id: '8'}]);
  assert.deepEqual([...t.sync.held].sort(), [7, 8]);
  t.flush();
  assert.deepEqual(t.sentFrames.at(-1).get(7), {h: 1, s: 0, v: 127});
  t.sync.keyDown(9);
  assert.deepEqual(
    [...t.sync.held].sort((a, b) => a - b),
    [7, 8, 9]
  );
  t.sync.setActive([{id: 'x'}, {id: '7'}]);
  assert.deepEqual(
    [...t.sync.held].sort((a, b) => a - b),
    [7, 9],
    'non-key ids are ignored'
  );
}

// Nothing is sent while the board is not connected; sync with no snapshot is harmless.
{
  const t = setup();
  t.device.connected = false;
  t.sync.sync();
  t.sync.setActive([{id: '3'}]);
  assert.equal(t.sentFrames.length, 0);
  t.device.connected = true;
  t.snapshot = null;
  t.sync.sync();
  assert.equal(t.sentFrames.length, 0);
}

// ---------- the board keeps following the app ----------
{
  const calls = [],
    ticks = [],
    cleared = [];
  const device = {
    connected: true,
    setLeds: (f, o) => calls.push({size: f.size, force: !!o?.force})
  };
  let snapshot = snap;
  const timer = {
    set: (fn, ms) => {
      ticks.push({fn, ms});
      return ticks.length;
    },
    clear: id => cleared.push(id)
  };
  const s = createHexboardSync({
    document: {},
    device,
    getSnapshot: () => snapshot,
    startVoice() {},
    timer
  });
  assert.equal(s.running, false);
  s.start();
  s.start();
  assert.equal(ticks.length, 2, 'starting twice does not double the timers');
  assert.equal(s.running, true);
  assert.deepEqual(
    ticks.map(t => t.ms),
    [100, 1500],
    'the app is polled every 100 ms and the whole picture resent every 1.5 s'
  );
  assert.deepEqual(calls, [{size: 140, force: true}], 'starting paints the whole board at once');
  ticks[0].fn();
  assert.deepEqual(calls.at(-1), {size: 140, force: false}, 'the fast tick sends only changes');
  ticks[1].fn();
  assert.deepEqual(calls.at(-1), {size: 140, force: true}, 'the slow tick resends everything');
  // A change in the app reaches the board on the next tick.
  snapshot = {keys: keys.map(k => (k.index === 5 ? {...k, lit: true} : k))};
  const seen = [];
  device.setLeds = f => seen.push(f.get(5));
  ticks[0].fn();
  assert.deepEqual(seen[0], hexToLed('#5686df', LEVEL.lit), 'the app change shows on the board');
  s.stop();
  s.stop();
  assert.deepEqual(cleared, [1, 2], 'stopping clears both timers once');
  assert.equal(s.running, false);
  s.start();
  assert.equal(ticks.length, 4, 'it can be started again');
  // Not connected: ticks do nothing.
  device.connected = false;
  const before = seen.length;
  ticks[2].fn();
  assert.equal(seen.length, before);
}

// ---------- the real Play board snapshot feeds the real frame builder ----------
{
  const s = makeState('meantone');
  const ws = createHexboardWorkspace({
    getStates: () => [s],
    play: () => {},
    refresh: () => {},
    notify: m => {
      throw Error(m);
    },
    getHz: () => 220
  });
  const snapshot = ws.deviceSnapshot();
  assert.ok(snapshot, 'the board builds');
  assert.equal(snapshot.keys.length, BUTTON_COUNT);
  const board = buildBoard(s, ws.serialize().configs[0]),
    colors = mosLayers(s, ws.serialize().configs[0], board);
  for (const k of snapshot.keys) {
    const b = board.keys[k.index];
    assert.equal(k.command, !!b.command);
    assert.equal(k.enabled, !!b.enabled);
    if (!b.command) {
      assert.deepEqual(k.m, b.m);
      assert.equal(k.c, b.c);
      assert.equal(k.color, keyColor(b, colors), `key ${k.index} shows the layout colour`);
    }
    assert.equal(k.lit, false, 'nothing is lit without a highlight');
  }
  assert.ok(snapshot.keys.filter(k => k.enabled).length > 20);
  // A scale highlight lights its tones, exactly as the screen does; nothing is recoloured and nothing recedes.
  const scaleCoords = [
    [0, 0],
    [-1, 2],
    [-2, 4],
    [1, -1],
    [0, 1],
    [-1, 3],
    [-2, 5]
  ];
  assert.ok(ws.showScale(scaleCoords, 'test scale') > 0);
  const lit = ws.deviceSnapshot();
  const tones = lit.keys.filter(k => k.enabled && k.lit),
    others = lit.keys.filter(k => k.enabled && !k.lit);
  assert.ok(
    lit.keys
      .filter(k => k.enabled)
      .every(k => k.layoutColor === snapshot.keys[k.index].layoutColor),
    'a scale highlight keeps every layout colour'
  );
  assert.ok(tones.length > 0 && others.length > 0);
  assert.ok(
    lit.keys.filter(k => k.enabled).every(k => k.color === k.layoutColor),
    'scale tones keep their colour'
  );
  const frameLit = ledFrame(lit);
  const framePlain = ledFrame(snapshot);
  assert.ok(
    frameLit.get(tones[0].index).v > framePlain.get(tones[0].index).v,
    'scale tones shine brighter'
  );
  assert.deepEqual(
    frameLit.get(others[0].index),
    hexToLed(others[0].layoutColor, LEVEL.dim),
    'other keys keep their colour and dim'
  );
  // A chord highlight lights its keys in their own colour over a dimmed background.
  ws.clearHighlight();
  ws.showChord(
    [
      [0, 0],
      [-2, 4],
      [0, 1]
    ],
    'major triad',
    {exact: true}
  );
  const chord = ws.deviceSnapshot(),
    marked = chord.keys.filter(k => k.marked);
  assert.ok(marked.length >= 3, `chord keys are marked (${marked.length})`);
  assert.ok(
    marked.every(k => k.color === k.layoutColor && k.lit),
    'chord keys keep their colour and are lit'
  );
  // The physical board keeps the layout: every key has the same colour with and without the highlight, only brightness changes.
  const plain = (ws.clearHighlight(), ws.deviceSnapshot()),
    plainFrame = ledFrame(plain);
  ws.showChord(
    [
      [0, 0],
      [-2, 4],
      [0, 1]
    ],
    'major triad',
    {exact: true}
  );
  const withChord = ws.deviceSnapshot(),
    chordFrame = ledFrame(withChord);
  for (const k of withChord.keys.filter(k => k.enabled)) {
    assert.equal(
      k.layoutColor,
      plain.keys[k.index].layoutColor,
      `key ${k.index} keeps its layout colour under a chord`
    );
    assert.equal(
      chordFrame.get(k.index).h,
      plainFrame.get(k.index).h,
      `key ${k.index} keeps its hue on the LEDs`
    );
    assert.equal(chordFrame.get(k.index).s, plainFrame.get(k.index).s);
    if (k.lit)
      assert.ok(
        chordFrame.get(k.index).v > plainFrame.get(k.index).v,
        'chord keys are brighter than before'
      );
    else
      assert.deepEqual(
        chordFrame.get(k.index),
        hexToLed(k.layoutColor, LEVEL.dim),
        'other keys keep their colour and dim'
      );
  }
  assert.ok(withChord.keys.filter(k => k.lit).length >= 3);
  // The screen also darkens keys outside a highlighted chord through CSS.
  const svg = html => html.match(/<svg class="hex-board[^"]*"/)[0];
  assert.match(
    svg(ws.render()),
    /has-chord/,
    'the on-screen board dims outside a highlighted chord'
  );
  assert.equal(
    (ws.render().match(/\bis-marked\b/g) ?? []).length,
    withChord.keys.filter(k => k.marked).length,
    'chord keys stay undimmed'
  );
  ws.clearHighlight();
  assert.doesNotMatch(svg(ws.render()), /has-chord/, 'no chord, no dimming');
  ws.clearHighlight();
  ws.showScale(scaleCoords, 'test scale');
  const withScale = ws.deviceSnapshot(),
    scaleFrame = ledFrame(withScale);
  for (const k of withScale.keys.filter(k => k.enabled)) {
    assert.equal(
      scaleFrame.get(k.index).h,
      plainFrame.get(k.index).h,
      `key ${k.index} keeps its hue under a scale`
    );
    if (k.lit) assert.ok(scaleFrame.get(k.index).v > plainFrame.get(k.index).v);
    else
      assert.deepEqual(
        scaleFrame.get(k.index),
        hexToLed(k.layoutColor, LEVEL.dim),
        'other keys keep their colour and dim'
      );
  }
  assert.ok(withScale.keys.some(k => k.lit) && withScale.keys.some(k => k.enabled && !k.lit));
  ws.clearHighlight();
  assert.ok(
    ws.deviceSnapshot().keys.every(k => (!k.marked && !k.lit) || k.command),
    'clearing the highlight restores the board'
  );
}

console.log('hexboard-sync: ok');
