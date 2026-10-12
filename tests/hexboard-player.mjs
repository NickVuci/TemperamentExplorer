import assert from 'node:assert/strict';
import {createHexboardPlayer} from '../src/hexboard/hexboard-player.mjs';
const handlers={},windowHandlers={},playing=new Set(),stopped=[],started=[],focused=[],activeChanges=[];
const nodes=[0,1,2].map(i=>({dataset:{hexKey:String(i)},focus:options=>focused.push([i,options]),classList:{toggle:(name,on)=>{if(name==='is-playing'){if(on)playing.add(i);else playing.delete(i);}}}}));
for(const node of nodes)node.closest=()=>node;
let hit=nodes[0];
const doc={addEventListener:(n,f)=>handlers[n]=f,querySelector:s=>nodes[Number(s.match(/"(\d+)"/)[1])],elementFromPoint:()=>hit};
const player=createHexboardPlayer({document:doc,window:{addEventListener:(n,f)=>windowHandlers[n]=f},press:n=>({enabled:n!==nodes[2],c:+n.dataset.hexKey,m:[0,+n.dataset.hexKey]}),startVoice:c=>{started.push(c);return ()=>stopped.push(c);},onActiveNotesChange:notes=>activeChanges.push(notes)});
const fire=(name,extra={})=>handlers[name]({target:hit,button:0,buttons:1,pointerId:1,pointerType:'mouse',shiftKey:false,preventDefault(){},stopImmediatePropagation(){},...extra});
fire('pointerdown');assert.deepEqual(started,[0]);assert.deepEqual(focused,[[0,{preventScroll:true}]]);assert.deepEqual(activeChanges.at(-1).map(n=>[n.id,n.coordinate]),[['0',[0,0]]]);
hit=nodes[1];fire('pointermove');assert.deepEqual(stopped,[0]);assert.deepEqual(started,[0,1]);assert.deepEqual(activeChanges.at(-1).map(n=>[n.id,n.coordinate]),[['1',[0,1]]],'drag publishes one final snapshot without an intermediate empty chord');
fire('pointerup');assert.deepEqual(stopped,[0,1]);assert.equal(playing.size,0);assert.deepEqual(activeChanges.at(-1),[]);
// Shift pressed after note onset must also latch the active note.
hit=nodes[0];fire('pointerdown');fire('keydown',{key:'Shift'});fire('pointerup',{shiftKey:true});assert.equal(playing.size,1);assert.deepEqual(activeChanges.at(-1).map(n=>n.id),['0']);
hit=nodes[1];fire('pointerdown',{shiftKey:true});fire('pointerup',{shiftKey:true});assert.equal(playing.size,2);
assert.deepEqual(activeChanges.at(-1).map(n=>n.id),['0','1']);fire('keyup',{key:'Shift'});assert.equal(playing.size,0);assert.deepEqual(activeChanges.at(-1),[]);
// Disabled notes, ignored Enter/Space keys, cancellation, and blur cleanup.
hit=nodes[2];const count=started.length;fire('pointerdown');assert.equal(started.length,count);fire('pointerup');
hit=nodes[0];const keyboardStartCount=started.length;fire('keydown',{key:'Enter'});fire('keyup',{key:'Enter'});fire('keydown',{key:' '});fire('keyup',{key:' '});assert.equal(started.length,keyboardStartCount);assert.equal(playing.size,0);
let clickPrevented=false,clickStopped=false;fire('click',{preventDefault(){clickPrevented=true;},stopImmediatePropagation(){clickStopped=true;}});assert.ok(clickPrevented&&clickStopped,'focused board keys suppress keyboard-generated clicks');assert.equal(started.length,keyboardStartCount);
fire('pointerdown',{shiftKey:true});windowHandlers.blur();assert.equal(playing.size,0);
fire('pointerdown');fire('pointercancel');assert.equal(playing.size,0);player.reset();
hit=nodes[0];const sameKeyStarts=started.length,sameKeyUpdates=activeChanges.length;fire('pointerdown',{pointerId:10});fire('pointerdown',{pointerId:11});assert.equal(started.length,sameKeyStarts+1);assert.equal(activeChanges.length,sameKeyUpdates+1,'two pointers on one key publish one active note');fire('pointerup',{pointerId:10});assert.equal(playing.size,1);assert.equal(activeChanges.length,sameKeyUpdates+1);fire('pointerup',{pointerId:11});assert.equal(playing.size,0);assert.deepEqual(activeChanges.at(-1),[]);
// Board keys play directly, exactly like a pointer press, and keep any Shift sustain.
player.reset();const boardStarts=started.length;for(const node of nodes)node.closest=sel=>sel==='[hidden]'?null:node;
assert.equal(player.pressKey('1',12),true);assert.equal(started.at(-1),1);assert.equal(started.length,boardStarts+1);assert.deepEqual(activeChanges.at(-1).map(n=>n.id),['1']);
assert.equal(player.pressKey('2'),true,'a disabled on-screen key is still handled here (silently)');assert.equal(started.length,boardStarts+1);
assert.equal(player.releaseKey('1'),true);assert.deepEqual(activeChanges.at(-1),[]);assert.equal(player.releaseKey('1'),false,'an unheld key is not released twice');
fire('keydown',{key:'Shift'});player.pressKey('0');player.releaseKey('0');assert.equal(playing.has(0),true,'Shift sustain holds a board key too');fire('keyup',{key:'Shift'});assert.equal(playing.has(0),false);
nodes[1].closest=sel=>sel==='[hidden]'?{}:nodes[1];assert.equal(player.pressKey('1'),false,'a key that is not on screen is left to the caller');
console.log('Drag transitions, Shift latch/release, disabled keys, ignored Enter/Space, cancellation, blur cleanup and direct board keys passed.');
