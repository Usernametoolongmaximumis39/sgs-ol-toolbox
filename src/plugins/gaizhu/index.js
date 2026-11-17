import { PLUGIN_ICONS } from '../../ui/plugin-icons.js';
import { createGaiZhu } from './runtime.js';

export const manifest = {
  id: 'gaizhu', name: '盖主速刷', version: '0.1.16', apiVersion: 1, contractVersion: 1,
  releaseNotes: "新增反贼房主单人百胜和单骑人机训练，优先使用小杀助手提示，并提供取消无懈选项。需手动开始；点将可能消耗道具，单骑训练自动选购可能消耗局内货币。", minCoreVersion: '0.6.37', dependencies: ['baisheng'], description: '支持盖主速刷、反贼房主单人百胜和单骑人机训练；单人对局优先接受小杀助手提示，超时本地处理与托管兜底。',
  icon: PLUGIN_ICONS['gaizhu'], priority: 21000, categories: ['automation'],
};

export function renderPanel(ctx, controller, container) {
  const doc = ctx.document, releases = [];
  let mounted = true, draftRole = 'host', lastAccount;
  const el = (tag, text, className) => {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const listen = (target, type, fn) => releases.push(ctx.scope.listen(target, type, fn));
  const root = el('section'); root.dataset.gaizhu = '';
  const style = el('style'); style.textContent = `
    [data-gaizhu]{min-width:0;color:var(--sgs-text);font:12px/1.6 var(--sgs-font,sans-serif)}
    [data-gaizhu] *,[data-gaizhu] *::before,[data-gaizhu] *::after{box-sizing:border-box}
    [data-gaizhu] [hidden]{display:none!important}
    [data-gaizhu] p{margin:0;overflow-wrap:anywhere}
    [data-gaizhu] .gz-note{color:var(--sgs-muted);font-size:11px}
    [data-gaizhu] .gz-field{margin-top:13px;min-width:0}
    [data-gaizhu] h3,[data-gaizhu] .gz-label{margin:0 0 6px;font-size:11px;font-weight:600;color:var(--sgs-muted)}
    [data-gaizhu] button{font-family:inherit;cursor:pointer;line-height:1.5}
    [data-gaizhu] button:focus-visible{outline:1px solid var(--sgs-accent);outline-offset:2px}
    [data-gaizhu] button:disabled{opacity:.45;cursor:not-allowed}
    [data-gaizhu] .gz-roles>button{padding:7px 4px;font-size:12px}
    [data-gaizhu] .gz-roles small{display:block;margin-top:1px;font-size:10px;font-weight:400;color:var(--sgs-muted)}
    [data-gaizhu] .gz-picks>button{padding:6px 2px;min-height:30px;font-size:11px;white-space:nowrap}
    [data-gaizhu] .gz-wait{display:flex;align-items:center;gap:10px;margin-top:13px;padding:9px 0;border-top:1px solid color-mix(in srgb,var(--sgs-border) 40%,transparent)}
    [data-gaizhu] .gz-wait-copy{min-width:0;flex:1}
    [data-gaizhu] .gz-wait-copy>span{display:block}
    [data-gaizhu] .gz-wait-copy small{display:block;font-size:10px;color:var(--sgs-muted);overflow-wrap:anywhere}
    [data-gaizhu] .gz-wait-state{font-size:10px;color:var(--sgs-muted);white-space:nowrap}
    [data-gaizhu] .gz-caution{margin-top:8px;padding-left:8px;border-left:2px solid color-mix(in srgb,var(--sgs-accent) 55%,var(--sgs-border));font-size:10px;color:var(--sgs-muted)}
    [data-gaizhu] .gz-action{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;min-height:34px;margin-top:13px;padding:7px 10px;border:1px solid color-mix(in srgb,var(--sgs-accent) 40%,transparent);border-radius:7px;background:linear-gradient(color-mix(in srgb,var(--sgs-accent) 18%,var(--sgs-surface)),color-mix(in srgb,var(--sgs-accent) 8%,var(--sgs-surface)));color:var(--sgs-accent);box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-text) 5%,transparent);font-size:12px}
    [data-gaizhu] .gz-action:hover:enabled{border-color:var(--sgs-accent)}
    [data-gaizhu] .gz-action.is-running{background:var(--sgs-surface);color:var(--sgs-danger);border-color:color-mix(in srgb,var(--sgs-danger) 35%,transparent)}
    [data-gaizhu] .gz-status{margin-top:10px;padding-left:8px;border-left:2px solid var(--sgs-border);color:var(--sgs-muted);font-size:11px}
    [data-gaizhu] .gz-status.is-error{color:var(--sgs-danger);border-color:var(--sgs-danger)}
    [data-gaizhu] .gz-password{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;font-variant-numeric:tabular-nums}
    [data-gaizhu] .gz-meta{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-top:7px;color:var(--sgs-muted);font-size:10px;font-variant-numeric:tabular-nums}
    [data-gaizhu] .gz-meta>span:first-child{min-width:0;overflow-wrap:anywhere}
    [data-gaizhu] .gz-meta>span:last-child{flex:none}
    [data-gaizhu] details{margin-top:6px;min-width:0}
    [data-gaizhu] details>summary{font-size:11px}
    [data-gaizhu] pre{max-height:180px;overflow:auto;margin:0 0 7px;white-space:pre-wrap;overflow-wrap:anywhere;font:10px/1.6 var(--sgs-font,sans-serif);color:var(--sgs-muted)}
    [data-gaizhu] .gz-error pre{color:var(--sgs-danger)}
  `;
  const intro = el('p', '双人进入同一身份房；单人用反贼大号坐房主，或进入单骑人机训练。', 'gz-note');
  const roleField = el('div', undefined, 'gz-field'), roleTitle = el('h3', '本端角色');
  const roleGroup = el('div', undefined, 'sgs-segments gz-roles'); roleGroup.setAttribute('role', 'group'); roleGroup.setAttribute('aria-label', '本端角色');
  const roleButtons = new Map();
  for (const [role, title, description] of [['host', '盖主小号', '房主 · 黄盖'], ['rebel', '反贼大号', '百胜 · 单人 / 双人']]) {
    const button = el('button', title); button.type = 'button'; button.dataset.role = role;
    button.setAttribute('aria-label', title); button.title = `${title} · ${description}`;
    button.append(el('small', description)); listen(button, 'click', () => { draftRole = role; redraw(); });
    roleButtons.set(role, button); roleGroup.append(button);
  }
  roleField.append(roleTitle, roleGroup);
  const pickField = el('div', undefined, 'gz-field'), pickTitle = el('p', '点将 · 百胜轮换', 'gz-label');
  const pickGroup = el('div', undefined, 'sgs-segments gz-picks'); pickGroup.setAttribute('role', 'group'); pickGroup.setAttribute('aria-label', '百胜点将方式');
  const pickButtons = new Map();
  for (const [pick, title] of [['off', '不点将'], ['random', '随机点将'], ['order', '按序点将']]) {
    const button = el('button', title); button.type = 'button'; button.dataset.pick = pick;
    button.title = pick === 'order' ? '技能战功已完成优先，再按百胜进度排序' : pick === 'random' ? '在已拥有、百胜未完成的武将中随机轮换' : '不设置反贼点将槽，按开局候选选将';
    listen(button, 'click', () => controller.setOptions({ pick })); pickButtons.set(pick, button); pickGroup.append(button);
  }
  pickField.append(pickTitle, pickGroup);
  const waitRow = el('label', undefined, 'gz-wait'), waitCopy = el('span', undefined, 'gz-wait-copy');
  waitCopy.append(el('span', '等1分钟'), el('small', '前45秒烧条，剩3秒苦肉；之后立即收尾。'));
  const waitState = el('span', undefined, 'gz-wait-state'), waitInput = ctx.ui.styleSwitch(el('input')); waitInput.type = 'checkbox'; waitInput.setAttribute('aria-label', '等1分钟');
  waitRow.append(waitCopy, waitState, waitInput); listen(waitInput, 'change', () => controller.setOptions({ wait: waitInput.checked }));
  const wuxieRow = el('label', undefined, 'gz-wait'), wuxieCopy = el('span', undefined, 'gz-wait-copy');
  wuxieCopy.append(el('span', '取消无懈'), el('small', '单人百胜和单骑训练默认跳过无懈；关闭后按助手和锦囊来源判断。'));
  const wuxieInput = ctx.ui.styleSwitch(el('input')); wuxieInput.type = 'checkbox'; wuxieInput.setAttribute('aria-label', '取消无懈');
  wuxieRow.append(wuxieCopy, wuxieInput); listen(wuxieInput, 'change', () => controller.setOptions({ cancelWuxie: wuxieInput.checked }));
  const caution = el('p', undefined, 'gz-caution');
  const action = el('button', undefined, 'gz-action'); action.type = 'button';
  const actionIcon = el('span'), actionText = el('span'); actionIcon.setAttribute('aria-hidden', 'true'); action.append(actionIcon, actionText);
  listen(action, 'click', () => { const s = controller.snapshot(); controller.setOptions({ role: s.role === 'off' ? draftRole : 'off' }); });
  const status = el('p', undefined, 'gz-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const passwordRow = el('div', undefined, 'gz-password'), passwordText = el('span'), copyPassword = el('button', '复制密码', 'sgs-btn');
  passwordRow.dataset.roomPassword = ''; copyPassword.type = 'button';
  passwordRow.append(passwordText, copyPassword);
  listen(copyPassword, 'click', async () => {
    const value = controller.snapshot().roomPassword;
    if (!value) return;
    try {
      await (ctx.window || doc.defaultView).navigator.clipboard.writeText(value);
      if (mounted) copyPassword.textContent = '已复制';
    } catch { if (mounted) copyPassword.textContent = '复制失败，请选取密码'; }
  });
  const meta = el('div', undefined, 'gz-meta'), general = el('span'), rounds = el('span'); meta.append(general, rounds);
  const errors = el('details', undefined, 'sgs-fold gz-error'), errorSummary = el('summary', '查看完整错误'), errorText = el('pre'); errors.append(errorSummary, errorText);
  const history = el('details', undefined, 'sgs-fold'), historySummary = el('summary', '运行记录'), historyText = el('pre'); history.append(historySummary, historyText);
  root.append(style, intro, roleField, pickField, waitRow, wuxieRow, caution, action, status, passwordRow, meta, errors, history); container.append(root);
  let previousRunning;
  function redraw() {
    if (!mounted) return;
    const s = controller.snapshot(), running = s.role === 'host' || s.role === 'rebel';
    if (lastAccount !== undefined && lastAccount !== s.account) draftRole = 'host';
    lastAccount = s.account;
    if (running) draftRole = s.role;
    for (const [role, button] of roleButtons) { button.disabled = !s.account || running; button.setAttribute('aria-pressed', String(draftRole === role)); }
    for (const [pick, button] of pickButtons) { button.disabled = !s.account || running; button.setAttribute('aria-pressed', String(s.pick === pick)); }
    pickField.hidden = draftRole !== 'rebel';
    pickTitle.textContent = s.training ? '单骑人机不支持点将 · 设置暂不生效' : '点将 · 百胜轮换';
    if (s.training) for (const button of pickButtons.values()) button.disabled = true; waitRow.hidden = draftRole !== 'host';
    wuxieRow.hidden = draftRole !== 'rebel'; wuxieInput.checked = s.cancelWuxie !== false; wuxieInput.disabled = !s.account;
    waitInput.checked = Boolean(s.wait); waitInput.disabled = !s.account; waitState.textContent = s.wait ? '已开启' : '已关闭';
    caution.textContent = s.training ? '优先执行小杀助手提示，超时本地处理并托管兜底，拒绝手气卡并自动续局。商店沿用选购规则，可能消耗局内货币；点将设置不生效。' : draftRole === 'host' ? '开始后自动补普通小杀、点将黄盖并苦肉求死。房间点将可能消耗点将资源。' : s.pick === 'off' ? '拒绝手气卡。双人时自动准备、选将并托管；反贼房主单人时补小杀开局，优先执行小杀助手提示，超时本地处理并托管兜底。单骑训练自动选购，可能消耗局内货币。' : '按所选方式点将，可能消耗游戏点将卡等资源。双人时托管；单人房主优先执行小杀助手提示，超时本地处理并托管兜底。单骑训练自动选购，可能消耗局内货币。';
    action.disabled = !s.account && !running; action.classList.toggle('is-running', running);
    actionText.textContent = running ? '停止速刷' : '开始速刷'; action.setAttribute('aria-label', actionText.textContent); action.title = running ? '停止本端自动操作' : `开始${draftRole === 'host' ? '盖主小号' : '反贼大号'}速刷`;
    if (previousRunning !== running) { previousRunning = running; actionIcon.replaceChildren(ctx.ui.icon(running ? 'pause' : 'play')); }
    status.textContent = s.status || (s.account ? '已停止，点击开始后运行。' : '等待登录账号。'); status.classList.toggle('is-error', Boolean(s.error));
    passwordRow.hidden = !s.roomPassword; copyPassword.disabled = !s.account || !s.roomPassword;
    passwordText.textContent = s.roomPassword ? '房间已设置密码 · ' + s.roomPassword : '';
    copyPassword.title = '复制房间密码（保留前导零）';
    general.textContent = s.generalName ? `当前武将 · ${s.generalName}` : running ? '等待识别武将' : '尚未运行'; general.title = general.textContent;
    rounds.textContent = `已完成 ${Number.isSafeInteger(s.rounds) && s.rounds >= 0 ? s.rounds : '未知'} 局`;
    errors.hidden = !s.error; errorText.textContent = s.error || '';
    history.hidden = !Array.isArray(s.log) || !s.log.length; historyText.textContent = Array.isArray(s.log) ? s.log.join('\n') : '';
  }
  releases.push(controller.subscribe(redraw)); redraw();
  return ctx.scope.add(() => {
    if (!mounted) return; mounted = false;
    for (const release of releases.splice(0)) release?.();
    root.remove();
  });
}

export default {
  manifest,
  activate(ctx) {
    const controller = createGaiZhu(ctx);
    ctx.ui.registerPanel({ id: 'main', category: 'automation', render: container => renderPanel(ctx, controller, container) });
  },
};
