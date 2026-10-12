import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {captureContext} from '../src/composition/composition-context.mjs';
import {
  COMPOSITION_FORMAT,LIMITS,PPQ,barTicks,ticksToSeconds,createProject,validateProject,serializeProject,parseProject,
  addEvent,updateEvent,removeEvent,duplicateEvent,insertGap,swapAdjacent,setTempo,setMeter,setLoop,setClipLength,
  contentEndTick,createHistory,makeEvent,allIds,setFingering,
} from '../src/composition/composition-project.mjs';

const demo=JSON.parse(await readFile(new URL('./fixtures/composition/phase0-demo.json',import.meta.url),'utf8'));
const ctx=captureContext(demo.musicalContext.state,220);
const fresh=()=>createProject({name:'Eight bars',context:ctx,layout:demo.layout,tempo:100});

// --- construction ---
const empty=fresh();
assert.equal(empty.format,COMPOSITION_FORMAT);assert.equal(empty.ppq,960);assert.equal(PPQ,960);
assert.deepEqual(empty.tracks.map(t=>t.kind),['chords','melody']);
assert.equal(empty.clips.length,2);assert.equal(empty.revision,0);
assert.equal(barTicks({numerator:4,denominator:4}),3840);assert.equal(barTicks({numerator:6,denominator:8}),2880);
assert.equal(ticksToSeconds({tempo:100},30720),19.2,'eight 4/4 bars at 100 bpm last 19.2 s (fixture derivation)');
assert.equal(empty.context.scale.n,7,'project carries the Create scale actually used');

// --- build the fixture progression + melody through commands ---
function buildDemo(){
  let p=fresh();
  const [chordClip,melodyClip]=p.clips.map(c=>c.id);
  for(const e of demo.chordEvents)p=addEvent(p,chordClip,{id:e.id,startTick:e.startTick,durationTick:e.durationTick,velocity:e.velocity,tones:e.tones});
  for(const e of demo.melodyEvents)p=addEvent(p,melodyClip,{id:e.id,startTick:e.startTick,durationTick:e.durationTick,velocity:e.velocity,tones:[{toneId:e.toneId,coordinate:e.coordinate}]});
  return {p,chordClip,melodyClip};
}
const {p:built,chordClip,melodyClip}=buildDemo();
assert.equal(built.clips[0].events.length,demo.chordEvents.length);
assert.equal(built.clips[1].events.length,demo.melodyEvents.length);
assert.equal(built.revision,demo.chordEvents.length+demo.melodyEvents.length,'each command bumps the revision once');
assert.equal(contentEndTick(built),30720);
assert.equal(ticksToSeconds(built,contentEndTick(built)),19.2);
assert.ok(built.clips[0].events.every((e,i,a)=>!i||a[i-1].startTick<=e.startTick),'events stay sorted');
// No stored tone duplicates a chord elsewhere: each event owns its tones once.
assert.equal(new Set(built.clips.flatMap(c=>c.events.flatMap(e=>e.tones.map(t=>t.toneId)))).size,
  built.clips.flatMap(c=>c.events.flatMap(e=>e.tones)).length);

// --- JSON round trip is semantic and atomic ---
const json=serializeProject(built);
const reopened=parseProject(json);
assert.deepEqual(reopened,built,'round trip preserves context, layout, tracks, events');
assert.equal(reopened.context.state.tuning,built.context.state.tuning,'saved tuning is not re-run by a tuner on open');
assert.deepEqual(parseProject(JSON.parse(json)),built,'accepts a parsed object too');

// --- rejects invalid input without partial results ---
const mutate=fn=>{const c=structuredClone(built);fn(c);return c;};
const rejects=(label,fn,pattern)=>assert.throws(()=>validateProject(mutate(fn)),pattern??/Composition (project|context)/,label);
rejects('float coordinate',c=>{c.clips[0].events[0].tones[0].coordinate=[0.5,1];},/coordinate/);
rejects('huge coordinate',c=>{c.clips[0].events[0].tones[0].coordinate=[10001,0];},/coordinate/);
rejects('signed zero not canonical',c=>{c.clips[0].events[0].tones[0].coordinate=[-0,1];},/signed zero/);
rejects('duplicate event id',c=>{c.clips[1].events[0].id=c.clips[0].events[0].id;},/duplicate id/);
rejects('duplicate tone id',c=>{c.clips[1].events[0].tones[0].toneId=c.clips[0].events[0].tones[0].toneId;},/duplicate id/);
rejects('dangling track reference',c=>{c.clips[0].trackId='nope';},/missing track/);
rejects('event past clip',c=>{c.clips[0].events[0].durationTick=c.clips[0].lengthTick+1;},/past its clip length/);
rejects('zero duration',c=>{c.clips[0].events[0].durationTick=0;},/durationTick/);
rejects('negative start',c=>{c.clips[0].events[0].startTick=-1;},/startTick/);
rejects('fractional tick',c=>{c.clips[0].events[0].startTick=1.5;},/startTick/);
rejects('velocity 0',c=>{c.clips[0].events[0].velocity=0;},/velocity/);
rejects('velocity 128',c=>{c.clips[0].events[0].velocity=128;},/velocity/);
rejects('9 tones',c=>{c.clips[0].events[0].tones=Array.from({length:9},(_,i)=>({toneId:'x'+i,coordinate:[0,i]}));},/tones/);
rejects('no tones',c=>{c.clips[0].events[0].tones=[];},/tones/);
rejects('tempo 19',c=>{c.tempo=19;},/tempo/);
rejects('tempo 401',c=>{c.tempo=401;},/tempo/);
rejects('NaN tempo',c=>{c.tempo=NaN;},/tempo/);
rejects('meter denominator 3',c=>{c.meter.denominator=3;},/meter/);
rejects('meter numerator 33',c=>{c.meter.numerator=33;},/meter/);
rejects('wrong ppq',c=>{c.ppq=480;},/ppq/);
rejects('repeat 129',c=>{c.clips[0].repeat=129;},/repeat/);
rejects('unknown track kind',c=>{c.tracks[0].kind='drums';},/kind/);
rejects('bad wave',c=>{c.sound.wave='noise';},/wave/);
rejects('bad loop',c=>{c.loop={enabled:true,startTick:100,endTick:50};},/loop/);
rejects('context tonic',c=>{c.context.tonicHz=1;},/tonicHz/);
rejects('timeline too long in seconds',c=>{c.tempo=20;c.clips[0].repeat=128;},/seconds|quarter/);
rejects('17 tracks',c=>{c.tracks=Array.from({length:17},(_,i)=>({id:'t'+i,name:'t',kind:'chords',level:1,mute:false,solo:false}));},/tracks/);
const many=mutate(c=>{
  c.clips[0].lengthTick=3840*400;
  c.clips[0].events=Array.from({length:LIMITS.eventsMax+1},(_,i)=>({id:'e'+i,startTick:i,durationTick:1,velocity:90,tones:[{toneId:'t'+i,coordinate:[0,0]}]}));
});
assert.throws(()=>validateProject(many),/more than 16384 events/);
assert.throws(()=>parseProject('{not json'),/not valid JSON/);
assert.throws(()=>parseProject('null'),/expected a JSON object/);
assert.throws(()=>parseProject({...structuredClone(built),format:'temperament-lab-composition-v2'}),/newer app/);
assert.throws(()=>parseProject({...structuredClone(built),format:'something-else'}),/format/);
assert.throws(()=>parseProject('x'.repeat(LIMITS.bytesMax+1)),/exceeds/);
const bigSource=mutate(c=>{c.clips[0].events[0].source={kind:'collection',label:'x'.repeat(LIMITS.bytesMax)};});
assert.throws(()=>serializeProject(bigSource),/serialized size/);
// parse canonicalizes signed zero coming from older/foreign JSON, then validates.
const negZero=JSON.parse(json);negZero.clips[0].events[0].tones[0].coordinate=[-0,1].map(v=>v);
assert.ok(Object.is(parseProject(negZero).clips[0].events[0].tones[0].coordinate[0],0));
assert.equal(parseProject(JSON.stringify({...JSON.parse(json),extra:1})).id,built.id,'unknown extra field is ignored rather than failing');

// --- commands never mutate their input and validate before returning ---
const snap=JSON.stringify(built);
const ev=makeEvent({startTick:0,durationTick:960,tones:[{coordinate:[-0,1]}]},allIds(built));
assert.ok(Object.is(ev.tones[0].coordinate[0],0),'makeEvent canonicalizes signed zero');
const added=addEvent(built,melodyClip,ev);
assert.equal(JSON.stringify(built),snap,'addEvent leaves the source untouched');
assert.equal(added.clips[1].events.length,built.clips[1].events.length+1);
assert.throws(()=>addEvent(built,melodyClip,{...ev,durationTick:0}),/durationTick/);
assert.throws(()=>addEvent(built,'missing',ev),/no clip/);
assert.throws(()=>updateEvent(built,melodyClip,'missing',{}),/no event/);
assert.throws(()=>setTempo(built,500),/tempo/);
assert.equal(JSON.stringify(built),snap);

// growth: an event past the clip end extends it by whole bars
const grown=addEvent(empty,empty.clips[0].id,makeEvent({startTick:3840*8,durationTick:960,tones:[{coordinate:[0,0]}]}));
assert.equal(grown.clips[0].lengthTick,3840*9);

// update / remove / duplicate
const first=built.clips[0].events[0];
const upd=updateEvent(built,chordClip,first.id,{durationTick:1920,velocity:70});
assert.equal(upd.clips[0].events[0].durationTick,1920);assert.equal(upd.clips[0].events[0].velocity,70);
const rem=removeEvent(built,chordClip,first.id);
assert.equal(rem.clips[0].events.length,built.clips[0].events.length-1);
const dup=duplicateEvent(built,chordClip,first.id,3840*8);
const copy=dup.clips[0].events.at(-1);
assert.notEqual(copy.id,first.id);assert.notEqual(copy.tones[0].toneId,first.tones[0].toneId);
assert.deepEqual(copy.tones.map(t=>t.coordinate),first.tones.map(t=>t.coordinate));
assert.equal(dup.clips[0].lengthTick,3840*9);

// insert a rest and reorder (swap) chords
const gap=insertGap(built,chordClip,3840*2,1920);
const starts=gap.clips[0].events.map(e=>e.startTick);
assert.deepEqual(starts.slice(0,3),[0,3840,3840*2+1920]);
const swapped=swapAdjacent(built,chordClip,built.clips[0].events[1].id,-1);
assert.equal(swapped.clips[0].events[0].id,built.clips[0].events[1].id);
assert.equal(swapped.clips[0].events[0].startTick,0);
assert.equal(swapped.clips[0].events[1].startTick,3840);
assert.equal(swapAdjacent(built,chordClip,built.clips[0].events[0].id,-1).clips[0].events[0].id,built.clips[0].events[0].id,'swap at the edge is a no-op');
assert.equal(setMeter(built,{numerator:3,denominator:4}).meter.numerator,3);
assert.deepEqual(setLoop(built,{enabled:true,startTick:0,endTick:3840*4}).loop,{enabled:true,startTick:0,endTick:3840*4});
assert.equal(setClipLength(built,melodyClip,3840*10).clips[1].lengthTick,3840*10);
assert.throws(()=>setClipLength(built,melodyClip,10),/past its clip length/);

// --- history: undo/redo, atomic failure, bounded depth ---
const h=createHistory(empty);
assert.equal(h.canUndo,false);
h.execute('tempo',p=>setTempo(p,120));
h.execute('add',p=>addEvent(p,p.clips[0].id,makeEvent({startTick:0,durationTick:960,tones:[{coordinate:[0,0]}]},allIds(p))));
assert.equal(h.project.tempo,120);assert.equal(h.project.clips[0].events.length,1);
const before=h.project;
assert.throws(()=>h.execute('bad',p=>setTempo(p,9999)),/tempo/);
assert.equal(h.project,before,'a failed command changes nothing');assert.equal(h.depth,2,'and records no history');
h.undo();assert.equal(h.project.clips[0].events.length,0);assert.equal(h.project.tempo,120);
h.undo();assert.equal(h.project.tempo,100);
assert.equal(h.undo(),h.project,'undo at the start is harmless');
h.redo();h.redo();assert.equal(h.project.clips[0].events.length,1);assert.equal(h.canRedo,false);
h.undo();h.execute('new branch',p=>setTempo(p,90));assert.equal(h.canRedo,false,'a new command clears redo');
const deep=createHistory(empty);
for(let i=0;i<LIMITS.undoCommands+25;i++)deep.execute('t',p=>setTempo(p,50+(i%100)));
assert.equal(deep.depth,LIMITS.undoCommands,'history is bounded to 100 commands');
const sized=createHistory(empty,{maxBytes:1});
sized.execute('a',p=>setTempo(p,110));sized.execute('b',p=>setTempo(p,120));
assert.equal(sized.depth,0,'history is bounded by size as well');
const loaded=createHistory(empty);loaded.execute('x',p=>setTempo(p,110));
loaded.reset(built);assert.equal(loaded.canUndo,false);assert.equal(loaded.project,built);

// --- chosen buttons: exact pitch → button on the saved layout, optional, validated and undoable ---
{
  assert.equal('fingering' in built,false,'no buttons are chosen at first');
  const chosen=setFingering(built,[{coordinate:[-0,0],key:65},{coordinate:[-2,4],key:67}]);
  assert.deepEqual(chosen.fingering,{'0,0':65,'-2,4':67});assert.equal(chosen.revision,built.revision+1);
  assert.equal('fingering' in built,false,'the command leaves its input alone');
  assert.deepEqual(parseProject(serializeProject(chosen)).fingering,chosen.fingering,'chosen buttons survive save and open');
  const fewer=setFingering(chosen,[{coordinate:[0,0],key:null},{coordinate:[-2,4],key:68}]);
  assert.deepEqual(fewer.fingering,{'-2,4':68},'a choice can be cleared or replaced');
  assert.equal('fingering' in setFingering(fewer,[{coordinate:[-2,4],key:null}]),false,'clearing the last choice removes the field');
  for(const bad of [[],null,7,{'0,0':-1},{'0,0':1.5},{'0,0':LIMITS.buttonMax+1},{'-0,0':1},{'01,0':1},{x:1},{'0,0,0':1},{[`${LIMITS.coordinateMax+1},0`]:1}])
    assert.throws(()=>validateProject({...chosen,fingering:bad}),/fingering/,`rejects ${JSON.stringify(bad)}`);
  assert.throws(()=>validateProject({...chosen,fingering:Object.fromEntries(Array.from({length:LIMITS.fingeringMax+1},(_,i)=>[`0,${i}`,1]))}),/at most/);
  const history=createHistory(built);history.execute('Choose button',p=>setFingering(p,[{coordinate:[0,0],key:65}]));
  history.undo();assert.equal('fingering' in history.project,false,'choosing a button is one undo step');
}

console.log('composition-project: ok');
