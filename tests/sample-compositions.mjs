// Acceptance checks for the ready-to-open example compositions.
import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {captureContext,validateContext,resolveTone} from '../dist/composition-context.mjs';
import {PPQ,barTicks,contentEndTick,parseProject,serializeProject} from '../dist/composition-project.mjs';
import {boardSnapshot} from '../dist/composition-cues.mjs';
import {buildChart} from '../dist/composition-game.mjs';
import {buildBoard} from '../dist/hexboard.mjs';
import {rollRows} from '../dist/composition-view.mjs';
import {validateState} from '../dist/state.mjs';

const directory=fileURLToPath(new URL('../examples/compositions/',import.meta.url));
const files=(await readdir(directory)).filter(name=>name.endsWith('.composition.json')).sort();
assert.ok(files.length>=6,`expected at least six sample compositions, found ${files.length}`);

const mappings=new Set(),styles=new Set();
let hasUnusualMeter=false,hasShortNote=false;
for(const file of files){
  const label=file.replace(/\.composition\.json$/,'');
  const source=await readFile(new URL(`../examples/compositions/${file}`,import.meta.url),'utf8');
  const project=parseProject(source);
  assert.deepEqual(parseProject(serializeProject(project)),project,`${label}: standalone save/open round trip`);
  assert.ok(project.name.trim(),`${label}: title`);

  const state=validateState(structuredClone(project.context.state));
  validateContext(project.context);
  const captured=captureContext(state,project.context.tonicHz);
  assert.deepEqual(project.context.scale,captured.scale,`${label}: scale matches the saved temperament`);
  assert.deepEqual(project.context.tuning,captured.tuning,`${label}: tuning matches the saved temperament`);
  mappings.add(JSON.stringify([state.basis,state.rows]));
  assert.ok(project.layout?.style,`${label}: a saved HexBoard layout is required for Play`);
  styles.add(project.layout.style);

  assert.deepEqual(project.tracks.map(t=>t.kind).sort(),['chords','melody'],`${label}: editable chord and melody tracks`);
  assert.equal(project.clips.length,2,`${label}: one clip per part`);
  for(const track of project.tracks){
    const clips=project.clips.filter(c=>c.trackId===track.id);
    assert.equal(clips.length,1,`${label}: ${track.kind} clip`);
    assert.equal(clips[0].repeat,1,`${label}: ${track.kind} is directly editable`);
    assert.ok(clips[0].events.length,`${label}: ${track.kind} has notes`);
  }

  const bar=barTicks(project.meter),end=contentEndTick(project);
  assert.ok(Number.isSafeInteger(bar)&&bar>0,`${label}: integer bar grid`);
  assert.ok(Number.isSafeInteger(end)&&end>=bar,`${label}: integer arrangement length`);
  if(project.meter.numerator!==4||project.meter.denominator!==4)hasUnusualMeter=true;
  if(project.loop.enabled){
    const loopEnd=project.loop.endTick??end;
    assert.ok(project.loop.startTick<loopEnd&&loopEnd<=end,`${label}: loop stays within the arrangement`);
  }
  for(const clip of project.clips){
    assert.ok(Number.isSafeInteger(clip.startTick)&&Number.isSafeInteger(clip.lengthTick),`${label}: integer clip ticks`);
    for(const event of clip.events){
      assert.ok(Number.isSafeInteger(event.startTick)&&Number.isSafeInteger(event.durationTick),`${label}: integer note ticks`);
      if(event.durationTick<PPQ)hasShortNote=true;
      for(const tone of event.tones){
        const {hz}=resolveTone(project.context,tone.coordinate);
        assert.ok(Number.isFinite(hz)&&hz>=20&&hz<=20000,`${label}: audible tone ${tone.coordinate}`);
      }
    }
  }

  const snapshot=boardSnapshot(project);
  assert.equal(snapshot.status,'ok',`${label}: saved layout builds (${snapshot.reason??''})`);
  const board=buildBoard(project.context.state,project.layout);
  const melody=project.clips.find(c=>project.tracks.find(t=>t.id===c.trackId).kind==='melody');
  const rows=new Set(rollRows(project,board,null,melody.events).map(r=>r.coordinate.join(',')));
  for(const event of melody.events)for(const tone of event.tones)
    assert.ok(rows.has(tone.coordinate.join(',')),`${label}: melody pitch ${tone.coordinate} appears in the piano roll`);

  for(const part of ['melody','chords','both']){
    const targets=buildChart(project,{part,snapshot}).targets;
    assert.ok(targets.length,`${label}: Play ${part} has targets`);
    if(part==='both'){
      const onsets=new Set();
      for(const target of targets){
        const key=`${target.tick}:${target.coordinate.join(',')}`;
        assert.ok(!onsets.has(key),`${label}: simultaneous duplicate pitch ${key} needs two fresh presses`);
        onsets.add(key);
      }
    }
    for(const target of targets){
      assert.ok(target.keys.length,`${label}: Play ${part} cannot reach ${target.coordinate}`);
      assert.ok(target.degreeKeys.length,`${label}: Play ${part} has no degree key for ${target.coordinate}`);
    }
  }
}

assert.ok(mappings.size>=4,`expected at least four distinct tuning mappings, found ${mappings.size}`);
assert.ok(styles.size>=3,`expected at least three layout styles, found ${styles.size}`);
assert.ok(hasUnusualMeter,'expected a sample outside 4/4');
assert.ok(hasShortNote,'expected sub-quarter timing');
console.log(`sample-compositions: ok (${files.length} files, ${mappings.size} mappings, ${styles.size} layout styles)`);
