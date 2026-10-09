import {BoundedCache,immutable} from './cache.mjs';
import {domainsForShape,enumerateDyadicShapes} from './harmonic-dyad-graph.mjs';
import {quotientCoordinate,shapeKey} from './harmonic-equivalence.mjs';
import {jiMonzoClassKey} from './harmonic-ji-lift.mjs';
import {mapMonzo} from './ji-monzo.mjs';
import {MAX_CHORD_TONES} from './chord-identity-v2.mjs';

// The chord space of one finite target set. Rooted on any member, every JI chord whose dyads all lie in
// the target set is the unison plus a subset of the target classes, so the complete JI chord list is a
// clique enumeration over that finite set and depends only on the target set, subgroup basis and
// equivalence, never on the temperament. A tempered dyadic shape is JI exactly when it is the image of
// one of those chords; every other dyadic shape is essentially tempered. Classification is a lookup.
export const CHORD_SPACE_VERSION='chord-space-v1';
export const CHORD_SPACE_SIZES=Object.freeze([2,3,4,5,6]);
export const CHORD_SPACE_MAX_SIZE=MAX_CHORD_TONES;

const jiCache=new BoundedCache(8),viewCache=new BoundedCache(16),spaceCache=new BoundedCache(4);
const subtract=(a,b)=>a.map((value,index)=>value-b[index]);
// Generous enumeration bounds: classification is only exact when the tempered enumeration is complete,
// and completeness is reported rather than assumed.
const JI_SEARCH_NODES=2_000_000;
const SHAPE_BOUNDS=Object.freeze({maxNeighborVertices:512,maxCandidateShapes:50_000,maxSearchNodes:10_000_000,maxDomainChecks:2_000_000});

function requestedSizes(sizes){
 const list=[...new Set(sizes??CHORD_SPACE_SIZES)].sort((a,b)=>a-b);
 if(!list.length||list.some(size=>!Number.isSafeInteger(size)||size<2||size>CHORD_SPACE_MAX_SIZE))throw Error(`Chord-space sizes must be from 2 through ${CHORD_SPACE_MAX_SIZE}.`);
 return list;
}

/** Root-relative JI pitch classes of every mapped target, one per exact class. */
function jiClasses(index){
 const byKey=new Map();
 for(const vertex of index.vertices)for(const item of vertex.interpretations){
  const key=jiMonzoClassKey(item.monzo,index.basis,index.equivalence);
  if(!byKey.has(key))byKey.set(key,{key,monzo:item.monzo.map((value,column)=>index.equivalence==='octave'&&index.basis[column]===2?0:value),ratio:item.ratio,targetId:item.targetId});
 }
 return [...byKey.values()].sort((a,b)=>a.key.localeCompare(b.key,'en'));
}

/**
 * Every JI chord of the requested sizes whose ordered dyads all lie in the target set, once per
 * transposition class. Only the target set, basis and equivalence are read, so mappings that share
 * them share one enumeration.
 */
export function enumerateJIChordSpace(index,{sizes}={}){
 const wanted=requestedSizes(sizes),base=[index.targetSetId,index.basis,index.equivalence];
 return viewCache.get(JSON.stringify([...base,wanted]),()=>{
  // Any complete enumeration up to at least the largest wanted size serves every smaller range.
  const max=wanted.at(-1),reuse=[...jiCache.entries.values()].find(full=>JSON.stringify(full.base)===JSON.stringify(base)&&full.maxSize>=max&&full.complete);
  const full=reuse??jiCache.get(JSON.stringify([...base,max]),()=>enumerateUpTo(index,max));
  return immutable({version:CHORD_SPACE_VERSION,targetSetId:index.targetSetId,basis:[...index.basis],equivalence:index.equivalence,sizes:wanted,complete:full.complete,
   classCount:full.classCount,chords:full.chords.filter(chord=>wanted.includes(chord.size))});
 });
}

// One complete clique walk over the target classes, recording every chord of 2..max members.
function enumerateUpTo(index,max){
 const classes=jiClasses(index),keys=new Set(classes.map(item=>item.key)),unison=jiMonzoClassKey(index.basis.map(()=>0),index.basis,index.equivalence);
 if(!keys.has(unison))throw Error('The target set has no unison class.');
 const root=classes.findIndex(item=>item.key===unison);
 const consonant=(a,b)=>keys.has(jiMonzoClassKey(subtract(classes[b].monzo,classes[a].monzo),index.basis,index.equivalence));
 const adjacent=classes.map((_,a)=>classes.map((__,b)=>a!==b&&consonant(a,b)&&consonant(b,a)));
 const canonical=members=>{let best=null;
  for(const anchor of members){const text=members.map(member=>jiMonzoClassKey(subtract(classes[member].monzo,classes[anchor].monzo),index.basis,index.equivalence)).sort().join('|');if(best===null||text<best)best=text;}
  return best;};
 const chords=new Map();let nodes=0,complete=true;
 const walk=(chosen,candidates)=>{
  if(chosen.length>=2){const key=canonical(chosen);if(!chords.has(key))chords.set(key,{key,members:chosen.map(member=>classes[member])});}
  if(chosen.length===max)return;
  for(let position=0;position<candidates.length;position++){
   if(++nodes>JI_SEARCH_NODES){complete=false;return;}
   const next=candidates[position];walk([...chosen,next],candidates.slice(position+1).filter(other=>adjacent[next][other]));
   if(!complete)return;
  }
 };
 walk([root],classes.map((_,i)=>i).filter(i=>i!==root&&adjacent[root][i]));
 return immutable({base:[index.targetSetId,index.basis,index.equivalence],maxSize:max,complete,
  classCount:classes.length,chords:[...chords.values()].map(chord=>({key:chord.key,size:chord.members.length,
   members:chord.members.map(member=>({ratio:member.ratio,targetId:member.targetId,monzo:[...member.monzo]}))}))});
}

/** The tempered image of one JI chord, or null when tempering merges two of its members. */
export function temperedImage(chord,index){
 const coordinates=chord.members.map(member=>mapMonzo(index.rows,member.monzo));
 const classKeys=coordinates.map(point=>quotientCoordinate(index.policy,point).key);
 if(new Set(classKeys).size!==classKeys.length)return null;
 return {id:shapeKey(index.policy,coordinates),coordinates};
}

/**
 * Classify every tempered dyadic shape of the requested sizes. A shape is 'ji' when some JI chord
 * maps onto it (all such chords are attached) and 'essentially-tempered' otherwise. If the JI
 * enumeration hit its bound, shapes without a found preimage are 'unknown', never ET. The result is
 * complete only when both enumerations finished inside their bounds.
 */
export function classifyChordSpace(index,{sizes}={}){
 const wanted=requestedSizes(sizes),cacheKey=JSON.stringify([index.mappingId,index.targetSetId,index.equivalence,wanted]);
 return spaceCache.get(cacheKey,()=>{
  const space=enumerateJIChordSpace(index,{sizes:wanted}),images=new Map();let degenerate=0;
  for(const chord of space.chords){const image=temperedImage(chord,index);if(!image){degenerate++;continue;}
   if(!images.has(image.id))images.set(image.id,[]);images.get(image.id).push(chord);}
  const shapes=[],iterator=enumerateDyadicShapes(index,{...SHAPE_BOUNDS,sizes:wanted});
  for(const shape of iterator){const interpretations=images.get(shape.id)??[];
   const slim={id:shape.id,mappingId:shape.mappingId,targetSetId:shape.targetSetId,equivalence:shape.equivalence,policyId:shape.policyId,coordinates:shape.coordinates};
   shapes.push({id:shape.id,size:shape.coordinates.length,coordinates:shape.coordinates,shape:slim,status:interpretations.length?'ji':space.complete?'essentially-tempered':'unknown',interpretations});}
  const enumeration=iterator.progress,seen=new Set(shapes.map(shape=>shape.id));
  // Every non-degenerate JI image is dyadic, so a complete enumeration must contain all of them.
  const missingImages=[...images.keys()].filter(id=>!seen.has(id)).length;
  if(enumeration.complete&&space.complete&&missingImages)throw Error('Chord-space invariant failed: a JI image is absent from the complete tempered enumeration.');
  return immutable({version:CHORD_SPACE_VERSION,mappingId:index.mappingId,targetSetId:index.targetSetId,equivalence:index.equivalence,sizes:wanted,
   complete:enumeration.complete&&space.complete,reason:!space.complete?'ji-search-bound':enumeration.complete?null:enumeration.reason,shapes,
   counts:{jiChords:space.chords.length,degenerateJIChords:degenerate,shapes:shapes.length,ji:shapes.filter(shape=>shape.status==='ji').length,
    essentiallyTempered:shapes.filter(shape=>shape.status==='essentially-tempered').length,unknown:shapes.filter(shape=>shape.status==='unknown').length,unenumeratedImages:missingImages},enumeration});
 });
}

/** Per-dyad decomposition of a shape: each ordered pair's tempered class and every JI interval mapped to it. */
export function chordDyads(shape,index){
 const domains=domainsForShape(shape,index);
 return domains.edges.filter(edge=>edge.fromMember<edge.toMember).map(edge=>({fromMember:edge.fromMember,toMember:edge.toMember,
  coordinate:edge.coordinateDifference,classKey:edge.classKey,interpretations:edge.interpretations.map(item=>({ratio:item.ratio,targetId:item.targetId,monzo:item.monzo,coordinate:item.coordinate,idealCents:item.idealCents}))}));
}
