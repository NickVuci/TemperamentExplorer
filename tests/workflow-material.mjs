import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {withDefaultScale} from '../dist/default-scale.mjs';
import {normalizeUnifiedCenter} from '../dist/discover-unified.mjs';
import {normalizeScaleView} from '../dist/scale-view.mjs';
import {scaleDefaultKey,scaleCoverageTarget} from '../dist/scale-milestones.mjs';
import {makeState,scale} from '../dist/engine.mjs';
import {validateState} from '../dist/state.mjs';
import {createMaterialWorkspace,tuningIdentity} from '../dist/material-ui.mjs';
import {createHexboardWorkspace} from '../dist/hexboard-ui.mjs';
import {chordCoordinates} from '../dist/hexboard-chords.mjs';
const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const page=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
assert.doesNotMatch(source,/Select an interval cell to inspect it and hear both notes/);
const scaleControls=source.slice(source.indexOf('function scaleControls()'),source.indexOf('function scaleDetails()'));
assert.ok(scaleControls?.includes('<label>Scale<select')&&scaleControls.includes('<label>Mode<select'),'Discover scale controls use concise labels');assert.ok(scaleControls.includes('<summary>Advanced scale options</summary>'),'scale filters use the requested disclosure label');
const advancedScaleOptions=scaleControls.indexOf('<details class="scale-advanced"'),milestoneControls=scaleControls.indexOf('<section class="scale-milestones"');
assert.ok(advancedScaleOptions>=0&&milestoneControls>advancedScaleOptions&&scaleControls.indexOf('</details>',advancedScaleOptions)>milestoneControls,'coverage milestones are inside Advanced scale options, after the scale filter');
assert.doesNotMatch(source,/zsxdcvgbhnjm1234567890-=/,'the app has no global keyboard note map');
const keyboardStart=source.lastIndexOf("document.addEventListener('keydown'");
const keyboardHandler=source.slice(keyboardStart,source.indexOf('\nrender();',keyboardStart));
assert.doesNotMatch(keyboardHandler,/playPitches|playScale/,'the app key handler does not trigger notes');
assert.match(page,/<div id="inspector"[^>]*\shidden><\/div>/,'the empty interval inspector starts hidden');
const jiPlacementSource=source.slice(source.indexOf('function placeJIControls('),source.indexOf('function placeMatrixControls('));
assert.doesNotMatch(jiPlacementSource,/hexboard/,'Create does not render the shared JI controls; its search inherits them.');
const states=[makeState('meantone')];let placed,heard,notice,loaded;
const context=vm.createContext({states,structuredClone,tuningIdentity,withDefaultScale,scaleDefaultKey,coverageSettings:scaleCoverageTarget});
vm.runInContext('let layoutState=null;'+source.split('\n').find(x=>x.startsWith('function getLayoutStates(')),context);
const boardStates=()=>context.getLayoutStates();
boardStates()[0].n=31;states[0].n=7;states[0].mode=2;
assert.equal(boardStates()[0].n,31);assert.equal(boardStates()[0].mode,0,'the Play layout keeps its own default mode');
const collection=createMaterialWorkspace({getState:()=>states[0],play:(p,k)=>heard={p,k},place:x=>placed=x,load:x=>loaded=x,refresh:()=>{},notify:x=>notice=x,validate:validateState});
collection.addScale();const scaleItem=collection.serialize()[0];assert.equal(scaleItem.state.n,7);assert.equal(scaleItem.coords.length,7);
const coords=chordCoordinates(states[0],[0,2,4],{2:1});collection.add('chord',states[0],coords,'Test chord');
collection.change({dataset:{materialName:'1'},value:'Renamed chord'});collection.click({dataset:{material:'hear',i:'0'}});assert.equal(heard.k,'scale');assert.equal(heard.p.length,7);
collection.click({dataset:{material:'place',i:'1'}});assert.deepEqual(placed.coords,coords);
const saved=JSON.parse(JSON.stringify(collection.serialize()));collection.restore(null);collection.restore(saved);assert.equal(collection.serialize()[1].label,'Renamed chord');assert.deepEqual(collection.serialize()[1].coords,coords);
let exported;
const hex=createHexboardWorkspace({getStates:boardStates,play:()=>{},refresh:()=>{},notify:e=>notice=e,download:(name,body)=>exported=body,getHz:()=>220});
const click=action=>hex.click({closest:()=>({dataset:{hexAction:action}})});
click('export');const before=exported;const count=hex.showScale(scaleItem.coords,scaleItem.label);assert.ok(count>0);const html=hex.render();assert.match(html,/7\/7 notes represented/);assert.match(html,/scale-highlight/);assert.equal(boardStates()[0].n,31);assert.equal(states[0].n,7);click('export');assert.deepEqual(JSON.parse(exported,(k,v)=>/IdHex$/.test(k)?undefined:v),JSON.parse(before,(k,v)=>/IdHex$/.test(k)?undefined:v),'Temporary scale highlight must not change export');
hex.clearHighlight();assert.ok(!hex.render().includes('class="scale-highlight"'));
// Exercise the real app click handler against the current HexBoard API. A stale
// call to the removed comparison-panel open() method used to break this handoff.
let useScaleHandler,renderedPlay=false,scrolled=false;
const handoff=vm.createContext({compositionWorkspace:{click:()=>false,change:()=>false,pause(){},stop(){},refresh(){}},harmonicWorkspace:{click:()=>false},manualChordInspector:false,states,layoutState:{state:boardStates()[0]},view:'scales',
 hexWorkspace:hex,getLayoutStates:boardStates,
 materialWorkspace:{click:()=>false},presetWorkspace:{click:()=>false},
 renderWorkspace:()=>{renderedPlay=true;},$:()=>({scrollIntoView:()=>{scrolled=true;}}),
 document:{addEventListener:(name,fn)=>{if(name==='click')useScaleHandler=fn;},querySelectorAll:()=>[]}});
vm.runInContext(source.split('\n').find(line=>line.startsWith("document.addEventListener('click',")),handoff);
const useScaleButton={dataset:{hexOpen:'0'},closest:selector=>selector==='button'?useScaleButton:null};
useScaleHandler({target:useScaleButton,shiftKey:false});
assert.equal(handoff.view,'hexboard');assert.ok(renderedPlay&&scrolled);
assert.equal(boardStates()[0].n,states[0].n);assert.equal(boardStates()[0].mode,states[0].mode);
boardStates()[0].n=31;boardStates()[0].mode=0;
assert.ok(hex.showChord(coords,'Voiced chord')>0);assert.equal(hex.chordMode(),'places','a placed collection chord opens Chord → places');assert.match(hex.render(),/Voiced chord/);assert.equal(boardStates()[0].n,31);
const original=states[0].g;states[0].g+=.1;placed=null;collection.click({dataset:{material:'place',i:'1'}});assert.equal(placed,null);assert.match(notice,/source tuning/);collection.click({dataset:{material:'load',i:'1'}});assert.equal(loaded.g,original);assert.equal(boardStates()[0].g,states[0].g);
collection.click({dataset:{material:'remove',i:'0'}});assert.equal(collection.serialize().length,1);
// Exercise actual navigation logic with small interface stand-ins.
const nodes=new Map(),get=id=>{if(!nodes.has(id))nodes.set(id,{id,hidden:false,appendChild(n){n.parentElement=this},insertBefore(n){n.parentElement=this}});return nodes.get(id)};
const nav=vm.createContext({$:get,document:{querySelectorAll:()=>[]}});
vm.runInContext("let view='scales';"+source.split('\n').find(x=>x.startsWith('const lastViews='))+source.split('\n').find(x=>x.startsWith('const sectionFor='))+source.slice(source.indexOf('function syncNavigation(){'),source.indexOf('function switchSection(')),nav);
for(const [view,section] of [['scales','discover'],['matrices','discover'],['targets','discover'],['chords','discover'],['hexboard','play'],['composition','create']]){vm.runInContext(`view='${view}';syncNavigation()`,nav);assert.equal(get('#'+section+'-view').hidden,false);if(section==='create'){assert.notEqual(get('#analysis-explore').parentElement,get('#create-view'),'Create does not take ownership of the HexBoard workspace');assert.equal(get('#material-host').parentElement.id,'#create-view','the material collection belongs in Create');}else {assert.equal(get('#analysis-explore').parentElement.id,'#'+section+'-view');if(section==='discover')assert.notEqual(get('#material-host').parentElement,get('#discover-view'),'the material collection is not attached to Discover');}}
vm.runInContext("view='scales';syncNavigation()",nav);assert.equal(get('#material-host').parentElement.id,'#create-view','leaving Create keeps the collection out of Discover');assert.match(source,/\$\('#material-host'\)\.hidden=sectionFor\(view\)!=='create'/,'the collection stays hidden outside Create');
const htmlSource=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');assert.deepEqual([...htmlSource.matchAll(/id="tab-(\w+)"/g)].map(m=>m[1]),['discover','play','create']);assert.match(htmlSource,/<div id="create-view"[^>]*>[\s\S]*?<h2>Composition suite<\/h2>/);assert.doesNotMatch(htmlSource,/data-view="hexboard"/,'Play is the sole HexBoard entry point.');assert.doesNotMatch(htmlSource,/tab-compare|compare-view|compare-chooser|data-view="compare-/);assert.match(source,/Use scale in Play/);assert.doesNotMatch(source,/Use scale in Create/);const cssSource=readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');assert.match(cssSource,/#play-view \.hex-layout/);assert.doesNotMatch(cssSource,/#create-view \.hex-layout/);
assert.ok(!source.slice(source.indexOf('function renderPanel('),source.indexOf('function scaleControls(')).includes('data-field="n"'));
console.log('Discover/Play/Create routing; independent layout scale; collection naming, playback, source checks, persistence; 7-note highlight on 31-note board; voiced chord placement; unchanged exports passed.');

// Discover is one unified screen: every older Discover view restores into it, and the old
// matrix view keeps the matrix in the centre.
const restoreStart=source.indexOf("lastViews.discover='unified';lastViews.play='hexboard';lastViews.create='composition';unifiedCenter=normalizeUnifiedCenter(data");
assert.ok(restoreStart>=0);
const restoreNavigation=source.slice(restoreStart,source.indexOf('materialWorkspace.restore(data.material',restoreStart));
for(const [settings,want,center] of [
 [{view:'choose',lastViews:{explore:'targets'}},'unified','diamond'],
 [{view:'matrices',lastViews:{explore:'scales'}},'unified','matrix'],
 [{view:'chords',lastViews:{discover:'chords'}},'unified','diamond'],[{view:'unified',unifiedCenter:'matrix'},'unified','matrix'],
 [{view:'hexboard',lastViews:{create:'hexboard'}},'hexboard','diamond'],
 [{view:'composition',lastViews:{create:'composition'}},'composition','diamond'],[{view:'compare-matrices',lastViews:{discover:'targets'}},'unified','diamond'],[{},'unified','diamond']
]){
 const c=vm.createContext({normalizeUnifiedCenter,normalizeScaleView,data:{settings},lastViews:{discover:'matrices',play:'hexboard',create:'composition'},view:'',unifiedCenter:'diamond',scaleView:'horogram'});vm.runInContext(restoreNavigation,c);assert.equal(c.view,want);assert.equal(c.unifiedCenter,center);assert.equal(c.scaleView,'line','sessions without a scale view open on the line');assert.equal(c.lastViews.discover,'unified');assert.equal(c.lastViews.play,'hexboard');assert.equal(c.lastViews.create,'composition');assert.equal(Object.hasOwn(c.lastViews,'compare'),false);
}
// Temperament and tuning live in the header on every page; there is no setup row or top scale control.
const header=htmlSource.slice(htmlSource.indexOf('<header class="app-header">'),htmlSource.indexOf('</header>'));
const headerSetup=header.slice(header.indexOf('<div class="header-setup"'),header.indexOf('<div class="header-actions">'));
for(const id of ['temperament-section','tuning-section'])assert.ok(headerSetup.includes(`id="${id}"`),id);
assert.ok(header.indexOf('class="main-tabs"')<header.indexOf('class="header-setup"')&&headerSetup.indexOf('temperament-section')<headerSetup.indexOf('tuning-section'));
assert.ok(!htmlSource.includes('explore-scale-controls')&&!htmlSource.includes('discover-setup'));
assert.match(headerSetup,/<details id="advanced-temperament-options"[^>]*><summary>Advanced temperament options<\/summary><div class="header-popover-panel">/,'advanced temperament options open as a panel below the header');
const discover=htmlSource.slice(htmlSource.indexOf('<div id="discover-view"'),htmlSource.indexOf('<div id="play-view"'));
assert.ok(discover.includes('id="analysis-explore"'));
assert.ok(!htmlSource.includes('id="choose-view"')&&!htmlSource.includes('id="explore-view"'));
const temperamentOptionsStart=htmlSource.indexOf('<details id="advanced-temperament-options"'),temperamentSearchStart=htmlSource.indexOf('<details id="advanced-temperament"',temperamentOptionsStart),temperamentOptionsEnd=htmlSource.indexOf('</details></section>',temperamentOptionsStart);assert.ok(temperamentOptionsStart>=0&&temperamentSearchStart>temperamentOptionsStart&&temperamentOptionsEnd>temperamentSearchStart);assert.ok(htmlSource.slice(temperamentOptionsStart,temperamentOptionsEnd).includes('id="advanced-temperament-editor"'));assert.ok(htmlSource.slice(temperamentOptionsStart,temperamentOptionsEnd).includes('Advanced temperament options'));
const presetMove=source.slice(source.indexOf('function renderPresetControls('),source.indexOf('function renderPanel('));assert.match(presetMove,/target\.replaceChildren\(editor\)/,'only one preset editor remains inside Advanced temperament options after rerender');
console.log('Discover order and legacy/current session navigation passed.');
