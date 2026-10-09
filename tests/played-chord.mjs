import assert from 'node:assert/strict';
import {makeState,mapRatio} from '../dist/engine.mjs';
import {queryCatalogue} from '../dist/harmonic-catalogue.mjs';
import {buildDyadIndex} from '../dist/harmonic-dyad-graph.mjs';
import {targetSet} from '../dist/ji-limit-engine.mjs';
import {mappingContext} from '../dist/harmonic-context.mjs';
import {harmonicEntryGeometry} from '../dist/harmonic-selection.mjs';
import {matchPlayedChord,rowsByShape} from '../dist/played-chord.mjs';
import {createHexboardWorkspace} from '../dist/hexboard-ui.mjs';
import {buildBoard} from '../dist/hexboard.mjs';

const state={...makeState('septimal'),n:12,mode:0},spec={oddLimit:15,primeFilter:null,mappingSubgroup:state.basis,representationPolicy:'octave'};
const result=await queryCatalogue({state,categories:['ji','chords'],targetSpec:spec,maxRecords:20000,chordSizes:[3,4,5,6]});
const index=buildDyadIndex(targetSet(spec),mappingContext(state)),byShape=rowsByShape(result.items);
const geometry=row=>{const g=harmonicEntryGeometry(state,row);return g&&{coordinates:g.shape.coordinates,tones:g.tones};};
const match=coordinates=>matchPlayedChord({state,coordinates,index,byShape,geometry});
const at=(n,d,octaves=0)=>{const m=mapRatio(n,d,state);return [m[0]+octaves,m[1]];},C=at(1,1),E=at(5,4),G=at(3,2);

// Listed chords: the directory's name and form, the rotation the bass gives, each note's ratio from the bass.
let played=match([C,E,G]);
assert.equal(played.status,'chord');assert.equal(played.source,'directory');assert.equal(played.label,'4:5:6');assert.equal(played.form,'otonal');assert.equal(played.rotation,'4:5:6');
assert.deepEqual(Object.values(played.noteLabels),['1/1','5/4','3/2']);
played=match([E,G,at(1,1,1)]);
assert.equal(played.label,'4:5:6','an inversion is the same chord');assert.equal(played.rotation,'5:6:8');assert.equal(played.bassRatio,'5/4');
assert.deepEqual(Object.values(played.noteLabels),['1/1','6/5','8/5']);
played=match([C,E,G,at(5,4,1),at(1,1,-1)]);assert.equal(played.label,'4:5:6');assert.equal(played.doubled,true,'register and doublings do not change the match');
assert.equal(match([C,E,G,at(7,4)]).label,'4:5:6:7');

// Two notes are an interval; one note is just a note.
played=match([C,G]);assert.equal(played.status,'interval');assert.equal(played.label,'3/2');
assert.equal(match([C]).status,'note');assert.equal(match([]).status,'empty');

// Essentially tempered chords from the directory, and shapes proved on the spot.
const et=result.items.find(row=>row.kind==='tempered'&&row.status==='essentially-tempered'&&row.shape.coordinates.length===4);
played=match(et.shape.coordinates);assert.equal(played.status,'chord');assert.equal(played.kind,'tempered');assert.equal(played.form,'et');assert.equal(played.label,et.preferredLabel);
const heptad=[C,at(9,8),E,at(4,3),G,at(5,3),at(15,8)];played=match(heptad);
assert.equal(played.status,'chord');assert.equal(played.source,'proof','a chord outside the directory list is classified here');assert.ok(['ji','tempered'].includes(played.kind));

// Not a chord of the limit: say so, and name the directory chords inside it.
const outside=Array.from({length:25},(_,i)=>[0,i-12]).find(point=>match([C,point]).status==='none');assert.ok(outside,'some generator step lies outside the limit');
played=match([C,E,G,outside]);assert.equal(played.status,'none');assert.ok(played.outsidePairs.length);assert.ok(played.contains.some(item=>item.label==='4:5:6'),'the triad inside is named');

// Several JI chords on one tempered shape: the simplest is named, the others listed.
const meantone={...makeState('meantone'),n:7,mode:0},mspec={...spec,mappingSubgroup:meantone.basis};
const mresult=await queryCatalogue({state:meantone,categories:['ji','chords'],targetSpec:mspec,maxRecords:20000,chordSizes:[3,4]});
const mplayed=matchPlayedChord({state:meantone,coordinates:[mapRatio(1,1,meantone),mapRatio(9,8,meantone),mapRatio(5,4,meantone)],index:buildDyadIndex(targetSet(mspec),mappingContext(meantone)),byShape:rowsByShape(mresult.items),geometry:row=>{const g=harmonicEntryGeometry(meantone,row);return g&&{coordinates:g.shape.coordinates,tones:g.tones};}});
assert.equal(mplayed.label,'8:9:10');assert.ok(mplayed.alternatives?.length,'other JI readings of the shape are listed');

// The Play readout shows the directory reading for held keys.
const host={innerHTML:''},original=globalThis.document;
try{
 globalThis.document={querySelector:selector=>selector==='[data-live-chord-readout]'?host:null};
 const hex=createHexboardWorkspace({getStates:()=>[state],getHarmonicMode:()=>true,getHz:()=>330,play:()=>{},refresh:()=>{},notify:()=>{},matchPlayed:coordinates=>match(coordinates)});
 hex.render();
 const keys=buildBoard(state,hex.serialize().configs[0]).keys.filter(k=>k.enabled),find=point=>keys.find(key=>key.m[0]===point[0]&&key.m[1]===point[1])??keys.find(key=>key.m[1]===point[1]);
 const triad=[E,G,at(1,1,1)].map(find);assert.ok(triad.every(Boolean));
 hex.updateLiveChord({status:'no-match',matches:[]},triad.map(key=>({id:String(key.index),coordinate:key.m,cents:key.c})));
 assert.match(host.innerHTML,/<strong>4:5:6<\/strong> <span class="form-badge otonal">Otonal<\/span>/);
 assert.equal((host.innerHTML.match(/class="live-note-column"/g)||[]).length,3);assert.equal((host.innerHTML.match(/class="live-ratio-member"/g)||[]).length,3);
 const pair=[C,G].map(find);hex.updateLiveChord({status:'no-match',matches:[]},pair.map(key=>({id:String(key.index),coordinate:key.m,cents:key.c})));
 assert.match(host.innerHTML,/<strong>3\/2<\/strong><small>interval<\/small>/);
 const legacy=createHexboardWorkspace({getStates:()=>[state],getHarmonicMode:()=>false,getHz:()=>330,play:()=>{},refresh:()=>{},notify:()=>{}});legacy.render();
 legacy.updateLiveChord({status:'no-match',matches:[]},triad.map(key=>({id:String(key.index),coordinate:key.m,cents:key.c})));assert.match(host.innerHTML,/No catalogue match/,'without a directory the curated reading is kept');
}finally{globalThis.document=original;}
console.log('Played chords: directory names, forms and rotations, doublings, intervals, ET and proved shapes, non-chords with contained chords, and the Play readout passed.');
