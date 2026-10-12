// Markup for Compose's Play view: setup, the Timed/Wait stage (progress, note highway,
// HexBoard with approach rings), results and timing calibration. Pure: view model in, HTML out. The
// controller (composition-game-ui.mjs) moves the highway and rings each frame.
import {esc, option} from '../ui/ui.mjs';
import {gameBoardMarkup} from './composition-board.mjs';
import {barTicks} from './composition-project.mjs';
import {beatTicks} from './composition-grid.mjs';
import {
  SPEEDS,
  GUIDES,
  LEADS,
  SECTIONS,
  LIGHTS,
  HIT_X,
  REPEAT_SECONDS
} from './composition-game-ui.mjs';

const btn = (action, text, extra = '') => `<button data-comp="${action}" ${extra}>${text}</button>`;
const sup = r => (r ? `<sup>${r > 0 ? '+' : ''}${r}</sup>` : '');
const ms = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))} ms`;
const RESULT_LABELS = [
  ['perfect', 'Perfect'],
  ['great', 'Great'],
  ['good', 'Good'],
  ['miss', 'Miss']
];
const INTRO = {
  play: 'Play along at tempo. The highway shows when each note comes, the lit keys show where, and every press is scored.',
  learn:
    'Play the lit notes in order, at your own pace. Each note or chord moves you on, with no backing, timing or score.'
};

function setup(g, project, board) {
  const s = g.settings,
    best = g.best,
    wait = s.mode === 'learn',
    preview = g.preview ?? {text: 'No notes to preview.', hasNotes: false};
  // Wait has no backing or clock, so the timing settings apply to Timed only.
  const timedOnly = wait ? 'disabled' : '';
  const field = (label, name, options, current, extra = '') =>
    `<label><span>${label}</span><select data-comp-field="${name}" ${extra}>${options.map(([v, l, disabled]) => option(v, l, current).replace('<option ', `<option ${disabled ? 'disabled ' : ''}`)).join('')}</select></label>`;
  const check = (name, label, on, extra = '') =>
    `<label class="game-check"><input type="checkbox" data-comp-field="${name}" ${on ? 'checked' : ''} ${extra}><span>${label}</span></label>`;
  const sectionOptions = SECTIONS.map(([k, l]) => [
    k,
    l,
    (k === 'loop' && !g.hasLoop) || (k === 'selected' && !g.hasSelected)
  ]);
  const blocked = !!g.sectionUnavailable || !!g.unreachable?.length,
    bpm = Number.isFinite(g.bpm) ? g.bpm : (project.tempo * s.speed) / 100;
  const unreachable = [
    ...new Map((g.unreachable ?? []).map(t => [`${t.tick}|${t.coordinate.join(',')}`, t])).values()
  ];
  const unavailableNotes = unreachable
    .slice(0, 8)
    .map(
      t =>
        `<li>Bar ${Math.floor(t.tick / barTicks(project.meter)) + 1}: ${t.degree === null ? `coordinate ${esc(t.coordinate.join(', '))}` : `degree ${t.degree}${sup(t.register)}`}</li>`
    )
    .join('');
  const bars =
    s.section === 'bars'
      ? `<div class="game-bars" role="group" aria-label="Bars to play"><label><span>From bar</span><input type="number" data-comp-field="gameFrom" min="1" max="${g.bars}" value="${s.fromBar}"></label><label><span>To bar</span><input type="number" data-comp-field="gameTo" min="1" max="${g.bars}" value="${s.toBar}"></label></div>`
      : '';
  const bestText = wait
    ? 'Wait is not scored.'
    : best
      ? `Best here: <b>${best.score.toLocaleString('en')}</b> · ${best.accuracy.toFixed(1)}% · ${esc(best.grade)} (${esc(best.date)})`
      : 'No score yet at these settings.';
  return `<div class="game-setup"><section class="game-setup-form" aria-labelledby="game-setup-title"><h3 id="game-setup-title">Play the composition</h3>
  <p class="game-intro">${INTRO[s.mode]}</p>
  ${g.message ? `<p class="composition-notice" role="status">${esc(g.message)}</p>` : ''}
  <div class="game-fields">
   ${field(
     'Mode',
     'gameMode',
     [
       ['play', 'Timed'],
       ['learn', 'Wait']
     ],
     s.mode
   )}
   ${field(
     'Part',
     'gamePart',
     [
       ['melody', 'Melody'],
       ['chords', 'Chords'],
       ['both', 'Melody and chords']
     ],
     s.part
   )}
   ${field('Section', 'gameSection', sectionOptions, s.section)}
   ${field(
     'Notes count when',
     'gameMatch',
     [
       ['exact', 'The exact pitch is played'],
       ['degree', 'The degree is played in any octave']
     ],
     s.match
   )}
   ${bars}
   ${field('Note hints', 'gameLights', LIGHTS, s.lights)}
   ${field('Notes arrive', 'gameLead', LEADS, s.lead)}
  </div>
  <fieldset class="game-timed${wait ? ' is-off' : ''}"><legend>Timed</legend>
   ${wait ? '<p class="game-timed-note">Speed, backing, count-in, metronome and the speed trainer apply to Timed runs.</p>' : ''}
   <div class="game-speed">
    <label class="game-speed-value"><span>Speed</span><input type="number" data-comp-field="gameSpeed" min="10" max="200" step="1" value="${s.speed}" ${timedOnly}><span aria-hidden="true">%</span></label>
    <div class="game-speed-presets" role="group" aria-label="Speed presets">${SPEEDS.map(n => btn('game-speed-preset', `${n}%`, `data-speed="${n}" aria-pressed="${s.speed === n}" ${timedOnly}`)).join('')}</div>
    <output>${Number(bpm.toFixed(1))} BPM</output>
    <label class="game-speed-range"><span class="sr-only">Speed percentage</span><input type="range" data-comp-field="gameSpeed" min="10" max="200" step="1" value="${s.speed}" ${timedOnly}></label>
   </div>
   <div class="game-fields">
    ${field('Your part', 'gameGuide', GUIDES, s.guide, timedOnly)}
    ${field(
      'Count-in',
      'gameCountIn',
      [
        [0, 'Off'],
        [1, '1 bar'],
        [2, '2 bars']
      ],
      s.countIn,
      timedOnly
    )}
   </div>
   ${check('gameClick', 'Metronome click', s.click, timedOnly)}
   ${check('gameTrainer', 'Speed trainer: 5% faster after each pass at 90% or better', s.trainer, timedOnly)}
   ${s.trainer ? `<label class="game-target"><span>Target speed (%)</span><input type="number" data-comp-field="gameTargetSpeed" min="10" max="200" step="1" value="${s.targetSpeed}" ${timedOnly}></label>` : ''}
  </fieldset>
  ${check('gameRepeat', 'Repeat the section after each pass', s.repeat)}
  ${g.sectionUnavailable ? `<p class="composition-notice" role="status">${esc(g.sectionUnavailable)}</p>` : ''}
  ${unreachable.length ? `<p class="composition-notice" role="status">${unreachable.length} ${unreachable.length === 1 ? 'note has' : 'notes have'} no playable keys on this layout for the chosen match rule. Change the part, section, match rule or layout before starting.</p><ul class="game-unreachable">${unavailableNotes}${unreachable.length > 8 ? `<li>And ${unreachable.length - 8} more.</li>` : ''}</ul>` : ''}
  <div class="game-start">${btn('game-start', '▶ Start', `class="comp-primary" ${blocked ? 'disabled' : ''}`)}${blocked ? '' : '<span class="game-hint">or press Space</span>'}<p class="game-meta">${bestText}</p></div>
  <div class="game-setup-foot">
   <p class="game-meta">Timing offset: <b>${g.offsetMs === null ? 'not calibrated' : ms(g.offsetMs)}</b> ${btn('game-calibrate', 'Calibrate…')}${g.offsetMs === null ? '' : btn('game-offset-clear', 'Clear')}</p>
   <details class="game-advanced"><summary>Advanced</summary><h4>Export practice targets</h4><p class="viewnote">Save this composition's targets for another practice tool.</p>${field(
     'Export match rule',
     'matchMode',
     [
       ['exact-coordinate', 'Exact coordinate'],
       ['any-degree', 'Any degree'],
       ['button', 'Button']
     ],
     g.exportMatchMode ?? 'exact-coordinate'
   )}${btn('export-targets', 'Export practice targets')}</details>
  </div></section>
  <section class="game-board-wrap" aria-label="Preview"><div class="game-preview"><h4>Preview</h4><output data-game-preview aria-live="polite">${esc(preview.text)}</output><div class="game-preview-actions">${btn('game-preview-first', 'First', preview.hasNotes ? '' : 'disabled')}${btn('game-preview-prev', 'Previous', preview.hasNotes ? '' : 'disabled')}${btn('game-preview-next', 'Next', preview.hasNotes ? '' : 'disabled')}${btn('game-preview-hear', 'Hear', preview.hasNotes ? '' : 'disabled')}</div></div>${gameBoardMarkup(project, board)}<p class="game-hint">Play on this board, on a focused key with Enter, or on a connected HexBoard.</p></section></div>`;
}

function stage(g, project, board) {
  const {chart, lanes, targets} = g,
    from = chart.from,
    laneOf = new Map(lanes.map((l, i) => [l.id, i])),
    wait = g.settings.mode === 'learn';
  const laneId = t =>
    g.settings.match === 'degree' && t.degree !== null ? `d${t.degree}` : t.coordinate.join(',');
  const bar = barTicks(g.meter),
    beat = beatTicks(g.meter);
  const lines = [];
  for (let t = Math.ceil(from / beat) * beat; t <= chart.to; t += beat)
    lines.push(
      `<i class="game-${t % bar === 0 ? 'bar' : 'beat'}" style="--x:${t - from}" aria-hidden="true"></i>`
    );
  // Each note is a solid head where it starts (when to press) and a lighter tail for as long as it lasts.
  const notes = targets
    .map(t => {
      const lane = laneOf.get(laneId(t)) ?? 0,
        l = lanes[lane];
      return `<span class="game-note${t.result ? ` is-${t.result}` : ''}" data-game-note="${t.index}" style="--x:${t.tick - from};--w:${t.endTick - t.tick};--lane:${lane};--key:${l.color};--ink:${l.ink}" aria-hidden="true"><b>${t.degree === null ? '×' : t.degree}${g.settings.match === 'degree' ? '' : sup(t.register)}</b></span>`;
    })
    .join('');
  const labels = lanes
    .map(
      l =>
        `<span style="--key:${l.color}">${l.degree === null ? '×' : l.degree}${sup(l.register)}</span>`
    )
    .join('');
  const stat = (label, value, attr = '', cls = '') =>
    `<div${cls ? ` class="${cls}"` : ''}><dt>${label}</dt><dd ${attr}>${value}</dd></div>`;
  const stats = wait
    ? stat(
        'Completed notes',
        `${targets.filter(t => t.result === 'ok').length} / ${targets.length}`,
        'data-game-score'
      )
    : `${stat('Score', '0', 'data-game-score')}${stat('Accuracy', '100.0%', 'data-game-accuracy')}`;
  return `<div class="game-hud" role="group" aria-label="${wait ? 'Note progress' : 'Score'}">
   <dl class="game-stats">${stats}${stat('Pass', g.pass ?? 1, '', 'game-pass')}</dl>
   ${wait ? '' : '<p class="game-combo" data-game-combo></p>'}
   <div class="game-controls">${wait ? btn('game-hear-current', 'Hear current notes', g.waitingTick === null || g.waitingTick === undefined ? 'hidden' : '') : ''}${btn('game-pause', g.paused ? '▶ Resume' : 'Ⅱ Pause')}${btn('game-restart', 'Restart')}${btn('game-quit', 'Quit')}</div>
   <div class="game-progress" aria-hidden="true"><i data-game-progress></i></div>
  </div>
  <div class="game-stage">
   <div class="game-highway${wait ? ' is-step' : ''}" style="--lanes:${lanes.length};--hit-x:${HIT_X}px">
    <div class="game-road">
     <div class="game-lanes" aria-hidden="true">${labels}</div>
     <div class="game-window" data-game-highway><div class="game-track" data-game-track>${lines.join('')}${notes}</div><i class="game-hitline" aria-hidden="true"></i><output class="game-feedback" data-game-feedback aria-live="polite"></output></div>
    </div>
    <output class="game-overlay" data-game-overlay ${wait ? 'aria-live="polite"' : ''}></output>
   </div>
   <div class="game-board-wrap">${gameBoardMarkup(project, board)}</div>
  </div>`;
}

function results(g) {
  const r = g.summary,
    s = g.settings,
    t = r.timing,
    wait = s.mode === 'learn';
  const tendency =
    t.count < 3
      ? 'Too few timed notes to read your timing.'
      : Math.abs(t.mean) < 10
        ? `Right on time on average (${ms(t.mean)}).`
        : `You play ${t.mean < 0 ? 'early' : 'late'} on average (${ms(t.mean)}).`;
  const spread = t.count > 2 ? ` Most notes land within ${Math.round(t.spread)} ms of that.` : '';
  const peak = Math.max(1, ...t.bins.map(b => b.count));
  // The histogram only appears once there are enough timed notes to read.
  const histogram =
    t.count < 3
      ? ''
      : `<div class="game-histogram" role="img" aria-label="Timing of your notes from ${-t.bins[0].from} ms early to ${t.bins.at(-1).to} ms late">${t.bins.map(b => `<i style="--h:${b.count / peak}" class="${Math.abs((b.from + b.to) / 2) <= 40 ? 'is-perfect' : Math.abs((b.from + b.to) / 2) <= 80 ? 'is-great' : 'is-good'}" title="${b.from} to ${b.to} ms: ${b.count}"></i>`).join('')}</div><div class="game-histogram-axis"><span>early</span><span>on time</span><span>late</span></div>`;
  const best = r.previousBest ? `Best here: ${r.previousBest.score.toLocaleString('en')}.` : '';
  const weak =
    !wait && r.weakest.length
      ? `<div class="game-weak"><h4>Practise next</h4>${r.weakest.map(b => `<div><span>Bar ${b.bar}: ${b.accuracy.toFixed(0)}%${b.misses ? `, ${b.misses} missed` : ''}</span>${btn('game-practise', `Wait on bars ${b.bar}–${Math.min(g.bars, b.bar + 1)}`, `data-from="${b.bar}" data-to="${Math.min(g.bars, b.bar + 1)}"`)}</div>`).join('')}</div>`
      : '';
  const counts = wait
    ? `<dl class="game-counts"><div><dt>Completed notes</dt><dd>${r.learned}</dd></div><div><dt>Wrong notes</dt><dd>${r.wrong}</dd></div></dl>`
    : `<dl class="game-counts">${RESULT_LABELS.map(([k, l]) => `<div class="is-${k}"><dt>${l}</dt><dd>${r.counts[k]}</dd></div>`).join('')}<div><dt>Wrong notes</dt><dd>${r.wrong}</dd></div><div><dt>Holds</dt><dd>${r.holds}</dd></div><div><dt>Best combo</dt><dd>${r.maxCombo}</dd></div></dl>`;
  const again =
    r.nextSpeed && r.nextSpeed !== s.speed
      ? btn('game-again', `▶ Again at ${r.nextSpeed}%`, 'class="comp-primary"')
      : btn('game-again', '▶ Again', 'class="comp-primary"');
  // The countdown bar drains over the repeat's wait; drawn again each second, it carries on from where it was.
  const c = g.repeatCountdown,
    repeat = c
      ? `<div class="game-repeat" role="status" aria-live="polite"><p>${c.paused ? 'Repeat paused.' : 'Next pass in'} <b data-game-repeat-seconds>${c.seconds}</b>${c.paused ? ' seconds remaining.' : ' seconds.'}</p><i class="game-repeat-bar${c.paused ? ' is-paused' : ''}" style="--total:${REPEAT_SECONDS}s;--elapsed:${REPEAT_SECONDS - c.seconds}s;--left:${c.seconds / REPEAT_SECONDS}" aria-hidden="true"></i><div class="game-actions">${btn('game-repeat-pause', c.paused ? 'Resume repeat' : 'Pause repeat')}${btn('game-repeat-stop', 'Stop repeating')}</div></div>`
      : '';
  const title = wait
    ? 'Section completed'
    : r.fullCombo
      ? 'Full combo!'
      : r.accuracy >= 90
        ? 'Great run'
        : r.accuracy >= 70
          ? 'Good run'
          : 'Keep practising';
  const note = wait
    ? `Pass ${g.pass ?? 1}.`
    : `${r.newBest && r.previousBest ? 'New best score! ' : r.newBest ? 'First score at these settings. ' : ''}${esc(best)} At ${s.speed}% speed, pass ${g.pass ?? 1}.`;
  return `<div class="game-results${wait ? ' is-wait' : ''}">
  <div class="game-result-head">${wait ? '' : `<div class="game-grade is-${r.grade}" aria-label="Grade ${r.grade}">${r.grade}</div>`}
   <div class="game-result-main"><h3>${title}</h3><p class="game-big">${wait ? `${r.learned} completed notes` : `${r.score.toLocaleString('en')} points · ${r.accuracy.toFixed(1)}%`}</p><p class="game-meta">${note.trim()}</p></div></div>
  ${counts}
  ${wait ? '' : `<div class="game-timing"><h4>Timing</h4><p>${tendency}${spread}</p>${histogram}</div>`}
  ${weak}${repeat}
  <div class="game-actions">${again}${btn('game-setup', 'Change settings')}</div></div>`;
}

function calibrating(g, project, board) {
  const c = g.calibration;
  return `<div class="game-setup"><section class="game-setup-form game-calibrate"><h3>Calibrate timing</h3>
  <p class="game-intro">Listen to ${c.skip} clicks, then press any key on the HexBoard exactly with each of the next ${c.clicks - c.skip}.</p>
  <p class="game-big" data-game-taps>${c.taps} of ${c.clicks - c.skip} taps</p>
  <p class="game-meta">The measured lag is taken off every press in Timed, so a press you make on the beat counts as on the beat.</p>
  <div class="game-actions">${btn('game-calibrate-done', 'Done')}</div></section><section class="game-board-wrap" aria-label="HexBoard">${gameBoardMarkup(project, board)}</section></div>`;
}

/** The Play workspace for the controller's view model `g`. */
export function renderGame(g, {project, board}) {
  if (!board)
    return `<section class="game"><p class="composition-notice">Playing needs the composition's HexBoard layout. Start a composition from a Play layout to play it.</p></section>`;
  const body =
    g.phase === 'running' && g.chart
      ? stage(g, project, board)
      : g.phase === 'results' && g.summary
        ? results(g)
        : g.phase === 'calibrating' && g.calibration
          ? calibrating(g, project, board)
          : setup(g, project, board);
  return `<section class="game is-${g.phase}" aria-label="Composition Play">${body}</section>`;
}
