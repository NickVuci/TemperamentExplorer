import assert from 'node:assert/strict';
import {chordIdentity} from '../src/chords/chord-identity.mjs';
import {projectChord} from '../src/chords/chord-projection.mjs';
import {harmonicIdentity} from '../src/harmonic/harmonic-equivalence.mjs';
import {voicingReference} from '../src/chords/chord-voicings.mjs';
import {chordPlacements} from '../src/hexboard/hexboard-chords.mjs';
import {buildBoard} from '../src/hexboard/hexboard.mjs';
import {geometricShapeForKeys} from '../src/shapes/geometric-shapes.mjs';
import {BUILTIN_LAYOUTS} from '../src/hexboard/builtin-layouts.mjs';
import {
  shapePresetSnapshot,
  shapePresetFromPlacement,
  MAX_SAVED_SHAPES
} from '../src/shapes/shape-preset-data.mjs';
import {
  createPresetStore,
  PRESET_STORAGE_KEY,
  PRESET_BACKUP_FORMAT
} from '../src/presets/preset-store.mjs';

const memory = () => {
  const values = new Map();
  return {
    values,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
};
const layout = structuredClone(BUILTIN_LAYOUTS.find(p => p.id === 'builtin:meantone').state),
  state = layout.context,
  config = layout.config;
function fixture(input = '4:5:6') {
  const identity = chordIdentity(input),
    projection = projectChord(state, identity),
    sourceCoordinates = identity.orderedRatios.map(
      ratio =>
        projection.notes[identity.canonicalRatios.findIndex(q => q.label === ratio)].coordinate
    );
  const distinct = [...new Map(sourceCoordinates.map(point => [point.join(','), point])).values()],
    board = buildBoard(state, config),
    found = chordPlacements(board, distinct)[0];
  assert.ok(found, 'fixture has a physical placement');
  const keysByCoordinate = new Map(
    distinct.map((point, index) => [point.join(','), found.keys[index]])
  );
  const memberKeys = sourceCoordinates.map(point => keysByCoordinate.get(point.join(','))),
    shape = geometricShapeForKeys(board, found.keys),
    memberCells = memberKeys.map(key => shape.keys.indexOf(key));
  const ref = voicingReference(state),
    association = {
      input,
      chordId: identity.fingerprint,
      familyId: harmonicIdentity(identity, 'octave').familyId,
      rootMember: 0,
      sourceCoordinates,
      coordinates: memberKeys.map(key => board.keys.find(item => item.index === key).m),
      memberCells,
      lifts: memberCells.map(() => 0),
      reference: {kind: ref.kind, ratio: ref.ratio, vector: ref.m},
      pitches: [-123]
    };
  const placement = {
      keys: shape.keys,
      shapeId: shape.id,
      pitches: [-999],
      associations: [association]
    },
    target = {input};
  return {state, config, shape, placement, association, target};
}
const snapshot = shapePresetFromPlacement('Major shape', fixture());
assert.deepEqual(shapePresetSnapshot('Major shape', snapshot), snapshot);
assert.equal(snapshot.version, 1);
assert.equal(
  JSON.stringify(snapshot).includes('pitches'),
  false,
  'saved cents never become an authority'
);
const doubled = shapePresetFromPlacement('Repeated source', fixture('6:4:5:4'));
assert.equal(doubled.association.coordinates.length, 4);
assert.equal(doubled.shape.cells.length, 3);
assert.equal(doubled.association.memberCells[1], doubled.association.memberCells[3]);
for (const mutate of [
  value => {
    value.version = 2;
  },
  value => {
    value.source.chordId = 'forged';
  },
  value => {
    value.association.coordinates[1][0]++;
  },
  value => {
    value.association.lifts[0] = 1;
  },
  value => {
    value.association.reference.vector = [999, 0];
  },
  value => {
    value.shape.cells[0][0]++;
  },
  value => {
    value.placement.keys[0] = 20;
  },
  value => {
    value.association.memberCells[1] = value.association.memberCells[0];
  }
]) {
  const bad = structuredClone(snapshot);
  mutate(bad);
  assert.throws(() => shapePresetSnapshot('Invalid', bad));
}

const storage = memory(),
  store = createPresetStore({storage}),
  id = crypto.randomUUID();
let record = await store.save('shape', id, {name: snapshot.name, state: snapshot, revision: 0});
assert.equal(record.revision, 1);
assert.deepEqual((await store.list('shape'))[0].state, snapshot);
assert.equal((await store.list('layout')).length, 0);
await assert.rejects(
  store.save('shape', id, {name: 'Stale', state: snapshot, revision: 0}),
  /changed in another session/
);
record = await store.save('shape', id, {name: 'Renamed shape', state: snapshot, revision: 1});
assert.equal(record.revision, 2);
const backup = JSON.parse(JSON.stringify(await store.exportBackup()));
assert.equal(backup.shapes.length, 1);
const restored = createPresetStore({storage: memory()});
assert.deepEqual(await restored.importBackup(backup), {
  temperaments: 0,
  layouts: 0,
  shapes: 1,
  defaults: 0,
  skipped: 0
});
assert.equal((await restored.list('shape'))[0].name, 'Renamed shape');
await restored.importBackup(backup);
assert.equal((await restored.list('shape'))[0].revision, 2);
await assert.rejects(restored.remove('shape', id, 1), /changed or was removed/);
assert.deepEqual(
  await restored.importBackup({
    format: PRESET_BACKUP_FORMAT,
    temperaments: [],
    layouts: [],
    layoutDefaults: {}
  }),
  {temperaments: 0, layouts: 0, defaults: 0, skipped: 0}
);
assert.equal((await restored.list('shape')).length, 1, 'old backups do not remove saved shapes');
const bad = structuredClone(backup);
bad.shapes[0].state.association.lifts[0] = 1;
assert.deepEqual(await restored.importBackup(bad), {
  temperaments: 0,
  layouts: 0,
  shapes: 0,
  defaults: 0,
  skipped: 1
});
await assert.rejects(restored.importBackup({...backup, shapes: {}}), /backup section/);
await restored.remove('shape', id, 2);
assert.equal((await restored.list('shape')).length, 0);

const oldStorage = memory();
oldStorage.setItem(
  PRESET_STORAGE_KEY,
  JSON.stringify({temperaments: [], layouts: [], layoutDefaults: {defaults: {}, revision: 0}})
);
assert.deepEqual(await createPresetStore({storage: oldStorage}).list('shape'), []);
const fullStorage = memory(),
  fullData = {
    temperaments: [],
    layouts: [],
    layoutDefaults: {defaults: {}, revision: 0},
    shapes: Array.from({length: MAX_SAVED_SHAPES}, () => ({...record, id: crypto.randomUUID()}))
  };
fullStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(fullData));
const fullStore = createPresetStore({storage: fullStorage});
await assert.rejects(
  fullStore.save('shape', crypto.randomUUID(), {name: 'Too many', state: snapshot, revision: 0}),
  /at most 512/
);
await fullStore.save('shape', fullData.shapes[0].id, {
  name: 'Existing shape',
  state: snapshot,
  revision: 2
});
const corrupt = memory();
corrupt.setItem(
  PRESET_STORAGE_KEY,
  JSON.stringify({
    temperaments: [],
    layouts: [],
    shapes: {},
    layoutDefaults: {defaults: {}, revision: 0}
  })
);
const before = corrupt.getItem(PRESET_STORAGE_KEY),
  damaged = createPresetStore({storage: corrupt});
await assert.rejects(damaged.list('shape'), /could not be read/);
await assert.rejects(
  damaged.save('shape', crypto.randomUUID(), {name: 'x', state: snapshot, revision: 0}),
  /could not be read/
);
assert.equal(corrupt.getItem(PRESET_STORAGE_KEY), before);
const quota = createPresetStore({
  storage: {
    getItem: storage.getItem,
    setItem() {
      throw Object.assign(Error('quota'), {name: 'QuotaExceededError'});
    }
  }
});
await assert.rejects(
  quota.save('shape', crypto.randomUUID(), {name: 'x', state: snapshot, revision: 0}),
  /storage is full/
);
console.log(
  'Saved shape certificates, tuning-derived playback, backups, compatibility, revisions, quotas and bounds passed.'
);
