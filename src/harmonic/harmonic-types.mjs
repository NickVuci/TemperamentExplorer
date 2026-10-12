import {immutable} from '../core/cache.mjs';
import {mappingContext} from './harmonic-context.mjs';
import {targetSetIdentity} from '../core/ji-limit-engine.mjs';

/** @typedef {{id:string,basis:number[],rows:number[][],coordinateConvention:string,schemaVersion:number}} MappingContextDTO */
/** @typedef {{mappingId:string,periodCents:number,generatorCents:number}} TuningContextDTO */
/** @typedef {{id:string,mappingId:string,equivalence:object,coordinatesOrClasses:number[][],sourceMemberLinks:object[],cardinalities:number[]}} TemperedShapeDTO */
/** @typedef {{version:1,mappingId:string,harmonicId?:string,shapeId?:string,interpretationId?:string,assessmentContext?:object,occurrenceId?:string,voicing?:object,source:string}} HarmonicSelectionDTO */
/** @typedef {{shapeId:string,mappingId:string,targetSetId:string,equivalence:'exact'|'octave',status:'not-dyadic'|'ji-liftable'|'essentially-tempered'|'unknown',liftWitness?:object,obstruction?:object,exploredStates:number,complete:boolean,algorithmVersion:string}} ETAssessmentDTO */

const VERSION=1;
const statuses=new Set(['not-dyadic','ji-liftable','essentially-tempered','unknown']);
const equivalences=new Set(['exact','octave']);

function fail(message){throw Error(`Harmonic record: ${message}`);}
function nonempty(value,name){if(typeof value!=='string'||!value.length)fail(`${name} must be a nonempty string.`);return value;}
function record(value,name){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype)fail(`${name} must be a plain object.`);
 return value;
}
function jsonCopy(value,seen=new Set()){
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value)&&(!Number.isInteger(value)||Number.isSafeInteger(value)))return value;
 if(Array.isArray(value)){
  if(seen.has(value))fail('circular value');seen.add(value);
  const result=value.map(item=>jsonCopy(item,seen));seen.delete(value);return result;
 }
 record(value,'value');
 if(seen.has(value))fail('circular value');seen.add(value);
 const result=Object.fromEntries(Object.keys(value).sort().map(key=>[key,jsonCopy(value[key],seen)]));
 seen.delete(value);return result;
}

/** JSON-safe canonical serialization, rejecting BigInt, undefined, cycles and unsafe numbers. */
export function canonicalHarmonicJSON(value){return JSON.stringify(jsonCopy(value));}
function key(kind,payload){return `harmonic-${kind}-v${VERSION}:${canonicalHarmonicJSON(payload)}`;}
function coordinate(value,name){
 if(!Array.isArray(value)||value.length!==2||!value.every(Number.isSafeInteger))fail(`${name} must be an integer [period, generator] pair.`);
 return value;
}
function sameMapping(value,mappingId,name){if(value?.mappingId!==undefined&&value.mappingId!==mappingId)fail(`${name} has a different mapping ID.`);}
function frozen(value){return immutable(jsonCopy(value));}

/** Validate a mapping-only DTO against the authoritative matrix constraints and ID. */
export function validateMappingContext(value){
 record(value,'mapping context');
 const context=mappingContext(value);
 if(value.id!==context.id)fail('mapping context ID does not match its basis and rows.');
 if(value.coordinateConvention!==context.coordinateConvention)fail('mapping coordinate convention mismatch.');
 return frozen(value);
}

/** Mapping identity is unchanged by tuning, targets, scale or layout. */
export function harmonicMappingKey(value){return mappingContext(value).id;}

/** Tuning errors depend on the mapping and the actual tuned period/generator. */
export function tuningKey({mappingId,periodCents,generatorCents}){
 nonempty(mappingId,'mappingId');
 for(const [name,value]of Object.entries({periodCents,generatorCents}))if(!Number.isFinite(value)||value<=0)fail(`${name} must be a positive finite number.`);
 return key('tuning',{mappingId,periodCents,generatorCents});
}

/** Target identity excludes tolerance, tuned cents, scale and layout. */
export function targetSetKey({mappingSubgroup,oddLimit,primeFilter=null,representationPolicy}){
 if(!['octave','native-exact'].includes(representationPolicy))fail('invalid target representation policy.');
 return targetSetIdentity({mappingSubgroup,oddLimit,primeFilter,representationPolicy});
}

/** Mode belongs to the occurrence context, never to the harmonic shape. */
export function scaleContextKey({mappingId,coordinates,mode}){
 nonempty(mappingId,'mappingId');
 if(!Array.isArray(coordinates)||!coordinates.length)fail('scale coordinates must be nonempty.');
 coordinates.forEach((value,index)=>coordinate(value,`scale coordinate ${index}`));
 if(!Number.isSafeInteger(mode)||mode<0||mode>=coordinates.length)fail('mode must index the scale.');
 return key('scale',{mappingId,coordinates,mode});
}

/** Placement cache scope: a layout changes without changing scale occurrences. */
export function harmonicLayoutKey({scaleId,config}){
 nonempty(scaleId,'scaleId');record(config,'layout config');
 return key('layout',{scaleId,config});
}

/** A shape must refer to the same mapping as its exact equivalence policy. */
export function validateTemperedShape(value){
 record(value,'tempered shape');nonempty(value.id,'shape ID');nonempty(value.mappingId,'mappingId');
 if(!value.equivalence||!['exact','period','octave'].includes(value.equivalence.kind)||value.equivalence.mappingKey!==value.mappingId)fail('shape equivalence/mapping mismatch.');
 if(!Array.isArray(value.coordinatesOrClasses)||!value.coordinatesOrClasses.length)fail('shape needs coordinate classes.');
 value.coordinatesOrClasses.forEach((item,index)=>coordinate(item,`shape class ${index}`));
 if(!Array.isArray(value.sourceMemberLinks)||!Array.isArray(value.cardinalities)||value.cardinalities.length!==value.coordinatesOrClasses.length||!value.cardinalities.every(n=>Number.isSafeInteger(n)&&n>0))fail('shape needs positive cardinalities for each coordinate class and member links.');
 return frozen(value);
}

/** Selection envelope may carry optional interpretation, occurrence or voicing. */
export function validateHarmonicSelection(value){
 record(value,'selection');
 if(value.version!==VERSION)fail('unsupported selection version.');
 nonempty(value.mappingId,'mappingId');nonempty(value.source,'source');
 if(!value.harmonicId&&!value.shapeId)fail('selection needs a harmonic or shape ID.');
 for(const name of ['harmonicId','shapeId','interpretationId','occurrenceId'])if(value[name]!==undefined)nonempty(value[name],name);
 if(value.assessmentContext!==undefined){
  record(value.assessmentContext,'assessment context');
  if(value.assessmentContext.mappingId!==value.mappingId)fail('assessment context has a different mapping ID.');
  nonempty(value.assessmentContext.targetSetId,'targetSetId');
 }
 if(value.voicing!==undefined){
  record(value.voicing,'voicing');
  if(!value.shapeId||value.voicing.shapeId!==value.shapeId)fail('voicing has a different shape ID.');
  sameMapping(value.voicing,value.mappingId,'voicing');
  if(!Array.isArray(value.voicing.voices)||!value.voicing.voices.length)fail('voicing needs voices.');
  value.voicing.voices.forEach((voice,index)=>{record(voice,`voice ${index}`);nonempty(voice.memberId,'memberId');coordinate(voice.coordinate,`voice ${index} coordinate`);if(voice.registerLift!==undefined&&!Number.isSafeInteger(voice.registerLift))fail('register lift must be a safe integer.');});
 }
 return frozen(value);
}

/** Structural boundary checks; the future solver remains responsible for proving the evidence. */
export function validateAssessment(value,{mappingId,targetSetId,shapeId}={}){
 record(value,'ET assessment');
 for(const name of ['shapeId','mappingId','targetSetId','algorithmVersion'])nonempty(value[name],name);
 if(mappingId!==undefined&&value.mappingId!==mappingId||targetSetId!==undefined&&value.targetSetId!==targetSetId||shapeId!==undefined&&value.shapeId!==shapeId)fail('assessment context mismatch.');
 if(!equivalences.has(value.equivalence))fail('assessment needs exact or octave equivalence.');
 if(!statuses.has(value.status))fail('invalid assessment status.');
 if(!Number.isSafeInteger(value.exploredStates)||value.exploredStates<0||typeof value.complete!=='boolean')fail('assessment needs a safe state count and completeness flag.');
 if(value.status==='unknown'&&(value.complete||value.liftWitness!==undefined))fail('unknown assessment cannot claim a complete proof or lift.');
 if(value.status==='ji-liftable'&&(!value.complete||!value.liftWitness||!Array.isArray(value.liftWitness.vertices)||!value.liftWitness.vertices.length))fail('JI-liftable assessment needs a coherent lift witness.');
 const emptyEdge=value.obstruction?.emptyEdge;
 if(value.status==='not-dyadic'&&(!value.complete||!Array.isArray(emptyEdge)||emptyEdge.length!==2||!emptyEdge.every(n=>Number.isSafeInteger(n)&&n>=0)||emptyEdge[0]===emptyEdge[1]))fail('not-dyadic assessment needs an empty edge witness.');
 if(value.status==='essentially-tempered'&&(!value.complete||value.liftWitness!==undefined||value.obstruction?.allEdgesNonempty!==true||value.obstruction?.exhaustive!==true))fail('ET assessment needs complete nonempty dyads and exhaustive search evidence.');
 return frozen(value);
}
