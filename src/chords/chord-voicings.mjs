import {mapRatio} from '../core/engine.mjs';
import {coordinateCents, gcd} from '../core/pitch.mjs';

const EPS = 1e-7;
const qlabel = (n, d) => {
  const g = gcd(n, d);
  return `${n / g}/${d / g}`;
};
const cents = q => 1200 * Math.log2(q.n / q.d);
const quotient = (a, b) => ({n: BigInt(a.n) * BigInt(b.d), d: BigInt(a.d) * BigInt(b.n)});

export function voicingReference(s) {
  const m2 = mapRatio(2, 1, s);
  if (m2 && coordinateCents(s, m2) > EPS)
    return {
      kind: 'octave',
      ratio: '2/1',
      label: 'octave voicing',
      periods: m2[1] === 0 ? m2[0] : null,
      m: [...m2],
      cents: coordinateCents(s, m2),
      idealCents: cents({n: 2, d: 1})
    };
  for (const p of s.basis) {
    const m = mapRatio(p, 1, s);
    if (m && m[1] === 0 && m[0] > 0)
      return {
        kind: 'reference',
        ratio: `${p}/1`,
        label: `${p}/1 period voicing`,
        periods: m[0],
        m: [m[0], 0],
        cents: m[0] * s.p,
        idealCents: cents({n: p, d: 1})
      };
  }
  throw Error('No generator-free mapped reference interval is available for voicing.');
}

function rationalLabel(t, lift, ref) {
  // BigInt keeps ordinary labels exact; a bounded textual fallback avoids unsafe Number arithmetic.
  try {
    if (Math.abs(lift) > 64) throw Error('Use a symbolic ratio label.');
    const n = BigInt(t.n),
      d = BigInt(t.d),
      rn = BigInt(ref.qn),
      rd = BigInt(ref.qd);
    const nn = lift >= 0 ? n * rn ** BigInt(lift) : n * rd ** BigInt(-lift);
    const dd = lift >= 0 ? d * rd ** BigInt(lift) : d * rn ** BigInt(-lift);
    if (nn <= BigInt(Number.MAX_SAFE_INTEGER) && dd <= BigInt(Number.MAX_SAFE_INTEGER))
      return qlabel(Number(nn), Number(dd));
  } catch {}
  return `${t.label} × ${ref.ratio}${lift >= 0 ? `^${lift}` : `^(${lift})`}`;
}

function normalizeLifts(s, coords, pitches, bass, ref, original) {
  const out = Array(coords.length).fill(0);
  const bp = pitches[bass];
  if (original) {
    for (let i = 0; i < coords.length; i++)
      if (i !== bass && pitches[i] < bp - EPS)
        out[i] = Math.ceil((bp - pitches[i]) / ref.cents - EPS);
  } else {
    for (let i = 0; i < coords.length; i++)
      if (i !== bass) {
        let k = Math.ceil((bp - pitches[i]) / ref.cents - EPS);
        if (!Number.isSafeInteger(k)) throw Error('Reference lift exceeds the safe integer range.');
        while (pitches[i] + k * ref.cents >= bp + ref.cents - EPS) k--;
        while (pitches[i] + k * ref.cents < bp - EPS) k++;
        out[i] = k;
      }
  }
  out[bass] = 0;
  if (!out.every(Number.isSafeInteger))
    throw Error('Reference lift exceeds the safe integer range.');
  return out;
}

export function shapeVoicings(s, instance, {tones = null, style = 'original', tol = 10} = {}) {
  if (!['compact', 'original', 'open'].includes(style)) throw Error('Unknown chord voicing style.');
  if (
    !instance?.coords?.length ||
    instance.coords.length > 8 ||
    (tones && instance.coords.length !== tones.length)
  )
    throw Error('Shape and optional interpretation tone counts must match.');
  if (!Number.isFinite(tol) || tol < 0) throw Error('Voicing tolerance must be non-negative.');
  const ref = voicingReference(s),
    base = instance.coords.map(m => [...m]),
    degrees = instance.degrees ?? base.map(() => null);
  if (!Array.isArray(degrees) || degrees.length !== base.length)
    throw Error('Degree and voice counts must match.');
  if (
    base.some(m => m.length !== 2 || !m.every(Number.isInteger) || m.some(v => Math.abs(v) > 10000))
  )
    throw Error('Instance coordinates are out of bounds.');
  const refInfo = {...ref, qn: ref.ratio.split('/')[0], qd: ref.ratio.split('/')[1]};
  const actual = base.map(m => coordinateCents(s, m));
  const results = [];
  for (let bassTone = 0; bassTone < base.length; bassTone++) {
    let lifts = normalizeLifts(s, base, actual, bassTone, refInfo, style === 'original');
    if (style === 'open') {
      const order = base
        .map((_, i) => i)
        .sort(
          (a, b) => actual[a] + lifts[a] * ref.cents - (actual[b] + lifts[b] * ref.cents) || a - b
        );
      for (let pos = 1; pos < order.length; pos += 2)
        if (order[pos] !== bassTone) lifts[order[pos]]++;
    }
    const coords = base.map((m, i) => [m[0] + lifts[i] * ref.m[0], m[1] + lifts[i] * ref.m[1]]);
    if (coords.some(point => !point.every(Number.isSafeInteger)))
      throw Error('Voiced coordinate exceeds the safe integer range.');
    const pitches = coords.map(m => coordinateCents(s, m));
    const ratios = tones ? tones.map((t, i) => rationalLabel(t, lifts[i], refInfo)) : null;
    const pairErrors = [];
    if (tones)
      for (let i = 0; i < tones.length; i++)
        for (let j = i + 1; j < tones.length; j++) {
          const error =
            pitches[j] -
            pitches[i] -
            (tones[j].c - tones[i].c + (lifts[j] - lifts[i]) * ref.idealCents);
          const q = quotient(tones[j], tones[i]),
            mapped = mapRatio(q.n, q.d, s);
          const actualDelta = coords[j].map((v, k) => v - coords[i][k]);
          const expected =
            mapped && ref.m ? mapped.map((v, k) => v + (lifts[j] - lifts[i]) * ref.m[k]) : null;
          pairErrors.push({
            i,
            j,
            error,
            mapped: !!expected && actualDelta[0] === expected[0] && actualDelta[1] === expected[1],
            within: Math.abs(error) <= tol + EPS
          });
        }
    const errors = pairErrors.map(p => p.error),
      max = tones ? (errors.length ? Math.max(...errors.map(Math.abs)) : 0) : null;
    const rms = tones
      ? errors.length
        ? Math.sqrt(errors.reduce((a, e) => a + e * e, 0) / errors.length)
        : 0
      : null;
    const order = pitches.map((_, i) => i).sort((a, b) => pitches[a] - pitches[b] || a - b);
    const bassDegree = degrees[bassTone];
    const isOctave = ref.ratio === '2/1';
    const label =
      bassTone === 0 && isOctave
        ? tones
          ? `Root position · 1/1 bass`
          : 'Root position · octave voicing'
        : `${tones ? tones[bassTone].label : `Member ${bassTone + 1}`} bass · ${isOctave ? 'octave inversion' : ref.label}`;
    results.push({
      id: String(bassTone),
      label,
      bassTone,
      bassDegree,
      degreeByTone: [...degrees],
      coords,
      pitches,
      ratios,
      periodLifts: lifts.map(v => v * ref.m[0]),
      referenceLifts: lifts,
      coordinateLifts: lifts.map(lift => ref.m.map(value => value * lift)),
      max,
      rms,
      within: tones ? max <= tol + EPS : null,
      allMapped: tones ? pairErrors.every(p => p.mapped) : null,
      pairErrors,
      reference: {
        kind: ref.kind,
        vector: [...ref.m],
        ratio: ref.ratio,
        label: ref.label,
        periods: ref.periods,
        cents: ref.cents,
        idealCents: ref.idealCents
      },
      tied: order.some((i, n) => n && Math.abs(pitches[i] - pitches[order[n - 1]]) <= EPS)
    });
  }
  return results;
}
