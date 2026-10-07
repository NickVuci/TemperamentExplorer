// Web MIDI connection to a physical HexBoard in delegated-control mode (Chrome/Edge).
// Owns only the port, entering/leaving host mode and LED traffic; what keys mean and
// what the LEDs show is decided by hexboard-sync.mjs.
import {encodeEnter,encodeExit,encodeNoteMapReset,encodeLeds,decodeKey,decodeEncoder,isExitNotice,BUTTON_COUNT} from './hexboard-protocol.mjs';

const NAME=/hexboard/i;

export function createHexboardDevice({
  requestMIDIAccess=globalThis.navigator?.requestMIDIAccess?.bind(globalThis.navigator),
  onKey=()=>{},onEncoder=()=>{},onStatus=()=>{},
  // The board resets its MIDI parser and clears its colours when it enters host mode, so
  // painting starts only after it has settled. LEDs go out in small paced messages so
  // none is lost to a long SysEx frame.
  settleMs=300,paceMs=4,chunk=32,
  // Holding the encoder for 5 s makes the board leave host mode by itself. Firmware without
  // the exit notice reports only a release, so a release this long after its press means
  // the board has gone back to normal play.
  forcedExitMs=4800,now=()=>globalThis.performance?.now?.()??Date.now(),
}={}){
  let access=null,input=null,output=null,state='disconnected',sent=new Map(),pressedAt=null;
  const set=(next,detail={})=>{state=next;onStatus(next,detail);};

  // The board is in normal mode now: its notes are no longer key indices and it ignores
  // LED messages, so stop listening without sending anything back.
  function boardExited(){
    if(state!=='connected'&&state!=='connecting')return;
    release();set('disconnected',{reason:'board'});
  }

  function handle(event){
    const data=event.data;
    if(!data)return;
    if(data[0]===0xf0){
      if(isExitNotice(data)){boardExited();return;}
      const e=decodeEncoder(data);
      if(!e)return;
      const heldMs=e==='release'&&pressedAt!==null?now()-pressedAt:0;
      pressedAt=e==='press'?now():e==='release'?null:pressedAt;
      onEncoder(e);
      if(heldMs>=forcedExitMs)boardExited();
      return;
    }
    const key=decodeKey(data);
    if(key)onKey(key.index,key.down,event.timeStamp);
  }

  function release(){
    if(input)input.onmidimessage=null;
    if(access)access.onstatechange=null;
    input=output=access=null;sent=new Map();pressedAt=null;
  }

  /** Opens MIDI (with SysEx permission), finds the HexBoard by name and takes over its surface. */
  async function connect(){
    if(state==='connected'||state==='connecting')return state==='connected';
    if(!requestMIDIAccess){set('error',{message:'Web MIDI is not available. Use Chrome or Edge.'});return false;}
    set('connecting');
    try{access=await requestMIDIAccess({sysex:true});}
    catch(error){release();set('error',{message:`MIDI access was refused${error?.message?` (${error.message})`:''}. Allow MIDI devices for this site and try again.`});return false;}
    const inputs=[...access.inputs.values()],outputs=[...access.outputs.values()];
    input=inputs.find(p=>NAME.test(p.name??''))??null;
    output=outputs.find(p=>NAME.test(p.name??''))??null;
    if(!input||!output){
      const names=[...new Set([...inputs,...outputs].map(p=>p.name||p.id))];
      release();
      set('error',{message:`No HexBoard found.${names.length?` MIDI devices seen: ${names.join(', ')}.`:' No MIDI devices are connected.'} Plug it in over USB and try again.`});
      return false;
    }
    input.onmidimessage=handle;
    const ids=new Set([input.id,output.id]);
    access.onstatechange=e=>{if(e.port&&ids.has(e.port.id)&&e.port.state==='disconnected'){release();set('disconnected',{reason:'unplugged'});}};
    const port=output;
    port.send(encodeEnter());
    sent=new Map();
    if(settleMs>0)await new Promise(resolve=>setTimeout(resolve,settleMs));
    if(state!=='connecting'||output!==port)return false; // disconnected or unplugged while settling
    port.send(encodeNoteMapReset());
    set('connected',{name:input.name});
    return true;
  }

  /**
   * Sends the LEDs that changed since the last frame, or every LED with `force` (a periodic
   * refresh repairs anything the board missed). `leds` is a Map index -> {h,s,v}.
   */
  function setLeds(leds,{force=false}={}){
    if(state!=='connected'||!output)return 0;
    const changed=[];
    for(const [led,{h,s,v}] of leds){
      const key=`${h},${s},${v}`;
      if(force||sent.get(led)!==key){sent.set(led,key);changed.push({led,h,s,v});}
    }
    const base=globalThis.performance?.now?.()??0;
    for(let i=0;i<changed.length;i+=chunk){
      const bytes=encodeLeds(changed.slice(i,i+chunk));
      if(paceMs>0&&i>0)output.send(bytes,base+paceMs*(i/chunk));else output.send(bytes);
    }
    return changed.length;
  }

  /** Blanks the LEDs and hands the board back to its normal behaviour. */
  function disconnect(){
    if((state==='connected'||state==='connecting')&&output){
      try{
        const blank=Array.from({length:BUTTON_COUNT},(_,led)=>({led,h:0,s:0,v:0}));
        for(let i=0;i<blank.length;i+=chunk)output.send(encodeLeds(blank.slice(i,i+chunk)));
        output.send(encodeExit());
      }catch{/* port already gone */}
    }
    release();
    if(state!=='disconnected')set('disconnected',{reason:'user'});
  }

  return {connect,disconnect,setLeds,get state(){return state;},get connected(){return state==='connected';},get name(){return input?.name??null;}};
}
