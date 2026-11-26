// Appended to the original official game preload. No remote script loader.
;(function () {
  try {
    if (window.top !== window.self || window.__SGS_TOOLBOX_MICRO_PRELOAD__) return;
    if (!/^https?:\/\/web\.sanguosha\.com\/220\/h5_2\/index(?:_\d+)?\.php(?:[?#]|$)/.test(window.location.href)) return;
    window.__SGS_TOOLBOX_MICRO_PRELOAD__ = true;
    const electron = require('electron');
    if (window.addEventListener) window.addEventListener('message', async event => {
      const message = event.data;
      if (event.source !== window || !message || message.type !== 'sgs-toolbox-update-request' || typeof message.id !== 'string' || message.id.length > 100 || !['check', 'install', 'rollback'].includes(message.action)) return;
      try { window.postMessage({ type: 'sgs-toolbox-update-result', id: message.id, result: await electron.ipcRenderer.invoke('sgs-toolbox:update:v1', message.action) }, window.location.origin); }
      catch (error) {
        const detail = error.message.replace(/^Error invoking remote method 'sgs-toolbox:update:v1': (?:Error: )?/, '');
        window.postMessage({ type: 'sgs-toolbox-update-result', id: message.id, error: detail }, window.location.origin);
      }
    });
    if (window.addEventListener) window.addEventListener('message', async event => {
      const m = event.data;
      if (event.source !== window || event.origin !== window.location.origin || m?.type !== 'sgs-toolbox-alipay-request' || typeof m.id !== 'string' || m.id.length > 100 || typeof m.url !== 'string' || m.url.length > 65536) return;
      try { window.postMessage({type:'sgs-toolbox-alipay-result', id:m.id, result:await electron.ipcRenderer.invoke('sgs-toolbox:alipay:v1', m.url)}, window.location.origin); }
      catch (e) { window.postMessage({type:'sgs-toolbox-alipay-result', id:m.id, error:e.message}, window.location.origin); }
    });
    if (window.addEventListener) window.addEventListener('message', async event => {
      const message = event.data;
      if (event.source !== window || event.origin !== window.location.origin || message?.type !== 'sgs-toolbox-mobile-skin-request' ||
          typeof message.id !== 'string' || !/^[a-f0-9]{32}$/.test(message.id)) return;
      if (message.cancel === true) { electron.ipcRenderer.send('sgs-toolbox:mobile-skin-cancel:v1', message.id); return; }
      if (typeof message.url !== 'string' || message.url.length > 512 || !Number.isSafeInteger(message.limit)) return;
      const range = message.range;
      if (range !== undefined && (!range || typeof range !== 'object' || Object.keys(range).length > 2 ||
          Object.values(range).some(value => !Number.isSafeInteger(value)))) return;
      try {
        const bytes = await electron.ipcRenderer.invoke('sgs-toolbox:mobile-skin:v1', { id: message.id, url: message.url, limit: message.limit, range });
        window.postMessage({ type: 'sgs-toolbox-mobile-skin-result', id: message.id, bytes }, window.location.origin, [bytes]);
      } catch (error) {
        const detail = error.message.replace(/^Error invoking remote method 'sgs-toolbox:mobile-skin:v1': (?:Error: )?/, '');
        window.postMessage({ type: 'sgs-toolbox-mobile-skin-result', id: message.id, error: detail }, window.location.origin);
      }
    });
    if (window.addEventListener) window.addEventListener('message', async event => {
      const message = event.data;
      if (event.source !== window || event.origin !== window.location.origin || message?.type !== 'sgs-toolbox-private-sync-http' ||
          typeof message.id !== 'string' || !/^[a-f0-9]{32}$/.test(message.id)) return;
      const { id, url, body, device } = message;
      if (message.cancel === true) { electron.ipcRenderer.send('sgs-toolbox:private-sync-http-cancel:v1', id); return; }
      if (typeof url !== 'string' || url.length > 512 || typeof body !== 'string' || body.length > 24 * 1024 * 1024) return;
      const send = data => window.postMessage({ type: 'sgs-toolbox-private-sync-http-result', id, ...data }, window.location.origin);
      try { send({ reply: await electron.ipcRenderer.invoke('sgs-toolbox:private-sync-http:v1', { id, url, body, device }) }); }
      catch (error) { send({ error: error.message }); }
    });
    const source = electron.ipcRenderer.sendSync('sgs-toolbox:source:v1');
    if (!source) throw new Error('工具箱微端脚本不可用，请重新运行安装包');
    const bridge = '(' + function () {
      window.__SGS_TOOLBOX_MOBILE_SKIN_REQUEST__ = ({ url, limit, range }, signal) => new Promise((resolve, reject) => {
        const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
        const finish = () => {
          window.removeEventListener('message', receive);
          signal?.removeEventListener('abort', cancel);
        };
        const cancel = () => {
          finish();
          window.postMessage({ type: 'sgs-toolbox-mobile-skin-request', id, cancel: true }, location.origin);
          reject(new Error('移动版皮肤资源下载已取消'));
        };
        const receive = event => {
          if (event.source !== window || event.origin !== location.origin || event.data?.type !== 'sgs-toolbox-mobile-skin-result' || event.data.id !== id) return;
          finish();
          if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.bytes);
        };
        if (signal?.aborted) { reject(new Error('移动版皮肤资源下载已取消')); return; }
        window.addEventListener('message', receive);
        signal?.addEventListener('abort', cancel, { once: true });
        window.postMessage({ type: 'sgs-toolbox-mobile-skin-request', id, url, limit, range }, location.origin);
      });
      window.__SGS_TOOLBOX_ALIPAY_REQUEST__ = options => {
        const id = Date.now() + ':' + Math.random(); let done = false;
        const finish = () => { done = true; clearTimeout(timer); window.removeEventListener('message', receive); };
        const receive = event => {
          if (done || event.source !== window || event.origin !== location.origin || event.data?.type !== 'sgs-toolbox-alipay-result' || event.data.id !== id) return;
          finish(); if (event.data.error) options.onerror({ message: String(event.data.error).replace(/^Error invoking remote method [^:]+: (?:Error: )?/, '') }); else options.onload(event.data.result);
        };
        const timer = setTimeout(() => { finish(); options.ontimeout(); }, 15000);
        window.addEventListener('message', receive);
        window.postMessage({type:'sgs-toolbox-alipay-request', id, url:options.url}, location.origin);
        return {abort() { if (!done) { finish(); options.onabort(); } }};
      };
      window.__SGS_TOOLBOX_SCRIPT_UPDATE__ = action => new Promise((resolve, reject) => {
        const id = Date.now() + ':' + Math.random();
        const finish = event => {
          if (event.source !== window || event.data?.type !== 'sgs-toolbox-update-result' || event.data.id !== id) return;
          clearTimeout(timer); window.removeEventListener('message', finish);
          if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.result);
        };
        const timer = setTimeout(() => { window.removeEventListener('message', finish); reject(new Error('脚本更新响应超时，请重试检查更新状态')); }, 100000);
        window.addEventListener('message', finish);
        window.postMessage({ type: 'sgs-toolbox-update-request', id, action }, window.location.origin);
      });
    }.toString() + ')();\n';
    electron.webFrame.executeJavaScript(bridge + source + '\nvoid 0;').catch(error => console.error('[工具箱微端]', error));
  } catch (error) { console.error('[工具箱微端]', error); }
})();

"use strict";
(() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __commonJS = (cb, mod) => function __require2() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // microclient/account-pages.cjs
  var require_account_pages = __commonJS({
    "microclient/account-pages.cjs"(exports, module) {
      "use strict";
      var pages = {
        1: "https://web.sanguosha.com/login/air/client/h5/index",
        3: "https://my.4399.com/yxsgs/wd-home"
      };
      var ipc = {
        save: "sgs-toolbox:accounts-save:v1",
        fill: "sgs-toolbox:accounts-fill:v1",
        take: "sgs-toolbox:accounts-take:v1",
        result: "sgs-toolbox:accounts-result:v1"
      };
      function loginChannel(value) {
        try {
          const url = new URL(value);
          return Object.keys(pages).map(Number).find((id) => pages[id] === url.origin + url.pathname) || 0;
        } catch (_) {
          return 0;
        }
      }
      function validCredentials(value) {
        return value && typeof value.username === "string" && value.username.length <= 128 && !!value.username.trim() && !/[\u0000-\u001f\u007f]/.test(value.username) && typeof value.password === "string" && value.password.length > 0 && value.password.length <= 256;
      }
      module.exports = { ipc, loginChannel, validCredentials };
    }
  });

  // microclient/accounts-guest.cjs
  var require_accounts_guest = __commonJS({
    "microclient/accounts-guest.cjs"() {
      var { loginChannel, ipc, validCredentials } = require_account_pages();
      function connect() {
        if (window.top !== window) return;
        const channel = loginChannel(location.href);
        if (!channel) return;
        const { ipcRenderer } = __require("electron");
        let pending = null;
        let expiry;
        let filling = false;
        const clear = () => {
          clearTimeout(expiry);
          pending = null;
        };
        function capture(fields2, source) {
          if (filling) return;
          clear();
          const credentials = { username: fields2.username.value, password: fields2.password.value };
          if (!validCredentials(credentials)) return;
          pending = { credentials, source };
          expiry = setTimeout(clear, 5 * 60 * 1e3);
        }
        function save() {
          if (!pending) return;
          const { credentials } = pending;
          clear();
          ipcRenderer.send(ipc.save, credentials);
        }
        function fields(doc, ids) {
          const [form, username, password, submit] = ids.map((id) => doc.getElementById(id));
          if (!form || !username || (password == null ? void 0 : password.type) !== "password" || !submit || username.form !== form || password.form !== form || submit.form !== form) return null;
          return { form, username, password, submit };
        }
        const visible = (element) => !!(element == null ? void 0 : element.getClientRects().length);
        const officialFields = () => fields(document, ["SGS_login-form", "SGS_login-account", "SGS_login-password", "SGS_login-btn"]);
        function watchOfficial() {
          document.addEventListener("click", (event) => {
            var _a, _b;
            if (!event.isTrusted) return;
            const form = officialFields();
            if (form && event.target === form.submit) capture(form);
            else if ((_b = (_a = event.target).closest) == null ? void 0 : _b.call(_a, "#toggleThirdLogin, #sgsRegBtn, #thirdLoginPop, #sgsSmsPop")) clear();
          }, true);
          document.addEventListener("keyup", (event) => {
            const form = officialFields();
            if (event.isTrusted && event.key === "Enter" && (form == null ? void 0 : form.form.contains(event.target))) capture(form);
          }, true);
          const setItem = Storage.prototype.setItem;
          Storage.prototype.setItem = function(key, value) {
            const result = Reflect.apply(setItem, this, arguments);
            if (pending && this === localStorage && key === "SGS_LASTLOGIN_ACCOUNT1" && value === pending.credentials.username) save();
            return result;
          };
        }
        const partnerOrigin = "https://ptlogin.4399.com";
        function partnerDocument(requireVisible = true) {
          const iframe = document.getElementById("popup_login_frame");
          if (!iframe || requireVisible && !visible(iframe)) return null;
          try {
            const doc = iframe.contentDocument;
            const url = new URL(doc.URL);
            if (url.origin === partnerOrigin && url.pathname === "/ptlogin/loginFrame.do" && url.searchParams.get("appId") === "sgs" && url.searchParams.get("gameId") === "wd") return doc;
          } catch (_) {
          }
          return null;
        }
        function partnerFields(doc = partnerDocument()) {
          const form = doc && fields(doc, ["login_form", "username", "j-password", "j-login-submit-btn"]);
          if (!form) return null;
          const action = new URL(form.form.action);
          return action.origin === partnerOrigin && action.pathname === "/ptlogin/login.do" && form.form.method === "post" ? form : null;
        }
        const watched = /* @__PURE__ */ new WeakSet();
        const frames = /* @__PURE__ */ new WeakSet();
        let sdk;
        function watchPartnerFrame() {
          var _a;
          const iframe = document.getElementById("popup_login_frame");
          if (iframe && !frames.has(iframe)) {
            frames.add(iframe);
            iframe.addEventListener("load", watchPartnerFrame);
          }
          const doc = partnerDocument(false);
          if (doc && !watched.has(doc)) {
            watched.add(doc);
            doc.addEventListener("submit", (event) => {
              const form = partnerFields(doc);
              if (event.isTrusted && form && partnerDocument() === doc && event.target === form.form) {
                capture(form, doc.defaultView);
              }
            }, true);
          }
          if (sdk === window.UniLogin || typeof ((_a = window.UniLogin) == null ? void 0 : _a.loginPostHandle) !== "function") return;
          sdk = window.UniLogin;
          const handle = sdk.loginPostHandle;
          const postLogin = sdk.defaultPostLogin;
          sdk.loginPostHandle = function(params) {
            if (pending && (params == null ? void 0 : params.source) === "4399" && fromPasswordResponse(pending.source)) pending.accepted = true;
            return Reflect.apply(handle, this, arguments);
          };
          sdk.defaultPostLogin = function(isRegistration) {
            var _a2, _b, _c;
            if (pending && !isRegistration && ((_a2 = this.getUid) == null ? void 0 : _a2.call(this))) {
              const account = (_b = this.getUname) == null ? void 0 : _b.call(this);
              let passwordLogin = false;
              try {
                passwordLogin = ((_c = this.getUserLoginType) == null ? void 0 : _c.call(this)) === "4399";
              } catch (_) {
              }
              if (pending.accepted || passwordLogin && fromPasswordResponse(pending.source) && typeof account === "string" && account.toLowerCase() === pending.credentials.username.toLowerCase()) save();
            }
            return Reflect.apply(postLogin, this, arguments);
          };
        }
        function fromPasswordResponse(source) {
          try {
            const url = new URL(source.location.href);
            return url.origin === partnerOrigin && url.pathname === "/ptlogin/login.do";
          } catch (_) {
            return false;
          }
        }
        function watchPartner() {
          new MutationObserver(watchPartnerFrame).observe(document, { childList: true, subtree: true });
          window.addEventListener("load", watchPartnerFrame, true);
          window.addEventListener("message", (event) => {
            var _a;
            const message = event.data;
            if (pending && event.origin === partnerOrigin && event.source === pending.source && (message == null ? void 0 : message.type) === "UniLogin.loginPostHandle" && ((_a = message.params) == null ? void 0 : _a.source) === "4399") pending.accepted = true;
          }, true);
          document.addEventListener("click", (event) => {
            var _a, _b;
            if (event.isTrusted && ((_b = (_a = event.target).closest) == null ? void 0 : _b.call(_a, "#phoneLoginSelector, #qrLoginSelector, #regSelector, .loginout"))) clear();
          }, true);
          watchPartnerFrame();
        }
        function fillField(input, value) {
          input.value = value;
          input.dispatchEvent(new input.ownerDocument.defaultView.Event("input", { bubbles: true }));
        }
        async function fill(credentials) {
          var _a, _b, _c, _d, _e;
          clear();
          let form;
          if (channel === 1) {
            form = officialFields();
            if (["thirdLoginPop", "sgsSmsPop", "sgsRegPop"].some((id) => visible(document.getElementById(id)))) return "form";
          } else {
            if ((_b = (_a = window.UniLogin) == null ? void 0 : _a.getUid) == null ? void 0 : _b.call(_a)) return "signed-in";
            form = partnerFields();
            if (!form && typeof ((_c = window.UniLogin) == null ? void 0 : _c.showPopupUsernameLogin) === "function") {
              window.UniLogin.showPopupUsernameLogin();
              for (let i = 0; i < 50 && !form; i++) {
                await new Promise((resolve) => setTimeout(resolve, 120));
                form = partnerFields();
              }
            }
          }
          if (!form || !visible(form.form) || !visible(form.password) || loginChannel(location.href) !== channel) return "form";
          if (channel === 3 && (partnerDocument() !== form.form.ownerDocument || ((_e = (_d = window.UniLogin) == null ? void 0 : _d.getUid) == null ? void 0 : _e.call(_d)))) return "form";
          const account = channel === 3 ? credentials.username.trim() : credentials.username;
          fillField(form.username, account);
          fillField(form.password, credentials.password);
          filling = true;
          try {
            form.submit.click();
          } finally {
            filling = false;
          }
          const agreement = channel === 1 && document.getElementById("SGS_userProto");
          return agreement && visible(agreement.parentElement) && !agreement.checked ? "agreement" : "submitted";
        }
        if (channel === 1) watchOfficial();
        else watchPartner();
        window.addEventListener("pagehide", clear);
        ipcRenderer.on(ipc.fill, async (_, id) => {
          if (loginChannel(location.href) !== channel) return;
          let status = "form";
          try {
            const credentials = await ipcRenderer.invoke(ipc.take, id);
            if (validCredentials(credentials)) status = await fill(credentials);
          } catch (_2) {
          }
          ipcRenderer.send(ipc.result, id, status);
        });
      }
      try {
        connect();
      } catch (_) {
      }
    }
  });
  require_accounts_guest();
})();
