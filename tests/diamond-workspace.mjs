import {createHexboardWorkspace} from '../dist/hexboard-ui.mjs';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diamondLayout,parseDiamondHarmonics,selectedDiamondCoordinates,selectedDiamondChord,fitDiamondChord} from '../dist/diamond-layout.mjs';
import {createDiamondWorkspace} from '../dist/diamond-workspace.mjs';
import {diamondApproximation,maximumDiamondError} from '../dist/tonality-diamond.mjs';
import {diamondTargets} from '../dist/ji-limit-engine.mjs';
import {makeState,scale,mapRatio} from '../dist/engine.mjs';
import {fromCommas} from '../dist/tuning.mjs';
import {createMaterialWorkspace} from '../dist/material-ui.mjs';
import {createChordWorkspace} from '../dist/chord-ui.mjs';
import {validateState} from '../dist/state.mjs';
const cfg={limit:15,primeLimit:[2,3,5,11],scope:'mapping',tol:100,outside:true,filter:'mapped'};
for(const primeLimit of [null,3,5,7,11,13,[2,3,5,11]]){
 const g=diamondLayout({...cfg,primeLimit});assert.equal(g.cells.length,g.count**2);
 assert.deepEqual(new Set(g.cells.map(t=>t.label)),new Set(diamondTargets(15,primeLimit).map(t=>t.label)),'compaction preserves unique analytical targets');
 for(const a of g.cells)for(const b of g.cells)if(a!==b){const distance=Math.abs(a.x-b.x)/g.w+Math.abs(a.y-b.y)/g.h;assert.ok(distance>=2);if(Math.abs(a.i-b.i)+Math.abs(a.j-b.j)===1)assert.equal(distance,2);}
}
assert.deepEqual(diamondLayout(cfg).harmonics,[1,3,5,9,11,15]);
for(const text of ['1', '4:5:5','4:0:6','4:5.5:6','4::5','4:<script>:6','1:257'])assert.throws(()=>parseDiamondHarmonics(text));
for(const harmonics of ['8:9:10:11:12','4:5:6:7:9:11']){
 const ns=parseDiamondHarmonics(harmonics),g=diamondLayout(cfg,{harmonics});
 const row=g.cells.filter(t=>t.j===0),col=g.cells.filter(t=>t.i===0);
 assert.deepEqual(row.map(t=>t.n/t.d),ns.map(n=>n/ns[0]));assert.deepEqual(col.map(t=>t.n/t.d),ns.map(n=>ns[0]/n));
 assert.ok(diamondLayout(cfg,{harmonics,fold:true}).cells.every(t=>t.c>=0&&t.c<1200));
}
const s=makeState('meantone'),layout=diamondLayout(cfg,{harmonics:'4:5:6'});
const cells=layout.cells.map(t=>({...t,status:diamondApproximation(s,t,cfg)}));
assert.deepEqual(selectedDiamondChord(layout.cells,['0:0','1:0','2:0']),{kind:'chord',form:'otonal',cardinality:3,otonal:'4:5:6',utonal:'1/6:5:4'});
assert.deepEqual(selectedDiamondChord(layout.cells,['0:0','0:1','0:2']),{kind:'chord',form:'utonal',cardinality:3,otonal:'10:12:15',utonal:'1/6:5:4'});
assert.equal(selectedDiamondChord(layout.cells,['0:0','1:1','2:2']),null,'repeated unison cells are not a multi-tone chord');
const largeLine=diamondLayout(cfg,{harmonics:'1:2:3:4:5:6:7:8:9',fold:false});
assert.deepEqual(selectedDiamondChord(largeLine.cells,largeLine.harmonics.map((_,i)=>`${i}:0`)),{kind:'collection',form:'otonal',cardinality:9});
const coords=selectedDiamondCoordinates(cells,['0:0','1:0','2:0']);assert.deepEqual(coords,[[0,0],mapRatio(5,4,s),mapRatio(3,2,s)]);
assert.deepEqual(selectedDiamondCoordinates(cells,['0:0','1:1']),[[0,0]]);
assert.throws(()=>selectedDiamondCoordinates([{id:'0:0',status:{approximation:null}}],['0:0']),/no available approximation/);
for(const state of [s,{...fromCommas('128/125','2.3.5','Computed WE'),n:2,mode:0},{...fromCommas('245/243','3.5.7','Computed WE'),n:2,mode:0}]){
 const pairs=state.basis[0]===3?[[1,1],[5,3],[7,3]]:[[1,1],[3,2],[9,8]],ms=pairs.map(([n,d])=>mapRatio(n,d,state));
 const fitted=fitDiamondChord(state,ms);assert.equal(fitted.p,state.p);assert.equal(fitted.g,state.g);assert.ok(ms.every(m=>scale(fitted).notes.some(n=>n.k===m[1])));
 const chord=createChordWorkspace({getStates:()=>[fitted],play(){},refresh(){},notify(){}});assert.equal(chord.fromCoordinates(ms,'Diamond'),true);
}
assert.throws(()=>fitDiamondChord(s,[[0,0],[1,0]]),/distinct scale degrees/);
assert.throws(()=>fitDiamondChord(s,[[0,0],[0,300]]),/256/);
const customError=maximumDiamondError(s,{...cfg,diamondLayout:{harmonics:'4:5:6',fold:false}});
assert.ok(customError>=Math.max(...cells.map(t=>Math.abs(t.status.approximation.error))));
let state=s,notice='',played,placed,chordItem,chordReadout,refreshed=0;
const doc={querySelectorAll:()=>[],querySelector:()=>null};
const collection=createMaterialWorkspace({getState:()=>state,play(){},place(){},load(){},refresh(){},notify(){},validate:validateState});
const workspace=createDiamondWorkspace({document:doc,getState:()=>state,refresh:()=>refreshed++,notify:s=>notice=s,play:x=>played=x,onInspect(){},onCollect:item=>collection.add(item.kind,state,item.coords,item.label,{exact:true}),onPlace:item=>placed=item,onChord:item=>chordItem=item,onChordChange:info=>chordReadout=info});
const workspaceSource=readFileSync(new URL('../dist/diamond-workspace.mjs',import.meta.url),'utf8');const optionsMarkup=workspaceSource.slice(workspaceSource.indexOf('function optionsMarkup(){'),workspaceSource.indexOf('function mountOptions()'));assert.doesNotMatch(optionsMarkup,/Pointer action/,'pointer action belongs on the canvas, not in advanced options');assert.match(workspaceSource,/interaction==='select'\?/,'selection actions render only in cell-selection mode');
const appSource=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');assert.match(appSource,/onActiveNotesChange:notes=>diamondWorkspace\.updatePlaying\(notes\)/,'diamond playback forwards its held notes to chord display');
workspace.restore({harmonics:'4:5:6',fold:false,interaction:'select',selected:[]});
const diamondMarkup=workspace.render(cfg,'');
assert.match(diamondMarkup,/data-diamond-chord/,'the diamond has a live JI chord readout');
assert.ok(diamondMarkup.indexOf('diamond-detail-0')<diamondMarkup.indexOf('class="diamond-scroll"'),'selected interval details appear at the upper left of the canvas');
assert.ok(diamondMarkup.indexOf('diamond-pointer-controls')<diamondMarkup.indexOf('<svg'),'pointer controls appear above the canvas');
assert.match(diamondMarkup,/data-diamond-setting="interaction"/);
assert.doesNotMatch(diamondMarkup,/diamond-pointer-help|Click, hold and drag/,'play instructions are hidden in cell-selection mode');
assert.doesNotMatch(diamondMarkup,/aria-describedby="diamond-pointer-help"/,'selection mode does not reference the hidden instructions');
assert.ok(diamondMarkup.indexOf('</label>')<diamondMarkup.indexOf('diamond-selection-actions'),'selection actions follow the pointer selector');
assert.ok(diamondMarkup.indexOf('diamond-selection-actions')<diamondMarkup.indexOf('<svg'),'selection actions sit above the diamond with the pointer selector');
assert.doesNotMatch(diamondMarkup,/Pure · 0¢/,'the error legend no longer labels zero separately');
assert.doesNotMatch(diamondMarkup,/Select cells or a line, then play/,'remove the helper sentence');
for(const diamondKey of ['0:0','1:0','2:0'])assert.deepEqual(workspace.press({dataset:{diamondKey}}),{enabled:false,track:true});
assert.equal(chordReadout.source,'selected');assert.equal(chordReadout.form,'otonal');assert.equal(chordReadout.otonal,'4:5:6');
assert.equal(refreshed,0,'cell selection must not replace the live SVG');
const click=action=>workspace.click({closest:()=>({dataset:{diamondAction:action}})});
click('hear');assert.deepEqual(played,coords.map(m=>m[0]*s.p+m[1]*s.g));assert.equal(chordReadout.source,'playing','Play selection marks the selected JI chord as playing');click('collect');click('place');click('chord');
assert.deepEqual(collection.serialize()[0].coords,coords);assert.equal(collection.serialize()[0].exact,true);assert.deepEqual(placed.coords,coords);assert.deepEqual(chordItem.coords,coords);
const saved=workspace.serialize();workspace.restore(null);workspace.restore(JSON.parse(JSON.stringify(saved)));workspace.render(cfg,'');assert.deepEqual(workspace.serialize(),saved);
workspace.render({...cfg,scope:'mode'},'');assert.equal(workspace.serialize().selected.length,0,'new approximation source must invalidate old selections');
workspace.restore({harmonics:'4:5:7',fold:false,interaction:'select',selected:['0:0','2:0']});workspace.render(cfg,'');click('collect');assert.match(notice,/no available approximation/);assert.equal(collection.serialize().length,1);
workspace.restore({...workspace.serialize(),interaction:'play'});const playModeMarkup=workspace.render(cfg,'');assert.doesNotMatch(playModeMarkup,/diamond-selection-actions/,'selection actions stay hidden while notes are played');assert.match(playModeMarkup,/diamond-pointer-controls/,'the pointer action selector remains on the canvas');assert.match(playModeMarkup,/id="diamond-pointer-help"/,'play instructions remain visible in note-play mode');assert.equal(workspace.chordDisplay().source,'selected','a multi-cell selection remains labeled when switching to play mode');
workspace.updatePlaying([{id:'0:0'},{id:'0:1'},{id:'0:2'}]);assert.equal(chordReadout.source,'playing');assert.equal(chordReadout.form,'utonal');assert.equal(chordReadout.utonal,'1/7:5:4');
workspace.updatePlaying([]);assert.equal(workspace.chordDisplay().source,'selected','the selected chord remains visible after playback ends');
console.log('Compact flush subgroup geometry; harmonic/reciprocal register; exact transfers; non-octave chord fitting; selection and session lifecycle passed.');

const boardState=fitDiamondChord(s,coords),board=createHexboardWorkspace({getStates:()=>[boardState],play(){},refresh(){},notify(){},download(){},getHz:()=>220});
assert.ok(board.showChord(coords,'Diamond 4:5:6',{exact:true,periodCopies:true})>0,'diamond coordinates produce real voiced HexBoard placements');
