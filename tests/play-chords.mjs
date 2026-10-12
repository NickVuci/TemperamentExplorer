// Play's panels and its one Chords panel: layout of the page, the two modes, the directory search, and
// equivalence with the tools they replaced (Map selected keys; the whole-board chord search).
import assert from 'node:assert/strict';
import {makeState} from '../src/core/catalog.mjs';
import {buildBoard} from '../src/hexboard/hexboard.mjs';
import {chordPlacements, discoverBoardChords} from '../src/hexboard/hexboard-chords.mjs';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';

const s = makeState('meantone'),
  searches = [];
const ws = createHexboardWorkspace({
  getStates: () => [s],
  play() {},
  refresh() {},
  notify: m => {
    throw Error(m);
  },
  getHz: () => 220,
  onSearch: text => searches.push(text)
});
const node = dataset => ({
  dataset,
  closest(sel) {
    return sel === '.hex-board' ? null : this;
  }
});
let html = ws.render();
const at = text => {
  const i = html.indexOf(text);
  assert.ok(i >= 0, `renders ${text}`);
  return i;
};

// Toolbar (layout, export), then the advanced drawer, the board with its Key data box, and the side panels.
assert.ok(
  at('<div class="play-toolbar">') < at('data-hex-action="export"') &&
    at('data-hex-action="export"') < at('<details class="layout-settings"')
);
assert.ok(
  at('<div class="hex-board-scroll">') < at('<details class="hex-data-box"') &&
    at('<details class="hex-data-box"') < at('<div class="hex-inspector">')
);
assert.ok(
  at('<aside class="hex-chord-panel">') < at('<section class="play-now"') &&
    at('<section class="play-now"') < at('<section class="play-chords"') &&
    at('<section class="play-chords"') < at('data-play-slot="practice"')
);
assert.ok(
  at('data-live-chord-readout') > at('<section class="play-now"'),
  'the live readout is Now playing'
);
assert.doesNotMatch(
  html,
  /Manual selection|Find chords on this layout|data-hex-finder|chords-search/,
  'the overlapping tools are gone'
);

// Shapes is the first and default mode: the chord menu and its key patterns.
assert.equal(ws.chordMode(), 'shapes');
assert.match(html, /aria-selected="true">Shapes/);
at('class="shape-explorer"');
assert.ok(
  at('data-mode="shapes"') < at('data-mode="places"') &&
    at('data-mode="places"') < at('data-mode="notes"'),
  'Shapes is the first tab'
);
assert.doesNotMatch(html, /data-hex-search-text/);
// Chord → places: a directory search and the chord sent from Discover.
ws.click(node({hexAction: 'chord-mode', mode: 'places'}));
html = ws.render();
assert.equal(ws.chordMode(), 'places');
assert.match(html, /aria-selected="true">Chord → places/);
at('data-hex-search-text');
at('class="catalogue-panel harmony-play"');
ws.input({dataset: {hexSearchText: ''}, value: '4:5:6'});
ws.click(node({hexAction: 'chord-search'}));
assert.deepEqual(searches, ['4:5:6'], 'Find looks the chord up through the app (the directory)');
assert.match(ws.render(), /value="4:5:6"/, 'the search text survives a redraw');

// Note → chords: the tab holds the slot the app mounts the key panel into.
ws.click(node({hexAction: 'chord-mode', mode: 'notes'}));
html = ws.render();
assert.equal(ws.chordMode(), 'notes');
at('data-play-slot="note-chords"');
assert.doesNotMatch(html, /data-hex-search-text/);
ws.click(node({hexAction: 'chord-mode', mode: 'places'}));

// Find places for selected keys: the same placements as the old "Map selected keys", in Chord → places.
{
  const cfg = ws.serialize().configs[0],
    board = buildBoard(s, cfg),
    keys = [65, 66, 74];
  ws.restore({configs: [{...cfg, selectChord: true, chord: keys}]});
  ws.click(node({hexAction: 'chord-mode', mode: 'notes'}));
  ws.click(node({hexAction: 'chords-selection'}));
  const shown = ws.fingerings(),
    expected = chordPlacements(
      board,
      keys.map(i => board.keys[i].m),
      cfg.center,
      {}
    );
  assert.equal(ws.chordMode(), 'places', 'placing selected keys opens Chord → places');
  assert.equal(shown.label, 'Selected keys');
  assert.deepEqual(
    shown.placements.map(p => p.keys),
    expected.map(p => p.keys)
  );
  assert.match(
    ws.render(),
    /<section class="hex-chord-finder">\s*<p role="status"><b>Selected keys<\/b>/
  );
  ws.restore({configs: [cfg]});
}

// The whole-board search is replaced by Note → chords: every chord it finds, Note → chords lists on its
// lowest key, with that placement among its places.
{
  let checked = 0;
  for (const [name, size, reach] of [
    ['meantone', 3, 6],
    ['meantone', 4, 6],
    ['miracle11', 3, 4],
    ['miracle11', 4, 4]
  ]) {
    const state = makeState(name),
      fresh = createHexboardWorkspace({
        getStates: () => [state],
        play() {},
        refresh() {},
        notify: m => {
          throw Error(m);
        },
        getHz: () => 220
      });
    fresh.render();
    fresh.restore({
      configs: [
        {
          ...fresh.serialize().configs[0],
          base: 7,
          offset: 0,
          style: 'bosanquet',
          rotation: 0,
          periodWrapping: true
        }
      ]
    });
    fresh.render();
    const cfg = fresh.serialize().configs[0],
      board = buildBoard(state, cfg);
    const found = discoverBoardChords(state, board, {
      size,
      reach,
      other: false,
      limit: cfg.limit,
      primeLimit: cfg.primeLimit,
      tolerance: cfg.tolerance
    });
    assert.ok(found.groups.length, `the old search finds ${size}-note chords on ${name}`);
    for (const group of found.groups.slice(0, 25))
      for (const p of group.placements.slice(0, 2)) {
        const bass = p.keys.reduce(
          (low, i) => (board.keys[i].c < board.keys[low].c ? i : low),
          p.keys[0]
        );
        fresh.press(node({hexKey: String(bass)}));
        const listed = fresh.harmoniesAt({size, reach}),
          want = [...p.keys].sort((x, y) => x - y).join();
        assert.ok(
          listed.harmonies.some(h =>
            h.placements.some(q => [...q.keys].sort((x, y) => x - y).join() === want)
          ),
          `${name}: ${group.label} on keys ${p.keys} is listed on key ${bass}`
        );
        checked++;
      }
  }
  assert.ok(checked > 20, 'a broad sample is compared');
}
console.log(
  'Play chords: page layout, Shapes first, Chord → places and Note → chords, directory search, and equivalence with the replaced tools passed.'
);
