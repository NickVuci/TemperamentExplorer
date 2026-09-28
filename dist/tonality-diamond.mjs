import {diamondLayout} from './diamond-layout.mjs';
import {mapRatio} from './engine.mjs';
import {diamondTargets,formatPrimeFilter} from './ji-limit-engine.mjs';
import {bestApproximations,bestModeApproximations} from './assignments.mjs';
import {esc} from './ui.mjs';
import {errorColor} from './ji-error-color.mjs';
export {errorColor};
export function diamondRatios(limit,primeLimit=null){return diamondTargets(limit,primeLimit);}
export function normalizeDiamondScope(scope,workflowVersion=0){
 if(scope==='mapping'||scope==='mode')return scope;
 if(scope==='scale')return Number.isFinite(Number(workflowVersion))&&Number(workflowVersion)>=4?'scale':'mode';
 return 'mapping';
}
export function diamondApproximation(s,t,cfg){
 const mappedCoordinate=mapRatio(t.n,t.d,s),mapped=mappedCoordinate?{m:mappedCoordinate,c:mappedCoordinate[0]*s.p+mappedCoordinate[1]*s.g,error:mappedCoordinate[0]*s.p+mappedCoordinate[1]*s.g-t.c,mapped:true,available:false}:null;
 const result=cfg.scope==='mode'?bestModeApproximations(s,t):bestApproximations(s,t),best=result.best;
 if(cfg.scope==='scale'){
  const represented=best.find(v=>v.mapped)||(result.secondary?.mapped&&result.secondary.available?result.secondary:null),alternative=best.find(v=>!v.mapped)||null;
  const approximation=cfg.filter==='mapped'?represented:cfg.filter==='hits'?alternative:represented||best[0]||null;
  return {approximation,shown:!!approximation,mappedCoordinate,result,source:'scale'};
 }
 if(cfg.scope==='mode'){
  const choices=cfg.filter==='mapped'?best.filter(v=>v.mapped):cfg.filter==='hits'?best.filter(v=>!v.mapped):best;
  const approximation=choices[0]||null;return {approximation,shown:!!approximation,mappedCoordinate,result,source:'mode'};
 }
 const within=!!mapped&&Math.abs(mapped.error)<=cfg.tol+1e-8;
 if(cfg.filter!=='hits'&&mapped&&(within||cfg.outside))return {approximation:mapped,shown:true,mappedCoordinate,result,source:'mapping'};
 if(cfg.filter!=='mapped'){const approximation=best.find(v=>!v.mapped)||null;return {approximation,shown:!!approximation,mappedCoordinate,result,source:'mapping'};}
 return {approximation:null,shown:false,mappedCoordinate,result,source:'mapping'};
}
const maximumErrorCache=new Map();
export function maximumDiamondError(s,cfg){
 const key=JSON.stringify([s.basis,s.rows,s.p,s.g,s.n,s.mode,s.matrixOctave===true,cfg.limit,cfg.primeLimit??null,cfg.scope,cfg.filter,cfg.diamondLayout??null]);
 if(maximumErrorCache.has(key))return maximumErrorCache.get(key);
 let maximum=0;
 for(const t of (cfg.diamondLayout?.harmonics?diamondLayout(cfg,cfg.diamondLayout).cells:diamondRatios(cfg.limit,cfg.primeLimit??null))){
  let approximation=null;
  if(cfg.scope==='mapping'){
   const mappedCoordinate=mapRatio(t.n,t.d,s);
   if(cfg.filter!=='hits'&&mappedCoordinate){const error=mappedCoordinate[0]*s.p+mappedCoordinate[1]*s.g-t.c;maximum=Math.max(maximum,Math.abs(error));continue;}
   if(cfg.filter!=='mapped')approximation=bestApproximations(s,t).best.find(v=>!v.mapped)||null;
  }else if(cfg.scope==='mode'){
   const best=bestModeApproximations(s,t).best;
   approximation=(cfg.filter==='mapped'?best.filter(v=>v.mapped):cfg.filter==='hits'?best.filter(v=>!v.mapped):best)[0]||null;
  }else{
   const result=bestApproximations(s,t),represented=result.best.find(v=>v.mapped)||(result.secondary?.mapped&&result.secondary.available?result.secondary:null),alternative=result.best.find(v=>!v.mapped)||null;
   approximation=cfg.filter==='mapped'?represented:cfg.filter==='hits'?alternative:represented||alternative;
  }
  if(approximation)maximum=Math.max(maximum,Math.abs(approximation.error));
 }
 if(maximumErrorCache.size>32)maximumErrorCache.clear();
 maximumErrorCache.set(key,maximum);
 return maximum;
}
export function renderDiamondTolerance(cfg){
 return `<div class="diamond-tolerance-control"><span>Maximum error (cents)</span><div class="diamond-tolerance-entry"><input type="number" min="0" max="100" step="0.001" value="${Number(cfg.tol).toFixed(3)}" data-diamond-tolerance aria-label="Maximum error in cents"><button type="button" class="quiet diamond-auto-tolerance" data-diamond-tolerance-reset aria-label="Use automatic tolerance" ${cfg.toleranceAutomatic?'disabled':''}>Auto</button></div></div>`;
}
export function renderDiamond(s,idx,cfg,chosen='1/1',header=''){
 const geometry=cfg.geometry??diamondLayout(cfg,cfg.diamondLayout),{count,h,w,pad}=geometry;
 const cellW=w,cellH=h;
 const width=count*w*2+pad*2,height=count*h*2+pad*2;
 const cells=geometry.cells.map(t=>{
  const status=t.status??diamondApproximation(s,t,cfg),v=status.approximation,shown=status.shown,mapped=!!v?.mapped;
  const x=pad+(t.i+t.j+1)*w,y=pad+(count+t.j-t.i)*h;
  const fill=shown&&v?errorColor(v.error,cfg.maxError??cfg.tol):'#202835',ink=shown&&v?'#11151c':'#eef2f7';
  const description=v?`${mapped?'mapped':'best available'}, ${v.error.toFixed(3)} cents error`:status.mappedCoordinate?'hidden by display filter':'outside temperament basis';
  return `<g class="diamond-cell ${cfg.selectedIds?.includes(t.id)?'selected':''}" role="button" tabindex="0" data-diamond="${idx},${t.n},${t.d}" data-diamond-key="${t.id}" aria-pressed="${!!cfg.selectedIds?.includes(t.id)}" aria-disabled="${!v}" aria-label="${t.label}, ${description}" style="--diamond-fill:${fill};--diamond-ink:${ink}" ><title>${esc(t.label)} · ${esc(description)}</title><path d="M${x} ${y-cellH}L${x+cellW} ${y}L${x} ${y+cellH}L${x-cellW} ${y}Z"/><path class="diamond-divider" d="M${x-cellW} ${y}H${x+cellW}"/><text x="${x}" y="${y-cellH*.38}">${t.n}</text><text x="${x}" y="${y+cellH*.5}">${t.d}</text></g>`;
 }).join('');
 const primeLabel=cfg.primeLimit==null?'':` · ${formatPrimeFilter(cfg.primeLimit)}`;
 return `<section class="diamond-panel"><div class="diamond-canvas"><div class="diamond-canvas-tools"><div id="diamond-detail-${idx}" class="diamond-detail" aria-live="polite" hidden><div data-diamond-cell-detail></div><div class="diamond-chord-readout" data-diamond-chord aria-live="polite" hidden></div></div>${cfg.canvasControls??''}</div><div class="diamond-scroll">${header}<svg class="tonality-diamond" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" style="--diamond-min-width:${Math.max(280,count*94)}px;${count<=10?'max-height:max(420px,72vh)':''}" role="group" aria-label="${geometry.custom?`Custom harmonics ${geometry.harmonics.join(':')}`:`${cfg.limit}-odd-limit${primeLabel}`} tonality diamond">${cells}</svg>${cfg.toolbar??''}</div></div></section>`;
}
