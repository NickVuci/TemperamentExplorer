/** Drive one algorithm in either synchronous compatibility or cooperative mode. */
export const searchCheckpoint = Object.freeze({type: 'search-checkpoint'});
// Browsers yield through a zero-delay timer. Node (tests and tools) has setImmediate, which
// avoids timer resolution (about 15 ms on Windows) on every yield.
export const eventLoopBoundary = globalThis.setImmediate
  ? () => new Promise(resolve => globalThis.setImmediate(resolve))
  : () => new Promise(resolve => setTimeout(resolve, 0));
export function finishSearch(iterator) {
  let step;
  do {
    step = iterator.next();
  } while (!step.done);
  return step.value;
}
export async function finishSearchAsync(
  iterator,
  {yieldControl = eventLoopBoundary, onCheckpoint} = {}
) {
  try {
    let step;
    while (!(step = iterator.next()).done) {
      onCheckpoint?.(step.value);
      await yieldControl();
    }
    return step.value;
  } finally {
    iterator.return?.();
  }
}
