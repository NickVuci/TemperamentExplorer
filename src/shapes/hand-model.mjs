// A one-hand ergonomic model for physical key shapes. It has no temperament, tuning or chord
// identity: its input is a set of axial cells (the cells of `geometric-shapes.mjs`) and how the board
// is turned, its output a finger for every key and a strain score.
//
// The model starts from a resting right hand: a rest spot for each fingertip, measured in millimetres
// from the middle fingertip. A fingering's strain is how far the fingers must leave those spots once
// the whole hand has slid and turned to its best position. Every strain is then counted from the most
// natural position this hand has for the same number of keys, so each key count always has a
// comfortable position whatever the hand size and key spacing. The left hand is the mirror image.
//
// The numbers are estimates of a typical adult hand, not measurements, and nothing here has been
// tested on an instrument: ratings are suggestions for comparing shapes with each other.

/** Fingers are numbered 1 (thumb) to 5 (little finger). */
export const FINGER_NAMES = Object.freeze(['Thumb', 'Index', 'Middle', 'Ring', 'Little']);

const DEFAULTS = Object.freeze({
  // Distance between neighbouring key centres, in millimetres (the HexBoard's is 20).
  spacing: 20,
  // Hand size as a percentage of the rest spots below.
  scale: 100,
  // Wrist: resting turn and limits in degrees. Inward turns the fingers toward the body's midline.
  rest: 10,
  inward: 70,
  outward: 35,
  // Strain per squared degree turned away from rest.
  turnCost: 0.02,
  // Least sideways distance between neighbouring fingertips, in millimetres.
  gap: 8,
  // How far the thumb may tuck under (sideways) or reach past the nearest fingertip (forward).
  tuck: 15,
  past: 20,
  // One finger may press two touching keys on the seam between them; each such press adds
  // `doubleCost` strain, the thumb half of it.
  double: false,
  doubleCost: 40,
  // Grade bands: strain above the natural hand below which a position is A, B or C; D is the rest.
  grades: Object.freeze([30, 90, 170]),
  // Per finger: rest spot (right, forward), sideways and reach stiffness, cost of using the finger,
  // the direction it reaches along (degrees, null for the thumb, which moves freely), and whether it
  // is in use.
  fingers: Object.freeze([
    Object.freeze({x: -34, y: -36, sideways: 0.2, along: 0.2, use: 8, direction: null, on: true}),
    Object.freeze({x: -20, y: -6, sideways: 1, along: 0.35, use: 0, direction: 100, on: true}),
    Object.freeze({x: 0, y: 0, sideways: 1.2, along: 0.35, use: 0, direction: 90, on: true}),
    Object.freeze({x: 20, y: -5, sideways: 1.4, along: 0.45, use: 14, direction: 80, on: true}),
    Object.freeze({x: 40, y: -20, sideways: 1, along: 0.5, use: 20, direction: 70, on: true})
  ])
});

// Strain added when no fingering keeps the fingers clear of each other (tier 1: two fingertips may
// share a line) or in order (tier 2: fingers may cross).
const TIER_PENALTY = [0, 120, 250];
const TURN_STEP = 2.5;
const ROW = Math.sqrt(3) / 2;

export const handModelDefaults = () => ({
  ...DEFAULTS,
  grades: [...DEFAULTS.grades],
  fingers: DEFAULTS.fingers.map(finger => ({...finger}))
});

const bounded = (value, fallback, low, high) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(high, Math.max(low, value))
    : fallback;

/** A complete model from partial or saved input; unusable values fall back to the defaults. */
export function normalizeHandModel(input) {
  const model = handModelDefaults(),
    source = input && typeof input === 'object' ? input : {};
  model.spacing = bounded(source.spacing, model.spacing, 10, 40);
  model.scale = bounded(source.scale, model.scale, 60, 150);
  model.rest = bounded(source.rest, model.rest, -30, 45);
  model.inward = bounded(source.inward, model.inward, 0, 120);
  model.outward = bounded(source.outward, model.outward, 0, 90);
  model.turnCost = bounded(source.turnCost, model.turnCost, 0, 1);
  model.gap = bounded(source.gap, model.gap, 0, 20);
  model.tuck = bounded(source.tuck, model.tuck, 0, 60);
  model.past = bounded(source.past, model.past, 0, 60);
  model.double = source.double === true;
  model.doubleCost = bounded(source.doubleCost, model.doubleCost, 0, 200);
  if (Array.isArray(source.grades) && source.grades.length === 3) {
    const grades = source.grades.map((value, i) => bounded(value, model.grades[i], 1, 2000));
    if (grades[0] < grades[1] && grades[1] < grades[2]) model.grades = grades;
  }
  if (Array.isArray(source.fingers) && source.fingers.length === 5)
    source.fingers.forEach((finger, i) => {
      if (!finger || typeof finger !== 'object') return;
      const own = model.fingers[i];
      own.x = bounded(finger.x, own.x, -90, 90);
      own.y = bounded(finger.y, own.y, -90, 90);
      own.sideways = bounded(finger.sideways, own.sideways, 0.05, 5);
      own.along = bounded(finger.along, own.along, 0.05, 5);
      own.use = bounded(finger.use, own.use, 0, 200);
      own.on = finger.on !== false;
    });
  if (!model.fingers.some(finger => finger.on)) model.fingers[1].on = true;
  return model;
}

/**
 * Where one step along each axial axis leads, in key spacings, as the player sees the board:
 * x to the right, y away from the player. `rotation` is the board's quarter turns, as drawn by
 * `hexboard-view.mjs` (whose y axis points toward the player).
 */
export function handBasis(rotation = 0) {
  const angle = (rotation * Math.PI) / 2,
    cos = Math.cos(angle),
    sin = Math.sin(angle),
    turned = ([x, y]) => [x * cos - y * sin, -(x * sin + y * cos)];
  return [turned([1, 0]), turned([0.5, ROW])];
}

const cellDistance = (a, b) => {
  const q = a[0] - b[0],
    r = a[1] - b[1];
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
};
const gradeOf = (strain, grades) =>
  strain < grades[0] ? 'A' : strain < grades[1] ? 'B' : strain < grades[2] ? 'C' : 'D';

function permutations(items, size) {
  const out = [],
    used = Array(items.length).fill(false),
    current = [];
  (function next() {
    if (current.length === size) {
      out.push([...current]);
      return;
    }
    for (let i = 0; i < items.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      current.push(items[i]);
      next();
      current.pop();
      used[i] = false;
    }
  })();
  return out;
}

function subsets(items, size) {
  const out = [];
  (function next(start, current) {
    if (current.length === size) {
      out.push([...current]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      current.push(items[i]);
      next(i + 1, current);
      current.pop();
    }
  })(0, []);
  return out;
}

/** Ways to cover the keys: each finger takes one key or, when allowed, two touching keys. */
function groupings(cells, allowDouble) {
  const n = cells.length,
    used = Array(n).fill(false),
    out = [],
    current = [];
  (function next(i) {
    while (i < n && used[i]) i++;
    if (i >= n) {
      out.push(current.map(group => [...group]));
      return;
    }
    used[i] = true;
    current.push([i]);
    next(i + 1);
    current.pop();
    if (allowDouble)
      for (let j = i + 1; j < n; j++) {
        if (used[j] || cellDistance(cells[i], cells[j]) !== 1) continue;
        used[j] = true;
        current.push([i, j]);
        next(i + 1);
        current.pop();
        used[j] = false;
      }
    used[i] = false;
  })(0);
  return out;
}

const translationKey = cells => {
  const origin = cells.reduce((low, cell) =>
    cell[1] < low[1] || (cell[1] === low[1] && cell[0] < low[0]) ? cell : low
  );
  return cells
    .map(cell => [cell[0] - origin[0], cell[1] - origin[1]])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0])
    .map(cell => cell.join(','))
    .join(' ');
};

/**
 * A rater for one model, hand ('R' or 'L') and board rotation. `rate(cells)` takes distinct axial
 * cells and returns null when one hand cannot cover them, otherwise
 * `{fingers, raw, strain, grade, turn, tier, doubled, alternatives}`: `fingers[i]` is the finger on
 * `cells[i]` (a finger pressing two keys appears twice), `strain` is counted from the natural hand
 * for that key count, `turn` is degrees inward of the resting wrist, and `tier` is 0 for a clean
 * fingering, 1 when two fingertips share a line and 2 when fingers cross.
 */
export function createHandRater(input, {hand = 'R', rotation = 0} = {}) {
  if (hand !== 'R' && hand !== 'L') throw Error('Choose the right or the left hand.');
  if (!Number.isInteger(rotation))
    throw Error('Board rotation is a whole number of quarter turns.');
  const model = normalizeHandModel(input),
    scale = model.scale / 100,
    side = hand === 'L' ? -1 : 1,
    [e1, e2] = handBasis(rotation);
  const rests = model.fingers.map(finger => [finger.x * scale, finger.y * scale]);
  // Each finger's stiffness as a symmetric matrix [xx, xy, yy]: soft along its reach, stiff across.
  const stiffness = model.fingers.map(finger => {
    if (finger.direction == null) return [finger.sideways, 0, finger.sideways];
    const angle = (finger.direction * Math.PI) / 180,
      c = Math.cos(angle),
      s = Math.sin(angle);
    return [
      finger.along * c * c + finger.sideways * s * s,
      (finger.along - finger.sideways) * c * s,
      finger.along * s * s + finger.sideways * c * c
    ];
  });
  const allowed = model.fingers.flatMap((finger, i) => (finger.on ? [i + 1] : []));
  const turns = [];
  for (let turn = -model.outward; turn <= model.inward + 1e-9; turn += TURN_STEP) turns.push(turn);
  const rotations = turns.map(turn => [
    Math.cos((-turn * Math.PI) / 180),
    Math.sin((-turn * Math.PI) / 180)
  ]);
  const permutationCache = new Map(),
    orderCache = new Map();
  // Left-hand positions are mirrored into the right hand's frame.
  const position = cell => [
    side * (cell[0] * e1[0] + cell[1] * e2[0]) * model.spacing,
    (cell[0] * e1[1] + cell[1] * e2[1]) * model.spacing
  ];

  // Least strain of every finger order over the wrist's range; Infinity where a rule is broken.
  function pass(tier, points, orders, extra, fingerOrders) {
    const n = points.length,
      best = new Float64Array(orders.length).fill(Infinity),
      bestTurn = new Float64Array(orders.length),
      x = new Float64Array(n),
      y = new Float64Array(n),
      gap = tier === 0 ? model.gap : 0;
    for (let t = 0; t < turns.length; t++) {
      const [c, s] = rotations[t];
      for (let i = 0; i < n; i++) {
        x[i] = c * points[i][0] - s * points[i][1];
        y[i] = s * points[i][0] + c * points[i][1];
      }
      const turnStrain = model.turnCost * (turns[t] - model.rest) ** 2;
      for (let o = 0; o < orders.length; o++) {
        const fingers = orders[o];
        if (tier < 2) {
          let ok = true,
            previous = -1,
            thumb = -1,
            leftmost = Infinity,
            nearest = Infinity;
          for (const i of fingerOrders[o]) {
            if (fingers[i] === 1) {
              thumb = i;
              continue;
            }
            if (previous >= 0 && x[i] - x[previous] < gap + 1e-9) {
              ok = false;
              break;
            }
            previous = i;
            if (x[i] < leftmost) leftmost = x[i];
            if (y[i] < nearest) nearest = y[i];
          }
          if (
            ok &&
            thumb >= 0 &&
            previous >= 0 &&
            (x[thumb] > leftmost + model.tuck || y[thumb] > nearest + model.past)
          )
            ok = false;
          if (!ok) continue;
        }
        // The hand slides freely: solve for the best offset, then sum what remains.
        let xx = 0,
          xy = 0,
          yy = 0,
          bx = 0,
          by = 0;
        for (let i = 0; i < n; i++) {
          const f = fingers[i] - 1,
            w = stiffness[f],
            dx = x[i] - rests[f][0],
            dy = y[i] - rests[f][1];
          xx += w[0];
          xy += w[1];
          yy += w[2];
          bx += w[0] * dx + w[1] * dy;
          by += w[1] * dx + w[2] * dy;
        }
        const det = xx * yy - xy * xy,
          ox = (yy * bx - xy * by) / det,
          oy = (xx * by - xy * bx) / det;
        let strain = 0;
        for (let i = 0; i < n; i++) {
          const f = fingers[i] - 1,
            w = stiffness[f],
            dx = x[i] - rests[f][0] - ox,
            dy = y[i] - rests[f][1] - oy;
          strain += w[0] * dx * dx + 2 * w[1] * dx * dy + w[2] * dy * dy;
        }
        strain = strain / n + turnStrain + extra[o];
        if (strain < best[o]) {
          best[o] = strain;
          bestTurn[o] = turns[t];
        }
      }
    }
    return {best, bestTurn};
  }

  // The three best fingerings by raw strain, or null when the keys outnumber what the fingers cover.
  function solve(cells) {
    const keys = cells.map(position),
      covers = groupings(cells, model.double).filter(groups => groups.length <= allowed.length);
    if (!covers.length) return null;
    const prepared = covers.map(groups => {
      const m = groups.length;
      if (!permutationCache.has(m)) {
        const orders = permutations(allowed, m);
        permutationCache.set(m, orders);
        orderCache.set(
          m,
          orders.map(order => order.map((_, i) => i).sort((a, b) => order[a] - order[b]))
        );
      }
      const orders = permutationCache.get(m);
      return {
        groups,
        orders,
        fingerOrders: orderCache.get(m),
        points: groups.map(group =>
          group.length === 1
            ? keys[group[0]]
            : [
                (keys[group[0]][0] + keys[group[1]][0]) / 2,
                (keys[group[0]][1] + keys[group[1]][1]) / 2
              ]
        ),
        extra: orders.map(order => {
          let use = 0,
            doubles = 0;
          for (let i = 0; i < m; i++) {
            use += model.fingers[order[i] - 1].use;
            if (groups[i].length === 2)
              doubles += order[i] === 1 ? model.doubleCost / 2 : model.doubleCost;
          }
          return use / m + doubles;
        })
      };
    });
    let candidates = [],
      tier = 0;
    for (; tier < 3; tier++) {
      for (let g = 0; g < prepared.length; g++) {
        const cover = prepared[g],
          {best, bestTurn} = pass(
            tier,
            cover.points,
            cover.orders,
            cover.extra,
            cover.fingerOrders
          ),
          ranked = [];
        for (let o = 0; o < cover.orders.length; o++) if (best[o] < Infinity) ranked.push(o);
        ranked.sort((a, b) => best[a] - best[b] || a - b);
        for (const o of ranked.slice(0, 3)) {
          const fingers = Array(cells.length);
          cover.groups.forEach((group, i) => {
            for (const key of group) fingers[key] = cover.orders[o][i];
          });
          candidates.push({
            fingers,
            raw: best[o] + TIER_PENALTY[tier],
            turn: bestTurn[o],
            cover: g
          });
        }
      }
      if (candidates.length) break;
    }
    candidates.sort((a, b) => a.raw - b.raw || a.cover - b.cover);
    const top = [],
      seen = new Set();
    for (const candidate of candidates) {
      const id = candidate.fingers.join('');
      if (seen.has(id)) continue;
      seen.add(id);
      top.push(candidate);
      if (top.length === 3) break;
    }
    return {tier, top};
  }

  // The natural hand: lay the resting fingertips on the keys at a few turns and offsets, snap each
  // to its nearest key, and keep the least strain found for every key count.
  let baselines = null;
  function naturalBaselines() {
    if (baselines) return baselines;
    baselines = new Map();
    const det = e1[0] * e2[1] - e1[1] * e2[0],
      snap = (px, py) => {
        const x = (side * px) / model.spacing,
          y = py / model.spacing,
          q = (x * e2[1] - y * e2[0]) / det,
          r = (y * e1[0] - x * e1[1]) / det;
        let best = null,
          least = Infinity;
        for (const cq of [Math.floor(q), Math.floor(q) + 1])
          for (const cr of [Math.floor(r), Math.floor(r) + 1]) {
            const dx = (cq - q) * e1[0] + (cr - r) * e2[0],
              dy = (cq - q) * e1[1] + (cr - r) * e2[1],
              distance = dx * dx + dy * dy;
            if (distance < least) {
              least = distance;
              best = [cq, cr];
            }
          }
        return best;
      };
    const fingersOn = allowed.map(finger => finger - 1),
      found = new Map(),
      low = Math.max(-model.outward, model.rest - 20),
      high = Math.min(model.inward, model.rest + 20),
      angles = [];
    for (let turn = low; turn <= high + 1e-9; turn += 5) angles.push(turn);
    if (!angles.length) angles.push(Math.min(model.inward, Math.max(-model.outward, model.rest)));
    const choices = [];
    for (let size = 1; size <= Math.min(5, fingersOn.length); size++)
      choices.push(...subsets(fingersOn, size));
    for (const turn of angles) {
      const c = Math.cos((turn * Math.PI) / 180),
        s = Math.sin((turn * Math.PI) / 180),
        tips = rests.map(([x, y]) => [c * x - s * y, s * x + c * y]);
      for (let ix = 0; ix < 6; ix++)
        for (let iy = 0; iy < 6; iy++) {
          const ox = (ix * model.spacing) / 6,
            oy = (iy * model.spacing * ROW) / 6,
            cells = tips.map(([x, y]) => snap(x + ox, y + oy));
          for (const choice of choices) {
            const chosen = choice.map(i => cells[i]);
            if (new Set(chosen.map(cell => cell.join(','))).size < chosen.length) continue;
            const id = translationKey(chosen);
            if (!found.has(id)) found.set(id, chosen);
          }
        }
    }
    for (const cells of found.values()) {
      const solved = solve(cells);
      if (!solved || solved.tier > 0) continue;
      const raw = solved.top[0].raw,
        n = cells.length;
      if (!baselines.has(n) || raw < baselines.get(n)) baselines.set(n, raw);
    }
    return baselines;
  }
  // Six keys and more have no natural hand of their own; they are counted from the five-key one.
  const baseline = n => {
    const known = naturalBaselines();
    for (let size = Math.min(n, 5); size >= 1; size--) if (known.has(size)) return known.get(size);
    return 0;
  };

  function rate(cells) {
    if (
      !Array.isArray(cells) ||
      !cells.length ||
      cells.some(cell => !Array.isArray(cell) || !cell.every(Number.isSafeInteger)) ||
      new Set(cells.map(cell => cell.join(','))).size !== cells.length
    )
      throw Error('A fingering needs distinct axial cells.');
    const solved = solve(cells);
    if (!solved) return null;
    const base = baseline(cells.length),
      describe = candidate => {
        const strain = Math.max(0, candidate.raw - base);
        return {fingers: candidate.fingers, strain, grade: gradeOf(strain, model.grades)};
      },
      best = solved.top[0],
      fingers = best.fingers;
    return {
      ...describe(best),
      raw: best.raw,
      turn: best.turn - model.rest,
      tier: solved.tier,
      doubled: [...new Set(fingers.filter((finger, i) => fingers.indexOf(finger) !== i))].sort(),
      alternatives: solved.top.slice(1).map(describe)
    };
  }

  return {rate, baseline, model, hand, rotation};
}
