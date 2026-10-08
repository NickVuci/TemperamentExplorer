import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../dist/style.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');
const html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const media=(query)=>{const start=css.lastIndexOf(`@media (${query}) {`);assert.ok(start>=0,query);let depth=0,i=css.indexOf('{',start);const from=i;for(;i<css.length;i++){if(css[i]==='{')depth++;else if(css[i]==='}'&&--depth===0)break;}return css.slice(from+1,i);};

// The header floats above the page on every screen that is wide enough to afford it.
const wide=media('min-width:641px');
assert.match(wide,/\.app-header\s*\{[^}]*position:\s*sticky;[^}]*top:\s*0;[^}]*z-index:\s*200;[^}]*background:\s*var\(--bg\)/,'an opaque sticky header');
assert.match(wide,/scroll-padding-top:\s*calc\(var\(--header-h/,'scroll targets clear the header');
assert.ok(!/\.app-header\s*\{[^}]*position:\s*sticky/.test(css.slice(0,css.lastIndexOf('@media (min-width:641px)'))),'phones keep a scrolling header: it is several rows tall there');

// It sits above every other layer, including its own popovers, so panels never fall behind page content.
const zIndexes=[...css.matchAll(/z-index:\s*(\d+)/g)].map(m=>Number(m[1]));
assert.equal(Math.max(...zIndexes),200,'the header is the topmost layer');
assert.ok(html.includes('<header class="app-header">'));

// Discover panels move with the page rather than sticking below the header.
assert.doesNotMatch(css,/\.unified-directory,\s*\.unified-analysis\s*\{[^}]*position:\s*sticky/);
assert.match(app,/\.style\.setProperty\('--header-h',header\.offsetHeight\+'px'\)[^\n]*ResizeObserver\(setHeaderHeight\)\.observe\(header\)/,'the header height is measured and tracked');

// In a stacked phone header the row flex-bases must not become heights.
assert.match(media('max-width:640px'),/\.header-setup #temperament-section,\s*\.header-setup #tuning-section\s*\{\s*flex:\s*none;/);

console.log('sticky-header: ok');
