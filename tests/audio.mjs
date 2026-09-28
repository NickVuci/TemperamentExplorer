import assert from 'node:assert/strict';
import {createAudioEngine, frequencyFor, isAudibleFrequency} from '../dist/audio.mjs';
import {createHexboardPlayer} from '../dist/hexboard-player.mjs';
import {createHexboardWorkspace} from '../dist/hexboard-ui.mjs';
import {buildBoard} from '../dist/hexboard.mjs';
import {makeState} from '../dist/engine.mjs';
import {fromCommas} from '../dist/tuning.mjs';

const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture({pending = false, fallback = false} = {}) {
  const oscillators = [], gains = [], waiters = [], errors = [];
  let contexts = 0;
  const param = () => {
    const events = [];
    const p = {value:0, events};
    for (const name of ['setValueAtTime','linearRampToValueAtTime','exponentialRampToValueAtTime','cancelScheduledValues','cancelAndHoldAtTime']) {
      p[name] = (...args) => { events.push([name,...args]); if (!name.startsWith('cancel')) p.value = args[0]; };
    }
    if (fallback) delete p.cancelAndHoldAtTime;
    return p;
  };
  const context = {
    state:'running', currentTime:5, destination:{},
    resume: () => pending ? new Promise(resolve => waiters.push(resolve)) : Promise.resolve(),
    createOscillator() {
      const oscillator = {frequency:{}, starts:[], stops:[], disconnected:false,
        connect() {}, disconnect() { this.disconnected = true; },
        start(at) { this.starts.push(at); }, stop(at) { this.stops.push(at); },
        end() { this.onended(); }};
      oscillators.push(oscillator); return oscillator;
    },
    createGain() {
      const gain = {gain:param(), connect() {}, disconnect() {this.disconnected = true;}};
      gains.push(gain); return gain;
    }
  };
  let settings = {tonic:220, wave:'triangle'};
  const engine = createAudioEngine({createContext:() => {contexts++; return context;}, getSettings:()=>settings, onError:e=>errors.push(e)});
  return {engine, oscillators, gains, errors, context, contexts:()=>contexts,
    settings:next=>settings=next, resume:()=>waiters.splice(0).forEach(resolve=>resolve())};
}
assert.equal(frequencyFor(1200,220),440);
assert.equal(frequencyFor(-1200,220),110);
for (const n of [NaN,Infinity,-Infinity,0,14.99,16001]) assert.equal(isAudibleFrequency(n),false);
for (const n of [15,220,16000]) assert.equal(isAudibleFrequency(n),true);

const f = fixture();
assert.equal(await f.engine.playChord([0,1200]),true);
assert.equal(f.contexts(),1);
assert.deepEqual(f.oscillators.map(o=>o.frequency.value),[220,440]);
assert.deepEqual(f.oscillators[0].starts,[5.02]);
assert.ok(Math.abs(f.oscillators[0].stops[0]-5.75)<1e-9);
assert.deepEqual(f.gains[0].gain.events[0],['setValueAtTime',0,5.02]);
assert.equal(f.gains[0].gain.events[1][1],.14/Math.sqrt(2));
assert.equal(f.gains[0].gain.events[2][0],'exponentialRampToValueAtTime');
await f.engine.playSequence([0,100,200]);
assert.equal(f.contexts(),1);
assert.ok(f.oscillators.slice(0,2).every(o=>o.stops.at(-1)===undefined));
assert.deepEqual(f.oscillators.slice(2).map(o=>o.starts[0]),[5.03,5.18,5.33]);
f.settings({tonic:440,wave:'sawtooth'});
const release = f.engine.startVoice(0);
await tick();
const held = f.oscillators.at(-1), envelope = f.gains.at(-1).gain;
assert.equal(held.type,'sawtooth'); assert.equal(held.frequency.value,440);
assert.equal(envelope.events[1][1],.018); assert.equal(held.stops.length,0);
release(); release();
assert.deepEqual(held.stops,[5.1]);
assert.deepEqual(envelope.events[2],['cancelAndHoldAtTime',5.06]); assert.equal(envelope.events[2][0],'cancelAndHoldAtTime');
f.engine.stop();
for (const oscillator of f.oscillators) oscillator.end();
assert.ok(f.oscillators.every(o=>o.disconnected)); assert.ok(f.gains.every(g=>g.disconnected));
await f.engine.playChord([NaN,Infinity,-Infinity,1e9]);
assert.equal(f.oscillators.length,6,'Invalid/out-of-range pitches never create nodes.');

// Releasing or stopping before audio permissions/resume complete must stay silent.
const pending = fixture({pending:true});
const earlyRelease = pending.engine.startVoice(0); earlyRelease();
pending.resume(); await tick(); assert.equal(pending.oscillators.length,0);
const waiting = pending.engine.playChord([0]); pending.engine.stop(); pending.resume();
assert.equal(await waiting,false); assert.equal(pending.oscillators.length,0);
const obsolete = pending.engine.playSequence([0,100]), current = pending.engine.playChord([1200]);
pending.resume();
assert.equal(await obsolete,false); assert.equal(await current,true);
assert.deepEqual(pending.oscillators.map(o=>o.frequency.value),[440]);
pending.engine.startVoice(100); pending.engine.stop(); pending.resume(); await tick();
assert.equal(pending.oscillators.length,1,'Stop also cancels pending held voices.');

const fallback = fixture({fallback:true}), finish = fallback.engine.startVoice(0);
await tick(); finish();
assert.equal(fallback.gains[0].gain.events[2][0],'cancelScheduledValues');
// Long holds release immediately; short taps retain their attack even before
// the clock's first quantum. The fallback must preserve the same audible gate.
assert.deepEqual(fallback.oscillators[0].stops,[5.1]);
assert.deepEqual(fallback.gains[0].gain.events.at(-2),['setValueAtTime',.035,5.06]);
const longHold=fixture(), releaseLong=longHold.engine.startVoice(0);
await tick();longHold.context.currentTime=6;releaseLong();
assert.deepEqual(longHold.oscillators[0].stops,[6.04]);
let errorCount = 0;
const broken = createAudioEngine({createContext:()=>{throw Error('Unavailable');}, onError:()=>errorCount++});
assert.equal(await broken.playChord([0]),false);
broken.startVoice(0); await tick(); assert.equal(errorCount,2);
console.log('Shared audio scheduling, frequency bounds, held notes, cancellation, cleanup and resume races passed.');

// Join the actual pointer handler, layout workspace, and audio engine. Frequencies
// must follow the displayed integer coordinates in octave and non-octave tunings.
for(const state of [makeState('meantone'),fromCommas('128/125','2.3.5'),fromCommas('245/243','3.5.7')])for(const wrapping of ['on','off']){
 const audio=fixture(),workspace=createHexboardWorkspace({getStates:()=>[state],play:()=>{},refresh:()=>{},notify:message=>{throw Error(message);},getHz:()=>220});
 workspace.change({dataset:{hexField:'periodWrapping'},value:wrapping});
 const board=buildBoard(state,workspace.serialize().configs[0]);
 const keys=board.keys.filter(k=>k.enabled&&isAudibleFrequency(frequencyFor(k.c))).sort((a,b)=>Math.abs(a.index-65)-Math.abs(b.index-65)).slice(0,2);
 assert.equal(keys.length,2);
 const handlers={},painted=new Set(),nodes=keys.map(k=>({dataset:{hexKey:String(k.index)},focus(){},classList:{toggle(name,on){if(name==='is-playing'){if(on)painted.add(k.index);else painted.delete(k.index);}}}}));
 const boardElement={querySelectorAll:()=>nodes};
 for(const node of nodes)node.closest=selector=>selector==='.hex-board'?boardElement:node;
 let hit=nodes[0];
 const doc={addEventListener:(name,fn)=>handlers[name]=fn,querySelector:selector=>nodes.find(n=>selector.includes('"'+n.dataset.hexKey+'"')),elementFromPoint:()=>hit};
 const player=createHexboardPlayer({document:doc,window:{addEventListener(){}},press:workspace.press,startVoice:audio.engine.startVoice});
 const fire=(name,extra={})=>handlers[name]({target:hit,button:0,buttons:1,pointerId:1,pointerType:'mouse',shiftKey:false,preventDefault(){},...extra});
 fire('pointerdown');await tick();
 hit=nodes[1];fire('pointermove');await tick();
 assert.equal(audio.oscillators.length,2);assert.equal(audio.oscillators[0].stops.length,1);
 keys.forEach((key,i)=>assert.ok(Math.abs(audio.oscillators[i].frequency.value-220*2**((key.m[0]*state.p+key.m[1]*state.g)/1200))<1e-7));
 fire('keydown',{key:'Shift'});fire('pointerup',{shiftKey:true});assert.equal(audio.oscillators[1].stops.length,0);assert.equal(painted.size,1);
 fire('keyup',{key:'Shift'});assert.equal(audio.oscillators[1].stops.length,1);assert.equal(painted.size,0);
 assert.deepEqual(audio.errors,[]);player.reset();workspace.destroy();
}
console.log('Mouse-to-layout-to-audio integration passed for ordinary, divided-octave, and tritave periods, with wrapping on/off, dragging and Shift sustain.');
