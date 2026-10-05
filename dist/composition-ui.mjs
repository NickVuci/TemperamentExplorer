// Create > Composition workspace controller. Owns the open project (with undo), the
// transport and the small amount of UI state. Rendering lives in composition-view.mjs;
// sound goes through the shared audio engine; app.mjs only wires it in.
import {captureContext,matchesApp,materialToChordEvent,resolveTone,tuningKey} from './composition-context.mjs';
import {
  PPQ,LIMITS,createProject,parseProject,serializeProject,createHistory,makeEvent,allIds,addEvent,updateEvent,removeEvent,
  duplicateEvent,insertGap,swapAdjacent,setTempo,setMeter,setName,setLoop,setWave,
} from './composition-project.mjs';
import {createTransport} from './composition-transport.mjs';
import {boardSnapshot,buildCueTimeline,activeCues,toPracticeTargets,MATCH_MODES} from './composition-cues.mjs';
import {renderComposition,formatPosition,NOTE_LENGTHS,REGISTER_CHOICES} from './composition-view.mjs';

const FOCUS_ATTRS=['data-comp','data-comp-field','data-event','data-tick','data-a','data-b'];
const slug=name=>String(name).trim().replace(/[^\w.-]+/g,'-').replace(/^-+|-+$/g,'')||'composition';

export function createCompositionWorkspace({
  document:doc,audio,getState,getLayout,getTonic,getMaterial,loadState,getHost,notify=()=>{},download=()=>{},
  raf=globalThis.requestAnimationFrame?.bind(globalThis),timer,
}){
  let history=null,message='',cache=null,frame=null;
  const ui={selectedChord:null,addLength:4,collection:0,noteDuration:NOTE_LENGTHS[2][1],registers:'up',page:0,matchMode:'exact-coordinate'};
  const project=()=>history?.project??null;
  const transport=createTransport({getProject:project,audio,...(timer?{timer}:{}),onState:(event,detail)=>{
    if(event==='error'){say(`Audio could not start${detail?.error?.message?`: ${detail.error.message}`:''}. Press Play again.`);return;}
    if(event==='resync')return;
    refresh();
    if(event==='playing')startLoop();
  }});

  const trackOf=(p,kind)=>p.tracks.find(t=>t.kind===kind);
  const clipOf=(p,kind)=>p.clips.find(c=>c.trackId===trackOf(p,kind).id);
  const settings=p=>({tonic:p.context.tonicHz,wave:p.sound.wave});
  const centsOf=(p,e)=>e.tones.map(t=>resolveTone(p.context,t.coordinate).cents);

  function timeline(){
    const p=project();
    if(!p)return [];
    if(!cache||cache.project!==p)cache={project:p,timeline:buildCueTimeline(p,boardSnapshot(p),{ignoreMixer:true}),snapshot:null};
    return cache.timeline;
  }
  function cueText(tick){
    const p=project();
    if(!p)return '';
    const a=activeCues(timeline(),tick);
    const where=q=>q.cells.length?`key ${q.cells.slice(0,3).join(' or ')}${q.cells.length>3?'…':''}`:'no key on this layout';
    const melody=a.sounding.filter(q=>q.trackKind==='melody').map(q=>`degree ${q.degree??'outside scale'}`).join(', ');
    const next=a.upcoming.map(q=>`${q.trackKind==='melody'?`degree ${q.degree??'outside scale'}`:'chord note'} → ${where(q)}`).join('; ');
    return `Now: ${melody||'no melody note'}. Next${a.nextTick===null?': nothing.':` (${formatPosition(p,a.nextTick)}): ${next}.`}`;
  }

  function view(){
    const p=project(),state=getState(),tick=transport.position();
    const items=getMaterial().map((item,i)=>({item,i})).filter(x=>x.item.kind==='chord');
    return {
      project:p,canUndo:!!history?.canUndo,canRedo:!!history?.canRedo,
      matchesApp:p?matchesApp(p.context,state):true,
      appSummary:`${state.name} · ${state.n} notes (mode ${state.mode+1}) · tonic ${getTonic()} Hz`,
      transportState:transport.state,position:tick,
      chordClip:p?clipOf(p,'chords'):null,melodyClip:p?clipOf(p,'melody'):null,
      selectedChord:ui.selectedChord,addLength:ui.addLength,
      collection:items.map(x=>({label:x.item.label,compatible:!!p&&tuningKey(x.item.state)===tuningKey(p.context)})),
      noteDuration:ui.noteDuration,registers:ui.registers,page:ui.page,matchMode:ui.matchMode,
      cueText:cueText(tick),message,
    };
  }
  const render=()=>renderComposition(view());

  function refresh(){
    const host=getHost?.();
    if(!host)return;
    const active=doc.activeElement,sel=active?.getAttribute&&FOCUS_ATTRS.filter(a=>active.hasAttribute?.(a)).map(a=>`[${a}="${active.getAttribute(a)}"]`).join('');
    host.innerHTML=render();
    if(sel&&!/disabled/.test(sel))try{host.querySelector(sel)?.focus?.({preventScroll:true});}catch{/* focus is best effort */}
  }
  function say(text){message=text;notify(text);refresh();}
  function changed(){transport.invalidate();cache=null;message='';refresh();}
  function edit(label,command){
    try{history.execute(label,command);changed();return true;}
    catch(error){say(error.message);return false;}
  }

  // ---- playhead: updates text and classes in place; never rebuilds the workspace ----
  function paint(){
    const p=project();
    if(!p)return;
    const tick=transport.position(),out=doc.querySelector('[data-comp-position]');
    if(out)out.textContent=formatPosition(p,tick);
    for(const b of doc.querySelectorAll?.('.chord-block')??[])b.classList.toggle('is-playing',Number(b.dataset.start)<=tick&&tick<Number(b.dataset.end));
    const cues=doc.querySelector('[data-comp-cues]'),text=cueText(tick);
    if(cues&&cues.textContent!==text)cues.textContent=text;
  }
  function startLoop(){
    if(frame!==null||!raf)return;
    const step=()=>{if(transport.state!=='playing'){frame=null;paint();return;}paint();frame=raf(step);};
    frame=raf(step);
  }

  function open(text){
    try{
      const next=parseProject(text);
      transport.stop();history=createHistory(next);ui.selectedChord=null;ui.page=0;cache=null;message='';
      refresh();notify(`Opened “${next.name}”.`);
    }catch(error){say(error.message);}
  }

  function newProject(){
    try{
      const state=getState(),context=captureContext(state,getTonic());
      transport.stop();
      history=createHistory(createProject({name:`${state.name} composition`.slice(0,LIMITS.nameMax),context,layout:getLayout()}));
      ui.selectedChord=null;ui.page=0;cache=null;message='';refresh();
    }catch(error){say(error.message);}
  }

  const find=(clip,id)=>clip.events.find(e=>e.id===id);
  const q=Number;

  function chordAction(action,el){
    const p=project(),clip=clipOf(p,'chords'),id=el.dataset.event,e=id?find(clip,id):null,end=e?e.startTick+e.durationTick:0;
    switch(action){
      case 'chord-select':ui.selectedChord=id;refresh();return;
      case 'chord-hear':audio.previewChord(centsOf(p,e),settings(p));return;
      case 'chord-add':{
        const list=getMaterial().filter(i=>i.kind==='chord');
        const item=list[ui.collection];
        if(!item){say('Choose a collected chord first.');return;}
        const start=Math.max(0,...clip.events.map(x=>x.startTick+x.durationTick));
        let newId=null;
        const ok=edit('Add chord',pr=>{
          const ev=makeEvent(materialToChordEvent(pr.context,item,{startTick:start,durationTick:ui.addLength*PPQ,velocity:90}),allIds(pr));
          newId=ev.id;return addEvent(pr,clip.id,ev);
        });
        if(ok){ui.selectedChord=newId;refresh();}
        return;
      }
      case 'chord-earlier':edit('Move chord earlier',pr=>swapAdjacent(pr,clip.id,id,-1));return;
      case 'chord-later':edit('Move chord later',pr=>swapAdjacent(pr,clip.id,id,1));return;
      case 'chord-duplicate':edit('Duplicate chord',pr=>duplicateEvent(insertGap(pr,clip.id,end,e.durationTick),clip.id,id,end));return;
      case 'chord-rest':edit('Insert rest',pr=>insertGap(pr,clip.id,end,PPQ));return;
      case 'chord-delete':if(edit('Delete chord',pr=>removeEvent(pr,clip.id,id))&&ui.selectedChord===id){ui.selectedChord=null;refresh();}return;
    }
  }

  function melodyAction(action,el){
    const p=project(),clip=clipOf(p,'melody');
    if(action==='note-cell'){
      const tick=q(el.dataset.tick),coordinate=[q(el.dataset.a),q(el.dataset.b)];
      const same=clip.events.find(e=>e.startTick===tick&&e.tones.length===1&&e.tones[0].coordinate[0]===coordinate[0]&&e.tones[0].coordinate[1]===coordinate[1]);
      if(same)edit('Remove note',pr=>removeEvent(pr,clip.id,same.id));
      else if(edit('Add note',pr=>addEvent(pr,clip.id,makeEvent({startTick:tick,durationTick:ui.noteDuration,velocity:90,tones:[{coordinate}]},allIds(pr)))))
        audio.previewChord([resolveTone(p.context,coordinate).cents],settings(p));
      return;
    }
    if(action==='note-delete'){edit('Delete note',pr=>removeEvent(pr,clip.id,el.dataset.event));return;}
    if(action==='page-prev'){ui.page=Math.max(0,ui.page-1);refresh();return;}
    if(action==='page-next'){ui.page+=1;refresh();return;}
  }

  function click(target){
    const el=target?.closest?.('[data-comp]');
    if(!el)return false;
    const action=el.dataset.comp;
    try{
      switch(action){
        case 'new':newProject();return true;
        case 'open':doc.querySelector('[data-comp-file]')?.click();return true;
      }
      const p=project();
      if(!p)return true;
      switch(action){
        case 'save':download(`${slug(p.name)}.composition.json`,serializeProject(p),'application/json');return true;
        case 'close':transport.stop();history=null;ui.selectedChord=null;cache=null;message='';refresh();return true;
        case 'undo':history.undo();changed();return true;
        case 'redo':history.redo();changed();return true;
        case 'load-context':loadState(structuredClone(p.context.state));return true;
        case 'play':void transport.play();return true;
        case 'pause':transport.pause();refresh();return true;
        case 'stop':transport.stop();refresh();return true;
        case 'export-targets':
          download(`${slug(p.name)}.practice-targets.json`,JSON.stringify(toPracticeTargets(p,boardSnapshot(p),{matchMode:ui.matchMode}),null,2),'application/json');
          return true;
      }
      if(action.startsWith('chord-'))chordAction(action,el);
      else melodyAction(action,el);
    }catch(error){say(error.message);}
    return true;
  }

  function change(el){
    if(el.dataset?.compFile!==undefined){
      const file=el.files?.[0];
      if(file){
        if(file.size>LIMITS.bytesMax)say(`That file is larger than ${LIMITS.bytesMax} bytes.`);
        else void file.text().then(open,error=>say(error.message));
      }
      el.value='';
      return true;
    }
    const field=el.dataset?.compField;
    if(field===undefined)return false;
    const p=project(),value=el.value;
    try{
      switch(field){
        case 'collection':ui.collection=Number(value)||0;return true;
        case 'addLength':ui.addLength=Number(value)||4;return true;
        case 'noteDuration':ui.noteDuration=Number(value)||NOTE_LENGTHS[2][1];return true;
        case 'registers':if(REGISTER_CHOICES.some(r=>r[0]===value))ui.registers=value;refresh();return true;
        case 'matchMode':if(MATCH_MODES.includes(value))ui.matchMode=value;return true;
      }
      if(!p)return true;
      const clip=clipOf(p,'chords'),mel=clipOf(p,'melody');
      switch(field){
        case 'name':edit('Rename',pr=>setName(pr,value));break;
        case 'tempo':edit('Set tempo',pr=>setTempo(pr,Number(value)));break;
        case 'loop':edit('Toggle loop',pr=>setLoop(pr,{enabled:!!el.checked,startTick:0,endTick:null}));break;
        case 'wave':edit('Set sound',pr=>setWave(pr,value));break;
        case 'meterNum':case 'meterDen':{
          const num=Number(doc.querySelector('[data-comp-field=meterNum]')?.value),den=Number(doc.querySelector('[data-comp-field=meterDen]')?.value);
          edit('Set meter',pr=>setMeter(pr,{numerator:num,denominator:den}));break;
        }
        case 'chordLength':{
          const e=find(clip,el.dataset.event),ticks=Math.round(Number(value)*PPQ),delta=ticks-e.durationTick,end=e.startTick+e.durationTick;
          edit('Chord length',pr=>{const n=updateEvent(pr,clip.id,e.id,{durationTick:ticks});return delta>0?insertGap(n,clip.id,end,delta):n;});break;
        }
        case 'noteLength':edit('Note length',pr=>updateEvent(pr,mel.id,el.dataset.event,{durationTick:Math.round(Number(value))}));break;
        case 'noteVelocity':edit('Note velocity',pr=>updateEvent(pr,mel.id,el.dataset.event,{velocity:Math.round(Number(value))}));break;
        default:return false;
      }
    }catch(error){say(error.message);}
    return true;
  }

  return {
    render,click,change,input:()=>false,refresh,
    /** The open project for a whole-app session save, or null. */
    serialize:()=>project(),
    /** Restores a saved project (validated atomically) or closes the current one with `null`. */
    restore(data){
      transport.stop();
      if(!data){history=null;cache=null;message='';ui.selectedChord=null;return;}
      history=createHistory(parseProject(data));cache=null;message='';ui.selectedChord=null;ui.page=0;
    },
    get open(){return history!==null;},
    pause(){if(transport.state==='playing'){transport.pause();refresh();}},
    stop(){if(transport.state!=='stopped'){transport.stop();refresh();}},
    dispose(){transport.stop();},
    // Test and integration hooks.
    getProject:project,transport,timeline,paint,
  };
}
