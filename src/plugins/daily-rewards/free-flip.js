import { read } from '../../shared/safe-read.js';
// Continue only an already-started native round. No reset, paid card or all-open.
const cardsValid = cards => Array.isArray(cards) && cards.length === 5 && cards.every(card => Number.isInteger(card?.Card) && card.Card >= 0 && card.Card <= 3);
export const managerSpecs = {
  ActivityManager: { events: ['ClientTreasureNTF', 26405], guard: value => typeof value?.SendOpenTreasureCard === 'function' },
};
export function planFreeFlip(adapter, selected = {}) {
  const actions = [], notes = [];
  if (!selected.activities || !selected.autoFlip) return { actions, notes };
  const manager = read(() => adapter.manager('ActivityManager')), bless = read(() => adapter.manager('BlessManager'));
  const info = read(() => manager.TreasureInfoVo), cards = read(() => manager.TreasureCardVos);
  if (!manager || typeof manager.SendOpenTreasureCard !== 'function' || !info || !cardsValid(cards)) return { actions, notes };
  const session = Number(info.SessionId), freeTime = Number(info.Time_Next_Free);
  const baseline = cards.map(card => card.Card), index = baseline.findIndex(card => card === 0);
  if (!Number.isSafeInteger(session) || session <= 0 || !Number.isSafeInteger(freeTime) || freeTime <= 0 || index < 0 || !baseline.some(card => card > 0)) return { actions, notes };
  const eligible = () => {
    const current = read(() => manager.TreasureCardVos), state = read(() => manager.TreasureInfoVo);
    return !adapter.signal?.aborted && adapter.valid?.() !== false && manager.destroyed !== true && adapter.manager('ActivityManager') === manager &&
      bless?.FreeBlessItemEnough === true && manager.TreasureNewCardFreeCard === true && state?.IsCanFreeOpen === true &&
      Number(state.SessionId) === session && Number(state.Time_Next_Free) === freeTime && cardsValid(current) && current.every((card, i) => card.Card === baseline[i]);
  };
  if (read(eligible) !== true) return { actions, notes };
  const changedCard = values => cardsValid(values) && values[index].Card > 0 && values.every((card, i) => i === index || card.Card === baseline[i]);
  const proxy = adapter.proxy?.();
  actions.push({ key: `free-flip:${session}:${freeTime}:${baseline.join('.')}`, category: 'activities', workflowGroup: `free-flip:${session}`, label: '已开始轮次的免费翻牌', manager,
    exclusionMode: 'free-draw', eligible,
    done: () => Number(manager.TreasureInfoVo?.SessionId) === session && changedCard(manager.TreasureCardVos),
    send: () => read(eligible) === true ? manager.SendOpenTreasureCard(session, 0, 1, index) : false,
    confirmations: proxy ? [{ manager: proxy, event: 'ClientTreasureNTF', accept: event => {
      const p = event?.Protocol;
      return p?.Result === 0 && p?.OPType === 12 && Number(p?.SeaonId) === session && changedCard(p?.CardItems);
    } }] : [],
    rejections: proxy ? [{ manager: proxy, event: 'ClientTreasureNTF', accept: event => {
      const p = event?.Protocol;
      return Number(p?.SeaonId) === session && p?.OPType === 12 && Number.isInteger(p?.Result) && p.Result > 0;
    } }] : [],
  });
  return { actions, notes };
}
