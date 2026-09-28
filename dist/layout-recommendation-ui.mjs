import {esc,option} from './ui.mjs';
import {layoutKey} from './layout-candidates.mjs';
import {recommendLayouts} from './layout-recommendations.mjs';
import {layoutPresetForState,layoutPresetConfigKey,mappingKey} from './layout-preset-data.mjs';
const family={bosanquet:'Bosanquet',compressed:'Compressed',period:'Period / generator',manual:'Custom axes'};
export const recommendationLabel=(r,i)=>`#${i+1} · ${Math.round(r.score*100)}/100 · ${r.config.base}-note ${family[r.config.style]} · ${r.config.rotation*60}°${r.config.flipVertical?' flipped':''}${r.scale.chromatic?.complete?' · chromatic '+r.scale.chromatic.axis:''}`;
const score=n=>`${Math.round(n*100)}/100`;
export function createLayoutRecommendations(refresh){
 let signature='',scope='',results=[],worker=null,generation=0,loading=false,error='',selected=null,nameDraft=null,context=null,config=null,targets=[],searched=false,stale=false;
 function update(s,cfg,desired){
  context=s;config={...cfg};targets=desired;
  const nextScope=JSON.stringify([s.basis,s.rows,s.p,s.g,s.n,s.mode,desired]),configKey=layoutKey(cfg),next=JSON.stringify([nextScope,configKey]);
  if(next===signature)return;
  // Picking a layout already in the current result set does not invalidate its score.
  if(searched&&!loading&&nextScope===scope&&results.some(r=>layoutKey(r.config)===configKey))return;
  const hadResults=searched||loading;signature=next;scope=nextScope;
  if(hadResults){generation++;worker?.terminate();worker=null;results=[];loading=false;error='';searched=false;selected=null;stale=true;}
 }
 function search(){
  if(!context||loading)return false;
  worker?.terminate();worker=null;searched=true;stale=false;error='';results=[];loading=true;const id=++generation,s=context,cfg={...config},wanted=typeof structuredClone==='function'?structuredClone(targets):targets;
  const finish=data=>{if(data.id!==generation)return;results=data.results||[];error=data.error||'';loading=false;refresh();};
  if(typeof Worker==='undefined'){try{results=recommendLayouts(s,cfg,wanted);}catch(e){error=e.message;}loading=false;return true;}
  worker=new Worker(new URL('./layout-recommendation-worker.mjs',import.meta.url),{type:'module'});
  worker.onmessage=({data})=>finish(data);
  worker.onerror=()=>finish({id,error:'Layout search could not finish. Change a layout option and search again.'});
  worker.postMessage({id,state:{basis:s.basis,rows:s.rows,p:s.p,g:s.g,n:s.n,mode:s.mode},config:cfg,targets:wanted});
  return true;
 }
 function markup(cfg,saved={items:[],status:'idle'}){const s=context;if(!s)return '';
  const current=results.find(r=>layoutKey(r.config)===layoutKey(cfg)),rank=current?results.indexOf(current):0;
  const currentMapping=mappingKey(s),defaultId=saved.defaults?.[currentMapping],presets=saved.items.filter(p=>mappingKey(p.state.context)===currentMapping).map(p=>({...p,fit:layoutPresetForState(p.state,s)})).sort((a,b)=>Number(b.id===defaultId)-Number(a.id===defaultId)||a.name.localeCompare(b.name));
  const editing=presets.find(p=>p.id===cfg.savedLayoutId&&mappingKey(p.state.context)===mappingKey(s));
  const activeSaved=editing&&!editing.fit.error&&editing.state.context.n===s.n&&editing.state.context.mode===s.mode&&layoutPresetConfigKey(editing.fit.config)===layoutPresetConfigKey(cfg),nameChanged=!!editing&&nameDraft!==null&&nameDraft.trim()!==editing.name,isDefault=!!editing&&defaultId===editing.id,presetMatches=activeSaved&&!nameChanged;
  const activeRecommendation=selected&&selected.key===layoutKey(cfg)&&selected.context===JSON.stringify([s.basis,s.rows,s.n,s.mode]);
  const value=activeSaved?'saved:'+editing.id:activeRecommendation?'rec:'+selected.id:'current';
  const selectionLabel=activeSaved?editing.name:activeRecommendation?'Recommended layout':'Custom layout';
  const searchNote=loading?'Searching layouts for this scale and its desired chords…':error?error:stale?'Scale, chords, or board settings changed. Search again to refresh the recommendations.':searched?`${results.length} recommendations, highest score first.${current?` Current layout: ${score(current.score)}.`:''}`:'';
  const searchOpen=globalThis.document?.querySelector('.layout-recommendation-search')?.open?'open':'';
  return `<section class="layout-recommendations" aria-label="Layout recommendations"><div class="layout-recommendation-heading"><label for="layout-recommendation-choice">Layout</label><span class="dim">${esc(selectionLabel)}</span></div><select id="layout-recommendation-choice" data-layout-choice aria-label="Layout recommendations">
  ${presets.length?`<optgroup label="Saved layouts">${presets.map(p=>`<option value="saved:${esc(p.id)}" ${value==='saved:'+p.id?'selected':''} ${p.fit.error?'disabled':''}>${esc(p.name)}${p.id===defaultId?' · Default':''} · ${p.state.context.n} notes${p.fit.error?' · '+esc(p.fit.error):''}</option>`).join('')}</optgroup>`:''}
  ${value==='current'?option('current','Custom layout · current settings',value):value.startsWith('rec:')&&!results.some(r=>'rec:'+r.id===value)?option(value,selected.label,value):''}
  ${results.length?`<optgroup label="Ranked recommendations · ${results.length}">${results.map((r,i)=>option('rec:'+r.id,recommendationLabel(r,i),value)).join('')}</optgroup>`:loading?'<optgroup label="Ranked recommendations"><option disabled>Searching…</option></optgroup>':''}</select>
  ${searchNote?`<p role="status" class="viewnote">${esc(searchNote)}</p>`:''}
  <details class="layout-recommendation-search" ${searchOpen}><summary>Search recommended layouts</summary><p class="viewnote">Compare the current scale, desired chords, and pitch mapping.</p><button data-hex-action="layout-search" ${loading?'disabled':''}>${loading?'Searching…':searched?'Search again':'Search layouts'}</button></details>
  ${current?details(current,s):''}
  <details class="layout-save" ${globalThis.document?.querySelector('.layout-save')?.open?'open':''}><summary>${editing?'Name / update saved layout':'Save and name this layout'}</summary><div class="layout-save-fields"><label>Layout name<input data-layout-name maxlength="80" value="${esc(nameDraft??editing?.name??'')}" placeholder="Name this layout" ${saved.busy?'disabled':''}></label><button data-hex-action="layout-save" ${saved.busy||saved.status!=='ready'?'disabled':''}>${editing?'Update preset':'Save layout'}</button>${editing?`<button data-hex-action="layout-save-new" ${saved.busy?'disabled':''}>Save as new</button><button data-hex-action="layout-default" ${saved.busy||saved.status!=='ready'||presetMatches&&isDefault?'disabled':''}>${isDefault?(presetMatches?'Default for this temperament':'Save changes & keep default'):presetMatches?'Make default for this temperament':'Save changes & make default'}</button><button data-hex-action="layout-delete" ${saved.busy?'disabled':''}>Delete preset</button>`:''}</div><p class="viewnote">Remembers this target scale, mode and layout. Uses the current tuning when loaded.</p></details>
  ${saved.status==='error'?`<p class="notice" role="status">${esc(saved.error)} <button data-hex-action="layout-retry">Retry saved layouts</button></p>`:saved.error?`<p role="status">${esc(saved.error)}</p>`:saved.status==='loading'?'<p class="viewnote">Loading saved layouts…</p>':''}</section>`;
 }
 function details(r,s){const c=r.chords.find(c=>c.kind!=='catalogue'),desired=r.chords.filter(c=>c.kind==='catalogue'),hasChords=r.chords.length>0,b=r.scale.baseQuality,d=r.scale.chromatic;
  const coverage=[desired.length?`${desired.filter(c=>c.complete).length}/${desired.length} desired chord types playable.`:'',c?`Selected chord: ${c.represented}/${c.required} tones; ${c.complete?'complete voicing available':'no complete voicing'}.`:''].filter(Boolean).join(' ')||'No desired chords in the current filters. Select or send a chord to score it.';
  const playability=[desired.length?`${desired.filter(c=>c.easyOccurrences>0).length}/${desired.length} types within 4 hex steps; ${desired.reduce((n,c)=>n+c.easyOccurrences,0)}${desired.some(c=>c.limited)?'+':''} fingerings across compact inversions.`:'',c?.complete?`Selected chord: best diameter ${c.diameter}; ${c.easyOccurrences}${c.limited?'+':''} fingerings within 4 hex steps.`:c?'No complete fingering for the selected chord.':''].filter(Boolean).join(' ')||'Not scored without desired chords.';
  const rows=[['Chromatic direction',r.metrics.direction,d.run?`${d.run}-note ascending run ${d.axis}; ${d.transitions}/${s.n} degree transitions; ${Math.round(d.consistency*100)}% consecutive steps on that axis.`:'No consecutive-degree run on an axis.'],['Melodic MOS base',r.metrics.baseMos,b.hardness?`${r.config.base} notes · L:s = ${b.hardness.toFixed(2)}:1. Favors 5–9 notes near 2:1.`:'No two-step MOS base.'],['Melodic continuity',r.metrics.melodic,`${Math.round(r.scale.continuity*100)}% of scale steps; mean ${r.scale.meanStep.toFixed(1)} hex steps.`],['Chord coverage',hasChords?r.metrics.harmony:null,coverage],['Chord playability',hasChords?r.metrics.compactness:null,playability],['Pitch directions',r.metrics.pitch,`${r.scale.horizontal}; ${r.scale.vertical}. Favors consistent rising pitch to the right and upward.`],['Repeated access',r.metrics.reachability,`${Math.round(r.scale.scaleCoverage*100)}% of target degrees on the board.`]];
  return `<details class="layout-recommendation-details" ${globalThis.document?.querySelector('.layout-recommendation-details')?.open?'open':''}><summary>Score details · ${score(r.score)}</summary><dl class="layout-score-details">${rows.map(([label,value,reason])=>`<div><dt>${label}${value==null?'':` <span>${score(value)}</span>`}</dt><dd>${reason}</dd></div>`).join('')}</dl><p class="viewnote">Desired chords follow the Scale Chords filters. Your selected voicing also counts. Reach is measured in hex steps.</p></details>`;
 }
 return {update,search,markup,get:id=>results.find(r=>r.id===id),select:r=>{selected={id:r.id,key:layoutKey(r.config),context:JSON.stringify([context.basis,context.rows,context.n,context.mode]),label:recommendationLabel(r,results.indexOf(r))};nameDraft=null;},input:el=>{if(el.dataset.layoutName===undefined)return false;nameDraft=el.value;return true;},name:fallback=>nameDraft??fallback??'',clearName:()=>{nameDraft=null;},reset:()=>{signature='';scope='';results=[];selected=null;nameDraft=null;searched=false;stale=false;loading=false;generation++;worker?.terminate();worker=null;},destroy:()=>{generation++;worker?.terminate();worker=null;}};
}
