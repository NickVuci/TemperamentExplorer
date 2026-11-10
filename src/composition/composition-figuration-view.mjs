import {esc, option} from '../ui/ui.mjs';
import {orderedChord} from './composition-figuration.mjs';
import {PPQ} from './composition-project.mjs';

const button = (action, label, disabled = false) =>
  `<button data-comp="figure-${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
export function renderFiguration(v) {
  const f = v.figuration;
  if (!f) return '';
  const o = f.options,
    chord = f.reference;
  const attached = f.attachments.find(a => a.chordEventId === v.selectedChord);
  const library = `<div class="figuration-controls"><label>Saved figure <select data-comp-field="figuresaved"><option value="">Choose a figure</option>${f.saved.map(p => option(p.id, p.name, o.saved)).join('')}</select></label>${button('load', 'Open', !o.saved)}${button('delete', 'Delete saved', !o.saved)}${button('refresh', 'Refresh list')}${button('import', 'Import figure…')}</div>${f.libraryError ? `<p role="status">${esc(f.libraryError)}</p>` : ''}`;
  const scope = `<label>Apply to <select data-comp-field="figurescope">${[
    ['selected', 'Selected chord'],
    ['loop', 'Chords starting in loop'],
    ['all', 'Whole progression']
  ]
    .map(([k, n]) => option(k, n, o.scope))
    .join('')}</select></label>`;
  const notices = [
    ...f.errors.map(e => `<p class="figuration-error" role="alert">${esc(e.message)}</p>`),
    ...f.warnings.map(e => `<p role="status">${esc(e.message)}</p>`)
  ].join('');
  if (!f.editor)
    return `<details class="comp-panel figuration-panel" ${f.open || f.errors.length ? 'open' : ''}><summary>Figuration${f.attachments.length ? ` ? ${f.attachments.length} attached` : ''}${f.errors.length ? ` ? ${f.errors.length} errors` : ''}${f.warnings.length ? ` ? ${f.warnings.length} overlap warnings` : ''}</summary><p>Draw or generate a reusable figure from the chord overlay, then apply it to your harmonies.</p><div class="figuration-controls">${button('new', 'New figure', !chord)}${button('edit', 'Edit attached figure', !attached)}${button('detach', 'Detach to notes', !attached)}${button('remove', 'Remove figure', !attached)}${v.project.figuration ? `<label><input type="checkbox" data-comp-field="soundHarmony" ${v.project.figuration.soundHarmony ? 'checked' : ''}> Sound harmony</label>` : ''}</div>${library}${notices}</details><input type="file" data-comp-figure-file accept=".json,application/json" hidden>`;
  const count = orderedChord(v.project.context, chord).length;
  const generationControls = `<label>Range <select data-comp-field="figurerange">${[
    ['board', 'Whole HexBoard (automatic)'],
    ['manual', 'Manual octave limits']
  ]
    .map(([k, n]) => option(k, n, o.range))
    .join('')}</select></label><label>Voices <select data-comp-field="figureparts">${[
    [1, '1 · flowing line'],
    [2, '2 · bass + treble'],
    [3, '3 · bass + middle + treble'],
    [4, '4 · bass + two middle + treble']
  ]
    .map(([k, n]) => option(k, n, o.parts))
    .join('')}</select></label>`;
  return `<section class="comp-panel figuration-panel is-editing" aria-label="Figuration editor"><div class="figuration-controls"><h3>Draw a figure</h3><label>Name <input data-comp-field="figurename" value="${esc(o.name)}" maxlength="80"></label><label>Cycle <input type="number" data-comp-field="figurelength" min="0.0010416667" step="0.25" max="128" value="${v.melodyClip.lengthTick / PPQ}"> quarter notes</label>${button('done', 'Return to composition')}</div><p>Draw in the roll below. Tones 1–${count} follow the reference chord from low to high. Empty time is a rest. Use the grid, selection and velocity tools to shape the figure. Automatic generation fits playable chord tones across the saved board, with an accented bass and independent moving upper voices.${!f.hasOctave ? ' This overlay supports written pitches only.' : ''}</p><div class="figuration-controls">${generationControls}<label>Contour <select data-comp-field="figurecontour">${['rising', 'falling', 'alternating', 'random'].map(k => option(k, k, o.contour)).join('')}</select></label><label>Lowest octave <input type="number" data-comp-field="figurelowOctave" min="-8" max="8" value="${o.lowOctave}" ${!f.hasOctave || o.range === 'board' ? 'disabled' : ''}></label><label>Highest octave <input type="number" data-comp-field="figurehighOctave" min="-8" max="8" value="${o.highOctave}" ${!f.hasOctave || o.range === 'board' ? 'disabled' : ''}></label><label>Rests % <input type="number" data-comp-field="figurerests" min="0" max="100" value="${o.rests}"></label><label>Velocity <input type="number" data-comp-field="figurevelocity" min="1" max="127" value="${o.velocity}"></label>${button('generate', 'Generate')}${button('reroll', 'Reroll')}${button('audition', 'Audition')}</div><div class="figuration-controls"><label>Tone <select data-comp-field="figurevoice">${Array.from({length: count}, (_, i) => option(i + 1, i + 1, o.voice ?? 1)).join('')}</select></label><label>Octave <input type="number" data-comp-field="figureoctave" min="-8" max="8" value="${o.octave ?? 0}" ${!f.hasOctave ? 'disabled' : ''}></label>${button('tone', v.selected?.size ? 'Set selected tones' : 'Add at playhead')}</div><div class="figuration-controls">${button('save', 'Save')}${button('save-as', 'Save as')}${button('export', 'Export figure…')}${scope}${button('apply', 'Apply as a new pattern')}${button('update', 'Update attached pattern', !f.localPatternId)}</div><p class="viewnote">Applying embeds a copy in the composition. Updating an attached pattern updates every chord using that copy; saving to the library alone leaves compositions unchanged.</p>${library}${notices}</section><input type="file" data-comp-figure-file accept=".json,application/json" hidden>`;
}
