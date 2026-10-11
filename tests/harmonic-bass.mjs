import assert from 'node:assert/strict';
import {makeState,mapRatio} from '../dist/engine.mjs';
import {fromCommas} from '../dist/tuning.mjs';
import {coordinateCents} from '../dist/pitch.mjs';
import {orientedJIInterpretation,chordRotations,rotationRootKey} from '../dist/harmonic-ji-chords.mjs';
import {harmonicEntryGeometry} from '../dist/harmonic-selection.mjs';
import {searchShapeOccurrences} from '../dist/chord-occurrence-v2.mjs';
import {bassInversions,bassVoicing,chordClasses,inversionName,rootInversions,rootedChordName} from '../dist/harmonic-bass.mjs';

const row=input=>{const interpretation=orientedJIInterpretation(input,{kind:'test'});return {kind:'ji',interpretation,familyId:interpretation.familyId};};
const onRoot=(s,input,degree)=>{const r=row(input),g=harmonicEntryGeometry(s,r);if(!g)return null;return {g,r,entries:rootInversions(s,g.shape.coordinates,g.tones,searchShapeOccurrences(s,g.shape),degree)};};
const onBass=(s,input,degree)=>{const r=row(input),g=harmonicEntryGeometry(s,r);if(!g)return null;return {g,r,entries:bassInversions(s,g.shape.coordinates,g.tones,searchShapeOccurrences(s,g.shape),degree)};};

assert.deepEqual([0,1,2,3,4,11,12,13,21,22].map(inversionName),['root position','1st inversion','2nd inversion','3rd inversion','4th inversion','11th inversion','12th inversion','13th inversion','21st inversion','22nd inversion']);

// Meantone, 7-note scale on mode 0 (degrees 0 2 4 form 4:5:6).
const meantone={...makeState('meantone'),n:7,mode:0};
{
  const at=d=>onBass(meantone,'4:5:6',d).entries.map(e=>[e.inversion,e.degrees]);
  assert.deepEqual(at(0),[[0,[0,2,4]]],'major in root position on degree 0');
  assert.deepEqual(at(2),[[1,[2,4,0]]],'its 1st inversion has degree 2 in the bass');
  assert.deepEqual(at(5),[[2,[5,1,3]]],'its 2nd inversion has degree 5 in the bass');
  assert.deepEqual(at(4),[[0,[4,6,1]],[2,[4,0,2]]],'one bass can carry several inversions of a chord');
  const minor=d=>onBass(meantone,'10:12:15',d).entries.map(e=>[e.inversion,e.degrees]);
  assert.deepEqual(minor(2),[[0,[2,4,6]],[2,[2,5,0]]],'the directory spelling 1/6:5:4 is root position with its lowest note, 10, in the bass');
  // The root is the lowest note of the directory spelling, wherever the bass is.
  const roots=(input,d)=>onBass(meantone,input,d).entries.map(e=>[e.inversion,e.bassDegree,e.rootDegree]);
  assert.deepEqual(roots('4:5:6',2),[[1,2,0]],'the 1st inversion on degree 2 is still rooted on degree 0');
  assert.deepEqual(roots('4:5:6',5),[[2,5,1]],'the 2nd inversion on degree 5 is rooted on degree 1');
  assert.deepEqual(roots('10:12:15',2),[[0,2,2],[2,2,5]]);
  for(const e of onBass(meantone,'4:5:6',4).entries)assert.deepEqual(e.coords[e.rootVoice],e.root,'rootVoice locates the root in the voicing');
  // Chords on a root: every inversion keeps the root on the degree, the bass moves.
  const onR=(input,d)=>onRoot(meantone,input,d).entries.map(e=>[e.inversion,e.rootDegree,e.bassDegree,e.degrees]);
  assert.deepEqual(onR('4:5:6',0),[[0,0,0,[0,2,4]],[1,0,2,[2,4,0]],[2,0,4,[4,0,2]]]);
  assert.deepEqual(onR('10:12:15',5),[[0,5,5,[5,0,2]],[1,5,0,[0,2,5]],[2,5,2,[2,5,0]]]);
  const home=onRoot(meantone,'4:5:6',0).entries,octave=mapRatio(2,1,meantone);
  assert.deepEqual(home[0].root,home[0].bass,'root position puts the root in the bass');
  for(const e of home.slice(1))assert.deepEqual(e.root,[home[0].root[0]+octave[0],home[0].root[1]+octave[1]],'an inversion raises the notes below its bass, the root among them, by an octave');
  assert.equal(rootedChordName(0,'4:5:6'),'0 - 4:5:6');assert.equal(rootedChordName(null,'4:5:6'),'4:5:6');
}

// Every entry is the exact close-position rotation of the chord on its bass: voicing intervals are the
// mapped JI intervals of the rotation rooted on that note, the bass is lowest, and all notes lie within
// one octave of it.
for(const [s,octave] of [[meantone,true],[{...makeState('meantone'),n:12,mode:3},true],[{...makeState('pajara7'),n:10,mode:2},true]])
  for(const input of ['4:5:6','10:12:15','4:5:6:7','8:10:12:15','5:6:7'])
    for(let degree=0;degree<s.n;degree++){
      const found=onBass(s,input,degree);if(!found)continue;
      const {g,r,entries}=found,classes=chordClasses(s,g.shape.coordinates,g.tones).classes;
      for(const e of entries){
        assert.equal(classes[e.inversion].member,e.member,'the inversion number is the bass note’s place in the chord’s close-position order');
        const tone=g.tones[e.member],rot=chordRotations(r.interpretation.identity,octave).find(x=>x.root===rotationRootKey(tone.n,tone.d,octave));
        const expected=rot.ratios.map(text=>{const [n,d]=text.split('/').map(Number),m=mapRatio(n,d,s);return [e.bass[0]+m[0],e.bass[1]+m[1]];});
        assert.deepEqual(e.coords,expected,`${input} on degree ${degree} (${s.name}, ${s.n} notes) voices the rotation ${rot.label} exactly`);
        const cents=e.coords.map(c=>coordinateCents(s,c)),span=coordinateCents(s,mapRatio(2,1,s));
        assert.ok(cents.every((c,i)=>i===0||c>cents[0]),'the bass is the lowest note');
        assert.ok(cents.at(-1)-cents[0]<span,'close position stays within the octave above the bass, even when the period divides the octave');
        assert.equal(e.degrees[0],degree);assert.deepEqual(e.coords[0],e.bass,"the bass sits on the degree’s own coordinate");
        assert.ok(e.degrees.every(d=>Number.isInteger(d)),'every voiced note is in the scale');
      }
    }

// A JI chord is ordered by its JI pitches, so tempering cannot renumber its inversions.
{
  const g=harmonicEntryGeometry(meantone,row('4:5:6'));
  assert.deepEqual(chordClasses(meantone,g.shape.coordinates,g.tones).classes.map(c=>c.member),[0,1,2]);
  assert.throws(()=>bassVoicing(meantone,g.shape.coordinates,g.tones,7,[0,0]),/bass must be a note/);
}

// Without 2 in the basis chords are exact: only their lowest note can be the bass, and nothing is folded.
{
  const tritave={...fromCommas('245/243','3.5.7','Computed CWE')};
  let checked=0;
  for(let degree=0;degree<tritave.n;degree++){const found=onBass(tritave,'3:5:7',degree);if(!found)continue;
    for(const e of found.entries){checked++;assert.equal(e.inversion,0);assert.equal(e.member,0);
      assert.deepEqual(e.coords.map(c=>c.map((v,i)=>v-e.bass[i])),found.g.shape.coordinates.map(c=>c.map((v,i)=>v-found.g.shape.coordinates[0][i])),'exact chords keep their own intervals');}
    for(const e of onRoot(tritave,'3:5:7',degree).entries){assert.equal(e.inversion,0,'an exact chord on a root only has root position');assert.equal(e.rootDegree,degree);}}
  assert.ok(checked>0,'the tritave example has a 3:5:7 occurrence');
}

console.log('Harmonic bass: inversion naming, close-position voicings on a bass degree, JI ordering, divided octaves and exact chords passed.');
