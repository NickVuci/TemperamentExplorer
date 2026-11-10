import {esc, option} from '../ui/ui.mjs';
import {layoutPresetForState, layoutPresetConfigKey, mappingKey} from './layout-preset-data.mjs';
import {builtinLayoutsFor} from './builtin-layouts.mjs';

// The Layout dropdown and the controls that name and save layouts. Saved layouts for the current
// mapping come first, then its built-in layout. A built-in layout can be saved as a copy but not
// updated, renamed, deleted or made the default; it is already used when no saved default exists.
// A layout record (with its fit to the state) is shown when the board matches it exactly.
const shows = (p, s, cfg) =>
  !!p &&
  !p.fit.error &&
  p.state.context.n === s.n &&
  p.state.context.mode === s.mode &&
  layoutPresetConfigKey(p.fit.config) === layoutPresetConfigKey(cfg);
/** The saved or built-in layout the board currently shows, or null for a custom layout. */
export function activeLayout(s, cfg, saved = {items: []}) {
  if (!s || !cfg?.savedLayoutId) return null;
  const record = [...saved.items, ...builtinLayoutsFor(s)].find(
    p => p.id === cfg.savedLayoutId && mappingKey(p.state.context) === mappingKey(s)
  );
  return record && shows({...record, fit: layoutPresetForState(record.state, s)}, s, cfg)
    ? record
    : null;
}
export function createLayoutChooser() {
  let nameDraft = null;
  function markup(s, cfg, saved = {items: [], status: 'idle'}, part = 'all') {
    if (!s) return '';
    const currentMapping = mappingKey(s),
      savedDefault = saved.defaults?.[currentMapping],
      withFit = list => list.map(p => ({...p, fit: layoutPresetForState(p.state, s)}));
    const presets = withFit(
      saved.items.filter(p => mappingKey(p.state.context) === currentMapping)
    ).sort(
      (a, b) =>
        Number(b.id === savedDefault) - Number(a.id === savedDefault) ||
        a.name.localeCompare(b.name)
    );
    const builtins = withFit(builtinLayoutsFor(s)),
      defaultId = presets.some(p => p.id === savedDefault) ? savedDefault : builtins[0]?.id;
    const editing = [...presets, ...builtins].find(p => p.id === cfg.savedLayoutId);
    const activeSaved = shows(editing, s, cfg);
    const owned = editing && !editing.builtin ? editing : null,
      nameChanged = !!owned && nameDraft !== null && nameDraft.trim() !== owned.name,
      isDefault = !!owned && savedDefault === owned.id,
      presetMatches = activeSaved && !!owned && !nameChanged;
    const value = activeSaved ? 'saved:' + editing.id : 'current',
      selectionLabel = activeSaved ? editing.name : 'Custom layout';
    const group = (label, list) =>
      list.length
        ? `<optgroup label="${label}">${list.map(p => `<option value="saved:${esc(p.id)}" ${value === 'saved:' + p.id ? 'selected' : ''} ${p.fit.error ? 'disabled' : ''}>${esc(p.name)}${p.id === defaultId ? ' · Default' : ''} · ${p.state.context.n} notes${p.fit.error ? ' · ' + esc(p.fit.error) : ''}</option>`).join('')}</optgroup>`
        : '';
    const chooser = `<section class="layout-recommendations" aria-label="Layout"><div class="layout-recommendation-heading"><label for="layout-recommendation-choice">Layout</label><span class="dim">${esc(selectionLabel)}</span></div><select id="layout-recommendation-choice" data-layout-choice aria-label="Layout">
  ${group('Saved layouts', presets)}${group('Built-in layouts', builtins)}${value === 'current' ? option('current', 'Custom layout · current settings', value) : ''}</select></section>`;
    const saveOpen = globalThis.document?.querySelector('.layout-save')?.open ? 'open' : '';
    const advanced = `<div class="layout-recommendation-options">
  <details class="layout-save" ${saveOpen}><summary>${owned ? 'Name / update saved layout' : 'Save and name this layout'}</summary><div class="layout-save-fields"><label>Layout name<input data-layout-name maxlength="80" value="${esc(nameDraft ?? owned?.name ?? '')}" placeholder="Name this layout" ${saved.busy ? 'disabled' : ''}></label><button data-hex-action="layout-save" ${saved.busy || saved.status !== 'ready' ? 'disabled' : ''}>${owned ? 'Update preset' : 'Save layout'}</button>${owned ? `<button data-hex-action="layout-save-new" ${saved.busy ? 'disabled' : ''}>Save as new</button><button data-hex-action="layout-default" ${saved.busy || saved.status !== 'ready' || (presetMatches && isDefault) ? 'disabled' : ''}>${isDefault ? (presetMatches ? 'Default for this temperament' : 'Save changes & keep default') : presetMatches ? 'Make default for this temperament' : 'Save changes & make default'}</button><button data-hex-action="layout-delete" ${saved.busy ? 'disabled' : ''}>Delete preset</button>` : ''}</div><p class="viewnote">${editing?.builtin ? 'Built-in layouts cannot be changed; saving makes your own copy. ' : ''}Remembers this target scale, mode and layout. Uses the current tuning when loaded.</p></details>
  ${saved.status === 'error' ? `<p class="notice" role="status">${esc(saved.error)} <button data-hex-action="layout-retry">Retry saved layouts</button></p>` : saved.error ? `<p role="status">${esc(saved.error)}</p>` : saved.status === 'loading' ? '<p class="viewnote">Loading saved layouts…</p>' : ''}</div>`;
    return part === 'chooser' ? chooser : part === 'advanced' ? advanced : chooser + advanced;
  }
  return {
    markup,
    input: el => {
      if (el.dataset.layoutName === undefined) return false;
      nameDraft = el.value;
      return true;
    },
    name: fallback => nameDraft ?? fallback ?? '',
    clearName: () => {
      nameDraft = null;
    },
    reset: () => {
      nameDraft = null;
    }
  };
}
