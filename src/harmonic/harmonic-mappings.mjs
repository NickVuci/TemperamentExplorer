import {assignment, checkAssignments, target} from '../core/assignments.mjs';
import {chordIdentity} from '../chords/chord-identity.mjs';
import {projectCoordinateShape} from '../chords/chord-projection.mjs';
import {mappingContext} from './harmonic-context.mjs';
import {ratioMonzo, mapMonzo} from '../core/ji-monzo.mjs';
import {harmonicIdentity} from './harmonic-equivalence.mjs';
import {BoundedCache, immutable} from '../core/cache.mjs';
import {tuningKey} from './harmonic-types.mjs';

const VARIANT_VERSION = 1;
const extensionCache = new BoundedCache(64);

function sortedBasis(context) {
  return [...context.basis].sort((a, b) => a - b);
}
function sameBasis(a, b) {
  const left = sortedBasis(a),
    right = sortedBasis(b);
  return left.length === right.length && left.every((prime, index) => prime === right[index]);
}
function columnsByPrime(context) {
  return new Map(
    context.basis.map((prime, index) => [prime, [context.rows[0][index], context.rows[1][index]]])
  );
}
function equalPair(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

function exactQuotient(numerator, denominator) {
  if (denominator === 0n || numerator % denominator !== 0n) return null;
  const result = numerator / denominator;
  if (result > BigInt(Number.MAX_SAFE_INTEGER) || result < BigInt(Number.MIN_SAFE_INTEGER))
    return null;
  return Number(result);
}

/** Find U in GL(2,Z) exactly when candidate rows are U times the active rows. */
function coordinateRebase(active, candidate) {
  if (!sameBasis(active, candidate)) return null;
  const activeColumns = columnsByPrime(active),
    candidateColumns = columnsByPrime(candidate),
    primes = sortedBasis(active);
  let first = -1,
    second = -1,
    determinant = 0n;
  for (let i = 0; i < primes.length && first < 0; i++)
    for (let j = i + 1; j < primes.length; j++) {
      const a = activeColumns.get(primes[i]),
        b = activeColumns.get(primes[j]);
      const det = BigInt(a[0]) * BigInt(b[1]) - BigInt(b[0]) * BigInt(a[1]);
      if (det !== 0n) {
        first = i;
        second = j;
        determinant = det;
        break;
      }
    }
  if (first < 0) return null;
  const a = activeColumns.get(primes[first]),
    b = activeColumns.get(primes[second]);
  const u = [];
  for (let row = 0; row < 2; row++) {
    const x = candidateColumns.get(primes[first])[row],
      y = candidateColumns.get(primes[second])[row];
    const firstNumerator = BigInt(x) * BigInt(b[1]) - BigInt(y) * BigInt(a[1]);
    const secondNumerator = BigInt(a[0]) * BigInt(y) - BigInt(b[0]) * BigInt(x);
    const left = exactQuotient(firstNumerator, determinant),
      right = exactQuotient(secondNumerator, determinant);
    if (left === null || right === null) return null;
    u.push([left, right]);
  }
  for (const prime of primes) {
    const source = activeColumns.get(prime),
      target = candidateColumns.get(prime);
    const transformed = u.map(row => row[0] * source[0] + row[1] * source[1]);
    if (!equalPair(transformed, target)) return null;
  }
  const det = u[0][0] * u[1][1] - u[0][1] * u[1][0];
  return Math.abs(det) === 1 ? u : null;
}

function compareContexts(active, candidate) {
  const oldColumns = columnsByPrime(active),
    newColumns = columnsByPrime(candidate);
  const preservedColumns = [],
    changedColumns = [],
    addedPrimes = [],
    removedPrimes = [];
  for (const [prime, coordinate] of oldColumns) {
    if (!newColumns.has(prime)) {
      removedPrimes.push(prime);
      continue;
    }
    const next = newColumns.get(prime);
    (equalPair(coordinate, next) ? preservedColumns : changedColumns).push({
      prime,
      active: [...coordinate],
      candidate: [...next]
    });
  }
  for (const prime of candidate.basis) if (!oldColumns.has(prime)) addedPrimes.push(prime);
  preservedColumns.sort((a, b) => a.prime - b.prime);
  changedColumns.sort((a, b) => a.prime - b.prime);
  addedPrimes.sort((a, b) => a - b);
  removedPrimes.sort((a, b) => a - b);
  let relation;
  if (active.id === candidate.id) relation = 'same-map';
  else if (coordinateRebase(active, candidate)) relation = 'coordinate-rebase';
  else if (!removedPrimes.length && !changedColumns.length && addedPrimes.length)
    relation = 'preserved-column-extension';
  else relation = 'changed-mapping';
  const rebaseMatrix =
    relation === 'coordinate-rebase' ? coordinateRebase(active, candidate) : null;
  return {relation, preservedColumns, changedColumns, addedPrimes, removedPrimes, rebaseMatrix};
}

function ratioInput(input) {
  if (typeof input === 'string') return input;
  if (Array.isArray(input) && input.length === 2) return input;
  if (input && typeof input === 'object' && input.ratio !== undefined)
    return ratioInput(input.ratio);
  if (input && typeof input === 'object' && input.n !== undefined && input.d !== undefined)
    return {n: input.n, d: input.d};
  throw Error('An assignment needs a ratio string or positive n/d pair.');
}

function normalizeAssignments(input) {
  if (!Array.isArray(input) || !input.length)
    throw Error('Provide at least one exact ratio assignment.');
  return input.map((item, index) => {
    if (!item || typeof item !== 'object')
      throw Error(`Assignment ${index + 1} must be an object.`);
    const value =
      item.ratio ??
      item.interval ??
      (item.n !== undefined && item.d !== undefined ? {n: item.n, d: item.d} : null);
    const monzo = ratioMonzo(ratioInput(value), null, {includeBasis: false});
    const coordinate = item.coordinate ?? item.m;
    if (
      !Array.isArray(coordinate) ||
      coordinate.length !== 2 ||
      !coordinate.every(Number.isSafeInteger)
    ) {
      const error = new Error(
        'Assignment coordinates must be safe integer [period, generator] columns.'
      );
      error.code = 'invalid-coordinate';
      throw error;
    }
    const normalized = assignment(target(monzo.ratio), coordinate);
    return {
      ratio: monzo.ratio,
      n: normalized.n,
      d: normalized.d,
      coordinate: [...normalized.m],
      assignment: normalized
    };
  });
}

function baseTargetReports(active, assignments) {
  return assignments.map(({ratio, coordinate}) => {
    const factor = ratioMonzo(ratio, active.basis);
    const mapped = factor.withinBasis ? mapMonzo(active.rows, factor.basisMonzo) : null;
    return {
      ratio,
      baseStatus: mapped ? 'mapped' : 'outside-basis',
      canonicalCoordinate: mapped,
      proposedCoordinate: [...coordinate],
      alternativesWithinFixedMapping: mapped ? [] : null
    };
  });
}

function failure(active, status, relation, assignments, validation) {
  const targetReports = assignments.length ? baseTargetReports(active, assignments) : [];
  return immutable({
    schemaVersion: VARIANT_VERSION,
    status,
    relation,
    kind: null,
    baseMappingId: active.id,
    candidateMappingId: null,
    mappingId: null,
    alternative: false,
    candidateContext: null,
    preservedColumns: [],
    changedColumns: [],
    addedPrimes: [],
    removedPrimes: [],
    rebaseMatrix: null,
    assignments: assignments.map(({ratio, coordinate}) => ({ratio, coordinate})),
    targetReports,
    validation,
    alternativesWithinFixedMapping:
      targetReports.length && targetReports.every(item => item.baseStatus === 'mapped') ? [] : null
  });
}

function variantRecord(active, candidate, assignments, validation) {
  const comparison = compareContexts(active, candidate),
    relation = comparison.relation;
  const variantId = `mapping-variant-v1:${JSON.stringify([active.id, candidate.id, relation])}`;
  const alternative = relation === 'preserved-column-extension' || relation === 'changed-mapping';
  const targetReports = assignments.length ? baseTargetReports(active, assignments) : [];
  return immutable({
    schemaVersion: VARIANT_VERSION,
    id: variantId,
    status: 'compatible',
    relation,
    kind: relation === 'preserved-column-extension' ? 'extension' : 'other-context',
    baseMappingId: active.id,
    candidateMappingId: candidate.id,
    mappingId: candidate.id,
    alternative,
    candidateContext: candidate,
    preservedColumns: comparison.preservedColumns,
    changedColumns: comparison.changedColumns,
    addedPrimes: comparison.addedPrimes,
    removedPrimes: comparison.removedPrimes,
    rebaseMatrix: comparison.rebaseMatrix,
    assignments: assignments.map(({ratio, coordinate}) => ({ratio, coordinate})),
    targetReports,
    alternativesWithinFixedMapping:
      targetReports.length && targetReports.every(item => item.baseStatus === 'mapped') ? [] : null,
    validation
  });
}

function checkResult(active, assignments) {
  const checked = checkAssignments(
    active,
    assignments.map(item => item.assignment)
  );
  return checked;
}

function searchTuning(input, options, active) {
  const tuning = options.tuning ?? input;
  const periodCents = tuning?.periodCents ?? tuning?.p,
    generatorCents = tuning?.generatorCents ?? tuning?.g;
  if (
    !Number.isFinite(periodCents) ||
    periodCents <= 0 ||
    !Number.isFinite(generatorCents) ||
    generatorCents <= 0 ||
    generatorCents >= periodCents
  ) {
    throw Error('Alternative mapping search needs the active tuned period and generator cents.');
  }
  if (tuning?.mappingId !== undefined && tuning.mappingId !== active.id)
    throw Error('Alternative mapping tuning belongs to a different mapping context.');
  return {
    periodCents,
    generatorCents,
    id: tuningKey({mappingId: active.id, periodCents, generatorCents})
  };
}

function nearestIntegers(value) {
  const low = Math.floor(value),
    high = Math.ceil(value),
    distance = Math.min(value - low, high - value);
  return [
    ...new Set(
      [low, high].filter(candidate => Math.abs(Math.abs(value - candidate) - distance) <= 1e-12)
    )
  ];
}

function extensionSearchResult(status, base, target, bounds, candidates, completeness, extra = {}) {
  return immutable({
    schemaVersion: 1,
    status,
    baseMappingId: base.id,
    targetRatio: target.ratio,
    sourceTargetId: target.sourceTargetId ?? null,
    targetMonzo: target.sparseMonzo,
    missingPrimes: target.missingPrimes,
    canonicalCoordinate: extra.canonicalCoordinate ?? null,
    bounds,
    candidates,
    completeness,
    limitations: extra.limitations ?? [],
    reason: extra.reason ?? null
  });
}

/**
 * Enumerate bounded whole-context extensions for a target with exactly one
 * missing prime. `context` must include (or be paired with) the tuning used
 * for ranking; returned mappings inherit those cents without retuning.
 */
export function enumerateMappingExtensions(contextInput, targetInput, options = {}) {
  const active = mappingContext(contextInput),
    factor = ratioMonzo(ratioInput(targetInput), active.basis);
  const target = {
    ratio: factor.ratio,
    sparseMonzo: factor.sparseMonzo,
    missingPrimes: factor.missingPrimes,
    numerator: factor.numerator,
    denominator: factor.denominator,
    basisMonzo: factor.basisMonzo,
    sourceTargetId: typeof targetInput?.id === 'string' ? targetInput.id : null
  };
  const generatorBound = options.generatorBound ?? 16,
    maxResults = options.maxResults ?? 20;
  if (![16, 32, 64].includes(generatorBound))
    throw Error('Generator search bound must be 16, 32 or 64.');
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 20)
    throw Error('Return at most 20 mapping extensions.');
  const bounds = {
    generatorCoefficient: [-generatorBound, generatorBound],
    periodOffsets: [-1, 0, 1],
    coefficientLimit: 1000,
    maxResults
  };
  if (!factor.missingPrimes.length) {
    const canonicalCoordinate = mapMonzo(active.rows, factor.basisMonzo);
    return extensionSearchResult(
      'already-mapped',
      active,
      target,
      bounds,
      [],
      {domainExhausted: true, candidateCount: 0, returnedCount: 0, truncated: false},
      {
        canonicalCoordinate,
        limitations: ['A fixed mapping gives this in-basis JI interval one exact coordinate.']
      }
    );
  }
  if (factor.missingPrimes.length !== 1) {
    return extensionSearchResult(
      'unresolved',
      active,
      target,
      bounds,
      [],
      {domainExhausted: false, candidateCount: 0, returnedCount: 0, truncated: false},
      {
        reason: 'multiple-missing-primes',
        limitations: [
          'Automatic Cartesian search over multiple missing primes is not supported. Supply complete explicit assignments to validateMappingVariant.'
        ]
      }
    );
  }
  if (active.basis.length >= 10) {
    return extensionSearchResult(
      'unresolved',
      active,
      target,
      bounds,
      [],
      {domainExhausted: false, candidateCount: 0, returnedCount: 0, truncated: false},
      {
        reason: 'basis-capacity',
        limitations: ['The application supports at most ten mapping basis primes.']
      }
    );
  }
  const tuning = searchTuning(contextInput, options, active),
    prime = factor.missingPrimes[0],
    exponent = Number(factor.sparseMonzo[prime]);
  if (!Number.isSafeInteger(exponent) || exponent === 0)
    throw Error('Missing-prime exponent must be a nonzero integer.');
  const cacheKey = JSON.stringify([
    active.id,
    tuning.id,
    target.ratio,
    target.sourceTargetId,
    prime,
    exponent,
    generatorBound,
    maxResults
  ]);
  return extensionCache.get(cacheKey, () => {
    const primeIdealCents = 1200 * Math.log2(prime),
      targetIdealCents = 1200 * Math.log2(Number(factor.numerator) / Number(factor.denominator));
    const knownCoordinate = mapMonzo(active.rows, factor.basisMonzo),
      accepted = new Map();
    let rejectedCoefficient = 0,
      rejectedValidation = 0;
    for (let generator = -generatorBound; generator <= generatorBound; generator++) {
      const idealPeriod =
        (primeIdealCents - generator * tuning.generatorCents) / tuning.periodCents;
      const nearest = nearestIntegers(idealPeriod),
        periods = new Set(nearest.flatMap(value => [-1, 0, 1].map(offset => value + offset)));
      for (const period of periods) {
        const primeCoordinate = [period, generator];
        if (primeCoordinate.some(value => !Number.isSafeInteger(value) || Math.abs(value) > 1000)) {
          rejectedCoefficient++;
          continue;
        }
        const variant = validateMappingVariant(contextInput, {
          assignments: [{ratio: `${prime}/1`, coordinate: primeCoordinate}]
        });
        if (variant.status !== 'compatible' || variant.relation !== 'preserved-column-extension') {
          rejectedValidation++;
          continue;
        }
        const targetCoordinate = mapMonzo(
          variant.candidateContext.rows,
          ratioMonzo(
            [BigInt(factor.numerator), BigInt(factor.denominator)],
            variant.candidateContext.basis
          ).basisMonzo
        );
        const derivedCoordinate = [
          knownCoordinate[0] + exponent * period,
          knownCoordinate[1] + exponent * generator
        ];
        if (!equalPair(targetCoordinate, derivedCoordinate))
          throw Error('Prime-power extension failed exact coordinate reconstruction.');
        const primeTunedCents = period * tuning.periodCents + generator * tuning.generatorCents;
        const targetTunedCents =
          targetCoordinate[0] * tuning.periodCents + targetCoordinate[1] * tuning.generatorCents;
        const candidateTuningId = tuningKey({
          mappingId: variant.candidateMappingId,
          periodCents: tuning.periodCents,
          generatorCents: tuning.generatorCents
        });
        const signedErrorCents = targetTunedCents - targetIdealCents;
        const validationEvidence = {
          status: variant.status,
          relation: variant.relation,
          baseMappingId: variant.baseMappingId,
          candidateMappingId: variant.candidateMappingId,
          preservedColumns: variant.preservedColumns,
          assignedPrime: {ratio: `${prime}/1`, coordinate: primeCoordinate},
          solver: variant.validation
        };
        const id = `mapping-extension-v1:${JSON.stringify([active.id, target.ratio, variant.candidateMappingId])}`;
        accepted.set(variant.candidateMappingId, {
          id,
          variantId: variant.id,
          mappingId: variant.candidateMappingId,
          mappingContext: variant.candidateContext,
          relation: variant.relation,
          prime,
          primeExponent: exponent,
          primeCoordinate,
          targetRatio: target.ratio,
          sourceTargetId: target.sourceTargetId,
          canonicalCoordinate: null,
          targetCoordinate,
          idealCents: targetIdealCents,
          tunedCents: targetTunedCents,
          signedErrorCents,
          absoluteErrorCents: Math.abs(signedErrorCents),
          primeIdealCents,
          primeTunedCents,
          signedPrimeErrorCents: primeTunedCents - primeIdealCents,
          generatorComplexity: Math.abs(generator),
          tuningId: candidateTuningId,
          inheritedTuning: {
            periodCents: tuning.periodCents,
            generatorCents: tuning.generatorCents,
            fromMappingId: active.id
          },
          validationEvidence
        });
      }
    }
    const all = [...accepted.values()].sort(
      (a, b) =>
        a.absoluteErrorCents - b.absoluteErrorCents ||
        a.generatorComplexity - b.generatorComplexity ||
        Math.abs(a.primeCoordinate[0]) - Math.abs(b.primeCoordinate[0]) ||
        a.primeCoordinate[1] - b.primeCoordinate[1] ||
        a.primeCoordinate[0] - b.primeCoordinate[0]
    );
    const candidates = all.slice(0, maxResults),
      truncated = all.length > candidates.length;
    return extensionSearchResult(
      candidates.length ? 'ready' : 'no-compatible-candidates',
      active,
      target,
      {
        ...bounds,
        missingPrime: prime,
        primeExponent: exponent,
        tuningId: tuning.id,
        periodCents: tuning.periodCents,
        generatorCents: tuning.generatorCents
      },
      candidates,
      {
        domainExhausted: true,
        candidateCount: all.length,
        returnedCount: candidates.length,
        truncated,
        rejectedCoefficient,
        rejectedValidation,
        ranking:
          'target absolute tuning error, then |generator column|, then deterministic coordinate order'
      },
      {
        limitations: [
          `Search covers only |generator coefficient| ≤ ${generatorBound} and nearest period coefficient ±1.`,
          'Results are bounded extension candidates, not a complete list of all compatible mappings.',
          ...(truncated
            ? [
                'More valid contexts exist within the search bounds than the result limit; only the best-ranked results are returned.'
              ]
            : [])
        ]
      }
    );
  });
}

/**
 * Validate either an explicit complete mapping context or exact interval assignments.
 * Assignments alone are solved by the existing exact `checkAssignments` engine.
 */
export function validateMappingVariant(activeMapping, proposal = {}) {
  const active = mappingContext(activeMapping);
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal))
    throw Error('A mapping variant proposal must be an object.');
  const rawAssignments = proposal.assignments ?? [];
  if (!Array.isArray(rawAssignments)) throw Error('Mapping variant assignments must be an array.');
  let assignments = [];
  if (rawAssignments.length) {
    try {
      assignments = normalizeAssignments(rawAssignments);
    } catch (error) {
      return failure(
        active,
        error.code === 'invalid-coordinate' ? 'conflict' : 'conflict',
        'conflict',
        [],
        {status: 'conflict', reason: error.code ?? 'invalid-assignment', message: error.message}
      );
    }
  }
  const rawCandidate =
    proposal.mapping ??
    (Array.isArray(proposal.basis) && Array.isArray(proposal.rows) ? proposal : null);

  if (!rawCandidate) {
    if (!assignments.length)
      throw Error('Provide a complete mapping context or at least one exact ratio assignment.');
    const checked = checkResult(active, assignments);
    if (checked.status !== 'compatible') {
      const status = checked.status === 'conflict' ? 'conflict' : 'unresolved';
      return failure(active, status, status, assignments, checked);
    }
    const candidate = mappingContext({basis: checked.basis, rows: checked.rows});
    return variantRecord(active, candidate, assignments, {
      ...checked,
      method: 'exact-compatible-extension'
    });
  }

  const candidate = mappingContext(rawCandidate);
  let validation = {
    status: 'compatible',
    message: 'Candidate mapping is a valid exact rank-2 context.'
  };
  if (assignments.length) {
    const checked = checkResult(candidate, assignments);
    if (checked.status !== 'compatible') {
      const status = checked.status === 'conflict' ? 'conflict' : 'unresolved';
      return failure(active, status, status, assignments, checked);
    }
    const checkedContext = mappingContext({basis: checked.basis, rows: checked.rows});
    if (checkedContext.id !== candidate.id) {
      return failure(active, 'unresolved', 'unresolved', assignments, {
        status: 'unresolved',
        reason: 'candidate-does-not-cover-assignments',
        message:
          'The explicit candidate context does not include every assigned interval prime with a determined coordinate.'
      });
    }
    validation = {...checked, method: 'exact-candidate-assignments'};
  }
  return variantRecord(active, candidate, assignments, validation);
}

function chordInput(input) {
  if (typeof input === 'string') return chordIdentity(input);
  if (
    input?.version === 2 &&
    Array.isArray(input.canonicalRatios) &&
    typeof input.fingerprint === 'string'
  )
    return input;
  throw Error('Use an exact JI chord spelling or a version-2 chord identity.');
}

/** Project every member and dyad through one validated candidate context, without tuning or state mutation. */
export function previewMappingVariant(activeMapping, variant, input) {
  const active = mappingContext(activeMapping);
  if (
    !variant ||
    variant.schemaVersion !== VARIANT_VERSION ||
    variant.status !== 'compatible' ||
    !variant.candidateContext
  ) {
    throw Error('Preview requires a successfully validated mapping variant.');
  }
  if (variant.baseMappingId !== active.id)
    throw Error('Mapping variant was validated against a different active context.');
  const candidate = mappingContext(variant.candidateContext);
  if (candidate.id !== variant.candidateMappingId)
    throw Error('Candidate mapping context ID does not match its validated variant.');
  const identity = chordInput(input),
    family = harmonicIdentity(identity, 'octave');
  const members = identity.canonicalRatios.map((ratio, index) => {
    const factor = ratioMonzo([BigInt(ratio.n), BigInt(ratio.d)], candidate.basis);
    const coordinate = factor.withinBasis ? mapMonzo(candidate.rows, factor.basisMonzo) : null;
    return {
      memberIndex: index,
      ratio: ratio.label,
      monzo: factor.sparseMonzo,
      missingPrimes: factor.missingPrimes,
      coordinate
    };
  });
  const pairs = [];
  for (let i = 0; i < members.length; i++)
    for (let j = i + 1; j < members.length; j++) {
      const left = identity.canonicalRatios[i],
        right = identity.canonicalRatios[j];
      const factor = ratioMonzo(
        [BigInt(right.n) * BigInt(left.d), BigInt(right.d) * BigInt(left.n)],
        candidate.basis
      );
      const coordinate = factor.withinBasis ? mapMonzo(candidate.rows, factor.basisMonzo) : null;
      const from = members[i].coordinate,
        to = members[j].coordinate;
      const derivedCoordinate = from && to ? [to[0] - from[0], to[1] - from[1]] : null;
      pairs.push({
        fromMember: i,
        toMember: j,
        ratio: factor.ratio,
        monzo: factor.sparseMonzo,
        missingPrimes: factor.missingPrimes,
        coordinate,
        derivedCoordinate,
        consistent:
          coordinate && derivedCoordinate ? equalPair(coordinate, derivedCoordinate) : null
      });
    }
  const fullyMapped = members.every(member => member.coordinate !== null),
    mappedCount = members.filter(member => member.coordinate !== null).length;
  const shape = fullyMapped
    ? projectCoordinateShape(
        candidate,
        members.map(member => member.coordinate)
      )
    : null;
  return immutable({
    schemaVersion: 1,
    variantId: variant.id,
    baseMappingId: active.id,
    mappingId: candidate.id,
    relation: variant.relation,
    identityId: identity.fingerprint,
    familyId: family.familyId,
    dualFamilyId: family.dualFamilyId,
    status: fullyMapped ? 'fully-mapped' : mappedCount ? 'partially-mapped' : 'outside-basis',
    members,
    pairs,
    shapeIdentities: shape?.identities ?? null,
    memberLinks: shape?.memberLinks ?? [],
    tuningErrors: null
  });
}
