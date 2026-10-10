import assert from 'node:assert/strict';
import {makeState} from '../dist/engine.mjs';
import {diamondLayout} from '../dist/diamond-layout.mjs';
import {diamondApproximation} from '../dist/tonality-diamond.mjs';
import {diamondFocus,matrixFocusDegrees,relativeRatios} from '../dist/harmonic-focus.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {matrixScale} from '../dist/matrix.mjs';
import {noteCoordinate} from '../dist/pitch.mjs';
import {equivalencePolicy,quotientCoordinate} from '../dist/harmonic-equivalence.mjs';
import {createHarmonicCatalogueWorkspace} from '../dist/harmonic-catalogue-ui.mjs';

// JI chords sit on diamond lines as written from 1/1: rows for otonal, columns for utonal, both otherwise.
const geometry=diamondLayout({limit:15,primeLimit:null}),place=(form,ratios)=>diamondFocus(geometry.cells,{kind:'ji',form,ratios},{harmonics:geometry.harmonics});
const major=place('otonal',['1/1','5/4','3/2']);
assert.deepEqual(major.placements.map(p=>[p.axis,p.harmonic]),[['row',1],['row',3]]);assert.equal(major.ids.length,6);
assert.ok(major.placements.every(p=>geometry.cells.filter(c=>p.ids.includes(c.id)).every(c=>c.j===p.line)),'an otonal placement shares one denominator');
const minor=place('utonal',['1/1','6/5','3/2']);assert.ok(minor.placements.length&&minor.placements.every(p=>p.axis==='column'));
const dyad=place('ambitonal',['1/1','7/4']);assert.deepEqual(new Set(dyad.placements.map(p=>p.axis)),new Set(['row','column']));
const partial=place('other',['1/1','5/4','3/2','11/10']);assert.equal(partial.partial,true);
assert.deepEqual(place('otonal',['1/1']).ids,[],'a single note places nothing');

// A tempered chord lights every cell whose approximation is one of its notes relative to 1/1.
const state={...makeState('meantone'),n:7,mode:0},policy=equivalencePolicy(state,'octave'),keyOf=m=>quotientCoordinate(policy,m).key;
const cells=geometry.cells.map(cell=>({...cell,status:diamondApproximation(state,cell,{limit:15,primeLimit:state.basis,scope:'mapping',filter:'all',tol:20,outside:true})}));
const fifth=cells.find(cell=>cell.label==='3/2').status.approximation.m,tempered=diamondFocus(cells,{kind:'tempered',classKeys:[keyOf([0,0]),keyOf(fifth)]},{classKeyOf:keyOf});
assert.ok(tempered.ids.length>=2&&tempered.ids.every(id=>[keyOf([0,0]),keyOf(fifth)].includes(keyOf(cells.find(c=>c.id===id).status.approximation.m))));

assert.deepEqual([...matrixFocusDegrees({degrees:[0,9,-3]},7)],[0,2,4]);assert.equal(matrixFocusDegrees(null,7),null);

// The workspace exposes its selection as the focus, with the chosen rotation and an occurrence.
const ui=createHarmonicCatalogueWorkspace({getState:()=>state,getSettings:()=>({limit:15,primeLimit:state.basis,tol:20})});
ui.setEnabled(true);while(ui.model().status!=='complete')await new Promise(resolve=>setTimeout(resolve,5));
await ui.openInput('4:5:6');let focus=ui.focus();
assert.equal(focus.kind,'ji');assert.equal(focus.form,'otonal');assert.deepEqual(focus.ratios,['1/1','5/4','3/2']);assert.ok(focus.degrees?.length===3);
let html=ui.render();
assert.match(html,/class="form-badge otonal">Otonal/);assert.match(html,/class="harmony-forms">Otonal <b>4:5:6<\/b> · Utonal <b>1\/15:12:10<\/b>/,'the same chord spelled utonally');assert.match(html,/Also written as/);
assert.equal((html.match(/data-harmony-action="rotation"/g)||[]).length,3);
let heard=null;const played=createHarmonicCatalogueWorkspace({getState:()=>state,getSettings:()=>({limit:15,primeLimit:state.basis,tol:20}),play:notes=>heard=notes});played.setEnabled(true);
while(played.model().status!=='complete')await new Promise(resolve=>setTimeout(resolve,5));await played.openInput('4:5:6');
played.click({dataset:{harmonyAction:'rotation',index:'1'}});assert.deepEqual(played.focus().ratios,['1/1','6/5','8/5'],'a rotation re-roots the focus');
assert.ok(heard.length===3&&heard.every((c,i)=>i===0||c>heard[i-1])&&heard.at(-1)-heard[0]<1200,'a rotation sounds its bass first, within an octave');
played.destroy();
const et=ui.model().result.items.find(row=>row.kind==='tempered'&&row.status==='essentially-tempered');
ui.click({dataset:{harmonyAction:'select',id:et.id}});focus=ui.focus();html=ui.render();
assert.equal(focus.kind,'tempered');assert.equal(focus.form,'et');assert.equal(focus.classKeys.length,et.shape.coordinates.length);
assert.match(html,/class="form-badge et">Essentially tempered/);assert.match(html,/Commas joining these intervals: /);
// Another view focuses a chord: a JI family by any rotation, matched to that rotation, or a tempered shape.
assert.deepEqual(relativeRatios([{label:'5/4',n:5,d:4,c:386.3},{label:'3/2',n:3,d:2,c:702},{label:'15/8',n:15,d:8,c:1088.3}]),['1/1','6/5','3/2']);
assert.equal(ui.focusExternal({ratios:['1/1','6/5','8/5']}),true);focus=ui.focus();
assert.equal(focus.label,'4:5:6');assert.deepEqual(focus.ratios,['1/1','6/5','8/5'],'the picked rotation is kept');
const revealed=ui.takeReveal();assert.equal(revealed,ui.model().entry.id);assert.equal(ui.takeReveal(),null,'a reveal is taken once');
assert.ok(ui.renderParts({directory:true}).list.includes(`data-id="${revealed.replaceAll('"','&quot;')}" aria-pressed="true"`),'the focused row is shown in its opened group');
assert.equal(ui.focusExternal({coordinates:et.shape.coordinates}),true);assert.equal(ui.model().entry.id,et.id,'tempered coordinates find their shape');
assert.equal(ui.focusExternal({ratios:['1/1','11/10','3/2']}),false,'a chord outside the directory is not focused');
ui.change({dataset:{harmonyField:'follow'},checked:false});assert.equal(ui.followPlaying(),false);assert.equal(ui.serialize().followPlaying,false);
ui.restore({...ui.serialize(),followPlaying:true});assert.equal(ui.followPlaying(),true);

// The app's diamond follow and matrix Shift-click, run from source against stand-ins.
const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8'),slice=(start,end)=>app.slice(app.indexOf(start),app.indexOf(end,app.indexOf(start)));
const calls=[],timers=[];let display={kind:'chord',source:'selected'},shown=[];
const sandbox=vm.createContext({harmonicMode:'b',view:'unified',states:[state],settings:()=>({layout:'notes'}),matrixScale,noteCoordinate,toast:()=>{},applyHarmonicFocus:()=>{},relativeRatios,
 harmonicWorkspace:{focusExternal:value=>{calls.push(value);return true;},followPlaying:()=>sandbox.following},following:true,
 diamondWorkspace:{chordDisplay:()=>display,displayCells:()=>shown},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{}});
vm.runInContext(slice('let followTimer=null','function applyHarmonicFocus(){'),sandbox);
const triad=['1/1','5/4','3/2'].map((label,i)=>{const cell=cells.find(c=>c.label===label);return {...cell,id:'c'+i};});
shown=triad.slice(0,2);sandbox.followDiamond();assert.equal(calls.length,0,'two pitch classes are not followed');
shown=triad;sandbox.followDiamond();assert.equal(calls.length,1,'a selected triad is focused at once');assert.equal(JSON.stringify(calls[0].ratios),JSON.stringify(['1/1','5/4','3/2']));assert.equal(calls[0].coordinates.length,3);
display={kind:'chord',source:'playing'};sandbox.followDiamond();assert.equal(calls.length,1,'a held chord waits');timers.pop()();assert.equal(calls.length,2,'and is focused once it settles');
sandbox.following=false;sandbox.followDiamond();assert.equal(timers.length,0,'following can be switched off');
sandbox.pickMatrixCell(0,2);assert.equal(calls.length,2);sandbox.pickMatrixCell(0,4);assert.equal(calls.length,3,'three scale degrees form a chord');
const m=matrixScale(state);assert.equal(JSON.stringify(calls.at(-1).coordinates),JSON.stringify([0,2,4].map(d=>noteCoordinate(state,m.notes[d]))));
sandbox.pickMatrixCell(0,4);assert.equal(vm.runInContext('matrixChordCells.size',sandbox),1,'Shift-clicking a picked cell removes it');
ui.sync();while(ui.model().status!=='complete')await new Promise(resolve=>setTimeout(resolve,5));
assert.equal(ui.matchPlayed(et.shape.coordinates),ui.matchPlayed(et.shape.coordinates),'a held note set is matched once per directory result');
// Without a chosen voicing, the handed-over selection sounds the focused rotation, root lowest.
ui.focusExternal({ratios:['1/1','6/5','8/5']});
{const pitches=ui.selection().voicing.pitches,low=Math.min(...pitches);
 assert.equal(pitches.indexOf(low),ui.focus().rotation,'the rotation root is the lowest voice');assert.ok(Math.max(...pitches)-low<1200,'every voice lies within the octave above it');}

// Play: a newly focused chord is handed over once; a chord focused from Play is not handed back.
const handed=[],focused=[],playTimers=[];
const play=vm.createContext({harmonicMode:'b',
 harmonicWorkspace:{selection:()=>({shapeId:'s',interpretationId:play.current,voicing:{coords:[[0,0]]}}),followPlaying:()=>play.following,focusExternal:value=>{focused.push(value);play.current='played';return true;}},
 hexWorkspace:{acceptHarmonicSelection:value=>handed.push(value.interpretationId)},current:'a',following:true,
 setTimeout:fn=>{playTimers.push(fn);return playTimers.length;},clearTimeout:()=>{}});
vm.runInContext(slice('let playFocusKey=','function scheduleLiveChordUpdate('),play);
play.syncPlayFocus();play.syncPlayFocus();assert.equal(JSON.stringify(handed),JSON.stringify(['a']),'the same focus is handed over once');
play.followPlay([{coordinate:[0,0]},{coordinate:[0,1]}]);assert.equal(playTimers.length,0,'two notes are not followed');
play.followPlay([{coordinate:[0,0]},{coordinate:[0,1]},{coordinate:[-2,4]},{coordinate:[0,1]}]);playTimers.pop()();
assert.equal(focused.length,1);assert.equal(focused[0].coordinates.length,3,'held notes focus their distinct coordinates');
play.syncPlayFocus();assert.equal(handed.length,1,'a chord focused from Play is not handed back to Play');
play.following=false;play.followPlay([{coordinate:[0,0]},{coordinate:[0,1]},{coordinate:[-2,4]}]);assert.equal(playTimers.length,0,'following can be switched off');
ui.destroy();
console.log('Focused harmony: diamond placement by form, partial lines, tempered cells, matrix degrees, rotations, ET commas, focus from the diamond, matrix and Play, the Play handover and following passed.');
