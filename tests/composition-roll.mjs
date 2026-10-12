// Compose piano roll controller: drawing, selection, multi-note moves, velocity, ruler seek/loop,
// keyboard shortcuts, Edit/Rhythm menu actions and the toolbar, over a fake DOM.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCompositionWorkspace} from '../src/composition/composition-ui.mjs';
import {createProject,addEvent,barTicks} from '../src/composition/composition-project.mjs';
import {captureContext,resolveTone} from '../src/composition/composition-context.mjs';
import {transposeSteps} from '../src/composition/composition-edit.mjs';

const demo=JSON.parse(await readFile(new URL('./fixtures/composition/phase0-demo.json',import.meta.url),'utf8'));
let fixture=createProject({context:captureContext(demo.musicalContext.state,220),layout:demo.layout});
for(const e of demo.melodyEvents)fixture=addEvent(fixture,fixture.clips[1].id,{id:e.id,startTick:e.startTick,durationTick:e.durationTick,velocity:e.velocity,tones:[{toneId:e.toneId,coordinate:e.coordinate}]});

// ---- a small fake DOM: elements with datasets, rects, classes and styles ----
function element({dataset={},rect={left:0,top:0,width:800,height:28},selectors={},parent=null}={}){
  const classes=new Set();
  const el={dataset,style:{setProperty(k,v){this[k]=v;}},parentElement:parent,children:[],attrs:{},
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),toggle:(c,on)=>{if(on??!classes.has(c))classes.add(c);else classes.delete(c);},contains:c=>classes.has(c)},
    getBoundingClientRect:()=>rect,setAttribute(k,v){this.attrs[k]=v;},appendChild(c){c.parentElement=this;this.children.push(c);},remove(){this.removed=true;},
    closest:s=>selectors[s]??null,querySelector:()=>null,cloneNode(){return element({dataset,rect,selectors,parent});}};
  return el;
}
const handlers=new Map(),host={innerHTML:'',querySelector:()=>null},previews=[];
const clock={audioSeconds:10,state:'running',clockRevision:1};
let rowEls=[],rollEl=null,hoverOut={textContent:''};
const doc={activeElement:null,body:{},documentElement:{},
  querySelector:s=>s==='[data-comp-hover]'?hoverOut:s==='[data-comp-roll]'?rollEl:null,
  querySelectorAll:s=>s==='.roll-row-grid'?rowEls:[],
  createElement:()=>element(),
  addEventListener:(k,f)=>handlers.set(k,f),removeEventListener:k=>handlers.delete(k)};
const audio={prepare:async()=>{},getClockSnapshot:()=>clock,cancelGroup(){},scheduleVoices:()=>[],previewChord:c=>previews.push(c),previewSequence:c=>previews.push(c)};
const ws=createCompositionWorkspace({document:doc,audio,getState:()=>fixture.context.state,getLayout:()=>fixture.layout,getTonic:()=>220,getMaterial:()=>[],getHost:()=>host,raf:null,timer:{set:()=>0,clear(){}}});
const press=(comp,rest={})=>ws.click({dataset:{comp,...rest},closest(s){return s==='[data-comp]'?this:null;}});
const change=(compField,value)=>ws.change({dataset:{compField},value:String(value)});
const P=()=>ws.getProject(),mel=()=>P().clips[1].events,byId=id=>mel().find(e=>e.id===id);
const tick=async()=>{await new Promise(r=>setTimeout(r,1));};
const key=(k,extra={})=>{const e={key:k,code:extra.code??'',target:doc.body,prevented:false,preventDefault(){this.prevented=true;},ctrlKey:false,metaKey:false,shiftKey:false,altKey:false,...extra};const handled=ws.keydown(e,true);return {handled,prevented:e.prevented};};
ws.restore(fixture);ws.refresh();
const SPAN=8*barTicks(fixture.meter),W=800,x=t=>t/SPAN*W;

// ---- toolbar ----
assert.match(host.innerHTML,/data-comp="tool-draw"[^>]*aria-pressed="true"/,'Draw is the default tool');
assert.match(host.innerHTML,/data-comp-field="gridDivision"/);assert.match(host.innerHTML,/<option value="240" selected>1\/16<\/option>/,'the default grid is 1/16');
assert.match(host.innerHTML,/data-comp-field="gridSwing"/,'swing is offered on a straight grid');
change('gridFeel','triplet');assert.doesNotMatch(host.innerHTML,/data-comp-field="gridSwing"/,'and not on a tuplet grid');assert.match(host.innerHTML,/Grid 1\/16 triplet/);
change('gridFeel','custom');assert.match(host.innerHTML,/data-comp-field="gridN"/);change('gridN',5);change('gridM',4);assert.match(host.innerHTML,/Grid 1\/16 5:4/);
change('gridFeel','straight');change('gridDivision',480);assert.match(host.innerHTML,/class="roll-line-group"|class="roll-line-beat"/,'grid lines are drawn');
assert.match(host.innerHTML,/<svg class="roll-lines" viewBox="0 0 30720 1"/,'the grid SVG spans the project in ticks');
press('snap');assert.match(host.innerHTML,/snap off/);press('snap');
press('velocity-lane');assert.doesNotMatch(host.innerHTML,/roll-velocity-lane/);press('velocity-lane');assert.match(host.innerHTML,/roll-velocity-lane/);
{const w=Number(host.innerHTML.match(/data-comp-roll[^>]*width:(\d+)px/)[1]);press('zoom-in');assert.ok(Number(host.innerHTML.match(/data-comp-roll[^>]*width:(\d+)px/)[1])>w,'zoom in widens the roll');press('zoom-out');}
press('rows-more');assert.match(host.innerHTML,/--row-h:32px/);press('rows-less');assert.match(host.innerHTML,/--row-h:28px/);
// Menus stay open across rebuilds until closed.
const summary=name=>({closest:s=>s==='[data-comp-menu] > summary'?{parentElement:{open:false,dataset:{compMenu:name}}}:null});
ws.click(summary('rhythm'));ws.refresh();assert.match(host.innerHTML,/data-comp-menu="rhythm" open/);
ws.click({closest:()=>null});assert.doesNotMatch(host.innerHTML.replace(/data-comp-menu="rhythm" open/,'x'),/data-comp-menu="\w+" open/);ws.refresh();assert.doesNotMatch(host.innerHTML,/data-comp-menu="rhythm" open/,'an outside click closes it');

// ---- drawing on the eighth grid ----
const rowGrid=element({dataset:{a:'0',b:'0',row:'8'}});
rollEl={dataset:{span:String(SPAN),start:'0'}};
const surface=element({dataset:{a:'0',b:'0'},selectors:{'.roll-row-grid':rowGrid,'[data-comp-roll]':rollEl,'.roll-surface':null}});
surface.closest=s=>s==='.roll-surface'?surface:s==='.roll-row-grid'?rowGrid:s==='[data-comp-roll]'?rollEl:null;
const pd=(target,id,cx,cy=100,extra={})=>handlers.get('pointerdown')({button:0,target,pointerId:id,clientX:cx,clientY:cy,preventDefault(){},...extra});
const pm=(id,cx,cy=100,extra={})=>handlers.get('pointermove')({pointerId:id,clientX:cx,clientY:cy,preventDefault(){},target:{closest:()=>null},...extra});
const pu=(id,type='pointerup')=>handlers.get('pointerup')({pointerId:id,type});
const free=7*3840+100;   // an empty spot in the last bar
pd(surface,1,x(free));pm(1,x(free+3*480));pu(1);
let drawn=mel().find(e=>e.startTick===7*3840&&e.tones[0].coordinate[0]===0&&e.tones[0].coordinate[1]===0);
assert.ok(drawn,'a press draws on the grid cell under the pointer');
assert.equal(drawn.durationTick,3*480,'dragging sets the length to the nearest grid line');
host.innerHTML='';ws.refresh();assert.match(host.innerHTML,new RegExp(`class="roll-note is-selected"[^>]*data-event="${drawn.id}"`),'the new note is selected');
assert.ok(previews.length,'drawing auditions the row');
await tick();
pd(surface,2,x(7*3840+1500));pu(2);
const clicked=mel().find(e=>e.startTick===7*3840+1440&&e.tones[0].coordinate.join()==='0,0');
assert.equal(clicked?.durationTick,480,'a click without dragging draws one grid step');
{const dbl={target:{closest:s=>s==='.roll-note'?{dataset:{event:clicked.id},closest:()=>null}:null},preventDefault(){}};handlers.get('dblclick')(dbl);
 assert.ok(byId(clicked.id),'double-clicking empty space keeps the note its first click drew');}
await tick();
change('noteDuration',960);pd(surface,3,x(7*3840+2000));pu(3);
assert.equal(mel().find(e=>e.startTick===7*3840+1920&&e.tones[0].coordinate.join()==='0,0')?.durationTick,960,'or the chosen new-note length');
change('noteDuration','grid');await tick();
// Alt draws off the grid.
pd(surface,4,x(7*3840+2900)+.5,100,{altKey:true});pu(4);
assert.ok(mel().some(e=>e.startTick>7*3840+2880&&e.startTick<7*3840+2930&&e.startTick%480!==0),'Alt places freely');
await tick();

// ---- selection: replace, Shift toggles, practice blocks edits ----
const ids=mel().slice(0,4).map(e=>e.id);
press('note-select',{event:ids[0]});
const noteEl=id=>{const e=byId(id),n=element({dataset:{event:id,start:String(e.startTick),end:String(e.startTick+e.durationTick)}});n.closest=s=>s==='.roll-note'?n:s==='.roll-row-grid'?rowGrid:s==='[data-comp-roll]'?rollEl:null;return n;};
pd(noteEl(ids[1]),5,10,100,{shiftKey:true});pu(5);await tick();
pd(noteEl(ids[2]),6,10,100,{shiftKey:true});pu(6);await tick();
ws.refresh();
const selected=()=>[...host.innerHTML.matchAll(/class="roll-note is-selected"[^>]*data-event="([^"]+)"/g)].map(m=>m[1]).sort();
assert.deepEqual(selected(),[ids[0],ids[1],ids[2]].sort(),'Shift-click adds notes');
pd(noteEl(ids[1]),7,10,100,{shiftKey:true});pu(7);await tick();ws.refresh();
assert.deepEqual(selected(),[ids[0],ids[2]].sort(),'and removes them');
assert.match(host.innerHTML,/2 notes selected/,'the inspector edits the selection');

// ---- keyboard ----
const before=ids.map(id=>byId(id).startTick);
let k=key('ArrowRight');assert.ok(k.handled&&k.prevented);
assert.deepEqual([byId(ids[0]).startTick,byId(ids[2]).startTick],[before[0]+480,before[2]+480],'→ moves the selection one grid step');
assert.equal(byId(ids[1]).startTick,before[1],'unselected notes stay');
key('ArrowLeft',{shiftKey:true});
{const dt=Math.max(-3840,-Math.min(before[0],before[2])-480);assert.deepEqual([byId(ids[0]).startTick,byId(ids[2]).startTick],[before[0]+480+dt,before[2]+480+dt],'Shift+← moves a bar, the earliest note stopping at the start');}
key('z',{ctrlKey:true});key('z',{ctrlKey:true});
assert.deepEqual([byId(ids[0]).startTick,byId(ids[2]).startTick],[before[0],before[2]],'Ctrl+Z undoes each move');
key('z',{ctrlKey:true,shiftKey:true});assert.equal(byId(ids[0]).startTick,before[0]+480,'Ctrl+Shift+Z redoes');key('z',{ctrlKey:true});
key('ArrowRight',{ctrlKey:true});assert.equal(byId(ids[0]).startTick,before[0]+10,'Ctrl+→ nudges 10 ticks');key('z',{ctrlKey:true});
{
  const c0=byId(ids[0]).tones[0].coordinate;
  key('ArrowUp');assert.deepEqual(byId(ids[0]).tones[0].coordinate,transposeSteps(P().context,c0,1),'↑ moves a scale step');
  key('ArrowDown',{shiftKey:true});assert.deepEqual(byId(ids[0]).tones[0].coordinate,[transposeSteps(P().context,c0,1)[0]-1,transposeSteps(P().context,c0,1)[1]],'Shift+↓ moves a period');
  key('z',{ctrlKey:true});key('z',{ctrlKey:true});
}
{
  const count=mel().length,sel=[ids[0],ids[2]].map(byId),span=Math.max(...sel.map(e=>e.startTick+e.durationTick))-Math.min(...sel.map(e=>e.startTick));
  key('d',{ctrlKey:true});
  assert.equal(mel().length,count+2,'Ctrl+D duplicates');
  ws.refresh();const copies=selected().map(byId);
  assert.deepEqual(copies.map(e=>e.startTick).sort((a,b)=>a-b),sel.map(e=>e.startTick+span).sort((a,b)=>a-b),'right after the selection, and selects the copies');
  key('Delete');assert.equal(mel().length,count,'Delete removes the selection');
  assert.equal(key('Delete').handled,false,'with nothing selected, keys are left alone');
}
press('note-select',{event:ids[0]});
key('c',{ctrlKey:true});
await ws.transport.seek(3840*6);
key('v',{ctrlKey:true});
ws.refresh();
assert.deepEqual(selected().map(byId).map(e=>[e.startTick,e.tones[0].coordinate.join()]),[[3840*6,byId(ids[0]).tones[0].coordinate.join()]],'Ctrl+C, Ctrl+V pastes at the playhead');
assert.equal(ws.transport.position(),3840*6+byId(ids[0]).durationTick,'and moves the playhead past the pasted notes');
key('a',{ctrlKey:true});ws.refresh();assert.equal(selected().length,mel().length,'Ctrl+A selects every note');
key('Escape');ws.refresh();assert.equal(selected().length,0,'Escape clears the selection');
assert.equal(key('ArrowRight',{target:{closest:s=>/input/.test(s)?{}:null}}).handled,false,'fields keep their own keys');
key('v');assert.match(host.innerHTML,/data-comp="tool-select"[^>]*aria-pressed="true"/,'V picks the Select tool');key('b');assert.match(host.innerHTML,/data-comp="tool-draw"[^>]*aria-pressed="true"/,'B picks Draw');

// ---- Edit and Rhythm actions ----
const target=mel().find(e=>e.durationTick>=960);
press('note-select',{event:target.id});
const tStart=target.startTick,tLen=target.durationTick;
press('sel-split',{n:'3'});
let parts=mel().filter(e=>e.startTick>=tStart&&e.startTick<tStart+tLen&&e.tones[0].coordinate.join()===target.tones[0].coordinate.join());
assert.equal(parts.length,3,'Split into 3');assert.ok(parts.every(e=>Math.abs(e.durationTick-tLen/3)<=1));
press('sel-fit',{n:'3',m:'2'});
parts=mel().filter(e=>e.tones[0].coordinate.join()===target.tones[0].coordinate.join()&&e.startTick>=tStart&&e.startTick<tStart+tLen);
assert.ok(Math.abs(Math.max(...parts.map(e=>e.startTick+e.durationTick))-tStart-tLen*2/3)<=2,'Fit 3:2 makes the figure two-thirds as long');
press('sel-legato');
press('undo');press('undo');press('undo');assert.equal(byId(target.id).durationTick,tLen,'each action is one undo step');
change('euclidK',3);change('euclidN',8);change('euclidGate',50);
press('rhythm-euclid');
const hits=mel().filter(e=>e.startTick>=tStart&&e.startTick<tStart+tLen&&e.tones[0].coordinate.join()===target.tones[0].coordinate.join());
assert.deepEqual(hits.map(e=>e.startTick-tStart),[0,3,6].map(i=>Math.round(i*tLen/8)),'E(3,8) replaces the selected note across its span');
assert.ok(hits.every(e=>e.durationTick===Math.round(tLen/8*.5)),'at the chosen gate');
press('undo');
// With nothing selected, a fill goes into the bar at the playhead on the last row used.
ws.click({closest:()=>null});key('Escape');
press('row-hear',{a:'1',b:'2'});
await ws.transport.seek(3840*2+100);
const n0=mel().length;press('rhythm-euclid');
const added=mel().filter(e=>e.tones[0].coordinate.join()==='1,2'&&e.startTick>=3840*2&&e.startTick<3840*3);
assert.equal(mel().length,n0+3,'it adds the pattern');assert.deepEqual(added.map(e=>e.startTick),[0,3,6].map(i=>3840*2+i*480));
press('undo');
{
  const e=mel().find(x=>x.startTick%480!==0)??mel()[0];
  press('note-select',{event:e.id});press('sel-quantize');
  assert.equal(byId(e.id).startTick%480,0,'Quantize snaps starts to the grid');press('undo');
}

// ---- multi-note drag keeps the shape across rows ----
{
  const a=mel()[0],b2=mel().find(e=>e.tones[0].coordinate.join()!==a.tones[0].coordinate.join()&&e.startTick>a.startTick);
  const coords=[...new Set(mel().flatMap(e=>e.tones.map(t=>t.coordinate.join()))).values()].map(s=>s.split(',').map(Number)).sort((p,q)=>resolveTone(P().context,q).cents-resolveTone(P().context,p).cents);
  rowEls=coords.map((c,i)=>element({dataset:{a:String(c[0]),b:String(c[1]),row:String(i)}}));
  const rowOf=c=>coords.findIndex(r=>r.join()===c.join()),fromRow=rowOf(a.tones[0].coordinate);
  press('note-select',{event:a.id});
  pd(noteEl(b2.id),20,10,100,{shiftKey:true});pu(20);await tick();
  const grip=noteEl(a.id);grip.closest=s=>s==='.roll-note'?grip:s==='.roll-row-grid'?rowEls[fromRow]:s==='[data-comp-roll]'?rollEl:null;
  const dir=Math.max(fromRow,rowOf(b2.tones[0].coordinate))<rowEls.length-1?1:-1;
  doc.elementFromPoint=()=>({closest:()=>rowEls[fromRow+dir]});
  pd(grip,21,100,100);pm(21,100+x(960),130);pu(21);await tick();
  assert.equal(byId(a.id).startTick,a.startTick+960);assert.equal(byId(b2.id).startTick,b2.startTick+960,'every selected note moves in time');
  assert.equal(rowOf(byId(a.id).tones[0].coordinate),fromRow+dir);assert.equal(rowOf(byId(b2.id).tones[0].coordinate),rowOf(b2.tones[0].coordinate)+dir,'and by the same number of rows');
  press('undo');await tick();
  // At the edge of the rows the whole shape stops, so intervals never squash.
  doc.elementFromPoint=()=>({closest:()=>rowEls[dir>0?0:rowEls.length-1]});
  pd(grip,24,100,100);pm(24,100,400);pu(24);await tick();
  const shift=rowOf(byId(a.id).tones[0].coordinate)-fromRow;
  assert.equal(rowOf(byId(b2.id).tones[0].coordinate)-rowOf(b2.tones[0].coordinate),shift,'a move past the edge keeps the shape');
  press('undo');await tick();
  // Ctrl-drag copies.
  const n=mel().length;pd(grip,22,100,100,{ctrlKey:true});pm(22,100+x(480),100);pu(22);await tick();
  assert.equal(mel().length,n+2,'Ctrl-drag copies the selection');assert.equal(byId(a.id).startTick,a.startTick,'leaving the originals');
  press('undo');await tick();
  // Dragging the start edge moves the start and keeps the end; Alt drags off the grid.
  const late=mel().find(e=>e.startTick>=960&&e.durationTick>=480),edge=element({dataset:{compResize:'start'}}),lateEl=noteEl(late.id);
  press('note-select',{event:late.id});
  pd({closest:s=>s==='.roll-note'?lateEl:s==='[data-comp-resize]'?edge:null},23,100,100);pm(23,100-x(480),100);pu(23);await tick();
  assert.equal(byId(late.id).startTick,late.startTick-480);assert.equal(byId(late.id).startTick+byId(late.id).durationTick,late.startTick+late.durationTick,'the start edge keeps the end');
  press('undo');await tick();
  pd({closest:s=>s==='.roll-note'?lateEl:s==='[data-comp-resize]'?edge:null},25,100,100,{altKey:true});pm(25,100+x(200),100,{altKey:true});pu(25);await tick();
  assert.equal(byId(late.id).startTick,late.startTick+200,'Alt resizes off the grid');
  press('undo');await tick();
  const end=element({dataset:{compResize:''}});
  pd({closest:s=>s==='.roll-note'?lateEl:s==='[data-comp-resize]'?end:null},26,100,100);pm(26,100-x(4000),100);pu(26);await tick();
  assert.equal(byId(late.id).durationTick,480,'a note never shrinks below one grid cell');
  press('undo');await tick();
  rowEls=[];doc.elementFromPoint=undefined;
}

// ---- velocity lane ----
{
  const a=mel()[0];press('note-select',{event:a.id});
  const lane=element({rect:{left:0,top:0,width:800,height:58}}),bar=element({dataset:{velEvent:a.id}});
  const t={closest:s=>s==='[data-comp-velocity]'?lane:s==='[data-vel-event]'?bar:null};
  pd(t,30,10,40);pm(30,10,6);pu(30);await tick();
  assert.ok(byId(a.id).velocity>a.velocity,'dragging a bar up raises its velocity');
  press('undo');
  // Drawing across the lane sets each note it crosses (here, every note: nothing is selected).
  key('Escape');ws.refresh();
  const empty={closest:s=>s==='[data-comp-velocity]'?lane:null};
  lane.closest=s=>s==='[data-comp-roll]'?rollEl:null;
  pd(empty,31,0,57);pm(31,W,57);pu(31);await tick();
  assert.ok(mel().every(e=>e.velocity<=3),'drawing low across the lane quiets every note');
  press('undo');
}

// ---- ruler: click seeks, drag sets the loop ----
{
  const ruler=element({rect:{left:0,top:0,width:800,height:30}});ruler.closest=s=>s==='[data-comp-roll]'?rollEl:null;ruler.querySelector=()=>null;
  const t={closest:s=>s==='[data-comp-ruler]'?ruler:null};
  pd(t,40,x(3840+500));pu(40);await tick();await tick();
  assert.equal(ws.transport.position(),3840+480,'a click seeks to the nearest grid line');
  pd(t,41,x(3840*3+100));pm(41,x(3840*5-100));pu(41);await tick();
  assert.deepEqual(P().loop,{enabled:true,startTick:3840*3,endTick:3840*5},'a drag sets and enables the loop');
  change('loop','off');assert.deepEqual(P().loop,{enabled:false,startTick:3840*3,endTick:3840*5},'turning the loop off keeps its range');
}

// ---- Play: no editing ----
press('mode-game');
{const n=mel().length,before=JSON.stringify(P());pd(surface,50,x(free));pu(50);key('a',{ctrlKey:true});key('Delete');press('undo');change('tempo',70);assert.equal(JSON.stringify(P()),before,'Play leaves the composition alone');assert.equal(mel().length,n);}
press('mode-compose');

// ---- hover readout ----
rowGrid.closest=s=>s==='[data-comp-roll]'?rollEl:null;
handlers.get('pointermove')({pointerId:99,clientX:x(3840+960+480+10),clientY:100,target:surface});
assert.equal(hoverOut.textContent,'degree 0 · 2.2 + 1/2','the pointer readout names the row and the grid position');

ws.dispose();assert.equal(handlers.size,0,'every listener is removed');
console.log('composition-roll: ok');
