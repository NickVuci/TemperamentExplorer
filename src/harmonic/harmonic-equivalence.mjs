import {BoundedCache, immutable} from '../core/cache.mjs';
import {mapMonzo} from '../core/ji-monzo.mjs';
import {mappingContext} from './harmonic-context.mjs';
import {compareExactRatios} from '../chords/chord-identity.mjs';
import {div, rational} from '../core/rational.mjs';

const VERSION = 1;
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

function safeInteger(value, name) {
  if (!Number.isSafeInteger(value)) throw Error(`${name} must be a safe integer.`);
  return BigInt(value);
}
function safeNumber(value, name) {
  if (value > MAX_SAFE || value < -MAX_SAFE) throw Error(`${name} exceeds the safe integer range.`);
  return Number(value);
}
function pair(coordinate) {
  if (!Array.isArray(coordinate) || coordinate.length !== 2)
    throw Error('Use an integer [period, generator] coordinate.');
  return coordinate.map((value, index) => safeInteger(value, `Coordinate ${index}`));
}
function bezout(a, b) {
  let oldR = BigInt(a),
    r = BigInt(b),
    oldU = 1n,
    u = 0n,
    oldV = 0n,
    v = 1n;
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldU, u] = [u, oldU - q * u];
    [oldV, v] = [v, oldV - q * v];
  }
  if (oldR < 0n) return {g: -oldR, u: -oldU, v: -oldV};
  return {g: oldR, u: oldU, v: oldV};
}
const mod = (value, period) => ((value % period) + period) % period;
// Quotient arithmetic in Numbers is exact while every input stays below 2^20: products stay below
// 2^40 and sums far below 2^53. Larger values take the BigInt path, which gives the same results.
const SMALL = 2 ** 20;
const smallPolicy = policy =>
  Math.abs(policy.modulus) <= SMALL &&
  policy.transform.every(row => row.every(value => Math.abs(value) <= SMALL)) &&
  policy.inverse.every(row => row.every(value => Math.abs(value) <= SMALL));
const smallPoint = point => Math.abs(point[0]) <= SMALL && Math.abs(point[1]) <= SMALL;

/** Exact, period, or mapped-octave coordinate equivalence for one mapping. */
export function equivalencePolicy(stateOrContext, kind = 'exact') {
  const context = mappingContext(stateOrContext);
  if (!['exact', 'period', 'octave'].includes(kind))
    throw Error('Choose exact, period, or octave equivalence.');
  let vector = null;
  if (kind === 'period') vector = [1, 0];
  if (kind === 'octave') {
    const index = context.basis.indexOf(2);
    if (index < 0) throw Error('Octave equivalence requires prime 2 in the mapping subgroup.');
    const monzo = context.basis.map((_, i) => Number(i === index));
    vector = mapMonzo(context.rows, monzo);
    if (vector[0] === 0 && vector[1] === 0)
      throw Error('A zero mapped octave cannot define octave equivalence.');
  }
  const {g, u, v} = vector ? bezout(...vector) : {g: null, u: 1n, v: 0n};
  const [a, b] = vector ?? [0, 0];
  const transform = vector
    ? [
        [u, v],
        [-BigInt(b) / g, BigInt(a) / g]
      ]
    : [
        [1n, 0n],
        [0n, 1n]
      ];
  const inverse = vector
    ? [
        [BigInt(a) / g, -v],
        [BigInt(b) / g, u]
      ]
    : [
        [1n, 0n],
        [0n, 1n]
      ];
  const asNumbers = matrix =>
    matrix.map(row => row.map(value => safeNumber(value, 'Quotient transform')));
  const id = `equivalence-v${VERSION}:${JSON.stringify([context.id, kind, vector])}`;
  return immutable({
    schemaVersion: VERSION,
    id,
    mappingKey: context.id,
    kind,
    vector,
    modulus: g === null ? null : safeNumber(g, 'Quotient modulus'),
    transform: asNumbers(transform),
    inverse: asNumbers(inverse)
  });
}

/**
 * Return a canonical representative and the exact removed multiple of the
 * policy vector. The original equals `representative + removed` coordinatewise.
 */
export function quotientCoordinate(policy, coordinate) {
  if (policy?.schemaVersion !== VERSION || !['exact', 'period', 'octave'].includes(policy.kind))
    throw Error('Use a valid coordinate equivalence policy.');
  const x = pair(coordinate);
  if (policy.kind === 'exact')
    return immutable({
      classCoordinate: coordinate.slice(),
      key: JSON.stringify(coordinate),
      representative: coordinate.slice(),
      lift: 0,
      removed: [0, 0]
    });
  if (smallPoint(coordinate) && smallPolicy(policy)) {
    const [[u, v], [w, z]] = policy.transform,
      [[i, j], [k, l]] = policy.inverse,
      h = policy.modulus,
      y0 = u * coordinate[0] + v * coordinate[1],
      y1 = w * coordinate[0] + z * coordinate[1];
    const residue = mod(y0, h) + 0,
      representative = [i * residue + j * y1 + 0, k * residue + l * y1 + 0],
      classCoordinate = [residue, y1 + 0];
    return immutable({
      classCoordinate,
      key: JSON.stringify(classCoordinate),
      representative,
      lift: (y0 - residue) / h + 0,
      removed: [coordinate[0] - representative[0] + 0, coordinate[1] - representative[1] + 0]
    });
  }
  const [[u, v], [w, z]] = policy.transform.map(row => row.map(BigInt));
  const [[i, j], [k, l]] = policy.inverse.map(row => row.map(BigInt));
  const h = BigInt(policy.modulus),
    y0 = u * x[0] + v * x[1],
    y1 = w * x[0] + z * x[1];
  const residue = mod(y0, h),
    lift = (y0 - residue) / h;
  const representative = [i * residue + j * y1, k * residue + l * y1];
  const classCoordinate = [
    safeNumber(residue, 'Quotient residue'),
    safeNumber(y1, 'Quotient class')
  ];
  const removed = x.map((value, index) =>
    safeNumber(value - representative[index], 'Removed lift')
  );
  return immutable({
    classCoordinate,
    key: JSON.stringify(classCoordinate),
    representative: representative.map(value => safeNumber(value, 'Quotient representative')),
    lift: safeNumber(lift, 'Quotient lift'),
    removed
  });
}

// The class coordinate of quotientCoordinate alone, for a BigInt pair. shapeKey runs this for
// every member pair of every enumerated shape and needs no representative or lift.
function quotientClass(policy, x, small = false) {
  if (policy.kind === 'exact')
    return small ? x : x.map(value => safeNumber(value, 'Quotient class'));
  if (small) {
    const [[u, v], [w, z]] = policy.transform;
    return [mod(u * x[0] + v * x[1], policy.modulus) + 0, w * x[0] + z * x[1] + 0];
  }
  const [[u, v], [w, z]] = policy.transform,
    h = BigInt(policy.modulus);
  const y0 = BigInt(u) * x[0] + BigInt(v) * x[1],
    y1 = BigInt(w) * x[0] + BigInt(z) * x[1];
  return [safeNumber(mod(y0, h), 'Quotient residue'), safeNumber(y1, 'Quotient class')];
}

const compareTuple = (a, b) => a[0] - b[0] || a[1] - b[1];

/** Canonical set key modulo common translation, permutation, and the policy. */
export function shapeKey(policy, coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length === 0)
    throw Error('A shape needs at least one coordinate.');
  if (policy?.schemaVersion !== VERSION || !['exact', 'period', 'octave'].includes(policy.kind))
    throw Error('Use a valid coordinate equivalence policy.');
  const points = coordinates.map(point => pair(point)),
    small =
      coordinates.every(
        point => Math.abs(point[0]) <= SMALL / 2 && Math.abs(point[1]) <= SMALL / 2
      ) &&
      (policy.kind === 'exact' || smallPolicy(policy));
  const numeric = small ? coordinates.map(point => [point[0], point[1]]) : null;
  const candidates = (small ? numeric : points).map(anchor => {
    const classes = (small ? numeric : points).map(point => {
      const difference = point.map((value, index) => value - anchor[index]);
      if (!small) difference.forEach(value => safeNumber(value, 'Shape displacement'));
      return quotientClass(policy, difference, small);
    });
    const distinct = [...new Map(classes.map(value => [JSON.stringify(value), value])).values()];
    return JSON.stringify(distinct.sort(compareTuple));
  });
  const best = candidates.sort()[0];
  return `shape-v${VERSION}:${JSON.stringify([policy.id, best])}`;
}

const ratioLabel = ratio => `${ratio[0]}/${ratio[1]}`;
function parseRatioLabel(label) {
  const match = /^(\d+)\/(\d+)$/.exec(label);
  if (!match) throw Error('Use a reduced positive ratio label.');
  const ratio = rational(BigInt(match[1]), BigInt(match[2]));
  if (ratio[0] <= 0n || ratio[1] <= 0n) throw Error('JI family ratios must be positive.');
  return ratio;
}
function familyPolicy(policy) {
  const kind = typeof policy === 'string' ? policy : policy?.kind;
  if (kind !== 'exact' && kind !== 'octave')
    throw Error('Choose an explicit exact or octave JI family policy.');
  return kind;
}
function octaveRepresentative(value) {
  let [n, d] = value,
    lift = 0;
  while (n < d) {
    n *= 2n;
    lift--;
  }
  while (n >= 2n * d) {
    d *= 2n;
    lift++;
  }
  return {ratio: rational(n, d), octaveLift: lift};
}
function relativeClass(value, kind) {
  return kind === 'octave' ? octaveRepresentative(value) : {ratio: value, octaveLift: 0};
}
function uniqueSortedRatios(ratios) {
  return [...new Map(ratios.map(ratio => [ratioLabel(ratio), ratio])).values()].sort(
    compareExactRatios
  );
}
function familyFromRatios(ratios, kind) {
  const unique = uniqueSortedRatios(ratios);
  if (!unique.length) throw Error('A JI family needs at least one ratio.');
  let best = null;
  for (const [anchorIndex, anchor] of (kind === 'exact' ? unique.slice(0, 1) : unique).entries()) {
    const classes = uniqueSortedRatios(
      unique.map(ratio => relativeClass(div(ratio, anchor), kind).ratio)
    );
    const familyRatios = classes.map(ratioLabel),
      serialization = JSON.stringify(familyRatios);
    if (best === null || serialization < best.serialization)
      best = {anchor, anchorIndex, familyRatios, serialization};
  }
  return {...best, familyId: `ji-family-v${VERSION}:${JSON.stringify([kind, best.serialization])}`};
}
function invertedFamily(source, kind) {
  const inverted = source.familyRatios.map(label => {
    const [n, d] = parseRatioLabel(label);
    return [d, n];
  });
  return familyFromRatios(inverted, kind);
}

/**
 * Link an existing exact `ji2:` chord to an explicitly chosen JI family.
 * Member records retain source order, exact spelling, doublings and the octave
 * lifts needed to reconstruct every original normalized ratio.
 */
// Families depend only on the exact identity, so repeated projections across temperaments reuse them.
const familyCache = new BoundedCache(4096);
export function harmonicIdentity(exactIdentity, policy) {
  const kind = familyPolicy(policy);
  if (
    exactIdentity?.version !== 2 ||
    !Array.isArray(exactIdentity.canonicalRatios) ||
    !Array.isArray(exactIdentity.orderedRatios) ||
    typeof exactIdentity.fingerprint !== 'string'
  )
    throw Error('Use a chordIdentity record.');
  return familyCache.get(
    JSON.stringify([
      kind,
      exactIdentity.fingerprint,
      exactIdentity.orderedRatios,
      exactIdentity.repeatedMembers ?? null,
      exactIdentity.inputCardinality ?? null,
      exactIdentity.cardinality ?? null
    ]),
    () => computeHarmonicIdentity(exactIdentity, kind)
  );
}
function computeHarmonicIdentity(exactIdentity, kind) {
  const canonical = exactIdentity.canonicalRatios.map(ratio =>
    rational(BigInt(ratio.n), BigInt(ratio.d))
  );
  const family = familyFromRatios(canonical, kind),
    anchorLabel = ratioLabel(family.anchor);
  const familyIndices = new Map(family.familyRatios.map((label, index) => [label, index]));
  const exactIndices = new Map(
    exactIdentity.canonicalRatios.map((ratio, index) => [ratio.label, index])
  );
  const members = exactIdentity.orderedRatios.map((label, inputIndex) => {
    const relative = relativeClass(div(parseRatioLabel(label), family.anchor), kind);
    const familyIndex = familyIndices.get(ratioLabel(relative.ratio));
    if (familyIndex === undefined || !exactIndices.has(label))
      throw Error('Exact chord members do not match their canonical ratios.');
    return {
      inputIndex,
      exactIndex: exactIndices.get(label),
      exactRatio: label,
      familyIndex,
      octaveLift: relative.octaveLift
    };
  });
  return immutable({
    schemaVersion: VERSION,
    policy: kind,
    exactId: exactIdentity.fingerprint,
    familyId: family.familyId,
    dualFamilyId: invertedFamily(family, kind).familyId,
    anchorExactIndex: family.anchorIndex,
    anchorExactRatio: anchorLabel,
    familyRatios: family.familyRatios,
    members,
    exactCardinality: exactIdentity.cardinality,
    inputCardinality: exactIdentity.inputCardinality,
    doublings: exactIdentity.repeatedMembers,
    classCardinality: family.familyRatios.length
  });
}
