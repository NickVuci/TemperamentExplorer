import {weilTune} from './weil-tuning.mjs';
import {leastSquares} from './pitch.mjs';

// Built-in definitions are separate from the reusable scale/interval engine.
export const presets={
 meantone:{name:'Meantone',basis:[2,3,5],rows:[[1,1,0],[0,1,4]],g:696.6512,p:1200,commas:'81/80',source:'https://en.xen.wiki/w/Meantone_family#Meantone'},
 dreamtone:{name:'Dreamtone',basis:[2,3,5,11,13],rows:[[1,1,0,4,10],[0,1,4,-1,-11]],g:690.1826,p:1200,commas:'33/32, 55/54, 975/968',source:'https://en.xen.wiki/w/Meantone_family#Dreamtone'},
 septimal:{name:'Septimal meantone',basis:[2,3,5,7],rows:[[1,1,0,-3],[0,1,4,10]],g:696.6562,p:1200,commas:'81/80, 126/125',source:'https://en.xen.wiki/w/Meantone_family#Septimal_meantone'}
};
export function makeState(key){return {...structuredClone(presets[key]),key,n:presets[key].defaultSize||19,mode:0,tuning:presets[key].defaultTuning||'Published CWE'};}

for(const [key,name,rows,commas,source] of [
 ['porcupine','Porcupine (5-limit)',[[1,2,3],[0,-3,-5]],'250/243','https://en.xen.wiki/w/22edo#Porcupine_temperament'],
 ['magic','Magic (5-limit)',[[1,0,2],[0,5,1]],'3125/3072','https://en.xen.wiki/w/5-limit#Magic'],
 ['hanson','Hanson (5-limit)',[[1,0,1],[0,6,5]],'15625/15552','https://en.xen.wiki/w/5-limit#Kleismic']
]){const s={name,basis:[2,3,5],rows,p:1200,commas,source,defaultTuning:'Prime least squares'};s.g=leastSquares(s);presets[key]=s;}

presets.porcupine11={name:'Porcupine (11-limit)',basis:[2,3,5,7,11],rows:[[1,2,3,2,4],[0,-3,-5,6,-4]],g:162.8156,p:1200,commas:'55/54, 64/63, 100/99',generatorLabel:'tempered 11/10',defaultTuning:'Published CWE',publishedTunings:{'Published WE':{p:1198.3250,g:162.5202},'Published CWE':{p:1200,g:162.8156}},source:'https://en.xen.wiki/w/Porcupine_family#11-limit'};
export function publishedTuning(s,method){const preset=presets[s.key];if(!preset)throw Error('This custom mapping has no published tuning preset.');const value=preset.publishedTunings?.[method]||(method==='Published CWE'&&!preset.defaultTuning?{p:preset.p,g:preset.g}:null);if(!value)throw Error('No published preset is available for that method.');return {...value};}

// Curated Xen Wiki examples. Mappings preserve the documented generator,
// reduced by whole periods where necessary. Tunings are computed CWE.
for(const [key,name,basis,rows,commas,page,defaultSize] of [
 ['porcupine7','Porcupine (7-limit)',[2,3,5,7],[[1,2,3,2],[0,-3,-5,6]],'64/63, 250/243','Porcupine_family#Septimal_porcupine',15],
 ['porkypine','Porkypine (2.3.5.11)',[2,3,5,11],[[1,2,3,4],[0,-3,-5,-4]],'55/54, 100/99','Porcupine_family#2.3.5.11_subgroup_(porkypine)',15],
 ['porcupinefowl','Porcupinefowl (13-limit)',[2,3,5,7,11,13],[[1,2,3,2,4,4],[0,-3,-5,6,-4,-2]],'40/39, 55/54, 64/63, 66/65','Porcupine_family#Porcupinefowl',15],
 ['porcupinefish','Porcupinefish (13-limit)',[2,3,5,7,11,13],[[1,2,3,2,4,6],[0,-3,-5,6,-4,-17]],'55/54, 64/63, 91/90, 100/99','Porcupine_family#Porcupinefish',22],
 ['magic7','Magic (7-limit)',[2,3,5,7],[[1,0,2,-1],[0,5,1,12]],'225/224, 245/243','Magic_family#Septimal_magic',19],
 ['magic11','Magic (11-limit)',[2,3,5,7,11],[[1,0,2,-1,6],[0,5,1,12,-8]],'100/99, 225/224, 245/243','Magic_family#11-limit',19],
 ['miracle7','Miracle (7-limit)',[2,3,5,7],[[1,1,3,3],[0,6,-7,-2]],'225/224, 1029/1024','Miracle',21],
 ['miracle11','Miracle (11-limit)',[2,3,5,7,11],[[1,1,3,3,2],[0,6,-7,-2,15]],'225/224, 243/242, 385/384','Miracle',31],
 ['pajara7','Pajara (7-limit)',[2,3,5,7],[[2,3,5,6],[0,1,-2,-2]],'50/49, 64/63','Pajara',5],
 ['pajara11','Pajara (11-limit)',[2,3,5,7,11],[[2,3,5,6,8],[0,1,-2,-2,-6]],'50/49, 64/63, 99/98','Pajara',11],
 ['diaschismic','Diaschismic (5-limit)',[2,3,5],[[2,3,5],[0,1,-2]],'2048/2025','Diaschismic_family#Diaschismic',6],
 ['schismic','Schismic (5-limit)',[2,3,5],[[1,1,7],[0,1,-8]],'32805/32768','5-limit#Schismic',17],
 ['garibaldi','Garibaldi (7-limit)',[2,3,5,7],[[1,1,7,11],[0,1,-8,-14]],'32805/32768, 225/224','5-limit#Schismic',29]
]){
 const s={name,basis,rows,commas,source:'https://en.xen.wiki/w/'+page,defaultSize,defaultTuning:'Weil–Euclidean'};
 Object.assign(s,weilTune(s,true));
 presets[key]=s;
}
