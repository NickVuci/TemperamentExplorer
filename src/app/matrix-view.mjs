// Discover's interval matrix: every interval of the current scale, labelled with the JI targets it
// approximates and coloured by its error.
import {ratioWithinJILimits} from '../core/ji-limit-engine.mjs';
import {octavePeriods} from '../core/pitch.mjs';
import {matrixScale, matrixInterval, matrixWindow} from '../core/matrix.mjs';
import {createTargetClassifier} from '../core/engine.mjs';
import {errorColor} from '../core/ji-error-color.mjs';
import {option, fixed as fmt, signedFixed as sign} from '../ui/ui.mjs';

/** The target nearest to a pitch in cents, including the unison and the octave. */
export function nearestTarget(c, ts) {
  return [...ts, {c: 1200, label: '2/1'}].reduce(
    (a, t) => (Math.abs(t.c - c) < Math.abs(a.c - c) ? t : a),
    {c: 0, label: '1/1'}
  );
}

/** The targets plus the unison, the octave and a non-2 basis prime, where the limits allow them. */
export function allTargets(ts, s, cfg) {
  const extras = [
    {n: 1, d: 1, label: '1/1', c: 0},
    {n: 2, d: 1, label: '2/1', c: 1200},
    ...(s.basis[0] === 2
      ? []
      : [{n: s.basis[0], d: 1, label: `${s.basis[0]}/1`, c: 1200 * Math.log2(s.basis[0])}])
  ];
  return [
    ...extras.filter(t =>
      ratioWithinJILimits(t.n, t.d, {oddLimit: cfg.limit, primeLimit: cfg.primeLimit})
    ),
    ...ts
  ];
}

/** The classified targets that the target display filter shows for one interval. */
export function visibleTargets(match, cfg) {
  const hasMappedHit = match.mapped.some(t => t.within);
  const hits = match.hits.filter(t => !hasMappedHit || t.reason !== 'Outside temperament basis');
  return [
    ...(cfg.filter === 'hits' ? [] : match.mapped.filter(t => t.within || cfg.outside)),
    ...(cfg.filter === 'mapped' ? [] : hits)
  ];
}

function targetMarkup(t) {
  return `<span class="target-chip ${t.identity ? (t.within ? 'target-mapped' : 'target-outside') : 'target-hit'}"><small>${t.identity ? (t.within ? 'M' : 'M×') : t.reason === 'Outside temperament basis' ? 'O' : 'A'}</small> ${t.label}</span>`;
}

function targetCellMarkup(items) {
  if (!items.length) return '—';
  const first = targetMarkup(items[0]);
  return `<span class="target-cell-content">${first}${items.length > 1 ? `<small class="target-more">+${items.length - 1}</small>` : ''}</span>`;
}

/** The one-period or whole-octave choice for a temperament with a divided octave. */
export function spanControl(s, idx, label = 'Matrix span') {
  if (octavePeriods(s) <= 1) return '';
  const m = matrixScale(s),
    value = m.periods === 1 ? 'period' : 'octave';
  return `<div class="span-control"><label>${label}<select data-matrix-span="${idx}">${option('period', 'One period', value)}${option('octave', 'Whole octave', value)}</select></label><p>${m.periods > 1 ? `${m.periods} repeated periods · ${m.n} notes · tempered octave ${fmt(m.p, 4)} ¢` : `${s.n} notes · one period ${fmt(s.p, 4)} ¢`}</p></div>`;
}

/**
 * The matrix for a scale under the shared JI settings. `page` is the requested [row, column] page;
 * the result carries the page actually shown, which stays within range.
 */
export function renderMatrix(s, cfg, page = [0, 0]) {
  const classify = createTargetClassifier(s, allTargets(cfg.ts, s, cfg), cfg.tol),
    ascending = cfg.layout === 'distance',
    m = matrixScale(s),
    notes = m.notes,
    w = matrixWindow(m, ascending, ...page);
  let body =
    '<thead><tr><th scope="col" title="Starting note in cents">¢</th>' +
    Array.from({length: w.colEnd - w.colStart}, (_, x) => {
      const j = x + w.colStart;
      return `<th scope="col">${j === m.n ? '(' + j + ')' : j}</th>`;
    }).join('') +
    '</tr></thead><tbody>';
  for (let i = w.rowStart; i < w.rowEnd; i++) {
    body += `<tr><th scope="row" title="Starting note ${i}: ${fmt(notes[i].c, 4)} cents">${fmt(notes[i].c, 1)}</th>`;
    for (let j = w.colStart; j < w.colEnd; j++) {
      const v = matrixInterval(m, i, j, cfg.layout),
        c = v.c,
        match = classify(v),
        shown = visibleTargets(match, cfg);
      const text =
        cfg.labels === 'cents'
          ? fmt(c, 1)
          : cfg.labels === 'generators'
            ? (v.k > 0 ? '+' : '') + v.k
            : targetCellMarkup(shown);
      const colorTarget = shown.find(t => t.identity) || shown[0],
        color = colorTarget ? errorColor(colorTarget.error, cfg.maxError) : '#1c2531',
        ink = colorTarget ? '#11151c' : '';
      body += `<td><button class="cell ${cfg.labels === 'ratios' ? 'ratio-cell' : ''}" style="background:${color}${ink ? `;color:${ink}` : ''}" data-cell="${i},${j}" aria-label="Scale, starting note ${fmt(notes[i].c, 1)} cents, ${ascending ? 'ascending step' : 'destination degree'} ${j}, ${fmt(c)} cents" title="${fmt(c, 4)} ¢${shown.map(t => ` · ${t.identity ? (t.within ? 'Mapped' : 'Mapped outside tolerance') : t.reason === 'Outside temperament basis' ? 'Outside subgroup' : 'Alternative approximation'} ${t.label}: ${sign(t.error)} ¢`).join('')}">${text}</button></td>`;
    }
    body += '</tr>';
  }
  const pages =
    w.rowPages > 1 || w.colPages > 1
      ? `<div class="matrix-pages">${[
          ['Rows', w.rowStart, w.rowEnd, m.n, w.rowPage, w.rowPages, 0],
          ['Columns', w.colStart, w.colEnd, m.n + (ascending ? 1 : 0), w.colPage, w.colPages, 1]
        ]
          .map(
            ([label, start, end, total, current, count, axis]) =>
              `<span>${label} ${start}–${end - 1} / ${total} <button data-matrix-page="0,${axis},${current - 1}" ${current === 0 ? 'disabled' : ''} aria-label="Previous ${label.toLowerCase()}">←</button><button data-matrix-page="0,${axis},${current + 1}" ${current === count - 1 ? 'disabled' : ''} aria-label="Next ${label.toLowerCase()}">→</button></span>`
          )
          .join('')}</div>`
      : '';
  return {
    page: [w.rowPage, w.colPage],
    html: `<div class="matrixbox"><div class="matrixheading" data-matrix-labels-host></div>${octavePeriods(s) > 1 ? `<div class="matrix-span">${spanControl(s, 0)}</div>` : ''}${pages}<p class="viewnote matrix-chord-hint">Shift-click cells to build a chord from their scale degrees.</p><div class="matrixscroll"><table class="matrix" style="--matrix-columns:${w.colEnd - w.colStart}" aria-label="Scale interval matrix">${body}</tbody></table></div><div class="matrix-options-host" data-matrix-controls-host></div></div>`
  };
}
