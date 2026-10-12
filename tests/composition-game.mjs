// Rhythm game engine: charts from a composition, judging, misses, holds, combo, calibration offset,
// any-register matching, held-together Wait mode and the results summary.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildChart,createGame,gradeFor,WINDOWS,POINTS,HOLD_BONUS,NEAR_MS,INPUT_SLACK_MS} from '../src/composition/composition-game.mjs';
import {createProject,addEvent,parseProject,PPQ} from '../src/composition/composition-project.mjs';
import {captureContext} from '../src/composition/composition-context.mjs';
import {boardSnapshot} from '../src/composition/composition-cues.mjs';

const demo=JSON.parse(await readFile(new URL('./fixtures/composition/phase0-demo.json',import.meta.url),'utf8'));
const ctx=captureContext(demo.musicalContext.state,220);
const deg=d=>ctx.scale.degrees[d].coordinate,up=m=>[m[0]+1,m[1]];
let project=createProject({context:ctx,layout:demo.layout,tempo:120});
const [chordClip,melodyClip]=project.clips.map(c=>c.id);
const note=(id,start,dur,m)=>({id,startTick:start,durationTick:dur,velocity:90,tones:[{toneId:`${id}t`,coordinate:m}]});
for(const e of [note('a',0,480,deg(0)),note('b',480,480,deg(2)),note('c',960,960,deg(4)),note('d',1920,240,deg(0)),note('e',2160,240,deg(0)),note('f',3840+480,480,up(deg(2)))])project=addEvent(project,melodyClip,e);
project=addEvent(project,chordClip,{id:'ch',startTick:0,durationTick:3840,velocity:90,tones:[{toneId:'x',coordinate:deg(0)},{toneId:'y',coordinate:deg(2)},{toneId:'z',coordinate:deg(4)}]});
const TPS=120*PPQ/60;                       // 1920 ticks per second at 120 BPM
const tk=m=>m/1000*TPS;

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
  // Two targets of one pitch 240 ticks (125 ms) apart: a press takes the earliest one still in its
  // window, so a late press for the first never takes the second, although it is nearer.
  r=g.press('h6',deg(0),1920+tk(100));assert.deepEqual([r.target.tick,r.result],[1920,'good'],'a late press keeps to its own note');
  r=g.press('h7',deg(0),2160+tk(5));assert.equal(r.target.tick,2160);
  const kept=g.advance(4320+tk(WINDOWS.good+INPUT_SLACK_MS)-1);
  assert.deepEqual(kept.filter(e=>e.kind==='miss'),[],'nothing is missed inside its window and the input allowance');
  assert.deepEqual(kept.filter(e=>e.kind==='hold').map(e=>[e.target.tick,e.held]),[[960,true]],'a long note still held at its end scores its hold');
  const missed=g.advance(4320+tk(WINDOWS.good+INPUT_SLACK_MS)+1);assert.deepEqual(missed.map(m=>m.target.tick),[4320],'then it is missed');
  assert.equal(g.state().done,true);
  const s=g.summary();
  assert.deepEqual(s.counts,{perfect:2,great:1,good:2,miss:1});
  assert.equal(s.accuracy,(2*100+75+2*40)/6);assert.equal(s.grade,gradeFor(s.accuracy));assert.equal(s.fullCombo,false);
  assert.equal(s.timing.count,5);assert.equal(s.timing.bins.reduce((n,b)=>n+b.count,0),5,'every timed hit lands in the histogram');
  assert.equal(s.weakest[0].bar,2,'the bar with the miss is the weakest');
}
{
  // The right pitch pressed after its note was missed, or just outside its window, is late, never wrong.
  const g=createGame(chart,{tps:TPS});
  assert.equal(g.press('a',deg(0),0).result,'perfect');
  assert.deepEqual(g.advance(480+tk(WINDOWS.good+INPUT_SLACK_MS)+1).map(e=>e.kind),['miss'],'the frame loop records the miss');
  const r=g.press('late',deg(2),480+tk(WINDOWS.good+INPUT_SLACK_MS+20));
  assert.deepEqual([r.kind,r.target.tick],['late',480],'the missed note is late, not wrong');
  assert.equal(g.state().wrong,0);assert.equal(g.targets[1].result,'miss');
  assert.equal(g.press('just',deg(4),960+tk(WINDOWS.good+10)).kind,'late','just outside the window is late before the miss is recorded');
  // A press made inside the window still counts when it is handled after the window has passed.
  const h=createGame(chart,{tps:TPS});
  h.advance(tk(WINDOWS.good+INPUT_SLACK_MS/2));
  assert.equal(h.press('handled-late',deg(0),tk(WINDOWS.good-10)).result,'good');assert.equal(h.state().wrong,0);
}
{
  // A melody note doubling a chord tone (one pitch, one onset) is played by one press, timed once.
  const both=buildChart(project,{part:'both'}),g=createGame(both,{tps:TPS});
  const tonic=both.targets.filter(t=>t.tick===0&&t.coordinate.join()===deg(0).join());
  assert.equal(tonic.length,2,'the melody tonic doubles the chord root');
  const r=g.press('one',deg(0),tk(5));
  assert.deepEqual(r.targets.map(t=>t.result),['perfect','perfect'],'both tones are played');assert.equal(g.state().combo,2);
  assert.ok(tonic.every(t=>g.targets[t.index].result==='perfect'));
  assert.equal(g.targets.filter(t=>Number.isFinite(t.offsetMs)).length,1,'the press is timed once');
  assert.equal(g.release('one',3840).held,true,'the hold follows the longer note');
  assert.deepEqual(g.advance(tk(1000)).filter(e=>e.kind==='miss'&&e.target.coordinate.join()===deg(0).join()),[],'neither tonic is left to miss');
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
  // Any register on an equal-step layout: meantone tuned to 12 EDO on an unwrapped board has keys past the
  // scale's chain of fifths that only sound a degree's pitch class (G♯ for A♭); their coordinate has no
  // degree. Every key offered for a degree is one the judge accepts for it.
  const sample=parseProject(await readFile(new URL('../examples/compositions/01-clockwork-12edo.composition.json',import.meta.url),'utf8'));
  const unwrapped={...sample,layout:{...sample.layout,style:'bosanquet',periodWrapping:false}};
  const cells=boardSnapshot(unwrapped).cells,at=new Map(cells.map(c=>[c.index,c.coordinate]));
  assert.ok(cells.some(c=>c.degree<0),'the board has keys that only sound a degree');
  const edo=buildChart(unwrapped,{part:'both'}),g=createGame(edo,{tps:TPS,match:'degree',context:unwrapped.context});
  assert.ok(edo.targets.every(t=>t.degreeKeys.length&&t.keys.every(k=>t.degreeKeys.includes(k))),'every note keeps its keys');
  for(const t of edo.targets)for(const k of t.degreeKeys)assert.notEqual(g.press(`${t.id}@${k}`,at.get(k),t.tick).kind,'wrong',`key ${k} offered for degree ${t.degree}`);
}
{
  // Wait: all selected parts at one onset form one group; duplicate pitches need one down.
  const both=buildChart(project,{part:'both'}),g=createGame(both,{tps:TPS,mode:'learn'});
  assert.deepEqual(g.pending().map(t=>t.tick),[0,0,0,0],'the melody note and the chord tones that start together');
  assert.equal(g.waiting().required.length,3,'same-onset duplicates share one required pitch');
  g.advance(0);
  assert.equal(g.press('a',deg(4),0).kind,'partial');
  assert.equal(g.press('b',deg(6),0).kind,'wrong');
  for(const m of [deg(0),deg(2)])assert.equal(g.press(`c${m}`,m,0).kind,'partial');
  assert.equal(g.pending().length,4,'no tone is accepted until the entire group is held without extras');
  assert.equal(g.waiting().missing.length,0);assert.equal(g.waiting().extras.length,1);
  const hit=g.release('b',0);
  assert.equal(hit.kind,'learn-hit');assert.equal(hit.result,'ok');assert.equal(hit.targets.length,4,'releasing the final extra accepts every tone in the onset');
  assert.deepEqual(hit.holdIds.sort(),['a',`c${deg(0)}`,`c${deg(2)}`].sort(),'feedback identifies the actual fresh holds, excluding the released extra');
  assert.deepEqual(g.pending().map(t=>t.tick),[480],'then the next notes');
  assert.equal(g.state().score,0);assert.equal(g.state().combo,0,'Wait is unscored');
  assert.deepEqual(g.advance(1e6),[],'nothing is missed while waiting');assert.ok(g.pending().length);
  const s=g.summary();assert.equal(s.learned,4);assert.equal(s.wrong,1);assert.equal(s.accuracy,80);
}

const waitChart=rows=>({from:0,to:Math.max(...rows.map(([tick,endTick])=>endTick)),targets:rows.map(([tick,endTick,coordinate],index)=>({id:`w${index}`,index,tick,endTick,coordinate,keys:[],degreeKeys:[],group:`g${tick}`}))});
const waitGame=(rows,opts={})=>createGame(waitChart(rows),{tps:TPS,mode:'learn',...opts});
{
  // Partial chords must be simultaneous; a released required tone goes missing again.
  const g=waitGame([[0,480,deg(0)],[0,480,deg(2)]]);g.advance(0);
  assert.equal(g.press('a',deg(0),0).kind,'partial');
  assert.deepEqual(g.waiting().missing.map(t=>t.coordinate),[deg(2)]);
  assert.equal(g.release('a',0).kind,'partial');
  assert.equal(g.press('b',deg(2),0).kind,'partial');
  assert.deepEqual(g.waiting().missing.map(t=>t.coordinate),[deg(0)]);
  assert.equal(g.press('c',deg(0),0).kind,'learn-hit');assert.equal(g.state().done,true);assert.equal(g.waiting().tick,null);
}
{
  // A later pitch is a wrong note at the current onset; once those notes are played, the next count at once.
  const g=waitGame([[0,480,deg(0)],[480,960,deg(2)]]);
  assert.equal(g.press('future',deg(2),0).kind,'wrong');
  assert.equal(g.press('now',deg(0),0).kind,'partial');
  assert.deepEqual(g.waiting().extras.map(h=>h.holdId),['future']);
  assert.equal(g.release('future',0).kind,'learn-hit');
  assert.equal(g.targets[1].result,null,'a note held before its turn never counts for it');
  assert.equal(g.press('next',deg(2),0).kind,'learn-hit','the next notes count straight away, with no clock to wait for');
  assert.equal(g.state().wrong,1);assert.equal(g.state().done,true);
}
{
  // No clock: the first notes are due at once, whatever the press time, and nothing is ever early.
  const g=waitGame([[480,960,deg(0)]]);
  assert.equal(g.waiting().tick,480);assert.deepEqual(g.advance(1e6),[],'advancing time changes nothing');
  assert.equal(g.press('a',deg(0),-1e6).kind,'learn-hit');assert.equal(g.state().wrong,0);
}
{
  // Notes already played may stay held through later onsets, whatever their written length.
  const g=waitGame([[0,240,deg(0)],[480,240,deg(2)],[960,1440,deg(4)]]);
  assert.equal(g.press('first',deg(0),0).kind,'learn-hit');
  assert.equal(g.waiting().extras.length,0,'a played note held past its written end is not in the way');
  const next=g.press('second',deg(2),0);assert.equal(next.kind,'learn-hit');
  assert.deepEqual(next.holdIds,['second'],'feedback excludes notes held from earlier onsets');
  assert.equal(g.press('third',deg(4),0).kind,'learn-hit');assert.equal(g.state().done,true);assert.equal(g.state().wrong,0);
}
{
  // Repeated onsets always need a fresh down, even while the previous one is still held.
  const g=waitGame([[0,960,deg(0)],[480,1200,deg(0)],[960,1440,deg(0)]]);
  assert.equal(g.press('first',deg(0),0).kind,'learn-hit');
  assert.equal(g.waiting().missing.length,1);assert.equal(g.waiting().extras.length,0);
  assert.equal(g.press('first',deg(0),0).kind,'partial','a duplicate holdId cannot provide a new articulation');
  assert.equal(g.targets[1].result,null);
  assert.equal(g.press('second',deg(0),0).kind,'learn-hit','a fresh hold of that pitch satisfies the repeated onset');
  assert.equal(g.press('third',deg(0),0).kind,'learn-hit','notes held from earlier onsets never block the next');
  assert.equal(g.state().wrong,0);
}
{
  // A note just played, pressed again (a bouncing key or a double tap), is a repeat as in Timed: it is
  // no wrong note, never counts and never blocks the next notes.
  const g=waitGame([[0,480,deg(0)],[0,480,deg(2)],[0,480,deg(4)],[480,960,deg(1)],[480,960,deg(3)],[960,1440,deg(5)]]);
  for(const [id,m] of [['a',deg(0)],['b',deg(2)]])assert.equal(g.press(id,m,0).kind,'partial');
  assert.equal(g.press('c',deg(4),0).kind,'learn-hit');
  assert.equal(g.release('c',0).kind,'partial');
  assert.equal(g.press('c-bounce',deg(4),0).kind,'repeat','the chord just completed is played again');
  assert.equal(g.state().wrong,0);assert.equal(g.waiting().extras.length,0,'a repeat is not in the way');
  assert.equal(g.press('stray',deg(6),0).kind,'wrong','a pitch neither due nor just played is still wrong');
  g.release('stray',0);
  assert.equal(g.press('d',deg(1),0).kind,'partial');assert.equal(g.press('e',deg(3),0).kind,'learn-hit','the next chord completes as usual');
  assert.equal(g.press('a-again',deg(0),0).kind,'wrong','only the notes just completed repeat');
  g.release('a-again',0);assert.equal(g.press('f',deg(5),0).kind,'learn-hit');
  assert.equal(g.state().wrong,2);assert.equal(g.state().done,true);
}
{
  // Any-register matching is shared with Timed mode and deduplicates octave copies.
  const rows=[[0,480,deg(0)],[0,480,up(deg(0))],[0,480,deg(2)]];
  const strict=waitGame(rows,{context:ctx});strict.advance(0);assert.equal(strict.waiting().required.length,3);
  const loose=waitGame(rows,{match:'degree',context:ctx});loose.advance(0);
  assert.equal(loose.waiting().required.length,2);assert.equal(loose.press('a',up(up(deg(0))),0).kind,'partial');
  const hit=loose.press('b',up(deg(2)),0);assert.equal(hit.kind,'learn-hit');assert.equal(hit.targets.length,3);assert.equal(loose.state().wrong,0);
}
{
  // Pauses clear held input, keeping partial targets pending and requiring fresh downs afterward.
  const g=waitGame([[0,480,deg(0)],[0,480,deg(2)]]);g.advance(0);g.press('a',deg(0),0);
  g.clearHolds();assert.equal(g.waiting().missing.length,2);assert.equal(g.release('a',0),null);
  assert.equal(g.press('b',deg(2),0).kind,'partial');assert.equal(g.press('a',deg(0),0).kind,'learn-hit');
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
