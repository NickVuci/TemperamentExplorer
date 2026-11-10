// Play controller for Compose. It runs the engine (composition-game.mjs) over the
// open composition. In Timed the shared transport plays the backing (your part muted, quiet or full)
// with its count-in and metronome, and the board player's holds (screen board, computer keys, physical
// HexBoard) are judged at the time the player heard. Wait runs no transport: it steps from one onset
// to the next as each is played. It draws the note highway and the approach rings each frame,
// calibrates timing, keeps best scores and lights the physical HexBoard. Rendering of each phase lives
// in composition-game-view.mjs.
import {
  buildChart,
  createGame,
  WINDOWS,
  INPUT_SLACK_MS,
  PARTS,
  MATCHES,
  MODES
} from './composition-game.mjs';
import {heardSeconds, CLICK} from './composition-transport.mjs';
import {PPQ, barTicks, contentEndTick} from './composition-project.mjs';
import {degreeOf, resolveTone} from './composition-context.mjs';
import {mosLayers, keyColor, textColor} from '../hexboard/hexboard-colors.mjs';
import {compositionDeviceSnapshot} from './composition-board.mjs';
import {pieceFingering} from './composition-game-route.mjs';
import {signedInteger} from '../ui/ui.mjs';
import {compileFiguration} from './composition-figuration.mjs';

export const SPEEDS = [50, 75, 100];
export const GUIDES = [
  ['off', 'Muted'],
  ['quiet', 'Quiet guide'],
  ['full', 'Full']
];
export const LEADS = [
  [1.2, 'Close'],
  [2, 'Normal'],
  [3, 'Far']
];
export const SECTIONS = [
  ['all', 'Whole piece'],
  ['loop', 'Loop region'],
  ['bars', 'Bars'],
  ['selected', 'Selected chord']
];
// Note hints during a run: the keys to play lit on an otherwise dark HexBoard, lit over the layout,
// or none at all (the layout only, on the HexBoard and the screen).
export const LIGHTS = [
  ['dark', 'Keys to play lit, rest dark'],
  ['layout', 'Keys to play lit over the layout'],
  ['off', 'Off: layout only (hard)']
];
// Notes reach the highway's hit line this many pixels from its left edge; Timed repeat waits this long.
export const HIT_X = 96,
  REPEAT_SECONDS = 3;
const SETTINGS_KEY = 'temperament-lab-game-settings',
  OFFSET_KEY = 'temperament-lab-game-offset',
  BEST_KEY = 'temperament-lab-game-best';
const CAL_CLICKS = 12,
  CAL_SKIP = 4,
  CAL_BPM = 90;
const DEFAULTS = Object.freeze({
  part: 'melody',
  match: 'exact',
  mode: 'play',
  speed: 100,
  guide: 'quiet',
  click: true,
  countIn: 1,
  lead: 2,
  section: 'all',
  fromBar: 1,
  toBar: 4,
  trainer: false,
  targetSpeed: 100,
  repeat: false,
  lights: 'dark'
});
const FLASH_MS = 260,
  FEEDBACK_MS = 700,
  WAIT_END_MS = 1000;
// Judgement colours: the HexBoard's LEDs, and the bursts and pops on screen (style.css uses the same).
const FLASH_COLORS = {
  perfect: '#3ddc84',
  great: '#3ddc84',
  good: '#9be35b',
  ok: '#3ddc84',
  miss: '#ff4d4d',
  wrong: '#ff4d4d',
  near: '#ffb347'
};
// Screen motion that answers a judgement: a burst outward from a played key, a pop on its highway note
// and on the feedback, and a pulse on each count-in beat. None of it runs with reduced motion.
const BURST = [
    {opacity: 1, transform: 'scale(1)', strokeWidth: 3.5},
    {opacity: 0.85, transform: 'scale(1.32)', strokeWidth: 3, offset: 0.4},
    {opacity: 0, transform: 'scale(1.7)', strokeWidth: 1.5}
  ],
  BURST_TIMING = {duration: 420, easing: 'ease-out'};
const NOTE_POP = [
    {transform: 'scaleY(1.28)', filter: 'brightness(1.6)'},
    {transform: 'none', filter: 'none'}
  ],
  NOTE_POP_TIMING = {duration: 240, easing: 'ease-out'};
const FEEDBACK_POP = [
    {transform: 'translateY(5px) scale(.9)', opacity: 0},
    {transform: 'none', opacity: 1}
  ],
  FEEDBACK_POP_TIMING = {duration: 170, easing: 'cubic-bezier(.2,.8,.3,1.2)'};
const COUNT_PULSE = [
    {transform: 'scale(1.35)', opacity: 0.35},
    {transform: 'none', opacity: 1}
  ],
  COUNT_PULSE_TIMING = {duration: 300, easing: 'cubic-bezier(.2,.7,.3,1)'};
const RESULT_TEXT = {perfect: 'Perfect', great: 'Great', good: 'Good', miss: 'Miss', ok: 'Yes'};

function browserStorage() {
  return {
    get(key) {
      try {
        return JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null');
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        globalThis.localStorage?.setItem(key, JSON.stringify(value));
      } catch {
        /* storage is optional */
      }
    }
  };
}
const pick = (list, value, fallback) => (list.includes(value) ? value : fallback);
export function normalizeSettings(s = {}) {
  const int = (v, lo, hi, d) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d;
  };
  return {
    part: pick(PARTS, s.part, DEFAULTS.part),
    match: pick(MATCHES, s.match, DEFAULTS.match),
    mode: pick(MODES, s.mode, DEFAULTS.mode),
    speed: int(s.speed, 10, 200, DEFAULTS.speed),
    guide: pick(
      GUIDES.map(g => g[0]),
      s.guide,
      DEFAULTS.guide
    ),
    click: s.click === undefined ? DEFAULTS.click : !!s.click,
    countIn: int(s.countIn, 0, 2, DEFAULTS.countIn),
    lead: pick(
      LEADS.map(l => l[0]),
      Number(s.lead),
      DEFAULTS.lead
    ),
    section: pick(
      SECTIONS.map(x => x[0]),
      s.section,
      DEFAULTS.section
    ),
    fromBar: int(s.fromBar, 1, 9999, DEFAULTS.fromBar),
    toBar: int(s.toBar, 1, 9999, DEFAULTS.toBar),
    trainer: !!s.trainer,
    targetSpeed: int(s.targetSpeed, 10, 200, DEFAULTS.targetSpeed),
    repeat: !!s.repeat,
    // Settings saved before the lights choice kept a Note hints switch: off is the hard layout.
    lights: pick(
      LIGHTS.map(l => l[0]),
      s.lights,
      s.hints === false ? 'off' : DEFAULTS.lights
    )
  };
}
const median = list => {
  const s = [...list].sort((a, b) => a - b),
    m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const signedMs = ms => `${ms > 0 ? '+' : ms < 0 ? '−' : ''}${Math.abs(Math.round(ms))} ms`;

export function createGameController({
  document: doc,
  audio,
  transport,
  getProject,
  getBoard,
  refresh,
  notify = () => {},
  getSelectedSection = () => null,
  getExportMatch = () => 'exact-coordinate',
  releaseHeld = () => {},
  // Told when a run's lit keys change, so a connected HexBoard can show them at once.
  onLights = () => {},
  raf = globalThis.requestAnimationFrame?.bind(globalThis),
  cancel = globalThis.cancelAnimationFrame?.bind(globalThis),
  storage = browserStorage(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = id => clearTimeout(id),
  now = () => globalThis.performance?.now?.() ?? Date.now()
}) {
  let settings = normalizeSettings(storage.get(SETTINGS_KEY) ?? {}),
    offsetMs = Number.isFinite(storage.get(OFFSET_KEY)) ? storage.get(OFFSET_KEY) : null;
  let phase = 'setup',
    chart = null,
    engine = null,
    summary = null,
    message = '',
    frame = null,
    stopping = false,
    paused = false,
    waitingTick = null;
  // rings: keys with an on-screen hint; lit: a run's keys to play now (Timed) or next (Wait).
  let calibration = null,
    calTimer = null,
    ppt = 0,
    rings = new Set(),
    lit = new Set(),
    feedback = null,
    route = new Map();
  let run = null,
    revision = 0,
    pass = 0,
    previewTick = null,
    repeatTimer = null,
    repeatCountdown = null,
    endTimer = null;
  let fingeringProject = null,
    fingeringIdentity = null,
    buttonUse = 0,
    preferenceVersion = 0,
    pieceCache = null;
  const playedButtons = new Map();
  const flashes = new Map(),
    inputKeys = new Map(); // key index → flash; hold id → actual board key
  // shown: the judgement feedback last drawn, so each new one pops once; counted: the count-in beat drawn.
  let shown = null,
    counted = '';
  // Reduced motion keeps every cue and judgement but drops the bursts, pops and the rings' approach.
  const motionQuery = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  const still = () => !!motionQuery?.matches;
  const animate = (el, frames, timing) => {
    if (el && !still()) el.animate?.(frames, timing);
  };
  const quiet = fn => {
    stopping = true;
    try {
      fn();
    } finally {
      stopping = false;
    }
  };
  const save = () => storage.set(SETTINGS_KEY, settings);
  const active = () => run?.settings ?? settings;
  const playingProject = () => run?.project ?? getProject();
  const playingBoard = () => run?.board ?? getBoard();
  const matchingKeys = (t, s = active()) =>
    s.match === 'degree' && t.degree !== null ? t.degreeKeys : t.keys;

  // ---- what is played ----
  function section(p, s = settings) {
    const errors = compileFiguration(p).errors;
    if (errors.length) return {unavailable: errors[0].message};
    const end = contentEndTick(p),
      bar = barTicks(p.meter);
    if (s.section === 'loop')
      return p.loop.endTick !== null
        ? {from: p.loop.startTick, to: p.loop.endTick}
        : {unavailable: 'Set a loop region in Compose, or choose another section.'};
    if (s.section === 'selected') {
      const selected = getSelectedSection();
      return selected && selected.to > selected.from
        ? {from: selected.from, to: selected.to}
        : {unavailable: 'Select a chord in Compose, or choose another section.'};
    }
    if (s.section === 'bars') {
      if (s.fromBar > s.toBar)
        return {unavailable: 'The last bar must be at or after the first bar.'};
      if (s.fromBar > Math.round(end / bar) || s.toBar > Math.round(end / bar))
        return {
          unavailable:
            'This bar range is outside the composition. Choose another section or bar range.'
        };
      return {from: (s.fromBar - 1) * bar, to: Math.min(end, s.toBar * bar)};
    }
    return {from: 0, to: end};
  }
  /** The project the transport plays during a run: your part muted, quiet or full, at the chosen speed. */
  function playbackProject(p) {
    if (!p) return p;
    p = playingProject();
    const s = active(),
      mine = t => s.part === 'both' || t.kind === s.part;
    return {
      ...p,
      tempo: (p.tempo * s.speed) / 100,
      loop: {enabled: false, startTick: 0, endTick: null},
      tracks: p.tracks.map(t =>
        mine(t)
          ? {
              ...t,
              mute: s.guide === 'off',
              solo: false,
              level: s.guide === 'quiet' ? Math.min(t.level, 0.3) : t.level
            }
          : {...t, solo: false}
      )
    };
  }
  const bestKey = (p, s, range) => [p.id, s.part, s.match, s.speed, range.from, range.to].join('|');
  const bestFor = key => storage.get(BEST_KEY)?.[key] ?? null;
  function setupInfo() {
    const p = getProject();
    if (!p) return {section: null, targets: [], unreachable: []};
    const range = section(p);
    const targets = range.unavailable
      ? []
      : buildChart(p, {part: settings.part, from: range.from, to: range.to}).targets;
    return {
      section: range,
      targets,
      unreachable: targets.filter(t => !matchingKeys(t, settings).length)
    };
  }
  function noteName(coordinate) {
    const p = playingProject(),
      d = p && degreeOf(p.context, coordinate);
    return d ? `${d.degree}${d.register ? signedInteger(d.register) : ''}` : coordinate.join(',');
  }
  function previewInfo(info = setupInfo()) {
    const ticks = [...new Set(info.targets.map(t => t.tick))];
    if (!ticks.includes(previewTick)) previewTick = ticks[0] ?? null;
    const notes = info.targets.filter(t => t.tick <= previewTick && t.endTick > previewTick);
    return {
      hasNotes: !!ticks.length,
      text:
        previewTick === null
          ? 'No notes in this part and section.'
          : `Notes ${[...new Set(notes.map(t => noteName(t.coordinate)))].join(' · ')}`,
      ticks,
      notes
    };
  }
  function preview(action) {
    if (phase !== 'setup') return;
    const info = setupInfo(),
      v = previewInfo(info),
      i = v.ticks.indexOf(previewTick);
    if (!v.hasNotes) return;
    if (action === 'first') previewTick = v.ticks[0];
    if (action === 'prev') previewTick = v.ticks[(i - 1 + v.ticks.length) % v.ticks.length];
    if (action === 'next') previewTick = v.ticks[(i + 1) % v.ticks.length];
    const notes = previewInfo(info).notes;
    rings = previewKeys(info, notes);
    void audio.previewChord?.(notes.map(t => t.cents));
    refresh();
  }
  function hearCurrent() {
    if (phase === 'running' && waitingTick !== null)
      void audio.previewChord?.(engine.waiting().required.map(t => t.cents));
  }

  // ---- lanes and colours: one lane per pitch (exact) or degree (any octave), highest first ----
  function keyColors(p, board) {
    const out = new Map();
    if (!board || !p.layout) return out;
    try {
      const colors = mosLayers(p.context.state, p.layout, board);
      for (const k of board.keys)
        if (!k.command && k.enabled) {
          const id = k.m.join(',');
          if (!out.has(id)) out.set(id, keyColor(k, colors));
        }
    } catch {
      /* colours are decoration */
    }
    return out;
  }
  // Button preferences belong to the open piece and physical pitch layout, not to one scored pass.
  function syncFingering(p, board) {
    if (p === fingeringProject) return;
    const identity = p ? JSON.stringify([p.id, board?.keys.map(k => [k.enabled, k.m])]) : null;
    if (identity !== fingeringIdentity) {
      playedButtons.clear();
      buttonUse = 0;
      preferenceVersion++;
      fingeringIdentity = identity;
    }
    fingeringProject = p;
  }
  /**
   * The composition's fingering (cue id → button) under the active match rule: buttons chosen in
   * Compose, then the player's previously used matching buttons, then the automatic route. Compose
   * shows it too. `pinned` cue ids keep their buttons.
   */
  function fingering(p = getProject(), board = getBoard(), pinned = new Map()) {
    syncFingering(p, board);
    if (!p || !board) return new Map();
    const match = active().match;
    if (pinned.size) return pieceFingering(p, board, {match, played: playedButtons, pinned});
    if (
      pieceCache?.project !== p ||
      pieceCache.board !== board ||
      pieceCache.match !== match ||
      pieceCache.version !== preferenceVersion
    )
      pieceCache = {
        project: p,
        board,
        match,
        version: preferenceVersion,
        route: pieceFingering(p, board, {match, played: playedButtons})
      };
    return pieceCache.route;
  }
  /** Each chart target's button, read from the composition's fingering so every section and part agrees. */
  function routeFor(p, targets, board, pinned) {
    const piece = fingering(p, board, pinned);
    return new Map(targets.filter(t => piece.has(t.id)).map(t => [t.index, piece.get(t.id)]));
  }
  function previewKeys(info, notes) {
    const p = getProject(),
      board = getBoard();
    syncFingering(p, board);
    if (active().lights === 'off') return new Set();
    const suggested = routeFor(p, info.targets, board);
    return new Set(notes.map(t => suggested.get(t.index)).filter(k => k !== undefined));
  }
  function rememberButton(event) {
    if (event?.type !== 'down' || !['setup', 'running'].includes(phase)) return false;
    const p = playingProject(),
      board = playingBoard(),
      index = Number(event.keyId),
      key = board?.keys[index];
    if (
      !p ||
      !Number.isInteger(index) ||
      !key?.enabled ||
      key.command ||
      key.m.join(',') !== event.coordinate?.join(',')
    )
      return false;
    syncFingering(p, board);
    let previous = null,
      order = -Infinity;
    for (const [id, use] of playedButtons) {
      const other = board.keys[id],
        matches =
          active().match === 'degree' && key.degree >= 0
            ? other.degree === key.degree
            : other.m.join(',') === key.m.join(',');
      if (matches && use > order) {
        previous = id;
        order = use;
      }
    }
    playedButtons.set(index, ++buttonUse);
    if (previous === index) return false;
    preferenceVersion++;
    return true;
  }
  function updatePreviewHints() {
    const info = setupInfo(),
      next = previewKeys(info, previewInfo(info).notes);
    for (const k of rings)
      if (!next.has(k)) {
        doc.querySelector?.(`[data-comp-key="${k}"]`)?.classList.remove('game-now');
        const ring = doc.querySelector?.(`[data-game-ring="${k}"]`);
        if (ring) {
          ring.style.opacity = '0';
          ring.style.transform = '';
        }
      }
    rings = next;
    resumePreview();
  }
  function resumePreview() {
    for (const k of rings) {
      doc.querySelector?.(`[data-comp-key="${k}"]`)?.classList.add('game-now');
      const ring = doc.querySelector?.(`[data-game-ring="${k}"]`);
      if (ring) {
        ring.style.opacity = '1';
        ring.style.transform = 'scale(1)';
      }
    }
  }
  function lanesFor(p, targets) {
    const s = active(),
      colors = keyColors(p, playingBoard()),
      lanes = new Map();
    for (const t of targets) {
      const id =
        s.match === 'degree' && t.degree !== null ? `d${t.degree}` : t.coordinate.join(',');
      if (!lanes.has(id)) {
        const color = colors.get(t.coordinate.join(',')) ?? '#829cff';
        lanes.set(id, {
          id,
          degree: t.degree,
          register: s.match === 'degree' ? 0 : t.register,
          cents:
            s.match === 'degree' && t.degree !== null
              ? resolveTone(p.context, p.context.scale.degrees[t.degree].coordinate).cents
              : t.cents,
          color,
          ink: textColor(color)
        });
      }
    }
    return [...lanes.values()].sort((a, b) => b.cents - a.cents);
  }

  // ---- a run ----
  function cancelRepeat() {
    clearTimer(repeatTimer);
    repeatTimer = null;
    repeatCountdown = null;
  }
  function cancelEnd() {
    clearTimer(endTimer);
    endTimer = null;
  }
  function cleanAudio() {
    engine?.clearHolds();
    inputKeys.clear();
    releaseHeld();
    audio.cancelGroup?.('preview');
  }
  // Timed plays the backing through the section and then until its last notes are judged. Wait runs no clock.
  const judgedAfterMs = () => WINDOWS.good + INPUT_SLACK_MS + Math.max(0, run.offsetMs) + 1;
  async function playRun(countIn = 0) {
    const mine = revision;
    await transport.play({untilTick: chart.to, graceMs: judgedAfterMs(), countIn});
    if (mine !== revision) return;
    if (transport.state === 'playing') loop();
  }
  // Wait stands at the next notes to play (the section end once all are played); Timed at the time heard.
  const stepTick = () => engine.pending()[0]?.tick ?? chart.to;
  const position = () =>
    active().mode === 'learn'
      ? stepTick()
      : transport.state === 'playing'
        ? transport.timeAt().v
        : transport.position();
  // After Wait's last notes, the results follow a moment later so those notes can ring.
  function endSoon() {
    const mine = revision;
    cancelEnd();
    endTimer = setTimer(() => {
      endTimer = null;
      if (mine === revision && phase === 'running' && !paused) finish();
    }, WAIT_END_MS);
  }
  function start({repeating = false} = {}) {
    const p = getProject();
    if (!p) return;
    cancelRepeat();
    const info = setupInfo();
    if (info.section.unavailable) {
      message = info.section.unavailable;
      refresh();
      return;
    }
    const {from, to} = info.section,
      c = buildChart(p, {part: settings.part, from, to});
    if (!c.targets.length) {
      message =
        'There are no notes to play in this part and section. Choose another part or section.';
      refresh();
      return;
    }
    if (info.unreachable.length) {
      message =
        'Some notes have no playable key. Change the matching rule, section or composition layout.';
      refresh();
      return;
    }
    const mine = ++revision;
    quiet(() => transport.stop());
    cancelEnd();
    cleanAudio();
    run = {
      project: p,
      board: getBoard(),
      settings: {...settings},
      offsetMs: offsetMs ?? 0,
      section: {from, to},
      bestKey: bestKey(p, settings, {from, to})
    };
    pass = repeating ? pass + 1 : 1;
    chart = c;
    summary = null;
    message = '';
    paused = false;
    waitingTick = null;
    feedback = null;
    flashes.clear();
    rings = new Set();
    lit = new Set();
    ppt = 0;
    const wait = run.settings.mode === 'learn';
    // Wait has no tempo, so its highway is drawn at the composition's own tempo whatever Timed's speed.
    engine = createGame(chart, {
      tps: (((p.tempo * (wait ? 100 : run.settings.speed)) / 100) * PPQ) / 60,
      match: run.settings.match,
      context: p.context,
      mode: run.settings.mode,
      offsetMs: run.offsetMs,
      meter: p.meter
    });
    route = routeFor(p, engine.targets, run.board);
    phase = 'running';
    // Wait starts at once on its first notes: no backing, count-in or clock.
    if (wait) {
      waitingTick = stepTick();
      refresh();
      return;
    }
    refresh();
    void transport.seek(from).then(() => {
      if (mine === revision && phase === 'running' && !paused) return playRun(run.settings.countIn);
    });
  }
  function finish() {
    if (phase !== 'running' || !engine) return;
    ++revision;
    cancelEnd();
    quiet(() => transport.stop());
    stopLoop();
    summary = engine.summary();
    const s = active();
    if (s.mode === 'play') {
      const key = run.bestKey,
        previous = bestFor(key);
      summary.previousBest = previous;
      summary.newBest = !previous || summary.score > previous.score;
      if (summary.newBest) {
        const all = storage.get(BEST_KEY) ?? {};
        all[key] = {
          score: summary.score,
          accuracy: summary.accuracy,
          grade: summary.grade,
          date: new Date().toISOString().slice(0, 10)
        };
        storage.set(BEST_KEY, all);
      }
      if (s.trainer)
        summary.nextSpeed =
          summary.accuracy >= 90 && s.speed < s.targetSpeed
            ? Math.min(s.targetSpeed, s.speed + 5)
            : s.speed;
    }
    phase = 'results';
    waitingTick = null;
    cleanAudio();
    refresh();
    if (s.repeat) {
      if (s.mode === 'learn') again(true);
      else {
        repeatCountdown = {seconds: REPEAT_SECONDS, paused: false};
        refresh();
        scheduleRepeat();
      }
    }
  }
  function scheduleRepeat() {
    const mine = revision;
    repeatTimer = setTimer(() => {
      repeatTimer = null;
      if (mine !== revision || phase !== 'results' || !repeatCountdown || repeatCountdown.paused)
        return;
      if (--repeatCountdown.seconds <= 0) {
        again(true);
        return;
      }
      refresh();
      scheduleRepeat();
    }, 1000);
  }
  function again(repeating = false) {
    const s = active();
    settings = {...s, speed: summary?.nextSpeed ?? s.speed};
    save();
    start({repeating});
  }
  function quit() {
    leave();
    message = '';
    refresh();
  }
  function pause() {
    audio.cancelGroup?.('preview');
    if (phase === 'setup') {
      cleanAudio();
      return;
    }
    if (phase === 'calibrating') {
      quit();
      return;
    }
    if (phase === 'results' && repeatCountdown) {
      repeatCountdown.paused = true;
      clearTimer(repeatTimer);
      repeatTimer = null;
      refresh();
      return;
    }
    if (phase !== 'running' || paused) return;
    ++revision;
    cancelEnd();
    paused = true;
    quiet(() => transport.pause());
    cleanAudio();
    paintOverlay();
    refresh();
  }
  function togglePause() {
    if (phase === 'results' && repeatCountdown) {
      if (repeatCountdown.paused) {
        repeatCountdown.paused = false;
        refresh();
        scheduleRepeat();
      } else pause();
      return;
    }
    if (phase !== 'running') return;
    if (!paused) {
      pause();
      return;
    }
    paused = false;
    if (active().mode === 'play') void playRun(active().countIn ? 1 : 0);
    else if (waitingTick === null) {
      finish();
      return;
    }
    paintOverlay();
    refresh();
  }

  // ---- input from the board player ----
  function input(event) {
    if (phase === 'calibrating') {
      tap(event);
      return;
    }
    const remembered = rememberButton(event);
    if (phase === 'setup') {
      if (remembered) updatePreviewHints();
      return;
    }
    if (phase !== 'running' || !engine || !event?.holdId) return;
    if (remembered) {
      const judged = new Map(
        engine.targets
          .filter(t => t.result && route.has(t.index))
          .map(t => [t.id, route.get(t.index)])
      );
      route = routeFor(run.project, engine.targets, run.board, judged);
    }
    const v = transport.timeAt(event.t).v;
    if (paused) {
      if (event.type === 'up') engine.release(event.holdId, v);
      return;
    }
    // Wait's notes are all played and its results are about to show: presses no longer count.
    if (active().mode === 'learn' && waitingTick === null) return;
    if (event.type === 'down') inputKeys.set(event.holdId, event.keyId);
    else inputKeys.delete(event.holdId);
    const r =
      event.type === 'down'
        ? engine.press(event.holdId, event.coordinate, v)
        : engine.release(event.holdId, v);
    react(r, event.keyId);
    // Wait moves straight on to the next notes.
    if (r?.kind === 'learn-hit') {
      audio.cancelGroup?.('preview');
      waitingTick = engine.pending()[0]?.tick ?? null;
      if (waitingTick === null) endSoon();
    }
    // Painted where the run is, as each frame is, so a press never lights notes early.
    if (phase === 'running') paint(position());
  }
  function flash(keys, cls) {
    const until = now() + FLASH_MS;
    for (const id of keys) {
      const k = Number(id),
        previous = flashes.get(k);
      if (previous && previous.cls !== cls)
        doc
          .querySelector?.(`[data-comp-key="${k}"]`)
          ?.classList.remove(`game-flash-${previous.cls}`);
      flashes.set(k, {cls, until});
    }
  }
  // A played key's ring bursts outward in its judgement's colour.
  function burst(keys, cls) {
    for (const id of keys)
      animate(
        doc.querySelector?.(`[data-game-ring="${Number(id)}"]`),
        BURST.map(f => ({...f, stroke: FLASH_COLORS[cls]})),
        BURST_TIMING
      );
  }
  function say(text, cls) {
    feedback = {text, cls, until: now() + FEEDBACK_MS};
  }
  function react(r, keyId) {
    if (!r) return;
    const keys = keyId !== undefined && keyId !== null ? [keyId] : [];
    if (r.kind === 'learn-hit') {
      for (const t of r.targets) markNote(t);
      const played = (r.holdIds ?? [])
        .map(id => inputKeys.get(id))
        .filter(k => k !== undefined && k !== null);
      flash(played, 'ok');
      burst(played, 'ok');
      say('Yes', 'ok');
    } else if (r.kind === 'hit') {
      const played = keys.length
        ? keys
        : route.has(r.target.index)
          ? [route.get(r.target.index)]
          : [];
      flash(played, r.result);
      burst(played, r.result);
      say(
        r.result === 'ok'
          ? 'Yes'
          : `${RESULT_TEXT[r.result]}${Number.isFinite(r.offsetMs) && Math.abs(r.offsetMs) >= 10 ? ` · ${Math.abs(Math.round(r.offsetMs))} ms ${r.offsetMs < 0 ? 'early' : 'late'}` : ''}`,
        r.result
      );
      for (const t of r.targets ?? [r.target]) markNote(t);
    } else if (r.kind === 'miss') {
      flash(route.has(r.target.index) ? [route.get(r.target.index)] : [], 'miss');
      say('Miss', 'miss');
      markNote(r.target);
    } else if (r.kind === 'wrong') {
      flash(keys, 'wrong');
      say('Wrong note', 'wrong');
    } else if (r.kind === 'early' || r.kind === 'late') {
      flash(keys, 'near');
      say(r.kind === 'early' ? 'Too early' : 'Too late', 'near');
    } else if (r.kind === 'hold' && r.held) say('Held', 'held');
  }
  // A played note's head takes its judgement colour and pops; a missed one only changes colour.
  function markNote(t) {
    const el = doc.querySelector?.(`[data-game-note="${t.index}"]`);
    if (!el) return;
    el.className = `game-note is-${t.result}`;
    if (t.result !== 'miss') animate(el, NOTE_POP, NOTE_POP_TIMING);
  }

  // ---- each frame ----
  function loop() {
    if (frame === null && raf) frame = raf(step);
  }
  function stopLoop() {
    if (frame !== null) {
      cancel?.(frame);
      frame = null;
    }
  }
  function step() {
    frame = null;
    if (phase !== 'running' || !engine) return;
    const at = transport.timeAt();
    if (transport.state === 'playing' && !at.countIn && active().mode === 'play') {
      for (const e of engine.advance(at.v)) react(e);
    }
    paint(
      active().mode === 'learn'
        ? stepTick()
        : transport.state === 'playing'
          ? at.v
          : transport.position()
    );
    loop();
  }
  function paint(v) {
    const s = active();
    const highway = doc.querySelector?.('[data-game-highway]'),
      track = doc.querySelector?.('[data-game-track]');
    if (highway && track) {
      const width = highway.clientWidth || 0,
        next = width > HIT_X ? (width - HIT_X) / (s.lead * engine.tps) : ppt;
      if (next && Math.abs(next - ppt) > 1e-9) {
        ppt = next;
        track.style.setProperty('--ppt', String(ppt));
        // The hit line carries the Good window, and the Perfect window inside it, at this scale.
        const span = ms => `${((2 * ms) / 1000) * engine.tps * ppt}px`;
        highway.style.setProperty('--good-w', span(WINDOWS.good));
        highway.style.setProperty('--perfect-w', span(WINDOWS.perfect));
      }
      track.style.transform = `translate3d(${HIT_X - (v - chart.from) * ppt}px,0,0)`;
    }
    // Hints never light a later note beside a current one. Timed lights a suggested key only while its
    // note is due and not yet played or missed; on screen its ring still closes onto the key over the
    // lead time and outlines it as the note gets close. Wait lights and rings only the next notes to play.
    const lead = s.lead * engine.tps,
      soon = new Map(),
      light = new Set();
    if (s.lights !== 'off') {
      if (s.mode === 'learn')
        for (const t of engine.pending()) {
          const k = route.get(t.index);
          if (k !== undefined) {
            soon.set(k, (t.tick - v) / lead);
            light.add(k);
          }
        }
      else {
        const missed = v - ((WINDOWS.good + Math.max(0, run.offsetMs)) / 1000) * engine.tps;
        for (const t of engine.targets) {
          if (t.tick < missed) continue;
          if (t.tick > v + lead) break;
          const k = route.get(t.index);
          if (t.result || k === undefined) continue;
          if (!soon.has(k)) soon.set(k, (t.tick - v) / lead);
          if (t.tick <= v) light.add(k);
        }
      }
    }
    for (const k of rings)
      if (!soon.has(k)) {
        const ring = doc.querySelector?.(`[data-game-ring="${k}"]`);
        if (ring) {
          ring.style.opacity = '0';
          ring.style.transform = '';
        }
        const key = doc.querySelector?.(`[data-comp-key="${k}"]`);
        key?.classList.remove('game-soon');
        key?.classList.remove('game-now');
      }
    for (const [k, f] of soon) {
      const ring = doc.querySelector?.(`[data-game-ring="${k}"]`);
      if (ring) {
        // The outline closes at an even rate, so its distance reads as time, and fades in as it nears.
        const x = Math.min(1, Math.max(0, f)),
          near = 1 - x;
        ring.style.opacity = String(0.15 + 0.85 * near * near * (3 - 2 * near));
        ring.style.transform = still() ? '' : `scale(${1 + 1.25 * x})`;
      }
      const key = doc.querySelector?.(`[data-comp-key="${k}"]`);
      key?.classList.toggle('game-soon', f < 0.4);
      key?.classList.toggle('game-now', light.has(k));
    }
    rings = new Set(soon.keys());
    if (light.size !== lit.size || [...light].some(k => !lit.has(k))) {
      lit = light;
      onLights();
    }
    const t = now();
    for (const [k, f] of flashes) {
      const el = doc.querySelector?.(`[data-comp-key="${k}"]`);
      if (f.until < t) {
        el?.classList.remove(`game-flash-${f.cls}`);
        flashes.delete(k);
      } else el?.classList.add(`game-flash-${f.cls}`);
    }
    paintHud(v);
    paintOverlay();
  }
  function paintHud(v) {
    const s = engine.state(),
      learn = active().mode === 'learn',
      set = (sel, text) => {
        const el = doc.querySelector?.(sel);
        if (el && el.textContent !== text) el.textContent = text;
      };
    set('[data-game-score]', learn ? `${s.judged} / ${s.total}` : s.score.toLocaleString('en'));
    set(
      '[data-game-combo]',
      !learn && s.combo > 1
        ? `${s.combo} combo${s.multiplier > 1 ? ` · ×${s.multiplier}` : ''}`
        : ''
    );
    set('[data-game-accuracy]', learn ? '' : `${s.accuracy.toFixed(1)}%`);
    const bar = doc.querySelector?.('[data-game-progress]');
    if (bar)
      bar.style.transform = `scaleX(${learn ? s.judged / Math.max(1, s.total) : Math.max(0, Math.min(1, (v - chart.from) / Math.max(1, chart.to - chart.from)))})`;
    const fb = doc.querySelector?.('[data-game-feedback]');
    if (fb) {
      const live = !!feedback && feedback.until > now(),
        text = live ? feedback.text : '';
      if (fb.textContent !== text) {
        fb.textContent = text;
        fb.className = `game-feedback${live ? ` is-${feedback.cls}` : ''}`;
      }
      // Each new judgement pops, even one that reads like the last.
      if (live && feedback !== shown) {
        shown = feedback;
        fb.className = `game-feedback is-${feedback.cls}`;
        animate(fb, FEEDBACK_POP, FEEDBACK_POP_TIMING);
      }
    }
  }
  function paintOverlay() {
    const el = doc.querySelector?.('[data-game-overlay]');
    if (!el) return;
    const count = transport.countingIn?.();
    let text = '';
    if (paused) text = 'Paused. Press Space to resume.';
    else if (count) text = `${count.beats - count.beat + 1}`;
    else if (waitingTick !== null) {
      // The notes to play; once some are held, the ones still missing; and any to lift first.
      const w = engine.waiting(),
        names = list => [...new Set(list.map(t => noteName(t.coordinate)))].join(' · ');
      const parts = [`Play ${names(w.required)}`];
      if (w.missing.length && w.missing.length < w.required.length)
        parts.push(`Missing ${names(w.missing)}`);
      if (w.extras.length) parts.push(`Release ${names(w.extras)} first`);
      text = parts.length > 1 ? `${parts.join('. ')}.` : parts[0];
    }
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('is-count', !!count && !paused);
    // Each count-in beat pulses as it appears.
    if (count && !paused && text !== counted) animate(el, COUNT_PULSE, COUNT_PULSE_TIMING);
    counted = count && !paused ? text : '';
    const hear = doc.querySelector?.('[data-comp="game-hear-current"]');
    if (hear) hear.hidden = waitingTick === null;
  }

  // ---- timing calibration: tap along to clicks; the median lag is taken off every press ----
  function startCalibration() {
    leave();
    const mine = revision;
    phase = 'calibrating';
    calibration = {clicks: [], taps: []};
    message = '';
    refresh();
    void audio.prepare().then(
      () => {
        if (phase !== 'calibrating' || mine !== revision) return;
        const snap = audio.getClockSnapshot(),
          first = snap.audioSeconds + 0.8,
          beat = 60 / CAL_BPM;
        calibration.clicks = Array.from({length: CAL_CLICKS}, (_, k) => first + k * beat);
        audio.scheduleVoices(
          calibration.clicks.map((t, k) => ({
            voiceId: `cal#${k}`,
            cents: k % 4 ? CLICK.beat.cents : CLICK.bar.cents,
            onsetAudioSeconds: t,
            releaseAudioSeconds: t + CLICK.seconds,
            velocity: 110,
            chordSize: 1
          })),
          {groupId: 'calibration', settings: CLICK.settings}
        );
        calTimer = setTimer(
          finishCalibration,
          (calibration.clicks.at(-1) - snap.audioSeconds + 0.6) * 1000
        );
      },
      error => {
        if (mine === revision) {
          message = `Audio could not start: ${error.message}`;
          phase = 'setup';
          refresh();
        }
      }
    );
  }
  function tap(event) {
    if (event.type !== 'down' || !calibration?.clicks.length) return;
    const heard = heardSeconds(audio.getClockSnapshot(), event.t);
    let best = null;
    calibration.clicks.forEach((c, k) => {
      if (k < CAL_SKIP) return;
      const d = heard - c;
      if (Math.abs(d) < 0.3 && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    });
    if (best !== null) calibration.taps.push(best * 1000);
    const out = doc.querySelector?.('[data-game-taps]');
    if (out) out.textContent = `${calibration.taps.length} of ${CAL_CLICKS - CAL_SKIP} taps`;
  }
  function finishCalibration() {
    clearTimer(calTimer);
    calTimer = null;
    if (phase !== 'calibrating') return;
    const taps = calibration?.taps ?? [];
    if (taps.length < 4)
      message = 'Tap along with at least four of the last eight clicks to measure your timing.';
    else {
      offsetMs = Math.round(median(taps));
      storage.set(OFFSET_KEY, offsetMs);
      message = `Timing offset set to ${signedMs(offsetMs)}: your presses are judged ${offsetMs >= 0 ? 'that much earlier' : 'that much later'} to match.`;
    }
    calibration = null;
    audio.cancelGroup?.('calibration');
    phase = 'setup';
    refresh();
  }

  // ---- the physical HexBoard: a run's lit keys on a dark board or over the layout, hits and misses flashed ----
  function deviceSnapshot(held = []) {
    const p = playingProject(),
      board = playingBoard();
    if (!p || !board) return null;
    // Setup lights the previewed notes over the layout; results and calibration show the layout alone.
    const running = phase === 'running',
      snap = compositionDeviceSnapshot(p, board, [
        ...(running ? lit : phase === 'setup' ? rings : []),
        ...held
      ]);
    if (!running) return snap;
    const dark = active().lights === 'dark';
    for (const key of snap.keys) {
      if (key.command || !key.enabled) continue;
      const f = flashes.get(key.index);
      if (f) {
        key.color = key.layoutColor = FLASH_COLORS[f.cls] ?? key.color;
        key.lit = true;
        continue;
      }
      if (dark && !key.lit) key.layoutColor = '#000000';
    }
    return snap;
  }

  // ---- host hooks ----
  function onTransport(event, detail) {
    if (phase !== 'running' || stopping) return;
    if (event === 'error') {
      leave();
      message = `Audio could not start${detail?.error?.message ? `: ${detail.error.message}` : ''}. Try Start again.`;
      refresh();
      return;
    }
    if (event === 'ended') {
      for (const r of engine.advance(detail?.v ?? chart.to + (judgedAfterMs() / 1000) * engine.tps))
        react(r);
      finish();
      return;
    }
    if (event === 'stopped') {
      quit();
      return;
    }
    if (event === 'paused' || event === 'suspended') pause();
  }
  function click(action, el) {
    switch (action) {
      case 'game-start':
        start();
        return;
      case 'game-again':
        again();
        return;
      case 'game-restart':
        start();
        return;
      case 'game-practise':
        quit();
        settings = {
          ...settings,
          mode: 'learn',
          section: 'bars',
          fromBar: Number(el.dataset.from) || 1,
          toBar: Number(el.dataset.to) || Number(el.dataset.from) || 1
        };
        save();
        refresh();
        return;
      case 'game-setup':
        quit();
        return;
      case 'game-pause':
        togglePause();
        return;
      case 'game-quit':
        quit();
        return;
      case 'game-repeat-pause':
        togglePause();
        return;
      case 'game-repeat-stop':
        cancelRepeat();
        settings.repeat = false;
        if (run) run.settings.repeat = false;
        save();
        refresh();
        return;
      case 'game-preview-first':
        preview('first');
        return;
      case 'game-preview-prev':
        preview('prev');
        return;
      case 'game-preview-next':
        preview('next');
        return;
      case 'game-preview-hear':
        preview('hear');
        return;
      case 'game-hear-current':
        hearCurrent();
        return;
      case 'game-speed-preset':
        change('gameSpeed', {value: el.dataset.speed});
        return;
      case 'game-calibrate':
        startCalibration();
        return;
      case 'game-calibrate-done':
        finishCalibration();
        return;
      case 'game-offset-clear':
        offsetMs = null;
        storage.set(OFFSET_KEY, null);
        message = 'Timing offset cleared.';
        refresh();
        return;
    }
  }
  function change(field, el) {
    if (phase !== 'setup') return true;
    const value = el.value,
      map = {
        gamePart: 'part',
        gameMatch: 'match',
        gameMode: 'mode',
        gameSpeed: 'speed',
        gameTargetSpeed: 'targetSpeed',
        gameGuide: 'guide',
        gameCountIn: 'countIn',
        gameLead: 'lead',
        gameSection: 'section',
        gameFrom: 'fromBar',
        gameTo: 'toBar',
        gameLights: 'lights'
      };
    if (
      ['gameSpeed', 'gameTargetSpeed', 'gameFrom', 'gameTo'].includes(field) &&
      (String(value).trim() === '' || !Number.isFinite(Number(value)))
    ) {
      refresh();
      return true;
    }
    const checks = {gameClick: 'click', gameTrainer: 'trainer', gameRepeat: 'repeat'};
    if (checks[field]) settings = normalizeSettings({...settings, [checks[field]]: !!el.checked});
    else if (map[field]) settings = normalizeSettings({...settings, [map[field]]: value});
    else return false;
    previewTick = null;
    rings.clear();
    audio.cancelGroup?.('preview');
    message = '';
    save();
    refresh();
    return true;
  }
  /** Space starts, pauses and resumes; it is the game's only key. */
  function keydown(event) {
    if (!(event.code === 'Space' || event.key === ' ')) return false;
    event.preventDefault();
    if (event.repeat) return true;
    if (phase === 'running' || repeatCountdown) togglePause();
    else if (phase === 'setup') start();
    else if (phase === 'results') again();
    return true;
  }
  function view() {
    const p = playingProject(),
      info = phase === 'setup' ? setupInfo() : null,
      s = run?.section ?? info?.section,
      chosen = active();
    const preview = info ? previewInfo(info) : null;
    if (preview) rings = previewKeys(info, preview.notes);
    return {
      phase,
      settings: {...chosen},
      offsetMs,
      message,
      paused,
      waitingTick,
      pass,
      repeatCountdown: repeatCountdown ? {...repeatCountdown} : null,
      bpm: p ? (p.tempo * chosen.speed) / 100 : 0,
      preview,
      exportMatchMode: getExportMatch(),
      hasLoop: !!p && p.loop.endTick !== null,
      hasSelected: !!getSelectedSection(),
      bars: p ? Math.round(contentEndTick(p) / barTicks(p.meter)) : 0,
      section: s,
      sectionUnavailable: info?.section?.unavailable ?? '',
      unreachable: info?.unreachable ?? [],
      best:
        p && chosen.mode === 'play' && s && !s.unavailable
          ? bestFor(run?.bestKey ?? bestKey(p, chosen, s))
          : null,
      chart,
      lanes: chart && p ? lanesFor(p, chart.targets) : [],
      targets: engine?.targets ?? [],
      meter: p?.meter,
      route,
      summary,
      calibration: calibration
        ? {clicks: CAL_CLICKS, skip: CAL_SKIP, taps: calibration.taps.length}
        : null
    };
  }
  function leave() {
    ++revision;
    cancelRepeat();
    cancelEnd();
    quiet(() => transport.stop());
    stopLoop();
    clearTimer(calTimer);
    calTimer = null;
    phase = 'setup';
    paused = false;
    waitingTick = null;
    calibration = null;
    cleanAudio();
    audio.cancelGroup?.('calibration');
    engine = null;
    chart = null;
    run = null;
    rings.clear();
    lit = new Set();
    flashes.clear();
    feedback = null;
    summary = null;
    previewTick = null;
  }
  return {
    view,
    start,
    finish,
    quit,
    pause,
    input,
    click,
    change,
    keydown,
    onTransport,
    playbackProject,
    deviceSnapshot,
    finishCalibration,
    leave,
    fingering: () => fingering(),
    /** After the host rebuilds the page: carry on drawing. */
    resume() {
      if (phase === 'running') loop();
      else if (phase === 'setup') resumePreview();
    },
    step,
    get phase() {
      return phase;
    },
    get settings() {
      return {...settings};
    },
    get engine() {
      return engine;
    },
    get running() {
      return phase === 'running';
    }
  };
}
