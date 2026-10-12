// Saved physical patterns retain an exact voice-to-cell certificate, not cached
// sounding cents, scores or search results. Tuning is reapplied when they are read.
import {chordIdentity} from '../chords/chord-identity.mjs';
import {projectChord} from '../chords/chord-projection.mjs';
import {harmonicIdentity} from '../harmonic/harmonic-equivalence.mjs';
import {mappingContext} from '../harmonic/harmonic-context.mjs';
import {voicingReference} from '../chords/chord-voicings.mjs';
import {layoutPresetSnapshot} from '../hexboard/layout-preset-data.mjs';
import {buildBoard} from '../hexboard/hexboard.mjs';
import {canonicalGeometricShape,geometricShapeForKeys} from './geometric-shapes.mjs';
import {coordinateCents} from '../core/pitch.mjs';

export const SHAPE_PRESET_VERSION=1;
export const MAX_SAVED_SHAPES=512;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const integerPair=value=>Array.isArray(value)&&value.length===2&&value.every(Number.isSafeInteger);
const fail=()=>{throw Error('Invalid saved chord shape.');};

/** Validate the saved association against its mapping and actual board. */
export function shapePresetSnapshot(name,input){
 if(typeof name!=='string'||!name.trim()||name.trim().length>80)throw Error('Enter a shape name from 1 to 80 characters.');
 if(!input||input.version!==SHAPE_PRESET_VERSION||JSON.stringify(input).length>32000)fail();
 const layout=layoutPresetSnapshot(name,{context:input.context,config:input.config});
 const context=layout.context,config=layout.config,mapping=mappingContext(context);
 if(!Array.isArray(input.shape?.cells)||input.shape.cells.length<1||input.shape.cells.length>8||input.shape.cells.some(cell=>!integerPair(cell)))fail();
 const shape=canonicalGeometricShape(input.shape.cells);
 if(shape.id!==input.shape.id||!same(shape.cells,input.shape.cells))fail();
 const keys=input.placement?.keys;
 if(!Array.isArray(keys)||keys.length!==shape.cells.length||new Set(keys).size!==keys.length||keys.some(key=>!Number.isInteger(key)||key<0||key>=140))fail();
 const board=buildBoard(context,config),byKey=new Map(board.keys.map(key=>[key.index,key]));
 if(keys.some(key=>!byKey.get(key)?.enabled||byKey.get(key)?.command))fail();
 const placed=geometricShapeForKeys(board,keys);
 if(placed.id!==shape.id||!same(placed.keys,keys))fail();
 const identity=chordIdentity(input.source?.input),projection=projectChord(context,identity);
 if(projection.basisStatus!=='mapped')throw Error('This source chord is outside the saved mapping.');
 const family=harmonicIdentity(identity,context.basis.includes(2)?'octave':'exact');
 if(input.source.chordId!==undefined&&input.source.chordId!==identity.fingerprint||input.source.familyId!==undefined&&input.source.familyId!==family.familyId)fail();
 const sourceCoordinates=identity.orderedRatios.map(ratio=>projection.notes[identity.canonicalRatios.findIndex(item=>item.label===ratio)].coordinate);
 const a=input.association,rootMember=input.source.rootMember??a?.rootMember??0,n=sourceCoordinates.length;
 if(!a||!Number.isInteger(rootMember)||rootMember<0||rootMember>=n||a.rootMember!==undefined&&a.rootMember!==rootMember)fail();
 if(!Array.isArray(a.coordinates)||a.coordinates.length!==n||a.coordinates.some(point=>!integerPair(point))||!Array.isArray(a.memberCells)||a.memberCells.length!==n||a.memberCells.some(cell=>!Number.isInteger(cell)||cell<0||cell>=keys.length))fail();
 if(new Set(a.memberCells).size!==keys.length||!Array.isArray(a.lifts)||a.lifts.length!==n||a.lifts.some(lift=>!Number.isSafeInteger(lift)||Math.abs(lift)>256)||a.lifts[rootMember]!==0)fail();
 const reference=voicingReference(context);
 if(!a.reference||a.reference.ratio!==reference.ratio||!same(a.reference.vector,reference.m))fail();
 if(a.sourceCoordinates&&!same(a.sourceCoordinates,sourceCoordinates))fail();
 const origin=a.coordinates[rootMember],sourceOrigin=sourceCoordinates[rootMember];
 for(let member=0;member<n;member++){
  const expected=sourceCoordinates[member].map((value,axis)=>origin[axis]+value-sourceOrigin[axis]+a.lifts[member]*reference.m[axis]);
  if(!expected.every(Number.isSafeInteger)||!same(expected,a.coordinates[member])||!same(expected,byKey.get(keys[a.memberCells[member]]).m))fail();
  for(let before=0;before<member;before++){
   const sourceCoincides=same(sourceCoordinates[before],sourceCoordinates[member]),playedCoincides=same(a.coordinates[before],a.coordinates[member]);
   // A source collision is one physical key; a voicing cannot create a new one.
   if(sourceCoincides!==playedCoincides||sourceCoincides&&(a.memberCells[before]!==a.memberCells[member]||a.lifts[before]!==a.lifts[member]))fail();
  }
 }
 const rootKey=keys[a.memberCells[rootMember]];
 return {version:SHAPE_PRESET_VERSION,name:name.trim(),shape:{id:shape.id,cells:shape.cells},context,config,
  source:{input:identity.originalInput,chordId:identity.fingerprint,familyId:family.familyId,rootMember},placement:{keys:[...keys]},
  association:{mappingId:mapping.id,rootMember,rootKey,rootDegree:byKey.get(rootKey).degree??null,sourceCoordinates:structuredClone(sourceCoordinates),
   coordinates:structuredClone(a.coordinates),memberCells:[...a.memberCells],memberKeys:a.memberCells.map(cell=>keys[cell]),lifts:[...a.lifts],
   reference:{kind:reference.kind,ratio:reference.ratio,vector:[...reference.m],idealCents:reference.idealCents}}};
}

/** Construct the small persisted record from one chosen search association. */
export function shapePresetFromPlacement(name,{state,config,shape,placement,association=placement?.associations?.[0],target}={}){
 if(!association)throw Error('Choose a chord reading before saving this shape.');
 const input=target?.input??association.input;
 return shapePresetSnapshot(name,{version:SHAPE_PRESET_VERSION,shape:{id:shape?.id??placement?.shapeId,cells:shape?.cells},context:state,config,
  source:{input,chordId:association.chordId,familyId:association.familyId,rootMember:association.rootMember},placement:{keys:placement?.keys},association});
}

/** Recheck a saved placement on the supplied layout; derive sounding cents now. */
export function shapePresetForState(preset,state,config=preset.config){
 try{
  if(mappingContext(preset.context).id!==mappingContext(state).id)return {error:'This shape belongs to another temperament mapping.'};
  const snapshot=shapePresetSnapshot(preset.name,{...preset,context:state,config});
  const board=buildBoard(state,snapshot.config),keys=snapshot.placement.keys,coords=keys.map(key=>board.keys.find(item=>item.index===key).m);
  return {snapshot,shape:canonicalGeometricShape(snapshot.shape.cells),placement:{shapeId:snapshot.shape.id,keys,coords,pitches:coords.map(point=>coordinateCents(state,point)),associations:[snapshot.association]}};
 }catch{return {error:'This saved shape is unavailable on the current layout.'};}
}
