export const LAMP_PACKET_LIMIT = 10000;

export function validLampRows(rows) {
  return !rows.some(row => !Number.isSafeInteger(row?.ID) || row.ID <= 0 ||
    !Number.isFinite(row.EndTime) || !Number.isFinite(row.GoodsID));
}

// Preserve packet ordering and duplicates. Query owners combine the chunks.
export function ownedLampIds(rows) {
  return rows.filter(row => row.EndTime <= 0 && row.GoodsID > 0).map(row => row.ID);
}
