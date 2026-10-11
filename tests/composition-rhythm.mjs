// Compose roll rhythm: grids (tuplets, dotted, swing, beat groups), snapping, names, Euclidean
// patterns, the editing transforms and the batch edit command.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  DIVISIONS,normalizeGrid,gridRatio,gridStepTicks,gridLabel,barGrid,snapTick,cellTicks,stepLine,gridLines,
  meterGroups,defaultGroups,parseGroups,lengthName,formatBeat,beatFraction,euclid,
} from '../dist/composition-grid.mjs';
import {
  shiftEvents,transposeSteps,transposeEvents,quantizeEvents,splitEvents,scaleEvents,legatoEvents,reverseEvents,
  euclidEvents,copyEvents,pasteEvents,velocityEvents,
} from '../dist/composition-edit.mjs';
import {PPQ,createProject,addEvent,makeEvent,allIds,editEvents,setMeter,parseProject,serializeProject,validateProject} from '../dist/composition-project.mjs';
import {captureContext,resolveTone,degreeOf} from '../dist/composition-context.mjs';
import {makeState} from '../dist/engine.mjs';

const m44={numerator:4,denominator:4},m78={numerator:7,denominator:8},m68={numerator:6,denominator:8};
const grid=g=>normalizeGrid(g);
const pattern=a=>a.map(x=>x?'x':'.').join('');

// ---- grids ----
assert.deepEqual(DIVISIONS.map(d=>d[1]),[3840,1920,960,480,240,120,60]);
assert.deepEqual(grid({division:7,feel:'nope',swing:99,n:0,m:99}),{division:240,feel:'straight',n:1,m:32,swing:75,snap:true},'untrusted settings are clamped');
assert.deepEqual(barGrid(m44,grid({})),Array.from({length:16},(_,i)=>i*240),'straight sixteenths');
assert.deepEqual(barGrid(m44,grid({division:480,feel:'triplet'})),Array.from({length:12},(_,i)=>i*320),'eighth triplets are exact');
assert.deepEqual(barGrid(m44,grid({division:240,feel:'quintuplet'})).slice(0,6),[0,192,384,576,768,960],'sixteenth quintuplets are exact');
{
  const sept=barGrid(m44,grid({division:240,feel:'septuplet'}));
  assert.equal(sept.length,28);
  sept.forEach((t,i)=>assert.ok(Math.abs(t-(Math.floor(i/7)*960+(i%7)*960/7))<=.5,'septuplets are within half a tick'));
}
assert.deepEqual(barGrid(m44,grid({division:480,feel:'dotted'})),[0,720,1440,2160,2880,3600],'dotted eighths restart at the barline');
assert.deepEqual(barGrid(m44,grid({division:240,feel:'custom',n:9,m:8})).slice(0,3),[0,213,427],'custom 9:8');
assert.deepEqual(barGrid(m78,grid({division:960,feel:'triplet'})),[0,640,1280,1920,2560,3200],'a tuplet that does not fill the bar is cut at the barline');
assert.deepEqual(barGrid(m44,grid({division:480,swing:66})),[0,634,960,1594,1920,2554,2880,3514],'swing delays every second step');
assert.deepEqual(barGrid(m44,grid({division:480,feel:'triplet',swing:66})),barGrid(m44,grid({division:480,feel:'triplet'})),'swing applies to straight grids only');
assert.equal(gridStepTicks(grid({division:480,feel:'triplet'})),320);
assert.deepEqual(gridRatio(grid({feel:'custom',n:7,m:6})),{n:7,m:6});
assert.equal(gridLabel(grid({division:480,feel:'triplet'})),'1/8 triplet');
assert.equal(gridLabel(grid({division:240,swing:60})),'1/16 swing 60%');

// ---- meter groups ----
assert.deepEqual(meterGroups(m78),[2,2,3]);
assert.deepEqual(meterGroups(m68),[3,3]);
assert.deepEqual(defaultGroups({numerator:5,denominator:8}),[2,3]);
assert.deepEqual(defaultGroups({numerator:5,denominator:4}),[1,1,1,1,1]);
assert.deepEqual(meterGroups({...m78,groups:[3,2,2]}),[3,2,2],'saved groups win');
assert.deepEqual(meterGroups({...m78,groups:[3,3]}),[2,2,3],'groups that do not add up are ignored');
assert.deepEqual(parseGroups(' 3 + 2+2 ',7),[3,2,2]);
assert.equal(parseGroups('',7),null);
assert.throws(()=>parseGroups('3+3',7),/adding up to 7/);

// ---- snapping and stepping ----
const g16=grid({});
assert.equal(snapTick(m44,g16,130),240);assert.equal(snapTick(m44,g16,110),0);
assert.equal(snapTick(m44,g16,130,'floor'),0);assert.equal(snapTick(m44,g16,130,'ceil'),240);assert.equal(snapTick(m44,g16,240,'ceil'),240);
assert.equal(snapTick(m44,g16,-50),0,'never negative');
assert.equal(snapTick(m44,{...g16,snap:false},130.4),130,'snap off keeps whole ticks');
assert.equal(snapTick(m78,grid({division:960,feel:'triplet'}),3300),3360,'the next barline is a grid line');
assert.equal(cellTicks(m44,grid({division:480,feel:'triplet'}),330),320);
assert.equal(stepLine(m44,g16,0,1),240);assert.equal(stepLine(m44,g16,241,-1),240);assert.equal(stepLine(m44,g16,240,-1),0);assert.equal(stepLine(m44,g16,0,-1),0);

// ---- drawn lines ----
{
  const l=gridLines(m78,grid({division:240}),0,3360*2);
  assert.deepEqual(l.bar,[0,3360]);
  assert.deepEqual(l.group,[960,1920,4320,5280],'2+2+3 group lines');
  assert.ok(l.beat.includes(480)&&!l.beat.includes(960),'each tick once, at its strongest level');
  assert.equal(l.step.length,7*2,'the sixteenths between the eighth beats');
  assert.deepEqual(l.shade,[[960,1920],[4320,5280]],'every other group is shaded');
}

// ---- names ----
assert.deepEqual([960,480,320,640,720,192,137,1440,1280,100,7680].map(lengthName),
  ['1/4','1/8','1/8 triplet','1/4 triplet','dotted 1/8','1/16 quintuplet','1/16 septuplet','dotted 1/4','1/2 triplet','100 ticks','8 quarter notes']);
assert.equal(formatBeat(m44,2*960+320),'1.3 + 1/3');
assert.equal(formatBeat(m78,3360+3*480+96),'2.4 + 1/5');
assert.equal(formatBeat(m44,137),'1.1 + 137 ticks');
assert.equal(beatFraction(0,960),'');

// ---- Euclidean ----
assert.equal(pattern(euclid(3,8)),'x..x..x.');
assert.equal(pattern(euclid(5,8)),'x.x.xx.x');
assert.equal(pattern(euclid(3,8,1)),'..x..x.x','rotation shifts left');
assert.equal(pattern(euclid(0,4)),'....');assert.equal(pattern(euclid(9,4)),'xxxx');
assert.equal(euclid(7,12).filter(Boolean).length,7);

// ---- transforms over a real composition ----
const demo=JSON.parse(await readFile(new URL('./fixtures/composition/phase0-demo.json',import.meta.url),'utf8'));
const ctx=captureContext(demo.musicalContext.state,220);
let project=createProject({context:ctx});
const melody=project.clips[1].id;
const note=(start,dur,coordinate=[0,0],velocity=90)=>makeEvent({startTick:start,durationTick:dur,velocity,tones:[{coordinate}]},allIds(project));
const a=note(0,480),b=note(480,480,[0,2]),c=note(1440,240,[1,-1]);
for(const e of [a,b,c])project=addEvent(project,melody,e);
const byId=r=>new Map(r.put.map(e=>[e.id,e]));

assert.deepEqual(shiftEvents([a,b],-200).put.map(e=>e.startTick),[0,480],'a shift never moves notes before 0');
assert.deepEqual(shiftEvents([b],-200).put[0].startTick,280);
{
  const q=quantizeEvents(m44,grid({division:480,feel:'triplet'}),[{...b,startTick:500,durationTick:300}],{});
  assert.equal(q.put[0].startTick,640);assert.equal(q.put[0].durationTick,300,'quantizing starts keeps lengths');
  const half=quantizeEvents(m44,g16,[{...b,startTick:300}],{strength:.5});assert.equal(half.put[0].startTick,270,'strength moves part way');
  const ends=quantizeEvents(m44,g16,[{...b,startTick:250,durationTick:200}],{ends:true});assert.deepEqual([ends.put[0].startTick,ends.put[0].durationTick],[240,240]);
  const tiny=quantizeEvents(m44,g16,[{...b,startTick:10,durationTick:20}],{ends:true});assert.deepEqual([tiny.put[0].startTick,tiny.put[0].durationTick],[0,240],'a note never collapses to nothing');
}
{
  const taken=allIds(project),s=splitEvents([a],5,taken);
  assert.equal(s.put.length,5);assert.equal(s.put[0].id,a.id,'the first part keeps the note');
  assert.deepEqual(s.put.map(e=>e.startTick),[0,96,192,288,384]);assert.ok(s.put.every(e=>e.durationTick===96));
  assert.equal(new Set(s.put.flatMap(e=>[e.id,...e.tones.map(t=>t.toneId)])).size,10,'fresh ids for the new parts');
  const seven=splitEvents([b],7,allIds(project)).put;assert.equal(seven.at(-1).startTick+seven.at(-1).durationTick,960,'parts tile the note exactly');
  const next=editEvents(project,melody,s);assert.equal(next.clips[1].events.length,7);
}
{
  const t=scaleEvents([a,b],2,3).put;assert.deepEqual(t.map(e=>[e.startTick,e.durationTick]),[[0,320],[320,320]],'straight eighths become triplets');
  const back=scaleEvents(t,3,2).put;assert.deepEqual(back.map(e=>[e.startTick,e.durationTick]),[[0,480],[480,480]]);
}
assert.deepEqual(legatoEvents([a,{...b,durationTick:100},c]).put.map(e=>e.durationTick),[480,960,240],'legato fills each gap to the next onset');
assert.deepEqual(reverseEvents([a,b,c]).put.map(e=>[e.id,e.startTick]),[[a.id,1200],[b.id,720],[c.id,0]],'retrograde within the span');
{
  const e=euclidEvents({k:3,n:8,startTick:0,endTick:3840,coordinate:[0,0],velocity:70},allIds(project)).put;
  assert.deepEqual(e.map(x=>[x.startTick,x.durationTick,x.velocity]),[[0,480,70],[1440,480,70],[2880,480,70]]);
  const five=euclidEvents({k:5,n:5,startTick:0,endTick:3840,coordinate:[0,0],gate:.5},allIds(project)).put;
  assert.deepEqual(five.map(x=>x.startTick),[0,768,1536,2304,3072],'five even notes over a 4/4 bar');assert.ok(five.every(x=>x.durationTick===384));
}
{
  const clip=copyEvents([b,c]);assert.equal(clip.span,1200);assert.deepEqual(clip.events.map(e=>e.offset),[0,960]);
  const pasted=pasteEvents(clip,3840,allIds(project)).put;assert.deepEqual(pasted.map(e=>e.startTick),[3840,4800]);
  assert.ok(pasted.every(e=>![a.id,b.id,c.id].includes(e.id)),'pasted notes are new notes');
  assert.deepEqual(pasted.map(e=>e.tones[0].coordinate),[[0,2],[1,-1]]);
  assert.equal(copyEvents([]),null);
}
assert.deepEqual(velocityEvents([a,b],{value:200}).put.map(e=>e.velocity),[127,127]);
assert.deepEqual(velocityEvents([a],{delta:-100}).put[0].velocity,1);

// Scale steps follow the composition's own scale, across registers, and come back exactly.
{
  const degrees=ctx.scale.degrees,n=degrees.length,cents=m=>resolveTone(ctx,m).cents;
  let m=degrees[0].coordinate;const walk=[m];
  for(let i=0;i<2*n+1;i++){m=transposeSteps(ctx,m,1);walk.push(m);}
  assert.ok(walk.every((x,i)=>!i||cents(x)>cents(walk[i-1])),'each step rises');
  assert.deepEqual(walk.slice(0,n+1).map(x=>degreeOf(ctx,x).degree).sort((x,y)=>x-y),[0,0,...Array.from({length:n-1},(_,i)=>i+1)],'one period visits every degree');
  assert.ok(Math.abs(cents(walk[n])-cents(walk[0])-cents([1,0]))<1e-9,'n steps make a period');
  assert.deepEqual(transposeSteps(ctx,walk.at(-1),-(2*n+1)),walk[0],'and back');
  assert.equal(transposeSteps(ctx,[30,50],1),null,'outside the scale has no step');
  const out=transposeEvents(ctx,[{...a,tones:[{toneId:'t',coordinate:[30,50]}]}],{steps:1,periods:-1}).put[0];
  assert.deepEqual(out.tones[0].coordinate,[29,50],'notes outside the scale move by periods only');
  // A temperament whose degrees are not in coordinate order still steps by pitch.
  const pajara=captureContext({...makeState('pajara7'),n:10,mode:2},220);
  let p=pajara.scale.degrees[3].coordinate;const ps=[p];
  for(let i=0;i<25;i++){p=transposeSteps(pajara,p,1);ps.push(p);}
  assert.ok(ps.every((x,i)=>!i||resolveTone(pajara,x).cents>resolveTone(pajara,ps[i-1]).cents),'divided-period scales step upward too');
}

// ---- batch edit command ----
{
  const before=JSON.stringify(project);
  const moved=editEvents(project,melody,{remove:[c.id],put:[{...a,startTick:7680}]});
  assert.deepEqual(moved.clips[1].events.map(e=>e.id),[b.id,a.id],'one edit removes, replaces and re-sorts');
  assert.ok(moved.clips[1].lengthTick>=7680+480,'clips grow to fit');
  assert.equal(moved.revision,project.revision+1);assert.equal(JSON.stringify(project),before,'the input is never mutated');
  assert.throws(()=>editEvents(project,melody,{put:[{...a,startTick:-1}]}),/startTick/,'validation applies to the whole edit');
  assert.throws(()=>editEvents(project,melody,{remove:['missing']}),/no event/);
  assert.equal(JSON.stringify(project),before);
}

// ---- meter groups persist and validate ----
{
  let p=setMeter(project,{numerator:7,denominator:8,groups:[3,2,2]});
  assert.deepEqual(p.meter,{numerator:7,denominator:8,groups:[3,2,2]});
  assert.deepEqual(parseProject(serializeProject(p)).meter.groups,[3,2,2],'groups are saved');
  assert.deepEqual(setMeter(p,{numerator:7,denominator:4}).meter.groups,[3,2,2],'kept while they still fit');
  assert.equal(setMeter(p,{numerator:5,denominator:8}).meter.groups,undefined,'dropped when the numerator changes');
  assert.equal(setMeter(p,{numerator:7,denominator:8,groups:null}).meter.groups,undefined,'null returns to the default');
  assert.throws(()=>setMeter(p,{numerator:7,denominator:8,groups:[4,4]}),/meter.groups/);
  assert.throws(()=>validateProject({...p,meter:{...p.meter,groups:[1]}}),/meter.groups/);
}

console.log('composition-rhythm: ok');
