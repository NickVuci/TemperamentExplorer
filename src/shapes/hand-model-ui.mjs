// The Shapes view's "Hand model" panel: a picture of the resting fingertips over the keys, size
// sliders for the hand and wrist, grade bands, fingers in use and every per-finger number.
// It only reads and edits a model (hand-model.mjs); the explorer owns the state and re-rates.
import {FINGER_NAMES, handBasis, normalizeHandModel} from './hand-model.mjs';
import {esc} from '../ui/ui.mjs';

// Slider: field, label, model key, slider range, step, unit. Typed values are checked against the
// wider range the model itself accepts (`HAND_FIELDS`).
const SLIDERS = [
  ['handScale', 'Hand size', 'scale', 70, 130, 1, '%'],
  ['handSpacing', 'Key spacing', 'spacing', 12, 30, 0.5, ' mm'],
  ['handRest', 'Resting turn', 'rest', -20, 40, 2.5, '°'],
  ['handInward', 'Inward limit', 'inward', 20, 100, 2.5, '°'],
  ['handOutward', 'Outward limit', 'outward', 0, 70, 2.5, '°'],
  ['handGap', 'Finger gap', 'gap', 2, 16, 0.5, ' mm']
];
const DOUBLE_SLIDER = ['handDoubleCost', 'Two-key cost', 'doubleCost', 0, 120, 5, ''];
const RANGES = {
  scale: [60, 150],
  spacing: [10, 40],
  rest: [-30, 45],
  inward: [0, 120],
  outward: [0, 90],
  gap: [0, 20],
  doubleCost: [0, 200]
};
const ALL_SLIDERS = [...SLIDERS, DOUBLE_SLIDER];
const HAND_FIELDS = Object.fromEntries(
  ALL_SLIDERS.map(([field, , key]) => [field, [key, ...RANGES[key]]])
);
// Per-finger numbers: model key, column heading, accepted range, step.
const FINGER_COLUMNS = [
  ['x', 'Rest right, mm', -90, 90, 1],
  ['y', 'Rest forward, mm', -90, 90, 1],
  ['sideways', 'Sideways stiffness', 0.05, 5, 0.05],
  ['along', 'Reach stiffness', 0.05, 5, 0.05],
  ['use', 'Use cost', 0, 200, 1]
];
const FIELDS = new Set(['handDouble', 'handGrade', 'handFingerValue']);
export const isHandModelField = field => FIELDS.has(field) || Object.hasOwn(HAND_FIELDS, field);
export const isHandSlider = el =>
  el?.type === 'range' && Object.hasOwn(HAND_FIELDS, el.dataset?.shapeField);

const sliderOf = field => ALL_SLIDERS.find(slider => slider[0] === field);
const readout = (field, value) => `${value}${sliderOf(field)?.[6] ?? ''}`;

/** The model with one finger switched in or out of use; at least one must stay in use. */
export function toggleHandFinger(model, index) {
  if (!model.fingers[index]) throw Error('Unknown finger.');
  const fingers = model.fingers.map((finger, i) =>
    i === index ? {...finger, on: !finger.on} : finger
  );
  if (!fingers.some(finger => finger.on)) throw Error('Keep at least one finger in use.');
  return normalizeHandModel({...model, fingers});
}

/** The model after one edited control; throws a message when the value is not acceptable. */
export function applyHandField(model, el) {
  const field = el.dataset.shapeField,
    index = Number(el.dataset.index);
  const number = (low, high) => {
    const value = Number(el.value);
    if (el.value === '' || !Number.isFinite(value) || value < low || value > high)
      throw Error(`Choose a value from ${low} to ${high}.`);
    return value;
  };
  if (field === 'handDouble') return normalizeHandModel({...model, double: !!el.checked});
  if (field === 'handGrade') {
    const grades = [...model.grades];
    grades[index] = number(1, 2000);
    if (!(grades[0] < grades[1] && grades[1] < grades[2]))
      throw Error('Grade bands must rise: A below B below C.');
    return normalizeHandModel({...model, grades});
  }
  if (field === 'handFingerValue') {
    const column = FINGER_COLUMNS.find(c => c[0] === el.dataset.key);
    if (!column || !model.fingers[index]) throw Error('Unknown finger setting.');
    const value = number(column[2], column[3]),
      fingers = model.fingers.map((finger, i) =>
        i === index ? {...finger, [column[0]]: value} : finger
      );
    return normalizeHandModel({...model, fingers});
  }
  const [key, low, high] = HAND_FIELDS[field];
  return normalizeHandModel({...model, [key]: number(low, high)});
}

const hexPoints = (cx, cy, radius, rotation) =>
  Array.from({length: 6}, (_, k) => {
    const angle = ((30 + 60 * k + 90 * rotation) * Math.PI) / 180;
    return `${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy - radius * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');

/** The resting fingertips (numbered, in use only) over the key lattice as the player sees it. */
export function handDiagram(model, hand = 'R', rotation = 0) {
  const width = 340,
    height = 260,
    scale = 2.1,
    spacing = model.spacing * scale,
    radius = spacing / Math.sqrt(3) - 1,
    centre = [width / 2, 110],
    [e1, e2] = handBasis(rotation),
    turn = (model.rest * Math.PI) / 180,
    cos = Math.cos(turn),
    sin = Math.sin(turn),
    size = model.scale / 100,
    flip = hand === 'L' ? -1 : 1;
  let svg = `<svg viewBox="0 0 ${width} ${height}" class="hand-diagram-svg" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Resting ${hand === 'L' ? 'left' : 'right'}-hand fingertips over the keys">`;
  const reach = Math.ceil(Math.max(width, height) / spacing) + 2;
  for (let a = -reach; a <= reach; a++)
    for (let b = -reach; b <= reach; b++) {
      const x = centre[0] + (a * e1[0] + b * e2[0]) * spacing,
        y = centre[1] - (a * e1[1] + b * e2[1]) * spacing;
      if (x < -spacing || x > width + spacing || y < -spacing || y > height + spacing) continue;
      svg += `<polygon class="hand-key" points="${hexPoints(x, y, radius, rotation)}"/>`;
    }
  model.fingers.forEach((finger, i) => {
    if (!finger.on) return;
    const x = finger.x * size,
      y = finger.y * size,
      px = centre[0] + flip * (cos * x - sin * y) * scale,
      py = centre[1] - (sin * x + cos * y) * scale;
    svg += `<circle class="hand-tip" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="10"/><text class="hand-tip-label" x="${px.toFixed(1)}" y="${(py + 4).toFixed(1)}">${i + 1}</text>`;
  });
  return `${svg}</svg>`;
}

const DOUBLE_HELP =
  'When allowed, a finger may cover two keys that touch, pressing on the seam between them. Each such press adds this much strain; the thumb pays half.';
const help = text =>
  ` <span class="hand-help" tabindex="0" role="img" aria-label="${esc(text)}">?<span class="hand-help-text" role="tooltip" aria-hidden="true">${esc(text)}</span></span>`;
// With a `lead` control (the two-key checkbox) the row is a div, so the label does not claim it.
const slider = ([field, label, key, low, high, step], model, {tip = '', lead = ''} = {}) => {
  const tag = lead ? 'div' : 'label';
  return `<${tag} class="hand-slider"><span>${lead}${label}${tip ? help(tip) : ''}</span><input type="range" data-shape-field="${field}" min="${low}" max="${high}" step="${step}" value="${model[key]}"${lead ? ` aria-label="${label}"` : ''}><output>${readout(field, model[key])}</output></${tag}>`;
};

/** The whole panel. `open` keeps the dropdowns as the user left them across re-renders. */
export function handModelMarkup(model, {hand = 'R', rotation = 0, open = {}, reset = ''} = {}) {
  const doubleBox = `<input type="checkbox" data-shape-field="handDouble" ${model.double ? 'checked' : ''} aria-label="One finger may press two touching keys" title="One finger may press two touching keys">`;
  const bands = ['A', 'B', 'C']
    .map(
      (grade, i) =>
        `<label class="hand-band"><span class="comfort comfort-${grade.toLowerCase()}">${grade}</span><input type="number" min="1" max="2000" step="1" data-shape-field="handGrade" data-index="${i}" value="${model.grades[i]}" aria-label="Grade ${grade} is below this strain"></label>`
    )
    .join('');
  const rows = model.fingers
    .map(
      (finger, i) =>
        `<tr><th scope="row">${i + 1} ${FINGER_NAMES[i]}</th>${FINGER_COLUMNS.map(
          ([key, heading, low, high, step]) =>
            `<td><input type="number" min="${low}" max="${high}" step="${step}" data-shape-field="handFingerValue" data-index="${i}" data-key="${key}" value="${finger[key]}" aria-label="${esc(`${FINGER_NAMES[i]}: ${heading}`)}"></td>`
        ).join('')}</tr>`
    )
    .join('');
  return `<details class="hand-model-options" ${open.panel ? 'open' : ''}><summary>Hand model</summary>
     <div class="hand-main"><div class="hand-picture"><div class="hand-diagram">${handDiagram(model, hand, rotation)}</div>
     <div class="comfort-filter" role="group" aria-label="Fingers in use"><div>${model.fingers.map((finger, i) => `<button type="button" data-shape-action="hand-finger" data-index="${i}" class="comfort hand-side finger-toggle" aria-pressed="${finger.on}" title="${FINGER_NAMES[i]}" aria-label="${FINGER_NAMES[i]}">${i + 1}</button>`).join('')}</div></div></div>
     <div class="hand-sliders">${SLIDERS.map(s => slider(s, model)).join('')}${slider(DOUBLE_SLIDER, model, {tip: DOUBLE_HELP, lead: doubleBox})}</div></div>
     <h5>Grade bands</h5>
     <div class="hand-bands">${bands}<small>Strain above the natural hand below which a fingering is A, B or C; D is everything above.</small></div>
     <details class="hand-advanced" ${open.advanced ? 'open' : ''}><summary>Every number in the model</summary>
      <div class="hand-table"><table><thead><tr><th scope="col">Finger</th>${FINGER_COLUMNS.map(c => `<th scope="col">${c[1]}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
      <small>Rest spots are for the right hand, measured from the middle fingertip. The left hand is the mirror image.</small></details>
     ${reset}</details>`;
}

/** Updates a dragged slider's readout and the picture without re-rendering the view. */
export function showHandLive(el, model, {hand = 'R', rotation = 0} = {}) {
  const field = el.dataset.shapeField,
    key = sliderOf(field)[2],
    panel = el.closest?.('.hand-model-options'),
    output = el.parentElement?.querySelector?.('output'),
    diagram = panel?.querySelector?.('.hand-diagram');
  if (output) output.textContent = readout(field, model[key]);
  if (diagram) diagram.innerHTML = handDiagram(model, hand, rotation);
}
