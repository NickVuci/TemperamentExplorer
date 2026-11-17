// Markup of the Prelude panel: harmony plan, figure and practice ladder. No state of its own.
import {esc, option} from '../ui/ui.mjs';
import {
  PRELUDE_TEMPLATES,
  PRELUDE_FIGURES,
  PRELUDE_DIVISIONS,
  PRELUDE_SUSTAINS,
  PRELUDE_DISSONANCES,
  PRELUDE_HANDS,
  PRELUDE_FUNCTIONS,
  figureSequence
} from './composition-prelude.mjs';

export const PRACTICE_STAGES = Object.freeze([
  {
    id: 'harmonies',
    name: 'The harmonies',
    note: 'Hold each harmony as a chord, at your own pace.'
  },
  {id: 'bass', name: 'The bass line', note: 'The lowest voice alone, through the whole figure.'},
  {id: 'top', name: 'The top voice', note: 'The highest voice alone, through the whole figure.'},
  {
    id: 'one',
    name: 'One harmony',
    note: 'The figure on the selected harmony, repeated until it is easy.'
  },
  {id: 'sections', name: 'Section by section', note: 'Each part of the form, at your own pace.'},
  {id: 'whole', name: 'The whole prelude', note: 'Every note in order, at your own pace.'},
  {
    id: 'time',
    name: 'In time',
    note: 'With the pulse, from 60% speed, five percent faster after each clean pass.'
  }
]);
const SECTION_NAMES = {
  frame: 'Opening frame',
  motion: 'Bass motion',
  pedal: 'Pedal and cadence',
  close: 'Close'
};

/** Every rung of the ladder in order, the sections one by one: [{id, name}]. */
export function practiceRungs(sections = []) {
  return PRACTICE_STAGES.flatMap(s =>
    s.id === 'sections'
      ? sections.map((x, i) => ({id: `sections:${i}`, name: SECTION_NAMES[x.group] ?? x.group}))
      : [{id: s.id, name: s.name}]
  );
}

const button = (action, label, {disabled = false, pressed = null, extra = '', cls = ''} = {}) =>
  `<button data-comp="prelude-${action}" ${cls ? `class="${cls}"` : ''} ${disabled ? 'disabled' : ''} ${pressed === null ? '' : `aria-pressed="${pressed}"`} ${extra}>${label}</button>`;
// One setting: its label and its choices as a row of buttons, the chosen one pressed. A choice is
// [value, name, tooltip?]. Only a list too long to scan (a large scale's degrees) falls back to a menu.
const select = (field, label, choices, value) => {
  const control =
    choices.length > 24
      ? `<select data-comp-field="prelude${field}" aria-label="${esc(label)}">${choices.map(([k, n]) => option(k, n, value)).join('')}</select>`
      : `<div class="prelude-seg" role="group" aria-label="${esc(label)}">${choices
          .map(
            ([k, n, tip]) =>
              `<button data-comp="prelude-set" data-field="${field}" data-value="${esc(String(k))}" aria-pressed="${String(k) === String(value)}"${tip ? ` title="${esc(tip)}"` : ''}>${esc(String(n))}</button>`
          )
          .join('')}</div>`;
  return `<div class="prelude-field"><span class="prelude-label">${esc(label)}</span>${control}</div>`;
};

/** Which voice sounds on each attack: voices as rows (top voice first), attacks as columns. */
function figureDiagram(figure, voices, steps) {
  const sequence = figureSequence(figure, voices, steps),
    w = 12,
    h = 9,
    width = steps * w,
    height = voices * h;
  const rules = Array.from(
    {length: voices},
    (_, v) =>
      `<line x1="0" x2="${width}" y1="${(voices - 1 - v) * h + h / 2}" y2="${(voices - 1 - v) * h + h / 2}"/>`
  ).join('');
  const dots = sequence
    .map(
      (v, i) =>
        `<circle cx="${i * w + w / 2}" cy="${(voices - 1 - v) * h + h / 2}" r="3"${v === 0 ? ' class="is-bass"' : ''}/>`
    )
    .join('');
  return `<svg class="prelude-figure-diagram" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true">${rules}${dots}</svg>`;
}

// A chart cell is this wide, and its voicing this tall, in CSS pixels (style.css: .harm-cell).
const CELL_W = 72,
  VOICING_H = 46;

/**
 * One harmony's voicing on the piece's whole pitch range: a dot per voice, with the bass line and
 * the top voice drawn through to the neighbouring cells, so the lines read across the chart.
 */
function voicing(slots, index, lo, hi) {
  const slot = slots[index];
  if (!slot.cents?.length) return `<span class="harm-voicing"></span>`;
  const pad = 7,
    y = c => VOICING_H - pad - ((c - lo) * (VOICING_H - 2 * pad)) / Math.max(1, hi - lo),
    mid = CELL_W / 2,
    f = n => n.toFixed(1);
  const line = (pick, cls) => {
    const here = y(pick(slot)),
      edge = (other, x) => (other?.cents?.length ? [`${x},${f((y(pick(other)) + here) / 2)}`] : []);
    const points = [
      ...edge(slots[index - 1], 0),
      `${mid},${f(here)}`,
      ...edge(slots[index + 1], CELL_W)
    ];
    return points.length > 1 ? `<polyline class="${cls}" points="${points.join(' ')}"/>` : '';
  };
  const last = slot.cents.length - 1;
  return `<svg class="harm-voicing" viewBox="0 0 ${CELL_W} ${VOICING_H}" width="${CELL_W}" height="${VOICING_H}" aria-hidden="true">${line(s => s.cents.at(-1), 'is-top')}${line(s => s.cents[0], 'is-bass')}${slot.cents
    .map(
      (c, v) =>
        `<circle${v === 0 ? ' class="is-bass"' : v === last ? ' class="is-top"' : ''} cx="${mid}" cy="${f(y(c))}" r="${v === 0 ? 3 : 2.4}"/>`
    )
    .join('')}</svg>`;
}

const DECORATIONS = {suspension: 'suspension', passing: 'passing tone'};
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

const ORDINALS = [
  'Root position',
  '1st inversion',
  '2nd inversion',
  '3rd inversion',
  '4th inversion'
];

/** How a harmony sits on its bass, in words. */
function inversionName(slot) {
  const at = (slot.stands ?? []).indexOf(slot.bass);
  if (at >= 0) return ORDINALS[at] ?? 'Inversion';
  return slot.bass === slot.chord.root ? ORDINALS[0] : `Over ${slot.bass}`;
}

const chordName = slot => {
  const root = slot.chord.root;
  return `${root === null || root === undefined ? '' : `${root} · `}${slot.chord.label}`;
};

/**
 * One harmony as a cell of the chart: its voicing, its root degree (over its bass when that is
 * another degree) and its chord. `span` is its written time, for the playhead.
 */
function chartCell(slots, index, {selected, focusable, range, span}) {
  const slot = slots[index],
    root = slot.chord.root,
    rooted = root !== null && root !== undefined,
    over =
      rooted && slot.bass !== null && slot.bass !== undefined && slot.bass !== root
        ? `<small>/${slot.bass}</small>`
        : '',
    sits = inversionName(slot),
    decoration = slot.decoration ? DECORATIONS[slot.decoration.kind] : '',
    hands = slot.hand
      ? `. Hands: left ${slot.hand.left ?? 'cannot cover it'}, right ${slot.hand.right ?? 'cannot cover it'}`
      : '',
    title = `${PRELUDE_FUNCTIONS[slot.fn] ? `${PRELUDE_FUNCTIONS[slot.fn]}: ` : ''}${chordName(slot)}, ${sits.toLowerCase()}${decoration ? `, with a ${decoration}` : ''}${hands}`;
  return `<li class="harm-cell is-${slot.fn}${selected ? ' is-selected' : ''}"${span ? ` data-start="${span[0]}" data-end="${span[1]}"` : ''}><button data-comp="prelude-slot" data-index="${index}" aria-pressed="${selected}" tabindex="${focusable ? 0 : -1}" title="${esc(title)}">${voicing(slots, index, range[0], range[1])}<b class="harm-root">${rooted ? root : '–'}${over}</b><span class="harm-name">${esc(slot.chord.label)}</span>${decoration ? `<i class="harm-mark">${decoration === 'suspension' ? 'sus' : 'pass'}</i>` : ''}</button><button class="harm-plus" data-comp="prelude-edit" data-kind="add" data-index="${index}" tabindex="-1" aria-label="Repeat this chord" title="Add a chord here: a copy of this one">+</button></li>`;
}

export function renderPrelude(v) {
  const m = v.prelude;
  if (!m) return '';
  const o = m.options,
    draft = m.draft,
    slots = draft?.slots ?? [],
    n = v.project.context.scale.n;
  const sourceNote = !draft
    ? ''
    : draft.plan.source === 'own'
      ? 'from your chord lane'
      : draft.plan.source === 'directory'
        ? 'chords from the chord directory'
        : draft.plan.source === 'mixed'
          ? 'directory chords, with scale triads where it lists none'
          : m.directoryNote;
  const suspensions = slots.filter(x => x.decoration?.kind === 'suspension').length,
    passing = slots.filter(x => x.decoration?.kind === 'passing').length;
  const decorationNote =
    o.dissonance === 'none' || !draft
      ? ''
      : ` ${[
          plural(suspensions, 'suspension'),
          ...(o.dissonance === 'all' ? [plural(passing, 'passing tone')] : [])
        ].join(
          ', '
        )}.${draft.timing.repeats === 2 ? '' : ' They need the figure twice per harmony.'}`;
  const empty = !o.custom.length && o.plan === 'custom';
  const status =
    m.error && !empty
      ? `<span class="prelude-error" role="alert">${esc(m.error)}</span>`
      : draft
        ? `${plural(slots.length, 'harmony', 'harmonies')} · ${draft.lengthTick / (draft.timing.harmony / o.bars)} bars · ${esc(sourceNote)}`
        : '';
  const edit = (kind, label, value = '', disabled = false, action = 'edit', tip = '') =>
    `<button data-comp="prelude-${action}" data-kind="${kind}" data-value="${value}" ${tip ? `title="${esc(tip)}"` : ''} ${disabled ? 'disabled' : ''}>${label}</button>`;
  const keep = (id, summary, body) =>
    `<details class="prelude-more" data-keep="${id}" ${m.more?.has(id) ? 'open' : ''}><summary>${summary}</summary>${body}</details>`;
  // The chart: sections in order, each a run of harmonies. A plan-made prelude shows as one.
  const names = o.plan === 'custom' ? o.sections : ['Prelude'];
  const sectionOf = slot => (o.plan === 'custom' ? (slot.section ?? 0) : 0);
  const all = slots.flatMap(x => x.cents ?? []),
    range = [Math.min(...all), Math.max(...all)];
  // Where each harmony sounds, while the composition holds exactly what the chart shows.
  const spans = new Map();
  if (m.written && !m.stale)
    for (const h of draft?.harmonies ?? []) {
      const at = spans.get(h.source.slot),
        end = h.startTick + h.durationTick;
      spans.set(h.source.slot, at ? [at[0], Math.max(at[1], end)] : [h.startTick, end]);
    }
  const focused = m.selectedSlot ?? 0;
  const chart = names
    .map((name, at) => {
      const on = m.selectedSection === at,
        cells = slots
          .map((slot, i) =>
            sectionOf(slot) === at
              ? chartCell(slots, i, {
                  selected: m.selectedSlot === i,
                  focusable: focused === i,
                  range,
                  span: spans.get(i)
                })
              : ''
          )
          .join('');
      return `<section class="harm-section${on ? ' is-selected' : ''}" data-section="${at}"><button class="harm-section-name" data-comp="prelude-section" data-index="${at}" aria-pressed="${on}" title="${esc(name)}: select and hear this section. Drag to reorder.">${esc(name)}</button><ol class="harm-cells">${cells}</ol></section>`;
    })
    .join('');
  const picked = m.selectedSlot === null ? null : (slots[m.selectedSlot] ?? null);
  const after = m.selectedSection === null ? null : (names[m.selectedSection] ?? null);
  const palette = `<div class="harm-add"><span class="prelude-label">${empty ? 'Start with a section' : after === null ? 'Add a section at the end' : `Add a section after ${esc(after)}`}</span><div class="harm-templates">${PRELUDE_TEMPLATES.map(
    t =>
      `<button data-comp="prelude-template" data-value="${t.id}" title="${esc(t.note)}">${esc(t.name)}</button>`
  ).join('')}</div></div>`;
  const rootChoices = (m.chordsByRoot ?? []).map((list, i) => [
    i,
    i,
    `Degree ${i}${list[0] ? `: ${list[0]}` : ''}`
  ]);
  const keys = [
    ['← →', 'select'],
    ['Shift ← →', 'move'],
    ['↑ ↓', 'root'],
    ['C', 'colour'],
    ['I', 'inversion'],
    ['PgUp PgDn', 'register'],
    ['Ctrl D', 'repeat'],
    ['Del', 'remove']
  ];
  // What the selection offers: a chord's harmony and place, or a section's name and place.
  const inspector = picked
    ? `<div class="harm-inspector" role="group" aria-label="Selected chord"><p class="harm-what"><b>${esc(chordName(picked))}</b><span>${esc(inversionName(picked))} · chord ${m.selectedSlot + 1} of ${slots.length}</span></p><div class="harm-fields">${select('edit-root', 'Root', rootChoices, picked.chord.root)}${
        (m.chordsByRoot[picked.chord.root] ?? []).length > 1
          ? select(
              'edit-chord',
              'Colour',
              m.chordsByRoot[picked.chord.root].map((label, i) => [i, label]),
              picked.choice
            )
          : ''
      }${select(
        'edit-bass',
        'Inversion',
        (picked.stands ?? [])
          .map((degree, i) => [
            degree,
            i ? (ORDINALS[i] ?? `${i}th inversion`).split(' ')[0] : 'Root',
            `${ORDINALS[i] ?? `Inversion ${i}`}: bass on degree ${degree}`
          ])
          .filter(x => x[0] !== null),
        picked.bass
      )}${select(
        'edit-lift',
        'Register',
        [
          [-1, 'Lower'],
          [0, 'As led'],
          [1, 'Higher']
        ],
        picked.lift ?? 0
      )}<div class="prelude-field"><span class="prelude-label">Place</span><div class="harm-actions">${edit('move', '←', -1, m.selectedSlot === 0, 'edit', 'Swap with the chord before')}${edit('move', '→', 1, m.selectedSlot === slots.length - 1, 'edit', 'Swap with the chord after')}${edit('add', 'Repeat', '', false, 'edit', 'Add a copy after this chord')}${edit('lead', 'Lead-in', '', false, 'edit', 'Add the harmony that leads into this chord, before it')}${edit('remove', 'Remove', '', slots.length < 2)}</div></div></div><p class="harm-keys">${keys.map(([k, what]) => `<span><kbd>${k}</kbd> ${what}</span>`).join('')}</p></div>`
    : after !== null && o.plan === 'custom'
      ? `<div class="harm-inspector" role="group" aria-label="Selected section"><p class="harm-what"><b>${esc(after)}</b><span>Section ${m.selectedSection + 1} of ${names.length} · ${plural(slots.filter(x => sectionOf(x) === m.selectedSection).length, 'harmony', 'harmonies')}</span></p><div class="harm-fields"><label class="prelude-field"><span class="prelude-label">Name</span><input data-comp-field="preludesection-name" value="${esc(after)}" maxlength="32" autocomplete="off"></label><div class="prelude-field"><span class="prelude-label">Place</span><div class="harm-actions">${edit('move', '←', -1, m.selectedSection === 0, 'section-edit', 'Move this section earlier')}${edit('move', '→', 1, m.selectedSection === names.length - 1, 'section-edit', 'Move this section later')}${edit('copy', 'Repeat', '', false, 'section-edit', 'Add a copy after this section')}${edit('remove', 'Remove', '', false, 'section-edit')}</div></div></div><p class="harm-keys">Drag the name to move the section. A new section is added after this one.</p></div>`
      : `<div class="harm-inspector is-idle"><p class="prelude-note">Select a chord to change its root, colour, inversion or register. Select a section’s name to rename, move, repeat or remove it. Drag either one to a new place.</p></div>`;
  const settings = keep(
    'harmony',
    'Settings',
    `<div class="prelude-controls">${select(
      'home',
      'Home degree',
      Array.from({length: n}, (_, i) => [i, i]),
      o.home
    )}${select(
      'voices',
      'Voices',
      [
        [3, 3],
        [4, 4],
        [5, 5]
      ],
      o.voices
    )}${select('hand', 'Hands', PRELUDE_HANDS, o.hand)}</div>`
  );
  const harmony = `<li class="prelude-step is-harmony"><h4><span class="prelude-num">1</span>Harmony</h4>${
    empty
      ? '<p class="prelude-note">Build the harmony from sections. Pick one to begin; add more to make a whole piece. Every section and chord can be changed afterwards.</p>'
      : `<div class="harm-chart">${chart}</div>${inspector}`
  }${palette}<p class="prelude-status" role="status">${status}</p>${settings}</li>`;
  const steps = draft?.timing.steps ?? 8;
  const figure = `<li class="prelude-step is-figure"><h4><span class="prelude-num">2</span>Figure</h4><div class="prelude-figures" role="group" aria-label="Figure">${PRELUDE_FIGURES.map(
    f =>
      `<button data-comp="prelude-figure" data-value="${f.id}" aria-pressed="${o.figure === f.id}" title="${esc(f.note)}">${figureDiagram(f.id, o.voices, Math.min(steps, 16))}<span>${esc(f.name)}</span></button>`
  ).join(
    ''
  )}</div><div class="prelude-actions">${button('hear', 'Hear the harmonies', {disabled: !draft})}${button('listen', 'Listen', {disabled: !m.written, cls: 'primary'})}</div><p class="prelude-status" role="status">${esc(decorationNote.trim())}</p>${keep(
    'figure',
    'Settings',
    `<div class="prelude-controls">${select('division', 'Notes', PRELUDE_DIVISIONS, o.division)}${select(
      'bars',
      'Harmony',
      [
        [0.5, '½ bar'],
        [1, '1 bar'],
        [2, '2 bars']
      ],
      o.bars
    )}${select(
      'repeats',
      'Per harmony',
      [
        [1, 'Once'],
        [2, 'Twice']
      ],
      o.repeats
    )}${select('sustain', 'Touch', PRELUDE_SUSTAINS, o.sustain)}${select(
      'variety',
      'Development',
      [
        ['strict', 'One figure'],
        ['developing', 'Develops with the form']
      ],
      o.variety
    )}${select('dissonance', 'Dissonance', PRELUDE_DISSONANCES, o.dissonance)}</div>`
  )}</li>`;
  const done = id => !!m.practice?.[id];
  const upNext =
    m.written && !m.stale ? practiceRungs(m.sections).find(r => !done(r.id))?.id : null;
  const stageButton = s => {
    if (s.id !== 'sections')
      return `<li class="${done(s.id) ? 'is-done' : ''}">${button('practice', `<b>${esc(s.name)}</b><small>${esc(s.note)}</small>`, {disabled: !m.written || m.stale, cls: upNext === s.id ? 'is-next' : '', extra: `data-value="${s.id}"`})}<span class="prelude-done" aria-label="${done(s.id) ? 'Completed' : 'Not yet completed'}">${done(s.id) ? '✓' : ''}</span></li>`;
    const parts = (m.sections ?? [])
      .map((x, i) => {
        const key = `sections:${i}`;
        return button(
          'practice',
          `${esc(SECTION_NAMES[x.group] ?? x.group)}${done(key) ? ' ✓' : ''}`,
          {
            disabled: !m.written || m.stale,
            cls: done(key) ? 'is-done' : upNext === key ? 'is-next' : '',
            extra: `data-value="${key}"`
          }
        );
      })
      .join('');
    const all = (m.sections ?? []).length > 0 && m.sections.every((_, i) => done(`sections:${i}`));
    return `<li class="prelude-stage-sections${all ? ' is-done' : ''}"><div><b>${esc(s.name)}</b><small>${esc(s.note)}</small><div class="prelude-section-buttons">${parts || '<small>Add a section to see its parts.</small>'}</div></div><span class="prelude-done" aria-label="${all ? 'Completed' : 'Not yet completed'}">${all ? '✓' : ''}</span></li>`;
  };
  const practice = `<li class="prelude-step is-practice"><h4><span class="prelude-num">3</span>Practice on the HexBoard</h4><p class="prelude-note">From the bare harmonies to the finished piece. Each stage lights the keys to press; a connected HexBoard lights with it.</p><ol class="prelude-ladder">${PRACTICE_STAGES.map(stageButton).join('')}</ol></li>`;
  return `<details class="comp-panel prelude-panel" ${m.open ? 'open' : ''}><summary>Prelude${m.written ? ` · ${plural(slots.length || m.count, 'harmony', 'harmonies')}` : ''}</summary><ol class="prelude-steps">${harmony}${figure}${practice}</ol></details>`;
}
