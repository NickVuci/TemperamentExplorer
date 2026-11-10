// Legacy fixed-period prime fit, also used to initialize published presets.
export function leastSquares(s) {
  let numerator = 0,
    denominator = 0;
  for (let i = 1; i < s.basis.length; i++) {
    const b = s.rows[1][i],
      a = s.rows[0][i];
    numerator += b * (1200 * Math.log2(s.basis[i]) - a * s.p);
    denominator += b * b;
  }
  return numerator / denominator;
}

// Shared pitch and lattice conventions. No dependencies on UI or presets.
export const periodUnits = s => s.rows[0][0];
export const referenceCents = s => 1200 * Math.log2(s.basis[0]);
export const purePeriod = s => referenceCents(s) / periodUnits(s);
export const periodDescription = s =>
  `${periodUnits(s)} period${periodUnits(s) === 1 ? '' : 's'} per tempered ${s.basis[0]}/1`;
export const coordinateCents = (s, m) => m[0] * s.p + m[1] * s.g;
export const noteCoordinate = (s, note) => [Math.round((note.c - note.k * s.g) / s.p), note.k];
export const sameCoordinate = (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1];
export const mod = (x, p = 1200) => {
  const v = ((x % p) + p) % p;
  return Math.abs(v - p) < 1e-7 || Math.abs(v) < 1e-7 ? 0 : v;
};
export function octavePeriods(s) {
  const i = s.basis.indexOf(2);
  return i >= 0 && s.rows[1][i] === 0 && s.rows[0][i] > 1 ? s.rows[0][i] : 1;
}
export const approximationSpan = s => octavePeriods(s) * s.p;
export function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return Math.abs(a);
}
