// Create > Composition workspace controller. Owns the open project (with undo), the
// transport and the small amount of UI state. Rendering lives in composition-view.mjs;
// sound goes through the shared audio engine; app.mjs only wires it in.
import {captureContext,matchesApp,materialToChordEvent,resolveTone,tuningKey} from './composition-context.mjs';
import {
  PPQ,LIMITS,barTicks,createProject,parseProject,serializeProject,createHistory,makeEvent,allIds,addEvent,updateEvent,removeEvent,
  duplicateEvent,insertGap,swapAdjacent,setProjectBars,setTempo,setMeter,setName,setLoop,
} from './composition-project.mjs';
import {createTransport} from './composition-transport.mjs';
import {boardSnapshot,buildCueTimeline,activeCues,toPracticeTargets,MATCH_MODES} from './composition-cues.mjs';
import {renderComposition,renderSelectionPanel,formatPosition,NOTE_LENGTHS,REGISTER_CHOICES,STEP_TICKS} from './composition-view.mjs';
import {compositionBoard,compactFingerings,compositionDeviceSnapshot} from './composition-board.mjs';

const FOCUS_ATTRS=['data-comp','data-comp-field','data-event','data-tick','data-a','data-b'];
const slug=name=>String(name).trim().replace(/[^\w.-]+/g,'-').replace(/^-+|-+$/g,'')||'composition';

export function createCompositionWorkspace({
  document:doc,audio,getState,getLayout,getTonic,getMaterial,loadState,getHost,notify=()=>{},download=()=>{},
  raf=globalThis.requestAnimationFrame?.bind(globalThis),timer,
}){
  let history=null,message='',cache=null,frame=null,boardCache=null,placementCache=null,suppressClick=false;
  const ui={selectedChord:null,addLength:4,collection:0,noteDuration:NOTE_LENGTHS[2][1],registers:'home',matchMode:'exact-coordinate',selectedNote:null,mode:'compose',practiceSpeed:70,follow:true,boardLabels:true,fingering:0};
  const project=()=>history?.project??null;
  const transport=createTransport({getProject:()=>{const p=project();return p&&ui.mode==='practice'?{...p,tempo:p.tempo*ui.practiceSpeed/100}:p;},audio,...(timer?{timer}:{}),onState:(event,detail)=>{
    if(event==='error'){say(`Audio could not start${detail?.error?.message?`: ${detail.error.message}`:''}. Press Play again.`);return;}
    if(event==='resync')return;
    refresh();
    if(event==='playing')startLoop();
  }});

  const trackOf=(p,kind)=>p.tracks.find(t=>t.kind===kind);
  const clipOf=(p,kind)=>p.clips.find(c=>c.trackId===trackOf(p,kind).id);
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

  function boardModel(){
    const p=project();if(!p)return {board:null,reason:''};
    if(boardCache?.project!==p)boardCache={project:p,...compositionBoard(p)};
    return boardCache;
  }
  function fingerings(){
    const p=project(),event=p?clipOf(p,'chords').events.find(e=>e.id===ui.selectedChord):null;
    if(placementCache?.project!==p||placementCache?.event!==event)placementCache={project:p,event,items:compactFingerings(p,event,boardModel().board)};
    return placementCache.items;
  }
  function selectedKeys(){return fingerings()[ui.fingering]?.keys??[];}
  function deviceSnapshot(){
    const p=project();if(!p)return null;
    const active=transport.state==='playing'||ui.mode==='practice'?activeCues(timeline(),transport.position()).sounding.flatMap(c=>c.cells):[];
    return compositionDeviceSnapshot(p,boardModel().board,[...new Set([...(ui.follow&&active.length?active:selectedKeys()),...Array.from(held.values(),h=>h.index)])]);
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
      selectedChord:ui.selectedChord,selectedNote:ui.selectedNote,addLength:ui.addLength,collectionIndex:ui.collection,
      mode:ui.mode,practiceSpeed:ui.practiceSpeed,follow:ui.follow,boardLabels:ui.boardLabels,fingering:ui.fingering,
      board:boardModel().board,boardReason:boardModel().reason,fingerings:fingerings(),selectedKeys:selectedKeys(),
      collection:items.map(x=>({label:x.item.label,compatible:!!p&&tuningKey(x.item.state)===tuningKey(p.context)})),
      noteDuration:ui.noteDuration,registers:ui.registers,matchMode:ui.matchMode,
      cueText:cueText(tick),message,
    };
  }
  const render=()=>renderComposition(view());

  function refresh(){
    const host=getHost?.();
    if(!host)return;
    const active=doc.activeElement,sel=active?.getAttribute&&FOCUS_ATTRS.filter(a=>active.hasAttribute?.(a)).map(a=>`[${a}="${active.getAttribute(a)}"]`).join('');
    const scroll=host.querySelector('.roll-scroll'),left=scroll?.scrollLeft??0,top=scroll?.scrollTop??0;
    host.innerHTML=render();
    const nextScroll=host.querySelector('.roll-scroll');if(nextScroll){nextScroll.scrollLeft=left;nextScroll.scrollTop=top;}
    paint();
    if(sel&&!/disabled/.test(sel))try{host.querySelector(sel)?.focus?.({preventScroll:true});}catch{/* focus is best effort */}
  }
  function say(text){message=text;notify(text);refresh();}
  function changed(){transport.invalidate();cache=null;placementCache=null;ui.fingering=0;message='';refresh();}
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
    for(const n of doc.querySelectorAll?.('.roll-note')??[])n.classList.toggle('is-playing',transport.state==='playing'&&Number(n.dataset.start)<=tick&&tick<Number(n.dataset.end));
    const roll=doc.querySelector('[data-comp-roll]'),playhead=doc.querySelector('[data-comp-playhead]');
    if(roll&&playhead){const start=Number(roll.dataset.start),span=Number(roll.dataset.span);playhead.hidden=tick<start||tick>=start+span;playhead.style.setProperty('--playhead-left',`calc(104px + (100% - 104px) * ${(tick-start)/span})`);}
    const sounding=new Set(ui.follow&&(transport.state==='playing'||ui.mode==='practice')?activeCues(timeline(),tick).sounding.flatMap(q=>q.cells):[]);
    for(const entry of held.values())sounding.add(entry.index);
    for(const key of doc.querySelectorAll?.('[data-comp-key]')??[])key.classList.toggle('is-playing',sounding.has(Number(key.dataset.compKey)));
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
      transport.stop();history=createHistory(next);ui.selectedChord=null;ui.selectedNote=null;cache=null;message='';
      refresh();notify(`Opened “${next.name}”.`);
    }catch(error){say(error.message);}
  }

  function newProject(){
    try{
      const state=getState(),context=captureContext(state,getTonic());
      transport.stop();
      history=createHistory(createProject({name:`${state.name} composition`.slice(0,LIMITS.nameMax),context,layout:getLayout()}));
      ui.selectedChord=null;ui.selectedNote=null;cache=null;message='';refresh();
    }catch(error){say(error.message);}
  }

  const find=(clip,id)=>clip.events.find(e=>e.id===id);
  const q=Number;

  function chordAction(action,el){
    const p=project(),clip=clipOf(p,'chords'),id=el.dataset.event,e=id?find(clip,id):null,end=e?e.startTick+e.durationTick:0;
    switch(action){
      case 'chord-select':ui.selectedChord=id;ui.fingering=0;refresh();return;
      case 'chord-invert':{
        if(!e)return;
        const low=e.tones.reduce((a,b)=>resolveTone(p.context,a.coordinate).cents<=resolveTone(p.context,b.coordinate).cents?a:b);
        edit('Raise lowest chord note',pr=>{
          const next=updateEvent(pr,clip.id,id,{tones:e.tones.map(t=>t.toneId===low.toneId?{...t,coordinate:[t.coordinate[0]+1,t.coordinate[1]]}:t)});
          const moved=next.clips.find(c=>c.id===clip.id).events.find(x=>x.id===id);
          // The source remains provenance; describe an edited voicing without inventing a JI identity.
          moved.source={...moved.source,label:`${e.source?.label??'Chord'} · raised lowest voice`};return next;
        });return;
      }
      case 'chord-hear':audio.previewChord(centsOf(p,e));return;
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
    if(action==='note-select'){
      ui.selectedNote=el.dataset.event;
      // Keep the clicked note attached so the browser can dispatch a native double-click.
      const panel=doc.querySelector('.comp-selection');
      if(panel){
        panel.outerHTML=renderSelectionPanel(view());
        for(const node of doc.querySelectorAll?.('.roll-note')??[]){
          const selected=node.dataset.event===ui.selectedNote;
          node.classList.toggle('is-selected',selected);node.setAttribute?.('aria-pressed',String(selected));
        }
      }else refresh();
      return;
    }
    if(action==='note-hear'){const e=find(clip,el.dataset.event);if(e)audio.previewChord(centsOf(p,e));return;}
    if(action==='note-cell'){
      if(ui.mode==='practice')return;
      const tick=q(el.dataset.tick),coordinate=[q(el.dataset.a),q(el.dataset.b)];
      const same=clip.events.find(e=>e.startTick===tick&&e.tones.length===1&&e.tones[0].coordinate[0]===coordinate[0]&&e.tones[0].coordinate[1]===coordinate[1]);
      if(same)edit('Remove note',pr=>removeEvent(pr,clip.id,same.id));
      else if(edit('Add note',pr=>addEvent(pr,clip.id,makeEvent({startTick:tick,durationTick:ui.noteDuration,velocity:90,tones:[{coordinate}]},allIds(pr)))))
        audio.previewChord([resolveTone(p.context,coordinate).cents]);
      return;
    }
    if(action==='note-delete'){ui.selectedNote=null;edit('Delete note',pr=>removeEvent(pr,clip.id,el.dataset.event));return;}
  }

  function click(target){
    const el=target?.closest?.('[data-comp]');
    if(!el)return false;
    const action=el.dataset.comp;
    if(suppressClick){suppressClick=false;return true;}
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
        case 'mode-compose':case 'mode-practice':transport.pause();ui.mode=action==='mode-practice'?'practice':'compose';refresh();return true;
        case 'fingering':ui.fingering=Math.max(0,Math.min(Number(el.dataset.index)||0,fingerings().length-1));refresh();return true;
        case 'board-hear':{const k=boardModel().board?.keys[Number(el.dataset.compKey)];if(k?.enabled)audio.previewChord([k.c]);return true;}
        case 'seek':void transport.seek(Number(el.dataset.tick)).then(refresh);return true;
        case 'practice-start':case 'practice-next':case 'practice-prev':{
          transport.pause();ui.mode='practice';
          const ticks=[...new Set(timeline().map(c=>c.onsetTick))].sort((a,b)=>a-b),now=transport.position();
          const next=action==='practice-start'?ticks[0]:action==='practice-next'?ticks.find(t=>t>now):ticks.filter(t=>t<now).at(-1);
          const at=next??(action==='practice-next'?ticks[0]:ticks.at(-1));
          if(at===undefined){say('Add a chord or melody note before practising.');return true;}
          void transport.seek(at).then(()=>{const active=activeCues(timeline(),at).sounding;audio.previewChord(active.map(c=>c.cents));refresh();});return true;
        }
        case 'loop-off':edit('Disable loop',pr=>setLoop(pr,{enabled:false,startTick:0,endTick:null}));return true;
        case 'loop-all':edit('Loop composition',pr=>setLoop(pr,{enabled:true,startTick:0,endTick:null}));return true;
        case 'loop-selected':{const e=clipOf(p,'chords').events.find(e=>e.id===ui.selectedChord);if(e)edit('Loop selected chord',pr=>setLoop(pr,{enabled:true,startTick:e.startTick,endTick:e.startTick+e.durationTick}));return true;}
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

  function keydown(event,active=false){
    if(!active||!project()||event.defaultPrevented||!(event.code==='Space'||event.key===' ')||event.ctrlKey||event.metaKey||event.altKey)return false;
    if(event.target?.isContentEditable||event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]'))return false;
    event.preventDefault();
    // Holding Space must not repeatedly switch the transport or scroll the page.
    if(event.repeat)return true;
    if(transport.state==='playing'){transport.pause();refresh();}
    else void transport.play();
    return true;
  }

  // A drag commits one undoable edit. Pointer cancellation leaves the project untouched.
  let drag=null;const held=new Map();
  function pointerDown(event){
    if(event.button!==0)return;
    const key=event.target.closest?.('[data-comp-key]');
    if(key&&project()){
      const k=boardModel().board?.keys[Number(key.dataset.compKey)];if(!k?.enabled)return;
      event.preventDefault();held.get(event.pointerId)?.release();
      if(audio.startVoice)held.set(event.pointerId,{release:audio.startVoice(k.c),index:k.index});
      key.classList.add('is-playing');return;
    }
    const node=event.target.closest?.('.roll-note');
    if(!node||ui.mode==='practice'||!project())return;
    const grid=node.closest('.roll-row-grid'),roll=node.closest('[data-comp-roll]');
    const e=find(clipOf(project(),'melody'),node.dataset.event);
    if(!grid||!roll||!e)return;
    transport.pause();
    drag={node,event:e,id:event.pointerId,x:event.clientX,y:event.clientY,span:Number(roll.dataset.span),width:grid.getBoundingClientRect().width,
      resize:!!event.target.closest?.('[data-comp-resize]'),start:e.startTick,duration:e.durationTick,coordinate:[...e.tones[0].coordinate],moved:false};
  }
  function pointerMove(event){
    if(!drag||drag.id!==event.pointerId)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    if(!drag.moved&&Math.abs(dx)+Math.abs(dy)<4)return;
    event.preventDefault();drag.moved=true;drag.node.classList.add('is-dragging');
    const delta=Math.round(dx/drag.width*drag.span/STEP_TICKS)*STEP_TICKS;
    if(drag.resize){drag.duration=Math.max(STEP_TICKS,drag.event.durationTick+delta);drag.node.style.width=`${100*drag.duration/drag.span}%`;}
    else{
      drag.start=Math.max(0,drag.event.startTick+delta);
      const row=doc.elementFromPoint?.(event.clientX,event.clientY)?.closest?.('.roll-row-grid');
      if(row)drag.coordinate=[Number(row.dataset.a),Number(row.dataset.b)];
      drag.node.style.transform=`translate(${dx}px,${dy}px)`;
    }
  }
  function pointerUp(event){
    const release=held.get(event.pointerId);if(release){release.release();held.delete(event.pointerId);paint();suppressClick=true;setTimeout(()=>{suppressClick=false;},0);}
    if(!drag||drag.id!==event.pointerId)return;
    const d=drag;drag=null;
    if(event.type==='pointercancel'){refresh();return;}
    if(!d.moved)return;
    suppressClick=true;setTimeout(()=>{suppressClick=false;},0);ui.selectedNote=d.event.id;
    edit(d.resize?'Resize melody note':'Move melody note',pr=>updateEvent(pr,clipOf(pr,'melody').id,d.event.id,d.resize?{durationTick:d.duration}:{startTick:d.start,tones:d.event.tones.map((t,i)=>i===0?{...t,coordinate:d.coordinate}:t)}));
  }
  const releaseHeld=()=>{for(const entry of held.values())entry.release();held.clear();};
  function surfaceClick(event){
    const surface=event.target.closest?.('.roll-surface');
    if(surface&&project()&&ui.mode!=='practice'){
      const grid=surface.closest('.roll-row-grid'),roll=surface.closest('[data-comp-roll]'),rect=grid.getBoundingClientRect();
      const span=Number(roll.dataset.span),tick=Math.min(Math.floor((span-1)/STEP_TICKS)*STEP_TICKS,Math.max(0,Math.floor((event.clientX-rect.left)/rect.width*span/STEP_TICKS)*STEP_TICKS));
      melodyAction('note-cell',{dataset:{...surface.dataset,tick:String(tick)}});
      return;
    }
  }
  doc.addEventListener?.('click',surfaceClick);
  function doubleClick(event){
    const note=event.target?.closest?.('.roll-note');
    if(!note||note.closest?.('[hidden]')||!project()||ui.mode==='practice')return;
    if(!find(clipOf(project(),'melody'),note.dataset.event))return;
    event.preventDefault();
    melodyAction('note-delete',note);
  }
  doc.addEventListener?.('dblclick',doubleClick);
  doc.addEventListener?.('pointerdown',pointerDown);
  doc.addEventListener?.('pointermove',pointerMove);
  doc.addEventListener?.('pointerup',pointerUp);
  doc.addEventListener?.('pointercancel',pointerUp);

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
        case 'follow':ui.follow=!!el.checked;refresh();return true;
        case 'boardLabels':ui.boardLabels=!!el.checked;refresh();return true;
        case 'practiceSpeed':ui.practiceSpeed=Math.max(25,Math.min(100,Number(value)||70));transport.invalidate();refresh();return true;
        case 'matchMode':if(MATCH_MODES.includes(value))ui.matchMode=value;return true;
      }
      if(!p)return true;
      const clip=clipOf(p,'chords'),mel=clipOf(p,'melody');
      switch(field){
        case 'bars':edit('Set project bars',pr=>setProjectBars(pr,Number(value)));break;
        case 'name':edit('Rename',pr=>setName(pr,value));break;
        case 'tempo':edit('Set tempo',pr=>setTempo(pr,Number(value)));break;
        case 'loop':edit('Toggle loop',pr=>setLoop(pr,{enabled:!!el.checked,startTick:0,endTick:null}));break;
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
    render,click,change,keydown,input:()=>false,refresh,
    /** The open project for a whole-app session save, or null. */
    serialize:()=>project(),
    /** Restores a saved project (validated atomically) or closes the current one with `null`. */
    restore(data){
      transport.stop();
      if(!data){history=null;cache=null;message='';ui.selectedChord=null;return;}
      history=createHistory(parseProject(data));cache=null;message='';ui.selectedChord=null;ui.selectedNote=null;
    },
    get open(){return history!==null;},
    pause(){if(transport.state==='playing'){transport.pause();refresh();}},
    stop(){releaseHeld();if(transport.state!=='stopped'){transport.stop();refresh();}else paint();},
    dispose(){transport.stop();releaseHeld();doc.removeEventListener?.('click',surfaceClick);doc.removeEventListener?.('dblclick',doubleClick);doc.removeEventListener?.('pointerdown',pointerDown);doc.removeEventListener?.('pointermove',pointerMove);doc.removeEventListener?.('pointerup',pointerUp);doc.removeEventListener?.('pointercancel',pointerUp);},
    // Test and integration hooks.
    getProject:project,transport,timeline,paint,deviceSnapshot,
    voiceSettings:()=>undefined,
  };
}
