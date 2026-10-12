import assert from 'node:assert/strict';
import {scale} from '../src/core/engine.mjs';
import {makeState} from '../src/core/catalog.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {getHarmonicEntry} from '../src/harmonic/harmonic-catalogue.mjs';
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
const discoverBefore = structuredClone(state),
  layoutState = {state: {...state, n: 2, mode: 0}};
let renders = 0,
  message = '';
const app = readFileSync(new URL('../src/app.mjs', import.meta.url), 'utf8'),
  fitContext = vm.createContext({
    getLayoutStates: () => [layoutState.state],
    layoutState,
    scale,
    validate: validateState,
    renderWorkspace: () => renders++,
    toast: value => (message = value)
  });
vm.runInContext(
  app.split('\n').find(line => line.startsWith('function fitPlayHarmony(')),
  fitContext
);
fitContext.fitPlayHarmony(coords);
assert.ok(
  coords.every(m => scale(layoutState.state).notes.some(note => note.k === m[1])),
  'explicit fit chooses a Play scale containing all requested generators'
);
assert.equal(renders, 1);
assert.deepEqual(state, discoverBefore, 'explicit Play fit leaves Discover alone');
const fitted = structuredClone(layoutState.state);
fitContext.fitPlayHarmony([
  [0, 0],
  [0, 300]
]);
assert.equal(JSON.stringify(layoutState.state), JSON.stringify(fitted));
assert.match(message, /within 256 notes/);
console.log(
  'Discover → Play preserves coordinates, explicit fit, top-three lazy fingerings, mapping guards and old/new material provenance.'
);
