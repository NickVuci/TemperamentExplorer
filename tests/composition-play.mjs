// Compose Play controller with its real transport: audio boundaries, Wait input, run lifecycle,
// previews, preflight, repetition and training. Animation frames never drive these tests.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {captureContext} from '../dist/composition-context.mjs';
import {createProject,addEvent,PPQ} from '../dist/composition-project.mjs';
import {compositionBoard} from '../dist/composition-board.mjs';
import {buildChart} from '../dist/composition-game.mjs';
import {createTransport,START_DELAY_SECONDS} from '../dist/composition-transport.mjs';
import {createGameController,normalizeSettings} from '../dist/composition-game-ui.mjs';

const fixture=JSON.parse(await readFile(new URL('./fixtures/composition/phase0-demo.json',import.meta.url),'utf8'));
const context=captureContext(fixture.musicalContext.state,220),deg=d=>context.scale.degrees[d].coordinate;
const SETTINGS='temperament-lab-game-settings',BEST='temperament-lab-game-best';
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function project(rows=[[0,480,0]],chords=[]){
  let p=createProject({context,layout:fixture.layout,tempo:120});
  for(const [kind,events] of [['melody',rows],['chords',chords]]){
    const clip=p.clips[kind==='melody'?1:0].id;
    for(const [i,[tick,duration,pitches]] of events.entries())p=addEvent(p,clip,{
      id:`${kind}${i}`,startTick:tick,durationTick:duration,velocity:90,
      tones:(Array.isArray(pitches)?pitches:[pitches]).map((d,j)=>({toneId:`${kind}${i}t${j}`,coordinate:typeof d==='number'?deg(d):d})),
    });
  }
  p.clips=p.clips.map(c=>({...c,lengthTick:3840}));
  return p;
}

function fakeElement(){
  const classes=new Set();
  return {textContent:'',className:'',clientWidth:800,style:{setProperty(){}},classList:{
    add:x=>classes.add(x),remove:x=>classes.delete(x),toggle(x,on){if(on)classes.add(x);else classes.delete(x);},contains:x=>classes.has(x),
  }};
}
function harness({p=project(),settings={},selected=null,exportMatch='button',offsetMs=null}={}){
  let wall=0,nextId=1,controller,currentProject=p,prepareGate=null,released=0;
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
    },refresh(){},storage:{get:key=>stored.get(key)??null,set:(key,value)=>{stored.set(key,structuredClone(value));writes.push(key);}},
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
    setProject:value=>{currentProject=value;},get wall(){return wall;},get released(){return released;},
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

await test('Wait activates from transport timer and release-last completes',async()=>{
  const h=harness({p:project([[480,480,0]],[[480,480,[0,2]]]),settings:{mode:'learn',part:'both'}});await h.start();
  assert.equal(h.controller.engine.waiting().due,false);h.down('pre',0);assert.equal(h.controller.engine.state().judged,0);
  await h.advance(350);assert.equal(h.transport.state,'paused');assert.equal(h.controller.view().waitingTick,480);
  assert.ok(h.events.some(([e,d])=>e==='boundary'&&d.tick===480));
  h.controller.click('game-hear-current');assert.equal(h.previews.at(-1).length,2,'Hear current deduplicates target pitches');
  h.down('a',0);h.down('b',2);h.down('wrong',6);assert.equal(h.controller.engine.state().judged,0);
  h.up('pre');assert.equal(h.controller.engine.state().judged,0);h.up('wrong');await flush();
  assert.equal(h.controller.engine.state().judged,3,'duplicate same-onset pitches clear together');
  assert.equal(h.controller.view().waitingTick,null);assert.equal(h.transport.state,'playing');assert.equal(h.controller.engine.state().wrong,1);
  assert.equal(h.document.querySelector('[data-game-combo]').textContent,'');assert.equal(h.document.querySelector('[data-game-accuracy]').textContent,'');h.close();
});

await test('Note hints off preserves feedback on the actual matching copy',async()=>{
  const p=project([[0,480,0]]),h=harness({p,settings:{mode:'learn',match:'degree',hints:false}});
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

await test('piece changes clear preferences with Note hints off',async()=>{
  const p=project(),h=harness({p,settings:{match:'degree',hints:false}}),board=compositionBoard(p).board;
  const copy=buildChart(p,{part:'melody'}).targets[0].degreeKeys.at(-1);
  h.down('copy',board.keys[copy].m,copy);h.up('copy');h.setProject({...p,id:'another-piece'});h.controller.view();
  h.setProject(p);h.change('gameHints',true);const fresh=harness({p,settings:{match:'degree'}});
  h.controller.view();fresh.controller.view();assert.deepEqual(h.controller.deviceSnapshot().keys.filter(k=>k.lit).map(k=>k.index),fresh.controller.deviceSnapshot().keys.filter(k=>k.lit).map(k=>k.index));
  h.close();fresh.close();
});

await test('quick Wait correction replaces and expires earlier feedback',async()=>{
  const p=project([[0,20,6],[20,480,0]]),h=harness({p,settings:{mode:'learn',hints:false}}),board=compositionBoard(p).board;
  const key=d=>board.keys.find(k=>!k.command&&k.enabled&&k.m.join()===deg(d).join()).index;
  await h.start();await h.advance(100);h.down('wrong-first',0,key(0));h.up('wrong-first');
  const node=h.document.querySelector(`[data-comp-key="${key(0)}"]`);
  assert.ok(node.classList.contains('game-flash-wrong'));
  h.down('first',6,key(6));await flush();h.up('first');await h.advance(150);
  assert.equal(h.controller.view().waitingTick,20);h.down('second',0,key(0));await flush();
  assert.ok(node.classList.contains('game-flash-ok'));assert.ok(!node.classList.contains('game-flash-wrong'));
  await h.advance(270);h.controller.step();assert.ok(!node.classList.contains('game-flash-ok'));h.close();
});

await test('manual pause during Wait clears partial holds without resuming past the cue',async()=>{
  const h=harness({p:project([],[[0,960,[0,2]]]),settings:{mode:'learn',part:'chords'}});await h.start();await h.advance(100);
  h.down('a',0);assert.equal(h.controller.engine.waiting().missing.length,1);
  const releases=h.released;h.controller.click('game-pause');assert.equal(h.controller.view().paused,true);assert.ok(h.released>releases);
  assert.equal(h.controller.engine.waiting().missing.length,2);h.down('ignored',2);assert.equal(h.controller.engine.state().judged,0);
  h.controller.click('game-pause');assert.equal(h.controller.view().paused,false);assert.equal(h.transport.state,'paused');
  h.down('b',2);assert.equal(h.controller.engine.state().judged,0);h.down('fresh',0);await flush();
  assert.equal(h.controller.engine.state().judged,2);assert.equal(h.transport.state,'playing');h.close();
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

await test('delayed boundary is never activated by frames or input',async()=>{
  const h=harness({p:project([[480,480,0]]),settings:{mode:'learn'}});await h.start();
  await h.advance(1000,{pump:false});h.controller.step();h.down('early',0);
  assert.equal(h.controller.engine.waiting().due,false);assert.equal(h.controller.engine.state().judged,0);
  assert.equal(h.controller.view().waitingTick,null);h.transport.pump();
  assert.equal(h.controller.view().waitingTick,480);assert.equal(h.transport.position(),480);
  assert.equal(h.controller.engine.waiting().extras.length,1);h.up('early');h.down('fresh',0);await flush();
  assert.equal(h.controller.engine.state().judged,1);h.close();
});

await test('count-in input and future held notes cannot clear later Wait cues',async()=>{
  const h=harness({p:project([[0,480,0],[480,480,2]]),settings:{mode:'learn',countIn:1}});await h.start();
  h.down('count',0);assert.equal(h.controller.engine.waiting().due,false);await h.advance(2100);
  assert.equal(h.controller.view().waitingTick,0);h.up('count');h.down('fresh0',0);await flush();
  h.down('future',2);assert.equal(h.controller.engine.state().judged,1);await h.advance(350);
  assert.equal(h.controller.view().waitingTick,480);assert.equal(h.controller.engine.waiting().missing.length,1);
  h.up('future');h.up('fresh0');h.down('fresh2',2);await flush();assert.equal(h.controller.engine.state().judged,2);h.close();
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

await test('Wait repeats after its finite tail without scoring or saving best',async()=>{
  const h=harness({settings:{mode:'learn',repeat:true,countIn:1}});await h.start();await h.advance(2100);h.down('a',0);await flush();
  await h.advance(2500);assert.equal(h.controller.phase,'running');assert.equal(h.controller.view().pass,2);
  assert.ok(h.transport.countingIn(),'the next Wait pass has the configured count-in');
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
