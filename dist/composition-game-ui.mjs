// Rhythm game controller for Compose's Game mode. It runs the engine (composition-game.mjs) over the
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

export const SPEEDS=[50,55,60,65,70,75,80,85,90,95,100];
export const GUIDES=[['off','Muted'],['quiet','Quiet guide'],['full','Full']];
export const LEADS=[[1.2,'Close'],[2,'Normal'],[3,'Far']];
export const SECTIONS=[['all','Whole piece'],['loop','Loop region'],['bars','Bars']];
export const LANE_HEIGHT=30,HIT_X=96;
const SETTINGS_KEY='temperament-lab-game-settings',OFFSET_KEY='temperament-lab-game-offset',BEST_KEY='temperament-lab-game-best';
const CAL_CLICKS=12,CAL_SKIP=4,CAL_BPM=90;
const DEFAULTS=Object.freeze({part:'melody',match:'exact',mode:'play',speed:100,guide:'quiet',click:true,countIn:1,lead:2,section:'all',fromBar:1,toBar:4,trainer:false});
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
    speed:pick(SPEEDS,Number(s.speed),DEFAULTS.speed),guide:pick(GUIDES.map(g=>g[0]),s.guide,DEFAULTS.guide),click:s.click===undefined?DEFAULTS.click:!!s.click,
    countIn:int(s.countIn,0,2,DEFAULTS.countIn),lead:pick(LEADS.map(l=>l[0]),Number(s.lead),DEFAULTS.lead),section:pick(SECTIONS.map(x=>x[0]),s.section,DEFAULTS.section),
    fromBar:int(s.fromBar,1,9999,DEFAULTS.fromBar),toBar:int(s.toBar,1,9999,DEFAULTS.toBar),trainer:!!s.trainer,
  };
}
const median=list=>{const s=[...list].sort((a,b)=>a-b),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const signedMs=ms=>`${ms>0?'+':ms<0?'−':''}${Math.abs(Math.round(ms))} ms`;
// A colour pulled towards black, for keys that are not part of the next notes.
const dim=(hex,f)=>`#${[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*f).toString(16).padStart(2,'0')).join('')}`;

export function createGameController({document:doc,audio,transport,getProject,getBoard,refresh,notify=()=>{},
  raf=globalThis.requestAnimationFrame?.bind(globalThis),cancel=globalThis.cancelAnimationFrame?.bind(globalThis),
  storage=browserStorage(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id),now=()=>globalThis.performance?.now?.()??Date.now()}){
  let settings=normalizeSettings(storage.get(SETTINGS_KEY)??{}),offsetMs=Number.isFinite(storage.get(OFFSET_KEY))?storage.get(OFFSET_KEY):null;
  let phase='setup',chart=null,engine=null,summary=null,message='',frame=null,stopping=false,paused=false,waitingTick=null;
  let calibration=null,calTimer=null,ppt=0,rings=new Set(),feedback=null,route=new Map();
  const flashes=new Map();            // key index → {cls, until}
  const quiet=fn=>{stopping=true;try{fn();}finally{stopping=false;}};
  const save=()=>storage.set(SETTINGS_KEY,settings);

  // ---- what is played ----
  function section(p){
    const end=contentEndTick(p),bar=barTicks(p.meter);
    if(settings.section==='loop'&&p.loop.endTick!==null)return {from:p.loop.startTick,to:p.loop.endTick};
    if(settings.section==='bars'){
      const from=Math.min(settings.fromBar-1,Math.round(end/bar)-1)*bar,to=Math.max(from+bar,Math.min(end,settings.toBar*bar));
      return {from:Math.max(0,from),to};
    }
    return {from:0,to:end};
  }
  /** The project the transport plays during a run: your part muted, quiet or full, at the chosen speed. */
  function playbackProject(p){
    if(!p)return p;
    const mine=t=>settings.part==='both'||t.kind===settings.part;
    return {...p,tempo:p.tempo*settings.speed/100,loop:{enabled:false,startTick:0,endTick:null},
      tracks:p.tracks.map(t=>mine(t)?{...t,mute:settings.guide==='off',solo:false,level:settings.guide==='quiet'?Math.min(t.level,.3):t.level}:{...t,solo:false})};
  }
  const bestKey=()=>{const p=getProject(),s=section(p);return [p.id,settings.part,settings.match,settings.speed,s.from,s.to].join('|');};
  const bestFor=key=>storage.get(BEST_KEY)?.[key]??null;

  // ---- lanes and colours: one lane per pitch (exact) or degree (any octave), highest first ----
  function keyColors(p,board){
    const out=new Map();if(!board||!p.layout)return out;
    try{const colors=mosLayers(p.context.state,p.layout,board);for(const k of board.keys)if(!k.command&&k.enabled){const id=k.m.join(',');if(!out.has(id))out.set(id,keyColor(k,colors));}}catch{/* colours are decoration */}
    return out;
  }
  /**
   * One suggested key per note: the copy nearest the note before (a chord's tones near each other,
   * lowest first), starting near the board's centre. Any key with the right pitch still counts.
   */
  function routeFor(p,targets,board){
    const out=new Map();if(!board)return out;
    const pos=i=>{const k=board.keys[i];return [k.x/2,k.y*Math.sqrt(3)/2];},dist=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2;
    const centre=pos(Math.min(board.keys.length-1,p.layout?.center??65));
    // Nearest to the previous note, with a slight pull towards the centre so the route never drifts to an edge.
    const cost=(k,ref)=>dist(pos(k),ref)+.2*dist(pos(k),centre);
    let prev=centre;
    const byTick=new Map();for(const t of targets){if(!byTick.has(t.tick))byTick.set(t.tick,[]);byTick.get(t.tick).push(t);}
    for(const group of byTick.values()){
      const chosen=[];
      for(const t of [...group].sort((a,b)=>a.cents-b.cents)){
        const options=settings.match==='degree'?t.degreeKeys:t.keys;
        if(!options.length)continue;
        const ref=chosen.length?pos(chosen.at(-1)):prev;
        let best=options[0];for(const k of options)if(cost(k,ref)<cost(best,ref))best=k;
        out.set(t.index,best);chosen.push(best);
      }
      if(chosen.length)prev=pos(chosen[0]);
    }
    return out;
  }
  function lanesFor(p,targets){
    const colors=keyColors(p,getBoard()),lanes=new Map();
    for(const t of targets){
      const id=settings.match==='degree'&&t.degree!==null?`d${t.degree}`:t.coordinate.join(',');
      if(!lanes.has(id))lanes.set(id,{id,degree:t.degree,register:settings.match==='degree'?0:t.register,cents:settings.match==='degree'&&t.degree!==null?resolveTone(p.context,p.context.scale.degrees[t.degree].coordinate).cents:t.cents,color:colors.get(t.coordinate.join(','))??'#829cff'});
    }
    return [...lanes.values()].sort((a,b)=>b.cents-a.cents);
  }

  // ---- a run ----
  function start(){
    const p=getProject();if(!p)return;
    const {from,to}=section(p),c=buildChart(p,{part:settings.part,from,to});
    if(!c.targets.length){message='There are no notes to play in this part and section. Choose another part or section.';refresh();return;}
    quiet(()=>transport.stop());
    chart=c;summary=null;message='';paused=false;waitingTick=null;feedback=null;flashes.clear();rings=new Set();ppt=0;
    engine=createGame(chart,{tps:p.tempo*settings.speed/100*PPQ/60,match:settings.match,context:p.context,mode:settings.mode,offsetMs:offsetMs??0,meter:p.meter});
    route=routeFor(p,engine.targets,getBoard());
    phase='running';refresh();
    void transport.seek(from).then(()=>transport.play({countIn:settings.countIn}));
    loop();
  }
  function finish(){
    quiet(()=>transport.stop());stopLoop();
    summary=engine.summary();
    if(settings.mode==='play'){
      const key=bestKey(),previous=bestFor(key);
      summary.previousBest=previous;summary.newBest=!previous||summary.score>previous.score;
      if(summary.newBest){const all=storage.get(BEST_KEY)??{};all[key]={score:summary.score,accuracy:summary.accuracy,grade:summary.grade,date:new Date().toISOString().slice(0,10)};storage.set(BEST_KEY,all);}
      if(settings.trainer)summary.nextSpeed=summary.accuracy>=90&&settings.speed<100?Math.min(100,settings.speed+5):settings.speed;
    }
    phase='results';refresh();
  }
  function quit(){quiet(()=>transport.stop());stopLoop();phase='setup';engine=null;chart=null;paused=false;waitingTick=null;refresh();}
  function togglePause(){
    if(phase!=='running')return;
    if(!paused){paused=true;quiet(()=>transport.pause());paintOverlay();return;}
    paused=false;if(waitingTick===null)void transport.play({countIn:settings.countIn?1:0});paintOverlay();
  }
  const goodTicks=()=>WINDOWS.good/1000*engine.tps;

  // ---- input from the board player ----
  function input(event){
    if(phase==='calibrating'){tap(event);return;}
    if(phase!=='running'||!engine||paused||!event?.holdId)return;
    const v=transport.timeAt(event.t).v;
    if(event.type==='down'){
      react(engine.press(event.holdId,event.coordinate,v),event.keyId);
      // Learn: the music waits until every note due now has been played.
      if(waitingTick!==null&&!engine.pending().some(t=>t.tick===waitingTick)){waitingTick=null;void transport.play();}
    }else{const r=engine.release(event.holdId,v);if(r)react(r,event.keyId);}
  }
  function flash(keys,cls){const until=now()+FLASH_MS;for(const k of keys)flashes.set(Number(k),{cls,until});}
  function say(text,cls){feedback={text,cls,until:now()+FEEDBACK_MS};}
  function react(r,keyId){
    if(!r)return;
    const keys=keyId!==undefined&&keyId!==null?[keyId]:[];
    if(r.kind==='hit'){
      flash(keys.length?keys:route.has(r.target.index)?[route.get(r.target.index)]:[],r.result);
      say(r.result==='ok'?'Yes':`${RESULT_TEXT[r.result]}${Number.isFinite(r.offsetMs)&&Math.abs(r.offsetMs)>=10?` · ${Math.abs(Math.round(r.offsetMs))} ms ${r.offsetMs<0?'early':'late'}`:''}`,r.result);
      markNote(r.target);
    }else if(r.kind==='miss'){flash(route.has(r.target.index)?[route.get(r.target.index)]:[],'miss');say('Miss','miss');markNote(r.target);}
    else if(r.kind==='wrong'){flash(keys,'wrong');say('Wrong note','wrong');}
    else if(r.kind==='early'||r.kind==='late'){flash(keys,'near');say(r.kind==='early'?'Too early':'Too late','near');}
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
    if(transport.state==='playing'&&!at.countIn){
      for(const e of engine.advance(at.v))react(e);
      if(settings.mode==='learn'&&waitingTick===null){
        const due=engine.pending();
        if(due.length&&at.v>=due[0].tick){waitingTick=due[0].tick;quiet(()=>transport.pause());void transport.seek(waitingTick);}
      }
      if(at.v>=chart.to+goodTicks()&&!(settings.mode==='learn'&&engine.pending().length)){finish();return;}
    }
    paint(transport.state==='playing'?at.v:transport.position());
    loop();
  }
  function paint(v){
    const highway=doc.querySelector?.('[data-game-highway]'),track=doc.querySelector?.('[data-game-track]');
    if(highway&&track){
      const width=highway.clientWidth||0,next=width>HIT_X?(width-HIT_X)/(settings.lead*engine.tps):ppt;
      if(next&&Math.abs(next-ppt)>1e-9){ppt=next;track.style.setProperty('--ppt',String(ppt));}
      track.style.transform=`translateX(${HIT_X-(v-chart.from)*ppt}px)`;
    }
    // Approach rings: each suggested key's next note shrinks its ring onto the key over the lead time;
    // the key outlines as the note gets close and fills when it is due.
    const lead=settings.lead*engine.tps,soon=new Map();
    for(const t of engine.targets){
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
    const s=engine.state(),set=(sel,text)=>{const el=doc.querySelector?.(sel);if(el&&el.textContent!==text)el.textContent=text;};
    set('[data-game-score]',settings.mode==='learn'?`${s.judged} / ${s.total}`:s.score.toLocaleString('en'));
    set('[data-game-combo]',s.combo>1?`${s.combo} combo${s.multiplier>1?` · ×${s.multiplier}`:''}`:'');
    set('[data-game-accuracy]',`${s.accuracy.toFixed(1)}%`);
    const bar=doc.querySelector?.('[data-game-progress]');if(bar)bar.style.width=`${Math.max(0,Math.min(100,100*(v-chart.from)/Math.max(1,chart.to-chart.from)))}%`;
    const fb=doc.querySelector?.('[data-game-feedback]');
    if(fb){const live=feedback&&feedback.until>now();const text=live?feedback.text:'';if(fb.textContent!==text){fb.textContent=text;fb.className=`game-feedback${live?` is-${feedback.cls}`:''}`;}}
  }
  function paintOverlay(){
    const el=doc.querySelector?.('[data-game-overlay]');if(!el)return;
    const count=transport.countingIn?.(),p=getProject();
    let text='';
    if(paused)text='Paused · Space to resume';
    else if(count)text=`${count.beats-count.beat+1}`;
    else if(waitingTick!==null&&p)text=`Play ${engine.pending().map(t=>{const d=degreeOf(p.context,t.coordinate);return d?`${d.degree}${d.register?(d.register>0?'+':'')+d.register:''}`:'×';}).join(' · ')}`;
    if(el.textContent!==text)el.textContent=text;
    el.classList.toggle('is-count',!!count&&!paused);
  }

  // ---- timing calibration: tap along to clicks; the median lag is taken off every press ----
  function startCalibration(){
    quiet(()=>transport.stop());stopLoop();phase='calibrating';calibration={clicks:[],taps:[]};message='';refresh();
    void audio.prepare().then(()=>{
      if(phase!=='calibrating')return;
      const snap=audio.getClockSnapshot(),first=snap.audioSeconds+.8,beat=60/CAL_BPM;
      calibration.clicks=Array.from({length:CAL_CLICKS},(_,k)=>first+k*beat);
      audio.scheduleVoices(calibration.clicks.map((t,k)=>({voiceId:`cal#${k}`,cents:k%4?CLICK.beat.cents:CLICK.bar.cents,onsetAudioSeconds:t,releaseAudioSeconds:t+CLICK.seconds,velocity:110,chordSize:1})),{groupId:'calibration',settings:CLICK.settings});
      calTimer=setTimer(finishCalibration,(calibration.clicks.at(-1)-snap.audioSeconds+.6)*1000);
    },error=>{message=`Audio could not start: ${error.message}`;phase='setup';refresh();});
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
    const p=getProject(),board=getBoard();
    if(!p||!board)return null;
    const snap=compositionDeviceSnapshot(p,board,[...rings,...held]);
    if(phase!=='running')return snap;
    const flashColor={perfect:'#3ddc84',great:'#3ddc84',good:'#9be35b',ok:'#3ddc84',miss:'#ff4d4d',wrong:'#ff4d4d',near:'#ffb347'};
    for(const key of snap.keys){
      if(key.command||!key.enabled)continue;
      const f=flashes.get(key.index);
      if(f){key.color=key.layoutColor=flashColor[f.cls]??key.color;key.lit=true;continue;}
      if(!rings.has(key.index)&&key.layoutColor)key.layoutColor=dim(key.layoutColor,.35);
    }
    return snap;
  }

  // ---- host hooks ----
  function onTransport(event){
    if(phase!=='running'||stopping)return;
    if(event==='ended'){finish();return;}
    if(event==='stopped'){quit();return;}
    if(event==='paused'||event==='suspended'){paused=true;paintOverlay();}
  }
  function click(action,el){
    switch(action){
      case 'game-start':start();return;
      case 'game-again':if(summary?.nextSpeed){settings.speed=summary.nextSpeed;save();}start();return;
      case 'game-practise':settings.section='bars';settings.fromBar=Number(el.dataset.from)||1;settings.toBar=Number(el.dataset.to)||settings.fromBar;save();start();return;
      case 'game-setup':quit();return;
      case 'game-pause':togglePause();return;
      case 'game-quit':quit();return;
      case 'game-calibrate':startCalibration();return;
      case 'game-calibrate-done':finishCalibration();return;
      case 'game-offset-clear':offsetMs=null;storage.set(OFFSET_KEY,null);message='Timing offset cleared.';refresh();return;
    }
  }
  function change(field,el){
    const value=el.value,map={gamePart:'part',gameMatch:'match',gameMode:'mode',gameSpeed:'speed',gameGuide:'guide',gameCountIn:'countIn',gameLead:'lead',gameSection:'section',gameFrom:'fromBar',gameTo:'toBar'};
    if(field==='gameClick'||field==='gameTrainer')settings=normalizeSettings({...settings,[field==='gameClick'?'click':'trainer']:!!el.checked});
    else if(map[field])settings=normalizeSettings({...settings,[map[field]]:value});
    else return false;
    save();refresh();return true;
  }
  /** Space starts, pauses and resumes; it is the game's only key. */
  function keydown(event){
    if(!(event.code==='Space'||event.key===' '))return false;
    event.preventDefault();
    if(event.repeat)return true;
    if(phase==='running')togglePause();else if(phase==='setup'||phase==='results')start();
    return true;
  }
  function view(){
    const p=getProject(),s=p?section(p):null;
    return {phase,settings,offsetMs,message,paused,
      hasLoop:!!p&&p.loop.endTick!==null,bars:p?Math.round(contentEndTick(p)/barTicks(p.meter)):0,section:s,
      best:p&&settings.mode==='play'?bestFor(bestKey()):null,
      chart,lanes:chart&&p?lanesFor(p,chart.targets):[],targets:engine?.targets??[],meter:p?.meter,route,
      summary,calibration:calibration?{clicks:CAL_CLICKS,skip:CAL_SKIP,taps:calibration.taps.length}:null};
  }
  return {view,start,finish,quit,input,click,change,keydown,onTransport,playbackProject,deviceSnapshot,finishCalibration,
    /** Leaves Game mode: ends any run or calibration. */
    leave(){if(phase==='running'||phase==='calibrating'){quiet(()=>transport.stop());}stopLoop();clearTimer(calTimer);calibration=null;phase='setup';engine=null;chart=null;paused=false;waitingTick=null;},
    /** After the host rebuilds the page: carry on drawing. */
    resume(){if(phase==='running')loop();},
    step,get phase(){return phase;},get settings(){return {...settings};},get engine(){return engine;},get running(){return phase==='running';}};
}
