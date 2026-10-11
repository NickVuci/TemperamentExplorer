// Rhythm game over a composition: a chart of timed targets from the cue timeline, judged against the
// player's HexBoard holds. Pure: presses arrive with the position the player heard (the transport's
// timeAt `v`, in ticks), so judging is deterministic. No DOM, audio or board hardware.
//
// Play: each press takes the nearest unjudged target of the same pitch within the Good window and is
// graded by how far off it was; a target nobody plays is missed once the window has passed. Pressing
// the right pitch a little outside the window is reported as early or late, and pressing a note just
// played again as a repeat, without a penalty; any other press is a wrong note and breaks the combo. Notes a quarter long or longer also score a hold
// when kept down to their end. Learn: time waits at each onset (the host pauses playback), until all
// its distinct pitches are held together with fresh articulations and no extra notes.
import {buildCueTimeline,boardSnapshot} from './composition-cues.mjs';
import {degreeOf} from './composition-context.mjs';
import {PPQ,barTicks} from './composition-project.mjs';

export const WINDOWS=Object.freeze({perfect:40,great:80,good:130});   // milliseconds either side
export const NEAR_MS=400;                                              // early/late feedback range
export const POINTS=Object.freeze({perfect:100,great:75,good:40,miss:0});
export const HOLD_BONUS=25;
export const HOLD_MIN_TICKS=PPQ;
export const PARTS=['melody','chords','both'];
export const MATCHES=['exact','degree'];
export const MODES=['play','learn'];
export const GRADES=[[95,'S'],[90,'A'],[80,'B'],[70,'C'],[0,'D']];
const RESULTS=['perfect','great','good','miss'];

/**
 * The part's targets that start in [from, to): one per sounding tone, in time order, with the keys
 * that play its exact pitch and the keys that play its degree in any register. A chord's tones share
 * a group. Ends are cut at `to`.
 */
export function buildChart(project,{part='melody',from=0,to=Infinity,snapshot=boardSnapshot(project)}={}){
  const cues=buildCueTimeline(project,snapshot,{ignoreMixer:true}).filter(q=>(part==='both'||q.trackKind===part)&&q.onsetTick>=from&&q.onsetTick<to);
  return {from,to:Number.isFinite(to)?to:Math.max(from,...cues.map(q=>q.releaseTick)),targets:cues.map((q,index)=>({
    id:q.cueId,index,tick:q.onsetTick,endTick:Math.max(q.onsetTick+1,Math.min(q.releaseTick,to)),coordinate:[...q.coordinate],cents:q.cents,
    degree:q.degree,register:q.register,keys:[...q.cells],degreeKeys:[...q.degreeCells],group:q.occurrenceId,track:q.trackKind,
  }))};
}

export const gradeFor=accuracy=>GRADES.find(([min])=>accuracy>=min)[1];

/**
 * A run over `chart`. `tps` is ticks per second at the playing tempo (windows are in real time);
 * `offsetMs` is the player's calibrated lag, taken off every press; `meter` names bars in the results.
 */
export function createGame(chart,{tps,match='exact',context=null,mode='play',offsetMs=0,meter={numerator:4,denominator:4},windows=WINDOWS}={}){
  if(!(tps>0))throw new Error('Rhythm game: tps must be positive.');
  const toMs=t=>t/tps*1000,goodTicks=windows.good/1000*tps;
  const keyOf=c=>{if(match==='degree'&&context){const d=degreeOf(context,c);if(d)return `d${d.degree}`;}return `c${c[0]},${c[1]}`;};
  const targets=chart.targets.map(t=>({...t,key:keyOf(t.coordinate),result:null,offsetMs:null,held:null}));
  const ticks=targets.map(t=>t.tick);
  const holds=new Map();
  const learnHolds=new Map();
  let learnTick=-Infinity;
  let combo=0,maxCombo=0,score=0,wrong=0,holdsScored=0,missCursor=0,learned=0;
  const multiplier=()=>1+Math.min(3,Math.floor(combo/10))*.5;
  const lowerBound=x=>{let lo=0,hi=ticks.length;while(lo<hi){const mid=(lo+hi)>>1;if(ticks[mid]<x)lo=mid+1;else hi=mid;}return lo;};
  const offset=(t,v)=>toMs(v-t.tick)-offsetMs;
  function judge(t,result,ms){
    t.result=result;t.offsetMs=ms;
    if(result==='miss')combo=0;else{combo++;maxCombo=Math.max(maxCombo,combo);}
    score+=Math.round((POINTS[result]??0)*multiplier());
  }
  // Wait mode: the earliest notes still to play, all starting on one tick.
  function pending(){
    const first=targets.find(t=>!t.result);
    return first?targets.filter(t=>!t.result&&t.tick===first.tick):[];
  }

  // A down belongs to the onset active when it arrived. A previously accepted sustain can remain
  // down while its written duration overlaps the next onset, but cannot articulate that onset.
  /** The next onset, distinct required/missing pitches, and held inputs that must be released. */
  function waiting(){
    const group=pending(),tick=group[0]?.tick??null;
    const required=[...new Map(group.map(t=>[t.key,t])).values()];
    const down=new Set([...learnHolds.values()].filter(h=>h.tick===tick).map(h=>h.key));
    const extras=[];
    if(tick!==null)for(const [holdId,h] of learnHolds){
      if(h.tick===tick&&required.some(t=>t.key===h.key))continue;
      if(h.acceptedUntil!==null&&h.acceptedUntil>tick)continue;
      extras.push({holdId,coordinate:[...h.coordinate],key:h.key});
    }
    return {tick,due:tick!==null&&learnTick>=tick,required,missing:required.filter(t=>!down.has(t.key)),extras};
  }
  function learnResult(fallback='partial',coordinate=null){
    const status=waiting();
    if(status.due&&!status.missing.length&&!status.extras.length){
      const group=pending(),holdIds=[];
      for(const t of group){t.result='ok';t.offsetMs=null;learned++;}
      for(const [holdId,h] of learnHolds)if(h.tick===status.tick){
        holdIds.push(holdId);
        h.acceptedUntil=Math.max(...group.filter(t=>t.key===h.key).map(t=>t.endTick));
      }
      return {kind:'learn-hit',targets:group,holdIds,result:'ok'};
    }
    return {kind:fallback,...(coordinate?{coordinate:[...coordinate]}:{}),waiting:status};
  }

  /** Clear physical holds when the host pauses or restarts; pending targets remain unchanged. */
  function clearHolds(){holds.clear();learnHolds.clear();}

  /** A down: Timed hit/early/late/repeat/wrong; Wait learn-hit with all targets, or partial/early/wrong. */
  function press(holdId,coordinate,v){
    const key=keyOf(coordinate);
    if(mode==='learn'){
      const status=waiting(),matches=status.required.some(t=>t.key===key);
      if(learnHolds.has(holdId))return learnResult(status.due?'partial':'early');
      const due=status.due&&v>=status.tick;
      learnHolds.set(holdId,{key,coordinate:[...coordinate],tick:due&&matches?status.tick:null,acceptedUntil:null});
      if(!matches){wrong++;return learnResult('wrong',coordinate);}
      return learnResult(due?'partial':'early',coordinate);
    }
    const reach=(NEAR_MS+Math.abs(offsetMs))/1000*tps;
    let best=null,near=null,again=null;
    for(let i=lowerBound(v-reach);i<targets.length&&ticks[i]<=v+reach;i++){
      const t=targets[i];
      if(t.key!==key)continue;
      const ms=offset(t,v);
      if(Math.abs(ms)>NEAR_MS)continue;
      if(t.result){if(t.result!=='miss')again??=t;continue;}
      if(Math.abs(ms)<=windows.good){if(!best||Math.abs(ms)<Math.abs(best.ms))best={t,ms};}
      else if(!near||Math.abs(ms)<Math.abs(near.ms))near={t,ms};
    }
    if(!best){
      if(near)return {kind:near.ms<0?'early':'late',target:near.t,offsetMs:near.ms};
      // Pressing a note just played again (a double tap or a bouncing key) costs nothing.
      if(again)return {kind:'repeat',target:again};
      wrong++;combo=0;return {kind:'wrong',coordinate:[...coordinate]};
    }
    const a=Math.abs(best.ms),result=a<=windows.perfect?'perfect':a<=windows.great?'great':'good';
    judge(best.t,result,best.ms);
    if(best.t.endTick-best.t.tick>=HOLD_MIN_TICKS)holds.set(holdId,best.t);
    return {kind:'hit',target:best.t,result,offsetMs:best.ms};
  }
  /** A key up: Timed hold judging; Wait reevaluates the group after removing the held input. */
  function release(holdId,v){
    if(mode==='learn'){
      if(!learnHolds.delete(holdId))return null;
      return learnResult();
    }
    const t=holds.get(holdId);
    if(!t)return null;
    holds.delete(holdId);
    if(t.held!==null)return null;
    t.held=v>=t.endTick-goodTicks;
    if(t.held){holdsScored++;score+=HOLD_BONUS;}
    return {kind:'hold',target:t,held:t.held};
  }
  /** Advance to `v`: Timed holds/misses are judged; Wait activates the due onset without misses. */
  function advance(v){
    const out=[];
    if(mode==='learn'){learnTick=v;return out;}
    for(const [id,t] of holds)if(t.held===null&&v>=t.endTick){t.held=true;holdsScored++;score+=HOLD_BONUS;holds.delete(id);out.push({kind:'hold',target:t,held:true});}
    for(;missCursor<targets.length;missCursor++){
      const t=targets[missCursor];
      if(t.result)continue;
      if(offset(t,v)<=windows.good)break;
      judge(t,'miss',null);out.push({kind:'miss',target:t});
    }
    return out;
  }
  function state(){
    const judged=targets.filter(t=>t.result),points=judged.reduce((n,t)=>n+(POINTS[t.result]??(t.result==='ok'?100:0)),0);
    return {score,combo,maxCombo,multiplier:multiplier(),wrong,judged:judged.length,total:targets.length,
      accuracy:judged.length?100*points/(100*judged.length):100,done:judged.length===targets.length};
  }
  /** Results: counts, accuracy and grade, timing tendency, and the bars that went worst. */
  function summary(){
    const counts=Object.fromEntries(RESULTS.map(r=>[r,targets.filter(t=>t.result===r).length]));
    const total=targets.length,offsets=targets.filter(t=>Number.isFinite(t.offsetMs)).map(t=>t.offsetMs);
    const mean=offsets.length?offsets.reduce((a,b)=>a+b,0)/offsets.length:0;
    const spread=offsets.length>1?Math.sqrt(offsets.reduce((a,b)=>a+(b-mean)**2,0)/(offsets.length-1)):0;
    const accuracy=mode==='learn'?(learned+wrong?100*learned/(learned+wrong):100):total?targets.reduce((n,t)=>n+(POINTS[t.result]??0),0)/total:100;
    const BIN=20,bins=Array.from({length:Math.ceil(2*windows.good/BIN)},(_,i)=>({from:-windows.good+i*BIN,to:Math.min(windows.good,-windows.good+(i+1)*BIN),count:0}));
    for(const o of offsets)bins[Math.max(0,Math.min(bins.length-1,Math.floor((o+windows.good)/BIN)))].count++;
    const bar=barTicks(meter),byBar=new Map();
    for(const t of targets){const b=Math.floor(t.tick/bar),e=byBar.get(b)??{bar:b+1,startTick:b*bar,endTick:(b+1)*bar,total:0,points:0,misses:0};e.total++;e.points+=POINTS[t.result]??(t.result==='ok'?100:0);if(t.result==='miss'||!t.result)e.misses++;byBar.set(b,e);}
    const bars=[...byBar.values()].map(e=>({...e,accuracy:e.points/e.total}));
    const weakest=bars.filter(e=>e.accuracy<90).sort((a,b)=>a.accuracy-b.accuracy||a.bar-b.bar).slice(0,3);
    return {mode,total,counts,learned,wrong,score,maxCombo,holds:holdsScored,accuracy,grade:gradeFor(accuracy),
      fullCombo:total>0&&counts.miss===0&&wrong===0&&targets.every(t=>t.result),
      timing:{mean,spread,count:offsets.length,bins},bars,weakest};
  }
  return {press,release,advance,state,summary,pending,waiting,clearHolds,targets,get mode(){return mode;},get tps(){return tps;}};
}
