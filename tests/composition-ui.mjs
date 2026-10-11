import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCompositionWorkspace} from '../dist/composition-ui.mjs';
import {parseProject,PPQ} from '../dist/composition-project.mjs';
import {PRACTICE_FORMAT} from '../dist/composition-cues.mjs';
import {STEP_TICKS,gridRows,formatPosition,renderComposition} from '../dist/composition-view.mjs';

const corpus=JSON.parse(await readFile(new URL('./fixtures/composition/phase0-corpus.json',import.meta.url),'utf8'));
const demo=JSON.parse(await readFile(new URL('./fixtures/composition/phase0-demo.json',import.meta.url),'utf8'));
const meantone=structuredClone(corpus.fixtures[0].state);        // 7 notes, mode 4
const edo31=structuredClone(corpus.fixtures[1].state);

// ---- fakes ----
const clock={audioSeconds:50,state:'running',clockRevision:1};
const audioLog={previews:[],cancels:0,scheduled:[]};
const audio={
  prepare:async()=>{},getClockSnapshot:()=>({...clock,performanceMs:0}),
  scheduleVoices:(l)=>{audioLog.scheduled.push(...l);return [];},cancelGroup:()=>{audioLog.cancels++;},
  previewChord:(c,s)=>{audioLog.previews.push([c,s]);return Promise.resolve(true);},
};
const host={innerHTML:'',writes:0};
Object.defineProperty(host,'html',{get(){return this.innerHTML;}});
const hostProxy=new Proxy(host,{set(t,k,v){if(k==='innerHTML')t.writes++;t[k]=v;return true;},get(t,k){return k==='querySelector'?()=>null:t[k];}});
const fields={meterNum:{value:'4'},meterDen:{value:'4'}};
const position={textContent:''},cuesNode={textContent:''},blocks=[];
const fileInput={clicks:0,click(){this.clicks++;}};
const doc={activeElement:null,
  querySelector:s=>s==='[data-comp-position]'?position:s==='[data-comp-cues]'?cuesNode:s==='[data-comp-file]'?fileInput:s.startsWith('[data-comp-field=')?fields[s.slice(17,-1)]:null,
  querySelectorAll:s=>s==='.chord-block'?blocks:[]};
let appState=structuredClone(meantone),tonic=220;
const items=[
  {kind:'chord',state:structuredClone(meantone),coords:[[0,0],[-2,4],[0,1]],label:'major <triad>',exact:true,harmonicSelection:{sourceChord:'4:5:6'}},
  {kind:'chord',state:structuredClone(edo31),coords:[[0,0],[0,1]],label:'31 fifth'},
  {kind:'scale',state:structuredClone(meantone),coords:[[0,0],[-1,2]],label:'a scale'},
  {kind:'chord',state:structuredClone(meantone),coords:[[1,-1],[-1,3],[1,0]],label:'IV'},
];
const downloads=[],notices=[],loaded=[],focusCalls=[];let rafCallback=null,focusedChord=null;
const ws=createCompositionWorkspace({document:doc,audio,getState:()=>appState,getLayout:()=>structuredClone(demo.layout),getTonic:()=>tonic,
  getMaterial:()=>items,getFocusedChord:()=>focusedChord,onChordFocus:coordinates=>focusCalls.push(coordinates),loadState:s=>loaded.push(s),getHost:()=>hostProxy,notify:m=>notices.push(m),download:(n,t,type)=>downloads.push({n,t,type}),
  raf:cb=>{rafCallback=cb;return 1;},timer:{set:()=>1,clear(){}}});
const el=(dataset={},extra={})=>({dataset,closest(sel){return sel==='[data-comp]'&&dataset.comp!==undefined?this:null;},...extra});
const press=(comp,dataset={})=>ws.click(el({comp,...dataset}));
const set=(field,value,extra={})=>ws.change(el({compField:field},{value:String(value),...extra}));
const P=()=>ws.getProject();
const chordClip=()=>P().clips[0],melodyClip=()=>P().clips[1];

// ---- no project: only the start screen ----
assert.equal(ws.open,false);
assert.match(ws.render(),/New composition from the current Play setup/);
assert.doesNotMatch(ws.render(),/data-comp="play"/,'no transport without a project');
assert.equal(press('save'),true,'actions without a project are harmless');
assert.equal(P(),null);

// ---- new project captures the Play setup actually in use ----
appState={...meantone,n:12,mode:3};                      // Create scale differs from Discover's 7-note scale
press('new');
assert.ok(ws.open);assert.equal(P().context.scale.n,12);assert.equal(P().context.scale.mode,3);
assert.equal(P().context.tonicHz,220);assert.deepEqual(P().layout,demo.layout);
assert.match(P().name,/Meantone composition/);assert.ok(host.innerHTML.includes('data-comp="play"'));
appState=structuredClone(meantone);press('new');
assert.equal(P().context.scale.n,7);

// ---- chord progression from the collection ----
const html=()=>host.innerHTML;
assert.match(html(),/major &lt;triad&gt;/,'labels are escaped');
assert.doesNotMatch(html(),/<triad>/);
assert.match(html(),/31 fifth \(other tuning\)/,'other-tuning chords are listed but disabled');
assert.doesNotMatch(html(),/a scale<\/option>/,'scales are not chords');
set('collection',0);set('addLength',4);press('chord-add');
assert.equal(chordClip().events.length,1);
let c1=chordClip().events[0];
assert.deepEqual(c1.tones.map(t=>t.coordinate),[[0,0],[-2,4],[0,1]],'exact coordinates copied');
assert.equal(c1.durationTick,4*PPQ);assert.equal(c1.startTick,0);
assert.deepEqual(c1.source,{kind:'collection',label:'major <triad>',rootTone:0,exact:true,harmonicSelection:{sourceChord:'4:5:6'}});
items[0].coords[0][0]=99;assert.deepEqual(chordClip().events[0].tones[0].coordinate,[0,0],'later edits to the collection do not change the composition');
items[0].coords[0][0]=0;
const before=JSON.stringify(P());
set('collection',1);press('chord-add');                    // the 31-EDO chord: refused, nothing inserted
assert.equal(JSON.stringify(P()),before,'incompatible chord is rejected without partial insertion');
assert.ok(notices.at(-1).match(/different tuning/));assert.match(html(),/different tuning/);
set('collection',2);set('addLength',2);press('chord-add');   // 'IV' (index 2 among chords)
assert.equal(chordClip().events.length,2);assert.equal(chordClip().events[1].startTick,4*PPQ);assert.equal(chordClip().events[1].durationTick,2*PPQ);
const [a,b]=chordClip().events;
assert.equal(ws.getProject().revision>0,true);

// select, lengthen (later chords move), swap, duplicate, rest, delete
press('chord-select',{event:a.id});assert.match(html(),/chord-editor/);
set('chordLength',6,{dataset:{compField:'chordLength',event:a.id}});
assert.equal(chordClip().events[0].durationTick,6*PPQ);assert.equal(chordClip().events[1].startTick,6*PPQ,'a longer chord pushes the next one later');
set('chordLength',3,{dataset:{compField:'chordLength',event:a.id}});
assert.equal(chordClip().events[1].startTick,6*PPQ,'shortening leaves a rest');
press('chord-later',{event:a.id});
assert.equal(chordClip().events[0].id,b.id);assert.equal(chordClip().events[1].id,a.id);
press('chord-duplicate',{event:a.id});
assert.equal(chordClip().events.length,3);
const dup=chordClip().events.at(-1);
assert.deepEqual(dup.tones.map(t=>t.coordinate),a.tones.map(t=>t.coordinate));assert.notEqual(dup.id,a.id);
const lenBefore=chordClip().events.length;press('chord-rest',{event:a.id});
assert.equal(chordClip().events.length,lenBefore);
press('chord-hear',{event:a.id});
assert.deepEqual(audioLog.previews.at(-1)[1],undefined,'audition uses central engine settings');
assert.ok(Math.abs(audioLog.previews.at(-1)[0][1]-(-2*1200+4*696.6512))<1e-9);
press('chord-delete',{event:dup.id});assert.equal(chordClip().events.length,2);

// undo/redo everything back and forth
let depth=0;while(/data-comp="undo" >/.test(html())||!/data-comp="undo" disabled/.test(html())){press('undo');if(++depth>50)break;}
assert.equal(chordClip().events.length,0,'undo reaches the start');
assert.match(html(),/data-comp="undo" disabled/);
while(!/data-comp="redo" disabled/.test(html())){press('redo');if(++depth>200)break;}
assert.equal(chordClip().events.length,2,'redo restores the progression');

// ---- melody grid ----
const rows=gridRows(P(),[1,0]);
assert.equal(rows.length,14);assert.ok(rows.every((r,i,x)=>!i||x[i-1].cents>=r.cents),'highest pitch first');
const degree2=P().context.scale.degrees[2].coordinate;
set('noteDuration',STEP_TICKS*2);
press('note-cell',{tick:STEP_TICKS*4,a:degree2[0],b:degree2[1]});
assert.equal(melodyClip().events.length,1);
const n1=melodyClip().events[0];
assert.equal(n1.startTick,STEP_TICKS*4);assert.equal(n1.durationTick,STEP_TICKS*2);assert.deepEqual(n1.tones[0].coordinate,degree2);assert.equal(n1.velocity,90);
assert.equal(audioLog.previews.at(-1)[1],undefined);
{
  const span=Number(html().match(/data-comp-roll data-start="0" data-span="(\d+)"/)[1]);
  const drawn=html().match(new RegExp(`<button class="roll-note is-selected" data-comp="note-select" data-event="${n1.id}"[^>]*data-a="${degree2[0]}" data-b="${degree2[1]}" style="left:([0-9.]+)%;width:([0-9.]+)%`));
  assert.ok(drawn,'the new note is drawn on its row and selected');
  assert.ok(Math.abs(Number(drawn[1])-100*STEP_TICKS*4/span)<1e-9&&Math.abs(Number(drawn[2])-100*STEP_TICKS*2/span)<1e-9,'at its time, two steps long');
}
press('note-cell',{tick:STEP_TICKS*4,a:degree2[0],b:degree2[1]});
assert.equal(melodyClip().events.length,0,'clicking a filled cell removes the note');
press('note-cell',{tick:0,a:0,b:0});
const note=melodyClip().events[0];
set('noteVelocity',64,{dataset:{compField:'noteVelocity',event:note.id}});assert.equal(melodyClip().events[0].velocity,64);
const keep=JSON.stringify(P());
set('noteVelocity',0,{dataset:{compField:'noteVelocity',event:note.id}});
assert.equal(JSON.stringify(P()),keep,'an invalid velocity changes nothing');assert.match(html(),/velocity/);
set('noteLength',480,{dataset:{compField:'noteLength',event:note.id}});assert.equal(melodyClip().events[0].durationTick,480);
// a note past the clip end grows it by whole bars; paging moves along
const farTick=P().meter.numerator*PPQ*10;
press('note-cell',{tick:farTick-(farTick%STEP_TICKS),a:0,b:0});
assert.ok(melodyClip().lengthTick>=farTick);
assert.doesNotMatch(html(),/Page \d+ of|page-next/);
set('bars',16);assert.equal(melodyClip().lengthTick,16*P().meter.numerator*PPQ);
const longProject=JSON.stringify(P());set('bars',1);assert.equal(JSON.stringify(P()),longProject);assert.match(html(),/Move or delete notes/);
press('undo');assert.ok(melodyClip().lengthTick<16*P().meter.numerator*PPQ);
// outside-scale notes stay visible and are never dropped
press('note-cell',{tick:STEP_TICKS,a:30,b:50});
assert.match(html(),/outside scale/);
press('note-delete',{event:melodyClip().events.find(e=>e.tones[0].coordinate[0]===30).id});
assert.ok(!melodyClip().events.some(e=>e.tones[0].coordinate[0]===30));

// ---- transport ----
set('tempo',120);assert.equal(P().tempo,120);set('tempo',999);assert.equal(P().tempo,120,'out-of-range tempo is refused');
fields.meterNum.value='3';fields.meterDen.value='4';set('meterNum',3);assert.deepEqual(P().meter,{numerator:3,denominator:4});
fields.meterNum.value='4';set('meterNum',4);
assert.doesNotMatch(html(),/data-comp-field="wave"/);
set('loop','on',{checked:true});assert.equal(P().loop.enabled,true);set('loop','off',{checked:false});assert.equal(P().loop.enabled,false);
await ws.click(el({comp:'play'}));await new Promise(r=>setImmediate(r));
assert.equal(ws.transport.state,'playing');
assert.match(html(),/data-comp="pause"/);assert.match(html(),/data-comp-field="tempo"[^>]*disabled/,'tempo is locked while playing');
// playhead painting is in place: no workspace rebuild
blocks.push({dataset:{start:'0',end:'1920'},classList:{toggled:[],toggle(n,on){this.toggled.push([n,on]);}}});
const writes=host.writes;clock.audioSeconds+=1;ws.paint();
assert.equal(host.writes,writes,'playhead updates never rebuild the workspace');
assert.match(position.textContent,/bar 1 · beat/);assert.deepEqual(blocks[0].classList.toggled.at(-1),['is-playing',true]);
assert.match(cuesNode.textContent,/^Now:/);
assert.ok(rafCallback,'a frame loop is running while playing');
// an edit pauses playback; Stop and leaving Create release it
press('note-cell',{tick:STEP_TICKS*8,a:0,b:0});assert.equal(ws.transport.state,'playing','an edit keeps playing');
await ws.click(el({comp:'play'}));await new Promise(r=>setImmediate(r));assert.equal(ws.transport.state,'playing');
ws.pause();assert.equal(ws.transport.state,'paused');
await ws.click(el({comp:'play'}));await new Promise(r=>setImmediate(r));
ws.stop();assert.equal(ws.transport.state,'stopped');
await ws.click(el({comp:'play'}));await new Promise(r=>setImmediate(r));
press('stop');assert.equal(ws.transport.state,'stopped');
clock.state='suspended';await ws.click(el({comp:'play'}));await new Promise(r=>setImmediate(r));
assert.equal(ws.transport.state,'stopped','audio that cannot run leaves the transport stopped');
assert.match(notices.at(-1),/Audio could not start/);clock.state='running';

// Space controls only Compose, leaves editing and shortcuts alone, and ignores repeat.
const space=(overrides={})=>({key:' ',code:'Space',target:{closest:()=>null},prevented:false,preventDefault(){this.prevented=true;},...overrides});
let key=space();assert.equal(ws.keydown(key,false),false);assert.equal(key.prevented,false);
for(const overrides of [{ctrlKey:true},{metaKey:true},{altKey:true},{defaultPrevented:true},{target:{isContentEditable:true}},{target:{closest:()=>({tagName:'INPUT'})}}]){
 key=space(overrides);assert.equal(ws.keydown(key,true),false);assert.equal(key.prevented,false);
}
key=space();assert.equal(ws.keydown(key,true),true);assert.equal(key.prevented,true);await new Promise(r=>setImmediate(r));
assert.equal(ws.transport.state,'playing');
key=space({repeat:true});assert.equal(ws.keydown(key,true),true);assert.equal(key.prevented,true);assert.equal(ws.transport.state,'playing');
key=space();assert.equal(ws.keydown(key,true),true);assert.equal(ws.transport.state,'paused');
const pausedPosition=ws.transport.position();key=space();ws.keydown(key,true);await new Promise(r=>setImmediate(r));assert.equal(ws.transport.state,'playing');assert.ok(ws.transport.position()>=pausedPosition);
ws.stop();
assert.doesNotMatch(html(),/Your tuning, your timeline/);

// ---- save, open, close ----
press('save');
const saved=downloads.at(-1);
assert.match(saved.n,/\.composition\.json$/);assert.equal(saved.type,'application/json');
assert.deepEqual(parseProject(saved.t),P(),'saved file reopens to the same project');
const snapshot=JSON.stringify(P());
press('close');assert.equal(ws.open,false);
press('open');assert.equal(fileInput.clicks>0,true,'Open triggers the file picker');
ws.change(el({compFile:''},{files:[{size:saved.t.length,text:async()=>saved.t}],value:'x'}));
await new Promise(r=>setImmediate(r));
assert.equal(JSON.stringify(P()),snapshot,'opened project equals the saved one');
assert.match(html(),/data-comp="undo" disabled/,'opening starts a fresh history');
// A bad file leaves the open project untouched and explains why.
ws.change(el({compFile:''},{files:[{size:3,text:async()=>'{no'}],value:'x'}));await new Promise(r=>setImmediate(r));
assert.equal(JSON.stringify(P()),snapshot);assert.match(notices.at(-1),/not valid JSON/);
ws.change(el({compFile:''},{files:[{size:3,text:async()=>JSON.stringify({...JSON.parse(snapshot),format:'temperament-lab-composition-v9'})}],value:'x'}));await new Promise(r=>setImmediate(r));
assert.match(notices.at(-1),/newer app/);assert.equal(JSON.stringify(P()),snapshot);
ws.change(el({compFile:''},{files:[{size:9e9,text:async()=>''}],value:'x'}));assert.match(notices.at(-1),/larger than/);

// ---- the app drifting away from the composition is explicit, never silent ----
assert.doesNotMatch(html(),/different tuning or scale/);
appState={...meantone,n:19};ws.refresh();
assert.match(html(),/different tuning or scale/);
press('load-context');assert.deepEqual(loaded.at(-1),P().context.state,'loading the setup goes through the app loader');
assert.equal(P().context.scale.n,7,'the composition itself is unchanged');
appState=structuredClone(meantone);

// ---- practice targets export ----
set('matchMode','any-degree');press('export-targets');
const targets=JSON.parse(downloads.at(-1).t);
assert.equal(targets.format,PRACTICE_FORMAT);assert.equal(targets.matchMode,'any-degree');
assert.equal(targets.targets.length,ws.timeline().length);assert.ok(targets.targets.length>6);
set('matchMode','bogus');press('export-targets');assert.equal(JSON.parse(downloads.at(-1).t).matchMode,'any-degree','unknown modes are ignored');

// ---- Discover's focused chord ----
const before2=chordClip().events.length;press('chord-add-focus');assert.equal(chordClip().events.length,before2);assert.match(notices.at(-1),/Select a chord in Discover first/);
focusedChord={...structuredClone(items[0]),label:'focused 4:5:6'};press('chord-add-focus');
assert.equal(chordClip().events.length,before2+1,'the focused chord is added to the end');const focusedEvent=chordClip().events.at(-1);
assert.deepEqual(focusedEvent.tones.map(t=>t.coordinate),[[0,0],[-2,4],[0,1]]);assert.match(html(),/Add focused chord focused 4:5:6/);
press('chord-select',{event:focusedEvent.id});assert.deepEqual(focusCalls.at(-1),[[0,0],[-2,4],[0,1]],'selecting a composition chord focuses it in Discover');

// ---- whole-app session hooks ----
const out=ws.serialize();assert.equal(out,P());
ws.restore(structuredClone(out));assert.deepEqual(P(),out);assert.equal(ws.transport.state,'stopped');
assert.throws(()=>ws.restore({format:'nope'}),/format/);assert.deepEqual(P(),out,'a failed restore keeps the open project');
ws.restore(null);assert.equal(ws.open,false);assert.equal(ws.serialize(),null);key=space();assert.equal(ws.keydown(key,true),false);assert.equal(key.prevented,false);

// ---- view helpers ----
assert.equal(formatPosition({tempo:100,meter:{numerator:4,denominator:4}},3840*2+960),'bar 3 · beat 2 · 0:05.4');
assert.match(renderComposition({project:null,appSummary:'<b>',collection:[],message:'<i>'}),/&lt;b&gt;/);

console.log('composition-ui: ok');
