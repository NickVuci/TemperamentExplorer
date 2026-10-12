import {scale} from './engine.mjs';
import {baseOptions,buildBoard} from '../hexboard/hexboard.mjs';
import {noteCoordinate} from './pitch.mjs';
import {validateState} from './state.mjs';

export const RETUNING_STRUCTURE_MESSAGE='This tuning would change the selected scale or button layout. Choose the scale/layout explicitly before applying it.';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function reject(reason){throw Error(`${RETUNING_STRUCTURE_MESSAGE} (${reason})`);}
function scaleCoordinates(state){
 const generated=scale(state);
 if(generated.collision)reject('Pitch collision');
 return generated.notes.map(note=>noteCoordinate(state,note));
}
function preserveScale(before,after,label){
 if(before.n!==after.n||before.mode!==after.mode||!same(scaleCoordinates(before),scaleCoordinates(after)))reject(`${label} scale coordinates`);
}
// config() repairs invalid bases/styles/offsets. Validate that no repair is needed;
// do not choose replacement geometry or invoke the live workspace's normalizer.
function requireExistingLayout(state,config){
 const options=baseOptions(state);
 const validBase=options.length?options.some(option=>option.n===config.base):config.base===2&&!['bosanquet','compressed'].includes(config.style);
 if(!validBase||config.base>state.n||!Number.isInteger(config.offset)||config.offset<0||config.offset>state.n-config.base)reject('Layout would need an automatic fallback');
}
function boardStructure(board){
 return {axes:[board.a,board.b],keys:board.keys.filter(key=>!key.command).map(key=>[key.index,key.m,key.degree,key.enabled,!!key.conflict])};
}

/** A tuning-only transaction is permitted only while its integer scale and board stay fixed.
 * Inputs are never mutated, including state validation's assignment normalization.
 * Successful output is detached from every input; callers commit both states together.
 */
export function preflightRetuning({currentState,candidateState,playState=currentState,layoutConfig}){
 const state=validateState(structuredClone(candidateState));
 if(!same([currentState.basis,currentState.rows],[state.basis,state.rows]))reject('Temperament mapping');
 preserveScale(currentState,state,'Discover');
 if(!same([playState.basis,playState.rows],[currentState.basis,currentState.rows]))reject('Play mapping is not current');
 const nextPlay=validateState({...structuredClone(state),n:playState.n,mode:playState.mode});
 preserveScale(playState,nextPlay,'Play');
 if(!layoutConfig)reject('No current layout');
 const config=structuredClone(layoutConfig);
 requireExistingLayout(nextPlay,config);
 let before,after;
 try{before=buildBoard(playState,config);after=buildBoard(nextPlay,config);}catch{reject('Layout cannot retain its axes or scale');}
 if(after.wrapping?.overlaps.length)reject('Overlapping period copies');
 if(!same(boardStructure(before),boardStructure(after)))reject('Button assignments');
 return {state,playState:nextPlay};
}
