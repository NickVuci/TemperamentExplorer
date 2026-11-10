import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bootApp} from './support/dom.mjs';
import {ledRecords, firmwareRgb} from './support/hexboard-firmware.mjs';
import {captureContext} from '../src/composition/composition-context.mjs';
import {createProject, makeEvent, addEvent} from '../src/composition/composition-project.mjs';
import {compileFiguration} from '../src/composition/composition-figuration.mjs';

const demo = JSON.parse(
  readFileSync(new URL('./fixtures/composition/phase0-demo.json', import.meta.url))
);
let p = createProject({
  context: captureContext(demo.musicalContext.state, 220),
  layout: demo.layout
});
const cc = p.clips[0].id;
const first = makeEvent({
  startTick: 0,
  durationTick: 3840,
  tones: [
    [0, 0],
    [-2, 4],
    [0, 1]
  ].map(coordinate => ({coordinate}))
});
const second = makeEvent({
  startTick: 3840,
  durationTick: 3840,
  tones: [
    [0, 0],
    [1, -1],
    [-1, 3]
  ].map(coordinate => ({coordinate}))
});
p = addEvent(addEvent(p, cc, first), cc, second);
const sent = [],
  input = {id: 'in', name: 'HexBoard'},
  output = {id: 'out', name: 'HexBoard', send: bytes => sent.push([...bytes])};
const page = await bootApp({
  requestMIDIAccess: async () => ({
    inputs: new Map([['in', input]]),
    outputs: new Map([['out', output]])
  })
});
const {$} = page;
await page.openSession({
  format: 'temperament-lab-v2',
  states: [p.context.state],
  composition: p,
  settings: {view: 'composition'}
});
page.section('create');
page.click(`[data-comp="chord-select"][data-event="${first.id}"]`);
page.click('[data-comp="figure-new"]');
await page.until(() => !!$('.figuration-panel.is-editing'), {message: 'the drawing editor'});
assert.equal(
  page.$$('.roll-row-grid').length,
  7,
  'automatic range shows every playable octave of the reference overlay'
);
assert.ok(page.$$('.roll-degree').some(n => n.textContent.startsWith('3')));
assert.equal($('[data-comp-field="figurerange"]').value, 'board');
assert.equal($('[data-comp-field="figureparts"]').value, '3');
page.change('[data-comp-field="figurename"]', 'Drawn prelude');
const draw = (m, tick) => {
  const row = $(`.roll-row-grid[data-a="${m[0]}"][data-b="${m[1]}"]`),
    surface = row.querySelector('.roll-surface');
  row.getBoundingClientRect = () => ({left: 0, top: 0, width: 960, height: 28});
  page.pointer(surface, 'pointerdown', {clientX: tick / 4, clientY: 10});
  page.pointer(surface, 'pointerup', {clientX: tick / 4, clientY: 10});
};
draw([0, 0], 0);
draw([0, 1], 240);
draw([-2, 4], 480);
assert.equal(page.$$('.roll-note').length, 3);
await page.settle();
page.click('[data-comp="figure-save"]');
await page.until(() => page.toast().includes('Saved figure'), {message: 'saving a drawn figure'});
const library = JSON.parse(page.window.localStorage.getItem('temperament-lab-presets'));
assert.equal(library.figurations[0].state.events.length, 3);
assert.deepEqual(
  library.figurations[0].state.events.map(e => e.tones[0].rank),
  [1, 3, 2]
);
page.change('[data-comp-field="figurescope"]', 'all');
page.click('[data-comp="figure-apply"]');
await page.until(() => !$('.figuration-panel.is-editing'), {message: 'applying the figure'});
page.click('[data-comp="save"]');
let saved = JSON.parse(await page.downloaded(/composition\.json$/));
assert.equal(saved.format, 'temperament-lab-composition-v2');
assert.equal(saved.figuration.attachments.length, 2);
assert.equal(saved.clips[1].events.length, 0);
assert.equal(page.$$('.roll-note[data-generated]').length, 6);
assert.deepEqual(
  compileFiguration(saved).events.map(e => e.tones[0].coordinate),
  [
    [0, 0],
    [0, 1],
    [-2, 4],
    [0, 0],
    [-1, 3],
    [1, -1]
  ]
);
page.click('[data-comp="undo"]');
assert.equal(page.$$('.roll-note[data-generated]').length, 0);
page.click('[data-comp="redo"]');
assert.equal(page.$$('.roll-note[data-generated]').length, 6);

// A source voicing edit changes the attached figure; library contents stay portable and fixed.
page.click(`[data-comp="chord-select"][data-event="${first.id}"]`);
page.click('[data-comp="chord-invert"]');
page.click('[data-comp="save"]');
saved = JSON.parse(await page.downloaded(/composition\.json$/));
assert.deepEqual(compileFiguration(saved).events[0].tones[0].coordinate, [-2, 4]);
assert.equal(
  JSON.parse(page.window.localStorage.getItem('temperament-lab-presets')).figurations[0].state
    .events[0].tones[0].rank,
  1
);

// Random generation is an explicit edit; undo restores the drawing, saving to the library leaves the piece alone.
page.click('[data-comp="figure-edit"]');
await page.until(() => !!$('.figuration-panel.is-editing'));
page.change('[data-comp-field="figurecontour"]', 'rising');
page.change('[data-comp-field="figurerange"]', 'board');
page.change('[data-comp-field="figureparts"]', 3);
page.click('[data-comp="figure-generate"]');
await page.until(() => page.$$('.roll-note').length === 28);
page.click('[data-comp="figure-export"]');
const textureFile = JSON.parse(await page.downloaded(/figuration\.json$/));
assert.equal(textureFile.format, 'temperament-lab-figuration-v2');
assert.deepEqual([...new Set(textureFile.pattern.events.map(e => e.voice))], [0, 1, 2]);
assert.ok(textureFile.pattern.events.every(e => e.tones.every(t => t.position !== undefined)));
page.click('[data-comp="undo"]');
assert.equal(page.$$('.roll-note').length, 3);
page.click('[data-comp="figure-done"]');
await page.until(() => !$('.figuration-panel.is-editing'));
assert.equal(page.$$('.roll-note[data-generated]').length, 6);

// Reopen through the actual composition file input.
await page.openSession(saved, '[data-comp-file]');
assert.equal(page.$$('.roll-note[data-generated]').length, 6);
page.click('#hexboard-connect');
await page.until(() => ledRecords(sent).size === 140, {message: 'connected composition LEDs'});
page.click('[data-comp="mode-game"]');
page.change('[data-comp-field="gameMode"]', 'learn');
page.change('[data-comp-field="gameLights"]', 'dark');
page.click('[data-comp="game-start"]');
await page.until(() => !!$('.game.is-running'), {message: 'Wait practice'});
const expected = compileFiguration(saved).events;
const visited = [];
for (const event of expected) {
  await page.until(() => !!$('.game-board [data-comp-key].game-now'), {
    message: 'the current generated target'
  });
  const key = $('.game-board [data-comp-key].game-now'),
    index = Number(key.dataset.compKey);
  const label = key.querySelector('title').textContent;
  const coord = label.match(/(-?\d+)P \+ (-?\d+)G/);
  assert.ok(coord, label);
  assert.deepEqual(
    [Number(coord[1]), Number(coord[2])],
    event.tones[0].coordinate,
    'practice suggests the compiled exact pitch'
  );
  await page.until(() => firmwareRgb(ledRecords(sent).get(index)).some(v => v > 0), {
    message: 'bright physical cue'
  });
  await page.until(
    () =>
      [...ledRecords(sent)].every(
        ([other, record]) => other === index || firmwareRgb(record).every(v => v === 0)
      ),
    {message: 'complete dark-board MIDI frame'}
  );
  for (const [other, record] of ledRecords(sent))
    if (other !== index)
      assert.deepEqual(firmwareRgb(record), [0, 0, 0], 'only the due note lights in dark mode');
  visited.push(index);
  input.onmidimessage({
    data: [0x90 | Math.floor(index / 100), index % 100, 127],
    timeStamp: page.window.performance.now()
  });
  input.onmidimessage({
    data: [0x80 | Math.floor(index / 100), index % 100, 0],
    timeStamp: page.window.performance.now()
  });
  await page.settle();
}
assert.equal(visited.length, 6);
page.click('[data-comp="game-quit"]');
page.click('[data-comp="mode-compose"]');
assert.equal(page.$$('.roll-note[data-generated]').length, 6);
page.click(`[data-comp="chord-select"][data-event="${first.id}"]`);
page.click('[data-comp="figure-detach"]');
await page.until(() => page.$$('.roll-note:not([data-generated])').length === 3, {
  message: 'editable detached notes'
});
const detached = $('.roll-note:not([data-generated])');
page.click(detached);
page.change('[data-comp-field="noteVelocity"][data-event]', 61);
assert.match(page.$('.comp-note-inspector').textContent, /Selected note/);
page.click('[data-comp="save"]');
const detachedSave = JSON.parse(await page.downloaded(/composition\.json$/));
assert.equal(
  detachedSave.clips.flatMap(c => c.events).find(e => e.id === detached.dataset.event).velocity,
  61
);
assert.deepEqual(page.errors, []);
console.log(
  'figuration-workflow: drawing, library, application, undo, harmony edits, reopen, Wait MIDI cues and detachment passed'
);
await page.close();
