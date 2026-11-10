// The readout beside the tonality diamond: the selected or playing interval, or the chord the
// active cells form, as JI against tempered cents.
import {errorColor} from '../core/ji-error-color.mjs';
import {coordinate} from '../core/assignments.mjs';
import {esc, fixed as fmt, signedFixed as sign} from '../ui/ui.mjs';

function intervalTable(intervals, tol, explanation = '') {
  const memberColor = interval =>
    interval.errorCents === null ? 'var(--muted)' : errorColor(interval.errorCents, tol);
  const ratios = intervals
      .map(interval => `<th scope="col" title="JI interval">${esc(interval.ratio)}</th>`)
      .join(''),
    ideal = intervals
      .map(interval => `<td title="JI cents">${fmt(interval.idealCents, 3)}¢</td>`)
      .join('');
  const tempered = intervals
      .map(
        interval =>
          `<td style="--approximation-color:${memberColor(interval)}" title="Tempered cents"${interval.description ? ` aria-label="${esc(interval.description)}"` : ''}>${interval.temperedCents === null ? '—' : `${fmt(interval.temperedCents, 3)}¢`}</td>`
      )
      .join(''),
    deviations = intervals
      .map(
        interval =>
          `<td style="--approximation-color:${memberColor(interval)}" title="Signed deviation from JI">${interval.errorCents === null ? '—' : `${sign(interval.errorCents)}¢`}</td>`
      )
      .join('');
  return `<table class="diamond-interval-table" aria-label="JI and tempered intervals"><thead><tr>${ratios}</tr><tr>${ideal}</tr></thead><tbody class="diamond-chord-approximation"${explanation ? ` title="${esc(explanation)}"` : ''}><tr>${tempered}</tr><tr>${deviations}</tr></tbody></table>`;
}

/**
 * One diamond cell. It shows the one approximation it sounds (its diamondApproximation status),
 * the same reading the chord readout and playback use for that cell. `tol` colours the error.
 */
export function intervalDetails(cell, tol) {
  const status = cell.status,
    v = status?.approximation ?? null;
  const empty = v
    ? ''
    : status?.source === 'mapping' && !status.mappedCoordinate
      ? 'Outside temperament basis.'
      : 'No interval matches the current target display filter.';
  const intervals = [
    {
      ratio: cell.label,
      idealCents: cell.c,
      temperedCents: v ? v.c : null,
      errorCents: v ? v.error : null,
      ...(v
        ? {
            description: `Tempered cents: ${fmt(v.c, 3)}¢; ${v.mapped ? 'Mapped' : 'Alternative approximation'}; ${coordinate(v.m)}${status.source === 'scale' && !v.available ? '; absent from this scale' : ''}`
          }
        : {})
    }
  ];
  return `<div class="diamond-chord-heading" aria-hidden="true"></div>${intervalTable(intervals, tol)}${empty ? `<p class="viewnote">${esc(empty)}</p>` : ''}`;
}

/** The chord the active cells form, with every note pair's JI and tempered size. */
export function chordDetails(chord, tol) {
  if (!chord) return '';
  const tuning = chord.tuning,
    ratio =
      chord.kind === 'collection'
        ? `${chord.cardinality} pitches`
        : chord.form === 'utonal'
          ? chord.utonal
          : chord.otonal;
  const heading = `<div class="diamond-chord-heading"><h4>${esc(ratio)}</h4></div>`;
  if (!tuning) return heading;
  const explanation = tuning.available
    ? `Total chord error: ${fmt(tuning.totalErrorCents, 3)} cents. Sum of absolute errors across all ${tuning.intervalCount} note pairs.`
    : 'Some notes have no available approximation.';
  return `${heading}${intervalTable(tuning.intervals, tol, explanation)}${tuning.available ? '' : '<p class="viewnote">Some notes have no available approximation.</p>'}`;
}

/**
 * Fills the diamond's detail panel from the diamond workspace's active cells: one interval, or the
 * chord they form. The panel is hidden when no cell is selected or playing. `tolerance()` is read
 * only when there is something to show.
 */
export function fillDiamondDetails(panel, diamond, tolerance) {
  const active = diamond.displayCells(),
    chord = active.length ? diamond.chordDisplay() : null,
    cell = panel.querySelector('[data-diamond-cell-detail]'),
    readout = panel.querySelector('[data-diamond-chord]');
  const single = active.length && !chord ? intervalDetails(active[0], tolerance()) : '',
    chordMarkup = chord ? chordDetails(chord, tolerance()) : '';
  if (cell) {
    cell.hidden = !single;
    cell.innerHTML = single;
  } else panel.innerHTML = chord ? chordMarkup : single;
  if (readout) {
    readout.innerHTML = chordMarkup;
    readout.hidden = !chord;
  }
  panel.hidden = active.length === 0;
}
