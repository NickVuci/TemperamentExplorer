import assert from 'node:assert/strict';
import {createFingeringGame, countOptions} from '../src/composition/fingering-game.mjs';

// A chord with four fingerings; two of them share a key (so completing one can leave a key held).
const placements = [
  {keys: [10, 20, 30]},
  {keys: [11, 21, 31]},
  {keys: [30, 40, 50]},
  {keys: [12, 22, 32]}
];
function setup({chord = {label: 'major triad', index: 0, placements}} = {}) {
  let fingerings = chord,
    lit = [],
    changes = [],
    time = 1000;
  const lights = [];
  const game = createFingeringGame({
    getFingerings: () => fingerings,
    showFingering: i => {
      lit.push(i);
      lights.push(i);
      if (fingerings) fingerings = {...fingerings, index: i};
    },
    now: () => time,
    onChange: s => changes.push(s)
  });
  return {
    game,
    lights,
    changes,
    get lit() {
      return lit;
    },
    tick: ms => {
      time += ms;
    },
    set chord(v) {
      fingerings = v;
    },
    get chord() {
      return fingerings;
    }
  };
}
const held = (...k) => new Set(k);

// ---- options ----
assert.deepEqual(countOptions(144), [3, 5, 10, 144]);
assert.deepEqual(countOptions(4), [3, 4]);
assert.deepEqual(countOptions(3), [3], 'a short list offers just "all"');
assert.deepEqual(countOptions(1), [1]);

// ---- a full game: each fingering lights up in turn and advances when played ----
{
  const t = setup();
  assert.equal(t.game.active, false);
  assert.equal(t.game.start({count: 4}), true);
  assert.equal(t.game.active, true);
  assert.deepEqual(t.lights, [0], 'the first fingering lights up immediately');
  let s = t.game.state();
  assert.deepEqual(
    {phase: s.phase, total: s.total, position: s.position, target: s.target, label: s.label},
    {phase: 'playing', total: 4, position: 0, target: [10, 20, 30], label: 'major triad'}
  );
  t.game.onHeld(held(10));
  t.game.onHeld(held(10, 20));
  assert.equal(t.game.state().position, 0, 'a partly played fingering does not advance');
  t.tick(2500);
  t.game.onHeld(held(10, 20, 30));
  assert.deepEqual(t.lights, [0, 1], 'playing the whole fingering lights the next one');
  assert.equal(t.game.state().played, 1);
  // After advancing, the old keys must be lifted before the next fingering can count.
  t.game.onHeld(held(11, 21, 31));
  assert.equal(
    t.game.state().position,
    1,
    'keys pressed while the old ones were still down are not counted'
  );
  t.game.onHeld(held());
  t.game.onHeld(held(11, 21, 31));
  assert.deepEqual(t.lights, [0, 1, 2]);
  // The third fingering shares key 30 with the first: 30 alone must not complete anything early.
  t.game.onHeld(held());
  t.game.onHeld(held(30));
  assert.equal(t.game.state().position, 2);
  t.game.onHeld(held(30, 40, 50));
  assert.deepEqual(t.lights, [0, 1, 2, 3]);
  t.game.onHeld(held());
  t.tick(1500);
  t.game.onHeld(held(12, 22, 32));
  s = t.game.state();
  assert.equal(s.phase, 'done');
  assert.equal(s.played, 4);
  assert.equal(s.mistakes, 0);
  assert.equal(s.skipped, 0);
  assert.equal(s.seconds, 4, 'the clock stops when the last fingering is played');
  t.tick(9000);
  assert.equal(t.game.state().seconds, 4, 'and stays stopped');
  assert.equal(t.game.active, false);
  assert.equal(t.lights.at(-1), 0, 'the original highlight is put back when the game ends');
}

// ---- order does not matter, extra keys block completion, wrong keys are counted once each ----
{
  const t = setup();
  t.game.start({count: 2});
  t.game.onHeld(held(30, 10, 20));
  assert.equal(t.game.state().position, 1, 'keys may be played in any order');
  t.game.onHeld(held());
  t.game.onHeld(held(11, 99));
  assert.equal(t.game.state().mistakes, 1);
  assert.match(t.game.state().message, /not part of this fingering/);
  t.game.onHeld(held(11, 99, 21));
  t.game.onHeld(held(11, 99, 21, 31));
  assert.equal(
    t.game.state().position,
    1,
    'an extra key held down stops the fingering from counting'
  );
  assert.equal(t.game.state().mistakes, 1, 'holding the same wrong key is one mistake');
  t.game.onHeld(held(11, 21, 31));
  assert.equal(t.game.state().phase, 'done', 'releasing the extra key lets it count');
  const u = setup();
  u.game.start({count: 1});
  u.game.onHeld(held(77));
  u.game.onHeld(held());
  u.game.onHeld(held(77));
  assert.equal(u.game.state().mistakes, 2, 'pressing a wrong key again is another mistake');
}

// ---- skipping ----
{
  const t = setup();
  t.game.start({count: 3});
  t.game.skip();
  assert.deepEqual(t.lights, [0, 1]);
  assert.equal(t.game.state().skipped, 1);
  assert.equal(t.game.state().position, 1);
  t.game.skip();
  t.game.skip();
  assert.equal(t.game.state().phase, 'done');
  assert.equal(t.game.state().played, 0);
  assert.equal(t.game.state().skipped, 3);
  t.game.skip();
  assert.equal(t.game.state().skipped, 3, 'skipping when not playing does nothing');
}

// ---- starting: counts, no chord, keys already held ----
{
  const t = setup();
  assert.equal(t.game.start({count: 99}), true);
  assert.equal(t.game.state().total, 4, 'the count is capped at what the chord has');
  const all = setup();
  all.game.start();
  assert.equal(all.game.state().total, 4, 'no count means all fingerings');
  const none = setup({chord: null});
  assert.equal(none.game.start({count: 3}), false);
  assert.match(none.game.state().message, /Select a chord/);
  assert.equal(none.game.state().phase, 'idle');
  const empty = setup({chord: {label: 'x', index: 0, placements: []}});
  assert.equal(empty.game.start(), false);
  const held0 = setup();
  held0.game.onHeld(held(10, 20, 30)); // keys down before the game starts
  held0.game.start({count: 2});
  held0.game.onHeld(held(10, 20, 30));
  assert.equal(
    held0.game.state().position,
    0,
    'keys already held when the game starts must be lifted first'
  );
  held0.game.onHeld(held());
  held0.game.onHeld(held(10, 20, 30));
  assert.equal(held0.game.state().position, 1);
  const again = setup();
  again.game.start({count: 1});
  again.game.onHeld(held(10, 20, 30));
  assert.equal(again.game.state().phase, 'done');
  assert.equal(again.game.start({count: 2}), true);
  assert.equal(again.game.state().played, 0, 'a new game starts fresh');
  assert.equal(again.game.state().position, 0);
}

// ---- the highlight is re-lit if something else moves it; a changed chord ends the game ----
{
  const t = setup();
  t.game.start({count: 3});
  t.game.onHeld(held(10, 20, 30));
  t.game.onHeld(held());
  t.chord = {...t.chord, index: 3}; // the player navigated elsewhere
  t.game.check();
  assert.equal(t.lights.at(-1), 1, 'the target fingering is lit again');
  t.game.check();
  assert.equal(t.lights.length, 3, 'nothing more is done when it is already lit');
  const lit = t.lights.length;
  t.chord = {label: 'minor triad', index: 3, placements}; // the player chose place 3 of another chord
  t.game.check();
  assert.equal(t.game.state().phase, 'idle');
  assert.match(t.game.state().message, /chord or layout changed/);
  assert.equal(t.lights.length, lit, 'the new chord keeps the place the player chose');
  assert.equal(t.chord.index, 3);
  t.game.stop();
  assert.equal(t.lights.length, lit, 'stopping afterwards lights nothing');
  const cleared = setup();
  cleared.game.start({count: 2});
  cleared.chord = null;
  cleared.game.check();
  assert.equal(cleared.game.state().phase, 'idle', 'clearing the highlight ends the game');
  assert.match(cleared.game.state().message, /highlight was cleared/);
  const fewer = setup();
  fewer.game.start({count: 4});
  fewer.chord = {...fewer.chord, placements: placements.slice(0, 2)};
  fewer.game.check();
  assert.equal(fewer.game.state().phase, 'idle', 'a shorter fingering list ends the game');
  // Same chord name, but the layout moved its keys: the lit keys would no longer be the target.
  const moved = setup();
  moved.game.start({count: 3});
  moved.chord = {...moved.chord, placements: placements.map(p => ({keys: p.keys.map(k => k + 1)}))};
  const movedLights = moved.lights.length;
  moved.game.check();
  assert.equal(
    moved.game.state().phase,
    'idle',
    'a layout change that moves the fingerings ends the game'
  );
  assert.equal(
    moved.lights.length,
    movedLights,
    'and does not light an old place on the new layout'
  );
  // Fingerings after the game's last one may change freely.
  const longer = setup();
  longer.game.start({count: 2});
  longer.chord = {...longer.chord, placements: [...placements.slice(0, 2), {keys: [1, 2, 3]}]};
  longer.game.check();
  assert.equal(longer.game.state().phase, 'playing');
}

// ---- a game that ends normally on a chord that changed meanwhile does not move its highlight ----
{
  const t = setup({chord: {label: 'c', index: 2, placements}});
  t.game.start({count: 1});
  t.chord = {label: 'other', index: 1, placements};
  const lit = t.lights.length;
  t.game.onHeld(held(10, 20, 30));
  assert.equal(t.game.state().phase, 'done');
  assert.equal(t.lights.length, lit);
}

// ---- stop restores the highlight and is harmless when idle ----
{
  const t = setup({chord: {label: 'c', index: 2, placements}});
  t.game.stop();
  assert.equal(t.lights.length, 0);
  t.game.start({count: 3});
  t.game.skip();
  t.game.stop('Stopped.');
  assert.equal(t.lights.at(-1), 2, 'the chord goes back to the fingering that was selected');
  assert.equal(t.game.state().phase, 'idle');
  assert.equal(t.game.state().message, 'Stopped.');
  t.game.onHeld(held(10, 20, 30));
  assert.equal(t.game.state().phase, 'idle', 'keys do nothing when no game is running');
}

// ---- re-entrancy: a host that reports held keys while lighting must not break the game ----
// (Play keeps keys sounding through a highlight redraw; this covers a host that releases them.
// Keys it reports as released really are up, so the next fingering may count at once.)
{
  let game;
  const lights = [];
  game = createFingeringGame({
    getFingerings: () => ({label: 'c', index: 0, placements}),
    showFingering: i => {
      lights.push(i);
      game.onHeld(new Set());
    }
  });
  game.start({count: 3});
  game.onHeld(held(10, 20, 30));
  assert.equal(
    game.state().position,
    1,
    'advancing works even though the redraw reports no keys held'
  );
  game.onHeld(held(11, 21, 31));
  assert.equal(game.state().position, 2, 'and the next fingering counts without an extra release');
  game.onHeld(held(30, 40, 50));
  assert.equal(game.state().phase, 'done');
}

console.log('fingering-game: ok');
