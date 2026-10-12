// The Play shape explorer controller over real fallback jobs, a real board with a few enabled keys,
// and a memory preset store: targets, cards, placements, readings, saving, sessions and retuning.
import assert from 'node:assert/strict';
import {BUILTIN_LAYOUTS} from '../src/hexboard/builtin-layouts.mjs';
import {buildBoard} from '../src/hexboard/hexboard.mjs';
import {hexDistance} from '../src/hexboard/hexboard-chords.mjs';
import {coordinateCents} from '../src/core/pitch.mjs';
import {createPresetStore} from '../src/presets/preset-store.mjs';
import {shapePresetSnapshot} from '../src/shapes/shape-preset-data.mjs';
import {makeState} from '../src/core/catalog.mjs';
import {chordPlacements} from '../src/hexboard/hexboard-chords.mjs';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';
import {
  createShapeExplorer,
  shapePlacementOverlay,
  groupReadings,
  matchKindLabel,
  shapeMaterialSelection
} from '../src/shapes/shape-explorer-ui.mjs';

const memory = () => {
  const values = new Map();
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
};
const layout = structuredClone(BUILTIN_LAYOUTS.find(p => p.id === 'builtin:meantone').state);
let state = structuredClone(layout.context);
const config = structuredClone(layout.config);
const restrict = (board, radius = 2) => {
  const centre = board.keys[65];
  return {
    ...board,
    keys: board.keys.map(k =>
      k.command || hexDistance(k, centre) <= radius ? k : {...k, enabled: false}
    )
  };
};
let board = restrict(buildBoard(state, config)),
  selectedKeys = [];
const node = dataset => ({
  dataset,
  closest() {
    return this;
  }
});
const field = (name, value, extra = {}) => ({
  dataset: {shapeField: name},
  value: String(value),
  ...extra
});
const events = {highlight: [], collect: [], notes: [], played: [], classified: [], opened: []};
const store = createPresetStore({storage: memory()});
const options = {
  getState: () => state,
  getBoard: () => board,
  getConfig: () => config,
  getSettings: () => ({limit: 5, primeLimit: 5}),
  getSelectedKeys: () => selectedKeys,
  onHighlight: value => events.highlight.push(value),
  classify: coordinates => {
    events.classified.push(coordinates);
    return {status: 'chord', source: 'directory', kind: 'ji', label: '4:5:6', formLabel: 'Otonal'};
  },
  onOpenHarmony: coordinates => {
    events.opened.push(coordinates);
    return true;
  },
  onCollect: (...args) => events.collect.push(args),
  notify: message => events.notes.push(message),
  play: pitches => events.played.push(pitches),
  store
};
const explorer = createShapeExplorer(options);
await explorer.init();
const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

// Targets: typed chords are added once; an invalid constraint is refused and keeps the old value.
explorer.input({dataset: {shapeDraft: ''}, value: '4:5:6; 10:12:15\n4:5:6'});
explorer.click(node({shapeAction: 'add'}));
assert.deepEqual(explorer.model().inputs, ['4:5:6', '10:12:15']);
explorer.change(field('span', '-1'));
assert.match(explorer.model().error, /nonnegative/);
assert.equal(explorer.model().constraints.span, 6);
explorer.change(field('maxNodes', '1.5'));
assert.match(explorer.model().error, /valid search limit/);
explorer.change(field('span', '2'));
assert.equal(explorer.model().constraints.span, 2);
explorer.change(field('scaleOnly', '', {checked: false}));
assert.equal(explorer.model().constraints.scaleOnly, false);

// Forward search: cards, an honest completeness line and readable match labels.
await explorer.search();
let model = explorer.model();
assert.equal(model.status, 'ready');
assert.equal(model.result.complete, true);
assert.ok(model.result.shapes.length > 1);
let html = explorer.render();
assert.match(html, /complete within the selected limits/);
assert.equal(
  (html.match(/class="shape-card"/g) ?? []).length,
  Math.min(24, model.result.shapes.length)
);
assert.doesNotMatch(
  html,
  /exact-source-voicing|reference-voicing|added-doubling/,
  'match kinds are shown as words'
);
assert.match(html, /1\/6:5:4|10:12:15/);
assert.match(html, /4:5:6/);

// A bad typed chord reports an error without discarding the results on screen.
explorer.input({dataset: {shapeDraft: ''}, value: 'not a chord'});
await explorer.search();
assert.equal(explorer.model().result, model.result);
assert.equal(explorer.model().status, 'ready');
assert.ok(explorer.model().error);
explorer.input({dataset: {shapeDraft: ''}, value: ''});

// Selecting a card lights its first placement with chord-tone labels keyed by physical button.
const shape =
  model.result.shapes.find(
    s => s.placements.length > 1 && s.associations.some(a => a.input === '4:5:6')
  ) ?? model.result.shapes.find(s => s.placements.length > 1);
assert.ok(shape, 'some shape has more than one placement');
explorer.click(node({shapeAction: 'select', id: shape.id}));
let lit = events.highlight.at(-1);
assert.deepEqual(lit.keys, shape.placements[0].keys);
const reading = shape.placements[0].associations[0];
for (const [member, key] of reading.memberKeys.entries())
  assert.ok(lit.toneLabels[key].includes(reading.members[member].toneIndex));
html = explorer.render();
assert.match(html, /Fingering 1 of /);
assert.match(html, /Exact placement/);
assert.match(html, /root position|inversion/);
{
  // The chosen shape opens directly after its card, with one board miniature per fingering to pick from.
  const card = html.indexOf('aria-expanded="true"'),
    panel = html.indexOf('class="shape-details"'),
    next = html.indexOf('class="shape-card"', card + 1);
  assert.ok(
    card > 0 && panel > card && (next < 0 || next > panel),
    'the fingering panel follows its own card'
  );
  assert.equal(
    (html.match(/data-shape-action="fingering"/g) ?? []).length,
    Math.min(12, shape.placements.length)
  );
  assert.equal(
    (html.match(/class="fingering-map"/g) ?? []).length,
    Math.min(12, shape.placements.length)
  );
  assert.match(html, /data-shape-action="fingering" data-index="0" aria-pressed="true"/);
  assert.ok(
    (html.match(/class="fingering-pattern"/g) ?? []).length >= 2,
    'cards and the open shape draw their patterns'
  );
  assert.match(html, /fingerings? on this board/);
}
assert.doesNotMatch(html, /exact-source-voicing|reference-voicing/);

// Choosing a fingering from the picker lights it.
explorer.click(node({shapeAction: 'fingering', index: String(shape.placements.length - 1)}));
assert.equal(explorer.model().placementIndex, shape.placements.length - 1);
assert.deepEqual(events.highlight.at(-1).keys, shape.placements.at(-1).keys);
assert.match(
  explorer.render(),
  new RegExp(`data-index="${shape.placements.length - 1}" aria-pressed="true"`)
);
explorer.click(node({shapeAction: 'fingering', index: '0'}));
assert.equal(explorer.fingerings().source, 'shape');
assert.equal(
  explorer.fingerings().placements,
  explorer.model().result.shapes.find(s => s.id === shape.id).placements
);
assert.equal(explorer.showFingering(1), true);
assert.equal(explorer.model().placementIndex, 1);
assert.equal(explorer.showFingering(999), false);
explorer.showFingering(0);

// Placement cycling wraps in both directions and relights the board.
explorer.click(node({shapeAction: 'next'}));
assert.equal(explorer.model().placementIndex, 1);
assert.deepEqual(events.highlight.at(-1).keys, shape.placements[1].keys);
explorer.click(node({shapeAction: 'previous'}));
explorer.click(node({shapeAction: 'previous'}));
assert.equal(explorer.model().placementIndex, shape.placements.length - 1);
explorer.click(node({shapeAction: 'next'}));
assert.equal(explorer.model().placementIndex, 0);

// Hear sounds the current placement's coordinates in the current tuning.
explorer.click(node({shapeAction: 'hear'}));
assert.deepEqual(
  events.played.at(-1),
  shape.placements[0].coords.map(m => m[0] * state.p + m[1] * state.g)
);

// A collection item carries a validated exact selection with shape provenance.
explorer.click(node({shapeAction: 'collect'}));
const [collectedState, coords, label, extra] = events.collect.at(-1);
assert.equal(collectedState, state);
assert.deepEqual(coords, shape.placements[0].coords);
assert.equal(label, reading.label);
assert.equal(extra.exact, true);
assert.equal(extra.harmonicSelection.source, 'shape-catalogue');
assert.equal(extra.harmonicSelection.provenance.geometricShapeId, shape.id);
assert.deepEqual(extra.harmonicSelection.voicing.coords, shape.placements[0].coords);
assert.equal(
  extra.harmonicSelection.voicing.rootVoice,
  shape.placements[0].keys.indexOf(reading.rootKey)
);
assert.ok(Object.isFrozen(extra.harmonicSelection));

// Saving stores a revalidated certificate; saving the same reading again updates it in place.
(await explorer.click(node({shapeAction: 'save'}))) && (await settle());
let saved = await store.list('shape');
assert.equal(saved.length, 1);
assert.deepEqual(shapePresetSnapshot(saved[0].name, saved[0].state), saved[0].state);
assert.equal(saved[0].state.shape.id, shape.id);
assert.deepEqual(saved[0].state.placement.keys, shape.placements[0].keys);
assert.equal(explorer.model().saved.length, 1);
assert.match(explorer.render(), / · saved/);
explorer.click(node({shapeAction: 'save'}));
await settle();
saved = await store.list('shape');
assert.equal(saved.length, 1);
assert.equal(saved[0].revision, 2);

// Saved-only filter shows the saved shape alone; clear the filter again.
explorer.change(field('savedOnly', '', {checked: true}));
assert.equal((explorer.render().match(/class="shape-card"/g) ?? []).length, 1);
explorer.change(field('savedOnly', '', {checked: false}));

// Choosing the open card again closes it.
explorer.click(node({shapeAction: 'select', id: shape.id}));
assert.equal(explorer.model().selectedId, '');
assert.equal(events.highlight.at(-1), null);
assert.doesNotMatch(explorer.render(), /class="shape-details"/);
assert.equal(explorer.fingerings(), null);
explorer.click(node({shapeAction: 'select', id: shape.id}));

// Clearing the highlight (Escape) keeps the results.
explorer.clear();
assert.equal(events.highlight.at(-1), null);
assert.equal(explorer.model().status, 'ready');
assert.equal(explorer.model().selectedId, '');
explorer.click(node({shapeAction: 'select', id: shape.id}));

// An accepted retune keeps results and the selected shape, rederiving sound from coordinates.
const before = explorer.model().result.shapes.find(s => s.id === shape.id).placements[0].pitches;
state = {...state, g: state.g + 0.5};
board = restrict(buildBoard(state, config));
html = explorer.render();
model = explorer.model();
assert.equal(model.status, 'ready');
assert.equal(model.selectedId, shape.id);
const after = model.result.shapes.find(s => s.id === shape.id).placements[0];
assert.deepEqual(
  after.pitches,
  after.coords.map(m => coordinateCents(state, m))
);
assert.notDeepEqual(after.pitches, before);

// A structural board change invalidates the result, the selection and the highlight.
board = {
  ...board,
  keys: board.keys.map(k => (k.index === shape.placements[0].keys[0] ? {...k, enabled: false} : k))
};
explorer.render();
model = explorer.model();
assert.equal(model.result, null);
assert.equal(model.selectedId, '');
assert.equal(events.highlight.at(-1), null);
board = restrict(buildBoard(state, config));

// Identify selected keys: the exact readings of one forward placement, beside the catalogue.
await explorer.search();
const placed = explorer.model().result.shapes.find(s => s.id === shape.id).placements[0];
selectedKeys = [...placed.keys].reverse();
await explorer.identify();
model = explorer.model();
assert.equal(model.identityStatus, 'ready');
assert.equal(model.status, 'ready', 'the forward catalogue is kept');
assert.equal(model.identity.selected.id, shape.id);
assert.equal(model.identity.selected.addedDoublings, 0);
{
  // The reverse universe adds the catalogue's other spellings of the same chords; the forward readings
  // are among them, and spellings of one family on one root key group into one reading.
  const ids = new Set(model.identity.matches.map(a => a.id));
  for (const a of placed.associations)
    assert.ok(ids.has(a.id), 'every forward reading of the placement is found in reverse');
  const groups = groupReadings(model.identity.matches);
  assert.equal(
    groups.length,
    new Set(model.identity.matches.map(a => a.familyId + '|' + a.rootKey)).size
  );
  assert.ok(groups.length < model.identity.matches.length, 'source spellings of one family merge');
  const major = groups.find(g => g.readings.some(r => r.input === '4:5:6'));
  assert.equal(major.preferred.input, '4:5:6');
  assert.ok(major.spellings.length > 1);
}
assert.equal(model.identityIndex, 0);
assert.deepEqual(events.highlight.at(-1).keys, model.identity.selected.keys);
html = explorer.render();
assert.match(html, /Selected keys · 3 buttons/);
assert.match(html, /Source spellings on these keys/);
assert.match(html, /Exact shape readings/);
assert.match(html, /Pitch-class reading/);
assert.match(html, /listed in the harmony directory/);
assert.match(html, /This shape is in the results below/);
assert.match(html, / · selected keys/);
assert.deepEqual(events.classified.at(-1), model.identity.selected.coordinates);
explorer.click(node({shapeAction: 'open-harmony'}));
assert.deepEqual(events.opened.at(-1), model.identity.selected.coordinates);

// Geometry filters compare with the selected keys and keep exact IDs.
explorer.change(field('related', 'exact'));
assert.equal((explorer.render().match(/class="shape-card"/g) ?? []).length, 1);
assert.match(explorer.render(), /Compared with the selected keys/);
explorer.change(field('related', 'orientations'));
const oriented = (explorer.render().match(/class="shape-card"/g) ?? []).length;
assert.ok(oriented >= 1 && oriented <= model.result.shapes.length);
explorer.change(field('related', 'reading'));
assert.ok((explorer.render().match(/class="shape-card"/g) ?? []).length >= 1);
explorer.change(field('related', 'all'));

// A selection change makes the identification stale; an unselected search budget change does not.
explorer.change(field('span', '3'));
assert.equal(explorer.model().identityStatus, 'ready');
await explorer.search();
selectedKeys = selectedKeys.slice(0, 2);
explorer.render();
assert.equal(explorer.model().identity, null);
assert.equal(explorer.model().identityStatus, 'idle');

// Added doubling: a second button sounding the same coordinate keeps the geometry and reports the
// distinct notes' readings apart from exact placements.
{
  // Give an unused enabled key the coordinate of the placement's first key: two buttons, one note.
  const root = placed.keys[0],
    twin = board.keys.find(k => !k.command && k.enabled && !placed.keys.includes(k.index));
  const doubledBoard = {
    ...board,
    keys: board.keys.map(k => (k.index === twin.index ? {...k, m: [...board.keys[root].m]} : k))
  };
  {
    const saveBoard = board;
    board = doubledBoard;
    selectedKeys = [...placed.keys, twin.index];
    await explorer.identify();
    model = explorer.model();
    assert.equal(model.identity.selected.addedDoublings, 1);
    assert.equal(model.identity.selected.cells.length, 4);
    assert.deepEqual(model.identity.matches, []);
    assert.ok(model.identity.doublingReadings.length);
    html = explorer.render();
    assert.match(html, /repeats a note already selected/);
    assert.match(html, /Readings of the distinct notes/);
    assert.match(html, /Added doubling/);
    assert.doesNotMatch(
      html,
      /data-shape-action="save-reading"/,
      'a doubling reading is never saved as an exact shape'
    );
    const lit = events.highlight.at(-1);
    assert.ok(lit.toneLabels[twin.index]?.length, 'the doubled button carries its chord tone');
    board = saveBoard;
    selectedKeys = [];
    explorer.render();
  }
}

// Find shapes for a reading replaces the targets with that chord and searches.
selectedKeys = [...placed.keys];
await explorer.identify();
explorer.click(node({shapeAction: 'find-reading', index: '0'}));
for (let i = 0; i < 200 && explorer.model().status !== 'ready'; i++) await settle();
model = explorer.model();
assert.deepEqual(model.inputs, [model.identity.matches[0].input]);
assert.equal(model.status, 'ready');
// Saving an exact reading from the identification.
explorer.click(node({shapeAction: 'save-reading', index: '0'}));
await settle();
assert.equal((await store.list('shape')).length, 1);
explorer.click(node({shapeAction: 'clear-identity'}));
assert.equal(explorer.model().identity, null);
selectedKeys = [];
explorer.click(node({shapeAction: 'add'}));

// Find here re-searches the current board for the saved chord and reselects its shape.
explorer.click(node({shapeAction: 'clear-targets'}));
assert.deepEqual(explorer.model().inputs, []);
explorer.click(node({shapeAction: 'load-saved', id: saved[0].id}));
for (let i = 0; i < 200 && explorer.model().status !== 'ready'; i++) await settle();
model = explorer.model();
assert.deepEqual(model.inputs, [saved[0].state.source.input]);
assert.equal(model.selectedId, shape.id);

// Rejected storage operations are reported and leave the list intact.
const failing = {
  ...store,
  save: async () => {
    throw Error('Browser storage is full.');
  },
  list: store.list
};
const strict = createShapeExplorer({...options, store: failing});
await strict.init();
strict.input({dataset: {shapeDraft: ''}, value: '4:5:6'});
strict.change(field('span', '2'));
await strict.search();
strict.click(node({shapeAction: 'select', id: strict.model().result.shapes[0].id}));
strict.click(node({shapeAction: 'save'}));
await settle();
assert.match(strict.render(), /Browser storage is full/);
assert.equal((await store.list('shape')).length, 1);
strict.destroy();

// Remove deletes the saved record.
explorer.click(node({shapeAction: 'delete-saved', id: saved[0].id}));
await settle();
assert.equal((await store.list('shape')).length, 0);
assert.equal(explorer.model().saved.length, 0);

// Sessions: settings survive; results do not. Old or unknown sessions reset to defaults.
const session = explorer.serialize();
assert.deepEqual(session.inputs, ['4:5:6']);
assert.equal(session.constraints.span, 3);
const reloaded = createShapeExplorer({...options});
reloaded.restore(JSON.parse(JSON.stringify(session)));
assert.deepEqual(reloaded.model().inputs, ['4:5:6']);
assert.equal(reloaded.model().constraints.span, 3);
assert.equal(reloaded.model().result, null);
reloaded.restore(undefined);
assert.deepEqual(reloaded.model().inputs, []);
assert.equal(reloaded.model().constraints.span, 6);
events.notes.length = 0;
reloaded.restore({version: 9, inputs: ['4:5:6']});
assert.deepEqual(reloaded.model().inputs, []);
assert.match(events.notes[0], /ignored/);
reloaded.restore({version: 1, inputs: ['4:5:6', 'not a chord'], constraints: {span: -3}});
assert.equal(reloaded.model().constraints.span, 6);
assert.match(events.notes.at(-1), /ignored/);
reloaded.destroy();

// The chord menu: the Discover chord first, then the directory's chords, without duplicate identities.
// Picking one shows only that chord; typed chords replace the shown ones unless one fails to parse.
{
  const selection = {
    tones: [
      {n: 1, d: 1},
      {n: 5, d: 4},
      {n: 3, d: 2}
    ],
    label: '4:5:6'
  };
  const directory = {
    ready: true,
    complete: true,
    filters: {},
    chords: [
      {label: '4:5:6', size: 3, form: 'Otonal'},
      {label: '1/6:5:4', size: 3, form: 'Utonal'},
      {label: '4:5:6:7', size: 4, form: 'Otonal'}
    ]
  };
  const menu = createShapeExplorer({
    ...options,
    getSelection: () => selection,
    getDirectory: () => directory,
    autoSearch: false
  });
  let html = menu.render();
  const chips = [...html.matchAll(/data-shape-action="pick-chord" data-input="([^"]+)"/g)].map(
    m => m[1]
  );
  assert.deepEqual(
    chips,
    ['1/1:5/4:3/2', '1/6:5:4', '4:5:6:7'],
    'the Discover chord leads and replaces its directory duplicate'
  );
  assert.match(html, /from-discover/);
  menu.click(node({shapeAction: 'pick-chord', input: '1/6:5:4'}));
  for (let i = 0; i < 200 && menu.model().status !== 'ready'; i++) await settle();
  assert.deepEqual(menu.model().inputs, ['1/6:5:4']);
  assert.ok(menu.model().result.shapes.length);
  html = menu.render();
  assert.match(html, /data-input="1\/6:5:4" aria-pressed="true"/);
  assert.doesNotMatch(html, /class="shape-targets"/, 'a menu chord needs no extra chip');
  menu.input({dataset: {shapeDraft: ''}, value: '4:5:6:7; nonsense'});
  await menu.search();
  assert.deepEqual(menu.model().inputs, ['1/6:5:4']);
  assert.ok(menu.model().error);
  menu.input({dataset: {shapeDraft: ''}, value: '2:3:4'});
  await menu.search();
  assert.deepEqual(menu.model().inputs, ['2:3:4']);
  assert.match(
    menu.render(),
    /class="shape-targets"/,
    'a typed chord is shown as a removable chip'
  );
  menu.destroy();
}

// Automatic search: the first chord on first view, a new Discover chord, and the same chord after the
// board changes, reopening the open shape when it still fits. Cancel and Clear stop it.
{
  let selection = null,
    board2 = restrict(buildBoard(state, config));
  const directory = {
    ready: true,
    complete: true,
    filters: {},
    chords: [{label: '4:5:6', size: 3, form: 'Otonal'}]
  };
  const auto = createShapeExplorer({
    ...options,
    getBoard: () => board2,
    getSelection: () => selection,
    getDirectory: () => directory,
    autoSearch: true
  });
  const ready = async () => {
    for (let i = 0; i < 300 && auto.model().status !== 'ready'; i++) await settle();
    return auto.model();
  };
  auto.render();
  let m = await ready();
  assert.deepEqual(m.inputs, ['4:5:6'], 'the first menu chord is searched on first view');
  assert.ok(m.result.shapes.length);
  const open = m.result.shapes[0].id;
  auto.select(open);
  board2 = {
    ...board2,
    keys: board2.keys.map(k =>
      k.index === m.result.shapes.at(-1).placements[0].keys[0] ? {...k, enabled: false} : k
    )
  };
  auto.render();
  assert.equal(auto.model().result, null);
  assert.equal(auto.model().error, '', 'no stale "search again" prompt');
  m = await ready();
  assert.ok(m.result, 'the same chord is searched again');
  if (m.result.shapes.some(s => s.id === open))
    assert.equal(m.selectedId, open, 'the open shape reopens');
  selection = {
    tones: [
      {n: 10, d: 1},
      {n: 12, d: 1},
      {n: 15, d: 1}
    ],
    label: '1/6:5:4'
  };
  auto.accept(selection);
  auto.render();
  m = await ready();
  assert.deepEqual(m.inputs, ['10/1:12/1:15/1'], 'a Discover chord replaces the shown one');
  auto.click(node({shapeAction: 'clear-targets'}));
  auto.render();
  await settle();
  assert.deepEqual(auto.model().inputs, []);
  assert.equal(auto.model().status, 'idle', 'clearing does not pick a chord again');
  auto.click(node({shapeAction: 'pick-chord', input: '4:5:6'}));
  auto.click(node({shapeAction: 'cancel'}));
  auto.render();
  await settle();
  assert.equal(auto.model().status, 'idle');
  assert.equal(auto.model().result, null, 'cancel stops the automatic search');
  auto.destroy();
}

// Overlay labels keep every source tone that shares one key.
const doubled = shapePlacementOverlay(
  {keys: [65, 66]},
  {label: 'x', memberKeys: [65, 66, 65], members: [{toneIndex: 0}, {toneIndex: 1}, {toneIndex: 0}]}
);
assert.deepEqual(doubled.toneLabels, {65: [0, 0], 66: [1]});

assert.match(
  matchKindLabel({matchKind: 'reference-voicing', reference: {ratio: '2/1'}}),
  /moved by 2\/1/
);
assert.match(matchKindLabel({matchKind: 'added-doubling'}), /distinct notes/);
explorer.destroy();

// Integrated as the first mode of Play's Chords panel: Identify shape reads the selected keys, lights them with
// chord-tone labels beside their own labels, and Escape clears only the highlight.
{
  const s = makeState('meantone'),
    played = [];
  const ws = createHexboardWorkspace({
    getStates: () => [s],
    play() {},
    refresh() {},
    notify: m => {
      throw Error(m);
    },
    getHz: () => 220,
    presetStore: createPresetStore({storage: memory()}),
    matchPlayed: coordinates => {
      played.push(coordinates);
      return {
        status: 'chord',
        source: 'directory',
        kind: 'ji',
        label: '4:5:6',
        formLabel: 'Otonal'
      };
    }
  });
  const hex = dataset => ({
    dataset,
    closest(sel) {
      return sel === '.hex-board' ? null : this;
    }
  });
  const cfg = ws.serialize().configs[0],
    board = buildBoard(s, cfg);
  const keys = chordPlacements(
    board,
    [
      [0, 0],
      [-2, 4],
      [0, 1]
    ],
    cfg.center,
    {}
  )[0].keys;
  ws.restore({configs: [{...cfg, selectChord: true, chord: keys}]});
  assert.match(ws.render(), /data-hex-action="shape-selection"/);
  ws.click(hex({hexAction: 'shape-selection'}));
  for (let i = 0; i < 400 && ws.shapeExplorer.model().identityStatus !== 'ready'; i++)
    await settle();
  const m = ws.shapeExplorer.model();
  assert.equal(m.identityStatus, 'ready');
  assert.ok(
    m.identity.matches.some(a => a.input === '4:5:6'),
    'the selected major triad is identified'
  );
  const html = ws.render();
  assert.match(html, /aria-selected="true">Shapes/);
  assert.match(html, /class="shape-identity"/);
  assert.ok(played.length, 'the directory classifier is consulted');
  const lit = keys.map(
    k => html.match(new RegExp(`aria-label="Button ${k}, [^"]*chord tone ([0-9])`))?.[1]
  );
  assert.ok(lit.every(Boolean), 'each selected key shows a chord-tone label');
  assert.deepEqual(new Set(lit), new Set(['1', '2', '3']));
  ws.clearHighlight();
  assert.ok(ws.shapeExplorer.model().identity, 'Escape keeps the identification');
  assert.doesNotMatch(ws.render(), /chord tone [0-9]/);
  const session = ws.serialize();
  assert.equal(session.chordMode, 'shapes');
  assert.equal(session.shapes.version, 1);
  ws.click(hex({hexAction: 'chord-mode', mode: 'places'}));
  assert.match(ws.render(), /data-hex-search-text/);
  ws.restore(JSON.parse(JSON.stringify(session)));
  assert.match(ws.render(), /class="shape-explorer"/);
  assert.equal(ws.shapeExplorer.model().identity, null);
  // Pressing keys in chord-selection mode redraws the selection count and its actions (Find places,
  // Identify shape, and the Shapes view's Identify button) without a full render.
  {
    ws.restore({configs: [{...cfg, selectChord: true, chord: []}], chordMode: 'shapes'});
    ws.render();
    const written = {},
      previous = globalThis.document;
    globalThis.document = {
      querySelector: selector =>
        selector === '.play-selection' || selector === '[data-shape-action="identify"]'
          ? {
              set outerHTML(value) {
                written[selector] = value;
              }
            }
          : null
    };
    try {
      for (const key of keys)
        ws.press({dataset: {hexKey: String(key)}, closest: () => ({querySelectorAll: () => []})});
      await new Promise(resolve => setTimeout(resolve, 20));
    } finally {
      if (previous === undefined) delete globalThis.document;
      else globalThis.document = previous;
    }
    assert.match(written['.play-selection'], /Play selection \(3\/8\)/);
    assert.match(
      written['.play-selection'],
      /<button data-hex-action="shape-selection" >Identify shape/
    );
    assert.match(
      written['.play-selection'],
      /<button data-hex-action="chords-selection" >Find places/
    );
    assert.match(
      written['[data-shape-action="identify"]'],
      /Identify selected keys \(3\)<\/button>/
    );
    assert.doesNotMatch(written['[data-shape-action="identify"]'], /disabled/);
  }
  // Fingering practice drills the chosen shape's fingerings; Show more extends the picker.
  {
    ws.restore({configs: [{...cfg, chord: []}], chordMode: 'shapes'});
    ws.shapeExplorer.input({dataset: {shapeDraft: ''}, value: '4:5:6'});
    await ws.shapeExplorer.search();
    const many = ws.shapeExplorer.model().result.shapes.find(shape => shape.placements.length > 24);
    assert.ok(many, 'a shape with more than 24 fingerings on the full board');
    ws.shapeExplorer.click({dataset: {shapeAction: 'select', id: many.id}});
    let html = ws.render();
    assert.equal((html.match(/data-shape-action="fingering"/g) ?? []).length, 12);
    assert.match(html, /Show 12 more/);
    ws.shapeExplorer.click({dataset: {shapeAction: 'more-fingerings'}});
    html = ws.render();
    assert.equal((html.match(/data-shape-action="fingering"/g) ?? []).length, 24);
    const f = ws.fingerings();
    assert.equal(f.source, 'shape');
    assert.equal(f.placements.length, many.placements.length);
    assert.match(f.label, /3-key shape/);
    assert.equal(ws.showFingering(30), true);
    assert.equal(ws.shapeExplorer.model().placementIndex, 30);
    html = ws.render();
    assert.match(
      html,
      /data-index="30" aria-pressed="true"/,
      'stepping past the shown fingerings reveals them'
    );
    const lit = keys =>
      keys.every(k => new RegExp(`aria-label="Button ${k}, [^"]*chord tone`).test(html));
    assert.ok(lit(many.placements[30].keys), 'the practised fingering lights on the board');
    ws.click(hex({hexAction: 'chord-mode', mode: 'places'}));
    assert.notEqual(
      ws.fingerings()?.source,
      'shape',
      'leaving Shapes returns practice to the selected voicing'
    );
    assert.equal(ws.shapeExplorer.model().selectedId, '', 'leaving Shapes closes its lit shape');
  }
  ws.shapeExplorer.destroy();
}

// Find places and Selected voicing show their fingerings as pictures to pick from, like the Shapes view.
{
  const s = makeState('meantone'),
    ws = createHexboardWorkspace({
      getStates: () => [s],
      play() {},
      refresh() {},
      notify: m => {
        throw Error(m);
      },
      getHz: () => 220,
      presetStore: createPresetStore({storage: memory()})
    });
  const hex = dataset => ({
    dataset,
    closest(sel) {
      return sel === '.hex-board' ? null : this;
    }
  });
  const cfg = ws.serialize().configs[0];
  ws.restore({configs: [{...cfg, selectChord: true, chord: [65, 67, 78]}]});
  ws.click(hex({hexAction: 'chords-selection'}));
  const f = ws.fingerings();
  assert.ok(f?.placements.length, 'Find places gives fingerings');
  assert.equal(f.source, 'finder');
  let html = ws.render();
  assert.equal(
    (html.match(/data-hex-action="chords-pick"/g) ?? []).length,
    Math.min(24, f.placements.length)
  );
  assert.match(html, /data-hex-action="chords-pick" data-index="0" aria-pressed="true"/);
  ws.click(hex({hexAction: 'chords-pick', index: '1'}));
  assert.equal(ws.fingerings().index, 1);
  // A harmony sent to Play: each exact fingering shows its numbered pattern and its place on the board.
  const board = buildBoard(s, cfg),
    keys = [65, 67, 78];
  const selection = shapeMaterialSelection(
    s,
    {id: 'shape'},
    {keys, coords: keys.map(k => board.keys[k].m)},
    {
      rootKey: 65,
      familyId: 'family',
      chordId: 'chord',
      label: '4:5:6',
      input: '4:5:6',
      memberCells: [0, 1, 2],
      lifts: [0, 0, 0]
    }
  );
  ws.click(hex({hexAction: 'chords-clear'}));
  ws.acceptHarmonicSelection(selection);
  html = ws.render();
  const buttons =
    html.match(
      /<button class="fingering-choice" data-harmony-play="fingering"[\s\S]*?<\/button>/g
    ) ?? [];
  assert.ok(buttons.length, 'the selected voicing has fingerings');
  for (const b of buttons) {
    assert.match(b, /class="fingering-pattern"/);
    assert.match(b, /class="fingering-map"/);
    assert.match(b, /Buttons \d/);
  }
  assert.match(buttons[0], /<g class="is-root">/, 'the root voice is marked');
  ws.shapeExplorer.destroy();
}
console.log(
  'Shape explorer: targets, cards, placements, readings, collection, saving, sessions and retuning passed.'
);
