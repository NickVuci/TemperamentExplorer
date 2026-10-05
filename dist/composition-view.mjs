// Composition workspace markup. Pure: (project, UI state) -> HTML / models. No DOM access.
import {esc,option} from './ui.mjs';
import {PPQ,ticksToSeconds,barTicks,WAVES} from './composition-project.mjs';
import {resolveTone,degreeOf} from './composition-context.mjs';

export const STEP_TICKS=PPQ/4;          // melody grid resolution: one sixteenth note
export const PAGE_STEPS=16;             // columns per grid page
export const NOTE_LENGTHS=[['1/16',STEP_TICKS],['1/8',STEP_TICKS*2],['1/4',STEP_TICKS*4],['1/2',STEP_TICKS*8],['whole',STEP_TICKS*16]];
export const REGISTER_CHOICES=[['home','Home period',[0]],['up','Home + period above',[1,0]],['both','Periods above and below',[1,0,-1]]];
const coordText=m=>`${m[0]}, ${m[1]}`;

export function formatPosition(project,tick){
  const bar=barTicks(project.meter),beat=PPQ*4/project.meter.denominator;
  const s=ticksToSeconds(project,tick),m=Math.floor(s/60);
  return `bar ${Math.floor(tick/bar)+1} · beat ${Math.floor((tick%bar)/beat)+1} · ${m}:${(s-m*60).toFixed(1).padStart(4,'0')}`;
}

/** Rows of the note grid, highest pitch first: one per scale degree per shown period register. */
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

function projectBar(v){
  const p=v.project;
  if(!p)return `<div class="composition-start"><p>Write chord progressions and melodies in the tuning and scale you are exploring. A composition keeps the tuning it was started with.</p>
   <button data-comp="new">New composition from the current Play setup</button>
   <button data-comp="open">Open composition…</button>
   <p class="viewnote">Current setup: ${esc(v.appSummary)}</p></div>`;
  return `<div class="composition-bar">
   <label>Name <input data-comp-field="name" value="${esc(p.name)}" maxlength="80"></label>
   <button data-comp="undo" ${v.canUndo?'':'disabled'}>Undo</button><button data-comp="redo" ${v.canRedo?'':'disabled'}>Redo</button>
   <button data-comp="save">Save…</button><button data-comp="open">Open…</button><button data-comp="close">Close</button>
  </div>
  <p class="composition-context" data-comp-context>${esc(p.context.name)} · ${p.context.scale.n} notes, mode ${p.context.scale.mode+1} · tonic ${esc(p.context.tonicHz)} Hz · ${esc(p.context.tuning.method??'manual tuning')}</p>
  ${v.matchesApp?'':`<p class="composition-notice" role="status">The app is set to a different tuning or scale than this composition. The composition keeps its own. <button data-comp="load-context">Load the composition’s setup into the app</button></p>`}`;
}

function transportBar(v){
  const p=v.project,idle=v.transportState!=='playing';
  return `<div class="composition-transport" role="group" aria-label="Transport">
   <button data-comp="${idle?'play':'pause'}" aria-pressed="${!idle}">${idle?'Play':'Pause'}</button>
   <button data-comp="stop">Stop</button>
   <label><input type="checkbox" data-comp-field="loop" ${p.loop.enabled?'checked':''}> Loop</label>
   <label>Tempo <input type="number" data-comp-field="tempo" min="20" max="400" step="1" value="${esc(p.tempo)}" ${idle?'':'disabled'}> quarter notes/min</label>
   <label>Meter <input type="number" data-comp-field="meterNum" min="1" max="32" value="${esc(p.meter.numerator)}" ${idle?'':'disabled'} aria-label="Beats per bar"> /
    <select data-comp-field="meterDen" ${idle?'':'disabled'} aria-label="Beat unit">${[1,2,4,8,16,32].map(d=>option(d,d,p.meter.denominator)).join('')}</select></label>
   <label>Sound <select data-comp-field="wave">${WAVES.map(w=>option(w,w,p.sound.wave)).join('')}</select></label>
   <output data-comp-position aria-live="off">${esc(formatPosition(p,v.position))}</output>
  </div>`;
}

function chordSection(v){
  const p=v.project,clip=v.chordClip,total=Math.max(1,clip.lengthTick),events=[...clip.events].sort((a,b)=>a.startTick-b.startTick);
  const parts=[];let cursor=0;
  events.forEach((e,i)=>{
    if(e.startTick>cursor)parts.push(`<span class="chord-rest" style="flex:${e.startTick-cursor}" title="Rest"></span>`);
    const cents=e.tones.map(t=>resolveTone(p.context,t.coordinate).cents.toFixed(1)).join(', ');
    parts.push(`<button class="chord-block" data-comp="chord-select" data-event="${esc(e.id)}" data-start="${e.startTick}" data-end="${e.startTick+e.durationTick}" style="flex:${e.durationTick}" aria-pressed="${v.selectedChord===e.id}" title="${esc(cents)} ¢">${esc(chordLabel(e,i))}</button>`);
    cursor=e.startTick+e.durationTick;
  });
  if(cursor<total)parts.push(`<span class="chord-rest" style="flex:${total-cursor}" title="Rest"></span>`);
  const sel=events.find(e=>e.id===v.selectedChord),idx=sel?events.indexOf(sel):-1;
  const editor=sel?`<div class="chord-editor"><b>${esc(chordLabel(sel,idx))}</b> · ${sel.tones.length} notes · ${esc(formatPosition(p,sel.startTick))}
    <label>Length <input type="number" data-comp-field="chordLength" data-event="${esc(sel.id)}" min="0.25" step="0.25" value="${quarter(sel.durationTick)}"> quarter notes</label>
    <button data-comp="chord-hear" data-event="${esc(sel.id)}">Hear</button>
    <button data-comp="chord-earlier" data-event="${esc(sel.id)}" ${idx>0?'':'disabled'}>Move earlier</button>
    <button data-comp="chord-later" data-event="${esc(sel.id)}" ${idx<events.length-1?'':'disabled'}>Move later</button>
    <button data-comp="chord-duplicate" data-event="${esc(sel.id)}">Duplicate after</button>
    <button data-comp="chord-rest" data-event="${esc(sel.id)}">Rest after (1 quarter)</button>
    <button data-comp="chord-delete" data-event="${esc(sel.id)}">Delete</button></div>`:'<p class="viewnote">Select a chord to edit its length, order or notes.</p>';
  const items=v.collection;
  return `<section class="composition-chords" aria-label="Chord progression"><h3>Chord progression</h3>
   <div class="chord-strip" role="group" aria-label="Chords on a timeline">${parts.join('')||'<span class="viewnote">No chords yet.</span>'}</div>${editor}
   <div class="chord-add"><label>Add a collected chord <select data-comp-field="collection">${items.length?items.map((it,i)=>`<option value="${i}" ${it.compatible?'':'disabled'}>${esc(it.label)}${it.compatible?'':' (other tuning)'}</option>`).join(''):'<option value="">Collect chords in Discover to add them here</option>'}</select></label>
   <label>Length <select data-comp-field="addLength">${[1,2,4,8].map(n=>option(n,`${n} quarter note${n>1?'s':''}`,v.addLength)).join('')}</select></label>
   <button data-comp="chord-add" ${items.some(i=>i.compatible)?'':'disabled'}>Add to end</button></div></section>`;
}

function melodySection(v){
  const p=v.project,clip=v.melodyClip,reg=REGISTER_CHOICES.find(r=>r[0]===v.registers)??REGISTER_CHOICES[1];
  const rows=gridRows(p,reg[2]),pages=Math.max(1,Math.ceil(clip.lengthTick/(PAGE_STEPS*STEP_TICKS))),page=Math.min(v.page,pages-1);
  const model=gridModel(p,clip,rows,page);
  const head=model.columns.map(t=>`<th scope="col" title="${esc(formatPosition(p,t))}">${(t%barTicks(p.meter))===0?`<b>${Math.floor(t/barTicks(p.meter))+1}</b>`:(t%PPQ===0?'·':'')}</th>`).join('');
  const body=rows.map((row,r)=>`<tr><th scope="row" title="coordinate ${esc(coordText(row.coordinate))} · ${row.hz.toFixed(2)} Hz">${row.degree}${row.register?` ${row.register>0?'+':''}${row.register}`:''} <small>${Math.round(row.cents)}¢</small></th>${
    model.cells[r].map(c=>`<td><button class="note-cell ${c.start?'on':c.sustained?'held':''}" data-comp="note-cell" data-tick="${c.tick}" data-a="${row.coordinate[0]}" data-b="${row.coordinate[1]}" aria-pressed="${!!c.start}" aria-label="degree ${row.degree}, ${esc(formatPosition(p,c.tick))}">${c.start?'●':c.sustained?'▬':''}</button></td>`).join('')}</tr>`).join('');
  const events=[...clip.events].sort((a,b)=>a.startTick-b.startTick);
  const list=events.length?`<table class="note-list"><thead><tr><th>Start</th><th>Degree</th><th>¢</th><th>Length (ticks)</th><th>Velocity</th><th></th></tr></thead><tbody>${events.map(e=>{
    const t=e.tones[0],d=degreeOf(p.context,t.coordinate),r=resolveTone(p.context,t.coordinate);
    return `<tr><td>${esc(formatPosition(p,e.startTick))}</td><td>${d?`${d.degree}${d.register?` (${d.register>0?'+':''}${d.register})`:''}`:'<em>outside scale</em>'} <small>[${esc(coordText(t.coordinate))}]</small></td><td>${r.cents.toFixed(1)}</td>
     <td><input type="number" data-comp-field="noteLength" data-event="${esc(e.id)}" min="1" value="${e.durationTick}"></td><td><input type="number" data-comp-field="noteVelocity" data-event="${esc(e.id)}" min="1" max="127" value="${e.velocity}"></td>
     <td><button data-comp="note-delete" data-event="${esc(e.id)}">Delete</button></td></tr>`;}).join('')}</tbody></table>`:'<p class="viewnote">No melody notes yet.</p>';
  const outside=outsideScale(p,clip).length;
  return `<section class="composition-melody" aria-label="Melody"><h3>Melody</h3>
   <div class="melody-controls">
    <label>Note length <select data-comp-field="noteDuration">${NOTE_LENGTHS.map(([n,t])=>option(t,n,v.noteDuration)).join('')}</select></label>
    <label>Show <select data-comp-field="registers">${REGISTER_CHOICES.map(([k,n])=>option(k,n,reg[0])).join('')}</select></label>
    <button data-comp="page-prev" ${page>0?'':'disabled'}>Earlier</button> <span>Page ${page+1} of ${pages}</span> <button data-comp="page-next" ${page<pages-1?'':'disabled'}>Later</button>
   </div>
   <div class="note-grid-wrap"><table class="note-grid" role="grid"><thead><tr><th scope="col">Degree</th>${head}</tr></thead><tbody>${body}</tbody></table></div>
   <p class="viewnote">Rows are degrees of the composition’s scale (not piano keys); each cell is one sixteenth note. Click a cell to add or remove a note.${outside?` ${outside} note${outside>1?'s are':' is'} outside the scale and listed below.`:''}</p>
   <details><summary>Notes as a list</summary>${list}</details></section>`;
}

function cueSection(v){
  return `<section class="composition-cues" aria-label="Practice targets"><h3>Practice targets</h3>
   <p data-comp-cues>${esc(v.cueText)}</p>
   <label>Match <select data-comp-field="matchMode">${[['exact-coordinate','Exact pitch and register'],['any-degree','Any octave of the degree'],['button','A specific button']].map(([k,n])=>option(k,n,v.matchMode)).join('')}</select></label>
   <button data-comp="export-targets">Export practice targets…</button>
   <p class="viewnote">A versioned file of what to play, when, and on which keys of this layout, for practice and rhythm modes. Nothing is scored here.</p></section>`;
}

export function renderComposition(v){
  const p=v.project;
  return `<h2>Composition suite</h2>${projectBar(v)}${p?`${transportBar(v)}${chordSection(v)}${melodySection(v)}${cueSection(v)}`:''}${v.message?`<p class="composition-message" role="status">${esc(v.message)}</p>`:''}<input type="file" data-comp-file accept=".json,application/json" hidden>`;
}

