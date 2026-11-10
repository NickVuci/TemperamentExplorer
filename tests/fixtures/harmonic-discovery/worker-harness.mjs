import {parentPort} from 'node:worker_threads';
globalThis.self = {postMessage: message => parentPort.postMessage(message)};
await import('../../../src/chord-worker.mjs');
parentPort.on('message', data => void self.onmessage({data}));
