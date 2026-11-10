// Discover's interval matrix: every interval of the current scale, labelled with the JI targets it
// approximates and coloured by its error.
import {ratioWithinJILimits} from '../core/ji-limit-engine.mjs';
import {octavePeriods} from '../core/pitch.mjs';
import {matrixScale, matrixInterval, matrixWindow} from '../core/matrix.mjs';
import {createTargetClassifier, classifyTargets} from '../core/engine.mjs';
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

/**
 * The matrix in the running app: paging, the cell inspector, Shift-click chord picks, cell labels
 * and the span choice. deps: `getState()`, `settings(s)`, `isShown()` (the matrix is the centre
 * view), `play(pitches)`, `focus` (the focus sync), `buildChord(i, j)`, `render()` (redraws the
 * workspace), `notify(message)` and optional `document`.
 */
export function createMatrixPane(deps) {
  const doc = () => deps.document ?? globalThis.document,
    $ = selector => doc().querySelector(selector);
  let page = [0, 0],
    selected = null;

  function html() {
    const s = deps.getState(),
      result = renderMatrix(s, deps.settings(s), page);
    page = result.page;
    return result.html;
  }

  function hideInspector() {
    $('#inspector').replaceChildren();
    $('#inspector').hidden = true;
  }

  // Describes one interval and its targets, and offers to explore it or build a chord from it.
  function inspect(i, j, play = true) {
    const s = deps.getState(),
      cfg = deps.settings(s),
      m = matrixScale(s);
    if (i >= m.n || j > m.n || (j === m.n && cfg.layout !== 'distance')) {
      selected = null;
      hideInspector();
      return;
    }
    const v = matrixInterval(m, i, j, cfg.layout),
      match = classifyTargets(s, v, allTargets(cfg.ts, s, cfg), cfg.tol);
    selected = [i, j];
    const describe = t => `${t.label} (${sign(t.error)} ¢${t.within ? '' : ', outside tolerance'})`;
    $('#inspector').innerHTML =
      `<b>${i} → ${v.end}${v.period ? (m.periods > 1 ? ' + octave' : ' + period') : ''}</b> &nbsp; ${fmt(v.c, 4)} ¢ · ${v.k} generators.<br><span class="target-mapped">Mapped:</span> ${match.mapped.length ? match.mapped.map(describe).join('; ') : 'none in this target set'}.<br><span class="target-hit">Other approximations:</span> ${match.hits.length ? match.hits.map(t => describe(t) + ' · ' + t.reason.toLowerCase()).join('; ') : 'none within tolerance'}.<br><button data-explore="cell" data-s="0" data-m="${Math.round((v.c - v.k * s.g) / s.p)},${v.k}">Explore a target for this interval</button>${m.periods === 1 ? `<button data-buildchord="0,${i},${v.end}">Build a chord from this interval</button>` : ''}`;
    $('#inspector').hidden = false;
    if (play) deps.play([m.notes[i].c, m.notes[i].c + v.c]);
  }

  // Label changes update existing cells so scrolling, focus and matrix placement stay intact.
  function refreshLabels() {
    if (!deps.isShown()) return;
    const template = doc().createElement('template');
    template.innerHTML = html();
    const cells = doc().querySelectorAll('.matrix [data-cell]'),
      next = template.content.querySelectorAll('.matrix [data-cell]');
    cells.forEach((cell, i) => {
      if (!next[i]) return;
      cell.innerHTML = next[i].innerHTML;
      cell.classList.toggle('ratio-cell', $('#labels').value === 'ratios');
    });
    doc()
      .querySelectorAll('[data-label]')
      .forEach(b => {
        const active = b.dataset.label === $('#labels').value;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
    deps.focus.applyFocus();
  }

  return {
    html,
    refreshLabels,
    /** Forgets the inspected interval. */
    deselect() {
      selected = null;
    },
    /** Returns to the first page, for a new scale. */
    firstPage() {
      page = [0, 0];
    },
    /** After a workspace redraw: shows the inspected interval again, or hides the inspector. */
    restoreInspector(shown) {
      $('#inspector').hidden = !shown || !selected;
      if (shown && selected) inspect(...selected, false);
    },
    /** Handles a button press in the matrix or its inspector. Returns whether it was the pane's. */
    click(button, shiftKey = false) {
      const {dataset} = button;
      try {
        if (dataset.matrixPage) {
          const [, axis, value] = dataset.matrixPage.split(',').map(Number);
          page[axis] = value;
          deps.render();
        } else if (dataset.cell) {
          const [i, j] = dataset.cell.split(',').map(Number);
          if (shiftKey) deps.focus.pickMatrixCell(i, j);
          else {
            deps.focus.clearMatrixPicks();
            inspect(i, j);
          }
        } else if (dataset.label) {
          $('#labels').value = dataset.label;
          refreshLabels();
        } else if (dataset.buildchord) {
          const [, i, j] = dataset.buildchord.split(',').map(Number);
          deps.buildChord(i, j);
        } else return false;
      } catch (error) {
        deps.notify(error.message);
      }
      return true;
    },
    /** Handles the span choice. Returns whether it was the pane's. */
    change(el) {
      if (el.dataset.matrixSpan === undefined) return false;
      deps.getState().matrixOctave = el.value === 'octave';
      page = [0, 0];
      selected = null;
      hideInspector();
      deps.render();
      return true;
    }
  };
}
