// Test and profiling harness: one exact chord's identity, projection and occurrences,
// composed from the production chord modules. The app calls those modules directly.
import {chordIdentity} from '../../src/chords/chord-identity.mjs';
import {projectChord} from '../../src/chords/chord-projection.mjs';
import {searchOccurrences} from '../../src/chords/chord-occurrence.mjs';
import {MAX_SCALE_SIZE} from '../../src/core/engine.mjs';
import {BoundedCache, immutable} from '../../src/core/cache.mjs';

const cache = new BoundedCache(64);
export function analyzeChord(s, text, {tolerance = 10, larger = false} = {}) {
  const key = JSON.stringify([2, s.basis, s.rows, s.p, s.g, s.n, s.mode, text, tolerance, larger]);
  return cache.get(key, () => {
    const identity = chordIdentity(text),
      projection = projectChord(s, identity, {tolerance}),
      occurrences = searchOccurrences(s, projection);
    return immutable({
      identity,
      projection,
      occurrences,
      largerScales: larger ? largerScaleDiagnostics(s, projection) : []
    });
  });
}

/** Complete-occurrence counts in the next larger generated scales. */
export function largerScaleDiagnostics(s, projection, {count = 4} = {}) {
  if (projection.basisStatus !== 'mapped') return [];
  const start = Math.max(s.n + 1, projection.generatorSpan + 1),
    out = [];
  for (let n = start; n <= MAX_SCALE_SIZE && out.length < Math.min(8, count); n++) {
    const next = {...s, n, mode: Math.min(s.mode || 0, n - 1)},
      result = searchOccurrences(next, projection, {partialLimit: 0});
    out.push({
      n,
      mode: next.mode,
      count: result.completeOccurrences.length,
      scaleCollision: result.scaleCollision
    });
  }
  return out;
}
