import {coordinateCents} from './pitch.mjs';
import {equivalencePolicy,quotientCoordinate,shapeKey} from './harmonic-equivalence.mjs';
import {domainsForShape} from './harmonic-dyad-graph.mjs';
import {assessET} from './harmonic-et.mjs';
import {orientedJIInterpretation,simplestRotation} from './harmonic-ji-chords.mjs';
import {chordIdentity} from './chord-identity-v2.mjs';

// What is being played, read against the harmony directory. Notes are reduced to pitch classes
// through the temperament mapping, so register, doublings and spacing never change the match; the
// lowest note decides the bass and so the rotation. A chord the directory lists is named as the
// directory names it; any other dyadic shape is proved JI or ET on the spot; anything else reports
// the pair outside the limit and the largest directory chords it contains.

const MAX_PLAYED_CLASSES=8;
const gcd=(a,b)=>{while(b){[a,b]=[b,a%b];}return a<0n?-a:a;};
function relative(a,b,octave){
 // a/b for "n/d" ratio labels, octave-folded when the policy is octave equivalence.
 const [an,ad]=a.split('/').map(BigInt),[bn,bd]=b.split('/').map(BigInt);let n=an*bd,d=ad*bn;
 if(octave){while(n>=2n*d)d*=2n;while(n<d)n*=2n;}
 const g=gcd(n,d);return `${n/g}/${d/g}`;
}
const height=ratio=>ratio.split('/').reduce((product,value)=>product*Number(value),1);
const simplest=items=>[...(items??[])].sort((a,b)=>height(a.ratio)-height(b.ratio)||(a.ratio<b.ratio?-1:1))[0]??null;
const formOfRow=row=>row.kind==='tempered'?(row.status==='essentially-tempered'?'et':'unknown'):row.interpretation?.presentationForm==='self'?'ambitonal':['otonal','utonal'].includes(row.interpretation?.presentationForm)?row.interpretation.presentationForm:'other';
export const PLAYED_FORM_LABELS={otonal:'Otonal',utonal:'Utonal',ambitonal:'Ambitonal',other:'Other JI',et:'Essentially tempered',unknown:'Unresolved'};

/** Directory rows by shape, built once per directory result: JI rows first, simplest integer form
 * first (several JI chords can share a tempered shape), then tempered rows. */
export function rowsByShape(rows){
 const map=new Map();
 for(const row of rows??[]){
  if(!row?.shapeId||!(row.kind==='tempered'||row.kind==='ji'&&row.mappingStatus==='mapped'&&row.dyads?.dyadic))continue;
  if(!map.has(row.shapeId))map.set(row.shapeId,[]);
  map.get(row.shapeId).push(row);
 }
 const weight=row=>row.kind!=='ji'?Infinity:String(row.interpretation?.identity?.aliases?.otonal??'').split(':').reduce((sum,value)=>sum+(Number(value)||0),0);
 for(const list of map.values())list.sort((a,b)=>(a.kind==='ji'?0:1)-(b.kind==='ji'?0:1)||weight(a)-weight(b));
 return map;
}

/**
 * Match played coordinates. `index` is the shared dyad index for the active mapping and limits,
 * `byShape` the directory rows (rowsByShape), `geometry(row)` the row's member coordinates and
 * JI tones (harmonicEntryGeometry). Returns a plain description for the Play readout.
 */
export function matchPlayedChord({state,coordinates,index,byShape,geometry}){
 const notes=(coordinates??[]).filter(point=>Array.isArray(point)&&point.length===2);
 if(!notes.length)return {status:'empty'};
 const octave=state.basis.includes(2),policy=equivalencePolicy(state,octave?'octave':'exact');
 const ordered=[...notes].sort((a,b)=>coordinateCents(state,a)-coordinateCents(state,b));
 const classes=new Map();for(const point of ordered){const key=quotientCoordinate(policy,point).key;if(!classes.has(key))classes.set(key,point);}
 const members=[...classes.values()],bass=members[0],doubled=notes.length>members.length;
 const classOf=point=>quotientCoordinate(policy,[point[0]-bass[0],point[1]-bass[1]]).key;
 if(members.length===1)return {status:'note',doubled};
 if(members.length>MAX_PLAYED_CLASSES)return {status:'none',reason:`More than ${MAX_PLAYED_CLASSES} pitch classes`,doubled};
 if(members.length===2){
  const readings=[...(index.byClassKey[classOf(members[1])]??[])].sort((a,b)=>height(a.ratio)-height(b.ratio));
  return readings.length?{status:'interval',label:readings[0].ratio,readings:readings.map(item=>item.ratio),doubled,noteLabels:labelsFrom(notes,classOf,{[classOf(bass)]:'1/1',[classOf(members[1])]:readings[0].ratio})}
   :{status:'none',reason:'This interval is not in the selected JI limit',doubled};
 }
 const shape={id:shapeKey(policy,members),coordinates:members,mappingId:index.mappingId,equivalence:index.equivalence};
 const listed=byShape?.get(shape.id)??[],row=listed[0];
 if(row){const match=describeRow(row,{state,members,bass,notes,classOf,index,geometry,octave,doubled}),others=listed.slice(1).filter(item=>item.kind==='ji').map(item=>item.preferredLabel);return others.length?{...match,alternatives:others}:match;}
 const domains=domainsForShape(shape,index);
 if(!domains.dyadic){
  const pairs=domains.emptyEdges.filter(edge=>edge.fromMember<edge.toMember).map(edge=>[edge.fromMember,edge.toMember]);
  return {status:'none',reason:'Not every pair is an interval of the selected JI limit',outsidePairs:pairs,contains:containedChords(members,{policy,byShape}),doubled};
 }
 // A dyadic shape the directory does not list (for example outside its size range): prove it here.
 const assessment=assessET(shape,index);
 if(assessment.status==='ji-liftable'){
  const ratios=assessment.liftWitness.vertices.sort((a,b)=>a.memberIndex-b.memberIndex).map(vertex=>vertex.ratio);
  let label=ratios.join(':'),form='other';
  try{const best=simplestRotation(chordIdentity(ratios.join(':')),octave);if(best){const oriented=orientedJIInterpretation(best.spelling,{kind:'played'});label=oriented.preferredLabel;form=oriented.presentationForm==='self'?'ambitonal':oriented.presentationForm;}}catch{}
  const labels={};members.forEach((point,i)=>{labels[classOf(point)]=relative(ratios[i],ratios[0],octave);});
  return {status:'chord',source:'proof',kind:'ji',label,form,formLabel:PLAYED_FORM_LABELS[form]??'JI',bassRatio:'1/1',noteLabels:labelsFrom(notes,classOf,labels),doubled};
 }
 const labels={};members.forEach(point=>{labels[classOf(point)]=classOf(point)===classOf(bass)?'1/1':simplest(index.byClassKey[classOf(point)])?.ratio??'?';});
 const form=assessment.status==='essentially-tempered'?'et':'unknown';
 return {status:'chord',source:'proof',kind:'tempered',label:members.map(point=>labels[classOf(point)]).join(' · '),form,formLabel:PLAYED_FORM_LABELS[form],noteLabels:labelsFrom(notes,classOf,labels),doubled};
}

function labelsFrom(notes,classOf,byClass){const labels={};for(const point of notes)labels[point.join(',')]=byClass[classOf(point)]??null;return labels;}

// A listed chord: its directory name and form, which rotation the bass gives, and each note's ratio.
function describeRow(row,{state,members,bass,notes,classOf,index,geometry,octave,doubled}){
 const form=formOfRow(row),base={status:'chord',source:'directory',rowId:row.id,kind:row.kind,label:row.preferredLabel,form,formLabel:PLAYED_FORM_LABELS[form],doubled};
 const shape=geometry?.(row);
 if(row.kind==='ji'&&shape?.tones){
  // Find which member of the listed chord the bass is, then read every note from that root.
  const policy=equivalencePolicy(state,octave?'octave':'exact'),key=point=>quotientCoordinate(policy,point).key,played=new Set(members.map(point=>classOf(point)));
  for(let root=0;root<shape.coordinates.length;root++){
   const anchor=shape.coordinates[root],relativeKey=point=>key([point[0]-anchor[0],point[1]-anchor[1]]);
   if(!shape.coordinates.every(point=>played.has(relativeKey(point))))continue;
   const labels={};shape.coordinates.forEach((point,i)=>{labels[relativeKey(point)]=relative(shape.tones[i].label,shape.tones[root].label,octave);});
   const rotation=shape.coordinates.map((point,i)=>labels[relativeKey(point)]).sort((a,b)=>height(a)-height(b));
   return {...base,bassRatio:shape.tones[root].label,rotation:rotationLabel(labels,octave),root,noteLabels:labelsFrom(notes,classOf,labels)};
  }
  return base;
 }
 const labels={};members.forEach(point=>{labels[classOf(point)]=classOf(point)===classOf(bass)?'1/1':simplest(index.byClassKey[classOf(point)])?.ratio??'?';});
 return {...base,noteLabels:labelsFrom(notes,classOf,labels)};
}
// The rotation as integer terms (e.g. 5:6:8), read from the bass.
function rotationLabel(labels,octave){
 const ratios=[...new Set(Object.values(labels))].map(text=>text.split('/').map(BigInt)).sort((a,b)=>a[0]*b[1]<b[0]*a[1]?-1:1);
 let lcm=1n;for(const [,d] of ratios)lcm=lcm/gcd(lcm,d)*d;
 const terms=ratios.map(([n,d])=>n*(lcm/d)),g=terms.reduce(gcd,0n);return terms.map(t=>t/g).join(':');
}

// The largest directory chords among the played pitch classes, for a chord the directory lacks.
function containedChords(members,{policy,byShape}){
 const found=[];
 for(let size=members.length-1;size>=3&&!found.length;size--){
  const pick=(start,chosen)=>{
   if(found.length>=3)return;
   if(chosen.length===size){const row=byShape?.get(shapeKey(policy,chosen.map(i=>members[i])))?.[0];if(row&&!found.some(item=>item.rowId===row.id))found.push({rowId:row.id,label:row.preferredLabel,form:formOfRow(row),extra:members.length-size});return;}
   for(let i=start;i<members.length;i++)pick(i+1,[...chosen,i]);
  };
  pick(0,[]);
 }
 return found;
}
