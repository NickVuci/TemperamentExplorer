// Composition workspace markup. Pure: (project, UI state) -> HTML / models. No DOM access.
import {esc,option} from './ui.mjs';
import {PPQ,ticksToSeconds,barTicks,contentEndTick} from './composition-project.mjs';
import {resolveTone,degreeOf} from './composition-context.mjs';
import {boardMarkup} from './composition-board.mjs';
import {equivalencePolicy,quotientCoordinate} from './harmonic-equivalence.mjs';
import {rootedChordName} from './harmonic-bass.mjs';

export const STEP_TICKS=PPQ/4;          // melody grid resolution: one sixteenth note
export const PAGE_STEPS=16;             // columns per grid page
export const NOTE_LENGTHS=[['1/16',STEP_TICKS],['1/8',STEP_TICKS*2],['1/4',STEP_TICKS*4],['1/2',STEP_TICKS*8],['whole',STEP_TICKS*16]];
// 'board' (registers null) shows exactly the scale pitches the composition's saved HexBoard layout can play.
export const REGISTER_CHOICES=[['board','HexBoard layout',null],['home','Home period',[0]],['up','Home + period above',[1,0]],['both','Periods above and below',[1,0,-1]]];
const coordText=m=>`${m[0]}, ${m[1]}`;

export function formatPosition(project,tick){
  const bar=barTicks(project.meter),beat=PPQ*4/project.meter.denominator;
  const s=ticksToSeconds(project,tick),m=Math.floor(s/60);
  return `bar ${Math.floor(tick/bar)+1} · beat ${Math.floor((tick%bar)/beat)+1} · ${m}:${(s-m*60).toFixed(1).padStart(4,'0')}`;
}

/** Rows of the note grid, highest pitch first: one per scale degree per shown period register. */
/** One row per distinct in-scale pitch on the enabled keys of `board`, highest first; null without a board. */
export function boardRows(project,board){
  if(!board)return null;
  const seen=new Set(),rows=[];
  for(const k of board.keys){
    if(k.command||!k.enabled)continue;
    const id=k.m.join(',');if(seen.has(id))continue;seen.add(id);
    const d=degreeOf(project.context,k.m);if(!d)continue;
    const t=resolveTone(project.context,k.m);
    rows.push({degree:d.degree,register:d.register,coordinate:[...k.m],cents:t.cents,hz:t.hz});
  }
  return rows.length?rows.sort((a,b)=>b.cents-a.cents):null;
}
export function gridRows(project,registers){
  const rows=[];
  for(const register of registers)for(const d of project.context.scale.degrees){
    const coordinate=[d.coordinate[0]+register,d.coordinate[1]],t=resolveTone(project.context,coordinate);
    rows.push({degree:d.degree,register,coordinate,cents:t.cents,hz:t.hz});
  }
  return rows.sort((a,b)=>b.cents-a.cents);
}

/** Per-row, per-column state for one page: {start:event|null, sustained:bool}. */
export function gridModel(project,clip,rows,page){
  const first=page*PAGE_STEPS*STEP_TICKS,columns=Array.from({length:PAGE_STEPS},(_,i)=>first+i*STEP_TICKS);
  const byTone=new Map();
  for(const e of clip.events)for(const tone of e.tones){
    const key=`${tone.coordinate[0]},${tone.coordinate[1]}`;
    if(!byTone.has(key))byTone.set(key,[]);
    byTone.get(key).push(e);
  }
  const cells=rows.map(row=>{
    const events=byTone.get(`${row.coordinate[0]},${row.coordinate[1]}`)??[];
    return columns.map(tick=>{
      const start=events.find(e=>e.startTick===tick)??null;
      const sustained=!start&&events.some(e=>e.startTick<tick&&tick<e.startTick+e.durationTick);
      return {tick,start,sustained};
    });
  });
  return {columns,cells};
}

/** Melody notes outside the Create scale, kept visible so nothing is silently dropped. */
export const outsideScale=(project,clip)=>clip.events.filter(e=>e.tones.some(t=>!degreeOf(project.context,t.coordinate)));

const quarter=ticks=>Number((ticks/PPQ).toFixed(4));
const chordLabel=(e,i)=>e.source?.label?String(e.source.label):`Chord ${i+1}`;
// A chord's root is the lowest note of its default rotation (its directory spelling's first note): the
// tone `source.rootTone` names, recorded when the chord is added. Older chords without it, and collected
// chords whose spelling is unknown, are rooted on their first tone. Voicing edits keep tone order, so the
// root survives inversion. The bass is simply the lowest sounding tone.
export function chordRootTone(e){
 const i=e.source?.rootTone;
 return Number.isInteger(i)&&i>=0&&i<e.tones.length?i:0;
}
// A tone as its scale degree, with any period displacement as a signed register.
function toneDegree(project,tone){
 const d=tone&&degreeOf(project.context,tone.coordinate);
 return d?{degree:d.degree,register:d.register,text:`${d.degree}${d.register?(d.register>0?'+':'')+d.register:''}`}:{degree:null,register:0,text:'outside scale'};
}
export function chordRoot(project,e){
 const tone=e.tones[chordRootTone(e)];return tone?toneDegree(project,tone):null;
}
// Octave-class key of a coordinate when the basis has 2 (a period apart is not the same class), else exact.
function classKey(project){
 let policy=null;
 try{policy=project.context.basis.includes(2)?equivalencePolicy(project.context,'octave'):null;}catch{policy=null;}
 return coordinate=>policy?quotientCoordinate(policy,coordinate).key:JSON.stringify(coordinate);
}
/** The lowest sounding tone as a degree, or null when it is the root's own pitch class (root position). */
export function chordBass(project,e){
 if(!e.tones.length)return null;
 let low=e.tones[0],lowCents=Infinity;
 for(const t of e.tones){let c;try{c=resolveTone(project.context,t.coordinate).cents;}catch{continue;}if(c<lowCents){low=t;lowCents=c;}}
 const key=classKey(project);
 return key(low.coordinate)===key(e.tones[chordRootTone(e)].coordinate)?null:toneDegree(project,low);
}
/** root - chord, e.g. `0 - 4:5:6`, the chord in its directory spelling; the label alone without a root degree. */
export const chordName=(project,e,i)=>rootedChordName(chordRoot(project,e)?.degree,chordLabel(e,i));
const rootMarkup=root=>root?.degree===null?'outside scale':`${root.degree}${root.register?`<sup>${root.register>0?'+':''}${root.register}</sup>`:''}`;


/**
 * Melody guide from the chord lane: for each chord, the pitch classes it holds, so the roll can tint the
 * rows that sound a chord note for as long as the chord lasts. Octave-equivalent when the basis has 2
 * (any register of a chord note is a chord tone; a period apart is not, so divided octaves keep their
 * meaning), otherwise exact. The chord's root is marked separately.
 */
export function chordGuides(project,chords){
 const key=classKey(project);
 return {key,chords:chords.map(e=>({event:e,keys:new Set(e.tones.map(t=>key(t.coordinate))),root:e.tones.length?key(e.tones[chordRootTone(e)].coordinate):null}))};
}

// Root lane: each chord's root as a scale degree over its span; the empty lane opens the harmony picker.
function rootLane(v,w,chords,pct){
 const p=v.project,practice=v.mode==='practice';
 const blocks=chords.map(e=>{const lo=Math.max(w.start,e.startTick),hi=Math.min(w.end,e.startTick+e.durationTick),root=chordRoot(p,e);
  return `<button class="root-block${v.rootPick?.replace===e.id?' is-picking':''}" data-comp="root-block" data-event="${esc(e.id)}" style="left:${pct(lo)}%;width:${100*(hi-lo)/w.span}%" aria-pressed="${v.selectedChord===e.id}" ${practice?'disabled':''} aria-label="Root ${esc(root?.text??'unknown')} of ${esc(chordName(p,e,0))}, ${esc(formatPosition(p,e.startTick))}. Choose to change its harmony" title="Root ${esc(root?.text??'—')} · click to change the harmony">${rootMarkup(root)}</button>`;}).join('');
 const marker=v.rootPick&&!v.rootPick.replace?`<span class="root-pick-marker" style="left:${pct(v.rootPick.tick)}%" aria-hidden="true"></span>`:'';
 return `<div class="roll-root-lane"><b>Root</b><div><button class="roll-root-surface" aria-label="Pick a root and a harmony at a time in the project" ${practice?'disabled':''}></button>${marker}${blocks}</div></div>`;
}
// Harmony picker for the root lane: a root (scale degree), then a directory chord on that root in any inversion.
const PICKER_ROWS=48;
function rootPicker(v){
 const pick=v.rootPick;if(!pick||!v.project)return '';
 const p=v.project,degrees=p.context.scale.degrees;
 const head=`<div class="root-picker-head"><b>${pick.replace?'Change the harmony':'Add a harmony'} at ${esc(formatPosition(p,pick.tick))}</b>${btn('root-cancel','Close')}</div>`;
 if(!v.matchesApp)return `<section class="root-picker" aria-label="Harmony on a root">${head}<p class="composition-notice" role="status">Harmonies come from the chord directory, which follows the app's setup. ${btn('load-context','Load the composition’s setup into the app')}</p></section>`;
 const roots=`<div class="root-degrees" role="group" aria-label="Root (scale degree)"><span>Root</span>${degrees.map(d=>btn('root-degree',String(d.degree),false,`data-degree="${d.degree}" aria-pressed="${pick.degree===d.degree}"`)).join('')}</div>`;
 let list='<p class="viewnote">Choose a root, then a harmony built on it, in root position or an inversion.</p>';
 if(pick.degree!=null){
  const items=v.rootHarmonies;
  if(items==null)list='<p class="viewnote" role="status">Listing the chord directory…</p>';
  else if(!items.length)list=`<p class="viewnote">No directory chord is built on degree ${pick.degree} in this scale. Widen the directory’s size or type filters in Discover.</p>`;
  else{
   const shown=pick.all?items:items.slice(0,PICKER_ROWS),sizes=[...new Set(shown.map(h=>h.size))].sort((a,b)=>a-b);
   list=sizes.map(size=>`<div class="root-harmony-group"><h5>${size} notes</h5><div class="root-harmonies">${shown.filter(h=>h.size===size).map(h=>btn('root-harmony',`<b>${esc(h.label)}</b><small>${esc(h.role)}${h.bass==null?'':` · bass ${h.bass}`}</small>`,false,`data-index="${h.index}"`)).join('')}</div></div>`).join('')+
    (items.length>PICKER_ROWS?btn('root-more',pick.all?`Show the first ${PICKER_ROWS}`:`Show all ${items.length}`):'')+
    '<p class="viewnote">From the chord directory (its size and type filters apply). Root position is voiced close above the root; an inversion raises the notes below its bass by an octave.</p>';
  }
 }
 return `<section class="root-picker" aria-label="Harmony on a root">${head}${roots}${list}</section>`;
}

export function rollWindow(v){
 const bar=barTicks(v.project.meter),end=contentEndTick(v.project);
 return {bar,span:end,start:0,end,bars:Math.round(end/bar)};
}
const btn=(action,text,disabled=false,extra='')=>`<button data-comp="${action}" ${disabled?'disabled':''} ${extra}>${text}</button>`;
function projectBar(v){
 const p=v.project;
 if(!p)return `<div class="composition-start"><p>Build a chord progression, write a melody and see how to play it on your HexBoard.</p>${btn('new','New composition from the current Play setup')}${btn('open','Open composition…')}<p class="viewnote">Current setup: ${esc(v.appSummary)}</p></div>`;
 return `<details class="composition-project-menu"><summary>${esc(p.name)} · Project</summary><div class="composition-bar"><label class="composition-name"><span>Name</span><input data-comp-field="name" value="${esc(p.name)}" maxlength="80"></label><div class="composition-meter" role="group" aria-labelledby="composition-meter-label"><span id="composition-meter-label">Meter</span><div class="composition-meter-fields"><input type="number" data-comp-field="meterNum" min="1" max="32" value="${p.meter.numerator}" aria-label="Beats per bar"><span aria-hidden="true">/</span><select data-comp-field="meterDen" aria-label="Beat unit">${[1,2,4,8,16,32].map(d=>option(d,d,p.meter.denominator)).join('')}</select></div></div><div class="composition-project-actions" role="group" aria-label="Project actions">${btn('save','Save composition…')}${btn('open','Open…')}${btn('new','New composition')}${btn('close','Close')}</div></div></details>
 <p class="composition-context" data-comp-context>${esc(p.context.name)} · ${p.context.scale.n} notes · mode ${p.context.scale.mode+1} · ${esc(p.context.tuning.method??'manual tuning')}</p>
 ${v.matchesApp?'':`<p class="composition-notice" role="status">The app is set to a different tuning or scale than this composition. The composition keeps its own. ${btn('load-context','Load the composition’s setup into the app')}</p>`}`;
}
function transportBar(v){
 const p=v.project,idle=v.transportState!=='playing';
 return `<div class="composition-header"><h2>Compose and practise</h2><div class="composition-transport" role="group" aria-label="Transport">${btn(idle?'play':'pause',idle?'▶ Play':'Ⅱ Pause',false,`class="comp-primary" aria-pressed="${!idle}"`)}${btn('stop','■ Stop')}<label class="comp-loop"><input type="checkbox" data-comp-field="loop" ${p.loop.enabled?'checked':''}><span class="comp-loop-track" aria-hidden="true"></span><span>Loop</span><span class="comp-loop-state" aria-hidden="true">${p.loop.enabled?'On':'Off'}</span></label><label><input type="number" data-comp-field="tempo" min="20" max="400" value="${p.tempo}" aria-label="Tempo" ${idle?'':'disabled'}> BPM</label></div><div class="comp-mode" role="group" aria-label="Workspace mode">${btn('mode-compose','Compose',false,`aria-pressed="${v.mode!=='practice'}"`)}${btn('mode-practice','Practice',false,`aria-pressed="${v.mode==='practice'}"`)}</div></div>`;
}
function timelineSection(v){
 const p=v.project,w=rollWindow(v),reg=REGISTER_CHOICES.find(r=>r[0]===v.registers)??REGISTER_CHOICES[0],rows=(reg[2]?null:boardRows(p,v.board))??gridRows(p,reg[2]??[0]);
 const steps=Math.round(w.span/STEP_TICKS),pct=t=>100*(t-w.start)/w.span;
 const chords=v.chordClip.events.filter(e=>e.startTick<w.end&&e.startTick+e.durationTick>w.start);
 const guide=chordGuides(p,chords);
 const events=v.melodyClip.events,head=Array.from({length:w.bars},(_,i)=>`<button data-comp="seek" data-tick="${w.start+i*w.bar}" style="left:${i*100/w.bars}%;width:${100/w.bars}%" aria-label="Seek to bar ${i+1}">${i+1}</button>`).join('');
 const chordBlocks=chords.map((e,i)=>{const lo=Math.max(w.start,e.startTick),hi=Math.min(w.end,e.startTick+e.durationTick),label=chordName(p,e,i),bass=chordBass(p,e);
  return `<button class="chord-block" data-comp="chord-select" data-event="${esc(e.id)}" data-start="${e.startTick}" data-end="${e.startTick+e.durationTick}" style="left:${pct(lo)}%;width:${100*(hi-lo)/w.span}%" aria-pressed="${v.selectedChord===e.id}" title="${esc(label)}${bass?` · bass ${esc(bass.text)}`:''} · ${quarter(e.durationTick)} beats · drag to move, drag the right edge to resize" aria-label="${esc(label)}${bass?`, bass degree ${esc(bass.text)}`:''}, ${esc(formatPosition(p,e.startTick))}, ${quarter(e.durationTick)} beats"><b class="chord-block-type">${esc(label)}</b><small>${bass?`<span class="chord-block-bass">bass ${rootMarkup(bass)}</span> · `:''}${quarter(e.durationTick)} beats</small>${v.mode==='practice'?'':'<span class="chord-block-grip" data-comp-resize="" aria-hidden="true"></span>'}</button>`;}).join('');
 const body=rows.map(row=>{
  const rowKey=guide.key(row.coordinate),guides=guide.chords.filter(c=>c.keys.has(rowKey)).map(c=>{
   const lo=Math.max(w.start,c.event.startTick),hi=Math.min(w.end,c.event.startTick+c.event.durationTick);
   return `<span class="roll-guide${c.root===rowKey?' is-root':''}${v.selectedChord===c.event.id?' is-selected':''}" style="left:${pct(lo)}%;width:${100*(hi-lo)/w.span}%" aria-hidden="true"></span>`;
  }).join('');
  const notes=events.filter(e=>e.startTick<w.end&&e.startTick+e.durationTick>w.start&&e.tones.some(t=>t.coordinate[0]===row.coordinate[0]&&t.coordinate[1]===row.coordinate[1]));
  return `<div class="roll-row"><div class="roll-degree" title="${row.cents.toFixed(1)} cents · ${row.hz.toFixed(2)} Hz">${row.degree}${row.register?`<sup>${row.register>0?'+':''}${row.register}</sup>`:''}<small>${Math.round(row.cents)}¢</small></div><div class="roll-row-grid" data-a="${row.coordinate[0]}" data-b="${row.coordinate[1]}" style="--roll-steps:${steps}"><button class="roll-surface" data-tick="0" data-a="${row.coordinate[0]}" data-b="${row.coordinate[1]}" aria-label="Add degree ${row.degree} at the beginning of the project" ${v.mode==='practice'?'disabled':''}></button>${guides}${notes.map(e=>{
   const lo=Math.max(w.start,e.startTick),hi=Math.min(w.end,e.startTick+e.durationTick);
   return `<button class="roll-note ${v.selectedNote===e.id?'is-selected':''}" data-comp="note-select" data-event="${esc(e.id)}" data-start="${e.startTick}" data-end="${e.startTick+e.durationTick}" data-a="${row.coordinate[0]}" data-b="${row.coordinate[1]}" style="left:${pct(lo)}%;width:${100*(hi-lo)/w.span}%" aria-pressed="${v.selectedNote===e.id}" aria-label="Degree ${row.degree}, ${esc(formatPosition(p,e.startTick))}, ${quarter(e.durationTick)} beats"><span class="roll-note-grip" data-comp-resize="">▏</span></button>`;
  }).join('')}</div></div>`;
 }).join('');
 const outside=outsideScale(p,v.melodyClip).length;
 const guideNote=chords.length?'<span class="roll-guide-key"><i aria-hidden="true"></i>Chord notes<i class="is-root" aria-hidden="true"></i>Chord root</span>':'';
 return `<section class="composition-timeline" aria-label="Chord and melody sequencer"><div class="roll-toolbar"><label class="roll-bars">Bars <input type="number" data-comp-field="bars" min="1" step="1" value="${w.bars}" aria-label="Number of project bars"></label><label>Note length <select data-comp-field="noteDuration">${NOTE_LENGTHS.map(([n,t])=>option(t,n,v.noteDuration)).join('')}</select></label><label>Show <select data-comp-field="registers">${REGISTER_CHOICES.map(([k,n])=>option(k,n,reg[0])).join('')}</select></label><span class="roll-snap">Snap 1/16</span>${btn('undo','Undo',!v.canUndo)}${btn('redo','Redo',!v.canRedo)}</div>
 <div class="roll-scroll"><div class="roll-canvas" data-comp-roll data-start="${w.start}" data-span="${w.span}" style="--roll-steps:${steps};--bar-width:${100/w.bars}%;width:${104+steps*20}px"><div class="roll-ruler"><span>Bar</span><div>${head}</div></div><div class="roll-chord-lane"><b>Chords</b><div>${chordBlocks||'<span class="roll-empty">Add a collected chord below</span>'}</div></div><div class="roll-rows">${body}</div>${rootLane(v,w,chords,pct)}<div class="roll-playhead" data-comp-playhead aria-hidden="true"><i></i></div></div></div>
 ${rootPicker(v)}
 <div class="roll-status"><output data-comp-position>${esc(formatPosition(p,v.position))}</output>${guideNote}${outside?`<span>${outside} note${outside===1?'':'s'} outside scale · edit in Notes list</span>`:''}</div></section>`;
}
function noteList(v){
 const p=v.project,events=v.melodyClip.events;
 return `<details class="composition-note-list"><summary>Notes as a list</summary><div class="comp-table-scroll"><table class="note-list"><thead><tr><th>Start</th><th>Degree</th><th>Cents</th><th>Length (ticks)</th><th>Velocity</th><th></th></tr></thead><tbody>${events.map(e=>{const t=e.tones[0],d=degreeOf(p.context,t.coordinate),r=resolveTone(p.context,t.coordinate);return `<tr><td>${esc(formatPosition(p,e.startTick))}</td><td>${d?d.degree:'<em>outside scale</em>'}</td><td>${r.cents.toFixed(1)}</td><td><input type="number" data-comp-field="noteLength" data-event="${esc(e.id)}" min="1" value="${e.durationTick}"></td><td><input type="number" data-comp-field="noteVelocity" data-event="${esc(e.id)}" min="1" max="127" value="${e.velocity}"></td><td>${btn('note-delete','Delete',false,`data-event="${esc(e.id)}"`)}</td></tr>`;}).join('')}</tbody></table></div></details>`;
}
export function renderSelectionPanel(v){
 const p=v.project,clip=v.chordClip,events=[...clip.events].sort((a,b)=>a.startTick-b.startTick),sel=events.find(e=>e.id===v.selectedChord),idx=sel?events.indexOf(sel):-1;
 const note=v.melodyClip.events.find(e=>e.id===v.selectedNote);
 const add=`<details class="composition-add" ${events.length?'':'open'}><summary>Add a collected chord</summary><div class="chord-add"><label>Chord <select data-comp-field="collection">${v.collection.length?v.collection.map((it,i)=>`<option value="${i}" ${v.collectionIndex===i?'selected':''} ${it.compatible?'':'disabled'}>${esc(it.label)}${it.compatible?'':' (other tuning)'}</option>`).join(''):'<option>Collect chords in Discover to add them here</option>'}</select></label><label>Length <select data-comp-field="addLength">${[1,2,4,8].map(n=>option(n,`${n} quarter notes`,v.addLength)).join('')}</select></label>${btn('chord-add','Add to end',!v.collection.some(i=>i.compatible))}${btn('chord-add-focus',v.focused?`Add focused chord ${esc(v.focused.label)}`:'Add focused chord',!v.focused?.compatible)}</div></details>`;
 const selBass=sel?chordBass(p,sel):null;
 const chord=sel?`<h4>${esc(chordName(p,sel,idx))}${selBass?` <small class="chord-bass-note">bass ${rootMarkup(selBass)}</small>`:''}</h4><div class="comp-fingerings">${v.fingerings.slice(0,3).map((f,i)=>`<button class="comp-fingering" data-comp="fingering" data-index="${i}" aria-pressed="${v.fingering===i}"><b>${i===0?'Compact':`Alternate ${i}`}</b><span>${f.keys.map(k=>v.board.keys[k].degree).join(' · ')}</span><small>${f.reach} hex steps · keys ${f.keys.join(', ')}</small></button>`).join('')||'<p class="viewnote">No complete fingering for these exact pitches on the saved layout.</p>'}</div><div class="chord-editor">${btn('chord-hear','Hear chord',false,`data-event="${esc(sel.id)}"`)}${btn('chord-invert','Raise lowest note',false,`data-event="${esc(sel.id)}"`)}<label>Length <input type="number" data-comp-field="chordLength" data-event="${esc(sel.id)}" min="0.25" step="0.25" value="${quarter(sel.durationTick)}"> beats</label></div><details><summary>Arrange chord</summary><div class="chord-editor">${btn('chord-earlier','Move earlier',idx===0,`data-event="${esc(sel.id)}"`)}${btn('chord-later','Move later',idx===events.length-1,`data-event="${esc(sel.id)}"`)}${btn('chord-duplicate','Duplicate after',false,`data-event="${esc(sel.id)}"`)}${btn('chord-rest','Rest after (1 quarter)',false,`data-event="${esc(sel.id)}"`)}${btn('chord-delete','Delete',false,`data-event="${esc(sel.id)}"`)}</div></details>`:'<p class="viewnote">Select a chord in the timeline to explore its fingerings.</p>';
 const selectedNote=note?`<div class="comp-note-inspector"><h4>Selected note</h4><label>Length <select data-comp-field="noteLength" data-event="${esc(note.id)}">${[...new Set([...NOTE_LENGTHS.map(x=>x[1]),note.durationTick])].sort((a,b)=>a-b).map(t=>option(t,`${quarter(t)} beats`,note.durationTick)).join('')}</select></label><label>Velocity <input type="number" data-comp-field="noteVelocity" data-event="${esc(note.id)}" min="1" max="127" value="${note.velocity}"></label>${btn('note-hear','Hear',false,`data-event="${esc(note.id)}"`)}${btn('note-delete','Delete note',false,`data-event="${esc(note.id)}"`)}</div>`:'';
 return `<section class="comp-panel comp-selection"><h3>Selected chord</h3>${chord}${selectedNote}${add}</section>`;
}
function practicePanel(v){
 const p=v.project,selected=v.chordClip.events.find(e=>e.id===v.selectedChord);
 return `<section class="comp-panel comp-practice"><h3>Practice</h3><div class="practice-card"><b>Learn this phrase</b><p>Step through the sounding notes and see where to play them.</p><div class="practice-actions">${btn('practice-start','Start phrase')}${btn('practice-prev','Previous')}${btn('practice-next','Next note')}</div><p data-comp-cues>${esc(v.cueText)}</p></div><div class="practice-card"><label><b>Slow playback</b><input type="range" data-comp-field="practiceSpeed" min="25" max="100" step="5" value="${v.practiceSpeed}" aria-label="Practice playback speed"><span>${v.practiceSpeed}%</span></label></div><div class="practice-card"><b>Loop a phrase</b><div class="practice-actions">${btn('loop-off','Off')}${btn('loop-selected','Selected chord',!selected)}${btn('loop-all','All')}</div><p>${p.loop.enabled?(p.loop.endTick!==null?`Loop: ${formatPosition(p,p.loop.startTick)} to ${formatPosition(p,p.loop.endTick)}`:'Whole composition loops'):'Loop is off'}</p></div><div class="practice-card"><label><b>Follow lights</b><input type="checkbox" data-comp-field="follow" ${v.follow?'checked':''}></label><p>Sounding notes highlight on this board and a connected HexBoard.</p></div><details><summary>Export practice targets</summary><label>Match <select data-comp-field="matchMode">${[['exact-coordinate','Exact pitch and register'],['any-degree','Any octave of the degree'],['button','A specific button']].map(([k,n])=>option(k,n,v.matchMode)).join('')}</select></label>${btn('export-targets','Export practice targets…')}</details></section>`;
}
export function renderComposition(v){
 const p=v.project;
 return `${p?transportBar(v):'<h2>Compose and practise</h2>'}${projectBar(v)}${p?`${timelineSection(v)}<div class="composition-lower"><section class="comp-panel comp-board-panel"><div class="comp-panel-heading"><h3>HexBoard</h3><div class="tabs comp-board-show" role="group" aria-label="Show on the board">${[['chords','Chords'],['melody','Melody'],['both','Both']].map(([value,label])=>btn('board-show',label,false,`data-value="${value}" aria-pressed="${(v.boardShow??'both')===value}"`)).join('')}</div><label>Degrees <input type="checkbox" data-comp-field="boardLabels" ${v.boardLabels?'checked':''}></label><span>${p.context.scale.n}-note scale</span></div>${v.board?boardMarkup(p,v.board,v.selectedKeys,v.boardLabels):`<p class="viewnote">${esc(v.boardReason)}</p>`}<p class="viewnote">Saved composition layout · hold keys to play, as on Play; Shift sustains.</p></section>${renderSelectionPanel(v)}${practicePanel(v)}</div>${noteList(v)}`:''}${v.message?`<p class="composition-message" role="status">${esc(v.message)}</p>`:''}<input type="file" data-comp-file accept=".json,application/json" hidden>`;
}
