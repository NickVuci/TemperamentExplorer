// Create > Composition workspace controller. Owns the open project (with undo), the
// transport and the small amount of UI state. Rendering lives in composition-view.mjs;
// the piano roll's pointer gestures in composition-roll-input.mjs; sound goes through the
// shared audio engine; app.mjs only wires it in.
import {
  captureContext,
  matchesApp,
  materialToChordEvent,
  resolveTone,
  tuningKey,
  degreeOf
} from './composition-context.mjs';
import {
  PPQ,
  LIMITS,
  barTicks,
  createProject,
  parseProject,
  serializeProject,
  createHistory,
  makeEvent,
  allIds,
  addEvent,
  updateEvent,
  removeEvent,
  duplicateEvent,
  insertGap,
  swapAdjacent,
  setProjectBars,
  setTempo,
  setMeter,
  setName,
  setLoop,
  setFingering,
  editEvents,
  contentEndTick
} from './composition-project.mjs';
import {
  applyFiguration,
  removeFiguration,
  setSoundHarmony,
  newId,
  editMelodyEvents,
  setClipLength
} from './composition-project.mjs';
import {
  compileFiguration,
  orderedChord,
  octaveVector,
  patternNotes,
  patternFromNotes,
  generateTexturePattern,
  ADAPTIVE_FIGURATION_FORMAT,
  isGenerated,
  FIGURATION_FORMAT,
  validatePattern
} from './composition-figuration.mjs';
import {browserPresetStore} from '../presets/preset-store.mjs';
import {renderFiguration} from './composition-figuration-view.mjs';
import {createTransport} from './composition-transport.mjs';
import {
  boardSnapshot,
  buildCueTimeline,
  activeCues,
  toPracticeTargets,
  MATCH_MODES
} from './composition-cues.mjs';
import {
  renderComposition,
  renderSelectionPanel,
  renderRollToolbar,
  renderRollStatus,
  formatPosition,
  chordRoot,
  REGISTER_CHOICES,
  ZOOM,
  ROW_HEIGHT,
  DEGREE_WIDTH
} from './composition-view.mjs';
import {
  normalizeGrid,
  snapTick,
  cellTicks,
  stepLine,
  beatTicks,
  euclid,
  parseGroups,
  formatBeat
} from './composition-grid.mjs';
import {createTake, createHoldGroup, groupChords} from './composition-record.mjs';
import {rootedChordName} from '../harmonic/harmonic-bass.mjs';
import {
  shiftEvents,
  transposeEvents,
  quantizeEvents,
  splitEvents,
  scaleEvents,
  legatoEvents,
  reverseEvents,
  euclidEvents,
  copyEvents,
  pasteEvents,
  velocityEvents
} from './composition-edit.mjs';
import {createRollInput} from './composition-roll-input.mjs';
import {createGameController} from './composition-game-ui.mjs';
import {compositionBoard, compositionDeviceSnapshot, boardMarkup} from './composition-board.mjs';
import {hexDistance} from '../hexboard/hexboard-chords.mjs';
import {createHexboardPlayer} from '../hexboard/hexboard-player.mjs';
import {signedInteger} from '../ui/ui.mjs';

const FOCUS_ATTRS = [
  'data-comp',
  'data-comp-field',
  'type',
  'data-event',
  'data-tick',
  'data-a',
  'data-b',
  'data-n'
];
const slug = name =>
  String(name)
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'composition';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const intIn = (value, lo, hi, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? clamp(n, lo, hi) : fallback;
};

export function createCompositionWorkspace({
  document: doc,
  window: win = globalThis.window,
  audio,
  getState,
  getLayout,
  getTonic,
  getMaterial,
  loadState,
  getHost,
  notify = () => {},
  download = () => {},
  // The chord focused in Discover, as a collected-chord item, and a hook told which chord is selected here.
  getFocusedChord = () => null,
  onChordFocus = () => {},
  // The chord directory's chords rooted on a scale degree of the app's Play scale, every inversion; null while listing.
  getRootEntries = () => [],
  // Played coordinates read against the chord directory (harmonic-catalogue matchPlayed), or null.
  matchPlayed = () => null,
  // Where the rhythm game keeps settings, best scores and the timing offset (default: this browser).
  gameStorage,
  // Told when a Play run's lit keys change, so a connected HexBoard can show them at once.
  onLights = () => {},
  raf = globalThis.requestAnimationFrame?.bind(globalThis),
  timer,
  figurationStore = browserPresetStore
}) {
  let history = null,
    message = '',
    cache = null,
    frame = null,
    boardCache = null,
    suppressClick = false,
    clipboard = null,
    input = null;
  let figureEditor = null,
    savedFigures = [],
    figureLibraryError = '',
    figurePanelOpen = false;
  const figureOptions = {
    name: 'New figure',
    contour: 'random',
    lowOctave: 0,
    highOctave: 0,
    range: 'board',
    parts: 3,
    rests: 0,
    velocity: 90,
    scope: 'selected',
    saved: '',
    voice: 1,
    octave: 0
  };
  const ui = {
    selectedChord: null,
    addLength: 4,
    collection: 0,
    noteDuration: 'grid',
    registers: 'board',
    matchMode: 'exact-coordinate',
    mode: 'compose',
    follow: true,
    boardLabels: true,
    chooseButtons: false,
    boardShow: 'both',
    // Root lane picker: {tick, replace: chord id or null, degree: scale degree or null, all: show every harmony}.
    rootPick: null,
    // Piano roll: the time grid, tool, zoom, the selected melody notes and the open toolbar menu.
    grid: normalizeGrid({}),
    tool: 'draw',
    zoom: ZOOM.initial,
    rowHeight: ROW_HEIGHT.initial,
    velocityLane: true,
    selected: new Set(),
    menu: null,
    lastRow: null,
    rhythm: {strength: 100, split: 9, fitN: 9, fitM: 8, k: 5, n: 8, rotate: 0, gate: 75},
    // HexBoard input: the lane notes go into, step entry, record arm, count-in bars and the metronome.
    inputTarget: 'melody',
    stepInput: false,
    record: false,
    countIn: 1,
    click: false
  };
  // Which tracks the composition board (screen and HexBoard) lights: 'chords', 'melody' or 'both'.
  // A display choice only: playback always sounds every track.
  const BOARD_SHOW = ['chords', 'melody', 'both'];
  const showsTrack = kind => ui.boardShow === 'both' || kind === ui.boardShow;
  const project = () => history?.project ?? null;
  const sourceProject = () => (figureEditor ? figureEditor.history.project : project());
  const canEdit = () => ui.mode === 'compose';
  const transport = createTransport({
    getProject: () => {
      const p = project();
      return p && ui.mode === 'game' ? game.playbackProject(p) : p;
    },
    audio,
    ...(timer ? {timer} : {}),
    getClick: () => (ui.mode === 'game' ? game.settings.click : ui.click),
    onState: (event, detail) => {
      if (ui.mode === 'game') {
        game.onTransport(event, detail);
        return;
      }
      if (event === 'error') {
        say(
          `Audio could not start${detail?.error?.message ? `: ${detail.error.message}` : ''}. Press Play again.`
        );
        return;
      }
      if (event === 'resync') return;
      // The rhythm game drives the transport and draws itself.
      if (event === 'playing' && ui.record && canEdit() && !take) beginTake();
      // A take ends whenever playback halts; committing it rebuilds the workspace.
      if (take && ['paused', 'stopped', 'ended', 'suspended'].includes(event)) {
        endTake();
        return;
      }
      refresh();
      if (event === 'playing') startLoop();
    }
  });

  const game = createGameController({
    document: doc,
    audio,
    transport,
    getProject: () => project(),
    getBoard: () => boardModel().board,
    refresh: () => refresh(),
    notify,
    getSelectedSection: () => {
      const p = project(),
        clip = p && chordOwner(p, ui.selectedChord),
        e = clip?.events.find(e => e.id === ui.selectedChord);
      return e
        ? {from: clip.startTick + e.startTick, to: clip.startTick + e.startTick + e.durationTick}
        : null;
    },
    getExportMatch: () => ui.matchMode,
    releaseHeld: () => keyPlayer.reset(),
    onLights,
    ...(raf ? {raf} : {raf: null}),
    ...(gameStorage ? {storage: gameStorage} : {})
  });

  const trackOf = (p, kind) => p.tracks.find(t => t.kind === kind);
  const clipOf = (p, kind) => p.clips.find(c => c.trackId === trackOf(p, kind).id);
  const chordOwner = (p, id) =>
    p.clips.find(
      c =>
        p.tracks.find(t => t.id === c.trackId)?.kind === 'chords' && c.events.some(e => e.id === id)
    );
  function displayedChords(p) {
    const clip = clipOf(p, 'chords');
    if (!p.figuration) return clip;
    return {
      ...clip,
      startTick: 0,
      events: compileFiguration(p).harmonies.map(o => ({...o.event, startTick: o.start}))
    };
  }
  const centsOf = (p, e) => e.tones.map(t => resolveTone(p.context, t.coordinate).cents);
  const melody = () => displayedMelody(project(), false);
  function displayedMelody(p, includeGenerated = true) {
    const clip = clipOf(p, 'melody');
    const manual = p.clips
      .filter(c => p.tracks.find(t => t.id === c.trackId)?.kind === 'melody')
      .flatMap(c => c.events.map(e => ({...e, startTick: c.startTick + e.startTick})));
    const generated = includeGenerated ? compileFiguration(p).events : [];
    return {...clip, startTick: 0, events: [...manual, ...generated]};
  }
  const selectedEvents = () =>
    project() ? displayedMelody(project()).events.filter(e => ui.selected.has(e.id)) : [];
  const grid = () => normalizeGrid(ui.grid);

  function timeline() {
    const p = project();
    if (!p) return [];
    if (!cache || cache.project !== p)
      cache = {
        project: p,
        timeline: buildCueTimeline(p, boardSnapshot(p), {ignoreMixer: true}),
        snapshot: null
      };
    return cache.timeline;
  }
  function boardModel() {
    const p = project();
    if (!p) return {board: null, reason: ''};
    if (boardCache?.project !== p) boardCache = {project: p, ...compositionBoard(p)};
    return boardCache;
  }
  // ---- fingering: the composition's buttons, one per pitch, exactly as Play suggests them ----
  const fingering = () => game.fingering();
  // Each tone's first cue, where its button is read.
  function toneCues() {
    timeline();
    if (!cache.toneCues) {
      cache.toneCues = new Map();
      for (const q of cache.timeline)
        if (!cache.toneCues.has(q.toneId)) cache.toneCues.set(q.toneId, q.cueId);
    }
    return cache.toneCues;
  }
  /** Each of the event's tones' buttons, in tone order (undefined where no key plays it). */
  const toneKeys = event => {
    const route = fingering(),
      cues = toneCues();
    return event.tones.map(t => route.get(cues.get(t.toneId)));
  };
  const soundingKeys = tick => {
    const route = fingering();
    return activeCues(timeline(), tick)
      .sounding.filter(q => showsTrack(q.trackKind))
      .map(q => route.get(q.cueId))
      .filter(k => k !== undefined);
  };
  const selectedChordEvent = () => {
    const p = project();
    return p
      ? (chordOwner(p, ui.selectedChord)?.events.find(e => e.id === ui.selectedChord) ?? null)
      : null;
  };
  // The selected chord's and notes' exact pitches, as the board shows them.
  function selectedPitches() {
    const chord = showsTrack('chords') ? selectedChordEvent() : null;
    const pitches = [
      ...(chord?.tones ?? []),
      ...(showsTrack('melody') ? selectedEvents().flatMap(e => e.tones) : [])
    ].map(t => t.coordinate);
    return [...new Map(pitches.map(m => [m.join(','), m])).values()];
  }
  // Choose buttons: every other key that plays a selected pitch is offered.
  function optionKeys() {
    const board = boardModel().board;
    if (!ui.chooseButtons || !board) return [];
    const pitches = new Set(selectedPitches().map(m => m.join(','))),
      shown = new Set([...selectedKeys(), ...noteKeys()]);
    return board.keys
      .filter(k => !k.command && k.enabled && pitches.has(k.m.join(',')) && !shown.has(k.index))
      .map(k => k.index);
  }
  /** Pressing a key of a selected pitch while choosing makes it that pitch's button throughout the piece. */
  function chooseButton(event) {
    if (!ui.chooseButtons || event.type !== 'down' || take || ui.stepInput || !canEdit())
      return false;
    const index = Number(event.keyId),
      key = boardModel().board?.keys[index],
      id = key?.m.join(',');
    if (!key || key.command || !key.enabled || !selectedPitches().some(m => m.join(',') === id))
      return false;
    if (project().fingering?.[id] !== index)
      edit('Choose button', pr => setFingering(pr, [{coordinate: key.m, key: index}]));
    return true;
  }
  /** Returns pitches to automatic buttons: the selected ones, or with `all` every chosen one. */
  function automaticButtons(all) {
    const chosen = project()?.fingering ?? {},
      pitches = all
        ? Object.keys(chosen).map(id => id.split(',').map(Number))
        : selectedPitches().filter(m => chosen[m.join(',')] !== undefined);
    if (pitches.length)
      edit(all ? 'Reset buttons' : 'Automatic buttons', pr =>
        setFingering(
          pr,
          pitches.map(m => ({coordinate: m, key: null}))
        )
      );
  }
  // Directory chords on the picked root, in every inversion, with the root from that degree's home
  // coordinate in the composition's scale. Only offered while the app matches the composition (the directory
  // follows the app); null while the directory is still listing.
  let rootRetry = null;
  function rootHarmonies() {
    const p = project(),
      pick = ui.rootPick;
    if (!p || pick?.degree == null || !matchesApp(p.context, getState())) return [];
    const entries = getRootEntries(pick.degree);
    if (entries == null) {
      if (!rootRetry)
        rootRetry = setTimeout(() => {
          rootRetry = null;
          if (ui.rootPick) refresh();
        }, 400);
      return null;
    }
    const home = p.context.scale.degrees[pick.degree]?.coordinate;
    return entries
      .map((e, index) => ({e, index}))
      .filter(({e}) => home && e.root?.[1] === home[1] && e.coords.length <= 8)
      .map(({e, index}) => ({
        index,
        label: e.label,
        chord: e.chord ?? e.label,
        role: e.role,
        bass: e.rootPosition ? null : e.bassDegree,
        size: e.classCount,
        coords: e.coords,
        rootTone: e.rootVoice ?? 0
      }));
  }
  function pickHarmony(index) {
    const p = project(),
      pick = ui.rootPick,
      h = rootHarmonies()?.find(x => x.index === index);
    if (!p || !pick || !h) return;
    const clip = (pick.replace && chordOwner(p, pick.replace)) || clipOf(p, 'chords'),
      old = pick.replace ? find(clip, pick.replace) : null;
    const source = {kind: 'directory', label: h.chord, role: h.role, rootTone: h.rootTone};
    let newId = null;
    const ok = edit(old ? 'Change harmony' : 'Add harmony', pr => {
      const ev = makeEvent(
        {
          startTick: old ? old.startTick : pick.tick,
          durationTick: old ? old.durationTick : ui.addLength * PPQ,
          velocity: old?.velocity ?? 90,
          tones: h.coords.map(coordinate => ({coordinate})),
          source
        },
        allIds(pr)
      );
      const attached = old && pr.figuration?.attachments.some(a => a.chordEventId === old.id);
      newId = attached ? old.id : ev.id;
      return old
        ? editEvents(pr, clip.id, {remove: attached ? [] : [old.id], put: [{...ev, id: newId}]})
        : addEvent(pr, clip.id, ev);
    });
    if (!ok) return;
    ui.rootPick = null;
    ui.selectedChord = newId;
    const e = find(clipOf(project(), 'chords'), newId);
    if (e) {
      audio.previewChord?.(centsOf(project(), e));
      onChordFocus(e.tones.map(t => [...t.coordinate]));
    }
    refresh();
  }
  // The selected chord's buttons in tone order, and the selected melody notes' buttons.
  function selectedKeys() {
    const e = showsTrack('chords') ? selectedChordEvent() : null;
    return e ? toneKeys(e).filter(k => k !== undefined) : [];
  }
  function noteKeys() {
    if (!ui.selected.size || !showsTrack('melody')) return [];
    return [
      ...new Set(
        selectedEvents()
          .flatMap(toneKeys)
          .filter(k => k !== undefined)
      )
    ];
  }
  /** The selected chord's buttons as Play uses them: each tone's key, whether it was chosen, and the reach. */
  function chordButtons() {
    const e = selectedChordEvent(),
      board = boardModel().board;
    if (!e || !board) return null;
    const chosen = project().fingering ?? {},
      keys = toneKeys(e).map((key, i) => ({
        key,
        chosen: key !== undefined && chosen[e.tones[i].coordinate.join(',')] === key
      }));
    const placed = keys.filter(k => k.key !== undefined).map(k => board.keys[k.key]);
    return {keys, reach: Math.max(0, ...placed.flatMap(a => placed.map(b => hexDistance(a, b))))};
  }
  function deviceSnapshot() {
    const p = project();
    if (!p) return null;
    if (ui.mode === 'game') return game.deviceSnapshot(Array.from(held.values(), h => h.index));
    const active = transport.state === 'playing' ? soundingKeys(transport.position()) : [],
      following = ui.follow && active.length > 0;
    const options =
      ui.chooseButtons && !following && selectedPitches().length ? optionKeys() : null;
    return compositionDeviceSnapshot(
      p,
      boardModel().board,
      [
        ...new Set([
          ...(following ? active : [...selectedKeys(), ...noteKeys()]),
          ...Array.from(held.values(), h => h.index)
        ])
      ],
      options
    );
  }

  // ---- piano roll helpers ----
  function rowName(coordinate) {
    const p = project(),
      d = p && degreeOf(p.context, coordinate);
    if (!p) return '';
    return d
      ? `degree ${d.degree}${d.register ? ` (${signedInteger(d.register)})` : ''}`
      : `${resolveTone(p.context, coordinate).cents.toFixed(0)}¢ outside the scale`;
  }
  const defaultLength = start =>
    ui.noteDuration === 'grid' ? cellTicks(project().meter, grid(), start) : ui.noteDuration;
  const audition = coordinates => {
    const p = project();
    if (p && coordinates.length)
      audio.previewChord?.(coordinates.map(c => resolveTone(p.context, c).cents));
  };
  // Where a Euclidean fill goes: over the selection (replacing it), else the loop, else the bar at the playhead.
  function euclidPlan() {
    const p = project(),
      evs = selectedEvents();
    let start,
      end,
      where,
      coordinate = null,
      velocity = 90;
    if (evs.length) {
      const first = [...evs].sort((a, b) => a.startTick - b.startTick)[0];
      start = first.startTick;
      end = Math.max(...evs.map(e => e.startTick + e.durationTick));
      coordinate = first.tones[0].coordinate;
      velocity = first.velocity;
      where = `Replaces the ${evs.length} selected note${evs.length === 1 ? '' : 's'} (${formatBeat(p.meter, start)} to ${formatBeat(p.meter, end)})`;
    } else if (p.loop.endTick !== null) {
      start = p.loop.startTick;
      end = p.loop.endTick;
      where = `Adds to the loop (${formatBeat(p.meter, start)} to ${formatBeat(p.meter, end)})`;
    } else {
      const bar = barTicks(p.meter),
        b = Math.floor(Math.min(transport.position(), contentEndTick(p) - 1) / bar);
      start = b * bar;
      end = start + bar;
      where = `Adds to bar ${b + 1}, at the playhead`;
    }
    coordinate ??= ui.lastRow ?? p.context.scale.degrees[0].coordinate;
    return {
      start,
      end,
      coordinate,
      velocity,
      replace: evs.map(e => e.id),
      text: `${where}, on ${rowName(coordinate)}.`
    };
  }
  const euclidPreview = () =>
    euclid(ui.rhythm.k, ui.rhythm.n, ui.rhythm.rotate)
      .map(x => (x ? 'x' : '·'))
      .join(' ');

  function view() {
    const p = project(),
      state = getState(),
      tick = transport.position();
    const items = getMaterial()
      .map((item, i) => ({item, i}))
      .filter(x => x.item.kind === 'chord');
    if (p) {
      const present = new Set(displayedMelody(p).events.map(e => e.id));
      for (const id of ui.selected) if (!present.has(id)) ui.selected.delete(id);
    }
    return {
      project: p,
      canUndo: !!history?.canUndo,
      canRedo: !!history?.canRedo,
      matchesApp: p ? matchesApp(p.context, state) : true,
      appSummary: `${state.name} · ${state.n} notes (mode ${state.mode + 1}) · tonic ${getTonic()} Hz`,
      transportState: transport.state,
      position: tick,
      chordClip: p ? displayedChords(p) : null,
      melodyClip: p ? displayedMelody(p) : null,
      figuration: p
        ? {
            ...compileFiguration(p),
            editor: !!figureEditor,
            open: figurePanelOpen,
            options: figureOptions,
            saved: savedFigures,
            libraryError: figureLibraryError,
            reference: figureEditor?.chord ?? selectedChordEvent() ?? clipOf(p, 'chords').events[0],
            hasOctave: !!octaveVector(p.context),
            attachments: sourceProject().figuration?.attachments ?? [],
            patterns: sourceProject().figuration?.patterns ?? [],
            localPatternId: figureEditor?.localPatternId
          }
        : null,
      selectedChord: ui.selectedChord,
      selected: new Set(ui.selected),
      addLength: ui.addLength,
      collectionIndex: ui.collection,
      mode: ui.mode,
      follow: ui.follow,
      boardLabels: ui.boardLabels,
      boardShow: ui.boardShow,
      chooseButtons: ui.chooseButtons,
      rootPick: ui.rootPick,
      rootHarmonies: ui.rootPick ? rootHarmonies() : [],
      board: boardModel().board,
      boardReason: boardModel().reason,
      selectedKeys: selectedKeys(),
      noteKeys: noteKeys(),
      optionKeys: optionKeys(),
      chordButtons: chordButtons(),
      chosenButtons: Object.keys(p?.fingering ?? {}).length,
      selectionChosen: p
        ? selectedPitches().filter(m => p.fingering?.[m.join(',')] !== undefined).length
        : 0,
      inputTarget: ui.inputTarget,
      stepInput: ui.stepInput,
      record: ui.record,
      recording: !!take,
      countIn: ui.countIn,
      click: ui.click,
      collection: items.map(x => ({
        label: x.item.label,
        compatible: !!p && tuningKey(x.item.state) === tuningKey(p.context)
      })),
      focused: (() => {
        const item = getFocusedChord();
        return item
          ? {label: item.label, compatible: !!p && tuningKey(item.state) === tuningKey(p.context)}
          : null;
      })(),
      noteDuration: ui.noteDuration,
      registers: ui.registers,
      matchMode: ui.matchMode,
      grid: ui.grid,
      tool: ui.tool,
      zoom: ui.zoom,
      rowHeight: ui.rowHeight,
      velocityLane: ui.velocityLane,
      menu: ui.menu,
      rhythm: ui.rhythm,
      canPaste: !!clipboard,
      euclidRange: p ? euclidPlan().text : '',
      euclidPreview: euclidPreview(),
      game: ui.mode === 'game' ? game.view() : null,
      message
    };
  }
  const render = () => renderComposition(view());

  function refresh() {
    const host = getHost?.();
    if (!host) return;
    const figurePanel = host.querySelector('.figuration-panel');
    if (figurePanel?.tagName === 'DETAILS') figurePanelOpen = figurePanel.open;
    input?.hideGhost();
    const active = doc.activeElement,
      sel =
        active?.getAttribute &&
        FOCUS_ATTRS.filter(a => active.hasAttribute?.(a))
          .map(a => `[${a}="${active.getAttribute(a)}"]`)
          .join('');
    const scroll = host.querySelector('.roll-scroll'),
      left = scroll?.scrollLeft ?? 0,
      top = scroll?.scrollTop ?? 0;
    host.innerHTML = render();
    const nextScroll = host.querySelector('.roll-scroll');
    if (nextScroll) {
      nextScroll.scrollLeft = left;
      nextScroll.scrollTop = top;
    }
    paint();
    if (ui.mode === 'game') game.resume();
    if (sel && !/disabled/.test(sel))
      try {
        host.querySelector(sel)?.focus?.({preventScroll: true});
      } catch {
        /* focus is best effort */
      }
  }
  // Selection changes update the roll in place, so a clicked note stays attached for a native double-click.
  function syncSelection() {
    const v = view(),
      panel = doc.querySelector?.('.comp-selection');
    if (!panel) {
      refresh();
      return;
    }
    for (const node of doc.querySelectorAll?.('.roll-note[data-event]') ?? []) {
      const on = v.selected.has(node.dataset.event);
      node.classList.toggle('is-selected', on);
      node.setAttribute?.('aria-pressed', String(on));
    }
    for (const node of doc.querySelectorAll?.('[data-vel-event]') ?? [])
      node.classList.toggle('is-selected', v.selected.has(node.dataset.velEvent));
    panel.outerHTML = renderSelectionPanel(v);
    const figures = doc.querySelector?.('.figuration-panel');
    if (figures) {
      if (figures.tagName === 'DETAILS') v.figuration.open = figures.open;
      const wrapper = doc.createElement('div');
      wrapper.innerHTML = renderFiguration(v);
      figures.replaceWith?.(wrapper.firstElementChild);
    }
    const bar = doc.querySelector?.('.roll-toolbar');
    if (bar) bar.outerHTML = renderRollToolbar(v);
    const status = doc.querySelector?.('.roll-status');
    if (status) {
      status.outerHTML = renderRollStatus(v);
      paint();
    }
    const board = doc.querySelector?.('.composition-board');
    if (board && v.board) {
      board.outerHTML = boardMarkup(
        v.project,
        v.board,
        v.selectedKeys,
        v.boardLabels,
        v.noteKeys,
        v.optionKeys
      );
      paint();
    }
  }
  function select(ids, mode = 'replace') {
    const generated =
      project() && compileFiguration(project()).events.find(e => ids.includes(e.id));
    if (generated) {
      ui.selectedChord = generated.source.chordEventId;
      message =
        'Attached figure: choose its buttons, edit its pattern, or detach it to edit individual notes.';
    }
    if (mode === 'replace') ui.selected = new Set(ids);
    else
      for (const id of ids) {
        if (mode === 'toggle' && ui.selected.has(id)) ui.selected.delete(id);
        else ui.selected.add(id);
      }
    const last = project() && melody().events.find(e => e.id === ids.at(-1));
    if (last) ui.lastRow = [...last.tones[0].coordinate];
    syncSelection();
  }
  function say(text) {
    message = text;
    notify(text);
    refresh();
  }
  function changed() {
    transport.invalidate();
    cache = null;
    message = '';
    refresh();
  }
  function edit(label, command) {
    if (!canEdit()) return false;
    try {
      history.execute(label, pr => {
        const next = command(pr);
        if (!figureEditor) return next;
        const reference = clipOf(next, 'chords');
        return updateEvent(next, reference.id, reference.events[0].id, {
          durationTick: clipOf(next, 'melody').lengthTick
        });
      });
      changed();
      return true;
    } catch (error) {
      say(error.message);
      return false;
    }
  }
  /** Commits a {remove, put} melody edit; the put notes become the selection unless `select` is false. */
  const commitNotes = (label, result, options) => commitEvents('melody', label, result, options);
  function commitEvents(kind, label, result, {select: pick = true} = {}) {
    if (figureEditor && kind === 'chords') {
      say('The reference chord stays fixed while drawing a figure.');
      return false;
    }
    if (
      result.put.some(isGenerated) ||
      result.remove.some(id => compileFiguration(project()).events.some(e => e.id === id))
    ) {
      say('Detach the figure before editing its notes.');
      return false;
    }
    if (kind === 'chords')
      return edit(label, pr => editEvents(pr, clipOf(pr, 'chords').id, result));
    const before = ui.selected;
    if (pick) ui.selected = new Set(result.put.map(e => e.id));
    else if (result.remove.length)
      ui.selected = new Set([...ui.selected].filter(id => !result.remove.includes(id)));
    if (edit(label, pr => editMelodyEvents(pr, result))) return true;
    ui.selected = before;
    refresh();
    return false;
  }
  // The note a click just drew: the second click of a double-click lands on it and must not delete it.
  let drawn = {id: null, at: 0};
  function addNote(start, coordinate, length) {
    const p = project(),
      ev = makeEvent(
        {startTick: start, durationTick: length, velocity: 90, tones: [{coordinate}]},
        allIds(p)
      );
    ui.lastRow = [...coordinate];
    drawn = {id: ev.id, at: Date.now()};
    return commitNotes('Add note', {remove: [], put: [ev]});
  }

  // ---- zoom ----
  function zoomTo(z, clientX) {
    const next = clamp(z, ZOOM.min, ZOOM.max);
    if (Math.abs(next - ui.zoom) < 1e-3) return;
    const scroll = doc.querySelector?.('.roll-scroll'),
      canvas = doc.querySelector?.('[data-comp-roll]');
    let anchor = null;
    if (scroll?.getBoundingClientRect && canvas) {
      const r = scroll.getBoundingClientRect(),
        offset = (clientX ?? r.left + (r.width + DEGREE_WIDTH) / 2) - r.left,
        span = Number(canvas.dataset.span);
      anchor = {
        offset,
        span,
        tick:
          ((scroll.scrollLeft + offset - DEGREE_WIDTH) /
            Math.max(1, canvas.offsetWidth - DEGREE_WIDTH)) *
          span
      };
    }
    ui.zoom = next;
    refresh();
    const s = doc.querySelector?.('.roll-scroll'),
      c = doc.querySelector?.('[data-comp-roll]');
    if (anchor && s && c)
      s.scrollLeft = Math.max(
        0,
        (anchor.tick / anchor.span) * (c.offsetWidth - DEGREE_WIDTH) + DEGREE_WIDTH - anchor.offset
      );
  }
  function zoomFit() {
    const p = project(),
      scroll = doc.querySelector?.('.roll-scroll'),
      width = scroll?.clientWidth || 1100;
    zoomTo((width - DEGREE_WIDTH - 4) / (contentEndTick(p) / PPQ));
    const s = doc.querySelector?.('.roll-scroll');
    if (s) s.scrollLeft = 0;
  }
  function rowsBy(delta) {
    const next = clamp(ui.rowHeight + delta, ROW_HEIGHT.min, ROW_HEIGHT.max);
    if (next !== ui.rowHeight) {
      ui.rowHeight = next;
      refresh();
    }
  }

  // ---- HexBoard input: the board player's holds light rows, enter steps and record takes ----
  // A held chord's pitches, read against the chord directory while the app matches the composition, so
  // a played chord is named and rooted exactly like one picked from the root lane (D-042).
  let playing = '',
    take = null,
    steps = [];
  const stepGroup = createHoldGroup();
  const byPitch = (p, list) =>
    [...list].sort((a, b) => resolveTone(p.context, a).cents - resolveTone(p.context, b).cents);
  function playedChord(coordinates) {
    const p = project(),
      tones = byPitch(p, [...new Map(coordinates.map(m => [m.join(','), [...m]])).values()]);
    let label = 'Played chord',
      rootTone = 0;
    if (tones.length > 1 && matchesApp(p.context, getState())) {
      const match = (() => {
        try {
          return matchPlayed(tones);
        } catch {
          return null;
        }
      })();
      if (match && ['chord', 'interval'].includes(match.status) && match.label) {
        label = match.label;
        const root = match.rootNote ? tones.findIndex(m => m.join(',') === match.rootNote) : -1;
        if (root >= 0) rootTone = root;
      }
    }
    return {
      tones: tones.map(coordinate => ({coordinate})),
      source: {kind: 'played', label, rootTone}
    };
  }
  const SUP = {
    '-': '⁻',
    '+': '⁺',
    0: '⁰',
    1: '¹',
    2: '²',
    3: '³',
    4: '⁴',
    5: '⁵',
    6: '⁶',
    7: '⁷',
    8: '⁸',
    9: '⁹'
  };
  function pitchName(p, m) {
    const d = degreeOf(p.context, m);
    return d
      ? `${d.degree}${d.register ? [...signedInteger(d.register)].map(c => SUP[c]).join('') : ''}`
      : `${resolveTone(p.context, m).cents.toFixed(0)}¢`;
  }
  /** "Playing 0 · 2 · 4 → 0 - 4:5:6": the held pitches, lowest first, and the chord they make. */
  function playingText() {
    const p = project(),
      coords = p
        ? byPitch(p, [
            ...new Map(
              [...held.values()]
                .filter(h => Array.isArray(h.coordinate))
                .map(h => [h.coordinate.join(','), h.coordinate])
            ).values()
          ])
        : [];
    if (!coords.length) return '';
    let chord = '';
    if (coords.length > 1) {
      const c = playedChord(coords);
      if (c.source.label !== 'Played chord') {
        const root = degreeOf(p.context, c.tones[c.source.rootTone].coordinate);
        chord = ` → ${rootedChordName(root?.degree, c.source.label)}`;
      }
    }
    return `Playing ${coords.map(m => pitchName(p, m)).join(' · ')}${chord}`;
  }
  // Step entry: the cursor is the playhead; a group of keys enters when the last one comes up.
  const stepLength = at => (ui.inputTarget === 'chords' ? ui.addLength * PPQ : defaultLength(at));
  const stepBefore = at =>
    ui.inputTarget === 'chords' || ui.noteDuration !== 'grid'
      ? Math.max(0, at - stepLength(Math.max(0, at - 1)))
      : stepLine(project().meter, grid(), at, -1);
  function moveCursor(tick) {
    void transport.seek(Math.max(0, tick)).then(() => {
      paint();
      revealTick(Math.max(0, tick));
    });
  }
  function startStepping() {
    if (transport.state === 'playing') transport.pause();
    const p = project();
    if (p && grid().snap) moveCursor(snapTick(p.meter, grid(), transport.position()));
  }
  function stepEnter(pitches) {
    const p = project(),
      at = transport.position(),
      kind = ui.inputTarget;
    if (kind === 'chords' && pitches.length < 2) {
      say('Hold two or more keys together to enter a chord, then let go.');
      return;
    }
    if (kind === 'chords' && pitches.length > LIMITS.tonesMax) {
      say(`A chord holds at most ${LIMITS.tonesMax} notes.`);
      return;
    }
    const length = stepLength(at),
      taken = allIds(p);
    const put =
      kind === 'chords'
        ? [
            makeEvent(
              {startTick: at, durationTick: length, velocity: 90, ...playedChord(pitches)},
              taken
            )
          ]
        : byPitch(p, pitches).map(coordinate =>
            makeEvent(
              {startTick: at, durationTick: length, velocity: 90, tones: [{coordinate}]},
              taken
            )
          );
    ui.selected = new Set();
    ui.lastRow = [...pitches[0]];
    if (
      !commitEvents(
        kind,
        kind === 'chords' ? 'Enter chord' : put.length > 1 ? 'Enter notes' : 'Enter note',
        {remove: [], put},
        {select: false}
      )
    )
      return;
    if (kind === 'chords') ui.selectedChord = put[0].id;
    steps.push({tick: at, length, kind, ids: put.map(e => e.id)});
    moveCursor(at + length);
  }
  function stepRest() {
    if (project()) moveCursor(transport.position() + stepLength(transport.position()));
  }
  /** Lengthens the last entry by one step when the cursor is still at its end. */
  function stepTie() {
    const p = project(),
      last = steps.at(-1),
      at = transport.position();
    const clip = last && clipOf(p, last.kind),
      events = last ? clip.events.filter(e => last.ids.includes(e.id)) : [];
    if (!events.length || last.tick + last.length !== at) {
      say('Tie lengthens the entry just before the cursor. Enter a note first.');
      return;
    }
    const add = stepLength(at);
    if (
      !commitEvents(
        last.kind,
        'Tie',
        {remove: [], put: events.map(e => ({...e, durationTick: e.durationTick + add}))},
        {select: false}
      )
    )
      return;
    last.length += add;
    moveCursor(at + add);
  }
  /** Removes the last entry and puts the cursor back where it was entered. */
  function stepBack() {
    const p = project(),
      last = steps.pop();
    if (!last) {
      moveCursor(stepBefore(transport.position()));
      return;
    }
    const gone = last.ids.filter(id => clipOf(p, last.kind).events.some(e => e.id === id));
    if (
      gone.length &&
      !commitEvents(last.kind, 'Remove entry', {remove: gone, put: []}, {select: false})
    )
      return;
    moveCursor(last.tick);
  }
  // Recording: armed, it takes every hold heard while playback runs (after any count-in).
  function startPlayback() {
    if (canEdit()) void transport.play({countIn: ui.record ? ui.countIn : 0});
  }
  function beginTake() {
    take = {rec: createTake(), kind: ui.inputTarget};
  }
  function endTake() {
    if (!take) return;
    const t = take,
      p = project(),
      notes = t.rec.finish(transport.timeAt());
    take = null;
    if (!p || !notes.length) {
      refresh();
      return;
    }
    const taken = allIds(p),
      g = grid();
    if (t.kind === 'chords') {
      // Recorded chords land on the grid while Snap is on; the played timing stays in their source.
      const put = groupChords(notes, {cents: m => resolveTone(p.context, m).cents}).map(c => {
        let start = c.startTick,
          end = c.endTick;
        if (g.snap) {
          start = snapTick(p.meter, g, start);
          end = Math.max(start + cellTicks(p.meter, g, start), snapTick(p.meter, g, end));
        }
        const chord = playedChord(c.coordinates.slice(0, LIMITS.tonesMax));
        return makeEvent(
          {
            startTick: start,
            durationTick: end - start,
            velocity: 90,
            tones: chord.tones,
            source: {
              ...chord.source,
              kind: 'recorded',
              played: {startTick: c.startTick, durationTick: c.endTick - c.startTick}
            }
          },
          taken
        );
      });
      if (commitEvents('chords', 'Record chords', {remove: [], put}, {select: false}))
        notify(`Recorded ${put.length} chord${put.length === 1 ? '' : 's'}.`);
      return;
    }
    // A melody take keeps its played timing and becomes the selection, ready to quantize (Q).
    const put = notes.map(n =>
      makeEvent(
        {
          startTick: n.startTick,
          durationTick: n.durationTick,
          velocity: 90,
          tones: [{coordinate: n.coordinate}],
          source: {kind: 'recorded'}
        },
        taken
      )
    );
    if (commitEvents('melody', 'Record take', {remove: [], put}))
      notify(
        `Recorded ${put.length} note${put.length === 1 ? '' : 's'}. Press Q to quantize them.`
      );
  }
  function toggleRecord() {
    if (!canEdit()) return;
    ui.record = !ui.record;
    if (transport.state === 'playing') {
      if (ui.record && !take) beginTake();
      else if (!ui.record && take) {
        endTake();
        return;
      }
    }
    refresh();
  }
  function hexInput(event) {
    if (ui.mode === 'game') {
      game.input(event);
      return;
    }
    if (!project() || !canEdit() || !event?.holdId) return;
    if (take) {
      const at = transport.timeAt(event.t);
      if (event.type === 'down') take.rec.down(event.holdId, event.coordinate, at);
      else take.rec.up(event.holdId, at);
      return;
    }
    if (chooseButton(event)) return;
    if (!ui.stepInput || transport.state === 'playing') return;
    if (event.type === 'down') {
      stepGroup.down(event.holdId, event.coordinate);
      return;
    }
    if (event.reason === 'reset') {
      stepGroup.cancel();
      paint();
      return;
    }
    const pitches = stepGroup.up(event.holdId);
    if (pitches?.length) stepEnter(pitches);
  }
  // Rows light while their pitch is held, and more softly while it sounds in playback. The step
  // cursor, the keys being entered and a take in progress are drawn over the roll in place.
  const marks = new Map();
  function paintInput(roll) {
    const span = Number(roll.dataset.span),
      pct = t => `${(100 * t) / span}%`,
      rows = new Map();
    const heldIds = new Set([...held.values()].map(h => h.coordinate?.join(',')).filter(Boolean));
    const soundingIds =
      transport.state === 'playing'
        ? new Set(
            activeCues(timeline(), transport.position())
              .sounding.filter(q => showsTrack(q.trackKind))
              .map(q => q.coordinate.join(','))
          )
        : new Set();
    for (const g of doc.querySelectorAll?.('.roll-row-grid') ?? []) {
      const id = `${g.dataset.a},${g.dataset.b}`;
      rows.set(id, g);
      g.parentElement?.classList.toggle('is-held', heldIds.has(id));
      g.parentElement?.classList.toggle('is-sounding', !heldIds.has(id) && soundingIds.has(id));
    }
    const stepping = ui.stepInput && canEdit() && transport.state !== 'playing',
      at = transport.position(),
      length = stepping ? stepLength(at) : 0;
    let cursor = roll.querySelector?.('.roll-step-cursor');
    if (stepping) {
      if (!cursor && doc.createElement) {
        cursor = doc.createElement('div');
        cursor.className = 'roll-step-cursor';
        cursor.setAttribute('aria-hidden', 'true');
        roll.appendChild(cursor);
      }
      cursor?.style.setProperty('--step-from', String(at / span));
      cursor?.style.setProperty('--step-span', String(length / span));
      cursor?.classList.toggle('is-chords', ui.inputTarget === 'chords');
    } else cursor?.remove?.();
    const want = [];
    if (stepping)
      for (const m of stepGroup.pending)
        want.push({id: `step:${m.join(',')}`, coordinate: m, start: at, length, cls: 'is-pending'});
    if (take)
      take.rec.preview(transport.timeAt()).forEach((n, i) =>
        want.push({
          id: `take:${i}`,
          coordinate: n.coordinate,
          start: n.startTick,
          length: n.durationTick,
          cls: n.open ? 'is-take is-open' : 'is-take'
        })
      );
    const seen = new Set();
    for (const m of want) {
      const row = rows.get(m.coordinate.join(','));
      if (!row) continue;
      let el = marks.get(m.id);
      if (!el && doc.createElement) {
        el = doc.createElement('span');
        el.setAttribute('aria-hidden', 'true');
        marks.set(m.id, el);
      }
      if (!el) continue;
      if (el.parentElement !== row) row.appendChild(el);
      el.className = `roll-mark ${m.cls}`;
      el.style.left = pct(m.start);
      el.style.width = pct(Math.max(1, m.length));
      seen.add(m.id);
    }
    for (const [id, el] of marks)
      if (!seen.has(id)) {
        el.remove?.();
        marks.delete(id);
      }
    const out = doc.querySelector?.('[data-comp-playing]');
    if (out && out.textContent !== playing) out.textContent = playing;
    const record = doc.querySelector?.('[data-comp="record"]');
    record?.classList.toggle('is-recording', !!take);
    const count = transport.countingIn?.(),
      pos = doc.querySelector?.('[data-comp-position]');
    if (pos && count) pos.textContent = `Count-in ${count.beat} / ${count.beats}`;
  }
  // Keeps a tick in view (the step cursor as it moves on).
  function revealTick(tick) {
    const roll = doc.querySelector?.('[data-comp-roll]'),
      scroll = roll?.parentElement;
    if (!roll || !scroll?.clientWidth) return;
    const x = DEGREE_WIDTH + ((roll.offsetWidth - DEGREE_WIDTH) * tick) / Number(roll.dataset.span);
    if (x > scroll.scrollLeft + scroll.clientWidth - 48 || x < scroll.scrollLeft + DEGREE_WIDTH)
      scroll.scrollLeft = Math.max(0, x - DEGREE_WIDTH - 48);
  }

  // ---- playhead: updates text and classes in place; never rebuilds the workspace ----
  function paint() {
    const p = project();
    if (!p) return;
    const tick = transport.position(),
      out = doc.querySelector('[data-comp-position]');
    if (out) out.textContent = formatPosition(p, tick);
    for (const b of doc.querySelectorAll?.('.chord-block') ?? [])
      b.classList.toggle(
        'is-playing',
        Number(b.dataset.start) <= tick && tick < Number(b.dataset.end)
      );
    for (const n of doc.querySelectorAll?.('.roll-note') ?? [])
      n.classList.toggle(
        'is-playing',
        transport.state === 'playing' &&
          Number(n.dataset.start) <= tick &&
          tick < Number(n.dataset.end)
      );
    const roll = doc.querySelector('[data-comp-roll]'),
      playhead = doc.querySelector('[data-comp-playhead]');
    if (roll && playhead) {
      const start = Number(roll.dataset.start),
        span = Number(roll.dataset.span),
        f = (tick - start) / span;
      playhead.hidden = tick < start || tick >= start + span;
      playhead.style.setProperty(
        '--playhead-left',
        `calc(${DEGREE_WIDTH}px + (100% - ${DEGREE_WIDTH}px) * ${f})`
      );
      // While playing, the roll follows the playhead, except during a gesture.
      const scroll = roll.parentElement;
      if (transport.state === 'playing' && scroll?.clientWidth && !input?.dragging) {
        const x = DEGREE_WIDTH + (roll.offsetWidth - DEGREE_WIDTH) * f;
        if (x > scroll.scrollLeft + scroll.clientWidth - 32 || x < scroll.scrollLeft + DEGREE_WIDTH)
          scroll.scrollLeft = Math.max(0, x - DEGREE_WIDTH - 24);
      }
    }
    if (roll) paintInput(roll);
    const sounding = new Set(
      ui.follow && canEdit() && transport.state === 'playing' ? soundingKeys(tick) : []
    );
    for (const entry of held.values()) sounding.add(entry.index);
    for (const key of doc.querySelectorAll?.('[data-comp-key]') ?? [])
      key.classList.toggle('is-playing', sounding.has(Number(key.dataset.compKey)));
  }
  function startLoop() {
    if (frame !== null || !raf) return;
    const step = () => {
      if (transport.state !== 'playing') {
        frame = null;
        paint();
        return;
      }
      paint();
      frame = raf(step);
    };
    frame = raf(step);
  }

  function resetSelection() {
    ui.selectedChord = null;
    ui.selected = new Set();
    ui.menu = null;
  }
  function resetInput() {
    take = null;
    stepGroup.cancel();
    steps = [];
    game.leave();
    ui.mode = 'compose';
  }
  async function loadFigures() {
    try {
      savedFigures = await figurationStore.list('figuration');
      figureLibraryError = '';
    } catch (error) {
      figureLibraryError = error.message;
    }
    refresh();
  }
  function figurePattern() {
    if (!figureEditor) throw Error('Open a figure to draw or generate notes first.');
    const p = project();
    const result = patternFromNotes(
      p.context,
      figureEditor.chord,
      {
        name: figureOptions.name,
        lengthTick: melody().lengthTick,
        events: melody().events
      },
      {cells: boardModel().board?.keys ?? []}
    );
    if (p.figureDraftSeed !== undefined) result.seed = p.figureDraftSeed;
    return result;
  }
  function closeFigure() {
    if (!figureEditor) return;
    transport.stop();
    const previous = figureEditor;
    history = previous.history;
    figureEditor = null;
    resetSelection();
    ui.selectedChord = previous.selectedChord;
    changed();
  }
  function openFigure(pattern = null, localPatternId = null, savedRecord = null) {
    const p = sourceProject();
    const selected = figureEditor?.selectedChord ?? ui.selectedChord;
    const chord =
      p.clips
        .filter(c => p.tracks.find(t => t.id === c.trackId)?.kind === 'chords')
        .flatMap(c => c.events)
        .find(e => e.id === selected) ?? clipOf(p, 'chords').events[0];
    if (!chord) throw Error('Add a reference chord before writing a figure.');
    const draft = createProject({
      name: 'Figure editor',
      context: p.context,
      layout: p.layout,
      tempo: p.tempo,
      meter: p.meter
    });
    draft.tracks[0].mute = true;
    if (pattern?.seed !== undefined) draft.figureDraftSeed = pattern.seed;
    const lengthTick = pattern?.lengthTick ?? barTicks(p.meter);
    for (const c of draft.clips) c.lengthTick = lengthTick;
    const reference = {...structuredClone(chord), startTick: 0, durationTick: lengthTick};
    draft.clips[0].events = [reference];
    if (pattern)
      draft.clips[1].events = patternNotes(p.context, reference, pattern, 'draft', {
        cells: compositionBoard(p).board?.keys ?? []
      });
    if (figureEditor) closeFigure();
    transport.stop();
    figureEditor = {
      history,
      chord: reference,
      selectedChord: chord.id,
      localPatternId,
      savedRecord
    };
    history = createHistory(draft);
    figureOptions.name = pattern?.name ?? 'New figure';
    figureOptions.range = 'board';
    figureOptions.parts = pattern?.events.some(e => e.voice !== undefined)
      ? Math.max(1, ...pattern.events.map(e => (e.voice ?? 0) + 1))
      : 3;
    figureOptions.lowOctave = Math.min(
      0,
      ...(pattern?.events.flatMap(e => e.tones.map(t => t.octaves)) ?? [0])
    );
    figureOptions.highOctave = Math.max(
      0,
      ...(pattern?.events.flatMap(e => e.tones.map(t => t.octaves)) ?? [0])
    );
    resetSelection();
    ui.selectedChord = chord.id;
    ui.mode = 'compose';
    changed();
  }
  function figureTargets(p) {
    const targets = [],
      trackId = trackOf(p, 'melody').id;
    for (const c of p.clips.filter(c => p.tracks.find(t => t.id === c.trackId)?.kind === 'chords'))
      for (const e of c.events) {
        const selected = figureEditor?.selectedChord ?? ui.selectedChord;
        const inLoop = Array.from(
          {length: c.repeat},
          (_, r) => c.startTick + r * c.lengthTick + e.startTick
        ).some(t => t >= p.loop.startTick && t < (p.loop.endTick ?? contentEndTick(p)));
        if (
          figureOptions.scope === 'all' ||
          (figureOptions.scope === 'selected' && e.id === selected) ||
          (figureOptions.scope === 'loop' && inLoop)
        )
          targets.push({chordClipId: c.id, chordEventId: e.id, trackId});
      }
    if (!targets.length) throw Error('Choose at least one chord for the figure.');
    return targets;
  }
  function generateFigure(reroll) {
    if (!figureEditor) openFigure();
    const p = project(),
      lengthTick = melody().lengthTick,
      boundaries = [];
    for (let t = 0; t < lengthTick; t = stepLine(p.meter, grid(), t, 1)) {
      boundaries.push(t);
      if (boundaries.length > 2048) throw Error('Choose a shorter figure or a wider grid.');
    }
    if (
      figureOptions.range === 'manual' &&
      !octaveVector(p.context) &&
      (figureOptions.lowOctave || figureOptions.highOctave)
    )
      throw Error('This overlay has no octave equivalence; choose written register (0).');
    const seed =
      reroll || p.figureDraftSeed === undefined
        ? globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
        : p.figureDraftSeed;
    const cells = boardModel().board?.keys ?? [];
    const pattern = generateTexturePattern({
      ...figureOptions,
      context: p.context,
      chord: figureEditor.chord,
      cells,
      beatTick: beatTicks(p.meter),
      lengthTick,
      boundaries,
      voiceCount: orderedChord(p.context, figureEditor.chord).length,
      rests: figureOptions.rests / 100,
      seed
    });
    const notes = patternNotes(p.context, figureEditor.chord, pattern, `draft-${newId('run')}`, {
      cells
    });
    edit('Generate figure', pr => {
      const next = editEvents(pr, melody().id, {
        remove: melody().events.map(e => e.id),
        put: notes
      });
      next.figureDraftSeed = seed;
      return next;
    });
  }
  async function figureAction(action) {
    if (action === 'figure-new') {
      openFigure();
      return;
    }
    if (action === 'figure-done') {
      closeFigure();
      return;
    }
    if (action === 'figure-generate' || action === 'figure-reroll') {
      generateFigure(action === 'figure-reroll');
      return;
    }
    if (action === 'figure-refresh') {
      await loadFigures();
      return;
    }
    if (action === 'figure-tone') {
      if (!figureEditor) throw Error('Open a figure first.');
      const p = project(),
        selected = selectedEvents();
      const note = {
        id: newId('figure-note'),
        startTick: Math.min(transport.position(), melody().lengthTick - 1),
        durationTick: 1,
        velocity: figureOptions.velocity,
        tones: [{rank: figureOptions.voice, octaves: figureOptions.octave}]
      };
      const coordinate = patternNotes(p.context, figureEditor.chord, {
        version: 1,
        name: figureOptions.name,
        lengthTick: melody().lengthTick,
        events: [note]
      })[0].tones[0].coordinate;
      const references = [{rank: figureOptions.voice, octaves: figureOptions.octave}];
      const put = selected.length
        ? selected.map(e => ({
            ...e,
            tones: [{toneId: e.tones[0].toneId, coordinate}],
            source: {references}
          }))
        : [
            makeEvent(
              {
                ...note,
                durationTick: Math.min(
                  defaultLength(note.startTick),
                  melody().lengthTick - note.startTick
                ),
                tones: [{coordinate}],
                source: {references}
              },
              allIds(p)
            )
          ];
      commitNotes('Set figure tones', {remove: [], put});
      return;
    }
    if (action === 'figure-load') {
      const record = savedFigures.find(p => p.id === figureOptions.saved);
      if (!record) throw Error('Choose a saved figure.');
      openFigure(record.state, null, record);
      return;
    }
    if (action === 'figure-edit') {
      const p = sourceProject(),
        a = p.figuration?.attachments.find(a => a.chordEventId === ui.selectedChord);
      if (!a) throw Error('Select a chord with an attached figure.');
      openFigure(p.figuration.patterns.find(x => x.id === a.patternId).pattern, a.patternId);
      return;
    }
    if (action === 'figure-remove' || action === 'figure-detach') {
      const p = sourceProject(),
        a = p.figuration?.attachments.find(a => a.chordEventId === ui.selectedChord);
      if (a)
        edit(action === 'figure-detach' ? 'Detach figure to notes' : 'Remove figure', pr =>
          removeFiguration(pr, a.id, {detach: action === 'figure-detach'})
        );
      return;
    }
    if (action === 'figure-audition') {
      figurePattern();
      transport.stop();
      await transport.play({untilTick: melody().lengthTick, graceMs: 0});
      return;
    }
    if (action === 'figure-save' || action === 'figure-save-as') {
      const editor = figureEditor,
        pattern = figurePattern(),
        old = action === 'figure-save' ? figureEditor.savedRecord : null;
      const record = await figurationStore.save(
        'figuration',
        old?.id ?? globalThis.crypto.randomUUID(),
        {name: pattern.name, state: pattern, revision: old?.revision ?? 0}
      );
      if (figureEditor === editor) figureEditor.savedRecord = record;
      figureOptions.saved = record.id;
      await loadFigures();
      say(`Saved figure “${record.name}”.`);
      return;
    }
    if (action === 'figure-delete') {
      const record = savedFigures.find(p => p.id === figureOptions.saved);
      if (!record) throw Error('Choose a saved figure.');
      await figurationStore.remove('figuration', record.id, record.revision);
      if (figureEditor?.savedRecord?.id === record.id) figureEditor.savedRecord = null;
      figureOptions.saved = '';
      await loadFigures();
      return;
    }
    if (action === 'figure-export') {
      download(
        `${slug(figureOptions.name)}.figuration.json`,
        JSON.stringify(
          {
            format: figurePattern().version === 2 ? ADAPTIVE_FIGURATION_FORMAT : FIGURATION_FORMAT,
            pattern: figurePattern()
          },
          null,
          2
        ),
        'application/json'
      );
      return;
    }
    if (action === 'figure-import') {
      doc.querySelector('[data-comp-figure-file]')?.click();
      return;
    }
    if (action === 'figure-apply' || action === 'figure-update') {
      const pattern = figurePattern(),
        p = sourceProject(),
        targets = figureTargets(p);
      const next = applyFiguration(p, pattern, targets, {
        patternId: action === 'figure-update' ? figureEditor.localPatternId : null
      });
      const previous = figureEditor;
      closeFigure();
      history.execute('Apply figure', () => next);
      ui.selectedChord = previous.selectedChord;
      ui.boardShow = 'melody';
      game.change('gamePart', {value: 'melody'});
      changed();
    }
  }
  function open(text) {
    try {
      const next = parseProject(text);
      if (figureEditor) closeFigure();
      transport.stop();
      history = createHistory(next);
      if (next.figuration?.attachments.length) ui.boardShow = 'melody';
      resetSelection();
      resetInput();
      cache = null;
      message = '';
      refresh();
      notify(`Opened “${next.name}”.`);
    } catch (error) {
      say(error.message);
    }
  }

  function newProject() {
    try {
      if (figureEditor) closeFigure();
      const state = getState(),
        context = captureContext(state, getTonic());
      transport.stop();
      history = createHistory(
        createProject({
          name: `${state.name} composition`.slice(0, LIMITS.nameMax),
          context,
          layout: getLayout()
        })
      );
      resetSelection();
      resetInput();
      cache = null;
      message = '';
      refresh();
    } catch (error) {
      say(error.message);
    }
  }

  const find = (clip, id) => clip.events.find(e => e.id === id);
  const q = Number;

  function chordAction(action, el) {
    if (figureEditor && !['chord-select', 'chord-hear'].includes(action)) {
      say('Return to the composition to edit the reference harmony.');
      return;
    }
    const p = project(),
      clip = chordOwner(p, el.dataset.event) ?? clipOf(p, 'chords'),
      id = el.dataset.event,
      e = id ? find(clip, id) : null,
      end = e ? e.startTick + e.durationTick : 0;
    switch (action) {
      case 'chord-select':
        ui.selectedChord = id;
        if (e) onChordFocus(e.tones.map(tone => [...tone.coordinate]));
        refresh();
        return;
      case 'chord-invert': {
        if (!e) return;
        const low = e.tones.reduce((a, b) =>
          resolveTone(p.context, a.coordinate).cents <= resolveTone(p.context, b.coordinate).cents
            ? a
            : b
        );
        edit('Raise lowest chord note', pr => {
          const next = updateEvent(pr, clip.id, id, {
            tones: e.tones.map(t =>
              t.toneId === low.toneId
                ? {...t, coordinate: [t.coordinate[0] + 1, t.coordinate[1]]}
                : t
            )
          });
          const moved = next.clips.find(c => c.id === clip.id).events.find(x => x.id === id);
          // The source remains provenance; describe an edited voicing without inventing a JI identity.
          moved.source = {
            ...moved.source,
            label: `${e.source?.label ?? 'Chord'} · raised lowest voice`
          };
          return next;
        });
        return;
      }
      case 'chord-hear':
        audio.previewChord(centsOf(p, e));
        return;
      case 'chord-add':
      case 'chord-add-focus': {
        const list = getMaterial().filter(i => i.kind === 'chord');
        const item = action === 'chord-add-focus' ? getFocusedChord() : list[ui.collection];
        if (!item) {
          say(
            action === 'chord-add-focus'
              ? 'Select a chord in Discover first.'
              : 'Choose a collected chord first.'
          );
          return;
        }
        const start = Math.max(0, ...clip.events.map(x => x.startTick + x.durationTick));
        let newId = null;
        const ok = edit('Add chord', pr => {
          const ev = makeEvent(
            materialToChordEvent(pr.context, item, {
              startTick: start,
              durationTick: ui.addLength * PPQ,
              velocity: 90
            }),
            allIds(pr)
          );
          newId = ev.id;
          return addEvent(pr, clip.id, ev);
        });
        if (ok) {
          ui.selectedChord = newId;
          refresh();
        }
        return;
      }
      case 'chord-earlier':
        edit('Move chord earlier', pr => swapAdjacent(pr, clip.id, id, -1));
        return;
      case 'chord-later':
        edit('Move chord later', pr => swapAdjacent(pr, clip.id, id, 1));
        return;
      case 'chord-duplicate':
        edit('Duplicate chord', pr =>
          duplicateEvent(insertGap(pr, clip.id, end, e.durationTick), clip.id, id, end)
        );
        return;
      case 'chord-rest':
        edit('Insert rest', pr => insertGap(pr, clip.id, end, PPQ));
        return;
      case 'chord-delete':
        if (edit('Delete chord', pr => removeEvent(pr, clip.id, id)) && ui.selectedChord === id) {
          ui.selectedChord = null;
          refresh();
        }
        return;
    }
  }

  function melodyAction(action, el) {
    const p = project(),
      clip = melody();
    if (action === 'note-select') {
      select([el.dataset.event], 'replace');
      return;
    }
    if (action === 'note-hear') {
      const e = find(clip, el.dataset.event);
      if (e) audio.previewChord(centsOf(p, e));
      return;
    }
    if (action === 'note-cell') {
      if (!canEdit()) return;
      const tick = q(el.dataset.tick),
        coordinate = [q(el.dataset.a), q(el.dataset.b)];
      const same = clip.events.find(
        e =>
          e.startTick === tick &&
          e.tones.length === 1 &&
          e.tones[0].coordinate[0] === coordinate[0] &&
          e.tones[0].coordinate[1] === coordinate[1]
      );
      if (same) commitNotes('Remove note', {remove: [same.id], put: []}, {select: false});
      else if (addNote(tick, coordinate, defaultLength(tick))) audition([coordinate]);
      return;
    }
    if (action === 'note-delete') {
      commitNotes('Delete note', {remove: [el.dataset.event], put: []}, {select: false});
      return;
    }
  }

  // Edit and Rhythm menu actions, also reached from the keyboard. They act on the selected melody notes.
  function selectionAction(action, el = {dataset: {}}) {
    const p = project(),
      evs = selectedEvents(),
      many = evs.length > 1,
      s = many ? 's' : '';
    if (action === 'sel-all') {
      ui.selected = new Set(melody().events.map(e => e.id));
      refresh();
      return;
    }
    if (action === 'sel-paste') {
      if (!clipboard) {
        say('Copy notes first.');
        return;
      }
      const at = snapTick(p.meter, grid(), transport.position());
      if (
        commitNotes('Paste notes', pasteEvents(clipboard, at, allIds(p))) &&
        transport.state !== 'playing'
      )
        void transport.seek(at + clipboard.span).then(paint);
      return;
    }
    if (action === 'rhythm-euclid') {
      const plan = euclidPlan(),
        r = ui.rhythm;
      const result = euclidEvents(
        {
          k: r.k,
          n: r.n,
          rotation: r.rotate,
          startTick: plan.start,
          endTick: plan.end,
          coordinate: plan.coordinate,
          velocity: plan.velocity,
          gate: r.gate / 100
        },
        allIds(p)
      );
      if (!result.put.length) {
        say('That pattern has no hits.');
        return;
      }
      commitNotes(`Euclidean ${r.k} in ${r.n}`, {remove: plan.replace, put: result.put});
      return;
    }
    if (!evs.length) {
      say(
        'Select notes first: drag a box with the Select tool, Shift-click notes, or press Ctrl+A.'
      );
      return;
    }
    const span = {
      start: Math.min(...evs.map(e => e.startTick)),
      end: Math.max(...evs.map(e => e.startTick + e.durationTick))
    };
    const strength = (ui.rhythm.strength ?? 100) / 100;
    switch (action) {
      case 'sel-delete':
        commitNotes(`Delete note${s}`, {remove: evs.map(e => e.id), put: []}, {select: false});
        return;
      case 'sel-copy':
        clipboard = copyEvents(evs);
        say(`Copied ${evs.length} note${s}. Paste moves them to the playhead.`);
        return;
      case 'sel-cut':
        clipboard = copyEvents(evs);
        commitNotes(`Cut note${s}`, {remove: evs.map(e => e.id), put: []}, {select: false});
        return;
      case 'sel-duplicate': {
        const c = copyEvents(evs);
        commitNotes(`Duplicate note${s}`, pasteEvents(c, span.start + c.span, allIds(p)));
        return;
      }
      case 'sel-quantize':
      case 'sel-quantize-ends':
        commitNotes(
          `Quantize note${s}`,
          quantizeEvents(p.meter, grid(), evs, {ends: action === 'sel-quantize-ends', strength})
        );
        return;
      case 'sel-legato':
        commitNotes('Legato', legatoEvents(evs));
        return;
      case 'sel-reverse':
        commitNotes('Retrograde', reverseEvents(evs));
        return;
      case 'sel-step-up':
      case 'sel-step-down':
      case 'sel-period-up':
      case 'sel-period-down': {
        const dir = action.endsWith('up') ? 1 : -1,
          result = transposeEvents(
            p.context,
            evs,
            action.startsWith('sel-step') ? {steps: dir} : {periods: dir}
          );
        if (commitNotes(`Transpose note${s}`, result))
          audition(
            [...new Set(result.put.map(e => e.tones[0].coordinate.join(',')))]
              .slice(0, 4)
              .map(k => k.split(',').map(Number))
          );
        return;
      }
      case 'sel-split': {
        const n = intIn(el.dataset.n ?? ui.rhythm.split, 2, 32, 3);
        commitNotes(`Split into ${n}`, splitEvents(evs, n, allIds(p)));
        return;
      }
      case 'sel-fit': {
        const n = intIn(el.dataset.n ?? ui.rhythm.fitN, 1, 32, 3),
          m = intIn(el.dataset.m ?? ui.rhythm.fitM, 1, 32, 2);
        commitNotes(`Fit ${n} in the time of ${m}`, scaleEvents(evs, m, n));
        return;
      }
      case 'sel-hear':
        audio.previewSequence?.(
          [...evs].sort((a, b) => a.startTick - b.startTick).map(e => centsOf(p, e)[0])
        );
        return;
    }
  }
  function nudge(dt) {
    const evs = selectedEvents();
    if (evs.length)
      commitNotes(evs.length > 1 ? 'Move notes' : 'Move melody note', shiftEvents(evs, dt));
  }
  function nudgeGrid(dir) {
    const evs = selectedEvents();
    if (!evs.length) return;
    const first = Math.min(...evs.map(e => e.startTick));
    nudge(stepLine(project().meter, grid(), first, dir) - first);
  }

  function closeMenus(except = null) {
    for (const m of doc.querySelectorAll?.('[data-comp-menu][open]') ?? [])
      if (m !== except) m.open = false;
  }
  function click(target) {
    // Toolbar menus stay open across rebuilds; the summary's own toggle opens and closes them.
    const summary = target?.closest?.('[data-comp-menu] > summary');
    const menu = summary?.parentElement;
    if (menu?.dataset?.compMenu !== undefined) {
      ui.menu = menu.open ? null : menu.dataset.compMenu;
      closeMenus(menu);
      return true;
    }
    if (ui.menu && !target?.closest?.('[data-comp-menu]')) {
      ui.menu = null;
      closeMenus();
    }
    const el = target?.closest?.('[data-comp]');
    if (!el) return false;
    const action = el.dataset.comp;
    if (suppressClick) {
      suppressClick = false;
      return true;
    }
    try {
      if (action.startsWith('figure-')) {
        if (canEdit()) void figureAction(action).catch(error => say(error.message));
        return true;
      }
      switch (action) {
        case 'new':
          newProject();
          return true;
        case 'open':
          doc.querySelector('[data-comp-file]')?.click();
          return true;
      }
      const p = project();
      if (!p) return true;
      const shared = [
        'save',
        'close',
        'load-context',
        'mode-compose',
        'mode-game',
        'export-targets'
      ];
      if (!canEdit() && !shared.includes(action) && !action.startsWith('game-')) return true;
      switch (action) {
        case 'save':
          download(
            `${slug(sourceProject().name)}.composition.json`,
            serializeProject(sourceProject()),
            'application/json'
          );
          return true;
        case 'close':
          if (figureEditor) closeFigure();
          transport.stop();
          history = null;
          resetSelection();
          resetInput();
          cache = null;
          message = '';
          refresh();
          return true;
        case 'undo':
          history.undo();
          changed();
          return true;
        case 'redo':
          history.redo();
          changed();
          return true;
        case 'load-context':
          loadState(structuredClone(p.context.state));
          return true;
        case 'mode-compose':
        case 'mode-game': {
          if (figureEditor) {
            say('Apply the figure or return to the composition before practicing.');
            return true;
          }
          const next = action.slice(5);
          if (next === ui.mode) {
            refresh();
            return true;
          }
          if (ui.mode === 'game') game.leave();
          if (take) endTake();
          releaseHeld();
          if (next === 'game') transport.stop();
          else transport.pause();
          ui.mode = next;
          stepGroup.cancel();
          refresh();
          return true;
        }
        case 'tool-draw':
        case 'tool-select':
          ui.tool = action === 'tool-select' ? 'select' : 'draw';
          refresh();
          return true;
        case 'snap':
          ui.grid = {...grid(), snap: !grid().snap};
          refresh();
          return true;
        case 'velocity-lane':
          ui.velocityLane = !ui.velocityLane;
          refresh();
          return true;
        case 'zoom-in':
          zoomTo(ui.zoom * 1.25);
          return true;
        case 'zoom-out':
          zoomTo(ui.zoom / 1.25);
          return true;
        case 'zoom-fit':
          zoomFit();
          return true;
        case 'rows-more':
          rowsBy(4);
          return true;
        case 'rows-less':
          rowsBy(-4);
          return true;
        case 'row-hear': {
          const m = [q(el.dataset.a), q(el.dataset.b)];
          ui.lastRow = m;
          audition([m]);
          return true;
        }
        case 'root-block': {
          const e = chordOwner(project(), el.dataset.event)?.events.find(
            e => e.id === el.dataset.event
          );
          if (!e || !canEdit()) return true;
          const root = chordRoot(project(), e);
          ui.selectedChord = e.id;
          ui.rootPick = {
            tick: e.startTick,
            replace: e.id,
            degree: root?.degree ?? null,
            all: false
          };
          onChordFocus(e.tones.map(t => [...t.coordinate]));
          refresh();
          return true;
        }
        case 'root-degree':
          if (ui.rootPick) {
            const d = Number(el.dataset.degree);
            if (Number.isInteger(d) && d >= 0 && d < project().context.scale.degrees.length) {
              ui.rootPick = {...ui.rootPick, degree: d, all: false};
            }
          }
          refresh();
          return true;
        case 'root-harmony':
          pickHarmony(Number(el.dataset.index));
          return true;
        case 'root-more':
          if (ui.rootPick) ui.rootPick = {...ui.rootPick, all: !ui.rootPick.all};
          refresh();
          return true;
        case 'root-cancel':
          ui.rootPick = null;
          refresh();
          return true;
        case 'board-show':
          if (BOARD_SHOW.includes(el.dataset.value)) ui.boardShow = el.dataset.value;
          refresh();
          return true;
        case 'buttons-auto':
          automaticButtons(false);
          return true;
        case 'buttons-reset':
          automaticButtons(true);
          return true;
        case 'seek':
          void transport.seek(Number(el.dataset.tick)).then(refresh);
          return true;
        case 'play':
          startPlayback();
          return true;
        case 'record':
          toggleRecord();
          return true;
        case 'input-target':
          if (['melody', 'chords'].includes(el.dataset.value)) {
            ui.inputTarget = el.dataset.value;
            stepGroup.cancel();
          }
          refresh();
          return true;
        case 'step-input':
          ui.stepInput = !ui.stepInput;
          stepGroup.cancel();
          if (ui.stepInput) startStepping();
          refresh();
          return true;
        case 'step-rest':
          stepRest();
          return true;
        case 'step-tie':
          stepTie();
          return true;
        case 'step-back':
          stepBack();
          return true;
        case 'pause':
          transport.pause();
          refresh();
          return true;
        case 'stop':
          transport.stop();
          refresh();
          return true;
        case 'export-targets':
          download(
            `${slug(p.name)}.practice-targets.json`,
            JSON.stringify(
              toPracticeTargets(p, boardSnapshot(p), {matchMode: ui.matchMode}),
              null,
              2
            ),
            'application/json'
          );
          return true;
      }
      if (action.startsWith('game-')) {
        if (ui.mode === 'game') game.click(action, el);
        return true;
      }
      if (action.startsWith('sel-') || action.startsWith('rhythm-')) {
        if (canEdit()) selectionAction(action, el);
      } else if (action.startsWith('chord-')) chordAction(action, el);
      else melodyAction(action, el);
    } catch (error) {
      say(error.message);
    }
    return true;
  }

  // Space plays and pauses anywhere in Compose. The roll's editing keys work while focus is in the
  // timeline or on nothing in particular, never inside a field.
  function keydown(event, active = false) {
    if (!active || !project() || event.defaultPrevented) return false;
    const target = event.target;
    if (
      target?.isContentEditable ||
      target?.closest?.(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'
      )
    )
      return false;
    const mod = event.ctrlKey || event.metaKey,
      key = event.key;
    if (ui.mode === 'game') return !mod && !event.altKey && game.keydown(event);
    if (event.code === 'Space' || key === ' ') {
      if (mod || event.altKey) return false;
      event.preventDefault();
      // Holding Space must not repeatedly switch the transport or scroll the page.
      if (event.repeat) return true;
      if (transport.state === 'playing') {
        transport.pause();
        refresh();
      } else startPlayback();
      return true;
    }
    const inRoll =
      !target ||
      target === doc.body ||
      target === doc.documentElement ||
      !!target.closest?.('.composition-timeline');
    if (!inRoll || event.altKey) return false;
    const done = fn => {
      event.preventDefault();
      fn();
      return true;
    };
    const k = key.length === 1 ? key.toLowerCase() : key,
      some = ui.selected.size > 0,
      editing = canEdit();
    if (mod) {
      if (k === 'z')
        return done(() => {
          event.shiftKey ? history.redo() : history.undo();
          changed();
        });
      if (k === 'y')
        return done(() => {
          history.redo();
          changed();
        });
      if (!editing) return false;
      if (k === 'a') return done(() => selectionAction('sel-all'));
      if (k === 'c' && some) return done(() => selectionAction('sel-copy'));
      if (k === 'x' && some) return done(() => selectionAction('sel-cut'));
      if (k === 'v' && clipboard) return done(() => selectionAction('sel-paste'));
      if (k === 'd' && some) return done(() => selectionAction('sel-duplicate'));
      if ((k === 'ArrowLeft' || k === 'ArrowRight') && some)
        return done(() => nudge(k === 'ArrowLeft' ? -10 : 10));
      return false;
    }
    if (k === 'Escape') {
      stepGroup.cancel();
      if (some || ui.menu) {
        ui.menu = null;
        closeMenus();
        select([], 'replace');
      }
      return false;
    }
    if (!editing) return false;
    if (k === 'r' && !event.shiftKey) return done(toggleRecord);
    if (ui.stepInput && !some && transport.state !== 'playing') {
      if (k === 'ArrowRight') return done(stepRest);
      if (k === 'ArrowLeft') return done(() => moveCursor(stepBefore(transport.position())));
      if (k === 'Backspace' || k === 'Delete') return done(stepBack);
    }
    if ((k === 'Delete' || k === 'Backspace') && some)
      return done(() => selectionAction('sel-delete'));
    if ((k === 'ArrowLeft' || k === 'ArrowRight') && some)
      return done(() =>
        event.shiftKey
          ? nudge((k === 'ArrowLeft' ? -1 : 1) * barTicks(project().meter))
          : nudgeGrid(k === 'ArrowLeft' ? -1 : 1)
      );
    if ((k === 'ArrowUp' || k === 'ArrowDown') && some)
      return done(() =>
        selectionAction(
          `sel-${event.shiftKey ? 'period' : 'step'}-${k === 'ArrowUp' ? 'up' : 'down'}`
        )
      );
    if (event.shiftKey) return false;
    if (k === 'q' && some) return done(() => selectionAction('sel-quantize'));
    if (k === 'b' || k === 'v')
      return done(() => {
        ui.tool = k === 'v' ? 'select' : 'draw';
        refresh();
      });
    if (k === '=' || k === '+') return done(() => zoomTo(ui.zoom * 1.25));
    if (k === '-') return done(() => zoomTo(ui.zoom / 1.25));
    return false;
  }

  // The board's keys play through the shared HexBoard player, as on Play: hold, glide and Shift sustain.
  // `held` holds the sounding keys by key id, for the screen and the physical board.
  const held = new Map(),
    silent = () => {};
  const keyPlayer = createHexboardPlayer({
    document: doc,
    window: win,
    selector: '[data-comp-key]',
    keyField: 'compKey',
    surface: '.composition-board',
    keyboard: true,
    press: node => {
      const k = project() ? boardModel().board?.keys[Number(node.dataset.compKey)] : null;
      return k && !k.command ? k : null;
    },
    startVoice: cents => audio.startVoice?.(cents) ?? silent,
    onInput: event => hexInput(event),
    onActiveNotesChange: notes => {
      held.clear();
      for (const note of notes)
        held.set(note.id, {index: Number(note.id), coordinate: note.coordinate, cents: note.cents});
      playing = playingText();
      paint();
    }
  });
  // Roll gestures: each finished drag commits one undoable edit; pointer cancellation leaves the project untouched.
  input = createRollInput({
    document: doc,
    ctl: {
      project,
      ui,
      clip: kind => (kind === 'melody' ? melody() : clipOf(project(), kind)),
      commit: edit,
      commitNotes,
      select,
      refresh,
      addNote,
      defaultLength,
      rowName,
      audition,
      canEdit,
      canEditChord: () => !figureEditor,
      chordOwner: id => chordOwner(project(), id),
      seek: tick => {
        void transport.seek(tick).then(paint);
      },
      setLoop: (start, end) =>
        edit('Set loop', pr => setLoop(pr, {enabled: true, startTick: start, endTick: end})),
      hover: text => {
        const out = doc.querySelector?.('[data-comp-hover]');
        if (out && out.textContent !== text) out.textContent = text;
      },
      suppressClick: () => {
        suppressClick = true;
        setTimeout(() => {
          suppressClick = false;
        }, 0);
      },
      frame: fn => (raf ? raf(fn) : fn()),
      zoomBy: (factor, x) => zoomTo(ui.zoom * factor, x),
      rowsBy
    }
  });
  const releaseHeld = () => keyPlayer.reset();
  const tickIn = (event, el) => {
    const grid = el.closest('.roll-row-grid') ?? el.parentElement,
      roll = el.closest('[data-comp-roll]'),
      r = grid.getBoundingClientRect(),
      span = Number(roll.dataset.span);
    return Math.max(0, Math.min(span - 1, ((event.clientX - r.left) / r.width) * span));
  };
  function surfaceClick(event) {
    const lane = event.target.closest?.('.roll-root-surface');
    if (lane && project() && canEdit()) {
      const tick = snapTick(project().meter, {...grid(), snap: true}, tickIn(event, lane), 'floor');
      ui.rootPick = {tick, replace: null, degree: ui.rootPick?.degree ?? null, all: false};
      refresh();
      return;
    }
    // A pointer draws on pointerdown; Enter on a focused row adds a note at the playhead.
    const surface = event.target.closest?.('.roll-surface');
    if (surface && project() && canEdit() && event.detail === 0) {
      const at = snapTick(project().meter, grid(), transport.position(), 'floor'),
        m = [q(surface.dataset.a), q(surface.dataset.b)];
      if (addNote(at, m, defaultLength(at))) audition([m]);
    }
  }
  doc.addEventListener?.('click', surfaceClick);
  function doubleClick(event) {
    if (!project() || !canEdit()) return;
    const note = event.target?.closest?.('.roll-note');
    if (note && !note.closest?.('[hidden]')) {
      if (
        !find(clipOf(project(), 'melody'), note.dataset.event) ||
        (note.dataset.event === drawn.id && Date.now() - drawn.at < 800)
      )
        return;
      event.preventDefault();
      melodyAction('note-delete', note);
      return;
    }
    // With the Select tool, double-clicking an empty spot adds a note there.
    const surface = event.target?.closest?.('.roll-surface');
    if (surface && ui.tool === 'select') {
      const m = [q(surface.dataset.a), q(surface.dataset.b)],
        at = snapTick(project().meter, grid(), tickIn(event, surface), 'floor');
      if (addNote(at, m, defaultLength(at))) audition([m]);
    }
  }
  doc.addEventListener?.('dblclick', doubleClick);
  doc.addEventListener?.('pointerdown', input.pointerDown);
  doc.addEventListener?.('pointermove', input.pointerMove);
  doc.addEventListener?.('pointerup', input.pointerUp);
  doc.addEventListener?.('pointercancel', input.pointerUp);
  doc.addEventListener?.('wheel', input.wheel, {passive: false});

  function change(el) {
    if (el.dataset?.compFigureFile !== undefined) {
      const file = el.files?.[0];
      if (file)
        void (async () => {
          if (file.size > LIMITS.bytesMax) throw Error('That figure file is too large.');
          const data = JSON.parse(await file.text());
          if (![FIGURATION_FORMAT, ADAPTIVE_FIGURATION_FORMAT].includes(data.format))
            throw Error('Choose a Temperament Lab figuration file.');
          validatePattern(data.pattern);
          openFigure(data.pattern);
        })().catch(error => say(error.message));
      el.value = '';
      return true;
    }
    if (el.dataset?.compFile !== undefined) {
      const file = el.files?.[0];
      if (file) {
        if (file.size > LIMITS.bytesMax) say(`That file is larger than ${LIMITS.bytesMax} bytes.`);
        else void file.text().then(open, error => say(error.message));
      }
      el.value = '';
      return true;
    }
    const field = el.dataset?.compField;
    if (field === undefined) return false;
    if (field.startsWith('game')) return ui.mode === 'game' && game.change(field, el);
    if (!canEdit() && field !== 'matchMode') return true;
    const p = project(),
      value = el.value,
      r = ui.rhythm;
    const preview = () => {
      const out = doc.querySelector?.('[data-comp-euclid-preview]');
      if (out) out.textContent = euclidPreview();
    };
    try {
      if (field.startsWith('figure')) {
        const key = field.slice(6);
        if (
          key === 'name' ||
          key === 'contour' ||
          key === 'scope' ||
          key === 'saved' ||
          key === 'range'
        )
          figureOptions[key] = value;
        else if (key === 'length' && figureEditor)
          edit('Figure length', pr => {
            const lengthTick = Math.round(Number(value) * PPQ),
              reference = clipOf(pr, 'chords');
            if (!Number.isSafeInteger(lengthTick) || lengthTick < 1 || lengthTick > PPQ * 128)
              throw Error('Use a cycle between one tick and 128 quarter notes.');
            let next = updateEvent(pr, reference.id, reference.events[0].id, {
              durationTick: lengthTick
            });
            for (const c of next.clips) next = setClipLength(next, c.id, lengthTick);
            return next;
          });
        else if (key === 'lowOctave' || key === 'highOctave' || key === 'octave')
          figureOptions[key] = intIn(value, -8, 8, 0);
        else if (key === 'voice') figureOptions.voice = intIn(value, 1, 8, 1);
        else if (key === 'parts') figureOptions.parts = intIn(value, 1, 4, 3);
        else if (key === 'rests') figureOptions.rests = intIn(value, 0, 100, 0);
        else if (key === 'velocity') figureOptions.velocity = intIn(value, 1, 127, 90);
        refresh();
        return true;
      }
      switch (field) {
        case 'soundHarmony':
          edit('Sound harmony', pr => setSoundHarmony(pr, el.checked));
          return true;
        case 'collection':
          ui.collection = Number(value) || 0;
          return true;
        case 'noteDuration':
          ui.noteDuration = value === 'grid' ? 'grid' : Number(value) || 'grid';
          return true;
        case 'registers':
          if (REGISTER_CHOICES.some(r => r[0] === value)) ui.registers = value;
          refresh();
          return true;
        case 'follow':
          ui.follow = !!el.checked;
          refresh();
          return true;
        case 'boardLabels':
          ui.boardLabels = !!el.checked;
          refresh();
          return true;
        case 'chooseButtons':
          ui.chooseButtons = !!el.checked;
          refresh();
          return true;
        case 'matchMode':
          if (MATCH_MODES.includes(value)) ui.matchMode = value;
          return true;
        case 'gridDivision':
          ui.grid = normalizeGrid({...ui.grid, division: Number(value)});
          refresh();
          return true;
        case 'gridFeel':
          ui.grid = normalizeGrid({...ui.grid, feel: value});
          refresh();
          return true;
        case 'gridN':
        case 'gridM':
          ui.grid = normalizeGrid({...ui.grid, [field === 'gridN' ? 'n' : 'm']: Number(value)});
          refresh();
          return true;
        case 'gridSwing':
          ui.grid = normalizeGrid({...ui.grid, swing: Number(value)});
          refresh();
          return true;
        // Menu fields change no project data; buttons read them when pressed.
        case 'quantizeStrength':
          r.strength = intIn(value, 1, 100, 100);
          return true;
        case 'splitN':
          r.split = intIn(value, 2, 32, r.split);
          return true;
        case 'fitN':
          r.fitN = intIn(value, 1, 32, r.fitN);
          return true;
        case 'fitM':
          r.fitM = intIn(value, 1, 32, r.fitM);
          return true;
        case 'euclidK':
          r.k = intIn(value, 0, 64, r.k);
          preview();
          return true;
        case 'euclidN':
          r.n = intIn(value, 1, 64, r.n);
          preview();
          return true;
        case 'euclidRotate':
          r.rotate = intIn(value, -64, 64, r.rotate);
          preview();
          return true;
        case 'euclidGate':
          r.gate = intIn(value, 5, 100, r.gate);
          return true;
        case 'countIn':
          ui.countIn = intIn(value, 0, 2, 1);
          return true;
        case 'click':
          ui.click = !!el.checked;
          transport.invalidate();
          refresh();
          return true;
        case 'chordStep':
        case 'addLength': {
          ui.addLength = Number(value) || 4;
          for (const other of doc.querySelectorAll?.(
            '[data-comp-field="addLength"],[data-comp-field="chordStep"]'
          ) ?? [])
            if (other !== el) other.value = String(ui.addLength);
          paint();
          return true;
        }
      }
      if (!p) return true;
      const clip = chordOwner(p, el.dataset.event) ?? clipOf(p, 'chords');
      switch (field) {
        case 'bars':
          edit('Set project bars', pr => setProjectBars(pr, Number(value)));
          break;
        case 'name':
          edit('Rename', pr => setName(pr, value));
          break;
        case 'tempo':
          edit('Set tempo', pr => setTempo(pr, Number(value)));
          break;
        case 'loop':
          edit('Toggle loop', pr =>
            setLoop(pr, {
              enabled: !!el.checked,
              startTick: pr.loop.startTick,
              endTick: pr.loop.endTick
            })
          );
          break;
        case 'meterNum':
        case 'meterDen': {
          const num = Number(doc.querySelector('[data-comp-field=meterNum]')?.value),
            den = Number(doc.querySelector('[data-comp-field=meterDen]')?.value);
          edit('Set meter', pr => setMeter(pr, {numerator: num, denominator: den}));
          break;
        }
        case 'meterGroups': {
          const groups = parseGroups(value, p.meter.numerator);
          edit('Set beat groups', pr => setMeter(pr, {...pr.meter, groups}));
          break;
        }
        case 'chordLength': {
          const e = find(clip, el.dataset.event),
            ticks = Math.round(Number(value) * PPQ),
            delta = ticks - e.durationTick,
            end = e.startTick + e.durationTick;
          edit('Chord length', pr => {
            const n = updateEvent(pr, clip.id, e.id, {durationTick: ticks});
            return delta > 0 ? insertGap(n, clip.id, end, delta) : n;
          });
          break;
        }
        case 'noteLength':
          commitNotes('Note length', {
            remove: [],
            put: melody()
              .events.filter(e => e.id === el.dataset.event)
              .map(e => ({...e, durationTick: Math.round(Number(value))}))
          });
          break;
        case 'noteVelocity':
          commitNotes('Note velocity', {
            remove: [],
            put: melody()
              .events.filter(e => e.id === el.dataset.event)
              .map(e => ({...e, velocity: Math.round(Number(value))}))
          });
          break;
        case 'selLength': {
          const ticks = Math.round(Number(value));
          if (ticks > 0)
            commitNotes('Note lengths', {
              remove: [],
              put: selectedEvents().map(e => ({...e, durationTick: ticks}))
            });
          break;
        }
        case 'selVelocity':
          if (value !== '')
            commitNotes(
              'Note velocities',
              velocityEvents(selectedEvents(), {value: Number(value)})
            );
          break;
        default:
          return false;
      }
    } catch (error) {
      say(error.message);
    }
    return true;
  }

  void loadFigures();
  return {
    render,
    click,
    change,
    keydown,
    input: () => false,
    refresh,
    /** The open project for a whole-app session save, or null. */
    serialize: sourceProject,
    /** Restores a saved project (validated atomically) or closes the current one with `null`. */
    restore(data) {
      const restored = data ? parseProject(data) : null;
      if (figureEditor) closeFigure();
      transport.stop();
      if (!data) {
        history = null;
        cache = null;
        message = '';
        resetSelection();
        resetInput();
        return;
      }
      history = createHistory(restored);
      if (project().figuration?.attachments.length) ui.boardShow = 'melody';
      cache = null;
      message = '';
      resetSelection();
      resetInput();
    },
    get open() {
      return history !== null;
    },
    pause() {
      if (ui.mode === 'game') {
        game.pause();
        return;
      }
      if (transport.state === 'playing') {
        transport.pause();
        refresh();
      }
      stepGroup.cancel();
      releaseHeld();
      audio.cancelGroup?.('preview');
    },
    stop() {
      if (ui.mode === 'game') {
        game.quit();
        return;
      }
      releaseHeld();
      if (transport.state !== 'stopped') {
        transport.stop();
        refresh();
      } else paint();
    },
    dispose() {
      clearTimeout(rootRetry);
      rootRetry = null;
      game.leave();
      transport.stop();
      keyPlayer.destroy();
      doc.removeEventListener?.('click', surfaceClick);
      doc.removeEventListener?.('dblclick', doubleClick);
      doc.removeEventListener?.('pointerdown', input.pointerDown);
      doc.removeEventListener?.('pointermove', input.pointerMove);
      doc.removeEventListener?.('pointerup', input.pointerUp);
      doc.removeEventListener?.('pointercancel', input.pointerUp);
      doc.removeEventListener?.('wheel', input.wheel, {passive: false});
    },
    // Test and integration hooks.
    getProject: project,
    figureAction,
    figurePattern,
    loadFigures,
    transport,
    timeline,
    paint,
    deviceSnapshot,
    game,
    // A physical HexBoard key plays as a press on its on-screen key; false when the board is not shown.
    pressKey: (index, t) => keyPlayer.pressKey(String(index), t),
    releaseKey: (index, t) => keyPlayer.releaseKey(String(index), t),
    voiceSettings: () => undefined
  };
}
