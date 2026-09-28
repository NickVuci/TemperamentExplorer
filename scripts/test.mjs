import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const files = (await readdir('tests')).filter(file => file.endsWith('.mjs')).sort();
let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['tests/' + file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed++;
    console.error(`FAIL ${file}\n${(result.stderr || result.stdout).slice(0, 1800)}`);
  } else console.log(`PASS ${file}`);
}
console.log(`${files.length - failed}/${files.length} suites passed`);
process.exitCode = failed ? 1 : 0;
