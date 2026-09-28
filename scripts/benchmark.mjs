// Optional source directory lets the same harness compare a previous revision.
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';

const source=pathToFileURL(resolve(process.argv[2]||'dist')+'/');
const engine=await import(new URL('engine.mjs',source));
const {matrixScale,matrixInterval}=await import(new URL('matrix.mjs',source));
const {discoverChords}=await import(new URL('chords.mjs',source));
const {makeState,targets,classifyTargets}=engine, ts=targets(13);
function measure(run) {
  const samples=[];
  let result;
  for(let i=0;i<5;i++){const start=performance.now();result=run(i);samples.push(performance.now()-start);}
  samples.sort((a,b)=>a-b);
  return {medianMs:Number(samples[2].toFixed(2)),result};
}
function matrix(n) {
  return measure(run=>{
    const s={...makeState('meantone'),n,g:696.65+run/10000},m=matrixScale(s);
    let count=0;
    for(let repeat=0;repeat<10;repeat++){
      const classify=engine.createTargetClassifier?.(s,ts,10)??(v=>classifyTargets(s,v,ts,10));
      for(let i=0;i<n;i++)for(let j=0;j<=n;j++){const r=classify(matrixInterval(m,i,j));count+=r.mapped.length+r.hits.length;}
    }
    return count;
  });
}
console.log(JSON.stringify({
  matrix19:matrix(19),matrix81:matrix(81),
  coldTetrads81:measure(run=>{
    let count=0;
    for(let i=0;i<5;i++){const s={...makeState('meantone'),n:81,g:696.65+(run*5+i)/10000};count+=discoverChords(s,4,13,18,false).count;}
    return count;
  })
},null,2));
