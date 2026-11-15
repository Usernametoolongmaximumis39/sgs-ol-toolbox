import { downloadJSON } from '../../shared/info-runtime.js';
import { panelUI } from '../../shared/info-ui.js';
import { MODES, filterRecords } from './model.js';
import { resultName, winSummary, retainedScope } from './battle.js';
import { groupedStatistics, sideOf, sideName } from './groups.js';
import { createController, BACKUP_FORMAT } from './controller.js';
const percent = value => value == null ? '未知' : `${(value * 100).toFixed(1)}%`;
export function activate(ctx) {
  const controller = createController(ctx);
  ctx.ui.registerPanel({ id: 'main', category: 'info', render(container) {
    const ui = panelUI(ctx, container), { root, el, listen, input, button, segments } = ui;
    let tab = 'stats', mode = 0, search = '', sort = 'appear', min = 0, start = 0, end = 0, role = 'all', count = 50, alive = true, confirmAccount = null;
    const note = el('p', 'muted'), summary = el('div', 'stat'), totals = el('p', 'muted'), state = el('p', 'muted'), bar = el('div', 'bar');
    const refresh = button('武将名称', 'refresh', () => controller.refreshNames()); refresh.title = '按需加载官方公共武将名称';
    const exportButton = button('导出', 'download', () => { const v = controller.view(); downloadJSON(ctx, `出框与胜率统计-${v.who.id}.json`, {
      format: BACKUP_FORMAT, schema: 1, accountId: v.who.id, startedAt: v.startedAt, records: v.records, matches: v.matches }); });
    bar.append(refresh, exportButton);
    const tabs = segments([['stats', '统计总览'], ['history', '对局历史']], tab, v => { tab = v; count = 50; draw(); });
    const modes = segments([[0, '全部'], [26, '排位'], [35, '斗地主'], [44, '单骑']], mode, v => { mode = v; role = 'all'; count = 50; draw(); });
    const find = input('搜索武将'); listen(find, 'input', () => { search = find.value.trim(); count = 50; draw(); });
    const filters = el('details', 'sgs-fold'), fields = el('div', 'filters');
    const minimum = input('最少出框或出场次数', 'number'); minimum.min = '0'; minimum.value = '0';
    const from = input('开始时间', 'datetime-local'), to = input('结束时间', 'datetime-local');
    for (const [label, node] of [['最少次数', minimum], ['开始时间', from], ['结束时间', to]]) { const n = el('label', '', label); n.append(node); fields.append(n); }
    listen(minimum, 'input', () => { min = Math.max(0, Number(minimum.value) || 0); count = 50; draw(); });
    const dates = () => { start = from.value ? new Date(from.value).getTime() : 0; end = to.value ? new Date(to.value).getTime() : 0; count = 50; draw(); };
    listen(from, 'change', dates); listen(to, 'change', dates);
    const roles = el('div', 'side-options'), roleGroups=[];
    for(const id of [26,35,44]){
      const items=id===35?[['all','不限'],['landlord','地主'],['farmer','农民']]
        :[['all','不限'],['first','先手'],['second','后手']];
      const group=segments(items,role,v=>{role=v;count=50;draw();});group.setAttribute('aria-label',MODES[id]+'身份与先后手');
      roles.append(group);roleGroups.push({id,group,items});
    }
    const sideHelp=el('p','muted');roles.append(sideHelp);
    const sorts = segments([['appear', '出框'], ['played', '出场'], ['rate', '胜率'], ['name', '名称']], sort, v => { sort = v; count = 50; draw(); });
    filters.append(el('summary', '', '筛选与排序'), fields, sorts);
    const error = el('details', 'error'), errText = el('p'), retry = button('重试保存', 'save', () => controller.retry());
    error.append(el('summary', '', '记录异常 · 查看详情'), errText, retry);
    const list = el('div', 'list'); list.setAttribute('aria-label', '出框与战绩记录');
    const more = button('加载更多', null, () => { count += 50; draw(); });
    const help = el('details', 'sgs-fold');
    help.append(el('summary', '', '统计口径与数据记录'), el('p', '', '仅统计正式排位、斗地主基础/高级场和单骑无双；自由欢乐22、排位演武、公会战22、赛事及扑克牌斗地主不采集。单骑依据客户端明确人机标记剔除；未标记的显示身份未知，不按昵称猜测。\n出框率＝出现局数/已采集候选的局数；选取率＝选中次数/选取结果已知的出框次数。胜率＝胜场/(胜场+败场)，平局及结果未知不计分母。相同武将每局只算一次。\n结算只认自己座位的结果。斗地主按地主/农民分开；排位1、4号位为先手，2、3号位为后手；单骑按先手/后手分开。座次读取客户端已确定的一基行动顺序，不把协议座位ID当成号位。缺少身份或先后手依据的数据不保存、不统计；旧数据及恢复备份中的此类记录会剔除。每个模式与身份组独立计算出框率、选取率、胜率，出框率分母仅为同组候选局数。历史出框没有胜负信息，不补造胜率；未采到候选的已完成对局可只计战绩。平均时长来自官方结算。\n只在启用期间采集；断线、重连、消息缺口不补记，已有出框保留。出框和战绩各最多10000条，满后暂停对应追加。仅存本机、按账号隔离，无上传或云同步。'));
    const restoreInput = input('恢复工具箱备份', 'file'); restoreInput.accept = '.json,application/json'; restoreInput.hidden = true;
    const restore = button('恢复工具箱备份', 'download', () => restoreInput.click());
    listen(restoreInput, 'change', () => { const file = restoreInput.files?.[0]; if (file) void controller.restore(file); restoreInput.value = ''; });
    const clear = button('清空本机记录', 'trash', () => { confirmAccount = controller.view().who.id; confirmation.hidden = false; }); clear.className = 'danger';
    const confirmation = el('div'); confirmation.hidden = true;
    const yes = button('确认清空', null, () => { if (controller.view().who.id === confirmAccount) controller.clear(); confirmation.hidden = true; confirmAccount = null; }); yes.className = 'danger';
    const no = button('取消', null, () => { confirmation.hidden = true; confirmAccount = null; });
    confirmation.append(el('p', 'muted', '将删除当前账号的全部本机出框和战绩，请先导出备份。'), yes, no);
    help.append(restore, restoreInput, clear, confirmation);
    root.append(note, summary, totals, state, bar, tabs, modes, roles, find, filters, error, list, more, help);
    function metrics(node, values) { const m = el('div', 'metrics'); for (const [value, label] of values) { const n = el('span', '', label); n.prepend(el('b', '', String(value))); m.append(n); } node.append(m); }
    function draw() {
      if (!alive || ctx.scope.signal.aborted) return;
      const v = controller.view(), busy = v.reviewing || v.restoring;
      if (confirmAccount && confirmAccount !== v.who.id) { confirmation.hidden = true; confirmAccount = null; }
      note.textContent = v.who.id ? `账号 ${v.who.id} · 本机记录` : '等待登录当前账号';
      refresh.disabled = !v.who.id || v.loading; exportButton.disabled = !v.who.id || busy;
      clear.disabled = !v.who.id || busy || (!v.records.length && !v.matches.length && !v.storageBlocked); restore.disabled = !v.who.id || busy || v.storageBlocked;
      roles.hidden = !mode;
      for(const {id,group,items} of roleGroups){group.hidden=id!==mode;[...group.children].forEach((b,i)=>b.setAttribute('aria-pressed',String(items[i][0]===role)));}
      sideHelp.hidden=mode!==26;sideHelp.textContent='先手：1、4号位 · 后手：2、3号位';
      const matchesById = new Map(v.matches.map(m => [m.id, m]));
      const scoped = rows => filterRecords(rows.filter(r => retainedScope(r) && sideOf(r,matchesById.get(r.id))!=='unknown' && (r.mode !== 44 || r.isAiMatch !== true)), { mode, start, end }, v.names)
        .filter(r => !mode || role==='all' || sideOf(r,matchesById.get(r.id))===role);
      const frames = scoped(v.records), battles = scoped(v.matches), overall = winSummary(battles);
      const stats = groupedStatistics(frames,battles,v.names).filter(r => Math.max(r.appear, r.played) >= min && (!search || r.name.includes(search)))
        .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'zh') : (b[sort] ?? -1) - (a[sort] ?? -1) || b.appear - a.appear || a.id - b.id);
      summary.replaceChildren(el('strong', '', busy ? '—' : percent(overall.rate)), el('span', 'muted', busy ? '核对本机数据中' : '当前筛选合计胜率'));
      totals.textContent = busy ? '正在处理本机记录…' : `${frames.length} 局出框 · ${battles.length} 局战绩 · ${overall.wins}胜 ${overall.losses}负${overall.draws ? ` ${overall.draws}平` : ''}${overall.unknown ? ` · ${overall.unknown}局结果未知` : ''}`;
      const unknownCount = new Set([...frames, ...battles].filter(r => r.mode === 44 && r.isAiMatch == null).map(r => r.id)).size;
      state.textContent = busy ? '正在核对并剔除已确认的百胜速刷记录…' : `${v.records.length} 条出框 · ${v.matches.length} 条战绩已保存${v.gaps ? ` · ${v.gaps} 次记录缺口` : ''}${unknownCount ? ` · ${unknownCount}局单骑人机身份未知` : ''}`;
      error.hidden = !v.error; errText.textContent = v.error; retry.disabled = !v.who.id || v.reviewing;
      list.replaceChildren();
      let show = stats;
      if (tab === 'history') {
        const history = new Map(frames.map(f => [f.id, { ...f, match: matchesById.get(f.id) }]));
        for (const b of battles) if (!history.has(b.id)) history.set(b.id, { ...b, selected: b.general, general: null, match: b });
        show = [...history.values()].filter(r => !search || [...(r.general || []), ...(r.selected || [])].some(id => (v.names[id] || `武将 #${id}`).includes(search))).sort((a, b) => b.time - a.time);
      }
      if (!busy) for (const row of show.slice(0, count)) {
        const node = el('article', 'row');
        if (tab === 'stats') {
          const name = el('span', 'name', row.name); name.title = row.name;
          const head = el('div', 'row-head'); head.append(name, el('span', 'number', `${row.frameCount ? (100 * row.appear / row.frameCount).toFixed(1) : '0.0'}% 出框率`)); node.append(head, el('div', 'muted stat-group', row.groupLabel));
          metrics(node, [[row.appear, '出框'], [row.selected, '选中'], [percent(row.selectionRate), '选取率'], [row.wins, '胜场'], [row.losses, '败场'], [percent(row.rate), '胜率']]);
          node.append(el('div', 'muted', `${row.played}局战绩${row.draws ? ` · ${row.draws}平` : ''}${row.unknown ? ` · ${row.unknown}局结果未知` : ''}${row.duration != null ? ` · 平均${Math.round(row.duration)}秒` : ''}${row.appear > row.known ? ` · ${row.appear - row.known}次选取未知` : ''}`));
        } else {
          const m = row.match, selected = row.selected;
          node.append(el('div', 'row-head', `${new Date(row.time).toLocaleString()} · ${MODES[row.mode]} · ${sideName(row.mode,sideOf(row,m))}`),
            el('div', '', `出框：${row.general ? row.general.map(id => v.names[id] || `#${id}`).join('、') : '未采集候选'}`),
            el('div', '', `选中：${selected === null ? '未确认' : selected.map(id => v.names[id] || `#${id}`).join('、') || '未选取'}`),
            el('div', 'muted', `${resultName(m?.result)}${m?.duration != null ? ` · ${Math.round(m.duration)}秒` : ''}${row.mode === 44 && row.isAiMatch == null ? ' · 人机身份未知' : ''}`));
        }
        list.append(node);
      }
      if (!show.length && !busy) list.append(el('p', 'empty', v.who.id ? '没有符合筛选的记录' : '登录后开始记录'));
      more.hidden = busy || show.length <= count;
    }
    const off = controller.subscribe(draw); draw();
    return ctx.scope.add(() => { alive = false; off(); ui.dispose(); });
  } });
}
