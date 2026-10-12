import {validateState} from '../core/state.mjs';
import {buildBoard,commands} from './hexboard.mjs';
import {validatePeriodPlacement,validateCopyPeriodStep} from './hexboard-wrapping.mjs';
import {MAX_SCALE_SIZE} from '../core/engine.mjs';
import {palettes,validColor} from './hexboard-colors.mjs';
// The fields that make up a layout's geometry; layoutKey identifies a layout by them.
export const layoutFields=['base','offset','style','rotation','mirror','flipHorizontal','flipVertical','center','register','deviceRotation','outside','ap','ag','bp','bg','periodWrapping','periodPlacement','copyPeriodStep','registerAlignment'];
export const layoutConfig=cfg=>Object.fromEntries(layoutFields.map(k=>[k,cfg[k]]));
export const layoutKey=cfg=>JSON.stringify(layoutConfig(cfg));
export const layoutContext=s=>Object.fromEntries(['name','basis','rows','p','g','n','mode'].map(k=>[k,structuredClone(s[k])]));
export const mappingKey=s=>JSON.stringify([s.basis,s.rows]);
export const layoutPresetConfigKey=source=>JSON.stringify([layoutConfig(source||{}),source?.palette??'spectrum',source?.layerGrowth??'balanced',source?.layerColors??{},source?.keyColors??{},source?.degreeColors??{}]);
export function layoutPresetSnapshot(name,input){
 if(typeof name!=='string'||!name.trim()||name.trim().length>80)throw Error('Enter a layout name from 1 to 80 characters.');
 if(!input||JSON.stringify(input).length>16000)throw Error('Invalid layout preset.');
 const context=layoutContext(validateState(structuredClone(input.context))),source=input.config||{},config={...layoutConfig(source),palette:source.palette===undefined?'spectrum':source.palette,layerGrowth:source.layerGrowth===undefined?'balanced':source.layerGrowth,layerColors:structuredClone(source.layerColors===undefined?{}:source.layerColors),keyColors:structuredClone(source.keyColors===undefined?{}:source.keyColors),degreeColors:structuredClone(source.degreeColors===undefined?{}:source.degreeColors)};
 for(const [key,lo,hi]of [['base',2,context.n],['offset',0,context.n-config.base],['rotation',0,5],['deviceRotation',0,3],['center',0,139],['register',-8,8],['ap',-1000,1000],['ag',-1000,1000],['bp',-1000,1000],['bg',-1000,1000]])if(!Number.isInteger(config[key])||config[key]<lo||config[key]>hi)throw Error('Invalid layout '+key+'.');
 if(commands.has(config.center)||!['bosanquet','compressed','period','manual'].includes(config.style)||!['scale','manual'].includes(config.registerAlignment))throw Error('Invalid layout settings.');
 const validColorMap=(map,min,max,excluded)=>map&&typeof map==='object'&&!Array.isArray(map)&&Object.entries(map).every(([key,color])=>/^\d+$/.test(key)&&Number(key)>=min&&Number(key)<=max&&!excluded?.has(Number(key))&&validColor(color));
 if(!Object.hasOwn(palettes,config.palette)||!['balanced','lower','higher'].includes(config.layerGrowth)||!validColorMap(config.layerColors,2,MAX_SCALE_SIZE)||!validColorMap(config.keyColors,0,139,commands)||!validColorMap(config.degreeColors,0,MAX_SCALE_SIZE-1))throw Error('Invalid saved MOS colors or button colors.');
 for(const key of ['mirror','flipHorizontal','flipVertical','outside','periodWrapping'])if(typeof config[key]!=='boolean')throw Error('Invalid layout '+key+'.');
 if(config.periodPlacement!=null)validatePeriodPlacement(config.periodPlacement);validateCopyPeriodStep(config.copyPeriodStep);
 const board=buildBoard(context,config);if(board.wrapping?.overlaps.length)throw Error('Resolve overlapping period copies before saving this layout.');
 return {name:name.trim(),context,config};
}
export function layoutPresetForState(preset,s){
 if(mappingKey(preset.context)!==mappingKey(s))return {error:`Use ${preset.context.name}`};
 const state={...s,n:preset.context.n,mode:preset.context.mode};
 try{const snapshot=layoutPresetSnapshot(preset.name,{context:state,config:preset.config});return {state,config:snapshot.config};}catch{return {error:'Unavailable at this tuning'};}
}
