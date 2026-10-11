import assert from 'node:assert/strict';
import {makeState,mapRatio,scale,targets,classifyTargets,mod} from '../dist/engine.mjs';
import {fromCommas} from '../dist/tuning.mjs';
import {noteCoordinate,approximationSpan} from '../dist/pitch.mjs';
import {inspectCoordinateChord,enumerateCoordinateChords,discoverScaleChords} from '../dist/harmonic-inspection.mjs';
import {searchShapeOccurrences} from '../dist/chord-occurrence-v2.mjs';
import {renderCoordinateAssessment} from '../dist/harmonic-inspection-ui.mjs';
import {createChordWorkspace} from '../dist/chord-ui.mjs';
import {buildBoard} from '../dist/hexboard.mjs';
import {discoverBoardChords,hexDistance} from '../dist/hexboard-chords.mjs';
const s=makeState('meantone'),coords=rs=>rs.map(([n,d])=>mapRatio(n,d,s));
const major=coords([[1,1],[5,4],[3,2]]),didymic=coords([[1,1],[9,8],[3,2],[5,3]]);
assert.equal(inspectCoordinateChord(s,major,{limit:5}).assessment.status,'ji-liftable');
const et=inspectCoordinateChord(s,didymic,{limit:9,primeLimit:5});
assert.equal(et.assessment.status,'essentially-tempered');assert.equal(et.assessment.complete,true);
assert.ok(et.assessment.obstruction.representativeCycles.length);assert.match(renderCoordinateAssessment(et),/complete proof/);
const wide=inspectCoordinateChord(s,didymic,{limit:27,primeLimit:5});
assert.equal(wide.assessment.status,'ji-liftable');assert.equal(et.shape.id,wide.shape.id);
const unknown=inspectCoordinateChord(s,didymic,{limit:9,primeLimit:5},{budget:{maxStates:1,maxCompatibilityChecks:1}});
assert.equal(unknown.assessment.status,'unknown');assert.equal(unknown.assessment.complete,false);assert.match(renderCoordinateAssessment(unknown),/not an ET proof/);
const badTuning=inspectCoordinateChord({...s,g:s.g+40},major,{limit:5,tolerance:0,other:false});
assert.equal(badTuning.assessment.status,'ji-liftable');assert.equal(badTuning.qualified,false,'Mapping truth survives poor tuning quality.');
const inversion=major.map((m,i)=>[m[0]+(i===0?1:0),m[1]]);
assert.equal(inspectCoordinateChord(s,inversion,{limit:5}).shape.id,inspectCoordinateChord(s,major,{limit:5}).shape.id);
assert.equal(inspectCoordinateChord(s,[[0,0],[1,0]]).assessment.status,'degenerate','Octave voices retain full coordinates without a false ET claim.');
const augmented=fromCommas('128/125','2.3.5');
const triad=[[0,0],[1,0],[2,0]];
assert.equal(inspectCoordinateChord(augmented,triad,{limit:5,primeLimit:5}).domains.distinctVertexCount,3);
assert.equal(inspectCoordinateChord(augmented,triad,{limit:5,primeLimit:5}).assessment.status,'essentially-tempered');
const native=fromCommas('245/243','3.5.7');
assert.equal(inspectCoordinateChord(native,[[0,0],mapRatio(3,1,native)],{limit:7,primeLimit:[3,5,7]}).assessment.status,'ji-liftable');
assert.equal(inspectCoordinateChord(native,[[0,0],mapRatio(3,1,native)],{limit:7}).domains.equivalence,'exact');
assert.throws(()=>inspectCoordinateChord(s,[[0,NaN]]));

// Independent finite-board oracle: directly classify every pair, enumerate all
// triples and check physical reach, without using the shared candidate search.
const full=buildBoard(s,{base:2,style:'period',center:65,rotation:0,offset:0,register:0,outside:false});
const selected=full.keys.filter(k=>k.enabled).slice(50,58),ids=new Set(selected.map(k=>k.index));
const board={...full,keys:full.keys.map(k=>({...k,enabled:ids.has(k.index)}))};
for(const other of [false,true]){
 let count=0;const ts=targets(15),span=board.wrapping?s.p:approximationSpan(s);
 for(let i=0;i<selected.length;i++)for(let j=i+1;j<selected.length;j++)for(let k=j+1;k<selected.length;k++){
  const ns=[selected[i],selected[j],selected[k]].sort((a,b)=>a.c-b.c||a.index-b.index);
  const good=ns.every((a,x)=>ns.slice(x+1).every(b=>{
   if(hexDistance(a,b)>4)return false;
   const match=classifyTargets(s,{c:mod(b.c-a.c,span),k:b.m[1]-a.m[1]},ts,10);
   return (other?[...match.mapped,...match.hits]:match.mapped).some(t=>t.within);
  }));if(good)count++;
 }
 const result=discoverBoardChords(s,board,{other});assert.equal(result.count,count);assert.equal(result.complete,true);
}
const notes=scale(s).notes.map((n,i)=>({degree:i,c:n.c,coordinate:noteCoordinate(s,n)}));
const tiny=enumerateCoordinateChords(s,notes,{maxNodes:1});assert.equal(tiny.limited,true);assert.equal(tiny.complete,false);
assert.ok(discoverScaleChords(s).complete);
const degrees=major.map(m=>scale(s).notes.findIndex(n=>n.k===m[1]));assert.ok(degrees.every(i=>i>=0));
const occurrences=searchShapeOccurrences(s,{coordinates:degrees.map(i=>noteCoordinate(s,scale(s).notes[i]))}).completeOccurrences.map(o=>o.degrees.toSorted((a,b)=>a-b));assert.ok(occurrences.length);assert.ok(occurrences.some(d=>d.join()===degrees.toSorted((a,b)=>a-b).join()));
const manual=inspectCoordinateChord(s,major.map((m,i)=>[m[0]+(i===0?1:0),m[1]]),{limit:5,tolerance:10,other:true,primeLimit:5});assert.equal(manual.assessment.status,'ji-liftable');
let played=[];const states=[s],ui=createChordWorkspace({getStates:()=>states,play:p=>played=p,refresh(){},notify:m=>assert.match(m,/Chord pinned/)});
ui.fromCoordinates(major,'4:5:6');assert.match(ui.render(),/Coherent JI harmony/);
ui.click({dataset:{chord:'invert'}});ui.click({dataset:{chord:'pin'}});const saved=JSON.parse(JSON.stringify(ui.serialize()));
assert.equal(saved.pins.length,1);const restored=createChordWorkspace({getStates:()=>states,play:p=>played=p,refresh(){},notify:m=>assert.match(m,/Chord pinned/)});
restored.restore(saved,()=>{});restored.click({dataset:{chord:'load-pin',i:'0'}});restored.click({dataset:{chord:'play'}});
assert.equal(played.length,3);assert.match(restored.render(),/Coherent JI harmony/);
restored.click({dataset:{chord:'clear'}});assert.match(restored.render(),/Select at least two notes/);
restored.click({dataset:{chord:'note',i:String(degrees[0])}});assert.match(restored.render(),/Select at least two notes/);
console.log('Shared manual/board inspection: ET proof, unknown, tuning independence, registers, divided/native periods, exhaustive-board oracle, bounds and pin/inversion round-trip passed.');
