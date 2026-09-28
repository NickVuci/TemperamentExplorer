const columns='id, name, state, revision, updated_at';
const record=r=>({id:r.id,name:r.name,state:JSON.parse(r.state),revision:r.revision,updatedAt:r.updated_at});
export async function listPresets(db,owner){const r=await db.prepare(`SELECT ${columns} FROM temperament_presets WHERE owner = ? ORDER BY name COLLATE NOCASE, id`).bind(owner).all();return r.results.map(record);}
export async function savePreset(db,owner,id,state,revision){
 const old=await db.prepare('SELECT revision FROM temperament_presets WHERE id = ? AND owner = ?').bind(id,owner).first();
 const now=new Date().toISOString();let result;
 if(old){if(old.revision!==revision)return null;result=await db.prepare('UPDATE temperament_presets SET name = ?, state = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND owner = ? AND revision = ?').bind(state.name,JSON.stringify(state),now,id,owner,revision).run();}
 else{if(revision!==0)return null;result=await db.prepare('INSERT OR IGNORE INTO temperament_presets (id, owner, name, state, revision, updated_at) VALUES (?, ?, ?, ?, 1, ?)').bind(id,owner,state.name,JSON.stringify(state),now).run();}
 if(result.meta.changes!==1)return null;
 return {id,name:state.name,state,revision:revision+1,updatedAt:now};
}

export async function deletePreset(db,owner,id,revision){const r=await db.prepare('DELETE FROM temperament_presets WHERE id = ? AND owner = ? AND revision = ?').bind(id,owner,revision).run();return r.meta.changes===1;}
