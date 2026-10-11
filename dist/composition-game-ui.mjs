// Play controller for Compose. It runs the engine (composition-game.mjs) over the
// open composition: the shared transport plays the backing (your part muted, quiet or full) with its
// count-in and metronome, and the board player's holds (screen board, computer keys, physical
// HexBoard) are judged at the time the player heard. It draws the note highway and the approach
// rings each frame, waits at each note in Learn mode, calibrates timing, keeps best scores and lights
// the physical HexBoard. Rendering of each phase lives in composition-game-view.mjs.
import {buildChart,createGame,WINDOWS,PARTS,MATCHES,MODES} from './composition-game.mjs';
import {heardSeconds,CLICK} from './composition-transport.mjs';
import {PPQ,barTicks,contentEndTick} from './composition-project.mjs';
import {degreeOf,resolveTone} from './composition-context.mjs';
import {mosLayers,keyColor} from './hexboard-colors.mjs';
import {compositionDeviceSnapshot} from './composition-board.mjs';
import {suggestedRoute} from './composition-game-route.mjs';

export const SPEEDS=[50,75,100];
export const GUIDES=[['off','Muted'],['quiet','Quiet guide'],['full','Full']];
export const LEADS=[[1.2,'Close'],[2,'Normal'],[3,'Far']];
export const SECTIONS=[['all','Whole piece'],['loop','Loop region'],['bars','Bars'],['selected','Selected chord']];
export const LANE_HEIGHT=30,HIT_X=96;
const SETTINGS_KEY='temperament-lab-game-settings',OFFSET_KEY='temperament-lab-game-offset',BEST_KEY='temperament-lab-game-best';
const CAL_CLICKS=12,CAL_SKIP=4,CAL_BPM=90;
const DEFAULTS=Object.freeze({part:'melody',match:'exact',mode:'play',speed:100,guide:'quiet',click:true,countIn:1,lead:2,section:'all',fromBar:1,toBar:4,trainer:false,targetSpeed:100,repeat:false,hints:true});
const FLASH_MS=260,FEEDBACK_MS=700;
const RESULT_TEXT={perfect:'Perfect',great:'Great',good:'Good',miss:'Miss',ok:'Yes'};

function browserStorage(){
  return {get(key){try{return JSON.parse(globalThis.localStorage?.getItem(key)??'null');}catch{return null;}},
    set(key,value){try{globalThis.localStorage?.setItem(key,JSON.stringify(value));}catch{/* storage is optional */}}};
}
const pick=(list,value,fallback)=>list.includes(value)?value:fallback;
export function normalizeSettings(s={}){
  const int=(v,lo,hi,d)=>{const n=Math.round(Number(v));return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):d;};
  return {
    part:pick(PARTS,s.part,DEFAULTS.part),match:pick(MATCHES,s.match,DEFAULTS.match),mode:pick(MODES,s.mode,DEFAULTS.mode),
    speed:int(s.speed,10,200,DEFAULTS.speed),guide:pick(GUIDES.map(g=>g[0]),s.guide,DEFAULTS.guide),click:s.click===undefined?DEFAULTS.click:!!s.click,
    countIn:int(s.countIn,0,2,DEFAULTS.countIn),lead:pick(LEADS.map(l=>l[0]),Number(s.lead),DEFAULTS.lead),section:pick(SECTIONS.map(x=>x[0]),s.section,DEFAULTS.section),
    fromBar:int(s.fromBar,1,9999,DEFAULTS.fromBar),toBar:int(s.toBar,1,9999,DEFAULTS.toBar),trainer:!!s.trainer,
    targetSpeed:int(s.targetSpeed,10,200,DEFAULTS.targetSpeed),repeat:!!s.repeat,hints:s.hints===undefined?DEFAULTS.hints:!!s.hints,
  };
}
const median=list=>{const s=[...list].sort((a,b)=>a-b),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const signedMs=ms=>`${ms>0?'+':ms<0?'−':''}${Math.abs(Math.round(ms))} ms`;
// A colour pulled towards black, for keys that are not part of the next notes.
const dim=(hex,f)=>`#${[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*f).toString(16).padStart(2,'0')).join('')}`;

export function createGameController({document:doc,audio,transport,getProject,getBoard,refresh,notify=()=>{},
  getSelectedSection=()=>null,getExportMatch=()=> 'exact-coordinate',releaseHeld=()=>{},
  raf=globalThis.requestAnimationFrame?.bind(globalThis),cancel=globalThis.cancelAnimationFrame?.bind(globalThis),
  storage=browserStorage(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),now=()=>globalThis.performance?.now?.()??Date.now()}){
  let settings=normalizeSettings(storage.get(SETTINGS_KEY)??{}),offsetMs=Number.isFinite(storage.get(OFFSET_KEY))?storage.get(OFFSET_KEY):null;
  let phase='setup',chart=null,engine=null,summary=null,message='',frame=null,stopping=false,paused=false,waitingTick=null;
  let calibration=null,calTimer=null,ppt=0,rings=new Set(),feedback=null,route=new Map();
  let run=null,revision=0,pass=0,previewTick=null,repeatTimer=null,repeatCountdown=null;
  let fingeringProject=null,fingeringIdentity=null,buttonUse=0,preferenceVersion=0,previewRouteCache=null;
  const playedButtons=new Map();
  const flashes=new Map(),inputKeys=new Map(); // key index → flash; hold id → actual board key
  const quiet=fn=>{stopping=true;try{fn();}finally{stopping=false;}};
  const save=()=>storage.set(SETTINGS_KEY,settings);
  const active=()=>run?.settings??settings;
  const playingProject=()=>run?.project??getProject();
  const playingBoard=()=>run?.board??getBoard();
  const matchingKeys=(t,s=active())=>s.match==='degree'&&t.degree!==null?t.degreeKeys:t.keys;

  // ---- what is played ----
  function section(p,s=settings){
    const end=contentEndTick(p),bar=barTicks(p.meter);
    if(s.section==='loop')return p.loop.endTick!==null?{from:p.loop.startTick,to:p.loop.endTick}:{unavailable:'Set a loop region in Compose, or choose another section.'};
    if(s.section==='selected'){
      const selected=getSelectedSection();
      return selected&&selected.to>selected.from?{from:selected.from,to:selected.to}:{unavailable:'Select a chord in Compose, or choose another section.'};
    }
    if(s.section==='bars'){
      if(s.fromBar>s.toBar)return {unavailable:'The last bar must be at or after the first bar.'};
      if(s.fromBar>Math.round(end/bar)||s.toBar>Math.round(end/bar))return {unavailable:'This bar range is outside the composition. Choose another section or bar range.'};
      return {from:(s.fromBar-1)*bar,to:Math.min(end,s.toBar*bar)};
    }
    return {from:0,to:end};
  }
  /** The project the transport plays during a run: your part muted, quiet or full, at the chosen speed. */
  function playbackProject(p){
    if(!p)return p;
    p=playingProject();const s=active(),mine=t=>s.part==='both'||t.kind===s.part;
    return {...p,tempo:p.tempo*s.speed/100,loop:{enabled:false,startTick:0,endTick:null},
      tracks:p.tracks.map(t=>mine(t)?{...t,mute:s.guide==='off',solo:false,level:s.guide==='quiet'?Math.min(t.level,.3):t.level}:{...t,solo:false})};
  }
  const bestKey=(p,s,range)=>[p.id,s.part,s.match,s.speed,range.from,range.to].join('|');
  const bestFor=key=>storage.get(BEST_KEY)?.[key]??null;
  function setupInfo(){
    const p=getProject();if(!p)return {section:null,targets:[],unreachable:[]};
    const range=section(p);
    const targets=range.unavailable?[]:buildChart(p,{part:settings.part,from:range.from,to:range.to}).targets;
    return {section:range,targets,unreachable:targets.filter(t=>!matchingKeys(t,settings).length)};
  }
  function noteName(coordinate){
    const p=playingProject(),d=p&&degreeOf(p.context,coordinate);
    return d?`${d.degree}${d.register?(d.register>0?'+':'')+d.register:''}`:coordinate.join(',');
  }
  function previewInfo(info=setupInfo()){
    const ticks=[...new Set(info.targets.map(t=>t.tick))];
    if(!ticks.includes(previewTick))previewTick=ticks[0]??null;
    const notes=info.targets.filter(t=>t.tick<=previewTick&&t.endTick>previewTick);
    return {hasNotes:!!ticks.length,text:previewTick===null?'No notes in this part and section.':`Notes ${[...new Set(notes.map(t=>noteName(t.coordinate)))].join(' · ')}`,ticks,notes};
  }
  function preview(action){
    if(phase!=='setup')return;
    const info=setupInfo(),v=previewInfo(info),i=v.ticks.indexOf(previewTick);
    if(!v.hasNotes)return;
    if(action==='first')previewTick=v.ticks[0];
    if(action==='prev')previewTick=v.ticks[(i-1+v.ticks.length)%v.ticks.length];
    if(action==='next')previewTick=v.ticks[(i+1)%v.ticks.length];
    const notes=previewInfo(info).notes;
    rings=previewKeys(info,notes);
    void audio.previewChord?.(notes.map(t=>t.cents));refresh();
  }
  function hearCurrent(){
    if(phase==='running'&&waitingTick!==null)void audio.previewChord?.(engine.waiting().required.map(t=>t.cents));
  }

  // ---- lanes and colours: one lane per pitch (exact) or degree (any octave), highest first ----
  function keyColors(p,board){
    const out=new Map();if(!board||!p.layout)return out;
    try{const colors=mosLayers(p.context.state,p.layout,board);for(const k of board.keys)if(!k.command&&k.enabled){const id=k.m.join(',');if(!out.has(id))out.set(id,keyColor(k,colors));}}catch{/* colours are decoration */}
    return out;
  }
  // Button preferences belong to the open piece and physical pitch layout, not to one scored pass.
  function syncFingering(p,board){
    if(p===fingeringProject)return;
    const identity=p?JSON.stringify([p.id,board?.keys.map(k=>[k.enabled,k.m])]):null;
    if(identity!==fingeringIdentity){playedButtons.clear();buttonUse=0;preferenceVersion++;previewRouteCache=null;fingeringIdentity=identity;}
    fingeringProject=p;
  }
  /** Suggest straight fingerings, giving the player's previously used matching buttons priority. */
  function routeFor(p,targets,board){
    syncFingering(p,board);
    return suggestedRoute(targets,board,{center:p?.layout?.center??65,match:active().match,played:playedButtons});
  }
  function previewKeys(info,notes){
    const p=getProject(),board=getBoard(),s=active();syncFingering(p,board);
    if(!active().hints)return new Set();
    const {from,to}=info.section??{},cached=previewRouteCache;
    if(!cached||cached.project!==p||cached.part!==s.part||cached.match!==s.match||cached.from!==from||cached.to!==to||cached.version!==preferenceVersion){
      previewRouteCache={project:p,part:s.part,match:s.match,from,to,version:preferenceVersion,route:routeFor(p,info.targets,board)};
    }
    const suggested=previewRouteCache.route;
    return new Set(notes.map(t=>suggested.get(t.index)).filter(k=>k!==undefined));
  }
  function rememberButton(event){
    if(event?.type!=='down'||!['setup','running'].includes(phase))return false;
    const p=playingProject(),board=playingBoard(),index=Number(event.keyId),key=board?.keys[index];
    if(!p||!Number.isInteger(index)||!key?.enabled||key.command||key.m.join(',')!==event.coordinate?.join(','))return false;
    syncFingering(p,board);
    let previous=null,order=-Infinity;
    for(const [id,use] of playedButtons){
      const other=board.keys[id],matches=active().match==='degree'&&key.degree>=0?other.degree===key.degree:other.m.join(',')===key.m.join(',');
      if(matches&&use>order){previous=id;order=use;}
    }
    playedButtons.set(index,++buttonUse);
    if(previous===index)return false;
    preferenceVersion++;return true;
  }
  function updatePreviewHints(){
    const info=setupInfo(),next=previewKeys(info,previewInfo(info).notes);
    for(const k of rings)if(!next.has(k)){
      doc.querySelector?.(`[data-comp-key="${k}"]`)?.classList.remove('game-now');
      const ring=doc.querySelector?.(`[data-game-ring="${k}"]`);if(ring){ring.style.opacity='0';ring.style.transform='';}
    }
    rings=next;
    resumePreview();
  }
  function resumePreview(){
    for(const k of rings){
      doc.querySelector?.(`[data-comp-key="${k}"]`)?.classList.add('game-now');
      const ring=doc.querySelector?.(`[data-game-ring="${k}"]`);if(ring){ring.style.opacity='1';ring.style.transform='scale(1)';}
    }
  }
  function lanesFor(p,targets){
    const s=active(),colors=keyColors(p,playingBoard()),lanes=new Map();
    for(const t of targets){
      const id=s.match==='degree'&&t.degree!==null?`d${t.degree}`:t.coordinate.join(',');
      if(!lanes.has(id))lanes.set(id,{id,degree:t.degree,register:s.match==='degree'?0:t.register,cents:s.match==='degree'&&t.degree!==null?resolveTone(p.context,p.context.scale.degrees[t.degree].coordinate).cents:t.cents,color:colors.get(t.coordinate.join(','))??'#829cff'});
    }
    return [...lanes.values()].sort((a,b)=>b.cents-a.cents);
  }

  // ---- a run ----
  function cancelRepeat(){clearTimer(repeatTimer);repeatTimer=null;repeatCountdown=null;}
  function cleanAudio(){engine?.clearHolds();inputKeys.clear();releaseHeld();audio.cancelGroup?.('preview');}
  function nextBoundary(){
    const next=active().mode==='learn'?engine.pending()[0]:null;
    return {untilTick:next?.tick??chart.to,boundary:next?'pause':'end',graceMs:next?0:WINDOWS.good+Math.max(0,run.offsetMs)+1};
  }
  async function playRun(countIn=0){
    const mine=revision;
    await transport.play({...nextBoundary(),countIn});
    if(mine!==revision)return;
    if(transport.state==='playing')loop();
  }
  function start({repeating=false}={}){
    const p=getProject();if(!p)return;
    cancelRepeat();
    const info=setupInfo();
    if(info.section.unavailable){message=info.section.unavailable;refresh();return;}
    const {from,to}=info.section,c=buildChart(p,{part:settings.part,from,to});
    if(!c.targets.length){message='There are no notes to play in this part and section. Choose another part or section.';refresh();return;}
    if(info.unreachable.length){message='Some notes have no playable key. Change the matching rule, section or composition layout.';refresh();return;}
    const mine=++revision;
    quiet(()=>transport.stop());
    cleanAudio();
    run={project:p,board:getBoard(),settings:{...settings},offsetMs:offsetMs??0,section:{from,to},bestKey:bestKey(p,settings,{from,to})};
    pass=repeating?pass+1:1;
    chart=c;summary=null;message='';paused=false;waitingTick=null;feedback=null;flashes.clear();rings=new Set();ppt=0;
    engine=createGame(chart,{tps:p.tempo*run.settings.speed/100*PPQ/60,match:run.settings.match,context:p.context,mode:run.settings.mode,offsetMs:run.offsetMs,meter:p.meter});
    route=routeFor(p,engine.targets,run.board);
    phase='running';refresh();
    void transport.seek(from).then(()=>{if(mine===revision&&phase==='running'&&!paused)return playRun(run.settings.countIn);});
  }
  function finish(){
    if(phase!=='running'||!engine)return;
    ++revision;
    quiet(()=>transport.stop());stopLoop();
    summary=engine.summary();
    const s=active();
    if(s.mode==='play'){
      const key=run.bestKey,previous=bestFor(key);
      summary.previousBest=previous;summary.newBest=!previous||summary.score>previous.score;
      if(summary.newBest){const all=storage.get(BEST_KEY)??{};all[key]={score:summary.score,accuracy:summary.accuracy,grade:summary.grade,date:new Date().toISOString().slice(0,10)};storage.set(BEST_KEY,all);}
      if(s.trainer)summary.nextSpeed=summary.accuracy>=90&&s.speed<s.targetSpeed?Math.min(s.targetSpeed,s.speed+5):s.speed;
    }
    phase='results';waitingTick=null;cleanAudio();refresh();
    if(s.repeat){
      if(s.mode==='learn')again(true);
      else{repeatCountdown={seconds:3,paused:false};refresh();scheduleRepeat();}
    }
  }
  function scheduleRepeat(){
    const mine=revision;
    repeatTimer=setTimer(()=>{
      repeatTimer=null;
      if(mine!==revision||phase!=='results'||!repeatCountdown||repeatCountdown.paused)return;
      if(--repeatCountdown.seconds<=0){again(true);return;}
      refresh();scheduleRepeat();
    },1000);
  }
  function again(repeating=false){
    const s=active();settings={...s,speed:summary?.nextSpeed??s.speed};save();
    start({repeating});
  }
  function quit(){leave();message='';refresh();}
  function pause(){
    audio.cancelGroup?.('preview');
    if(phase==='setup'){cleanAudio();return;}
    if(phase==='calibrating'){quit();return;}
    if(phase==='results'&&repeatCountdown){repeatCountdown.paused=true;clearTimer(repeatTimer);repeatTimer=null;refresh();return;}
    if(phase!=='running'||paused)return;
    ++revision;paused=true;quiet(()=>transport.pause());cleanAudio();paintOverlay();refresh();
  }
  function togglePause(){
    if(phase==='results'&&repeatCountdown){
      if(repeatCountdown.paused){repeatCountdown.paused=false;refresh();scheduleRepeat();}else pause();
      return;
    }
    if(phase!=='running')return;
    if(!paused){pause();return;}
    paused=false;
    if(waitingTick===null)void playRun(active().countIn?1:0);
    paintOverlay();refresh();
  }
  const goodTicks=()=>WINDOWS.good/1000*engine.tps;

  // ---- input from the board player ----
  function input(event){
    if(phase==='calibrating'){tap(event);return;}
    const remembered=rememberButton(event);
    if(phase==='setup'){if(remembered)updatePreviewHints();return;}
    if(phase!=='running'||!engine||!event?.holdId)return;
    if(remembered){
      const fixed=engine.targets.map(t=>t.result&&route.has(t.index)?{...t,keys:[route.get(t.index)],degreeKeys:[route.get(t.index)]}:t);
      route=routeFor(run.project,fixed,run.board);
    }
    const v=transport.timeAt(event.t).v;
    if(paused){if(event.type==='up')engine.release(event.holdId,v);return;}
    if(event.type==='down')inputKeys.set(event.holdId,event.keyId);else inputKeys.delete(event.holdId);
    // The timer owns due activation; input cannot advance ahead during count-in or between cues.
    const r=event.type==='down'?engine.press(event.holdId,event.coordinate,v):engine.release(event.holdId,v);
    react(r,event.keyId);
    if(r?.kind==='learn-hit'&&waitingTick!==null){waitingTick=null;audio.cancelGroup?.('preview');void playRun();}
    if(phase==='running')paint(transport.position());
  }
  function flash(keys,cls){
    const until=now()+FLASH_MS;
    for(const id of keys){
      const k=Number(id),previous=flashes.get(k);
      if(previous&&previous.cls!==cls)doc.querySelector?.(`[data-comp-key="${k}"]`)?.classList.remove(`game-flash-${previous.cls}`);
      flashes.set(k,{cls,until});
    }
  }
  function say(text,cls){feedback={text,cls,until:now()+FEEDBACK_MS};}
  function react(r,keyId){
    if(!r)return;
    const keys=keyId!==undefined&&keyId!==null?[keyId]:[];
    if(r.kind==='learn-hit'){
      for(const t of r.targets)markNote(t);
      flash((r.holdIds??[]).map(id=>inputKeys.get(id)).filter(k=>k!==undefined&&k!==null),'ok');
      say('Yes','ok');
    }else if(r.kind==='hit'){
      flash(keys.length?keys:route.has(r.target.index)?[route.get(r.target.index)]:[],r.result);
      say(r.result==='ok'?'Yes':`${RESULT_TEXT[r.result]}${Number.isFinite(r.offsetMs)&&Math.abs(r.offsetMs)>=10?` · ${Math.abs(Math.round(r.offsetMs))} ms ${r.offsetMs<0?'early':'late'}`:''}`,r.result);
      markNote(r.target);
    }else if(r.kind==='miss'){flash(route.has(r.target.index)?[route.get(r.target.index)]:[],'miss');say('Miss','miss');markNote(r.target);}
    else if(r.kind==='wrong'){flash(keys,'wrong');say('Wrong note','wrong');}
    else if(r.kind==='early'||r.kind==='late'){flash(keys,'near');say(active().mode==='learn'?'Wait for the next notes':r.kind==='early'?'Too early':'Too late','near');}
    else if(r.kind==='hold'&&r.held)say('Held','held');
  }
  function markNote(t){const el=doc.querySelector?.(`[data-game-note="${t.index}"]`);if(el)el.className=`game-note is-${t.result}`;}

  // ---- each frame ----
  function loop(){if(frame===null&&raf)frame=raf(step);}
  function stopLoop(){if(frame!==null){cancel?.(frame);frame=null;}}
  function step(){
    frame=null;
    if(phase!=='running'||!engine)return;
    const at=transport.timeAt();
    if(transport.state==='playing'&&!at.countIn&&active().mode==='play'){
      for(const e of engine.advance(at.v))react(e);
    }
    paint(transport.state==='playing'?at.v:transport.position());
    loop();
  }
  function paint(v){
    const s=active();
    const highway=doc.querySelector?.('[data-game-highway]'),track=doc.querySelector?.('[data-game-track]');
    if(highway&&track){
      const width=highway.clientWidth||0,next=width>HIT_X?(width-HIT_X)/(s.lead*engine.tps):ppt;
      if(next&&Math.abs(next-ppt)>1e-9){ppt=next;track.style.setProperty('--ppt',String(ppt));}
      track.style.transform=`translateX(${HIT_X-(v-chart.from)*ppt}px)`;
    }
    // Approach rings: each suggested key's next note shrinks its ring onto the key over the lead time;
    // the key outlines as the note gets close and fills when it is due.
    const lead=s.lead*engine.tps,soon=new Map();
    if(s.hints)for(const t of engine.targets){
      if(t.tick<v-goodTicks())continue;
      if(t.tick>v+lead)break;
      const k=route.get(t.index);
      if(t.result||k===undefined)continue;
      if(!soon.has(k))soon.set(k,(t.tick-v)/lead);
    }
    for(const k of rings)if(!soon.has(k)){const ring=doc.querySelector?.(`[data-game-ring="${k}"]`);if(ring){ring.style.opacity='0';ring.style.transform='';}const key=doc.querySelector?.(`[data-comp-key="${k}"]`);key?.classList.remove('game-soon');key?.classList.remove('game-now');}
    const nowFraction=Math.min(.08,WINDOWS.great/1000*engine.tps/lead);
    for(const [k,f] of soon){
      const ring=doc.querySelector?.(`[data-game-ring="${k}"]`);
      if(ring){const x=Math.max(0,f);ring.style.opacity=String(Math.min(1,.3+.7*(1-x)));ring.style.transform=`scale(${1+1.6*x})`;}
      const key=doc.querySelector?.(`[data-comp-key="${k}"]`);
      key?.classList.toggle('game-soon',f<.4);key?.classList.toggle('game-now',Math.abs(f)<=nowFraction);
    }
    rings=new Set(soon.keys());
    const t=now();
    for(const [k,f] of flashes){const el=doc.querySelector?.(`[data-comp-key="${k}"]`);if(f.until<t){el?.classList.remove(`game-flash-${f.cls}`);flashes.delete(k);}else el?.classList.add(`game-flash-${f.cls}`);}
    paintHud(v);paintOverlay();
  }
  function paintHud(v){
    const s=engine.state(),learn=active().mode==='learn',set=(sel,text)=>{const el=doc.querySelector?.(sel);if(el&&el.textContent!==text)el.textContent=text;};
    set('[data-game-score]',learn?`${s.judged} / ${s.total}`:s.score.toLocaleString('en'));
    set('[data-game-combo]',!learn&&s.combo>1?`${s.combo} combo${s.multiplier>1?` · ×${s.multiplier}`:''}`:'');
    set('[data-game-accuracy]',learn?'':`${s.accuracy.toFixed(1)}%`);
    const bar=doc.querySelector?.('[data-game-progress]');if(bar)bar.style.width=`${learn?100*s.judged/Math.max(1,s.total):Math.max(0,Math.min(100,100*(v-chart.from)/Math.max(1,chart.to-chart.from)))}%`;
    const fb=doc.querySelector?.('[data-game-feedback]');
    if(fb){const live=feedback&&feedback.until>now();const text=live?feedback.text:'';if(fb.textContent!==text){fb.textContent=text;fb.className=`game-feedback${live?` is-${feedback.cls}`:''}`;}}
  }
  function paintOverlay(){
    const el=doc.querySelector?.('[data-game-overlay]');if(!el)return;
    const count=transport.countingIn?.();
    let text='';
    if(paused)text='Paused · Space to resume';
    else if(count)text=`${count.beats-count.beat+1}`;
    else if(waitingTick!==null){
      const w=engine.waiting();
      text=`Play ${w.required.map(t=>noteName(t.coordinate)).join(' · ')}`;
      if(w.missing.length)text+=` · Missing ${w.missing.map(t=>noteName(t.coordinate)).join(' · ')}`;
      if(w.extras.length)text+=` · Release ${[...new Set(w.extras.map(t=>noteName(t.coordinate)))].join(' · ')}`;
    }
    if(el.textContent!==text)el.textContent=text;
    el.classList.toggle('is-count',!!count&&!paused);
    const hear=doc.querySelector?.('[data-comp="game-hear-current"]');if(hear)hear.hidden=waitingTick===null;
  }

  // ---- timing calibration: tap along to clicks; the median lag is taken off every press ----
  function startCalibration(){
    leave();const mine=revision;phase='calibrating';calibration={clicks:[],taps:[]};message='';refresh();
    void audio.prepare().then(()=>{
      if(phase!=='calibrating'||mine!==revision)return;
      const snap=audio.getClockSnapshot(),first=snap.audioSeconds+.8,beat=60/CAL_BPM;
      calibration.clicks=Array.from({length:CAL_CLICKS},(_,k)=>first+k*beat);
      audio.scheduleVoices(calibration.clicks.map((t,k)=>({voiceId:`cal#${k}`,cents:k%4?CLICK.beat.cents:CLICK.bar.cents,onsetAudioSeconds:t,releaseAudioSeconds:t+CLICK.seconds,velocity:110,chordSize:1})),{groupId:'calibration',settings:CLICK.settings});
      calTimer=setTimer(finishCalibration,(calibration.clicks.at(-1)-snap.audioSeconds+.6)*1000);
    },error=>{if(mine===revision){message=`Audio could not start: ${error.message}`;phase='setup';refresh();}});
  }
  function tap(event){
    if(event.type!=='down'||!calibration?.clicks.length)return;
    const heard=heardSeconds(audio.getClockSnapshot(),event.t);
    let best=null;
    calibration.clicks.forEach((c,k)=>{if(k<CAL_SKIP)return;const d=heard-c;if(Math.abs(d)<.3&&(best===null||Math.abs(d)<Math.abs(best)))best=d;});
    if(best!==null)calibration.taps.push(best*1000);
    const out=doc.querySelector?.('[data-game-taps]');if(out)out.textContent=`${calibration.taps.length} of ${CAL_CLICKS-CAL_SKIP} taps`;
  }
  function finishCalibration(){
    clearTimer(calTimer);calTimer=null;
    if(phase!=='calibrating')return;
    const taps=calibration?.taps??[];
    if(taps.length<4)message='Tap along with at least four of the last eight clicks to measure your timing.';
    else{offsetMs=Math.round(median(taps));storage.set(OFFSET_KEY,offsetMs);message=`Timing offset set to ${signedMs(offsetMs)}: your presses are judged ${offsetMs>=0?'that much earlier':'that much later'} to match.`;}
    calibration=null;audio.cancelGroup?.('calibration');phase='setup';refresh();
  }

  // ---- the physical HexBoard: the next notes lit, the rest dimmed, hits and misses flashed ----
  function deviceSnapshot(held=[]){
    const p=playingProject(),board=playingBoard();
    if(!p||!board)return null;
    const snap=compositionDeviceSnapshot(p,board,[...rings,...held]);
    if(phase!=='running')return snap;
    const flashColor={perfect:'#3ddc84',great:'#3ddc84',good:'#9be35b',ok:'#3ddc84',miss:'#ff4d4d',wrong:'#ff4d4d',near:'#ffb347'};
    for(const key of snap.keys){
      if(key.command||!key.enabled)continue;
      const f=flashes.get(key.index);
      if(f){key.color=key.layoutColor=flashColor[f.cls]??key.color;key.lit=true;continue;}
      if(active().hints&&!rings.has(key.index)&&key.layoutColor)key.layoutColor=dim(key.layoutColor,.35);
    }
    return snap;
  }

  // ---- host hooks ----
  function onTransport(event,detail){
    if(phase!=='running'||stopping)return;
    if(event==='error'){leave();message=`Audio could not start${detail?.error?.message?`: ${detail.error.message}`:''}. Try Start again.`;refresh();return;}
    if(event==='boundary'){
      waitingTick=detail.tick;
      for(const r of engine.advance(waitingTick))react(r);
      paint(waitingTick);return;
    }
    if(event==='ended'){
      for(const r of engine.advance(detail?.v??chart.to+(WINDOWS.good+Math.max(0,run.offsetMs)+1)/1000*engine.tps))react(r);
      if(active().mode==='learn'&&engine.pending().length){leave();message='Playback stopped before all notes were completed. Try Start again.';refresh();return;}
      finish();return;
    }
    if(event==='stopped'){quit();return;}
    if(event==='paused'||event==='suspended')pause();
  }
  function click(action,el){
    switch(action){
      case 'game-start':start();return;
      case 'game-again':again();return;
      case 'game-restart':start();return;
      case 'game-practise':quit();settings={...settings,mode:'learn',section:'bars',fromBar:Number(el.dataset.from)||1,toBar:Number(el.dataset.to)||Number(el.dataset.from)||1};save();refresh();return;
      case 'game-setup':quit();return;
      case 'game-pause':togglePause();return;
      case 'game-quit':quit();return;
      case 'game-repeat-pause':togglePause();return;
      case 'game-repeat-stop':cancelRepeat();settings.repeat=false;if(run)run.settings.repeat=false;save();refresh();return;
      case 'game-preview-first':preview('first');return;
      case 'game-preview-prev':preview('prev');return;
      case 'game-preview-next':preview('next');return;
      case 'game-preview-hear':preview('hear');return;
      case 'game-hear-current':hearCurrent();return;
      case 'game-speed-preset':change('gameSpeed',{value:el.dataset.speed});return;
      case 'game-calibrate':startCalibration();return;
      case 'game-calibrate-done':finishCalibration();return;
      case 'game-offset-clear':offsetMs=null;storage.set(OFFSET_KEY,null);message='Timing offset cleared.';refresh();return;
    }
  }
  function change(field,el){
    if(phase!=='setup')return true;
    const value=el.value,map={gamePart:'part',gameMatch:'match',gameMode:'mode',gameSpeed:'speed',gameTargetSpeed:'targetSpeed',gameGuide:'guide',gameCountIn:'countIn',gameLead:'lead',gameSection:'section',gameFrom:'fromBar',gameTo:'toBar'};
    if(['gameSpeed','gameTargetSpeed','gameFrom','gameTo'].includes(field)&&(String(value).trim()===''||!Number.isFinite(Number(value)))){refresh();return true;}
    const checks={gameClick:'click',gameTrainer:'trainer',gameRepeat:'repeat',gameHints:'hints'};
    if(checks[field])settings=normalizeSettings({...settings,[checks[field]]:!!el.checked});
    else if(map[field])settings=normalizeSettings({...settings,[map[field]]:value});
    else return false;
    previewTick=null;rings.clear();audio.cancelGroup?.('preview');message='';save();refresh();return true;
  }
  /** Space starts, pauses and resumes; it is the game's only key. */
  function keydown(event){
    if(!(event.code==='Space'||event.key===' '))return false;
    event.preventDefault();
    if(event.repeat)return true;
    if(phase==='running'||repeatCountdown)togglePause();else if(phase==='setup')start();else if(phase==='results')again();
    return true;
  }
  function view(){
    const p=playingProject(),info=phase==='setup'?setupInfo():null,s=run?.section??info?.section,chosen=active();
    const preview=info?previewInfo(info):null;
    if(preview)rings=previewKeys(info,preview.notes);
    return {phase,settings:{...chosen},offsetMs,message,paused,waitingTick,pass,repeatCountdown:repeatCountdown?{...repeatCountdown}:null,
      bpm:p?p.tempo*chosen.speed/100:0,preview,exportMatchMode:getExportMatch(),
      hasLoop:!!p&&p.loop.endTick!==null,hasSelected:!!getSelectedSection(),bars:p?Math.round(contentEndTick(p)/barTicks(p.meter)):0,section:s,
      sectionUnavailable:info?.section?.unavailable??'',unreachable:info?.unreachable??[],
      best:p&&chosen.mode==='play'&&s&&!s.unavailable?bestFor(run?.bestKey??bestKey(p,chosen,s)):null,
      chart,lanes:chart&&p?lanesFor(p,chart.targets):[],targets:engine?.targets??[],meter:p?.meter,route,
      summary,calibration:calibration?{clicks:CAL_CLICKS,skip:CAL_SKIP,taps:calibration.taps.length}:null};
  }
  function leave(){
    ++revision;cancelRepeat();
    quiet(()=>transport.stop());stopLoop();clearTimer(calTimer);calTimer=null;
    phase='setup';paused=false;waitingTick=null;calibration=null;
    cleanAudio();audio.cancelGroup?.('calibration');engine=null;chart=null;run=null;rings.clear();flashes.clear();feedback=null;summary=null;previewTick=null;
  }
  return {view,start,finish,quit,pause,input,click,change,keydown,onTransport,playbackProject,deviceSnapshot,finishCalibration,leave,
    /** After the host rebuilds the page: carry on drawing. */
    resume(){
      if(phase==='running')loop();
      else if(phase==='setup')resumePreview();
    },
    step,get phase(){return phase;},get settings(){return {...settings};},get engine(){return engine;},get running(){return phase==='running';}};
}
