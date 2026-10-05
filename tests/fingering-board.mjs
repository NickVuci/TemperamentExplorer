import assert from 'node:assert/strict';
import {createHexboardWorkspace} from '../dist/hexboard-ui.mjs';
import {makeState} from '../dist/engine.mjs';
import {createFingeringGame} from '../dist/fingering-game.mjs';
import {ledFrame} from '../dist/hexboard-sync.mjs';

const state=makeState('meantone');
let refreshes=0;
const ws=createHexboardWorkspace({getStates:()=>[state],play:()=>{},refresh:()=>{refreshes++;},notify:m=>{throw Error(m);},getHz:()=>220});
const litKeys=()=>ws.deviceSnapshot().keys.filter(k=>k.lit).map(k=>k.index).sort((a,b)=>a-b);

// No chord yet.
assert.equal(ws.fingerings(),null);assert.equal(ws.showFingering(0),false);

// A chord on the board exposes its fingerings, nearest the tonic first.
ws.showChord([[0,0],[-2,4],[0,1]],'major triad',{exact:true});
const f=ws.fingerings();
assert.equal(f.label,'major triad');assert.equal(f.source,'finder');
assert.ok(f.placements.length>20,`many fingerings (${f.placements.length})`);
assert.equal(f.index,0);
assert.ok(f.placements.every(p=>p.keys.length===3&&new Set(p.keys).size===3));
const board=ws.deviceSnapshot();
assert.ok(f.placements.every(p=>p.keys.every(k=>board.keys[k].enabled)),'every fingering uses enabled keys');
assert.deepEqual(litKeys(),[...f.placements[0].keys].sort((a,b)=>a-b),'the current fingering is the one lit');
// The fingerings are genuinely different, and each one sounds the same chord pitches (root, third, fifth) by coordinate.
assert.ok(new Set(f.placements.map(p=>p.keys.join(','))).size===f.placements.length);
for(const p of f.placements.slice(0,10)){
  const coords=p.keys.map(k=>board.keys[k].m.join(','));
  assert.equal(new Set(coords).size,3,'three distinct pitches');
}

// Lighting any fingering moves the highlight and asks the app to redraw.
const before=refreshes;
for(const i of [3,7,f.placements.length-1,0]){
  assert.equal(ws.showFingering(i),true);
  assert.deepEqual(litKeys(),[...f.placements[i].keys].sort((a,b)=>a-b),`fingering ${i} is lit`);
  assert.equal(ws.fingerings().index,i);
}
assert.equal(refreshes-before,4,'each change redraws the board once');
assert.equal(ws.showFingering(-1),false);assert.equal(ws.showFingering(f.placements.length),false);assert.equal(ws.showFingering(1.5),false);
assert.equal(ws.fingerings().index,0,'a refused index changes nothing');

// The physical board's picture follows: the lit fingering is brighter, the layout stays.
ws.showFingering(2);
const frame=ledFrame(ws.deviceSnapshot()),plain=(()=>{ws.clearHighlight();return ledFrame(ws.deviceSnapshot());})();
assert.equal(ws.fingerings(),null,'clearing the highlight removes the fingerings');
ws.showChord([[0,0],[-2,4],[0,1]],'major triad',{exact:true});ws.showFingering(2);
const again=ledFrame(ws.deviceSnapshot());
for(const k of f.placements[2].keys)assert.ok(again.get(k).v>plain.get(k).v,`key ${k} is brighter on the board`);
void frame;

// A whole game over the real board, driven only by which keys are held.
{
  ws.clearHighlight();ws.showChord([[0,0],[-2,4],[0,1]],'major triad',{exact:true});
  const game=createFingeringGame({getFingerings:()=>ws.fingerings(),showFingering:i=>ws.showFingering(i)});
  game.start({count:5});
  const seen=[];
  for(let round=0;round<5;round++){
    const lit=litKeys();seen.push(lit.join(','));
    assert.equal(game.state().position,round);
    assert.deepEqual([...game.state().target].sort((a,b)=>a-b),lit,'the game wants exactly the lit keys');
    game.onHeld(new Set(lit));
    game.onHeld(new Set());
  }
  assert.equal(game.state().phase,'done');assert.equal(game.state().played,5);
  assert.equal(new Set(seen).size,5,'five different fingerings were lit');
  assert.deepEqual(litKeys(),[...f.placements[0].keys].sort((a,b)=>a-b),'the original highlight is restored');
  // All of them.
  game.start();assert.equal(game.state().total,f.placements.length);game.stop();
}

// The app runs with harmonic discovery on. A chord placed through the finder (a collected chord
// without harmonic provenance) must still have its fingerings listed and lit.
{
  const wsH=createHexboardWorkspace({getStates:()=>[state],play:()=>{},refresh:()=>{},notify:m=>{throw Error(m);},getHz:()=>220,getHarmonicMode:()=>true});
  assert.equal(wsH.fingerings(),null,'nothing placed yet');
  wsH.showChord([[0,0],[-2,4],[0,1]],'major triad',{exact:true});
  const fh=wsH.fingerings();
  assert.ok(fh,'fingerings are found with harmonic mode on');assert.equal(fh.source,'finder');assert.equal(fh.label,'major triad');
  assert.equal(wsH.showFingering(4),true);
  assert.deepEqual(wsH.deviceSnapshot().keys.filter(k=>k.lit).map(k=>k.index).sort((a,b)=>a-b),[...fh.placements[4].keys].sort((a,b)=>a-b));
  assert.equal(wsH.fingerings().index,4);
}

console.log('fingering-board: ok');
