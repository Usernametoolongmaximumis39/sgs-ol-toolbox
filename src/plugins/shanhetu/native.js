import { isShanhe, MAP_SCENES, num } from './model.js';
import { shanheManager } from '../../shared/shanhe-manager.js';
const read = fn => { try { return fn(); } catch { return undefined; } };
const scalar = value => ['string', 'number', 'boolean'].includes(typeof value) ? value : null;
function fields(object, keys) { if (!object || typeof object !== 'object') return null; return Object.fromEntries(keys.map(key => [key, scalar(read(() => object[key]))])); }
function array(value, cap, map = scalar) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > cap) throw new Error('山河数据长度超出支持范围，等待重新同步');
  return value.map(map);
}
function projectEvent(raw, notification = false) {
  const event = fields(raw, ['eventId','eventType','isSelect']);
  if (!event) return null;
  event.EventData = array(read(() => notification ? raw.data : raw.EventData),32,row=>({...fields(row,['id','type','num']),
    subData:array(read(()=>row.subData),32,sub=>fields(sub,['id','type','num'])).filter(Boolean)}));
  event.loseData = array(read(()=>raw.loseData),32,row=>fields(row,['id','type','num'])).filter(Boolean);
  return event;
}
export function projectSnapshot(data, manager) {
  if (!data || typeof data !== 'object') return {};
  const seasonData = fields(read(() => data.seasonData), ['seasonId', 'roundId', 'difficulty', 'uniqueLogId', 'lastEnterTime']);
  const rawChapter = read(() => data.chapterData), rawGame = read(() => data.gameData), rawShop = read(() => data.shopData);
  const chapterData = fields(rawChapter, ['chapterId', 'day', 'accday', 'curLocation', 'endFlag']);
  if (chapterData) { chapterData.day ??= 0; chapterData.accday ??= 0; }
  if (chapterData) {
    Object.assign(chapterData, { locations: array(read(() => rawChapter.locations), 256, row => fields(row, ['location', 'event', 'appTime'])).filter(Boolean), alreadyFinishEvent: array(read(() => rawChapter.alreadyFinishEvent), 512) });
    const event = projectEvent(read(() => rawChapter.curEventData));
    if (event) chapterData.curEventData = event;
  }
  const gameData = fields(rawGame, ['money', 'accDamage', 'maxDamage', 'maxDealCard']);
  if (gameData) gameData.money ??= 0;
  if (gameData) Object.assign(gameData, { itemId: array(read(() => rawGame.itemId), 2048), itemListReady: Array.isArray(read(() => rawGame.itemId)), passChapter: array(read(() => rawGame.passChapter), 128),
    myGeneral: fields(read(() => rawGame.myGeneral), ['uGeneralId', 'uMaxHp', 'uInitHp', 'uInitCardNum', 'uArmor', 'uDrawNum', 'uExUseShaNum']),
    attrInfo: fields(read(() => rawGame.attrInfo), ['rep', 'tro', 'wis', 'mar', 'loy', 'sex', 'ass', 'cha']),
    seedData: { seedItem: array(read(() => rawGame.seedData.seedItem), 256, row => fields(row, ['type', 'attrType', 'goal', 'sub', 'value'])).filter(Boolean) } });
  const shopData = fields(rawShop, ['id', 'bShow', 'boughtIdx', 'exCurMoney', 'exMoney']);
  if (shopData) {
    Object.assign(shopData, { itemId: array(read(() => rawShop.itemId), 128), itemType: array(read(() => rawShop.itemType), 128) });
    // Optional protobuf counters default to zero within a received shop section.
    shopData.boughtIdx ??= 0; shopData.exCurMoney ??= 0;
    for (const key of ['spellMoney', 'equipMoney', 'cardMoney']) {
      shopData[key] = fields(read(() => rawShop[key]), ['exCurMoney', 'exMoney']) || {};
      shopData[key].exCurMoney ??= 0; shopData[key].exMoney ??= 0;
    }
  }
  const nativeShop = [];
  // Purchase replies can update the processed shop without replacing allDatas.
  const processedShop = read(() => manager.ShopData);
  const goods = read(() => processedShop.goodList);
  const shopOpen = read(() => processedShop.isShow);
  if (shopData && typeof shopOpen === 'boolean') shopData.bShow = shopOpen;
  for (const type of [2, 3, 4, 5]) {
    const entries = read(() => goods[type]);
    if (entries == null) continue;
    if (!Array.isArray(entries) || entries.length > 128) throw new Error('商店条目数量异常');
    for (const row of entries) nativeShop.push({ id: num(read(() => row.goodId)), type: num(read(() => row.goodType)), bought: typeof read(() => row.isBuyed) === 'boolean' ? row.isBuyed : null });
    const current = num(read(() => processedShop.CurExMoney[type]));
    if (shopData && current !== null) { if (type === 2) shopData.exCurMoney = current; else shopData[{ 3: 'spellMoney', 4: 'cardMoney', 5: 'equipMoney' }[type]].exCurMoney = current; }
  }
  return { seasonData, chapterData, gameData, shopData, nativeShop };
}
export function createNativeAdapter(ctx) {
  let notification = null;
  const scene = () => read(() => ctx.game.getScene()) || null;
  const sceneName = () => String(read(() => scene().SceneName) || read(() => scene().sceneName) || read(() => scene().name) || '');
  const account = () => String(read(() => ctx.game.getSelf()?.ClientId) || '');
  const manager = () => shanheManager(ctx.game);
  const runKey = data => JSON.stringify([account(), data?.seasonData?.seasonId, data?.seasonData?.roundId,
    data?.seasonData?.uniqueLogId, data?.seasonData?.lastEnterTime, data?.chapterData?.chapterId]);
  function snapshot(m = manager()) {
    const data = read(() => m.AllDatas), s = projectSnapshot(data, m), c = s.chapterData;
    if (notification) {
      if (notification.manager !== m || notification.run !== runKey(data)) notification = null;
      else {
        const node = c?.locations.find(n=>Number(n.location)===Number(c.curLocation));
        if (Number(c?.curLocation) !== notification.location || Number(node?.event) !== notification.nodeEvent
          || JSON.stringify(c?.curEventData) !== notification.priorEvent
          || (Number(c?.curEventData?.eventId)===Number(notification.event.eventId) && c.curEventData.isSelect)) notification = null;
        else c.curEventData = notification.event;
      }
    }
    return s;
  }
  function subscribe(m, fn) {
    if (typeof m?.on !== 'function' || typeof m?.off !== 'function') return () => {};
    const caller = {}, events = ['CLIENT_ROGUE_ALL_DATA_REP', 'CLIENT_ROGUE_GET_SHOPINFO_REP', 'CLIENT_ROGUE_BUY_SHOPITEM_REP', 'CLIENT_ROGUE_SEASON_OVER', 'CLIENT_ROGUE_SEASON_REP'];
    const handlers = events.map(event => [event, data => fn(event, data)]);
    for (const [event, handler] of handlers) m.on(event, caller, handler);
    // The client forwards live event choices separately; it does not write the
    // notification back to AllDatas. Reconnect uses curEventData instead.
    const onChoice = raw => {
      notification = null;
      try {
        const data = read(()=>m.AllDatas), c = data?.chapterData, event = projectEvent(raw,true);
        const node = c?.locations?.find(n=>Number(n.location)===Number(c.curLocation));
        if ((Number(event?.eventType)===2 && Number(node?.event)===Number(event.eventId))
            || (Number(event?.eventType)===4 && event.loseData.length && node))
          notification = {manager:m,run:runKey(data),location:Number(c.curLocation),nodeEvent:Number(node.event),
            priorEvent:JSON.stringify(projectEvent(c.curEventData) || undefined),event};
      } catch { /* A malformed notification cannot replace the bounded snapshot. */ }
      fn();
    };
    const clearChoice = () => { notification = null; fn(); };
    m.on('CLIENT_ROGUE_EVENT_SELECT_NTF',caller,onChoice);
    m.on('CLIENT_ROGUE_EVENT_SELECT_REP',caller,clearChoice);
    return () => {
      notification = null;
      for (const [event, handler] of handlers) m.off(event, caller, handler);
      m.off('CLIENT_ROGUE_EVENT_SELECT_NTF',caller,onChoice); m.off('CLIENT_ROGUE_EVENT_SELECT_REP',caller,clearChoice);
    };
  }
  function openShop() {
    if (!MAP_SCENES.has(sceneName())) throw new Error('请返回山河地图后打开商店');
    const ged = read(() => scene().ged);
    if (typeof read(() => ged.ShowWindowAfterCloseOther) !== 'function') throw new Error('当前客户端未提供兼容的商店打开接口；仍可查看商品预览');
    ged.ShowWindowAfterCloseOther('RogueJiShiWindow');
  }
  function request(mask) {
    const m = manager(); if (!m || !MAP_SCENES.has(sceneName())) throw new Error('山河管理器尚未就绪，请在地图中重试');
    m.RogueLikeDataReq(mask); return m;
  }
  return { scene, sceneName, account, manager, snapshot, subscribe, openShop, request, active: () => isShanhe(sceneName()) };
}

export { createMapLabels } from './map-labels-v2.js';
