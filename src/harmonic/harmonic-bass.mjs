// Chords on a scale degree, as their bass or as their root. Pure: no DOM, no catalogue state.
//
// The root is the lowest note of a chord's default rotation, its directory spelling (member 0); the
// bass is simply the lowest sounding note. A chord with a known root is written root - chord, the root
// as a scale degree and the chord in its directory spelling: 0 - 4:5:6 is a major chord on degree 0, in
// any inversion. Root position puts the root in the bass. Inversion k puts the k-th
// distinct pitch class of that spelling, in close-position pitch order above the root, in the bass
// (k = 0 is root position). JI chords are ordered by their JI pitches, so tempering never reorders
// them; tempered-only shapes use tuned pitches. Classes and voicings use the octave when the basis
// contains 2 (so divided-octave periods keep their JI meaning); otherwise chords are exact and only
// their lowest note can be the bass.
import {mapRatio} from '../core/engine.mjs';
import {coordinateCents} from '../core/pitch.mjs';
import {equivalencePolicy,quotientCoordinate} from './harmonic-equivalence.mjs';

const JI_OCTAVE=1200;
const jiCents=tone=>1200*Math.log2(Number(tone.n)/Number(tone.d));

/** A chord with its root: `0 - 4:5:6`. Without a known root the chord is written alone. */
export const rootedChordName=(root,chord)=>root==null||root===''?String(chord):`${root} - ${chord}`;

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

// Class representatives: every member maps to the first member of its pitch class (member 0 is its own).
function representatives(s,coordinates,octave){
 const policy=octave?equivalencePolicy(s,'octave'):null,keyOf=c=>policy?quotientCoordinate(policy,c).key:JSON.stringify(c),first=new Map();
 coordinates.forEach((coordinate,member)=>{const key=keyOf(coordinate);if(!first.has(key))first.set(key,member);});
 return member=>first.get(keyOf(coordinates[member]));
}

// One entry: the voicing of inversion `inversion`, with its root (member 0) and bass located in it.
function entry(classes,occurrence,representative,degree,inversion,voicing){
 const degreeOf=new Map(occurrence.assignments.map((a,i)=>[representative(i),a.degree])),rootVoice=voicing.members.indexOf(0);
 return {member:voicing.members[0],inversion,rootPosition:inversion===0,classCount:classes.length,degree,
  bass:[...voicing.coords[0]],bassDegree:degreeOf.get(voicing.members[0])??null,
  root:[...voicing.coords[rootVoice]],rootDegree:degreeOf.get(0)??null,rootVoice,
  coords:voicing.coords,members:voicing.members,degrees:voicing.members.map(m=>degreeOf.get(m)??null),occurrenceId:occurrence.id};
}

/**
 * Every inversion of a chord that has its bass on `degree` of the scale, from a shape-occurrence
 * search (`searchShapeOccurrences`, whose occurrence members follow the shape's member order).
 * Returns [{member, inversion, rootPosition, classCount, degree, bass, bassDegree, root, rootDegree,
 * rootVoice, coords, members, degrees, occurrenceId}]; `member` is the bass member and `rootVoice` the
 * root's index in `coords`.
 */
export function bassInversions(s,coordinates,tones,occurrences,degree){
 const {octave,classes}=chordClasses(s,coordinates,tones),rank=new Map(classes.map((c,i)=>[c.member,i]));
 const representative=representatives(s,coordinates,octave),out=[],seen=new Set();
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
   out.push(entry(classes,occurrence,representative,degree,inversion,voicing));
  });
 }
 return out.sort((a,b)=>a.inversion-b.inversion);
}

/**
 * Every inversion of a chord that has its root on `degree` of the scale. Root position is voiced close
 * above the degree's own coordinate; inversion k raises the k lowest notes of that voicing by an octave,
 * so the root keeps its place and the k-th note of the close-position order is the bass. Exact chords
 * only have root position. Entries are shaped as `bassInversions` returns them.
 */
export function rootInversions(s,coordinates,tones,occurrences,degree){
 const {octave,classes}=chordClasses(s,coordinates,tones),representative=representatives(s,coordinates,octave);
 for(const occurrence of occurrences?.completeOccurrences??[]){
  const assignment=occurrence.assignments[0];
  if(assignment?.degree!==degree)continue;
  const rootPosition=bassVoicing(s,coordinates,tones,0,assignment.degreeCoordinate);
  if(!rootPosition)continue;
  return classes.slice(0,octave?classes.length:1).map(({member},inversion)=>{
   const voicing=inversion?bassVoicing(s,coordinates,tones,member,rootPosition.coords[rootPosition.members.indexOf(member)]):rootPosition;
   return voicing&&entry(classes,occurrence,representative,degree,inversion,voicing);
  }).filter(Boolean);
 }
 return [];
}
