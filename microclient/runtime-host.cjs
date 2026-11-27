'use strict';
// Microclient runtime 1.0.3
var MobileSkinSecurity = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <stdin>
  var stdin_exports = {};
  __export(stdin_exports, {
    PRIVATE_HTTP_LIMIT: () => PRIVATE_HTTP_LIMIT,
    PRIVATE_HTTP_TIMEOUT: () => PRIVATE_HTTP_TIMEOUT,
    mobileSkinPartialLength: () => mobileSkinPartialLength,
    privateHttpRequest: () => privateHttpRequest,
    toolboxDownloadRequest: () => toolboxDownloadRequest
  });

  // src/core/distribution.js
  var GITHUB_UPDATE_URL = "https://raw.githubusercontent.com/Usernametoolongmaximumis39/sgs-ol-toolbox/main";
  var DOWNLOAD_UPDATE_URL = "https://dl.3gs.xyz";
  var GITHUB_MARKET_URL = GITHUB_UPDATE_URL + "/plugins";
  var DOWNLOAD_MARKET_URL = DOWNLOAD_UPDATE_URL + "/plugins";

  // src/shared/stargazing-source.js
  var STARGAZING_SITE = "https://gx.95chong.cn/";
  var STARGAZING_REPORT = STARGAZING_SITE + "api/report";
  var STARGAZING_SYNC_PATH = "/v1/stargazing/report";
  var STARGAZING_REPORT_LIMIT = 1024 * 1024;

  // src/core/mobile-skin-download.js
  var MiB = 1024 * 1024;
  var cloudRoot = "https://mres.sanguosha.cn";
  var cloudPrefix = "/update_cloud/public/";
  var pictures = /^ui\/(?:face|sface|bface|icon)\/(?:skin|char)(?:\/(?:horSkin|horChar))?\/[a-f0-9]{32}\.(?:png|jpe?g)$/i;
  var sounds = /^audio\/(?:skill|dead|effect|victory)\/[a-f0-9]{32}\.mp3$/i;
  var motion = /^ui\/face\/skin\/dynamicSkin\/[a-f0-9]{32}\.zip$/i;
  var configZips = /^\/\/config\/clients_[1-9]\d?\.\d{1,2}\.\d{1,2}_formal_\d{12}_[a-z0-9]{4,16}\/config(_list|[1-9]\d{0,2})\.zip$/;
  var pcDownload = /^\/pcgame\/81002\/[1-9]\d?\.\d{1,2}\.\d{1,2}\/(gameInfo\.json|game_\d{8,16}_\d{6,12}\.zip)$/;
  var configParams = {
    subv: "0",
    l: "0",
    ct: "windows",
    dm: "PC",
    sv: "Windows",
    vc: "1",
    pkg: "com.bf.sgs.hdexp",
    area: "0",
    is_gzip: "0",
    HWthirdAc: "0",
    astc: "0",
    config_list_inc: "1",
    is_xxtea: "1"
  };
  var installerArchiveLimit = 4294967295;
  var installerRangeLimit = 24 * MiB;
  var installerSuffixLimit = 65557;
  function validConfigQuery(params) {
    var _a, _b, _c;
    const keys = Array.from(params.keys());
    const selectors = ["c", "v", "key_v"];
    if (new Set(keys).size !== keys.length || keys.length !== Object.keys(configParams).length + selectors.length || Object.entries(configParams).some(([name, value]) => params.get(name) !== value)) return false;
    return /^(?:[A-Za-z0-9+/]{16}|[A-Za-z0-9+/]{22}==)$/.test((_a = params.get("c")) != null ? _a : "") && /^(?:[A-Za-z0-9+/]{22}==|[A-Za-z0-9+/]{27}=|[A-Za-z0-9+/]{32})$/.test((_b = params.get("v")) != null ? _b : "") && /^\d{11}$/.test((_c = params.get("key_v")) != null ? _c : "");
  }
  function installerRange(range, limit) {
    if (range && typeof range === "object") {
      const { suffix, start, end } = range, fields = Object.keys(range);
      if (fields.length === 1 && fields[0] === "suffix" && Number.isSafeInteger(suffix) && suffix >= 1 && suffix <= Math.min(limit, installerSuffixLimit)) {
        return { range: { suffix }, headers: { Range: `bytes=-${suffix}` }, limit: suffix };
      }
      if (fields.length === 2 && fields.includes("start") && fields.includes("end") && Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start && end < installerArchiveLimit && end - start + 1 <= limit) {
        return { range: { start, end }, headers: { Range: `bytes=${start}-${end}` }, limit: end - start + 1 };
      }
    }
    throw new Error("\u79FB\u52A8\u7248\u5B89\u88C5\u5305\u4EC5\u5141\u8BB8\u8BFB\u53D6\u6307\u5B9A\u7684\u6709\u9650\u533A\u95F4");
  }
  function mobileSkinRequest(value, requestedLimit, range) {
    var _a;
    let url;
    try {
      if (typeof value === "string" && value.length <= 512) url = new URL(value);
    } catch {
    }
    if (!url || url.username || url.password || value.includes("#")) throw new Error("\u79FB\u52A8\u7248\u76AE\u80A4\u8D44\u6E90\u5730\u5740\u65E0\u6548");
    const versionHost = url.origin === "https://waym.sanguosha.cn";
    const configMetadata = versionHost && url.pathname === "/config/";
    if (configMetadata ? !validConfigQuery(url.searchParams) : url.search) throw new Error("\u79FB\u52A8\u7248\u76AE\u80A4\u8D44\u6E90\u5730\u5740\u65E0\u6548");
    let max, installer = false;
    if (configMetadata) max = 128 * 1024;
    else if (versionHost && url.pathname === "/update/cloud.php") max = 16 * 1024;
    if (url.origin === cloudRoot && url.pathname.startsWith(cloudPrefix)) {
      const asset = url.pathname.slice(cloudPrefix.length);
      if (/^cloud_[1-9]\d{4,11}\.zip$/.test(asset)) max = 16 * MiB;
      else if (motion.test(asset)) max = 64 * MiB;
      else if (pictures.test(asset)) max = 12 * MiB;
      else if (sounds.test(asset)) max = 4 * MiB;
    } else if (url.origin === cloudRoot) {
      const config = configZips.exec(url.pathname);
      if (config) max = config[1] === "_list" ? 256 * 1024 : 4 * MiB;
    } else if (url.origin === "https://download.sanguosha.cn") {
      const file = (_a = pcDownload.exec(url.pathname)) == null ? void 0 : _a[1];
      if (file) {
        installer = file !== "gameInfo.json";
        max = installer ? installerRangeLimit : 16 * 1024;
      }
    }
    if (!max) throw new Error("\u79FB\u52A8\u7248\u76AE\u80A4\u8D44\u6E90\u5730\u5740\u4E0D\u5728\u6E38\u5361\u5141\u8BB8\u8303\u56F4\u5185");
    if (requestedLimit !== void 0 && (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1)) {
      throw new Error("\u79FB\u52A8\u7248\u76AE\u80A4\u8D44\u6E90\u4E0B\u8F7D\u4E0A\u9650\u65E0\u6548");
    }
    if (!installer && range !== void 0) throw new Error("\u79FB\u52A8\u7248\u76AE\u80A4\u8D44\u6E90\u7C7B\u578B\u4E0D\u652F\u6301\u5206\u6BB5\u8BFB\u53D6");
    const limit = Math.min(requestedLimit != null ? requestedLimit : max, max);
    return {
      url: url.href,
      limit,
      timeout: max >= 16 * MiB ? 9e4 : 25e3,
      ...installer ? installerRange(range, limit) : {}
    };
  }
  var stargazingRequest = Object.freeze({ url: STARGAZING_REPORT, limit: MiB, timeout: 25e3, label: "\u89C2\u661F\u6570\u636E" });
  function toolboxDownloadRequest(url, limit, range) {
    if (url === STARGAZING_REPORT) {
      if (range !== void 0 || limit !== void 0 && limit !== stargazingRequest.limit) {
        throw new Error("\u89C2\u661F\u6570\u636E\u53EA\u652F\u6301\u8BFB\u53D6\u5B8C\u6574\u62A5\u544A");
      }
      return stargazingRequest;
    }
    return mobileSkinRequest(url, limit, range);
  }
  function mobileSkinPartialLength(request, status, contentRange, contentLength, contentEncoding) {
    var _a;
    if (status !== 206) throw new Error(`\u79FB\u52A8\u7248\u5B89\u88C5\u5305\u672A\u8FD4\u56DE\u6307\u5B9A\u5206\u6BB5\uFF08HTTP ${status}\uFF09`);
    const fields = /^bytes (0|[1-9]\d{0,9})-(0|[1-9]\d{0,9})\/([1-9]\d{0,9})$/i.exec(contentRange != null ? contentRange : "");
    const [start, end, total] = ((_a = fields == null ? void 0 : fields.slice(1)) != null ? _a : []).map(Number);
    const { range, limit } = request;
    const length = end - start + 1;
    if (!fields || end >= total || total > installerArchiveLimit || length < 1 || length > limit || (range.suffix === void 0 ? start !== range.start || end !== range.end : end !== total - 1 || length !== Math.min(total, range.suffix)) || contentLength != null && (!/^\d+$/.test(contentLength) || Number(contentLength) !== length) || contentEncoding != null && !/^identity$/i.test(contentEncoding)) {
      throw new Error("\u79FB\u52A8\u7248\u5B89\u88C5\u5305\u5206\u6BB5\u54CD\u5E94\u8303\u56F4\u6216\u957F\u5EA6\u65E0\u6548");
    }
    return length;
  }

  // src/shared/sync-paths.js
  var MATCH_SYNC_PATH = "/appearances/sync";
  var LEDGER_SYNC_PATH = "/ledger/sync";
  var PREFERENCES_SYNC_PATH = "/v1/preferences/sync";
  var BACKUP_READ_PATH = "/v1/backup/read";
  var BACKUP_COOLDOWN = 60 * 6e4;

  // src/shared/private-sync-http.js
  var SYNC_SOURCE_HEADER = "X-SGS-Toolbox-Origin";
  var PRIVATE_HTTP_TIMEOUT = 3e4;
  var PRIVATE_HTTP_LIMIT = 24 * 1024 * 1024;
  var privatePaths = /* @__PURE__ */ new Set([
    "/v1/proof",
    "/v1/confirm",
    "/v1/bind",
    "/v1/recover",
    "/v1/unbind",
    "/v1/private/request",
    "/v1/private/join",
    "/v1/private/release",
    "/v1/private/view",
    "/v1/private/bind-credential",
    PREFERENCES_SYNC_PATH,
    LEDGER_SYNC_PATH,
    MATCH_SYNC_PATH,
    BACKUP_READ_PATH,
    STARGAZING_SYNC_PATH
  ]);
  function privateHttpRequest({ url, body, device }, source) {
    if (typeof url !== "string" || url.length > 512 || typeof body !== "string" || body.length > PRIVATE_HTTP_LIMIT || !/^https?:\/\/(?:web\.sanguosha\.com|127\.0\.0\.1:17321)$/.test(source) || device !== void 0 && (typeof device !== "string" || !/^[a-zA-Z0-9_-]{43}$/.test(device))) throw new Error("\u79C1\u6709\u540C\u6B65\u8BF7\u6C42\u683C\u5F0F\u65E0\u6548");
    const address = new URL(url);
    if (address.protocol !== "http:" || !privatePaths.has(address.pathname) || url !== address.origin + address.pathname)
      throw new Error("\u79C1\u6709\u540C\u6B65\u5730\u5740\u65E0\u6548");
    return { url, body, headers: {
      "Content-Type": "application/json",
      [SYNC_SOURCE_HEADER]: source,
      ...device && { Authorization: "Bearer " + device }
    } };
  }
  return __toCommonJS(stdin_exports);
})();

"use strict";
var MicroclientAccounts = (() => {
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

  // microclient/accounts-store.cjs
  var require_accounts_store = __commonJS({
    "microclient/accounts-store.cjs"(exports, module) {
      "use strict";
      var fs = __require("fs").promises;
      var path = __require("path");
      var { spawn } = __require("child_process");
      var { randomBytes } = __require("crypto");
      var { validCredentials } = require_account_pages();
      function protect(channel, operation, input) {
        const exe = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
        const script = [
          "$ErrorActionPreference = 'Stop'",
          "Add-Type -AssemblyName System.Security",
          "$bytes = [Convert]::FromBase64String([Console]::In.ReadToEnd())",
          `$entropy = [Text.Encoding]::ASCII.GetBytes('SGS Toolbox Microclient Accounts v1/${channel}')`,
          `$output = [Security.Cryptography.ProtectedData]::${operation}($bytes, $entropy, 'CurrentUser')`,
          "[Console]::Out.Write([Convert]::ToBase64String($output))"
        ].join("; ");
        return new Promise((resolve, reject) => {
          const error = () => new Error("Windows \u8D26\u53F7\u52A0\u5BC6\u5B58\u50A8\u4E0D\u53EF\u7528");
          const child = spawn(exe, ["-NoProfile", "-NonInteractive", "-Command", script], {
            windowsHide: true,
            stdio: ["pipe", "pipe", "ignore"]
          });
          let output = "";
          const timer = setTimeout(() => {
            child.kill();
            reject(error());
          }, 1e4);
          child.stdout.setEncoding("ascii");
          child.stdout.on("data", (chunk) => {
            output += chunk;
          });
          child.stdin.on("error", () => {
          });
          child.on("error", () => {
            clearTimeout(timer);
            reject(error());
          });
          child.on("close", (code) => {
            clearTimeout(timer);
            if (code === 0 && /^[\w+/]+={0,2}$/.test(output)) resolve(Buffer.from(output, "base64"));
            else reject(error());
          });
          child.stdin.end(input.toString("base64"), "ascii");
        });
      }
      function createStore(getDirectory) {
        const queues = /* @__PURE__ */ new Map();
        const cache = /* @__PURE__ */ new Map();
        const location = (channel) => path.join(getDirectory(), `sgs-toolbox-accounts-${channel}.dpapi`);
        async function read(channel) {
          if (cache.has(channel)) return cache.get(channel);
          const encrypted = await fs.readFile(location(channel)).catch((error) => {
            if (error.code !== "ENOENT") throw error;
            return null;
          });
          let entries = [];
          if (encrypted) {
            if (encrypted.length > 1024 * 1024) throw new Error("\u8D26\u53F7\u5B58\u50A8\u6587\u4EF6\u5F02\u5E38");
            const plain = await protect(channel, "Unprotect", encrypted);
            try {
              const value = JSON.parse(plain.toString("utf8"));
              if (value.version !== 1 || !Array.isArray(value.entries) || !value.entries.every((entry) => validCredentials(entry) && typeof entry.id === "string" && /^[a-f0-9]{24}$/.test(entry.id))) {
                throw new Error("\u8D26\u53F7\u5B58\u50A8\u6587\u4EF6\u5F02\u5E38");
              }
              entries = value.entries;
            } finally {
              plain.fill(0);
            }
          }
          cache.set(channel, entries);
          return entries;
        }
        async function write(channel, entries) {
          const file = location(channel);
          const temp = file + "." + randomBytes(8).toString("hex") + ".tmp";
          const plain = Buffer.from(JSON.stringify({ version: 1, entries }));
          try {
            const encrypted = await protect(channel, "Protect", plain);
            await fs.mkdir(path.dirname(file), { recursive: true });
            await fs.writeFile(temp, encrypted, { mode: 384, flag: "wx" });
            await fs.rename(temp, file);
            cache.set(channel, entries);
          } finally {
            plain.fill(0);
            await fs.unlink(temp).catch(() => {
            });
          }
        }
        function enqueue(channel, action) {
          if (channel !== 1 && channel !== 3) throw new Error("\u5F53\u524D\u6E20\u9053\u4E0D\u652F\u6301\u8D26\u53F7\u7BA1\u7406");
          const work = (queues.get(channel) || Promise.resolve()).then(async () => action(await read(channel)));
          queues.set(channel, work.catch(() => {
          }));
          return work;
        }
        return {
          list: (channel) => enqueue(channel, (entries) => entries.map(({ id, username }) => ({ id, username }))),
          get: (channel, id) => enqueue(channel, (entries) => entries.find((entry) => entry.id === id)),
          remove: (channel, id) => enqueue(channel, async (entries) => {
            const remaining = entries.filter((entry) => entry.id !== id);
            if (remaining.length !== entries.length) await write(channel, remaining);
          }),
          save: (channel, credentials) => enqueue(channel, async (entries) => {
            const { username, password } = credentials;
            const previous = entries.find((entry) => entry.username.toLowerCase() === username.toLowerCase());
            if (previous && previous.password === password) return null;
            const id = previous ? previous.id : randomBytes(12).toString("hex");
            await write(channel, [{ id, username, password }, ...entries.filter((entry) => entry.id !== id)]);
            return { id, updated: !!previous };
          })
        };
      }
      module.exports = { createStore };
    }
  });

  // microclient/accounts-shell.cjs
  var require_accounts_shell = __commonJS({
    "microclient/accounts-shell.cjs"(exports, module) {
      "use strict";
      function mountAccounts() {
        const channel = document.getElementById("sgs-toolbox-channel");
        const channelMenu = document.getElementById("sgs-toolbox-channel-menu");
        const request = window.__SGS_TOOLBOX_CHANNEL__;
        if (!channel || typeof request !== "function" || document.getElementById("sgs-toolbox-accounts")) return;
        const style = document.createElement("style");
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
        const footer = document.createElement("div");
        footer.id = "sgs-toolbox-footer";
        const group = document.createElement("div");
        group.id = "sgs-toolbox-accounts";
        group.setAttribute("aria-label", "\u5DF2\u4FDD\u5B58\u7684\u8D26\u53F7");
        group.hidden = true;
        group.innerHTML = `
    <div id="sgs-toolbox-account-shortcuts"></div>
    <button type="button" aria-expanded="false" aria-controls="sgs-toolbox-account-panel" title="\u7BA1\u7406\u5DF2\u4FDD\u5B58\u7684\u8D26\u53F7"></button>
    <section id="sgs-toolbox-account-panel" aria-labelledby="sgs-toolbox-account-heading" hidden>
      <div class="account-heading"><span id="sgs-toolbox-account-heading"></span><span data-account-count></span></div>
      <div id="sgs-toolbox-account-rows"></div>
    </section>
    <div id="sgs-toolbox-account-toast" hidden><span role="status"></span><button type="button">\u5220\u9664</button></div>
  `;
        channel.before(footer);
        footer.append(group, channel);
        const [shortcuts, toggle, panel, toast] = group.children;
        const rows = panel.querySelector("#sgs-toolbox-account-rows");
        const [message, undo] = toast.children;
        const narrow = matchMedia("(max-width: 790px)");
        const icon = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
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
          toggle.setAttribute("aria-expanded", "false");
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
          toastTimer = setTimeout(() => {
            if (!toast.contains(document.activeElement)) hideToast();
          }, id ? 9e3 : 4800);
        }
        function loginButton(entry) {
          const button = document.createElement("button");
          button.type = "button";
          button.disabled = !state.login || busy;
          button.title = state.login ? "\u767B\u5F55 " + entry.username : "\u8BF7\u8FD4\u56DE\u767B\u5F55\u9875\u540E\u767B\u5F55 " + entry.username;
          button.setAttribute("aria-label", button.title);
          const label = document.createElement("span");
          label.className = "account-label";
          label.textContent = entry.username;
          button.append(label);
          button.addEventListener("click", () => login(entry.id));
          return button;
        }
        function render() {
          const { accounts, channelId, restartRequired } = state;
          const folded = accounts.length > 5 || narrow.matches;
          const open = !panel.hidden;
          group.hidden = false;
          shortcuts.hidden = folded;
          const toggleText = accounts.length && folded ? "\u8D26\u53F7 " + accounts.length : accounts.length ? "" : "\u8D26\u53F7";
          toggle.innerHTML = accountIcon + (toggleText ? `<span>${toggleText}</span>` : "") + (folded && accounts.length > 0 ? expandIcon : "");
          toggle.setAttribute("aria-label", "\u7BA1\u7406\u5DF2\u4FDD\u5B58\u7684\u8D26\u53F7\uFF0C\u5171 " + accounts.length + " \u4E2A");
          panel.querySelector("#sgs-toolbox-account-heading").textContent = (channelId === 3 ? "4399" : channelId === 1 ? "\u5B98\u670D" : "") + "\u8D26\u53F7";
          panel.querySelector("[data-account-count]").textContent = accounts.length + " \u4E2A";
          shortcuts.textContent = "";
          rows.textContent = "";
          for (const entry of accounts) {
            if (!folded) shortcuts.append(loginButton(entry));
            const row = document.createElement("div");
            row.className = "account-row";
            const remove = document.createElement("button");
            remove.type = "button";
            remove.title = "\u5220\u9664 " + entry.username;
            remove.setAttribute("aria-label", remove.title);
            remove.className = "account-delete";
            remove.innerHTML = deleteIcon;
            remove.disabled = busy;
            remove.addEventListener("click", () => drop(entry.id));
            row.append(loginButton(entry), remove);
            rows.append(row);
          }
          if (!accounts.length) {
            const empty = document.createElement("div");
            empty.className = "account-empty";
            empty.textContent = unavailable ? "\u8D26\u53F7\u5B58\u50A8\u6682\u4E0D\u53EF\u7528" : restartRequired ? "\u91CD\u542F\u5FAE\u7AEF\u540E\u663E\u793A\u6B64\u6E20\u9053\u7684\u8D26\u53F7" : "\u6210\u529F\u767B\u5F55\u540E\u4F1A\u4FDD\u5B58\u8D26\u53F7";
            rows.append(empty);
          }
          if (open && document.activeElement === document.body) toggle.focus();
        }
        async function refresh() {
          const current = ++revision;
          try {
            const next = await request({ action: "accounts:list" });
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
            await request({ action: "accounts:delete", id });
            await refresh();
            showToast("\u5DF2\u5220\u9664\u4FDD\u5B58\u7684\u8D26\u53F7");
          } catch (_) {
            showToast("\u5220\u9664\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
          } finally {
            busy = false;
            render();
          }
        }
        async function login(id) {
          if (busy) return;
          busy = true;
          close(panel.contains(document.activeElement) || shortcuts.contains(document.activeElement));
          render();
          try {
            const status = await request({ action: "accounts:login", id });
            const notice = { agreement: "\u8BF7\u5728\u767B\u5F55\u9875\u9605\u8BFB\u5E76\u52FE\u9009\u534F\u8BAE\u540E\u7EE7\u7EED", "signed-in": "\u8BF7\u5148\u9000\u51FA\u5F53\u524D\u8D26\u53F7\u518D\u5207\u6362", form: "\u8BF7\u5728\u8D26\u53F7\u5BC6\u7801\u767B\u5F55\u9875\u91CD\u8BD5" };
            if (notice[status]) showToast(notice[status]);
            else hideToast();
          } catch (_) {
            showToast("\u6682\u65F6\u65E0\u6CD5\u4F7F\u7528\u4FDD\u5B58\u7684\u8D26\u53F7\uFF0C\u8BF7\u91CD\u8BD5");
          } finally {
            busy = false;
            render();
          }
        }
        toggle.addEventListener("click", () => {
          if (!panel.hidden) {
            close();
            return;
          }
          if (channelMenu && !channelMenu.hidden) channel.click();
          hideToast();
          panel.hidden = false;
          toggle.setAttribute("aria-expanded", "true");
          void refresh();
        });
        undo.addEventListener("click", () => drop(undoId));
        channel.addEventListener("click", () => {
          close();
          hideToast();
        }, true);
        document.addEventListener("click", (event) => {
          if (!group.contains(event.target)) close();
        }, true);
        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape" && !panel.hidden) close(true);
        });
        narrow.addListener(render);
        window.addEventListener("sgs-toolbox-accounts-state", (event) => {
          void refresh();
          const notice = event.detail;
          if ((notice == null ? void 0 : notice.type) === "saved") showToast(notice.updated ? "\u5BC6\u7801\u5DF2\u66F4\u65B0" : "\u5BC6\u7801\u5DF2\u4FDD\u5B58", notice.id);
          if ((notice == null ? void 0 : notice.type) === "error") showToast("\u5BC6\u7801\u4FDD\u5B58\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5");
        });
        void refresh();
      }
      module.exports = { mountAccounts };
    }
  });

  // microclient/accounts-host.cjs
  var require_accounts_host = __commonJS({
    "microclient/accounts-host.cjs"(exports, module) {
      var path = __require("path");
      var { fileURLToPath } = __require("url");
      var { randomBytes } = __require("crypto");
      var { createStore } = require_accounts_store();
      var { loginChannel, ipc, validCredentials } = require_account_pages();
      var { mountAccounts } = require_accounts_shell();
      function register({ app, ipcMain, channelState, shellFile }) {
        const shells = /* @__PURE__ */ new WeakMap();
        const guests = /* @__PURE__ */ new WeakMap();
        const store = createStore(() => app.getPath("userData"));
        const channel = () => channelState().running;
        function isShell(value) {
          try {
            return path.resolve(fileURLToPath(value)).toLowerCase() === shellFile.toLowerCase();
          } catch (_) {
            return false;
          }
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
            shell.executeJavaScript(script).catch(() => {
            });
          }
        }
        function attach(shell, state, contents) {
          if (!isShell(shell.getURL()) || state.guest) return;
          const guest = { contents, shell, frame: null, login: null, closed: false };
          state.guest = guest;
          guests.set(contents, guest);
          contents.on("did-start-navigation", (_, _url, inPlace, main, process2, id) => {
            if (!main || inPlace) return;
            guest.frame = { process: process2, id };
          });
          contents.on("did-frame-navigate", (_, _url, _code, _text, main, process2, id) => {
            if (!main) return;
            guest.frame = { process: process2, id };
            notify(shell);
          });
          contents.once("destroyed", () => {
            guest.closed = true;
            if (guest.login) guest.login.finish("form");
            state.guest = null;
            notify(shell);
          });
          notify(shell);
        }
        app.on("web-contents-created", (_, contents) => {
          if (contents.getType() !== "window") return;
          const state = { guest: null, frame: null };
          shells.set(contents, state);
          contents.on("did-frame-navigate", (_2, _url, _code, _text, main, process2, id) => {
            if (main) state.frame = { process: process2, id };
          });
          contents.on("did-finish-load", () => {
            if (isShell(contents.getURL())) contents.executeJavaScript(`(${mountAccounts.toString()})();`).catch(() => {
            });
          });
          contents.on("did-attach-webview", (_2, guest) => attach(contents, state, guest));
        });
        ipcMain.on(ipc.save, (event, value) => {
          const guest = guests.get(event.sender);
          if (!fromLogin(event, guest) || !validCredentials(value)) return;
          const id = channel();
          const credentials = { username: id === 3 ? value.username.trim() : value.username, password: value.password };
          store.save(id, credentials).then((saved) => {
            if (saved && !channelState().restartRequired) notify(guest.shell, { type: "saved", ...saved });
          }, () => notify(guest.shell, { type: "error" }));
        });
        ipcMain.handle(ipc.take, (event, id) => {
          const guest = guests.get(event.sender);
          if (!fromLogin(event, guest) || !guest.login || guest.login.id !== id) return null;
          const credentials = guest.login.credentials;
          guest.login.credentials = null;
          return credentials;
        });
        ipcMain.on(ipc.result, (event, id, status) => {
          var _a;
          const guest = guests.get(event.sender);
          if (fromLogin(event, guest) && ((_a = guest.login) == null ? void 0 : _a.id) === id && ["form", "signed-in", "agreement", "submitted"].includes(status)) guest.login.finish(status);
        });
        async function handle(event, request) {
          const state = shells.get(event.sender);
          if (!state || !fromTop(event, state.frame) || !isShell(event.sender.getURL()) || event.senderFrame && !isShell(event.senderFrame.url)) throw new Error("\u4EC5\u5141\u8BB8\u5FAE\u7AEF\u5916\u58F3\u7BA1\u7406\u4FDD\u5B58\u7684\u8D26\u53F7");
          const { running: channelId, selected, restartRequired } = channelState();
          const guest = state.guest;
          const login = () => guest && !guest.closed && !channelState().restartRequired && loginChannel(guest.contents.getURL()) === channelId;
          if (request.action === "accounts:list") {
            if (restartRequired) return { channelId: selected, accounts: [], login: false, restartRequired: true };
            const supported = channelId === 1 || channelId === 3;
            return { channelId, accounts: supported ? await store.list(channelId) : [], login: supported && !!login() };
          }
          if (restartRequired) throw new Error("\u8BF7\u91CD\u542F\u5FAE\u7AEF\u540E\u7BA1\u7406\u8BE5\u6E20\u9053\u7684\u8D26\u53F7");
          if (typeof request.id !== "string" || !/^[a-f0-9]{24}$/.test(request.id)) throw new Error("\u8D26\u53F7\u6807\u8BC6\u65E0\u6548");
          if (request.action === "accounts:delete") {
            await store.remove(channelId, request.id);
            return;
          }
          if (request.action !== "accounts:login") throw new Error("\u672A\u77E5\u7684\u8D26\u53F7\u64CD\u4F5C");
          if (!login() || guest.login) return "form";
          const credentials = await store.get(channelId, request.id);
          if (!credentials || !login() || guest.login) return "form";
          return new Promise((resolve) => {
            const id = randomBytes(16).toString("hex");
            const { username, password } = credentials;
            const finish = (status) => {
              clearTimeout(timer);
              guest.login = null;
              resolve(status);
            };
            const timer = setTimeout(() => finish("form"), 8e3);
            guest.login = { id, finish, credentials: { username, password } };
            try {
              guest.contents.send(ipc.fill, id);
            } catch (_) {
              finish("form");
            }
          });
        }
        return { handle, notify };
      }
      module.exports = { register, loginChannel };
    }
  });
  return require_accounts_host();
})();

"use strict";
var MicroclientTopbar = (() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // microclient/topbar-shell.cjs
  var require_topbar_shell = __commonJS({
    "microclient/topbar-shell.cjs"(exports, module) {
      function mountTopbar() {
        const request = window.__SGS_TOOLBOX_CHANNEL__;
        if (typeof request !== "function" || document.getElementById("sgs-toolbox-core-bar")) return;
        const style = document.createElement("style");
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
        const bar = document.createElement("div");
        bar.id = "sgs-toolbox-core-bar";
        bar.innerHTML = `
    <button type="button" id="sgs-toolbox-core-restart" data-action="relaunch" title="\u66F4\u65B0\u5DF2\u5C31\u7EEA\uFF0C\u70B9\u51FB\u91CD\u542F\u5FAE\u7AEF\u751F\u6548\uFF08\u724C\u5C40\u4E2D\u5EFA\u8BAE\u5BF9\u5C40\u7ED3\u675F\u540E\u518D\u91CD\u542F\uFF09" hidden>
      <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M13.1 6a5.5 5.5 0 1 0 .1 4M13.1 2.8V6h-3.2"/></svg>
      <span>\u91CD\u542F\u751F\u6548</span>
    </button>
    <button type="button" id="sgs-toolbox-core-trigger" aria-expanded="false" aria-controls="sgs-toolbox-core-panel" aria-label="\u5DE5\u5177\u7BB1\u6838\u5FC3" title="\u5DE5\u5177\u7BB1\u6838\u5FC3">
      <svg aria-hidden="true" width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linejoin="round"><path d="M8 1.5 14 5v6L8 14.5 2 11V5z"/><path d="m2 5 6 3.5L14 5M8 8.5v6"/></svg>
      <span class="sgs-core-label">\u6838\u5FC3<span class="sgs-core-version"></span></span><span class="sgs-core-dot" aria-hidden="true"></span>
    </button>
    <div class="sgs-core-shade" hidden></div>
    <section id="sgs-toolbox-core-panel" aria-labelledby="sgs-toolbox-core-heading" hidden>
      <header>
        <strong id="sgs-toolbox-core-heading">\u5DE5\u5177\u7BB1\u6838\u5FC3</strong><span class="sgs-core-edition" hidden></span>
        <button type="button" class="sgs-core-refresh" data-action="check" title="\u68C0\u67E5\u66F4\u65B0" aria-label="\u68C0\u67E5\u66F4\u65B0">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M13.1 6a5.5 5.5 0 1 0 .1 4M13.1 2.8V6h-3.2"/></svg>
        </button>
      </header>
      <div class="sgs-core-recovery" role="status" hidden></div>
      <div class="sgs-core-card" data-section="script">
        <h3>\u6838\u5FC3\u811A\u672C</h3><div><span data-version></span><span class="sgs-core-origin"></span></div>
        <div class="sgs-core-staged" hidden></div><div class="sgs-core-status" role="status"></div>
        <div class="sgs-core-actions" hidden>
          <button type="button" data-action="update-script" data-main hidden>\u66F4\u65B0\u811A\u672C</button>
          <button type="button" data-action="rollback-script" data-rollback hidden>\u56DE\u9000\u811A\u672C</button>
        </div>
      </div>
      <div class="sgs-core-card" data-section="runtime">
        <h3>\u5FAE\u7AEF\u5E95\u5C42\u67B6\u6784</h3><div><span data-version></span><span class="sgs-core-origin"></span></div>
        <div class="sgs-core-staged" hidden></div><div class="sgs-core-status" role="status"></div>
        <div class="sgs-core-actions" hidden>
          <button type="button" data-action="update-runtime" data-main hidden>\u66F4\u65B0\u5E95\u5C42</button>
          <button type="button" data-action="rollback-runtime" data-rollback hidden>\u56DE\u9000\u5E95\u5C42</button>
        </div>
      </div>
      <label class="sgs-core-preference" title="\u542F\u52A8\u540E\u81EA\u52A8\u4E0B\u8F7D\u66F4\u65B0\uFF0C\u91CD\u542F\u751F\u6548\uFF0C\u4E0D\u6253\u65AD\u724C\u5C40">
        <span>\u542F\u52A8\u65F6\u81EA\u52A8\u66F4\u65B0</span>
        <span class="sgs-core-switch">
          <input id="sgs-toolbox-core-auto-update" type="checkbox" role="switch" disabled>
          <span class="sgs-core-track" aria-hidden="true"></span>
        </span>
      </label>
      <footer>
        <div class="sgs-core-error" role="alert" hidden></div>
        <div class="sgs-core-actions">
          <button type="button" data-action="check">\u68C0\u67E5\u66F4\u65B0</button>
          <button type="button" data-action="update-all" data-main hidden>\u5168\u90E8\u66F4\u65B0</button>
          <button type="button" data-action="relaunch" data-main title="\u724C\u5C40\u4E2D\u5EFA\u8BAE\u5BF9\u5C40\u7ED3\u675F\u540E\u518D\u91CD\u542F" hidden>\u91CD\u542F\u5FAE\u7AEF\u751F\u6548</button>
        </div>
        <div class="sgs-core-restart-note" hidden>\u5DF2\u4FDD\u5B58\u53D8\u66F4\uFF0C\u724C\u5C40\u4E2D\u5EFA\u8BAE\u5BF9\u5C40\u7ED3\u675F\u540E\u518D\u91CD\u542F\u3002</div>
      </footer>
    </section>
    <div id="sgs-toolbox-core-toast" role="status" hidden>
      <span class="sgs-core-toast-message"></span>
      <button type="button" class="sgs-core-toast-close" aria-label="\u7A0D\u540E\u91CD\u542F\uFF0C\u5173\u95ED\u63D0\u793A">\xD7</button>
      <button type="button" data-action="relaunch" data-main title="\u724C\u5C40\u4E2D\u5EFA\u8BAE\u5BF9\u5C40\u7ED3\u675F\u540E\u518D\u91CD\u542F">\u7ACB\u5373\u91CD\u542F</button>
    </div>
  `;
        document.body.appendChild(bar);
        const [restart, trigger, shade, panel, toast] = bar.children;
        const find = (selector) => bar.querySelector(selector);
        const buttons = Array.from(bar.querySelectorAll("button[data-action]"));
        const show = (node, value) => {
          node.hidden = !value;
        };
        const action = (name) => panel.querySelector('[data-action="' + name + '"]');
        const autoUpdate = find("#sgs-toolbox-core-auto-update");
        const toastMessage = toast.querySelector(".sgs-core-toast-message");
        const announcementsKey = "sgs-toolbox-core-announcements";
        let announced = [];
        try {
          const stored = JSON.parse(sessionStorage.getItem(announcementsKey));
          if (Array.isArray(stored)) announced = stored.slice(-16);
        } catch (_) {
        }
        let state = null, requesting = false, savingPreference = false, uiError = "";
        let toastUpdate = null, lastAnnouncement = -1;
        let toastTimer = null, toastRemaining = 0, toastStarted = 0;
        function pauseToastTimer() {
          if (toastTimer === null) return;
          clearTimeout(toastTimer);
          toastTimer = null;
          toastRemaining = Math.max(0, toastRemaining - (Date.now() - toastStarted));
        }
        function syncToastTimer() {
          if (toast.hidden || toast.matches(":hover") || toast.contains(document.activeElement)) {
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
          const update = state == null ? void 0 : state.lastUpdate;
          if (update && update.revision > lastAnnouncement) {
            lastAnnouncement = update.revision;
            const versions = pendingVersions(update);
            const key = JSON.stringify([update.scriptVersion, update.runtimeVersion]);
            if (versions.some(Boolean) && !announced.includes(key)) {
              announced = [...announced.slice(-15), key];
              try {
                sessionStorage.setItem(announcementsKey, JSON.stringify(announced));
              } catch (_) {
              }
              if (panel.hidden) {
                pauseToastTimer();
                toastUpdate = update;
                toastRemaining = 12e3;
                toast.hidden = false;
                syncToastTimer();
              }
            }
          }
          if (!toastUpdate) return;
          const [script, runtime] = pendingVersions(toastUpdate);
          if (!panel.hidden || !script && !runtime) {
            hideToast();
            return;
          }
          const verb = toastUpdate.auto ? "\u5DF2\u81EA\u52A8\u66F4\u65B0" : "\u5DF2\u66F4\u65B0";
          const target = script && runtime ? "\u6838\u5FC3\u4E0E\u5E95\u5C42" : script ? "\u6838\u5FC3\u81F3 v" + script : "\u5E95\u5C42\u81F3 v" + runtime;
          const message = verb + target + "\uFF0C\u91CD\u542F\u5FAE\u7AEF\u751F\u6548";
          if (toastMessage.textContent !== message) toastMessage.textContent = message;
        }
        function close(restoreFocus) {
          if (panel.hidden) return;
          panel.hidden = shade.hidden = true;
          trigger.setAttribute("aria-expanded", "false");
          if (restoreFocus) trigger.focus();
        }
        function renderCard(name, item) {
          var _a, _b;
          const card = find('[data-section="' + name + '"]');
          const status = card.querySelector(".sgs-core-status");
          const staged = card.querySelector(".sgs-core-staged");
          const isRuntime = name === "runtime";
          card.querySelector("[data-version]").textContent = item.version ? "\u5F53\u524D v" + item.version : "\u7248\u672C\u672A\u77E5";
          card.querySelector(".sgs-core-origin").textContent = item.source === "bundled" ? "\u5185\u7F6E" : isRuntime ? "\u5DF2\u81EA\u66F4\u65B0" : "\u5DF2\u70ED\u66F4\u65B0";
          staged.textContent = item.pending ? "\u5DF2\u4FDD\u5B58 v" + item.pending + (isRuntime ? "\uFF08\u91CD\u542F\u5FAE\u7AEF\u751F\u6548\uFF09" : "\uFF08\u4E0B\u6B21\u6253\u5F00\u6E38\u620F\u6216\u91CD\u542F\u751F\u6548\uFF09") : "";
          show(staged, item.pending);
          let detail = "\u5C1A\u672A\u68C0\u67E5\u66F4\u65B0";
          if (item.error) detail = item.error;
          else if ((_a = item.check) == null ? void 0 : _a.unsupportedBootstrap) detail = "\u9700\u8981\u91CD\u65B0\u8FD0\u884C\u65B0\u7248\u5FAE\u7AEF\u5B89\u88C5\u5305\u5347\u7EA7\u5F15\u5BFC\u5C42\u3002";
          else if ((_b = item.check) == null ? void 0 : _b.unavailable) detail = "\u6682\u672A\u53D1\u5E03\u8FDC\u7AEF\u5E95\u5C42\u66F4\u65B0\u3002";
          else if (item.newer) detail = "\u53D1\u73B0\u65B0\u7248 v" + item.check.version;
          else if (item.check) detail = item.pending ? "\u5DF2\u4FDD\u5B58\u6700\u65B0\u7248\u672C\u3002" : "\u5DF2\u662F\u5F53\u524D\u7248\u672C\u3002";
          status.textContent = detail;
          status.setAttribute("role", item.error ? "alert" : "status");
          status.dataset.newer = String(item.newer && !item.error);
          show(action("update-" + name), item.newer && !item.pending);
          show(action("rollback-" + name), item.rollback);
          show(card.querySelector(".sgs-core-actions"), item.newer && !item.pending || item.rollback);
        }
        function render() {
          const pending = !!((state == null ? void 0 : state.script.pending) || (state == null ? void 0 : state.runtime.pending));
          const available = !!((state == null ? void 0 : state.script.newer) || (state == null ? void 0 : state.runtime.newer));
          const error = uiError || !(state == null ? void 0 : state.script.errorAuto) && (state == null ? void 0 : state.script.error) || !(state == null ? void 0 : state.runtime.errorAuto) && (state == null ? void 0 : state.runtime.error);
          const busyText = { check: "\u68C0\u67E5\u4E2D\u2026", install: "\u66F4\u65B0\u4E2D\u2026", rollback: "\u56DE\u9000\u4E2D\u2026" }[state == null ? void 0 : state.busy];
          const indicator = busyText || (pending ? "\u5F85\u91CD\u542F" : available ? "\u6709\u66F4\u65B0" : error ? "\u66F4\u65B0\u5F02\u5E38" : "");
          const version = state == null ? void 0 : state.script.version;
          trigger.dataset.state = error ? "error" : pending ? "pending" : available ? "available" : "";
          find(".sgs-core-version").textContent = indicator ? " \xB7 " + indicator : version ? " v" + version : "";
          trigger.title = "\u5DE5\u5177\u7BB1\u6838\u5FC3" + (indicator ? " \xB7 " + indicator : version ? " v" + version : "");
          trigger.setAttribute("aria-label", trigger.title);
          const notice = find(".sgs-core-error");
          notice.textContent = uiError;
          show(notice, uiError);
          for (const button of buttons) button.disabled = requesting || !!(state == null ? void 0 : state.busy) || !state && button.dataset.action !== "check";
          autoUpdate.disabled = !state || savingPreference;
          if (!savingPreference) autoUpdate.checked = (state == null ? void 0 : state.autoUpdate) ?? true;
          show(restart, pending);
          panel.querySelector('footer [data-action="check"]').textContent = busyText || "\u68C0\u67E5\u66F4\u65B0";
          if (!state) return;
          renderCard("script", state.script);
          renderCard("runtime", state.runtime);
          const edition = find(".sgs-core-edition");
          edition.textContent = state.script.edition.toUpperCase();
          show(edition, state.script.edition);
          const recovery = find(".sgs-core-recovery");
          const recovered = state.runtime.recoveredFrom;
          recovery.textContent = recovered ? "\u5E95\u5C42 v" + recovered.version + " \u542F\u52A8\u5F02\u5E38\uFF0C\u5DF2\u81EA\u52A8\u56DE\u9000\u3002" + recovered.reason : "";
          show(recovery, recovered);
          show(action("update-all"), state.script.newer && !state.script.pending && state.runtime.newer && !state.runtime.pending);
          show(action("relaunch"), pending);
          show(find(".sgs-core-restart-note"), pending);
          renderToast();
        }
        function accept(value) {
          if (value && (!state || value.revision >= state.revision)) state = value;
          render();
        }
        async function run(name, silent = false) {
          if (requesting || (state == null ? void 0 : state.busy) && name !== "status") return;
          requesting = true;
          uiError = "";
          render();
          try {
            accept(await request({ action: "core:" + name }));
          } catch (error) {
            if (!silent) uiError = String(error.message || error).replace(/^Error invoking remote method 'sgs-toolbox:channel-shell:v1': (?:Error: )?/, "");
          } finally {
            requesting = false;
            render();
          }
        }
        autoUpdate.addEventListener("change", async () => {
          const enabled = autoUpdate.checked;
          savingPreference = true;
          uiError = "";
          render();
          try {
            accept(await request({ action: "core:set-auto-update", enabled }));
          } catch (error) {
            uiError = "\u4FDD\u5B58\u542F\u52A8\u8BBE\u7F6E\u5931\u8D25\uFF1A" + String(error.message || error);
          } finally {
            savingPreference = false;
            render();
          }
        });
        toast.querySelector(".sgs-core-toast-close").addEventListener("click", hideToast);
        toast.addEventListener("mouseenter", pauseToastTimer);
        toast.addEventListener("mouseleave", syncToastTimer);
        toast.addEventListener("focusin", pauseToastTimer);
        toast.addEventListener("focusout", () => queueMicrotask(syncToastTimer));
        trigger.addEventListener("click", () => {
          if (!panel.hidden) {
            close(false);
            return;
          }
          hideToast();
          panel.hidden = shade.hidden = false;
          trigger.setAttribute("aria-expanded", "true");
          void run("status");
        });
        bar.addEventListener("click", (event) => {
          const button = event.target.closest("[data-action]");
          if (button && !button.disabled) void run(button.dataset.action);
        });
        document.addEventListener("click", (event) => {
          if (!bar.contains(event.target) || event.target === shade) close(shade === event.target);
        }, true);
        document.addEventListener("keydown", (event) => {
          if (event.key === "Escape" && !panel.hidden) {
            event.preventDefault();
            close(true);
          }
        });
        window.addEventListener("sgs-toolbox-core-state", (event) => accept(event.detail));
        const channelMenu = document.getElementById("sgs-toolbox-channel-menu");
        if (channelMenu) new MutationObserver(() => {
          var _a;
          if (!panel.hidden && !channelMenu.hidden) {
            channelMenu.hidden = true;
            (_a = document.getElementById("sgs-toolbox-channel")) == null ? void 0 : _a.setAttribute("aria-expanded", "false");
          }
        }).observe(channelMenu, { attributes: true, attributeFilter: ["hidden"] });
        void run("status", true);
        setTimeout(async () => {
          try {
            accept(await request({ action: "core:startup-sync" }));
          } catch (_) {
          }
        }, 2500);
      }
      module.exports = { mountTopbar };
    }
  });
  return require_topbar_shell();
})();

"use strict";
var MicroclientRuntimeUpdate = (() => {
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

  // microclient/runtime-cache.cjs
  var require_runtime_cache = __commonJS({
    "microclient/runtime-cache.cjs"(exports, module) {
      "use strict";
      var fs = __require("fs");
      var path = __require("path");
      var crypto = __require("crypto");
      var FORMAT = "sgs-toolbox-runtime-v1";
      var BOOTSTRAP_API = 1;
      var VERSION = /^\d+\.\d+\.\d+$/;
      var SHA256 = /^[a-f0-9]{64}$/;
      var files = {
        host: { file: "runtime-host.cjs", limit: 4 * 1024 * 1024 },
        preload: { file: "runtime-preload.cjs", limit: 2 * 1024 * 1024 }
      };
      var cacheLimit = 12 * (files.host.limit + files.preload.limit) + 16384;
      var hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
      function compareVersions(left, right) {
        const a = left.split(".").map((value) => BigInt(value));
        const b = right.split(".").map((value) => BigInt(value));
        for (let i = 0; i < 3; i++) {
          if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
        }
        return 0;
      }
      function validVersion(value) {
        return typeof value === "string" && value.length <= 64 && VERSION.test(value);
      }
      function validEntry(entry, baseline) {
        return !!entry && entry.format === FORMAT && entry.bootstrapApi === BOOTSTRAP_API && validVersion(entry.version) && compareVersions(entry.version, baseline) > 0 && Object.entries(files).every(([name, { limit }]) => {
          const source = entry[name + "Source"], digest = entry[name + "Sha256"];
          return typeof source === "string" && source.length > 0 && Buffer.byteLength(source) <= limit && typeof digest === "string" && SHA256.test(digest) && hash(source) === digest;
        });
      }
      function readJSON(file, limit) {
        try {
          if (fs.statSync(file).size > limit) return null;
          const bytes = fs.readFileSync(file);
          return bytes.length <= limit ? JSON.parse(bytes.toString("utf8")) : null;
        } catch (_) {
          return null;
        }
      }
      function readCache(file) {
        return readJSON(file, cacheLimit);
      }
      function writeJSON(file, value) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const temp = file + "." + crypto.randomBytes(8).toString("hex") + ".tmp";
        try {
          fs.writeFileSync(temp, JSON.stringify(value), { mode: 384, flag: "wx" });
          fs.renameSync(temp, file);
        } finally {
          try {
            fs.unlinkSync(temp);
          } catch (_) {
          }
        }
      }
      function writeCache(file, current, previous) {
        if (current) writeJSON(file, { current, previous: previous || null });
        else {
          try {
            fs.unlinkSync(file);
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
        }
      }
      module.exports = { FORMAT, BOOTSTRAP_API, files, hash, SHA256, validVersion, compareVersions, validEntry, readJSON, readCache, writeJSON, writeCache };
    }
  });

  // microclient/runtime-update.cjs
  var require_runtime_update = __commonJS({
    "microclient/runtime-update.cjs"(exports, module) {
      var vm = __require("vm");
      var { FORMAT, files, hash, SHA256, validVersion, compareVersions, validEntry, readCache, writeCache, readJSON, writeJSON } = require_runtime_cache();
      function createRuntimeUpdater({ bootstrap, sources, download }) {
        const { activeRuntimeVersion: version, bundledRuntimeVersion: baseline, bootstrapApi, activeRuntimeEntry, runtimeUpdateFile } = bootstrap;
        const file = runtimeUpdateFile();
        const active = activeRuntimeEntry;
        const saved = () => {
          const cache = readCache(file);
          return validEntry(cache == null ? void 0 : cache.current, baseline) ? cache : null;
        };
        const previousOf = (cache) => validEntry(cache == null ? void 0 : cache.previous, baseline) && cache.previous.hostSha256 !== cache.current.hostSha256 ? cache.previous : null;
        let check = null, error = null;
        function status() {
          const cache = saved(), current = cache == null ? void 0 : cache.current;
          const pending = (current == null ? void 0 : current.version) !== (active == null ? void 0 : active.version) || (current == null ? void 0 : current.hostSha256) !== (active == null ? void 0 : active.hostSha256) || (current == null ? void 0 : current.preloadSha256) !== (active == null ? void 0 : active.preloadSha256);
          const target = (current == null ? void 0 : current.version) || baseline;
          return {
            version,
            source: bootstrap.activeRuntimeSource,
            bootstrapApi,
            pending: pending ? target : null,
            rollback: !!current,
            recoveredFrom: bootstrap.recoveredFrom,
            check,
            error,
            newer: !!(check == null ? void 0 : check.version) && !check.unsupportedBootstrap && compareVersions(check.version, target) > 0
          };
        }
        function readManifest(value) {
          if ((value == null ? void 0 : value.format) !== FORMAT || !validVersion(value.version) || !Number.isSafeInteger(value.bootstrapApi) || value.bootstrapApi < bootstrapApi || !Object.entries(files).every(([name, { file: file2, limit }]) => {
            const item = value[name];
            return (item == null ? void 0 : item.file) === file2 && Number.isInteger(item.bytes) && item.bytes > 0 && item.bytes <= limit && typeof item.sha256 === "string" && SHA256.test(item.sha256);
          })) throw new Error("\u5E95\u5C42\u66F4\u65B0\u6E05\u5355\u65E0\u6548");
          return value;
        }
        async function getSource(base, item) {
          const bytes = await download(base + item.file, item.bytes, 2e4);
          const source = bytes.toString("utf8");
          if (bytes.length !== item.bytes || hash(bytes) !== item.sha256 || !bytes.equals(Buffer.from(source))) {
            throw new Error(item.file + " \u957F\u5EA6\u3001\u6458\u8981\u6216\u7F16\u7801\u6821\u9A8C\u5931\u8D25");
          }
          new vm.Script(source, { filename: item.file });
          return source;
        }
        async function run(action) {
          error = null;
          try {
            const cache = saved();
            if (action === "rollback") {
              if (!cache) throw new Error("\u6CA1\u6709\u53EF\u56DE\u9000\u7684\u5E95\u5C42\u7248\u672C");
              writeCache(file, previousOf(cache));
              return;
            }
            const target = (cache == null ? void 0 : cache.current.version) || baseline;
            const errors = [];
            let missing = false, found = false;
            for (const base of sources) {
              try {
                let data;
                try {
                  data = await download(base + "runtime-update.json", 16384, 1e4);
                } catch (failure) {
                  if (failure.statusCode !== 404) throw failure;
                  missing = true;
                  continue;
                }
                found = true;
                const manifest = readManifest(JSON.parse(data.toString("utf8")));
                const result = { version: manifest.version, unsupportedBootstrap: manifest.bootstrapApi > bootstrapApi };
                if (action === "check" || result.unsupportedBootstrap || compareVersions(manifest.version, target) <= 0) {
                  check = result;
                  return;
                }
                const hostSource = await getSource(base, manifest.host);
                const preloadSource = await getSource(base, manifest.preload);
                const entry = {
                  format: FORMAT,
                  bootstrapApi,
                  version: manifest.version,
                  hostSource,
                  hostSha256: manifest.host.sha256,
                  preloadSource,
                  preloadSha256: manifest.preload.sha256
                };
                const previous = active && active.hostSha256 !== entry.hostSha256 ? active : previousOf(cache);
                writeCache(file, entry, previous);
                check = result;
                return entry.version;
              } catch (failure) {
                const detail = failure.code === "ETIMEDOUT" ? "\u8FDE\u63A5\u8D85\u65F6" : failure.message;
                errors.push(new URL(base).hostname + "\uFF08" + detail + "\uFF09");
              }
            }
            if (errors.length && (found || !missing)) throw new Error("\u5E95\u5C42\u66F4\u65B0\u5931\u8D25\uFF1A" + errors.join("\uFF1B"));
            check = { unavailable: true };
          } catch (failure) {
            if (action === "check") check = null;
            error = String(failure.message || failure);
          }
        }
        return { run, status };
      }
      module.exports = { createRuntimeUpdater, readJSON, writeJSON };
    }
  });
  return require_runtime_update();
})();

const { app, ipcMain, screen } = require('electron');
// The official shell creates its main window first. Resize it once only;
// payment/login popups and subsequent user resizing retain their own sizes.
app.once('browser-window-created', function (_, window) {
  const display = screen.getDisplayMatching(window.getBounds());
  const scale = display.scaleFactor || 1;
  const width = Math.round(Math.max(1400, display.size.width * scale / 2) / scale);
  const height = Math.round(Math.max(820, display.size.height * scale / 2) / scale);
  window.setSize(width, height);
  window.center();
});
const fs = require('fs');
const path = require('path');
const code = fs.readFileSync(path.join(__dirname, 'toolbox.js'), 'utf8');
const installedPackage = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')); } catch (_) { return {}; } })();
const CHANNELS = [{ id: 1, name: '官服' }, { id: 3, name: '4399' }];
function channelFile() {
  let base;
  try { base = app.getPath('userData'); } catch (_) { base = process.env.APPDATA ? path.join(process.env.APPDATA, 'SGSOL') : path.join(__dirname, '..'); }
  return path.join(base, 'sgs-toolbox-channel.json');
}
function readChannel() {
  try {
    const value = JSON.parse(fs.readFileSync(channelFile(), 'utf8'));
    const packageId = Number(value && value.packageId);
    return Number.isInteger(packageId) ? packageId : null;
  } catch (_) { return null; }
}
function saveChannel(packageId) {
  const file = channelFile(), temp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.writeFileSync(temp, JSON.stringify({ packageId }), { mode: 0o600 }); fs.renameSync(temp, file); }
  finally { try { fs.unlinkSync(temp); } catch (_) {} }
}
function channelList() {
  const login = Array.isArray(installedPackage.LoginURL) ? installedPackage.LoginURL : [];
  return CHANNELS.filter(channel => typeof login[channel.id - 1] === 'string' && login[channel.id - 1].length > 0);
}
function channelPackageId(fallback) {
  const saved = readChannel();
  if (saved !== null && channelList().some(channel => channel.id === saved)) return saved;
  const value = Number(fallback);
  return Number.isInteger(value) && value > 0 ? value : 1;
}
function channelState() {
  const channels = channelList();
  const installed = Number.isInteger(Number(installedPackage.packageId)) ? Number(installedPackage.packageId) : 1;
  const running = Number.isInteger(Number(global.PackageId)) ? Number(global.PackageId) : installed;
  const saved = readChannel();
  const selected = saved !== null && channels.some(channel => channel.id === saved) ? saved : running;
  return { running, selected, installed, channels, restartRequired: selected !== running };
}
if (typeof module !== 'undefined') module.exports = { channelPackageId };
const mainFrames = new WeakMap();
const crypto = require('crypto');
const https = require('https');
const UPDATE_SOURCES = [
  'https://raw.githubusercontent.com/Usernametoolongmaximumis39/sgs-ol-toolbox/main/microclient/',
  'https://dl.3gs.xyz/microclient/'
];
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const versionOf = source => { const match = /^\/\/ 三国杀OL工具箱 · 微端 (?:LITE|FULL) · (\d+\.\d+\.\d+)\r?\n/.exec(source); return match && match[1]; };
const compare = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1; return 0; };
function updateFile() { return path.join(app.getPath('userData'), 'sgs-toolbox-script-update.json'); }
function valid(entry) { return entry && typeof entry.source === 'string' && Buffer.byteLength(entry.source) <= 12 * 1024 * 1024 && versionOf(entry.source) === entry.version && hash(entry.source) === entry.sha256; }
function loadUpdate() {
  try { const value = JSON.parse(fs.readFileSync(updateFile(), 'utf8')); return valid(value.current) && compare(value.current.version, versionOf(code) || '0.0.0') > 0 ? value : null; }
  catch (_) { return null; }
}
function saveUpdate(value) {
  const file = updateFile(), temp = file + '.tmp';
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 }); fs.renameSync(temp, file); }
  finally { try { fs.unlinkSync(temp); } catch (_) {} }
}
function startDownload(url, limit, timeout, label = '更新', resource) {
  let request;
  const promise = new Promise((resolve, reject) => {
    const receive = response => {
      let expectedLength;
      try {
        if (resource?.range) expectedLength = MobileSkinSecurity.mobileSkinPartialLength(resource, response.statusCode,
          response.headers?.['content-range'], response.headers?.['content-length'], response.headers?.['content-encoding']);
        else if (response.statusCode !== 200) { response.resume(); reject(Object.assign(new Error(label + '服务器返回 ' + response.statusCode), { statusCode: response.statusCode })); return; }
        if (Number(response.headers?.['content-length']) > limit) throw new Error(label + '文件过大');
      } catch (error) { request.destroy(error); return; }
      const chunks = []; let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > (expectedLength ?? limit)) {
          const error = new Error(label + '文件过大');
          reject(error);
          request.destroy(error);
        } else chunks.push(chunk);
      });
      response.on('end', () => {
        if (expectedLength !== undefined && size !== expectedLength) reject(new Error('移动版安装包分段响应长度不符'));
        else resolve(Buffer.concat(chunks));
      });
      response.on('aborted', () => reject(new Error(label + '下载中断')));
      response.on('error', reject);
    };
    request = resource?.headers ? https.get(url, { headers: { ...resource.headers, 'Accept-Encoding': 'identity' } }, receive) : https.get(url, receive);
    const deadline = setTimeout(() => request.destroy(new Error(label + '下载超时')), timeout);
    request.once('close', () => clearTimeout(deadline));
    request.on('error', reject);
  });
  return { promise, cancel() { request?.destroy(new Error(label + '下载已取消')); } };
}
function download(url, limit, timeout) {
  return startDownload(url, limit, timeout).promise;
}
async function updateScript(action) {
  const saved = loadUpdate(), current = saved ? saved.current : { source: code, version: versionOf(code) || '0.0.0', sha256: hash(code) };
  if (action === 'rollback') {
    if (!saved || !valid(saved.previous)) throw new Error('没有可回退的脚本');
    // Never persist an older script than the installed host baseline.
    if (compare(saved.previous.version, versionOf(code) || '0.0.0') < 0) throw new Error('旧脚本低于安装版本');
    saveUpdate({ current: saved.previous }); return { version: saved.previous.version, pending: true, rollback: false };
  }
  const errors = [];
  for (const base of UPDATE_SOURCES) {
    try {
      const manifest = JSON.parse((await download(base + 'update.json', 16384, 10000)).toString('utf8'));
      if (manifest.format !== 'sgs-toolbox-script-v1' || manifest.hostApi !== 1 || !/^\d+\.\d+\.\d+$/.test(manifest.version) || !/^[a-f0-9]{64}$/.test(manifest.sha256) || !Number.isInteger(manifest.bytes) || manifest.bytes < 1 || manifest.bytes > 12 * 1024 * 1024) throw new Error('脚本更新清单无效或需要新版接入层');
      const newer = compare(manifest.version, current.version) > 0;
      if (action === 'check' || !newer) return { version: manifest.version, current: current.version, newer, rollback: !!(saved && valid(saved.previous)) };
      const bytes = await download(base + 'toolbox.js', 12 * 1024 * 1024, 20000);
      const next = { version: manifest.version, sha256: manifest.sha256, source: bytes.toString('utf8') };
      if (bytes.length !== manifest.bytes || hash(bytes) !== manifest.sha256 || !valid(next) || !next.source.startsWith('// 三国杀OL工具箱 · 微端 LITE · ')) throw new Error('脚本版本或摘要校验失败');
      new (require('vm').Script)(next.source); // Parse only; never run remote code in the main process.
      saveUpdate({ current: next, previous: current });
      return { version: next.version, pending: true, rollback: true };
    } catch (error) {
      const detail = error.code === 'ETIMEDOUT' ? '连接超时' : error.message;
      errors.push(new URL(base).hostname + '（' + detail + '）');
    }
  }
  throw new Error('脚本更新失败：' + errors.join('；'));
}
function topFrameURL(event) {
  const frame = mainFrames.get(event.sender);
  if (frame?.waitForCommit) return '';
  if (event.senderFrame) return event.senderFrame.parent ? '' : event.senderFrame.url;
  const processId = event.processId ?? event.sender?.getProcessId?.();
  return frame && frame.routingId >= 0 && frame.processId >= 0 &&
    event.frameId === frame.routingId && processId === frame.processId ? frame.url : '';
}
function allowed(event) { return isGameURL(topFrameURL(event)); }

const boot = typeof bootstrap === 'undefined' ? null : bootstrap;
const runtimeTools = typeof MicroclientRuntimeUpdate === 'undefined' ? null : MicroclientRuntimeUpdate;
const runtime = boot && runtimeTools?.createRuntimeUpdater({ bootstrap: boot, sources: UPDATE_SOURCES, download });
const shellFile = typeof path.resolve === 'function' ? path.resolve(boot?.installDir || __dirname, '..', 'index_wd.html') : null;
const shells = new Set();
let runningScript = null, scriptCheck = null, scriptError = null, busy = null, revision = 0;
let scriptErrorAuto = false, runtimeErrorAuto = false, lastUpdate = null;
let coreOperationDone = null, startupSynced = null;

function corePrefsFile() { return path.join(app.getPath('userData'), 'sgs-toolbox-core-prefs.json'); }
function corePrefsIO() { return runtimeTools || require('./runtime-cache.cjs'); }
function autoUpdateEnabled() {
  try { return corePrefsIO().readJSON(corePrefsFile(), 4096)?.autoUpdate !== false; }
  catch (_) { return true; }
}

function isShell(url) {
  if (!shellFile) return false;
  try { return path.resolve(require('url').fileURLToPath(url)).toLowerCase() === shellFile.toLowerCase(); }
  catch (_) { return false; }
}

function scriptIdentity(source) {
  return {
    version: versionOf(source),
    edition: source.startsWith('// 三国杀OL工具箱 · 微端 FULL · ') ? 'full' : 'lite',
    source: source === code ? 'bundled' : 'updated'
  };
}

function coreStatus() {
  const saved = loadUpdate();
  const target = scriptIdentity(saved?.current.source || code);
  const script = runningScript || target;
  return {
    busy, revision, autoUpdate: autoUpdateEnabled(), lastUpdate,
    script: {
      ...script, pending: script.version !== target.version ? target.version : null,
      rollback: !!saved && valid(saved.previous) && compare(saved.previous.version, versionOf(code) || '0.0.0') >= 0,
      newer: !!scriptCheck && compare(scriptCheck.version, target.version || '0.0.0') > 0,
      check: scriptCheck, error: scriptError, errorAuto: scriptErrorAuto
    },
    runtime: {
      ...(runtime?.status() || {
        version: boot?.activeRuntimeVersion || '1.0.1', source: 'bundled', bootstrapApi: 1,
        pending: null, rollback: false, recoveredFrom: null, check: null, error: null, newer: false
      }),
      errorAuto: runtimeErrorAuto
    }
  };
}

function notifyCore() {
  revision++;
  if (!shells.size) return;
  const status = JSON.stringify(coreStatus());
  for (const shell of shells) {
    try {
      if (!shell.isDestroyed() && isShell(shell.getURL())) {
        shell.executeJavaScript('window.dispatchEvent(new CustomEvent("sgs-toolbox-core-state", { detail: ' + status + ' }))').catch(() => {});
      }
    } catch (_) {}
  }
}

async function runScript(action, auto) {
  scriptError = null;
  scriptErrorAuto = auto;
  try {
    const result = await updateScript(action);
    if (action !== 'rollback') scriptCheck = { version: result.version };
    return result;
  } catch (error) {
    if (action === 'check') scriptCheck = null;
    scriptError = String(error.message || error);
    throw error;
  }
}

async function runCoreOperation(action, work, auto = false) {
  if (busy) throw new Error('正在更新，请稍候');
  if (!runningScript) runningScript = scriptIdentity(loadUpdate()?.current.source || code);
  let finish;
  coreOperationDone = new Promise(resolve => { finish = resolve; });
  let scriptVersion = null, runtimeVersion = null;
  const operations = {
    async script(op) {
      const result = await runScript(op, auto);
      if (op === 'install' && result.pending) scriptVersion = result.version;
      return result;
    },
    async runtime(op) {
      runtimeErrorAuto = auto;
      const installed = await runtime?.run(op);
      if (op === 'install' && installed) runtimeVersion = installed;
    }
  };
  busy = action;
  try {
    notifyCore();
    return await work(operations);
  } finally {
    busy = null;
    coreOperationDone = null;
    finish();
    if (scriptVersion || runtimeVersion) {
      const state = coreStatus();
      if (scriptVersion !== state.script.pending) scriptVersion = null;
      if (runtimeVersion !== state.runtime.pending) runtimeVersion = null;
      if (scriptVersion || runtimeVersion) lastUpdate = { auto, scriptVersion, runtimeVersion, revision: revision + 1 };
    }
    notifyCore();
  }
}

ipcMain.handle('sgs-toolbox:update:v1', async (event, action) => {
  if (!allowed(event)) throw new Error('仅允许官方游戏主页面更新工具箱');
  if (!['check', 'install', 'rollback'].includes(action)) throw new Error('未知更新操作');
  return runCoreOperation(action, operations => operations.script(action));
});

function checkUpdates(operations) {
  return Promise.all([operations.script('check').catch(() => {}), operations.runtime('check')]);
}

async function installAvailable(operations, auto = false) {
  const status = coreStatus();
  if (auto && !status.autoUpdate) return;
  const installScript = status.script.newer && !status.script.pending;
  const installRuntime = status.runtime.newer && !status.runtime.pending && !status.runtime.check?.unsupportedBootstrap;
  if (!installScript && !installRuntime) return;
  if (auto) {
    busy = 'install';
    notifyCore();
  }
  if (installScript) await operations.script('install').catch(() => {});
  if (installRuntime && (!auto || autoUpdateEnabled())) await operations.runtime('install');
}

async function startupSync() {
  // If the user already started a manual operation, check once that operation finishes.
  while (coreOperationDone) await coreOperationDone;
  await runCoreOperation('check', async operations => {
    await checkUpdates(operations);
    await installAvailable(operations, true);
  }, true);
}

async function handleCore(request) {
  const { action } = request;
  if (action === 'core:status') return coreStatus();
  if (action === 'core:set-auto-update') {
    if (typeof request.enabled !== 'boolean') throw new Error('启动时自动更新开关必须为布尔值');
    corePrefsIO().writeJSON(corePrefsFile(), { autoUpdate: request.enabled });
    notifyCore();
    return coreStatus();
  }
  if (action === 'core:startup-sync') {
    if (!startupSynced) startupSynced = startupSync();
    await startupSynced;
    return coreStatus();
  }
  if (action === 'core:relaunch') {
    if (busy) throw new Error('正在更新，请稍候');
    const status = coreStatus();
    if (status.script.pending || status.runtime.pending) { app.relaunch(); app.quit(); }
    return status;
  }
  const operation = {
    'core:check': ['check', checkUpdates],
    'core:update-script': ['install', operations => operations.script('install').catch(() => {})],
    'core:rollback-script': ['rollback', operations => operations.script('rollback').catch(() => {})],
    'core:update-runtime': ['install', operations => operations.runtime('install')],
    'core:rollback-runtime': ['rollback', operations => operations.runtime('rollback')],
    'core:update-all': ['install', installAvailable]
  }[action];
  if (!operation) throw new Error('未知核心操作');
  await runCoreOperation(...operation);
  return coreStatus();
}
const mobileSkinJobs = new WeakMap();
ipcMain.handle('sgs-toolbox:mobile-skin:v1', async (event, message) => {
  if (!allowed(event)) throw new Error('仅允许官方游戏主页面读取移动版皮肤');
  const { id, url, limit, range } = message ?? {};
  if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id)) throw new Error('无效的移动版皮肤下载请求');
  // This validator is bundled before host.cjs by build-microclient.mjs.
  const request = MobileSkinSecurity.toolboxDownloadRequest(url, limit, range);
  const label = request.label || '移动版皮肤资源';
  let jobs = mobileSkinJobs.get(event.sender);
  if (!jobs) mobileSkinJobs.set(event.sender, jobs = new Map());
  if (jobs.has(id) || jobs.size >= 24) throw new Error(`${label}下载请求过多，请稍后重试`);
  const job = startDownload(request.url, request.limit, request.timeout, label, request);
  jobs.set(id, job);
  try {
    const bytes = await job.promise;
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } finally { jobs.delete(id); }
});
ipcMain.on('sgs-toolbox:mobile-skin-cancel:v1', (event, id) => {
  if (allowed(event)) mobileSkinJobs.get(event.sender)?.get(id)?.cancel();
});
const privateSyncJobs = new WeakMap();
ipcMain.handle('sgs-toolbox:private-sync-http:v1', async (event, message) => {
  const page = topFrameURL(event);
  if (!isGameURL(page) || !/^[a-f0-9]{32}$/.test(message?.id ?? '')) throw new Error('无效的私有同步请求');
  const origin = new URL(page).origin;
  const { url, headers, body } = MobileSkinSecurity.privateHttpRequest(message, origin);
  const { PRIVATE_HTTP_LIMIT: limit, PRIVATE_HTTP_TIMEOUT: timeout } = MobileSkinSecurity;
  let jobs = privateSyncJobs.get(event.sender);
  if (!jobs) privateSyncJobs.set(event.sender, jobs = new Map());
  if (jobs.has(message.id) || jobs.size >= 12 || Buffer.byteLength(body) > limit) throw new Error('私有同步请求超限');
  let request, timer;
  try {
    return await new Promise((resolve, reject) => {
      request = require('http').request(url, { method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(body) } }, response => {
        const chunks = [];
        let bytes = 0;
        response.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > limit) request.destroy(new Error('私有同步响应超限'));
          else chunks.push(chunk);
        });
        response.once('error', reject);
        response.once('end', () => resolve({ status: response.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
      });
      request.once('error', reject);
      jobs.set(message.id, request);
      timer = setTimeout(() => request.destroy(new Error('私有同步请求超时')), timeout);
      request.end(body);
    });
  } finally { clearTimeout(timer); jobs.delete(message.id); }
});
ipcMain.on('sgs-toolbox:private-sync-http-cancel:v1', (event, id) => {
  if (allowed(event)) privateSyncJobs.get(event.sender)?.get(id)?.destroy(new Error('私有同步请求已取消'));
});
const accounts = typeof MicroclientAccounts === 'undefined' ? null : MicroclientAccounts.register({
  app, ipcMain, channelState, shellFile: path.resolve(__dirname, '..', 'index_wd.html')
});
ipcMain.handle('sgs-toolbox:channel-shell:v1', (event, request) => {
  if (accounts && typeof request?.action === 'string' && request.action.startsWith('accounts:')) return accounts.handle(event, request);
  if (typeof request?.action === 'string' && request.action.startsWith('core:')) {
    if (!shells.has(event.sender) || !isShell(event.sender.getURL()) || !isShell(topFrameURL(event))) {
      throw new Error('仅允许微端外壳管理工具箱核心');
    }
    return handleCore(request);
  }
  const url = event.senderFrame ? event.senderFrame.url : event.sender.getURL();
  if (!/^file:/i.test(url) || !/index_wd\.html(?:[?#]|$)/i.test(url)) throw new Error('仅允许微端外壳切换游戏渠道');
  if (!request || typeof request !== 'object') throw new Error('无效的渠道请求');
  if (request.action === 'get') return channelState();
  if (request.action !== 'set') throw new Error('未知渠道操作');
  const packageId = Number(request.packageId);
  if (!Number.isInteger(packageId) || !channelList().some(channel => channel.id === packageId)) throw new Error('当前客户端不包含该游戏渠道');
  saveChannel(packageId);
  accounts?.notify(event.sender);
  return channelState();
});
const preloadAfterCommit = 'sgs-toolbox:preload-after-commit:v1';
// Older installed bootstraps can run this small loader as a preload reply.
// The real runtime and game source still require the verified main frame.
const waitForGamePreload = '(' + function (channel) {
  const { ipcRenderer } = require('electron');
  ipcRenderer.invoke(channel).then(reply => {
    if (reply?.mode === 'code') new Function('require', reply.source)(require);
  }).catch(error => console.error('[工具箱微端]', error));
}.toString() + ')(' + JSON.stringify(preloadAfterCommit) + ');';

// Electron 10 can report the old renderer's frame IDs during a cross-site
// redirect. In that case the new preload must wait for the committed IDs.
app.on('web-contents-created', function (_, contents) {
  let committedFrame, finishRedirect;
  function releasePreload() {
    finishRedirect?.();
    finishRedirect = null;
  }
  function remember(url, processId, routingId, deferPreload = false) {
    const waitForCommit = deferPreload ? mainFrames.get(contents)?.waitForCommit ||
      new Promise(resolve => { finishRedirect = resolve; }) : null;
    const frame = { url, processId, routingId, waitForCommit };
    mainFrames.set(contents, frame);
    if (!deferPreload) releasePreload();
    return frame;
  }
  contents.on('did-start-navigation', (_, url, _inPlace, mainFrame, processId, routingId) => {
    if (mainFrame) remember(url, processId, routingId);
  });
  const redirect = (_, url, _inPlace, mainFrame, processId, routingId) => {
    if (mainFrame) remember(url, processId, routingId,
      !!boot?.activePreloadSource && contents.getType?.() === 'webview' && isGameURL(url));
  };
  contents.on('will-redirect', redirect);
  contents.on('did-redirect-navigation', redirect);
  contents.on('did-frame-navigate', (_, url, _status, _text, mainFrame, processId, routingId) => {
    if (mainFrame) committedFrame = remember(url, processId, routingId);
  });
  contents.on('did-fail-provisional-load', (_, _code, _description, url, mainFrame) => {
    const frame = mainFrames.get(contents);
    if (!mainFrame || !frame?.waitForCommit || frame.url !== url) return;
    if (committedFrame && contents.getURL() === committedFrame.url) mainFrames.set(contents, committedFrame);
    else mainFrames.delete(contents);
    releasePreload();
  });
  const cancelSkinJobs = () => { for (const job of mobileSkinJobs.get(contents)?.values() ?? []) job.cancel(); };
  contents.on('did-start-navigation', (_, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) cancelSkinJobs(); });
  if (shellFile && contents.getType?.() === 'window') {
    contents.on('did-finish-load', () => {
      if (!isShell(contents.getURL())) { shells.delete(contents); return; }
      shells.add(contents);
      if (typeof MicroclientTopbar !== 'undefined') {
        contents.executeJavaScript('(' + MicroclientTopbar.mountTopbar.toString() + ')();').catch(() => {});
      }
    });
  }
  contents.once('destroyed', function () {
    cancelSkinJobs(); mainFrames.delete(contents); shells.delete(contents);
    releasePreload();
  });
});
function isGameURL(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && url.hostname === 'web.sanguosha.com'
      && /^\/220\/h5_2\/index(?:_\d+)?\.php$/.test(url.pathname);
  } catch (_) { return false; }
}
ipcMain.on('sgs-toolbox:source:v1', event => {
  if (!allowed(event)) { event.returnValue = ''; return; }
  const source = loadUpdate()?.current.source || code;
  event.returnValue = source;
  const identity = scriptIdentity(source);
  const changed = runningScript?.version !== identity.version || runningScript?.source !== identity.source;
  runningScript = identity;
  if (changed) notifyCore();
});
ipcMain.on('sgs-toolbox:preload:v1', event => {
  if (boot?.activePreloadSource && mainFrames.get(event.sender)?.waitForCommit && !event.senderFrame?.parent) {
    event.returnValue = { mode: 'code', source: waitForGamePreload };
    return;
  }
  const url = topFrameURL(event);
  const isLogin = typeof MicroclientAccounts !== 'undefined' && MicroclientAccounts.loginChannel(url) > 0;
  event.returnValue = isGameURL(url) || isLogin
    ? (boot?.activePreloadSource ? { mode: 'code', source: boot.activePreloadSource } : null)
    : { mode: 'skip' };
});
ipcMain.handle(preloadAfterCommit, async event => {
  if (!boot?.activePreloadSource || event.senderFrame?.parent) return { mode: 'skip' };
  const { sender } = event;
  await mainFrames.get(sender)?.waitForCommit;
  if (sender.isDestroyed?.()) return { mode: 'skip' };
  const url = topFrameURL(event);
  return isGameURL(url) && url === sender.getURL()
    ? { mode: 'code', source: boot.activePreloadSource }
    : { mode: 'skip' };
});

// Read only the official cashier endpoints; never forward cookies or execute HTML.
function cashierURL(value, initial = true) {
  const u = new URL(value);
  const gateway = u.origin === 'https://openapi.alipay.com' && u.pathname === '/gateway.do';
  const cashier = u.origin === 'https://excashier.alipay.com' && u.pathname === '/standard/auth.htm';
  const assignment = u.origin === 'https://unitradeprod.alipay.com' && u.pathname === '/appAssign.htm';
  const method = u.searchParams.get('method');
  // Redirects may return to the gateway without repeating the original method.
  // Keep the initiating request strict and validate every redirect endpoint.
  if (u.username || u.password || !(gateway || cashier || assignment) || (initial && (!gateway || method !== 'alipay.trade.page.pay')) || (gateway && method && method !== 'alipay.trade.page.pay')) {
    const host = u.hostname.replace(/[^a-z0-9.-]/gi, '').slice(0, 100);
    const route = u.pathname.replace(/[^a-z0-9/_.-]/gi, '_').slice(0, 100);
    throw Error('支付宝收银台' + (initial ? '入口' : '跳转') + '地址异常（域名：' + host + '；路径：' + route + '）');
  }
  return u.href;
}
function readCashier(value, redirects = 0) {
  const url = cashierURL(value, redirects === 0);
  return new Promise((resolve, reject) => {
    const req = https.get(url, res => {
      if ([301,302,303,307,308].includes(res.statusCode)) {
        res.resume();
        if (redirects >= 4) return reject(Error('支付宝跳转次数过多'));
        try { resolve(readCashier(new URL(res.headers.location, url).href, redirects + 1)); } catch (e) { reject(e); }
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(Error('支付宝收银台 HTTP ' + res.statusCode)); return; }
      const chunks = []; let size = 0;
      res.on('data', chunk => { size += chunk.length; if (size > 2 * 1024 * 1024) req.destroy(Error('支付宝收银台内容过大')); else chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => resolve({status:200, finalUrl:url, responseText:Buffer.concat(chunks).toString('utf8')}));
    });
    req.setTimeout(12000, () => req.destroy(Error('支付宝收银台读取超时')));
    req.on('error', reject);
  });
}
ipcMain.handle('sgs-toolbox:alipay:v1', (event, url) => {
  if (!allowed(event)) throw Error('仅允许官方游戏主页面解析付款码');
  return readCashier(url);
});
