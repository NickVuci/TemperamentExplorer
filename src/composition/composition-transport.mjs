// Composition transport: expands a project into timed occurrences and plays them
// through the shared audio engine with a bounded lookahead pump.
//
// Time is integer ticks (960 per quarter). "Virtual" ticks increase forever across
// loop iterations; audio seconds are always computed from an integer virtual tick as
// anchor + (tick - startTick) * 60 / (tempo * 960), so nothing accumulates float error.
import {PPQ, contentEndTick, barTicks} from './composition-project.mjs';
import {resolveTone} from './composition-context.mjs';
import {beatTicks, beatAccent} from './composition-grid.mjs';

export const GROUP = 'transport';
const LOOKAHEAD_SECONDS = 0.25;
const PUMP_MS = 50;
export const START_DELAY_SECONDS = 0.06;
export const GRACE_SECONDS = 0.1;
// Metronome and count-in: short sine beeps at fixed pitches (cents above 440 Hz), whatever the
// composition's tuning, accented on the bar and on each beat group.
export const CLICK = Object.freeze({
  seconds: 0.045,
  settings: Object.freeze({tonic: 440, wave: 'sine'}),
  bar: {cents: 2400, velocity: 120},
  group: {cents: 2100, velocity: 95},
  beat: {cents: 1900, velocity: 70}
});
const byStart = (a, b) =>
  a.startTick - b.startTick || (a.occId < b.occId ? -1 : a.occId > b.occId ? 1 : 0);

/**
 * The audio time being heard at `performanceMs` (performance.now() clock; default: the snapshot's
 * own time). The output timestamp in the snapshot pairs the two clocks after output latency, so a
 * key press is placed against what the player was hearing when they pressed it.
 */
export function heardSeconds(snap, performanceMs = snap.performanceMs) {
  const a = snap.anchor ?? {audioSeconds: snap.audioSeconds, performanceMs: snap.performanceMs};
  return (
    a.audioSeconds +
    (Number.isFinite(performanceMs) && Number.isFinite(a.performanceMs)
      ? (performanceMs - a.performanceMs) / 1000
      : 0)
  );
}

/** All sounding occurrences in absolute ticks, honouring clip repeats, mute and solo. */
export function expandProject(project, {ignoreMixer = false} = {}) {
  const soloed = project.tracks.some(t => t.solo),
    tracks = new Map(project.tracks.map(t => [t.id, t])),
    out = [];
  for (const clip of project.clips) {
    const track = tracks.get(clip.trackId);
    if (!ignoreMixer && (track.mute || (soloed && !track.solo))) continue;
    for (let r = 0; r < clip.repeat; r++) {
      const base = clip.startTick + r * clip.lengthTick;
      for (const e of clip.events)
        out.push({
          occId: `${e.id}#${r}`,
          eventId: e.id,
          trackId: clip.trackId,
          clipId: clip.id,
          repeatIndex: r,
          startTick: base + e.startTick,
          endTick: base + e.startTick + e.durationTick,
          velocity: Math.min(127, Math.max(1, Math.round(e.velocity * track.level))),
          tones: e.tones
        });
    }
  }
  return out.sort(byStart);
}

/** Metronome occurrences: one click per beat of [0, end), each tone naming its accent. */
export function clickOccurrences(project, end) {
  const beat = beatTicks(project.meter),
    out = [];
  for (let i = 0; i * beat < end; i++) {
    const level = beatAccent(project.meter, i % project.meter.numerator);
    out.push({
      occId: `click#${i}`,
      eventId: null,
      trackId: null,
      clipId: null,
      repeatIndex: 0,
      startTick: i * beat,
      endTick: i * beat + 1,
      velocity: CLICK[level].velocity,
      tones: [{toneId: level, click: level}]
    });
  }
  return out;
}

export function createPlan(project, {click = false} = {}) {
  const end = contentEndTick(project),
    occurrences = click
      ? [...expandProject(project), ...clickOccurrences(project, end)].sort(byStart)
      : expandProject(project);
  const l = project.loop,
    start = l.startTick,
    stop = l.endTick ?? end;
  return {
    occurrences,
    starts: occurrences.map(o => o.startTick),
    end,
    loop: {enabled: l.enabled && stop > start, start, end: stop}
  };
}

function lowerBound(arr, x) {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Occurrences that must be started for the virtual-tick window [loV, hiV), given the
 * play start `pos0`. A note that crosses the loop end is released at the boundary; the
 * next iteration retriggers only notes that start inside the loop. With `includeCrossing`
 * (play, resume, seek) notes already sounding at `pos0` restart with their remaining length.
 */
export function planWindow(plan, {pos0, loV, hiV, includeCrossing = false}) {
  const {occurrences: occ, starts, loop, end} = plan,
    voices = [];
  const emit = (o, Vs, a, b, cycle) => {
    const onset = Math.max(o.startTick, a),
      release = Math.min(o.endTick, b);
    voices.push({
      occId: o.occId,
      eventId: o.eventId,
      trackId: o.trackId,
      cycle,
      tones: o.tones,
      velocity: o.velocity,
      onsetV: Vs + (onset - a),
      releaseV: Vs + (release - a)
    });
  };
  const segment = (Vs, a, b, cycle) => {
    const ov0 = Math.max(loV, Vs),
      ov1 = Math.min(hiV, Vs + (b - a));
    if (ov0 >= ov1) return;
    const ra = a + (ov0 - Vs),
      rb = a + (ov1 - Vs);
    if (includeCrossing && cycle === 0 && ov0 === pos0) {
      for (let i = 0, n = lowerBound(starts, ra); i < n; i++)
        if (occ[i].endTick > ra) emit(occ[i], Vs, a, b, cycle);
    }
    for (let i = lowerBound(starts, ra); i < occ.length && starts[i] < rb; i++)
      emit(occ[i], Vs, a, b, cycle);
  };
  if (!loop.enabled) {
    segment(pos0, pos0, end, 0);
    return voices;
  }
  const len = loop.end - loop.start;
  if (pos0 < loop.end) segment(pos0, pos0, loop.end, 0);
  if (hiV > loop.end) {
    const first = Math.max(1, Math.floor((loV - loop.end) / len) + 1),
      last = Math.floor((hiV - 1 - loop.end) / len) + 1;
    for (let j = first; j <= last; j++) segment(loop.end + (j - 1) * len, loop.start, loop.end, j);
  }
  return voices;
}

export function createTransport({
  getProject,
  audio,
  timer = {set: (fn, ms) => setInterval(fn, ms), clear: id => clearInterval(id)},
  onState = () => {},
  lookahead = LOOKAHEAD_SECONDS,
  // True while the metronome should click with playback.
  getClick = () => false
}) {
  let state = 'stopped',
    position = 0,
    project = null,
    plan = null,
    pos0 = 0,
    anchorAudio = 0,
    anchorClock = 0,
    scheduledV = 0,
    includeCrossing = false,
    timerId = null,
    token = 0;
  // Cancel tokens of scheduled voices with their onsets, so a live edit can replace the ones not yet
  // sounding. Count-in clicks are marked so an edit during the count-in keeps them.
  let pending = [],
    countFrom = 0;
  let runOptions = {untilTick: null, graceMs: GRACE_SECONDS * 1000},
    preparing = false;

  const tps = () => (project.tempo * PPQ) / 60;
  const emit = (event, detail) => onState(event, detail);
  const bounded = () => runOptions.untilTick !== null;
  function refreshPlan() {
    plan = createPlan(project, {click: getClick()});
    if (bounded()) {
      plan.loop.enabled = false;
      plan.end = runOptions.untilTick;
    }
  }

  function realTick(v) {
    if (plan.loop.enabled && v >= plan.loop.end) {
      const len = plan.loop.end - plan.loop.start;
      return plan.loop.start + ((v - plan.loop.end) % len);
    }
    return Math.min(v, plan.end);
  }
  function currentTick() {
    if (state !== 'playing') return position;
    const snap = audio.getClockSnapshot(),
      v = Math.floor(pos0 + (snap.audioSeconds - anchorAudio) * tps());
    return v <= pos0 ? pos0 : realTick(v);
  }
  function clearTimer() {
    if (timerId !== null) {
      timer.clear(timerId);
      timerId = null;
    }
  }
  function halt(reason, newState = 'paused') {
    position = currentTickSafe();
    token++;
    clearTimer();
    audio.cancelGroup(GROUP);
    pending = [];
    state = newState;
    emit(reason, {tick: position});
  }
  // Position even if the clock is no longer running (suspended context freezes it).
  function currentTickSafe() {
    try {
      return currentTick();
    } catch {
      return position;
    }
  }

  function pump() {
    if (state !== 'playing') return;
    const snap = audio.getClockSnapshot();
    if (snap.state !== 'running' || snap.clockRevision !== anchorClock) {
      halt('suspended');
      return;
    }
    const rate = tps(),
      nowV = pos0 + (snap.audioSeconds - anchorAudio) * rate;
    const heard = heardSeconds(snap),
      heardV = pos0 + (heard - anchorAudio) * rate;
    const completionV = bounded() ? heardV : nowV;
    if (!plan.loop.enabled && completionV >= plan.end + (runOptions.graceMs / 1000) * rate - 1e-6) {
      token++;
      clearTimer();
      audio.cancelGroup(GROUP);
      pending = [];
      position = 0;
      state = 'stopped';
      emit('ended', {tick: plan.end, v: heardV, seconds: heard, tps: rate});
      return;
    }
    const hiV = Math.floor(nowV + lookahead * rate) + 1;
    let loV = scheduledV,
      resynced = false;
    // Never replay what a throttled timer missed: skip it and carry on from "now".
    const floor = Math.ceil(nowV - GRACE_SECONDS * rate);
    if (loV < floor) {
      loV = floor;
      resynced = true;
    }
    if (hiV > loV) {
      const voices = planWindow(plan, {
        pos0,
        loV,
        hiV,
        includeCrossing: includeCrossing && loV === pos0
      });
      includeCrossing = false;
      const ctx = project.context,
        list = [],
        clicks = [];
      for (const v of voices) {
        const onset = anchorAudio + (v.onsetV - pos0) / rate,
          release = anchorAudio + (v.releaseV - pos0) / rate;
        for (const tone of v.tones) {
          if (tone.click) {
            clicks.push({
              voiceId: `${v.occId}:${v.cycle}`,
              cents: CLICK[tone.click].cents,
              onsetAudioSeconds: onset,
              releaseAudioSeconds: bounded()
                ? Math.min(onset + CLICK.seconds, anchorAudio + (plan.end - pos0) / rate)
                : onset + CLICK.seconds,
              velocity: v.velocity,
              chordSize: 1
            });
            continue;
          }
          list.push({
            voiceId: `${v.occId}:${tone.toneId}:${v.cycle}`,
            cents: resolveTone(ctx, tone.coordinate).cents,
            onsetAudioSeconds: onset,
            releaseAudioSeconds: release,
            velocity: v.velocity,
            chordSize: v.tones.length
          });
        }
      }
      pending = pending.filter(p => p.release > snap.audioSeconds);
      schedule(list);
      schedule(clicks, CLICK.settings);
    }
    scheduledV = Math.max(scheduledV, hiV);
    if (resynced) emit('resync', {skippedTo: floor});
  }

  function schedule(list, settings, countIn = false) {
    if (!list.length) return;
    const tokens = audio.scheduleVoices(list, {groupId: GROUP, ...(settings ? {settings} : {})}),
      byId = new Map(list.map(v => [v.voiceId, v]));
    if (Array.isArray(tokens))
      for (const t of tokens) {
        const v = byId.get(t.voiceId);
        if (v)
          pending.push({
            cancel: t.cancel,
            onset: v.onsetAudioSeconds,
            release: v.releaseAudioSeconds,
            countIn
          });
      }
  }

  /** Count-in bars precede playback. A finite absolute `untilTick` bounds audio to [position, tick);
   * playback ends `graceMs` of heard time after it. Bare resume keeps bounds. */
  async function play(options = {}) {
    if (state === 'playing') return;
    const {countIn = 0, untilTick = runOptions.untilTick, graceMs = runOptions.graceMs} = options;
    runOptions = {
      untilTick: Number.isFinite(untilTick) ? Math.max(0, Math.floor(untilTick)) : null,
      graceMs: Number.isFinite(graceMs) ? Math.max(0, graceMs) : GRACE_SECONDS * 1000
    };
    const mine = ++token;
    preparing = true;
    try {
      await audio.prepare();
    } catch (error) {
      if (mine === token) {
        preparing = false;
        emit('error', {error});
      }
      return;
    }
    if (mine !== token) return; // stopped, paused or seeked while the audio context was resuming
    preparing = false;
    project = getProject();
    refreshPlan();
    let p = position;
    if (!bounded() && (plan.loop.enabled ? p >= plan.loop.end : p >= plan.end))
      p = plan.loop.enabled ? plan.loop.start : 0;
    if (bounded()) p = Math.min(p, plan.end);
    const snap = audio.getClockSnapshot();
    if (snap.state !== 'running') {
      emit('error', {error: new Error('Audio is not running.')});
      return;
    }
    const bars = Math.max(0, Math.round(countIn) || 0),
      beat = beatTicks(project.meter) / tps();
    countFrom = snap.audioSeconds + START_DELAY_SECONDS;
    pos0 = p;
    anchorAudio = countFrom + (bars * barTicks(project.meter)) / tps();
    anchorClock = snap.clockRevision;
    scheduledV = pos0;
    includeCrossing = true;
    state = 'playing';
    pending = [];
    timerId = timer.set(pump, PUMP_MS);
    if (bars)
      schedule(
        Array.from({length: bars * project.meter.numerator}, (_, k) => {
          const level = beatAccent(project.meter, k % project.meter.numerator),
            onset = countFrom + k * beat;
          return {
            voiceId: `count#${k}`,
            cents: CLICK[level].cents,
            onsetAudioSeconds: onset,
            releaseAudioSeconds: bounded()
              ? Math.min(onset + CLICK.seconds, anchorAudio + (plan.end - pos0) / tps())
              : onset + CLICK.seconds,
            velocity: CLICK[level].velocity,
            chordSize: 1
          };
        }),
        CLICK.settings,
        true
      );
    emit('playing', {tick: pos0, countIn: bars});
    pump();
  }
  /** During a count-in, the beat being counted ({beat, beats}, from 1); otherwise null. */
  function countingIn() {
    if (state !== 'playing' || !project) return null;
    const now = audio.getClockSnapshot().audioSeconds;
    if (!(now < anchorAudio)) return null;
    const beat = beatTicks(project.meter) / tps(),
      beats = Math.round((anchorAudio - countFrom) / beat);
    return beats
      ? {beat: Math.max(1, Math.min(beats, Math.floor((now - countFrom) / beat) + 1)), beats}
      : null;
  }
  /**
   * What the listener hears at `performanceMs` (performance.now() clock; default now): the
   * arrangement tick, its unrounded position `v` (ticks from the play start, increasing across
   * loop passes), that audio time, the ticks left before playback wraps (loop end) or ends, and the
   * tempo in ticks per second. During a count-in `countIn` is true and `early` is the time left
   * before the downbeat.
   */
  function timeAt(performanceMs) {
    const snap = audio.getClockSnapshot(),
      seconds = heardSeconds(snap, performanceMs);
    if (state !== 'playing' || !plan)
      return {
        tick: position,
        v: position,
        seconds,
        room: Infinity,
        tps: 0,
        countIn: false,
        early: 0
      };
    const rate = tps(),
      v = pos0 + (seconds - anchorAudio) * rate,
      room = t =>
        plan.loop.enabled && t < plan.loop.end ? plan.loop.end - t : Math.max(1, plan.end - t);
    if (seconds < anchorAudio)
      return {
        tick: pos0,
        v,
        seconds,
        room: room(pos0),
        tps: rate,
        countIn: true,
        early: anchorAudio - seconds
      };
    // A millionth of a tick absorbs float error, so an exact position is not floored a tick early.
    const tick = realTick(Math.max(pos0, Math.floor(v + 1e-6)));
    return {tick, v, seconds, room: room(tick), tps: rate, countIn: false, early: 0};
  }

  function pause() {
    if (state !== 'playing' && !preparing) return;
    preparing = false;
    halt('paused');
  }
  function stop() {
    token++;
    preparing = false;
    clearTimer();
    audio.cancelGroup(GROUP);
    pending = [];
    runOptions = {untilTick: null, graceMs: GRACE_SECONDS * 1000};
    const was = state;
    position = 0;
    state = 'stopped';
    if (was !== 'stopped') emit('stopped', {tick: 0});
  }
  async function seek(tick) {
    const wasPlaying = state === 'playing';
    token++;
    preparing = false;
    clearTimer();
    audio.cancelGroup(GROUP);
    pending = [];
    position = Math.max(0, Math.floor(tick));
    if (wasPlaying) {
      state = 'paused';
      await play();
    }
  }
  /**
   * A project edit (notes, tempo, loop): playback carries on with the edited project from where it
   * is. Voices that have not started are replaced; notes already sounding finish as scheduled, and
   * edited notes that cross the playhead are heard from their next start. Stopped or paused, the
   * next play uses the new project.
   */
  function invalidate() {
    if (state !== 'playing') {
      plan = null;
      return;
    }
    const snap = audio.getClockSnapshot();
    if (snap.state !== 'running' || snap.clockRevision !== anchorClock) {
      halt('suspended');
      return;
    }
    // Still counting in: keep the count and its downbeat, and replace what was planned after it.
    if (snap.audioSeconds < anchorAudio) {
      for (const p of pending) if (!p.countIn) p.cancel();
      pending = pending.filter(p => p.countIn);
      project = getProject();
      refreshPlan();
      scheduledV = pos0;
      includeCrossing = true;
      pump();
      return;
    }
    const tick = currentTick();
    for (const p of pending) if (p.onset > snap.audioSeconds) p.cancel();
    pending = pending.filter(p => p.onset <= snap.audioSeconds && p.release > snap.audioSeconds);
    project = getProject();
    refreshPlan();
    // Notes starting at or before the playhead tick are already sounding; reschedule from the next tick.
    let p = tick,
      from = tick + 1;
    if (plan.loop.enabled && p >= plan.loop.end) {
      p = plan.loop.start;
      from = p;
    }
    pos0 = p;
    anchorAudio = snap.audioSeconds;
    scheduledV = from;
    includeCrossing = false;
    pump();
  }

  return {
    play,
    pause,
    stop,
    seek,
    pump,
    invalidate,
    dispose: stop,
    countingIn,
    timeAt,
    get state() {
      return state;
    },
    position: currentTick
  };
}
