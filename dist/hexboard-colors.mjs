import {mosSizes} from './engine.mjs';

export const palettes={
 spectrum:{name:'Spectrum',colors:['#e6dfcb','#5686df','#d879a0','#65bd9c','#dfb44f','#ac8bd4','#df8651']},
 ocean:{name:'Ocean',colors:['#e3f4ed','#9ddacb','#55b5ba','#26859e','#246182','#434b83','#785490']},
 ember:{name:'Ember',colors:['#fff0c5','#ebc66d','#e49b50','#d16b4e','#ad4a63','#853f72','#5e426d']}
};
export const validColor=c=>typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c);
export function mosLayers(s,cfg,board){
 const notes=board.target.notes,targetStart=Math.min(...notes.map(t=>t.k)),targetEnd=targetStart+notes.length;
 const sizes=[...new Set([cfg.base,...mosSizes(s).filter(v=>v.n>cfg.base&&v.n<=s.n).map(v=>v.n),s.n])].sort((a,b)=>a-b);
 const palette=palettes[cfg.palette]||palettes.spectrum;
 let start=Math.min(...board.baseNotes.map(t=>t.k)),previousSize=0;
 const layers=sizes.map((n,i)=>{
  if(i){
   // Each larger generator window contains the previous window and stays in the target.
   const lower=Math.max(targetStart,start+previousSize-n),upper=Math.min(start,targetEnd-n);
   start=cfg.layerGrowth==='lower'?lower:cfg.layerGrowth==='higher'?upper:Math.max(lower,Math.min(upper,start-Math.floor((n-previousSize)/2)));
  }
  const custom=cfg.layerColors?.[n],color=validColor(custom)?custom:palette.colors[i%palette.colors.length];
  const layer={n,start,end:start+n,added:n-previousSize,color};previousSize=n;return layer;
 });
 const degreeLayers=notes.map(t=>layers.findIndex(l=>t.k>=l.start&&t.k<l.end));
 return {layers,degreeLayers,keyColors:cfg.keyColors||{},degreeColors:cfg.degreeColors||{}};
}
export function keyColor(key,colors){
 const keyOverride=colors.keyColors?.[key.index];if(validColor(keyOverride))return keyOverride;
 const degreeOverride=colors.degreeColors?.[key.degree];if(key.inMOS&&validColor(degreeOverride))return degreeOverride;
 return key.inMOS?colors.layers[colors.degreeLayers[key.degree]].color:key.enabled?'#414957':'#1b2532';
}
export function textColor(hex){
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#000000':'#ffffff';
}
export function hexToHSV(hex){
 const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
 let h=0;if(d)h=60*(max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4);
 return {hueTenthDegrees:Math.round(h*10)%3600,saturation:Math.round(max?d/max*255:0),value:Math.round(max*255)};
}
