import {esc, option} from './ui.mjs';
import {chordCoordinates} from '../hexboard/hexboard-chords.mjs';
import {MAX_SCALE_SIZE} from '../core/engine.mjs';
import {scale} from '../core/engine.mjs';
import {MAX_CHORD_TONES} from '../chords/chord-identity.mjs';
import {noteCoordinate} from '../core/pitch.mjs';
import {validateJILimits, DEFAULT_ODD_LIMIT} from '../core/ji-limit-engine.mjs';
import {
  createCoordinateInspector,
  inspectCoordinateChord,
  discoverScaleChords
} from '../harmonic/harmonic-inspection.mjs';
import {searchShapeOccurrences} from '../chords/chord-occurrence.mjs';
import {renderCoordinateAssessment} from '../harmonic/harmonic-inspection-ui.mjs';
export function createChordWorkspace({
  getJI,
  getStates,
  setState = s => (getStates()[0] = s),
  play,
  refresh,
  notify,
  onHexboard,
  onCollect,
  onBrowseHarmony
}) {
  const fmt = (x, n = 2) => Number(x).toFixed(n),
    sign = x => (x >= 0 ? '+' : '') + fmt(x);
  let ui = {
      size: 3,
      limit: DEFAULT_ODD_LIMIT,
      primeLimit: null,
      tol: 10,
      other: true,
      all: false,
      selections: [[0, 6, 11]],
      octaves: [{}],
      pins: []
    },
    results = null,
    page = 0,
    provenance = '',
    sourceKey = '';
  const sourceKeyFor = s => JSON.stringify([s.basis, s.rows, s.p, s.g, s.n, s.mode]);
  const current = () => getStates()[0],
    selected = () => ui.selections[0].filter(i => i < current().n).sort((a, b) => a - b),
    signature = () =>
      JSON.stringify([current(), ui.size, ui.limit, ui.primeLimit, ui.tol, ui.other]);
  function choose(degrees) {
    ui.selections[0] = [...new Set(degrees)].sort((a, b) => a - b);
    ui.octaves[0] = {};
    provenance = '';
  }
  function fromCoordinates(coordinates, label = 'JI chord') {
    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2 ||
      coordinates.length > MAX_CHORD_TONES
    )
      throw Error(`Choose 2–${MAX_CHORD_TONES} chord coordinates.`);
    const s = getStates()[0],
      ns = scale(s).notes,
      seen = new Set(),
      degrees = [],
      oct = {};
    for (const m of coordinates) {
      if (
        !Array.isArray(m) ||
        m.length !== 2 ||
        !m.every(Number.isInteger) ||
        m.some(v => Math.abs(v) > 10000)
      )
        throw Error('Chord coordinates must be safe integers.');
      const i = ns.findIndex(n => noteCoordinate(s, n)[1] === m[1]);
      if (i < 0) throw Error('A chord coordinate is absent from this scale.');
      if (seen.has(i)) throw Error('Chord coordinates must resolve to distinct scale degrees.');
      const base = noteCoordinate(s, ns[i]),
        lift = m[0] - base[0];
      if (Math.abs(lift) > 10000) throw Error('Chord period lift is out of bounds.');
      seen.add(i);
      degrees.push(i);
      oct[i] = lift;
    }
    ui.selections[0] = degrees.sort((a, b) => a - b);
    ui.octaves[0] = oct;
    provenance = String(label).slice(0, 100);
    sourceKey = sourceKeyFor(s);
    results = null;
    return true;
  }
  function voiced() {
    const s = current(),
      ns = scale(s).notes;
    return selected()
      .map(i => ({i, c: ns[i].c + (ui.octaves[0][i] || 0) * s.p}))
      .sort((a, b) => a.c - b.c);
  }
  function chip(t) {
    const code = t.identity ? 'M' : t.reason === 'Outside temperament basis' ? 'O' : 'A';
    return `<span class="target-chip ${t.identity ? 'target-mapped' : 'target-hit'}" title="${esc(t.label)}: ${sign(t.error)} cents"><small>${code}</small> ${esc(t.label)} <small>${sign(t.error)}¢</small></span>`;
  }
  function matrix(ds) {
    const s = current(),
      ns = scale(s).notes,
      inspector = createCoordinateInspector(s, {
        limit: ui.limit,
        primeLimit: ui.primeLimit,
        tolerance: ui.tol,
        span: s.p
      });
    return `<div class="tablewrap"><table class="chord-matrix"><thead><tr><th>From / to</th>${ds.map(i => `<th>${i}</th>`).join('')}</tr></thead><tbody>${ds
      .map(
        i =>
          `<tr><th>${i}</th>${ds
            .map(j => {
              if (i === j) return '<td class="dim">0.00 ¢</td>';
              const p = inspector.pair(
                  noteCoordinate(s, ns[i]),
                  noteCoordinate(s, ns[j]),
                  ns[j].c - ns[i].c
                ),
                matched = p.mapped.filter(t => t.within),
                other = ui.all ? p.hits : matched.length ? [] : p.hits.slice(0, 1),
                out = p.mapped.filter(t => !t.within);
              return `<td><button data-chord="interval" data-i="${i}" data-j="${j}">${fmt(p.c)} ¢</button><div>${matched.map(chip).join('')}${other.map(chip).join('')}${!matched.length && !other.length ? '<span class="dim">No target within tolerance</span>' : ''}</div>${ui.all && out.length ? `<small class="dim">Mapped outside tolerance: ${out.map(t => `${esc(t.label)} (${sign(t.error)}¢)`).join(', ')}</small>` : ''}</td>`;
            })
            .join('')}</tr>`
      )
      .join('')}</tbody></table></div>`;
  }
  function syncJI() {
    if (provenance && sourceKey !== sourceKeyFor(current())) provenance = '';
    if (getJI) {
      const cfg = getJI(current());
      ui.limit = cfg.limit;
      ui.primeLimit = cfg.primeLimit ?? null;
      ui.tol = cfg.tol;
    }
  }
  function render() {
    syncJI();
    const s = current(),
      ds = selected(),
      ns = scale(s).notes,
      pair = ds.length > 1,
      coordinates = ds.map(i => {
        const base = noteCoordinate(s, ns[i]);
        return [base[0] + (ui.octaves[0][i] || 0), base[1]];
      }),
      analysis = pair
        ? inspectCoordinateChord(s, coordinates, {
            limit: ui.limit,
            primeLimit: ui.primeLimit,
            tolerance: ui.tol,
            other: ui.other,
            span: s.p
          })
        : null,
      occurrences = pair
        ? searchShapeOccurrences(s, {
            coordinates: ds.map(i => noteCoordinate(s, ns[i]))
          }).completeOccurrences.map(occurrence => occurrence.degrees.toSorted((a, b) => a - b))
        : [];
    if (results?.signature !== signature()) results = null;
    return `<div class="chord-workspace">${onBrowseHarmony ? '<div class="panelactions"><button data-chord="browse">Back to harmonic catalogue</button></div>' : ''}<div class="chord-layout"><section class="chord-inspect"><h3>Build & inspect a chord</h3>${provenance ? `<p class="chord-source">JI chord ${esc(provenance)} · selected degrees and voicing retained.</p>` : ''}<p>Click scale notes to select up to ${MAX_CHORD_TONES}. Highlighted notes form the current chord.</p><div class="chord-keys">${ns.map((n, i) => `<button data-chord="note" data-i="${i}" class="${ds.includes(i) ? 'chosen' : ''}" aria-pressed="${ds.includes(i)}" title="${fmt(n.c)} cents · ${n.k} generators">${i}<small>${fmt(n.c, 1)}¢</small></button>`).join('')}</div><div class="panelactions"><button data-chord="play" ${ds.length ? '' : 'disabled'}>▶ Play chord</button><button data-chord="invert" ${ds.length > 1 ? '' : 'disabled'}>Next inversion</button><button data-chord="voicing" ${ds.length ? '' : 'disabled'}>Reset voicing</button><button data-chord="clear">Clear</button>${onHexboard ? `<button data-chord="hexboard" class="primary" ${ds.length > 1 ? '' : 'disabled'}>Show on HexBoard</button>` : ''}<button data-chord="pin" ${ds.length > 1 ? '' : 'disabled'}>Add chord to collection</button></div>
 ${
   ds.length
     ? `<div class="tablewrap"><table class="chord-notes"><thead><tr><th>Degree</th><th>Voiced cents</th><th>Generator coordinate</th><th>Period placement</th></tr></thead><tbody>${voiced()
         .map(
           v =>
             `<tr><td>${v.i}</td><td>${fmt(v.c, 3)}</td><td>${ns[v.i].k}</td><td><button data-chord="down" data-i="${v.i}" aria-label="Lower degree ${v.i} by one period">−</button> ${ui.octaves[0][v.i] || 0} <button data-chord="up" data-i="${v.i}" aria-label="Raise degree ${v.i} by one period">+</button></td></tr>`
         )
         .join('')}</tbody></table></div>`
     : ''
 }
 ${pair ? `<p class="chord-status ${analysis.qualified ? 'good' : 'dim'}">${analysis.covered}/${analysis.total} note pairs have ${ui.other ? 'a selected target' : 'a mapped target'} within tolerance.${analysis.qualified ? ` Worst pair error: ${fmt(analysis.max, 3)} ¢.` : ''}</p><label class="checklabel"><input type="checkbox" data-chord-field="all" ${ui.all ? 'checked' : ''}>Show all interpretations (mapped, alternative, outside subgroup)</label>${renderCoordinateAssessment(analysis)}${matrix(ds)}<p class="chord-caption">Intervals ascend within one period, regardless of voicing. M = mapped; A = alternative; O = outside subgroup. Pairwise labels are independent interpretations, not a claim that they form one JI chord.</p><h4>Occurrences of this generator shape · ${occurrences.length}</h4><p class="chord-caption">Same generator distances, transposed within this scale. Select an occurrence to highlight and hear it. In a stretched period, its target errors can differ.</p><div class="chord-occurrences">${occurrences.map(d => `<button data-chord="occurrence" data-degrees="${d.join(',')}" class="${d.join() === ds.join() ? 'chosen' : ''}">${d.join(' · ')}</button>`).join('')}</div>` : '<p class="empty">Select at least two notes to inspect their intervals.</p>'}
 </section><section class="chord-discovery"><div class="chord-controls"><label>Discover<select data-chord-field="size">${option(3, 'Triads · 3 notes', ui.size)}${option(4, 'Tetrads · 4 notes', ui.size)}</select></label><label class="checklabel"><input data-chord-field="other" type="checkbox" ${ui.other ? 'checked' : ''}>Include other approximations</label><button class="primary" data-chord="discover">Find chords</button></div><h3>Discovered chords</h3>${resultMarkup()}${ui.pins.length ? pinMarkup() : ''}</section></div></div>`;
  }
  function resultMarkup() {
    if (!results)
      return '<p>Choose search settings and press Find chords. Every note pair must match an allowed target within tolerance.</p>';
    const r = results.value;
    const scope = r.limited
      ? '<p class="notice">Partial search: a calculation bound was reached. Narrow the target set or tolerance.</p>'
      : '<p class="chord-caption">Complete search within this scale and the displayed target/tolerance settings.</p>';
    if (r.collision)
      return '<p class="notice">This scale has pitch collisions. Choose a smaller scale or another tuning before searching.</p>';
    if (!r.groups.length)
      return (
        scope +
        '<p class="empty">No chords found within the searched bounds. Try a wider tolerance, another target set, or include other approximations.</p>'
      );
    const start = page * 20;
    return `${scope}<p>${r.groups.length} generator shapes · ${r.count} qualifying occurrences. Sorted by smallest worst pair error, then RMS error. Scores refer to each shape’s best occurrence.</p><div class="chord-results">${r.groups
      .slice(start, start + 20)
      .map(
        (g, i) =>
          `<button data-chord="result" data-result="${start + i}"><b>Degrees ${g.best.degrees.join(' · ')}</b><span>Worst ${fmt(g.best.max, 3)} ¢ · ${g.best.mapped}/${g.best.total} best pair matches mapped</span><small>Generator shape ${g.shape.join(' · ')} · ${g.occurrences.length} qualifying occurrences</small></button>`
      )
      .join(
        ''
      )}</div><div class="panelactions"><button data-chord="previous" ${page ? '' : 'disabled'}>Previous</button><span>${page + 1} / ${Math.ceil(r.groups.length / 20)}</span><button data-chord="next" ${start + 20 < r.groups.length ? '' : 'disabled'}>Next</button></div>`;
  }
  function pinMarkup() {
    return `<h4>Pinned chords</h4>${ui.pins.length ? ui.pins.map((p, i) => `<div class="chord-pin"><button data-chord="load-pin" data-i="${i}">${esc(p.name)} · ${p.degrees.join(' · ')}</button><button data-chord="remove-pin" data-i="${i}" aria-label="Remove pinned chord">Remove</button></div>`).join('') : '<p>Pin a chord to revisit its exact temperament, tuning, scale and voicing. Pins are included in Save session.</p>'}`;
  }
  function click(b) {
    if (!b.dataset.chord) return false;
    syncJI();
    try {
      const act = b.dataset.chord,
        s = current(),
        ds = selected(),
        i = Number(b.dataset.i);
      if (act === 'browse' && onBrowseHarmony) {
        onBrowseHarmony();
        return true;
      }
      if (act === 'note') {
        if (ds.includes(i)) choose(ds.filter(d => d !== i));
        else {
          if (ds.length >= MAX_CHORD_TONES)
            throw Error(`Select at most ${MAX_CHORD_TONES} notes. Deselect one first.`);
          choose([...ds, i]);
        }
        play(voiced().map(v => v.c));
      }
      if (act === 'clear') choose([]);
      if (act === 'play') play(voiced().map(v => v.c));
      if (act === 'hexboard' && onHexboard) {
        onHexboard(
          chordCoordinates(s, ds, ui.octaves[0]),
          provenance || `From degrees ${ds.join(' · ')}`,
          {exact: !!provenance}
        );
        return true;
      }
      if (act === 'invert') {
        provenance = '';
        const notes = voiced();
        if (notes.length) {
          const bottom = notes[0].i,
            top = notes.at(-1).c,
            base = scale(s).notes[bottom].c;
          ui.octaves[0][bottom] = Math.floor((top - base) / s.p) + 1;
          const min = Math.min(...ds.map(d => ui.octaves[0][d] || 0));
          for (const d of ds) ui.octaves[0][d] = (ui.octaves[0][d] || 0) - min;
          play(voiced().map(v => v.c));
        }
      }
      if (act === 'voicing') {
        ui.octaves[0] = {};
        provenance = '';
      }
      if (act === 'up' || act === 'down') {
        ui.octaves[0][i] = Math.max(
          -10000,
          Math.min(10000, (ui.octaves[0][i] || 0) + (act === 'up' ? 1 : -1))
        );
        provenance = '';
        play(voiced().map(v => v.c));
      }
      if (act === 'interval') {
        const j = Number(b.dataset.j),
          ns = scale(s).notes,
          inspector = createCoordinateInspector(s, {
            limit: ui.limit,
            primeLimit: ui.primeLimit,
            tolerance: ui.tol,
            span: s.p
          }),
          p = inspector.pair(noteCoordinate(s, ns[i]), noteCoordinate(s, ns[j]), ns[j].c - ns[i].c);
        play([ns[i].c, ns[i].c + p.c]);
      }
      if (act === 'discover') {
        results = {
          signature: signature(),
          value: discoverScaleChords(s, ui.size, ui.limit, ui.tol, ui.other, ui.primeLimit)
        };
        page = 0;
      }
      if (act === 'result') {
        const g = results?.value.groups[Number(b.dataset.result)];
        if (g) {
          choose(g.best.degrees);
          play(voiced().map(v => v.c));
        }
      }
      if (act === 'occurrence') {
        choose(b.dataset.degrees.split(',').map(Number));
        play(voiced().map(v => v.c));
      }
      if (act === 'previous') page = Math.max(0, page - 1);
      if (act === 'next') page++;
      if (act === 'pin' && onCollect) {
        onCollect(
          s,
          chordCoordinates(s, ds, ui.octaves[0]),
          provenance || `${s.name} · degrees ${ds.join(' · ')}`,
          {exact: !!provenance}
        );
        return true;
      }
      if (act === 'pin') {
        if (ui.pins.length >= 24) throw Error('Use at most 24 pinned chords per session.');
        ui.pins.push({
          name: `${s.name}[${s.n}]`,
          state: structuredClone(s),
          degrees: [...ds],
          octaves: {...ui.octaves[0]}
        });
        notify('Chord pinned; Save session keeps it with your other settings.');
      }
      if (act === 'load-pin') {
        const p = ui.pins[i];
        if (p) {
          setState(structuredClone(p.state));
          choose(p.degrees);
          ui.octaves[0] = {...p.octaves};
          results = null;
          refresh(true);
          return true;
        }
      }
      if (act === 'remove-pin') ui.pins.splice(i, 1);
      refresh();
    } catch (e) {
      notify(e.message);
    }
    return true;
  }
  function change(el) {
    const field = el.dataset.chordField;
    if (!field) return false;
    if (field === 'other' || field === 'all') ui[field] = el.checked;
    else ui[field] = Number(el.value);
    ui.tol = Math.max(0, Math.min(100, ui.tol || 0));
    if (field !== 'all') {
      results = null;
      page = 0;
    }
    refresh();
    return true;
  }
  function restore(data, validate) {
    provenance = '';
    sourceKey = '';
    if (!data) {
      ui = {
        size: 3,
        limit: DEFAULT_ODD_LIMIT,
        primeLimit: null,
        tol: 10,
        other: true,
        all: false,
        selections: [[0, 6, 11]],
        octaves: [{}],
        pins: []
      };
      results = null;
      page = 0;
      return;
    }
    const validDegrees = d =>
      Array.isArray(d) &&
      d.length <= MAX_CHORD_TONES &&
      d.every(i => Number.isInteger(i) && i >= 0 && i < MAX_SCALE_SIZE);
    if (
      ![3, 4].includes(data.size) ||
      !Number.isInteger(data.limit) ||
      data.limit < 3 ||
      data.limit > 97 ||
      data.limit % 2 !== 1 ||
      !Number.isFinite(data.tol) ||
      data.tol < 0 ||
      data.tol > 100 ||
      !Array.isArray(data.selections) ||
      ![1, 2].includes(data.selections.length) ||
      !data.selections.every(validDegrees) ||
      !Array.isArray(data.pins) ||
      data.pins.length > 24
    )
      throw Error('Invalid saved chord workspace.');
    const jiLimits = validateJILimits({oddLimit: data.limit, primeLimit: data.primeLimit ?? null}),
      cleanOct = o =>
        Object.fromEntries(
          Object.entries(o || {}).filter(
            ([k, v]) =>
              /^\d+$/.test(k) &&
              Number(k) < MAX_SCALE_SIZE &&
              Number.isInteger(v) &&
              v >= -10000 &&
              v <= 10000
          )
        );
    const pins = data.pins.map(p => {
      validate(p.state);
      if (!validDegrees(p.degrees) || p.degrees.some(i => i >= p.state.n))
        throw Error('Invalid pinned chord.');
      return {...p, name: String(p.name).slice(0, 100), octaves: cleanOct(p.octaves)};
    });
    ui = {
      size: data.size,
      limit: data.limit,
      primeLimit: jiLimits.primeLimit,
      tol: data.tol,
      other: !!data.other,
      all: !!data.all,
      selections: [data.selections[0]],
      octaves: [cleanOct(Array.isArray(data.octaves) ? data.octaves[0] : {})],
      pins
    };
    const oldProvenance = Array.isArray(data.provenance) ? data.provenance[0] : data.provenance,
      oldSourceKey = Array.isArray(data.sourceKeys) ? data.sourceKeys[0] : data.sourceKey;
    if (
      oldProvenance !== undefined &&
      (typeof oldProvenance !== 'string' || oldProvenance.length > 100)
    )
      throw Error('Invalid saved chord source.');
    if (
      oldSourceKey !== undefined &&
      (typeof oldSourceKey !== 'string' || oldSourceKey.length > 5000)
    )
      throw Error('Invalid saved chord source.');
    provenance = oldProvenance || '';
    sourceKey = oldSourceKey || '';
    results = null;
    page = 0;
  }
  return {
    render,
    click,
    change,
    fromCoordinates,
    fromInterval: (i, j) => {
      choose([i, j]);
      results = null;
    },
    serialize: () => {
      syncJI();
      return {...structuredClone(ui), ...(provenance ? {provenance, sourceKey} : {})};
    },
    restore
  };
}
