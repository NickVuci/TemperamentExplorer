import {bigintGcd as gcd} from '../core/rational.mjs';
// The focused harmony as the diamond and the interval matrix show it. The harmony workspace owns
// the focus (the selected directory row, its rotation and scale occurrence); these functions only
// project it onto other views, so every view reads one selection.

function ratio(text) {
  const [n, d] = String(text).split('/').map(BigInt);
  return [n, d ?? 1n];
}
function key([n, d], octave) {
  if (octave) {
    while (n >= 2n * d) d *= 2n;
    while (n < d) n *= 2n;
  }
  const g = gcd(n, d);
  return `${n / g}/${d / g}`;
}

/**
 * Cells of the tonality diamond that show a focused chord.
 * A JI chord (focus.ratios: the chosen rotation's pitch classes, rooted on 1/1) is shown as written
 * from the diamond's 1/1: along rows (one denominator) for otonal chords, columns (one numerator)
 * for utonal chords, and both for ambitonal or other chords. Every line holding all members is
 * returned; without one, the line holding most members is returned as a partial placement.
 * A tempered chord (focus.classKeys) highlights every cell whose sounding approximation is one of
 * its notes relative to 1/1, which shows each JI reading the temperament merges onto a note.
 */
export function diamondFocus(
  cells,
  focus,
  {harmonics = [], octave = true, classKeyOf = null} = {}
) {
  const none = {ids: [], placements: [], partial: false};
  if (!focus || !Array.isArray(cells) || !cells.length) return none;
  if (focus.kind === 'tempered') {
    if (!classKeyOf || !focus.classKeys?.length) return none;
    const wanted = new Set(focus.classKeys);
    const ids = cells
      .filter(
        cell => cell.status?.approximation?.m && wanted.has(classKeyOf(cell.status.approximation.m))
      )
      .map(cell => cell.id);
    return {ids, placements: [], partial: false};
  }
  const members = (focus.ratios ?? []).map(ratio);
  if (members.length < 2) return none;
  const placements = [];
  let best = null;
  const axes =
    focus.form === 'otonal' ? ['row'] : focus.form === 'utonal' ? ['column'] : ['row', 'column'];
  for (const axis of axes) {
    const lines = new Map();
    for (const cell of cells) {
      const line = axis === 'row' ? cell.j : cell.i;
      if (!lines.has(line)) lines.set(line, []);
      lines.get(line).push(cell);
    }
    for (const [line, lineCells] of lines) {
      const byKey = new Map();
      for (const cell of lineCells) {
        const k = key([BigInt(cell.n), BigInt(cell.d)], octave);
        if (!byKey.has(k)) byKey.set(k, []);
        byKey.get(k).push(cell);
      }
      const found = members.map(member => byKey.get(key(member, octave))).filter(Boolean),
        ids = [...new Set(found.flat().map(cell => cell.id))].sort();
      const placement = {axis, line, harmonic: harmonics[line] ?? null, ids, matched: found.length};
      if (found.length === members.length) placements.push(placement);
      else if (found.length >= 2 && (!best || found.length > best.matched)) best = placement;
    }
  }
  if (placements.length)
    return {
      ids: [...new Set(placements.flatMap(placement => placement.ids))],
      placements,
      partial: false
    };
  return best ? {ids: best.ids, placements: [best], partial: true} : none;
}

/** Scale degrees (mod the scale size) of the focused occurrence, for the interval matrix. */
export function matrixFocusDegrees(focus, size) {
  if (!focus?.degrees?.length || !Number.isInteger(size) || size < 1) return null;
  return new Set(
    focus.degrees.filter(Number.isInteger).map(degree => ((degree % size) + size) % size)
  );
}

/** Distinct pitch classes of picked diamond cells, written relative to the lowest one (as n/d, octave-folded). */
export function relativeRatios(cells, {octave = true} = {}) {
  const unique = [...new Map((cells ?? []).map(cell => [cell.label, cell])).values()].sort(
    (a, b) => a.c - b.c
  );
  if (!unique.length) return [];
  const [rn, rd] = [BigInt(unique[0].n), BigInt(unique[0].d)];
  return [...new Set(unique.map(cell => key([BigInt(cell.n) * rd, BigInt(cell.d) * rn], octave)))];
}
