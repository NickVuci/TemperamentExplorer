import assert from 'node:assert/strict';
import {
  createAudioEngine,
  frequencyFor,
  isAudibleFrequency,
  outputCurve
} from '../src/ui/audio.mjs';
import {createHexboardPlayer} from '../src/hexboard/hexboard-player.mjs';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';
import {buildBoard} from '../src/hexboard/hexboard.mjs';
import {makeState} from '../src/core/engine.mjs';
import {fromCommas} from '../src/core/tuning.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture({pending = false, fallback = false} = {}) {
  const oscillators = [],
    gains = [],
    shapers = [],
    waiters = [],
    errors = [];
  let contexts = 0;
  const param = () => {
    const events = [],
      p = {value: 1, events};
    for (const name of [
      'setValueAtTime',
      'linearRampToValueAtTime',
      'exponentialRampToValueAtTime',
      'setValueCurveAtTime',
      'cancelScheduledValues',
      'cancelAndHoldAtTime'
    ])
      p[name] = (...args) => events.push([name, ...args]);
    if (fallback) delete p.cancelAndHoldAtTime;
    return p;
  };
  const context = {
    state: pending ? 'suspended' : 'running',
    currentTime: 5,
    destination: {},
    resume: () => (pending ? new Promise(resolve => waiters.push(resolve)) : Promise.resolve()),
    createOscillator() {
      const o = {
        frequency: {},
        starts: [],
        stops: [],
        disconnected: false,
        connect(node) {
          this.envelope = node;
        },
        disconnect() {
          this.disconnected = true;
        },
        start(at) {
          this.starts.push(at);
        },
        stop(at) {
          this.stops.push(at);
        },
        end() {
          this.onended();
        }
      };
      oscillators.push(o);
      return o;
    },
    createGain() {
      const g = {
        gain: param(),
        connect(node) {
          this.target = node;
        },
        disconnect() {
          this.disconnected = true;
        }
      };
      gains.push(g);
      return g;
    },
    createWaveShaper() {
      const s = {
        connect(node) {
          this.target = node;
        }
      };
      shapers.push(s);
      return s;
    }
  };
  let settings = {tonic: 220, wave: 'triangle'};
  const engine = createAudioEngine({
    createContext: () => {
      contexts++;
      return context;
    },
    getSettings: () => settings,
    onError: e => errors.push(e)
  });
  return {
    engine,
    oscillators,
    gains,
    shapers,
    errors,
    context,
    contexts: () => contexts,
    settings: next => (settings = next),
    resume: () => waiters.splice(0).forEach(resolve => resolve())
  };
}
const curves = o => o.envelope.target.gain.events.filter(e => e[0] === 'setValueCurveAtTime');
assert.equal(frequencyFor(1200, 220), 440);
assert.equal(frequencyFor(-1200, 220), 110);
for (const n of [NaN, Infinity, -Infinity, 0, 14.99, 16001])
  assert.equal(isAudibleFrequency(n), false);
for (const n of [15, 220, 16000]) assert.equal(isAudibleFrequency(n), true);
const f = fixture();
assert.equal(await f.engine.playChord([0, 1200]), true);
assert.equal(f.contexts(), 1);
assert.deepEqual(
  f.oscillators.map(o => o.frequency.value),
  [220, 440]
);
const first = f.oscillators[0];
assert.deepEqual(first.starts, [5.02]);
assert.equal(first.envelope.gain.value, 0, 'New voices are silent before any scheduled attack.');
assert.equal(first.envelope.gain.events[1][1], 0.14 / Math.sqrt(2));
assert.ok(Math.abs(first.stops[0] - 5.79) < 1e-9);
const natural = curves(first)[0];
assert.ok(Math.abs(natural[2] - 5.72) < 1e-9);
assert.equal(natural[3], 0.06);
assert.equal(natural[1][0], 1);
assert.equal(natural[1].at(-1), 0);
assert.equal(f.gains[0].gain.value, 0.25);
assert.equal(f.shapers[0].curve, outputCurve);
assert.equal(outputCurve[16384], 0);
assert.ok(outputCurve.every(v => Number.isFinite(v) && Math.abs(v) <= 0.95));
for (let i = 1; i < outputCurve.length; i++) assert.ok(outputCurve[i] >= outputCurve[i - 1]);
for (let i = 14500; i < 18200; i++) {
  const x = ((i / 32768) * 2 - 1) * 4;
  if (Math.abs(x) < 0.6)
    assert.ok(Math.abs(outputCurve[i] - x) < 1e-7, 'Ordinary output is unchanged.');
}
await f.engine.playSequence([0, 100, 200]);
assert.equal(f.contexts(), 1);
assert.ok(
  f.oscillators.slice(0, 2).every(o => o.stops.at(-1) === 5),
  'Future auditions cancel silently before onset.'
);
assert.deepEqual(
  f.oscillators.slice(2).map(o => o.starts[0]),
  [5.03, 5.18, 5.33]
);
f.settings({tonic: 440, wave: 'sawtooth'});
const release = f.engine.startVoice(0);
await tick();
const held = f.oscillators.at(-1);
assert.equal(held.type, 'sawtooth');
assert.equal(held.frequency.value, 440);
// A held voice glides to a new pitch in place.
held.frequency.setTargetAtTime = (value, at, constant) => (held.glide = [value, at, constant]);
release.retune(1200);
assert.equal(held.glide[0], 880);
assert.ok(held.glide[2] > 0 && held.glide[2] < 0.05);
assert.equal(held.envelope.gain.events[1][1], 0.018);
assert.equal(held.stops.length, 0);
assert.deepEqual(
  held.starts,
  [5],
  'a running context starts a live voice at once, with no scheduling lead'
);
assert.ok(
  Math.abs(held.envelope.gain.events[1][2] - 5.004) < 1e-9,
  'live notes use a short attack'
);
release();
release();
assert.equal(curves(held).length, 1);
assert.ok(Math.abs(held.stops[0] - 5.13) < 1e-9);
f.context.currentTime = 5.01;
f.engine.stop();
assert.ok(
  Math.abs(curves(held).at(-1)[2] - 5.01) < 1e-9,
  'Stop overrides the future short-tap gate.'
);
assert.ok(Math.abs(held.stops.at(-1) - 5.08) < 1e-9);
const stoppingCount = held.stops.length;
f.engine.stop();
assert.equal(held.stops.length, stoppingCount, 'An active fade is never restarted.');
for (const o of f.oscillators) o.end();
assert.ok(
  f.oscillators.every(
    o => o.disconnected && o.envelope.disconnected && o.envelope.target.disconnected
  )
);
await f.engine.playChord([NaN, Infinity, -Infinity, 1e9]);
assert.equal(f.oscillators.length, 6);
// Retuning before the context starts begins the voice at the latest pitch.
const early = fixture({pending: true});
early.engine.startVoice(0).retune(1200);
early.resume();
await tick();
assert.equal(early.oscillators[0].frequency.value, 440);
const pending = fixture({pending: true});
const earlyRelease = pending.engine.startVoice(0);
earlyRelease();
pending.resume();
await tick();
assert.equal(pending.oscillators.length, 0);
const waiting = pending.engine.playChord([0]);
pending.engine.stop();
pending.resume();
assert.equal(await waiting, false);
const obsolete = pending.engine.playSequence([0, 100]),
  current = pending.engine.playChord([1200]);
pending.resume();
assert.equal(await obsolete, false);
assert.equal(await current, true);
assert.deepEqual(
  pending.oscillators.map(o => o.frequency.value),
  [440]
);
pending.engine.startVoice(100);
pending.engine.stop();
pending.resume();
await tick();
assert.equal(pending.oscillators.length, 1);
for (const fallback of [false, true])
  for (const when of [5.026, 5.3, 5.725]) {
    const sample = fixture({fallback});
    await sample.engine.playChord([0]);
    const o = sample.oscillators[0];
    const before = structuredClone(o.envelope.gain.events);
    sample.context.currentTime = when;
    sample.engine.stop();
    assert.deepEqual(
      o.envelope.gain.events,
      before,
      'Releasing never edits attack/decay automation in either browser path.'
    );
    assert.ok(!o.envelope.gain.events.some(e => e[0].startsWith('cancel')));
  }
const longHold = fixture();
const releaseLong = longHold.engine.startVoice(0);
await tick();
longHold.context.currentTime = 6;
releaseLong();
assert.ok(Math.abs(longHold.oscillators[0].stops[0] - 6.07) < 1e-9);
let errorCount = 0;
const broken = createAudioEngine({
  createContext: () => {
    throw Error('Unavailable');
  },
  onError: () => errorCount++
});
assert.equal(await broken.playChord([0]), false);
broken.startVoice(0);
await tick();
assert.equal(errorCount, 2);
console.log(
  'Audio graph, bounded output, independent smooth fades, Stop, cleanup and resume races passed.'
);

// Join the actual pointer handler, layout workspace, and audio engine. Frequencies
// must follow the displayed integer coordinates in octave and non-octave tunings.
for (const state of [
  makeState('meantone'),
  fromCommas('128/125', '2.3.5'),
  fromCommas('245/243', '3.5.7')
])
  for (const wrapping of ['on', 'off']) {
    const audio = fixture(),
      workspace = createHexboardWorkspace({
        getStates: () => [state],
        play: () => {},
        refresh: () => {},
        notify: message => {
          throw Error(message);
        },
        getHz: () => 220
      });
    workspace.change({dataset: {hexField: 'periodWrapping'}, value: wrapping});
    const board = buildBoard(state, workspace.serialize().configs[0]);
    const keys = board.keys
      .filter(k => k.enabled && isAudibleFrequency(frequencyFor(k.c)))
      .sort((a, b) => Math.abs(a.index - 65) - Math.abs(b.index - 65))
      .slice(0, 2);
    assert.equal(keys.length, 2);
    const handlers = {},
      painted = new Set(),
      nodes = keys.map(k => ({
        dataset: {hexKey: String(k.index)},
        focus() {},
        classList: {
          toggle(name, on) {
            if (name === 'is-playing') {
              if (on) painted.add(k.index);
              else painted.delete(k.index);
            }
          }
        }
      }));
    const boardElement = {querySelectorAll: () => nodes};
    for (const node of nodes)
      node.closest = selector => (selector === '.hex-board' ? boardElement : node);
    let hit = nodes[0];
    const doc = {
      addEventListener: (name, fn) => (handlers[name] = fn),
      querySelector: selector => nodes.find(n => selector.includes('"' + n.dataset.hexKey + '"')),
      elementFromPoint: () => hit
    };
    const player = createHexboardPlayer({
      document: doc,
      window: {addEventListener() {}},
      press: workspace.press,
      startVoice: audio.engine.startVoice
    });
    const fire = (name, extra = {}) =>
      handlers[name]({
        target: hit,
        button: 0,
        buttons: 1,
        pointerId: 1,
        pointerType: 'mouse',
        shiftKey: false,
        preventDefault() {},
        ...extra
      });
    fire('pointerdown');
    await tick();
    hit = nodes[1];
    fire('pointermove');
    await tick();
    assert.equal(audio.oscillators.length, 2);
    assert.equal(audio.oscillators[0].stops.length, 1);
    keys.forEach((key, i) =>
      assert.ok(
        Math.abs(
          audio.oscillators[i].frequency.value -
            220 * 2 ** ((key.m[0] * state.p + key.m[1] * state.g) / 1200)
        ) < 1e-7
      )
    );
    fire('keydown', {key: 'Shift'});
    fire('pointerup', {shiftKey: true});
    assert.equal(audio.oscillators[1].stops.length, 0);
    assert.equal(painted.size, 1);
    fire('keyup', {key: 'Shift'});
    assert.equal(audio.oscillators[1].stops.length, 1);
    assert.equal(painted.size, 0);
    assert.deepEqual(audio.errors, []);
    player.reset();
  }
console.log(
  'Mouse-to-layout-to-audio integration passed for ordinary, divided-octave, and tritave periods, with wrapping on/off, dragging and Shift sustain.'
);

// Composition-held keys can use their frozen tonic without changing app settings.
const ownTonic = fixture();
const releaseOwn = ownTonic.engine.startVoice(1200, {tonic: 330, wave: 'sine'});
await tick();
assert.equal(ownTonic.oscillators[0].frequency.value, 660);
releaseOwn();
