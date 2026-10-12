// Escape all dynamic HTML at the rendering boundary, including option values.
const entities = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};
export const esc = value => String(value).replace(/[&<>"']/g, char => entities[char]);
export const option = (value, label, current) =>
  `<option value="${esc(value)}" ${String(value) === String(current) ? 'selected' : ''}>${esc(label)}</option>`;
