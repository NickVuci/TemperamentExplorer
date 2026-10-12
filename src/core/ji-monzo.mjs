import {bigintGcd, rational} from './rational.mjs';

// Exact JI factorization is deliberately bounded. This covers the app's target
// range while keeping arbitrary user input from triggering unbounded trial
// division.
export const MAX_FACTOR_COMPONENT = 1_000_000_000_000;
export const MAX_SUPPORTED_PRIME = 97;
const MAX_RATIO_COMPONENT_DIGITS = 256;
const MAX_FACTOR_COMPONENT_BIGINT = BigInt(MAX_FACTOR_COMPONENT);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function positiveInteger(value, name) {
  let result;
  if (typeof value === 'bigint') result = value;
  else if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw Error(`${name} must be a safe integer.`);
    result = BigInt(value);
  } else if (typeof value === 'string' && /^\d+$/.test(value)) {
    const digits = value.replace(/^0+(?=\d)/, '');
    if (digits.length > MAX_RATIO_COMPONENT_DIGITS)
      throw Error(`${name} exceeds the supported input size.`);
    result = BigInt(digits);
  } else throw Error(`${name} must be a positive integer.`);
  if (result <= 0n) throw Error(`${name} must be positive.`);
  if (result.toString().length > MAX_RATIO_COMPONENT_DIGITS)
    throw Error(`${name} exceeds the supported input size.`);
  return result;
}

function parseRatio(ratio) {
  let numerator, denominator;
  if (typeof ratio === 'string') {
    const match = /^\s*(\d+)\s*(?:\/\s*(\d+)\s*)?$/.exec(ratio);
    if (!match) throw Error('Ratio must be a positive integer or numerator/denominator string.');
    numerator = match[1];
    denominator = match[2] ?? '1';
  } else if (typeof ratio === 'bigint' || typeof ratio === 'number') {
    numerator = ratio;
    denominator = 1n;
  } else if (Array.isArray(ratio) && ratio.length === 2) {
    [numerator, denominator] = ratio;
  } else if (
    ratio &&
    typeof ratio === 'object' &&
    !Array.isArray(ratio) &&
    Object.hasOwn(ratio, 'n') &&
    Object.hasOwn(ratio, 'd')
  ) {
    numerator = ratio.n;
    denominator = ratio.d;
  } else throw Error('Ratio must be an integer, a numerator/denominator pair, or an {n,d} record.');

  numerator = positiveInteger(numerator, 'Numerator');
  denominator = positiveInteger(denominator, 'Denominator');
  // Reduce before any later products or factoring, including unreduced input.
  const divisor = bigintGcd(numerator, denominator);
  const [n, d] = rational(numerator / divisor, denominator / divisor);
  if (n > MAX_FACTOR_COMPONENT_BIGINT || d > MAX_FACTOR_COMPONENT_BIGINT)
    throw Error('Reduced ratio component exceeds the supported factorization bound.');
  return {n, d};
}

function isPrime(value) {
  if (!Number.isInteger(value) || value < 2 || value > MAX_SUPPORTED_PRIME) return false;
  for (let divisor = 2; divisor * divisor <= value; divisor++)
    if (value % divisor === 0) return false;
  return true;
}

function validateBasis(basis) {
  if (!Array.isArray(basis) || basis.length < 2 || basis.length > 10)
    throw Error('Prime basis must contain two to ten primes.');
  const seen = new Set();
  for (const prime of basis) {
    if (!isPrime(prime)) throw Error(`Unsupported basis prime: ${prime}.`);
    if (seen.has(prime)) throw Error(`Prime basis contains duplicate ${prime}.`);
    seen.add(prime);
  }
  return basis;
}

function factor(value) {
  const powers = new Map();
  let remaining = value;
  for (
    let candidate = 2n;
    candidate * candidate <= remaining;
    candidate += candidate === 2n ? 1n : 2n
  ) {
    if (remaining % candidate !== 0n) continue;
    let exponent = 0;
    do {
      remaining /= candidate;
      exponent++;
    } while (remaining % candidate === 0n);
    powers.set(Number(candidate), exponent);
  }
  if (remaining > 1n) powers.set(Number(remaining), 1);
  return powers;
}

/**
 * Convert an exact positive rational to its prime-exponent monzo.
 *
 * `ratio` may be an integer/string, an `[n,d]` pair, or an `{n,d}` record;
 * components may be BigInt, decimal strings, or safe integer Numbers. Raw
 * components are capped at 256 decimal digits; the reduced numerator and
 * denominator must each be at most 10^12. Omitting `basis` produces a sparse
 * monzo only and makes no subgroup-membership claim. With a basis,
 * `basisMonzo` follows its exact order and is retained when other primes make
 * the ratio unmapped. Public output contains only JSON-safe values.
 */
export function ratioMonzo(ratio, basis = null, {includeBasis = basis !== null} = {}) {
  const orderedBasis = basis === null ? null : validateBasis(basis);
  if (typeof includeBasis !== 'boolean') throw Error('includeBasis must be a boolean.');
  if (includeBasis && !orderedBasis)
    throw Error('A prime basis is required when requesting a basis-order monzo.');
  const {n, d} = parseRatio(ratio),
    numeratorFactors = factor(n),
    denominatorFactors = factor(d),
    all = new Map(numeratorFactors);
  for (const [prime, exponent] of denominatorFactors)
    all.set(prime, (all.get(prime) || 0) - exponent);
  for (const [prime, exponent] of [...all]) if (exponent === 0) all.delete(prime);

  const sparseMonzo = Object.fromEntries([...all].sort((a, b) => a[0] - b[0]));
  const basisMonzo = includeBasis ? orderedBasis.map(prime => sparseMonzo[prime] || 0) : undefined;
  const basisSet = orderedBasis ? new Set(orderedBasis) : null,
    missingPrimes = basisSet
      ? Object.keys(sparseMonzo)
          .map(Number)
          .filter(prime => !basisSet.has(prime))
      : [];
  let remainingNumerator = n,
    remainingDenominator = d;
  if (orderedBasis)
    for (const prime of orderedBasis) {
      const p = BigInt(prime);
      while (remainingNumerator % p === 0n) remainingNumerator /= p;
      while (remainingDenominator % p === 0n) remainingDenominator /= p;
    }
  return {
    numerator: String(n),
    denominator: String(d),
    ratio: n === d ? '1' : `${n}/${d}`,
    sparseMonzo,
    ...(includeBasis ? {basisMonzo} : {}),
    missingPrimes,
    remainingNumerator: orderedBasis ? String(remainingNumerator) : null,
    remainingDenominator: orderedBasis ? String(remainingDenominator) : null,
    withinBasis: basisSet ? missingPrimes.length === 0 : null
  };
}

function exactInteger(value, name) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  throw Error(`${name} must be a safe integer or BigInt.`);
}

function exactMappedRows(rows, monzo) {
  if (!Array.isArray(rows) || rows.length === 0 || rows.some(row => !Array.isArray(row)))
    throw Error('Mapping rows must be a nonempty integer matrix.');
  if (!Array.isArray(monzo) || monzo.length === 0)
    throw Error('Monzo must be a nonempty integer vector.');
  const width = rows[0].length;
  if (width === 0 || rows.some(row => row.length !== width || row.length !== monzo.length))
    throw Error('Mapping matrix width must match the monzo length.');
  const vector = monzo.map((value, index) => exactInteger(value, `Monzo coordinate ${index}`));
  return rows.map((row, rowIndex) => {
    let sum = 0n;
    for (let column = 0; column < width; column++) {
      const coefficient = exactInteger(row[column], `Mapping coefficient ${rowIndex},${column}`);
      sum += coefficient * vector[column];
    }
    return sum;
  });
}

/** Map a basis-ordered monzo exactly, with JSON-safe integer coordinates. */
export function mapMonzo(rows, monzo) {
  return exactMappedRows(rows, monzo).map(sum => {
    if (sum > MAX_SAFE_BIGINT || sum < -MAX_SAFE_BIGINT)
      throw Error('Mapped coordinate exceeds the safe integer range.');
    return Number(sum);
  });
}

/** Exact zero-image predicate, including valid monzos with large nonzero images. */
export function isZeroMonzoImage(rows, monzo) {
  return exactMappedRows(rows, monzo).every(sum => sum === 0n);
}
