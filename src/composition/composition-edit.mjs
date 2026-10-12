// Note-editing transforms for the Compose roll. Pure: events in, {remove, put} out, ready for
// `editEvents` to commit as one undoable edit. Existing notes keep their ids (and tone ids);
// new notes get fresh ids from `taken`. Times are whole ticks; nothing starts before 0 or is
// shorter than one tick. Pitch stays an exact coordinate: steps move along the composition's
// scale, periods move the first coordinate.
import {makeEvent} from './composition-project.mjs';
import {coordinateCents} from '../core/pitch.mjs';
import {degreeOf} from './composition-context.mjs';
import {snapTick,cellTicks,euclid} from './composition-grid.mjs';

const clone=e=>structuredClone(e);
const endOf=e=>e.startTick+e.durationTick;
const span=events=>({start:Math.min(...events.map(e=>e.startTick)),end:Math.max(...events.map(endOf))});
const put=events=>({remove:[],put:events});

/** Moves events by `dt` ticks; the earliest never goes before 0. */
export function shiftEvents(events,dt){
  if(!events.length)return put([]);
  const d=Math.max(Math.round(dt),-span(events).start);
  return put(events.map(e=>({...clone(e),startTick:e.startTick+d})));
}

/**
 * The coordinate `steps` scale degrees above (or below) `coordinate`, crossing into the next period
 * as needed; null for a pitch outside the scale. Degrees are ordered by pitch within their period.
 */
export function transposeSteps(ctx,coordinate,steps){
  const d=degreeOf(ctx,coordinate);
  if(!d)return null;
  const period=coordinateCents(ctx,[1,0]),degrees=ctx.scale.degrees,n=degrees.length;
  // Each degree's home pitch folded into [0, period): `lift` registers above its home coordinate.
  const folded=degrees.map(x=>{const c=coordinateCents(ctx,x.coordinate),lift=Math.floor(c/period+1e-9);return {degree:x.degree,lift,c:c-lift*period};});
  const order=[...folded].sort((a,b)=>a.c-b.c||a.degree-b.degree),rank=new Map(order.map((x,i)=>[x.degree,i]));
  const here=folded[d.degree],index=(d.register+here.lift)*n+rank.get(d.degree)+Math.round(steps);
  const level=Math.floor(index/n),to=order[index-level*n];
  return [degrees[to.degree].coordinate[0]+level-to.lift,degrees[to.degree].coordinate[1]];
}

/** Transposes by scale steps and/or whole periods. Notes outside the scale move by periods only. */
export function transposeEvents(ctx,events,{steps=0,periods=0}={}){
  return put(events.map(e=>({...clone(e),tones:e.tones.map(t=>{
    const moved=steps?transposeSteps(ctx,t.coordinate,steps)??t.coordinate:t.coordinate;
    return {...t,coordinate:[moved[0]+periods,moved[1]]};
  })})));
}

/** Moves starts (and with `ends`, ends) towards the grid by `strength` (0-1). */
export function quantizeEvents(meter,grid,events,{ends=false,strength=1}={}){
  const g={...grid,snap:true},s=Math.max(0,Math.min(1,strength));
  return put(events.map(e=>{
    const start=Math.round(e.startTick+(snapTick(meter,g,e.startTick)-e.startTick)*s);
    let end=endOf(e)+(start-e.startTick);
    if(ends)end=Math.round(endOf(e)+(snapTick(meter,g,endOf(e))-endOf(e))*s);
    if(end<=start)end=start+Math.max(1,ends?cellTicks(meter,g,start):e.durationTick);
    return {...clone(e),startTick:start,durationTick:end-start};
  }));
}

/** Splits each event into `n` equal notes (a tuplet in its own time). The first part keeps the id. */
export function splitEvents(events,n,taken){
  const out=[];
  for(const e of events){
    const parts=Math.max(1,Math.min(Math.round(n),e.durationTick));
    const cut=k=>e.startTick+Math.round(k*e.durationTick/parts);
    for(let k=0;k<parts;k++){
      const piece={startTick:cut(k),durationTick:cut(k+1)-cut(k),velocity:e.velocity,tones:e.tones,...(e.source?{source:e.source}:{})};
      out.push(k===0?{...clone(e),...piece,tones:clone(e.tones)}:makeEvent(piece,taken));
    }
  }
  return put(out);
}

/**
 * Stretches time by num/den from the earliest start: 2/3 turns straight notes into triplets,
 * 4/5 into quintuplets, 2/1 doubles every length.
 */
export function scaleEvents(events,num,den){
  if(!events.length)return put([]);
  const a=span(events).start,at=t=>a+Math.round((t-a)*num/den);
  return put(events.map(e=>{const start=at(e.startTick);return {...clone(e),startTick:start,durationTick:Math.max(1,at(endOf(e))-start)};}));
}

/** Each note lasts until the next onset among the events; the last onset keeps its length. */
export function legatoEvents(events){
  const onsets=[...new Set(events.map(e=>e.startTick))].sort((a,b)=>a-b);
  return put(events.map(e=>{const next=onsets.find(t=>t>e.startTick);return next===undefined?clone(e):{...clone(e),durationTick:next-e.startTick};}));
}

/** Retrograde: the events play backwards within their own span. */
export function reverseEvents(events){
  if(!events.length)return put([]);
  const {start,end}=span(events);
  return put(events.map(e=>({...clone(e),startTick:start+end-endOf(e)})));
}

/**
 * A Euclidean rhythm: `k` notes over `n` equal steps from `startTick` to `endTick`, each sounding
 * `gate` of its step. Steps need not match the grid, so 5 over a 4/4 bar is a quintuplet bar.
 */
export function euclidEvents({k,n,rotation=0,startTick,endTick,coordinate,velocity=90,gate=1},taken){
  const steps=Math.max(1,Math.min(Math.round(n),endTick-startTick)),pattern=euclid(k,steps,rotation),at=i=>startTick+Math.round(i*(endTick-startTick)/steps),out=[];
  pattern.forEach((hit,i)=>{if(hit)out.push(makeEvent({startTick:at(i),durationTick:Math.max(1,Math.round((at(i+1)-at(i))*Math.max(.05,Math.min(1,gate)))),velocity,tones:[{coordinate}]},taken));});
  return put(out);
}

/** Copied notes with times relative to the earliest, plus the span they cover. */
export function copyEvents(events){
  if(!events.length)return null;
  const {start,end}=span(events);
  return {span:end-start,events:events.map(e=>({offset:e.startTick-start,durationTick:e.durationTick,velocity:e.velocity,tones:e.tones.map(t=>({coordinate:[...t.coordinate]})),...(e.source?{source:clone(e.source)}:{})}))};
}
/** Clipboard notes placed from `atTick`, with fresh ids. */
export function pasteEvents(clip,atTick,taken){
  return put(clip.events.map(e=>makeEvent({startTick:Math.max(0,atTick)+e.offset,durationTick:e.durationTick,velocity:e.velocity,tones:e.tones,source:e.source},taken)));
}

/** Sets every velocity, or (with `delta`) moves each one; always 1-127. */
export function velocityEvents(events,{value,delta}={}){
  return put(events.map(e=>({...clone(e),velocity:Math.max(1,Math.min(127,Math.round(value??e.velocity+(delta??0))))})));
}
