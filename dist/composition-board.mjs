// Composition board and compact fingerings use the saved project, never the live app setup.
import {buildBoard} from './hexboard.mjs';
import {chordPlacements} from './hexboard-chords.mjs';
import {mosLayers,keyColor} from './hexboard-colors.mjs';
import {resolveTone} from './composition-context.mjs';

export function compositionBoard(project){
 if(!project?.layout)return {board:null,reason:'Start a composition from a Play layout to see its HexBoard.'};
 try{return {board:buildBoard(project.context.state,project.layout),reason:''};}
 catch(e){return {board:null,reason:e.message};}
}
export function compactFingerings(project,event,board){
 if(!board||!event||event.tones.length<2)return [];
 try{return chordPlacements(board,event.tones.map(t=>t.coordinate),project.layout.center??65,{exact:true})
  .sort((a,b)=>a.reach-b.reach||a.keys[0]-b.keys[0]).slice(0,12);}
 catch{return [];}
}
export function boardMarkup(project,board,keys=[],follow=true,labels=true){
 if(!board)return '';
 const angle=(project.layout.deviceRotation??0)*Math.PI/2,radius=19,pitch=Math.sqrt(3)*radius+2;
 const positions=board.keys.map(k=>{const x=k.x*pitch/2,y=k.y*pitch*Math.sqrt(3)/2;return {x:x*Math.cos(angle)-y*Math.sin(angle),y:x*Math.sin(angle)+y*Math.cos(angle)};});
 const visible=positions.filter((_,i)=>!board.keys[i].command),xmin=Math.min(...visible.map(p=>p.x))-23,ymin=Math.min(...visible.map(p=>p.y))-23;
 const width=Math.max(...visible.map(p=>p.x))-xmin+23,height=Math.max(...visible.map(p=>p.y))-ymin+23;
 return `<svg class="composition-board" viewBox="0 0 ${width} ${height}" role="group" aria-label="Composition HexBoard">${board.keys.map((k,i)=>{
  if(k.command)return '';
  const x=positions[i].x-xmin,y=positions[i].y-ymin,pts=Array.from({length:6},(_,j)=>{const a=(j*60-90)*Math.PI/180+angle;return `${x+radius*Math.cos(a)},${y+radius*Math.sin(a)}`;}).join(' ');
  return `<g class="comp-board-key ${keys.includes(i)?'is-selected':''}" data-comp="board-hear" data-comp-key="${i}" data-a="${k.m[0]}" data-b="${k.m[1]}" data-follow="${follow}" tabindex="${k.enabled?0:-1}" role="button" aria-disabled="${!k.enabled}" aria-label="Button ${i}, degree ${k.degree}, ${k.c.toFixed(1)} cents"><title>Button ${i} · ${k.c.toFixed(1)} cents</title><polygon points="${pts}"/><text x="${x}" y="${y+4}" text-anchor="middle">${!k.enabled?'·':labels?k.degree:'·'}</text></g>`;
 }).join('')}</svg>`;
}
export function compositionDeviceSnapshot(project,board,highlight=[]){
 if(!board)return null;
 const colors=mosLayers(project.context.state,project.layout,board),keys=board.keys.map(k=>{
  const color=keyColor(k,colors),lit=highlight.includes(k.index);
  return {...k,c:resolveTone(project.context,k.m).cents,color,layoutColor:color,lit,marked:lit};
 });
 return {keys};
}
