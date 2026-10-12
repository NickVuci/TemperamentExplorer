import {BoundedCache, immutable} from '../core/cache.mjs';
import {createChordWorker} from '../workers.mjs';
import {catalogueContext, queryCatalogue} from './harmonic-catalogue.mjs';
import {canonicalHarmonicJSON} from './harmonic-types.mjs';

const kinds = new Set(['query', 'approximations']);
function jobQuery(kind, payload) {
  if (!kinds.has(kind)) throw Error('Unknown harmonic job kind.');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw Error('Harmonic job needs a query payload.');
  return kind === 'query' ? payload : {...payload, categories: ['approximations']};
}
export function harmonicJobContextId(kind, payload) {
  return catalogueContext(jobQuery(kind, payload)).id;
}

/** One dispatcher per Worker/workspace; no shared mutable result list. */
export function createHarmonicJobDispatcher({
  emit = () => {},
  cacheEntries = 8,
  maxCacheRows = 5000
} = {}) {
  if (
    !Number.isInteger(cacheEntries) ||
    cacheEntries < 1 ||
    cacheEntries > 16 ||
    !Number.isInteger(maxCacheRows) ||
    maxCacheRows < 1 ||
    maxCacheRows > 20000
  )
    throw Error('Invalid harmonic cache bounds.');
  const cache = new BoundedCache(cacheEntries);
  let current = null,
    destroyed = false;
  const metrics = {hits: 0, misses: 0, stored: 0, skippedLarge: 0};
  const cancel = () => {
    if (current) current.cancelled = true;
  };
  async function dispatch(envelope) {
    if (destroyed) return;
    if (envelope?.kind === 'cancel') {
      if (
        current &&
        envelope.requestId === current.requestId &&
        envelope.contextId === current.contextId
      )
        cancel();
      return;
    }
    cancel();
    const job = {requestId: envelope?.requestId, contextId: envelope?.contextId, cancelled: false};
    current = job;
    const send = (type, extra) => {
      if (!destroyed && current === job && !job.cancelled)
        emit(
          immutable({
            requestId: job.requestId,
            contextId: job.contextId,
            kind: envelope.kind,
            type,
            ...extra
          })
        );
    };
    try {
      if (
        !Number.isSafeInteger(job.requestId) ||
        job.requestId < 1 ||
        typeof job.contextId !== 'string'
      )
        throw Error('Invalid harmonic job envelope.');
      const query = jobQuery(envelope.kind, envelope.payload),
        contextId = catalogueContext(query).id;
      if (contextId !== job.contextId) throw Error('Harmonic job context mismatch.');
      const key = canonicalHarmonicJSON([envelope.kind, contextId, query.cursor ?? null]);
      if (cache.entries.has(key)) {
        const result = cache.get(key, () => null);
        metrics.hits++;
        send('complete', {result, cached: true});
        return;
      }
      metrics.misses++;
      const result = await queryCatalogue(query, {
        shouldCancel: () => destroyed || current !== job || job.cancelled,
        onProgress: progress => send('progress', {progress})
      });
      if (destroyed || current !== job || job.cancelled) return;
      if (result.complete) {
        if (result.items.length <= maxCacheRows) {
          cache.get(key, () => result);
          metrics.stored++;
        } else metrics.skippedLarge++;
      }
      send('complete', {result, cached: false});
    } catch (error) {
      send('error', {message: error.message});
    }
  }
  return {
    dispatch,
    cancel,
    destroy() {
      destroyed = true;
      cancel();
      cache.entries.clear();
    },
    get metrics() {
      return {...metrics, entries: cache.entries.size, maxCacheRows, cacheEntries};
    }
  };
}

/** Latest-job controller, used identically with a browser Worker or fallback. */
export function createSearchJobs({
  workerFactory,
  onMessage = () => {},
  getContextId = harmonicJobContextId,
  dispatcherFactory = createHarmonicJobDispatcher
} = {}) {
  let sequence = 0,
    active = null,
    destroyed = false,
    worker = null;
  const fallback = dispatcherFactory({emit: receive});
  function receive(message) {
    if (
      destroyed ||
      !active ||
      message.requestId !== active.requestId ||
      message.contextId !== active.contextId ||
      message.kind !== active.kind
    )
      return;
    const terminal = message.type === 'complete' || message.type === 'error';
    if (terminal) {
      const previous = active;
      active = null;
      previous.resolve(message);
    }
    onMessage(message);
  }
  function detachWorker() {
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate?.();
      worker = null;
    }
  }
  function workerFailure() {
    detachWorker();
    if (active) void fallback.dispatch(active.envelope);
  }
  try {
    worker = workerFactory
      ? workerFactory()
      : typeof Worker === 'function'
        ? createChordWorker()
        : null;
    if (worker) {
      worker.onmessage = event => receive(event.data);
      worker.onerror = workerFailure;
    }
  } catch {
    worker = null;
  }
  function send(envelope) {
    if (worker) {
      try {
        worker.postMessage(envelope);
      } catch {
        workerFailure();
      }
    } else void fallback.dispatch(envelope);
  }
  function cancel() {
    if (!active) return;
    const previous = active;
    active = null;
    send({requestId: previous.requestId, contextId: previous.contextId, kind: 'cancel'});
    previous.resolve(
      immutable({
        requestId: previous.requestId,
        contextId: previous.contextId,
        kind: previous.kind,
        type: 'complete',
        status: 'cancelled'
      })
    );
  }
  return {
    run(kind, payload) {
      if (destroyed) throw Error('Harmonic jobs controller is destroyed.');
      const contextId = getContextId(kind, payload);
      cancel();
      const requestId = ++sequence;
      const envelope = {
        requestId,
        contextId,
        kind,
        payload: JSON.parse(canonicalHarmonicJSON(payload))
      };
      let resolve;
      const promise = new Promise(done => {
        resolve = done;
      });
      active = {requestId, contextId, kind, resolve, envelope};
      send(envelope);
      return {
        requestId,
        contextId,
        promise,
        cancel: () => {
          if (active?.requestId === requestId) cancel();
        }
      };
    },
    cancel,
    destroy() {
      cancel();
      destroyed = true;
      detachWorker();
      fallback.destroy();
    },
    get usingWorker() {
      return !!worker;
    },
    get cacheMetrics() {
      return fallback.metrics;
    }
  };
}

export const createHarmonicCatalogueJobs = options => createSearchJobs(options);
