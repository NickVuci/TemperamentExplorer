// Coordinate consumers adapt to the same target projection, dyad domains and
// coherent-lift solver as the catalogue. Tuning quality is a separate filter.
import {targets, scale, createTargetClassifier} from '../core/engine.mjs';
import {targetSet, validateJILimits, DEFAULT_ODD_LIMIT} from '../core/ji-limit-engine.mjs';
import {coordinateCents, mod, approximationSpan, noteCoordinate} from '../core/pitch.mjs';
import {projectCoordinateShape} from '../chords/chord-projection.mjs';
import {buildDyadIndex, domainsForShape} from './harmonic-dyad-graph.mjs';
import {assessET} from './harmonic-et.mjs';

export function preferredPairTarget(pair, other = false) {
  const eligible = other ? [...pair.mapped, ...pair.hits] : pair.mapped;
  return (
    eligible
      .filter(t => t.within)
      .sort(
        (a, b) => Math.abs(a.error) - Math.abs(b.error) || Number(b.identity) - Number(a.identity)
      )[0] ?? null
  );
}
export function createCoordinateInspector(
  s,
  {
    limit = DEFAULT_ODD_LIMIT,
    primeLimit = null,
    tolerance = 10,
    other = true,
    span = approximationSpan(s),
    targetRows
  } = {}
) {
  validateJILimits({oddLimit: limit, primeLimit});
  if (
    !Number.isFinite(tolerance) ||
    tolerance < 0 ||
    tolerance > 100 ||
    !Number.isFinite(span) ||
    span <= 0
  )
    throw Error('Choose a supported tolerance and interval span.');
  const classify = createTargetClassifier(s, targetRows ?? targets(limit, primeLimit), tolerance);
  let index;
  function dyadIndex() {
    return (index ??= buildDyadIndex(
      targetSet({
        oddLimit: limit,
        primeFilter: primeLimit,
        mappingSubgroup: s.basis,
        representationPolicy: s.basis.includes(2) ? 'octave' : 'native-exact'
      }),
      s
    ));
  }
  function pair(from, to, rawCents) {
    const difference = to.map((v, i) => v - from[i]),
      c = mod(rawCents ?? coordinateCents(s, difference), span),
      k = difference[1],
      q = Math.round((c - k * s.g) / s.p);
    const match = classify({c, k});
    return {c, k, q, coordinate: difference, ...match, best: preferredPairTarget(match, other)};
  }
  function inspect(
    coordinates,
    {budget = {maxStates: 10000, maxCompatibilityChecks: 100000}, assessment = true} = {}
  ) {
    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 1 ||
      coordinates.length > 8 ||
      coordinates.some(m => !Array.isArray(m) || m.length !== 2 || !m.every(Number.isSafeInteger))
    )
      throw Error('Choose one through eight safe integer chord coordinates.');
    const pairs = [];
    for (let i = 0; i < coordinates.length; i++)
      for (let j = i + 1; j < coordinates.length; j++)
        pairs.push({i, j, ...pair(coordinates[i], coordinates[j])});
    const errors = pairs.filter(p => p.best).map(p => Math.abs(p.best.error));
    const result = {
      pairs,
      qualified: pairs.length > 0 && errors.length === pairs.length,
      max: errors.length ? Math.max(...errors) : null,
      covered: errors.length,
      total: pairs.length
    };
    if (assessment) {
      const idx = dyadIndex(),
        projection = projectCoordinateShape(s, coordinates),
        identity = projection.identities[idx.equivalence];
      // Full voice coordinates take precedence over quotient representatives.
      const shape = {...identity, coordinates: coordinates.map(m => [...m])},
        domains = domainsForShape(shape, idx);
      result.shape = shape;
      result.domains = domains;
      result.targetSetId = idx.targetSetId;
      result.assessment = domains.degenerate
        ? {
            status: 'degenerate',
            complete: true,
            reason:
              'Repeated harmonic classes retain their sounding voices; ET requires distinct harmonic vertices.'
          }
        : assessET(shape, idx, budget);
    }
    return result;
  }
  return {pair, inspect, dyadIndex};
}
export function inspectCoordinateChord(s, coordinates, options = {}, request = {}) {
  return createCoordinateInspector(s, options).inspect(coordinates, request);
}

/** One bounded finite-coordinate candidate search for scale and board adapters. */
export function enumerateCoordinateChords(
  s,
  notes,
  {
    size = 3,
    maxNodes = 250000,
    maxResults = 20000,
    maxGroups = 1000,
    compatible = () => true,
    groupKey,
    options = {},
    onChord = () => {}
  } = {}
) {
  if (![3, 4].includes(size)) throw Error('Choose triads or tetrads.');
  for (const [name, value] of Object.entries({maxNodes, maxResults, maxGroups}))
    if (!Number.isSafeInteger(value) || value < 1) throw Error(`Invalid ${name} bound.`);
  const inspector = createCoordinateInspector(s, options),
    pairs = notes.map(() => []),
    cache = new Map();
  for (let i = 0; i < notes.length; i++)
    for (let j = i + 1; j < notes.length; j++) {
      if (!compatible(notes[i], notes[j])) continue;
      const delta = notes[j].coordinate.map((v, axis) => v - notes[i].coordinate[axis]),
        rawCents =
          Number.isFinite(notes[i].c) && Number.isFinite(notes[j].c)
            ? notes[j].c - notes[i].c
            : undefined,
        key = JSON.stringify([delta, rawCents]);
      if (!cache.has(key))
        cache.set(key, inspector.pair(notes[i].coordinate, notes[j].coordinate, rawCents).best);
      pairs[i][j] = cache.get(key);
    }
  let visited = 0,
    count = 0,
    limited = false;
  const groups = new Set();
  function visit(ds, start) {
    if (limited) return;
    if (++visited > maxNodes) {
      limited = true;
      return;
    }
    if (ds.length === size) {
      if (count >= maxResults) {
        limited = true;
        return;
      }
      const selected = ds.map(i => notes[i]),
        key = groupKey?.(selected) ?? selected.map(n => n.coordinate.join(',')).join(';');
      if (!groups.has(key) && groups.size >= maxGroups) {
        limited = true;
        return;
      }
      groups.add(key);
      count++;
      onChord(
        selected,
        ds.flatMap((i, a) => ds.slice(a + 1).map(j => pairs[i][j]))
      );
      return;
    }
    for (let j = start; j <= notes.length - (size - ds.length); j++)
      if (ds.every(i => pairs[i][j])) visit([...ds, j], j + 1);
  }
  visit([], 0);
  return {
    count,
    limited,
    complete: !limited,
    visited,
    bounds: {maxNodes, maxResults, maxGroups},
    groupCount: groups.size
  };
}

export function discoverScaleChords(
  s,
  size = 3,
  limit = DEFAULT_ODD_LIMIT,
  tolerance = 10,
  other = true,
  primeLimit = null
) {
  if (s.n > 96)
    throw Error(
      'Automatic chord discovery supports up to 96 notes. Choose a smaller scale to search, or select chords manually in the HexBoard workspace.'
    );
  if (![3, 4].includes(size)) throw Error('Choose triads or tetrads.');
  if (scale(s).collision) return {groups: [], count: 0, collision: true};
  const notes = scale(s).notes.map((note, degree) => ({
      degree,
      k: note.k,
      c: note.c,
      coordinate: noteCoordinate(s, note)
    })),
    groups = new Map();
  const groupKey = items => {
    const generators = items.map(note => note.k).sort((a, b) => a - b);
    return generators.map(k => k - generators[0]).join(',');
  };
  const search = enumerateCoordinateChords(s, notes, {
    size,
    groupKey,
    options: {limit, tolerance, other, primeLimit, span: s.p},
    onChord: (selected, pairs) => {
      const key = groupKey(selected),
        shape = key.split(',').map(Number),
        errors = pairs.map(pair => Math.abs(pair.error)),
        score = Math.max(...errors),
        rms = Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length);
      const item = {
        degrees: selected.map(note => note.degree),
        max: score,
        rms,
        mapped: pairs.filter(pair => pair.identity).length,
        total: errors.length,
        labels: pairs.map(pair => pair.label)
      };
      let group = groups.get(key);
      if (!group) {
        group = {shape, occurrences: [], best: item};
        groups.set(key, group);
      }
      group.occurrences.push(item);
      if (
        score < group.best.max - 1e-8 ||
        (Math.abs(score - group.best.max) < 1e-8 && rms < group.best.rms)
      )
        group.best = item;
    }
  });
  const result = {
    groups: [...groups.values()].sort(
      (a, b) =>
        a.best.max - b.best.max || a.best.rms - b.best.rms || a.shape.at(-1) - b.shape.at(-1)
    ),
    count: search.count,
    collision: false
  };
  Object.defineProperties(result, {
    limited: {value: search.limited},
    complete: {value: search.complete},
    bounds: {value: search.bounds},
    visited: {value: search.visited}
  });
  return result;
}
