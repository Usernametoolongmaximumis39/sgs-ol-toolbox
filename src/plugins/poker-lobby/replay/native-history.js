import { roundStatus } from './board.js';
import { cardDetail, recordedPlayType } from './model.js';
import { escapeNativeText } from './native-opening.js';

const colored = (value, color) => `<span style="color:${color}">${escapeNativeText(value)}</span>`;
const PLAYER_COLOR = '#ffeb70';
const RATE_REASON = { 4: '春天', 5: '反春' };

function cardNames(cards) {
  if (!cards?.length) return '';
  const shown = cards.filter(card => card.id && card.face !== '?').slice(0, 54);
  return shown.length ? ` ${shown.map(card => colored(cardDetail(card), card.red ? '#ff6056' : '#e7e2d8')).join('、')}` : '';
}

function recordText(action, state, slots, seats, names) {
  const player = (id, withGeneral = true) => {
    const general = withGeneral && seats[slots.indexOf(id)]?.Seat.General?.CardName;
    return colored((general || names.seat(id)) + (id === slots[0] ? '（您）' : ''), PLAYER_COLOR);
  };
  const actor = player(action.seat);
  switch (action.type) {
    case 'general': {
      const seat = seats[slots.indexOf(action.seat)]?.Seat;
      const name = seat?.GeneralId === action.general ? seat.General?.CardName : null;
      return `${player(action.seat, false)}选择了${colored(name || names.general(action.general), '#ffbb71')}作为武将`;
    }
    case 'bid':
      return `${actor}${action.grab ? (action.bid ? '抢地主' : '不抢') : (action.bid ? '叫地主' : '不叫')}`;
    case 'landlord':
      return `${actor}成为地主`;
    case 'multiplier': {
      const reason = RATE_REASON[action.reason];
      return colored(`${reason ? `${reason} · ` : ''}倍率 ×${action.rate}`, '#ffbb71');
    }
    case 'gain': {
      if (action.origin === 'bottom') return `${actor}收下${action.count}张底牌${cardNames(action.cards)}`;
      if (action.origin === 'skill') return `${actor}因${colored(names.skill(action.skill), '#fff000')}获得${action.count}张牌${cardNames(action.cards)}`;
      const fromZone = { discard: '弃牌区', played: '出牌区', outside: '技能区' }[action.origin];
      if (fromZone) return `${actor}从${fromZone}收回${action.count}张牌${cardNames(action.cards)}`;
      const origin = action.origin === 'deck' ? '从牌堆摸了' : `从${player(action.from)}手中获得`;
      const known = action.seat === slots[0] || action.from === slots[0];
      return `${actor}${origin}${action.count}张牌${known ? cardNames(action.cards) : ''}`;
    }
    case 'stash':
      return `${actor}将${action.count}张牌置入技能区${cardNames(action.cards)}`;
    case 'pass':
      return `${actor}不出`;
    case 'discard':
      return `${actor}弃置${action.count}张牌${cardNames(action.cards)}`;
    case 'visible-hand':
      return `${actor}被明置了手牌${cardNames(action.cards)}`;
    case 'play':
      return `${actor}打出${colored(recordedPlayType(action), '#ffe58d')}${cardNames(action.cards)}`;
    case 'skill': {
      const target = action.targets.length ? `对${action.targets.map(id => player(id)).join('、')}` : '';
      return `${actor}${target}发动了技能 ${colored(names.skill(action.skill), '#fff000')}`;
    }
    case 'skill-choice': {
      const chosen = action.seat === slots[0] ? cardNames(action.cards) : '';
      return chosen ? `${actor}为${colored(names.skill(action.skill), '#fff000')}选择了${chosen}` : '';
    }
    case 'trustee':
      return `${actor}${action.enabled ? '进入托管' : '取消托管'}`;
    case 'result':
      return colored(action.text ?? roundStatus(state), '#ffbb71');
    default:
      return '';
  }
}

export function attachHistory(Laya, scope, trace, seats, names) {
  if (!trace?.AppendHtml || !trace.showSelectBtn || !trace.btnList?.length) return () => {};
  const buttons = trace.btnList.slice(0, seats.length + 1);
  const originalClick = trace.typeClickHandler;
  let log = [];
  let state;
  let slots = [];
  let seatNumbers = [];
  let filter = 0;
  let rendered = 0;

  function render(reset) {
    if (trace.destroyed) return;
    if (reset) {
      trace.ClearItem();
      trace.msgContainer.refresh();
      trace.msgContainer.scrollTo(0, 0);
      rendered = 0;
    }
    const selected = seatNumbers[filter - 1];
    for (; rendered < (state?.logLength ?? 0); rendered++) {
      const action = log[rendered];
      if (selected !== undefined && action.seat !== selected && action.from !== selected && !action.targets?.includes(selected)) continue;
      const html = recordText(action, state, slots, seats, names);
      if (html) trace.AppendHtml({ str: `${html}<br>` }, '', reset);
    }
  }

  for (const [index, button] of buttons.entries()) {
    const select = () => {
      if (filter === index) return;
      filter = index;
      trace.showSelectBtn(button);
      render(true);
    };
    button.off(Laya.Event.CLICK, trace, originalClick);
    button.on(Laya.Event.CLICK, trace, select);
    scope.add(() => {
      if (button.destroyed || trace.destroyed) return;
      button.off(Laya.Event.CLICK, trace, select);
      button.on(Laya.Event.CLICK, trace, originalClick);
    });
  }
  scope.add(() => {
    if (trace.destroyed) return;
    Laya.timer.clear(trace, trace.reScorllTo);
    trace.showSelectBtn(buttons[0]);
    trace.ClearItem();
  });

  return (nextLog, nextState, nextSlots, nextSeatNumbers) => {
    const reset = nextLog !== log || nextState.logLength < rendered || seatNumbers[filter - 1] !== nextSeatNumbers[filter - 1];
    log = nextLog;
    state = nextState;
    slots = nextSlots;
    seatNumbers = nextSeatNumbers;
    render(reset);
  };
}
