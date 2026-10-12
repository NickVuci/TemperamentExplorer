import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {makeState,scale} from '../src/core/engine.mjs';
import {BUILTIN_LAYOUTS} from '../src/hexboard/builtin-layouts.mjs';
import {buildBoard} from '../src/hexboard/hexboard.mjs';
import {noteCoordinate} from '../src/core/pitch.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {applyTuningMethod,tuningConfig,jiSelection} from '../src/core/tuning-methods.mjs';
import {preflightRetuning,RETUNING_STRUCTURE_MESSAGE} from '../src/core/retuning-guard.mjs';

const builtin=key=>structuredClone(BUILTIN_LAYOUTS.find(row=>row.id==='builtin:'+key).state);
const {context:layoutState,config:layout}=builtin('meantone');
const meantone={...makeState('meantone'),...layoutState};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const coords=s=>scale(s).notes.map(n=>noteCoordinate(s,n).map(v=>v||0));
const structure=(s,cfg)=>buildBoard(s,cfg).keys.map(k=>[k.m.map(v=>v||0),k.degree,k.enabled]);

for(const key of ['meantone','dreamtone']){
 const {context:currentState,config:layoutConfig}=builtin(key);
 for(const periodWrapping of [false,true])for(const multiplier of [1,1.001]){
  const candidateState={...currentState,p:currentState.p*multiplier,g:currentState.g*multiplier+(multiplier===1?.001:0)};
  const input=freeze({currentState,candidateState,playState:{...currentState,mode:1},layoutConfig:{...layoutConfig,periodWrapping}});
  const result=preflightRetuning(input);
  assert.deepEqual(coords(result.state),coords(currentState));
  assert.deepEqual(coords(result.playState),coords(input.playState));
  assert.equal(result.playState.mode,1,'Play retains its independent mode');
  assert.deepEqual(structure(result.playState,input.layoutConfig),structure(input.playState,input.layoutConfig));
  assert.notEqual(buildBoard(result.playState,input.layoutConfig).keys[66].c,buildBoard(input.playState,input.layoutConfig).keys[66].c);
  assert.notStrictEqual(result.state,candidateState);
 }
}
console.log('Small and proportional retunings preserve integer structure for wrapped and unwrapped 5-limit/higher-limit boards.');

function rejects(input,reason){const before=structuredClone(input);assert.throws(()=>preflightRetuning(input),error=>error.message.startsWith(RETUNING_STRUCTURE_MESSAGE)&&error.message.includes(reason));assert.deepEqual(input,before,'rejected trials never mutate inputs');}
rejects({currentState:meantone,candidateState:{...meantone,rows:[[1,1,1],[0,1,4]]},layoutConfig:layout},'mapping');
rejects({currentState:meantone,candidateState:{...meantone,n:6},layoutConfig:layout},'Discover');
rejects({currentState:meantone,candidateState:{...meantone,g:600},layoutConfig:layout},'collision');
rejects({currentState:meantone,candidateState:{...meantone,g:400.01},layoutConfig:layout},'Discover');
rejects({currentState:meantone,candidateState:{...meantone,g:meantone.g+10},playState:{...meantone,n:19},layoutConfig:layout},'Play');
const two={...makeState('meantone'),n:2,mode:0,g:550},twoLayout={...layout,base:2,offset:0,style:'bosanquet',periodWrapping:false,outside:false};
rejects({currentState:two,candidateState:{...two,g:600},layoutConfig:twoLayout},'fallback');
rejects({currentState:two,candidateState:{...two,g:650},layoutConfig:twoLayout},'Button assignments');
// Both selected scale coordinates survive 550 -> 600; 2edo introduces board pitch aliases,
// changing enabled keys even under fixed manual integer axes.
assert.deepEqual(coords(two),coords({...two,g:600}));
rejects({currentState:two,candidateState:{...two,g:600},layoutConfig:{...twoLayout,style:'manual',ap:1,ag:0,bp:0,bg:1}},'Button assignments');
for(const [comma,basis] of [['128/125','2.3.5'],['245/243','3.5.7']]){
 const currentState={...fromCommas(comma,basis),n:2,mode:0},candidateState={...currentState,g:currentState.g+.001};
 assert.doesNotThrow(()=>preflightRetuning({currentState,candidateState,layoutConfig:{...twoLayout,style:'manual',ap:1,ag:0,bp:0,bg:1}}));
}
console.log('Retuning boundaries cover collisions, reordered scales, independent Play scales, MOS fallback, axes, pitch aliases, divided and non-octave periods.');

// Execute the real app transaction and event adapters; a rejected draft must not leak
// through explorer metadata, assignment arrays, direct edits, or a render-time repair.
const source=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
let onChange,stops=0,renders=0,panels=0,notices=[];
const inert={change:()=>false};
const config={...structuredClone(layout),chord:[65,66],keyColors:{65:'#abcdef'},savedLayoutId:'saved-test'};
const context=vm.createContext({structuredClone,preflightRetuning,applyTuningMethod,tuningConfig,jiSelection,
 states:[structuredClone(meantone)],layoutState:{signature:'unchanged',state:{...structuredClone(meantone),mode:1}},selected:[1,2],view:'unified',
 hexWorkspace:{...inert,retuningSnapshot:()=>structuredClone(config),serialize:()=>{throw Error('Mutating serialization must not be used');}},
 compositionWorkspace:inert,harmonicWorkspace:inert,materialWorkspace:inert,presetWorkspace:inert,commaWorkspace:inert,chordWorkspace:inert,
 document:{addEventListener:(_,fn)=>onChange=fn},stop:()=>stops++,render:()=>renders++,renderPanel:()=>panels++,toast:text=>notices.push(text),
 settings:()=>({ts:[]}),allTargets:()=>[],near:()=>({label:'5/4'}),
 readTuning:()=>({method:'JI Target',fixed:true,jiAll:false}),$:()=>({querySelector:()=>({scrollIntoView:()=>{}})})});
vm.runInContext(source.slice(source.indexOf('function commitRetuning('),source.indexOf('function renderPresetControls(')),context);
vm.runInContext(source.slice(source.indexOf('function changeExplore('),source.indexOf("document.addEventListener('visibilitychange'")),context);
vm.runInContext(source.split('\n').find(line=>line.startsWith("document.addEventListener('change',")),context);
const change=(dataset,value,extra={})=>onChange({target:{dataset:{s:'0',...dataset},value,hasAttribute:()=>false,closest:()=>null,...extra}});
function reset(extra={}){context.states=[{...structuredClone(meantone),...structuredClone(extra)}];context.layoutState={signature:'unchanged',state:{...structuredClone(meantone),mode:1}};stops=0;renders=0;panels=0;notices=[];}
function rejectsEdit(edit){const before=structuredClone({states:context.states,layoutState:context.layoutState,config,selected:context.selected});edit();assert.deepEqual(structuredClone({states:context.states,layoutState:context.layoutState,config,selected:context.selected}),before);assert.equal(stops,0);assert.equal(renders,0,'rejected edits redraw controls, not the mutating workspace');assert.ok(panels>0);assert.ok(notices.length);}

reset();change({field:'g'},String(meantone.g+.001));assert.equal(context.states[0].g,meantone.g+.001,notices.join(' | '));assert.equal(context.layoutState.state.g,meantone.g+.001);assert.equal(context.layoutState.state.mode,1);assert.deepEqual(context.selected,[1,2]);assert.equal(stops,1);
reset();rejectsEdit(()=>change({field:'g'},'600'));
reset();rejectsEdit(()=>change({field:'p'},'1000'));
const badTarget={tuning:'JI Target',explore:{ratio:'5/4',m:[0,1],open:false},tuneConfig:{method:'JI Target',fixed:true,jiAll:false}};
for(const dataset of [{field:'tuning'},{tune:'pure'},{optimizePeriod:'0'}]){
 reset(badTarget);rejectsEdit(()=>change(dataset,'JI Target',{checked:false,closest:selector=>dataset.tune?{dataset:{s:'0'}}:null}));
}
reset({explore:{ratio:'5/4',m:[-2,4],open:false}});rejectsEdit(()=>context.changeExplore({dataset:{s:'0',exploreField:'choice'},value:'0,1'}));
reset({explore:{ratio:'5/4',m:[-2,4],open:false}});rejectsEdit(()=>context.changeExplore({dataset:{s:'0',exploreField:'a'},value:'0'}));
reset({explore:{ratio:'5/4',m:[-2,4],open:false}});rejectsEdit(()=>context.changeExplore({dataset:{s:'0',exploreField:'ratio'},value:'not a ratio'}));
for(const action of ['open','cell','pure','pureall','add','remove']){
 const assignments=action==='remove'?[{label:'5/4',c:1200*Math.log2(5/4),m:[0,1]},{label:'3/2',c:1200*Math.log2(3/2),m:[0,1]}]:action==='pureall'?[{label:'5/4',c:1200*Math.log2(5/4),m:[0,1]}]:[];
 reset({...badTarget,assignments,tuneConfig:{...badTarget.tuneConfig,jiAll:['add','remove'].includes(action)}});
 rejectsEdit(()=>context.handleExplore({dataset:{s:'0',explore:action,m:'0,1',i:'1'}}));
}
// A rejected method retains its old committed config/report instead of being relabelled Manual.
reset({tuningReport:'committed report'});rejectsEdit(()=>context.applyPanelTuning(0,{method:'no such method'}));assert.equal(context.states[0].tuningReport,'committed report');
console.log('Real tuning, direct P/G, Optimize period, JI explorer and assignment adapters commit atomically and preserve rejected state.');
