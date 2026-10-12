// Composition time grid: meter beats and beat groups, straight / dotted / tuplet / swing grids,
// snapping, Euclidean patterns, and musical names for positions and lengths. Pure integer-tick
// maths over a project's meter; no DOM, audio or project edits.
//
// A grid is {division, feel, n, m, swing, snap}: `division` is the base note in ticks; the feel
// puts n notes in the time of m base notes (straight 1:1, dotted 2:3, triplet 3:2, ...). Grid
// lines restart at every bar, so a tuplet that does not fill a bar is cut at the barline.
// Tuplet positions are rounded to whole ticks (960 per quarter): exact for 3s and 5s, within
// half a tick for 7s.
import {PPQ,barTicks} from './composition-project.mjs';

export const DIVISIONS=[['1/1',PPQ*4],['1/2',PPQ*2],['1/4',PPQ],['1/8',PPQ/2],['1/16',PPQ/4],['1/32',PPQ/8],['1/64',PPQ/16]];
/** [key, label, n, m]: n notes in the time of m. Custom takes n and m from the grid. */
export const FEELS=[['straight','Straight',1,1],['dotted','Dotted',2,3],['triplet','Triplet 3:2',3,2],['quintuplet','Quintuplet 5:4',5,4],['septuplet','Septuplet 7:4',7,4],['custom','Custom n:m',null,null]];
export const TUPLET_MAX=32;
export const SWING_MIN=50,SWING_MAX=75;
export const DEFAULT_GRID=Object.freeze({division:PPQ/4,feel:'straight',n:3,m:2,swing:50,snap:true});
const LINES_MAX=4096;

const clampInt=(v,lo,hi,fallback)=>{const n=Math.round(Number(v));return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):fallback;};

/** A complete grid from partial or untrusted settings. */
export function normalizeGrid(grid={}){
  const division=DIVISIONS.some(d=>d[1]===grid.division)?grid.division:DEFAULT_GRID.division;
  const feel=FEELS.some(f=>f[0]===grid.feel)?grid.feel:'straight';
  return {division,feel,n:clampInt(grid.n,1,TUPLET_MAX,3),m:clampInt(grid.m,1,TUPLET_MAX,2),swing:clampInt(grid.swing,SWING_MIN,SWING_MAX,50),snap:grid.snap!==false};
}
/** The grid's tuplet as n notes in the time of m base notes. */
export function gridRatio(grid){
  const f=FEELS.find(x=>x[0]===grid.feel)??FEELS[0];
  return f[0]==='custom'?{n:grid.n,m:grid.m}:{n:f[2],m:f[3]};
}
/** Swing applies to straight grids only: the second of each pair of steps is delayed. */
export const swingActive=grid=>grid.swing>SWING_MIN&&gridRatio(grid).n===1&&gridRatio(grid).m===1;
/** The grid step in (possibly fractional) ticks. */
export const gridStepTicks=grid=>{const {n,m}=gridRatio(grid);return grid.division*m/n;};

export function gridLabel(grid){
  const name=DIVISIONS.find(d=>d[1]===grid.division)?.[0]??'';
  const {n,m}=gridRatio(grid);
  if(grid.feel==='straight')return swingActive(grid)?`${name} swing ${grid.swing}%`:name;
  if(grid.feel==='dotted')return `dotted ${name}`;
  if(grid.feel==='custom')return `${name} ${n}:${m}`;
  return `${name} ${FEELS.find(f=>f[0]===grid.feel)[0]}`;
}

// ---- meter: beats and beat groups ----

export const beatTicks=meter=>PPQ*4/meter.denominator;
export const validGroups=(groups,numerator)=>Array.isArray(groups)&&groups.length>0&&groups.every(g=>Number.isSafeInteger(g)&&g>=1)&&groups.reduce((a,b)=>a+b,0)===numerator;
/**
 * How the beats of a bar are grouped when the meter does not say: compound meters (6/8, 9/8,
 * 12/8 …) in threes, odd eighth meters in twos closing with a three (5/8 = 2+3, 7/8 = 2+2+3),
 * otherwise one beat per group.
 */
export function defaultGroups({numerator:n,denominator:d}){
  if(d>=8&&n>3&&n%3===0)return Array(n/3).fill(3);
  if(d>=8&&n>=5&&n%2===1)return [...Array((n-3)/2).fill(2),3];
  return Array(n).fill(1);
}
export const meterGroups=meter=>validGroups(meter.groups,meter.numerator)?[...meter.groups]:defaultGroups(meter);
/** "2+2+3" → [2,2,3]; blank → null (use the default). Throws a readable error otherwise. */
export function parseGroups(text,numerator){
  const s=String(text??'').trim();
  if(!s)return null;
  const groups=s.split(/[\s+,]+/).filter(Boolean).map(Number);
  if(!validGroups(groups,numerator))throw new Error(`Beat groups must be whole numbers adding up to ${numerator}, such as ${defaultGroups({numerator,denominator:8}).join('+')}.`);
  return groups;
}
export const groupsText=groups=>groups.join('+');
/**
 * How strongly beat `index` (0-based within the bar) is accented: 'bar', 'group' (starts a group of
 * several beats, as in 3+2+2) or 'beat'. Meters without grouping accent only the bar.
 */
export function beatAccent(meter,index){
  if(index===0)return 'bar';
  const groups=meterGroups(meter);
  if(groups.every(g=>g===1))return 'beat';
  let at=0;for(const g of groups){if(at===index)return 'group';at+=g;}
  return 'beat';
}

// ---- grid lines and snapping ----

const barCache=new Map();
/** Sorted, distinct grid lines of one bar as ticks from its start, [0, bar). */
export function barGrid(meter,grid){
  const g=normalizeGrid(grid),bar=barTicks(meter),{n,m}=gridRatio(g),swing=swingActive(g);
  const key=`${bar}|${g.division}|${n}|${m}|${swing?g.swing:50}`;
  if(barCache.has(key))return barCache.get(key);
  const span=g.division*m,lines=new Set();
  for(let start=0;start<bar&&lines.size<LINES_MAX;start+=span)for(let k=0;k<n;k++){const t=start+Math.round(k*span/n);if(t<bar)lines.add(t);}
  let out=[...lines].sort((a,b)=>a-b);
  if(swing){
    // Pairs of steps from the barline: the off-beat moves to swing% of the pair.
    out=out.map((t,i)=>i%2&&i+1<=out.length&&out[i-1]+2*g.division<=bar?out[i-1]+Math.round(2*g.division*g.swing/100):t);
  }
  if(barCache.size>64)barCache.clear();
  barCache.set(key,out);
  return out;
}
function locate(meter,grid,tick){
  const bar=barTicks(meter),lines=barGrid(meter,grid),b=Math.floor(tick/bar),local=tick-b*bar;
  let lo=0,hi=lines.length-1;
  while(lo<hi){const mid=(lo+hi+1)>>1;if(lines[mid]<=local)lo=mid;else hi=mid-1;}
  const floor=b*bar+lines[lo],next=lo+1<lines.length?b*bar+lines[lo+1]:(b+1)*bar;
  return {floor,next};
}
/**
 * The grid line for `tick`: 'nearest', 'floor' (the cell the tick is in) or 'ceil'.
 * With snapping off, the tick itself (whole ticks, never negative).
 */
export function snapTick(meter,grid,tick,mode='nearest'){
  const t=Math.max(0,tick);
  if(grid.snap===false)return Math.round(t);
  const {floor,next}=locate(meter,grid,t);
  if(mode==='floor')return floor;
  if(mode==='ceil')return t===floor?floor:next;
  return t-floor<=next-t?floor:next;
}
/** Length of the grid cell that starts at or contains `tick`. */
export function cellTicks(meter,grid,tick){const {floor,next}=locate(meter,normalizeGrid({...grid,snap:true}),Math.max(0,tick));return next-floor;}
/** The next grid line after `tick` (dir 1) or before it (dir -1); never below 0. */
export function stepLine(meter,grid,tick,dir){
  const g=normalizeGrid({...grid,snap:true});
  if(dir>0){const {floor,next}=locate(meter,g,tick);return floor>tick?floor:next;}
  if(tick<=0)return 0;
  const {floor}=locate(meter,g,tick-1);return floor;
}

/**
 * Lines to draw between `from` and `to`, each at its strongest level: bar, group (start of a beat
 * group), beat, then grid step. `shade` lists every other beat group as [start, end] for banding.
 */
export function gridLines(meter,grid,from,to){
  const bar=barTicks(meter),beat=beatTicks(meter),groups=meterGroups(meter),lines=barGrid(meter,grid);
  const starts=[];let acc=0;for(const g of groups){starts.push(acc*beat);acc+=g;}
  const out={bar:[],group:[],beat:[],step:[],shade:[]};
  for(let b=Math.floor(from/bar);b*bar<to;b++){
    const base=b*bar,levels=new Map();
    for(const t of lines)levels.set(t,'step');
    for(let k=1;k<meterBeats(meter);k++)levels.set(k*beat,'beat');
    starts.forEach((t,i)=>{if(i)levels.set(t,'group');if(i%2)out.shade.push([base+t,base+(starts[i+1]??bar)]);});
    levels.set(0,'bar');
    for(const [t,level] of levels){const x=base+t;if(x>=from&&x<=to)out[level].push(x);}
  }
  for(const k of ['bar','group','beat','step'])out[k].sort((a,b)=>a-b);
  return out;
}
const meterBeats=meter=>meter.numerator;

// ---- names ----

const NAMED=DIVISIONS.map(([name,t])=>[t,name]);
/** Musical name of a length: "1/8", "dotted 1/4", "1/8 triplet", "1/16 quintuplet"; otherwise beats. */
export function lengthName(ticks){
  for(const [t,name] of NAMED){
    if(ticks===t)return name;
    if(ticks===t*3/2)return `dotted ${name}`;
    if(Math.abs(ticks-t*2/3)<=.5)return `${name} triplet`;
    if(Math.abs(ticks-t*4/5)<=.5)return `${name} quintuplet`;
    if(Math.abs(ticks-t*4/7)<=.5)return `${name} septuplet`;
  }
  const q=ticks/PPQ;
  return Number.isInteger(q)?`${q} quarter notes`:`${ticks} ticks`;
}
const gcd=(a,b)=>{while(b){[a,b]=[b,a%b];}return a;};
/** A part of a beat as a small fraction ("1/3", "2/5"), or as ticks when it is not one. */
export function beatFraction(offset,beat){
  if(!offset)return '';
  const d=gcd(offset,beat),num=offset/d,den=beat/d;
  return den<=64?`${num}/${den}`:`${offset} ticks`;
}
/** Bar.beat with any remainder as a fraction of the beat: "3.2", "3.2 + 1/3". */
export function formatBeat(meter,tick){
  const bar=barTicks(meter),beat=beatTicks(meter),b=Math.floor(tick/bar),r=tick-b*bar,k=Math.floor(r/beat),off=r-k*beat;
  return `${b+1}.${k+1}${off?` + ${beatFraction(off,beat)}`:''}`;
}

// ---- Euclidean rhythms ----

/**
 * k pulses spread as evenly as possible over n steps, rotated left by `rotation`.
 * E(3,8) = x..x..x. ; E(5,8) = x.x.xx.x (a rotation of Bjorklund's pattern).
 */
export function euclid(k,n,rotation=0){
  n=Math.max(1,Math.round(n));k=Math.max(0,Math.min(n,Math.round(k)));
  const r=((Math.round(rotation)%n)+n)%n;
  return Array.from({length:n},(_,i)=>((((i+r)%n)*k)%n)<k);
}
