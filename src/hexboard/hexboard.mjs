import {wrapBoardKeys} from './hexboard-wrapping.mjs';
import {DEFAULT_ODD_LIMIT,scale,mosSizes,generatedSizes,mod,createTargetClassifier,targets,MAX_SCALE_SIZE} from '../core/engine.mjs';
import {mosLayers,keyColor,hexToHSV} from './hexboard-colors.mjs';
export const commands=new Set([0,20,40,60,80,100,120]);
export const add=(a,b)=>a.map((v,i)=>v+b[i]);
export const sub=(a,b)=>a.map((v,i)=>v-b[i]);
import {coordinateCents as cents,approximationSpan} from '../core/pitch.mjs';
export {coordinateCents as cents} from '../core/pitch.mjs';
export const det=(a,b)=>a[0]*b[1]-a[1]*b[0];
// The controls refer to the displayed horizontal/vertical axes. A quarter
// turn exchanges those axes relative to the underlying staggered board.
export function layoutReflections(cfg){
 const odd=(cfg.deviceRotation||0)%2;
 return {x:!!(odd?cfg.flipHorizontal:cfg.flipVertical),y:!!(odd?cfg.flipVertical:cfg.flipHorizontal)};
}
export function flipPlacementVector(vector,cfg,field){
 const f=layoutReflections({deviceRotation:cfg.deviceRotation,[field]:true});
 const x=(2*vector.column+vector.row)*(f.x?-1:1),y=vector.row*(f.y?-1:1);
 return {column:(x-y)/2||0,row:y||0};
}
export function migrateLayoutMirrors(cfg){
 if(cfg.flipHorizontal!==undefined||cfg.flipVertical!==undefined||!cfg.mirror)return {...cfg};
 // Old reflection preceded musical rotation. Reflecting after the inverse
 // rotation produces the identical pitches at every physical button.
 return {...cfg,mirror:false,rotation:(6-(cfg.rotation||0))%6,
   flipHorizontal:!!((cfg.deviceRotation||0)%2),flipVertical:!((cfg.deviceRotation||0)%2)};
}
export function baseOptions(s){return mosSizes(s).filter(x=>x.n<=s.n&&x.mos);}
export function baseSteps(s,n){
 const a=scale({...s,mode:0},n);if(!a.mos)throw Error('Choose a base with two step sizes. Equal-step scales can use a smaller MOS base.');
 const steps=a.notes.map((v,i)=>{const next=a.notes[(i+1)%n],c=a.steps[i],g=next.k-v.k;return {c,m:[Math.round((c-g*s.g)/s.p),g]};});
 const L=steps.find(v=>Math.abs(v.c-a.large)<1e-5),small=steps.find(v=>Math.abs(v.c-a.small)<1e-5);
 if(Math.abs(det(L.m,small.m))!==1)throw Error('This base does not give a complete integer layout basis. Choose a smaller MOS.');
 return {n,L:L.m,s:small.m,signature:a.signature,large:a.large,small:a.small};
}
export function layoutAxes(s,cfg){
 const needsBase=['bosanquet','compressed'].includes(cfg.style);
 const base=needsBase?baseSteps(s,cfg.base):{n:cfg.base,signature:'Generator subset',large:null,small:null};
 let a,b;if(cfg.style==='compressed'){a=add(base.L,base.s);b=base.L;}
 else if(cfg.style==='period'){a=[1,0];b=[0,1];}
 else if(cfg.style==='manual'){a=[cfg.ap,cfg.ag];b=[cfg.bp,cfg.bg];}
 else {a=base.L;b=sub(base.L,base.s);}
 if(![...a,...b].every(x=>Number.isInteger(x)&&Math.abs(x)<=1000)||Math.abs(det(a,b))!==1)throw Error('Axes must have integer coordinates and determinant +1 or −1 to cover the whole temperament.');
 if(cfg.mirror){a=a.map(x=>-x);b=sub(b,a.map(x=>-x));}
 for(let i=0;i<cfg.rotation;i++)[a,b]=[sub(a,b),a];
 const reflection=layoutReflections(cfg);
 if(reflection.x){b=sub(b,a);a=a.map(x=>-x);}
 if(reflection.y)b=sub(a,b);
 return {a,b,base};
}
export function physicalKey(i){const row=Math.floor(i/10),column=i%10;return {index:i,row,column,x:2*column+(row&1),y:row,command:commands.has(i)};}
export function buildBoard(s,cfg){
 const target=scale(s);if(target.collision)throw Error('The selected scale has pitch collisions. Choose a smaller target scale before generating a layout.');
 const {a,b,base}=layoutAxes(s,cfg),root=physicalKey(cfg.center),minK=Math.min(...target.notes.map(t=>t.k)),start=minK+Math.max(0,Math.min(s.n-cfg.base,cfg.offset||0));
 const baseNotes=target.notes.filter(t=>t.k>=start&&t.k<start+cfg.base),lookup=(cs,k)=>cs.findIndex(t=>t.k===k),alias=(cs,c)=>cs.findIndex(t=>Math.min(Math.abs(t.c-c),s.p-Math.abs(t.c-c))<1e-7);
 let keys=Array.from({length:140},(_,i)=>{const v=physicalKey(i),dx=(v.x-root.x+v.y-root.y)/2,dy=-(v.y-root.y),m=[dx*a[0]+dy*b[0]+(cfg.register||0),dx*a[1]+dy*b[1]],c=cents(s,m),pc=mod(c,s.p),exact=lookup(target.notes,m[1]),degree=exact>=0?exact:alias(target.notes,pc),baseExact=lookup(baseNotes,m[1]),baseDegree=baseExact>=0?baseExact:alias(baseNotes,pc);
  return {...v,m,c,pc,degree,inMOS:degree>=0,base:baseDegree>=0,alias:degree>=0&&exact<0,enabled:!v.command&&(degree>=0||cfg.outside)};
 });
 let wrapping;
 if(cfg.periodWrapping)({keys,wrapping}=wrapBoardKeys(s,cfg,target,baseNotes,keys,a,b,root));
 const playable=keys.filter(v=>v.enabled),represented=new Set(keys.filter(v=>!v.command&&v.inMOS).map(v=>v.degree)),missing=target.notes.map((_,i)=>i).filter(i=>!represented.has(i));
 return {...(wrapping?{wrapping}:{}),keys,a,b,base,target,baseNotes,missing,coverage:represented.size,playable:playable.length,span:playable.length?Math.max(...playable.map(v=>v.c))-Math.min(...playable.map(v=>v.c)):0};
}
export function boardMatches(s,board,rootIndex,tolerance=10,limit=DEFAULT_ODD_LIMIT,primeLimit=null){
 const root=board.keys[rootIndex],span=board.wrapping?s.p:approximationSpan(s),classify=createTargetClassifier(s,[{n:1,d:1,label:'1/1',c:0},...targets(limit,primeLimit)],tolerance);
 return board.keys.map(key=>{if(board.wrapping&&(!key.enabled||!root.enabled))return {mapped:[],hits:[],other:[],c:0};const c=mod(key.c-root.c,span),v={c,k:key.m[1]-root.m[1]},match=classify(v),mapped=match.mapped.filter(t=>t.within),other=match.hits.filter(t=>!mapped.length||t.reason!=='Outside temperament basis');return {...match,mapped,other,c};});
}
export function fillBoard(s,cfg){
 if(cfg.periodWrapping){const candidates=layoutCandidates(s,{...cfg,periodPlacement:null});if(candidates[0]?.playable===133)return {n:s.n,mode:s.mode,offset:candidates[0].config.offset,config:candidates[0].config};throw Error('No collision-free wrapped arrangement fills every button with this scale. Try another scale or placement vector.');}
 const current=buildBoard(s,cfg),ks=current.keys.filter(k=>!k.command).map(k=>k.m[1]),lo=Math.min(...ks),hi=Math.max(...ks),oldStart=Math.min(...current.baseNotes.map(t=>t.k));
 for(const candidate of generatedSizes(s,cfg.scaleFilter).filter(v=>v.n>=cfg.base)){
  // A generator window [-rootK, n-1-rootK] must contain every button.
  // Equal-step closures can also cover the board through exact pitch aliases.
  const minRoot=Math.max(0,-lo),maxRoot=Math.min(candidate.n-1,candidate.n-1-hi);
  if(minRoot>maxRoot&&!candidate.equal)continue;
  const rootK=candidate.equal?Math.floor((candidate.n-1)/2):Math.max(minRoot,Math.min(maxRoot,Math.round((candidate.n-1-lo-hi)/2)));
  const mode=candidate.notes.findIndex(t=>t.k===rootK),offset=Math.max(0,Math.min(candidate.n-cfg.base,oldStart+rootK));
  const board=buildBoard({...s,n:candidate.n,mode},{...cfg,offset,outside:false});
  if(board.playable===133)return {n:candidate.n,mode,offset};
 }
 throw Error(`No matching scale up to ${MAX_SCALE_SIZE} notes fills this layout at the current tuning. Try a smaller base MOS, another rotation, or different axes.`);
}
export function layoutCandidates(s,cfg){
 const options=[];
 for(const base of baseOptions(s))for(const style of ['bosanquet','compressed'])for(let rotation=0;rotation<6;rotation++){
  try{const conf={...cfg,base:base.n,style,rotation,mirror:false,offset:0},board=buildBoard(s,conf);options.push({config:conf,coverage:board.coverage,playable:board.playable,span:board.span,signature:board.base.signature});}catch{}
 }
 // First maximize selected-scale coverage, then useful repeated notes and pitch range.
 return options.sort((a,b)=>b.coverage-a.coverage||b.playable-a.playable||b.span-a.span).slice(0,8);
}
const uuid=()=>crypto.randomUUID().replaceAll('-','');
// HexBoard menus show at most 19 ASCII characters, so names stored in the bundle are fitted to that
// width; the export's title, description and details carry the full names.
const MENU_WIDTH=19;
const LAYOUT_FAMILIES={bosanquet:['Bosanquet','Bosanquet axes (L and L − s)'],compressed:['Compressed','Compressed axes (L + s and L)'],period:['Period-generator','Period and generator axes'],manual:['Custom axes','Custom musical axes']};
const ascii=text=>String(text).normalize('NFKD').replace(/[̀-ͯ]/g,'').replace(/[·•–—−]/g,'-').replace(/[^\x20-\x7e]/g,'').replace(/\s+/g,' ').trim();
// Cuts at a word break when that loses at most four more characters, else mid-word.
const clip=(text,width)=>{if(text.length<=width)return text;const cut=text.slice(0,width+1).lastIndexOf(' ');return (cut>=width-4?text.slice(0,cut):text.slice(0,width)).replace(/[\s(.,;:-]+$/,'');};
const slug=text=>ascii(text).replace(/[^a-z0-9]+/gi,'-').replace(/^-+|-+$/g,'');
const roundTo=(v,places)=>Number(v.toFixed(places));
/** The bundle's 19-character tuning name: the temperament and scale size, such as Porcupine 7-lim[15].
 *  A "(k-limit)" or subgroup qualifier is always shortened, and dropped when still too long, before
 *  the name itself is cut. */
export function tuningMenuName(name,n){
 const suffix=`[${n}]`,width=MENU_WIDTH-suffix.length,full=ascii(name)||'Temperament',core=full.replace(/\s*\([^)]*\)/g,'').trim()||full;
 const short=full.replace(/\((\d+)-limit\)/gi,'$1-lim').replace(/[()]/g,'').replace(/\s+/g,' ').trim();
 return ([short,core].find(v=>v.length<=width)??clip(core,width))+suffix;
}
/** A layout with no saved or built-in name is named by its family and base MOS, such as "Bosanquet 7". */
export const layoutGeometryName=cfg=>(LAYOUT_FAMILIES[cfg.style]??LAYOUT_FAMILIES.manual)[0]+(['bosanquet','compressed'].includes(cfg.style)?` ${cfg.base}`:'');
// layout: the named layout the board shows, {name, source: 'Built-in' | 'Saved'}; omitted for a custom layout.
export function exportHexboard(s,cfg,hz=220,layout={}){
 const board=buildBoard(s,cfg);if(board.wrapping?.overlaps.length)throw Error('Resolve overlapping period copies before exporting. Adjust the placement vector or choose Reset / Auto.');const colors=mosLayers(s,cfg,board),p=Math.fround(s.p);if(!(hz>0&&Number.isFinite(hz)))throw Error('Choose a positive reference frequency.');
 const pcs=[0,...board.target.notes.map(t=>t.c),...board.keys.filter(k=>k.enabled).map(k=>k.pc)].sort((a,b)=>a-b),unique=[];
 for(const c of pcs)if(!unique.length||Math.abs(c-unique.at(-1))>1e-7)unique.push(c);
 const table=[...unique.slice(1),s.p].map(Math.fround);if(table.some((v,i)=>!(v>0)||i&&v<=table[i-1])||unique.length>1024)throw Error('These pitches cannot be distinguished by the HexBoard cents-table format. Choose a tuning with more separated pitches.');
 const N=unique.length,degreeOf=c=>{let best=0;unique.forEach((v,i)=>{if(Math.abs(v-c)<Math.abs(unique[best]-c))best=i;});return best;};
 const bundleId=uuid(),layoutId=uuid(),allId=uuid(),mosId=uuid(),baseId=uuid(),name=tuningMenuName(s.name,s.n);
 const named=typeof layout.name==='string'&&layout.name.trim(),layoutName=named?layout.name.trim():layoutGeometryName(cfg),source=named?layout.source||'Saved':'Custom';
 const family=(LAYOUT_FAMILIES[cfg.style]??LAYOUT_FAMILIES.manual)[1],usesBase=['bosanquet','compressed'].includes(cfg.style),modeText=s.mode?` mode ${s.mode+1}`:'';
 const title=`${s.name}[${s.n}]${modeText} · ${layoutName}`,tuningText=typeof s.tuning==='string'&&s.tuning?` ${s.tuning}`:'';
 const description=`${s.name}, ${s.n}-note ${board.target.signature} scale, mode ${s.mode+1}; ${source.toLowerCase()} layout “${layoutName}”, ${family}${usesBase?` on the ${cfg.base}-note ${board.base.signature} base`:''}; ${s.basis.join('.')}${tuningText} tuning, period ${roundTo(s.p,3)}¢, generator ${roundTo(s.g,3)}¢, reference ${roundTo(hz,2)} Hz`;
 const fileName=`${[slug(s.name)||'Temperament',`${s.n}-notes`,modeText&&`mode-${s.mode+1}`,clip(slug(layoutName),48)].filter(Boolean).join('-')}-HexBoard.json`;
 let maxError=0;
 const overrides=board.keys.map(k=>{
  if(k.command)return {buttonIndex:k.index,role:'command'};
  const degree=degreeOf(k.pc),period=Math.round((k.c-unique[degree])/s.p),step=period*N+degree,actual=period*p+(degree?table[degree-1]:0);
  if(k.enabled){if(Math.abs(step)>32767)throw Error('The layout exceeds HexBoard’s pitch-index range. Reduce the axes or register.');maxError=Math.max(maxError,Math.abs(k.c-actual));}
  return {buttonIndex:k.index,role:k.enabled?'note':'unused',stepsFromC:k.enabled?step:0,...hexToHSV(keyColor(k,colors)),...(!k.enabled?{value:0}:{})};
 });
 const tuningBundle={objectIdHex:bundleId,folderPath:'/Temperament Lab',tuning:{kind:'scala',name,description,cents:table,periodCents:p,cycleLength:N,referenceDegree:0,defaultKeyDegree:0,referenceMidiNote:Math.max(0,Math.min(127,Math.round(69+12*Math.log2(hz/440)))),referenceHz:Math.fround(hz),keyLabels:unique.map(c=>{const i=board.target.notes.findIndex(t=>Math.abs(t.c-c)<1e-7);return i>=0?String(i):'+';})},palette:{defaultColorMode:1,degreeColors:[]},layouts:[{objectIdHex:layoutId,name:clip(ascii(layoutName),MENU_WIDTH)||'Layout',centerButton:cfg.center,centerStepsFromC:0,acrossSteps:0,upRightSteps:0,deviceRotationSteps:cfg.deviceRotation||0,layoutRotationSteps:0,mirrorLeftRight:false,mirrorUpDown:false,buttonOverrides:overrides,offGridOverrides:[],chordActions:[]}],activeLayoutIdHex:layoutId,scales:[{objectIdHex:allId,name:'All Notes',includedDegrees:unique.map((_,i)=>i)},{objectIdHex:mosId,name:`Target ${s.n} mode ${s.mode+1}`,includedDegrees:board.target.notes.map(t=>degreeOf(t.c)).sort((a,b)=>a-b)},{objectIdHex:baseId,name:`Base ${cfg.base}${board.baseNotes.some(t=>Math.abs(t.c)<1e-7)?'':' + root'}`,includedDegrees:[...new Set([0,...board.baseNotes.map(t=>degreeOf(t.c))])].sort((a,b)=>a-b)}],activeScaleIdHex:cfg.outside?allId:mosId};
 // title and details summarize the export for people reading the file; HexBoard's importer ignores them.
 const details={temperament:s.name,subgroup:s.basis.join('.'),...(tuningText?{tuning:s.tuning}:{}),periodCents:roundTo(s.p,4),generatorCents:roundTo(s.g,4),referenceHz:roundTo(hz,2),
  scale:{notes:s.n,mode:s.mode+1,steps:board.target.signature},
  layout:{name:layoutName,source,family,...(usesBase?{baseNotes:cfg.base,baseSteps:board.base.signature}:{}),tonicButton:cfg.center,boardOrientationDegrees:(cfg.deviceRotation||0)*90,periodWrapping:!!cfg.periodWrapping,notesOutsideScale:!!cfg.outside&&!cfg.periodWrapping},
  board:{playableButtons:board.playable,scaleDegreesOnBoard:`${board.coverage}/${s.n}`,pitchesPerPeriod:N,maxRoundingErrorCents:roundTo(maxError,6)}};
 return {fileName,title,file:{format:'hexboard.tuningBundle.v2',title,details,tuningBundle,temperamentLab:{version:1,state:structuredClone(s),layout:structuredClone(cfg),coordinates:board.keys.filter(k=>!k.command).map(k=>({button:k.index,m:k.m,...(k.wrapped&&k.enabled?{baseM:k.baseM,copyRegister:k.copyRegister,copyPeriods:k.copyPeriods,extensionRegister:k.extensionRegister,register:k.register}:{} )})),missingDegrees:board.missing,maxCentsRoundingError:maxError}},maxError,board};
}
