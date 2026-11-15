import { createFriendManagement } from './friends.js';
import { createChatEnhancements } from './chat.js';
import { ResourceScope } from '../../core/resources.js';
import { downloadJSON } from '../../shared/info-runtime.js';

export const manifest = {
  id: 'social', name: '好友与聊天', version: '0.1.6', apiVersion: 1, contractVersion: 1,
  minCoreVersion: '0.5.13',
  description: '原生好友置顶、好友改名提醒、公屏一键进房与聊天官阶补全',
  icon: { paths: ['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M2 21v-3a6 6 0 0 1 12 0v3', 'M16 4a4 4 0 0 1 0 8M17 15a5 5 0 0 1 5 5v1'] },
  priority: 30300, categories: ['tools'],
};

export function activate(ctx) {
  const friends = createFriendManagement(ctx);
  const chat=createChatEnhancements(ctx);
  ctx.ui.registerPanel({ id: 'history', category: 'tools', render(container) {
    return renderHistory(ctx, container, friends,chat);
  } });
}

export function renderHistory(ctx, container, friends,chat) {
  const local = new ResourceScope(), doc = ctx.document;
  const root = doc.createElement('section'); root.className = 'sgs-social';
  const style = doc.createElement('style');
  style.textContent = `.sgs-social{color:var(--sgs-text);font:12px/1.65 var(--sgs-font,sans-serif);min-width:0}.sgs-social p{margin:0 0 10px;overflow-wrap:anywhere}.sgs-social .social-muted{color:var(--sgs-muted)}.sgs-social button{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:5px 10px;border:1px solid var(--sgs-border);border-radius:7px;background:var(--sgs-raised);color:var(--sgs-text);font:inherit;cursor:pointer}.sgs-social button:hover{color:var(--sgs-accent);border-color:var(--sgs-accent)}.sgs-social button:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}.sgs-social button:disabled{opacity:.45;cursor:not-allowed}.sgs-social button svg{width:15px;height:15px}.sgs-social ol{list-style:none;padding:0;margin:12px 0;max-height:260px;overflow:auto}.sgs-social li{padding:8px 0;border-top:1px solid var(--sgs-border);overflow-wrap:anywhere}.sgs-social li small{display:block;color:var(--sgs-muted)}.sgs-social li strong{color:var(--sgs-accent);font-weight:500}`;
  const intro = doc.createElement('p'); intro.className = 'social-muted';
  intro.textContent = '在游戏好友菜单中置顶或取消置顶。每分钟保存好友昵称；发现变化只提醒一次，记录保留在本机。';
  const status = doc.createElement('p'); status.dataset.socialStatus = ''; status.setAttribute('role', 'status');
  const button = doc.createElement('button'); button.type = 'button'; button.dataset.socialExport = ''; button.textContent = '导出好友与改名记录';
  button.title = '仅下载当前账号的本机好友快照、置顶名单和改名记录';
  const history = doc.createElement('ol'); history.dataset.socialHistory = ''; history.setAttribute('aria-label', '可能改名的好友');
  const empty = doc.createElement('p'); empty.className = 'social-muted';
  const chatStatus=doc.createElement('p');chatStatus.className='social-muted';chatStatus.dataset.socialChatStatus='';chatStatus.hidden=!chat;
  const chatExport=doc.createElement('button');chatExport.type='button';chatExport.dataset.socialChatExport='';chatExport.textContent='导出聊天诊断';chatExport.hidden=!chat;
  const error = doc.createElement('p'); error.style.color = 'var(--sgs-danger)'; error.setAttribute('role', 'alert');
  root.append(style, intro, status, error, button, history, empty,chatStatus,chatExport); container.append(root);
  let stamp;
  function render() {
    const data = friends.getRecord(),diag=chat?.getDiagnostics?.(), next = JSON.stringify([data,diag]); if (stamp === next) return; stamp = next;
    if(diag)chatStatus.textContent=`聊天 ${diag.rows||0} 行 · 用户链接 ${diag.links||0} · 有官阶资料 ${diag.profiles||0} · 显示图标 ${diag.inserted||0}。原生官阶服务${diag.nativeOfficer?'已接入':'未接入'}，配置${diag.config?'已就绪':'未就绪'}，图片加载中 ${diag.loading||0} / 失败 ${diag.failed||0}。`;
    button.disabled = !data.accountId;
    error.hidden = !data.error; error.textContent = data.error || '';
    status.textContent = data.accountId ? `账号 ${data.accountId} · 已记录 ${Object.keys(data.friends).length} 位好友 · 置顶 ${data.pins.length} 位` : '等待登录与好友资料';
    empty.textContent = data.changes.length ? '昵称变化仅表示可能改名，用户 ID 保持不变。最多保留最近 200 条变化；导出含已保存好友。' : '尚未发现好友昵称变化。首次记录作为比较基准。';
    history.replaceChildren();
    for (const change of [...data.changes].reverse()) {
      const row = doc.createElement('li'), names = doc.createElement('strong'), detail = doc.createElement('small');
      names.textContent = `${change.from} → ${change.to}`;
      detail.textContent = `${change.id} · ${new Date(change.at).toLocaleString()}`;
      row.append(names, detail); history.append(row);
    }
  }
  local.listen(button, 'click', () => {
    const data = friends.getRecord(); if (!data.accountId) return;
    try { downloadJSON(ctx, `好友-${data.accountId}.json`, data); }
    catch (error) { ctx.reportError?.(error); }
  });
  local.listen(chatExport,'click',()=>{try{downloadJSON(ctx,'聊天诊断.json',{version:manifest.version,...chat?.getDiagnostics?.()});}catch(error){ctx.reportError?.(error);}});
  local.interval(render, 1000); render();
  return ctx.scope.add(() => { local.dispose(); root.remove(); });
}

export default { manifest, activate };
