import assert from 'node:assert/strict';
import {createCommaWorkspace} from '../dist/comma-ui.mjs';
import {parseSearch,searchCommas,commaFromVector} from '../dist/comma-search.mjs';
import {fromCommaSearch} from '../dist/tuning.mjs';
import {makeState} from '../dist/engine.mjs';
const basis=[2,3,5],comma=commaFromVector(basis,[-4,4,-1]);
for(const [tuning,wanted] of [['Published CWE','Computed CWE'],['Published WE','Computed WE'],['Computed WE','Computed WE'],['Prime least squares','Prime least squares'],['Manual','Computed CWE'],['Pure intervals','Computed CWE'],['EDO target','Computed CWE']])assert.equal(fromCommaSearch(basis,[comma],{tuning}).tuning,wanted);
for(const tuning of ['Minimax','Least squares']){
 const s=fromCommaSearch(basis,[comma],{tuning,tuneConfig:{targets:'custom',custom:'5/4',fixed:true}});
 assert.equal(s.tuning,tuning);assert.ok(Math.abs(s.g-(1200*Math.log2(5/4)+2400)/4)<1e-6);
}
const fallback=fromCommaSearch(basis,[comma],{tuning:'Minimax',tuneConfig:{targets:'custom',custom:'7/4',fixed:true}});
assert.equal(fallback.tuning,'Computed CWE');assert.match(fallback.tuningReport,/Used CWE/);
assert.throws(()=>fromCommaSearch([2,3,5,7],[{...comma,exponents:[-4,4,-1,0]}],{tuning:'Computed CWE'}),/rank 3/);
// Exercise actual search batches and action routing without a browser.
globalThis.Worker=class{terminate(){}postMessage(form){for(const data of searchCommas(parseSearch(form)))this.onmessage({data});}};
const state=makeState('meantone');let generated=null;
const ui=createCommaWorkspace({getStates:()=>[state],generate:(basis,list)=>{generated={basis,list,state:fromCommaSearch(basis,list,state)};},refresh:()=>{},notify:()=>{}});
ui.change({dataset:{commaField:'basis'},value:'2.3.5'});ui.click({dataset:{comma:'search'}});
ui.click({dataset:{comma:'use',vector:'-4,4,-1'}});assert.equal(generated.state.tuning,'Computed CWE');assert.equal(generated.list.length,1);
ui.change({dataset:{commaField:'basis'},value:'2.3.5.7'});ui.click({dataset:{comma:'search'}});
const search=parseSearch(ui.serialize().form),results=[...searchCommas(search)].flatMap(batch=>batch.batch);
ui.click({dataset:{comma:'toggle',vector:results[0].exponents.join(',')}});ui.click({dataset:{comma:'toggle',vector:results[1].exponents.join(',')}});
assert.equal(ui.serialize().selected.length,2);ui.click({dataset:{comma:'generate'}});assert.equal(generated.basis.join('.'),'2.3.5.7');assert.equal(generated.list.length,2);assert.equal(generated.state.tuning,'Computed CWE');
assert.doesNotMatch(ui.render(),/Use for [AB]|[AB]’s basis|data-comma="(?:use|generate)-[ab]"/);
const saved=ui.serialize();ui.restore({...saved,method:'Computed WE'});assert.deepEqual(ui.serialize().selected,saved.selected);
console.log('Comma actions, multi-comma selection, old sessions, inherited optimization and CWE fallback passed.');
