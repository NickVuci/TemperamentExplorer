// Composition workspace markup. Pure: (project, UI state) -> HTML / models. No DOM access.
import {esc,option} from './ui.mjs';
import {PPQ,ticksToSeconds,barTicks,contentEndTick} from './composition-project.mjs';
import {resolveTone,degreeOf} from './composition-context.mjs';
import {boardMarkup} from './composition-board.mjs';
import {mosLayers,keyColor} from './hexboard-colors.mjs';
import {renderGame} from './composition-game-view.mjs';
import {equivalencePolicy,quotientCoordinate} from './harmonic-equivalence.mjs';
import {rootedChordName} from './harmonic-bass.mjs';
import {DIVISIONS,FEELS,SWING_MAX,normalizeGrid,gridRatio,gridLines,meterGroups,groupsText,lengthName,formatBeat,beatTicks} from './composition-grid.mjs';

export const STEP_TICKS=PPQ/4;          // the default grid step: one sixteenth note
// New-note lengths; 'grid' follows the grid step, so a triplet grid draws triplet notes.
export const NOTE_LENGTHS=[['1/16',STEP_TICKS],['1/8',STEP_TICKS*2],['1/4',STEP_TICKS*4],['1/2',STEP_TICKS*8],['whole',STEP_TICKS*16]];
// Lengths offered for a selected note: straight, dotted and triplet values.
const LENGTH_CHOICES=[60,120,160,180,240,320,360,480,640,720,960,1280,1440,1920,2880,3840];
// 'board' (registers null) shows exactly the scale pitches the composition's saved HexBoard layout can play.
export const REGISTER_CHOICES=[['board','HexBoard layout',null],['home','Home period',[0]],['up','Home + period above',[1,0]],['both','Periods above and below',[1,0,-1]]];
/** Horizontal zoom in pixels per quarter note, and row heights in pixels. */
export const ZOOM=Object.freeze({min:10,max:1280,initial:80});
export const ROW_HEIGHT=Object.freeze({min:16,max:48,initial:28});
export const DEGREE_WIDTH=104;
export const SPLIT_CHOICES=[2,3,4,5,6,7];
// [n, m, label]: fit the selection n in the time of m (time is scaled by m/n).
export const FIT_CHOICES=[[3,2,'3:2 triplets'],[5,4,'5:4 quintuplets'],[7,4,'7:4 septuplets'],[2,3,'2:3 dotted'],[1,2,'×2 longer'],[2,1,'×½ shorter']];
export const SWING_CHOICES=[50,54,58,62,66,70,SWING_MAX];
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

/**
 * The roll's rows, highest first: the chosen range plus a row for every other pitch a melody note
 * uses (marked `extra`), so no note is ever hidden. Rows outside the scale have degree null.
 */
export function rollRows(project,board,registers,events=[]){
  const base=(registers?null:boardRows(project,board))??gridRows(project,registers??[0]);
  const seen=new Set(base.map(r=>r.coordinate.join(','))),extra=[];
  for(const e of events)for(const t of e.tones){
    const id=t.coordinate.join(',');if(seen.has(id))continue;seen.add(id);
    const d=degreeOf(project.context,t.coordinate),r=resolveTone(project.context,t.coordinate);
    extra.push({degree:d?.degree??null,register:d?.register??0,coordinate:[...t.coordinate],cents:r.cents,hz:r.hz,extra:true});
  }
  return extra.length?[...base,...extra].sort((a,b)=>b.cents-a.cents):base;
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
 const p=v.project;
 const blocks=chords.map(e=>{const lo=Math.max(w.start,e.startTick),hi=Math.min(w.end,e.startTick+e.durationTick),root=chordRoot(p,e);
  return `<button class="root-block${v.rootPick?.replace===e.id?' is-picking':''}" data-comp="root-block" data-event="${esc(e.id)}" style="left:${pct(lo)}%;width:${100*(hi-lo)/w.span}%" aria-pressed="${v.selectedChord===e.id}"  aria-label="Root ${esc(root?.text??'unknown')} of ${esc(chordName(p,e,0))}, ${esc(formatPosition(p,e.startTick))}. Choose to change its harmony" title="Root ${esc(root?.text??'—')} · click to change the harmony">${rootMarkup(root)}</button>`;}).join('');
 const marker=v.rootPick&&!v.rootPick.replace?`<span class="root-pick-marker" style="left:${pct(v.rootPick.tick)}%" aria-hidden="true"></span>`:'';
 return `<div class="roll-root-lane"><b>Root</b><div><button class="roll-root-surface" aria-label="Pick a root and a harmony at a time in the project" ></button>${marker}${blocks}</div></div>`;
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
 const p=v.project,locked=v.mode==='game'?'disabled':'';
 if(!p)return `<div class="composition-start"><p>Build a chord progression, write a melody and see how to play it on your HexBoard.</p>${btn('new','New composition from the current Play setup')}${btn('open','Open composition…')}<p class="viewnote">Current setup: ${esc(v.appSummary)}</p></div>`;
 return `<details class="composition-project-menu"><summary>${esc(p.name)} · Project</summary><div class="composition-bar"><label class="composition-name"><span>Name</span><input data-comp-field="name" ${locked} value="${esc(p.name)}" maxlength="80"></label><div class="composition-meter" role="group" aria-labelledby="composition-meter-label"><span id="composition-meter-label">Meter</span><div class="composition-meter-fields"><input type="number" data-comp-field="meterNum" ${locked} min="1" max="32" value="${p.meter.numerator}" aria-label="Beats per bar"><span aria-hidden="true">/</span><select data-comp-field="meterDen" ${locked} aria-label="Beat unit">${[1,2,4,8,16,32].map(d=>option(d,d,p.meter.denominator)).join('')}</select></div></div><label class="composition-groups"><span>Beat groups</span><input data-comp-field="meterGroups" ${locked} value="${esc(groupsText(meterGroups(p.meter)))}" placeholder="${esc(groupsText(meterGroups({numerator:p.meter.numerator,denominator:p.meter.denominator})))}" aria-describedby="composition-groups-note"><small id="composition-groups-note">How each bar’s beats are grouped, such as 2+2+3 for 7/8. The roll draws and shades each group.</small></label><div class="composition-project-actions" role="group" aria-label="Project actions">${btn('save','Save composition…')}${btn('open','Open…')}${btn('new','New composition')}${btn('close','Close')}</div></div></details>
 <p class="composition-context" data-comp-context>${esc(p.context.name)} · ${p.context.scale.n} notes · mode ${p.context.scale.mode+1} · ${esc(p.context.tuning.method??'manual tuning')}</p>
 ${v.matchesApp||v.mode==='game'?'':`<p class="composition-notice" role="status">The app is set to a different tuning or scale than this composition. The composition keeps its own. ${btn('load-context','Load the composition’s setup into the app')}</p>`}`;
}
const modeSwitch=v=>`<div class="comp-mode" role="group" aria-label="Workspace mode">${[['compose','Compose'],['game','Play']].map(([k,l])=>btn(`mode-${k}`,l,false,`aria-pressed="${(v.mode??'compose')===k}"`)).join('')}</div>`;
function transportBar(v){
 if(v.mode==='game')return `<div class="composition-header"><h2>Compose and play</h2>${modeSwitch(v)}</div>`;
 const p=v.project,idle=v.transportState!=='playing',lane=v.inputTarget==='chords'?'chord lane':'melody';
 const record=`${btn('record','<span class="comp-rec-dot" aria-hidden="true"></span>Rec',false,`class="comp-record${v.recording?' is-recording':''}" aria-pressed="${!!v.record}" title="Record from the HexBoard into the ${lane} (R)"`)}${v.record?`<label class="comp-countin">Count-in <select data-comp-field="countIn">${[[0,'Off'],[1,'1 bar'],[2,'2 bars']].map(([n,l])=>option(n,l,v.countIn)).join('')}</select></label>`:''}`;
 const click=`<label class="comp-loop comp-click" title="Metronome: clicks on each beat, accenting bars and beat groups"><input type="checkbox" data-comp-field="click" ${v.click?'checked':''}><span class="comp-loop-track" aria-hidden="true"></span><span>Click</span></label>`;
 return `<div class="composition-header"><h2>Compose and play</h2><div class="composition-transport" role="group" aria-label="Transport">${btn(idle?'play':'pause',idle?'▶ Play':'Ⅱ Pause',false,`class="comp-primary" aria-pressed="${!idle}"`)}${btn('stop','■ Stop')}${record}${click}<label class="comp-loop"><input type="checkbox" data-comp-field="loop" ${p.loop.enabled?'checked':''}><span class="comp-loop-track" aria-hidden="true"></span><span>Loop</span><span class="comp-loop-state" aria-hidden="true">${p.loop.enabled?'On':'Off'}</span></label><label><input type="number" data-comp-field="tempo" min="20" max="400" value="${p.tempo}" aria-label="Tempo" ${idle?'':'disabled'}> BPM</label></div>${modeSwitch(v)}</div>`;
}

// ---- piano roll ----

const degreeText=row=>row.degree===null?'×':`${row.degree}`;
const degreeMarkup=row=>`${degreeText(row)}${row.register?`<sup>${row.register>0?'+':''}${row.register}</sup>`:''}`;
const pathOf=(ticks,y0,y1)=>ticks.map(t=>`M${t} ${y0}V${y1}`).join('');
/**
 * Grid lines for the rows as one stretched SVG (x in ticks): banding for every other beat group,
 * then grid steps, beats, groups and bars. Levels closer than a few pixels are left out.
 */
function gridSvg(p,grid,w,zoom){
 const l=gridLines(p.meter,grid,w.start,w.end),px=zoom/PPQ;
 const step=l.step.length>1?Math.min(...l.step.slice(1).map((t,i)=>t-l.step[i])):Infinity;
 const shade=l.shade.map(([a,b])=>`<rect x="${a}" y="0" width="${b-a}" height="1"/>`).join('');
 const lines=[['step',Math.min(step,beatTicks(p.meter)/2)*px>=5?l.step:[]],['beat',beatTicks(p.meter)*px>=4?l.beat:[]],['group',l.group],['bar',l.bar]];
 return `<svg class="roll-lines" viewBox="${w.start} 0 ${w.span} 1" preserveAspectRatio="none" aria-hidden="true"><g class="roll-shade">${shade}</g>${lines.map(([k,t])=>t.length?`<path class="roll-line-${k}" d="${pathOf(t,0,1)}" vector-effect="non-scaling-stroke"/>`:'').join('')}</svg>`;
}
function rulerSvg(p,w,zoom){
 const l=gridLines(p.meter,{division:DIVISIONS[0][1],feel:'straight',snap:true},w.start,w.end),px=zoom/PPQ;
 return `<svg class="roll-ruler-ticks" viewBox="${w.start} 0 ${w.span} 10" preserveAspectRatio="none" aria-hidden="true">${px*beatTicks(p.meter)>=4?`<path class="roll-tick-beat" d="${pathOf(l.beat,7,10)}" vector-effect="non-scaling-stroke"/>`:''}<path class="roll-tick-group" d="${pathOf(l.group,4,10)}" vector-effect="non-scaling-stroke"/></svg>`;
}
const pressed=(action,text,on,extra='')=>btn(action,text,false,`aria-pressed="${!!on}" ${extra}`);
function menu(v,name,summary,body,extra=''){
 return `<details class="roll-menu roll-menu-${name}" data-comp-menu="${name}" ${v.menu===name?'open':''}><summary ${extra}>${summary}</summary><div class="roll-menu-panel">${body}</div></details>`;
}
function editMenu(v,count){
 const none=!count,q=v.rhythm??{};
 return menu(v,'edit','Edit',`<p class="roll-menu-note">${count?`${count} note${count===1?'':'s'} selected`:'Select notes to edit them: drag a box with the Select tool, or press Ctrl+A.'}</p>
 <div class="roll-menu-row">${btn('sel-all','Select all')}${btn('sel-copy','Copy',none)}${btn('sel-cut','Cut',none)}${btn('sel-paste','Paste at playhead',!v.canPaste)}${btn('sel-duplicate','Duplicate',none)}${btn('sel-delete','Delete',none)}</div>
 <h5>Quantize to the grid</h5><div class="roll-menu-row">${btn('sel-quantize','Starts',none)}${btn('sel-quantize-ends','Starts and ends',none)}<label>Strength <select data-comp-field="quantizeStrength">${[100,75,50,25].map(n=>option(n,`${n}%`,q.strength??100)).join('')}</select></label></div>
 <h5>Shape</h5><div class="roll-menu-row">${btn('sel-legato','Legato',none)}${btn('sel-reverse','Retrograde',none)}</div>
 <h5>Pitch</h5><div class="roll-menu-row">${btn('sel-step-up','Scale step up',none)}${btn('sel-step-down','Scale step down',none)}${btn('sel-period-up','Period up',none)}${btn('sel-period-down','Period down',none)}</div>`);
}
function rhythmMenu(v,count){
 const none=!count,r=v.rhythm??{};
 return menu(v,'rhythm','Rhythm',`<h5>Split into a tuplet</h5><p class="roll-menu-note">Each selected note becomes equal notes in its own time.</p><div class="roll-menu-row">${SPLIT_CHOICES.map(n=>btn('sel-split',`${n}`,none,`data-n="${n}" aria-label="Split into ${n}"`)).join('')}<label>or <input type="number" data-comp-field="splitN" min="2" max="32" value="${r.split??9}" aria-label="Split into this many notes"></label>${btn('sel-split','Split',none)}</div>
 <h5>Fit the selection</h5><p class="roll-menu-note">n in the time of m: the selection’s rhythm is stretched by m/n from its first note.</p><div class="roll-menu-row">${FIT_CHOICES.map(([n,m,label])=>btn('sel-fit',esc(label),none,`data-n="${n}" data-m="${m}"`)).join('')}</div><div class="roll-menu-row"><label><input type="number" data-comp-field="fitN" min="1" max="32" value="${r.fitN??9}" aria-label="Notes"> in the time of <input type="number" data-comp-field="fitM" min="1" max="32" value="${r.fitM??8}" aria-label="In the time of"></label>${btn('sel-fit','Fit',none)}</div>
 <h5>Euclidean rhythm</h5><p class="roll-menu-note">${esc(v.euclidRange??'')}</p><div class="roll-menu-row"><label><input type="number" data-comp-field="euclidK" min="0" max="64" value="${r.k??5}" aria-label="Hits"> hits in <input type="number" data-comp-field="euclidN" min="1" max="64" value="${r.n??8}" aria-label="Steps"> steps</label><label>Rotate <input type="number" data-comp-field="euclidRotate" min="-64" max="64" value="${r.rotate??0}"></label><label>Gate <select data-comp-field="euclidGate">${[100,75,50,25].map(n=>option(n,`${n}%`,r.gate??75)).join('')}</select></label>${btn('rhythm-euclid','Fill')}</div><p class="roll-menu-preview" data-comp-euclid-preview aria-hidden="true">${esc(v.euclidPreview??'')}</p>`);
}
function helpMenu(v){
 const rows=[['Draw tool (B)','click to add a note, drag to set its length'],['Select tool (V)','drag a box to select'],['Shift-drag','add a box to the selection'],['Drag a note','move it in time and pitch; its edges change its start or end'],['Alt while dragging','place off the grid'],['Ctrl/⌘-drag','copy the notes'],['Double-click a note','delete it'],['Space','play / pause'],['Delete','delete the selection'],['Ctrl/⌘ + A, C, X, V, D','select all, copy, cut, paste at the playhead, duplicate'],['← →','move by a grid step (Shift: a bar · Ctrl/⌘: 10 ticks)'],['↑ ↓','move by a scale step (Shift: a period)'],['Q','quantize the selection'],['Ctrl/⌘ + Z, Shift + Z','undo, redo'],['Ctrl/⌘ + wheel, Alt + wheel','zoom time, row height'],['Ruler','click to move the playhead, drag to set the loop'],['Row label','click to hear the pitch'],['HexBoard','rows light while their keys are held'],['Step (HexBoard)','hold keys and let go to enter them at the cursor; chords enter together'],['→ ← in Step','rest, or back a step (with nothing selected)'],['Backspace in Step','remove the last entry'],['R','arm recording; Play counts in, then records']];
 return menu(v,'help','?',`<h5>Piano roll</h5><dl>${rows.map(([k,d])=>`<dt>${esc(k)}</dt><dd>${esc(d)}</dd>`).join('')}</dl>`,'aria-label="Piano roll shortcuts" title="Shortcuts"');
}
const gridLabelText=grid=>{const name=DIVISIONS.find(d=>d[1]===grid.division)?.[0]??'',{n,m}=gridRatio(grid);return `${name}${grid.feel==='straight'?(grid.swing>50?` swing ${grid.swing}%`:''):grid.feel==='custom'?` ${n}:${m}`:` ${grid.feel}`}${grid.snap?'':' · snap off'}`;};
const QUARTERS=[1,2,4,8];
function inputGroup(v){
 const chords=v.inputTarget==='chords';
 return `<div class="roll-input roll-group" role="group" aria-label="HexBoard input"><span class="roll-input-label">HexBoard</span><div class="roll-seg">${pressed('input-target','Melody',!chords,'data-value="melody" title="Keys played on the HexBoard go into the melody"')}${pressed('input-target','Chords',chords,'data-value="chords" title="Chords played on the HexBoard go into the chord lane"')}</div>${pressed('step-input','Step',v.stepInput,'title="Step entry: hold keys on the HexBoard and let go to enter them at the cursor"')}${chords?`<label>Chord length <select data-comp-field="chordStep">${QUARTERS.map(n=>option(n,`${n} quarter${n===1?'':'s'}`,v.addLength)).join('')}</select></label>`:''}${v.stepInput?`${btn('step-rest','Rest',false,'title="Move on a step without a note (→)"')}${btn('step-tie','Tie',false,'title="Lengthen the last entry by a step"')}${btn('step-back','Back',false,'title="Remove the last entry (Backspace)"')}`:''}</div>`;
}
function rollToolbar(v,grid,reg,bars,count){
 const ratio=gridRatio(grid),straight=ratio.n===1&&ratio.m===1;
 return `<div class="roll-toolbar">
 <div class="roll-tools roll-group" role="group" aria-label="Tool">${pressed('tool-draw','✎ Draw',v.tool!=='select','title="Draw tool (B)"')}${pressed('tool-select','⬚ Select',v.tool==='select','title="Select tool (V)"')}</div>
 <div class="roll-grid-controls roll-group" role="group" aria-label="Grid"><label>Grid <select data-comp-field="gridDivision">${DIVISIONS.map(([n,t])=>option(t,n,grid.division)).join('')}</select></label><select data-comp-field="gridFeel" aria-label="Grid feel">${FEELS.map(([k,l])=>option(k,l,grid.feel)).join('')}</select>${grid.feel==='custom'?`<span class="roll-tuplet"><input type="number" data-comp-field="gridN" min="1" max="32" value="${grid.n}" aria-label="Notes per group">:<input type="number" data-comp-field="gridM" min="1" max="32" value="${grid.m}" aria-label="In the time of"></span>`:''}${straight?`<label>Swing <select data-comp-field="gridSwing">${SWING_CHOICES.map(s=>option(s,s===50?'Off':`${s}%`,grid.swing)).join('')}</select></label>`:''}${pressed('snap','Snap',grid.snap,'title="Snap to the grid. Hold Alt while dragging to place freely."')}</div>
 <label>New note <select data-comp-field="noteDuration">${option('grid','Grid step',v.noteDuration)}${NOTE_LENGTHS.map(([n,t])=>option(t,n,v.noteDuration)).join('')}</select></label>
 ${editMenu(v,count)}${rhythmMenu(v,count)}
 <span class="roll-break" aria-hidden="true"></span>${inputGroup(v)}
 <div class="roll-zoom roll-group" role="group" aria-label="Zoom">${btn('zoom-out','−',false,'aria-label="Zoom out" title="Zoom out (Ctrl/⌘ + wheel)"')}${btn('zoom-fit','Fit',false,'title="Fit the whole composition"')}${btn('zoom-in','+',false,'aria-label="Zoom in" title="Zoom in"')}${btn('rows-less','↕−',false,'aria-label="Shorter rows" title="Shorter rows (Alt + wheel)"')}${btn('rows-more','↕+',false,'aria-label="Taller rows" title="Taller rows"')}</div>
 ${pressed('velocity-lane','Velocity',v.velocityLane,'title="Show the velocity lane"')}
 <label>Show <select data-comp-field="registers">${REGISTER_CHOICES.map(([k,n])=>option(k,n,reg[0])).join('')}</select></label>
 <label class="roll-bars">Bars <input type="number" data-comp-field="bars" min="1" step="1" value="${bars}" aria-label="Number of project bars"></label>
 <div class="roll-group" role="group" aria-label="History">${btn('undo','Undo',!v.canUndo,'title="Undo (Ctrl/⌘ + Z)"')}${btn('redo','Redo',!v.canRedo,'title="Redo (Ctrl/⌘ + Shift + Z)"')}</div>
 ${helpMenu(v)}</div>`;
}
function velocityLane(events,pct,selected){
 return `<div class="roll-velocity-lane"><b>Velocity</b><div class="roll-velocity-track" data-comp-velocity title="Drag a bar to change its velocity, or across the lane to draw velocities">${events.map(e=>`<span class="roll-vel${selected.has(e.id)?' is-selected':''}" data-vel-event="${esc(e.id)}" style="left:${pct(e.startTick)}%;--vel:${(e.velocity/127).toFixed(3)}"><i></i></span>`).join('')}</div></div>`;
}
/** Each pitch's HexBoard key colour on the composition's layout, so rows and keys read as one. */
function keyColors(v){
 if(!v.board||!v.project?.layout)return null;
 try{
  const colors=mosLayers(v.project.context.state,v.project.layout,v.board),out=new Map();
  for(const k of v.board.keys)if(!k.command&&k.enabled){const id=k.m.join(',');if(!out.has(id))out.set(id,keyColor(k,colors));}
  return out;
 }catch{return null;}
}
function rollModel(v){
 const p=v.project,w=rollWindow(v),reg=REGISTER_CHOICES.find(r=>r[0]===v.registers)??REGISTER_CHOICES[0];
 const events=v.melodyClip.events,selected=v.selected??new Set();
 return {p,w,reg,grid:normalizeGrid(v.grid),events,selected,rows:rollRows(p,v.board,reg[2],events),count:events.filter(e=>selected.has(e.id)).length,
  chords:v.chordClip.events.filter(e=>e.startTick<w.end&&e.startTick+e.durationTick>w.start)};
}
/** The roll toolbar alone, for updating it in place when the selection changes. */
export function renderRollToolbar(v){const m=rollModel(v);return rollToolbar(v,m.grid,m.reg,m.w.bars,m.count);}
/** The roll status line alone (position, pointer readout, grid, selection and notices). */
export function renderRollStatus(v,m=rollModel(v)){
 const outside=outsideScale(m.p,v.melodyClip).length,extra=m.rows.filter(r=>r.extra&&r.degree!==null).length;
 const guideNote=m.chords.length?'<span class="roll-guide-key"><i aria-hidden="true"></i>Chord notes<i class="is-root" aria-hidden="true"></i>Chord root</span>':'';
 return `<div class="roll-status"><output data-comp-position>${esc(formatPosition(m.p,v.position))}</output><output class="roll-playing" data-comp-playing></output><output class="roll-hover" data-comp-hover></output><span class="roll-grid-name">Grid ${esc(gridLabelText(m.grid))}</span>${m.count?`<span>${m.count} selected</span>`:''}${guideNote}${outside?`<span>${outside} note${outside===1?'':'s'} outside the scale (rows marked ×)</span>`:''}${extra?`<span>${extra} row${extra===1?'':'s'} outside the shown range</span>`:''}</div>`;
}
function timelineSection(v){
 const m=rollModel(v),{p,w,reg,grid,events,rows,selected,count,chords}=m;
 const zoom=v.zoom??ZOOM.initial,rowHeight=v.rowHeight??ROW_HEIGHT.initial;
 const pct=t=>100*(t-w.start)/w.span,width=Math.round(DEGREE_WIDTH+w.span/PPQ*zoom);
 const guide=chordGuides(p,chords),keys=keyColors(v);
 const head=Array.from({length:w.bars},(_,i)=>`<button data-comp="seek" data-tick="${w.start+i*w.bar}" style="left:${i*100/w.bars}%;width:${100/w.bars}%" aria-label="Seek to bar ${i+1}">${i+1}</button>`).join('');
 const loopEnd=Math.min(p.loop.endTick??w.end,w.end),loop=p.loop.enabled||p.loop.endTick!==null?`<span class="roll-loop-range${p.loop.enabled?'':' is-off'}" data-comp-loop style="left:${pct(p.loop.startTick)}%;width:${pct(loopEnd)-pct(p.loop.startTick)}%" title="Loop ${esc(formatBeat(p.meter,p.loop.startTick))} to ${esc(formatBeat(p.meter,loopEnd))}${p.loop.enabled?'':' (off)'}" aria-hidden="true"></span>`:'';
 const chordBlocks=chords.map((e,i)=>{const lo=Math.max(w.start,e.startTick),hi=Math.min(w.end,e.startTick+e.durationTick),label=chordName(p,e,i),bass=chordBass(p,e);
  return `<button class="chord-block" data-comp="chord-select" data-event="${esc(e.id)}" data-start="${e.startTick}" data-end="${e.startTick+e.durationTick}" style="left:${pct(lo)}%;width:${100*(hi-lo)/w.span}%" aria-pressed="${v.selectedChord===e.id}" title="${esc(label)}${bass?` · bass ${esc(bass.text)}`:''} · ${quarter(e.durationTick)} beats · drag to move, drag the right edge to resize" aria-label="${esc(label)}${bass?`, bass degree ${esc(bass.text)}`:''}, ${esc(formatPosition(p,e.startTick))}, ${quarter(e.durationTick)} beats"><b class="chord-block-type">${esc(label)}</b><small>${bass?`<span class="chord-block-bass">bass ${rootMarkup(bass)}</span> · `:''}${quarter(e.durationTick)} beats</small><span class="chord-block-grip" data-comp-resize="" aria-hidden="true"></span></button>`;}).join('');
 const body=rows.map((row,index)=>{
  const rowKey=guide.key(row.coordinate),[a,b]=row.coordinate,label=degreeText(row),guides=guide.chords.filter(c=>c.keys.has(rowKey)).map(c=>{
   const lo=Math.max(w.start,c.event.startTick),hi=Math.min(w.end,c.event.startTick+c.event.durationTick);
   return `<span class="roll-guide${c.root===rowKey?' is-root':''}${v.selectedChord===c.event.id?' is-selected':''}" style="left:${pct(lo)}%;width:${100*(hi-lo)/w.span}%" aria-hidden="true"></span>`;
  }).join('');
  const notes=events.filter(e=>e.startTick<w.end&&e.startTick+e.durationTick>w.start&&e.tones.some(t=>t.coordinate[0]===a&&t.coordinate[1]===b));
  const cls=`roll-row${row.degree===0?' is-degree0':''}${row.degree===null?' is-outside':''}${row.extra?' is-extra':''}`;
  const where=row.degree===null?'outside the scale':row.extra?'outside the shown range':'';
  const chip=keys?.get(`${a},${b}`);
  return `<div class="${cls}"><button class="roll-degree${chip?' has-key':''}" data-comp="row-hear" data-a="${a}" data-b="${b}" tabindex="-1"${chip?` style="--key:${chip}"`:''} title="${row.cents.toFixed(1)} cents · ${row.hz.toFixed(2)} Hz${where?` · ${where}`:''} · click to hear">${degreeMarkup(row)}<small>${Math.round(row.cents)}¢</small></button><div class="roll-row-grid" data-a="${a}" data-b="${b}" data-row="${index}"><button class="roll-surface" data-a="${a}" data-b="${b}" aria-label="Add degree ${label} at the playhead" ></button>${guides}${notes.map(e=>{
   const lo=Math.max(w.start,e.startTick),hi=Math.min(w.end,e.startTick+e.durationTick),on=selected.has(e.id),len=lengthName(e.durationTick);
   return `<button class="roll-note${on?' is-selected':''}" data-comp="note-select" data-event="${esc(e.id)}" data-start="${e.startTick}" data-end="${e.startTick+e.durationTick}" data-a="${a}" data-b="${b}" style="left:${pct(lo)}%;width:${100*(hi-lo)/w.span}%;--vel:${(e.velocity/127).toFixed(3)}" aria-pressed="${on}" aria-label="Degree ${label}, ${esc(formatPosition(p,e.startTick))}, ${esc(len)}, velocity ${e.velocity}" title="Degree ${label} · ${esc(formatBeat(p.meter,e.startTick))} · ${esc(len)} · velocity ${e.velocity}"><span class="roll-note-edge" data-comp-resize="start" aria-hidden="true"></span><span class="roll-note-label" aria-hidden="true">${label}</span><span class="roll-note-grip" data-comp-resize="" aria-hidden="true">▏</span></button>`;
  }).join('')}</div></div>`;
 }).join('');
 return `<section class="composition-timeline is-tool-${v.tool==='select'?'select':'draw'}" aria-label="Chord and melody sequencer">${rollToolbar(v,grid,reg,w.bars,count)}
 <div class="roll-scroll"><div class="roll-canvas" data-comp-roll data-start="${w.start}" data-span="${w.span}" style="--bar-width:${100/w.bars}%;--row-h:${rowHeight}px;width:${width}px"><div class="roll-ruler"><span>Bar</span><div class="roll-ruler-track" data-comp-ruler title="Click to move the playhead · drag to set the loop">${loop}${rulerSvg(p,w,zoom)}${head}</div></div><div class="roll-chord-lane"><b>Chords</b><div>${chordBlocks||'<span class="roll-empty">Add a collected chord below</span>'}</div></div><div class="roll-rows" data-comp-rows>${body}${gridSvg(p,grid,w,zoom)}</div>${v.velocityLane?velocityLane(events,pct,selected):''}${rootLane(v,w,chords,pct)}<div class="roll-playhead" data-comp-playhead aria-hidden="true"><i></i></div></div></div>
 ${rootPicker(v)}
 ${renderRollStatus(v,m)}</section>`;
}
const lengthOptions=current=>[...new Set([...LENGTH_CHOICES,...(current===null?[]:[current])])].sort((a,b)=>a-b).map(t=>option(t,lengthName(t),current??'')).join('');
function noteList(v){
 const p=v.project,events=v.melodyClip.events;
 return `<details class="composition-note-list"><summary>Notes as a list</summary><div class="comp-table-scroll"><table class="note-list"><thead><tr><th>Start</th><th>Degree</th><th>Cents</th><th>Length (ticks)</th><th>Velocity</th><th></th></tr></thead><tbody>${events.map(e=>{const t=e.tones[0],d=degreeOf(p.context,t.coordinate),r=resolveTone(p.context,t.coordinate);return `<tr><td>${esc(formatPosition(p,e.startTick))}</td><td>${d?d.degree:'<em>outside scale</em>'}</td><td>${r.cents.toFixed(1)}</td><td><input type="number" data-comp-field="noteLength" data-event="${esc(e.id)}" min="1" value="${e.durationTick}"></td><td><input type="number" data-comp-field="noteVelocity" data-event="${esc(e.id)}" min="1" max="127" value="${e.velocity}"></td><td>${btn('note-delete','Delete',false,`data-event="${esc(e.id)}"`)}</td></tr>`;}).join('')}</tbody></table></div></details>`;
}
// The selected chord's buttons, as Play suggests them, and whether each was chosen.
function chordButtonsMarkup(v){
 const b=v.chordButtons;
 if(!b)return '';
 const missing=b.keys.filter(k=>k.key===undefined).length;
 return `<p class="comp-chord-buttons">Buttons ${b.keys.filter(k=>k.key!==undefined).map(k=>`<b>${k.key}</b>${k.chosen?' <small>chosen</small>':''}`).join(' · ')||'none'}${b.keys.length-missing>1?` · ${b.reach} hex steps across`:''}</p>${missing?`<p class="viewnote">No key on the saved layout plays ${missing===1?'one of its notes':`${missing} of its notes`}.</p>`:''}`;
}
function boardNote(v){
 const chosen=v.chosenButtons?` ${v.chosenButtons} pitch${v.chosenButtons===1?' uses a chosen button':'es use chosen buttons'}. ${btn('buttons-reset','Reset all buttons')}`:'';
 if(v.chooseButtons)return `<p class="viewnote comp-choose-note">Choose buttons: select notes or a chord, then press an outlined button to use it for that pitch throughout the piece.${chosen}</p>`;
 return `<p class="viewnote">Saved composition layout · lit buttons are the fingering Play suggests · hold keys to play, as on Play; Shift sustains.${chosen}</p>`;
}
export function renderSelectionPanel(v){
 const p=v.project,clip=v.chordClip,events=[...clip.events].sort((a,b)=>a.startTick-b.startTick),sel=events.find(e=>e.id===v.selectedChord),idx=sel?events.indexOf(sel):-1;
 const notes=v.melodyClip.events.filter(e=>v.selected?.has(e.id));
 const add=`<details class="composition-add" ${events.length?'':'open'}><summary>Add a collected chord</summary><div class="chord-add"><label>Chord <select data-comp-field="collection">${v.collection.length?v.collection.map((it,i)=>`<option value="${i}" ${v.collectionIndex===i?'selected':''} ${it.compatible?'':'disabled'}>${esc(it.label)}${it.compatible?'':' (other tuning)'}</option>`).join(''):'<option>Collect chords in Discover to add them here</option>'}</select></label><label>Length <select data-comp-field="addLength">${[1,2,4,8].map(n=>option(n,`${n} quarter notes`,v.addLength)).join('')}</select></label>${btn('chord-add','Add to end',!v.collection.some(i=>i.compatible))}${btn('chord-add-focus',v.focused?`Add focused chord ${esc(v.focused.label)}`:'Add focused chord',!v.focused?.compatible)}</div></details>`;
 const selBass=sel?chordBass(p,sel):null;
 const chord=sel?`<h4>${esc(chordName(p,sel,idx))}${selBass?` <small class="chord-bass-note">bass ${rootMarkup(selBass)}</small>`:''}</h4>${chordButtonsMarkup(v)}<div class="chord-editor">${btn('chord-hear','Hear chord',false,`data-event="${esc(sel.id)}"`)}${btn('chord-invert','Raise lowest note',false,`data-event="${esc(sel.id)}"`)}<label>Length <input type="number" data-comp-field="chordLength" data-event="${esc(sel.id)}" min="0.25" step="0.25" value="${quarter(sel.durationTick)}"> beats</label></div><details><summary>Arrange chord</summary><div class="chord-editor">${btn('chord-earlier','Move earlier',idx===0,`data-event="${esc(sel.id)}"`)}${btn('chord-later','Move later',idx===events.length-1,`data-event="${esc(sel.id)}"`)}${btn('chord-duplicate','Duplicate after',false,`data-event="${esc(sel.id)}"`)}${btn('chord-rest','Rest after (1 quarter)',false,`data-event="${esc(sel.id)}"`)}${btn('chord-delete','Delete',false,`data-event="${esc(sel.id)}"`)}</div></details>`:'<p class="viewnote">Select a chord in the timeline to see its buttons.</p>';
 let selectedNote='';
 if(notes.length===1){
  const note=notes[0],tone=note.tones[0],d=degreeOf(p.context,tone.coordinate),id=esc(note.id);
  selectedNote=`<div class="comp-note-inspector"><h4>Selected note</h4><p class="comp-note-where">${d?`Degree ${d.degree}${d.register?`<sup>${d.register>0?'+':''}${d.register}</sup>`:''}`:'Outside the scale'} · ${resolveTone(p.context,tone.coordinate).cents.toFixed(1)}¢ · starts ${esc(formatBeat(p.meter,note.startTick))} · ${esc(lengthName(note.durationTick))}</p><label>Length <select data-comp-field="noteLength" data-event="${id}">${lengthOptions(note.durationTick)}</select></label><label>Velocity <input type="number" data-comp-field="noteVelocity" data-event="${id}" min="1" max="127" value="${note.velocity}"></label>${btn('note-hear','Hear',false,`data-event="${id}"`)}${btn('note-delete','Delete note',false,`data-event="${id}"`)}</div>`;
 }else if(notes.length>1){
  const same=k=>notes.every(e=>e[k]===notes[0][k])?notes[0][k]:null,length=same('durationTick'),velocity=same('velocity');
  const start=Math.min(...notes.map(e=>e.startTick)),end=Math.max(...notes.map(e=>e.startTick+e.durationTick));
  selectedNote=`<div class="comp-note-inspector"><h4>${notes.length} notes selected</h4><p class="comp-note-where">${esc(formatBeat(p.meter,start))} to ${esc(formatBeat(p.meter,end))}</p><label>Length <select data-comp-field="selLength">${length===null?'<option value="" selected>Mixed</option>':''}${lengthOptions(length)}</select></label><label>Velocity <input type="number" data-comp-field="selVelocity" min="1" max="127" value="${velocity??''}" placeholder="mixed"></label>${btn('sel-hear','Hear')}${btn('sel-delete','Delete notes')}</div>`;
 }
 const automatic=v.chooseButtons&&v.selectionChosen?`<p class="comp-buttons-auto">${v.selectionChosen} selected pitch${v.selectionChosen===1?' uses a chosen button':'es use chosen buttons'}. ${btn('buttons-auto','Use automatic buttons')}</p>`:'';
 return `<section class="comp-panel comp-selection"><h3>Selected chord</h3>${chord}${selectedNote}${automatic}${add}</section>`;
}
export function renderComposition(v){
 const p=v.project;
 if(p&&v.mode==='game'&&v.game)return `${transportBar(v)}${projectBar(v)}${renderGame(v.game,{project:p,board:v.board})}${v.message?`<p class="composition-message" role="status">${esc(v.message)}</p>`:''}<input type="file" data-comp-file accept=".json,application/json" hidden>`;
 return `${p?transportBar(v):'<h2>Compose and play</h2>'}${projectBar(v)}${p?`${timelineSection(v)}<div class="composition-lower"><section class="comp-panel comp-board-panel"><div class="comp-panel-heading"><h3>HexBoard</h3><div class="tabs comp-board-show" role="group" aria-label="Show on the board">${[['chords','Chords'],['melody','Melody'],['both','Both']].map(([value,label])=>btn('board-show',label,false,`data-value="${value}" aria-pressed="${(v.boardShow??'both')===value}"`)).join('')}</div><label>Degrees <input type="checkbox" data-comp-field="boardLabels" ${v.boardLabels?'checked':''}></label><label>Follow lights <input type="checkbox" data-comp-field="follow" ${v.follow?'checked':''}></label><label title="Show every button of the selected notes and press one to use it for that pitch throughout the piece">Choose buttons <input type="checkbox" data-comp-field="chooseButtons" ${v.chooseButtons?'checked':''}></label><span>${p.context.scale.n}-note scale</span></div>${v.board?boardMarkup(p,v.board,v.selectedKeys,v.boardLabels,v.noteKeys??[],v.optionKeys??[]):`<p class="viewnote">${esc(v.boardReason)}</p>`}${boardNote(v)}</section>${renderSelectionPanel(v)}</div>${noteList(v)}`:''}${v.message?`<p class="composition-message" role="status">${esc(v.message)}</p>`:''}<input type="file" data-comp-file accept=".json,application/json" hidden>`;
}
