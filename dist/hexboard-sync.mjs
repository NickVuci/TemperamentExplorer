// Keeps a physical HexBoard and the app in step.
//  - Keys: a board press goes through the same document-level pointer path as a mouse
//    click on the Play board, so sound, selection, chord picking and live chord
//    recognition behave identically. Off the Play view it sounds the key directly.
//  - Lights: every key shows the layout's colours; chord and scale highlights from the
//    app pop on the board; keys being played turn white.
import {hexToLed,BUTTON_COUNT} from './hexboard-protocol.mjs';

// Brightness of a key's own layout colour: ordinary, receded behind a highlight, and highlighted.
export const LEVEL={normal:.5,dim:.3,lit:1};
const OFF={h:0,s:0,v:0},WHITE={h:0,s:0,v:127};
const POINTER_BASE=1000;

/** LED picture for a board snapshot (see hexboard-ui deviceSnapshot) and the set of keys sounding now. */
export function ledFrame(snapshot,held=new Set()){
  const frame=new Map();
  for(let led=0;led<BUTTON_COUNT;led++){
    const key=snapshot?.keys[led];
    if(!key||key.command||!key.enabled||!key.color){frame.set(led,OFF);continue;}
    if(held.has(led)){frame.set(led,WHITE);continue;}
    // The layout never disappears: highlights change brightness, not colour.
    frame.set(led,hexToLed(key.layoutColor??key.color,key.lit||key.marked?LEVEL.lit:key.dim?LEVEL.dim:LEVEL.normal));
  }
  return frame;
}

export function createHexboardSync({
  document:doc,device,getSnapshot,startVoice,
  createEvent=(type,pointerId)=>new PointerEvent(type,{bubbles:true,cancelable:true,pointerId,pointerType:'touch',button:0,buttons:type==='pointerdown'?1:0,isPrimary:false}),
  timer={set:(fn,ms)=>setInterval(fn,ms),clear:id=>clearInterval(id)},
  intervalMs=100,refreshMs=1500,
}){
  const down=new Map();           // key index -> {release?: fn}  (release only for directly sounded keys)
  let appHeld=new Set();          // keys the board player reports as sounding (mouse and device alike)

  const nodeFor=index=>{
    const node=doc.querySelector?.(`[data-hex-key="${index}"]`);
    return node&&!node.closest?.('[hidden]')?node:null;
  };
  function held(){return new Set([...appHeld,...down.keys()]);}

  /** Pushes the current picture to the board: changed LEDs, or all of them with `force`. */
  function sync(force=false){
    if(!device.connected)return;
    const snapshot=getSnapshot();
    if(snapshot)device.setLeds(ledFrame(snapshot,held()),{force});
  }

  // While running, the board follows the app within `intervalMs`, and the whole picture is
  // resent every `refreshMs` so a missed message can never leave part of the layout dark.
  let timers=null;
  function start(){
    if(timers)return;
    timers=[timer.set(()=>sync(),intervalMs),timer.set(()=>sync(true),refreshMs)];
    sync(true);
  }
  function stop(){
    if(!timers)return;
    for(const id of timers)timer.clear(id);
    timers=null;
  }

  function keyDown(index){
    if(down.has(index))return;
    const node=nodeFor(index);
    if(node){
      node.dispatchEvent(createEvent('pointerdown',POINTER_BASE+index));
      down.set(index,{});
    }else{
      const key=getSnapshot()?.keys[index];
      if(!key||key.command||!key.enabled)return;
      down.set(index,{release:startVoice(key.c)});
    }
    sync();
  }

  function keyUp(index){
    const entry=down.get(index);
    if(!entry)return;
    down.delete(index);
    if(entry.release)entry.release();
    else doc.dispatchEvent(createEvent('pointerup',POINTER_BASE+index));
    sync();
  }

  /** Called with the board player's sounding notes ([{id}]) so mouse presses light the board too. */
  function setActive(notes){
    appHeld=new Set(notes.map(n=>Number(n.id)).filter(Number.isInteger));
    sync();
  }

  /** Releases everything the board is holding (disconnect, Escape, page hide). */
  function releaseAll(){
    for(const index of [...down.keys()])keyUp(index);
  }

  return {keyDown,keyUp,setActive,sync,start,stop,releaseAll,get held(){return held();},get running(){return timers!==null;}};
}
