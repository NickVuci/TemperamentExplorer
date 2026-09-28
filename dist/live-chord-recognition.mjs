import {chordCandidates,withinJILimits} from './chord-discovery-v2.mjs';
import {projectChord} from './chord-projection-v2.mjs';
import {coordinateCents} from './pitch.mjs';

const coordinateKey=m=>`${m[0]},${m[1]}`;
const coordinateOrder=(s,a,b)=>coordinateCents(s,a)-coordinateCents(s,b)||a[0]-b[0]||a[1]-b[1];
export function normalizeLiveChordShape(coordinates,state){
 if(!Array.isArray(coordinates))throw Error('Played coordinates must be an array.');
 const unique=new Map(coordinates.map(m=>{
  if(!Array.isArray(m)||m.length!==2||!Number.isSafeInteger(m[0])||!Number.isSafeInteger(m[1]))throw Error('Each played note needs an integer period/generator coordinate.');
  return [coordinateKey(m),m.slice()];
 }));
 const ordered=[...unique.values()].sort((a,b)=>coordinateOrder(state,a,b));
 if(!ordered.length)return [];
 const bass=ordered[0];
 return ordered.map(m=>[m[0]-bass[0],m[1]-bass[1]]).sort((a,b)=>coordinateOrder(state,a,b));
}

function toleranceOf(settings){
 const tolerance=settings.maxError??settings.tol??10;
 if(!Number.isFinite(tolerance)||tolerance<0||tolerance>100)throw Error('Live chord tolerance must be between 0 and 100 cents.');
 return tolerance;
}

function contextKey(state,settings,tolerance){
 return JSON.stringify([state.basis,state.rows,state.p,state.g,settings.limit??15,settings.primeLimit??null,tolerance]);
}

export function createLiveChordRecognizer(){
 let cached=null;
 function prepare(state,settings={}){
  const tolerance=toleranceOf(settings),key=contextKey(state,settings,tolerance);
  if(cached?.key===key)return cached;
  const byShape=new Map(),oddLimit=settings.limit??15,primeLimit=settings.primeLimit??null;
  for(const candidate of chordCandidates()){
   const identity=candidate.identity;
   if(identity.cardinality<2||identity.cardinality>8||!withinJILimits(identity,oddLimit,primeLimit))continue;
   const projection=projectChord(state,identity,{tolerance});
   if(projection.basisStatus!=='mapped'||projection.qualityStatus!=='within-tolerance')continue;
   const shape=normalizeLiveChordShape(projection.notes.map(note=>note.coordinate),state);
   if(shape.length!==identity.cardinality)continue;
   const record={id:identity.fingerprint,label:candidate.label,form:candidate.form,maxErrorCents:projection.maxErrorCents,rmsErrorCents:projection.rmsErrorCents,pairwiseMaxErrorCents:projection.pairwiseMaxErrorCents,shape};
   const shapeKey=JSON.stringify(shape),group=byShape.get(shapeKey)||[];
   group.push(record);byShape.set(shapeKey,group);
  }
  for(const group of byShape.values())group.sort((a,b)=>a.maxErrorCents-b.maxErrorCents||a.rmsErrorCents-b.rmsErrorCents||a.id.localeCompare(b.id));
  cached={key,tolerance,byShape};
  return cached;
 }
 function recognize(state,notes,settings={}){
  if(!Array.isArray(notes))throw Error('Active notes must be an array.');
  if(!notes.length)return {status:'empty',noteCount:0,matches:[]};
  const coordinates=notes.map(note=>note.coordinate);
  let shape;
  try{shape=normalizeLiveChordShape(coordinates,state);}catch{return {status:'unavailable',noteCount:0,matches:[]};}
  const noteCount=shape.length;
  if(noteCount<2)return {status:'single-note',noteCount,matches:[]};
  if(noteCount>8)return {status:'no-match',reason:'too-many-notes',noteCount,matches:[]};
  const index=prepare(state,settings),matches=index.byShape.get(JSON.stringify(shape))||[];
  return {status:matches.length?'match':'no-match',noteCount,matches:matches.slice(),bassCents:Math.min(...notes.map(note=>Number.isFinite(note.cents)?note.cents:Infinity)),tolerance:index.tolerance};
 }
 return {prepare,recognize,clear(){cached=null;}};
}
