import {diamondLayout,parseDiamondHarmonics,selectedDiamondCoordinates,selectedDiamondChord} from './diamond-layout.mjs';
import {diamondApproximation,renderDiamond} from './tonality-diamond.mjs';
import {esc,option} from './ui.mjs';
export function createDiamondWorkspace({document:doc,getState,refresh,notify,play,onInspect,onCollect,onPlace,onChord,onChordChange=()=>{}}){
 let layout={harmonics:'',fold:false},interaction='play',selection=new Set(),playing=new Set(),geometry=null,signature='',layoutOptionsOpen=false,auditioning=false,auditionTimer=null;
 function clearAudition(){if(auditionTimer!==null)clearTimeout(auditionTimer);auditionTimer=null;auditioning=false;}
 function chordDisplay(){
  const usePlaying=interaction==='play'&&playing.size>1,ids=usePlaying?playing:selection.size>1?selection:interaction==='select'?selection:new Set(),chord=selectedDiamondChord(geometry?.cells??[],ids);
  return chord?{...chord,source:usePlaying||auditioning?'playing':'selected'}:null;
 }
 function paint(){
  doc.querySelectorAll('[data-diamond-key]').forEach(el=>{const on=selection.has(el.dataset.diamondKey);el.classList.toggle('selected',on);el.setAttribute('aria-pressed',String(on));});
  const status=doc.querySelector('[data-diamond-selection]');if(status)status.textContent=`${selection.size} cells selected`;
  doc.querySelectorAll('[data-diamond-action="collect"], [data-diamond-action="place"], [data-diamond-action="chord"], [data-diamond-action="hear"]').forEach(el=>{el.disabled=selection.size===0;});
  onChordChange(chordDisplay());
 }
 function render(cfg,header){
  const s=getState(),key=JSON.stringify([s.basis,s.rows,s.p,s.g,s.n,s.mode,s.matrixOctave,cfg.limit,cfg.primeLimit,cfg.scope,cfg.filter,layout]);
  if(signature&&signature!==key){selection.clear();playing.clear();clearAudition();}signature=key;
  geometry=diamondLayout(cfg,layout);const statuses=new Map();geometry.cells=geometry.cells.map(t=>{if(!statuses.has(t.label))statuses.set(t.label,diamondApproximation(s,t,cfg));return {...t,status:statuses.get(t.label)};});
  const ids=new Set(geometry.cells.map(t=>t.id));selection=new Set([...selection].filter(id=>ids.has(id)));
  layoutOptionsOpen=doc.querySelector('.diamond-layout-options')?.open??layoutOptionsOpen;
  const actions=interaction==='select'?`<div class="panelactions diamond-selection-actions"><span data-diamond-selection aria-live="polite">${selection.size} cells selected</span><button data-diamond-action="clear">Clear selection</button><button data-diamond-action="hear" ${selection.size?'':'disabled'}>▶ Play selection</button><button data-diamond-action="collect" ${selection.size?'':'disabled'}>Add to collection</button><button data-diamond-action="chord" ${selection.size?'':'disabled'}>Open in Chords</button><button data-diamond-action="place" ${selection.size?'':'disabled'}>Map to HexBoard</button></div>`:'';
  const playHelp=interaction==='play'?`<span class="viewnote" id="diamond-pointer-help">Click, hold and drag to play. Hold Shift to sustain. Escape stops sound.</span>`:'';
  const describedBy=interaction==='play'?' aria-describedby="diamond-pointer-help"':'';
  const canvasControls=`<div class="diamond-pointer-controls"><label>Pointer action<select data-diamond-setting="interaction"${describedBy}>${option('play','Play notes',interaction)}${option('select','Select cells',interaction)}</select></label>${playHelp}${actions}</div>`;
  return renderDiamond(s,0,{...cfg,geometry,canvasControls,selectedIds:[...selection]},'',header);
 }
 function optionsMarkup(){
  if(!geometry)return '';
  const harmonics=geometry.harmonics;
  return `<details class="diamond-layout-options" ${layoutOptionsOpen?'open':''}><summary>Diamond layout options</summary><div class="diamond-layout-fields"><label>Harmonics in display order<input data-diamond-harmonics value="${esc(layout.harmonics)}" placeholder="4:5:6:7:9:11" aria-describedby="diamond-layout-help"></label><button data-diamond-action="apply">Apply harmonics</button><button data-diamond-action="default">Use current JI limits</button><label class="checklabel"><input type="checkbox" data-diamond-setting="fold" ${geometry.fold?'checked':''} ${geometry.custom?'':'disabled'}>Fold into one octave</label></div><div class="panelactions"><button data-diamond-preset="8:9:10:11:12">8:9:10:11:12</button><button data-diamond-preset="4:5:6:7:9:11">4:5:6:7:9:11</button><button data-diamond-action="reverse">Reverse order</button></div><p id="diamond-layout-help">Reorder the list to rearrange both axes. Custom harmonics set the layout independently of the JI limits; the current temperament and approximation source determine sounding pitches. Unavailable cells stay visible.</p></details><div class="diamond-selection-controls"><label>Otonal line · denominator<select data-diamond-line="otonal">${harmonics.map((n,i)=>option(i,n,0)).join('')}</select></label><button data-diamond-action="otonal">Select otonal line</button><label>Utonal line · numerator<select data-diamond-line="utonal">${harmonics.map((n,i)=>option(i,n,0)).join('')}</select></label><button data-diamond-action="utonal">Select utonal line</button></div>`;
 }
 function mountOptions(){const host=doc.querySelector('[data-diamond-settings]');if(host)host.innerHTML=optionsMarkup();}
 function press(node){
  const t=geometry?.cells.find(t=>t.id===node.dataset.diamondKey);if(!t)return null;
  onInspect(t.label);
  if(interaction==='select'){clearAudition();if(selection.has(t.id))selection.delete(t.id);else selection.add(t.id);paint();return {enabled:false,track:true};}
  const v=t.status.approximation;if(!v){notify('No sounding approximation for this cell under the current source and display filter.');return {enabled:false,track:true};}
  return {enabled:true,c:v.c};
 }
 function item(){
  const coords=selectedDiamondCoordinates(geometry?.cells??[],selection);if(coords.length<2)throw Error('Select at least two distinct sounding notes.');if(coords.length>256)throw Error('Select no more than 256 distinct sounding notes for the collection.');
  const targets=geometry.cells.filter(t=>selection.has(t.id)),alternative=targets.some(t=>!t.status.approximation.mapped);
  return {kind:coords.length>8?'scale':'chord',coords,label:`Diamond${alternative?' approximations':''} · ${targets.map(t=>t.label).join(' : ')}`.slice(0,100),exact:true};
 }
 function change(el){
  const setting=el.dataset.diamondSetting;if(!setting)return false;
  if(setting==='interaction')interaction=el.value==='select'?'select':'play';
  if(setting==='fold')layout.fold=!!el.checked;
  refresh();return true;
 }
 function click(el){
  const b=el.closest?.('[data-diamond-action], [data-diamond-preset]');if(!b)return false;
  try{
   const action=b.dataset.diamondAction;
   if(b.dataset.diamondPreset){layout={harmonics:parseDiamondHarmonics(b.dataset.diamondPreset).join(':'),fold:false};refresh();return true;}
   if(action==='apply'){const text=doc.querySelector('[data-diamond-harmonics]').value;layout={...layout,harmonics:parseDiamondHarmonics(text).join(':')};refresh();}
   if(action==='default'){layout={harmonics:'',fold:false};refresh();}
   if(action==='reverse'){layout.harmonics=parseDiamondHarmonics([...geometry.harmonics].reverse().join(':')).join(':');layout.fold=geometry.fold;refresh();}
   if(action==='clear'){clearAudition();selection.clear();paint();}
   if(action==='otonal'||action==='utonal'){clearAudition();const index=Number(doc.querySelector(`[data-diamond-line="${action}"]`).value);selection=new Set(geometry.cells.filter(t=>action==='otonal'?t.j===index:t.i===index).map(t=>t.id));paint();}
   if(['hear','collect','place','chord'].includes(action)){
    const material=item();if(action==='hear'){clearAudition();play(material.coords.map(m=>m[0]*getState().p+m[1]*getState().g));auditioning=true;paint();auditionTimer=setTimeout(()=>{auditioning=false;auditionTimer=null;paint();},720);}
    if(action==='collect')onCollect(material);if(action==='place')onPlace(material);if(action==='chord')onChord(material);
   }
  }catch(e){notify(e.message);}return true;
 }
 function restore(data){
  if(!data){layout={harmonics:'',fold:false};selection.clear();playing.clear();clearAudition();interaction='play';signature='';return;}
  if(typeof data.harmonics!=='string'||typeof data.fold!=='boolean'||!['play','select'].includes(data.interaction)||!Array.isArray(data.selected)||data.selected.length>2401||data.selected.some(id=>typeof id!=='string'||!/^\d{1,2}:\d{1,2}$/.test(id)))throw Error('Invalid saved diamond layout.');
  layout={harmonics:data.harmonics?parseDiamondHarmonics(data.harmonics).join(':'):'',fold:data.fold};selection=new Set(data.selected);playing.clear();clearAudition();interaction=data.interaction;signature='';
 }
 function updatePlaying(notes){playing=new Set((Array.isArray(notes)?notes:[]).map(note=>note?.id).filter(id=>typeof id==='string'));paint();}
 return {render,press,click,change,mountOptions,restore,updatePlaying,chordDisplay,layout:()=>({...layout}),serialize:()=>({...layout,interaction,selected:[...selection]})};
}
