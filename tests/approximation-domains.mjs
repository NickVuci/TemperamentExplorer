import assert from 'node:assert/strict';
import {makeState} from '../dist/engine.mjs';
import {matrixScale} from '../dist/matrix.mjs';
import {noteCoordinate,octavePeriods} from '../dist/pitch.mjs';
import {fromCommas} from '../dist/tuning.mjs';
import {approximationDomain,bestApproximations,bestModeApproximations} from '../dist/approximation-compat.mjs';
import {rankApproximationCoordinates} from '../dist/harmonic-approximations.mjs';

const meantone=makeState('meantone');
const finite=approximationDomain('scale-intervals',{...meantone,n:7,mode:2});
const tonic=approximationDomain('tonic-mode',{...meantone,n:7,mode:2});
assert.equal(finite.finite,true);
assert.equal(finite.sourceCount,finite.span.noteCount**2+1,'the finite interval domain includes every ordered matrix dyad plus its span period');
const scaleState={...meantone,n:7,mode:2},matrix=matrixScale(scaleState),dyadCoordinates=new Set();
for(const from of matrix.notes)for(const to of matrix.notes){
 const cents=((to.c-from.c)%matrix.p+matrix.p)%matrix.p,generators=to.k-from.k;
 dyadCoordinates.add(JSON.stringify([Math.round((cents-generators*scaleState.g)/scaleState.p),generators]));
}
dyadCoordinates.add(JSON.stringify([matrix.periods,0]));
assert.deepEqual(new Set(finite.coordinates.map(value=>JSON.stringify(value))),dyadCoordinates,'every ordered scale dyad contributes its exact temperament coordinate');
assert.ok(finite.coordinates.length>tonic.coordinates.length,'scale intervals and tonic-relative mode notes are distinct candidate domains');
assert.equal(tonic.coordinates.length,tonic.span.noteCount);
assert.deepEqual(tonic.observations.map(value=>value.coordinate),matrixScale({...meantone,n:7,mode:2}).notes.map(note=>noteCoordinate({...meantone,n:7,mode:2},note)));
assert.ok(tonic.observations.every(value=>Number.isFinite(value.actualCents)));
assert.notEqual(approximationDomain('tonic-mode',{...meantone,n:7,mode:0}).id,tonic.id,'mode rotation changes occurrence-domain identity');

const temperament=approximationDomain('temperament',meantone);
assert.equal(temperament.finite,false,'the whole temperament lattice is represented by a bounded search rule, not an exhaustive coordinate list');
assert.equal(temperament.coordinates,null);
assert.equal(temperament.search.defaultGeneratorBound,32);
assert.equal(temperament.search.maximumGeneratorBound,256);
assert.throws(()=>approximationDomain('unbounded',meantone),/Choose temperament/);

const divided={...fromCommas('128/125','2.3.5','Computed WE'),n:7,mode:0};
const onePeriod=approximationDomain('tonic-mode',divided);
assert.equal(onePeriod.span.periods,1);
divided.matrixOctave=true;
const wholeOctave=approximationDomain('tonic-mode',divided);
assert.equal(wholeOctave.span.periods,octavePeriods(divided));
assert.equal(wholeOctave.span.noteCount,divided.n*octavePeriods(divided));
assert.ok(wholeOctave.span.periodCents>divided.p);
assert.ok(wholeOctave.coordinates.length>onePeriod.coordinates.length,'mode candidate span follows the selected whole-octave matrix span');
assert.equal(approximationDomain('scale-intervals',divided).span.periodCents,wholeOctave.span.periodCents);

// A mapped interval absent from the current scale domain remains a separate
// canonical secondary result, rather than disappearing or becoming available.
const tiny={...meantone,n:2,mode:0},fifth={n:5,d:4,label:'5/4',c:1200*Math.log2(5/4)};
const result=bestApproximations(tiny,fifth);
assert.equal(result.secondary.mapped,true);
assert.equal(result.secondary.available,false);
assert.ok(result.best.every(value=>value.available));
assert.equal(bestModeApproximations(tiny,fifth).best.every(value=>value.available),true);

// Tuning ties retain both exact integer coordinates even when cents are equal.
const target={n:7,d:4,label:'7/4',c:1200*Math.log2(7/4)};
const p=target.c/2,state={...meantone,p,g:100};
const tied=rankApproximationCoordinates(state,state,target,[[1,0],[3,0]],{policy:'best-set'});
assert.deepEqual(tied.map(value=>value.coordinate),[[1,0],[3,0]]);
assert.ok(Math.abs(tied[0].absoluteErrorCents-tied[1].absoluteErrorCents)<1e-9);
assert.notEqual(tied[0].id,tied[1].id,'cents ties rank identities but do not merge them');

console.log('Temperament, scale-interval and tonic-mode approximation domains passed.');
