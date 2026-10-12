import assert from 'node:assert/strict';
import {makeState,scale,mod} from '../src/core/engine.mjs';
import {fromCommas,edoTune} from '../src/core/tuning.mjs';
import {coordinateCents,noteCoordinate} from '../src/core/pitch.mjs';
import {buildBoard,physicalKey,exportHexboard,boardMatches} from '../src/hexboard/hexboard.mjs';
import {placementDelta,validatePeriodPlacement} from '../src/hexboard/hexboard-wrapping.mjs';
import {mosLayers,keyColor} from '../src/hexboard/hexboard-colors.mjs';
import {chordPlacements,discoverBoardChords} from '../src/hexboard/hexboard-chords.mjs';
import {createHexboardWorkspace} from '../src/hexboard/hexboard-ui.mjs';
import {createHexboardPlayer} from '../src/hexboard/hexboard-player.mjs';

const close=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const meantone=makeState('meantone');
const cfg={base:7,offset:0,style:'bosanquet',rotation:0,mirror:false,center:65,
  register:0,deviceRotation:1,outside:false,periodWrapping:true,registerAlignment:'manual'};
const cases=[
  ['meantone',meantone,cfg],
  ['31edo',{...meantone,...edoTune(meantone,31,'18'),n:31},cfg],
  ['MV3',{...meantone,n:8},{...cfg,base:7}],
  ['3/1 period',fromCommas('245/243','3.5.7'),{...cfg,base:2,style:'period'}],
  ['400-cent period',fromCommas('128/125'),{...cfg,base:2,style:'period'}],
];
for(const [name,s,config] of cases) {
  const stateBefore=structuredClone(s),b=buildBoard(s,config),notes=scale(s).notes;
  assert.deepEqual(s,stateBefore,'Placement must not mutate tuning or scale state.');
  assert.equal(b.keys.length,140); assert.equal(b.keys.filter(k=>!k.command).length,133);
  assert.equal(b.wrapping.overlaps.length,0);
  assert.deepEqual(buildBoard(s,config).wrapping.vector,b.wrapping.vector);
  assert.ok(new Set(b.keys.filter(k=>k.enabled).map(k=>k.register)).size>1);
  assert.equal(b.playable,133,'Automatic strips cover every playable button for these scales.');
  const colors=mosLayers(s,config,b),delta=placementDelta(b.wrapping.vector);
  for(const key of b.keys) {
    const geometry=physicalKey(key.index);
    for(const field of ['x','y','row','column','command'])assert.equal(key[field],geometry[field]);
    if(!key.enabled)continue;
    const template=b.wrapping.template[key.degree],note=notes[key.degree];
    assert.deepEqual(key.baseM,noteCoordinate(s,note));
    close(key.c,note.c+key.register*s.p);
    close(key.c,coordinateCents(s,key.m));
    close(key.pc,note.c);
    assert.equal(key.m.length,2);
    assert.equal(key.m[1],note.k);
    assert.equal(key.x,template.x+key.copyRegister*delta.x+key.extensionRegister*b.wrapping.native.x);
    assert.equal(key.y,template.y+key.copyRegister*delta.y+key.extensionRegister*b.wrapping.native.y);
    const same=b.keys.filter(k=>k.enabled&&k.degree===key.degree);
    for(const copy of same) {
      assert.equal(copy.base,key.base);assert.equal(keyColor(copy,colors),keyColor(key,colors));
      close(copy.c-key.c,(copy.register-key.register)*s.p);
      close(mod(copy.pc-key.pc,s.p),0);
    }
  }
  for(const register of [-2,2]) {
    const shifted=buildBoard(s,{...config,register});
    for(const key of b.keys.filter(k=>k.enabled)) {
      const other=shifted.keys[key.index];
      assert.equal(other.degree,key.degree);assert.equal(other.x,key.x);assert.equal(other.y,key.y);
      assert.deepEqual(other.baseM,key.baseM);close(other.c-key.c,register*s.p);
    }
  }
  const exportData=exportHexboard(s,config),tuning=exportData.file.tuningBundle.tuning;
  const overrides=exportData.file.tuningBundle.layouts[0].buttonOverrides;
  for(const key of b.keys.filter(k=>k.enabled)) {
    const step=overrides[key.index].stepsFromC,period=Math.floor(step/tuning.cycleLength);
    const degree=((step%tuning.cycleLength)+tuning.cycleLength)%tuning.cycleLength;
    close(period*tuning.periodCents+(degree?tuning.cents[degree-1]:0),key.c,.01);
    const saved=exportData.file.temperamentLab.coordinates.find(v=>v.button===key.index);
    assert.deepEqual(saved.baseM,key.baseM);assert.equal(saved.register,key.register);
  }
  assert.equal(exportData.file.temperamentLab.layout.periodWrapping,true);
  // Off must be byte-for-byte equivalent to the legacy board object, even
  // when a manual vector is retained in settings for later use.
  assert.deepEqual(buildBoard(s,{...config,periodWrapping:false,periodPlacement:{column:1,row:0}}),
    buildBoard(s,{...config,periodWrapping:undefined}));
  console.log(name+': pitches, geometry, registers, identity, colors, export and Off passed.');
}

// The UI reverses the effective copy vector, including Auto, through the same
// placement path as manual offsets. No tuning or native period axis changes.
for(const [name,s,config] of cases) {
  const stateBefore=structuredClone(s);
  let updates=0;
  const workspace=createHexboardWorkspace({getStates:()=>[s],
    play:()=>{},refresh:()=>updates++,notify:()=>{},download:()=>{},getHz:()=>220});
  const saved=workspace.serialize();Object.assign(saved.configs[0],config);
  workspace.restore(saved);workspace.change({dataset:{hexField:'periodWrapping'},value:'on'});
  const before=buildBoard(s,workspace.serialize().configs[0]);
  const reverse=()=>workspace.click({closest:()=>({dataset:{hexAction:'period-reverse'}})});
  reverse();assert.ok(updates>1);
  const reversedConfig=workspace.serialize().configs[0],after=buildBoard(s,reversedConfig);
  assert.deepEqual(after.wrapping.vector,{column:-before.wrapping.vector.column||0,row:-before.wrapping.vector.row||0});
  assert.deepEqual(after.wrapping.native,before.wrapping.native);
  for(const key of before.keys.filter(k=>k.enabled&&after.keys[k.index].enabled)) {
    const other=after.keys[key.index];assert.equal(other.degree,key.degree);
    close(other.copyRegister,-key.copyRegister);
    close(other.c-key.c,-2*key.copyRegister*s.p);
    close(workspace.press({dataset:{hexKey:String(key.index)},closest:()=>null}).c,other.c);
  }
  const session=JSON.parse(JSON.stringify(workspace.serialize()));workspace.restore(session);
  assert.deepEqual(workspace.serialize(),session);
  reverse();assert.deepEqual(buildBoard(s,workspace.serialize().configs[0]).keys,before.keys);
  workspace.click({closest:()=>({dataset:{hexAction:'period-auto'}})});
  assert.equal(workspace.serialize().configs[0].periodPlacement,null);
  assert.deepEqual(s,stateBefore);
  console.log(name+': reverse direction, audio pitch, double reverse, save/restore and Auto passed.');
}

// Signed copy pitch shifts preserve physical degree placement and use the
// actual temperament period in audio coordinates and the hardware export.
for(const [name,s,config] of cases) {
  const normal=buildBoard(s,config),stateBefore=structuredClone(s);
  for(const step of [-2,-1,0,2]) {
    const conf={...config,copyPeriodStep:step},board=buildBoard(s,conf);
    assert.deepEqual(board.wrapping.vector,normal.wrapping.vector);
    assert.ok(board.playable>0,name+' must retain playable copies');
    const colors=mosLayers(s,conf,board),oldColors=mosLayers(s,config,normal);
    for(const key of board.keys.filter(k=>k.enabled)) {
      const old=normal.keys[key.index];assert.equal(key.degree,old.degree);
      assert.equal(key.copyRegister,old.copyRegister);
      assert.equal(key.extensionRegister,old.extensionRegister);
      assert.equal(keyColor(key,colors),keyColor(old,oldColors));
      close(key.c-old.c,key.copyRegister*(step-1)*s.p);
      close(key.c,coordinateCents(s,key.m));
      assert.equal(key.copyPeriods,key.copyRegister*step);
    }
    const out=exportHexboard(s,conf),t=out.file.tuningBundle.tuning;
    for(const row of out.file.tuningBundle.layouts[0].buttonOverrides) {
      const key=board.keys[row.buttonIndex];if(!key.enabled)continue;
      const register=Math.floor(row.stepsFromC/t.cycleLength),degree=mod(row.stepsFromC,t.cycleLength);
      close(register*t.periodCents+(degree?t.cents[degree-1]:0),key.c,.01);
    }
    assert.equal(out.file.temperamentLab.layout.copyPeriodStep,step);
  }
  assert.deepEqual(s,stateBefore);
}

for(let rotation=0;rotation<6;rotation++)for(const mirror of [false,true]) {
  const b=buildBoard(meantone,{...cfg,rotation,mirror});
  assert.equal(b.wrapping.overlaps.length,0);
  for(const key of b.keys.filter(k=>k.enabled))close(key.c,scale(meantone).notes[key.degree].c+key.register*meantone.p);
}
const automatic=buildBoard(meantone,cfg);
const duplicates=automatic.keys.filter(k=>k.enabled);
const duplicate=duplicates.find(k=>duplicates.some(other=>other.index!==k.index&&other.m.join()===k.m.join()));
assert.ok(duplicate,'Wrapping plus native extension provides repeated sounding notes.');
const twin=duplicates.find(k=>k.index!==duplicate.index&&k.m.join()===duplicate.m.join());
assert.notEqual(duplicate.copyRegister,twin.copyRegister);
assert.notEqual(duplicate.extensionRegister,twin.extensionRegister);
assert.equal(duplicate.register,twin.register);close(duplicate.c,twin.c);
// Native period continuation survives on either side of every wrapped strip.
for(const key of duplicates)for(const direction of [-1,1]){
  const other=duplicates.find(k=>k.x===key.x+direction*automatic.wrapping.native.x&&k.y===key.y+direction*automatic.wrapping.native.y);
  if(other){assert.equal(other.degree,key.degree);assert.equal(other.copyRegister,key.copyRegister);close(other.c-key.c,direction*meantone.p);}
}
const manualConfig={...cfg,periodPlacement:{column:4,row:-3}},manual=buildBoard(meantone,manualConfig);
assert.equal(manual.wrapping.manual,true);assert.equal(manual.wrapping.overlaps.length,0);
assert.ok(manual.keys.some(k=>k.enabled&&k.register<0));
assert.ok(manual.keys.some(k=>k.enabled&&k.register>0));
assert.notDeepEqual(manual.keys.filter(k=>k.enabled).map(k=>[k.index,k.degree]),automatic.keys.filter(k=>k.enabled).map(k=>[k.index,k.degree]));
for(const key of manual.keys.filter(k=>k.enabled)) {
  const original=automatic.keys.find(k=>k.enabled&&k.degree===key.degree&&k.copyRegister===key.copyRegister&&k.extensionRegister===key.extensionRegister);
  if(original){assert.deepEqual(key.m,original.m);assert.deepEqual(key.baseM,original.baseM);close(key.c,original.c);}
}
const reversed=buildBoard(meantone,{...cfg,periodPlacement:{column:-4,row:3}});
for(const key of manual.keys.filter(k=>k.enabled)) {
  const other=reversed.keys[key.index];
  assert.equal(other.degree,key.degree);close(other.copyRegister,-key.copyRegister);
  close(other.c,key.basePitch+(key.extensionRegister-key.copyRegister)*meantone.p);
}
for(const vector of [{column:0,row:0},{column:1.5,row:0},{column:Infinity,row:0},{column:1001,row:0}])
  assert.throws(()=>validatePeriodPlacement(vector),/placement|integer/);
const conflictConfig={...cfg,periodPlacement:{column:1,row:0}},conflicted=buildBoard(meantone,conflictConfig);
assert.ok(conflicted.wrapping.overlaps.length);
for(const overlap of conflicted.wrapping.overlaps) {
  const k=conflicted.keys[overlap.button];assert.equal(k.enabled,false);assert.ok(k.placements.length>1);
}
assert.throws(()=>exportHexboard(meantone,conflictConfig),/overlapping period copies/);
const native=automatic.wrapping.native,nativeVector={column:(native.x-native.y)/2,row:native.y};
const parallel=buildBoard(meantone,{...cfg,periodPlacement:nativeVector});
assert.equal(parallel.wrapping.overlaps.length,0,'Identical native/copy displacement assigns only one pitch.');
const opposed=buildBoard(meantone,{...cfg,periodPlacement:{column:-nativeVector.column,row:-nativeVector.row}});
assert.ok(opposed.wrapping.overlaps.length,'Opposed parallel displacements expose ambiguous pitches.');
assert.equal(buildBoard(meantone,{...cfg,periodPlacement:{column:-nativeVector.column,row:-nativeVector.row},copyPeriodStep:-1}).wrapping.overlaps.length,0,
  'A negative copy pitch shift makes opposing parallel placement agree with the native period axis.');
assert.ok(buildBoard(meantone,{...cfg,periodPlacement:nativeVector,copyPeriodStep:-1}).wrapping.overlaps.length,
  'Parallel displacements with conflicting pitch shifts remain visibly disabled.');
assert.equal(buildBoard(meantone,{...cfg,outside:true}).playable,automatic.playable,'Wrapping plays selected degrees only.');

// Chord voicing and period transposition remain two-coordinate identities.
const chord=[[0,0],[-2,4],[0,1]],placements=chordPlacements(automatic,chord);
assert.ok(placements.length>1);
assert.ok(placements.some(p=>placements.some(other=>p.keys[0]===other.keys[0]&&p.keys.join()!==other.keys.join())),
  'Chord placement keeps alternate physical buttons for the same voiced notes.');
for(const p of placements) {
  const keys=p.keys.map(i=>automatic.keys[i]);
  keys.forEach((k,i)=>close(k.c-keys[0].c,coordinateCents(meantone,chord[i])-coordinateCents(meantone,chord[0])));
}
assert.ok(discoverBoardChords(meantone,automatic,{reach:6}).groups.length);
const root=automatic.keys.find(k=>k.enabled&&k.degree===0),matches=boardMatches(meantone,automatic,root.index);
for(const key of automatic.keys.filter(k=>k.enabled)) {
  const copy=automatic.keys.find(k=>k.enabled&&k.degree===key.degree&&k.index!==key.index);
  if(copy) {
    close(matches[key.index].c,matches[copy.index].c);
    assert.deepEqual(matches[key.index].mapped.map(t=>t.label),matches[copy.index].mapped.map(t=>t.label));
  }
}

let refreshes=0,played=[],notifications=[];
const ui=createHexboardWorkspace({getStates:()=>[meantone],
  play:p=>played.push(p),refresh:()=>refreshes++,notify:t=>notifications.push(t),download:()=>{},getHz:()=>220});
assert.match(ui.render(),/Period Wrapping/);
assert.equal(ui.serialize().configs[0].periodWrapping,true);
ui.change({dataset:{hexField:'periodWrapping'},value:'on'});
ui.change({dataset:{hexField:'registerAlignment'},value:'manual'});
assert.match(ui.render(),/data-hex-period="column"/);assert.match(ui.render(),/Register alignment/);
close(ui.press({dataset:{hexKey:String(duplicate.index)},closest:()=>null}).c,
  ui.press({dataset:{hexKey:String(twin.index)},closest:()=>null}).c);
const before=refreshes;
ui.input({dataset:{hexPeriod:'row'},value:'-3'});
ui.input({dataset:{hexPeriod:'column'},value:'4'});
assert.ok(refreshes>before,'Manual input updates immediately.');
assert.equal(ui.serialize().configs[0].periodPlacement.column,4);
assert.match(ui.render(),/data-hex-action="period-reverse"/);
ui.click({closest:()=>({dataset:{hexAction:'period-reverse'}})});
assert.deepEqual(ui.serialize().configs[0].periodPlacement,{column:-4,row:3});
ui.click({closest:()=>({dataset:{hexAction:'period-reverse'}})});
assert.deepEqual(ui.serialize().configs[0].periodPlacement,{column:4,row:-3});
const saved=JSON.parse(JSON.stringify(ui.serialize()));
ui.restore(saved);assert.deepEqual(ui.serialize(),saved);
ui.change({dataset:{hexField:'copyPeriodStep'},value:'-2'});
assert.equal(ui.serialize().configs[0].copyPeriodStep,-2);
assert.deepEqual(ui.serialize().configs[0].periodPlacement,{column:4,row:-3});
assert.match(ui.render(),/Pitch shift per copy/);
assert.equal(ui.serialize().configs[0].showPeriodLabels,false);
assert.doesNotMatch(ui.render(),/class="hex-period-label"/);
ui.change({dataset:{hexField:'showPeriodLabels'},type:'checkbox',checked:true});
assert.match(ui.render(),/class="hex-period-label"/);
const shiftedSession=JSON.parse(JSON.stringify(ui.serialize()));ui.restore(shiftedSession);
assert.deepEqual(ui.serialize(),shiftedSession);
const shiftedBoard=buildBoard(meantone,ui.serialize().configs[0]);
const shiftedKey=shiftedBoard.keys.find(k=>k.enabled&&k.copyRegister!==0);
close(ui.press({dataset:{hexKey:String(shiftedKey.index)},closest:()=>null}).c,shiftedKey.c);
assert.match(ui.render(),new RegExp('>'+ (shiftedKey.register>=0?'\\+':'')+shiftedKey.register+'P</text>'));
ui.change({dataset:{hexField:'copyPeriodStep'},value:'1.5'});
assert.equal(ui.serialize().configs[0].copyPeriodStep,-2,'Invalid pitch shifts are rejected.');
ui.restore(saved);
const key=buildBoard(meantone,ui.serialize().configs[0]).keys.find(k=>k.enabled&&k.copyRegister<0);
const node={dataset:{hexKey:String(key.index)},closest:()=>null};
assert.equal(ui.press(node).c,key.c);
// Actual pointer controller forwards the displaced pitch to the audio engine.
const handlers={},sounded=[];
createHexboardPlayer({document:{addEventListener:(e,fn)=>handlers[e]=fn,querySelector:()=>null},
  window:{addEventListener(){}},press:n=>ui.press(n),startVoice:c=>{sounded.push(c);return ()=>{};}});
handlers.pointerdown({target:{closest:()=>node},button:0,shiftKey:false,pointerId:1,preventDefault(){}});
assert.deepEqual(sounded,[key.c]);
handlers.pointerup({pointerId:1,shiftKey:false,preventDefault(){}});
const positive=buildBoard(meantone,ui.serialize().configs[0]).keys.find(k=>k.enabled&&k.copyRegister>0);
const positiveNode={dataset:{hexKey:String(positive.index)},closest:()=>null};
handlers.pointerdown({target:{closest:()=>positiveNode},button:0,shiftKey:true,pointerId:2,preventDefault(){}});
assert.deepEqual(sounded,[key.c,positive.c]);
handlers.pointerup({pointerId:2,shiftKey:true,preventDefault(){}});
handlers.keyup({key:'Shift'});
ui.change({dataset:{hexPeriod:'row'},value:'0'});
ui.change({dataset:{hexPeriod:'column'},value:'1'});
assert.match(ui.render(),/overlapping keys marked × are disabled/);
assert.match(ui.render(),/is-overlap/);
ui.click({closest:()=>({dataset:{hexAction:'period-auto'}})});
assert.equal(ui.serialize().configs[0].periodPlacement,null);
assert.equal(ui.serialize().configs[0].copyPeriodStep,1);
assert.equal(buildBoard(meantone,ui.serialize().configs[0]).wrapping.overlaps.length,0);
const legacy=structuredClone(saved);for(const c of legacy.configs){delete c.periodWrapping;delete c.periodPlacement;delete c.copyPeriodStep;}
ui.restore(legacy);assert.equal(ui.serialize().configs[0].periodWrapping,true);
assert.equal(ui.serialize().configs[0].periodPlacement,null);
assert.equal(ui.serialize().configs[0].copyPeriodStep,1);
assert.throws(()=>ui.restore({...saved,configs:saved.configs.map(c=>({...c,copyPeriodStep:1.5}))}),/Copy pitch shift/);
assert.throws(()=>ui.restore({...saved,configs:saved.configs.map(c=>({...c,periodPlacement:{column:0,row:0}}))}),/non-zero/);
console.log('Manual/automatic placement, overlaps, chord identity, audio, immediate inputs and session compatibility passed.');
