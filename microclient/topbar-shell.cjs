'use strict';

function mountTopbar() {
  const request = window.__SGS_TOOLBOX_CHANNEL__;
  if (typeof request !== 'function' || document.getElementById('sgs-toolbox-core-bar')) return;
  const style = document.createElement('style');
  style.textContent = `
    #sgs-toolbox-core-bar {
      position:fixed; top:3px; right:92px; height:24px; z-index:100010; -webkit-app-region:no-drag;
      display:flex; align-items:center; gap:6px;
      color:#e9dabc; font:12px/1.5 "Microsoft YaHei","PingFang SC",sans-serif;
    }
    #sgs-toolbox-core-bar *, #sgs-toolbox-core-bar { box-sizing:border-box }
    #sgs-toolbox-core-bar [hidden] { display:none !important }
    #sgs-toolbox-core-bar button {
      display:inline-flex; align-items:center; justify-content:center; gap:5px; min-height:26px;
      border:1px solid #554831; border-radius:6px; padding:0 9px; color:#decda7; font:inherit;
      background:#2a241a; cursor:pointer; -webkit-app-region:no-drag;
    }
    #sgs-toolbox-core-bar button:hover:not(:disabled) { border-color:#bf9d56; color:#fff1c9 }
    #sgs-toolbox-core-bar button:focus-visible { outline:2px solid #e1bb6e; outline-offset:2px }
    #sgs-toolbox-core-bar button:disabled { opacity:.52; cursor:default }
    #sgs-toolbox-core-bar #sgs-toolbox-core-trigger,
    #sgs-toolbox-core-bar #sgs-toolbox-core-restart {
      height:24px; min-height:24px; border-radius:12px; padding:0 9px; gap:5px;
      background:linear-gradient(#352b1e,#1a1712); box-shadow:inset 0 1px #fff1,0 1px 5px #0008;
      white-space:nowrap; user-select:none; vertical-align:top;
    }
    #sgs-toolbox-core-bar #sgs-toolbox-core-restart, #sgs-toolbox-core-toast button[data-main] {
      background:linear-gradient(#665027,#493719); color:#ffe5a8; border-color:#8d6e38;
    }
    #sgs-toolbox-core-trigger svg, #sgs-toolbox-core-restart svg, .sgs-core-refresh svg { flex:none; display:block }
    #sgs-toolbox-core-trigger .sgs-core-dot { width:5px; height:5px; border-radius:50%; flex:none; display:none }
    #sgs-toolbox-core-trigger[data-state=available] { border-color:#9e7b3e }
    #sgs-toolbox-core-trigger[data-state=available] .sgs-core-dot,
    #sgs-toolbox-core-trigger[data-state=pending] .sgs-core-dot { display:block; background:#e5b85d }
    #sgs-toolbox-core-trigger[data-state=error] .sgs-core-dot { display:block; background:#f18271 }
    #sgs-toolbox-core-bar .sgs-core-shade { position:fixed; top:30px; right:0; bottom:50px; left:0; z-index:-1 }
    #sgs-toolbox-core-panel {
      position:absolute; top:31px; right:0; width:min(312px,calc(100vw - 24px)); max-height:calc(100vh - 76px);
      overflow:auto; padding:11px; border:1px solid #63502e; border-radius:10px;
      background:linear-gradient(#272117,#17140f); box-shadow:0 10px 28px #000b;
      overflow-wrap:anywhere; overscroll-behavior:contain;
    }
    #sgs-toolbox-core-panel::-webkit-scrollbar { width:6px }
    #sgs-toolbox-core-panel::-webkit-scrollbar-track { background:transparent }
    #sgs-toolbox-core-panel::-webkit-scrollbar-thumb { background:#6a583a; border-radius:4px }
    #sgs-toolbox-core-panel::-webkit-scrollbar-thumb:hover { background:#85704a }
    #sgs-toolbox-core-panel header, #sgs-toolbox-core-panel .sgs-core-actions {
      display:flex; align-items:center; flex-wrap:wrap; gap:6px;
    }
    #sgs-toolbox-core-panel header strong { font-size:14px }
    #sgs-toolbox-core-panel .sgs-core-refresh { width:28px; padding:0; margin-left:auto }
    #sgs-toolbox-core-panel .sgs-core-edition {
      padding:0 5px; border:1px solid #6a5630; border-radius:4px; color:#dfbe77; font-size:10px;
    }
    #sgs-toolbox-core-panel .sgs-core-card {
      margin-top:9px; padding:8px; border-radius:7px; background:#15120d8c; border:1px solid #3f3423;
    }
    #sgs-toolbox-core-panel h3 { margin:0 0 4px; color:#f1dfb4; font:600 12px/1.5 "Microsoft YaHei",sans-serif }
    #sgs-toolbox-core-panel .sgs-core-origin { margin-left:6px; color:#b7a88b; font-size:11px }
    #sgs-toolbox-core-panel .sgs-core-status, #sgs-toolbox-core-panel .sgs-core-staged {
      margin-top:4px; color:#c8b99e; white-space:pre-wrap;
    }
    #sgs-toolbox-core-panel .sgs-core-staged, #sgs-toolbox-core-panel [data-newer=true] { color:#e6bd71 }
    #sgs-toolbox-core-panel [role=alert] { color:#ff9b8a; white-space:pre-wrap }
    #sgs-toolbox-core-panel .sgs-core-recovery { margin-top:8px; padding:6px 8px; border-left:2px solid #a67e3d; color:#e3c990; background:#35291b }
    #sgs-toolbox-core-panel .sgs-core-actions { margin-top:7px }
    #sgs-toolbox-core-panel button[data-main] { background:linear-gradient(#665027,#493719); color:#ffe5a8; border-color:#8d6e38 }
    #sgs-toolbox-core-panel button[data-rollback] { background:transparent; color:#c8b799 }
    #sgs-toolbox-core-panel .sgs-core-preference {
      display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:31px;
      padding:5px 2px 0; color:#dacaab; cursor:pointer; user-select:none; -webkit-app-region:no-drag;
    }
    #sgs-toolbox-core-panel .sgs-core-switch { position:relative; flex:none; width:34px; height:20px }
    #sgs-toolbox-core-panel .sgs-core-switch input {
      position:absolute; top:0; left:0; width:100%; height:100%; margin:0; opacity:0; cursor:inherit;
    }
    #sgs-toolbox-core-panel .sgs-core-track {
      display:block; width:100%; height:100%; border:1px solid #564b36; border-radius:999px; background:#1c1813;
    }
    #sgs-toolbox-core-panel .sgs-core-track::after {
      content:""; display:block; width:12px; height:12px; margin:3px; border-radius:50%;
      background:#95846a; box-shadow:0 1px 3px #0008;
    }
    #sgs-toolbox-core-panel input:checked + .sgs-core-track { background:#4a371d; border-color:#a38448 }
    #sgs-toolbox-core-panel input:checked + .sgs-core-track::after { background:#e8bf70; transform:translateX(14px) }
    #sgs-toolbox-core-panel input:focus-visible + .sgs-core-track { outline:2px solid #e1bb6e; outline-offset:2px }
    #sgs-toolbox-core-panel input:disabled + .sgs-core-track { opacity:.52 }
    #sgs-toolbox-core-toast {
      position:absolute; top:31px; right:0; width:min(312px,calc(100vw - 16px)); max-height:calc(100vh - 42px);
      display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:start; gap:5px 8px; overflow:auto;
      padding:8px 9px; border:1px solid #69532f; border-radius:9px;
      background:linear-gradient(#302719,#211b13); box-shadow:0 8px 22px #000a; overflow-wrap:anywhere;
      -webkit-app-region:no-drag;
    }
    #sgs-toolbox-core-toast .sgs-core-toast-message { padding:3px 0; color:#ead7a9 }
    #sgs-toolbox-core-toast button[data-main] { justify-self:start }
    #sgs-toolbox-core-toast .sgs-core-toast-close {
      min-height:22px; width:22px; padding:0; border-color:transparent; background:transparent; color:#b7a88b; font-size:16px;
    }
    #sgs-toolbox-core-panel footer { border-top:1px solid #423625; margin-top:9px; padding-top:2px }
    #sgs-toolbox-core-panel .sgs-core-restart-note { margin-top:6px; color:#d0bc93; font-size:11px }
    @media (max-width:540px) {
      #sgs-toolbox-core-trigger .sgs-core-version { display:none }
      #sgs-toolbox-core-panel, #sgs-toolbox-core-toast { position:fixed; top:34px; right:8px; max-width:calc(100vw - 16px) }
    }
    @media (max-width:480px) {
      #sgs-toolbox-core-bar #sgs-toolbox-core-restart { padding:0 7px }
    }
    @media (max-width:360px) {
      #sgs-toolbox-core-bar #sgs-toolbox-core-restart { display:none }
      #sgs-toolbox-core-bar #sgs-toolbox-core-trigger { width:26px; padding:0; position:relative }
      #sgs-toolbox-core-trigger .sgs-core-label { display:none }
      #sgs-toolbox-core-trigger .sgs-core-dot { position:absolute; top:3px; right:3px; width:4px; height:4px }
    }
    @media (prefers-reduced-motion:no-preference) {
      #sgs-toolbox-core-bar button { transition:border-color .15s,color .15s }
      #sgs-toolbox-core-panel .sgs-core-track::after { transition:transform .15s,background .15s }
    }
  `;
  document.head.appendChild(style);
  const bar = document.createElement('div');
  bar.id = 'sgs-toolbox-core-bar';
  bar.innerHTML = `
    <button type="button" id="sgs-toolbox-core-restart" data-action="relaunch" title="更新已就绪，点击重启微端生效（牌局中建议对局结束后再重启）" hidden>
      <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M13.1 6a5.5 5.5 0 1 0 .1 4M13.1 2.8V6h-3.2"/></svg>
      <span>重启生效</span>
    </button>
    <button type="button" id="sgs-toolbox-core-trigger" aria-expanded="false" aria-controls="sgs-toolbox-core-panel" aria-label="工具箱核心" title="工具箱核心">
      <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linejoin="round"><path d="M8 1.5 14 5v6L8 14.5 2 11V5z"/><path d="m2 5 6 3.5L14 5M8 8.5v6"/></svg>
      <span class="sgs-core-label">核心<span class="sgs-core-version"></span></span><span class="sgs-core-dot" aria-hidden="true"></span>
    </button>
    <div class="sgs-core-shade" hidden></div>
    <section id="sgs-toolbox-core-panel" aria-labelledby="sgs-toolbox-core-heading" hidden>
      <header>
        <strong id="sgs-toolbox-core-heading">工具箱核心</strong><span class="sgs-core-edition" hidden></span>
        <button type="button" class="sgs-core-refresh" data-action="check" title="检查更新" aria-label="检查更新">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M13.1 6a5.5 5.5 0 1 0 .1 4M13.1 2.8V6h-3.2"/></svg>
        </button>
      </header>
      <div class="sgs-core-recovery" role="status" hidden></div>
      <div class="sgs-core-card" data-section="script">
        <h3>核心脚本</h3><div><span data-version></span><span class="sgs-core-origin"></span></div>
        <div class="sgs-core-staged" hidden></div><div class="sgs-core-status" role="status"></div>
        <div class="sgs-core-actions" hidden>
          <button type="button" data-action="update-script" data-main hidden>更新脚本</button>
          <button type="button" data-action="rollback-script" data-rollback hidden>回退脚本</button>
        </div>
      </div>
      <div class="sgs-core-card" data-section="runtime">
        <h3>微端底层架构</h3><div><span data-version></span><span class="sgs-core-origin"></span></div>
        <div class="sgs-core-staged" hidden></div><div class="sgs-core-status" role="status"></div>
        <div class="sgs-core-actions" hidden>
          <button type="button" data-action="update-runtime" data-main hidden>更新底层</button>
          <button type="button" data-action="rollback-runtime" data-rollback hidden>回退底层</button>
        </div>
      </div>
      <label class="sgs-core-preference" title="启动后自动下载更新，重启生效，不打断牌局">
        <span>启动时自动更新</span>
        <span class="sgs-core-switch">
          <input id="sgs-toolbox-core-auto-update" type="checkbox" role="switch" disabled>
          <span class="sgs-core-track" aria-hidden="true"></span>
        </span>
      </label>
      <footer>
        <div class="sgs-core-error" role="alert" hidden></div>
        <div class="sgs-core-actions">
          <button type="button" data-action="check">检查更新</button>
          <button type="button" data-action="update-all" data-main hidden>全部更新</button>
          <button type="button" data-action="relaunch" data-main title="牌局中建议对局结束后再重启" hidden>重启微端生效</button>
        </div>
        <div class="sgs-core-restart-note" hidden>已保存变更，牌局中建议对局结束后再重启。</div>
      </footer>
    </section>
    <div id="sgs-toolbox-core-toast" role="status" hidden>
      <span class="sgs-core-toast-message"></span>
      <button type="button" class="sgs-core-toast-close" aria-label="稍后重启，关闭提示">×</button>
      <button type="button" data-action="relaunch" data-main title="牌局中建议对局结束后再重启">立即重启</button>
    </div>
  `;
  document.body.appendChild(bar);

  const [restart, trigger, shade, panel, toast] = bar.children;
  const find = selector => bar.querySelector(selector);
  const buttons = Array.from(bar.querySelectorAll('button[data-action]'));
  const show = (node, value) => { node.hidden = !value; };
  const action = name => panel.querySelector('[data-action="' + name + '"]');
  const autoUpdate = find('#sgs-toolbox-core-auto-update');
  const toastMessage = toast.querySelector('.sgs-core-toast-message');
  const announcementsKey = 'sgs-toolbox-core-announcements';
  let announced = [];
  try {
    const stored = JSON.parse(sessionStorage.getItem(announcementsKey));
    if (Array.isArray(stored)) announced = stored.slice(-16);
  } catch (_) {}
  let state = null, requesting = false, savingPreference = false, uiError = '';
  let toastUpdate = null, lastAnnouncement = -1;
  let toastTimer = null, toastRemaining = 0, toastStarted = 0;

  function pauseToastTimer() {
    if (toastTimer === null) return;
    clearTimeout(toastTimer);
    toastTimer = null;
    toastRemaining = Math.max(0, toastRemaining - (Date.now() - toastStarted));
  }
  function syncToastTimer() {
    if (toast.hidden || toast.matches(':hover') || toast.contains(document.activeElement)) {
      pauseToastTimer();
    } else if (toastTimer === null) {
      toastStarted = Date.now();
      toastTimer = setTimeout(hideToast, toastRemaining);
    }
  }
  function hideToast() {
    pauseToastTimer();
    toastUpdate = null;
    const restoreFocus = toast.contains(document.activeElement);
    toast.hidden = true;
    if (restoreFocus) trigger.focus();
  }
  function pendingVersions(update) {
    return [
      update.scriptVersion === state.script.pending ? update.scriptVersion : null,
      update.runtimeVersion === state.runtime.pending ? update.runtimeVersion : null
    ];
  }
  function renderToast() {
    const update = state?.lastUpdate;
    if (update && update.revision > lastAnnouncement) {
      lastAnnouncement = update.revision;
      const versions = pendingVersions(update);
      const key = JSON.stringify([update.scriptVersion, update.runtimeVersion]);
      if (versions.some(Boolean) && !announced.includes(key)) {
        announced = [...announced.slice(-15), key];
        try { sessionStorage.setItem(announcementsKey, JSON.stringify(announced)); } catch (_) {}
        if (panel.hidden) {
          pauseToastTimer();
          toastUpdate = update;
          toastRemaining = 12000;
          toast.hidden = false;
          syncToastTimer();
        }
      }
    }
    if (!toastUpdate) return;
    const [script, runtime] = pendingVersions(toastUpdate);
    if (!panel.hidden || (!script && !runtime)) { hideToast(); return; }
    const verb = toastUpdate.auto ? '已自动更新' : '已更新';
    const target = script && runtime ? '核心与底层' : (script ? '核心至 v' + script : '底层至 v' + runtime);
    const message = verb + target + '，重启微端生效';
    if (toastMessage.textContent !== message) toastMessage.textContent = message;
  }

  function close(restoreFocus) {
    if (panel.hidden) return;
    panel.hidden = shade.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }
  function renderCard(name, item) {
    const card = find('[data-section="' + name + '"]');
    const status = card.querySelector('.sgs-core-status');
    const staged = card.querySelector('.sgs-core-staged');
    const isRuntime = name === 'runtime';
    card.querySelector('[data-version]').textContent = item.version ? '当前 v' + item.version : '版本未知';
    card.querySelector('.sgs-core-origin').textContent = item.source === 'bundled' ? '内置' : (isRuntime ? '已自更新' : '已热更新');
    staged.textContent = item.pending ? '已保存 v' + item.pending + (isRuntime ? '（重启微端生效）' : '（下次打开游戏或重启生效）') : '';
    show(staged, item.pending);
    let detail = '尚未检查更新';
    if (item.error) detail = item.error;
    else if (item.check?.unsupportedBootstrap) detail = '需要重新运行新版微端安装包升级引导层。';
    else if (item.check?.unavailable) detail = '暂未发布远端底层更新。';
    else if (item.newer) detail = '发现新版 v' + item.check.version;
    else if (item.check) detail = item.pending ? '已保存最新版本。' : '已是当前版本。';
    status.textContent = detail;
    status.setAttribute('role', item.error ? 'alert' : 'status');
    status.dataset.newer = String(item.newer && !item.error);
    show(action('update-' + name), item.newer && !item.pending);
    show(action('rollback-' + name), item.rollback);
    show(card.querySelector('.sgs-core-actions'), (item.newer && !item.pending) || item.rollback);
  }
  function render() {
    const pending = !!(state?.script.pending || state?.runtime.pending);
    const available = !!(state?.script.newer || state?.runtime.newer);
    const error = uiError || (!state?.script.errorAuto && state?.script.error) ||
      (!state?.runtime.errorAuto && state?.runtime.error);
    const busyText = { check:'检查中…', install:'更新中…', rollback:'回退中…' }[state?.busy];
    const indicator = busyText || (pending ? '待重启' : (available ? '有更新' : (error ? '更新异常' : '')));
    const version = state?.script.version;
    trigger.dataset.state = error ? 'error' : (pending ? 'pending' : (available ? 'available' : ''));
    find('.sgs-core-version').textContent = indicator ? ' · ' + indicator : (version ? ' v' + version : '');
    trigger.title = '工具箱核心' + (indicator ? ' · ' + indicator : (version ? ' v' + version : ''));
    trigger.setAttribute('aria-label', trigger.title);
    const notice = find('.sgs-core-error');
    notice.textContent = uiError;
    show(notice, uiError);
    for (const button of buttons) button.disabled = requesting || !!state?.busy || (!state && button.dataset.action !== 'check');
    autoUpdate.disabled = !state || savingPreference;
    if (!savingPreference) autoUpdate.checked = state?.autoUpdate ?? true;
    show(restart, pending);
    panel.querySelector('footer [data-action="check"]').textContent = busyText || '检查更新';
    if (!state) return;
    renderCard('script', state.script);
    renderCard('runtime', state.runtime);
    const edition = find('.sgs-core-edition');
    edition.textContent = state.script.edition.toUpperCase();
    show(edition, state.script.edition);
    const recovery = find('.sgs-core-recovery');
    const recovered = state.runtime.recoveredFrom;
    recovery.textContent = recovered ? '底层 v' + recovered.version + ' 启动异常，已自动回退。' + recovered.reason : '';
    show(recovery, recovered);
    show(action('update-all'), state.script.newer && !state.script.pending && state.runtime.newer && !state.runtime.pending);
    show(action('relaunch'), pending);
    show(find('.sgs-core-restart-note'), pending);
    renderToast();
  }
  function accept(value) {
    if (value && (!state || value.revision >= state.revision)) state = value;
    render();
  }
  async function run(name, silent = false) {
    if (requesting || (state?.busy && name !== 'status')) return;
    requesting = true;
    uiError = '';
    render();
    try { accept(await request({ action: 'core:' + name })); }
    catch (error) {
      if (!silent) uiError = String(error.message || error).replace(/^Error invoking remote method 'sgs-toolbox:channel-shell:v1': (?:Error: )?/, '');
    } finally {
      requesting = false;
      render();
    }
  }
  autoUpdate.addEventListener('change', async () => {
    const enabled = autoUpdate.checked;
    savingPreference = true;
    uiError = '';
    render();
    try { accept(await request({ action: 'core:set-auto-update', enabled })); }
    catch (error) { uiError = '保存启动设置失败：' + String(error.message || error); }
    finally { savingPreference = false; render(); }
  });
  toast.querySelector('.sgs-core-toast-close').addEventListener('click', hideToast);
  toast.addEventListener('mouseenter', pauseToastTimer);
  toast.addEventListener('mouseleave', syncToastTimer);
  toast.addEventListener('focusin', pauseToastTimer);
  toast.addEventListener('focusout', () => queueMicrotask(syncToastTimer));
  trigger.addEventListener('click', () => {
    if (!panel.hidden) { close(false); return; }
    hideToast();
    panel.hidden = shade.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    void run('status');
  });
  bar.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (button && !button.disabled) void run(button.dataset.action);
  });
  document.addEventListener('click', event => {
    if (!bar.contains(event.target) || event.target === shade) close(shade === event.target);
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(true); }
  });
  window.addEventListener('sgs-toolbox-core-state', event => accept(event.detail));
  const channelMenu = document.getElementById('sgs-toolbox-channel-menu');
  if (channelMenu) new MutationObserver(() => {
    // A channel click may still be awaiting its IPC response when the core opens.
    if (!panel.hidden && !channelMenu.hidden) {
      channelMenu.hidden = true;
      document.getElementById('sgs-toolbox-channel')?.setAttribute('aria-expanded', 'false');
    }
  }).observe(channelMenu, { attributes: true, attributeFilter: ['hidden'] });
  void run('status', true);
  setTimeout(async () => {
    try { accept(await request({ action: 'core:startup-sync' })); } catch (_) {}
  }, 2500);
}

module.exports = { mountTopbar };
