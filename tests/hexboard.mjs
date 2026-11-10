import assert from 'node:assert/strict';
import {
  baseOptions,
  baseSteps,
  buildBoard,
  boardMatches,
  exportHexboard,
  layoutCandidates,
  commands,
  det,
  fillBoard,
  tuningMenuName
} from '../src/hexboard/hexboard.mjs';
import {coordinateCents as cents} from '../src/core/pitch.mjs';
import {fromCommas, edoTune} from '../src/core/tuning.mjs';
import {scale} from '../src/core/engine.mjs';
import {makeState} from '../src/core/catalog.mjs';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';
const cfg = {
  base: 7,
  offset: 0,
  style: 'bosanquet',
  rotation: 0,
  mirror: false,
  center: 65,
  register: 0,
  deviceRotation: 1,
  outside: false
};
const close = (a, b, tol = 1e-7) => assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
const examples = [
  makeState('meantone'),
  {...makeState('meantone'), n: 31},
  makeState('dreamtone'),
  makeState('porcupine11'),
  fromCommas('128/125'),
  fromCommas('2048/2025'),
  fromCommas('245/243', '3.5.7')
];
let compat;
if (process.argv[2]) compat = await import(process.argv[2]);
for (const s of examples) {
  s.mode = 3;
  const conf = {...cfg, base: baseOptions(s).find(v => v.n === 7)?.n || baseOptions(s).at(-2).n};
  const base = baseSteps(s, conf.base);
  assert.equal(Math.abs(det(base.L, base.s)), 1);
  for (const rotation of [0, 2, 5])
    for (const mirror of [false, true]) {
      const c = {...conf, rotation, mirror},
        b = buildBoard(s, c);
      assert.equal(b.keys.length, 140);
      assert.equal(b.keys.filter(k => k.command).length, 7);
      close(b.keys[65].c, 0);
      assert.ok(b.keys.filter(k => k.enabled).every(k => k.inMOS));
      const allowed = new Set(scale(s).notes.map(t => t.k));
      for (const k of b.keys.filter(k => k.inMOS && !k.alias)) assert.ok(allowed.has(k.m[1]));
      for (let i = 0; i < 140; i++) {
        const key = b.keys[i];
        if (key.column < 9) close(b.keys[i + 1].c - key.c, cents(s, b.a));
      }
      const out = exportHexboard(s, c, 220),
        t = out.file.tuningBundle.tuning,
        records = out.file.tuningBundle.layouts[0].buttonOverrides;
      assert.ok(t.cents.every((v, i) => v > 0 && (!i || v > t.cents[i - 1])));
      assert.equal(t.cents.length, t.cycleLength);
      close(t.periodCents, s.p, 0.001);
      for (const r of records) {
        const k = b.keys[r.buttonIndex];
        if (commands.has(k.index)) {
          assert.equal(r.role, 'command');
          continue;
        }
        assert.equal(r.role, k.enabled ? 'note' : 'unused');
        if (!k.enabled) continue;
        const n = r.stepsFromC,
          N = t.cycleLength,
          d = ((n % N) + N) % N,
          p = Math.floor(n / N),
          actual = p * t.periodCents + (d ? t.cents[d - 1] : 0);
        close(actual, k.c, 0.002);
        assert.ok(r.value > 0);
      }
      assert.ok(out.maxError < 0.002);
      if (compat) {
        const parsed = compat.parseTuningBundleFile(out.file),
          encoded = compat.encodeTuningBundle(parsed);
        assert.equal(parsed.layouts[0].buttonOverrides.length, 140);
        assert.ok(encoded.bundleFile.length > 100);
      }
    }
}
const meantone = makeState('meantone'),
  seven = buildBoard(meantone, cfg),
  five = buildBoard(meantone, {...cfg, base: 5});
assert.equal(seven.coverage, 19);
assert.notDeepEqual(seven.a, five.a);
assert.equal(new Set(seven.keys.filter(k => k.base && !k.command).map(k => k.degree)).size, 7);
const shifted = buildBoard({...meantone, mode: 6}, {...cfg, offset: 6});
assert.equal(shifted.baseNotes.length, 7);
const ed = edoTune(meantone, 31, '18'),
  edo = {...meantone, ...ed, n: 31};
const e = buildBoard(edo, cfg);
assert.ok(e.keys.some(k => k.alias && !k.command));
assert.equal(e.coverage, 31);
for (const initial of [meantone, makeState('dreamtone'), edo])
  for (const rotation of [0, 2, 5]) {
    const conf = {...cfg, rotation},
      fit = fillBoard(initial, conf),
      s = {...initial, n: fit.n, mode: fit.mode},
      c = {...conf, offset: fit.offset},
      b = buildBoard(s, c);
    assert.equal(b.playable, 133);
    assert.ok(b.keys.filter(k => !k.command).every(k => k.inMOS));
    assert.deepEqual(b.a, buildBoard(initial, conf).a);
    assert.deepEqual(b.b, buildBoard(initial, conf).b);
    if (initial === meantone && rotation === 0) assert.ok(fit.n > 48);
    const out = exportHexboard(s, c, 220);
    if (compat)
      assert.ok(
        compat.encodeTuningBundle(compat.parseTuningBundleFile(out.file)).bundleFile.length
      );
  }
const matches = boardMatches(meantone, seven, 65);
assert.equal(matches.length, 140);
const fiveLimitMatches = boardMatches(meantone, seven, 65, 10, 5),
  threePrimeMatches = boardMatches(meantone, seven, 65, 10, 5, 3);
assert.ok(fiveLimitMatches.flatMap(m => [...m.mapped, ...m.hits]).some(t => t.label === '5/4'));
assert.ok(!threePrimeMatches.flatMap(m => [...m.mapped, ...m.hits]).some(t => t.label === '5/4'));
assert.ok(layoutCandidates(meantone, cfg).length);
assert.throws(
  () => buildBoard(meantone, {...cfg, style: 'manual', ap: 2, ag: 0, bp: 0, bg: 1}),
  /determinant/
);
let downloaded = null,
  downloadName = '',
  states = [meantone];
const ui = createHexboardWorkspace({
  getStates: () => states,
  play: () => {},
  refresh: () => {},
  notify: () => {},
  download: (name, text) => {
    downloadName = name;
    downloaded = JSON.parse(text);
  },
  getHz: () => 220
});
const initialMarkup = ui.render();
const rowStart = initialMarkup.indexOf(
    '<div class="hex-controls hex-primary-controls hex-top-controls">'
  ),
  layoutStart = initialMarkup.indexOf('<details class="layout-settings"');
assert.ok(
  rowStart > layoutStart && layoutStart >= 0,
  'Instrument and layout selectors share one primary control row.'
);
const primaryRow = initialMarkup.slice(
  rowStart,
  initialMarkup.indexOf('hex-period-controls', rowStart)
);
assert.match(
  primaryRow,
  /<label class="hex-instrument-control"><span>Instrument<\/span><select data-instrument>/
);
for (const field of ['target', 'mode', 'base', 'offset', 'rotation', 'deviceRotation'])
  assert.ok(
    primaryRow.includes(`data-hex-field="${field}"`),
    `Primary ${field} control stays in the instrument row.`
  );
for (const field of ['flipHorizontal', 'flipVertical'])
  assert.match(
    primaryRow,
    new RegExp(`data-hex-toggle="${field}" aria-pressed="false"`),
    `${field} is an accessible toggle button.`
  );
assert.doesNotMatch(
  primaryRow,
  /data-hex-field="flip(?:Horizontal|Vertical)"/,
  'Axis flips are not checkbox controls.'
);
assert.ok(initialMarkup.indexOf('<summary>Advanced Layout Options</summary>') < rowStart);
for (const [value, name] of [
  ['hexboard', 'HexBoard'],
  ['lumatone', 'Lumatone'],
  ['linnstrument', 'LinnStrument'],
  ['miso', 'Miso'],
  ['axis', 'Axis']
])
  assert.match(
    initialMarkup,
    new RegExp(
      `<option value="${value}"${value === 'hexboard' ? ' selected' : ' disabled'}>${name}${value === 'hexboard' ? '' : ' \\(Coming soon\\)'}</option>`
    )
  );
assert.match(
  ui.render(),
  /<details class="layout-settings" ><summary>Advanced Layout Options<\/summary>/,
  'Advanced Layout Options start collapsed by default.'
);
assert.equal(
  ui.serialize().configs[0].periodWrapping,
  true,
  'period wrapping starts on by default.'
);
ui.change({dataset: {hexField: 'base'}, type: 'select-one', value: '5'});
assert.equal(ui.serialize().configs[0].base, 5);
const savedDocument = globalThis.document;
globalThis.document = {querySelector: q => (q.includes('.layout-settings') ? {open: false} : null)};
assert.match(
  ui.render(),
  /<details class="layout-settings" ><summary>Advanced Layout Options<\/summary>/,
  'Collapsed layout options stay collapsed through a render.'
);
globalThis.document = savedDocument;
ui.click({closest: () => ({dataset: {hexAction: 'export'}})});
assert.equal(downloaded.format, 'hexboard.tuningBundle.v2');
assert.equal(downloaded.details.layout.source, 'Custom');
assert.equal(downloadName, `Meantone-${states[0].n}-notes-Bosanquet-5-HexBoard.json`);
assert.equal(downloaded.title, `Meantone[${states[0].n}] · Bosanquet 5`);
const saved = JSON.parse(JSON.stringify(ui.serialize()));
ui.restore(saved);
assert.equal(ui.serialize().configs[0].base, 5);
const legacyPanel = {
  ...saved,
  panel: 1,
  configs: [saved.configs[0], {...saved.configs[0], base: 5}]
};
ui.restore(legacyPanel);
assert.equal(ui.serialize().configs.length, 1);
assert.equal(ui.serialize().configs[0].base, saved.configs[0].base);
assert.equal(Object.hasOwn(ui.serialize(), 'panel'), false);
ui.restore(saved);
assert.throws(
  () => ui.restore({...saved, configs: [{...saved.configs[0], center: 0}, saved.configs[1]]}),
  /Invalid/
);
ui.change({dataset: {hexField: 'periodWrapping'}, value: 'off'});
ui.click({closest: () => ({dataset: {hexAction: 'fill'}})});
assert.ok(states[0].n > 48);
assert.equal(buildBoard(states[0], ui.serialize().configs[0]).playable, 133);
ui.change({dataset: {hexField: 'base'}, type: 'select-one', value: '50'});
const larger = ui.serialize();
ui.restore(larger);
assert.equal(ui.serialize().configs[0].base, 50);
for (const [name, n, menu] of [
  ['Meantone', 7, 'Meantone[7]'],
  ['Porcupine (7-limit)', 15, 'Porcupine 7-lim[15]'],
  ['Magic (5-limit)', 13, 'Magic 5-lim[13]'],
  ['Porcupine (11-limit)', 15, 'Porcupine[15]'],
  ['Rastmic (2.3.11)', 7, 'Rastmic 2.3.11[7]'],
  ['Septimal meantone', 12, 'Septimal meanto[12]'],
  ['Würschmidt (5-limit)', 19, 'Wurschmidt[19]']
])
  assert.equal(tuningMenuName(name, n), menu);
{
  const s = {...makeState('septimal'), n: 19, mode: 2},
    c = {...cfg, outside: true},
    custom = exportHexboard(s, c, 261.63),
    named = exportHexboard(s, c, 220, {name: 'Würschmidt · my long jazz layout', source: 'Saved'});
  assert.equal(custom.fileName, 'Septimal-meantone-19-notes-mode-3-Bosanquet-7-HexBoard.json');
  assert.equal(custom.title, 'Septimal meantone[19] mode 3 · Bosanquet 7');
  assert.deepEqual(Object.keys(custom.file), [
    'format',
    'title',
    'details',
    'tuningBundle',
    'temperamentLab'
  ]);
  assert.deepEqual(custom.file.details.layout, {
    name: 'Bosanquet 7',
    source: 'Custom',
    family: 'Bosanquet axes (L and L − s)',
    baseNotes: 7,
    baseSteps: '5L 2s',
    tonicButton: 65,
    boardOrientationDegrees: 90,
    periodWrapping: false,
    notesOutsideScale: true
  });
  assert.deepEqual(custom.file.details.scale, {notes: 19, mode: 3, steps: '12L 7s'});
  assert.equal(custom.file.details.subgroup, '2.3.5.7');
  assert.equal(custom.file.details.referenceHz, 261.63);
  assert.match(
    custom.file.tuningBundle.tuning.description,
    /^Septimal meantone, 19-note 12L 7s scale, mode 3; custom layout “Bosanquet 7”, .* 2\.3\.5\.7 Published CWE tuning, period 1200¢, generator 696\.656¢, reference 261\.63 Hz$/
  );
  assert.equal(named.file.tuningBundle.layouts[0].name, 'Wurschmidt - my');
  assert.equal(named.file.details.layout.name, 'Würschmidt · my long jazz layout');
  assert.equal(named.file.details.layout.source, 'Saved');
  assert.equal(
    named.fileName,
    'Septimal-meantone-19-notes-mode-3-Wurschmidt-my-long-jazz-layout-HexBoard.json'
  );
  for (const out of [custom, named])
    for (const text of [
      out.file.tuningBundle.tuning.name,
      out.file.tuningBundle.layouts[0].name,
      ...out.file.tuningBundle.scales.map(v => v.name)
    ])
      assert.ok(text.length <= 19 && /^[ -~]+$/.test(text), text);
}
console.log(
  'HexBoard MOS construction, isomorphism, subsets, EDO aliases, export pitches and names, sessions and controls passed' +
    (compat ? ' including the actual HexBoard importer/encoder.' : '.')
);
