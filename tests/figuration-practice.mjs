import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHtml} from './support/dom.mjs';
import {captureContext} from '../src/composition/composition-context.mjs';
import {
  createProject,
  makeEvent,
  addEvent,
  applyFiguration,
  updateEvent
} from '../src/composition/composition-project.mjs';
import {createCompositionWorkspace} from '../src/composition/composition-ui.mjs';
import {compileFiguration} from '../src/composition/composition-figuration.mjs';
import {START_DELAY_SECONDS} from '../src/composition/composition-transport.mjs';

const demo = JSON.parse(
  readFileSync(new URL('./fixtures/composition/phase0-demo.json', import.meta.url))
);
let p = createProject({
  context: captureContext(demo.musicalContext.state, 220),
  layout: demo.layout,
  tempo: 120
});
const source = makeEvent({
  startTick: 0,
  durationTick: 960,
  tones: [
    [0, 0],
    [-2, 4],
    [0, 1]
  ].map(coordinate => ({coordinate}))
});
p = addEvent(p, p.clips[0].id, source);
const pattern = {
  version: 1,
  name: 'Timed figure',
  lengthTick: 960,
  events: [1, 3, 2].map((rank, i) => ({
    id: `step-${i}`,
    startTick: i * 240,
    durationTick: 120,
    velocity: 90,
    tones: [{rank, octaves: 0}]
  }))
};
p = applyFiguration(p, pattern, [
  {chordClipId: p.clips[0].id, chordEventId: source.id, trackId: p.tracks[1].id}
]);
const doc = parseHtml(),
  host = doc.createElement('main');
doc.body.append(host);
const clock = {
  audioSeconds: 100,
  state: 'running',
  clockRevision: 1,
  performanceMs: 0,
  anchor: {audioSeconds: 100, performanceMs: 0}
};
const scheduled = [],
  frames = [],
  settings = new Map();
const ws = createCompositionWorkspace({
  document: doc,
  window: doc.defaultView,
  getState: () => p.context.state,
  getLayout: () => p.layout,
  getTonic: () => 220,
  getMaterial: () => [],
  getRootEntries: () => [
    {
      root: [0, 0],
      coords: [
        [0, 0],
        [1, -1],
        [-1, 3]
      ],
      rootVoice: 0,
      classCount: 3,
      label: 'Replacement harmony',
      rootPosition: true
    }
  ],
  getHost: () => host,
  audio: {
    prepare: async () => {},
    getClockSnapshot: () => ({...clock, performanceMs: (clock.audioSeconds - 100) * 1000}),
    cancelGroup() {},
    startVoice: () => () => {},
    previewChord() {},
    scheduleVoices: (voices, options) => {
      scheduled.push(...voices.map(v => ({...v, group: options.groupId})));
      return voices.map(v => ({voiceId: v.voiceId, cancel() {}}));
    }
  },
  timer: {set: () => 1, clear() {}},
  raf: fn => {
    frames.push(fn);
    return frames.length;
  },
  gameStorage: {get: k => settings.get(k), set: (k, v) => settings.set(k, v)},
  figurationStore: {
    list: async () => [
      {
        id: 'incompatible',
        name: 'Eight voices',
        state: {...pattern, events: [{...pattern.events[0], tones: [{rank: 8, octaves: 0}]}]}
      }
    ]
  }
});
const press = (comp, rest = {}) =>
  ws.click({
    dataset: {comp, ...rest},
    closest(selector) {
      return selector === '[data-comp]' ? this : null;
    }
  });
const change = (compField, value) => ws.change({dataset: {compField}, value});
const flush = () => new Promise(resolve => setImmediate(resolve));
ws.restore(p);
ws.refresh();
await ws.figureAction('figure-new');
press('note-cell', {tick: '0', a: '0', b: '0'});
const drawing = ws.figurePattern();
await ws.loadFigures();
change('figuresaved', 'incompatible');
await assert.rejects(ws.figureAction('figure-load'), /needs tone 8/);
assert.deepEqual(
  ws.figurePattern(),
  drawing,
  'an incompatible library import preserves the current drawing'
);
assert.deepEqual(ws.serialize(), p, 'drawing and failed imports leave source music untouched');
await ws.figureAction('figure-done');
const repeated = structuredClone(p);
repeated.clips[0].startTick = 250;
repeated.clips[0].lengthTick = 1200;
repeated.clips[0].repeat = 2;
ws.restore(repeated);
ws.refresh();
assert.deepEqual(
  [...host.querySelectorAll('.chord-block')].map(e => Number(e.dataset.start)),
  [250, 1450]
);
assert.equal(
  host.querySelectorAll('.roll-note[data-generated]').length,
  6,
  'the roll shows every repeated figure beside its actual harmony occurrence'
);
ws.restore(p);
ws.refresh();
press('chord-select', {event: source.id});
press('mode-game');
change('gameSection', 'selected');
change('gameMode', 'play');
change('gameCountIn', '0');
change('gameGuide', 'full');
change('gameLights', 'dark');
ws.change({dataset: {compField: 'gameClick'}, checked: false});
press('game-start');
await flush();
assert.equal(ws.game.phase, 'running');
const targets = ws.game.engine.targets;
assert.deepEqual(
  targets.map(t => t.coordinate),
  [
    [0, 0],
    [0, 1],
    [-2, 4]
  ]
);
assert.ok(scheduled.length > 0);
assert.ok(
  scheduled
    .filter(v => v.group === 'transport')
    .every(v => v.chordSize === 1 && v.voiceId.startsWith('figuration:')),
  'the lookahead schedules figure notes, not the block chord'
);
const tps = (p.tempo * p.ppq) / 60,
  downbeat = 100 + START_DELAY_SECONDS;
for (const target of targets) {
  clock.audioSeconds = downbeat + target.tick / tps;
  ws.transport.pump();
  ws.game.step();
  const lit = ws.deviceSnapshot().keys.filter(k => k.lit && k.enabled && !k.command);
  const due = lit.find(k => k.m.join() === target.coordinate.join());
  assert.ok(due, 'the due generated note is lit');
  assert.ok(
    lit.every(k =>
      targets.some(
        t => (t === target || t.result === 'perfect') && t.coordinate.join() === k.m.join()
      )
    ),
    'later notes stay dark; existing hit flashes may remain'
  );
  ws.pressKey(due.index, (clock.audioSeconds - 100) * 1000);
  ws.releaseKey(due.index);
  assert.equal(target.result, 'perfect');
}
clock.audioSeconds = downbeat + 960 / tps + 0.5;
ws.transport.pump();
ws.game.step();
assert.equal(ws.game.phase, 'results');
assert.ok(targets.every(t => t.result === 'perfect'));

// A later invalid harmony edit stays editable but blocks both playback and practice.
ws.stop();
press('mode-compose');
press('root-block', {event: source.id});
press('root-harmony', {index: '0'});
assert.equal(
  ws.serialize().figuration.attachments[0].chordEventId,
  source.id,
  'replacing harmony retains the attachment'
);
assert.deepEqual(compileFiguration(ws.serialize()).events[1].tones[0].coordinate, [-1, 3]);
press('undo');
assert.deepEqual(ws.serialize(), p);
const invalid = updateEvent(p, p.clips[0].id, source.id, {tones: source.tones.slice(0, 2)});
assert.equal(compileFiguration(invalid).errors.length, 1);
ws.restore(invalid);
ws.refresh();
await ws.transport.play();
assert.equal(ws.transport.state, 'stopped');
press('mode-game');
press('game-start');
assert.equal(ws.game.phase, 'setup');
assert.match(host.textContent, /needs tone 3/);
ws.dispose();
doc.defaultView.close();
console.log(
  'figuration-practice: Timed exact-pitch judging, audio, due-note lights and invalid-harmony gates passed'
);
