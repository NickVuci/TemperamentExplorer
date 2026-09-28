import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync('dist/index.html','utf8');
const app=readFileSync('dist/app.mjs','utf8');
const style=readFileSync('dist/style.css','utf8');

assert.equal((html.match(/id="target-controls"/g)||[]).length,1);
assert.equal((html.match(/id="targetfilter"/g)||[]).length,1);
assert.match(html,/id="target-controls-parking" hidden/);
assert.match(html,/<details id="ji-controls" class="advanced-approximation-options">/);
assert.match(html,/<details id="matrix-controls" class="matrix-controls advanced-approximation-options"><summary>Advanced matrix options<\/summary>/);
assert.match(html,/<button data-view="targets">Tonality Diamond<\/button>/);
assert.doesNotMatch(html,/<button data-view="targets">JI targets<\/button>/);
const matrixAdvanced=html.match(/<details id="matrix-controls" class="matrix-controls advanced-approximation-options">[\s\S]*?<\/details>/)?.[0]??'';
assert.match(matrixAdvanced,/<div class="matrix-option-fields"><label>Arrangement<select id="layout">/);
assert.doesNotMatch(matrixAdvanced,/targetlegend|class="legend"/);
assert.match(matrixAdvanced,/<label>Arrangement<select id="layout">/);
assert.doesNotMatch(matrixAdvanced,/class="labeltoggle"/);
assert.match(html,/<div id="matrix-label-controls" class="labeltoggle">[\s\S]*Cell labels[\s\S]*data-label="cents"/);
assert.doesNotMatch(matrixAdvanced,/\bopen\b/);
assert.doesNotMatch(html,/class="toolbar"/);

const advanced=html.match(/<details id="ji-controls" class="advanced-approximation-options">[\s\S]*?<\/details>/)?.[0]??'';
assert.match(advanced,/id="limit"/);
assert.match(advanced,/id="primeLimit"/);
assert.doesNotMatch(advanced,/id="tolerance"|Tolerance · cents/);assert.match(html,/<input id="tolerance" type="hidden"/);
assert.doesNotMatch(advanced,/\bopen\b/);

assert.ok(html.includes('<section class="analysis-workspace" id="analysis-explore">'));
assert.match(html,/<div class="tabs workspace-tabs"[\s\S]*?<\/div><div id="diamond-tolerance-host" class="diamond-tolerance-host" hidden><\/div>/,'tolerance control host follows the analysis tabs');
const tolerancePlacement=app.split('\n').find(line=>line.startsWith('function placeDiamondTolerance('));assert.ok(tolerancePlacement);
let hasToleranceClass=false;const toleranceHost={hidden:true,innerHTML:'',parentElement:{classList:{toggle:(name,value)=>{if(name==='has-diamond-tolerance')hasToleranceClass=value;}}}},placement=vm.createContext({$:()=>toleranceHost,renderDiamondTolerance:cfg=>`tolerance ${cfg.tol}`});vm.runInContext(tolerancePlacement,placement);
for(const view of ['matrices','targets','scales','chords']){placement.placeDiamondTolerance(view,{tol:7.25});assert.equal(toleranceHost.hidden,false,`${view} keeps the tolerance control visible`);assert.equal(hasToleranceClass,true);assert.equal(toleranceHost.innerHTML,'tolerance 7.25');}
for(const view of ['hexboard','composition']){placement.placeDiamondTolerance(view,{tol:7.25});assert.equal(toleranceHost.hidden,true,`${view} hides the tolerance control`);assert.equal(hasToleranceClass,false);assert.equal(toleranceHost.innerHTML,'');}
assert.ok(app.includes("function settings(s=states[0]){const cfg=coverageSettings(s),autoTolerance=automaticTolerance(),tol=manualTolerance??autoTolerance;$('#tolerance').value=String(tol);return {...cfg,layout:$('#layout').value,labels:$('#labels').value,ts:targets(cfg.limit,cfg.primeLimit),tol,maxError:tol,autoTolerance,toleranceAutomatic:manualTolerance===null,filter:$('#targetfilter').value,outside:true};}"));
assert.equal((app.match(/getJI:settings/g)||[]).length,2,'both chord and HexBoard workspaces use the shared JI settings getter');assert.match(readFileSync(new URL('../dist/hexboard-ui.mjs',import.meta.url),'utf8'),/getSettings:s=>getJI\?getJI\(s\)/,'HexBoard chord search uses the shared JI settings getter');
assert.doesNotMatch(style,/#play-view \.sectionhead\.has-diamond-tolerance/,'the Play tab has no tolerance-control layout rule');
assert.ok(app.includes('placeDiamondTolerance(null);'),'tolerance control hides before view changes, including Create');
assert.ok(app.includes('placeDiamondTolerance(v,cfg);'),'tolerance control is rendered for the active diamond view');
assert.match(style,/\.diamond-tolerance-host\s*\{[^}]*margin-left:\s*auto;/,'tolerance control aligns to the right of the analysis tabs');
assert.doesNotMatch(html,/tab-compare|compare-view|compare-chooser|data-view="compare-/);
assert.doesNotMatch(html,/class="toolbar"/);

assert.match(advanced,/<label>Approximation source<select id="diamond-scope" data-diamond-scope>[\s\S]*?<span id="diamond-scope-help" class="viewnote" aria-live="polite"><\/span><\/label>/);
assert.match(advanced,/<div id="diamond-span-controls"><\/div><div data-diamond-settings><\/div>/);
assert.match(app,/source.classList.add\('diamond-source-control'\)/);
assert.ok(app.includes("function placeTargetControls(v){const controls=$('#target-controls');if(!controls)return;const host=v==='targets'?$('#ji-controls'):v==='matrices'?$('#matrix-controls .matrix-option-fields'):null;if(host){if(v==='targets')host.insertBefore(controls,host.querySelector('[data-diamond-settings]'));else host.prepend(controls);}}"));
assert.doesNotMatch(app,/targetlegend/);
assert.doesNotMatch(app,/Scale checks all intervals in the current scale matrix\.<\/p>|Mode checks tonic-relative notes in the current mode\.<\/p>/,'view explanations are no longer in the interval detail');
assert.match(app,/function updateDiamondScopeHelp\(\)[^{]*\{[^}]*Scale checks all intervals in the current scale matrix\.[^}]*Mode checks tonic-relative notes in the current mode\./,'scale and mode explanations follow the approximation-source selection');
assert.match(app,/updateDiamondScopeHelp\(\);/);
assert.ok(app.includes("function placeMatrixControls(v){if(v!=='matrices')return;const controls=$('#matrix-controls'),host=document.querySelector('[data-matrix-controls-host]'),labels=$('#matrix-label-controls'),labelHost=document.querySelector('[data-matrix-labels-host]');if(controls&&host)host.appendChild(controls);if(labels&&labelHost)labelHost.appendChild(labels);}"));
assert.ok(app.includes("const labels=$('#matrix-label-controls');if(labels)$('#matrix-label-controls-parking').appendChild(labels);"));
assert.ok(app.includes('diamondWorkspace.mountOptions();'));
assert.ok(app.includes("function placeJIControls(v){const controls=$('#ji-controls');if(controls&&v==='targets'){const panel=document.querySelector('.diamond-pair .diamond-panel');panel?.appendChild(controls);diamondWorkspace.mountOptions();const host=$('#diamond-span-controls');if(host)host.innerHTML=spanControl(states[0],0,'Target span')||'';const source=$('#diamond-scope')?.closest('label'),canvas=panel?.querySelector('.diamond-canvas');if(source&&canvas){source.classList.add('diamond-source-control');canvas.appendChild(source);updateDiamondScopeHelp();}}}"));
assert.ok(app.includes("placeMatrixControls(v);placeTargetControls(v);placeJIControls(v);"));
assert.equal(app.includes('.toolbar'),false);

const diamond=readFileSync('dist/diamond-workspace.mjs','utf8');
for(const control of ['Pointer action','Diamond layout options','Harmonics in display order','Select otonal line','Select utonal line'])assert.ok(diamond.includes(control));
assert.match(diamond,/data-diamond-settings/);
const diamondRender=readFileSync('dist/tonality-diamond.mjs','utf8');
assert.doesNotMatch(diamondRender,/Pure · 0¢/);
assert.match(diamondRender,/class="diamond-canvas"><div class="diamond-canvas-tools"/);

assert.ok(style.includes('.diamond-controls {'));
assert.match(style,/\.diamond-canvas\s*\{[^}]*position:\s*relative;/);
assert.match(style,/\.diamond-source-control \.viewnote\s*\{[^}]*display:\s*block;[^}]*min-height:\s*2.7em;[^}]*color:\s*var\(--muted\);/);
assert.match(style,/\.diamond-source-control \.viewnote\.is-empty\s*\{[^}]*visibility:\s*hidden;/,'an empty helper reserves the same height so the source selector does not shift');
assert.match(style,/\.diamond-source-control\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*auto auto 14px 0;[^}]*z-index:\s*3;[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/);
assert.match(style,/\.diamond-canvas-tools\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0 0 auto;[^}]*pointer-events:\s*none;/);
assert.doesNotMatch(style,/--diamond-tools-height/,'the controls no longer reserve a band above the SVG');
assert.match(style,/@media \(max-width:900px\)[\s\S]*?\.diamond-canvas-tools\s*\{[^}]*position:\s*static;[^}]*order:\s*1;/);
assert.match(style,/@media \(max-width:900px\)[\s\S]*?\.diamond-scroll\s*\{[^}]*order:\s*0;/);
assert.match(style,/@media \(max-width:900px\)[\s\S]*?\.diamond-source-control\s*\{[^}]*position:\s*static;[^}]*order:\s*2;/);
assert.match(style,/\.diamond-pointer-controls\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/);
assert.match(style,/\.diamond-pointer-controls \.diamond-selection-actions\s*\{[^}]*flex-direction:\s*column;/);
assert.match(style,/\.diamond-detail-heading\s*\{[^}]*display:\s*block;/);
assert.match(style,/\.diamond-detail-heading h4\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*96px minmax\(0, 1fr\);/,'the JI cents and ratio occupy distinct aligned columns');
assert.match(style,/\.diamond-detail-ratio\s*\{[^}]*text-align:\s*right;/,'the ratio is right-aligned above the cent-error column');
assert.ok(style.includes('.diamond-detail-heading {\n  padding-bottom: 5px;\n  border-bottom: 1px solid var(--border-strong);\n}'),'the selected JI heading always has a divider before approximation data');
assert.ok(style.includes('.diamond-detail > .diamond-detail-heading + .secondary-approximation {\n  margin-top: 0;\n  padding-top: 4px;\n  border-top: 0;\n}'),'a first secondary approximation uses the heading divider instead of a duplicate line');
assert.match(style,/\.diamond-detail \.approximation-heading-row\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*flex-start;/,'the approximation label and coordinate stay close together');
assert.match(style,/\.diamond-detail \.approximation-heading-row small\s*\{[^}]*flex-basis:\s*auto;/,'the coordinate remains beside its label');
assert.match(style,/\.diamond-detail \.approximation-metrics\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*96px minmax\(0, 1fr\);[^}]*gap:\s*10px;/,'cent and error columns align with the heading');
assert.match(style,/\.diamond-detail \.approximation-metrics > span\s*\{[^}]*justify-self:\s*end;[^}]*text-align:\s*right;/,'the cent-error value is right-aligned with the ratio above');
assert.match(style,/\.diamond-detail \.approximation-cents\s*\{[^}]*flex:\s*0 0 96px;[^}]*width:\s*96px;/,'the cents value reserves a fixed-width slot so the error does not shift');
assert.match(style,/\.diamond-controls\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 250px\)\);[^}]*max-width:\s*520px;/);
assert.match(style,/\.tonality-diamond\s*\{[^}]*max-width:\s*none;/);
assert.ok(style.includes('.tonality-diamond {\n  min-width: var(--diamond-min-width, 0);\n}\n@media (max-width:900px) {\n  .diamond-scroll {\n    box-sizing: border-box;\n    width: 100%;\n    min-width: 0;\n    overflow-x: hidden;\n  }\n  .diamond-scroll > .tonality-diamond {\n    box-sizing: border-box;\n    width: 100%;\n    min-width: 0;\n    max-width: 100%;\n    height: auto;\n    margin: 0 auto;\n  }\n}'),'mobile canvases constrain and center the entire diamond instead of retaining its desktop minimum width');
assert.match(style,/\.matrix-option-fields\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 300px\)\);/);
assert.match(style,/\.matrix-option-fields label\s*\{[^}]*max-width:\s*300px;/);
assert.match(style,/\.matrix-options-host\s*\{[^}]*padding:\s*0 14px 10px;/);
assert.ok(style.includes('.diamond-panel > .advanced-approximation-options {'));
assert.match(style,/\.advanced-approximation-options\[open\]\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
assert.match(style,/\#analysis-explore \.advanced-approximation-options\[open\]\s*\{[^}]*max-width:\s*none;[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
assert.match(style,/\#analysis-explore \.advanced-approximation-options\[open\]\s*> label\s*\{[^}]*grid-column:\s*auto;[^}]*width:\s*100%;/);
assert.match(style,/\#analysis-explore \.advanced-approximation-options\[open\] \.diamond-selection-controls\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
assert.match(style,/@media \(max-width:900px\)\s*\{\s*#analysis-explore \.advanced-approximation-options\[open\]\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
assert.match(style,/@media \(max-width:620px\)\s*\{\s*#analysis-explore \.advanced-approximation-options\[open\]\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/);

console.log('Diamond controls are parked centrally and placed in the diamond and matrix workspaces.');
