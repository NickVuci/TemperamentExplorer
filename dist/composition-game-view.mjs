// Rhythm game markup for Compose's Game mode: setup, the running stage (score display, note highway,
// HexBoard with approach rings), results and timing calibration. Pure: view model in, HTML out. The
// controller (composition-game-ui.mjs) moves the highway and rings each frame.
import {esc,option} from './ui.mjs';
import {gameBoardMarkup} from './composition-board.mjs';
import {barTicks} from './composition-project.mjs';
import {beatTicks} from './composition-grid.mjs';
import {SPEEDS,GUIDES,LEADS,SECTIONS,LANE_HEIGHT} from './composition-game-ui.mjs';

const btn=(action,text,extra='')=>`<button data-comp="${action}" ${extra}>${text}</button>`;
const sup=r=>r?`<sup>${r>0?'+':''}${r}</sup>`:'';
const ms=v=>`${v>0?'+':v<0?'−':''}${Math.abs(Math.round(v))} ms`;
const RESULT_LABELS=[['perfect','Perfect'],['great','Great'],['good','Good'],['miss','Miss']];

function setup(g,project,board){
  const s=g.settings,best=g.best;
  const field=(label,name,options,current,extra='')=>`<label><span>${label}</span><select data-comp-field="${name}" ${extra}>${options.map(([v,l])=>option(v,l,current)).join('')}</select></label>`;
  const sectionOptions=SECTIONS.filter(([k])=>k!=='loop'||g.hasLoop);
  return `<div class="game-setup"><div class="game-setup-form"><h3>Rhythm game</h3>
  <p class="viewnote">Play the composition on the HexBoard as its notes arrive. The highway shows when, the rings on the board show where.</p>
  ${g.message?`<p class="composition-notice" role="status">${esc(g.message)}</p>`:''}
  <div class="game-fields">
   ${field('Play','gamePart',[['melody','Melody'],['chords','Chords'],['both','Melody and chords']],s.part)}
   ${field('Mode','gameMode',[['play','Play: scored'],['learn','Learn: waits for each note']],s.mode)}
   ${field('Notes count when','gameMatch',[['exact','The exact pitch is played'],['degree','The degree is played in any octave']],s.match)}
   ${field('Speed','gameSpeed',SPEEDS.map(n=>[n,`${n}%`]),s.speed)}
   ${field('Your part','gameGuide',GUIDES,s.guide)}
   ${field('Notes arrive','gameLead',LEADS,s.lead)}
   ${field('Count-in','gameCountIn',[[0,'Off'],[1,'1 bar'],[2,'2 bars']],s.countIn)}
   ${field('Section','gameSection',sectionOptions,s.section)}
   ${s.section==='bars'?`<label><span>From bar</span><input type="number" data-comp-field="gameFrom" min="1" max="${g.bars}" value="${s.fromBar}"></label><label><span>To bar</span><input type="number" data-comp-field="gameTo" min="1" max="${g.bars}" value="${s.toBar}"></label>`:''}
   <label class="game-check"><input type="checkbox" data-comp-field="gameClick" ${s.click?'checked':''}><span>Metronome click</span></label>
   <label class="game-check"><input type="checkbox" data-comp-field="gameTrainer" ${s.trainer?'checked':''} ${s.mode==='learn'?'disabled':''}><span>Speed trainer: 5% faster after a pass at 90% or better</span></label>
  </div>
  <div class="game-actions">${btn('game-start','▶ Start','class="comp-primary"')}<span class="viewnote">or press Space</span></div>
  <p class="game-meta">${s.mode==='play'?(best?`Best here: <b>${best.score.toLocaleString('en')}</b> · ${best.accuracy.toFixed(1)}% · ${esc(best.grade)} (${esc(best.date)})`:'No score yet at these settings.'):'Learn mode is not scored.'}</p>
  <p class="game-meta">Timing offset: <b>${g.offsetMs===null?'not calibrated':ms(g.offsetMs)}</b> ${btn('game-calibrate','Calibrate…')}${g.offsetMs===null?'':btn('game-offset-clear','Clear')}</p>
  </div><div class="game-board-wrap">${gameBoardMarkup(project,board)}<p class="viewnote">Play on this board, on a focused key with Enter, or on a connected HexBoard.</p></div></div>`;
}

function stage(g,project,board){
  const {chart,lanes,targets}=g,from=chart.from,laneOf=new Map(lanes.map((l,i)=>[l.id,i]));
  const laneId=t=>g.settings.match==='degree'&&t.degree!==null?`d${t.degree}`:t.coordinate.join(',');
  const bar=barTicks(g.meter),beat=beatTicks(g.meter);
  const lines=[];
  for(let t=Math.ceil(from/beat)*beat;t<=chart.to;t+=beat)lines.push(`<i class="game-${t%bar===0?'bar':'beat'}" style="--x:${t-from}" aria-hidden="true"></i>`);
  const notes=targets.map(t=>{const lane=laneOf.get(laneId(t))??0,l=lanes[lane];
    return `<span class="game-note${t.result?` is-${t.result}`:''}" data-game-note="${t.index}" style="--x:${t.tick-from};--w:${t.endTick-t.tick};--lane:${lane};--key:${l.color}" aria-hidden="true"><b>${t.degree===null?'×':t.degree}${g.settings.match==='degree'?'':sup(t.register)}</b></span>`;}).join('');
  const labels=lanes.map(l=>`<span style="--key:${l.color}">${l.degree===null?'×':l.degree}${sup(l.register)}</span>`).join('');
  return `<div class="game-hud" role="group" aria-label="Score">
   <div><span>${g.settings.mode==='learn'?'Notes':'Score'}</span><b data-game-score>0</b></div>
   <div><span>Accuracy</span><b data-game-accuracy>100.0%</b></div>
   <div class="game-combo" data-game-combo></div>
   <div class="game-progress" aria-hidden="true"><i data-game-progress></i></div>
   <div class="game-controls">${btn('game-pause',g.paused?'▶ Resume':'Ⅱ Pause')}${btn('game-quit','Quit')}</div>
  </div>
  <div class="game-stage">
   <div class="game-highway" style="--lanes:${lanes.length};--lane-h:${LANE_HEIGHT}px">
    <div class="game-lanes" aria-hidden="true">${labels}</div>
    <div class="game-window" data-game-highway><div class="game-track" data-game-track>${lines.join('')}${notes}</div><i class="game-hitline" aria-hidden="true"></i></div>
    <output class="game-feedback" data-game-feedback aria-live="polite"></output>
    <output class="game-overlay" data-game-overlay></output>
   </div>
   <div class="game-board-wrap">${gameBoardMarkup(project,board)}</div>
  </div>`;
}

function results(g){
  const r=g.summary,s=g.settings,t=r.timing;
  const tendency=t.count<3?'Too few timed notes to read your timing.':Math.abs(t.mean)<10?`Right on time on average (${ms(t.mean)}).`:`You play ${t.mean<0?'early':'late'} on average (${ms(t.mean)}).`;
  const spread=t.count>2?` Most notes land within ${Math.round(t.spread)} ms of that.`:'';
  const peak=Math.max(1,...t.bins.map(b=>b.count));
  const histogram=`<div class="game-histogram" role="img" aria-label="Timing of your notes from ${-t.bins[0].from} ms early to ${t.bins.at(-1).to} ms late">${t.bins.map(b=>`<i style="--h:${b.count/peak}" class="${Math.abs((b.from+b.to)/2)<=40?'is-perfect':Math.abs((b.from+b.to)/2)<=80?'is-great':'is-good'}" title="${b.from} to ${b.to} ms: ${b.count}"></i>`).join('')}</div><div class="game-histogram-axis"><span>early</span><span>on time</span><span>late</span></div>`;
  const best=r.previousBest?`Best here: ${r.previousBest.score.toLocaleString('en')}`:'';
  const weak=r.weakest.length?`<div class="game-weak"><h4>Practise next</h4>${r.weakest.map(b=>`<div><span>Bar ${b.bar}: ${b.accuracy.toFixed(0)}%${b.misses?`, ${b.misses} missed`:''}</span>${btn('game-practise',`Practise bars ${b.bar}–${b.bar+1}`,`data-from="${b.bar}" data-to="${b.bar+1}"`)}</div>`).join('')}</div>`:'';
  const counts=s.mode==='learn'?`<dl class="game-counts"><div><dt>Played</dt><dd>${r.learned}</dd></div><div><dt>Wrong notes</dt><dd>${r.wrong}</dd></div></dl>`
   :`<dl class="game-counts">${RESULT_LABELS.map(([k,l])=>`<div class="is-${k}"><dt>${l}</dt><dd>${r.counts[k]}</dd></div>`).join('')}<div><dt>Wrong notes</dt><dd>${r.wrong}</dd></div><div><dt>Holds</dt><dd>${r.holds}</dd></div><div><dt>Best combo</dt><dd>${r.maxCombo}</dd></div></dl>`;
  const again=r.nextSpeed&&r.nextSpeed!==s.speed?btn('game-again',`▶ Again at ${r.nextSpeed}%`,'class="comp-primary"'):btn('game-again','▶ Again','class="comp-primary"');
  return `<div class="game-results"><div class="game-grade is-${r.grade}" aria-label="Grade ${r.grade}">${s.mode==='learn'?'✓':r.grade}</div>
  <div class="game-result-main"><h3>${s.mode==='learn'?'Section learned':r.fullCombo?'Full combo!':r.accuracy>=90?'Great run':r.accuracy>=70?'Good run':'Keep practising'}</h3>
   <p class="game-big">${s.mode==='learn'?`${r.accuracy.toFixed(0)}% right first time`:`${r.score.toLocaleString('en')} points · ${r.accuracy.toFixed(1)}%`}</p>
   <p class="viewnote">${s.mode==='play'?(r.newBest&&r.previousBest?'New best score! ':r.newBest?'First score at these settings. ':'')+esc(best):''} ${s.speed<100?`At ${s.speed}% speed.`:''}</p></div>
  ${counts}
  ${s.mode==='play'?`<div class="game-timing"><h4>Timing</h4><p>${tendency}${spread}</p>${histogram}</div>`:''}
  ${weak}
  <div class="game-actions">${again}${btn('game-setup','Change settings')}</div></div>`;
}

function calibrating(g,project,board){
  const c=g.calibration;
  return `<div class="game-setup"><div class="game-setup-form game-calibrate"><h3>Calibrate timing</h3>
  <p>Listen to ${c.skip} clicks, then press any key on the HexBoard exactly with each of the next ${c.clicks-c.skip}.</p>
  <p class="game-big" data-game-taps>${c.taps} of ${c.clicks-c.skip} taps</p>
  <p class="viewnote">The average lag is taken off every press in the game, so a press you make on the beat counts as on the beat.</p>
  ${btn('game-calibrate-done','Done')}</div><div class="game-board-wrap">${gameBoardMarkup(project,board)}</div></div>`;
}

/** The Game mode workspace for the controller's view model `g`. */
export function renderGame(g,{project,board}){
  if(!board)return `<section class="game"><p class="composition-notice">The rhythm game needs the composition's HexBoard layout. Start a composition from a Play layout to play it.</p></section>`;
  const body=g.phase==='running'&&g.chart?stage(g,project,board):g.phase==='results'&&g.summary?results(g):g.phase==='calibrating'&&g.calibration?calibrating(g,project,board):setup(g,project,board);
  return `<section class="game is-${g.phase}" aria-label="Rhythm game">${body}</section>`;
}
