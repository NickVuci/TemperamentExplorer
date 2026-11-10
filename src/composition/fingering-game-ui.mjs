// The Fingering practice panel on the Play view. Shows only what the player needs to
// start, follow and finish a game; the rules live in fingering-game.mjs and the lighting
// (screen and physical board) comes from the Play board's own highlight.
import {esc, option} from '../ui/ui.mjs';
import {countOptions} from './fingering-game.mjs';

const DEFAULT_COUNT = Infinity;

export function createFingeringGameUi({
  game,
  host,
  getFingerings,
  isPlayView,
  timer = {set: (fn, ms) => setInterval(fn, ms), clear: id => clearInterval(id)}
}) {
  let count = DEFAULT_COUNT,
    lastSignature = '',
    timerId = null;

  const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  function markup(s, f) {
    const head = '<h3>Fingering practice</h3>';
    const note = s.message ? `<p class="fingering-note" role="status">${esc(s.message)}</p>` : '';
    if (s.phase === 'playing') {
      return `${head}<p><b>Position ${s.position + 1} of ${s.total}</b> · ${esc(s.label)} — play the lit keys together.</p>
       <progress max="${s.total}" value="${s.position}" aria-label="Positions played"></progress>
       <p class="viewnote">${s.armed ? 'Press all the lit keys at once; the next fingering lights up when you have them.' : 'Lift all your keys, then play the lit fingering.'}
        · Time <output data-fg-time>${clock(s.seconds)}</output> · Wrong keys ${s.mistakes}${s.skipped ? ` · Skipped ${s.skipped}` : ''}</p>${note}
       <div class="panelactions"><button data-fg="skip">Skip this one</button><button data-fg="stop">Stop</button></div>`;
    }
    if (s.phase === 'done') {
      return `${head}<p role="status"><b>Done.</b> ${s.played} of ${s.total} positions of ${esc(s.label)} played in ${clock(s.seconds)}${s.mistakes ? ` · ${s.mistakes} wrong key${s.mistakes > 1 ? 's' : ''}` : ''}${s.skipped ? ` · ${s.skipped} skipped` : ''}.</p>
       <div class="panelactions"><button data-fg="again">Play again</button><button data-fg="close">Close</button></div>`;
    }
    if (!f)
      return `${head}<p class="viewnote">Choose a chord fingering on the Play board, then practise it at every matching bass position.</p>${note}`;
    const options = countOptions(f.placements.length),
      chosen = options.includes(count)
        ? count
        : (options.filter(n => n <= count).at(-1) ?? options[0]);
    return `${head}<p><b>${esc(f.label)}</b> · ${f.placements.length} matching positions on this layout.</p>
     <div class="panelactions"><label>How many <select data-fg-count>${options.map((n, i) => option(n, i === options.length - 1 ? `All ${n}` : String(n), chosen)).join('')}</select></label>
     <button data-fg="start">Start</button></div>
     <p class="viewnote">The same hand shape and chord intervals, transposed from the lowest bass to the highest. Play the lit keys, then lift them to continue.</p>${note}`;
  }

  function signature(s, f) {
    return JSON.stringify([
      s.phase,
      s.position,
      s.total,
      s.played,
      s.mistakes,
      s.skipped,
      s.armed,
      s.message,
      s.label,
      f ? [f.label, f.placements.length] : null,
      count
    ]);
  }

  /** Re-renders when something the player can see has changed; otherwise only the clock moves. */
  function update(force = false) {
    const visible = isPlayView();
    host.hidden = !visible;
    if (!visible) return;
    const s = game.state(),
      f = getFingerings(),
      sig = signature(s, f);
    if (force || sig !== lastSignature) {
      lastSignature = sig;
      host.innerHTML = markup(s, f);
    } else if (s.phase === 'playing') {
      const out = host.querySelector?.('[data-fg-time]');
      if (out) out.textContent = clock(s.seconds);
    }
  }

  function tick() {
    if (!isPlayView()) {
      if (game.active) game.stop();
      host.hidden = true;
      return;
    }
    game.check();
    update();
  }

  host.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-fg]');
    if (!button) return;
    const action = button.dataset.fg;
    if (action === 'start') game.start({count});
    else if (action === 'again') game.start({count: game.state().total});
    else if (action === 'skip') game.skip();
    else if (action === 'stop') game.stop('Stopped.');
    else if (action === 'close') game.stop();
    update(true);
  });
  host.addEventListener('change', event => {
    const select = event.target?.closest?.('[data-fg-count]');
    if (select) {
      const selected = Number(select.value);
      count =
        selected === getFingerings()?.placements.length ? DEFAULT_COUNT : selected || DEFAULT_COUNT;
    }
  });

  timerId = timer.set(tick, 250);
  update(true);
  return {
    update,
    tick,
    useAll() {
      if (game.active) game.stop();
      count = DEFAULT_COUNT;
      update(true);
    },
    dispose() {
      timer.clear(timerId);
    }
  };
}
