import {layoutPresetSnapshot} from '../dist/layout-preset-data.mjs';
import {presetSnapshot} from '../dist/preset-data.mjs';
import {listPresets,savePreset,deletePreset} from './presets.mjs';
import assets from 'site-assets';
const presetScope='temperament-lab-site';
const layoutPresetScope='temperament-lab-layout-presets';
const layoutDefaultsScope='temperament-lab-layout-defaults';
const layoutDefaultsId='ffffffff-ffff-4fff-bfff-ffffffffffff';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export default {async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname.startsWith('/api/')){
  if(!env.DB)return json({error:'Preset storage is unavailable. Please retry.'},503);
  try{
   if(url.pathname==='/api/layout-defaults'){
    if(request.method==='GET'){
     const [records,layouts]=await Promise.all([listPresets(env.DB,layoutDefaultsScope),listPresets(env.DB,layoutPresetScope)]),record=records.find(p=>p.id===layoutDefaultsId),stored=record?.state?.defaults;
     const defaults=stored&&typeof stored==='object'&&!Array.isArray(stored)?Object.fromEntries(Object.entries(stored).filter(([key,id])=>layouts.some(p=>p.id===id&&JSON.stringify([p.state.context.basis,p.state.context.rows])===key))):{};
     return json({defaults,revision:record?.revision||0});
    }
    if(request.method==='PUT'){
     if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'Use this app to set default layouts.'},403);
     if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Expected a JSON layout default.'},415);
     let body;try{const raw=await request.text();if(raw.length>48000)return json({error:'Layout default is too large.'},413);body=JSON.parse(raw);}catch{return json({error:'Invalid layout default.'},400);}
     if(!Number.isSafeInteger(body?.revision)||body.revision<0||typeof body.mappingKey!=='string'||body.mappingKey.length>16000||typeof body.layoutId!=='string'||!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(body.layoutId))return json({error:'Invalid layout default.'},400);
     const layout=(await listPresets(env.DB,layoutPresetScope)).find(p=>p.id===body.layoutId);if(!layout)return json({error:'Save this layout before making it the default.'},404);
     if(JSON.stringify([layout.state.context.basis,layout.state.context.rows])!==body.mappingKey)return json({error:'This layout does not belong to the selected temperament.'},400);
     const records=await listPresets(env.DB,layoutDefaultsScope),record=records.find(p=>p.id===layoutDefaultsId),revision=record?.revision||0;
     if(revision!==body.revision)return json({error:'Default layouts changed in another session. Refresh and try again.'},409);
     const defaults=record?.state?.defaults&&typeof record.state.defaults==='object'&&!Array.isArray(record.state.defaults)?record.state.defaults:{};
     const next={...defaults,[body.mappingKey]:body.layoutId};if(Object.keys(next).length>256)return json({error:'Too many temperament defaults. Remove an older saved layout first.'},413);
     const saved=await savePreset(env.DB,layoutDefaultsScope,layoutDefaultsId,{name:'Layout defaults',defaults:next},revision);
     return saved?json({defaults:next,revision:saved.revision}):json({error:'Default layouts changed in another session. Refresh and try again.'},409);
    }
    return json({error:'Method not allowed.'},405);
   }
   const layoutRequest=url.pathname==='/api/layout-presets'||url.pathname.startsWith('/api/layout-presets/'),scope=layoutRequest?layoutPresetScope:presetScope,path=layoutRequest?url.pathname.replace('/api/layout-presets','/api/presets'):url.pathname;
   if(path==='/api/presets'&&request.method==='GET')return json({presets:await listPresets(env.DB,scope)});
   const match=path.match(/^\/api\/presets\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
   if(match&&request.method==='DELETE'){
    if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'Use this app to delete presets.'},403);
    const raw=url.searchParams.get('revision'),revision=Number(raw);if(!raw||!Number.isSafeInteger(revision)||revision<1)return json({error:'Invalid preset revision.'},400);
    const deleted=await deletePreset(env.DB,scope,match[1],revision);if(deleted&&layoutRequest)try{await clearLayoutDefault(env.DB,match[1]);}catch(e){console.error('Layout default cleanup failed',e);}
    return deleted?json({deleted:true}):json({error:'This preset changed or was removed. Refresh the saved list before deleting.'},409);
   }
   if(match&&request.method==='PUT'){
    if(request.headers.get('Origin')&&request.headers.get('Origin')!==url.origin||request.headers.get('Sec-Fetch-Site')==='cross-site')return json({error:'Use this app to save presets.'},403);
    if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Expected a JSON preset.'},415);
    const reader=request.body?.getReader();if(!reader)return json({error:'Missing preset.'},400);let size=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>48000){await reader.cancel();return json({error:'Preset is too large.'},413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
    let body,state;try{body=JSON.parse(new TextDecoder().decode(bytes));if(!Number.isInteger(body.revision)||body.revision<0)throw Error('Invalid preset revision.');state=(layoutRequest?layoutPresetSnapshot:presetSnapshot)(body.name,body.state);}catch(e){return json({error:e.message},400);}
    const saved=await savePreset(env.DB,scope,match[1],state,body.revision);return saved?json({preset:saved}):json({error:'This preset changed in another session. Refresh the preset list before saving.'},409);
   }
   return json({error:'Not found.'},404);
  }catch(e){console.error('Preset storage error',e);return json({error:'Presets could not be saved or loaded. Please retry.'},503);}
 }
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const asset=assets[url.pathname==='/'?'/index.html':url.pathname];if(!asset)return new Response('Not found',{status:404});
 return new Response(request.method==='HEAD'?null:asset.body,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
}};

async function clearLayoutDefault(db,id){
 const record=(await listPresets(db,layoutDefaultsScope)).find(p=>p.id===layoutDefaultsId);if(!record)return;
 const defaults=record.state?.defaults;if(!defaults||typeof defaults!=='object'||Array.isArray(defaults))return;
 const next=Object.fromEntries(Object.entries(defaults).filter(([,value])=>value!==id));
 if(Object.keys(next).length!==Object.keys(defaults).length)await savePreset(db,layoutDefaultsScope,layoutDefaultsId,{name:'Layout defaults',defaults:next},record.revision);
}
