import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {captureContext,validateContext,resolveTone,degreeOf,matchesApp,materialToChordEvent,tuningKey} from '../dist/composition-context.mjs';
import {tuningIdentity} from '../dist/material-ui.mjs';

const corpus=JSON.parse(await readFile(new URL('./fixtures/composition/phase0-corpus.json',import.meta.url),'utf8'));
const tol=corpus.tolerances.cents,relTol=corpus.tolerances.relativeHz;
const close=(a,b,t=tol)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b} (±${t})`);

// The context's tuning identity must be the same one the material collection uses.
for(const f of corpus.fixtures)assert.equal(tuningKey(f.state),tuningIdentity(f.state),'tuning identity shared with the material collection');

for(const f of corpus.fixtures){
  if(f.scale.collision){
    assert.throws(()=>captureContext(f.state,220),/collision/,`${f.id}: colliding scale refused`);
    continue;
  }
  const ctx=captureContext(f.state,corpus.tonicHz);
  validateContext(ctx);
  // Scale degree coordinates equal the independently captured literals.
  assert.deepEqual(ctx.scale.degrees.map(d=>d.coordinate),f.scale.coordinates.map(d=>d.coordinate.map(v=>v===0?0:v)),`${f.id}: degree coordinates`);
  assert.equal(ctx.scale.n,f.state.n);assert.equal(ctx.scale.mode,f.state.mode);
  // Pitch: cents = a*p + b*g, checked against captured cents and Hz = tonic * 2^(cents/1200).
  for(const d of f.scale.coordinates){
    const r=resolveTone(ctx,d.coordinate);
    close(r.cents,d.pitchCents);
    const hz=corpus.tonicHz*2**(d.pitchCents/1200);
    assert.ok(Math.abs(r.hz-hz)<=relTol*hz,`${f.id}: degree ${d.degree} Hz`);
    assert.deepEqual(degreeOf(ctx,d.coordinate),{degree:d.degree,register:0});
  }
  // A period displacement keeps the degree and reports the shift; the pitch moves by exactly p.
  const home=ctx.scale.degrees[1].coordinate,shifted=[home[0]+1,home[1]];
  assert.deepEqual(degreeOf(ctx,shifted),{degree:1,register:1});
  close(resolveTone(ctx,shifted).cents-resolveTone(ctx,home).cents,f.state.p,1e-9);
  // Outside the scale: a generator index not present is reported as null, not coerced.
  assert.equal(degreeOf(ctx,[0,Math.max(...ctx.scale.degrees.map(d=>d.coordinate[1]))+7]),null);
  assert.equal(matchesApp(ctx,f.state),true);
  assert.equal(matchesApp(ctx,{...f.state,n:f.state.n+1}),false);
  assert.equal(matchesApp(ctx,{...f.state,g:f.state.g+1}),false);
  // Snapshot is detached from its source.
  const before=JSON.stringify(ctx);f.state.rows[0][0]+=0;
  const mutated=structuredClone(f.state);mutated.basis[0]=99;
  assert.equal(JSON.stringify(ctx),before);
}

const meantone=corpus.fixtures[0],other=corpus.fixtures[1];
const ctx=captureContext(meantone.state,220);

// tonic bounds
assert.throws(()=>captureContext(meantone.state,39),/tonicHz/);
assert.throws(()=>captureContext(meantone.state,1001),/tonicHz/);
assert.doesNotThrow(()=>captureContext(meantone.state,40));

// validateContext rejects structural damage
for(const [label,patch] of [
  ['version',c=>{c.version=2;}],['basis',c=>{c.basis=[2];}],['rows',c=>{c.rows=[[1,1,0]];}],
  ['p',c=>{c.p=-1;}],['tonic',c=>{c.tonicHz=5;}],['degree order',c=>{c.scale.degrees[0].degree=3;}],
  ['state mismatch',c=>{c.state.g+=1;}],['missing state',c=>{delete c.state;}],
]){
  const bad=structuredClone(ctx);patch(bad);
  assert.throws(()=>validateContext(bad),/Composition context/,label);
}

// Collected chord import: exact coordinates + provenance copied, never aliased.
const item={kind:'chord',state:structuredClone(meantone.state),coords:[[0,0],[-2,4],[0,1]],label:'major triad',exact:true,
  harmonicSelection:{sourceChord:'4:5:6',occurrenceId:'occ-1'}};
const event=materialToChordEvent(ctx,item,{startTick:0,durationTick:3840,velocity:92});
assert.deepEqual(event.tones.map(t=>t.coordinate),[[0,0],[-2,4],[0,1]]);
assert.equal(event.startTick,0);assert.equal(event.durationTick,3840);assert.equal(event.velocity,92);
assert.deepEqual(event.source,{kind:'collection',label:'major triad',rootTone:0,exact:true,harmonicSelection:{sourceChord:'4:5:6',occurrenceId:'occ-1'}});
// The root is the voice sounding the selection's first shape member, wherever it sits in the voicing.
{const rotated={kind:'chord',state:meantone.state,coords:[[0,1],[1,0],[0,4]],label:'4:5:6',harmonicSelection:{shape:{members:[{memberId:'input:0'},{memberId:'input:1'},{memberId:'input:2'}]},voicing:{voices:[{memberId:'input:2'},{memberId:'input:0'},{memberId:'input:1'}]}}};
 assert.equal(materialToChordEvent(ctx,rotated,{startTick:0,durationTick:960}).source.rootTone,1);}
item.coords[0][0]=99;item.harmonicSelection.sourceChord='changed';
assert.deepEqual(event.tones[0].coordinate,[0,0],'event is independent of the collection item');
assert.equal(event.source.harmonicSelection.sourceChord,'4:5:6');
// Missing provenance stays missing.
const bare=materialToChordEvent(ctx,{kind:'chord',state:meantone.state,coords:[[0,0],[0,1]],label:'fifth'},{startTick:0,durationTick:960});
assert.deepEqual(bare.source,{kind:'collection',label:'fifth'});
// Signed zero canonicalizes.
assert.ok(Object.is(materialToChordEvent(ctx,{kind:'chord',state:meantone.state,coords:[[-0,1],[0,-0]],label:'z'},{startTick:0,durationTick:960}).tones[0].coordinate[0],0));
// Another source tuning is refused with an explanation, and scales cannot be chords.
assert.throws(()=>materialToChordEvent(ctx,{kind:'chord',state:other.state,coords:[[0,0],[0,1]],label:'31-EDO fifth'},{startTick:0,durationTick:960}),/different tuning[^]*Load that tuning/);
assert.throws(()=>materialToChordEvent(ctx,{kind:'scale',state:meantone.state,coords:[[0,0],[0,1]],label:'scale'},{startTick:0,durationTick:960}),/only collected chords/);

console.log('composition-context: ok');
