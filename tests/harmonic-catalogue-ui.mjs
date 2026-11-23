import assert from 'node:assert/strict';
import {makeState} from '../src/core/catalog.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {
  createHarmonicCatalogueWorkspace,
  renderCatalogueList,
  catalogueListGroups,
  renderDirectoryList
} from '../src/harmonic/harmonic-catalogue-ui.mjs';
import {curatedJIChords} from '../src/harmonic/harmonic-ji-chords.mjs';
import {chordIdentity} from '../src/chords/chord-identity.mjs';
import {coordinateCents, mod} from '../src/core/pitch.mjs';
// Pair by exact reciprocal identity before paging, independently of the ranking
// order or which half survives a search/scale filter.
const cards = curatedJIChords().map(seed => ({
  id: seed.identity.fingerprint,
  kind: 'ji',
  interpretationId: seed.interpretation.id,
  exactDualId: seed.exactDualId,
  interpretation: seed.interpretation,
  preferredLabel: seed.label
}));
const major = cards.find(row => row.preferredLabel === '4:5:6'),
  minor = cards.find(row => row.interpretationId === major.exactDualId);
assert.ok(major && minor);
assert.deepEqual(catalogueListGroups([minor, major]), [{otonal: major, utonal: minor}]);
assert.deepEqual(
  catalogueListGroups([minor]),
  [{otonal: null, utonal: minor}],
  'filtered utonal chords remain on the right'
);
const other = cards.find(
    row => row.interpretation.presentationForm === 'otonal' && row.id !== major.id
  ),
  otherDual = cards.find(row => row.interpretationId === other.exactDualId);
const pageRows = [minor, other, otherDual, major];
const first = renderCatalogueList(pageRows, minor.id, {pageSize: 1}),
  second = renderCatalogueList(pageRows, '', {page: 1, pageSize: 1});
assert.ok(
  first.indexOf('<strong>4:5:6</strong>') <
    first.indexOf(`<strong>${minor.preferredLabel}</strong>`),
  'otonal is left of its reciprocal'
);
assert.match(first, /aria-pressed="true"/, 'paired cards retain selection');
assert.doesNotMatch(second, /<strong>4:5:6<\/strong>/, 'both halves stay on the same page');
assert.equal((first.match(/data-harmony-action="select"/g) || []).length, 2);
const self = cards.find(row => row.interpretation.presentationForm === 'self');
assert.ok(self);
assert.deepEqual(
  catalogueListGroups([self]),
  [{shared: self}],
  'self-reciprocal chords appear once'
);
const custom = {...major, interpretation: {...major.interpretation, presentationForm: null}};
assert.deepEqual(
  catalogueListGroups([custom, minor]),
  [{otonal: custom, utonal: minor}],
  'exact lookup uses the existing reciprocal presentation when available'
);
assert.deepEqual(
  catalogueListGroups([custom]),
  [{shared: custom}],
  'unclassified exact lookups are not assigned invented orientation'
);
let state = {...makeState('meantone'), n: 7, mode: 0},
  playState = {...state, n: 2},
  limit = 15,
  sent = null,
  collected = null,
  heard = null;
const ui = createHarmonicCatalogueWorkspace({
  getState: () => state,
  getPlayState: () => playState,
  getSettings: () => ({limit, primeLimit: state.basis, tol: 0}),
  play: notes => (heard = notes),
  onCollect: (s, c, l, o) => (collected = {s, c, l, o}),
  onSendToHexBoard: value => (sent = value)
});
const change = (field, value) => ui.change({dataset: {harmonyField: field}, value: String(value)}),
  click = (action, extra = {}) => ui.click({dataset: {harmonyAction: action, ...extra}});
// Opens a column's header menu, presses one toggle button, and closes the menu.
const columnFilter = (column, value) => {
  click('directory-menu', {value: column});
  click('directory-filter', {value: String(value)});
  click('directory-menu', {value: column});
};
async function ready() {
  const start = Date.now();
  while (ui.model().status === 'loading') {
    assert.ok(Date.now() - start < 10000);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.notEqual(ui.model().status, 'error', ui.model().error);
}
assert.match(ui.render(), /Harmonic discovery/);
assert.equal(ui.model().result, null, 'disabled A path runs no catalogue job');
ui.setEnabled(true);
await ready();
assert.match(ui.render(), /\d+ chords · complete/);
await ui.openInput('4:5:6');
assert.ok(
  ui.model().entry.mergedInterpretationIds.includes(chordIdentity('4:5:6').fingerprint),
  'a looked-up rotation opens its merged chord'
);
assert.equal(ui.model().entry.preferredLabel, '4:5:6');
assert.doesNotMatch(ui.render(), /Worst mapped pair error|harmony-focus-note|Discover scale:/);
assert.equal(ui.model().detail.occurrences.anywhereCount, 3);
const majorId = ui.model().entry.shapeId,
  family = ui.model().entry.familyId,
  root = ui.model().detail.occurrences.tonicMemberOccurrences[0];
assert.ok(
  root.degrees.includes(0),
  'the tonic scope lists occurrences that use the tonic as a member'
);
change('root', root.id);
change('inversion', 1);
assert.deepEqual(ui.selection().voicing.ratios, ['5/4', '3/2', '2/1']);
click('rotation', {index: '2'});
assert.equal(
  ui.selection().voicing.request.inversion,
  2,
  'rotation updates the chosen occurrence voicing'
);
click('collect');
assert.deepEqual(collected.c, ui.selection().voicing.coords);
assert.match(collected.l, /3:4:5/);
click('rotation', {index: '1'});
click('send');
assert.equal(sent.voicing.voices.length, 3);
click('collect');
assert.equal(collected.o.harmonicSelection.shapeId, majorId);
const saved = JSON.parse(JSON.stringify(ui.serialize())),
  savedVoices = ui.selection().voicing.coords;
ui.restore(saved);
ui.sync();
await ready();
assert.deepEqual(
  ui.selection().voicing.coords,
  savedVoices,
  'selected root and inversion survive session restoration'
);
change('scope', 'play');
assert.equal(ui.model().detail.occurrences.anywhereCount, 0);
assert.match(ui.render(), /absent from this scale/);
change('scope', 'discover-tonic');
assert.ok(ui.model().detail.occurrences.tonicMemberOccurrences.length >= 1);
state = {...state, mode: 1};
ui.sync();
assert.equal(ui.model().entry.shapeId, majorId);
state = {...state, g: 700};
ui.sync();
await ready();
assert.equal(ui.model().entry.shapeId, majorId);
assert.equal(ui.model().entry.familyId, family);
await ui.openInput('5:6:8');
assert.equal(ui.model().entry.shapeId, majorId);
assert.equal(ui.model().entry.familyId, family);
await ui.openInput('6:4:5:4');
assert.equal(
  ui.selection().voicing.voices.length,
  3,
  'doubled lookups open the merged pitch-class chord'
);
const mergedInput = ui.model().entry.interpretation.identity.originalInput;
assert.ok(ui.model().entry.custom);
const directory = ui.renderParts({directory: true});
assert.doesNotMatch(
  directory.controls,
  /data-harmony-field="(sizeMin|sizeMax|scope|bass|sort)"|directory-(size|prime|form)"/,
  'the directory has no filter buttons or sort dropdown; the column headers do both'
);
for (const column of ['notes', 'primes', 'type'])
  assert.match(
    directory.list,
    new RegExp(`data-harmony-action="directory-menu" data-value="${column}"`),
    `the ${column} column header opens its sort and filter menu`
  );
assert.doesNotMatch(directory.list, /directory-selection|Open analysis/);
assert.match(directory.controls, /Recent/);
assert.match(
  directory.list,
  /<span><\/span><span>Chord<\/span>(<span class="directory-th"><button[^>]*>(Notes|Primes|Type)<\/button><button[^>]*data-harmony-action="directory-sort"[^>]*>[^<]*<\/button><\/span>){3}/,
  'the headers are star, chord, then notes, primes and type, each with a sort arrow'
);
assert.doesNotMatch(directory.list, /Limit/, 'there is no limit column');
assert.match(
  directory.list,
  /directory-result"><button[^>]*directory-star[^]*?<button[^>]*class="directory-chord"[^]*?directory-cell">\d+<\/span><span class="directory-cell">[\d –]+<\/span><span class="directory-form">/,
  'rows run star, chord, notes, primes, type'
);
const auditionId = ui
  .model()
  .result.items.find(
    row => row.kind === 'ji' && row.mappingStatus === 'mapped' && row.id !== ui.model().selected
  ).id;
heard = null;
click('select', {id: auditionId, play: '1'});
assert.ok(heard?.length >= 2, 'pressing a chord label sounds the chord');
assert.equal(ui.model().selected, auditionId, 'and selects it');
await ui.openInput(mergedInput);
await ready();
click('directory-tab', {value: 'recent'});
assert.match(
  ui.renderParts({directory: true}).list,
  new RegExp('data-input="' + mergedInput + '"')
);
click('directory-tab', {value: 'favourites'});
const selectionBeforeStar = ui.model().selected;
click('directory-star', {
  input: mergedInput,
  label: '4:5:6',
  ids: ui.model().entry.mergedInterpretationIds.join(' ')
});
assert.equal(ui.model().selected, selectionBeforeStar, 'starring does not change chord selection');
assert.equal(ui.serialize().favourites.length, 1);
assert.match(
  ui.renderParts({directory: true}).list,
  new RegExp('data-input="' + mergedInput + '"')
);
const withFavourite = JSON.parse(JSON.stringify(ui.serialize()));
click('directory-star', {
  input: mergedInput,
  label: '4:5:6',
  ids: ui.model().entry.mergedInterpretationIds.join(' ')
});
assert.equal(ui.serialize().favourites.length, 0);
ui.restore(withFavourite);
ui.sync();
await ready();
assert.equal(ui.serialize().favourites.length, 1, 'favourites survive saved sessions');
assert.deepEqual(ui.serialize().sizes, [3, 4, 5, 6], 'chords start at three to six notes');
columnFilter('notes', 2);
assert.deepEqual(ui.serialize().sizes, [3, 4, 5, 6], 'there is no two-note chord size');
for (const size of [4, 5, 6]) columnFilter('notes', size);
assert.deepEqual(ui.serialize().sizes, [3]);
ui.renderParts({directory: true});
assert.equal(ui.model().status, 'complete', 'hiding note counts does not relist the catalogue');
assert.ok(ui.model().entry, 'and keeps the selected chord');
assert.doesNotMatch(ui.renderParts({directory: true}).list, /data-group="size-4"/);
await ready();
columnFilter('notes', 7);
columnFilter('notes', 3);
columnFilter('notes', 7);
assert.deepEqual(ui.serialize().sizes, [7], 'the last enabled note count cannot be turned off');
ui.renderParts({directory: true});
await ready();
assert.deepEqual(
  ui.model().result.sources.find(source => source.kind === 'chords').sizes,
  [7],
  'the listing follows the note-count filter, beyond six notes'
);
click('directory-clear');
ui.renderParts({directory: true});
await ready();
const listedBefore = ui.renderParts({directory: true}).list;
columnFilter('primes', 5);
assert.deepEqual(ui.serialize().primesOff, [5]);
assert.notEqual(
  ui.renderParts({directory: true}).list,
  listedBefore,
  'switching a basis prime off hides chords that use it'
);
columnFilter('primes', 5);
assert.deepEqual(ui.serialize().primesOff, []);
assert.doesNotMatch(ui.renderParts({directory: true}).list, /directory-dot/, 'no colour dots');
{
  // A column's header menu holds toggle buttons and Reset, and closes on an outside click.
  click('directory-menu', {value: 'primes'});
  const open = ui.renderParts({directory: true}).list;
  assert.match(open, /class="directory-menu"/);
  assert.match(open, /data-harmony-action="directory-filter" data-value="3" aria-pressed="true"/);
  assert.match(open, /directory-menu-reset/);
  assert.doesNotMatch(open, /type="checkbox"|Done/, 'toggle buttons, no Done button');
  ui.click({closest: () => null, dataset: {}});
  assert.doesNotMatch(ui.renderParts({directory: true}).list, /class="directory-menu"/);
  columnFilter('primes', 5);
  click('directory-menu', {value: 'primes'});
  click('directory-menu-reset');
  assert.deepEqual(ui.serialize().primesOff, [], 'Reset restores the column filter');
}
{
  // The header arrows sort at once: low to high, high to low, then off.
  const order = () =>
    [
      ...ui
        .renderParts({directory: true})
        .list.matchAll(/class="directory-chord" data-play="1" data-id="([^"]+)"/g)
    ].map(m => {
      const id = m[1]
        .replaceAll('&quot;', '"')
        .replaceAll('&#39;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&');
      return ui.model().result.items.find(row => row.id === id);
    });
  const arrow = column => click('directory-sort', {value: column});
  const sorted = (keys, direction = 1) =>
    keys.every((key, i) => i === 0 || (direction > 0 ? key >= keys[i - 1] : key <= keys[i - 1]));
  const size = row => row.interpretation?.identity?.cardinality ?? row.shape?.coordinates?.length;
  arrow('notes');
  assert.equal(ui.serialize().directorySort, 'notes');
  assert.ok(sorted(order().map(size)), 'notes sort low to high');
  arrow('notes');
  assert.equal(ui.serialize().directoryDir, -1);
  assert.ok(sorted(order().map(size), -1), 'notes sort high to low');
  arrow('notes');
  assert.equal(ui.serialize().directorySort, '', 'a third press turns the sort off');
  arrow('bogus');
  assert.equal(ui.serialize().directorySort, '', 'an unknown column is ignored');
  arrow('primes');
  const topPrime = row => {
    const primes = row.interpretation?.identity?.primeSupport?.filter(prime => prime !== 2);
    return primes ? (primes.length ? Math.max(...primes) : 0) : Infinity;
  };
  assert.ok(sorted(order().map(topPrime)), 'primes sort by their highest prime, ET chords last');
  arrow('type');
  const rank = {otonal: 0, utonal: 1, ambitonal: 2};
  const byType = order().map(
    row =>
      rank[
        row.interpretation?.presentationForm === 'self'
          ? 'ambitonal'
          : row.interpretation?.presentationForm
      ] ?? 3
  );
  assert.deepEqual(
    byType,
    [...byType].sort((a, b) => a - b),
    'sort by type'
  );
  click('directory-clear');
  assert.equal(ui.serialize().directorySort, '', 'Clear resets the sort');
}
assert.match(ui.renderParts({directory: true}).list, /data-play="1"/);
const repeated = JSON.parse(JSON.stringify(ui.serialize()));
ui.restore(repeated);
ui.sync();
await ready();
click('directory-tab', {value: 'favourites'});
heard = null;
click('directory-recent', {input: mergedInput, play: '1'});
assert.equal(heard.length, 3);
await ui.openInput(mergedInput);
await ready();
assert.match(
  ui.renderParts({directory: true}).list,
  new RegExp('data-input="' + mergedInput + '"')
);
assert.equal(
  ui.selection().voicing.voices.length,
  3,
  'the merged lookup survives session restoration'
);
click('directory-tab', {value: 'browse'});
ui.input({dataset: {harmonyField: 'search'}, value: '4:'});
assert.doesNotThrow(() => ui.render());
assert.equal(ui.model().error, '');
ui.input({dataset: {harmonyField: 'search'}, value: '<img src=x onerror=alert(1)>'});
assert.doesNotMatch(ui.render(), /<img src=x/);
change('scope', 'temperament');
ui.input({dataset: {harmonyField: 'search'}, value: ''});
const tempered = ui
  .model()
  .result.items.find(row => row.kind === 'tempered' && row.status === 'essentially-tempered');
assert.ok(tempered, 'ET chords are listed without a manual search');
click('select', {id: tempered.id});
assert.doesNotMatch(ui.render(), /Every pair is a JI interval of the limit/);
assert.match(ui.render(), /class="matrix chord-interval-matrix"/);
assert.equal(ui.selection().voicing.voices.length, tempered.shape.coordinates.length);
assert.match(ui.render(), /ET is relative to the selected JI limits \(odd limit 15\)/);
assert.match(ui.render(), /inversions refer to the tempered chord/);
const lineCents = kind =>
  [
    ...ui
      .render()
      .match(/class="chord-line-diagram"[^]*?<\/svg>/)[0]
      .matchAll(new RegExp(kind + ' (-?[\\d.]+) cents', 'g'))
  ].map(m => Number(m[1]));
for (let i = 0; i < tempered.shape.coordinates.length; i++) {
  click('rotation', {index: String(i)});
  assert.equal(heard.length, tempered.shape.coordinates.length);
  assert.equal(heard[0], 0, 'every ET rotation auditions with the same tonic bass');
  assert.ok(
    heard.every(c => c >= 0 && c < state.p),
    'raw ET mapping representatives cannot move the preview into a low register'
  );
  const pitches = tempered.shape.coordinates.map(point => coordinateCents(state, point)),
    expected = pitches
      .map(c => mod(c - pitches[i], state.p))
      .sort((a, b) => a - b)
      .map(c => Number(c.toFixed(3)));
  assert.deepEqual(lineCents('tempered'), expected, 'ET diagram follows the selected root');
}
click('rotation', {index: '0'});
const etLine = ui.render().match(/class="chord-line-diagram"[^]*?<\/svg>/)[0],
  etCents = [...etLine.matchAll(/tempered (-?[\d.]+) cents/g)].map(m => Number(m[1]));
assert.equal(etCents.length, tempered.shape.coordinates.length);
assert.equal(etCents[0], 0);
assert.ok(
  etCents.every(c => c >= 0 && c < state.p),
  'ET diagram uses positive cents modulo the temperament period'
);

await ui.openInput('8:9:10:15');
const frames = new Set(),
  labelPositions = new Set();
for (const index of [0, 1, 2, 3]) {
  click('rotation', {index: String(index)});
  const svg = ui.render().match(/class="chord-line-diagram"><svg([^]*?)<\/svg>/)[1];
  const rail = svg.match(
    /<line x1="([^"]+)" x2="[^"]+" y1="([^"]+)" y2="[^"]+" class="chord-line-rail"/
  );
  const divider = svg.match(
    /<line x1="[^"]+" x2="([^"]+)" y1="([^"]+)" y2="[^"]+" class="chord-line-divider"/
  );
  assert.ok(Number(divider[1]) < Number(rail[1]), 'leave a gap before zero cents');
  assert.equal(divider[2], rail[2], 'align the label divider with the pitch rail');
  for (const tick of svg.matchAll(/<text x="([^"]+)" y="[^"]+" text-anchor="middle">0\.0¢/g))
    assert.equal(tick[1], rail[1]);
  frames.add(
    rail[1] +
      ' ' +
      svg.match(/viewBox="([^"]+)"/)[1] +
      ' ' +
      svg.match(/y1="([^"]+)" y2="[^"]+" class="chord-line-rail"/)[1]
  );
  labelPositions.add(
    [...svg.matchAll(/<text x="[^"]+" y="([^"]+)" text-anchor="middle"/g)]
      .map(match => match[1])
      .join(',')
  );
}
assert.ok(
  labelPositions.size > 1,
  'the fixture staggers colliding labels differently across rotations'
);
assert.equal(frames.size, 1, 'all rotations keep the same diagram height and rail position');
await ui.openInput('4:5:6');
assert.match(ui.render(), /chord-line-diagram/);
const matrixRows = ui
  .render()
  .match(/class="matrix chord-interval-matrix"[^]*?<tbody>([^]*?)<\/tbody>/)[1]
  .match(/<tr[^>]*>[^]*?<\/tr>/g);
assert.equal(matrixRows.length, 3);
for (const row of matrixRows)
  assert.match(
    row,
    /<\/th><td><span class="cell ratio-cell chord-matrix-unison"/,
    'the first interval after the rotation button is unison'
  );
assert.doesNotMatch(ui.render(), /<th>Member<\/th>|<th>Pair<\/th>/);
assert.match(ui.render(), /dyad-used/, 'a JI chord marks the JI readings it uses');
const spellings = () => ui.render().match(/<p class="harmony-forms">([^]*?)<\/p>/)[1];
assert.equal(spellings(), 'Otonal <b>4:5:6</b> · Utonal <b>1/15:12:10</b>');
const analysisMarkup = ui.renderParts({directory: true}).detail;
const innerMatrix = analysisMarkup.match(/class="matrix chord-interval-matrix"[^]*?<\/table>/)[0];
for (const [i, row] of matrixRows.entries())
  assert.match(
    row,
    new RegExp(
      '<th scope="row"[^>]*><button data-harmony-action="rotation"[^>]*data-index="' + i + '"'
    )
  );
assert.equal((innerMatrix.match(/class="rotation-label"/g) ?? []).length, 3);
assert.doesNotMatch(analysisMarkup, /<h5>Interval matrix<\/h5>/);
assert.ok(
  analysisMarkup.indexOf('chord-line-diagram') < analysisMarkup.indexOf('chord-interval-matrix'),
  'pitch diagram precedes the matrix with attached rotations'
);
click('rotation', {index: '1'});
assert.equal(heard[0], 0, 'JI rotations also use the central tonic');
assert.match(ui.render(), /data-chord-row="1"[^>]*class="is-active-rotation" aria-current="true"/);
assert.equal((ui.render().match(/class="is-active-rotation"/g) ?? []).length, 1);
assert.equal(spellings(), 'Otonal <b>5:6:8</b> · Utonal <b>1/24:20:15</b>');
assert.deepEqual(
  lineCents('JI'),
  [0, 1200 * Math.log2(6 / 5), 1200 * Math.log2(8 / 5)].map(c => Number(c.toFixed(3))),
  'JI ticks follow the rotated ratios'
);
assert.deepEqual(
  lineCents('tempered'),
  heard.map(c => Number(c.toFixed(3))),
  'tempered ticks follow rotation playback'
);
click('rotation', {index: '2'});
assert.match(ui.render(), /data-chord-row="2"[^>]*class="is-active-rotation" aria-current="true"/);
assert.equal(spellings(), 'Otonal <b>3:4:5</b> · Utonal <b>1/20:15:12</b>');
const heading = () =>
    ui
      .render()
      .match(/<h4>([^<]*)/)[1]
      .trim(),
  currentRotation = () =>
    ui.render().match(/data-harmony-action="rotation"[^>]*aria-pressed="true">([^<]*)<small>/)?.[1];
const rotationLabels = () =>
  [
    ...ui
      .render()
      .match(/class="matrix chord-interval-matrix"[^]*?<\/table>/)[0]
      .matchAll(/data-harmony-action="rotation"[^>]*>([^<]*)</g)
  ].map(m => m[1]);
assert.equal(heading(), '4:5:6', 'the directory chord stays at the top');
assert.equal(currentRotation(), '3:4:5', 'the selected rotation is shown beneath it');
assert.deepEqual(
  rotationLabels().sort(),
  ['3:4:5', '4:5:6', '5:6:8'],
  'otonal rotations use otonal labels'
);
await ui.openInput('10:12:15');
assert.equal(heading(), '1/6:5:4');
assert.ok(
  rotationLabels().length === 3 && rotationLabels().every(label => label.startsWith('1/')),
  'utonal rotations use utonal labels'
);
const minorRotation = rotationLabels().find(label => label !== '1/6:5:4'),
  minorIndex = ui
    .render()
    .match(new RegExp(`data-index="(\\d)"[^>]*>${minorRotation.replace(/[/]/g, '\\/')}<`))[1];
click('rotation', {index: minorIndex});
assert.equal(heading(), '1/6:5:4');
assert.equal(currentRotation(), minorRotation);
await ui.openInput('8:10:12:15');
assert.equal(heading(), '8:10:12:15');
assert.match(ui.render(), /form-badge ambitonal/, 'a self-reciprocal chord is ambitonal');
assert.ok(
  rotationLabels().every(label => !label.startsWith('1/')),
  'ambitonal rotations use only otonal labels'
);
await ui.openInput('4:5:6');
click('rotation', {index: '0'});
assert.match(
  ui.render(),
  /aria-pressed="true">4:5:6<small>Root position/,
  'the directory spelling is root position'
);
click('rotation', {index: '1'});
assert.match(ui.render(), /title="1st inversion of 4:5:6" aria-pressed="true">5:6:8/);
click('rotation', {index: '0'});
// Chords on a bass note: every inversion of a listed chord whose lowest note can stand on a scale degree.
{
  change('search', '');
  assert.deepEqual(ui.setBass({scale: 'discover', degree: 2}), {scale: 'discover', degree: 2});
  const list = ui.renderParts({directory: true}).list,
    entries = ui.bassEntries();
  assert.match(list, /with Discover scale degree 2 as the bass/);
  {
    const firstInversion = entries.findIndex(e => !e.rootPosition);
    assert.ok(
      firstInversion > 0 && entries.slice(firstInversion).every(e => !e.rootPosition),
      'root positions are listed before inversions'
    );
  }
  const majorOn2 = entries.find(e => e.row.preferredLabel === '4:5:6');
  assert.ok(
    majorOn2 && majorOn2.inversion === 1 && majorOn2.spelling === '5:6:8',
    'major stands on degree 2 in 1st inversion, the rotation 5:6:8'
  );
  const majorRoot = majorOn2.rootDegree;
  assert.ok(
    Number.isInteger(majorRoot) && majorRoot !== 2 && majorOn2.bassDegree === 2,
    'its root is another degree than its bass'
  );
  assert.equal(majorOn2.label, `${majorRoot} - 4:5:6`, 'entries are written root - chord');
  assert.ok(
    list.includes(`<span>${majorRoot} - 4:5:6</span><small>1st inversion (5:6:8)</small>`),
    'the list names the root and the inversion'
  );
  const minorRoots = [];
  for (let d = 0; d < state.n; d++) {
    ui.setBass({scale: 'discover', degree: d});
    if (
      ui
        .bassEntries()
        .some(
          e => e.row.preferredLabel === '1/6:5:4' && e.rootPosition && e.label === `${d} - 1/6:5:4`
        )
    )
      minorRoots.push(d);
  }
  assert.ok(
    minorRoots.length,
    'minor stands in root position, written in its utonal form, on some degree'
  );
  ui.setBass({scale: 'discover', degree: 2});
  assert.ok(
    entries.length > 2 && entries.every(e => e.degrees[0] === 2 && e.degree === 2),
    'every listed chord has degree 2 in the bass'
  );
  click('bass-select', {id: majorOn2.row.id, member: String(majorOn2.member)});
  assert.equal(heading(), '4:5:6');
  assert.equal(currentRotation(), '5:6:8', 'choosing an entry opens its chord on that inversion');
  assert.match(
    ui.render(),
    new RegExp(`1st inversion of ${majorRoot} - 4:5:6 · bass on Discover scale degree 2`)
  );
  {
    const onRoot = ui
      .rootEntriesFor({scale: 'discover', degree: majorRoot})
      .filter(e => e.row.preferredLabel === '4:5:6');
    assert.deepEqual(
      onRoot.map(e => [e.inversion, e.rootDegree, e.label]),
      [0, 1, 2].map(k => [k, majorRoot, `${majorRoot} - 4:5:6`]),
      'chords on a root list every inversion that keeps the root'
    );
    assert.deepEqual(
      onRoot.map(e => e.bassDegree),
      onRoot[0].degrees,
      'each inversion moves the bass up the root-position chord'
    );
  }
  const voice = ui.model().detail.voice;
  assert.ok(voice, 'the entry’s occurrence is chosen for voicing');
  assert.equal(voice.inversion, majorOn2.member, 'the voicing has the same note in the bass');
  assert.equal(
    voice.degrees[voice.pitches.indexOf(Math.min(...voice.pitches))],
    2,
    'the selected voicing has degree 2 in the bass'
  );
  assert.equal(
    ui.setBass({scale: 'play', degree: 5}),
    null,
    'a degree outside the 2-note Play scale is rejected'
  );
  change('bass', 'discover:0');
  assert.deepEqual(ui.bass(), {scale: 'discover', degree: 0});
  assert.ok(ui.bassEntries().some(e => e.row.preferredLabel === '4:5:6' && e.rootPosition));
  click('directory-clear');
  assert.equal(ui.bass(), null, 'Clear also clears the bass');
  click('rotation', {index: '0'});
}
assert.doesNotMatch(ui.renderParts({directory: true}).detail, /pitch classes/);
click('directory-star', {input: tempered.spelling, label: tempered.preferredLabel});
assert.ok(
  ui.serialize().favourites.some(r => r.input === tempered.spelling),
  'ET chords can be starred'
);
ui.input({dataset: {harmonyField: 'search'}, value: ''});
for (const form of ['otonal', 'utonal', 'ambitonal']) columnFilter('type', form);
assert.deepEqual(ui.serialize().forms, ['et'], 'chord types toggle independently');
assert.match(
  ui.renderParts({directory: true}).list,
  new RegExp(`data-input="${tempered.spelling}"[^>]*aria-pressed="true"`)
);
await ui.openInput('4:5:6');
await ui.openInput(tempered.spelling);
assert.equal(ui.model().entry.id, tempered.id, 'a starred ET spelling recalls the ET chord');
const before = ui.model().result.targetSetId;
limit = 27;
ui.sync();
assert.equal(ui.model().status, 'loading', 'a changed odd limit relists chords automatically');
await ready();
assert.notEqual(ui.model().result.targetSetId, before);
ui.setEnabled(false);
ui.destroy();
state = {...fromCommas('245/243', '3.5.7', 'Computed CWE'), n: 7, mode: 0};
const native = createHarmonicCatalogueWorkspace({
  getState: () => state,
  getSettings: () => ({limit: 15, primeLimit: state.basis, tol: 10})
});
native.setEnabled(true);
await native.openInput('1:3');
assert.equal(native.selection().voicing.voices.length, 2);
assert.doesNotMatch(native.render(), /class="harmony-heading"/);
assert.match(native.render(), /Otonal <b>1:3<\/b> · Utonal <b>1\/3:1<\/b>/);
native.destroy();
assert.doesNotMatch(
  renderCatalogueList(
    [
      {
        id: 'x',
        preferredLabel: '<script>',
        kind: 'assessment',
        status: 'unknown',
        shape: {
          coordinates: [
            [0, 0],
            [1, 0]
          ]
        }
      }
    ],
    ''
  ),
  /<script>/
);
// Browse pages bound the number of rendered chords.
const many = Array.from({length: 150}, (_, i) => ({
  id: 't' + i,
  kind: 'tempered',
  status: 'essentially-tempered',
  preferredLabel: 'ET ' + i,
  spelling: '1/1:' + (i + 2) + '/' + (i + 1),
  shape: {
    coordinates: [
      [0, 0],
      [0, 1],
      [0, 2]
    ]
  }
}));
const count = html => (html.match(/data-harmony-action="select"/g) || []).length;
assert.equal(count(renderDirectoryList(many, '')), 100);
assert.equal(count(renderDirectoryList(many, '', [], 1)), 50);
assert.match(renderDirectoryList(many, ''), /1–100 of 150/);
const ambi = {
  id: 'a',
  kind: 'ji',
  preferredLabel: '4:7',
  interpretation: {presentationForm: 'self', identity: {cardinality: 3, originalInput: '4:7:8'}}
};
assert.match(
  renderDirectoryList([ambi], ''),
  /directory-form">Ambitonal/,
  'self-reciprocal chords show their form'
);
console.log(
  'Harmonic UI covers lazy A/B jobs, aliases, scope, inversion, sound, target changes, ET evidence, alternatives and native exact input.'
);
