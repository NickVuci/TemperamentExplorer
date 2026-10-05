// Fingering practice: the player picks a chord, then plays each of its fingerings on the
// board, one at a time; the next fingering lights up as soon as the current one is played.
// Pure state machine: it is told which keys are held and asks the host to light a fingering.
// Nothing here knows about the DOM, audio or the board hardware.

export const COUNT_CHOICES=[3,5,10];

/** Offered game lengths for a chord with `available` fingerings, ending with "all". */
export function countOptions(available){
  const out=COUNT_CHOICES.filter(n=>n<available);
  out.push(available);
  return out;
}

export function createFingeringGame({getFingerings,showFingering,now=()=>Date.now(),onChange=()=>{}}){
  let phase='idle',queue=[],position=0,label='',total=0,original=-1;
  let armed=false,busy=false,lastHeld=new Set(),mistakes=0,skipped=0,startedAt=0,endedAt=0,message='',played=0,wrongNow=new Set();

  const current=()=>queue[position]??null;
  const snapshot=()=>({
    phase,label,total,position,played,mistakes,skipped,message,armed,
    target:phase==='playing'?[...current().keys]:[],
    index:phase==='playing'?current().index:-1,
    seconds:((phase==='playing'?now():endedAt)-startedAt)/1000,
  });
  const emit=()=>onChange(snapshot());

  /** Begins a game over the first `count` fingerings of the chord now on the board. */
  function start({count}={}){
    const f=getFingerings();
    if(!f||!f.placements.length){message='Select a chord on the Play board first.';emit();return false;}
    const n=Math.max(1,Math.min(count??f.placements.length,f.placements.length));
    queue=f.placements.slice(0,n).map((p,index)=>({index,keys:[...p.keys]}));
    label=f.label;total=n;position=0;played=0;mistakes=0;skipped=0;message='';original=f.index;
    startedAt=now();endedAt=0;phase='playing';
    light();
    armed=lastHeld.size===0;
    emit();return true;
  }

  function light(){
    busy=true;
    try{showFingering(current().index);}finally{busy=false;}
  }

  function advance(){
    position++;
    if(position>=queue.length){
      phase='done';endedAt=now();message='';
      busy=true;try{showFingering(original);}finally{busy=false;}
      return;
    }
    light();
    // Keys still held from the last fingering must be lifted before the next one counts.
    armed=lastHeld.size===0;
  }

  /** Tell the game which board keys are held right now (a Set of key indices). */
  function onHeld(held){
    lastHeld=new Set(held);
    if(busy||phase!=='playing')return;
    if(!armed){if(lastHeld.size===0){armed=true;message='';emit();}return;}
    const target=new Set(current().keys),wrong=[...lastHeld].filter(k=>!target.has(k));
    for(const k of wrong)if(!wrongNow.has(k)){wrongNow.add(k);mistakes++;message='That key is not part of this fingering.';}
    for(const k of [...wrongNow])if(!lastHeld.has(k))wrongNow.delete(k);
    const complete=!wrong.length&&[...target].every(k=>lastHeld.has(k));
    if(complete){played++;message='';wrongNow=new Set();advance();}
    emit();
  }

  function skip(){
    if(phase!=='playing')return;
    skipped++;message='';wrongNow=new Set();advance();emit();
  }

  /** Ends the game (or abandons it) and puts the board's highlight back as it was. */
  function stop(reason=''){
    if(phase==='playing'){busy=true;try{showFingering(original);}finally{busy=false;}}
    phase='idle';queue=[];message=reason;wrongNow=new Set();emit();
  }

  /** Called regularly: keeps the board on the target fingering and ends the game if the chord changed. */
  function check(){
    if(phase!=='playing')return;
    const f=getFingerings();
    if(!f||f.label!==label||f.placements.length<total){stop('The chord changed, so the game stopped.');return;}
    if(f.index!==current().index)light();
  }

  return {start,onHeld,skip,stop,check,state:snapshot,get active(){return phase==='playing';}};
}
