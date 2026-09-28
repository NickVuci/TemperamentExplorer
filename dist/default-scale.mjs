import {findScaleMilestones} from './scale-milestones.mjs';

// Defaults are projections of the same analysis used by menus and HexBoard.
export function defaultDiamondScale(s,options={}){
 const chosen=findScaleMilestones(s,options).diamond;
 return chosen?{n:chosen.n,mode:chosen.mode}:null;
}
export function withDefaultDiamondScale(s,notify=()=>{},options={}){
 const chosen=defaultDiamondScale(s,options);
 if(chosen)return {...s,...chosen};
 notify('No collision-free diamond-complete mode within 256 notes. Kept the existing scale.');
 return s;
}
