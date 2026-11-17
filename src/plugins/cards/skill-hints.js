// Read-only, bounded calculations over observed cards. No native game actions.
const SUITS = ['', '♥', '♦', '♠', '♣'];
const TARGET_TRICKS = /^(无中生有|洞烛先机|顺手牵羊|过河拆桥|逐近弃远|决斗|南蛮入侵|万箭齐发|出其不意|水淹七军|随机应变|洪荒之力|同舟共济|力争上游|移花接木)$/;
const OTHER_TRICKS = /^(五谷丰登|桃园结义|火攻|借刀杀人|撒豆成兵)$/;
const GROUPS = Object.freeze({
  yanxi: { title: '宴戏', ids: [7016, 7017], names: ['识人', '宴戏'] },
  luanji: { title: '乱击', ids: [102, 891, 2143, 14162], names: ['乱击', '界乱击'] },
  guhuo: { title: '蛊惑', ids: [81, 469, 884], names: ['蛊惑', '界蛊惑'] },
  yanjiao: { title: '严教', ids: [945], names: ['严教'] },
  mizhu: { title: '资援', ids: [291], names: ['资援', '界资援'] },
  chengxiang: { title: '称象', ids: [441, 3492], names: ['称象', '界称象'] },
  yicheng: { title: '易城', ids: [3440], names: ['易城'] },
  shuangxiong: { title: '双雄', ids: [101, 3269, 14169], names: ['双雄'] },
  jizhan: { title: '吉占', ids: [3033], names: ['吉占'] },
  hezhong: { title: '和衷', ids: [3329], names: ['和衷'] },
  duanzao: { title: '锻造', ids: [11003], names: ['神工', '锻造'] },
  quandao: { title: '权道', ids: [3140, 3184], names: ['权道'] },
  xiasheng: { title: '夏晟', ids: [4007], names: ['夏晟'] },
  jiaoyu: { title: '椒遇', ids: [3571], names: ['椒遇'] },
});
const idList = value => Array.isArray(value) && value.length <= 200 && value.every(id => Number.isInteger(id) && id > 0 && id < 65535) && new Set(value).size === value.length ? value.slice() : null;
const seat = value => Number.isInteger(value) && value >= 0 && value < 255;
const ownCards = (state, kind) => Object.values(state.cards || {}).filter(card => card.locations?.length === 1 && card.locations[0] === `${kind}:${state.selfSeatId}`).map(card => card.id);
const identity = state => `${state.sessionId}:${state.deckStartSeq}`;

/** Call after normalization and before ordinary event handling; reducers remain pure. */
export function reduceSkillHints(state, data, seq, type) {
  if (!state || !data || data.isSend) return;
  if (['toolbox:gap', 'MsgReconnectGame', 'MsgGameOver', 'ClientLeavetableRep', 'ClientLoginRep'].includes(type)) { delete state.hintContext; return; }
  let context = state.hintContext;
  if (!context || context.identity !== identity(state)) context = state.hintContext = { identity: identity(state), turn: state.turn, windows: {}, luanji: [] };
  if (context.turn !== state.turn || type === 'MsgGameTurnNtf' || type === 'GsCGamephaseNtf' && Number(data.Round) === 0) {
    context.turn = state.turn; context.windows = {}; context.luanji = [];
  }
  const skill = Number(data.SpellID), ids = idList(data.CardIDs), params = idList(data.Params);
  const save = (key, cards, extra = {}) => {
    if (cards?.length) context.windows[key] = { ids: cards.slice(), seq, ...extra };
    else delete context.windows[key];
  };
  if (type === 'PubGsCUseSpell' && skill === 2143 && Number(data.SeatID) === state.selfSeatId && ids) context.luanji = [...new Set([...context.luanji, ...ids])].slice(-200);
  if (type === 'GsCRoleOptTargetNtf') {
    const param = Number(data.Param), opt = Number(data.Type);
    if ([7016, 7017].includes(skill) && Number(data.SrcSeatID) === state.selfSeatId && params?.length === 3 && seat(param)) save('yanxi', params, { target: param });
    if (skill === 945 && param === 0 && opt === 28) save('yanjiao', params || ids);
    if (skill === 3440 && param === 0 && Number(data.SeatID) === state.selfSeatId) save('yicheng', opt === 28 ? params : null);
    if (skill === 11003 && param === 0 && Number(data.SrcSeatID) !== state.selfSeatId && opt === 28) save('duanzao', params);
  }
  if (type === 'PubGsCMoveCard') {
    const count = Number(data.CardCount);
    if ([441, 3492].includes(skill) && Number(data.ToZone) === 8 && Number(data.MoveType) === 6) save('chengxiang', ids?.length === count ? ids : null, { skill });
    if (skill === 3033 && Number(data.FromZone) === 1 && Number(data.ToZone) === 8) save('jizhan', ids?.length === 1 && count === 1 ? ids : null);
    if (skill === 3329 && Number(data.FromID) === state.currentSeatId && ids?.length === count) save('hezhong', ids.slice(0, 1));
    if (skill === 3571 && Number(data.FromZone) === 3 && Number(data.ToZone) === 8 && Number(data.MoveType) === 6 && ids?.length === count && seat(Number(data.SrcSeatID))) {
      const old = context.windows.jiaoyu;
      save('jiaoyu', [...new Set([...(old?.caster === Number(data.SrcSeatID) ? old.ids : []), ...ids])], { caster: Number(data.SrcSeatID) });
    }
    // Window candidates stop being current as soon as the game moves those cards.
    for (const key of ['yanjiao', 'yicheng', 'duanzao', 'chengxiang']) {
      const current = context.windows[key];
      if (current && current.seq !== seq && ids?.some(id => current.ids.includes(id))) delete context.windows[key];
    }
  }
}

function subsetSum(cards, getMeta, target = 13) {
  const dp = new Map([[0, []]]);
  for (const id of cards) {
    const n = getMeta(id).number;
    for (const [sum, choice] of [...dp].sort((a, b) => b[0] - a[0])) {
      if (sum + n <= target && (!dp.has(sum + n) || dp.get(sum + n).length < choice.length + 1)) dp.set(sum + n, [...choice, id]);
    }
  }
  return dp;
}

function subsetChoices(cards, getMeta, target = 13, limit = 15) {
  const dp = new Map([[0, [[]]]]);
  for (const id of cards) {
    const point = getMeta(id).number;
    for (const [total, choices] of [...dp].sort((a,b) => b[0]-a[0])) {
      if (total + point > target) continue;
      const next = [...(dp.get(total + point) || []), ...choices.map(choice => [...choice, id])];
      next.sort((a,b) => b.length-a.length || a.join(',').localeCompare(b.join(',')));
      dp.set(total + point, next.slice(0, limit));
    }
  }
  return dp.get(target) || [];
}

// At most 32 cards * 833 signed sums, never enumerate 3^N partitions.
function equalPartition(cards, getMeta) {
  let dp = new Map([[0, { left: [], right: [] }]]);
  for (const id of cards) {
    const next = new Map(dp), n = getMeta(id).number;
    for (const [difference, choice] of dp) {
      for (const side of ['left', 'right']) {
        const key = difference + (side === 'left' ? n : -n), candidate = { ...choice, [side]: [...choice[side], id] };
        const old = next.get(key);
        if (!old || candidate.left.length + candidate.right.length > old.left.length + old.right.length) next.set(key, candidate);
      }
    }
    dp = next;
  }
  const best = dp.get(0);
  return best?.left.length && best?.right.length ? best : null;
}

function combinations(cards, count, cap = 512) {
  const result = [];
  function walk(start, chosen) {
    if (result.length >= cap) return;
    if (chosen.length === count) { result.push(chosen.slice()); return; }
    for (let index = start; index <= cards.length - count + chosen.length && result.length < cap; index++) walk(index + 1, [...chosen, cards[index]]);
  }
  walk(0, []); return result;
}

/** Only explicit observed identities or the caller's own hand may enter calculations. */
export function skillHints(state, options = {}) {
  if (!state?.active) return [];
  const getMeta = id => {
    const value = options.getMeta?.(id) || {};
    return { ...value, name: String(value.name || `牌${id}`), suit: Number(value.suit) || 0, number: Number(value.number) || 0, type: Number(value.type) || 0 };
  };
  const skills = Array.from(options.skills || []), numeric = new Set(skills.map(value => Number(typeof value === 'object' ? value.SkillId ?? value.id : value))), names = new Set(skills.map(value => String(typeof value === 'object' ? value.name ?? value.Name ?? '' : value)));
  const has = key => Boolean(windows[key]) || GROUPS[key].ids.some(id => numeric.has(id)) || GROUPS[key].names.some(name => names.has(name));
  const context = state.hintContext?.identity === identity(state) ? state.hintContext : { windows: {}, luanji: [] };
  const windows = context.windows || {};
  const hand = idList(options.selfHand) || ownCards(state, 5), equipment = idList(options.selfEquipment) || ownCards(state, 6);
  const handLabel = Number(state.zones?.[`5:${state.selfSeatId}`]?.count) > hand.length ? '已知手牌' : '手牌';
  const pointsKnown = cards => cards.length <= 32 && cards.every(id => getMeta(id).number >= 1 && getMeta(id).number <= 13);
  const colour = cards => cards.reduce((sum, id) => { const s = getMeta(id).suit; if (s === 1 || s === 2) sum.red++; else if (s === 3 || s === 4) sum.black++; else sum.unknown++; return sum; }, { red: 0, black: 0, unknown: 0 });
  const format = cards => cards.map(id => `${getMeta(id).name}${getMeta(id).number || '?'}`).join('、');
  const sum = cards => cards.reduce((total, id) => total + getMeta(id).number, 0);
  const rows = [], add = (id, text, extra = {}) => rows.push({ id, title: GROUPS[id].title, text, ...extra });
  const deck = [...new Set(state.deckIds || [])].filter(id => !state.cards?.[id]?.seen);
  const poolLabel = state.seenHistoryComplete ? '未见牌' : '已知开局牌表中尚未观察的牌（记录不完整）';
  if (has('xiasheng')) { const c = colour(hand); add('xiasheng', `${handLabel}：黑色 ${c.black} · 红色 ${c.red}${c.unknown ? ` · 花色未知 ${c.unknown}` : ''}`, { counts: c }); }
  if (has('quandao')) { const slash = hand.filter(id => /^(杀|火杀|火焰杀|雷杀|雷电杀|冰杀|冰霜杀)$/.test(getMeta(id).name)).length, trick = hand.filter(id => getMeta(id).type === 2 && !/乐不思蜀|兵粮寸断|闪电/.test(getMeta(id).name)).length; add('quandao', `${handLabel}：杀 ${slash} · 普通锦囊 ${trick}`, { counts: { slash, trick } }); }
  if (has('shuangxiong')) { const c = colour([...hand, ...equipment]); add('shuangxiong', `手牌与装备：红 ${c.red} · 黑 ${c.black}${c.unknown ? ` · 未知 ${c.unknown}` : ''}`, { counts: c }); }
  if (has('luanji')) { const counts = [1,2,3,4].map(s => hand.filter(id => getMeta(id).suit === s).length), used = [...new Set((context.luanji || []).map(id => getMeta(id).suit).filter(s => s >= 1 && s <= 4))]; add('luanji', `${counts.map((n,i) => `${SUITS[i+1]} ${n}`).join(' · ')}${numeric.has(2143) ? `；本回合已用 ${used.map(s => SUITS[s]).join(' ') || (state.historyComplete ? '无' : '未知')}` : ''}`, { usedSuits: used }); }
  if (has('mizhu') && pointsKnown(hand)) { const choices = subsetChoices(hand, getMeta), choice = choices[0]; add('mizhu', choice ? choices.map(ids => `${format(ids)} = 13`).join('；') : `${handLabel}没有点数和为 13 的组合`, { cardIds: choice || [], choices }); }
  if (has('yanxi') && windows.yanxi) {
    const w = windows.yanxi, top = state.zones?.['1:255']?.top || [], lines = w.ids.map(id => { const locations = state.cards?.[id]?.locations || [], knownHand = locations.length === 1 && locations[0] === `5:${w.target}`, knownPile = locations.length === 1 && locations[0] === '1:255' && top.includes(id); return `${getMeta(id).name}：${knownHand ? '已知手牌' : knownPile ? '已知牌堆牌' : '归属未知'}`; }); add('yanxi', lines.join('；'), { cardIds: w.ids });
  }
  if (has('yanjiao') && windows.yanjiao && pointsKnown(windows.yanjiao.ids)) { const ids = windows.yanjiao.ids, p = equalPartition(ids, getMeta); add('yanjiao', p ? `${format(p.left)} = ${format(p.right)}（各 ${sum(p.left)}；余 ${ids.length-p.left.length-p.right.length} 张）` : '这组牌无法分为点数和相等的两个非空组', { partition: p }); }
  if (has('chengxiang') && windows.chengxiang && pointsKnown(windows.chengxiang.ids)) { const w = windows.chengxiang, choices = [...subsetSum(w.ids, getMeta)].filter(([n]) => n > 0).sort((a,b) => (w.skill === 3492 ? Number(b[0] === 13) - Number(a[0] === 13) : 0) || b[1].length-a[1].length || b[0]-a[0]), best = choices[0]; if (best) add('chengxiang', `${format(best[1])}（${best[1].length} 张，点数和 ${best[0]}）`, { cardIds: best[1] }); }
  if (has('yicheng') && windows.yicheng && pointsKnown(windows.yicheng.ids) && pointsKnown(hand)) {
    const shown = windows.yicheng.ids.slice().sort((a,b) => getMeta(a).number-getMeta(b).number), own = hand.slice().sort((a,b) => getMeta(a).number-getMeta(b).number), exchanges = [];
    for (let count = 1; count <= Math.min(5, hand.length, shown.length) && exchanges.length < 5; count++) for (const from of combinations(own, count)) { for (const to of combinations(shown, count)) { if (sum(from) > sum(to)) { exchanges.push({ from, to }); if (exchanges.length >= 5) break; } } if (exchanges.length >= 5) break; }
    add('yicheng', exchanges.length ? exchanges.map(x => `${format(x.from)} → ${format(x.to)}`).join('；') : '本次候选范围内未找到增加展示牌点数和的交换', { exchanges, limited: true });
  }
  for (const key of ['jizhan', 'hezhong']) if (has(key) && windows[key] && pointsKnown(windows[key].ids) && deck.length) {
    const point = getMeta(windows[key].ids[0]).number, valid = deck.filter(id => getMeta(id).number >= 1 && getMeta(id).number <= 13), counts = { greater: valid.filter(id => getMeta(id).number > point).length, less: valid.filter(id => getMeta(id).number < point).length, equal: valid.filter(id => getMeta(id).number === point).length };
    if (key === 'hezhong') {
      const grouped = [TARGET_TRICKS, OTHER_TRICKS].map(pattern => {
        const cards = valid.filter(id => pattern.test(getMeta(id).name));
        return { greater: cards.filter(id => getMeta(id).number > point).length, less: cards.filter(id => getMeta(id).number < point).length, equal: cards.filter(id => getMeta(id).number === point).length };
      });
      add(key, `${poolLabel}与 ${point} 比：目标类锦囊大 ${grouped[0].greater} · 小 ${grouped[0].less}；其余常用锦囊大 ${grouped[1].greater} · 小 ${grouped[1].less}；这不是实时牌堆概率`, { counts, trickCounts: grouped });
    } else add(key, `${poolLabel}与 ${point} 比：大 ${counts.greater} · 小 ${counts.less} · 平 ${counts.equal}；这不是实时牌堆概率`, { counts });
  }
  if (has('guhuo') && deck.length) { const counts = new Map(); for (const id of deck) { const m = getMeta(id); if (m.type === 1 || m.type === 2 && !/乐不思蜀|兵粮寸断|闪电/.test(m.name)) counts.set(m.name, (counts.get(m.name) || 0) + 1); } add('guhuo', `${poolLabel}：${[...counts].sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0], 'zh-CN')).slice(0,16).map(([name,n]) => `${name} ${n}`).join(' · ')}；不能据此判断他人是否说谎`, { counts: Object.fromEntries(counts) }); }
  if (has('duanzao') && windows.duanzao) add('duanzao', `已展示：${format(windows.duanzao.ids)}`, { cardIds: windows.duanzao.ids });
  if (has('jiaoyu') && windows.jiaoyu) { const c = colour(windows.jiaoyu.ids); add('jiaoyu', `已观察判定牌：红 ${c.red} · 黑 ${c.black}${c.unknown ? ` · 未知 ${c.unknown}` : ''}`, { counts: c, cardIds: windows.jiaoyu.ids }); }
  return rows;
}

export const SKILL_HINT_GROUPS = GROUPS;
