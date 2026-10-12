// Original short pieces, written through the same context/project owners as Compose.
// Run from any directory: node scripts/generate-sample-compositions.mjs
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {makeState} from '../src/core/engine.mjs';
import {BUILTIN_LAYOUTS} from '../src/hexboard/builtin-layouts.mjs';
import {layoutPresetForState} from '../src/hexboard/layout-preset-data.mjs';
import {captureContext} from '../src/composition/composition-context.mjs';
import {createProject,barTicks,PPQ,parseProject,serializeProject} from '../src/composition/composition-project.mjs';
import {buildCueTimeline} from '../src/composition/composition-cues.mjs';

const directory=new URL('../examples/compositions/',import.meta.url);
await mkdir(directory,{recursive:true});

function song({slug,name,preset='meantone',kind='recommended',n,mode=0,register=0,edo=false,tempo,meter}){
  const builtin=BUILTIN_LAYOUTS.find(p=>p.id===`builtin:${preset}${kind==='recommended'?'':`:${kind}`}`);
  const fit=layoutPresetForState(builtin.state,makeState(preset));
  assert.ok(!fit.error,fit.error);
  Object.assign(fit.state,{n:n??fit.state.n,mode});
  if(edo)Object.assign(fit.state,{name:'12 EDO (meantone mapping)',p:1200,g:700,tuning:'Manual'});
  fit.config.register=register;
  let serial=0;
  const project=createProject({name,context:captureContext(fit.state,196),layout:fit.config,tempo,meter,
    idFactory:prefix=>`sample-${slug}-${prefix}-${++serial}`});
  const bar=barTicks(meter);
  project.loop={enabled:false,startTick:bar*2,endTick:bar*6};
  project.tracks[0].level=0.55;
  const coordinate=(degree,periods=0)=>{
    const count=project.context.scale.n;
    const d=project.context.scale.degrees[((degree%count)+count)%count].coordinate;
    return [d[0]+Math.floor(degree/count)+periods,d[1]].map(v=>v===0?0:v);
  };
  const event=(clip,startTick,durationTick,degrees,periods,velocity,source)=>{
    const id=`sample-${slug}-event-${++serial}`;
    project.clips[clip].events.push({id,startTick,durationTick,velocity,
      tones:degrees.map((d,i)=>({toneId:`${id}-tone-${i}`,coordinate:coordinate(d,periods)})),
      ...(source?{source}:{})});
  };
  return {project,slug,bar,
    // [degree, quarter-note beats], with null for rests. Registers count actual periods.
    melody(bars,periods=1){
      bars.forEach((notes,b)=>{
        let beat=0;
        for(const [degree,length] of notes){
          const start=Math.round(beat*PPQ),end=Math.round((beat+length)*PPQ);
          if(degree!==null)event(1,b*bar+start,Math.max(1,end-start-30),[degree],periods,
            Math.min(120,76+(b%4)*5+(start===0?15:0)),undefined);
          beat+=length;
        }
        assert.equal(Math.round(beat*PPQ),bar,`${slug}: melody bar ${b+1} length`);
      });
    },
    chords(voicings,labels){
      voicings.forEach((degrees,b)=>event(0,b*bar,bar-60,degrees,0,62+(b%3)*6,
        {kind:'sample',label:labels?.[b]??'Scale triad',rootTone:0}));
    },
  };
}

async function save(s){
  const p=parseProject(serializeProject(s.project));
  const cues=buildCueTimeline(p);
  assert.ok(cues.every(c=>c.cells.length&&c.degreeCells.length),
    `${s.slug}: unreachable notes: ${cues.filter(c=>!c.cells.length).map(c=>c.coordinate)}`);
  // A single key press should never have to hit two targets at one onset in Both.
  const onsets=new Set();
  for(const c of cues){
    const key=`${c.onsetTick}:${c.coordinate}`;
    assert.ok(!onsets.has(key),`${s.slug}: duplicate unison at ${key}`);
    onsets.add(key);
  }
  await writeFile(new URL(`${s.slug}.composition.json`,directory),JSON.stringify(p,null,2)+'\n');
  console.log(`${s.slug}: ${p.clips[1].events.length} melody notes, ${p.clips[0].events.length} chords, ${cues.length} playable tones`);
}

// A familiar equal-tempered baseline with straight, swung, triplet and quintuplet timing.
const clockwork=song({slug:'01-clockwork-12edo',name:'Clockwork - 12 EDO rhythm study',n:12,edo:true,
  register:1,tempo:104,meter:{numerator:4,denominator:4,groups:[2,2]}});
clockwork.chords([[0,4,7],[9,0,4],[5,9,0],[7,11,2],[2,5,9],[5,9,0],[7,11,2],[0,4,7]],
  ['Major','Minor','Major','Major','Minor','Major','Major','Major']);
clockwork.melody([
  [[0,1],[4,1],[7,1],[4,1]],
  [[9,.5],[7,.5],[4,.5],[2,.5],[0,1],[4,1]],
  [[5,2/3],[9,1/3],[7,2/3],[5,1/3],[4,2/3],[2,1/3],[0,1]],
  [[7,1/3],[9,1/3],[11,1/3],[9,1/3],[7,1/3],[2,1/3],[7,2]],
  [[2,.2],[4,.2],[5,.2],[7,.2],[9,.2],[7,1],[5,1],[2,1]],
  [[null,.5],[5,.5],[9,1.5],[7,.5],[5,1]],
  [[7,3],[11,.5],[2,.5]],
  [[4,1],[2,1],[0,2]],
]);
await save(clockwork);

// The same notes/timing on two physical layouts; n=7, mode=4 is the major scale.
for(const [number,kind,register] of [['02','bosanquet',1],['03','wicki-hayden',0]]){
  const waltz=song({slug:`${number}-lantern-waltz-meantone-${kind}`,name:`Lantern Waltz - Meantone ${kind==='bosanquet'?'Bosanquet':'Wicki-Hayden'}`,
    kind,n:7,mode:4,register,tempo:92,meter:{numerator:3,denominator:4}});
  waltz.chords([[0,2,4],[5,0,2],[3,5,0],[4,6,1],[1,3,5],[3,5,0],[4,6,1],[0,2,4]],
    ['Major','Minor','Major','Major','Minor','Major','Major','Major']);
  waltz.melody([
    [[2,1],[4,.5],[5,.5],[4,1]],[[5,1.5],[4,.5],[2,1]],
    [[3,1],[5,1],[3,1]],[[4,.5],[6,.5],[5,.5],[4,.5],[1,1]],
    [[1,1],[3,.5],[4,.5],[5,1]],[[5,1],[3,1],[0,1]],
    [[1,.5],[2,.5],[4,1],[6,1]],[[2,1],[1,.5],[0,1.5]],
  ]);
  await save(waltz);
}

const quills=song({slug:'04-seven-quills-porcupine',name:'Seven Quills - Porcupine 7/8',preset:'porcupine',
  register:1,tempo:112,meter:{numerator:7,denominator:8,groups:[2,2,3]}});
quills.chords([[0,4,8],[2,6,10],[4,8,12],[2,6,10],[0,4,8],[4,8,12],[2,6,10],[0,4,8]]);
quills.melody([
  [[0,.5],[2,.5],[4,.5],[6,.5],[8,1],[4,.5]],
  [[2,1],[6,.5],[8,.5],[10,.5],[8,.5],[6,.5]],
  [[4,.5],[6,.5],[8,1],[12,.5],[10,.5],[8,.5]],
  [[6,.5],[4,.5],[2,1],[null,.5],[2,.5],[6,.5]],
  [[0,.5],[1,.5],[2,.5],[4,.5],[8,1],[4,.5]],
  [[12,.5],[11,.5],[10,.5],[8,.5],[6,.5],[4,1]],
  [[2,1],[6,1],[10,.5],[6,.5],[2,.5]],
  [[4,.5],[2,.5],[0,2.5]],
]);
await save(quills);

const glass=song({slug:'05-glass-harbor-magic',name:'Glass Harbor - Magic 6/8',preset:'magic',
  tempo:76,meter:{numerator:6,denominator:8,groups:[3,3]}});
glass.chords([[0,4,8],[4,8,12],[0,3,7],[0,4,7],[4,8,12],[0,3,7],[0,4,8],[0,4,7]],
  ['Stacked thirds','Stacked thirds','Minor','Major','Stacked thirds','Minor','Stacked thirds','Major']);
glass.melody([
  [[0,.5],[4,.5],[8,.5],[7,1],[4,.5]],
  [[4,.5],[8,.5],[11,.5],[8,1.5]],
  [[0,.5],[2,.5],[3,.5],[7,1],[3,.5]],
  [[4,1.5],[7,1],[4,.5]],
  [[8,.5],[11,.5],[8,.5],[4,1.5]],
  [[7,.5],[6,.5],[5,.5],[3,.5],[2,.5],[0,.5]],
  [[0,.5],[4,.5],[8,.5],[7,.5],[4,1]],
  [[4,.5],[1,.5],[0,2]],
]);
await save(glass);

// Pajara's period is 600 cents: two periods, not one, make an octave.
const mirrors=song({slug:'06-half-octave-mirrors-pajara',name:'Half-Octave Mirrors - Pajara 5/4',preset:'pajara7',
  register:2,tempo:100,meter:{numerator:5,denominator:4,groups:[3,2]}});
mirrors.chords([[0,4,6],[1,3,5],[2,4,6],[0,3,6],[0,4,6],[1,3,5],[2,4,6],[0,4,6]]);
mirrors.melody([
  [[0,1],[1,.5],[2,.5],[4,1],[5,1],[6,1]],
  [[1,1],[3,1],[5,1],[3,1],[1,1]],
  [[2,.5],[3,.5],[4,1],[6,1],[7,1],[6,1]],
  [[5,1.5],[3,.5],[0,1],[null,1],[3,1]],
  [[5,1],[6,.5],[7,.5],[9,1],[4,1],[0,1]],
  [[6,1],[8,1],[5,1],[3,1],[1,1]],
  [[2,.5],[4,.5],[6,1],[7,1],[6,1],[2,1]],
  [[4,1],[1,1],[0,3]],
],2);
await save(mirrors);
