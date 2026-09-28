import {mapRatio, gcd} from './engine.mjs';
import {coordinateCents} from './pitch.mjs';

const EPS = 1e-7;
const qlabel = (n, d) => { const g = gcd(n, d); return `${n / g}/${d / g}`; };
const cents = q => 1200 * Math.log2(q.n / q.d);
const quotient = (a, b) => {const gn=gcd(a.n,b.n),gd=gcd(a.d,b.d);return {n:(a.n/gn)*(b.d/gd),d:(a.d/gd)*(b.n/gn)};};

export function voicingReference(s) {
  const m2 = mapRatio(2, 1, s);
  if (m2 && m2[1] === 0 && m2[0] > 0)
    return {ratio: '2/1', label: 'octave voicing', periods: m2[0], m: [m2[0], 0], cents: m2[0] * s.p, idealCents: cents({n: 2, d: 1})};
  for (const p of s.basis) {
    const m = mapRatio(p, 1, s);
    if (m && m[1] === 0 && m[0] > 0)
      return {ratio: `${p}/1`, label: `${p}/1 period voicing`, periods: m[0], m: [m[0], 0], cents: m[0] * s.p, idealCents: cents({n: p, d: 1})};
  }
  throw Error('No generator-free mapped reference interval is available for voicing.');
}

function rationalLabel(t, lift, ref) {
  // BigInt keeps ordinary labels exact; a bounded textual fallback avoids unsafe Number arithmetic.
  try {
    if(Math.abs(lift)>64)throw Error('Use a symbolic ratio label.');
    const n = BigInt(t.n), d = BigInt(t.d), rn = BigInt(ref.qn), rd = BigInt(ref.qd);
    const nn = lift >= 0 ? n * rn ** BigInt(lift) : n * rd ** BigInt(-lift);
    const dd = lift >= 0 ? d * rd ** BigInt(lift) : d * rn ** BigInt(-lift);
    if (nn <= BigInt(Number.MAX_SAFE_INTEGER) && dd <= BigInt(Number.MAX_SAFE_INTEGER)) return qlabel(Number(nn), Number(dd));
  } catch {}
  return `${t.label} × ${ref.ratio}${lift >= 0 ? `^${lift}` : `^(${lift})`}`;
}

function normalizeLifts(s, coords, pitches, bass, ref, original) {
  const out = Array(coords.length).fill(0);
  const bp = pitches[bass];
  if (original) {
    for (let i = 0; i < coords.length; i++) if (i !== bass && pitches[i] < bp - EPS)
      out[i] = Math.ceil((bp - pitches[i]) / ref.cents - EPS);
  } else {
    for (let i = 0; i < coords.length; i++) if (i !== bass) {
      let k = Math.ceil((bp - pitches[i]) / ref.cents - EPS);
      while (pitches[i] + k * ref.cents >= bp + ref.cents - EPS) k--;
      while (pitches[i] + k * ref.cents < bp - EPS) k++;
      out[i] = k;
    }
  }
  out[bass] = 0;
  return out;
}

export function chordVoicings(s, chord, instance, {style = 'original', tol = 10} = {}) {
  if (!['compact', 'original', 'open'].includes(style)) throw Error('Unknown chord voicing style.');
  if (!chord?.tones?.length || !instance?.coords || instance.coords.length !== chord.tones.length) throw Error('Chord and instance tone counts must match.');
  if (!Number.isFinite(tol) || tol < 0) throw Error('Voicing tolerance must be non-negative.');
  const ref = voicingReference(s), tones = chord.tones, base = instance.coords.map(m => [...m]);
  if (base.some(m => m.length !== 2 || !m.every(Number.isInteger) || m.some(v => Math.abs(v) > 10000))) throw Error('Instance coordinates are out of bounds.');
  const refInfo = {...ref, qn: ref.ratio.split('/')[0], qd: ref.ratio.split('/')[1]};
  const actual = base.map(m => coordinateCents(s, m));
  const results = [];
  for (let bassTone = 0; bassTone < tones.length; bassTone++) {
    let lifts = normalizeLifts(s, base, actual, bassTone, refInfo, style === 'original');
    if (style === 'open') {
      const order = base.map((_, i) => i).sort((a, b) => actual[a] + lifts[a] * ref.cents - (actual[b] + lifts[b] * ref.cents) || a - b);
      for (let pos = 1; pos < order.length; pos += 2) if (order[pos] !== bassTone) lifts[order[pos]]++;
    }
    const coords = base.map((m, i) => [m[0] + lifts[i] * ref.m[0], m[1] + lifts[i] * ref.m[1]]);
    const pitches = coords.map(m => coordinateCents(s, m));
    const ratios = tones.map((t, i) => rationalLabel(t, lifts[i], refInfo));
    const pairErrors = [];
    for (let i = 0; i < tones.length; i++) for (let j = i + 1; j < tones.length; j++) {
      const error = (pitches[j] - pitches[i]) - (tones[j].c - tones[i].c + (lifts[j] - lifts[i]) * ref.idealCents);
      const q = quotient(tones[j], tones[i]), mapped = mapRatio(q.n, q.d, s);
      const actualDelta = coords[j].map((v, k) => v - coords[i][k]);
      const expected = mapped && ref.m ? mapped.map((v, k) => v + (lifts[j] - lifts[i]) * ref.m[k]) : null;
      pairErrors.push({i, j, error, mapped: !!expected && actualDelta[0] === expected[0] && actualDelta[1] === expected[1], within: Math.abs(error) <= tol + EPS});
    }
    const errors = pairErrors.map(p => p.error), max = errors.length ? Math.max(...errors.map(Math.abs)) : 0;
    const rms = errors.length ? Math.sqrt(errors.reduce((a, e) => a + e * e, 0) / errors.length) : 0;
    const order = pitches.map((_, i) => i).sort((a, b) => pitches[a] - pitches[b] || a - b);
    const bassDegree = instance.degrees[bassTone];
    const isOctave = ref.ratio === '2/1';
    const label = bassTone === 0 && isOctave ? `Root position · 1/1 bass` : `${tones[bassTone].label} bass · ${isOctave ? 'octave inversion' : ref.label}`;
    results.push({id: String(bassTone), label, bassTone, bassDegree, degreeByTone: [...instance.degrees], coords, pitches, ratios, periodLifts: lifts.map(v=>v*ref.periods), referenceLifts: lifts, max, rms, within: max <= tol + EPS, allMapped: pairErrors.every(p => p.mapped), pairErrors, reference: {ratio: ref.ratio, label: ref.label, periods: ref.periods, cents: ref.cents, idealCents: ref.idealCents}, tied: order.some((i, n) => n && Math.abs(pitches[i] - pitches[order[n - 1]]) <= EPS)});
  }
  return results;
}
