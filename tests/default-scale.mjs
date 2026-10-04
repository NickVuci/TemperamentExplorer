import assert from 'node:assert/strict';
import {presets,makeState,scale,mapRatio,targets} from '../dist/engine.mjs';
import {mod} from '../dist/pitch.mjs';
import {fromCommas} from '../dist/tuning.mjs';
import {defaultDiamondScale,withDefaultDiamondScale} from '../dist/default-scale.mjs';
import {findScaleMilestones,scaleCoverageTarget} from '../dist/scale-milestones.mjs';
import {createPresetWorkspace} from '../dist/preset-ui.mjs';
import {createHexboardWorkspace} from '../dist/hexboard-ui.mjs';

function covers(s,options){
 const cfg=scaleCoverageTarget(s,options),notes=new Set(scale(s).notes.map(v=>[Math.round((v.c-v.k*s.g)/s.p),v.k].join(',')));
 return targets(cfg.limit,cfg.primeLimit).every(t=>{
  const m=mapRatio(t.n,t.d,s);if(!m)return true;
  const c=mod(m[0]*s.p+m[1]*s.g,s.p);
  return notes.has([Math.round((c-m[1]*s.g)/s.p),m[1]].join(','));
 });
}
for(const s of [...Object.keys(presets).map(makeState),fromCommas('128/125'),fromCommas('245/243','3.5.7')]){
 const before=structuredClone(s),chosen=defaultDiamondScale(s);assert.ok(chosen,s.name);
 assert.ok(covers({...s,...chosen}),`${s.name}: selected tonic contains every mapped diamond interval`);
 if(chosen.n>2)for(let mode=0;mode<chosen.n-1;mode++)assert.equal(covers({...s,n:chosen.n-1,mode}),false,`${s.name}: preceding size cannot cover diamond in any mode`);
 assert.deepEqual(s,before,'selection calculation does not mutate the source');
}
assert.deepEqual(defaultDiamondScale(makeState('meantone')),{n:11,mode:10});
assert.deepEqual(defaultDiamondScale(makeState('meantone'),{limit:5,primeLimit:5}),{n:9,mode:3});
const closed={...makeState('meantone'),g:700};assert.ok(covers(withDefaultDiamondScale(closed)));
for(const s of [{...closed,g:600},{...closed,rows:[[1,1,0],[0,1,1000]]}]){
 let warning='';assert.equal(defaultDiamondScale(s),null);assert.equal(withDefaultDiamondScale(s,text=>warning=text),s);assert.match(warning,/No collision-free diamond-complete mode/);
}
const saved={...makeState('meantone'),n:7,mode:4},states=[saved];let ji={limit:5,primeLimit:5,tol:10};
const ui=createPresetWorkspace({getStates:()=>states,getJI:()=>ji,apply:(i,s)=>states[i]=s,refresh:()=>{},notify:()=>{},request:async()=>Response.json({presets:[{id:'saved',name:saved.name,state:saved}]})});
await ui.init();
for(const value of ['builtin:meantone','saved:saved']){ui.change({dataset:{savedPreset:'0'},value});assert.deepEqual({n:states[0].n,mode:states[0].mode},{n:9,mode:3});assert.ok(covers(states[0],ji));}
assert.equal(saved.n,7,'loading a preset does not overwrite its saved scale');
ji={limit:15,primeLimit:5,tol:10};
ui.receiveCommas(0,[2,3,5],[{label:'81/80'}]);ui.click({dataset:{userPreset:'generate',s:'0'}});assert.equal(states[0].n,11);assert.ok(covers(states[0],ji));
const hex=createHexboardWorkspace({getStates:()=>states,getJI:()=>ji,refresh:()=>{},notify:()=>{},play:()=>{},getHz:()=>220});
hex.render();assert.equal(hex.serialize().configs[0].base,findScaleMilestones(states[0],ji).intervalMOS.n);
hex.change({dataset:{hexField:'base'},value:'5'});hex.render();assert.equal(hex.serialize().configs[0].base,5,'manual base survives unchanged context');
const session=hex.serialize();hex.restore(session);hex.render();assert.equal(hex.serialize().configs[0].base,5,'saved manual base survives restore');
ji={limit:9,primeLimit:3,tol:10};hex.render();assert.equal(hex.serialize().configs[0].base,findScaleMilestones(states[0],ji).intervalMOS.n,'new JI target updates base default');
hex.restore(null);ji={limit:15,primeLimit:5,tol:10};hex.render();assert.equal(hex.serialize().configs[0].base,7,'reset reapplies first interval-complete MOS');
console.log('Shared diamond defaults: first completing scale/mode, selected limits, presets, non-octave periods, collision bounds, base MOS, manual edits and restoration passed.');

// Execute the actual app's context/default wiring without a browser renderer.
const {readFileSync}=await import('node:fs');
const {runInNewContext}=await import('node:vm');
const {scaleDefaultKey}=await import('../dist/scale-milestones.mjs');
const {primeFilterForBasis,validateJILimits,parsePrimeFilterInput}=await import('../dist/ji-limit-engine.mjs');
const app=readFileSync('dist/app.mjs','utf8');
const fields={'#limit':{value:'15'},'#primeLimit':{value:'basis'}};
const context={states:[withDefaultDiamondScale(makeState('meantone'))],layoutState:null,coverageSignature:'',matrixPages:[[0,0]],selected:null,$:selector=>fields[selector],withDefaultDiamondScale,scaleDefaultKey,primeFilterForBasis,validateJILimits,parsePrimeFilterInput,structuredClone,toast:()=>{}};
for(const name of ['coverageSettings','syncCoverageDefaults','getLayoutStates'])runInNewContext(app.split('\n').find(line=>line.startsWith(`function ${name}(`)),context);
context.syncCoverageDefaults();let layout=context.getLayoutStates()[0];
assert.equal(layout.n,11);assert.equal(layout.mode,10);
layout.n=12;layout.mode=2;context.states[0].n=7;context.states[0].mode=4;
context.syncCoverageDefaults();assert.equal(context.states[0].n,7,'manual Discover size survives redraw');
assert.equal(context.getLayoutStates()[0].n,12,'independent manual layout survives redraw');
fields['#limit'].value='5';context.syncCoverageDefaults();layout=context.getLayoutStates()[0];
assert.equal(context.states[0].n,9);assert.equal(context.states[0].mode,3);assert.equal(layout.n,9);assert.equal(layout.mode,3);
// Exercise both independent selections across generator and period changes,
// including an EDO collision: retuning cannot silently substitute a scale.
context.states[0].n=7;context.states[0].mode=4;layout.n=12;layout.mode=2;
for(const [p,g] of [[1200,701],[1198,695],[1200,700]]){
 context.states[0].p=p;context.states[0].g=g;context.syncCoverageDefaults();layout=context.getLayoutStates()[0];
 assert.equal(context.states[0].n,7,'retuning preserves Discover size');
 assert.equal(context.states[0].mode,4,'retuning preserves Discover mode');
 assert.equal(layout.n,12,'retuning preserves Play size');
 assert.equal(layout.mode,2,'retuning preserves Play mode');
 assert.equal(layout.p,p,'Play receives retuned period');assert.equal(layout.g,g,'Play receives retuned generator');
}
context.states[0]=makeState('porcupine');context.syncCoverageDefaults();layout=context.getLayoutStates()[0];
const changed=defaultDiamondScale(context.states[0],context.coverageSettings(context.states[0]));
assert.equal(context.states[0].n,changed.n,'mapping changes still apply defaults');
assert.equal(layout.mode,changed.mode,'mapping changes still apply Play defaults');
context.states[0].n=12;context.states[0].mode=2;context.coverageSignature=scaleDefaultKey(context.states[0],context.coverageSettings(context.states[0]));context.syncCoverageDefaults();
assert.equal(context.states[0].n,12,'adopting restored context preserves a saved scale');
