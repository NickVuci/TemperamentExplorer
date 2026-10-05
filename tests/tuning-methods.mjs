import assert from 'node:assert/strict';
import {makeState,purePeriod,mapRatio} from '../dist/engine.mjs';
import {tuningMethods,tuningMethod,tuningConfig,applyTuningMethod} from '../dist/tuning-methods.mjs';
import {weilTune,fromCommas} from '../dist/tuning.mjs';
import {presetSnapshot} from '../dist/preset-data.mjs';
const close=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`),s=makeState('meantone');
assert.equal(tuningMethods.length,5);
for(const method of tuningMethods){const r=applyTuningMethod({...s,g:690},{method});assert.equal(r.tuning,method);assert.ok(Number.isFinite(r.g));assert.notEqual(r.g,690);if(method!=='EDO')close(r.p,1200);}
for(const method of ['Weil–Euclidean','Minimax','Least Squares']){
 const fixed=applyTuningMethod(s,{method,fixed:true,period:1190});close(fixed.p,purePeriod(s));
 const free=applyTuningMethod(s,{method,fixed:false});assert.ok(Math.abs(free.p-1190)>1);assert.equal(free.tuneConfig.fixed,false);
 const saved=presetSnapshot('Saved '+method,free);assert.equal(saved.tuning,method);assert.equal(saved.tuneConfig.fixed,false);
}
const we=applyTuningMethod(s,{method:'Weil–Euclidean',fixed:true,period:1200});close(we.g,weilTune(s,true).g);
const j=applyTuningMethod(s,{method:'JI Target'}),m=mapRatio(5,4,j);close(m[0]*j.p+m[1]*j.g,1200*Math.log2(5/4));
const freeJI=applyTuningMethod(j,{fixed:false});close(m[0]*freeJI.p+m[1]*freeJI.g,1200*Math.log2(5/4));assert.notEqual(freeJI.p,j.p);
const outside=applyTuningMethod({...s,explore:{ratio:'7/4',m:[-5,10]}},{method:'JI Target',fixed:true});close(-5*outside.p+10*outside.g,1200*Math.log2(7/4));assert.deepEqual(outside.rows,s.rows);
const saved=presetSnapshot('Outside target',outside);assert.deepEqual(saved.explore.m,[-5,10]);assert.equal(saved.explore.ratio,'7/4');assert.equal(saved.tuning,'JI Target');
const multi={...j,assignments:[{label:'3/2',c:1200*Math.log2(3/2),m:[0,1]},{label:'5/4',c:1200*Math.log2(5/4),m:[-2,4]}]};
assert.throws(()=>applyTuningMethod(multi,{method:'JI Target',jiAll:true,fixed:true}),/cannot all be pure/);
const fitted=applyTuningMethod(multi,{method:'JI Target',jiAll:true,fixed:false});for(const t of multi.assignments)close(t.m[0]*fitted.p+t.m[1]*fitted.g,t.c);
for(const comma of ['128/125','245/243']){const temp=fromCommas(comma,comma==='128/125'?'2.3.5':'3.5.7');const r=applyTuningMethod(temp,{method:'Weil–Euclidean',fixed:true,period:purePeriod(temp)});close(r.p,purePeriod(temp));}
assert.equal(tuningMethod({...s,tuning:'Prime least squares'}),'Least Squares');assert.equal(tuningConfig({...s,tuning:'Published WE'}).fixed,true);
console.log('All five tuning methods apply, fixed/free periods, WE/CWE equivalence, single and multiple JI constraints, outside mappings, non-octave periods and preset round trips passed.');
const {readFileSync}=await import('node:fs'),{default:vm}=await import('node:vm');
const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');let onChange,live=[makeState('meantone'),makeState('dreamtone')];
const inert={change:()=>false};const context=vm.createContext({compositionWorkspace:inert,harmonicMode:'a',harmonicWorkspace:inert,structuredClone,states:live,tuningConfig,jiChordWorkspace:inert,materialWorkspace:inert,presetWorkspace:inert,hexWorkspace:inert,commaWorkspace:inert,chordWorkspace:inert,document:{addEventListener:(_,fn)=>onChange=e=>{e.target.hasAttribute??=()=>false;fn(e);}},applyPanelTuning:(idx,cfg)=>live[idx]=applyTuningMethod(live[idx],cfg),readTuning:()=>({method:'Weil–Euclidean',fixed:false}),toast:e=>{throw Error(e)},render:()=>{}});
vm.runInContext(source.split('\n').find(line=>line.startsWith("document.addEventListener('change',")),context);
for(const method of tuningMethods){live[0]={...s,g:690};onChange({target:{dataset:{field:'tuning',s:'0'},value:method,closest:()=>null}});assert.equal(live[0].tuning,method);assert.notEqual(live[0].g,690);}
onChange({target:{dataset:{tune:'optimizePeriod'},closest:()=>({dataset:{s:'0'}})}});assert.notEqual(live[0].p,1200);
console.log('Actual dropdown and tuning-option change handlers apply immediately.');

for(const comma of ['81/80','128/125','245/243']){const temp=fromCommas(comma,comma==='245/243'?'3.5.7':'2.3.5');assert.equal(tuningConfig(temp).fixed,true);close(temp.p,purePeriod(temp));const free=applyTuningMethod(temp,{method:'Weil–Euclidean',fixed:false});const restored=applyTuningMethod(free,{fixed:true,period:999});close(restored.p,purePeriod(temp));}
assert.equal(tuningConfig(makeState('porcupine11')).fixed,true);close(makeState('porcupine11').p,1200);
vm.runInContext(source.split('\n').find(line=>line.startsWith('function readTuning(')),context);
const panel=checked=>({dataset:{s:'0'},querySelectorAll:()=>[{dataset:{tune:'optimizePeriod'},type:'checkbox',checked}]});
assert.equal(context.readTuning(panel(true)).fixed,false);assert.equal(context.readTuning(panel(false)).fixed,true);
assert.ok(!source.includes('data-tune="period"'));assert.ok(source.includes('>Optimize period</label>'));
console.log('Optimize-period defaults, inverse checkbox, and reference-period restoration passed.');

assert.equal(tuningConfig(s).targets,'primes');
for(const tuning of ['Prime Least Squares','Prime least squares']){const legacy={...s,tuning,tuneConfig:{targets:'13',method:tuning}};assert.equal(tuningMethod(legacy),'Least Squares');assert.equal(tuningConfig(legacy).targets,'primes');}
assert.ok(!source.slice(source.indexOf('function tuningControls('),source.indexOf('function applyPanelTuning(')).includes('class="tuning-report"'));
assert.doesNotMatch(source,/class="tuning-controls"|<summary>Tuning options<\/summary>/,'the separate Tuning options menu is removed');

live[0]=makeState('meantone');
onChange({target:{dataset:{optimizePeriod:'0'},checked:true,closest:()=>null}});
assert.equal(tuningConfig(live[0]).fixed,false);assert.notEqual(live[0].p,1200);
onChange({target:{dataset:{optimizePeriod:'0'},checked:false,closest:()=>null}});
assert.equal(tuningConfig(live[0]).fixed,true);close(live[0].p,1200);
assert.ok(!source.slice(source.indexOf('function tuningControls('),source.indexOf('function applyPanelTuning(')).includes('data-optimize-period'));
assert.ok(source.includes('class="period-summary"'));
const panelMarkup=source.slice(source.indexOf('function renderPanel('),source.indexOf('function scaleControls(')),advancedTuning=panelMarkup.indexOf('class="advanced-tuning-options"');assert.match(panelMarkup,/<div class="tuning-choice"><label>Tuning<select[\s\S]*?<\/label><div class="tuning-summary"/,'the tuning menu and vertically stacked tuning values share the two-column primary row');assert.ok(advancedTuning>panelMarkup.indexOf('class="tuning-summary"'));assert.doesNotMatch(panelMarkup.slice(0,advancedTuning),/>Optimize period</);assert.match(panelMarkup.slice(advancedTuning),/<summary>Advanced tuning options<\/summary>[\s\S]*>Optimize period<\/label>/,'period optimization is inside its collapsed advanced section at the module bottom');
assert.match(panelMarkup,/<summary>Advanced tuning options<\/summary>\$\{tuningOptions\}/,'method-specific controls render inside Advanced tuning options');
console.log('Visible period checkbox retunes immediately and restores the pure period.');
