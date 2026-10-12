import {esc} from '../ui/ui.mjs';
export function renderCoordinateAssessment(analysis){
 const a=analysis?.assessment;if(!a)return '';
 const descriptions={
  'ji-liftable':'A coherent JI interpretation exists for every note pair.',
  'essentially-tempered':'Every pair is mapped, but no coherent JI chord exists within the selected target set.',
  'not-dyadic':'At least one pair has no mapped interpretation in the selected target set.',
  'unknown':'Assessment incomplete: the calculation bound was reached. This is not an ET proof.',
  'degenerate':'Repeated harmonic classes retain their sounding voices; ET requires distinct harmonic vertices.',
 };
 const labels={'ji-liftable':'Coherent JI harmony','essentially-tempered':'Essentially tempered harmony','not-dyadic':'Outside the mapped dyadic set','unknown':'Harmony assessment incomplete','degenerate':'Repeated harmonic classes'};
 const cycles=a.obstruction?.representativeCycles??[],lift=a.liftWitness?.vertices?.map(v=>v.ratio).filter(Boolean);
 return `<section class="coordinate-assessment" aria-label="Shared harmony assessment"><p><strong>${esc(labels[a.status]??a.status)}</strong> · ${esc(descriptions[a.status]??a.reason??'')}</p><p class="chord-caption">Relative to the selected JI limits and ${analysis.domains?.equivalence==='exact'?'native exact intervals':'mapped octave classes'}. Mapping and coherent harmony are assessed independently of tuning tolerance.</p>${lift?.length?`<p class="chord-caption">One coherent interpretation: ${lift.map(esc).join(' · ')}. Played registers are retained separately.</p>`:''}${cycles.length?`<details><summary>Tempering evidence</summary><p>Complete finite search found no coherent lift. Representative comma cycles: ${cycles.map(c=>esc(c.commaRatio)).join(' · ')}.</p><p class="chord-caption">${a.exploredStates} solver states · complete proof for the displayed target set.</p></details>`:''}</section>`;
}
