import {v2Select} from './chord-discovery-view-v2.mjs';
import {esc} from './ui.mjs';
export function renderRealization(m){
 if(!m.selected)return '';if(m.placementError)return `<p role="alert">${esc(m.placementError)} The exact scale occurrence is retained.</p>`;
 const v=m.realization;if(!v)return '';const r=m.realizationOptions,f=m.placements[m.fingering];
 return `<section class="chord-v2-realization" aria-label="Voicing and HexBoard placement"><div class="chord-v2-filter-grid">
 ${v2Select('inversion','Inversion',v.variants.map(x=>[x.id,x.label]),v.inversion)}
</div>
 ${v.collapsedMembers?`<p>${v.collapsedMembers} collapsed member(s) share a voice.</p>`:''}
 ${f?`<div class="catalogue-fingerings"><button data-catalogue-action="v2-prev" aria-label="Previous fingering" ${m.fingering===0?'disabled':''}>←</button><span>Fingering ${m.fingering+1}/${m.placements.length}</span><button data-catalogue-action="v2-next" aria-label="Next fingering" ${m.fingering+1>=m.placements.length?'disabled':''}>→</button></div>`:'<p class="catalogue-help">This exact chord occurs in the scale, but no fingering fits the current board and register/reach limits. Try another inversion or layout.</p>'}
 ${!v.withinRegisterRange&&!f?'<p class="catalogue-help">The requested voicing is outside the selected register range.</p>':''}
 ${m.placementLimited?'<p role="status">Placement search reached its 20,000-fingering cap; these are partial physical results.</p>':''}<div class="catalogue-actions"><button class="primary" data-catalogue-action="v2-play" ${!f&&!v.withinRegisterRange?'disabled':''}>${f?'Hear fingering':'Hear voicing'}</button><button data-catalogue-action="v2-collect" ${v.degrees.length<2?'disabled':''}>Add to collection</button><button data-catalogue-action="v2-clear">Clear</button></div>
</section>`;
}

export function renderRealizationOptions(m){
 const v=m.realization;if(!v)return '';const r=m.realizationOptions;
 return `<details class="chord-v2-voicing-options"><summary>Voicing & placement options</summary><div class="chord-v2-filter-grid">${v2Select('style','Spacing',[['compact','Compact'],['original','Harmonic spelling'],['open','Open']],r.style)} ${v2Select('order','Voice order',[['pitch','Ascending pitch'],['input','Input order']],r.order)}
 <label>Period shift<input type="number" min="-8" max="8" data-catalogue-field="v2-periodShift" value="${r.periodShift}"></label>
 <label>Minimum register<input type="number" min="-8" max="8" data-catalogue-field="v2-registerMin" value="${r.registerMin}"></label>
 <label>Maximum register<input type="number" min="-8" max="8" data-catalogue-field="v2-registerMax" value="${r.registerMax}"></label>
 ${v2Select('reach','Maximum reach',[[0,'Unrestricted'],[4,'4 hex steps'],[6,'6 hex steps'],[8,'8 hex steps'],[12,'12 hex steps']],r.reach)}</div></details>`;
}
export function renderRealizationDetails(m){
 const v=m.realization;if(!v)return '';const f=m.placements[m.fingering];
 return ` <details class="chord-v2-voice-details"><summary>Sounding notes</summary><p>Degrees ${v.degrees.join(' · ')} · cents ${(f?.pitches||v.pitches).map(x=>x.toFixed(3)).join(' · ')}</p><p>Period shifts use this temperament’s ${m.periodCents.toFixed(3)}¢ period. Alternate period copies preserve the occurrence.</p></details>${f?`<p>Reach ${f.reach} · displacement ${f.periodShift} periods · ${m.placements.length} fingerings</p>`:''}<button data-catalogue-action="v2-inspect" ${v.degrees.length<2?'disabled':''}>Inspect chord</button>`;
}
