// Discover → Unified: one screen combining the harmony directory (left), the tonality diamond
// or interval matrix (centre), the selected harmony's analysis (right) and the scale (bottom).
// Markup only. Each part is rendered by its existing owner and keeps its own events, so this
// layout adds no state beyond which centre view is shown.

export const UNIFIED_CENTERS=['diamond','matrix'];
export const normalizeUnifiedCenter=value=>UNIFIED_CENTERS.includes(value)?value:'diamond';

/** The single-view name whose controls and behaviour the centre pane borrows. */
export const unifiedCenterView=center=>normalizeUnifiedCenter(center)==='matrix'?'matrices':'targets';

export function unifiedCenterToggle(center){
  const current=normalizeUnifiedCenter(center);
  const option=(value,label)=>`<button type="button" data-unified-center="${value}" aria-pressed="${value===current}" class="${value===current?'active':''}">${label}</button>`;
  return `<div class="tabs unified-center-toggle" role="group" aria-label="Centre view">${option('diamond','Tonality Diamond')}${option('matrix','Interval Matrix')}</div>`;
}

/** Directory and detail markup come from the harmony catalogue's renderParts(). */
export const unifiedDirectory=parts=>`${parts.controls}<div class="unified-directory-list">${parts.list}</div>${parts.info}`;
export const unifiedDetail=parts=>parts.detail;

// The scale controls live in the scale pane here instead of the shared setup bar.
export function renderUnified({center,centerMarkup,directory,detail,scaleControls,scaleMarkup}){
  return `<div class="unified-workspace" data-unified-center-view="${normalizeUnifiedCenter(center)}">
<div class="unified-main">
<section class="unified-pane unified-directory harmony-workspace" aria-label="Harmony directory"><h3 class="unified-pane-title">Harmony directory</h3><div data-unified-pane="directory">${directory}</div></section>
<section class="unified-pane unified-center" aria-label="Harmonic space"><div class="unified-center-head"><h3 class="unified-pane-title">Harmonic space</h3>${unifiedCenterToggle(center)}</div>${centerMarkup}</section>
<section class="unified-pane unified-analysis harmony-workspace" aria-label="Chord analysis"><h3 class="unified-pane-title">Chord analysis</h3><article class="harmony-detail" data-unified-pane="detail" aria-label="Selected harmony">${detail}</article></section>
</div>
<section class="unified-pane unified-scale" aria-label="Scale"><h3 class="unified-pane-title">Scale</h3><div class="discover-scale unified-scale-controls" aria-label="Scale and mode">${scaleControls}</div>${scaleMarkup}</section>
</div>`;
}

// Measure the centre's natural height without letting long side content grow its row.
let observedCenter=null,panelSizeObserver=null;
export function syncUnifiedPanelHeights(doc=globalThis.document,Observer=globalThis.ResizeObserver){
 const center=doc?.querySelector('.unified-center');
 if(center===observedCenter)return;
 panelSizeObserver?.disconnect();panelSizeObserver=null;observedCenter=center??null;
 if(!center)return;
 const wrapper=center.closest('.unified-workspace');
 const update=()=>{const height=center.getBoundingClientRect().height;if(height>0)wrapper.style.setProperty('--unified-center-height',height+'px');};
 update();
 if(typeof Observer==='function'){panelSizeObserver=new Observer(update);panelSizeObserver.observe(center);}
}
