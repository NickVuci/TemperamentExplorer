// Escape all dynamic HTML at the rendering boundary, including option values.
const entities = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
export const esc = value => String(value).replace(/[&<>"']/g, char => entities[char]);
/** An integer with an explicit sign when positive, e.g. the register offset "+1". */
export const signedInteger = n => `${n > 0 ? '+' : ''}${n}`;
/** A nonzero register offset as a superscript; nothing for register 0. */
export const registerSup = r => (r ? `<sup>${signedInteger(r)}</sup>` : '');
export const option = (value, label, current) =>
  `<option value="${esc(value)}" ${String(value) === String(current) ? 'selected' : ''}>${esc(label)}</option>`;
