import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCompositionWorkspace} from '../dist/composition-ui.mjs';
import {compositionBoard,compactFingerings,compositionDeviceSnapshot} from '../dist/composition-board.mjs';
import {resolveTone} from '../dist/composition-context.mjs';
import {PPQ,createProject,addEvent} from '../dist/composition-project.mjs';
import {captureContext} from '../dist/composition-context.mjs';
import {rollWindow,STEP_TICKS,chordRoot,chordGuides} from '../dist/composition-view.mjs';
import {makeState} from '../dist/engine.mjs';
import {activeCues} from '../dist/composition-cues.mjs';
import {createHarmonicCatalogueWorkspace} from '../dist/harmonic-catalogue-ui.mjs';
const demo=JSON.parse(await readFile(new URL('./fixtures/composition/phase0-demo.json',import.meta.url),'utf8'));
let fixture=createProject({context:captureContext(demo.musicalContext.state,220),layout:demo.layout});
for(const e of demo.chordEvents)fixture=addEvent(fixture,fixture.clips[0].id,{id:e.id,startTick:e.startTick,durationTick:e.durationTick,velocity:e.velocity,tones:e.tones});
for(const e of demo.melodyEvents)fixture=addEvent(fixture,fixture.clips[1].id,{id:e.id,startTick:e.startTick,durationTick:e.durationTick,velocity:e.velocity,tones:[{toneId:e.toneId,coordinate:e.coordinate}]});
const handlers=new Map(),host={innerHTML:'',querySelector:()=>null},previews=[],scheduled=[];
const clock={audioSeconds:10,state:'running',clockRevision:1};
const doc={activeElement:null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(k,f)=>handlers.set(k,f),removeEventListener:k=>handlers.delete(k)};
const audio={prepare:async()=>{},getClockSnapshot:()=>clock,cancelGroup(){},scheduleVoices:list=>scheduled.push(...list),previewChord:(c,s)=>previews.push({c,s})};
const ws=createCompositionWorkspace({document:doc,audio,getState:()=>fixture.context.state,getLayout:()=>fixture.layout,getTonic:()=>fixture.context.tonicHz,getMaterial:()=>[],getHost:()=>host,raf:null,timer:{set:()=>0,clear(){}}});
const press=(comp,rest={})=>ws.click({dataset:{comp,...rest},closest(){return this;}});
const change=(compField,value,rest={})=>ws.change({dataset:{compField,...rest},value:String(value)});
ws.restore(fixture);ws.refresh();
assert.match(host.innerHTML,/Compose and practise/);
assert.match(host.innerHTML,/data-comp-roll/);
assert.match(host.innerHTML,/composition-lower/);
// The roll's range defaults to the pitches the composition's HexBoard layout can play.
{
  const rowsShown=()=>[...host.innerHTML.matchAll(/<div class="roll-row-grid" data-a="(-?\d+)" data-b="(-?\d+)"/g)].map(m=>`${m[1]},${m[2]}`);
  const {board:layoutBoard}=compositionBoard(ws.getProject()),ctx=ws.getProject().context;
  const playable=new Set(layoutBoard.keys.filter(k=>!k.command&&k.enabled&&ctx.scale.degrees.some(d=>d.coordinate[1]===k.m[1])).map(k=>k.m.join(',')));
  assert.match(host.innerHTML,/<option value="board" selected>HexBoard layout<\/option>/,'HexBoard layout is the default range');
  assert.deepEqual(new Set(rowsShown()),playable,'one row for every scale pitch on the layout, and no others');
  assert.equal(rowsShown().length,playable.size,'each pitch once');
  const cents=rowsShown().map(id=>resolveTone(ctx,id.split(',').map(Number)).cents);assert.ok(cents.every((c,i)=>!i||c<cents[i-1]),'highest first');
  assert.ok(playable.size>ctx.scale.degrees.length,'the layout spans more than one period');
  change('registers','home');assert.equal(rowsShown().length,ctx.scale.degrees.length,'the other ranges are still available');
  change('registers','board');assert.equal(rowsShown().length,playable.size);
}
const p=ws.getProject(),chord=p.clips[0].events[0];
press('chord-select',{event:chord.id});
const {board}=compositionBoard(p),fingers=compactFingerings(p,chord,board);
for(const f of fingers)assert.deepEqual(f.keys.map(i=>board.keys[i].m),chord.tones.map(t=>t.coordinate),'Every fingering preserves exact pitches and registers.');
press('loop-selected');assert.equal(ws.getProject().loop.startTick,chord.startTick);assert.equal(ws.getProject().loop.endTick,chord.startTick+chord.durationTick);
change('bars',12);assert.equal(ws.getProject().clips[0].lengthTick,12*PPQ*4);assert.equal(rollWindow({project:ws.getProject()}).end,12*PPQ*4);press('undo');
press('loop-off');assert.equal(ws.getProject().loop.enabled,false);
const low=chord.tones.reduce((a,b)=>resolveTone(p.context,a.coordinate).cents<=resolveTone(p.context,b.coordinate).cents?a:b);
press('chord-invert',{event:chord.id});
const inverted=ws.getProject().clips[0].events.find(e=>e.id===chord.id);
for(const t of chord.tones)assert.deepEqual(inverted.tones.find(x=>x.toneId===t.toneId).coordinate,t.toneId===low.toneId?[t.coordinate[0]+1,t.coordinate[1]]:t.coordinate);
assert.equal(inverted.startTick,chord.startTick);assert.equal(inverted.durationTick,chord.durationTick);
press('undo');assert.deepEqual(ws.getProject().clips[0].events.find(e=>e.id===chord.id).tones,chord.tones);
// Practice speed changes scheduling, never persisted musical tempo or context.
const before=JSON.stringify(ws.getProject());change('practiceSpeed',50);press('mode-practice');
await ws.transport.play();assert.equal(JSON.stringify(ws.getProject()),before);
assert.ok(Math.abs((scheduled[0].releaseAudioSeconds-scheduled[0].onsetAudioSeconds)-chord.durationTick/PPQ*60/(p.tempo*.5))<1e-8,'50% practice speed doubles audible note duration.');ws.transport.pause();
press('practice-start');await Promise.resolve();await Promise.resolve();assert.ok(previews.length);assert.deepEqual(previews.at(-1).s,undefined);
press('mode-compose');
const note=ws.getProject().clips[1].events[0],style={};
const row={dataset:{a:'1',b:'2'},getBoundingClientRect:()=>({width:800})};
const node={dataset:{event:note.id},classList:{add(){}},style,closest:s=>s==='.roll-row-grid'?row:s==='[data-comp-roll]'?{dataset:{span:String(PPQ*16)}}:null};
const target={closest:s=>s==='.roll-note'?node:null};
const point={closest:()=>row};doc.elementFromPoint=()=>point;
handlers.get('pointerdown')({button:0,target,pointerId:1,clientX:100,clientY:100});
handlers.get('pointermove')({pointerId:1,clientX:150,clientY:110,preventDefault(){}});
handlers.get('pointerup')({pointerId:1,type:'pointerup'});
const moved=ws.getProject().clips[1].events.find(e=>e.id===note.id);
assert.equal(moved.startTick,note.startTick+PPQ);assert.deepEqual(moved.tones[0].coordinate,[1,2]);
press('undo'); // suppressed synthetic click resets at end of task
await new Promise(r=>setTimeout(r,1));press('undo');assert.equal(ws.getProject().clips[1].events.find(e=>e.id===note.id).startTick,note.startTick);
// Resize keeps the onset/pitch; cancellation never commits a half-drag.
const resizeTarget={closest:s=>s==='.roll-note'?node:s==='[data-comp-resize]'?{}:null};
handlers.get('pointerdown')({button:0,target:resizeTarget,pointerId:2,clientX:100,clientY:100});
handlers.get('pointermove')({pointerId:2,clientX:150,clientY:100,preventDefault(){}});
handlers.get('pointerup')({pointerId:2,type:'pointerup'});
assert.equal(ws.getProject().clips[1].events.find(e=>e.id===note.id).durationTick,note.durationTick+PPQ);
assert.equal(ws.getProject().clips[1].events.find(e=>e.id===note.id).startTick,note.startTick);
const unchanged=JSON.stringify(ws.getProject());
handlers.get('pointerdown')({button:0,target,pointerId:3,clientX:100,clientY:100});
handlers.get('pointermove')({pointerId:3,clientX:170,clientY:110,preventDefault(){}});
handlers.get('pointerup')({pointerId:3,type:'pointercancel'});
assert.equal(JSON.stringify(ws.getProject()),unchanged);
// Chord blocks show their type and root degree, and drag along the chord lane on the 1/16 grid.
{
  ws.refresh();
  const blockFor=e=>host.innerHTML.match(new RegExp(`<button class="chord-block"[^>]*data-event="${e.id}"[^]*?</button>`))[0];
  const c0=ws.getProject().clips[0].events[0],root=chordRoot(ws.getProject(),c0);
  assert.ok(root&&root.degree!==null,'the fixture chord root is a scale degree');
  assert.match(blockFor(c0),/class="chord-block-type">[^<]+<\/b>/,'the block names the chord');
  assert.match(blockFor(c0),new RegExp(`class="chord-block-root">root ${root.degree}`),'the block shows the root degree');
  assert.match(blockFor(c0),/data-comp-resize/,'the block has a resize grip');
  const lane={getBoundingClientRect:()=>({width:800})},span=String(PPQ*16);
  const block={dataset:{event:c0.id},classList:{add(){}},style:{},parentElement:lane,closest:s=>s==='[data-comp-roll]'?{dataset:{span}}:null};
  const drag=(target,id,dx)=>{handlers.get('pointerdown')({button:0,target,pointerId:id,clientX:100,clientY:100});handlers.get('pointermove')({pointerId:id,clientX:100+dx,clientY:140,preventDefault(){}});handlers.get('pointerup')({pointerId:id,type:'pointerup'});};
  const chordAt=()=>ws.getProject().clips[0].events.find(e=>e.id===c0.id);
  drag({closest:s=>s==='.chord-block'?block:null},10,100);
  assert.equal(chordAt().startTick,c0.startTick+2*PPQ,'dragging moves the chord in time');
  assert.equal(chordAt().durationTick,c0.durationTick);assert.deepEqual(chordAt().tones,c0.tones,'moving never changes pitches');
  await new Promise(r=>setTimeout(r,1));
  drag({closest:s=>s==='.chord-block'?block:s==='[data-comp-resize]'?{}:null},11,30);
  assert.equal(chordAt().durationTick,c0.durationTick+PPQ*0.5,'dragging the edge resizes on the sixteenth grid');
  assert.equal(chordAt().startTick,c0.startTick+2*PPQ);
  const settled=JSON.stringify(ws.getProject());
  drag({closest:s=>s==='.chord-block'?block:s==='[data-comp-resize]'?{}:null},12,-2000);
  assert.equal(chordAt().durationTick,STEP_TICKS,'a chord is at least one sixteenth long');
  await new Promise(r=>setTimeout(r,1));
  press('undo');assert.equal(JSON.stringify(ws.getProject()),settled,'each chord drag is one undoable edit');
  press('undo');press('undo');assert.equal(chordAt().startTick,c0.startTick);assert.equal(chordAt().durationTick,c0.durationTick);
  press('chord-select',{event:c0.id});assert.match(host.innerHTML+(doc.querySelector('.comp-selection')?.outerHTML??''),/chord-root-note">root /,'the selected chord heading shows its root');
}
// Melody guide: each row that sounds a note of a chord is tinted under that chord, in every register.
{
  ws.refresh();
  const pr=ws.getProject(),guide=chordGuides(pr,pr.clips[0].events),grids=[...host.innerHTML.matchAll(/<div class="roll-row-grid" data-a="(-?\d+)" data-b="(-?\d+)"[^>]*>([^]*?)<\/div><\/div>/g)];
  assert.ok(grids.length>0);let tinted=0,roots=0;
  for(const [,a,b,inner] of grids){
    const key=guide.key([Number(a),Number(b)]),expected=guide.chords.filter(c=>c.keys.has(key));
    const spans=[...inner.matchAll(/<span class="roll-guide([^"]*)"/g)].map(m=>m[1]);
    assert.equal(spans.length,expected.length,`row ${a},${b}: one guide per chord holding this note`);
    assert.equal(spans.filter(c=>c.includes('is-root')).length,expected.filter(c=>c.root===key).length,'the chord root is marked');
    tinted+=spans.length;roots+=spans.filter(c=>c.includes('is-root')).length;
  }
  assert.ok(tinted>0&&roots>0,'the fixture chords tint some rows and mark their roots');
  const first=pr.clips[0].events[0],row=grids.find(([,a,b])=>guide.key([Number(a),Number(b)])===guide.key(first.tones[0].coordinate));
  const block=host.innerHTML.match(new RegExp(`<button class="chord-block"[^>]*data-event="${first.id}"[^>]*style="([^"]*)"`))[1];
  assert.ok(row[3].includes(`style="${block}"`),'a guide spans exactly its chord’s time');
  assert.match(host.innerHTML,/class="roll-guide-key"/,'a key explains the colours');
  // Octave classes, not period classes: in a half-octave-period temperament a note one period up is not a chord tone.
  const pajara=makeState('pajara7'),half=chordGuides({context:{...pajara,basis:pajara.basis,rows:pajara.rows}},[{id:'x',tones:[{coordinate:[0,0]}]}]);
  assert.ok(half.chords[0].keys.has(half.key([2,0])),'an octave up is the same note');assert.ok(!half.chords[0].keys.has(half.key([1,0])),'a period up is not');
  assert.equal(half.chords[0].root,half.key([0,0]));
}
// The board shows chords, melody or both: a display filter over the sounding cues and the chord fingering.
{
  await new Promise(r=>setTimeout(r,1));
  const pr=ws.getProject(),tl=ws.timeline(),lit=()=>ws.deviceSnapshot().keys.filter(k=>k.lit).map(k=>k.index).sort((a,b)=>a-b);
  const ticks=[...pr.clips[1].events.map(e=>e.startTick),...pr.clips[0].events.map(e=>e.startTick)];
  const tick=ticks.find(t=>{const kinds=new Set(activeCues(tl,t).sounding.map(q=>q.trackKind));return kinds.has('chords')&&kinds.has('melody');});
  assert.ok(tick!==undefined,'the fixture has a moment where a chord and a melody note sound together');
  const cells=kind=>[...new Set(activeCues(tl,tick).sounding.filter(q=>!kind||q.trackKind===kind).flatMap(q=>q.cells))].sort((a,b)=>a-b);
  press('mode-practice');await ws.transport.seek(tick);
  assert.match(host.innerHTML,/data-comp="board-show"\s+data-value="both" aria-pressed="true"/,'both tracks are shown by default');
  assert.deepEqual(lit(),cells(null));
  press('board-show',{value:'chords'});assert.deepEqual(lit(),cells('chords'),'only the chord lights');
  assert.match(host.innerHTML,/data-comp="board-show"\s+data-value="chords" aria-pressed="true"/);
  press('board-show',{value:'melody'});assert.deepEqual(lit(),cells('melody'),'only the melody lights');
  press('board-show',{value:'nonsense'});assert.deepEqual(lit(),cells('melody'),'an unknown choice changes nothing');
  assert.equal(JSON.stringify(ws.getProject()),JSON.stringify(pr),'a display choice never edits the composition');
  // Outside playback the selected chord's fingering shows unless only the melody is shown.
  press('mode-compose');ws.transport.stop();press('chord-select',{event:pr.clips[0].events[0].id});
  assert.deepEqual(lit(),[],'melody only: no chord fingering');
  press('board-show',{value:'chords'});const fingering=lit();assert.ok(fingering.length>=2,'chords: the fingering lights');
  press('board-show',{value:'both'});assert.deepEqual(lit(),fingering);
}
const snapshot=compositionDeviceSnapshot(p,board,[fingers[0]?.keys[0]??65]);assert.equal(snapshot.keys.length,board.keys.length);
assert.ok(snapshot.keys.some(k=>k.lit));assert.deepEqual(ws.voiceSettings(),undefined);
// Single selection preserves timeline nodes, allowing a native double-click to delete.
await new Promise(r=>setTimeout(r,1));
const current=ws.getProject().clips[1].events[0],selectionPanel={outerHTML:''};
let timelineWrites=host.innerHTML;
doc.querySelector=s=>s==='.comp-selection'?selectionPanel:null;
press('note-select',{event:current.id});
assert.equal(host.innerHTML,timelineWrites,'Selection updates only the inspector, leaving the clicked note attached.');
assert.match(selectionPanel.outerHTML,/Selected note/);
const noteNode={dataset:{event:current.id},closest:()=>null};
const dbl={target:{closest:s=>s==='.roll-note'?noteNode:null},prevented:false,preventDefault(){this.prevented=true;}};
handlers.get('dblclick')(dbl);
assert.equal(dbl.prevented,true);assert.ok(!ws.getProject().clips[1].events.some(e=>e.id===current.id));
press('undo');assert.ok(ws.getProject().clips[1].events.some(e=>e.id===current.id),'Double-click deletion is undoable.');
press('mode-practice');handlers.get('dblclick')(dbl);assert.ok(ws.getProject().clips[1].events.some(e=>e.id===current.id),'Practice mode does not delete notes.');
ws.dispose();assert.equal(handlers.size,0);

// Root lane: each chord's root degree under the roll; pick a root, then a directory harmony built on it.
{
  let appState=fixture.context.state;
  const catalogue=createHarmonicCatalogueWorkspace({getState:()=>appState,getPlayState:()=>appState,getSettings:()=>({limit:15,primeLimit:null,tol:10})});
  catalogue.setEnabled(true);
  {const start=Date.now();while(!['complete','incomplete'].includes(catalogue.model().status)){assert.ok(Date.now()-start<20000);assert.notEqual(catalogue.model().status,'error',catalogue.model().error);await new Promise(r=>setTimeout(r,5));}}
  const handlers2=new Map(),host2={innerHTML:'',querySelector:()=>null},doc2={activeElement:null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(k,f)=>handlers2.set(k,f),removeEventListener:k=>handlers2.delete(k)};
  const ws2=createCompositionWorkspace({document:doc2,audio,getState:()=>appState,getLayout:()=>fixture.layout,getTonic:()=>220,getMaterial:()=>[],getHost:()=>host2,raf:null,timer:{set:()=>0,clear(){}},
    getBassEntries:degree=>catalogue.bassEntriesFor({scale:'play',degree})});
  const press2=(comp,rest={})=>ws2.click({dataset:{comp,...rest},closest(){return this;}});
  ws2.restore(fixture);ws2.refresh();
  const pr=ws2.getProject(),chords=pr.clips[0].events;
  const lane=host2.innerHTML.match(/<div class="roll-root-lane">[^]*?<\/div><\/div>/)[0];
  for(const e of chords)assert.match(lane,new RegExp(`data-event="${e.id}"[^>]*>${chordRoot(pr,e).degree}`),'the lane shows each chord’s root degree');
  assert.doesNotMatch(host2.innerHTML,/class="root-picker"/,'the picker is closed until asked for');
  // An empty spot in the lane opens the picker at that time, on the sixteenth grid.
  const span=rollWindow({project:pr}).end,surface={parentElement:{getBoundingClientRect:()=>({left:0,width:800})},closest:s=>s==='[data-comp-roll]'?{dataset:{span:String(span)}}:null};
  handlers2.get('click')({target:{closest:s=>s==='.roll-root-surface'?surface:null},clientX:130});
  const tick=Math.floor(130/800*span/STEP_TICKS)*STEP_TICKS;
  assert.match(host2.innerHTML,/Add a harmony at /);assert.match(host2.innerHTML,/class="root-pick-marker"/);
  assert.match(host2.innerHTML,/Choose a root, then a harmony/);
  press2('root-degree',{degree:'0'});
  const entries=catalogue.bassEntriesFor({scale:'play',degree:0}),offered=[...host2.innerHTML.matchAll(/data-comp="root-harmony"\s+data-index="(\d+)"><b>([^<]*)<\/b><small>([^<]*)</g)];
  assert.ok(offered.length>0,'harmonies built on degree 0 are offered');
  for(const [,index,label,role] of offered.slice(0,10)){const e=entries[Number(index)];assert.equal(label,e.label);assert.equal(role,e.role);assert.equal(e.degrees[0],0,'each is built on the chosen root');}
  const [,chosen]=offered[0],entry=entries[Number(chosen)],before=chords.length;
  press2('root-harmony',{index:chosen});
  const added=ws2.getProject().clips[0].events.find(e=>e.source?.kind==='directory'&&e.startTick===tick);
  assert.ok(added,'the harmony is added at the picked time');assert.equal(ws2.getProject().clips[0].events.length,before+1);
  assert.deepEqual(added.tones.map(t=>t.coordinate),entry.coords,'with the directory voicing, root in the bass');
  assert.equal(added.source.label,entry.label);assert.equal(chordRoot(ws2.getProject(),added).degree,0,'and its root lane shows degree 0');
  assert.doesNotMatch(host2.innerHTML,/class="root-picker"/,'the picker closes');assert.match(host2.innerHTML,new RegExp(`class="root-block"[^>]*data-event="${added.id}"[^>]*aria-pressed="true"`));
  press2('undo');assert.equal(ws2.getProject().clips[0].events.length,before,'adding is undoable');
  // Choosing a chord's root opens the picker on it; a new harmony replaces it in place.
  const target=ws2.getProject().clips[0].events[1],targetRoot=chordRoot(ws2.getProject(),target).degree;
  press2('root-block',{event:target.id});
  assert.match(host2.innerHTML,/Change the harmony at /);assert.match(host2.innerHTML,new RegExp(`data-comp="root-degree"\\s+data-degree="${targetRoot}" aria-pressed="true"`),'its root is preselected');
  const replacements=catalogue.bassEntriesFor({scale:'play',degree:targetRoot}),pickIndex=[...host2.innerHTML.matchAll(/data-comp="root-harmony"\s+data-index="(\d+)"/g)].at(-1)[1];
  press2('root-harmony',{index:pickIndex});
  const after=ws2.getProject().clips[0].events,replaced=after.find(e=>e.source?.kind==='directory');
  assert.equal(after.length,before,'replacing keeps the number of chords');assert.ok(!after.some(e=>e.id===target.id));
  assert.equal(replaced.startTick,target.startTick);assert.equal(replaced.durationTick,target.durationTick,'and its time and length');
  assert.deepEqual(replaced.tones.map(t=>t.coordinate),replacements[Number(pickIndex)].coords);
  press2('undo');assert.ok(ws2.getProject().clips[0].events.some(e=>e.id===target.id),'replacing is undoable');
  // The directory follows the app; when the app is set differently the picker says so instead of guessing.
  press2('root-block',{event:target.id});appState={...appState,mode:(appState.mode+1)%appState.n};ws2.refresh();
  assert.match(host2.innerHTML,/Harmonies come from the chord directory/);assert.doesNotMatch(host2.innerHTML,/data-comp="root-harmony"/);
  press2('root-cancel');assert.doesNotMatch(host2.innerHTML,/class="root-picker"/);
  ws2.dispose();
}
console.log('Composition sequencer: aligned timeline, exact fingerings, inversion, loops, frozen tempo, stepping, dragging and cleanup passed.');
