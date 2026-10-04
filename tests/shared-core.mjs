import assert from 'node:assert/strict';
import {BoundedCache} from '../dist/cache.mjs';
import {makeState,scale,targets,createTargetClassifier,classifyTargets,mapRatio} from '../dist/engine.mjs';
import {coordinateCents,noteCoordinate,purePeriod,approximationSpan} from '../dist/pitch.mjs';
import {rational,add,sub,mul,div,show} from '../dist/rational.mjs';
import {esc,option} from '../dist/ui.mjs';
import {fromCommas} from '../dist/tuning.mjs';

const cache = new BoundedCache(2);
let calls=0;
const get = key => cache.get(key,()=>++calls);
assert.equal(get('a'),1); assert.equal(get('b'),2); assert.equal(get('a'),1);
get('c'); assert.equal(get('b'),4); assert.equal(cache.entries.size,2);

const s = makeState('meantone'), original = scale(s);
assert.equal(scale({...s}),original);
assert.equal(scale({...s,name:'Renamed',mode:s.mode+s.n}),original);
assert.throws(()=>original.notes[0].c=1,TypeError);
assert.throws(()=>targets(13).push({}),TypeError);
for (const change of [{g:s.g+.1},{p:s.p+.1},{mode:1},{n:31}]) assert.notEqual(scale({...s,...change}),original);
for (const n of original.notes) assert.ok(Math.abs(coordinateCents(s,noteCoordinate(s,n))-n.c)<1e-7);

const ts=targets(13), classify=createTargetClassifier(s,ts,10);
assert.deepEqual(createTargetClassifier(s,[],10)({c:0,k:0}),{mapped:[],hits:[]},'empty target lists preserve the compatibility response');
for (const t of ts) {
  const m=mapRatio(t.n,t.d,s);
  if (!m) continue;
  const v={c:coordinateCents(s,m),k:m[1]};
  assert.deepEqual(classify(v),classifyTargets(s,v,ts,10));
  assert.equal(classify({...v}),classify(v));
}
const dreamtone=makeState('dreamtone'),broadTargets=targets(15,null),dreamClassifier=createTargetClassifier(dreamtone,broadTargets,4),thirteenth=broadTargets.find(t=>t.label==='13/12'),mappedThirteenth=mapRatio(thirteenth.n,thirteenth.d,dreamtone),thirteenthCents=coordinateCents(dreamtone,mappedThirteenth),precedence=dreamClassifier({c:thirteenthCents,k:mappedThirteenth[1]});
assert.ok(precedence.mapped.some(t=>t.label==='13/12'&&!t.within),'mapped target remains listed even outside tolerance');
assert.ok(precedence.hits.some(t=>t.label==='15/14'&&t.within),'outside-basis near hit remains available beside a poor mapped hit');
const split=fromCommas('128/125'), nonOctave=fromCommas('245/243','3.5.7');
assert.deepEqual(mapRatio(21,14,s),[0,1]);
assert.deepEqual(mapRatio(3,2,s),[0,1]);
assert.deepEqual(mapRatio(14,14,s),[0,0]);
assert.deepEqual(mapRatio(3_000_000_000_003,2_000_000_000_002,s),[0,1]);
assert.equal(mapRatio(7,4,s),null);
assert.throws(()=>mapRatio(0,1,s),/positive/);
assert.throws(()=>mapRatio(Number.MAX_SAFE_INTEGER+1,1,s),/safe integer/);
assert.equal(purePeriod(split),400); assert.equal(approximationSpan(split),3*split.p);
assert.equal(approximationSpan(nonOctave),nonOctave.p);
assert.deepEqual(rational(4,-6),[-2n,3n]);
assert.equal(show(add(rational(1,3),rational(1,6))),'1/2');
assert.equal(show(sub(rational(1,3),rational(1,6))),'1/6');
assert.equal(show(mul(rational(2,3),rational(3,2))),'1');
assert.equal(show(div(rational(2,3),rational(2,3))),'1');
assert.throws(()=>rational(1,0),/denominator/);
assert.equal(esc('<>&"\''),'&lt;&gt;&amp;&quot;&#39;');
assert.equal(option(3,'3 < 5','3'),'<option value="3" selected>3 &lt; 5</option>');
assert.ok(!option('" onfocus="bad','<script>',0).includes('value="" onfocus'));
console.log('Bounded immutable caches, lattice conventions, exact fractions and escaped UI helpers passed.');
