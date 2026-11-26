import { BAISHENG_ICON } from '../../ui/plugin-icons.js';
import { read, field, generalNames, downloadJSON } from '../../shared/info-runtime.js';
import { definitions, evaluate, validSnapshot } from './model.js';
import { achievementExport } from './export.js';
export const manifest = { id: 'baisheng', name: '百胜战功', version: '0.1.13', apiVersion: 1, contractVersion: 1,
  releaseNotes: "修复断线或重新登录时刷新战功可能报错的问题。连接恢复前仍可查看和导出当前账号已保存的进度，连接就绪后自动恢复查询。", minCoreVersion: '0.6.222', categories: ['info'], icon: BAISHENG_ICON, priority: 31000,
  description: '本机记录百胜进度、日期与技能战功' };

export function createController(ctx) {
  const achievements = ctx.native.achievements;
  let who = { id: '', nickname: '' }, snapshot = null, defs = [], names = {}, error = '', request = null;
  let configError = ''; const listeners = new Set();
  let initialized = false, autoAttempts = 0, nextAutoAt = 0, lastReady;
  const notify = () => { ctx.reportError?.(error || configError); for (const fn of [...listeners]) fn(); };
  const cancel = () => { request?.cancelTimer?.(); request = null; };
  const fail = e => { error = String(e?.stack || e); notify(); };
  const canQuery = () => Boolean(who.id && who.nickname && achievements.ready());
  const sameAccount = (a, b) => a.id === b.id && a.nickname === b.nickname;
  const serverProxy = () => read(() => ctx.game.getServerProxy());
  const sameConnection = task => task.proxy === serverProxy() && task.connection === read(() => task.proxy.ConnId);
  const inFlight = task => request === task && !ctx.scope.signal.aborted
    && sameAccount(task.account, ctx.native.account()) && sameConnection(task);
  function retryWhenReady() {
    cancel(); initialized = false; nextAutoAt = 0;
  }
  function sync() {
    const next = ctx.native.account();
    if (sameAccount(next, who)) return;
    retryWhenReady(); who = next; error = ''; snapshot = null; autoAttempts = 0;
    if (who.id && who.nickname) {
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
    sync(); if (!who.id || !sameAccount(sender, who)) return;
    if (type === 'ClientDbsGetuserachinfoRep') {
      if (!who.nickname || data.nickname !== who.nickname) return;
      snapshot = data; initialized = defs.some(d => d.flags === 2048);
      if (request && !request.cancelTimer) request.satisfied = true;
      else cancel();
      error = ''; persist(); notify();
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
    sync(); if (ctx.scope.signal.aborted || request || !canQuery()) return;
    const proxy = serverProxy();
    const task = request = { account: who, proxy, connection: read(() => proxy.ConnId) };
    const attempted = () => { autoAttempts++; nextAutoAt = Date.now() + 30000; };
    error = ''; notify();
    try {
      const [ach, chars] = await Promise.all([ctx.game.loadConfigData('gn_gs_ahievement'), ctx.game.loadConfigData('character')]);
      if (!inFlight(task) || !canQuery()) {
        if (request === task) { initialized = false; nextAutoAt = 0; }
        return;
      }
      defs = definitions(ach, chars); names = generalNames(chars); configError = '';
      if (!defs.some(d => d.flags === 2048)) throw new Error('官方配置未找到百胜战功定义');
      if (task.satisfied) { initialized = true; return; }
      if (achievements.query() == null) {
        // The native session may be replaced while the public config loads.
        // This is a wait state, not a failure or an attempt sent to the game.
        initialized = false; nextAutoAt = Date.now() + 1000; return;
      }
      attempted();
      if (!inFlight(task) || task.satisfied) return;
      const timeout = () => {
        if (request !== task) return;
        if (!inFlight(task) || !canQuery()) retryWhenReady();
        else { cancel(); error = '战功查询超时。保留上次本机快照，请稍后重试。'; }
        notify();
      };
      const timer = ctx.window.setTimeout(timeout, 12000);
      task.cancelTimer = ctx.scope.add(() => ctx.window.clearTimeout(timer));
    } catch (e) {
      if (inFlight(task) && canQuery()) { attempted(); cancel(); fail(e); }
    } finally {
      if (request === task && !task.cancelTimer) { cancel(); notify(); }
    }
  }
  configs(); sync();
  const onGap = detail => {
    if (detail?.reason === 'rebind') retryWhenReady();
    else { cancel(); error = '战功消息有缺口，请刷新官方进度；当前显示为上次快照。'; }
    notify();
  };
  achievements.subscribe(snapshot => accept('ClientDbsGetuserachinfoRep', snapshot, ctx.native.account()), onGap);
  ctx.native.observe({ GsClientAchievementProgressUpdate: packet => ({ id: Number(field(packet, 'CriteriaID')), value: Number(field(packet, 'Conut')) }) }, accept, onGap);
  const initialize = () => {
    sync();
    const ready = canQuery();
    const interrupted = request && (!ready || !sameConnection(request));
    if (interrupted) retryWhenReady();
    if (lastReady !== ready || interrupted) { lastReady = ready; notify(); }
    if (ready && !initialized && !request && autoAttempts < 3 && Date.now() >= nextAutoAt) void refresh();
  };
  ctx.scope.timeout(initialize, 0); ctx.scope.interval(initialize, 500);
  ctx.scope.add(() => { cancel(); listeners.clear(); });
  return { refresh, view() { sync(); configs(); const gm = ctx.native.manager('GameGeneralManager', 'ClientGeneralFromRep', m => typeof m.HasGeneral === 'function');
    return { who, snapshot, error: error || configError, ready: canQuery(), loading: Boolean(request),
      rows: evaluate(defs, snapshot, names, id => gm ? read(() => gm.HasGeneral(id)) ?? null : null) }; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}
export function activate(ctx) {
  const controller = createController(ctx);
  ctx.ui.registerPanel({ id: 'main', category: 'info', render(container) {
    const ui = ctx.ui.panel(container), { root, el, listen, input, button, segments } = ui;
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
      refresh.disabled = !v.ready || v.loading; refresh.lastChild.textContent = v.loading ? '查询中…' : '刷新战功'; exportButton.disabled = !snapshot;
      note.hidden = v.ready;
      note.textContent = !v.who.id ? '等待登录当前账号' : !v.who.nickname ? '等待角色资料' : '等待战功接口就绪';
      const ownedUnknown = v.rows.some(row => row.owned === null);
      let rows = v.rows.filter(row => owned !== 'owned' || row.owned !== false);
      const total = rows.length, complete = snapshot ? rows.filter(row => row.completed).length : null;
      summary.replaceChildren(el('strong', '', snapshot ? String(complete) : '—'), el('span', 'muted', `/ ${total || '—'} 项已完成`));
      rows = rows.filter(row => (status === 'all' || (status === 'complete' ? row.completed === true : row.completed === false)) && (!search || `${row.name} ${row.desc} ${row.skill?.desc || ''}`.includes(search)));
      meta.textContent = `${snapshot ? `快照 ${new Date(snapshot.at).toLocaleString()}` : v.ready ? '点击刷新读取官方进度' : '尚未同步战功'}${owned === 'owned' && ownedUnknown ? ' · 归属未知的武将暂时保留' : ''} · 显示 ${rows.length} 项`;
      error.hidden = !v.error; errText.textContent = v.error;
      list.replaceChildren();
      for (const row of rows) {
        const node = el('article', 'row'), head = el('div', 'row-head'), name = el('span', 'name', row.name); name.title = [row.name, row.desc].filter(Boolean).join('\n');
        head.append(name, el('span', 'number', row.completed ? '已完成' : row.value === null ? '进度未知' : `${row.value} / ${row.required || '未知'}`));
        const progress = el('progress', 'progress'); progress.max = 100;
        progress.value = row.completed ? 100 : row.value === null || !row.required ? 0 : Math.min(100, row.value * 100 / row.required);
        progress.setAttribute('aria-label', `${row.name}战功进度`);
        if (!row.completed && (row.value === null || !row.required)) { progress.hidden = true; }
        node.append(head, progress);
        if (row.finishTime) node.append(el('div', 'muted', `百胜完成于 ${new Date(row.finishTime * 1000).toLocaleDateString()}`));
        const skill = row.skill ? !snapshot ? '未查询' : row.skill.completed ? '已完成' : '未完成' : '无对应定义';
        node.append(el('div', 'muted', `技能战功：${skill}`));
        if (row.skill) { const desc = el('p', 'muted', row.skill.desc || '技能战功说明暂未取得'); desc.style.whiteSpace = 'pre-wrap'; desc.style.margin = '3px 0 0'; node.append(desc); }
        list.append(node);
      }
      if (!rows.length) list.append(el('p', 'empty', !v.who.id ? '登录后可查询战功' : !v.rows.length
        ? v.ready && !v.loading ? '尚未加载战功定义，请点击刷新' : '尚未加载战功定义'
        : '没有符合筛选的战功'));
    }
    const off = controller.subscribe(draw); draw();
    return ctx.scope.add(() => { alive = false; off(); ui.dispose(); });
  } });
}
export default { manifest, activate };
