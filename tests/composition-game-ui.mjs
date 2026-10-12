// Rhythm game in Compose: setup, the backing mix, a scored run through the HexBoard press path,
// results and best scores, Learn mode waiting, Space and Escape, calibration and the LED cues.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCompositionWorkspace} from '../src/composition/composition-ui.mjs';
import {createProject,addEvent,PPQ} from '../src/composition/composition-project.mjs';
import {captureContext} from '../src/composition/composition-context.mjs';
import {compositionBoard} from '../src/composition/composition-board.mjs';
import {START_DELAY_SECONDS,CLICK} from '../src/composition/composition-transport.mjs';
import {normalizeSettings} from '../src/composition/composition-game-ui.mjs';

const demo=JSON.parse(await readFile(new URL('./fixtures/composition/phase0-demo.json',import.meta.url),'utf8'));
let fixture=createProject({context:captureContext(demo.musicalContext.state,220),layout:demo.layout,tempo:120});
for(const e of demo.chordEvents)fixture=addEvent(fixture,fixture.clips[0].id,{id:e.id,startTick:e.startTick,durationTick:e.durationTick,velocity:e.velocity,tones:e.tones});
for(const e of demo.melodyEvents)fixture=addEvent(fixture,fixture.clips[1].id,{id:e.id,startTick:e.startTick,durationTick:e.durationTick,velocity:e.velocity,tones:[{toneId:e.toneId,coordinate:e.coordinate}]});
const {board}=compositionBoard(fixture);
const keyFor=m=>board.keys.find(k=>!k.command&&k.enabled&&k.m[0]===m[0]&&k.m[1]===m[1])?.index;

const classes=()=>{const set=new Set();return {add:c=>set.add(c),remove:c=>set.delete(c),toggle:(c,on)=>{if(on??!set.has(c))set.add(c);else set.delete(c);},contains:c=>set.has(c)};};
const keyNodes=new Map(),keyNode=id=>{if(!keyNodes.has(id))keyNodes.set(id,{dataset:{compKey:String(id)},classList:classes(),closest:()=>null,focus(){}});return keyNodes.get(id);};
const overlay={textContent:'',classList:classes()},score={textContent:''};
const handlers=new Map();
const doc={activeElement:null,body:{},documentElement:{},
  querySelector:s=>{const k=/^\[data-comp-key="(\d+)"\]$/.exec(s);if(k)return keyNode(Number(k[1]));return s==='[data-game-overlay]'?overlay:s==='[data-game-score]'?score:null;},
  querySelectorAll:()=>[],createElement:()=>({style:{},classList:classes(),setAttribute(){}}),
  addEventListener:(k,f)=>handlers.set(k,f),removeEventListener:k=>handlers.delete(k)};
// The output timestamp: what is heard at performance time T is anchor.audioSeconds + (T - anchor.performanceMs).
const clock={audioSeconds:100,state:'running',clockRevision:1,performanceMs:0,anchor:{audioSeconds:100,performanceMs:0}};
const perfAt=heard=>(heard-clock.anchor.audioSeconds)*1000+clock.anchor.performanceMs;
const scheduled=[];
const audio={prepare:async()=>{},getClockSnapshot:()=>({...clock,performanceMs:clock.anchor.performanceMs,anchor:{...clock.anchor}}),cancelGroup(){},
  scheduleVoices:(list,opts)=>{scheduled.push(...list.map(v=>({...v,group:opts.groupId,settings:opts.settings})));return list.map(v=>({voiceId:v.voiceId,cancel(){}}));},
  previewChord(){},startVoice:()=>()=>{}};
const store=new Map(),storage={get:k=>store.has(k)?structuredClone(store.get(k)):null,set:(k,v)=>store.set(k,structuredClone(v))};
const frames=[];const runFrames=(n=1)=>{for(let i=0;i<n;i++){const f=frames.shift();if(f)f();}};
const host={innerHTML:'',querySelector:()=>null},notices=[];
const ws=createCompositionWorkspace({document:doc,audio,getState:()=>fixture.context.state,getLayout:()=>fixture.layout,getTonic:()=>220,getMaterial:()=>[],getHost:()=>host,notify:m=>notices.push(m),
  raf:cb=>{frames.push(cb);return frames.length;},timer:{set:()=>1,clear(){}},gameStorage:storage});
const press=(comp,rest={})=>ws.click({dataset:{comp,...rest},closest(s){return s==='[data-comp]'?this:null;}});
const change=(compField,value,extra={})=>ws.change({dataset:{compField},value:String(value),...extra});
const flush=()=>new Promise(r=>setImmediate(r));
ws.restore(fixture);ws.refresh();

// ---- setup ----
press('mode-game');
assert.match(host.innerHTML,/data-comp="mode-game"[^>]*aria-pressed="true"/);
assert.match(host.innerHTML,/class="game is-setup"/);assert.match(host.innerHTML,/data-comp="game-start"/);
assert.match(host.innerHTML,/class="composition-board hex-board game-board"/,'the board is drawn with approach rings');
assert.match(host.innerHTML,/data-game-ring="\d+"/);
const previewKeys=ws.deviceSnapshot().keys.filter(k=>k.lit&&!k.command);
assert.ok(previewKeys.length&&previewKeys.every(k=>keyNode(k.index).classList.contains('game-now')),'setup previews highlight suggested screen keys');
assert.match(host.innerHTML,/data-comp-field="gameLights"/,'Note hints offer the board lighting choices');
change('gameLights','off');assert.ok(!ws.deviceSnapshot().keys.some(k=>k.lit&&!k.command),'Note hints can hide setup suggestions');
assert.match(host.innerHTML,/<option value="off" selected>/);assert.equal(store.get('temperament-lab-game-settings').lights,'off','the hint choice is remembered');
change('gameLights','dark');
assert.doesNotMatch(host.innerHTML,/data-comp-roll/,'the roll gives way to the game');
assert.deepEqual(normalizeSettings({speed:73,part:'drums',countIn:9}),{...normalizeSettings({}),speed:73,countIn:2},'custom integer speeds are preserved and other settings are checked');
change('gameSection','bars');change('gameFrom',1);change('gameTo',2);change('gameGuide','off');change('gameCountIn',0);change('gameClick','',{checked:false});
assert.match(host.innerHTML,/data-comp-field="gameFrom"[^>]*value="1"/);
assert.deepEqual(store.get('temperament-lab-game-settings').toBar,2,'settings are remembered');

// ---- a scored run: your part muted, every target pressed on time except one ----
press('game-start');await flush();
const game=ws.game,engine=game.engine;
assert.equal(game.phase,'running');assert.equal(ws.transport.state,'playing');
assert.match(host.innerHTML,/data-game-highway/);assert.match(host.innerHTML,/class="game-note"/);
const melodyTargets=engine.targets;
assert.ok(melodyTargets.length>=4&&melodyTargets.every(t=>t.track==='melody'&&t.tick<2*3840),'the chart is the melody of bars 1-2');
clock.audioSeconds+=.3;ws.transport.pump();
assert.ok(!scheduled.some(v=>v.voiceId.startsWith(fixture.clips[1].events[0].id)),'your part is muted in the backing');
assert.ok(scheduled.some(v=>fixture.clips[0].events.some(e=>v.voiceId.startsWith(e.id))),'the chords play');
const downbeat=100+START_DELAY_SECONDS,tps=120*PPQ/60;
const heardTick=t=>downbeat+t/tps;
const skip=melodyTargets[2];
for(const t of melodyTargets){
  if(t===skip)continue;
  const key=keyFor(t.coordinate),at=perfAt(heardTick(t.tick)+.012);   // 12 ms late: Perfect
  assert.ok(key!==undefined);ws.pressKey(key,at);ws.releaseKey(key,at+50);
}
// A wrong note between notes.
const wrongKey=board.keys.find(k=>!k.command&&k.enabled&&!melodyTargets.some(t=>t.coordinate.join()===k.m.join())).index;
ws.pressKey(wrongKey,perfAt(heardTick(melodyTargets[1].tick)+.06));ws.releaseKey(wrongKey);
// Time runs past the section: the skipped note is missed and the run ends.
clock.audioSeconds=downbeat+2*3840/tps+.5;clock.anchor={audioSeconds:clock.audioSeconds-.02,performanceMs:perfAt(clock.audioSeconds-.02)};
ws.transport.pump();runFrames(3);
assert.equal(game.phase,'results');assert.equal(ws.transport.state,'stopped');
assert.match(host.innerHTML,/class="game is-results"/);
const counts=Object.fromEntries([...host.innerHTML.matchAll(/<div class="is-(\w+)"><dt>[^<]*<\/dt><dd>(\d+)<\/dd>/g)].map(m=>[m[1],Number(m[2])]));
assert.deepEqual(counts,{perfect:melodyTargets.length-1,great:0,good:0,miss:1},'every pressed note is Perfect and the skipped one is missed');
assert.match(host.innerHTML,/<dt>Wrong notes<\/dt><dd>1<\/dd>/);
assert.match(host.innerHTML,/Wait on bars \d–\d/,'the bar with the miss is offered in Wait');
const best=Object.values(store.get('temperament-lab-game-best'));
assert.equal(best.length,1);assert.ok(best[0].score>0,'the score is kept as the best at these settings');
assert.match(host.innerHTML,/First score at these settings/);
press('game-practise',{from:'1',to:'2'});assert.equal(game.phase,'setup');assert.equal(game.settings.mode,'learn');assert.equal(game.settings.section,'bars');
change('gameMode','play');

// ---- Again; Escape ends a run ----
press('game-again');await flush();assert.equal(game.phase,'running');
ws.stop();assert.equal(game.phase,'setup','Escape (the app stop) ends the run');assert.match(host.innerHTML,/class="game is-setup"/);

// ---- Wait: the notes in order at the player's pace, with no backing ----
change('gameMode','learn');
assert.match(host.innerHTML,/data-comp-field="gameCountIn" disabled/,'Timed-only settings are off in Wait');
assert.match(host.innerHTML,/data-comp-field="gameSpeed"[^>]*disabled/);
press('game-start');await flush();
const [first,second]=ws.game.engine.targets;
assert.equal(ws.transport.state,'stopped','Wait plays no backing');
ws.game.step();assert.match(overlay.textContent,/^Play /,'it asks for the first notes at once');
const wrong=board.keys.find(k=>!k.command&&k.enabled&&![first,second].some(t=>t.coordinate.join()===k.m.join())).index;
ws.pressKey(wrong,0);ws.releaseKey(wrong);assert.equal(first.result,null,'a wrong key changes nothing');
ws.pressKey(keyFor(first.coordinate),0);await flush();
assert.equal(first.result,'ok','the right key counts');assert.equal(ws.game.view().waitingTick,second.tick,'and the next notes are due at once');
ws.releaseKey(keyFor(first.coordinate));
press('game-quit');assert.equal(ws.game.phase,'setup');assert.equal(ws.transport.state,'stopped');

// ---- Space starts and pauses ----
change('gameMode','play');change('gameCountIn',1);
const space={key:' ',code:'Space',target:doc.body,repeat:false,preventDefault(){this.prevented=true;}};
assert.equal(ws.keydown({...space},true),true);await flush();assert.equal(ws.game.phase,'running','Space starts');
const counting=scheduled.filter(v=>v.voiceId.startsWith('count#'));assert.ok(counting.length>=4,'with its count-in');
assert.equal(ws.keydown({...space},true),true);assert.equal(ws.transport.state,'paused','Space pauses');
assert.match(overlay.textContent,/Paused/);
assert.equal(ws.keydown({key:'Delete',code:'Delete',target:doc.body,preventDefault(){}},true),false,'editing keys do nothing in the game');
press('game-quit');

// ---- the physical HexBoard: the due note's key lit, the rest dark ----
change('gameCountIn',0);
clock.audioSeconds=110;clock.anchor={audioSeconds:110,performanceMs:perfAt(110)};
press('game-start');await flush();
const g=ws.game,next=g.engine.targets[0];
clock.audioSeconds=clock.anchor.audioSeconds=110+START_DELAY_SECONDS;
ws.game.step();   // a frame on the downbeat: the first note is due
const snap=ws.deviceSnapshot(),lit=snap.keys.filter(k=>k.lit&&!k.command).map(k=>k.index);
assert.ok(lit.length>=1&&lit.some(i=>board.keys[i].m.join()===next.coordinate.join()),'the next note’s key is lit');
const plain=snap.keys.find(k=>!k.command&&k.enabled&&!k.lit);
assert.equal(plain.layoutColor,'#000000','other keys are dark');
press('game-quit');

// ---- calibration: taps 30 ms after each click set a +30 ms offset ----
press('game-calibrate');await flush();
assert.match(host.innerHTML,/Calibrate timing/);
const clicks=scheduled.filter(v=>v.group==='calibration').sort((a,b)=>a.onsetAudioSeconds-b.onsetAudioSeconds);
assert.equal(clicks.length,12);assert.ok(clicks.every(c=>c.settings===CLICK.settings));
clock.anchor={audioSeconds:200,performanceMs:9000};
clicks.forEach((c,k)=>{if(k<4)return;const key=board.keys.find(x=>!x.command&&x.enabled).index;ws.pressKey(key,perfAt(c.onsetAudioSeconds+.03));ws.releaseKey(key);});
press('game-calibrate-done');
assert.equal(store.get('temperament-lab-game-offset'),30,'the median lag is stored');
assert.match(host.innerHTML,/Timing offset: <b>\+30 ms<\/b>/);
press('game-offset-clear');assert.equal(store.get('temperament-lab-game-offset'),null);

// ---- leaving Game mode puts the roll back ----
press('mode-compose');assert.match(host.innerHTML,/data-comp-roll/);assert.equal(ws.game.phase,'setup');
ws.dispose();
console.log('composition-game-ui: ok');
