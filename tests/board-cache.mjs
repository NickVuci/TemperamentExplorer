import assert from 'node:assert/strict';
import {createHexboardWorkspace} from '../dist/hexboard-ui.mjs';
import {makeState} from '../dist/engine.mjs';
import {buildBoard,commands} from '../dist/hexboard.mjs';
import {mosLayers,keyColor} from '../dist/hexboard-colors.mjs';

// The device snapshot, fingering list and harmonies panel read the board from a cache.
// After any change to the layout the cached answer must equal a board built from scratch.
const state=makeState('meantone');
const ws=createHexboardWorkspace({getStates:()=>[state],play(){},refresh(){},notify(){},getHz:()=>220});
const press=index=>ws.press({dataset:{hexKey:String(index)},closest:()=>null});

function assertCurrent(label){
  const cfg=ws.serialize().configs[0];
  let fresh;try{fresh=buildBoard(state,cfg);}catch{assert.equal(ws.deviceSnapshot(),null,`${label}: no board, no snapshot`);return;}
  const colors=mosLayers(state,cfg,fresh),snap=ws.deviceSnapshot();
  assert.equal(snap.keys.length,140);
  for(const k of snap.keys){
    const f=fresh.keys[k.index];
    assert.equal(k.command,commands.has(k.index),`${label}: key ${k.index} command`);
    if(k.command)continue;
    assert.equal(k.enabled,!!f.enabled,`${label}: key ${k.index} enabled`);
    assert.deepEqual(k.m,f.m,`${label}: key ${k.index} coordinate`);
    assert.equal(k.c,f.c,`${label}: key ${k.index} cents`);
    if(!k.lit&&!k.dim)assert.equal(k.color,keyColor(f,colors),`${label}: key ${k.index} colour`);
  }
  // The harmonies panel reads the same board.
  press(65);
  const h=ws.harmoniesAt({size:3,reach:6});
  if(h.key)for(const x of h.harmonies.slice(0,3))for(const p of x.placements.slice(0,3))assert.ok(p.keys.every(i=>fresh.keys[i].enabled),`${label}: harmony keys are playable`);
}

assertCurrent('initial');
const changes=[
  ['wrapping off',()=>ws.change({dataset:{hexField:'periodWrapping'},value:'off'})],
  ['wrapping on',()=>ws.change({dataset:{hexField:'periodWrapping'},value:'on'})],
  ['rotation 2',()=>ws.change({dataset:{hexField:'rotation'},value:'2'})],
  ['rotation 5',()=>ws.change({dataset:{hexField:'rotation'},value:'5'})],
  ['device rotation',()=>ws.change({dataset:{hexField:'deviceRotation'},value:'2'})],
  ['register',()=>ws.change({dataset:{hexField:'register'},value:'1'})],
  ['register back',()=>ws.change({dataset:{hexField:'register'},value:'0'})],
  ['style compressed',()=>ws.change({dataset:{hexField:'style'},value:'compressed'})],
  ['style bosanquet',()=>ws.change({dataset:{hexField:'style'},value:'bosanquet'})],
  ['flip horizontal',()=>ws.click({closest:()=>({dataset:{hexToggle:'flipHorizontal'}})},false)],
  ['palette',()=>ws.change({dataset:{hexField:'palette'},value:'ocean'})],
  ['centre key',()=>ws.change({dataset:{hexField:'center'},value:'55'})],
];
for(const [label,apply] of changes){
  try{apply();}catch(e){assert.fail(`${label}: ${e.message}`);}
  assertCurrent(label);
}

// A different temperament or scale must never reuse the old board.
{
  const before=ws.deviceSnapshot().keys.map(k=>k.c).join(',');
  state.n=19;state.mode=0;
  const afterScale=ws.deviceSnapshot();
  assertCurrent('scale 19');
  Object.assign(state,makeState('porcupine11'),{n:15,mode:0});
  assertCurrent('porcupine');
  assert.notEqual(ws.deviceSnapshot().keys.map(k=>k.c).join(','),before,'a new temperament gives new pitches');
  void afterScale;
}

// Reading is repeatable and does not change the answer.
{
  const a=JSON.stringify(ws.deviceSnapshot()),b=JSON.stringify(ws.deviceSnapshot());
  assert.equal(a,b);
}

// The cache is what makes repeated reads cheap.
{
  const t=performance.now();
  for(let i=0;i<400;i++)ws.deviceSnapshot();
  const per=(performance.now()-t)/400;
  assert.ok(per<8,`a snapshot costs ${per.toFixed(2)} ms once the board is cached`);
}

console.log('board-cache: ok');
