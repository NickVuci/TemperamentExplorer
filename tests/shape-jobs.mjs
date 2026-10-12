import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {makeState} from '../src/core/engine.mjs';
import {BUILTIN_LAYOUTS} from '../src/hexboard/builtin-layouts.mjs';
import {buildBoard} from '../src/hexboard/hexboard.mjs';
import {coordinateCents} from '../src/core/pitch.mjs';
import {chordIdentity} from '../src/chords/chord-identity.mjs';
import {harmonicIdentity} from '../src/harmonic/harmonic-equivalence.mjs';
import {immutable} from '../src/core/cache.mjs';
import {shapeJobContextId,presentShapeResult,createShapeJobDispatcher,createShapeJobs} from '../src/shapes/shape-jobs.mjs';

const saved=BUILTIN_LAYOUTS.find(row=>row.id==='builtin:meantone').state;
const state={...makeState('meantone'),...saved.context},board=buildBoard(state,saved.config);
const payload={state,board,inputs:['4:5:6'],settings:{limit:5,primeLimit:5},constraints:{span:2,maxNodes:100000}};
const envelope=(requestId,data=payload,kind='shape-search')=>({requestId,contextId:shapeJobContextId(kind,data),kind,payload:data});
const messages=[],dispatcher=createShapeJobDispatcher({emit:message=>messages.push(message),cacheEntries:2});
await dispatcher.dispatch(envelope(1));
const first=messages.at(-1);assert.equal(first.type,'complete');assert.equal(first.result.complete,true);assert.ok(first.result.shapes.length>0);assert.ok(first.result.placementCount>1);
assert.ok(Object.isFrozen(first.result));
await dispatcher.dispatch(envelope(2));assert.equal(messages.at(-1).cached,true);assert.equal(dispatcher.metrics.hits,1);
const retuned={...state,g:state.g+.01},retunedPayload={...payload,state:retuned,board:buildBoard(retuned,saved.config)};
assert.equal(shapeJobContextId('shape-search',retunedPayload),shapeJobContextId('shape-search',payload));
await dispatcher.dispatch(envelope(3,retunedPayload));
const tuned=messages.at(-1);assert.equal(tuned.cached,true);
for(const shape of tuned.result.shapes)for(const placement of shape.placements){
 assert.deepEqual(placement.pitches,placement.coords.map(m=>coordinateCents(retuned,m)));
 for(const reading of placement.associations){
  const pitches=reading.coordinates.map(m=>coordinateCents(retuned,m)),minimum=Math.min(...pitches);
  assert.deepEqual(reading.bassMembers,pitches.flatMap((c,i)=>Math.abs(c-minimum)<1e-7?[i]:[]));
  assert.deepEqual(reading.soundingBassMembers,reading.bassMembers);
 }
}
assert.deepEqual(first.result.shapes.map(shape=>shape.id),tuned.result.shapes.map(shape=>shape.id));
assert.notDeepEqual(first.result.shapes[0].placements[0].pitches,tuned.result.shapes[0].placements[0].pitches);

// Every structural/search dependency invalidates; incidental display values do not.
for(const patch of [{inputs:['10:12:15']},{constraints:{...payload.constraints,span:1}},
 {settings:{limit:7,primeLimit:5}},{filters:{familyIds:[]}},{directoryComplete:false},
 {state:{...state,mode:1}},{board:{...board,keys:board.keys.map(k=>k.index===65?{...k,enabled:!k.enabled}:k)}},
 {board:{...board,keys:board.keys.map(k=>k.index===65?{...k,degree:99}:k)}},
 {board:{...board,keys:board.keys.map(k=>k.index===65?{...k,conflict:true}:k)}}])
 assert.notEqual(shapeJobContextId('shape-search',{...payload,...patch}),shapeJobContextId('shape-search',payload));
assert.equal(shapeJobContextId('shape-search',{...payload,settings:{oddLimit:5,primeFilter:5}}),shapeJobContextId('shape-search',payload));
assert.equal(shapeJobContextId('shape-search',{...payload,board:{...board,keys:[...board.keys].reverse().map(k=>({...k,c:123456,pc:123,fill:'pink'}))}}),shapeJobContextId('shape-search',payload));
assert.throws(()=>shapeJobContextId('other',payload),/Invalid/);
assert.throws(()=>createShapeJobDispatcher({cacheEntries:0}),/bounds/);
assert.throws(()=>createShapeJobDispatcher({maxCachePlacements:20001}),/bounds/);
await dispatcher.dispatch({...envelope(4),contextId:'wrong'});assert.equal(messages.at(-1).type,'error');
await dispatcher.dispatch({...envelope(4),requestId:0});assert.equal(messages.at(-1).type,'error');
console.log('Shape contexts bind structural dependencies and complete caches rederive tuned sound.');

// Refresh every reading location, including reverse results and collapsed member links.
const reading={coordinates:[[0,0],[1,-2],[0,0]],memberKeys:[65,66,65],bassMembers:[0,2],bassToneIndices:[0],rootToneIndices:[0],possibleInversions:[0]};
const fixture=immutable({shapes:[{associations:[reading],placements:[{keys:[65,66],coords:[[0,0],[1,-2]],pitches:[0,1],associations:[reading]}]}],selected:{coordinates:[[0,0],[1,-2]],pitches:[0,1]},matches:[reading]});
const refreshed=presentShapeResult(fixture,{p:1200,g:700});
assert.deepEqual(refreshed.selected.pitches,[0,-200]);
for(const record of [refreshed.matches[0],refreshed.shapes[0].associations[0],refreshed.shapes[0].placements[0].associations[0]]){
 assert.deepEqual(record.bassMembers,[1]);assert.deepEqual(record.soundingBassMembers,[1]);assert.deepEqual(record.soundingBassKeys,[66]);
 assert.deepEqual(record.bassToneIndices,[0]);assert.deepEqual(record.possibleInversions,[0]);
}
assert.deepEqual(fixture.matches[0].bassMembers,[0,2]);

const capped=createShapeJobDispatcher({emit:message=>messages.push(message),maxCachePlacements:1});
for(let i=1;i<=2;i++)await capped.dispatch(envelope(i));
assert.equal(capped.metrics.hits,0);assert.equal(capped.metrics.skippedLarge,2);assert.equal(capped.metrics.entries,0);
for(const constraints of [{span:2,maxPlacements:1},{span:2,maxNodes:1}]){
 const limited={...payload,constraints};
 for(let i=5;i<7;i++){await dispatcher.dispatch(envelope(i,limited));const response=messages.at(-1);assert.equal(response.type,'complete');assert.equal(response.result.complete,false);assert.equal(response.cached,false);assert.match(response.result.reason,/max-/);}
}
const family=harmonicIdentity(chordIdentity('4:5:6'),'octave').familyId;
const directory={...payload,inputs:[],universe:'directory',filters:{sizes:[3],form:'all',familyIds:[family]}};
await dispatcher.dispatch(envelope(7,directory));
assert.equal(messages.at(-1).type,'complete');assert.ok(messages.at(-1).result.targets.length);
assert.ok(messages.at(-1).result.targets.every(target=>target.familyId===family),'directory family filter reaches source enumeration');
await dispatcher.dispatch(envelope(8,{...directory,filters:{...directory.filters,familyIds:[]}}));assert.equal(messages.at(-1).result.targets.length,0);
for(let i=9;i<11;i++){
 await dispatcher.dispatch(envelope(i,{...directory,directoryComplete:false}));
 const response=messages.at(-1);assert.equal(response.result.complete,false);assert.equal(response.result.sourceUniverse.complete,false);assert.equal(response.result.sourceUniverse.directoryComplete,false);assert.equal(response.result.reason,'directory-incomplete');assert.equal(response.cached,false);
}
assert.equal(dispatcher.metrics.entries,2,'complete-result LRU remains bounded');
console.log('Source family filtering, directory completeness, bounded search and cache exclusion are explicit.');

let fake={sent:[],postMessage(message){this.sent.push(message);},terminate(){this.terminated=true;}};
const received=[],workerClient=createShapeJobs({workerFactory:()=>fake,onMessage:message=>received.push(message)});
const old=workerClient.run('shape-search',payload),current=workerClient.run('shape-search',retunedPayload);
assert.equal((await old.promise).status,'cancelled');
fake.onmessage({data:{requestId:old.requestId,contextId:old.contextId,kind:'shape-search',type:'complete'}});
fake.onmessage({data:{requestId:current.requestId,contextId:'stale',kind:'shape-search',type:'complete'}});
fake.onmessage({data:{requestId:current.requestId,contextId:current.contextId,kind:'query',type:'complete'}});
assert.equal(received.length,0,'even identical structural contexts cannot admit an obsolete request');
fake.onmessage({data:{requestId:current.requestId,contextId:current.contextId,kind:'shape-search',type:'complete',result:{ok:true}}});
assert.equal((await current.promise).result.ok,true);
const stopped=workerClient.run('shape-search',payload);stopped.cancel();assert.equal((await stopped.promise).status,'cancelled');
const destroyed=workerClient.run('shape-search',payload);workerClient.destroy();assert.equal((await destroyed.promise).status,'cancelled');assert.ok(fake.terminated);assert.throws(()=>workerClient.run('shape-search',payload),/destroyed/);

// Progress callbacks can cancel synchronously, including the source universe's final callback.
for(const stage of ['sources','placements']){
 const events=[];let client;
 client=createShapeJobs({workerFactory:()=>null,onMessage:message=>{events.push(message);if(message.type==='progress'&&message.progress.stage===stage)client.cancel();}});
 const job=client.run('shape-search',stage==='sources'?payload:{...payload,universe:'directory',filters:{sizes:[3]}});
 assert.equal((await job.promise).status,'cancelled');
 await new Promise(resolve=>setTimeout(resolve,5));
 assert.ok(events.some(message=>message.type==='progress'&&message.progress.stage===stage));assert.ok(events.every(message=>message.type==='progress'));client.destroy();
}
const before=messages.length,pending=dispatcher.dispatch(envelope(11,{...directory,settings:{limit:9,primeLimit:5}}));
await dispatcher.dispatch(envelope(12));await pending;
assert.ok(!messages.slice(before).some(message=>message.requestId===11&&message.type==='complete'));
dispatcher.destroy();const count=messages.length;await dispatcher.dispatch(envelope(13));assert.equal(messages.length,count);

const broken={postMessage(){throw Error('transport failure');},terminate(){this.terminated=true;}};
const recovered=createShapeJobs({workerFactory:()=>broken});assert.equal((await recovered.run('shape-search',payload).promise).type,'complete');assert.equal(recovered.usingWorker,false);assert.ok(broken.terminated);recovered.destroy();
const unavailable=createShapeJobs({workerFactory:()=>{throw Error('Workers unavailable');}});assert.equal((await unavailable.run('shape-search',payload).promise).type,'complete');assert.equal(unavailable.usingWorker,false);unavailable.destroy();
const crashing={postMessage(){},terminate(){this.terminated=true;}};
const recoveredAsync=createShapeJobs({workerFactory:()=>crashing}),interrupted=recoveredAsync.run('shape-search',payload);crashing.onerror({message:'Worker failed'});
assert.equal((await interrupted.promise).type,'complete');assert.equal(recoveredAsync.usingWorker,false);recoveredAsync.destroy();
console.log('Stale contexts, cancellation during both stages, destruction and Worker fallback are isolated.');

function nativeWorker(){
 const node=new NodeWorker(new URL('./fixtures/harmonic-discovery/worker-harness.mjs',import.meta.url));
 const wrapper={postMessage:data=>node.postMessage(data),terminate:()=>node.terminate(),onmessage:null,onerror:null};
 node.on('message',data=>wrapper.onmessage?.({data}));node.on('error',error=>wrapper.onerror?.(error));return wrapper;
}
const worker=createShapeJobs({workerFactory:nativeWorker}),fallback=createShapeJobs({workerFactory:()=>null});
try{
 const selected=first.result.shapes[0].placements[0].keys;
 const reverse={...payload,keys:selected,filters:{familyIds:[],form:'utonal'}};
 assert.equal(shapeJobContextId('shape-identify',{...reverse,keys:[...selected].reverse()}),shapeJobContextId('shape-identify',reverse));
 for(const [kind,request]of [['shape-search',payload],['shape-search',retunedPayload],['shape-search',{...directory,directoryComplete:false}],['shape-identify',reverse],['shape-identify',{...reverse,...retunedPayload}]]){
  const a=await worker.run(kind,request).promise,b=await fallback.run(kind,request).promise;
  assert.equal(a.type,'complete',a.message);assert.equal(b.type,'complete',b.message);assert.deepEqual(a.result,b.result,`${kind} native Worker and fallback agree`);
  if(kind==='shape-identify'){
   assert.ok(a.result.matches.length);assert.deepEqual(a.result.selected.pitches,a.result.selected.coordinates.map(m=>coordinateCents(request.state,m)));
   assert.deepEqual(a.result.sourceUniverse.bounds.sizes,[3,4,5,6,7,8],'reverse sources start at the number of distinct sounding keys');
  }
 }
 // Two selected buttons sounding one coordinate: doubling readings, retuned like every other reading.
 const twin=board.keys.find(k=>!k.command&&!selected.includes(k.index)),doubledBoard={...board,keys:board.keys.map(k=>k.index===twin.index?{...k,m:[...board.keys[selected[0]].m]}:k)};
 const doubled=await fallback.run('shape-identify',{...reverse,...retunedPayload,board:doubledBoard,keys:[...selected,twin.index]}).promise;
 assert.equal(doubled.type,'complete',doubled.message);assert.equal(doubled.result.selected.addedDoublings,1);assert.deepEqual(doubled.result.matches,[]);
 assert.deepEqual(doubled.result.sourceUniverse.bounds.sizes,[3,4,5,6,7,8]);assert.ok(doubled.result.doublingReadings.length);
 for(const reading of doubled.result.doublingReadings){
  const pitches=reading.coordinates.map(m=>coordinateCents(retuned,m)),low=Math.min(...pitches);
  assert.deepEqual(reading.bassMembers,pitches.flatMap((c,i)=>Math.abs(c-low)<1e-7?[i]:[]));
 }
}finally{worker.destroy();fallback.destroy();capped.destroy();}
console.log('Native Worker/fallback forward, filtered-directory, reverse lookup and retuned cache results agree.');
