import { ResourceScope } from '../../core/resources.js';
import { read } from '../../shared/safe-read.js';
import { GENERAL_PAGE_SIZE, readPokerGeneralPage } from './general-stats.js';

const POKER_MODEL = 47;
const roles = [
  { label: '全部', value: 0 },
  { label: '地主', value: 1 },
  { label: '农民', value: 3 },
];

export function createPokerGeneralViewClass(ctx) {
  const Native = read(() => ctx.game.getClass('UserInfoDDZGenWinView2025'));
  if (typeof Native !== 'function') return null;
  const frame = Object.getPrototypeOf(Native.prototype);
  if (typeof frame?.Init !== 'function' || typeof frame.destroy !== 'function'
    || !['initUI', 'createRadioGroup', 'sortBtnClick', 'updateMyResult', 'clearItemUI', 'updateSotrType']
      .every(key => typeof Native.prototype[key] === 'function')) return null;

  return class PokerGeneralView extends Native {
    constructor([modeType, user] = []) {
      // The stock constructor submits an unscoped general query before it assigns a game mode.
      const view = Reflect.construct(frame.constructor, [], new.target);
      Object.assign(view, {
        curPage: 1, allPage: 1, modeType, nickName: user?.Nickname || '',
        selectIdx: POKER_MODEL, sortType: 0, rankDesc: false, maxNum: GENERAL_PAGE_SIZE,
        sortBtnList: [], itemUIs: [], figure: 0, operations: new ResourceScope(),
      });
      view.size(697, 400);
      view.addClick();
      view.addMouseMoveEvent();
      view.operations.add(ctx.scope.add(() => view.operations.dispose()));
      return view;
    }

    Init() {
      if (this.operations.closed) return;
      frame.Init.call(this);
      this.initUI();
      this.emptyLabel = this.emptyTxt.text;
      this.createRadioGroup(roles.map(role => ({ ...role })), 0);
      this.sendResult();
    }

    onTypeClicked() {
      const figure = this.radioBtn?.SelectedValue;
      if (!roles.some(role => role.value === figure) || this.figure === figure) return;
      this.figure = figure;
      this.curPage = 1;
      this.sendResult();
    }

    sortBtnClick(...args) {
      this.curPage = 1;
      return super.sortBtnClick(...args);
    }

    sendResult() {
      if (this.operations.closed || !this.resultPool) return;
      this.pending = { page: this.curPage, rankDesc: this.rankDesc, sortType: this.sortType, figure: this.figure };
      this.clearItemUI();
      this.updateSotrType();
      this.emptyBg.visible = this.emptyTxt.visible = true;
      this.emptyTxt.text = '正在读取武将战绩…';
      if (!this.reading) void this.readPages();
    }

    async readPages() {
      this.reading = true;
      try {
        while (this.pending && !this.operations.closed) {
          const query = this.pending;
          this.pending = null;
          let result;
          try {
            result = await readPokerGeneralPage(ctx, query.page, this.operations.signal, query);
          } catch {
            result = { message: '读取三国斗地主武将战绩失败。' };
          }
          if (this.operations.closed || this.pending) continue;
          if (!result.rows) {
            this.emptyTxt.text = result.message || '武将战绩暂不可用。';
            continue;
          }
          this.emptyTxt.text = this.emptyLabel;
          const rows = result.rows.map((row, index) => ({
            rank_id: row.rank ?? (query.page - 1) * this.maxNum + index + 1,
            general_id: row.id,
            game_count: row.games,
            win_count: row.wins,
          }));
          this.updateMyResult(result.total, query.rankDesc, rows);
        }
      } finally {
        this.reading = false;
      }
    }

    destroy(...args) {
      this.operations.dispose();
      this.radioBtn?.Clear();
      if (this.resultPool) this.clearItemUI();
      this.resultPool = null;
      return frame.destroy.apply(this, args);
    }
  };
}
