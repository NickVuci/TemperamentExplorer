// The composition board uses the saved project, never the live app setup.
import {buildBoard} from '../hexboard/hexboard.mjs';
import {boardPicture,boardSvg,deviceFrame,hexPoints} from '../hexboard/hexboard-view.mjs';
import {resolveTone} from './composition-context.mjs';

export function compositionBoard(project){
 if(!project?.layout)return {board:null,reason:'Start a composition from a Play layout to see its HexBoard.'};
 try{return {board:buildBoard(project.context.state,project.layout),reason:''};}
 catch(e){return {board:null,reason:e.message};}
}
/** A colour pulled towards black by factor `f`, for keys outside what is being shown. */
export const dimColor=(hex,f)=>`#${[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*f).toString(16).padStart(2,'0')).join('')}`;
// A miniature of Play's board, drawn by the same picture and renderer (hexboard-view) from the saved
// layout: colours, outlines, labels, tonic marker and highlight rule all match. `keys` is the shown chord
// fingering, in chord-tone order; `lit` are other keys to highlight (the selected melody notes);
// `options` are other buttons offered while choosing. Its keys play through the shared HexBoard player
// (data-comp-key).
export function boardMarkup(project,board,keys=[],labels=true,lit=[],options=[]){
 if(!board)return '';
 const picture=boardPicture(project.context.state,project.layout,board,{overlay:keys.length?{keys}:null,chord:lit,labels}),offered=new Set(options);
 return boardSvg(picture,{className:'composition-board hex-board',ariaLabel:'Composition HexBoard',keyClass:look=>offered.has(look.index)?'comp-board-key is-option':'comp-board-key',keyData:look=>`data-comp-key="${look.index}"`,focusDisabled:false});
}
// The rhythm game's board: the same picture, with an approach ring on every playable key, a copy of the
// key's own hexagon that the game closes onto it as its note arrives and bursts outward on a judgement.
// Keys keep data-comp-key, so they play exactly as in Compose.
export function gameBoardMarkup(project,board,labels=true){
 if(!board)return '';
 const picture=boardPicture(project.context.state,project.layout,board,{overlay:null,chord:[],labels});
 return boardSvg(picture,{className:'composition-board hex-board game-board',ariaLabel:'Rhythm game HexBoard',keyClass:()=>'comp-board-key',keyData:look=>`data-comp-key="${look.index}"`,focusDisabled:false,
  keyExtra:(look,x,y,r,angle)=>look.key.enabled?`<polygon class="game-ring" data-game-ring="${look.index}" points="${hexPoints(x,y,r,angle)}" aria-hidden="true"/>`:''});
}
// The physical board shows the composition with the same picture as the screen, at its tuned pitches.
// With `options` (choosing buttons), the offered buttons keep their colour and every other unlit key dims.
export function compositionDeviceSnapshot(project,board,highlight=[],options=null){
 if(!board)return null;
 const snap=deviceFrame(boardPicture(project.context.state,project.layout,board,{chord:highlight}),{cents:k=>resolveTone(project.context,k.m).cents});
 if(options){
  const kept=new Set([...highlight,...options]);
  for(const key of snap.keys)if(!key.command&&key.enabled&&!kept.has(key.index)&&key.layoutColor)key.layoutColor=dimColor(key.layoutColor,.35);
 }
 return snap;
}
