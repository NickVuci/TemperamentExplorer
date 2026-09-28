import assert from 'node:assert/strict';
import {makeState,mosSizes} from '../dist/engine.mjs';
import {fromCommas,edoTune} from '../dist/tuning.mjs';
import {buildBoard,exportHexboard} from '../dist/hexboard.mjs';
import {createHexboardWorkspace} from '../dist/hexboard-ui.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<.01,`${a} != ${b}`);
const s={...makeState('meantone'),mode:1};
const cfg={base:7,offset:0,style:'bosanquet',rotation:0,mirror:false,center:65,
  register:1,periodWrapping:true,periodPlacement:{column:2,row:-3},copyPeriodStep:1};
const old=buildBoard(s,{...cfg,registerAlignment:'manual'}),fixed=buildBoard(s,cfg);
assert.equal(old.keys[13].degree,12);assert.equal(old.keys[4].degree,13);
assert.equal(old.keys[4].register-old.keys[13].register,1,'Reproduce the mid-scale register jump.');
assert.deepEqual([fixed.keys[13].register,fixed.keys[4].register],[0,0]);
assert.equal(fixed.wrapping.copyPeriodStep,0,'This physical translation is a repeated unison, not an octave.');
assert.deepEqual(fixed.keys.map(k=>k.degree),old.keys.map(k=>k.degree));
assert.deepEqual(fixed.wrapping.vector,old.wrapping.vector);

// Check the musical property over every physical axis, orientation, mode and
// base below: ascending degrees have no register seam until degree N-1 → 0.
let edges=0,wraps=0;
for(const mode of [0,1,5,18])for(const base of [3,5,7,19])
for(let rotation=0;rotation<6;rotation++)for(const mirror of [false,true]) {
  const state={...s,mode},conf={...cfg,base,rotation,mirror,periodPlacement:null};
  const before=structuredClone(state),b=buildBoard(state,conf);
  assert.ok(b.wrapping.aligned);assert.equal(b.wrapping.alignmentIssue,'');
  const raw=buildBoard(state,{...conf,periodWrapping:false});
  for(const key of b.keys.filter(k=>k.enabled)) {
    const m=raw.keys[key.index].m;
    // Known Meantone[19] layout ordering: a period spans 19 degrees,
    // and the generator spans 11 degrees; sounding cents remain unequal.
    assert.equal(key.degree+19*key.register,19*m[0]+11*m[1]);
    for(const next of b.keys.filter(k=>k.enabled)) {
      const dx=next.x-key.x,dy=next.y-key.y;
      if(!(Math.abs(dx)===2&&dy===0||Math.abs(dx)===1&&Math.abs(dy)===1))continue;
      const n=raw.keys[next.index].m,advance=19*(n[0]-m[0])+11*(n[1]-m[1]);
      if(advance!==1)continue;
      assert.equal(next.degree,(key.degree+1)%19);
      assert.equal(next.register-key.register,key.degree===18?1:0);
      assert.ok(next.c>key.c);edges++;if(key.degree===18)wraps++;
    }
  }
  assert.deepEqual(state,before);
}
assert.ok(edges>1000&&wraps>100);

// Reversing a physical copy vector must not reverse scale-order pitch flow.
const reversed=buildBoard(s,{...cfg,periodPlacement:{column:-2,row:3}});
assert.deepEqual(reversed.keys.map(k=>[k.degree,k.c]),fixed.keys.map(k=>[k.degree,k.c]));
const incompatible=buildBoard(s,{...cfg,periodPlacement:{column:8,row:3}});
if(!incompatible.wrapping.aligned)assert.ok(incompatible.wrapping.alignmentIssue);
const mv=buildBoard({...s,n:8,mode:0},{...cfg,periodPlacement:null});
assert.equal(mv.wrapping.aligned,false);assert.match(mv.wrapping.alignmentIssue,/no single linear degree order/);

for(const state of [
  {...makeState('meantone'),...edoTune(makeState('meantone'),31,'18'),n:31},
  ...[fromCommas('245/243','3.5.7'),fromCommas('128/125')].map(t=>({...t,n:mosSizes(t).find(x=>x.mos&&x.n>4).n,mode:1}))
]) {
  const conf={...cfg,style:'period',base:2,periodPlacement:null},b=buildBoard(state,conf);
  assert.ok(b.wrapping.aligned);assert.equal(b.wrapping.overlaps.length,0);
  const out=exportHexboard(state,conf),t=out.file.tuningBundle.tuning;
  for(const row of out.file.tuningBundle.layouts[0].buttonOverrides) {
    const key=b.keys[row.buttonIndex];if(!key.enabled)continue;
    const r=Math.floor(row.stepsFromC/t.cycleLength),d=((row.stepsFromC%t.cycleLength)+t.cycleLength)%t.cycleLength;
    close(r*t.periodCents+(d?t.cents[d-1]:0),key.c);
    close(key.c,key.basePitch+key.register*state.p);
  }
}

const ui=createHexboardWorkspace({getStates:()=>[s],play:()=>{},refresh:()=>{},notify:()=>{},download:()=>{},getHz:()=>220});
const saved=ui.serialize();Object.assign(saved.configs[0],cfg);delete saved.configs[0].registerAlignment;
ui.restore(saved);assert.equal(ui.serialize().configs[0].registerAlignment,'scale','Older sessions pick up corrected alignment.');
assert.match(ui.render(),/Scale order · automatic/);
assert.equal(ui.press({dataset:{hexKey:'4'},closest:()=>null}).register,0);
ui.change({dataset:{hexField:'registerAlignment'},value:'manual'});
assert.equal(ui.serialize().configs[0].copyPeriodStep,0,'Switching to manual preserves the current pitch shift.');
ui.change({dataset:{hexField:'copyPeriodStep'},value:'1'});
assert.equal(ui.press({dataset:{hexKey:'4'},closest:()=>null}).register,old.keys[4].register);
const manual=ui.serialize();ui.restore(manual);assert.deepEqual(ui.serialize(),manual);
ui.change({dataset:{hexField:'registerAlignment'},value:'scale'});
assert.equal(ui.press({dataset:{hexKey:'4'},closest:()=>null}).register,0);
ui.destroy();
console.log(`Scale-order alignment: ${edges} adjacent degree transitions, ${wraps} period boundaries; EDO/non-octave exports, legacy sessions, playback and manual overrides passed.`);
