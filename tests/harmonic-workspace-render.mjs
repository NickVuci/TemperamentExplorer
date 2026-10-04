import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {makeState,presets,primeFilterForBasis,targets,validateJILimits} from '../dist/engine.mjs';
import {parsePrimeFilterInput,targetSet} from '../dist/ji-limit-engine.mjs';
import {mappingContext} from '../dist/harmonic-context.mjs';
import {createHarmonicCatalogueWorkspace} from '../dist/harmonic-catalogue-ui.mjs';

// Model DOM ownership: replacing a workspace detaches every child, including
// shared controls unless the application has parked them outside that workspace.
class Element {
 constructor(id='',className=''){this.id=id;this.className=className;this.children=[];this.parent=null;this.value='';this.html='';}
 appendChild(node){if(node.parent)node.parent.children.splice(node.parent.children.indexOf(node),1);node.parent=this;this.children.push(node);return node;}
 set innerHTML(html){this.html=html;for(const child of this.children)child.parent=null;this.children=[];if(html.includes('class="harmony-heading"'))this.appendChild(new Element('','harmony-heading'));}
 get innerHTML(){return this.html;}
 querySelector(selector){return this.descendants().find(node=>selector.startsWith('#')?node.id===selector.slice(1):selector.startsWith('.')&&node.className===selector.slice(1))??null;}
 descendants(){return this.children.flatMap(child=>[child,...child.descendants()]);}
}
const root=new Element(),add=(id,parent=root)=>parent.appendChild(new Element(id));
for(const id of ['workspace','explore-scale-controls','material-host','inspector','ji-controls-parking','target-controls-parking','matrix-controls-parking','matrix-label-controls-parking'])add(id);
const controls=add('ji-controls'),limit=add('limit',controls),primeLimit=add('primeLimit',controls);
add('tolerance',controls);limit.value='15';primeLimit.value='basis';
add('targetfilter',add('target-controls')).value='mapped';
add('layout',add('matrix-controls')).value='distance';
add('labels',add('matrix-label-controls')).value='ratios';
const document={activeElement:null,querySelector:selector=>root.querySelector(selector),querySelectorAll:()=>[]};
const context=vm.createContext({document,$:document.querySelector,states:[makeState('meantone')],view:'chords',harmonicMode:'b',manualChordInspector:false,renderingWorkspace:false,selected:null,manualTolerance:null,liveChordContext:null,
 parsePrimeFilterInput,primeFilterForBasis,targets,validateJILimits,automaticTolerance:()=>20,
 placeDiamondTolerance:()=>{},populateLimitOptions:()=>{},syncCoverageDefaults:()=>{},syncNavigation:()=>{},scaleControls:()=>'',
 sectionFor:v=>v==='composition'?'create':'discover',scaleDetails:()=>'<section>Scale view</section>',materialWorkspace:{render:()=>''},hexWorkspace:{prepareForTemperament:()=>{}},hexPlayer:null,diamondPlayer:null,
 placeMatrixControls:()=>{},placeTargetControls:()=>{},chordWorkspace:{render:()=>'<section>Manual chord inspector</section>'}});
const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
assert.doesNotMatch(html,/harmonic-version|harmony-ab-selector|Classic view/,'the classic-view toggle is removed');
assert.match(app,/const harmonicMode='b'/,'the discovery catalogue is the only saved mode');
assert.doesNotMatch(app,/temperament-harmony-ab|setHarmonicMode/,'legacy browser preferences cannot restore classic mode');
for(const name of ['coverageSettings','settings','parkJIControls','placeJIControls','refreshHarmony','renderWorkspace']){
 const source=app.split('\n').find(line=>line.startsWith(`function ${name}(`));assert.ok(source,name);vm.runInContext(source,context);
}
let refreshes=0;
const ui=createHarmonicCatalogueWorkspace({getState:()=>context.states[0],getSettings:state=>context.settings(state),refresh:()=>{refreshes++;context.refreshHarmony();}});
context.harmonicWorkspace=ui;
const host=document.querySelector('#workspace');
function controlsSurvive(){
 assert.equal(document.querySelector('#ji-controls'),controls,'shared controls stay connected');
 assert.equal(document.querySelector('#limit'),limit,'odd-limit control keeps its identity');
 assert.equal(document.querySelector('#primeLimit'),primeLimit,'prime-limit control keeps its identity');
 assert.equal(root.descendants().filter(node=>node.id==='ji-controls').length,1);
 assert.equal(context.renderingWorkspace,false,'redraw ownership is released');
}
async function ready(){
 const deadline=Date.now()+10000;
 while(ui.model().status==='loading'){assert.ok(Date.now()<deadline,'discovery completes');await new Promise(resolve=>setTimeout(resolve,5));}
 controlsSurvive();assert.equal(ui.model().error,'');assert.ok(ui.model().result?.complete);assert.ok(ui.layoutEntries().length);
 assert.match(host.innerHTML,/matching rows · catalogue search complete/);
}
try{
 // Use the real application redraw and real catalogue callbacks, rather than a
 // no-op refresh callback, through each built-in temperament change.
 for(const key of Object.keys(presets)){
  context.states[0]=makeState(key);context.renderWorkspace();controlsSurvive();await ready();
  assert.equal(ui.model().result.mappingId,mappingContext(context.states[0]).id,`${key}: the refreshed catalogue uses the current mapping`);
  assert.equal(controls.parent.id,'ji-controls-parking','Diamond-specific advanced controls remain parked while shared limit inputs retain their identities.');
 }
 assert.ok(refreshes>Object.keys(presets).length,'loading, progress and terminal redraws were exercised');
 // A limit change can also launch a new job during the isolated harmony redraw.
 limit.value='9';context.refreshHarmony();controlsSurvive();await ready();
 assert.equal(ui.model().result.targetSetId,targetSet({oddLimit:9,primeFilter:context.settings(context.states[0]).primeLimit,mappingSubgroup:context.states[0].basis,representationPolicy:'octave'}).id,'Changing the shared limit replaces the catalogue target context.');
 // Leaving discovery during a pending job must keep the controls available to A.
 context.states[0]=makeState('meantone');context.renderWorkspace();context.view='scales';context.renderWorkspace();controlsSurvive();
 await new Promise(resolve=>setTimeout(resolve,5));assert.match(host.innerHTML,/Scale view/);
 assert.equal(controls.parent.id,'ji-controls-parking');
 context.view='chords';context.renderWorkspace();await ready();
 // Native selects must close after committing a choice. Refocusing their
 // replacement can reopen the picker; only text editors need caret restoration.
 const querySelector=host.querySelector.bind(host);let focusCount=0,caret=null;
 const replacement={value:'',type:'search',focus:()=>{focusCount++;},setSelectionRange:(start,end)=>{caret=[start,end];}};
 host.querySelector=selector=>selector.startsWith('[data-harmony-field=')?replacement:querySelector(selector);
 document.activeElement={tagName:'SELECT',dataset:{harmonyField:'category'},value:'et'};
 assert.equal(ui.change(document.activeElement),true);
 assert.equal(ui.model().category,'et');assert.equal(focusCount,0,'Browse selection does not reopen its native picker during redraw');
 document.activeElement={tagName:'SELECT',dataset:{harmonyField:'category'},value:'ji'};
 ui.change(document.activeElement);await ready();
 assert.equal(focusCount,0,'catalogue loading and completion do not refocus the selected dropdown');
 document.activeElement={tagName:'INPUT',dataset:{harmonyField:'search'},value:'4:5:6',selectionStart:3,selectionEnd:3};
 ui.input(document.activeElement);
 assert.equal(focusCount,1,'typing retains focus after the result list redraw');
 assert.equal(replacement.value,'4:5:6');assert.deepEqual(caret,[3,3],'the search caret is preserved');
 document.activeElement=null;host.querySelector=querySelector;
 // A thrown renderer must release ownership so the next redraw can recover.
 const render=ui.render;ui.render=()=>{throw Error('Renderer failed');};
 assert.throws(()=>context.refreshHarmony(),/Renderer failed/);controlsSurvive();ui.render=render;context.refreshHarmony();await ready();
}finally{ui.destroy();}
console.log('Application discovery redraws preserve shared JI controls through all built-in temperaments, limit changes, pending navigation and renderer recovery.');
