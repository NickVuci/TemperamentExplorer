import {presetSnapshot} from './preset-data.mjs';
import {layoutPresetSnapshot,mappingKey} from './layout-preset-data.mjs';
import {shapePresetSnapshot,MAX_SAVED_SHAPES} from './shape-preset-data.mjs';
// Saved temperaments, layouts, chord shapes and each mapping's default layout live in this
// browser's storage under one key. Every change is a single write, and optimistic
// revisions still reject edits made from a stale view in another tab.
export const PRESET_STORAGE_KEY='temperament-lab-presets';
export const PRESET_BACKUP_FORMAT='temperament-lab-presets-v1';
const MAX_DEFAULTS=256;
const kinds={
 temperament:{list:'temperaments',snapshot:presetSnapshot,changed:'This preset changed in another session. Refresh the preset list before saving.',removed:'This preset changed or was removed. Refresh the saved list before deleting.'},
 layout:{list:'layouts',snapshot:layoutPresetSnapshot,changed:'This layout changed in another session. Refresh the layout list before saving.',removed:'This layout changed or was removed. Refresh the layout list before deleting.'},
 shape:{list:'shapes',snapshot:shapePresetSnapshot,changed:'This shape changed in another session. Refresh the shape list before saving.',removed:'This shape changed or was removed. Refresh the shape list before deleting.'}
};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const byName=(a,b)=>a.name.localeCompare(b.name,undefined,{sensitivity:'base'})||(a.id<b.id?-1:a.id>b.id?1:0);
const isLayoutRecord=p=>Boolean(p?.state?.context&&p?.state?.config);

export function createPresetStore({storage,now=()=>new Date().toISOString()}={}){
 const blocked='Saved presets need browser storage, which this browser has blocked.';
 // Reading localStorage itself throws when site data is blocked.
 function target(){let s;try{s=storage??globalThis.localStorage;}catch{}if(!s)throw Error(blocked);return s;}
 function read(){
  const s=target();let raw;try{raw=s.getItem(PRESET_STORAGE_KEY);}catch{throw Error(blocked);}
  if(raw==null)return {temperaments:[],layouts:[],shapes:[],layoutDefaults:{defaults:{},revision:0}};
  try{const data=JSON.parse(raw);if(!Array.isArray(data.temperaments)||!Array.isArray(data.layouts)||!data.layoutDefaults||typeof data.layoutDefaults.defaults!=='object'||!Number.isSafeInteger(data.layoutDefaults.revision))throw 0;
   if(data.shapes===undefined)data.shapes=[];
   if(!Array.isArray(data.shapes)||data.shapes.length>MAX_SAVED_SHAPES||data.shapes.some(p=>!uuid.test(p?.id)||!Number.isSafeInteger(p.revision)||p.revision<1||p.state?.version!==1))throw 0;
   return data;}
  catch{throw Error('Saved presets in this browser could not be read.');}
 }
 function write(data){try{target().setItem(PRESET_STORAGE_KEY,JSON.stringify(data));}catch(e){throw Error(e?.name==='QuotaExceededError'?'Browser storage is full. Export your presets, then delete ones you no longer need.':'Saved presets could not be written to browser storage.');}}
 const liveDefaults=data=>Object.fromEntries(Object.entries(data.layoutDefaults.defaults).filter(([key,id])=>data.layouts.some(p=>p.id===id&&mappingKey(p.state.context)===key)));
 function put(data,kind,id,input,revision){
  const k=kinds[kind],list=data[k.list],old=list.find(p=>p.id===id);
  if(kind==='shape'&&!old&&list.length>=MAX_SAVED_SHAPES)throw Error(`Save at most ${MAX_SAVED_SHAPES} shapes. Delete an older shape first.`);
  const snapshot=k.snapshot(input.name,input.state);
  const record={id,name:snapshot.name,state:snapshot,revision:revision??(old?.revision||0)+1,updatedAt:now()};
  data[k.list]=[...list.filter(p=>p.id!==id),record];return record;
 }
 return {
  async list(kind){const items=read()[kinds[kind].list];
   if(kind==='shape')try{return items.map(p=>({...p,state:shapePresetSnapshot(p.name,p.state)})).sort(byName);}catch{throw Error('Saved shapes in this browser could not be read.');}
   return items.sort(byName);},
  async save(kind,id,{name,state,revision}){
   if(!uuid.test(id))throw Error('Invalid preset id.');if(!Number.isSafeInteger(revision)||revision<0)throw Error('Invalid preset revision.');
   const data=read(),old=data[kinds[kind].list].find(p=>p.id===id);if((old?.revision||0)!==revision)throw Error(kinds[kind].changed);
   const record=put(data,kind,id,{name,state},revision+1);write(data);return record;
  },
  async remove(kind,id,revision){
   const k=kinds[kind],data=read(),old=data[k.list].find(p=>p.id===id);if(!old||old.revision!==revision)throw Error(k.removed);
   data[k.list]=data[k.list].filter(p=>p.id!==id);
   if(kind==='layout'){const defaults=Object.fromEntries(Object.entries(data.layoutDefaults.defaults).filter(([,value])=>value!==id));if(Object.keys(defaults).length!==Object.keys(data.layoutDefaults.defaults).length)data.layoutDefaults={defaults,revision:data.layoutDefaults.revision+1};}
   write(data);return true;
  },
  async layoutDefaults(){const data=read();return {defaults:liveDefaults(data),revision:data.layoutDefaults.revision};},
  async setLayoutDefault(key,layoutId,revision){
   const data=read(),layout=data.layouts.find(p=>p.id===layoutId);
   if(!layout)throw Error('Save this layout before making it the default.');
   if(mappingKey(layout.state.context)!==key)throw Error('This layout does not belong to the selected temperament.');
   if(data.layoutDefaults.revision!==revision)throw Error('Default layouts changed in another session. Refresh and try again.');
   const defaults={...liveDefaults(data),[key]:layoutId};if(Object.keys(defaults).length>MAX_DEFAULTS)throw Error('Too many temperament defaults. Remove an older saved layout first.');
   data.layoutDefaults={defaults,revision:revision+1};write(data);return {defaults,revision:revision+1};
  },
  async exportBackup(){const data=read();return {format:PRESET_BACKUP_FORMAT,exportedAt:now(),temperaments:data.temperaments.sort(byName),layouts:data.layouts.sort(byName),...(data.shapes.length?{shapes:data.shapes.sort(byName)}:{}),layoutDefaults:liveDefaults(data)};},
  // Imported records replace saved records with the same id. Files saved from the
  // former site preset API ({presets} or {defaults}) import the same way.
  async importBackup(input){
   const legacy=Array.isArray(input?.presets)?input.presets:[],defaults=input?.format===PRESET_BACKUP_FORMAT?input.layoutDefaults:input?.defaults;
   if(!input||typeof input!=='object'||input.format!==PRESET_BACKUP_FORMAT&&!legacy.length&&!input.defaults)throw Error('Choose a Temperament Lab presets file.');
   if(input.shapes!==undefined&&!Array.isArray(input.shapes))throw Error('Invalid saved-shape backup section.');
   const incoming={temperament:[...(Array.isArray(input.temperaments)?input.temperaments:[]),...legacy.filter(p=>!isLayoutRecord(p))],layout:[...(Array.isArray(input.layouts)?input.layouts:[]),...legacy.filter(isLayoutRecord)],shape:input.shapes??[]};
   const data=read(),result={temperaments:0,layouts:0,...(input.shapes!==undefined?{shapes:0}:{}),defaults:0,skipped:0};
   for(const kind of ['temperament','layout','shape'])for(const p of incoming[kind]){try{if(!uuid.test(p?.id))throw 0;put(data,kind,p.id,{name:p.name??p.state?.name,state:p.state});result[kinds[kind].list]++;}catch{result.skipped++;}}
   if(defaults&&typeof defaults==='object'&&!Array.isArray(defaults)){
    const next=liveDefaults(data);
    for(const [key,id] of Object.entries(defaults)){if(data.layouts.some(p=>p.id===id&&mappingKey(p.state.context)===key)&&(key in next||Object.keys(next).length<MAX_DEFAULTS)){next[key]=id;result.defaults++;}else result.skipped++;}
    if(result.defaults)data.layoutDefaults={defaults:next,revision:data.layoutDefaults.revision+1};
   }
   write(data);return result;
  }
 };
}

export const browserPresetStore=createPresetStore();
