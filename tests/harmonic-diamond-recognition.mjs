import assert from 'node:assert/strict';
import {makeState} from '../src/core/catalog.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {mapRatio} from '../src/core/engine.mjs';
import {
  diamondHarmonicSelection,
  diamondCellsForSelection
} from '../src/diamond/diamond-harmonic-selection.mjs';
import {createLiveChordRecognizer} from '../src/chords/live-chord-recognition.mjs';
import {createHarmonicCatalogueWorkspace} from '../src/harmonic/harmonic-catalogue-ui.mjs';
import {mod} from '../src/core/pitch.mjs';
import {buildBoard} from '../src/hexboard/hexboard.mjs';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';
const s = makeState('meantone'),
  ratios = ['1/1', '5/4', '3/2', '1/1'];
const members = ratios.map((ratio, i) => {
  const [n, d] = ratio.split('/');
  return {cellId: `${i}:0`, ratio, coordinate: mapRatio(n, d, s), mapped: true};
});
const selection = diamondHarmonicSelection(s, members);
assert.equal(selection.voicing.voices.length, 4);
assert.equal(new Set(selection.voicing.voices.map(v => v.memberId)).size, 4);
assert.equal(selection.provenance.canonicalMapping, true);
assert.deepEqual(
  selection.voicing.coords,
  members.map(m => m.coordinate)
);
assert.equal(selection.exactSpelling.length, 4);
const cells = members.map(m => ({
  id: m.cellId,
  label: m.ratio,
  status: {approximation: {m: m.coordinate, mapped: true}}
}));
assert.deepEqual(
  diamondCellsForSelection(cells.reverse(), selection).sort(),
  members.map(m => m.cellId).sort()
);
const wrong = structuredClone(cells);
wrong[0].status.approximation.m[0] += 1;
assert.equal(diamondCellsForSelection(wrong, selection).length, 3);
const alternative = diamondHarmonicSelection(
  s,
  members.map((m, i) => (i === 1 ? {...m, mapped: false, coordinate: [3, 7]} : m))
);
assert.equal(alternative.harmonicId, undefined);
assert.equal(alternative.provenance.canonicalMapping, false);
assert.deepEqual(alternative.voicing.coords[1], [3, 7]);
const ui = createHarmonicCatalogueWorkspace({
  getState: () => s,
  getSettings: () => ({limit: 15, primeLimit: s.basis, tol: 20})
});
ui.setEnabled(true);
ui.openSelection(alternative);
assert.deepEqual(ui.selection().voicing.coords, alternative.voicing.coords);
ui.render();
assert.deepEqual(ui.selection().voicing.coords, alternative.voicing.coords);
ui.destroy();
const inverted = createHarmonicCatalogueWorkspace({
  getState: () => ({...s, n: 7, mode: 0}),
  getSettings: () => ({limit: 15, primeLimit: s.basis, tol: 20})
});
inverted.setEnabled(true);
await inverted.openInput('4:5:6');
inverted.change({
  dataset: {harmonyField: 'root'},
  value: inverted.model().detail.occurrences.tonicMemberOccurrences[0].id
});
inverted.change({dataset: {harmonyField: 'inversion'}, value: '1'});
const invertedCells = inverted.selection().voicing.ratios.map((label, i) => ({
  id: 'inverted:' + i,
  label,
  status: {approximation: {mapped: true, m: inverted.selection().voicing.coords[i]}}
}));
assert.deepEqual(
  diamondCellsForSelection(invertedCells, inverted.selection()),
  invertedCells.map(c => c.id),
  'inverted voices use their sounded ratio labels rather than canonical tone array order'
);
inverted.destroy();
const recognizer = createLiveChordRecognizer(),
  cfg = {limit: 15, primeLimit: s.basis, tol: 20, familyRecognition: true};
const base = [
    [0, 0],
    [-2, 4],
    [0, 1]
  ],
  raised = base.map((m, i) => [m[0] + [4, 1, 2][i], m[1]]);
const recognized = recognizer.recognize(
  s,
  raised.map(coordinate => ({coordinate})),
  cfg
);
assert.equal(recognized.status, 'match');
assert.equal(recognized.exactMatches.length, 0);
assert.ok(recognized.familyMatches.some(m => m.label === '4:5:6'));
assert.deepEqual(
  recognized.voicing.map(v => v.coordinate),
  raised
);
assert.equal(
  recognizer.recognize(
    s,
    base.map(coordinate => ({coordinate})),
    {...cfg, tol: 0}
  ).status,
  'match',
  'B mapping recognition is independent of quality tolerance'
);
const originalDocument = globalThis.document,
  host = {innerHTML: ''};
try {
  globalThis.document = {
    querySelector: selector => (selector === '[data-live-chord-readout]' ? host : null)
  };
  const hex = createHexboardWorkspace({
    getStates: () => [s],
    getHz: () => 330,
    play: () => {},
    refresh: () => {},
    notify: () => {}
  });
  const markup = hex.render();
  assert.ok(markup.indexOf('hex-chord-panel') < markup.indexOf('data-live-chord-readout'));
  assert.doesNotMatch(markup, /live-chord-kicker/);
  const keys = buildBoard(s, hex.serialize().configs[0])
    .keys.filter(k => k.enabled)
    .slice(0, 3);
  const notes = keys.map(key => ({id: String(key.index), coordinate: key.m, cents: key.c}));
  hex.updateLiveChord(recognized, notes);
  assert.equal((host.innerHTML.match(/class="live-note-column"/g) || []).length, 3);
  assert.match(host.innerHTML, /4:5:6/);
  assert.doesNotMatch(host.innerHTML, /error|tolerance|Live chord/);
  for (const key of keys) {
    assert.ok(host.innerHTML.includes('#' + key.index));
    assert.ok(host.innerHTML.includes(mod(key.c, s.p).toFixed(2) + ' ¢'));
    assert.ok(host.innerHTML.includes((330 * 2 ** (key.c / 1200)).toFixed(2) + ' Hz'));
  }
  const five = buildBoard(s, hex.serialize().configs[0])
    .keys.filter(k => k.enabled)
    .slice(0, 5)
    .sort((a, b) => a.c - b.c || a.index - b.index);
  const aligned = {
    status: 'match',
    matches: [
      {
        label: '4:5:6:7:9',
        members: five.map((k, i) => ({coordinate: k.m, ratio: String([4, 5, 6, 7, 9][i])}))
      }
    ]
  };
  hex.updateLiveChord(aligned, five.map(k => ({id: String(k.index), cents: k.c})).reverse());
  assert.equal((host.innerHTML.match(/class="live-ratio-member"/g) || []).length, 5);
  for (let i = 0; i < 5; i++)
    assert.ok(
      host.innerHTML.includes(
        `>${[4, 5, 6, 7, 9][i]}</strong><span title="Button number">#${five[i].index}</span>`
      ),
      'ratio member is above its button'
    );
  for (const pitch of [-s.p - 125, s.p + 125, 2 * s.p]) {
    hex.updateLiveChord({status: 'single-note', matches: []}, [{...notes[0], cents: pitch}]);
    assert.ok(host.innerHTML.includes(mod(pitch, s.p).toFixed(2) + ' ¢'));
    assert.ok(host.innerHTML.includes((330 * 2 ** (pitch / 1200)).toFixed(2) + ' Hz'));
  }
  hex.updateLiveChord();
  assert.match(host.innerHTML, /Play keys/);
  assert.doesNotMatch(host.innerHTML, /live-note-column/);
} finally {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
}
const extra = recognizer.recognize(
  s,
  [...raised, [0, 5]].map(coordinate => ({coordinate})),
  cfg
);
assert.ok(
  !extra.familyMatches.some(m => m.label === '4:5:6'),
  'extra held note cannot produce a triad-only family match'
);
assert.equal(
  recognizer.recognize(
    s,
    [
      [0, 0],
      [3, 0]
    ].map(coordinate => ({coordinate})),
    cfg
  ).status,
  'match',
  'unseeded octave register still has two voices'
);
const divided = fromCommas('128/125', '2.3.5', 'Computed CWE'),
  division = diamondHarmonicSelection(
    divided,
    ['1/1', '5/4', '25/16'].map((ratio, i) => {
      const [n, d] = ratio.split('/');
      return {cellId: String(i), ratio, coordinate: mapRatio(n, d, divided), mapped: true};
    })
  );
assert.equal(division.voicing.voices.length, 3);
console.log(
  'Diamond provenance preserves repeated/alternative voices; exact cell reverse links and unseeded complete-family recognition pass.'
);
