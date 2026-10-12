// Fingering practice: the player picks a chord, then plays each of its fingerings on the
// board, one at a time; the next fingering lights up as soon as the current one is played.
// Pure state machine: it is told which keys are held and asks the host to light a fingering.
// Nothing here knows about the DOM, audio or the board hardware.

const COUNT_CHOICES = [3, 5, 10];

/** Offered game lengths for a chord with `available` fingerings, ending with "all". */
export function countOptions(available) {
  const out = COUNT_CHOICES.filter(n => n < available);
  out.push(available);
  return out;
}

const sameKeys = (a, b) =>
  Array.isArray(a) && a.length === b.length && a.every((k, i) => k === b[i]);

export function createFingeringGame({
  getFingerings,
  showFingering,
  now = () => Date.now(),
  onChange = () => {}
}) {
  let phase = 'idle',
    queue = [],
    position = 0,
    label = '',
    total = 0,
    original = -1;
  let armed = false,
    busy = false,
    lastHeld = new Set(),
    mistakes = 0,
    skipped = 0,
    startedAt = 0,
    endedAt = 0,
    message = '',
    played = 0,
    wrongNow = new Set();

  const current = () => queue[position] ?? null;
  const snapshot = () => ({
    phase,
    label,
    total,
    position,
    played,
    mistakes,
    skipped,
    message,
    armed,
    target: phase === 'playing' ? [...current().keys] : [],
    index: phase === 'playing' ? current().index : -1,
    seconds: phase === 'idle' ? 0 : ((phase === 'playing' ? now() : endedAt) - startedAt) / 1000
  });
  const emit = () => onChange(snapshot());

  // The game's chord is still on the board when it has the same name and every fingering in the
  // game still has the same keys at the same place in the list (a layout change moves them).
  const unchanged = f =>
    !!f &&
    f.label === label &&
    f.placements.length >= total &&
    queue.every(q => sameKeys(f.placements[q.index]?.keys, q.keys));

  /** Begins a game over the first `count` fingerings of the chord now on the board. */
  function start({count} = {}) {
    const f = getFingerings();
    if (!f || !f.placements.length) {
      message = 'Select a chord on the Play board first.';
      emit();
      return false;
    }
    const n = Math.max(1, Math.min(count ?? f.placements.length, f.placements.length));
    queue = f.placements.slice(0, n).map((p, index) => ({index, keys: [...p.keys]}));
    label = f.label;
    total = n;
    position = 0;
    played = 0;
    mistakes = 0;
    skipped = 0;
    message = '';
    original = f.index;
    wrongNow = new Set();
    startedAt = now();
    endedAt = 0;
    phase = 'playing';
    light(current().index);
    armed = lastHeld.size === 0;
    emit();
    return true;
  }

  function light(index) {
    busy = true;
    try {
      showFingering(index);
    } finally {
      busy = false;
    }
  }

  // Puts back the fingering that was lit before the game, unless the chord itself has gone or
  // changed: then the board already shows what the player chose, and that is left alone.
  function restore() {
    if (unchanged(getFingerings())) light(original);
  }

  function advance() {
    position++;
    if (position >= queue.length) {
      phase = 'done';
      endedAt = now();
      message = '';
      restore();
      return;
    }
    light(current().index);
    // Keys still held from the last fingering must be lifted before the next one counts.
    armed = lastHeld.size === 0;
  }

  /** Tell the game which board keys are held right now (a Set of key indices). */
  function onHeld(held) {
    lastHeld = new Set(held);
    if (busy || phase !== 'playing') return;
    if (!armed) {
      if (lastHeld.size === 0) {
        armed = true;
        message = '';
        emit();
      }
      return;
    }
    const target = new Set(current().keys),
      wrong = [...lastHeld].filter(k => !target.has(k));
    for (const k of wrong)
      if (!wrongNow.has(k)) {
        wrongNow.add(k);
        mistakes++;
        message = 'That key is not part of this fingering.';
      }
    for (const k of [...wrongNow]) if (!lastHeld.has(k)) wrongNow.delete(k);
    const complete = !wrong.length && [...target].every(k => lastHeld.has(k));
    if (complete) {
      played++;
      message = '';
      wrongNow = new Set();
      advance();
    }
    emit();
  }

  function skip() {
    if (phase !== 'playing') return;
    skipped++;
    message = '';
    wrongNow = new Set();
    advance();
    emit();
  }

  function end(reason) {
    phase = 'idle';
    queue = [];
    message = reason;
    wrongNow = new Set();
    emit();
  }

  /** Ends the game (or abandons it) and puts the board's highlight back as it was. */
  function stop(reason = '') {
    if (phase === 'playing') restore();
    end(reason);
  }

  /** Called regularly: keeps the board on the target fingering and ends the game if the chord changed. */
  function check() {
    if (phase !== 'playing') return;
    const f = getFingerings();
    if (!f) {
      end('The highlight was cleared, so the game stopped.');
      return;
    }
    if (!unchanged(f)) {
      end('The chord or layout changed, so the game stopped.');
      return;
    }
    if (f.index !== current().index) light(current().index);
  }

  return {
    start,
    onHeld,
    skip,
    stop,
    check,
    state: snapshot,
    get active() {
      return phase === 'playing';
    }
  };
}
