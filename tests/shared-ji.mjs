import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeState} from '../src/core/engine.mjs';
import {
  DEFAULT_ODD_LIMIT,
  MANUAL_PRIME_LIMIT_VALUES,
  ODD_LIMIT_VALUES,
  PRIME_LIMIT_VALUES
} from '../src/core/ji-limit-engine.mjs';
import {createChordWorkspace} from '../src/ui/chord-ui.mjs';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';
const states = [makeState('meantone')];
assert.equal(DEFAULT_ODD_LIMIT, 15);
assert.deepEqual(MANUAL_PRIME_LIMIT_VALUES, [3, 5, 7, 11, 13]);
let ji = {limit: 5, primeLimit: 3, tol: 2};
const opts = {
  getStates: () => states,
  getJI: () => ji,
  play: () => {},
  refresh: () => {},
  notify: e => {
    throw Error(e);
  },
  getHz: () => 220
};
const chords = createChordWorkspace(opts),
  hex = createHexboardWorkspace(opts);
chords.render();
hex.render();
assert.equal(chords.serialize().limit, 5);
assert.equal(chords.serialize().primeLimit, 3);
assert.equal(hex.serialize().configs[0].limit, 5);
assert.equal(hex.serialize().configs[0].primeLimit, 3);
ji = {limit: 11, primeLimit: 7, tol: 20};
chords.render();
hex.render();
assert.equal(chords.serialize().tol, 20);
assert.equal(chords.serialize().primeLimit, 7);
assert.equal(hex.serialize().configs[0].tolerance, 20);
assert.equal(hex.serialize().configs[0].limit, 11);
assert.equal(hex.serialize().configs[0].primeLimit, 7);
ji = {limit: 15, primeLimit: [2, 3, 5, 11], tol: 6};
chords.render();
hex.render();
assert.deepEqual(chords.serialize().primeLimit, [2, 3, 5, 11]);
assert.deepEqual(hex.serialize().configs[0].primeLimit, [2, 3, 5, 11]);
const subgroupChord = chords.serialize(),
  subgroupHex = hex.serialize();
chords.restore(subgroupChord, () => {});
hex.restore(subgroupHex);
assert.deepEqual(chords.serialize().primeLimit, [2, 3, 5, 11]);
assert.deepEqual(hex.serialize().configs[0].primeLimit, [2, 3, 5, 11]);
ji = {limit: 11, primeLimit: 7, tol: 20};
assert.doesNotMatch(chords.render(), /data-chord-field="(?:limit|tol)"/);
assert.doesNotMatch(hex.render(), /data-hex-field="(?:limit|tolerance)"/);
const saved = chords.serialize();
saved.limit = 13;
saved.tol = 1;
delete saved.primeLimit;
chords.restore(saved, () => {});
assert.equal(chords.serialize().limit, 11);
assert.equal(chords.serialize().primeLimit, 7);
assert.equal(chords.serialize().tol, 20);
const html = readFileSync('src/index.html', 'utf8'),
  app = readFileSync('src/app.mjs', 'utf8');
assert.equal(html.match(/id="limit"/g).length, 1);
assert.equal(html.match(/id="primeLimit"/g).length, 1);
assert.equal(html.match(/id="tolerance"/g).length, 1);
assert.equal(html.match(/id="target-controls"/g).length, 1);
assert.doesNotMatch(html, /id="showoutside"/);
assert.equal(html.match(/id="matrix-controls"/g).length, 1);
assert.match(html, /id="ji-controls-parking" hidden/);
assert.match(html, /id="limit" type="number" min="3" max="97" step="2" value="15"/);
assert.match(html, /Prime-limit\/basis/);
assert.match(html, /id="primeLimit" type="text" value="basis"/);
assert.match(app, /parsePrimeFilterInput\(primeLimitSelection,basisPrimes\)/);
assert.match(app, /workflowVersion:8/);
assert.match(app, /manualTolerance,tonic:/);
assert.match(app, /manualTolerance=Number\(data.workflowVersion\?\?0\)>=7/);
assert.match(app, /clampTolerance\(data.settings.manualTolerance\)/);
assert.match(app, /states:\[states\[0\]\]/);
assert.doesNotMatch(app, /comparisonEnabled|compareWorkspace|compare-matrices/);
assert.match(app, /restorePrimeLimit=Number\(data.workflowVersion\?\?0\)<5/);
assert.match(html, /step="2"/);
assert.match(app, /parsePrimeFilterInput/);
assert.match(app, /\$\('#limit'\)\.value=String\(DEFAULT_ODD_LIMIT\)/);
assert.doesNotMatch(app, /for\(const value of PRIME_LIMIT_VALUES\)/);
assert.ok(ODD_LIMIT_VALUES.every(n => n % 2 === 1));
assert.ok(
  PRIME_LIMIT_VALUES.every(n =>
    PRIME_LIMIT_VALUES.filter(p => p <= n).every(p => n === p || n % p !== 0)
  )
);
const sharedHtml = readFileSync('src/index.html', 'utf8'),
  sharedStyle = readFileSync('src/style.css', 'utf8');
const advancedOptions =
  sharedHtml.match(
    /<details id="ji-controls" class="advanced-approximation-options">[\s\S]*?\/details>/
  )?.[0] ?? '';
assert.match(advancedOptions, /id="diamond-scope" data-diamond-scope/);
assert.match(advancedOptions, /data-diamond-settings/);
assert.match(sharedHtml, /id="approximation-module"[\s\S]*?id="limit"/);
assert.match(sharedHtml, /id="approximation-module"[\s\S]*?id="primeLimit"/);
assert.doesNotMatch(advancedOptions, /Tolerance · cents/);
assert.match(sharedHtml, /<input id="tolerance" type="hidden"/);
assert.doesNotMatch(advancedOptions, /Tolerance · cents/);
assert.match(sharedHtml, /id="target-controls" class="target-controls"/);
assert.match(app, /\$\('#approximation-module'\).insertBefore/);
assert.doesNotMatch(sharedHtml, /<details class="advanced-approximation-options"[^>]*open/);
assert.match(
  sharedStyle,
  /\.advanced-approximation-options\s*\{[^}]*margin:\s*8px 0 0;[^}]*padding:\s*0;[^}]*border:\s*0;/
);
assert.match(
  sharedStyle,
  /\.advanced-approximation-options\[open\]\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/
);
assert.doesNotMatch(sharedStyle, /\.diamond-gradient\s*\{/);
assert.match(sharedStyle, /\.matrix \.cell \.target-chip\s*\{[^}]*color:\s*#11151c;/);
console.log(
  'Odd and prime filters share settings across chord and HexBoard workspaces; valid selector ranges are generated centrally.'
);
