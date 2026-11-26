import { publicRecordText } from '../shared/public-sync-view.js';
import { createIcon } from './icons.js';
import { ALIYUN_ICON, CODEX_ICON, DEEPSEEK_HARNESS_ICON, DOUBAO_WORK_ICON, TENCENT_CLOUD_ICON, WORKBUDDY_ICON } from './sync-service-icons.js';

const PRIVATE_SERVER_REPOSITORY = 'https://github.com/Usernametoolongmaximumis39/sgs-ol-toolbox-sync-server';
const TEST_NOTICE = '这是云同步测试服务器，测试结束后会停用。备份由工具箱加密后上传。没有六位访问码，其他人无法通过分享链接解密你的数据。';

export function downloadSyncBackup(window, preferences) {
  return preferences.restore(() => window.confirm('将恢复当前账号的云端设置和水表，并合并账本及战绩。继续下载？'));
}

export function mountSyncSettings(document, window, sync, preferences, { initialMode = 'private', onModeChange } = {}) {
  const node = (tag, label, className) => {
    const element = document.createElement(tag);
    if (label) element.textContent = label;
    if (className) element.className = className;
    return element;
  };
  const root = node('div', '', 'sync-settings');
  const style = node('style', `
    .sync-settings,.sync-stack{display:grid;gap:9px;min-width:0}
    .sync-settings{font-size:12px;line-height:1.55}
    .sync-settings [hidden]{display:none!important}
    .sync-settings label{display:grid;min-width:0;gap:4px}
    .sync-settings input:not(.sgs-switch),.sync-settings textarea{width:100%;min-width:0;box-sizing:border-box;color:var(--sgs-text);background:var(--sgs-surface);border:1px solid var(--sgs-border);border-radius:7px;padding:6px 8px;font:inherit}
    .sync-settings textarea{resize:vertical;line-height:1.45;overflow-wrap:anywhere}
    .sync-settings .sync-address{min-height:31px;resize:none;overflow:hidden;white-space:pre}
    .sync-settings input:focus-visible,.sync-settings textarea:focus-visible,.sync-settings summary:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}
    .sync-settings summary{cursor:pointer;color:var(--sgs-text);padding:7px 0}
    .sync-settings details[open]>summary{margin-bottom:6px}
    .sync-settings p{margin:0;overflow-wrap:anywhere}
    .sync-settings button{min-height:29px;justify-self:start;max-width:100%;padding:5px 9px;font-size:11px;white-space:normal}
    .sync-settings .sync-primary{color:var(--sgs-accent);border-color:color-mix(in srgb,var(--sgs-accent) 42%,var(--sgs-border))}
    .sync-settings .sync-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .sync-settings h3{margin:0}
    .sync-chooser{display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:3px;background:#0002;background:color-mix(in srgb,var(--sgs-border) 16%,var(--sgs-surface));border-radius:8px;box-shadow:inset 0 1px 3px #0002}
    .sync-chooser button{width:100%;min-height:26px;border:0;border-radius:5px;padding:4px 4px;background:transparent;box-shadow:none;color:var(--sgs-muted);white-space:nowrap}
    .sync-chooser [aria-pressed=true]{color:var(--sgs-accent);background:linear-gradient(color-mix(in srgb,var(--sgs-accent) 18%,transparent),color-mix(in srgb,var(--sgs-accent) 7%,transparent));box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-accent) 14%,transparent),0 1px 3px #0003}
    .sync-settings .sync-short{max-width:12ch;letter-spacing:.15em;font-variant-numeric:tabular-nums}
    .sync-preview-rows{list-style:none;padding:0;margin:0;min-width:0}
    .sync-preview-rows li{padding:6px 0;border-bottom:1px solid var(--sgs-border);overflow-wrap:anywhere}
    .sync-preferences{padding:9px 0;border-top:1px solid var(--sgs-border);border-bottom:1px solid var(--sgs-border)}
    .sync-settings .sync-download{display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
    .sync-download svg{width:16px;height:16px;flex:none;margin:0}
    .sync-private-setup{gap:7px;padding:9px 10px;border:1px solid var(--sgs-border);border-radius:8px;background:var(--sgs-surface)}
    .sync-private-setup .sync-actions{min-width:0}
    .sync-test{gap:6px;padding:8px 10px;border-left:2px solid var(--sgs-accent);background:var(--sgs-surface);border-radius:6px}
    .sync-settings .sync-copy-link{display:inline-flex;align-items:center;gap:5px;padding:3px 7px;white-space:nowrap}
    .sync-copy-link svg{width:14px;height:14px;flex:none}
    .sync-setup-resources{display:grid;gap:4px}
    .sync-setup-resources h4{margin:0;color:var(--sgs-muted);font:inherit;font-size:.9em;font-weight:600}
    .sync-setup-links{display:flex;flex-wrap:wrap;align-items:center;gap:0 7px;font-size:.94em}
    .sync-setup-links a{display:inline-flex;align-items:center;gap:5px;min-height:28px;white-space:nowrap;text-decoration:none;border-radius:3px}
    .sync-setup-links a:hover,.sync-setup-links a:focus{text-decoration:underline;text-underline-offset:3px}
    .sync-setup-links a:focus,.sync-settings .sync-copy-link:focus{outline:2px solid var(--sgs-accent);outline-offset:2px}
    .sync-setup-links img{width:16px;height:16px;flex:none;object-fit:contain}
  `);
  const state = node('p', '', 'notice'), notice = node('p', '', 'notice');
  notice.setAttribute('role', 'status');
  const pairing = node('div', '', 'sync-stack'), connected = node('div', '', 'sync-stack');
  const preferencePanel = node('section', '', 'sync-stack sync-preferences');
  function input(label, tag = 'input') {
    const wrapper = node('label', label), control = node(tag);
    control.autocomplete = 'off';
    control.spellcheck = false;
    if (tag === 'textarea') control.rows = 2;
    wrapper.append(control);
    return { wrapper, control };
  }
  function short(control, size) {
    control.maxLength = size;
    control.className = 'sync-short';
  }
  function serverAddress(label, placeholder) {
    const result = input(label, 'textarea');
    const { control } = result;
    // Chrome's password parser considers text inputs as username candidates.
    control.className = 'sync-address';
    control.rows = 1;
    control.wrap = 'off';
    control.placeholder = placeholder;
    control.setAttribute('autocapitalize', 'off');
    control.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) event.preventDefault();
    });
    return result;
  }
  function details(title, ...children) {
    const block = node('details', '', 'sgs-fold'), body = node('div', '', 'sync-stack');
    body.append(...children);
    block.append(node('summary', title), body);
    return block;
  }
  function say(text, error = false) {
    notice.textContent = text;
    notice.classList.toggle('error', error);
    notice.hidden = !text;
  }
  function act(title, work, primary = false) {
    const button = node('button', title, primary ? 'sync-primary' : '');
    button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await work(); }
      catch (error) { say(error.message, true); }
      finally { button.disabled = false; refresh(); }
    });
    return button;
  }
  preferencePanel.append(node('h3', '云端备份'),
    node('p', '首次绑定下载备份，日常只拉取变更。全量备份限每设备每账号每小时一次。', 'muted'),
    node('p', '相关操作完成后自动上传，每分钟检查待上传内容。', 'muted'));
  const restorePreferences = act('下载全部备份', async () => {
    say(await downloadSyncBackup(window, preferences));
  }, true);
  restorePreferences.classList.add('sync-download');
  restorePreferences.prepend(createIcon(document, 'arrowDown'));
  const preferenceNotice = node('p', '', 'muted');
  const backupError = node('p', '', 'notice error');
  backupError.setAttribute('role', 'status');
  preferencePanel.append(preferenceNotice, restorePreferences, backupError);
  async function copy(value, output, report = say) {
    try { await window.navigator.clipboard.writeText(value); report('已复制'); }
    catch {
      output.control.value = value;
      output.wrapper.hidden = false;
      output.control.focus();
      output.control.select();
      report('已选中文本，请手动复制');
    }
  }
  function readout(name, tag) {
    const result = input(name, tag);
    result.wrapper.hidden = true;
    result.control.readOnly = true;
    return result;
  }
  const privatePanel = node('div', '', 'sync-stack'), publicPanel = node('div', '', 'sync-stack');
  const chooser = node('div', '', 'sync-chooser');
  const privateButton = act('私有服务器', () => select('private'));
  const publicButton = act('公共服务器', () => select('public'));
  let selectedMode = 'private';
  function select(mode) {
    selectedMode = mode;
    onModeChange?.(mode);
    privateButton.setAttribute('aria-pressed', String(mode === 'private'));
    publicButton.setAttribute('aria-pressed', String(mode === 'public'));
    say('');
  }
  chooser.append(privateButton, publicButton);
  function resourceLinks(title, entries) {
    const group = node('div', '', 'sync-setup-resources'), links = node('div', '', 'sync-setup-links');
    for (const [label, href, icon] of entries) {
      const link = node('a', label);
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const image = node('img');
      image.alt = '';
      image.src = icon;
      link.prepend(image);
      links.append(link);
    }
    group.append(node('h4', title), links);
    return group;
  }
  const privateSetup = node('section', '', 'sync-stack sync-private-setup');
  const repository = readout('私有同步服务端链接');
  const copyStatus = node('span', '', 'muted');
  copyStatus.setAttribute('role', 'status');
  const copyRepository = act('复制服务端链接', () => copy(PRIVATE_SERVER_REPOSITORY, repository, message => {
    copyStatus.textContent = message;
  }), true);
  copyRepository.classList.add('sync-copy-link');
  copyRepository.prepend(createIcon(document, 'clipboard'));
  const copyRow = node('div', '', 'sync-actions');
  copyRow.append(copyRepository, copyStatus);
  privateSetup.append(node('h3', '自建私有同步'),
    node('p', '把服务端链接发给 AI Agent，请它协助部署。', 'muted'), copyRow, repository.wrapper,
    resourceLinks('AI Agent 下载', [
      ['DeepSeek Harness', 'https://www.deepseek.com/download/', DEEPSEEK_HARNESS_ICON],
      ['豆包工作', 'https://www.doubao.com/download/desktop', DOUBAO_WORK_ICON],
      ['WorkBuddy', 'https://www.workbuddy.cn/#download-section', WORKBUDDY_ICON],
      ['Codex', 'https://chatgpt.com/zh-Hans-CN/features/codex-get-started/', CODEX_ICON],
    ]),
    resourceLinks('云服务器', [
      ['阿里云免费试用', 'https://www.aliyun.com/activity/ecs/ecs/freetrial', ALIYUN_ICON],
      ['腾讯云', 'https://cloud.tencent.com/product/lighthouse', TENCENT_CLOUD_ICON],
    ]));
  const request = readout('提交给管理员的四位码'), credential = input('后台生成的加密凭据', 'textarea');
  short(request.control, 4);
  credential.control.maxLength = 660;
  const address = serverAddress('私有服务器地址', 'http://127.0.0.1:17429');
  const privateConsent = '私有服务器支持 HTTP 和 HTTPS，可读取上传的数据。HTTP 传输未经加密。绑定后切号可自动接入同一服务器，共 1 个主账号和 4 个附属账号。';
  const privateFields = node('div', '', 'sync-stack'), joining = node('p', '', 'muted');
  const ways = node('div', '', 'sync-chooser'), fourDigit = node('div', '', 'sync-stack');
  function credentialForm(action) {
    const secret = input('主账号绑定凭据', 'textarea'), form = node('div', '', 'sync-stack');
    let inputAccount;
    secret.control.maxLength = 700;
    secret.control.addEventListener('input', () => { inputAccount = sync.status().accountId; });
    form.append(node('p', '请先登录主账号，再粘贴服务器管理页生成的凭据。更换服务器后可用它接续已迁移的历史。', 'muted'),
      secret.wrapper, act(action, async () => {
        await sync.bindPrivateCredential(secret.control.value);
        secret.control.value = '';
        say('私有服务器绑定成功');
      }, true));
    return { form, clearFor(account) { if (inputAccount !== account) secret.control.value = ''; } };
  }
  const credentialBinding = credentialForm('同意并使用凭据绑定');
  const fourDigitButton = act('四位码', () => selectPrivate('pin'));
  const credentialButton = act('主账号凭据', () => selectPrivate('credential'));
  function selectPrivate(mode) {
    fourDigit.hidden = mode !== 'pin';
    credentialBinding.form.hidden = mode !== 'credential';
    fourDigitButton.setAttribute('aria-pressed', String(mode === 'pin'));
    credentialButton.setAttribute('aria-pressed', String(mode === 'credential'));
    say('');
  }
  ways.append(fourDigitButton, credentialButton);
  fourDigit.append(act('生成四位配对码', async () => {
    request.control.value = await sync.generate(address.control.value.trim() || address.control.placeholder);
    request.wrapper.hidden = false;
    say('在管理页输入此码，5 分钟内有效');
  }), request.wrapper, credential.wrapper, act('同意并绑定私有服务器', async () => {
    await sync.bind(credential.control.value.trim());
    credential.control.value = request.control.value = '';
    request.wrapper.hidden = true;
    say('私有服务器绑定成功');
  }, true), details('更改私有服务器地址', address.wrapper));
  privateFields.append(node('p', privateConsent, 'muted'), ways, fourDigit, credentialBinding.form);
  privatePanel.append(privateSetup, privateFields, joining);
  const server = serverAddress('公共服务器地址或邀请码', 'https://sync.example.com:8888'), restore = input('公共恢复凭据', 'textarea');
  const publicBinding = node('div', '', 'sync-stack');
  const publicConsent = '服务器管理员可见用户码、昵称和记录编号。账本、战绩和备份内容在工具箱加密。';
  const testPanel = node('section', '', 'sync-stack sync-test');
  const testButton = act('参加云同步灰测', async () => {
    await sync.bindTest();
    say('已绑定云同步测试服务器');
  }, true);
  testButton.dataset.syncBindTest = '';
  testPanel.append(node('h3', '云同步灰测'), node('p', TEST_NOTICE, 'muted'), testButton);
  publicBinding.append(node('p', publicConsent, 'muted'),
    server.wrapper, node('p', '首次绑定请填写管理员提供的地址或一次性邀请码。已登记账号可直接填写地址绑定新设备。', 'muted'),
    act('同意并绑定公共服务器', async () => {
      await sync.bindPublic(server.control.value.trim());
      server.control.value = '';
      say('公共服务器绑定成功');
    }, true), details('在新设备恢复公共账号',
      node('p', '使用原设备的恢复凭据接续云端历史。直接用地址绑定会创建独立存储。', 'muted'), restore.wrapper,
      act('恢复公共绑定', async () => {
        await sync.bindPublic(server.control.value.trim(), restore.control.value);
        server.control.value = '';
        restore.control.value = '';
        say('公共绑定已恢复');
      })));
  publicPanel.append(testPanel, publicBinding);
  pairing.append(chooser, privatePanel, publicPanel);

  const privateActions = node('div', '', 'sync-stack'), publicActions = node('div', '', 'sync-stack');
  const share = readout('账本与战绩查看链接'), prepared = readout('转换用的公共恢复凭据', 'textarea');
  const addressUpdate = input('地址更新码', 'textarea'), recovery = readout('公共恢复凭据', 'textarea');
  const publicShare = readout('公共分享凭据', 'textarea'), password = readout('我的六位查看码');
  const publicLink = readout('公共 HTTPS 分享链接', 'textarea');
  const testBoundNotice = node('p', TEST_NOTICE, 'notice');
  short(password.control, 6);
  const publicMigration = details('准备转为公共模式',
    node('p', '管理员配置 HTTPS 后，在这里生成历史的加密副本。管理页确认转换后，再启用公共连接。请备份生成的恢复凭据。', 'muted'),
    node('p', publicConsent, 'muted'),
    act('准备当前账号的加密历史', async () => {
      prepared.control.value = await sync.preparePublic();
      prepared.wrapper.hidden = false;
      say('加密副本已上传，请备份恢复凭据');
    }), prepared.wrapper,
    act('启用已准备的公共连接', async () => { await sync.usePrepared(); say('已启用公共加密同步'); }));
  async function removeInstallation() {
    if (!window.confirm('解除后，此设备将停止同步，服务器上的历史和其他设备继续可用。继续？')) return;
    await sync.detachPrivate();
    say('已解除安装绑定');
  }
  const detach = act('解除此浏览器或微端', removeInstallation);
  const detachInactive = act('解除此浏览器或微端', removeInstallation);
  privatePanel.append(detachInactive);
  const rebind = credentialForm('同意并重新绑定');
  privateActions.append(node('p', '拿到私有查看链接的人可以直接查看该账号的记录。', 'muted'),
    act('复制当前账号查看链接', async () => copy(await sync.previewLink(), share)), share.wrapper,
    details('服务器地址变更', addressUpdate.wrapper, act('验证并更新地址', async () => {
      await sync.update(addressUpdate.control.value); addressUpdate.control.value = ''; say('同步地址已更新');
    })), details('使用主账号凭据重新绑定', rebind.form), publicMigration, detach);
  publicActions.append(testBoundNotice, node('p', '管理员允许分享时，接收人可在浏览器打开 HTTPS 链接并输入六位查看码。请分开发送。', 'muted'),
    act('复制公共分享链接', async () => copy(await sync.viewLink(), publicLink), true), publicLink.wrapper,
    act('显示六位查看码', () => { password.wrapper.hidden = !password.wrapper.hidden; }), password.wrapper,
    details('其他公共凭据',
      act('复制公共分享凭据', () => copy(sync.viewCode(), publicShare)), publicShare.wrapper,
      act('复制公共恢复凭据', () => copy(sync.recoveryCode(), recovery)), recovery.wrapper),
    details('补登或更新后台账号资料',
      node('p', '已绑定的账号可以把当前用户码和昵称补登到服务器后台，供管理员识别。', 'muted'),
      act('同意并更新账号资料', async () => {
        await sync.updatePublicProfile();
        say('后台账号资料已更新');
      })),
    act('断开当前账号', async () => {
      if (!window.confirm('请先保存公共恢复凭据。断开当前账号？')) return;
      await sync.disconnect(); say('当前账号已断开');
    }));
  connected.append(privateActions, publicActions);

  const readCode = input('接收的公共分享凭据', 'textarea'), readPass = input('六位查看码');
  short(readPass.control, 6);
  readPass.control.type = 'password';
  readPass.control.name = 'sgs-sync-view-code';
  const rows = node('ul', '', 'sync-preview-rows'), result = node('div', '', 'sync-stack'), count = node('p', '', 'muted');
  const filters = node('div', '', 'sync-actions'), pager = node('div', '', 'sync-actions');
  let snapshot, page = 0, stream = 'events';
  const streamButton = kind => act(kind === 'events' ? '账本流水' : '对局战绩', () => { stream = kind; page = 0; draw(); });
  const events = streamButton('events'), matches = streamButton('matches');
  const prev = act('上一页', () => { page--; draw(); }), next = act('下一页', () => { page++; draw(); });
  filters.append(events, matches);
  pager.append(prev, next);
  result.append(filters, count, rows, pager);
  result.hidden = true;
  function draw() {
    if (!snapshot) return;
    const records = (stream === 'events' ? [...snapshot.ledger.events] : [...snapshot.matches])
      .sort((a, b) => (b.at ?? b.endedAt) - (a.at ?? a.endedAt));
    events.setAttribute('aria-pressed', String(stream === 'events'));
    matches.setAttribute('aria-pressed', String(stream === 'matches'));
    const perPage = 20, pages = Math.max(1, Math.ceil(records.length / perPage));
    page = Math.max(0, Math.min(page, pages - 1));
    prev.hidden = !page;
    next.hidden = page + 1 >= pages;
    count.textContent = records.length ? `${records.length} 条 · 第 ${page + 1} / ${pages} 页` : '暂无记录';
    rows.replaceChildren(...records.slice(page * perPage, (page + 1) * perPage).map(row => {
      const element = node('li');
      element.append(node('p', publicRecordText(stream, row)), node('p', new Date(row.at ?? row.endedAt).toLocaleString() + ' · ' + (row.id ?? row.gameId), 'muted'));
      return element;
    }));
  }
  const readNotice = node('p', '', 'notice error');
  readNotice.setAttribute('role', 'status');
  readNotice.hidden = true;
  const viewForm = node('form', '', 'sync-stack');
  viewForm.autocomplete = 'off';
  viewForm.addEventListener('submit', event => event.preventDefault());
  viewForm.append(readCode.wrapper, readPass.wrapper,
    act('解密并查看', async () => {
      result.hidden = true;
      readNotice.hidden = true;
      try { snapshot = await sync.previewPublic(readCode.control.value, readPass.control.value); }
      catch (error) { readNotice.textContent = error.message; readNotice.hidden = false; return; }
      readPass.control.value = '';
      page = 0;
      draw();
      result.hidden = false;
    }, true), readNotice, result);
  const viewer = details('查看他人分享的记录', viewForm);

  let bindingIdentity, checkedTestAccount, disposed = false;
  function refresh() {
    if (disposed) return;
    const status = sync.status();
    const text = status.connected ? (status.testing ? '当前账号已绑定云同步测试服务器' : status.public ? '当前账号已绑定公共服务器' : '当前账号已绑定私有服务器')
      : status.signedIn ? '当前账号尚未绑定' : '登录游戏后可绑定同步服务';
    if (state.textContent !== text) state.textContent = text;
    pairing.hidden = status.connected;
    privatePanel.hidden = selectedMode !== 'private';
    privateFields.hidden = !status.signedIn;
    publicPanel.hidden = selectedMode !== 'public';
    publicBinding.hidden = !status.signedIn;
    testPanel.hidden = !status.testAvailable;
    testBoundNotice.hidden = !status.testing;
    if (selectedMode === 'public' && status.signedIn && !status.connected && !status.testAvailable &&
      checkedTestAccount !== status.accountId && sync.loadTestEligibility) {
      checkedTestAccount = status.accountId;
      void sync.loadTestEligibility().then(refresh, () => {});
    }
    const publicSection = status.connected ? publicActions : publicPanel;
    if (viewer.parentElement !== publicSection) publicSection.append(viewer);
    preferencePanel.hidden = !preferences || !status.connected;
    if (preferences) {
      restorePreferences.disabled = preferences.busy;
      backupError.hidden = !preferences.error;
      if (backupError.textContent !== preferences.error) backupError.textContent = preferences.error;
      const hint = status.public ? '备份在工具箱加密后上传。' : '私有服务器可读取备份。HTTP 传输未经加密。';
      if (preferenceNotice.textContent !== hint) preferenceNotice.textContent = hint;
    }
    connected.hidden = !status.connected;
    joining.hidden = !status.signedIn || !status.privatePair;
    const info = status.joinError || '此设备会自动检查当前账号的私有绑定。';
    if (joining.textContent !== info) joining.textContent = info;
    privateActions.hidden = status.public;
    publicActions.hidden = !status.public;
    detach.hidden = !status.privatePair;
    detachInactive.hidden = !status.signedIn || !status.privatePair || !status.joinError;
    credentialBinding.clearFor(status.accountId);
    rebind.clearFor(status.accountId);
    if (bindingIdentity !== status.bindingIdentity) {
      bindingIdentity = status.bindingIdentity;
      for (const output of [share, prepared, recovery, publicShare, publicLink, password]) {
        output.wrapper.hidden = true;
        output.control.value = '';
      }
    }
    if (password.control.value !== status.password) password.control.value = status.password;
  }
  root.append(style, state, pairing, preferencePanel, notice, connected);
  select(initialMode);
  selectPrivate('pin');
  refresh();
  void sync.ready.then(refresh, error => say(error.message, true));
  const timer = window.setInterval(refresh, 1000);
  return { root, dispose() { disposed = true; window.clearInterval(timer); } };
}
