import {build,transform} from 'esbuild';
import {createHash} from 'node:crypto';
import {copyFile,mkdir,readFile,readdir,rm,writeFile} from 'node:fs/promises';
// Builds the static site from src/ into site/; any static file host can serve it.
const out='site';
await rm(out,{recursive:true,force:true});await mkdir(out);
for(const name of ['index.html','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png'])await copyFile('src/'+name,`${out}/${name}`);
// The page and each module worker load as one bundle, removing the dependency-request
// waterfall. Bundling also validates all static imports. Workers are created from
// src/workers.mjs, whose URLs resolve beside the app bundle at the site root.
await build({entryPoints:['app','comma-worker','chord-worker'].map(name=>`src/${name}.mjs`),bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,outdir:out,outExtension:{'.js':'.mjs'}});
await writeFile(`${out}/style.css`,(await transform(await readFile('src/style.css','utf8'),{loader:'css',minify:true,target:'es2022'})).code);
// The service worker precaches the app shell. Its version hashes the shell, so any
// change makes browsers install the new worker and re-cache everything together.
const shell=['index.html','style.css','app.mjs','comma-worker.mjs','chord-worker.mjs','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png'];
const hash=createHash('sha256');for(const name of shell)hash.update(name).update(await readFile(`${out}/${name}`));
const version=hash.digest('hex').slice(0,16),source=await readFile('src/sw.js','utf8');
const sw=source.replace("const VERSION='dev';",`const VERSION='${version}';`).replace('const SHELL=[];',`const SHELL=${JSON.stringify(['./',...shell.map(name=>'./'+name)])};`);
if(sw===source||!sw.includes(version)||sw.includes('const SHELL=[];'))throw Error('src/sw.js no longer has the VERSION and SHELL placeholders.');
await writeFile(`${out}/sw.js`,sw);
console.log(`Static site built in ${out}/ with ${(await readdir(out)).length} files; service worker version ${version}.`);
