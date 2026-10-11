// Composition project data: schema, validation, atomic import, commands and undo.
// Pure data in, pure data out: no DOM, audio or app state. Pitch identity is the
// exact integer coordinate [period,generator]; ticks are 960 per quarter note.
import {validateContext} from './composition-context.mjs';

export const COMPOSITION_FORMAT='temperament-lab-composition-v1';
export const PPQ=960;
export const LIMITS=Object.freeze({
  tempoMin:20,tempoMax:400,meterNumeratorMax:32,meterDenominators:[1,2,4,8,16,32],
  tracksMax:16,clipsMax:512,eventsMax:16384,tonesMax:8,repeatMax:128,coordinateMax:10000,
  velocityMin:1,velocityMax:127,nameMax:80,fingeringMax:4096,buttonMax:4095,
  timelineQuarterNotesMax:32768,timelineSecondsMax:7200,bytesMax:8000000,
  undoCommands:100,undoBytes:32*1024*1024,
});
export const TRACK_KINDS=['chords','melody'];
export const WAVES=['sine','triangle','sawtooth','square'];

const isInt=v=>Number.isSafeInteger(v);
const fail=(path,message)=>{throw new Error(`Composition project: ${path}: ${message}`);};
const canonical=n=>n===0?0:n; // signed zero is the same coordinate as zero

export const barTicks=meter=>PPQ*4*meter.numerator/meter.denominator;
// Optional beat grouping of a bar (7/8 as [2,2,3]); absent means the grid's default grouping.
const validGroups=(groups,numerator)=>Array.isArray(groups)&&groups.length>0&&groups.every(g=>isInt(g)&&g>=1)&&groups.reduce((a,b)=>a+b,0)===numerator;
export const ticksToSeconds=(project,ticks)=>ticks*60/(project.tempo*PPQ);
export const canonicalCoordinate=m=>[canonical(m[0]),canonical(m[1])];

let idCounter=0;
export function newId(prefix,taken=new Set()){
  let id;
  do{id=`${prefix}-${(globalThis.crypto?.randomUUID?.().slice(0,8))??(Date.now().toString(36)+(++idCounter).toString(36))}`;}while(taken.has(id));
  return id;
}

export function allIds(project){
  const ids=new Set([project.id]);
  for(const t of project.tracks)ids.add(t.id);
  for(const c of project.clips){ids.add(c.id);for(const e of c.events){ids.add(e.id);for(const tone of e.tones)ids.add(tone.toneId);}}
  return ids;
}

export function createProject({name='Untitled composition',context,layout=null,tempo=100,meter={numerator:4,denominator:4},idFactory=newId}){
  validateContext(context);
  const trackIds=[idFactory('track'),idFactory('track')],clipIds=[idFactory('clip'),idFactory('clip')];
  const bar=barTicks(meter),project={
    format:COMPOSITION_FORMAT,id:idFactory('project'),name:String(name).slice(0,LIMITS.nameMax)||'Untitled composition',revision:0,
    context:structuredClone(context),layout:layout?structuredClone(layout):null,tempo,meter:{...meter},ppq:PPQ,
    tracks:[{id:trackIds[0],name:'Chords',kind:'chords',level:1,mute:false,solo:false},{id:trackIds[1],name:'Melody',kind:'melody',level:1,mute:false,solo:false}],
    clips:[
      {id:clipIds[0],trackId:trackIds[0],name:'Chords',startTick:0,lengthTick:bar*8,repeat:1,events:[]},
      {id:clipIds[1],trackId:trackIds[1],name:'Melody',startTick:0,lengthTick:bar*8,repeat:1,events:[]},
    ],
    loop:{enabled:false,startTick:0,endTick:null},sound:{wave:'triangle'},
  };
  validateProject(project);
  return project;
}

function validateEvent(e,path,clip){
  if(!e||typeof e!=='object')fail(path,'expected an event');
  if(typeof e.id!=='string'||!e.id)fail(path+'.id','expected a non-empty string');
  if(!isInt(e.startTick)||e.startTick<0)fail(path+'.startTick','expected a non-negative integer');
  if(!isInt(e.durationTick)||e.durationTick<1)fail(path+'.durationTick','expected a positive integer');
  if(e.startTick+e.durationTick>clip.lengthTick)fail(path,`ends at tick ${e.startTick+e.durationTick}, past its clip length ${clip.lengthTick}`);
  if(!isInt(e.velocity)||e.velocity<LIMITS.velocityMin||e.velocity>LIMITS.velocityMax)fail(path+'.velocity',`expected an integer ${LIMITS.velocityMin}-${LIMITS.velocityMax}`);
  if(!Array.isArray(e.tones)||e.tones.length<1||e.tones.length>LIMITS.tonesMax)fail(path+'.tones',`expected 1-${LIMITS.tonesMax} tones`);
  e.tones.forEach((tone,i)=>{
    if(typeof tone?.toneId!=='string'||!tone.toneId)fail(`${path}.tones[${i}].toneId`,'expected a non-empty string');
    const m=tone.coordinate;
    if(!Array.isArray(m)||m.length!==2||!m.every(isInt)||m.some(v=>Math.abs(v)>LIMITS.coordinateMax))fail(`${path}.tones[${i}].coordinate`,`expected two integers within ±${LIMITS.coordinateMax}`);
    if(Object.is(m[0],-0)||Object.is(m[1],-0))fail(`${path}.tones[${i}].coordinate`,'signed zero must be canonicalized to 0');
  });
  if(e.source!==undefined&&(e.source===null||typeof e.source!=='object'||Array.isArray(e.source)))fail(path+'.source','expected an object');
}

// Chosen buttons: exact coordinate "period,generator" → key index on the project's own saved layout.
function validateFingering(f){
  if(!f||typeof f!=='object'||Array.isArray(f))fail('fingering','expected an object of chosen buttons');
  const entries=Object.entries(f);
  if(entries.length>LIMITS.fingeringMax)fail('fingering',`expected at most ${LIMITS.fingeringMax} chosen buttons`);
  for(const [id,key] of entries){
    const m=/^(-?\d+),(-?\d+)$/.exec(id);
    if(!m||`${Number(m[1])},${Number(m[2])}`!==id||Math.abs(Number(m[1]))>LIMITS.coordinateMax||Math.abs(Number(m[2]))>LIMITS.coordinateMax)fail(`fingering["${id}"]`,`expected a canonical coordinate "period,generator" within ±${LIMITS.coordinateMax}`);
    if(!isInt(key)||key<0||key>LIMITS.buttonMax)fail(`fingering["${id}"]`,`expected a button number 0-${LIMITS.buttonMax}`);
  }
}

/** Throws a descriptive Error naming the first problem; never mutates its input. */
export function validateProject(p){
  if(!p||typeof p!=='object')fail('project','expected an object');
  if(p.format!==COMPOSITION_FORMAT)fail('format',`expected "${COMPOSITION_FORMAT}", got ${JSON.stringify(p.format)}`);
  if(typeof p.id!=='string'||!p.id)fail('id','expected a non-empty string');
  if(typeof p.name!=='string'||p.name.length>LIMITS.nameMax)fail('name',`expected a string up to ${LIMITS.nameMax} characters`);
  if(!isInt(p.revision)||p.revision<0)fail('revision','expected a non-negative integer');
  if(p.ppq!==PPQ)fail('ppq',`expected ${PPQ}`);
  if(typeof p.tempo!=='number'||!Number.isFinite(p.tempo)||p.tempo<LIMITS.tempoMin||p.tempo>LIMITS.tempoMax)fail('tempo',`expected ${LIMITS.tempoMin}-${LIMITS.tempoMax} quarter notes per minute`);
  const m=p.meter;
  if(!m||!isInt(m.numerator)||m.numerator<1||m.numerator>LIMITS.meterNumeratorMax||!LIMITS.meterDenominators.includes(m.denominator))fail('meter',`expected numerator 1-${LIMITS.meterNumeratorMax} over one of ${LIMITS.meterDenominators.join(', ')}`);
  if(m.groups!==undefined&&!validGroups(m.groups,m.numerator))fail('meter.groups',`expected whole beats adding up to ${m.numerator}`);
  validateContext(p.context);
  if(!Array.isArray(p.tracks)||p.tracks.length<1||p.tracks.length>LIMITS.tracksMax)fail('tracks',`expected 1-${LIMITS.tracksMax} tracks`);
  const ids=new Set([p.id]),claim=(id,path)=>{if(ids.has(id))fail(path,`duplicate id "${id}"`);ids.add(id);};
  const trackIds=new Set();
  p.tracks.forEach((t,i)=>{
    if(typeof t?.id!=='string'||!t.id)fail(`tracks[${i}].id`,'expected a non-empty string');
    claim(t.id,`tracks[${i}].id`);trackIds.add(t.id);
    if(!TRACK_KINDS.includes(t.kind))fail(`tracks[${i}].kind`,`expected one of ${TRACK_KINDS.join(', ')}`);
    if(typeof t.level!=='number'||!(t.level>=0&&t.level<=2))fail(`tracks[${i}].level`,'expected 0-2');
    if(typeof t.mute!=='boolean'||typeof t.solo!=='boolean')fail(`tracks[${i}]`,'mute and solo must be booleans');
  });
  if(!Array.isArray(p.clips)||p.clips.length>LIMITS.clipsMax)fail('clips',`expected at most ${LIMITS.clipsMax} clips`);
  let eventCount=0,endTick=0;
  p.clips.forEach((c,i)=>{
    const path=`clips[${i}]`;
    if(typeof c?.id!=='string'||!c.id)fail(path+'.id','expected a non-empty string');
    claim(c.id,path+'.id');
    if(!trackIds.has(c.trackId))fail(path+'.trackId',`references missing track "${c.trackId}"`);
    if(!isInt(c.startTick)||c.startTick<0)fail(path+'.startTick','expected a non-negative integer');
    if(!isInt(c.lengthTick)||c.lengthTick<1)fail(path+'.lengthTick','expected a positive integer');
    if(!isInt(c.repeat)||c.repeat<1||c.repeat>LIMITS.repeatMax)fail(path+'.repeat',`expected 1-${LIMITS.repeatMax}`);
    if(!Array.isArray(c.events))fail(path+'.events','expected an array');
    eventCount+=c.events.length;
    if(eventCount>LIMITS.eventsMax)fail('events',`more than ${LIMITS.eventsMax} events`);
    c.events.forEach((e,j)=>{
      validateEvent(e,`${path}.events[${j}]`,c);
      claim(e.id,`${path}.events[${j}].id`);
      e.tones.forEach((tone,k)=>claim(tone.toneId,`${path}.events[${j}].tones[${k}].toneId`));
    });
    endTick=Math.max(endTick,c.startTick+c.lengthTick*c.repeat);
  });
  if(endTick/PPQ>LIMITS.timelineQuarterNotesMax)fail('clips',`timeline exceeds ${LIMITS.timelineQuarterNotesMax} quarter notes`);
  if(ticksToSeconds(p,endTick)>LIMITS.timelineSecondsMax)fail('clips',`timeline exceeds ${LIMITS.timelineSecondsMax} seconds at this tempo`);
  const l=p.loop;
  if(!l||typeof l.enabled!=='boolean'||!isInt(l.startTick)||l.startTick<0||(l.endTick!==null&&(!isInt(l.endTick)||l.endTick<=l.startTick)))fail('loop','expected {enabled, startTick, endTick > startTick or null}');
  if(!p.sound||!WAVES.includes(p.sound.wave))fail('sound.wave',`expected one of ${WAVES.join(', ')}`);
  if(p.fingering!==undefined)validateFingering(p.fingering);
  return p;
}

export function serializeProject(project){
  validateProject(project);
  const json=JSON.stringify(project);
  if(new TextEncoder().encode(json).length>LIMITS.bytesMax)fail('project',`serialized size exceeds ${LIMITS.bytesMax} bytes`);
  return json;
}

/** Validates a candidate copy; returns a fresh project or throws, leaving everything else untouched. */
export function parseProject(input){
  let data=input;
  if(typeof input==='string'){
    if(new TextEncoder().encode(input).length>LIMITS.bytesMax)fail('project',`file exceeds ${LIMITS.bytesMax} bytes`);
    try{data=JSON.parse(input);}catch{fail('project','not valid JSON');}
  }
  if(!data||typeof data!=='object')fail('project','expected a JSON object');
  const version=/^temperament-lab-composition-v(\d+)$/.exec(String(data.format))?.[1];
  if(version&&Number(version)>1)fail('format',`version ${version} was written by a newer app; update Temperament Lab to open it`);
  const candidate=structuredClone(data);
  for(const c of candidate.clips??[])for(const e of c.events??[])for(const t of e.tones??[])if(Array.isArray(t.coordinate))t.coordinate=t.coordinate.map(v=>v===0?0:v);
  return validateProject(candidate);
}

// --- commands: (project, ...args) -> new project. All validate before returning. ---

function commit(project,mutate){
  const next=structuredClone(project);
  mutate(next);
  next.revision=project.revision+1;
  return validateProject(next);
}
const clipOf=(p,clipId)=>p.clips.find(c=>c.id===clipId)??fail('clip',`no clip "${clipId}"`);
const eventOf=(c,id)=>c.events.find(e=>e.id===id)??fail('event',`no event "${id}"`);
const growClip=(p,clip,end)=>{if(end>clip.lengthTick){const bar=barTicks(p.meter);clip.lengthTick=Math.ceil(end/bar)*bar;}};

export function makeEvent({startTick,durationTick,velocity=90,tones,source},taken){
  const ids=taken??new Set(),id=newId('evt',ids);ids.add(id);
  return {id,startTick,durationTick,velocity,
    tones:tones.map(t=>{const toneId=newId('tone',ids);ids.add(toneId);return {toneId,coordinate:canonicalCoordinate(t.coordinate)};}),
    ...(source?{source:structuredClone(source)}:{})};
}

export const addEvent=(project,clipId,event)=>commit(project,p=>{
  const clip=clipOf(p,clipId),e=structuredClone(event);
  e.tones=e.tones.map(t=>({...t,coordinate:canonicalCoordinate(t.coordinate)}));
  growClip(p,clip,e.startTick+e.durationTick);
  clip.events.push(e);
  clip.events.sort((a,b)=>a.startTick-b.startTick||a.id.localeCompare(b.id));
});

export const updateEvent=(project,clipId,eventId,patch)=>commit(project,p=>{
  const clip=clipOf(p,clipId),e=eventOf(clip,eventId);
  for(const key of ['startTick','durationTick','velocity'])if(patch[key]!==undefined)e[key]=patch[key];
  if(patch.tones)e.tones=patch.tones.map(t=>({...t,coordinate:canonicalCoordinate(t.coordinate)}));
  growClip(p,clip,e.startTick+e.durationTick);
  clip.events.sort((a,b)=>a.startTick-b.startTick||a.id.localeCompare(b.id));
});

export const removeEvent=(project,clipId,eventId)=>commit(project,p=>{
  const clip=clipOf(p,clipId);eventOf(clip,eventId);
  clip.events=clip.events.filter(e=>e.id!==eventId);
});

/**
 * Several event changes as one validated edit: events listed in `remove` go, and each `put` event
 * replaces the event with its id or is added. Clips grow by whole bars to fit.
 */
export const editEvents=(project,clipId,{remove=[],put=[]})=>commit(project,p=>{
  const clip=clipOf(p,clipId),gone=new Set(remove),replaced=new Set(put.map(e=>e.id));
  for(const id of gone)eventOf(clip,id);
  clip.events=clip.events.filter(e=>!gone.has(e.id)&&!replaced.has(e.id));
  for(const event of put){
    const e=structuredClone(event);
    e.tones=e.tones.map(t=>({...t,coordinate:canonicalCoordinate(t.coordinate)}));
    growClip(p,clip,e.startTick+e.durationTick);
    clip.events.push(e);
  }
  clip.events.sort((a,b)=>a.startTick-b.startTick||a.id.localeCompare(b.id));
});

/** Copies an event (new ids) to start at `startTick`. */
export const duplicateEvent=(project,clipId,eventId,startTick)=>commit(project,p=>{
  const clip=clipOf(p,clipId),src=eventOf(clip,eventId),taken=allIds(p);
  const copy=makeEvent({startTick,durationTick:src.durationTick,velocity:src.velocity,tones:src.tones,source:src.source},taken);
  growClip(p,clip,copy.startTick+copy.durationTick);
  clip.events.push(copy);
  clip.events.sort((a,b)=>a.startTick-b.startTick||a.id.localeCompare(b.id));
});

/** Shifts every event starting at or after `atTick` later by `lengthTick` (an inserted rest). */
export const insertGap=(project,clipId,atTick,lengthTick)=>commit(project,p=>{
  const clip=clipOf(p,clipId);
  for(const e of clip.events)if(e.startTick>=atTick)e.startTick+=lengthTick;
  growClip(p,clip,Math.max(0,...clip.events.map(e=>e.startTick+e.durationTick)));
});

/** Swaps an event with its neighbour (direction -1 earlier, +1 later), keeping any rest between them. */
export const swapAdjacent=(project,clipId,eventId,direction)=>commit(project,p=>{
  const clip=clipOf(p,clipId),order=[...clip.events].sort((a,b)=>a.startTick-b.startTick),i=order.findIndex(e=>e.id===eventId);
  if(i<0)fail('event',`no event "${eventId}"`);
  const j=i+direction;
  if(j<0||j>=order.length)return;
  const [a,b]=i<j?[order[i],order[j]]:[order[j],order[i]],start=a.startTick,gap=b.startTick-(a.startTick+a.durationTick);
  b.startTick=start;a.startTick=start+b.durationTick+gap;
  clip.events.sort((x,y)=>x.startTick-y.startTick||x.id.localeCompare(y.id));
});

export const setTempo=(project,tempo)=>commit(project,p=>{p.tempo=tempo;});
/** `meter.groups`: an array, null to use the default grouping, or omitted to keep groups that still fit. */
export const setMeter=(project,meter)=>commit(project,p=>{
  const groups=meter.groups===undefined?p.meter.groups:meter.groups;
  p.meter={numerator:meter.numerator,denominator:meter.denominator,...(validGroups(groups,meter.numerator)?{groups:[...groups]}:{})};
  if(meter.groups&&!p.meter.groups)fail('meter.groups',`expected whole beats adding up to ${meter.numerator}`);
});
export const setName=(project,name)=>commit(project,p=>{p.name=String(name).slice(0,LIMITS.nameMax);});
export const setLoop=(project,loop)=>commit(project,p=>{p.loop={enabled:!!loop.enabled,startTick:loop.startTick??0,endTick:loop.endTick??null};});
export const setWave=(project,wave)=>commit(project,p=>{p.sound={...p.sound,wave};});
export const setClipLength=(project,clipId,lengthTick)=>commit(project,p=>{clipOf(p,clipId).lengthTick=lengthTick;});
/** Chooses the button each listed exact pitch uses, or with `key: null` returns it to automatic choice. */
export const setFingering=(project,changes)=>commit(project,p=>{
  const next={...p.fingering};
  for(const {coordinate,key} of changes){const id=canonicalCoordinate(coordinate).join(',');if(key===null)delete next[id];else next[id]=key;}
  if(Object.keys(next).length)p.fingering=next;else delete p.fingering;
});

/** Resize the arrangement without removing notes or changing repeated clip content. */
export const setProjectBars=(project,bars)=>commit(project,p=>{
  if(!Number.isSafeInteger(bars)||bars<1)throw new Error('Bars must be a positive whole number');
  const end=bars*barTicks(p.meter);
  for(const c of p.clips){
    const length=(end-c.startTick)/c.repeat;
    const notesEnd=Math.max(0,...c.events.map(e=>e.startTick+e.durationTick));
    if(length<notesEnd)throw new Error('Move or delete notes beyond the new project end before reducing bars');
    if(!Number.isSafeInteger(length)||length<1)throw new Error('This bar count cannot fit the clip starts and repeats');
    c.lengthTick=length;
  }
  if(p.loop.startTick>=end)p.loop={enabled:p.loop.enabled,startTick:0,endTick:null};
  else if(p.loop.endTick!==null)p.loop.endTick=Math.min(end,p.loop.endTick);
});

/** Arrangement end including trailing rests and clip repetitions, rounded to a bar. */
export function contentEndTick(project){
  const bar=barTicks(project.meter);
  const end=Math.max(0,...project.clips.map(c=>c.startTick+c.lengthTick*c.repeat));
  return Math.max(bar,Math.ceil(end/bar)*bar);
}

/** Snapshot history with bounded depth and size. Failed commands change nothing. */
export function createHistory(initial,{maxCommands=LIMITS.undoCommands,maxBytes=LIMITS.undoBytes}={}){
  let current=initial,undoStack=[],redoStack=[];
  const size=p=>JSON.stringify(p).length;
  function trim(){
    let bytes=undoStack.reduce((n,s)=>n+s.bytes,0);
    while(undoStack.length>maxCommands||(bytes>maxBytes&&undoStack.length>0)){bytes-=undoStack[0].bytes;undoStack.shift();}
  }
  return {
    get project(){return current;},
    get canUndo(){return undoStack.length>0;},
    get canRedo(){return redoStack.length>0;},
    get depth(){return undoStack.length;},
    /** Applies `command(project)`; on any error the history is unchanged and the error propagates. */
    execute(label,command){
      const next=command(current);
      undoStack.push({label,project:current,bytes:size(current)});
      redoStack=[];current=next;trim();
      return current;
    },
    undo(){if(!undoStack.length)return current;const s=undoStack.pop();redoStack.push({label:s.label,project:current,bytes:size(current)});current=s.project;return current;},
    redo(){if(!redoStack.length)return current;const s=redoStack.pop();undoStack.push({label:s.label,project:current,bytes:size(current)});current=s.project;trim();return current;},
    /** Replaces the whole project (open/new) and clears history. */
    reset(project){current=project;undoStack=[];redoStack=[];return current;},
  };
}
