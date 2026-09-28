/** @typedef {import('./layout-types.mjs').LayoutRecommendation} LayoutRecommendation */
import {generateLayoutCandidates,layoutKey} from './layout-candidates.mjs';
import {evaluateLayout} from './layout-evaluation.mjs';
import {layoutScore} from './layout-profiles.mjs';
export function rankLayouts(evaluated,hasTargets=true){return evaluated.map(candidate=>({...candidate,score:layoutScore(candidate.metrics,hasTargets)})).sort((a,b)=>b.score-a.score||b.scale.scaleCoverage-a.scale.scaleCoverage||layoutKey(a.config).localeCompare(layoutKey(b.config),'en'));}
export function recommendLayouts(s,cfg,targets=[]){return rankLayouts(generateLayoutCandidates(s,cfg).map(c=>evaluateLayout(s,c,targets)),targets.length>0);}
