/** Drive one algorithm in either synchronous compatibility or cooperative mode. */
export const searchCheckpoint=Object.freeze({type:'search-checkpoint'});
export const eventLoopBoundary=()=>new Promise(resolve=>setTimeout(resolve,0));
export function finishSearch(iterator){let step;do{step=iterator.next();}while(!step.done);return step.value;}
export async function finishSearchAsync(iterator,{yieldControl=eventLoopBoundary,onCheckpoint}={}){
 try{let step;while(!(step=iterator.next()).done){onCheckpoint?.(step.value);await yieldControl();}return step.value;}
 finally{iterator.return?.();}
}
