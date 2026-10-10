// One HexBoard component: Compose's miniature is Play's picture, and its keys play through the shared
// HexBoard player (hold, release, physical presses) exactly as Play's do.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeState} from '../dist/engine.mjs';
import {buildBoard} from '../dist/hexboard.mjs';
import {createHexboardWorkspace} from '../dist/hexboard-ui.mjs';
import {boardMarkup,compositionDeviceSnapshot} from '../dist/composition-board.mjs';
import {createCompositionWorkspace} from '../dist/composition-ui.mjs';
import {createProject,addEvent} from '../dist/composition-project.mjs';
import {captureContext} from '../dist/composition-context.mjs';

// Per key: everything a viewer sees, leaving out what only an input path reads (classes, data, focus).
const attrs=text=>Object.fromEntries([...text.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
const seen=svg=>[...svg.matchAll(/<g ([^>]*)>([^]*?)<\/g>/g)].map(([,head,body])=>{const a=attrs(head);return {label:a['aria-label'],body};});
for(const [name,patch,n] of [['meantone',{}],['meantone',{flipHorizontal:true,showPeriodLabels:true,palette:'ember',deviceRotation:2}],['diaschismic',{},10],['miracle11',{periodWrapping:false,outside:true}]]){
 const s=makeState(name);if(n)Object.assign(s,{n,mode:0});
 const ws=createHexboardWorkspace({getStates:()=>[s],play(){},refresh(){},notify:m=>{throw Error(m);},getHz:()=>220});
 ws.render();ws.restore({configs:[{...ws.serialize().configs[0],...patch}]});
 const layout=ws.serialize().configs[0],board=buildBoard(s,layout),project={context:captureContext(s,220),layout};
 const play=seen(ws.render().match(/<svg class="hex-board[^]*?<\/svg>/)[0]),mini=seen(boardMarkup(project,board));
 assert.deepEqual(mini,play,`${name}: the Compose board draws every key as Play does`);
 // A shown fingering numbers its tones the same way on both boards.
 const keys=[65,66,74].filter(i=>board.keys[i].enabled);
 ws.showChord(keys.map(i=>board.keys[i].m),'Shown',{exact:true});
 const shown=boardMarkup(project,board,ws.fingerings().placements[0].keys);
 assert.equal((shown.match(/class="hex-chord-tone-label"/g)||[]).length,keys.length,`${name}: chord tones are numbered`);
 // And the physical board gets the same colours from either.
 assert.deepEqual(compositionDeviceSnapshot(project,board,[]).keys.map(k=>[k.color,k.layoutColor]),ws.deviceSnapshot().keys.map(k=>[k.color,k.layoutColor]),`${name}: the physical board gets the same colours`);
}

// A document with real listener lists, so the Compose workspace and its player both receive events.
const listeners=new Map(),nodes=new Map();
const node=id=>{if(!nodes.has(id))nodes.set(id,{dataset:{compKey:String(id)},classList:new Set(),closest(sel){return sel==='[data-comp-key]'?this:null;},focus(){}});const n=nodes.get(id);n.classList.toggle=(c,on)=>on?n.classList.add(c):n.classList.delete(c);return n;};
const doc={activeElement:null,hidden:false,
 querySelector:sel=>{const m=/^\[data-comp-key="(\d+)"\]$/.exec(sel);return m?node(Number(m[1])):null;},
 querySelectorAll:sel=>sel==='[data-comp-key]'?[...nodes.values()]:[],
 addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,[]);listeners.get(type).push(fn);},
 removeEventListener:(type,fn)=>{const list=listeners.get(type)??[];const i=list.indexOf(fn);if(i>=0)list.splice(i,1);}};
const fire=(type,event)=>{for(const fn of [...(listeners.get(type)??[])])fn({preventDefault(){},stopImmediatePropagation(){},button:0,pointerId:1,shiftKey:false,timeStamp:1,...event});};
const voices=[];
const audio={prepare:async()=>{},getClockSnapshot:()=>({audioSeconds:0,state:'running',clockRevision:1}),cancelGroup(){},scheduleVoices(){},previewChord(){},
 startVoice:cents=>{const voice={cents,released:false};voices.push(voice);return ()=>{voice.released=true;};}};
const demo=JSON.parse(await readFile(new URL('./fixtures/composition/phase0-demo.json',import.meta.url),'utf8'));
let fixture=createProject({context:captureContext(demo.musicalContext.state,220),layout:demo.layout});
for(const e of demo.chordEvents)fixture=addEvent(fixture,fixture.clips[0].id,{id:e.id,startTick:e.startTick,durationTick:e.durationTick,velocity:e.velocity,tones:e.tones});
const host={innerHTML:'',querySelector:()=>null};
const compose=createCompositionWorkspace({document:doc,audio,getState:()=>fixture.context.state,getLayout:()=>fixture.layout,getTonic:()=>220,getMaterial:()=>[],getHost:()=>host,raf:null,timer:{set:()=>0,clear(){}}});
compose.restore(fixture);compose.refresh();
const board=buildBoard(fixture.context.state,fixture.layout),key=board.keys.find(k=>k.enabled&&!k.command&&k.index!==65);
fire('pointerdown',{target:node(key.index)});
assert.equal(voices.length,1,'a held Compose key sounds once');assert.equal(voices[0].cents,key.c);
assert.ok(node(key.index).classList.has('is-playing'),'and is lit as playing');
assert.ok(compose.deviceSnapshot().keys[key.index].marked,'the physical board shows it held');
fire('pointerup',{});
assert.equal(voices[0].released,true,'releasing the pointer stops it');
assert.ok(!node(key.index).classList.has('is-playing'));
// A physical key presses the on-screen Compose key through the same player.
assert.equal(compose.pressKey(65,2),true);assert.equal(voices.length,2);assert.equal(voices[1].cents,board.keys[65].c);
compose.releaseKey(65,3);assert.equal(voices[1].released,true);
compose.dispose();
assert.ok([...listeners.values()].every(list=>list.length===0),'disposing removes every Compose and player listener');
console.log('HexBoard view: Compose draws Play’s picture; its keys hold, release and take physical presses through the shared player.');
