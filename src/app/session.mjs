// Session files: the whole app's setup in one JSON file. Reading validates what a file carries
// before the app changes anything, and maps older files onto the current settings.
import {scale} from '../core/engine.mjs';
import {presets} from '../core/catalog.mjs';
import {validateState} from '../core/state.mjs';
import {normalizeDiamondScope} from '../diamond/tonality-diamond.mjs';
import {normalizeUnifiedCenter} from '../ui/discover-unified.mjs';
import {normalizeScaleView} from '../ui/scale-view.mjs';
import {
  sessionFormat,
  compositionForSave,
  isSessionFormat,
  compositionFromSession
} from '../composition/composition-session.mjs';
import {clampTolerance} from './ji-settings.mjs';

export const SESSION_VERSION = 8;
export const MAX_SESSION_BYTES = 8000000;

/** The file for the app's current parts. `composition` is the open project, or null. */
export function sessionFile({
  composition,
  harmonicCatalogue,
  state,
  material,
  diamond,
  layoutScale,
  chords,
  commaSearch,
  hexboard,
  settings
}) {
  return {
    format: sessionFormat(composition),
    workflowVersion: SESSION_VERSION,
    harmonicCatalogue,
    states: [state],
    material,
    diamond,
    layoutScale,
    chords,
    commaSearch,
    hexboard,
    settings,
    ...compositionForSave(composition)
  };
}

// The first temperament; files from the comparison view carry two.
function primaryState(data) {
  if (!Array.isArray(data.states) || ![1, 2].includes(data.states.length))
    throw Error('Choose a Temperament Lab session file.');
  const saved = data.states[0];
  validateState(saved);
  return {
    ...saved,
    key: presets[saved.key] ? saved.key : 'custom',
    tuning: typeof saved.tuning === 'string' ? saved.tuning : 'Manual'
  };
}

// Files from before the collection kept pinned chords in the chord workspace.
const pinnedChords = chords =>
  (chords?.pins || []).map(pin => ({
    kind: 'chord',
    state: pin.state,
    label: pin.name,
    coords: pin.degrees.map(i => {
      const n = scale(pin.state).notes[i];
      return [Math.round((n.c - n.k * pin.state.g) / pin.state.p) + (pin.octaves?.[i] || 0), n.k];
    })
  }));

/**
 * A parsed session file, validated and normalized for the app to apply. Throws a message for the
 * user when the file is not a session or its temperament or composition is invalid.
 */
export function readSession(data) {
  if (!isSessionFormat(data?.format)) throw Error('Choose a Temperament Lab session file.');
  const composition = compositionFromSession(data),
    state = primaryState(data),
    version = Number(data.workflowVersion ?? 0),
    settings = data.settings;
  // Before version 5 an empty prime filter meant the temperament's basis.
  const primeLimit =
    version < 5 && (settings?.primeLimit === undefined || settings.primeLimit === '')
      ? 'basis'
      : settings?.primeLimit;
  return {
    composition,
    state,
    workspaces: {
      harmonicCatalogue: data.harmonicCatalogue,
      diamond: data.diamond,
      chords: data.chords,
      commaSearch: data.commaSearch,
      hexboard: data.hexboard
    },
    scaleFilter: ['all', '2', '3'].includes(settings?.scaleFilter) ? settings.scaleFilter : '2',
    diamondScope: normalizeDiamondScope(settings?.diamondScope, data.workflowVersion),
    manualTolerance:
      version >= 7 &&
      settings?.manualTolerance != null &&
      Number.isFinite(Number(settings.manualTolerance))
        ? clampTolerance(settings.manualTolerance)
        : null,
    // Values for the shared controls, by element id; undefined leaves a control as it is.
    controls: settings
      ? {
          layout: settings.layout,
          labels: settings.labels,
          limit: settings.limit,
          primeLimit,
          targetfilter: settings.targetfilter
        }
      : {},
    audio: {
      tonic: Math.max(40, Math.min(1000, Number(settings?.tonic) || 220)),
      wave: ['triangle', 'sine', 'sawtooth', 'square'].includes(settings?.wave)
        ? settings.wave
        : 'triangle'
    },
    // Every older Discover view opens the unified screen; the old matrix view keeps the matrix.
    unifiedCenter: normalizeUnifiedCenter(
      settings?.unifiedCenter ?? (settings?.view === 'matrices' ? 'matrix' : null)
    ),
    scaleView: normalizeScaleView(settings?.scaleView),
    view: ['hexboard', 'composition'].includes(settings?.view) ? settings.view : 'unified',
    material: data.material ?? pinnedChords(data.chords),
    layoutScale: data.layoutScale ?? null
  };
}
