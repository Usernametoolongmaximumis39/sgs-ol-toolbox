// Pure projections of official configuration and already-decoded own-run data.
import { cityName } from './city-names.js';
export const CONFIG_FILES = ['hd_roguelike', 'cha_spell', 'sys_playcard', 'character'];
export const MAP_SCENES = new Set(['RogueLikeBigMapScene', 'RogueSmallMapScene']);
export const isShanhe = name => MAP_SCENES.has(name) || name === 'RogueLikeGameScene';
export const num = value => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
export const list = (value, cap = 20000) => Array.isArray(value) ? value.slice(0, cap) : [];
const textEntities = { nbsp:' ', ensp:' ', emsp:' ', thinsp:' ', amp:'&', quot:'"', apos:"'", lt:'<', gt:'>', middot:'·', hellip:'…', ndash:'–', mdash:'—' };
export function plain(value) {
  let text = String(value ?? '').slice(0, 24000);
  // Official descriptions contain HTML entities, sometimes escaped twice.
  // Decode as text only; never attach configuration HTML to the document.
  for (let pass = 0; pass < 2; pass++) text = text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
    if (name[0] !== '#') return textEntities[name.toLowerCase()] ?? entity;
    const hex = name[1].toLowerCase() === 'x', point = Number.parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
  });
  return text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?\s*>|<\/(?:p|div)>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/\|/g, '\n').replace(/[\u00a0\u2002\u2003\u2009]/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim().slice(0, 12000);
}
const ids = value => String(value ?? '').split(/[;,]/).filter(Boolean).map(Number).filter(Number.isFinite);
const index = (rows, key) => new Map(rows.map(row => [String(row[key]), row]));
const scoped = (rows, season) => rows.filter(row => ids(row.seasonID).includes(Number(season)));
const suffixes = ['PT', 'ZD', 'KN', 'EM', 'LY'];
const qualities = ['随机', '普通', '稀有', '史诗', '传说'];
export const itemTypes = { 2: '战法', 3: '技能', 4: '手牌', 5: '装备', 6: '装备', 7: '装备' };
export function expandRows(rows, abbreviations) {
  const names = new Map(list(abbreviations?.field || abbreviations).filter(row => row.Short && row.Long).map(row => [row.Short, row.Long]));
  return list(rows).map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !['__proto__', 'constructor', 'prototype'].includes(key)).map(([key, value]) => [names.get(key) || key, value])));
}
export function buildConfig(files) {
  const raw = files.hd_roguelike, root = raw?.Root;
  if (!root || !Array.isArray(root.Level) || !Array.isArray(root.Fight)) throw new Error('山河配置缺少地图或战斗表');
  const tables = Object.fromEntries(['Chapter', 'Level', 'Fight', 'General', 'Adventure', 'Choose', 'Tactics', 'Spell', 'Card', 'Text', 'Other', 'RewardGroup', 'DifficultySelection', 'EXDifficultySelection', 'EnemyGrowth', 'EnemyNumGrowth', 'EnemyDiffGrowth', 'EnemyShow'].map(key => [key, expandRows(root[key], raw.root?.abbreviation)]));
  const spells = new Map(list(files.cha_spell?.GameSpells?.spell).map(row => [String(row.a ?? row.id), { id: row.a ?? row.id, name: plain(row.c ?? row.name), desc: plain(row.o ?? row.desc) }]));
  const cards = new Map(expandRows(files.sys_playcard?.GamePlayCards?.card, files.sys_playcard?.abbreviation).map(row => [String(row.id), { ...row, name: plain(row.name || spells.get(String(row.spellId))?.name || `卡牌 #${row.id}`), desc: spells.get(String(row.spellId))?.desc || '' }]));
  const generals = new Map(list(files.character?.GameCharacters?.character).map(row => [String(row.a ?? row.id), plain((row.ai || '') + (row.b ?? row.name ?? ''))]));
  const items = new Map();
  for (const row of tables.Tactics) items.set(String(row.plot), { id: row.plot, name: plain(row.plotname), desc: plain(row.plotdesc), type: 2, level: row.level, money: num(row.money), pra1: num(row.pra1) });
  for (const row of tables.Spell) items.set(String(row.id), { ...spells.get(String(row.spellid)), id: row.id, name: spells.get(String(row.spellid))?.name || `技能 #${row.spellid}`, type: 3, level: row.level, money: num(row.money) });
  // Native GetTypeByItemId treats every positive isequip subtype as equipment.
  // Subtypes include weapons, armour and treasures; they are not item categories.
  for (const row of tables.Card) items.set(String(row.id), { ...cards.get(String(row.cardid)), id: row.id, name: cards.get(String(row.cardid))?.name || `卡牌 #${row.cardid}`, type: Number(row.isequip || 0) > 0 ? 5 : 4, level: row.level, money: num(row.money) });
  const groups = new Map();
  for (const row of tables.General) { const key = String(row.generalgroup); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(row); }
  const texts = new Map(tables.Text.map(row => [String(row.ID), plain(row.text)]));
  return { tables, items, spells, cards, generals, groups, texts, text: value => texts.get(String(value)) || plain(value),
    cities: index(tables.Level, 'cityID'), fights: index(tables.Fight, 'fightID'), adventures: index(tables.Adventure, 'ID'), choices: index(tables.Choose, 'effectID') };
}
export function difficulty(config, snapshot) {
  return scoped([...config.tables.DifficultySelection, ...config.tables.EXDifficultySelection], snapshot.seasonData?.seasonId).find(row => Number(row.difID) === Number(snapshot.seasonData?.difficulty)) || null;
}
function chapter(config, s) { return scoped(config.tables.Chapter, s.seasonData?.seasonId).find(row => Number(row.uniqueID) === Number(s.chapterData?.chapterId)); }
function desperateField(row, field, diff) {
  const level = diff >= 101 && diff <= 109 ? 1 : diff >= 111 && diff <= 119 ? 2 : diff >= 121 && diff <= 129 ? 3 : 0;
  return level ? row[field + '_JJ' + level] : '';
}
function adjustments(row, big, diff) {
  const result = {};
  const add = text => { for (const entry of String(text || '').split(';')) { const [key, raw] = entry.split(','); if (key && num(raw) !== null) result[key] = (result[key] || 0) + Number(raw); } };
  for (const suffix of suffixes.slice(0, big)) add(row['att_' + suffix]);
  for (const entry of String(desperateField(row, 'att', diff) || '').split(';')) { const [threshold, key, value] = entry.split(','); if (Number(threshold) <= diff && key) add(key + ',' + value); }
  return result;
}
// Matches cached official getEnemyGrowCnt, including apparition-age growth and
// fractional hp/draw adjustments absent from the old helper's approximation.
export function enemyStats(row, fight, location, config, s, enemyCount) {
  const diff = difficulty(config, s), month = num(s.chapterData?.accday), stage = Array.isArray(s.gameData?.passChapter) ? s.gameData.passChapter.length + 1 : null;
  if (!diff || month === null || stage === null) return null;
  const d = Number(diff.difID), extra = adjustments(row, Number(diff.bdif), d);
  const growth = config.tables.EnemyGrowth.find(r => Number(r.moon) === month && Number(r.diffnum) === d) || config.tables.EnemyGrowth.find(r => Number(r.moon) === month && Number(r.diffnum) === 0);
  if (!growth) return null;
  const age = Math.max(0, month - Number(location.appTime || 0)), shown = config.tables.EnemyShow.find(r => Number(r.moon) === age);
  const stageGrow = config.tables.EnemyDiffGrowth.find(r => Number(r.diffnum) === Number(diff.bdif) && Number(r.chap) === stage);
  const type = Number(chapter(config, s)?.bosslocation) === Number(location.location) ? 1 : Number(fight.iselite) === 1 ? 2 : 3;
  const rate = config.tables.EnemyNumGrowth.find(r => Number(r.type) === type && Number(r.num) === enemyCount);
  const values = {};
  for (const [key, seed] of [['hp', 1], ['cardnum', 4], ['draw', 5], ['exshatimes', 7], ['armor', 2], ['getarmor', 3]]) {
    const fraction = key === 'hp' ? Number(growth.hp1 || 0) / 100 : key === 'draw' ? Number(growth.draw1 || 0) / 100 : 0;
    const increment = (Number(growth[key] || 0) + Number(shown?.[key] || 0) + Number(diff[key === 'exshatimes' ? 'skill' : key] || 0) + Number(stageGrow?.[key] || 0) + fraction) * (rate?.[key] == null ? 1 : Number(rate[key]) / 100);
    const rounded = increment >= 1 ? Math.floor(increment) : increment >= 0 ? Math.ceil(increment) : Math.floor(increment);
    let value = Math.max(key === 'hp' ? 1 : 0, Number(row[key] || 0) + rounded + Number(extra[key] || 0));
    for (const item of list(s.gameData?.seedData?.seedItem, 256)) if (item.type === 1 && item.attrType === seed && [1, 3].includes(item.goal)) value += (item.sub ? -1 : 1) * Number(item.value || 0);
    values[key] = value + (key === 'exshatimes' ? 1 : 0);
  }
  return Object.values(values).every(Number.isFinite) ? values : null;
}
export function generalList(row, field, big, diff, chapterNumber) {
  let values = ids(row[field]);
  const apply = text => { const entries = String(text || '').split(';').filter(Boolean), add = [], remove = [];
    for (const entry of entries) { if (entry.startsWith('_')) remove.push(Number(entry.slice(1))); else if (Number.isFinite(Number(entry))) add.push(Number(entry)); }
    values = [...values, ...add].filter(id => !remove.includes(id));
  };
  for (const suffix of suffixes.slice(0, big)) apply(row[field + '_' + suffix]);
  const chapterField = field === 'carddesc' ? 'getcard' : field === 'equip' ? 'getequip' : field;
  // The native chapter list starts empty, then replaces matching base entries.
  // Chapter deletions remove earlier chapter additions, not base skills/cards.
  if (field !== 'getzhanfa') {
    const base = values; values = [];
    for (let i = 2; i <= Math.min(3, chapterNumber); i++) apply(row[chapterField + '_' + i]);
    values = [...base.filter(id => !values.includes(id)), ...values];
    const entries = [];
    for (const entry of String(desperateField(row, field, diff) || '').split(';')) { const [threshold, ...rest] = entry.split(','); if (Number(threshold) <= diff) entries.push(...rest); }
    apply(entries.join(';'));
  }
  return values;
}
function item(config, id) { return config.items.get(String(id)) || { id, name: `未知物品 #${id}`, desc: '配置尚未提供该物品说明', type: null, money: null }; }
export function reward(config, value, count) {
  if (value === null || value === undefined || value === '') return '';
  const counted = name => num(count) !== null && Number(count) !== 1 ? `${name} × ${count}` : name;
  if (String(value).includes(',')) { const [type, quality] = String(value).split(','); return counted(`随机${Number(quality) ? qualities[quality] || '' : ''}${itemTypes[type] || '物品'}`); }
  const group = config.tables.RewardGroup.find(row => String(row.reward) === String(value));
  if (group) return counted(config.text(group.rewarditem || group.rewarddesc) || `奖励组 #${value}`);
  const other = config.tables.Other.find(row => String(row.reward) === String(value));
  const generals = config.groups.get(String(value));
  const name = other ? config.text(other.rewardname) : generals ? generals.map(row => plain(row.generalname).replaceAll('&', '')).join('、') : item(config, value).name;
  return counted(name);
}
// A category/quality cost is a requirement, not a random reward roll. The
// client submits the option; it does not establish which owned item is removed.
export function rewardCost(config, value, count) {
  const category = /^(\d+),(\d+)$/.exec(String(value ?? ''));
  if (!category) return reward(config, value, count);
  const [, type, quality] = category;
  return `${Number(quality) ? qualities[quality] || `品质${quality}` : ''}${itemTypes[type] || '物品'} × ${num(count) ?? 1}`;
}
export function fightPreview(config, id, location, s) {
  const fight = config.fights.get(String(id)) || (config.groups.has(String(id)) ? { Ggroup: id } : null);
  if (!fight) return null;
  const diff = difficulty(config, s), d = Number(s.seasonData?.difficulty), big = Number(diff?.bdif || 0), chapterNumber = list(s.gameData?.passChapter).length + 1;
  const base = list(config.groups.get(String(fight.Ggroup)), 32).filter(row => Number(row.hide) !== 1 && Number(row.startChapter || 0) <= chapterNumber);
  const generals = [];
  for (const initial of base) {
    let row = initial; const seen = new Set(); let stage = 1;
    while (row && !seen.has(row) && stage <= 8) {
      seen.add(row);
      const details = (field, source) => generalList(row, field, big, d, chapterNumber).map(id => source.get(String(id)) || { id, name: `未知 #${id}`, desc: '' });
      generals.push({ id: row.generalID, name: plain(row.generalname || config.generals.get(String(row.generalID)) || `武将 #${row.generalID}`).replaceAll('&', ''), stage,
        first: Number(fight.startnum) > 0 && Number(fight.startnum) === Number(row.generalID), stats: enemyStats(row, fight, location, config, s, base.length),
        skills: details('getspell', config.spells), tactics: details('getzhanfa', config.items), cards: [...details('carddesc', config.cards), ...details('equip', config.cards)],
        armors: details('equip', config.cards).filter(card => Number(card.type) === 3 && Number(card.subType) === 2) });
      if (!(Number(row.inStage) > 0) || (row.CanStage && !ids(row.CanStage).includes(big))) break;
      const [group, position] = String(row.JumpStage || '').split(';');
      row = group ? config.groups.get(String(group))?.[Math.max(0, Number(position || 1) - 1)] : null; stage++;
    }
  }
  const rewardDetails = [num(fight.itemgroup) !== null ? {text:`${fight.itemgroup} 铜钱`} : null,
    ...[fight.rewarditem, fight.reward].flatMap(value => String(value || '').split(';').filter(Boolean).map(id => rewardDetail(config, id)))].filter(Boolean);
  return { name: config.text(fight.name) || `敌军 #${id}`, desc: config.text(fight.text), generals, rewardDetails,
    rewards: [num(fight.itemgroup) !== null ? `${fight.itemgroup} 铜钱` : '', ...String(fight.rewarditem || '').split(';').filter(Boolean).map(v => reward(config, v)), ...String(fight.reward || '').split(';').filter(Boolean).map(v => reward(config, v))].filter(Boolean) };
}
export function rewardDetail(config, id, count) {
  const group = config.tables.RewardGroup.find(row => String(row.reward) === String(id));
  // Explicit compensation only; never infer from rarity or item sale price.
  const money = num(group?.abandonmoney);
  return {text:reward(config,id,count), abandonMoney: money > 0 ? money : null};
}
export function choiceLoss(config, choice, location, s) {
  const category = /^(\d+),(\d+)$/.exec(String(choice?.lostitem ?? ''));
  if (!category || !itemTypes[category[1]]) return null;
  const event = s.chapterData?.curEventData;
  // loseData belongs to the selected effect's reward event, not all options
  // of the adventure. Never reuse a result at another city or effect.
  if (Number(s.chapterData?.curLocation) === Number(location.location)
      && Number(event?.eventId) === Number(choice.effectID) && !event?.isSelect
      && Number(event?.eventType) === 4 && event.loseData?.length) {
    return {source:'server',items:event.loseData.map(row=>({id:row.id,
      name:config.items.get(String(row.id))?.name || `未知物品 #${row.id}`,count:num(row.num) ?? 1}))};
  }
  const count = num(choice.lostnum) ?? 1, quality = Number(category[2]), type = Number(category[1]);
  // Legacy evidence establishes only a single known-quality first match.
  // Missing definitions might hide an earlier match; do not skip them.
  if (count !== 1 || quality < 1 || quality > 4 || !Array.isArray(s.gameData?.itemId)) return {source:'unknown',items:[]};
  const types = type === 5 ? [5,6,7] : [type];
  for (const id of s.gameData.itemId) {
    const entry = config.items.get(String(id));
    if (!entry) return {source:'unknown',items:[]};
    if (num(entry.type)===null || (types.includes(Number(entry.type)) && !(Number.isInteger(num(entry.level)) && Number(entry.level)>=1 && Number(entry.level)<=4))) return {source:'unknown',items:[]};
    if (types.includes(Number(entry.type)) && Number(entry.level) === quality)
      return {source:'predicted',items:[{id,name:entry.name,count:1}]};
  }
  // Only a complete, fully classified inventory establishes that the system
  // has no eligible item to deduct. Missing IDs/metadata remain unknown above.
  return {source:'unavailable',items:[]};
}
export function nodePreview(config, location, s) {
  const city = config.cities.get(String(location.location)), adventure = config.adventures.get(String(location.event)), fight = fightPreview(config, location.event, location, s);
  const options = [];
  if (adventure) for (let i = 1; i <= 3; i++) {
    const effect = adventure['effect' + i]; if (effect == null) continue;
    const choice = config.choices.get(String(effect)), battle = Number(choice?.type) === 7 ? fightPreview(config, choice.event1, location, s) : null;
    const event = s.chapterData?.curEventData;
    // Native adventure UI matches EventData.id to the zero-based option index.
    // Never borrow a previous event's rewards, or disclose an unresolved option.
    const current = Number(s.chapterData?.curLocation) === Number(location.location);
    const synced = current
      && Number(event?.eventType) === 2 && Number(event?.eventId) === Number(location.event) && !event?.isSelect
      ? event?.EventData?.find(row => Number(row.id ?? 0) === i - 1)?.subData : null;
    const resolved = synced?.length ? synced.map(row => {
      if (Number(row.type ?? 0) === 0) return `铜钱 × ${row.num ?? 0}`;
      if (Number(row.type) === 1) return reward(config,row.id,row.num);
      const entry = config.items.get(String(row.id));
      return entry ? entry.name + (Number(row.num ?? 1) > 1 ? ` × ${row.num}` : '') : `未知物品 #${row.id}`;
    }).join('、') : '';
    const configuredGain = choice ? reward(config, choice.getitem, choice.getnum) : '';
    const unrevealed = !resolved && Number(choice?.showitem) === 1 && /随机/.test(configuredGain);
    options.push({ id: effect, order:i, camp: Number(choice?.type) === 3 && Number(choice?.event1) === 2, label: config.text(adventure['option' + i]) || `选项 ${i}`, battle,
      reveal: unrevealed ? current && !event?.isSelect ? 'pending' : 'on-entry' : '',
      costHint: plain(adventure['effectvalue' + i]) === '免费' ? '免费' : '',
      gainDetail: choice ? rewardDetail(config,choice.getitem,choice.getnum) : null,
      loss: choiceLoss(config,choice,location,s),
      lost: choice ? rewardCost(config, choice.lostitem, choice.lostnum) : '', gain: resolved || (unrevealed ? configuredGain.replaceAll('随机', '特定') : configuredGain),
      note: !choice ? '选项配置未找到' : Number(choice.type) === 3 && Number(choice.event1) === 2 ? '进入营地' : Number(choice.type) === 7 && !battle ? '战斗配置未找到' : '' });
  }
  const camp = !fight && options.length === 1 && options[0].camp;
  return { id: location.location, eventId: location.event, city: cityName(config, city),
    name: camp ? '营地' : adventure ? config.text(adventure.chapname) : fight?.name || (location.event ? `未知事件 #${location.event}` : '事件尚未下发'),
    type: camp ? 'camp' : adventure ? 'event' : fight ? 'fight' : 'unknown', current: Number(s.chapterData?.curLocation) === Number(location.location),
    finished: list(s.chapterData?.alreadyFinishEvent).includes(location.event), desc: config.text(adventure?.text), fight, options };
}
export function shopPreview(config, s) {
  const shop = s.shopData; if (!shop) return null;
  let discount = 1, priceKnown = Array.isArray(s.gameData?.itemId);
  for (const id of [2091, 2145]) if (list(s.gameData?.itemId).includes(id)) { const value = config.items.get(String(id))?.pra1; if (value == null) priceKnown = false; else discount *= 1 - value / 100; }
  const moneyKeys = { 2: shop, 3: shop.spellMoney, 4: shop.cardMoney, 5: shop.equipMoney };
  return { open: typeof shop.bShow === 'boolean' ? shop.bShow : null, id: shop.id,
    goods: list(shop.itemId, 128).map((id, i) => {
      const definition = item(config, id), type = num(shop.itemType?.[i]) ?? definition.type, source = moneyKeys[type];
      const extra = type === 2 ? num(source?.exCurMoney) : num(source?.exCurMoney);
      const bought = s.nativeShop?.find(row => row.id === id && row.type === type)?.bought ?? (i < 32 && num(shop.boughtIdx) !== null ? ((Number(shop.boughtIdx) >>> i) & 1) === 1 : null);
      return { ...definition, id, type, bought, price: priceKnown && extra !== null && definition.money !== null ? Math.ceil((definition.money + extra) * discount) : null };
    }) };
}
export function buildView(config, s) {
  const chap = chapter(config, s), diff = difficulty(config, s);
  return { chapter: config.text(chap?.chaptername || chap?.cityName) || (s.chapterData?.chapterId ? `章节 #${s.chapterData.chapterId}` : '等待章节'),
    difficulty: config.text(diff?.sdifname || diff?.bdifname) || (s.seasonData?.difficulty ? `难度 ${s.seasonData.difficulty}` : '待同步'),
    nodes: list(s.chapterData?.locations, 256).map(location => nodePreview(config, location, s)), shop: shopPreview(config, s),
    owned: list(s.gameData?.itemId, 512).map(id => item(config, id)).filter(item => item.type === 2), snapshot: s };
}
