import { createTavernStatus } from './tavern-status.js';
import { durationOf } from './model.js';

const MAX_DATE = 8640000000000000;

export function createStopPolicy(ctx) {
  const now = () => typeof ctx.now === 'function' ? ctx.now() : Date.now();
  const elapsed = () => typeof ctx.now === 'function' ? ctx.now() : ctx.window?.performance?.now?.() ?? now();
  let tavern, startedAt, duration;
  let mode, state;
  const snapshot = () => ({ ...state });
  function reset() {
    tavern?.dispose();
    tavern = null;
    mode = 'manual';
    state = { waiting: false, due: false, deadline: 0, stopStatus: '' };
  }
  reset();
  return {
    start({ mode: nextMode, hours, account }) {
      reset();
      mode = nextMode;
      if (mode === 'timed') {
        duration = durationOf(hours);
        const deadline = now() + duration;
        if (!duration || deadline > MAX_DATE) throw new Error('请输入有效的正数小时');
        startedAt = elapsed();
        state = { ...state, deadline, stopStatus: '定时运行中' };
      } else if (mode === 'tavern') {
        tavern = createTavernStatus(ctx, account, now);
        state = { ...state, waiting: true, stopStatus: '酒馆 · 待同步' };
      }
    },
    update({ settled = false } = {}) {
      if (state.due) return snapshot();
      if (mode === 'timed' && elapsed() - startedAt >= duration) {
        state = { ...state, due: true, stopStatus: '定时已到' };
      } else if (mode === 'tavern') {
        const { waiting, claimed } = tavern.update(settled);
        const due = claimed === 3;
        state = { ...state, waiting, due, stopStatus: due ? '酒馆三项已领齐' : claimed === null ? '酒馆 · 待同步' : `酒馆 · 已领 ${claimed}/3` };
      }
      return snapshot();
    },
    reset,
    snapshot,
  };
}
