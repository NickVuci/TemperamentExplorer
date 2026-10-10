// Play's board picture, key by key, against a fixture recorded from the renderer it replaced
// (fill, outline, labels, classes, accessible names, geometry, tonic marker and the device frame).
// `node tests/hexboard-parity.mjs --record` rewrites the fixture; only do that for an intended change.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {makeState} from '../dist/engine.mjs';
import {buildBoard} from '../dist/hexboard.mjs';
import {createHexboardWorkspace} from '../dist/hexboard-ui.mjs';

const fixtureUrl=new URL('./fixtures/hexboard-parity.json',import.meta.url);
// Button colours belong to one layout, so they are applied after the layout change that would clear them.
function workspace(name,patch={},n,colors=null){
 const s=makeState(name);if(n)Object.assign(s,{n,mode:0});
 const ws=createHexboardWorkspace({getStates:()=>[s],play(){},refresh(){},notify:m=>{throw Error(m);},getHz:()=>220,download(){}});
 ws.render();ws.restore({configs:[{...ws.serialize().configs[0],...patch}]});
 if(colors){ws.render();ws.restore({configs:[{...ws.serialize().configs[0],...colors}]});}
 return {ws,s};
}
const CASES={
 'meantone wrapped':()=>workspace('meantone'),
 'meantone unwrapped, turned':()=>workspace('meantone',{periodWrapping:false,rotation:2,deviceRotation:0,outside:true}),
 'meantone flipped, labelled, coloured':()=>workspace('meantone',{flipHorizontal:true,showPeriodLabels:true,palette:'ocean'},null,{keyColors:{61:'#123456'},degreeColors:{2:'#abcdef'},layerColors:{7:'#fedcba'}}),
 'meantone overlapping copies':()=>workspace('meantone',{periodPlacement:{column:-6,row:1}}),
 'meantone empty keys':()=>workspace('meantone',{periodPlacement:{column:-6,row:2}}),
 'diaschismic divided period':()=>workspace('diaschismic',{},10),
 'diaschismic unwrapped period axes':()=>workspace('diaschismic',{periodWrapping:false,style:'period',deviceRotation:3},10),
 'miracle chord selection':()=>workspace('miracle11',{chord:[65,66,74],selected:66,root:66,selectChord:true}),
 'meantone shown chord':()=>{const r=workspace('meantone',{selected:70});const b=buildBoard(r.s,r.ws.serialize().configs[0]);r.ws.showChord([b.keys[65].m,b.keys[66].m,b.keys[74].m],'Shown',{exact:true});return r;},
 'meantone scale highlight':()=>{const r=workspace('meantone');r.ws.showScale([[0,0],[0,1],[0,2],[0,3],[0,4]],'Pentatonic');return r;},
 'meantone manual axes':()=>workspace('meantone',{periodWrapping:false,style:'manual',ap:1,ag:-1,bp:0,bg:1,outside:true}),
};
const attrs=text=>Object.fromEntries([...text.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]).sort(([a],[b])=>a<b?-1:a>b?1:0));
// The board SVG as plain records: the root attributes and every key's parts, classes as a sorted set.
function picture(ws){
 const html=ws.render(),svg=html.match(/<svg class="hex-board[^]*?<\/svg>/)[0],root=attrs(svg.match(/^<svg[^>]*>/)[0]);
 root.class=root.class.split(/\s+/).filter(Boolean).sort().join(' ');
 const keys=[...svg.matchAll(/<g ([^>]*)>([^]*?)<\/g>/g)].map(([,head,body])=>{
  const a=attrs(head);a.class=(a.class??'').split(/\s+/).filter(Boolean).sort().join(' ');
  return {...a,title:body.match(/<title>([^<]*)<\/title>/)?.[1],polygon:attrs(body.match(/<polygon[^>]*>/)[0]),
   texts:[...body.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)].map(([,t,content])=>({...attrs(t),content})),
   circle:body.match(/<circle[^>]*>/)?attrs(body.match(/<circle[^>]*>/)[0]):null};
 });
 return {root,keys,device:ws.deviceSnapshot().keys.map(({index,command,enabled,color,layoutColor,marked,lit})=>({index,command,enabled,color,layoutColor,marked,lit}))};
}
// The fixture keeps a short hash of each record; a mismatch prints the current record.
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,16);
const current=Object.fromEntries(Object.entries(CASES).map(([name,make])=>[name,picture(make().ws)]));
const digest=c=>({root:hash(c.root),keys:c.keys.map(k=>[k['data-hex-key'],hash(k)]),device:hash(c.device)});
if(process.argv.includes('--record')){writeFileSync(fixtureUrl,JSON.stringify(Object.fromEntries(Object.entries(current).map(([n,c])=>[n,digest(c)])),null,1)+'\n');console.log('Recorded',Object.keys(current).length,'HexBoard parity cases.');process.exit(0);}
const expected=JSON.parse(readFileSync(fixtureUrl,'utf8'));
assert.deepEqual(Object.keys(current),Object.keys(expected));
let keys=0;
for(const [name,want] of Object.entries(expected)){
 const got=current[name],d=digest(got);
 assert.equal(d.root,want.root,`${name}: svg root ${JSON.stringify(got.root)}`);
 assert.equal(d.keys.length,want.keys.length,`${name}: key count`);
 d.keys.forEach(([id,h],i)=>{assert.deepEqual([id,h],want.keys[i],`${name}: key ${want.keys[i][0]} ${JSON.stringify(got.keys[i])}`);keys++;});
 assert.equal(d.device,want.device,`${name}: device frame`);
}
console.log(`HexBoard parity: ${keys} keys across ${Object.keys(expected).length} layouts match the recorded Play board and device frame.`);
