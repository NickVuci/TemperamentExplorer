import assert from 'node:assert/strict';
import {mapRatio, scale} from '../src/core/engine.mjs';
import {presets, makeState} from '../src/core/catalog.mjs';
import {ratios, fromCommas} from '../src/core/tuning.mjs';
import {weilTune} from '../src/core/weil-tuning.mjs';
import {validateState} from '../src/core/state.mjs';
import {presetSnapshot} from '../src/presets/preset-data.mjs';
assert.equal(Object.keys(presets).length, 47);
for (const [key, p] of Object.entries(presets)) {
  const s = makeState(key);
  validateState(s);
  presetSnapshot(s.name, s);
  for (const c of ratios(s.commas))
    assert.deepEqual(mapRatio(c.n, c.d, s), [0, 0], `${key}: ${c.label}`);
  const rebuilt = fromCommas(s.commas, s.basis.join('.'));
  assert.deepEqual(rebuilt.rows, s.rows, `${key}: comma input retains conventional generator`);
  if (p.defaultSize) {
    assert.ok(scale(s).mos, `${key}: opening MOS`);
    assert.equal(s.g, weilTune(s, true).g);
  }
}
for (const [key, g] of Object.entries({
  porcupine7: 162.9493,
  porkypine: 163.9951,
  porcupinefowl: 162.8314,
  porcupinefish: 162.3458,
  magic7: 380.4576,
  magic11: 380.7008
}))
  assert.ok(Math.abs(presets[key].g - g) < 0.0001, `${key}: published CWE cross-check`);
// Published CWE generators (three decimals), reduced by whole periods to the catalog generator.
const published = {
  meanpop: 696.451,
  huygens: 697.031,
  mohajira: 348.491,
  rastmic: 350.549,
  mavila: 679.111,
  superpyth: 710.119,
  archy: 709.39,
  augmented: 305.069,
  augene: 309.325,
  diminished: 98.266,
  diminished7: 95.962,
  blackwood: 155.126,
  injera: 94.771,
  hedgehog: 435.448,
  catakleismic: 316.771,
  orwell: 271.51,
  orwell11: 271.455,
  sensi: 443.349,
  negri: 125.435,
  semaphore: 249.311,
  slendric: 233.747,
  valentine: 77.867,
  myna: 310.088,
  wurschmidt: 387.776,
  hemiwurschmidt: 193.888,
  ennealimmal: 84.322,
  compton: 84.143
};
for (const [key, g] of Object.entries(published))
  assert.ok(Math.abs(presets[key].g - g) < 0.001, `${key}: published CWE cross-check`);
for (const [key, p] of Object.entries({
  pajara11: 600,
  augmented: 400,
  diminished: 300,
  blackwood: 240,
  injera: 600,
  ennealimmal: 1200 / 9,
  compton: 100
}))
  assert.ok(Math.abs(makeState(key).p - p) < 1e-9, `${key}: period`);
console.log(
  '47 catalog presets: valid states, comma kernels, conventional generators, save snapshots, MOS defaults, periods and CWE references verified.'
);
