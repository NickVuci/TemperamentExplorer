// Exact arithmetic shared by comma kernels and JI assignment consistency.
export function bigintGcd(a, b) {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) [a, b] = [b, a % b];
  return a;
}
export function rational(a, b = 1n) {
  a = BigInt(a); b = BigInt(b);
  if (b === 0n) throw Error('A rational denominator cannot be zero.');
  if (b < 0n) { a = -a; b = -b; }
  const g = bigintGcd(a, b);
  return [a / g, b / g];
}
export const add = (a, b) => rational(a[0]*b[1]+b[0]*a[1], a[1]*b[1]);
export const sub = (a, b) => rational(a[0]*b[1]-b[0]*a[1], a[1]*b[1]);
export const mul = (a, b) => rational(a[0]*b[0], a[1]*b[1]);
export const div = (a, b) => rational(a[0]*b[1], a[1]*b[0]);
export const neg = a => [-a[0], a[1]];
export const show = a => a[1] === 1n ? String(a[0]) : `${a[0]}/${a[1]}`;
