import assert from 'node:assert/strict';
import {createKeyHarmoniesUi} from '../dist/key-harmonies-ui.mjs';

// A fake board API with three harmonies for key 65.
const mk=(label,roleNote,n,max=1.5)=>({label,shape:[],max,mapped:3,total:3,roles:[{note:roleNote,ratio:label.split(' · ')[roleNote]}],placements:Array.from({length:n},(_,i)=>({keys:[65,70+i,80+i],reach:3}))});
const base=[mk('1/1 · 5/4 · 3/2',0,4),mk('1/1 · 6/5 · 3/2',1,1,5.25),mk('1/1 · 4/3 · 8/5',2,2)];
function setup({harmonies=base,key={index:65,cents:0,degree:0}}={}){
  const handlers={},calls=[],ticks=[];
  let result={key,size:3,reach:6,harmonies,count:harmonies.length,limited:false,settings:{limit:15,tolerance:10}};
  let fingerings=null,view=true;
  const host={hidden:false,innerHTML:'',addEventListener:(n,f)=>handlers[n]=f};
  const api={
    harmonies:o=>{calls.push(['harmonies',o]);return result?{...result,size:o.size,reach:o.reach}:null;},
    showHarmony:(i,p,o)=>{calls.push(['show',i,p,o]);const h=result.harmonies[i];if(!h||p>=h.placements.length)return false;fingerings={label:h.label,index:p,placements:h.placements};return true;},
    hear:k=>calls.push(['hear',k]),
  };
  const ui=createKeyHarmoniesUi({host,api,getFingerings:()=>fingerings,isPlayView:()=>view,timer:{set:fn=>{ticks.push(fn);return 1;},clear(){}}});
  const el=(dataset,extra={})=>({dataset,closest(sel){return (sel==='[data-kh]'&&dataset.kh!==undefined)||(sel==='[data-kh-size]'&&dataset.khSize!==undefined)||(sel==='[data-kh-reach]'&&dataset.khReach!==undefined)?this:null;},...extra});
  return {host,calls,ui,tick:()=>ticks[0](),click:(kh,d={})=>handlers.click({target:el({kh,...d})}),size:v=>handlers.change({target:el({khSize:''},{value:String(v)})}),reach:v=>handlers.change({target:el({khReach:''},{value:String(v)})}),
    set result(v){result=v;},get result(){return result;},set view(v){view=v;},set fingerings(v){fingerings=v;}};
}

// Collapsed by default: the header says what is there without taking over the page.
{
  const t=setup();
  assert.match(t.host.innerHTML,/Harmonies with key 65/);
  assert.match(t.host.innerHTML,/3 chords within reach 6/);assert.match(t.host.innerHTML,/degree 0 · 0\.0 ¢ above the tonic/);
  assert.match(t.host.innerHTML,/data-kh="toggle" aria-expanded="false">Show/);
  assert.doesNotMatch(t.host.innerHTML,/harmony-row/,'the list is hidden until opened');
}

// Opened: the list, with the role the key plays, how many places, and quality.
{
  const t=setup();t.click('toggle');
  assert.match(t.host.innerHTML,/Hide/);
  const rows=[...t.host.innerHTML.matchAll(/<b>([^<]*)<\/b>\s*<span>([^<]*)</g)].map(m=>[m[1],m[2]]);
  assert.deepEqual(rows,[
    ['1/1 · 5/4 · 3/2','this key is the root · 4 places · worst error 1.5 ¢ · 3/3 mapped'],
    ['1/1 · 6/5 · 3/2','this key is the 6/5 · 1 place · worst error 5.3 ¢ · 3/3 mapped'],   // 5.25.toFixed(1) is 5.3
    ['1/1 · 4/3 · 8/5','this key is the 8/5 · 2 places · worst error 1.5 ¢ · 3/3 mapped'],
  ]);
  assert.match(t.host.innerHTML,/odd limit 15 and 10¢ tolerance/);
  assert.match(t.host.innerHTML,/<option value="3" selected>3<\/option>/);assert.match(t.host.innerHTML,/<option value="6" selected>6<\/option>/);
  assert.doesNotMatch(t.host.innerHTML,/harmony-nav/,'no placement controls until one is chosen');
}

// Choosing a harmony lights it and shows placement controls; Next/Previous wrap; Hear sounds the placement.
{
  const t=setup();t.click('toggle');
  t.click('pick',{i:'0'});
  assert.deepEqual(t.calls.find(c=>c[0]==='show'),['show',0,0,{size:3,reach:6}],'the board is asked to light placement 0');
  assert.match(t.host.innerHTML,/aria-pressed="true"/);assert.match(t.host.innerHTML,/Place 1 of 4 · keys 65, 70, 80/);
  t.click('next');assert.match(t.host.innerHTML,/Place 2 of 4 · keys 65, 71, 81/);
  t.click('prev');t.click('prev');assert.match(t.host.innerHTML,/Place 4 of 4 · keys 65, 73, 83/,'Previous wraps to the last place');
  t.click('next');assert.match(t.host.innerHTML,/Place 1 of 4/,'Next wraps to the first');
  t.click('next');t.click('hear');
  assert.deepEqual(t.calls.filter(c=>c[0]==='hear').at(-1),['hear',[65,71,81]],'Hear plays the shown placement');
  // A single-place harmony has nothing to step through.
  t.click('pick',{i:'1'});assert.match(t.host.innerHTML,/Place 1 of 1/);assert.match(t.host.innerHTML,/data-kh="prev" disabled/);assert.match(t.host.innerHTML,/data-kh="next" disabled/);
  // Only the chosen row shows controls.
  assert.equal((t.host.innerHTML.match(/harmony-nav/g)||[]).length,1);
}

// If the board moves on to something else, the panel stops claiming a harmony is shown.
{
  const t=setup();t.click('toggle');t.click('pick',{i:'0'});
  assert.match(t.host.innerHTML,/harmony-nav/);
  t.fingerings={label:'something else',index:0,placements:[]};t.tick();
  assert.doesNotMatch(t.host.innerHTML,/harmony-nav/);assert.match(t.host.innerHTML,/aria-pressed="false"/);
  t.fingerings=null;t.tick();assert.doesNotMatch(t.host.innerHTML,/harmony-nav/);
}

// Following the board's own navigation (e.g. the Next placement button) keeps the panel in step.
{
  const t=setup();t.click('toggle');t.click('pick',{i:'0'});
  t.fingerings={label:base[0].label,index:2,placements:base[0].placements};t.tick();
  assert.match(t.host.innerHTML,/Place 3 of 4/);
}

// Notes and reach change the query, clear the chosen harmony and ask again.
{
  const t=setup();t.click('toggle');t.click('pick',{i:'0'});
  t.size(4);assert.deepEqual(t.calls.at(-1)[1],{size:4,reach:6});assert.doesNotMatch(t.host.innerHTML,/harmony-nav/);assert.match(t.host.innerHTML,/<option value="4" selected>4<\/option>/);
  t.reach(9);assert.deepEqual(t.calls.at(-1)[1],{size:4,reach:9});assert.match(t.host.innerHTML,/<option value="9" selected>9<\/option>/);
  t.size(7);assert.deepEqual(t.calls.at(-1)[1],{size:3,reach:9},'unsupported sizes fall back to 3');
}

// Long lists show a first page and can show everything.
{
  const many=Array.from({length:60},(_,i)=>mk(`1/1 · ${i+2}/${i+1} · 3/2`,0,1));
  const t=setup({harmonies:many});t.click('toggle');
  assert.equal((t.host.innerHTML.match(/harmony-row/g)||[]).length,24);assert.match(t.host.innerHTML,/Show all 60/);
  t.click('more');assert.equal((t.host.innerHTML.match(/harmony-row/g)||[]).length,60);assert.match(t.host.innerHTML,/Show the first 24/);
  t.click('more');assert.equal((t.host.innerHTML.match(/harmony-row/g)||[]).length,24);
  const few=setup();few.click('toggle');assert.doesNotMatch(few.host.innerHTML,/Show all/);
}

// Empty and not-selectable cases.
{
  const t=setup({harmonies:[]});t.click('toggle');
  assert.match(t.host.innerHTML,/No 3-note chord with this key fits within reach 6/);assert.doesNotMatch(t.host.innerHTML,/harmony-list/);
  assert.match(t.host.innerHTML,/0 chords within reach 6/);
  const none=setup({key:null});
  assert.match(none.host.innerHTML,/Select an enabled key on the board/);
  const one=setup({harmonies:[base[0]]});assert.match(one.host.innerHTML,/1 chord within reach 6/);
}

// Keeps up with the board: a new key or a new list re-renders; unchanged state does not touch the DOM; hidden off the Play view.
{
  const t=setup();t.click('toggle');
  let writes=0;const original=t.host;let html=original.innerHTML;
  Object.defineProperty(original,'innerHTML',{get:()=>html,set:v=>{writes++;html=v;}});
  t.tick();assert.equal(writes,0,'nothing changed, so nothing is redrawn');
  t.result={...t.result,key:{index:66,cents:193.3,degree:1}};t.tick();
  assert.equal(writes,1);assert.match(html,/Harmonies with key 66/);assert.match(html,/degree 1 · 193\.3 ¢/);
  t.view=false;t.tick();assert.equal(original.hidden,true);
  t.view=true;t.tick();assert.equal(original.hidden,false);
  const saved=t.result;t.result=null;t.tick();assert.equal(original.hidden,true,'no board, no panel');t.result=saved;
}

// A search error is shown, not thrown.
{
  const t=setup();t.click('toggle');
  t.result={...t.result,harmonies:[],count:0,error:'Choose a supported <tolerance>.'};t.tick();
  assert.match(t.host.innerHTML,/role="alert">Choose a supported &lt;tolerance&gt;\./);assert.doesNotMatch(t.host.innerHTML,/harmony-list/);
}

// Text from the chord search is escaped.
{
  const t=setup({harmonies:[mk('1/1 · <b>x</b> · 3/2',0,1)]});t.click('toggle');
  assert.doesNotMatch(t.host.innerHTML,/<b>x<\/b>/);assert.match(t.host.innerHTML,/&lt;b&gt;x&lt;\/b&gt;/);
}

console.log('key-harmonies-ui: ok');
