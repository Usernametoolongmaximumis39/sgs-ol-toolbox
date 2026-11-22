'use strict';

const { loginChannel, ipc, validCredentials } = require('./account-pages.cjs');

function connect() {
  if (window.top !== window) return;
  const channel = loginChannel(location.href);
  if (!channel) return;
  const { ipcRenderer } = require('electron');
  let pending = null;
  let expiry;
  let filling = false;
  const clear = () => { clearTimeout(expiry); pending = null; };
  function capture(fields, source) {
    if (filling) return;
    clear();
    const credentials = { username: fields.username.value, password: fields.password.value };
    if (!validCredentials(credentials)) return;
    pending = { credentials, source };
    expiry = setTimeout(clear, 5 * 60 * 1000);
  }
  function save() {
    if (!pending) return;
    const { credentials } = pending;
    clear();
    ipcRenderer.send(ipc.save, credentials);
  }
  function fields(doc, ids) {
    const [form, username, password, submit] = ids.map(id => doc.getElementById(id));
    if (!form || !username || password?.type !== 'password' || !submit ||
      username.form !== form || password.form !== form || submit.form !== form) return null;
    return { form, username, password, submit };
  }
  const visible = element => !!element?.getClientRects().length;
  const officialFields = () => fields(document, ['SGS_login-form', 'SGS_login-account', 'SGS_login-password', 'SGS_login-btn']);

  function watchOfficial() {
    document.addEventListener('click', event => {
      if (!event.isTrusted) return;
      const form = officialFields();
      if (form && event.target === form.submit) capture(form);
      else if (event.target.closest?.('#toggleThirdLogin, #sgsRegBtn, #thirdLoginPop, #sgsSmsPop')) clear();
    }, true);
    document.addEventListener('keyup', event => {
      const form = officialFields();
      if (event.isTrusted && event.key === 'Enter' && form?.form.contains(event.target)) capture(form);
    }, true);
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      const result = Reflect.apply(setItem, this, arguments);
      // The official password SDK writes this key in its successful login callback.
      if (pending && this === localStorage && key === 'SGS_LASTLOGIN_ACCOUNT1' &&
        value === pending.credentials.username) save();
      return result;
    };
  }

  const partnerOrigin = 'https://ptlogin.4399.com';
  function partnerDocument(requireVisible = true) {
    const iframe = document.getElementById('popup_login_frame');
    if (!iframe || (requireVisible && !visible(iframe))) return null;
    try {
      const doc = iframe.contentDocument;
      const url = new URL(doc.URL);
      if (url.origin === partnerOrigin && url.pathname === '/ptlogin/loginFrame.do' &&
        url.searchParams.get('appId') === 'sgs' && url.searchParams.get('gameId') === 'wd') return doc;
    } catch (_) {}
    return null;
  }
  function partnerFields(doc = partnerDocument()) {
    const form = doc && fields(doc, ['login_form', 'username', 'j-password', 'j-login-submit-btn']);
    if (!form) return null;
    const action = new URL(form.form.action);
    return action.origin === partnerOrigin && action.pathname === '/ptlogin/login.do' && form.form.method === 'post' ? form : null;
  }
  const watched = new WeakSet();
  const frames = new WeakSet();
  let sdk;
  function watchPartnerFrame() {
    const iframe = document.getElementById('popup_login_frame');
    if (iframe && !frames.has(iframe)) {
      frames.add(iframe);
      iframe.addEventListener('load', watchPartnerFrame);
    }
    const doc = partnerDocument(false);
    if (doc && !watched.has(doc)) {
      watched.add(doc);
      doc.addEventListener('submit', event => {
        const form = partnerFields(doc);
        if (event.isTrusted && form && partnerDocument() === doc && event.target === form.form) {
          capture(form, doc.defaultView);
        }
      }, true);
    }
    if (sdk === window.UniLogin || typeof window.UniLogin?.loginPostHandle !== 'function') return;
    sdk = window.UniLogin;
    const handle = sdk.loginPostHandle;
    const postLogin = sdk.defaultPostLogin;
    sdk.loginPostHandle = function (params) {
      if (pending && params?.source === '4399' && fromPasswordResponse(pending.source)) pending.accepted = true;
      return Reflect.apply(handle, this, arguments);
    };
    sdk.defaultPostLogin = function (isRegistration) {
      if (pending && !isRegistration && this.getUid?.()) {
        const account = this.getUname?.();
        let passwordLogin = false;
        try { passwordLogin = this.getUserLoginType?.() === '4399'; } catch (_) {}
        if (pending.accepted || (passwordLogin && fromPasswordResponse(pending.source) &&
          typeof account === 'string' && account.toLowerCase() === pending.credentials.username.toLowerCase())) save();
      }
      return Reflect.apply(postLogin, this, arguments);
    };
  }
  function fromPasswordResponse(source) {
    try {
      const url = new URL(source.location.href);
      return url.origin === partnerOrigin && url.pathname === '/ptlogin/login.do';
    } catch (_) { return false; }
  }
  function watchPartner() {
    new MutationObserver(watchPartnerFrame).observe(document, { childList: true, subtree: true });
    window.addEventListener('load', watchPartnerFrame, true);
    window.addEventListener('message', event => {
      // 4399 also dispatches the callback through its frame messenger.
      const message = event.data;
      if (pending && event.origin === partnerOrigin && event.source === pending.source &&
        message?.type === 'UniLogin.loginPostHandle' && message.params?.source === '4399') pending.accepted = true;
    }, true);
    document.addEventListener('click', event => {
      if (event.isTrusted && event.target.closest?.('#phoneLoginSelector, #qrLoginSelector, #regSelector, .loginout')) clear();
    }, true);
    watchPartnerFrame();
  }

  function fillField(input, value) {
    input.value = value;
    input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
  }
  async function fill(credentials) {
    clear();
    let form;
    if (channel === 1) {
      form = officialFields();
      if (['thirdLoginPop', 'sgsSmsPop', 'sgsRegPop'].some(id => visible(document.getElementById(id)))) return 'form';
    } else {
      if (window.UniLogin?.getUid?.()) return 'signed-in';
      form = partnerFields();
      if (!form && typeof window.UniLogin?.showPopupUsernameLogin === 'function') {
        // This SDK accepts a password argument in its iframe URL. Open its form with no credentials.
        window.UniLogin.showPopupUsernameLogin();
        for (let i = 0; i < 50 && !form; i++) {
          await new Promise(resolve => setTimeout(resolve, 120));
          form = partnerFields();
        }
      }
    }
    if (!form || !visible(form.form) || !visible(form.password) || loginChannel(location.href) !== channel) return 'form';
    if (channel === 3 && (partnerDocument() !== form.form.ownerDocument || window.UniLogin?.getUid?.())) return 'form';
    const account = channel === 3 ? credentials.username.trim() : credentials.username;
    fillField(form.username, account);
    fillField(form.password, credentials.password);
    filling = true;
    try {
      form.submit.click();
    } finally { filling = false; }
    const agreement = channel === 1 && document.getElementById('SGS_userProto');
    return agreement && visible(agreement.parentElement) && !agreement.checked ? 'agreement' : 'submitted';
  }

  if (channel === 1) watchOfficial(); else watchPartner();
  window.addEventListener('pagehide', clear);
  ipcRenderer.on(ipc.fill, async (_, id) => {
    if (loginChannel(location.href) !== channel) return;
    let status = 'form';
    try {
      const credentials = await ipcRenderer.invoke(ipc.take, id);
      if (validCredentials(credentials)) status = await fill(credentials);
    } catch (_) {}
    ipcRenderer.send(ipc.result, id, status);
  });
}

try { connect(); } catch (_) {}
