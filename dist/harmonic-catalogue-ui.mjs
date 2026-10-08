import {createHarmonicCatalogueJobs} from './harmonic-catalogue-jobs.mjs';
import {catalogueContext,getHarmonicEntry} from './harmonic-catalogue.mjs';
import {harmonicEntryGeometry,harmonicSelection,sourceShapeVoicing} from './harmonic-selection.mjs';
import {searchShapeOccurrences,occurrenceShape} from './chord-occurrence-v2.mjs';
import {realizeShape} from './chord-realization-v2.mjs';
import {chordIdentity} from './chord-identity-v2.mjs';
import {harmonicIdentity} from './harmonic-equivalence.mjs';
import {mappingContext} from './harmonic-context.mjs';
import {validateHarmonicSelection} from './harmonic-types.mjs';
import {coordinateCents} from './pitch.mjs';
import {BoundedCache} from './cache.mjs';
import {esc,option} from './ui.mjs';

const names={ji:'Mapped JI chords',intervals:'JI intervals',et:'Essentially tempered',mappings:'Mapping alternatives',approximations:'Better approximations'};
const number=value=>Number.isFinite(value)?value.toFixed(3):'—';
const button=(action,label,extra='')=>`<button data-harmony-action="${action}" ${extra}>${label}</button>`;
const select=(field,label,value,choices)=>`<label>${label}<select data-harmony-field="${field}">${choices.map(([v,l])=>option(v,l,value)).join('')}</select></label>`;
const rowLabel=row=>row.preferredLabel??row.targetRatio??`${row.status==='essentially-tempered'?'ET':row.status==='unknown'?'Unknown':'JI-liftable'} · ${row.shape?.coordinates?.length??row.shape?.coordinateCount??0} voices`;

/** Group existing exact reciprocal identities before paging; never add filtered records. */
export function catalogueListGroups(rows){
 const byIdentity=new Map(rows.filter(row=>row.kind==='ji').map(row=>[row.interpretationId,row]));
 const used=new Set(),groups=[];
 for(const row of rows){
  if(used.has(row.id))continue;used.add(row.id);
  if(row.kind!=='ji'){groups.push({shared:row});continue;}
  const form=row.interpretation.presentationForm;
  if(form==='self'||row.exactDualId===row.interpretationId){groups.push({shared:row});continue;}
  const dual=byIdentity.get(row.exactDualId),dualForm=dual?.interpretation.presentationForm;
  const side=form==='otonal'||dualForm==='utonal'?'otonal':form==='utonal'||dualForm==='otonal'?'utonal':null;
  if(!side){groups.push({shared:row});continue;}
  const group={otonal:null,utonal:null};group[side]=row;
  if(dual&&!used.has(dual.id)){group[side==='otonal'?'utonal':'otonal']=dual;used.add(dual.id);}
  groups.push(group);
 }
 return groups;
}

const catalogueCard=(row,selected,shared=false)=>`<button class="harmony-row${shared?' harmony-shared':''}" data-harmony-action="select" data-id="${esc(row.id)}" aria-pressed="${selected===row.id}"><strong>${esc(rowLabel(row))}</strong>${row.kind==='ji'?'':`<span>${row.kind==='assessment'?esc(row.status):row.kind==='mapping'?'Compatible extension':row.kind==='approximation'?`${number(row.absoluteErrorCents)}¢ error · ${number(row.improvementCents)}¢ better`:row.coordinate?'Mapped':'Outside subgroup'}</span><small>${row.kind==='interval'?`${row.coordinate?`(${row.coordinate.join(', ')}) · ${number(row.tuning?.signedErrorCents)}¢`:row.approximation?`Approx. (${row.approximation.coordinate.join(', ')}) · ${number(row.approximation.signedErrorCents)}¢`:'Unmapped'}`:row.kind==='mapping'?`(${row.targetCoordinate.join(', ')}) · ${number(row.absoluteErrorCents)}¢ error`:row.kind==='assessment'?'Target-set-relative assessment':`(${row.coordinate?.join(', ')??'chord coordinates'})`}</small>`}</button>`;

export function renderCatalogueList(rows,selected,{page=0,pageSize=rows[0]?.kind==='ji'?12:24}={}){
 const paired=rows[0]?.kind==='ji',groups=catalogueListGroups(rows),start=page*pageSize;
 const cards=groups.slice(start,start+pageSize).map(group=>group.shared?catalogueCard(group.shared,selected,paired):`<div class="harmony-pair">${['otonal','utonal'].map(side=>group[side]?catalogueCard(group[side],selected):'<span aria-hidden="true"></span>').join('')}</div>`).join('');
 return `${paired?'<div class="harmony-pair-headings"><span>Otonal</span><span>Utonal</span></div>':''}<div class="harmony-list${paired?' harmony-list-paired':''}" aria-label="Harmonic catalogue">${cards}</div>${groups.length>pageSize?`<div class="panelactions">${button('previous','Previous',page===0?'disabled':'')}<span>${start+1}–${Math.min(start+pageSize,groups.length)} of ${groups.length}${paired?' chord rows':''}</span>${button('next','Next',start+pageSize>=groups.length?'disabled':'')}</div>`:''}`;
}

/** No board dependency: occurrence and voicing are selected lazily. */
export function createHarmonicCatalogueWorkspace({getState,getPlayState=getState,getSettings,refresh=()=>{},notify=()=>{},play=()=>{},onCollect=()=>{},onSendToHexBoard=()=>{},onAdoptMapping=()=>{},onInspect=()=>{},onShowDiamond=()=>{},workerFactory}={}){
 let category='ji',scope='temperament',query='',target='16/15',mappingTarget='7/4',page=0,selected='',entry=null,result=null,status='idle',error='',progress=null,stamp='',enabled=false,generation=0;
 let selectedRoot='',inversion=0,style='original',periodShift=0,etSize=3,etBound=256,etStarted=false,sourceSelection=null,directInputs=[],familyFilter=null,pendingRestore=null;
 const occurrences=new BoundedCache(96);
 const jobs=createHarmonicCatalogueJobs({workerFactory,onMessage:message=>{if(message.type==='progress'){progress=message.progress;refresh();}}});
 const state=()=>scope.startsWith('play')?getPlayState():getState();
 const tolerance=()=>getSettings(getState()).tol??10;
 function payload(){const s=getState(),ji=getSettings(s);return {state:s,targetSpec:{oddLimit:ji.limit??15,primeFilter:ji.primeLimit??null,mappingSubgroup:s.basis,representationPolicy:s.basis.includes(2)?'octave':'native-exact'},categories:[category],
  maxRecords:512,pageSize:50,directInputs,et:{sizes:[etSize],maxCandidateShapes:etBound},
  mappingTargets:category==='mappings'?[mappingTarget]:[],approximationTargets:category==='approximations'&&!target.includes(':')?[target]:[],approximationChords:category==='approximations'&&target.includes(':')?[target]:[]};}
 function scopeOccurrences(row){const s=state(),geometry=harmonicEntryGeometry(s,row);if(!geometry)return null;
  return occurrences.get(JSON.stringify([s.basis,s.rows,s.n,s.mode,row.id,geometry.shape]),()=>searchShapeOccurrences(s,geometry.shape));}
 async function run({force=false,direct=null}={}){
  if(!enabled)return;
  const current=++generation,previous=entry,previousRoot=selectedRoot;error='';status='loading';progress=null;sourceSelection=null;
  result=null;entry=null;
  try{
   if(direct)directInputs=[direct];const input=payload();stamp=catalogueContext(input).id;
   const job=jobs.run(category==='et'?'et':category==='approximations'?'approximations':'query',input);
   refresh();const terminal=await job.promise;if(current!==generation||!enabled)return;
   if(terminal.status==='cancelled'){status='cancelled';refresh();return;}
   if(terminal.type==='error')throw Error(terminal.message);
   result=terminal.result;status=result.status;
   entry=result.items.find(row=>row.id===selected)??(previous?.kind==='ji'?result.items.find(row=>row.interpretationId===previous.interpretationId):null)??null;
   selectedRoot=entry&&scopeOccurrences(entry)?.completeOccurrences.some(row=>row.id===previousRoot)?previousRoot:'';
   selected=entry?.id??'';page=0;
   applyRestore();
  }catch(e){if(current!==generation)return;error=e.message;status='error';}
  refresh();
 }
 function applyRestore(){if(!pendingRestore)return;const data=pendingRestore;pendingRestore=null;
  if(data.selection?.mappingId!==mappingContext(state()).id)return;
  const restored=result?.items.find(row=>row.id===data.selected)??result?.items.find(row=>row.interpretationId===data.selectedInterpretation);
  if(restored){entry=restored;selected=restored.id;selectedRoot=scopeOccurrences(restored)?.completeOccurrences.some(row=>row.id===data.selectedRoot)?data.selectedRoot:'';}
  else if(data.selection?.shape&&data.selection?.voicing){sourceSelection=data.selection;entry={id:'source:'+data.selection.voicing.id,kind:'source',shape:data.selection.shape,preferredLabel:data.selection.label};selected=entry.id;selectedRoot='';}
 }
 function sync(){if(!enabled)return;try{const next=catalogueContext(payload()).id;if(next!==stamp){occurrences.entries.clear();if(category==='et'){generation++;jobs.cancel();etStarted=false;result=null;entry=null;selected='';selectedRoot='';status='idle';stamp=next;applyRestore();}else void run();}}catch(e){error=e.message;status='error';}}
 function filtered(){const needle=query.trim().toLowerCase();return (result?.items??[]).filter(row=>{
  if(category==='ji'&&row.kind!=='ji'||category==='intervals'&&row.kind!=='interval'||category==='et'&&row.kind!=='assessment'||category==='mappings'&&row.kind!=='mapping'||category==='approximations'&&row.kind!=='approximation')return false;
  if(category==='ji'&&(row.mappingStatus!=='mapped'||!row.dyads.dyadic)&&row.interpretation.provenance?.kind!=='custom')return false;
  if(needle&&!([rowLabel(row),...(row.aliases??[])].some(text=>String(text).toLowerCase().includes(needle))))return false;
  if(familyFilter&&row.familyId!==familyFilter)return false;
  if(scope!=='temperament'){const found=scopeOccurrences(row);if(!found||!(scope.endsWith('tonic')?found.tonicOccurrences.length:found.anywhereCount))return false;}
  return true;
 }).sort((a,b)=>{
  if(a.kind==='ji'&&b.kind==='ji')return Math.abs(a.interpretation.identity.inputCardinality-3)-Math.abs(b.interpretation.identity.inputCardinality-3)||((a.tuning?.pairwiseMaxErrorCents??Infinity)-(b.tuning?.pairwiseMaxErrorCents??Infinity))||rowLabel(a).localeCompare(rowLabel(b));
  if(a.kind==='mapping'||a.kind==='approximation')return (a.absoluteErrorCents??a.pairwiseMaxErrorCents??Infinity)-(b.absoluteErrorCents??b.pairwiseMaxErrorCents??Infinity);
  return rowLabel(a).localeCompare(rowLabel(b));
 });}
 function detailModel(){if(!entry||entry.kind==='mapping')return {entry};
  const s=state(),geometry=harmonicEntryGeometry(s,entry);if(!geometry)return {entry,geometry:null};
  const found=scopeOccurrences(entry),root=found.completeOccurrences.find(row=>row.id===selectedRoot),voice=root?realizeShape(s,geometry.shape,root,{inversion,style,periodShift},{tones:geometry.tones,tolerance:tolerance()}):null;
  return {entry,geometry,occurrences:found,root,voice,state:s};}
 function currentSelection(){if(sourceSelection)return sourceSelection;const m=detailModel();if(!m.geometry)return null;return harmonicSelection(m.state,entry,{voicing:m.voice??sourceShapeVoicing(m.state,m.geometry.shape)});}
 function mappingDetails(row){const source=result.sources.find(item=>item.kind==='mappings');return `<h4>${esc(row.targetRatio)} · compatible mapping extension</h4><p>This assigns the missing prime ${row.prime} while preserving every existing mapping column.</p><div class="tablewrap"><table><thead><tr><th>Prime</th><th>Current (P,G)</th><th>Preview (P,G)</th></tr></thead><tbody>${row.mappingContext.basis.map((prime,i)=>{const old=getState().basis.indexOf(prime);return `<tr><td>${prime}</td><td>${old<0?'Outside subgroup':getState().rows.map(r=>r[old]).join(', ')}</td><td>${row.mappingContext.rows.map(r=>r[i]).join(', ')}</td></tr>`;}).join('')}</tbody></table></div><p>Target (${row.targetCoordinate.join(', ')}) · ${number(row.tunedCents)}¢ · error ${number(row.signedErrorCents)}¢, using the current tuning.</p><p>Preview only. Adopt explicitly to change the temperament mapping.</p>${button('adopt','Adopt this mapping')}${source?'<details><summary>Validation and search bounds</summary><pre>'+esc(JSON.stringify(row.validationEvidence,null,2))+'</pre></details>':''}`;}
 function details(){if(!entry)return '<p class="harmony-empty">Select a harmony to inspect its mapping, scale occurrences and voicings.</p>';
  if(entry.kind==='mapping')return mappingDetails(entry);
  const m=detailModel(),geometry=m.geometry;
  const quality=entry.kind==='ji'?`Worst mapped pair error ${number(entry.tuning?.pairwiseMaxErrorCents)}¢`:entry.kind==='interval'?entry.coordinate?`Mapped error ${number(entry.tuning?.signedErrorCents)}¢`:entry.approximation?`Approximation (${entry.approximation.coordinate.join(', ')}) · ${number(entry.approximation.tunedCents)}¢ · error ${number(entry.approximation.signedErrorCents)}¢ · generator search ±32`:'Outside subgroup':'';
  return `<h4>${esc(rowLabel(entry))}</h4>${entry.kind==='ji'?`<p>Exact spelling ${esc(entry.interpretation.identity.orderedInput.join(':'))} · ${getState().basis.includes(2)?'octave':'exact'} family ${esc(harmonicIdentity(entry.interpretation.identity,getState().basis.includes(2)?'octave':'exact').familyRatios.join(' : '))}</p><div class="panelactions">${button('dual','Open reciprocal chord')}${button('family','Browse family aliases')}${button('diamond','Show in diamond')}</div>`:''}
   ${entry.kind==='source'?'<p>Source sounding coordinates and voices are preserved. Saved assessment metadata is historical; start a fresh ET search for a current classification.</p>':''}
   ${quality?`<p>${quality}. ${Number.isFinite(entry.tuning?.pairwiseMaxErrorCents)&&entry.tuning.pairwiseMaxErrorCents>tolerance()?'Above the current tolerance; still mapped.':''}</p>`:''}
   ${entry.kind==='approximation'?`<p>Alternative coordinates, compared with the canonical mapping. Target ${esc(entry.targetRatio??entry.interpretation?.preferredLabel??'JI chord')} · canonical error ${number(entry.canonicalAbsoluteErrorCents??entry.canonicalProjection?.pairwiseMaxErrorCents)}¢ · alternative error ${number(entry.absoluteErrorCents??entry.pairwiseMaxErrorCents)}¢ · improvement ${number(entry.improvementCents)}¢.</p><p>${entry.canonicalCoordinate?`Canonical (${entry.canonicalCoordinate.join(', ')}) → alternative (${entry.coordinate.join(', ')}).`:'Root-relative chord coordinates use one consistent vertex assignment.'} Approximation does not change the mapping.</p>`:''}
   ${entry.assessment?`<p><b>${esc(entry.status)}</b> relative to odd limit ${getSettings(getState()).limit}, ${getState().basis.includes(2)?'mapped-octave':'native-exact'} equivalence. ${entry.status==='unknown'?'Search incomplete; this is not an ET proof.':entry.status==='essentially-tempered'?'Every dyad has a target interpretation; complete finite search found no coherent JI lift.':'A coherent JI lift was found.'}</p><details><summary>Dyad evidence and search certificate</summary><p>${entry.assessment.exploredStates} states explored · proof ${entry.assessment.complete?'complete':'incomplete'}</p>${(entry.assessment.obstruction?.representativeCycles??[]).map(c=>`<p>Kernel cycle ${esc(c.commaRatio)} · monzo [${c.correctedMonzo.join(', ')}]</p>`).join('')}<pre>${esc(JSON.stringify(entry.assessment,null,2))}</pre></details>`:''}
   ${!geometry?`<p>Outside the mapping subgroup · missing primes ${entry.missingPrimes?.join(', ')??'unknown'}. No sounding coordinates are available.</p>`:`
    <div class="tablewrap"><table><thead><tr><th>Member</th><th>(P,G)</th><th>Sounding ¢</th></tr></thead><tbody>${occurrenceShape(m.state,geometry.shape).members.map((member,i)=>`<tr><td>${esc(geometry.tones?.[i]?.label??`Voice ${i+1}`)}</td><td>${member.sourceCoordinate.join(', ')}</td><td>${number(coordinateCents(m.state,member.sourceCoordinate))}</td></tr>`).join('')}</tbody></table></div>
    <p>${scope.startsWith('play')?'Play':'Discover'} scale: ${m.state.n} notes, mode ${m.state.mode+1} · ${m.occurrences.anywhereCount} complete occurrences · ${m.occurrences.tonicOccurrences.length} tonic-anchored.</p>
    ${m.occurrences.completeOccurrences.length?`<label>Occurrence<select data-harmony-field="root"><option value="">Choose a root for voicing</option>${m.occurrences.completeOccurrences.map(root=>option(root.id,`Degree ${root.root}${root.tonicAnchored?' · tonic':''}`,selectedRoot)).join('')}</select></label>`:`<p>Mapped harmony is absent from this scale. Generator span ${m.occurrences.generatorSpan}; at least ${m.occurrences.minimumChainSize} consecutive generator positions are needed.</p>`}
    ${m.voice?`<div class="harmony-controls">${select('inversion','Bass / inversion',inversion,m.voice.variants.map(v=>[v.id,v.label]))}${select('style','Spacing',style,[['original','Original spelling'],['compact','Compact'],['open','Open']])}<label>Shift · periods<input type="number" data-harmony-field="periodShift" min="-8" max="8" value="${periodShift}"></label></div><p>${m.voice.voices.length} voices · ${esc(m.voice.reference.label)} · ${m.voice.ratios?.map(esc).join(' : ')??'Coordinate-only voicing'}${m.voice.maxErrorCents==null?'':` · worst voiced pair ${number(m.voice.maxErrorCents)}¢`}</p>`:''}
    <div class="panelactions">${button('hear',m.voice?'Hear voicing':'Hear mapped notes')}${button('collect','Add to collection',occurrenceShape(m.state,geometry.shape).members.length<2?'disabled':'')}${button('send','Send to Play')}</div>`}`;
 }
 // The browse controls, status and list form the harmony directory; the selected harmony's
 // analysis is a separate part so a layout can place the two apart over one shared state.
 function renderParts(){sync();const rows=filtered();page=Math.min(page,Math.max(0,Math.ceil(catalogueListGroups(rows).length/(category==='ji'?12:24))-1));
  return {controls:`<div class="harmony-controls">${select('category','Browse',category,Object.entries(names))}${select('scope','Scale membership',scope,[['temperament','Whole temperament'],['discover','Discover scale · anywhere'],['discover-tonic','Discover scale · tonic'],['play','Play scale · anywhere'],['play-tonic','Play scale · tonic']])}<label>Search or exact ratio chord<input type="search" data-harmony-field="search" maxlength="300" value="${esc(query)}" placeholder="4:5:6, 5:6:8 or 1/6:5:4"></label>${button('lookup','Look up chord')}</div>
   ${category==='mappings'?`<div class="harmony-controls"><label>Target with missing prime<input data-harmony-field="mappingTarget" maxlength="80" value="${esc(mappingTarget)}"></label>${button('start','Search compatible extensions')}</div>`:category==='approximations'?`<div class="harmony-controls"><label>JI interval or chord<input data-harmony-field="target" maxlength="300" value="${esc(target)}"></label>${button('start','Compare approximations')}</div>`:category==='et'?`<div class="harmony-controls">${select('etSize','Voices',etSize,[3,4,5].map(n=>[n,n]))}${select('etBound','Candidate bound',etBound,[128,256,1024].map(n=>[n,n]))}${button('start',etStarted?'Search again':'Start ET search')}${status==='loading'?button('cancel','Cancel search'):''}</div>`:''}
   ${familyFilter?`<div class="panelactions"><span>Family aliases</span>${button('all','Show all harmony')}</div>`:''}<div class="harmony-status" role="status" aria-live="polite">${status==='loading'?`Searching ${esc(progress?.category??names[category])} · ${progress?.count??0} records`:status==='idle'&&category==='et'?'Start a bounded search to assess dyadic shapes.':status==='cancelled'?'Search cancelled. Any retained list is from the last completed result.':status==='incomplete'?`Partial search · ${rows.length} matching rows. Search bounds were reached; unassessed shapes are not ET.`:`${rows.length} matching rows${result?.complete?' · catalogue search complete':''}`}</div>
   ${error?`<p role="alert">${esc(error)}</p>`:''}`,
   list:`${rows.length?renderCatalogueList(rows,selected,{page}):status==='loading'?'<p>Loading harmony…</p>':'<p class="harmony-empty">No matching results. Adjust the category, limits or scale filter, or look up an exact chord.</p>'}`,
   detail:details(),
   info:`   <details class="harmony-search-info"><summary>Search scope and bounds</summary><p>Catalogue identities are independent of the selected scale and board. Tolerance changes tuning quality, not mapping. Exact lookups can inspect chords outside browse limits. ET is relative to the current target set; unknown means the proof was not completed.</p><p>Catalogue bound: 512 records. Approximation generator bound: ±32. Mapping previews preserve the current columns. ${result?.recordCap?'Record cap reached.':''}</p>${result?`<pre>${esc(JSON.stringify(result.sources.map(s=>({kind:s.kind,complete:s.complete,reason:s.reason??null,bounds:s.bounds??s.result?.bounds??null})),null,2))}</pre>`:''}</details>
   <details><summary>Inspect selected notes</summary>${button('inspect','Open manual note inspector')}</details>`};
 }
 function render(){const parts=renderParts();
  return `<section class="harmony-workspace" aria-label="Harmonic discovery">
   ${parts.controls}<div class="harmony-columns"><div>${parts.list}</div><article class="harmony-detail" aria-label="Selected harmony">${parts.detail}</article></div>
   ${parts.info}</section>`;
 }
 function change(el){const name=el?.dataset?.harmonyField;if(!name)return false;
  if(name==='search'&&query===el.value||name==='target'&&target===el.value||name==='mappingTarget'&&mappingTarget===el.value)return true;
  try{if(name==='search'){query=String(el.value).slice(0,300);page=0;familyFilter=null;}else if(name==='scope'){if(!['temperament','discover','discover-tonic','play','play-tonic'].includes(el.value))return true;scope=el.value;selectedRoot='';sourceSelection=null;}
   else if(name==='category'){if(!names[el.value])return true;category=el.value;if(category==='mappings')scope='temperament';query='';familyFilter=null;directInputs=[];stamp='';entry=null;selected='';result=null;error='';selectedRoot='';sourceSelection=null;pendingRestore=null;if(category==='et'){generation++;jobs.cancel();status='idle';etStarted=false;}else void run();}
   else if(name==='root'){selectedRoot=el.value;inversion=0;sourceSelection=null;}
   else if(name==='inversion')inversion=Number(el.value);else if(name==='style')style=el.value;else if(name==='periodShift')periodShift=Math.max(-8,Math.min(8,Math.round(Number(el.value)||0)));
   else if(name==='target')target=String(el.value).slice(0,300);else if(name==='mappingTarget')mappingTarget=String(el.value).slice(0,80);
   else if(name==='etSize')etSize=Number(el.value);else if(name==='etBound')etBound=Number(el.value);
   refresh();}catch(e){notify(e.message);}return true;
 }
 async function openInput(text,{selection=null}={}){category='ji';query=String(text).slice(0,300);entry=null;selected='';await run({direct:query});if(!result)return;
  const identity=chordIdentity(query),found=result.items.find(row=>row.interpretationId===identity.fingerprint);
  if(found){entry=found;selected=found.id;sourceSelection=selection;refresh();}}
 function click(node){const b=node?.closest?.('[data-harmony-action]')??node,action=b?.dataset?.harmonyAction;if(!action)return false;
  try{
   if(action==='select'){entry=result?.items.find(row=>row.id===b.dataset.id)??null;selected=entry?.id??'';selectedRoot='';inversion=0;sourceSelection=null;}
   if(action==='previous')page=Math.max(0,page-1);if(action==='next')page++;
   if(action==='start'){etStarted=category==='et';void run();}
   if(action==='cancel'){generation++;jobs.cancel();status='cancelled';}
   if(action==='lookup'){chordIdentity(query);void openInput(query).catch(e=>{error=e.message;refresh();});}
   if(action==='dual'&&entry?.interpretation)void openInput(entry.interpretation.exactDual.originalInput);
   if(action==='family'&&entry){query='';scope='temperament';familyFilter=entry.familyId;page=0;}
   if(action==='hear'){const value=currentSelection();if(value)play(value.voicing.voices.map(v=>coordinateCents(state(),v.coordinate)));}
   if(action==='collect'||action==='send'){const value=currentSelection();if(value){if(action==='collect')onCollect(state(),value.voicing.voices.map(v=>v.coordinate),value.label,{exact:true,harmonicSelection:value});else onSendToHexBoard(value);}}
   if(action==='adopt'&&entry?.kind==='mapping')onAdoptMapping(entry.mappingContext,entry);
   if(action==='all')familyFilter=null;
   if(action==='diamond'){const value=currentSelection();if(value)onShowDiamond(value);}
   if(action==='inspect')onInspect();
   refresh();
  }catch(e){error=e.message;notify(e.message);refresh();}return true;
 }
 function setEnabled(value){if(enabled===value)return;enabled=!!value;if(!enabled){generation++;jobs.cancel();if(status==='loading'){stamp='';status='idle';}}else sync();}
 return {render,renderParts,change,click,sync,setEnabled,openInput,layoutEntries:()=>status==='loading'||status==='error'?[]:filtered(),
  input(el){const field=el?.dataset?.harmonyField;if(!['search','target','mappingTarget'].includes(field))return false;if(field==='search'){query=String(el.value).slice(0,300);familyFilter=null;page=0;refresh();}if(field==='target')target=String(el.value).slice(0,300);if(field==='mappingTarget')mappingTarget=String(el.value).slice(0,80);return true;},
  openSelection(value){value=validateHarmonicSelection(value);generation++;jobs.cancel();category='ji';query='';familyFilter=null;pendingRestore=null;status='idle';error='';result=null;stamp=catalogueContext(payload()).id;selectedRoot='';sourceSelection=value;entry={id:'source:'+value.voicing.id,kind:'source',shape:value.shape,preferredLabel:value.label};selected=entry.id;refresh();},selection:currentSelection,model:()=>({category,scope,query,selected,entry,result,status,error,detail:detailModel()}),
  serialize:()=>({version:1,category,scope,query,target,mappingTarget,etSize,etBound,directInputs,selected,selectedInterpretation:entry?.interpretationId??null,selectedRoot,inversion,style,periodShift,selection:currentSelection()}),
  restore(data){generation++;jobs.cancel();result=null;entry=null;selected='';selectedRoot='';sourceSelection=null;familyFilter=null;pendingRestore=null;directInputs=Array.isArray(data?.directInputs)?data.directInputs.filter(v=>typeof v==='string'&&v.length<=300).slice(0,1):[];stamp='';error='';status='idle';category=names[data?.category]?data.category:'ji';scope=['temperament','discover','discover-tonic','play','play-tonic'].includes(data?.scope)?data.scope:'temperament';query=typeof data?.query==='string'?data.query.slice(0,300):'';target=typeof data?.target==='string'?data.target.slice(0,300):'16/15';mappingTarget=typeof data?.mappingTarget==='string'?data.mappingTarget.slice(0,80):'7/4';etSize=[3,4,5].includes(data?.etSize)?data.etSize:3;etBound=[128,256,1024].includes(data?.etBound)?data.etBound:256;inversion=Number.isSafeInteger(data?.inversion)?Math.max(0,Math.min(7,data.inversion)):0;style=['original','compact','open'].includes(data?.style)?data.style:'original';periodShift=Number.isSafeInteger(data?.periodShift)?Math.max(-8,Math.min(8,data.periodShift)):0;if(data?.selection)try{pendingRestore={...data,selection:validateHarmonicSelection(data.selection)};}catch{notify('Unsupported harmonic metadata was ignored.');}},
  destroy(){generation++;enabled=false;jobs.destroy();occurrences.entries.clear();}};
}
