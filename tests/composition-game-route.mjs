import assert from 'node:assert/strict';
import {suggestedRoute} from '../dist/composition-game-route.mjs';

const board={keys:[
 {index:0,x:0,y:0,enabled:true},
 {index:1,x:2,y:0,enabled:true},
 {index:2,x:3,y:1,enabled:true},
 {index:3,x:4,y:0,enabled:true},
 {index:4,x:6,y:0,enabled:true},
 {index:5,x:6,y:2,enabled:true},
 {index:6,x:0,y:2,enabled:true,command:true},
 {index:7,x:0,y:4,enabled:false},
]};
const tone=(index,keys,extra={})=>({index,tick:0,cents:index*100,coordinate:[0,index],degree:index,keys,degreeKeys:keys,...extra});
const route=(targets,extra={})=>suggestedRoute(targets,board,{center:0,...extra});

// The closest middle key bends; the whole chord has a slightly wider straight line.
const chord=[tone(0,[0]),tone(1,[2,3]),tone(2,[4])];
assert.deepEqual([...route(chord).values()],[0,3,4]);
// A nearer first pair must not prune the only complete straight fingering.
assert.deepEqual([...route([tone(0,[0]),tone(1,[1,2]),tone(2,[5])]).values()],[0,2,5]);
// Most recently played eligible buttons take priority over shape and distance.
assert.deepEqual([...route(chord,{played:new Map([[3,1],[2,2]])}).values()],[0,2,4]);
assert.deepEqual([...route(chord,{played:new Map([[2,1],[3,2],[7,3]])}).values()],[0,3,4]);

const melody=[tone(0,[0]),tone(1,[1],{tick:1}),tone(2,[2,4],{tick:2})];
assert.deepEqual([...route(melody).values()],[0,1,4],'continue the physical line before taking a closer zigzag');
assert.equal(route(melody,{played:new Map([[2,1]])}).get(2),2,'played buttons also override melody straightness');
assert.equal(route([tone(0,[0]),tone(1,[1],{tick:1}),tone(2,[0,2],{tick:2})]).get(2),0,'a melody can reverse along its line');
assert.equal(route([tone(0,[0]),tone(1,[1],{tick:1}),tone(2,[1],{tick:2}),tone(3,[2,4],{tick:3})]).get(3),4,'a repeated button retains the melody line');

const duplicate=[tone(0,[1,3]),tone(1,[1,3],{coordinate:[0,0],degree:0})];
assert.equal(route(duplicate).get(0),route(duplicate).get(1),'equivalent cue pitches share one suggested button');
const registers=[tone(0,[1],{degree:0,degreeKeys:[2,3]}),tone(1,[4],{degree:0,degreeKeys:[2,3]})];
assert.deepEqual([...route(registers).values()],[1,4],'exact matching preserves register identity');
assert.deepEqual([...route(registers,{match:'degree',played:new Map([[2,1]])}).values()],[2,2],'degree matching shares the preferred button across registers');
assert.equal(route([tone(0,[1],{degree:null,degreeKeys:[2]})],{match:'degree'}).get(0),1,'outside-scale targets keep exact matching');
assert.equal(route([tone(0,[6,7])]).size,0,'commands and disabled keys are unreachable');
assert.equal(route([tone(0,[]),tone(1,[1])]).get(1),1,'unreachable targets do not hide reachable targets');
assert.equal(suggestedRoute(chord,null).size,0);
assert.deepEqual([...route([...melody].reverse())],[...route(melody)],'cue ordering is deterministic');
console.log('composition-game-route: passed');
