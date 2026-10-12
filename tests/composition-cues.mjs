import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {captureContext} from '../src/composition/composition-context.mjs';
import {
  createProject,
  addEvent,
  makeEvent,
  allIds,
  setLoop
} from '../src/composition/composition-project.mjs';
import {
  boardSnapshot,
  buildCueTimeline,
  activeCues,
  toPracticeTargets,
  PRACTICE_FORMAT,
  MATCH_MODES
} from '../src/composition/composition-cues.mjs';

const demo = JSON.parse(
  await readFile(new URL('./fixtures/composition/phase0-demo.json', import.meta.url), 'utf8')
);
const corpus = JSON.parse(
  await readFile(new URL('./fixtures/composition/phase0-corpus.json', import.meta.url), 'utf8')
);
const ctx = captureContext(demo.musicalContext.state, 220);
const close = (a, b, t = 1e-9) => assert.ok(Math.abs(a - b) <= t, `${a} != ${b}`);

function demoProject(layout = demo.layout) {
  let p = createProject({name: 'demo', context: ctx, layout, tempo: 100});
  const [cc, mc] = p.clips.map(c => c.id);
  for (const e of demo.chordEvents)
    p = addEvent(p, cc, {
      id: e.id,
      startTick: e.startTick,
      durationTick: e.durationTick,
      velocity: e.velocity,
      tones: e.tones
    });
  for (const e of demo.melodyEvents)
    p = addEvent(p, mc, {
      id: e.id,
      startTick: e.startTick,
      durationTick: e.durationTick,
      velocity: e.velocity,
      tones: [{toneId: e.toneId, coordinate: e.coordinate}]
    });
  return p;
}
const project = demoProject();
const snapshot = boardSnapshot(project);
assert.equal(snapshot.status, 'ok');
const timeline = buildCueTimeline(project, snapshot);

// --- shape and timing ---
assert.equal(timeline.length, 8 * 3 + 31, 'one cue per tone');
assert.ok(
  timeline.every((c, i, a) => !i || a[i - 1].onsetTick <= c.onsetTick),
  'sorted by onset'
);
assert.equal(new Set(timeline.map(c => c.cueId)).size, timeline.length);
assert.equal(Math.max(...timeline.map(c => c.releaseTick)), 30720);
close(Math.max(...timeline.map(c => c.onsetSeconds + c.durationSeconds)), 19.2);

// --- melody cues against the fixture's independently captured degree, period shift and board cell ---
const melodyCues = new Map(timeline.filter(c => c.trackKind === 'melody').map(c => [c.toneId, c]));
for (const e of demo.melodyEvents) {
  const cue = melodyCues.get(e.toneId);
  assert.ok(cue, e.id);
  assert.deepEqual(
    cue.coordinate,
    e.coordinate.map(v => (v === 0 ? 0 : v))
  );
  assert.equal(cue.degree, e.sourceDegree, `${e.id}: degree`);
  assert.equal(cue.register, e.periodShift, `${e.id}: period displacement`);
  assert.equal(cue.onsetTick, e.startTick);
  assert.equal(cue.releaseTick, e.startTick + e.durationTick);
  assert.ok(
    cue.cells.includes(e.boardCell),
    `${e.id}: captured cell ${e.boardCell} is among ${cue.cells}`
  );
  assert.equal(cue.cellStatus, 'ok');
  const cents = e.coordinate[0] * ctx.p + e.coordinate[1] * ctx.g;
  close(cue.cents, cents);
  close(cue.hz, 220 * 2 ** (cents / 1200), 1e-9 * cue.hz);
}
// Duplicate board positions are alternatives, never identity.
assert.ok(
  melodyCues.get(demo.melodyEvents[0].toneId).cells.length > 1,
  'a wrapped layout offers several cells for one pitch'
);
assert.ok(
  melodyCues.get(demo.melodyEvents[0].toneId).cells.every((c, i, a) => !i || a[i - 1] < c),
  'cells ascending'
);

// --- chord cues keep their grouping and exact coordinates ---
const chord = timeline.filter(c => c.occurrenceId === 'chord-bar-02#0');
assert.equal(chord.length, 3);
assert.ok(chord.every(c => c.chordSize === 3 && c.trackKind === 'chords'));
assert.deepEqual(
  chord.map(c => c.coordinate),
  demo.chordEvents[1].tones.map(t => t.coordinate)
);

// --- any-degree mode offers every cell of the degree; exact mode only the exact pitch ---
const c1 = melodyCues.get(demo.melodyEvents.find(e => e.periodShift === 1).toneId);
assert.ok(c1.degreeCells.length > c1.cells.length, 'any-degree allows other registers');
assert.ok(c1.cells.every(i => c1.degreeCells.includes(i)));

// --- independent board oracle: captured probes for every temperament, wrapping on and off ---
for (const f of corpus.fixtures) {
  const fctx = captureContext(f.state, corpus.tonicHz);
  for (const mode of ['off', 'on']) {
    const L = f.layouts[mode];
    if (!L) continue;
    let p = createProject({name: f.id, context: fctx, layout: L.config, tempo: 100});
    const probes = L.probes.filter(q => q.enabled);
    probes.forEach((q, i) => {
      p = addEvent(
        p,
        p.clips[1].id,
        makeEvent(
          {startTick: i * 960, durationTick: 960, tones: [{coordinate: q.coordinate}]},
          allIds(p)
        )
      );
    });
    const cues = buildCueTimeline(p);
    cues.forEach((cue, i) =>
      assert.ok(
        cue.cells.includes(probes[i].index),
        `${f.id} wrap ${mode}: probe ${probes[i].index} sounds ${probes[i].coordinate}`
      )
    );
    // Disabled probes are never offered as cells for their coordinate unless another enabled key shares it.
    for (const q of L.probes.filter(x => !x.enabled)) {
      const cell = boardSnapshot(p).cells.find(c => c.index === q.index);
      assert.equal(
        cell,
        undefined,
        `${f.id} wrap ${mode}: disabled key ${q.index} is not playable`
      );
    }
  }
}

// --- audible but unplayable: no key on the layout, or no layout at all ---
{
  let p = demoProject();
  const far = [40, 70];
  p = addEvent(
    p,
    p.clips[1].id,
    makeEvent({startTick: 30720, durationTick: 960, tones: [{coordinate: far}]}, allIds(p))
  );
  const cue = buildCueTimeline(p).find(c => c.coordinate[0] === 40 && c.coordinate[1] === 70);
  assert.deepEqual(cue.cells, []);
  assert.equal(cue.cellStatus, 'none-on-layout');
  assert.match(cue.cellNote, /still sounds/);
  assert.ok(cue.hz > 0, 'the cue still has a frequency');
  // A chord with one unplayable tone keeps the others.
  p = addEvent(
    p,
    p.clips[0].id,
    makeEvent(
      {startTick: 30720, durationTick: 960, tones: [{coordinate: [0, 0]}, {coordinate: far}]},
      allIds(p)
    )
  );
  const mixed = buildCueTimeline(p).filter(c => c.chordSize === 2);
  assert.deepEqual(mixed.map(c => c.cellStatus).sort(), ['none-on-layout', 'ok']);
  const nl = buildCueTimeline(demoProject(null));
  assert.ok(
    nl.every(
      c =>
        c.cellStatus === 'no-layout' && c.cells.length === 0 && /no saved layout/.test(c.cellNote)
    )
  );
  assert.equal(nl.length, timeline.length, 'a missing layout removes cells, not notes');
  // A layout that cannot be built is reported rather than thrown.
  const broken = boardSnapshot({
    ...project,
    layout: {...demo.layout, style: 'manual', ap: 0, ag: 0, bp: 0, bg: 0}
  });
  assert.equal(broken.status, 'unavailable');
  assert.match(broken.reason, /cannot be built/);
}

// --- mixer: cues include muted tracks by default; the mixer-aware variant honours it ---
{
  const p = structuredClone(project);
  p.tracks[0].mute = true;
  assert.equal(buildCueTimeline(p, snapshot).length, timeline.length);
  assert.equal(buildCueTimeline(p, snapshot, {ignoreMixer: false}).length, 31);
}

// --- active cues ---
{
  const at0 = activeCues(timeline, 0);
  assert.equal(at0.sounding.length, 3 + 1, 'first chord and first melody note');
  assert.equal(at0.nextTick, 960);
  assert.equal(at0.upcoming.length, 1);
  const at960 = activeCues(timeline, 960);
  assert.ok(
    !at960.sounding.some(c => c.toneId === demo.melodyEvents[0].toneId),
    'release is exclusive'
  );
  assert.ok(at960.sounding.some(c => c.toneId === demo.melodyEvents[1].toneId));
  const end = activeCues(timeline, 30720);
  assert.equal(end.sounding.length, 0);
  assert.equal(end.nextTick, null);
  assert.deepEqual(end.upcoming, []);
}

// --- practice targets: neutral, versioned, complete, no scoring ---
{
  const t = toPracticeTargets(project, snapshot);
  assert.equal(t.format, PRACTICE_FORMAT);
  assert.equal(t.matchMode, 'exact-coordinate');
  assert.equal(t.targets.length, timeline.length);
  assert.deepEqual(t.timing, {
    ppq: 960,
    tempo: 100,
    meter: {numerator: 4, denominator: 4},
    loop: {enabled: false, startTick: 0, endTick: null}
  });
  assert.equal(t.context.tonicHz, 220);
  assert.equal(t.context.scale.n, 7);
  assert.deepEqual(t.layout, demo.layout);
  assert.deepEqual(JSON.parse(JSON.stringify(t)), t, 'pure JSON');
  assert.ok(
    t.targets.every(
      x =>
        Number.isInteger(x.onsetTick) &&
        Number.isInteger(x.durationTick) &&
        x.coordinate.every(Number.isInteger)
    )
  );
  assert.ok(!JSON.stringify(t).match(/score|grade|accuracy/i), 'no judging in the hand-off');
  const first = t.targets.find(x => x.id.includes(demo.melodyEvents[0].toneId));
  assert.deepEqual(first.cells, melodyCues.get(demo.melodyEvents[0].toneId).cells);
  // Match modes are explicit and stay distinct.
  const any = toPracticeTargets(project, snapshot, {matchMode: 'any-degree'});
  assert.ok(any.targets.find(x => x.id === first.id).cells.length >= first.cells.length);
  const btn = toPracticeTargets(project, snapshot, {matchMode: 'button'});
  assert.equal(btn.targets.find(x => x.id === first.id).button, Math.min(...first.cells));
  assert.throws(() => toPracticeTargets(project, snapshot, {matchMode: 'fuzzy'}), /matchMode/);
  assert.deepEqual(MATCH_MODES, ['exact-coordinate', 'any-degree', 'button']);
  // Track filter: melody only.
  const mel = toPracticeTargets(project, snapshot, {trackKinds: ['melody']});
  assert.equal(mel.targets.length, 31);
  assert.ok(mel.targets.every(x => x.trackKind === 'melody'));
  // Loop settings travel with the targets.
  const looped = setLoop(project, {enabled: true, startTick: 0, endTick: 7680});
  assert.deepEqual(toPracticeTargets(looped, snapshot).timing.loop, {
    enabled: true,
    startTick: 0,
    endTick: 7680
  });
  assert.equal(toPracticeTargets(project, snapshot).source.projectId, project.id);
}

console.log('composition-cues: ok');
