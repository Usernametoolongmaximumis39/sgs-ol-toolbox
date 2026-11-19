import { prioritySkills } from './priority-skills.js';
import { compactReward, rewardTokens, rewardToken, currencyTokens } from './reward-tokens.js';

export function statLine(stats) {
  if (!stats) return '属性待同步';
  const value = key => typeof stats[key] === 'number' && Number.isFinite(stats[key]) ? String(stats[key]) : '待同步';
  return `${value('hp')}血  ${value('cardnum')}牌  摸${value('draw')}  杀${value('exshatimes')}  甲${value('armor')}`;
}
export function statTokens(stats) {
  if (!stats) return [{ text: '属性待同步', fallback: '属性待同步' }];
  const fields = [['hp', 'stat_hp', '体力'], ['cardnum', 'stat_card', '手牌'], ['draw', 'stat_draw', '摸牌'],
    ['exshatimes', 'stat_sha', '出杀次数'], ['armor', 'stat_armor', '护甲']];
  return fields.flatMap(([field, icon, label], index) => {
    const value = stats[field], text = typeof value === 'number' && Number.isFinite(value) ? String(value) : '待同步';
    return [...(index ? [{ text: '  ', fallback: '  ' }] : []), { icon, text, fallback: `${label}${text}`, full: `${label}${text}`, atomic: true }];
  });
}
export function shortReward(text) {
  return compactReward(text).replace(/铜[钱币]\s*×\s*(\d+)/g, '铜钱$1')
    .replace(/特定(?:获取|获得)?(?:一个|一张|1个|1张)?/g, '')
    + (/特定/.test(text) ? '（内容待同步）' : '');
}
export function lossHint(option) {
  if (!option.loss) return '';
  if (option.loss.source === 'unavailable') return '无法选择（无合适扣除对象）';
  if (option.loss.source === 'unknown') return '扣除对象待确认';
  const names = option.loss.items.map(row=>row.name+(row.count!==1?`×${row.count}`:'')).join('、');
  return `${option.loss.source === 'server' ? '扣除' : '预计扣除'}：${names}`;
}
function impactToken(option) {
  if (option.camp || !option.impact) return null;
  const known = option.impact.length > 0;
  const text = `（${known ? option.impact.join(' · ') : '属性变化待确认'}）`;
  return { text, atomic: true, impact: known ? 'known' : 'unknown' };
}
export function optionSummary(option, index = 0, includeLoss = true) {
  const mark = ['①','②','③'][Number(option.order || index + 1) - 1] || String(index + 1);
  if (option.camp) return `${mark} 营地`;
  const gain = shortReward(option.gain || '').replace('（内容待同步）', option.reveal === 'on-entry' ? '（待揭示）' : '（名称未下发）');
  const target = [gain, option.battle ? '战斗：' + option.battle.generals.map(g=>g.name).join('、') : '', option.note].filter(Boolean).join(' · ') || '内容待同步';
  const money = option.gainDetail?.abandonMoney;
  return `${mark} ${option.lost ? shortReward(option.lost) + ' → ' : option.costHint && option.costHint !== '免费' ? option.costHint + ' → ' : ''}${target}${money > 0 ? `（可弃换${money}铜钱）` : ''}${impactToken(option)?.text ?? ''}${includeLoss && lossHint(option) ? `（${lossHint(option)}）` : ''}`;
}
export function optionTokens(option,index=0) {
  const tokens = optionBaseTokens(option, index), impact = impactToken(option), hint = lossHint(option);
  if (impact) tokens.push(impact);
  if (hint) tokens.push({ text: hint, breakBefore: true, ...(option.loss.source === 'unavailable' ? { warning: true } : {}) });
  return tokens;
}
function optionBaseTokens(option,index=0) {
  const lost=rewardToken(option.lost),gain=rewardToken(option.gain);
  const family=token=>token?.icon?.match(/^rogue_event_(zhanfa|skill|card|equip)[012]$/)?.[1];
  // Show the shared category once, retaining the cost and exact reward choice
  // mechanism/quantity. Named rewards and unlike categories stay explicit.
  if (!option.camp && !option.battle && !option.note && family(lost) && family(lost)===family(gain)) {
    const mark=['①','②','③'][Number(option.order||index+1)-1]||String(index+1);
    return [{text:mark+' '},lost,{text:' → '},{text:gain.text,full:gain.full,atomic:true},
      ...currencyTokens(option.gainDetail?.abandonMoney>0 ? `（可弃换${option.gainDetail.abandonMoney}铜钱）` : '')];
  }
  if (option.camp) return [{ text: optionSummary(option,index,false) }];
  const mark=['①','②','③'][Number(option.order||index+1)-1]||String(index+1);
  const tokens=[{text:mark+' '}];
  if (option.lost) tokens.push(...(lost?.icon ? [lost] : currencyTokens(shortReward(option.lost))),{text:' → '});
  else if (option.costHint && option.costHint!=='免费') tokens.push(...currencyTokens(option.costHint),{text:' → '});
  const parts=[];
  if (option.gain) parts.push(gain?.icon ? [gain] : currencyTokens(shortReward(option.gain).replace('（内容待同步）',option.reveal==='on-entry'?'（待揭示）':'（名称未下发）')));
  if (option.battle) parts.push([{text:'战斗：'+option.battle.generals.map(g=>g.name).join('、')}]);
  if (option.note) parts.push(currencyTokens(option.note));
  tokens.push(...(parts.length ? parts.flatMap((part,i)=>[...(i?[{text:' · '}]:[]),...part]) : [{text:'内容待同步'}]));
  if (option.gainDetail?.abandonMoney>0) tokens.push(...currencyTokens(`（可弃换${option.gainDetail.abandonMoney}铜钱）`));
  return tokens;
}
export function nodeCaption(node) {
  if (node.type === 'camp') return '';
  const names = node.fight?.generals.map((g, i) => (i ? g.stage > 1 ? ' → ' : '、' : '') + g.name).join('');
  return names || node.options.map(optionSummary).join(' / ') || '事件内容待同步';
}
export function labelLines(node, compact = false) {
  if (node.type === 'camp') return [];
  const lines = [], add = (text, kind) => { if (text) lines.push({ text: String(text), kind }); };
  if (node.fight) {
    for (const g of node.fight.generals) {
      const name = g.name + (g.stage > 1 ? ` · ${g.stage}阶段` : '') + (g.first && g.stage === 1 ? ' · 先手' : '');
      lines.push({ text: name, kind: 'name', warnings: prioritySkills(g) });
      lines.push({ text: statLine(g.stats), kind: 'stats', tokens: statTokens(g.stats) });
      if (g.armors?.length) add('防具 · ' + [...new Set(g.armors.map(c => c.name))].join('、'), 'armor');
    }
    const tokens = rewardTokens(node.fight.rewardDetails || node.fight.rewards); if (tokens.length) lines.push({ kind: 'reward', text: tokens.map(t => t.fallback).join(' · '), tokens });
  } else {
    for (const option of node.options) {
      const single = option.battle?.generals.length === 1;
      if (single) lines.push({text:optionSummary(option,node.options.indexOf(option)),kind:'name',warnings:prioritySkills(option.battle.generals[0])});
      else lines.push({text:optionSummary(option,node.options.indexOf(option)),kind:'option',inlineTokens:optionTokens(option,node.options.indexOf(option))});
      for (const g of option.battle?.generals || []) {
        if (!single) lines.push({text: g.name, kind: 'name', warnings: prioritySkills(g)});
        lines.push({ text: statLine(g.stats), kind: 'stats', tokens: statTokens(g.stats) });
        if (g.armors?.length) add('防具 · ' + [...new Set(g.armors.map(c=>c.name))].join('、'), 'armor');
      }
    }
    if (!node.options.length) add('事件内容待同步', 'hint');
  }
  return lines;
}
