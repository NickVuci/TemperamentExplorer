// Portable chord-voice patterns and their one derived melody view. No transport or UI state.
import {coordinateCents} from '../core/pitch.mjs';
import {equivalencePolicy} from '../harmonic/harmonic-equivalence.mjs';
import {compositionBoard} from './composition-board.mjs';

export const FIGURATION_FORMAT = 'temperament-lab-figuration-v1';
export const ADAPTIVE_FIGURATION_FORMAT = 'temperament-lab-figuration-v2';
export const FIGURATION_LIMITS = Object.freeze({
  patterns: 512,
  events: 2048,
  length: 960 * 128,
  octaves: 8
});
const fail = message => {
  throw Error(`Figuration: ${message}`);
};
const int = Number.isSafeInteger;
const pairKey = m => m.join(',');
function randomSequence(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
export const isGenerated = e => e.source?.kind === 'figuration';

export function octaveVector(context) {
  try {
    return equivalencePolicy(context, 'octave').vector;
  } catch {
    return null;
  }
}

export function orderedChord(context, chord) {
  const seen = new Set();
  return chord.tones
    .map(t => t.coordinate)
    .filter(m => {
      const key = pairKey(m);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        coordinateCents(context, a) - coordinateCents(context, b) || a[0] - b[0] || a[1] - b[1]
    );
}

/** Every exact, enabled chord-tone pitch on the saved layout, including octave copies. */
export function playableChordTones(context, chord, cells = []) {
  const voices = orderedChord(context, chord),
    vector = octaveVector(context),
    result = [];
  const seen = new Set();
  for (const cell of cells) {
    if (cell.command || cell.enabled === false) continue;
    const coordinate = cell.coordinate ?? cell.m;
    if (!coordinate) continue;
    voices.forEach((m, i) => {
      const axis = vector?.[0] ? 0 : 1;
      const octaves = vector ? (coordinate[axis] - m[axis]) / vector[axis] : 0;
      if (!int(octaves) || !m.every((n, a) => n + octaves * (vector?.[a] ?? 0) === coordinate[a]))
        return;
      const key = `${i}:${pairKey(coordinate)}`;
      if (seen.has(key)) return;
      seen.add(key);
      result.push({
        rank: i + 1,
        octaves,
        coordinate: [...coordinate],
        cents: coordinateCents(context, coordinate)
      });
    });
  }
  return result.sort((a, b) => a.cents - b.cents || a.rank - b.rank || a.octaves - b.octaves);
}

export function validatePattern(pattern) {
  if (!pattern || ![1, 2].includes(pattern.version))
    fail('unsupported pattern version; update the app to open this figure.');
  if (typeof pattern.name !== 'string' || !pattern.name.trim() || pattern.name.length > 80)
    fail('enter a pattern name of 1–80 characters.');
  if (
    !int(pattern.lengthTick) ||
    pattern.lengthTick < 1 ||
    pattern.lengthTick > FIGURATION_LIMITS.length
  )
    fail('invalid pattern length.');
  if (!Array.isArray(pattern.events) || pattern.events.length > FIGURATION_LIMITS.events)
    fail('too many pattern notes.');
  const ids = new Set();
  for (const e of pattern.events) {
    if (typeof e.id !== 'string' || !e.id || e.id.length > 128 || ids.has(e.id))
      fail('pattern note IDs must be unique.');
    ids.add(e.id);
    if (e.voice !== undefined && (!int(e.voice) || e.voice < 0 || e.voice > 3))
      fail('invalid pattern voice.');
    if (
      !int(e.startTick) ||
      e.startTick < 0 ||
      !int(e.durationTick) ||
      e.durationTick < 1 ||
      e.startTick + e.durationTick > pattern.lengthTick
    )
      fail('a note is outside the pattern cycle.');
    if (!int(e.velocity) || e.velocity < 1 || e.velocity > 127)
      fail('note velocity must be 1–127.');
    if (!Array.isArray(e.tones) || !e.tones.length || e.tones.length > 8)
      fail('a note must have 1–8 chord-tone references.');
    for (const t of e.tones)
      if (
        !int(t.rank) ||
        t.rank < 1 ||
        t.rank > 8 ||
        !int(t.octaves) ||
        Math.abs(t.octaves) > FIGURATION_LIMITS.octaves
      )
        fail('invalid chord-tone reference.');
    for (const t of e.tones)
      if (
        t.position !== undefined &&
        (pattern.version !== 2 ||
          typeof t.position !== 'number' ||
          !Number.isFinite(t.position) ||
          t.position < 0 ||
          t.position > 1)
      )
        fail('invalid automatic register position.');
  }
  if (
    pattern.seed !== undefined &&
    (!int(pattern.seed) || pattern.seed < 0 || pattern.seed > 0xffffffff)
  )
    fail('invalid random seed.');
  return pattern;
}

export function figurationPresetSnapshot(name, input) {
  const pattern = {
    version: input?.version,
    name: String(name).trim(),
    lengthTick: input?.lengthTick,
    events: structuredClone(input?.events),
    ...(input?.seed !== undefined ? {seed: input.seed} : {})
  };
  return validatePattern(pattern);
}

export function referenceFor(context, chord, coordinate) {
  const voices = orderedChord(context, chord),
    vector = octaveVector(context);
  const exact = voices.findIndex(m => pairKey(m) === pairKey(coordinate));
  if (exact >= 0) return {rank: exact + 1, octaves: 0};
  const matches = [];
  if (vector)
    voices.forEach((m, i) => {
      const axis = vector[0] ? 0 : 1,
        shift = (coordinate[axis] - m[axis]) / vector[axis];
      if (
        int(shift) &&
        Math.abs(shift) <= FIGURATION_LIMITS.octaves &&
        m.every((v, a) => v + shift * vector[a] === coordinate[a])
      )
        matches.push({rank: i + 1, octaves: shift});
    });
  if (matches.length !== 1)
    fail(
      matches.length
        ? 'this pitch has multiple chord-tone references; choose a voice row in the pattern editor.'
        : 'this note is not a chord tone in the reference overlay.'
    );
  return matches[0];
}

export function patternFromNotes(context, chord, {name, lengthTick, events}, {cells = []} = {}) {
  const pattern = {
    version: 2,
    name,
    lengthTick,
    events: events.map(e => ({
      id: e.source?.patternEventId ?? e.id,
      startTick: e.startTick,
      durationTick: e.durationTick,
      velocity: e.velocity,
      ...(e.source?.voice !== undefined ? {voice: e.source.voice} : {}),
      tones: e.tones.map((t, i) => {
        const ref = e.source?.references?.[i];
        if (ref) {
          const expected = patternNotes(
            context,
            chord,
            {
              version: 2,
              name,
              lengthTick: 1,
              events: [
                {
                  id: 'check',
                  startTick: 0,
                  durationTick: 1,
                  velocity: 90,
                  tones: [ref],
                  ...(e.source?.voice !== undefined ? {voice: e.source.voice} : {})
                }
              ]
            },
            'check',
            {cells}
          )[0].tones[0].coordinate;
          if (pairKey(expected) === pairKey(t.coordinate)) return structuredClone(ref);
        }
        return referenceFor(context, chord, t.coordinate);
      })
    }))
  };
  if (!pattern.events.some(e => e.tones.some(t => t.position !== undefined))) pattern.version = 1;
  return validatePattern(pattern);
}

export function patternNotes(context, chord, pattern, prefix = 'figure', {cells = []} = {}) {
  validatePattern(pattern);
  const voices = orderedChord(context, chord),
    vector = octaveVector(context);
  const available = pattern.events.some(e => e.tones.some(t => t.position !== undefined))
    ? playableChordTones(context, chord, cells)
    : [];
  const low = available[0]?.cents ?? 0,
    high = available.at(-1)?.cents ?? 0;
  const bass = available.find(t => t.rank === 1)?.cents;
  return pattern.events.map(e => ({
    id: `${prefix}:${e.id}`,
    startTick: e.startTick,
    durationTick: e.durationTick,
    velocity: e.velocity,
    source: {
      kind: 'figuration-reference',
      patternEventId: e.id,
      references: structuredClone(e.tones),
      ...(e.voice !== undefined ? {voice: e.voice} : {})
    },
    tones: e.tones.map((t, i) => {
      if (!voices[t.rank - 1])
        fail(`the chord needs tone ${t.rank}, but has only ${voices.length}.`);
      if (t.position !== undefined) {
        let choices = available.filter(c => c.rank === t.rank);
        if (e.voice > 0 && bass !== undefined) choices = choices.filter(c => c.cents > bass);
        if (!choices.length)
          fail(
            `tone ${t.rank} has no playable register on the saved HexBoard; change the harmony, layout or figure.`
          );
        const desired = low + t.position * (high - low);
        const chosen = choices.reduce((a, b) =>
          Math.abs(a.cents - desired) <= Math.abs(b.cents - desired) ? a : b
        );
        return {toneId: `${prefix}:${e.id}:tone:${i}`, coordinate: [...chosen.coordinate]};
      }
      if (t.octaves && !vector)
        fail('this harmony has no octave equivalence; use its written pitches.');
      const coordinate = voices[t.rank - 1].map((v, a) => v + t.octaves * (vector?.[a] ?? 0));
      if (coordinate.some(v => !int(v) || Math.abs(v) > 10000))
        fail('a generated pitch exceeds the coordinate limit.');
      return {toneId: `${prefix}:${e.id}:tone:${i}`, coordinate};
    })
  }));
}

// The caller supplies canonical grid boundaries, keeping grid maths in composition-grid.
export function generatePattern({
  name = 'New figure',
  lengthTick,
  boundaries,
  voiceCount,
  contour = 'random',
  lowOctave = 0,
  highOctave = 0,
  rests = 0,
  velocity = 90,
  seed = 1
}) {
  if (!int(voiceCount) || voiceCount < 1 || voiceCount > 8) fail('choose a reference chord first.');
  if (!['random', 'rising', 'falling', 'alternating'].includes(contour)) fail('unknown contour.');
  if (
    !int(lowOctave) ||
    !int(highOctave) ||
    lowOctave > highOctave ||
    Math.abs(lowOctave) > 8 ||
    Math.abs(highOctave) > 8 ||
    !Number.isFinite(rests) ||
    rests < 0 ||
    rests > 1
  )
    fail('invalid generation range.');
  const random = randomSequence(seed);
  const positions = [...new Set([0, ...boundaries, lengthTick])]
    .filter(t => int(t) && t >= 0 && t <= lengthTick)
    .sort((a, b) => a - b);
  if (positions.length - 1 > FIGURATION_LIMITS.events)
    fail('the grid makes too many pattern notes.');
  const events = [],
    range = voiceCount * (highOctave - lowOctave + 1);
  for (let i = 0; i < positions.length - 1; i++) {
    let index;
    if (contour === 'random') index = Math.floor(random() * range);
    else if (contour === 'rising') index = i % range;
    else if (contour === 'falling') index = range - 1 - (i % range);
    else {
      const cycle = Math.max(1, 2 * (range - 1)),
        phase = i % cycle;
      index = phase < range ? phase : cycle - phase;
    }
    if (random() < rests) continue;
    events.push({
      id: `step-${i}`,
      startTick: positions[i],
      durationTick: positions[i + 1] - positions[i],
      velocity,
      tones: [{rank: (index % voiceCount) + 1, octaves: lowOctave + Math.floor(index / voiceCount)}]
    });
  }
  return validatePattern({version: 1, name, lengthTick, events, seed: seed >>> 0});
}

/** Bass-led counterpoint, with portable register positions fitted to each harmony's layout. */
export function generateTexturePattern({
  context,
  chord,
  cells = [],
  parts = 3,
  range = 'board',
  beatTick = 960,
  ...options
}) {
  const {
    name = 'New figure',
    lengthTick,
    contour = 'random',
    lowOctave = 0,
    highOctave = 0,
    rests = 0,
    velocity = 90,
    seed = 1
  } = options;
  if (
    !int(parts) ||
    parts < 1 ||
    parts > 4 ||
    !int(beatTick) ||
    beatTick < 1 ||
    !['board', 'manual'].includes(range)
  )
    fail('invalid voice or range setting.');
  if (!Number.isFinite(rests) || rests < 0 || rests > 1) fail('invalid rest probability.');
  const voices = orderedChord(context, chord),
    vector = octaveVector(context);
  // Use the same validation and tick normalization as a single-line figure.
  const grid = generatePattern({
    ...options,
    voiceCount: voices.length,
    rests: 0,
    lowOctave: 0,
    highOctave: 0
  });
  if (
    range === 'manual' &&
    (!int(lowOctave) ||
      !int(highOctave) ||
      lowOctave > highOctave ||
      Math.abs(lowOctave) > 8 ||
      Math.abs(highOctave) > 8)
  )
    fail('invalid generation range.');
  if (!vector && range === 'manual' && (lowOctave || highOctave))
    fail('this overlay has no octave equivalence; use written register.');
  let candidates = range === 'board' ? playableChordTones(context, chord, cells) : [];
  if (range === 'manual')
    for (let octaves = lowOctave; octaves <= highOctave; octaves++)
      voices.forEach((m, i) => {
        const coordinate = m.map((n, a) => n + octaves * (vector?.[a] ?? 0));
        candidates.push({
          rank: i + 1,
          octaves,
          coordinate,
          cents: coordinateCents(context, coordinate)
        });
      });
  candidates.sort((a, b) => a.cents - b.cents || a.rank - b.rank);
  if (!candidates.length)
    fail('the saved HexBoard has no playable chord tones; choose a layout or manual range.');
  const bass = candidates.find(c => c.rank === 1);
  if (!bass) fail('the chord bass has no playable register on the saved HexBoard.');
  const low = candidates[0].cents,
    high = candidates.at(-1).cents;
  const upper = [
    ...new Map(
      candidates.filter(c => c.cents > bass.cents).map(c => [pairKey(c.coordinate), c])
    ).values()
  ];
  const random = randomSequence(seed),
    events = [],
    occupied = new Map();
  const reference = c =>
    range === 'board'
      ? {rank: c.rank, octaves: 0, position: high === low ? 0 : (c.cents - low) / (high - low)}
      : {rank: c.rank, octaves: c.octaves};
  const emit = (voice, step, tick, end, tone, accent = false) => {
    const used = occupied.get(tick) ?? new Set(),
      key = pairKey(tone.coordinate);
    if (used.has(key)) return false;
    used.add(key);
    occupied.set(tick, used);
    events.push({
      id: `voice-${voice}-step-${step}`,
      voice,
      startTick: tick,
      durationTick: Math.max(1, Math.min(lengthTick, end) - tick),
      velocity: Math.max(1, Math.min(127, velocity + (accent ? 16 : voice < parts - 1 ? -10 : 0))),
      tones: [{...reference(tone), ...(range === 'board' && accent ? {position: 0} : {})}]
    });
    if (events.length > FIGURATION_LIMITS.events)
      fail('the texture has too many notes; shorten the cycle or widen the grid.');
    return true;
  };
  const choose = (pool, i, count) => {
    const progress = count <= 1 ? 1 : i / (count - 1);
    let index;
    if (contour === 'rising') index = Math.round(progress * (pool.length - 1));
    else if (contour === 'falling') index = Math.round((1 - progress) * (pool.length - 1));
    else if (contour === 'alternating')
      index =
        i % 2
          ? pool.length - 1 - (Math.floor(i / 2) % pool.length)
          : Math.floor(i / 2) % pool.length;
    else
      index =
        i === 0 && count > 1
          ? 0
          : i === 1 || count === 1
            ? pool.length - 1
            : Math.floor(random() * pool.length);
    return pool[index];
  };
  if (parts === 1) {
    const pool = [bass, ...upper];
    grid.events.forEach((e, i) => {
      const beat =
        i === 0 ||
        Math.floor(e.startTick / beatTick) !== Math.floor(grid.events[i - 1].startTick / beatTick);
      if (!beat && random() < rests) return;
      emit(
        0,
        i,
        e.startTick,
        e.startTick + e.durationTick,
        beat ? bass : choose(pool, i, grid.events.length),
        beat
      );
    });
  } else {
    for (let tick = 0, i = 0; tick < lengthTick; tick += beatTick, i++)
      emit(0, i, tick, tick + beatTick, bass, true);
    for (let voice = 1; voice < parts && upper.length; voice++) {
      const stride = 2 ** (parts - 1 - voice),
        steps = grid.events.filter((_, i) => i % stride === 0);
      const from = Math.floor(((voice - 1) / (parts - 1)) * 0.65 * (upper.length - 1));
      const to =
        voice === parts - 1
          ? upper.length - 1
          : Math.ceil((0.35 + (voice / (parts - 1)) * 0.45) * (upper.length - 1));
      const pool = upper.slice(from, to + 1);
      steps.forEach((e, i) => {
        if (random() < rests) return;
        const desired = choose(pool, i, steps.length);
        const used = occupied.get(e.startTick);
        const tone = !used?.has(pairKey(desired.coordinate))
          ? desired
          : pool.find(c => !used.has(pairKey(c.coordinate)));
        if (!tone) return;
        const end = steps[i + 1]?.startTick ?? lengthTick;
        emit(
          voice,
          i,
          e.startTick,
          e.startTick + Math.max(1, Math.round((end - e.startTick) * 0.9)),
          tone
        );
      });
    }
  }
  events.sort((a, b) => a.startTick - b.startTick || a.voice - b.voice);
  return validatePattern({
    version: range === 'board' ? 2 : 1,
    name,
    lengthTick,
    events,
    seed: seed >>> 0
  });
}

export function validateFiguration(project) {
  const f = project.figuration;
  if (f === undefined) return;
  if (!f || typeof f !== 'object') fail('invalid project figuration.');
  if (
    !Array.isArray(f.patterns) ||
    f.patterns.length > FIGURATION_LIMITS.patterns ||
    !Array.isArray(f.attachments) ||
    f.attachments.length > 16384 ||
    typeof f.soundHarmony !== 'boolean'
  )
    fail('invalid project figuration.');
  const patterns = new Set(),
    attached = new Set(),
    ids = new Set();
  for (const p of f.patterns) {
    if (typeof p.id !== 'string' || !p.id || p.id.length > 128 || patterns.has(p.id))
      fail('duplicate or missing pattern ID.');
    patterns.add(p.id);
    validatePattern(p.pattern);
  }
  for (const a of f.attachments) {
    const clip = project.clips.find(c => c.id === a.chordClipId),
      track = project.tracks.find(t => t.id === a.trackId);
    const key = JSON.stringify([a.chordClipId, a.chordEventId]);
    if (
      typeof a.id !== 'string' ||
      !a.id ||
      a.id.length > 128 ||
      ids.has(a.id) ||
      attached.has(key) ||
      !patterns.has(a.patternId) ||
      !clip?.events.some(e => e.id === a.chordEventId) ||
      project.tracks.find(t => t.id === clip.trackId)?.kind !== 'chords' ||
      track?.kind !== 'melody'
    )
      fail('invalid or duplicate pattern attachment.');
    ids.add(a.id);
    attached.add(key);
  }
}

const cache = new WeakMap();
export function compileFiguration(project) {
  if (cache.has(project)) return cache.get(project);
  const events = [],
    harmonies = [],
    errors = [],
    warnings = [],
    f = project.figuration;
  if (f) {
    validateFiguration(project);
    const cells = f.patterns.some(p => p.pattern.version === 2)
      ? (compositionBoard(project).board?.keys ?? [])
      : [];
    const chords = [],
      manual = [];
    for (const c of project.clips) {
      const kind = project.tracks.find(t => t.id === c.trackId)?.kind;
      for (let r = 0; r < c.repeat; r++)
        for (const e of c.events) {
          const start = c.startTick + r * c.lengthTick + e.startTick;
          (kind === 'chords' ? chords : manual).push({
            clip: c,
            event: e,
            repeat: r,
            start,
            end: start + e.durationTick
          });
          if (chords.length + manual.length > 16384)
            fail('expanded source music exceeds the event limit.');
        }
    }
    chords.sort((a, b) => a.start - b.start);
    harmonies.push(...chords);
    const overlaps = new Set(),
      occurrences = new Map();
    let lastEnd = -1;
    chords.forEach((o, i) => {
      if (o.start < lastEnd || (chords[i + 1]?.start ?? Infinity) < o.end) overlaps.add(o);
      lastEnd = Math.max(lastEnd, o.end);
      const id = JSON.stringify([o.clip.id, o.event.id]);
      if (!occurrences.has(id)) occurrences.set(id, []);
      occurrences.get(id).push(o);
    });
    for (const a of f.attachments) {
      const pattern = f.patterns.find(p => p.id === a.patternId).pattern;
      for (const o of occurrences.get(JSON.stringify([a.chordClipId, a.chordEventId])) ?? []) {
        const problem = text =>
          errors.push({
            attachmentId: a.id,
            chordEventId: a.chordEventId,
            startTick: o.start,
            message: `${pattern.name} at tick ${o.start}: ${text}`
          });
        if (overlaps.has(o)) {
          problem('overlapping harmonies; leave one active chord.');
          continue;
        }
        let notes;
        try {
          notes = patternNotes(project.context, o.event, pattern, 'figure', {cells});
        } catch (e) {
          problem(e.message);
          continue;
        }
        for (
          let cycle = 0, offset = 0;
          offset < o.event.durationTick;
          cycle++, offset += pattern.lengthTick
        )
          for (const note of notes) {
            const startTick = o.start + offset + note.startTick;
            if (startTick >= o.end) continue;
            const id = `figuration:${a.id}:${o.repeat}:${cycle}:${note.id}`;
            events.push({
              ...note,
              id,
              startTick,
              durationTick: Math.min(note.durationTick, o.end - startTick),
              trackId: a.trackId,
              tones: note.tones.map((t, i) => ({...t, toneId: `${id}:tone:${i}`})),
              source: {
                kind: 'figuration',
                attachmentId: a.id,
                patternId: a.patternId,
                chordEventId: a.chordEventId,
                ...(note.source.voice !== undefined ? {voice: note.source.voice} : {})
              }
            });
            if (events.length + manual.length + chords.length > 16384)
              fail('compiled music exceeds the event limit.');
          }
      }
    }
    const intervals = new Map(),
      warned = new Set();
    for (const m of manual.sort((a, b) => a.start - b.start)) {
      const list = intervals.get(m.clip.trackId) ?? [];
      list.push({start: m.start, end: Math.max(m.end, list.at(-1)?.end ?? 0)});
      intervals.set(m.clip.trackId, list);
    }
    for (const e of events) {
      const list = intervals.get(e.trackId) ?? [];
      let lo = 0,
        hi = list.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (list[mid].start < e.startTick + e.durationTick) lo = mid + 1;
        else hi = mid;
      }
      if (lo && list[lo - 1].end > e.startTick && !warned.has(e.source.attachmentId)) {
        warned.add(e.source.attachmentId);
        warnings.push({
          attachmentId: e.source.attachmentId,
          message: 'Existing melody overlaps this figure; both are preserved.'
        });
      }
    }
  }
  events.sort((a, b) => a.startTick - b.startTick || a.id.localeCompare(b.id));
  const result = {events, errors, warnings, harmonies};
  cache.set(project, result);
  return result;
}

export function figurationClips(project) {
  const {events} = compileFiguration(project);
  return project.tracks
    .filter(t => t.kind === 'melody')
    .map(t => ({
      id: `figuration-clip:${t.id}`,
      trackId: t.id,
      startTick: 0,
      repeat: 1,
      lengthTick: Math.max(
        1,
        ...events.filter(e => e.trackId === t.id).map(e => e.startTick + e.durationTick)
      ),
      events: events.filter(e => e.trackId === t.id)
    }));
}

export function assertFigurationPlayable(project) {
  const {errors} = compileFiguration(project);
  if (errors.length) fail(errors[0].message);
}
