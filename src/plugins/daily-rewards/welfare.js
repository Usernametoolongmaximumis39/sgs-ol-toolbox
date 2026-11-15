// Native welfare APIs, audited against the shipped client. No Xiaochao runtime.
const read = fn => { try { return fn(); } catch { return undefined; } };
const list = value => Array.isArray(value) ? value.slice(0, 4096) : [];
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const valid = adapter => !adapter.signal?.aborted && (!adapter.valid || adapter.valid());
export const managerSpecs = {
  WelfareManger: { events: ['ClientLotteryRep', 'decodeClientChopTreeInfoRep'], guard: value => typeof value.ReqJbpInfo === 'function' },
  NewPrivilegeCardManager: { events: ['decodeServerNewPrivilegeCardDataResp', 'decodeServerNewPrivilegeCardDailyRewardResp', 160119, 160121, 160122], guard: value => typeof value.IsCardActive === 'function' && typeof value.SendNewPrivilegeCardDailyRewardReq === 'function' },
  GuildManager: { events: ['ClientGuildInfoRep', 'ClientGuildMyGuildRep', 'ClientGuildDonateRep', 22517, 22529, 22553], guard: value => typeof value.SendGuildDonate === 'function' },
  GameGoodsManager: { events: ['DbsCcMovegoodsRep'], guard: value => typeof value.GetGoodsNumByBaseID === 'function' },
  GameShopManager: { events: ['CcGoodsPriceRep'], guard: value => typeof value.GetBuyMsg === 'function' },
  BlessManager: { events: ['ClientQifuRankRep'], guard: value => 'FreeBlessItemEnough' in value },
};

// Read-only refreshes are bounded and remove listeners on completion/abort.
function refresh(adapter, manager, method, event) {
  if (!manager || typeof manager[method] !== 'function' || !valid(adapter)) return Promise.resolve();
  return new Promise(resolve => {
    const caller = {}; let timer, finished = false;
    const finish = () => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      read(() => manager.off(event, caller, finish));
      adapter.signal?.removeEventListener('abort', finish); resolve();
    };
    if (typeof manager.on !== 'function' || typeof manager.off !== 'function') return resolve();
    manager.on(event, caller, finish);
    adapter.signal?.addEventListener('abort', finish, { once: true });
    timer = setTimeout(finish, 1600);
    if (!valid(adapter)) return finish();
    try { manager[method](); } catch { finish(); }
  });
}
export async function prepareWelfare(adapter, selected) {
  if (!selected.welfare || !valid(adapter)) return;
  const welfare = adapter.manager('WelfareManger'), cards = adapter.manager('NewPrivilegeCardManager');
  const files = [];
  if (welfare) files.push('ff_jubaopen.sgs', 'sys_gs_dbs_fs_goodsbaseinfo.sgs');
  if (welfare || cards) files.push('ff_dbs_pay_gift.sgs');
  await Promise.allSettled(files.map(file => valid(adapter) ? adapter.loadConfig?.(file) : null));
  if (!valid(adapter)) return;
  await Promise.allSettled([
    refresh(adapter, welfare, 'ReqJbpInfo', 'UPDATE_JBP_USER_INFO'),
    refresh(adapter, welfare, 'SendClientPrivilegeDataReq', 'UPDATE_PRIVILEGE_CARD_DATA'),
    refresh(adapter, welfare, 'PrivilegeCardDaliyRewardInfoReq', 'PRIVILEGE_DAILY_REWARD_UPDATE'),
    refresh(adapter, cards, 'SendNewPrivilegeCardDataReq', 'UPDATE_NEW_PRIVILEGE_CARD_DATA'),
  ]);
}

function rawGoods(adapter, id) {
  const root = read(() => adapter.config('sys_gs_dbs_fs_goodsbaseinfo.sgs').root);
  const abbreviations = list(root?.abbreviation?.field);
  const field = (row, name) => row?.[name] ?? row?.[abbreviations.find(item => item.Long === name)?.Short];
  const allGoods = root?.goodslist?.goods;
  const row = (Array.isArray(allGoods) ? allGoods.slice(0, 200000) : []).find(item => Number(field(item, 'ID')) === id);
  return row && { ID: Number(field(row, 'ID')), yuanbao: field(row, 'yuanbao'), tongqian: field(row, 'tongqian') };
}
function zeroPrice(adapter, id) {
  const row = rawGoods(adapter, id);
  return row && row.yuanbao !== undefined && row.tongqian !== undefined && Number(row.yuanbao) === 0 && Number(row.tongqian) === 0;
}
function treeBuyMessage(shop, id, price = 0) {
  // Native GetBuyMsg accepts an explicit price. Never use BuySingleItem/U,
  // which silently reads its own runtime price, or BuyBless, which spends Bless.
  const msg = shop.GetBuyMsg(id, 1, 100, 2, price);
  const goods = msg?.GoodsList;
  if (msg?.GoodsCount !== 1 || msg.BuyType !== 1 || !Array.isArray(goods) || goods.length !== 1) return null;
  const item = goods[0];
  if (Number(item.ItemID) !== id || item.ItemNum !== 1 || item.PriceYuanBao !== price || item.PriceTongQian !== 0 || item.Discount !== 100) return null;
  if (msg.UsingType !== 0 || msg.IsSelfBuy !== true || msg.CouponAGoodsID || msg.CouponBGoodsID || msg.CouponCGoodsID || msg.GuildID || msg.extraOperate || msg.UsingAfterBuy || item.PriceGlory || item.PriceGouYu || item.Bless || item.exchangeGoods || item.exchangeCount || item.bsub || item.pricetype) return null;
  return msg;
}

export function planWelfare(adapter, selected) {
  const actions = [], notes = [];
  if (!selected.welfare) return { actions, notes };
  const add = (key, label, manager, eligible, done, send, confirmations = [], metadata = {}) => {
    let sent = false;
    actions.push({ key: `welfare:${key}`, category: 'welfare', label, manager, eligible, ...metadata,
      skipAfter: key.startsWith('tree:') && key !== 'tree:claim' ? 'welfare:tree:claim' : undefined,
      done: () => sent && Boolean(read(done)),
      confirmations: confirmations.map(rule => ({ ...rule, accept: (...args) => sent && rule.accept(...args) })),
      rejections: metadata.rejections?.map(rule => ({ ...rule, accept: (...args) => sent && rule.accept(...args) })),
      send: () => { if (!valid(adapter) || !read(eligible)) return false; sent = true; return send(); },
    });
  };
  const welfare = adapter.manager('WelfareManger'), guild = adapter.manager('GuildManager');
  const cards = adapter.manager('NewPrivilegeCardManager');
  if (!welfare && !guild && !cards) notes.push('福利管理器尚未就绪');
  if (guild) {
    const remaining = Number(read(() => guild.LeftFreeDrumTimes)), guildId = read(() => guild.GuildID);
    const canDrum = () => guild.GuildID === guildId && guild.CanDrum === true && Number(guild.LeftFreeDrumTimes) === remaining;
    if (guildId && positive(remaining) && remaining <= 20 && canDrum()) add(`drum:${guildId}:${remaining}`, '公会免费敲鼓', guild, canDrum,
      () => guild.GuildID === guildId && Number(guild.LeftFreeDrumTimes) < remaining,
      () => guild.SendGuildDonate(), [], {
        // The free donate endpoint awards guild money/honor, not item bundles.
        rewards: [],
      });
  }
  if (welfare) {
    const tree = () => welfare.JbpUserData;
    const current = read(tree), count = Number(current?.Count), level = Number(current?.Level);
    const treeRows = list(read(() => adapter.config('ff_jubaopen.sgs').root.award));
    const itemId = Number(treeRows.find(row => Number(row.grade) === level)?.buyItem);
    const goods = adapter.manager('GameGoodsManager'), bless = adapter.manager('BlessManager'), shop = adapter.manager('GameShopManager');
    const itemCount = () => Number(read(() => goods.GetGoodsNumByBaseID(itemId)));
    const sameTree = status => tree()?.Status === status && Number(tree()?.Count) === count && Number(tree()?.Level) === level;
    const balanceReady = () => zeroPrice(adapter, itemId) || Number(read(() => adapter.self?.().TotalYuanBao)) >= 200;
    const enabledTree = () => bless?.FreeBlessItemEnough === true &&
      ((tree()?.Status === 1 && itemCount() >= 1) || balanceReady());
    const failure = (event, field) => {
      const packet = event?.Protocol?.Data?.ProtoObj;
      return Number.isInteger(packet?.[field]) && packet[field] > 0;
    };
    const reject = (event, field) => adapter.proxy?.() ? [{ manager: adapter.proxy(), event, accept: message => failure(message, field) }] : [];
    const price = () => {
        const goods = rawGoods(adapter, itemId);
        if (bless?.FreeBlessItemEnough !== true || !goods || Number(goods.tongqian) !== 0 || goods.tongqian === undefined) return null;
        if (zeroPrice(adapter, itemId)) return 0;
        const value = Number(goods.yuanbao), configured = Number(treeRows.find(row => Number(row.grade) === level)?.needMoney);
        return Number.isSafeInteger(value) && value > 0 && value <= 200 && value === configured &&
          balanceReady() ? value : null;
    };
    if (!current) notes.push('砍树信息尚未返回');
    else if (Number.isSafeInteger(count) && count >= 0 && count < 100 && positive(level)) {
      if (!enabledTree()) notes.push('发财树已跳过：需首充解锁且启动前至少200元宝');
      else if (current.Status === 0 && typeof welfare.ReqJbpTreeUsing === 'function') {
        add('tree:start', '砍发财树', welfare, () => sameTree(0) && enabledTree(),
          () => tree()?.Status === 1 || tree()?.Status === 2 || Number(tree()?.Count) > count,
          () => welfare.ReqJbpTreeUsing(), [], { rewards: [], maxRejectedAttempts: 3, rejections: reject('decodeClientChopTreeUsingRep', 'err') });
      } else if (current.Status === 1 && positive(itemId)) {
        if (tree()?.HasTriggerEvent === true) notes.push('发财树触发事件，请在游戏内处理事件后领取');
        else if (itemCount() >= 1 && typeof welfare.ReqJbpAwd === 'function') {
          const before = itemCount();
          let refreshed = false;
          let redUpdated = false;
          add('tree:claim', '捡起发财树元宝', welfare, () => sameTree(1) && enabledTree() && tree()?.HasTriggerEvent !== true && itemCount() >= 1,
            () => {
              const completed = itemCount() < before && (tree()?.Status !== 1 || Number(tree()?.Count) > count);
              if (completed && !redUpdated && valid(adapter)) {
                redUpdated = true;
                // Match the native window's daily-visit bookkeeping, then let
                // the hall recompute its node (remaining awards stay visible).
                read(() => welfare.SaveKanShuPhpData());
                if (valid(adapter)) read(() => welfare.event('KANSHU_DALIY_TIME_UPDATE'));
              }
              return completed;
            },
            () => welfare.ReqJbpAwd(itemId), [{ event: 'KANSHU_GET_AWARD', accept: () => {
              if (!refreshed && valid(adapter)) { refreshed = true; welfare.ReqJbpInfo(); }
              return false; // Anonymous success cannot identify the requested item.
            } }], { maxRejectedAttempts: 3, rejections: reject('decodeClientChopTreeRewardRep', 'error'), rewards: () => Array.isArray(tree()?.PeachList) ? list(tree().PeachList).flatMap(peach => list(peach?.info)).map(item => ({ ItemID: item.goodId, ItemNum: item.goodCnt })) : null });
        } else if (price() !== null && shop && typeof shop.GetBuyMsg === 'function' && typeof shop.proxy?.L === 'function') {
          const cost = price();
          add('tree:item', cost ? `获取砍树道具（${cost}元宝，每日限一次）` : '兑换免费砍树道具', shop,
            () => sameTree(1) && tree()?.HasTriggerEvent !== true && itemCount() === 0 && price() === cost, () => itemCount() > 0,
            () => { const msg = treeBuyMessage(shop, itemId, cost); if (!msg || price() !== cost || !sameTree(1)) return false; return shop.proxy.L(msg); }, [], { rewards: [] });
        } else notes.push('发财树道具、领取资格或费用未就绪，今日暂缓');
      } else if (current.Status === 1) notes.push('砍树等级对应的道具配置未就绪');
    }
    for (const type of [2, 3]) {
      const card = () => read(() => welfare.GetCardDataByType(type));
      const value = card();
      const rewards = [];
      if (value?.bActive && value.bReward && positive(value.rewardDays)) rewards.push({ day: Number(value.rewardDays), test: () => card()?.bActive && card()?.bReward && Number(card()?.rewardDays) === Number(value.rewardDays) });
      if (type === 3 && value?.bActive) list(read(() => value.AddAwardsCanAwardList())).slice(0, 4).forEach((available, index) => {
        if (available === true && positive(Number(value.days) + index + 1)) rewards.push({ day: Number(value.days) + index + 1, test: () => card()?.bActive && card()?.AddAwardsCanAwardList()?.[index] === true });
      });
      for (const reward of rewards) if (typeof welfare.SendClientPrivilegeRewardReq === 'function') add(`card:${type}:${reward.day}`, `${type === 2 ? '周' : '月'}卡奖励 ${reward.day}`, welfare, reward.test,
        () => card()?.HasGetAward?.(reward.day) === true,
        () => welfare.SendClientPrivilegeRewardReq(reward.day, type), [{ manager: welfare.proxy || adapter.proxy?.(), event: 'ClientPrivilegeRewardRep', accept: packet => {
          const response = packet?.Protocol;
          return response?.code === 0 && Number(response.type) === type && Number(response.rewardId) === reward.day;
        } }]);
      let refreshedSilver = false;
      if (read(() => welfare.CanShowPrivilegeDaliyReward(type)) === true && typeof welfare.PrivilegeCardDaliyRewardReq === 'function') add(`silver:${type}`, `${type === 2 ? '周' : '月'}卡每日银两`, welfare,
        () => welfare.CanShowPrivilegeDaliyReward(type) === true,
        () => welfare.CanShowPrivilegeDaliyReward(type) === false,
        () => welfare.PrivilegeCardDaliyRewardReq(type), [{ manager: welfare.proxy || adapter.proxy?.(), event: 'decodeClientGetWeekAndMonthSilverResp', accept: packet => {
          const response = packet?.Protocol?.Data?.ProtoObj;
          if (response && !response.result && !refreshedSilver && valid(adapter)) { refreshedSilver = true; welfare.PrivilegeCardDaliyRewardInfoReq?.(); }
          return false; // Response has no card type: require the specific card's state.
        } }]);
    }
  }
  if (cards) {
    const config = list(read(() => adapter.config('ff_dbs_pay_gift.sgs').root.new_card.new_card_content));
    if (!config.length) notes.push('新权益卡配置尚未就绪');
    for (const row of config.slice(0, 128)) {
      const id = Number(row.ID);
      if (!positive(id) || ![1, 2].includes(Number(row.type)) || Number(row.open) !== 1 || !row.reward_e) continue;
      const current = () => list(read(() => adapter.config('ff_dbs_pay_gift.sgs').root.new_card.new_card_content)).find(value => Number(value.ID) === id);
      const eligible = () => Number(current()?.open) === 1 && !!current()?.reward_e && cards.IsCardActive(id) === true && cards.IsClaimedToday(id) === false;
      const proxy = cards.proxy || adapter.proxy?.();
      const reply = packet => packet?.Protocol?.Data?.ProtoObj;
      const matches = packet => Number(reply(packet)?.card_id) === id;
      const events = ['decodeServerNewPrivilegeCardDailyRewardResp', 160121];
      if (read(eligible)) add(`new-card:${id}`, `新${Number(row.type) === 2 ? '周' : '月'}卡每日奖励`, cards, eligible,
        () => cards.IsClaimedToday(id) === true, () => cards.SendNewPrivilegeCardDailyRewardReq(id),
        [{ event: 'UPDATE_NEW_PRIVILEGE_CARD_DAILY_REWARD', accept: value => Number(Array.isArray(value) ? value[0] : value) === id },
          ...events.map(event => ({ manager: proxy, event, accept: packet => matches(packet) && reply(packet).result === 1 }))],
        { rewards: () => current()?.reward_e,
          rejections: events.map(event => ({ manager: proxy, event,
            accept: packet => matches(packet) && Number.isInteger(reply(packet)?.result) && reply(packet).result !== 1,
            text: packet => `新权益卡领取失败（游戏错误码 ${reply(packet).result}）` })) });
    }
  }
  return { actions, notes: notes.map(text => ({ category: 'welfare', text })) };
}
