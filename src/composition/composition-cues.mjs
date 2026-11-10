// Semantic cue timeline: what a composition asks a player to play, when, and where
// on the current layout. Audio, playhead, board highlights and practice/rhythm modes
// all read this one timeline. It carries no scoring or timing engine: judging belongs
// to whichever input adapter (virtual board, physical HexBoard) consumes it.
import {buildBoard} from '../hexboard/hexboard.mjs';
import {ticksToSeconds, PPQ} from './composition-project.mjs';
import {expandProject} from './composition-transport.mjs';
import {resolveTone, degreeOf} from './composition-context.mjs';

export const PRACTICE_FORMAT = 'temperament-lab-practice-targets-v1';
export const MATCH_MODES = ['exact-coordinate', 'any-degree', 'button'];

/**
 * Read-only view of the layout's playable keys for the project's own context.
 * `key.m` is already the final sounding coordinate (wrapped registers included), so
 * a coordinate may have several cells; none is the pitch's identity. A cell's degree is
 * its own coordinate's, as presses are judged: an equal-step key that only sounds a
 * degree's pitch class (G♯ for A♭ in 12 EDO) has none, whatever the board labels it.
 */
export function boardSnapshot(project) {
  if (!project.layout)
    return {
      status: 'no-layout',
      reason: 'This composition has no saved layout, so keys cannot be suggested. It still plays.',
      cells: []
    };
  let board;
  try {
    board = buildBoard(project.context.state, project.layout);
  } catch (error) {
    return {
      status: 'unavailable',
      reason: `The saved layout cannot be built: ${error.message}`,
      cells: []
    };
  }
  const cells = board.keys
    .filter(k => k.enabled && !k.command)
    .map(k => {
      const coordinate = [k.m[0] === 0 ? 0 : k.m[0], k.m[1] === 0 ? 0 : k.m[1]];
      return {
        index: k.index,
        coordinate,
        degree: degreeOf(project.context, coordinate)?.degree ?? -1
      };
    });
  return {status: 'ok', cells};
}

const coordKey = m => `${m[0]},${m[1]}`;
function indexSnapshot(snapshot) {
  const exact = new Map(),
    byDegree = new Map();
  for (const c of snapshot.cells) {
    const k = coordKey(c.coordinate);
    if (!exact.has(k)) exact.set(k, []);
    exact.get(k).push(c.index);
    if (c.degree >= 0) {
      if (!byDegree.has(c.degree)) byDegree.set(c.degree, []);
      byDegree.get(c.degree).push(c.index);
    }
  }
  return {exact, byDegree};
}

/** Cues for one pass of the arrangement (loop and repeat expansion included, loop wrap excluded). */
export function buildCueTimeline(
  project,
  snapshot = boardSnapshot(project),
  {ignoreMixer = true} = {}
) {
  const index = indexSnapshot(snapshot),
    kinds = new Map(project.tracks.map(t => [t.id, t.kind])),
    cues = [];
  for (const o of expandProject(project, {ignoreMixer})) {
    for (const tone of o.tones) {
      const {cents, hz} = resolveTone(project.context, tone.coordinate),
        d = degreeOf(project.context, tone.coordinate);
      const cells = index.exact.get(coordKey(tone.coordinate)) ?? [];
      cues.push({
        cueId: `${o.occId}:${tone.toneId}`,
        occurrenceId: o.occId,
        eventId: o.eventId,
        toneId: tone.toneId,
        trackId: o.trackId,
        trackKind: kinds.get(o.trackId),
        chordSize: o.tones.length,
        onsetTick: o.startTick,
        releaseTick: o.endTick,
        onsetSeconds: ticksToSeconds(project, o.startTick),
        durationSeconds: ticksToSeconds(project, o.endTick - o.startTick),
        coordinate: [...tone.coordinate],
        cents,
        hz,
        degree: d ? d.degree : null,
        register: d ? d.register : null,
        cells,
        cellStatus: cells.length
          ? 'ok'
          : snapshot.status === 'ok'
            ? 'none-on-layout'
            : snapshot.status,
        cellNote: cells.length
          ? ''
          : snapshot.status === 'ok'
            ? 'No key on this layout plays this exact pitch. It still sounds.'
            : snapshot.reason,
        degreeCells: d && snapshot.status === 'ok' ? (index.byDegree.get(d.degree) ?? []) : []
      });
    }
  }
  return cues.sort(
    (a, b) => a.onsetTick - b.onsetTick || (a.cueId < b.cueId ? -1 : a.cueId > b.cueId ? 1 : 0)
  );
}

/**
 * Cues sounding at `tick` and the next group of cues that will start after it.
 * Release is exclusive: a note ending at `tick` is no longer sounding.
 */
export function activeCues(timeline, tick) {
  const sounding = timeline.filter(c => c.onsetTick <= tick && tick < c.releaseTick);
  let next = Infinity;
  for (const c of timeline) if (c.onsetTick > tick && c.onsetTick < next) next = c.onsetTick;
  return {
    sounding,
    upcoming: Number.isFinite(next) ? timeline.filter(c => c.onsetTick === next) : [],
    nextTick: Number.isFinite(next) ? next : null
  };
}

/**
 * Neutral hand-off for a practice or rhythm mode. Preserves rhythm, durations, exact
 * coordinates and the context needed to re-resolve pitch, and states how a played note
 * must match a target. It does not score anything.
 */
export function toPracticeTargets(
  project,
  snapshot = boardSnapshot(project),
  {matchMode = 'exact-coordinate', trackKinds = null, ignoreMixer = true} = {}
) {
  if (!MATCH_MODES.includes(matchMode))
    throw new Error(`Practice targets: matchMode must be one of ${MATCH_MODES.join(', ')}.`);
  const c = project.context;
  const timeline = buildCueTimeline(project, snapshot, {ignoreMixer}).filter(
    q => !trackKinds || trackKinds.includes(q.trackKind)
  );
  return {
    format: PRACTICE_FORMAT,
    source: {projectId: project.id, projectName: project.name, revision: project.revision},
    matchMode,
    context: {
      name: c.name,
      basis: [...c.basis],
      rows: c.rows.map(r => [...r]),
      p: c.p,
      g: c.g,
      tonicHz: c.tonicHz,
      tuning: structuredClone(c.tuning),
      scale: {n: c.scale.n, mode: c.scale.mode}
    },
    layout: project.layout ? structuredClone(project.layout) : null,
    timing: {
      ppq: PPQ,
      tempo: project.tempo,
      meter: {...project.meter},
      loop: structuredClone(project.loop)
    },
    targets: timeline.map(q => ({
      id: q.cueId,
      groupId: q.occurrenceId,
      trackKind: q.trackKind,
      onsetTick: q.onsetTick,
      durationTick: q.releaseTick - q.onsetTick,
      onsetSeconds: q.onsetSeconds,
      durationSeconds: q.durationSeconds,
      coordinate: q.coordinate,
      degree: q.degree,
      register: q.register,
      cents: q.cents,
      hz: q.hz,
      cells: matchMode === 'any-degree' ? q.degreeCells : q.cells,
      ...(matchMode === 'button' ? {button: q.cells.length ? Math.min(...q.cells) : null} : {}),
      cellStatus: q.cellStatus
    }))
  };
}
