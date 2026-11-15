import { PLUGIN_ICONS } from '../../ui/plugin-icons.js';
import { account, read, manager, observeNative, field, generalNames, downloadJSON } from '../../shared/info-runtime.js';
import { panelUI } from '../../shared/info-ui.js';
import { definitions, projectAchievements, evaluate, validSnapshot } from './model.js';
import { achievementExport } from './export.js';
export const manifest = { id: 'baisheng', name: '百胜战功', version: '0.1.3', apiVersion: 1, contractVersion: 1,
  minCoreVersion: '0.5.13', categories: ['info'], icon: PLUGIN_ICONS['baisheng'], priority: 31000,
  description: '查看当前账号百胜进度、完成日期与技能战功，仅保存在本机' };

export function createController(ctx) {
  let who = { id: '', nickname: '' }, snapshot = null, defs = [], names = {}, error = '', loading = false, request = null;
  let configError = ''; const listeners = new Set();
  const notify = () => { ctx.reportError?.(error || configError); for (const fn of [...listeners]) fn(); };
  const cancel = () => { request?.cancel(); request = null; loading = false; };
  const fail = e => { error = String(e?.stack || e); notify(); };
  function sync() {
    const next = account(ctx);
    if (next.id === who.id && next.nickname === who.nickname) return;
    cancel(); who = next; error = ''; snapshot = null;
    if (who.id) {
      const stored = ctx.storage.get(`account:${who.id}:snapshot-v1`, null);
      if (stored?.schema === 1 && stored.snapshot?.nickname === who.nickname && validSnapshot(stored.snapshot)) snapshot = stored.snapshot;
      else if (stored) error = '本机战功快照格式或昵称不匹配，请刷新官方进度。';
    }
    notify();
  }
  function persist() {
    if (!who.id || !snapshot || ctx.scope.signal.aborted) return;
    try { ctx.storage.set(`account:${who.id}:snapshot-v1`, { schema: 1, snapshot }); } catch (e) { fail(e); }
  }
  function accept(type, data, sender) {
    sync(); if (!who.id || sender.id !== who.id) return;
    if (type === 'ClientDbsGetuserachinfoRep') {
      if (!who.nickname || data.nickname !== who.nickname) return;
      snapshot = data; cancel(); error = ''; persist(); notify();
    } else if (type === 'GsClientAchievementProgressUpdate' && snapshot) {
      if (!(data.id > 0) || !Number.isSafeInteger(data.value) || data.value < 0) return;
      snapshot = { ...snapshot, progress: { ...snapshot.progress, [data.id]: Math.max(snapshot.progress[data.id] || 0, data.value) }, at: Date.now() };
      persist(); notify();
    }
  }
  function configs() {
    try {
      const ach = ctx.game.getConfigData('gn_gs_ahievement'), chars = ctx.game.getConfigData('character');
      if (ach && chars) { defs = definitions(ach, chars); names = generalNames(chars); configError = ''; }
    } catch (e) { configError = String(e?.message || e); }
  }
  async function refresh() {
    sync(); if (loading || !who.id) return;
    const expected = { ...who }; loading = true; error = ''; notify();
    try {
      const [ach, chars] = await Promise.all([ctx.game.loadConfigData('gn_gs_ahievement'), ctx.game.loadConfigData('character')]);
      if (ctx.scope.signal.aborted || account(ctx).id !== expected.id || account(ctx).nickname !== expected.nickname) return;
      defs = definitions(ach, chars); names = generalNames(chars); configError = '';
      if (!defs.some(d => d.flags === 2048)) throw new Error('官方配置未找到百胜战功定义');
      const mgr = manager(ctx, 'AchievementManager', 'ClientDbsGetuserachinfoRep', m => typeof m.sendGetAchInfo === 'function');
      if (!mgr || !who.nickname) throw new Error('战功查询接口或当前昵称尚未就绪，请进入大厅后重试');
      let timer;
      const cancelTimer = ctx.scope.add(() => ctx.window.clearTimeout(timer));
      request = { cancel: cancelTimer };
      timer = ctx.window.setTimeout(() => { cancel(); error = '战功查询超时。保留上次本机快照，请稍后重试。'; notify(); }, 12000);
      mgr.sendGetAchInfo(who.nickname, 0);
    } catch (e) {
      if (!ctx.scope.signal.aborted && account(ctx).id === expected.id) { cancel(); fail(e); }
    } finally {
      if (!ctx.scope.signal.aborted) { if (!request && account(ctx).id === expected.id) loading = false; notify(); }
    }
  }
  configs(); sync();
  observeNative(ctx, { ClientDbsGetuserachinfoRep: projectAchievements,
    GsClientAchievementProgressUpdate: packet => ({ id: Number(field(packet, 'CriteriaID')), value: Number(field(packet, 'Conut')) }) }, accept,
  () => { cancel(); error = '战功消息有缺口，请刷新官方进度；当前显示为上次快照。'; notify(); });
  ctx.scope.interval(sync, 500); ctx.scope.add(() => { cancel(); listeners.clear(); });
  return { refresh, view() { sync(); configs(); const gm = manager(ctx, 'GameGeneralManager', 'ClientGeneralFromRep', m => typeof m.HasGeneral === 'function');
    return { who, snapshot, error: error || configError, loading,
      rows: evaluate(defs, snapshot, names, id => gm ? read(() => gm.HasGeneral(id)) ?? null : null) }; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
export function activate(ctx) {
  const controller = createController(ctx);
  ctx.ui.registerPanel({ id: 'main', category: 'info', render(container) {
    const ui = panelUI(ctx, container), { root, el, listen, input, button, segments } = ui;
    let status = 'all', owned = 'owned', search = '', alive = true;
    const note = el('p', 'muted', '官方战功进度 · 本机快照'), summary = el('div', 'stat'), bar = el('div', 'bar');
    const refresh = button('刷新战功', 'refresh', () => controller.refresh()); refresh.className = 'primary';
    const exportButton = button('导出', 'download', () => { const v = controller.view(); downloadJSON(ctx, `百胜战功-${v.who.id}.json`, achievementExport(v, { pluginVersion: manifest.version })); });
    bar.append(refresh, exportButton);
    const find = input('搜索武将或战功'); listen(find, 'input', () => { search = find.value.trim(); draw(); });
    const stateFilter = segments([['all', '全部'], ['unfinished', '未完成'], ['complete', '已完成']], status, value => { status = value; draw(); });
    const ownFilter = segments([['owned', '已拥有'], ['all', '全部武将']], owned, value => { owned = value; draw(); });
    const meta = el('p', 'muted'), error = el('details', 'error'), errTitle = el('summary', '', '数据异常 · 查看详情'), errText = el('p'); error.append(errTitle, errText);
    const list = el('div', 'list'); list.setAttribute('aria-label', '百胜战功列表');
    root.append(note, summary, bar, find, stateFilter, ownFilter, meta, error, list);
    function draw() {
      if (!alive || ctx.scope.signal.aborted) return;
      const v = controller.view(), snapshot = v.snapshot;
      refresh.disabled = !v.who.id || v.loading; refresh.lastChild.textContent = v.loading ? '查询中…' : '刷新战功'; exportButton.disabled = !snapshot;
      note.textContent = v.who.id ? `${v.who.nickname || '当前账号'} · ${v.who.id}` : '等待登录当前账号';
      const ownedUnknown = v.rows.some(row => row.owned === null);
      let rows = v.rows.filter(row => owned !== 'owned' || row.owned !== false);
      const total = rows.length, complete = snapshot ? rows.filter(row => row.completed).length : null;
      summary.replaceChildren(el('strong', '', snapshot ? String(complete) : '—'), el('span', 'muted', `/ ${total || '—'} 项已完成`));
      rows = rows.filter(row => (status === 'all' || (status === 'complete' ? row.completed === true : row.completed === false)) && (!search || `${row.name} ${row.desc} ${row.skill?.desc || ''}`.includes(search)));
      meta.textContent = `${snapshot ? `快照 ${new Date(snapshot.at).toLocaleString()}` : '点击刷新读取官方进度'}${owned === 'owned' && ownedUnknown ? ' · 归属未知的武将暂时保留' : ''} · 显示 ${rows.length} 项`;
      error.hidden = !v.error; errText.textContent = v.error;
      list.replaceChildren();
      for (const row of rows) {
        const node = el('article', 'row'), head = el('div', 'row-head'), name = el('span', 'name', row.name); name.title = [row.name, row.desc].filter(Boolean).join('\n');
        head.append(name, el('span', 'number', row.completed ? '已完成' : row.value === null ? '进度未知' : `${row.value} / ${row.required || '未知'}`));
        const progress = el('div', 'progress'), fill = el('i'); fill.style.width = row.completed ? '100%' : row.value === null || !row.required ? '0%' : `${Math.min(100, row.value * 100 / row.required)}%`; progress.append(fill);
        node.append(head, progress);
        if (row.finishTime) node.append(el('div', 'muted', `百胜完成于 ${new Date(row.finishTime * 1000).toLocaleDateString()}`));
        const skill = row.skill ? !snapshot ? '未查询' : row.skill.completed ? '已完成' : '未完成' : '无对应定义';
        node.append(el('div', 'muted', `技能战功：${skill}`));
        if (row.skill) { const desc = el('p', 'muted', row.skill.desc || '技能战功说明暂未取得'); desc.style.whiteSpace = 'pre-wrap'; desc.style.margin = '3px 0 0'; node.append(desc); }
        list.append(node);
      }
      if (!rows.length) list.append(el('p', 'empty', !v.who.id ? '登录后可查询战功' : !v.rows.length ? '尚未加载战功定义，请点击刷新' : '没有符合筛选的战功'));
    }
    const off = controller.subscribe(draw); draw();
    return ctx.scope.add(() => { alive = false; off(); ui.dispose(); });
  } });
}
export default { manifest, activate };
