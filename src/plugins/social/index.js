import { SOCIAL_ICON } from '../../ui/plugin-icons.js';
import { createFriendManagement } from './friends.js';
import { BINDING_CODE_FILTER, bindingCodeFilterEnabled, createChatEnhancements } from './chat.js';
import { ResourceScope } from '../../core/resources.js';
import { downloadJSON } from '../../shared/info-runtime.js';
import { createLampTracking, createLampBanner } from './lamps.js';
import { installRoomFilter } from './room-filter.js';
import { PREFERENCES_RESTORED } from '../../shared/sync-paths.js';
import { createChatBubbles, renderBubblePanel } from './bubbles.js';
import { createLocalEmoji, openEmojiGallery } from './emoji.js';

export const manifest = {
  id: 'social', name: '好友与聊天', version: '0.1.35', apiVersion: 1, contractVersion: 1,
  releaseNotes: "减少聊天和好友窗口在后台的重复刷新，避免已有内容反复重新排版。好友设置、聊天筛选和气泡设置保持不变。", minCoreVersion: '0.6.185',
  description: '好友置顶进房、聊天过滤与本地泡泡',
  journalEvents: ['ClientLoginRep'],
  icon: SOCIAL_ICON,
  priority: 30300, categories: ['tools'],
};

export function activate(ctx) {
  const banner = createLampBanner(ctx);
  const friends = createFriendManagement(ctx, banner);
  const lamps = createLampTracking(ctx, friends, banner);
  ctx.scope.listen(ctx.window, PREFERENCES_RESTORED, event => {
    if (!Array.isArray(event.detail)) return;
    if (event.detail.includes('friends')) friends.reload();
    if (event.detail.includes('friendLamps')) lamps.reload();
  });
  const chat = createChatEnhancements(ctx);
  const bubbles = createChatBubbles(ctx);
  const emoji = createLocalEmoji(ctx);
  installRoomFilter(ctx);
  ctx.ui.registerPanel({ id: 'bubbles', category: 'tools', render(container) {
    return renderBubblePanel(ctx, container, bubbles);
  } });
  ctx.ui.registerPanel({ id: 'history', category: 'tools', render(container) {
    return renderHistory(ctx, container, friends, lamps, chat, emoji);
  } });
}

export function renderHistory(ctx, container, friends, lamps, chat, localEmoji = createLocalEmoji(ctx)) {
  const local = new ResourceScope(), doc = ctx.document;
  const root = doc.createElement('section'); root.className = 'sgs-social';
  const style = doc.createElement('style');
  style.textContent = `.sgs-social{color:var(--sgs-text);font:calc(12px + var(--sgs-font-offset, 0px))/1.65 var(--sgs-font,sans-serif);min-width:0}.sgs-social p{margin:0 0 10px;overflow-wrap:anywhere}.sgs-social .social-muted{color:var(--sgs-muted)}.sgs-social .social-actions{display:flex;align-items:center;gap:6px;margin:0 0 10px}.sgs-social button{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:5px 10px;border:1px solid var(--sgs-border);border-radius:7px;background:var(--sgs-raised);color:var(--sgs-text);font:inherit;cursor:pointer}.sgs-social button:hover{color:var(--sgs-accent);border-color:var(--sgs-accent)}.sgs-social button:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}.sgs-social button:disabled{opacity:.45;cursor:not-allowed}.sgs-social button svg{width:15px;height:15px}.sgs-social ol{list-style:none;padding:0;margin:12px 0;max-height:260px;overflow:auto}.sgs-social ol:empty{display:none}.sgs-social li{padding:8px 0;border-top:1px solid var(--sgs-border);overflow-wrap:anywhere}.sgs-social li small{display:block;color:var(--sgs-muted)}.sgs-social li strong{color:var(--sgs-accent);font-weight:500}
    .sgs-social .social-filter{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:32px;cursor:pointer}
    .sgs-social .social-emoji-actions{flex-wrap:wrap;margin-bottom:5px}
    .sgs-social .social-emoji-actions button{white-space:nowrap}
    .sgs-social .social-emoji-local{color:var(--sgs-accent)}
    .sgs-social .social-emoji-list{display:flex;flex-wrap:wrap;gap:6px;max-height:112px;overflow:auto;list-style:none;padding:3px;margin:0 0 7px}
    .sgs-social .social-emoji-list[hidden]{display:none}
    .sgs-social .social-emoji-list li{display:flex;min-width:0;max-width:100%;padding:0;
      border:1px solid var(--sgs-border);border-radius:7px;background:var(--sgs-raised)}
    .sgs-social .social-emoji-list button{background:transparent;border:0;min-width:0}
    .sgs-social .social-emoji-list [data-emoji-action=play]{padding:3px 7px}
    .sgs-social .social-emoji-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .sgs-social .social-emoji-picture{flex:none;width:28px;height:28px;display:grid;place-items:center}
    .sgs-social .social-emoji-picture img{width:100%;height:100%;object-fit:contain}
    .sgs-social .social-emoji-picture img[hidden],.sgs-social .social-emoji-picture img:not([hidden])+svg{display:none}
    .sgs-social .social-emoji-list [data-emoji-action=remove]{flex:none;width:32px;justify-content:center;
      padding:0;color:var(--sgs-muted)}
    .sgs-social .social-emoji-list [data-emoji-action=remove]:hover{color:var(--sgs-accent)}
    .sgs-social .social-emoji-error{color:var(--sgs-danger)}
    .sgs-social .social-filter-note{padding-bottom:10px;border-bottom:1px solid var(--sgs-border)}`;
  const filter = doc.createElement('label'); filter.className = 'social-filter';
  const filterSwitch = ctx.ui.styleSwitch(doc.createElement('input'));
  filterSwitch.type = 'checkbox'; filterSwitch.checked = bindingCodeFilterEnabled(ctx);
  filter.append('过滤绑定码', filterSwitch);
  const filterNote = doc.createElement('p'); filterNote.className = 'social-filter-note social-muted';
  filterNote.textContent = '过滤综合、系统消息及各频道的高级诏令。匹配「互、绑、好友、周年」或以 A、C 开头的至少 5 位连续大写英文字母。';
  local.listen(filterSwitch, 'change', () => {
    try { ctx.settings.set(BINDING_CODE_FILTER, filterSwitch.checked); }
    catch (error) { filterSwitch.checked = bindingCodeFilterEnabled(ctx); ctx.reportError?.(error); return; }
    chat?.tick();
  });
  const emoji = doc.createElement('button'); emoji.type = 'button'; emoji.className = 'social-emoji';
  emoji.textContent = '表情预览与解锁'; emoji.title = '打开游戏的动画表情页';
  const emojiLocal = doc.createElement('button'); emojiLocal.type = 'button'; emojiLocal.className = 'social-emoji-local';
  emojiLocal.textContent = '加入本地'; emojiLocal.title = '加入游戏表情页中选中的表情';
  const emojiActions = doc.createElement('div'); emojiActions.className = 'social-actions social-emoji-actions';
  emojiActions.append(emoji, emojiLocal);
  const emojiStatus = doc.createElement('p'); emojiStatus.className = 'social-emoji-status social-muted';
  emojiStatus.setAttribute('role', 'status');
  const emojiList = doc.createElement('ul'); emojiList.className = 'social-emoji-list';
  emojiList.setAttribute('aria-label', '本地表情');
  let emojiStamp;
  const renderEmoji = () => {
    const choices = localEmoji.list(), next = JSON.stringify(choices);
    if (next === emojiStamp) return;
    emojiStamp = next;
    const focused = emojiList.contains(doc.activeElement) ? doc.activeElement.dataset : null;
    emojiList.replaceChildren();
    emojiList.hidden = !choices.length;
    emojiStatus.textContent = choices.length
      ? `${choices.length} 个本地表情，牌局中点击播放。`
      : '在表情页选中后可逐个加入。';
    for (const { id, name, image, available } of choices) {
      const row = doc.createElement('li'), play = doc.createElement('button'), remove = doc.createElement('button');
      const label = doc.createElement('span'); label.className = 'social-emoji-label'; label.textContent = name;
      play.type = remove.type = 'button';
      play.dataset.emojiId = remove.dataset.emojiId = String(id);
      play.dataset.emojiAction = 'play';
      remove.dataset.emojiAction = 'remove';
      play.disabled = !available;
      play.title = available ? `播放「${name}」，仅本机可见` : `「${name}」当前不可播放`;
      play.setAttribute('aria-label', `播放「${name}」`);
      remove.title = `移除「${name}」`;
      remove.setAttribute('aria-label', remove.title);
      const picture = doc.createElement('span'); picture.className = 'social-emoji-picture';
      if (image) {
        const thumbnail = doc.createElement('img');
        thumbnail.alt = '';
        thumbnail.hidden = true;
        picture.append(thumbnail);
        thumbnail.src = image;
      }
      picture.append(ctx.ui.icon('play'));
      play.append(picture, label);
      remove.append(ctx.ui.icon('close'));
      row.append(play, remove);
      emojiList.append(row);
    }
    if (focused) {
      const replacement = emojiList.querySelector(`[data-emoji-id="${focused.emojiId}"][data-emoji-action="${focused.emojiAction}"]:not(:disabled)`);
      (replacement ?? emojiLocal).focus({ preventScroll: true });
    }
  };
  const emojiError = doc.createElement('p'); emojiError.className = 'social-emoji-error';
  emojiError.setAttribute('role', 'alert'); emojiError.hidden = true;
  const emojiAction = action => {
    try { action(); emojiError.textContent = ''; emojiError.hidden = true; }
    catch (error) { emojiError.hidden = false; emojiError.textContent = String(error?.message || error); }
    renderEmoji();
  };
  local.listen(emoji, 'click', () => emojiAction(() => openEmojiGallery(ctx)));
  local.listen(emojiLocal, 'click', () => emojiAction(localEmoji.add));
  local.listen(emojiList, 'load', event => {
    if (event.target.tagName === 'IMG') event.target.hidden = false;
  }, true);
  local.listen(emojiList, 'click', event => {
    const control = event.target.closest('button[data-emoji-action]');
    if (!control || control.disabled) return;
    const id = Number(control.dataset.emojiId);
    emojiAction(() => control.dataset.emojiAction === 'play' ? localEmoji.play(id) : localEmoji.remove(id));
  });
  const intro = ctx.ui.helpTip('在游戏好友菜单中置顶或取消置顶。登录后依次查询置顶好友的将灯，同一次登录中每位好友间隔至少 1 小时，首次建立基准。每分钟保存好友昵称。新增永久拥有的武将在游戏上部提醒，点击叉关闭。将灯不能判断是否付费。好友记录按账号保存，上传云端备份时一并同步。');
  const status = doc.createElement('p'); status.dataset.socialStatus = ''; status.setAttribute('role', 'status');
  const button = doc.createElement('button'); button.type = 'button'; button.dataset.socialExport = ''; button.textContent = '导出好友记录';
  button.title = '下载当前账号好友、改名记录及所有已保存的武将名单；取消置顶不删除武将记录';
  const history = doc.createElement('ol'); history.dataset.socialHistory = ''; history.setAttribute('aria-label', '好友变化记录');
  const empty = doc.createElement('p'); empty.className = 'social-muted';
  const error = doc.createElement('p'); error.style.color = 'var(--sgs-danger)'; error.setAttribute('role', 'alert');
  const actions = doc.createElement('div'); actions.className = 'social-actions'; actions.append(button, intro);
  root.append(style, emojiActions, emojiStatus, emojiList, emojiError, filter, filterNote, status, error, actions, history, empty); container.append(root);
  let stamp;
  function render() {
    renderEmoji();
    const data = friends.getRecord(), next = JSON.stringify(data); if (stamp === next) return; stamp = next;
    button.disabled = !data.accountId;
    error.hidden = !data.error; error.textContent = data.error || '';
    status.hidden = !!data.accountId; status.textContent = data.accountId ? '' : '等待登录与好友资料';
    empty.textContent = data.changes.length ? '昵称变化仅表示可能改名，用户 ID 保持不变。最多保留最近 200 条变化；导出含已保存好友。' : '尚未发现好友昵称变化。首次记录作为比较基准。';
    if (Object.values(data.friends).some(f => f.missingAt)) empty.textContent += ' 好友消失无法判断由哪一方删除；本机主动删除成功后会清除该好友的本地记录。';
    history.replaceChildren();
    for (const [id, friend] of Object.entries(data.friends).filter(([, f]) => f.missingAt).sort((a,b) => b[1].missingAt-a[1].missingAt)) {
      const row = doc.createElement('li'), name = doc.createElement('strong'), detail = doc.createElement('small');
      name.textContent = `${friend.name} · 好友消失`;
      detail.textContent = `ID：${id} · 可能你将其删除了或者被删除。`;
      row.append(name, detail); history.append(row);
    }
    for (const change of [...data.changes].reverse()) {
      const row = doc.createElement('li'), names = doc.createElement('strong'), detail = doc.createElement('small');
      names.textContent = `${change.from} → ${change.to}`;
      detail.textContent = `${change.id} · ${new Date(change.at).toLocaleString()}`;
      row.append(names, detail); history.append(row);
    }
  }
  local.listen(button, 'click', () => {
    const data = friends.getRecord(); if (!data.accountId) return;
    try { downloadJSON(ctx, `好友-${data.accountId}.json`, { ...data, ownedGenerals: lamps?.getRecords() ?? {} }); }
    catch (error) { ctx.reportError?.(error); }
  });
  local.interval(render, 1000); render();
  return ctx.scope.add(() => { local.dispose(); root.remove(); });
}

export default { manifest, activate };
