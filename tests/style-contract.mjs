// Protect the retained cascade (including responsive rule order) while removing
// unused legacy selectors and extracting constants. No browser is required.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {transform} from 'esbuild';

const extracted = ["--board-bg","--border-strong","--control-bg","--detail-text","--font-mono","--font-ui","--inset-bg"];
async function canonical(source) {
  source = (await transform(source,{loader:'css',minifyWhitespace:true})).code;
  const root = source.match(/:root\{([^}]+)\}/)[1];
  const constants = Object.fromEntries([...root.matchAll(/(--[\w-]+):([^;]+);?/g)].map(m=>[m[1],m[2]]));
  for (const name of extracted) source=source.replace(new RegExp(name+':[^;}]+;?'),'');
  source=source.replace(/var\((--[\w-]+)\)/g,(match,name)=>constants[name]??match);
  return (await transform(source,{loader:'css',minifyWhitespace:true})).code;
}
const source=readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
const current=await canonical(source.split('/* Period wrapping controls */')[0]);
if (process.argv[2]) {
  const baseline=await canonical(readFileSync(process.argv[2],'utf8'));
  assert.equal(current,baseline,'Retained rules must match the pre-refactor cascade.');
  console.log(createHash('sha256').update(baseline).digest('hex'));
} else {
  // Updated for the canonical shared diamond grid and cell styles, , the removed setup row and the relocated pointer controls.
  const expected='bb19387fd167b340c585a1c013ffd4098333e34e20ccde1e6159eb1958b45a8d';
  assert.equal(createHash('sha256').update(current).digest('hex'),expected);
}
assert.ok(source.includes('--matrix-cell-height'));
assert.ok(source.includes('overflow: auto'));
assert.ok(source.includes('.hex-primary-controls'));
assert.match(source,/\.discover-module select\s*\{[^}]*height:\s*32px;[^}]*border-radius:\s*6px;/,'Discover dropdowns share one height and control style');
assert.match(source,/\.discover-scale \.formrow\s*\{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,'the scale size and mode controls share one row');
assert.match(source,/\.discover-scale \.scale-advanced\s*\{[^}]*border:\s*0;/,'the Discover scale disclosure has no outline');
assert.match(source,/\.discover-module \.tuning-choice > \.tuning-summary\s*\{[^}]*margin:\s*15px 0 0;/,'Generator and Period align with the tuning select field');
assert.match(source,/\.discover-module \.tuning-summary > span,\s*\.discover-module \.tuning-summary \.period-summary > span\s*\{[^}]*width:\s*100%;[^}]*justify-content:\s*space-between;/,'Generator and Period labels are left aligned while cent values share a right edge');
assert.match(source,/\.discover-module \.advanced-temperament-options\[open\],\s*\.discover-module \.advanced-tuning-options\[open\]\s*\{[^}]*border-bottom:\s*0;/,'expanded advanced option menus have no bottom rule');
assert.match(source,/\.hex-custom-color \.hex-controls\s*\{[^}]*grid-template-columns:\s*96px[^}]*\}[\s\S]*?\.hex-custom-color \.hex-controls h4\s*\{[^}]*width:\s*96px;/,'selected-button title width stays fixed as its number changes');
assert.match(source,/\.hex-live-chord-readout\s*\{[^}]*height:\s*100px;[^}]*min-height:\s*100px;/,'live chord readout reserves a fixed desktop footprint');
assert.match(source,/\.live-chord-value\s*\{[^}]*white-space:\s*nowrap;[^}]*text-overflow:\s*ellipsis;/,'long chord labels cannot grow the readout');
assert.match(source,/\.live-chord-alternatives ul\s*\{[^}]*position:\s*absolute;/,'alternate chord labels open as an overlay without changing page flow');
assert.match(source,/@media\s*\(max-width:\s*560px\)\s*\{[^}]*\.hex-live-chord-readout\s*\{[^}]*height:\s*124px;/,'mobile live chord readout keeps a fixed responsive footprint');
assert.match(source,/#play-view \.hex-primary-controls\.hex-top-controls\s*\{[^}]*grid-template-columns:[^}]*repeat\(2,minmax\(100px,1fr\)\);[^}]*gap:\s*8px;/,'instrument and primary controls share one grid row');
assert.match(source,/#play-view \.hex-primary-controls\s*>\s*label\s*>\s*span\s*\{[^}]*min-height:\s*32px;[^}]*align-items:\s*flex-end;/,'control captions have a shared height so their fields align');
assert.match(source,/#play-view \.hex-primary-controls \.hex-toggle-button\[aria-pressed="true"\]\s*\{[^}]*background:\s*#[\da-f]+;[^}]*box-shadow:/,'active layout toggles have a visible illuminated state');
assert.match(source,/\.discover-module \.advanced-temperament-options,\s*\.discover-module \.advanced-tuning-options,\s*#play-view \.layout-settings\s*\{[^}]*margin:\s*8px 0 0;[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*border-radius:\s*0;/,'layout and Discover advanced menus share their wrapper styling');
assert.match(source,/\.advanced-approximation-options\s*\{[^}]*margin:\s*8px 0 0;[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*border-radius:\s*0;/,'advanced approximation options share the existing advanced-menu wrapper style');
assert.match(source,/\.advanced-approximation-options\s*>\s*summary\s*\{[^}]*padding:\s*6px 0;[^}]*line-height:\s*20px;[^}]*font-size:\s*14px;[^}]*color:\s*var\(--muted\);[^}]*margin:\s*0;/,'advanced approximation summary matches existing advanced-menu typography');
assert.match(source,/\.advanced-approximation-options\[open\]\s*\{[^}]*padding-bottom:\s*14px;[^}]*border-bottom:\s*0;/,'expanded approximation options use existing advanced-menu spacing');
assert.match(source,/\.advanced-approximation-options\s*>\s*label\s*\{[^}]*margin:\s*8px 0;/,'the nested odd-limit selector has advanced-menu label spacing');
assert.match(source,/\.discover-module \.advanced-temperament-options\s*>\s*summary,\s*\.discover-module \.advanced-tuning-options\s*>\s*summary,\s*#play-view \.layout-settings\s*>\s*summary\s*\{[^}]*padding:\s*6px 0;[^}]*line-height:\s*20px;[^}]*font-size:\s*14px;[^}]*color:\s*var\(--muted\);[^}]*margin:\s*0;/,'layout and Discover advanced summaries share their typography');
assert.match(source,/\.discover-module \.advanced-temperament-options\[open\],\s*\.discover-module \.advanced-tuning-options\[open\],\s*#play-view \.layout-settings\[open\]\s*\{[^}]*padding-bottom:\s*14px;[^}]*border-bottom:\s*0;/,'layout and Discover advanced menus share expanded spacing');
assert.match(source,/@media\(max-width:450px\)\s*\{\s*#play-view \.hex-primary-controls\.hex-top-controls\s*\{[^}]*\}\s*\}\s*\.discover-module \.advanced-temperament-options,/,'advanced menu rules remain outside responsive grid media queries');
