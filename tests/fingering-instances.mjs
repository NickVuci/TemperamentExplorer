import assert from 'node:assert/strict';
import {BUILTIN_LAYOUTS} from '../src/hexboard/builtin-layouts.mjs';
import {buildBoard} from '../src/hexboard/hexboard.mjs';
import {chordPlacements, fingeringInstances} from '../src/hexboard/hexboard-chords.mjs';
import {geometricShapeForKeys} from '../src/shapes/geometric-shapes.mjs';
import {chordIdentity} from '../src/chords/chord-identity.mjs';
import {projectChord} from '../src/chords/chord-projection.mjs';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';
import {createFingeringGame} from '../src/composition/fingering-game.mjs';
import {ledFrame} from '../src/hexboard/hexboard-sync.mjs';

const layout = structuredClone(BUILTIN_LAYOUTS.find(p => p.id === 'builtin:meantone').state),
  state = layout.context,
  coordinates = projectChord(state, chordIdentity('4:5:6')).notes.map(note => note.coordinate),
  keySet = placements => new Set(placements.map(p => [...p.keys].sort((a, b) => a - b).join(',')));

// Independent oracle: the existing coordinate solver, filtered by canonical physical geometry.
for (const config of [
  {...layout.config, periodWrapping: false},
  {...layout.config, periodWrapping: true},
  {...layout.config, rotation: 2},
  {...layout.config, flipHorizontal: true},
  {...layout.config, style: 'compressed'}
]) {
  const board = buildBoard(state, config),
    candidates = chordPlacements(board, coordinates),
    seed = candidates[0];
  assert.ok(seed, 'the chord fits this layout');
  assert.equal(!!candidates.limited, false, 'the test oracle is complete');
  const pattern = geometricShapeForKeys(board, seed.keys).id,
    expected = candidates.filter(p => geometricShapeForKeys(board, p.keys).id === pattern),
    actual = fingeringInstances(board, seed.keys);
  assert.deepEqual(
    keySet(actual),
    keySet(expected),
    'every matching bass position, no other shape'
  );
  assert.equal(keySet(actual).size, actual.length, 'each physical instance is visited once');
  assert.ok(actual.length > 0, 'the chosen fingering is included even when few translations fit');
  actual.forEach((placement, i) => {
    if (i) assert.ok(placement.bassCents >= actual[i - 1].bassCents, 'ascending bass order');
    assert.equal(geometricShapeForKeys(board, placement.keys).id, pattern);
    const delta = placement.coords.map(m => m.map((v, axis) => v - placement.coords[0][axis])),
      source = seed.keys.map(k => board.keys[k].m),
      expectedDelta = source.map(m => m.map((v, axis) => v - source[0][axis]));
    assert.deepEqual(delta, expectedDelta, 'same exact intervals and inversion at every position');
  });
}

// Both coordinate axes matter, including non-octave/divided-period mappings and wrapped seams.
{
  const shape = [
      [0, 0],
      [2, 0],
      [1, 1]
    ],
    chord = [
      [0, 0],
      [-2, 4],
      [0, 1]
    ],
    keys = [];
  for (let group = 0; group < 5; group++) {
    shape.forEach(([x, y], member) => {
      const m = chord[member].map((value, axis) => value + group * [2, 3][axis]);
      if (group === 2 && member === 2) m[1]++;
      keys.push({
        index: keys.length,
        x: x + group * 4,
        y: y + group * 2,
        m,
        c: m[0] * 1901 + m[1] * 411,
        enabled: !(group === 3 && member === 2),
        command: group === 4 && member === 2
      });
    });
  }
  const board = {keys},
    actual = fingeringInstances(board, [0, 1, 2]);
  assert.deepEqual(
    actual.map(p => p.keys),
    [
      [0, 1, 2],
      [3, 4, 5]
    ],
    'exclude changed intervals, disabled keys and command keys'
  );
}

// A root-restricted gallery still practises the selected pattern across the entire board.
const ws = createHexboardWorkspace({
  getStates: () => [state],
  play() {},
  refresh() {},
  getHz: () => 220,
  notify: message => {
    throw Error(message);
  }
});
ws.restore({configs: [{...ws.serialize().configs[0], ...layout.config}], chordMode: 'shapes'});
ws.shapeExplorer.input({dataset: {shapeDraft: ''}, value: '4:5:6; 10:12:15'});
ws.shapeExplorer.change({dataset: {shapeField: 'rootKey'}, value: '65'});
await ws.shapeExplorer.search();
const shape = ws.shapeExplorer.model().result.shapes[0];
assert.ok(shape);
ws.shapeExplorer.click({dataset: {shapeAction: 'select', id: shape.id}});
const browsing = ws.fingerings(),
  practice = ws.practiceFingerings();
assert.ok(
  practice.placements.length > browsing.placements.length,
  'practice includes bass positions excluded by the gallery root filter'
);
assert.ok(practice.placements.length > 5);
ws.change({dataset: {hexField: 'selectChord'}, type: 'checkbox', checked: true});
const original = practice.index,
  originalKeys = [...practice.placements[original].keys],
  lit = () =>
    ws
      .deviceSnapshot()
      .keys.filter(k => k.lit)
      .map(k => k.index)
      .sort((a, b) => a - b),
  game = createFingeringGame({
    getFingerings: () => ws.practiceFingerings(),
    showFingering: index => ws.showPracticeFingering(index),
    onChange: current => {
      if (current.phase !== 'playing') ws.endPractice();
    }
  });
assert.equal(game.start(), true);
assert.equal(game.state().total, practice.placements.length);
const visited = new Set();
for (const placement of practice.placements) {
  game.check();
  ws.press({dataset: {hexKey: String(placement.keys[0])}, closest: () => null});
  assert.deepEqual(
    ws.serialize().configs[0].chord,
    [],
    'practice presses do not edit the source chord'
  );
  assert.deepEqual(
    lit(),
    [...placement.keys].sort((a, b) => a - b)
  );
  const leds = ledFrame(ws.deviceSnapshot());
  assert.ok(
    placement.keys.every(k => leds.get(k).v > 0),
    'the physical LEDs follow each target'
  );
  visited.add(lit().join(','));
  game.onHeld(new Set(placement.keys));
  game.onHeld(new Set());
}
assert.equal(game.state().phase, 'done');
assert.equal(visited.size, practice.placements.length, 'every instance is played once');
assert.deepEqual(
  lit(),
  [...originalKeys].sort((a, b) => a - b),
  'original highlight restored'
);
assert.equal(
  ws.fingerings().index,
  browsing.index,
  'practice does not change the gallery selection'
);
assert.equal(ws.showPracticeFingering(practice.placements.length), false);
ws.press({dataset: {hexKey: String(originalKeys[0])}, closest: () => null});
assert.deepEqual(
  ws.serialize().configs[0].chord,
  [originalKeys[0]],
  'chord selection resumes after practice'
);
ws.click({
  dataset: {hexAction: 'clear'},
  closest() {
    return this;
  }
});

// Changing layout or clearing the source discards the practice highlight and stops the game.
game.start();
ws.change({dataset: {hexField: 'center'}, value: '66'});
game.check();
assert.equal(game.active, false, 'a changed layout invalidates the practice source');
assert.equal(ws.practiceFingerings(), null);
await ws.shapeExplorer.search();
ws.shapeExplorer.click({
  dataset: {
    shapeAction: 'select',
    id: ws.shapeExplorer.model().result.shapes[0].id
  }
});
assert.equal(game.start(), true);
ws.clearHighlight();
game.check();
assert.equal(game.active, false);
assert.equal(ws.practiceFingerings(), null);
assert.deepEqual(lit(), []);
ws.shapeExplorer.destroy();

// A different voicing certificate stops a drill even if a coincident layout has the same keys.
{
  let chord = {id: 'first-voicing', label: 'Chord', index: 0, placements: [{keys: [1, 2, 3]}]};
  const drill = createFingeringGame({getFingerings: () => chord, showFingering() {}});
  drill.start();
  chord = {...chord, id: 'different-voicing'};
  drill.check();
  assert.equal(drill.active, false);
}
console.log(
  'Fingering instances: exhaustive geometry/interval matching, all roots, LEDs, game completion and restoration passed.'
);
