// Discover scale module: a summary of the scale's structure, one period drawn as a line or a
// horogram, and a table of every degree. Markup only; app.mjs supplies each degree's JI reading
// and the bass degree, and owns playback, events and the saved view choice.
import {generatedSizes, stepSymbol} from '../core/engine.mjs';
import {errorColor} from '../core/ji-error-color.mjs';
import {esc} from './ui.mjs';

export const SCALE_VIEWS = ['line', 'horogram'];
export const normalizeScaleView = value => (SCALE_VIEWS.includes(value) ? value : 'line');

const fmt = (x, n = 2) => Number(x).toFixed(n);
const signed = (x, n = 0) => (x > 0 ? `+${fmt(x, n)}` : x < 0 ? `−${fmt(-x, n)}` : fmt(0, n));
const STEP_KINDS = {L: 'large', M: 'medium', s: 'small', '=': 'equal'};
const stepKind = symbol => STEP_KINDS[symbol] ?? 'other';
const sameSize = (a, b) => Math.abs(a - b) < 1e-5;

export function scaleViewToggle(view) {
  const current = normalizeScaleView(view);
  const option = (value, label) =>
    `<button type="button" data-scale-view="${value}" aria-pressed="${value === current}" class="${value === current ? 'active' : ''}">${label}</button>`;
  return `<div class="tabs scale-view-toggle" role="group" aria-label="Scale view">${option('line', 'Line')}${option('horogram', 'Horogram')}</div>`;
}

/** Step sizes from largest to smallest, with their symbol and how often each occurs. */
export function scaleStepSummary(a) {
  return [...a.sizes].reverse().map(cents => ({
    symbol: stepSymbol(a, cents),
    cents,
    count: a.steps.filter(v => sameSize(v, cents)).length
  }));
}

// A ring's steps between consecutive notes, classified the same way as the full scale's.
function ringOf(notes, period) {
  const steps = notes.map(
      (v, i) => (i === notes.length - 1 ? period + notes[0].c : notes[i + 1].c) - v.c
    ),
    sizes = [];
  for (const v of steps) if (!sizes.some(x => sameSize(x, v))) sizes.push(v);
  sizes.sort((x, y) => x - y);
  const shape = {equal: sizes.length === 1, sizes, large: sizes.at(-1)},
    symbols = steps.map(v => stepSymbol(shape, v));
  const count = symbol => symbols.filter(x => x === symbol).length;
  const signature =
    sizes.length === 1
      ? `${notes.length} equal`
      : sizes.length === 2
        ? `${count('L')}L ${count('s')}s`
        : `${count('L')}L ${count('M')}M ${count('s')}s`;
  return {
    n: notes.length,
    notes,
    steps: steps.map((size, i) => ({from: notes[i].c, size, symbol: symbols[i]})),
    signature
  };
}

/**
 * Horogram rings from inner to outer: up to `limit` smaller MOS on the same generator chain,
 * then the scale itself. Each smaller MOS is the run of consecutive generators inside the
 * current chain that keeps the tonic and sits at the same relative chain position as the mode,
 * so every inner note lines up with the outer note it becomes.
 */
export function horogramRings(s, a, limit = 3) {
  const n = a.notes.length,
    notes = a.notes.map((v, i) => ({...v, degree: i}));
  if (a.collision || n < 3) return [ringOf(notes, s.p)];
  const kmin = Math.min(...notes.map(v => v.k)),
    tonic = -kmin;
  const sizes = generatedSizes(s)
    .filter(x => (x.mos || x.equal) && x.n >= 2 && x.n < n)
    .map(x => x.n)
    .slice(-limit);
  const inner = sizes.map(m => {
    const lo = Math.max(0, tonic - m + 1),
      hi = Math.min(n - m, tonic),
      offset = Math.min(hi, Math.max(lo, Math.round((tonic * (n - m)) / (n - 1)))),
      start = kmin + offset;
    return ringOf(
      notes.filter(v => v.k >= start && v.k < start + m),
      s.p
    );
  });
  return [...inner, ringOf(notes, s.p)];
}

function summary(s, a, view) {
  const n = a.notes.length,
    steps = scaleStepSummary(a),
    ks = a.notes.map(v => v.k),
    up = Math.max(...ks),
    down = -Math.min(...ks);
  const chips = steps
    .map(
      x =>
        `<span class="scale-step-chip step-${stepKind(x.symbol)}"><b>${x.symbol}</b>${fmt(x.cents)} ¢<small>×${x.count}</small></span>`
    )
    .join('');
  const pattern =
    n <= 64
      ? `<div class="scale-fact scale-fact-pattern"><dt>Step pattern</dt><dd class="scale-pattern" aria-label="${a.steps.map(v => stepSymbol(a, v)).join(' ')}">${a.steps
          .map(v => {
            const symbol = stepSymbol(a, v);
            return `<i class="step-${stepKind(symbol)}">${symbol}</i>`;
          })
          .join('')}</dd></div>`
      : '';
  const hardness = a.mos
    ? `<div class="scale-fact"><dt title="Large step divided by small step">Hardness L/s</dt><dd>${fmt(a.large / a.small, 3)}</dd></div>`
    : '';
  return `<div class="scale-summary"><dl class="scale-facts">
<div class="scale-fact"><dt>Structure</dt><dd><strong>${esc(a.signature)}</strong></dd></div>
<div class="scale-fact scale-fact-steps"><dt>Step sizes</dt><dd class="scale-step-sizes" aria-label="Step sizes">${chips}</dd></div>
${pattern}${hardness}<div class="scale-fact"><dt title="Generators stacked up and down from the tonic in this mode">Generator chain</dt><dd>${up} up · ${down} down</dd></div>
</dl>${scaleViewToggle(view)}</div>`;
}

const degreeButton = (i, c, idx, bassDegree, extra = '', inner = `<span>${i}</span>`, style = '') =>
  `<button type="button" class="scale-degree${i === 0 ? ' root' : ''}${i === bassDegree ? ' is-bass' : ''}${extra}"${style ? ` style="${style}"` : ''} data-note="${i}" data-s="${idx}" data-scale-degree="${i}" title="Degree ${i} · ${fmt(c)} cents · click to play and list the chords built on it" aria-label="Play degree ${i}, ${fmt(c)} cents, and list chords with it as the bass" aria-pressed="${i === bassDegree}">${inner}</button>`;

// One period from the tonic (0 ¢) to the period: each step is a bar as wide as its size and each
// degree sits on its boundary, labelled with its number above and its cents below when there is room
// (the stylesheet hides labels the line's width cannot fit).
function lineView(s, a, idx, bassDegree) {
  const n = a.notes.length,
    at = c => `${((100 * c) / s.p).toFixed(4)}%`,
    density = n > 48 ? ' dense' : n > 24 ? ' compact' : n > 12 ? ' tight' : '',
    roomy = n <= 16;
  const steps = a.steps
    .map((v, i) => {
      const symbol = stepSymbol(a, v);
      return `<span class="scale-line-step step-${stepKind(symbol)}" data-scale-degree="${i}" style="left:${at(a.notes[i].c)};width:${at(v)}" title="Step ${i} → ${i + 1 === n ? 'period' : i + 1}: ${symbol} · ${fmt(v)} cents"><b>${symbol}</b>${roomy ? `<small>${fmt(v, 1)}</small>` : ''}</span>`;
    })
    .join('');
  const notes = a.notes
    .map((v, i) =>
      degreeButton(
        i,
        v.c,
        idx,
        bassDegree,
        ' scale-line-note',
        `<span>${i}</span>`,
        `left:${at(v.c)}`
      )
    )
    .join('');
  const cents =
    n <= 24
      ? a.notes
          .map(
            (v, i) =>
              `<small class="scale-line-cents" data-scale-degree="${i}" style="left:${at(v.c)}">${fmt(v.c, 1)}</small>`
          )
          .join('')
      : '';
  return `<div class="scale-line${density}" role="group" aria-label="Playable scale over one ${fmt(s.p)}-cent period"><div class="scale-line-bar">${steps}</div><i class="scale-line-end" style="left:100%" aria-hidden="true"></i><small class="scale-line-period" style="left:100%" title="Period · ${fmt(s.p)} cents">(${n})</small>${notes}${cents}</div>`;
}

// Horogram (after Erv Wilson): the period is one turn with the tonic at the top. Rings step out
// through smaller MOS on the generator chain to the scale itself; arcs are steps coloured by size,
// and a spoke marks where each degree first appears.
const BOX = 170,
  OUTER = 128,
  GAP = 22;
const point = (c, period, r) => {
  const t = (2 * Math.PI * c) / period;
  return [r * Math.sin(t), -r * Math.cos(t)];
};
const xy = ([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`;
function arc(from, size, period, r, degree) {
  const turn = (2 * Math.PI * size) / period,
    trim = (Math.min(0.03, turn * 0.16) * period) / (2 * Math.PI),
    start = point(from + trim, period, r),
    end = point(from + size - trim, period, r);
  return `M${xy(start)}A${r} ${r} 0 ${turn - (2 * trim * 2 * Math.PI) / period > Math.PI ? 1 : 0} 1 ${xy(end)}`;
}
function horogramView(s, a, idx, bassDegree) {
  const rings = horogramRings(s, a),
    n = a.notes.length,
    count = rings.length,
    radius = i => OUTER - (count - 1 - i) * GAP,
    dense = n > 48,
    labelled = n <= 31;
  const firstRing = new Map();
  rings.forEach((ring, r) =>
    ring.notes.forEach(v => {
      if (!firstRing.has(v.degree)) firstRing.set(v.degree, r);
    })
  );
  const guides = rings.map((_, r) => `<circle class="horogram-guide" r="${radius(r)}"/>`).join('');
  const spokes = a.notes
    .map((v, i) => {
      const r = firstRing.get(i) ?? count - 1;
      if (dense && i) return '';
      return `<line class="horogram-spoke${i === 0 ? ' root' : ''}" data-scale-degree="${i}" x1="${point(
        v.c,
        s.p,
        radius(r)
      )
        .map(x => x.toFixed(2))
        .join('" y1="')}" x2="${point(v.c, s.p, OUTER)
        .map(x => x.toFixed(2))
        .join('" y2="')}"/>`;
    })
    .join('');
  const arcs = rings
    .map((ring, r) => {
      const outer = r === count - 1;
      return `<g class="horogram-ring${outer ? ' current' : ''}"><title>${ring.n} notes · ${esc(ring.signature)}</title>${ring.steps.map((step, i) => `<path class="horogram-step step-${stepKind(step.symbol)}"${outer ? ` data-scale-degree="${i}"` : ''} d="${arc(step.from, step.size, s.p, radius(r))}"/>`).join('')}${outer || ring.n > 48 ? '' : ring.notes.map(v => `<circle class="horogram-dot" r="2.6" cx="${point(v.c, s.p, radius(r))[0].toFixed(2)}" cy="${point(v.c, s.p, radius(r))[1].toFixed(2)}"/>`).join('')}</g>`;
    })
    .join('');
  const labels = labelled
    ? a.notes
        .map((v, i) => {
          const [x, y] = point(v.c, s.p, OUTER + 19);
          return `<text class="horogram-label${i === 0 ? ' root' : ''}" data-scale-degree="${i}" x="${x.toFixed(2)}" y="${y.toFixed(2)}">${i}</text>`;
        })
        .join('')
    : '';
  const center = `<text class="horogram-title" y="-4">${esc(a.signature)}</text><text class="horogram-subtitle" y="16">${n} notes</text>`;
  const at = v => {
    const [x, y] = point(v, s.p, OUTER);
    return `left:${((100 * (x + BOX)) / (2 * BOX)).toFixed(3)}%;top:${((100 * (y + BOX)) / (2 * BOX)).toFixed(3)}%`;
  };
  const notes = a.notes
    .map((v, i) => degreeButton(i, v.c, idx, bassDegree, ' horogram-note', '', at(v.c)))
    .join('');
  const legend = `<ol class="horogram-rings" aria-label="Rings from inner to outer">${rings.map((ring, r) => `<li${r === count - 1 ? ' class="current"' : ''}><b>${ring.n}</b> · ${esc(ring.signature)}</li>`).join('')}</ol>`;
  return `<figure class="scale-horogram${dense ? ' dense' : ''}"><div class="horogram-stage" role="group" aria-label="Playable horogram: one ${fmt(s.p)}-cent period around the circle"><svg viewBox="${-BOX} ${-BOX} ${2 * BOX} ${2 * BOX}" aria-hidden="true">${guides}${spokes}${arcs}${labels}${center}</svg>${notes}</div><figcaption>${legend}</figcaption></figure>`;
}

/**
 * Every degree as a column: its cents, the step to the next degree, its distance in generators
 * from the tonic and the closest visible JI target, coloured by the shared error scale. The final
 * column is the period. `readings` has one entry per degree plus the period.
 */
export function degreeTable(s, a, {idx = 0, bassDegree = -1, readings = [], maxError = 0} = {}) {
  const n = a.notes.length,
    columns = [
      ...a.notes.map((v, i) => ({i, c: v.c, k: v.k, step: a.steps[i]})),
      {i: n, c: s.p, period: true}
    ];
  const cell = (column, content) =>
    `<td${column.period ? ' class="period"' : ` data-scale-degree="${column.i}"`}>${content}</td>`;
  const head = columns
    .map(x =>
      x.period
        ? `<th scope="col" class="period" title="Period">(${n})</th>`
        : `<th scope="col" data-scale-degree="${x.i}">${degreeButton(x.i, x.c, idx, bassDegree, ' scale-table-degree', String(x.i))}</th>`
    )
    .join('');
  const cents = columns.map(x => cell(x, fmt(x.c, 1))).join('');
  const steps = columns
    .map(x => {
      if (x.period) return cell(x, '—');
      const symbol = stepSymbol(a, x.step);
      return cell(
        x,
        `<span class="scale-table-step step-${stepKind(symbol)}"><b>${symbol}</b>${fmt(x.step, 1)}</span>`
      );
    })
    .join('');
  const generators = columns.map(x => cell(x, x.period ? '—' : signed(x.k))).join('');
  const targets = columns
    .map((x, position) => {
      const t = readings[position];
      if (!t) return cell(x, '<span class="scale-ji-empty">—</span>');
      const kind = t.identity
        ? t.within
          ? 'Mapped'
          : 'Mapped outside tolerance'
        : t.reason === 'Outside temperament basis'
          ? 'Outside subgroup'
          : 'Alternative approximation';
      return cell(
        x,
        `<span class="scale-ji${t.identity && t.within ? '' : ' is-alt'}" style="--ji-color:${errorColor(t.error, maxError)}" title="${kind} ${esc(t.label)}: ${signed(t.error, 2)} ¢"><b>${esc(t.label)}</b><small>${signed(t.error, 1)}</small></span>`
      );
    })
    .join('');
  return `<div class="scale-table-wrap"><table class="scale-table" aria-label="Scale degrees"><thead><tr><th scope="row">Degree</th>${head}</tr></thead><tbody><tr><th scope="row">Cents</th>${cents}</tr><tr><th scope="row">Step</th>${steps}</tr><tr><th scope="row" title="Generators from the tonic">Generators</th>${generators}</tr><tr><th scope="row" title="Closest visible JI target and its tempered error in cents">JI target</th>${targets}</tr></tbody></table></div>`;
}

/** Summary, the chosen visual and the degree table, inside Discover's `.scale-details`. */
export function renderScaleView({
  s,
  a,
  idx = 0,
  view = 'line',
  bassDegree = -1,
  readings = [],
  maxError = 0
}) {
  const current = normalizeScaleView(view),
    visual =
      current === 'horogram'
        ? horogramView(s, a, idx, bassDegree)
        : lineView(s, a, idx, bassDegree);
  return `${summary(s, a, current)}<div class="scale-stage scale-stage-${current}">${visual}${degreeTable(s, a, {idx, bassDegree, readings, maxError})}</div>`;
}

// Hovering or focusing any part of a degree lights that degree in the visual and the table.
let linked = null;
export function linkScaleDegree(target, doc = globalThis.document) {
  const node = target?.closest?.('.scale-details [data-scale-degree]') ?? null;
  if (node === linked) return;
  linked = node;
  for (const lit of doc.querySelectorAll('.scale-details .is-linked'))
    lit.classList.remove('is-linked');
  if (node)
    for (const match of doc.querySelectorAll(
      `.scale-details [data-scale-degree="${node.dataset.scaleDegree}"]`
    ))
      match.classList.add('is-linked');
}
