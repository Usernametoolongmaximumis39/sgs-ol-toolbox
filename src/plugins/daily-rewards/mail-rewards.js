// Native gAt mail fields and Cm/Lm giftbag configuration; no window creation.
const read = fn => { try { return fn(); } catch { return undefined; } };
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const giftIndexes = new WeakMap();
export function mailRewardItems(adapter, mail) {
  const ids = read(() => mail.attachment.getStringKey('id'));
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000) return undefined;
  if (Number(mail.AttachmentType) === 2) {
    const counts = read(() => mail.attachment.getStringKey('ctn'));
    if (!Array.isArray(counts) || counts.length !== ids.length || !ids.every(positive) || !counts.every(positive)) return undefined;
    return ids.map((id, index) => ({ ItemID: Number(id), ItemNum: Number(counts[index]) }));
  }
  if (Number(mail.AttachmentType) !== 1 || ids.length !== 1 || !positive(ids[0])) return undefined;
  const config = read(() => adapter.config('gn_dbs_giftbag.sgs'));
  if (!config || typeof config !== 'object') return undefined;
  let index = giftIndexes.get(config);
  if (!index) {
    index = new Map();
    const source = config.giftsys || config.root?.giftsys;
    const rows = source?.gifts?.giftsItem?.Item;
    if (!Array.isArray(rows)) return undefined;
    for (const row of rows.slice(0, 20000)) if (positive(row?.giftID) && typeof row.dataInfo === 'string' && row.dataInfo.length <= 32000) {
      const numbers = row.dataInfo.match(/[0-9]+/g);
      if (!numbers?.length || numbers.length % 2 || numbers.length > 2000 || !numbers.every(positive)) continue;
      const items = [];
      for (let i = 0; i < numbers.length; i += 2) items.push({ ItemID: Number(numbers[i]), ItemNum: Number(numbers[i + 1]) });
      index.set(Number(row.giftID), items);
    }
    giftIndexes.set(config, index);
  }
  return index.get(Number(ids[0]));
}
