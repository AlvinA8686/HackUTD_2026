import { ValidationError } from './risk.js';

// RFC 4180-style CSV: quoted commas, escaped quotes, embedded newlines and BOM.
export function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false, afterQuote = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; afterQuote = true; } }
      else cell += c;
    } else if (c === '"') {
      if (cell || afterQuote) throw new ValidationError(['Malformed CSV quoting.']);
      quoted = true;
    } else if (c === ',') { row.push(cell); cell = ''; afterQuote = false; }
    else if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); if (row.some(v => v.trim() !== '')) rows.push(row);
      row = []; cell = ''; afterQuote = false;
    } else {
      if (afterQuote && !/\s/.test(c)) throw new ValidationError(['Unexpected characters after a quoted CSV cell.']);
      if (!afterQuote) cell += c;
    }
  }
  if (quoted) throw new ValidationError(['CSV contains an unclosed quoted value.']);
  if (cell || row.length) { row.push(cell); if (row.some(v => v.trim() !== '')) rows.push(row); }
  if (rows.length < 2) throw new ValidationError(['CSV must include a header and at least one building.']);
  const headers = rows.shift().map(s => s.trim());
  if (new Set(headers).size !== headers.length || headers.some(h => !h || ['__proto__', 'prototype', 'constructor'].includes(h))) throw new ValidationError(['CSV headers must be unique, non-empty field names.']);
  return rows.map((r, i) => {
    if (r.length !== headers.length) throw new ValidationError([`CSV row ${i + 2} has ${r.length} cells; expected ${headers.length}.`]);
    return Object.fromEntries(headers.map((h, j) => [h, r[j].trim()]));
  });
}

export function parseJSON(text) {
  let data;
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new ValidationError(['The JSON file is not valid JSON.']); }
  const buildings = Array.isArray(data) ? data : data && typeof data === 'object' ? data.buildings : undefined;
  if (!Array.isArray(buildings)) throw new ValidationError(['JSON must be a building array or an object with a buildings array.']);
  return buildings;
}
