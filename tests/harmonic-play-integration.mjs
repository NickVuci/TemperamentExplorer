import assert from 'node:assert/strict';
import {scale, fitGeneratedScale} from '../src/core/engine.mjs';
import {makeState} from '../src/core/catalog.mjs';
import {bootApp} from './support/dom.mjs';
import {getHarmonicEntry} from './support/harmonic-catalogue.mjs';
import {
  harmonicSelection,
  restoredHarmonicProvenance
} from '../src/harmonic/harmonic-selection.mjs';
import {createHarmonicPlayWorkspace} from '../src/harmonic/harmonic-play-ui.mjs';
import {buildBoard} from '../src/hexboard/hexboard.mjs';
import {createMaterialWorkspace} from '../src/ui/material-ui.mjs';
import {validateState} from '../src/core/state.mjs';
let state = {...makeState('meantone'), n: 19, mode: 0},
  highlight = null,
  fit = null,
  heard = null;
const entry = await getHarmonicEntry({state}, '4:5:6'),
  selected = harmonicSelection(state, entry),
  coords = selected.voicing.voices.map(v => v.coordinate),
  before = structuredClone(state);
const board = () =>
  buildBoard(state, {
    base: 7,
    style: 'bosanquet',
    center: 65,
    offset: 0,
    rotation: 0,
    register: 0,
    outside: false,
    periodWrapping: true
  });
const ui = createHarmonicPlayWorkspace({
  getState: () => state,
  getBoard: board,
  onHighlight: value => (highlight = value),
  onFitScale: value => (fit = value),
  play: notes => (heard = notes)
});
const click = (action, extra = {}) => ui.click({dataset: {harmonyPlay: action, ...extra}});
ui.accept(selected);
assert.deepEqual(state, before, 'sending to Play never changes its scale'); // The merged chord's source notes (rooted on its simplest rotation) fall outside this 19-note scale, so Play starts from its first occurrence.
assert.equal(ui.model().realization.withinScale, true);
assert.equal(ui.model().realization.coords.length, coords.length);
assert.equal(ui.model().fingering, -1, 'no silent fingering choice');
assert.ok(ui.model().placements.length);
assert.equal(
  (ui.render().match(/data-harmony-play="fingering"/g) ?? []).length,
  Math.min(3, ui.model().placements.length)
);
click('fingering', {index: 0});
assert.ok(highlight);
click('hear');
assert.deepEqual(heard, ui.model().placements[0].pitches);
ui.suspend();
assert.equal(highlight, null);
assert.equal(
  ui.model().fingering,
  -1,
  'returning from A does not show a selected fingering without its highlight'
);
state = {...state, n: 2};
ui.sync();
assert.equal(ui.model().realization.withinScale, false);
assert.deepEqual(ui.model().realization.coords, coords);
assert.match(ui.render(), /Fit Play scale/);
click('fit');
assert.deepEqual(fit, coords);
assert.equal(state.n, 2);
const session = ui.serialize();
ui.restore(JSON.parse(JSON.stringify(session)));
assert.deepEqual(ui.model().selection, selected);
state = {...makeState('magic11'), n: 19, mode: 0};
assert.match(ui.render(), /another mapping/);
assert.equal(ui.model().realization, null);
state = before;
let notified = [];
const material = createMaterialWorkspace({
  getState: () => state,
  validate: validateState,
  play: () => {},
  place: () => {},
  load: () => {},
  refresh: () => {},
  notify: text => notified.push(text)
});
material.add('chord', state, coords, 'Major', {exact: true, harmonicSelection: selected});
const saved = material.serialize();
material.restore(JSON.parse(JSON.stringify(saved)));
assert.deepEqual(material.serialize()[0].harmonicSelection, selected);
const invalid = structuredClone(saved);
invalid[0].harmonicSelection.version = 99;
material.restore(invalid);
assert.equal(material.serialize()[0].harmonicSelection, undefined);
assert.deepEqual(material.serialize()[0].coords, coords);
assert.equal(
  restoredHarmonicProvenance(selected, state, [
    [99, 0],
    [0, 1]
  ]),
  null
);
// Fitting a Play scale: the first collision-free generated scale holding every chord generator.
const generators = coords.map(m => m[1]),
  playState = {...state, n: 2, mode: 0},
  fitted = fitGeneratedScale(playState, generators);
assert.ok(
  generators.every(k => scale(fitted).notes.some(note => note.k === k)),
  'explicit fit chooses a Play scale containing all requested generators'
);
assert.equal(fitGeneratedScale(fitted, generators), fitted, 'a scale that already fits is kept');
assert.equal(fitGeneratedScale(playState, [0, 300]), null, 'nothing fits within 256 notes');

// In the app: a chord sent from Discover fits the Play scale without changing Discover's scale.
const page = await bootApp(),
  discoverScale = () => [page.$('[data-field="n"]').value, page.$('[data-field="mode"]').value];
await page.until(
  () => /chords · complete/.test(page.$('[data-unified-pane="directory"]')?.textContent ?? ''),
  {message: 'the chord directory'}
);
const discoverBefore = discoverScale();
page.input('[data-harmony-field="search"]', '16:20:25');
page.click('[data-harmony-action="lookup"]');
await page.until(() => page.$('[data-harmony-action="send"]'), {message: 'the chord detail'});
page.click('[data-harmony-action="send"]');
await page.settle();
assert.equal(page.$('#play-view').hidden, false, 'Send to Play opens Play');
page.click('[data-hex-action="chord-mode"][data-mode="places"]');
await page.settle();
const playScale = () => page.$('#play-view select[data-hex-field="target"]').value;
assert.equal(playScale(), '7');
page.click('[data-harmony-play="fit"]');
await page.settle();
assert.equal(playScale(), '9', 'the augmented triad spans eight fifths, so Play needs nine notes');
assert.equal(page.$('[data-harmony-play="fit"]'), null, 'the fitted scale holds the chord');
page.section('discover');
await page.settle();
assert.deepEqual(discoverScale(), discoverBefore, 'explicit Play fit leaves Discover alone');
assert.deepEqual(page.errors, []);
console.log(
  'Discover → Play preserves coordinates, explicit fit, top-three lazy fingerings, mapping guards and old/new material provenance.'
);
await page.close();
