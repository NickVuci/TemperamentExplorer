// Discover's scale pane: the scale and mode menus with their coverage milestones, the scale view
// with each degree's JI reading, and the scale's actions (play, export, collect, use in Play).
// Dependencies are read when used, so workspaces created later can be passed as getters.
import {scale, scaleChoices, createTargetClassifier} from '../core/engine.mjs';
import {periodDescription} from '../core/pitch.mjs';
import {formatPrimeFilter} from '../core/ji-limit-engine.mjs';
import {validateState as validate} from '../core/state.mjs';
import {
  findScaleMilestones,
  scaleMilestoneMarkers,
  modeMilestoneMarker,
  formatModeRanges
} from '../core/scale-milestones.mjs';
import {renderScaleView, normalizeScaleView} from '../ui/scale-view.mjs';
import {esc, option} from '../ui/ui.mjs';
import {allTargets, visibleTargets} from './matrix-view.mjs';

// The pane describes the one current temperament; markup keeps its index for the controls.
const idx = 0;

function milestoneCard(id, title, result, detail) {
  return `<button type="button" class="scale-milestone" data-scale-milestone="${id}" ${result ? '' : 'disabled'}><span>${title}</span><b>${result ? `${result.n} notes · ${esc(result.signature)}` : `Not found through 256 notes`}</b><small>${result ? detail : 'No qualifying scale within the generated-size search.'}</small></button>`;
}

/** The scale as a Scala file. Throws when the tuning collapses notes. */
export function scalaFile(s) {
  if (scale(s).collision) throw Error('Choose a scale without pitch collisions before exporting.');
  return {
    name: `${s.name.replace(/[^a-z0-9]/gi, '-')}-${s.n}.scl`,
    text: `! Temperament Lab\n${s.name}[${s.n}]; ${s.tuning}; ${periodDescription(s)}; generator ${s.g} cents\n${s.n}\n!\n${[
      ...scale(s)
        .notes.slice(1)
        .map(v => v.c),
      s.p
    ]
      .map(v => v.toFixed(8))
      .join('\n')}\n`
  };
}

/**
 * deps: `getState()`, `setState(s)`, `coverageSettings(s)`, `settings(s)`, `harmonic` (the
 * catalogue workspace, for the bass degree), `material` (the collection), `place(item)`,
 * `playPitches(pitches)`, `playSequence(pitches)`, `download(name, text)`, `useInPlay()`,
 * `showScale()` (redraw Discover for a newly chosen scale), `render()`, `notify(message)` and
 * optional `document`.
 */
export function createScalePane(deps) {
  const doc = () => deps.document ?? globalThis.document;
  let scaleFilter = '2',
    scaleView = 'line';

  /** The scale and mode menus and the advanced scale options. */
  function controls() {
    const s = deps.getState(),
      milestones = findScaleMilestones(s, deps.coverageSettings(s)),
      all = scaleChoices(s, scaleFilter),
      choices = new Map(all.map(x => [x.n, x]));
    const allGenerated = scaleChoices(s, 'all');
    for (const n of [
      milestones.interval?.n,
      milestones.intervalMOS?.n,
      milestones.diamond?.n,
      milestones.diamondMOS?.n
    ])
      if (n && !choices.has(n)) {
        const candidate = allGenerated.find(x => x.n === n);
        if (candidate) choices.set(n, candidate);
      }
    const scaleOptions = [...choices.values()]
      .sort((a, b) => a.n - b.n)
      .map(x => {
        const markers = scaleMilestoneMarkers(milestones, x.n);
        return option(
          x.n,
          `${x.n} notes · ${x.signature}${x.retained ? ' · current (outside filter)' : ''}${markers.length ? ` · ${markers.join(' · ')}` : ''}`,
          s.n
        );
      })
      .join('');
    const modeOptions = Array.from({length: s.n}, (_, i) =>
      option(
        i,
        `${i + 1} / ${s.n}${modeMilestoneMarker(milestones, s.n, i) ? ' · DC' : ''}`,
        s.mode
      )
    ).join('');
    const diamondScaleDetail = milestones.diamond
      ? `completing mode${milestones.diamond.modes.length === 1 ? '' : 's'} ${formatModeRanges(milestones.diamond.modes)}`
      : 'all completing modes';
    const diamondMOSDetail = milestones.diamondMOS
      ? `completing mode${milestones.diamondMOS.modes.length === 1 ? '' : 's'} ${formatModeRanges(milestones.diamondMOS.modes)}`
      : 'all completing modes';
    return `<div class="formrow scale-head"><label>Scale<select data-s="${idx}" data-field="n">${scaleOptions}</select></label><label>Mode<select data-s="${idx}" data-field="mode">${modeOptions}</select></label></div><details class="scale-advanced" ${doc().querySelector('.unified-scale-controls .scale-advanced')?.open ? 'open' : ''}><summary>Advanced scale options</summary><label>Scales<select data-scale-filter>${option('all', 'All', scaleFilter)}${option('2', '2 step sizes', scaleFilter)}${option('3', '3 step sizes', scaleFilter)}</select></label><section class="scale-milestones" aria-label="Scale coverage milestones"><h4>Coverage milestones</h4><div class="scale-milestone-grid">${milestoneCard('interval', 'First interval-complete scale', milestones.interval, 'Mode-independent interval matrix')}${milestoneCard('intervalMOS', 'First interval-complete MOS', milestones.intervalMOS, 'Opens in default mode 1')}${milestoneCard('diamond', 'First diamond-complete scale', milestones.diamond, diamondScaleDetail)}${milestoneCard('diamondMOS', 'First diamond-complete MOS', milestones.diamondMOS, diamondMOSDetail)}</div><p>${milestones.limit}-odd-limit · ${esc(formatPrimeFilter(milestones.primeLimit))} · ${milestones.mappedTargetCount} mapped interval classes${milestones.unmappedTargetCount ? ` · ${milestones.unmappedTargetCount} outside-basis targets excluded` : ``} · IC: full matrix · DC: one tonic · modulo one period</p></section></details>`;
  }

  // Each degree's JI reading (and the period's) uses the interval matrix's classifier and target
  // filter.
  function degreeReadings(s, a) {
    const cfg = deps.settings(s),
      classify = createTargetClassifier(s, allTargets(cfg.ts, s, cfg), cfg.tol);
    return {
      maxError: cfg.maxError,
      readings: [...a.notes, {c: s.p, k: 0}].map(v => {
        const shown = visibleTargets(classify({c: v.c, k: v.k}), cfg);
        return shown.find(t => t.identity) || shown[0] || null;
      })
    };
  }

  /** The scale view and the scale's actions. */
  function details() {
    const s = deps.getState(),
      a = scale(s),
      bass = deps.harmonic.bass();
    return `<section class="scale-details" data-scale-view="${scaleView}">
${renderScaleView({s, a, idx, view: scaleView, bassDegree: bass?.scale === 'discover' ? bass.degree : -1, ...degreeReadings(s, a)})}
<div class="panelactions"><button data-action="scale" data-s="${idx}">▶ Play scale</button><button data-hex-open="${idx}" class="primary">Use scale in Play</button><button data-scale-action="collect">Add scale to collection</button><button data-scale-action="place">Highlight on current layout</button><button data-action="export" data-s="${idx}">Export .scl</button></div>
${a.collision ? '<p class="notice">This tuning collapses notes. Choose a smaller size.</p>' : ''}
</section>`;
  }

  // A degree plays; in the scale view it also becomes the directory's bass note.
  function pressDegree(button) {
    const s = deps.getState(),
      degree = Number(button.dataset.note);
    deps.playPitches([scale(s).notes[degree].c]);
    if (!button.classList.contains('scale-degree')) return;
    deps.harmonic.setBass({scale: 'discover', degree});
    for (const dot of doc().querySelectorAll('.scale-degree')) {
      const bass = Number(dot.dataset.note) === degree;
      dot.classList.toggle('is-bass', bass);
      dot.setAttribute('aria-pressed', String(bass));
    }
  }

  /** Handles a button press in the pane. Returns whether it was the pane's. */
  function click(button) {
    const {dataset} = button;
    try {
      if (dataset.scaleMilestone) {
        const s = deps.getState(),
          result = findScaleMilestones(s, deps.coverageSettings(s))[dataset.scaleMilestone];
        if (!result) return true;
        deps.setState(validate({...s, n: result.n, mode: result.mode ?? 0}));
        deps.showScale();
      } else if (dataset.scaleAction === 'collect') deps.material.addScale();
      else if (dataset.scaleAction) {
        const s = deps.getState();
        deps.place({
          kind: 'scale',
          coords: scale(s).notes.map(n => [Math.round((n.c - n.k * s.g) / s.p), n.k]),
          label: `${s.n} notes · mode ${s.mode + 1}`
        });
      } else if (dataset.hexOpen !== undefined) deps.useInPlay();
      else if (dataset.scaleView) {
        scaleView = normalizeScaleView(dataset.scaleView);
        const section = doc().querySelector('.unified-scale .scale-details');
        if (section) section.outerHTML = details();
      } else if (dataset.note) pressDegree(button);
      else if (dataset.action === 'scale') {
        const s = deps.getState();
        deps.playSequence([...scale(s).notes.map(v => v.c), s.p]);
      } else if (dataset.action === 'export') {
        const file = scalaFile(deps.getState());
        deps.download(file.name, file.text);
      } else return false;
    } catch (error) {
      deps.notify(error.message);
    }
    return true;
  }

  /** Handles a changed scale control. Returns whether it was the pane's. */
  function change(el) {
    if (el.hasAttribute('data-scale-filter')) {
      scaleFilter = el.value;
      deps.render();
      return true;
    }
    const field = el.dataset.field;
    if (field !== 'n' && field !== 'mode') return false;
    const s = deps.getState(),
      old = structuredClone(s);
    try {
      s[field] = Number(el.value);
      if (field === 'n') s.mode = 0;
      delete s.tuningReport;
      validate(s);
      deps.render();
    } catch (error) {
      deps.setState(old);
      deps.notify(error.message);
      deps.render();
    }
    return true;
  }

  return {
    controls,
    details,
    click,
    change,
    /** The pane's settings for a session file. */
    settings: () => ({scaleFilter, scaleView}),
    /** Restores the pane's settings; missing values return to the defaults. */
    restore(saved) {
      scaleFilter = saved?.scaleFilter ?? '2';
      scaleView = saved?.scaleView ?? 'line';
    }
  };
}
