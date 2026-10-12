import {parsePrimeFilterInput} from '../src/core/ji-limit-engine.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as engine from '../src/core/engine.mjs';
import * as matrices from '../src/core/matrix.mjs';
import * as assignments from '../src/core/assignments.mjs';
import {renderDiamond,maximumDiamondError,diamondApproximation} from '../src/diamond/tonality-diamond.mjs';
import {errorColor,maximumMappedTargetError} from '../src/core/ji-error-color.mjs';
import {validateState} from '../src/core/state.mjs';
import {fromCommas} from '../src/core/tuning.mjs';
import {createDiamondWorkspace} from '../src/diamond/diamond-workspace.mjs';
const source=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
const controls={'#limit':{value:'13'},'#primeLimit':{value:'basis'},'#layout':{value:'distance'},'#labels':{value:'ratios'},'#tolerance':{value:'10'},'#targetfilter':{value:'all'}};
const state=engine.makeState('meantone');
const context=vm.createContext({harmonicMode:'a',parsePrimeFilterInput,...engine,...matrices,...assignments,assert,states:[state],matrixPages:[[0,0]],diamondScope:'mapping',manualTolerance:null,$:id=>controls[id],esc:String,errorColor,maximumMappedTargetError,maximumDiamondError:maximumDiamondError,renderDiamond,fmt:(v,n=2)=>Number(v).toFixed(n),sign:v=>(v>=0?'+':'')+Number(v).toFixed(2),option:(value,label,selected)=>`<option value="${value}"${selected===value?' selected':''}>${label}</option>`});
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
assert.match(source,/\$\('#approximation-module'\).insertBefore/);
assert.equal(context.errorColor(0,10),'#fff');
// A cell as the diamond builds it: its status is the one approximation it sounds.
const cellFor=(ratio,scope=context.diamondScope)=>{const target=assignments.target(ratio);return {...target,label:ratio,c:1200*Math.log2(target.n/target.d),status:diamondApproximation(context.states[0],target,{...context.settings(),scope})};};
const jiDetails=context.diamondDetails(cellFor('3/2'));
assert.match(jiDetails,/<th scope="col" title="JI interval">3\/2<\/th>/);
assert.match(jiDetails,/<td title="JI cents">701\.955¢<\/td>/);
assert.doesNotMatch(jiDetails,/data-ji-target|Play JI interval|<button|¢ error|approximation-heading-row|Mapped · best|<small>/);
assert.match(jiDetails,/style="--approximation-color:/);
for(const [first,second] of [['JI interval','JI cents'],['JI cents','Tempered cents'],['Tempered cents','Signed deviation from JI']])assert.ok(jiDetails.indexOf(`title="${first}"`)<jiDetails.indexOf(`title="${second}"`));
assert.doesNotMatch(source,/playJITarget|data\.jiTarget/);
// Render the selected target's details, not just the SVG. This catches stale
// comparison-panel references in every approximation source and span.
for(const s of [state,engine.makeState('porkypine'),fromCommas('128/125','2.3.5'),fromCommas('245/243','3.5.7')]){
 context.states[0]=s;
 for(const octave of [false,true])for(const scope of ['mapping','scale','mode'])for(const filter of ['all','mapped','hits']){
  s.matrixOctave=octave;context.diamondScope=scope;controls['#targetfilter'].value=filter;
  for(const ratio of ['3/2','5/3']){
   const details=context.diamondDetails(cellFor(ratio,scope));
   assert.ok(details.includes(ratio));assert.doesNotMatch(details,/data-ji-target|Play JI interval|undefined|NaN/);
  }
 }
}
context.diamondScope='mapping';controls['#targetfilter'].value='all';
controls['#limit'].value='15';
// A mapped interval absent from the scale shows only the reading the cell sounds, not a second candidate.
context.states[0]={...engine.makeState('meantone'),n:5,mode:0};{const cell=cellFor('16/15'),single=context.diamondDetails(cell);
 assert.equal((single.match(/title="Tempered cents"/g)||[]).length,1,'one reading per cell');assert.match(single,new RegExp(cell.status.approximation.c.toFixed(3)));}
controls['#labels'].value='cents';
const porkypine=engine.makeState('porkypine');context.states[0]=porkypine;
vm.runInContext(`settings=(()=>{const basis=states[0].basis,limit=Number($('#limit').value),primeLimit=$('#primeLimit').value==='basis'?primeFilterForBasis(basis):null;return {limit,primeLimit,layout:$('#layout').value,labels:$('#labels').value,ts:targets(limit,primeLimit),tol:10,maxError:10,filter:$('#targetfilter').value,outside:true};});assert.equal(settings().primeLimit.join('.'),'2.3.5.11');assert.ok(!targets(settings().limit,settings().primeLimit).some(t=>t.label==='7/4'));assert.ok(targets(settings().limit,settings().primeLimit).some(t=>t.label==='11/8'));`,context);
assert.doesNotMatch(source,/compareWorkspace|comparisonEnabled|compare-matrices|compare-difference|panelB|playComparison/);
assert.match(source,/workflowVersion:8,harmonicCatalogue:harmonicWorkspace\.serialize\(\),states:\[states\[0\]\]/);
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
// Exercise the real selection/playback -> details path without replacing the SVG.
context.states[0]=state;context.diamondScope='mapping';
controls['#primeLimit'].value='basis';controls['#targetfilter'].value='mapped';
const cellDetail={innerHTML:'',hidden:false},chordDetail={innerHTML:'',hidden:true};
const detailPanel={hidden:true,querySelector:selector=>selector==='[data-diamond-cell-detail]'?cellDetail:selector==='[data-diamond-chord]'?chordDetail:null};controls['#diamond-detail-0']=detailPanel;
const liveDiamond=createDiamondWorkspace({document:{querySelector:()=>null,querySelectorAll:()=>[]},getState:()=>context.states[0],refresh(){},notify(){},play(){},onInspect(){},onChordChange:()=>context.fillDiamondDetails()});
context.diamondWorkspace=liveDiamond;
liveDiamond.restore({harmonics:'4:5:6',fold:false,interaction:'select',selected:[]});liveDiamond.render(context.settings(),'');
context.fillDiamondDetails();assert.equal(detailPanel.hidden,true,'no default interval details without selected or playing cells');assert.equal(cellDetail.innerHTML,'');assert.equal(chordDetail.innerHTML,'');
liveDiamond.press({dataset:{diamondKey:'1:0'}});assert.equal(detailPanel.hidden,false);assert.match(cellDetail.innerHTML,/title="JI interval">5\/4/);
liveDiamond.press({dataset:{diamondKey:'1:0'}});assert.equal(detailPanel.hidden,true,'deselecting the final cell clears the readout');assert.equal(cellDetail.innerHTML,'');

liveDiamond.press({dataset:{diamondKey:'0:0'}});assert.equal(cellDetail.hidden,false);assert.equal(chordDetail.hidden,true);assert.match(cellDetail.innerHTML,/1\/1/);
liveDiamond.press({dataset:{diamondKey:'1:0'}});liveDiamond.press({dataset:{diamondKey:'2:0'}});
assert.equal(cellDetail.hidden,true);assert.equal(cellDetail.innerHTML,'','single interval data disappears during a chord');assert.equal(chordDetail.hidden,false);
assert.match(chordDetail.innerHTML,/<h4>4:5:6<\/h4>/);
assert.equal((chordDetail.innerHTML.match(/scope="col"/g)||[]).length,3,'each distinct played interval has its own compact column');assert.equal((chordDetail.innerHTML.match(/<thead>/g)||[]).length,1,'one shared JI group supplies the continuous divider');assert.doesNotMatch(chordDetail.innerHTML,/diamond-detail-heading/,'no per-ratio dividers');
const rows=[...chordDetail.innerHTML.matchAll(/<tr>(.*?)<\/tr>/g)].map(match=>[...match[1].matchAll(/<(?:th|td)[^>]*>(.*?)<\/(?:th|td)>/g)].map(cell=>cell[1]));assert.equal(rows.length,4);
liveDiamond.chordDisplay().tuning.intervals.forEach((interval,index)=>{assert.equal(rows[0][index],interval.ratio);assert.equal(rows[1][index],`${interval.idealCents.toFixed(3)}¢`);assert.equal(rows[2][index],`${interval.temperedCents.toFixed(3)}¢`);assert.equal(rows[3][index],`${interval.errorCents>=0?'+':''}${interval.errorCents.toFixed(2)}¢`);});
for(const [index,interval] of liveDiamond.chordDisplay().tuning.intervals.entries()){
 const single=context.diamondDetails(liveDiamond.displayCells().find(cell=>cell.label===interval.ratio));
 const singleRows=[...single.matchAll(/<tr>(.*?)<\/tr>/g)].map(match=>[...match[1].matchAll(/<(?:th|td)[^>]*>(.*?)<\/(?:th|td)>/g)].map(cell=>cell[1]));
 assert.equal(singleRows.length,4,'single intervals have exactly the same four rows as chords');
 for(let row=0;row<4;row++)assert.equal(singleRows[row][0],rows[row][index],'the single interval and chord column display the same data');
 assert.doesNotMatch(single,/class="approximation|<small>|diamond-detail-heading/,'no extra mapping text or separate block layout');
}

assert.ok(chordDetail.innerHTML.indexOf('diamond-chord-heading')<chordDetail.innerHTML.indexOf('diamond-chord-approximation'),'JI above tempered');assert.doesNotMatch(chordDetail.innerHTML,/Playing ·|Selected ·|Tempered ·|JI chord/);assert.doesNotMatch(chordDetail.innerHTML,/¢ total error|¢ error/);
const selectedChord=liveDiamond.chordDisplay();
const colouredRows=[...chordDetail.innerHTML.matchAll(/<tr>(.*?)<\/tr>/g)].slice(2).map(match=>[...match[1].matchAll(/--approximation-color:([^"]+)/g)].map(cell=>cell[1]));
const expectedColors=selectedChord.tuning.intervals.map(interval=>errorColor(interval.errorCents,context.settings().maxError));
assert.ok(new Set(expectedColors).size>1,'fixture distinguishes interval colours from an aggregate colour');
for(const row of colouredRows)assert.deepEqual(row,Array.from(expectedColors),'each tempered value and error matches its diamond interval colour');
assert.match(chordDetail.innerHTML,/all 3 note pairs/);
assert.match(jiDetails,/^<div class="diamond-chord-heading" aria-hidden="true"><\/div>/,'single intervals reserve the chord heading row');
const style=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');assert.match(style,/\.diamond-chord-heading h4\s*\{\s*color: #fff;/,'the JI chord stays white');
liveDiamond.restore({...liveDiamond.serialize(),interaction:'play'});liveDiamond.render(context.settings(),'');
liveDiamond.updatePlaying([{id:'0:0'},{id:'0:1'},{id:'0:2'}]);assert.match(chordDetail.innerHTML,/1\/6:5:4/);assert.doesNotMatch(chordDetail.innerHTML,/Playing ·|JI chord/);assert.equal(cellDetail.hidden,true);
liveDiamond.updatePlaying([{id:'0:1'}]);assert.equal(chordDetail.hidden,true);assert.equal(cellDetail.hidden,false);assert.match(cellDetail.innerHTML,/4\/5/,'the remaining active interval replaces the chord, rather than the last pressed cell');
liveDiamond.updatePlaying([]);assert.equal(chordDetail.hidden,false);assert.match(chordDetail.innerHTML,/<h4>4:5:6<\/h4>/,'a persistent selection returns after release');
liveDiamond.click({closest:()=>({dataset:{diamondAction:'clear'}})});assert.equal(detailPanel.hidden,true,'clear selection clears both readouts');assert.equal(cellDetail.innerHTML,'');assert.equal(chordDetail.innerHTML,'');
liveDiamond.updatePlaying([{id:'0:1'}]);assert.equal(detailPanel.hidden,false,'a playing interval shows data without selection');assert.match(cellDetail.innerHTML,/title="JI interval">4\/5/);
liveDiamond.updatePlaying([]);assert.equal(detailPanel.hidden,true,'releasing the final playing interval clears the readout');assert.equal(cellDetail.innerHTML,'');
liveDiamond.updatePlaying([{id:'0:0'},{id:'0:1'},{id:'0:2'}]);assert.equal(chordDetail.hidden,false);
liveDiamond.updatePlaying([]);assert.equal(detailPanel.hidden,true,'releasing an unselected chord clears the readout');assert.equal(chordDetail.innerHTML,'');
liveDiamond.restore({harmonics:'4:5:6',fold:false,interaction:'select',selected:['0:0','1:0']});liveDiamond.render(context.settings(),'');context.fillDiamondDetails();
liveDiamond.press({dataset:{diamondKey:'1:0'}});assert.match(cellDetail.innerHTML,/title="JI interval">1\/1/,'deselecting one of two cells shows the remaining selected interval');
liveDiamond.render({...context.settings(),scope:'mode'},'');context.fillDiamondDetails();assert.equal(detailPanel.hidden,true,'invalidated selections leave no stale details');

liveDiamond.restore({harmonics:'4:5:7',fold:false,interaction:'select',selected:['0:0','1:0','2:0']});liveDiamond.render(context.settings(),'');context.fillDiamondDetails();
assert.match(chordDetail.innerHTML,/4:5:7/);assert.match(chordDetail.innerHTML,/Some notes have no available approximation/);assert.match(chordDetail.innerHTML,/title="Tempered cents">—/);assert.match(chordDetail.innerHTML,/title="Signed deviation from JI">—/,'unavailable notes never masquerade as zero error');assert.doesNotMatch(chordDetail.innerHTML,/Total chord error:/,'incomplete chord has no aggregate score');assert.match(chordDetail.innerHTML,/title="JI interval">5\/4/,'available member columns remain visible');
console.log('Single-state matrix and JI diamond rendering, exact subgroup targets, one-state session export, and legacy primary-state restoration passed.');
