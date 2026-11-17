export function userId(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d{1,10}$/.test(value))) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 && n <= 4294967295 ? String(n).padStart(10, '0') : null;
}
export function emptyRecord() { return { version: 1, pins: [], friends: {}, changes: [] }; }
export function normalizeRecord(value) {
  const r = emptyRecord();
  if (value?.version !== 1) return r;
  r.pins = [...new Set((Array.isArray(value.pins) ? value.pins : []).map(userId).filter(Boolean))].slice(0, 2000);
  for (const [id, entry] of Object.entries(value.friends && typeof value.friends === 'object' && !Array.isArray(value.friends) ? value.friends : {}).slice(0, 2000)) {
    const key = userId(id);
    if (key && typeof entry?.name === 'string' && entry.name.length <= 128) r.friends[key] = { name: entry.name, seenAt: Number(entry.seenAt) || 0, ...(entry.missingAt ? { missingAt: Number(entry.missingAt) || 0 } : {}) };
  }
  r.changes = (Array.isArray(value.changes) ? value.changes : []).filter(c => c && userId(c.id) && typeof c.from === 'string' && c.from.length <= 128 && typeof c.to === 'string' && c.to.length <= 128)
    .slice(-200).map(c => ({ id: userId(c.id), from: c.from, to: c.to, at: Number(c.at) || 0 }));
  return r;
}
export function captureFriends(record, friends, now = Date.now()) {
  const next = normalizeRecord(record), changes = [];
  for (const f of friends.slice(0, 2000)) {
    const id = userId(f.id), name = f.name;
    if (!id || typeof name !== 'string' || !name || name.length > 128) continue;
    const old = next.friends[id];
    if (old && old.name !== name) changes.push({ id, from: old.name, to: name, at: now });
    next.friends[id] = { name, seenAt: now };
  }
  next.friends = Object.fromEntries(Object.entries(next.friends).sort((a,b) => b[1].seenAt-a[1].seenAt).slice(0,2000));
  next.changes = [...next.changes, ...changes].slice(-200);
  return { record: next, changes };
}
export function pinnedFirst(items, pins, getId) {
  const wanted = new Set(pins);
  return items.map((item, i) => ({ item, i, pin: wanted.has(userId(getId(item))) })).sort((a,b) => Number(b.pin)-Number(a.pin) || a.i-b.i).map(x => x.item);
}
