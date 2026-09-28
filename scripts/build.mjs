import {build,transform} from 'esbuild';
import {readdir,readFile,mkdir,writeFile} from 'node:fs/promises';
const assets={};
for(const name of await readdir('dist'))if(/\.(html|css|mjs)$/.test(name))assets['/'+name]={body:await readFile('dist/'+name,'utf8'),type:name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8'};
// dist contains authored source: bundle in memory, never overwrite those files.
// One browser entry removes the dependency-request waterfall; compatibility
// module URLs remain available. Building also validates all static imports.
const frontend=await build({entryPoints:['dist/app.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,write:false});
assets['/app.mjs'].body=frontend.outputFiles[0].text;
assets['/style.css'].body=(await transform(assets['/style.css'].body,{loader:'css',minify:true,target:'es2022'})).code;
await build({entryPoints:['server/index.mjs'],bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:'dist/server/index.js',plugins:[{name:'site-assets',setup(b){b.onResolve({filter:/^site-assets$/},()=>({path:'assets',namespace:'embedded'}));b.onLoad({filter:/.*/,namespace:'embedded'},()=>({contents:'export default '+JSON.stringify(assets),loader:'js'}));}}]});
await mkdir('dist/.openai',{recursive:true});await writeFile('dist/.openai/hosting.json',await readFile('.openai/hosting.json'));
console.log('Worker built with '+Object.keys(assets).length+' app assets.');
