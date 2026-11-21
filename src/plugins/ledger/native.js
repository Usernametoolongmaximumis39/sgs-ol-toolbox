import { read, field } from '../../shared/info-runtime.js';
import { integer } from './model.js';
const list = (value, limit = 4096) => {
  if (!Array.isArray(value)) return [];
  if (value.length > limit) throw new Error('账本消息超过安全上限');
  return value;
};
const number = value => value === undefined || value === null ? null : Number(value);
function drawEnd(value) {
  const end = typeof value === 'string' ? value.split(',')[1] : null;
  const date = /^(\d{4})(\d{2})(\d{2}).(\d{2})(\d{2})(\d{2})$/.exec(end ?? '');
  return date ? Date.parse(`${date[1]}-${date[2]}-${date[3]}T${date[4]}:${date[5]}:${date[6]}+08:00`) : NaN;
}
function projectInstance(row) {
  const id = number(read(() => row.ID)), base = number(read(() => row.BaseID)), count = number(read(() => row.Count));
  return integer(id) && id > 0 && integer(base) && base > 0 && integer(count) ? { id, base, count } : null;
}
export function createNative(ctx, consume, gap) {
  const goodsManager = () => ctx.native.manager('GameGoodsManager', 'DbsCcMovegoodsRep', m => typeof m.GetGoodsNumByBaseID === 'function');
  const blessManager = () => ctx.native.manager('NewBlessManager', 170138, m => typeof m.IsInDrawTime === 'function' && typeof m.GetInfoById === 'function') ||
    ctx.native.manager('NewBlessManager', 'decodeClientQiFuNewData', m => typeof m.IsInDrawTime === 'function');
  const inventoryComplete = () => read(() => goodsManager().selfBagFinished) === true;
  function snapshot() {
    const gm = goodsManager(), rows = read(() => gm.goodsList), complete = read(() => gm.selfBagFinished) === true;
    return { complete, instances: list(rows, 50000).map(projectInstance).filter(Boolean) };
  }
  // Numeric protobuf events use Protocol.Data.ProtoObj, unlike ordinary packets.
  function protobuf(packet) { return read(() => packet.Protocol.Data.ProtoObj) || read(() => packet.Data.ProtoObj) || field(packet, 'ProtoObj') || packet; }
  ctx.native.observe({
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
    account: () => ctx.native.account(), inventoryComplete, snapshot,
    count(id) { const gm = goodsManager(); if (read(() => gm.selfBagFinished) !== true) return null;
      const n = number(read(() => gm.GetGoodsNumByBaseID(id))); return integer(n) ? n : null; },
    yuanbao() { const self = read(() => ctx.game.getSelf()); const values = ['YuanBao', 'BindYuanBao', 'FreeLimitYuanBaoNum'].map(key => number(read(() => self[key])));
      if (!values.every(integer)) return null;
      const total = values.reduce((sum, value) => sum + value, 0); return integer(total) ? total : null; },
    knots(config) {
      const active = new Set(), expires = new Map(), rows = config?.root?.Common;
      const mgr = Array.isArray(rows) && blessManager();
      if (!mgr) return { active, expires, known: false, confirmed: false };
      const gm = goodsManager(), now = Date.now();
      const timer = ctx.native.manager('TimerManager', 'ClientPingMsg', m => Number.isFinite(m.LocalStaticServerTime));
      const gameNow = read(() => timer.LocalStaticServerTime);
      let confirmed = false;
      for (const row of rows) {
        const activity = Number(row.Id), id = Number(row.exgoodsid);
        if (!integer(id) || id <= 0) continue;
        const end = drawEnd(read(() => mgr.GetInfoById(activity).duration3));
        if (Number.isFinite(end)) confirmed = true;
        if (read(() => mgr.IsInDrawTime(activity)) !== true) continue;
        const owned = read(() => gm.GetGoodsListByBaseID(id));
        const inventory = Array.isArray(owned) ? owned : [read(() => gm.GetGoodsByBaseID(id))];
        let itemEnd = Infinity;
        for (const item of inventory) {
          const expiry = number(read(() => item.Expirydate));
          if (expiry > 0) itemEnd = Math.min(itemEnd, expiry * 1000);
        }
        if (itemEnd <= now) continue;
        active.add(id);
        const clockOffset = Math.floor(now / 1000) * 1000 - gameNow * 1000;
        const drawDeadline = end + 1000 + (Math.abs(clockOffset) > 30000 ? clockOffset : 0);
        if (drawDeadline > now) expires.set(id, Math.max(expires.get(id) || 0, Math.min(drawDeadline, itemEnd)));
      }
      return { active, expires, known: true, confirmed };
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
