// Figuration preludes composed structure-first: a harmonic plan over a directed bass, voice-led
// structural voices fitted to the saved HexBoard, and voice-slot figures projected over them.
// Pure data: no DOM, audio, randomness or app state. The output is ordinary chord events plus
// figuration patterns, so playback, cues, fingering and practice use the existing systems.
import {coordinateCents} from '../core/pitch.mjs';
import {targetsForLimits} from '../core/ji-limit-engine.mjs';
import {equivalencePolicy, quotientCoordinate} from '../harmonic/harmonic-equivalence.mjs';
import {PPQ, barTicks} from './composition-project.mjs';

export const PRELUDE_PLANS = Object.freeze([
  {
    id: 'frame',
    name: 'Tonic frame',
    note: 'Home, a neighbour and the leading harmony over a held bass, then home.'
  },
  {
    id: 'octave',
    name: 'Bass octave',
    note: 'Opening frame, a bass scale falling one octave, a pedal on the leading degree, closing frame.'
  },
  {
    id: 'cycle',
    name: 'Sequence',
    note: 'Roots move by the same scale interval until they return home.'
  },
  {id: 'own', name: 'My chords', note: 'The chord lane as it stands, voiced again and figured.'}
]);
export const PRELUDE_FIGURES = Object.freeze([
  {id: 'rise', name: 'Rise and echo', note: 'Up through every voice, then the upper voices again.'},
  {id: 'wave', name: 'Wave', note: 'Up through the voices and back down.'},
  {id: 'rock', name: 'Rocking', note: 'The top voice answers each lower voice in turn.'},
  {id: 'fall', name: 'Falling', note: 'The bass, then the voices from the top down.'},
  {id: 'weave', name: 'Weave', note: 'Outer voices first, closing inward.'}
]);
export const PRELUDE_DIVISIONS = Object.freeze([
  [8, 'Eighths'],
  [12, 'Eighth triplets'],
  [16, 'Sixteenths']
]);
export const PRELUDE_SUSTAINS = Object.freeze([
  ['bass', 'Bass held'],
  ['all', 'Every note held'],
  ['none', 'Detached']
]);
export const PRELUDE_FUNCTIONS = Object.freeze({
  frame: 'Frame',
  motion: 'Motion',
  approach: 'Approach',
  pedal: 'Pedal',
  cadence: 'Cadence',
  close: 'Close'
});
export const PRELUDE_DEFAULTS = Object.freeze({
  plan: 'octave',
  home: 0,
  voices: 4,
  figure: 'rise',
  division: 16,
  bars: 1,
  repeats: 2,
  sustain: 'bass',
  variety: 'strict',
  climax: 70,
  choices: {}
});

const fail = message => {
  throw Error(`Prelude: ${message}`);
};
const int = Number.isSafeInteger;
const pick = (list, value, fallback) => (list.includes(value) ? value : fallback);

export function normalizePreludeOptions(input = {}, scaleSize = 7) {
  const d = PRELUDE_DEFAULTS,
    number = (v, lo, hi, fallback) => {
      const n = Math.round(Number(v));
      return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
    };
  const choices = {};
  for (const [key, value] of Object.entries(input.choices ?? {}))
    if (int(Number(key)) && int(Number(value)) && Number(value) > 0)
      choices[Number(key)] = Number(value);
  return {
    plan: pick(
      PRELUDE_PLANS.map(p => p.id),
      input.plan,
      d.plan
    ),
    home: number(input.home, 0, Math.max(0, scaleSize - 1), d.home),
    voices: number(input.voices, 3, 5, d.voices),
    figure: pick(
      PRELUDE_FIGURES.map(f => f.id),
      input.figure,
      d.figure
    ),
    division: pick(
      PRELUDE_DIVISIONS.map(x => x[0]),
      Number(input.division),
      d.division
    ),
    bars: pick([0.5, 1, 2], Number(input.bars), d.bars),
    repeats: pick([1, 2], Number(input.repeats), d.repeats),
    sustain: pick(
      PRELUDE_SUSTAINS.map(x => x[0]),
      input.sustain,
      d.sustain
    ),
    variety: pick(['strict', 'developing'], input.variety, d.variety),
    climax: number(input.climax, 40, 90, d.climax),
    choices
  };
}

// --- pitch classes -----------------------------------------------------------------------------

/** Octave-class identity (exact pitch when the mapping has no octave), distances and copies. */
function pitchSpace(context) {
  let policy = null;
  try {
    policy = equivalencePolicy(context, 'octave');
  } catch {
    policy = null;
  }
  const vector = policy?.vector ?? null,
    span = vector ? Math.abs(coordinateCents(context, vector)) : null;
  const cents = m => coordinateCents(context, m);
  return {
    vector,
    span,
    cents,
    key: m => (policy ? quotientCoordinate(policy, m).key : JSON.stringify(m)),
    // Smallest distance between two pitch classes, in cents.
    distance(a, b) {
      const d = Math.abs(cents(a) - cents(b));
      if (!span) return d;
      const r = d % span;
      return Math.min(r, span - r);
    }
  };
}

const homeOf = (context, degree) => context.scale.degrees[degree].coordinate;

/** Concordance of a chord's classes, 0–1: how closely and simply its intervals sit on 9-odd-limit ratios. A ranking heuristic only. */
function concordance(space, classes) {
  const targets = targetsForLimits(9),
    span = space.span ?? 1200;
  let total = 0,
    pairs = 0;
  for (let i = 0; i < classes.length; i++)
    for (let j = i + 1; j < classes.length; j++) {
      pairs++;
      const size = (((space.cents(classes[j]) - space.cents(classes[i])) % span) + span) % span;
      let best = 0;
      for (const t of targets) {
        const error = Math.abs(t.c - size);
        if (error > 35) continue;
        best = Math.max(best, (1 - (error / 35) ** 2) / (1 + Math.log2(t.n * t.d) / 6));
      }
      total += best;
    }
  // Classes closer than a small third crowd a broken chord; open chords rank first.
  const sorted = classes.map(c => ((space.cents(c) % span) + span) % span).sort((a, b) => a - b);
  const crowded = sorted.some((c, i) => {
    const gap = i ? c - sorted[i - 1] : c + span - sorted.at(-1);
    return gap < 240;
  });
  return pairs ? Math.max(0, total / pairs - (crowded ? 0.25 : 0)) : 0;
}

// --- harmonic material ---------------------------------------------------------------------------

function uniqueClasses(space, coordinates) {
  const seen = new Set(),
    out = [];
  for (const m of coordinates) {
    const key = space.key(m);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([...m]);
  }
  return out;
}

const fallbackChords = new WeakMap();
function scaleTriads(context, space) {
  const n = context.scale.n;
  const fallback = Array.from({length: n}, () => []);
  const offset = (from, to) => {
    const span = space.span ?? 1200;
    return (((space.cents(to) - space.cents(from)) % span) + span) % span;
  };
  if (n <= 36)
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++)
        for (let c = b + 1; c < n; c++) {
          const set = [a, b, c];
          let root = a,
            reach = Infinity;
          for (const r of set) {
            const top = Math.max(...set.map(d => offset(homeOf(context, r), homeOf(context, d))));
            if (top < reach - 1e-9) {
              reach = top;
              root = r;
            }
          }
          const classes = uniqueClasses(
            space,
            set
              .map(d => homeOf(context, d))
              .sort((x, y) => offset(homeOf(context, root), x) - offset(homeOf(context, root), y))
          );
          if (classes.length === 3)
            fallback[root].push({classes, score: concordance(space, classes)});
        }
  return fallback;
}

/**
 * The chords the plans draw on: for each scale degree as root, the chord directory's root-position
 * chords when `entriesFor(degree)` supplies them, otherwise a stack of alternate scale degrees.
 * `entriesFor` may return null while the directory is still listing.
 */
export function preludeMaterial(context, {entriesFor = () => []} = {}) {
  const space = pitchSpace(context),
    n = context.scale.n,
    byRoot = [];
  let directory = 0,
    pending = false;
  const skip = n >= 5 ? 2 : 1;
  // Without directory chords: every three-note chord of the scale, rooted where its notes lie
  // closest together above the root (the stack-of-thirds position), the most concordant first.
  const fallback = fallbackChords.get(context) ?? scaleTriads(context, space);
  fallbackChords.set(context, fallback);
  for (let degree = 0; degree < n; degree++) {
    const home = homeOf(context, degree),
      chords = [];
    let entries = null;
    try {
      entries = entriesFor(degree);
    } catch {
      entries = [];
    }
    if (entries === null) pending = true;
    for (const e of entries ?? []) {
      if (!e?.rootPosition || !Array.isArray(e.coords) || e.root?.[1] !== home[1]) continue;
      const classes = uniqueClasses(space, e.coords);
      if (classes.length < 3 || classes.length > 5) continue;
      if (chords.some(c => c.key === classes.map(space.key).join('|'))) continue;
      chords.push({
        root: degree,
        label: String(e.chord ?? e.label ?? 'chord'),
        kind: 'directory',
        classes,
        key: classes.map(space.key).join('|')
      });
      if (chords.length >= 48) break;
    }
    // Three-note chords first, the most concordant leading; the plan's default is the first.
    for (const c of chords) c.concordance = concordance(space, c.classes);
    chords.sort((a, b) => a.classes.length - b.classes.length || b.concordance - a.concordance);
    chords.length = Math.min(chords.length, 6);
    if (chords.length) directory++;
    else {
      const found = fallback[degree].filter(f => f.score > 0);
      // A degree that roots no concordant chord takes the stack of alternate degrees.
      if (!found.length) {
        const classes = uniqueClasses(
          space,
          [0, skip, 2 * skip].map(i => homeOf(context, (degree + i) % n))
        );
        if (classes.length === 3) found.push({classes, score: 0});
      }
      found.sort((x, y) => y.score - x.score);
      for (const f of found.slice(0, 3))
        chords.push({
          root: degree,
          label: 'triad',
          kind: 'stack',
          classes: f.classes,
          key: f.classes.map(space.key).join('|')
        });
      if (!chords.length) fail('the scale is too small for three-note harmonies.');
    }
    for (const c of chords) {
      c.concordance = concordance(space, c.classes);
      c.set = c.classes.map(space.key).sort().join('|');
    }
    byRoot.push(chords);
  }
  return {
    byRoot,
    pending,
    source: directory === n ? 'directory' : directory ? 'mixed' : 'stack'
  };
}

// --- the plan ------------------------------------------------------------------------------------

function planTools(context, material) {
  const space = pitchSpace(context),
    n = context.scale.n,
    all = material.byRoot.flat();
  const classIn = (chord, degree) => {
    const key = space.key(homeOf(context, degree));
    return chord.classes.findIndex(c => space.key(c) === key);
  };
  // Mean distance each class of `to` lies from its nearest class of `from`.
  const motion = (from, to) =>
    to.classes.reduce(
      (sum, c) => sum + Math.min(...from.classes.map(f => space.distance(f, c))),
      0
    ) / to.classes.length;
  const steps = Array.from({length: n}, (_, i) =>
    space.distance(homeOf(context, i), homeOf(context, (i + 1) % n))
  );
  const largestStep = Math.max(...steps, 1);
  return {space, n, all, classIn, motion, largestStep};
}

/** The degree whose chord pulls most strongly to the home chord, and a quieter departure chord. */
function landmarks(context, material, home) {
  const {space, n, motion, largestStep} = planTools(context, material),
    homeChord = material.byRoot[home][0],
    homeCents = space.cents(homeOf(context, home));
  const interval = degree => {
    const span = space.span ?? 1200,
      d = (((space.cents(homeOf(context, degree)) - homeCents) % span) + span) % span;
    return d;
  };
  let directional = null,
    best = -Infinity;
  for (let degree = 0; degree < n; degree++) {
    if (degree === home) continue;
    const chord = material.byRoot[degree][0];
    // Tones that reach a home tone by a small step, without already being one.
    const leading = chord.classes.filter(c => {
      const d = Math.min(...homeChord.classes.map(h => space.distance(h, c)));
      return d > 5 && d <= largestStep * 1.1;
    }).length;
    const common = chord.classes.filter(c =>
      homeChord.classes.some(h => space.distance(h, c) <= 5)
    ).length;
    const score =
      leading / chord.classes.length +
      (common === 1 ? 0.3 : 0) +
      chord.concordance +
      (Math.abs(interval(degree) - 701.955) < 30 ? 1.5 : 0);
    if (score > best + 1e-9) {
      best = score;
      directional = degree;
    }
  }
  if (directional === null) directional = home;
  let neighbour = null;
  best = -Infinity;
  for (let degree = 0; degree < n; degree++) {
    if (degree === home || degree === directional) continue;
    const chord = material.byRoot[degree][0],
      toward = material.byRoot[directional][0];
    const score =
      chord.concordance +
      (Math.abs(interval(degree) - 498.045) < 30 ? 1.5 : 0) -
      motion(chord, toward) / 400 +
      (chord.classes.some(c => homeChord.classes.some(h => space.distance(h, c) <= 5)) ? 0.3 : 0);
    if (score > best + 1e-9) {
      best = score;
      neighbour = degree;
    }
  }
  if (neighbour === null) neighbour = directional;
  return {directional, neighbour};
}

/**
 * Lays out the harmonic plan: one slot per harmony with its formal function, bass degree and chord,
 * and the other chords that could stand on that bass (`alternatives`, best first). `options.choices`
 * maps a slot index to the alternative chosen for it.
 */
export function planPrelude(project, material, options) {
  const context = project.context,
    o = normalizePreludeOptions(options, context.scale.n),
    tools = planTools(context, material),
    {n, all, classIn, motion} = tools;
  if (o.plan === 'own') return ownPlan(project, o);
  const home = o.home,
    {directional, neighbour} = landmarks(context, material, home);
  const slots = [];
  // Chords that hold `bass` as one of their classes, cheapest first after `previous`.
  const over = (bass, previous, stable) =>
    all
      .map(chord => {
        const at = classIn(chord, bass);
        if (at < 0) return null;
        return {
          chord,
          cost:
            600 * (1 - chord.concordance) +
            (chord.classes.length > 3 ? 120 : 0) +
            (previous ? motion(previous, chord) : 0) +
            (previous && previous.set === chord.set ? 400 : 0) +
            (stable && chord.root !== bass ? 250 : 0) +
            // As in the rule of the octave: a passing bass degree prefers to carry a chord's second
            // class (a first inversion), and its last class (a second inversion) least.
            (!stable && at === 1 ? -80 : 0) +
            (!stable && at > 1 && at === chord.classes.length - 1 ? 120 : 0) +
            (chord.classes.length > o.voices ? 500 : 0) +
            (chord.kind === 'stack' ? 60 : 0)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.cost - b.cost || a.chord.root - b.chord.root)
      .map(x => x.chord);
  const add = (fn, bass, chord, alternatives = [chord], pedal = false) =>
    slots.push({fn, bass, chord, pedal, alternatives});
  const onRoot = degree => material.byRoot[degree];
  const fixed = (fn, bass, degree, pedal = false) =>
    add(fn, bass, onRoot(degree)[0], onRoot(degree), pedal);
  const free = (fn, bass, stable = false) => {
    const previous = slots.at(-1)?.chord ?? null,
      list = over(bass, previous, stable);
    if (!list.length) return fixed(fn, bass, bass);
    add(fn, bass, list[0], list);
  };
  const frame = closing => {
    const fn = closing ? 'close' : 'frame';
    fixed(fn, home, home);
    fixed(fn, home, neighbour, true);
    fixed(fn, home, directional, true);
    fixed(fn, home, home);
  };
  if (o.plan === 'frame') {
    frame(false);
    fixed('approach', neighbour, neighbour);
    fixed('cadence', directional, directional);
    fixed('close', home, home);
  } else if (o.plan === 'octave') {
    frame(false);
    // A long scale takes every other degree, so the descent stays within about a dozen harmonies.
    const stride = n > 12 ? 2 : 1;
    for (let i = n - stride; i >= 1; i -= stride) {
      const bass = (home + i) % n;
      free('motion', bass, bass === directional);
    }
    fixed('approach', neighbour, neighbour);
    fixed('pedal', directional, directional);
    fixed('pedal', directional, home, true);
    fixed('cadence', directional, directional);
    frame(true);
  } else {
    // Roots fall by the directional interval, so the leading harmony arrives just before home.
    const stepDown = (((directional - home) % n) + n) % n || 1;
    fixed('frame', home, home);
    let root = home;
    for (let i = 0; i < n + 1; i++) {
      root = (((root - stepDown) % n) + n) % n;
      if (root === home) break;
      fixed(root === directional ? 'cadence' : 'motion', root, root);
    }
    if (slots.at(-1).fn !== 'cadence') fixed('cadence', directional, directional);
    fixed('close', home, home);
  }
  slots.forEach((slot, index) => {
    const chosen = o.choices[index];
    if (chosen && slot.alternatives[chosen]) slot.chord = slot.alternatives[chosen];
    slot.choice = slot.alternatives.indexOf(slot.chord);
    slot.concordance = slot.chord.concordance;
    slot.inversion = classIn(slot.chord, slot.bass) > 0;
  });
  return {slots, home, directional, neighbour, source: material.source, options: o};
}

function ownPlan(project, o) {
  const context = project.context,
    space = pitchSpace(context),
    events = [];
  for (const c of project.clips) {
    if (project.tracks.find(t => t.id === c.trackId)?.kind !== 'chords') continue;
    for (const e of c.events) events.push({...e, at: c.startTick + e.startTick});
  }
  events.sort((a, b) => a.at - b.at);
  if (!events.length) fail('the chord lane is empty; add chords or choose another plan.');
  const slots = events.map((e, index) => {
    const ordered = e.tones.map(t => t.coordinate).sort((a, b) => space.cents(a) - space.cents(b)),
      classes = uniqueClasses(space, ordered),
      rootTone = e.source?.rootTone,
      rootCoordinate =
        Number.isInteger(rootTone) && e.tones[rootTone] ? e.tones[rootTone].coordinate : ordered[0];
    const degreeAt = m => context.scale.degrees.find(d => space.key(d.coordinate) === space.key(m));
    const chord = {
      root: degreeAt(rootCoordinate)?.degree ?? null,
      rootClass: [...rootCoordinate],
      label: String(e.source?.label ?? `Chord ${index + 1}`),
      kind: 'own',
      classes,
      key: classes.map(space.key).join('|')
    };
    chord.concordance = concordance(space, classes);
    const last = index === events.length - 1;
    return {
      fn:
        e.source?.kind === 'prelude' && PRELUDE_FUNCTIONS[e.source.fn]
          ? e.source.fn
          : last
            ? 'close'
            : index === 0
              ? 'frame'
              : index === events.length - 2
                ? 'cadence'
                : 'motion',
      bass: degreeAt(ordered[0])?.degree ?? null,
      bassClass: [...ordered[0]],
      chord,
      pedal: false,
      alternatives: [chord],
      choice: 0,
      concordance: chord.concordance,
      inversion: space.key(ordered[0]) !== space.key(rootCoordinate)
    };
  });
  return {slots, home: o.home, directional: null, neighbour: null, source: 'own', options: o};
}

// --- voice leading ---------------------------------------------------------------------------------

/** Every playable pitch of a class: enabled keys of the saved layout, or octave copies without one. */
function copies(space, cells, m) {
  const out = new Map();
  if (cells.length) {
    const key = space.key(m);
    for (const cell of cells) {
      if (cell.command || cell.enabled === false) continue;
      const coordinate = cell.coordinate ?? cell.m;
      if (!coordinate || space.key(coordinate) !== key) continue;
      out.set(coordinate.join(','), [...coordinate]);
    }
  } else if (space.vector) {
    for (let k = -3; k <= 3; k++) {
      const coordinate = m.map((v, a) => v + k * space.vector[a]);
      const c = space.cents(coordinate);
      if (c >= -1300 && c <= 2500) out.set(coordinate.join(','), coordinate);
    }
  } else out.set(m.join(','), [...m]);
  return [...out.values()]
    .map(coordinate => ({coordinate, cents: space.cents(coordinate)}))
    .sort((a, b) => a.cents - b.cents);
}

const isPerfect = (interval, span) => {
  const size = ((interval % span) + span) % span;
  return Math.min(size, span - size) < 12 || Math.abs(size - 701.955) < 12;
};

/**
 * Gives every slot its sounding voices, lowest first: the bass follows the plan's bass line in the
 * nearest register, and the upper voices move as little as possible while covering the chord, never
 * crossing, and carrying the top voice toward a registral high point at `options.climax` percent.
 */
export function voicePrelude(project, plan, cells = []) {
  const context = project.context,
    space = pitchSpace(context),
    o = plan.options,
    span = space.span ?? 1200,
    upper = o.voices - 1;
  const usable = cells.filter(c => !c.command && c.enabled !== false && (c.coordinate ?? c.m));
  const range = usable.length ? usable.map(c => space.cents(c.coordinate ?? c.m)) : [-1300, 2500];
  const low = Math.min(...range),
    high = Math.max(...range);
  const bassClassOf = slot => slot.bassClass ?? homeOf(context, slot.bass);
  let previous = null,
    anchor = null,
    lift = 0,
    firstTop = 0;
  const voiced = plan.slots.map((slot, index) => {
    const bassChoices = copies(space, usable, bassClassOf(slot));
    if (!bassChoices.length)
      fail(
        `the bass of harmony ${index + 1} has no key on the saved HexBoard; change the layout or the plan.`
      );
    const pool = new Map();
    for (const c of slot.chord.classes)
      for (const copy of copies(space, usable, c)) pool.set(copy.coordinate.join(','), copy);
    const tones = [...pool.values()].sort((a, b) => a.cents - b.cents);
    const room = b => tones.filter(t => t.cents > b.cents + 1).length;
    let bass;
    if (!previous) {
      const fits = bassChoices.filter(b => room(b) >= upper);
      if (!fits.length)
        fail(
          `the saved HexBoard has too few keys of harmony ${index + 1} for ${o.voices} voices; choose fewer voices.`
        );
      // The bass octave needs a register to fall into; other plans start as low as they can.
      const want = low + (high - low) * (o.plan === 'octave' ? 0.3 : 0.15);
      bass = fits.reduce((a, b) => (Math.abs(a.cents - want) <= Math.abs(b.cents - want) ? a : b));
      anchor = bass.cents;
    } else {
      const fits = bassChoices.filter(b => room(b) >= upper),
        from = fits.length ? fits : bassChoices;
      const cost = b => Math.abs(b.cents - previous.bass.cents) + 0.3 * Math.abs(b.cents - anchor);
      bass = from.reduce((a, b) => (cost(a) <= cost(b) ? a : b));
    }
    const above = tones.filter(t => t.cents > bass.cents + 1);
    if (above.length < upper)
      fail(
        `harmony ${index + 1} has too few playable tones above its bass for ${o.voices} voices; choose fewer voices or another layout.`
      );
    const progress = plan.slots.length > 1 ? index / (plan.slots.length - 1) : 0,
      peak = o.climax / 100,
      arch = progress <= peak ? progress / peak : 1 - (progress - peak) / (1 - peak);
    const ideal = i =>
      previous ? previous.upper[i].cents : bass.cents + 700 + (i * 900) / Math.max(1, upper - 1);
    const target = previous ? firstTop + lift * arch : null;
    // The nearest few candidates of each voice keep the search small and the motion close.
    const perVoice = Array.from({length: upper}, (_, i) =>
      [...above]
        .sort((a, b) => Math.abs(a.cents - ideal(i)) - Math.abs(b.cents - ideal(i)))
        .slice(0, 5)
    );
    const classKeys = slot.chord.classes.map(space.key),
      bassKey = space.key(bass.coordinate);
    let best = null,
      bestCost = Infinity;
    const walk = (i, chosen) => {
      if (i === upper) {
        let cost = 0;
        const present = new Set([bassKey, ...chosen.map(t => space.key(t.coordinate))]);
        cost += 500 * classKeys.filter(k => !present.has(k)).length;
        chosen.forEach((t, v) => {
          cost += Math.abs(t.cents - ideal(v));
          const below = v ? chosen[v - 1].cents : bass.cents,
            gap = t.cents - below;
          if (v && gap > span) cost += (gap - span) * 0.5;
          if (!v && gap > span * 1.6) cost += (gap - span * 1.6) * 0.3;
          if (gap < 90) cost += 80;
        });
        if (target !== null) cost += 0.35 * Math.abs(chosen[upper - 1].cents - target);
        if (previous) {
          const now = [bass, ...chosen],
            then = [previous.bass, ...previous.upper];
          for (let a = 0; a < now.length; a++)
            for (let b = a + 1; b < now.length; b++) {
              const da = now[a].cents - then[a].cents,
                db = now[b].cents - then[b].cents;
              if (
                Math.abs(da) > 5 &&
                Math.abs(db) > 5 &&
                Math.sign(da) === Math.sign(db) &&
                isPerfect(then[b].cents - then[a].cents, span) &&
                isPerfect(now[b].cents - now[a].cents, span)
              )
                cost += 150;
            }
        }
        if (cost < bestCost - 1e-9) {
          bestCost = cost;
          best = [...chosen];
        }
        return;
      }
      for (const t of perVoice[i]) {
        if (chosen.length && t.cents <= chosen.at(-1).cents + 1) continue;
        chosen.push(t);
        walk(i + 1, chosen);
        chosen.pop();
      }
    };
    walk(0, []);
    // A narrow layout can leave the nearest candidates crossing; the lowest free tones always fit.
    if (!best) best = above.slice(0, upper);
    if (!previous) {
      firstTop = best[upper - 1].cents;
      lift = Math.max(0, Math.min(700, high - firstTop));
    }
    previous = {bass, upper: best};
    const sounding = [bass, ...best],
      rootKey = slot.chord.rootClass
        ? space.key(slot.chord.rootClass)
        : space.key(slot.chord.classes[0]);
    return {
      ...slot,
      tones: sounding.map(t => [...t.coordinate]),
      cents: sounding.map(t => t.cents),
      rootTone: Math.max(
        0,
        sounding.findIndex(t => space.key(t.coordinate) === rootKey)
      )
    };
  });
  return voiced;
}

// --- figures ---------------------------------------------------------------------------------------

/** The order in which a figure sounds the voices (0 is the bass) over `steps` equal attacks. */
export function figureSequence(figure, voices, steps) {
  const top = voices - 1,
    out = [];
  const fill = cycle => {
    for (let i = 0; out.length < steps; i++) out.push(cycle[i % cycle.length]);
  };
  if (voices < 2) fail('a figure needs at least two voices.');
  if (figure === 'rise') {
    for (let v = 0; v < voices && out.length < steps; v++) out.push(v);
    const echo = Math.min(3, top);
    fill(Array.from({length: echo}, (_, i) => voices - echo + i));
  } else if (figure === 'wave') {
    const cycle = [];
    for (let v = 0; v < voices; v++) cycle.push(v);
    for (let v = top - 1; v >= 1; v--) cycle.push(v);
    fill(cycle);
  } else if (figure === 'rock') {
    const cycle = [0, top];
    for (let v = 1; v < top; v++) cycle.push(v, top);
    fill(cycle);
  } else if (figure === 'fall') {
    const cycle = [0];
    for (let v = top; v >= 1; v--) cycle.push(v);
    fill(cycle);
  } else if (figure === 'weave') {
    const cycle = [];
    for (let lo = 0, hi = top; lo <= hi; lo++, hi--) {
      cycle.push(lo);
      if (hi !== lo) cycle.push(hi);
    }
    fill(cycle);
  } else if (figure === 'trill') {
    out.push(0);
    fill(voices > 2 ? [top - 1, top] : [top]);
  } else fail('unknown figure.');
  return out.slice(0, steps);
}

function patternFor(name, sequence, {stepTick, lengthTick, sustain, voices}) {
  const events = sequence.map((voice, i) => {
    const start = i * stepTick;
    let next = sequence.findIndex((v, j) => j > i && v === voice);
    const until = next < 0 ? lengthTick : next * stepTick;
    const held = sustain === 'all' || (sustain === 'bass' && voice === 0);
    const duration = held
      ? until - start
      : Math.max(1, Math.round(Math.min(stepTick, until - start) * 0.92));
    return {
      id: `step-${i}`,
      voice: Math.min(3, voice),
      startTick: start,
      durationTick: Math.max(1, Math.min(duration, lengthTick - start)),
      velocity: voice === 0 ? 100 : voice === voices - 1 ? 90 : 80,
      tones: [{rank: voice + 1, octaves: 0}]
    };
  });
  return {version: 1, name, lengthTick, events};
}

/** Tick layout of the figure for a meter: harmony length, cycle, step and attacks per cycle. */
export function preludeTiming(meter, options) {
  const o = options,
    harmony = Math.round(barTicks(meter) * o.bars),
    stepTick = (PPQ * 4) / o.division;
  if (!int(stepTick) || !int(harmony) || harmony < stepTick * 2)
    fail('this meter and note value leave no room for a figure; choose a longer harmony.');
  let repeats = o.repeats,
    cycle = harmony / repeats;
  if (!int(cycle) || cycle < stepTick * 2) {
    repeats = 1;
    cycle = harmony;
  }
  const steps = Math.floor(cycle / stepTick);
  return {harmony, stepTick, cycle, steps, repeats};
}

/**
 * The whole prelude as data: voiced harmonies in time with the figure each one takes, and the
 * figuration patterns those names refer to. `writePrelude` (composition-project) stores it.
 */
export function composePrelude(project, options, {material, cells = []} = {}) {
  const context = project.context,
    o = normalizePreludeOptions(options, context.scale.n),
    stuff = material ?? preludeMaterial(context),
    plan = planPrelude(project, stuff, o),
    slots = voicePrelude(project, plan, cells),
    timing = preludeTiming(project.meter, o),
    voices = o.voices;
  const base = {stepTick: timing.stepTick, lengthTick: timing.cycle, sustain: o.sustain, voices};
  const figureName = PRELUDE_FIGURES.find(f => f.id === o.figure).name;
  const patterns = {
    main: patternFor(figureName, figureSequence(o.figure, voices, timing.steps), base)
  };
  const closeLength = timing.harmony * 2,
    closeSteps = Math.min(voices, Math.floor(closeLength / timing.stepTick));
  patterns.close = patternFor(
    'Closing arpeggio',
    Array.from({length: closeSteps}, (_, i) => i),
    {stepTick: timing.stepTick, lengthTick: closeLength, sustain: 'all', voices}
  );
  if (o.variety === 'developing') {
    const main = figureSequence(o.figure, voices, timing.steps);
    patterns.answer = patternFor(
      `${figureName}, answered`,
      [main[0], ...main.slice(1).reverse()],
      base
    );
    patterns.pedal = patternFor(
      'Pedal oscillation',
      figureSequence('trill', voices, timing.steps),
      base
    );
    patterns.cadence = patternFor(
      'Cadence figure',
      figureSequence(o.figure === 'fall' ? 'rise' : 'fall', voices, timing.steps),
      base
    );
  }
  const motion = slots.map((s, i) => (s.fn === 'motion' ? i : -1)).filter(i => i >= 0),
    turn = motion.length ? motion[Math.floor(motion.length / 2)] : Infinity;
  let tick = 0;
  const harmonies = slots.map((slot, index) => {
    const last = index === slots.length - 1,
      durationTick = last ? closeLength : timing.harmony;
    let pattern = 'main';
    if (last) pattern = 'close';
    else if (o.variety === 'developing') {
      if (slot.fn === 'pedal') pattern = 'pedal';
      else if (slot.fn === 'cadence') pattern = 'cadence';
      else if (slot.fn === 'motion' && index >= turn) pattern = 'answer';
    }
    const harmony = {
      startTick: tick,
      durationTick,
      tones: slot.tones,
      pattern,
      source: {
        kind: 'prelude',
        label: slot.chord.label,
        rootTone: slot.rootTone,
        fn: slot.fn,
        role: PRELUDE_FUNCTIONS[slot.fn],
        ...(index === 0 ? {prelude: o} : {})
      }
    };
    tick += durationTick;
    return harmony;
  });
  const used = new Set(harmonies.map(h => h.pattern));
  for (const key of Object.keys(patterns)) if (!used.has(key)) delete patterns[key];
  const bar = barTicks(project.meter);
  return {
    plan,
    slots,
    timing,
    harmonies,
    patterns,
    lengthTick: Math.ceil(tick / bar) * bar,
    options: o
  };
}

/** The options a written prelude was made with, read back from its first harmony; null otherwise. */
export function writtenPreludeOptions(project) {
  for (const c of project?.clips ?? [])
    for (const e of c.events)
      if (e.source?.kind === 'prelude' && e.source.prelude)
        return normalizePreludeOptions(e.source.prelude, project.context.scale.n);
  return null;
}

/** Formal sections of a written prelude, in order: runs of harmonies sharing a function. */
export function preludeSections(project) {
  const events = [];
  for (const c of project?.clips ?? []) {
    if (project.tracks.find(t => t.id === c.trackId)?.kind !== 'chords') continue;
    for (const e of c.events)
      if (e.source?.kind === 'prelude')
        events.push({
          fn: e.source.fn,
          start: c.startTick + e.startTick,
          end: c.startTick + e.startTick + e.durationTick
        });
  }
  events.sort((a, b) => a.start - b.start);
  const sections = [];
  for (const e of events) {
    const last = sections.at(-1),
      group = e.fn === 'approach' || e.fn === 'cadence' ? 'pedal' : e.fn;
    if (last && last.group === group) {
      last.end = e.end;
      last.count++;
    } else sections.push({group, fn: e.fn, start: e.start, end: e.end, count: 1});
  }
  return sections;
}
