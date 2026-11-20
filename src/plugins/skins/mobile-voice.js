import { mobileSkillName } from './mobile-skin-names.js';
import { mobileSkillLabels, mobileSkinSkillLabels } from './mobile-skill-labels.js';

// The official mobile manifest lists skin-specific card lines under audio/skill
// alongside general skills. Use complete keys so codes such as shanjia stay skills.
const cards = new Map(Object.entries({
  sha: '杀', huosha: '火杀', leisha: '雷杀', shan: '闪', tao: '桃', jiu: '酒',
  wuzhong: '无中生有', juedou: '决斗', nanman: '南蛮入侵', wanjian: '万箭齐发',
  wugu: '五谷丰登', taoyuan: '桃园结义', taoyuanjieyi: '桃园结义',
  guochai: '过河拆桥', guohe: '过河拆桥', shunqian: '顺手牵羊', shunshou: '顺手牵羊',
  wuxie: '无懈可击', jiedao: '借刀杀人', huogong: '火攻', tiesuo: '铁索连环',
  binliang: '兵粮寸断', bingliang: '兵粮寸断', lebusishu: '乐不思蜀', lebusushu: '乐不思蜀',
  shandian: '闪电', huoshao: '火烧连营', huoshaolianying: '火烧连营',
  diaohu: '调虎离山', luli: '勠力同心', lulitongxin: '勠力同心', lianjun: '联军盛宴',
  shuiyan: '水淹七军', yuanjiao: '远交近攻', yiyidailao: '以逸待劳', zhijizhibi: '知己知彼',
  chiling: '敕令', guguo: '固国安邦', haoling: '号令天下', kefu: '克复中原',
  wenhe: '文和乱武', xietianzi: '挟天子以令诸侯', chitu: '赤兔', qinglong: '青龙偃月刀',
}));
const cardNames = new Set(cards.values());
const confirmedSkills = new Map(Object.entries({
  huwei: '虎威', paiyi: '排异', quanji: '权计', tiaoxin: '挑衅', yijue: '义绝',
  zhiji: '志继', zili: '自立',
}));

export function mobileCloudVoice(code, skinId) {
  const key = code.toLowerCase();
  const card = cards.get(key) ?? cards.get(key.replace(/^\d+_/, ''));
  if (card) return { name: card, kind: 'card' };
  const ownerId = Math.floor(Number.parseInt(skinId, 10) / 100);
  const name = mobileSkillLabels[ownerId]?.[key] ?? confirmedSkills.get(key) ?? mobileSkillName(key);
  if (typeof name === 'string' && name !== key) return { name };
  const skinName = mobileSkinSkillLabels[skinId]?.[key];
  return typeof skinName === 'string' ? { name: skinName } : { name: code, kind: 'unidentified' };
}

export function isMobileCardVoiceName(name) {
  return cardNames.has(name.trim());
}
