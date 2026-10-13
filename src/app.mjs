import {
  parsePrimeFilterInput,
  DEFAULT_ODD_LIMIT,
  primeFilterForBasis,
  validateJILimits
} from './core/ji-limit-engine.mjs';
import {createDiamondWorkspace} from './diamond/diamond-workspace.mjs';
import {fitDiamondChord} from './diamond/diamond-layout.mjs';
import {createFocusSync} from './app/focus-sync.mjs';
import {createHarmonicCatalogueWorkspace} from './harmonic/harmonic-catalogue-ui.mjs';
import {
  syncUnifiedPanelHeights,
  renderUnified,
  unifiedDirectory,
  unifiedDetail,
  unifiedCenterView,
  normalizeUnifiedCenter
} from './ui/discover-unified.mjs';
import {withDefaultScale} from './core/default-scale.mjs';
import {linkScaleDegree} from './ui/scale-view.mjs';
import {fixed as fmt, signedFixed as sign} from './ui/ui.mjs';
import {allTargets, spanControl, renderMatrix} from './app/matrix-view.mjs';
import {fillDiamondDetails as showDiamondDetails} from './app/diamond-details.mjs';
import {createJISettings, clampTolerance} from './app/ji-settings.mjs';
import {sessionFile, readSession, MAX_SESSION_BYTES} from './app/session.mjs';
import {createTuningPanel} from './app/tuning-panel.mjs';
import {createScalePane} from './app/scale-pane.mjs';
import {createAudioEngine} from './ui/audio.mjs';
import {createCompositionWorkspace} from './composition/composition-ui.mjs';
import {createHexboardDevice} from './hexboard/hexboard-device.mjs';
import {createHexboardSync, clampBrightness} from './hexboard/hexboard-sync.mjs';
import {createFingeringGame} from './composition/fingering-game.mjs';
import {createFingeringGameUi} from './composition/fingering-game-ui.mjs';
import {createKeyHarmoniesUi} from './hexboard/key-harmonies-ui.mjs';
import {renderDiamondTolerance} from './diamond/tonality-diamond.mjs';
import {createHexboardPlayer} from './hexboard/hexboard-player.mjs';
import {createLiveChordRecognizer} from './chords/live-chord-recognition.mjs';
import {createMaterialWorkspace} from './ui/material-ui.mjs';
import {createPresetWorkspace} from './presets/preset-ui.mjs';
import {browserPresetStore} from './presets/preset-store.mjs';
import {validateState as validate} from './core/state.mjs';
import {createHexboardWorkspace} from './hexboard/hexboard-ui.mjs';
import {matrixScale, matrixInterval} from './core/matrix.mjs';
import {createCommaWorkspace} from './ui/comma-ui.mjs';
import {createChordWorkspace} from './ui/chord-ui.mjs';
import {classifyTargets, fitGeneratedScale} from './core/engine.mjs';
import {makeState} from './core/catalog.mjs';
import {scaleDefaultKey} from './core/scale-milestones.mjs';
const $ = q => document.querySelector(q);
const jiSettings = createJISettings({
  $,
  getState: () => state,
  getDiamondScope: () => diamondScope,
  getManualTolerance: () => manualTolerance,
  diamondLayout: () => diamondWorkspace.layout()
});
function populateLimitOptions(basisLimit, primeBasisFilter) {
  const odd = $('#limit'),
    prime = $('#primeLimit'),
    oddSelection = odd.value || String(DEFAULT_ODD_LIMIT),
    primeSelection = prime.value;
  prime.placeholder = 'e.g. 11 or 2.3.5.11';
  prime.title = `basis = current temperament basis (${state.basis.join('.')}); blank = no prime filter`;
  odd.value = oddSelection === 'basis' ? String(basisLimit) : oddSelection;
  const automatic = primeSelection === 'basis' || prime.dataset.basisValue === primeSelection;
  prime.value = automatic ? state.basis.join('.') : primeSelection;
  if (automatic) prime.dataset.basisValue = prime.value;
}
let state = withDefaultScale(makeState('meantone')),
  view = 'matrices',
  selected = null,
  toastTimer;
let manualChordInspector = false;
// Catalogue rendering can synchronously request a loading/progress refresh.
let renderingWorkspace = false;
// A catalogue refresh replaces only the directory and analysis panes; the centre and scale stay.
// Scroll a row focused from another view into the directory list, without moving the page.
function revealDirectoryRow(directory) {
  if (!directory) return;
  const id = harmonicWorkspace.takeReveal();
  if (!id) return;
  try {
    const button = [...directory.querySelectorAll('[data-harmony-action="select"]')].find(
        el => el.dataset.id === id
      ),
      list = button?.closest('.unified-directory-list');
    if (!button || !list) return;
    const item = button.getBoundingClientRect(),
      box = list.getBoundingClientRect();
    if (item.top < box.top || item.bottom > box.bottom)
      list.scrollTop += item.top - box.top - box.height / 3;
  } catch {}
}
// Play's Shapes menu lists the directory's chords. The directory can finish listing while Play is open,
// so Play is redrawn (keeping held notes) once whenever that list changes.
let playShapeMenuKey = '';
function refreshPlayShapeMenu() {
  if (view !== 'hexboard' || hexWorkspace.chordMode() !== 'shapes') return;
  let key = '';
  try {
    const directory = harmonicWorkspace.shapeTargets();
    key = JSON.stringify([directory.ready, directory.chords.map(chord => chord.label)]);
  } catch {}
  if (key !== playShapeMenuKey) {
    playShapeMenuKey = key;
    renderWorkspace({keepNotes: true});
  }
}
function refreshHarmony() {
  if (renderingWorkspace) return;
  if (view === 'hexboard') {
    refreshPlayShapeMenu();
    return;
  }
  renderingWorkspace = true;
  try {
    if (view !== 'unified') return;
    const active = document.activeElement,
      key = active?.tagName === 'INPUT' ? active.dataset?.harmonyField : null,
      draft = key
        ? {value: active.value, start: active.selectionStart, end: active.selectionEnd}
        : null;
    const host = $('#workspace'),
      parts = harmonicWorkspace.renderParts({directory: true}),
      directory = host.querySelector('[data-unified-pane="directory"]'),
      detail = host.querySelector('[data-unified-pane="detail"]');
    if (!directory || !detail) return;
    directory.innerHTML = unifiedDirectory(parts);
    if (!manualChordInspector) detail.innerHTML = unifiedDetail(parts);
    focusSync.applyFocus();
    revealDirectoryRow(directory);
    if (key) {
      const input = host.querySelector('[data-harmony-field="' + key + '"]');
      if (input) {
        input.value = draft.value;
        input.focus({preventScroll: true});
        if (draft.start != null && input.type === 'search')
          input.setSelectionRange(draft.start, draft.end);
      }
    }
  } finally {
    renderingWorkspace = false;
  }
}
function fitPlayHarmony(coords) {
  const play = getLayoutStates()[0],
    fitted = fitGeneratedScale(
      play,
      coords.map(m => m[1])
    );
  if (fitted === play) return;
  if (!fitted) {
    toast('No collision-free Play scale fits these notes within 256 notes.');
    return;
  }
  layoutState.state = validate(fitted);
  renderWorkspace();
}

populateLimitOptions(Math.max(3, ...state.basis), primeFilterForBasis(state.basis));
let diamondScope = 'mapping',
  manualTolerance = null,
  unifiedCenter = 'diamond';
let coverageSignature = scaleDefaultKey(state, coverageSettings(state));
function syncCoverageDefaults() {
  const s = state,
    cfg = coverageSettings(s),
    key = scaleDefaultKey(s, cfg);
  if (key !== coverageSignature) {
    state = withDefaultScale(s, toast, cfg);
    coverageSignature = key;
    selected = null;
    matrixPages[0] = [0, 0];
  }
}
let audioSettings = {tonic: 220, wave: 'triangle'};
const audioEngine = createAudioEngine({
  getSettings: () => audioSettings,
  onError: () => toast('Audio could not start. Try pressing a key again.')
});
const lastViews = {discover: 'unified', play: 'hexboard', create: 'composition'};
const sectionFor = v => (v === 'hexboard' ? 'play' : v === 'composition' ? 'create' : 'discover');
const presetWorkspace = createPresetWorkspace({
  getJI: coverageSettings,
  getStates: () => [state],
  apply: (idx, s) => {
    state = validate(s);
    selected = null;
    matrixPages[0] = [0, 0];
    stop();
    render();
  },
  refresh: () => {
    document
      .querySelectorAll('[data-preset-controls]')
      .forEach(el => tuningPanel.renderPresetControls(el));
  },
  notify: toast
});
let layoutState = null;
function getLayoutStates() {
  const source = state,
    signature = scaleDefaultKey(source, coverageSettings(source));
  if (!layoutState || layoutState.signature !== signature)
    layoutState = {
      signature,
      state: withDefaultScale(structuredClone(source), () => {}, coverageSettings(source))
    };
  else {
    const {n, mode} = layoutState.state;
    Object.assign(layoutState.state, structuredClone(source), {n, mode});
  }
  return [layoutState.state];
}
function placeMaterial(item) {
  getLayoutStates();
  if (item.harmonicSelection) {
    view = 'hexboard';
    hexWorkspace.acceptHarmonicSelection(item.harmonicSelection);
    renderWorkspace();
    return;
  }
  const count =
    item.kind === 'scale'
      ? hexWorkspace.showScale(item.coords, item.label)
      : hexWorkspace.showChord(
          item.coords,
          item.label,
          item.exact ? {exact: true, periodCopies: true} : {}
        );
  if (!count)
    toast(
      item.exact
        ? 'These degrees and voicing do not fit yet. Try Period Wrapping, another occurrence, or a wider layout.'
        : 'No complete placement on this layout. Try a larger target scale or another layout.'
    );
  view = 'hexboard';
  selected = null;
  renderWorkspace();
}
const materialWorkspace = createMaterialWorkspace({
  getState: () => state,
  validate,
  play: (notes, kind) => (kind === 'scale' ? playSequence(notes) : playPitches(notes)),
  refresh: () => renderWorkspace(),
  notify: toast,
  place: placeMaterial,
  load: s => {
    state = validate(s);
    coverageSignature = scaleDefaultKey(state, coverageSettings(state));
    selected = null;
    stop();
    view = 'scales';
    render();
  }
});
const chordWorkspace = createChordWorkspace({
  onBrowseHarmony: () => {
    manualChordInspector = false;
    view = 'unified';
    renderWorkspace();
  },
  getJI: settings,
  getStates: () => [state],
  setState: s => (state = s),
  play: playPitches,
  refresh: full => (full ? render() : renderWorkspace()),
  notify: toast,
  onCollect: (s, coords, label, options) =>
    materialWorkspace.add('chord', s, coords, label, options),
  onHexboard: (coords, label, options) =>
    placeMaterial({kind: 'chord', coords, label, exact: options?.exact})
});
const harmonicWorkspace = createHarmonicCatalogueWorkspace({
  getState: () => state,
  getPlayState: () => getLayoutStates()[0],
  getSettings: settings,
  refresh: refreshHarmony,
  notify: toast,
  play: playPitches,
  onCollect: (s, coords, label, options) =>
    materialWorkspace.add('chord', s, coords, label, options),
  onSendToHexBoard: value => {
    view = 'hexboard';
    selected = null;
    focusSync.rememberPlayFocus(value);
    hexWorkspace.acceptHarmonicSelection(value);
    renderWorkspace();
  },
  onInspect: () => {
    manualChordInspector = true;
    view = 'unified';
    renderWorkspace();
  }
});
const commaWorkspace = createCommaWorkspace({
  getStates: () => [state],
  generate: (basis, list) => {
    presetWorkspace.receiveCommas(0, basis, list);
    document.querySelector('[data-preset-commas]')?.focus();
  },
  refresh: renderCommaSearch,
  notify: toast
});
let hexPlayer, diamondPlayer;
const liveChordRecognizer = createLiveChordRecognizer();
let liveChordContext = null,
  liveChordFrame = 0,
  activeHexNotes = [];
// Shares the focused chord between the directory, diamond, matrix and Play.
const focusSync = createFocusSync({
  get harmonic() {
    return harmonicWorkspace;
  },
  get diamond() {
    return diamondWorkspace;
  },
  get hex() {
    return hexWorkspace;
  },
  getState: () => state,
  getView: () => view,
  getSettings: s => settings(s),
  notify: message => toast(message),
  render: () => renderWorkspace(),
  openDiscover: () => {
    manualChordInspector = false;
    view = 'unified';
    renderWorkspace();
  }
});
function scheduleLiveChordUpdate(notes) {
  activeHexNotes = notes;
  if (liveChordFrame) return;
  liveChordFrame = requestAnimationFrame(() => {
    liveChordFrame = 0;
    showLiveChord();
    focusSync.followPlay(activeHexNotes);
  });
}
function showLiveChord() {
  const context = liveChordContext;
  if (context)
    hexWorkspace.updateLiveChord(
      liveChordRecognizer.recognize(context.state, activeHexNotes, context.settings),
      activeHexNotes
    );
}
const diamondWorkspace = createDiamondWorkspace({
  document,
  getState: () => state,
  refresh: () => renderWorkspace(),
  notify: toast,
  play: playPitches,
  onInspect: () => fillDiamondDetails(),
  onChordChange: () => {
    fillDiamondDetails();
    focusSync.followDiamond();
  },
  onTuningChange: centsFor => diamondPlayer?.retune(centsFor),
  onCollect: item =>
    materialWorkspace.add(item.kind, state, item.coords, item.label, {
      exact: true,
      harmonicSelection: item.harmonicSelection
    }),
  onPlace: placeMaterial,
  onChord: item => {
    if (item.harmonicSelection) {
      view = 'unified';
      manualChordInspector = false;
      harmonicWorkspace.openSelection(item.harmonicSelection);
      renderWorkspace();
      return;
    }
    const next = fitDiamondChord(state, item.coords),
      previous = state;
    try {
      state = validate(next);
      chordWorkspace.fromCoordinates(item.coords, item.label);
    } catch (error) {
      state = previous;
      throw error;
    }
    view = 'chords';
    selected = null;
    stop();
    render();
  }
});
const hexWorkspace = createHexboardWorkspace({
  getShapeDirectory: () => harmonicWorkspace.shapeTargets(),
  onFocusHarmony: coordinates => focusSync.focusPlayedHarmony(coordinates),
  matchPlayed: coordinates => harmonicWorkspace.matchPlayed(coordinates),
  getJI: settings,
  setJI: patch => {
    if (patch.tol !== undefined) manualTolerance = clampTolerance(patch.tol) ?? 0;
    if (patch.limit !== undefined) $('#limit').value = String(patch.limit);
    if (patch.primeLimit !== undefined)
      $('#primeLimit').value = Array.isArray(patch.primeLimit)
        ? patch.primeLimit.join('.')
        : patch.primeLimit == null
          ? ''
          : String(patch.primeLimit);
    if (patch.filter !== undefined) $('#targetfilter').value = patch.filter;
  },
  getStates: getLayoutStates,
  play: playPitches,
  refresh: mode => (mode === true ? render() : renderWorkspace({keepNotes: mode === 'highlight'})),
  notify: toast,
  download,
  getHz: () => audioSettings.tonic,
  getBassEntries: value => harmonicWorkspace.bassEntriesFor(value),
  onBrowseHarmony: () => {
    view = 'unified';
    manualChordInspector = false;
    renderWorkspace();
  },
  onSearch: text => focusSync.searchPlayChord(text),
  onFitHarmonicScale: fitPlayHarmony,
  onCollect: (s, coords, label, options) =>
    materialWorkspace.add('chord', s, coords, label, {exact: true, ...options}),
  onInspect: (s, coords, label) => {
    manualChordInspector = true;
    state = validate(structuredClone(s));
    coverageSignature = scaleDefaultKey(state, coverageSettings(state));
    chordWorkspace.fromCoordinates(coords, label);
    view = 'unified';
    selected = null;
    render();
  }
});
const matrixPages = [[0, 0]];
const tuningPanel = createTuningPanel({
  getState: () => state,
  setState: s => (state = s),
  getPlayState: () => layoutState?.state ?? null,
  setPlayState: s => (layoutState.state = s),
  layoutSnapshot: () => hexWorkspace.retuningSnapshot(),
  presets: presetWorkspace,
  settings: s => settings(s),
  stop: () => stop(),
  render: () => render(),
  notify: message => toast(message),
  play: pitches => playPitches(pitches),
  showDiscover: () => (view = 'unified')
});
const scalePane = createScalePane({
  getState: () => state,
  setState: s => (state = s),
  coverageSettings: s => coverageSettings(s),
  settings: s => settings(s),
  get harmonic() {
    return harmonicWorkspace;
  },
  get material() {
    return materialWorkspace;
  },
  place: item => placeMaterial(item),
  playPitches: pitches => playPitches(pitches),
  playSequence: notes => playSequence(notes),
  download: (name, text) => download(name, text),
  // Use scale in Play: Play takes the Discover scale and mode.
  useInPlay: () => {
    getLayoutStates();
    layoutState.state.n = state.n;
    layoutState.state.mode = state.mode;
    hexWorkspace.clearHighlight();
    view = 'hexboard';
    renderWorkspace();
    $('#workspace').scrollIntoView({behavior: 'smooth', block: 'start'});
  },
  showScale: () => {
    selected = null;
    stop();
    view = 'unified';
    renderWorkspace();
  },
  render: () => render(),
  notify: message => toast(message)
});
function toast(t) {
  $('#toast').textContent = t;
  $('#toast').style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('#toast').style.display = 'none'), 4500);
}

function coverageSettings(s) {
  return jiSettings.coverage(s);
}
function settings(s) {
  return jiSettings.current(s);
}
function matrix() {
  const {html, page} = renderMatrix(state, settings(state), matrixPages[0]);
  matrixPages[0] = page;
  return html;
}
function unifiedWorkspace() {
  const parts = harmonicWorkspace.renderParts({directory: true});
  return renderUnified({
    center: unifiedCenter,
    centerMarkup:
      unifiedCenter === 'matrix'
        ? `<div class="matrixpair single">${matrix(0)}</div>`
        : targetTable(),
    directory: unifiedDirectory(parts),
    detail: manualChordInspector ? chordWorkspace.render() : unifiedDetail(parts),
    scaleControls: scalePane.controls(),
    scaleMarkup: scalePane.details()
  });
}
function targetTable() {
  const s = state;
  return `<div class="diamond-pair single">${diamondWorkspace.render({...settings(s), scope: diamondScope}, '')}</div>`;
}
function fillDiamondDetails() {
  const el = $('#diamond-detail-0');
  if (el)
    showDiamondDetails(el, diamondWorkspace, () => {
      const cfg = settings();
      return cfg.maxError ?? cfg.tol;
    });
}

function syncNavigation() {
  const section = sectionFor(view);
  lastViews[section] = view;
  document.querySelectorAll('[role=tab][data-section]').forEach(b => {
    const selected = b.dataset.section === section;
    b.classList.toggle('active', selected);
    b.setAttribute('aria-selected', String(selected));
    b.tabIndex = selected ? 0 : -1;
  });
  for (const name of ['discover', 'play', 'create'])
    $('#' + name + '-view').hidden = section !== name;
  const destination = $('#' + section + '-view'),
    workspace = $('#analysis-explore');
  if (section !== 'create' && workspace.parentElement !== destination)
    destination.appendChild(workspace);
  const materialHost = $('#material-host');
  if (section === 'create') destination.appendChild(materialHost);
  $('#workspace-title').hidden = section === 'discover';
  $('#workspace-title').textContent = 'Play';
  const approximation = $('#approximation-module'),
    inDiscover = section === 'discover';
  $('#approximation-settings').hidden = !inDiscover;
  (inDiscover
    ? $('#approximation-settings-body')
    : $('#analysis-explore .sectionhead')
  ).appendChild(approximation);
  $('#analysis-explore .sectionhead').hidden = inDiscover;
}
function switchSection(section) {
  if (!Object.hasOwn(lastViews, section)) return;
  view = lastViews[section];
  selected = null;
  stop();
  renderWorkspace();
}
// Label changes update existing cells so scrolling, focus and matrix placement stay intact.
function refreshMatrixLabels() {
  if (view !== 'matrices' && !(view === 'unified' && unifiedCenter === 'matrix')) return;
  const template = document.createElement('template');
  template.innerHTML = matrix();
  const cells = document.querySelectorAll('.matrix [data-cell]'),
    next = template.content.querySelectorAll('.matrix [data-cell]');
  cells.forEach((cell, i) => {
    if (!next[i]) return;
    cell.innerHTML = next[i].innerHTML;
    cell.classList.toggle('ratio-cell', $('#labels').value === 'ratios');
  });
  document.querySelectorAll('[data-label]').forEach(b => {
    const active = b.dataset.label === $('#labels').value;
    b.classList.toggle('active', active);
    b.setAttribute('aria-pressed', String(active));
  });
  focusSync.applyFocus();
}
function parkJIControls() {
  const controls = $('#ji-controls'),
    source = $('#diamond-scope')?.closest('label');
  if (source && controls) {
    source.classList.remove('diamond-source-control');
    const help = $('#diamond-scope-help');
    if (help) help.classList.add('is-empty');
    controls.appendChild(source);
  }
  if (controls) $('#ji-controls-parking').appendChild(controls);
  const matrix = $('#matrix-controls');
  if (matrix) $('#matrix-controls-parking').appendChild(matrix);
  const labels = $('#matrix-label-controls');
  if (labels) $('#matrix-label-controls-parking').appendChild(labels);
}
function updateDiamondScopeHelp() {
  const help = $('#diamond-scope-help');
  if (!help) return;
  help.textContent =
    diamondScope === 'scale'
      ? 'Scale checks all intervals in the current scale matrix.'
      : diamondScope === 'mode'
        ? 'Mode checks tonic-relative notes in the current mode.'
        : '';
  help.classList.toggle('is-empty', !help.textContent);
}
function placeJIControls(v) {
  const controls = $('#ji-controls');
  if (controls && v === 'targets') {
    const panel = document.querySelector('.diamond-pair .diamond-panel');
    panel?.appendChild(controls);
    diamondWorkspace.mountOptions();
    const host = $('#diamond-span-controls');
    if (host) host.innerHTML = spanControl(state, 0, 'Target span') || '';
    const source = $('#diamond-scope')?.closest('label'),
      canvas = panel?.querySelector('.diamond-canvas');
    if (source && canvas) {
      source.classList.add('diamond-source-control');
      canvas.appendChild(source);
      updateDiamondScopeHelp();
    }
  }
}
function placeTargetControls(v) {
  const controls = $('#target-controls');
  if (controls) $('#approximation-module').insertBefore(controls, $('#diamond-tolerance-host'));
}
function placeMatrixControls(v) {
  if (v !== 'matrices') return;
  const controls = $('#matrix-controls'),
    host = document.querySelector('[data-matrix-controls-host]'),
    labels = $('#matrix-label-controls'),
    labelHost = document.querySelector('[data-matrix-labels-host]');
  if (controls && host) host.appendChild(controls);
  if (labels && labelHost) labelHost.appendChild(labels);
}
function placeDiamondTolerance(v, cfg) {
  const host = $('#diamond-tolerance-host');
  if (!host) return;
  const visible = ['matrices', 'targets', 'scales', 'chords'].includes(v) && !!cfg;
  host.hidden = !visible;
  host.parentElement?.classList.toggle('has-diamond-tolerance', visible);
  host.innerHTML = visible ? renderDiamondTolerance(cfg) : '';
}
function syncAudioControls() {
  $('#audio-tonic').value = String(audioSettings.tonic);
  $('#audio-wave').value = audioSettings.wave;
}
$('#audio-tonic').onchange = e => {
  const value = Number(e.target.value);
  if (!Number.isFinite(value) || value < 40 || value > 1000) {
    syncAudioControls();
    return;
  }
  stop();
  audioSettings = {...audioSettings, tonic: value};
  renderWorkspace();
};
$('#audio-wave').onchange = e => {
  if (!['sine', 'triangle', 'sawtooth', 'square'].includes(e.target.value)) return;
  stop();
  audioSettings = {...audioSettings, wave: e.target.value};
};
$('#audio-stop').onclick = () => stop();
// keepNotes: only Play's highlight moved, so keys being played keep sounding through the redraw.
function renderWorkspace({keepNotes = false} = {}) {
  keepNotes = keepNotes === true && view === 'hexboard';
  syncAudioControls();
  if (renderingWorkspace) return;
  renderingWorkspace = true;
  try {
    if (sectionFor(view) === 'discover') view = 'unified';
    if (view === 'hexboard') focusSync.syncPlayFocus();
    harmonicWorkspace.setEnabled(true);
    placeDiamondTolerance(null);
    parkJIControls();
    populateLimitOptions(Math.max(3, ...state.basis), primeFilterForBasis(state.basis));
    syncCoverageDefaults();
    hexWorkspace.prepareForTemperament();
    if (!keepNotes) hexPlayer?.reset();
    diamondPlayer?.reset();
    syncNavigation();
    if (sectionFor(view) !== 'create') compositionWorkspace.pause();
    $('#material-host').innerHTML = materialWorkspace.render();
    $('#material-host').hidden = sectionFor(view) !== 'create';
    if (sectionFor(view) === 'create') {
      $('#inspector').hidden = true;
      $('#workspace').innerHTML = '';
      liveChordContext = null;
      compositionWorkspace.refresh();
      return;
    }
    const v = view,
      c = v === 'unified' ? unifiedCenterView(unifiedCenter) : v;
    const cfg = settings();
    liveChordContext =
      v === 'hexboard' ? {state: state, settings: {...cfg, familyRecognition: true}} : null;
    if (liveChordContext)
      liveChordRecognizer.prepare(liveChordContext.state, liveChordContext.settings);
    tuningPanel.refreshExplorer();
    $('#inspector').hidden = ['scales', 'chords', 'hexboard', 'targets'].includes(c) || !selected;
    $('#layout').disabled = c === 'targets';
    $('#labels').disabled = c !== 'matrices';
    document.querySelectorAll('[data-label]').forEach(b => {
      b.disabled = c !== 'matrices';
      b.classList.toggle('active', b.dataset.label === cfg.labels);
      b.setAttribute('aria-pressed', String(b.dataset.label === cfg.labels));
    });
    $('#targetfilter').disabled = false;
    $('#workspace').innerHTML = v === 'hexboard' ? hexWorkspace.render() : unifiedWorkspace();
    if (v === 'hexboard') {
      mountPlaySlots();
      if (keepNotes) {
        hexPlayer?.repaint();
        showLiveChord();
      }
    }
    placeDiamondTolerance(c, cfg);
    placeMatrixControls(c);
    placeTargetControls(c);
    placeJIControls(c);
    if (c === 'targets') fillDiamondDetails();
    if (selected && !['scales', 'chords', 'hexboard', 'targets'].includes(c))
      inspect(...selected, false);
  } finally {
    renderingWorkspace = false;
    syncUnifiedPanelHeights();
    focusSync.applyFocus();
    if (view === 'unified')
      revealDirectoryRow($('#workspace')?.querySelector('[data-unified-pane="directory"]'));
  }
}
let commaSizeObserver;
function renderCommaSearch() {
  commaSizeObserver?.disconnect();
  const host = $('#comma-search');
  host.innerHTML = commaWorkspace.render();
  const inputs = host.querySelector('.comma-inputs'),
    workspace = host.querySelector('.comma-workspace');
  commaSizeObserver = new ResizeObserver(entries => {
    const entry = entries[0],
      height = entry.borderBoxSize?.[0]?.blockSize ?? inputs.getBoundingClientRect().height;
    if (height > 0) workspace.style.setProperty('--comma-input-height', `${Math.ceil(height)}px`);
  });
  commaSizeObserver.observe(inputs);
}
function render() {
  tuningPanel.render();
  renderCommaSearch();
  renderWorkspace();
}
function inspect(i, j, play = true) {
  const s = state,
    cfg = settings(s),
    m = matrixScale(s);
  if (i >= m.n || j > m.n || (j === m.n && cfg.layout !== 'distance')) {
    selected = null;
    $('#inspector').replaceChildren();
    $('#inspector').hidden = true;
    return;
  }
  const v = matrixInterval(m, i, j, cfg.layout),
    match = classifyTargets(s, v, allTargets(cfg.ts, s, cfg), cfg.tol);
  selected = [i, j];
  const describe = t => `${t.label} (${sign(t.error)} ¢${t.within ? '' : ', outside tolerance'})`;
  const text = `<b>${i} → ${v.end}${v.period ? (m.periods > 1 ? ' + octave' : ' + period') : ''}</b> &nbsp; ${fmt(v.c, 4)} ¢ · ${v.k} generators.<br><span class="target-mapped">Mapped:</span> ${match.mapped.length ? match.mapped.map(describe).join('; ') : 'none in this target set'}.<br><span class="target-hit">Other approximations:</span> ${match.hits.length ? match.hits.map(t => describe(t) + ' · ' + t.reason.toLowerCase()).join('; ') : 'none within tolerance'}.<br><button data-explore="cell" data-s="0" data-m="${Math.round((v.c - v.k * s.g) / s.p)},${v.k}">Explore a target for this interval</button>${m.periods === 1 ? `<button data-buildchord="0,${i},${v.end}">Build a chord from this interval</button>` : ''}`;
  $('#inspector').innerHTML = text;
  $('#inspector').hidden = false;
  if (play) playPitches([m.notes[i].c, m.notes[i].c + v.c]);
}
// Create > Composition. Playback is scoped in the shared audio engine; auditions in Create never cancel it.
const compositionWorkspace = createCompositionWorkspace({
  document,
  window,
  getFocusedChord: () => {
    let selection = null;
    try {
      selection = harmonicWorkspace.selection();
    } catch {}
    return selection
      ? {
          kind: 'chord',
          state: getLayoutStates()[0],
          coords: selection.voicing.voices.map(voice => voice.coordinate),
          label: selection.label ?? 'Focused chord',
          exact: true,
          harmonicSelection: selection
        }
      : null;
  },
  onChordFocus: coordinates => {
    harmonicWorkspace.focusExternal({coordinates});
  },
  getRootEntries: degree => harmonicWorkspace.rootEntriesFor({scale: 'play', degree}),
  matchPlayed: coordinates => harmonicWorkspace.matchPlayed(coordinates),
  audio: audioEngine,
  getState: () => getLayoutStates()[0],
  getLayout: () => hexWorkspace.serialize().configs[0],
  getTonic: () => audioSettings.tonic,
  getMaterial: () => materialWorkspace.serialize(),
  getHost: () => document.querySelector('.composition-suite'),
  notify: toast,
  download: (name, text, type) => download(name, text, type),
  onLights: () => hexboardSync.schedule(),
  loadState: setup => {
    state = validate(setup);
    coverageSignature = scaleDefaultKey(state, coverageSettings(state));
    layoutState = null;
    getLayoutStates();
    layoutState.state = validate({...layoutState.state, n: setup.n, mode: setup.mode});
    selected = null;
    stop();
    view = 'composition';
    lastViews.create = 'composition';
    render();
    toast('Composition setup loaded.');
  }
});
// Fingering practice: play each fingering of the chord on the Play board, one at a time.
let fingeringUi;
const fingeringGame = createFingeringGame({
  getFingerings: () => hexWorkspace.fingerings(),
  showFingering: index => hexWorkspace.showFingering(index),
  onChange: () => fingeringUi?.update()
});
// Note → chords and Practice keep their own live panels; each Play redraw mounts them into its slots.
const playPanels = {'note-chords': $('#key-harmonies'), practice: $('#fingering-game')};
function mountPlaySlots() {
  for (const [slot, panel] of Object.entries(playPanels)) {
    const place = document.querySelector(`[data-play-slot="${slot}"]`);
    if (place && panel) place.replaceWith(panel);
  }
}
fingeringUi = createFingeringGameUi({
  game: fingeringGame,
  host: playPanels.practice,
  getFingerings: () => hexWorkspace.fingerings(),
  isPlayView: () => view === 'hexboard'
});
// Note → chords: the chords on the key selected on the Play board (mouse click or a HexBoard press).
const keyHarmoniesUi = createKeyHarmoniesUi({
  host: playPanels['note-chords'],
  api: {
    harmonies: options => hexWorkspace.harmoniesAt(options),
    onKey: key => {
      if (harmonicWorkspace.followPlaying() && key.degree >= 0)
        harmonicWorkspace.setBass({scale: 'play', degree: key.degree});
    },
    onPick: (harmony, key) => {
      harmonicWorkspace.chooseBass(
        {scale: 'play', degree: key.degree},
        harmony.rowId,
        harmony.member
      );
    },
    showHarmony: (index, placement, options) => hexWorkspace.showHarmony(index, placement, options),
    hear: keys => hexWorkspace.hearKeys(keys)
  },
  getFingerings: () => hexWorkspace.fingerings(),
  isPlayView: () => view === 'hexboard',
  isShown: () => hexWorkspace.chordMode() === 'notes'
});
// Physical HexBoard (Web MIDI, delegated control): its keys play through the Play board's own
// pointer path, and its lights follow the layout, highlights and held keys.
const hexboardDevice = createHexboardDevice({
  onKey: (index, down, t) => {
    if (down) {
      hexboardSync.keyDown(index, t);
      scheduleHexboardProbe();
    } else hexboardSync.keyUp(index);
  },
  onEncoder: event => {
    if (event === 'press') {
      stop();
      if (view === 'hexboard') {
        hexWorkspace.clearHighlight();
        renderWorkspace();
      }
    }
  },
  onStatus: (state, detail) => showHexboardStatus(state, detail)
});
// Physical keys press the on-screen board that is showing: the open composition's, else Play's.
const composing = () => view === 'composition' && compositionWorkspace.open;
const hexboardSync = createHexboardSync({
  device: hexboardDevice,
  pressKey: (index, t) =>
    (composing()
      ? compositionWorkspace.pressKey(index, t)
      : hexPlayer?.pressKey(String(index), t)) ?? false,
  releaseKey: index =>
    composing() ? compositionWorkspace.releaseKey(index) : hexPlayer?.releaseKey(String(index)),
  getSnapshot: () =>
    composing() ? compositionWorkspace.deviceSnapshot() : hexWorkspace.deviceSnapshot(),
  startVoice: c => audioEngine.startVoice(c)
});
// Overall LED brightness for a connected board, remembered in this browser.
const HEXBOARD_BRIGHTNESS_KEY = 'temperament-lab-hexboard-brightness';
function showHexboardBrightness(value) {
  const input = $('#hexboard-brightness'),
    out = $('#hexboard-brightness-value'),
    percent = Math.round(value * 100);
  if (input) input.value = String(percent);
  if (out) out.textContent = `${percent}%`;
}
{
  let saved = null;
  try {
    saved = globalThis.localStorage?.getItem(HEXBOARD_BRIGHTNESS_KEY);
  } catch {}
  showHexboardBrightness(
    hexboardSync.setBrightness(saved === null ? 1 : clampBrightness(Number(saved) / 100))
  );
}
$('#hexboard-brightness').oninput = e => {
  const value = hexboardSync.setBrightness(Number(e.target.value) / 100);
  showHexboardBrightness(value);
  try {
    globalThis.localStorage?.setItem(HEXBOARD_BRIGHTNESS_KEY, String(Math.round(value * 100)));
  } catch {}
};
// Latency probe: the board's key-to-sound time inside the app, and the audio device's own buffering.
let hexboardConnectedName = '',
  hexboardProbeTimer = null;
function hexboardConnectedText() {
  const delay = hexboardSync.inputDelay(),
    output = audioEngine.outputLatency();
  const probe =
    delay === null
      ? ''
      : ` · key to sound ${delay.toFixed(1)} ms in the app${output === null ? '' : ` + ${output.toFixed(0)} ms audio output`}`;
  return `HexBoard connected${hexboardConnectedName ? ': ' + hexboardConnectedName : ''}${probe}`;
}
function scheduleHexboardProbe() {
  if (hexboardProbeTimer) return;
  hexboardProbeTimer = setTimeout(() => {
    hexboardProbeTimer = null;
    if (!hexboardDevice.connected) return;
    const text = $('#hexboard-status');
    if (text) {
      text.textContent = hexboardConnectedText();
      text.title = text.textContent;
    }
  }, 400);
}
function showHexboardStatus(state, detail = {}) {
  const button = $('#hexboard-connect'),
    text = $('#hexboard-status');
  button.textContent = state === 'connected' ? 'Disconnect HexBoard' : 'Connect HexBoard';
  button.disabled = state === 'connecting';
  if (state === 'connected') hexboardConnectedName = detail.name ?? '';
  const message =
    state === 'connected'
      ? hexboardConnectedText()
      : state === 'connecting'
        ? 'Connecting…'
        : state === 'error'
          ? detail.message
          : detail.reason === 'unplugged'
            ? 'HexBoard unplugged'
            : '';
  text.textContent = message;
  text.title = message;
  const brightness = $('.hexboard-brightness');
  if (brightness) brightness.hidden = state !== 'connected';
  if (state === 'connected') hexboardSync.start();
  else {
    hexboardSync.stop();
    if (state === 'disconnected') hexboardSync.releaseAll();
    if (state === 'error') toast(message);
  }
}
$('#hexboard-connect').onclick = async () => {
  if (hexboardDevice.connected) {
    hexboardSync.releaseAll();
    hexboardDevice.disconnect();
    return;
  }
  void audioEngine.prepare().catch(() => {});
  await hexboardDevice.connect();
};
function stop() {
  hexPlayer?.reset();
  diamondPlayer?.reset();
  audioEngine.stop();
  compositionWorkspace.stop();
}
hexPlayer = createHexboardPlayer({
  document,
  window,
  press: node => hexWorkspace.press(node),
  startVoice: audioEngine.startVoice,
  onActiveNotesChange: notes => {
    scheduleLiveChordUpdate(notes);
    hexboardSync.setActive(notes);
    fingeringGame.onHeld(new Set(notes.map(n => Number(n.id))));
  }
});
diamondPlayer = createHexboardPlayer({
  document,
  window,
  press: node => diamondWorkspace.press(node),
  startVoice: audioEngine.startVoice,
  onActiveNotesChange: notes => diamondWorkspace.updatePlaying(notes),
  selector: '[data-diamond-key]',
  keyField: 'diamondKey',
  surface: '.tonality-diamond',
  keyboard: true,
  focusOnPointer: false
});
function playPitches(c) {
  if (sectionFor(view) === 'create') {
    hexPlayer?.reset();
    diamondPlayer?.reset();
    return audioEngine.previewChord(c);
  }
  stop();
  return audioEngine.playChord(c);
}
function playSequence(notes) {
  if (sectionFor(view) === 'create') {
    hexPlayer?.reset();
    diamondPlayer?.reset();
    return audioEngine.previewSequence(notes);
  }
  stop();
  return audioEngine.playSequence(notes);
}
function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], {type})),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.addEventListener('pointerover', e => linkScaleDegree(e.target));
document.addEventListener('focusin', e => linkScaleDegree(e.target));
document.addEventListener('toggle', e => presetWorkspace.toggle(e.target), true);
document.addEventListener('input', e => {
  if (harmonicWorkspace.input(e.target)) return;
  if (hexWorkspace.input(e.target)) return;
  presetWorkspace.input(e.target);
});
document.addEventListener('change', e => {
  if (compositionWorkspace.change(e.target)) return;
  if (harmonicWorkspace.change(e.target)) return;
  if (e.target.dataset.diamondTolerance !== undefined) {
    const value = clampTolerance(e.target.value);
    if (e.target.value.trim() === '' || value === null) {
      e.target.value = String(settings().tol);
      return;
    }
    manualTolerance = value;
    renderWorkspace();
    return;
  }
  if (e.target.dataset.diamondSetting && diamondWorkspace.change(e.target)) return;
  if (e.target.hasAttribute('data-diamond-scope')) {
    diamondScope = ['mapping', 'scale', 'mode'].includes(e.target.value)
      ? e.target.value
      : 'mapping';
    renderWorkspace();
    return;
  }
  if (scalePane.change(e.target)) return;
  if (materialWorkspace.change(e.target)) return;
  if (presetWorkspace.change(e.target)) return;
  if (hexWorkspace.change(e.target)) return;
  if (e.target.dataset.matrixSpan !== undefined) {
    const idx = Number(e.target.dataset.matrixSpan);
    state.matrixOctave = e.target.value === 'octave';
    matrixPages[idx] = [0, 0];
    selected = null;
    $('#inspector').replaceChildren();
    $('#inspector').hidden = true;
    renderWorkspace();
    return;
  }
  if (commaWorkspace.change(e.target)) return;
  if (chordWorkspace.change(e.target)) return;
  if (tuningPanel.change(e.target)) return;
});
document.addEventListener('click', e => {
  for (const open of document.querySelectorAll('.app-header details[open]'))
    if (!open.contains(e.target)) open.open = false;
  if (compositionWorkspace.click(e.target)) return;
  if (
    e.target.closest?.('[data-harmony-action="select"], [data-harmony-action="directory-recent"]')
  )
    manualChordInspector = false;
  if (harmonicWorkspace.click(e.target)) return;
  if (e.target.closest?.('[data-diamond-tolerance-reset]')) {
    manualTolerance = null;
    renderWorkspace();
    return;
  }
  if (
    e.target.closest?.('[data-diamond-action], [data-diamond-preset]') &&
    diamondWorkspace.click(e.target)
  )
    return;
  if (hexWorkspace.click(e.target, e.shiftKey)) return;
  const b = e.target.closest('button');
  if (!b) return;
  if (scalePane.click(b)) return;
  if (materialWorkspace.click(b)) return;
  if (b.dataset.section) {
    switchSection(b.dataset.section);
    return;
  }
  if (presetWorkspace.click(b)) return;
  if (b.dataset.matrixPage) {
    const [, axis, page] = b.dataset.matrixPage.split(',').map(Number);
    matrixPages[0][axis] = page;
    renderWorkspace();
    return;
  }
  if (commaWorkspace.click(b)) return;
  if (chordWorkspace.click(b)) return;
  if (tuningPanel.click(b)) return;
  try {
    if (b.dataset.buildchord) {
      const [, i, j] = b.dataset.buildchord.split(',').map(Number);
      chordWorkspace.fromInterval(i, j);
      manualChordInspector = true;
      view = 'unified';
      renderWorkspace();
    } else if (b.dataset.unifiedCenter) {
      unifiedCenter = normalizeUnifiedCenter(b.dataset.unifiedCenter);
      selected = null;
      renderWorkspace();
    } else if (b.dataset.label) {
      $('#labels').value = b.dataset.label;
      refreshMatrixLabels();
    } else if (b.dataset.cell) {
      const [i, j] = b.dataset.cell.split(',').map(Number);
      if (e.shiftKey) focusSync.pickMatrixCell(i, j);
      else {
        focusSync.clearMatrixPicks();
        inspect(i, j);
      }
    }
  } catch (err) {
    toast(err.message);
  }
});
$('#labels').addEventListener('change', refreshMatrixLabels);
['layout', 'targetfilter'].forEach(id => $('#' + id).addEventListener('change', renderWorkspace));
$('#limit').addEventListener('change', () => {
  const input = $('#limit');
  try {
    validateJILimits({oddLimit: Number(input.value)});
    input.setCustomValidity('');
    renderWorkspace();
  } catch (error) {
    input.setCustomValidity(error.message);
    input.reportValidity();
    input.value = String(DEFAULT_ODD_LIMIT);
    input.setCustomValidity('');
    renderWorkspace();
  }
});
$('#primeLimit').addEventListener('change', () => {
  const input = $('#primeLimit');
  try {
    parsePrimeFilterInput(input.value, state.basis);
    delete input.dataset.basisValue;
    input.setCustomValidity('');
    renderWorkspace();
  } catch (error) {
    input.setCustomValidity(error.message);
    input.reportValidity();
    input.value = 'basis';
    input.setCustomValidity('');
  }
});
$('#reset').onclick = () => {
  harmonicWorkspace.restore(null);
  manualChordInspector = false;
  diamondWorkspace.restore(null);
  diamondScope = 'mapping';
  manualTolerance = null;
  $('#limit').value = String(DEFAULT_ODD_LIMIT);
  $('#primeLimit').value = 'basis';
  $('#targetfilter').value = 'mapped';
  scalePane.restore(null);
  stop();
  view = 'unified';
  lastViews.discover = 'unified';
  unifiedCenter = 'diamond';
  lastViews.play = 'hexboard';
  lastViews.create = 'composition';
  layoutState = null;
  materialWorkspace.restore(null);
  compositionWorkspace.restore(null);
  state = withDefaultScale(makeState('meantone'));
  chordWorkspace.restore(null, validate);
  commaWorkspace.restore(null);
  hexWorkspace.restore(null);
  selected = null;
  render();
};
$('#save').onclick = () =>
  download(
    'temperament-lab-session.json',
    JSON.stringify(
      sessionFile({
        composition: compositionWorkspace.serialize(),
        harmonicCatalogue: harmonicWorkspace.serialize(),
        state,
        material: materialWorkspace.serialize(),
        diamond: diamondWorkspace.serialize(),
        layoutScale: {n: getLayoutStates()[0].n, mode: getLayoutStates()[0].mode},
        chords: chordWorkspace.serialize(),
        commaSearch: commaWorkspace.serialize(),
        hexboard: hexWorkspace.serialize(),
        settings: {
          scaleFilter: scalePane.settings().scaleFilter,
          diamondScope,
          view,
          unifiedCenter,
          scaleView: scalePane.settings().scaleView,
          lastViews: {...lastViews},
          targetfilter: $('#targetfilter').value,
          showoutside: true,
          layout: $('#layout').value,
          labels: $('#labels').value,
          limit: $('#limit').value,
          primeLimit:
            $('#primeLimit').value === $('#primeLimit').dataset?.basisValue
              ? 'basis'
              : $('#primeLimit').value,
          manualTolerance,
          tonic: audioSettings.tonic,
          wave: audioSettings.wave
        }
      }),
      null,
      2
    ),
    'application/json'
  );
$('#load').onclick = () => $('#file').click();
$('#file').onchange = async e => {
  try {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > MAX_SESSION_BYTES) throw Error('Session file is too large.');
    const session = readSession(JSON.parse(await f.text())),
      {workspaces} = session;
    harmonicWorkspace.restore(workspaces.harmonicCatalogue);
    manualChordInspector = false;
    diamondWorkspace.restore(workspaces.diamond);
    chordWorkspace.restore(workspaces.chords, validate);
    commaWorkspace.restore(workspaces.commaSearch);
    hexWorkspace.restore(workspaces.hexboard);
    scalePane.restore(session);
    diamondScope = session.diamondScope;
    state = session.state;
    $('#primeLimit').value = 'basis';
    manualTolerance = session.manualTolerance;
    for (const [id, value] of Object.entries(session.controls)) {
      const el = $('#' + id);
      if (
        value !== undefined &&
        (el.tagName !== 'SELECT' || [...el.options].some(o => o.value === String(value)))
      )
        el.value = value;
    }
    audioSettings = session.audio;
    lastViews.discover = 'unified';
    lastViews.play = 'hexboard';
    lastViews.create = 'composition';
    unifiedCenter = session.unifiedCenter;
    view = session.view;
    materialWorkspace.restore(session.material);
    coverageSignature = scaleDefaultKey(state, coverageSettings(state));
    layoutState = null;
    getLayoutStates();
    if (session.layoutScale)
      layoutState.state = validate({
        ...layoutState.state,
        n: session.layoutScale.n,
        mode: session.layoutScale.mode
      });
    if (workspaces.hexboard?.configs) hexWorkspace.preserveCurrentLayout();
    selected = null;
    stop();
    compositionWorkspace.restore(session.composition);
    render();
    toast('Session opened');
  } catch (err) {
    toast(err.message);
  }
  e.target.value = '';
};
$('#presets-export').onclick = async () => {
  try {
    download(
      'temperament-lab-presets.json',
      JSON.stringify(await browserPresetStore.exportBackup(), null, 2),
      'application/json'
    );
  } catch (err) {
    toast(err.message);
  }
};
$('#presets-import').onclick = () => $('#presets-file').click();
$('#presets-file').onchange = async e => {
  try {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 8000000) throw Error('Presets file is too large.');
    let data;
    try {
      data = JSON.parse(await f.text());
    } catch {
      throw Error('Choose a Temperament Lab presets file.');
    }
    const result = await browserPresetStore.importBackup(data);
    await Promise.all([
      presetWorkspace.init(),
      hexWorkspace.initLayouts(),
      hexWorkspace.shapeExplorer.init()
    ]);
    toast(importSummary(result));
  } catch (err) {
    toast(err.message);
  }
  e.target.value = '';
};
function importSummary({temperaments, layouts, shapes, defaults, skipped}) {
  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`,
    parts = [
      count(temperaments, 'temperament'),
      count(layouts, 'layout'),
      ...(shapes !== undefined ? [count(shapes, 'chord shape')] : []),
      ...(defaults ? [count(defaults, 'default layout')] : [])
    ];
  return `Imported ${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}.${skipped ? ` Skipped ${count(skipped, 'unreadable record')}.` : ''}`;
}
document.addEventListener('keydown', e => {
  if (compositionWorkspace.keydown(e, view === 'composition')) return;
  if (e.key === 'Enter' && e.target.dataset?.hexSearchText !== undefined) {
    e.preventDefault();
    document.querySelector('[data-hex-action="chord-search"]')?.click();
    return;
  }
  const tab = e.target.closest?.('[role=tab][data-section]');
  if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
    e.preventDefault();
    const sections = ['discover', 'play', 'create'],
      section =
        e.key === 'Home'
          ? 'discover'
          : e.key === 'End'
            ? 'create'
            : sections[
                (sections.indexOf(tab.dataset.section) +
                  (e.key === 'ArrowRight' ? 1 : sections.length - 1)) %
                  sections.length
              ];
    switchSection(section);
    $('#tab-' + section).focus();
    return;
  }
  if (e.key === 'Escape') {
    stop();
    if (view === 'hexboard') {
      hexWorkspace.clearHighlight();
      renderWorkspace();
    }
    return;
  }
  if (e.target.closest?.('[data-hex-key]') && ['Enter', ' '].includes(e.key)) {
    e.preventDefault();
    return;
  }
});
render();
void presetWorkspace.init();
// The service worker keeps the app available offline; browsers allow it only over http(s).
if (globalThis.navigator?.serviceWorker && /^https?:$/.test(location.protocol))
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}), {
    once: true
  });

document.addEventListener('visibilitychange', () => {
  if (document.hidden) compositionWorkspace.pause();
});
window.addEventListener('pagehide', () => compositionWorkspace.pause());
window.addEventListener('pagehide', () => {
  hexboardSync.releaseAll();
  hexboardDevice.disconnect();
});
// The practice panels follow the view in the same event as the switch, so the Play page renders once, fully
// formed, and nothing is left behind on Discover. (Registered last, so the app's own handlers have already run.)
for (const type of ['click', 'keydown', 'change'])
  document.addEventListener(type, () => {
    fingeringUi.update();
    keyHarmoniesUi.update();
  });
// The header floats over the page; its height lets sticky panes and scroll targets clear it.
{
  const header = document.querySelector('.app-header'),
    setHeaderHeight = () =>
      document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
  if (header) {
    setHeaderHeight();
    if (typeof ResizeObserver === 'function') new ResizeObserver(setHeaderHeight).observe(header);
  }
}
