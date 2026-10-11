import {parsePrimeFilterInput} from './ji-limit-engine.mjs';
import {createDiamondWorkspace} from './diamond-workspace.mjs';
import {fitDiamondChord} from './diamond-layout.mjs';
import {diamondFocus,matrixFocusDegrees,relativeRatios} from './harmonic-focus.mjs';
import {noteCoordinate} from './pitch.mjs';
import {equivalencePolicy,quotientCoordinate} from './harmonic-equivalence.mjs';
import {createHarmonicCatalogueWorkspace} from './harmonic-catalogue-ui.mjs';
import {syncUnifiedPanelHeights,renderUnified,unifiedDirectory,unifiedDetail,unifiedCenterView,normalizeUnifiedCenter} from './discover-unified.mjs';
import {withDefaultScale} from './default-scale.mjs';
import {esc,option} from './ui.mjs';
import {createAudioEngine} from './audio.mjs';
import {createCompositionWorkspace} from './composition-ui.mjs';
import {createHexboardDevice} from './hexboard-device.mjs';
import {createHexboardSync,clampBrightness} from './hexboard-sync.mjs';
import {createFingeringGame} from './fingering-game.mjs';
import {createFingeringGameUi} from './fingering-game-ui.mjs';
import {createKeyHarmoniesUi} from './key-harmonies-ui.mjs';
import {sessionFormat,compositionForSave,isSessionFormat,compositionFromSession} from './composition-session.mjs';
import {normalizeDiamondScope,maximumDiamondError,renderDiamondTolerance} from './tonality-diamond.mjs';
import {errorColor,maximumMappedTargetError} from './ji-error-color.mjs';
import {createHexboardPlayer} from './hexboard-player.mjs';
import {createLiveChordRecognizer} from './live-chord-recognition.mjs';
import {createMaterialWorkspace,tuningIdentity} from './material-ui.mjs';
import {tuningMethods,tuningMethod,tuningConfig,applyTuningMethod,jiSelection} from './tuning-methods.mjs';
import {createPresetWorkspace} from './preset-ui.mjs';
import {validateState as validate} from './state.mjs';
import {createHexboardWorkspace} from './hexboard-ui.mjs';
import {octavePeriods,matrixScale,matrixInterval,matrixWindow} from './matrix.mjs';
import {createCommaWorkspace} from './comma-ui.mjs';
import {createChordWorkspace} from './chord-ui.mjs';
import {target,assignment,checkAssignments,same,coordinate} from './assignments.mjs';
import {candidates,nearestReport} from './approximation-compat.mjs';
import {optimize,supportingEdos} from './tuning.mjs';
import {mod,presets,makeState,scale,scaleChoices,stepSymbol,mapRatio,targets,classifyTargets,createTargetClassifier,purePeriod,periodDescription,DEFAULT_ODD_LIMIT,MANUAL_PRIME_LIMIT_VALUES,ODD_LIMIT_VALUES,formatPrimeFilter,primeFilterForBasis,validateJILimits,ratioWithinJILimits} from './engine.mjs';
import {findScaleMilestones,scaleDefaultKey,scaleMilestoneMarkers,modeMilestoneMarker,formatModeRanges} from './scale-milestones.mjs';
const $=q=>document.querySelector(q);
function populateLimitOptions(basisLimit,primeBasisFilter){
 const odd=$('#limit'),prime=$('#primeLimit'),oddSelection=odd.value||String(DEFAULT_ODD_LIMIT),primeSelection=prime.value;
 prime.placeholder='e.g. 11 or 2.3.5.11';prime.title=`basis = current temperament basis (${states[0].basis.join('.')}); blank = no prime filter`;
 odd.value=oddSelection==='basis'?String(basisLimit):oddSelection;const automatic=primeSelection==='basis'||prime.dataset.basisValue===primeSelection;prime.value=automatic?states[0].basis.join('.'):primeSelection;if(automatic)prime.dataset.basisValue=prime.value;
}
let states=[withDefaultScale(makeState('meantone'))],view='matrices',selected=null,toastTimer;
let manualChordInspector=false;
// Catalogue rendering can synchronously request a loading/progress refresh.
let renderingWorkspace=false;
// A catalogue refresh replaces only the directory and analysis panes; the centre and scale stay.
// The harmony directory's focused chord, projected onto the diamond and the interval matrix.
function focusOnDiamond(focus){const s=states[0],octave=s.basis.includes(2),policy=equivalencePolicy(s,octave?'octave':'exact');
 return diamondFocus(diamondWorkspace.cells(),focus,{harmonics:diamondWorkspace.harmonics(),octave,classKeyOf:m=>quotientCoordinate(policy,m).key});}
// Diamond → directory: a selected chord of three or more pitch classes is focused at once; a held one,
// when following is on, once it has been held for a moment.
let followTimer=null,matrixChordCells=new Set();
function followDiamond(){
 clearTimeout(followTimer);
 if(view!=='unified')return;
 const chord=diamondWorkspace.chordDisplay();if(chord?.kind!=='chord')return;
 const cells=diamondWorkspace.displayCells();if(new Set(cells.map(cell=>cell.label)).size<3)return;
 const playing=chord.source==='playing';if(playing&&!harmonicWorkspace.followPlaying())return;
 const run=()=>{const now=diamondWorkspace.displayCells();if(now.map(cell=>cell.id).join()!==cells.map(cell=>cell.id).join())return;
  const coordinates=[...new Map(now.filter(cell=>cell.status?.approximation?.m).map(cell=>[cell.status.approximation.m.join(),cell.status.approximation.m])).values()];
  harmonicWorkspace.focusExternal({ratios:relativeRatios(now,{octave:states[0].basis.includes(2)}),coordinates});};
 if(playing)followTimer=setTimeout(run,250);else run();
}
// Matrix → directory: Shift-click cells to collect their scale degrees; three or more form a chord.
function pickMatrixCell(i,j){
 const key=`${i},${j}`;if(matrixChordCells.has(key))matrixChordCells.delete(key);else matrixChordCells.add(key);
 const s=states[0],m=matrixScale(s),distance=settings(s).layout==='distance',degrees=new Set();
 for(const cell of matrixChordCells){const [a,b]=cell.split(',').map(Number);for(const index of [a,distance?a+b:b])degrees.add(((index%m.n)+m.n)%m.n);}
 const coordinates=[...degrees].map(degree=>noteCoordinate(s,m.notes[degree]));
 if(coordinates.length>=3&&view==='unified'&&!harmonicWorkspace.focusExternal({coordinates}))toast('Those scale degrees are not a chord in the directory: not every pair is a JI interval of the selected limit.');
 applyHarmonicFocus();
}
function applyHarmonicFocus(){
 const focus=view==='unified'?harmonicWorkspace.focus():null;
 diamondWorkspace.showFocus(focus?focusOnDiamond(focus).ids:[]);
 const n=states[0].n,degrees=matrixFocusDegrees(focus,n),ascending=settings(states[0]).layout==='distance';
 document.querySelectorAll('.matrix [data-cell]').forEach(el=>{const [i,j]=el.dataset.cell.split(',').map(Number),a=((i%n)+n)%n,b=(((ascending?i+j:j)%n)+n)%n;el.classList.toggle('focus-cell',!!degrees&&degrees.has(a)&&degrees.has(b));el.classList.toggle('chord-pick',matrixChordCells.has(el.dataset.cell));});
}
// Scroll a row focused from another view into the directory list, without moving the page.
function revealDirectoryRow(directory){
 if(!directory)return;const id=harmonicWorkspace.takeReveal();if(!id)return;
 try{const button=[...directory.querySelectorAll('[data-harmony-action="select"]')].find(el=>el.dataset.id===id),list=button?.closest('.unified-directory-list');
  if(!button||!list)return;const item=button.getBoundingClientRect(),box=list.getBoundingClientRect();
  if(item.top<box.top||item.bottom>box.bottom)list.scrollTop+=item.top-box.top-box.height/3;}catch{}
}
function refreshHarmony(){if(renderingWorkspace)return;renderingWorkspace=true;try{if(view!=='unified')return;const active=document.activeElement,key=active?.tagName==='INPUT'?active.dataset?.harmonyField:null,draft=key?{value:active.value,start:active.selectionStart,end:active.selectionEnd}:null;const host=$('#workspace'),parts=harmonicWorkspace.renderParts({directory:true}),directory=host.querySelector('[data-unified-pane="directory"]'),detail=host.querySelector('[data-unified-pane="detail"]');if(!directory||!detail)return;directory.innerHTML=unifiedDirectory(parts);if(!manualChordInspector)detail.innerHTML=unifiedDetail(parts);applyHarmonicFocus();revealDirectoryRow(directory);if(key){const input=host.querySelector('[data-harmony-field="'+key+'"]');if(input){input.value=draft.value;input.focus({preventScroll:true});if(draft.start!=null&&input.type==='search')input.setSelectionRange(draft.start,draft.end);}}}finally{renderingWorkspace=false;}}
function fitPlayHarmony(coords){const state=getLayoutStates()[0],generators=coords.map(m=>m[1]);const fits=s=>{const generated=scale(s);return !generated.collision&&generators.every(g=>generated.notes.some(n=>n.k===g));};if(fits(state))return;const minimum=Math.max(2,Math.max(0,...generators)-Math.min(0,...generators)+1);for(let n=minimum;n<=256;n++)for(let mode=0;mode<n;mode++){const next={...state,n,mode};if(fits(next)){layoutState.state=validate(next);renderWorkspace();return;}}toast('No collision-free Play scale fits these notes within 256 notes.');}

populateLimitOptions(Math.max(3,...states[0].basis),primeFilterForBasis(states[0].basis));
let scaleFilter='2',diamondScope='mapping',manualTolerance=null,unifiedCenter='diamond';
let coverageSignature=scaleDefaultKey(states[0],coverageSettings(states[0]));
function syncCoverageDefaults(){const s=states[0],cfg=coverageSettings(s),key=scaleDefaultKey(s,cfg);if(key!==coverageSignature){states[0]=withDefaultScale(s,toast,cfg);coverageSignature=key;selected=null;matrixPages[0]=[0,0];}}
let audioSettings={tonic:220,wave:'triangle'};
const audioEngine=createAudioEngine({getSettings:()=>audioSettings,onError:()=>toast('Audio could not start. Try pressing a key again.')});
const lastViews={discover:'unified',play:'hexboard',create:'composition'};
const sectionFor=v=>v==='hexboard'?'play':v==='composition'?'create':'discover';
const presetWorkspace=createPresetWorkspace({getJI:coverageSettings,getStates:()=>states,apply:(idx,s)=>{states[idx]=validate(s);selected=null;matrixPages[0]=[0,0];stop();render();},refresh:()=>{document.querySelectorAll('[data-preset-controls]').forEach(el=>renderPresetControls(el,Number(el.dataset.presetControls)));},notify:toast});
let layoutState=null;
function getLayoutStates(){const source=states[0],signature=scaleDefaultKey(source,coverageSettings(source));if(!layoutState||layoutState.signature!==signature)layoutState={signature,state:withDefaultScale(structuredClone(source),()=>{},coverageSettings(source))};else{const {n,mode}=layoutState.state;Object.assign(layoutState.state,structuredClone(source),{n,mode});}return [layoutState.state];}
function placeMaterial(item){getLayoutStates();if(item.harmonicSelection){view='hexboard';hexWorkspace.acceptHarmonicSelection(item.harmonicSelection);renderWorkspace();return;}const count=item.kind==='scale'?hexWorkspace.showScale(item.coords,item.label):hexWorkspace.showChord(item.coords,item.label,item.exact?{exact:true,periodCopies:true}:{});if(!count)toast(item.exact?'These degrees and voicing do not fit yet. Try Period Wrapping, another occurrence, or a wider layout.':'No complete placement on this layout. Try a larger target scale or another layout.');view='hexboard';selected=null;renderWorkspace();}
const materialWorkspace=createMaterialWorkspace({getState:()=>states[0],validate,play:(notes,kind)=>kind==='scale'?playSequence(notes):playPitches(notes),refresh:()=>renderWorkspace(),notify:toast,place:placeMaterial,load:s=>{states[0]=validate(s);coverageSignature=scaleDefaultKey(states[0],coverageSettings(states[0]));selected=null;stop();view='scales';render();}});
const chordWorkspace=createChordWorkspace({onBrowseHarmony:()=>{manualChordInspector=false;view='unified';renderWorkspace();},getJI:settings,getStates:()=>states,play:playPitches,refresh:full=>full?render():renderWorkspace(),notify:toast,onCollect:(s,coords,label,options)=>materialWorkspace.add('chord',s,coords,label,options),onHexboard:(coords,label,options)=>placeMaterial({kind:'chord',coords,label,exact:options?.exact})});
const harmonicWorkspace=createHarmonicCatalogueWorkspace({getState:()=>states[0],getPlayState:()=>getLayoutStates()[0],getSettings:settings,refresh:refreshHarmony,notify:toast,play:playPitches,onCollect:(s,coords,label,options)=>materialWorkspace.add('chord',s,coords,label,options),onSendToHexBoard:value=>{view='hexboard';selected=null;playFocusKey=focusKey(value);hexWorkspace.acceptHarmonicSelection(value);renderWorkspace();},onInspect:()=>{manualChordInspector=true;view='unified';renderWorkspace();}});
const commaWorkspace=createCommaWorkspace({getStates:()=>states,generate:(basis,list)=>{presetWorkspace.receiveCommas(0,basis,list);document.querySelector('[data-preset-commas]')?.focus();},refresh:renderCommaSearch,notify:toast});
let hexPlayer,diamondPlayer;
const liveChordRecognizer=createLiveChordRecognizer();
let liveChordContext=null,liveChordFrame=0,activeHexNotes=[];
// Play and Discover share the focused chord. Entering Play with a newly focused chord hands it to
// Play's harmony panel once; a chord focused from Play itself is never handed back.
let playFocusKey='',playFollowTimer=null;
const focusKey=selection=>JSON.stringify([selection?.shapeId??null,selection?.interpretationId??null,selection?.voicing?.coords??null]);
// Play's chord search looks the chord up in the directory, like Discover's search, and places it.
async function searchPlayChord(text){
 let selection=null;
 try{await harmonicWorkspace.openInput(text);selection=harmonicWorkspace.selection();}catch(e){toast(e.message);return;}
 if(!selection){toast(`No chord in the directory matches ${text}.`);return;}
 playFocusKey=focusKey(selection);hexWorkspace.acceptHarmonicSelection(selection);renderWorkspace();
}
function syncPlayFocus(){
 let selection=null;try{selection=harmonicWorkspace.selection();}catch{return;}
 if(!selection)return;const key=focusKey(selection);if(key===playFocusKey)return;
 playFocusKey=key;try{hexWorkspace.acceptHarmonicSelection(selection);}catch{}
}
// Held Play notes (screen or HexBoard) focus their chord in Discover while following is on.
function followPlay(notes){
 clearTimeout(playFollowTimer);
 if(!harmonicWorkspace.followPlaying())return;
 const coordinates=[...new Map((notes??[]).filter(note=>Array.isArray(note?.coordinate)).map(note=>[note.coordinate.join(),note.coordinate])).values()];
 if(coordinates.length<3)return;
 playFollowTimer=setTimeout(()=>{if(harmonicWorkspace.focusExternal({coordinates})){try{playFocusKey=focusKey(harmonicWorkspace.selection());}catch{}}},250);
}
function scheduleLiveChordUpdate(notes){
 activeHexNotes=notes;
 if(liveChordFrame)return;
 liveChordFrame=requestAnimationFrame(()=>{
  liveChordFrame=0;
  showLiveChord();
  followPlay(activeHexNotes);
 });
}
function showLiveChord(){
 const context=liveChordContext;
 if(context)hexWorkspace.updateLiveChord(liveChordRecognizer.recognize(context.state,activeHexNotes,context.settings),activeHexNotes);
}
const diamondWorkspace=createDiamondWorkspace({document,getState:()=>states[0],refresh:()=>renderWorkspace(),notify:toast,play:playPitches,onInspect:()=>fillDiamondDetails(),onChordChange:()=>{fillDiamondDetails();followDiamond();},onTuningChange:centsFor=>diamondPlayer?.retune(centsFor),onCollect:item=>materialWorkspace.add(item.kind,states[0],item.coords,item.label,{exact:true,harmonicSelection:item.harmonicSelection}),onPlace:placeMaterial,onChord:item=>{if(item.harmonicSelection){view='unified';manualChordInspector=false;harmonicWorkspace.openSelection(item.harmonicSelection);renderWorkspace();return;}const next=fitDiamondChord(states[0],item.coords),previous=states[0];try{states[0]=validate(next);chordWorkspace.fromCoordinates(item.coords,item.label);}catch(error){states[0]=previous;throw error;}view='chords';selected=null;stop();render();}});
const hexWorkspace=createHexboardWorkspace({matchPlayed:coordinates=>harmonicWorkspace.matchPlayed(coordinates),getJI:settings,setJI:patch=>{if(patch.tol!==undefined)manualTolerance=clampTolerance(patch.tol)??0;if(patch.limit!==undefined)$('#limit').value=String(patch.limit);if(patch.primeLimit!==undefined)$('#primeLimit').value=Array.isArray(patch.primeLimit)?patch.primeLimit.join('.'):patch.primeLimit==null?'':String(patch.primeLimit);if(patch.filter!==undefined)$('#targetfilter').value=patch.filter;},getStates:getLayoutStates,play:playPitches,refresh:mode=>mode===true?render():renderWorkspace({keepNotes:mode==='highlight'}),notify:toast,download,getHz:()=>audioSettings.tonic,getBassEntries:value=>harmonicWorkspace.bassEntriesFor(value),onBrowseHarmony:()=>{view='unified';manualChordInspector=false;renderWorkspace();},onSearch:searchPlayChord,onFitHarmonicScale:fitPlayHarmony,onCollect:(s,coords,label,options)=>materialWorkspace.add('chord',s,coords,label,{exact:true,...options}),onInspect:(s,coords,label)=>{manualChordInspector=true;states[0]=validate(structuredClone(s));coverageSignature=scaleDefaultKey(states[0],coverageSettings(states[0]));chordWorkspace.fromCoordinates(coords,label);view='unified';selected=null;render();}});
const matrixPages=[[0,0]];
const stateName=s=>`${s.name}[${s.n}]`,fmt=(x,n=2)=>Number(x).toFixed(n),sign=x=>`${x>=0?'+':''}${fmt(x)}`;
function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').style.display='none',4500);}
function clampTolerance(value){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(100,n)):null;}
function readTuning(panel){const cfg={...tuningConfig(states[Number(panel.dataset.s)])};panel.querySelectorAll('[data-tune]').forEach(el=>{const key=el.dataset.tune;if(key==='edoChoice'){[cfg.n,cfg.k,cfg.h]=el.value.split(':');}else if(key==='optimizePeriod')cfg.fixed=!el.checked;else cfg[key]=el.type==='checkbox'?el.checked:el.value;});return cfg;}
function tuningControls(s,idx){const cfg=tuningConfig(s),method=cfg.method;if(!['Minimax','Least Squares','EDO','JI Target'].includes(method))return '';const options=method==='EDO'?supportingEdos(s,Number(cfg.edoMax),cfg.edoVariants):[];
 return `${method==='EDO'?'<p>EDO fixes the octave at 1200¢.</p>':''}
 ${method==='EDO'?`<label>EDO<select data-tune="edoChoice">${options.length?options.map(v=>option(v.n+':'+v.k+':'+v.periodSteps,`${v.n}edo · ${v.k} generator steps${v.patent?'':' · nearby val'}`,cfg.n+':'+cfg.k+':'+cfg.h)).join(''):'<option value="">No supporting EDO</option>'}</select></label><details><summary>EDO search options</summary><label>Search up to<select data-tune="edoMax">${[100,500,1000,5000].map(n=>option(n,n,cfg.edoMax)).join('')}</select></label><label class="checklabel"><input type="checkbox" data-tune="edoVariants" ${cfg.edoVariants?'checked':''}>Include nearby non-patent vals</label><p>Every listed mapping tempers out the temperament’s commas.</p></details>`:''}
 ${['Minimax','Least Squares'].includes(method)?`<label>Targets<select data-tune="targets">${option('primes','Basis primes',cfg.targets)}${[5,7,9,13].map(n=>option(n,`${n}-odd-limit · mapped`,cfg.targets)).join('')}${option('custom','Custom intervals',cfg.targets)}</select></label>${cfg.targets==='custom'?`<label>Intervals<input data-tune="custom" value="${esc(cfg.custom)}" placeholder="3/2, 5/4, 6/5"></label>`:''}`:''}
 ${method==='JI Target'?`${explorer(s,idx)}`:''}
`;
}
function applyPanelTuning(idx,cfg){try{states[idx]=applyTuningMethod(states[idx],cfg);selected=null;stop();}catch(e){states[idx]={...states[idx],tuning:'Manual',tuneConfig:cfg,tuningReport:'Not applied: '+e.message};toast(e.message);}render();}
function renderPresetControls(host,idx){host.innerHTML=presetWorkspace.render(idx);const editor=host.querySelector('.temperament-editor'),target=$('#advanced-temperament-editor');if(editor&&target)target.replaceChildren(editor);}
function renderPanel(idx){const s=states[idx],advancedTuningOpen=$('#tuning-panel .advanced-tuning-options')?.open,tuningOptions=tuningControls(s,idx),canOptimizePeriod=tuningMethod(s)!=='EDO';
$('#temperament-controls').innerHTML=`<div data-preset-controls="${idx}"></div>`;renderPresetControls($('#temperament-controls [data-preset-controls]'),idx);
$('#tuning-panel').innerHTML=`<div class="tuning-choice"><label>Tuning<select data-s="${idx}" data-field="tuning">${tuningMethods.map(v=>option(v,v,tuningMethod(s))).join('')}</select></label><div class="tuning-summary" aria-label="Current tuning"><span>Generator <b>${fmt(s.g,4)} ¢</b></span><div class="period-summary"><span>Period <b>${fmt(s.p,4)} ¢</b></span></div></div></div>
${/^EDO \d+$/.test(s.tuning)?`<p class="notice">Induced val: ⟨${s.rows[0].map((v,i)=>v*Math.round(s.p*Number(s.tuning.slice(4))/1200)+s.rows[1][i]*Math.round(s.g*Number(s.tuning.slice(4))/1200)).join(' ')}] · may be non-patent.</p>`:''}
${tuningOptions||canOptimizePeriod?`<details class="advanced-tuning-options" data-s="${idx}" ${advancedTuningOpen?'open':''}><summary>Advanced tuning options</summary><div class="header-popover-panel">${tuningOptions}${canOptimizePeriod?`<label class="period-optimize"><input type="checkbox" data-optimize-period="${idx}" ${!tuningConfig(s).fixed?'checked':''}>Optimize period</label>`:''}</div></details>`:''}
`;
const mappingOpen=$('#mapping-options details')?.open;
$('#mapping-options').innerHTML=`<details class="mapping"><summary>Mapping & custom temperament</summary><p>Columns: ${s.basis.join(', ')}. Rows: period, generator.</p><pre>${s.rows.map(r=>'⟨'+r.join(' ')+']').join('\n')}\nCommas: ${esc(s.commas||'derived from mapping')}</pre><label>Prime basis<input data-custom="basis" value="${s.basis.join(' ')}"></label><label>Mapping rows · one per line<textarea data-custom="rows">${s.rows.map(r=>r.join(' ')).join('\n')}</textarea></label><button data-action="mapping" data-s="${idx}">Apply custom mapping</button><p>${presets[s.key]?`<a href="${presets[s.key].source}" target="_blank" rel="noreferrer">Preset definition and tuning source ↗</a>`:'Custom mapping: prime least-squares tuning is calculated here.'}</p></details>`;
if(mappingOpen)$('#mapping-options details').open=true;
}

function scaleMilestoneCard(id,title,result,detail){return `<button type="button" class="scale-milestone" data-scale-milestone="${id}" ${result?'':'disabled'}><span>${title}</span><b>${result?`${result.n} notes · ${esc(result.signature)}`:`Not found through 256 notes`}</b><small>${result?detail:'No qualifying scale within the generated-size search.'}</small></button>`;}
function scaleControls(){
 const s=states[0],idx=0,milestones=findScaleMilestones(s,coverageSettings(s)),all=scaleChoices(s,scaleFilter),choices=new Map(all.map(x=>[x.n,x]));
 const allGenerated=scaleChoices(s,'all');
 for(const n of [milestones.interval?.n,milestones.intervalMOS?.n,milestones.diamond?.n,milestones.diamondMOS?.n])if(n&&!choices.has(n)){const candidate=allGenerated.find(x=>x.n===n);if(candidate)choices.set(n,candidate);}
 const scaleOptions=[...choices.values()].sort((a,b)=>a.n-b.n).map(x=>{const markers=scaleMilestoneMarkers(milestones,x.n);return option(x.n,`${x.n} notes · ${x.signature}${x.retained?' · current (outside filter)':''}${markers.length?` · ${markers.join(' · ')}`:''}`,s.n);}).join('');
 const modeOptions=Array.from({length:s.n},(_,i)=>option(i,`${i+1} / ${s.n}${modeMilestoneMarker(milestones,s.n,i)?' · DC':''}`,s.mode)).join('');
 const diamondScaleDetail=milestones.diamond?`completing mode${milestones.diamond.modes.length===1?'':'s'} ${formatModeRanges(milestones.diamond.modes)}`:'all completing modes';
 const diamondMOSDetail=milestones.diamondMOS?`completing mode${milestones.diamondMOS.modes.length===1?'':'s'} ${formatModeRanges(milestones.diamondMOS.modes)}`:'all completing modes';
 const a=scale(s);
 return `<div class="formrow scale-head"><label>Scale<select data-s="${idx}" data-field="n">${scaleOptions}</select></label><label>Mode<select data-s="${idx}" data-field="mode">${modeOptions}</select></label><div class="metrics scale-step-sizes" aria-label="Step sizes">${a.sizes.map(v=>`<div><span>${stepSymbol(a,v)} STEP</span><b>${fmt(v)} ¢</b></div>`).join('')}</div></div><details class="scale-advanced" ${document.querySelector('.unified-scale-controls .scale-advanced')?.open?'open':''}><summary>Advanced scale options</summary><label>Scales<select data-scale-filter>${option('all','All',scaleFilter)}${option('2','2 step sizes',scaleFilter)}${option('3','3 step sizes',scaleFilter)}</select></label><section class="scale-milestones" aria-label="Scale coverage milestones"><h4>Coverage milestones</h4><div class="scale-milestone-grid">${scaleMilestoneCard('interval','First interval-complete scale',milestones.interval,'Mode-independent interval matrix')}${scaleMilestoneCard('intervalMOS','First interval-complete MOS',milestones.intervalMOS,'Opens in default mode 1')}${scaleMilestoneCard('diamond','First diamond-complete scale',milestones.diamond,diamondScaleDetail)}${scaleMilestoneCard('diamondMOS','First diamond-complete MOS',milestones.diamondMOS,diamondMOSDetail)}</div><p>${milestones.limit}-odd-limit · ${esc(formatPrimeFilter(milestones.primeLimit))} · ${milestones.mappedTargetCount} mapped interval classes${milestones.unmappedTargetCount?` · ${milestones.unmappedTargetCount} outside-basis targets excluded`:``} · IC: full matrix · DC: one tonic · modulo one period</p></section></details>`;
}
// One period drawn as a line from the tonic (0 ¢) to the period; each degree sits at its cents
// position and each step's size symbol labels the segment it spans, including the closing step.
function scaleLine(s,a,idx){
 const at=c=>`${(100*c/s.p).toFixed(4)}%`,dense=a.notes.length>48;
 const steps=a.steps.map((v,i)=>{const from=a.notes[i].c;return `<span class="scale-line-step" style="left:${at(from+v/2)}" title="${stepSymbol(a,v)} step · ${fmt(v)} cents">${stepSymbol(a,v)}</span>`;}).join('');
 const bass=harmonicWorkspace.bass(),bassDegree=bass?.scale==='discover'?bass.degree:-1;
 const notes=a.notes.map((v,i)=>`<button class="scale-line-note${i===0?' root':''}${i===bassDegree?' is-bass':''}" style="left:${at(v.c)}" data-note="${i}" data-s="${idx}" title="Degree ${i} · ${fmt(v.c)} cents · click to play and list the chords built on it" aria-label="Play degree ${i}, ${fmt(v.c)} cents, and list chords with it as the bass" aria-pressed="${i===bassDegree}"><span>${i}</span></button>`).join('');
 return `<div class="scale-line${dense?' dense':''}" role="group" aria-label="Playable scale over one ${fmt(s.p)}-cent period"><div class="scale-line-track"></div><i class="scale-line-end" style="left:100%" aria-hidden="true"></i>${steps}${notes}<small class="scale-line-cents" style="left:0">0 ¢</small><small class="scale-line-cents end" style="left:100%">${fmt(s.p)} ¢</small></div>`;
}
function scaleDetails(){const s=states[0],idx=0,a=scale(s);return `<section class="scale-details">
${scaleLine(s,a,idx)}
<div class="panelactions"><button data-action="scale" data-s="${idx}">▶ Play scale</button><button data-hex-open="${idx}" class="primary">Use scale in Play</button><button data-scale-action="collect">Add scale to collection</button><button data-scale-action="place">Highlight on current layout</button><button data-action="export" data-s="${idx}">Export .scl</button></div>
${a.collision?'<p class="notice">This tuning collapses notes. Choose a smaller size.</p>':''}
</section>`;}

function automaticTolerance(){const s=states[0],limitSelection=$('#limit').value,limit=limitSelection==='basis'?Math.max(3,...s.basis):Number(limitSelection),primeSelection=$('#primeLimit').value===$('#primeLimit').dataset?.basisValue?'basis':$('#primeLimit').value,primeLimit=parsePrimeFilterInput(primeSelection,s.basis),cfg={limit,primeLimit};validateJILimits({oddLimit:limit,primeLimit});const ts=allTargets(targets(limit,primeLimit),s,cfg);return Math.max(maximumMappedTargetError(s,ts),maximumDiamondError(s,{...cfg,scope:diamondScope,diamondLayout:diamondWorkspace.layout(),filter:$('#targetfilter').value,outside:true}));}
function coverageSettings(s){const basisPrimes=s.basis,basisLimit=Math.max(3,...basisPrimes),limit=$('#limit').value==='basis'?basisLimit:Number($('#limit').value),primeLimitSelection=$('#primeLimit').value===$('#primeLimit').dataset?.basisValue?'basis':$('#primeLimit').value,primeLimit=parsePrimeFilterInput(primeLimitSelection,basisPrimes);validateJILimits({oddLimit:limit,primeLimit});return {limit,primeLimit,primeLimitSelection};}
function settings(s=states[0]){const cfg=coverageSettings(s),autoTolerance=automaticTolerance(),tol=manualTolerance??autoTolerance;$('#tolerance').value=String(tol);return {...cfg,layout:$('#layout').value,labels:$('#labels').value,ts:targets(cfg.limit,cfg.primeLimit),tol,maxError:tol,autoTolerance,toleranceAutomatic:manualTolerance===null,filter:$('#targetfilter').value,outside:true};}
function near(c,ts){return [...ts,{c:1200,label:'2/1'}].reduce((a,t)=>Math.abs(t.c-c)<Math.abs(a.c-c)?t:a,{c:0,label:'1/1'});}
function allTargets(ts,s,cfg){const extras=[{n:1,d:1,label:'1/1',c:0},{n:2,d:1,label:'2/1',c:1200},...(s.basis[0]===2?[]:[{n:s.basis[0],d:1,label:`${s.basis[0]}/1`,c:1200*Math.log2(s.basis[0])}])];return [...extras.filter(t=>ratioWithinJILimits(t.n,t.d,{oddLimit:cfg.limit,primeLimit:cfg.primeLimit})),...ts];}
function visibleTargets(match,cfg){const hasMappedHit=match.mapped.some(t=>t.within);const hits=match.hits.filter(t=>!hasMappedHit||t.reason!=='Outside temperament basis');return [...(cfg.filter==='hits'?[]:match.mapped.filter(t=>t.within||cfg.outside)),...(cfg.filter==='mapped'?[]:hits)];}
function targetMarkup(t){return `<span class="target-chip ${t.identity?(t.within?'target-mapped':'target-outside'):'target-hit'}"><small>${t.identity?(t.within?'M':'M×'):(t.reason==='Outside temperament basis'?'O':'A')}</small> ${t.label}</span>`;}
function targetCellMarkup(items){if(!items.length)return '—';const first=targetMarkup(items[0]);return `<span class="target-cell-content">${first}${items.length>1?`<small class="target-more">+${items.length-1}</small>`:''}</span>`;}
function spanControl(s,idx,label='Matrix span'){
 if(octavePeriods(s)<=1)return '';
 const m=matrixScale(s),value=m.periods===1?'period':'octave';
 return `<div class="span-control"><label>${label}<select data-matrix-span="${idx}">${option('period','One period',value)}${option('octave','Whole octave',value)}</select></label><p>${m.periods>1?`${m.periods} repeated periods · ${m.n} notes · tempered octave ${fmt(m.p,4)} ¢`:`${s.n} notes · one period ${fmt(s.p,4)} ¢`}</p></div>`;
}
function matrix(){
 const s=states[0],cfg=settings(s),classify=createTargetClassifier(s,allTargets(cfg.ts,s,cfg),cfg.tol),ascending=cfg.layout==='distance',m=matrixScale(s),notes=m.notes,w=matrixWindow(m,ascending,...matrixPages[0]);matrixPages[0]=[w.rowPage,w.colPage];
 let body='<thead><tr><th scope="col" title="Starting note in cents">¢</th>'+Array.from({length:w.colEnd-w.colStart},(_,x)=>{const j=x+w.colStart;return `<th scope="col">${j===m.n?'('+j+')':j}</th>`;}).join('')+'</tr></thead><tbody>';
 for(let i=w.rowStart;i<w.rowEnd;i++){
  body+=`<tr><th scope="row" title="Starting note ${i}: ${fmt(notes[i].c,4)} cents">${fmt(notes[i].c,1)}</th>`;
  for(let j=w.colStart;j<w.colEnd;j++){
   const v=matrixInterval(m,i,j,cfg.layout),c=v.c,match=classify(v),shown=visibleTargets(match,cfg);
   const text=cfg.labels==='cents'?fmt(c,1):cfg.labels==='generators'?(v.k>0?'+':'')+v.k:targetCellMarkup(shown);
   const colorTarget=shown.find(t=>t.identity)||shown[0],color=colorTarget?errorColor(colorTarget.error,cfg.maxError):'#1c2531',ink=colorTarget?'#11151c':'';
   body+=`<td><button class="cell ${cfg.labels==='ratios'?'ratio-cell':''}" style="background:${color}${ink?`;color:${ink}`:''}" data-cell="${i},${j}" aria-label="Scale, starting note ${fmt(notes[i].c,1)} cents, ${ascending?'ascending step':'destination degree'} ${j}, ${fmt(c)} cents" title="${fmt(c,4)} ¢${shown.map(t=>` · ${t.identity?(t.within?'Mapped':'Mapped outside tolerance'):(t.reason==='Outside temperament basis'?'Outside subgroup':'Alternative approximation')} ${t.label}: ${sign(t.error)} ¢`).join('')}">${text}</button></td>`;
  }
  body+='</tr>';
 }
 return `<div class="matrixbox"><div class="matrixheading" data-matrix-labels-host></div>${octavePeriods(s)>1?`<div class="matrix-span">${spanControl(s,0)}</div>`:''}${w.rowPages>1||w.colPages>1?`<div class="matrix-pages">${[['Rows',w.rowStart,w.rowEnd,m.n,w.rowPage,w.rowPages,0],['Columns',w.colStart,w.colEnd,m.n+(ascending?1:0),w.colPage,w.colPages,1]].map(([label,start,end,total,page,pages,axis])=>`<span>${label} ${start}–${end-1} / ${total} <button data-matrix-page="0,${axis},${page-1}" ${page===0?'disabled':''} aria-label="Previous ${label.toLowerCase()}">←</button><button data-matrix-page="0,${axis},${page+1}" ${page===pages-1?'disabled':''} aria-label="Next ${label.toLowerCase()}">→</button></span>`).join('')}</div>`:''}<p class="viewnote matrix-chord-hint">Shift-click cells to build a chord from their scale degrees.</p><div class="matrixscroll"><table class="matrix" style="--matrix-columns:${w.colEnd-w.colStart}" aria-label="Scale interval matrix">${body}</tbody></table></div><div class="matrix-options-host" data-matrix-controls-host></div></div>`;
}
function diamondIntervalTable(intervals,tol,explanation=''){
 const memberColor=interval=>interval.errorCents===null?'var(--muted)':errorColor(interval.errorCents,tol);
 const ratios=intervals.map(interval=>`<th scope="col" title="JI interval">${esc(interval.ratio)}</th>`).join(''),ideal=intervals.map(interval=>`<td title="JI cents">${fmt(interval.idealCents,3)}¢</td>`).join('');
 const tempered=intervals.map(interval=>`<td style="--approximation-color:${memberColor(interval)}" title="Tempered cents"${interval.description?` aria-label="${esc(interval.description)}"`:''}>${interval.temperedCents===null?'—':`${fmt(interval.temperedCents,3)}¢`}</td>`).join(''),deviations=intervals.map(interval=>`<td style="--approximation-color:${memberColor(interval)}" title="Signed deviation from JI">${interval.errorCents===null?'—':`${sign(interval.errorCents)}¢`}</td>`).join('');
 return `<table class="diamond-interval-table" aria-label="JI and tempered intervals"><thead><tr>${ratios}</tr><tr>${ideal}</tr></thead><tbody class="diamond-chord-approximation"${explanation?` title="${esc(explanation)}"`:''}><tr>${tempered}</tr><tr>${deviations}</tr></tbody></table>`;
}
function unifiedWorkspace(){const parts=harmonicWorkspace.renderParts({directory:true});return renderUnified({center:unifiedCenter,centerMarkup:unifiedCenter==='matrix'?`<div class="matrixpair single">${matrix(0)}</div>`:targetTable(),directory:unifiedDirectory(parts),detail:manualChordInspector?chordWorkspace.render():unifiedDetail(parts),scaleControls:scaleControls(),scaleMarkup:scaleDetails()});}
function targetTable(){const s=states[0];return `<div class="diamond-pair single">${diamondWorkspace.render({...settings(s),scope:diamondScope},'')}</div>`;}
// A single cell shows the one approximation it sounds (its diamondApproximation status), the
// same reading the chord readout and playback use for that cell.
function diamondDetails(cell){
 const cfg=settings(states[0]),tol=cfg.maxError??cfg.tol,status=cell.status,v=status?.approximation??null;
 const empty=v?'':status?.source==='mapping'&&!status.mappedCoordinate?'Outside temperament basis.':'No interval matches the current target display filter.';
 const intervals=[{ratio:cell.label,idealCents:cell.c,temperedCents:v?v.c:null,errorCents:v?v.error:null,
  ...(v?{description:`Tempered cents: ${fmt(v.c,3)}¢; ${v.mapped?'Mapped':'Alternative approximation'}; ${coordinate(v.m)}${status.source==='scale'&&!v.available?'; absent from this scale':''}`}:{})}];
 return `<div class="diamond-chord-heading" aria-hidden="true"></div>${diamondIntervalTable(intervals,tol)}${empty?`<p class="viewnote">${esc(empty)}</p>`:''}`;
}
function diamondChordDetails(chord){
 if(!chord)return '';
 const tuning=chord.tuning,cfg=settings(),ratio=chord.kind==='collection'?`${chord.cardinality} pitches`:chord.form==='utonal'?chord.utonal:chord.otonal;
 const heading=`<div class="diamond-chord-heading"><h4>${esc(ratio)}</h4></div>`;
 if(!tuning)return heading;
 const tol=cfg.maxError??cfg.tol,explanation=tuning.available?`Total chord error: ${fmt(tuning.totalErrorCents,3)} cents. Sum of absolute errors across all ${tuning.intervalCount} note pairs.`:'Some notes have no available approximation.';
 return `${heading}${diamondIntervalTable(tuning.intervals,tol,explanation)}${tuning.available?'':'<p class="viewnote">Some notes have no available approximation.</p>'}`;
}
function fillDiamondDetails(){
 const el=$('#diamond-detail-0');if(!el)return;
 const active=diamondWorkspace.displayCells(),chord=active.length?diamondWorkspace.chordDisplay():null,cell=el.querySelector('[data-diamond-cell-detail]'),readout=el.querySelector('[data-diamond-chord]');
 const single=active.length&&!chord?diamondDetails(active[0]):'';
 if(cell){cell.hidden=!single;cell.innerHTML=single;}else el.innerHTML=chord?diamondChordDetails(chord):single;
 if(readout){readout.innerHTML=diamondChordDetails(chord);readout.hidden=!chord;}
 el.hidden=active.length===0;
}




function syncNavigation(){
 const section=sectionFor(view);lastViews[section]=view;
 document.querySelectorAll('[role=tab][data-section]').forEach(b=>{const selected=b.dataset.section===section;b.classList.toggle('active',selected);b.setAttribute('aria-selected',String(selected));b.tabIndex=selected?0:-1;});
 for(const name of ['discover','play','create'])$('#'+name+'-view').hidden=section!==name;
 const destination=$('#'+section+'-view'),workspace=$('#analysis-explore');if(section!=='create'&&workspace.parentElement!==destination)destination.appendChild(workspace);const materialHost=$('#material-host');if(section==='create')destination.appendChild(materialHost);
 $('#workspace-title').hidden=section==='discover';$('#workspace-title').textContent='Play';
 const approximation=$('#approximation-module'),inDiscover=section==='discover';$('#approximation-settings').hidden=!inDiscover;(inDiscover?$('#approximation-settings-body'):$('#analysis-explore .sectionhead')).appendChild(approximation);$('#analysis-explore .sectionhead').hidden=inDiscover;
}
function switchSection(section){if(!Object.hasOwn(lastViews,section))return;view=lastViews[section];selected=null;stop();renderWorkspace();}
// Label changes update existing cells so scrolling, focus and matrix placement stay intact.
function refreshMatrixLabels(){
 if(view!=='matrices'&&!(view==='unified'&&unifiedCenter==='matrix'))return;
 const template=document.createElement('template');template.innerHTML=matrix();
 const cells=document.querySelectorAll('.matrix [data-cell]'),next=template.content.querySelectorAll('.matrix [data-cell]');
 cells.forEach((cell,i)=>{if(!next[i])return;cell.innerHTML=next[i].innerHTML;cell.classList.toggle('ratio-cell',$('#labels').value==='ratios');});
 document.querySelectorAll('[data-label]').forEach(b=>{const active=b.dataset.label===$('#labels').value;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 applyHarmonicFocus();
}
function parkJIControls(){const controls=$('#ji-controls'),source=$('#diamond-scope')?.closest('label');if(source&&controls){source.classList.remove('diamond-source-control');const help=$('#diamond-scope-help');if(help)help.classList.add('is-empty');controls.appendChild(source);}if(controls)$('#ji-controls-parking').appendChild(controls);const matrix=$('#matrix-controls');if(matrix)$('#matrix-controls-parking').appendChild(matrix);const labels=$('#matrix-label-controls');if(labels)$('#matrix-label-controls-parking').appendChild(labels);}
function updateDiamondScopeHelp(){const help=$('#diamond-scope-help');if(!help)return;help.textContent=diamondScope==='scale'?'Scale checks all intervals in the current scale matrix.':diamondScope==='mode'?'Mode checks tonic-relative notes in the current mode.':'';help.classList.toggle('is-empty',!help.textContent);}
function placeJIControls(v){const controls=$('#ji-controls');if(controls&&v==='targets'){const panel=document.querySelector('.diamond-pair .diamond-panel');panel?.appendChild(controls);diamondWorkspace.mountOptions();const host=$('#diamond-span-controls');if(host)host.innerHTML=spanControl(states[0],0,'Target span')||'';const source=$('#diamond-scope')?.closest('label'),canvas=panel?.querySelector('.diamond-canvas');if(source&&canvas){source.classList.add('diamond-source-control');canvas.appendChild(source);updateDiamondScopeHelp();}}}
function placeTargetControls(v){const controls=$('#target-controls');if(controls)$('#approximation-module').insertBefore(controls,$('#diamond-tolerance-host'));}
function placeMatrixControls(v){if(v!=='matrices')return;const controls=$('#matrix-controls'),host=document.querySelector('[data-matrix-controls-host]'),labels=$('#matrix-label-controls'),labelHost=document.querySelector('[data-matrix-labels-host]');if(controls&&host)host.appendChild(controls);if(labels&&labelHost)labelHost.appendChild(labels);}
function placeDiamondTolerance(v,cfg){const host=$('#diamond-tolerance-host');if(!host)return;const visible=['matrices','targets','scales','chords'].includes(v)&&!!cfg;host.hidden=!visible;host.parentElement?.classList.toggle('has-diamond-tolerance',visible);host.innerHTML=visible?renderDiamondTolerance(cfg):'';}
function syncAudioControls(){
 $('#audio-tonic').value=String(audioSettings.tonic);$('#audio-wave').value=audioSettings.wave;
}
$('#audio-tonic').onchange=e=>{
 const value=Number(e.target.value);if(!Number.isFinite(value)||value<40||value>1000){syncAudioControls();return;}
 stop();audioSettings={...audioSettings,tonic:value};renderWorkspace();
};
$('#audio-wave').onchange=e=>{
 if(!['sine','triangle','sawtooth','square'].includes(e.target.value))return;
 stop();audioSettings={...audioSettings,wave:e.target.value};
};
$('#audio-stop').onclick=()=>stop();
// keepNotes: only Play's highlight moved, so keys being played keep sounding through the redraw.
function renderWorkspace({keepNotes=false}={}){keepNotes=keepNotes===true&&view==='hexboard';syncAudioControls();if(renderingWorkspace)return;renderingWorkspace=true;try{if(sectionFor(view)==='discover')view='unified';if(view==='hexboard')syncPlayFocus();harmonicWorkspace.setEnabled(true);placeDiamondTolerance(null);parkJIControls();populateLimitOptions(Math.max(3,...states[0].basis),primeFilterForBasis(states[0].basis));syncCoverageDefaults();hexWorkspace.prepareForTemperament();if(!keepNotes)hexPlayer?.reset();diamondPlayer?.reset();syncNavigation();if(sectionFor(view)!=='create')compositionWorkspace.pause();$('#material-host').innerHTML=materialWorkspace.render();$('#material-host').hidden=sectionFor(view)!=='create';if(sectionFor(view)==='create'){$('#inspector').hidden=true;$('#workspace').innerHTML='';liveChordContext=null;compositionWorkspace.refresh();return;}const v=view,c=v==='unified'?unifiedCenterView(unifiedCenter):v;const cfg=settings();liveChordContext=v==='hexboard'?{state:states[0],settings:{...cfg,familyRecognition:true}}:null;if(liveChordContext)liveChordRecognizer.prepare(liveChordContext.state,liveChordContext.settings);document.querySelectorAll('[data-explore-body]').forEach(el=>{const idx=Number(el.dataset.exploreBody);el.innerHTML=explorerBody(states[idx],idx);});$('#inspector').hidden=['scales','chords','hexboard','targets'].includes(c)||!selected;$('#layout').disabled=c==='targets';$('#labels').disabled=c!=='matrices';document.querySelectorAll('[data-label]').forEach(b=>{b.disabled=c!=='matrices';b.classList.toggle('active',b.dataset.label===cfg.labels);b.setAttribute('aria-pressed',String(b.dataset.label===cfg.labels));});$('#targetfilter').disabled=false;$('#workspace').innerHTML=v==='hexboard'?hexWorkspace.render():unifiedWorkspace();if(v==='hexboard'){mountPlaySlots();if(keepNotes){hexPlayer?.repaint();showLiveChord();}}placeDiamondTolerance(c,cfg);placeMatrixControls(c);placeTargetControls(c);placeJIControls(c);if(c==='targets')fillDiamondDetails();if(selected&&!['scales','chords','hexboard','targets'].includes(c))inspect(...selected,false);}finally{renderingWorkspace=false;syncUnifiedPanelHeights();applyHarmonicFocus();if(view==='unified')revealDirectoryRow($('#workspace')?.querySelector('[data-unified-pane="directory"]'));}}
let commaSizeObserver;
function renderCommaSearch(){commaSizeObserver?.disconnect();const host=$('#comma-search');host.innerHTML=commaWorkspace.render();const inputs=host.querySelector('.comma-inputs'),workspace=host.querySelector('.comma-workspace');commaSizeObserver=new ResizeObserver(entries=>{const entry=entries[0],height=entry.borderBoxSize?.[0]?.blockSize??inputs.getBoundingClientRect().height;if(height>0)workspace.style.setProperty('--comma-input-height',`${Math.ceil(height)}px`);});commaSizeObserver.observe(inputs);}
function render(){
 renderPanel(0);renderCommaSearch();renderWorkspace();
}
function inspect(i,j,play=true){const s=states[0],cfg=settings(s),m=matrixScale(s);if(i>=m.n||j>m.n||(j===m.n&&cfg.layout!=='distance')){selected=null;$('#inspector').replaceChildren();$('#inspector').hidden=true;return;}const v=matrixInterval(m,i,j,cfg.layout),match=classifyTargets(s,v,allTargets(cfg.ts,s,cfg),cfg.tol);selected=[i,j];
const describe=t=>`${t.label} (${sign(t.error)} ¢${t.within?'':', outside tolerance'})`;
const text=`<b>${i} → ${v.end}${v.period?(m.periods>1?' + octave':' + period'):''}</b> &nbsp; ${fmt(v.c,4)} ¢ · ${v.k} generators.<br><span class="target-mapped">Mapped:</span> ${match.mapped.length?match.mapped.map(describe).join('; '):'none in this target set'}.<br><span class="target-hit">Other approximations:</span> ${match.hits.length?match.hits.map(t=>describe(t)+' · '+t.reason.toLowerCase()).join('; '):'none within tolerance'}.<br><button data-explore="cell" data-s="0" data-m="${Math.round((v.c-v.k*s.g)/s.p)},${v.k}">Explore a target for this interval</button>${m.periods===1?`<button data-buildchord="0,${i},${v.end}">Build a chord from this interval</button>`:''}`;$('#inspector').innerHTML=text;$('#inspector').hidden=false;if(play)playPitches([m.notes[i].c,m.notes[i].c+v.c]);}
// Create > Composition. Playback is scoped in the shared audio engine; auditions in Create never cancel it.
const compositionWorkspace=createCompositionWorkspace({document,window,
 getFocusedChord:()=>{let selection=null;try{selection=harmonicWorkspace.selection();}catch{}
  return selection?{kind:'chord',state:getLayoutStates()[0],coords:selection.voicing.voices.map(voice=>voice.coordinate),label:selection.label??'Focused chord',exact:true,harmonicSelection:selection}:null;},
 onChordFocus:coordinates=>{harmonicWorkspace.focusExternal({coordinates});},
 getRootEntries:degree=>harmonicWorkspace.rootEntriesFor({scale:'play',degree}),audio:audioEngine,getState:()=>getLayoutStates()[0],getLayout:()=>hexWorkspace.serialize().configs[0],getTonic:()=>audioSettings.tonic,getMaterial:()=>materialWorkspace.serialize(),getHost:()=>document.querySelector('.composition-suite'),notify:toast,download:(name,text,type)=>download(name,text,type),
 loadState:state=>{states[0]=validate(state);coverageSignature=scaleDefaultKey(states[0],coverageSettings(states[0]));layoutState=null;getLayoutStates();layoutState.state=validate({...layoutState.state,n:state.n,mode:state.mode});selected=null;stop();view='composition';lastViews.create='composition';render();toast('Composition setup loaded.');}});
// Fingering practice: play each fingering of the chord on the Play board, one at a time.
let fingeringUi;
const fingeringGame=createFingeringGame({getFingerings:()=>hexWorkspace.fingerings(),showFingering:index=>hexWorkspace.showFingering(index),onChange:()=>fingeringUi?.update()});
// Note → chords and Practice keep their own live panels; each Play redraw mounts them into its slots.
const playPanels={'note-chords':$('#key-harmonies'),practice:$('#fingering-game')};
function mountPlaySlots(){for(const [slot,panel] of Object.entries(playPanels)){const place=document.querySelector(`[data-play-slot="${slot}"]`);if(place&&panel)place.replaceWith(panel);}}
fingeringUi=createFingeringGameUi({game:fingeringGame,host:playPanels.practice,getFingerings:()=>hexWorkspace.fingerings(),isPlayView:()=>view==='hexboard'});
// Note → chords: the chords on the key selected on the Play board (mouse click or a HexBoard press).
const keyHarmoniesUi=createKeyHarmoniesUi({host:playPanels['note-chords'],api:{harmonies:options=>hexWorkspace.harmoniesAt(options),
 onKey:key=>{if(harmonicWorkspace.followPlaying()&&key.degree>=0)harmonicWorkspace.setBass({scale:'play',degree:key.degree});},
 onPick:(harmony,key)=>{harmonicWorkspace.chooseBass({scale:'play',degree:key.degree},harmony.rowId,harmony.member);},
showHarmony:(index,placement,options)=>hexWorkspace.showHarmony(index,placement,options),hear:keys=>hexWorkspace.hearKeys(keys)},getFingerings:()=>hexWorkspace.fingerings(),isPlayView:()=>view==='hexboard',isShown:()=>hexWorkspace.chordMode()==='notes'});
// Physical HexBoard (Web MIDI, delegated control): its keys play through the Play board's own
// pointer path, and its lights follow the layout, highlights and held keys.
const hexboardDevice=createHexboardDevice({
 onKey:(index,down,t)=>{if(down){hexboardSync.keyDown(index,t);scheduleHexboardProbe();}else hexboardSync.keyUp(index);},
 onEncoder:event=>{if(event==='press'){stop();if(view==='hexboard'){hexWorkspace.clearHighlight();renderWorkspace();}}},
 onStatus:(state,detail)=>showHexboardStatus(state,detail)});
// Physical keys press the on-screen board that is showing: the open composition's, else Play's.
const composing=()=>view==='composition'&&compositionWorkspace.open;
const hexboardSync=createHexboardSync({device:hexboardDevice,pressKey:(index,t)=>(composing()?compositionWorkspace.pressKey(index,t):hexPlayer?.pressKey(String(index),t))??false,releaseKey:index=>composing()?compositionWorkspace.releaseKey(index):hexPlayer?.releaseKey(String(index)),getSnapshot:()=>composing()?compositionWorkspace.deviceSnapshot():hexWorkspace.deviceSnapshot(),startVoice:c=>audioEngine.startVoice(c)});
// Overall LED brightness for a connected board, remembered in this browser.
const HEXBOARD_BRIGHTNESS_KEY='temperament-lab-hexboard-brightness';
function showHexboardBrightness(value){const input=$('#hexboard-brightness'),out=$('#hexboard-brightness-value'),percent=Math.round(value*100);if(input)input.value=String(percent);if(out)out.textContent=`${percent}%`;}
{let saved=null;try{saved=globalThis.localStorage?.getItem(HEXBOARD_BRIGHTNESS_KEY);}catch{}showHexboardBrightness(hexboardSync.setBrightness(saved===null?1:clampBrightness(Number(saved)/100)));}
$('#hexboard-brightness').oninput=e=>{const value=hexboardSync.setBrightness(Number(e.target.value)/100);showHexboardBrightness(value);try{globalThis.localStorage?.setItem(HEXBOARD_BRIGHTNESS_KEY,String(Math.round(value*100)));}catch{}};
// Latency probe: the board's key-to-sound time inside the app, and the audio device's own buffering.
let hexboardConnectedName='',hexboardProbeTimer=null;
function hexboardConnectedText(){
 const delay=hexboardSync.inputDelay(),output=audioEngine.outputLatency();
 const probe=delay===null?'':` · key to sound ${delay.toFixed(1)} ms in the app${output===null?'':` + ${output.toFixed(0)} ms audio output`}`;
 return `HexBoard connected${hexboardConnectedName?': '+hexboardConnectedName:''}${probe}`;
}
function scheduleHexboardProbe(){if(hexboardProbeTimer)return;hexboardProbeTimer=setTimeout(()=>{hexboardProbeTimer=null;if(!hexboardDevice.connected)return;const text=$('#hexboard-status');if(text){text.textContent=hexboardConnectedText();text.title=text.textContent;}},400);}
function showHexboardStatus(state,detail={}){
 const button=$('#hexboard-connect'),text=$('#hexboard-status');
 button.textContent=state==='connected'?'Disconnect HexBoard':'Connect HexBoard';button.disabled=state==='connecting';
 if(state==='connected')hexboardConnectedName=detail.name??'';
 const message=state==='connected'?hexboardConnectedText():state==='connecting'?'Connecting…':state==='error'?detail.message:detail.reason==='unplugged'?'HexBoard unplugged':'';
 text.textContent=message;text.title=message;
 const brightness=$('.hexboard-brightness');if(brightness)brightness.hidden=state!=='connected';
 if(state==='connected')hexboardSync.start();
 else{hexboardSync.stop();if(state==='disconnected')hexboardSync.releaseAll();if(state==='error')toast(message);}
}
$('#hexboard-connect').onclick=async()=>{
 if(hexboardDevice.connected){hexboardSync.releaseAll();hexboardDevice.disconnect();return;}
 void audioEngine.prepare().catch(()=>{});
 await hexboardDevice.connect();
};
function stop(){hexPlayer?.reset();diamondPlayer?.reset();audioEngine.stop();compositionWorkspace.stop();}
hexPlayer=createHexboardPlayer({document,window,press:node=>hexWorkspace.press(node),startVoice:audioEngine.startVoice,onActiveNotesChange:notes=>{scheduleLiveChordUpdate(notes);hexboardSync.setActive(notes);fingeringGame.onHeld(new Set(notes.map(n=>Number(n.id))));}});
diamondPlayer=createHexboardPlayer({document,window,press:node=>diamondWorkspace.press(node),startVoice:audioEngine.startVoice,onActiveNotesChange:notes=>diamondWorkspace.updatePlaying(notes),selector:'[data-diamond-key]',keyField:'diamondKey',surface:'.tonality-diamond',keyboard:true,focusOnPointer:false});
function playPitches(c){if(sectionFor(view)==='create'){hexPlayer?.reset();diamondPlayer?.reset();return audioEngine.previewChord(c);}stop();return audioEngine.playChord(c);}
function playSequence(notes){if(sectionFor(view)==='create'){hexPlayer?.reset();diamondPlayer?.reset();return audioEngine.previewSequence(notes);}stop();return audioEngine.playSequence(notes);}
function playScale(idx=0){const s=states[idx];return playSequence([...scale(s).notes.map(v=>v.c),s.p]);}
function download(name,text,type='text/plain'){const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
document.addEventListener('toggle',e=>presetWorkspace.toggle(e.target),true);
document.addEventListener('input',e=>{if(harmonicWorkspace.input(e.target))return;if(hexWorkspace.input(e.target))return;presetWorkspace.input(e.target);});
document.addEventListener('change',e=>{if(compositionWorkspace.change(e.target))return;if(harmonicWorkspace.change(e.target))return;if(e.target.dataset.diamondTolerance!==undefined){const value=clampTolerance(e.target.value);if(e.target.value.trim()===''||value===null){e.target.value=String(settings().tol);return;}manualTolerance=value;renderWorkspace();return;}if(e.target.dataset.diamondSetting&&diamondWorkspace.change(e.target))return;if(e.target.hasAttribute('data-diamond-scope')){diamondScope=['mapping','scale','mode'].includes(e.target.value)?e.target.value:'mapping';renderWorkspace();return;}if(e.target.hasAttribute('data-scale-filter')){scaleFilter=e.target.value;render();return;}if(materialWorkspace.change(e.target))return;if(presetWorkspace.change(e.target))return;if(hexWorkspace.change(e.target))return;if(e.target.dataset.matrixSpan!==undefined){const idx=Number(e.target.dataset.matrixSpan);states[idx].matrixOctave=e.target.value==='octave';matrixPages[idx]=[0,0];selected=null;$('#inspector').replaceChildren();$('#inspector').hidden=true;renderWorkspace();return;}if(commaWorkspace.change(e.target))return;if(chordWorkspace.change(e.target))return;if(e.target.dataset.exploreField){changeExplore(e.target);return;}if(e.target.dataset.optimizePeriod!==undefined){const idx=Number(e.target.dataset.optimizePeriod);applyPanelTuning(idx,{...tuningConfig(states[idx]),fixed:!e.target.checked});return;}const tunePanel=e.target.closest('.advanced-tuning-options');if(tunePanel&&e.target.dataset.tune){applyPanelTuning(Number(tunePanel.dataset.s),readTuning(tunePanel));return;}const f=e.target.dataset.field;if(!f)return;const idx=Number(e.target.dataset.s),old=structuredClone(states[idx]);try{let s=states[idx];if(f==='preset'){if(e.target.value==='custom'){s.key='custom';s.name='Custom temperament';s.tuning='Manual';}else states[idx]=withDefaultScale(makeState(e.target.value),toast,coverageSettings(makeState(e.target.value)));}else if(f==='tuning'){const cfg={...tuningConfig(s),method:e.target.value};applyPanelTuning(idx,cfg);return;}else {s[f]=Number(e.target.value);if(f==='n')s.mode=0;if(f==='g'||f==='p'){s.tuneConfig=tuningConfig(s);if(f==='p')s.tuneConfig.period=s.p;s.tuning='Manual';}}delete states[idx].tuningReport;validate(states[idx]);render();}catch(err){states[idx]=old;toast(err.message);render();}});
document.addEventListener('click',e=>{for(const open of document.querySelectorAll('.app-header details[open]'))if(!open.contains(e.target))open.open=false;if(compositionWorkspace.click(e.target))return;if(e.target.closest?.('[data-harmony-action="select"], [data-harmony-action="directory-recent"]'))manualChordInspector=false;if(harmonicWorkspace.click(e.target))return;if(e.target.closest?.('[data-diamond-tolerance-reset]')){manualTolerance=null;renderWorkspace();return;}if(e.target.closest?.('[data-diamond-action], [data-diamond-preset]')&&diamondWorkspace.click(e.target))return;if(hexWorkspace.click(e.target,e.shiftKey))return;const b=e.target.closest('button');if(!b)return;if(b.dataset.scaleMilestone){const milestones=findScaleMilestones(states[0],coverageSettings(states[0])),result=milestones[b.dataset.scaleMilestone];if(!result)return;states[0]=validate({...states[0],n:result.n,mode:result.mode??0});selected=null;stop();view='unified';renderWorkspace();return;}if(materialWorkspace.click(b))return;if(b.dataset.scaleAction){if(b.dataset.scaleAction==='collect')materialWorkspace.addScale();else placeMaterial({kind:'scale',coords:scale(states[0]).notes.map(n=>[Math.round((n.c-n.k*states[0].g)/states[0].p),n.k]),label:`${states[0].n} notes · mode ${states[0].mode+1}`});return;}if(b.dataset.section){switchSection(b.dataset.section);return;}if(presetWorkspace.click(b))return;if(b.dataset.hexOpen!==undefined){getLayoutStates();layoutState.state.n=states[0].n;layoutState.state.mode=states[0].mode;hexWorkspace.clearHighlight();view='hexboard';renderWorkspace();$('#workspace').scrollIntoView({behavior:'smooth',block:'start'});return;}if(b.dataset.matrixPage){const [,axis,page]=b.dataset.matrixPage.split(',').map(Number);matrixPages[0][axis]=page;renderWorkspace();return;}if(commaWorkspace.click(b))return;if(chordWorkspace.click(b))return;try{if(b.dataset.buildchord){const [idx,i,j]=b.dataset.buildchord.split(',').map(Number);chordWorkspace.fromInterval(i,j);manualChordInspector=true;view='unified';renderWorkspace();}else if(b.dataset.unifiedCenter){unifiedCenter=normalizeUnifiedCenter(b.dataset.unifiedCenter);selected=null;renderWorkspace();}else if(b.dataset.label){$('#labels').value=b.dataset.label;refreshMatrixLabels();}else if(b.dataset.explore){handleExplore(b);}else if(b.dataset.cell){const [i,j]=b.dataset.cell.split(',').map(Number);if(e.shiftKey)pickMatrixCell(i,j);else{if(matrixChordCells.size){matrixChordCells.clear();applyHarmonicFocus();}inspect(i,j);}}else if(b.dataset.target){const [,n,d]=b.dataset.target.split(',').map(Number),m=mapRatio(n,d,states[0]);playPitches([0,m[0]*states[0].p+m[1]*states[0].g]);}else if(b.dataset.note){const degree=Number(b.dataset.note);playPitches([scale(states[0]).notes[degree].c]);/* A degree on the scale line also becomes the directory's bass note. */if(b.classList.contains('scale-line-note')){harmonicWorkspace.setBass({scale:'discover',degree});for(const dot of document.querySelectorAll('.scale-line-note'))dot.classList.toggle('is-bass',Number(dot.dataset.note)===degree);}}else if(b.dataset.action){const idx=0,s=states[0],panel=$('#temperament-panel');if(b.dataset.action==='scale')playScale(idx);if(b.dataset.action==='export'){if(scale(s).collision)throw Error('Choose a scale without pitch collisions before exporting.');download(`${s.name.replace(/[^a-z0-9]/gi,'-')}-${s.n}.scl`,`! Temperament Lab\n${stateName(s)}; ${s.tuning}; ${periodDescription(s)}; generator ${s.g} cents\n${s.n}\n!\n${[...scale(s).notes.slice(1).map(v=>v.c),s.p].map(v=>v.toFixed(8)).join('\n')}\n`);}if(b.dataset.action==='mapping'){const basis=panel.querySelector('[data-custom=basis]').value.trim().split(/[\s,.]+/).map(Number),rows=panel.querySelector('[data-custom=rows]').value.trim().split('\n').map(r=>r.trim().split(/[\s,]+/).map(Number));const next={...s,key:'custom',name:'Custom temperament',generatorLabel:'',basis,rows,commas:'custom mapping',tuning:'Manual',assignments:[],explore:undefined};if(basis[0]!==s.basis[0]||rows[0]?.[0]!==s.rows[0][0]){next.p=purePeriod(next)*s.p/purePeriod(s);next.g=s.g/s.p*next.p;}validate(next);states[idx]=next;render();toast('Custom mapping applied; choose a tuning next');}}}catch(err){toast(err.message);}});
$('#labels').addEventListener('change',refreshMatrixLabels);
['layout','targetfilter'].forEach(id=>$('#'+id).addEventListener('change',renderWorkspace));
$('#limit').addEventListener('change',()=>{const input=$('#limit');try{validateJILimits({oddLimit:Number(input.value)});input.setCustomValidity('');renderWorkspace();}catch(error){input.setCustomValidity(error.message);input.reportValidity();input.value=String(DEFAULT_ODD_LIMIT);input.setCustomValidity('');renderWorkspace();}});
$('#primeLimit').addEventListener('change',()=>{const input=$('#primeLimit');try{parsePrimeFilterInput(input.value,states[0].basis);delete input.dataset.basisValue;input.setCustomValidity('');renderWorkspace();}catch(error){input.setCustomValidity(error.message);input.reportValidity();input.value='basis';input.setCustomValidity('');}});
$('#reset').onclick=()=>{harmonicWorkspace.restore(null);manualChordInspector=false;diamondWorkspace.restore(null);diamondScope='mapping';manualTolerance=null;$('#limit').value=String(DEFAULT_ODD_LIMIT);$('#primeLimit').value='basis';$('#targetfilter').value='mapped';scaleFilter='2';stop();view='unified';lastViews.discover='unified';unifiedCenter='diamond';lastViews.play='hexboard';lastViews.create='composition';layoutState=null;materialWorkspace.restore(null);compositionWorkspace.restore(null);states=[withDefaultScale(makeState('meantone'))];chordWorkspace.restore(null,validate);commaWorkspace.restore(null);hexWorkspace.restore(null);selected=null;render();};
function restorePrimaryState(data){if(!Array.isArray(data.states)||![1,2].includes(data.states.length))throw Error('Choose a Temperament Lab session file.');const state=data.states[0];validate(state);return {...state,key:presets[state.key]?state.key:'custom',tuning:typeof state.tuning==='string'?state.tuning:'Manual'};}
$('#save').onclick=()=>download('temperament-lab-session.json',JSON.stringify({format:sessionFormat(compositionWorkspace.serialize()),workflowVersion:8,harmonicCatalogue:harmonicWorkspace.serialize(),states:[states[0]],material:materialWorkspace.serialize(),diamond:diamondWorkspace.serialize(),layoutScale:{n:getLayoutStates()[0].n,mode:getLayoutStates()[0].mode},chords:chordWorkspace.serialize(),commaSearch:commaWorkspace.serialize(),hexboard:hexWorkspace.serialize(),settings:{scaleFilter,diamondScope,view,unifiedCenter,lastViews:{...lastViews},targetfilter:$('#targetfilter').value,showoutside:true,layout:$('#layout').value,labels:$('#labels').value,limit:$('#limit').value,primeLimit:$('#primeLimit').value===$('#primeLimit').dataset?.basisValue?'basis':$('#primeLimit').value,manualTolerance,tonic:audioSettings.tonic,wave:audioSettings.wave},...compositionForSave(compositionWorkspace.serialize())},null,2),'application/json');
$('#load').onclick=()=>$('#file').click();$('#file').onchange=async e=>{try{const f=e.target.files[0];if(!f)return;if(f.size>8000000)throw Error('Session file is too large.');const data=JSON.parse(await f.text());if(!isSessionFormat(data.format))throw Error('Choose a Temperament Lab session file.');const composition=compositionFromSession(data);harmonicWorkspace.restore(data.harmonicCatalogue);// Ignore the legacy A/B preference; discovery is now the only catalogue mode.
manualChordInspector=false;diamondWorkspace.restore(data.diamond);chordWorkspace.restore(data.chords,validate);commaWorkspace.restore(data.commaSearch);hexWorkspace.restore(data.hexboard);scaleFilter=['all','2','3'].includes(data.settings?.scaleFilter)?data.settings.scaleFilter:'2';diamondScope=normalizeDiamondScope(data.settings?.diamondScope,data.workflowVersion);states=[restorePrimaryState(data)];const restorePrimeLimit=Number(data.workflowVersion??0)<5&&(data.settings?.primeLimit===undefined||data.settings.primeLimit==='')?'basis':data.settings?.primeLimit;$('#primeLimit').value='basis';manualTolerance=Number(data.workflowVersion??0)>=7&&data.settings?.manualTolerance!=null&&Number.isFinite(Number(data.settings.manualTolerance))?clampTolerance(data.settings.manualTolerance):null;if(data.settings)for(const id of ['layout','labels','limit','primeLimit','targetfilter']){const el=$('#'+id),v=id==='primeLimit'?restorePrimeLimit:data.settings[id];if(v!==undefined&&(el.tagName!=='SELECT'||[...el.options].some(o=>o.value===String(v))))el.value=v;}audioSettings={tonic:Math.max(40,Math.min(1000,Number(data.settings?.tonic)||220)),wave:['triangle','sine','sawtooth','square'].includes(data.settings?.wave)?data.settings.wave:'triangle'};lastViews.discover='unified';lastViews.play='hexboard';lastViews.create='composition';unifiedCenter=normalizeUnifiedCenter(data.settings?.unifiedCenter??(data.settings?.view==='matrices'?'matrix':null));view=['hexboard','composition'].includes(data.settings?.view)?data.settings.view:'unified';materialWorkspace.restore(data.material??(data.chords?.pins||[]).map(pin=>({kind:'chord',state:pin.state,label:pin.name,coords:pin.degrees.map(i=>{const n=scale(pin.state).notes[i];return [Math.round((n.c-n.k*pin.state.g)/pin.state.p)+(pin.octaves?.[i]||0),n.k];})})));coverageSignature=scaleDefaultKey(states[0],coverageSettings(states[0]));layoutState=null;getLayoutStates();if(data.layoutScale){layoutState.state=validate({...layoutState.state,n:data.layoutScale.n,mode:data.layoutScale.mode});}if(data.hexboard?.configs)hexWorkspace.preserveCurrentLayout();selected=null;stop();compositionWorkspace.restore(composition);render();toast('Session opened');}catch(err){toast(err.message);}e.target.value='';};
document.addEventListener('keydown',e=>{if(compositionWorkspace.keydown(e,view==='composition'))return;if(e.key==='Enter'&&e.target.dataset?.hexSearchText!==undefined){e.preventDefault();document.querySelector('[data-hex-action="chord-search"]')?.click();return;}const tab=e.target.closest?.('[role=tab][data-section]');if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const sections=['discover','play','create'],section=e.key==='Home'?'discover':e.key==='End'?'create':sections[(sections.indexOf(tab.dataset.section)+(e.key==='ArrowRight'?1:sections.length-1))%sections.length];switchSection(section);$('#tab-'+section).focus();return;}if(e.key==='Escape'){stop();if(view==='hexboard'){hexWorkspace.clearHighlight();renderWorkspace();}return;}if(e.target.closest?.('[data-hex-key]')&&['Enter',' '].includes(e.key)){e.preventDefault();return;}});
render();
void presetWorkspace.init();

function explorer(s,idx){return `<div class="target-explorer" data-explorer="${idx}"><div data-explore-body="${idx}">${explorerBody(s,idx)}</div></div>`;}
function explorerBody(s,idx){
 const cfg={ratio:tuningConfig(s).pure||'5/4',...s.explore},list=s.assignments||[];let t,cs=[],chosen,error='';try{t=target(cfg.ratio||'5/4');cs=candidates(s,t);chosen=cs.find(c=>same(c.m,cfg.m))||cs.find(c=>c.mapped)||cs[0];if(cfg.m&&!cs.some(c=>same(c.m,cfg.m))){const m=assignment(t,cfg.m).m,c=m[0]*s.p+m[1]*s.g;chosen={m,c,error:c-t.c,available:false,mapped:same(m,mapRatio(t.n,t.d,s))};cs.push(chosen);}}catch(e){error=e.message;}
 const check=checkAssignments(s,list),m=t&&mapRatio(t.n,t.d,s),draft=chosen&&checkAssignments(s,[...list.filter(x=>x.label!==t.label),assignment(t,chosen.m)]);
 const pill=status=>status==='compatible'?'good':status==='conflict'?'bad':'dim';
 return `<p>Pick a ratio and the interval you want to use for it. Other approximations stay available even when they disagree with the mapping.</p><label>JI target<input data-explore-field="ratio" data-s="${idx}" value="${esc(cfg.ratio||'5/4')}" placeholder="7/4"></label>${error?`<p role="status" class="bad">${esc(error)}</p>`:`<label>Interval to use<select data-explore-field="choice" data-s="${idx}">${cs.map(c=>option(c.m.join(','),`${fmt(c.c,3)} ¢ · ${sign(c.error)} ¢ error · ${c.mapped?'Mapped':m?'Alternative':'Outside subgroup'}${c.available?'':' · absent from this scale'} · ${coordinate(c.m)}`,chosen.m.join(','))).join('')}</select></label><p>${m?`Mapped interval: ${esc(coordinate(m))}.`:'This ratio is outside the current subgroup.'} Search covers ascending intervals in this ${s.n}-note scale plus the mapped interval.</p><details><summary>Enter coordinates directly</summary><div class="formrow"><label>Periods<input type="number" step="1" data-explore-field="a" data-s="${idx}" value="${chosen.m[0]}"></label><label>Generators<input type="number" step="1" data-explore-field="b" data-s="${idx}" value="${chosen.m[1]}"></label></div></details><p class="${pill(draft.status)}" role="status">${esc(draft.message)}</p>${draft.detail?`<details><summary>Why?</summary><p>${esc(draft.detail)}</p></details>`:''}<div class="panelactions"><button data-explore="listen" data-s="${idx}">▶ Hear interval</button><button data-explore="pure" data-s="${idx}" class="primary">Use this target</button><button data-explore="add" data-s="${idx}">Add assignment</button></div><p>Changing the target or its coordinates retunes immediately. Period settings above apply. Tuning does not adopt a mapping.</p>`}
 ${cfg.notice?`<p class="tuning-report" role="status">${esc(cfg.notice)}</p>`:''}
 ${list.length?`<div class="assignment-list"><b>Selected assignments</b>${list.map((x,i)=>{const c=x.m[0]*s.p+x.m[1]*s.g,available=candidates(s,x).some(v=>same(v.m,x.m)&&v.available);return `<div><span>${esc(x.label)} → ${esc(coordinate(x.m))}<br>${fmt(c,3)} ¢ · ${sign(c-x.c)} ¢ error${available?'':' · absent from this scale'}</span><button data-explore="remove" data-s="${idx}" data-i="${i}" aria-label="Remove ${esc(x.label)} assignment">Remove</button></div>`;}).join('')}<p class="${pill(check.status)}" role="status">${esc(check.message)}</p>${check.detail?`<details><summary>Explain conflict or limitation</summary><p>${esc(check.detail)}</p></details>`:''}<div class="panelactions"><button data-explore="adopt" data-s="${idx}" ${check.status==='compatible'&&check.extended?'':'disabled'}>Adopt extension</button><button data-explore="pureall" data-s="${idx}">Use all assignments</button></div>${check.status==='compatible'&&check.extended?`<details><summary>Implied target assignments after extension</summary>${impliedTargets({...s,basis:check.basis,rows:check.rows},s)}</details>`:''}</div>`:''}
 <details><summary>Check nearest approximations in this scale</summary>${nearestSummary(s)}<p>This checks the selected odd-limit targets against the current mapping and finite scale. It is not a consistency verdict for every interval of the infinite tuning. Equal pitches at different generator coordinates remain distinct here.</p><a href="https://en.xen.wiki/w/Consistency" target="_blank" rel="noreferrer">About consistency</a></details>`;
}
function impliedTargets(next,old){return `<div class="tablewrap"><table><thead><tr><th>Target</th><th>Coordinates</th><th>Error</th></tr></thead><tbody>${settings(next).ts.filter(t=>!mapRatio(t.n,t.d,old)&&mapRatio(t.n,t.d,next)).map(t=>{const m=mapRatio(t.n,t.d,next);return `<tr><td>${t.label}</td><td>${coordinate(m)}</td><td>${sign(m[0]*next.p+m[1]*next.g-t.c)} ¢</td></tr>`;}).join('')}</tbody></table></div><p>Related ratios through odd limit 13, using the current tuning.</p>`;}
function nearestSummary(s){const r=nearestReport(s,settings(s).ts);return `<p>${r.mapped} targets in the mapping; ${r.alternative} have a strictly closer alternative in this scale; ${r.absent} have their mapped interval absent. ${r.outside} targets are outside the subgroup.</p>`;}
function explorerSelection(idx){return jiSelection(states[idx]);}
function changeExplore(el){const idx=Number(el.dataset.s),s=states[idx];try{s.explore={...s.explore,notice:''};if(el.dataset.exploreField==='ratio'){s.explore.ratio=el.value;delete s.explore.m;}else if(el.dataset.exploreField==='choice')s.explore.m=el.value.split(',').map(Number);else{const old=explorerSelection(idx);s.explore.m=[...old.m];s.explore.m[el.dataset.exploreField==='a'?0:1]=Number(el.value);}applyPanelTuning(idx,{...tuningConfig(s),method:'JI Target',jiAll:false});}catch(e){toast(e.message);}}
function handleExplore(b){const idx=Number(b.dataset.s),s=states[idx],action=b.dataset.explore;s.explore={...s.explore,open:true,notice:''};if(action==='open'){applyPanelTuning(idx,{...tuningConfig(s),method:'JI Target'});return;}if(action==='cell'){view='unified';s.explore.m=b.dataset.m.split(',').map(Number);const c=s.explore.m[0]*s.p+s.explore.m[1]*s.g,ji=settings(s);s.explore.ratio=near(c,allTargets(ji.ts,s,ji)).label;applyPanelTuning(idx,{...tuningConfig(s),method:'JI Target',jiAll:false});$('#tuning-panel').querySelector('.advanced-tuning-options').open=true;$('#tuning-panel').querySelector('.target-explorer').scrollIntoView({block:'center',behavior:'smooth'});return;}
 if(action==='remove'){s.assignments.splice(Number(b.dataset.i),1);if(tuningConfig(s).jiAll)applyPanelTuning(idx,{...tuningConfig(s),jiAll:s.assignments.length>0});else render();return;}
 if(action==='adopt'){const result=checkAssignments(s,s.assignments||[]);if(result.status!=='compatible'||!result.extended)throw Error('There is no complete compatible extension to adopt.');const next={...s,basis:result.basis,rows:result.rows,key:'custom',name:s.name+' extension',commas:'custom mapping',tuning:'Manual',generatorLabel:'',tuningReport:'Mapping extended from selected assignments. Period and generator tuning retained.'};next.explore.notice='Extension adopted. Related targets now follow the extended mapping.';validate(next);states[idx]=next;render();return;}
 const t=explorerSelection(idx);s.explore.m=[...t.m];if(action==='listen'){playPitches([0,t.m[0]*s.p+t.m[1]*s.g]);return;}
 if(action==='add'){const list=(s.assignments||[]).filter(x=>x.label!==t.label);if(list.length>=64)throw Error('Use at most 64 assignments.');s.assignments=[...list,t];if(tuningConfig(s).jiAll){applyPanelTuning(idx,tuningConfig(s));return;}}
 if(action==='pure'||action==='pureall'){applyPanelTuning(idx,{...tuningConfig(s),method:'JI Target',jiAll:action==='pureall'});return;}
 render();
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)compositionWorkspace.pause();});
window.addEventListener('pagehide',()=>compositionWorkspace.pause());
window.addEventListener('pagehide',()=>{hexboardSync.releaseAll();hexboardDevice.disconnect();});
// The practice panels follow the view in the same event as the switch, so the Play page renders once, fully
// formed, and nothing is left behind on Discover. (Registered last, so the app's own handlers have already run.)
for(const type of ['click','keydown','change'])document.addEventListener(type,()=>{fingeringUi.update();keyHarmoniesUi.update();});
// The header floats over the page; its height lets sticky panes and scroll targets clear it.
{const header=document.querySelector('.app-header'),setHeaderHeight=()=>document.documentElement.style.setProperty('--header-h',header.offsetHeight+'px');if(header){setHeaderHeight();if(typeof ResizeObserver==='function')new ResizeObserver(setHeaderHeight).observe(header);}}
