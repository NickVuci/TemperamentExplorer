import {createLayoutPresets} from './layout-presets.mjs';
import {layoutPresetForState,layoutPresetConfigKey,mappingKey,layoutKey} from './layout-preset-data.mjs';
import {createLayoutChooser} from './layout-chooser.mjs';
import {BUILTIN_LAYOUTS,builtinLayoutsFor} from './builtin-layouts.mjs';
import {findScaleMilestones,scaleDefaultKey} from './scale-milestones.mjs';
import {createChordCatalogueWorkspace} from './chord-catalog-ui.mjs';
import {createHarmonicPlayWorkspace} from './harmonic-play-ui.mjs';
import {validatePeriodPlacement,validateCopyPeriodStep} from './hexboard-wrapping.mjs';
import {tuningIdentity} from './material-ui.mjs';
import {palettes,validColor,mosLayers,keyColor,textColor} from './hexboard-colors.mjs';

// One highlight rule for the screen board and the physical LEDs: a highlight changes no colour and
// leaves every other key as it was; only the highlighted keys shine a level brighter (on screen a
// brightness filter, on the board the next LED level). tone is the key's place in a highlighted
// chord (0 is its root), -1 otherwise.
export function keyAppearance(k,i,{colors,overlay,scaleOn,chord=[]}){
 const layoutColor=k.conflict?'#ad6262':keyColor(k,colors),tone=overlay?.keys.indexOf(i)??-1;
 const scaleTone=!!(scaleOn&&k.enabled&&scaleOn.gens.includes(k.m[1]-scaleOn.shift)),marked=tone>=0||chord.includes(i);
 return {layoutColor,fill:layoutColor,tone,scaleTone,marked,lit:marked||scaleTone};
}
import {inspectCoordinateChord} from './harmonic-inspection.mjs';
import {renderCoordinateAssessment} from './harmonic-inspection-ui.mjs';
import {chordPlacements,discoverBoardChords,chordsWithKey} from './hexboard-chords.mjs';
import {MAX_CHORD_TONES} from './chord-identity-v2.mjs';
import {DEFAULT_ODD_LIMIT,scale,scaleChoices,MAX_SCALE_SIZE,mapRatio} from './engine.mjs';
import {formatPrimeFilter,validateJILimits} from './ji-limit-engine.mjs';
import {baseOptions,flipPlacementVector,migrateLayoutMirrors,buildBoard,layoutCandidates,boardMatches,exportHexboard,fillBoard,cents,commands} from './hexboard.mjs';
import {mod} from './pitch.mjs';
import {equivalencePolicy,quotientCoordinate} from './harmonic-equivalence.mjs';
import {frequencyFor} from './audio.mjs';
import {esc,option} from './ui.mjs';
const fmt=(x,n=3)=>Number(x).toFixed(n);
const signed=x=>(x>=0?'+':'')+x;
const defaults=()=>({periodWrapping:true,showPeriodLabels:false,periodPlacement:null,copyPeriodStep:1,registerAlignment:'scale',base:7,scaleFilter:'2',offset:0,style:'bosanquet',rotation:0,mirror:false,flipHorizontal:false,flipVertical:false,center:65,register:0,deviceRotation:1,outside:false,ap:1,ag:0,bp:0,bg:1,tolerance:10,limit:DEFAULT_ODD_LIMIT,primeLimit:null,root:65,selected:65,chord:[],selectChord:false,palette:'spectrum',layerGrowth:'balanced',layerColors:{},keyColors:{},degreeColors:{}});
const validColorMap=(map,min,max,excluded)=>map&&typeof map==='object'&&!Array.isArray(map)&&Object.entries(map).every(([n,v])=>/^\d+$/.test(n)&&Number(n)>=min&&Number(n)<=max&&!excluded?.has(Number(n))&&validColor(v));
// matchPlayed reads held keys against the harmony directory (harmony mode B); null keeps the
// curated recognizer's reading.
export function createHexboardWorkspace({matchPlayed=()=>null,getJI,setJI,getStates,play,refresh,onCatalogueRefresh=refresh,notify,download,getHz,onCollect,onInspect,getHarmonicMode=()=>false,getBassEntries=()=>[],onBrowseHarmony=()=>{},onFitHarmonicScale=()=>{},request=globalThis.fetch}){
 const freshFinder=()=>({size:3,reach:4,other:false,groups:[],selected:-1,placement:0,searched:false,limited:false,signature:'',imported:null});
 let scaleHighlight=null,catalogueHighlight=null,coverageKey=null,keepRestoredBase=false;
 const refreshLayoutChooser=()=>{const doc=globalThis.document,host=doc?.querySelector('.layout-recommendations');if(!host)return;const active=doc.activeElement,editing=active?.dataset?.layoutName!==undefined,selection=editing?[active.selectionStart,active.selectionEnd]:null;const cfg=config(),saved=savedLayouts.catalog();host.outerHTML=chooser.markup(state(),cfg,saved,'chooser');const options=doc.querySelector('.layout-recommendation-options');if(options)options.outerHTML=chooser.markup(state(),cfg,saved,'advanced');if(editing){const input=doc.querySelector('[data-layout-name]');if(input&&!input.disabled){input.focus({preventScroll:true});if(selection[0]!=null)input.setSelectionRange(...selection);}}};
 const chooser=createLayoutChooser();
 const savedLayouts=createLayoutPresets({refresh:refreshLayoutChooser,notify,request});
 // A layout record by id: a built-in layout or one of the site's saved layouts.
 const presetById=id=>BUILTIN_LAYOUTS.find(p=>p.id===id)??savedLayouts.catalog().items.find(p=>p.id===id);
 let colorScope='key',configs=[defaults()],suggestions=[],suggestionSignature='',finders=[freshFinder()],defaultScope='',buttonColorContext=null;
 const state=()=>getStates()[0];
 const catalogue=createChordCatalogueWorkspace({getState:state,getSettings:s=>getJI?getJI(s):{limit:config().limit,primeLimit:config().primeLimit,tol:config().tolerance},setSettings:setJI,getBoard:()=>buildBoard(state(),config()),getNear:()=>config().center,refresh:onCatalogueRefresh,notify,play,onCollect,onInspect,onHighlight:value=>{catalogueHighlight=value;if(value){scaleHighlight=null;finders.forEach(f=>{f.selected=-1;f.imported=null;});}}});

 const harmonicPlay=createHarmonicPlayWorkspace({getState:state,getBoard:()=>buildBoard(state(),config()),getNear:()=>config().center,refresh,notify,play,onCollect,onBrowse:onBrowseHarmony,onFitScale:onFitHarmonicScale,onHighlight:value=>{catalogueHighlight=value;scaleHighlight=null;}});
 let lastHarmonicMode=false;
 function syncHarmonicMode(){const mode=!!getHarmonicMode();if(mode===lastHarmonicMode)return;lastHarmonicMode=mode;if(mode)catalogue.destroy();else harmonicPlay.suspend();catalogueHighlight=null;}
 function config(){const s=state(),cfg=configs[0],bs=baseOptions(s);if(getJI){const ji=getJI(s);cfg.limit=ji.limit;cfg.primeLimit=ji.primeLimit??null;cfg.tolerance=ji.tol;}const target=getJI?{limit:cfg.limit,primeLimit:cfg.primeLimit}:undefined,defaultKey=scaleDefaultKey(s,target);// The automatic base follows mapping and JI-target changes, never a retuning.
if(defaultKey!==coverageKey){const coverage=findScaleMilestones(s,target);if(!keepRestoredBase&&bs.some(v=>v.n===coverage.intervalMOS?.n)){cfg.base=coverage.intervalMOS.n;cfg.offset=0;}coverageKey=defaultKey;keepRestoredBase=false;}if(!bs.some(v=>v.n===cfg.base))cfg.base=(bs.find(v=>v.n===7)||bs.filter(v=>v.n<s.n).at(-1)||bs[0])?.n||2;if(!bs.length&&['bosanquet','compressed'].includes(cfg.style))cfg.style='period';cfg.base=Math.min(cfg.base,s.n);cfg.offset=Math.max(0,Math.min(cfg.offset,s.n-cfg.base));return cfg;}
 function buttonColorContextKey(){const s=state(),cfg=config();return JSON.stringify([mappingKey(s),s.n,s.mode,layoutKey(cfg),cfg.layerGrowth]);}
 function rememberButtonColorContext(){buttonColorContext=buttonColorContextKey();}
 function syncButtonColorContext(){const next=buttonColorContextKey();if(buttonColorContext!==null&&buttonColorContext!==next){config().keyColors={};config().degreeColors={};}buttonColorContext=next;}
 function prepareForTemperament(){syncButtonColorContext();const status=savedLayouts.catalog().status;if(status==='idle'){if(globalThis.document)void initLayouts();return false;}if(status==='ready'||status==='error')return applyDefaultForCurrentMapping(false);return false;}
 function render(){syncHarmonicMode();prepareForTemperament();const cfg=config(),s=state(),bs=baseOptions(s),sizes=scaleChoices(s,cfg.scaleFilter);let b,error='';try{b=buildBoard(s,cfg);}catch(e){error=e.message;}
 if(b&&!getHarmonicMode())catalogue.sync();
 if(b?.wrapping&&!b.keys[cfg.root]?.enabled)cfg.root=b.keys.find(k=>k.enabled&&k.degree===0)?.index??b.keys.find(k=>k.enabled)?.index??cfg.root;
 const signature=JSON.stringify([s,cfg]);if(signature!==suggestionSignature)suggestions=[];
 const midiRoot=69+12*Math.log2(getHz()/440),midiOutside=b?.keys.filter(k=>k.enabled&&(midiRoot+k.c/100<0||midiRoot+k.c/100>=128)).length||0,previewOutside=b?.keys.filter(k=>k.enabled&&(getHz()*2**(k.c/1200)<15||getHz()*2**(k.c/1200)>16000)).length||0;
 return `<div class="hex-workspace">${chooser.markup(state(),cfg,savedLayouts.catalog(),'chooser')}<details class="layout-settings" ${globalThis.document?.querySelector('.hex-workspace .layout-settings')?.open?'open':''}><summary>Advanced Layout Options</summary>${chooser.markup(state(),cfg,savedLayouts.catalog(),'advanced')}<div class="hex-controls hex-primary-controls hex-top-controls"><label class="hex-instrument-control"><span>Instrument</span><select data-instrument><option value="hexboard" selected>HexBoard</option><option value="lumatone" disabled>Lumatone (Coming soon)</option><option value="linnstrument" disabled>LinnStrument (Coming soon)</option><option value="miso" disabled>Miso (Coming soon)</option><option value="axis" disabled>Axis (Coming soon)</option></select></label><label><span>Target scale</span><select data-hex-field="target">${sizes.map(x=>option(x.n,`${x.n} · ${x.signature}${x.retained?' · current (outside filter)':''}`,s.n)).join('')}</select></label><label><span>Target mode</span><select data-hex-field="mode">${Array.from({length:s.n},(_,i)=>option(i,`${i+1} / ${s.n}`,s.mode)).join('')}</select></label><label><span>Base subset</span><select data-hex-field="base">${(bs.length?bs:[{n:cfg.base,signature:'Generator subset'}]).map(v=>option(v.n,`${v.n} · ${v.signature}`,cfg.base)).join('')}</select></label><label><span>Base subset position</span><select data-hex-field="offset">${Array.from({length:Math.max(1,s.n-cfg.base+1)},(_,i)=>option(i,`${i+1} / ${s.n-cfg.base+1}`,cfg.offset)).join('')}</select></label><label><span>Musical rotation</span><select data-hex-field="rotation">${Array.from({length:6},(_,i)=>option(i,`${i*60}°`,cfg.rotation)).join('')}</select></label><label><span>Board orientation</span><select data-hex-field="deviceRotation">${Array.from({length:4},(_,i)=>option(i,`${i*90}°`,cfg.deviceRotation)).join('')}</select></label><button type="button" class="hex-toggle-button" data-hex-toggle="flipHorizontal" aria-pressed="${cfg.flipHorizontal?'true':'false'}">Flip horizontal axis</button><button type="button" class="hex-toggle-button" data-hex-toggle="flipVertical" aria-pressed="${cfg.flipVertical?'true':'false'}">Flip vertical axis</button></div>
 ${wrappingControls(cfg,b)}
 <details class="scale-advanced" ${globalThis.document?.querySelector('.hex-workspace .scale-advanced')?.open?'open':''}><summary>Advanced options</summary><div class="hex-controls"><label>Scales<select data-hex-field="scaleFilter">${option('all','All',cfg.scaleFilter)}${option('2','2 step sizes',cfg.scaleFilter)}${option('3','3 step sizes',cfg.scaleFilter)}</select></label><label>Layout family<select data-hex-field="style">${option('bosanquet','Bosanquet · L and L − s',cfg.style)}${option('compressed','Compressed · L + s and L',cfg.style)}${option('period','Period and generator',cfg.style)}${option('manual','Custom musical axes',cfg.style)}</select></label><label class="checklabel"><input type="checkbox" data-hex-field="outside" ${cfg.outside&&!cfg.periodWrapping?'checked':''} ${cfg.periodWrapping?'disabled':''}>Play notes outside target scale</label></div>
 <details><summary>Anchor and custom coordinates</summary><div class="hex-controls"><label>Tonic button<input type="number" min="0" max="139" data-hex-field="center" value="${cfg.center}"></label><label>Register · periods<input type="number" min="-8" max="8" data-hex-field="register" value="${cfg.register}"></label>${[['ap','Right: periods'],['ag','Right: generators'],['bp','Up-right: periods'],['bg','Up-right: generators']].map(([k,l])=>`<label>${l}<input type="number" min="-1000" max="1000" data-hex-field="${k}" value="${cfg[k]}" ${cfg.style==='manual'?'':'disabled'}></label>`).join('')}</div><p>Custom axes must cover the complete integer temperament lattice. Reference pitch: ${fmt(getHz(),1)} Hz at 0 cents.</p></details>
 ${!error?colorMarkup(s,cfg,b):''}</details><div class="panelactions hex-board-actions"><button data-hex-action="center">Put tonic on selected button</button><button data-hex-action="fill">Fill note buttons</button><button data-hex-action="suggest">Find layout alternatives</button></div>${suggestionsMarkup(s)}</details>
 ${error?`<p class="empty" role="status">${esc(error)}</p>`:` <div class="hex-layout"><div><div class="hex-board-scroll">${svg(s,cfg,b)}</div><div class="hex-custom-color-host">${customColorMarkup(s,cfg,b,b.keys[cfg.selected])}</div></div><aside class="hex-chord-panel"><div class="hex-live-chord-readout" data-live-chord-readout aria-live="polite" aria-atomic="true"><p class="live-notes-empty">Play keys to see note and chord data</p></div>${getHarmonicMode()?harmonicPlay.render():catalogue.render()}${scaleMarkup(s,cfg,b)}<details class="hex-manual-chords" ${finders[0].selected>=0?'open':''}><summary>Manual selection & pairwise search</summary>${finderMarkup(s,cfg)}</details></aside></div>
 <div class="hex-axis-info">${cfg.periodWrapping?'<span>Within each period copy:</span>':''}<span>Right: <b>${fmt(cents(s,b.a))} ¢</b> (${b.a[0]}P + ${b.a[1]}G)</span><span>Up-right: <b>${fmt(cents(s,b.b))} ¢</b> (${b.b[0]}P + ${b.b[1]}G)</span>${b.base.large!==null?`<span>Base ${b.base.signature}: L ${fmt(b.base.large)}¢; s ${fmt(b.base.small)}¢</span>`:''}</div><div class="hex-metrics"><span><b>${b.coverage}/${s.n}</b> target degrees on board</span><span><b>${b.playable}/133</b> enabled note buttons</span><span><b>${fmt(b.span,0)}¢</b> pitch range</span></div>${b.missing.length?`<p class="notice">Missing target degrees: ${b.missing.join(', ')}. Try another rotation, base MOS, or tonic button to fit more of the scale.</p>`:''}
 ${midiOutside||previewOutside?`<p class="notice">${midiOutside?`${midiOutside} enabled buttons fall outside the HexBoard’s MPE pitch range at this tonic. `:''}${previewOutside?`${previewOutside} are outside this app’s audio range (15–16000 Hz). `:''}Adjust the register, tonic, or axes; exported coordinates are retained.</p>`:''}
 <div class="panelactions"><label class="checklabel"><input type="checkbox" data-hex-field="selectChord" ${cfg.selectChord?'checked':''}>Select chord notes</label><button data-hex-action="play-chord" ${cfg.chord.length?'':'disabled'}>▶ Play selection (${cfg.chord.length}/${MAX_CHORD_TONES})</button><button data-hex-action="clear">Clear selection</button></div>


 <aside class="hex-inspector">${inspect(s,cfg,b)}</aside>
 <p class="viewnote">Export contains this finite button map, the cents table, target scale and colors. Import the JSON into the <a href="https://shapingthesilence.github.io/HexBoard/" target="_blank" rel="noreferrer">HexBoard companion app</a>, review it, and use Save to HexBoard. Turning or mirroring the layout here regenerates the pitches; exported pitches are explicit button assignments. Requires firmware with cents-table and explicit-map support.</p>`}
 </div>`;
 }
 function suggestionsMarkup(s){return suggestions.length?`<div class="hex-suggestions">${suggestions.map((v,i)=>`<button data-hex-action="candidate" data-i="${i}"><b>${v.config.base} base · ${v.signature}</b><br>${esc(v.config.style)} · ${v.config.rotation*60}°<br>${v.coverage}/${s.n} degrees · ${v.playable} keys · ${fmt(v.span,0)}¢ range</button>`).join('')}</div><p class="viewnote">Ranked by target-degree coverage, then enabled keys and pitch range. These are coverage alternatives; your hand comfort determines the best fingering.</p>`:'';}

 // Background search updates must not stop held notes or discard an input draft.
 let refreshingCatalogue=false;
 function refreshCatalogue(){
  if(getHarmonicMode()||refreshingCatalogue)return;
  const doc=globalThis.document,host=doc?.querySelector('.hex-chord-panel .catalogue-panel');if(!host)return;
  const active=doc.activeElement,field=active?.dataset?.catalogueField,key=active?.dataset?.hexKey;
  const draft=field?{value:active.value,start:active.selectionStart,end:active.selectionEnd}:null;
  const scroll=host.querySelector('.catalogue-list')?.scrollTop||0;
  refreshingCatalogue=true;
  try {
  const template=doc.createElement('template');template.innerHTML=catalogue.render();
  // Keep the search input attached: removing it commits change during blur.
  host.querySelector('.catalogue-content').replaceChildren(...template.content.querySelector('.catalogue-content').childNodes);
  const list=doc.querySelector('.catalogue-list');if(list)list.scrollTop=scroll;
  const boardHost=doc.querySelector('.hex-board-scroll');
  if(boardHost){const held=[...boardHost.querySelectorAll('.is-playing')].map(el=>el.dataset.hexKey);const cfg=config(),s=state();boardHost.innerHTML=svg(s,cfg,buildBoard(s,cfg));held.forEach(id=>boardHost.querySelector('[data-hex-key="'+id+'"]')?.classList.add('is-playing'));}
  const focus=field?doc.querySelector('[data-catalogue-field="'+field+'"]'):key?doc.querySelector('[data-hex-key="'+key+'"]'):null;
  if(focus&&focus!==active){if(draft){focus.value=draft.value;if(draft.start!=null)focus.setSelectionRange(draft.start,draft.end);}focus.focus({preventScroll:true});}
  refreshLayoutChooser();
 } finally {refreshingCatalogue=false;}
 }
 function wrappingControls(cfg,b){const w=b?.wrapping;return `<div class="hex-controls hex-period-controls"><label>Period Wrapping<select data-hex-field="periodWrapping">${option('off','Off',cfg.periodWrapping?'on':'off')}${option('on','On',cfg.periodWrapping?'on':'off')}</select></label>${w?`<label class="checklabel"><input type="checkbox" data-hex-field="showPeriodLabels" ${cfg.showPeriodLabels?'checked':''}>Show period labels</label><label>Column shift<input type="number" min="-1000" max="1000" step="1" data-hex-period="column" value="${w.vector.column}"></label><label>Row shift<input type="number" min="-1000" max="1000" step="1" data-hex-period="row" value="${w.vector.row}"></label><label>Register alignment<select data-hex-field="registerAlignment">${option('scale','Scale order · automatic',cfg.registerAlignment)}${option('manual','Manual copy shifts',cfg.registerAlignment)}</select></label><label>Pitch shift per copy · periods<select data-hex-field="copyPeriodStep" ${cfg.registerAlignment!=='manual'?'disabled':''}>${[...new Set([...Array.from({length:17},(_,i)=>i-8),w.copyPeriodStep])].sort((a,b)=>a-b).map(n=>option(n,`${signed(n)} · ${signed(Number(fmt(n*state().p)))}¢`,w.copyPeriodStep)).join('')}</select></label><button data-hex-action="period-reverse" title="Negate the physical column and row offsets">Reverse placement</button><button data-hex-action="period-auto">Reset / Auto</button><span class="dim">${w.manual?'Manual placement':'Automatic placement'}</span>`:''}</div>${w?`${w.alignmentIssue?`<p class="notice" role="status">${esc(w.alignmentIssue)}</p>`:''}${w.overlaps.length?`<p class="notice" role="alert">${w.overlaps.length} overlapping keys marked × are disabled. Adjust the placement or use Reset / Auto before exporting.</p>`:''}`:''}`;}
 function input(el){if(chooser.input(el))return true;if(el.dataset.catalogueField==='v2-search')return catalogue.change(el);if(!el.dataset.hexPeriod)return false;const focused=globalThis.document?.activeElement===el;change(el);if(focused)globalThis.document?.querySelector('[data-hex-period="'+el.dataset.hexPeriod+'"]')?.focus();return true;}
 function colorMarkup(s,cfg,b){const {layers}=mosLayers(s,cfg,b);return `<section class="hex-colors"><h3>MOS layer colors</h3><div class="hex-controls"><label>Palette<select data-hex-field="palette">${Object.entries(palettes).map(([id,p])=>option(id,p.name,cfg.palette)).join('')}</select></label><label>Grow subsets toward<select data-hex-field="layerGrowth">${option('balanced','Both directions',cfg.layerGrowth)}${option('lower','Lower generator indices',cfg.layerGrowth)}${option('higher','Higher generator indices',cfg.layerGrowth)}</select></label><button data-hex-action="reset-colors">Reset all colors</button></div><div class="hex-color-swatches">${layers.map((l,i)=>`<label><input type="color" data-hex-color="${l.n}" value="${l.color}" aria-label="${i?'Added at scale':'Base'} ${l.n} color"><span><b>${i?'Scale':'Base'} ${l.n}</b><small>${i?'+':''}${l.added} notes</small></span></label>`).join('')}</div></section>`;}
 // The board for the current state, rebuilt only when something it depends on changes. The device sync,
 // fingering game and harmonies panel read the board every few hundred milliseconds; rebuilding it
 // each time costs far more than reading it. Callers must not modify the returned board.
 let boardMemo=null;
 function boardFor(s,cfg){
  const key=boardSignature(s,cfg);
  if(boardMemo?.key===key)return boardMemo.board;
  const board=buildBoard(s,cfg);
  boardMemo={key,board};
  return board;
 }
 // Everything about the layout and chord search settings that invalidates found chords.
 function boardSignature(s,cfg){return JSON.stringify([s.basis,s.rows,s.p,s.g,s.n,s.mode,cfg.base,cfg.offset,cfg.style,cfg.rotation,cfg.mirror,cfg.flipHorizontal,cfg.flipVertical,cfg.deviceRotation,cfg.center,cfg.register,cfg.outside,cfg.ap,cfg.ag,cfg.bp,cfg.bg,cfg.tolerance,cfg.limit,cfg.primeLimit,cfg.periodWrapping,cfg.periodPlacement,cfg.copyPeriodStep,cfg.registerAlignment]);}
 function finderState(s,cfg){
  const f=finders[0],signature=boardSignature(s,cfg);
  if(f.signature!==signature){f.groups=[];f.selected=-1;f.placement=0;f.searched=false;f.signature=signature;if(f.imported?.identity===tuningIdentity(s)){const g=f.imported;f.groups=[{...g,placements:chordPlacements(buildBoard(s,cfg),g.coordinates,cfg.center,g).sort((a,b)=>a.reach-b.reach)}];f.selected=0;}else f.imported=null;}return f;
 }
 function highlighted(s,cfg){if(catalogueHighlight)return catalogueHighlight;const f=finderState(s,cfg);return f.groups[f.selected]?.placements[f.placement]||null;}
 function finderMarkup(s,cfg){const f=finderState(s,cfg),g=f.groups[f.selected],p=g?.placements[f.placement];let assessment='';if(g){const coordinates=g.coordinates??g.shape;if(coordinates?.length){const key=JSON.stringify([s.basis,s.rows,s.p,s.g,cfg.limit,cfg.primeLimit,cfg.tolerance,coordinates]);if(g.analysisKey!==key){g.analysis=inspectCoordinateChord(s,coordinates,{limit:cfg.limit,primeLimit:cfg.primeLimit,tolerance:cfg.tolerance,other:f.other});g.analysisKey=key;}assessment=renderCoordinateAssessment(g.analysis);}}return `<section class="hex-chord-finder"><details><summary>Find chords on this layout</summary><div class="hex-controls"><label>Chord size<select data-hex-finder="size">${option(3,'Triads',f.size)}${option(4,'Tetrads',f.size)}</select></label><label>Max reach · hex steps<select data-hex-finder="reach">${[2,3,4,5,6,8,12].map(n=>option(n,n,f.reach)).join('')}</select></label><label class="checklabel"><input type="checkbox" data-hex-finder="other" ${f.other?'checked':''}>Include other approximations</label><button data-hex-action="chords-search" class="primary">Find chords</button><button data-hex-action="chords-selection" ${cfg.chord.length>=2?'':'disabled'}>Map selected keys</button></div><p class="viewnote">Uses enabled keys and targets filtered by odd limit ${cfg.limit}${cfg.primeLimit==null?'':` and ${formatPrimeFilter(cfg.primeLimit)}`} at ${cfg.tolerance}¢ tolerance. Reach is the largest distance between two chord keys.</p></details>
 ${f.groups.length?`<label class="hex-chord-choice">Chord<select data-hex-finder="result"><option value="" ${f.selected<0?'selected':''}>Choose a chord to highlight</option>${f.groups.map((v,i)=>option(i,`${v.label} · ${v.placements.length} placements${v.max!==undefined?` · ${fmt(v.max)}¢ worst pair error · ${v.mapped}/${v.total} mapped`:''}`,f.selected)).join('')}</select></label>`:f.searched?'<p role="status">No chords found. Try a wider reach or tolerance, or include other approximations.</p>':''}
 ${g?`<p role="status"><b>${esc(g.label)}</b> · ${g.placements.length?p?`Placement ${f.placement+1}/${g.placements.length} · buttons ${p.keys.join(', ')} · reach ${p.reach}${g.exact?` · register ${p.periodShift>=0?'+':''}${p.periodShift} periods`:''}`:'Choose a placement':'No complete placement on the enabled keys. Try another voicing or layout.'}</p><div class="panelactions"><button data-hex-action="chords-prev" ${g.placements.length>1?'':'disabled'}>← Previous placement</button><button data-hex-action="chords-next" ${g.placements.length>1?'':'disabled'}>Next placement →</button><button data-hex-action="chords-play" ${p?'':'disabled'}>▶ Hear highlighted chord</button><button data-hex-action="chords-clear">Clear highlight</button></div>`:''}
 ${assessment}${g?.placements.limited?'<p class="viewnote">Showing the first 20,000 placements, starting near the tonic button.</p>':''}
 ${g?`<p class="viewnote">${g.exact?`Selected degrees and voicing${g.periodCopies?'; period copies allowed':''}.`:'Same voicing, transposed across enabled keys.'} Clear highlight or press Escape to return to the normal layout.</p>`:''}
 ${f.searched?`<p class="viewnote">${f.limited?'Partial search: calculation limit reached. Narrow the reach or tolerance. ':''}Every pair matches an allowed target; ratio labels are independent interpretations. Placements preserve the exact period/generator shape. Highlights are temporary; Escape clears them.</p>`:''}</section>`;}
 function showChord(coordinates,label,options={}){catalogue.clear();scaleHighlight=null;const cfg=config(),s=state(),b=buildBoard(s,cfg),f=finderState(s,cfg);const source={label,exact:!!options.exact,periodCopies:!!options.periodCopies,coordinates:structuredClone(coordinates),identity:tuningIdentity(s)};f.imported=source;f.groups=[{...source,placements:chordPlacements(b,coordinates,cfg.center,options)}];f.selected=0;f.placement=0;f.searched=false;return f.groups[0].placements.length;}
 function showScale(coordinates,label){catalogue.clear();scaleHighlight={identity:tuningIdentity(state()),gens:coordinates.map(m=>m[1]),shift:0,label};finders.forEach(f=>{f.selected=-1;f.imported=null;});const s=state(),cfg=config(),b=buildBoard(s,cfg);const options=scalePlacements(b);scaleHighlight.shift=options.includes(0)?0:(options[0]??0);return options.length;}
 function scalePlacements(b){if(!scaleHighlight)return [];const available=new Set(b.keys.filter(k=>k.enabled).map(k=>k.m[1])),gens=scaleHighlight.gens;return [...available].map(g=>g-gens[0]).filter(offset=>gens.every(g=>available.has(g+offset))).sort((a,b)=>Math.abs(a)-Math.abs(b)||a-b);}
 function scaleMarkup(s,cfg,b){if(scaleHighlight?.identity!==tuningIdentity(s)){scaleHighlight=null;return '';}const h=scaleHighlight,options=scalePlacements(b),covered=new Set(b.keys.filter(k=>k.enabled&&h.gens.includes(k.m[1]-h.shift)).map(k=>k.m[1])).size;return `<section class="scale-highlight"><b>${esc(h.label)}</b><p>${covered}/${h.gens.length} notes represented on enabled keys.</p><div class="panelactions"><label>Placement<select data-hex-scale="shift">${[...new Set([h.shift,...options])].map(v=>option(v,`${v>=0?'+':''}${v} generators`,h.shift)).join('')}</select></label><button data-hex-action="scale-clear">Clear scale highlight</button></div>${options.length?'':'<p class="notice">No complete placement fits. Choose a larger target scale or another layout in Layout settings.</p>'}</section>`;}
 function svg(s,cfg,b){
  if(scaleHighlight?.identity!==tuningIdentity(s))scaleHighlight=null;const colors=mosLayers(s,cfg,b),overlay=highlighted(s,cfg),matches=boardMatches(s,b,cfg.root,cfg.tolerance,cfg.limit,cfg.primeLimit),angle=cfg.deviceRotation*Math.PI/2;
  const radius=19,gap=2,pitch=Math.sqrt(3)*radius+gap;
  const positions=b.keys.map(k=>{const x=k.x*pitch/2,y=k.y*pitch*Math.sqrt(3)/2;return {x:x*Math.cos(angle)-y*Math.sin(angle),y:x*Math.sin(angle)+y*Math.cos(angle)};});
  const visiblePositions=positions.filter((_,i)=>!b.keys[i].command);
  const xmin=Math.min(...visiblePositions.map(p=>p.x))-23,ymin=Math.min(...visiblePositions.map(p=>p.y))-23,width=Math.max(...visiblePositions.map(p=>p.x))-xmin+23,height=Math.max(...visiblePositions.map(p=>p.y))-ymin+23;
  return `<svg class="hex-board${overlay?.keys?.length||cfg.chord.length?' has-chord':''}" viewBox="0 0 ${width} ${height}" role="group" aria-label="HexBoard layout: 133 note buttons">${b.keys.map((k,i)=>{if(k.command)return '';const x=positions[i].x-xmin,y=positions[i].y-ymin,pts=Array.from({length:6},(_,j)=>{const a=(j*60-90)*Math.PI/180+angle;return `${x+radius*Math.cos(a)},${y+radius*Math.sin(a)}`;}).join(' '),m=matches[i],look=keyAppearance(k,i,{colors,overlay,scaleOn:scaleHighlight,chord:cfg.chord}),scaleTone=look.scaleTone,tone=look.tone,fill=look.fill,stroke=cfg.chord.includes(i)?'#de88ff':i===cfg.root?'#55b5ff':m.mapped.length&&k.enabled?'#65d6b8':m.other.length&&k.enabled?'#e9bd5d':'#4b5a71';return `<g class="${i===cfg.selected?'is-selected':''} ${look.lit?'is-lit':''} ${look.marked?'is-marked':''} ${cfg.chord.includes(i)?'is-chord':''} ${k.conflict?'is-overlap':''}" ${k.command?'':`role="button" tabindex="0" aria-disabled="${!k.enabled}" data-hex-key="${i}" aria-label="Button ${i}, ${k.degree>=0?'degree '+k.degree:'outside scale'}, ${fmt(k.c)} cents${k.wrapped&&k.enabled?`, period register ${k.register}`:''}${k.conflict?', overlapping period copies':''}${tone>=0?`, chord tone ${tone+1}`:''}${k.enabled?'':', disabled'}"`}><title>Button ${i}${k.wrapped&&k.enabled?` · degree ${k.degree} · register ${k.register>=0?'+':''}${k.register}`:''}${k.conflict?` · Overlap: ${k.placements.map(p=>`degree ${p.degree}, copy ${p.copyRegister}`).join('; ')}`:''} · ${k.command?'Command':`${fmt(k.c)}¢; ${k.m[0]}P + ${k.m[1]}G`}</title><polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="1.4" stroke-linejoin="round"/><text class="hex-key-label" x="${x+(tone>=0?-4:0)}" y="${y+(cfg.showPeriodLabels&&k.wrapped&&k.enabled?-1:4)}" text-anchor="middle" fill="${textColor(fill)}" font-size="${k.command?8:12}">${k.conflict?'×':k.command?'CMD':k.degree>=0?k.degree:'·'}</text>${tone>=0?`<text class="hex-chord-tone-label" x="${x+10}" y="${y+(cfg.showPeriodLabels&&k.wrapped&&k.enabled?-3:2)}" text-anchor="start" fill="${textColor(fill)}" font-size="7" aria-hidden="true">${tone+1}</text>`:''}${cfg.showPeriodLabels&&k.wrapped&&k.enabled?`<text class="hex-period-label" x="${x}" y="${y+12}" text-anchor="middle" fill="${textColor(fill)}" font-size="9">${signed(k.register)}P</text>`:''}${i===cfg.center?`<circle cx="${x}" cy="${y-11}" r="2.5" fill="#dc8847"/>`:''}</g>`;}).join('')}</svg>`;
 }
 function customColorMarkup(s,cfg,b,k){const exportButton='<button data-hex-action="export" class="primary">Export for HexBoard</button>';if(!k||k.command)return `<section class="hex-custom-color"><div class="hex-controls hex-export-only">${exportButton}</div></section>`;const colors=mosLayers(s,cfg,b),canDegree=k.degree>=0,scope=colorScope==='degree'&&canDegree?'degree':'key',override=scope==='degree'?cfg.degreeColors?.[k.degree]:cfg.keyColors?.[k.index],layerColor=canDegree?colors.layers[colors.degreeLayers[k.degree]]?.color:null,fallback=scope==='degree'?(validColor(cfg.degreeColors?.[k.degree])?cfg.degreeColors[k.degree]:layerColor):keyColor(k,colors),value=validColor(override)?override:fallback,canSetRoot=!(k.wrapped&&!k.enabled);return `<section class="hex-custom-color"><div class="hex-controls"><h4>Button ${k.index}</h4><select data-hex-color-scope aria-label="Apply color to">${option('key','Single button',scope)}${canDegree?option('degree','Scale degree',scope):''}</select><input type="color" data-hex-custom-color="${scope}" value="${value}" aria-label="Color for ${scope==='degree'?`degree ${k.degree}`:`button ${k.index}`}"><button data-hex-action="clear-custom-color" data-hex-color-target="${scope}" ${validColor(override)?'':'disabled'}>Use default color</button>${canSetRoot?'<button data-hex-action="root">Set interval root here</button>':''}${exportButton}</div></section>`;}
 function inspect(s,cfg,b){const k=b.keys[cfg.selected];if(k.wrapped&&!k.enabled)return `<p>${k.conflict?`Overlapping copies: ${k.placements.map(p=>`degree ${p.degree} in copy ${p.copyRegister>=0?'+':''}${p.copyRegister}`).join('; ')}. This key is disabled. Adjust the period placement or use Reset / Auto.`:'No scale copy occupies this key. Adjust the period placement to move copies here.'}</p>`;const m=boardMatches(s,b,cfg.root,cfg.tolerance,cfg.limit,cfg.primeLimit)[cfg.selected];return `<p>${k.degree>=0?`Target degree ${k.degree}`:'Outside target scale'}${k.inMOS?` · ${k.base?'base MOS':'added at scale'} ${mosLayers(s,cfg,b).layers[mosLayers(s,cfg,b).degreeLayers[k.degree]].n}`:''}${k.alias?' · same pitch at other coordinates':''}</p><p><b>${fmt(k.c)} ¢</b> from tonic<br>${k.m[0]} periods + ${k.m[1]} generators${k.wrapped?`<br>Base degree ${k.degree}: ${fmt(k.basePitch)}¢ + register ${k.register>=0?'+':''}${k.register} × ${fmt(s.p)}¢<br>Copy ${signed(k.copyRegister)} × ${signed(b.wrapping.copyPeriodStep)} = ${signed(k.copyPeriods)} periods; extension ${signed(k.extensionRegister)}; anchor ${signed(cfg.register)}`:''}</p><p>From button ${cfg.root}: ${fmt(m.c)}¢ ascending.</p><p class="target-mapped">Mapped: ${m.mapped.map(t=>`${t.label} (${t.error>=0?'+':''}${fmt(t.error)}¢)`).join(', ')||'none within tolerance'}</p><p class="target-hit">Other: ${m.other.map(t=>`${t.label} (${t.error>=0?'+':''}${fmt(t.error)}¢; ${t.reason==='Outside temperament basis'?'outside basis':'alternative'})`).join(', ')||'none within tolerance'}</p>`;}
 // The sound starts as soon as press returns, so press only reads the key and records the selection;
 // key classes, the inspector, the colour editor and chord recommendations follow in the next frame.
 let pressFrame=0;
 const nextFrame=fn=>(globalThis.requestAnimationFrame??(f=>setTimeout(f,0)))(fn);
 function press(node){const cfg=config(),s=state(),b=boardFor(s,cfg),key=b.keys[Number(node.dataset.hexKey)];if(!key||key.command)return null;cfg.selected=key.index;
  if(cfg.selectChord&&key.enabled){if(cfg.chord.includes(key.index))cfg.chord=cfg.chord.filter(i=>i!==key.index);else if(cfg.chord.length<MAX_CHORD_TONES)cfg.chord.push(key.index);}
  const board=node.closest?.('.hex-board');if(!pressFrame)pressFrame=nextFrame(()=>{pressFrame=0;showPress(board);});return key;
 }
 function showPress(board){
  const cfg=config(),s=state(),b=boardFor(s,cfg),key=b.keys[cfg.selected];if(!key)return;
  board?.querySelectorAll('[data-hex-key]').forEach(el=>{el.classList.toggle('is-selected',Number(el.dataset.hexKey)===key.index);el.classList.toggle('is-chord',cfg.chord.includes(Number(el.dataset.hexKey)));});
  const inspector=globalThis.document?.querySelector('.hex-inspector');if(inspector)inspector.innerHTML=inspect(s,cfg,b);const editor=globalThis.document?.querySelector('.hex-custom-color-host');if(editor)editor.innerHTML=customColorMarkup(s,cfg,b,key);
 }
 function change(el){if(getHarmonicMode()&&harmonicPlay.change(el))return true;if(el.dataset.layoutChoice!==undefined){applyLayoutChoice(el.value);return true;}if(chooser.input(el))return true;if(catalogue.change(el))return true;if(el.dataset.hexPeriod){try{if(el.value==='')return true;const cfg=config(),b=buildBoard(state(),cfg),vector={...b.wrapping.vector,[el.dataset.hexPeriod]:Number(el.value)};validatePeriodPlacement(vector);cfg.periodPlacement=vector;cfg.chord=[];refresh();}catch(e){notify(e.message);const b=buildBoard(state(),config());el.value=String(b.wrapping.vector[el.dataset.hexPeriod]);}return true;}if(el.dataset.hexScale==='shift'){if(scaleHighlight)scaleHighlight.shift=Number(el.value);refresh();return true;}if(el.dataset.hexColorScope!==undefined){colorScope=el.value==='degree'?'degree':'key';refresh();return true;}if(el.dataset.hexCustomColor!==undefined){const scope=el.dataset.hexCustomColor,cfg=config(),b=buildBoard(state(),cfg),key=b.keys[cfg.selected];if(!validColor(el.value)){notify('Choose a valid button color.');return true;}if(scope==='degree'&&key?.degree>=0)cfg.degreeColors[key.degree]=el.value;else if(scope==='key'&&key&&!key.command)cfg.keyColors[key.index]=el.value;else notify('Choose a scale degree or hex button to color.');refresh();return true;}if(el.dataset.hexColor!==undefined){const n=Number(el.dataset.hexColor);if(Number.isInteger(n)&&n>=2&&n<=MAX_SCALE_SIZE&&validColor(el.value)){config().layerColors[n]=el.value;refresh();}else notify('Choose a valid layer color.');return true;}if(el.dataset.hexFinder){catalogue.clear();const cfg=config(),f=finderState(state(),cfg),key=el.dataset.hexFinder;if(key==='result'){scaleHighlight=null;f.selected=el.value===''?-1:Number(el.value);f.placement=0;}else{f.imported=null;f[key]=el.type==='checkbox'?el.checked:Number(el.value);f.groups=[];f.selected=-1;f.searched=false;}refresh();return true;}const f=el.dataset.hexField;if(!f)return false;try{const cfg=config();if(f==='target'||f==='mode'){if(f==='target'){state().n=Number(el.value);state().mode=0;}else state().mode=Number(el.value);cfg.chord=[];refresh(true);return true;}if(f==='flipHorizontal'||f==='flipVertical'){const checked=!!el.checked;if(cfg[f]!==checked&&cfg.periodPlacement)cfg.periodPlacement=flipPlacementVector(cfg.periodPlacement,cfg,f);cfg[f]=checked;cfg.chord=[];refresh();return true;}if(f==='periodWrapping'){cfg.periodWrapping=el.value==='on';cfg.chord=[];refresh();return true;}if(f==='registerAlignment'){if(!['scale','manual'].includes(el.value))throw Error('Choose a register alignment.');if(el.value==='manual'){const step=buildBoard(state(),cfg).wrapping?.copyPeriodStep??1;cfg.copyPeriodStep=Math.max(-8,Math.min(8,step));}cfg.registerAlignment=el.value;cfg.chord=[];refresh();return true;}if(f==='copyPeriodStep'){cfg.copyPeriodStep=validateCopyPeriodStep(Number(el.value));cfg.registerAlignment='manual';cfg.chord=[];refresh();return true;}const value=el.type==='checkbox'?el.checked:['style','palette','layerGrowth','scaleFilter'].includes(f)?el.value:Number(el.value);if(typeof value==='number'&&!Number.isFinite(value))throw Error('Enter a finite number.');if(f==='center'&&(!Number.isInteger(value)||value<0||value>139||commands.has(value)))throw Error('Choose a note button from 0 to 139, excluding command buttons.');if(['ap','ag','bp','bg','register'].includes(f)&&(!Number.isInteger(value)||Math.abs(value)>(f==='register'?8:1000)))throw Error('Use integer coordinates within the indicated range.');cfg[f]=f==='tolerance'?Math.max(0,Math.min(100,value)):value;if(f==='palette')cfg.layerColors={};if(!['selectChord','showPeriodLabels','tolerance','limit','palette','layerGrowth'].includes(f))cfg.chord=[];if(f==='base')cfg.offset=0;refresh();}catch(e){notify(e.message);refresh();}return true;}
 function click(el,shift=false){if(getHarmonicMode()&&harmonicPlay.click(el))return true;if(catalogue.click(el))return true;const node=el.closest?.('[data-hex-key],[data-hex-action],[data-hex-toggle]');if(!node)return false;if(node.dataset.hexToggle){const field=node.dataset.hexToggle;if(!['flipHorizontal','flipVertical'].includes(field))return false;const cfg=config(),value=!cfg[field];if(cfg[field]!==value&&cfg.periodPlacement)cfg.periodPlacement=flipPlacementVector(cfg.periodPlacement,cfg,field);cfg[field]=value;cfg.chord=[];refresh();return true;}try{const cfg=config(),s=state(),b=buildBoard(s,cfg);if(node.dataset.hexKey!==undefined){const i=Number(node.dataset.hexKey),key=b.keys[i];cfg.selected=i;if(cfg.selectChord&&key.enabled){if(cfg.chord.includes(i))cfg.chord=cfg.chord.filter(v=>v!==i);else if(cfg.chord.length<MAX_CHORD_TONES)cfg.chord.push(i);else notify(`Select up to ${MAX_CHORD_TONES} chord notes.`);}if(key.enabled)play([key.c]);refresh();return true;}
 const act=node.dataset.hexAction;if(act?.startsWith('layout-')){void layoutAction(act);return true;}if(act==='period-reverse'){if(b.wrapping){const v=b.wrapping.vector;cfg.periodPlacement=validatePeriodPlacement({column:-v.column||0,row:-v.row||0});cfg.chord=[];refresh();}return true;}if(act==='period-auto'){cfg.registerAlignment='scale';cfg.copyPeriodStep=1;cfg.periodPlacement=null;cfg.chord=[];refresh();return true;}if(act==='scale-clear'){scaleHighlight=null;refresh();return true;}if(act==='reset-colors'){cfg.layerColors={};cfg.keyColors={};cfg.degreeColors={};}if(act==='clear-custom-color'){const target=node.dataset.hexColorTarget,key=b.keys[cfg.selected];if(target==='degree'&&key?.degree>=0)delete cfg.degreeColors[key.degree];else delete cfg.keyColors[cfg.selected];}if(act.startsWith('chords-')){catalogue.clear();scaleHighlight=null;const f=finderState(s,cfg),g=f.groups[f.selected];if(act==='chords-search'){f.imported=null;const r=discoverBoardChords(s,b,{size:f.size,reach:f.reach,other:f.other,limit:cfg.limit,primeLimit:cfg.primeLimit,tolerance:cfg.tolerance});f.groups=r.groups;f.selected=r.groups.length?0:-1;f.placement=0;f.searched=true;f.limited=r.limited;}if(act==='chords-selection')showChord(cfg.chord.map(i=>b.keys[i].m),'Selected keys');if(act==='chords-clear'){f.selected=-1;f.imported=null;}if(g?.placements.length){if(act==='chords-next'||act==='chords-prev')f.placement=(f.placement+(act==='chords-next'?1:-1)+g.placements.length)%g.placements.length;if(act==='chords-play')play(g.placements[f.placement].keys.map(i=>b.keys[i].c));}refresh();return true;}if(act==='fill'){const fit=fillBoard(s,cfg);Object.assign(s,{n:fit.n,mode:fit.mode});if(fit.config)Object.assign(cfg,fit.config);cfg.offset=fit.offset;cfg.outside=false;cfg.chord=[];refresh(true);notify(`Selected ${s.n} notes, mode ${s.mode+1}: all 133 note buttons belong to the scale.`);return true;}if(act==='root')cfg.root=cfg.selected;if(act==='center'){cfg.center=cfg.selected;cfg.root=cfg.selected;cfg.chord=[];}if(act==='clear')cfg.chord=[];if(act==='play-chord')play(cfg.chord.map(i=>b.keys[i]).filter(k=>k.enabled).map(k=>k.c));if(act==='suggest'){suggestions=layoutCandidates(s,cfg);suggestionSignature=JSON.stringify([s,cfg]);}if(act==='candidate'){const v=suggestions[Number(node.dataset.i)];if(v)configs[0]={...v.config,chord:[]};}if(act==='export'){const out=exportHexboard(s,cfg,getHz());download(`${s.name.replace(/[^a-z0-9]/gi,'-')}-${s.n}-HexBoard.json`,JSON.stringify(out.file,null,2),'application/json');notify(`HexBoard bundle exported. ${out.board.coverage}/${s.n} target degrees represented; pitch rounding ≤ ${fmt(out.maxError,5)}¢.`);}refresh();}catch(e){notify(e.message);}return true;}
 function applyLayoutChoice(value,refreshView=true){try{const cfg=config(),s=state();let next,fit,preset;
  if(value.startsWith('saved:')){preset=presetById(value.slice(6));if(!preset)return;fit=layoutPresetForState(preset.state,s);if(fit.error)throw Error(fit.error);next={config:fit.config};}else return;
  if(cfg.chord.length>=2){const b=buildBoard(s,cfg);showChord(cfg.chord.map(i=>b.keys[i].m),'Selected keys',{exact:true,periodCopies:true});}
  if(fit)Object.assign(s,{n:fit.state.n,mode:fit.state.mode});Object.assign(cfg,next.config);cfg.chord=[];finders[0].signature='';
  cfg.savedLayoutId=preset.id;chooser.clearName();rememberButtonColorContext();if(refreshView)refresh(!!fit);
 }catch(e){notify(e.message);}}
 function applyDefaultForCurrentMapping(refreshView=true){syncButtonColorContext();const s=state(),key=mappingKey(s);if(key===defaultScope)return false;const id=savedLayouts.catalog().defaults?.[key],preset=savedLayouts.catalog().items.find(p=>p.id===id)??builtinLayoutsFor(s)[0];if(!preset||mappingKey(preset.state.context)!==key||layoutPresetForState(preset.state,s).error){defaultScope=key;return false;}defaultScope=key;config().chord=[];applyLayoutChoice('saved:'+preset.id,refreshView);return true;}
 function preserveCurrentLayout(){defaultScope=mappingKey(state());rememberButtonColorContext();}
 async function initLayouts(){const before=JSON.stringify([state(),config()]),beforeMapping=mappingKey(state());await savedLayouts.init();if(!['ready','error'].includes(savedLayouts.catalog().status))return;if(before!==JSON.stringify([state(),config()])&&beforeMapping===mappingKey(state())){defaultScope=beforeMapping;return;}applyDefaultForCurrentMapping();}
 async function layoutAction(action){if(action==='layout-retry')return initLayouts();const cfg=config(),s=state(),old=savedLayouts.catalog().items.find(p=>p.id===cfg.savedLayoutId&&mappingKey(p.state.context)===mappingKey(s));
  if(action==='layout-default'){if(!old)return;const before=JSON.stringify([s,cfg]),fit=layoutPresetForState(old.state,s),alreadySaved=!fit.error&&old.state.context.n===s.n&&old.state.context.mode===s.mode&&layoutPresetConfigKey(fit.config)===layoutPresetConfigKey(cfg)&&chooser.name(old.name).trim()===old.name,preset=alreadySaved?old:await savedLayouts.save(chooser.name(old.name),s,cfg,old.id,{quiet:true});if(!preset||before!==JSON.stringify([state(),config()]))return;if(await savedLayouts.setDefault(preset.id,state())){config().savedLayoutId=preset.id;chooser.clearName();defaultScope=mappingKey(state());refreshLayoutChooser();}return;}
  if(action==='layout-delete'){if(old&&await savedLayouts.remove(old.id)){delete config().savedLayoutId;chooser.clearName();refreshLayoutChooser();}return;}
  const before=JSON.stringify([s.basis,s.rows,s.n,s.mode,layoutKey(cfg)]),preset=await savedLayouts.save(chooser.name(old?.name),s,cfg,action==='layout-save-new'?null:old?.id);
  if(preset&&before===JSON.stringify([state().basis,state().rows,state().n,state().mode,layoutKey(config())])){config().savedLayoutId=preset.id;chooser.clearName();refreshLayoutChooser();}
 }
 function restore(data){harmonicPlay.restore(data?.harmonic);chooser.reset();coverageKey=null;keepRestoredBase=!!data;catalogue.restore(data?.catalogue);scaleHighlight=null;finders=[freshFinder()];if(!data){defaultScope='';configs=[defaults()];suggestions=[];return;}if(!Array.isArray(data.configs)||![1,2].includes(data.configs.length))throw Error('Invalid HexBoard workspace.');for(const c of [data.configs[0]]){for(const field of ['flipHorizontal','flipVertical'])if(c[field]!==undefined&&typeof c[field]!=='boolean')throw Error('Invalid layout flip setting.');if(c.showPeriodLabels!==undefined&&typeof c.showPeriodLabels!=='boolean')throw Error('Invalid period labels setting.');if(c.periodWrapping!==undefined&&typeof c.periodWrapping!=='boolean')throw Error('Invalid period wrapping setting.');if(c.periodPlacement!=null)validatePeriodPlacement(c.periodPlacement);if(c.copyPeriodStep!==undefined)validateCopyPeriodStep(c.copyPeriodStep);if(c.registerAlignment!==undefined&&!['scale','manual'].includes(c.registerAlignment))throw Error('Invalid register alignment.');if(c.scaleFilter!==undefined&&!['all','2','3'].includes(c.scaleFilter))throw Error('Invalid scale filter.');if(c.palette!==undefined&&!Object.hasOwn(palettes,c.palette)||c.layerGrowth!==undefined&&!['balanced','lower','higher'].includes(c.layerGrowth)||c.layerColors!==undefined&&!validColorMap(c.layerColors,2,MAX_SCALE_SIZE)||c.keyColors!==undefined&&!validColorMap(c.keyColors,0,139,commands)||c.degreeColors!==undefined&&!validColorMap(c.degreeColors,0,MAX_SCALE_SIZE-1))throw Error('Invalid saved MOS colors or button colors.');for(const [key,lo,hi] of [['base',2,MAX_SCALE_SIZE],['offset',0,MAX_SCALE_SIZE-2],['rotation',0,5],['deviceRotation',0,3],['center',0,139],['selected',0,139],['root',0,139],['register',-8,8],['ap',-1000,1000],['ag',-1000,1000],['bp',-1000,1000],['bg',-1000,1000]])if(!Number.isInteger(c[key])||c[key]<lo||c[key]>hi)throw Error('Invalid HexBoard coordinates.');validateJILimits({oddLimit:c.limit,primeLimit:c.primeLimit??null});if([c.center,c.root,c.selected].some(i=>commands.has(i))||!['bosanquet','compressed','period','manual'].includes(c.style)||(!Number.isInteger(c.limit)||c.limit<3||c.limit>97||c.limit%2!==1)||!Number.isFinite(c.tolerance)||c.tolerance<0||c.tolerance>100||!Array.isArray(c.chord)||c.chord.length>MAX_CHORD_TONES||c.chord.some(i=>!Number.isInteger(i)||i<0||i>139||commands.has(i)))throw Error('Invalid saved HexBoard layout.');}const migrated=migrateLayoutMirrors(data.configs[0]);configs=[{...defaults(),...migrated,primeLimit:validateJILimits({oddLimit:data.configs[0].limit,primeLimit:data.configs[0].primeLimit??null}).primeLimit,outside:!!data.configs[0].outside,selectChord:!!data.configs[0].selectChord}];suggestions=[];}
 // The held keys as the harmony directory reads them: chord name, form and rotation, or an interval,
 // or why the notes are not a chord of the limit; each key column shows its ratio from the bass.
 function renderPlayed(host,played,pressed,s){
  const columns=pressed.map(({key,pitch},i)=>{const ratio=played.noteLabels?.[key.m.join(',')];return `<section class="live-note-column" aria-label="Button ${key.index}">${ratio?`<strong class="live-ratio-member" ${i?'data-ratio-colon':''}>${esc(ratio)}</strong>`:''}<span title="Button number">#${key.index}</span><span title="Scale degree">${key.degree>=0?'Deg '+key.degree:'Outside'}</span><span title="Cents modulo period">${fmt(mod(pitch,s.p),2)} ¢</span><span title="Sounding frequency">${fmt(frequencyFor(pitch,getHz()),2)} Hz</span></section>`;}).join('');
  const notes=[played.doubled?'with doubled notes':'',played.source==='proof'?'not in the current directory list':''].filter(Boolean).map(text=>`<small>${text}</small>`).join('');
  let heading='';
  if(played.status==='chord')heading=`<div class="live-note-chord" aria-label="Chord"><strong>${esc(played.label)}</strong> <span class="form-badge ${played.form}">${esc(played.formLabel)}</span>${played.rotation&&played.rotation!==played.label?`<small>played as ${esc(played.rotation)}</small>`:''}${notes}${played.alternatives?.length?`<details><summary>Also reads as</summary>${played.alternatives.map(label=>`<p>${esc(label)}</p>`).join('')}</details>`:''}</div>`;
  else if(played.status==='interval')heading=`<div class="live-note-chord" aria-label="Interval"><strong>${esc(played.label)}</strong><small>interval</small>${played.readings.length>1?`<small>also ${played.readings.slice(1,4).map(esc).join(', ')}</small>`:''}${notes}</div>`;
  else if(played.status==='none')heading=`<p class="live-notes-empty">${esc(played.reason)}${played.contains?.length?` · contains ${played.contains.map(item=>esc(item.label)).join(', ')}`:''}</p>`;
  host.innerHTML=`${heading}<div class="live-note-columns">${columns}</div>`;
 }
 function updateLiveChord(result={status:'empty',noteCount:0,matches:[]},notes=[]){
  const host=globalThis.document?.querySelector('[data-live-chord-readout]');if(!host)return;
  const matches=Array.isArray(result.matches)?result.matches:[],s=state(),board=notes.length?buildBoard(s,config()):null;
  const pressed=notes.map(note=>{
   const key=board?.keys[Number(note.id)];
   if(!key?.enabled)return null;
   return {key,pitch:Number.isFinite(note.cents)?note.cents:key.c};
  }).filter(Boolean).sort((a,b)=>a.pitch-b.pitch||a.key.index-b.key.index);
  const played=pressed.length?matchPlayed(pressed.map(({key})=>key.m)):null;
  if(played&&played.status!=='empty'){renderPlayed(host,played,pressed,s);return;}
  const match=matches[0],members=match?.members??[],labels=new Map();
  if(members.length&&pressed.length){
   const policy=equivalencePolicy(s,match.family&&s.basis.includes(2)?'octave':'exact');
   const equal=(a,b)=>quotientCoordinate(policy,a).key===quotientCoordinate(policy,b).key;
   // Locate the common transposition, then associate each played button with its ratio member.
   for(const anchor of members){
    const shift=pressed[0].key.m.map((v,i)=>v-anchor.coordinate[i]),used=new Set(),links=[];
    for(const {key} of pressed){const point=key.m.map((v,i)=>v-shift[i]),index=members.findIndex((m,i)=>!used.has(i)&&equal(m.coordinate,point));if(index<0){links.length=0;break;}used.add(index);links.push(members[index].ratio);}
    if(links.length===pressed.length){pressed.forEach(({key},i)=>labels.set(key.index,links[i]));break;}
   }
  }
  const columns=pressed.map(({key,pitch},i)=>`<section class="live-note-column" aria-label="Button ${key.index}">${labels.size?`<strong class="live-ratio-member" ${i?'data-ratio-colon':''}>${esc(labels.get(key.index))}</strong>`:''}<span title="Button number">#${key.index}</span><span title="Scale degree">${key.degree>=0?'Deg '+key.degree:'Outside'}</span><span title="Cents modulo period">${fmt(mod(pitch,s.p),2)} ¢</span><span title="Sounding frequency">${fmt(frequencyFor(pitch,getHz()),2)} Hz</span></section>`).join('');
  const ratios=[...new Set(matches.map(m=>m.label))];
  const chord=ratios.length?`<div class="live-note-chord" aria-label="Chord ratio">${labels.size?'':`<strong>${esc(ratios[0])}</strong>`}${match.family?'<small>Chord family</small>':''}${ratios.length>1?`<details><summary>Other interpretations</summary>${ratios.slice(1).map(r=>`<p>${esc(r)}</p>`).join('')}</details>`:''}</div>`:pressed.length>1?'<p class="live-notes-empty">No catalogue match</p>':'';
  host.innerHTML=columns?`${labels.size?'':chord}<div class="live-note-columns">${columns}</div>${labels.size?chord:''}`:ratios.length?chord:'<p class="live-notes-empty">Play keys to see note and chord data</p>';

 }
 // Chords built on the selected key: every directory chord that can stand on the key's Play-scale
 // degree (getBassEntries, the directory's shared bass list), voiced close above this key's own
 // register and placed exactly on the layout with this key as the bass, within reach. Shapes the
 // board-local search (chordsWithKey: the finder's JI limit, tolerance and reach rules) finds with this
 // key lowest, but which no directory entry voices, follow as "more on this layout".
 let harmonyCache=null;
 const SIZES=[3,4,5,6],NO_ENTRIES=Object.freeze([]);
 function harmoniesAt({size=3,reach=6}={}){
  let cfg,s,b;
  try{cfg=config();s=state();b=boardFor(s,cfg);}catch{return null;}
  size=SIZES.includes(size)?size:3;reach=Math.max(2,Math.min(12,Math.round(Number(reach))||6));
  const key=b.keys[cfg.selected];
  if(!key||key.command||!key.enabled)return {key:null,size,reach,harmonies:[],count:0};
  const keyInfo={index:key.index,cents:key.c,degree:key.degree},settings={limit:cfg.limit,tolerance:cfg.tolerance};
  // One shared empty list keeps the cache valid when there are no entries (or no directory).
  const listed=key.degree>=0?getBassEntries({scale:'play',degree:key.degree}):NO_ENTRIES,entries=listed===null?null:listed?.length?listed:NO_ENTRIES;
  const signature=JSON.stringify([boardSignature(s,cfg),key.index,size,reach]);
  if(harmonyCache?.signature===signature&&harmonyCache.entries===entries)return harmonyCache.result;
  const octave=s.basis.includes(2)?mapRatio(2,1,s):null,octaveCents=octave?cents(s,octave):null;
  // Octave-reduced, order-free key of a shape relative to its bass, so an open voicing finds its chord.
  const classKey=shape=>shape.map(m=>{if(!octave)return m.join(',');const k=Math.floor(cents(s,m)/octaveCents+1e-9);return [m[0]-k*octave[0],m[1]-k*octave[1]].join(',');}).sort().join(';');
  const harmonies=[],covered=new Map();
  for(const e of entries??[]){
   if(e.classCount!==size||e.bass[1]!==key.m[1])continue;
   // The entry is voiced from the degree's home register; move it to this key's register.
   const lift=key.m[0]-e.bass[0],coords=e.coords.map(m=>[m[0]+lift,m[1]]),shape=coords.map(m=>[m[0]-coords[0][0],m[1]-coords[0][1]]);
   covered.set(classKey(shape),e);
   let placements;try{placements=chordPlacements(b,coords,key.index,{exact:true}).filter(p=>p.keys[0]===key.index&&p.reach<=reach);}catch{continue;}
   if(!placements.length)continue;
   placements.sort((x,y)=>x.reach-y.reach||x.keys.join(',').localeCompare(y.keys.join(',')));
   harmonies.push({source:'directory',label:e.label,role:e.role,rowId:e.row.id,member:e.member,shape,placements,reach:placements[0].reach});
  }
  let error=null;
  if(size<=4){
   try{
    const found=chordsWithKey(s,b,key.index,{size,reach,other:false,limit:cfg.limit,primeLimit:cfg.primeLimit,tolerance:cfg.tolerance});
    for(const g of found.groups){
     const placements=g.placements.filter(p=>p.keys[0]===key.index);
     if(!placements.length||harmonies.some(h=>h.source==='directory'&&JSON.stringify(h.shape)===JSON.stringify(g.shape)))continue;
     const chord=covered.get(classKey(g.shape));
     harmonies.push({source:'layout',label:g.label,role:chord?`open voicing of ${chord.label} (${chord.role})`:'not in the directory',shape:g.shape,placements,reach:placements[0].reach,max:g.max,mapped:g.mapped,total:g.total});
    }
   }catch(e){error=e.message;}
  }
  const result={key:keyInfo,size,reach,harmonies,count:harmonies.length,loading:entries===null,settings,...(error?{error}:{})};
  harmonyCache={signature,entries,result};
  return result;
 }
 // Lights placement `placement` of harmony `index` (from the last harmoniesAt result) on the board.
 function showHarmony(index,placement=0,options={}){
  const r=harmoniesAt(options),h=r?.harmonies[index];
  if(!h||!Number.isInteger(placement)||placement<0||placement>=h.placements.length)return false;
  catalogue.clear();scaleHighlight=null;if(getHarmonicMode())harmonicPlay.select(-1);
  const f=finderState(state(),config()); // brings the finder's signature up to date so it keeps the groups set below
  f.imported=null;f.groups=[{shape:h.shape,label:h.label,max:h.max,mapped:h.mapped,total:h.total,placements:h.placements}];
  f.selected=0;f.placement=placement;f.searched=true;
  refresh();return true;
 }
 // Sounds the notes of some board keys together (the app's normal chord audition).
 function hearKeys(indices){
  const b=buildBoard(state(),config());
  const keys=indices.map(i=>b.keys[i]).filter(k=>k&&!k.command&&k.enabled);
  if(!keys.length)return false;
  play(keys.map(k=>k.c));return true;
 }
 // The fingerings of the chord now on the Play board, from whichever source holds it
 // (the harmonic selection or the finder), and a way to light one of them. Lighting goes
 // through the normal highlight, so the screen and a physical board both follow.
 function fingerings(){
  let harmonic=null,finder=null;
  if(getHarmonicMode()){
   const m=harmonicPlay.model();
   if(m.selection&&m.placements.length)harmonic={source:'harmonic',label:m.selection.label??'Chord',index:m.fingering,placements:m.placements.map(p=>({keys:[...p.keys],reach:p.reach,periodShift:p.periodShift}))};
  }
  try{
   const f=finderState(state(),config()),g=f.groups[f.selected];
   if(g&&g.placements.length)finder={source:'finder',label:g.label,index:f.placement,placements:g.placements.map(p=>({keys:[...p.keys],reach:p.reach,periodShift:p.periodShift}))};
  }catch{/* no buildable layout: no fingerings */}
  // A fingering already highlighted from the harmonic selection wins; otherwise whichever source holds a chord.
  return harmonic&&(catalogueHighlight||!finder)?harmonic:finder??harmonic;
 }
 function showFingering(index){
  const f=fingerings();
  if(!f)return false;
  if(f.source==='harmonic'){if(!harmonicPlay.select(index))return false;}
  else{if(!Number.isInteger(index)||index<0||index>=f.placements.length)return false;finders[0].placement=index;}
  refresh();return true;
 }
 // What a physical board should show: the same fill, highlight and dimming the SVG uses,
 // as plain data. Read-only; null when the current layout cannot be built.
 function deviceSnapshot(){
  let cfg,s,b;
  try{cfg=config();s=state();b=boardFor(s,cfg);}catch{return null;}
  const colors=mosLayers(s,cfg,b),overlay=highlighted(s,cfg),scaleOn=scaleHighlight?.identity===tuningIdentity(s)?scaleHighlight:null;
  return {keys:b.keys.map((k,i)=>{
   if(k.command)return {index:i,command:true,enabled:false,color:null,layoutColor:null,marked:false,lit:false,m:k.m,c:k.c};
   const look=keyAppearance(k,i,{colors,overlay,scaleOn,chord:cfg.chord});
   return {index:i,command:false,enabled:!!k.enabled,color:look.fill,layoutColor:look.layoutColor,marked:look.marked,lit:look.lit,m:k.m,c:k.c};
  })};
 }
 return {render,deviceSnapshot,fingerings,showFingering,harmoniesAt,showHarmony,hearKeys,refreshCatalogue,acceptHarmonicSelection:value=>{syncHarmonicMode();harmonicPlay.accept(value);},initLayouts,prepareForTemperament,preserveCurrentLayout,input,change,click,press,updateLiveChord,restore,showChord,showScale,clearHighlight:()=>{harmonicPlay.clear();catalogue.clear();scaleHighlight=null;finders.forEach(f=>{f.selected=-1;f.imported=null;});},restoreLegacyJI:data=>catalogue.restoreLegacy(data),destroy:()=>{catalogue.destroy();},serialize:()=>{config();return {configs:structuredClone(configs),catalogue:catalogue.serialize(),harmonic:harmonicPlay.serialize()};}};
}
