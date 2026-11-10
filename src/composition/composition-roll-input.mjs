// Direct manipulation for the Compose piano roll: draw, select (click, Shift-click, box), move, copy,
// resize from either edge, velocity bars and drawing, ruler seek and loop, chord-lane drags, the
// hover readout and ghost note, and wheel zoom. Geometry comes from the rendered roll's data
// attributes; gestures preview in place without rebuilding the roll, and each finished gesture
// commits one undoable edit through the workspace (`ctl`). A cancelled gesture commits nothing.
import {makeEvent, allIds, updateEvent} from './composition-project.mjs';
import {normalizeGrid, snapTick, cellTicks, formatBeat} from './composition-grid.mjs';
import {velocityEvents} from './composition-edit.mjs';

const THRESHOLD = 4;

export function createRollInput({document: doc, ctl}) {
  let drag = null,
    ghost = null,
    zoomFactor = 1,
    zoomAnchor = null,
    zoomPending = false;
  const grid = () => normalizeGrid(ctl.ui.grid);
  const meter = () => ctl.project().meter;
  const snapping = event => grid().snap && !event.altKey;
  const snapAt = (event, tick, mode = 'nearest') =>
    snapTick(meter(), {...grid(), snap: snapping(event)}, tick, mode);
  // Shortest length a gesture leaves: one grid cell (or the note's own length if shorter), one tick unsnapped.
  const minLength = (event, start, length) =>
    snapping(event) ? Math.min(cellTicks(meter(), grid(), start), length ?? Infinity) : 1;
  const spanOf = el => Number(el?.closest?.('[data-comp-roll]')?.dataset.span) || 0;
  const rect = el => el?.getBoundingClientRect?.() ?? {left: 0, top: 0, width: 1, height: 1};
  const tickAt = (x, r, span) =>
    Math.max(0, Math.min(span, ((x - (r.left ?? 0)) / (r.width || 1)) * span));
  const pct = (t, span) => `${(100 * t) / span}%`;
  const all = selector => [...(doc.querySelectorAll?.(selector) ?? [])];
  const noteNodes = id => all(`.roll-note[data-event="${globalThis.CSS?.escape?.(id) ?? id}"]`);
  const rowList = () =>
    all('.roll-row-grid').map(el => [Number(el.dataset.a), Number(el.dataset.b)]);
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const setVel = (id, v) => {
    for (const el of [...all(`[data-vel-event="${id}"]`), ...noteNodes(id)])
      el.style?.setProperty?.('--vel', (v / 127).toFixed(3));
  };

  // ---- notes ----
  function startNote(event, node) {
    const clip = ctl.clip('melody'),
      id = node.dataset.event,
      e = clip.events.find(x => x.id === id),
      ui = ctl.ui;
    if (!e) return;
    if (event.shiftKey) {
      ctl.select([id], 'toggle');
      drag = {kind: 'none', id: event.pointerId, suppress: true};
      return;
    }
    if (!ui.selected.has(id)) ctl.select([id], 'replace');
    const handle = event.target.closest?.('[data-comp-resize]'),
      row = node.closest?.('.roll-row-grid');
    const events = clip.events.filter(x => ui.selected.has(x.id)),
      rows = rowList();
    const index = c => rows.findIndex(r => same(r, c));
    const indices = events.flatMap(x => x.tones.map(t => index(t.coordinate))).filter(i => i >= 0);
    drag = {
      kind: 'note',
      mode: handle ? (handle.dataset?.compResize === 'start' ? 'start' : 'end') : 'move',
      node,
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      span: spanOf(node),
      width: rect(row).width || 1,
      rowHeight: rect(row).height || 0,
      anchor: e,
      events,
      rows,
      fromRow: Number(row?.dataset.row),
      rowRange: indices.length
        ? [-Math.min(...indices), rows.length - 1 - Math.max(...indices)]
        : [0, 0],
      copy: !!(event.ctrlKey || event.metaKey),
      moved: false,
      dt: 0,
      delta: 0,
      rowDelta: 0,
      target: null,
      heard: e.tones[0]?.coordinate,
      nodes: []
    };
  }
  function moveNote(event, d) {
    const raw = ((event.clientX - d.x) / d.width) * d.span;
    if (!d.nodes.length) {
      const nodes = [
        d.node,
        ...d.events.filter(e => e.id !== d.anchor.id).flatMap(e => noteNodes(e.id))
      ];
      // A copy drags clones and leaves the originals in place.
      d.nodes =
        d.copy && d.mode === 'move'
          ? nodes.map(n => {
              const c = n.cloneNode?.(true);
              if (c) {
                c.classList.add('is-copy');
                n.parentElement?.appendChild(c);
                return c;
              }
              return n;
            })
          : nodes;
      for (const n of d.nodes) n.classList?.add('is-dragging');
    }
    if (d.mode === 'move') {
      const lowest = Math.min(...d.events.map(e => e.startTick));
      d.dt = Math.max(
        snapping(event)
          ? snapAt(event, d.anchor.startTick + raw) - d.anchor.startTick
          : Math.round(raw),
        -lowest
      );
      const over = doc
        .elementFromPoint?.(event.clientX, event.clientY)
        ?.closest?.('.roll-row-grid');
      if (over) {
        const to = Number(over.dataset.row);
        d.rowDelta =
          Number.isInteger(to) && Number.isInteger(d.fromRow)
            ? Math.max(d.rowRange[0], Math.min(d.rowRange[1], to - d.fromRow))
            : 0;
        d.target = [Number(over.dataset.a), Number(over.dataset.b)];
      }
      const pitch = moved(d, d.anchor.tones[0]?.coordinate, true);
      if (pitch && d.heard && !same(pitch, d.heard)) {
        d.heard = pitch;
        ctl.audition([pitch]);
      }
      const dy = d.rows.length && d.rowHeight ? d.rowDelta * d.rowHeight : event.clientY - d.y;
      for (const n of d.nodes)
        n.style.transform = `translate(${(d.dt / d.span) * d.width}px,${dy}px)`;
      return;
    }
    if (d.mode === 'end') {
      const end0 = d.anchor.startTick + d.anchor.durationTick;
      d.delta = (snapping(event) ? snapAt(event, end0 + raw) : Math.round(end0 + raw)) - end0;
    } else {
      const s0 = d.anchor.startTick;
      d.delta = (snapping(event) ? snapAt(event, s0 + raw) : Math.round(s0 + raw)) - s0;
    }
    d.lengths = new Map(d.events.map(e => [e.id, resized(event, d, e)]));
    d.event = event;
    for (const e of d.events) {
      const r = d.lengths.get(e.id);
      for (const n of e.id === d.anchor.id ? [d.node] : noteNodes(e.id)) {
        n.style.left = pct(r.startTick, d.span);
        n.style.width = pct(r.durationTick, d.span);
      }
    }
  }
  function resized(event, d, e) {
    const end = e.startTick + e.durationTick,
      min = minLength(event, e.startTick, e.durationTick);
    if (d.mode === 'end')
      return {startTick: e.startTick, durationTick: Math.max(min, e.durationTick + d.delta)};
    const start = Math.max(0, Math.min(e.startTick + d.delta, end - min));
    return {startTick: start, durationTick: end - start};
  }
  // A moved note's pitch: rows keep their order, so every selected note moves by the same number of rows.
  function moved(d, c, isAnchor) {
    if (!c) return c;
    if (d.rows.length && d.rowDelta) {
      const i = d.rows.findIndex(r => same(r, c));
      return i < 0 ? c : d.rows[i + d.rowDelta];
    }
    if (!d.rows.length && isAnchor && d.target) return d.target;
    return c;
  }
  function finishNote(d) {
    const p = ctl.project();
    if (d.mode === 'move') {
      const put = d.events.map(e => ({
        ...structuredClone(e),
        startTick: e.startTick + d.dt,
        tones: e.tones.map(t => ({...t, coordinate: moved(d, t.coordinate, e.id === d.anchor.id)}))
      }));
      const unchanged = put.every(
        (e, i) =>
          e.startTick === d.events[i].startTick &&
          e.tones.every((t, k) => same(t.coordinate, d.events[i].tones[k].coordinate))
      );
      if (unchanged) {
        ctl.refresh();
        return;
      }
      if (d.copy) {
        const taken = allIds(p);
        ctl.commitNotes(d.events.length > 1 ? 'Copy notes' : 'Copy melody note', {
          remove: [],
          put: put.map(e => makeEvent(e, taken))
        });
        return;
      }
      ctl.commitNotes(d.events.length > 1 ? 'Move notes' : 'Move melody note', {remove: [], put});
      return;
    }
    const put = d.events.map(e => ({...structuredClone(e), ...resized(d.event ?? {}, d, e)}));
    if (
      put.every(
        (e, i) =>
          e.startTick === d.events[i].startTick && e.durationTick === d.events[i].durationTick
      )
    ) {
      ctl.refresh();
      return;
    }
    ctl.commitNotes(d.events.length > 1 ? 'Resize notes' : 'Resize melody note', {remove: [], put});
  }

  // ---- drawing ----
  function startDraw(event, surface) {
    const row = surface.closest?.('.roll-row-grid'),
      span = spanOf(surface),
      r = rect(row);
    const raw = tickAt(event.clientX, r, span),
      start = Math.max(
        0,
        Math.min(snapAt(event, raw, 'floor'), snapAt(event, Math.max(0, span - 1), 'floor'))
      );
    const coordinate = [Number(surface.dataset.a), Number(surface.dataset.b)],
      length = ctl.defaultLength(start);
    hideGhost();
    const el = doc.createElement?.('span');
    if (el) {
      el.className = 'roll-note is-drawing';
      el.setAttribute('aria-hidden', 'true');
      el.style.left = pct(start, span);
      el.style.width = pct(length, span);
      row.appendChild(el);
    }
    drag = {
      kind: 'draw',
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start,
      coordinate,
      length,
      el,
      r,
      span,
      moved: false
    };
    ctl.audition([coordinate]);
  }
  function moveDraw(event, d) {
    const end = snapping(event)
      ? snapAt(event, tickAt(event.clientX, d.r, d.span))
      : Math.round(tickAt(event.clientX, d.r, d.span));
    d.length = Math.max(minLength(event, d.start), end - d.start);
    if (d.el) d.el.style.width = pct(d.length, d.span);
  }

  // ---- box selection ----
  function startMarquee(event) {
    const rows = doc.querySelector?.('[data-comp-rows]');
    if (!rows) return;
    drag = {
      kind: 'marquee',
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      rows,
      base: event.shiftKey ? new Set(ctl.ui.selected) : new Set(),
      hits: new Set(),
      moved: false,
      shift: event.shiftKey
    };
  }
  function moveMarquee(event, d) {
    const r = rect(d.rows),
      x0 = Math.min(d.x, event.clientX),
      x1 = Math.max(d.x, event.clientX),
      y0 = Math.min(d.y, event.clientY),
      y1 = Math.max(d.y, event.clientY);
    if (!d.box) {
      d.box = doc.createElement('span');
      d.box.className = 'roll-marquee';
      d.box.setAttribute('aria-hidden', 'true');
      d.rows.appendChild(d.box);
    }
    Object.assign(d.box.style, {
      left: `${x0 - r.left}px`,
      top: `${y0 - r.top}px`,
      width: `${x1 - x0}px`,
      height: `${y1 - y0}px`
    });
    d.hits = new Set();
    for (const n of all('.roll-note[data-event]')) {
      const b = rect(n),
        hit = b.left < x1 && b.left + b.width > x0 && b.top < y1 && b.top + b.height > y0;
      if (hit) d.hits.add(n.dataset.event);
      const on = hit || d.base.has(n.dataset.event);
      n.classList.toggle('is-selected', on);
      n.setAttribute?.('aria-pressed', String(on));
    }
  }

  // ---- velocity ----
  function startVelocity(event, lane, bar) {
    const r = rect(lane),
      events = ctl.clip('melody').events,
      value = y =>
        Math.max(1, Math.min(127, Math.round(1 + (1 - (y - r.top) / (r.height || 1)) * 126)));
    if (bar) {
      const id = bar.dataset.velEvent,
        e = events.find(x => x.id === id);
      if (!e) return;
      if (!ctl.ui.selected.has(id)) ctl.select([id], 'replace');
      drag = {
        kind: 'velocity',
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        anchor: e,
        targets: events.filter(x => ctl.ui.selected.has(x.id)),
        value,
        values: new Map(),
        moved: false
      };
      return;
    }
    const pool = ctl.ui.selected.size ? events.filter(x => ctl.ui.selected.has(x.id)) : events,
      span = spanOf(lane);
    drag = {
      kind: 'vpaint',
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      r,
      span,
      value,
      values: new Map(),
      pool,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: true
    };
    paintVelocity(event, drag);
  }
  function paintVelocity(event, d) {
    const xs = [d.lastX, event.clientX],
      lo = Math.min(...xs) - 3,
      hi = Math.max(...xs) + 3;
    for (const e of d.pool) {
      const x = d.r.left + (e.startTick / d.span) * d.r.width;
      if (x < lo || x > hi) continue;
      const f = event.clientX === d.lastX ? 1 : (x - d.lastX) / (event.clientX - d.lastX),
        y = d.lastY + (event.clientY - d.lastY) * Math.max(0, Math.min(1, f));
      const v = d.value(y);
      d.values.set(e.id, v);
      setVel(e.id, v);
    }
    d.lastX = event.clientX;
    d.lastY = event.clientY;
  }
  function finishVelocity(d) {
    if (!d.values.size) {
      ctl.refresh();
      return;
    }
    const events = ctl.clip('melody').events.filter(e => d.values.has(e.id));
    const put = events.map(e => velocityEvents([e], {value: d.values.get(e.id)}).put[0]);
    ctl.commitNotes(
      put.length > 1 ? 'Note velocities' : 'Note velocity',
      {remove: [], put},
      {select: false}
    );
  }

  // ---- ruler: seek, or drag a loop ----
  function startRuler(event, track) {
    const r = rect(track),
      span = spanOf(track);
    drag = {
      kind: 'ruler',
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      r,
      span,
      from: tickAt(event.clientX, r, span),
      moved: false,
      track
    };
  }
  function moveRuler(event, d) {
    const a = snapAt(event, d.from),
      b = snapAt(event, tickAt(event.clientX, d.r, d.span)),
      lo = Math.min(a, b);
    d.range = [lo, Math.max(Math.max(a, b), lo + minLength(event, lo))];
    let el = d.track.querySelector?.('[data-comp-loop]');
    if (!el && doc.createElement) {
      el = doc.createElement('span');
      el.className = 'roll-loop-range';
      el.setAttribute('data-comp-loop', '');
      el.setAttribute('aria-hidden', 'true');
      d.track.prepend?.(el);
    }
    if (el) {
      el.classList.remove('is-off');
      el.style.left = pct(d.range[0], d.span);
      el.style.width = pct(d.range[1] - d.range[0], d.span);
    }
    ctl.hover(`Loop ${formatBeat(meter(), d.range[0])} to ${formatBeat(meter(), d.range[1])}`);
  }

  // ---- chord lane: move along the lane, or resize from the right edge ----
  function startChord(event, block) {
    if (ctl.canEditChord?.() === false) return;
    const clip = ctl.chordOwner?.(block.dataset.event) ?? ctl.clip('chords');
    const e = clip.events.find(x => x.id === block.dataset.event);
    if (!e) return;
    drag = {
      kind: 'chord',
      clipId: clip.id,
      node: block,
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      span: spanOf(block),
      width: rect(block.parentElement).width || 1,
      resize: !!event.target.closest?.('[data-comp-resize]'),
      event: e,
      start: e.startTick,
      duration: e.durationTick,
      moved: false
    };
  }
  function moveChord(event, d) {
    const raw = ((event.clientX - d.x) / d.width) * d.span,
      e = d.event;
    if (d.resize) {
      const end0 = e.startTick + e.durationTick,
        end = snapping(event) ? snapAt(event, end0 + raw) : Math.round(end0 + raw);
      d.duration = Math.max(minLength(event, e.startTick, e.durationTick), end - e.startTick);
      d.node.style.width = pct(d.duration, d.span);
      return;
    }
    d.start = Math.max(
      0,
      snapping(event) ? snapAt(event, e.startTick + raw) : Math.round(e.startTick + raw)
    );
    d.node.style.transform = `translateX(${((d.start - e.startTick) / d.span) * d.width}px)`;
  }
  function finishChord(d) {
    if (d.resize ? d.duration === d.event.durationTick : d.start === d.event.startTick) {
      ctl.refresh();
      return;
    }
    ctl.ui.selectedChord = d.event.id;
    ctl.commit(d.resize ? 'Resize chord' : 'Move chord', pr =>
      updateEvent(
        pr,
        d.clipId,
        d.event.id,
        d.resize ? {durationTick: d.duration} : {startTick: d.start}
      )
    );
  }

  // ---- pointer routing ----
  function pointerDown(event) {
    if (event.button !== 0 || !ctl.project()) return;
    const t = event.target;
    if (t?.closest?.('[data-generated]')) return;
    const ruler = t?.closest?.('[data-comp-ruler]');
    if (ruler) {
      startRuler(event, ruler);
      return;
    }
    if (!ctl.canEdit()) return;
    const note = t?.closest?.('.roll-note');
    if (note) {
      startNote(event, note);
      return;
    }
    const chord = t?.closest?.('.chord-block');
    if (chord) {
      startChord(event, chord);
      return;
    }
    const lane = t?.closest?.('[data-comp-velocity]');
    if (lane) {
      event.preventDefault?.();
      startVelocity(event, lane, t.closest?.('[data-vel-event]'));
      return;
    }
    const surface = t?.closest?.('.roll-surface');
    if (surface) {
      event.preventDefault?.();
      if (ctl.ui.tool === 'select' || event.shiftKey) startMarquee(event);
      else startDraw(event, surface);
    }
  }
  function pointerMove(event) {
    const d = drag;
    if (!d) {
      hover(event);
      return;
    }
    if (d.id !== event.pointerId || d.kind === 'none') return;
    if (!d.moved) {
      if (Math.abs(event.clientX - d.x) + Math.abs(event.clientY - d.y) < THRESHOLD) return;
      d.moved = true;
    }
    event.preventDefault?.();
    if (d.kind === 'note') moveNote(event, d);
    else if (d.kind === 'draw') moveDraw(event, d);
    else if (d.kind === 'marquee') moveMarquee(event, d);
    else if (d.kind === 'velocity') {
      const delta = d.value(event.clientY) - d.anchor.velocity;
      for (const e of d.targets) {
        const v = Math.max(1, Math.min(127, e.velocity + delta));
        d.values.set(e.id, v);
        setVel(e.id, v);
      }
      ctl.hover(`Velocity ${Math.max(1, Math.min(127, d.anchor.velocity + delta))}`);
    } else if (d.kind === 'vpaint') paintVelocity(event, d);
    else if (d.kind === 'ruler') moveRuler(event, d);
    else if (d.kind === 'chord') moveChord(event, d);
  }
  function pointerUp(event) {
    const d = drag;
    if (!d || d.id !== event.pointerId) return;
    drag = null;
    if (event.type === 'pointercancel') {
      d.box?.remove?.();
      d.el?.remove?.();
      ctl.refresh();
      return;
    }
    // The click that follows a gesture must not run the pressed element's own action again.
    if (d.moved || d.suppress || d.kind === 'ruler' || d.kind === 'draw' || d.kind === 'marquee')
      ctl.suppressClick();
    if (d.kind === 'draw') {
      d.el?.remove?.();
      ctl.addNote(d.start, d.coordinate, d.length);
      return;
    }
    if (d.kind === 'marquee') {
      d.box?.remove?.();
      if (d.moved) ctl.select([...d.base, ...d.hits], 'replace');
      else if (!d.shift) ctl.select([], 'replace');
      return;
    }
    if (d.kind === 'ruler') {
      if (d.moved && d.range) ctl.setLoop(d.range[0], d.range[1]);
      else ctl.seek(snapAt(event, d.from));
      return;
    }
    if (!d.moved) return;
    if (d.kind === 'note') finishNote(d);
    else if (d.kind === 'velocity' || d.kind === 'vpaint') finishVelocity(d);
    else if (d.kind === 'chord') finishChord(d);
  }

  // ---- hover: pointer position, and where a click would draw ----
  function hideGhost() {
    ghost?.remove?.();
    ghost = null;
  }
  function hover(event) {
    const t = event.target,
      surface = t?.closest?.('.roll-surface'),
      note = t?.closest?.('.roll-note'),
      row = (surface ?? note)?.closest?.('.roll-row-grid');
    if (!row || !ctl.project()) {
      if (ghost) hideGhost();
      ctl.hover('');
      return;
    }
    const span = spanOf(row),
      raw = tickAt(event.clientX, rect(row), span),
      tick = snapAt(event, raw, 'floor');
    const coordinate = [Number(row.dataset.a), Number(row.dataset.b)];
    ctl.hover(
      `${ctl.rowName(coordinate)} · ${formatBeat(meter(), surface ? tick : Math.round(raw))}`
    );
    if (!surface || ctl.ui.tool === 'select' || !ctl.canEdit()) {
      if (ghost) hideGhost();
      return;
    }
    if (!ghost && doc.createElement) {
      ghost = doc.createElement('span');
      ghost.className = 'roll-ghost';
      ghost.setAttribute('aria-hidden', 'true');
    }
    if (!ghost) return;
    if (ghost.parentElement !== row) row.appendChild(ghost);
    ghost.style.left = pct(tick, span);
    ghost.style.width = pct(ctl.defaultLength(tick), span);
  }
  function pointerLeave(event) {
    if (!event.relatedTarget && !drag) {
      hideGhost();
      ctl.hover('');
    }
  }

  // ---- wheel: Ctrl/⌘ zooms time at the pointer, Alt changes the row height ----
  function wheel(event) {
    const scroll = event.target?.closest?.('.roll-scroll');
    if (!scroll || !ctl.project()) return;
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      zoomFactor *= Math.exp(-Math.max(-300, Math.min(300, event.deltaY)) * 0.002);
      zoomAnchor = event.clientX;
      if (!zoomPending) {
        zoomPending = true;
        ctl.frame(() => {
          zoomPending = false;
          const f = zoomFactor;
          zoomFactor = 1;
          ctl.zoomBy(f, zoomAnchor);
        });
      }
    } else if (event.altKey) {
      event.preventDefault();
      ctl.rowsBy(event.deltaY < 0 ? 2 : -2);
    }
  }

  return {
    pointerDown,
    pointerMove,
    pointerUp,
    pointerLeave,
    wheel,
    hideGhost,
    get dragging() {
      return drag !== null && drag.moved;
    }
  };
}
