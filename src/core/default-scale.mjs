import {generatedSizes} from './engine.mjs';
import {findScaleMilestones} from './scale-milestones.mjs';

// Defaults are projections of the same analysis used by menus and HexBoard: the first
// interval-complete MOS, on its first mode. Interval completeness is mode independent.
export function defaultScale(s, options = {}) {
  const chosen = findScaleMilestones(s, options).intervalMOS;
  return chosen ? {n: chosen.n, mode: 0} : null;
}

// A temperament with no interval-complete MOS within the size bound approximates the selected
// limit very poorly; it opens on an ordinary 7–9-note MOS instead, with a warning.
const FALLBACK_SIZES = [7, 8, 9];
function fallbackScale(s) {
  const size = generatedSizes(s).find(item => item.mos && FALLBACK_SIZES.includes(item.n));
  return size ? {n: size.n, mode: 0} : null;
}

export function withDefaultScale(s, notify = () => {}, options = {}) {
  const chosen = defaultScale(s, options);
  if (chosen) return {...s, ...chosen};
  const fallback = fallbackScale(s);
  if (fallback) {
    notify(
      `This temperament has no interval-complete MOS within 256 notes for the selected JI limit, so it approximates that limit poorly. Using a ${fallback.n}-note MOS.`
    );
    return {...s, ...fallback};
  }
  notify(
    'This temperament has no interval-complete MOS within 256 notes for the selected JI limit, and no 7–9-note MOS. Kept the existing scale.'
  );
  return s;
}
