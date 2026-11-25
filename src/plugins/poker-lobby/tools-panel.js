import { ResourceScope } from '../../core/resources.js';

const STYLES = `
  .poker-tools-status{margin:0 0 8px;color:var(--sgs-muted);overflow-wrap:anywhere}
  .poker-tools-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
  .poker-tools-actions button{white-space:nowrap;min-height:30px}
  .poker-tools-actions .poker-tools-primary{font-weight:600;border-color:var(--sgs-accent)}
  .poker-tools-actions .poker-tools-copy{background:transparent;border-color:transparent}
`;

export function registerPokerToolsPanel(ctx, lobby) {
  ctx.scope.add(ctx.ui.registerPanel({
    id: 'main', title: '三国斗地主', category: 'tools',
    render(container) {
      const scope = new ResourceScope();
      const { root, el, button, dispose } = ctx.ui.panel(container);
      scope.add(dispose);
      const status = el('p', 'poker-tools-status');
      status.setAttribute('role', 'status');
      const actions = el('div', 'poker-tools-actions');
      const match = button('开始匹配', null, () => { lobby.actions()?.match(); refresh(); });
      match.classList.add('poker-tools-primary');
      const table = button('切换牌桌', null, () => { lobby.switchTable(); refresh(); });
      const copy = button('复制日志', null, async () => {
        const log = lobby.matchLog();
        if (!log) return;
        try {
          await ctx.window.navigator.clipboard.writeText(log);
          if (!scope.closed) ctx.notify('匹配日志已复制。');
        } catch {
          if (!scope.closed) ctx.notify('无法复制匹配日志，请检查剪贴板权限。');
        }
      });
      copy.classList.add('poker-tools-copy');
      actions.append(match, table, copy);
      root.append(el('style', '', STYLES), status, actions);

      function refresh() {
        const state = lobby.actions();
        const message = state?.status || '请先从活动场进入三国斗地主大厅。';
        const label = state?.label || '开始匹配';
        if (status.textContent !== message) status.textContent = message;
        if (match.textContent !== label) match.textContent = label;
        match.hidden = state?.showAction === false;
        match.disabled = !state?.enabled;
        table.disabled = !lobby.canSwitchTable();
        copy.disabled = !lobby.hasMatchLog();
      }
      refresh();
      scope.interval(refresh, 400);
      return ctx.scope.add(() => scope.dispose());
    },
  }));
}
