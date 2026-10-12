// Worker scripts sit beside this module in src/ and beside the app bundle in site/,
// so these URLs resolve in development and in the built site alike.
export const createCommaWorker=()=>new Worker(new URL('./comma-worker.mjs',import.meta.url),{type:'module'});
export const createChordWorker=()=>new Worker(new URL('./chord-worker.mjs',import.meta.url),{type:'module'});
