// Keeps a physical HexBoard and the app in step.
//  - Keys: a board press plays the on-screen Play key through the board player's own press
//    path (pressKey), so sound, selection, chord picking and live chord recognition behave as
//    for a mouse. Off the Play view it sounds the key directly.
//  - Lights: every key shows the layout's colours; keys in a chord or scale highlight shine
//    a level brighter; keys being played turn white.
import {hexToLed,BUTTON_COUNT} from './hexboard-protocol.mjs';

// Brightness of a key's own layout colour: ordinary, and highlighted (one level brighter).
export const LEVEL={normal:.5,lit:1};
const OFF={h:0,s:0,v:0},WHITE={h:0,s:0,v:127};
const PROBE_SAMPLES=20;

/** LED picture for a board snapshot (see hexboard-ui deviceSnapshot) and the set of keys sounding now. */
export function ledFrame(snapshot,held=new Set()){
  const frame=new Map();
  for(let led=0;led<BUTTON_COUNT;led++){
    const key=snapshot?.keys[led];
    if(!key||key.command||!key.enabled||!key.color){frame.set(led,OFF);continue;}
    if(held.has(led)){frame.set(led,WHITE);continue;}
    // A highlight changes no colour and leaves other keys alone: highlighted keys are only brighter.
    frame.set(led,hexToLed(key.layoutColor??key.color,key.lit||key.marked?LEVEL.lit:LEVEL.normal));
  }
  return frame;
}

export function createHexboardSync({
  device,getSnapshot,startVoice,
  // pressKey(index,t)/releaseKey(index) play the on-screen key; pressKey returns false when it is not shown.
  pressKey=()=>false,releaseKey=()=>{},
  now=()=>globalThis.performance?.now?.()??Date.now(),
  queue=fn=>queueMicrotask(fn),
  timer={set:(fn,ms)=>setInterval(fn,ms),clear:id=>clearInterval(id)},
  intervalMs=100,refreshMs=1500,
}){
  const down=new Map();           // key index -> {release?: fn}  (release only for directly sounded keys)
  let appHeld=new Set();          // keys the board player reports as sounding (mouse and device alike)

  const delays=[];               // recent input-to-sound times (ms), for the latency probe
  function held(){return new Set([...appHeld,...down.keys()]);}
  // One LED update per input event, queued so it runs after the sound has started.
  let queued=false;
  function scheduleSync(){if(queued)return;queued=true;queue(()=>{queued=false;sync();});}

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

  /** `t` is the MIDI message's arrival time (performance clock), used by the latency probe. */
  function keyDown(index,t){
    if(down.has(index))return;
    if(pressKey(index,t))down.set(index,{});
    else{
      const key=getSnapshot()?.keys[index];
      if(!key||key.command||!key.enabled)return;
      down.set(index,{release:startVoice(key.c)});
    }
    if(Number.isFinite(t)){delays.push(Math.max(0,now()-t));if(delays.length>PROBE_SAMPLES)delays.shift();}
    scheduleSync();
  }

  function keyUp(index){
    const entry=down.get(index);
    if(!entry)return;
    down.delete(index);
    if(entry.release)entry.release();
    else releaseKey(index);
    scheduleSync();
  }

  /** Called with the board player's sounding notes ([{id}]) so mouse presses light the board too. */
  function setActive(notes){
    appHeld=new Set(notes.map(n=>Number(n.id)).filter(Number.isInteger));
    scheduleSync();
  }

  /** Releases everything the board is holding (disconnect, Escape, page hide). */
  function releaseAll(){
    for(const index of [...down.keys()])keyUp(index);
  }

  /** Median time from a board key's MIDI arrival to its sound being scheduled, in ms (null before any press). */
  function inputDelay(){if(!delays.length)return null;const sorted=[...delays].sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];}

  return {keyDown,keyUp,setActive,sync,start,stop,releaseAll,inputDelay,get held(){return held();},get running(){return timers!==null;}};
}
