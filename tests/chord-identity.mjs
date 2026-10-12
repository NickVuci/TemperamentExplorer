import assert from 'node:assert/strict';
import {chordIdentity as id,chordMonzos,jiSubset} from '../src/chords/chord-identity.mjs';
const a=id('4:5:6');for(const x of ['1:5/4:3/2','6:4:5','8:10:12'])assert.equal(id(x).fingerprint,a.fingerprint);
assert.deepEqual(id('1:81/80').canonicalRatios.find(q=>q.label==='81/80').exponents,{'2':-4,'3':4,'5':-1});
assert.deepEqual(id('6:4:5').orderedInput,['6','4','5']);assert.equal(id('1/6:5:4').aliases.otonal,'10:12:15');
assert.equal(id('4:4:5:6').cardinality,3);assert.equal(id('4:4:5:6').repeatedMembers,1);
assert.deepEqual(JSON.parse(JSON.stringify(a)),a);assert.equal(id('999983:1000000').cardinality,2);
for(const x of ['0:1','-1:2','NaN:2','Infinity:2','1/0:2','4::6','1000001:1','1','1:2:3:4:5:6:7:8:9','1e2:3'])assert.throws(()=>id(x));
for(let k=1;k<100;k++){assert.equal(id(`${4*k}/${k+1}:${5*k}/${k+1}:${6*k}/${k+1}`).fingerprint,a.fingerprint);assert.equal(id(`${6*k}:${5*k}:${4*k}`).fingerprint,a.fingerprint);}
assert.deepEqual(chordMonzos(id('1:97/64'),[2,3,5,7,11])[1].missingPrimes,[97]);
assert.deepEqual(chordMonzos(id('1:97/64'),[2,3,5,7,11])[1].monzo,[-6,0,0,0,0]);
assert.ok(jiSubset(a,id('1:4:5:6:7')));assert.ok(jiSubset(id('6:4:5'),id('12:10:8:14')));assert.ok(!jiSubset(id('4:5:6:7'),a));
