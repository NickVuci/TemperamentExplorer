import assert from 'node:assert/strict';
import {generatedSizes, mapRatio, targets} from '../src/core/engine.mjs';
import {makeState} from '../src/core/catalog.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {mod} from '../src/core/pitch.mjs';
import {scale} from '../src/core/engine.mjs';
import {
  findScaleMilestones,
  scaleMilestoneMarkers,
  modeMilestoneMarker,
  formatModeRanges
} from '../src/core/scale-milestones.mjs';
import {bootApp, cssRules} from './support/dom.mjs';

function mappedCoordinates(s, options = {limit: Math.max(3, ...s.basis), primeLimit: null}) {
  const {limit, primeLimit} = options,
    coordinates = new Set();
  for (const t of targets(limit, primeLimit)) {
    const m = mapRatio(t.n, t.d, s);
    if (!m) continue;
    const periods = Math.floor((m[0] * s.p + m[1] * s.g) / s.p + 1e-10);
    coordinates.add(`${m[0] - periods},${m[1]}`);
  }
  return coordinates;
}
function intervalMatrix(s, n) {
  const notes = scale({...s, n, mode: 0}).notes,
    coordinates = new Set();
  for (const a of notes)
    for (const b of notes) {
      const k = b.k - a.k,
        c = mod(b.c - a.c, s.p);
      coordinates.add(`${Math.round((c - k * s.g) / s.p)},${k}`);
    }
  return coordinates;
}
function modeNotes(s, n, mode) {
  return new Set(
    scale({...s, n, mode}).notes.map(
      note => `${Math.round((note.c - note.k * s.g) / s.p)},${note.k}`
    )
  );
}
function covers(required, actual) {
  return [...required].every(coordinate => actual.has(coordinate));
}
function completingModes(s, n, required) {
  return Array.from({length: n}, (_, mode) => mode).filter(mode =>
    covers(required, modeNotes(s, n, mode))
  );
}

for (const s of [makeState('meantone'), makeState('dreamtone'), fromCommas('128/125')]) {
  const required = mappedCoordinates(s),
    sizes = generatedSizes(s),
    milestones = findScaleMilestones(s, {limit: Math.max(3, ...s.basis), primeLimit: null});
  const firstInterval = sizes.find(size => covers(required, intervalMatrix(s, size.n)));
  const firstIntervalMOS = sizes.find(
    size => size.mos && covers(required, intervalMatrix(s, size.n))
  );
  const firstDiamondSize = sizes.find(size => completingModes(s, size.n, required).length);
  const firstDiamond = firstDiamondSize
    ? {size: firstDiamondSize, modes: completingModes(s, firstDiamondSize.n, required)}
    : null;
  const firstDiamondMOSSize = sizes.find(
    size => size.mos && completingModes(s, size.n, required).length
  );
  const firstDiamondMOS = firstDiamondMOSSize
    ? {size: firstDiamondMOSSize, modes: completingModes(s, firstDiamondMOSSize.n, required)}
    : null;
  assert.equal(
    milestones.mappedTargetCount,
    required.size,
    `${s.name}: only in-subgroup targets are counted`
  );
  assert.equal(
    milestones.interval?.n,
    firstInterval?.n,
    `${s.name}: first generated interval matrix`
  );
  assert.equal(
    milestones.intervalMOS?.n,
    firstIntervalMOS?.n,
    `${s.name}: first strict two-step MOS in default mode`
  );
  assert.equal(
    milestones.diamond?.n,
    firstDiamond?.size.n,
    `${s.name}: first single-mode diamond completion`
  );
  assert.deepEqual(
    milestones.diamond?.modes,
    firstDiamond?.modes,
    `${s.name}: retain every completing mode`
  );
  assert.equal(
    milestones.diamondMOS?.n,
    firstDiamondMOS?.size.n,
    `${s.name}: first diamond-complete MOS across modes`
  );
  assert.deepEqual(
    milestones.diamondMOS?.modes,
    firstDiamondMOS?.modes,
    `${s.name}: retain every completing MOS mode`
  );
  if (milestones.interval) assert.ok(covers(required, intervalMatrix(s, milestones.interval.n)));
  if (milestones.intervalMOS) assert.ok(scale({...s, n: milestones.intervalMOS.n, mode: 0}).mos);
  if (milestones.diamond)
    for (const mode of milestones.diamond.modes)
      assert.ok(covers(required, modeNotes(s, milestones.diamond.n, mode)));
  assert.deepEqual(
    findScaleMilestones({...s, mode: 1}, {limit: Math.max(3, ...s.basis), primeLimit: null}),
    milestones,
    'milestones do not depend on the currently selected mode'
  );
}

const meantone = findScaleMilestones(makeState('meantone'), {limit: 5, primeLimit: 5});
assert.equal(meantone.interval.n, 5);
assert.equal(meantone.intervalMOS.n, 5);
assert.equal(meantone.diamond.n, 9);
assert.equal(meantone.diamond.signature, '3L 4M 2s');
assert.deepEqual(meantone.diamond.modes, [3]);
assert.equal(meantone.diamondMOS.n, 12);
assert.deepEqual(meantone.diamondMOS.modes, [1, 4, 6, 11]);
assert.equal(
  meantone.diamondMOS.mode,
  meantone.diamondMOS.modes[0],
  'the MOS recommendation opens in a completing mode'
);
assert.deepEqual(scaleMilestoneMarkers(meantone, 5), ['IC']);
assert.deepEqual(scaleMilestoneMarkers(meantone, 9), ['DC']);
assert.deepEqual(
  scaleMilestoneMarkers(
    {interval: {n: 7}, intervalMOS: {n: 7}, diamond: {n: 7}, diamondMOS: null},
    7
  ),
  ['IC', 'DC']
);
assert.equal(modeMilestoneMarker(meantone, 9, 3), 'DC');
assert.equal(modeMilestoneMarker(meantone, 9, 2), null);
assert.equal(formatModeRanges([0, 1, 2, 4, 6, 7]), '1–3, 5, 7–8');
assert.equal(
  findScaleMilestones(makeState('dreamtone'), {limit: 13, primeLimit: null}).mappedTargetCount,
  20,
  'unmapped Dreamtone ratios are excluded'
);

console.log(
  'Scale coverage milestones: exact mapped interval matrices, tonic-relative modes, all-mode MOS search, subgroup filtering, selection markers, and results passed.'
);

// Verify optimized analysis against independently enumerated coordinate sets.
const variants = [
  [makeState('meantone'), {limit: 15, primeLimit: 5}],
  [makeState('meantone'), {limit: 15, primeLimit: 3}],
  [makeState('dreamtone'), {limit: 15, primeLimit: [2, 3, 5, 11]}],
  [makeState('dreamtone'), {limit: 15, primeLimit: null}],
  [fromCommas('128/125'), {limit: 9, primeLimit: 5}],
  [fromCommas('245/243', '3.5.7'), {limit: 9, primeLimit: [3, 5, 7]}],
  [
    {...makeState('meantone'), g: 700},
    {limit: 15, primeLimit: 5}
  ],
  [
    {...makeState('meantone'), g: 600},
    {limit: 15, primeLimit: 5}
  ]
];
for (const [s, options] of variants) {
  const required = mappedCoordinates(s, options),
    result = findScaleMilestones(s, options);
  const candidates = generatedSizes(s);
  for (const [key, mos, modeCoverage] of [
    ['interval', false, false],
    ['intervalMOS', true, false],
    ['diamond', false, true],
    ['diamondMOS', true, true]
  ]) {
    let expected;
    for (const candidate of candidates) {
      if (mos && !candidate.mos) continue;
      // Once a result exists we need inspect only sizes through that result.
      if (result[key] && candidate.n > result[key].n) break;
      const modes = modeCoverage ? completingModes(s, candidate.n, required) : null;
      if (modeCoverage ? modes.length : covers(required, intervalMatrix(s, candidate.n))) {
        expected = {n: candidate.n, modes};
        break;
      }
    }
    assert.equal(result[key]?.n, expected?.n, `${s.name} ${JSON.stringify(options)} ${key}`);
    if (modeCoverage && expected) {
      assert.deepEqual(result[key].modes, expected.modes);
      assert.equal(result[key].mode, expected.modes[0]);
    }
  }
  assert.strictEqual(
    findScaleMilestones({...s, n: 2, mode: 1, matrixOctave: true}, options),
    result,
    'view and selection do not affect period-class coverage'
  );
  assert.ok(Object.isFrozen(result) && (!result.diamond || Object.isFrozen(result.diamond.modes)));
}
const current = findScaleMilestones(makeState('meantone'));
assert.deepEqual(
  [
    current.interval.n,
    current.intervalMOS.n,
    current.diamond.n,
    current.diamond.mode,
    current.diamondMOS.n
  ],
  [6, 7, 11, 10, 12]
);
assert.notEqual(
  current,
  findScaleMilestones(makeState('meantone'), {limit: 5, primeLimit: 5}),
  'odd limit participates in cache identity'
);
assert.notEqual(
  current,
  findScaleMilestones(makeState('meantone'), {limit: 15, primeLimit: 3}),
  'prime filter participates in cache identity'
);
assert.notEqual(
  current,
  findScaleMilestones({...makeState('meantone'), g: 701}),
  'tuning participates in cache identity'
);
assert.throws(() => findScaleMilestones(makeState('meantone'), {limit: 4}), /Odd limit/);

// In the app, the scale and mode menus mark coverage milestones, and each milestone card selects its
// scale.
assert.match(
  cssRules().value('.scale-milestone-grid', 'grid-template-columns'),
  /^repeat\(2,/,
  'the four result buttons use a compact two-column grid'
);
const page = await bootApp(),
  {$, $$} = page,
  milestones = findScaleMilestones(makeState('meantone'), {limit: 15, primeLimit: 5}),
  optionText = (field, value) =>
    [...$(`[data-field="${field}"]`).options].find(option => option.value === String(value))
      ?.textContent;
await page.until(
  () => /chords · complete/.test($('[data-unified-pane="directory"]')?.textContent ?? ''),
  {message: 'the first catalogue'}
);
for (const key of ['interval', 'intervalMOS', 'diamond', 'diamondMOS']) {
  const {n} = milestones[key];
  assert.ok(
    optionText('n', n).endsWith(` · ${scaleMilestoneMarkers(milestones, n).join(' · ')}`),
    `the scale menu marks ${n} notes`
  );
}
assert.equal($$('[data-scale-milestone]').length, 4, 'coverage cards are actionable');
page.click('[data-scale-milestone="diamond"]');
await page.settle();
assert.equal($('[data-field="n"]').value, String(milestones.diamond.n));
assert.equal($('[data-field="mode"]').value, String(milestones.diamond.mode));
for (const mode of [milestones.diamond.mode, (milestones.diamond.mode + 1) % milestones.diamond.n])
  assert.equal(
    optionText('mode', mode).endsWith(' · DC'),
    modeMilestoneMarker(milestones, milestones.diamond.n, mode) === 'DC',
    'completing modes are marked in the mode menu'
  );
page.click('[data-scale-milestone="intervalMOS"]');
await page.settle();
assert.deepEqual(
  [$('[data-field="n"]').value, $('[data-field="mode"]').value],
  [String(milestones.intervalMOS.n), '0'],
  'an interval-complete MOS opens in mode 1'
);
assert.deepEqual(page.errors, []);
await page.close();
