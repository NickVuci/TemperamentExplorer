// The header's temperament and tuning panel: the preset chooser, tuning method and its options,
// the JI target explorer and the custom mapping editor. Every retuning is committed atomically:
// a tuning that would move the selected scale or the Play layout is rejected and nothing changes.
// Dependencies are read when used, so workspaces created later can be passed as getters.
import {
  tuningMethods,
  tuningMethod,
  tuningConfig,
  applyTuningMethod,
  jiSelection
} from '../core/tuning-methods.mjs';
import {preflightRetuning} from '../core/retuning-guard.mjs';
import {supportingEdos} from '../core/tuning.mjs';
import {target, assignment, checkAssignments, coordinate} from '../core/assignments.mjs';
import {candidates, nearestReport} from '../core/approximation-compat.mjs';
import {mapRatio} from '../core/engine.mjs';
import {presets} from '../core/catalog.mjs';
import {purePeriod, sameCoordinate as same} from '../core/pitch.mjs';
import {validateState as validate} from '../core/state.mjs';
import {esc, option, fixed as fmt, signedFixed as sign} from '../ui/ui.mjs';
import {nearestTarget, allTargets} from './matrix-view.mjs';

// The panel describes the one current temperament; markup keeps its index for the controls.
const idx = 0;

/**
 * deps: `getState()`, `setState(s)`, `getPlayState()` (Play's own scale state, or null),
 * `setPlayState(s)`, `layoutSnapshot()` (the Play layout a retuning must preserve), `presets`
 * (the preset workspace), `settings(s)`, `stop()`, `render()`, `notify(message)`, `play(pitches)`,
 * `showDiscover()` and optional `document`.
 */
export function createTuningPanel(deps) {
  const doc = () => deps.document ?? globalThis.document,
    $ = selector => doc().querySelector(selector);

  function readTuning(panel) {
    const cfg = {...tuningConfig(deps.getState())};
    panel.querySelectorAll('[data-tune]').forEach(el => {
      const key = el.dataset.tune;
      if (key === 'edoChoice') {
        [cfg.n, cfg.k, cfg.h] = el.value.split(':');
      } else cfg[key] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return cfg;
  }

  function tuningControls(s) {
    const cfg = tuningConfig(s),
      method = cfg.method;
    if (!['Minimax', 'Least Squares', 'EDO', 'JI Target'].includes(method)) return '';
    const options = method === 'EDO' ? supportingEdos(s, Number(cfg.edoMax), cfg.edoVariants) : [];
    return `${method === 'EDO' ? '<p>EDO fixes the octave at 1200¢.</p>' : ''}
 ${method === 'EDO' ? `<label>EDO<select data-tune="edoChoice">${options.length ? options.map(v => option(v.n + ':' + v.k + ':' + v.periodSteps, `${v.n}edo · ${v.k} generator steps${v.patent ? '' : ' · nearby val'}`, cfg.n + ':' + cfg.k + ':' + cfg.h)).join('') : '<option value="">No supporting EDO</option>'}</select></label><details><summary>EDO search options</summary><label>Search up to<select data-tune="edoMax">${[100, 500, 1000, 5000].map(n => option(n, n, cfg.edoMax)).join('')}</select></label><label class="checklabel"><input type="checkbox" data-tune="edoVariants" ${cfg.edoVariants ? 'checked' : ''}>Include nearby non-patent vals</label><p>Every listed mapping tempers out the temperament’s commas.</p></details>` : ''}
 ${['Minimax', 'Least Squares'].includes(method) ? `<label>Targets<select data-tune="targets">${option('primes', 'Basis primes', cfg.targets)}${[5, 7, 9, 13].map(n => option(n, `${n}-odd-limit · mapped`, cfg.targets)).join('')}${option('custom', 'Custom intervals', cfg.targets)}</select></label>${cfg.targets === 'custom' ? `<label>Intervals<input data-tune="custom" value="${esc(cfg.custom)}" placeholder="3/2, 5/4, 6/5"></label>` : ''}` : ''}
 ${method === 'JI Target' ? `${explorer(s)}` : ''}
`;
  }

  // Commits a retuned temperament, or throws without changing anything.
  function commitRetuning(candidate) {
    const result = preflightRetuning({
      currentState: deps.getState(),
      candidateState: candidate,
      playState: deps.getPlayState() ?? deps.getState(),
      layoutConfig: deps.layoutSnapshot()
    });
    deps.setState(result.state);
    if (deps.getPlayState()) deps.setPlayState(result.playState);
    deps.stop();
  }

  /** Applies a tuning configuration to a draft of the temperament. Returns whether it applied. */
  function applyTuning(cfg, draft = deps.getState()) {
    try {
      commitRetuning(applyTuningMethod(structuredClone(draft), cfg));
    } catch (e) {
      deps.notify(e.message);
      render();
      return false;
    }
    deps.render();
    return true;
  }

  /** Renders the preset chooser into its host and moves its editor into the advanced options. */
  function renderPresetControls(host) {
    host.innerHTML = deps.presets.render(idx);
    const editor = host.querySelector('.temperament-editor'),
      destination = $('#advanced-temperament-editor');
    if (editor && destination) destination.replaceChildren(editor);
  }

  function render() {
    const s = deps.getState(),
      advancedTuningOpen = $('#tuning-panel .advanced-tuning-options')?.open,
      tuningOptions = tuningControls(s),
      canOptimizePeriod = tuningMethod(s) !== 'EDO';
    $('#temperament-controls').innerHTML = `<div data-preset-controls="${idx}"></div>`;
    renderPresetControls($('#temperament-controls [data-preset-controls]'));
    $('#tuning-panel').innerHTML =
      `<div class="tuning-choice"><label>Tuning<select data-s="${idx}" data-field="tuning">${tuningMethods.map(v => option(v, v, tuningMethod(s))).join('')}</select></label><div class="tuning-summary" aria-label="Current tuning"><span>Generator <b>${fmt(s.g, 4)} ¢</b></span><div class="period-summary"><span>Period <b>${fmt(s.p, 4)} ¢</b></span></div></div></div>
${/^EDO \d+$/.test(s.tuning) ? `<p class="notice">Induced val: ⟨${s.rows[0].map((v, i) => v * Math.round((s.p * Number(s.tuning.slice(4))) / 1200) + s.rows[1][i] * Math.round((s.g * Number(s.tuning.slice(4))) / 1200)).join(' ')}] · may be non-patent.</p>` : ''}
${tuningOptions || canOptimizePeriod ? `<details class="advanced-tuning-options" data-s="${idx}" ${advancedTuningOpen ? 'open' : ''}><summary>Advanced tuning options</summary><div class="header-popover-panel">${tuningOptions}${canOptimizePeriod ? `<label class="period-optimize"><input type="checkbox" data-optimize-period="${idx}" ${!tuningConfig(s).fixed ? 'checked' : ''}>Optimize period</label>` : ''}</div></details>` : ''}
`;
    const mappingOpen = $('#mapping-options details')?.open;
    $('#mapping-options').innerHTML =
      `<details class="mapping"><summary>Mapping & custom temperament</summary><p>Columns: ${s.basis.join(', ')}. Rows: period, generator.</p><pre>${s.rows.map(r => '⟨' + r.join(' ') + ']').join('\n')}\nCommas: ${esc(s.commas || 'derived from mapping')}</pre><label>Prime basis<input data-custom="basis" value="${s.basis.join(' ')}"></label><label>Mapping rows · one per line<textarea data-custom="rows">${s.rows.map(r => r.join(' ')).join('\n')}</textarea></label><button data-action="mapping" data-s="${idx}">Apply custom mapping</button><p>${presets[s.key] ? `<a href="${presets[s.key].source}" target="_blank" rel="noreferrer">Preset definition and tuning source ↗</a>` : 'Custom mapping: prime least-squares tuning is calculated here.'}</p></details>`;
    if (mappingOpen) $('#mapping-options details').open = true;
  }

  function explorer(s) {
    return `<div class="target-explorer" data-explorer="${idx}"><div data-explore-body="${idx}">${explorerBody(s)}</div></div>`;
  }

  function explorerBody(s) {
    const cfg = {ratio: tuningConfig(s).pure || '5/4', ...s.explore},
      list = s.assignments || [];
    let t,
      cs = [],
      chosen,
      error = '';
    try {
      t = target(cfg.ratio || '5/4');
      cs = candidates(s, t);
      chosen = cs.find(c => same(c.m, cfg.m)) || cs.find(c => c.mapped) || cs[0];
      if (cfg.m && !cs.some(c => same(c.m, cfg.m))) {
        const m = assignment(t, cfg.m).m,
          c = m[0] * s.p + m[1] * s.g;
        chosen = {m, c, error: c - t.c, available: false, mapped: same(m, mapRatio(t.n, t.d, s))};
        cs.push(chosen);
      }
    } catch (e) {
      error = e.message;
    }
    const check = checkAssignments(s, list),
      m = t && mapRatio(t.n, t.d, s),
      draft =
        chosen &&
        checkAssignments(s, [...list.filter(x => x.label !== t.label), assignment(t, chosen.m)]);
    const pill = status =>
      status === 'compatible' ? 'good' : status === 'conflict' ? 'bad' : 'dim';
    return `<p>Pick a ratio and the interval you want to use for it. Other approximations stay available even when they disagree with the mapping.</p><label>JI target<input data-explore-field="ratio" data-s="${idx}" value="${esc(cfg.ratio || '5/4')}" placeholder="7/4"></label>${error ? `<p role="status" class="bad">${esc(error)}</p>` : `<label>Interval to use<select data-explore-field="choice" data-s="${idx}">${cs.map(c => option(c.m.join(','), `${fmt(c.c, 3)} ¢ · ${sign(c.error)} ¢ error · ${c.mapped ? 'Mapped' : m ? 'Alternative' : 'Outside subgroup'}${c.available ? '' : ' · absent from this scale'} · ${coordinate(c.m)}`, chosen.m.join(','))).join('')}</select></label><p>${m ? `Mapped interval: ${esc(coordinate(m))}.` : 'This ratio is outside the current subgroup.'} Search covers ascending intervals in this ${s.n}-note scale plus the mapped interval.</p><details><summary>Enter coordinates directly</summary><div class="formrow"><label>Periods<input type="number" step="1" data-explore-field="a" data-s="${idx}" value="${chosen.m[0]}"></label><label>Generators<input type="number" step="1" data-explore-field="b" data-s="${idx}" value="${chosen.m[1]}"></label></div></details><p class="${pill(draft.status)}" role="status">${esc(draft.message)}</p>${draft.detail ? `<details><summary>Why?</summary><p>${esc(draft.detail)}</p></details>` : ''}<div class="panelactions"><button data-explore="listen" data-s="${idx}">▶ Hear interval</button><button data-explore="pure" data-s="${idx}" class="primary">Use this target</button><button data-explore="add" data-s="${idx}">Add assignment</button></div><p>Changing the target or its coordinates retunes immediately. Period settings above apply. Tuning does not adopt a mapping.</p>`}
 ${cfg.notice ? `<p class="tuning-report" role="status">${esc(cfg.notice)}</p>` : ''}
 ${
   list.length
     ? `<div class="assignment-list"><b>Selected assignments</b>${list
         .map((x, i) => {
           const c = x.m[0] * s.p + x.m[1] * s.g,
             available = candidates(s, x).some(v => same(v.m, x.m) && v.available);
           return `<div><span>${esc(x.label)} → ${esc(coordinate(x.m))}<br>${fmt(c, 3)} ¢ · ${sign(c - x.c)} ¢ error${available ? '' : ' · absent from this scale'}</span><button data-explore="remove" data-s="${idx}" data-i="${i}" aria-label="Remove ${esc(x.label)} assignment">Remove</button></div>`;
         })
         .join(
           ''
         )}<p class="${pill(check.status)}" role="status">${esc(check.message)}</p>${check.detail ? `<details><summary>Explain conflict or limitation</summary><p>${esc(check.detail)}</p></details>` : ''}<div class="panelactions"><button data-explore="adopt" data-s="${idx}" ${check.status === 'compatible' && check.extended ? '' : 'disabled'}>Adopt extension</button><button data-explore="pureall" data-s="${idx}">Use all assignments</button></div>${check.status === 'compatible' && check.extended ? `<details><summary>Implied target assignments after extension</summary>${impliedTargets({...s, basis: check.basis, rows: check.rows}, s)}</details>` : ''}</div>`
     : ''
 }
 <details><summary>Check nearest approximations in this scale</summary>${nearestSummary(s)}<p>This checks the selected odd-limit targets against the current mapping and finite scale. It is not a consistency verdict for every interval of the infinite tuning. Equal pitches at different generator coordinates remain distinct here.</p><a href="https://en.xen.wiki/w/Consistency" target="_blank" rel="noreferrer">About consistency</a></details>`;
  }

  function impliedTargets(next, old) {
    return `<div class="tablewrap"><table><thead><tr><th>Target</th><th>Coordinates</th><th>Error</th></tr></thead><tbody>${deps
      .settings(next)
      .ts.filter(t => !mapRatio(t.n, t.d, old) && mapRatio(t.n, t.d, next))
      .map(t => {
        const m = mapRatio(t.n, t.d, next);
        return `<tr><td>${t.label}</td><td>${coordinate(m)}</td><td>${sign(m[0] * next.p + m[1] * next.g - t.c)} ¢</td></tr>`;
      })
      .join(
        ''
      )}</tbody></table></div><p>Related ratios through odd limit 13, using the current tuning.</p>`;
  }

  function nearestSummary(s) {
    const r = nearestReport(s, deps.settings(s).ts);
    return `<p>${r.mapped} targets in the mapping; ${r.alternative} have a strictly closer alternative in this scale; ${r.absent} have their mapped interval absent. ${r.outside} targets are outside the subgroup.</p>`;
  }

  /** Redraws the JI target explorer in place, if it is showing. */
  function refreshExplorer() {
    doc()
      .querySelectorAll('[data-explore-body]')
      .forEach(el => (el.innerHTML = explorerBody(deps.getState())));
  }

  function changeExplore(el) {
    const s = structuredClone(deps.getState());
    try {
      s.explore = {...s.explore, notice: ''};
      if (el.dataset.exploreField === 'ratio') {
        s.explore.ratio = el.value;
        delete s.explore.m;
      } else if (el.dataset.exploreField === 'choice')
        s.explore.m = el.value.split(',').map(Number);
      else {
        const old = jiSelection(s);
        s.explore.m = [...old.m];
        s.explore.m[el.dataset.exploreField === 'a' ? 0 : 1] = Number(el.value);
      }
      applyTuning({...tuningConfig(s), method: 'JI Target', jiAll: false}, s);
    } catch (e) {
      deps.notify(e.message);
      render();
    }
  }

  function handleExplore(b) {
    const s = structuredClone(deps.getState()),
      action = b.dataset.explore;
    s.explore = {...s.explore, open: true, notice: ''};
    if (action === 'open') {
      applyTuning({...tuningConfig(s), method: 'JI Target'}, s);
      return;
    }
    if (action === 'cell') {
      s.explore.m = b.dataset.m.split(',').map(Number);
      const c = s.explore.m[0] * s.p + s.explore.m[1] * s.g,
        ji = deps.settings(s);
      s.explore.ratio = nearestTarget(c, allTargets(ji.ts, s, ji)).label;
      if (applyTuning({...tuningConfig(s), method: 'JI Target', jiAll: false}, s)) {
        deps.showDiscover();
        $('#tuning-panel').querySelector('.advanced-tuning-options').open = true;
        $('#tuning-panel')
          .querySelector('.target-explorer')
          .scrollIntoView({block: 'center', behavior: 'smooth'});
      }
      return;
    }
    if (action === 'remove') {
      s.assignments.splice(Number(b.dataset.i), 1);
      if (tuningConfig(s).jiAll)
        applyTuning({...tuningConfig(s), jiAll: s.assignments.length > 0}, s);
      else {
        deps.setState(s);
        deps.render();
      }
      return;
    }
    if (action === 'adopt') {
      const result = checkAssignments(s, s.assignments || []);
      if (result.status !== 'compatible' || !result.extended)
        throw Error('There is no complete compatible extension to adopt.');
      const next = {
        ...s,
        basis: result.basis,
        rows: result.rows,
        key: 'custom',
        name: s.name + ' extension',
        commas: 'custom mapping',
        tuning: 'Manual',
        generatorLabel: '',
        tuningReport:
          'Mapping extended from selected assignments. Period and generator tuning retained.'
      };
      next.explore.notice = 'Extension adopted. Related targets now follow the extended mapping.';
      validate(next);
      deps.setState(next);
      deps.render();
      return;
    }
    const t = jiSelection(s);
    s.explore.m = [...t.m];
    if (action === 'listen') {
      deps.setState(s);
      deps.play([0, t.m[0] * s.p + t.m[1] * s.g]);
      return;
    }
    if (action === 'add') {
      const list = (s.assignments || []).filter(x => x.label !== t.label);
      if (list.length >= 64) throw Error('Use at most 64 assignments.');
      s.assignments = [...list, t];
      if (tuningConfig(s).jiAll) {
        applyTuning(tuningConfig(s), s);
        return;
      }
    }
    if (action === 'pure' || action === 'pureall') {
      applyTuning({...tuningConfig(s), method: 'JI Target', jiAll: action === 'pureall'}, s);
      return;
    }
    deps.setState(s);
    deps.render();
  }

  // Applies the custom mapping editor's basis and rows, keeping the tuning's proportions.
  function applyMapping() {
    const s = deps.getState(),
      panel = $('#temperament-panel');
    const basis = panel
        .querySelector('[data-custom=basis]')
        .value.trim()
        .split(/[\s,.]+/)
        .map(Number),
      rows = panel
        .querySelector('[data-custom=rows]')
        .value.trim()
        .split('\n')
        .map(r =>
          r
            .trim()
            .split(/[\s,]+/)
            .map(Number)
        );
    const next = {
      ...s,
      key: 'custom',
      name: 'Custom temperament',
      generatorLabel: '',
      basis,
      rows,
      commas: 'custom mapping',
      tuning: 'Manual',
      assignments: [],
      explore: undefined
    };
    if (basis[0] !== s.basis[0] || rows[0]?.[0] !== s.rows[0][0]) {
      next.p = (purePeriod(next) * s.p) / purePeriod(s);
      next.g = (s.g / s.p) * next.p;
    }
    validate(next);
    deps.setState(next);
    deps.render();
    deps.notify('Custom mapping applied; choose a tuning next');
  }

  /** Handles a button press in the panel or the explorer. Returns whether it was the panel's. */
  function click(button) {
    if (button.dataset.explore === undefined && button.dataset.action !== 'mapping') return false;
    try {
      if (button.dataset.explore !== undefined) handleExplore(button);
      else applyMapping();
    } catch (error) {
      deps.notify(error.message);
    }
    return true;
  }

  /** Handles a changed tuning control. Returns whether it was the panel's. */
  function change(el) {
    if (el.dataset.exploreField) {
      changeExplore(el);
      return true;
    }
    if (el.dataset.optimizePeriod !== undefined) {
      applyTuning({...tuningConfig(deps.getState()), fixed: !el.checked});
      return true;
    }
    const tunePanel = el.closest('.advanced-tuning-options');
    if (tunePanel && el.dataset.tune) {
      applyTuning(readTuning(tunePanel));
      return true;
    }
    if (el.dataset.field === 'tuning') {
      applyTuning({...tuningConfig(deps.getState()), method: el.value});
      return true;
    }
    return false;
  }

  return {render, renderPresetControls, refreshExplorer, click, change};
}
