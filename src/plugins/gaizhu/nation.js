import { read } from '../../shared/info-runtime.js';
import { createAssistant } from './assistant.js';
import { closeGameResult, press, usable } from './native.js';
import { roomMode } from './room-settings.js';

const COUNTRY_RULE = 5;
const ROOM_MODES = [28, 85];
const ACTION_DELAY = 1800;
const list = value => Array.isArray(value) ? value : [];
const waitInfo = seat => seat?.WaitInfo || seat?.waitInfo;

export function isNationRoom(ctx, mode = roomMode(ctx)) {
  return ROOM_MODES.includes(Number(mode?.ModeID)) && Number(mode.RuleTypeID) === COUNTRY_RULE;
}

export function isNationGame(ctx, frame) {
  return frame.game && isNationRoom(ctx);
}

export function createNationRun(ctx, native) {
  let round, ownAssistant;
  function reset() {
    round = { aiAt: -Infinity, empty: -1, aiTries: 0, aiPrompt: false, readyAt: -Infinity,
      startAt: -Infinity, startTries: 0, selection: null, results: new WeakMap() };
    ownAssistant = null;
  }
  reset();

  function room(frame, now = Date.now()) {
    const scene = frame.scene;
    const start = scene?.startUI;
    const seats = list(scene?.seatListView?.seatList).filter(Boolean);
    const id = ctx.native.account().id;
    const mine = id && seats.map(waitInfo).find(info => String(info?.ClientId ?? info?.clientId ?? '') === id);
    if (!mine || !start?.rc || !isNationRoom(ctx) || frame.game) return '等待确认国战房间与座位';
    const master = read(() => start.rc.MasterIsSelf);
    if (master !== true) {
      if (master === false && (mine.IsReady ?? mine.ready) === false && now - round.readyAt >= ACTION_DELAY && press(start.readyBtn)) {
        round.readyAt = now;
        return '国战：已请求准备';
      }
      return '国战：等待房主开局';
    }

    const empty = seats.filter(seat => !waitInfo(seat) && Number(seat.SeatStatus ?? seat.seatStatus ?? 0) === 0).length;
    if (empty !== round.empty) { round.empty = empty; round.aiTries = 0; round.aiPrompt = false; }
    if (empty) {
      if (round.aiPrompt && native.confirmAi()) {
        round.aiAt = now;
        round.aiPrompt = false;
        return '国战：等待普通小杀入座';
      }
      if (now - round.aiAt < ACTION_DELAY) return '国战：等待补齐普通小杀';
      if (round.aiTries >= 5) throw new Error('国战添加普通小杀重试后仍有空位，请检查房间');
      round.aiAt = now;
      round.aiTries++;
      round.aiPrompt = native.openAi();
      return '国战：正在补齐普通小杀';
    }
    if (!usable(start.startBtn)) return '国战：等待其他玩家准备';
    if (now - round.startAt < ACTION_DELAY) return '国战：等待开局回包';
    if (round.startTries >= 10) throw new Error('国战连续10次开始仍未进入对局，请检查房间');
    round.startAt = now;
    round.startTries++;
    return press(start.startBtn) ? '国战：已请求开局' : '国战：等待可用开局按钮';
  }

  function selectPair(win, now) {
    if (win.loading || win.closeing || win.isClosing || win.isShowWait) return '国战：等待选将窗口就绪';
    if (round.selection?.win !== win || round.selection?.pool !== win.generalUis) {
      round.selection = { win, pool: win.generalUis, at: -Infinity, confirmed: false };
    }
    const job = round.selection;
    if (job.confirmed) return '国战：等待选将确认';
    const main = win.zhuGeneralCardUI?.Card;
    const deputy = win.fuGeneralCardUI?.Card;
    const sameCountry = (a, b) => win.needCheckCountry === false || a.Country != null && a.Country === b.Country;
    if (main && deputy) {
      if (main.CardId == null || main.CardId === deputy.CardId || !sameCountry(main, deputy)
        || !usable(win.confirmBtn) || typeof win.confirmBtnEvent !== 'function') return '国战：等待合法主副将确认';
      if (read(() => ctx.game.getClass('GameContext').CanOperationInGame()) === false) return '国战：等待游戏允许选将';
      job.confirmed = true;
      win.confirmBtnEvent();
      return '国战：已请求确认主副将';
    }
    if (win.zhuGeneralTween || win.fuGeneralTween || now - job.at < 1000) return '国战：等待选将动画';
    const pool = list(win.generalUis).filter(card => usable(card) && card.CanSelect === true && Number(card.Card?.CardId) > 0);
    const selected = main || deputy;
    const other = (a, b) => a.CardId !== b.CardId && sameCountry(a, b);
    const pick = selected ? pool.find(card => other(selected, card.Card))
      : pool.find(card => pool.some(partner => other(card.Card, partner.Card)));
    if (!pick || typeof win.onClickGeneralCard !== 'function') return '国战：等待可选主副将';
    job.at = now;
    win.onClickGeneralCard(pick);
    return '国战：正在选择主副将';
  }

  function game(frame, now = Date.now(), assistant = null, options = {}) {
    if (!isNationGame(ctx, frame)) return '等待确认国战对局';
    const win = native.matching(/^SelectCountryWarGeneralWindow$/)[0];
    if (win) return selectPair(win, now);
    if (!frame.self) return '国战：等待读取牌局';
    const decision = assistant || (ownAssistant ||= createAssistant({
      canOperate: () => read(() => ctx.game.getClass('GameContext').CanOperationInGame()),
      getCardMeta: id => read(() => ctx.game.getCardMeta(id)),
      getSkill: id => read(() => ctx.game.getClass('Skill').GetInstance(id)),
    }));
    const acted = decision.run(frame, now, options);
    return decision.reason() || (decision.mode() === 'trustee' ? '国战：托管兜底中'
      : decision.mode() === 'local' ? '国战：本地处理询问'
        : acted ? '国战：正在执行小杀助手提示' : '国战：等待小杀助手提示');
  }

  function settlement() {
    return closeGameResult(native.matching, round.results);
  }

  return { reset, room, game, settlement };
}
