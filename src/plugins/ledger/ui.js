import { panelUI } from '../../shared/info-ui.js';
import { downloadJSON } from '../../shared/info-runtime.js';
import { filterRecords, totals, canAlert } from './model.js';
const STYLES = `
.sgs-ledger .alert-settings{margin:8px 0}.sgs-ledger .alert-settings summary{color:var(--sgs-accent);padding:5px 0}.sgs-ledger .threshold{display:grid;grid-template-columns:minmax(0,1fr) 108px;align-items:center;gap:8px;font-size:10px;color:var(--sgs-muted);margin-top:6px}.sgs-ledger .threshold input{width:100%;min-width:0;padding:5px 32px 5px 9px;text-align:right;appearance:textfield;-moz-appearance:textfield;font-variant-numeric:tabular-nums}.sgs-ledger .threshold input::-webkit-inner-spin-button,.sgs-ledger .threshold input::-webkit-outer-spin-button{appearance:none;margin:0}
.sgs-ledger .threshold-field{position:relative;min-width:0}.sgs-ledger .threshold-unit{position:absolute;right:8px;top:50%;transform:translateY(-50%);font-size:10px;pointer-events:none;color:var(--sgs-muted)}
.sgs-ledger .alert-settings{border-top:1px solid var(--sgs-border);border-bottom:1px solid var(--sgs-border);padding:5px 0}.sgs-ledger .alert-settings summary{display:flex;align-items:center;gap:7px;list-style:none;min-height:32px}.sgs-ledger .alert-settings summary::-webkit-details-marker{display:none}.sgs-ledger .alert-settings summary:before{content:'';width:5px;height:5px;border-right:1px solid currentColor;border-bottom:1px solid currentColor;transform:rotate(-45deg);transition:transform var(--sgs-motion,0s)}.sgs-ledger .alert-settings[open] summary:before{transform:rotate(45deg)}.sgs-ledger .setting-status{margin-left:auto;font-size:10px;color:var(--sgs-muted)}.sgs-ledger .rules{font-size:10px;color:var(--sgs-muted);margin:10px 0 5px}.sgs-ledger .thresholds{padding-bottom:2px}
.sgs-ledger-alert{position:fixed;z-index:2147483647;inset:15% auto auto 50%;transform:translateX(-50%);width:min(420px,calc(100vw - 32px));padding:20px;background:var(--sgs-bg);border:1px solid var(--sgs-danger);border-radius:12px;box-shadow:0 12px 48px #0008;max-height:70vh;overflow:auto}
.sgs-ledger .assets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 10px}
.sgs-ledger .asset{padding:8px 0;min-width:0;border-bottom:1px solid color-mix(in srgb,var(--sgs-border) 50%,transparent)}
.sgs-ledger .asset-head{display:flex;gap:5px;align-items:center;min-width:0}
.sgs-ledger .asset img{width:24px;height:24px;object-fit:contain;flex:none}.sgs-ledger .asset .name{font-size:11px}
.sgs-ledger .balance{font-size:19px;line-height:1.5;font-variant-numeric:tabular-nums;color:var(--sgs-text)}
.sgs-ledger .flow{font-size:10px;font-variant-numeric:tabular-nums;display:flex;flex-wrap:wrap;gap:2px 9px}
.sgs-ledger .income{color:var(--sgs-accent)}.sgs-ledger .expense{color:var(--sgs-text)}
.sgs-ledger .asset-id{font-size:9px;color:var(--sgs-muted);margin-left:auto;font-variant-numeric:tabular-nums;flex:none}.sgs-ledger h3{font:600 12px var(--sgs-font);margin:16px 0 8px}
.sgs-ledger .reward-list{font-size:11px;overflow-wrap:anywhere}.sgs-ledger .warning{border-left:2px solid var(--sgs-accent);padding-left:8px;color:var(--sgs-muted)}
.sgs-ledger-detail{max-width:1080px;margin:0 auto;padding:24px;background:var(--sgs-bg);min-height:100vh}
.sgs-ledger-detail h1{font-size:23px;font-weight:500;margin:0 0 8px}.sgs-ledger-detail .list{max-height:none;overflow:visible}
.sgs-ledger-detail .filters{grid-template-columns:repeat(2,minmax(0,1fr))}.sgs-ledger-detail .filters label:has(input[type=datetime-local]){grid-column:auto}
.sgs-ledger-detail .filters input{display:block;min-width:0;margin-top:4px}.sgs-ledger-detail .summary-items{display:flex;gap:6px 18px;flex-wrap:wrap;padding:8px 0}
.sgs-ledger-detail .row-head{align-items:flex-start;flex-wrap:wrap}.sgs-ledger-detail .row p{margin:5px 0}.sgs-ledger-detail .log-items{display:flex;flex-wrap:wrap;gap:4px 18px}
@media(max-width:520px){.sgs-ledger-detail{padding:16px}.sgs-ledger-detail .filters{grid-template-columns:1fr}}
`;
const time = at => new Date(at).toLocaleString('zh-CN', { hour12: false });
const format = n => n === null ? '未知' : n.toLocaleString('zh-CN');
const rewardsText = items => items.map(i => `${i.name} × ${format(i.delta)}`).join('、');
const sourceNames = { DbsCcUserGoodshintNtf: '物品到账通知', DbsCcUpdategoodsAttribNtf: '背包数量变化', DbsCcUserDelgoodsNtf: '背包物品移除', DbsCUpdatauserYaunbaoNtf: '元宝收支通知', 120004: '祈愿台成功确认', ClientLoginRep: '登录确认' };
const reasonNames = { 1: '赠送', 2: '购买', 3: '系统赠送', 5: '礼包', 8: '任务奖励', 9: '排位奖励', 15: '签到奖励', 26: '合成', 27: '分解', 58: '祈福', 2010: '祈愿台奖励' };
function setup(ctx, container) {
  const ui = panelUI(ctx, container); ui.root.classList.add('sgs-ledger');
  const style = ui.el('style'); style.textContent = STYLES; ui.root.append(style); return ui;
}
function errorBlock(ui) {
  const node = ui.el('details', 'error'), text = ui.el('p'); node.append(ui.el('summary', '', '账本异常 · 查看完整详情'), text);
  return { node, update(error) { node.hidden = !error; text.textContent = error; } };
}
export function renderPanel(ctx, container, controller) {
  const ui = setup(ctx, container), { el, root } = ui;
  const account = el('p', 'muted'), assets = el('div', 'assets'), note = el('p', 'muted'), bar = el('div', 'bar'), error = errorBlock(ui);
  const refreshButton = ui.button('刷新配置', 'refresh', () => controller.load(true));
  bar.append(ui.button('详细账本', 'info', () => openDetails(ctx, controller)), refreshButton);
  const prayerTitle = el('h3', '', '祈愿台 · 本次登录'), prayers = el('div'), help = el('p', 'muted', '收支分别累计 · 全部日志仅保存在本机');
  const settings = el('details', 'alert-settings'), settingsBody = el('div', 'thresholds'), settingsHelp = el('p', 'muted', '仅比较 7 天内记录 · 0 为关闭'), settingSummary = el('summary'), settingStatus = el('span', 'setting-status');
  settingSummary.append(el('span', '', '预警设置'), settingStatus);
  const rules = el('p', 'rules', '元宝含绑定、限时；玉玺含碎片（10 片 = 1 枚）。如意结仅记录收支。');
  settings.append(settingSummary, settingsHelp, settingsBody, rules);
  let settingsKey = '';
  root.append(account, note, assets, settings, bar, error.node, prayerTitle, prayers, help);
  function draw() {
    const v = controller.view();
    refreshButton.disabled = v.loadingConfig; refreshButton.lastChild.textContent = v.loadingConfig ? '读取中…' : '刷新配置';
    account.textContent = v.who.id ? `${v.who.nickname || '当前账号'} · ${v.who.id}` : '等待登录';
    note.textContent = v.session ? '本次登录 · ' + (v.session.incomplete ? '记录曾中断' : '仅含已观察收支') : '登录后开始观察';
    note.title = v.session ? '观察起于 ' + time(v.session.at) : '';
    const enabled = v.items.filter(row => canAlert(row.ID, row.name) && row.threshold > 0).length;
    settingStatus.textContent = enabled ? enabled + ' 项启用' : '全部关闭';
    error.update(v.error); assets.replaceChildren();
    for (const row of [...v.items].sort((a, b) => Number(canAlert(b.ID, b.name)) - Number(canAlert(a.ID, a.name)))) {
      const item = el('article', 'asset'), head = el('div', 'asset-head'), name = el('span', 'name', row.name); name.title = `${row.name} · ID ${row.ID}`;
      const img = el('img'); img.alt = ''; img.loading = 'lazy';
      const icon = row.icon;
      if (icon) img.src = icon; else img.hidden = true;
      img.onerror = () => { img.hidden = true; }; head.append(img, name);
      const flow = el('div', 'flow'); flow.append(el('span', 'income', `收入 +${format(row.income)}`), el('span', 'expense', `消耗 −${format(row.expense)}`));
      item.append(head, el('div', 'balance', format(row.count)), flow);
      if (Number(row.ID) === 100016) item.title = '元宝余额合计：普通 + 绑定 + 限时；收支仅含已观察到的通知';
      const change = row.comparison;
      if (change?.delta) item.append(el('div', 'asset-change muted', '较上次 ' + (change.delta > 0 ? '+' : '−') + format(Math.abs(change.delta))));
      if (row.name === '如意结') { const id = el('span', 'asset-id', String(row.ID).slice(-4)); id.title = '物品 ID ' + row.ID; head.append(id); } assets.append(item);
    }
    const key = JSON.stringify([v.who.id, v.items.map(row => [row.ID, row.threshold])]);
    if (key !== settingsKey) {
      settingsKey = key; settingsBody.replaceChildren();
      for (const row of v.items.filter(row => canAlert(row.ID, row.name))) {
        const label = el('label', 'threshold', Number(row.ID) === 21223901 ? '玉玺合计' : row.name === '如意结' ? row.name + ' · ' + row.ID : row.name);
        const input = el('input', 'sgs-input'); input.type = 'number'; input.min = '0'; input.step = Number(row.ID) === 21223901 ? '0.1' : '1'; input.value = row.threshold;
        input.setAttribute('aria-label', row.name + '（' + row.ID + '）减少预警阈值');
        input.oninput = () => input.setCustomValidity('');
        input.onchange = () => { if (!controller.setThreshold(Number(row.ID), input.value.trim() ? Number(input.value) : NaN)) { input.setCustomValidity('请输入有效的非负数量'); input.reportValidity(); } };
        const field = el('span', 'threshold-field'), unit = el('span', 'threshold-unit', Number(row.ID) === 21223901 ? '枚' : Number(row.ID) === 100016 ? '元宝' : '个');
        input.disabled = !v.who.id; field.append(input, unit); label.append(field); settingsBody.append(label);
      }
    }
    prayers.replaceChildren();
    if (!v.knotsKnown) prayers.append(el('p', 'muted', '祈福活动状态尚未就绪，如意结暂不展示。'));
    for (const p of v.prayers) {
      const row = el('article', 'row'); row.append(el('strong', '', `${p.name} ${format(p.times)} 次`), el('p', 'reward-list', `获得：${p.rewards.size ? rewardsText([...p.rewards.values()]) : '奖励待核对'}`));
      if (p.pending) row.append(el('p', 'muted', `${p.pending} 笔未关联奖励通知`)); prayers.append(row);
    }
    if (!v.prayers.length) prayers.append(el('p', 'muted', '本次登录暂无已确认祈愿记录'));
    for (const r of v.unmatched) prayers.append(el('p', 'warning reward-list', `未关联次数的祈愿台奖励：${rewardsText(r.items)}`));
  }
  const off = controller.subscribe(draw); draw(); controller.load();
  return ctx.scope.add(() => { off(); ui.dispose(); });
}
export function openDetails(ctx, controller) {
  const win = ctx.window.open('about:blank', '_blank');
  if (!win) { ctx.notify('账本页面被浏览器拦截，请允许此站点打开新页面后重试。'); return; }
  const doc = win.document; doc.title = '账本 · 三国杀OL工具箱'; doc.documentElement.lang = 'zh-CN'; doc.body.replaceChildren(); doc.body.style.margin = '0';
  const child = { ...ctx, window: win, document: doc }, ui = setup(child, doc.body), { el, root } = ui; root.classList.add('sgs-ledger-detail');
  function theme(current) {
    for (const [key, value] of Object.entries(current?.tokens || {})) root.style.setProperty(`--sgs-${key}`, value);
    doc.body.style.background = current?.tokens?.bg || ''; doc.body.style.color = current?.tokens?.text || '';
  }
  theme(ctx.themes.current); const offTheme = ctx.themes.subscribe(theme);
  let period = 'all', kind = 'all', page = 0, alive = true;
  const title = el('h1', '', '账本'), who = el('p', 'muted'), status = el('p', 'warning'), filters = el('div', 'filters');
  const from = ui.input('开始时间', 'datetime-local'), to = ui.input('结束时间', 'datetime-local'), item = ui.input('物品名称或完整 ID');
  for (const [name, input] of [['开始时间', from], ['结束时间', to], ['物品名称或完整 ID', item]]) { const label = el('label', '', name); label.append(input); filters.append(label); ui.listen(input, 'input', () => { page = 0; draw(); }); }
  const periodControl = ui.segments([['all', '全部登录'], ['session', '本次登录']], period, v => { period = v; page = 0; draw(); });
  const kindControl = ui.segments([['all', '全部日志'], ['goods', '物品流水'], ['prayer', '祈愿台']], kind, v => { kind = v; page = 0; draw(); });
  const bar = el('div', 'bar'), count = el('p', 'muted'), summary = el('div', 'summary-items'), logs = el('div', 'list'), error = errorBlock(ui), nav = el('div', 'bar');
  const prev = ui.button('上一页', null, () => { page--; draw(); }), next = ui.button('下一页', null, () => { page++; draw(); }), pageText = el('span', 'muted'); nav.append(prev, pageText, next);
  bar.append(ui.button('导出筛选日志', 'download', () => downloadJSON(child, `账本-${controller.view().who.id}.json`, { schema: 1, account: controller.view().who, exportedAt: new Date().toISOString(), records: selected() })),
    ui.button('清除筛选', 'reset', () => {
      from.value = to.value = item.value = ''; period = kind = 'all'; page = 0;
      for (const group of [periodControl, kindControl]) [...group.children].forEach((button, index) => button.setAttribute('aria-pressed', String(index === 0)));
      draw();
    }));
  root.append(title, who, status, filters, periodControl, kindControl, bar, error.node, count, summary, logs, nav);
  function selected() {
    const v = controller.view();
    return filterRecords(v.records, { from: from.value ? new Date(from.value).getTime() : 0, to: to.value ? new Date(to.value).getTime() : Infinity,
      item: item.value.trim(), kind, session: period === 'session' ? v.session?.id || 'none' : '' }).filter(r => r.items.length || r.kind !== 'goods' || r.prayerReward);
  }
  function draw() {
    if (!alive || win.closed || ctx.scope.signal.aborted) return;
    const v = controller.view(), rows = selected().sort((a, b) => b.at - a.at), pages = Math.max(1, Math.ceil(rows.length / 100)); page = Math.max(0, Math.min(page, pages - 1));
    who.textContent = v.who.id ? `${v.who.nickname || '当前账号'} · ${v.who.id} · 仅保存在当前浏览器` : '等待登录';
    status.textContent = `仅记录插件运行期间观察到的流水，首次背包快照不计为收入。${v.session?.incomplete ? '本次登录记录曾中断，收支不完整。' : ''}`;
    error.update(v.error); count.textContent = `${v.loading ? '正在读取本机历史… · ' : ''}筛选结果 ${rows.length} 条 · 收入与消耗分别统计`;
    prev.disabled = page === 0; next.disabled = page + 1 >= pages; pageText.textContent = `${page + 1} / ${pages} 页`; summary.replaceChildren();
    const names = new Map(rows.flatMap(r => r.items.map(i => [i.id, i.name])));
    for (const [id, total] of totals(rows)) summary.append(el('span', 'muted', `${names.get(id)}：收入 +${format(total.income)} / 消耗 −${format(total.expense)}`));
    logs.replaceChildren();
    for (const row of rows.slice(page * 100, (page + 1) * 100)) {
      const article = el('article', 'row'), head = el('div', 'row-head');
      const label = row.kind === 'prayer' ? `${row.prayer.name} ${format(row.prayer.times)} 次` : row.kind === 'notice' ? '记录说明' : row.prayerReward ? '祈愿台奖励到账' : '物品变动';
      head.append(el('strong', '', label), el('time', 'muted', time(row.at))); article.append(head);
      const items = el('div', 'log-items');
      for (const i of row.items) { const n = el('span', i.delta > 0 ? 'income' : 'expense', `${i.name} ${i.delta > 0 ? '+' : '−'}${format(Math.abs(i.delta))}`); n.title = `物品 ID ${i.id}`; items.append(n); }
      article.append(items);
      if (row.prayer) article.append(el('p', 'reward-list', row.prayer.matched ? `获得：${rewardsText(row.rewards)}` : '奖励通知未关联，待核对'));
      if (row.note) article.append(el('p', '', row.note));
      const reason = row.type == null ? '' : row.source === 'DbsCcUserGoodshintNtf' ? reasonNames[row.type] || `原因类型 ${row.type}` : `原因代码 ${row.type}`;
      article.append(el('p', 'muted', `${sourceNames[row.source] || row.source}${reason ? ` · ${reason}` : ''}${row.giver ? ` · 赠送者 ${row.giver}` : ''}${row.reconciled ? ' · 已与到账通知去重' : ''}${row.linkedPrayer ? ' · 已关联祈愿台成功回包' : ''}`));
      const details = el('details'), raw = el('p'); raw.textContent = JSON.stringify(row, null, 2); details.append(el('summary', '', '具体日志 · 物品 ID 与记录详情'), raw); article.append(details); logs.append(article);
    }
    if (!rows.length) logs.append(el('p', 'empty', '没有符合筛选条件的日志'));
  }
  const off = controller.subscribe(draw);
  const cleanup = ctx.scope.add(() => { if (!alive) return; alive = false; off(); offTheme(); ui.dispose(); });
  const offHide = ctx.scope.listen(win, 'pagehide', () => { cleanup(); offHide(); }, { once: true });
  draw(); controller.load(); return { window: win, dispose: cleanup };
}

export function renderAlerts(ctx, controller) {
  const ui = setup(ctx, ctx.document.body); ui.root.classList.remove('sgs-ledger'); ui.root.classList.add('sgs-ledger-alert');
  ui.root.setAttribute('role', 'alertdialog'); ui.root.setAttribute('aria-label', '重要物品减少预警');
  const messages = ui.el('div');
  ui.root.append(ui.el('h3', '', '重要物品减少预警'), messages, ui.button('知道了，立即检查', 'check', () => controller.dismissAlerts()));
  const theme = current => { for (const [key, value] of Object.entries(current?.tokens || {})) ui.root.style.setProperty('--sgs-' + key, value); };
  theme(ctx.themes.current); const offTheme = ctx.themes.subscribe(theme);
  const draw = () => { const alerts = controller.view().alerts; ui.root.hidden = !alerts.length; messages.replaceChildren(...alerts.map(text => ui.el('p', '', text))); };
  const off = controller.subscribe(draw); draw();
  return ctx.scope.add(() => { off(); offTheme(); ui.dispose(); });
}
