import {analyzeChord} from './chord-analysis-v2.mjs';
import {realizeChord} from './chord-realization-v2.mjs';
import {BoundedCache} from './cache.mjs';
const catalogueCache=new BoundedCache(16);

// The filtered catalogue owns desirability and temperament equivalence. Layout
// scoring tests its compact inversions at every available root on the board.
export function catalogueLayoutTargets(s,rows=[]){
 const key=JSON.stringify([s.basis,s.rows,s.p,s.g,s.n,s.mode,rows.map(r=>r.text)]);
 return catalogueCache.get(key,()=>rows.flatMap(row=>{
  const analysis=analyzeChord(s,row.text),occurrence=analysis.occurrences.completeOccurrences[0];
  if(!occurrence)return [];
  let variants;
  try{const first=realizeChord(s,analysis,occurrence,{style:'compact'});variants=first.variants.map(v=>v.id===first.inversion?first.coords:realizeChord(s,analysis,occurrence,{style:'compact',inversion:v.id}).coords);}
  catch{variants=[occurrence.coords.filter((m,i,all)=>all.findIndex(n=>n[1]===m[1])===i)];}
  if(variants[0].length<2)return [];
  return [{coords:variants[0],variants,exact:false,periodCopies:true,label:row.label,kind:'catalogue',source:{id:row.id},realization:null}];
 }));
}

// Adapters retain canonical material/realization coordinates; never infer identity from pixels.
export function layoutTargets({realization=null,material=null,selectedCoordinates=[]}={}) {
 const source=realization||material||(selectedCoordinates.length>=2?{coords:selectedCoordinates,label:'Selected keys',exact:true,periodCopies:true}:null);
 if(!source)return [];
 const raw=source.coords||source.coordinates;
 const coords=Array.isArray(raw)?raw.filter((m,i)=>Array.isArray(m)&&m.length===2&&m.every(Number.isInteger)&&raw.findIndex(n=>n[0]===m[0]&&n[1]===m[1])===i):null;
 if(!Array.isArray(coords)||coords.length<2||coords.length>8)return [];
 return [{source,coords,exact:source.exact!==false,periodCopies:source.periodCopies!==false,label:source.label||'Selected chord',realization:realization||null}];
}
