import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SESSION_V1,SESSION_V2,isSessionFormat,sessionFormat,compositionForSave,compositionFromSession} from '../dist/composition-session.mjs';
import {captureContext} from '../dist/composition-context.mjs';
import {createProject,addEvent,makeEvent} from '../dist/composition-project.mjs';

const corpus=JSON.parse(await readFile(new URL('./fixtures/composition/phase0-corpus.json',import.meta.url),'utf8'));
const ctx=captureContext(corpus.fixtures[0].state,220);
let project=createProject({name:'session piece',context:ctx,tempo:90});
project=addEvent(project,project.clips[1].id,makeEvent({startTick:0,durationTick:960,tones:[{coordinate:[0,0]}]}));

// Format rules
assert.equal(SESSION_V1,'temperament-lab-v1');assert.equal(SESSION_V2,'temperament-lab-v2');
assert.equal(sessionFormat(null),SESSION_V1,'no composition keeps the v1 envelope');
assert.equal(sessionFormat(project),SESSION_V2,'a composition requires v2 so older apps refuse it');
assert.deepEqual(compositionForSave(null),{});assert.deepEqual(compositionForSave(project),{composition:project});
for(const f of [SESSION_V1,SESSION_V2])assert.equal(isSessionFormat(f),true);
for(const f of ['temperament-lab-v3','temperament-lab-composition-v1',undefined,null,''])assert.equal(isSessionFormat(f),false);

// Loading: v1 never carries a composition; v2 without one is fine; a present one is validated.
assert.equal(compositionFromSession({format:SESSION_V1}),null);
assert.equal(compositionFromSession({format:SESSION_V1,composition:project}),null,'a v1 file cannot smuggle a composition in');
assert.equal(compositionFromSession({format:SESSION_V2}),null);
assert.equal(compositionFromSession({format:SESSION_V2,composition:null}),null);
const back=compositionFromSession(JSON.parse(JSON.stringify({format:SESSION_V2,composition:project})));
assert.deepEqual(back,project,'save then load round-trips the project');
assert.notEqual(back,project,'the loaded project is a fresh copy');
assert.throws(()=>compositionFromSession({format:SESSION_V2,composition:{...project,tempo:5}}),/tempo/);
assert.throws(()=>compositionFromSession({format:SESSION_V2,composition:{...project,format:'temperament-lab-composition-v2'}}),/newer app/);

// A whole save written the way app.mjs writes it parses back the same.
const save=JSON.parse(JSON.stringify({format:sessionFormat(project),workflowVersion:8,states:[corpus.fixtures[0].state],...compositionForSave(project)}));
assert.equal(save.format,SESSION_V2);assert.deepEqual(compositionFromSession(save),project);
const legacy=JSON.parse(JSON.stringify({format:sessionFormat(null),workflowVersion:8,states:[corpus.fixtures[0].state],...compositionForSave(null)}));
assert.equal(legacy.format,SESSION_V1);assert.equal('composition' in legacy,false);assert.equal(compositionFromSession(legacy),null);

// app.mjs wiring: the composition is validated before any other part of the session is restored (atomic load).
const app=await readFile(new URL('../dist/app.mjs',import.meta.url),'utf8');
assert.ok(app.includes('compositionFromSession(data)'),'loader validates the composition');
const lines=app.split(/\r?\n/),loadIndex=lines.findIndex(l=>l.includes('$(\'#file\').onchange'));
const loadText=lines.slice(loadIndex,loadIndex+3).join('\n');
assert.ok(loadText.indexOf('compositionFromSession(data)')>=0&&loadText.indexOf('compositionFromSession(data)')<loadText.indexOf('harmonicWorkspace.restore(data.harmonicCatalogue)'),'validation precedes every restore');
assert.ok(loadText.indexOf('compositionWorkspace.restore(composition)')>loadText.indexOf('states=[restorePrimaryState(data)]'),'the project is restored after the setup it depends on');
assert.ok(app.includes('format:sessionFormat(compositionWorkspace.serialize())')&&app.includes('...compositionForSave(compositionWorkspace.serialize())'),'saves use the envelope rules');
assert.ok(/materialWorkspace\.restore\(null\);compositionWorkspace\.restore\(null\)/.test(app),'Reset closes the open composition');

console.log('composition-session: ok');
