import {parentPort} from 'node:worker_threads';
globalThis.self={postMessage:message=>parentPort.postMessage(message)};
await import('../../../dist/chord-v2-worker.mjs');
parentPort.on('message',data=>void self.onmessage({data}));
