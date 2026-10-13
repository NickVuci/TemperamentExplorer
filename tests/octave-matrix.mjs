import assert from 'node:assert/strict';
import {bootApp} from './support/dom.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {classifyTargets, interval} from '../src/core/engine.mjs';
import {makeState} from '../src/core/catalog.mjs';
import {matrixScale, matrixInterval, matrixWindow} from '../src/core/matrix.mjs';
import {octavePeriods} from '../src/core/pitch.mjs';
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
for (const comma of ['128/125', '2048/2025'])
  for (const method of ['Computed CWE', 'Computed WE']) {
    const s = fromCommas(comma, '2.3.5', method);
    s.mode = 4;
    const one = matrixScale(s);
    for (let i = 0; i < s.n; i++)
      for (let j = 0; j <= s.n; j++) {
        const a = matrixInterval(one, i, j),
          b = interval(s, i, j, 'distance');
        close(a.c, b.c);
        assert.equal(a.k, b.k);
      }
    s.matrixOctave = true;
    const m = matrixScale(s),
      q = octavePeriods(s);
    assert.equal(m.n, q * s.n);
    close(m.p, q * s.p);
    for (let i = 0; i < m.n; i++) {
      close(m.notes[i].c, one.notes[i % s.n].c + Math.floor(i / s.n) * s.p);
      assert.equal(m.notes[i].k, one.notes[i % s.n].k);
      let previous = -1;
      for (let j = 0; j <= m.n; j++) {
        const v = matrixInterval(m, i, j);
        assert.ok(v.c >= previous - 1e-7);
        previous = v.c;
        close((v.c - v.k * s.g) / s.p, Math.round((v.c - v.k * s.g) / s.p));
        if (j < m.n) close(v.c, matrixInterval(m, i, v.end, 'notes').c);
      }
      const octave = classifyTargets(
        s,
        matrixInterval(m, i, m.n),
        [{n: 2, d: 1, c: 1200, label: '2/1'}],
        20
      );
      assert.equal(octave.mapped.length, 1);
      close(octave.mapped[0].error, q * s.p - 1200);
    }
    const fifth = {n: 3, d: 2, c: 1200 * Math.log2(1.5), label: '3/2'};
    assert.ok(fifth.c > one.p);
    let mapped = false;
    for (let i = 0; i < m.n; i++)
      for (let j = 0; j < m.n; j++)
        mapped ||= classifyTargets(s, matrixInterval(m, i, j), [fifth], 15).mapped.some(
          t => t.within
        );
    assert.ok(mapped, 'Mapped fifth must be available beyond the first period');
    assert.equal(matrixScale(JSON.parse(JSON.stringify(s))).n, m.n);
  }
for (const s of [makeState('meantone'), fromCommas('245/243', '3.5.7')]) {
  s.matrixOctave = true;
  assert.equal(octavePeriods(s), 1);
  assert.equal(matrixScale(s).n, s.n);
}
const huge = {
  ...fromCommas('128/125'),
  n: 48,
  rows: [
    [1000, 4, 7],
    [0, 1, 0]
  ],
  p: 1.2,
  g: 0.73,
  matrixOctave: true
};
const m = matrixScale(huge),
  w = matrixWindow(m, true, Infinity, Infinity);
assert.equal(w.rowEnd, m.n);
assert.equal(w.colEnd, m.n + 1);
assert.ok((w.rowEnd - w.rowStart) * (w.colEnd - w.colStart) <= 24 * 48);
assert.equal(matrixWindow(m, false, 0, 0).colStart, 0);

// A temperament whose period divides the octave offers the diamond a whole-octave target span.
const page = await bootApp();
assert.equal(page.$('#diamond-span-controls [data-matrix-span]'), null, 'meantone has one period');
page.chooseTemperament('pajara7');
await page.settle();
const span = page.$('#diamond-span-controls [data-matrix-span="0"]');
assert.ok(span, 'a divided-octave temperament shows the span control beside the diamond');
assert.match(span.closest('label').textContent, /Target span/);
assert.deepEqual(
  [...span.options].map(option => option.value),
  ['period', 'octave']
);
page.change(span, 'octave');
await page.settle();
assert.equal(page.$('#diamond-span-controls [data-matrix-span="0"]').value, 'octave');
assert.match(page.$('#diamond-span-controls').textContent, /repeated periods/);

// The matrix in the centre: inspecting a cell, cell labels, paging and building a chord.
page.chooseTemperament('meantone');
await page.settle();
page.click('[data-unified-center="matrix"]');
await page.settle();
const voices = page.audio.started.length;
page.click('.matrix [data-cell="0,2"]');
await page.settle();
const inspector = page.$('#inspector');
assert.equal(inspector.hidden, false, 'a clicked cell is inspected');
assert.match(inspector.textContent, /^0 → 2/);
assert.equal(page.audio.started.length - voices, 2, 'both notes of the interval sound');
page.click('#tab-play');
await page.settle();
page.click('#tab-discover');
await page.settle();
assert.match(
  page.$('#inspector').textContent,
  /^0 → 2/,
  'the inspected interval survives a redraw'
);
page.click('[data-label="cents"]');
await page.settle();
assert.equal(page.$('#labels').value, 'cents');
assert.match(page.$('.matrix [data-cell="0,2"]').textContent, /^\d+\.\d$/, 'cells show cents');
// Matrices over 96 notes are paged.
page.change('[data-scale-filter]', 'all');
await page.settle();
const large = [...page.$('[data-field="n"]').options].find(option => Number(option.value) > 96);
assert.ok(large, 'meantone offers a scale over 96 notes');
page.change('[data-field="n"]', large.value);
await page.settle();
const rows = () =>
  page
    .$('.matrix-pages')
    .textContent.match(/Rows (\d+)–(\d+)/)
    .slice(1)
    .map(Number);
assert.deepEqual(rows()[0], 0, 'a large matrix opens on its first page');
page.click('[data-matrix-page="0,0,1"]');
await page.settle();
assert.ok(rows()[0] > 0, 'the next page of rows');
page.change('[data-field="n"]', '7');
await page.settle();
page.click('.matrix [data-cell="0,2"]');
await page.settle();
page.click('#inspector [data-buildchord]');
await page.settle();
assert.ok(
  page.$('[data-unified-pane="detail"]').querySelector('[data-chord-field], [data-chord-action]'),
  'Build a chord opens the chord inspector'
);
assert.deepEqual(page.errors, []);
console.log(
  'Octave matrix repetition, mapping, stretched endpoints, modes, session, and paging checks passed.'
);
await page.close();
