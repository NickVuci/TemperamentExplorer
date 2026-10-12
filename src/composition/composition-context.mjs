// Musical context of a composition: the temperament, resolved tuning, tonic and
// the Create scale, frozen when the project is made. Pitches are stored as exact
// integer coordinates; cents and Hz are derived here with the app's own helpers.
import {scale} from '../core/engine.mjs';
import {coordinateCents, noteCoordinate} from '../core/pitch.mjs';
import {frequencyFor} from '../ui/audio.mjs';

export const CONTEXT_VERSION = 1;
export const TONIC_MIN = 40,
  TONIC_MAX = 1000;
const isInt = Number.isSafeInteger;
const fail = (path, message) => {
  throw new Error(`Composition context: ${path}: ${message}`);
};

/** Same identity material-ui.mjs uses to decide whether a collected item matches the tuning. */
export const tuningKey = s => JSON.stringify([s.basis, s.rows, s.p, s.g]);

/**
 * Snapshot of `state` (the temperament/tuning/scale the player is using in Create)
 * and a tonic. Includes the complete state so the project reopens without re-tuning.
 */
export function captureContext(state, tonicHz) {
  if (!(tonicHz >= TONIC_MIN && tonicHz <= TONIC_MAX))
    fail('tonicHz', `expected ${TONIC_MIN}-${TONIC_MAX} Hz`);
  const target = scale(state);
  if (target.collision)
    fail(
      'scale',
      'the selected scale has pitch collisions; choose a smaller scale before composing'
    );
  return {
    version: CONTEXT_VERSION,
    name: state.name,
    basis: [...state.basis],
    rows: state.rows.map(r => [...r]),
    p: state.p,
    g: state.g,
    tuning: {
      method: state.tuning ?? null,
      config: state.tuneConfig === undefined ? null : structuredClone(state.tuneConfig)
    },
    tonicHz,
    scale: {
      n: state.n,
      mode: state.mode,
      degrees: target.notes.map((note, degree) => ({
        degree,
        coordinate: noteCoordinate(state, note).map(v => (v === 0 ? 0 : v))
      }))
    },
    state: structuredClone(state)
  };
}

export function validateContext(c) {
  if (!c || typeof c !== 'object') fail('context', 'expected an object');
  if (c.version !== CONTEXT_VERSION) fail('version', `expected ${CONTEXT_VERSION}`);
  if (!Array.isArray(c.basis) || c.basis.length < 2 || !c.basis.every(isInt))
    fail('basis', 'expected an ordered list of integers');
  if (
    !Array.isArray(c.rows) ||
    c.rows.length !== 2 ||
    c.rows.some(r => !Array.isArray(r) || r.length !== c.basis.length || !r.every(isInt))
  )
    fail('rows', 'expected two integer rows matching the basis');
  if (!(typeof c.p === 'number' && Number.isFinite(c.p) && c.p > 0))
    fail('p', 'expected a positive number');
  if (typeof c.g !== 'number' || !Number.isFinite(c.g)) fail('g', 'expected a finite number');
  if (!(typeof c.tonicHz === 'number' && c.tonicHz >= TONIC_MIN && c.tonicHz <= TONIC_MAX))
    fail('tonicHz', `expected ${TONIC_MIN}-${TONIC_MAX} Hz`);
  const s = c.scale;
  if (!s || !isInt(s.n) || !isInt(s.mode) || !Array.isArray(s.degrees) || !s.degrees.length)
    fail('scale', 'expected {n, mode, degrees[]}');
  s.degrees.forEach((d, i) => {
    if (
      d.degree !== i ||
      !Array.isArray(d.coordinate) ||
      d.coordinate.length !== 2 ||
      !d.coordinate.every(isInt)
    )
      fail(`scale.degrees[${i}]`, 'expected {degree, coordinate:[int,int]} in order');
  });
  if (!c.state || typeof c.state !== 'object')
    fail('state', 'expected the saved temperament state');
  if (tuningKey(c.state) !== tuningKey(c))
    fail('state', 'saved state does not match the context mapping/tuning');
  return c;
}

export const resolveTone = (ctx, coordinate) => {
  const cents = coordinateCents(ctx, coordinate);
  return {cents, hz: frequencyFor(cents, ctx.tonicHz)};
};

/**
 * Scale degree of a coordinate and its period displacement from that degree's
 * home coordinate, or null when the pitch is outside the scale. Exact integers only.
 */
export function degreeOf(ctx, coordinate) {
  for (const d of ctx.scale.degrees)
    if (d.coordinate[1] === coordinate[1])
      return {degree: d.degree, register: coordinate[0] - d.coordinate[0]};
  return null;
}

/** True when the app is currently set to the project's tuning, scale and mode. */
export function matchesApp(ctx, state) {
  return (
    tuningKey(ctx) === tuningKey(state) && ctx.scale.n === state.n && ctx.scale.mode === state.mode
  );
}

/**
 * The voice of a harmonic selection that sounds its root: the shape's first member, the lowest note of the
 * chord's default rotation. Voices follow the collected coordinates; when none matches, the first is the root.
 */
export function selectionRootTone(selection, count) {
  const id = selection?.shape?.members?.[0]?.memberId ?? 'member:0',
    voices = selection?.voicing?.voices;
  const i =
    Array.isArray(voices) && voices.length === count
      ? voices.findIndex(v => v?.memberId === id)
      : -1;
  return i >= 0 ? i : 0;
}

/**
 * Builds a chord event from a collected chord, copying its exact coordinates and any
 * provenance. Items collected in another tuning are rejected rather than retuned.
 */
export function materialToChordEvent(ctx, item, {startTick, durationTick, velocity = 90}) {
  if (!item || item.kind !== 'chord')
    throw new Error('Composition context: only collected chords can be added to the chord track.');
  if (tuningKey(item.state) !== tuningKey(ctx)) {
    throw new Error(
      `Composition context: "${item.label}" was collected in ${item.state.name} with a different tuning than this composition (${ctx.name}). Load that tuning or collect the chord again.`
    );
  }
  return {
    startTick,
    durationTick,
    velocity,
    tones: item.coords.map(m => ({coordinate: [m[0] === 0 ? 0 : m[0], m[1] === 0 ? 0 : m[1]]})),
    source: {
      kind: 'collection',
      label: item.label,
      ...(item.harmonicSelection
        ? {rootTone: selectionRootTone(item.harmonicSelection, item.coords.length)}
        : {}),
      ...(item.exact ? {exact: true} : {}),
      ...(item.harmonicSelection
        ? {harmonicSelection: structuredClone(item.harmonicSelection)}
        : {})
    }
  };
}
