import {purePeriod,mapRatio,targets} from './engine.mjs';
import {weilTune,optimize,tuneTargets,pureTune,supportingEdos,edoTune} from './tuning.mjs';
import {target,assignment} from './assignments.mjs';
import {candidates} from './approximation-compat.mjs';
import {validateState} from './state.mjs';
export const tuningMethods=['Weil–Euclidean','Minimax','Least Squares','EDO','JI Target'];
export function tuningMethod(s){const method=s.tuning==='Manual'?s.tuneConfig?.method:s.tuning;return tuningMethods.includes(method)?method:/WE|CWE/.test(method||'')?'Weil–Euclidean':method==='Least squares'?'Least Squares':['Prime least squares','Prime Least Squares'].includes(method)?'Least Squares':method==='Pure intervals'||method==='Quarter comma'?'JI Target':/^EDO/.test(method||'')?'EDO':'Weil–Euclidean';}
export function tuningConfig(s){const legacyPrime=['Prime least squares','Prime Least Squares'].includes(s.tuning==='Manual'?s.tuneConfig?.method:s.tuning);return {fixed:true,period:purePeriod(s),targets:'primes',custom:'3/2, 5/4, 6/5',edoMax:'500',edoVariants:false,n:s.tuning.match(/^EDO (\d+)/)?.[1]||'31',k:'',h:'',pure:'5/4',jiAll:false,...s.tuneConfig,...(legacyPrime?{targets:'primes'}:{}),method:tuningMethod(s)};}
export function jiSelection(s,cfg=tuningConfig(s)){
 const ratio=s.explore?.ratio||cfg.pure?.split(/[\s,;]+/).filter(Boolean)[0]||'5/4',t=target(ratio),cs=candidates(s,t);
 const m=s.explore?.m||mapRatio(t.n,t.d,s)||cs.find(v=>v.m[1]&&((t.c-v.m[0]*s.p)/v.m[1])>0&&((t.c-v.m[0]*s.p)/v.m[1])<s.p)?.m||cs[0].m;
 return assignment(t,m);
}
export function applyTuningMethod(s,input={}){
 const cfg={...tuningConfig(s),...input};let result,report,explore=s.explore;
 if(!tuningMethods.includes(cfg.method))throw Error('Choose a tuning method.');
 const period=purePeriod(s);cfg.period=period;
 const working={...s,p:cfg.fixed?period:s.p};
 if(cfg.method==='Weil–Euclidean'){result=weilTune(working,cfg.fixed,period);report=cfg.fixed?'Weil–Euclidean with fixed period.':'Weil–Euclidean: period and generator optimized.';}
 else if(cfg.method==='EDO'){
  const choices=supportingEdos(s,Number(cfg.edoMax),cfg.edoVariants),chosen=choices.find(v=>v.n===Number(cfg.n)&&(!cfg.k||v.k===Number(cfg.k))&&(!cfg.h||v.periodSteps===Number(cfg.h)))||choices.find(v=>v.n>=12)||choices[0];
  if(!chosen)throw Error('No supporting EDO found. Increase the search range or include nearby vals.');
  Object.assign(cfg,{n:String(chosen.n),k:String(chosen.k),h:String(chosen.periodSteps)});result=edoTune(s,chosen.n,String(chosen.k),chosen.periodSteps);report=`${chosen.n}edo · ${chosen.k} generator steps · ${chosen.periodSteps} period steps. Pure octave.`;
 }else if(cfg.method==='JI Target'){
  const selected=jiSelection(working,cfg),list=cfg.jiAll?s.assignments:[selected];if(!list?.length)throw Error('Add JI assignments before tuning all targets.');
  result=pureTune(working,list,cfg.fixed);explore={...s.explore,ratio:selected.label,m:[...selected.m],open:true,notice:''};cfg.pure=selected.label;
  report=`${list.map(t=>t.label).join(', ')} pure. ${cfg.fixed?'Period fixed.':'Period optimized; WE selects among underdetermined pure tunings.'} Mapping retained.`;
 }else{const ts=tuneTargets(working,cfg.targets,cfg.custom);result=optimize(working,ts,cfg.method==='Minimax'?'minimax':'ls',cfg.fixed);report=`${cfg.method} · ${ts.length} targets · max error ${result.max.toFixed(4)}¢ · RMS ${result.rms.toFixed(4)}¢. ${cfg.fixed?'Period fixed.':'Period optimized.'}`;}
 // A state that never explored a target must not gain an explicit `explore: undefined`: harmonic job requests serialize the whole state and reject undefined values.
 return validateState({...s,p:result.p,g:result.g,tuning:cfg.method,tuneConfig:cfg,...(explore===undefined?{}:{explore}),tuningReport:report});
}
