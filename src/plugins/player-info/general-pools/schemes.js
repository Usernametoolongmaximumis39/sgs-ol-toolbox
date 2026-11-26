import { applyScheme, generalIds, nativeSchemes } from './native.js';
import { GENERAL_POOL_LIMIT, generalPoolKey } from '../../../shared/general-pool-storage.js';

export const LOCAL_LIMIT = GENERAL_POOL_LIMIT;
const sameIds = (a, b) => a.length === b.length && a.every((id, index) => id === b[index]);
const sameScheme = (a, b) => !!a && a.id === b.id && a.name === b.name && sameIds(a.ids, b.ids);

function loadLocal(storage, id) {
  const value = id ? storage.get(generalPoolKey(id), []) : [];
  return Array.isArray(value) ? value.filter(row => typeof row?.id === 'string' && typeof row.name === 'string' &&
    Array.isArray(row.ids)).map(row => ({ ...row, ids: generalIds(row.ids) })) : [];
}

export function createSchemeSession(ctx, pending) {
  let owner = '', local = [], game = [], native = null;

  function refresh() {
    owner = ctx.native.account().id;
    local = [];
    game = [];
    native = null;
    if (owner) {
      local = loadLocal(ctx.storage, owner);
      ({ native, schemes: game } = nativeSchemes(ctx));
    }
  }

  function sync() {
    if (ctx.native.account().id !== owner) {
      refresh();
      return { accountChanged: true };
    }
    const request = pending.get(owner);
    if (!request) return null;
    refresh();
    const current = game.find(row => row.id === request.id);
    if (current && sameIds(current.ids, request.ids)) {
      pending.delete(owner);
      return { message: `游戏方案「${request.name}」的禁将名单已更新。` };
    }
    if (Date.now() >= request.until) {
      pending.delete(owner);
      return { message: `尚未确认游戏方案「${request.name}」更新，请核对游戏名单。`, error: true };
    }
    return null;
  }

  function commit({ kind, accountId, from, to, name }) {
    if (ctx.scope.signal.aborted) return {};
    refresh();
    if (!owner || owner !== accountId) throw new Error('游戏账号已切换，请重新选择方案。');
    const saved = kind === 'apply' ? from : to;
    const inGame = kind === 'apply' ? to : from;
    if ((saved && !sameScheme(local.find(row => row.id === saved.id), saved)) ||
        (inGame && !sameScheme(game.find(row => row.id === inGame.id), inGame))) {
      throw new Error('所选方案有变化，请核对最新名单后再操作。');
    }
    if (kind === 'apply') {
      if (pending.has(owner)) throw new Error('上一次载入还在确认，请稍等。');
      if (!applyScheme(native, to, from.ids)) return { message: '两份禁将名单一致。' };
      pending.set(owner, { id: to.id, name: to.name, ids: from.ids, until: Date.now() + 5000 });
      return { message: `已提交到游戏方案「${to.name}」，正在确认名单。` };
    }

    let rows, message, selected;
    if (kind === 'create') {
      if (local.length >= LOCAL_LIMIT) throw new Error('已存满 20 份拓展方案，请选择更新已有方案或删除一份。');
      const id = ctx.window.crypto.randomUUID?.() ?? ctx.window.crypto.getRandomValues(new Uint32Array(4)).join('-');
      rows = [...local, { id, name, ids: from.ids }];
      message = `已保存拓展方案「${name}」。`;
      selected = id;
    } else if (kind === 'delete') {
      rows = local.filter(row => row.id !== to.id);
      message = `已删除拓展方案「${to.name}」。`;
    } else if (kind === 'rename') {
      rows = local.map(row => row.id === to.id ? { ...row, name } : row);
      message = `拓展方案已改名为「${name}」。`;
      selected = to.id;
    } else {
      if (sameIds(from.ids, to.ids)) return { message: '两份禁将名单一致。' };
      rows = local.map(row => row.id === to.id ? { ...row, ids: from.ids } : row);
      message = `已更新拓展方案「${to.name}」的禁将名单。`;
    }
    ctx.storage.set(generalPoolKey(owner), rows);
    local = rows;
    return { message, selected };
  }

  return { refresh, sync, commit,
    get owner() { return owner; },
    get local() { return local; },
    get game() { return game; },
    get busy() { return pending.has(owner); },
  };
}
