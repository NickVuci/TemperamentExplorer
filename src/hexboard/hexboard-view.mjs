// One HexBoard picture for every board: Play's, Compose's miniature and the physical LEDs.
// boardPicture decides each key's look (layout colour, outline, label, chord tone and highlight, through
// the shared keyAppearance rule); boardSvg draws it at any size; deviceFrame gives it to the LEDs.
// Sounding keys are not part of the picture: the player marks them on the drawn board (.is-playing).
import {boardMatches} from './hexboard.mjs';
import {DEFAULT_ODD_LIMIT} from '../core/engine.mjs';
import {mosLayers,textColor,keyAppearance} from './hexboard-colors.mjs';

const OUTLINE={chord:'#de88ff',root:'#55b5ff',mapped:'#65d6b8',other:'#e9bd5d',plain:'#4b5a71'};
const fmt=(x,n=3)=>Number(x).toFixed(n);
const signed=x=>(x>=0?'+':'')+x;
// The layout's interval root: its own setting, else the tonic button.
const rootOf=cfg=>Number.isInteger(cfg.root)?cfg.root:cfg.center??65;

// Interval matches from the root key, per board and JI settings. Boards are rebuilt only when the
// layout changes, and highlights redraw far more often.
const matchCache=new WeakMap();
function rootMatches(s,b,cfg){
 const key=JSON.stringify([rootOf(cfg),cfg.tolerance??10,cfg.limit??DEFAULT_ODD_LIMIT,cfg.primeLimit??null]);
 let byKey=matchCache.get(b);if(!byKey)matchCache.set(b,byKey=new Map());
 if(!byKey.has(key)){let found=null;try{found=boardMatches(s,b,rootOf(cfg),cfg.tolerance??10,cfg.limit??DEFAULT_ODD_LIMIT,cfg.primeLimit??null);}catch{found=null;}byKey.set(key,found);}
 return byKey.get(key);
}

/**
 * Every key's look. `overlay` is a shown chord fingering ({keys} in chord-tone order), `scaleOn` a scale
 * highlight ({gens, shift}), `chord` the keys selected as a chord. `labels:false` hides degree numbers.
 */
export function boardPicture(s,cfg,b,{overlay=null,scaleOn=null,chord=cfg.chord??[],labels=true}={}){
 const colors=mosLayers(s,cfg,b),matches=rootMatches(s,b,cfg),root=rootOf(cfg);
 const keys=b.keys.map((k,i)=>{
  if(k.command)return {index:i,key:k,command:true};
  const look=keyAppearance(k,i,{colors,overlay,scaleOn,chord}),m=matches?.[i];
  const stroke=chord.includes(i)?OUTLINE.chord:i===root?OUTLINE.root:m?.mapped.length&&k.enabled?OUTLINE.mapped:m?.other.length&&k.enabled?OUTLINE.other:OUTLINE.plain;
  const label=k.conflict?'×':labels&&k.degree>=0?k.degree:'·';
  const toneLabels=overlay?.toneLabels?.[i];
  return {index:i,key:k,command:false,...look,...(Array.isArray(toneLabels)?{toneLabels:toneLabels.filter(Number.isSafeInteger)}:{}),stroke,ink:textColor(look.fill),label,chordKey:chord.includes(i)};
 });
 return {keys,center:cfg.center??65,deviceRotation:cfg.deviceRotation??0,periodLabels:!!cfg.showPeriodLabels,highlighted:!!(overlay?.keys?.length||chord.length)};
}

/** A key's hexagon outline around (x, y) with corner radius r, turned with the board by `angle` (radians). */
export const hexPoints=(x,y,r,angle=0)=>Array.from({length:6},(_,j)=>{const a=(j*60-90)*Math.PI/180+angle;return `${x+r*Math.cos(a)},${y+r*Math.sin(a)}`;}).join(' ');

// Key centres for a key radius, turned with the board (quarter turns), shared by the full board and its miniatures.
function keyCentres(keys,rotation,radius,gap){
 const angle=rotation*Math.PI/2,pitch=Math.sqrt(3)*radius+gap;
 return keys.map(k=>{const x=k.x*pitch/2,y=k.y*pitch*Math.sqrt(3)/2;return {x:x*Math.cos(angle)-y*Math.sin(angle),y:x*Math.sin(angle)+y*Math.cos(angle)};});
}
const box=(points,pad)=>{const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs)-pad,y=Math.min(...ys)-pad;return {x,y,width:Math.max(...xs)+pad-x,height:Math.max(...ys)+pad-y};};
/**
 * The picture as an SVG. `className` and `ariaLabel` name the board; `keyClass(look)` adds classes and
 * `keyData(look)` the data attributes an input path reads (Play: data-hex-key; Compose: data-comp-key).
 */
export function boardSvg(picture,{className='hex-board',ariaLabel='HexBoard layout: 133 note buttons',keyClass=()=>'',keyData=look=>`data-hex-key="${look.index}"`,focusDisabled=true,
 // Extra SVG drawn on top of each key (centre x, y, key radius and the board's turn in radians), such as
 // the rhythm game's approach rings.
 keyExtra=()=>''}={}){
 const angle=picture.deviceRotation*Math.PI/2,radius=19,positions=keyCentres(picture.keys.map(look=>look.key),picture.deviceRotation,radius,2);
 const visible=positions.filter((_,i)=>!picture.keys[i].command);
 const xmin=Math.min(...visible.map(p=>p.x))-23,ymin=Math.min(...visible.map(p=>p.y))-23,width=Math.max(...visible.map(p=>p.x))-xmin+23,height=Math.max(...visible.map(p=>p.y))-ymin+23;
 const body=picture.keys.map((look,i)=>{
  if(look.command)return '';
  const k=look.key,x=positions[i].x-xmin,y=positions[i].y-ymin,tone=look.tone,ink=look.ink,periodLabel=picture.periodLabels&&k.wrapped&&k.enabled;
  const pts=hexPoints(x,y,radius,angle),toneLabel=look.toneLabels?.length?look.toneLabels.map(n=>n+1).join(','):tone>=0?String(tone+1):'';
  const classes=[keyClass(look),look.lit?'is-lit':'',look.marked?'is-marked':'',look.chordKey?'is-chord':'',k.conflict?'is-overlap':''].filter(Boolean).join(' ');
  return `<g class="${classes}" role="button" tabindex="${k.enabled||focusDisabled?0:-1}" aria-disabled="${!k.enabled}" ${keyData(look)} aria-label="Button ${i}, ${k.degree>=0?'degree '+k.degree:'outside scale'}, ${fmt(k.c)} cents${k.wrapped&&k.enabled?`, period register ${k.register}`:''}${k.conflict?', overlapping period copies':''}${toneLabel?`, chord tone ${toneLabel}`:''}${k.enabled?'':', disabled'}"><title>Button ${i}${k.wrapped&&k.enabled?` · degree ${k.degree} · register ${k.register>=0?'+':''}${k.register}`:''}${k.conflict?` · Overlap: ${k.placements.map(p=>`degree ${p.degree}, copy ${p.copyRegister}`).join('; ')}`:''} · ${fmt(k.c)}¢; ${k.m[0]}P + ${k.m[1]}G</title><polygon points="${pts}" fill="${look.fill}" stroke="${look.stroke}" stroke-width="1.4" stroke-linejoin="round"/><text class="hex-key-label" x="${x+(tone>=0?-4:0)}" y="${y+(periodLabel?-1:4)}" text-anchor="middle" fill="${ink}" font-size="12">${look.label}</text>${tone>=0?`<text class="hex-chord-tone-label" x="${x+10}" y="${y+(periodLabel?-3:2)}" text-anchor="start" fill="${ink}" font-size="${toneLabel.length>3?5:7}" aria-hidden="true">${toneLabel}</text>`:''}${periodLabel?`<text class="hex-period-label" x="${x}" y="${y+12}" text-anchor="middle" fill="${ink}" font-size="9">${signed(k.register)}P</text>`:''}${i===picture.center?`<circle cx="${x}" cy="${y-11}" r="2.5" fill="#dc8847"/>`:''}${keyExtra(look,x,y,radius,angle)}</g>`;
 }).join('');
 return `<svg class="${className}${picture.highlighted?' has-chord':''}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${ariaLabel}">${body}</svg>`;
}

const num=x=>Math.round(x*10)/10;

/**
 * A fingering's keys alone, at a fixed key size so different patterns compare at one scale. `toneLabels`
 * maps a key to its chord-tone indices (0-based); `root` is the root key. Colours come from style.css.
 */
export function fingeringPattern(board,keys,{rotation=0,toneLabels={},root=null,radius=11,label='Fingering pattern'}={}){
 const wanted=new Set(keys),shown=board.keys.filter(k=>wanted.has(k.index)&&!k.command);if(!shown.length)return '';
 const angle=rotation*Math.PI/2,points=keyCentres(shown,rotation,radius,1),frame=box(points,radius+2);
 const body=shown.map((k,i)=>{
  const x=points[i].x-frame.x,y=points[i].y-frame.y,tones=toneLabels[k.index]?.map(n=>n+1).join(',')??'';
  return `<g class="${k.index===root?'is-root':''}"><polygon points="${hexPoints(num(x),num(y),radius-.6,angle)}"/>${tones?`<text x="${num(x)}" y="${num(y+radius*.36)}" text-anchor="middle" font-size="${tones.length>3?radius*.6:radius*.95}">${tones}</text>`:''}</g>`;
 }).join('');
 return `<svg class="fingering-pattern" width="${num(frame.width)}" height="${num(frame.height)}" viewBox="0 0 ${num(frame.width)} ${num(frame.height)}" role="img" aria-label="${label}">${body}</svg>`;
}

/** The whole board in miniature with one fingering lit, to show where on the board it lies. */
export function fingeringMap(board,keys,{rotation=0,root=null,radius=3.4,label='Fingering position'}={}){
 const lit=new Set(keys),shown=board.keys.filter(k=>!k.command);if(!shown.length)return '';
 const points=keyCentres(shown,rotation,radius,.8),frame=box(points,radius+1);
 const dot=(k,i)=>`<circle class="${lit.has(k.index)?k.index===root?'lit root':'lit':k.enabled?'':'off'}" cx="${num(points[i].x-frame.x)}" cy="${num(points[i].y-frame.y)}" r="${num(lit.has(k.index)?radius*1.15:radius*.85)}"/>`;
 // Lit keys are drawn last so their larger dots stay on top.
 const body=shown.map((k,i)=>lit.has(k.index)?'':dot(k,i)).join('')+shown.map((k,i)=>lit.has(k.index)?dot(k,i):'').join('');
 return `<svg class="fingering-map" width="${num(frame.width)}" height="${num(frame.height)}" viewBox="0 0 ${num(frame.width)} ${num(frame.height)}" role="img" aria-label="${label}">${body}</svg>`;
}

/** What a physical board shows: the picture's colours and highlights as plain data. `cents(key)` gives
 *  each key's sounding pitch (default: the board's own). */
export function deviceFrame(picture,{cents=k=>k.c}={}){
 return {keys:picture.keys.map(look=>{
  const k=look.key;
  if(look.command)return {index:look.index,command:true,enabled:false,color:null,layoutColor:null,marked:false,lit:false,m:k.m,c:k.c};
  return {index:look.index,command:false,enabled:!!k.enabled,color:look.fill,layoutColor:look.layoutColor,marked:look.marked,lit:look.lit,m:k.m,c:cents(k)};
 })};
}
