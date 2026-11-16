// Copy this file into your own plugin entry and change its stable identity.
// Local example only: no game actions, network requests or persistent settings.
export const manifest = {
  id: 'example.local-info',
  name: '本地示例',
  version: '0.1.0',
  apiVersion: 1,
  contractVersion: 1,
  minCoreVersion: '0.5.0',
  description: '演示统一图标、主题配色和面板资源清理。',
  releaseNotes: '首次发布：提供跟随主题的只读示例面板。',
  icon: 'info',
  priority: 32768,
  categories: ['tools'],
};

// Keep all styles local. The core already provides the plugin group heading.
const STYLES = `
.example-local-info{min-width:0;color:var(--sgs-text);font:12px/1.65 var(--sgs-font,sans-serif)}
.example-local-info p{margin:0 0 10px;overflow-wrap:anywhere}
.example-local-info .example-description{color:var(--sgs-muted)}
.example-local-info .example-button{display:inline-flex;align-items:center;gap:7px;min-height:32px;max-width:100%;padding:5px 10px;border:1px solid var(--sgs-border);border-radius:7px;background:linear-gradient(var(--sgs-raised),var(--sgs-surface));color:var(--sgs-text);font:inherit;cursor:pointer;box-shadow:0 2px 5px #0002}
.example-local-info .example-button:hover{border-color:var(--sgs-accent);color:var(--sgs-accent)}
.example-local-info .example-button:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}
.example-local-info .example-button:disabled{opacity:.45;cursor:not-allowed}
.example-local-info .example-button svg{flex:none;width:16px;height:16px}
.example-local-info .example-details{margin:10px 0 0;padding-left:10px;border-left:2px solid var(--sgs-border);color:var(--sgs-muted)}
`;

export function activate(ctx) {
  ctx.ui.registerPanel({
    id: 'main',
    category: 'tools',
    priority: 32768,
    render(container) {
      const doc = ctx.document;
      const root = doc.createElement('section');
      root.className = 'example-local-info';
      const style = doc.createElement('style');
      style.textContent = STYLES;
      const intro = doc.createElement('p');
      intro.className = 'example-description';
      intro.textContent = '这是本地开发模板，界面配色会跟随工具箱主题。';
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'example-button';
      button.setAttribute('aria-expanded', 'false');
      button.setAttribute('aria-controls', `${manifest.id}-main-details`);
      button.title = '展开或收起模板说明';
      const label = doc.createElement('span');
      label.textContent = '显示说明';
      button.append(ctx.ui.icon('info'), label);
      const details = doc.createElement('p');
      details.id = `${manifest.id}-main-details`;
      details.className = 'example-details';
      details.hidden = true;
      details.textContent = '替换清单身份后添加自己的功能。面板监听使用 scope 登记，并在返回的清理函数中释放。';
      const offClick = ctx.scope.listen(button, 'click', () => {
        details.hidden = !details.hidden;
        button.setAttribute('aria-expanded', String(!details.hidden));
        label.textContent = details.hidden ? '显示说明' : '收起说明';
      });
      root.append(style, intro, button, details);
      container.append(root);
      // Scope cleanup covers disable/uninstall; render cleanup also covers navigation.
      return ctx.scope.add(() => {
        offClick();
        root.remove();
      });
    },
  });
}

export default { manifest, activate };
