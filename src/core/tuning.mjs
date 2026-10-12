import {weilTune} from './weil-tuning.mjs';
import {mapRatio, targets} from './engine.mjs';
import {leastSquares, purePeriod, periodUnits} from './pitch.mjs';
import {presets} from './catalog.mjs';
export function ratios(text) {
  const tokens = text
    .trim()
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (!tokens.length || tokens.length > 64)
    throw Error('Enter 1–64 ratios, separated by spaces or commas.');
  return tokens.map(label => {
    const parts = label.split('/');
    if (parts.length !== 2 || !parts.every(x => /^\d+$/.test(x)))
      throw Error(`Use integer ratios such as 81/80, not “${label}”.`);
    const [n, d] = parts.map(Number);
    if (!n || !d || n > 1e12 || d > 1e12)
      throw Error('Ratio integers must be between 1 and 1,000,000,000,000.');
    return {n, d, label, c: 1200 * Math.log2(n / d)};
  });
}
import {bigintGcd as bgcd, rational as Q, add, mul, neg, div} from './rational.mjs';
export function fromCommas(text, basisText = '2 3 5', method = 'Computed CWE', vectors = null) {
  const basis = basisText
    .trim()
    .split(/[\s,.]+/)
    .map(Number);
  if (
    basis.length < 3 ||
    basis.length > 8 ||
    new Set(basis).size !== basis.length ||
    basis.some((p, i) => i && p < basis[i - 1]) ||
    !basis.every(
      p =>
        Number.isInteger(p) &&
        p >= 2 &&
        p <= 97 &&
        Array.from({length: Math.max(0, Math.floor(Math.sqrt(p)) - 1)}, (_, i) => i + 2).every(
          k => p % k
        )
    )
  )
    throw Error('Use 3–8 distinct primes in ascending order, such as 2.3.5 or 3.5.7.');
  if (
    vectors &&
    (!Array.isArray(vectors) ||
      !vectors.length ||
      vectors.length > 64 ||
      vectors.some(
        t =>
          !Array.isArray(t.exponents) ||
          t.exponents.length !== basis.length ||
          !t.exponents.every(e => Number.isInteger(e) && Math.abs(e) <= 1000)
      ))
  )
    throw Error('Invalid comma exponent vectors.');
  const rs = vectors || ratios(text),
    identity = basis.map((_, i) => basis.map((_, j) => (i === j ? 1 : 0)));
  const monzos = vectors
    ? vectors.map(t => t.exponents)
    : rs.map(t => {
        const m = mapRatio(t.n, t.d, {basis, rows: identity});
        if (!m) throw Error(`${t.label} contains a prime outside the selected basis.`);
        return m;
      });
  const vars = basis.length - 1,
    A = monzos.map(c => [...c.slice(1).map(x => Q(x)), Q(-c[0])]);
  let row = 0,
    pivots = [];
  for (let col = 0; col < vars; col++) {
    let k = A.findIndex((r, i) => i >= row && r[col][0] !== 0n);
    if (k < 0) continue;
    [A[row], A[k]] = [A[k], A[row]];
    let pivot = A[row][col];
    A[row] = A[row].map(x => div(x, pivot));
    for (let j = 0; j < A.length; j++)
      if (j !== row) {
        const factor = A[j][col];
        A[j] = A[j].map((v, i) => add(v, neg(mul(factor, A[row][i]))));
      }
    pivots.push(col);
    row++;
  }
  if (A.some(r => r.slice(0, vars).every(x => x[0] === 0n) && r[vars][0] !== 0n))
    throw Error(
      `These commas temper out the reference interval ${basis[0]}/1. Choose a different comma list.`
    );
  if (row !== basis.length - 2)
    throw Error(
      `These commas leave rank ${basis.length - row}. This scale explorer needs rank 2: choose ${basis.length - 2} independent commas for this basis. Redundant commas are allowed.`
    );
  const free = Array.from({length: vars}, (_, i) => i).find(i => !pivots.includes(i)),
    part = Array.from({length: vars}, () => Q(0)),
    dir = Array.from({length: vars}, () => Q(0));
  dir[free] = Q(1);
  pivots.forEach((p, i) => {
    part[p] = A[i][vars];
    dir[p] = neg(A[i][free]);
  });
  let lcm = 1n;
  for (const q of [...part, ...dir]) lcm = (lcm / bgcd(lcm, q[1])) * q[1];
  if (lcm > 100000n) throw Error('The integer mapping exceeds this prototype’s complexity limit.');
  const periodCount = requiredPeriodCount(A.slice(0, row), vars);
  if (periodCount > 1000n)
    throw Error('This mapping needs more than 1000 periods per reference interval.');
  let solution;
  for (let t = 0n; t < lcm; t++) {
    const a = part.map((p, i) => add(mul(p, Q(periodCount)), mul(dir[i], Q(t))));
    if (a.every(x => x[1] === 1n)) {
      solution = a.map(x => x[0]);
      break;
    }
  }
  if (!solution)
    throw Error(
      'Could not construct the integer period mapping within the supported complexity bound.'
    );
  let gvec = dir.map(x => x[0] * (lcm / x[1])),
    factor = gvec.reduce(bgcd, 0n);
  gvec = gvec.map(x => x / factor);
  if (gvec.find(x => x !== 0n) < 0n) gvec = gvec.map(x => -x);
  let s = {
    name: 'From commas',
    key: 'custom',
    basis,
    rows: [
      [Number(periodCount), ...solution.map(Number)],
      [0, ...gvec.map(Number)]
    ],
    p: (1200 * Math.log2(basis[0])) / Number(periodCount),
    n: 19,
    mode: 0,
    commas: rs.map(t => t.label).join(', '),
    tuning: 'Prime least squares'
  };
  let g = leastSquares(s),
    shift = Math.floor(g / s.p);
  s.rows[0] = s.rows[0].map((a, i) => a + shift * s.rows[1][i]);
  s.g = g - shift * s.p;
  // Resolve known names by testing the comma kernel, then use their familiar generator basis.
  for (const [key, v] of Object.entries(presets))
    if (
      v.basis.join() === basis.join() &&
      monzos.every(c => v.rows.every(row => row.reduce((sum, x, i) => sum + x * c[i], 0) === 0))
    ) {
      s = {...structuredClone(v), key, n: 19, mode: 0, tuning: v.defaultTuning || 'Published CWE'};
      break;
    }
  if (s.rows.flat().some(v => Math.abs(v) > 1000))
    throw Error('Mapping coefficients exceed the supported ±1000 limit.');
  if (method === 'Computed WE' || method === 'Computed CWE') {
    Object.assign(s, weilTune(s, method === 'Computed CWE'));
    s.tuning = method;
    s.tuneConfig = {method, fixed: method === 'Computed CWE'};
    s.tuningReport = `${method} calculated from the comma-derived mapping on ${s.basis.join('.')}. ${method === 'Computed CWE' ? `Reference ${s.basis[0]}/1 constrained pure; ${periodUnits(s)} period(s).` : 'Period and generator optimized together.'}`;
  } else if (method === 'Prime least squares') {
    s.p = purePeriod(s);
    s.g = leastSquares(s);
    s.tuning = method;
  } else throw Error('Choose computed WE, computed CWE, or prime least squares.');
  return s;
}
export function fromCommaSearch(basis, list, previous) {
  const inherited =
    {
      'Weil–Euclidean': previous?.tuneConfig?.fixed === false ? 'Computed WE' : 'Computed CWE',
      'Least Squares': 'Least squares',
      'Prime Least Squares': 'Prime least squares',
      'Published WE': 'Computed WE',
      'Published CWE': 'Computed CWE'
    }[previous?.tuning] || previous?.tuning;
  const method = [
    'Computed WE',
    'Computed CWE',
    'Prime least squares',
    'Minimax',
    'Least squares'
  ].includes(inherited)
    ? inherited
    : 'Computed CWE';
  const fitting = method === 'Minimax' || method === 'Least squares';
  const s = fromCommas('', basis.join('.'), fitting ? 'Computed CWE' : method, list);
  if (fitting) {
    const cfg = {
      targets: 'primes',
      custom: '',
      fixed: true,
      ...previous?.tuneConfig,
      method,
      period: s.p
    };
    try {
      const ts = tuneTargets(s, cfg.targets, cfg.custom),
        result = optimize(s, ts, method === 'Minimax' ? 'minimax' : 'ls', cfg.fixed);
      if (!(
        Number.isFinite(result.g) &&
        result.g > 0 &&
        result.g < result.p &&
        result.p >= purePeriod(s) / 2 &&
        result.p <= purePeriod(s) * 2
      ))
        throw Error('The inherited optimization gives an unsupported tuning.');
      Object.assign(s, {
        p: result.p,
        g: result.g,
        tuning: method,
        tuneConfig: cfg,
        tuningReport: `${method} inherited from the previous temperament; targets recomputed for this mapping. ${cfg.fixed ? 'New reference period fixed pure.' : 'Period and generator fitted.'}`
      });
    } catch (e) {
      s.tuningReport += ` Inherited ${method} could not be applied: ${e.message} Used CWE.`;
    }
  }
  return s;
}
export function tuneTargets(s, choice, custom) {
  const list =
    choice === 'primes'
      ? s.basis.map(n => ({n, d: 1, label: `${n}/1`, c: 1200 * Math.log2(n)}))
      : choice === 'custom'
        ? ratios(custom)
        : targets(Number(choice));
  const usable = list.map(t => ({...t, m: mapRatio(t.n, t.d, s)}));
  if (choice === 'custom' && usable.some(t => !t.m))
    throw Error(
      'A custom tuning target is outside the temperament basis. Extend the mapping or change the targets.'
    );
  const out = usable.filter(t => t.m);
  if (!out.length) throw Error('No tuning targets are in this temperament’s basis.');
  return out;
}
function bounds(s, fixed) {
  return fixed
    ? [
        [s.p, 0.000001],
        [s.p, s.p - 0.000001]
      ]
    : [
        [purePeriod(s) / 2, 0.000001],
        [purePeriod(s) * 2, 0.000001],
        [purePeriod(s) * 2, purePeriod(s) * 2 - 0.000001],
        [purePeriod(s) / 2, purePeriod(s) / 2 - 0.000001]
      ];
}
function clip(poly, a, b, c) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    let p = poly[i],
      q = poly[(i + 1) % poly.length],
      u = a * p[0] + b * p[1] - c,
      v = a * q[0] + b * q[1] - c;
    if (u <= 1e-9) out.push(p);
    if ((u < 0 && v > 0) || (u > 0 && v < 0)) {
      let t = u / (u - v);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}
export function optimize(s, ts, method = 'ls', fixed = true) {
  if (!ts.some(t => t.m[1] !== 0))
    throw Error('The targets do not constrain the generator. Add another interval.');
  if (!fixed && !ts.some((t, i) => ts.some((u, j) => j > i && t.m[0] * u.m[1] !== t.m[1] * u.m[0])))
    throw Error('Unlocked-period tuning needs at least two independent interval targets.');
  const objective = (p, g) => ts.reduce((a, t) => a + (t.m[0] * p + t.m[1] * g - t.c) ** 2, 0);
  let p = s.p,
    g;
  if (method === 'ls') {
    let aa = 0,
      ab = 0,
      bb = 0,
      ac = 0,
      bc = 0;
    for (const t of ts) {
      let [a, b] = t.m;
      aa += a * a;
      ab += a * b;
      bb += b * b;
      ac += a * t.c;
      bc += b * t.c;
    }
    if (fixed) {
      if (!bb)
        throw Error(
          'The targets do not constrain the generator. Add an interval with a nonzero generator mapping.'
        );
      g = Math.max(0.000001, Math.min(p - 0.000001, (bc - ab * p) / bb));
    } else {
      if (aa * bb - ab * ab < 1e-12)
        throw Error('Unlocked-period tuning needs at least two independent interval targets.');
      const candidates = [],
        det = aa * bb - ab * ab,
        up = (ac * bb - bc * ab) / det,
        ug = (bc * aa - ac * ab) / det;
      if (up >= purePeriod(s) / 2 && up <= purePeriod(s) * 2 && ug > 0 && ug < up)
        candidates.push([up, ug]);
      let polygon = bounds(s, false);
      for (let i = 0; i < polygon.length; i++) {
        let start = polygon[i],
          end = polygon[(i + 1) % polygon.length],
          dp = end[0] - start[0],
          dg = end[1] - start[1],
          num = 0,
          den = 0;
        for (const t of ts) {
          let a = t.m[0] * dp + t.m[1] * dg;
          num += a * (t.c - t.m[0] * start[0] - t.m[1] * start[1]);
          den += a * a;
        }
        let u = Math.max(0, Math.min(1, num / den));
        candidates.push([start[0] + u * dp, start[1] + u * dg]);
      }
      candidates.sort((a, b) => objective(...a) - objective(...b));
      [p, g] = candidates[0];
    }
  } else {
    const feasible = e => {
      let poly = bounds(s, fixed);
      for (const t of ts) {
        poly = clip(poly, ...t.m, t.c + e);
        if (!poly.length) return null;
        poly = clip(poly, -t.m[0], -t.m[1], -t.c + e);
        if (!poly.length) return null;
      }
      return poly;
    };
    let lo = 0,
      hi = Math.max(...ts.map(t => Math.abs(t.m[0] * s.p + t.m[1] * s.g - t.c))) + 1,
      poly;
    for (let i = 0; i < 65; i++) {
      let mid = (lo + hi) / 2,
        found = feasible(mid);
      if (found) {
        hi = mid;
        poly = found;
      } else lo = mid;
    }
    poly = feasible(hi + 1e-7);
    if (!poly?.length) throw Error('Could not solve minimax tuning.');
    [p, g] = poly.reduce(
      (sum, x) => [sum[0] + x[0] / poly.length, sum[1] + x[1] / poly.length],
      [0, 0]
    );
  }
  const errors = ts.map(t => ({...t, error: t.m[0] * p + t.m[1] * g - t.c}));
  return {
    p,
    g,
    errors,
    max: Math.max(...errors.map(t => Math.abs(t.error))),
    rms: Math.sqrt(errors.reduce((a, t) => a + t.error * t.error, 0) / errors.length)
  };
}
export function pureTune(s, text, fixed = true) {
  const ts = Array.isArray(text) ? text : tuneTargets(s, 'custom', text);
  if (fixed) {
    let g;
    for (const t of ts) {
      const [a, b] = t.m;
      if (!b) {
        if (Math.abs(a * s.p - t.c) > 1e-7)
          throw Error(`${t.label} cannot be pure with this fixed period.`);
        continue;
      }
      const candidate = (t.c - a * s.p) / b;
      if (g !== undefined && Math.abs(candidate - g) > 1e-7)
        throw Error('These intervals cannot all be pure in this temperament with a fixed period.');
      g = candidate;
    }
    if (g === undefined)
      throw Error('These pure targets do not determine the generator. Add another interval.');
    return {p: s.p, g};
  }
  const independent = ts.some(t => ts.some(u => t.m[0] * u.m[1] !== t.m[1] * u.m[0]));
  if (!independent) {
    // Among tunings satisfying a single independent exact constraint, minimize WE.
    const t = ts.find(t => t.m.some(Boolean));
    if (!t) throw Error('Choose a non-unison target coordinate.');
    const logs = s.basis.map(Math.log2),
      a = s.rows[0].map((v, i) => v / logs[i]),
      b = s.rows[1].map((v, i) => v / logs[i]),
      j = logs.map(() => 1200),
      sum = x => x.reduce((v, u) => v + u, 0),
      dot = (x, y) =>
        x.reduce((v, u, i) => v + u * y[i], 0) - (sum(x) * sum(y)) / (logs.length + 1);
    const aa = dot(a, a),
      ab = dot(a, b),
      bb = dot(b, b),
      aj = dot(a, j),
      bj = dot(b, j),
      det = aa * bb - ab * ab;
    if (!(det > 1e-13 * aa * bb))
      throw Error('Cannot optimize the period reliably for this mapping.');
    const p0 = (aj * bb - bj * ab) / det,
      g0 = (bj * aa - aj * ab) / det,
      [u, v] = t.m,
      dp = (bb * u - ab * v) / det,
      dg = (aa * v - ab * u) / det,
      lambda = (t.c - u * p0 - v * g0) / (u * dp + v * dg),
      p = p0 + lambda * dp,
      g = g0 + lambda * dg;
    if (
      !Number.isFinite(p) ||
      !Number.isFinite(g) ||
      p < purePeriod(s) / 2 ||
      p > purePeriod(s) * 2 ||
      g <= 0 ||
      g >= p
    )
      throw Error('Pure-target optimum is outside the supported period/generator range.');
    if (ts.some(t => Math.abs(t.m[0] * p + t.m[1] * g - t.c) > 1e-6))
      throw Error('These targets cannot all be pure at their selected coordinates.');
    return {p, g};
  }
  const tuned = optimize(s, ts, 'ls', false);
  if (tuned.max > 1e-6)
    throw Error(
      'These targets cannot all be pure within this temperament and the supported period range.'
    );
  return tuned;
}
export function edoTune(s, n, kText = '', periodSteps) {
  if (!Number.isInteger(n) || n < 2 || n > 10000)
    throw Error('EDO must be an integer from 2 to 10,000.');
  const val = s.basis.map(p => Math.round(n * Math.log2(p))),
    q = periodUnits(s),
    h = periodSteps === undefined ? val[0] / q : Number(periodSteps);
  if (!Number.isInteger(h) || h < 1)
    throw Error(
      `This EDO does not give an integer step count for each of the ${q} periods. Choose a listed supporting EDO.`
    );
  if (s.basis[0] === 2 && q * h !== n)
    throw Error('This period mapping does not preserve the EDO octave.');
  const b = s.rows[1],
    a = s.rows[0],
    k =
      String(kText).trim() === ''
        ? Math.round(
            b.reduce((sum, v, i) => sum + v * (val[i] - a[i] * h), 0) /
              b.reduce((sum, v) => sum + v * v, 0)
          )
        : Number(kText);
  if (!Number.isInteger(k) || k <= 0 || k >= h)
    throw Error('Generator steps must lie strictly between zero and the period step count.');
  const induced = a.map((v, i) => v * h + b[i] * k);
  if (s.basis.includes(2) && induced[s.basis.indexOf(2)] !== n)
    throw Error('This mapping does not preserve the EDO octave.');
  return {
    p: (1200 * h) / n,
    g: (1200 * k) / n,
    k,
    periodSteps: h,
    val,
    induced,
    patent: val.every((v, i) => v === induced[i])
  };
}
export function supportingEdos(s, max = 500, variants = false) {
  const result = [],
    limit = Math.min(5000, Math.max(2, Math.floor(max))),
    tolerance = variants ? 1 : 0,
    q = periodUnits(s);
  for (let n = 2; n <= limit; n++) {
    const val = s.basis.map(p => Math.round(n * Math.log2(p))),
      spread = s.basis[0] === 2 ? 0 : tolerance;
    for (
      let h = Math.max(1, Math.ceil((val[0] - spread) / q));
      h <= Math.floor((val[0] + spread) / q);
      h++
    ) {
      let lo = 1,
        hi = h - 1;
      for (let i = 0; i < s.basis.length; i++) {
        const a = s.rows[0][i],
          b = s.rows[1][i],
          v = val[i] - a * h,
          tol = s.basis[i] === 2 ? 0 : tolerance;
        if (!b) {
          if (Math.abs(v) > tol) {
            lo = 1;
            hi = 0;
            break;
          }
          continue;
        }
        const ends = [(v - tol) / b, (v + tol) / b];
        lo = Math.max(lo, Math.ceil(Math.min(...ends) - 1e-10));
        hi = Math.min(hi, Math.floor(Math.max(...ends) + 1e-10));
      }
      for (let k = lo; k <= hi; k++) {
        const item = edoTune(s, n, String(k), h);
        if (item.induced.every((v, i) => Math.abs(v - val[i]) <= tolerance))
          result.push({n, ...item});
      }
    }
  }
  return result;
}

function determinant(matrix) {
  const a = matrix.map(r => [...r]);
  const n = a.length;
  if (!n) return 1n;
  let prior = 1n,
    sign = 1n;
  for (let k = 0; k < n - 1; k++) {
    if (!a[k][k]) {
      let j = k + 1;
      while (j < n && !a[j][k]) j++;
      if (j === n) return 0n;
      [a[k], a[j]] = [a[j], a[k]];
      sign = -sign;
    }
    const pivot = a[k][k];
    for (let i = k + 1; i < n; i++)
      for (let j = k + 1; j < n; j++) a[i][j] = (a[i][j] * pivot - a[i][k] * a[k][j]) / prior;
    for (let i = k + 1; i < n; i++) a[i][k] = 0n;
    prior = pivot;
  }
  return sign * a[n - 1][n - 1];
}
function minorGcd(rows, columns) {
  let result = 0n;
  function visit(chosen, start) {
    if (chosen.length === rows.length) {
      result = bgcd(result, determinant(rows.map(r => chosen.map(c => r[c]))));
      return;
    }
    for (let i = start; i <= columns.length - (rows.length - chosen.length); i++)
      visit([...chosen, columns[i]], i + 1);
  }
  visit([], 0);
  return result;
}
// The ratio of determinantal divisors gives the minimal positive reference
// coordinate in the saturated integer annihilator lattice.
function requiredPeriodCount(reduced, vars) {
  const rows = reduced.map(r => {
    let lcm = 1n;
    for (const x of r) lcm = (lcm / bgcd(lcm, x[1])) * x[1];
    return [neg(r[vars]), ...r.slice(0, vars)].map(x => x[0] * (lcm / x[1]));
  });
  const cols = Array.from({length: vars + 1}, (_, i) => i);
  return minorGcd(rows, cols.slice(1)) / minorGcd(rows, cols);
}
