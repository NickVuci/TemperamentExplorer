// Shares the focused chord between Discover's directory, the tonality diamond, the interval
// matrix and Play. Dependencies are read when used, so workspaces created later can be passed
// as getters.
import {diamondFocus, matrixFocusDegrees, relativeRatios} from '../harmonic/harmonic-focus.mjs';
import {equivalencePolicy, quotientCoordinate} from '../harmonic/harmonic-equivalence.mjs';
import {matrixScale} from '../core/matrix.mjs';
import {noteCoordinate} from '../core/pitch.mjs';

/** Identity of a chord selection for the Play handover. */
export const focusKey = selection =>
  JSON.stringify([
    selection?.shapeId ?? null,
    selection?.interpretationId ?? null,
    selection?.voicing?.coords ?? null
  ]);

export function createFocusSync(deps) {
  const timers = () => deps.timers ?? globalThis,
    doc = () => deps.document ?? globalThis.document;
  let followTimer = null,
    playFollowTimer = null,
    playFocusKey = '';
  const matrixChordCells = new Set();

  // The directory's focused chord, projected onto the diamond.
  function focusOnDiamond(focus) {
    const s = deps.getState(),
      octave = s.basis.includes(2),
      policy = equivalencePolicy(s, octave ? 'octave' : 'exact');
    return diamondFocus(deps.diamond.cells(), focus, {
      harmonics: deps.diamond.harmonics(),
      octave,
      classKeyOf: m => quotientCoordinate(policy, m).key
    });
  }

  // Diamond → directory: a selected chord of three or more pitch classes is focused at once; a
  // held one, when following is on, once it has been held for a moment.
  function followDiamond() {
    timers().clearTimeout(followTimer);
    if (deps.getView() !== 'unified') return;
    const chord = deps.diamond.chordDisplay();
    if (chord?.kind !== 'chord') return;
    const cells = deps.diamond.displayCells();
    if (new Set(cells.map(cell => cell.label)).size < 3) return;
    const playing = chord.source === 'playing';
    if (playing && !deps.harmonic.followPlaying()) return;
    const run = () => {
      const now = deps.diamond.displayCells();
      if (now.map(cell => cell.id).join() !== cells.map(cell => cell.id).join()) return;
      const coordinates = [
        ...new Map(
          now
            .filter(cell => cell.status?.approximation?.m)
            .map(cell => [cell.status.approximation.m.join(), cell.status.approximation.m])
        ).values()
      ];
      deps.harmonic.focusExternal({
        ratios: relativeRatios(now, {octave: deps.getState().basis.includes(2)}),
        coordinates
      });
    };
    if (playing) followTimer = timers().setTimeout(run, 250);
    else run();
  }

  // Matrix → directory: Shift-click cells to collect their scale degrees; three or more form a chord.
  function pickMatrixCell(i, j) {
    const key = `${i},${j}`;
    if (matrixChordCells.has(key)) matrixChordCells.delete(key);
    else matrixChordCells.add(key);
    const s = deps.getState(),
      m = matrixScale(s),
      distance = deps.getSettings(s).layout === 'distance',
      degrees = new Set();
    for (const cell of matrixChordCells) {
      const [a, b] = cell.split(',').map(Number);
      for (const index of [a, distance ? a + b : b]) degrees.add(((index % m.n) + m.n) % m.n);
    }
    const coordinates = [...degrees].map(degree => noteCoordinate(s, m.notes[degree]));
    if (
      coordinates.length >= 3 &&
      deps.getView() === 'unified' &&
      !deps.harmonic.focusExternal({coordinates})
    )
      deps.notify(
        'Those scale degrees are not a chord in the directory: not every pair is a JI interval of the selected limit.'
      );
    applyFocus();
  }

  function clearMatrixPicks() {
    if (!matrixChordCells.size) return;
    matrixChordCells.clear();
    applyFocus();
  }

  // Marks the focused chord on the diamond and the matrix, and the matrix cells picked for a chord.
  function applyFocus() {
    const focus = deps.getView() === 'unified' ? deps.harmonic.focus() : null;
    deps.diamond.showFocus(focus ? focusOnDiamond(focus).ids : []);
    const s = deps.getState(),
      n = s.n,
      degrees = matrixFocusDegrees(focus, n),
      ascending = deps.getSettings(s).layout === 'distance';
    doc()
      .querySelectorAll('.matrix [data-cell]')
      .forEach(el => {
        const [i, j] = el.dataset.cell.split(',').map(Number),
          a = ((i % n) + n) % n,
          b = (((ascending ? i + j : j) % n) + n) % n;
        el.classList.toggle('focus-cell', !!degrees && degrees.has(a) && degrees.has(b));
        el.classList.toggle('chord-pick', matrixChordCells.has(el.dataset.cell));
      });
  }

  // Play and Discover share the focused chord. Entering Play with a newly focused chord hands it
  // to Play's harmony panel once; a chord focused from Play itself is never handed back.
  function rememberPlayFocus(selection) {
    playFocusKey = focusKey(selection);
  }
  function rememberCurrentFocus() {
    try {
      rememberPlayFocus(deps.harmonic.selection());
    } catch {}
  }
  function syncPlayFocus() {
    let selection = null;
    try {
      selection = deps.harmonic.selection();
    } catch {
      return;
    }
    if (!selection) return;
    const key = focusKey(selection);
    if (key === playFocusKey) return;
    playFocusKey = key;
    try {
      deps.hex.acceptHarmonicSelection(selection);
    } catch {}
  }
  // Play's chord search looks the chord up in the directory, like Discover's search, and places it.
  async function searchPlayChord(text) {
    let selection = null;
    try {
      await deps.harmonic.openInput(text);
      selection = deps.harmonic.selection();
    } catch (e) {
      deps.notify(e.message);
      return;
    }
    if (!selection) {
      deps.notify(`No chord in the directory matches ${text}.`);
      return;
    }
    rememberPlayFocus(selection);
    deps.hex.acceptHarmonicSelection(selection);
    deps.render();
  }
  // A chord chosen from Play's keys opens in Discover's analysis; it is not handed back to Play.
  function focusPlayedHarmony(coordinates) {
    if (!deps.harmonic.focusExternal({coordinates})) return false;
    rememberCurrentFocus();
    deps.openDiscover();
    return true;
  }
  // Held Play notes (screen or HexBoard) focus their chord in Discover while following is on.
  function followPlay(notes) {
    timers().clearTimeout(playFollowTimer);
    if (!deps.harmonic.followPlaying()) return;
    const coordinates = [
      ...new Map(
        (notes ?? [])
          .filter(note => Array.isArray(note?.coordinate))
          .map(note => [note.coordinate.join(), note.coordinate])
      ).values()
    ];
    if (coordinates.length < 3) return;
    playFollowTimer = timers().setTimeout(() => {
      if (deps.harmonic.focusExternal({coordinates})) rememberCurrentFocus();
    }, 250);
  }

  return {
    followDiamond,
    pickMatrixCell,
    clearMatrixPicks,
    matrixPicks: () => matrixChordCells.size,
    applyFocus,
    rememberPlayFocus,
    syncPlayFocus,
    searchPlayChord,
    focusPlayedHarmony,
    followPlay
  };
}
