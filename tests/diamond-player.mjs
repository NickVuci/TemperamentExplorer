import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHexboardPlayer} from '../dist/hexboard-player.mjs';
const handlers={},windowHandlers={},nodes=new Map(),voices=new Set(),presses=[];let select=false,hit,focusCalls=0;
for(const key of ['0:0','1:0','2:0']){
 const node={dataset:{diamondKey:key},playing:false,focus(){focusCalls++;},classList:{toggle(name,on){if(name==='is-playing')node.playing=on;}},closest:selector=>selector==='[data-diamond-key]'?node:null};nodes.set(key,node);
}
hit=nodes.get('0:0');
const doc={addEventListener:(name,fn)=>handlers[name]=fn,querySelector:selector=>nodes.get(selector.match(/"([\d:]+)"/)[1]),elementFromPoint:()=>hit};
const player=createHexboardPlayer({document:doc,window:{addEventListener:(name,fn)=>windowHandlers[name]=fn},selector:'[data-diamond-key]',keyField:'diamondKey',surface:'.tonality-diamond',keyboard:true,focusOnPointer:false,press:n=>{presses.push(n.dataset.diamondKey);return {enabled:!select,track:true,c:Number(n.dataset.diamondKey[0])*100};},startVoice:c=>{voices.add(c);return ()=>voices.delete(c);}});
const fire=(name,args={})=>handlers[name]({target:hit,pointerId:1,pointerType:'mouse',buttons:1,button:0,shiftKey:false,preventDefault(){},stopImmediatePropagation(){},...args});
fire('pointerdown');assert.equal(hit.playing,true);assert.deepEqual([...voices],[0]);
fire('keydown',{key:'Shift'});hit=nodes.get('1:0');fire('pointermove',{shiftKey:true});fire('pointerup',{shiftKey:true});assert.deepEqual([...voices],[0,100]);assert.ok(nodes.get('0:0').playing&&hit.playing);
assert.equal(focusCalls,0,'mouse play and Shift sustain never move keyboard focus or create its blue outline');
fire('keyup',{key:'Shift'});assert.equal(voices.size,0);assert.ok([...nodes.values()].every(n=>!n.playing));
// A selection-only gesture still tracks its current cell: tiny movements cannot
// repeatedly toggle a cell and leave it unexpectedly deselected.
select=true;const before=presses.length;fire('pointerdown');for(let i=0;i<5;i++)fire('pointermove');assert.equal(presses.length,before+1);hit=nodes.get('2:0');fire('pointermove');assert.equal(presses.length,before+2);fire('pointerup');assert.equal(voices.size,0);
select=false;fire('keydown',{key:'Enter',code:'Enter',repeat:false});assert.deepEqual([...voices],[200]);fire('keydown',{key:'Enter',code:'Enter',repeat:true});fire('keyup',{key:'Enter',code:'Enter'});assert.equal(voices.size,0);
fire('pointerdown',{shiftKey:true});windowHandlers.blur();assert.equal(voices.size,0);fire('pointerdown');fire('pointercancel');assert.equal(voices.size,0);fire('pointerdown');doc.hidden=true;fire('visibilitychange');assert.equal(voices.size,0);player.reset();
assert.match(readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8'),/surface:'\.tonality-diamond',keyboard:true,focusOnPointer:false/,'the app enables pointer playing without focus highlighting');
console.log('Diamond drag gates, Shift sustain, stable selection gestures, keyboard notes, blur/cancel/visibility cleanup passed.');
