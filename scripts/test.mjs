import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';

// Suites are independent processes, so they run concurrently. TEST_CONCURRENCY caps
// the pool on small machines, where CPU-heavy suites would slow each other down.
const files = (await readdir('tests')).filter(file => file.endsWith('.mjs')).sort();
const concurrency = Math.max(1, Number(process.env.TEST_CONCURRENCY) || availableParallelism());

function run(file) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, ['tests/' + file]);
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('close', status => resolve({ file, status, output: stderr || stdout }));
  });
}

let next = 0, failed = 0;
async function worker() {
  while (next < files.length) {
    const result = await run(files[next++]);
    if (result.status !== 0) {
      failed++;
      console.error(`FAIL ${result.file}\n${result.output.slice(0, 1800)}`);
    } else console.log(`PASS ${result.file}`);
  }
}
const started = Date.now();
await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
console.log(`${files.length - failed}/${files.length} suites passed in ${((Date.now() - started) / 1000).toFixed(1)} s`);
process.exitCode = failed ? 1 : 0;
