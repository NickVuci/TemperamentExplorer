// Continuous pointer playing without replacing the SVG during a gesture.
// `onInput` is an optional logical-input seam for recording and practice: each sounding
// hold reports one {type:'down'} and later one {type:'up'} with the same holdId, the
// source ('pointer:<id>' or 'keyboard:<code>'), a performance.now() timestamp, and the
// exact coordinate/cents captured at onset. It never changes how notes sound or release.
export function createHexboardPlayer({document:doc,window:win,press,startVoice,onActiveNotesChange=()=>{},onInput=()=>{},selector="[data-hex-key]",keyField="hexKey",surface=".hex-board",keyboard=false,focusOnPointer=true}){
 const pointers=new Map(),held=new Map();let sustain=false,lastActiveSignature='[]',holds=0;
 const keyAt=el=>el?.closest?.(selector);
 const stamp=t=>Number.isFinite(t)?t:(win.performance?.now?.()??Date.now());
 const emitUp=(id,v,t,reason)=>onInput({type:'up',keyId:id,holdId:v.holdId,source:v.source,t:stamp(t),coordinate:v.coordinate?[...v.coordinate]:null,cents:v.cents,reason});
 const paint=(id,on)=>doc.querySelector(`${selector.slice(0,-1)}="${id}"]`)?.classList.toggle('is-playing',on);
 function releaseUnused(t){for(const [id,v] of held)if(![...pointers.values()].includes(id)&&!v.latched){v.release();held.delete(id);paint(id,false);emitUp(id,v,t,'release');}}
 function publishActiveNotes(){
  const notes=[...held].map(([id,v])=>({id,coordinate:v.coordinate?[...v.coordinate]:null,cents:v.cents}));
  const signature=JSON.stringify(notes);
  if(signature===lastActiveSignature)return;
  lastActiveSignature=signature;onActiveNotesChange(notes);
 }
 function pedal(on){sustain=on;if(on){for(const v of held.values())v.latched=true;}if(!on){for(const v of held.values())v.latched=false;releaseUnused();}}
 function play(node,source='pointer',t){if(!node)return null;const id=node.dataset[keyField],info=press(node);if(!info?.enabled)return info?.track?id:null;
  if(!held.has(id)){
   const hold={release:startVoice(info.c),latched:sustain,coordinate:Array.isArray(info.m)?info.m.slice():null,cents:info.c,holdId:`hold-${++holds}`,source};
   held.set(id,hold);
   onInput({type:'down',keyId:id,holdId:hold.holdId,source,t:stamp(t),coordinate:hold.coordinate?[...hold.coordinate]:null,cents:hold.cents});
  }else if(sustain)held.get(id).latched=true;
  paint(id,true);return id;
 }
 function reset(){pointers.clear();for(const [id,v] of held){v.release();paint(id,false);emitUp(id,v,undefined,'reset');}held.clear();sustain=false;publishActiveNotes();}
 doc.addEventListener('pointerdown',e=>{const node=keyAt(e.target);if(!node||e.button!==0)return;e.preventDefault();if(focusOnPointer)node.focus?.({preventScroll:true});pedal(e.shiftKey);pointers.set(e.pointerId,play(node,'pointer:'+e.pointerId,e.timeStamp));publishActiveNotes();});
 doc.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;e.preventDefault();if(e.pointerType==='mouse'&&!(e.buttons&1)){pointers.delete(e.pointerId);releaseUnused(e.timeStamp);publishActiveNotes();return;}pedal(e.shiftKey);const node=keyAt(doc.elementFromPoint(e.clientX,e.clientY)),next=node?.dataset[keyField]??null;if(next===pointers.get(e.pointerId)){publishActiveNotes();return;}pointers.set(e.pointerId,null);releaseUnused(e.timeStamp);pointers.set(e.pointerId,play(node,'pointer:'+e.pointerId,e.timeStamp));publishActiveNotes();});
 doc.addEventListener('pointerup',e=>{if(!pointers.has(e.pointerId))return;e.preventDefault();pedal(e.shiftKey);pointers.delete(e.pointerId);releaseUnused(e.timeStamp);publishActiveNotes();});
 doc.addEventListener('pointercancel',reset);
 // Suppress the follow-up click; pointerdown already handled the note and inspector.
 doc.addEventListener('click',e=>{if(keyAt(e.target)){e.preventDefault();e.stopImmediatePropagation();}},true);
 doc.addEventListener('dragstart',e=>{if(e.target.closest?.(surface))e.preventDefault();});
 doc.addEventListener('contextmenu',e=>{if(e.target.closest?.(surface))e.preventDefault();});
 doc.addEventListener('keydown',e=>{if(e.key==='Shift'){pedal(true);publishActiveNotes();}if(e.key==='Escape')reset();if(keyboard&&['Enter',' '].includes(e.key)&&keyAt(e.target)){e.preventDefault();if(!e.repeat){pointers.set('keyboard:'+e.code,play(keyAt(e.target),'keyboard:'+e.code,e.timeStamp));publishActiveNotes();}}});
 doc.addEventListener('keyup',e=>{if(e.key==='Shift'){pedal(false);publishActiveNotes();}if(keyboard&&['Enter',' '].includes(e.key)){pointers.delete('keyboard:'+e.code);releaseUnused(e.timeStamp);publishActiveNotes();}});
 win.addEventListener('blur',reset);doc.addEventListener('visibilitychange',()=>{if(doc.hidden)reset();});
 return {reset};
}
