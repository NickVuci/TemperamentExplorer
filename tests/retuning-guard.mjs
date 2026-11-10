import assert from 'node:assert/strict';
import {scale} from '../src/core/engine.mjs';
import {makeState} from '../src/core/catalog.mjs';
import {BUILTIN_LAYOUTS} from '../src/hexboard/builtin-layouts.mjs';
import {buildBoard} from '../src/hexboard/hexboard.mjs';
import {noteCoordinate} from '../src/core/pitch.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {preflightRetuning, RETUNING_STRUCTURE_MESSAGE} from '../src/core/retuning-guard.mjs';
import {bootApp} from './support/dom.mjs';

const builtin = key =>
  structuredClone(BUILTIN_LAYOUTS.find(row => row.id === 'builtin:' + key).state);
const {context: layoutState, config: layout} = builtin('meantone');
const meantone = {...makeState('meantone'), ...layoutState};
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const coords = s => scale(s).notes.map(n => noteCoordinate(s, n).map(v => v || 0));
const structure = (s, cfg) =>
  buildBoard(s, cfg).keys.map(k => [k.m.map(v => v || 0), k.degree, k.enabled]);

for (const key of ['meantone', 'dreamtone']) {
  const {context: currentState, config: layoutConfig} = builtin(key);
  for (const periodWrapping of [false, true])
    for (const multiplier of [1, 1.001]) {
      const candidateState = {
        ...currentState,
        p: currentState.p * multiplier,
        g: currentState.g * multiplier + (multiplier === 1 ? 0.001 : 0)
      };
      const input = freeze({
        currentState,
        candidateState,
        playState: {...currentState, mode: 1},
        layoutConfig: {...layoutConfig, periodWrapping}
      });
      const result = preflightRetuning(input);
      assert.deepEqual(coords(result.state), coords(currentState));
      assert.deepEqual(coords(result.playState), coords(input.playState));
      assert.equal(result.playState.mode, 1, 'Play retains its independent mode');
      assert.deepEqual(
        structure(result.playState, input.layoutConfig),
        structure(input.playState, input.layoutConfig)
      );
      assert.notEqual(
        buildBoard(result.playState, input.layoutConfig).keys[66].c,
        buildBoard(input.playState, input.layoutConfig).keys[66].c
      );
      assert.notStrictEqual(result.state, candidateState);
    }
}
console.log(
  'Small and proportional retunings preserve integer structure for wrapped and unwrapped 5-limit/higher-limit boards.'
);

function rejects(input, reason) {
  const before = structuredClone(input);
  assert.throws(
    () => preflightRetuning(input),
    error => error.message.startsWith(RETUNING_STRUCTURE_MESSAGE) && error.message.includes(reason)
  );
  assert.deepEqual(input, before, 'rejected trials never mutate inputs');
}
rejects(
  {
    currentState: meantone,
    candidateState: {
      ...meantone,
      rows: [
        [1, 1, 1],
        [0, 1, 4]
      ]
    },
    layoutConfig: layout
  },
  'mapping'
);
rejects(
  {currentState: meantone, candidateState: {...meantone, n: 6}, layoutConfig: layout},
  'Discover'
);
rejects(
  {currentState: meantone, candidateState: {...meantone, g: 600}, layoutConfig: layout},
  'collision'
);
rejects(
  {currentState: meantone, candidateState: {...meantone, g: 400.01}, layoutConfig: layout},
  'Discover'
);
rejects(
  {
    currentState: meantone,
    candidateState: {...meantone, g: meantone.g + 10},
    playState: {...meantone, n: 19},
    layoutConfig: layout
  },
  'Play'
);
const two = {...makeState('meantone'), n: 2, mode: 0, g: 550},
  twoLayout = {
    ...layout,
    base: 2,
    offset: 0,
    style: 'bosanquet',
    periodWrapping: false,
    outside: false
  };
rejects({currentState: two, candidateState: {...two, g: 600}, layoutConfig: twoLayout}, 'fallback');
rejects(
  {currentState: two, candidateState: {...two, g: 650}, layoutConfig: twoLayout},
  'Button assignments'
);
// Both selected scale coordinates survive 550 -> 600; 2edo introduces board pitch aliases,
// changing enabled keys even under fixed manual integer axes.
assert.deepEqual(coords(two), coords({...two, g: 600}));
rejects(
  {
    currentState: two,
    candidateState: {...two, g: 600},
    layoutConfig: {...twoLayout, style: 'manual', ap: 1, ag: 0, bp: 0, bg: 1}
  },
  'Button assignments'
);
for (const [comma, basis] of [
  ['128/125', '2.3.5'],
  ['245/243', '3.5.7']
]) {
  const currentState = {...fromCommas(comma, basis), n: 2, mode: 0},
    candidateState = {...currentState, g: currentState.g + 0.001};
  assert.doesNotThrow(() =>
    preflightRetuning({
      currentState,
      candidateState,
      layoutConfig: {...twoLayout, style: 'manual', ap: 1, ag: 0, bp: 0, bg: 1}
    })
  );
}
console.log(
  'Retuning boundaries cover collisions, reordered scales, independent Play scales, MOS fallback, axes, pitch aliases, divided and non-octave periods.'
);

// In the app, every tuning control commits atomically: a rejected draft does not leak through
// explorer metadata, assignments, the Play layout or a redraw.
const page = await bootApp(),
  {$} = page;
const ready = () =>
  page.until(
    () => /chords · complete/.test($('[data-unified-pane="directory"]')?.textContent ?? ''),
    {message: 'the catalogue'}
  );
await ready();
async function snapshot() {
  page.click('#save');
  const saved = JSON.parse(await page.downloaded(/session\.json$/));
  return {
    state: saved.states[0],
    layoutScale: saved.layoutScale,
    hexboard: saved.hexboard,
    generator: $('.tuning-summary').textContent
  };
}
async function rejected(edit, message) {
  await ready();
  const before = await snapshot(),
    workspace = $('.unified-main');
  $('#toast').textContent = '';
  await edit();
  await page.settle();
  assert.notEqual(page.toast(), '', `${message}: the reason is shown`);
  assert.deepEqual(await snapshot(), before, `${message}: nothing changes`);
  assert.equal($('.unified-main'), workspace, `${message}: only the controls redraw`);
}

// A valid JI target commits.
page.change('[data-field="tuning"]', 'JI Target');
await page.settle();
const tuned = await snapshot();
assert.equal(tuned.state.tuning, 'JI Target');
assert.equal(
  tuned.state.g,
  (1200 * Math.log2(5 / 4) + 2400) / 4,
  'pure 5/4 at -2 periods + 4 generators'
);
assert.deepEqual(tuned.layoutScale, {n: 7, mode: 0}, 'Play keeps its scale');

// Explorer edits that would move the selected scale or layout are rejected.
await rejected(
  () => page.change('[data-explore-field="choice"]', '0,1'),
  'an alternative interval'
);
await rejected(() => page.change('[data-explore-field="a"]', '0'), 'direct coordinates');
await rejected(
  () => page.change('[data-explore-field="ratio"]', 'not a ratio'),
  'an invalid ratio'
);
assert.match(page.toast(), /integer ratios/);

// A session can hold a JI target draft that no longer fits. Every control that would apply it is
// rejected without changing anything.
const draft = {
  ...tuned.state,
  explore: {ratio: '5/4', m: [0, 1], open: false},
  tuneConfig: {...tuned.state.tuneConfig, method: 'JI Target', fixed: true, jiAll: false}
};
await page.openSession({
  format: 'temperament-lab-v1',
  workflowVersion: 8,
  states: [draft],
  layoutScale: tuned.layoutScale
});
assert.equal(page.toast(), 'Session opened');
const explorerButton = action => () => page.click(`[data-explore="${action}"]`);
await rejected(() => page.change('[data-field="tuning"]', 'JI Target'), 'choosing JI Target');
await rejected(() => page.change('[data-optimize-period="0"]', true), 'Optimize period');
await rejected(explorerButton('pure'), 'Use this target');
await page.openSession({
  format: 'temperament-lab-v1',
  workflowVersion: 8,
  states: [
    {
      ...draft,
      assignments: [{label: '5/4', c: 1200 * Math.log2(5 / 4), m: [0, 1]}],
      tuneConfig: {...draft.tuneConfig, jiAll: true}
    }
  ],
  layoutScale: tuned.layoutScale
});
for (const action of ['add', 'pureall']) await rejected(explorerButton(action), action);
await page.openSession({
  format: 'temperament-lab-v1',
  workflowVersion: 8,
  states: [
    {
      ...draft,
      assignments: [
        {label: '5/4', c: 1200 * Math.log2(5 / 4), m: [0, 1]},
        {label: '3/2', c: 1200 * Math.log2(3 / 2), m: [0, 1]}
      ],
      tuneConfig: {...draft.tuneConfig, jiAll: true}
    }
  ],
  layoutScale: tuned.layoutScale
});
await rejected(() => page.click('[data-explore="remove"][data-i="1"]'), 'removing an assignment');
// Play received the committed tuning and nothing from the rejected drafts. (Visiting Play starts
// background work that redraws Discover later, so it comes last.)
page.section('play');
await page.settle();
page.click('[data-hex-action="export"]');
const exported = JSON.parse(await page.downloaded(/HexBoard\.json$/)).details;
assert.equal(exported.generatorCents, Number(tuned.state.g.toFixed(4)));
assert.deepEqual([exported.scale.notes, exported.scale.mode], [7, 1]);
assert.deepEqual(page.errors, []);
console.log(
  'Real tuning, Optimize period, JI explorer and assignment adapters commit atomically and preserve rejected state.'
);
await page.close();
