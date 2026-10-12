import assert from 'node:assert/strict';
import {createHexboardPlayer} from '../src/hexboard/hexboard-player.mjs';

// Logical input seam: every sounding hold reports one down and one up, with the
// exact coordinate captured at onset, a stable holdId and its own source.
function harness({keyboard=false}={}){
  const handlers={},windowHandlers={},events=[];
  const nodes=[0,1,2].map(i=>({dataset:{hexKey:String(i)},focus(){},classList:{toggle(){}}}));
  for(const n of nodes)n.closest=()=>n;
  let hit=nodes[0];
  const doc={addEventListener:(n,f)=>handlers[n]=f,querySelector:s=>nodes[Number(s.match(/"(\d+)"/)[1])],elementFromPoint:()=>hit};
  const info=[{enabled:true,c:0,m:[0,0]},{enabled:true,c:696.6512,m:[0,1]},{enabled:false,c:100,m:[9,9]}];
  createHexboardPlayer({document:doc,window:{addEventListener:(n,f)=>windowHandlers[n]=f,performance:{now:()=>-1}},keyboard,
    press:n=>info[Number(n.dataset.hexKey)],startVoice:()=>()=>{},onInput:e=>events.push(e)});
  const fire=(name,extra={})=>handlers[name]({target:hit,button:0,buttons:1,pointerId:1,pointerType:'mouse',shiftKey:false,timeStamp:0,preventDefault(){},stopImmediatePropagation(){},...extra});
  return {nodes,events,fire,win:windowHandlers,set hit(n){hit=nodes[n];}};
}
const downs=ev=>ev.filter(e=>e.type==='down'),ups=ev=>ev.filter(e=>e.type==='up');

// Click: one down, one up, matching hold, source and timestamps.
{
  const h=harness();
  h.fire('pointerdown',{timeStamp:100});h.fire('pointerup',{timeStamp:350});
  assert.equal(h.events.length,2);
  const [d,u]=h.events;
  assert.deepEqual(d,{type:'down',keyId:'0',holdId:d.holdId,source:'pointer:1',t:100,coordinate:[0,0],cents:0});
  assert.deepEqual({...u,holdId:undefined},{type:'up',keyId:'0',holdId:undefined,source:'pointer:1',t:350,coordinate:[0,0],cents:0,reason:'release'});
  assert.equal(u.holdId,d.holdId);
}

// Drag: leaving a key ends its hold at the move time and starts the next with a new hold.
{
  const h=harness();
  h.fire('pointerdown',{timeStamp:10});h.hit=1;h.fire('pointermove',{timeStamp:60});h.fire('pointerup',{timeStamp:90});
  assert.deepEqual(h.events.map(e=>[e.type,e.keyId,e.t]),[['down','0',10],['up','0',60],['down','1',60],['up','1',90]]);
  assert.notEqual(downs(h.events)[0].holdId,downs(h.events)[1].holdId,'each hold has its own id');
  assert.deepEqual(downs(h.events)[1].coordinate,[0,1]);assert.equal(downs(h.events)[1].cents,696.6512);
}

// Shift sustain: the up is the real release (pedal up), not the finger lift.
{
  const h=harness();
  h.fire('pointerdown',{timeStamp:0,shiftKey:true});h.fire('pointerup',{timeStamp:100,shiftKey:true});
  assert.equal(ups(h.events).length,0,'latched note has not been released');
  h.fire('keyup',{key:'Shift',timeStamp:900});
  assert.equal(ups(h.events).length,1);
  assert.equal(ups(h.events)[0].reason,'release');
  assert.ok(Number.isFinite(ups(h.events)[0].t),'release is stamped');
  assert.equal(ups(h.events)[0].holdId,downs(h.events)[0].holdId);
}

// Disabled keys never produce events.
{
  const h=harness();h.hit=2;h.fire('pointerdown');h.fire('pointerup');
  assert.deepEqual(h.events,[]);
}

// Reset paths (blur, Escape, pointercancel, hidden page) finish every hold exactly once.
for(const [label,act] of [['blur',h=>h.win.blur()],['Escape',h=>h.fire('keydown',{key:'Escape'})],['pointercancel',h=>h.fire('pointercancel')]]){
  const h=harness();
  h.fire('pointerdown',{pointerId:1});h.hit=1;h.fire('pointerdown',{pointerId:2});
  assert.equal(downs(h.events).length,2);
  act(h);
  assert.equal(ups(h.events).length,2,`${label}: no dangling holds`);
  assert.ok(ups(h.events).every(u=>u.reason==='reset'));
  assert.deepEqual(ups(h.events).map(u=>u.holdId).sort(),downs(h.events).map(d=>d.holdId).sort(),`${label}: each up matches a down`);
  act(h);assert.equal(ups(h.events).length,2,`${label}: repeating reset reports nothing more`);
}

// Two pointers on two keys are independent; releasing one never releases the other.
{
  const h=harness();
  h.fire('pointerdown',{pointerId:1,timeStamp:0});h.hit=1;h.fire('pointerdown',{pointerId:2,timeStamp:5});
  assert.deepEqual(downs(h.events).map(e=>e.source),['pointer:1','pointer:2']);
  h.fire('pointerup',{pointerId:1,timeStamp:50});
  assert.deepEqual(ups(h.events).map(e=>e.keyId),['0']);
  h.fire('pointerup',{pointerId:2,timeStamp:80});
  assert.deepEqual(ups(h.events).map(e=>e.keyId),['0','1']);
}

// Two pointers on the same key keep the existing single-voice behaviour: one hold, released when the last lifts.
{
  const h=harness();
  h.fire('pointerdown',{pointerId:1});h.fire('pointerdown',{pointerId:2});
  assert.equal(downs(h.events).length,1);
  h.fire('pointerup',{pointerId:1});assert.equal(ups(h.events).length,0);
  h.fire('pointerup',{pointerId:2});assert.equal(ups(h.events).length,1);
}

// Keyboard source, and keyboard disabled by default.
{
  const h=harness({keyboard:true});
  h.fire('keydown',{key:'Enter',code:'Enter',timeStamp:7});h.fire('keyup',{key:'Enter',code:'Enter',timeStamp:42});
  assert.deepEqual(h.events.map(e=>[e.type,e.source,e.t]),[['down','keyboard:Enter',7],['up','keyboard:Enter',42]]);
  const off=harness();off.fire('keydown',{key:'Enter',code:'Enter'});assert.deepEqual(off.events,[]);
}

// Coordinates are copies captured at onset; consumers cannot alter later events.
{
  const h=harness();
  h.fire('pointerdown');downs(h.events)[0].coordinate[0]=99;h.fire('pointerup');
  assert.deepEqual(ups(h.events)[0].coordinate,[0,0]);
}

// Missing onInput is harmless and the player still behaves as before.
{
  const doc={addEventListener(){},querySelector(){return null;}};
  assert.doesNotThrow(()=>createHexboardPlayer({document:doc,window:{addEventListener(){}},press:()=>null,startVoice:()=>()=>{}}));
}

console.log('composition-input: ok');
