// Play's Shapes view: a catalogue of physical chord shapes found for target chords on the current board,
// and reverse identification of selected keys. Both run through shape jobs; the forward catalogue and
// the selected-key reading are kept apart, and only one lights the board at a time.
import {createShapeJobs,shapeJobContextId,presentShapeResult} from './shape-jobs.mjs';
import {chordIdentity} from './chord-identity-v2.mjs';
import {mappingContext} from './harmonic-context.mjs';
import {boardPicture,boardSvg} from './hexboard-view.mjs';
import {browserPresetStore} from './preset-store.mjs';
import {shapePresetFromPlacement} from './shape-preset-data.mjs';
import {validateChordShapeConstraints,chordShapeDefaults} from './chord-shapes.mjs';
import {shapeOrientations} from './geometric-shapes.mjs';
import {inversionName,rootedChordName} from './harmonic-bass.mjs';
import {sourceShapeVoicing} from './harmonic-selection.mjs';
import {validateHarmonicSelection} from './harmonic-types.mjs';
import {esc,option} from './ui.mjs';

const clone=value=>JSON.parse(JSON.stringify(value));
const short=value=>Number.isFinite(value)?value.toFixed(2):'—';
const action=(name,label,attrs='')=>`<button data-shape-action="${name}" ${attrs}>${label}</button>`;
const textOf=value=>typeof value==='string'?value:value?.input;
const identityOf=value=>chordIdentity(textOf(value)).fingerprint;
const plural=(n,word)=>`${n} ${word}${n===1?'':'s'}`;
const REASONS={'max-nodes':'search node limit reached','max-placements':'placement limit reached','target-limit':'source chord limit reached',
 'ji-search-bound':'JI chord enumeration bound reached','directory-incomplete':'the harmony directory is still incomplete','reference-unavailable':'no mapped voicing reference','cancelled':'cancelled'};
const GEOMETRY_FILTERS=[['all','All shapes'],['same-size','Same key count'],['exact','Same geometry'],['orientations','Rotations and reflections'],['reading','Shares a JI reading']];

/** How a reading relates to its source chord, in words. */
export function matchKindLabel(reading){
 if(reading?.matchKind==='added-doubling')return 'Added doubling: a reading of the distinct notes';
 if(reading?.matchKind==='reference-voicing')return `Exact placement, notes moved by ${reading.reference?.ratio??'the voicing reference'}`;
 return 'Exact placement of the source voicing';
}

/**
 * Source spellings of one chord family read with the same root key (4:5:6, 1:3:5 and 5:6:8 on the same
 * buttons) are one musical reading. Groups keep every reading; `preferred` is the family's own spelling
 * when present, otherwise a source voicing.
 */
export function groupReadings(readings){
 const groups=new Map();
 for(const reading of readings??[]){
  const key=JSON.stringify([reading.familyId,reading.rootKey,reading.matchKind==='added-doubling']);
  if(!groups.has(key))groups.set(key,{key,readings:[]});groups.get(key).readings.push(reading);
 }
 return [...groups.values()].map(group=>({...group,preferred:group.readings.find(r=>r.input===r.label)??group.readings.find(r=>r.sourceVoicing)??group.readings[0],
  spellings:[...new Set(group.readings.map(r=>r.input))]}));
}

export function selectionShapeInput(selection){
 if(!selection?.tones?.length)return null;
 return selection.tones.map(t=>`${t.n}/${t.d}`).join(':');
}

/** Chord-tone numbers are independent of canonical geometric cell order; doubled keys repeat a tone. */
export function shapePlacementOverlay(placement,association){
 const toneLabels={},push=(key,tone)=>{if(key!=null)(toneLabels[key]??=[]).push(tone);};
 for(const [i,key]of (association?.memberKeys??[]).entries())
  for(const each of association.doubledMemberKeys?.[i]??[key])push(each,association.members?.[i]?.toneIndex??i);
 if(!Object.keys(toneLabels).length)for(const [i,link]of (association?.memberLinks??[]).entries())
  push(link.key??link.keyIndex??placement.keys[link.cell??link.cellIndex],link.member??link.memberIndex??i);
 return {...placement,label:association?.label??'Chord shape',toneLabels};
}

export function shapeMaterialSelection(state,shape,placement,association){
 const geometry={coordinates:placement.coords,equivalence:'exact'},voicing=sourceShapeVoicing(state,geometry);
 voicing.rootVoice=placement.keys.indexOf(association.rootKey);
 return validateHarmonicSelection({version:1,mappingId:mappingContext(state).id,shapeId:voicing.shapeId,source:'shape-catalogue',shape:geometry,voicing,
  harmonicId:association.familyId,interpretationId:association.chordId,label:association.label,
  provenance:{geometricShapeId:shape.id,sourceInput:association.input,sourceChordId:association.chordId,memberCells:association.memberCells,lifts:association.lifts}});
}

// The existing directory/ET classification of the selected pitch classes, kept apart from exact readings.
function classificationText(c){
 if(!c)return 'Open Discover once so the harmony directory can classify these pitch classes.';
 const doubled=c.doubled?' Doubled notes are ignored here.':'';
 if(c.status==='note')return `One pitch class.${doubled}`;
 if(c.status==='interval')return `Interval ${c.label}${c.readings?.length>1?` (also ${c.readings.slice(1,4).join(', ')})`:''}.${doubled}`;
 if(c.status==='none')return `${c.reason??'No reading'}.${doubled}`;
 if(c.status!=='chord')return 'No pitch-class reading.';
 if(c.kind==='tempered')return c.form==='et'
  ?`Essentially tempered within the selected JI limits: every pair has a JI reading, but no single JI chord realizes them all (${c.label}).${doubled}`
  :`Unresolved: the bounded tempered-chord assessment did not decide (${c.label}).${doubled}`;
 const listed=c.source==='directory'?'listed in the harmony directory':'a JI chord proved from the selected limits, outside the directory’s listed sizes';
 return `${c.label} · ${c.formLabel??'JI'}${c.rotation?`, played as ${c.rotation}`:''} (${listed}).${c.alternatives?.length?` Also ${c.alternatives.slice(0,3).join(', ')}.`:''}${doubled}`;
}

export function createShapeExplorer({getState,getBoard,getConfig,getSettings=()=>({}),getSelection=()=>null,getSelectedKeys=()=>[],getDirectory=()=>null,
 classify=()=>null,onOpenHarmony=()=>false,refresh=()=>{},onHighlight=()=>{},play=()=>{},onCollect=()=>{},notify=()=>{},store=browserPresetStore,workerFactory}={}){
 let inputs=[],draft='',constraints=chordShapeDefaults(),universe='selected',result=null,status='idle',error='',progress=null,context='',lastPayload=null;
 let identity=null,identityStatus='idle',identityError='',identityContext='',identityPayload=null,identityIndex=-1;
 let selectedId='',placementIndex=0,readingIndex=0,page=0,savedOnly=false,related='all',saved=[],savedStatus='idle',savedError='',saving=false,pendingShapeId='',tuningStamp='',lastProgressAt=0,synced=null;
 const jobs=createShapeJobs({workerFactory,onMessage:message=>{
  if(message.type==='progress'){progress=message.progress;const now=Date.now();if(now-lastProgressAt>100){lastProgressAt=now;refresh();}}
 }});
 const currentShape=()=>result?.shapes?.find(shape=>shape.id===selectedId)??null;
 const currentPlacement=()=>currentShape()?.placements?.[placementIndex]??null;
 const placementGroups=()=>groupReadings(currentPlacement()?.associations);
 const currentReading=()=>{const groups=placementGroups();return (groups[readingIndex]??groups[0])?.preferred??null;};
 const identityReadings=()=>identity?(identity.matches.length?identity.matches:identity.doublingReadings??[]):[];
 const identityGroups=()=>groupReadings(identityReadings());
 const sameMapping=row=>mappingContext(row.state.context).id===mappingContext(getState()).id;
 const isSaved=shape=>saved.some(row=>row.state.shape.id===shape.id&&sameMapping(row));
 const tuningKey=()=>JSON.stringify([getState().p,getState().g]);
 function invalidate(message='Search again for this board or target set.'){
  if(status==='searching')jobs.cancel();
  result=null;context='';lastPayload=null;status='idle';progress=null;selectedId='';placementIndex=0;readingIndex=0;error=message;
  if(identityIndex<0)onHighlight(null);
 }
 function clearIdentity(message=''){
  if(identityStatus==='searching')jobs.cancel();
  identity=null;identityContext='';identityPayload=null;identityStatus='idle';identityError=message;
  if(identityIndex>=0){identityIndex=-1;onHighlight(null);}
 }
 function payload(){
  const directory=universe==='directory'?getDirectory():null;
  if(universe==='directory'&&!directory?.ready)throw Error('Open Discover and wait for its harmony directory to finish before searching its filters.');
  return clone({state:getState(),board:getBoard(),settings:getSettings(),inputs,universe,constraints,keys:[],filters:directory?.filters??{},directoryComplete:directory?.complete??true});
 }
 // Reverse lookup reads fixed keys, so only the search budget comes from the forward constraints.
 const identifyPayload=()=>clone({state:getState(),board:getBoard(),settings:getSettings(),inputs:[...new Set([...inputs,...saved.map(row=>row.state.source.input)])],
  universe:'reverse',constraints:{maxNodes:constraints.maxNodes,maxPlacements:constraints.maxPlacements},keys:[...getSelectedKeys()],filters:{},directoryComplete:true});
 // Structure changes invalidate; a retune rederives sound from the stored coordinates.
 function sync(){
  const state=getState(),board=getBoard(),stateKey=JSON.stringify(state),settings=JSON.stringify(getSettings()),keys=JSON.stringify(getSelectedKeys()),directory=universe==='directory'?JSON.stringify(getDirectory()):'';
  if(synced&&synced.state===stateKey&&synced.board===board&&synced.settings===settings&&synced.keys===keys&&synced.directory===directory&&synced.context===context&&synced.identityContext===identityContext)return;
  const base=source=>({...source,state:clone(state),board:clone(board),settings:JSON.parse(settings)});
  if(lastPayload&&context){
   try{
    const next=base(lastPayload);
    if(lastPayload.universe==='directory'){const d=getDirectory();if(d?.ready){next.filters=d.filters;next.directoryComplete=d.complete;}}
    if(shapeJobContextId('shape-search',next)!==context)invalidate();
   }catch(e){invalidate(e.message);}
  }
  if(identityPayload&&identityContext){
   try{if(shapeJobContextId('shape-identify',{...base(identityPayload),keys:JSON.parse(keys)})!==identityContext)clearIdentity();}catch{clearIdentity();}
  }
  const tuning=tuningKey();
  if(tuning!==tuningStamp){if(result)result=presentShapeResult(result,state);if(identity)identity=presentShapeResult(identity,state);tuningStamp=tuning;}
  synced={state:stateKey,board,settings,keys,directory,context,identityContext};
 }
 function add(input){
  const identity=chordIdentity(input);
  if(!inputs.some(item=>identityOf(item)===identity.fingerprint&&JSON.stringify(chordIdentity(item).orderedRatios)===JSON.stringify(identity.orderedRatios))){
   if(inputs.length>=512)throw Error('Keep at most 512 selected target chords.');inputs.push(input);
  }
 }
 const addDraft=()=>{for(const input of draft.split(/[;\n]+/).map(s=>s.trim()).filter(Boolean))add(input);draft='';};
 function accept(selection){const input=selectionShapeInput(selection);if(input){try{const count=inputs.length;add(input);if(inputs.length!==count)invalidate('');}catch(e){notify(e.message);}}}
 async function init(){
  if(savedStatus==='loading')return;savedStatus='loading';savedError='';
  try{saved=await store.list('shape');savedStatus='ready';}catch(e){savedStatus='error';savedError=e.message;}refresh();
 }
 async function search(){
  try{
   addDraft();
   if(universe==='selected'&&!inputs.length){const input=selectionShapeInput(getSelection());if(input)add(input);else throw Error('Add a JI chord such as 4:5:6 before searching.');}
   const request=payload();
   if(identityStatus==='searching'){identityStatus='idle';identityError='Identification stopped for the shape search. Identify the keys again.';}
   if(identityIndex<0)onHighlight(null);
   result=null;selectedId='';page=0;error='';progress=null;status='searching';lastPayload=request;context=shapeJobContextId('shape-search',request);refresh();
   const job=jobs.run('shape-search',request),message=await job.promise;
   if(message.status==='cancelled'||context!==job.contextId)return;
   if(message.type==='error')throw Error(message.message);
   result=message.result;status='ready';progress=null;tuningStamp=tuningKey();
   if(pendingShapeId){selectedId=result.shapes.some(shape=>shape.id===pendingShapeId)?pendingShapeId:'';pendingShapeId='';if(selectedId)highlight();}
   refresh();
  }catch(e){
   // An error before the job starts (an invalid typed chord) leaves earlier results and their checks intact.
   if(status==='searching'){context='';lastPayload=null;status='error';}
   error=e.message;refresh();
  }
 }
 async function identify(){
  try{
   if(!getSelectedKeys().length)throw Error('Select at least one enabled board key to identify its shape.');
   const request=identifyPayload();
   if(status==='searching'){status='idle';context='';lastPayload=null;error='Shape search stopped to identify the selected keys. Run Find shapes again.';}
   identity=null;identityIndex=-1;identityError='';identityStatus='searching';identityPayload=request;identityContext=shapeJobContextId('shape-identify',request);progress=null;refresh();
   const job=jobs.run('shape-identify',request),message=await job.promise;
   if(message.status==='cancelled'||identityContext!==job.contextId)return;
   if(message.type==='error')throw Error(message.message);
   identity=message.result;identityStatus='ready';progress=null;tuningStamp=tuningKey();
   if(identityGroups().length)chooseIdentityReading(0);
   refresh();
  }catch(e){
   if(identityStatus!=='searching'){notify(e.message);return;}
   identityStatus='error';identityError=e.message;identityContext='';identityPayload=null;refresh();
  }
 }
 function highlight(){const p=currentPlacement();identityIndex=-1;onHighlight(p?shapePlacementOverlay(p,currentReading()):null);}
 function chooseIdentityReading(index){
  const reading=identityGroups()[index]?.preferred;if(!reading)return;
  identityIndex=index;selectedId='';onHighlight(shapePlacementOverlay({keys:[...identity.selected.keys],coords:identity.selected.coordinates},reading));
 }
 function select(id){selectedId=id;placementIndex=0;readingIndex=0;highlight();refresh();}
 // Compare with the identified keys when present, otherwise with the chosen card.
 function referenceShape(){
  if(identity?.selected)return {kind:'keys',id:identity.selected.id,cells:identity.selected.cells,chordIds:new Set(identityReadings().map(r=>r.chordId))};
  const shape=currentShape();return shape?{kind:'card',id:shape.id,cells:shape.cells,chordIds:new Set(shape.associations.map(a=>a.chordId))}:null;
 }
 function filteredShapes(){
  let shapes=result?.shapes??[];if(savedOnly)shapes=shapes.filter(isSaved);
  const reference=related==='all'?null:referenceShape();
  if(reference){
   if(related==='same-size')shapes=shapes.filter(shape=>shape.cells.length===reference.cells.length);
   else if(related==='exact')shapes=shapes.filter(shape=>shape.id===reference.id);
   else if(related==='orientations'){const ids=new Set(shapeOrientations(reference.cells).map(o=>o.id));shapes=shapes.filter(shape=>ids.has(shape.id));}
   else if(related==='reading')shapes=shapes.filter(shape=>shape.associations.some(a=>reference.chordIds.has(a.chordId)));
  }
  return shapes;
 }
 function preview(shape,placement=shape.placements[0],association=placement?.associations?.[0]){
  if(!placement)return '';
  const picture=boardPicture(getState(),getConfig(),getBoard(),{overlay:shapePlacementOverlay(placement,association),chord:[]});
  return boardSvg(picture,{className:'shape-preview',ariaLabel:`${shape.cells.length} key shape`,visibleKeys:placement.keys,interactive:false});
 }
 const readingName=reading=>esc(rootedChordName(reading?.rootDegree,reading?.label??'Chord shape'));
 const readingFacts=reading=>!reading?'':[matchKindLabel(reading),reading.rootDegree==null?`root on button ${reading.rootKey}`:null,
  reading.possibleInversions?.length?reading.possibleInversions.map(inversionName).join(' / '):null,reading.withinScale===false?'outside the Play scale':null].filter(Boolean).join(' · ');
 const spellingLine=group=>group?.spellings?.length>1?`<p class="dim">Source spellings on these keys: ${esc(group.spellings.slice(0,6).join(', '))}${group.spellings.length>6?` +${group.spellings.length-6}`:''}</p>`:'';
 function details(){
  const shape=currentShape(),placement=currentPlacement(),reading=currentReading();if(!shape||!placement)return '';
  const source=result.targets?.find(t=>t.id===reading?.targetId),groups=placementGroups(),group=groups[readingIndex]??groups[0];
  return `<section class="shape-details" aria-label="Selected shape"><h4>${readingName(reading)}</h4>
   ${preview(shape,placement,reading)}<p>Place ${placementIndex+1} of ${shape.placements.length}${result.complete?'':' found'} · buttons ${placement.keys.join(', ')}</p>
   <div class="panelactions">${action('previous','← Previous',shape.placements.length<2?'disabled':'')}${action('next','Next →',shape.placements.length<2?'disabled':'')}${action('hear','Hear')}${action('collect','Add to collection',placement.keys.length<2?'disabled':'')}</div>
   ${groups.length>1?`<label>JI reading<select data-shape-field="reading">${groups.map((g,i)=>option(i,rootedChordName(g.preferred.rootDegree,g.preferred.label??g.preferred.chordId),readingIndex)).join('')}</select></label>`:''}
   <p>${esc(readingFacts(reading))}</p>${spellingLine(group)}
   <p>Sound: ${placement.pitches.map(n=>short(n)).join(' · ')} ¢</p>
   <p>Span ${short(shape.metrics.span)} · mean pair distance ${short(shape.metrics.meanPairDistance)} key spacings · geometry score ${short(shape.metrics.score)}</p>
   <details><summary>Coordinates and chord tones</summary><p>Relative axial cells: ${esc(shape.cells.map(cell=>`(${cell.join(', ')})`).join(' '))}</p><p>Played coordinates: ${esc(placement.coords.map(cell=>`[${cell.join(', ')}]`).join(' '))}</p><p>Moves by ${esc(reading?.reference?.ratio??'reference')}: ${esc((reading?.lifts??[]).join(', '))}</p><p>One key may carry several chord-tone numbers. These numbers name chord tones, not fingers.</p></details>
   <div class="panelactions">${action('save',isSaved(shape)?'Save this reading':'Save shape',saving||savedStatus!=='ready'?'disabled':'')}${action('clear-highlight','Clear highlight')}</div>
   ${source?.outsideLimits?'<p class="notice">This explicit target is outside the current JI browse limits.</p>':''}</section>`;
 }
 function identityMarkup(){
  if(identityStatus==='idle')return identityError?`<p role="status">${esc(identityError)}</p>`:'';
  if(identityStatus==='searching')return `<p role="status">Identifying the selected keys${progress?.visited!=null?` · ${progress.visited} nodes`:''}…</p>`;
  if(identityStatus==='error')return `<p role="alert">${esc(identityError)}</p>`;
  const sel=identity.selected,groups=identityGroups(),exact=!sel.addedDoublings,distinct=sel.soundingKeys.length;
  const listed=result?.shapes?.find(shape=>shape.id===sel.id),reference=referenceShape(),sharing=result?(result.shapes??[]).filter(shape=>shape.id!==sel.id&&shape.associations.some(a=>reference?.chordIds.has(a.chordId))).length:0;
  const sources=identity.sourceUniverse?.counts?.targets;
  return `<section class="shape-identity" aria-label="Selected keys"><h5>Selected keys · ${plural(sel.keys.length,'button')}</h5>
   <p>Buttons ${sel.keys.join(', ')} · span ${short(sel.metrics.span)} · mean pair distance ${short(sel.metrics.meanPairDistance)} key spacings</p>
   ${exact?'':`<p class="notice">${plural(sel.addedDoublings,'button')} repeat${sel.addedDoublings===1?'s':''} a note already selected. The readings below describe the ${plural(distinct,'distinct note')}; no source voicing places a doubled note on two buttons, so they are not exact placements of these ${sel.keys.length} buttons.</p>`}
   ${groups.length?`<p>${exact?'Exact shape readings':'Readings of the distinct notes'} (${groups.length}${identity.complete?'':', found so far'}):</p><ul class="shape-readings">${groups.map(({preferred:r,...group},i)=>`<li><button data-shape-action="identity-reading" data-index="${i}" aria-pressed="${i===identityIndex}">${readingName(r)}</button> <small>${esc(readingFacts(r))}</small>${spellingLine(group)}
    ${action('find-reading','Find shapes for this chord',`data-index="${i}"`)}${exact?action('save-reading','Save',`data-index="${i}" ${saving||savedStatus!=='ready'?'disabled':''}`):''}</li>`).join('')}</ul>`
   :`<p>No JI chord among ${sources==null?'the searched':sources} source chords reads these exact keys${identity.complete?'':' within the searched bounds'}. This is not evidence that the chord is essentially tempered.</p>`}
   ${identity.complete?'':`<p class="notice">Partial (${esc(REASONS[identity.reason]??identity.reason??'search limit')}): more readings may exist.</p>`}
   <p><strong>Pitch-class reading</strong> <small>(harmony directory and ET assessment; register and doublings ignored)</small>: ${esc(classificationText(classify(sel.coordinates)))}</p>
   <div class="panelactions">${action('open-harmony','Open in Discover')}${action('clear-identity','Clear')}</div>
   ${result?`<p class="dim">${listed?`This geometry is in the current results with ${plural(listed.placements.length,'place')}.`:'This geometry is not in the current results.'}${sharing?` ${plural(sharing,'other shape')} there share${sharing===1?'s':''} one of its JI readings.`:''}</p>`:''}</section>`;
 }
 const identifyButton=()=>{const count=getSelectedKeys().length;return action('identify',`Identify selected keys (${count})`,count&&identityStatus!=='searching'?'':'disabled');};
 function render(){
  sync();if(savedStatus==='idle'&&globalThis.document)void init();
  const shapes=filteredShapes(),pages=Math.max(1,Math.ceil(shapes.length/24));page=Math.min(page,pages-1);
  const s=getState(),targetRows=result?.targets??[],busy=status==='searching'||identityStatus==='searching',reference=referenceShape();
  return `<section class="shape-explorer" aria-label="Chord shapes"><h4>Chord shapes</h4><p class="dim">Learn a pattern, explore its JI readings, and find its places on this board.</p>
   <label>Target chords<textarea data-shape-draft rows="2" maxlength="16000" placeholder="4:5:6; 10:12:15; 4:5:6:7">${esc(draft)}</textarea></label>
   <div class="panelactions">${action('add','Add targets')}${action('current','Add selected harmony')}${action('clear-targets','Clear targets',!inputs.length?'disabled':'')}</div>
   ${inputs.length?`<div class="shape-targets" aria-label="Selected target chords">${inputs.map((input,i)=>`<span>${esc(input)} ${action('remove-target','×',`data-index="${i}" aria-label="Remove target ${i+1}"`)}</span>`).join('')}</div>`:''}
   <label>Search targets<select data-shape-field="universe">${option('selected','Selected target chords',universe)}${option('directory','Filtered harmony directory',universe)}</select></label>
   <details class="shape-search-options"><summary>Search limits and roots</summary><div class="shape-fields">
    <label>Root<select data-shape-field="rootDegree">${option('','Any root',constraints.rootDegree??'')}${Array.from({length:s.n},(_,i)=>option(i,`Degree ${i}`,constraints.rootDegree??'')).join('')}</select></label>
    <label>Root button<input type="number" min="0" max="139" placeholder="Any" data-shape-field="rootKey" value="${constraints.rootKey??''}"></label>
    <label>Maximum span<input type="number" min="0" max="100" step="0.5" data-shape-field="span" value="${constraints.span}"><small>Key spacings; 0 uses the full board</small></label>
    <label>Lowest register<input type="number" step="1" data-shape-field="registerMin" placeholder="All" value="${constraints.registerMin??''}"></label>
    <label>Highest register<input type="number" step="1" data-shape-field="registerMax" placeholder="All" value="${constraints.registerMax??''}"></label>
    <label>Search nodes<input type="number" min="1" max="1000000" step="1" data-shape-field="maxNodes" value="${constraints.maxNodes}"></label>
    <label>Placement limit<input type="number" min="1" max="20000" step="1" data-shape-field="maxPlacements" value="${constraints.maxPlacements}"></label></div>
    <label class="checklabel"><input type="checkbox" data-shape-field="scaleOnly" ${constraints.scaleOnly?'checked':''}>Only notes in the selected Play scale</label>
    <p>Every voicing within these limits is searched on enabled keys; notes move only by whole octaves (or the temperament’s mapped reference interval). Source chords have 2–8 tones, and tones the temperament merges share one key. Identify selected keys reads the chosen keys whatever these filters say, within the node and placement limits.</p></details>
   <div class="panelactions">${action('search','Find shapes',status==='searching'?'disabled class="primary"':'class="primary"')}${identifyButton()}${busy?action('cancel','Cancel'):''}</div>
   ${status==='searching'?`<p role="status">${progress?.stage==='sources'?'Preparing JI readings':'Searching board shapes'}${progress?.count!=null?` · ${progress.count} sources`:''}${progress?.visited!=null?` · ${progress.visited} nodes`:''}…</p>`:''}
   ${error?`<p role="alert">${esc(error)}</p>`:''}
   ${identityMarkup()}
   ${result?`<p role="status">${plural(result.shapes.length,'geometric shape')} · ${plural(result.placementCount,'place')}${result.complete?' · complete within the selected limits':` · partial (${esc(REASONS[result.reason]??result.reason??'search limit')})`}</p>
    ${!result.complete?'<p class="notice">Counts are lower bounds. “Not found” does not prove that no place or JI reading exists. Raise a limit or narrow the targets.</p>':''}
    <details><summary>Target availability (${targetRows.length})</summary><p>Mapping, the source voicing’s scale occurrence, and a place on this board are separate facts. Moved voicings may fit even when the source voicing does not.</p><ul>${targetRows.slice(0,100).map(t=>`<li>${esc(t.label??t.input??t.id)} · ${t.mappingStatus==='mapped'?'mapped':'outside the mapping'}${t.collisionGroups?.length?' · merged tones share a key':''}${t.sourceScaleOccurrenceCount!=null?` · ${plural(t.sourceScaleOccurrenceCount,'source scale occurrence')}`:''}${t.placementCount!=null?` · ${plural(t.placementCount,'place')}`:''}</li>`).join('')}</ul>${targetRows.length>100?'<p>Showing the first 100 target summaries.</p>':''}</details>
    <div class="shape-fields"><label class="checklabel"><input type="checkbox" data-shape-field="savedOnly" ${savedOnly?'checked':''}>Saved shapes only</label><label>Geometry filter<select data-shape-field="related">${GEOMETRY_FILTERS.map(([value,label])=>option(value,label,related)).join('')}</select>${related!=='all'?`<small>${reference?`Compared with ${reference.kind==='keys'?'the selected keys':'the chosen card'}`:'Choose a card or identify keys to compare'}</small>`:''}</label></div>
    <p class="dim">Geometry score = 100 ÷ (1 + span + mean pair distance). This is a compactness heuristic, not a hand or fingering assessment.</p>
    ${details()}<div class="shape-cards">${shapes.slice(page*24,(page+1)*24).map(shape=>{const p=shape.placements[0],labels=[...new Set((shape.associations??p?.associations??[]).map(a=>a.label).filter(Boolean))];return `<button class="shape-card" data-shape-action="select" data-id="${esc(shape.id)}" aria-pressed="${shape.id===selectedId}">${preview(shape)}<span>${esc(labels.slice(0,3).join(' · ')||'Mapped shape')}${labels.length>3?` +${labels.length-3} readings`:''}</span><small>${shape.cells.length} keys · span ${short(shape.metrics.span)} · ${plural(shape.placements.length,'place')}${isSaved(shape)?' · saved':''}${identity?.selected?.id===shape.id?' · selected keys':''}</small><small>Geometry ${short(shape.metrics.score)}</small></button>`;}).join('')}</div>
    ${!shapes.length?'<p>No shapes found within these filters and search limits.</p>':''}${pages>1?`<div class="panelactions">${action('page-prev','Previous page',page?'':'disabled')}<span>${page+1} / ${pages}</span>${action('page-next','Next page',page+1<pages?'':'disabled')}</div>`:''}`:''}
   <details class="saved-shapes"><summary>Saved shapes (${saved.length})</summary>${savedError?`<p role="alert">${esc(savedError)}</p>`:''}${action('reload-saved','Refresh saved shapes')}
    ${saved.map(row=>`<div class="saved-shape"><span>${esc(row.name)}<small>${esc(row.state.context.name??'Saved temperament')} · ${row.state.shape.cells.length} keys${sameMapping(row)?'':' · another temperament'}</small></span>${action('load-saved','Find here',`data-id="${row.id}"`)}${action('delete-saved','Remove',`data-id="${row.id}"`)}</div>`).join('')}
    <p>Shapes are saved in this browser and included in Export saved presets. Find here searches the current board for the saved chord without loading the saved temperament or layout.</p></details></section>`;
 }
 async function saveReading(shape,placement,association,targets){
  if(saving||savedStatus!=='ready'||!shape||!placement||!association)return;
  saving=true;refresh();try{
   const target=targets?.find(t=>t.id===association.targetId);
   const name=String(association.label??target?.input??'Chord shape').slice(0,80),snapshot=shapePresetFromPlacement(name,{state:getState(),config:getConfig(),shape,placement,association,target});
   const old=saved.find(row=>row.state.shape.id===shape.id&&row.state.source.chordId===snapshot.source.chordId&&mappingContext(row.state.context).id===mappingContext(snapshot.context).id);
   await store.save('shape',old?.id??crypto.randomUUID(),{name,state:snapshot,revision:old?.revision??0});savedError='';await init();notify('Shape saved.');
  }catch(e){savedError=e.message;notify(e.message);}finally{saving=false;refresh();}
 }
 function identityPlacement(reading){
  const shape=identity?.shapes?.[0],placement=shape?.placements.find(p=>p.id===reading?.placementId);
  return {shape,placement};
 }
 function click(node){
  const el=node?.closest?.('[data-shape-action]')??node,act=el?.dataset?.shapeAction;if(!act)return false;
  try{
   if(act==='search'){void search();return true;}
   if(act==='identify'){void identify();return true;}
   if(act==='cancel'){
    jobs.cancel();progress=null;
    if(status==='searching'){status='idle';context='';lastPayload=null;error='Search cancelled. Run Find shapes to start again.';}
    if(identityStatus==='searching'){identityStatus='idle';identityContext='';identityPayload=null;identityError='Identification cancelled.';}
   }
   if(act==='add'){addDraft();invalidate('');}
   if(act==='current'){const input=selectionShapeInput(getSelection());if(!input)throw Error('Select a JI harmony in Discover first.');add(input);invalidate('');}
   if(act==='clear-targets'){inputs=[];invalidate('');}
   if(act==='remove-target'){inputs.splice(Number(el.dataset.index),1);invalidate('');}
   if(act==='select'){select(el.dataset.id);return true;}
   if(act==='previous'||act==='next'){const count=currentShape()?.placements.length??0;if(count){placementIndex=(placementIndex+(act==='next'?1:-1)+count)%count;readingIndex=0;highlight();}}
   if(act==='hear'&&currentPlacement())play(currentPlacement().coords.map(m=>m[0]*getState().p+m[1]*getState().g));
   if(act==='collect'&&currentPlacement())onCollect(getState(),currentPlacement().coords,currentReading()?.label??'Chord shape',{exact:true,harmonicSelection:shapeMaterialSelection(getState(),currentShape(),currentPlacement(),currentReading())});
   if(act==='clear-highlight'){selectedId='';identityIndex=-1;onHighlight(null);}
   if(act==='save'){void saveReading(currentShape(),currentPlacement(),currentReading(),result?.targets);return true;}
   if(act==='identity-reading')chooseIdentityReading(Number(el.dataset.index));
   if(act==='save-reading'){const reading=identity?.matches?.length?identityGroups()[Number(el.dataset.index)]?.preferred:null,{shape,placement}=identityPlacement(reading);void saveReading(shape,placement,reading,identity?.targets);return true;}
   if(act==='find-reading'){
    const reading=identityGroups()[Number(el.dataset.index)]?.preferred;if(!reading)return true;
    inputs=[];add(reading.input);universe='selected';void search();return true;
   }
   if(act==='open-harmony'&&identity?.selected){if(!onOpenHarmony(identity.selected.coordinates))throw Error('The harmony directory does not list these pitch classes. Check its size range and JI limits in Discover.');return true;}
   if(act==='clear-identity')clearIdentity();
   if(act==='page-prev')page=Math.max(0,page-1);if(act==='page-next')page++;
   if(act==='reload-saved'){void init();return true;}
   if(act==='delete-saved'){const row=saved.find(r=>r.id===el.dataset.id);if(row)void store.remove('shape',row.id,row.revision).then(init).catch(e=>{savedError=e.message;refresh();});return true;}
   if(act==='load-saved'){const row=saved.find(r=>r.id===el.dataset.id);if(row){add(row.state.source.input);universe='selected';pendingShapeId=row.state.shape.id;void search();}return true;}
   refresh();
  }catch(e){error=e.message;notify(e.message);refresh();}return true;
 }
 function input(el){if(el?.dataset?.shapeDraft===undefined)return false;draft=el.value.slice(0,16000);return true;}
 function change(el){
  const field=el?.dataset?.shapeField;if(!field)return false;
  try{
   if(field==='reading'){readingIndex=Number(el.value);highlight();refresh();return true;}
   if(field==='savedOnly'){savedOnly=!!el.checked;page=0;refresh();return true;}
   if(field==='related'){related=GEOMETRY_FILTERS.some(([value])=>value===el.value)?el.value:'all';page=0;refresh();return true;}
   if(field==='universe')universe=el.value==='directory'?'directory':'selected';
   else if(field==='scaleOnly')constraints=validateChordShapeConstraints({...constraints,scaleOnly:!!el.checked});
   else if(Object.hasOwn(constraints,field)){
    const n=el.value===''&&['rootDegree','rootKey','registerMin','registerMax'].includes(field)?null:Number(el.value);
    if(n!==null&&(!Number.isFinite(n)||(field!=='span'&&!Number.isInteger(n))))throw Error('Choose a valid search limit.');
    constraints=validateChordShapeConstraints({...constraints,[field]:n});
   }else return true;
   invalidate('');refresh();
  }catch(e){error=e.message;refresh();}return true;
 }
 function clearHighlight(){selectedId='';identityIndex=-1;onHighlight(null);}
 return {render,identifyButton,sync,accept,init,click,input,change,search,identify,select,
  model:()=>({inputs:[...inputs],constraints:{...constraints},result,status,error,selectedId,placementIndex,readingIndex,saved,identity,identityStatus,identityError,identityIndex,related,universe}),
  clear:clearHighlight,suspend:clearHighlight,
  serialize:()=>({version:1,inputs:[...inputs],draft,constraints:{...constraints},universe,selectedId,savedOnly,related}),
  restore(value){jobs.cancel();inputs=[];draft='';constraints=chordShapeDefaults();result=null;status='idle';error='';context='';lastPayload=null;selectedId='';pendingShapeId='';universe='selected';savedOnly=false;related='all';page=0;placementIndex=0;readingIndex=0;tuningStamp='';synced=null;
   identity=null;identityStatus='idle';identityError='';identityContext='';identityPayload=null;identityIndex=-1;onHighlight(null);
   if(!value)return;if(value.version!==1){notify('Unsupported shape explorer settings were ignored.');return;}
   const ignored=[];
   for(const input of (Array.isArray(value.inputs)?value.inputs:[]).slice(0,512))try{add(input);}catch(e){ignored.push(e.message);}
   try{constraints=validateChordShapeConstraints(value.constraints??{});}catch(e){ignored.push(e.message);}
   draft=typeof value.draft==='string'?value.draft.slice(0,16000):'';universe=value.universe==='directory'?'directory':'selected';savedOnly=value.savedOnly===true;
   related=GEOMETRY_FILTERS.some(([v])=>v===value.related)?value.related:'all';pendingShapeId=typeof value.selectedId==='string'?value.selectedId:'';
   if(ignored.length)notify('Some saved shape settings were ignored: '+ignored[0]);
  },destroy(){jobs.destroy();}};
}
