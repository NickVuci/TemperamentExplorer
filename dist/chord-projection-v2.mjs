import {chordMonzos} from './chord-identity-v2.mjs';
import {mapRatio} from './engine.mjs';
import {coordinateCents} from './pitch.mjs';
import {equivalencePolicy,shapeKey,quotientCoordinate,harmonicIdentity} from './harmonic-equivalence.mjs';
import {mappingContext} from './harmonic-context.mjs';
import {immutable} from './cache.mjs';

// Compatibility identity used by existing occurrence and voicing adapters.
export const periodClass=m=>String(m[1]);
const POLICY_KINDS=['exact','period','octave'];

function summarizeShape(policy,coordinates,equivalence=policy.kind){
 const members=coordinates.map((coordinate,memberIndex)=>{
  const quotient=quotientCoordinate(policy,coordinate);
  return {memberIndex,coordinate:[...coordinate],classKey:quotient.key,classCoordinate:quotient.classCoordinate};
 });
 const classes=new Map();
 for(const member of members){if(!classes.has(member.classKey))classes.set(member.classKey,{key:member.classKey,coordinate:member.classCoordinate,members:[]});classes.get(member.classKey).members.push(member.memberIndex);}
 const ordered=[...classes.values()].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
 const classIndex=new Map(ordered.map((item,index)=>[item.key,index]));
 const memberLinks=members.map(member=>({...member,classIndex:classIndex.get(member.classKey)}));
 return immutable({available:true,id:shapeKey(policy,coordinates),mappingId:policy.mappingKey,equivalence,policyId:policy.id,
  coordinateCount:coordinates.length,cardinality:ordered.length,classes:ordered,
  collisionGroups:ordered.filter(item=>item.members.length>1),memberLinks});
}

function unavailableShape(kind,context,reason,coordinateCount){
 return {available:false,id:null,mappingId:context.id,equivalence:kind,coordinateCount,cardinality:null,
  classes:[],collisionGroups:[],memberLinks:[],reason};
}

/** Project coordinate-only structures into distinct exact, period and octave identities. */
export function projectCoordinateShape(stateOrMapping,coordinates){
 if(!Array.isArray(coordinates)||coordinates.length<1)throw Error('A tempered shape needs at least one coordinate.');
 if(coordinates.some(point=>!Array.isArray(point)||point.length!==2||!point.every(Number.isSafeInteger)))throw Error('Shape coordinates must be safe integer [period, generator] pairs.');
 const context=mappingContext(stateOrMapping),policies={};
 for(const kind of POLICY_KINDS){try{policies[kind]=equivalencePolicy(context,kind);}catch(error){if(kind!=='octave')throw error;}}
 const identities={};
 for(const kind of POLICY_KINDS){
  if(policies[kind])identities[kind]=summarizeShape(policies[kind],coordinates,kind);
  else identities[kind]=unavailableShape(kind,context,'Mapped octave equivalence is unavailable for this subgroup.',coordinates.length);
 }
 const exact=identities.exact;
 identities.native={...exact,equivalence:'native-exact',identityPolicy:'exact'};
 return immutable({mappingId:context.id,coordinateCount:coordinates.length,identities,
  memberLinks:exact.memberLinks.map(member=>({memberIndex:member.memberIndex,coordinate:member.coordinate,
   exactClassIndex:member.classIndex,periodClassIndex:identities.period.memberLinks[member.memberIndex]?.classIndex??null,
   octaveClassIndex:identities.octave.memberLinks[member.memberIndex]?.classIndex??null,
   nativeClassIndex:member.classIndex}))});
}

function unavailableCoordinateShape(stateOrMapping,coordinateCount){
 const context=mappingContext(stateOrMapping),identities={};
 for(const kind of [...POLICY_KINDS,'native'])identities[kind]=unavailableShape(kind,context,'At least one JI member is outside the mapping subgroup.',coordinateCount);
 return immutable({mappingId:context.id,coordinateCount,identities,memberLinks:[]});
}

export function projectChord(s,identity,{tolerance=10}={}){
 if(!Number.isFinite(tolerance)||tolerance<0||tolerance>100)throw Error('Tolerance must be between 0 and 100 cents.');
 const monzos=chordMonzos(identity,s.basis);
 const notes=identity.canonicalRatios.map((q,i)=>{const {monzo,missingPrimes}=monzos[i],coordinate=missingPrimes.length?null:mapRatio(Number(q.n),Number(q.d),s),idealCents=1200*Math.log2(Number(q.n)/Number(q.d)),tunedCents=coordinate?coordinateCents(s,coordinate):null,errorCents=coordinate?tunedCents-idealCents:null;return {index:i,ratio:q.label,monzo,missingPrimes,coordinate,periodClass:coordinate?periodClass(coordinate):null,idealCents,tunedCents,errorCents,absoluteErrorCents:errorCents===null?null:Math.abs(errorCents)};});
 const mapped=notes.every(n=>n.coordinate),missingPrimes=[...new Set(notes.flatMap(n=>n.missingPrimes))].sort((a,b)=>a-b);
 const groups=new Map();for(const n of notes)if(n.coordinate){const k=n.periodClass;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(n.index);}
 const errors=notes.map(n=>n.errorCents),maxErrorCents=mapped?Math.max(...errors.map(Math.abs)):null,rmsErrorCents=mapped?Math.sqrt(errors.reduce((a,e)=>a+e*e,0)/errors.length):null;
 const pairErrors=mapped?notes.flatMap((a,i)=>notes.slice(i+1).map(b=>b.errorCents-a.errorCents)):[];
 const pairwiseMaxErrorCents=mapped?Math.max(0,...pairErrors.map(Math.abs)):null,pairwiseRmsErrorCents=mapped?(pairErrors.length?Math.sqrt(pairErrors.reduce((a,e)=>a+e*e,0)/pairErrors.length):0):null;
 const gens=[...groups.keys()].map(Number).sort((a,b)=>a-b);
 // Retain the exact v2 period-class fingerprint until occurrence consumers migrate.
 const temperedFingerprint=mapped?'temp2:'+JSON.stringify([s.basis,s.rows,gens.map(g=>g-gens[0])]):null;
 const shapeProjection=mapped?projectCoordinateShape(s,notes.map(note=>note.coordinate)):unavailableCoordinateShape(s,notes.length);
 const family=harmonicIdentity(identity,'octave');
 return {version:2,identity,harmonicIdentity:family,dualFamilyId:family.dualFamilyId,shapeIdentities:shapeProjection.identities,memberLinks:shapeProjection.memberLinks,
  legacyCardinalityEquivalence:'period',notes,basisStatus:mapped?'mapped':'outside-basis',missingPrimes,tolerance,maxErrorCents,rmsErrorCents,pairwiseMaxErrorCents,pairwiseRmsErrorCents,qualityStatus:!mapped?'unavailable':maxErrorCents<=tolerance?'within-tolerance':'above-tolerance',originalCardinality:identity.cardinality,temperedCardinality:mapped?groups.size:null,cardinalityStatus:!mapped?'unavailable':groups.size<identity.cardinality?'collapsed':'preserved',collisionGroups:[...groups].filter(([,v])=>v.length>1).map(([coordinate,members])=>({periodClass:coordinate,members})),temperedFingerprint,generatorSpan:mapped?gens.at(-1)-gens[0]:null};
}
