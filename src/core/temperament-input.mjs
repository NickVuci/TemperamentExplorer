import {fromCommaSearch} from './tuning.mjs';
export function temperamentFromInput(basisText, text, previous) {
  const basis = String(basisText)
    .trim()
    .split(/[\s,.]+/)
    .map(Number);
  if (
    basis.length < 3 ||
    basis.length > 8 ||
    new Set(basis).size !== basis.length ||
    basis.some(
      (p, i) =>
        !Number.isInteger(p) ||
        p < 2 ||
        p > 97 ||
        (i && p <= basis[i - 1]) ||
        Array.from({length: Math.max(0, Math.floor(Math.sqrt(p)) - 1)}, (_, j) => j + 2).some(
          d => p % d === 0
        )
    )
  )
    throw Error('Use 3–8 ascending basis primes, such as 2.3.5.');
  const tokens = String(text)
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (!tokens.length || tokens.length > 64 || text.length > 16000)
    throw Error('Enter 1–64 commas as ratios.');
  const list = tokens.map(label => {
    const parts = label.split('/');
    if (parts.length !== 2 || parts.some(v => !/^\d{1,500}$/.test(v)))
      throw Error('Enter commas as integer ratios, such as 81/80.');
    let [n, d] = parts.map(BigInt);
    if (n < 1n || d < 1n) throw Error('Comma ratios must be positive.');
    const exponents = basis.map(p => {
      const prime = BigInt(p);
      let e = 0;
      while (n % prime === 0n) {
        n /= prime;
        e++;
      }
      while (d % prime === 0n) {
        d /= prime;
        e--;
      }
      if (Math.abs(e) > 1000) throw Error('Comma exponents exceed the supported range.');
      return e;
    });
    if (n !== d) throw Error(`${label} contains primes outside the selected basis.`);
    return {label, exponents};
  });
  return fromCommaSearch(basis, list, previous);
}
