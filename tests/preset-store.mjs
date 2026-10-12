import assert from 'node:assert/strict';
import {makeState} from '../src/core/catalog.mjs';
import {presetSnapshot} from '../src/presets/preset-data.mjs';
import {mappingKey} from '../src/hexboard/layout-preset-data.mjs';
import {BUILTIN_LAYOUTS} from '../src/hexboard/builtin-layouts.mjs';
import {
  createPresetStore,
  PRESET_STORAGE_KEY,
  PRESET_BACKUP_FORMAT
} from '../src/presets/preset-store.mjs';
const memory = () => {
  const values = new Map();
  return {
    values,
    getItem: k => (values.has(k) ? values.get(k) : null),
    setItem: (k, v) => values.set(k, String(v))
  };
};
const temperament = (name, key = 'meantone') => presetSnapshot(name, makeState(key));
const layout = (name, key = 'meantone') => ({
  ...structuredClone(BUILTIN_LAYOUTS.find(p => p.id === 'builtin:' + key).state),
  name
});
const id = () => crypto.randomUUID();

// Layouts, temperaments and defaults round-trip through an exported backup.
const source = createPresetStore({storage: memory()}),
  tId = id(),
  lId = id(),
  hansonId = id();
await source.save('temperament', tId, {
  name: 'My meantone',
  state: temperament('My meantone'),
  revision: 0
});
await source.save('layout', lId, {name: 'My board', state: layout('My board'), revision: 0});
await source.save('layout', hansonId, {
  name: 'Hanson board',
  state: layout('Hanson board', 'hanson'),
  revision: 0
});
const meantoneKey = mappingKey(makeState('meantone')),
  hansonKey = mappingKey(makeState('hanson'));
assert.deepEqual(await source.setLayoutDefault(meantoneKey, lId, 0), {
  defaults: {[meantoneKey]: lId},
  revision: 1
});
await assert.rejects(source.setLayoutDefault(hansonKey, lId, 1), /does not belong/);
await assert.rejects(source.setLayoutDefault(hansonKey, hansonId, 0), /changed in another session/);
const backup = JSON.parse(JSON.stringify(await source.exportBackup()));
assert.equal(backup.format, PRESET_BACKUP_FORMAT);
assert.equal(backup.temperaments.length, 1);
assert.deepEqual(
  backup.layouts.map(p => p.name),
  ['Hanson board', 'My board']
);
assert.deepEqual(backup.layoutDefaults, {[meantoneKey]: lId});
const target = createPresetStore({storage: memory()});
assert.deepEqual(await target.importBackup(backup), {
  temperaments: 1,
  layouts: 2,
  defaults: 1,
  skipped: 0
});
assert.equal((await target.list('temperament'))[0].state.g, makeState('meantone').g);
assert.equal((await target.layoutDefaults()).defaults[meantoneKey], lId);
// Importing again replaces records by id and advances their revisions for stale views.
await target.importBackup(backup);
assert.equal((await target.list('layout')).length, 2);
assert.equal((await target.list('layout')).find(p => p.id === lId).revision, 2);
console.log('Preset backups round-trip temperaments, layouts and default layouts.');

// Invalid records are skipped; files that are not preset backups are refused.
const partial = createPresetStore({storage: memory()});
assert.deepEqual(
  await partial.importBackup({
    format: PRESET_BACKUP_FORMAT,
    temperaments: [
      {id: id(), name: 'Broken', state: {...temperament('Broken'), g: -1}},
      {id: 'nope', name: 'No id', state: temperament('No id')}
    ],
    layouts: [],
    layoutDefaults: {[meantoneKey]: lId}
  }),
  {temperaments: 0, layouts: 0, defaults: 0, skipped: 3}
);
await assert.rejects(
  partial.importBackup({format: 'temperament-lab-v1', states: []}),
  /presets file/
);
await assert.rejects(partial.importBackup(null), /presets file/);
// Responses saved from the former site preset API also import.
const legacy = createPresetStore({storage: memory()});
assert.deepEqual(
  await legacy.importBackup({presets: [...backup.temperaments, ...backup.layouts]}),
  {temperaments: 1, layouts: 2, defaults: 0, skipped: 0}
);
assert.deepEqual(await legacy.importBackup({defaults: {[meantoneKey]: lId}, revision: 4}), {
  temperaments: 0,
  layouts: 0,
  defaults: 1,
  skipped: 0
});
console.log(
  'Preset import skips invalid records, refuses other files and reads former site API responses.'
);

// Deleting a default layout clears its default and advances the defaults revision.
await target.remove('layout', lId, 2);
assert.deepEqual(await target.layoutDefaults(), {defaults: {}, revision: 3});
// Storage failures never overwrite saved data.
const corrupt = memory();
corrupt.setItem(PRESET_STORAGE_KEY, '{not json');
const damaged = createPresetStore({storage: corrupt});
await assert.rejects(damaged.list('layout'), /could not be read/);
await assert.rejects(
  damaged.save('temperament', id(), {name: 'x', state: temperament('x'), revision: 0}),
  /could not be read/
);
assert.equal(corrupt.getItem(PRESET_STORAGE_KEY), '{not json');
const full = memory(),
  fullStore = createPresetStore({
    storage: {
      getItem: full.getItem,
      setItem() {
        throw Object.assign(Error('quota'), {name: 'QuotaExceededError'});
      }
    }
  });
await assert.rejects(
  fullStore.save('temperament', id(), {name: 'x', state: temperament('x'), revision: 0}),
  /storage is full/
);
console.log('Preset storage reports unreadable and full browser storage without overwriting data.');
