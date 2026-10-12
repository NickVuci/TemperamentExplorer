import {createLayoutPresets} from './layout-presets.mjs';
import {layoutPresetForState,layoutPresetConfigKey,mappingKey,layoutKey} from './layout-preset-data.mjs';
import {createLayoutChooser,activeLayout} from './layout-chooser.mjs';
import {BUILTIN_LAYOUTS,builtinLayoutsFor} from './builtin-layouts.mjs';
import {findScaleMilestones,scaleDefaultKey} from '../core/scale-milestones.mjs';
import {createHarmonicPlayWorkspace} from '../harmonic/harmonic-play-ui.mjs';
import {createShapeExplorer} from '../shapes/shape-explorer-ui.mjs';
import {validatePeriodPlacement,validateCopyPeriodStep} from './hexboard-wrapping.mjs';
import {tuningIdentity} from '../ui/material-ui.mjs';
import {palettes,validColor,mosLayers,keyColor} from './hexboard-colors.mjs';
import {boardPicture,boardSvg,deviceFrame,fingeringMap} from './hexboard-view.mjs';
import {inspectCoordinateChord} from '../harmonic/harmonic-inspection.mjs';
import {renderCoordinateAssessment} from '../harmonic/harmonic-inspection-ui.mjs';
import {chordPlacements,chordsWithKey} from './hexboard-chords.mjs';
import {MAX_CHORD_TONES} from '../chords/chord-identity.mjs';
import {scaleChoices, MAX_SCALE_SIZE, mapRatio} from '../core/engine.mjs';
import {validateJILimits, DEFAULT_ODD_LIMIT} from '../core/ji-limit-engine.mjs';
import {baseOptions, flipPlacementVector, migrateLayoutMirrors, buildBoard, boardMatches, exportHexboard, fillBoard, commands} from './hexboard.mjs';
import {mod, coordinateCents as cents} from '../core/pitch.mjs';
import {equivalencePolicy,quotientCoordinate} from '../harmonic/harmonic-equivalence.mjs';
import {frequencyFor} from '../ui/audio.mjs';
import {esc,option} from '../ui/ui.mjs';
import {rootedChordName} from '../harmonic/harmonic-bass.mjs';
const fmt=(x,n=3)=>Number(x).toFixed(n);
const signed=x=>(x>=0?'+':'')+x;
const defaults=()=>({periodWrapping:true,showPeriodLabels:false,periodPlacement:null,copyPeriodStep:1,registerAlignment:'scale',base:7,scaleFilter:'2',offset:0,style:'bosanquet',rotation:0,mirror:false,flipHorizontal:false,flipVertical:false,center:65,register:0,deviceRotation:1,outside:false,ap:1,ag:0,bp:0,bg:1,tolerance:10,limit:DEFAULT_ODD_LIMIT,primeLimit:null,root:65,selected:65,chord:[],selectChord:false,palette:'spectrum',layerGrowth:'balanced',layerColors:{},keyColors:{},degreeColors:{}});
const validColorMap=(map,min,max,excluded)=>map&&typeof map==='object'&&!Array.isArray(map)&&Object.entries(map).every(([n,v])=>/^\d+$/.test(n)&&Number(n)>=min&&Number(n)<=max&&!excluded?.has(Number(n))&&validColor(v));
// matchPlayed reads held keys against the harmony directory; null keeps the curated recognizer's
// reading.
export function createHexboardWorkspace({matchPlayed=()=>null,getJI,setJI,getStates,play,refresh,notify,download,getHz,onCollect,onInspect,getBassEntries=()=>[],getShapeDirectory=()=>null,onFocusHarmony=()=>false,onBrowseHarmony=()=>{},onFitHarmonicScale=()=>{},onSearch=()=>{},presetStore}){
 // The finder holds one chord to place (selected keys, a Note → chords pick, or a chord from elsewhere).
 const freshFinder=()=>({groups:[],selected:-1,placement:0,signature:'',imported:null});
 // The Chords panel's mode: 'shapes' (the default: a chord's key patterns and fingerings), 'places' (Chord →
 // places: one exact voicing) or 'notes' (Note → chords); searchText is the Chord → places draft.
 let chordMode='shapes',searchText='';
 let scaleHighlight=null,harmonicHighlight=null,shapeHighlight=null,coverageKey=null,keepRestoredBase=false;
 const refreshLayoutChooser=()=>{const doc=globalThis.document,host=doc?.querySelector('.layout-recommendations');if(!host)return;const active=doc.activeElement,editing=active?.dataset?.layoutName!==undefined,selection=editing?[active.selectionStart,active.selectionEnd]:null;const cfg=config(),saved=savedLayouts.catalog();host.outerHTML=chooser.markup(state(),cfg,saved,'chooser');const options=doc.querySelector('.layout-recommendation-options');if(options)options.outerHTML=chooser.markup(state(),cfg,saved,'advanced');if(editing){const input=doc.querySelector('[data-layout-name]');if(input&&!input.disabled){input.focus({preventScroll:true});if(selection[0]!=null)input.setSelectionRange(...selection);}}};
 const chooser=createLayoutChooser();
 const savedLayouts=createLayoutPresets({refresh:refreshLayoutChooser,notify,store:presetStore});
 // A layout record by id: a built-in layout or one of the site's saved layouts.
 const presetById=id=>BUILTIN_LAYOUTS.find(p=>p.id===id)??savedLayouts.catalog().items.find(p=>p.id===id);
 let colorScope='key',configs=[defaults()],finders=[freshFinder()],defaultScope='',buttonColorContext=null;
 const state=()=>getStates()[0];

 const harmonicPlay=createHarmonicPlayWorkspace({getState:state,getBoard:()=>boardFor(state(),config()),getConfig:()=>config(),getNear:()=>config().center,refresh,notify,play,onCollect,onBrowse:onBrowseHarmony,onFitScale:onFitHarmonicScale,onHighlight:value=>{harmonicHighlight=value;scaleHighlight=null;}});
 const shapes=createShapeExplorer({getState:state,getBoard:()=>boardFor(state(),config()),getConfig:config,getSettings:()=>getJI?.(state())??{limit:config().limit,primeLimit:config().primeLimit},getSelection:()=>harmonicPlay.model().selection,getSelectedKeys:()=>[...configs[0].chord],getDirectory:getShapeDirectory,classify:coordinates=>matchPlayed(coordinates),onOpenHarmony:onFocusHarmony,onPractise:()=>globalThis.document?.querySelector('#fingering-game')?.scrollIntoView({block:'nearest',behavior:'smooth'}),refresh:()=>refresh('highlight'),notify,play,onCollect,store:presetStore,onHighlight:value=>{shapeHighlight=value;if(value){harmonicHighlight=null;scaleHighlight=null;}}});
 function config(){const s=state(),cfg=configs[0],bs=baseOptions(s);if(getJI){const ji=getJI(s);cfg.limit=ji.limit;cfg.primeLimit=ji.primeLimit??null;cfg.tolerance=ji.tol;}const target=getJI?{limit:cfg.limit,primeLimit:cfg.primeLimit}:undefined,defaultKey=scaleDefaultKey(s,target);// The automatic base follows mapping and JI-target changes, never a retuning.
if(defaultKey!==coverageKey){const coverage=findScaleMilestones(s,target);if(!keepRestoredBase&&bs.some(v=>v.n===coverage.intervalMOS?.n)){cfg.base=coverage.intervalMOS.n;cfg.offset=0;}coverageKey=defaultKey;keepRestoredBase=false;}if(!bs.some(v=>v.n===cfg.base))cfg.base=(bs.find(v=>v.n===7)||bs.filter(v=>v.n<s.n).at(-1)||bs[0])?.n||2;if(!bs.length&&['bosanquet','compressed'].includes(cfg.style))cfg.style='period';cfg.base=Math.min(cfg.base,s.n);cfg.offset=Math.max(0,Math.min(cfg.offset,s.n-cfg.base));return cfg;}
 function buttonColorContextKey(){const s=state(),cfg=config();return JSON.stringify([mappingKey(s),s.n,s.mode,layoutKey(cfg),cfg.layerGrowth]);}
 function rememberButtonColorContext(){buttonColorContext=buttonColorContextKey();}
 function syncButtonColorContext(){const next=buttonColorContextKey();if(buttonColorContext!==null&&buttonColorContext!==next){config().keyColors={};config().degreeColors={};}buttonColorContext=next;}
 function prepareForTemperament(){syncButtonColorContext();const status=savedLayouts.catalog().status;if(status==='idle'){if(globalThis.document)void initLayouts();return false;}if(status==='ready'||status==='error')return applyDefaultForCurrentMapping(false);return false;}
 function render(){prepareForTemperament();const cfg=config(),s=state(),bs=baseOptions(s),sizes=scaleChoices(s,cfg.scaleFilter);let b,error='';try{b=buildBoard(s,cfg);}catch(e){error=e.message;}
 if(b?.wrapping&&!b.keys[cfg.root]?.enabled)cfg.root=b.keys.find(k=>k.enabled&&k.degree===0)?.index??b.keys.find(k=>k.enabled)?.index??cfg.root;
 const midiRoot=69+12*Math.log2(getHz()/440),midiOutside=b?.keys.filter(k=>k.enabled&&(midiRoot+k.c/100<0||midiRoot+k.c/100>=128)).length||0,previewOutside=b?.keys.filter(k=>k.enabled&&(getHz()*2**(k.c/1200)<15||getHz()*2**(k.c/1200)>16000)).length||0;
 return `<div class="hex-workspace"><div class="play-toolbar">${chooser.markup(state(),cfg,savedLayouts.catalog(),'chooser')}${error?'':'<button data-hex-action="export" class="primary">Export for HexBoard</button>'}</div><details class="layout-settings" ${globalThis.document?.querySelector('.hex-workspace .layout-settings')?.open?'open':''}><summary>Advanced Layout Options</summary>${chooser.markup(state(),cfg,savedLayouts.catalog(),'advanced')}<div class="hex-controls hex-primary-controls hex-top-controls"><label class="hex-instrument-control"><span>Instrument</span><select data-instrument><option value="hexboard" selected>HexBoard</option><option value="lumatone" disabled>Lumatone (Coming soon)</option><option value="linnstrument" disabled>LinnStrument (Coming soon)</option><option value="miso" disabled>Miso (Coming soon)</option><option value="axis" disabled>Axis (Coming soon)</option></select></label><label><span>Target scale</span><select data-hex-field="target">${sizes.map(x=>option(x.n,`${x.n} · ${x.signature}${x.retained?' · current (outside filter)':''}`,s.n)).join('')}</select></label><label><span>Target mode</span><select data-hex-field="mode">${Array.from({length:s.n},(_,i)=>option(i,`${i+1} / ${s.n}`,s.mode)).join('')}</select></label><label><span>Base subset</span><select data-hex-field="base">${(bs.length?bs:[{n:cfg.base,signature:'Generator subset'}]).map(v=>option(v.n,`${v.n} · ${v.signature}`,cfg.base)).join('')}</select></label><label><span>Base subset position</span><select data-hex-field="offset">${Array.from({length:Math.max(1,s.n-cfg.base+1)},(_,i)=>option(i,`${i+1} / ${s.n-cfg.base+1}`,cfg.offset)).join('')}</select></label><label><span>Musical rotation</span><select data-hex-field="rotation">${Array.from({length:6},(_,i)=>option(i,`${i*60}°`,cfg.rotation)).join('')}</select></label><label><span>Board orientation</span><select data-hex-field="deviceRotation">${Array.from({length:4},(_,i)=>option(i,`${i*90}°`,cfg.deviceRotation)).join('')}</select></label><button type="button" class="hex-toggle-button" data-hex-toggle="flipHorizontal" aria-pressed="${cfg.flipHorizontal?'true':'false'}">Flip horizontal axis</button><button type="button" class="hex-toggle-button" data-hex-toggle="flipVertical" aria-pressed="${cfg.flipVertical?'true':'false'}">Flip vertical axis</button></div>
 ${wrappingControls(cfg,b)}
 <details class="scale-advanced" ${globalThis.document?.querySelector('.hex-workspace .scale-advanced')?.open?'open':''}><summary>Advanced options</summary><div class="hex-controls"><label>Scales<select data-hex-field="scaleFilter">${option('all','All',cfg.scaleFilter)}${option('2','2 step sizes',cfg.scaleFilter)}${option('3','3 step sizes',cfg.scaleFilter)}</select></label><label>Layout family<select data-hex-field="style">${option('bosanquet','Bosanquet · L and L − s',cfg.style)}${option('compressed','Compressed · L + s and L',cfg.style)}${option('period','Period and generator',cfg.style)}${option('manual','Custom musical axes',cfg.style)}</select></label><label class="checklabel"><input type="checkbox" data-hex-field="outside" ${cfg.outside&&!cfg.periodWrapping?'checked':''} ${cfg.periodWrapping?'disabled':''}>Play notes outside target scale</label></div>
 <details><summary>Anchor and custom coordinates</summary><div class="hex-controls"><label>Tonic button<input type="number" min="0" max="139" data-hex-field="center" value="${cfg.center}"></label><label>Register · periods<input type="number" min="-8" max="8" data-hex-field="register" value="${cfg.register}"></label>${[['ap','Right: periods'],['ag','Right: generators'],['bp','Up-right: periods'],['bg','Up-right: generators']].map(([k,l])=>`<label>${l}<input type="number" min="-1000" max="1000" data-hex-field="${k}" value="${cfg[k]}" ${cfg.style==='manual'?'':'disabled'}></label>`).join('')}</div><p>Custom axes must cover the complete integer temperament lattice. Reference pitch: ${fmt(getHz(),1)} Hz at 0 cents.</p></details>
 ${!error?colorMarkup(s,cfg,b):''}</details><div class="panelactions hex-board-actions"><button data-hex-action="center">Put tonic on selected button</button><button data-hex-action="fill">Fill note buttons</button></div></details>
 ${error?`<p class="empty" role="status">${esc(error)}</p>`:` <div class="hex-layout"><div><div class="hex-board-scroll">${svg(s,cfg,b)}</div>${b.missing.length?`<p class="notice">Missing target degrees: ${b.missing.join(', ')}. Try another rotation, base MOS, or tonic button to fit more of the scale.</p>`:''}
 ${midiOutside||previewOutside?`<p class="notice">${midiOutside?`${midiOutside} enabled buttons fall outside the HexBoard’s MPE pitch range at this tonic. `:''}${previewOutside?`${previewOutside} are outside this app’s audio range (15–16000 Hz). `:''}Adjust the register, tonic, or axes; exported coordinates are retained.</p>`:''}
 <details class="hex-data-box" ${globalThis.document?.querySelector('.hex-workspace .hex-data-box')?.open?'open':''}><summary>Key data</summary><div class="hex-custom-color-host">${customColorMarkup(s,cfg,b,b.keys[cfg.selected])}</div><div class="hex-inspector">${inspect(s,cfg,b)}</div>
 <div class="hex-axis-info">${cfg.periodWrapping?'<span>Within each period copy:</span>':''}<span>Right: <b>${fmt(cents(s,b.a))} ¢</b> (${b.a[0]}P + ${b.a[1]}G)</span><span>Up-right: <b>${fmt(cents(s,b.b))} ¢</b> (${b.b[0]}P + ${b.b[1]}G)</span>${b.base.large!==null?`<span>Base ${b.base.signature}: L ${fmt(b.base.large)}¢; s ${fmt(b.base.small)}¢</span>`:''}</div><div class="hex-metrics"><span><b>${b.coverage}/${s.n}</b> target degrees on board</span><span><b>${b.playable}/133</b> enabled note buttons</span><span><b>${fmt(b.span,0)}¢</b> pitch range</span></div></details></div>
 <aside class="hex-chord-panel">${nowPlayingMarkup(cfg)}${scaleMarkup(s,cfg,b)}${chordsMarkup(s,cfg)}<div data-play-slot="practice"></div></aside></div>
 <p class="viewnote">Export contains this finite button map, the cents table, target scale and colors, named after the temperament, scale and layout. Import the JSON into the <a href="https://shapingthesilence.github.io/HexBoard/" target="_blank" rel="noreferrer">HexBoard companion app</a>, review it, and use Save to HexBoard. Turning or mirroring the layout here regenerates the pitches; exported pitches are explicit button assignments. Requires firmware with cents-table and explicit-map support.</p>`}
 </div>`;
 }

 function wrappingControls(cfg,b){const w=b?.wrapping;return `<div class="hex-controls hex-period-controls"><label>Period Wrapping<select data-hex-field="periodWrapping">${option('off','Off',cfg.periodWrapping?'on':'off')}${option('on','On',cfg.periodWrapping?'on':'off')}</select></label>${w?`<label class="checklabel"><input type="checkbox" data-hex-field="showPeriodLabels" ${cfg.showPeriodLabels?'checked':''}>Show period labels</label><label>Column shift<input type="number" min="-1000" max="1000" step="1" data-hex-period="column" value="${w.vector.column}"></label><label>Row shift<input type="number" min="-1000" max="1000" step="1" data-hex-period="row" value="${w.vector.row}"></label><label>Register alignment<select data-hex-field="registerAlignment">${option('scale','Scale order · automatic',cfg.registerAlignment)}${option('manual','Manual copy shifts',cfg.registerAlignment)}</select></label><label>Pitch shift per copy · periods<select data-hex-field="copyPeriodStep" ${cfg.registerAlignment!=='manual'?'disabled':''}>${[...new Set([...Array.from({length:17},(_,i)=>i-8),w.copyPeriodStep])].sort((a,b)=>a-b).map(n=>option(n,`${signed(n)} · ${signed(Number(fmt(n*state().p)))}¢`,w.copyPeriodStep)).join('')}</select></label><button data-hex-action="period-reverse" title="Negate the physical column and row offsets">Reverse placement</button><button data-hex-action="period-auto">Reset / Auto</button><span class="dim">${w.manual?'Manual placement':'Automatic placement'}</span>`:''}</div>${w?`${w.alignmentIssue?`<p class="notice" role="status">${esc(w.alignmentIssue)}</p>`:''}${w.overlaps.length?`<p class="notice" role="alert">${w.overlaps.length} overlapping keys marked × are disabled. Adjust the placement or use Reset / Auto before exporting.</p>`:''}`:''}`;}
 function input(el){if(shapes.input(el))return true;if(el.dataset?.hexSearchText!==undefined){searchText=el.value.slice(0,300);return true;}if(chooser.input(el))return true;if(!el.dataset.hexPeriod)return false;const focused=globalThis.document?.activeElement===el;change(el);if(focused)globalThis.document?.querySelector('[data-hex-period="'+el.dataset.hexPeriod+'"]')?.focus();return true;}
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
  if(f.signature!==signature){f.groups=[];f.selected=-1;f.placement=0;f.signature=signature;if(f.imported?.identity===tuningIdentity(s)){const g=f.imported;f.groups=[{...g,placements:chordPlacements(buildBoard(s,cfg),g.coordinates,cfg.center,g)}];f.selected=0;}else f.imported=null;}return f;
 }
 function highlighted(s,cfg){shapes.sync();if(shapeHighlight)return shapeHighlight;if(harmonicHighlight)return harmonicHighlight;const f=finderState(s,cfg);return f.groups[f.selected]?.placements[f.placement]||null;}
 function finderMarkup(s,cfg){const f=finderState(s,cfg),g=f.groups[f.selected],p=g?.placements[f.placement];let assessment='';if(g){const coordinates=g.coordinates??g.shape;if(coordinates?.length){const key=JSON.stringify([s.basis,s.rows,s.p,s.g,cfg.limit,cfg.primeLimit,cfg.tolerance,coordinates]);if(g.analysisKey!==key){g.analysis=inspectCoordinateChord(s,coordinates,{limit:cfg.limit,primeLimit:cfg.primeLimit,tolerance:cfg.tolerance,other:false});g.analysisKey=key;}assessment=renderCoordinateAssessment(g.analysis);}}if(!g)return '';return `<section class="hex-chord-finder">  ${g?`<p role="status"><b>${esc(g.label)}</b> · ${g.placements.length?p?`Placement ${f.placement+1}/${g.placements.length} · buttons ${p.keys.join(', ')} · reach ${p.reach}${g.exact?` · register ${p.periodShift>=0?'+':''}${p.periodShift} periods`:''}`:'Choose a placement':'No complete placement on the enabled keys. Try another voicing or layout.'}</p><div class="panelactions"><button data-hex-action="chords-prev" ${g.placements.length>1?'':'disabled'}>← Previous placement</button><button data-hex-action="chords-next" ${g.placements.length>1?'':'disabled'}>Next placement →</button><button data-hex-action="chords-play" ${p?'':'disabled'}>▶ Hear highlighted chord</button><button data-hex-action="chords-clear">Clear highlight</button></div>${finderChoices(s,cfg,g,f.placement)}`:''}
 ${assessment}${g?.placements.limited?'<p class="viewnote">Showing the first 20,000 placements, starting near the tonic button.</p>':''}
 ${g?`<p class="viewnote">${g.exact?`Selected degrees and voicing${g.periodCopies?'; period copies allowed':''}.`:'Same voicing, transposed across enabled keys.'} Clear highlight or press Escape to return to the normal layout.</p>`:''}</section>`;}
 // The finder's placements as board miniatures, 24 at a time around the current one, to pick by sight.
 function finderChoices(s,cfg,g,current){
  if(g.placements.length<2)return '';const b=boardFor(s,cfg),start=Math.floor(current/24)*24;
  return `<div class="fingering-choices">${g.placements.slice(start,start+24).map((p,i)=>`<button class="fingering-choice" data-hex-action="chords-pick" data-index="${start+i}" aria-pressed="${start+i===current}" aria-label="Placement ${start+i+1}: buttons ${p.keys.join(', ')}">${fingeringMap(b,p.keys,{rotation:cfg.deviceRotation??0})}<span>${start+i+1}</span></button>`).join('')}</div>`;
 }
 // Now playing: the live reading of held keys, and keys selected as a chord, with a way to place them.
 function nowPlayingMarkup(cfg){return `<section class="play-now" aria-label="Now playing"><h3>Now playing</h3><div class="hex-live-chord-readout" data-live-chord-readout aria-live="polite" aria-atomic="true"><p class="live-notes-empty">Play keys to see note and chord data</p></div>${selectionControls(cfg)}</section>`;}
 // Redrawn on each key press, so the selection count and its actions follow the selected keys.
 function selectionControls(cfg){return `<div class="panelactions play-selection"><label class="checklabel"><input type="checkbox" data-hex-field="selectChord" ${cfg.selectChord?'checked':''}>Select chord notes</label><button data-hex-action="play-chord" ${cfg.chord.length?'':'disabled'}>▶ Play selection (${cfg.chord.length}/${MAX_CHORD_TONES})</button><button data-hex-action="chords-selection" ${cfg.chord.length>=2?'':'disabled'}>Find places</button><button data-hex-action="shape-selection" ${cfg.chord.length?'':'disabled'}>Identify shape</button><button data-hex-action="clear" ${cfg.chord.length?'':'disabled'}>Clear</button></div>`;}
 // One Chords panel. Shapes: pick a chord, see its key patterns and their fingerings. Chord → places: search
 // the directory or take the chord sent from Discover, then the places of whichever chord is being placed. Note → chords: the chords on the selected key (its
 // own live panel, key-harmonies-ui, mounted into the slot by the app).
 function chordsMarkup(s,cfg){const tab=(mode,label)=>`<button role="tab" data-hex-action="chord-mode" data-mode="${mode}" aria-selected="${chordMode===mode}">${label}</button>`;
  const body=chordMode==='notes'?'<div data-play-slot="note-chords"></div>':chordMode==='shapes'?shapes.render():(`<div class="play-chord-search"><label>Find a chord<input type="search" data-hex-search-text maxlength="300" value="${esc(searchText)}" placeholder="4:5:6, 5:6:8 or 1/6:5:4"></label><button data-hex-action="chord-search" class="primary">Find</button></div>${finderMarkup(s,cfg)}${harmonicPlay.render()}`);
  return `<section class="play-chords" aria-label="Chords"><h3>Chords</h3><div class="play-chord-modes" role="tablist">${tab('shapes','Shapes')}${tab('places','Chord → places')}${tab('notes','Note → chords')}</div>${body}</section>`;}
 // Changing mode hands the board highlight to the new mode: leaving Shapes clears its lit shape, entering
 // it clears a lit Chord → places fingering.
 function setChordMode(mode){
  const next=['shapes','places','notes'].includes(mode)?mode:'shapes';
  if(chordMode==='shapes'&&next!=='shapes')shapes.suspend();else if(chordMode!=='shapes'&&next==='shapes')harmonicPlay.suspend();
  chordMode=next;
 }
 function showChord(coordinates,label,options={}){harmonicHighlight=null;scaleHighlight=null;const cfg=config(),s=state(),b=buildBoard(s,cfg),f=finderState(s,cfg);const source={label,exact:!!options.exact,periodCopies:!!options.periodCopies,coordinates:structuredClone(coordinates),identity:tuningIdentity(s)};f.imported=source;f.groups=[{...source,placements:chordPlacements(b,coordinates,cfg.center,options)}];f.selected=0;f.placement=0;return f.groups[0].placements.length;}
 function showScale(coordinates,label){harmonicHighlight=null;scaleHighlight={identity:tuningIdentity(state()),gens:coordinates.map(m=>m[1]),shift:0,label};finders.forEach(f=>{f.selected=-1;f.imported=null;});const s=state(),cfg=config(),b=buildBoard(s,cfg);const options=scalePlacements(b);scaleHighlight.shift=options.includes(0)?0:(options[0]??0);return options.length;}
 function scalePlacements(b){if(!scaleHighlight)return [];const available=new Set(b.keys.filter(k=>k.enabled).map(k=>k.m[1])),gens=scaleHighlight.gens;return [...available].map(g=>g-gens[0]).filter(offset=>gens.every(g=>available.has(g+offset))).sort((a,b)=>Math.abs(a)-Math.abs(b)||a-b);}
 function scaleMarkup(s,cfg,b){if(scaleHighlight?.identity!==tuningIdentity(s)){scaleHighlight=null;return '';}const h=scaleHighlight,options=scalePlacements(b),covered=new Set(b.keys.filter(k=>k.enabled&&h.gens.includes(k.m[1]-h.shift)).map(k=>k.m[1])).size;return `<section class="scale-highlight"><b>${esc(h.label)}</b><p>${covered}/${h.gens.length} notes represented on enabled keys.</p><div class="panelactions"><label>Placement<select data-hex-scale="shift">${[...new Set([h.shift,...options])].map(v=>option(v,`${v>=0?'+':''}${v} generators`,h.shift)).join('')}</select></label><button data-hex-action="scale-clear">Clear scale highlight</button></div>${options.length?'':'<p class="notice">No complete placement fits. Choose a larger target scale or another layout in Layout settings.</p>'}</section>`;}
 // The board picture: shown chord, scale highlight and chord selection over the layout (hexboard-view).
 function picture(s,cfg,b){if(scaleHighlight?.identity!==tuningIdentity(s))scaleHighlight=null;return boardPicture(s,cfg,b,{overlay:highlighted(s,cfg),scaleOn:scaleHighlight,chord:cfg.chord});}
 function svg(s,cfg,b){return boardSvg(picture(s,cfg,b),{keyClass:look=>look.index===cfg.selected?'is-selected':''});}
 function customColorMarkup(s,cfg,b,k){if(!k||k.command)return '';const colors=mosLayers(s,cfg,b),canDegree=k.degree>=0,scope=colorScope==='degree'&&canDegree?'degree':'key',override=scope==='degree'?cfg.degreeColors?.[k.degree]:cfg.keyColors?.[k.index],layerColor=canDegree?colors.layers[colors.degreeLayers[k.degree]]?.color:null,fallback=scope==='degree'?(validColor(cfg.degreeColors?.[k.degree])?cfg.degreeColors[k.degree]:layerColor):keyColor(k,colors),value=validColor(override)?override:fallback,canSetRoot=!(k.wrapped&&!k.enabled);return `<section class="hex-custom-color"><div class="hex-controls"><h4>Button ${k.index}</h4><select data-hex-color-scope aria-label="Apply color to">${option('key','Single button',scope)}${canDegree?option('degree','Scale degree',scope):''}</select><input type="color" data-hex-custom-color="${scope}" value="${value}" aria-label="Color for ${scope==='degree'?`degree ${k.degree}`:`button ${k.index}`}"><button data-hex-action="clear-custom-color" data-hex-color-target="${scope}" ${validColor(override)?'':'disabled'}>Use default color</button>${canSetRoot?'<button data-hex-action="root">Set interval root here</button>':''}</div></section>`;}
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
  const doc=globalThis.document,inspector=doc?.querySelector('.hex-inspector');if(inspector)inspector.innerHTML=inspect(s,cfg,b);
  const controls=doc?.querySelector('.play-selection');if(controls)controls.outerHTML=selectionControls(cfg);
  const identify=doc?.querySelector('[data-shape-action="identify"]');if(identify)identify.outerHTML=shapes.identifyButton();const editor=globalThis.document?.querySelector('.hex-custom-color-host');if(editor)editor.innerHTML=customColorMarkup(s,cfg,b,key);
 }
 function change(el){if(shapes.change(el))return true;if(harmonicPlay.change(el))return true;if(el.dataset.layoutChoice!==undefined){applyLayoutChoice(el.value);return true;}if(chooser.input(el))return true;if(el.dataset.hexPeriod){try{if(el.value==='')return true;const cfg=config(),b=buildBoard(state(),cfg),vector={...b.wrapping.vector,[el.dataset.hexPeriod]:Number(el.value)};validatePeriodPlacement(vector);cfg.periodPlacement=vector;cfg.chord=[];refresh();}catch(e){notify(e.message);const b=buildBoard(state(),config());el.value=String(b.wrapping.vector[el.dataset.hexPeriod]);}return true;}if(el.dataset.hexScale==='shift'){if(scaleHighlight)scaleHighlight.shift=Number(el.value);refresh();return true;}if(el.dataset.hexColorScope!==undefined){colorScope=el.value==='degree'?'degree':'key';refresh();return true;}if(el.dataset.hexCustomColor!==undefined){const scope=el.dataset.hexCustomColor,cfg=config(),b=buildBoard(state(),cfg),key=b.keys[cfg.selected];if(!validColor(el.value)){notify('Choose a valid button color.');return true;}if(scope==='degree'&&key?.degree>=0)cfg.degreeColors[key.degree]=el.value;else if(scope==='key'&&key&&!key.command)cfg.keyColors[key.index]=el.value;else notify('Choose a scale degree or hex button to color.');refresh();return true;}if(el.dataset.hexColor!==undefined){const n=Number(el.dataset.hexColor);if(Number.isInteger(n)&&n>=2&&n<=MAX_SCALE_SIZE&&validColor(el.value)){config().layerColors[n]=el.value;refresh();}else notify('Choose a valid layer color.');return true;}const f=el.dataset.hexField;if(!f)return false;try{const cfg=config();if(f==='target'||f==='mode'){if(f==='target'){state().n=Number(el.value);state().mode=0;}else state().mode=Number(el.value);cfg.chord=[];refresh(true);return true;}if(f==='flipHorizontal'||f==='flipVertical'){const checked=!!el.checked;if(cfg[f]!==checked&&cfg.periodPlacement)cfg.periodPlacement=flipPlacementVector(cfg.periodPlacement,cfg,f);cfg[f]=checked;cfg.chord=[];refresh();return true;}if(f==='periodWrapping'){cfg.periodWrapping=el.value==='on';cfg.chord=[];refresh();return true;}if(f==='registerAlignment'){if(!['scale','manual'].includes(el.value))throw Error('Choose a register alignment.');if(el.value==='manual'){const step=buildBoard(state(),cfg).wrapping?.copyPeriodStep??1;cfg.copyPeriodStep=Math.max(-8,Math.min(8,step));}cfg.registerAlignment=el.value;cfg.chord=[];refresh();return true;}if(f==='copyPeriodStep'){cfg.copyPeriodStep=validateCopyPeriodStep(Number(el.value));cfg.registerAlignment='manual';cfg.chord=[];refresh();return true;}const value=el.type==='checkbox'?el.checked:['style','palette','layerGrowth','scaleFilter'].includes(f)?el.value:Number(el.value);if(typeof value==='number'&&!Number.isFinite(value))throw Error('Enter a finite number.');if(f==='center'&&(!Number.isInteger(value)||value<0||value>139||commands.has(value)))throw Error('Choose a note button from 0 to 139, excluding command buttons.');if(['ap','ag','bp','bg','register'].includes(f)&&(!Number.isInteger(value)||Math.abs(value)>(f==='register'?8:1000)))throw Error('Use integer coordinates within the indicated range.');cfg[f]=f==='tolerance'?Math.max(0,Math.min(100,value)):value;if(f==='palette')cfg.layerColors={};if(!['selectChord','showPeriodLabels','tolerance','limit','palette','layerGrowth'].includes(f))cfg.chord=[];if(f==='base')cfg.offset=0;refresh();}catch(e){notify(e.message);refresh();}return true;}
 function click(el,shift=false){if(shapes.click(el))return true;if(harmonicPlay.click(el))return true;const node=el.closest?.('[data-hex-key],[data-hex-action],[data-hex-toggle]');if(!node)return false;if(node.dataset.hexToggle){const field=node.dataset.hexToggle;if(!['flipHorizontal','flipVertical'].includes(field))return false;const cfg=config(),value=!cfg[field];if(cfg[field]!==value&&cfg.periodPlacement)cfg.periodPlacement=flipPlacementVector(cfg.periodPlacement,cfg,field);cfg[field]=value;cfg.chord=[];refresh();return true;}try{const cfg=config(),s=state(),b=buildBoard(s,cfg);if(node.dataset.hexKey!==undefined){const i=Number(node.dataset.hexKey),key=b.keys[i];cfg.selected=i;if(cfg.selectChord&&key.enabled){if(cfg.chord.includes(i))cfg.chord=cfg.chord.filter(v=>v!==i);else if(cfg.chord.length<MAX_CHORD_TONES)cfg.chord.push(i);else notify(`Select up to ${MAX_CHORD_TONES} chord notes.`);}if(key.enabled)play([key.c]);refresh();return true;}
 const act=node.dataset.hexAction;if(act==='shape-selection'){setChordMode('shapes');void shapes.identify();return true;}if(act?.startsWith('layout-')){void layoutAction(act);return true;}if(act==='period-reverse'){if(b.wrapping){const v=b.wrapping.vector;cfg.periodPlacement=validatePeriodPlacement({column:-v.column||0,row:-v.row||0});cfg.chord=[];refresh();}return true;}if(act==='period-auto'){cfg.registerAlignment='scale';cfg.copyPeriodStep=1;cfg.periodPlacement=null;cfg.chord=[];refresh();return true;}if(act==='scale-clear'){scaleHighlight=null;refresh();return true;}if(act==='reset-colors'){cfg.layerColors={};cfg.keyColors={};cfg.degreeColors={};}if(act==='clear-custom-color'){const target=node.dataset.hexColorTarget,key=b.keys[cfg.selected];if(target==='degree'&&key?.degree>=0)delete cfg.degreeColors[key.degree];else delete cfg.keyColors[cfg.selected];}if(act.startsWith('chords-')){harmonicHighlight=null;scaleHighlight=null;const f=finderState(s,cfg),g=f.groups[f.selected];if(act==='chords-selection'){showChord(cfg.chord.map(i=>b.keys[i].m),'Selected keys');setChordMode('places');}if(act==='chords-clear'){f.selected=-1;f.imported=null;}if(g?.placements.length){if(act==='chords-pick'&&Number.isInteger(Number(node.dataset.index))&&g.placements[Number(node.dataset.index)])f.placement=Number(node.dataset.index);if(act==='chords-next'||act==='chords-prev')f.placement=(f.placement+(act==='chords-next'?1:-1)+g.placements.length)%g.placements.length;if(act==='chords-play')play(g.placements[f.placement].keys.map(i=>b.keys[i].c));}refresh();return true;}if(act==='chord-mode'){setChordMode(node.dataset.mode);refresh();return true;}if(act==='chord-search'){const text=(globalThis.document?.querySelector('[data-hex-search-text]')?.value??searchText).trim();searchText=text;if(text)void onSearch(text);return true;}if(act==='fill'){const fit=fillBoard(s,cfg);Object.assign(s,{n:fit.n,mode:fit.mode});if(fit.config)Object.assign(cfg,fit.config);cfg.offset=fit.offset;cfg.outside=false;cfg.chord=[];refresh(true);notify(`Selected ${s.n} notes, mode ${s.mode+1}: all 133 note buttons belong to the scale.`);return true;}if(act==='root')cfg.root=cfg.selected;if(act==='center'){cfg.center=cfg.selected;cfg.root=cfg.selected;cfg.chord=[];}if(act==='clear')cfg.chord=[];if(act==='play-chord')play(cfg.chord.map(i=>b.keys[i]).filter(k=>k.enabled).map(k=>k.c));if(act==='export'){const named=activeLayout(s,cfg,savedLayouts.catalog()),out=exportHexboard(s,cfg,getHz(),named?{name:named.kindName??named.name,source:named.builtin?'Built-in':'Saved'}:{});download(out.fileName,JSON.stringify(out.file,null,2),'application/json');notify(`Exported ${out.title} for HexBoard. ${out.board.coverage}/${s.n} target degrees represented; pitch rounding ≤ ${fmt(out.maxError,5)}¢.`);}refresh();}catch(e){notify(e.message);}return true;}
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
 function restore(data){shapes.restore(data?.shapes);shapeHighlight=null;chordMode=['shapes','places','notes'].includes(data?.chordMode)?data.chordMode:'shapes';harmonicPlay.restore(data?.harmonic);chooser.reset();coverageKey=null;keepRestoredBase=!!data;scaleHighlight=null;finders=[freshFinder()];if(!data){defaultScope='';configs=[defaults()];return;}// Sessions from the removed two-board comparison hold a second layout, which is ignored.
if(!Array.isArray(data.configs)||![1,2].includes(data.configs.length))throw Error('Invalid HexBoard workspace.');for(const c of [data.configs[0]]){for(const field of ['flipHorizontal','flipVertical'])if(c[field]!==undefined&&typeof c[field]!=='boolean')throw Error('Invalid layout flip setting.');if(c.showPeriodLabels!==undefined&&typeof c.showPeriodLabels!=='boolean')throw Error('Invalid period labels setting.');if(c.periodWrapping!==undefined&&typeof c.periodWrapping!=='boolean')throw Error('Invalid period wrapping setting.');if(c.periodPlacement!=null)validatePeriodPlacement(c.periodPlacement);if(c.copyPeriodStep!==undefined)validateCopyPeriodStep(c.copyPeriodStep);if(c.registerAlignment!==undefined&&!['scale','manual'].includes(c.registerAlignment))throw Error('Invalid register alignment.');if(c.scaleFilter!==undefined&&!['all','2','3'].includes(c.scaleFilter))throw Error('Invalid scale filter.');if(c.palette!==undefined&&!Object.hasOwn(palettes,c.palette)||c.layerGrowth!==undefined&&!['balanced','lower','higher'].includes(c.layerGrowth)||c.layerColors!==undefined&&!validColorMap(c.layerColors,2,MAX_SCALE_SIZE)||c.keyColors!==undefined&&!validColorMap(c.keyColors,0,139,commands)||c.degreeColors!==undefined&&!validColorMap(c.degreeColors,0,MAX_SCALE_SIZE-1))throw Error('Invalid saved MOS colors or button colors.');for(const [key,lo,hi] of [['base',2,MAX_SCALE_SIZE],['offset',0,MAX_SCALE_SIZE-2],['rotation',0,5],['deviceRotation',0,3],['center',0,139],['selected',0,139],['root',0,139],['register',-8,8],['ap',-1000,1000],['ag',-1000,1000],['bp',-1000,1000],['bg',-1000,1000]])if(!Number.isInteger(c[key])||c[key]<lo||c[key]>hi)throw Error('Invalid HexBoard coordinates.');validateJILimits({oddLimit:c.limit,primeLimit:c.primeLimit??null});if([c.center,c.root,c.selected].some(i=>commands.has(i))||!['bosanquet','compressed','period','manual'].includes(c.style)||(!Number.isInteger(c.limit)||c.limit<3||c.limit>97||c.limit%2!==1)||!Number.isFinite(c.tolerance)||c.tolerance<0||c.tolerance>100||!Array.isArray(c.chord)||c.chord.length>MAX_CHORD_TONES||c.chord.some(i=>!Number.isInteger(i)||i<0||i>139||commands.has(i)))throw Error('Invalid saved HexBoard layout.');}const migrated=migrateLayoutMirrors(data.configs[0]);configs=[{...defaults(),...migrated,primeLimit:validateJILimits({oddLimit:data.configs[0].limit,primeLimit:data.configs[0].primeLimit??null}).primeLimit,outside:!!data.configs[0].outside,selectChord:!!data.configs[0].selectChord}];}
 // The held keys as the harmony directory reads them: chord name, form and rotation, or an interval,
 // or why the notes are not a chord of the limit; each key column shows its ratio from the bass.
 function renderPlayed(host,played,pressed,s){
  const columns=pressed.map(({key,pitch},i)=>{const ratio=played.noteLabels?.[key.m.join(',')];return `<section class="live-note-column" aria-label="Button ${key.index}">${ratio?`<strong class="live-ratio-member" ${i?'data-ratio-colon':''}>${esc(ratio)}</strong>`:''}<span title="Button number">#${key.index}</span><span title="Scale degree">${key.degree>=0?'Deg '+key.degree:'Outside'}</span><span title="Cents modulo period">${fmt(mod(pitch,s.p),2)} ¢</span><span title="Sounding frequency">${fmt(frequencyFor(pitch,getHz()),2)} Hz</span></section>`;}).join('');
  const notes=[played.doubled?'with doubled notes':'',played.source==='proof'?'not in the current directory list':''].filter(Boolean).map(text=>`<small>${text}</small>`).join('');
  let heading='';
  // A listed chord is written root - chord with its root's scale degree, when the root is a scale note.
  const rootDegree=played.rootNote?pressed.find(({key})=>key.m.join(',')===played.rootNote)?.key.degree:undefined;
  if(played.status==='chord')heading=`<div class="live-note-chord" aria-label="Chord"><strong>${esc(rootedChordName(rootDegree>=0?rootDegree:null,played.label))}</strong> <span class="form-badge ${played.form}">${esc(played.formLabel)}</span>${played.rotation&&played.rotation!==played.label?`<small>played as ${esc(played.rotation)}</small>`:''}${notes}${played.alternatives?.length?`<details><summary>Also reads as</summary>${played.alternatives.map(label=>`<p>${esc(label)}</p>`).join('')}</details>`:''}</div>`;
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
  scaleHighlight=null;harmonicPlay.select(-1);
  const f=finderState(state(),config()); // brings the finder's signature up to date so it keeps the groups set below
  f.imported=null;f.groups=[{shape:h.shape,label:h.label,max:h.max,mapped:h.mapped,total:h.total,placements:h.placements}];
  f.selected=0;f.placement=placement;
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
 // (a shape chosen in the Shapes view, the harmonic selection or the finder), and a way to light one of them. Lighting goes
 // through the normal highlight, so the screen and a physical board both follow.
 // Polled several times a second, so the placements are the sources' own lists, not copies:
 // callers must not modify them.
 function fingerings(){
  // A shape chosen and lit in the Shapes view: practise every fingering of that pattern.
  if(chordMode==='shapes'&&shapeHighlight){const shape=shapes.fingerings();if(shape)return shape;}
  let harmonic=null,finder=null;
  try{
   const m=harmonicPlay.model();
   if(m.selection&&m.placements.length)harmonic={source:'harmonic',label:m.selection.label??'Chord',index:m.fingering,placements:m.placements};
   const f=finderState(state(),config()),g=f.groups[f.selected];
   if(g&&g.placements.length)finder={source:'finder',label:g.label,index:f.placement,placements:g.placements};
  }catch{/* no buildable layout: no fingerings */}
  // A fingering already highlighted from the harmonic selection wins; otherwise whichever source holds a chord.
  return harmonic&&(harmonicHighlight||!finder)?harmonic:finder??harmonic;
 }
 function showFingering(index){
  const f=fingerings();
  if(!f)return false;
  if(f.source==='shape'){if(!shapes.showFingering(index))return false;}
  else if(f.source==='harmonic'){if(!harmonicPlay.select(index))return false;}
  else{if(!Number.isInteger(index)||index<0||index>=f.placements.length)return false;finders[0].placement=index;}
  // Only the highlight moves, so keys being played keep sounding through the redraw.
  refresh('highlight');return true;
 }
 // What a physical board should show: the same picture as the screen, as plain data.
 // Read-only; null when the current layout cannot be built.
 function deviceSnapshot(){
  let cfg,s,b;
  try{cfg=config();s=state();b=boardFor(s,cfg);}catch{return null;}
  return deviceFrame(picture(s,cfg,b));
 }
 return {retuningSnapshot:()=>structuredClone(configs[0]),render,deviceSnapshot,fingerings,showFingering,harmoniesAt,showHarmony,hearKeys,shapeExplorer:shapes,acceptHarmonicSelection:value=>{if(chordMode==='notes')setChordMode('shapes');shapes.accept(value);harmonicPlay.accept(value);},chordMode:()=>chordMode,initLayouts,prepareForTemperament,preserveCurrentLayout,input,change,click,press,updateLiveChord,restore,
  // A chord placed from elsewhere (the collection) shows its placements in Chord → places.
  showChord:(coordinates,label,options)=>{const count=showChord(coordinates,label,options);setChordMode('places');return count;},showScale,clearHighlight:()=>{shapes.clear();shapeHighlight=null;harmonicPlay.clear();scaleHighlight=null;finders.forEach(f=>{f.selected=-1;f.imported=null;});},serialize:()=>{config();return {configs:structuredClone(configs),harmonic:harmonicPlay.serialize(),shapes:shapes.serialize(),chordMode};}};
}
