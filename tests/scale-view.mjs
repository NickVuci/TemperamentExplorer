import assert from 'node:assert/strict';
import {scale, generatedSizes} from '../src/core/engine.mjs';
import {makeState} from '../src/core/catalog.mjs';
import {
  normalizeScaleView,
  scaleViewToggle,
  scaleStepSummary,
  horogramRings,
  degreeTable,
  renderScaleView,
  linkScaleDegree
} from '../src/ui/scale-view.mjs';

assert.equal(normalizeScaleView('horogram'), 'horogram');
assert.equal(normalizeScaleView('circle'), 'line', 'unknown saved values open on the line');
assert.equal(normalizeScaleView(undefined), 'line');
assert.match(
  scaleViewToggle('horogram'),
  /data-scale-view="horogram" aria-pressed="true" class="active"/
);
assert.match(scaleViewToggle('horogram'), /data-scale-view="line" aria-pressed="false"/);

// Step summary: largest first, counts cover every step.
const meantone = makeState('meantone'),
  diatonic = {...meantone, n: 7, mode: 0},
  a7 = scale(diatonic);
const summary = scaleStepSummary(a7);
assert.deepEqual(
  summary.map(x => [x.symbol, x.count]),
  [
    ['L', 5],
    ['s', 2]
  ]
);
assert.equal(
  summary.reduce((sum, x) => sum + x.count, 0),
  7
);

// Horogram rings are nested MOS on the generator chain: every inner ring is a run of consecutive
// generators that keeps the tonic, its notes are notes of the scale, and the outer ring is the scale.
function checkRings(s) {
  const a = scale(s),
    rings = horogramRings(s, a),
    outer = rings.at(-1);
  assert.equal(outer.n, a.notes.length);
  assert.equal(outer.signature, a.signature);
  const mos = new Set(
    generatedSizes(s)
      .filter(x => x.mos || x.equal)
      .map(x => x.n)
  );
  for (const ring of rings.slice(0, -1)) {
    assert.ok(mos.has(ring.n), `ring ${ring.n} is a MOS size`);
    assert.equal(ring.notes.length, ring.n);
    assert.equal(ring.signature, scale({...s, n: ring.n, mode: 0}).signature);
    assert.ok(
      ring.notes.some(v => v.degree === 0 && v.c === 0),
      'each ring keeps the tonic'
    );
    const ks = ring.notes.map(v => v.k);
    assert.equal(Math.max(...ks) - Math.min(...ks), ring.n - 1, 'consecutive generators');
    assert.ok(
      ring.notes.every(v => a.notes[v.degree].c === v.c),
      'inner notes line up with scale degrees'
    );
    assert.ok(new Set(ring.steps.map(x => x.symbol)).size <= 2);
    assert.ok(
      Math.abs(ring.steps.reduce((sum, x) => sum + x.size, 0) - s.p) < 1e-6,
      'steps fill one period'
    );
  }
  assert.ok(
    rings.every((ring, i) => !i || ring.n > rings[i - 1].n),
    'rings grow outward'
  );
  return rings;
}
assert.deepEqual(
  checkRings(diatonic).map(r => r.n),
  [2, 3, 5, 7]
);
assert.deepEqual(
  checkRings(diatonic).map(r => r.signature),
  ['1L 1s', '2L 1s', '2L 3s', '5L 2s']
);
for (let mode = 0; mode < 7; mode++) checkRings({...meantone, n: 7, mode});
for (let mode = 0; mode < 12; mode++) checkRings({...meantone, n: 12, mode});
// Divided-period temperaments draw one period around the circle.
const pajara = makeState('pajara7');
assert.ok(pajara.p < 1200);
checkRings({...pajara, n: 10, mode: 3});
assert.equal(
  horogramRings({...meantone, n: 2, mode: 0}, scale({...meantone, n: 2, mode: 0})).length,
  1,
  'tiny scales have one ring'
);

// Degree table: one column per degree plus the period, readings coloured by error.
const readings = [
  {label: '1/1', error: 0, identity: true, within: true},
  null,
  {label: '5/4', error: 0.3, identity: true, within: true},
  null,
  {label: '3/2', error: -5.4, identity: true, within: false},
  null,
  null,
  {label: '2/1', error: 0, identity: true, within: true}
];
const table = degreeTable(diatonic, a7, {readings, maxError: 10, bassDegree: 2});
assert.equal((table.match(/<th scope="col"/g) || []).length, 8);
assert.match(table, /<th scope="col" class="period" title="Period">\(7\)<\/th>/);
assert.match(table, /data-note="2"[^>]*aria-pressed="true"/, 'the bass degree is pressed');
assert.match(table, /class="scale-ji is-alt"[^>]*title="Mapped outside tolerance 3\/2: −5.40 ¢"/);
assert.match(table, /<b>5\/4<\/b><small>\+0.3<\/small>/);
assert.equal((table.match(/scale-ji-empty/g) || []).length, 4);

// Both views render playable degrees; the table repeats them.
for (const view of ['line', 'horogram']) {
  const html = renderScaleView({s: diatonic, a: a7, view, bassDegree: -1, readings, maxError: 10});
  assert.equal((html.match(/class="scale-degree/g) || []).length, 14, view);
  assert.match(html, new RegExp(`class="scale-stage scale-stage-${view}"`));
  assert.match(html, /Hardness L\/s<\/dt><dd>1\.656<\/dd>/);
  assert.match(html, /6 up · 0 down/);
}
assert.match(
  renderScaleView({s: diatonic, a: a7, view: 'horogram'}),
  /<ol class="horogram-rings"[^>]*><li><b>2<\/b> · 1L 1s<\/li>/
);
assert.doesNotMatch(
  renderScaleView({s: {...meantone, n: 19, mode: 0}, a: scale({...meantone, n: 19, mode: 0})}),
  /Hardness[^]*Hardness/
);

// Hover links every element of one degree.
const nodes = [0, 1, 0].map(degree => ({
  dataset: {scaleDegree: String(degree)},
  classes: new Set(),
  classList: {
    add(c) {
      this.owner.classes.add(c);
    },
    remove(c) {
      this.owner.classes.delete(c);
    }
  }
}));
for (const node of nodes) node.classList.owner = node;
const doc = {
  querySelectorAll: q =>
    q.endsWith('.is-linked')
      ? nodes.filter(n => n.classes.has('is-linked'))
      : nodes.filter(n => q.includes(`"${n.dataset.scaleDegree}"`))
};
linkScaleDegree({closest: () => nodes[0]}, doc);
assert.deepEqual(
  nodes.map(n => n.classes.has('is-linked')),
  [true, false, true]
);
linkScaleDegree({closest: () => null}, doc);
assert.deepEqual(
  nodes.map(n => n.classes.has('is-linked')),
  [false, false, false]
);

console.log('scale-view: ok');
