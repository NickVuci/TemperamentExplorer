import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {makeState} from '../src/core/catalog.mjs';
import {targetSet} from '../src/core/ji-limit-engine.mjs';
import {buildDyadIndex, enumerateDyadicShapeSteps} from '../src/harmonic/harmonic-dyad-graph.mjs';
import {findCoherentJILift, findCoherentJILiftAsync} from '../src/harmonic/harmonic-ji-lift.mjs';
import {assessET, assessETAsync} from '../src/harmonic/harmonic-et.mjs';
import {chordIdentity} from '../src/chords/chord-identity.mjs';
import {projectChord} from '../src/chords/chord-projection.mjs';
import {makeJIInterpretation} from '../src/harmonic/harmonic-ji-chords.mjs';
import {
  searchChordApproximations,
  searchChordApproximationsAsync
} from '../src/harmonic/harmonic-approximations.mjs';
import {searchCheckpoint} from '../src/harmonic/harmonic-cooperative.mjs';
import {
  createHarmonicJobDispatcher,
  createHarmonicCatalogueJobs,
  harmonicJobContextId
} from '../src/harmonic/harmonic-catalogue-jobs.mjs';

const state = makeState('meantone'),
  small = {state, categories: [], directInputs: ['4:5:6']};
const envelope = (id, payload = small, kind = 'query') => ({
  requestId: id,
  contextId: harmonicJobContextId(kind, payload),
  kind,
  payload
});
const messages = [],
  dispatcher = createHarmonicJobDispatcher({emit: event => messages.push(event), cacheEntries: 2});
await dispatcher.dispatch(envelope(1));
await dispatcher.dispatch(envelope(2));
assert.equal(messages.at(-1).cached, true);
assert.equal(dispatcher.metrics.hits, 1);
await dispatcher.dispatch(envelope(3, {...small, state: {...state, g: 700}}));
assert.equal(messages.at(-1).cached, false);
await dispatcher.dispatch(
  envelope(4, {
    ...small,
    targetSpec: {
      oddLimit: 9,
      primeFilter: state.basis,
      mappingSubgroup: state.basis,
      representationPolicy: 'octave'
    }
  })
);
assert.equal(messages.at(-1).cached, false);
assert.equal(dispatcher.metrics.entries, 2);
await dispatcher.dispatch(envelope(5, {state, categories: []}));
assert.equal(messages.at(-1).result.status, 'complete-empty');
await dispatcher.dispatch({...envelope(6), contextId: 'wrong'});
assert.equal(messages.at(-1).type, 'error');
const capped = createHarmonicJobDispatcher({emit: event => messages.push(event), maxCacheRows: 1});
const pair = {...small, directInputs: ['4:5:6', '4:6:7']};
await capped.dispatch(envelope(1, pair));
await capped.dispatch(envelope(2, pair));
assert.equal(capped.metrics.hits, 0);
assert.equal(capped.metrics.skippedLarge, 2);
assert.equal(capped.metrics.entries, 0, 'oversized results do not occupy empty LRU slots');
const partial = {state, categories: ['chords'], maxRecords: 1};
await dispatcher.dispatch(envelope(7, partial));
await dispatcher.dispatch(envelope(8, partial));
assert.equal(messages.at(-1).result.status, 'incomplete');
assert.equal(messages.at(-1).cached, false);
const before = messages.length,
  old = dispatcher.dispatch(envelope(9, {state, categories: ['chords']}));
await dispatcher.dispatch(envelope(10));
await old;
assert.equal(
  messages.slice(before).some(event => event.requestId === 9 && event.type === 'complete'),
  false
);
dispatcher.destroy();
await dispatcher.dispatch(envelope(11));
assert.equal(messages.at(-1).requestId, 10);

let fake = {
  sent: [],
  postMessage(value) {
    this.sent.push(value);
  },
  terminate() {
    this.terminated = true;
  }
};
const accepted = [],
  client = createHarmonicCatalogueJobs({
    workerFactory: () => fake,
    onMessage: event => accepted.push(event)
  });
const oldJob = client.run('query', small),
  newJob = client.run('query', {...small, state: {...state, g: 700}});
assert.equal((await oldJob.promise).status, 'cancelled');
fake.onmessage({data: {...oldJob, kind: 'query', type: 'complete', result: {wrong: true}}});
assert.equal(accepted.length, 0);
fake.onmessage({
  data: {requestId: newJob.requestId, contextId: oldJob.contextId, kind: 'query', type: 'complete'}
});
assert.equal(accepted.length, 0);
fake.onmessage({
  data: {
    requestId: newJob.requestId,
    contextId: newJob.contextId,
    kind: 'query',
    type: 'complete',
    result: {ok: true}
  }
});
assert.equal((await newJob.promise).result.ok, true);
assert.equal(accepted.length, 1);
const cancelled = client.run('query', small);
cancelled.cancel();
assert.equal((await cancelled.promise).status, 'cancelled');
const abandoned = client.run('query', small);
client.destroy();
assert.equal((await abandoned.promise).status, 'cancelled');
assert.ok(fake.terminated);
assert.throws(() => client.run('query', small), /destroyed/);

const fallback = createHarmonicCatalogueJobs({workerFactory: () => null});
const failingWorker = {
  postMessage() {
    throw Error('Worker transport failed');
  },
  terminate() {}
};
const recovered = createHarmonicCatalogueJobs({workerFactory: () => failingWorker});
assert.equal((await recovered.run('query', small).promise).result.status, 'complete');
recovered.destroy();
function nativeWorker() {
  const node = new NodeWorker(
    new URL('./fixtures/harmonic-discovery/worker-harness.mjs', import.meta.url)
  );
  const wrapper = {
    postMessage: data => node.postMessage(data),
    terminate: () => node.terminate(),
    onmessage: null,
    onerror: null
  };
  node.on('message', data => wrapper.onmessage?.({data}));
  node.on('error', error => wrapper.onerror?.(error));
  return wrapper;
}
const worker = createHarmonicCatalogueJobs({workerFactory: nativeWorker});
for (const [kind, payload] of [
  ['query', small],
  ['query', {state, categories: ['chords'], chordSizes: [3]}],
  [
    'approximations',
    {
      state,
      approximationChords: ['1:7/4'],
      approximationOptions: {
        generatorBound: 1,
        memberCandidateLimit: 8,
        combinationCap: 100,
        cancellationCap: 1000,
        minimumImprovementCents: 0
      }
    }
  ]
]) {
  const a = await worker.run(kind, payload).promise,
    b = await fallback.run(kind, payload).promise;
  assert.equal(a.type, 'complete');
  assert.deepEqual(a.result, b.result, `${kind} actual Worker/fallback parity`);
}
const pending = fallback.run('query', {state, categories: ['chords']});
fallback.destroy();
assert.equal((await pending.promise).status, 'cancelled');
worker.destroy();

const targets = targetSet({
    oddLimit: 27,
    primeFilter: state.basis,
    mappingSubgroup: state.basis,
    representationPolicy: 'octave'
  }),
  index = buildDyadIndex(targets, state);
const shape = projectChord(state, chordIdentity('1:9/8:3/2:5/3')).shapeIdentities.octave;
assert.deepEqual(await findCoherentJILiftAsync(shape, index), findCoherentJILift(shape, index));
assert.deepEqual(await assessETAsync(shape, index), assessET(shape, index));
// Check actual generator checkpoints, not just cancellation between records.
const steps = enumerateDyadicShapeSteps(index, {sizes: [3, 4], maxCandidateShapes: 100});
let checkpoints = 0;
for (const value of steps) if (value === searchCheckpoint) checkpoints++;
assert.ok(checkpoints > 0, 'graph traversal yields at 256 domain checks/nodes');
const interpretation = makeJIInterpretation('4:5:6:7'),
  options = {state, generatorBound: 8, memberCandidateLimit: 16, combinationCap: 1000};
assert.deepEqual(
  await searchChordApproximationsAsync(interpretation, options),
  searchChordApproximations(interpretation, options)
);
const abort = new AbortController();
let approximationCheckpoints = 0;
const cancelledSearch = await searchChordApproximationsAsync(
  interpretation,
  {...options, signal: abort.signal},
  {
    yieldControl: async () => {
      approximationCheckpoints++;
      abort.abort();
    }
  }
);
assert.equal(approximationCheckpoints, 1);
assert.equal(cancelledSearch.status, 'cancelled');
assert.equal(cancelledSearch.completeness.complete, false);
assert.equal(cancelledSearch.completeness.combinationsExplored, 256);
console.log(
  'Actual Worker/fallback parity, stale jobs, cancellation, errors, bounded cache scopes and cooperative algorithms passed.'
);
