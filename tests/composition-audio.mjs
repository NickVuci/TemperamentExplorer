import assert from 'node:assert/strict';
import {createAudioEngine} from '../dist/audio.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({pending=false,outputTimestamp=null}={}){
  const oscillators=[],waiters=[];let contexts=0;
  const param=()=>{const events=[],p={value:1,events};for(const n of ['setValueAtTime','linearRampToValueAtTime','exponentialRampToValueAtTime','setValueCurveAtTime','cancelScheduledValues'])p[n]=(...a)=>events.push([n,...a]);return p;};
  const context={state:pending?'suspended':'running',currentTime:10,destination:{},
    resume:()=>pending?new Promise(r=>waiters.push(()=>{context.state='running';r();})):Promise.resolve(),
    createOscillator(){const o={frequency:{},starts:[],stops:[],connect(n){this.envelope=n;},disconnect(){},start(at){this.starts.push(at);},stop(at){this.stops.push(at);},end(){this.onended();}};oscillators.push(o);return o;},
    createGain(){return {gain:param(),connect(n){this.target=n;},disconnect(){}};},
    createWaveShaper(){return {connect(n){this.target=n;}};},
    ...(outputTimestamp?{getOutputTimestamp:()=>outputTimestamp}:{}),
  };
  const settings={tonic:220,wave:'triangle'};
  const errors=[];
  const engine=createAudioEngine({createContext:()=>{contexts++;return context;},getSettings:()=>settings,onError:e=>errors.push(e)});
  return {engine,oscillators,context,errors,contexts:()=>contexts,resume:()=>waiters.splice(0).forEach(f=>f())};
}
const gateEvents=o=>o.envelope.target.gain.events;
// A scheduled voice ends naturally with one stop() at release + fade + margin.
const naturalOnly=(o,release)=>o.stops.length===1&&Math.abs(o.stops[0]-(release+.06+.01))<1e-9;
const silenced=(o,at)=>gateEvents(o).some(e=>e[0]==='setValueAtTime'&&e[1]===0&&e[2]===at)&&o.stops.includes(at);
const voice=(id,cents,onset,release,extra={})=>({voiceId:id,cents,onsetAudioSeconds:onset,releaseAudioSeconds:release,velocity:100,...extra});

// Scheduling needs a prepared, running context.
{
  const f=fixture();
  assert.throws(()=>f.engine.scheduleVoices([voice('a',0,11,12)],{groupId:'transport'}),/prepare/);
  assert.throws(()=>f.engine.scheduleVoices([],{}),/groupId/);
  await f.engine.prepare();
  assert.equal(f.engine.scheduleVoices([],{groupId:'transport'}).length,0,'empty sequences are fine');
}

// Pitch and timing come from the project's settings; timing is exact; past voices never burst.
{
  const f=fixture();await f.engine.prepare();
  const tokens=f.engine.scheduleVoices([
    voice('a',0,11,12),voice('b',1200,11,12),voice('c',701.955,11.5,12.5),
    voice('old',0,8,9.5),            // ended before now: skipped
    voice('late',0,9,10.5),          // started before now, still sounding: clamped to now
    voice('quiet',-1e7,11,12),       // inaudible frequency: skipped
  ],{groupId:'transport',settings:{tonic:330,wave:'sine'}});
  assert.deepEqual(tokens.map(t=>t.voiceId),['a','b','c','late']);
  const [a,b,c,late]=f.oscillators;
  assert.equal(a.frequency.value,330);assert.equal(b.frequency.value,660);
  assert.ok(Math.abs(c.frequency.value-330*2**(701.955/1200))<1e-9);
  assert.equal(a.type,'sine','project wave, not the app wave');
  assert.deepEqual(a.starts,[11]);assert.deepEqual(c.starts,[11.5]);
  assert.deepEqual(late.starts,[10],'a note already started is clamped to now, not replayed from the start');
  assert.ok(Math.abs(late.stops[0]-(10.5+.06+.01))<1e-9,'and still ends at its scheduled release');
}

// Velocity and chord size shape the level; no event is louder than the output protector expects.
{
  const f=fixture();await f.engine.prepare();
  f.engine.scheduleVoices([voice('solo',0,11,12,{velocity:100,chordSize:1}),voice('soft',0,11,12,{velocity:50,chordSize:1}),voice('four',0,11,12,{velocity:100,chordSize:4})],{groupId:'transport'});
  const [solo,soft,four]=f.oscillators.map(o=>o.envelope.gain.events.find(e=>e[0]==='linearRampToValueAtTime')[1]);
  assert.ok(Math.abs(soft-solo/2)<1e-12);assert.ok(Math.abs(four-solo/2)<1e-12);
}

// Group isolation: preview, live and transport cancel independently.
{
  const f=fixture();await f.engine.prepare();
  f.engine.scheduleVoices([voice('t1',0,12,14),voice('t2',100,12,14)],{groupId:'transport'});
  const transport=[...f.oscillators];
  const releaseLive=f.engine.startVoice(300);await tick();
  const live=f.oscillators.at(-1);
  assert.equal(await f.engine.previewChord([0,400]),true);
  const preview=f.oscillators.slice(3);
  assert.equal(preview.length,2);
  // A second preview replaces the first preview only.
  f.context.currentTime=10.2;
  assert.equal(await f.engine.previewChord([500]),true);
  assert.ok(preview.every(o=>silenced(o,10.2)||o.envelope.target.gain.events.some(e=>e[0]==='setValueCurveAtTime')),'earlier preview ended');
  assert.ok(transport.every(o=>!gateEvents(o).some(e=>e[0]==='setValueAtTime'&&e[1]===0&&e[2]===10.2)),'transport untouched by preview');
  assert.ok(transport.every(o=>naturalOnly(o,14)),'no early stop on transport voices');
  assert.equal(live.stops.length,0,'live key untouched by preview');
  // Cancelling the transport group silences its future notes but not live or preview sound.
  const stopsBefore=live.stops.length;
  f.engine.cancelGroup('transport');
  assert.ok(transport.every(o=>silenced(o,10.2)),'future transport notes never start');
  assert.equal(live.stops.length,stopsBefore,'live voice not cut by a transport cancel');
  releaseLive();assert.equal(live.stops.length,1);
}

// Stale revision: schedulers holding an old revision cannot start sound after a cancel.
{
  const f=fixture();await f.engine.prepare();
  const first=f.engine.scheduleVoices([voice('a',0,11,12)],{groupId:'transport',revision:0});
  assert.equal(first.length,1);
  f.engine.cancelGroup('transport');
  assert.deepEqual(f.engine.scheduleVoices([voice('b',0,11,12)],{groupId:'transport',revision:0}),[],'old revision is ignored');
  assert.equal(f.engine.scheduleVoices([voice('c',0,11,12)],{groupId:'transport',revision:1}).length,1,'current revision works');
  assert.equal(f.engine.scheduleVoices([voice('d',0,11,12)],{groupId:'other',revision:0}).length,1,'other groups unaffected');
}

// Global stop cancels every group and invalidates their revisions.
{
  const f=fixture();await f.engine.prepare();
  f.engine.scheduleVoices([voice('a',0,12,13)],{groupId:'transport',revision:0});
  f.engine.scheduleVoices([voice('b',0,12,13)],{groupId:'other',revision:0});
  f.engine.stop();
  assert.ok(f.oscillators.every(o=>silenced(o,10)),'all scheduled voices cancelled');
  assert.deepEqual(f.engine.scheduleVoices([voice('c',0,12,13)],{groupId:'transport',revision:0}),[]);
  assert.deepEqual(f.engine.scheduleVoices([voice('c',0,12,13)],{groupId:'other',revision:0}),[]);
}

// Token cancel affects only its own voice and is safe twice or after the voice ended.
{
  const f=fixture();await f.engine.prepare();
  const [one,two]=f.engine.scheduleVoices([voice('one',0,12,13),voice('two',100,12,13)],{groupId:'transport'});
  one.cancel();one.cancel();
  assert.ok(silenced(f.oscillators[0],10));assert.ok(naturalOnly(f.oscillators[1],13),'the other voice is untouched');
  f.oscillators[1].end();two.cancel();
  assert.ok(naturalOnly(f.oscillators[1],13),'cancelling an ended voice does nothing');
}

// cancelRevision targets one revision of one group.
{
  const f=fixture();await f.engine.prepare();
  f.engine.scheduleVoices([voice('r0',0,12,13)],{groupId:'transport',revision:0});
  f.engine.cancelGroup('transport');           // revision becomes 1 (silences r0)
  f.engine.scheduleVoices([voice('r1',0,12,13)],{groupId:'transport',revision:1});
  f.engine.cancelRevision('transport',0);
  assert.ok(naturalOnly(f.oscillators[1],13),'revision 1 voice survives cancelling revision 0');
  f.engine.cancelRevision('transport',1);
  assert.ok(silenced(f.oscillators[1],10));
}

// Pending AudioContext.resume(): stopping first means audio never starts later.
{
  const f=fixture({pending:true});
  const scoped=f.engine.previewChord([0]);
  f.engine.cancelGroup('preview');f.resume();
  assert.equal(await scoped,false);assert.equal(f.oscillators.length,0,'scoped cancel during resume');
  const global=f.engine.previewChord([0]);
  f.engine.stop();f.resume();
  assert.equal(await global,false);assert.equal(f.oscillators.length,0,'global stop during resume');
  const g2=fixture({pending:true});
  const prep=g2.engine.prepare();
  assert.throws(()=>g2.engine.scheduleVoices([voice('a',0,11,12)],{groupId:'transport'}),/prepare/,'not running yet');
  g2.resume();await prep;
  assert.equal(g2.engine.scheduleVoices([voice('a',0,11,12)],{groupId:'transport'}).length,1);
}

// Legacy callers keep their documented behaviour: playChord cuts everything first.
{
  const f=fixture();await f.engine.prepare();
  f.engine.scheduleVoices([voice('a',0,12,13)],{groupId:'transport'});
  f.context.currentTime=10.1;
  await f.engine.playChord([0]);
  assert.ok(silenced(f.oscillators[0],10.1),'legacy playChord still performs a global stop');
}

// Clock snapshots.
{
  const f=fixture();
  assert.deepEqual({...f.engine.getClockSnapshot(),performanceMs:0},{audioSeconds:null,performanceMs:0,state:'none',clockRevision:0});
  await f.engine.prepare();
  const s=f.engine.getClockSnapshot();
  assert.equal(s.audioSeconds,10);assert.equal(s.state,'running');assert.equal(s.clockRevision,1);
  assert.equal(s.anchor.audioSeconds,10);assert.ok(Number.isFinite(s.performanceMs));
  const g=fixture({outputTimestamp:{contextTime:9.9,performanceTime:5000}});await g.engine.prepare();
  assert.deepEqual(g.engine.getClockSnapshot().anchor,{audioSeconds:9.9,performanceMs:5000},'uses the output timestamp when the browser provides one');
  const h=fixture({outputTimestamp:{contextTime:0,performanceTime:0}});await h.engine.prepare();
  assert.equal(h.engine.getClockSnapshot().anchor.audioSeconds,10,'an unset output timestamp falls back to current time');
}

console.log('composition-audio: ok');

// Composition scheduling without overrides follows changes to the central controls.
{
 const f=fixture();await f.engine.prepare();
 f.engine.scheduleVoices([voice('central',1200,11,12)],{groupId:'composition'});
 assert.equal(f.oscillators[0].frequency.value,440);
 assert.equal(f.oscillators[0].type,'triangle');
}
