import {validateHarmonicSelection} from './harmonic-types.mjs';
import {mappingContext} from './harmonic-context.mjs';
import {occurrenceShape,searchShapeOccurrences,scaleMembership} from './chord-occurrence-v2.mjs';
import {realizeShape,placeRealization} from './chord-realization-v2.mjs';
import {coordinateCents} from './pitch.mjs';
import {esc,option} from './ui.mjs';

export function createHarmonicPlayWorkspace({getState,getBoard,getNear=()=>65,refresh=()=>{},onHighlight=()=>{},onBrowse=()=>{},onFitScale=()=>{},play=()=>{},onCollect=()=>{},notify=()=>{}}){
 let selection=null,stamp='',voicing=null,occurrences=null,placements=[],placementLimited=false,fingering=-1,showMore=false,rootId='',error='';
 function reset(){stamp='';voicing=null;placements=[];fingering=-1;onHighlight(null);}
 function sync(){if(!selection)return;const s=getState(),board=getBoard(),key=JSON.stringify([selection,s.basis,s.rows,s.p,s.g,s.n,s.mode,board.keys.map(k=>[k.enabled,k.m]),rootId]);if(key===stamp)return;
  stamp=key;error='';placements=[];fingering=-1;onHighlight(null);
  if(selection.mappingId!==mappingContext(s).id){voicing=null;occurrences=null;error='This selection belongs to another mapping. Open it in Discover under its source temperament.';return;}
  try{
   const coords=selection.voicing.voices.map(voice=>voice.coordinate),shape=selection.shape??{coordinates:coords,equivalence:s.basis.includes(2)?'octave':'exact'};
   const canonical=occurrenceShape(s,shape);if(canonical.id!==selection.shapeId)throw Error('Saved shape does not match this selection.');
   occurrences=searchShapeOccurrences(s,shape);
   const root=occurrences.completeOccurrences.find(row=>row.id===rootId);
   if(root)voicing=realizeShape(s,shape,root,selection.voicing.request??{},{tones:selection.tones??null});
   else{const members=scaleMembership(s).notes,byG=new Map(members.map(member=>[member.generator,member]));
    const registers=coords.map(m=>{const member=byG.get(m[1]);return member?m[0]-member.coordinate[0]:null;});
    voicing={...structuredClone(selection.voicing),coords:structuredClone(coords),pitches:coords.map(m=>coordinateCents(s,m)),mappingId:selection.mappingId,
     request:{registerMin:-8,registerMax:8,reach:0,...selection.voicing.request},withinScale:registers.every(Number.isInteger),registers};
   }
   if(voicing.withinScale!==false){const placed=placeRealization(s,voicing,board,getNear());placements=placed.placements;placementLimited=placed.limited;}
  }catch(e){voicing=null;error=e.message;}
 }
 function accept(value){selection=validateHarmonicSelection(value);rootId='';showMore=false;reset();sync();
  // A chord has no fixed root once rotations are merged, so source notes that fall outside the Play scale
  // start from the chord's first occurrence there, preferring one that uses the tonic.
  if(voicing&&voicing.withinScale===false&&occurrences?.completeOccurrences.length){rootId=(occurrences.tonicMemberOccurrences?.[0]??occurrences.completeOccurrences[0]).id;sync();}
  refresh();}
 function render(){sync();return `<section class="catalogue-panel harmony-play" aria-label="Selected harmonic realization"><h3>Selected harmony</h3><div class="panelactions"><button data-harmony-play="browse">Browse in Discover</button>${selection?'<button data-harmony-play="clear">Clear</button>':''}</div>
  ${!selection?'<p>Select a mapped JI chord, interval or ET shape in Discover, then send it to Play.</p>':`<h4>${esc(selection.label??'Coordinate harmony')}</h4>${error?`<p role="alert">${esc(error)}</p>`:''}
  ${voicing?`<p>${voicing.voices.length} voices · ${esc(voicing.reference?.label??'Preserved source voicing')}</p><p>${voicing.pitches.map(p=>p.toFixed(3)).join(' · ')} ¢</p>
   ${voicing.withinScale===false?'<p>The requested sounding notes do not belong to the Play scale. Your scale and voicing have been preserved.</p><button data-harmony-play="fit">Fit Play scale to these notes</button>':''}
   ${occurrences?.completeOccurrences.length?`<label>Play occurrence<select data-harmony-play-field="root"><option value="">Preserve requested sounding notes</option>${occurrences.completeOccurrences.map(root=>option(root.id,`Degree ${root.root}${root.tonicAnchored?' · tonic':''}`,rootId)).join('')}</select></label>`:'<p>No complete abstract occurrence in the Play scale.</p>'}
   ${placements.length?`<p>${placements.length} exact fingerings${fingering<0?' · choose one to highlight':''}</p><div class="harmony-fingerings">${placements.slice(0,showMore?24:3).map((p,i)=>`<button data-harmony-play="fingering" data-index="${i}" aria-pressed="${fingering===i}">Buttons ${p.keys.join(', ')}<small>Reach ${p.reach} · ${p.periodShift>=0?'+':''}${p.periodShift} periods</small></button>`).join('')}</div>${placements.length>3?`<button data-harmony-play="more">${showMore?'Show top 3':'More fingerings'}</button>`:''}${placements.length>24&&showMore?'<p>Showing the best 24 fingerings; change occurrence or layout to compare others.</p>':''}`:voicing.withinScale!==false?'<p>The harmony occurs in this scale, but no complete fingering fits this board. Try another layout or occurrence.</p>':''}
   ${placementLimited?'<p>Physical search reached the 20,000-fingering cap; results are partial.</p>':''}<div class="panelactions"><button data-harmony-play="hear">${fingering<0?'Hear requested voicing':'Hear selected fingering'}</button><button data-harmony-play="collect" ${voicing.voices.length<2?'disabled':''}>Add to collection</button></div>`:''}`}</section>`;}
 function click(node){const b=node?.closest?.('[data-harmony-play]')??node,act=b?.dataset?.harmonyPlay;if(!act)return false;
  try{sync();if(act==='browse')onBrowse();if(act==='clear'){selection=null;rootId='';reset();}if(act==='fit'&&voicing)onFitScale(voicing.coords);
   if(act==='more')showMore=!showMore;
   if(act==='fingering'){const index=Number(b.dataset.index);if(placements[index]){fingering=index;onHighlight({...placements[index],label:selection.label});}}
   if(act==='hear'&&voicing)play(fingering<0?voicing.pitches:placements[fingering].pitches);
   if(act==='collect'&&voicing){const coords=fingering<0?voicing.coords:placements[fingering].coords;
    const preserved={...structuredClone(selection),voicing:{...structuredClone(voicing),coords:structuredClone(coords),voices:voicing.voices.map((voice,i)=>({...voice,coordinate:[...coords[i]]}))}};
    onCollect(getState(),coords,selection.label,{exact:true,harmonicSelection:validateHarmonicSelection(preserved)});}
   refresh();}catch(e){notify(e.message);}return true;}
 function change(el){if(el?.dataset?.harmonyPlayField!=='root')return false;rootId=el.value;reset();refresh();return true;}
 return {accept,render,sync,click,change,
  // Highlights fingering `index` (or clears it with -1); false when there is no such fingering.
  select:index=>{sync();if(index<0){fingering=-1;onHighlight(null);return true;}if(!Number.isInteger(index)||!placements[index]||!selection)return false;fingering=index;onHighlight({...placements[index],label:selection.label});return true;},model:()=>{sync();return {selection,realization:voicing,occurrences,placements,fingering,error};},clear:()=>{selection=null;reset();},
  suspend:()=>{fingering=-1;onHighlight(null);},serialize:()=>selection?{version:1,selection,rootId}:null,restore(data){selection=null;rootId=typeof data?.rootId==='string'?data.rootId:'';reset();if(data?.selection)try{selection=validateHarmonicSelection(data.selection);}catch{notify('Unsupported harmonic metadata was ignored.');}}};
}
