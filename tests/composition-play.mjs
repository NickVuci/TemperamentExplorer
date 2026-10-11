// Compose Play controller with its real transport: audio boundaries, Wait input, run lifecycle,
// previews, preflight, repetition and training. Animation frames never drive these tests.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {captureContext} from '../dist/composition-context.mjs';
import {createProject,addEvent,setFingering,PPQ} from '../dist/composition-project.mjs';
import {compositionBoard,compositionDeviceSnapshot} from '../dist/composition-board.mjs';
import {buildChart} from '../dist/composition-game.mjs';
import {createTransport,START_DELAY_SECONDS} from '../dist/composition-transport.mjs';
import {createGameController,normalizeSettings} from '../dist/composition-game-ui.mjs';
import {ledFrame} from '../dist/hexboard-sync.mjs';

const fixture=JSON.parse(await readFile(new URL('./fixtures/composition/phase0-demo.json',import.meta.url),'utf8'));
const context=captureContext(fixture.musicalContext.state,220),deg=d=>context.scale.degrees[d].coordinate;
const SETTINGS='temperament-lab-game-settings',BEST='temperament-lab-game-best';
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function project(rows=[[0,480,0]],chords=[],bars=1){
  let p=createProject({context,layout:fixture.layout,tempo:120});
  for(const [kind,events] of [['melody',rows],['chords',chords]]){
    const clip=p.clips[kind==='melody'?1:0].id;
    for(const [i,[tick,duration,pitches]] of events.entries())p=addEvent(p,clip,{
      id:`${kind}${i}`,startTick:tick,durationTick:duration,velocity:90,
      tones:(Array.isArray(pitches)?pitches:[pitches]).map((d,j)=>({toneId:`${kind}${i}t${j}`,coordinate:typeof d==='number'?deg(d):d})),
    });
  }
  p.clips=p.clips.map(c=>({...c,lengthTick:3840*bars}));
  return p;
}

function fakeElement(){
  const classes=new Set();
  return {textContent:'',className:'',clientWidth:800,style:{setProperty(){}},classList:{
    add:x=>classes.add(x),remove:x=>classes.delete(x),toggle(x,on){if(on)classes.add(x);else classes.delete(x);},contains:x=>classes.has(x),
  }};
}
function harness({p=project(),settings={},selected=null,exportMatch='button',offsetMs=null}={}){
  let wall=0,nextId=1,controller,currentProject=p,prepareGate=null,released=0,lightChanges=0;
  const timers=new Map(),frames=new Map(),elements=new Map(),physicalHolds=new Map(),scheduled=[],previews=[],cancels=[],events=[],writes=[];
  const stored=new Map([[SETTINGS,{countIn:0,click:false,guide:'full',...settings}],['temperament-lab-game-offset',offsetMs]]);
  const document={querySelector(selector){if(!elements.has(selector))elements.set(selector,fakeElement());return elements.get(selector);}};
  const set=(fn,ms,interval=false)=>{const id=nextId++;timers.set(id,{fn,at:wall+ms,ms,interval});return id;};
  const audio={prepare:()=>prepareGate?.promise??Promise.resolve(),
    getClockSnapshot:()=>({audioSeconds:100+wall/1000,performanceMs:wall,anchor:{audioSeconds:100+wall/1000,performanceMs:wall},state:'running',clockRevision:1}),
    scheduleVoices(list,options){scheduled.push(...list.map(v=>({...v,groupId:options.groupId})));return [];},
    cancelGroup:id=>cancels.push(id),previewChord:cents=>{previews.push([...cents]);return Promise.resolve();},
  };
  const transport=createTransport({getProject:()=>controller.playbackProject(currentProject),audio,
    timer:{set:(fn,ms)=>set(fn,ms,true),clear:id=>timers.delete(id)},
    getClick:()=>controller.settings.click,onState:(event,detail)=>{events.push([event,detail]);controller.onTransport(event,detail);},
  });
  controller=createGameController({document,audio,transport,getProject:()=>currentProject,
    getBoard:()=>compositionBoard(currentProject).board,getSelectedSection:()=>selected,getExportMatch:()=>exportMatch,
    releaseHeld(){
      released++;
      for(const [holdId,coordinate] of [...physicalHolds].reverse()){
        physicalHolds.delete(holdId);controller?.input({type:'up',holdId,coordinate,keyId:0,t:wall});
      }
    },refresh(){},onLights(){lightChanges++;},storage:{get:key=>stored.get(key)??null,set:(key,value)=>{stored.set(key,structuredClone(value));writes.push(key);}},
    setTimer:(fn,ms)=>set(fn,ms),clearTimer:id=>timers.delete(id),now:()=>wall,
    raf:fn=>{const id=nextId++;frames.set(id,fn);return id;},cancel:id=>frames.delete(id),
  });
  async function advance(ms,{pump=true}={}){
    const end=wall+ms;
    while(pump){
      const due=[...timers].filter(([,t])=>t.at<=end+1e-7).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!due)break;
      const [id,t]=due;wall=Math.max(wall,t.at);
      if(t.interval)t.at=wall+t.ms;else timers.delete(id);
      t.fn();await flush();
    }
    wall=end;await flush();
  }
  const input=(type,id,coordinate,keyId=0)=>{
    if(type==='down')physicalHolds.set(id,coordinate);else physicalHolds.delete(id);
    controller.input({type,holdId:id,coordinate,keyId,t:wall});
  };
  return {controller,transport,audio,document,scheduled,previews,cancels,events,timers,frames,stored,writes,advance,input,
    down:(id,d,keyId)=>input('down',id,typeof d==='number'?deg(d):d,keyId),up:id=>input('up',id,deg(0)),
    change:(field,value)=>controller.change(field,{value,checked:!!value}),
    async start(){controller.start();await flush();},
    async go(tick){const at=transport.timeAt();assert.ok(at.tps>0,'transport must be playing');await advance(Math.max(0,(tick-at.v)/at.tps*1000));},
    gate(){let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});prepareGate={promise,resolve,reject};return prepareGate;},
    setProject:value=>{currentProject=value;},get wall(){return wall;},get released(){return released;},get lightChanges(){return lightChanges;},
    close(){controller.leave();},
  };
}

const failures=[];
async function test(name,fn){try{await fn();}catch(error){failures.push({name,error});console.error(`${name}: ${error.stack}`);}}

await test('custom speeds and frozen active run',async()=>{
  for(const speed of [10,73,200]){
    assert.equal(normalizeSettings({speed}).speed,speed);
    const h=harness({settings:{speed}});await h.start();
    assert.equal(h.controller.engine.tps,120*PPQ/60*speed/100);assert.equal(h.controller.view().bpm,120*speed/100);
    h.change('gameSpeed',150);h.change('gamePart','both');
    assert.equal(h.controller.settings.speed,speed);assert.equal(h.controller.view().settings.part,'melody');
    const replacement={...project(),tempo:180};h.setProject(replacement);
    assert.equal(h.controller.playbackProject(replacement).tempo,120*speed/100,'a live project replacement cannot retime a run');h.close();
  }
  assert.equal(normalizeSettings({speed:1}).speed,10);assert.equal(normalizeSettings({speed:500}).speed,200);
  const h=harness();h.change('gameSpeed','');h.change('gameSpeed','nonsense');assert.equal(h.controller.settings.speed,100);h.close();
});

await test('unavailable sections and exact/degree reachability',async()=>{
  for(const settings of [{section:'loop'},{section:'selected'},{section:'bars',fromBar:2,toBar:2},{section:'bars',fromBar:1,toBar:2}]){
    const h=harness({settings});assert.ok(h.controller.view().sectionUnavailable);await h.start();
    assert.equal(h.controller.phase,'setup');assert.equal(h.scheduled.length,0);assert.ok(h.controller.view().message);h.close();
  }
  const far=[deg(0)[0]+30,deg(0)[1]],h=harness({p:project([[0,480,[far]]])});
  assert.equal(h.controller.view().unreachable.length,1);await h.start();assert.equal(h.controller.phase,'setup');
  h.change('gameMatch','degree');assert.equal(h.controller.view().unreachable.length,0);await h.start();assert.equal(h.controller.phase,'running');h.close();
  const noLayout=harness({p:{...project(),layout:null},settings:{match:'degree'}});await noLayout.start();assert.equal(noLayout.controller.phase,'setup');assert.ok(noLayout.controller.view().unreachable.length);noLayout.close();
});

await test('preview stepping obeys part and selected section',async()=>{
  const h=harness({p:project([[0,480,0],[480,480,2],[960,480,4]],[[480,960,[0,2]]]),settings:{section:'selected'},selected:{from:480,to:960}});
  const expected=buildChart(project([[0,480,0],[480,480,2],[960,480,4]],[[480,960,[0,2]]]),{part:'melody',from:480,to:960}).targets;
  assert.deepEqual(h.controller.view().preview.ticks,[480]);h.controller.click('game-preview-hear');assert.deepEqual(h.previews.at(-1),expected.map(t=>t.cents));
  h.controller.click('game-preview-next');assert.deepEqual(h.controller.view().preview.ticks,[480]);
  h.change('gameSection','all');h.controller.click('game-preview-first');assert.equal(h.controller.view().preview.notes[0].tick,0);
  h.controller.click('game-preview-next');assert.equal(h.controller.view().preview.notes[0].tick,480);
  h.controller.click('game-preview-prev');assert.equal(h.controller.view().preview.notes[0].tick,0);
  h.change('gamePart','chords');assert.deepEqual(h.controller.view().preview.ticks,[480]);
  h.controller.click('game-preview-hear');assert.equal(h.previews.at(-1).length,2);
  assert.equal(h.controller.view().exportMatchMode,'button');h.close();
});

await test('navigation pauses setup auditions and repeat countdowns',async()=>{
  const h=harness();h.controller.click('game-preview-hear');const cancelled=h.cancels.length,released=h.released;
  h.controller.pause();assert.equal(h.controller.phase,'setup');assert.ok(h.cancels.slice(cancelled).includes('preview'));assert.ok(h.released>released);h.close();
  const repeating=harness({settings:{repeat:true}});await perfectPass(repeating);repeating.controller.pause();
  await repeating.advance(5000);assert.equal(repeating.controller.phase,'results');assert.equal(repeating.controller.view().repeatCountdown.paused,true);repeating.close();
});

await test('Wait starts on its first notes without the transport, and release-last completes',async()=>{
  const h=harness({p:project([[480,480,0],[960,480,4]],[[480,480,[0,2]]]),settings:{mode:'learn',part:'both'}});await h.start();
  assert.equal(h.controller.view().waitingTick,480,'the first notes are due at once');
  assert.equal(h.transport.state,'stopped');
  h.controller.click('game-hear-current');assert.equal(h.previews.at(-1).length,2,'Hear current deduplicates target pitches');
  h.down('wrong',6);h.down('a',0);h.down('b',2);assert.equal(h.controller.engine.state().judged,0,'a stray held note blocks the chord');
  h.up('wrong');await flush();
  assert.equal(h.controller.engine.state().judged,3,'releasing it completes the chord: duplicate same-onset pitches clear together');
  assert.equal(h.controller.view().waitingTick,960,'and the next notes are due straight away');assert.equal(h.controller.engine.state().wrong,1);
  assert.equal(h.transport.state,'stopped');assert.equal(h.scheduled.length,0,'no backing, count-in or click plays');
  assert.equal(h.document.querySelector('[data-game-combo]').textContent,'');assert.equal(h.document.querySelector('[data-game-accuracy]').textContent,'');h.close();
});

await test('Note hints off preserves feedback on the actual matching copy',async()=>{
  const p=project([[0,480,0]]),h=harness({p,settings:{mode:'learn',match:'degree',lights:'off'}});
  await h.start();await h.advance(100);
  const t=h.controller.engine.targets[0],suggested=h.controller.view().route.get(t.index);
  const actual=t.degreeKeys.find(i=>i!==suggested),board=compositionBoard(p).board;
  assert.notEqual(actual,undefined,'the layout has an alternate matching copy');
  assert.equal(h.controller.deviceSnapshot().keys.some(k=>k.lit&&!k.command),false,'hints off has no suggested LEDs');
  h.down('copy',board.keys[actual].m,actual);await flush();
  const lit=h.controller.deviceSnapshot().keys.filter(k=>k.lit&&!k.command).map(k=>k.index);
  assert.deepEqual(lit,[actual],'correctness flashes the played copy without suggesting another key');
  assert.ok(h.document.querySelector(`[data-comp-key="${actual}"]`).classList.contains('game-flash-ok'));
  assert.ok(!h.document.querySelector(`[data-comp-key="${suggested}"]`).classList.contains('game-flash-ok'));h.close();
});

// The HexBoard keys lit now: hints, flashes and held keys alike.
const litKeys=h=>h.controller.deviceSnapshot().keys.filter(k=>k.lit&&!k.command).map(k=>k.index).sort((a,b)=>a-b);
const keyNode=(h,k)=>h.document.querySelector(`[data-comp-key="${k}"]`);

await test('Timed lights each key only while its note is due',async()=>{
  // Every note is inside the 2 s lead time from the start; only the due one may light.
  const p=project([[0,480,0],[1920,480,2],[3840,480,4]]),h=harness({p});await h.start();
  const route=h.controller.view().route,[k0,k2,k4]=[0,1,2].map(i=>route.get(i));
  assert.equal(new Set([k0,k2,k4]).size,3,'three different buttons');
  h.controller.step();assert.deepEqual(litKeys(h),[],'nothing is lit before the first note is due');
  await h.go(0);h.controller.step();
  assert.deepEqual(litKeys(h),[k0],'the due note lights alone, not the later notes');
  assert.ok(keyNode(h,k0).classList.contains('game-now'),'the screen fills the due key');
  assert.ok(!keyNode(h,k2).classList.contains('game-now')&&!keyNode(h,k4).classList.contains('game-now'),'and only that key');
  const changes=h.lightChanges;h.down('first',0,k0);await flush();h.up('first');
  assert.equal(h.controller.engine.targets[0].result,'perfect');
  assert.ok(h.lightChanges>changes,'a played note asks the HexBoard to update at once');
  await h.advance(300);h.controller.step();assert.deepEqual(litKeys(h),[],'a played note goes out');
  await h.go(1920);h.controller.step();assert.deepEqual(litKeys(h),[k2]);
  await h.advance(140);h.controller.step();
  assert.ok(!keyNode(h,k2).classList.contains('game-now'),'a note past its window goes out');
  await h.advance(50);h.controller.step();
  assert.equal(h.controller.engine.targets[1].result,'miss');
  assert.ok(!keyNode(h,k2).classList.contains('game-now'),'a missed note goes out');
  assert.equal(h.controller.deviceSnapshot().keys[k2].layoutColor,'#ff4d4d','and flashes its miss');
  h.controller.finish();assert.deepEqual(litKeys(h),[],'results show the layout alone');h.close();
});

await test('Timed calls the right note pressed too late late, never a wrong note',async()=>{
  const h=harness({p:project([[0,480,0],[1920,480,2]])});await h.start();await h.go(0);
  await h.advance(250);h.controller.step();assert.equal(h.controller.engine.targets[0].result,'miss','the frame loop records the miss');
  h.down('late',0);await flush();
  assert.equal(h.controller.engine.state().wrong,0,'no wrong note');
  assert.equal(h.document.querySelector('[data-game-feedback]').textContent,'Too late');h.close();
});

await test('Wait lights only the next notes to play',async()=>{
  const p=project([[0,480,0],[480,480,2],[960,480,4]]),h=harness({p,settings:{mode:'learn'}});await h.start();
  const route=h.controller.view().route,[k0,k2,k4]=[0,1,2].map(i=>route.get(i));
  assert.equal(new Set([k0,k2,k4]).size,3,'three different buttons');
  h.controller.step();assert.equal(h.controller.view().waitingTick,0);
  assert.deepEqual(litKeys(h),[k0],'only the notes to play now are lit, not the later notes');
  for(const k of [k2,k4])assert.ok(!keyNode(h,k).classList.contains('game-now')&&!keyNode(h,k).classList.contains('game-soon'),'later notes have no screen hint');
  h.down('first',0,k0);await flush();
  const after=litKeys(h);
  assert.ok(after.includes(k2)&&!after.includes(k4),'the following notes light as soon as the current ones are played');
  assert.ok(!keyNode(h,k0).classList.contains('game-now'),'played notes go out');h.close();
});

await test('Note hints light the HexBoard dark, over the layout or not at all',async()=>{
  assert.equal(normalizeSettings({}).lights,'dark');assert.equal(normalizeSettings({hints:true}).lights,'dark');
  assert.equal(normalizeSettings({hints:false}).lights,'off','a saved Note hints switch that was off becomes the hard layout');
  assert.equal(normalizeSettings({lights:'layout',hints:false}).lights,'layout');assert.equal(normalizeSettings({lights:'bright'}).lights,'dark');
  assert.equal('hints' in normalizeSettings({hints:false}),false);
  const p=project(),board=compositionBoard(p).board,plain=ledFrame(compositionDeviceSnapshot(p,board));
  for(const lights of ['dark','layout','off']){
    const h=harness({p,settings:{lights}});await h.start();await h.go(0);h.controller.step();
    const key=h.controller.view().route.get(0),frame=ledFrame(h.controller.deviceSnapshot());
    const others=board.keys.filter(k=>!k.command&&k.enabled&&k.index!==key).map(k=>k.index);
    assert.deepEqual(litKeys(h),lights==='off'?[]:[key],`${lights}: lit keys`);
    if(lights==='dark')assert.ok(others.every(i=>frame.get(i).v===0),'dark: every other key is off');
    else assert.ok(others.every(i=>JSON.stringify(frame.get(i))===JSON.stringify(plain.get(i))),`${lights}: every other key shows the layout`);
    if(lights==='off')assert.deepEqual(frame.get(key),plain.get(key),'off: the key to play shows the layout too');
    else assert.ok(frame.get(key).v>plain.get(key).v,`${lights}: the key to play shines brighter than the layout`);
    h.close();
  }
});

await test('a press during the count-in lights nothing early',async()=>{
  const p=project(),board=compositionBoard(p).board,h=harness({p,settings:{countIn:1}});await h.start();await h.advance(500);
  assert.ok(h.transport.countingIn(),'still counting in');
  const key=h.controller.view().route.get(0),other=board.keys.find(k=>!k.command&&k.enabled&&k.m.join()!==board.keys[key].m.join());
  h.down('early',other.m,other.index);await flush();assert.equal(h.controller.view().route.get(0),key);
  assert.ok(!litKeys(h).includes(key),'the first note is not lit before it is due');h.close();
});

await test('played buttons guide the current piece across setup, restarts and repeats',async()=>{
  const p=project([[0,240,0],[480,240,0],[960,240,0]]),h=harness({p,settings:{mode:'learn',match:'degree'}}),board=compositionBoard(p).board;
  h.controller.view();h.controller.resume();
  const initial=h.controller.deviceSnapshot().keys.find(k=>k.lit&&!k.command).index;
  const options=buildChart(p,{part:'melody'}).targets[0].degreeKeys,copy=options.find(i=>i!==initial);
  assert.notEqual(copy,undefined);h.down('setup-copy',board.keys[copy].m,copy);h.up('setup-copy');
  assert.deepEqual(h.controller.deviceSnapshot().keys.filter(k=>k.lit&&!k.command).map(k=>k.index),[copy],'setup auditions choose the hint button');
  assert.ok(!h.document.querySelector(`[data-comp-key="${initial}"]`).classList.contains('game-now'),'old preview hint is removed');
  await h.start();assert.ok([...h.controller.view().route.values()].every(i=>i===copy),'all matching cues use the played copy');
  await h.advance(100);h.down('first-copy',board.keys[copy].m,copy);await flush();h.up('first-copy');
  const latest=options.find(i=>i!==copy);h.down('new-choice',board.keys[latest].m,latest);h.up('new-choice');
  assert.equal(h.controller.engine.targets[0].result,'ok');assert.equal(h.controller.view().route.get(0),copy,'completed cue hints stay fixed');
  assert.equal(h.controller.view().route.get(1),latest,'future cues follow the newly played button');
  h.controller.click('game-restart');await flush();assert.ok([...h.controller.view().route.values()].every(i=>i===latest));
  h.controller.finish();h.controller.click('game-again');await flush();assert.ok([...h.controller.view().route.values()].every(i=>i===latest));
  h.controller.quit();h.setProject({...p,tempo:140});await h.start();assert.ok([...h.controller.view().route.values()].every(i=>i===latest),'tempo edits preserve button choices');
  const shifted={...p,layout:{...p.layout,register:(p.layout.register??0)+1}};
  h.controller.quit();h.setProject(shifted);await h.start();
  const shiftedFresh=harness({p:shifted,settings:{mode:'learn',match:'degree'}});await shiftedFresh.start();
  assert.deepEqual([...h.controller.view().route],[...shiftedFresh.controller.view().route],'a changed physical pitch layout clears choices');shiftedFresh.close();
  h.controller.quit();h.setProject({...p,id:'different-piece'});await h.start();
  const fresh=harness({p:{...p,id:'different-piece'},settings:{mode:'learn',match:'degree'}});await fresh.start();
  assert.deepEqual([...h.controller.view().route],[...fresh.controller.view().route],'a different piece starts with fresh suggestions');
  fresh.close();h.close();
});

await test('automatic repeat keeps the chosen button for the piece',async()=>{
  const p=project(),h=harness({p,settings:{mode:'learn',match:'degree',repeat:true}}),board=compositionBoard(p).board;
  h.controller.view();const initial=h.controller.deviceSnapshot().keys.find(k=>k.lit&&!k.command).index;
  const copy=buildChart(p,{part:'melody'}).targets[0].degreeKeys.find(i=>i!==initial);
  h.down('chosen',board.keys[copy].m,copy);h.up('chosen');await h.start();await h.advance(100);
  h.down('first',board.keys[copy].m,copy);await flush();await h.advance(2500);
  assert.equal(h.controller.view().pass,2);assert.equal(h.controller.view().route.get(0),copy);h.close();
});

await test('hints keep each pitch on one button across melody and chords',async()=>{
  const p=project([[480,240,2],[1440,240,0]],[[0,960,[0,2,4]],[960,960,[0,2,6]],[1920,960,[0,2,4]]]);
  for(const match of ['exact','degree']){
    const h=harness({p,settings:{mode:'learn',part:'both',match}});await h.start();
    assert.equal(h.controller.phase,'running');
    const {route}=h.controller.view(),{targets}=h.controller.engine,buttons=new Map();
    for(const degree of [0,2])assert.equal(targets.filter(t=>t.degree===degree).length,4,'the melody and every chord share the tone');
    for(const t of targets){
      const id=match==='degree'?t.degree:t.coordinate.join(','),button=route.get(t.index);
      assert.notEqual(button,undefined);
      if(!buttons.has(id))buttons.set(id,new Set());
      buttons.get(id).add(button);
    }
    assert.ok([...buttons.values()].every(used=>used.size===1),`${match} hints keep each pitch on one button`);
    h.close();
  }
});

await test('buttons chosen in Compose fix their pitch in every hint',async()=>{
  const base=project([[0,480,0],[480,480,2],[960,480,0]],[[1440,960,[0,2,4]]]),board=compositionBoard(base).board;
  const copies=board.keys.filter(k=>!k.command&&k.enabled&&k.m.join()===deg(0).join()).map(k=>k.index);
  const auto=harness({p:base,settings:{mode:'learn',part:'both'}});await auto.start();
  const automatic=auto.controller.view().route.get(0);auto.close();
  const pick=copies.find(k=>k!==automatic),p=setFingering(base,[{coordinate:deg(0),key:pick}]);
  assert.ok(pick!==undefined,'the tonic has another button to choose');
  for(const match of ['exact','degree']){
    const h=harness({p,settings:{mode:'learn',part:'both',match}});await h.start();
    const {route}=h.controller.view(),tonic=h.controller.engine.targets.filter(t=>t.coordinate.join()===deg(0).join());
    assert.equal(tonic.length,3);assert.ok(tonic.every(t=>route.get(t.index)===pick),`${match}: every tonic note suggests the chosen button`);
    h.close();
  }
  const played=harness({p,settings:{mode:'learn',part:'both'}}),other=copies.find(k=>k!==pick);
  played.down('elsewhere',board.keys[other].m,other);played.up('elsewhere');await played.start();
  assert.equal(played.controller.view().route.get(0),pick,'a played button does not override a chosen one');
  played.close();
});

await test('sections and parts use the whole piece’s fingering',async()=>{
  const p=project([[0,480,0],[480,480,2],[3840,480,4],[4320,480,0]],[[0,1920,[0,2,4]],[3840,1920,[0,2,6]]],2);
  const whole=harness({p,settings:{mode:'learn',part:'both'}});await whole.start();
  const byCue=new Map(whole.controller.engine.targets.map(t=>[t.id,whole.controller.view().route.get(t.index)]));whole.close();
  assert.ok([...byCue.values()].every(k=>k!==undefined));
  for(const settings of [{part:'melody'},{part:'chords'},{part:'both',section:'bars',fromBar:2,toBar:2}]){
    const h=harness({p,settings:{mode:'learn',...settings}});await h.start();
    const {route}=h.controller.view(),{targets}=h.controller.engine;
    assert.ok(targets.length>0&&targets.every(t=>route.get(t.index)===byCue.get(t.id)),`${JSON.stringify(settings)} shows the same buttons`);
    h.close();
  }
});

await test('piece changes clear preferences with Note hints off',async()=>{
  const p=project(),h=harness({p,settings:{match:'degree',lights:'off'}}),board=compositionBoard(p).board;
  const copy=buildChart(p,{part:'melody'}).targets[0].degreeKeys.at(-1);
  h.down('copy',board.keys[copy].m,copy);h.up('copy');h.setProject({...p,id:'another-piece'});h.controller.view();
  h.setProject(p);h.change('gameLights','dark');const fresh=harness({p,settings:{match:'degree'}});
  h.controller.view();fresh.controller.view();assert.deepEqual(h.controller.deviceSnapshot().keys.filter(k=>k.lit).map(k=>k.index),fresh.controller.deviceSnapshot().keys.filter(k=>k.lit).map(k=>k.index));
  h.close();fresh.close();
});

await test('quick Wait correction replaces and expires earlier feedback',async()=>{
  const p=project([[0,20,6],[20,480,0]]),h=harness({p,settings:{mode:'learn',lights:'off'}}),board=compositionBoard(p).board;
  const key=d=>board.keys.find(k=>!k.command&&k.enabled&&k.m.join()===deg(d).join()).index;
  await h.start();await h.advance(100);h.down('wrong-first',0,key(0));h.up('wrong-first');
  const node=h.document.querySelector(`[data-comp-key="${key(0)}"]`);
  assert.ok(node.classList.contains('game-flash-wrong'));
  h.down('first',6,key(6));await flush();h.up('first');await h.advance(150);
  assert.equal(h.controller.view().waitingTick,20);h.down('second',0,key(0));await flush();
  assert.ok(node.classList.contains('game-flash-ok'));assert.ok(!node.classList.contains('game-flash-wrong'));
  await h.advance(270);h.controller.step();assert.ok(!node.classList.contains('game-flash-ok'));h.close();
});

await test('manual pause during Wait clears partial holds and ignores presses until resumed',async()=>{
  const h=harness({p:project([],[[0,960,[0,2]]]),settings:{mode:'learn',part:'chords'}});await h.start();await h.advance(100);
  h.down('a',0);assert.equal(h.controller.engine.waiting().missing.length,1);
  const releases=h.released;h.controller.click('game-pause');assert.equal(h.controller.view().paused,true);assert.ok(h.released>releases);
  assert.equal(h.controller.engine.waiting().missing.length,2);h.down('ignored',2);assert.equal(h.controller.engine.state().judged,0);
  h.controller.click('game-pause');assert.equal(h.controller.view().paused,false);assert.equal(h.controller.view().waitingTick,0);
  h.down('b',2);assert.equal(h.controller.engine.state().judged,0);h.down('fresh',0);await flush();
  assert.equal(h.controller.engine.state().judged,2);assert.equal(h.transport.state,'stopped');h.close();
});

await test('release-all during pause cannot complete a blocked Wait group',async()=>{
  const h=harness({p:project([],[[0,960,[0,2]]]),settings:{mode:'learn',part:'chords'}});await h.start();await h.advance(100);
  h.down('extra',6);h.down('a',0);h.down('b',2);h.up('extra');await flush();
  // Restart the group with the extra last: the fake board releases it first during reset.
  h.controller.click('game-restart');await flush();await h.advance(100);
  h.down('extra2',6);h.down('a2',0);h.down('b2',2);h.down('last-extra',6);
  h.up('extra2');assert.equal(h.controller.engine.waiting().missing.length,0);assert.equal(h.controller.engine.state().judged,0);
  h.controller.pause();assert.equal(h.controller.engine.state().judged,0,'reset releases are never accepted as player completion');
  assert.equal(h.controller.engine.waiting().missing.length,2);assert.equal(h.controller.view().waitingTick,0);h.close();
});

await test('Wait counts each next note as soon as it is played, however quickly',async()=>{
  const h=harness({p:project([[0,480,0],[480,480,2],[960,480,4]]),settings:{mode:'learn'}});await h.start();
  for(const [id,d] of [['a',0],['b',2],['c',4]]){h.down(id,d);await flush();}
  assert.equal(h.controller.engine.state().judged,3,'no press is too early, and earlier notes may stay held');
  assert.equal(h.controller.engine.state().wrong,0);
  h.down('after',6);assert.equal(h.controller.engine.state().wrong,0,'presses after the last notes do not count');
  assert.equal(h.controller.phase,'running','the last notes ring for a moment');await h.advance(1000);
  assert.equal(h.controller.phase,'results');assert.equal(h.controller.view().summary.learned,3);h.close();
  const paused=harness({p:project(),settings:{mode:'learn'}});await paused.start();paused.down('a',0);await flush();
  paused.controller.click('game-pause');await paused.advance(2000);assert.equal(paused.controller.phase,'running','pausing holds the results back');
  paused.controller.click('game-pause');assert.equal(paused.controller.phase,'results','resuming after the last notes shows them');paused.close();
});

await test('Wait ignores the Timed count-in, metronome, backing and speed',async()=>{
  const h=harness({p:project([[0,480,0]],[[0,960,[0,2]]]),settings:{mode:'learn',countIn:2,click:true,guide:'full',speed:50}});await h.start();
  assert.equal(h.controller.view().waitingTick,0);await h.advance(3000);
  assert.equal(h.transport.state,'stopped');assert.equal(h.scheduled.length,0,'no count-in, click or backing plays');
  assert.equal(h.controller.engine.tps,120*PPQ/60,'its highway uses the composition tempo, whatever the speed');h.close();
});

await test('finite section caps backing and judges final misses without RAF',async()=>{
  const h=harness({p:project([[600,200,0]],[[0,2000,[0,2]]]),settings:{section:'selected'},selected:{from:480,to:800}});await h.start();
  await h.advance(500);
  assert.equal(h.controller.phase,'results');assert.equal(h.controller.view().summary.counts.miss,1);
  assert.equal(h.controller.view().summary.total,1);
  const endAudio=100+START_DELAY_SECONDS+(800-480)/1920;
  assert.ok(h.scheduled.length);assert.ok(h.scheduled.filter(v=>v.groupId==='transport').every(v=>v.releaseAudioSeconds<=endAudio+1e-8));
  assert.equal(h.transport.state,'stopped');assert.equal(h.controller.view().summary.score,0);h.close();
});

await test('calibrated end-window input and Timed release remain judged',async()=>{
  const h=harness({p:project([[790,10,0]]),settings:{section:'selected'},selected:{from:0,to:800},offsetMs:200});await h.start();
  await h.go(790+1920*.2);assert.equal(h.transport.state,'playing','the final grace includes calibrated input lag');
  h.down('last',0);assert.equal(h.controller.engine.targets[0].result,'perfect');await h.advance(400);
  assert.equal(h.controller.phase,'results');assert.equal(h.controller.view().summary.counts.miss,0);h.close();
  const held=harness({p:project([[0,960,0]])});await held.start();await held.go(0);held.down('hold',0);await held.go(960);held.up('hold');
  assert.equal(held.controller.engine.targets[0].held,true);held.controller.finish();assert.equal(held.controller.view().summary.holds,1);held.close();
});

async function perfectPass(h){await h.start();await h.go(0);h.down('perfect',0);h.controller.finish();await flush();}
await test('Timed repeat countdown pauses, resumes and cancels',async()=>{
  const h=harness({settings:{repeat:true}});await perfectPass(h);
  assert.equal(h.controller.view().repeatCountdown.seconds,3);await h.advance(1000);assert.equal(h.controller.view().repeatCountdown.seconds,2);
  h.controller.click('game-repeat-pause');await h.advance(5000);assert.equal(h.controller.phase,'results');assert.equal(h.controller.view().repeatCountdown.seconds,2);
  h.controller.click('game-repeat-pause');await h.advance(1999);assert.equal(h.controller.phase,'results');await h.advance(1);
  assert.equal(h.controller.phase,'running');assert.equal(h.controller.view().pass,2);h.controller.finish();
  h.controller.click('game-repeat-stop');await h.advance(5000);assert.equal(h.controller.phase,'results');assert.equal(h.controller.view().repeatCountdown,null);h.close();
  const q=harness({settings:{repeat:true}});await perfectPass(q);q.controller.quit();await q.advance(4000);assert.equal(q.controller.phase,'setup');assert.equal(q.timers.size,0);q.close();
});

await test('Wait repeats a moment after its last notes without scoring or saving best',async()=>{
  const h=harness({settings:{mode:'learn',repeat:true,countIn:1}});await h.start();h.down('a',0);await flush();
  assert.equal(h.controller.view().pass,1);await h.advance(1000);
  assert.equal(h.controller.phase,'running');assert.equal(h.controller.view().pass,2);
  assert.equal(h.controller.view().waitingTick,0,'the next pass starts on its first notes at once');
  assert.ok(!h.writes.includes(BEST));assert.equal(h.controller.engine.state().score,0);h.close();
});

await test('trainer advances five percent and respects configurable target',async()=>{
  for(const [speed,target,next] of [[73,100,78],[98,100,100],[120,150,125],[148,150,150],[160,150,160]]){
    const h=harness({settings:{speed,trainer:true,targetSpeed:target}});await perfectPass(h);
    assert.equal(h.controller.view().summary.nextSpeed,next);h.controller.click('game-again');await flush();
    assert.equal(h.controller.settings.speed,next);h.close();
  }
  const failed=harness({settings:{speed:73,trainer:true,targetSpeed:150}});await failed.start();await failed.advance(3500);
  assert.equal(failed.controller.view().summary.nextSpeed,73,'a failed pass does not accelerate');failed.close();
});

await test('pending seek and audio preparation are cancelled by Quit',async()=>{
  const h=harness();const realSeek=h.transport.seek;let resolve;
  h.transport.seek=tick=>new Promise(r=>{resolve=()=>{void realSeek(tick).then(r);};});
  h.controller.start();h.controller.quit();resolve();await flush();
  assert.equal(h.controller.phase,'setup');assert.equal(h.transport.state,'stopped');assert.equal(h.scheduled.length,0);h.close();
  const preparing=harness();const gate=preparing.gate();preparing.controller.start();await flush();preparing.controller.quit();gate.resolve();await flush();
  assert.equal(preparing.transport.state,'stopped');assert.equal(preparing.scheduled.length,0);assert.equal(preparing.controller.phase,'setup');preparing.close();
});

await test('late calibration preparation cannot schedule after Quit',async()=>{
  const h=harness(),gate=h.gate();h.controller.click('game-calibrate');assert.equal(h.controller.phase,'calibrating');
  h.controller.quit();gate.resolve();await flush();assert.equal(h.controller.phase,'setup');assert.equal(h.scheduled.length,0);assert.equal(h.timers.size,0);h.close();
});

await test('audio preparation failure returns to actionable setup',async()=>{
  const h=harness(),gate=h.gate();h.controller.start();await flush();gate.reject(new Error('test audio blocked'));await flush();
  assert.equal(h.controller.phase,'setup');assert.match(h.controller.view().message,/Audio could not start.*test audio blocked/);
  assert.equal(h.transport.state,'stopped');assert.equal(h.scheduled.length,0);assert.equal(h.timers.size,0);h.close();
});

if(failures.length)throw new AggregateError(failures.map(({name,error})=>new Error(name,{cause:error})),`${failures.length} composition-play checks failed`);
console.log('composition-play: ok');
