import assert from 'node:assert/strict';
import {makeState} from '../src/core/catalog.mjs';
import {fromCommas, edoTune} from '../src/core/tuning.mjs';
import {buildBoard, exportHexboard, baseOptions} from '../src/hexboard/hexboard.mjs';
import {mosLayers, keyColor, hexToHSV, textColor} from '../src/hexboard/hexboard-colors.mjs';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';

const s = makeState('meantone'),
  cfg = {
    base: 7,
    offset: 0,
    style: 'bosanquet',
    rotation: 0,
    center: 65,
    register: 0,
    outside: false
  };
const check = (s, c) => {
  const b = buildBoard(s, c),
    colors = mosLayers(s, c, b);
  assert.equal(colors.layers[0].n, c.base);
  assert.equal(colors.layers.at(-1).n, s.n);
  for (const [i, l] of colors.layers.entries()) {
    assert.equal(colors.degreeLayers.filter(x => x === i).length, l.added);
    if (i) {
      assert.ok(l.start <= colors.layers[i - 1].start);
      assert.ok(l.end >= colors.layers[i - 1].end);
    }
  }
  for (const k of b.keys.filter(k => k.inMOS)) {
    assert.equal(colors.degreeLayers[k.degree] === 0, k.base);
    assert.equal(
      keyColor(k, colors),
      keyColor(
        b.keys.find(v => v.degree === k.degree),
        colors
      )
    );
  }
  return colors;
};
assert.deepEqual(
  check(s, cfg).layers.map(l => [l.n, l.added]),
  [
    [7, 7],
    [12, 5],
    [19, 7]
  ]
);
for (const n of [19, 112, 256])
  for (const mode of [0, 6, n - 1])
    for (const offset of [0, Math.floor((n - 7) / 2), n - 7])
      for (const layerGrowth of ['balanced', 'lower', 'higher'])
        check({...s, n, mode}, {...cfg, offset, layerGrowth});
const shifted = {...cfg, offset: 6};
assert.notEqual(
  check(s, {...shifted, layerGrowth: 'lower'}).layers[1].start,
  check(s, {...shifted, layerGrowth: 'higher'}).layers[1].start
);
const colorBoard = buildBoard(s, cfg),
  colorKey = colorBoard.keys.find(k => k.enabled && k.inMOS),
  degreeTwin = colorBoard.keys.find(
    k => k.enabled && k.index !== colorKey.index && k.degree === colorKey.degree
  );
assert.ok(degreeTwin, 'the layout repeats scale degrees on multiple physical buttons');
const customColors = mosLayers(
  s,
  {...cfg, keyColors: {[colorKey.index]: '#ff0000'}, degreeColors: {[colorKey.degree]: '#00ff00'}},
  colorBoard
);
assert.equal(
  keyColor(colorKey, customColors),
  '#ff0000',
  'a button override takes priority over its degree color'
);
assert.equal(
  keyColor(degreeTwin, customColors),
  '#00ff00',
  'a degree override colors every repeated instance'
);
for (const nonOctave of [fromCommas('128/125'), fromCommas('245/243', '3.5.7')])
  check(nonOctave, {...cfg, base: baseOptions(nonOctave)[0].n});
check({...s, ...edoTune(s, 31, '18'), n: 31}, cfg);
assert.deepEqual(hexToHSV('#ff0000'), {hueTenthDegrees: 0, saturation: 255, value: 255});
assert.deepEqual(hexToHSV('#00ff00'), {hueTenthDegrees: 1200, saturation: 255, value: 255});
assert.deepEqual(hexToHSV('#0000ff'), {hueTenthDegrees: 2400, saturation: 255, value: 255});
assert.equal(textColor('#ffffff'), '#000000');
assert.equal(textColor('#000000'), '#ffffff');
const ui = createHexboardWorkspace({
  getStates: () => [s],
  play: () => {},
  refresh: () => {},
  notify: msg => {
    throw Error(msg);
  },
  download: (_, data) => JSON.parse(data),
  getHz: () => 220
});
const markup = ui.render(),
  boardAt = markup.indexOf('<div class="hex-board-scroll">'),
  editorAt = markup.indexOf('<div class="hex-custom-color-host">'),
  actionsAt = markup.indexOf('<div class="panelactions hex-board-actions">');
assert.ok(
  boardAt >= 0 && editorAt > boardAt && actionsAt < boardAt,
  'per-button color controls render immediately beneath the board'
);
const buttonControls = markup.slice(
  editorAt,
  markup.indexOf('<div class="hex-inspector">', editorAt)
);
assert.ok(
  markup.indexOf('<details class="hex-data-box"') < editorAt,
  'the colour editor is in the Key data box beneath the board'
);
const exportAt = markup.indexOf('data-hex-action="export"');
assert.ok(
  exportAt > markup.indexOf('<div class="play-toolbar">') &&
    exportAt < markup.indexOf('<details class="layout-settings"'),
  'HexBoard export is in the toolbar beside the layout'
);
assert.equal(markup.split('data-hex-action="export"').length, 2, 'and only there');
assert.ok(
  markup.indexOf('data-hex-action="center"') < boardAt,
  'Tonic placement belongs to Advanced Layout Options'
);
assert.match(
  buttonControls,
  /<h4>Button 65<\/h4>/,
  'the selected key title appears in the control row'
);
assert.ok(
  buttonControls.indexOf('<h4>Button 65</h4>') >
    buttonControls.indexOf('<div class="hex-controls">'),
  'the selected key title shares the controls row'
);
assert.match(buttonControls, />Single button<\/option>/);
assert.match(buttonControls, />Scale degree<\/option>/);
assert.doesNotMatch(
  buttonControls,
  /This button · \d+|All keys · degree \d+/,
  'scope options do not expose button or degree numbers'
);
assert.match(buttonControls, /data-hex-color-scope aria-label="Apply color to"/);
assert.match(buttonControls, /type="color"[^>]*aria-label="Color for /);
assert.doesNotMatch(
  buttonControls,
  /<label>Apply color to|<label>Color/,
  'color controls have no visible field titles'
);
assert.match(buttonControls, /data-hex-action="root"[^>]*>Set interval root here/);
assert.match(markup, /data-hex-action="center"[^>]*>Put tonic on selected button/);
assert.doesNotMatch(
  markup,
  /Click a hex key, then set its color here/,
  'the color editor has no helper paragraph'
);
const original = ui.serialize();
ui.change({dataset: {hexColor: '12'}, value: '#ff0000'});
const selectedKey = buildBoard(s, ui.serialize().configs[0]).keys[
  ui.serialize().configs[0].selected
];
ui.change({dataset: {hexColorScope: ''}, value: 'degree'});
ui.change({dataset: {hexCustomColor: 'degree'}, value: '#00ff00'});
ui.change({dataset: {hexColorScope: ''}, value: 'key'});
ui.change({dataset: {hexCustomColor: 'key'}, value: '#0000ff'});
const custom = ui.serialize();
assert.equal(custom.configs[0].layerColors[12], '#ff0000');
assert.equal(custom.configs[0].degreeColors[selectedKey.degree], '#00ff00');
assert.equal(custom.configs[0].keyColors[selectedKey.index], '#0000ff');
ui.restore(JSON.parse(JSON.stringify(custom)));
assert.deepEqual(ui.serialize(), custom);
const out = exportHexboard(s, custom.configs[0]),
  colors = mosLayers(s, custom.configs[0], out.board);
for (const k of out.board.keys.filter(k => k.enabled)) {
  const r = out.file.tuningBundle.layouts[0].buttonOverrides[k.index],
    hsv = hexToHSV(keyColor(k, colors));
  for (const f of Object.keys(hsv)) assert.equal(r[f], hsv[f]);
}
const legacy = structuredClone(original);
for (const c of legacy.configs) {
  delete c.palette;
  delete c.layerColors;
  delete c.layerGrowth;
  delete c.keyColors;
  delete c.degreeColors;
}
ui.restore(legacy);
assert.equal(ui.serialize().configs[0].palette, 'spectrum');
assert.throws(
  () =>
    ui.restore({
      ...custom,
      configs: [{...custom.configs[0], layerColors: {12: 'red;bad'}}, custom.configs[1]]
    }),
  /Invalid saved MOS colors/
);
assert.throws(
  () =>
    ui.restore({
      ...custom,
      configs: [{...custom.configs[0], keyColors: {20: '#ff0000'}}, custom.configs[1]]
    }),
  /button colors/
);
assert.throws(
  () =>
    ui.restore({
      ...custom,
      configs: [{...custom.configs[0], degreeColors: {256: '#ff0000'}}, custom.configs[1]]
    }),
  /button colors/
);
ui.restore(custom);
let editorHTML = '',
  inspectorHTML = '';
const previousDocument = globalThis.document;
globalThis.document = {
  querySelector: selector =>
    selector === '.hex-custom-color-host'
      ? {
          set innerHTML(value) {
            editorHTML = value;
          }
        }
      : selector === '.hex-inspector'
        ? {
            set innerHTML(value) {
              inspectorHTML = value;
            }
          }
        : null
};
ui.press({
  dataset: {hexKey: String(ui.serialize().configs[0].selected)},
  closest: () => ({querySelectorAll: () => []})
});
assert.equal(editorHTML, '', 'press writes no UI before the sound starts');
await new Promise(resolve => setTimeout(resolve, 0));
if (previousDocument === undefined) delete globalThis.document;
else globalThis.document = previousDocument;
assert.match(editorHTML, /<h4>Button \d+<\/h4>/);
assert.match(editorHTML, />Single button<\/option>/);
assert.match(editorHTML, />Scale degree<\/option>/);
assert.match(editorHTML, /data-hex-action="root"/);
assert.doesNotMatch(editorHTML, /data-hex-action="center"/);
assert.doesNotMatch(
  inspectorHTML,
  /<h3>Button \d+|data-hex-action="(?:root|center)"/,
  'the selected key title and controls live below the HexBoard, outside the inspector'
);
const activeIndex = ui.serialize().configs[0].selected;
ui.click({closest: () => ({dataset: {hexAction: 'root'}})});
assert.equal(
  ui.serialize().configs[0].root,
  activeIndex,
  'the relocated root action still targets the selected key'
);
ui.click({closest: () => ({dataset: {hexAction: 'center'}})});
assert.equal(
  ui.serialize().configs[0].center,
  activeIndex,
  'the relocated tonic action still targets the selected key'
);
ui.change({dataset: {hexField: 'selectChord'}, type: 'checkbox', checked: true});
ui.click({closest: () => ({dataset: {hexKey: '65'}})}, true);
ui.showChord(
  [
    [0, 0],
    [0, 1]
  ],
  'Test'
);
ui.change({dataset: {hexField: 'palette'}, value: 'ocean'});
assert.deepEqual(ui.serialize().configs[0].chord, [65]); // A highlight changes no colour and leaves the other keys alone: only its keys shine brighter.
const fills = markup =>
  [
    ...markup.matchAll(
      /data-hex-key="(\d+)"[^>]*>[^]*?<polygon[^>]*fill="([^"]+)" stroke="([^"]+)"/g
    )
  ]
    .map(m => m[1] + m[2] + m[3])
    .join();
const lit = markup => (markup.match(/class="[^"]*is-lit[^"]*"/g) || []).length,
  highlightedMarkup = ui.render();
assert.ok(lit(highlightedMarkup) > 1, 'highlighted keys shine brighter');
assert.doesNotMatch(highlightedMarkup, /opacity="/, 'no key is faded');
ui.clearHighlight();
const plainMarkup = ui.render();
const primaryLabels = html =>
  [...html.matchAll(/class="hex-key-label"[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);
assert.deepEqual(
  primaryLabels(highlightedMarkup),
  primaryLabels(plainMarkup),
  'a chord overlay preserves every original key number'
);
assert.match(
  highlightedMarkup,
  /class="hex-chord-tone-label"[^>]*font-size="7"[^>]*>1<\/text>/,
  'the chord order appears as a separate smaller label'
);
assert.doesNotMatch(
  plainMarkup,
  /class="hex-chord-tone-label"/,
  'clearing the overlay removes the secondary labels'
);
assert.equal(
  fills(highlightedMarkup),
  fills(plainMarkup),
  'every key keeps its fill and outline with and without the highlight'
);
assert.ok(lit(plainMarkup) < lit(highlightedMarkup));
assert.equal(
  ui.serialize().configs[0].keyColors[selectedKey.index],
  '#0000ff',
  'changing the layer palette preserves custom button colors'
);
ui.click({closest: () => ({dataset: {hexAction: 'reset-colors'}})});
assert.deepEqual(ui.serialize().configs[0].layerColors, {});
assert.deepEqual(ui.serialize().configs[0].keyColors, {});
assert.deepEqual(ui.serialize().configs[0].degreeColors, {});
console.log(
  'Nested MOS colors, per-button and per-degree overrides, export HSV, session compatibility, and chord overlays passed.'
);
