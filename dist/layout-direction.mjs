// Directed runs of consecutive *scale degrees*, with the actual ascending pitch
// step, not a fixed generator or a 12-EDO semitone. All distances use the physical grid.
export const axisVectors=[[1,0],[0,1],[1,-1],[-1,0],[0,-1],[-1,1]];
export function screenDirection([q,r],orientation=0){const dx=q+r/2,dy=-r*Math.sqrt(3)/2,a=orientation*Math.PI/2,x=dx*Math.cos(a)-dy*Math.sin(a),y=dx*Math.sin(a)+dy*Math.cos(a);return Math.abs(y)<1e-6?(x>0?'right':'left'):Math.abs(x)<1e-6?(y<0?'up':'down'):`${y<0?'up':'down'}-${x>0?'right':'left'}`;}
export function chromaticDirection(s,board,orientation=0){
 const keys=board.keys.filter(k=>k.enabled&&k.degree>=0),at=new Map(keys.map(k=>[`${k.x},${k.y}`,k]));
 let best={score:0,axis:'none',vector:null,run:0,fromZero:0,transitions:0,consistency:0,complete:false};
 for(const v of axisVectors){const dx=2*v[0]+v[1],dy=-v[1],next=new Map(),incoming=new Set(),degrees=new Set();let edges=0;
  for(const a of keys){const b=at.get(`${a.x+dx},${a.y+dy}`);if(!b)continue;edges++;if(b.degree===(a.degree+1)%s.n&&Math.abs(b.c-a.c-board.target.steps[a.degree])<1e-6){next.set(a,b);incoming.add(b);degrees.add(a.degree);}}
  let run=0,fromZero=0;for(const start of keys){if(incoming.has(start)&&start.degree!==0)continue;let k=start,count=1;while(next.has(k)){k=next.get(k);count++;}run=Math.max(run,count);if(start.degree===0)fromZero=Math.max(fromZero,count);}
  const consistency=edges?next.size/edges:0,score=run>=Math.min(3,s.n)?(.55*consistency+.25*degrees.size/s.n+.20*Math.min(1,(run-1)/Math.min(s.n,9))):0;
  if(score>best.score)best={score,axis:screenDirection(v,orientation),vector:v,run,fromZero,transitions:degrees.size,consistency,complete:degrees.size===s.n&&consistency>1-1e-9};
 }
 return best;
}
export function melodicBaseScore(base){const hardness=base?.small>0?base.large/base.small:null,inRange=base?.n>=5&&base.n<=9;
 // Basic is L:s = 2:1 (TAMNAMS); this smooth preference is a product heuristic.
 // https://en.xen.wiki/w/Step_ratio
 const nearBasic=hardness>1?1/(1+(Math.log2(hardness/2)/.5)**2):0;
 return {hardness,inRange,nearBasic,score:hardness>1?(inRange?1:.2)*nearBasic:0};
}
