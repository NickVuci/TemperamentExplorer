import assert from 'node:assert/strict';
import {ledFrame,createHexboardSync,LEVEL} from '../dist/hexboard-sync.mjs';
import {hexToLed,BUTTON_COUNT} from '../dist/hexboard-protocol.mjs';
import {buildBoard} from '../dist/hexboard.mjs';
import {makeState} from '../dist/engine.mjs';
import {createHexboardWorkspace} from '../dist/hexboard-ui.mjs';
import {mosLayers,keyColor} from '../dist/hexboard-colors.mjs';

// ---------- frame builder ----------
const key=(index,extra={})=>({index,command:false,enabled:true,color:'#5686df',layoutColor:'#5686df',dim:false,marked:false,lit:false,m:[0,index],c:index*10,...extra});
const keys=Array.from({length:BUTTON_COUNT},(_,i)=>i%20===0?{index:i,command:true,enabled:false,color:null,layoutColor:null,dim:false,marked:false,lit:false}:key(i));
const snap={keys};
const frame=ledFrame(snap);
assert.equal(frame.size,BUTTON_COUNT,'every LED is described');
assert.deepEqual(frame.get(0),{h:0,s:0,v:0},'command keys stay dark');
assert.deepEqual(frame.get(5),hexToLed('#5686df',LEVEL.normal),'a normal key shows its layout colour');
const lit=ledFrame({keys:keys.map(k=>k.index===5?{...k,lit:true,marked:true,color:'#f5c76e'}:k.index===6?{...k,dim:true}:k.index===7?{...k,enabled:false}:k)});
assert.ok(lit.get(5).v>frame.get(5).v,'a highlighted key is brighter');
assert.deepEqual(lit.get(5),hexToLed('#5686df',LEVEL.lit),'a highlighted key keeps its layout colour, at full brightness (not the screen highlight colour)');
assert.ok(lit.get(6).v<frame.get(5).v,'a dimmed key recedes behind a highlight');
assert.equal(lit.get(6).h,frame.get(5).h,'dimming keeps the hue');
assert.deepEqual(lit.get(7),{h:0,s:0,v:0},'a disabled key is dark');
assert.deepEqual(ledFrame(snap,new Set([5])).get(5),{h:0,s:0,v:127},'a sounding key is white');
assert.ok(ledFrame(null).get(10).v===0,'no snapshot means a dark board');
assert.ok(LEVEL.dim<LEVEL.normal&&LEVEL.normal<LEVEL.lit);
assert.ok(hexToLed('#5686df',LEVEL.dim).v>=20,'receded keys stay clearly visible, so the layout never disappears');

// ---------- controller with fakes ----------
function setup({withNode=true,hiddenNode=false}={}){
  const events=[],voices=[],released=[],sentFrames=[],device={connected:true,setLeds:f=>sentFrames.push(f)};
  const nodes=new Map();
  const mkNode=i=>({dataset:{hexKey:String(i)},closest:sel=>sel==='[hidden]'&&hiddenNode?{}:null,dispatchEvent:e=>events.push(['node',e.type,e.pointerId,i])});
  const doc={querySelector:s=>{const i=Number(s.match(/"(\d+)"/)?.[1]);return withNode?(nodes.get(i)??nodes.set(i,mkNode(i)).get(i)):null;},dispatchEvent:e=>events.push(['doc',e.type,e.pointerId])};
  let snapshot=snap;
  const sync=createHexboardSync({document:doc,device,getSnapshot:()=>snapshot,startVoice:c=>{voices.push(c);return ()=>released.push(c);},createEvent:(type,pointerId)=>({type,pointerId})});
  return {sync,events,voices,released,sentFrames,device,set snapshot(v){snapshot=v;}};
}

// On the Play view a board press is a pointer press on the real key, with a pointer id of its own.
{
  const t=setup();
  t.sync.keyDown(65);t.sync.keyDown(65);
  assert.deepEqual(t.events,[['node','pointerdown',1065,65]],'a repeated down is ignored');
  assert.equal(t.voices.length,0,'sound comes from the board player, not from this module');
  assert.deepEqual([...t.sync.held],[65]);
  assert.deepEqual(t.sentFrames.at(-1).get(65),{h:0,s:0,v:127},'the pressed key lights white on the board');
  t.sync.keyDown(66);
  assert.equal(new Set(t.events.map(e=>e[2])).size,2,'two held keys use two pointers, so chords work');
  t.sync.keyUp(65);
  assert.deepEqual(t.events.at(-1),['doc','pointerup',1065],'release is a pointer up for that same pointer');
  assert.deepEqual([...t.sync.held],[66]);
  assert.notDeepEqual(t.sentFrames.at(-1).get(65),{h:0,s:0,v:127},'the light returns to its colour');
  t.sync.keyUp(65);assert.equal(t.events.filter(e=>e[1]==='pointerup').length,1,'releasing an unheld key does nothing');
  t.sync.releaseAll();assert.equal(t.sync.held.size,0);assert.equal(t.events.filter(e=>e[1]==='pointerup').length,2);
}

// Off the Play view (key not on screen) the key sounds directly in the layout's tuning.
for(const opts of [{withNode:false},{hiddenNode:true}]){
  const t=setup(opts);
  t.sync.keyDown(30);
  assert.deepEqual(t.voices,[300],'the key sounds at its layout pitch');
  assert.equal(t.events.length,0);
  t.sync.keyUp(30);assert.deepEqual(t.released,[300],'and releases that same voice');
  t.sync.keyDown(0);t.sync.keyDown(500);
  assert.equal(t.voices.length,1,'command and unknown keys are silent');
  const dis=setup(opts);dis.snapshot={keys:keys.map(k=>k.index===30?{...k,enabled:false}:k)};dis.sync.keyDown(30);
  assert.equal(dis.voices.length,0,'a disabled key is silent');assert.equal(dis.sync.held.size,0);
}

// Mouse-played notes light the board too, merged with the board's own presses.
{
  const t=setup();
  t.sync.setActive([{id:'7'},{id:'8'}]);
  assert.deepEqual([...t.sync.held].sort(),[7,8]);
  assert.deepEqual(t.sentFrames.at(-1).get(7),{h:0,s:0,v:127});
  t.sync.keyDown(9);assert.deepEqual([...t.sync.held].sort((a,b)=>a-b),[7,8,9]);
  t.sync.setActive([{id:'x'},{id:'7'}]);assert.deepEqual([...t.sync.held].sort((a,b)=>a-b),[7,9],'non-key ids are ignored');
}

// Nothing is sent while the board is not connected; sync with no snapshot is harmless.
{
  const t=setup();t.device.connected=false;t.sync.sync();t.sync.setActive([{id:'3'}]);
  assert.equal(t.sentFrames.length,0);
  t.device.connected=true;t.snapshot=null;t.sync.sync();assert.equal(t.sentFrames.length,0);
}

// ---------- the board keeps following the app ----------
{
  const calls=[],ticks=[],cleared=[];
  const device={connected:true,setLeds:(f,o)=>calls.push({size:f.size,force:!!o?.force})};
  let snapshot=snap;
  const timer={set:(fn,ms)=>{ticks.push({fn,ms});return ticks.length;},clear:id=>cleared.push(id)};
  const s=createHexboardSync({document:{},device,getSnapshot:()=>snapshot,startVoice(){},timer});
  assert.equal(s.running,false);
  s.start();s.start();
  assert.equal(ticks.length,2,'starting twice does not double the timers');
  assert.equal(s.running,true);
  assert.deepEqual(ticks.map(t=>t.ms),[100,1500],'the app is polled every 100 ms and the whole picture resent every 1.5 s');
  assert.deepEqual(calls,[{size:140,force:true}],'starting paints the whole board at once');
  ticks[0].fn();assert.deepEqual(calls.at(-1),{size:140,force:false},'the fast tick sends only changes');
  ticks[1].fn();assert.deepEqual(calls.at(-1),{size:140,force:true},'the slow tick resends everything');
  // A change in the app reaches the board on the next tick.
  snapshot={keys:keys.map(k=>k.index===5?{...k,lit:true}:k)};
  const seen=[];device.setLeds=f=>seen.push(f.get(5));ticks[0].fn();
  assert.deepEqual(seen[0],hexToLed('#5686df',LEVEL.lit),'the app change shows on the board');
  s.stop();s.stop();assert.deepEqual(cleared,[1,2],'stopping clears both timers once');assert.equal(s.running,false);
  s.start();assert.equal(ticks.length,4,'it can be started again');
  // Not connected: ticks do nothing.
  device.connected=false;const before=seen.length;ticks[2].fn();assert.equal(seen.length,before);
}

// ---------- the real Play board snapshot feeds the real frame builder ----------
{
  const s=makeState('meantone');
  const ws=createHexboardWorkspace({getStates:()=>[s],play:()=>{},refresh:()=>{},notify:m=>{throw Error(m);},getHz:()=>220});
  const snapshot=ws.deviceSnapshot();
  assert.ok(snapshot,'the board builds');assert.equal(snapshot.keys.length,BUTTON_COUNT);
  const board=buildBoard(s,ws.serialize().configs[0]),colors=mosLayers(s,ws.serialize().configs[0],board);
  for(const k of snapshot.keys){
    const b=board.keys[k.index];
    assert.equal(k.command,!!b.command);assert.equal(k.enabled,!!b.enabled);
    if(!b.command){assert.deepEqual(k.m,b.m);assert.equal(k.c,b.c);assert.equal(k.color,keyColor(b,colors),`key ${k.index} shows the layout colour`);}
    assert.equal(k.dim,false,'nothing is dimmed without a highlight');
  }
  assert.ok(snapshot.keys.filter(k=>k.enabled).length>20);
  // A scale highlight dims the rest and colours its tones, exactly as the screen does.
  const scaleCoords=[[0,0],[-1,2],[-2,4],[1,-1],[0,1],[-1,3],[-2,5]];
  assert.ok(ws.showScale(scaleCoords,'test scale')>0);
  const lit=ws.deviceSnapshot();
  const tones=lit.keys.filter(k=>k.enabled&&k.color==='#83cebe'),others=lit.keys.filter(k=>k.enabled&&k.color!=='#83cebe');
  assert.ok(tones.length>0&&others.length>0);
  assert.ok(tones.every(k=>!k.dim)&&others.every(k=>k.dim),'scale tones stand out, other keys recede');
  const frameLit=ledFrame(lit);
  assert.ok(frameLit.get(tones[0].index).v>frameLit.get(others[0].index).v);
  // A chord highlight marks its keys: root gold, other tones purple.
  ws.clearHighlight();
  ws.showChord([[0,0],[-2,4],[0,1]],'major triad',{exact:true});
  const chord=ws.deviceSnapshot(),marked=chord.keys.filter(k=>k.marked);
  assert.ok(marked.length>=3,`chord keys are marked (${marked.length})`);
  assert.ok(marked.some(k=>k.color==='#f5c76e')&&marked.some(k=>k.color==='#a855ca'),'root gold and other tones purple');
  assert.ok(chord.keys.filter(k=>k.enabled&&!k.marked).every(k=>k.dim),'everything else recedes');
  // The physical board keeps the layout: every key has the same colour with and without the highlight, only brightness changes.
  const plain=(ws.clearHighlight(),ws.deviceSnapshot()),plainFrame=ledFrame(plain);
  ws.showChord([[0,0],[-2,4],[0,1]],'major triad',{exact:true});
  const withChord=ws.deviceSnapshot(),chordFrame=ledFrame(withChord);
  for(const k of withChord.keys.filter(k=>k.enabled)){
    assert.equal(k.layoutColor,plain.keys[k.index].layoutColor,`key ${k.index} keeps its layout colour under a chord`);
    assert.equal(chordFrame.get(k.index).h,plainFrame.get(k.index).h,`key ${k.index} keeps its hue on the LEDs`);
    assert.equal(chordFrame.get(k.index).s,plainFrame.get(k.index).s);
    if(k.lit)assert.ok(chordFrame.get(k.index).v>plainFrame.get(k.index).v,'chord keys are brighter than before');
    else assert.ok(chordFrame.get(k.index).v<plainFrame.get(k.index).v&&chordFrame.get(k.index).v>0,'other keys are lower but still lit');
  }
  assert.ok(withChord.keys.filter(k=>k.lit).length>=3);
  ws.clearHighlight();ws.showScale(scaleCoords,'test scale');
  const withScale=ws.deviceSnapshot(),scaleFrame=ledFrame(withScale);
  for(const k of withScale.keys.filter(k=>k.enabled)){
    assert.equal(scaleFrame.get(k.index).h,plainFrame.get(k.index).h,`key ${k.index} keeps its hue under a scale`);
    if(k.lit)assert.ok(scaleFrame.get(k.index).v>plainFrame.get(k.index).v);else assert.ok(scaleFrame.get(k.index).v<plainFrame.get(k.index).v&&scaleFrame.get(k.index).v>0);
  }
  assert.ok(withScale.keys.some(k=>k.lit)&&withScale.keys.some(k=>k.enabled&&!k.lit));
  ws.clearHighlight();assert.ok(ws.deviceSnapshot().keys.every(k=>!k.dim&&!k.marked&&!k.lit||k.command),'clearing the highlight restores the board');
}

console.log('hexboard-sync: ok');
