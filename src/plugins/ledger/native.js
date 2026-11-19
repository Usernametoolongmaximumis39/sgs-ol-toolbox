import { account, read, manager, field, observeNative } from '../../shared/info-runtime.js';
import { integer } from './model.js';
const list = (value, limit = 4096) => {
  if (!Array.isArray(value)) return [];
  if (value.length > limit) throw new Error('账本消息超过安全上限');
  return value;
};
const number = value => value === undefined || value === null ? null : Number(value);
function projectInstance(row) {
  const id = number(read(() => row.ID)), base = number(read(() => row.BaseID)), count = number(read(() => row.Count));
  return integer(id) && id > 0 && integer(base) && base > 0 && integer(count) ? { id, base, count } : null;
}
export function createNative(ctx, consume, gap) {
  const goodsManager = () => manager(ctx, 'GameGoodsManager', 'DbsCcMovegoodsRep', m => typeof m.GetGoodsNumByBaseID === 'function');
  const blessManager = () => manager(ctx, 'NewBlessManager', 170138, m => typeof m.IsInDrawTime === 'function' && typeof m.GetInfoById === 'function') ||
    manager(ctx, 'NewBlessManager', 'decodeClientQiFuNewData', m => typeof m.IsInDrawTime === 'function');
  const inventoryComplete = () => read(() => goodsManager().selfBagFinished) === true;
  function snapshot() {
    const gm = goodsManager(), rows = read(() => gm.goodsList), complete = read(() => gm.selfBagFinished) === true;
    return { complete, instances: list(rows, 50000).map(projectInstance).filter(Boolean) };
  }
  // Numeric protobuf events use Protocol.Data.ProtoObj, unlike ordinary packets.
  function protobuf(packet) { return read(() => packet.Protocol.Data.ProtoObj) || read(() => packet.Data.ProtoObj) || field(packet, 'ProtoObj') || packet; }
  observeNative(ctx, {
    DbsCcUserGoodshintNtf: packet => ({ type: number(field(packet, 'Type')), giver: String(field(packet, 'GiverNickname') || '').slice(0, 100),
      items: list(field(packet, 'GoodsList')).map(row => ({ id: number(row.GoodsBaseID), delta: number(row.ChangeCount) })) }),
    DbsCcUserGoodslistRep: packet => ({ instances: list(field(packet, 'GoodsList')).map(projectInstance).filter(Boolean) }),
    DbsCcUpdategoodsAttribNtf: packet => ({ id: number(field(packet, 'GoodsID')), count: number(field(packet, 'Count')) }),
    DbsCcUserDelgoodsNtf: packet => ({ result: number(field(packet, 'Result')), ids: list(field(packet, 'DelList')).map(row => number(row.PropID)) }),
    DbsCUpdatauserYaunbaoNtf: packet => ({ delta: number(field(packet, 'ChangeYB')), why: number(field(packet, 'Why')) }),
    decodeClientSecretExploreRep: packet => { const p = protobuf(packet); return { secId: number(p.secId), times: number(p.times), result: Number(p.result || 0) }; },
    ClientLoginRep: packet => ({ id: String(field(packet, 'userID') || '') }),
  }, (type, data, sender) => consume(type, data, sender), gap);
  return {
    account: () => account(ctx), inventoryComplete, snapshot,
    count(id) { const gm = goodsManager(); if (read(() => gm.selfBagFinished) !== true) return null;
      const n = number(read(() => gm.GetGoodsNumByBaseID(id))); return integer(n) ? n : null; },
    yuanbao() { const self = read(() => ctx.game.getSelf()); const values = ['YuanBao', 'BindYuanBao', 'FreeLimitYuanBaoNum'].map(key => number(read(() => self[key])));
      if (!values.every(integer)) return null;
      const total = values.reduce((sum, value) => sum + value, 0); return integer(total) ? total : null; },
    knots(config, definitions = []) {
      const active = new Set(), rows = config?.root?.Common;
      const mgr = rows && blessManager();
      for (const row of mgr ? rows : []) if (read(() => mgr.IsInDrawTime(Number(row.Id))) === true && Number(row.exgoodsid) > 0) active.add(Number(row.exgoodsid));
      // Consecutive blessing weeks can leave an earlier, still valid knot in
      // the bag. Show it separately while any blessing week is drawing; never
      // expose old knots outside blessing weeks just because a balance remains.
      if (active.size) {
        const gm = goodsManager();
        for (const row of definitions.values()) if (row.name === '如意结') {
          const id = Number(row.ID), count = number(read(() => gm.GetGoodsNumByBaseID(id)));
          const owned = read(() => gm.GetGoodsByBaseID(id)), expiry = number(read(() => owned.Expirydate));
          const expired = expiry > 0 && expiry * 1000 <= Date.now();
          if (count > 0 && !expired) active.add(id);
        }
      }
      return { active, known: Boolean(mgr) };
    },
    icon(id, picId) {
      const gm = goodsManager(), item = read(() => gm.GetGoodsByBaseID(id));
      let url = read(() => item.baseInfo.ItemSmallIconUrl) || '';
      if (!url && Number(picId) > 0) {
        // Derive the current official CDN/root from a known owned item; roots
        // differ between client builds. Never guess a fixed release directory.
        for (const row of (read(() => gm.goodsList) || []).slice(0, 64)) {
          const known = String(read(() => row.baseInfo.ItemSmallIconUrl) || '');
          const match = /^(.*\/res\/(?:assets\/)?runtime\/(?:(?:pc|m)\/)?)/.exec(known);
          if (match) { url = `${match[1]}shop/${id === 100016 ? 'BigGiveBuy' : 'GiveBuy'}/${Number(picId)}.png`; break; }
        }
      }
      return url ? read(() => ctx.window.Laya.URL.formatURL(url)) || url : '';
    },
  };
}
