import assert from 'node:assert/strict';
import {makeState} from '../dist/engine.mjs';
import {fromCommas} from '../dist/tuning.mjs';
import {analyzeChord} from '../dist/chord-analysis-v2.mjs';
import {realizationDefaults,realizeChord,placeRealization} from '../dist/chord-realization-v2.mjs';
import {buildBoard} from '../dist/hexboard.mjs';
import {createChordCatalogueWorkspace} from '../dist/chord-catalog-ui.mjs';
const s=makeState('miracle11'),a=analyzeChord(s,'4:5:6:7:9:11'),occ=a.occurrences.completeOccurrences.find(o=>o.root===14);
assert.equal(realizationDefaults().style,'original','Harmonic spelling is the default chord spacing.');
let cfg={base:7,style:'bosanquet',center:65,offset:0,rotation:0,register:0,outside:false,periodWrapping:true};
const v=realizeChord(s,a,occ,{style:'original'}),placed=placeRealization(s,v,buildBoard(s,cfg));assert.ok(placed.placements.length>1);
for(const r of [{inversion:1},{periodShift:1},{periodShift:-1},{order:'input'},{style:'open'}]){const x=realizeChord(s,a,occ,r);assert.equal(x.occurrenceId,v.occurrenceId);assert.equal(x.chordId,v.chordId);assert.deepEqual(x.pitches,x.coords.map(m=>m[0]*s.p+m[1]*s.g));}
for(const config of [{...cfg,periodPlacement:{column:2,row:-1}},{...cfg,flipHorizontal:true},{...cfg,flipVertical:true},{...cfg,deviceRotation:2}]){const board=buildBoard(s,config),p=placeRealization(s,v,board);assert.equal(p.occurrenceId,occ.id);for(const f of p.placements)assert.deepEqual(f.pitches,f.coords.map(m=>m[0]*s.p+m[1]*s.g));}
assert.equal(placeRealization(s,v,{keys:[]}).placements.length,0);
for(const state of [{...makeState('meantone'),g:700}, {...fromCommas('128/125','2.3.5','Computed CWE'),n:19,mode:0},{...fromCommas('245/243','3.5.7','Computed CWE'),n:19,mode:0}]){
 const aa=analyzeChord(state,state.basis.includes(2)?'4:5:6':'3:5:7'),oo=aa.occurrences.completeOccurrences[0];assert.ok(oo);const vv=realizeChord(state,aa,oo,{periodShift:1}),zz=realizeChord(state,aa,oo);assert.ok(vv.pitches.every((p,i)=>Math.abs(p-zz.pitches[i]-state.p)<1e-8));
}
let played,highlight,collected,inspected;const ui=createChordCatalogueWorkspace({getState:()=>s,getSettings:()=>({tol:10,limit:11}),getBoard:()=>buildBoard(s,cfg),play:p=>played=p,onHighlight:h=>highlight=h,onCollect:(...x)=>collected=x,onInspect:(...x)=>inspected=x});
ui.model();ui.click({dataset:{catalogueAction:'v2-root',id:occ.id}});assert.equal(ui.model().realizationOptions.style,'original');ui.change({dataset:{catalogueField:'v2-style'},value:'original'});let m=ui.model();assert.ok(m.placements.length);assert.ok(highlight.keys.length);
for(const act of ['v2-play','v2-inspect','v2-collect'])ui.click({dataset:{catalogueAction:act}});
assert.deepEqual(played,m.placements[0].pitches);assert.deepEqual(inspected[1],m.placements[0].coords);assert.deepEqual(collected[1],inspected[1]);
ui.click({dataset:{catalogueAction:'v2-next'}});assert.equal(ui.model().fingering,1);
const saved=ui.serialize();ui.restore(saved);assert.equal(ui.model().selected,saved.engineV2.selected);assert.equal(ui.model().placements[ui.model().fingering].keys.join(','),saved.engineV2.fingering);assert.ok(!ui.render().includes('chordEngineVersion2'));ui.destroy();

const altered=structuredClone(occ);altered.coords[0][0]+=10;altered.degrees[0]=999;assert.deepEqual(realizeChord(s,a,altered).coords,realizeChord(s,a,occ).coords,'Resolve canonical occurrence data by ID');
const collapsedAnalysis=analyzeChord(makeState('meantone'),'1:81/80');const cv=realizeChord(makeState('meantone'),collapsedAnalysis,collapsedAnalysis.occurrences.completeOccurrences[0],{inversion:5});assert.equal(cv.request.inversion,cv.inversion);assert.equal(cv.inversion,0);
