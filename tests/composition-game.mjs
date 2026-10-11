// Rhythm game engine: charts from a composition, judging, misses, holds, combo, calibration offset,
// any-register matching, Learn mode and the results summary.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildChart,createGame,gradeFor,WINDOWS,POINTS,HOLD_BONUS,NEAR_MS} from '../dist/composition-game.mjs';
import {createProject,addEvent,PPQ} from '../dist/composition-project.mjs';
import {captureContext} from '../dist/composition-context.mjs';

const demo=JSON.parse(await readFile(new URL('./fixtures/composition/phase0-demo.json',import.meta.url),'utf8'));
const ctx=captureContext(demo.musicalContext.state,220);
const deg=d=>ctx.scale.degrees[d].coordinate,up=m=>[m[0]+1,m[1]];
let project=createProject({context:ctx,layout:demo.layout,tempo:120});
const [chordClip,melodyClip]=project.clips.map(c=>c.id);
const note=(id,start,dur,m)=>({id,startTick:start,durationTick:dur,velocity:90,tones:[{toneId:`${id}t`,coordinate:m}]});
for(const e of [note('a',0,480,deg(0)),note('b',480,480,deg(2)),note('c',960,960,deg(4)),note('d',1920,240,deg(0)),note('e',2160,240,deg(0)),note('f',3840+480,480,up(deg(2)))])project=addEvent(project,melodyClip,e);
project=addEvent(project,chordClip,{id:'ch',startTick:0,durationTick:3840,velocity:90,tones:[{toneId:'x',coordinate:deg(0)},{toneId:'y',coordinate:deg(2)},{toneId:'z',coordinate:deg(4)}]});
const TPS=120*PPQ/60;                       // 1920 ticks per second at 120 BPM
const ms=t=>t/TPS*1000,tk=m=>m/1000*TPS;

// ---- charts ----
{
  const melody=buildChart(project,{part:'melody'});
  assert.deepEqual(melody.targets.map(t=>t.tick),[0,480,960,1920,2160,4320],'one target per melody note, in time order');
  assert.ok(melody.targets.every(t=>t.track==='melody'));
  assert.ok(melody.targets[0].keys.length>0,'each target knows the keys that play it');
  const chords=buildChart(project,{part:'chords'});
  assert.equal(chords.targets.length,3,'a chord gives one target per tone');assert.equal(new Set(chords.targets.map(t=>t.group)).size,1,'sharing a group');
  assert.equal(buildChart(project,{part:'both'}).targets.length,9);
  const section=buildChart(project,{part:'melody',from:480,to:1920});
  assert.deepEqual(section.targets.map(t=>[t.tick,t.endTick]),[[480,960],[960,1920]],'a section keeps its notes and cuts their ends');
}

// ---- judging ----
const chart=buildChart(project,{part:'melody'});
{
  const g=createGame(chart,{tps:TPS,meter:project.meter});
  let r=g.press('h1',deg(0),tk(10));assert.deepEqual([r.kind,r.result],['hit','perfect']);assert.ok(Math.abs(r.offsetMs-10)<1e-9);
  r=g.press('h2',deg(2),480+tk(-60));assert.deepEqual([r.kind,r.result],['hit','great'],'60 ms early is Great');assert.ok(r.offsetMs<0);
  r=g.press('h3',deg(4),960+tk(120));assert.equal(r.result,'good','120 ms late is Good');
  assert.equal(g.state().combo,3);
  r=g.press('h4',deg(4),960+tk(10));assert.equal(r.kind,'repeat','pressing a note just played again costs nothing');assert.equal(g.state().wrong,0);assert.equal(g.state().combo,3);
  r=g.press('h4b',up(deg(2)),4320-tk(250));assert.deepEqual([r.kind,r.target.tick],['early',4320],'the right pitch a little too soon is early, not wrong');assert.equal(g.state().combo,3);
  r=g.press('h5',deg(6),1000);assert.equal(r.kind,'wrong','another pitch is a wrong note');assert.equal(g.state().combo,0,'which breaks the combo');assert.equal(g.state().wrong,1);
  // Two targets of one pitch 240 ticks (125 ms) apart: each press takes the nearer one.
  r=g.press('h6',deg(0),2160-tk(30));assert.equal(r.target.tick,2160,'the nearest target of that pitch');
  r=g.press('h7',deg(0),1920+tk(5));assert.equal(r.target.tick,1920);
  const kept=g.advance(4320+tk(WINDOWS.good)-1);
  assert.deepEqual(kept.filter(e=>e.kind==='miss'),[],'nothing is missed inside its window');
  assert.deepEqual(kept.filter(e=>e.kind==='hold').map(e=>[e.target.tick,e.held]),[[960,true]],'a long note still held at its end scores its hold');
  const missed=g.advance(4320+tk(WINDOWS.good)+1);assert.deepEqual(missed.map(m=>m.target.tick),[4320],'then it is missed');
  assert.equal(g.state().done,true);
  const s=g.summary();
  assert.deepEqual(s.counts,{perfect:3,great:1,good:1,miss:1});
  assert.equal(s.accuracy,(3*100+75+40)/6);assert.equal(s.grade,gradeFor(s.accuracy));assert.equal(s.fullCombo,false);
  assert.equal(s.timing.count,5);assert.equal(s.timing.bins.reduce((n,b)=>n+b.count,0),5,'every timed hit lands in the histogram');
  assert.equal(s.weakest[0].bar,2,'the bar with the miss is the weakest');
}
{
  // Holds: a note a quarter or longer scores a hold when kept down to (nearly) its end.
  const g=createGame(chart,{tps:TPS});
  g.press('k',deg(4),960);const before=g.state().score;
  assert.deepEqual(g.release('k',1500),{kind:'hold',target:g.targets[2],held:false},'let go early: no hold');
  assert.equal(g.state().score,before);
  const g2=createGame(chart,{tps:TPS});g2.press('k',deg(4),960);const s0=g2.state().score;
  assert.equal(g2.release('k',1920-tk(WINDOWS.good)+1).held,true,'let go at the end: the hold scores');assert.equal(g2.state().score,s0+HOLD_BONUS);
  const g3=createGame(chart,{tps:TPS});g3.press('k',deg(4),960);
  assert.deepEqual(g3.advance(1921).filter(e=>e.kind==='hold').map(e=>e.held),[true],'still held at the end: it scores then');
  assert.equal(g3.release('k',2000),null,'and the later release adds nothing');
  const g4=createGame(chart,{tps:TPS});g4.press('k',deg(0),0);assert.equal(g4.release('k',100),null,'short notes have no hold');
}
{
  // Combo multiplier and calibration.
  const many={from:0,to:40*480,targets:Array.from({length:40},(_,i)=>({id:`n${i}`,index:i,tick:i*480,endTick:i*480+240,coordinate:deg(0),keys:[],degreeKeys:[],group:`g${i}`}))};
  const g=createGame(many,{tps:TPS});
  for(let i=0;i<20;i++)g.press(`p${i}`,deg(0),i*480);
  assert.equal(g.state().multiplier,2,'×2 after twenty in a row');assert.equal(g.state().score,9*100+10*150+200,'the hit that reaches each ten earns the higher multiplier');
  const late=createGame(many,{tps:TPS,offsetMs:50});
  assert.equal(late.press('q',deg(0),tk(50)).result,'perfect','a calibrated lag is taken off every press');
  assert.equal(createGame(many,{tps:TPS}).press('q',deg(0),tk(50)).result,'great');
}
{
  // Any register: the degree counts, wherever it is played.
  const strict=createGame(chart,{tps:TPS,context:ctx});assert.equal(strict.press('a',up(deg(0)),0).kind,'wrong','exact pitch by default');
  const loose=createGame(chart,{tps:TPS,match:'degree',context:ctx});assert.equal(loose.press('a',up(deg(0)),0).result,'perfect','any register of the degree when asked');
}
{
  // Learn: no timing, the earliest notes still to play; wrong notes are counted.
  const both=buildChart(project,{part:'both'}),g=createGame(both,{tps:TPS,mode:'learn'});
  assert.deepEqual(g.pending().map(t=>t.tick),[0,0,0,0],'the melody note and the chord tones that start together');
  assert.equal(g.press('a',deg(4),99999).result,'ok','timing does not matter');
  assert.equal(g.press('b',deg(6),0).kind,'wrong');
  for(const m of [deg(0),deg(2)])g.press(`c${m}`,m,0);
  assert.equal(g.pending().length,1,'one more to play');g.press('d',deg(0),0);
  assert.deepEqual(g.pending().map(t=>t.tick),[480],'then the next notes');
  assert.deepEqual(g.advance(1e6),[],'nothing is missed while learning');
  const s=g.summary();assert.equal(s.learned,4);assert.equal(s.wrong,1);assert.equal(s.accuracy,80);
}
assert.equal(gradeFor(96),'S');assert.equal(gradeFor(91),'A');assert.equal(gradeFor(80),'B');assert.equal(gradeFor(10),'D');
assert.throws(()=>createGame(chart,{tps:0}),/tps/);
{
  const g=createGame(chart,{tps:TPS});for(const t of chart.targets)g.press(`x${t.id}`,t.coordinate,t.tick);
  const s=g.summary();assert.equal(s.fullCombo,true);assert.equal(s.accuracy,100);assert.equal(s.grade,'S');assert.equal(s.weakest.length,0);
  assert.equal(s.timing.mean,0);
}
assert.ok(NEAR_MS>WINDOWS.good&&POINTS.perfect===100);
console.log('composition-game: ok');
