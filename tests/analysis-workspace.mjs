import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as engine from '../dist/engine.mjs';
import * as matrices from '../dist/matrix.mjs';
import * as assignments from '../dist/assignments.mjs';
import {renderDiamond,maximumDiamondError} from '../dist/tonality-diamond.mjs';
import {errorColor,maximumMappedTargetError} from '../dist/ji-error-color.mjs';
import {validateState} from '../dist/state.mjs';
import {fromCommas} from '../dist/tuning.mjs';
const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const controls={'#limit':{value:'13'},'#primeLimit':{value:'basis'},'#layout':{value:'distance'},'#labels':{value:'ratios'},'#tolerance':{value:'10'},'#targetfilter':{value:'all'}};
const state=engine.makeState('meantone');
const context=vm.createContext({...engine,...matrices,...assignments,assert,states:[state],matrixPages:[[0,0]],diamondScope:'mapping',diamondSelections:['1/1'],manualTolerance:null,$:id=>controls[id],esc:String,errorColor,maximumMappedTargetError,maximumDiamondError:maximumDiamondError,renderDiamond,fmt:(v,n=2)=>Number(v).toFixed(n),sign:v=>(v>=0?'+':'')+Number(v).toFixed(2),option:(value,label,selected)=>`<option value="${value}"${selected===value?' selected':''}>${label}</option>`});
context.playPitches=pitches=>{context.playedPitches=pitches;};
context.diamondWorkspace={layout:()=>({}),render:(cfg,header)=>renderDiamond(context.states[0],0,cfg,'1/1',header)};
vm.runInContext(source.slice(source.indexOf('function near('),source.indexOf('function syncNavigation(){')),context);
context.settings=undefined;
vm.runInContext(`settings=(()=>{const limit=Number($('#limit').value),primeLimit=$('#primeLimit').value==='basis'?primeFilterForBasis(states[0].basis):null;const cfg={limit,primeLimit};return {limit,primeLimit,layout:$('#layout').value,labels:$('#labels').value,ts:targets(limit,primeLimit),tol:10,maxError:10,filter:$('#targetfilter').value,outside:true};});`,context);
vm.runInContext(`assert.match(matrix(),/aria-label="Scale interval matrix"/);assert.doesNotMatch(matrix(),/Difference|B minus A|aria-label="[AB] interval matrix"/);assert.match(matrix(),/style="background:#fff;color:#11151c"/);assert.doesNotMatch(targetTable(),/Approximation source<select data-diamond-scope>/,'approximation settings live in the collapsed advanced menu');assert.equal((targetTable().match(/class="diamond-panel"/g)||[]).length,1);assert.equal((targetTable().match(/data-diamond-scope/g)||[]).length,0);`,context);
const renderedMatrix=context.matrix();
assert.ok(renderedMatrix.indexOf('data-matrix-labels-host')<renderedMatrix.indexOf('<table'),'cell-label options host stays above the matrix canvas');
assert.equal((renderedMatrix.match(/data-matrix-labels-host/g)||[]).length,1);
assert.ok(renderedMatrix.indexOf('</table>')<renderedMatrix.indexOf('data-matrix-controls-host'),'matrix options host follows the matrix canvas');
assert.equal((renderedMatrix.match(/data-matrix-controls-host/g)||[]).length,1);
const advanced=html.match(/<details id="ji-controls" class="advanced-approximation-options">[\s\S]*?<\/details>/)?.[0]??'';
assert.match(advanced,/Approximation source<select id="diamond-scope" data-diamond-scope>/);
assert.match(advanced,/id="diamond-span-controls"/);
assert.match(advanced,/data-diamond-settings/);
assert.match(source,/host=v==='targets'\?\$\('#ji-controls'\)/);
assert.equal(context.errorColor(0,10),'#fff');
const jiDetails=context.diamondDetails('3/2');assert.match(jiDetails,/class="diamond-detail-ji-cents">701\.955 ¢<\/span><span class="diamond-detail-ratio">3\/2<\/span>/);assert.doesNotMatch(jiDetails,/data-ji-target|Play JI interval|<button/);assert.match(jiDetails,/style="--approximation-color:/);assert.ok(jiDetails.indexOf('class="approximation-metrics"')<jiDetails.indexOf('class="approximation-heading-row"'),'tempered cents and error precede the approximation label and coordinates');assert.match(jiDetails,/class="approximation-heading-row"><span class="approximation-kind target-mapped">Mapped · best<\/span><small>[^<]*periods[^<]*generators/);assert.doesNotMatch(source,/playJITarget|data\.jiTarget/);
// Render the selected target's details, not just the SVG. This catches stale
// comparison-panel references in every approximation source and span.
for(const s of [state,engine.makeState('porkypine'),fromCommas('128/125','2.3.5'),fromCommas('245/243','3.5.7')]){
 context.states[0]=s;
 for(const octave of [false,true])for(const scope of ['mapping','scale','mode'])for(const filter of ['all','mapped','hits']){
  s.matrixOctave=octave;context.diamondScope=scope;controls['#targetfilter'].value=filter;
  for(const ratio of ['3/2','5/3']){
   const details=context.diamondDetails(ratio);
   assert.ok(details.includes(ratio));assert.doesNotMatch(details,/data-ji-target|Play JI interval|undefined|NaN/);
  }
 }
}
context.diamondScope='mapping';controls['#targetfilter'].value='all';
controls['#limit'].value='15';
controls['#labels'].value='cents';
const porkypine=engine.makeState('porkypine');context.states[0]=porkypine;
vm.runInContext(`settings=(()=>{const basis=states[0].basis,limit=Number($('#limit').value),primeLimit=$('#primeLimit').value==='basis'?primeFilterForBasis(basis):null;return {limit,primeLimit,layout:$('#layout').value,labels:$('#labels').value,ts:targets(limit,primeLimit),tol:10,maxError:10,filter:$('#targetfilter').value,outside:true};});assert.equal(settings().primeLimit.join('.'),'2.3.5.11');assert.ok(!targets(settings().limit,settings().primeLimit).some(t=>t.label==='7/4'));assert.ok(targets(settings().limit,settings().primeLimit).some(t=>t.label==='11/8'));`,context);
assert.doesNotMatch(source,/compareWorkspace|comparisonEnabled|compare-matrices|compare-difference|panelB|playComparison/);
assert.match(source,/workflowVersion:7,states:\[states\[0\]\]/);
assert.doesNotMatch(source,/compare:/);
// Use the app's actual shared settings resolver for default and override checks.
vm.runInContext(source.slice(source.indexOf('function automaticTolerance('),source.indexOf('function near(')),context);
controls['#limit'].value='15';controls['#primeLimit'].value='basis';controls['#targetfilter'].value='mapped';
for(const [s,expected] of [[engine.makeState('meantone'),5],[engine.makeState('porkypine'),[2,3,5,11]],[fromCommas('245/243','3.5.7'),[3,5,7]]]){
 context.states[0]=s;const cfg=context.settings();
 assert.equal(cfg.limit,15);assert.equal(JSON.stringify(cfg.primeLimit),JSON.stringify(expected));
 assert.ok(Number.isFinite(cfg.tol)&&cfg.tol>=0);
}
context.states[0]=engine.makeState('porkypine');
assert.ok(!context.settings().ts.some(t=>t.label==='7/4'));
controls['#primeLimit'].value='11';assert.ok(context.settings().ts.some(t=>t.label==='7/4'));
context.states[0]=engine.makeState('meantone');assert.equal(context.settings().primeLimit,11,'explicit override survives temperament changes');
controls['#primeLimit'].value='';assert.equal(context.settings().primeLimit,null);
const legacy=JSON.parse(readFileSync(new URL('./fixtures/magic19-session.json',import.meta.url),'utf8'));
const restoreContext=vm.createContext({validate:validateState,presets:engine.presets});
const restoreSource=source.slice(source.indexOf('function restorePrimaryState('),source.indexOf("$('#save').onclick"));
vm.runInContext(restoreSource,restoreContext);
const restored=restoreContext.restorePrimaryState(legacy);
assert.equal(restored.key,legacy.states[0].key);
assert.deepEqual(restored.basis,legacy.states[0].basis);
assert.equal(restored.n,legacy.states[0].n);
assert.throws(()=>restoreContext.restorePrimaryState({states:[]}),/Temperament Lab session/);
console.log('Single-state matrix and JI diamond rendering, exact subgroup targets, one-state session export, and legacy primary-state restoration passed.');
