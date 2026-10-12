// Physical patterns have no temperament, tuning, chord or absolute-board identity.
// Axial q,r correspond to doubled board coordinates x=2q+r, y=r.
const compare = (a, b) => a[0] - b[0] || a[1] - b[1];
const integer = point =>
  Array.isArray(point) && point.length === 2 && point.every(Number.isSafeInteger);

export function axialCell(point) {
  const cell = Array.isArray(point) ? [...point] : point && [(point.x - point.y) / 2, point.y];
  if (!integer(cell))
    throw Error(
      'A physical cell needs integer axial coordinates or a valid doubled-board position.'
    );
  return cell.map(value => value || 0);
}

/** Distance in units of neighbouring key centres, independent of drawing size. */
export function physicalDistance(a, b) {
  const [aq, ar] = axialCell(a),
    [bq, br] = axialCell(b),
    q = bq - aq,
    r = br - ar;
  return Math.sqrt(q * q + q * r + r * r);
}

export function geometricMetrics(cells) {
  if (!Array.isArray(cells) || !cells.length)
    throw Error('A physical shape needs at least one cell.');
  const points = cells.map(axialCell),
    n = points.length;
  let span = 0,
    reach = 0,
    sum = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < i; j++) {
      const q = points[i][0] - points[j][0],
        r = points[i][1] - points[j][1],
        distance = Math.sqrt(q * q + q * r + r * r);
      span = Math.max(span, distance);
      reach = Math.max(reach, Math.abs(q), Math.abs(r), Math.abs(q + r));
      sum += distance;
    }
  const q0 = points.reduce((total, p) => total + p[0], 0) / n,
    r0 = points.reduce((total, p) => total + p[1], 0) / n;
  const variance =
    points.reduce((total, p) => {
      const q = p[0] - q0,
        r = p[1] - r0;
      return total + q * q + q * r + r * r;
    }, 0) / n;
  const meanPairDistance = n > 1 ? sum / ((n * (n - 1)) / 2) : 0;
  return {
    cellCount: n,
    span,
    reach,
    pairDistanceSum: sum,
    meanPairDistance,
    radiusOfGyration: Math.sqrt(variance),
    score: 100 / (1 + span + meanPairDistance)
  };
}

/** Translation and point order alone are removed; orientation and handedness remain. */
export function canonicalGeometricShape(cells) {
  if (!Array.isArray(cells) || !cells.length)
    throw Error('A physical shape needs at least one cell.');
  const points = cells.map(axialCell),
    ordered = [...new Map(points.map(point => [point.join(','), point])).values()].sort(compare),
    origin = ordered[0];
  const relative = ordered.map(point =>
    point.map((value, axis) => {
      const difference = value - origin[axis];
      if (!Number.isSafeInteger(difference))
        throw Error('Physical shape displacement is too large.');
      return difference || 0;
    })
  );
  const indices = new Map(ordered.map((point, index) => [point.join(','), index]));
  return {
    version: 1,
    id: 'hex-shape-v1:' + JSON.stringify(relative),
    cells: relative,
    origin: [...origin],
    cellIndices: points.map(point => indices.get(point.join(','))),
    metrics: geometricMetrics(relative)
  };
}

// The hexagonal lattice's twelve symmetries in axial cells: six 60° turns, each optionally mirrored.
const turn = ([q, r]) => [-r, q + r],
  mirror = ([q, r]) => [r, q];
/** Rotations and reflections of a shape, as their own exact translation-only shapes (identity first). */
export function shapeOrientations(cells) {
  const points = canonicalGeometricShape(cells).cells,
    seen = new Map();
  for (const mirrored of [false, true]) {
    let current = mirrored ? points.map(mirror) : points;
    for (let step = 0; step < 6; step++) {
      const shape = canonicalGeometricShape(current);
      if (!seen.has(shape.id))
        seen.set(shape.id, {id: shape.id, cells: shape.cells, rotation: step * 60, mirrored});
      current = current.map(turn);
    }
  }
  return [...seen.values()];
}

/** Preserve physical key indices while putting keys in canonical cell order. */
export function geometricShapeForKeys(board, keys) {
  if (!Array.isArray(keys) || !keys.length || keys.some(key => !Number.isSafeInteger(key)))
    throw Error('Choose at least one physical key.');
  const byId = new Map((board?.keys ?? []).map(key => [key.index, key])),
    unique = [...new Set(keys)],
    points = unique.map(index => {
      const key = byId.get(index);
      if (!key) throw Error('A selected physical key is absent from this board.');
      return key;
    });
  const shape = canonicalGeometricShape(points),
    ordered = Array(shape.cells.length);
  shape.cellIndices.forEach((cell, index) => {
    ordered[cell] = unique[index];
  });
  return {...shape, keys: ordered};
}

/** Exact board assignments, excluding sounding cents and display colours. */
export function boardStructureKey(board) {
  if (!Array.isArray(board?.keys)) throw Error('Use a built HexBoard.');
  return (
    'hex-board-v1:' +
    JSON.stringify(
      board.keys
        .map(key => [
          key.index,
          key.x,
          key.y,
          !!key.command,
          !!key.enabled,
          key.m,
          key.degree ?? null,
          key.register ?? null
        ])
        .sort((a, b) => a[0] - b[0])
    )
  );
}
