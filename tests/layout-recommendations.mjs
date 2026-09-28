import assert from 'node:assert/strict';
import {makeState} from '../dist/engine.mjs';
import {buildBoard} from '../dist/hexboard.mjs';
import {hexDistance} from '../dist/hexboard-chords.mjs';
import {generateLayoutCandidates} from '../dist/layout-candidates.mjs';
import {evaluateScale,evaluateChord,evaluateLayout} from '../dist/layout-evaluation.mjs';
import {layoutWeights} from '../dist/layout-profiles.mjs';
import {rankLayouts,recommendLayouts} from '../dist/layout-recommendations.mjs';
import {chromaticDirection,melodicBaseScore} from '../dist/layout-direction.mjs';
import {layoutTargets,catalogueLayoutTargets} from '../dist/layout-targets.mjs';
import {discoverChords} from '../dist/chord-discovery-v2.mjs';

const cfg={base:7,offset:0,style:'bosanquet',rotation:0,mirror:false,flipHorizontal:false,flipVertical:false,center:65,register:0,deviceRotation:0,outside:false,periodWrapping:false};
const close=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const s=makeState('meantone');

// Hex distance is an undirected physical property.
for(const a of [{x:2,y:4},{x:10,y:6},{x:7,y:9}])for(const b of [{x:8,y:2},{x:0,y:8},{x:13,y:5}])
 assert.equal(hexDistance(a,b),hexDistance(b,a));

for(const b of [{x:2,y:0},{x:1,y:1},{x:-1,y:1},{x:-2,y:0},{x:-1,y:-1},{x:1,y:-1}])assert.equal(hexDistance({x:0,y:0},b),1);

// Candidate generation is deterministic, deduplicated, and excludes invalid wrapped layouts.
const candidates=generateLayoutCandidates(s,cfg),again=generateLayoutCandidates(s,cfg);
assert.ok(candidates.length>1);
assert.deepEqual(candidates.map(c=>c.id),again.map(c=>c.id));
assert.equal(new Set(candidates.map(c=>c.id)).size,candidates.length);
for(const candidate of candidates){
 assert.equal(candidate.board.wrapping?.overlaps.length||0,0);
 assert.ok(candidate.board.keys.some(k=>k.enabled));
 assert.equal(Math.abs(candidate.board.a[0]*candidate.board.b[1]-candidate.board.a[1]*candidate.board.b[0]),1);
}

// A continuous scale whose neighboring degrees occupy adjacent keys scores over a scattered arrangement.
const baseBoard=buildBoard(s,cfg),notes=baseBoard.keys.filter(k=>k.enabled&&k.degree>=0);
const adjacent=notes.map((key,i)=>({...key,x:10+2*i,y:6}));
const scattered=notes.map((key,i)=>({...key,x:10+2*((i*7)%notes.length),y:6+(i%2?12:0)}));
const synthetic=keys=>({...baseBoard,keys:[...baseBoard.keys.filter(k=>!k.enabled||k.degree<0),...keys]});
const continuousMetrics=evaluateScale(s,synthetic(adjacent),cfg),scatteredMetrics=evaluateScale(s,synthetic(scattered),cfg);
assert.ok(continuousMetrics.melodic>scatteredMetrics.melodic,`${continuousMetrics.melodic} should beat ${scatteredMetrics.melodic}`);

// Exact chord evaluation finds the compact occurrence and scores an absent tone below full coverage.
const chordCoords=[[0,0],[1,0],[0,1]],compactXY=[[10,6],[12,6],[11,7]],wideXY=[[30,6],[42,6],[31,17]];
const chordKeys=[];
for(const [occurrence,points] of [compactXY,wideXY].entries())for(let i=0;i<chordCoords.length;i++){
 const index=65+occurrence*3+i,[x,y]=points[i],[m0,m1]=chordCoords[i];
 chordKeys[index]={...baseBoard.keys[index],index,x,y,m:[m0,m1],enabled:true,degree:i};
}
const chordBoard={...baseBoard,keys:Array.from({length:140},(_,i)=>chordKeys[i]||{...baseBoard.keys[i],enabled:false,degree:-1})};
const exactTarget={coords:chordCoords,exact:true,periodCopies:false};
const chordFit=evaluateChord(s,chordBoard,exactTarget,65);
assert.equal(chordFit.coverage,1);assert.equal(chordFit.complete,true);assert.ok(chordFit.occurrences>=2);
assert.deepEqual(chordFit.best.keys,[65,66,67]);assert.equal(chordFit.diameter,1);
assert.ok(hexDistance({x:30,y:6},{x:42,y:6})>chordFit.diameter,'The selected fingering is tighter than the wide occurrence.');
const wideOnly={...chordBoard,keys:chordBoard.keys.map((k,i)=>i>=65&&i<=67?{...k,enabled:false}:k)};assert.ok(chordFit.compactness>evaluateChord(s,wideOnly,exactTarget,65).compactness);
const missingBoard={...chordBoard,keys:chordBoard.keys.map((k,i)=>i===67||i===70?{...k,enabled:false}:k)};
const missingFit=evaluateChord(s,missingBoard,exactTarget,65);
assert.equal(missingFit.complete,false);assert.equal(missingFit.coverage,2/3);assert.equal(missingFit.harmony,.35*2/3);

// One ordered score with musical features independently inspectable.
assert.ok(Math.abs(Object.values(layoutWeights).reduce((a,b)=>a+b,0)-1)<1e-12);
const strengths=[{name:'strong',config:cfg,metrics:{direction:1,baseMos:1,melodic:1,harmony:1,compactness:1,pitch:1,reachability:1},scale:{scaleCoverage:1}},{name:'weak',config:cfg,metrics:{direction:0,baseMos:0,melodic:0,harmony:0,compactness:0,pitch:0,reachability:0},scale:{scaleCoverage:1}}];
assert.equal(rankLayouts(strengths)[0].name,'strong');
const chronological={target:{steps:[90,110,90,110,90,110]},keys:Array.from({length:13},(_,i)=>({index:i,enabled:true,degree:i%6,x:2*i,y:0,c:Math.floor(i/6)*600+[0,90,200,290,400,490][i%6]}))};
const chromatic=chromaticDirection({n:6},chronological,0);assert.equal(chromatic.complete,true);assert.equal(chromatic.run,13);assert.equal(chromatic.axis,'right');
const generatorOnly={...chronological,keys:chronological.keys.map((k,i)=>({...k,degree:(i*2)%6,c:i*200}))};assert.equal(chromaticDirection({n:6},generatorOnly).score,0,'Generator direction does not imply consecutive degree motion');
const reversedRegister={...chronological,keys:chronological.keys.map(k=>({...k,c:k.c%600}))};assert.equal(chromaticDirection({n:6},reversedRegister).complete,false,'Degree wrap must still sound an ascending step');
assert.equal(melodicBaseScore({n:7,large:200,small:100}).score,1);
assert.ok(melodicBaseScore({n:7,large:200,small:100}).score>melodicBaseScore({n:7,large:600,small:100}).score);
assert.ok(melodicBaseScore({n:7,large:200,small:100}).score>melodicBaseScore({n:12,large:200,small:100}).score);

// Wrapped copies preserve the period/generator pitch equation for a generic non-octave period.
const nonOctave={...makeState('dreamtone'),p:1901.2345};
const wrapped=buildBoard(nonOctave,{...cfg,base:3,periodWrapping:true});
assert.ok(wrapped.wrapping&&!wrapped.wrapping.overlaps.length);
for(const key of wrapped.keys.filter(k=>k.enabled))close(key.c,key.m[0]*nonOctave.p+key.m[1]*nonOctave.g,1e-6);

// Recommendation evaluation is target-sensitive even when the bounded candidate cache is warm.
const sourceCandidate=candidates[0],enabled=sourceCandidate.board.keys.filter(k=>k.enabled&&k.m);
const selected=enabled.slice(0,3).map(k=>k.m);
const targetsA=layoutTargets({selectedCoordinates:selected}),targetsB=layoutTargets({selectedCoordinates:[enabled[0].m,[enabled[0].m[0]+100,enabled[0].m[1]+100],[enabled[0].m[0]-100,enabled[0].m[1]-100]]});
assert.equal(targetsA.length,1);assert.equal(targetsB.length,1);
const withTarget=recommendLayouts(s,cfg,targetsA),withChangedTarget=recommendLayouts(s,cfg,targetsB);
assert.ok(withTarget.length>20);assert.deepEqual(new Set(withTarget.map(x=>x.id)),new Set(withChangedTarget.map(x=>x.id)));assert.ok(withTarget.every((r,i)=>!i||r.score<=withTarget[i-1].score));
assert.ok(withTarget.some(x=>x.chords[0].complete));
assert.ok(withChangedTarget.every(x=>!x.chords[0].complete));
assert.ok(withTarget.every(x=>Number.isFinite(x.score)&&x.metrics));

// Multiple desired types come from the same filtered catalogue; inversions keep
// canonical musical coordinates, and selecting a chord retains a distinct vote.
let discovery;
await discoverChords(s,{oddLimit:5,primeLimit:5,maxError:30},r=>discovery=r);
const desired=catalogueLayoutTargets(s,discovery.rows);
assert.ok(desired.length>1);
assert.equal(desired.length,discovery.rows.length);
assert.ok(desired.every(t=>t.kind==='catalogue'&&!t.exact&&t.variants.length>=2));
const withDesired=recommendLayouts(s,cfg,desired);
assert.ok(withDesired.every(r=>r.chords.length===desired.length));
assert.ok(withDesired.some(r=>r.chords.filter(c=>c.easyOccurrences>0).length>1));
const mixture=evaluateLayout(s,sourceCandidate,[...targetsB,...desired]);
const catalogFits=mixture.chords.filter(c=>c.kind==='catalogue');
close(mixture.metrics.harmony,(mixture.chords[0].harmony+catalogFits.reduce((n,c)=>n+c.harmony,0)/catalogFits.length)/2);
let otonal;
await discoverChords(s,{oddLimit:5,primeLimit:5,maxError:30,form:'otonal'},r=>otonal=r);
assert.ok(catalogueLayoutTargets(s,otonal.rows).length<desired.length,'Chord filters change the desired set');

console.log('Layout recommendations: deterministic candidates, scale/chord geometry, chromatic runs, base hardness, ranked scores, wrapped non-octave pitch, and target-sensitive reevaluation passed.');
