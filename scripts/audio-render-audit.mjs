// Run with an installed web-audio-engine entrypoint; no production dependency.
// node scripts/audio-render-audit.mjs /absolute/path/web-audio-engine/lib/index.js [baseline-module]
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createAudioEngine} from '../dist/audio.mjs';
const {default:renderer}=await import(pathToFileURL(process.argv[2]).href);
const baseline=process.argv[3]?(await import(pathToFileURL(process.argv[3]).href)).createAudioEngine:null;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function render(factory,scenario,wave='triangle',hz=220){
 const context=new renderer.RenderingAudioContext({sampleRate:48000,numberOfChannels:1,blockSize:128});
 const errors=[],audio=factory({createContext:()=>context,getSettings:()=>({tonic:hz,wave}),onError:e=>errors.push(e)});
 let boundary;
 if(scenario==='large-chord')await audio.playChord(Array(64).fill(0));
 else if(scenario==='sustain'){for(let i=0;i<100;i++)audio.startVoice(0);await tick();context.processTo(.15);boundary=context.currentTime;audio.stop();}
 else if(scenario==='decay'){await audio.playChord([0]);context.processTo(.3);boundary=context.currentTime;audio.stop();}
 else if(scenario==='rapid-drag'){
  let release;
  for(let i=0;i<30;i++){release?.();release=audio.startVoice((i%7)*100);await tick();context.processTo(context.currentTime+.015);}
  release();boundary=context.currentTime;audio.stop();
 }else if(scenario==='tap-stop'){
  const release=audio.startVoice(0);await tick();context.processTo(.008);release();boundary=context.currentTime;audio.stop();
 }else {const release=audio.startVoice(0);await tick();context.processTo(.25);boundary=context.currentTime;release();}
 context.processTo(1.3);assert.deepEqual(errors,[]);
 const samples=context.exportAsAudioData().channelData[0];
 const peak=samples.reduce((m,v)=>Math.max(m,Math.abs(v)),0);
 const tail=samples.slice(Math.floor(1.2*48000)).reduce((m,v)=>Math.max(m,Math.abs(v)),0);
 assert.ok(samples.every(Number.isFinite));assert.equal(tail,0,'Ended voices leave exact digital silence.');
 let last=samples.length-1;while(last>=0&&samples[last]===0)last--;
 const cutoffStep=last<0?0:Math.abs(samples[last]);
 if(factory===createAudioEngine)assert.ok(cutoffStep<1e-5,`Abrupt final cutoff in ${scenario}: ${cutoffStep}`);
 if(factory===createAudioEngine)assert.ok(peak<.951,`Output clipping in ${scenario}: ${peak}`);
 if(scenario==='tap-stop'&&factory===createAudioEngine){
  const after=samples.slice(Math.ceil((boundary+.075)*48000));assert.equal(after.reduce((m,v)=>Math.max(m,Math.abs(v)),0),0,'Stop does not leave a short-tap gate pending.');
 }
 return {scenario,wave,hz,peak:Number(peak.toFixed(6)),tail,cutoffStep};
}
for(const scenario of ['large-chord','sustain','decay','rapid-drag','tap-stop','held-release']){
 const old=baseline?await render(baseline,scenario):null;
 const result=await render(createAudioEngine,scenario);
 console.log(JSON.stringify({...result,baselinePeak:old?.peak}));
}
for(const wave of ['sine','triangle','sawtooth'])for(const hz of [15,55,440,16000])await render(createAudioEngine,'held-release',wave,hz);
console.log('PCM audit passed: 48 kHz rendering, 3 waveforms, frequency boundaries, heavy polyphony, dragging, release, Stop and digital silence.');
