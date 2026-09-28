import {realizationDefaults,validateRealization,realizeChord,placeRealization} from './chord-realization-v2.mjs';
import {renderRealization,renderRealizationOptions,renderRealizationDetails} from './chord-realization-view-v2.mjs';
import {chordRelationships} from './chord-relationships-v2.mjs';
import {renderPartialMatches,renderRelationships} from './chord-relationships-view-v2.mjs';
import {discoveryDefaults,validateDiscovery,discoverChords} from './chord-discovery-v2.mjs';
import {renderDiscovery,renderDiscoveryOptions} from './chord-discovery-view-v2.mjs';
import {analyzeChord} from './chord-analysis-v2.mjs';
import {esc} from './ui.mjs';
import {DEFAULT_ODD_LIMIT,primeFilterForBasis} from './ji-limit-engine.mjs';
const preserveDetails=html=>html.replace(/<details class="(chord-v2-[a-z-]+)"( open)?>/g,(tag,name)=>{const old=globalThis.document?.querySelector('.'+name);return old?`<details class="${name}"${old.open?' open':''}>`:tag;});
const num=x=>Number.isFinite(x)?x.toFixed(3):'—';
const field=(name,label,value,type='text',extra='')=>`<label>${label}<input type="${type}" data-catalogue-field="v2-${name}" value="${esc(String(value))}" ${extra}></label>`;
export function renderChordAnalysis(a){
 const p=a.projection,o=a.occurrences;
 return `<section class="chord-v2-result" aria-label="Chord analysis"><dl class="chord-v2-status">
 <div><dt>Mapping</dt><dd>${p.basisStatus==='mapped'?'Mapped by this temperament':`Outside basis · missing ${p.missingPrimes.join(', ')}`}</dd></div>
 <div><dt>Tuning</dt><dd>${p.qualityStatus==='unavailable'?'Unavailable for unmapped members':`${p.qualityStatus==='within-tolerance'?'Within':'Above'} tolerance · root-relative max ${num(p.maxErrorCents)}¢ · RMS ${num(p.rmsErrorCents)}¢`}</dd></div>
 <div><dt>Cardinality</dt><dd>${p.cardinalityStatus==='unavailable'?'Unavailable':`${p.originalCardinality} JI notes → ${p.temperedCardinality} mapped pitch classes · ${p.cardinalityStatus}`}${a.identity.repeatedMembers?` · ${a.identity.repeatedMembers} repeated input members`:''}</dd></div>
 <div><dt>Selected scale</dt><dd>${o.status==='unavailable'?'Cannot test exact membership outside the mapping basis':o.reason}</dd></div></dl>
 ${o.scaleCollision?'<p class="catalogue-help">This tuning has coincident scale pitches. These are abstract rank-2 occurrences; playable voices may coincide.</p>':''}
 <details class="chord-v2-details"><summary>Per-note mapping & tuning</summary><p class="catalogue-help">Errors are relative to the lowest JI member, before inversion. Worst pair ${num(p.pairwiseMaxErrorCents)}¢; pairwise RMS ${num(p.pairwiseRmsErrorCents)}¢. Period-class collisions are reported independently.</p><div class="tablewrap"><table><thead><tr><th>Ratio</th><th>(P, G)</th><th>Tuned ¢</th><th>JI ¢</th><th>Error ¢</th></tr></thead><tbody>${p.notes.map(n=>`<tr><td>${esc(n.ratio)}</td><td>${n.coordinate?n.coordinate.join(', '):'Outside basis'}</td><td>${num(n.tunedCents)}</td><td>${num(n.idealCents)}</td><td>${num(n.errorCents)}</td></tr>`).join('')}</tbody></table></div>${p.collisionGroups.map(g=>`<p>Collapsed members: ${g.members.map(i=>p.notes[i].ratio).join(', ')} → generator ${g.periodClass}</p>`).join('')}</details>
 ${a.largerScales.length?`<details><summary>Tested larger scales</summary><p>${a.largerScales.map(x=>`${x.n} notes: ${x.count} complete occurrences${x.scaleCollision?' (coincident pitches)':''}`).join(' · ')}</p></details>`:''}</section>`;
}
export function createChordV2Workspace({getState,getSettings,getBoard=()=>({keys:[]}),getNear=()=>65,play=()=>{},onCollect,onInspect,setSettings=()=>{},refresh=()=>{},notify=()=>{},onHighlight=()=>{}}){
 let pendingSelection=null,pendingFingering=null;
 let placementLimited=false;
 let realizationOptions=realizationDefaults(),realization=null,placements=[],fingering=0,placementStamp='',placementError='',highlightStamp='';
 let relationships=null,relationGeneration=0;
 let query='';
 let text='4:5:6:7:9:11',selected='',stamp='',analysis=null,error='';
 let filters=discoveryDefaults(),discovery={status:'idle',rows:[],done:0,total:0},discoveryStamp='',generation=0,worker=null,page=0;
 const effectiveFilters=()=>{const ji=getSettings?.(getState());return {...filters,maxError:tolerance(),oddLimit:ji?.limit??Math.max(...getState().basis),primeLimit:ji&&Object.hasOwn(ji,'primeLimit')?ji.primeLimit:filters.primeLimit??null};};
 function startDiscovery(){const config=effectiveFilters(),key=JSON.stringify([getState().basis,getState().rows,getState().p,getState().g,getState().n,getState().mode,config]);if(key===discoveryStamp)return;discoveryStamp=key;const current=++generation;worker?.terminate();worker=null;discovery={status:'loading',rows:[],done:0,total:0};
  const emit=r=>{if(current!==generation)return;discovery=r;refresh();};
  if(typeof Worker==='function'){worker=new Worker(new URL('./chord-v2-worker.mjs',import.meta.url),{type:'module'});worker.onmessage=({data})=>{if(data.request===current)emit(data);};worker.onerror=()=>emit({status:'error',rows:[],done:0,total:0,message:'Search failed. Change a filter to retry.'});worker.postMessage({request:current,state:structuredClone(getState()),config});}
  else queueMicrotask(()=>discoverChords(structuredClone(getState()),config,emit,()=>current!==generation).catch(e=>emit({status:'error',rows:[],done:0,total:0,message:e.message})));
 }

 const tolerance=()=>getSettings?.(getState())?.tol??10;
 function sync(){startDiscovery();const s=getState(),key=JSON.stringify([s.basis,s.rows,s.p,s.g,s.n,s.mode,text,tolerance()]);if(key===stamp)return;const previousSelection=selected;stamp=key;selected='';relationGeneration++;relationships=null;onHighlight(null);highlightStamp='';try{analysis=analyzeChord(s,text,{tolerance:tolerance(),larger:true});const retained=pendingSelection||previousSelection;if(retained&&analysis.occurrences.completeOccurrences.some(o=>o.id===retained))selected=retained;pendingSelection=null;error='';}catch(e){analysis=null;error=e.message;}}
 function updatePlacement(){
  const occurrence=analysis?.occurrences.completeOccurrences.find(o=>o.id===selected);if(!occurrence){realization=null;placements=[];placementStamp='';placementError='';return;}
  const s=getState(),board=getBoard(),key=JSON.stringify([stamp,selected,realizationOptions,board.keys.map(k=>[k.enabled,k.m]),getNear()]);
  if(key!==placementStamp){placementStamp=key;try{realization=realizeChord(s,analysis,occurrence,realizationOptions);const placed=placeRealization(s,realization,board,getNear());placements=placed.placements;placementLimited=placed.limited;fingering=pendingFingering?Math.max(0,placements.findIndex(f=>f.keys.join(',')===pendingFingering)):0;pendingFingering=null;placementError='';}catch(e){realization=null;placements=[];placementError=e.message;}}
  const f=placements[fingering],next=f?f.keys.join(',')+'|'+JSON.stringify(f.coords):'';if(next!==highlightStamp){highlightStamp=next;onHighlight(f?{...f,label:analysis.identity.displayLabel}:null);}
 }
 function model(){sync();updatePlacement();let queryAnalysis=null,queryError='';if(query.trim()&&(/[:/,]/.test(query)||/^\d[\d\s]+$/.test(query)))try{queryAnalysis=analyzeChord(getState(),query,{tolerance:tolerance()});}catch(e){queryError=e.message;}const ji=getSettings?.(getState());return {query,queryAnalysis,queryError,text,analysis,error,selected,filters:effectiveFilters(),primeLimitSelection:ji?.primeLimitSelection,primeBasisFilter:primeFilterForBasis(getState().basis),discovery,page,realization,realizationOptions,placements,fingering,placementError,placementLimited,periodCents:getState().p};}
 function render(){
  const m=model(),o=m.analysis?.occurrences,occurrence=o?.completeOccurrences.find(x=>x.id===selected);
  const roots=o?.completeOccurrences||[];
  const occurrenceView=analysis&&roots.length?`<section class="chord-v2-occurrences" aria-label="Exact occurrences"><h4>Occurrences · ${esc(analysis.identity.displayLabel)}</h4><div class="catalogue-roots">${roots.map(x=>`<button data-catalogue-action="v2-root" data-id="${esc(x.id)}" aria-pressed="${selected===x.id}">Root ${x.root}</button>`).join('')}</div>${!selected?'<p class="catalogue-help">Select a root for inversions and fingerings.</p>':''}</section>`:'';
  return preserveDetails(`<section class="catalogue-panel chord-v2" aria-label="Scale chords"><h3>Scale chords</h3>
   <div class="catalogue-controls">${field('search','Search chords',query,'search','maxlength="300" placeholder="4:5:6 or 1/6:5:4"')}</div>
   <div class="catalogue-content">${renderDiscovery(m)}${error?`<p role="alert">${esc(error)}</p>`:''}${occurrenceView}${renderRealization(m)}
   <div class="chord-v2-secondary">
    ${renderDiscoveryOptions(m)}${renderRealizationOptions(m)}
    ${analysis?`<details class="chord-v2-diagnostics"><summary>Chord details</summary>${renderChordAnalysis(analysis)}${occurrence?`<p>Exact assignments: ${occurrence.assignments.map(x=>`${x.ratio} → degree ${x.degree} (${x.coordinate.join(', ')})`).join(' · ')}</p>`:''}${renderRealizationDetails(m)}</details>`:''}
    ${renderPartialMatches(getState(),analysis)}${analysis?renderRelationships(relationships):''}
    <details class="chord-v2-help"><summary>Search information</summary><p>${m.discovery.done}/${m.discovery.total} candidates searched. The catalogue is bounded; direct ratio input can inspect chords beyond it. Exact JI identity, mapping, tuning quality and finite-scale membership are separate. Tolerance changes tuning quality, not exact membership. Two to eight members, positive integers or fractions up to 1,000,000; compact reciprocals such as 1/6:5:4 are supported.</p>${m.discovery.status==='loading'?'<button data-catalogue-action="v2-cancel">Cancel search</button>':''}${m.discovery.status==='cancelled'?'<button data-catalogue-action="v2-retry">Resume search</button>':''}</details>
   </div></div></section>`);
 }
 function change(el){const key=el?.dataset?.catalogueField;if(!key?.startsWith('v2-'))return false;const name=key.slice(3);try{if(name==='search'){const next=String(el.value).slice(0,300);if(next===query)return true;query=next;page=0;}else if(name==='text'){text=String(el.value).slice(0,300);}else if(Object.hasOwn(realizationOptions,name)){realizationOptions=validateRealization({...realizationOptions,[name]:['style','order'].includes(name)?el.value:Number(el.value)});placementStamp='';}else{const useBasisPrimeLimit=name==='primeLimit'&&el.value==='basis',value=name==='primeLimit'?(useBasisPrimeLimit?primeFilterForBasis(getState().basis):el.value===''?null:Number(el.value)):['minTones','maxTones','oddLimit','maxSpan'].includes(name)?Number(el.value):String(el.value);const next=validateDiscovery({...effectiveFilters(),[name]:value});filters=next;if(name==='oddLimit')setSettings({limit:value});if(name==='primeLimit')setSettings({primeLimit:useBasisPrimeLimit?'basis':value});page=0;}sync();refresh();}catch(e){notify(e.message);}return true;}
 function click(el){const b=el?.closest?.('[data-catalogue-action]')||el,act=b?.dataset?.catalogueAction;if(!act?.startsWith('v2-'))return false;sync();if(act==='v2-root'&&analysis?.occurrences.completeOccurrences.some(o=>o.id===b.dataset.id))selected=b.dataset.id;
 if(act==='v2-clear'){selected='';onHighlight(null);highlightStamp='';}
 if(act==='v2-prev'||act==='v2-next'){updatePlacement();fingering=Math.max(0,Math.min(placements.length-1,fingering+(act==='v2-next'?1:-1)));updatePlacement();}
 if(['v2-play','v2-inspect','v2-collect'].includes(act)){updatePlacement();if(realization){const f=placements[fingering],coords=f?.coords||realization.coords,label=analysis.identity.displayLabel+' · root '+analysis.occurrences.completeOccurrences.find(o=>o.id===selected).root;
  if(act==='v2-play'&&(f||realization.withinRegisterRange))play(f?.pitches||realization.pitches);
  if(act==='v2-inspect'&&coords.length>=2)onInspect?.(getState(),coords,label);
  if(act==='v2-collect'&&coords.length>=2)onCollect?.(getState(),coords,label);}}
 if(act==='v2-chord'){text=b.dataset.id;stamp='';sync();}
 if(act==='v2-relationships'&&analysis){const current=++relationGeneration;const snapshot=analysis;chordRelationships(structuredClone(getState()),snapshot,r=>{if(current===relationGeneration){relationships=r;refresh();}},()=>current!==relationGeneration);}
 if(act==='v2-cancel-relationships'){relationGeneration++;if(relationships)relationships={...relationships,status:'cancelled'};}
 if(act==='v2-reset'){filters=discoveryDefaults();setSettings({limit:DEFAULT_ODD_LIMIT,primeLimit:'basis'});page=0;sync();}
 if(act==='v2-page')page=Math.max(0,Number(b.dataset.id)||0);
 if(act==='v2-cancel'){generation++;worker?.terminate();worker=null;discovery={...discovery,status:'cancelled'};}
 if(act==='v2-retry'){discoveryStamp='';sync();}refresh();return true;}
 function restore(data){query='';onHighlight(null);highlightStamp='';placements=[];realization=null;fingering=0;relationGeneration++;relationships=null;if(data!=null&&(data.version!==2||typeof data.text!=='string'||data.text.length>300))throw Error('Invalid saved chord settings.');if(data?.selected!==undefined&&(typeof data.selected!=='string'||data.selected.length>4000)||data?.fingering!==undefined&&(typeof data.fingering!=='string'||data.fingering.length>100))throw Error('Invalid saved chord selection.');pendingSelection=data?.selected||null;pendingFingering=data?.fingering||null;realizationOptions=validateRealization(data?.realizationOptions||{});placementStamp='';filters=validateDiscovery(data?.filters||{});text=data?.text??'4:5:6:7:9:11';selected='';stamp='';discoveryStamp='';generation++;worker?.terminate();}
 return {model,render,sync,change,click,restore,serialize:()=>({version:2,text,filters,realizationOptions,selected:selected||pendingSelection||'',fingering:placements[fingering]?.keys.join(',')||pendingFingering||''}),clear:()=>{selected='';pendingSelection=null;pendingFingering=null;placements=[];realization=null;highlightStamp='';onHighlight(null);},destroy:()=>{onHighlight(null);highlightStamp='';generation++;relationGeneration++;worker?.terminate();worker=null;discoveryStamp='';},restoreLegacy:()=>{}};
}
