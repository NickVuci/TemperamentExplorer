// "Harmonies with this key": for the key selected on the Play board, the chords on this
// layout that include it, what role the key plays in each, and a way to light one on the
// screen and on a connected HexBoard. The search and the lighting come from the Play
// board (hexboard-ui harmoniesAt / showHarmony); this module is only the panel.
import {esc,option} from './ui.mjs';

const ROW_LIMIT=24;
const REACHES=[3,4,5,6,7,8,9,10];

export function createKeyHarmoniesUi({
  host,api,getFingerings,isPlayView,
  timer={set:(fn,ms)=>setInterval(fn,ms),clear:id=>clearInterval(id)},
}){
  const ui={open:false,size:3,reach:6,all:false,active:null};  // active: {index, placement}
  let lastSignature='',timerId=null;

  const role=r=>r.ratio==='1/1'?'the root':`the ${r.ratio}`;

  /** Which harmony and placement the board is showing, if it is one of this key's harmonies. */
  function activeNow(result){
    if(!ui.active||!result)return null;
    const h=result.harmonies[ui.active.index],f=getFingerings();
    if(!h||!f||f.label!==h.label||f.placements.length!==h.placements.length)return null;
    return {index:ui.active.index,placement:Math.max(0,Math.min(f.index,h.placements.length-1))};
  }

  function markup(result,active){
    const key=result.key;
    if(!key)return `<h3>Harmonies with a key</h3><p class="viewnote">Select an enabled key on the board to see the chords it can be part of.</p>`;
    const title=`Harmonies with key ${key.index}`;
    const summary=`${result.count} chord${result.count===1?'':'s'} within reach ${result.reach}`;
    const head=`<h3>${esc(title)}</h3><p class="harmony-summary">${esc(summary)} · degree ${key.degree>=0?key.degree:'—'} · ${key.cents.toFixed(1)} ¢ above the tonic
      <button data-kh="toggle" aria-expanded="${ui.open}">${ui.open?'Hide':'Show'}</button></p>`;
    if(!ui.open)return head;
    if(result.error)return `${head}<p role="alert">${esc(result.error)}</p>`;
    const controls=`<div class="panelactions"><label>Notes <select data-kh-size>${option(3,'3',ui.size)}${option(4,'4',ui.size)}</select></label>
      <label>Reach <select data-kh-reach>${REACHES.map(n=>option(n,String(n),ui.reach)).join('')}</select></label></div>`;
    const limits=`<p class="viewnote">Chords the board's chord search accepts at odd limit ${esc(result.settings.limit)} and ${+Number(result.settings.tolerance).toFixed(1)}¢ tolerance (change them in the advanced options). A larger reach finds wider fingerings.</p>`;
    if(!result.count)return `${head}${controls}<p>No ${result.size}-note chord with this key fits within reach ${result.reach} on this layout. Try a larger reach.</p>${limits}`;
    const shown=ui.all?result.harmonies:result.harmonies.slice(0,ROW_LIMIT);
    const rows=shown.map((h,i)=>{
      const on=active?.index===i;
      return `<li><button class="harmony-row" data-kh="pick" data-i="${i}" aria-pressed="${on}"><b>${esc(h.label)}</b>
        <span>this key is ${esc(h.roles.map(role).join(' or '))} · ${h.placements.length} place${h.placements.length===1?'':'s'} · worst error ${h.max.toFixed(1)} ¢ · ${h.mapped}/${h.total} mapped</span></button>${
        on?`<div class="panelactions harmony-nav"><span>Place ${active.placement+1} of ${h.placements.length} · keys ${esc(h.placements[active.placement].keys.join(', '))}</span>
          <button data-kh="prev" ${h.placements.length>1?'':'disabled'}>← Previous</button><button data-kh="next" ${h.placements.length>1?'':'disabled'}>Next →</button><button data-kh="hear">▶ Hear</button></div>`:''}</li>`;
    }).join('');
    const more=result.count>ROW_LIMIT?`<button data-kh="more">${ui.all?`Show the first ${ROW_LIMIT}`:`Show all ${result.count}`}</button>`:'';
    return `${head}${controls}<ul class="harmony-list">${rows}</ul>${more}${limits}`;
  }

  function signature(result,active){
    return JSON.stringify([ui.open,ui.size,ui.reach,ui.all,result?.key?.index??null,result?.count??0,result?.harmonies?.[0]?.label??'',result?.error??'',active]);
  }

  function update(force=false){
    const visible=isPlayView();
    host.hidden=!visible;
    if(!visible)return;
    const result=api.harmonies({size:ui.size,reach:ui.reach});
    if(!result){host.hidden=true;return;}
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
    if(action==='toggle')ui.open=!ui.open;
    else if(action==='more')ui.all=!ui.all;
    else if(action==='pick'){
      const index=Number(button.dataset.i);
      if(api.showHarmony(index,0,{size:ui.size,reach:ui.reach}))ui.active={index,placement:0};
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
    if(size)ui.size=Number(size.value)===4?4:3;
    else if(reach)ui.reach=Number(reach.value)||6;
    else return;
    ui.active=null;ui.all=false;
    update(true);
  });

  timerId=timer.set(()=>update(),250);
  update(true);
  return {update,dispose(){timer.clear(timerId);}};
}
