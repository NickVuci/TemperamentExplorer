import assert from 'node:assert/strict';
import {createHexboardDevice} from '../dist/hexboard-device.mjs';

function fakeMidi({inputs=['HexBoard'],outputs=['HexBoard'],reject=null}={}){
  const sent=[],portIn=inputs.map((name,i)=>({id:'in'+i,name,onmidimessage:null})),portOut=outputs.map((name,i)=>({id:'out'+i,name,send:b=>sent.push([...b])}));
  const access={inputs:new Map(portIn.map(p=>[p.id,p])),outputs:new Map(portOut.map(p=>[p.id,p])),onstatechange:null};
  const calls=[];
  return {sent,portIn,portOut,access,calls,request:async options=>{calls.push(options);if(reject)throw reject;return access;}};
}
const harness=(opts,device={})=>{
  const m=fakeMidi(opts),keys=[],encoders=[],status=[];
  const d=createHexboardDevice({requestMIDIAccess:m.request,onKey:(i,down,t)=>keys.push([i,down,t]),onEncoder:e=>encoders.push(e),onStatus:(s,detail)=>status.push([s,detail]),settleMs:0,...device});
  return {m,d,keys,encoders,status};
};

// Connect: asks for SysEx, finds the HexBoard by name, enters host mode with the app name.
{
  const {m,d,status}=harness();
  assert.equal(d.state,'disconnected');
  assert.equal(await d.connect(),true);
  assert.deepEqual(m.calls,[{sysex:true}],'SysEx permission is requested');
  assert.equal(d.state,'connected');assert.equal(d.connected,true);assert.equal(d.name,'HexBoard');
  assert.deepEqual(m.sent[0].slice(0,3),[0xf0,0x7d,0x01],'enter delegated mode');
  assert.equal(String.fromCharCode(...m.sent[0].slice(3,-1)),'Temperament Lab');
  assert.deepEqual(m.sent[1],[0xf0,0x7d,0x05,0xf7],'the default key encoding is restored after entering');
  assert.deepEqual(status.map(s=>s[0]),['connecting','connected']);
  assert.equal(await d.connect(),true,'connecting twice does nothing');assert.equal(m.sent.length,2);
}

// Port choice: only a port named HexBoard is taken; other MIDI devices are never touched.
{
  const {m,d}=harness({inputs:['Some Keyboard','Shaping HexBoard v2'],outputs:['Some Keyboard','Shaping HexBoard v2']});
  assert.equal(await d.connect(),true);assert.equal(d.name,'Shaping HexBoard v2');
  assert.equal(m.portIn[0].onmidimessage,null);assert.ok(m.portIn[1].onmidimessage);
}
{
  const {d,status,m}=harness({inputs:['Some Keyboard','Other'],outputs:['Some Keyboard']});
  assert.equal(await d.connect(),false);assert.equal(d.state,'error');assert.equal(m.sent.length,0,'nothing is sent to unrelated devices');
  assert.match(status.at(-1)[1].message,/No HexBoard found[^]*Some Keyboard, Other/);
  assert.equal(m.portIn[0].onmidimessage,null);
}
{
  const {d,status}=harness({inputs:[],outputs:[]});
  assert.equal(await d.connect(),false);assert.match(status.at(-1)[1].message,/No MIDI devices are connected/);
}
{
  const {d,status}=harness({reject:new Error('denied')});
  assert.equal(await d.connect(),false);assert.match(status.at(-1)[1].message,/refused \(denied\)/);
  assert.equal(d.state,'error');
}
{
  const d=createHexboardDevice({requestMIDIAccess:undefined});
  assert.equal(await d.connect(),false);assert.equal(d.state,'error');
}

// A failed attempt can be retried.
{
  const {m,d}=harness({inputs:['x'],outputs:['x']});
  assert.equal(await d.connect(),false);
  m.portIn.push({id:'in9',name:'HexBoard',onmidimessage:null});m.access.inputs.set('in9',m.portIn[1]);
  m.portOut.push({id:'out9',name:'HexBoard',send:b=>m.sent.push([...b])});m.access.outputs.set('out9',m.portOut[1]);
  assert.equal(await d.connect(),true,'the board is found once it is plugged in');
}

// Incoming keys and encoder events.
{
  const {m,d,keys,encoders}=harness();await d.connect();
  const fire=(data,timeStamp=5)=>m.portIn[0].onmidimessage({data,timeStamp});
  fire([0x90,65,127],11);fire([0x80,65,0],22);fire([0x90,30,100]);fire([0x91,30,100]);fire([0xb0,1,2]);fire([0x93,60,127]);
  assert.deepEqual(keys,[[65,true,11],[65,false,22],[30,true,5],[130,true,5]],'notes decode to key indices; other messages are ignored');
  fire([0xf0,0x7d,0x06,3,0xf7]);fire([0xf0,0x7d,0x06,1,0xf7]);fire([0xf0,0x7d,0x06,9,0xf7]);
  assert.deepEqual(encoders,['press','up']);
  m.portIn[0].onmidimessage({data:null});
}

// LED traffic: only changes are sent; nothing before connecting.
{
  const {m,d}=harness();
  assert.equal(d.setLeds(new Map([[1,{h:0,s:0,v:5}]])),0,'ignored when not connected');
  await d.connect();m.sent.length=0;
  const frame=new Map([[1,{h:10,s:20,v:30}],[2,{h:1,s:2,v:3}]]);
  assert.equal(d.setLeds(frame),2);assert.equal(m.sent.length,1,'one SysEx per frame');
  assert.deepEqual(m.sent[0],[0xf0,0x7d,0x03,0,1,10,20,30,0,2,1,2,3,0xf7]);
  assert.equal(d.setLeds(frame),0);assert.equal(m.sent.length,1,'an unchanged frame sends nothing');
  assert.equal(d.setLeds(new Map([[1,{h:10,s:20,v:30}],[2,{h:9,s:2,v:3}]])),1);
  assert.deepEqual(m.sent.at(-1),[0xf0,0x7d,0x03,0,2,9,2,3,0xf7],'only the changed LED is sent');
}

// Disconnect blanks every LED and leaves host mode; reconnecting resends the picture.
{
  const {m,d,status}=harness();await d.connect();
  d.setLeds(new Map([[1,{h:1,s:1,v:1}]]));m.sent.length=0;
  d.disconnect();
  assert.equal(m.sent.length,6,'five small LED messages, then exit');
  const blank=m.sent.slice(0,5);assert.ok(blank.every(b=>b[2]===3&&b.length<=164));
  const records=blank.flatMap(b=>{const r=[];for(let i=3;i<b.length-1;i+=5)r.push({led:b[i]*128+b[i+1],h:b[i+2],s:b[i+3],v:b[i+4]});return r;});
  assert.equal(records.length,140,'all 140 LEDs are blanked');assert.ok(records.every((r,i)=>r.led===i&&r.h===0&&r.s===0&&r.v===0));
  assert.deepEqual(m.sent.at(-1),[0xf0,0x7d,0x02,0xf7],'exit delegated mode');
  assert.equal(d.state,'disconnected');assert.equal(m.portIn[0].onmidimessage,null,'listeners are removed');
  assert.equal(status.at(-1)[1].reason,'user');
  d.disconnect();assert.equal(m.sent.length,6,'disconnecting twice does nothing');
  await d.connect();m.sent.length=0;
  assert.equal(d.setLeds(new Map([[1,{h:1,s:1,v:1}]])),1,'a new connection starts from a blank picture');
}

// Unplugging reports the loss and stops sending.
{
  const {m,d,status}=harness();await d.connect();m.sent.length=0;
  m.access.onstatechange({port:{id:'out0',state:'disconnected'}});
  assert.equal(d.state,'disconnected');assert.equal(status.at(-1)[1].reason,'unplugged');
  assert.equal(d.setLeds(new Map([[1,{h:1,s:1,v:1}]])),0);assert.equal(m.sent.length,0);
  assert.doesNotThrow(()=>d.disconnect());
}
{
  const {m,d}=harness();await d.connect();
  m.access.onstatechange({port:{id:'unrelated',state:'disconnected'}});
  assert.equal(d.state,'connected','another device leaving does not disconnect the board');
  // A send failure while disconnecting (port already gone) is swallowed.
  m.portOut[0].send=()=>{throw new Error('gone');};
  assert.doesNotThrow(()=>d.disconnect());assert.equal(d.state,'disconnected');
}

// Settling: nothing is painted until the board has had time to enter host mode.
{
  const m=fakeMidi(),statuses=[];
  const d=createHexboardDevice({requestMIDIAccess:m.request,onStatus:s=>statuses.push(s),settleMs:60});
  const started=performance.now(),pendingConnect=d.connect();
  await new Promise(r=>setTimeout(r,10));
  assert.equal(d.state,'connecting');assert.equal(d.setLeds(new Map([[1,{h:1,s:1,v:1}]])),0,'LEDs wait for the board to settle');
  assert.deepEqual(m.sent.map(b=>b[2]),[1],'only the enter message has been sent so far');
  assert.equal(await pendingConnect,true);
  assert.ok(performance.now()-started>=55,'connect resolves after the settle time');
  assert.deepEqual(m.sent.map(b=>b[2]),[1,5],'the note map is reset once the board has settled');
  assert.equal(d.setLeds(new Map([[1,{h:1,s:1,v:1}]])),1);
}
// Disconnecting while settling still hands the board back, and the attempt reports failure.
{
  const m=fakeMidi(),d=createHexboardDevice({requestMIDIAccess:m.request,settleMs:60});
  const pendingConnect=d.connect();await new Promise(r=>setTimeout(r,10));
  d.disconnect();
  assert.equal(await pendingConnect,false);assert.equal(d.state,'disconnected');
  assert.deepEqual(m.sent.at(-1),[0xf0,0x7d,0x02,0xf7],'host mode is exited');
}
// Unplugging while settling does not leave a connected state behind.
{
  const m=fakeMidi(),d=createHexboardDevice({requestMIDIAccess:m.request,settleMs:60});
  const pendingConnect=d.connect();await new Promise(r=>setTimeout(r,10));
  m.access.onstatechange({port:{id:'out0',state:'disconnected'}});
  assert.equal(await pendingConnect,false);assert.equal(d.state,'disconnected');
}

// Large pictures go out in small paced messages, never one long frame.
{
  const m=fakeMidi(),stamps=[];
  m.portOut[0].send=(b,t)=>{m.sent.push([...b]);stamps.push(t);};
  const d=createHexboardDevice({requestMIDIAccess:m.request,settleMs:0,chunk:32,paceMs:4});
  await d.connect();m.sent.length=0;stamps.length=0;
  const all=new Map(Array.from({length:140},(_,i)=>[i,{h:i%128,s:10,v:20}]));
  assert.equal(d.setLeds(all),140);
  assert.equal(m.sent.length,5,'140 LEDs in 5 messages');
  assert.deepEqual(m.sent.map(b=>(b.length-4)/5),[32,32,32,32,12]);
  assert.ok(m.sent.every(b=>b.length<=4+32*5),'no message exceeds 164 bytes');
  const leds=m.sent.flatMap(b=>{const r=[];for(let i=3;i<b.length-1;i+=5)r.push(b[i]*128+b[i+1]);return r;});
  assert.deepEqual(leds,Array.from({length:140},(_,i)=>i),'every LED is sent exactly once, in order');
  assert.equal(stamps[0],undefined,'the first chunk goes immediately');
  assert.ok(stamps.slice(1).every((t,i,a)=>Number.isFinite(t)&&(i===0||t>a[i-1])),'later chunks are scheduled a few ms apart');
}

// Force resends everything, even unchanged LEDs; a normal call still sends only changes.
{
  const m=fakeMidi(),d=createHexboardDevice({requestMIDIAccess:m.request,settleMs:0});
  await d.connect();m.sent.length=0;
  const frame=new Map(Array.from({length:50},(_,i)=>[i,{h:1,s:2,v:3}]));
  assert.equal(d.setLeds(frame),50);assert.equal(d.setLeds(frame),0);
  assert.equal(d.setLeds(frame,{force:true}),50,'a forced refresh repairs LEDs the board may have missed');
  assert.equal(d.setLeds(frame),0,'and normal updates go back to changes only');
}

// The board leaving host mode by itself (encoder held 5 s) ends the connection without
// sending anything back, so its normal notes are never read as key indices.
{
  const {m,d,status,keys}=harness();await d.connect();m.sent.length=0;
  m.portIn[0].onmidimessage({data:[0xf0,0x7d,0x07,0xf7]});
  assert.equal(d.state,'disconnected');assert.equal(status.at(-1)[1].reason,'board');
  assert.equal(m.sent.length,0,'no blanking or exit is sent to a board in normal mode');
  assert.equal(m.portIn[0].onmidimessage,null,'later notes are not decoded');
  assert.equal(d.setLeds(new Map([[1,{h:1,s:1,v:1}]])),0);
  assert.equal(keys.length,0);
  d.disconnect();assert.equal(m.sent.length,0);
  assert.equal(await d.connect(),true,'the board can be taken over again');
}
// Firmware without the notice: only a release arrives, 5 s after the press.
{
  let clock=0;
  const {m,d,status,encoders}=harness({},{now:()=>clock});await d.connect();m.sent.length=0;
  const fire=data=>m.portIn[0].onmidimessage({data});
  fire([0xf0,0x7d,0x06,3,0xf7]);clock+=1200;fire([0xf0,0x7d,0x06,4,0xf7]);
  assert.equal(d.state,'connected','an ordinary click keeps the connection');
  fire([0xf0,0x7d,0x06,3,0xf7]);clock+=4700;fire([0xf0,0x7d,0x06,4,0xf7]);
  assert.equal(d.state,'connected','a long deliberate hold short of the exit keeps the connection');
  fire([0xf0,0x7d,0x06,3,0xf7]);fire([0xf0,0x7d,0x06,1,0xf7]);clock+=5000;fire([0xf0,0x7d,0x06,4,0xf7]);
  assert.deepEqual(encoders.slice(-3),['press','up','release'],'the release is still reported');
  assert.equal(d.state,'disconnected');assert.equal(status.at(-1)[1].reason,'board');assert.equal(m.sent.length,0);
  // A newer board sends the notice after that release; it is ignored once disconnected.
  assert.doesNotThrow(()=>m.access.onstatechange?.({port:{id:'out0',state:'disconnected'}}));
  assert.equal(status.filter(s=>s[0]==='disconnected').length,1);
}
{
  let clock=0;
  const {m,d}=harness({},{now:()=>clock});await d.connect();
  clock+=9000;m.portIn[0].onmidimessage({data:[0xf0,0x7d,0x06,4,0xf7]});
  assert.equal(d.state,'connected','a release without a press seen by this connection is not an exit');
}

console.log('hexboard-device: ok');
