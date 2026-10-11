// Entering notes from the HexBoard: takes, hold groups, chord grouping, and the transport's
// count-in, metronome and heard-time.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createTake,groupChords,createHoldGroup,EARLY_SECONDS} from '../dist/composition-record.mjs';
import {createTransport,createPlan,clickOccurrences,heardSeconds,CLICK,GROUP,START_DELAY_SECONDS} from '../dist/composition-transport.mjs';
import {createProject,addEvent,setMeter,setLoop,PPQ} from '../dist/composition-project.mjs';
import {captureContext} from '../dist/composition-context.mjs';
import {beatAccent} from '../dist/composition-grid.mjs';

// ---- takes ----
const at=(tick,seconds,{tps=1600,room=1e9,countIn=false,early=0}={})=>({tick,seconds,tps,room,countIn,early});
{
  const take=createTake();
  assert.equal(take.down('a',[0,0],at(960,10)),true);
  assert.equal(take.down('a',[0,0],at(980,10.01)),false,'a repeated down for the same hold is ignored');
  assert.equal(take.down('b',[0,0],at(1200,10.15)),true,'the same pitch from another hold is a separate note');
  assert.deepEqual(take.up('a',at(0,10.3)),{coordinate:[0,0],startTick:960,startSeconds:10,durationTick:480},'held time at the playing tempo');
  assert.equal(take.up('zzz',at(0,11)),null,'an unknown hold changes nothing');
  assert.equal(take.preview(at(0,10.4)).find(n=>n.open).durationTick,400,'a held note grows while it is held');
  const notes=take.finish(at(0,10.5));
  assert.deepEqual(notes.map(n=>[n.startTick,n.durationTick]),[[960,480],[1200,560]],'finish closes held notes');
  assert.equal(take.size,2);
}
{
  const take=createTake();
  take.down('x',[1,2],at(3600,5,{room:240}));
  assert.equal(take.up('x',at(0,6)).durationTick,240,'a note stops where playback wraps');
  take.down('y',[1,2],at(0,7));assert.equal(take.up('y',at(0,7)).durationTick,1,'a tap is at least one tick');
}
{
  const take=createTake();
  assert.equal(take.down('c',[0,0],at(0,4,{countIn:true,early:.5})),false,'count-in presses are dropped');
  assert.equal(take.down('d',[0,0],at(3840,4.9,{countIn:true,early:EARLY_SECONDS/2})),true,'a press just before the downbeat starts on it');
  const n=take.up('d',at(0,5.2));assert.equal(n.startTick,3840);assert.equal(n.durationTick,Math.round((5.2-(4.9+EARLY_SECONDS/2))*1600));
  assert.equal(take.down('e',[0,0],at(0,1,{tps:0})),false,'nothing records while stopped');
}

// ---- chords from a take ----
{
  const cents=m=>m[0]*1200+m[1]*700;
  const notes=[
    {coordinate:[0,1],startTick:0,startSeconds:1.00,durationTick:900},
    {coordinate:[0,0],startTick:5,startSeconds:1.03,durationTick:960},
    {coordinate:[0,0],startTick:8,startSeconds:1.05,durationTick:400},
    {coordinate:[1,-1],startTick:1920,startSeconds:2.2,durationTick:960},
    {coordinate:[0,4],startTick:1930,startSeconds:2.25,durationTick:1000},
  ];
  const chords=groupChords(notes,{cents});
  assert.equal(chords.length,2,'notes pressed together form one chord');
  assert.deepEqual(chords[0],{startTick:0,endTick:965,coordinates:[[0,0],[0,1]]},'each pitch once, lowest first, earliest start to latest end');
  assert.deepEqual(chords[1].coordinates,[[0,4],[1,-1]].sort((a,b)=>cents(a)-cents(b)));
}

// ---- hold groups (step entry) ----
{
  const g=createHoldGroup();
  g.down('1',[0,0]);g.down('2',[0,2]);g.down('3',[0,2]);
  assert.deepEqual(g.pending,[[0,0],[0,2]]);assert.equal(g.active,true);
  assert.equal(g.up('1'),null,'the group stays open while any key is held');
  assert.equal(g.up('nope'),null);
  assert.equal(g.up('2'),null);
  assert.deepEqual(g.up('3'),[[0,0],[0,2]],'releasing the last key completes the group, each pitch once');
  assert.equal(g.active,false);assert.deepEqual(g.pending,[]);
  g.down('4',[1,1]);g.cancel();assert.equal(g.up('4'),null,'a cancelled group enters nothing');
}

// ---- metronome and count-in ----
const demo=JSON.parse(await readFile(new URL('./fixtures/composition/phase0-demo.json',import.meta.url),'utf8'));
const ctx=captureContext(demo.musicalContext.state,220);
{
  let p=createProject({context:ctx,tempo:120});
  p=setMeter(p,{numerator:7,denominator:8,groups:[3,2,2]});
  assert.deepEqual([0,1,2,3,4,5,6].map(i=>beatAccent(p.meter,i)),['bar','beat','beat','group','beat','group','beat'],'accents follow the beat groups');
  const clicks=clickOccurrences(p,3360*2);
  assert.equal(clicks.length,14);assert.deepEqual(clicks.slice(0,4).map(c=>c.startTick),[0,480,960,1440]);
  assert.deepEqual(clicks.slice(0,7).map(c=>c.tones[0].click),['bar','beat','beat','group','beat','group','beat']);
  const plan=createPlan(p,{click:true});assert.ok(plan.occurrences.some(o=>o.tones[0].click),'the metronome joins the plan');
  assert.ok(!createPlan(p).occurrences.some(o=>o.tones[0]?.click),'and only when asked');
}
function fakeAudio(){
  const clock={audioSeconds:100,state:'running',clockRevision:1,performanceMs:50000,anchor:{audioSeconds:99.98,performanceMs:50000}},scheduled=[],cancelled=[];
  return {clock,scheduled,cancelled,audio:{prepare:async()=>{},getClockSnapshot:()=>({...clock,anchor:{...clock.anchor}}),cancelGroup(){},
    scheduleVoices:(list,opts)=>{scheduled.push(...list.map(v=>({...v,settings:opts.settings,group:opts.groupId})));return list.map(v=>({voiceId:v.voiceId,cancel:()=>cancelled.push(v.voiceId)}));}}};
}
{
  let p=createProject({context:ctx,tempo:120});
  const melody=p.clips[1].id;p=addEvent(p,melody,{id:'n1',startTick:0,durationTick:480,velocity:90,tones:[{toneId:'t1',coordinate:[0,0]}]});
  const f=fakeAudio(),t=createTransport({getProject:()=>p,audio:f.audio,timer:{set:()=>1,clear(){}},getClick:()=>true});
  await t.play({countIn:1});
  const count=f.scheduled.filter(v=>v.voiceId.startsWith('count#'));
  assert.equal(count.length,4,'one bar of count-in clicks');
  assert.deepEqual(count.map(v=>v.settings),Array(4).fill(CLICK.settings),'clicks use their own fixed pitch and wave');
  assert.ok(Math.abs(count[1].onsetAudioSeconds-count[0].onsetAudioSeconds-.5)<1e-9,'on the beat at 120 BPM');
  assert.equal(count[0].cents,CLICK.bar.cents);assert.equal(count[1].cents,CLICK.beat.cents);
  assert.ok(!f.scheduled.some(v=>v.voiceId.startsWith('n1')),'the piece waits for the downbeat');
  assert.deepEqual(t.countingIn(),{beat:1,beats:4});
  f.clock.audioSeconds+=1.2;t.pump();assert.deepEqual(t.countingIn(),{beat:3,beats:4});assert.equal(t.position(),0,'the playhead holds during the count');
  // An edit during the count keeps the count.
  t.invalidate();assert.ok(!f.cancelled.some(id=>id.startsWith('count#')),'an edit during the count-in keeps its clicks');
  f.clock.audioSeconds+=.9;t.pump();
  const downbeat=100+START_DELAY_SECONDS+2;
  assert.ok(f.scheduled.some(v=>v.voiceId.startsWith('n1')&&Math.abs(v.onsetAudioSeconds-downbeat)<1e-9),'the piece starts on the downbeat after the count');
  assert.ok(f.scheduled.some(v=>v.voiceId.startsWith('click#0')&&v.settings===CLICK.settings),'the metronome clicks with the piece');
  // Heard time: the output timestamp pairs the clocks after output latency.
  f.clock.audioSeconds=downbeat+.6;f.clock.anchor={audioSeconds:downbeat+.55,performanceMs:60000};
  const heard=t.timeAt(60000);
  assert.equal(heard.seconds,downbeat+.55);assert.equal(heard.countIn,false);
  assert.equal(heard.tick,Math.floor(.55*1920),'the tick heard, not the tick being computed');
  assert.ok(Math.abs(heard.v-.55*1920)<1e-6);
  assert.equal(t.timeAt(60000-100).tick,Math.floor(.45*1920),'an earlier event time is placed earlier');
  assert.equal(heard.room,Math.max(1,createPlan(p).end-heard.tick),'room runs to the end without a loop');
  const counting=t.timeAt(60000-1000*.6);assert.equal(counting.countIn,true);assert.ok(Math.abs(counting.early-.05)<1e-9,'a press during the count-in reports how early it was');
  assert.equal(heardSeconds({audioSeconds:5,performanceMs:1000},2000),6,'without an output timestamp the context clock is used');
  t.stop();assert.equal(t.timeAt().tps,0,'stopped: nothing is heard');
}
{
  // With a loop, room runs to the loop end.
  let p=createProject({context:ctx,tempo:120});p=setLoop(p,{enabled:true,startTick:0,endTick:3840});
  const f=fakeAudio(),t=createTransport({getProject:()=>p,audio:f.audio,timer:{set:()=>1,clear(){}}});
  await t.play();f.clock.anchor={audioSeconds:100+START_DELAY_SECONDS+1,performanceMs:50000};
  const h=t.timeAt(50000);assert.equal(h.tick,1920);assert.equal(h.room,1920,'a note can last until the loop wraps');
  assert.ok(!f.scheduled.some(v=>v.settings===CLICK.settings),'no clicks unless asked');
  t.stop();
}
console.log('composition-record: ok');
