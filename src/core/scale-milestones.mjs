import {generatedSizes, mapRatio, targets, MAX_SCALE_SIZE} from './engine.mjs';
import {DEFAULT_ODD_LIMIT, primeFilterForBasis, validateJILimits} from './ji-limit-engine.mjs';
import {BoundedCache, immutable} from './cache.mjs';

const cache = new BoundedCache(24);
export function scaleCoverageTarget(s, options = {}) {
  const {oddLimit, primeLimit} = validateJILimits({
    oddLimit: options.limit ?? DEFAULT_ODD_LIMIT,
    primeLimit: options.primeLimit === undefined ? primeFilterForBasis(s.basis) : options.primeLimit
  });
  return {limit: oddLimit, primeLimit};
}
export function scaleCoverageKey(s, options = {}) {
  const {limit, primeLimit} = scaleCoverageTarget(s, options);
  return JSON.stringify([s.basis, s.rows, s.p, s.g, limit, primeLimit]);
}
// Automatic defaults follow mapping and target changes, never a retuning.
// Analysis caches still include cents because MOS/coverage results can change.
export function scaleDefaultKey(s, options = {}) {
  const {limit, primeLimit} = scaleCoverageTarget(s, options);
  return JSON.stringify([s.basis, s.rows, limit, primeLimit]);
}
const record = (size, extra = {}) => ({
  n: size.n,
  signature: size.signature,
  mos: size.mos,
  mode: 0,
  ...extra
});

/** Central analysis of all collision-free consecutive-generator scales.
 * Coverage is exact mapped identity modulo the actual period, never a cents
 * tolerance or an EDO pitch alias. Unmapped ratios cannot be represented.
 * A chain 0..n-1 contains differences -(n-1)..n-1; a tonic at generator r
 * contains the required range iff r+min >= 0 and r+max <= n-1. The period
 * coordinate is uniquely determined by the generator and period reduction.
 */
export function findScaleMilestones(s, options = {}) {
  const target = scaleCoverageTarget(s, options),
    key = scaleCoverageKey(s, target);
  return cache.get(key, () => {
    const required = new Set(),
      generators = [0];
    let unmappedTargetCount = 0;
    for (const ratio of targets(target.limit, target.primeLimit)) {
      const mapped = mapRatio(ratio.n, ratio.d, s);
      if (!mapped) {
        unmappedTargetCount++;
        continue;
      }
      // One representative per mapped interval class, including tempered commas.
      required.add(mapped[1]);
      generators.push(mapped[1]);
    }
    const minimum = Math.min(...generators),
      maximum = Math.max(...generators);
    const intervalMinimum = Math.max(-minimum, maximum) + 1;
    let interval = null,
      intervalMOS = null,
      diamond = null,
      diamondMOS = null;
    for (const size of generatedSizes(s)) {
      if (size.n >= intervalMinimum) {
        if (!interval) interval = record(size, {modeIndependent: true});
        if (!intervalMOS && size.mos) intervalMOS = record(size, {modeIndependent: true});
      }
      if ((!diamond || (!diamondMOS && size.mos)) && size.n >= maximum - minimum + 1) {
        const modes = size.notes.flatMap((note, i) =>
          note.k + minimum >= 0 && note.k + maximum < size.n ? [i] : []
        );
        if (modes.length) {
          if (!diamond) diamond = record(size, {mode: modes[0], modes});
          if (!diamondMOS && size.mos) diamondMOS = record(size, {mode: modes[0], modes});
        }
      }
      if (interval && intervalMOS && diamond && diamondMOS) break;
    }
    return immutable({
      ...target,
      key,
      mappedTargetCount: required.size,
      unmappedTargetCount,
      interval,
      intervalMOS,
      diamond,
      diamondMOS,
      maxSize: MAX_SCALE_SIZE
    });
  });
}

export function scaleMilestoneMarkers(milestones, n) {
  const markers = [];
  if ([milestones.interval, milestones.intervalMOS].some(result => result?.n === n))
    markers.push('IC');
  if ([milestones.diamond, milestones.diamondMOS].some(result => result?.n === n))
    markers.push('DC');
  return markers;
}

export function modeMilestoneMarker(milestones, n, mode) {
  return [milestones.diamond, milestones.diamondMOS].some(
    result => result?.n === n && (result.modes?.includes(mode) || result.mode === mode)
  )
    ? 'DC'
    : null;
}

export function formatModeRanges(modes) {
  if (!modes?.length) return '';
  const values = [...new Set(modes)].sort((a, b) => a - b).map(mode => mode + 1),
    ranges = [];
  let first = values[0],
    last = first;
  for (const value of values.slice(1)) {
    if (value === last + 1) {
      last = value;
      continue;
    }
    ranges.push(first === last ? String(first) : `${first}–${last}`);
    first = last = value;
  }
  ranges.push(first === last ? String(first) : `${first}–${last}`);
  return ranges.join(', ');
}
