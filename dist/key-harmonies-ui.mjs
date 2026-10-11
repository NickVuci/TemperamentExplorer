// Note → chords, in Play's Chords panel: for the key selected on the Play board, the chord directory's chords that can
// be built on it with the key as the bass (root position or a named inversion), each with its places on
// this layout, then other shapes the layout offers with the key lowest. Choosing one lights it on the
// screen and on a connected HexBoard and opens it in the directory's analysis. The search and the
// lighting come from the Play board (hexboard-ui harmoniesAt / showHarmony); this module is only the panel.
import {esc,option} from './ui.mjs';

const ROW_LIMIT=24;
const REACHES=[3,4,5,6,7,8,9,10],SIZES=[3,4,5,6];

export function createKeyHarmoniesUi({
  // isShown: the Note → chords tab is open. The selected key still follows into the bass while Play shows.
  host,api,getFingerings,isPlayView,isShown=()=>true,
  timer={set:(fn,ms)=>setInterval(fn,ms),clear:id=>clearInterval(id)},
}){
  const ui={size:3,reach:6,all:false,active:null};  // active: {index, placement}
  let lastSignature='',timerId=null;

  let lastKey=null;

  /** Which harmony and placement the board is showing, if it is one of this key's harmonies. */
  function activeNow(result){
    if(!ui.active||!result)return null;
    const h=result.harmonies[ui.active.index],f=getFingerings();
    if(!h||!f||f.label!==h.label||f.placements.length!==h.placements.length)return null;
    return {index:ui.active.index,placement:Math.max(0,Math.min(f.index,h.placements.length-1))};
  }

  function markup(result,active){
    const key=result.key;
    if(!key)return `<h3>Chords on a key</h3><p class="viewnote">Select an enabled key on the board to see the chords that can be built on it, with that key as the bass.</p>`;
    const title=`Chords on key ${key.index}`;
    const summary=`${result.count} chord${result.count===1?'':'s'} with this key as the bass, within reach ${result.reach}`;
    const head=`<h3>${esc(title)}</h3><p class="harmony-summary">${esc(summary)} · degree ${key.degree>=0?key.degree:'—'} · ${key.cents.toFixed(1)} ¢ above the tonic</p>`;
    if(result.error)return `${head}<p role="alert">${esc(result.error)}</p>`;
    const controls=`<div class="panelactions"><label>Notes <select data-kh-size>${SIZES.map(n=>option(n,String(n),ui.size)).join('')}</select></label>
      <label>Reach <select data-kh-reach>${REACHES.map(n=>option(n,String(n),ui.reach)).join('')}</select></label></div>`;
    const limits=`<p class="viewnote">Directory chords follow the directory's size and type filters and are voiced close above this key. “More on this layout” lists other 3- and 4-note shapes with this key lowest that the board's chord search accepts at odd limit ${esc(result.settings.limit)} and ${+Number(result.settings.tolerance).toFixed(1)}¢ tolerance. A larger reach finds wider fingerings.</p>`;
    const loading=result.loading?'<p class="viewnote" role="status">Listing the chord directory…</p>':'';
    if(!result.count)return `${head}${controls}${loading}<p>No ${result.size}-note chord with this key as the bass fits within reach ${result.reach} on this layout. Try a larger reach.</p>${limits}`;
    const shown=ui.all?result.harmonies:result.harmonies.slice(0,ROW_LIMIT);
    const firstLayout=shown.findIndex(h=>h.source==='layout');
    const rows=shown.map((h,i)=>{
      const on=active?.index===i,heading=i===firstLayout?'<li class="harmony-list-heading">More on this layout</li>':'';
      const quality=h.source==='layout'?` · worst error ${h.max.toFixed(1)} ¢ · ${h.mapped}/${h.total} mapped`:'';
      return `${heading}<li><button class="harmony-row" data-kh="pick" data-i="${i}" aria-pressed="${on}"><b>${esc(h.label)}</b>
        <span>${esc(h.role)} · ${h.placements.length} place${h.placements.length===1?'':'s'} · reach ${h.reach}${quality}</span></button>${
        on?`<div class="panelactions harmony-nav"><span>Place ${active.placement+1} of ${h.placements.length} · keys ${esc(h.placements[active.placement].keys.join(', '))}</span>
          <button data-kh="prev" ${h.placements.length>1?'':'disabled'}>← Previous</button><button data-kh="next" ${h.placements.length>1?'':'disabled'}>Next →</button><button data-kh="hear">▶ Hear</button></div>`:''}</li>`;
    }).join('');
    const more=result.count>ROW_LIMIT?`<button data-kh="more">${ui.all?`Show the first ${ROW_LIMIT}`:`Show all ${result.count}`}</button>`:'';
    return `${head}${controls}${loading}<ul class="harmony-list">${rows}</ul>${more}${limits}`;
  }

  function signature(result,active){
    return JSON.stringify([ui.size,ui.reach,ui.all,result?.key?.index??null,result?.count??0,result?.harmonies?.[0]?.label??'',result?.harmonies?.at(-1)?.label??'',result?.loading??false,result?.error??'',active]);
  }

  function update(force=false){
    const visible=isPlayView();
    host.hidden=!visible;
    if(!visible)return;
    const result=api.harmonies({size:ui.size,reach:ui.reach});
    if(!result){host.hidden=true;return;}
    // A newly selected key becomes the shared bass (when following), so Discover lists the same chords.
    if(result.key&&result.key.index!==lastKey){lastKey=result.key.index;api.onKey?.(result.key);}
    if(!isShown()){host.hidden=true;return;}
    const active=activeNow(result),sig=signature(result,active);
    if(force||sig!==lastSignature){lastSignature=sig;host.innerHTML=markup(result,active);}
  }

  function move(step){
    const result=api.harmonies({size:ui.size,reach:ui.reach}),active=activeNow(result);
    if(!active)return;
    const n=result.harmonies[active.index].placements.length;
    api.showHarmony(active.index,(active.placement+step+n)%n,{size:ui.size,reach:ui.reach});
  }

  host.addEventListener('click',event=>{
    const button=event.target?.closest?.('[data-kh]');
    if(!button)return;
    const action=button.dataset.kh;
    if(action==='more')ui.all=!ui.all;
    else if(action==='pick'){
      const index=Number(button.dataset.i);
      if(api.showHarmony(index,0,{size:ui.size,reach:ui.reach})){
        ui.active={index,placement:0};
        const result=api.harmonies({size:ui.size,reach:ui.reach}),h=result?.harmonies[index];
        if(h?.source==='directory')api.onPick?.(h,result.key);
      }
    }
    else if(action==='prev')move(-1);
    else if(action==='next')move(1);
    else if(action==='hear'){
      const result=api.harmonies({size:ui.size,reach:ui.reach}),active=activeNow(result);
      if(active)api.hear(result.harmonies[active.index].placements[active.placement].keys);
    }
    update(true);
  });
  host.addEventListener('change',event=>{
    const size=event.target?.closest?.('[data-kh-size]'),reach=event.target?.closest?.('[data-kh-reach]');
    if(size)ui.size=SIZES.includes(Number(size.value))?Number(size.value):3;
    else if(reach)ui.reach=Number(reach.value)||6;
    else return;
    ui.active=null;ui.all=false;
    update(true);
  });

  timerId=timer.set(()=>update(),250);
  update(true);
  return {update,dispose(){timer.clear(timerId);}};
}
