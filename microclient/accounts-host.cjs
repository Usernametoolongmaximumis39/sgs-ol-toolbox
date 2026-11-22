'use strict';

const path = require('path');
const { fileURLToPath } = require('url');
const { randomBytes } = require('crypto');
const { createStore } = require('./accounts-store.cjs');
const { loginChannel, ipc, validCredentials } = require('./account-pages.cjs');
const { mountAccounts } = require('./accounts-shell.cjs');

function register({ app, ipcMain, channelState, shellFile }) {
  const shells = new WeakMap();
  const guests = new WeakMap();
  const store = createStore(() => app.getPath('userData'));
  const channel = () => channelState().running;

  function isShell(value) {
    try { return path.resolve(fileURLToPath(value)).toLowerCase() === shellFile.toLowerCase(); }
    catch (_) { return false; }
  }
  function fromTop(event, frame) {
    if (event.senderFrame) return !event.senderFrame.parent;
    return frame && event.frameId === frame.id && event.sender.getProcessId() === frame.process;
  }
  function fromLogin(event, guest) {
    const id = channel();
    const url = event.senderFrame ? event.senderFrame.url : event.sender.getURL();
    return guest && !guest.closed && fromTop(event, guest.frame) && loginChannel(url) === id && (id === 1 || id === 3);
  }
  function notify(shell, detail = null) {
    if (!shell.isDestroyed() && isShell(shell.getURL())) {
      const script = `window.dispatchEvent(new CustomEvent('sgs-toolbox-accounts-state', {detail:${JSON.stringify(detail)}}))`;
      shell.executeJavaScript(script).catch(() => {});
    }
  }
  function attach(shell, state, contents) {
    if (!isShell(shell.getURL()) || state.guest) return;
    const guest = { contents, shell, frame: null, login: null, closed: false };
    state.guest = guest;
    guests.set(contents, guest);
    contents.on('did-start-navigation', (_, _url, inPlace, main, process, id) => {
      if (!main || inPlace) return;
      guest.frame = { process, id };
    });
    contents.on('did-frame-navigate', (_, _url, _code, _text, main, process, id) => {
      if (!main) return;
      guest.frame = { process, id };
      notify(shell);
    });
    contents.once('destroyed', () => {
      guest.closed = true;
      if (guest.login) guest.login.finish('form');
      state.guest = null;
      notify(shell);
    });
    notify(shell);
  }
  app.on('web-contents-created', (_, contents) => {
    if (contents.getType() !== 'window') return;
    const state = { guest: null, frame: null };
    shells.set(contents, state);
    contents.on('did-frame-navigate', (_, _url, _code, _text, main, process, id) => {
      if (main) state.frame = { process, id };
    });
    contents.on('did-finish-load', () => {
      if (isShell(contents.getURL())) contents.executeJavaScript(`(${mountAccounts.toString()})();`).catch(() => {});
    });
    contents.on('did-attach-webview', (_, guest) => attach(contents, state, guest));
  });
  ipcMain.on(ipc.save, (event, value) => {
    const guest = guests.get(event.sender);
    if (!fromLogin(event, guest) || !validCredentials(value)) return;
    const id = channel();
    const credentials = { username: id === 3 ? value.username.trim() : value.username, password: value.password };
    store.save(id, credentials).then(saved => {
      if (saved && !channelState().restartRequired) notify(guest.shell, { type: 'saved', ...saved });
    }, () => notify(guest.shell, { type: 'error' }));
  });
  ipcMain.handle(ipc.take, (event, id) => {
    const guest = guests.get(event.sender);
    if (!fromLogin(event, guest) || !guest.login || guest.login.id !== id) return null;
    const credentials = guest.login.credentials;
    guest.login.credentials = null;
    return credentials;
  });
  ipcMain.on(ipc.result, (event, id, status) => {
    const guest = guests.get(event.sender);
    if (fromLogin(event, guest) && guest.login?.id === id &&
      ['form', 'signed-in', 'agreement', 'submitted'].includes(status)) guest.login.finish(status);
  });
  async function handle(event, request) {
    const state = shells.get(event.sender);
    if (!state || !fromTop(event, state.frame) || !isShell(event.sender.getURL()) ||
      (event.senderFrame && !isShell(event.senderFrame.url))) throw new Error('仅允许微端外壳管理保存的账号');
    const { running: channelId, selected, restartRequired } = channelState();
    const guest = state.guest;
    const login = () => guest && !guest.closed && !channelState().restartRequired && loginChannel(guest.contents.getURL()) === channelId;
    if (request.action === 'accounts:list') {
      if (restartRequired) return { channelId: selected, accounts: [], login: false, restartRequired: true };
      const supported = channelId === 1 || channelId === 3;
      return { channelId, accounts: supported ? await store.list(channelId) : [], login: supported && !!login() };
    }
    if (restartRequired) throw new Error('请重启微端后管理该渠道的账号');
    if (typeof request.id !== 'string' || !/^[a-f0-9]{24}$/.test(request.id)) throw new Error('账号标识无效');
    if (request.action === 'accounts:delete') {
      await store.remove(channelId, request.id);
      return;
    }
    if (request.action !== 'accounts:login') throw new Error('未知的账号操作');
    if (!login() || guest.login) return 'form';
    const credentials = await store.get(channelId, request.id);
    if (!credentials || !login() || guest.login) return 'form';
    return new Promise(resolve => {
      const id = randomBytes(16).toString('hex');
      const { username, password } = credentials;
      const finish = status => {
        clearTimeout(timer);
        guest.login = null;
        resolve(status);
      };
      const timer = setTimeout(() => finish('form'), 8000);
      guest.login = { id, finish, credentials: { username, password } };
      try { guest.contents.send(ipc.fill, id); } catch (_) { finish('form'); }
    });
  }
  return { handle, notify };
}

module.exports = { register };
