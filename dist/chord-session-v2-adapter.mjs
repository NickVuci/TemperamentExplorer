import {chordIdentity} from './chord-identity-v2.mjs';
import {discoveryDefaults} from './chord-discovery-v2.mjs';
import {realizationDefaults} from './chord-realization-v2.mjs';
/**
 * Chord catalogue session adapter for the v2-only controller.
 *
 * Intended destination: dist/chord-session-v2-adapter.mjs
 * It deliberately has no dependency on the retired catalogue engine.
 */
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const copy=value=>structuredClone(value);
const V2_DEFAULT_TEXT='4:5:6:7:9:11';
// Validate through the authoritative parser; retain spelling/order as metadata.
export function normalizeLegacyChordText(value){
 if(typeof value!=='string')return null;
 try{chordIdentity(value);return value.trim();}catch{return null;}
}

function legacySnapshot(raw){
 const source=object(raw)?raw:{};
 return {
  config:object(source.config)?copy(source.config):null,
  selection:object(source.selection)?copy(source.selection):null,
  spelling:typeof source.spelling==='string'?source.spelling:'',
 };
}
function mappedFilters(config){
 const next=discoveryDefaults();
 if(!object(config))return next;
 const {minTones,maxTones}=config;
 if(Number.isInteger(minTones)&&Number.isInteger(maxTones)&&minTones>=2&&maxTones<=8&&minTones<=maxTones){
  next.minTones=minTones;next.maxTones=maxTones;
 }
 return next;
}
function mappedRealization(config,selection){
 const next=realizationDefaults();
 if(object(config)){
  if(['compact','original','open'].includes(config.style))next.style=config.style;
  if(Number.isInteger(config.reach)&&config.reach>=0&&config.reach<=20)next.reach=config.reach;
 }
 // Legacy voicing IDs are numeric. Apply only the shared inversion part; v2
 // will normalize unavailable inversions after it has an exact occurrence.
 if(object(selection)&&/^\d+$/.test(selection.voicing||'')&&Number(selection.voicing)<=7)next.inversion=Number(selection.voicing);
 return next;
}
function chooseLegacyText(legacy){
 const config=legacy.config||{},selection=legacy.selection||{};
 const spelling=normalizeLegacyChordText(legacy.spelling);
 // A spelling is tied to the selected legacy group and is the only source from
 // which a root/instance can be proved. Prefer it in that case.
 if(selection.group&&spelling)return {text:spelling,kind:'spelling'};
 for(const [kind,value] of [['custom',config.custom],['spelling',legacy.spelling],['search',config.search]]){
  const text=normalizeLegacyChordText(value);
  if(text)return {text,kind};
 }
 return {text:V2_DEFAULT_TEXT,kind:'default'};
}

/**
 * Adapt a raw old or current catalogue payload without consulting app state.
 * `legacy` is retained verbatim enough for a caller to preserve it in its
 * outer session object. An existing engineV2 payload always wins unchanged.
 */
export function adaptChordCatalogueSession(raw){
 const source=object(raw)?raw:{};
 const legacy=legacySnapshot(source);
 if(own(source,'engineV2'))return {source:'engineV2',engineV2:copy(source.engineV2),legacy,deferred:null};
 const chosen=chooseLegacyText(legacy);
 const selection=legacy.selection;
 return {
  source:'legacy',
  engineV2:{version:2,text:chosen.text,filters:mappedFilters(legacy.config),realizationOptions:mappedRealization(legacy.config,selection),selected:'',fingering:''},
  legacy,
  // App state is not reliable during session restore. Resolve this later,
  // after v2 has analyzed `text` against the assigned scale.
  deferred:chosen.kind==='spelling'&&object(selection)&&selection.group?{text:chosen.text,selection:copy(selection)}:null,
 };
}

function legacyDegrees(instance){
 if(typeof instance!=='string')return null;
 const part=instance.split('|')[1];
 if(!part||!/^\d+(?:,\d+)*$/.test(part))return null;
 return part.split(',').map(Number);
}
function validFingering(value,count){
 return typeof value==='string'&&/^\d+(?:,\d+)*$/.test(value)&&value.split(',').length===count?value:'';
}

/**
 * Resolve a legacy root only from an already-computed v2 analysis.
 * It returns empty strings unless exactly one occurrence has both the saved
 * root and, when available, the saved ordered degree list. This prevents an
 * ambiguous old selection from becoming a different v2 chord/root.
 */
export function resolveDeferredLegacySelection(deferred,analysis,currentText){
 if(!deferred||!analysis||currentText!==deferred.text)return {selected:'',fingering:''};
 const selection=deferred.selection;
 if(!/^\d+$/.test(selection.root||''))return {selected:'',fingering:''};
 const root=Number(selection.root),degrees=legacyDegrees(selection.instance);
 let matches=(analysis.occurrences?.completeOccurrences||[]).filter(item=>item.root===root);
 if(degrees)matches=matches.filter(item=>item.degrees.length===degrees.length&&item.degrees.every((degree,index)=>degree===degrees[index]));
 if(matches.length!==1)return {selected:'',fingering:''};
 return {selected:matches[0].id,fingering:validFingering(selection.fingering,matches[0].degrees.length)};
}
