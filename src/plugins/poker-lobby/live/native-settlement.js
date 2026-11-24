import { ResourceScope } from '../../../core/resources.js';
import { replayPopupManager } from '../replay/native-opening.js';
import { POKER_MODE, POKER_SECTION } from '../poker-room.js';
import { withClassicPokerContext } from './classic-context.js';

const RESULT_WINDOW = 'GameResultWindow';
const RESULT_LOAD_TIMEOUT_MS = 6000;
const RESULT_DISPLAY_MS = 4000;

export function attachClassicPokerSettlement(ctx, scope, scene, leave, repaint) {
  const manager = replayPopupManager(scene);
  const { window: win } = ctx;
  const context = run => withClassicPokerContext(win, scene, run);
  let panel, windowScope;
  let shown = false, ready = false, loading = false, finished = false;
  const isReady = () => Boolean(ready && panel?.parent && !panel.destroyed && panel.visible !== false);

  function close() {
    loading = ready = false;
    try { if (panel && !panel.destroyed) panel.Close(); }
    finally {
      windowScope?.dispose();
      panel = windowScope = undefined;
    }
  }
  function fail(error) {
    win.console?.warn('三国斗地主原生结算窗口', error);
    finish();
  }

  function finish() {
    if (finished || scope.closed) return;
    finished = true;
    try { close(); }
    catch (error) { win.console?.warn('三国斗地主原生结算窗口', error); }
    finally { scope.timeout(leave, 0); }
  }

  scope.add(close);

  function open({ protocol, raw, beans }, selfSeat) {
    const Message = ctx.game.getClass('MsgGameOver');
    let result;
    if (Message && protocol instanceof Message && protocol.Players?.length) {
      result = Object.create(protocol);
    } else if (typeof Message?.prototype?.pbToOldProtocol === 'function' && raw) {
      result = new Message();
      context(() => result.pbToOldProtocol(raw));
    }
    if (!result?.Players?.length || manager.GetWindowData(RESULT_WINDOW)?.parent) return;
    result.ModeType ||= POKER_MODE;
    result.GoupID ||= POKER_SECTION;
    const own = result.Players.find(row => row.SeatID === selfSeat);
    if (!own) return;
    result.SelfResult = Object.create(own, { IsFirstWin: { value: false } });
    result.Players = [result.SelfResult];
    result.Count = 1;
    const window = manager.GetWindow(RESULT_WINDOW, false);
    if (typeof window?.enterWindow !== 'function' || typeof window?.laterClose !== 'function') return;
    panel = window;
    windowScope = new ResourceScope();
    loading = true;
    windowScope.patch(panel, 'enterWindow', original => function (...args) {
      if (scope.closed) return;
      loading = false;
      try {
        context(() => Reflect.apply(original, this, args));
        const history = this.showZhanjiTxt;
        // The native hit area is inserted immediately before the history label.
        const hitArea = history?.parent === this && this.getChildAt(this.getChildIndex(history) - 1);
        for (const node of [this.generalBattleShareBtn, history,
          hitArea && hitArea.x === history.x && hitArea.y === history.y ? hitArea : null]) {
          if (!node?.visible) continue;
          node.visible = false;
          windowScope.add(() => { if (!node.destroyed) node.visible = true; });
        }
        ready = Boolean(this.myResultData);
        if (ready) {
          windowScope.timeout(finish, RESULT_DISPLAY_MS);
          repaint();
        }
      } catch (error) { fail(error); }
    });
    for (const method of ['UpdateGeneralExpInfo', 'updateWinStreakTips', 'InitLianShengUI', 'updateGeneralBattleShareBtn']) {
      if (typeof panel[method] === 'function') windowScope.patch(panel, method, () => () => {});
    }
    windowScope.patch(panel, 'showRewardInfo', original => function (...args) {
      if (beans == null || beans === 0 || !Message.GAME_MODEL_DDZ) return;
      // Ask the classic renderer for its native reward row. The current mode
      // uses the signed bean delta in Param1, with a different currency per sign.
      this.gameResult = Object.create(result, {
        GameModel: { value: Message.GAME_MODEL_DDZ },
        IsDDZ: { value: false },
        MatchType: { value: 0 },
      });
      try { Reflect.apply(original, this, args); }
      finally { this.gameResult = result; }
      const row = this.resultItems.find(item => item.TitleTxt === '积分');
      for (const item of this.resultItems.splice(0)) {
        if (item !== row) this.contentSprite.removeDrawChild(item);
      }
      if (row) {
        row.SetCustomInfo(beans > 0 ? '地主豆' : '欢乐豆', beans > 0 ? `+${beans}` : String(beans));
        row.addTxt.text = '';
        this.resultItems.push(row);
        this.layoutItems();
      }
    });
    windowScope.patch(panel, 'Close', original => function (...args) {
      const dismiss = (ready || loading) && !scope.closed && this === panel;
      if (dismiss) loading = ready = false;
      try { return Reflect.apply(original, this, args); }
      finally {
        if (dismiss) {
          windowScope.dispose();
          panel = windowScope = undefined;
          finish();
        }
      }
    });
    windowScope.patch(panel, 'laterClose', () => function () { this.Close(); });
    scene.ged.A(RESULT_WINDOW, result);
  }

  return {
    show(settlement, selfSeat) {
      if (!settlement || shown) return;
      shown = true;
      scope.timeout(() => { if (!ready) finish(); }, RESULT_LOAD_TIMEOUT_MS);
      if (!manager || !win.Laya.ClassUtils?.getClass?.(RESULT_WINDOW)) return;
      try { open(settlement, selfSeat); }
      catch (error) { fail(error); }
    },
    isReady,
    isPresent: () => Boolean(panel && !panel.destroyed && (loading || isReady())),
  };
}
