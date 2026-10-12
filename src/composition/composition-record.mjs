// Entering notes from the HexBoard. Pure reducers over the board player's hold events (onInput:
// one 'down' and one 'up' per hold, with a holdId and the coordinate captured at onset), so the
// screen board, the computer keyboard and the physical HexBoard all enter notes the same way.
//
// Recording: each event carries what the listener heard when it happened (the transport's
// timeAt), so timing is deterministic. A note starts on the tick heard at key-down and lasts the
// audio time it was held at the tempo then playing; it ends where playback wraps (loop end) or
// ends. Presses during a count-in are dropped, except presses just before the downbeat, which
// start on it. Holds are keyed by holdId: two keys with the same pitch, or two sources, never cut
// each other, and Shift sustain (which delays the 'up') records the length that sounded.

export const EARLY_SECONDS = 0.12; // a press this close before the downbeat starts on it
export const CHORD_SECONDS = 0.12; // recorded notes starting this close together form one chord

export function createTake({early = EARLY_SECONDS} = {}) {
  const open = new Map(),
    notes = [];
  const close = (o, seconds) => ({
    coordinate: [...o.coordinate],
    startTick: o.tick,
    startSeconds: o.seconds,
    durationTick: Math.max(
      1,
      Math.min(o.room, Math.round(Math.max(0, seconds - o.seconds) * o.tps))
    )
  });
  const order = (a, b) => a.startSeconds - b.startSeconds || a.startTick - b.startTick;
  return {
    /** Starts a held note; false when it is ignored (no tempo, a repeat, or too early in the count-in). */
    down(holdId, coordinate, at) {
      if (open.has(holdId) || !(at?.tps > 0) || !Array.isArray(coordinate)) return false;
      if (at.countIn && !(at.early <= early)) return false;
      open.set(holdId, {
        coordinate: [...coordinate],
        tick: at.tick,
        seconds: at.countIn ? at.seconds + at.early : at.seconds,
        room: at.room,
        tps: at.tps
      });
      return true;
    },
    /** Ends a held note; null for a hold this take never started. */
    up(holdId, at) {
      const o = open.get(holdId);
      if (!o) return null;
      open.delete(holdId);
      const note = close(o, at.seconds);
      notes.push(note);
      return note;
    },
    /** Ends every held note at `at` and returns the take's notes in played order. */
    finish(at) {
      for (const o of open.values()) notes.push(close(o, at.seconds));
      open.clear();
      return notes.slice().sort(order);
    },
    /** The notes so far, held ones drawn up to `at`, for showing a take while it records. */
    preview(at) {
      return [...notes, ...[...open.values()].map(o => ({...close(o, at.seconds), open: true}))];
    },
    get size() {
      return notes.length + open.size;
    }
  };
}

/**
 * Notes started together (within `window` seconds of a group's first note) as chords: the earliest
 * start, the latest end and each pitch once, lowest first by `cents`.
 */
export function groupChords(notes, {window = CHORD_SECONDS, cents = () => 0} = {}) {
  const groups = [];
  for (const n of [...notes].sort((a, b) => a.startSeconds - b.startSeconds)) {
    const g = groups.at(-1);
    if (g && n.startSeconds - g.startSeconds <= window) g.notes.push(n);
    else groups.push({startSeconds: n.startSeconds, notes: [n]});
  }
  return groups.map(g => {
    const unique = [
      ...new Map(g.notes.map(n => [n.coordinate.join(','), n.coordinate])).values()
    ].sort((a, b) => cents(a) - cents(b));
    return {
      startTick: Math.min(...g.notes.map(n => n.startTick)),
      endTick: Math.max(...g.notes.map(n => n.startTick + n.durationTick)),
      coordinates: unique
    };
  });
}

/**
 * Step entry's unit: keys held together, collected until every one is released. `up` returns the
 * pitches (each once, in pressing order) when the last key of the group comes up, otherwise null.
 */
export function createHoldGroup() {
  let holds = new Set(),
    pitches = new Map();
  return {
    down(holdId, coordinate) {
      holds.add(holdId);
      if (Array.isArray(coordinate)) pitches.set(coordinate.join(','), [...coordinate]);
    },
    up(holdId) {
      if (!holds.delete(holdId) || holds.size) return null;
      const out = [...pitches.values()];
      pitches = new Map();
      return out;
    },
    cancel() {
      holds = new Set();
      pitches = new Map();
    },
    get pending() {
      return [...pitches.values()];
    },
    get active() {
      return holds.size > 0;
    }
  };
}
