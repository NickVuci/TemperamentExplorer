import {createHarmonicCatalogueJobs} from './harmonic-catalogue-jobs.mjs';
import {catalogueContext,getHarmonicEntry,hasInterpretation} from './harmonic-catalogue.mjs';
import {harmonicEntryGeometry,harmonicSelection,sourceShapeVoicing} from './harmonic-selection.mjs';
import {searchShapeOccurrences,occurrenceShape} from '../chords/chord-occurrence.mjs';
import {realizeShape} from '../chords/chord-realization.mjs';
import {chordIdentity} from '../chords/chord-identity.mjs';
import {chordRotations,rotationRootKey} from './harmonic-ji-chords.mjs';
import {bassInversions,chordClasses,inversionName,rootInversions,rootedChordName} from './harmonic-bass.mjs';
import {matchPlayedChord,rowsByShape} from '../chords/played-chord.mjs';
import {assessET} from './harmonic-et.mjs';
import {equivalencePolicy,harmonicIdentity,quotientCoordinate,shapeKey} from './harmonic-equivalence.mjs';
import {mapRatio} from '../core/engine.mjs';
import {mappingContext} from './harmonic-context.mjs';
import {buildDyadIndex} from './harmonic-dyad-graph.mjs';
import {CHORD_SPACE_MAX_SIZE} from './harmonic-chord-space.mjs';
import {projectChord} from '../chords/chord-projection.mjs';
import {targetSet} from '../core/ji-limit-engine.mjs';
import {validateHarmonicSelection} from './harmonic-types.mjs';
import {coordinateCents,mod} from '../core/pitch.mjs';
import {errorColor} from '../core/ji-error-color.mjs';
import {BoundedCache} from '../core/cache.mjs';
import {esc,option} from '../ui/ui.mjs';

const number=value=>Number.isFinite(value)?value.toFixed(3):'—';
const button=(action,label,extra='')=>`<button data-harmony-action="${action}" ${extra}>${label}</button>`;
const select=(field,label,value,choices)=>`<label>${label}<select data-harmony-field="${field}">${choices.map(([v,l])=>option(v,l,value)).join('')}</select></label>`;
const rowLabel=row=>row.preferredLabel??row.targetRatio??`${row.status==='essentially-tempered'?'ET':'Unresolved'} · ${row.shape?.coordinates?.length??row.shape?.coordinateCount??0} voices`;

/** Group existing exact reciprocal identities before paging; never add filtered records. */
export function catalogueListGroups(rows){
 const byIdentity=new Map(rows.filter(row=>row.kind==='ji').flatMap(row=>(row.mergedInterpretationIds??[row.interpretationId]).map(id=>[id,row])));
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

const catalogueCard=(row,selected,shared=false)=>`<button class="harmony-row${shared?' harmony-shared':''}" data-harmony-action="select" data-id="${esc(row.id)}" aria-pressed="${selected===row.id}"><strong>${esc(rowLabel(row))}</strong>${row.kind==='ji'?'':`<span>${row.status==='essentially-tempered'?'Essentially tempered':'Unresolved'}</span>`}</button>`;

export function renderCatalogueList(rows,selected,{page=0,pageSize=rows[0]?.kind==='ji'?12:24}={}){
 const paired=rows[0]?.kind==='ji',groups=catalogueListGroups(rows),start=page*pageSize;
 const cards=groups.slice(start,start+pageSize).map(group=>group.shared?catalogueCard(group.shared,selected,paired):`<div class="harmony-pair">${['otonal','utonal'].map(side=>group[side]?catalogueCard(group[side],selected):'<span aria-hidden="true"></span>').join('')}</div>`).join('');
 return `${paired?'<div class="harmony-pair-headings"><span>Otonal</span><span>Utonal</span></div>':''}<div class="harmony-list${paired?' harmony-list-paired':''}" aria-label="Harmonic catalogue">${cards}</div>${groups.length>pageSize?`<div class="panelactions">${button('previous','Previous',page===0?'disabled':'')}<span>${start+1}–${Math.min(start+pageSize,groups.length)} of ${groups.length}${paired?' chord rows':''}</span>${button('next','Next',start+pageSize>=groups.length?'disabled':'')}</div>`:''}`;
}

const formMatches=(row,filter)=>filter==='all'||(filter==='ji'?row.kind==='ji':filter==='custom'?!!row.custom:directoryForm(row)===filter);
// The exact spelling a row is starred and recalled by; an ET row uses a JI spelling that maps onto its shape.
const rowInput=row=>row.kind==='tempered'?row.spelling:row.interpretation?.identity?.originalInput;
const SIZE_RANGE=Array.from({length:CHORD_SPACE_MAX_SIZE-2},(_,index)=>index+3);
const directorySize=row=>row.interpretation?.identity?.cardinality??row.shape?.coordinates?.length??0;
const directoryForm=row=>row.kind==='tempered'?(row.status==='essentially-tempered'?'et':'unknown'):row.interpretation?.presentationForm==='self'?'ambitonal':['otonal','utonal'].includes(row.interpretation?.presentationForm)?row.interpretation.presentationForm:'other';
// Ambitonal chords read the same otonally and utonally; unoriented exact lookups are listed apart.
const FORM_LABELS={otonal:'Otonal',utonal:'Utonal',ambitonal:'Ambitonal',other:'Other JI',et:'Essentially tempered',unknown:'Unresolved'};
const SIZE_LABELS={2:'Dyads',3:'Triads',4:'Tetrads',5:'Pentads',6:'Hexads'};
const favouriteKeys=new Map();
const favouriteKey=input=>{let key=favouriteKeys.get(input);if(key===undefined){key=chordIdentity(input).fingerprint;if(favouriteKeys.size>=8192)favouriteKeys.clear();favouriteKeys.set(input,key);}return key;};
function validFavourites(values){const seen=new Set();return (Array.isArray(values)?values:[]).slice(0,512).flatMap(r=>{try{if(typeof r?.input!=='string'||r.input.length>300||typeof r?.label!=='string'||r.label.length>300)return [];const key=favouriteKey(r.input);if(seen.has(key))return [];seen.add(key);return [{input:r.input,label:r.label}];}catch{return [];}});}
function loadFavourites(){try{return validFavourites(JSON.parse(globalThis.localStorage?.getItem('temperament-lab-chord-favourites')??'[]'));}catch{return [];}}
// ids lists every exact spelling this entry stands for; a favourite of any of them stars it.
function starControl(input,label,favourites,ids=null){if(!input)return '';const keys=favourites instanceof Set?favourites:new Set(favourites.map(r=>favouriteKey(r.input))),all=ids??[favouriteKey(input)],starred=all.some(id=>keys.has(id));return button('directory-star',starred?'★':'☆',`class="directory-star" data-input="${esc(input)}" data-ids="${esc(all.join(' '))}" data-label="${esc(label)}" aria-pressed="${starred}" aria-label="${starred?'Unstar':'Star'} chord ${esc(label)}" title="${starred?'Remove from':'Add to'} favourites"`);}
function savedChordRow(r,favourites){return `<div class="directory-chord-row">${button('directory-recent',esc(r.label),`class="directory-chord" data-input="${esc(r.input)}"`)}${starControl(r.input,r.label,favourites)}</div>`;}
// Collapsed groups render no chords and open groups show a bounded first page, so a large
// odd limit does not put thousands of rows into the page on every refresh.
export const DIRECTORY_GROUP_PAGE=100;
// Groups start collapsed; openGroups lists the ones the user has opened.
export function renderDirectoryTree(rows,selected,openGroups=new Set(),favourites=[],expandedGroups=new Set()){
 const sizes=[...new Set(rows.map(directorySize))].sort((a,b)=>a-b),starred=new Set(favourites.map(r=>favouriteKey(r.input)));
 return `<div class="directory-tree" aria-label="Chord groups">${sizes.map(size=>{
  const members=rows.filter(row=>directorySize(row)===size),label=SIZE_LABELS[size]??`${size}-note chords`,id='size-'+size,open=openGroups.has(id);
  return `<details class="directory-folder" ${open?'open':''}><summary data-harmony-action="directory-group" data-group="${id}"><span class="directory-folder-icon" aria-hidden="true">▱</span>${label}<small>${members.length}</small></summary>${!open?'':Object.keys(FORM_LABELS).map(form=>{
   const items=members.filter(row=>directoryForm(row)===form),group=id+'-'+form;if(!items.length)return '';
   const groupOpen=openGroups.has(group),shown=!groupOpen?[]:expandedGroups.has(group)?items:items.slice(0,DIRECTORY_GROUP_PAGE);
   return `<details class="directory-family" ${groupOpen?'open':''}><summary data-harmony-action="directory-group" data-group="${group}"><i class="directory-dot ${form}" aria-hidden="true"></i>${FORM_LABELS[form]}<small>${items.length}</small></summary><div class="directory-chords">${shown.map(row=>`<div class="directory-chord-row"><button class="directory-chord" data-harmony-action="select" data-id="${esc(row.id)}" aria-pressed="${selected===row.id}">${esc(rowLabel(row))}</button>${starControl(rowInput(row),rowLabel(row),starred,row.mergedInterpretationIds)}</div>`).join('')}${shown.length&&shown.length<items.length?button('directory-more',`Show all ${items.length}`,`class="directory-more" data-group="${group}"`):''}</div></details>`;
  }).join('')}</details>`;
 }).join('')}</div>`;
}

/** No board dependency: occurrence and voicing are selected lazily. */
export function createHarmonicCatalogueWorkspace({getState,getPlayState=getState,getSettings,refresh=()=>{},notify=()=>{},play=()=>{},onCollect=()=>{},onSendToHexBoard=()=>{},onInspect=()=>{},workerFactory}={}){
 // rotation: which member of the focused chord is its root, shared with the diamond and matrix.
 // followPlaying: chords held on the diamond move the focus; reveal: a row to scroll into view once.
 let rotation=0,followPlaying=true,reveal=null,scope='temperament',query='',page=0,selected='',entry=null,result=null,status='idle',error='',progress=null,stamp='',enabled=false,generation=0;
 let selectedRoot='',inversion=0,style='original',periodShift=0,sourceSelection=null,directInputs=[],pendingRestore=null;
 // bass: the shared "chords on this bass note" filter, {scale:'discover'|'play', degree}; bassChoice: the
 // bass entry last chosen from that list, so the analysis can name its bass.
 let bass=null,bassChoice=null;const degreeMemo={bass:null,root:null};
 let sizeMin=3,sizeMax=6,directoryFormFilter='all',recent=[];const closedGroups=new Set(),openGroups=new Set(),expandedGroups=new Set();let favourites=loadFavourites();
 function saveFavourites(){try{globalThis.localStorage?.setItem('temperament-lab-chord-favourites',JSON.stringify(favourites));}catch{}}
 function remember(row){const input=row?rowInput(row):null;if(!input)return;recent=[{input,label:rowLabel(row)},...recent.filter(r=>r.input!==input)].slice(0,6);}
 const occurrences=new BoundedCache(2048);
 const jobs=createHarmonicCatalogueJobs({workerFactory,onMessage:message=>{if(message.type==='progress'){progress=message.progress;refresh();}}});
 const state=()=>scope.startsWith('play')?getPlayState():getState();
 const tolerance=()=>getSettings(getState()).tol??10;
 function payload(){const s=getState(),ji=getSettings(s);return {state:s,targetSpec:{oddLimit:ji.limit??15,primeFilter:ji.primeLimit??null,mappingSubgroup:s.basis,representationPolicy:s.basis.includes(2)?'octave':'native-exact'},categories:['ji','chords'],
  chordSizes:SIZE_RANGE.filter(size=>size>=sizeMin&&size<=sizeMax),maxRecords:20000,pageSize:50,directInputs};}
 function occurrencesIn(s,row){const geometry=harmonicEntryGeometry(s,row);if(!geometry)return null;
  return {geometry,found:occurrences.get(JSON.stringify([s.basis,s.rows,s.n,s.mode,row.id,geometry.shape]),()=>searchShapeOccurrences(s,geometry.shape))};}
 function scopeOccurrences(row){return occurrencesIn(state(),row)?.found??null;}
 const bassState=()=>bass?.scale==='play'?getPlayState():getState();
 // Display spelling of one JI rotation: a utonal chord's as 1/a:b:c, otonal and ambitonal ones as a:b:c.
 const rotationText=(row,r)=>formOf(row)==='utonal'?'1/'+[...r.dualTerms].reverse().join(':'):r.label;
 // Position in rotations() of the rotation rooted on one geometry member: JI rotations by root ratio,
 // tempered shapes by member.
 function rotationIndexFor(row,geometry,member,octave){
  if(row.kind!=='ji')return member;
  const tone=geometry.tones?.[member];if(!tone)return 0;
  const key=rotationRootKey(tone.n,tone.d,octave);
  return Math.max(0,chordRotations(row.interpretation.identity,octave).findIndex(r=>r.root===key));
 }
 /**
  * Every inversion of the listed chords that can stand on a scale degree as its bass (`by` 'bass') or
  * as its root ('root'), see harmonic-bass.mjs. Each entry is named root - chord (`label`, the chord in
  * its directory spelling) with its role: root position, or the inversion and its rotation's spelling.
  */
 function degreeEntries(rows,value,by='bass'){
  if(!value)return [];
  const s=value.scale==='play'?getPlayState():getState();if(value.degree>=s.n)return [];
  const octave=s.basis.includes(2),key=JSON.stringify([value,s.basis,s.rows,s.n,s.mode,rows.map(row=>row.id)]),memo=degreeMemo[by];
  if(memo?.result===result&&memo.key===key)return memo.entries;
  const entries=[],inversions=by==='root'?rootInversions:bassInversions;
  for(const row of rows){
   let found,list;try{found=occurrencesIn(s,row);if(!found)continue;list=inversions(s,found.geometry.shape.coordinates,found.geometry.tones,found.found,value.degree);}catch{continue;}
   for(const e of list){
    const index=rotationIndexFor(row,found.geometry,e.member,octave),r=row.kind==='ji'?chordRotations(row.interpretation.identity,octave)[index]:null;
    const chord=rowLabel(row),spelling=r?rotationText(row,r):chord;
    entries.push({...e,row,rotation:index,chord,spelling,label:rootedChordName(e.rootDegree,chord),of:chord,
     role:e.rootPosition?'root position':`${inversionName(e.inversion)}${spelling===chord?'':` (${spelling})`}`});
   }
  }
  // Root positions first, then inversions; the directory's own order within each.
  entries.sort((a,b)=>(a.inversion>0)-(b.inversion>0));
  degreeMemo[by]={result,key,entries};return entries;
 }
 const bassEntries=(rows,value=bass)=>degreeEntries(rows,value,'bass');
 // The bass list over the directory's visible rows (size range and type filters applied).
 const directoryRows=()=>filtered().filter(row=>directorySize(row)>=sizeMin&&directorySize(row)<=sizeMax&&formMatches(row,directoryFormFilter));
 const directoryBassEntries=(value=bass)=>value?bassEntries(directoryRows(),value):[];
 // Play's chord-shape menu order within a size: the simpler integer form of the chord or its reciprocal,
 // so 4:5:6 and 1/6:5:4 lead the triads, then the chord's own form (otonal before its utonal dual).
 const menuRanks=new WeakMap(),termSum=text=>text.split(':').reduce((total,term)=>total+Number(term),0);
 function menuRank(row){
  if(!menuRanks.has(row)){
   let rank=[Infinity,Infinity];
   try{const identity=row.interpretation.identity,own=termSum(identity.aliases.otonal),dual=termSum(chordIdentity(identity.aliases.reciprocal).aliases.otonal);rank=[Math.min(own,dual),own];}catch{}
   menuRanks.set(row,rank);
  }
  return menuRanks.get(row);
 }
 // Opens a bass entry in the analysis on its inversion, remembering its bass.
 function chooseBassEntry(pick,value=bass){
  // The voicing's bass (realization variant ids are bass member indices) follows the chosen inversion.
  entry=pick.row;selected=pick.row.id;inversion=pick.member;sourceSelection=null;rotation=pick.rotation;remember(entry);
  bassChoice={rowId:pick.row.id,member:pick.member,inversion:pick.inversion,rootDegree:pick.rootDegree,...value};
  // The analysis shows this occurrence when its scale filter reads the same scale as the bass.
  selectedRoot=(value.scale==='play')===scope.startsWith('play')?pick.occurrenceId:'';
 }
 function setBass(value){
  const next=value&&['discover','play'].includes(value.scale)&&Number.isInteger(value.degree)&&value.degree>=0?{scale:value.scale,degree:value.degree}:null;
  const s=next?(next.scale==='play'?getPlayState():getState()):null;
  bass=next&&next.degree<s.n?next:null;degreeMemo.bass=null;bassChoice=null;
  return bass;
 }
 const bassWhere=()=>`${bass.scale==='play'?'Play':'Discover'} scale degree ${bass.degree}`;
 function renderBassList(entries){
  if(!entries.length)return `<p class="harmony-empty">No listed chord can have its bass on ${esc(bassWhere())}. Try another degree or widen the filters.</p>`;
  const sizes=[...new Set(entries.map(e=>e.classCount))].sort((a,b)=>a-b);
  return `<p class="bass-summary">${entries.length} chord${entries.length===1?'':'s'} with ${esc(bassWhere())} as the bass</p><div class="directory-tree bass-list" aria-label="Chords on this bass">${sizes.map(size=>{
   const items=entries.filter(e=>e.classCount===size),group='bass-'+size,shown=expandedGroups.has(group)?items:items.slice(0,DIRECTORY_GROUP_PAGE);
   return `<section class="bass-group"><h5>${SIZE_LABELS[size]??`${size}-note chords`} <small>${items.length}</small></h5><div class="directory-chords">${shown.map(e=>`<div class="directory-chord-row">${button('bass-select',`<span>${esc(e.label)}</span><small>${esc(e.role)}</small>`,`class="directory-chord bass-chord" data-id="${esc(e.row.id)}" data-member="${e.member}" aria-pressed="${selected===e.row.id&&bassChoice?.member===e.member}"`)}</div>`).join('')}${shown.length<items.length?button('directory-more',`Show all ${items.length}`,`class="directory-more" data-group="${group}"`):''}</div></section>`;
  }).join('')}</div>`;
 }
 async function run({force=false,direct=null}={}){
  if(!enabled)return;
  const current=++generation,previous=entry,previousRoot=selectedRoot;error='';status='loading';progress=null;sourceSelection=null;
  result=null;entry=null;
  try{
   if(direct)directInputs=[direct];const input=payload();stamp=catalogueContext(input).id;
   const job=jobs.run('query',input);
   refresh();const terminal=await job.promise;if(current!==generation||!enabled)return;
   if(terminal.status==='cancelled'){status='cancelled';refresh();return;}
   if(terminal.type==='error')throw Error(terminal.message);
   result=terminal.result;status=result.status;
   entry=result.items.find(row=>row.id===selected)??(previous?.kind==='ji'?result.items.find(row=>hasInterpretation(row,previous.interpretationId)):null)??null;
   selectedRoot=entry&&scopeOccurrences(entry)?.completeOccurrences.some(row=>row.id===previousRoot)?previousRoot:'';
   selected=entry?.id??'';page=0;
   applyRestore();
  }catch(e){if(current!==generation)return;error=e.message;status='error';}
  refresh();
 }
 function applyRestore(){if(!pendingRestore)return;const data=pendingRestore;pendingRestore=null;
  if(data.selection?.mappingId!==mappingContext(state()).id)return;
  const restored=result?.items.find(row=>row.id===data.selected)??result?.items.find(row=>hasInterpretation(row,data.selectedInterpretation));
  if(restored){entry=restored;selected=restored.id;selectedRoot=scopeOccurrences(restored)?.completeOccurrences.some(row=>row.id===data.selectedRoot)?data.selectedRoot:'';}
  else if(data.selection?.shape&&data.selection?.voicing){sourceSelection=data.selection;entry={id:'source:'+data.selection.voicing.id,kind:'source',shape:data.selection.shape,preferredLabel:data.selection.label};selected=entry.id;selectedRoot='';}
 }
 function sync(){if(!enabled)return;try{const next=catalogueContext(payload()).id;if(next!==stamp){occurrences.entries.clear();void run();}}catch(e){error=e.message;status='error';}}
 // Whole-temperament filtering depends only on the result and text filters, so one refresh's
 // several readers share it; scale scopes also depend on the live scale and are not memoized.
 let filterMemo=null;
 function filtered(){
  if(scope==='temperament'&&filterMemo?.result===result&&filterMemo.query===query)return filterMemo.rows;
  const rows=filterRows();if(scope==='temperament')filterMemo={result,query,rows};return rows;
 }
 function filterRows(){const needle=query.trim().toLowerCase();return (result?.items??[]).filter(row=>{
  if(row.kind!=='ji'&&row.kind!=='tempered')return false;
  if(row.kind==='ji'&&(row.mappingStatus!=='mapped'||!row.dyads.dyadic)&&!row.custom)return false;
  if(needle&&!([rowLabel(row),...(row.aliases??[])].some(text=>String(text).toLowerCase().includes(needle))))return false;
  if(scope!=='temperament'){const found=scopeOccurrences(row);if(!found||!(scope.endsWith('tonic')?found.tonicMemberOccurrences.length:found.anywhereCount))return false;}
  return true;
 }).sort((a,b)=>{
  if(a.kind==='ji'&&b.kind==='ji')return Math.abs(a.interpretation.identity.inputCardinality-3)-Math.abs(b.interpretation.identity.inputCardinality-3)||((a.tuning?.pairwiseMaxErrorCents??Infinity)-(b.tuning?.pairwiseMaxErrorCents??Infinity))||rowLabel(a).localeCompare(rowLabel(b));
  if(a.kind!==b.kind)return a.kind==='ji'?-1:1;
  return rowLabel(a).localeCompare(rowLabel(b));
 });}
 function detailModel(){if(!entry)return {entry};
  const s=state(),geometry=harmonicEntryGeometry(s,entry);if(!geometry)return {entry,geometry:null};
  const found=scopeOccurrences(entry),root=found.completeOccurrences.find(row=>row.id===selectedRoot),voice=root?realizeShape(s,geometry.shape,root,{inversion,style,periodShift},{tones:geometry.tones,tolerance:tolerance()}):null;
  return {entry,geometry,occurrences:found,root,voice,state:s};}
 function currentSelection(){if(sourceSelection)return sourceSelection;const m=detailModel();if(!m.geometry)return null;return harmonicSelection(m.state,entry,{voicing:m.voice??sourceShapeVoicing(m.state,rotatedShape(m))});}
 // Without a chosen voicing the selection sounds the focused rotation: its first note in the bass,
 // every other member within the octave above it.
 function rotatedShape(m){
  const s=m.state,shape=m.geometry.shape,k=rotations(m)[rotation]?.index??0,octave=s.basis.includes(2)?mapRatio(2,1,s):null;
  if(!k||!octave)return shape;
  const base=coordinateCents(s,shape.coordinates[k]),span=coordinateCents(s,octave);
  return {...shape,coordinates:shape.coordinates.map(point=>{const lift=Math.floor((coordinateCents(s,point)-base)/span+1e-9);return lift?[point[0]-lift*octave[0],point[1]-lift*octave[1]]:[...point];})};
 }
 // Each pair of members: its tempered interval and every JI interval of the target set mapped to it.
 function dyadIndex(s){const ji=getSettings(getState());return buildDyadIndex(targetSet({oddLimit:ji.limit??15,primeFilter:ji.primeLimit??null,mappingSubgroup:s.basis,representationPolicy:s.basis.includes(2)?'octave':'native-exact'}),mappingContext(s));}
 function chordIntervalMatrix(m){
  const s=m.state,coords=m.geometry.shape.coordinates,tones=m.geometry.tones,cfg=getSettings(getState());
  let index;try{index=dyadIndex(s);}catch{return '';}
  const octave=s.basis.includes(2),octaveCoord=octave?mapRatio(2,1,s):null,span=octaveCoord?coordinateCents(s,octaveCoord):null;
  const wrap=c=>span>0?((c%span)+span)%span:c,idealWrap=c=>octave?((c%1200)+1200)%1200:c;
  const labels=coords.map((_,i)=>tones?.[i]?.label??`Tone ${i+1}`),activeRow=rotations(m)[rotation]?.index??0;
  const rows=coords.map((from,i)=>{
   const ordered=coords.map((to,j)=>({to,j,c:wrap(coordinateCents(s,to.map((v,k)=>v-from[k])))})).sort((a,b)=>a.j===i?-1:b.j===i?1:a.c-b.c||a.j-b.j);
   return `<tr data-chord-row="${i}" aria-label="Intervals from ${esc(labels[i])}"${i===activeRow?' class="is-active-rotation" aria-current="true"':''}>${ordered.map(({to,j})=>{
   if(i===j)return '<td><span class="cell ratio-cell chord-matrix-unison" style="background:#fff;color:#11151c" title="Unison · 0.000 cents">1/1</span></td>';
   const delta=to.map((v,k)=>v-from[k]),readings=index.byClassKey[quotientCoordinate(index.policy,delta).key]??[],cents=wrap(coordinateCents(s,delta)),used=tones?idealWrap(tones[j].c-tones[i].c):null;
   const values=readings.map(item=>{const diff=used==null?null:idealWrap(item.idealCents)-used;return {...item,error:coordinateCents(s,item.coordinate)-item.idealCents,used:diff!=null&&(Math.abs(diff)<1e-6||octave&&Math.abs(Math.abs(diff)-1200)<1e-6)};});
   const first=values.find(item=>item.used)??values[0],title=`${number(cents)} cents${values.map(item=>` · ${item.ratio}: ${item.error>=0?'+':''}${number(item.error)} cents`).join('')}`,color=first?errorColor(first.error,cfg.maxError??cfg.tol??10):'#1c2531';
   return `<td><span class="cell ratio-cell" style="background:${color}${first?';color:#11151c':''}" title="${esc(title)}" aria-label="${esc(labels[i])} to ${esc(labels[j])}: ${esc(title)}"><span class="target-cell-content">${first?`<span class="target-chip dyad-reading${first.used?' dyad-used':''}">${esc(first.ratio)}</span>${values.length>1?`<small class="target-more">+${values.length-1}</small>`:''}`:'—'}</span></span></td>`;
  }).join('')}</tr>`;}).join('');
  return `<div class="tablewrap chord-matrix-wrap"><table class="matrix chord-interval-matrix" aria-label="Chord interval matrix" style="--matrix-columns:${coords.length}"><tbody>${rows}</tbody></table></div>`;
 }
 function chordLineDiagram(m){
  const coords=m.geometry.shape.coordinates,tones=m.geometry.tones,current=rotations(m)[rotation],root=current?.index??0,base=coordinateCents(m.state,coords[root]),idealBase=tones?.[root]?.c??0;
  const octave=m.state.basis.includes(2)?mapRatio(2,1,m.state):null,span=entry.kind==='tempered'?m.state.p:octave?coordinateCents(m.state,octave):null;
  const notes=coords.map((point,i)=>({label:`Tone ${i+1}`,actual:span>0?mod(coordinateCents(m.state,point)-base,span):coordinateCents(m.state,point)-base,ideal:tones?.[i]?.c==null?null:octave?mod(tones[i].c-idealBase,1200):tones[i].c-idealBase}));
  if(current?.ratios)[...notes].sort((a,b)=>a.ideal-b.ideal).forEach((note,i)=>{note.label=current.ratios[i]??note.label;});
  notes.sort((a,b)=>a.actual-b.actual);
  const values=notes.flatMap(n=>n.ideal==null?[n.actual]:[n.actual,n.ideal]),lo=Math.min(0,...values),hi=Math.max(1,...values),width=Math.max(400,notes.length*90),x=c=>36+(c-lo)/(hi-lo)*(width-72),hasIdeal=notes.every(n=>n.ideal!=null);
  // Stagger labels only where neighbouring ticks are close; the pitch positions remain exact.
  const lanes=field=>{const ends=[],lanes=[];notes.map((n,i)=>({i,x:x(n[field])})).sort((a,b)=>a.x-b.x).forEach(n=>{let lane=ends.findIndex(end=>end<n.x-30);if(lane<0)lane=ends.length;ends[lane]=n.x+30;lanes[n.i]=lane;});return lanes;};
  const actualLanes=lanes('actual'),idealLanes=hasIdeal?lanes('ideal'):[],top=hasIdeal?38+Math.max(...idealLanes)*16:16,railY=top+26,height=railY+58+Math.max(...actualLanes)*16;
  return `<div class="chord-line-diagram"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Chord tones: JI ticks above and tempered ticks below one pitch line">${hasIdeal?'<text x="8" y="14" class="chord-line-heading">JI</text>':''}<text x="8" y="${height-4}" class="chord-line-heading">Tempered</text><line x1="36" x2="${width-36}" y1="${railY}" y2="${railY}" class="chord-line-rail"/>${notes.map((n,i)=>`<g><title>${esc(n.label)} · tempered ${number(n.actual)} cents${hasIdeal?` · JI ${number(n.ideal)} cents`:''}</title><line x1="${x(n.actual)}" x2="${x(n.actual)}" y1="${railY}" y2="${railY+14}" class="chord-line-tempered"/><text x="${x(n.actual)}" y="${railY+30+actualLanes[i]*16}" text-anchor="middle">${n.actual.toFixed(1)}¢</text>${hasIdeal?`<line x1="${x(n.ideal)}" x2="${x(n.ideal)}" y1="${railY-14}" y2="${railY}" class="chord-line-ideal"/><text x="${x(n.ideal)}" y="${railY-22-idealLanes[i]*16}" text-anchor="middle">${n.ideal.toFixed(1)}¢</text>`:''}</g>`).join('')}</svg></div>`;
 }
 function otherReadings(){const ids=(result?.shapeGroups?.[entry.shapeId]??[]).filter(id=>id!==entry.id),rows=ids.map(id=>result.items.find(row=>row.id===id)).filter(row=>row?.kind==='ji'&&row.mappingStatus==='mapped'&&row.dyads?.dyadic);
  return rows.length?`<p>Other JI chords on this shape: ${rows.map(row=>button('select',esc(rowLabel(row)),`data-id="${esc(row.id)}"`)).join(' ')}</p>`:'';}
 const formOf=row=>row?.kind==='tempered'?(row.status==='essentially-tempered'?'et':'unknown'):row?.interpretation?.presentationForm==='self'?'ambitonal':['otonal','utonal'].includes(row?.interpretation?.presentationForm)?row.interpretation.presentationForm:'other';
 // Rotations in member order: rotation k is the chord rooted on member k.
 const rotationCache=new BoundedCache(32);
 function rotations(m){
  if(!entry||!m.geometry)return [];
  const s=m.state,octave=s.basis.includes(2);
  return rotationCache.get(JSON.stringify([entry.id,entry.targetSetId,s.basis,s.rows]),()=>{
   // Rotations are written in the chord's form: a utonal chord's as 1/a:b:c, otonal and ambitonal ones as a:b:c.
   if(entry.kind==='ji'){const utonalChord=formOf(entry)==='utonal';
    return chordRotations(entry.interpretation.identity,octave).map(r=>{const utonal='1/'+[...r.dualTerms].reverse().join(':');
     return {index:r.index,root:r.root,label:r.label,ratios:r.ratios,utonal,display:utonalChord?utonal:r.label};});}
   let index;try{index=dyadIndex(s);}catch{return [];}
   const coords=m.geometry.shape.coordinates,simplest=items=>[...items].sort((a,b)=>a.ratio.split('/').reduce((p,v)=>p*Number(v),1)-b.ratio.split('/').reduce((p,v)=>p*Number(v),1))[0];
   return coords.map((root,k)=>{const members=coords.map((point,i)=>{if(i===k)return {ratio:'1/1',cents:0};const item=simplest(index.byClassKey[quotientCoordinate(index.policy,[point[0]-root[0],point[1]-root[1]]).key]??[]);return item?{ratio:item.ratio,cents:item.idealCents}:{ratio:'?',cents:0};}).sort((a,b)=>a.cents-b.cents);
    return {index:k,label:members.map(member=>member.ratio).join(' · ')};});
  });
 }
 function focusOccurrence(m){const found=m.occurrences;if(!found)return null;return found.completeOccurrences.find(row=>row.id===selectedRoot)??found.tonicMemberOccurrences?.[0]??found.completeOccurrences[0]??null;}
 /** The focused chord as the diamond and matrix show it: form, chosen rotation and scale occurrence. */
 function focus(){
  if(!entry||!['ji','tempered'].includes(entry.kind))return null;
  const m=detailModel();if(!m.geometry)return null;
  const s=m.state,list=rotations(m),current=list[rotation]??list[0],coords=m.geometry.shape.coordinates,root=coords[current?.index??0]??coords[0];
  const policy=equivalencePolicy(s,s.basis.includes(2)?'octave':'exact');
  return {id:entry.id,kind:entry.kind,form:formOf(entry),label:rowLabel(entry),rotation:current?.index??0,
   ratios:entry.kind==='ji'?current?.ratios??[]:null,
   classKeys:entry.kind==='tempered'?coords.map(point=>quotientCoordinate(policy,[point[0]-root[0],point[1]-root[1]]).key):null,
   degrees:scope.startsWith('play')?null:focusOccurrence(m)?.degrees??null};
 }
 // Audition every rotation at the central tonic, in the same register. Raw mapping
 // representatives can be several octaves below it and must not set the preview bass.
 function playRotation(m,k){
  const s=m.state,coords=m.geometry.shape.coordinates,cents=coords.map(point=>coordinateCents(s,point)),base=cents[k];
  const octave=s.basis.includes(2)?mapRatio(2,1,s):null,span=octave?coordinateCents(s,octave):null;
  play(cents.map(c=>span>0?mod(c-base,span):c-Math.min(...cents)).sort((a,b)=>a-b));
 }
 const commaCache=new BoundedCache(32);
 function etCommas(){
  if(entry?.kind!=='tempered'||entry.status!=='essentially-tempered')return [];
  return commaCache.get(JSON.stringify([entry.id,entry.targetSetId]),()=>{try{const result=assessET(entry.shape,dyadIndex(getState()));return [...new Set((result.obstruction?.representativeCycles??[]).map(cycle=>cycle.commaRatio))];}catch{return [];}});
 }
 function spellings(m){
  if(entry?.kind!=='ji')return '';
  const identity=entry.interpretation.identity,current=rotations(m)[rotation];
  const fallback=current?null:chordRotations(identity,getState().basis.includes(2))[0];
  const otonal=current?.label??fallback.label,utonal=current?.utonal??'1/'+[...fallback.dualTerms].reverse().join(':');
  const others=(entry.aliases??[]).filter(alias=>alias!==rowLabel(entry));
  return `<p class="harmony-forms">Otonal <b>${esc(otonal)}</b> · Utonal <b>${esc(utonal)}</b></p>
   ${others.length?`<details class="harmony-aliases"><summary>Also written as (${others.length})</summary><p>${others.map(esc).join(' · ')}</p></details>`:''}`;
 }
 // The selected rotation, beneath the directory chord it belongs to, named as an inversion of that
 // chord (its directory spelling is root position), written root - chord when a placement on the scale
 // fixes its root (the bass-list choice, or the chosen occurrence), and with its bass from the bass list.
 function rotationMember(m,current){
  if(entry.kind!=='ji')return current.index;
  const octave=m.state.basis.includes(2);
  return m.geometry.tones?.findIndex(t=>rotationRootKey(t.n,t.d,octave)===current.root)??-1;
 }
 function currentRotation(m){
  const list=rotations(m);if(list.length<2)return '';
  const current=list[rotation]??list[0];let role='';
  try{
   const member=rotationMember(m,current),classes=member>=0?chordClasses(m.state,m.geometry.shape.coordinates,entry.kind==='ji'?m.geometry.tones:null).classes:[];
   const k=classes.findIndex(c=>c.member===member),chosen=bassChoice?.rowId===entry.id&&bassChoice.member===member;
   const root=chosen?bassChoice.rootDegree:m.root?.root,chord=esc(rootedChordName(root,rowLabel(entry)));
   if(k>=0)role=k===0?` · root position${root==null?'':` of ${chord}`}`:` · ${inversionName(k)} of ${chord}`;
   if(chosen)role+=` · bass on ${bassChoice.scale==='play'?'Play':'Discover'} scale degree ${bassChoice.degree}`;
  }catch{}
  return `<p class="harmony-current-rotation" aria-live="polite">Rotation <b>${esc(current.display??current.label)}</b>${role}</p>`;
 }
 function rotationButtons(m){
  const list=rotations(m);if(list.length<2)return '';
  return `<h5>Rotations</h5><div class="harmony-rotations" role="group" aria-label="Rotations">${list.map(r=>button('rotation',esc(r.display??r.label),`data-index="${r.index}" aria-pressed="${(list[rotation]?.index??0)===r.index}"`)).join('')}</div>`;
 }
 // A JI chord is found by its family (rotations and doublings merge); a tempered chord by its shape,
 // preferring a JI row that maps onto it.
 function rowFor({ratios,coordinates}){
  const s=getState(),octave=s.basis.includes(2),items=result?.items??[];
  if(ratios?.length>=2){try{const familyId=harmonicIdentity(chordIdentity(ratios.join(':')),octave?'octave':'exact').familyId,row=items.find(item=>item.kind==='ji'&&item.familyId===familyId);if(row)return row;}catch{}}
  if(coordinates?.length>=2){try{const id=shapeKey(equivalencePolicy(s,octave?'octave':'exact'),coordinates),rows=items.filter(item=>item.shapeId===id&&(item.kind==='tempered'||item.mappingStatus==='mapped'&&item.dyads?.dyadic));return rows.find(item=>item.kind==='ji')??rows[0]??null;}catch{}}
  return null;
 }
 // Make the row visible in the directory: its size in range, its type shown, its groups open.
 function revealRow(row){
  const size=directorySize(row),form=directoryForm(row),group=`size-${size}-${form}`;
  if(size>=SIZE_RANGE[0]){sizeMin=Math.min(sizeMin,size);sizeMax=Math.max(sizeMax,size);}
  if(!formMatches(row,directoryFormFilter))directoryFormFilter='all';
  if(query&&![rowLabel(row),...(row.aliases??[])].some(text=>String(text).toLowerCase().includes(query.trim().toLowerCase())))query='';
  openGroups.add(`size-${size}`);openGroups.add(group);
  const members=filtered().filter(item=>directorySize(item)===size&&directoryForm(item)===form);
  if(members.findIndex(item=>item.id===row.id)>=DIRECTORY_GROUP_PAGE)expandedGroups.add(group);
  reveal=row.id;
 }
 // Played notes read against this directory: its rows by shape are built once per result.
 let playedRows=null;
 function matchPlayed(coordinates){
  const s=getState();if(!result||result.mappingId!==mappingContext(s).id)return null;
  if(playedRows?.result!==result)playedRows={result,byShape:rowsByShape(result.items),matches:new BoundedCache(64)};
  let index;try{index=dyadIndex(s);}catch{return null;}
  try{return playedRows.matches.get(JSON.stringify([index.targetSetId,coordinates]),()=>matchPlayedChord({state:s,coordinates,index,byShape:playedRows.byShape,geometry:row=>{const g=harmonicEntryGeometry(s,row);return g&&{coordinates:g.shape.coordinates,tones:g.tones};}}));}catch{return null;}
 }
 /** Focus a chord chosen in another view: ratios (JI, relative to its lowest note) and/or tempered coordinates. */
 function focusExternal({ratios=null,coordinates=null}={}){
  if(!result||result.mappingId!==mappingContext(getState()).id)return false;
  const row=rowFor({ratios,coordinates});if(!row)return false;
  const changed=row.id!==entry?.id;
  if(changed){entry=row;selected=row.id;selectedRoot='';inversion=0;sourceSelection=null;remember(row);}
  const m=detailModel(),list=rotations(m);let next=-1;
  if(ratios?.length){const want=[...ratios].sort().join(':');next=list.findIndex(r=>r.ratios&&[...r.ratios].sort().join(':')===want);}
  // A tempered match has no exact ratio rotation. Match its classes relative to the played bass,
  // including when a different JI spelling shares the shape; transposition and doublings do not matter.
  if(next<0&&coordinates?.length&&m.geometry){try{
   const s=m.state,policy=equivalencePolicy(s,s.basis.includes(2)?'octave':'exact');
   const relativeKeys=(points,root)=>[...new Set(points.map(point=>quotientCoordinate(policy,[point[0]-root[0],point[1]-root[1]]).key))].sort().join('|');
   const bass=coordinates.reduce((lowest,point)=>coordinateCents(s,point)<coordinateCents(s,lowest)?point:lowest),want=relativeKeys(coordinates,bass),points=m.geometry.shape.coordinates;
   next=list.findIndex(current=>{const member=rotationMember(m,current);return member>=0&&relativeKeys(points,points[member])===want;});
  }catch{}}
  if(next<0)next=0;
  if(!changed&&next===rotation)return true;
  rotation=next;revealRow(row);refresh();return true;
 }
 function details(){if(!entry)return `<p class="harmony-empty">Select a harmony, or select or play a chord on the diamond or matrix, to inspect it.</p><label class="checklabel harmony-follow"><input type="checkbox" data-harmony-field="follow" ${followPlaying?'checked':''}> Follow what I play</label>`;
  const m=detailModel(),geometry=m.geometry;
  const followSwitch=`<label class="checklabel harmony-follow"><input type="checkbox" data-harmony-field="follow" ${followPlaying?'checked':''}> Follow what I play</label>`;
  const form=formOf(entry),commas=etCommas();
  const etContext=form==='et'?`<p class="harmony-et-context">ET is relative to the selected JI limits (odd limit ${esc(getSettings(getState()).limit??15)}): every pair has an allowed reading, but no single JI chord realizes them all within those limits. The displayed ratios label tempered intervals from the bass; inversions refer to the tempered chord.</p>`:'';
  return `${followSwitch}<h4>${esc(rowLabel(entry))}${['ji','tempered'].includes(entry.kind)?` <span class="form-badge ${form}">${FORM_LABELS[form]}</span>`:''}</h4>${currentRotation(m)}${etContext}${geometry?`${chordLineDiagram(m)}${rotationButtons(m)}${chordIntervalMatrix(m)}`:''}${spellings(m)}${entry.kind==='ji'||geometry?`<div class="panelactions">${entry.kind==='ji'?button('dual','Open reciprocal chord'):''}${geometry?`${button('hear',m.voice?'Hear voicing':'Hear mapped notes')}${button('collect','Add to collection',occurrenceShape(m.state,geometry.shape).members.length<2?'disabled':'')}${button('send','Send to Play')}`:''}</div>`:''}
   ${entry.kind==='source'?'<p>Source sounding coordinates and voices are preserved.</p>':''}
   ${entry.kind==='ji'?otherReadings():''}
   ${!geometry?`<p>Outside the mapping subgroup · missing primes ${entry.missingPrimes?.join(', ')??'unknown'}. No sounding coordinates are available.</p>`:`
    ${commas.length?`<p>Commas joining these intervals: ${commas.map(esc).join(', ')}</p>`:''}
    ${m.occurrences.completeOccurrences.length?`<label>Occurrence<select data-harmony-field="root"><option value="">Choose a root for voicing</option>${m.occurrences.completeOccurrences.map(root=>option(root.id,`${rootedChordName(root.root,rowLabel(entry))}${root.tonicAnchored?' · tonic':''}`,selectedRoot)).join('')}</select></label>`:`<p>Mapped harmony is absent from this scale. Generator span ${m.occurrences.generatorSpan}; at least ${m.occurrences.minimumChainSize} consecutive generator positions are needed.</p>`}
    ${m.voice?`<div class="harmony-controls">${select('inversion','Bass / inversion',inversion,m.voice.variants.map(v=>[v.id,v.label]))}${select('style','Spacing',style,[['original','Original spelling'],['compact','Compact'],['open','Open']])}<label>Shift · periods<input type="number" data-harmony-field="periodShift" min="-8" max="8" value="${periodShift}"></label></div><p>${m.voice.voices.length} voices · ${esc(m.voice.reference.label)} · ${m.voice.ratios?.map(esc).join(' : ')??'Coordinate-only voicing'}${m.voice.maxErrorCents==null?'':` · worst voiced pair ${number(m.voice.maxErrorCents)}¢`}</p>`:''}
`}`;
 }
 // The browse controls, status and list form the harmony directory; the selected harmony's
 // analysis is a separate part so a layout can place the two apart over one shared state.
 function renderParts({directory=false}={}){sync();const rows=filtered();page=Math.min(page,Math.max(0,Math.ceil(catalogueListGroups(rows).length/12)-1));
  const parts={controls:`<div class="harmony-controls">${select('scope','Scale membership',scope,[['temperament','Whole temperament'],['discover','Discover scale · anywhere'],['discover-tonic','Discover scale · tonic'],['play','Play scale · anywhere'],['play-tonic','Play scale · tonic']])}<label>Search or exact ratio chord<input type="search" data-harmony-field="search" maxlength="300" value="${esc(query)}" placeholder="4:5:6, 5:6:8 or 1/6:5:4"></label>${button('lookup','Look up chord')}</div>
   <div class="harmony-status" role="status" aria-live="polite">${status==='loading'?`Listing chords · ${progress?.count??0} records`:status==='cancelled'?'Listing cancelled. Any retained list is from the last completed result.':status==='incomplete'?`Partial list · ${rows.length} chords. A search bound was reached, so some chords are not listed.`:`${rows.length} chords${result?.complete?' · complete':''}`}</div>
   ${error?`<p role="alert">${esc(error)}</p>`:''}`,
   list:`${rows.length?renderCatalogueList(rows,selected,{page}):status==='loading'?'<p>Loading harmony…</p>':'<p class="harmony-empty">No matching chords. Adjust the limits or scale filter, or look up an exact chord.</p>'}`,
   detail:details(),
   info:`   <details class="harmony-search-info"><summary>Search scope and bounds</summary><p>Catalogue identities are independent of the selected scale and board. Tolerance changes tuning quality, not mapping. Every chord in the chosen size range whose intervals all lie in the odd limit is listed: JI when some JI chord maps onto it, essentially tempered otherwise. Exact lookups can inspect chords outside these limits.</p><p>Catalogue bound: 20000 records. Approximation generator bound: ±32. Mapping previews preserve the current columns. ${result?.recordCap?'Record cap reached.':''}</p>${result?`<pre>${esc(JSON.stringify(result.sources.map(s=>({kind:s.kind,complete:s.complete,reason:s.reason??null,bounds:s.bounds??s.result?.bounds??null})),null,2))}</pre>`:''}</details>
   <details><summary>Inspect selected notes</summary>${button('inspect','Open manual note inspector')}</details>`};
  if(directory){
   const baseRows=rows,inRange=row=>directorySize(row)>=sizeMin&&directorySize(row)<=sizeMax,visible=rows.filter(row=>inRange(row)&&formMatches(row,directoryFormFilter));
   const sizeChoices=SIZE_RANGE.map(size=>[size,size]),quick=`<div class="directory-size-range" role="group" aria-label="Chord size"><span>Notes</span>${select('sizeMin','<span class="sr-only">Fewest notes</span>',sizeMin,sizeChoices)}<span>to</span>${select('sizeMax','<span class="sr-only">Most notes</span>',sizeMax,sizeChoices)}</div>`;
   const formChips=`<div class="directory-form-filters" role="group" aria-label="Chord type">${[['all','All'],['ji','JI'],['otonal','Otonal'],['utonal','Utonal'],['ambitonal','Ambitonal'],['et','ET'],['custom','Custom']].map(([id,label])=>button('directory-form',`${['all','ji','custom'].includes(id)?'':`<i class="directory-dot ${id}" aria-hidden="true"></i>`}${label} <small>${baseRows.filter(row=>inRange(row)&&formMatches(row,id)).length}</small>`,`data-value="${id}" aria-pressed="${directoryFormFilter===id}"`)).join('')}</div>`;
   parts.controls=`${quick}<div class="directory-search"><label><span class="sr-only">Search chords or enter an exact ratio</span><input type="search" data-harmony-field="search" maxlength="300" value="${esc(query)}" placeholder="Search chords or enter 4:5:6…"></label>${button('lookup','↵','title="Look up exact ratio chord" aria-label="Look up exact ratio chord"')}</div><div class="directory-filter-heading"><span>Quick filters</span>${button('directory-clear','Clear')}</div><div class="directory-quick-filters">${select('scope','Scale membership',scope,[['temperament','Whole temperament'],['discover','Discover scale · anywhere'],['discover-tonic','Discover scale · tonic'],['play','Play scale · anywhere'],['play-tonic','Play scale · tonic']])}${select('bass','Bass note',bass?`${bass.scale}:${bass.degree}`:'',[['','Any'],...Array.from({length:getState().n},(_,i)=>[`discover:${i}`,`Discover scale · degree ${i}`]),...Array.from({length:getPlayState().n},(_,i)=>[`play:${i}`,`Play scale · degree ${i}`])])}</div>${formChips}`+parts.controls.slice(parts.controls.indexOf('</div>')+6);
   parts.list=bass&&visible.length?renderBassList(directoryBassEntries()):visible.length?renderDirectoryTree(visible,selected,openGroups,favourites,expandedGroups):status==='loading'?'<p class="harmony-empty">Loading harmony…</p>':'<p class="harmony-empty">No chords match these filters.</p>';
   parts.info=`<details class="directory-recent" aria-label="Recent chords" ${closedGroups.has('recent')?'':'open'}><summary data-harmony-action="directory-group" data-group="recent">Recent</summary>${recent.length?recent.map(r=>savedChordRow(r,favourites)).join(''):'<p>Select a chord to keep it here.</p>'}</details><details class="directory-favourites" aria-label="Favourite chords" ${closedGroups.has('favourites')?'':'open'}><summary data-harmony-action="directory-group" data-group="favourites">Favourites</summary>${favourites.length?favourites.map(r=>savedChordRow(r,favourites)).join(''):'<p>Star a chord to keep it here.</p>'}</details>`+parts.info;
  }
  return parts;

 } function render(){const parts=renderParts();
  return `<section class="harmony-workspace" aria-label="Harmonic discovery">
   ${parts.controls}<div class="harmony-columns"><div>${parts.list}</div><article class="harmony-detail" aria-label="Selected harmony">${parts.detail}</article></div>
   ${parts.info}</section>`;
 }
 function change(el){const name=el?.dataset?.harmonyField;if(!name)return false;
  if(name==='search'&&query===el.value)return true;
  try{if(name==='search'){query=String(el.value).slice(0,300);page=0;}else if(name==='scope'){if(!['temperament','discover','discover-tonic','play','play-tonic'].includes(el.value))return true;scope=el.value;selectedRoot='';sourceSelection=null;}
   else if(name==='follow'){followPlaying=!!el.checked;}
   else if(name==='bass'){const [scale,degree]=String(el.value).split(':');setBass(scale?{scale,degree:Number(degree)}:null);}
   else if(name==='sizeMin'||name==='sizeMax'){const value=Number(el.value);if(!SIZE_RANGE.includes(value))return true;if(name==='sizeMin'){sizeMin=value;sizeMax=Math.max(sizeMax,value);}else{sizeMax=value;sizeMin=Math.min(sizeMin,value);}}
   else if(name==='root'){selectedRoot=el.value;inversion=0;sourceSelection=null;}
   else if(name==='inversion')inversion=Number(el.value);else if(name==='style')style=el.value;else if(name==='periodShift')periodShift=Math.max(-8,Math.min(8,Math.round(Number(el.value)||0)));
   refresh();}catch(e){notify(e.message);}return true;
 }
 function choose(found,selection=null){const size=Math.max(SIZE_RANGE[0],directorySize(found));sizeMin=Math.min(sizeMin,size);sizeMax=Math.max(sizeMax,size);entry=found;selected=found.id;selectedRoot='';rotation=0;sourceSelection=selection;remember(found);refresh();}
 async function openInput(text,{selection=null}={}){const input=String(text).slice(0,300),identity=chordIdentity(input);
  const tempered=result?.items.find(row=>row.kind==='tempered'&&row.spelling&&chordIdentity(row.spelling).fingerprint===identity.fingerprint);
  if(tempered)return choose(tempered,selection);
  query=input;entry=null;selected='';await run({direct:input});if(!result)return;
  const found=result.items.find(row=>hasInterpretation(row,identity.fingerprint));if(!found)return;
  const shape=found.dyads?.dyadic===false?projectChord(state(),found.interpretation.identity).shapeIdentities[state().basis.includes(2)?'octave':'exact']:null;
  const same=shape?.available?result.items.find(row=>row.kind==='tempered'&&row.shapeId===shape.id):null;
  if(same)query='';
  choose(same??found,selection);}
 function click(node){const b=node?.closest?.('[data-harmony-action]')??node,action=b?.dataset?.harmonyAction;if(!action)return false;
  try{
   if(action==='directory-star'){const input=String(b.dataset.input??''),label=String(b.dataset.label??input),ids=String(b.dataset.ids||favouriteKey(input)).split(' ');if(favourites.some(r=>ids.includes(favouriteKey(r.input))))favourites=favourites.filter(r=>!ids.includes(favouriteKey(r.input)));else favourites=validFavourites([...favourites,{input,label}]);saveFavourites();}
   if(action==='directory-more')expandedGroups.add(b.dataset.group);
   if(action==='directory-group'){const id=b.dataset.group,set=id==='recent'||id==='favourites'?closedGroups:openGroups;if(set.has(id))set.delete(id);else set.add(id);}
   if(action==='directory-form'){directoryFormFilter=['all','ji','otonal','utonal','ambitonal','et','custom'].includes(b.dataset.value)?b.dataset.value:'all';}
   if(action==='directory-clear'){sizeMin=3;sizeMax=6;directoryFormFilter='all';query='';page=0;setBass(null);}
   if(action==='bass-select'){const pick=directoryBassEntries().find(e=>e.row.id===b.dataset.id&&e.member===Number(b.dataset.member));if(pick)chooseBassEntry(pick);}
   if(action==='directory-recent'){directoryFormFilter='all';}if(action==='directory-recent')void openInput(b.dataset.input).catch(e=>{error=e.message;refresh();});
   if(action==='select'){entry=result?.items.find(row=>row.id===b.dataset.id)??null;selected=entry?.id??'';selectedRoot='';inversion=0;rotation=0;sourceSelection=null;}
   if(action==='select')remember(entry);
   if(action==='previous')page=Math.max(0,page-1);if(action==='next')page++;
   if(action==='lookup'){chordIdentity(query);void openInput(query).catch(e=>{error=e.message;refresh();});}
   if(action==='dual'&&entry?.interpretation)void openInput(entry.interpretation.exactDual.originalInput);
   if(action==='hear'){const value=currentSelection();if(value)play(value.voicing.voices.map(v=>coordinateCents(state(),v.coordinate)));}
   if(action==='collect'||action==='send'){const value=currentSelection();if(value){if(action==='collect')onCollect(state(),value.voicing.voices.map(v=>v.coordinate),value.label,{exact:true,harmonicSelection:value});else onSendToHexBoard(value);}}
   if(action==='rotation'){rotation=Math.max(0,rotations(detailModel()).findIndex(r=>r.index===Number(b.dataset.index)));const m=detailModel();if(m.geometry)playRotation(m,rotations(m)[rotation]?.index??0);}
   if(action==='inspect')onInspect();
   refresh();
  }catch(e){error=e.message;notify(e.message);refresh();}return true;
 }
 function setEnabled(value){if(enabled===value)return;enabled=!!value;if(!enabled){generation++;jobs.cancel();if(status==='loading'){stamp='';status='idle';}}else sync();}
 return {render,renderParts,change,click,sync,setEnabled,openInput,focus,focusExternal,matchPlayed,
  shapeTargets:()=>{const rows=directoryRows().filter(row=>row.kind==='ji');return {ready:!!result&&status!=='loading'&&status!=='error',complete:!!result?.complete,filters:{sizes:SIZE_RANGE.filter(size=>size>=sizeMin&&size<=sizeMax),form:directoryFormFilter==='et'?'all':directoryFormFilter,familyIds:[...new Set(rows.map(row=>row.familyId))]},
   // The listed JI chords, smallest and simplest first, for Play's chord-shape menu.
   chords:rows.map((row,order)=>({label:row.preferredLabel,size:directorySize(row),form:FORM_LABELS[formOf(row)]??'JI',rank:menuRank(row),order}))
    .sort((a,b)=>a.size-b.size||a.rank[0]-b.rank[0]||a.rank[1]-b.rank[1]||a.order-b.order).slice(0,24).map(({order,rank,...chord})=>chord)};},
  /** Sets (or clears, with null) the shared bass filter {scale:'discover'|'play', degree}; returns the applied value. */
  setBass(value){const applied=setBass(value);refresh();return applied;},bass:()=>bass?{...bass}:null,bassEntries:()=>directoryBassEntries(),
  // The directory's chords with a scale degree as their root (every inversion); null while listing.
  rootEntriesFor(value){sync();if(!result||status==='loading')return null;const s=value?.scale==='play'?getPlayState():getState();if(!value||!Number.isInteger(value.degree)||value.degree<0||value.degree>=s.n)return [];return degreeEntries(directoryRows(),{scale:value.scale==='play'?'play':'discover',degree:value.degree},'root');},
  /** The directory's chords on any bass, without changing the shared filter; null until the directory is listed. */
  bassEntriesFor(value){sync();if(!result||status==='loading')return null;const s=value?.scale==='play'?getPlayState():getState();if(!value||!Number.isInteger(value.degree)||value.degree<0||value.degree>=s.n)return [];return directoryBassEntries({scale:value.scale==='play'?'play':'discover',degree:value.degree});},
  /** Opens the directory chord rowId on the inversion with member `member` in the bass (as a bass entry). */
  chooseBass(value,rowId,member){const pick=directoryBassEntries(value).find(e=>e.row.id===rowId&&e.member===member);if(!pick)return false;chooseBassEntry(pick,value);refresh();return true;},followPlaying:()=>followPlaying,takeReveal(){const id=reveal;reveal=null;return id;},
  input(el){const field=el?.dataset?.harmonyField;if(field!=='search')return false;query=String(el.value).slice(0,300);page=0;refresh();return true;},
  openSelection(value){value=validateHarmonicSelection(value);generation++;jobs.cancel();query='';pendingRestore=null;status='idle';error='';result=null;stamp=catalogueContext(payload()).id;selectedRoot='';sourceSelection=value;entry={id:'source:'+value.voicing.id,kind:'source',shape:value.shape,preferredLabel:value.label};selected=entry.id;refresh();},selection:currentSelection,model:()=>({scope,query,selected,entry,result,status,error,detail:detailModel()}),
  serialize:()=>({version:1,followPlaying,favourites,recent,sizeRange:[sizeMin,sizeMax],directoryFormFilter,bass:bass?{...bass}:null,scope,query,directInputs,selected,selectedInterpretation:entry?.interpretationId??null,selectedRoot,inversion,style,periodShift,selection:currentSelection()}),
  restore(data){followPlaying=data?.followPlaying!==false;if(Array.isArray(data?.favourites)){favourites=validFavourites(data.favourites);saveFavourites();}recent=validFavourites(data?.recent).slice(0,6);[sizeMin,sizeMax]=Array.isArray(data?.sizeRange)&&data.sizeRange.length===2&&data.sizeRange.every(size=>SIZE_RANGE.includes(size))&&data.sizeRange[0]<=data.sizeRange[1]?data.sizeRange:[3,6];directoryFormFilter=['all','ji','otonal','utonal','ambitonal','et','custom'].includes(data?.directoryFormFilter)?data.directoryFormFilter:'all';setBass(data?.bass??null);closedGroups.clear();openGroups.clear();expandedGroups.clear();generation++;jobs.cancel();result=null;entry=null;selected='';selectedRoot='';sourceSelection=null;pendingRestore=null;directInputs=Array.isArray(data?.directInputs)?data.directInputs.filter(v=>typeof v==='string'&&v.length<=300).slice(0,1):[];stamp='';error='';status='idle';scope=['temperament','discover','discover-tonic','play','play-tonic'].includes(data?.scope)?data.scope:'temperament';query=typeof data?.query==='string'?data.query.slice(0,300):'';inversion=Number.isSafeInteger(data?.inversion)?Math.max(0,Math.min(7,data.inversion)):0;style=['original','compact','open'].includes(data?.style)?data.style:'original';periodShift=Number.isSafeInteger(data?.periodShift)?Math.max(-8,Math.min(8,data.periodShift)):0;if(data?.selection)try{pendingRestore={...data,selection:validateHarmonicSelection(data.selection)};}catch{notify('Unsupported harmonic metadata was ignored.');}},
  destroy(){generation++;enabled=false;jobs.destroy();occurrences.entries.clear();}};
}
