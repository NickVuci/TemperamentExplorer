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
assert.equal(route([tone(0,[0]),tone(1,[1],{tick:1}),tone(2,[1],{tick:2,coordinate:[0,1],degree:1}),tone(3,[2,4],{tick:3})]).get(3),4,'a repeated note retains the melody line');

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

// Common chord tones stay put even when a different copy would straighten the next shape.
const firstChord=chord.map(t=>({...t,track:'chords'}));
const nextChord=[
 tone(3,[0],{tick:2,coordinate:[0,0],degree:0,cents:0,track:'chords'}),
 tone(4,[2,3],{tick:2,coordinate:[0,1],degree:1,cents:100,track:'chords'}),
 tone(5,[5],{tick:2,coordinate:[0,5],degree:5,cents:300,track:'chords'}),
];
assert.deepEqual([...route(nextChord).values()],[0,2,5],'the next chord alone favors its straight alternative');
assert.equal(route([...firstChord,...nextChord]).get(4),3,'common-tone continuity takes priority over straightness');
const intervening=tone(6,[2,3],{tick:1,coordinate:[0,1],degree:1,cents:100,track:'melody'});
assert.deepEqual([1,6,4].map(i=>route([...firstChord,intervening,...nextChord]).get(i)),[3,3,3],'a melody note between chords keeps their button');
const onlyThere={...intervening,keys:[2],degreeKeys:[2]};
assert.deepEqual([1,6,4].map(i=>route([...firstChord,onlyThere,...nextChord]).get(i)),[2,2,2],'a pitch with one playable button keeps it in every chord');

const fixedFirst=firstChord.map(t=>t.index===1?{...t,keys:[3],degreeKeys:[3]}:t);
const changed=route([...fixedFirst,...nextChord],{played:new Map([[2,1]])});
assert.equal(changed.get(1),3,'completed singleton choices remain fixed');
assert.equal(changed.get(4),2,'an explicit played-button preference overrides prior chord geometry');
const unavailable=nextChord.map(t=>t.index===4?{...t,keys:[2],degreeKeys:[2]}:t);
assert.equal(route([...firstChord,...unavailable]).get(4),2,'an unavailable previous button cannot be retained');

const single=(index,keys,extra={})=>tone(index,keys,{track:'chords',coordinate:[0,0],degree:0,...extra});
assert.equal(route([single(0,[3]),single(1,[1,3],{tick:1})]).get(1),3,'single-note chords retain common tones');
assert.equal(route([single(0,[3]),single(1,[],{tick:1}),tone(3,[1],{tick:1.5,track:'melody'}),single(2,[1,3],{tick:2})]).get(2),3,'a pitch returns to its button after unreachable and melody cues');
assert.equal(route([single(0,[3]),single(1,[1],{tick:1,coordinate:[0,1],degree:1}),single(2,[1,3],{tick:2})]).get(2),3,'a pitch returns to its button after a chord without it');
const mixed=[single(0,[0]),tone(1,[3],{track:'melody',coordinate:[0,1],degree:1,cents:100}),single(2,[1,3],{tick:1,coordinate:[0,1],degree:1})];
assert.equal(route(mixed).get(2),3,'a melody note and a later chord tone of one pitch share a button');
const registerChange=[single(0,[3],{degreeKeys:[3]}),tone(2,[1],{tick:.5,track:'melody'}),single(1,[1,3],{tick:1,coordinate:[1,0],degreeKeys:[1,3]})];
assert.equal(route(registerChange).get(1),1,'exact matching does not treat another register as a common pitch');
assert.equal(route(registerChange,{match:'degree'}).get(1),3,'degree matching retains common tones across registers');

// The whole piece chooses each button: alone, X would take its nearer copy, but its chords with Y favor the other.
const later=(index,tick,keys,coordinate,extra={})=>tone(index,keys,{tick,coordinate,degree:coordinate[1],cents:coordinate[1]*100,...extra});
const x=(index,tick,extra)=>later(index,tick,[1,4],[0,1],extra),y=(index,tick)=>later(index,tick,[5],[0,5],{track:'chords'});
assert.equal(route([tone(0,[0]),x(1,1)]).get(1),1);
const ahead=route([tone(0,[0]),x(1,1),x(2,2,{track:'chords'}),y(3,2),x(4,3,{track:'chords'}),y(5,3),x(6,4,{track:'chords'}),y(7,4)]);
assert.deepEqual([1,2,4,6].map(i=>ahead.get(i)),[4,4,4,4],'later chords decide where a pitch first sounds');
const progression=[...firstChord,intervening,...nextChord];
assert.deepEqual([1,6,4].map(i=>route(progression,{played:new Map([[2,1]])}).get(i)),[2,2,2],'a played button moves every note of its pitch');
assert.deepEqual([...route([...progression].reverse())],[...route(progression)],'progression order is deterministic');
// Buttons chosen for an exact pitch fix it before played buttons and the shared cost; others adapt around them.
const chosen=new Map([['0,1',2]]);
assert.deepEqual([...route(chord,{chosen}).values()],[0,2,4],'a chosen button fixes its pitch');
assert.equal(route(chord,{chosen,played:new Map([[3,1]])}).get(1),2,'a chosen button outranks a played one');
assert.equal(route(chord,{chosen:new Map([['0,1',4]])}).get(1),3,'a choice that does not play the pitch is ignored');
assert.deepEqual([1,6,4].map(i=>route(progression,{chosen}).get(i)),[2,2,2],'a chosen pitch keeps its button throughout');
const octaves=[tone(0,[1],{degree:0,degreeKeys:[1,2,3]}),tone(1,[3],{tick:1,coordinate:[1,0],degree:0,degreeKeys:[1,2,3]})];
assert.deepEqual([...route(octaves,{match:'degree',chosen:new Map([['0,0',1]])}).values()],[1,1],'with any octave, a chosen pitch also places the other registers of its degree');
assert.deepEqual([...route(octaves,{chosen:new Map([['0,0',1]])}).values()],[1,3],'exact matching keeps registers apart');
const wide={keys:[{index:0,x:0,y:0,enabled:true},{index:1,x:2,y:0,enabled:true},{index:2,x:8,y:0,enabled:true},{index:3,x:3,y:1,enabled:true}]};
assert.equal(suggestedRoute([tone(0,[0]),tone(1,[1]),tone(2,[2,3])],wide,{center:0}).get(2),3,'a compact bent chord beats a much wider straight one');
console.log('composition-game-route: passed');
