import {BoundedCache, immutable} from '../core/cache.mjs';
import {mappingContext} from './harmonic-context.mjs';
import {canonicalHarmonicJSON, tuningKey, validateHarmonicSelection} from './harmonic-types.mjs';
import {targetSet} from '../core/ji-limit-engine.mjs';
import {mappedIntervals, intervalError} from './harmonic-intervals.mjs';
import {
  curatedJIChords,
  makeJIInterpretation,
  orientedJIInterpretation,
  simplestRotation,
  harmonicLines,
  enumerateJISubsets,
  analyzeJIDyads
} from './harmonic-ji-chords.mjs';
import {projectChord, projectCoordinateShape} from '../chords/chord-projection.mjs';
import {chordMonzos} from '../chords/chord-identity.mjs';
import {harmonicIdentity, quotientCoordinate} from './harmonic-equivalence.mjs';
import {ratioMonzo} from '../core/ji-monzo.mjs';
import {buildDyadIndex} from './harmonic-dyad-graph.mjs';
import {CHORD_SPACE_SIZES, classifyChordSpace} from './harmonic-chord-space.mjs';
import {enumerateMappingExtensions} from './harmonic-mappings.mjs';
import {
  searchIntervalApproximations,
  searchChordApproximationsAsync
} from './harmonic-approximations.mjs';
import {eventLoopBoundary} from './harmonic-cooperative.mjs';

export const CATALOGUE_VERSION = 'harmonic-catalogue-v1';
const categories = ['intervals', 'ji', 'chords', 'mappings', 'approximations'];
const bounded = (value, fallback, max, name) => {
  const n = value ?? fallback;
  if (!Number.isSafeInteger(n) || n < 1 || n > max)
    throw Error(`${name} must be from 1 through ${max}.`);
  return n;
};
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const height = ratio => ratio.split('/').reduce((product, value) => product * Number(value), 1);
const ratioIdentity = ratio => {
  const value = ratioMonzo(ratio, null, {includeBasis: false});
  return `ji-ratio-v1:${value.numerator}/${value.denominator}`;
};

// The temperament-independent part of JI rows. Family, labels and dyadic status depend only on
// the target set and subgroup basis, and chord-space JI chords are oriented once; temperament
// changes that keep both reuse them and only project into the new mapping.
const jiLayers = new BoundedCache(6);
function jiLayer(targets, basis, kind) {
  return jiLayers.get(JSON.stringify([targets.id, basis, kind]), () => ({
    fixed: new Map(),
    oriented: new Map()
  }));
}

/** True when a row stands for this exact chord spelling, directly or as a merged rotation/doubling. */
export const hasInterpretation = (row, id) =>
  row?.interpretationId === id || !!row?.mergedInterpretationIds?.includes(id);

/** Complete catalogue scope: no selected scale, board or display tolerance. */
export function catalogueContext(query) {
  const mapping = mappingContext(query.mapping ?? query.state),
    source = query.tuning ?? query.state;
  const tuning = source
    ? {
        mappingId: mapping.id,
        periodCents: source.periodCents ?? source.p,
        generatorCents: source.generatorCents ?? source.g
      }
    : null;
  if (source?.mappingId && source.mappingId !== mapping.id)
    throw Error('Catalogue tuning uses another mapping.');
  if (tuning) tuning.id = tuningKey(tuning);
  const targets = targetSet(
    query.targetSpec ?? {
      oddLimit: 15,
      primeFilter: mapping.basis,
      mappingSubgroup: mapping.basis,
      representationPolicy: mapping.basis.includes(2) ? 'octave' : 'native-exact'
    }
  );
  // The shared projector validates subgroup identity, including missing primes.
  mappedIntervals(targets, mapping, {equivalences: []});
  const requested = query.categories ?? ['intervals', 'ji'];
  if (!Array.isArray(requested) || requested.some(kind => !categories.includes(kind)))
    throw Error('Unknown catalogue category.');
  const options = {
    categories: [...new Set(requested)].sort(),
    directInputs: query.directInputs ?? [],
    subsets: query.subsets ?? null,
    chordSizes: [...new Set(query.chordSizes ?? CHORD_SPACE_SIZES)].sort((a, b) => a - b),
    mappingTargets: query.mappingTargets ?? [],
    mappingOptions: query.mappingOptions ?? {},
    approximationTargets: query.approximationTargets ?? [],
    approximationChords: query.approximationChords ?? [],
    approximationOptions: query.approximationOptions ?? {},
    maxRecords: bounded(query.maxRecords, 512, 20000, 'Catalogue record limit'),
    pageSize: bounded(query.pageSize, 50, 128, 'Catalogue page size')
  };
  for (const name of [
    'directInputs',
    'mappingTargets',
    'approximationTargets',
    'approximationChords'
  ])
    if (!Array.isArray(options[name])) throw Error(`${name} must be an array.`);
  if (
    options.directInputs.length > 64 ||
    options.mappingTargets.length > 32 ||
    options.approximationTargets.length > 64 ||
    options.approximationChords.length > 16
  )
    throw Error('Too many direct catalogue inputs.');
  const id = `${CATALOGUE_VERSION}:${canonicalHarmonicJSON({mapping, tuning, targetSetId: targets.id, options})}`;
  return immutable({id, mapping, tuning, targets, options});
}

/** Merge existing producers without changing their mathematical definitions. */
export async function queryCatalogue(
  query,
  {signal, shouldCancel, onProgress, yieldControl = eventLoopBoundary} = {}
) {
  const context = catalogueContext(query),
    {mapping, tuning, targets, options} = context;
  const records = new Map(),
    sources = [],
    pending = new Map();
  let cancelled = false,
    recordCap = false;
  const isCancelled = () => Boolean(signal?.aborted || shouldCancel?.());
  const boundary = async () => {
    await yieldControl();
    if (isCancelled()) cancelled = true;
  };
  // Rows stay mutable until the result is assembled, so a JI row can absorb the spellings merged into it.
  const add = row => {
    if (records.has(row.id)) return;
    if (records.size >= options.maxRecords) {
      recordCap = true;
      return;
    }
    records.set(row.id, row);
  };
  const state = {
    ...mapping,
    p: tuning?.periodCents ?? (1200 * Math.log2(mapping.basis[0])) / mapping.rows[0][0],
    g: tuning?.generatorCents ?? 1
  };
  const kind = targets.spec.representationPolicy === 'native-exact' ? 'exact' : 'octave';
  const layer = jiLayer(targets, mapping.basis, kind);
  // Exact identities can share a fingerprint (repeated members, other spellings), so the key also
  // carries the spelling and presentation that the row exposes.
  const fixedKey = interpretation =>
    JSON.stringify([
      interpretation.id,
      interpretation.identity.orderedRatios,
      interpretation.identity.originalInput,
      interpretation.preferredLabel,
      interpretation.presentationForm,
      interpretation.provenance
    ]);
  const fixedOf = interpretation => {
    const key = fixedKey(interpretation);
    let fixed = layer.fixed.get(key);
    if (fixed) return fixed;
    const family =
        kind === 'exact'
          ? harmonicIdentity(interpretation.identity, 'exact')
          : interpretation.harmonicIdentity,
      dyads = analyzeJIDyads(interpretation.identity, targets, mapping);
    // The page reads only these interpretation fields; the exact dual and family records stay here.
    const slim = {
      schemaVersion: interpretation.schemaVersion,
      id: interpretation.id,
      type: interpretation.type,
      identity: interpretation.identity,
      familyId: interpretation.familyId,
      dualFamilyId: interpretation.dualFamilyId,
      exactDualId: interpretation.exactDualId,
      exactDual: {
        fingerprint: interpretation.exactDual.fingerprint,
        originalInput: interpretation.exactDual.originalInput
      },
      preferredLabel: interpretation.preferredLabel,
      presentationForm: interpretation.presentationForm,
      provenance: interpretation.provenance
    };
    fixed = immutable({
      interpretation: slim,
      familyId: family.familyId,
      dualFamilyId: family.dualFamilyId,
      dyads: {dyadic: dyads.dyadic, status: dyads.status},
      aliases: [
        ...new Set([
          interpretation.preferredLabel,
          interpretation.identity.displayLabel,
          ...Object.values(interpretation.identity.aliases)
        ])
      ].sort(compare)
    });
    layer.fixed.set(key, fixed);
    return fixed;
  };
  // A JI chord is its octave-reduced pitch-class set, written as its simplest rotation. Doublings and
  // inversions merge into that one row; voicing and inversion belong to the chord panel.
  const reps = layer.reps ?? (layer.reps = new Map());
  const representative = interpretation => {
    let rep = reps.get(interpretation.id);
    if (rep) return rep;
    // Chords outside the mapping subgroup have no tempered family to merge into and keep their own spelling.
    const best = chordMonzos(interpretation.identity, mapping.basis).some(
      note => note.missingPrimes.length
    )
      ? null
      : simplestRotation(interpretation.identity, kind === 'octave');
    // Rotations whose integer form exceeds the exact-chord bound keep their own spelling.
    let target = interpretation;
    if (best)
      try {
        target = orientedJIInterpretation(best.spelling, {kind: 'chord-space'});
      } catch {}
    // Spellings sharing a fingerprint (doublings, reordering) still take the normalized spelling.
    rep = target;
    reps.set(interpretation.id, rep);
    return rep;
  };
  const spellings = interpretation => [
    interpretation.preferredLabel,
    interpretation.identity.displayLabel,
    ...Object.values(interpretation.identity.aliases)
  ];
  const addJI = original => {
    const interpretation = representative(original),
      id0 = `catalogue-ji-v1:${canonicalHarmonicJSON([mapping.id, interpretation.id])}`;
    const existing = records.get(id0);
    if (existing) {
      if (original !== interpretation) {
        if (!existing.mergedInterpretationIds.includes(original.id))
          existing.mergedInterpretationIds.push(original.id);
        existing.aliases = [...new Set([...existing.aliases, ...spellings(original)])].sort(
          compare
        );
      }
      if (original.provenance?.kind === 'custom') existing.custom = true;
      return existing;
    }
    const projection = projectChord(state, interpretation.identity, {shapeKinds: [kind]}),
      shape = projection.shapeIdentities[kind];
    const id = `catalogue-ji-v1:${canonicalHarmonicJSON([mapping.id, interpretation.id])}`;
    const fixed = fixedOf(interpretation);
    const row = {
      id,
      kind: 'ji',
      mappingId: mapping.id,
      targetSetId: targets.id,
      harmonicId: fixed.familyId,
      interpretationId: interpretation.id,
      mergedInterpretationIds: [...new Set([interpretation.id, original.id])],
      custom: original.provenance?.kind === 'custom',
      interpretation: fixed.interpretation,
      preferredLabel: interpretation.preferredLabel,
      aliases:
        original === interpretation
          ? fixed.aliases
          : [...new Set([...fixed.aliases, ...spellings(original)])].sort(compare),
      familyId: fixed.familyId,
      dualFamilyId: fixed.dualFamilyId,
      exactDualId: interpretation.exactDualId,
      shapeId: shape.available ? shape.id : null,
      shape: shape.available
        ? {
            available: true,
            id: shape.id,
            equivalence: shape.equivalence,
            coordinateCount: shape.coordinateCount,
            cardinality: shape.cardinality
          }
        : null,
      mappingStatus: projection.basisStatus,
      missingPrimes: projection.missingPrimes,
      dyads: fixed.dyads,
      tuning: tuning
        ? {
            id: tuning.id,
            maxErrorCents: projection.maxErrorCents,
            pairwiseMaxErrorCents: projection.pairwiseMaxErrorCents
          }
        : null
    };
    add(row);
    return row;
  };
  // Named by each member's simplest JI reading from the root, which the enumerator places first.
  const temperedRow = (shape, index) => {
    const [root, ...rest] = shape.coordinates,
      simplest = items =>
        [...items].sort(
          (a, b) => height(a.ratio) - height(b.ratio) || compare(a.ratio, b.ratio)
        )[0];
    const members = [
      {ratio: '1/1', cents: 0},
      ...rest.map(point => {
        const item = simplest(
          index.byClassKey[
            quotientCoordinate(index.policy, [point[0] - root[0], point[1] - root[1]]).key
          ]
        );
        return {ratio: item.ratio, cents: item.idealCents};
      })
    ];
    const ratios = members.sort((a, b) => a.cents - b.cents).map(member => member.ratio),
      label = ratios.join(' · ');
    return {
      id: `catalogue-tempered-v1:${shape.id}`,
      kind: 'tempered',
      status: shape.status,
      mappingId: mapping.id,
      targetSetId: targets.id,
      shapeId: shape.id,
      shape: {
        id: shape.id,
        mappingId: shape.shape.mappingId,
        equivalence: shape.shape.equivalence,
        coordinates: shape.coordinates
      },
      harmonicId: shape.id,
      familyId: shape.id,
      preferredLabel: label,
      aliases: [label],
      spelling: ratios.join(':')
    };
  };
  const run = async (kind, fn) => {
    if (cancelled || isCancelled()) {
      cancelled = true;
      return;
    }
    await fn();
    onProgress?.(immutable({contextId: context.id, category: kind, count: records.size}));
    await boundary();
  };
  // Exact custom lookup precedes browse bounds, so a small browse cannot hide it.
  for (const input of options.directInputs) {
    if (isCancelled()) {
      cancelled = true;
      break;
    }
    addJI(makeJIInterpretation(input));
    await boundary();
  }
  if (options.categories.includes('intervals'))
    await run('intervals', async () => {
      for (const interval of mappedIntervals(targets, mapping)) {
        const approximation =
          !interval.coordinate && tuning
            ? (searchIntervalApproximations(mapping, tuning, interval.ratio, {
                generatorBound: 32,
                maxResults: 1
              }).candidates[0] ?? null)
            : null;
        add({
          ...interval,
          kind: 'interval',
          harmonicId: ratioIdentity(interval.ratio),
          approximation,
          preferredLabel: interval.ratio.label,
          tuning: tuning ? intervalError(interval, tuning) : null
        });
      }
      sources.push({kind: 'intervals', complete: true});
    });
  if (options.categories.includes('ji'))
    await run('ji', async () => {
      let count = 0;
      for (const seed of curatedJIChords()) {
        if (cancelled || isCancelled()) {
          cancelled = true;
          break;
        }
        addJI(seed.interpretation);
        if (++count % 16 === 0) await boundary();
      }
      if (!cancelled) {
        const lines = harmonicLines(mapping, targets);
        for (const line of lines.lines) addJI(line.interpretation);
        sources.push({kind: 'ji-curated-and-lines', complete: true, bounds: lines.bounds});
        if (options.subsets) {
          const page = enumerateJISubsets(lines, options.subsets);
          for (const item of page.items) addJI(item.interpretation);
          sources.push({
            kind: 'ji-subsets',
            complete: page.complete,
            nextCursor: page.nextCursor,
            totalCombinations: page.totalCombinations,
            doneCombinations: page.doneCombinations
          });
        }
      }
    });
  // Every JI and ET chord of the target set. JI shapes add each JI chord that maps onto them, reusing
  // a family the curated producer already labelled; the remaining dyadic shapes are tempered rows.
  if (options.categories.includes('chords'))
    await run('chords', async () => {
      const index = buildDyadIndex(targets, mapping),
        space = classifyChordSpace(index, {sizes: options.chordSizes});
      const families = new Set(
        [...records.values()].filter(row => row.kind === 'ji').map(row => row.familyId)
      );
      let count = 0;
      const orient = chord => {
        let interpretation = layer.oriented.get(chord.key);
        if (!interpretation) {
          interpretation = orientedJIInterpretation(
            chord.members.map(member => member.ratio).join(':'),
            {kind: 'chord-space'}
          );
          layer.oriented.set(chord.key, interpretation);
        }
        return interpretation;
      };
      for (const shape of space.shapes) {
        if (cancelled || isCancelled()) {
          cancelled = true;
          break;
        }
        if (shape.status === 'ji')
          for (const chord of shape.interpretations) {
            const interpretation = orient(chord),
              familyId = fixedOf(interpretation).familyId;
            if (!families.has(familyId)) {
              families.add(familyId);
              addJI(interpretation);
            }
          }
        else add(temperedRow(shape, index));
        if (++count % 64 === 0) await boundary();
      }
      sources.push({
        kind: 'chords',
        complete: space.complete,
        reason: space.reason,
        sizes: space.sizes,
        counts: space.counts
      });
    });
  if (options.categories.includes('mappings'))
    await run('mappings', async () => {
      if (!tuning) throw Error('Mapping candidate ranking needs a tuning.');
      for (const target of options.mappingTargets) {
        if (isCancelled()) {
          cancelled = true;
          break;
        }
        const result = enumerateMappingExtensions(mapping, target, {
          ...options.mappingOptions,
          tuning
        });
        for (const candidate of result.candidates)
          add({
            ...candidate,
            kind: 'mapping',
            activeMappingId: mapping.id,
            harmonicId: ratioIdentity(candidate.targetRatio),
            interpretationId: candidate.variantId
          });
        sources.push({
          kind: 'mappings',
          target,
          complete: result.completeness.domainExhausted && !result.completeness.truncated,
          result
        });
        await boundary();
      }
    });
  if (options.categories.includes('approximations'))
    await run('approximations', async () => {
      if (!tuning) throw Error('Approximation search needs a tuning.');
      for (const target of options.approximationTargets) {
        if (isCancelled()) {
          cancelled = true;
          break;
        }
        const result = searchIntervalApproximations(mapping, tuning, target, {
          ...options.approximationOptions,
          targetSet: targets
        });
        for (const candidate of result.candidates) {
          const shapes = projectCoordinateShape(mapping, [[0, 0], candidate.coordinate]);
          const shape =
            shapes.identities[
              targets.spec.representationPolicy === 'native-exact' ? 'exact' : 'octave'
            ];
          add({
            ...candidate,
            kind: 'approximation',
            harmonicId: ratioIdentity(candidate.targetRatio),
            shapeId: shape.id,
            shape
          });
        }
        sources.push({
          kind: 'approximations',
          complete: result.completeness.domainExhausted && !result.completeness.truncated,
          result
        });
        await boundary();
      }
      for (const input of options.approximationChords) {
        if (isCancelled()) {
          cancelled = true;
          break;
        }
        const result = await searchChordApproximationsAsync(makeJIInterpretation(input), {
          ...options.approximationOptions,
          context: mapping,
          tuning,
          targetSet: targets,
          shouldCancel: isCancelled
        });
        for (const candidate of result.candidates) {
          const shapes = projectCoordinateShape(mapping, candidate.memberCoordinates);
          const shape =
            shapes.identities[
              targets.spec.representationPolicy === 'native-exact' ? 'exact' : 'octave'
            ];
          add({...candidate, kind: 'approximation', shapeId: shape.id, shape});
        }
        sources.push({
          kind: 'chord-approximations',
          complete: result.completeness.complete,
          result
        });
        await boundary();
      }
    });

  records.forEach(row => immutable(row));
  const items = [...records.values()].sort(
    (a, b) => compare(a.kind, b.kind) || compare(a.id, b.id)
  );
  // Only shared shapes and families form groups; a lone row's group would just repeat its own id.
  const groups = key => {
    const result = {};
    for (const item of items)
      if (item[key]) {
        (result[item[key]] ??= []).push(item.id);
      }
    for (const id of Object.keys(result)) if (result[id].length < 2) delete result[id];
    return result;
  };
  const shapeGroups = groups('shapeId'),
    familyGroups = groups('familyId');
  for (const item of items)
    if (item.kind === 'ji') for (const id of item.mergedInterpretationIds) pending.set(id, item.id);
  const dualLinks = Object.fromEntries(
    items
      .filter(item => item.kind === 'ji')
      .map(item => [item.id, pending.get(item.exactDualId) ?? null])
  );
  const complete = !cancelled && !recordCap && sources.every(source => source.complete),
    status = cancelled
      ? 'cancelled'
      : !complete
        ? 'incomplete'
        : items.length
          ? 'complete'
          : 'complete-empty';
  let offset = 0;
  if (query.cursor) {
    let cursor;
    try {
      cursor = JSON.parse(query.cursor);
    } catch {
      throw Error('Invalid catalogue cursor.');
    }
    if (
      cursor.contextId !== context.id ||
      !Number.isSafeInteger(cursor.offset) ||
      cursor.offset < 0 ||
      cursor.offset > items.length
    )
      throw Error('Catalogue cursor context mismatch.');
    offset = cursor.offset;
  }
  const page = items.slice(offset, offset + options.pageSize),
    nextOffset = offset + page.length;
  return immutable({
    version: 1,
    contextId: context.id,
    mappingId: mapping.id,
    tuningId: tuning?.id ?? null,
    targetSetId: targets.id,
    items,
    page,
    nextCursor:
      nextOffset < items.length
        ? JSON.stringify({contextId: context.id, offset: nextOffset})
        : null,
    shapeGroups,
    familyGroups,
    dualLinks,
    sources,
    status,
    complete,
    recordCap,
    total: items.length
  });
}

/** Stable in-result lookup; direct custom input also works outside browse bounds. */
export async function getHarmonicEntry(queryOrResult, idOrInput) {
  if (queryOrResult?.version === 1 && Array.isArray(queryOrResult.items))
    return (
      queryOrResult.items.find(
        item => item.id === idOrInput || hasInterpretation(item, idOrInput)
      ) ?? null
    );
  const result = await queryCatalogue({
    ...queryOrResult,
    categories: [],
    directInputs: [idOrInput],
    cursor: null
  });
  return result.items[0] ?? null;
}

export function resolveSelection(result, selection) {
  const value = validateHarmonicSelection(selection);
  if (
    result.mappingId !== value.mappingId ||
    (value.assessmentContext && value.assessmentContext.targetSetId !== result.targetSetId)
  )
    throw Error('Selection context mismatch.');
  const matches = result.items.filter(
    item =>
      (!value.shapeId || item.shapeId === value.shapeId) &&
      (!value.harmonicId ||
        item.familyId === value.harmonicId ||
        item.harmonicId === value.harmonicId) &&
      (!value.interpretationId || hasInterpretation(item, value.interpretationId))
  );
  return immutable({
    selection: value,
    entry: matches[0] ?? null,
    aliases: matches.map(item => item.id),
    status: matches.length ? 'resolved' : 'unavailable'
  });
}
