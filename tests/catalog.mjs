import assert from 'node:assert/strict';
import {presets,makeState,mapRatio,scale} from '../dist/engine.mjs';
import {ratios,fromCommas,weilTune} from '../dist/tuning.mjs';
import {validateState} from '../dist/state.mjs';
import {presetSnapshot} from '../dist/preset-data.mjs';
assert.equal(Object.keys(presets).length,20);
for(const [key,p] of Object.entries(presets)){
 const s=makeState(key);validateState(s);presetSnapshot(s.name,s);
 for(const c of ratios(s.commas))assert.deepEqual(mapRatio(c.n,c.d,s),[0,0],`${key}: ${c.label}`);
 const rebuilt=fromCommas(s.commas,s.basis.join('.'));
 assert.deepEqual(rebuilt.rows,s.rows,`${key}: comma input retains conventional generator`);
 if(p.defaultSize){assert.ok(scale(s).mos,`${key}: opening MOS`);assert.equal(s.g,weilTune(s,true).g);}
}
for(const [key,g] of Object.entries({porcupine7:162.9493,porkypine:163.9951,porcupinefowl:162.8314,porcupinefish:162.3458,magic7:380.4576,magic11:380.7008}))assert.ok(Math.abs(presets[key].g-g)<0.0001,`${key}: published CWE cross-check`);
assert.equal(makeState('pajara11').p,600);
console.log('20 catalog presets: valid states, comma kernels, conventional generators, save snapshots, MOS defaults and CWE references verified.');
