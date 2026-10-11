// Composition board and compact fingerings use the saved project, never the live app setup.
import {buildBoard} from './hexboard.mjs';
import {chordPlacements} from './hexboard-chords.mjs';
import {boardPicture,boardSvg,deviceFrame} from './hexboard-view.mjs';
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
// A miniature of Play's board, drawn by the same picture and renderer (hexboard-view) from the saved
// layout: colours, outlines, labels, tonic marker and highlight rule all match. `keys` is the shown chord
// fingering, in chord-tone order; `lit` are other keys to highlight (the selected melody notes). Its keys
// play through the shared HexBoard player (data-comp-key).
export function boardMarkup(project,board,keys=[],labels=true,lit=[]){
 if(!board)return '';
 const picture=boardPicture(project.context.state,project.layout,board,{overlay:keys.length?{keys}:null,chord:lit,labels});
 return boardSvg(picture,{className:'composition-board hex-board',ariaLabel:'Composition HexBoard',keyClass:()=>'comp-board-key',keyData:look=>`data-comp-key="${look.index}"`,focusDisabled:false});
}
// The rhythm game's board: the same picture, with an approach ring on every playable key that the game
// shrinks onto the key as its note arrives. Keys keep data-comp-key, so they play exactly as in Compose.
export function gameBoardMarkup(project,board,labels=true){
 if(!board)return '';
 const picture=boardPicture(project.context.state,project.layout,board,{overlay:null,chord:[],labels});
 return boardSvg(picture,{className:'composition-board hex-board game-board',ariaLabel:'Rhythm game HexBoard',keyClass:()=>'comp-board-key',keyData:look=>`data-comp-key="${look.index}"`,focusDisabled:false,
  keyExtra:(look,x,y,r)=>look.key.enabled?`<circle class="game-ring" data-game-ring="${look.index}" cx="${x}" cy="${y}" r="${r}" aria-hidden="true"/>`:''});
}
// The physical board shows the composition with the same picture as the screen, at its tuned pitches.
export function compositionDeviceSnapshot(project,board,highlight=[]){
 if(!board)return null;
 return deviceFrame(boardPicture(project.context.state,project.layout,board,{chord:highlight}),{cents:k=>resolveTone(project.context,k.m).cents});
}
