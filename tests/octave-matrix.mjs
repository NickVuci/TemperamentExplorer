import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fromCommas} from '../src/core/tuning.mjs';
import {classifyTargets,interval,makeState} from '../src/core/engine.mjs';
import {matrixScale,matrixInterval,matrixWindow,octavePeriods} from '../src/core/matrix.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
for(const comma of ['128/125','2048/2025'])for(const method of ['Computed CWE','Computed WE']){
  const s=fromCommas(comma,'2.3.5',method);s.mode=4;
  const one=matrixScale(s);
  for(let i=0;i<s.n;i++)for(let j=0;j<=s.n;j++){
    const a=matrixInterval(one,i,j),b=interval(s,i,j,'distance');
    close(a.c,b.c);assert.equal(a.k,b.k);
  }
  s.matrixOctave=true;
  const m=matrixScale(s),q=octavePeriods(s);
  assert.equal(m.n,q*s.n);close(m.p,q*s.p);
  for(let i=0;i<m.n;i++){
    close(m.notes[i].c,one.notes[i%s.n].c+Math.floor(i/s.n)*s.p);
    assert.equal(m.notes[i].k,one.notes[i%s.n].k);
    let previous=-1;
    for(let j=0;j<=m.n;j++){
      const v=matrixInterval(m,i,j);
      assert.ok(v.c>=previous-1e-7);previous=v.c;
      close((v.c-v.k*s.g)/s.p,Math.round((v.c-v.k*s.g)/s.p));
      if(j<m.n)close(v.c,matrixInterval(m,i,v.end,'notes').c);
    }
    const octave=classifyTargets(s,matrixInterval(m,i,m.n),[{n:2,d:1,c:1200,label:'2/1'}],20);
    assert.equal(octave.mapped.length,1);
    close(octave.mapped[0].error,q*s.p-1200);
  }
  const fifth={n:3,d:2,c:1200*Math.log2(1.5),label:'3/2'};
  assert.ok(fifth.c>one.p);
  let mapped=false;
  for(let i=0;i<m.n;i++)for(let j=0;j<m.n;j++)mapped ||= classifyTargets(s,matrixInterval(m,i,j),[fifth],15).mapped.some(t=>t.within);
  assert.ok(mapped,'Mapped fifth must be available beyond the first period');
  assert.equal(matrixScale(JSON.parse(JSON.stringify(s))).n,m.n);
}
for(const s of [makeState('meantone'),fromCommas('245/243','3.5.7')]){
  s.matrixOctave=true;assert.equal(octavePeriods(s),1);assert.equal(matrixScale(s).n,s.n);
}
const huge={...fromCommas('128/125'),n:48,rows:[[1000,4,7],[0,1,0]],p:1.2,g:.73,matrixOctave:true};
const m=matrixScale(huge),w=matrixWindow(m,true,Infinity,Infinity);
assert.equal(w.rowEnd,m.n);assert.equal(w.colEnd,m.n+1);
assert.ok((w.rowEnd-w.rowStart)*(w.colEnd-w.colStart)<=24*48);
assert.equal(matrixWindow(m,false,0,0).colStart,0);
const appSource=readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
const htmlSource=readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
assert.match(htmlSource,/id="diamond-span-controls"/);
assert.match(appSource,/function placeJIControls\(v\).*spanControl\(states\[0\],0,'Target span'\)/);
assert.match(appSource,/Target span/);
console.log('Octave matrix repetition, mapping, stretched endpoints, modes, session, and paging checks passed.');
