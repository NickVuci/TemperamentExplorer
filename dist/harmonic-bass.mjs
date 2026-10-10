// Chords built on a bass note. For a chord shape and a scale degree, every inversion whose lowest
// note can sit on that degree, voiced in close position above it (every other note within one
// equivalence interval above the bass). Pure: no DOM, no catalogue state.
//
// Root position is the chord's directory spelling: member 0 is the root. Inversion k puts the k-th
// distinct pitch class of that spelling, in close-position pitch order above the root, in the bass
// (k = 0 is root position). JI chords are ordered by their JI pitches, so tempering never reorders
// them; tempered-only shapes use tuned pitches. Classes and voicings use the octave when the basis
// contains 2 (so divided-octave periods keep their JI meaning); otherwise chords are exact and only
// their lowest note can be the bass.
import {mapRatio} from './engine.mjs';
import {coordinateCents} from './pitch.mjs';
import {equivalencePolicy,quotientCoordinate} from './harmonic-equivalence.mjs';

const JI_OCTAVE=1200;
const jiCents=tone=>1200*Math.log2(Number(tone.n)/Number(tone.d));

/** "root position", "1st inversion", "2nd inversion", … */
export function inversionName(k){
 if(k===0)return 'root position';
 const tens=k%100,suffix=tens>=11&&tens<=13?'th':k%10===1?'st':k%10===2?'nd':k%10===3?'rd':'th';
 return `${k}${suffix} inversion`;
}

/**
 * Distinct pitch classes of a shape in close-position order above member 0.
 * `tones` (optional, aligned with `coordinates`) gives JI ratios {n,d}; without them tuned cents are used.
 * Returns {octave, octaveCents, classes:[{member, offset}]} with offset the class's height above the
 * root within one octave (or its plain height above the root for exact chords), ascending.
 */
export function chordClasses(s,coordinates,tones=null){
 if(!Array.isArray(coordinates)||!coordinates.length)throw Error('A chord needs at least one coordinate.');
 const octave=s.basis.includes(2)?mapRatio(2,1,s):null,ji=Array.isArray(tones)&&tones.length===coordinates.length&&tones.every(t=>t&&t.n!=null&&t.d!=null);
 const octaveCents=octave?(ji?JI_OCTAVE:coordinateCents(s,octave)):null;
 const pitch=i=>ji?jiCents(tones[i]):coordinateCents(s,coordinates[i]);
 const policy=octave?equivalencePolicy(s,'octave'):null,seen=new Set(),classes=[];
 coordinates.forEach((coordinate,member)=>{
  const key=policy?quotientCoordinate(policy,coordinate).key:JSON.stringify(coordinate);
  if(seen.has(key))return;seen.add(key);
  const raw=pitch(member)-pitch(0);
  classes.push({member,offset:octave?((raw%octaveCents)+octaveCents)%octaveCents:raw,pitch:pitch(member)});
 });
 // Round away floating noise so equal JI heights compare equal; distinct classes never coincide.
 classes.sort((a,b)=>(Math.round(a.offset*1e6)-Math.round(b.offset*1e6))||a.member-b.member);
 return {octave,octaveCents,classes};
}

/**
 * Close-position voicing with `member` in the bass at coordinate `bass`. Every other class keeps
 * its exact interval to the bass up to whole octaves, folded into the octave above the bass.
 * Returns members and coordinates in ascending pitch order, bass first.
 */
export function bassVoicing(s,coordinates,tones,member,bass){
 if(!Number.isInteger(member)||member<0||member>=coordinates.length)throw Error('The bass must be a note of the chord.');
 const {octave,octaveCents,classes}=chordClasses(s,coordinates,tones),ji=Array.isArray(tones)&&tones.length===coordinates.length;
 const pitch=i=>ji?jiCents(tones[i]):coordinateCents(s,coordinates[i]);
 // A doubled note stands for its class: its first occurrence.
 const key=octave?quotientCoordinate(equivalencePolicy(s,'octave'),coordinates[member]).key:JSON.stringify(coordinates[member]);
 const base=classes.find(c=>(octave?quotientCoordinate(equivalencePolicy(s,'octave'),coordinates[c.member]).key:JSON.stringify(coordinates[c.member]))===key);
 const voices=classes.map(c=>{
  const height=pitch(c.member)-pitch(base.member),lifts=octave?Math.floor(height/octaveCents+1e-9):0;
  const delta=coordinates[c.member].map((v,axis)=>v-coordinates[base.member][axis]-(octave?lifts*octave[axis]:0));
  return {member:c.member,coordinate:bass.map((v,axis)=>v+delta[axis]),height:height-(octave?lifts*octaveCents:0)};
 });
 if(!octave&&voices.some(v=>v.height<0))return null;
 voices.sort((a,b)=>a.height-b.height||a.member-b.member);
 return {members:voices.map(v=>v.member),coords:voices.map(v=>v.coordinate)};
}

/**
 * Every inversion of a chord that has its bass on `degree` of the scale, from a shape-occurrence
 * search (`searchShapeOccurrences`, whose occurrence members follow the shape's member order).
 * Returns [{member, inversion, rootPosition, classCount, degree, bass, coords, members, degrees, occurrenceId}].
 */
export function bassInversions(s,coordinates,tones,occurrences,degree){
 const {octave,classes}=chordClasses(s,coordinates,tones),rank=new Map(classes.map((c,i)=>[c.member,i]));
 const policy=octave?equivalencePolicy(s,'octave'):null,classOf=new Map();
 coordinates.forEach((coordinate,member)=>{const key=policy?quotientCoordinate(policy,coordinate).key:JSON.stringify(coordinate);if(!classOf.has(key))classOf.set(key,member);});
 const representative=member=>classOf.get(policy?quotientCoordinate(policy,coordinates[member]).key:JSON.stringify(coordinates[member]));
 const out=[],seen=new Set();
 for(const occurrence of occurrences?.completeOccurrences??[]){
  occurrence.assignments.forEach((assignment,member)=>{
   if(assignment.degree!==degree)return;
   const bassMember=representative(member),inversion=rank.get(bassMember);
   if(inversion===undefined||seen.has(bassMember))return;
   // Exact chords cannot be inverted: only their lowest note can be the bass.
   if(!octave&&inversion!==0)return;
   const voicing=bassVoicing(s,coordinates,tones,bassMember,assignment.degreeCoordinate);
   if(!voicing)return;
   seen.add(bassMember);
   const degreeOf=new Map(occurrence.assignments.map((a,i)=>[representative(i),a.degree]));
   out.push({member:bassMember,inversion,rootPosition:inversion===0,classCount:classes.length,degree,bass:[...assignment.degreeCoordinate],
    coords:voicing.coords,members:voicing.members,degrees:voicing.members.map(m=>degreeOf.get(m)??null),occurrenceId:occurrence.id});
  });
 }
 return out.sort((a,b)=>a.inversion-b.inversion);
}
