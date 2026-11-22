'use strict';

function mountAccounts() {
  const channel = document.getElementById('sgs-toolbox-channel');
  const channelMenu = document.getElementById('sgs-toolbox-channel-menu');
  const request = window.__SGS_TOOLBOX_CHANNEL__;
  if (!channel || typeof request !== 'function' || document.getElementById('sgs-toolbox-accounts')) return;
  const style = document.createElement('style');
  style.textContent = `
    #sgs-toolbox-footer {
      position:fixed; right:16px; bottom:11px; z-index:100010; display:flex; align-items:center;
      justify-content:flex-end; gap:8px; max-width:calc(100vw - 32px);
    }
    #sgs-toolbox-footer #sgs-toolbox-channel { position:static; flex:none; white-space:nowrap }
    #sgs-toolbox-accounts {
      position:relative; display:flex; align-items:center; gap:5px; min-width:0; color:#e5d6b6;
      font:12px/1.4 "Microsoft YaHei","PingFang SC",sans-serif; -webkit-app-region:no-drag;
    }
    #sgs-toolbox-accounts [hidden] { display:none !important }
    #sgs-toolbox-accounts button {
      box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center; gap:5px;
      min-width:0; height:28px; border:1px solid #584a32; border-radius:14px; padding:0 9px;
      color:#e5d3ab; background:linear-gradient(180deg,#2a251d,#1b1814);
      font:inherit; white-space:nowrap; cursor:pointer; -webkit-app-region:no-drag;
    }
    #sgs-toolbox-accounts button:hover:not(:disabled), #sgs-toolbox-accounts [aria-expanded=true] {
      color:#fff0c5; background:#383024; border-color:#a78a54;
    }
    #sgs-toolbox-accounts button:focus-visible { outline:2px solid #d9b86c; outline-offset:2px }
    #sgs-toolbox-accounts button:disabled { color:#a79b83; cursor:default }
    #sgs-toolbox-accounts svg { width:14px; height:14px; flex:none }
    #sgs-toolbox-account-shortcuts { display:flex; align-items:center; gap:5px; min-width:0 }
    #sgs-toolbox-account-shortcuts button { width:max-content; max-width:118px; flex:0 1 auto }
    #sgs-toolbox-accounts .account-label { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis }
    #sgs-toolbox-account-panel {
      position:absolute; right:0; bottom:35px; z-index:1; box-sizing:border-box;
      width:min(254px,calc(100vw - 32px)); max-height:calc(100vh - 78px); display:flex; flex-direction:column;
      padding:7px; border:1px solid #635333; border-radius:12px;
      background:linear-gradient(160deg,#2a251d,#171513 75%); box-shadow:0 7px 24px #000a;
    }
    #sgs-toolbox-accounts .account-heading {
      display:flex; align-items:center; justify-content:space-between; gap:8px;
      padding:4px 6px 8px; font-weight:600; color:#f0e0bb; white-space:nowrap;
    }
    #sgs-toolbox-accounts .account-heading span + span { color:#b4a587; font-weight:400 }
    #sgs-toolbox-account-rows { display:grid; gap:3px; overflow-y:auto; min-height:0; padding:2px }
    #sgs-toolbox-account-rows::-webkit-scrollbar { width:6px }
    #sgs-toolbox-account-rows::-webkit-scrollbar-thumb { background:#6a583a; border-radius:4px }
    #sgs-toolbox-account-rows .account-row { display:grid; grid-template-columns:minmax(0,1fr) 30px; align-items:center; gap:4px }
    #sgs-toolbox-account-rows button {
      justify-content:flex-start; height:30px; padding:0 7px; border-color:transparent;
      border-radius:6px; background:#ffffff06;
    }
    #sgs-toolbox-account-rows .account-delete { justify-content:center; padding:0; color:#c9a49a; background:transparent }
    #sgs-toolbox-account-rows .account-delete:hover { color:#ffc8bd; border-color:#795449; background:#3b2520 }
    #sgs-toolbox-account-rows .account-empty { margin:0; padding:6px; color:#b8ac92 }
    #sgs-toolbox-account-toast {
      position:absolute; right:0; bottom:35px; display:flex; align-items:center; gap:8px; box-sizing:border-box;
      width:max-content; max-width:min(290px,calc(100vw - 32px)); padding:5px 8px 5px 11px;
      border:1px solid #6a5630; border-radius:8px; background:#211c16; box-shadow:0 6px 18px #000a;
    }
    #sgs-toolbox-account-toast button { height:24px; color:#f0baaa; flex:none }
    @media (max-width:350px) {
      #sgs-toolbox-account-panel, #sgs-toolbox-account-toast { position:fixed; right:16px; bottom:46px }
    }
  `;
  document.head.append(style);
  const footer = document.createElement('div');
  footer.id = 'sgs-toolbox-footer';
  const group = document.createElement('div');
  group.id = 'sgs-toolbox-accounts';
  group.setAttribute('aria-label', '已保存的账号');
  group.hidden = true;
  group.innerHTML = `
    <div id="sgs-toolbox-account-shortcuts"></div>
    <button type="button" aria-expanded="false" aria-controls="sgs-toolbox-account-panel" title="管理已保存的账号"></button>
    <section id="sgs-toolbox-account-panel" aria-labelledby="sgs-toolbox-account-heading" hidden>
      <div class="account-heading"><span id="sgs-toolbox-account-heading"></span><span data-account-count></span></div>
      <div id="sgs-toolbox-account-rows"></div>
    </section>
    <div id="sgs-toolbox-account-toast" hidden><span role="status"></span><button type="button">删除</button></div>
  `;
  channel.before(footer);
  footer.append(group, channel);
  const [shortcuts, toggle, panel, toast] = group.children;
  const rows = panel.querySelector('#sgs-toolbox-account-rows');
  const [message, undo] = toast.children;
  const narrow = matchMedia('(max-width: 790px)');
  const icon = paths => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const accountIcon = icon('<circle cx="12" cy="8" r="3.25"/><path d="M5.5 19v-.8c0-2.6 2.5-4.7 6.5-4.7s6.5 2.1 6.5 4.7v.8"/>');
  const expandIcon = icon('<path d="m7 14 5-5 5 5"/>');
  const deleteIcon = icon('<path d="M5 7h14m-9-3h4m-7 3 1 13h8l1-13m-7 3v7m4-7v7"/>');
  let state = { accounts: [] };
  let unavailable = false;
  let busy = false;
  let revision = 0;
  let toastTimer;
  let undoId;

  function close(restoreFocus = false) {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle.focus();
  }
  function hideToast() {
    clearTimeout(toastTimer);
    toast.hidden = true;
    undoId = null;
  }
  function showToast(text, id) {
    close();
    clearTimeout(toastTimer);
    undoId = id;
    message.textContent = text;
    undo.hidden = !id;
    toast.hidden = false;
    toastTimer = setTimeout(() => { if (!toast.contains(document.activeElement)) hideToast(); }, id ? 9000 : 4800);
  }
  function loginButton(entry) {
    const button = document.createElement('button');
    button.type = 'button';
    button.disabled = !state.login || busy;
    button.title = state.login ? '登录 ' + entry.username : '请返回登录页后登录 ' + entry.username;
    button.setAttribute('aria-label', button.title);
    const label = document.createElement('span');
    label.className = 'account-label';
    label.textContent = entry.username;
    button.append(label);
    button.addEventListener('click', () => login(entry.id));
    return button;
  }
  function render() {
    const { accounts, channelId, restartRequired } = state;
    const folded = accounts.length > 5 || narrow.matches;
    const open = !panel.hidden;
    group.hidden = false;
    shortcuts.hidden = folded;
    const toggleText = accounts.length && folded ? '账号 ' + accounts.length : accounts.length ? '' : '账号';
    toggle.innerHTML = accountIcon + (toggleText ? `<span>${toggleText}</span>` : '') + (folded && accounts.length > 0 ? expandIcon : '');
    toggle.setAttribute('aria-label', '管理已保存的账号，共 ' + accounts.length + ' 个');
    panel.querySelector('#sgs-toolbox-account-heading').textContent = (channelId === 3 ? '4399' : channelId === 1 ? '官服' : '') + '账号';
    panel.querySelector('[data-account-count]').textContent = accounts.length + ' 个';
    shortcuts.textContent = '';
    rows.textContent = '';
    for (const entry of accounts) {
      if (!folded) shortcuts.append(loginButton(entry));
      const row = document.createElement('div');
      row.className = 'account-row';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.title = '删除 ' + entry.username;
      remove.setAttribute('aria-label', remove.title);
      remove.className = 'account-delete';
      remove.innerHTML = deleteIcon;
      remove.disabled = busy;
      remove.addEventListener('click', () => drop(entry.id));
      row.append(loginButton(entry), remove);
      rows.append(row);
    }
    if (!accounts.length) {
      const empty = document.createElement('div');
      empty.className = 'account-empty';
      empty.textContent = unavailable ? '账号存储暂不可用' : restartRequired ? '重启微端后显示此渠道的账号' : '成功登录后会保存账号';
      rows.append(empty);
    }
    if (open && document.activeElement === document.body) toggle.focus();
  }
  async function refresh() {
    const current = ++revision;
    try {
      const next = await request({ action: 'accounts:list' });
      if (current !== revision) return;
      state = next;
      unavailable = false;
    } catch (_) {
      if (current !== revision) return;
      unavailable = true;
    }
    render();
  }
  async function drop(id) {
    if (!id || busy) return;
    busy = true;
    try {
      await request({ action: 'accounts:delete', id });
      await refresh();
      showToast('已删除保存的账号');
    } catch (_) { showToast('删除失败，请重试'); }
    finally { busy = false; render(); }
  }
  async function login(id) {
    if (busy) return;
    busy = true;
    close(panel.contains(document.activeElement) || shortcuts.contains(document.activeElement));
    render();
    try {
      const status = await request({ action: 'accounts:login', id });
      const notice = { agreement: '请在登录页阅读并勾选协议后继续', 'signed-in': '请先退出当前账号再切换', form: '请在账号密码登录页重试' };
      if (notice[status]) showToast(notice[status]);
      else hideToast();
    } catch (_) { showToast('暂时无法使用保存的账号，请重试'); }
    finally { busy = false; render(); }
  }
  toggle.addEventListener('click', () => {
    if (!panel.hidden) { close(); return; }
    if (channelMenu && !channelMenu.hidden) channel.click();
    hideToast();
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    void refresh();
  });
  undo.addEventListener('click', () => drop(undoId));
  channel.addEventListener('click', () => { close(); hideToast(); }, true);
  document.addEventListener('click', event => { if (!group.contains(event.target)) close(); }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) close(true);
  });
  narrow.addListener(render); // Chromium 85 matchMedia support
  window.addEventListener('sgs-toolbox-accounts-state', event => {
    void refresh();
    const notice = event.detail;
    if (notice?.type === 'saved') showToast(notice.updated ? '密码已更新' : '密码已保存', notice.id);
    if (notice?.type === 'error') showToast('密码保存失败，请重试');
  });
  void refresh();
}

module.exports = { mountAccounts };
