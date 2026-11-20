function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asText(value) {
  if (typeof value === 'string') return value.split('####').join('\n');
  return typeof value === 'number' ? String(value) : '';
}

function httpsLink(value) {
  if (typeof value !== 'string') return '';
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch { /* Treat malformed links as plain text. */ }
  return '';
}

export function normalizeReport(report) {
  const invalid = () => new Error('观星站返回的报表格式有变化');
  if (!isRecord(report) || !Array.isArray(report.sections)) throw invalid();
  const sections = report.sections.map(section => {
    if (!isRecord(section) || typeof section.title !== 'string' || !section.title.trim()) throw invalid();
    const { title, kind, columns, rows, items } = section;
    if (kind === 'skins' && Array.isArray(items) && items.every(isRecord)) {
      return { kind, title, items: items.map(item => ({ name: asText(item.name), url: httpsLink(item.full) })) };
    }
    if (kind !== 'table' || !Array.isArray(columns) || !columns.length || !columns.every(key => typeof key === 'string')
        || !Array.isArray(rows) || !rows.every(isRecord)) throw invalid();
    return { kind, title, columns, rows: rows.map(row => columns.map(key =>
      Object.prototype.hasOwnProperty.call(row, key) ? asText(row[key]) : '')) };
  });
  return { updatedAt: asText(report.updatedAt), sections };
}

export function findEntries(sections, sectionIndex, query) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = text => words.every(word => text.toLowerCase().includes(word));
  const selected = sectionIndex === -1 ? sections : sections.slice(sectionIndex, sectionIndex + 1);
  if (!words.length) return selected;
  return selected.flatMap(section => {
    const { title, kind } = section;
    if (kind === 'skins') {
      const items = section.items.filter(item => matches(`${title} ${item.name}`));
      return items.length ? [{ ...section, items }] : [];
    }
    const rows = section.rows.filter(row => matches(`${title} ${row.join(' ')}`));
    return rows.length ? [{ ...section, rows }] : [];
  });
}
