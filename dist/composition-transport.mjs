// Composition transport: expands a project into timed occurrences and plays them
// through the shared audio engine with a bounded lookahead pump.
//
// Time is integer ticks (960 per quarter). "Virtual" ticks increase forever across
// loop iterations; audio seconds are always computed from an integer virtual tick as
// anchor + (tick - startTick) * 60 / (tempo * 960), so nothing accumulates float error.
import {PPQ,contentEndTick} from './composition-project.mjs';
import {resolveTone} from './composition-context.mjs';

export const GROUP='transport';
export const LOOKAHEAD_SECONDS=.25;
export const PUMP_MS=50;
export const START_DELAY_SECONDS=.06;
export const GRACE_SECONDS=.1;

/** All sounding occurrences in absolute ticks, honouring clip repeats, mute and solo. */
export function expandProject(project,{ignoreMixer=false}={}){
  const soloed=project.tracks.some(t=>t.solo),tracks=new Map(project.tracks.map(t=>[t.id,t])),out=[];
  for(const clip of project.clips){
    const track=tracks.get(clip.trackId);
    if(!ignoreMixer&&(track.mute||(soloed&&!track.solo)))continue;
    for(let r=0;r<clip.repeat;r++){
      const base=clip.startTick+r*clip.lengthTick;
      for(const e of clip.events)out.push({
        occId:`${e.id}#${r}`,eventId:e.id,trackId:clip.trackId,clipId:clip.id,repeatIndex:r,
        startTick:base+e.startTick,endTick:base+e.startTick+e.durationTick,
        velocity:Math.min(127,Math.max(1,Math.round(e.velocity*track.level))),tones:e.tones,
      });
    }
  }
  return out.sort((a,b)=>a.startTick-b.startTick||(a.occId<b.occId?-1:a.occId>b.occId?1:0));
}

export function createPlan(project){
  const occurrences=expandProject(project),end=contentEndTick(project);
  const l=project.loop,start=l.startTick,stop=l.endTick??end;
  return {occurrences,starts:occurrences.map(o=>o.startTick),end,loop:{enabled:l.enabled&&stop>start,start,end:stop}};
}

function lowerBound(arr,x){let lo=0,hi=arr.length;while(lo<hi){const mid=(lo+hi)>>1;if(arr[mid]<x)lo=mid+1;else hi=mid;}return lo;}

/**
 * Occurrences that must be started for the virtual-tick window [loV, hiV), given the
 * play start `pos0`. A note that crosses the loop end is released at the boundary; the
 * next iteration retriggers only notes that start inside the loop. With `includeCrossing`
 * (play, resume, seek) notes already sounding at `pos0` restart with their remaining length.
 */
export function planWindow(plan,{pos0,loV,hiV,includeCrossing=false}){
  const {occurrences:occ,starts,loop,end}=plan,voices=[];
  const emit=(o,Vs,a,b,cycle)=>{
    const onset=Math.max(o.startTick,a),release=Math.min(o.endTick,b);
    voices.push({occId:o.occId,eventId:o.eventId,trackId:o.trackId,cycle,tones:o.tones,velocity:o.velocity,onsetV:Vs+(onset-a),releaseV:Vs+(release-a)});
  };
  const segment=(Vs,a,b,cycle)=>{
    const ov0=Math.max(loV,Vs),ov1=Math.min(hiV,Vs+(b-a));
    if(ov0>=ov1)return;
    const ra=a+(ov0-Vs),rb=a+(ov1-Vs);
    if(includeCrossing&&cycle===0&&ov0===pos0){
      for(let i=0,n=lowerBound(starts,ra);i<n;i++)if(occ[i].endTick>ra)emit(occ[i],Vs,a,b,cycle);
    }
    for(let i=lowerBound(starts,ra);i<occ.length&&starts[i]<rb;i++)emit(occ[i],Vs,a,b,cycle);
  };
  if(!loop.enabled){segment(pos0,pos0,end,0);return voices;}
  const len=loop.end-loop.start;
  if(pos0<loop.end)segment(pos0,pos0,loop.end,0);
  if(hiV>loop.end){
    const first=Math.max(1,Math.floor((loV-loop.end)/len)+1),last=Math.floor((hiV-1-loop.end)/len)+1;
    for(let j=first;j<=last;j++)segment(loop.end+(j-1)*len,loop.start,loop.end,j);
  }
  return voices;
}

export function createTransport({getProject,audio,timer={set:(fn,ms)=>setInterval(fn,ms),clear:id=>clearInterval(id)},onState=()=>{},lookahead=LOOKAHEAD_SECONDS}){
  let state='stopped',position=0,project=null,plan=null,pos0=0,anchorAudio=0,anchorClock=0,scheduledV=0,includeCrossing=false,timerId=null,token=0;

  const tps=()=>project.tempo*PPQ/60;
  const emit=(event,detail)=>onState(event,detail);

  function realTick(v){
    if(plan.loop.enabled&&v>=plan.loop.end){const len=plan.loop.end-plan.loop.start;return plan.loop.start+((v-plan.loop.end)%len);}
    return Math.min(v,plan.end);
  }
  function currentTick(){
    if(state!=='playing')return position;
    const snap=audio.getClockSnapshot(),v=Math.floor(pos0+(snap.audioSeconds-anchorAudio)*tps());
    return v<=pos0?pos0:realTick(v);
  }
  function clearTimer(){if(timerId!==null){timer.clear(timerId);timerId=null;}}
  function halt(reason,newState='paused'){
    position=currentTickSafe();
    token++;clearTimer();audio.cancelGroup(GROUP);state=newState;emit(reason,{tick:position});
  }
  // Position even if the clock is no longer running (suspended context freezes it).
  function currentTickSafe(){try{return currentTick();}catch{return position;}}

  function pump(){
    if(state!=='playing')return;
    const snap=audio.getClockSnapshot();
    if(snap.state!=='running'||snap.clockRevision!==anchorClock){halt('suspended');return;}
    const rate=tps(),nowV=pos0+(snap.audioSeconds-anchorAudio)*rate;
    if(!plan.loop.enabled&&nowV>=plan.end+GRACE_SECONDS*rate){
      token++;clearTimer();audio.cancelGroup(GROUP);position=0;state='stopped';emit('ended',{tick:plan.end});return;
    }
    const hiV=Math.floor(nowV+lookahead*rate)+1;
    let loV=scheduledV,resynced=false;
    // Never replay what a throttled timer missed: skip it and carry on from "now".
    const floor=Math.ceil(nowV-GRACE_SECONDS*rate);
    if(loV<floor){loV=floor;resynced=true;}
    if(hiV>loV){
      const voices=planWindow(plan,{pos0,loV,hiV,includeCrossing:includeCrossing&&loV===pos0});
      includeCrossing=false;
      const ctx=project.context,list=[];
      for(const v of voices){
        const onset=anchorAudio+(v.onsetV-pos0)/rate,release=anchorAudio+(v.releaseV-pos0)/rate;
        for(const tone of v.tones)list.push({
          voiceId:`${v.occId}:${tone.toneId}:${v.cycle}`,cents:resolveTone(ctx,tone.coordinate).cents,
          onsetAudioSeconds:onset,releaseAudioSeconds:release,velocity:v.velocity,chordSize:v.tones.length,
        });
      }
      if(list.length)audio.scheduleVoices(list,{groupId:GROUP,settings:{tonic:ctx.tonicHz,wave:project.sound.wave}});
    }
    scheduledV=Math.max(scheduledV,hiV);
    if(resynced)emit('resync',{skippedTo:floor});
  }

  async function play(){
    if(state==='playing')return;
    const mine=++token;
    try{await audio.prepare();}catch(error){if(mine===token)emit('error',{error});return;}
    if(mine!==token)return; // stopped, paused or seeked while the audio context was resuming
    project=getProject();plan=createPlan(project);
    let p=position;
    if(plan.loop.enabled?p>=plan.loop.end:p>=plan.end)p=plan.loop.enabled?plan.loop.start:0;
    const snap=audio.getClockSnapshot();
    if(snap.state!=='running'){emit('error',{error:new Error('Audio is not running.')});return;}
    pos0=p;anchorAudio=snap.audioSeconds+START_DELAY_SECONDS;anchorClock=snap.clockRevision;
    scheduledV=pos0;includeCrossing=true;state='playing';
    timerId=timer.set(pump,PUMP_MS);
    emit('playing',{tick:pos0});
    pump();
  }

  function pause(){if(state!=='playing')return;halt('paused');}
  function stop(){token++;clearTimer();audio.cancelGroup(GROUP);const was=state;position=0;state='stopped';if(was!=='stopped')emit('stopped',{tick:0});}
  async function seek(tick){
    const wasPlaying=state==='playing';
    token++;clearTimer();audio.cancelGroup(GROUP);
    position=Math.max(0,Math.floor(tick));
    if(wasPlaying){state='paused';await play();}
  }
  /** A project edit or context change: sound stops, the position is kept, and the next play uses the new project. */
  function invalidate(){if(state==='playing')halt('invalidated');plan=null;}

  return {play,pause,stop,seek,pump,invalidate,dispose:stop,
    get state(){return state;},position:currentTick};
}
