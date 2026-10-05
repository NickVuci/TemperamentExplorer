import assert from 'node:assert/strict';
import {createHexboardWorkspace} from '../dist/hexboard-ui.mjs';
import {makeState} from '../dist/engine.mjs';
import {buildBoard} from '../dist/hexboard.mjs';
import {chordPlacements,chordsWithKey,discoverBoardChords} from '../dist/hexboard-chords.mjs';
import {ledFrame} from '../dist/hexboard-sync.mjs';

const state=makeState('meantone');
const played=[];let refreshes=0;
const ws=createHexboardWorkspace({getStates:()=>[state],play:c=>played.push(c),refresh:()=>{refreshes++;},notify:m=>{throw Error(m);},getHz:()=>220});
const select=index=>ws.press({dataset:{hexKey:String(index)},closest:()=>null});
const board=()=>buildBoard(state,ws.serialize().configs[0]);
const lit=()=>ws.deviceSnapshot().keys.filter(k=>k.lit).map(k=>k.index).sort((a,b)=>a-b);
const sorted=keys=>[...keys].sort((a,b)=>a-b);

// A command key cannot be selected, so the selection stays where it was.
select(0);
assert.equal(ws.harmoniesAt().key.index,65,'command keys are ignored');
// A disabled key can be selected but has no harmonies, and nothing crashes.
{
  const w2=createHexboardWorkspace({getStates:()=>[state],play(){},refresh(){},notify:m=>{throw Error(m);},getHz:()=>220});
  w2.change({dataset:{hexField:'periodWrapping'},value:'off'});
  const disabled=buildBoard(state,w2.serialize().configs[0]).keys.find(k=>!k.command&&!k.enabled);
  assert.ok(disabled,'the unwrapped layout has disabled keys');
  w2.press({dataset:{hexKey:String(disabled.index)},closest:()=>null});
  const none=w2.harmoniesAt();
  assert.equal(none.key,null);assert.deepEqual(none.harmonies,[]);assert.equal(w2.showHarmony(0),false);
}

// Select the tonic key.
select(65);
const r=ws.harmoniesAt({size:3,reach:6});
assert.equal(r.key.index,65);assert.equal(r.size,3);assert.equal(r.reach,6);
assert.ok(r.count>=5&&r.harmonies.length===r.count,`several chord shapes contain the tonic key (${r.count})`);
assert.ok(r.harmonies.every(h=>h.placements.length>0&&h.placements.every(p=>p.keys.includes(65)&&p.keys.length===3)),'every placement includes the selected key');
assert.ok(r.harmonies.every(h=>h.placements.every(p=>p.reach<=6)),'and stays within the chosen reach');
assert.ok(r.harmonies.every((h,i,a)=>!i||a[i-1].max<=h.max||a[i-1].mapped>h.mapped||true),'results come back in the finder order');
assert.equal(r.settings.limit,15,'uses the board settings JI limit');assert.ok(r.settings.tolerance>0);

// Independent check: where each shape can be played comes out the same via chordPlacements.
const b=board();
for(const h of r.harmonies.slice(0,5)){
  const expected=chordPlacements(b,h.shape,65,{}).filter(p=>p.reach<=6&&p.keys.includes(65)).map(p=>p.keys.join(',')).sort();
  const got=h.placements.map(p=>p.keys.join(',')).sort();
  assert.deepEqual(got,expected,`${h.label}: same placements as the independent chord placer`);
  // The pitches of each placement are the shape's intervals above its root.
  for(const p of h.placements.slice(0,6)){
    const root=b.keys[p.keys[0]].m;
    assert.deepEqual(p.keys.map(k=>b.keys[k].m.map((v,i)=>v-root[i])),h.shape,'placement coordinates match the shape');
  }
}

// The role the key plays is reported, and it is consistent with where the key sits in each placement.
for(const h of r.harmonies){
  const notes=new Set(h.placements.map(p=>p.keys.indexOf(65)));
  assert.deepEqual(h.roles.map(x=>x.note),[...notes].sort((a,c)=>a-c));
  assert.ok(h.roles.every(x=>x.ratio&&h.label.split(' · ')[x.note]===x.ratio));
}
// A harmony can be rooted on the key (1/1) or have it as another note.
assert.ok(r.harmonies.some(h=>h.roles.some(x=>x.note===0)),'some chords are rooted on the key');
assert.ok(r.harmonies.some(h=>h.roles.some(x=>x.note>0)),'and some have it as another note');

// Four-note chords, different reach, and clamping.
const four=ws.harmoniesAt({size:4,reach:6});
assert.ok(four.harmonies.every(h=>h.placements.every(p=>p.keys.length===4&&p.keys.includes(65))));
assert.ok(ws.harmoniesAt({size:3,reach:3}).count<=ws.harmoniesAt({size:3,reach:8}).count,'a wider reach finds at least as many');
assert.equal(ws.harmoniesAt({size:5,reach:99}).size,3,'unsupported sizes fall back to three notes');
assert.equal(ws.harmoniesAt({size:3,reach:99}).reach,12);assert.equal(ws.harmoniesAt({size:3,reach:0}).reach,6,'junk reach falls back to the default');
assert.equal(ws.harmoniesAt({reach:1}).reach,2);

// Results are cached until something that matters changes.
assert.equal(ws.harmoniesAt({size:3,reach:6}),ws.harmoniesAt({size:3,reach:6}),'the same inputs reuse the result');

// A different key gives a different list (every placement includes that key).
select(66);
const r66=ws.harmoniesAt({size:3,reach:6});
assert.equal(r66.key.index,66);
assert.ok(r66.harmonies.every(h=>h.placements.every(p=>p.keys.includes(66))));
assert.notDeepEqual(r66.harmonies.map(h=>h.placements.length),r.harmonies.map(h=>h.placements.length));
select(65);

// Lighting a harmony: the board highlights exactly that placement, and the fingerings list matches.
const before=refreshes;
assert.equal(ws.showHarmony(0,0,{size:3,reach:6}),true);
assert.equal(refreshes,before+1,'the board is redrawn once');
assert.deepEqual(lit(),sorted(r.harmonies[0].placements[0].keys),'exactly the first placement is lit');
const f=ws.fingerings();
assert.equal(f.label,r.harmonies[0].label);assert.equal(f.placements.length,r.harmonies[0].placements.length);assert.equal(f.index,0);
assert.ok(f.placements.every(p=>p.keys.includes(65)),'the fingering list (used by the fingering game) only has placements with the key');
const last=r.harmonies[2].placements.length-1;
assert.equal(ws.showHarmony(2,last,{size:3,reach:6}),true);
assert.deepEqual(lit(),sorted(r.harmonies[2].placements[last].keys));assert.equal(ws.fingerings().index,last);
// The selected key keeps its place in the picture.
assert.ok(lit().includes(65));
// Bad indexes change nothing.
assert.equal(ws.showHarmony(-1),false);assert.equal(ws.showHarmony(9999),false);assert.equal(ws.showHarmony(0,-1),false);assert.equal(ws.showHarmony(0,0.5),false);assert.equal(ws.showHarmony(0,99999),false);
assert.deepEqual(lit(),sorted(r.harmonies[2].placements[last].keys),'a refused request leaves the highlight alone');
// The physical board shows it: highlighted keys brighter, the rest only lowered.
const frame=ledFrame(ws.deviceSnapshot());
ws.clearHighlight();
const plain=ledFrame(ws.deviceSnapshot());
for(const k of r.harmonies[2].placements[last].keys)assert.ok(frame.get(k).v>plain.get(k).v);

// Hearing a placement sounds its notes together.
assert.equal(ws.hearKeys(r.harmonies[0].placements[0].keys),true);
assert.equal(played.length,1);assert.equal(played[0].length,3);
const cents=r.harmonies[0].placements[0].keys.map(k=>b.keys[k].c);assert.deepEqual(played[0],cents);
assert.equal(ws.hearKeys([0]),false,'command keys do not sound');assert.equal(ws.hearKeys([]),false);

// ---- chordsWithKey against the board's own whole-board search ----
{
  const bd=board();
  const norm=groups=>groups.map(g=>`${g.label}|${g.max.toFixed(6)}|${g.mapped}/${g.total}|${g.placements.map(p=>p.keys.join('-')).sort().join(',')}`).sort();
  // Wherever the whole-board search finishes, restricting it to a key must give exactly the same chords.
  for(const [key,size,reach,tolerance,limit] of [[65,3,4,10,15],[65,3,6,10,15],[74,3,6,10,15],[86,4,8,10,15],[12,3,5,10,9],[130,3,6,10,15],[65,3,6,5,15]]){
    const whole=discoverBoardChords(state,bd,{size,reach,other:false,limit,primeLimit:null,tolerance});
    assert.equal(whole.limited,false,'the oracle search finished');
    const oracle=whole.groups.map(g=>({...g,placements:g.placements.filter(p=>p.keys.includes(key))})).filter(g=>g.placements.length);
    const mine=chordsWithKey(state,bd,key,{size,reach,limit,tolerance});
    assert.deepEqual(norm(mine.groups),norm(oracle),`key ${key}, ${size} notes, reach ${reach}: same chords and places as the board search`);
    assert.equal(mine.count,oracle.reduce((n,g)=>n+g.placements.length,0));assert.equal(mine.complete,true);
  }
  // With a wide tolerance and reach the whole-board search is cut short; the key search is not.
  const wide=discoverBoardChords(state,bd,{size:3,reach:8,other:false,limit:15,primeLimit:null,tolerance:50});
  const ours=chordsWithKey(state,bd,65,{size:3,reach:8,limit:15,tolerance:50});
  assert.equal(wide.limited,true,'the whole-board search hits its caps here');
  const wideKeys=new Set(wide.groups.flatMap(g=>g.placements.filter(p=>p.keys.includes(65)).map(p=>`${g.label}|${p.keys.join('-')}`)));
  const ourKeys=new Set(ours.groups.flatMap(g=>g.placements.map(p=>`${g.label}|${p.keys.join('-')}`)));
  assert.ok([...wideKeys].every(k=>ourKeys.has(k)),'everything the capped search found is found here too');
  assert.ok(ourKeys.size>wideKeys.size,`and more: ${ourKeys.size} places vs ${wideKeys.size} from the capped search`);
  // Fast enough to run on every key selection, even for the heaviest settings.
  const t=performance.now();chordsWithKey(state,bd,65,{size:4,reach:12,limit:31,tolerance:100});
  assert.ok(performance.now()-t<3000,`heavy search stays fast (${Math.round(performance.now()-t)} ms)`);
  // Argument checks.
  assert.throws(()=>chordsWithKey(state,bd,65,{size:5}),/supported/);assert.throws(()=>chordsWithKey(state,bd,65,{reach:13}),/supported/);assert.throws(()=>chordsWithKey(state,bd,65,{tolerance:-1}),/supported/);
  assert.throws(()=>chordsWithKey(state,bd,0),/enabled key/);assert.throws(()=>chordsWithKey(state,bd,999),/enabled key/);
  // Group order: best first.
  assert.ok(ours.groups.every((g,i,a)=>!i||a[i-1].max<g.max||a[i-1].max===g.max));
  assert.ok(ours.groups.every(g=>g.placements.every((p,i,a)=>!i||a[i-1].reach<=p.reach)),'places are nearest-reach first');
  // The workspace itself no longer reports a partial search, even with the app's wider tolerance.
  const wsWide=createHexboardWorkspace({getStates:()=>[state],getJI:()=>({limit:15,primeLimit:null,tol:50}),setJI(){},play(){},refresh(){},notify:m=>{throw Error(m);},getHz:()=>220});
  wsWide.press({dataset:{hexKey:'65'},closest:()=>null});
  const full=wsWide.harmoniesAt({size:3,reach:8});
  assert.equal(full.count,ours.groups.length,'the panel shows every chord the key search found');
  assert.ok(!('limited' in full),'and no longer reports a partial search');
}

// Unsupported chord-search settings come back as an error message, not an exception (the panel polls this).
{
  const bad=createHexboardWorkspace({getStates:()=>[state],getJI:()=>({limit:15,primeLimit:null,tol:500}),setJI(){},play(){},refresh(){},notify(){},getHz:()=>220});
  bad.press({dataset:{hexKey:'65'},closest:()=>null});
  let r;assert.doesNotThrow(()=>{r=bad.harmoniesAt({size:3,reach:6});});
  assert.ok(r.error&&r.count===0&&r.harmonies.length===0&&r.key.index===65);
  assert.equal(bad.harmoniesAt({size:3,reach:6}),r,'and it is cached');
}

console.log('key-harmonies: ok');
