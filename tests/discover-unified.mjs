import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {syncUnifiedPanelHeights,renderUnified,unifiedCenterToggle,unifiedCenterView,normalizeUnifiedCenter,unifiedDirectory,unifiedDetail} from '../dist/discover-unified.mjs';

// The centre pane shows the diamond by default and borrows the single views' behaviour.
assert.equal(normalizeUnifiedCenter('matrix'),'matrix');
assert.equal(normalizeUnifiedCenter('chords'),'diamond','unknown saved values fall back to the diamond');
assert.equal(normalizeUnifiedCenter(undefined),'diamond');
assert.equal(unifiedCenterView('diamond'),'targets');
assert.equal(unifiedCenterView('matrix'),'matrices');

const toggle=unifiedCenterToggle('matrix');
assert.match(toggle,/data-unified-center="matrix" aria-pressed="true" class="active"/);
assert.match(toggle,/data-unified-center="diamond" aria-pressed="false"/);

// Directory and analysis come from one catalogue's parts; the layout only places them.
const parts={controls:'<div class="harmony-controls">C</div>',list:'<ol class="harmony-list">L</ol>',detail:'<h4>4:5:6</h4>',info:'<details>I</details>'};
assert.equal(unifiedDirectory(parts),'<div class="harmony-controls">C</div><div class="unified-directory-list"><ol class="harmony-list">L</ol></div><details>I</details>');
assert.equal(unifiedDetail(parts),'<h4>4:5:6</h4>');

const html=renderUnified({center:'diamond',centerMarkup:'<div class="diamond-pair">D</div>',directory:unifiedDirectory(parts),detail:unifiedDetail(parts),scaleControls:'<div class="formrow"><select data-field="n"></select></div>',scaleMarkup:'<section class="scale-details">S</section>'});
const order=['unified-directory','unified-center','unified-analysis','unified-scale'].map(name=>html.indexOf('unified-pane '+name));
assert.ok(order.every(i=>i>=0)&&order.every((v,i,a)=>!i||v>a[i-1]),'directory, centre, analysis, then scale');
assert.match(html,/data-unified-pane="directory">[^]*harmony-list/);
assert.match(html,/data-unified-pane="detail"[^>]*>[^]*4:5:6/);
assert.match(html,/diamond-pair[^]*unified-analysis/,'the centre markup sits in the centre pane');
assert.match(html,/unified-pane unified-scale[^]*unified-scale-controls[^]*data-field="n"[^]*scale-details/,'scale and mode controls sit inside the scale pane, above the scale details');
assert.equal((html.match(/data-unified-pane=/g)||[]).length,2,'only directory and analysis are refreshed by the catalogue');

// Wiring: a Discover tab, the catalogue's shared parts, and a partial refresh that keeps the centre.
const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const index=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const catalogue=readFileSync(new URL('../dist/harmonic-catalogue-ui.mjs',import.meta.url),'utf8');
assert.doesNotMatch(index,/data-view=|workspace-tabs/,'Discover has no sub-tabs');
assert.match(index,/<div id="workspace"><\/div><div id="inspector"[^>]*><\/div><details id="approximation-settings" class="approximation-settings" hidden><summary>Approximation settings<\/summary><div id="approximation-settings-body"><\/div><\/details><\/section>/,'approximation settings are a collapsible section after the workspace');
assert.match(app,/inDiscover=section==='discover';\$\('#approximation-settings'\)\.hidden=!inDiscover;\(inDiscover\?\$\('#approximation-settings-body'\):\$\('#analysis-explore \.sectionhead'\)\)\.appendChild\(approximation\);/,'approximation controls move to the bottom in Discover and back to the header in Play');
assert.match(app,/if\(sectionFor\(view\)==='discover'\)view='unified';/,'any Discover view name renders the unified screen');
assert.match(app,/detail:manualChordInspector\?chordWorkspace\.render\(\):unifiedDetail\(parts\)/,'the manual note inspector opens in the analysis pane');
assert.match(catalogue,/function render\(\)\{const parts=renderParts\(\);/,'the Chords tab and Unified share one renderer');
assert.match(app,/function refreshHarmony\(\)\{.*view!=='unified'.*parts=harmonicWorkspace\.renderParts\(\{directory:true\}\).*if\(!manualChordInspector\)detail\.innerHTML=unifiedDetail\(parts\)/,'a catalogue refresh rewrites only the directory, and the analysis unless the note inspector is open');
assert.match(app,/syncUnifiedPanelHeights\(\);applyHarmonicFocus\(\);/,'every redraw shows the focused harmony on the diamond and matrix');
assert.match(app,/settings:\{[^}]*unifiedCenter,/,'the centre choice is saved with the session');

assert.doesNotMatch(app,/explore-scale-controls/,'the scale pane holds the only scale and mode controls');
assert.match(app,/scaleControls:scaleControls\(\),scaleMarkup:scaleDetails\(\)/);

// The scale pane follows the three main modules.
assert.match(html,/<div class="unified-main">[^]*unified-directory[^]*unified-center[^]*unified-analysis[^]*<\/div>\s*<section class="unified-pane unified-scale"/,'directory, centre and analysis share one wrapper that closes before the scale pane');
const css=readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
assert.match(css,/\.unified-main\s*\{[^}]*grid-template-areas:\s*"directory center analysis";/);
assert.doesNotMatch(css,/\.unified-workspace\s*\{[^}]*grid-template-areas/,'the scale row follows the main grid');
assert.match(css,/\.unified-directory, \.unified-analysis \{ position: static; height: var\(--unified-center-height,auto\); min-height: 0; overflow-y: auto;/);

console.log('discover-unified: ok');

let height=480,callback,disconnected=0;const props={};
const wrapper={style:{setProperty:(key,value)=>props[key]=value}};
const center={closest:()=>wrapper,getBoundingClientRect:()=>({height})};
class Observer{constructor(fn){callback=fn;}observe(node){assert.equal(node,center);}disconnect(){disconnected++;}}
syncUnifiedPanelHeights({querySelector:()=>center},Observer);assert.equal(props['--unified-center-height'],'480px');
height=640;callback();assert.equal(props['--unified-center-height'],'640px');
syncUnifiedPanelHeights({querySelector:()=>null},Observer);assert.equal(disconnected,1);
