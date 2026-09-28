import {createChordV2Workspace} from './chord-v2-ui.mjs';
import {adaptChordCatalogueSession,resolveDeferredLegacySelection} from './chord-session-v2-adapter.mjs';

// One engine. The envelope preserves older session data without executing it.
export function createChordCatalogueWorkspace(options){
 const workspace=createChordV2Workspace(options);
 let legacy={config:null,selection:null,spelling:''},deferred=null;
 function finishRestore(){
  if(!deferred)return;
  const pending=deferred;deferred=null;
  // Session restore precedes assignment of the app's temperament/layout state.
  // Only resolve roots when the caller next synchronizes the restored workspace.
  const model=workspace.model();
  const selection=resolveDeferredLegacySelection(pending,model.analysis,model.text);
  if(selection.selected)workspace.restore({...workspace.serialize(),...selection});
 }
 function restore(data){
  const adapted=adaptChordCatalogueSession(data);
  workspace.restore(data==null?null:adapted.engineV2);
  legacy=adapted.legacy;deferred=adapted.deferred;
 }
 return {
  sync:()=>{finishRestore();workspace.sync();},
  model:()=>{finishRestore();return workspace.model();},
  render:()=>{finishRestore();return workspace.render();},
  change:el=>{finishRestore();return workspace.change(el);},
  click:el=>{finishRestore();return workspace.click(el);},
  clear:()=>{deferred=null;workspace.clear();},restore,
  serialize:()=>({...structuredClone(legacy),engineV2:workspace.serialize()}),
  restoreLegacy:data=>{if(data&&typeof data.text==='string')restore({config:{custom:data.text}});},
  destroy:()=>{deferred=null;workspace.destroy();}
 };
}
