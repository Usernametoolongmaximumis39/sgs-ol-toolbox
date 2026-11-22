import { base64url, createPairingRequest, fromBase64url, openPairing, PAIR_INVITE, PAIR_UPDATE, PIN_FORMAT, syncProofBytes } from './sync-pairing-code.js';
import { createPublicTransport, publicOrigin, publicRecovery, publicViewCode, randomPass, readPublicRecovery } from './public-sync.js';
import { publicViewLink } from '../shared/public-sync-view.js';
import { publicUserCode, publicUserName } from '../shared/public-sync-account.js';
import { publicBindingTarget } from '../shared/public-sync-invite.js';
import { openPrivateCredential } from './private-sync-code.js';
import { MICROCLIENT } from './distribution.js';
import { BACKUP_READ_PATH, SYNC_CHANGES_PATH } from '../shared/sync-paths.js';
import { PRIVATE_HTTP_TIMEOUT, privateSyncOrigin } from '../shared/private-sync-http.js';
import { readStargazingJson, STARGAZING_REPORT_LIMIT, STARGAZING_SYNC_PATH } from '../shared/stargazing-source.js';

const databaseName = 'sgs-toolbox-managed-sync';
const recoveryPrefix = 'SGSR1.';
const messages = {
  account_limit: '同步账号名额已满',
  account_mismatch: '绑定账号和当前游戏账号不一致',
  account_revoked: '管理员已解除此账号的绑定',
  account_already_bound: '此账号已有同步绑定',
  installation_already_bound: '服务器已有一个绑定的浏览器或微端',
  private_request_expired: '四位配对码已失效，请重新生成',
  binding_required: '绑定已失效，请重新连接',
  stargazing_unavailable: '同步服务器暂时无法提供观星报表',
  device_revoked: '管理员已撤销此设备',
  invalid_recovery: '恢复密钥或当前游戏账号不匹配',
  invalid_private_credential: '主账号凭据无效、已过期或已使用，请用当前主账号登录并检查凭据',
  invitation_unavailable: '邀请已过期、用完或撤销',
  pairing_device_mismatch: '请在生成这份配对请求的浏览器使用邀请码',
  rate_limited: '请求过多，请稍后重试',
  wrong_pin: '确认码错误',
  public_mode_required: '此服务器已转为公共模式',
  not_public: '该网址还未启用公共模式',
  invalid_view: '查看码错误或分享凭据无效',
  view_locked: '此 IP 输错 50 次，查看已锁定 30 分钟',
  public_preview_disabled: '服务器管理员关闭了公共预览',
  public_recovery_required: '此用户码已在该服务器绑定，请用原设备的公共恢复凭据接续同步',
  public_invite_required: '首次绑定此服务器需要一次性邀请码，请向管理员获取',
  public_invite_unavailable: '一次性邀请码无效或已使用，请向管理员获取新码',
  public_invite_disabled: '服务器已停用一次性邀请码，请向管理员确认绑定方式',
  migration_records_changed: '历史记录有更新，请重新准备转换',
  migration_already_staged: '此账号已有另一份加密历史，请先在后台重置准备状态',
  migration_staged: '历史加密副本已就绪，等待管理员完成转换',
  vault_limit: '公共同步存储超出容量上限',
  invalid_preferences: '同步设置格式无效或超出容量上限',
  backup_upgrade_required: '同步服务器需更新后才能下载完整备份',
  backup_page_expired: '本次下载续传已失效，请在下一个可下载时段重试',
};
const fail = (code, message = messages[code]) => Object.assign(new Error(message ?? '同步服务响应异常'), { code });

function openStore(win, scope) {
  let database;
  const ready = new Promise((resolve, reject) => {
    if (!win.indexedDB) return reject(fail('storage', '当前浏览器无法保存设备配对'));
    const request = win.indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('requests', { keyPath: 'id' });
      request.result.createObjectStore('bindings', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      database = request.result;
      if (scope.signal.aborted) database.close();
      resolve(database);
    };
    request.onerror = () => reject(fail('storage', '配对记录无法打开'));
  });
  scope.add(() => database?.close());
  return async (name, mode, command) => {
    const db = await ready;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, mode);
      const request = command(Array.isArray(name) ? tx : tx.objectStore(name));
      tx.oncomplete = () => resolve(request?.result);
      tx.onabort = tx.onerror = () => reject(fail('storage', '配对记录无法保存'));
    });
  };
}

function safeOrigin(value) {
  try { return privateSyncOrigin(value); }
  catch { throw fail('invalid_endpoint', '请输入完整的 HTTP 或 HTTPS 地址，无需填写路径'); }
}

function describeOrigin(data) {
  return safeOrigin(`${data.tls ? 'https' : 'http'}://${data.domain || data.ipv4 || '[' + data.ipv6 + ']'}:${data.port}`);
}

export function createManagedSync(win, scope, getAccount, gameAccountKey, privateHttp) {
  const currentAccount = () => getAccount().id;
  const exchangeStore = openStore(win, scope);
  const navigator = win.navigator;
  const clientInfo = MICROCLIENT ? { microclient: true }
    : { ipad: navigator?.platform === 'MacIntel' && navigator.maxTouchPoints > 1 || undefined };
  const clientHints = navigator?.userAgentData;
  if (clientHints?.platform === 'Windows' && typeof clientHints.getHighEntropyValues === 'function') {
    void clientHints.getHighEntropyValues(['platformVersion']).then(({ platformVersion }) => {
      const version = Number(platformVersion?.split('.')[0]);
      if (version >= 13) clientInfo.windows = 11;
      else if (version > 0 && version <= 10) clientInfo.windows = 10;
    }).catch(() => {});
  }
  const get = (name, id) => exchangeStore(name, 'readonly', store => store.get(id));
  const put = (name, value) => exchangeStore(name, 'readwrite', store => store.put(value));
  const del = (name, id) => exchangeStore(name, 'readwrite', store => store.delete(id));
  const bindingIndex = new Map();
  let installation, joinError = '', checkedAccount, retryAt = 0, changingInstallation = false;
  const bindingsReady = Promise.all([exchangeStore('bindings', 'readonly', store => store.getAll()),
    get('requests', 'private-installation')]).then(([entries, saved]) => {
    installation = saved;
    for (const entry of entries) bindingIndex.set(entry.id, entry);
  });
  void bindingsReady.catch(() => {});
  const random = (length = 32) => base64url(win.crypto.getRandomValues(new Uint8Array(length)));
  const active = new Map(), probes = new Map(), writes = new Map(), enrolling = new Set();
  function obtainAccount() {
    const id = currentAccount();
    if (!id) throw fail('login_required', '先登录游戏账号');
    return id;
  }
  const ensureAccount = id => {
    if (currentAccount() !== id || scope.signal.aborted) throw fail('account_mismatch');
  };
  function publicProfile(id) {
    const account = getAccount();
    if (account.id !== id || scope.signal.aborted) throw fail('account_mismatch');
    const userCode = publicUserCode(id);
    if (!userCode) throw fail('invalid_public_profile', '无法读取当前账号的用户码');
    return { userCode, name: publicUserName(account.nickname) };
  }
  async function post(origin, path, body, { device, signal } = {}) {
    safeOrigin(origin);
    const insecure = new URL(origin);
    const useBridge = privateHttp && insecure.protocol === 'http:' &&
      !/^(?:127\.0\.0\.1|\[::1\]|(?:[a-z0-9-]+\.)*localhost)$/.test(insecure.hostname);
    const timeout = new AbortController();
    const timer = win.setTimeout(() => timeout.abort(), useBridge ? PRIVATE_HTTP_TIMEOUT :
      path === BACKUP_READ_PATH || path === '/v2/vault/backup' ? 60000 : 9500);
    const cancel = () => timeout.abort();
    scope.signal.addEventListener('abort', cancel, { once: true });
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted || scope.signal.aborted) cancel();
    try {
      // Installed microclient hosts already allow the private backup path.
      const url = origin + (useBridge && path === SYNC_CHANGES_PATH ? BACKUP_READ_PATH : path);
      const data = JSON.stringify(body);
      if (useBridge) {
        const { status, text } = await privateHttp({ url, body: data, device }, timeout.signal);
        if (path === STARGAZING_SYNC_PATH && new TextEncoder().encode(text).byteLength > STARGAZING_REPORT_LIMIT)
          throw fail('stargazing_unavailable');
        const payload = JSON.parse(text);
        if (status < 200 || status >= 300) throw fail(payload?.error);
        return payload;
      }
      const response = await win.fetch(url, { method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', ...(device ? { Authorization: 'Bearer ' + device } : {}) },
        body: data, signal: timeout.signal });
      const payload = path === STARGAZING_SYNC_PATH ? await readStargazingJson(response) : await response.json();
      if (response.status === 404 && (path === BACKUP_READ_PATH || path === '/v2/vault/backup')) throw fail('backup_upgrade_required');
      if (!response.ok) throw fail(payload?.error);
      return payload;
    } catch (error) {
      if (error.code) throw error;
      throw fail('connection_error', insecure.protocol === 'http:'
        ? '无法连接私有同步服务，请检查 HTTP 地址、端口和客户端访问权限'
        : '无法连接同步服务，请检查地址、端口和证书');
    } finally {
      win.clearTimeout(timer);
      scope.signal.removeEventListener('abort', cancel);
      signal?.removeEventListener('abort', cancel);
    }
  }
  const publicTransport = createPublicTransport(win.crypto, post);
  async function readPrivateBackup(origin, body, options) {
    let reply = await post(origin, BACKUP_READ_PATH, body, options);
    if (reply.retryAfter || reply.snapshot) return reply;
    const { downloadId, cursor } = reply;
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const chunks = [];
    for (let offset = 0;;) {
      const bytes = Uint8Array.from(win.atob(reply.chunk), c => c.charCodeAt(0));
      chunks.push(decoder.decode(bytes, { stream: reply.next !== null }));
      if (reply.next === null) break;
      if (!downloadId || !bytes.length || reply.next !== offset + bytes.length) throw new Error('云端备份分页无效');
      offset = reply.next;
      reply = await post(origin, BACKUP_READ_PATH, { ...body, downloadId, offset }, options);
    }
    return { snapshot: JSON.parse(chunks.join('')), cursor };
  }
  const preparedId = id => 'public-prepared:' + id;
  async function prove(origin, signer, signal) {
    const nonce = random(16);
    const proof = await post(origin, '/v1/proof', { nonce, stargazing: true }, { signal });
    try {
      if (proof.nonce !== nonce || proof.origin !== origin || !Number.isSafeInteger(proof.revision)) throw new Error();
      const key = await win.crypto.subtle.importKey('raw', fromBase64url(signer, 65), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
      if (!await win.crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromBase64url(proof.signature, 64), syncProofBytes(proof))) throw new Error();
      fromBase64url(proof.challenge, 16);
      if (proof.next !== null && safeOrigin(proof.next) !== proof.next) throw new Error();
      return proof;
    } catch { throw fail('invalid_proof', '服务器身份验证失败'); }
  }
  const confirm = (proof, device, signal) => post(proof.origin, '/v1/confirm', { challenge: proof.challenge, clientInfo }, { device, signal });
  function writeBinding(id, action) {
    const result = (writes.get(id) ?? Promise.resolve()).then(action);
    const pending = result.catch(() => {});
    writes.set(id, pending);
    return result.finally(() => { if (writes.get(id) === pending) writes.delete(id); });
  }
  const save = (entry, expected = null) => writeBinding(entry.id, async () => {
    const before = bindingIndex.get(entry.id);
    if ((before?.device ?? null) !== expected || before?.revision > entry.revision) throw fail('binding_required');
    await put('bindings', entry);
    bindingIndex.set(entry.id, entry);
    return entry;
  });
  const enroll = async action => {
    const id = obtainAccount();
    if (enrolling.has(id)) throw fail('enrollment_busy', '已有绑定操作正在进行');
    enrolling.add(id);
    try { return await action(); }
    finally { enrolling.delete(id); }
  };
  function enrollPrivate(action) {
    return enroll(async () => {
      if (changingInstallation) throw fail('enrollment_busy', '已有绑定操作正在进行');
      changingInstallation = true;
      try { return await action(); }
      finally { changingInstallation = false; }
    });
  }
  function savePrivate(entry, request, expected = null, pendingId = null) {
    return writeBinding(entry.id, async () => {
      ensureAccount(entry.id);
      if ((bindingIndex.get(entry.id)?.device ?? null) !== expected) throw fail('binding_required');
      const previous = installation;
      const replaced = [...bindingIndex.values()].filter(item => item.privatePair && item.id !== entry.id
        && previous?.requestId === item.requestId);
      const next = { id: 'private-installation', requestId: request.id, origin: entry.origin, signer: entry.signer, secret: request.installation };
      await exchangeStore(['requests', 'bindings'], 'readwrite', tx => {
        const requests = tx.objectStore('requests'), bindings = tx.objectStore('bindings');
        requests.put(next);
        requests.put({ id: request.id, keys: request.keys, expires: Number.MAX_SAFE_INTEGER });
        if (pendingId) requests.delete(pendingId);
        for (const item of replaced) bindings.delete(item.id);
        bindings.put(entry);
      });
      installation = next;
      for (const item of replaced) bindingIndex.delete(item.id);
      bindingIndex.set(entry.id, entry);
      if (previous?.signer === next.signer && previous.origin === next.origin && previous.secret !== next.secret) {
        await post(next.origin, '/v1/private/release', { installation: previous.secret }).catch(() => {});
      }
    });
  }
  async function generate(address) {
    if (!win.crypto?.subtle) throw fail('crypto_unavailable', '请通过 HTTPS 打开游戏后再生成配对请求');
    const request = await createPairingRequest(win.crypto);
    await put('requests', { ...request, device: random(), recovery: random(), installation: random(), expires: Date.now() + 14 * 86400000 });
    if (!address) return request.code;
    const { pin } = await post(safeOrigin(address), '/v1/private/request', { request: request.code });
    if (!PIN_FORMAT.test(pin)) throw fail('invalid_code', '服务端返回的配对码无效');
    return pin;
  }
  async function readInvite(code, prefix) {
    let invitation;
    try {
      invitation = await openPairing(code, prefix, async id => {
        const request = await get('requests', id);
        return request && request.expires > Date.now() ? request.keys : null;
      });
    } catch (error) {
      if (error.message === 'pairing_device_mismatch') throw fail(error.message);
      throw fail('invalid_code', prefix === PAIR_INVITE ? '邀请码格式错误或已损坏' : '地址更新码格式错误或已损坏');
    }
    if (invitation.expiry <= Math.floor(Date.now() / 1000)) throw fail('invitation_unavailable');
    return invitation;
  }
  async function bind(code, pin) {
    const id = obtainAccount();
    await bindingsReady;
    if (bindingIndex.has(id)) throw fail('already_bound', '当前账号已有绑定');
    if (pin && !PIN_FORMAT.test(pin)) throw fail('invalid_pin', '请输入 4 位数字确认码');
    const invitation = await readInvite(code, PAIR_INVITE);
    const origin = describeOrigin(invitation);
    const request = await get('requests', invitation.requestId);
    const proof = await prove(origin, invitation.signer);
    const gameKey = await gameAccountKey(id);
    ensureAccount(id);
    const { account, privatePair } = await post(origin, '/v1/bind', { device: request.device, requestId: request.id, gameKey,
      invite: invitation.token, pin, recovery: request.recovery, installation: request.installation, userCode: id });
    ensureAccount(id);
    const entry = { id, account, origin, signer: invitation.signer, requestId: request.id,
      device: request.device, recovery: request.recovery, revision: proof.revision };
    if (privatePair) {
      await savePrivate({ ...entry, privatePair: true }, request);
    } else {
      await save(entry);
      await put('requests', { id: request.id, keys: request.keys, expires: Number.MAX_SAFE_INTEGER });
    }
    await confirm(proof, request.device).catch(() => {});
  }
  async function bindPrivateCredential(code) {
    const id = obtainAccount();
    await bindingsReady;
    const previous = bindingIndex.get(id);
    if (previous?.public) throw fail('already_bound', '请先解除当前账号的公共同步绑定');
    const gameKey = await gameAccountKey(id);
    let credential, origin;
    try {
      credential = await openPrivateCredential(win.crypto, gameKey, code);
      origin = safeOrigin(credential.origin);
    } catch { throw fail('invalid_private_credential'); }
    ensureAccount(id);
    const { signer, grant } = credential;
    const proof = await prove(origin, signer);
    const pendingId = 'private-credential:' + grant;
    let request = (await get('requests', pendingId))?.request;
    if (!request) {
      request = { ...await createPairingRequest(win.crypto), device: random(), installation: random() };
      await put('requests', { id: pendingId, request });
    }
    ensureAccount(id);
    const { account } = await post(origin, '/v1/private/bind-credential', { grant, gameKey, userCode: id,
      device: request.device, installation: request.installation, requestId: request.id, request: request.code });
    await confirm(proof, request.device);
    await savePrivate({ id, account, origin, signer, requestId: request.id, device: request.device,
      revision: proof.revision, privatePair: true }, request, previous?.device ?? null, pendingId);
  }
  async function joinCurrent() {
    await bindingsReady;
    const id = currentAccount(), owner = installation;
    if (!id || !owner || scope.signal.aborted || changingInstallation || enrolling.has(id)) return;
    const bound = bindingIndex.get(id);
    if (bound && !bound.privatePair) return;
    if (id === checkedAccount && Date.now() < retryAt) return;
    checkedAccount = id;
    joinError = '';
    retryAt = Date.now() + (bound ? 60000 : 15000);
    if (bound) {
      await resolveOnce(bound).catch(async error => {
        if (error.code !== 'binding_required') return;
        await forgetBinding(id, bound.device);
        retryAt = 0;
      });
      return;
    }
    await enroll(async () => {
      // Persist the proposed tokens first so a lost response or reload can retry the same join.
      const pendingId = 'private-join:' + owner.secret + ':' + id;
      let proposed = await get('requests', pendingId);
      if (!proposed) {
        proposed = { id: pendingId, device: random(), recovery: random() };
        await put('requests', proposed);
      }
      const proof = await prove(owner.origin, owner.signer);
      const chosen = proof.next ? await prove(proof.next, owner.signer).catch(() => proof) : proof;
      const gameKey = await gameAccountKey(id);
      ensureAccount(id);
      const { device, recovery } = proposed;
      const { account } = await post(chosen.origin, '/v1/private/join', { installation: owner.secret, device, recovery, gameKey, userCode: id });
      ensureAccount(id);
      if (changingInstallation || installation?.secret !== owner.secret) throw fail('binding_required');
      await save({ id, account, origin: chosen.origin, signer: owner.signer, requestId: owner.requestId,
        previous: chosen.origin === owner.origin ? undefined : owner.origin, device, recovery, revision: chosen.revision, privatePair: true });
      await del('requests', pendingId);
      await confirm(chosen, device).catch(() => {});
    }).catch(error => { if (currentAccount() === id) joinError = error.message; });
  }
  const joinTimer = win.setInterval(() => { void joinCurrent().catch(() => {}); }, 1000);
  scope.add(() => win.clearInterval(joinTimer));
  async function recover(value, address) {
    const id = obtainAccount();
    await bindingsReady;
    if (bindingIndex.has(id)) throw fail('already_bound', '当前账号已有绑定');
    const secret = value.trim();
    let payload;
    try {
      if (!secret.startsWith(recoveryPrefix) || secret.length !== 136) throw new Error();
      payload = fromBase64url(secret.slice(recoveryPrefix.length), 97);
    } catch { throw fail('invalid_recovery'); }
    const origin = safeOrigin(address);
    const signer = base64url(payload.slice(0, 65)), recovery = base64url(payload.slice(65));
    const proof = await prove(origin, signer);
    const request = await createPairingRequest(win.crypto), device = random();
    const gameKey = await gameAccountKey(id);
    ensureAccount(id);
    const { account } = await post(origin, '/v1/recover', { device, requestId: request.id, request: request.code, recovery, gameKey });
    ensureAccount(id);
    await put('requests', { id: request.id, keys: request.keys, expires: Number.MAX_SAFE_INTEGER });
    await save({ id, account, origin, signer, requestId: request.id, device, recovery, revision: proof.revision });
    await confirm(proof, device).catch(() => {});
  }
  async function resolve(entry, signal) {
    let proof;
    try { proof = await prove(entry.origin, entry.signer, signal); }
    catch (error) {
      if (!entry.previous || signal?.aborted) throw error;
      proof = await prove(entry.previous, entry.signer, signal);
    }
    if (proof.revision < entry.revision) throw fail('invalid_proof', '服务器地址版本已回退');
    if (proof.next && (!entry.public || proof.next.startsWith('https:'))) {
      try { proof = await prove(proof.next, entry.signer, signal); }
      catch (error) { if (signal?.aborted) throw error; }
    }
    if (!entry.public) await confirm(proof, entry.device, signal);
    ensureAccount(entry.id);
    if (bindingIndex.get(entry.id)?.device !== entry.device) throw fail('binding_required');
    const stargazing = proof.stargazing === true;
    if (entry.privatePair && changingInstallation) return { ...entry, origin: proof.origin, stargazing };
    if (entry.privatePair && installation?.requestId === entry.requestId && proof.origin !== installation.origin) {
      const owner = { ...installation, origin: proof.origin };
      await put('requests', owner);
      if (installation?.secret === owner.secret) installation = owner;
    }
    if (proof.origin !== entry.origin || proof.revision > entry.revision) {
      const updated = await save({ ...entry, origin: proof.origin, previous: proof.origin === entry.origin ? entry.previous : entry.origin, revision: proof.revision }, entry.device);
      return { ...updated, stargazing };
    }
    return { ...entry, stargazing };
  }
  function resolveOnce(entry, signal) {
    const saved = probes.get(entry.id);
    if (saved?.device === entry.device && !saved.signal?.aborted) return saved.promise;
    const probe = { device: entry.device, signal, promise: null };
    probe.promise = resolve(entry, signal).finally(() => { if (probes.get(entry.id) === probe) probes.delete(entry.id); });
    probes.set(entry.id, probe);
    return probe.promise;
  }
  async function exchange(account, path, data, gameKey, signal) {
    await bindingsReady;
    const entry = bindingIndex.get(account);
    if (!entry) throw fail('binding_required', '请先在「管理 → 云同步」绑定当前账号');
    ensureAccount(account);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const requests = active.get(account) ?? new Set();
    active.set(account, requests);
    requests.add(controller);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    try {
      const resolved = await resolveOnce(entry, controller.signal);
      ensureAccount(account);
      if (bindingIndex.get(account)?.device !== entry.device) throw fail('binding_required');
      const options = { device: entry.device, signal: controller.signal };
      if (path === STARGAZING_SYNC_PATH) {
        controller.signal.throwIfAborted();
        if (!resolved.stargazing) return null;
        const reply = resolved.public
          ? await post(resolved.origin, path, { vault: resolved.vault, credential: resolved.credential }, { signal: controller.signal })
          : await post(resolved.origin, path, {}, options);
        ensureAccount(account);
        controller.signal.throwIfAborted();
        if (!Array.isArray(reply?.sections)) throw fail('stargazing_unavailable');
        return reply;
      }
      const reply = resolved.public
        ? { account: gameKey, ...await publicTransport.exchange(resolved, resolved.origin, path, data, controller.signal) }
        : path === BACKUP_READ_PATH
          ? await readPrivateBackup(resolved.origin, { account: gameKey }, options)
          : await post(resolved.origin, path, { ...data, account: gameKey }, options);
      ensureAccount(account);
      return reply;
    } catch (error) {
      if (entry.privatePair && error.code === 'binding_required') {
        await forgetBinding(account, entry.device);
        retryAt = 0;
      }
      throw error;
    } finally {
      signal?.removeEventListener('abort', cancel);
      requests.delete(controller);
      if (!requests.size) active.delete(account);
    }
  }
  function forgetBinding(id, expected) {
    return writeBinding(id, async () => {
      const current = bindingIndex.get(id);
      if (!current || expected && current.device !== expected) return null;
      for (const request of active.get(id) ?? []) request.abort();
      await del('bindings', id);
      bindingIndex.delete(id);
      return current;
    });
  }
  async function disconnect() {
    const id = obtainAccount();
    await bindingsReady;
    const entry = await forgetBinding(id);
    if (!entry) return true;
    if (entry.public) return true;
    for (const origin of new Set([entry.origin, entry.previous].filter(Boolean))) {
      try {
        await prove(origin, entry.signer);
        await post(origin, '/v1/unbind', {}, { device: entry.device });
        return true;
      } catch (error) {
        if (error.code === 'binding_required') return true;
      }
    }
    return false;
  }
  async function detachPrivate() {
    await bindingsReady;
    const owner = installation;
    if (!owner) return;
    const bound = bindingIndex.get(obtainAccount());
    const proof = await prove(owner.origin, owner.signer).catch(error => {
      if (!bound?.previous) throw error;
      return prove(bound.previous, owner.signer);
    });
    try { await post(proof.origin, '/v1/private/release', { installation: owner.secret }); }
    catch (error) { if (error.code !== 'binding_required') throw error; }
    const attached = [...bindingIndex.values()].filter(entry => entry.privatePair && entry.requestId === owner.requestId);
    await exchangeStore(['requests', 'bindings'], 'readwrite', tx => {
      tx.objectStore('requests').delete(owner.id);
      for (const entry of attached) tx.objectStore('bindings').delete(entry.id);
    });
    installation = null;
    for (const entry of attached) {
      for (const request of active.get(entry.id) ?? []) request.abort();
      bindingIndex.delete(entry.id);
    }
  }
  async function previewLink() {
    const id = obtainAccount(), entry = bindingIndex.get(id);
    if (!entry) throw fail('binding_required');
    const resolved = await resolveOnce(entry);
    const { view } = await post(resolved.origin, '/v1/private/view', {}, { device: resolved.device });
    if (!view) throw fail('binding_required');
    return resolved.origin + '/ledger/?view=' + encodeURIComponent(view);
  }
  async function uniquePassword(gameKey) {
    // Preserve locally issued codes across disconnects and page reloads.
    for (let attempt = 0; attempt < 12; attempt++) {
      const password = randomPass(win.crypto);
      try {
        await exchangeStore('requests', 'readwrite', store => store.add({ id: 'public-password:' + password, gameKey }));
        return password;
      } catch { if (!await get('requests', 'public-password:' + password)) throw fail('storage', '无法保存查看码'); }
    }
    throw fail('storage', '无法生成查看码，请重试');
  }
  async function newVault(id, origin, signer) {
    const gameKey = await gameAccountKey(id);
    return { id, origin, signer, public: true, device: random(), vault: random(), credential: random(),
      seed: random(), password: await uniquePassword(gameKey), gameKey };
  }
  async function bindPublic(target, recovery) {
    const id = obtainAccount();
    await bindingsReady;
    if (bindingIndex.has(id)) throw fail('already_bound', '请先解除当前账号的同步绑定');
    let entry;
    if (recovery) {
      const saved = readPublicRecovery(recovery);
      if (saved.gameKey !== await gameAccountKey(id)) throw fail('account_mismatch');
      entry = { ...saved, id, origin: target ? publicBindingTarget(target).origin : saved.origin, public: true, device: random() };
      await prove(entry.origin, entry.signer);
      await publicTransport.check(entry, publicProfile(id));
    } else {
      const { origin: address, invitation } = publicBindingTarget(target);
      const pendingId = 'public-registration:' + id + ':' + address;
      entry = (await get('requests', pendingId))?.entry ?? await newVault(id, address, '');
      await put('requests', { id: pendingId, entry });
      const { signer } = await publicTransport.register(entry, publicProfile(id), invitation);
      entry.signer = signer;
    }
    const proof = await prove(entry.origin, entry.signer);
    ensureAccount(id);
    await save({ ...entry, account: entry.vault, revision: proof.revision });
    if (!recovery) await del('requests', 'public-registration:' + id + ':' + entry.origin);
  }
  async function preparePublic() {
    const id = obtainAccount();
    await bindingsReady;
    const current = bindingIndex.get(id);
    if (!current || current.public) throw fail('binding_required');
    const proof = await prove(current.origin, current.signer);
    const target = publicOrigin(proof.next || proof.origin);
    const verified = await prove(target, current.signer);
    ensureAccount(id);
    await confirm(verified, current.device);
    const pending = (await get('requests', preparedId(id)))?.entry;
    const entry = pending?.signer === current.signer ? { ...pending, origin: verified.origin } : await newVault(id, verified.origin, current.signer);
    await put('requests', { id: preparedId(id), entry });
    await publicTransport.stage(entry, current.device, publicProfile(id));
    ensureAccount(id);
    return publicRecovery(entry);
  }
  async function usePrepared() {
    const id = obtainAccount();
    await bindingsReady;
    const current = bindingIndex.get(id);
    const entry = (await get('requests', preparedId(id)))?.entry;
    if (!current || current.public || !entry) throw fail('binding_required');
    const proof = await prove(entry.origin, entry.signer);
    await publicTransport.check(entry, publicProfile(id));
    ensureAccount(id);
    await save({ ...entry, account: entry.vault, revision: proof.revision }, current.device);
    await del('requests', preparedId(id));
  }
  async function updatePublicProfile() {
    const id = obtainAccount();
    await bindingsReady;
    const entry = bindingIndex.get(id);
    if (!entry?.public) throw fail('binding_required');
    const resolved = await resolveOnce(entry);
    const { profileRegistered } = await publicTransport.check(resolved, publicProfile(id));
    ensureAccount(id);
    if (!profileRegistered) throw fail('profile_upgrade_required', '同步服务器更新后才能登记账号资料');
  }
  async function update(code) {
    const id = obtainAccount();
    await bindingsReady;
    const entry = bindingIndex.get(id);
    if (!entry) throw fail('binding_required');
    const invitation = await readInvite(code, PAIR_UPDATE);
    if (entry.signer !== invitation.signer || entry.requestId !== invitation.requestId) throw fail('invalid_proof', '地址更新码的服务器身份不匹配');
    const origin = describeOrigin(invitation);
    const proof = await prove(origin, entry.signer);
    if (proof.revision < entry.revision) throw fail('invalid_proof', '地址更新码已失效');
    await confirm(proof, entry.device);
    ensureAccount(id);
    await save({ ...entry, origin, previous: entry.origin, revision: proof.revision }, entry.device);
  }
  return {
    ready: bindingsReady,
    async readStargazingReport({ signal } = {}) {
      await bindingsReady;
      signal?.throwIfAborted();
      const id = currentAccount();
      if (!bindingIndex.has(id)) return null;
      try { return await exchange(id, STARGAZING_SYNC_PATH, undefined, undefined, signal); }
      catch (error) {
        if (error.code === 'stargazing_disabled') return null;
        throw error;
      }
    },
    status() {
      const id = currentAccount(), entry = bindingIndex.get(id);
      return { signedIn: Boolean(id), accountId: id, connected: Boolean(entry), origin: entry?.origin, privatePair: Boolean(installation),
        public: Boolean(entry?.public), password: entry?.public ? entry.password : '', bindingIdentity: entry?.device,
        joinError: id === checkedAccount ? joinError : '' };
    },
    available: account => bindingIndex.has(account),
    cacheKey: account => bindingIndex.get(account)?.account,
    generate, bind: (code, pin) => enrollPrivate(() => bind(code, pin)),
    bindPrivateCredential: code => enrollPrivate(() => bindPrivateCredential(code)),
    recover: (code, address) => enroll(() => recover(code, address)), disconnect, detachPrivate: () => enrollPrivate(detachPrivate), update, exchange, previewLink,
    bindPublic: (target, recovery) => enroll(() => bindPublic(target, recovery)),
    updatePublicProfile: () => enroll(updatePublicProfile),
    preparePublic: () => enroll(preparePublic), usePrepared: () => enroll(usePrepared),
    viewCode() {
      const entry = bindingIndex.get(obtainAccount());
      if (!entry?.public) throw fail('binding_required');
      return publicViewCode(entry);
    },
    async viewLink() {
      const entry = bindingIndex.get(obtainAccount());
      if (!entry?.public) throw fail('binding_required');
      return publicViewLink(await resolveOnce(entry));
    },
    previewPublic: publicTransport.preview,
    recoveryCode() {
      const entry = bindingIndex.get(obtainAccount());
      if (!entry) throw fail('binding_required');
      if (entry.public) return publicRecovery(entry);
      if (entry.privatePair) throw fail('binding_required', '请在服务器管理页生成主账号凭据');
      return recoveryPrefix + base64url(Uint8Array.of(...fromBase64url(entry.signer, 65), ...fromBase64url(entry.recovery, 32)));
    },
  };
}
