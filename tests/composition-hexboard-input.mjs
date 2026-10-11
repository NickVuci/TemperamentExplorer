// HexBoard and piano roll together: held keys light their rows and name the chord, selected notes light
// their keys, step entry (melody and chords), and recording with a count-in, through the same press
// path as the physical HexBoard (pressKey / releaseKey on the board player).
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCompositionWorkspace} from '../dist/composition-ui.mjs';
import {createProject,addEvent,PPQ} from '../dist/composition-project.mjs';
import {captureContext,resolveTone} from '../dist/composition-context.mjs';
import {compositionBoard} from '../dist/composition-board.mjs';
import {CLICK,START_DELAY_SECONDS} from '../dist/composition-transport.mjs';

const demo=JSON.parse(await readFile(new URL('./fixtures/composition/phase0-demo.json',import.meta.url),'utf8'));
const fixture=createProject({context:captureContext(demo.musicalContext.state,220),layout:demo.layout,tempo:120});
const {board}=compositionBoard(fixture);
const keyOf=m=>board.keys.find(k=>!k.command&&k.enabled&&k.m[0]===m[0]&&k.m[1]===m[1]).index;
const deg=d=>fixture.context.scale.degrees[d].coordinate;
const cents=m=>resolveTone(fixture.context,m).cents;

// ---- fake DOM: key nodes for the board player, a few roll rows, readouts ----
const classes=()=>{const set=new Set();return {set,add:c=>set.add(c),remove:c=>set.delete(c),toggle:(c,on)=>{if(on??!set.has(c))set.add(c);else set.delete(c);return set.has(c);},contains:c=>set.has(c)};};
const keyNodes=new Map();
const keyNode=id=>{if(!keyNodes.has(id))keyNodes.set(id,{dataset:{compKey:String(id)},classList:classes(),closest:()=>null,focus(){}});return keyNodes.get(id);};
const rowFor=m=>({dataset:{a:String(m[0]),b:String(m[1])},parentElement:{classList:classes()}});
const rows=[deg(0),deg(2),deg(4),[deg(0)[0]+1,deg(0)[1]]].map(rowFor);
const appended=[];
const roll={dataset:{span:String(8*3840),start:'0'},querySelector:()=>null,appendChild:el=>appended.push(el),offsetWidth:0,parentElement:null};
const playingOut={textContent:''},position={textContent:''},recordButton={classList:classes()};
const handlers=new Map();
const doc={activeElement:null,body:{},documentElement:{},
  querySelector:s=>{const k=/^\[data-comp-key="(\d+)"\]$/.exec(s);if(k)return keyNode(Number(k[1]));return s==='[data-comp-roll]'?roll:s==='[data-comp-playing]'?playingOut:s==='[data-comp-position]'?position:s==='[data-comp="record"]'?recordButton:null;},
  querySelectorAll:s=>s==='.roll-row-grid'?rows:[],
  createElement:()=>({className:'',style:{setProperty(k,v){this[k]=v;}},classList:classes(),setAttribute(){},remove(){this.removed=true;},parentElement:null}),
  addEventListener:(k,f)=>handlers.set(k,f),removeEventListener:k=>handlers.delete(k)};
for(const row of rows)row.appendChild=el=>{el.parentElement=row;};
// Audio: a clock whose output timestamp lags it by 20 ms, recorded voices, and live voices.
const clock={audioSeconds:100,state:'running',clockRevision:1,performanceMs:50000,anchor:{audioSeconds:99.98,performanceMs:50000}};
const scheduled=[],previews=[];
const audio={prepare:async()=>{},getClockSnapshot:()=>({...clock,performanceMs:clock.anchor.performanceMs,anchor:{...clock.anchor}}),cancelGroup(){},
  scheduleVoices:(list,opts)=>{scheduled.push(...list.map(v=>({...v,settings:opts.settings})));return list.map(v=>({voiceId:v.voiceId,cancel(){}}));},
  previewChord:c=>previews.push(c),startVoice:()=>()=>{},outputLatency:()=>null};
let appState=fixture.context.state,matched=[];
const host={innerHTML:'',querySelector:()=>null},notices=[];
const ws=createCompositionWorkspace({document:doc,audio,getState:()=>appState,getLayout:()=>fixture.layout,getTonic:()=>220,getMaterial:()=>[],getHost:()=>host,notify:m=>notices.push(m),raf:null,timer:{set:()=>1,clear(){}},
  // The directory names three-note chords on degree 0 as "4:5:6", rooted on the played degree-0 note.
  matchPlayed:coords=>{matched.push(coords);return coords.length===3?{status:'chord',source:'directory',label:'4:5:6',rootNote:coords.find(m=>m[1]===deg(0)[1])?.join(',')??null}:null;}});
const press=(comp,rest={})=>ws.click({dataset:{comp,...rest},closest(s){return s==='[data-comp]'?this:null;}});
const change=(compField,value,extra={})=>ws.change({dataset:{compField},value:String(value),...extra});
const P=()=>ws.getProject(),mel=()=>P().clips[1].events,chords=()=>P().clips[0].events;
const down=(m,t)=>ws.pressKey(keyOf(m),t),up=(m,t)=>ws.releaseKey(keyOf(m),t);
ws.restore(fixture);ws.refresh();

// ---- held keys light their rows and name the chord ----
assert.match(host.innerHTML,/class="roll-degree has-key"[^>]*style="--key:#[0-9a-f]{6}"/i,'row labels carry their HexBoard key colour');
assert.equal(down(deg(0)),true,'a HexBoard key plays the on-screen key');
assert.ok(rows[0].parentElement.classList.contains('is-held'),'its row lights');
assert.ok(!rows[1].parentElement.classList.contains('is-held'));
assert.equal(playingOut.textContent,'Playing 0');
down(deg(2));down(deg(4));
assert.deepEqual(rows.slice(0,3).map(r=>r.parentElement.classList.contains('is-held')),[true,true,true]);
assert.equal(playingOut.textContent,'Playing 0 · 2 · 4 → 0 - 4:5:6','the held chord is named from the directory, root - chord');
up(deg(0));up(deg(2));up(deg(4));
assert.ok(rows.every(r=>!r.parentElement.classList.contains('is-held')),'rows go dark on release');
assert.equal(playingOut.textContent,'');
appState={...appState,mode:(appState.mode+1)%appState.n};matched=[];
down(deg(0));down(deg(2));down(deg(4));assert.equal(playingOut.textContent,'Playing 0 · 2 · 4','a different app setup does not name chords');assert.equal(matched.length,0);
up(deg(0));up(deg(2));up(deg(4));appState=fixture.context.state;

// ---- step entry: melody ----
press('step-input');assert.match(host.innerHTML,/data-comp="step-input"[^>]*aria-pressed="true"/);
assert.ok(appended.some(el=>el.className==='roll-step-cursor'),'the step cursor is drawn');
down(deg(0),1);up(deg(0),2);
let n=mel().filter(e=>e.startTick===0);
assert.equal(n.length,1,'releasing a key enters it at the cursor');assert.deepEqual(n[0].tones[0].coordinate,deg(0));assert.equal(n[0].durationTick,240,'one grid step long');
await Promise.resolve();assert.equal(ws.transport.position(),240,'the cursor moves on a step');
down(deg(4));down(deg(2));up(deg(4));
assert.equal(mel().filter(e=>e.startTick===240).length,0,'keys held together wait for the last to come up');
up(deg(2));await Promise.resolve();
assert.deepEqual(mel().filter(e=>e.startTick===240).map(e=>e.tones[0].coordinate).sort((a,b)=>cents(a)-cents(b)),[deg(2),deg(4)].sort((a,b)=>cents(a)-cents(b)),'then enter together at one step');
assert.equal(ws.transport.position(),480);
press('step-rest');await Promise.resolve();assert.equal(ws.transport.position(),720,'Rest moves on without a note');
press('step-tie');assert.match(notices.at(-1),/Tie lengthens/,'Tie needs the cursor at the end of the last entry');
press('step-back');await Promise.resolve();
assert.equal(mel().filter(e=>e.startTick===240).length,0,'Back removes the last entry');assert.equal(ws.transport.position(),240,'and returns the cursor to it');
down(deg(2));up(deg(2));await Promise.resolve();press('step-tie');await Promise.resolve();
assert.equal(mel().find(e=>e.startTick===240).durationTick,480,'Tie lengthens it by a step');assert.equal(ws.transport.position(),720);
change('gridDivision',480);change('gridFeel','triplet');
await ws.transport.seek(960);down(deg(4));up(deg(4));await Promise.resolve();
assert.equal(mel().find(e=>e.startTick===960)?.durationTick,320,'on a triplet grid, steps are triplets');assert.equal(ws.transport.position(),1280);
change('gridFeel','straight');change('gridDivision',240);
// Escape or blur cancels keys being held for step entry.
down(deg(0));ws.keydown({key:'Escape',code:'Escape',target:doc.body,preventDefault(){}},true);
const count=mel().length;up(deg(0));assert.equal(mel().length,count,'a cancelled group enters nothing');
ws.stop();

// ---- step entry: chords ----
press('input-target',{value:'chords'});change('chordStep',2);
await ws.transport.seek(3840*2);
down(deg(0));up(deg(0));assert.match(notices.at(-1),/two or more keys/,'one key is not a chord');assert.equal(chords().length,0);
down(deg(4));down(deg(0));down(deg(2));up(deg(0));up(deg(2));up(deg(4));await Promise.resolve();
let c=chords()[0];
assert.ok(c,'a held chord enters the chord lane');
assert.deepEqual(c.tones.map(t=>t.coordinate),[deg(0),deg(2),deg(4)].sort((a,b)=>cents(a)-cents(b)),'its tones, lowest first');
assert.deepEqual([c.startTick,c.durationTick],[3840*2,2*PPQ],'at the cursor, for the chord length');
assert.equal(c.source.label,'4:5:6');assert.equal(c.tones[c.source.rootTone].coordinate.join(),deg(0).join(),'rooted as the directory roots it');
assert.match(host.innerHTML,/class="chord-block-type">0 - 4:5:6</,'written root - chord in the lane');
assert.equal(ws.transport.position(),3840*2+2*PPQ);
press('step-input');press('input-target',{value:'melody'});

// ---- recording ----
change('click','on',{checked:true});
await ws.transport.seek(0);
press('record');assert.match(host.innerHTML,/data-comp="record"[^>]*aria-pressed="true"/);assert.match(host.innerHTML,/data-comp-field="countIn"/);
press('play');await new Promise(r=>setImmediate(r));
assert.equal(ws.transport.state,'playing');
const downbeat=100+START_DELAY_SECONDS+2;   // one bar of 4/4 at 120 BPM counts in
assert.equal(scheduled.filter(v=>v.voiceId.startsWith('count#')).length,4,'Play counts in a bar');
clock.audioSeconds=downbeat-.1;ws.transport.pump();
assert.ok(scheduled.some(v=>v.settings===CLICK.settings&&v.voiceId.startsWith('click#0')),'and the metronome clicks with the piece');
// The output timestamp says what is heard: at performance time T the listener hears anchor + (T - anchorPerf).
const heardAt=seconds=>({perf:50000+(seconds-99.98)*1000});
const before=mel().length;
down(deg(4),heardAt(downbeat-1).perf);up(deg(4),heardAt(downbeat-.8).perf);   // mid count-in: dropped
down(deg(2),heardAt(downbeat-.05).perf);                     // just before the downbeat: starts on it, ends where released
up(deg(2),heardAt(downbeat+.25).perf);
down(deg(0),heardAt(downbeat+.5).perf);up(deg(0),heardAt(downbeat+.75).perf);
down(deg(4),heardAt(downbeat+1).perf);                      // still held when playback stops
clock.audioSeconds=downbeat+1.25;clock.anchor={audioSeconds:downbeat+1.23,performanceMs:heardAt(downbeat+1.23).perf};
press('stop');
up(deg(4));                                                  // let go of the key held through Stop
const take=mel().slice(before).length?mel().filter(e=>e.source?.kind==='recorded'):[];
assert.deepEqual(take.map(e=>[e.startTick,e.durationTick,e.tones[0].coordinate.join()]).sort((a,b)=>a[0]-b[0]),
  [[0,480,deg(2).join()],[960,480,deg(0).join()],[1920,Math.round(.23*1920),deg(4).join()]],'the take keeps played timing, count-in presses dropped, held notes closed at Stop');
assert.ok(take.every(e=>P().clips[1].events.includes(e)));
ws.refresh();assert.equal([...host.innerHTML.matchAll(/class="roll-note is-selected"/g)].length,3,'the take is selected, ready to quantize');
assert.match(notices.at(-1),/Recorded 3 notes/);
press('undo');assert.equal(mel().filter(e=>e.source?.kind==='recorded').length,0,'the take is one undo step');
// Recording chords: keys pressed together form one chord, snapped to the grid.
press('input-target',{value:'chords'});const chordCount=chords().length;
press('play');await new Promise(r=>setImmediate(r));
const at=s=>50000+(s-99.98)*1000;
clock.anchor={audioSeconds:99.98,performanceMs:50000};
const t0=clock.audioSeconds+START_DELAY_SECONDS+2+.52;    // a little after beat 2 of bar 1
down(deg(0),at(t0));down(deg(2),at(t0+.03));down(deg(4),at(t0+.05));
up(deg(0),at(t0+.9));up(deg(2),at(t0+.95));up(deg(4),at(t0+1));
clock.audioSeconds=t0+1.1;clock.anchor={audioSeconds:t0+1.08,performanceMs:at(t0+1.08)};
press('pause');
const rec=chords().filter(e=>e.source?.kind==='recorded');
assert.equal(chords().length,chordCount+1,'three keys pressed together record one chord');
assert.deepEqual([rec[0].startTick,rec[0].durationTick],[960,1920],'snapped to the grid while Snap is on');
assert.equal(rec[0].source.label,'4:5:6');assert.ok(rec[0].source.played.startTick>960,'the played timing is kept in its source');
press('record');press('input-target',{value:'melody'});
// ---- Play auditions cannot enter notes or enable recording ----
press('mode-game');press('step-input');press('record');const frozen=JSON.stringify(P());down(deg(0));up(deg(0));assert.equal(JSON.stringify(P()),frozen,'Play auditions enter nothing');
assert.doesNotMatch(host.innerHTML,/data-comp="record"|data-comp="step-input"/,'editing controls stay in Compose');
press('mode-compose');
ws.dispose();
console.log('composition-hexboard-input: ok');
