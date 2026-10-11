import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {diamondLayout} from '../dist/diamond-layout.mjs';
import {diamondRatios,renderDiamond,errorColor,diamondApproximation,maximumDiamondError,normalizeDiamondScope,renderDiamondTolerance} from '../dist/tonality-diamond.mjs';
import {makeState,primeFilterForBasis} from '../dist/engine.mjs';
import {fromCommas} from '../dist/tuning.mjs';
import {bestApproximations,bestModeApproximations} from '../dist/approximation-compat.mjs';
const ratios=diamondRatios(5);assert.equal(ratios.length,9);
const primeLimited=diamondRatios(5,3);assert.equal(primeLimited.length,5);assert.ok(!primeLimited.some(t=>t.label==='5/4'));
const porkypineFilter=primeFilterForBasis([2,3,5,11]),porkypineDiamond=diamondRatios(15,porkypineFilter);assert.ok(porkypineDiamond.some(t=>t.label==='11/8'));assert.ok(!porkypineDiamond.some(t=>t.label==='7/4'));
assert.equal(ratios.find(t=>t.i===2&&t.j===0).label,'5/4');
assert.equal(ratios.find(t=>t.i===0&&t.j===2).label,'8/5');
assert.equal(ratios.filter(t=>t.i===t.j&&t.label==='1/1').length,3);
assert.deepEqual(ratios.filter(t=>t.j-t.i===-1).map(t=>t.label),['3/2','5/3']);
const s=makeState('meantone'),cfg={limit:5,tol:10,filter:'mapped',outside:true};
const html=renderDiamond(s,0,cfg);assert.equal((html.match(/data-diamond=/g)||[]).length,9);assert.match(html,/data-diamond="0,5,4"/);assert.match(html,/role="button" tabindex="0"/);assert.match(html,/preserveAspectRatio="xMidYMid meet" style="--diamond-min-width:\d+px;/,'the SVG declares a desktop minimum width that can be overridden on mobile');assert.doesNotMatch(html,/<h3>/);const filteredDiamond=renderDiamond(s,0,{...cfg,primeLimit:3});assert.equal((filteredDiamond.match(/data-diamond=/g)||[]).length,4);assert.match(filteredDiamond,/5-odd-limit · 3-prime-limit tonality diamond/);
assert.match(renderDiamond(s,0,{...cfg,limit:15,primeLimit:porkypineFilter}),/15-odd-limit · 2\.3\.5\.11-prime subgroup tonality diamond/);
function assertFlushDiamondCells(html,ratios,count){
 const paths=[...html.matchAll(/<path class="diamond-cell-fill" d="M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)Z"\/>/g)].map(m=>m.slice(1).map(Number));assert.equal(paths.length,ratios.length);
 const clips=[...html.matchAll(/<clipPath id="([^"]+)" clipPathUnits="userSpaceOnUse"><polygon points="([^"]+)"\/><\/clipPath>/g)];assert.equal(clips.length,paths.length,'every cell has a paint boundary');
 assert.equal(new Set(clips.map(m=>m[1])).size,paths.length,'clip IDs are unique');
 clips.forEach((clip,index)=>{assert.deepEqual(clip[2].split(/[ ,]/).map(Number),paths[index],'clipping matches the full flush cell without insetting or expanding it');assert.ok(html.includes(`<g clip-path="url(#${clip[1]})" class="diamond-cell `),'the complete cell, including divider and highlights, is clipped');});

 const grid=html.match(/<path class="diamond-grid" d="([^"]+)" aria-hidden="true"\/>/);assert.ok(grid,'a shared grid covers every cell');
 assert.equal((html.match(/class="diamond-grid"/g)||[]).length,1,'shared borders are painted in one layer');
 assert.ok(html.indexOf('class="diamond-grid"')>html.lastIndexOf('</g>'),'cell fills and interaction highlights cannot overpaint grid edges');
 const lines=[...grid[1].matchAll(/M([\d.]+) ([\d.]+)(?:L([\d.]+) ([\d.]+)|H([\d.]+))/g)].map(m=>[Number(m[1]),Number(m[2]),Number(m[3]??m[5]),Number(m[4]??m[2])]);
 assert.equal(lines.length,4*count+1,'each lattice boundary and ratio-bar row is drawn once');
 const onLine=(x,y,[ax,ay,bx,by])=>Math.abs((x-ax)*(by-ay)-(y-ay)*(bx-ax))<1e-8&&x>=Math.min(ax,bx)&&x<=Math.max(ax,bx)&&y>=Math.min(ay,by)&&y<=Math.max(ay,by);
 for(const path of paths)for(let edge=0;edge<4;edge++){
  const a=path.slice(edge*2,edge*2+2),b=path.slice((edge+1)%4*2,(edge+1)%4*2+2);
  assert.equal(lines.filter(line=>onLine(...a,line)&&onLine(...b,line)).length,1,'each cell edge belongs to exactly one grid line');
 }
 assert.doesNotMatch(html,/diamond-divider/,'individual dividers cannot compete with the shared grid');
 assert.doesNotMatch(html,/diamond-cell-hover-border|<mask/,'larger interaction outline and its mask are removed');

 const highlights=[...html.matchAll(/<path class="diamond-cell-highlight" d="M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)Z"\/>/g)].map(m=>m.slice(1).map(Number));assert.equal(highlights.length,paths.length);
 highlights.forEach((highlight,index)=>{const shape=paths[index],cx=shape[0],cy=shape[3],rx=shape[2]-cx,ry=shape[5]-cy;for(let vertex=0;vertex<4;vertex++)assert.ok(Math.abs(highlight[2*vertex]-cx)/rx+Math.abs(highlight[2*vertex+1]-cy)/ry<.95,'interaction highlights are inset from all shared edges');});

 const cells=paths.map(([topX,topY,rightX,rightY,bottomX,bottomY,leftX,leftY],i)=>{const center={x:(rightX+leftX)/2,y:(topY+bottomY)/2},rx=rightX-center.x,ry=center.y-topY;assert.deepEqual([center.x,center.y],[8+(ratios[i].i+ratios[i].j+1)*64,8+(count+ratios[i].j-ratios[i].i)*52]);assert.equal(rx,64);assert.equal(ry,52);return {center};});
 for(let i=0;i<cells.length;i++)for(let j=i+1;j<cells.length;j++){const a=cells[i],b=cells[j],separation=Math.abs(a.center.x-b.center.x)/64+Math.abs(a.center.y-b.center.y)/52;assert.ok(separation>=2,`diamond cells ${i} and ${j} must not overlap`);const ti=ratios[i],tj=ratios[j],edgeNeighbor=(ti.i===tj.i&&Math.abs(ti.j-tj.j)===1)||(ti.j===tj.j&&Math.abs(ti.i-tj.i)===1);if(edgeNeighbor)assert.equal(separation,2,`diamond cells ${i} and ${j} must share a flush edge`);}
}
assertFlushDiamondCells(html,ratios,3);
for(const [options,layout] of [[{...cfg,limit:15,primeLimit:porkypineFilter},{}],[cfg,{harmonics:'8:9:10:11:12',fold:false}],[cfg,{harmonics:'11:9:7:6:5:4',fold:true}]]){
 const geometry=diamondLayout(options,layout);assertFlushDiamondCells(renderDiamond(s,0,{...options,geometry,selectedIds:['0:0']}),geometry.cells,geometry.count);
}
assert.match(renderDiamond(s,1,cfg),/id="diamond-clip-1-0-0"/,'separate SVGs do not share clip IDs');
const highRatios=diamondRatios(13);assert.equal(highRatios.length,49);assertFlushDiamondCells(renderDiamond(s,0,{...cfg,limit:13}),highRatios,7);assert.equal(errorColor(-10,10),errorColor(10,10));assert.equal(errorColor(0,10),'#fff');assert.equal(errorColor(10,10),'rgb(220, 38, 38)');assert.equal(errorColor(5,10),'rgb(253, 224, 71)');assert.equal(errorColor(2.5,10),'rgb(132, 204, 22)');assert.equal(errorColor(7.5,10),'rgb(251, 146, 60)');const toleranceMarkup=renderDiamondTolerance({...cfg,maxError:10,tol:10,toleranceAutomatic:true});assert.match(toleranceMarkup,/class="diamond-tolerance-control"><span>Maximum error \(cents\)<\/span><div class="diamond-tolerance-entry">/);const toleranceRow=toleranceMarkup.match(/class="diamond-tolerance-entry">([\s\S]*?)<\/div>/)?.[1]??'';assert.ok(toleranceRow.indexOf('data-diamond-tolerance')<toleranceRow.indexOf('data-diamond-tolerance-reset'),'Auto follows the value input in its row');assert.match(toleranceMarkup,/data-diamond-tolerance/);assert.match(toleranceMarkup,/value="10.000"/);assert.match(toleranceMarkup,/data-diamond-tolerance-reset[^>]*disabled/);const manualToleranceMarkup=renderDiamondTolerance({...cfg,tol:7.25,toleranceAutomatic:false});assert.match(manualToleranceMarkup,/value="7.250" data-diamond-tolerance/);assert.doesNotMatch(manualToleranceMarkup,/data-diamond-tolerance-reset[^>]*disabled/);assert.doesNotMatch(html,/diamond-legend|diamond-gradient|Mapped interval error · absolute cents/);assert.doesNotMatch(toleranceMarkup,/diamond-legend|diamond-gradient/);const mappedErrors=ratios.map(t=>diamondApproximation(s,t,{...cfg,scope:'mapping',filter:'mapped',tol:Infinity,outside:true}).approximation).filter(Boolean).map(v=>Math.abs(v.error));assert.equal(maximumDiamondError(s,{...cfg,limit:5,scope:'mapping',filter:'mapped'}),Math.max(...mappedErrors));
assert.doesNotMatch(renderDiamond({...s,g:650},0,cfg),/NaN|undefined/);
const tiny={...s,n:2},target=ratios.find(t=>t.label==='5/4'),mapping=diamondApproximation(tiny,target,{...cfg,scope:'mapping',filter:'all'}),finite=diamondApproximation(tiny,target,{...cfg,scope:'scale',filter:'all'});assert.equal(mapping.approximation.mapped,true);assert.equal(mapping.approximation.available,false);assert.equal(finite.approximation.available,true);assert.notDeepEqual(finite.approximation.m,mapping.approximation.m);assert.doesNotMatch(renderDiamond(tiny,0,{...cfg,scope:'scale',filter:'all'}),/diamond-legend|diamond-gradient|Mapped interval error · absolute cents/);
const modeTarget=ratios.find(t=>t.label==='5/4'),mode0=bestModeApproximations({...s,n:7,mode:0},modeTarget).best[0],mode2=bestModeApproximations({...s,n:7,mode:2},modeTarget).best[0];assert.notDeepEqual(mode0.m,mode2.m);assert.ok(Math.abs(mode0.error)<Math.abs(mode2.error));
const matrixOnlyState={...s,n:7,mode:2},matrixTarget=diamondRatios(13).find(t=>t.label==='4/3'),stretched={...matrixOnlyState,g:500,p:1200},scaleView=diamondApproximation(stretched,matrixTarget,{scope:'scale',filter:'mapped',tol:10}),modeView=diamondApproximation(matrixOnlyState,modeTarget,{scope:'mode',filter:'mapped',tol:10}),modeFallback=diamondApproximation(matrixOnlyState,modeTarget,{scope:'mode',filter:'all',tol:10});
assert.deepEqual(scaleView.approximation.m,[1,-1]);assert.equal(scaleView.approximation.available,true);assert.equal(scaleView.approximation.mapped,true);assert.equal(scaleView.source,'scale');assert.equal(bestApproximations(stretched,matrixTarget).best[0].mapped,false,'scale scope must find an exact matrix mapping even when a different matrix interval is closer in cents');
assert.equal(modeView.approximation,null);assert.equal(modeFallback.approximation.mapped,false);assert.equal(modeView.source,'mode');for(const scope of ['mapping','scale','mode']){const rendered=renderDiamond(matrixOnlyState,0,{...cfg,scope});assert.doesNotMatch(rendered,/diamond-legend|diamond-gradient|Mapped interval error · absolute cents/);assert.doesNotMatch(rendered,/current scale matrix|current mode/);}
assert.equal(normalizeDiamondScope('scale',3),'mode');assert.equal(normalizeDiamondScope('scale',4),'scale');assert.equal(normalizeDiamondScope('scale'),'mode');assert.equal(normalizeDiamondScope('mode',3),'mode');assert.equal(normalizeDiamondScope('mapping',4),'mapping');
const divided={...fromCommas('128/125','2.3.5','Computed WE'),n:7,mode:0},fifth=ratios.find(t=>t.label==='3/2');
const onePeriodMode=bestModeApproximations(divided,fifth).best[0],onePeriodAvailable=bestApproximations(divided,fifth).best[0];
divided.matrixOctave=true;
const wholeOctaveMode=bestModeApproximations(divided,fifth).best[0],wholeOctaveAvailable=bestApproximations(divided,fifth).best[0];
assert.ok(wholeOctaveMode.c>divided.p);assert.ok(Math.abs(wholeOctaveMode.error)<Math.abs(onePeriodMode.error));assert.equal(wholeOctaveMode.mapped,true);
assert.ok(wholeOctaveAvailable.c>divided.p);assert.ok(Math.abs(wholeOctaveAvailable.error)<Math.abs(onePeriodAvailable.error));assert.equal(wholeOctaveAvailable.mapped,true);
const style=readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
assert.doesNotMatch(style,/diamond-cell\s*>\s*path:first-of-type|diamond-divider/,'legacy competing cell-border rules are removed');
assert.match(style,/\.diamond-cell > \.diamond-cell-fill\s*\{[^}]*stroke:\s*none;[^}]*shape-rendering:\s*crispEdges;/,'fills avoid per-cell outlines and order-dependent edge blending');
assert.match(style,/\.diamond-grid\s*\{[^}]*stroke-width:\s*1;[^}]*vector-effect:\s*non-scaling-stroke;[^}]*pointer-events:\s*none;/,'one consistent screen-width grid preserves pointer interaction');
assert.doesNotMatch(style,/\.diamond-cell\.(?:selected|is-playing|focus-highlight)\s*>\s*\.diamond-cell-fill/,'active states preserve the interval colour');
assert.match(style,/\.diamond-cell.selected text,\s*\.diamond-cell.is-playing text,\s*\.diamond-cell.focus-highlight text\s*\{\s*font-weight: 800;/,'all active states bold the numbers without recolouring them');
assert.match(html,/class="diamond-cell-active-divider"/,'active cells can thicken their ratio divider without moving geometry');
console.log('Diamond ratio placement, flush non-overlapping cell edges, duplicates, higher limits, interaction attributes, and signed-error coloring passed.');
