import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const lines=source.split('\n');
const toleranceField={value:''};
const context=vm.createContext({
 states:[{}],manualTolerance:null,
 coverageSettings:()=>({limit:15,primeLimit:5,primeLimitSelection:'basis'}),
 automaticTolerance:()=>10.899,
 targets:(limit,primeLimit)=>[{limit,primeLimit}],
 $:selector=>selector==='#tolerance'?toleranceField:{value:'distance'},
});
for(const name of ['clampTolerance','settings']){
 const line=lines.find(value=>value.startsWith(`function ${name}(`));assert.ok(line,`${name} exists`);vm.runInContext(line,context);
}
let settings=context.settings();
assert.equal(settings.tol,10.899,'automatic maximum remains the initial tolerance');
assert.equal(settings.autoTolerance,10.899);
assert.equal(settings.toleranceAutomatic,true);
assert.equal(toleranceField.value,'10.899','shared consumers receive the active tolerance');
context.manualTolerance=context.clampTolerance('7.25');
settings=context.settings();
assert.equal(settings.tol,7.25,'editing the diamond value overrides automatic tolerance');
assert.equal(settings.autoTolerance,10.899,'automatic maximum remains available for reset');
assert.equal(settings.toleranceAutomatic,false);
context.manualTolerance=context.clampTolerance('0');assert.equal(context.settings().tol,0,'zero is a valid manual tolerance');
assert.equal(context.clampTolerance('-5'),0);assert.equal(context.clampTolerance('120'),100);assert.equal(context.clampTolerance('invalid'),null);
assert.match(source,/data-diamond-tolerance-reset/);
assert.match(source,/manualTolerance=null;renderWorkspace\(\);return;/,'the Auto button restores the computed tolerance');
assert.match(source,/workflowVersion:8/);
assert.match(source,/manualTolerance,tonic:/,'manual tolerance is stored in session files');
console.log('Diamond tolerance editing, automatic fallback, range limits, shared settings and session version passed.');
