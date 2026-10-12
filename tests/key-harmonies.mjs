import assert from 'node:assert/strict';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';
import {makeState} from '../src/core/engine.mjs';
import {buildBoard} from '../src/hexboard/hexboard.mjs';
import {chordPlacements,chordsWithKey,discoverBoardChords} from '../src/hexboard/hexboard-chords.mjs';
import {ledFrame} from '../src/hexboard/hexboard-sync.mjs';
import {createHarmonicCatalogueWorkspace} from '../src/harmonic/harmonic-catalogue-ui.mjs';

const state=makeState('meantone');
const played=[];let refreshes=0;
const ws=createHexboardWorkspace({getStates:()=>[state],play:c=>played.push(c),refresh:()=>{refreshes++;},notify:m=>{throw Error(m);},getHz:()=>220});
const select=index=>ws.press({dataset:{hexKey:String(index)},closest:()=>null});
const board=()=>buildBoard(state,ws.serialize().configs[0]);
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

// The directory's chords on the selected key as the bass, from the real harmony catalogue.
const catalogue=createHarmonicCatalogueWorkspace({getState:()=>state,getPlayState:()=>state,getSettings:()=>({limit:15,primeLimit:null,tol:10})});
catalogue.setEnabled(true);
{const start=Date.now();while(!['complete','incomplete'].includes(catalogue.model().status)){assert.ok(Date.now()-start<20000,'the directory lists');assert.notEqual(catalogue.model().status,'error',catalogue.model().error);await new Promise(r=>setTimeout(r,5));}}
const bassWs=createHexboardWorkspace({getStates:()=>[state],getBassEntries:v=>catalogue.bassEntriesFor(v),play:c=>played.push(c),refresh:()=>{refreshes++;},notify:m=>{throw Error(m);},getHz:()=>220});
const bassSelect=index=>bassWs.press({dataset:{hexKey:String(index)},closest:()=>null});
bassSelect(65);
const r=bassWs.harmoniesAt({size:3,reach:6}),b=board(),tonic=b.keys[65];
assert.equal(r.key.index,65);assert.equal(r.key.degree,0);assert.equal(r.size,3);assert.equal(r.reach,6);assert.equal(r.loading,false);
const directory=r.harmonies.filter(h=>h.source==='directory'),others=r.harmonies.filter(h=>h.source==='layout');
assert.ok(directory.length>=3,`several directory chords stand on the tonic key (${directory.length})`);
assert.ok(directory.some(h=>h.label==='0 - 4:5:6'&&h.role==='root position'),'major in root position, written root - chord');
assert.ok(directory.some(h=>/inversion/.test(h.role)&&!h.label.startsWith('0 - ')),'and inversions of chords rooted on other degrees');
assert.deepEqual(r.harmonies.map(h=>h.source),[...directory.map(()=>'directory'),...others.map(()=>'layout')],'directory chords come first');
// Every place has the selected key as its lowest note, stays within reach, and plays the exact close voicing.
const entries=catalogue.bassEntriesFor({scale:'play',degree:0});
for(const h of r.harmonies){
  assert.ok(h.placements.length>0);
  for(const p of h.placements){
    assert.equal(p.keys[0],65,`${h.label}: the key is the bass`);assert.ok(p.reach<=6);assert.equal(p.keys.length,3);
    assert.ok(p.keys.slice(1).every(k=>b.keys[k].c>tonic.c),'every other note sounds above the bass');
    assert.deepEqual(p.keys.map(k=>b.keys[k].m.map((v,i)=>v-tonic.m[i])),h.shape,'placement coordinates match the shape');
  }
}
for(const h of directory){
  const e=entries.find(x=>x.row.id===h.rowId&&x.member===h.member);
  assert.ok(e,'each directory chord is one of the directory’s bass entries');
  assert.deepEqual(h.shape,e.coords.map(m=>[m[0]-e.coords[0][0],m[1]-e.coords[0][1]]),'its shape is that entry’s close voicing');
  const absolute=h.shape.map(m=>[tonic.m[0]+m[0],tonic.m[1]+m[1]]);
  const expected=chordPlacements(b,absolute,65,{exact:true}).filter(p=>p.keys[0]===65&&p.reach<=6).map(p=>p.keys.join(',')).sort();
  assert.deepEqual(h.placements.map(p=>p.keys.join(',')).sort(),expected,`${h.label}: same places as the independent exact placer`);
}
// Nothing the board-local search finds with this key as the bass is lost: it is a directory chord or listed after them.
{
  const local=chordsWithKey(state,b,65,{size:3,reach:6,limit:15,tolerance:r.settings.tolerance});
  const shapes=new Set(r.harmonies.map(h=>JSON.stringify(h.shape)));
  for(const g of local.groups)if(g.placements.some(p=>p.keys[0]===65))assert.ok(shapes.has(JSON.stringify(g.shape)),`${g.label} with the key lowest is listed`);
  assert.ok(others.every(h=>!directory.some(d=>JSON.stringify(d.shape)===JSON.stringify(h.shape))),'a layout shape is never a duplicate of a directory chord');
  assert.ok(others.every(h=>/^(open voicing of .+|not in the directory)$/.test(h.role)));
}
assert.equal(r.settings.limit,15,'uses the board settings JI limit');assert.ok(r.settings.tolerance>0);

// Sizes, reach and clamping. Five and six notes come from the directory only.
const four=bassWs.harmoniesAt({size:4,reach:6});
assert.ok(four.harmonies.every(h=>h.placements.every(p=>p.keys.length===4&&p.keys[0]===65)));
assert.ok(bassWs.harmoniesAt({size:3,reach:3}).count<=bassWs.harmoniesAt({size:3,reach:8}).count,'a wider reach finds at least as many');
const five=bassWs.harmoniesAt({size:5,reach:12});assert.equal(five.size,5);assert.ok(five.harmonies.every(h=>h.source==='directory'&&h.placements.every(p=>p.keys.length===5&&p.keys[0]===65)));
assert.equal(bassWs.harmoniesAt({size:7,reach:6}).size,3,'unsupported sizes fall back to three notes');
assert.equal(bassWs.harmoniesAt({size:3,reach:99}).reach,12);assert.equal(bassWs.harmoniesAt({size:3,reach:0}).reach,6,'junk reach falls back to the default');
assert.equal(bassWs.harmoniesAt({reach:1}).reach,2);

// Results are cached until something that matters changes.
assert.equal(bassWs.harmoniesAt({size:3,reach:6}),bassWs.harmoniesAt({size:3,reach:6}),'the same inputs reuse the result');

// A different key gives a different list (every placement has that key in the bass).
bassSelect(66);
const r66=bassWs.harmoniesAt({size:3,reach:6});
assert.equal(r66.key.index,66);
assert.ok(r66.harmonies.every(h=>h.placements.every(p=>p.keys[0]===66)));
bassSelect(65);

// While the directory is still listing, the layout's own shapes still show.
{
  const waiting=createHexboardWorkspace({getStates:()=>[state],getBassEntries:()=>null,play(){},refresh(){},notify:m=>{throw Error(m);},getHz:()=>220});
  waiting.press({dataset:{hexKey:'65'},closest:()=>null});
  const w=waiting.harmoniesAt({size:3,reach:6});
  assert.equal(w.loading,true);assert.ok(w.harmonies.length>0&&w.harmonies.every(h=>h.source==='layout'&&h.role==='not in the directory'));
}

// Lighting a harmony: the board highlights exactly that placement, and the fingerings list matches.
const before=refreshes;
assert.equal(bassWs.showHarmony(0,0,{size:3,reach:6}),true);
assert.equal(refreshes,before+1,'the board is redrawn once');
const litOn=()=>bassWs.deviceSnapshot().keys.filter(k=>k.lit).map(k=>k.index).sort((a,c)=>a-c);
assert.deepEqual(litOn(),sorted(r.harmonies[0].placements[0].keys),'exactly the first placement is lit');
const f=bassWs.fingerings();
assert.equal(f.label,r.harmonies[0].label);assert.equal(f.placements.length,r.harmonies[0].placements.length);assert.equal(f.index,0);
assert.ok(f.placements.every(p=>p.keys[0]===65),'the fingering list (used by the fingering game) only has placements with the key in the bass');
const pick=r.harmonies.findIndex(h=>h.placements.length>1),last=r.harmonies[pick].placements.length-1;
assert.equal(bassWs.showHarmony(pick,last,{size:3,reach:6}),true);
assert.deepEqual(litOn(),sorted(r.harmonies[pick].placements[last].keys));assert.equal(bassWs.fingerings().index,last);
assert.ok(litOn().includes(65),'the selected key keeps its place in the picture');
// Bad indexes change nothing.
assert.equal(bassWs.showHarmony(-1),false);assert.equal(bassWs.showHarmony(9999),false);assert.equal(bassWs.showHarmony(0,-1),false);assert.equal(bassWs.showHarmony(0,0.5),false);assert.equal(bassWs.showHarmony(0,99999),false);
assert.deepEqual(litOn(),sorted(r.harmonies[pick].placements[last].keys),'a refused request leaves the highlight alone');
// The physical board shows it: highlighted keys brighter.
const frame=ledFrame(bassWs.deviceSnapshot());
bassWs.clearHighlight();
const plain=ledFrame(bassWs.deviceSnapshot());
for(const k of r.harmonies[pick].placements[last].keys)assert.ok(frame.get(k).v>plain.get(k).v);

// Hearing a placement sounds its notes together.
const heardBefore=played.length;
assert.equal(bassWs.hearKeys(r.harmonies[0].placements[0].keys),true);
assert.equal(played.length,heardBefore+1);assert.equal(played.at(-1).length,3);
assert.deepEqual(played.at(-1),r.harmonies[0].placements[0].keys.map(k=>b.keys[k].c));
assert.equal(bassWs.hearKeys([0]),false,'command keys do not sound');assert.equal(bassWs.hearKeys([]),false);

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
  assert.equal(full.count,ours.groups.filter(g=>g.placements.some(p=>p.keys[0]===65)).length,'the panel shows every shape the key search found with the key as the bass');
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
