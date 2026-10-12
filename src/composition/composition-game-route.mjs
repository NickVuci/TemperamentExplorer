// Display-only suggestions from the chart's canonical matching keys. Each matching pitch keeps one
// button for the whole chart, so repeated notes and common chord tones stay where they were.
import {hexDistance} from '../hexboard/hexboard-chords.mjs';
import {buildChart} from './composition-game.mjs';

const BEAM_WIDTH = 64,
  STARTS = 8,
  POLISHED = 3,
  PASSES = 8;
// Costs in hexes of travel: a bend in a chord or melody line, and each hex of a chord's reach.
const BEND = 1.5,
  REACH = 2;
const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const identity = (t, match) =>
  match === 'degree' && t.degree !== null && t.degree !== undefined
    ? `d${t.degree}`
    : `c${t.coordinate.join(',')}`;
const compare = (a, b) => {
  for (let i = 0; i < 2; i++) if (a.score[i] !== b.score[i]) return a.score[i] - b.score[i];
  for (let i = 0; i < a.keys.length; i++)
    if (a.keys[i].index !== b.keys[i].index) return a.keys[i].index - b.keys[i].index;
  return 0;
};
/** An onset's cost: bends and reach of its shape (a lone note bends off the melody line), plus travel. */
function cost(keys, previous, line) {
  if (keys.length === 1)
    return (
      (line.length === 2 && cross(line[0], line[1], keys[0]) !== 0 ? BEND : 0) +
      hexDistance(previous, keys[0])
    );
  let bends = 0,
    reach = 0,
    travel = hexDistance(previous, keys[0]);
  for (let i = 1; i < keys.length; i++) {
    travel += hexDistance(keys[i - 1], keys[i]);
    if (i > 1 && cross(keys[i - 2], keys[i - 1], keys[i]) !== 0) bends++;
    for (let j = 0; j < i; j++) reach = Math.max(reach, hexDistance(keys[j], keys[i]));
  }
  return BEND * bends + REACH * reach + travel;
}

/**
 * One suggested button per matching pitch for the whole chart; every matching key still counts.
 * A button chosen for an exact pitch (`chosen`, "period,generator" → key) wins, then the player's most
 * recently used matching button (`played`, key → order), then the shared cost.
 */
export function suggestedRoute(
  targets,
  board,
  {center = 65, match = 'exact', played = new Map(), chosen = new Map()} = {}
) {
  const route = new Map();
  if (!board?.keys?.length) return route;
  const valid = k => k && k.enabled && !k.command && Number.isFinite(k.x) && Number.isFinite(k.y);
  const home = board.keys[center] ?? board.keys.find(valid);
  if (!home) return route;
  const spread = keys => {
    let sum = 0;
    for (const k of keys) sum += hexDistance(home, k);
    return sum;
  };
  const options = t => {
    const ids =
      match === 'degree' && t.degree !== null && t.degree !== undefined ? t.degreeKeys : t.keys;
    const keys = [...new Set(ids ?? [])]
      .map(i => board.keys[i])
      .filter(valid)
      .sort((a, b) => a.index - b.index);
    const pick = chosen.get(t.coordinate.join(','));
    if (keys.some(k => k.index === pick)) return [board.keys[pick]];
    let preferred = null,
      order = -Infinity;
    for (const key of keys)
      if (played.has(key.index) && played.get(key.index) > order) {
        preferred = key;
        order = played.get(key.index);
      }
    return preferred ? [preferred] : keys;
  };
  // Onsets in time order, each with one note per matching pitch in pitch order.
  const byTick = new Map(),
    onsets = [];
  for (const t of targets) {
    if (!byTick.has(t.tick)) byTick.set(t.tick, []);
    byTick.get(t.tick).push(t);
  }
  for (const [, group] of [...byTick].sort((a, b) => a[0] - b[0])) {
    const pitches = new Map();
    for (const t of [...group].sort((a, b) => a.cents - b.cents || a.index - b.index)) {
      const id = identity(t, match);
      if (!pitches.has(id)) pitches.set(id, {id, targets: [], choices: options(t)});
      pitches.get(id).targets.push(t);
    }
    const notes = [...pitches.values()].filter(n => n.choices.length);
    if (notes.length) onsets.push(notes);
  }
  if (!onsets.length) return route;
  // A pitch's notes share the button most of them can use; notes that cannot (a judged button, or a
  // newly played one) form further groups the same way. Each group is a slot with one key.
  const byId = new Map(),
    slots = [];
  onsets.forEach((notes, at) => {
    for (const n of notes) {
      if (!byId.has(n.id)) byId.set(n.id, []);
      byId.get(n.id).push(n);
      n.at = at;
    }
  });
  for (const notes of byId.values()) {
    let rest = notes;
    while (rest.length) {
      const count = new Map();
      for (const n of rest) for (const k of n.choices) count.set(k, (count.get(k) ?? 0) + 1);
      let best = null,
        most = 0;
      for (const [k, c] of count)
        if (c > most || (c === most && k.index < best.index)) {
          best = k;
          most = c;
        }
      const members = rest.filter(n => n.choices.includes(best));
      const slot = {
        domain: members.reduce(
          (keys, n) => keys.filter(k => n.choices.includes(k)),
          members[0].choices
        ),
        key: null,
        at: members[0].at,
        uses: members.length
      };
      for (const n of members) n.slot = slot;
      slots.push(slot);
      rest = rest.filter(n => n.slot !== slot);
    }
  }
  slots
    .sort((a, b) => a.at - b.at)
    .forEach((s, i) => {
      s.order = i;
    });
  const free = slots.filter(s => s.domain.length > 1);
  // Each onset's context is the previous onset's lowest note and the melody line since the last chord.
  // Onsets with the same notes and context always cost the same, so each kind is scored once.
  const kinds = new Map();
  let line = [];
  onsets.forEach((notes, at) => {
    notes.previous = at ? onsets[at - 1][0].slot : null;
    notes.line = notes.length > 1 ? [] : line;
    if (notes.length > 1) line = [];
    else if (line.at(-1) !== notes[0].slot) line = [...line, notes[0].slot].slice(-2);
    const parts = [...notes.map(n => n.slot), notes.previous, ...notes.line],
      id = parts.map(s => (s ? s.order : -1)).join(',') + `/${notes.length}`;
    if (!kinds.has(id))
      kinds.set(id, {
        slots: notes.map(n => n.slot),
        previous: notes.previous,
        line: notes.line,
        keys: [],
        lineKeys: [],
        count: 0,
        parts
      });
    kinds.get(id).count++;
  });
  let centre = 0;
  const evaluate = list => {
    let main = 0;
    centre = 0;
    for (const kind of list) {
      for (let i = 0; i < kind.slots.length; i++) kind.keys[i] = kind.slots[i].key;
      for (let i = 0; i < kind.line.length; i++) kind.lineKeys[i] = kind.line[i].key;
      main += cost(kind.keys, kind.previous?.key ?? home, kind.lineKeys) * kind.count;
      centre += spread(kind.keys) * kind.count;
    }
    return main;
  };
  const search = (choices, previous, line) => {
    let beam = [{keys: [], score: []}];
    for (const list of choices) {
      const next = [];
      for (const partial of beam)
        for (const key of list) {
          const keys = [...partial.keys, key];
          next.push({keys, score: [cost(keys, previous, line), spread(keys)]});
        }
      next.sort(compare);
      beam = next.slice(0, BEAM_WIDTH);
    }
    return beam;
  };
  // One onset's fingerings, best first. Every line through the first two pitches is seeded before the
  // bounded shape search, so a complete straight fingering survives a distant first pair.
  const ranked = new Map();
  const fingerings = (choices, previous, line) => {
    const id = [
      ...choices.map(list => list.map(k => k.index).join(' ')),
      previous.index,
      ...line.map(k => k.index)
    ].join('|');
    if (!ranked.has(id)) ranked.set(id, rank(choices, previous, line));
    return ranked.get(id);
  };
  const rank = (choices, previous, line) => {
    if (choices.length === 1)
      return choices[0]
        .map(key => ({keys: [key], score: [cost([key], previous, line), spread([key])]}))
        .sort(compare);
    const found = [],
      lines = new Set();
    for (const a of choices[0])
      for (const b of choices[1]) {
        const dx = b.x - a.x,
          dy = b.y - a.y;
        if (!dx && !dy) continue;
        const divisor = dy || dx,
          id = [dy / divisor, -dx / divisor, (dx * a.y - dy * a.x) / divisor].join(',');
        if (lines.has(id)) continue;
        lines.add(id);
        const onLine = choices.map(list => list.filter(k => cross(a, b, k) === 0));
        if (!onLine.some(list => !list.length)) found.push(search(onLine, previous, line)[0]);
      }
    return [...found, ...search(choices, previous, line)].sort(compare);
  };
  // Starting points: in time order each pitch takes the best button where it first sounds, from each
  // of the first onset's best fingerings; or each pitch takes its copy nearest a copy of the most used.
  const seeds = [];
  const greedy = start => {
    for (const s of slots) s.key = s.domain.length === 1 ? s.domain[0] : null;
    let first = true;
    for (const notes of onsets) {
      if (notes.every(n => n.slot.key)) continue;
      const pick = fingerings(
        notes.map(n => (n.slot.key ? [n.slot.key] : n.slot.domain)),
        notes.previous?.key ?? home,
        notes.line.map(s => s.key)
      )[first ? start : 0];
      if (!pick) return;
      pick.keys.forEach((key, i) => {
        notes[i].slot.key ??= key;
      });
      first = false;
    }
    if (!first || !start) seeds.push(slots.map(s => s.key));
  };
  for (let start = 0; start < STARTS; start++) greedy(start);
  const anchor = [...free].sort((a, b) => b.uses - a.uses || a.at - b.at)[0];
  const euclid = (p, k) => (k.x - p.x) ** 2 + 3 * (k.y - p.y) ** 2;
  const nearer = (p, a, b) =>
    hexDistance(p, a) - hexDistance(p, b) || euclid(p, a) - euclid(p, b) || a.index - b.index;
  if (anchor)
    for (const p of anchor.domain)
      seeds.push(slots.map(s => s.domain.reduce((best, k) => (nearer(p, k, best) < 0 ? k : best))));
  // Then pitches move, alone or a chord at a time, to whichever buttons best serve the whole piece.
  const all = [...kinds.values()],
    affected = new Map(slots.map(s => [s, []]));
  for (const kind of all) for (const s of new Set(kind.parts)) if (s) affected.get(s).push(kind);
  const chords = new Map();
  for (const kind of all)
    if (kind.slots.filter(s => s.domain.length > 1).length > 1) {
      const id = kind.slots.map(s => s.order).join(',');
      if (!chords.has(id))
        chords.set(id, {
          slots: kind.slots,
          options: fingerings(
            kind.slots.map(s => s.domain),
            home,
            []
          )
            .slice(0, BEAM_WIDTH)
            .map(f => f.keys)
        });
    }
  for (const chord of chords.values())
    chord.affected = [...new Set(chord.slots.flatMap(s => affected.get(s)))];
  const improve = (group, list, options) => {
    const current = group.map(s => s.key);
    let best = current,
      bestMain = evaluate(list),
      bestCentre = centre;
    for (const keys of options) {
      if (keys.every((k, i) => k === current[i])) continue;
      group.forEach((s, i) => {
        s.key = keys[i];
      });
      const main = evaluate(list);
      if (main < bestMain || (main === bestMain && centre < bestCentre)) {
        best = keys;
        bestMain = main;
        bestCentre = centre;
      }
    }
    group.forEach((s, i) => {
      s.key = best[i];
    });
    return best !== current;
  };
  const unique = new Map(seeds.map(keys => [keys.map(k => k.index).join(','), keys]));
  const starts = [...unique.values()]
    .map(keys => {
      slots.forEach((s, i) => {
        s.key = keys[i];
      });
      return {keys, main: evaluate(all), centre};
    })
    .sort((a, b) => a.main - b.main || a.centre - b.centre)
    .slice(0, POLISHED);
  let result = null;
  for (const seed of starts) {
    slots.forEach((s, i) => {
      s.key = seed.keys[i];
    });
    for (let pass = 0; pass < PASSES; pass++) {
      let moved = false;
      for (const slot of free)
        if (
          improve(
            [slot],
            affected.get(slot),
            slot.domain.map(k => [k])
          )
        )
          moved = true;
      for (const chord of chords.values())
        if (improve(chord.slots, chord.affected, chord.options)) moved = true;
      if (!moved) break;
    }
    const main = evaluate(all);
    if (!result || main < result.main || (main === result.main && centre < result.centre))
      result = {keys: slots.map(s => s.key), main, centre};
  }
  slots.forEach((s, i) => {
    s.key = result.keys[i];
  });
  for (const notes of onsets)
    for (const n of notes) for (const t of n.targets) route.set(t.index, n.slot.key.index);
  return route;
}

/**
 * The composition's fingering, cue id → button: one route over both parts of the whole timeline, so
 * Compose and every Play section and part show the same buttons. The project's chosen buttons come
 * first; `pinned` cue ids (notes already judged) keep the buttons given.
 */
export function pieceFingering(
  project,
  board,
  {match = 'exact', played = new Map(), pinned = new Map()} = {}
) {
  const targets = buildChart(project, {part: 'both'}).targets.map(t =>
    pinned.has(t.id) ? {...t, keys: [pinned.get(t.id)], degreeKeys: [pinned.get(t.id)]} : t
  );
  const route = suggestedRoute(targets, board, {
    center: project.layout?.center ?? 65,
    match,
    played,
    chosen: new Map(Object.entries(project.fingering ?? {}))
  });
  return new Map(targets.filter(t => route.has(t.index)).map(t => [t.id, route.get(t.index)]));
}
