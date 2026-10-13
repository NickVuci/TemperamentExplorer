import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  SESSION_V1,
  SESSION_V2,
  isSessionFormat,
  sessionFormat,
  compositionForSave,
  compositionFromSession
} from '../src/composition/composition-session.mjs';
import {makeState} from '../src/core/catalog.mjs';
import {captureContext} from '../src/composition/composition-context.mjs';
import {createProject, addEvent, makeEvent} from '../src/composition/composition-project.mjs';
import {bootApp} from './support/dom.mjs';

const corpus = JSON.parse(
  await readFile(new URL('./fixtures/composition/phase0-corpus.json', import.meta.url), 'utf8')
);
const ctx = captureContext(corpus.fixtures[0].state, 220);
let project = createProject({name: 'session piece', context: ctx, tempo: 90});
project = addEvent(
  project,
  project.clips[1].id,
  makeEvent({startTick: 0, durationTick: 960, tones: [{coordinate: [0, 0]}]})
);

// Format rules
assert.equal(SESSION_V1, 'temperament-lab-v1');
assert.equal(SESSION_V2, 'temperament-lab-v2');
assert.equal(sessionFormat(null), SESSION_V1, 'no composition keeps the v1 envelope');
assert.equal(
  sessionFormat(project),
  SESSION_V2,
  'a composition requires v2 so older apps refuse it'
);
assert.deepEqual(compositionForSave(null), {});
assert.deepEqual(compositionForSave(project), {composition: project});
for (const f of [SESSION_V1, SESSION_V2]) assert.equal(isSessionFormat(f), true);
for (const f of ['temperament-lab-v3', 'temperament-lab-composition-v1', undefined, null, ''])
  assert.equal(isSessionFormat(f), false);

// Loading: v1 never carries a composition; v2 without one is fine; a present one is validated.
assert.equal(compositionFromSession({format: SESSION_V1}), null);
assert.equal(
  compositionFromSession({format: SESSION_V1, composition: project}),
  null,
  'a v1 file cannot smuggle a composition in'
);
assert.equal(compositionFromSession({format: SESSION_V2}), null);
assert.equal(compositionFromSession({format: SESSION_V2, composition: null}), null);
const back = compositionFromSession(
  JSON.parse(JSON.stringify({format: SESSION_V2, composition: project}))
);
assert.deepEqual(back, project, 'save then load round-trips the project');
assert.notEqual(back, project, 'the loaded project is a fresh copy');
assert.throws(
  () => compositionFromSession({format: SESSION_V2, composition: {...project, tempo: 5}}),
  /tempo/
);
assert.throws(
  () =>
    compositionFromSession({
      format: SESSION_V2,
      composition: {...project, format: 'temperament-lab-composition-v2'}
    }),
  /newer app/
);

// A whole save written the way app.mjs writes it parses back the same.
const save = JSON.parse(
  JSON.stringify({
    format: sessionFormat(project),
    workflowVersion: 8,
    states: [corpus.fixtures[0].state],
    ...compositionForSave(project)
  })
);
assert.equal(save.format, SESSION_V2);
assert.deepEqual(compositionFromSession(save), project);
const legacy = JSON.parse(
  JSON.stringify({
    format: sessionFormat(null),
    workflowVersion: 8,
    states: [corpus.fixtures[0].state],
    ...compositionForSave(null)
  })
);
assert.equal(legacy.format, SESSION_V1);
assert.equal('composition' in legacy, false);
assert.equal(compositionFromSession(legacy), null);

// In the app, the composition and the temperament are validated before any other part of the
// session is restored, so a bad file changes nothing (atomic load).
const page = await bootApp(),
  {$} = page,
  current = () => $('[data-saved-preset="0"]').value,
  composeText = () => {
    page.section('create');
    return $('#create-view').textContent;
  },
  harmonics = () => {
    page.section('discover');
    return $('[data-diamond-harmonics]').value;
  };
const diamond = {harmonics: '4:5:7', fold: false, interaction: 'select', selected: []},
  defaultHarmonics = harmonics();
assert.notEqual(defaultHarmonics, diamond.harmonics);
await page.openSession({
  format: SESSION_V1,
  workflowVersion: 8,
  states: [{...makeState('porcupine'), rows: [[1, 2]]}],
  diamond
});
assert.notEqual(page.toast(), 'Session opened', 'the invalid temperament is reported');
assert.equal(current(), 'builtin:meantone');
assert.equal(harmonics(), defaultHarmonics, 'the diamond is not restored');
await page.openSession({
  format: SESSION_V2,
  workflowVersion: 8,
  states: [makeState('porcupine')],
  settings: {limit: 9, view: 'composition'},
  composition: {...project, tempo: 5}
});
assert.match(page.toast(), /tempo/, 'the invalid composition is reported');
assert.equal(current(), 'builtin:meantone', 'the temperament is not restored');
assert.equal($('#limit').value, '15', 'settings are not restored');
assert.doesNotMatch(composeText(), /session piece/, 'no composition opens');

// A valid session restores the setup, then the project that depends on it.
await page.openSession({
  format: SESSION_V2,
  workflowVersion: 8,
  states: [corpus.fixtures[0].state],
  settings: {limit: 9},
  composition: project
});
assert.equal(page.toast(), 'Session opened');
assert.equal($('#limit').value, '9');
assert.match(composeText(), /session piece/, 'the composition opens');

// Saves use the envelope rules.
page.click('#save');
let saved = JSON.parse(await page.downloaded(/session\.json$/));
assert.equal(saved.format, SESSION_V2);
assert.deepEqual(compositionFromSession(saved), project);

// Reset closes the open composition.
page.click('#reset');
await page.settle();
assert.doesNotMatch(composeText(), /session piece/, 'Reset closes the open composition');
page.click('#save');
saved = JSON.parse(await page.downloaded(/session\.json$/));
assert.equal(saved.format, SESSION_V1);
assert.equal('composition' in saved, false);
assert.deepEqual(page.errors, []);

console.log('composition-session: ok');
await page.close();
