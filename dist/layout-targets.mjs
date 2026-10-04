import {analyzeChord} from './chord-analysis-v2.mjs';
import {realizeChord,realizeShape} from './chord-realization-v2.mjs';
import {searchShapeOccurrences,occurrenceShape} from './chord-occurrence-v2.mjs';
import {harmonicEntryGeometry} from './harmonic-selection.mjs';
import {BoundedCache} from './cache.mjs';
const catalogueCache=new BoundedCache(16);
const harmonicCatalogueCache=new BoundedCache(16);

// Every abstract shape receives one vote; aliases and inversions are variants.
export function harmonicCatalogueLayoutTargets(s,rows=[]){
 const key=JSON.stringify([s.basis,s.rows,s.p,s.g,s.n,s.mode,rows.map(row=>row.id)]);
 return harmonicCatalogueCache.get(key,()=>{
  const seen=new Set(),targets=[];
  for(const row of rows.slice(0,512)){
   const geometry=harmonicEntryGeometry(s,row);if(!geometry)continue;
   const shape=occurrenceShape(s,geometry.shape);if(seen.has(shape.id))continue;
   const occurrence=searchShapeOccurrences(s,geometry.shape).completeOccurrences[0];if(!occurrence)continue;
   const first=realizeShape(s,geometry.shape,occurrence,{style:'compact'},{tones:geometry.tones});
   if(first.coords.length<2||first.coords.length>8)continue;
   const variants=first.variants.map(v=>v.id===first.inversion?first.coords:realizeShape(s,geometry.shape,occurrence,{style:'compact',inversion:v.id},{tones:geometry.tones}).coords);
   seen.add(shape.id);targets.push({coords:variants[0],variants,exact:false,periodCopies:true,label:row.preferredLabel??row.targetRatio??'Coordinate harmony',kind:'catalogue',source:{id:shape.id},realization:null});
  }
  return targets;
 });
}

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
