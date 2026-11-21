import { EMPTY_LEDGER } from './sync-ledger-records.js';
import { cleanPreferences, PREFERENCE_GROUPS } from '../shared/sync-preferences.js';
import { validSyncCursor } from '../shared/sync-paths.js';

export function applySyncChangePage(history, after, { cursor, records, more }) {
  if (!validSyncCursor(cursor) || cursor.epoch !== after.epoch || cursor.seq < after.seq
    || !Array.isArray(records) || typeof more !== 'boolean'
    || (records.length ? cursor.seq - after.seq < records.length : more || cursor.seq !== after.seq)) {
    throw new Error('云端增量同步分页无效');
  }
  let ledger = history.ledger, events, matches;
  const preferences = {};
  const seen = new Set();
  for (const row of records) {
    if (!Array.isArray(row) || row.length !== 3 || typeof row[1] !== 'string'
      || row[2] !== null && (!row[2] || typeof row[2] !== 'object' || row[0] !== 'preferences' && Array.isArray(row[2]))) {
      throw new Error('云端增量记录格式无效');
    }
    const [kind, id, value] = row, key = kind + ':' + id;
    if (seen.has(key)) throw new Error('云端增量记录重复');
    seen.add(key);
    if (kind === 'match') {
      matches ??= new Map(history.matches.map(match => [match.gameId, match]));
      if (value === null) matches.delete(id);
      else matches.set(id, { ...value, gameId: id });
    } else if (kind === 'event') {
      events ??= new Map(history.ledger.events.map(event => [event.id, event]));
      if (value === null) events.delete(id);
      else events.set(id, { ...value, id });
    } else if (kind === 'ledger' && id === 'details' && (value === null || Array.isArray(value.balances))) {
      ledger = { ...(value ?? EMPTY_LEDGER), events: history.ledger.events, eventVersion: history.ledger.eventVersion };
    } else if (kind === 'preferences' && PREFERENCE_GROUPS.includes(id) && value !== null) preferences[id] = value;
    else throw new Error('云端增量记录类型无效');
  }
  // Each applied page can be consumed immediately by the ledger plugin. A server
  // ledger commit can span pages, so its original event version is insufficient here.
  if (events) ledger = { ...ledger, events: [...events.values()], eventVersion: globalThis.crypto.randomUUID() };
  return {
    history: { matches: matches ? [...matches.values()] : history.matches, ledger },
    preferences: cleanPreferences(preferences),
    updated: [...(matches ? ['matches'] : []), ...(ledger !== history.ledger ? ['ledger'] : [])],
  };
}
