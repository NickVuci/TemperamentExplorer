import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {captureContext} from '../src/composition/composition-context.mjs';
import {
  createProject,
  addEvent,
  makeEvent,
  setTempo,
  setLoop,
  PPQ
} from '../src/composition/composition-project.mjs';
import {
  expandProject,
  createPlan,
  planWindow,
  createTransport,
  heardSeconds,
  GROUP,
  GRACE_SECONDS,
  START_DELAY_SECONDS
} from '../src/composition/composition-transport.mjs';

const demo = JSON.parse(
  await readFile(new URL('./fixtures/composition/phase0-demo.json', import.meta.url), 'utf8')
);
const ctx = captureContext(demo.musicalContext.state, 220);
const BAR = 3840;
function demoProject(extra = p => p) {
  let p = createProject({name: 'demo', context: ctx, tempo: 100});
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
  return extra(p);
}
const emptyProject = () => createProject({name: 'empty', context: ctx, tempo: 100});

// A controllable clock and recording audio engine.
function fake({state = 'running', latency = 0} = {}) {
  const clock = {audioSeconds: 100, state, clockRevision: 1},
    scheduled = [],
    cancels = [],
    events = [];
  let prepareGate = null;
  const audio = {
    prepare: () => (prepareGate ? prepareGate.promise : Promise.resolve()),
    getClockSnapshot: () => ({
      audioSeconds: clock.audioSeconds,
      performanceMs: 0,
      anchor: {audioSeconds: clock.audioSeconds - latency, performanceMs: 0},
      state: clock.state,
      clockRevision: clock.clockRevision
    }),
    scheduleVoices: (list, opts) => {
      assert.equal(opts.groupId, GROUP);
      scheduled.push(...list.map(v => ({...v, settings: opts.settings})));
      return [];
    },
    cancelGroup: id => cancels.push(id)
  };
  const timer = {set: () => 1, clear: () => {}};
  const hold = () => {
    let resolve;
    const promise = new Promise(r => {
      resolve = r;
    });
    prepareGate = {promise, resolve};
    return prepareGate;
  };
  return {
    clock,
    audio,
    scheduled,
    cancels,
    events,
    timer,
    hold,
    onState: (e, d) => events.push([e, d])
  };
}
/** Advance the audio clock in `step`-second increments, pumping each time. */
function run(t, f, seconds, step = 0.05) {
  for (let s = 0; s < seconds - 1e-9; s += step) {
    f.clock.audioSeconds += step;
    t.pump();
  }
}
const make = (project, f) =>
  createTransport({getProject: () => project, audio: f.audio, timer: f.timer, onState: f.onState});

// ---------- expansion ----------
{
  const p = demoProject();
  const occ = expandProject(p);
  assert.equal(occ.length, 8 + 31, '8 chords + 31 melody notes (the last bar has three)');
  assert.ok(
    occ.every((o, i, a) => !i || a[i - 1].startTick <= o.startTick),
    'sorted by start'
  );
  assert.equal(new Set(occ.map(o => o.occId)).size, occ.length, 'unique occurrence ids');
  assert.equal(Math.max(...occ.map(o => o.endTick)), 8 * BAR);
  // Repeats: a 2x clip yields a second occurrence offset by the clip length with its own id.
  const rep = structuredClone(p);
  rep.clips[0].repeat = 2;
  const reo = expandProject(rep).filter(o => o.clipId === rep.clips[0].id);
  assert.equal(reo.length, 16);
  assert.equal(new Set(reo.map(o => o.occId)).size, 16);
  assert.equal(reo.find(o => o.occId === 'chord-bar-01#1').startTick, rep.clips[0].lengthTick);
  // Mute and solo.
  const muted = structuredClone(p);
  muted.tracks[0].mute = true;
  assert.equal(expandProject(muted).length, 31);
  const solo = structuredClone(p);
  solo.tracks[1].solo = true;
  assert.ok(expandProject(solo).every(o => o.trackId === solo.tracks[1].id));
  const level = structuredClone(p);
  level.tracks[0].level = 2;
  assert.equal(
    expandProject(level).find(o => o.eventId === 'chord-bar-01').velocity,
    127,
    'velocity scaled by level and clamped'
  );
}

// ---------- planWindow: crossing, seek and loop rules (pure) ----------
{
  const mk = events => {
    let p = emptyProject();
    for (const [s, d] of events)
      p = addEvent(
        p,
        p.clips[1].id,
        makeEvent({startTick: s, durationTick: d, tones: [{coordinate: [0, 0]}]})
      );
    return p;
  };
  const p = mk([
    [0, 960],
    [960, 960],
    [1500, 1000]
  ]);
  const plan = createPlan(p);
  assert.equal(
    planWindow(plan, {pos0: 0, loV: 0, hiV: 960}).length,
    1,
    'window is [lo,hi): event at 960 not yet'
  );
  assert.equal(planWindow(plan, {pos0: 0, loV: 0, hiV: 961}).length, 2);
  // Starting mid-note: the sounding note restarts with only its remaining length, once.
  const mid = planWindow(plan, {pos0: 700, loV: 700, hiV: 1000, includeCrossing: true});
  assert.deepEqual(
    mid.map(v => [v.onsetV, v.releaseV]),
    [
      [700, 960],
      [960, 1920]
    ]
  );
  assert.equal(
    planWindow(plan, {pos0: 700, loV: 700, hiV: 1000, includeCrossing: false}).length,
    1,
    'no restart without includeCrossing'
  );
  // Loop [1000,2000): the note 1500-2500 is cut at 2000 and retriggers each cycle.
  const looped = structuredClone(p);
  looped.loop = {enabled: true, startTick: 1000, endTick: 2000};
  const lp = createPlan(looped);
  const w = planWindow(lp, {pos0: 1000, loV: 1000, hiV: 4000, includeCrossing: false});
  assert.deepEqual(
    w.map(v => [v.cycle, v.onsetV, v.releaseV]),
    [
      [0, 1500, 2000],
      [1, 2500, 3000],
      [2, 3500, 4000]
    ],
    'cut at the boundary, retriggered every iteration'
  );
  // Events that started before the loop and cross into it are not retriggered after the first pass.
  const pre = structuredClone(looped);
  pre.clips[1].events.push({
    id: 'pre',
    startTick: 900,
    durationTick: 400,
    velocity: 90,
    tones: [{toneId: 'pre-t', coordinate: [0, 0]}]
  });
  pre.clips[1].events.sort((a, b) => a.startTick - b.startTick);
  const wp = planWindow(createPlan(pre), {pos0: 0, loV: 0, hiV: 5000});
  assert.equal(
    wp.filter(v => v.occId === 'pre#0').length,
    1,
    'plays once in the lead-in, never retriggered by the loop'
  );
  // Playback beginning after the loop end rewinds to the loop start (transport rule) - plan handles pos0 < end only.
  assert.equal(
    planWindow(lp, {pos0: 2500, loV: 2500, hiV: 3000}).every(v => v.cycle >= 1),
    true
  );
}

// ---------- full playback, exact timing ----------
{
  const p = demoProject(),
    f = fake(),
    t = make(p, f);
  await t.play();
  const anchor = 100 + START_DELAY_SECONDS;
  assert.equal(t.state, 'playing');
  run(t, f, 19.5);
  assert.equal(
    f.scheduled.length,
    8 * 3 + 31,
    '8 chords x3 tones + 31 melody notes, each exactly once'
  );
  assert.equal(
    new Set(f.scheduled.map(v => v.voiceId)).size,
    f.scheduled.length,
    'no duplicate voices'
  );
  // Independent oracle: seconds = anchor + tick * 60/(100*960); pitch = a*p + b*g.
  const first = f.scheduled.find(v => v.voiceId === 'chord-bar-01#0:chord-bar-01-tone-2:0');
  assert.ok(Math.abs(first.onsetAudioSeconds - anchor) < 1e-12);
  assert.ok(
    Math.abs(first.releaseAudioSeconds - (anchor + (3840 * 60) / (100 * 960))) < 1e-12,
    'chord lasts one bar = 2.4 s'
  );
  assert.ok(
    Math.abs(first.cents - (-2 * 1200 + 4 * 696.6512)) < 1e-9,
    '[-2,4] sounds 386.6048 cents'
  );
  assert.equal(first.chordSize, 3);
  assert.equal(first.velocity, 92);
  const note = f.scheduled.find(v => v.voiceId.startsWith('melody-bar-02-beat-03#0'));
  assert.ok(
    Math.abs(note.onsetAudioSeconds - (anchor + ((3840 + 1920) * 60) / (100 * 960))) < 1e-12
  );
  assert.deepEqual(f.scheduled[0].settings, undefined, 'transport uses central engine settings');
  assert.equal(t.state, 'stopped', 'stops itself after the last bar');
  assert.ok(f.events.some(e => e[0] === 'ended'));
  assert.equal(t.position(), 0, 'rewinds after ending');
  assert.ok(f.cancels.length >= 1);
}

// ---------- long loop: no drift, no duplicates, 100 iterations ----------
{
  const p = demoProject(q => setLoop(q, {enabled: true, startTick: 0, endTick: 2 * BAR})),
    f = fake(),
    t = make(p, f);
  await t.play();
  const anchor = 100 + START_DELAY_SECONDS,
    loopSeconds = (2 * BAR * 60) / (100 * PPQ);
  run(t, f, loopSeconds * 100 + 1);
  const ids = f.scheduled.map(v => v.voiceId);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate voice ids across 100 iterations');
  const perCycle = new Map();
  for (const v of f.scheduled) {
    const cycle = Number(v.voiceId.split(':').at(-1));
    perCycle.set(cycle, (perCycle.get(cycle) ?? 0) + 1);
  }
  const events2Bars = 3 * 2 + 4 * 2 * 1; // 2 chords x3 tones + 8 melody notes in the first two bars
  for (let c = 0; c < 100; c++)
    assert.equal(perCycle.get(c), events2Bars, `iteration ${c} has the same notes`);
  const last = f.scheduled.find(v => v.voiceId === 'chord-bar-01#0:chord-bar-01-tone-1:99');
  const expected = anchor + 99 * loopSeconds;
  assert.ok(
    Math.abs(last.onsetAudioSeconds - expected) < 1e-9,
    `iteration 99 starts at ${expected}, got ${last.onsetAudioSeconds}`
  );
  assert.equal(t.state, 'playing');
  assert.ok(t.position() >= 0 && t.position() < 2 * BAR, 'position wraps inside the loop');
  t.stop();
}

// ---------- pause / resume / seek ----------
{
  const p = demoProject(),
    f = fake(),
    t = make(p, f);
  await t.play();
  run(t, f, 3.0); // 3 s on the clock minus the .06 s start delay = 2.94 s = 4704 ticks at 1600 ticks/s
  const before = f.scheduled.length;
  t.pause();
  assert.equal(t.state, 'paused');
  assert.ok(f.cancels.includes(GROUP), 'pause cancels scheduled sound');
  const pos = t.position();
  assert.ok(Math.abs(pos - 4704) <= 1, `paused at tick 4704, got ${pos}`);
  f.clock.audioSeconds += 10;
  t.pump(); // time passing while paused schedules nothing
  assert.equal(f.scheduled.length, before);
  await t.play(); // resume
  const resumeAt = f.clock.audioSeconds + START_DELAY_SECONDS;
  run(t, f, 0.6);
  const after = f.scheduled.slice(before);
  assert.ok(after.length > 0);
  assert.ok(
    after.every(v => v.onsetAudioSeconds >= resumeAt - 1e-9),
    'no earlier attack replayed'
  );
  // The note sounding at the resume point restarts exactly once with its remaining length.
  const restarted = after.filter(v => v.onsetAudioSeconds === resumeAt);
  assert.ok(restarted.length > 0);
  t.stop();
  assert.equal(t.position(), 0);
  assert.equal(t.state, 'stopped');
}
{
  const p = demoProject(),
    f = fake(),
    t = make(p, f);
  await t.play();
  run(t, f, 1);
  const n = f.scheduled.length;
  await t.seek(2 * BAR);
  assert.equal(t.state, 'playing');
  run(t, f, 0.5);
  const post = f.scheduled.slice(n);
  assert.ok(
    post.some(v => v.voiceId.startsWith('chord-bar-03')),
    'plays from the new position'
  );
  assert.ok(
    !post.some(v => v.voiceId.startsWith('chord-bar-01') || v.voiceId.startsWith('chord-bar-02')),
    'bars before the seek are not replayed'
  );
  t.stop();
  await t.seek(1234);
  assert.equal(t.position(), 1234);
  assert.equal(t.state, 'stopped');
}

// ---------- no catch-up burst after a throttled or suspended timer ----------
{
  const p = demoProject(),
    f = fake(),
    t = make(p, f);
  await t.play();
  run(t, f, 1);
  const n = f.scheduled.length;
  f.clock.audioSeconds += 5;
  t.pump(); // timer starved for 5 s, mid-piece
  const burst = f.scheduled.slice(n);
  const now = f.clock.audioSeconds;
  assert.ok(
    burst.every(v => v.onsetAudioSeconds >= now - GRACE_SECONDS - 1e-9),
    'missed notes are skipped, never played late'
  );
  assert.ok(burst.length <= 3 * 2 + 4, 'only what is due now or within lookahead');
  assert.ok(
    f.events.some(e => e[0] === 'resync'),
    'resync is reported'
  );
  t.stop();
  // A starved timer that outlives the whole piece simply ends it; nothing is replayed.
  const g = fake(),
    u = make(demoProject(), g);
  await u.play();
  run(u, g, 1);
  const m = g.scheduled.length;
  g.clock.audioSeconds += 30;
  u.pump();
  assert.equal(u.state, 'stopped');
  assert.equal(g.scheduled.length, m, 'nothing scheduled after the piece has passed');
}
{
  const f = fake(),
    t = make(demoProject(), f);
  await t.play();
  run(t, f, 0.5);
  const n = f.scheduled.length;
  f.clock.state = 'suspended';
  f.clock.audioSeconds += 1;
  t.pump();
  assert.equal(t.state, 'paused', 'a suspended context pauses the transport');
  assert.ok(f.events.some(e => e[0] === 'suspended'));
  f.clock.state = 'running';
  f.clock.audioSeconds += 60;
  t.pump();
  assert.equal(
    f.scheduled.length,
    n,
    'nothing is scheduled after the context comes back until play is pressed'
  );
}
{
  const f = fake(),
    t = make(demoProject(), f);
  await t.play();
  run(t, f, 0.2);
  f.clock.clockRevision++;
  t.pump();
  assert.equal(t.state, 'paused', 'a new clock revision invalidates old anchors');
}

// ---------- stop during pending audio resume ----------
{
  const f = fake(),
    t = make(demoProject(), f),
    gate = f.hold();
  const playing = t.play();
  t.stop();
  gate.resolve();
  await playing;
  assert.equal(t.state, 'stopped');
  assert.equal(f.scheduled.length, 0, 'audio resumed after Stop never starts the piece');
  const f2 = fake(),
    t2 = make(demoProject(), f2),
    gate2 = f2.hold();
  const p2 = t2.play();
  await t2.seek(960);
  gate2.resolve();
  await p2;
  assert.equal(t2.state, 'stopped', 'a seek while resuming also invalidates the pending play');
  const f3 = fake({state: 'suspended'}),
    t3 = make(demoProject(), f3);
  await t3.play();
  assert.equal(t3.state, 'stopped');
  assert.ok(
    f3.events.some(e => e[0] === 'error'),
    'audio that will not run leaves the transport stopped and reports it'
  );
  const f4 = fake(),
    t4 = make(demoProject(), f4);
  f4.audio.prepare = () => Promise.reject(new Error('no audio'));
  await t4.play();
  assert.equal(t4.state, 'stopped');
  assert.equal(f4.events.at(-1)[0], 'error');
}

// ---------- empty project, edits, tempo ----------
{
  const f = fake(),
    t = make(emptyProject(), f);
  await t.play();
  run(t, f, 2.5 * 8 + 0.5); // one bar of silence at 100 bpm is 2.4 s
  assert.equal(f.scheduled.length, 0);
  assert.equal(t.state, 'stopped', 'an empty project plays its bar and stops');
}
{
  // An edit while playing carries on: only voices that have not started are replaced, from the playhead.
  let project = demoProject();
  const f = fake(),
    cancelled = [];
  f.audio.scheduleVoices = (list, opts) => {
    assert.equal(opts.groupId, GROUP);
    f.scheduled.push(...list);
    return list.map(v => ({voiceId: v.voiceId, cancel: () => cancelled.push(v.voiceId)}));
  };
  const t = createTransport({
    getProject: () => project,
    audio: f.audio,
    timer: f.timer,
    onState: f.onState
  });
  await t.play();
  const at = () => ({
    future: f.scheduled.filter(v => v.onsetAudioSeconds > f.clock.audioSeconds).map(v => v.voiceId),
    sounding: f.scheduled
      .filter(
        v =>
          v.onsetAudioSeconds <= f.clock.audioSeconds &&
          v.releaseAudioSeconds > f.clock.audioSeconds
      )
      .map(v => v.voiceId)
  });
  for (let i = 0; i < 200 && !(at().future.length && at().sounding.length); i++) run(t, f, 0.05);
  const now = f.clock.audioSeconds,
    before = t.position(),
    n = f.scheduled.length,
    {future, sounding} = at();
  assert.ok(
    future.length > 0 && sounding.length > 0,
    'the fixture has sounding and upcoming voices'
  );
  project = setTempo(project, 200);
  t.invalidate();
  assert.equal(t.state, 'playing', 'an edit keeps playing');
  assert.deepEqual(
    [...cancelled].sort(),
    [...future].sort(),
    'only voices that had not started are cancelled'
  );
  assert.ok(!f.cancels.includes(GROUP), 'sounding notes are not cut');
  assert.ok(Math.abs(t.position() - before) <= 1, 'the playhead keeps its place');
  const again = f.scheduled.slice(n);
  assert.ok(
    again.length > 0 && again.every(v => v.onsetAudioSeconds >= now - 1e-9),
    'the rest is rescheduled from now'
  );
  assert.ok(
    !again.some(v => sounding.includes(v.voiceId)),
    'a sounding note is never started twice'
  );
  run(t, f, 0.6);
  assert.ok(
    Math.abs(t.position() - before - (0.6 * 200 * PPQ) / 60) <= 3,
    'and plays on at the new tempo'
  );
  t.stop();
}
{
  let project = demoProject();
  const f = fake(),
    t = createTransport({
      getProject: () => project,
      audio: f.audio,
      timer: f.timer,
      onState: f.onState
    });
  await t.play();
  run(t, f, 1.5);
  t.pause();
  const pos = t.position();
  assert.ok(pos > 0);
  project = setTempo(project, 200);
  t.invalidate(); // tempo edit while paused
  assert.equal(t.state, 'paused', 'an edit while paused does not start playback');
  const n = f.scheduled.length;
  await t.play();
  run(t, f, 0.3);
  const after = f.scheduled.slice(n);
  assert.ok(after.length > 0);
  // At 200 bpm a tick lasts half as long: the first restarted note's remaining length is halved.
  const ticks = ((after[0].releaseAudioSeconds - after[0].onsetAudioSeconds) * 200 * PPQ) / 60;
  assert.ok(
    Math.abs(ticks - Math.round(ticks)) < 1e-6,
    'the restarted note length is a whole number of ticks at the new tempo'
  );
  t.stop();
}

// ---------- bounded playback: absolute half-open sections and exact resume ----------
assert.equal(
  heardSeconds({
    audioSeconds: 10,
    performanceMs: 1250,
    anchor: {audioSeconds: 9.7, performanceMs: 1200}
  }),
  9.75,
  'default heard time extrapolates the output timestamp to the snapshot time'
);
function boundaryProject() {
  let p = emptyProject();
  for (const [id, start, duration] of [
    ['cross', 0, 2400],
    ['boundary', 960, 960],
    ['later', 1920, 960]
  ]) {
    p = addEvent(p, p.clips[1].id, {
      id,
      startTick: start,
      durationTick: duration,
      velocity: 90,
      tones: [{toneId: `${id}-tone`, coordinate: [0, 0]}]
    });
  }
  return setLoop(p, {enabled: true, startTick: 0, endTick: 1920});
}
{
  const f = fake(),
    t = make(boundaryProject(), f),
    anchor = 100 + START_DELAY_SECONDS;
  let interval;
  f.timer.set = fn => ((interval = fn), 1);
  await t.play({untilTick: 960, graceMs: 0});
  assert.equal(f.scheduled.length, 1, 'only the crossing note starts before the bound');
  assert.ok(
    Math.abs(f.scheduled[0].releaseAudioSeconds - (anchor + 0.6)) < 1e-9,
    'a crossing release is capped'
  );
  f.clock.audioSeconds = anchor + 0.6;
  interval();
  assert.equal(
    t.state,
    'stopped',
    'the transport timer reaches the bound without an animation frame'
  );
  assert.equal(f.events.at(-1)[0], 'ended');
  assert.equal(f.events.at(-1)[1].tick, 960);
  t.pump();
  assert.equal(f.events.filter(([e]) => e === 'ended').length, 1, 'the end fires once');
  await t.seek(960);
  const n = f.scheduled.length;
  await t.play({untilTick: 1920, graceMs: 0});
  const secondAnchor = f.clock.audioSeconds + START_DELAY_SECONDS;
  assert.equal(
    t.position(),
    960,
    'a bounded run keeps its absolute start despite the project loop'
  );
  assert.equal(
    f.scheduled.slice(n).filter(v => v.voiceId.startsWith('boundary#')).length,
    1,
    'the onset at its start plays exactly once'
  );
  f.clock.audioSeconds = secondAnchor + 0.6;
  t.pump();
  assert.equal(f.events.at(-1)[1].tick, 1920, 'the saved project loop does not wrap a bounded run');
  assert.ok(
    !f.scheduled.some(v => v.voiceId.startsWith('later#')),
    'an onset at the bound is excluded'
  );
  t.stop();
}
{
  const f = fake({latency: 0.2}),
    t = make(boundaryProject(), f),
    anchor = 100 + START_DELAY_SECONDS;
  await t.play({untilTick: 960, graceMs: 130});
  f.clock.audioSeconds = anchor + 0.6 + 0.13;
  t.pump();
  assert.equal(t.state, 'playing', 'the final grace runs after the listener reaches the end');
  f.clock.audioSeconds = anchor + 0.6 + 0.2 + 0.12;
  t.pump();
  assert.equal(t.state, 'playing');
  assert.equal(t.timeAt().tick, 960);
  assert.ok(t.timeAt().v > 960, 'virtual heard time advances through the final judging window');
  f.clock.audioSeconds = anchor + 0.6 + 0.2 + 0.14;
  t.pump();
  const [event, detail] = f.events.at(-1);
  assert.equal(event, 'ended');
  assert.equal(detail.tick, 960);
  assert.ok(
    detail.v >= 960 + 0.13 * 1600,
    'ended exposes enough heard virtual time to mark final misses'
  );
  assert.equal(detail.tps, 1600);
  assert.equal(t.state, 'stopped');
  assert.equal(t.position(), 0);
}
{
  const g = fake(),
    u = make(boundaryProject(), g);
  await u.play({untilTick: 960, graceMs: 130});
  const m = g.scheduled.length;
  g.clock.audioSeconds += 20;
  u.pump();
  assert.equal(u.state, 'stopped');
  assert.equal(g.scheduled.length, m, 'a delayed end pump never replays missed or excluded onsets');
  assert.ok(g.events.at(-1)[1].v > 960 + 0.13 * 1600, 'delayed end carries the final heard clock');
}
{
  const f = fake(),
    t = createTransport({
      getProject: boundaryProject,
      audio: f.audio,
      timer: f.timer,
      onState: f.onState,
      getClick: () => true
    });
  await t.play({countIn: 1, untilTick: 1000, graceMs: 0});
  const anchor = 100 + START_DELAY_SECONDS + 2.4,
    endAudio = anchor + 1000 / 1600;
  assert.equal(f.scheduled.filter(v => v.voiceId.startsWith('count#')).length, 4);
  assert.equal(t.countingIn().beats, 4);
  f.clock.audioSeconds = anchor + 0.59;
  t.pump();
  const lastClick = f.scheduled.find(v => v.voiceId === 'click#1:0');
  assert.ok(lastClick, 'the beat just before the bound is scheduled');
  assert.ok(
    Math.abs(lastClick.releaseAudioSeconds - endAudio) < 1e-9,
    'even a short metronome click is capped at the bound'
  );
  assert.ok(
    f.scheduled.every(v => v.releaseAudioSeconds <= endAudio + 1e-9),
    'count-in and arrangement voices respect the same cap'
  );
  f.clock.audioSeconds = endAudio;
  t.pump();
  assert.equal(t.state, 'stopped');
  assert.equal(f.events.at(-1)[1].tick, 1000);
}
{
  let project = boundaryProject();
  const f = fake(),
    t = createTransport({
      getProject: () => project,
      audio: f.audio,
      timer: f.timer,
      onState: f.onState
    });
  await t.play({untilTick: 960, graceMs: 250});
  f.clock.audioSeconds += 0.2;
  t.pause();
  await t.play();
  await t.seek(500);
  project = setTempo(project, 200);
  t.invalidate();
  f.clock.audioSeconds += 1;
  t.pump();
  assert.equal(t.state, 'stopped');
  assert.equal(f.events.at(-1)[0], 'ended');
  assert.equal(
    f.events.at(-1)[1].tick,
    960,
    'pause/resume, seek and edits preserve the absolute bound'
  );
  t.stop();
  await t.play();
  f.clock.audioSeconds += 2;
  t.pump();
  assert.equal(
    t.state,
    'playing',
    'Stop clears the bounded run options and restores the saved loop'
  );
  t.stop();
}
{
  const f = fake(),
    t = make(boundaryProject(), f),
    gate = f.hold();
  const preparing = t.play({untilTick: 960, graceMs: 0});
  t.pause();
  gate.resolve();
  await preparing;
  assert.equal(t.state, 'paused');
  assert.equal(
    f.scheduled.length,
    0,
    'Pause invalidates audio preparation before any voice starts'
  );
  await t.play();
  f.clock.audioSeconds += 2;
  t.pump();
  assert.equal(f.events.at(-1)[1].tick, 960, 'a resumed pending run retains its bound');
  assert.equal(t.state, 'stopped');
}
{
  const f = fake(),
    t = make(boundaryProject(), f);
  await t.play({untilTick: 960, graceMs: 250});
  f.clock.audioSeconds += 0.1;
  t.pause();
  await t.play();
  await t.seek(500);
  const endAudio = f.clock.audioSeconds + START_DELAY_SECONDS + (960 - 500) / 1600;
  f.clock.audioSeconds = endAudio + 0.2;
  t.pump();
  assert.equal(t.state, 'playing', 'an inherited final grace survives manual pause and seek');
  assert.equal(t.position(), 960);
  f.clock.audioSeconds = endAudio + 0.26;
  t.pump();
  assert.equal(t.state, 'stopped');
  await t.seek(960);
  await t.play({untilTick: null});
  f.clock.audioSeconds += 2;
  t.pump();
  assert.equal(t.state, 'playing', 'an explicit null boundary restores unbounded loop playback');
  t.stop();
}

console.log('composition-transport: ok');
