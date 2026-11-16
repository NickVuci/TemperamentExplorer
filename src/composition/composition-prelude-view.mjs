// Markup of the Prelude panel: harmony plan, figure and practice ladder. No state of its own.
import {esc, option} from '../ui/ui.mjs';
import {
  PRELUDE_PLANS,
  PRELUDE_FIGURES,
  PRELUDE_DIVISIONS,
  PRELUDE_SUSTAINS,
  PRELUDE_DISSONANCES,
  PRELUDE_HANDS,
  PRELUDE_DIRECTIONS,
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
// One setting: its label on the left and its choices as a row of buttons, the chosen one pressed.
// Only a list too long to scan (a large scale's degrees) falls back to a menu.
const select = (field, label, choices, value) => {
  const control =
    choices.length > 24
      ? `<select data-comp-field="prelude${field}" aria-label="${esc(label)}">${choices.map(([k, n]) => option(k, n, value)).join('')}</select>`
      : `<div class="prelude-seg" role="group" aria-label="${esc(label)}">${choices
          .map(
            ([k, n]) =>
              `<button data-comp="prelude-set" data-field="${field}" data-value="${esc(String(k))}" aria-pressed="${String(k) === String(value)}">${esc(String(n))}</button>`
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

/** The bass line and the top voice across the plan, with the formal sections shaded. */
function contour(slots) {
  if (!slots.length || !slots[0].cents) return '';
  const all = slots.flatMap(s => s.cents),
    lo = Math.min(...all),
    hi = Math.max(...all),
    W = 600,
    H = 84,
    pad = 8;
  const x = i => pad + ((i + 0.5) * (W - 2 * pad)) / slots.length,
    y = c => H - pad - ((c - lo) * (H - 2 * pad)) / Math.max(1, hi - lo);
  const line = pickCents =>
    slots.map((s, i) => `${x(i).toFixed(1)},${y(pickCents(s)).toFixed(1)}`).join(' ');
  const bands = [];
  slots.forEach((s, i) => {
    const group = s.fn === 'approach' || s.fn === 'cadence' ? 'pedal' : s.fn,
      last = bands.at(-1);
    if (last && last.group === group) last.to = i;
    else bands.push({group, from: i, to: i});
  });
  const step = (W - 2 * pad) / slots.length;
  return `<svg class="prelude-contour" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Bass line and top voice across the plan">${bands
    .map(
      b =>
        `<rect class="is-${b.group}" x="${(pad + b.from * step).toFixed(1)}" y="0" width="${((b.to - b.from + 1) * step - 2).toFixed(1)}" height="${H}"/>`
    )
    .join(
      ''
    )}<polyline class="prelude-contour-top" points="${line(s => s.cents.at(-1))}"/><polyline class="prelude-contour-bass" points="${line(s => s.cents[0])}"/>${slots
    .map(
      (s, i) =>
        `<circle class="prelude-contour-bass" cx="${x(i).toFixed(1)}" cy="${y(s.cents[0]).toFixed(1)}" r="2.6"/>`
    )
    .join('')}</svg>`;
}

const DECORATIONS = {suspension: 'suspension', passing: 'passing tone'};
const plural = (count, one, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

function slotCard(slot, index, selected) {
  const root = slot.chord.root,
    name = `${root === null || root === undefined ? '' : `${root} - `}${slot.chord.label}`,
    bass =
      slot.bass === null || slot.bass === undefined
        ? 'bass outside scale'
        : slot.bass === root
          ? 'root in bass'
          : `bass ${slot.bass}`;
  const more = slot.alternatives.length > 1;
  // Two lines that are always there, so every card keeps its height: the non-chord tone, the hands.
  const decoration = slot.decoration ? DECORATIONS[slot.decoration.kind] : '',
    grade = slot.hand ? (slot.hand.grade ? `hands ${slot.hand.grade}` : 'wide reach') : '';
  const hands = slot.hand
    ? `. Left hand ${slot.hand.left ?? 'cannot cover it'}, right hand ${slot.hand.right ?? 'cannot cover it'}`
    : '';
  return `<li class="prelude-slot is-${slot.fn}${selected ? ' is-selected' : ''}"><button data-comp="prelude-slot" data-index="${index}" aria-pressed="${selected}" title="Hear harmony ${index + 1}: ${esc(name)}, ${bass}${hands}"><span class="prelude-slot-fn">${PRELUDE_FUNCTIONS[slot.fn]}</span><b>${esc(name)}</b><small>${bass}${slot.pedal ? ' · held' : ''}${slot.move ? ` · by ${esc(slot.move)}` : ''}</small><small class="prelude-slot-more">${decoration || '&nbsp;'}</small><small class="prelude-slot-hands">${grade || '&nbsp;'}</small></button>${more ? `<button class="prelude-slot-alt" data-comp="prelude-alt" data-index="${index}" title="Another chord on this bass (${slot.choice + 1} of ${slot.alternatives.length})" aria-label="Another chord for harmony ${index + 1}">${slot.choice + 1}/${slot.alternatives.length}</button>` : ''}</li>`;
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
  const pump = draft?.plan.pump,
    pumpNote = pump
      ? ` · pumps ${esc(pump.ratio)} (${pump.cents.toFixed(2)}¢): roots move by ${esc(pump.moves.join(', '))}`
      : '';
  const suspensions = slots.filter(s => s.decoration?.kind === 'suspension').length,
    passing = slots.filter(s => s.decoration?.kind === 'passing').length;
  const decorationNote =
    o.dissonance === 'none' || !draft
      ? ''
      : ` ${[
          plural(suspensions, 'suspension'),
          ...(o.dissonance === 'all' ? [plural(passing, 'passing tone')] : [])
        ].join(
          ', '
        )}.${draft.timing.repeats === 2 ? '' : ' They need the figure twice per harmony; only a last suspension can sound.'}`;
  const status = m.error
    ? `<span class="prelude-error" role="alert">${esc(m.error)}</span>`
    : draft
      ? `${slots.length} harmonies · ${draft.lengthTick / (draft.timing.harmony / o.bars)} bars${draft.plan.directional === null ? '' : ` · home ${draft.plan.home}, leading harmony on ${draft.plan.directional}`}${pumpNote} · ${esc(sourceNote)}`
      : '';
  const directionSelect = ['octave', 'cycle', 'pump'].includes(o.plan)
    ? select(
        'direction',
        o.plan === 'octave' ? 'Bass' : 'Roots',
        o.plan === 'pump'
          ? [
              ['down', 'As found'],
              ['up', 'Reversed']
            ]
          : PRELUDE_DIRECTIONS,
        o.direction
      )
    : '';
  const stepSelect =
    o.plan === 'cycle'
      ? select(
          'step',
          'Root step',
          [[0, 'Auto'], ...Array.from({length: n - 1}, (_, i) => [i + 1, i + 1])],
          o.step
        )
      : '';
  const picked = m.selectedSlot === null ? null : (slots[m.selectedSlot] ?? null);
  const degrees = Array.from({length: n}, (_, i) => [i, i]);
  const edit = (kind, label, value = '', disabled = false) =>
    `<button data-comp="prelude-edit" data-kind="${kind}" data-value="${value}" ${disabled ? 'disabled' : ''}>${label}</button>`;
  // Always present, so the cards above never move: a hint until a harmony is selected.
  const editor = `<div class="prelude-editor">${
    picked && picked.chord.root !== null && picked.chord.root !== undefined
      ? `<b>Harmony ${m.selectedSlot + 1}</b><div class="prelude-controls">${select('edit-root', 'Root', degrees, picked.chord.root)}${select(
          'edit-chord',
          'Chord',
          (m.chordsByRoot[picked.chord.root] ?? []).map((label, i) => [i, label]),
          picked.choice
        )}${select('edit-bass', 'Bass', degrees, picked.bass ?? picked.chord.root)}${select(
          'edit-fn',
          'Role',
          Object.entries(PRELUDE_FUNCTIONS),
          picked.fn
        )}</div><div class="prelude-edit-actions">${edit('move', 'Earlier', -1, m.selectedSlot === 0)}${edit('move', 'Later', 1, m.selectedSlot === slots.length - 1)}${edit('add', 'Add after')}${edit('remove', 'Remove', '', slots.length < 2)}</div>${o.plan === 'custom' ? '' : '<small>Editing turns this plan into a Custom one.</small>'}`
      : '<small>Select a harmony to change its root, chord, bass or role, or to add, move and remove harmonies.</small>'
  }</div>`;
  const pumpSelect =
    o.plan === 'pump' && draft?.plan.pumps.length > 1
      ? select(
          'pump',
          'Comma',
          draft.plan.pumps.map((x, i) => [i, `${x.ratio} · ${x.moves} moves`]),
          Math.min(o.pump, draft.plan.pumps.length - 1)
        )
      : '';
  const harmony = `<li class="prelude-step"><h4><span class="prelude-num">1</span>Harmony</h4><div class="prelude-plans" role="group" aria-label="Harmonic plan">${PRELUDE_PLANS.map(
    p => button('plan', p.name, {pressed: o.plan === p.id, extra: `data-value="${p.id}"`})
  ).join(
    ''
  )}</div><p class="prelude-note">${esc(PRELUDE_PLANS.find(p => p.id === o.plan).note)}</p><div class="prelude-controls">${select(
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
  )}${select('hand', 'Voicing', PRELUDE_HANDS, o.hand)}${pumpSelect}${directionSelect}${stepSelect}</div>${contour(slots)}<ol class="prelude-slots">${slots.map((s, i) => slotCard(s, i, m.selectedSlot === i)).join('')}</ol>${editor}<p class="prelude-status" role="status">${status}</p></li>`;
  const steps = draft?.timing.steps ?? 8;
  const figure = `<li class="prelude-step"><h4><span class="prelude-num">2</span>Figure</h4><div class="prelude-figures" role="group" aria-label="Figure">${PRELUDE_FIGURES.map(
    f =>
      `<button data-comp="prelude-figure" data-value="${f.id}" aria-pressed="${o.figure === f.id}" title="${esc(f.note)}">${figureDiagram(f.id, o.voices, Math.min(steps, 16))}<span>${esc(f.name)}</span></button>`
  ).join(
    ''
  )}</div><p class="prelude-note">${esc(PRELUDE_FIGURES.find(f => f.id === o.figure).note)} Rows are voices, the bass lowest; columns are attacks.</p><div class="prelude-controls">${select('division', 'Notes', PRELUDE_DIVISIONS, o.division)}${select(
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
  )}${select('dissonance', 'Dissonance', PRELUDE_DISSONANCES, o.dissonance)}</div><div class="prelude-actions">${button('hear', 'Hear the harmonies', {disabled: !draft})}${button('write', m.written ? 'Write again' : 'Write the prelude', {disabled: !draft, cls: 'primary'})}${button('listen', 'Listen', {disabled: !m.written})}</div><p class="prelude-status" role="status">${
    m.written
      ? m.stale
        ? 'The settings have changed since the prelude was written. Write again to hear them.'
        : 'Written. The chord lane holds the voiced harmonies; the figure follows them.'
      : m.melodyNotes
        ? `Writing replaces the chord lane. Your ${m.melodyNotes} melody notes stay.`
        : 'Writing fills the chord lane and attaches the figure. One step to undo.'
  }${esc(decorationNote)}</p></li>`;
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
    return `<li class="prelude-stage-sections${all ? ' is-done' : ''}"><div><b>${esc(s.name)}</b><small>${esc(s.note)}</small><div class="prelude-section-buttons">${parts || '<small>Write the prelude to see its sections.</small>'}</div></div><span class="prelude-done" aria-label="${all ? 'Completed' : 'Not yet completed'}">${all ? '✓' : ''}</span></li>`;
  };
  const practice = `<li class="prelude-step"><h4><span class="prelude-num">3</span>Practice on the HexBoard</h4><p class="prelude-note">From the bare harmonies to the finished piece. Each stage lights the keys to press; a connected HexBoard lights with it.</p><ol class="prelude-ladder">${PRACTICE_STAGES.map(stageButton).join('')}</ol></li>`;
  return `<details class="comp-panel prelude-panel" ${m.open ? 'open' : ''}><summary>Prelude${m.written ? ` · ${slots.length || m.count} harmonies written` : ''}</summary><p class="prelude-lede">Choose a harmonic plan, give it a figure, then learn it stage by stage. The harmonies are voice-led first; the figure only spreads them through time.</p><ol class="prelude-steps">${harmony}${figure}${practice}</ol></details>`;
}
