// IDs and card enums verified against the local shipped client/config.
export const EXTRA_SKILLS = Object.freeze({
  liegong: [71,297,3264], pojun: [414,3389], fuzai: [3824], wusheng: [33,878],
  wuniang: [3796], baichu: [3338], yingyuan: [384], huaiyuan: [3081],
  weishu: [3084], miuyan: [3274], heji: [3586], shangshi: [419],
  luoying: [401], longyin: [446,21003],
});
export const EXTRA_IDS = Object.freeze(Object.values(EXTRA_SKILLS).flat());
export const EXTRA_NAMES = Object.freeze({liegong:'烈弓',pojun:'破军',fuzai:'覆载',wusheng:'武圣',wuniang:'武娘',baichu:'百出',yingyuan:'应援',huaiyuan:'怀远',weishu:'卫戍',miuyan:'谬焰',heji:'合击',shangshi:'伤逝',luoying:'落英',longyin:'龙吟'});
export const skillKind = id => Object.keys(EXTRA_SKILLS).find(key => EXTRA_SKILLS[key].includes(Number(id)));
export const model = ui => ui?.Card || {};
export const selected = ui => ui?.Selected === true || ui?.selected === true || model(ui).Selected === true;
export const available = ui => ui && !ui.destroyed && ui.visible !== false && ui.CanBeSelected !== false &&
  (ui.Activated ?? ui.activated ?? ui.CanBeSelected) === true;
const windowAvailable = ui => ui && !ui.destroyed && ui.visible !== false &&
  (ui.CanBeSelected === undefined ? available(ui) : ui.CanBeSelected === true);
export const suit = ui => Number(model(ui).FlowerOnSeat ?? model(ui).CardFlower);
export const red = ui => [1,2].includes(suit(ui));
export const black = ui => [3,4].includes(suit(ui));
export const skillId = ui => Number(model(ui).FirstSkillId ?? model(ui).FirstSkill?.ID);
export const cardType = ui => Number(model(ui).Type ?? model(ui).FirstSkill?.Type);
export const equip = ui => model(ui).IsEquipCard === true || [3,4,5,6,7].includes(cardType(ui));
export const nonBasic = ui => equip(ui) || model(ui).IsJinNangCard === true || cardType(ui) === 1;
export function select(ui, value = true) {
  if (typeof ui?.setSelected === 'function') { ui.setSelected(value); return true; }
  if (typeof model(ui).G === 'function') { model(ui).G(value); return true; }
  return false;
}
export function miuyanCard(cards) {
  const count = flower => cards.filter(c => suit(c) === flower).length;
  const preferred = count(3) >= count(4) ? 3 : 4;
  return cards.find(c => available(c) && suit(c) === preferred) || cards.find(c => available(c) && black(c));
}
export function longyinCard(cards, random = Math.random) {
  const legal = cards.filter(available);
  for (const id of [2,3,82,13]) {
    const card = legal.find(c => skillId(c) === id);
    if (card) return card;
  }
  return legal[Math.floor(random() * legal.length)];
}
export function pojunCards(hand, equipment, hp, ownEquipCount) {
  if (!Number.isFinite(hp) || !Number.isFinite(ownEquipCount)) return null;
  const eq = equipment.filter(windowAvailable), hs = hand.filter(windowAvailable);
  const priority = eq.filter(c => cardType(c) === 4).concat(eq.filter(c => cardType(c) === 7));
  const rest = eq.filter(c => !priority.includes(c));
  const extra = Math.max(0, eq.length - priority.length - ownEquipCount);
  return [...priority, ...rest.slice(0,extra), ...hs, ...rest.slice(extra)]
    .slice(0,Math.min(Math.max(0,Math.floor(hp)),hs.length + eq.length));
}
export function wuniangCard(hand, equipment) {
  const legal = equipment.filter(windowAvailable);
  return legal.find(c => cardType(c) === 4) || legal[0] || hand.find(windowAvailable);
}
