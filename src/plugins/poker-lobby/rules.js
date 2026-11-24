import { getPokerModeConfig } from './activity-entry.js';

const replacements = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeText = text => text.replace(/[&<>"']/g, character => replacements[character]);

export function formatPokerRules(row) {
  if (typeof row?.ModelBelongDesc !== 'string') return '';
  return row.ModelBelongDesc.split('|').map(section => {
    const lines = section.split('&').map(line => escapeText(line.trim())).filter(Boolean);
    const heading = lines.shift();
    return heading ? [`【${heading}】`, ...lines].join('<br>') : '';
  }).filter(Boolean).join('<br><br>');
}

export function bindPokerRules(ctx, scene, Laya) {
  const { scope } = ctx;
  const stock = scene.showRuleWin;
  if (typeof stock !== 'function') return;
  const view = scene.topView;
  const click = Laya.Event.CLICK;
  const button = [...(view.textureList || []), ...(view.drawContaniers || []), ...(view._children || [])].find(node => {
    const events = node?._events?.[click];
    return (Array.isArray(events) ? events : [events]).some(event => event?.caller === scene && event.method === stock);
  });
  let pending = false;
  const account = ctx.native.account().id;
  const active = () => !scope.closed && ctx.game.getScene() === scene && ctx.native.account().id === account;
  async function show() {
    if (pending || !active()) return;
    pending = true;
    try {
      const rules = formatPokerRules(await getPokerModeConfig(ctx));
      if (!active()) return;
      const dispatcher = ctx.game.getDispatcher();
      if (!rules || typeof dispatcher?.ShowWindowAfterCloseOther !== 'function') throw new Error();
      dispatcher.ShowWindowAfterCloseOther('CommonRuleWindow', null, rules);
    } catch {
      if (active()) ctx.notify('三国斗地主规则暂不可用，请稍后重试。');
    } finally {
      pending = false;
    }
  }
  scope.patch(scene, 'showRuleWin', () => show);
  if (!button) return;
  button.off(click, scene, stock);
  button.on(click, scope, show);
  scope.add(() => {
    if (scene.destroyed || button.destroyed) return;
    button.off(click, scope, show);
    button.on(click, scene, stock);
  });
}
