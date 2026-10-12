import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import vm from 'node:vm';
// Builds site/ and checks it is a complete static site with an offline shell.
const built=spawnSync(process.execPath,['scripts/build.mjs'],{encoding:'utf8'});assert.equal(built.status,0,built.stderr);
const site=name=>new URL('../site/'+name,import.meta.url),text=name=>readFileSync(site(name),'utf8');
assert.deepEqual(readdirSync(site('')).sort(),['app.mjs','chord-v2-worker.mjs','comma-worker.mjs','icon-192.png','icon-512.png','icon.svg','index.html','manifest.webmanifest','style.css','sw.js'],'site/ holds only the app shell');
const html=text('index.html');
for(const ref of ['./manifest.webmanifest','./icon.svg','./icon-192.png','./app.mjs','./style.css'])assert.ok(html.includes(`"${ref}"`),ref+' is linked from the page');
const manifest=JSON.parse(text('manifest.webmanifest'));assert.equal(manifest.start_url,'./');assert.equal(manifest.display,'standalone');
for(const icon of manifest.icons){assert.ok(existsSync(site(icon.src)),icon.src);if(icon.type==='image/png'){const png=readFileSync(site(icon.src)),[w,h]=icon.sizes.split('x').map(Number);assert.deepEqual([png.readUInt32BE(16),png.readUInt32BE(20)],[w,h],icon.src+' matches its declared size');}}
assert.ok(manifest.icons.some(icon=>icon.purpose==='maskable'));
// The page and module workers are self-contained bundles, and nothing calls a server API.
for(const name of ['app.mjs','comma-worker.mjs','chord-v2-worker.mjs']){const code=text(name);assert.doesNotMatch(code,/(?:\bfrom|\bimport)\s*["']\.\.?\//,name+' is bundled');assert.doesNotMatch(code,/\/api\//,name+' has no server API calls');}
const sw=text('sw.js'),version=sw.match(/const VERSION='([0-9a-f]{16})';/)?.[1],shell=JSON.parse(sw.match(/const SHELL=(\[.*\]);/)[1]);
assert.ok(version,'the build stamps the service worker version');
for(const url of shell)if(url!=='./')assert.ok(existsSync(site(url.slice(2))),url+' is precached and exists');
assert.ok(['./','./index.html','./app.mjs','./comma-worker.mjs','./chord-v2-worker.mjs','./style.css'].every(url=>shell.includes(url)));
console.log('Static site build links its manifest and icons, bundles the page and workers, and stamps the service worker shell.');

// Run the built service worker against an in-memory Cache Storage and network.
const base='https://example.test/lab/',net={online:true,calls:0},named=new Map(),listeners={};
const href=r=>new URL(typeof r==='string'?r:r.url,base).href,strip=u=>{const x=new URL(u);x.search='';return x.href;};
class LocalRequest extends Request{constructor(input,init){super(typeof input==='string'?new URL(input,base):input,init);}}
const network=async request=>{net.calls++;if(!net.online)throw TypeError('Failed to fetch');return new Response('network '+href(request));};
const open=name=>{if(!named.has(name))named.set(name,new Map());const entries=named.get(name);return {async addAll(requests){for(const r of requests)entries.set(href(r),await network(r));},async put(r,response){entries.set(href(r),response);}};};
const caches={async open(name){return open(name);},async keys(){return [...named.keys()];},async delete(name){return named.delete(name);},
 async match(r,{ignoreSearch=false}={}){const want=ignoreSearch?strip(href(r)):href(r);for(const entries of named.values())for(const [url,response] of entries)if((ignoreSearch?strip(url):url)===want)return response.clone();}};
vm.runInNewContext(sw,{self:{addEventListener:(type,fn)=>listeners[type]=fn,location:new URL(base+'sw.js'),skipWaiting:async()=>{},clients:{claim:async()=>{}}},caches,fetch:network,Request:LocalRequest,Response,URL});
const lifecycle=async type=>{let done;listeners[type]({waitUntil:p=>done=p});await done;};
const request=async(url,{method='GET',mode='cors'}={})=>{let responded=null;const pending=[];const req=new LocalRequest(url,{method});Object.defineProperty(req,'mode',{value:mode});
 listeners.fetch({request:req,respondWith:p=>responded=p,waitUntil:p=>pending.push(p)});const response=responded&&await responded;await Promise.all(pending);return response;};
named.set('temperament-lab-old',new Map());named.set('other-app',new Map());
await lifecycle('install');assert.equal(named.get('temperament-lab-'+version).size,shell.length,'install precaches the shell');
await lifecycle('activate');assert.deepEqual([...named.keys()].sort(),['other-app','temperament-lab-'+version],'activate removes only older app caches');
assert.equal(await (await request('./app.mjs')).text(),'network '+base+'app.mjs','online requests use the network');
await request('./pitch.mjs');assert.ok(named.get('temperament-lab-'+version).has(base+'pitch.mjs'),'fetched files are cached for offline use');
net.online=false;
assert.equal(await (await request('./comma-worker.mjs?v=2')).text(),'network '+base+'comma-worker.mjs','offline requests use the cache');
assert.equal(await (await request('./some/deep/link',{mode:'navigate'})).text(),'network '+base+'index.html','offline navigation opens the cached app');
assert.equal((await request('./missing.mjs')).type,'error','uncached offline requests fail as network errors');
const before=net.calls;assert.equal(await request('https://elsewhere.test/x.js'),null);assert.equal(await request('./app.mjs',{method:'POST'}),null);assert.equal(net.calls,before,'other origins and non-GET requests pass through');
assert.equal((await request('https://fonts.googleapis.com/css2?family=DM+Sans')).type,'error','uncached fonts fail offline as network errors');
net.online=true;await request('https://fonts.gstatic.com/s/dmsans.woff2');net.online=false;assert.equal(await (await request('https://fonts.gstatic.com/s/dmsans.woff2')).text(),'network https://fonts.gstatic.com/s/dmsans.woff2','fonts fetched online stay available offline');
console.log('Service worker precaches the shell, prefers the network, serves offline from cache and removes old app caches.');
