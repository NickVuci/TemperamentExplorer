import assert from 'node:assert/strict';
import {createFingeringGame} from '../src/composition/fingering-game.mjs';
import {createFingeringGameUi} from '../src/composition/fingering-game-ui.mjs';

const placements = Array.from({length: 12}, (_, i) => ({keys: [10 + i, 30 + i, 50 + i]}));
function setup({
  fingerings = {label: 'major <triad>', index: 0, placements},
  playView = true
} = {}) {
  const handlers = {},
    lit = [];
  let current = fingerings,
    view = playView,
    ticks = [];
  const host = {
    hidden: false,
    innerHTML: '',
    writes: 0,
    addEventListener: (n, f) => (handlers[n] = f),
    querySelector: s => (s === '[data-fg-time]' ? time : null)
  };
  const time = {textContent: ''};
  const hostProxy = new Proxy(host, {
    set(t, k, v) {
      if (k === 'innerHTML') t.writes++;
      t[k] = v;
      return true;
    }
  });
  let clock = 0,
    ui;
  const game = createFingeringGame({
    getFingerings: () => current,
    showFingering: i => {
      lit.push(i);
      if (current) current = {...current, index: i};
    },
    now: () => clock,
    onChange: () => ui?.update()
  });
  ui = createFingeringGameUi({
    game,
    host: hostProxy,
    getFingerings: () => current,
    isPlayView: () => view,
    timer: {
      set: fn => {
        ticks.push(fn);
        return ticks.length;
      },
      clear() {}
    }
  });
  const el = (dataset, extra = {}) => ({
    dataset,
    closest(sel) {
      return (sel === '[data-fg]' && dataset.fg !== undefined) ||
        (sel === '[data-fg-count]' && dataset.fgCount !== undefined)
        ? this
        : null;
    },
    ...extra
  });
  return {
    host,
    game,
    ui,
    lit,
    time,
    tick: () => ticks[0](),
    click: fg => handlers.click({target: el({fg})}),
    pick: v => handlers.change({target: el({fgCount: ''}, {value: String(v)})}),
    set fingerings(v) {
      current = v;
    },
    set view(v) {
      view = v;
    },
    advance: s => {
      clock += s * 1000;
    }
  };
}

// No chord: a prompt, no Start button.
{
  const t = setup({fingerings: null});
  assert.match(t.host.innerHTML, /Choose a chord fingering on the Play board/);
  assert.doesNotMatch(t.host.innerHTML, /data-fg="start"/);
}

// A chord: its fingerings, length choices ending in "All", and a Start button; labels are escaped.
{
  const t = setup();
  assert.match(t.host.innerHTML, /major &lt;triad&gt;/);
  assert.doesNotMatch(t.host.innerHTML, /<triad>/);
  assert.match(t.host.innerHTML, /12 matching positions on this layout/);
  const options = [...t.host.innerHTML.matchAll(/<option value="(\d+)"[^>]*>([^<]*)</g)].map(m => [
    m[1],
    m[2]
  ]);
  assert.deepEqual(options, [
    ['3', '3'],
    ['5', '5'],
    ['10', '10'],
    ['12', 'All 12']
  ]);
  assert.match(t.host.innerHTML, /<option value="12" selected>/, 'all positions is the default');
}

// Choosing a length, starting, playing through, finishing.
{
  const t = setup();
  t.pick(3);
  t.click('start');
  assert.equal(t.game.state().total, 3);
  assert.deepEqual(t.lit, [0], 'the first fingering is lit');
  assert.match(t.host.innerHTML, /Position 1 of 3/);
  assert.match(t.host.innerHTML, /data-fg="skip"/);
  assert.match(t.host.innerHTML, /<progress max="3" value="0"/);
  t.game.onHeld(new Set([10, 30, 50]));
  assert.match(t.host.innerHTML, /Position 2 of 3/, 'the panel follows the game');
  assert.match(t.host.innerHTML, /Lift all your keys/, 'it tells the player to lift the keys');
  t.game.onHeld(new Set());
  assert.match(t.host.innerHTML, /Press all the lit keys at once/);
  t.game.onHeld(new Set([77]));
  assert.match(t.host.innerHTML, /Wrong keys 1/);
  assert.match(t.host.innerHTML, /not part of this fingering/);
  t.game.onHeld(new Set());
  t.click('skip');
  assert.match(t.host.innerHTML, /Position 3 of 3/);
  assert.match(t.host.innerHTML, /Skipped 1/);
  t.advance(75);
  t.game.onHeld(new Set([12, 32, 52]));
  assert.match(
    t.host.innerHTML,
    /<b>Done\.<\/b> 2 of 3 positions of major &lt;triad&gt; played in 1:15 · 1 wrong key · 1 skipped/
  );
  assert.match(t.host.innerHTML, /data-fg="again"/);
  t.click('again');
  assert.equal(t.game.state().phase, 'playing');
  assert.equal(t.game.state().total, 3);
  assert.equal(t.game.state().played, 0);
  t.click('stop');
  assert.equal(t.game.state().phase, 'idle');
  assert.match(t.host.innerHTML, /Stopped\./);
  assert.match(t.host.innerHTML, /data-fg="start"/);
  t.game.onHeld(new Set()); // lift the keys from the last round
  t.click('start');
  t.game.onHeld(new Set([10, 30, 50]));
  t.game.onHeld(new Set());
  t.game.onHeld(new Set([11, 31, 51]));
  t.game.onHeld(new Set());
  t.game.onHeld(new Set([12, 32, 52]));
  assert.equal(t.game.state().phase, 'done');
  t.click('close');
  assert.equal(t.game.state().phase, 'idle');
}

// "All" plays every fingering.
{
  const t = setup();
  t.click('start');
  assert.equal(t.game.state().total, 12);
  t.pick(3);
  t.ui.useAll();
  assert.equal(t.game.active, false);
  t.click('start');
  assert.equal(t.game.state().total, 12, 'the shape practice action resets a shorter drill to All');
  t.click('stop');
  t.fingerings = {
    label: 'larger chord',
    index: 0,
    placements: [...placements, {keys: [22, 42, 62]}]
  };
  t.tick();
  t.click('start');
  assert.equal(t.game.state().total, 13, 'All follows the current number of positions');
}

// The clock moves in place without rebuilding the panel.
{
  const t = setup();
  t.click('start');
  const writes = t.host.writes;
  t.advance(7);
  t.tick();
  assert.equal(t.host.writes, writes, 'the timer does not redraw the panel');
  assert.equal(t.time.textContent, '0:07');
}

// Leaving the Play view hides the panel and stops a running game; a changed chord stops it too.
{
  const t = setup();
  t.click('start');
  t.view = false;
  t.tick();
  assert.equal(t.host.hidden, true);
  assert.equal(t.game.state().phase, 'idle', 'the game does not keep running out of sight');
  t.view = true;
  t.tick();
  assert.equal(t.host.hidden, false);
  t.click('start');
  t.fingerings = {label: 'minor triad', index: 0, placements};
  t.tick();
  assert.equal(t.game.state().phase, 'idle');
  assert.match(t.host.innerHTML, /chord or layout changed/);
  assert.match(t.host.innerHTML, /minor triad/);
}

// Short chords offer just "All", and a stale length choice is clamped.
{
  const t = setup({fingerings: {label: 'x', index: 0, placements: placements.slice(0, 2)}});
  assert.deepEqual(
    [...t.host.innerHTML.matchAll(/<option value="(\d+)"/g)].map(m => m[1]),
    ['2']
  );
  t.click('start');
  assert.equal(t.game.state().total, 2);
}

console.log('fingering-game-ui: ok');
