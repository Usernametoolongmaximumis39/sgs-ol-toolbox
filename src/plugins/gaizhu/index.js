import { GAIZHU_ICON } from '../../ui/plugin-icons.js';
import { durationOf } from './model.js';
import { createGaiZhu } from './runtime.js';

export const manifest = {
  id: 'gaizhu', name: '盖主速刷', version: '0.2.14', apiVersion: 1, contractVersion: 1,
  releaseNotes: "改进盖主房首局的座位检查、补位与同伴恢复。点将和部分商店操作可能消耗游戏道具或局内货币。",
  minCoreVersion: '0.6.222', dependencies: ['baisheng'], description: '双人盖主速刷，以及身份、国战、单骑自动挂机。',
  icon: GAIZHU_ICON, priority: 21000, categories: ['automation'],
};

const MODULES = [['host', '盖主小号'], ['rebel', '反贼大号'], ['auto', '自动挂机']];
const AUTO_MODES = [['identity', '身份'], ['nation', '国战'], ['training', '单骑']];
const STOP_MODES = [['manual', '手动停止'], ['tavern', '酒馆三项领齐'], ['timed', '定时']];
const POINT_MODES = [['off', '不点将'], ['random', '随机点将'], ['order', '按序点将']];
const POINT_HINTS = {
  off: '从开局候选选将，单人优先品质高的未满百胜武将',
  random: '在已拥有、百胜未完成的武将中随机轮换',
  order: '技能战功已完成优先，再按百胜进度排序',
};

const PANEL_STYLE = `
  [data-gaizhu]{min-width:0;color:var(--sgs-text);font:12px/1.6 var(--sgs-font,sans-serif)}
  [data-gaizhu] *,[data-gaizhu] *::before,[data-gaizhu] *::after{box-sizing:border-box}
  [data-gaizhu] [hidden]{display:none!important}
  [data-gaizhu] p{margin:0;overflow-wrap:anywhere}
  [data-gaizhu] .gz-field{margin-top:12px;min-width:0}
  [data-gaizhu] .gz-module-field{margin-top:3px}
  [data-gaizhu] .gz-label{margin:0 0 5px;font-size:11px;font-weight:600;color:var(--sgs-muted)}
  [data-gaizhu] button{font-family:inherit;cursor:pointer;line-height:1.5}
  [data-gaizhu] button:focus-visible{outline:1px solid var(--sgs-accent);outline-offset:2px}
  [data-gaizhu] button:disabled{opacity:.45;cursor:not-allowed}
  [data-gaizhu] .gz-segments>button{padding:5px 2px;min-height:32px;font-size:11px;white-space:nowrap}
  [data-gaizhu] .gz-segments>button:disabled[aria-pressed=true]{opacity:.86}
  [data-gaizhu] .gz-roles>button{font-size:12px}
  [data-gaizhu] .gz-stop>button:first-child{flex:4}
  [data-gaizhu] .gz-stop>button:nth-child(2){flex:6}
  [data-gaizhu] .gz-stop>button:last-child{flex:3}
  [data-gaizhu] .gz-hours{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:8px}
  [data-gaizhu] .gz-hours input{width:76px;font-variant-numeric:tabular-nums}
  [data-gaizhu] .gz-wait{display:flex;align-items:center;gap:8px;margin-top:10px;padding:8px 0;border-top:1px solid color-mix(in srgb,var(--sgs-border) 40%,transparent)}
  [data-gaizhu] .gz-wait-copy{min-width:0;flex:1}
  [data-gaizhu] .gz-wait-copy>span{display:block}
  [data-gaizhu] .gz-wait-copy small{display:block;font-size:10px;color:var(--sgs-muted);overflow-wrap:anywhere}
  [data-gaizhu] .gz-wait-state{font-size:10px;color:var(--sgs-muted);white-space:nowrap}
  [data-gaizhu] .gz-caution{margin-top:8px;padding-left:8px;border-left:2px solid color-mix(in srgb,var(--sgs-accent) 55%,var(--sgs-border));font-size:11px;color:var(--sgs-muted)}
  [data-gaizhu] .gz-action{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:34px;margin-top:10px;padding:6px 8px;border:1px solid color-mix(in srgb,var(--sgs-accent) 40%,transparent);border-radius:7px;background:linear-gradient(color-mix(in srgb,var(--sgs-accent) 18%,var(--sgs-surface)),color-mix(in srgb,var(--sgs-accent) 8%,var(--sgs-surface)));color:var(--sgs-accent);box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-text) 5%,transparent);font-size:12px;white-space:nowrap}
  [data-gaizhu] .gz-action:hover:enabled{border-color:var(--sgs-accent)}
  [data-gaizhu] .gz-action.is-running{background:var(--sgs-surface);color:var(--sgs-danger);border-color:color-mix(in srgb,var(--sgs-danger) 35%,transparent)}
  [data-gaizhu] .gz-action-icon{display:inline-flex;flex:none}
  [data-gaizhu] .gz-status{margin-top:8px;padding-left:8px;border-left:2px solid var(--sgs-border);color:var(--sgs-muted);font-size:11px}
  [data-gaizhu] .gz-stop-status{margin-top:4px;color:var(--sgs-muted);font-size:11px;font-variant-numeric:tabular-nums}
  [data-gaizhu] .is-error{color:var(--sgs-danger);border-color:var(--sgs-danger)}
  [data-gaizhu] .gz-invite{margin-top:10px;padding:8px 9px 9px;border-left:2px solid var(--sgs-accent);border-radius:0 6px 6px 0;background:color-mix(in srgb,var(--sgs-accent) 7%,var(--sgs-bg))}
  [data-gaizhu] .gz-room-line{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
  [data-gaizhu] .gz-room-line b{color:var(--sgs-text);font-size:13px;font-variant-numeric:tabular-nums}
  [data-gaizhu] .gz-password{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:5px;font-variant-numeric:tabular-nums}
  [data-gaizhu] .gz-password>span{min-width:0;overflow-wrap:anywhere;user-select:text}
  [data-gaizhu] .gz-password>button{flex:none;padding:3px 6px;min-height:28px;font-size:11px;white-space:nowrap}
  [data-gaizhu] .gz-companion{margin-top:6px;color:var(--sgs-muted);font-size:11px}
  [data-gaizhu] .gz-meta{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-top:7px;color:var(--sgs-muted);font-size:10px;font-variant-numeric:tabular-nums}
  [data-gaizhu] .gz-meta>span:first-child{min-width:0;overflow-wrap:anywhere}
  [data-gaizhu] .gz-meta>span:last-child{flex:none;white-space:nowrap}
  [data-gaizhu] details{margin-top:6px;min-width:0}
  [data-gaizhu] details>summary{font-size:11px}
  [data-gaizhu] pre{max-height:180px;overflow:auto;margin:0 0 7px;white-space:pre-wrap;overflow-wrap:anywhere;font:10px/1.6 var(--sgs-font,sans-serif);color:var(--sgs-muted)}
  [data-gaizhu] .gz-error pre{color:var(--sgs-danger)}
`;

function operationHint(role, mode, pick) {
  if (role === 'host') return '自动补普通小杀并点将黄盖，可能消耗点将资源。';
  const point = '点将可能消耗游戏点将卡等资源。';
  if (role === 'rebel') return pick === 'off' ? '与盖主小号配合，自动准备、选将和托管。' : '与盖主小号配合，自动准备、选将和托管。' + point;
  if (mode === 'training') return '自动选将和续局。商店按现有规则选购，可能消耗局内货币。';
  if (mode === 'nation') return '自动补小杀、选将、推进对局和续局。';
  return pick === 'off'
    ? '启动时尝试把已满百胜的武将写入游戏禁将方案，并为反贼队友优先补高级小杀。'
    : '按所选方式轮换百胜武将，为反贼队友优先补高级小杀。' + point;
}

export function renderPanel(ctx, controller, container) {
  const doc = ctx.document, releases = [];
  let mounted = true, draftRole = 'host', lastAccount, lastHours, lastClipboardKey, clipboardWrite = 0;
  const el = (tag, text, className) => {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  const listen = (target, type, fn) => releases.push(ctx.scope.listen(target, type, fn));
  const root = el('section'); root.dataset.gaizhu = '';
  const style = el('style'); style.textContent = PANEL_STYLE;

  function segments(label, key, choices, changed, hints) {
    const field = el('div', undefined, key === 'role' ? 'gz-field gz-module-field' : 'gz-field');
    if (key !== 'role') field.append(el('p', label, 'gz-label'));
    const group = el('div', undefined, 'sgs-segments gz-segments gz-' + (key === 'role' ? 'roles' : key));
    group.setAttribute('role', 'group'); group.setAttribute('aria-label', label);
    field.append(group);
    const buttons = new Map();
    for (const [value, title] of choices) {
      const button = el('button', title); button.type = 'button'; button.dataset[key] = value;
      if (hints) button.title = hints[value];
      listen(button, 'click', () => changed(value));
      group.append(button); buttons.set(value, button);
    }
    return { field, update(selected, disabled) {
      for (const [value, button] of buttons) {
        button.disabled = disabled;
        button.setAttribute('aria-pressed', String(selected === value));
      }
    } };
  }
  function toggle(key, label, description, showState = false) {
    const row = el('label', undefined, 'gz-wait'), copy = el('span', undefined, 'gz-wait-copy');
    copy.append(el('span', label), el('small', description)); row.append(copy);
    const indicator = el('span', undefined, 'gz-wait-state');
    if (showState) row.append(indicator);
    const input = ctx.ui.styleSwitch(el('input')); input.type = 'checkbox'; input.setAttribute('aria-label', label);
    row.append(input);
    listen(input, 'change', () => controller.setOptions({ [key]: input.checked }));
    return { row, update(checked, disabled) {
      input.checked = checked; input.disabled = disabled;
      if (showState) indicator.textContent = checked ? '已开启' : '已关闭';
    } };
  }
  function action(label, icon) {
    const button = el('button', undefined, 'gz-action'); button.type = 'button';
    const picture = el('span', undefined, 'gz-action-icon'), caption = el('span', label);
    picture.setAttribute('aria-hidden', 'true');
    picture.append(ctx.ui.icon(icon)); button.append(picture, caption);
    return { button, picture, caption };
  }

  const roles = segments('模块', 'role', MODULES, value => { draftRole = value; redraw(); });
  const modes = segments('挂机方式', 'mode', AUTO_MODES, autoMode => controller.setOptions({ autoMode }));
  const picks = segments('点将 · 百胜轮换', 'pick', POINT_MODES, pick => controller.setOptions({ pick }), POINT_HINTS);
  const stops = segments('停止条件', 'stop', STOP_MODES, stopMode => controller.setOptions({ stopMode }));
  const hoursRow = el('label', undefined, 'gz-hours');
  const hours = el('input', undefined, 'sgs-input');
  hours.type = 'number'; hours.step = 'any'; hours.inputMode = 'decimal'; hours.required = true;
  hours.setAttribute('aria-label', '挂机时长（小时）');
  hoursRow.append(el('span', '挂机时长（小时）'), hours);
  const stopHint = el('p', undefined, 'gz-companion');
  stops.field.append(hoursRow, stopHint);
  const validHours = () => Boolean(durationOf(hours.valueAsNumber));
  listen(hours, 'change', () => {
    if (validHours()) controller.setOptions({ stopHours: hours.valueAsNumber });
    redraw();
  });
  listen(hours, 'input', () => redraw());

  const wait = toggle('wait', '等1分钟', '剩3秒或满45秒苦肉。', true);
  const caution = el('p', undefined, 'gz-caution');
  const status = el('p', undefined, 'gz-status'); status.setAttribute('role', 'status');
  const stopStatus = el('p', undefined, 'gz-stop-status'); stopStatus.setAttribute('role', 'status');

  const invite = el('div', undefined, 'gz-invite');
  const roomLine = el('p', undefined, 'gz-room-line'), roomNumber = el('b');
  roomLine.append(el('span', '房号'), roomNumber);
  const passwordRow = el('div', undefined, 'gz-password'), passwordText = el('span'), copyPassword = el('button', '复制密码', 'sgs-btn');
  passwordRow.dataset.roomPassword = ''; copyPassword.type = 'button'; copyPassword.title = '复制房间密码（保留前导零）';
  passwordRow.append(passwordText, copyPassword);
  listen(copyPassword, 'click', async () => {
    const { account, roomNumber, roomPassword } = controller.snapshot();
    if (!roomPassword) return;
    const write = ++clipboardWrite;
    const current = () => {
      if (!mounted || write !== clipboardWrite) return false;
      const s = controller.snapshot();
      return s.account === account && s.roomNumber === roomNumber && s.roomPassword === roomPassword;
    };
    try {
      await (ctx.window || doc.defaultView).navigator.clipboard.writeText(roomPassword);
      if (current()) copyPassword.textContent = '已复制';
    } catch { if (current()) copyPassword.textContent = '请选取密码'; }
  });
  const companion = el('p', undefined, 'gz-companion');
  companion.setAttribute('role', 'status');
  const confirmation = action('确认并开始速刷', 'check');
  listen(confirmation.button, 'click', () => controller.confirm());
  invite.append(roomLine, passwordRow, companion, confirmation.button);
  const primary = action('开始速刷', 'play');
  listen(primary.button, 'click', () => {
    const s = controller.snapshot();
    if (s.role !== 'off') {
      controller.setOptions({ role: 'off' });
      return;
    }
    const start = { role: draftRole };
    if (draftRole === 'host' && s.inLobby) start.create = true;
    else if (s.retryRole === draftRole && (draftRole !== 'auto' || s.autoMode === 'identity')) start.force = true;
    controller.setOptions(start);
  });

  const meta = el('div', undefined, 'gz-meta'), general = el('span'), rounds = el('span'); meta.append(general, rounds);
  const errors = el('details', undefined, 'sgs-fold gz-error'), errorText = el('pre');
  errors.append(el('summary', '查看完整错误'), errorText);
  const history = el('details', undefined, 'sgs-fold'), historyText = el('pre');
  history.append(el('summary', '运行记录'), historyText);
  root.append(style, roles.field, modes.field, picks.field, stops.field, wait.row, caution, invite,
    primary.button, status, stopStatus, meta, errors, history);
  container.append(root);

  let previousRunning;
  function redraw() {
    if (!mounted) return;
    const s = controller.snapshot(), running = s.role !== 'off';
    const changedAccount = lastAccount !== s.account;
    if (changedAccount) draftRole = 'host';
    lastAccount = s.account;
    if (running) draftRole = s.role;
    const auto = draftRole === 'auto', mode = s.autoMode || 'identity', stop = s.stopMode || 'manual';
    const canConfigure = Boolean(s.account) && !running;
    const confirming = running && s.awaitingConfirmation;
    roles.update(draftRole, !canConfigure);
    modes.field.hidden = !auto; modes.update(mode, !canConfigure);
    stops.field.hidden = !auto; stops.update(stop, !canConfigure);
    hoursRow.hidden = stop !== 'timed';
    hours.disabled = !canConfigure || !auto || stop !== 'timed';
    if (changedAccount || lastHours !== s.stopHours) {
      hours.value = s.stopHours || '';
      lastHours = s.stopHours;
    }
    const invalidHours = auto && stop === 'timed' && !validHours();
    hours.setAttribute('aria-invalid', String(invalidHours));
    stopHint.hidden = stop === 'manual' || running;
    stopHint.textContent = stop === 'tavern' ? '三项均已领取后，打完本局即停止。' : '从启动时计时，到点后打完本局即停止。';
    picks.field.hidden = !(draftRole === 'rebel' || (auto && mode === 'identity'));
    picks.update(s.pick, !canConfigure || picks.field.hidden);
    wait.row.hidden = draftRole !== 'host' || confirming; wait.update(Boolean(s.wait), !s.account);
    caution.hidden = confirming;
    caution.textContent = operationHint(draftRole, mode, s.pick);

    const creating = draftRole === 'host' && s.inLobby;
    const canForce = !running && !creating && s.retryRole === draftRole && (!auto || mode === 'identity');
    const cooling = canForce && s.retrySeconds > 0;
    primary.button.disabled = cooling || (!running && (!s.account || invalidHours));
    primary.button.classList.toggle('is-running', running);
    let title = auto ? '开始挂机' : creating ? '创建盖主房' : '开始速刷';
    if (running) title = confirming ? '取消速刷' : auto ? '停止挂机' : '停止速刷';
    else if (canForce) title = cooling ? `强制开始（${s.retrySeconds}秒）` : '强制开始';
    primary.caption.textContent = title;
    primary.button.title = running ? '停止本端自动操作' : canForce ? '使用当前房间设置开始' : title;
    if (previousRunning !== running) {
      previousRunning = running;
      primary.picture.replaceChildren(ctx.ui.icon(running ? 'pause' : 'play'));
    }

    status.textContent = !running && invalidHours ? '请输入大于 0 的小时数。' : s.status || (s.account ? '已停止' : '等待登录账号。');
    status.classList.toggle('is-error', Boolean(s.error) || !running && invalidHours);
    status.hidden = Boolean(confirming && !s.error);
    stopStatus.textContent = auto && s.stopStatus !== status.textContent ? s.stopStatus || '' : '';
    stopStatus.hidden = !stopStatus.textContent;
    const hasPassword = Boolean(s.roomPassword);
    invite.hidden = !confirming && !hasPassword;
    roomLine.hidden = !s.roomNumber;
    roomNumber.textContent = String(s.roomNumber || '').slice(-5);
    passwordRow.hidden = !hasPassword; copyPassword.disabled = !s.account || !hasPassword;
    passwordText.textContent = hasPassword ? '密码 ' + s.roomPassword : '';
    const key = [s.account, s.roomNumber, s.roomPassword].join('|');
    if (key !== lastClipboardKey) {
      clipboardWrite++;
      copyPassword.textContent = '复制密码';
      lastClipboardKey = key;
    }
    companion.hidden = !confirming;
    companion.textContent = s.canConfirm ? (s.companionName ? `${s.companionName} 已入席，可以开始。` : '同伴已入席，可以开始。') : '请手动邀请另一个账号，等待同伴入席。';
    confirmation.button.hidden = !confirming;
    confirmation.button.disabled = !confirming || !s.canConfirm;
    general.textContent = s.generalName ? `当前武将 · ${s.generalName}` : running ? '等待识别武将' : '尚未运行';
    general.title = general.textContent;
    rounds.textContent = `已完成 ${Number.isSafeInteger(s.rounds) && s.rounds >= 0 ? s.rounds : '未知'} 局`;
    meta.hidden = Boolean(confirming);
    errors.hidden = !s.error; errorText.textContent = s.error || '';
    history.hidden = !Array.isArray(s.log) || !s.log.length;
    historyText.textContent = Array.isArray(s.log) ? s.log.join('\n') : '';
  }
  releases.push(controller.subscribe(redraw)); redraw();
  return ctx.scope.add(() => {
    if (!mounted) return;
    mounted = false;
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
