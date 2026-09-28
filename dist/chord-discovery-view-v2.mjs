import {esc,option} from './ui.mjs';
import {formatPrimeFilter,MANUAL_PRIME_LIMIT_VALUES,ODD_LIMIT_VALUES} from './ji-limit-engine.mjs';
export const v2Select=(name,label,values,value)=>`<label>${label}<select data-catalogue-field="v2-${name}">${values.map(([v,l])=>option(v,l,value)).join('')}</select></label>`;
export function renderDiscoveryOptions(m){const c=m.filters;return `<details class="chord-v2-filters"><summary>Advanced search options</summary><div class="chord-v2-filter-grid">
 ${v2Select('minTones','Minimum tones',[2,3,4,5,6,7,8].map(n=>[n,n]),c.minTones)}${v2Select('maxTones','Maximum tones',[2,3,4,5,6,7,8].map(n=>[n,n]),c.maxTones)}
 ${v2Select('form','Family',[['both','Both'],['otonal','Otonal'],['utonal','Utonal']],c.form)}
 ${v2Select('occurrence','Scale membership',[['complete','Complete occurrences'],['any','Any mapped chord']],c.occurrence)}
 ${v2Select('collisions','Cardinality',[['preserved','Preserved only'],['allow','Include collapsed']],c.collisions)}
 ${v2Select('oddLimit','JI odd limit',ODD_LIMIT_VALUES.map(n=>[n,`${n}-odd-limit`]),c.oddLimit)}
 ${v2Select('primeLimit','JI prime limit (optional)',[['basis',`${formatPrimeFilter(m.primeBasisFilter??c.primeLimit??3)} · Temperament basis`],['','No prime limit'],...MANUAL_PRIME_LIMIT_VALUES.map(n=>[n,`${n}-prime-limit`])],m.primeLimitSelection==='basis'?'basis':c.primeLimit??'')}
 <label>Maximum generator span<input data-catalogue-field="v2-maxSpan" type="number" min="0" max="10000" value="${c.maxSpan}"></label>
 ${v2Select('sort','Sort',[['accuracy','Accuracy'],['roots','Root count'],['span','Generator span'],['name','Ratio name']],c.sort)}
 <label>Contains JI chord<input data-catalogue-field="v2-contains" maxlength="300" placeholder="4:5:6" value="${esc(c.contains)}"></label></div><button data-catalogue-action="v2-reset">Reset filters</button><p class="catalogue-help">Finite catalogue: curated chords and harmonic segments starting at 2–16, up to 8 tones (largest harmonic 23), plus reciprocals and curated 31/97 targets. At most 256 distinct identities. Every pair ratio must satisfy the odd limit and, when set, the prime limit. Aliases share a period-class shape; they retain their own cardinality and tuning scores.</p></details>`;}
export function renderDiscovery(m){
 const d=m.discovery,pairs=new Map(),seen=new Set(),query=(m.query||'').trim().toLowerCase().replace(/\s*:\s*/g,':');
 // Aliases remain selectable chord types; their diagnostics live below the main flow.
 for(const group of d.rows)for(const row of [group,...group.aliases]){if(seen.has(row.id))continue;seen.add(row.id);if(!pairs.has(row.pairId))pairs.set(row.pairId,[]);pairs.get(row.pairId).push(row);}
 const all=[...pairs.values()].filter(rows=>!query||rows.some(row=>[row.label,row.form,row.text].some(x=>x.toLowerCase().includes(query))||row.id===m.queryAnalysis?.identity.fingerprint));
 const page=Math.min(m.page,Math.max(0,Math.ceil(all.length/12)-1)),list=all.slice(page*12,(page+1)*12);
 const button=(text,label,form,id,count)=>`<button class="catalogue-group ${id===m.analysis?.identity.fingerprint?'selected':''}" data-catalogue-action="v2-chord" data-id="${esc(text)}" aria-pressed="${id===m.analysis?.identity.fingerprint}"><span>${form?`<small>${form==='self'?'Self-dual':form==='otonal'?'Otonal':'Utonal'}</small>`:''}<b>${esc(label)}</b></span><span><small>${count} ${count===1?'root':'roots'}</small></span></button>`;
 const direct=m.queryAnalysis&&!all.some(rows=>rows.some(r=>r.id===m.queryAnalysis.identity.fingerprint))?button(m.query,m.query,'',m.queryAnalysis.identity.fingerprint,m.queryAnalysis.occurrences.completeOccurrences.length):'';
 return `<section class="chord-v2-types" aria-label="Chord types"><h4>Chord types</h4>
 ${d.status==='loading'?`<p role="status" class="catalogue-help">Searching ${d.done}/${d.total}…</p>`:d.status==='error'?`<p role="alert">${esc(d.message)}</p>`:''}
 ${m.queryError?`<p role="alert">${esc(m.queryError)}</p>`:''}
 <div class="catalogue-list chord-v2-discovery-list">${direct}${list.map(rows=>`<div class="catalogue-pair">${rows.sort((a,b)=>a.form==='otonal'?-1:b.form==='otonal'?1:0).map(row=>button(row.text,row.label,row.form,row.id,row.analysis.occurrences.completeCount)).join('')}</div>`).join('')}</div>
 ${!all.length&&!direct&&d.status==='ready'?'<p class="catalogue-help">No matching chord types. Try a ratio list or adjust Advanced search options below.</p>':''}
 ${all.length>12?`<div class="catalogue-pages"><button data-catalogue-action="v2-page" data-id="${page-1}" ${page===0?'disabled':''}>Previous</button><span>${page+1} / ${Math.ceil(all.length/12)}</span><button data-catalogue-action="v2-page" data-id="${page+1}" ${(page+1)*12>=all.length?'disabled':''}>Next</button></div>`:''}
 </section>`;
}
