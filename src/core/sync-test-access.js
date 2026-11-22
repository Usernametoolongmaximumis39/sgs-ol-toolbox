import { read } from '../shared/safe-read.js';

export const TEST_SYNC_ORIGIN = 'https://test-sync.3gs.xyz:8888';
// Official h5_officer: 国都护 31–34, 统帅 35–37, 大将军 38, 大司马 255.
const knownTestRank = level => (level >= 31 && level <= 38) || level === 255;

export function canUseSyncTest(game, accountId) {
  if (!accountId) return false;
  const self = read(() => game.getSelf());
  if (String(read(() => self.ClientId ?? self.clientId)) !== accountId) return false;
  const level = Number(read(() => self.OfficerLevel));
  if (!Number.isSafeInteger(level) || level < 1) return false;
  const config = read(() => game.getConfigData('h5_officer'));
  const rows = config?.root?.officer || config?.officer;
  if (!Array.isArray(rows)) return knownTestRank(level);
  const rowId = row => Number(row?.id ?? row?.ID);
  const minimum = rows.find(row => String(row?.bigName || '').trim() === '国都护');
  const current = rows.find(row => rowId(row) === level);
  const groupId = row => Number(row?.officerid ?? row?.Officerid);
  if (groupId(minimum) > 0 && groupId(current) > 0) return groupId(current) >= groupId(minimum);
  if (current && rowId(minimum) > 0) return level >= rowId(minimum);
  return knownTestRank(level);
}
