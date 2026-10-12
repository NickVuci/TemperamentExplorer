import {searchCheckpoint, finishSearchAsync} from './harmonic-cooperative.mjs';
import {BoundedCache, immutable} from '../core/cache.mjs';
import {mappingContext} from './harmonic-context.mjs';
import {tuningKey} from './harmonic-types.mjs';
import {ratioMonzo, mapMonzo} from '../core/ji-monzo.mjs';
import {
  edgeInterpretations,
  indexByCoordinate,
  mappedIntervals,
  signedIntervalError
} from './harmonic-intervals.mjs';
import {targetSet as buildTargetSet} from '../core/ji-limit-engine.mjs';
import {div, rational, show} from '../core/rational.mjs';

const COMPARISON_EPSILON_CENTS = 1e-7;
const PERIOD_COEFFICIENT_TIE_EPSILON = 1e-12;
const approximationCache = new BoundedCache(64);

function ratioInput(input) {
  if (typeof input === 'string' || Array.isArray(input)) return input;
  if (input && typeof input === 'object' && input.ratio !== undefined)
    return ratioInput(input.ratio);
  if (input && typeof input === 'object' && input.n !== undefined && input.d !== undefined)
    return {n: input.n, d: input.d};
  throw Error('Approximation target must be an exact positive JI ratio.');
}

function targetRecord(input, context) {
  const factor = ratioMonzo(ratioInput(input), context.basis);
  return {
    ratio: factor.ratio,
    numerator: factor.numerator,
    denominator: factor.denominator,
    sparseMonzo: factor.sparseMonzo,
    basisMonzo: factor.basisMonzo,
    missingPrimes: factor.missingPrimes,
    canonicalCoordinate: factor.withinBasis ? mapMonzo(context.rows, factor.basisMonzo) : null,
    targetId: typeof input?.id === 'string' ? input.id : null,
    idealCents: 1200 * Math.log2(Number(factor.numerator) / Number(factor.denominator))
  };
}

function tuningRecord(context, tuning) {
  const periodCents = tuning?.periodCents ?? tuning?.p,
    generatorCents = tuning?.generatorCents ?? tuning?.g;
  if (
    !Number.isFinite(periodCents) ||
    periodCents <= 0 ||
    !Number.isFinite(generatorCents) ||
    generatorCents <= 0
  ) {
    throw Error('Approximation search needs positive finite period and generator cents.');
  }
  if (tuning?.mappingId !== undefined && tuning.mappingId !== context.id)
    throw Error('Approximation tuning belongs to a different mapping context.');
  if (tuning?.basis && tuning?.rows && mappingContext(tuning).id !== context.id)
    throw Error('Approximation tuning state belongs to a different mapping context.');
  return {
    periodCents,
    generatorCents,
    id: tuningKey({mappingId: context.id, periodCents, generatorCents})
  };
}

function coordinateKey(coordinate) {
  return JSON.stringify(coordinate);
}
function validateCoordinate(coordinate) {
  if (
    !Array.isArray(coordinate) ||
    coordinate.length !== 2 ||
    !coordinate.every(Number.isSafeInteger)
  )
    throw Error('Approximation coordinates must be safe integer [period, generator] pairs.');
  return coordinate.map(value => (Object.is(value, -0) ? 0 : value));
}

function prepareEvaluator(contextInput, tuningInput, targetInput) {
  const context = mappingContext(contextInput),
    tuning = tuningRecord(context, tuningInput),
    target = targetRecord(targetInput, context);
  return (coordinateInput, {actualCents = null} = {}) => {
    const coordinate = validateCoordinate(coordinateInput);
    if (actualCents !== null && !Number.isFinite(actualCents))
      throw Error('Observed approximation cents must be finite.');
    const tunedCents =
      actualCents ?? coordinate[0] * tuning.periodCents + coordinate[1] * tuning.generatorCents;
    const signedErrorCents = signedIntervalError(tunedCents, target.idealCents);
    const mapped =
      !!target.canonicalCoordinate &&
      coordinateKey(coordinate) === coordinateKey(target.canonicalCoordinate);
    return immutable({
      id: `approximation-coordinate-v1:${JSON.stringify([context.id, tuning.id, target.ratio, coordinate])}`,
      mappingId: context.id,
      tuningId: tuning.id,
      targetId: target.targetId,
      targetRatio: target.ratio,
      coordinate,
      idealCents: target.idealCents,
      tunedCents,
      signedErrorCents,
      absoluteErrorCents: Math.abs(signedErrorCents),
      canonicalCoordinate: target.canonicalCoordinate,
      mapped
    });
  };
}

/** Shared exact-coordinate error record used by bounded search and finite scale domains. */
function evaluateApproximationCoordinate(
  contextInput,
  tuningInput,
  targetInput,
  coordinateInput,
  {actualCents = null} = {}
) {
  return prepareEvaluator(contextInput, tuningInput, targetInput)(coordinateInput, {actualCents});
}

function coordinateTieOrder(a, b) {
  return (
    Number(b.mapped) - Number(a.mapped) ||
    Math.abs(a.coordinate[1]) - Math.abs(b.coordinate[1]) ||
    Math.abs(a.coordinate[0]) - Math.abs(b.coordinate[0]) ||
    a.coordinate[1] - b.coordinate[1] ||
    a.coordinate[0] - b.coordinate[0]
  );
}

/** Rank finite coordinates by tuned error while preserving distinct integer identities. */
export function rankApproximationCoordinates(
  contextInput,
  tuningInput,
  targetInput,
  coordinates,
  options = {}
) {
  if (!Array.isArray(coordinates)) throw Error('Approximation coordinate domain must be an array.');
  const policy = options.policy ?? 'canonical';
  if (!['canonical', 'candidate-list', 'best-set'].includes(policy))
    throw Error('Approximation ranking policy must be canonical, candidate-list, or best-set.');
  const unique = new Map();
  for (const source of coordinates) {
    const coordinate = Array.isArray(source) ? source : source?.coordinate,
      point = validateCoordinate(coordinate),
      actualCents = Array.isArray(source) ? null : (source?.actualCents ?? source?.cents ?? null),
      key = coordinateKey(point);
    if (!unique.has(key)) unique.set(key, {coordinate: point, actualCents});
  }
  const evaluate = prepareEvaluator(contextInput, tuningInput, targetInput);
  const values = [...unique.values()].map(({coordinate, actualCents}, index) => ({
    record: evaluate(coordinate, {actualCents}),
    index
  }));
  if (policy === 'candidate-list')
    return immutable(
      values
        .sort(
          (a, b) =>
            a.record.absoluteErrorCents - b.record.absoluteErrorCents ||
            Math.abs(a.record.coordinate[1]) - Math.abs(b.record.coordinate[1]) ||
            a.index - b.index
        )
        .map(value => value.record)
    );
  if (policy === 'best-set') {
    const bestError = Math.min(...values.map(value => value.record.absoluteErrorCents));
    return immutable(
      values
        .filter(value => value.record.absoluteErrorCents <= bestError + COMPARISON_EPSILON_CENTS)
        .sort(
          (a, b) =>
            Number(b.record.mapped) - Number(a.record.mapped) ||
            Math.abs(a.record.coordinate[1]) - Math.abs(b.record.coordinate[1]) ||
            a.index - b.index
        )
        .map(value => value.record)
    );
  }
  values.sort(
    (a, b) =>
      a.record.absoluteErrorCents - b.record.absoluteErrorCents ||
      coordinateTieOrder(a.record, b.record)
  );
  // Group numeric ties relative to the best value in each group, then keep
  // coordinate complexity/order stable inside that group. Cents never define ID.
  const groups = [];
  for (const item of values) {
    const value = item.record;
    const group = groups.at(-1);
    if (!group || value.absoluteErrorCents - group.anchor > COMPARISON_EPSILON_CENTS) {
      groups.push({anchor: value.absoluteErrorCents, values: [value]});
    } else group.values.push(value);
  }
  return immutable(groups.flatMap(group => group.values.sort(coordinateTieOrder)));
}

function asTargetSet(value) {
  if (!value) return null;
  return Array.isArray(value.targets) && value.spec && value.id ? value : buildTargetSet(value);
}

function collisionLookup(context, targetSet) {
  if (!targetSet) return {targetSetId: null, index: null};
  const subgroup = targetSet.spec.mappingSubgroup;
  if (
    subgroup.length !== context.basis.length ||
    [...subgroup]
      .sort((a, b) => a - b)
      .some((prime, index) => prime !== [...context.basis].sort((a, b) => a - b)[index])
  ) {
    throw Error(
      "Approximation collision target set must use the mapping context's exact prime subgroup."
    );
  }
  const intervals = mappedIntervals(targetSet, context);
  return {targetSetId: targetSet.id, index: indexByCoordinate(intervals, {equivalence: 'exact'})};
}

function orderedCoordinates(bound, target) {
  const coordinates = new Map();
  for (let generator = -bound; generator <= bound; generator++) {
    const period = (target.idealCents - generator * target.generatorCents) / target.periodCents;
    const low = Math.floor(period),
      high = Math.ceil(period),
      distance = Math.min(period - low, high - period);
    const nearest = [
      ...new Set(
        [low, high].filter(
          value => Math.abs(Math.abs(period - value) - distance) <= PERIOD_COEFFICIENT_TIE_EPSILON
        )
      )
    ];
    for (const value of nearest) {
      const coordinate = [value, generator];
      coordinates.set(coordinateKey(coordinate), coordinate);
    }
  }
  return [...coordinates.values()];
}

function searchResult(
  context,
  tuning,
  target,
  bounds,
  canonical,
  candidates,
  collision,
  targetSet,
  extra = {}
) {
  const domainId = `temperament-lattice-v1:${JSON.stringify([context.id, tuning.id, target.ratio, bounds.generatorBound, bounds.minimumImprovementCents, bounds.maxResults, targetSet?.id ?? null])}`;
  return immutable({
    schemaVersion: 1,
    id: domainId,
    kind: 'interval-approximation-search',
    domain: 'temperament',
    mappingId: context.id,
    tuningId: tuning.id,
    targetId: target.targetId,
    targetSetId: targetSet?.id ?? null,
    targetRatio: target.ratio,
    targetMonzo: target.sparseMonzo,
    missingPrimes: target.missingPrimes,
    idealCents: target.idealCents,
    canonical: {
      status: target.canonicalCoordinate ? 'mapped' : 'outside-basis',
      coordinate: target.canonicalCoordinate,
      tunedCents: canonical?.tunedCents ?? null,
      signedErrorCents: canonical?.signedErrorCents ?? null,
      absoluteErrorCents: canonical?.absoluteErrorCents ?? null,
      inSearchDomain: target.canonicalCoordinate
        ? (extra.sampledCoordinates?.has(coordinateKey(target.canonicalCoordinate)) ?? false)
        : false
    },
    bounds: {
      generatorCoefficient: [-bounds.generatorBound, bounds.generatorBound],
      periodRule: 'nearest integer coefficient(s); check both sides of exact ties',
      comparisonEpsilonCents: COMPARISON_EPSILON_CENTS,
      minimumImprovementCents: bounds.minimumImprovementCents,
      maxResults: bounds.maxResults
    },
    collisionLookup: {
      available: !!targetSet,
      equivalence: 'exact',
      targetSetId: targetSet?.id ?? null
    },
    candidates,
    completeness: {
      domainExhausted: true,
      generatorSamples: 2 * bounds.generatorBound + 1,
      coordinateSamples: extra.coordinateSamples ?? 0,
      qualifyingCandidateCount: extra.qualifyingCandidateCount ?? candidates.length,
      returnedCount: candidates.length,
      truncated: extra.truncated ?? false
    },
    status: candidates.length
      ? 'ready'
      : target.canonicalCoordinate
        ? 'no-improvement-within-bounds'
        : 'no-candidate-within-bounds',
    limitations: [
      `Search is limited to generator coefficients −${bounds.generatorBound} through +${bounds.generatorBound}.`,
      ...(targetSet
        ? []
        : ['No JI target set was supplied, so mapped-identity collision lookup is unavailable.']),
      ...(extra.truncated
        ? ['More qualifying improvements exist than the configured result limit.']
        : [])
    ]
  });
}

/**
 * Search the temperament lattice for bounded interval approximations. This
 * never changes a JI mapping: candidate coordinates are exact integer points
 * and cents are a separate assessment under the supplied tuning.
 */
export function searchIntervalApproximations(contextInput, tuningInput, targetInput, bounds = {}) {
  const context = mappingContext(contextInput),
    tuning = tuningRecord(context, tuningInput),
    target = targetRecord(targetInput, context);
  const generatorBound = bounds.generatorBound ?? 32,
    minimumImprovementCents = bounds.minimumImprovementCents ?? 0.1,
    maxResults = bounds.maxResults ?? 3;
  if (!Number.isInteger(generatorBound) || generatorBound < 0 || generatorBound > 256)
    throw Error('Generator search bound must be an integer from 0 through 256.');
  if (
    !Number.isFinite(minimumImprovementCents) ||
    minimumImprovementCents < COMPARISON_EPSILON_CENTS
  )
    throw Error(`Minimum improvement must be at least ${COMPARISON_EPSILON_CENTS} cents.`);
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 3)
    throw Error('Return at most three interval improvements per target.');
  const targetSet = asTargetSet(bounds.targetSet),
    collision = collisionLookup(context, targetSet);
  const normalizedBounds = {generatorBound, minimumImprovementCents, maxResults};
  const cacheKey = JSON.stringify([
    context.id,
    tuning.id,
    target.ratio,
    target.targetId,
    generatorBound,
    minimumImprovementCents,
    maxResults,
    collision.targetSetId
  ]);
  return approximationCache.get(cacheKey, () => {
    const targetForSearch = {...target, ...tuning},
      coordinates = orderedCoordinates(generatorBound, targetForSearch),
      sampledCoordinates = new Set(coordinates.map(coordinateKey));
    const ranked = rankApproximationCoordinates(context, tuning, targetInput, coordinates),
      canonical = target.canonicalCoordinate
        ? evaluateApproximationCoordinate(context, tuning, targetInput, target.canonicalCoordinate)
        : null;
    const qualifying = [];
    for (const approximation of ranked) {
      if (approximation.mapped) continue;
      const improvementCents = canonical
        ? canonical.absoluteErrorCents - approximation.absoluteErrorCents
        : null;
      if (
        canonical &&
        (improvementCents <= COMPARISON_EPSILON_CENTS ||
          improvementCents + COMPARISON_EPSILON_CENTS < minimumImprovementCents)
      )
        continue;
      const collisions = collision.index
        ? edgeInterpretations(collision.index, approximation.coordinate)
        : [];
      const id = `approximation-v1:${JSON.stringify([context.id, tuning.id, target.ratio, approximation.coordinate, 'temperament'])}`;
      qualifying.push(
        immutable({
          ...approximation,
          id,
          canonicalErrorCents: canonical?.signedErrorCents ?? null,
          canonicalAbsoluteErrorCents: canonical?.absoluteErrorCents ?? null,
          improvementCents,
          collisionTargetIds: collisions.map(record => record.targetId),
          collisions: collisions.map(record => ({
            targetId: record.targetId,
            ratio: record.ratio,
            idealCents: record.idealCents
          })),
          domain: 'temperament',
          generatorBound,
          minimumImprovementCents
        })
      );
    }
    const candidates = qualifying.slice(0, maxResults),
      truncated = qualifying.length > candidates.length;
    return searchResult(
      context,
      tuning,
      target,
      normalizedBounds,
      canonical,
      candidates,
      collision,
      targetSet,
      {
        sampledCoordinates,
        coordinateSamples: coordinates.length,
        qualifyingCandidateCount: qualifying.length,
        truncated
      }
    );
  });
}

function ratioFromIdentityMember(member, index) {
  if (
    !member ||
    typeof member.n !== 'string' ||
    typeof member.d !== 'string' ||
    !/^[1-9]\d*$/.test(member.n) ||
    !/^[1-9]\d*$/.test(member.d)
  )
    throw Error(
      `JI chord member ${index + 1} needs positive exact numerator and denominator strings.`
    );
  const parsed = ratioMonzo({n: member.n, d: member.d}, null, {includeBasis: false}),
    ratio = rational(BigInt(parsed.numerator), BigInt(parsed.denominator));
  return {ratio, label: `${ratio[0]}/${ratio[1]}`};
}

function chordInterpretation(input) {
  const identity = input?.identity?.version === 2 ? input.identity : input;
  if (
    identity?.version !== 2 ||
    !Array.isArray(identity.canonicalRatios) ||
    identity.canonicalRatios.length < 2 ||
    identity.canonicalRatios.length > 8 ||
    typeof identity.fingerprint !== 'string'
  ) {
    throw Error(
      'Chord approximation needs a JI chord identity or interpretation with two to eight exact members.'
    );
  }
  const members = identity.canonicalRatios.map(ratioFromIdentityMember);
  if (members[0].ratio[0] !== 1n || members[0].ratio[1] !== 1n)
    throw Error('JI chord members must be normalized root-relative ratios beginning with 1/1.');
  for (let index = 1; index < members.length; index++) {
    if (
      members[index - 1].ratio[0] * members[index].ratio[1] >=
      members[index].ratio[0] * members[index - 1].ratio[1]
    )
      throw Error('JI chord members must be unique and sorted by exact ratio.');
  }
  const exactFingerprint = `ji2:${members.map(member => member.label).join(':')}`;
  if (identity.fingerprint !== exactFingerprint)
    throw Error('JI chord fingerprint does not match its exact members.');
  return {
    identity,
    members,
    interpretationId: typeof input?.id === 'string' ? input.id : identity.fingerprint,
    preferredLabel:
      typeof input?.preferredLabel === 'string'
        ? input.preferredLabel
        : (identity.displayLabel ?? identity.fingerprint),
    familyId: input?.familyId ?? null,
    dualFamilyId: input?.dualFamilyId ?? null,
    exactDualId: input?.exactDualId ?? null,
    presentationForm: input?.presentationForm ?? null
  };
}

function ratioTarget(member, targetSet) {
  const label = member.label,
    target = targetSet?.targets.find(value => value.ratio.label === label);
  return {
    ratio: label,
    ...(target ? {id: target.id} : {}),
    n: member.ratio[0].toString(),
    d: member.ratio[1].toString()
  };
}

function edgeTarget(left, right, targetSet) {
  const ratio = div(right.ratio, left.ratio),
    label = show(ratio),
    target = targetSet?.targets.find(value => value.ratio.label === label);
  return {
    ratio: label,
    ...(target ? {id: target.id} : {}),
    n: ratio[0].toString(),
    d: ratio[1].toString()
  };
}

function chordPairTargets(members, targetSet) {
  const pairs = [];
  for (let fromMember = 0; fromMember < members.length; fromMember++)
    for (let toMember = fromMember + 1; toMember < members.length; toMember++) {
      pairs.push({
        fromMember,
        toMember,
        target: edgeTarget(members[fromMember], members[toMember], targetSet)
      });
    }
  return pairs;
}

function safeCoordinateDifference(right, left) {
  const coordinate = right.map((value, index) => value - left[index]);
  if (!coordinate.every(Number.isSafeInteger))
    throw Error('Chord approximation dyad coordinate exceeds the safe integer range.');
  return coordinate;
}

function scoreEdges(edges) {
  const errors = edges
    .filter(edge => edge.status === 'evaluated')
    .map(edge => edge.absoluteErrorCents);
  return errors.length
    ? {
        sumAbsoluteErrorCents: errors.reduce((sum, value) => sum + value, 0),
        maximumAbsoluteErrorCents: Math.max(...errors)
      }
    : null;
}

function scoreChordCoordinates(evaluateForTarget, pairs, coordinates) {
  let sumAbsoluteErrorCents = 0,
    maximumAbsoluteErrorCents = 0;
  for (const {fromMember, toMember, target} of pairs) {
    const coordinate = safeCoordinateDifference(coordinates[toMember], coordinates[fromMember]);
    const record = evaluateForTarget(target)(coordinate),
      error = record.absoluteErrorCents;
    sumAbsoluteErrorCents += error;
    maximumAbsoluteErrorCents = Math.max(maximumAbsoluteErrorCents, error);
  }
  return {sumAbsoluteErrorCents, maximumAbsoluteErrorCents};
}

function coordinateCollisions(index, coordinate) {
  const values = index ? edgeInterpretations(index, coordinate) : [];
  return {
    collisionTargetIds: values.map(value => value.targetId),
    collisions: values.map(value => ({
      targetId: value.targetId,
      ratio: value.ratio,
      idealCents: value.idealCents
    }))
  };
}

function compareChordCandidates(a, b) {
  return (
    a.scoreCents - b.scoreCents ||
    a.maximumDyadErrorCents - b.maximumDyadErrorCents ||
    compareIndexLists(a.memberCoordinates.flat(), b.memberCoordinates.flat())
  );
}

function chordEdges(evaluateForTarget, pairs, coordinates, collision) {
  const edges = [];
  for (const {fromMember, toMember, target} of pairs) {
    const coordinate = safeCoordinateDifference(coordinates[toMember], coordinates[fromMember]);
    const record = evaluateForTarget(target)(coordinate),
      collisionRecords = coordinateCollisions(collision.index, coordinate);
    edges.push(
      immutable({
        fromMember,
        toMember,
        status: 'evaluated',
        targetRatio: target.ratio,
        targetId: record.targetId,
        coordinate,
        tunedCents: record.tunedCents,
        idealCents: record.idealCents,
        signedErrorCents: record.signedErrorCents,
        absoluteErrorCents: record.absoluteErrorCents,
        ...collisionRecords
      })
    );
  }
  return edges;
}

function makeCanonicalChordComparison(
  context,
  evaluateForTarget,
  members,
  pairs,
  collision,
  targetSet
) {
  const canonicalCoordinates = members.map(member => member.canonicalCoordinate),
    complete = canonicalCoordinates.every(Boolean);
  const memberRecords = members.map((member, index) => {
    const target = ratioTarget(member, targetSet),
      coordinate = canonicalCoordinates[index];
    const record = coordinate ? evaluateForTarget(target)(coordinate) : null;
    return immutable({
      memberIndex: index,
      ratio: member.label,
      targetId: target.id ?? null,
      status: record ? 'mapped' : 'outside-basis',
      coordinate: coordinate ? [...coordinate] : null,
      tunedCents: record?.tunedCents ?? null,
      idealCents: record?.idealCents ?? targetRecord(target, context).idealCents,
      signedErrorCents: record?.signedErrorCents ?? null,
      absoluteErrorCents: record?.absoluteErrorCents ?? null,
      ...(coordinate
        ? coordinateCollisions(collision.index, coordinate)
        : {collisionTargetIds: [], collisions: []})
    });
  });
  const edges = [];
  for (const {fromMember, toMember, target} of pairs) {
    const left = canonicalCoordinates[fromMember],
      right = canonicalCoordinates[toMember];
    if (!left || !right) {
      edges.push(
        immutable({
          fromMember,
          toMember,
          status: 'unavailable',
          targetRatio: target.ratio,
          targetId: target.id ?? null,
          coordinate: null,
          tunedCents: null,
          idealCents: targetRecord(target, context).idealCents,
          signedErrorCents: null,
          absoluteErrorCents: null,
          collisionTargetIds: [],
          collisions: []
        })
      );
      continue;
    }
    const coordinate = safeCoordinateDifference(right, left),
      record = evaluateForTarget(target)(coordinate),
      collisionRecords = coordinateCollisions(collision.index, coordinate);
    edges.push(
      immutable({
        fromMember,
        toMember,
        status: 'evaluated',
        targetRatio: target.ratio,
        targetId: record.targetId,
        coordinate,
        tunedCents: record.tunedCents,
        idealCents: record.idealCents,
        signedErrorCents: record.signedErrorCents,
        absoluteErrorCents: record.absoluteErrorCents,
        ...collisionRecords
      })
    );
  }
  const score = complete ? scoreEdges(edges) : null;
  return immutable({
    status: complete ? 'complete' : 'incomplete',
    members: memberRecords,
    edges,
    sumAbsoluteErrorCents: score?.sumAbsoluteErrorCents ?? null,
    maximumAbsoluteErrorCents: score?.maximumAbsoluteErrorCents ?? null,
    missingMemberIndices: memberRecords
      .filter(member => member.status !== 'mapped')
      .map(member => member.memberIndex)
  });
}

class MinHeap {
  constructor(compare) {
    this.values = [];
    this.compare = compare;
  }
  get size() {
    return this.values.length;
  }
  push(value) {
    let index = this.values.push(value) - 1;
    while (index) {
      const parent = Math.floor((index - 1) / 2);
      if (this.compare(this.values[parent], value) <= 0) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = value;
  }
  pop() {
    if (!this.values.length) return null;
    const first = this.values[0],
      last = this.values.pop();
    if (this.values.length) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1,
          right = left + 1;
        if (left >= this.values.length) break;
        const child =
          right < this.values.length && this.compare(this.values[right], this.values[left]) < 0
            ? right
            : left;
        if (this.compare(this.values[child], last) >= 0) break;
        this.values[index] = this.values[child];
        index = child;
      }
      this.values[index] = last;
    }
    return first;
  }
}

function compareIndexLists(a, b) {
  for (let index = 0; index < a.length; index++)
    if (a[index] !== b[index]) return a[index] - b[index];
  return 0;
}
function combinationKey(indices) {
  return JSON.stringify(indices);
}

/**
 * Search coherent chord-level approximations. Each candidate chooses one
 * root-relative coordinate per JI member; every dyad coordinate is derived
 * as `right - left`, so independent edge optima can never form a false chord.
 * `options` requires a mapping context and tuned cents (or a full state).
 */
export function* chordApproximationSteps(interpretation, options = {}) {
  const source = chordInterpretation(interpretation),
    contextInput = options.context ?? options.mapping ?? options.state;
  const tuningInput = options.tuning ?? options.state ?? contextInput;
  if (!contextInput || !tuningInput)
    throw Error('Chord approximation search needs a mapping context and tuned period/generator.');
  const context = mappingContext(contextInput),
    tuning = tuningRecord(context, tuningInput),
    generatorBound = options.generatorBound ?? 32,
    memberCandidateLimit = options.memberCandidateLimit ?? 8,
    combinationCap = options.combinationCap ?? 10000,
    cancellationCap = options.cancellationCap ?? 250000,
    maxResults = options.maxResults ?? 12,
    minimumImprovementCents = options.minimumImprovementCents ?? 0.1;
  if (!Number.isInteger(generatorBound) || generatorBound < 0 || generatorBound > 256)
    throw Error('Chord generator bound must be an integer from 0 through 256.');
  if (
    !Number.isInteger(memberCandidateLimit) ||
    memberCandidateLimit < 1 ||
    memberCandidateLimit > 32
  )
    throw Error('Chord member candidate limit must be from 1 through 32.');
  if (!Number.isInteger(combinationCap) || combinationCap < 1 || combinationCap > 100000)
    throw Error('Chord combination cap must be from 1 through 100000.');
  if (!Number.isInteger(cancellationCap) || cancellationCap < 1 || cancellationCap > 1000000)
    throw Error('Chord cancellation cap must be from 1 through 1000000.');
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 50)
    throw Error('Chord approximation results must be from 1 through 50.');
  if (!Number.isFinite(minimumImprovementCents) || minimumImprovementCents < 0)
    throw Error('Chord improvement threshold must be zero or more cents.');
  const targetSet = asTargetSet(options.targetSet),
    collision = collisionLookup(context, targetSet),
    evaluationCache = new Map(),
    evaluateForTarget = target => {
      const key = JSON.stringify([target.ratio, target.id ?? null]);
      if (!evaluationCache.has(key))
        evaluationCache.set(key, prepareEvaluator(context, tuning, target));
      return evaluationCache.get(key);
    },
    memberTargets = source.members.map(member => ratioTarget(member, targetSet)),
    edgeTargets = chordPairTargets(source.members, targetSet);
  const cacheKey = JSON.stringify([
    source.interpretationId,
    source.identity.fingerprint,
    source.preferredLabel,
    source.familyId,
    source.dualFamilyId,
    source.exactDualId,
    source.presentationForm,
    context.id,
    tuning.id,
    generatorBound,
    memberCandidateLimit,
    combinationCap,
    cancellationCap,
    maxResults,
    minimumImprovementCents,
    targetSet?.id ?? null
  ]);
  return yield* (function* () {
    const memberData = source.members.map((member, index) => {
      const target = memberTargets[index],
        canonicalRecord = targetRecord(target, context),
        canonicalCoordinate = canonicalRecord.canonicalCoordinate;
      if (index === 0) {
        const root = rankApproximationCoordinates(context, tuning, target, [[0, 0]])[0];
        return {
          member,
          target,
          canonicalCoordinate,
          candidateRecords: [root],
          sampledCoordinates: 1,
          truncated: false
        };
      }
      const coordinates = orderedCoordinates(generatorBound, {...canonicalRecord, ...tuning}),
        ranked = rankApproximationCoordinates(context, tuning, target, coordinates);
      return {
        member,
        target,
        canonicalCoordinate,
        candidateRecords: ranked.slice(0, memberCandidateLimit),
        sampledCoordinates: coordinates.length,
        truncated: ranked.length > memberCandidateLimit
      };
    });
    const canonicalComparison = makeCanonicalChordComparison(
      context,
      evaluateForTarget,
      memberData.map(value => ({...value.member, canonicalCoordinate: value.canonicalCoordinate})),
      edgeTargets,
      collision,
      targetSet
    );
    const pools = memberData.map(value => value.candidateRecords),
      pairCount = edgeTargets.length,
      product = pools.slice(1).reduce((value, pool) => value * BigInt(pool.length), 1n),
      memberDomainsTruncated = memberData.some(value => value.truncated),
      compareItems = (a, b) => a.priority - b.priority || compareIndexLists(a.indices, b.indices),
      heap = new MinHeap(compareItems),
      seen = new Set(),
      initial = Array(pools.length - 1).fill(0);
    const priority = indices =>
      indices.reduce(
        (sum, index, memberIndex) => sum + pools[memberIndex + 1][index].absoluteErrorCents,
        0
      );
    heap.push({indices: initial, priority: priority(initial)});
    seen.add(combinationKey(initial));
    const canonicalTuple =
        canonicalComparison.status === 'complete'
          ? JSON.stringify(memberData.map(value => value.canonicalCoordinate))
          : null,
      candidates = [],
      resultLimit = maxResults;
    let combinationsExplored = 0,
      cancellationCount = 0,
      qualifyingCandidateCount = 0,
      cancelled = false;
    while (
      heap.size &&
      combinationsExplored < combinationCap &&
      cancellationCount + pairCount <= cancellationCap
    ) {
      if (options.signal?.aborted || options.shouldCancel?.()) {
        cancelled = true;
        break;
      }
      if (combinationsExplored > 0 && combinationsExplored % 256 === 0) {
        yield searchCheckpoint;
        if (options.signal?.aborted || options.shouldCancel?.()) {
          cancelled = true;
          break;
        }
      }
      const item = heap.pop(),
        coordinates = [
          [0, 0],
          ...item.indices.map(
            (candidateIndex, memberIndex) => pools[memberIndex + 1][candidateIndex].coordinate
          )
        ];
      combinationsExplored++;
      for (let memberIndex = 0; memberIndex < item.indices.length; memberIndex++) {
        const next = [...item.indices];
        next[memberIndex]++;
        if (next[memberIndex] < pools[memberIndex + 1].length && !seen.has(combinationKey(next))) {
          seen.add(combinationKey(next));
          heap.push({indices: next, priority: priority(next)});
        }
      }
      if (canonicalTuple && JSON.stringify(coordinates) === canonicalTuple) continue;
      cancellationCount += pairCount;
      const score = scoreChordCoordinates(evaluateForTarget, edgeTargets, coordinates);
      const improvementCents =
        canonicalComparison.status === 'complete'
          ? canonicalComparison.sumAbsoluteErrorCents - score.sumAbsoluteErrorCents
          : null;
      if (
        improvementCents !== null &&
        (improvementCents <= COMPARISON_EPSILON_CENTS ||
          improvementCents + COMPARISON_EPSILON_CENTS < minimumImprovementCents)
      )
        continue;
      qualifyingCandidateCount++;
      const rankSummary = {
        scoreCents: score.sumAbsoluteErrorCents,
        maximumDyadErrorCents: score.maximumAbsoluteErrorCents,
        memberCoordinates: coordinates
      };
      if (
        candidates.length === resultLimit &&
        compareChordCandidates(rankSummary, candidates.at(-1)) >= 0
      )
        continue;
      const edges = chordEdges(evaluateForTarget, edgeTargets, coordinates, collision);
      const members = source.members.map((member, index) => {
        const coordinate = coordinates[index],
          evaluation = evaluateForTarget(memberTargets[index])(coordinate);
        return immutable({
          memberIndex: index,
          ratio: member.label,
          targetId: memberTargets[index].id ?? null,
          coordinate,
          tunedCents: evaluation.tunedCents,
          idealCents: evaluation.idealCents,
          signedErrorCents: evaluation.signedErrorCents,
          absoluteErrorCents: evaluation.absoluteErrorCents,
          canonicalCoordinate: memberData[index].canonicalCoordinate,
          canonicalStatus: memberData[index].canonicalCoordinate ? 'mapped' : 'outside-basis',
          candidateDomainIndex: index === 0 ? 0 : item.indices[index - 1]
        });
      });
      const tupleKey = JSON.stringify(coordinates),
        id = `approximate-chord-shape-v1:${JSON.stringify([context.id, tuning.id, source.interpretationId, tupleKey])}`;
      const candidate = immutable({
        id,
        kind: 'approximate-chord-shape',
        mappingId: context.id,
        tuningId: tuning.id,
        interpretationId: source.interpretationId,
        identityId: source.identity.fingerprint,
        preferredLabel: source.preferredLabel,
        familyId: source.familyId,
        dualFamilyId: source.dualFamilyId,
        exactDualId: source.exactDualId,
        presentationForm: source.presentationForm,
        targetSetId: targetSet?.id ?? null,
        memberCoordinates: coordinates,
        members,
        edges,
        scoreCents: score.sumAbsoluteErrorCents,
        maximumDyadErrorCents: score.maximumAbsoluteErrorCents,
        canonicalComparisonId: `canonical-chord-comparison-v1:${JSON.stringify([context.id, tuning.id, source.interpretationId])}`,
        improvementCents,
        searchDomain: 'bounded-root-relative-lattice',
        generatorBound,
        memberCandidateLimit
      });
      candidates.push(candidate);
      candidates.sort(compareChordCandidates);
      if (candidates.length > resultLimit) candidates.pop();
    }
    const domainExhausted =
      !cancelled && BigInt(combinationsExplored) >= product && !memberDomainsTruncated;
    const limits = {
      generatorCoefficient: [-generatorBound, generatorBound],
      memberCandidateLimit,
      combinationCap,
      cancellationCap,
      minimumImprovementCents,
      maxResults
    };
    const truncatedResults = qualifyingCandidateCount > candidates.length,
      partial = !domainExhausted;
    return immutable({
      schemaVersion: 1,
      id: `chord-approximation-search-v1:${cacheKey}`,
      kind: 'chord-approximation-search',
      interpretationId: source.interpretationId,
      identityId: source.identity.fingerprint,
      interpretation: {
        id: source.interpretationId,
        identityId: source.identity.fingerprint,
        preferredLabel: source.preferredLabel,
        familyId: source.familyId,
        dualFamilyId: source.dualFamilyId,
        exactDualId: source.exactDualId,
        presentationForm: source.presentationForm
      },
      mappingId: context.id,
      tuningId: tuning.id,
      targetSetId: targetSet?.id ?? null,
      canonicalComparison,
      memberDomains: memberData.map((value, index) => ({
        memberIndex: index,
        ratio: value.member.label,
        canonicalCoordinate: value.canonicalCoordinate,
        sampledCoordinateCount: value.sampledCoordinates,
        candidateCoordinates: value.candidateRecords.map(record => record.coordinate),
        candidateAbsoluteErrors: value.candidateRecords.map(record => record.absoluteErrorCents),
        truncated: value.truncated
      })),
      bounds: {
        ...limits,
        cancellationWork:
          'derive one coordinate per unordered dyad by subtracting root-relative member coordinates'
      },
      candidates,
      completeness: {
        complete: !partial,
        partial,
        cancelled,
        domainExhausted: !partial,
        candidateProductCount: product.toString(),
        combinationsExplored,
        cancellationCount,
        combinationCapReached:
          combinationsExplored >= combinationCap && BigInt(combinationsExplored) < product,
        cancellationCapReached: heap.size > 0 && cancellationCount + pairCount > cancellationCap,
        memberDomainsTruncated,
        qualifyingCandidateCount,
        returnedCount: candidates.length,
        resultsTruncated: truncatedResults,
        searchOrder:
          'best-first sum of root-relative member absolute errors within retained member domains'
      },
      status: cancelled
        ? 'cancelled'
        : candidates.length
          ? 'ready'
          : partial
            ? 'search-partial'
            : canonicalComparison.status === 'complete'
              ? 'no-improvement-within-bounds'
              : 'no-candidate-within-bounds',
      limitations: [
        `Each root-relative member search uses generator coefficients −${generatorBound} through +${generatorBound}.`,
        ...(memberDomainsTruncated
          ? ['One or more member domains were reduced to the configured best-candidate limit.']
          : []),
        ...(partial
          ? [
              'Search coverage is partial because a member shortlist or combination/cancellation cap limited the domain.'
            ]
          : []),
        ...(canonicalComparison.status === 'incomplete'
          ? [
              'The canonical JI chord has no complete mapping in this mapping subgroup, so improvement is not defined.'
            ]
          : []),
        ...(truncatedResults
          ? ['More qualifying chord approximations were found than the configured result limit.']
          : []),
        ...(targetSet
          ? []
          : ['No JI target set was supplied, so mapped-identity collision lookup is unavailable.'])
      ]
    });
  })();
}

export function searchChordApproximationsAsync(input, options = {}, scheduler = {}) {
  return finishSearchAsync(chordApproximationSteps(input, options), scheduler);
}
