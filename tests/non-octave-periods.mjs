import assert from 'node:assert/strict';
import {fromCommas,ratios,supportingEdos,edoTune,optimize,tuneTargets,pureTune} from '../src/core/tuning.mjs';
import {mapRatio,scale,interval,purePeriod,gcd,makeState} from '../src/core/engine.mjs';
import {checkAssignments} from '../src/core/assignments.mjs';
import {selectionRank} from '../src/core/comma-search.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
for(const [commas,basis,q,reference] of [
  ['128/125','2.3.5',3,2],
  ['2048/2025','2.3.5',2,2],
  ['245/243','3.5.7',1,3],
  ['55/54, 64/63, 100/99','2.3.5.7.11',1,2]
]){
  for(const method of ['Computed WE','Computed CWE','Prime least squares']){
    const s=fromCommas(commas,basis,method);
    assert.equal(s.rows[0][0],q);
    for(const t of ratios(commas))assert.deepEqual(mapRatio(t.n,t.d,s),[0,0]);
    if(method!=='Computed WE')close(s.p*q,1200*Math.log2(reference));
    assert.ok(s.g>0&&s.g<s.p);
    const ts=tuneTargets(s,'primes');
    for(const fixed of [true,false])for(const objective of ['ls','minimax']){
      const tuned=optimize(s,ts,objective,fixed);
      assert.ok(tuned.g>0&&tuned.g<tuned.p);
      assert.ok(tuned.p>=purePeriod(s)/2-1e-6&&tuned.p<=purePeriod(s)*2+1e-6);
      if(fixed)close(tuned.p,s.p);
    }
    const pureTarget=ts.find(t=>t.m[1]);
    const pure=pureTune(s,[pureTarget],true);
    close(pureTarget.m[0]*pure.p+pureTarget.m[1]*pure.g,pureTarget.c);
    for(const variants of [false,true]){
      const edos=supportingEdos(s,100,variants);
      assert.ok(edos.length);
      for(const e of edos){
        if(reference===2)assert.equal(e.n%q,0);
        close(e.p,e.periodSteps*1200/e.n);
        for(const t of ratios(commas)){
          const monzo=mapRatio(t.n,t.d,{basis:s.basis,rows:s.basis.map((_,i)=>s.basis.map((_,j)=>+(i===j)))});
          assert.equal(monzo.reduce((sum,v,i)=>sum+v*e.induced[i],0),0);
        }
        assert.ok(e.induced.every((v,i)=>Math.abs(v-e.val[i])<=(variants?1:0)));
      }
    }
    const ns=scale(s).notes;
    assert.ok(ns.every(v=>v.c>=0&&v.c<s.p));
    for(let i=0;i<s.n;i++){
      close(interval(s,i,0,'distance').c,0);
      close(interval(s,i,s.n,'distance').c,s.p);
    }
  }
}

// Integer lattice invariants, including nonprimitive and redundant comma input.
for(let a=-4;a<=4;a++)for(let b=-4;b<=4;b++)for(let c=-4;c<=4;c++){
  if(!b&&!c)continue;
  const vectors=[{label:'test',exponents:[a,b,c]}];
  const s=fromCommas('','2.3.5','Prime least squares',vectors);
  assert.equal(s.rows[0][0],gcd(b,c)/gcd(a,gcd(b,c)));
  assert.ok(s.rows.every(r=>r.reduce((sum,v,i)=>sum+v*vectors[0].exponents[i],0)===0));
}
for(const vectors of [
  [[-2,2,0,0],[-1,0,2,0]],
  [[-4,4,0,0],[-2,0,4,0],[-6,4,4,0]],
  [[-1,2,0,0,0],[-1,0,3,0,0],[-1,0,0,5,0]]
]){
  const basis=[2,3,5,7,11].slice(0,vectors[0].length);
  const s=fromCommas('',basis.join('.'),'Prime least squares',vectors.map(exponents=>({label:'test',exponents})));
  assert.equal(s.rows[0][0],basis.length===5?30:2);
  let divisor=0;
  for(let i=0;i<basis.length;i++)for(let j=i+1;j<basis.length;j++)divisor=gcd(divisor,s.rows[0][i]*s.rows[1][j]-s.rows[0][j]*s.rows[1][i]);
  assert.equal(divisor,1,'Mapping must span the saturated integer annihilator');
}
assert.throws(()=>edoTune(fromCommas('128/125'),31),/integer step count/);
assert.throws(()=>fromCommas('2/1','2.3.5'),/reference interval/);
const extended={basis:[3,5,7,2],rows:[[1,1,2,0],[0,2,-1,1]],p:1200*Math.log2(3),g:700};
assert.ok(supportingEdos(extended,100,true).every(e=>e.induced[3]===e.n));
const tritave=fromCommas('245/243','3.5.7','Computed CWE');
const extension=checkAssignments(tritave,[{n:2,d:1,label:'2/1',m:[0,3]}]);
assert.equal(extension.status,'compatible');
assert.deepEqual(extension.basis,[3,5,7,2]);
assert.deepEqual(extension.rows.map(r=>r.slice(0,3)),tritave.rows);
assert.equal(selectionRank([3,5,7],[{exponents:[-5,1,2]}]).canGenerate,true);
assert.equal(selectionRank([2,3,5],[{exponents:[7,0,-3]}]).canGenerate,true);
const meantone=fromCommas('81/80','2.3.5','Computed CWE');
close(meantone.g,696.6512445735858);
assert.deepEqual(meantone.rows,makeState('meantone').rows);
console.log('Non-octave period, tuning, EDO, lattice, scale, and preset regression checks passed.');
