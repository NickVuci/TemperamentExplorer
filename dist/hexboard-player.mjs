// Continuous pointer playing without replacing the SVG during a gesture.
export function createHexboardPlayer({document:doc,window:win,press,startVoice,onActiveNotesChange=()=>{},selector="[data-hex-key]",keyField="hexKey",surface=".hex-board",keyboard=false}){
 const pointers=new Map(),held=new Map();let sustain=false,lastActiveSignature='[]';
 const keyAt=el=>el?.closest?.(selector);
 const paint=(id,on)=>doc.querySelector(`${selector.slice(0,-1)}="${id}"]`)?.classList.toggle('is-playing',on);
 function releaseUnused(){for(const [id,v] of held)if(![...pointers.values()].includes(id)&&!v.latched){v.release();held.delete(id);paint(id,false);}}
 function publishActiveNotes(){
  const notes=[...held].map(([id,v])=>({id,coordinate:v.coordinate?[...v.coordinate]:null,cents:v.cents}));
  const signature=JSON.stringify(notes);
  if(signature===lastActiveSignature)return;
  lastActiveSignature=signature;onActiveNotesChange(notes);
 }
 function pedal(on){sustain=on;if(on){for(const v of held.values())v.latched=true;}if(!on){for(const v of held.values())v.latched=false;releaseUnused();}}
 function play(node){if(!node)return null;const id=node.dataset[keyField],info=press(node);if(!info?.enabled)return info?.track?id:null;
  if(!held.has(id))held.set(id,{release:startVoice(info.c),latched:sustain,coordinate:Array.isArray(info.m)?info.m.slice():null,cents:info.c});else if(sustain)held.get(id).latched=true;
  paint(id,true);return id;
 }
 function reset(){pointers.clear();for(const [id,v] of held){v.release();paint(id,false);}held.clear();sustain=false;publishActiveNotes();}
 doc.addEventListener('pointerdown',e=>{const node=keyAt(e.target);if(!node||e.button!==0)return;e.preventDefault();node.focus?.({preventScroll:true});pedal(e.shiftKey);pointers.set(e.pointerId,play(node));publishActiveNotes();});
 doc.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId))return;e.preventDefault();if(e.pointerType==='mouse'&&!(e.buttons&1)){pointers.delete(e.pointerId);releaseUnused();publishActiveNotes();return;}pedal(e.shiftKey);const node=keyAt(doc.elementFromPoint(e.clientX,e.clientY)),next=node?.dataset[keyField]??null;if(next===pointers.get(e.pointerId)){publishActiveNotes();return;}pointers.set(e.pointerId,null);releaseUnused();pointers.set(e.pointerId,play(node));publishActiveNotes();});
 doc.addEventListener('pointerup',e=>{if(!pointers.has(e.pointerId))return;e.preventDefault();pedal(e.shiftKey);pointers.delete(e.pointerId);releaseUnused();publishActiveNotes();});
 doc.addEventListener('pointercancel',reset);
 // Suppress the follow-up click; pointerdown already handled the note and inspector.
 doc.addEventListener('click',e=>{if(keyAt(e.target)){e.preventDefault();e.stopImmediatePropagation();}},true);
 doc.addEventListener('dragstart',e=>{if(e.target.closest?.(surface))e.preventDefault();});
 doc.addEventListener('contextmenu',e=>{if(e.target.closest?.(surface))e.preventDefault();});
 doc.addEventListener('keydown',e=>{if(e.key==='Shift'){pedal(true);publishActiveNotes();}if(e.key==='Escape')reset();if(keyboard&&['Enter',' '].includes(e.key)&&keyAt(e.target)){e.preventDefault();if(!e.repeat){pointers.set('keyboard:'+e.code,play(keyAt(e.target)));publishActiveNotes();}}});
 doc.addEventListener('keyup',e=>{if(e.key==='Shift'){pedal(false);publishActiveNotes();}if(keyboard&&['Enter',' '].includes(e.key)){pointers.delete('keyboard:'+e.code);releaseUnused();publishActiveNotes();}});
 win.addEventListener('blur',reset);doc.addEventListener('visibilitychange',()=>{if(doc.hidden)reset();});
 return {reset};
}
