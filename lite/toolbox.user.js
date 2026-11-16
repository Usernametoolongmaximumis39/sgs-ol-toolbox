// ==UserScript==
// @name         三国杀OL工具箱
// @namespace    sgs-ol-toolbox
// @version      0.6.45
// @license      MIT
// @icon         data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%3E%3Crect%20width%3D%2224%22%20height%3D%2224%22%20rx%3D%225%22%20fill%3D%22%23171b1d%22%2F%3E%3Cg%20fill%3D%22none%22%20stroke%3D%22%23c8ab6a%22%20stroke-width%3D%221.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M3%207h18v13H3ZM8%207V4h8v3M3%2012h6M15%2012h6%22%2F%3E%3Cpath%20d%3D%22M12%209l3%203-3%203-3-3Z%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E
// @description  轻量版：独立核心，按需安装插件并沿用已保存的插件
// @match        https://web.sanguosha.com/*
// @match        http://web.sanguosha.com/*
// @updateURL    https://raw.githubusercontent.com/Usernametoolongmaximumis39/sgs-ol-toolbox/main/lite/toolbox.meta.js
// @downloadURL  https://raw.githubusercontent.com/Usernametoolongmaximumis39/sgs-ol-toolbox/main/lite/toolbox.user.js
// @exclude      *://web.sanguosha.com/10/*
// @exclude      *://web.sanguosha.com/10th/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  // src/core/refresh-reentry.js
  var KEY = "sgstoolbox:refresh-reentry:v1";
  var GAME_PATH = /^\/220\/h5_2\/index(?:_\d+)?\.php$/, INSTALLED = Symbol.for("sgs.ol.toolbox.refresh-reentry");
  function installRefreshReentry(win) {
    if (win[INSTALLED] !== void 0) return win[INSTALLED];
    let handled = install(win);
    return win[INSTALLED] = handled, handled;
  }
  function install(win) {
    if (win.location.hostname !== "web.sanguosha.com" || win.top !== win.self) return !1;
    let loginPage = win.location.pathname === "/login/index.html", gamePage = GAME_PATH.test(win.location.pathname);
    if (!loginPage && !gamePage) return !1;
    let clear = () => {
      try {
        win.sessionStorage.removeItem(KEY);
      } catch {
      }
    }, pending;
    try {
      pending = JSON.parse(win.sessionStorage.getItem(KEY) || "null");
    } catch {
    }
    let valid = pending?.version === 1 && Number.isFinite(pending.at) && Date.now() >= pending.at && Date.now() - pending.at < 6e4;
    if (loginPage) {
      if (!valid)
        return clear(), !0;
      let timer, stop = () => {
        win.clearInterval(timer), clear(), win.removeEventListener("pagehide", stop), win.document.removeEventListener("pointerdown", stop, !0), win.document.removeEventListener("keydown", stop, !0);
      }, visible = (el) => el && el.getClientRects().length > 0 && win.getComputedStyle(el).visibility !== "hidden", tick = () => {
        if (Date.now() - pending.at >= 6e4) {
          stop();
          return;
        }
        let doc = win.document, button = doc.querySelector("#goInGameBtn"), item = doc.querySelector('.game-item[gid="1100"]');
        !button || button.getAttribute("gid") !== "1100" || button.disabled || typeof button.onclick != "function" || !visible(button) || !visible(item) || !["0", "1"].includes(item.getAttribute("status")) || !win.$$sgsPassApp || typeof win.$$sgsPassApp.makeTicket != "function" || ["#realNameAuth", ".under18", "#accInvalidStr"].some((s) => visible(doc.querySelector(s))) || (stop(), button.click());
      };
      return timer = win.setInterval(tick, 250), win.addEventListener("pagehide", stop, { once: !0 }), win.document.addEventListener("pointerdown", stop, !0), win.document.addEventListener("keydown", stop, !0), !0;
    }
    if (win.performance?.getEntriesByType?.("navigation")?.[0]?.type !== "reload")
      return clear(), !1;
    try {
      if (win.localStorage.getItem("sgstoolbox:refreshReentryEnabled") === "false") return !1;
      let params = new URLSearchParams(win.location.search);
      if (params.has("logout_url") || params.has("cmFlag")) return !1;
      let client = params.get("client");
      return client && !["1100", "110074", "210000"].includes(client) ? !1 : (win.sessionStorage.setItem(KEY, JSON.stringify({ version: 1, at: Date.now() })), win.location.replace("https://web.sanguosha.com/login/index.html"), !0);
    } catch {
      return clear(), !1;
    }
  }

  // src/core/distribution.js
  var EDITION = "lite";
  var GITHUB_MARKET_URL = "https://raw.githubusercontent.com/Usernametoolongmaximumis39/sgs-ol-toolbox/main/plugins", OSS_MARKET_URL = "https://tools.3gs.xyz/sgs-toolbox/market";

  // src/core/micro-compatibility.js
  function installMicroAPIs(win) {
    for (let proto of [win.Element.prototype, win.DocumentFragment.prototype, win.Document.prototype]) proto.replaceChildren || Object.defineProperty(proto, "replaceChildren", { configurable: !0, writable: !0, value(...nodes) {
      for (; this.firstChild; ) this.removeChild(this.firstChild);
      this.append(...nodes);
    } });
    if (win.Object.hasOwn || Object.defineProperty(win.Object, "hasOwn", { value: (o, k) => win.Object.prototype.hasOwnProperty.call(o, k), configurable: !0, writable: !0 }), win.Array.prototype.at || Object.defineProperty(win.Array.prototype, "at", { value(index) {
      let n = Math.trunc(Number(index) || 0), i = n < 0 ? this.length + n : n;
      return i < 0 || i >= this.length ? void 0 : this[i];
    }, configurable: !0, writable: !0 }), win.structuredClone || (win.structuredClone = (value) => {
      let seen = new win.Map(), clone = (v) => {
        if (typeof v == "function" || typeof v == "symbol" || v instanceof win.Node) throw new win.DOMException("Value cannot be cloned", "DataCloneError");
        if (v === null || typeof v != "object") return v;
        if (seen.has(v)) return seen.get(v);
        let out;
        if (v instanceof win.Date ? out = new win.Date(v) : v instanceof win.RegExp ? out = new win.RegExp(v.source, v.flags) : v instanceof win.ArrayBuffer ? out = v.slice(0) : win.ArrayBuffer.isView(v) ? out = v instanceof win.DataView ? new win.DataView(clone(v.buffer), v.byteOffset, v.byteLength) : new v.constructor(clone(v.buffer), v.byteOffset, v.length) : out = Array.isArray(v) ? [] : v instanceof win.Map ? new win.Map() : v instanceof win.Set ? new win.Set() : {}, seen.set(v, out), v instanceof win.Map) for (let [k, item] of v) out.set(clone(k), clone(item));
        else if (v instanceof win.Set) for (let item of v) out.add(clone(item));
        else if (Array.isArray(v) || Object.getPrototypeOf(v) === win.Object.prototype || Object.getPrototypeOf(v) === null) for (let k of Object.keys(v)) Object.defineProperty(out, k, { value: clone(v[k]), enumerable: !0, configurable: !0, writable: !0 });
        return out;
      };
      return clone(value);
    }), !win.HTMLElement.prototype.showPopover) {
      let matches = win.Element.prototype.matches;
      win.Element.prototype.matches = function(selector) {
        return selector === ":popover-open" ? this.hasAttribute("data-micro-popover-open") : matches.call(this, selector);
      }, win.HTMLElement.prototype.showPopover = function() {
        this.setAttribute("data-micro-popover-open", "");
      }, win.HTMLElement.prototype.hidePopover = function() {
        this.removeAttribute("data-micro-popover-open");
      };
    }
  }
  function splitArguments(text2) {
    let parts = [], depth = 0, start = 0;
    for (let i = 0; i < text2.length; i++)
      text2[i] === "(" ? depth++ : text2[i] === ")" ? depth-- : text2[i] === "," && !depth && (parts.push(text2.slice(start, i).trim()), start = i + 1);
    return parts.push(text2.slice(start).trim()), parts;
  }
  function replaceFunction(text2, name, replace) {
    let start = text2.indexOf(name + "(");
    for (; start >= 0; ) {
      let end = start + name.length + 1, depth = 1;
      for (; end < text2.length && depth; end++)
        text2[end] === "(" ? depth++ : text2[end] === ")" && depth--;
      if (depth) break;
      let result = replace(text2.slice(start + name.length + 1, end - 1));
      text2 = text2.slice(0, start) + result + text2.slice(end), start = text2.indexOf(name + "(", start + result.length);
    }
    return text2;
  }
  function legacyMicroCSS(css, variable, pixel) {
    let color2 = (text2) => pixel(replaceFunction(text2, "var", (body) => {
      let [name, fallback] = splitArguments(body);
      return variable(name) || fallback || "#000";
    }));
    return css = replaceFunction(css, "color-mix", (body) => {
      let [space, a, b] = splitArguments(body);
      if (space !== "in srgb" || !a || !b) return "transparent";
      let parse2 = (text2) => {
        let match = text2.match(/\s+([\d.]+)%$/);
        return { rgba: color2(match ? text2.slice(0, match.index) : text2), weight: match ? Number(match[1]) / 100 : null };
      }, x = parse2(a), y = parse2(b), p = x.weight ?? (y.weight === null ? 0.5 : 1 - y.weight), q = y.weight ?? 1 - p, alpha = x.rgba[3] / 255 * p + y.rgba[3] / 255 * q;
      return `rgba(${[0, 1, 2].map((i) => alpha ? Math.round((x.rgba[i] * x.rgba[3] / 255 * p + y.rgba[i] * y.rgba[3] / 255 * q) / alpha) : 0).join(",")},${alpha})`;
    }), css.replace(/:focus-visible/g, ":focus").replace(/overflow:\s*clip/g, "overflow:hidden").replace(/\binset:\s*([^;}]+)/g, (_, value) => {
      let v = value.trim().split(/\s+/);
      return `top:${v[0]};right:${v[1] || v[0]};bottom:${v[2] || v[0]};left:${v[3] || v[1] || v[0]}`;
    });
  }
  function installMicroCompatibility(win, scope) {
    if (installMicroAPIs(win), win.CSS?.supports("color", "color-mix(in srgb,black,white)")) return;
    let doc = win.document, watched = /* @__PURE__ */ new Map(), canvas = doc.createElement("canvas");
    canvas.width = canvas.height = 1;
    let context = canvas.getContext("2d"), pixel = (value) => (context.clearRect(0, 0, 1, 1), context.fillStyle = "transparent", context.fillStyle = value, context.fillRect(0, 0, 1, 1), context.getImageData(0, 0, 1, 1).data), update = (host) => {
      let root = host.shadowRoot, record = watched.get(host);
      if (!root || !record || !host.isConnected) return;
      let computed = win.getComputedStyle(host), css = [...root.querySelectorAll("style")].filter((el) => el !== record.style).map((el) => el.textContent).join(`
`), output = legacyMicroCSS(css, (name) => computed.getPropertyValue(name).trim(), pixel) + `
[popover]:not([data-micro-popover-open]){display:none!important}[popover][data-micro-popover-open]{display:block;z-index:2147483647}`;
      record.style.textContent !== output && (record.style.textContent = output);
    }, discover = () => {
      for (let [host, record] of watched) host.isConnected || (record.observer.disconnect(), record.style.remove(), watched.delete(host));
      for (let host of doc.querySelectorAll("[data-sgs-toolbox]")) {
        if (!host.shadowRoot || watched.has(host)) continue;
        let style2 = doc.createElement("style");
        style2.dataset.microFallback = "", host.shadowRoot.append(style2);
        let queued = !1, observer = new win.MutationObserver((records) => {
          records.every((r) => r.target === style2 || r.target.parentNode === style2) || queued || (queued = !0, Promise.resolve().then(() => {
            queued = !1, scope.closed || update(host);
          }));
        });
        observer.observe(host, { attributes: !0, attributeFilter: ["style", "data-theme-scheme"] }), observer.observe(host.shadowRoot, { childList: !0, characterData: !0, subtree: !0 }), watched.set(host, { style: style2, observer }), update(host);
      }
    };
    discover(), scope.interval(discover, 250), scope.add(() => {
      for (let { style: style2, observer } of watched.values())
        observer.disconnect(), style2.remove();
      watched.clear();
    });
  }

  // src/core/bundled-plugins.js
  var bundledPackages = [];

  // src/core/resources.js
  var ResourceScope = class {
    constructor() {
      this.controller = new AbortController(), this.signal = this.controller.signal, this.cleanups = [], this.closed = !1;
    }
    add(fn) {
      if (typeof fn != "function") return fn;
      if (this.closed)
        return fn(), () => {
        };
      let alive2 = !0, release = () => {
        if (!alive2) return;
        alive2 = !1;
        let index = this.cleanups.indexOf(release);
        return index >= 0 && this.cleanups.splice(index, 1), fn();
      };
      return this.cleanups.push(release), release;
    }
    listen(target, type, fn, options) {
      return target.addEventListener(type, fn, options), this.add(() => target.removeEventListener(type, fn, options));
    }
    timeout(fn, ms) {
      let release, id = setTimeout(() => {
        release(), this.closed || fn();
      }, ms);
      return release = this.add(() => clearTimeout(id)), id;
    }
    interval(fn, ms) {
      let id = setInterval(() => {
        this.closed || fn();
      }, ms);
      return this.add(() => clearInterval(id)), id;
    }
    patch(target, key, factory) {
      let own3 = Object.getOwnPropertyDescriptor(target, key), original = target[key], changed = factory(original), scope = this, wrapper = function(...args) {
        return Reflect.apply(scope.closed ? original : changed, this, args);
      };
      return target[key] = wrapper, this.add(() => {
        target[key] === wrapper && (own3 ? Object.defineProperty(target, key, own3) : delete target[key]);
      });
    }
    dispose() {
      if (this.closed) return;
      this.closed = !0, this.controller.abort();
      let errors = [];
      for (let fn of [...this.cleanups].reverse())
        try {
          fn();
        } catch (e) {
          errors.push(e);
        }
      return errors;
    }
  };

  // src/core/runtime-owner.js
  var KEY2 = Symbol.for("sgs.ol.toolbox.core");
  function startOwnedRuntime(win, edition, start) {
    let previous = win[KEY2];
    if (previous && (previous.distribution === "dev" || edition !== "dev")) return previous.ready || Promise.resolve(previous);
    previous?.dispose?.();
    let scope = new ResourceScope(), api = { distribution: edition, scope, dispose() {
      scope.dispose(), win[KEY2] === api && delete win[KEY2];
    } };
    return win[KEY2] = api, api.ready = (async () => {
      try {
        await previous?.ready;
      } catch {
      }
      if (scope.closed) return null;
      try {
        return await start(api);
      } catch (error) {
        throw api.dispose(), error;
      }
    })(), api.ready;
  }

  // src/core/storage.js
  var Settings = class _Settings {
    constructor(storage, prefix = "sgstoolbox:") {
      this.storage = storage, this.prefix = prefix;
    }
    get(key, fallback) {
      try {
        let raw = this.storage?.getItem(this.prefix + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    }
    set(key, value) {
      return this.storage?.setItem(this.prefix + key, JSON.stringify(value)), value;
    }
    namespace(id) {
      return new _Settings(this.storage, this.prefix + id + ":");
    }
  }, PackageStore = class {
    constructor(indexedDB, databaseName = "sgs-ol-toolbox") {
      this.indexedDB = indexedDB, this.databaseName = databaseName, this.dbPromise = null;
    }
    open() {
      return this.indexedDB ? (this.dbPromise || (this.dbPromise = new Promise((resolve, reject) => {
        let request = this.indexedDB.open(this.databaseName, 1);
        request.onupgradeneeded = () => request.result.createObjectStore("plugins", { keyPath: "id" }), request.onsuccess = () => resolve(request.result), request.onerror = () => reject(request.error);
      })), this.dbPromise) : Promise.reject(new Error("\u6D4F\u89C8\u5668\u672A\u63D0\u4F9B IndexedDB\uFF0C\u65E0\u6CD5\u4FDD\u5B58\u63D2\u4EF6\u5B89\u88C5\u3002"));
    }
    async list() {
      let db = await this.open();
      return new Promise((resolve, reject) => {
        let req = db.transaction("plugins").objectStore("plugins").getAll();
        req.onsuccess = () => resolve(req.result), req.onerror = () => reject(req.error);
      });
    }
    async put(record) {
      let db = await this.open();
      return new Promise((resolve, reject) => {
        let tx = db.transaction("plugins", "readwrite");
        tx.objectStore("plugins").put(record), tx.oncomplete = () => resolve(), tx.onerror = () => reject(tx.error), tx.onabort = () => reject(tx.error || new Error("\u63D2\u4EF6\u5B58\u50A8\u4E8B\u52A1\u5DF2\u4E2D\u6B62"));
      });
    }
    async delete(id) {
      let db = await this.open();
      return new Promise((resolve, reject) => {
        let tx = db.transaction("plugins", "readwrite");
        tx.objectStore("plugins").delete(id), tx.oncomplete = resolve, tx.onerror = () => reject(tx.error), tx.onabort = () => reject(tx.error);
      });
    }
  };

  // src/core/protocol.js
  var aliases = {
    CardList: ["cardList", "card_list"],
    CardIDs: ["CardIds", "cardIDs", "cardIds", "card_ids", "Cards", "cards", "hand_cards", "card_list", "cardList"],
    CardID: ["CardId", "cardID", "cardId"],
    CardCount: ["cardCount", "card_count"],
    SeatID: ["SeatId", "seatID", "seatId", "seat_id"],
    SeatIndex: ["seatIndex", "seat_id", "seatId", "SeatID"],
    FromID: ["FromId", "fromID", "fromId", "from_id"],
    ToID: ["ToId", "toID", "toId", "to_id"],
    SpellID: ["SpellId", "spellID", "spellId", "spell_id"],
    SrcSeatID: ["SrcSeatId", "srcSeatId", "srcSeatID"],
    TargetSeatID: ["TargetSeatId", "targetSeatID", "targetSeatId"],
    Type: ["type", "opt_type"],
    Param: ["param"],
    Params: ["params"],
    Datas: ["datas", "data"],
    useType: ["UseType"],
    TurnCnt: ["turnCnt", "TurnCount", "turnCount"],
    Round: ["round"],
    isSend: ["IsSend"],
    IsResume: ["isResume"],
    Count: ["count", "hand_count"],
    DestSeatIDs: ["DestSeatIds", "destSeatIds", "Targets"],
    EffectIndex: ["effectIndex"],
    list_card_id: ["listCardId"],
    error_id: ["ErrorID", "errorId", "errCode"],
    userID: ["UserID", "userId"],
    CastSeatID: ["castSeatId"],
    ItemID: ["itemId"],
    ItemParams: ["param"]
  };
  for (let key of ["FromZone", "ToZone", "FromPosition", "ToPosition", "FromZoneParam", "ToZoneParam", "MoveType"])
    aliases[key] = [key[0].toLowerCase() + key.slice(1), key.replace(/[A-Z]/g, (char, index) => (index ? "_" : "") + char.toLowerCase())];
  var schemas = {
    MsgGamePlayCardNtf: ["CardList", "IsResume", "SeatID"],
    PubGsCMoveCard: ["FromID", "FromZone", "FromPosition", "FromZoneParam", "ToID", "ToZone", "ToPosition", "ToZoneParam", "MoveType", "CardIDs", "CardCount", "SpellID"],
    PubGsCUseCard: ["SeatID", "CardID", "CardIDs", "SpellID", "useType"],
    MsgNtfUseCardType: ["CastSeatID", "SpellID", "useType"],
    decodeRogueLikeItemEffectNtf: ["ItemID", "ItemParams", "error_id"],
    PubGsCUseSpell: ["SeatID", "SrcSeatID", "SpellID", "CardIDs", "CardCount", "EffectIndex", "DestSeatIDs"],
    MsgGameTurnNtf: ["SeatID", "TurnCnt"],
    GsCGamephaseNtf: ["SeatID", "Round"],
    MsgGameRoundNtf: ["isPassed"],
    MsgReconnectGame: [],
    MsgReconnectGameHand: ["SeatIndex", "CardIDs", "Count"],
    decodeClientGetCardInfoResp: ["SeatID", "CardIDs", "error_id"],
    decodeGameDealPileTopCardList: ["list_card_id", "IsResume"],
    ClientHappyGetFriendHandcardRep: ["SeatID", "CardIDs", "error_id"],
    SmsgGameSetCharacter: ["Infos"],
    GsCGuoZhanSetCharacter: ["SeatID", "GeneralData"],
    GsCRoleOptTargetNtf: ["SpellID", "SeatID", "SrcSeatID", "TargetSeatID", "Type", "Param", "Params"],
    CGsRoleSpellOptRep: ["SpellID", "SeatID", "Type", "Datas"],
    SmsgGamePlayerDead: ["SeatID"],
    MsgGameOver: [],
    ClientLeavetableRep: [],
    ClientLoginRep: ["userID"]
  }, lists = /* @__PURE__ */ new Set(["CardList", "CardIDs", "DestSeatIDs", "list_card_id", "Infos", "GeneralData", "Params", "Datas", "ItemParams"]), wrappers = ["Protocol", "protocol", "ProtoObj", "protoObj", "Data", "data", "msg", "Msg"], isObservedMessage = (type) => typeof type == "string" && Object.hasOwn(schemas, type), get = (object2, key) => {
    try {
      return object2?.[key];
    } catch {
      return;
    }
  }, scalar = (value) => value === null || ["string", "number", "boolean"].includes(typeof value) ? typeof value == "string" ? value.slice(0, 256) : value : void 0;
  function smallList(value, key) {
    let length = get(value, "length"), cap = key === "Infos" || key === "GeneralData" || key === "DestSeatIDs" ? 32 : 2048;
    if (!Number.isInteger(length) || length < 0 || length > cap) throw new Error(`${key} \u957F\u5EA6\u8D85\u9650\u6216\u65E0\u6548`);
    let result = [];
    for (let i = 0; i < length; i++) {
      let item = get(value, i);
      if (item && typeof item == "object") {
        let fields = key === "Infos" ? ["SeatID", "CharacterID"] : key === "GeneralData" ? ["index", "cardID"] : ["CardId", "CardID", "cardId", "cardID", "id"], record = {};
        for (let field of fields) {
          let val = scalar(get(item, field));
          val !== void 0 && (record[field] = val);
        }
        result.push(record);
      } else result.push(scalar(item));
    }
    return result;
  }
  function projectMessage(type, payload) {
    if (!isObservedMessage(type)) return null;
    if (type === "ClientLoginRep") {
      let userID = scalar(get(payload, "userID") ?? get(payload, "UserID") ?? get(payload, "userId"));
      return userID === void 0 ? {} : { userID };
    }
    let fields = schemas[type];
    if (!fields.length) return {};
    let result = {}, sources = [], queue = [payload], seen = /* @__PURE__ */ new Set();
    for (let i = 0; i < queue.length && i < 12; i++) {
      let source = queue[i];
      if (!(!source || typeof source != "object" || seen.has(source))) {
        seen.add(source), sources.push(source);
        for (let key of wrappers) {
          let value = get(source, key);
          value && typeof value == "object" && queue.length < 12 && queue.push(value);
        }
      }
    }
    for (let key of [...fields, "isSend"]) {
      let empty;
      outer: for (let source of sources) for (let name of [key, ...aliases[key] || []]) {
        let value = get(source, name);
        if (value == null || key === "Datas" && name === "data" && !Array.isArray(value) && !ArrayBuffer.isView(value)) continue;
        let projected = lists.has(key) ? smallList(value, key) : scalar(value);
        if (projected !== void 0) {
          if (Array.isArray(projected) && !projected.length) {
            empty = projected;
            continue;
          }
          result[key] = projected;
          break outer;
        }
      }
      !(key in result) && empty && (result[key] = empty);
    }
    return result;
  }

  // src/core/session.js
  var WRAPPERS = /* @__PURE__ */ new Set(["Protocol", "protocol", "ProtoObj", "protoObj", "Data", "data", "msg", "Msg"]);
  function packetBody(payload) {
    let queue = [payload], seen = /* @__PURE__ */ new Set(), body = {};
    for (let i = 0; i < queue.length && i < 32; i++) {
      let source = queue[i];
      if (!(!source || typeof source != "object" || seen.has(source))) {
        seen.add(source);
        for (let [key, value] of Object.entries(source))
          WRAPPERS.has(key) && value && typeof value == "object" ? queue.push(value) : (!(key in body) || body[key] == null || Array.isArray(body[key]) && !body[key].length) && (body[key] = value);
      }
    }
    return body;
  }
  function canonicalBody(value) {
    return Array.isArray(value) ? value.map(canonicalBody) : !value || typeof value != "object" ? value : Object.fromEntries(Object.keys(value).filter((key) => !key.startsWith("_") && !["ClassName", "className"].includes(key)).sort().map((key) => [key, canonicalBody(value[key])]));
  }
  function copy(value, depth = 0, seen = /* @__PURE__ */ new WeakSet(), budget = { remaining: 8192 }) {
    if (--budget.remaining < 0) return;
    if (value === null || typeof value == "string" || typeof value == "boolean" || typeof value == "number") return value;
    if (typeof value != "object" || depth > 8 || seen.has(value)) return;
    seen.add(value);
    let result = Array.isArray(value) ? [] : {};
    for (let key of Object.keys(value).slice(0, 4096)) {
      if (budget.remaining <= 0) break;
      if (["__proto__", "prototype", "constructor"].includes(key)) continue;
      let descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !("value" in descriptor)) continue;
      let item = copy(descriptor.value, depth + 1, seen, budget);
      item !== void 0 && (result[key] = item);
    }
    return seen.delete(value), result;
  }
  var SessionJournal = class {
    constructor() {
      this.sessionId = 1, this.seq = 0, this.events = [], this.listeners = /* @__PURE__ */ new Set(), this.incomplete = !0;
    }
    push(type, payload, at = Date.now()) {
      payload = copy(payload);
      let body = packetBody(payload), lists2 = [body.CardList, body.cardList, body.card_list], deck = lists2.find((value) => value?.length > 0) ?? lists2.find((value) => value != null), hasDeck = deck && typeof deck == "object" && Number.isInteger(deck.length) && deck.length >= 0 && deck.length <= 1e4;
      type === "MsgGamePlayCardNtf" && hasDeck && (this.sessionId++, this.events = [], this.incomplete = !deck.length || !!(body.IsResume ?? body.isResume)), (/Reconnect/.test(type) || type === "toolbox:gap") && (this.incomplete = !0);
      let event = { seq: ++this.seq, sessionId: this.sessionId, type, payload, at };
      this.events.push(event);
      for (let fn of this.listeners)
        try {
          fn(event);
        } catch {
        }
      return event;
    }
    subscribe(fn) {
      return this.listeners.add(fn), () => this.listeners.delete(fn);
    }
    snapshot() {
      return { sessionId: this.sessionId, seq: this.seq, incomplete: this.incomplete, events: this.events.slice() };
    }
  };
  function installMessageBridge(win, journal, scope, onStatus = () => {
  }, { getTargets = () => [], observeType = () => {
  } } = {}) {
    let activeWrapper, restoreCurrent, depth = 0, consoleError = "", nativeErrors = [], native = /* @__PURE__ */ new Map(), restores = [], stats = { received: 0, console: 0, native: 0, lastType: "", lastAt: null }, duplicates = /* @__PURE__ */ new Map(), expiryTimer, pending = [], waiters = [], drainTimer, draining = !1;
    stats.dropped = 0, stats.rejected = 0;
    function schedule() {
      !drainTimer && !scope.closed && (drainTimer = setTimeout(drain, 0));
    }
    function drain() {
      if (drainTimer = null, scope.closed) return;
      draining = !0;
      let started = performance.now(), count = 0;
      for (; pending.length && count++ < 16 && performance.now() - started < 4; ) {
        let event = pending.shift();
        try {
          journal.push(event.type, event.payload, event.at);
        } catch {
          stats.rejected++;
        }
      }
      if (draining = !1, pending.length) schedule();
      else for (let resolve of waiters.splice(0)) resolve();
    }
    function queue(type, payload, at = Date.now()) {
      pending.length >= 512 ? (stats.dropped += pending.length + 1, pending.length = 0, pending.push({ type: "toolbox:gap", payload: { reason: "\u6D88\u606F\u7A81\u53D1\u8D85\u8FC7\u5904\u7406\u4E0A\u9650\uFF0C\u5DF2\u505C\u6B62\u8FFD\u8865\u8BE5\u6279\u8BB0\u5F55" }, at })) : pending.push({ type, payload, at }), schedule();
    }
    function receive(type, data, source) {
      if (scope.closed) return;
      try {
        observeType(type, source, isObservedMessage(type));
      } catch {
      }
      if (!isObservedMessage(type)) return;
      let payload;
      try {
        payload = projectMessage(type, data);
      } catch {
        stats.rejected++, queue("toolbox:gap", { reason: "\u5361\u724C\u6D88\u606F\u5B57\u6BB5\u8D85\u51FA\u652F\u6301\u8303\u56F4\uFF0C\u5DF2\u8DF3\u8FC7\u8BE5\u6761\u8BB0\u5F55" });
        return;
      }
      if (payload?.isSend) return;
      let signature = type + ":" + JSON.stringify(canonicalBody(payload)), entry = duplicates.get(signature);
      entry || (duplicates.size >= 2048 && (duplicates.clear(), queue("toolbox:gap", { reason: "\u77ED\u65F6\u95F4\u6D88\u606F\u8FC7\u591A\uFF0C\u53BB\u91CD\u7A97\u53E3\u5DF2\u91CD\u5EFA" })), duplicates.set(signature, entry = { sources: /* @__PURE__ */ new Map(), max: 0 }));
      let count = (entry.sources.get(source) || 0) + 1;
      entry.sources.set(source, count), !(count <= entry.max) && (entry.max = count, expiryTimer || (expiryTimer = setTimeout(() => {
        duplicates.clear(), expiryTimer = null;
      }, 0)), stats.received++, stats[source === "console" ? "console" : "native"]++, stats.lastType = type, stats.lastAt = Date.now(), queue(type, payload, stats.lastAt));
    }
    let installConsole = () => {
      if (scope.closed || win.console.log === activeWrapper) return;
      let original = win.console.log, descriptor = Object.getOwnPropertyDescriptor(win.console, "log"), wrapper = function(...args) {
        if (scope.closed) return Reflect.apply(original, this, args);
        let outer = depth++ === 0;
        try {
          if (outer)
            try {
              let prefix = args.filter((x) => typeof x == "string").join(" ");
              if (!/\bsend\b|发送/i.test(prefix)) for (let i = args.length - 1; i >= 0; i--) {
                let data = args[i], type = data?.ClassName || data?.className;
                if (typeof type == "string" && (receive(type, data, "console"), isObservedMessage(type)))
                  break;
              }
            } catch {
              try {
                onStatus("\u6D88\u606F\u683C\u5F0F\u65E0\u6CD5\u89E3\u6790");
              } catch {
              }
            }
          return Reflect.apply(original, this, args);
        } finally {
          depth--;
        }
      };
      try {
        if (!descriptor || descriptor.configurable ? Object.defineProperty(win.console, "log", { value: wrapper, writable: !0, configurable: !0, enumerable: descriptor?.enumerable ?? !0 }) : "value" in descriptor && descriptor.writable && (win.console.log = wrapper), win.console.log !== wrapper) throw new Error("\u65E5\u5FD7\u5165\u53E3\u88AB\u4E0D\u53EF\u914D\u7F6E\u7684\u65E7\u811A\u672C\u9501\u5B9A");
        activeWrapper = wrapper, consoleError = "", restoreCurrent = () => {
          win.console.log === wrapper && (descriptor ? Object.defineProperty(win.console, "log", descriptor) : delete win.console.log);
        };
      } catch (error) {
        consoleError = `\u65E5\u5FD7\u63A5\u5165\u5931\u8D25\uFF1A${error.message}`;
        try {
          onStatus(consoleError);
        } catch {
        }
      }
    };
    function installNative() {
      if (scope.closed) return;
      nativeErrors = [];
      let targets;
      try {
        targets = getTargets() || [];
      } catch {
        targets = [];
      }
      let live = /* @__PURE__ */ new Set();
      for (let { name, target } of targets)
        if (!(!target || typeof target.event != "function" || live.has(target)) && (live.add(target), native.get(target)?.wrapper !== target.event))
          try {
            let descriptor = Object.getOwnPropertyDescriptor(target, "event"), original = target.event, entry = { name, wrapper: null, active: !0 }, wrapper = function(...args) {
              if (!scope.closed && entry.active) try {
                let [eventName, data] = args, packet2 = Array.isArray(data) && data.length === 1 && typeof data[0] == "object" ? data[0] : data, type = isObservedMessage(eventName) || /^(?:Msg|PubGs|Smsg|GsC|CGs|decode|Client)/.test(eventName) ? eventName : packet2?.ClassName || packet2?.className;
                receive(type, packet2, `native:${name}`);
              } catch {
              }
              return Reflect.apply(original, this, args);
            };
            if (!descriptor || descriptor.configurable ? Object.defineProperty(target, "event", { value: wrapper, writable: !0, configurable: !0, enumerable: descriptor?.enumerable ?? !0 }) : "value" in descriptor && descriptor.writable && (target.event = wrapper), target.event !== wrapper) throw new Error("\u4E8B\u4EF6\u5165\u53E3\u4E0D\u53EF\u5199");
            entry.wrapper = wrapper, native.get(target)?.release();
            let release = () => {
              entry.active = !1, target.event === wrapper && (descriptor ? Object.defineProperty(target, "event", descriptor) : delete target.event);
            };
            entry.release = release, native.set(target, entry), restores.push(release);
          } catch (error) {
            nativeErrors.push(`${name}: ${error.message}`);
          }
      for (let [target, entry] of native) live.has(target) || (entry.release(), native.delete(target));
    }
    let check = () => {
      installConsole(), installNative();
    };
    return check(), scope.interval(check, 500), scope.add(() => {
      clearTimeout(expiryTimer), clearTimeout(drainTimer), pending.length = 0;
      for (let resolve of waiters.splice(0)) resolve();
      duplicates.clear();
      for (let release of restores.reverse()) release();
      restoreCurrent?.(), native.clear();
    }), {
      check,
      get error() {
        return native.size ? "" : [consoleError, ...nativeErrors].filter(Boolean).join("\uFF1B");
      },
      flush: () => scope.closed || !pending.length && !draining ? Promise.resolve() : new Promise((resolve) => {
        waiters.push(resolve), schedule();
      }),
      getStatus: () => ({ ...stats, pending: pending.length, targets: [...native.values()].map((entry) => entry.name), errors: [consoleError, ...nativeErrors].filter(Boolean) })
    };
  }

  // src/core/card-atlas.js
  var HASH = /^[a-f0-9]{64}$/;
  function resource(value) {
    if (value?.fallbackUrls !== void 0 && (!Array.isArray(value.fallbackUrls) || value.fallbackUrls.length > 3)) throw new Error("\u5361\u56FE\u5907\u7528\u5730\u5740\u6700\u591A 3 \u4E2A");
    let urls = [value?.url, ...value?.fallbackUrls || []].map((address) => {
      let url = new URL(address);
      if (!(url.protocol === "http:" && url.hostname === "127.0.0.1") && url.protocol !== "https:" || url.username || url.password || url.hash || !HASH.test(value?.sha256)) throw new Error("\u5361\u56FE\u8D44\u6E90\u987B\u4E3A HTTPS \u6216\u672C\u673A 127.0.0.1 \u5730\u5740\u5E76\u58F0\u660E SHA-256");
      return url.href;
    });
    if (new Set(urls).size !== urls.length) throw new Error("\u5361\u56FE\u5907\u7528\u5730\u5740\u4E0D\u80FD\u91CD\u590D");
    return Object.freeze({ url: urls[0], sha256: value.sha256, fallbackUrls: Object.freeze(urls.slice(1)) });
  }
  function validateCardAtlas(value) {
    if (!value || !Array.isArray(value.pages) || !value.pages.length || value.pages.length > 4 || typeof value.source != "string" || !value.source.trim() || value.source.length > 500) throw new Error("\u5361\u56FE\u6765\u6E90\u6216\u56FE\u7247\u6E05\u5355\u65E0\u6548");
    if (value.backImage !== void 0 && (typeof value.backImage != "string" || value.backImage.length > 1024 * 1024 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.backImage))) throw new Error("\u5361\u80CC\u987B\u4E3A\u4E0D\u8D85\u8FC7 1 MiB \u7684\u5185\u5D4C PNG");
    let pixelRatio = value.pixelRatio ?? 1;
    if (!Number.isInteger(pixelRatio) || pixelRatio < 1 || pixelRatio > 3) throw new Error("\u5361\u56FE\u50CF\u7D20\u500D\u7387\u987B\u4E3A 1\u30012 \u6216 3");
    if (value.previewImage !== void 0 && (typeof value.previewImage != "string" || value.previewImage.length > 160 * 1024 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.previewImage))) throw new Error("\u5361\u9762\u9884\u89C8\u987B\u4E3A\u5185\u5D4C PNG\uFF0C\u4E14\u4E0D\u8D85\u8FC7 160 KiB");
    if (value.replaceCards !== void 0 && (!Array.isArray(value.replaceCards) || value.replaceCards.length > 2048 || value.replaceCards.some((name) => typeof name != "string" || !/^[A-Za-z][A-Za-z0-9_]{0,95}$/.test(name)) || new Set(value.replaceCards).size !== value.replaceCards.length)) throw new Error("\u5DEE\u5F02\u5361\u9762\u6E05\u5355\u65E0\u6548");
    return Object.freeze({
      index: resource(value.index),
      pages: Object.freeze(value.pages.map(resource)),
      source: value.source,
      backImage: value.backImage,
      previewImage: value.previewImage,
      pixelRatio,
      replaceCards: value.replaceCards === void 0 ? null : Object.freeze([...value.replaceCards]),
      preview: /^[A-Za-z][A-Za-z0-9_]{0,95}$/.test(value.preview) ? value.preview : "Sha"
    });
  }
  function cardFrameName(name) {
    return typeof name == "string" && /^[A-Za-z][A-Za-z0-9_]{0,95}$/.test(name) ? name + "_png.png" : null;
  }
  function parseCardFrames(index, pages, descriptor) {
    if (!index?.frames || typeof index.frames != "object" || Object.keys(index.frames).length > 2048) throw new Error("\u5361\u56FE\u7D22\u5F15\u65E0\u6548\u6216\u8D85\u9650");
    let names = index.meta?.image?.split(",");
    if (!names || names.length !== pages.length || names.some((name, i) => name !== new URL(descriptor.pages[i].url).pathname.split("/").at(-1))) throw new Error("\u5361\u56FE\u56FE\u7247\u6E05\u5355\u4E0D\u5339\u914D");
    let result = /* @__PURE__ */ new Map(), ratio = descriptor.pixelRatio ?? 1, width = 135 * ratio, height = 190 * ratio;
    for (let [key, item] of Object.entries(index.frames)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,95}_png\.png$/.test(key) || item.rotated || item.trimmed) continue;
      let f = item.frame, size = item.sourceSize, offset = item.spriteSourceSize, page = pages[f?.idx ?? 0];
      !f || !page || ![f.x, f.y, f.w, f.h, f.idx ?? 0].every(Number.isInteger) || f.x < 0 || f.y < 0 || f.w !== width || f.h !== height || size?.w !== width || size?.h !== height || offset?.x !== 0 || offset?.y !== 0 || f.x + f.w > page.width || f.y + f.h > page.height || result.set(key, Object.freeze({ ...f, idx: f.idx ?? 0 }));
    }
    if (!result.size) throw new Error("\u56FE\u96C6\u4E2D\u6CA1\u6709\u53EF\u7528\u7684\u5B8C\u6574\u5361\u56FE");
    return result;
  }
  async function verifiedBytesAt(win, spec, signal, limit2) {
    let response = await win.fetch(spec.url, { credentials: "omit", redirect: "error", signal });
    if (!response.ok || response.url && response.url !== spec.url) throw new Error(`\u5361\u56FE\u4E0B\u8F7D\u5931\u8D25\u6216\u91CD\u5B9A\u5411\uFF1A${spec.url}\uFF08HTTP ${response.status}\uFF09`);
    if (Number(response.headers.get("content-length")) > limit2) throw new Error("\u5361\u56FE\u8D44\u6E90\u8D85\u8FC7\u5927\u5C0F\u9650\u5236");
    let reader = response.body.getReader(), chunks = [], length = 0;
    try {
      for (; ; ) {
        let { value, done } = await reader.read();
        if (done) break;
        if (length += value.length, length > limit2) throw new Error("\u5361\u56FE\u8D44\u6E90\u8D85\u8FC7\u5927\u5C0F\u9650\u5236");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    let bytes = new Uint8Array(length), at = 0;
    for (let chunk of chunks)
      bytes.set(chunk, at), at += chunk.length;
    if ([...new Uint8Array(await win.crypto.subtle.digest("SHA-256", bytes))].map((n) => n.toString(16).padStart(2, "0")).join("") !== spec.sha256) throw new Error("\u5361\u56FE\u8D44\u6E90 SHA-256 \u4E0D\u5339\u914D\uFF1A" + spec.url);
    return bytes;
  }
  async function verifiedBytes(win, spec, signal, limit2, timeoutMs) {
    let failures = [];
    for (let url of [spec.url, ...spec.fallbackUrls || []]) {
      if (signal.aborted) throw signal.reason || new Error("\u5361\u56FE\u52A0\u8F7D\u5DF2\u53D6\u6D88");
      let controller = new AbortController(), cancel = () => controller.abort(signal.reason);
      signal.addEventListener("abort", cancel, { once: !0 });
      let timer, interrupted = new Promise((_, reject) => {
        controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: !0 }), timer = setTimeout(() => controller.abort(new Error("\u5361\u56FE\u4E0B\u8F7D\u8D85\u65F6\uFF1A" + url)), timeoutMs);
      });
      try {
        return await Promise.race([verifiedBytesAt(win, { ...spec, url }, controller.signal, limit2), interrupted]);
      } catch (error) {
        if (signal.aborted) throw signal.reason || error;
        failures.push(`${url}\uFF1A${error.message}`);
      } finally {
        clearTimeout(timer), signal.removeEventListener("abort", cancel);
      }
    }
    throw new Error(failures.join(`
`));
  }
  async function loadCardAtlas(win, descriptor, signal, { timeoutMs = 15e3 } = {}) {
    let index = JSON.parse(new TextDecoder().decode(await verifiedBytes(win, descriptor.index, signal, 524288, timeoutMs))), pages = [];
    try {
      for (let spec of descriptor.pages) {
        let bytes = await verifiedBytes(win, spec, signal, 8388608, timeoutMs);
        if (bytes[0] !== 137 || String.fromCharCode(...bytes.slice(1, 4)) !== "PNG") throw new Error("\u5361\u56FE\u4E0D\u662F PNG \u56FE\u7247");
        let dimensions = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (bytes.length < 24 || dimensions.getUint32(16) > 4096 || dimensions.getUint32(20) > 4096) throw new Error("\u5361\u56FE\u5C3A\u5BF8\u8D85\u9650");
        let bitmap = await win.createImageBitmap(new win.Blob([bytes], { type: "image/png" }));
        if (pages.push(bitmap), signal.aborted) throw new Error("\u5361\u56FE\u52A0\u8F7D\u5DF2\u53D6\u6D88");
      }
      return { pages, frames: parseCardFrames(index, pages, descriptor), dispose() {
        for (let page of pages) page.close();
      } };
    } catch (error) {
      for (let page of pages) page.close();
      throw error;
    }
  }

  // src/core/card-styles.js
  var COLOR = /^#[0-9a-f]{6}$/i, own = (node, key) => node && Object.getOwnPropertyDescriptor(node, key)?.value, CARD_LISTS = ["_children", "cardUis", "cardUIs", "cardUiList", "cardUIList", "virtualCardUis", "tempHandCardUis", "additionalCardUis", "muniuCardUis", "stateCardUis", "pileCardUis", "seatUIs"], CARD_NODES = ["cardContainer", "seatContainer", "SelfSeatUi", "selfSeatUI", "desktopCardContainer", "discardCardContainer", "cardUi", "cardUI"], isCardUI = (node) => node && !node.destroyed && node.bmpFace && typeof node.SetCardFace == "function" && typeof node.getCardFaceBaseTexture == "function" && typeof node.updateNewCardFace == "function";
  function findNativeCardTexture(L, name) {
    if (!/^card(?:Face|Back)_\d{1,5}$/.test(name)) return null;
    let valid = (t) => t?.bitmap && !t.destroyed && !t.bitmap.destroyed && t.width > 0 && t.height > 0, direct = L?.loader?.getRes?.(name);
    if (valid(direct)) return direct;
    for (let cache2 of [L?.Loader?.textureMap, L?.Loader?.loadedMap, L?.Loader?._loadedMap])
      for (let key of Object.keys(cache2 || {}).slice(0, 6e4)) {
        if (key.split("?")[0].split("/").at(-1) !== name + ".png") continue;
        let texture = cache2[key]?.bitmap ? cache2[key] : L?.loader?.getRes?.(key);
        if (valid(texture)) return texture;
      }
    return null;
  }
  function drawCardStyle(doc, palette, back = !1) {
    let canvas = doc.createElement("canvas");
    canvas.width = 186, canvas.height = 260;
    let c = canvas.getContext("2d"), gradient = c.createLinearGradient(0, 0, 186, 260);
    if (gradient.addColorStop(0, palette.light), gradient.addColorStop(0.48, palette.base), gradient.addColorStop(1, palette.light), c.fillStyle = gradient, c.fillRect(0, 0, 186, 260), c.strokeStyle = palette.edge, c.lineWidth = 3, c.strokeRect(3, 3, 180, 254), c.lineWidth = 1, c.strokeRect(9, 9, 168, 242), back) {
      c.fillStyle = palette.ink, c.fillRect(15, 15, 156, 230), c.strokeStyle = palette.base, c.globalAlpha = 0.25;
      for (let x = -230; x < 190; x += 16)
        c.beginPath(), c.moveTo(Math.max(16, x), Math.max(16, 16 - x)), c.lineTo(Math.min(170, x + 230), Math.min(244, 244 + x)), c.stroke();
      c.globalAlpha = 1, c.lineWidth = 2, c.beginPath(), c.moveTo(93, 60), c.lineTo(145, 130), c.lineTo(93, 200), c.lineTo(41, 130), c.closePath(), c.fill(), c.stroke(), c.beginPath(), c.arc(93, 130, 32, 0, Math.PI * 2), c.stroke(), c.fillStyle = palette.light, c.font = "bold 35px serif", c.textAlign = "center", c.textBaseline = "middle", c.fillText("\u6740", 93, 131);
    } else {
      c.fillStyle = palette.light, c.globalAlpha = 0.65, c.fillRect(13, 13, 160, 234), c.globalAlpha = 1;
      for (let [x, y, dx, dy] of [[15, 15, 1, 1], [171, 15, -1, 1], [15, 245, 1, -1], [171, 245, -1, -1]])
        c.beginPath(), c.moveTo(x, y + dy * 16), c.lineTo(x, y), c.lineTo(x + dx * 16, y), c.stroke();
    }
    return canvas;
  }
  var CardStyleRegistry = class {
    constructor({ window: win, document: doc, game, settings, scope }) {
      Object.assign(this, { win, doc, game, settings, scope }), this.styles = /* @__PURE__ */ new Map(), this.listeners = /* @__PURE__ */ new Set(), this.textures = /* @__PURE__ */ new Map(), this.bindings = /* @__PURE__ */ new Map(), this.nativeResources = /* @__PURE__ */ new Map(), this.nativeAttempts = /* @__PURE__ */ new Map(), this.previews = /* @__PURE__ */ new WeakMap(), this.factories = /* @__PURE__ */ new Map(), this.pools = /* @__PURE__ */ new Map(), this.insertions = /* @__PURE__ */ new Map(), this.selfModels = /* @__PURE__ */ new WeakSet(), this.selfIds = /* @__PURE__ */ new Set(), this.selfHand = null, this.scene = null, this.atlases = /* @__PURE__ */ new Map(), this.backImages = /* @__PURE__ */ new Map(), this.status = "\u8DDF\u968F\u6E38\u620F\u539F\u59CB\u5916\u89C2", this.closed = !1, scope.interval(() => this.refreshNative(), 400), game.onSceneChange && scope.add(game.onSceneChange(() => this.refreshNative())), scope.add(() => {
        this.closed = !0, this.restore(), this.clearTextures(), this.nativeResources.clear(), this.nativeAttempts.clear(), this.listeners.clear();
      });
    }
    register(style2, owner) {
      if (this.closed) return () => {
      };
      if (!style2?.id?.startsWith(owner + ".") || !/^[a-z][a-z0-9.-]{0,63}$/.test(style2.id) || this.styles.has(style2.id)) throw new Error("\u5361\u724C\u6837\u5F0F ID \u65E0\u6548\u6216\u5DF2\u6CE8\u518C");
      if (typeof style2.name != "string" || !style2.name.trim() || style2.name.length > 48) throw new Error("\u5361\u724C\u6837\u5F0F\u540D\u79F0\u65E0\u6548");
      if (style2.backName !== void 0 && (typeof style2.backName != "string" || !style2.backName.trim() || style2.backName.length > 48 || /[\r\n]/.test(style2.backName))) throw new Error("\u5361\u80CC\u540D\u79F0\u65E0\u6548");
      let cleaned = { id: style2.id, name: style2.name, ...style2.backName === void 0 ? {} : { backName: style2.backName } };
      if (style2.atlas) {
        if (style2.native || style2.face || style2.back) throw new Error("\u5B8C\u6574\u5361\u56FE\u4E0E\u5E95\u7EB9\u4E0D\u80FD\u6DF7\u7528");
        cleaned.atlas = validateCardAtlas(style2.atlas);
      } else if (style2.native) {
        if (style2.face || style2.back || !/^cardFace_\d{1,5}$/.test(style2.native.face) || !/^cardBack_\d{1,5}$/.test(style2.native.back)) throw new Error("\u539F\u751F\u5361\u724C\u8D44\u6E90\u540D\u79F0\u65E0\u6548");
        cleaned.native = Object.freeze({ face: style2.native.face, back: style2.native.back });
      } else for (let side of ["face", "back"]) {
        cleaned[side] = {};
        for (let key of ["base", "light", "edge", "ink"]) {
          if (!COLOR.test(style2[side]?.[key])) throw new Error("\u5361\u724C\u6837\u5F0F\u989C\u8272\u987B\u4E3A\u516D\u4F4D\u5341\u516D\u8FDB\u5236\u503C");
          cleaned[side][key] = style2[side][key];
        }
        Object.freeze(cleaned[side]);
      }
      this.styles.set(style2.id, Object.freeze(cleaned)), this.refreshNative(), this.emit();
      let released = !1;
      return () => {
        released || (released = !0, this.styles.delete(style2.id), this.restore(), this.clearTextures(style2.id), this.refreshNative(), this.emit());
      };
    }
    list() {
      return [...this.styles.values()];
    }
    get current() {
      return this.settings.get("cardStyle", "");
    }
    get selection() {
      return { face: this.settings.get("cardFaceStyle", this.current), back: this.settings.get("cardBackStyle", this.current), scope: this.settings.get("cardStyleScope", "all") };
    }
    selectSide(side, id) {
      if (!["face", "back"].includes(side)) throw new Error("\u65E0\u6548\u5361\u724C\u9762");
      if (id && !this.styles.has(id)) throw new Error("\u5361\u724C\u6837\u5F0F\u5C1A\u672A\u542F\u7528");
      if (side === "back" && this.styles.get(id)?.atlas && !this.styles.get(id).atlas.backImage) throw new Error("\u6B64\u5957\u88C5\u4EC5\u63D0\u4F9B\u5361\u9762");
      this.settings.set(side === "face" ? "cardFaceStyle" : "cardBackStyle", id), this.restore(), this.refreshNative(), this.emit();
    }
    selectScope(value) {
      if (!["self", "all"].includes(value)) throw new Error("\u65E0\u6548\u5E94\u7528\u8303\u56F4");
      this.settings.set("cardStyleScope", value), this.restore(), this.refreshNative(), this.emit();
    }
    cardId(card) {
      return card?.CardId ?? card?.CardID ?? card?.id;
    }
    rememberSelf(card) {
      if (!card || typeof card != "object") return;
      this.selfModels.add(card);
      let id = this.cardId(card);
      Number.isInteger(id) && id > 0 && this.selfIds.add(id);
    }
    isSelfCard(ui) {
      let card = ui.theCard;
      return (this.selfHand?.cardUis?.includes(ui) || this.selfHand?.cardUIs?.includes(ui) || this.selfHand?.cardUiList?.includes(ui)) && this.rememberSelf(card), this.selfModels.has(card) || this.selfIds.has(this.cardId(card));
    }
    select(id) {
      if (id && !this.styles.has(id)) throw new Error("\u5361\u724C\u6837\u5F0F\u5C1A\u672A\u542F\u7528");
      this.settings.set("cardStyle", id), this.settings.set("cardFaceStyle", id), (!this.styles.get(id)?.atlas || this.styles.get(id).atlas.backImage) && this.settings.set("cardBackStyle", id), this.restore(), this.refreshNative(), this.emit();
    }
    subscribe(fn) {
      return this.listeners.add(fn), () => this.listeners.delete(fn);
    }
    emit() {
      for (let fn of [...this.listeners])
        try {
          fn();
        } catch (e) {
          console.warn("[\u5361\u724C\u6837\u5F0F]", e);
        }
    }
    setStatus(value) {
      this.status !== value && (this.status = value, this.emit());
    }
    clearTextures(id) {
      for (let [key, image] of this.backImages) (!id || key === id) && (image.onload = image.onerror = null, image.src = "", this.backImages.delete(key));
      for (let [key, entry] of this.atlases) (!id || key === id) && (entry.controller.abort(), entry.data?.dispose(), this.atlases.delete(key));
      for (let [key, texture] of this.textures) (!id || key.startsWith(id + ":")) && (texture.destroy(!0), this.textures.delete(key));
    }
    ensureAtlas(style2) {
      if (this.atlases.has(style2.id)) return this.atlases.get(style2.id);
      let controller = new AbortController(), entry = { controller, data: null, error: "", loading: !0 };
      this.atlases.set(style2.id, entry);
      let timer = setTimeout(() => controller.abort(), 2e4);
      return loadCardAtlas(this.win, style2.atlas, controller.signal).then((data) => {
        if (this.closed || this.atlases.get(style2.id) !== entry || controller.signal.aborted) {
          data.dispose();
          return;
        }
        entry.data = data;
      }).catch((error) => {
        this.atlases.get(style2.id) === entry && (entry.error = controller.signal.aborted ? "\u5361\u56FE\u52A0\u8F7D\u8D85\u65F6\u6216\u5DF2\u53D6\u6D88" : error.message);
      }).finally(() => {
        clearTimeout(timer), entry.loading = !1, !this.closed && this.atlases.get(style2.id) === entry && (this.refreshNative(), this.emit());
      }), entry;
    }
    retry() {
      let id = this.selection.face;
      this.atlases.get(id)?.error && (this.clearTextures(id), this.refreshNative(), this.emit());
    }
    atlasCanvas(style2, name) {
      let data = this.atlases.get(style2.id)?.data, frame = data?.frames.get(cardFrameName(name));
      if (!frame) return null;
      let canvas = this.doc.createElement("canvas");
      return canvas.width = frame.w, canvas.height = frame.h, canvas.getContext("2d").drawImage(data.pages[frame.idx], frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h), canvas;
    }
    atlasTexture(style2, ui, size) {
      if (ui.isNewCardUI !== !0 && ui.IsYiCard) return null;
      let name = ui.theCard?.ResName, frame = cardFrameName(name);
      if (!frame || style2.atlas.replaceCards && !style2.atlas.replaceCards.includes(name)) return null;
      let width = size?.width || 93, height = size?.height || 130, key = style2.id + ":card:" + frame + ":" + width + "x" + height;
      if (!this.textures.has(key)) {
        let canvas = this.atlasCanvas(style2, name);
        if (!canvas) return null;
        let bitmap = new this.win.Laya.Texture2D(canvas.width, canvas.height);
        bitmap.loadImageSource(canvas);
        let texture = new this.win.Laya.Texture(bitmap);
        texture.width = texture.sourceWidth = width, texture.height = texture.sourceHeight = height, this.textures.set(key, texture);
      }
      return this.textures.get(key);
    }
    nativeTexture(name, immediate = !1) {
      let cached = this.nativeResources.get(name);
      if (cached && !cached.destroyed && !cached.bitmap?.destroyed) return cached;
      if (this.nativeResources.delete(name), !immediate && Date.now() - (this.nativeAttempts.get(name) || 0) < 1e3) return null;
      this.nativeAttempts.set(name, Date.now());
      let texture;
      try {
        texture = findNativeCardTexture(this.win.Laya, name);
      } catch {
        return null;
      }
      return texture && this.nativeResources.set(name, texture), texture;
    }
    preview(style2, back) {
      if (style2.atlas) {
        if (back) {
          if (!style2.atlas.backImage) return null;
          let image = this.doc.createElement("img");
          return image.src = style2.atlas.backImage, image.alt = "", image.width = 135, image.height = 190, image;
        }
        if (style2.atlas.previewImage) {
          let image = this.doc.createElement("img");
          return image.src = style2.atlas.previewImage, image.alt = "", image.width = 135, image.height = 190, image;
        }
        return this.atlasCanvas(style2, style2.atlas.preview);
      }
      if (!style2.native) return drawCardStyle(this.doc, back ? style2.back : style2.face, back);
      let texture = this.nativeTexture(style2.native[back ? "back" : "face"]);
      if (!texture?.getTexturePixels) return null;
      try {
        let original = this.previews.get(texture);
        if (!original) {
          let width = Math.ceil(texture.sourceWidth || texture.width), height = Math.ceil(texture.sourceHeight || texture.height);
          if (width < 1 || height < 1 || width > 1024 || height > 1024) return null;
          let pixels = texture.getTexturePixels(0, 0, width, height);
          if (!pixels || pixels.length !== width * height * 4) return null;
          original = this.doc.createElement("canvas"), original.width = width, original.height = height;
          let c = original.getContext("2d"), data = c.createImageData(width, height);
          data.data.set(pixels), c.putImageData(data, 0, 0), this.previews.set(texture, original);
        }
        let canvas = this.doc.createElement("canvas");
        return canvas.width = original.width, canvas.height = original.height, canvas.getContext("2d").drawImage(original, 0, 0), canvas;
      } catch {
        return null;
      }
    }
    texture(style2, back, immediate = !1) {
      if (style2.atlas) {
        if (!back || !style2.atlas.backImage) return null;
        let image = this.backImages.get(style2.id);
        if (image || (image = new this.win.Image(), this.backImages.set(style2.id, image), image.onload = () => {
          !this.closed && this.backImages.get(style2.id) === image && (this.refreshNative(), this.emit());
        }, image.src = style2.atlas.backImage), !image.complete || image.naturalWidth !== 405 || image.naturalHeight !== 570) return null;
        let key2 = style2.id + ":back";
        if (!this.textures.has(key2)) {
          let bitmap = new this.win.Laya.Texture2D(405, 570);
          bitmap.loadImageSource(image);
          let texture = new this.win.Laya.Texture(bitmap);
          texture.width = texture.sourceWidth = 93, texture.height = texture.sourceHeight = 130, this.textures.set(key2, texture);
        }
        return this.textures.get(key2);
      }
      if (style2.native) return this.nativeTexture(style2.native[back ? "back" : "face"], immediate);
      let key = style2.id + ":" + back;
      if (!this.textures.has(key)) {
        let canvas = drawCardStyle(this.doc, back ? style2.back : style2.face, back), bitmap = new this.win.Laya.Texture2D(canvas.width, canvas.height);
        bitmap.loadImageSource(canvas);
        let texture = new this.win.Laya.Texture(bitmap);
        texture.width = 93, texture.height = 130, this.textures.set(key, texture);
      }
      return this.textures.get(key);
    }
    restore() {
      for (let local of [...this.factories.values(), ...this.pools.values(), ...this.insertions.values()]) local.dispose();
      this.factories.clear(), this.pools.clear(), this.insertions.clear();
      for (let b of this.bindings.values()) b.release();
      this.bindings.clear();
    }
    bindCard(ui, immediate = !1) {
      if (!(this.closed || !["face", "back"].some((side) => this.styles.has(this.selection[side])) || !isCardUI(ui))) {
        if (!this.bindings.has(ui)) {
          let local = new ResourceScope(), binding = { original: ui.bmpFace.texture, applied: null, layers: /* @__PURE__ */ new Map() }, flush = (node) => {
            node?.render && typeof node.update == "function" && node.update();
          };
          binding.restoreLayers = () => {
            for (let [node, visible] of binding.layers) !node.destroyed && node.visible === !1 && (node.visible = visible, flush(node));
            binding.layers.clear();
          }, binding.apply = (force) => {
            let card = ui.theCard, style2 = this.styles.get(this.selection[card?.IsEmpty ? "back" : "face"]), eligible = style2 && card && (this.selection.scope === "all" || this.isSelfCard(ui)) && !ui.isPokerCardFace && !ui.dontUpdateCard && (card.IsEmpty || ui.isNewCardUI === !0 || style2.atlas);
            ui.bmpFace.texture !== binding.applied && (binding.original = ui.bmpFace.texture);
            let dimension = (...values) => values.find((value) => Number.isFinite(value) && value > 0 && value <= 4096), size = {
              width: dimension(ui.width, binding.original?.width, ui.bmpFace.width),
              height: dimension(ui.height, binding.original?.height, ui.bmpFace.height)
            }, texture = eligible && !binding.special ? style2.atlas && !card.IsEmpty ? this.atlasTexture(style2, ui, size) : this.texture(style2, !!card.IsEmpty, force) : null;
            if (binding.reason = style2 ? eligible ? binding.special ? "\u539F\u751F\u6307\u5B9A\u7279\u6B8A\u5361\u56FE" : texture ? "" : ui.isNewCardUI !== !0 && ui.IsYiCard ? "\u5F02\u724C\u4E13\u7528\u5361\u56FE" : style2.atlas?.replaceCards && !style2.atlas.replaceCards.includes(card?.ResName) && this.atlases.get(style2.id)?.data?.frames.has(cardFrameName(card?.ResName)) ? "\u4E0E\u9ED8\u8BA4\u5361\u9762\u76F8\u540C\uFF0C\u4FDD\u7559\u539F\u751F" : style2.atlas ? `\u65E0\u540C\u540D\u5361\u56FE\uFF1A${String(card?.ResName || "\u7A7A\u8D44\u6E90\u540D").slice(0, 96)}` : "\u8D44\u6E90\u672A\u5C31\u7EEA" : "\u8303\u56F4\u6216\u539F\u751F\u663E\u793A\u9650\u5236" : "\u8DDF\u968F\u6E38\u620F", !texture) {
              ui.bmpFace.texture === binding.applied && (ui.bmpFace.texture = binding.original), binding.applied = null, binding.restoreLayers();
              return;
            }
            if (style2.atlas) for (let key of ["bmpFace2", "bmpName", "bmpNameBg", "bmpNormalName", "bmpCardType", "bmpSmallDesc"]) {
              let node = ui[key];
              node && (binding.layers.has(node) || binding.layers.set(node, node.visible), node.visible !== !1 && (node.visible = !1, flush(node)));
            }
            binding.applied = texture, binding.inApply = !0;
            try {
              let dirty = ui.bmpFace.texture !== texture || ui.bmpFace.invalidateUpdateFlag === !0;
              ui.bmpFace.texture = texture, dirty && flush(ui.bmpFace);
            } finally {
              binding.inApply = !1;
            }
          };
          let registry = this, bitmap = ui.bmpFace, ownTexture = Object.getOwnPropertyDescriptor(bitmap, "texture"), textureOwner = bitmap, descriptor = ownTexture;
          for (; !descriptor && (textureOwner = Object.getPrototypeOf(textureOwner)); ) descriptor = Object.getOwnPropertyDescriptor(textureOwner, "texture");
          if (descriptor?.get && descriptor?.set && ownTexture?.configurable !== !1) {
            let get2 = function() {
              return descriptor.get.call(this);
            }, set = function(value) {
              let ordinary = value === binding.original || value === binding.applied;
              if (!ordinary && !binding.inNative && !binding.inApply && !binding.special && !registry.closed)
                try {
                  ordinary = value === ui.getCardFaceBaseTexture(ui.theCard?.Seat || null);
                } catch {
                }
              if (descriptor.set.call(this, value), !(binding.inNative || binding.inApply || binding.special || registry.closed)) {
                if (binding.original = value, binding.applied = null, !ordinary) {
                  binding.special = !0, binding.restoreLayers();
                  return;
                }
                registry.applySafely(binding, !0);
              }
            };
            Object.defineProperty(bitmap, "texture", { configurable: !0, enumerable: descriptor.enumerable, get: get2, set }), local.add(() => {
              Object.getOwnPropertyDescriptor(bitmap, "texture")?.set === set && (ownTexture ? Object.defineProperty(bitmap, "texture", ownTexture) : delete bitmap.texture);
            });
          }
          local.patch(ui, "SetCardFace", (original) => function(...args) {
            binding.restoreLayers(), binding.special = !1;
            let result;
            binding.inNative = !0;
            try {
              this.bmpFace.texture === binding.applied && (this.bmpFace.texture = binding.original), result = original.apply(this, args);
            } finally {
              binding.inNative = !1;
            }
            return binding.original = this.bmpFace.texture, binding.applied = null, registry.applySafely(binding, !0), result;
          }), local.patch(ui, "updateNewCardFace", (original) => function(...args) {
            binding.restoreLayers();
            let result = original.apply(this, args);
            return binding.inNative || registry.applySafely(binding, !0), result;
          });
          for (let key of ["layout", "SetActualSize", "Draw"]) typeof ui[key] == "function" && local.patch(ui, key, (original) => function(...args) {
            let result = original.apply(this, args);
            return !binding.inNative && !binding.inApply && registry.applySafely(binding, !0), result;
          });
          for (let key of ["UpdateCardFaceRes", "UpdateCardFaceOrBackRes", "UpdatePokerCardFace", "Clear"]) typeof ui[key] == "function" && local.patch(ui, key, (original) => function(...args) {
            binding.restoreLayers(), binding.special = !0, this.bmpFace.texture === binding.applied && (this.bmpFace.texture = binding.original), binding.applied = null;
            let result = original.apply(this, args);
            return binding.original = this.bmpFace.texture, result;
          });
          binding.release = () => {
            local.dispose(), binding.restoreLayers(), !ui.destroyed && ui.bmpFace?.texture === binding.applied && (ui.bmpFace.texture = binding.original);
          }, this.bindings.set(ui, binding);
          let type = ui.constructor;
          for (let key of ["pool", "flatPool"]) {
            let pool = own(type, key);
            pool?.T === type && typeof pool.BorrowObject == "function" && this.hookPool(pool);
          }
        }
        this.applySafely(this.bindings.get(ui), immediate);
      }
    }
    applySafely(binding, immediate) {
      try {
        binding.apply(immediate), binding.error = "";
      } catch (error) {
        binding.error = error.message, binding.reason = "\u7EB9\u7406\u5E94\u7528\u5931\u8D25\uFF1A" + error.message, this.setStatus("\u5361\u724C\u5916\u89C2\u672A\u5E94\u7528\uFF1A" + error.message);
      }
    }
    captureCard(card) {
      try {
        this.bindCard(card, !0);
      } catch (error) {
        this.setStatus("\u5361\u724C\u5916\u89C2\u672A\u5E94\u7528\uFF1A" + error.message);
      }
      return card;
    }
    hookPool(pool) {
      if (this.pools.has(pool)) return;
      let local = new ResourceScope(), registry = this;
      this.pools.set(pool, local), local.patch(pool, "BorrowObject", (original) => function(...args) {
        return registry.captureCard(original.apply(this, args));
      }), typeof pool.returnObject == "function" && local.patch(pool, "returnObject", (original) => function(card, ...args) {
        return registry.bindings.get(card)?.release(), registry.bindings.delete(card), original.call(this, card, ...args);
      });
    }
    hookFactory(owner) {
      if (this.factories.has(owner) || typeof owner.createNormalCardUi != "function") return;
      let local = new ResourceScope(), registry = this;
      this.factories.set(owner, local), local.patch(owner, "createNormalCardUi", (original) => function(...args) {
        return this === registry.selfHand ? registry.rememberSelf(args[0]) : own(this, "seat") && Array.isArray(own(this, "cardUis")) && (registry.selfModels.delete(args[0]), registry.selfIds.delete(registry.cardId(args[0]))), registry.captureCard(original.apply(this, args));
      });
      for (let key of ["PrivateUpdateCardUis", "StartSelectCard", "EndSelectCard", "ShowVirtualCards", "ShowVirtualCardInfos", "ShowOutsideCard", "HideHandCards", "RestoreHandCards", "DrawCard"])
        typeof owner[key] == "function" && local.patch(owner, key, (original) => function(...args) {
          registry.captureBranch(this);
          let result = original.apply(this, args);
          return registry.captureBranch(this), result;
        });
    }
    captureBranch(root) {
      let queue = [root], seen = /* @__PURE__ */ new Set();
      for (let i = 0; i < queue.length && i < 6e3; i++) {
        let node = queue[i];
        if (!(!node || typeof node != "object" || seen.has(node) || node.destroyed)) {
          seen.add(node), this.hookFactory(node), isCardUI(node) && this.captureCard(node);
          for (let key of CARD_LISTS) {
            let value = own(node, key);
            Array.isArray(value) && queue.push(...value.slice(0, 2048));
          }
          for (let key of CARD_NODES) {
            let value = own(node, key);
            value && queue.push(value);
          }
        }
      }
    }
    watchInsertions() {
      let roots = /* @__PURE__ */ new Set([this.win.Laya?.stage, this.game.getScene?.()]), level = [this.win.Laya?.stage];
      for (let depth = 0; depth < 2; depth++) {
        let next = [];
        for (let parent of level) {
          let children2 = own(parent, "_children");
          if (Array.isArray(children2)) for (let child of children2.slice(0, 64)) {
            if (roots.size >= 160) break;
            roots.add(child), next.push(child);
          }
        }
        level = next;
      }
      for (let [node, local] of this.insertions) (!roots.has(node) || node.destroyed) && (local.dispose(), this.insertions.delete(node));
      let registry = this;
      for (let node of roots) {
        if (!node || node.destroyed || this.insertions.has(node)) continue;
        let local = new ResourceScope();
        this.insertions.set(node, local);
        for (let key of ["addChild", "addChildAt"]) typeof node[key] == "function" && local.patch(node, key, (original) => function(child, ...args) {
          let result = original.call(this, child, ...args);
          return registry.captureBranch(child), result;
        });
      }
    }
    discover() {
      let queue = [this.win.Laya?.stage, this.game.getScene?.(), this.game.getSelfSeatUI?.()], seen = /* @__PURE__ */ new Set(), found = /* @__PURE__ */ new Set();
      for (let i = 0; i < queue.length && i < 6e3; i++) {
        let node = queue[i];
        if (!(!node || typeof node != "object" || seen.has(node) || node.destroyed)) {
          seen.add(node), this.hookFactory(node), isCardUI(node) && found.add(node);
          for (let key of CARD_LISTS) {
            let a = own(node, key);
            Array.isArray(a) && queue.push(...a.slice(0, 2048));
          }
          for (let key of CARD_NODES) {
            let value = own(node, key);
            value && queue.push(value);
          }
        }
      }
      for (let [owner, local] of this.factories) seen.has(owner) || (local.dispose(), this.factories.delete(owner));
      return found;
    }
    refreshNative() {
      if (this.closed) return;
      for (let id of this.backImages.keys()) id !== this.selection.back && this.clearTextures(id);
      let selectedAtlas = this.styles.get(this.selection.face);
      for (let id of this.atlases.keys()) id !== selectedAtlas?.id && id !== this.selection.back && this.clearTextures(id);
      if (selectedAtlas?.atlas && this.ensureAtlas(selectedAtlas), this.listeners.size) {
        let before = [...this.nativeResources.values()];
        for (let item of this.styles.values()) if (item.native) for (let name of Object.values(item.native)) this.nativeTexture(name);
        let after = [...this.nativeResources.values()];
        (before.length !== after.length || after.some((t, i) => t !== before[i])) && this.emit();
      }
      let scene = this.game.getScene?.();
      scene !== this.scene && (this.scene = scene, this.selfModels = /* @__PURE__ */ new WeakSet(), this.selfIds.clear()), this.selfHand = this.game.getSelfSeatUI?.()?.cardContainer;
      for (let ui of this.selfHand?.cardUis || this.selfHand?.cardUIs || this.selfHand?.cardUiList || []) this.rememberSelf(ui.theCard);
      if (!["face", "back"].some((side) => this.styles.has(this.selection[side]))) {
        this.restore(), this.setStatus(this.current ? "\u6240\u9009\u5957\u88C5\u5DF2\u505C\u7528\uFF0C\u5F53\u524D\u8DDF\u968F\u6E38\u620F" : "\u8DDF\u968F\u6E38\u620F\u539F\u59CB\u5916\u89C2");
        return;
      }
      if (!this.win.Laya?.Texture2D || !this.win.Laya?.Texture) {
        this.setStatus("\u7B49\u5F85\u6E38\u620F\u539F\u751F\u6E32\u67D3\u5668");
        return;
      }
      try {
        this.watchInsertions();
        let found = this.discover();
        for (let [ui, binding] of this.bindings) found.has(ui) || (binding.release(), this.bindings.delete(ui));
        for (let ui of found)
          this.bindCard(ui);
        let waiting = ["face", "back"].some((side) => {
          let selected = this.styles.get(this.selection[side]);
          return selected?.native && !this.texture(selected, side === "back");
        }), atlas = this.atlases.get(selectedAtlas?.id), prefix = atlas?.error ? "\u5B8C\u6574\u5361\u9762\u52A0\u8F7D\u5931\u8D25\uFF0C\u5DF2\u4FDD\u7559\u6E38\u620F\u5916\u89C2\uFF1A" + atlas.error : atlas?.loading ? "\u6B63\u5728\u52A0\u8F7D\u5B8C\u6574\u5361\u9762\uFF0C\u5F53\u524D\u4FDD\u7559\u6E38\u620F\u5916\u89C2" : null, faces = atlas?.data ? [...this.bindings].filter(([ui]) => !ui.theCard?.IsEmpty) : [], applied = faces.filter(([ui, b]) => b.applied && !b.reason && !b.error && ui.bmpFace.texture === b.applied).length, fallback = [...new Set(faces.filter(([, b]) => b.reason).map(([, b]) => b.reason))], detail = atlas?.data ? ` \xB7 \u5B8C\u6574\u5361\u9762 R3 \u5DF2\u66FF\u6362 ${applied}/${faces.length}${fallback.length ? " \xB7 \u56DE\u9000\uFF1A" + fallback.join("\uFF1B") : ""}` : "";
        this.setStatus(prefix || (waiting ? "\u7B49\u5F85\u5B98\u65B9\u5361\u9762\uFF0F\u5361\u80CC\u8D44\u6E90\u52A0\u8F7D\uFF0C\u5DF2\u5C31\u7EEA\u7684\u9762\u72EC\u7ACB\u5E94\u7528" : found.size ? `\u5DF2\u63A5\u5165 ${found.size} \u5F20\u539F\u751F\u5361\u724C \xB7 \u4EC5\u672C\u673A\u663E\u793A${detail}` : "\u5957\u88C5\u5DF2\u5C31\u7EEA\uFF0C\u7B49\u5F85\u539F\u751F\u5361\u724C\u51FA\u73B0"));
      } catch (error) {
        this.restore(), this.setStatus("\u5361\u724C\u5916\u89C2\u672A\u5E94\u7528\uFF1A" + error.message);
      }
    }
  };

  // src/core/version.js
  var CORE_VERSION = "0.6.45", REPLACED_APPEARANCE_PACKAGES = Object.freeze(["e2c8e04c364afd9ffaa53e56156c0590377d55151ff0b2e86248ab2032be824b", "7ef5c15f358262e51a2329f759097dfb987c5334b8a7fd3051d4a92db25f9815", "4ca6f3e6c66a2ab1395cc5112f61a3d6f034ad3efc9b3c86f00de3b739f86b58", "7bec5a6b883a24f2c1a2d0a13ed72acec8d6eb8e833ceb63f1c7658ea3f2e030", "53f94a22c97502e972edffd5b5124537e7ac1db802a7894199429eef2cf29335", "87df68acc195b8129a2491c70a8e267072588afe4abeeea2f9c6b95770b5faea"]), REPLACED_BAISHENG_PACKAGES = Object.freeze(["0a16a51e7d259d0eeabf566a3dd249a0c59e9258dde6691079fcfc8248a3b3f9", "1921ab510f12f1733711b40eaa7dacc0fa0aff8f28155e0b41dcc2415d0d628a"]), REPLACED_EFFECT_PACKAGES = Object.freeze(["03eb9e28e9ec775d3ceacfeb22d0ab8a3e19a0a8f707a7c07c1ca216e5c3afc5", "fce15684f99e3323fa3eefaa60df9b4c90bd85650248a3bac28875d32f8b93d7", "88d3c1037f3a54138f0cfa1134a3f125617ed18bf09a89b40b8824cee5561890", "539f036598d1e330a7131c912dc61ea09467153dfa2afc151494316eb700e717", "083214a3c8649667d30580a128b11e0992b6d7cd17debd125b30789f70271523", "a37337cd1ffac142bdda9a32a4836eb201fc6df8fdf9e684e713ab7681f7ada6"]), REPLACED_REWARD_PACKAGES = Object.freeze(["527539a0735f246222503c007436ced375c41b4d947baec94e9ed37b44ee8716", "1eaac52669cd397aa4c99807367bc313b4a79d17c0f97b773a297e6ebd13c3bb", "b5f2d99e5ba0f0a2560de36763deea20e4566c69057a6ed7de1a10452fb3fecc", "4263c63d08130fab8e1503600732eef86dc271ef31487471f25cf922aa2d3288", "9fd45a179f960d091e7eb2809c1f5d07083ece95de712ab555a63648134a7a45", "7e3632ff06f32fdffc4dcb8361df8d588b9bcd1ffd72517bd32f8a69cbc165c3", "e620754ebe4ccdf7548347f690fdb308050251ded636b9a69a729e0e367294ae", "0ac4bf9d6684cf1acdfc532bc0dbd3c98b89740fbd0e2139da217648ca3f4cf0", "60bdd051a1bf5768561ba2b8c5d8b812fb13c58785d4116d2fdaf68bc5b83b9d", "62c6b1d542d010db621f56903a1337ef26bfc786f765bb0109e52c08be42fb0e", "583f57d57f1bbb511c7a65e7d84c2a2aa8473d423397787d38c9c89f670046ad", "72ff62b4ba885edffb9feddb000944de79bdbda2a324faa858ab0fe2b5dfa2f3", "388c6ac86b1cb7e8c39fdb74df849628f7f009d3bf7b50eec0dda19f0b66544c", "73ef27a716f2b73718be28ab30d9651dcb10fb3cabe02e15415aecd31c40e6bd"]);
  var REPLACED_CARD_PACKAGES = Object.freeze([
    "89ade7342aac0ba92a8b0b6b4b22254a4dca7e7d531c8ebbc7a5ea07597ea68a",
    "18f813ddbdae1cb83949a59bf52379a64a5ebfed680d605936d849f3405f3987",
    "43a4cbff657c319e8b7b1bf2ec7689e0a557fc9bb17a9090d24a2163d1857dda",
    "8c052bb3d022cd8beb67a86f2ff6b85c26b5ee7b45fcb4ab50fbe84b051ba644",
    "47c5f793cac5c527b8860b27497c02f0d7ca29823e53d1b844394241071a1ac3",
    "02a6d1aa8523a53578c81d716ff9cd75eda8187dbf77f0dde4e9d1c7e636b9b3",
    "f1ca73fe184072ccdea6a1fad47b316d83d5fe30e7461dee9387fd3034602af0",
    "e75a3aa637a9c7239aa7c5fc12cb45e2bc0469b3a25348752ae6d0f65bfb03fb",
    "fdf2c2bc8d9404d141f0901916ac0189a2e460c9296a56ff417b785172f6ee99",
    "e75a3aa637a9c7239aa7c5fc12cb45e2bc0469b3a25348752ae6d0f65bfb03fb",
    "d530cd62055fb20f6a3852b5342e3a119b66a393e58a4ae398bd64c3232e6af2",
    "9c53240f6fc7a0b8dc03886afa82d3181a538166e03bf10c1943b44895b86f0d",
    "1b9bf242ff04a2c30ebf8afa28492b545ce55d55017c30fc3b723f5c928b0742",
    "e0432b0a76f468495f74bdd08568d572e6fef2f4a690c8e52f3dbd7e6c548966",
    "69c3992fd9cef098a86994b1219a1a29e6360351f914203880f047b0dc8b4bb7",
    "8e29b9d92b95afcb40de029a10094e53475ea344ab033476d280bafdc2ca6e8e",
    "689d46e4810d06ee11682b421941c6659975b0ca7d05a4d8f906bbb39a4c3342",
    "059c1666e1f78aeccbb70bcbb842f5f2839ecfd44cb77880234fbf56d885a866",
    "5be68adedbc3a52d15eb57101d79609326b59fff95e1cc6c27f97313f8beba40",
    "4c7c86b675d23ed11becc5e2cb63598998d4d2ee47e7fe531b84b5bffa646a96",
    "5757c95dd24034806c458e6dfd9bc144e92dbc07d5fc10a2ead7a99a255fa9c8",
    "425473f2d8f9cb03c85f6093a647220baa592782c0a14955358ff687cda11b76",
    "277255160c4a4b5d4c660253ff1bb003d77bf5122d18bd097c9033db88f067d5",
    "7f412fd8b63b4b9dcb82f55ed03784273cbc49f36aa357bd9ce9a186955b9211",
    "feb8918a064533ba20fc8b004cca96481c6f08565a78aab6c92771949593d093",
    "013a7ec958d5f6609b76c1f3a851596e6b74aae2fc5d1ca2e0a9a54deb2cf0ea",
    "db2e0a5ad64ee0f212ab599a0b9be2ead96304ec2187830655fe03ea1568ce51",
    "896f84ded4c05f4b013e3217e865c054c9b822a791f20d41646cc9b91f182745",
    "b5f0f666d566638be16af2504fa6e5a33ddacb920fe72f439a96f0c510afc64b",
    "697abdec4b38d9dbc06332a7f9d8a46a184571b9a8ff8aa7dec9408d23c6e664",
    "8e18bb3474bbb73fabfc25c27930f7180d8b81a1f391e7eef4959cec06fa902d",
    "08caaefd4de827e272f1dd9df87131ff4dafc786afc2ef7a84469b105adc1af6",
    "9860e464d81df6ab8bc67198cead733cd3346315cd0d4d5388ed8d2df896eeb1",
    "2790317aa949295ce8618811b6b77149c596fef9767023520c7477bd603f60c4",
    "9476d8fb29d96e315dee5a1ceb3fc42b514a2b69540fceec067f29feca91f344",
    "537491d745a66f755c2d5d5c7375624c7fcfe174d729c5377514dc95f582b722",
    "8f34f9202e4120b01b95cd73a6eeb1f89b32f6a516cf361cedef1570c0798282",
    "e343267dafd0917d308e96727fdc8e3702e6f1d0ebbaad8ff3b6b0ee923a08a4",
    "09c5f973dd099e2be5c3cb3ee9a3874715a893830d16b7d6485d46ae68981c95",
    "ac4c46a7cf68ae9d6a9cfb634f9f059f5c22702a62c72049aad37fbd68c09178",
    "f892b62274a0ca0dbddc3ef6d9885ff1b64f6c76797c36cfb9cd8d7010c246fc",
    "4e73956196fc879f748184647a50af1ca89494f317a1c489cd33a51a0ededab8",
    "cfc34def90feed36d866aef543f2ac65efc1500e565a458609022155c0755728",
    "4d47fe229965b9034e41d9d574f97a9966d378dc59e76195adaa675526a7c238",
    "a3c472dc4bd7c04dbcef7d8a42b79a76cf1a1da65b5491c3a6f82c69bb31685b",
    "3eb74ccbeec5b88e4b77c0ff22432954c40ed1041a1f7eb60821ba004af05d77",
    "ec35bb1d90f924d46779eeffaa66d280ff86dad4730e72e7cf889e9b80c412f2",
    "3213d63b1cb2227293278743dafd47ad76014122cde1bc2d01db6352a0e78ced",
    "b3c428277050a1365d93af4cacfd521e3b4008c1d44b2f5d7bf558aa311ee3a9",
    "ac6fc676e2d1d319dba12c6364ba85740d33e37e0c34d0f8e7ade180d8e0d029"
  ]), REPLACED_SKIN_PACKAGES = Object.freeze(["b990b29b6a9eafbe50ea3f820c2dd9753187de6a95aed91191786532cafd1b27", "d8065ccacfd2da8c39e1cf1eded8f743a85de717d6589833f679153ada9d89fa", "36a6458a5cc9c58ece0cedad1df6315e82aafb21ebe4a057e10db17c703a5827", "a9890597c627c6c703bcef0a79339fc6b8472d71f37e05b522117dcf6ac2481d", "d268def49f6f9fbd4b989545594e336886d1a86053d63b1bbdf3f638d1acf002", "5edda81bdbd06ad5ab60b8e564f554e10b1f9d13fa13d983f60ae734867d343c", "a257743d4091e677520f307b6df5a7f2938af7261183b2d57609dc4df41cdd8a", "bfcff0007de23af7439cfc60adbc0cf660bc84a094df360c6bf6f0a5fc812672", "b1b4516b854575ccb02219bd8cdf89332845263e8cced8f9c8738b6e7259eb1b"]), REPLACED_SHANHETU_PACKAGES = Object.freeze(["27d9af46ff339493cbb5bcc0b9e49e648661d9ed7becaf5704a75d0a3b83beae", "437a1ffb64a930e87264e69bcf91a856a1e82c066d732408c884182b4ce6e450", "523473559db6aa12043bb0bd0b22e0a232045d9defede4a2a6a9f3d562ad2133", "5577c02f3922100a434db7c45af19dc3db115866a1a841fc7218083f396b0acf", "ea751303a3e7ecd030d2c5a12a13dd125612f6b64ab41c641116fb763579b421", "55340baa7b51c8d97bdfbedc17209be719c2f05105501390b4028c47554cceeb", "980c908196ff62ac529ab2bfbdade42bef76930f43f534b1b075ead306c10fe2", "9017d32206a5b0e4e2eeede12e390767620579836ed7037e1e223f7ab0c52483", "dfc56a7a02dc4ab17e2f34e3e76862f615f5bf344c534921e8424498fd27b11b", "4d8aaf1df389a0420dfc65c4d5762757c2fe454cc0fbb127fe269b88c5a19af5", "e9f7b5ee0383a29799057f19f16e68e34d57fb7310066dc5d3af45456c7f0445", "997bcf58c5567e0e99829798b855c411d5e51ccad7b5f80e81c9ae84add2656d", "f304bd28030950096503a45d96013c3d7a9e2297ca6143b639b83dcb2d3e197a", "f2739ea490ecf8bee75b1dd6ae0050cc0ad0bc558515c30dbb3c6260e80eaa2f", "332272cc92d11796d8dd7d304560129277acd353726feed7cd1e5a5b6578937a", "bf4207ca6d84501c75f6ec24d094aca952224ce60367196482d6bd6815ca3423", "23d6e6f7bae844ee58a9239bb739fb0ab8d2e64b7766629bca492421bd07f400", "f226d8a8d247ce48c0664ba057ad9f961e7c953291ab7f805714979b7ea35825", "56d82efb93d6eaa0b24c0d5deb8693030f49a0b2fb5af0da49ef6f008943ee65", "674efd3ed6e5719ef9cdabea702b4d6d4394560b18aa5f1ad189486f7467910e", "8de4a53accd1548f58266d9854642462b4fdb089a9a0afcc0561ca725930966d", "95c5bf19558e19c3ef192f2f2022aff19908350e882885cf7855cfe9051801c0", "71fc7d79a3b8014d5f80edda50ea7f7dbba80589ec9c7a8f77bd080056d45175", "151c6e9a3651f5a2c6b7b52321a09c294220400a40385e248d47cb6bb46976c2", "6907320aa5d5e23403c5324926cabf8f48ad23df23afd9925ff5b63e96e87cc6", "4f23cce4d4372a13895716d47d9141acd4c9f13c2be199afff5599148e8349ae", "67362c2dee033a700472210cafc14cc1df351e9a5413273d04e3ff2ce566ce66", "fa6474a1c5170c9ba285f9487031e4b205245d527c97b5ba5f26d68f9bf889ff", "a1f400ad8c8d60f2e4c0b0f981acc8c2be2ab61d1fd6a45ef10b7a3621b05918", "a7595aeaee8cd16ad03b5871310fd7375ea73be7b3d6a1466e8770f9d052fc24", "b6be2108829186604d4a11fb00d63d08e081a1f13f950a715441146c07d26a47", "23077a7742fabceb968d15a85b20c292c37e7a4d6099cf5b9f40a43e59c5fb8a", "2f7654ffde27bed353412a69eb9c5f449270a5e94ff492531e61189825ec560d", "e58c1543240d60a88d2fa92a58ff06ffd30bb4f0d2e75a4a18ba5efad4316d20", "742b76de181ca851dfd0df036a282a3bdee634c61012e687574b7e50216e62e6", "16d2e6a72fbb2258cb1dd69359c34b6753eca73c061b1610d7764ec00068c571", "a78a544feab74eb6d9ddbe6af6662d012a43cd85b698698f4cbadec9dada824d", "d5ad4b8005751bfdfe8301c060e8ab460a2ebd3eb2196112c534e8c44647ba6f", "31ad175296a119402b4a4e90bec5a16cad8a85e9eca2f79e3ee3edf745f27fba", "15366eddcf79bd76dd0f11fa2fb1f393faec512502f0ca01bb9ab13d54238490", "438b0292399649be12f2c42723242d73915a381f8a9c42713b25815c29e57e8b", "44ba81e10e40db62f039946b7e0e18ae162d98e95a350b6ed7eedc2cf8df37ba", "2ff778bd021f4d83971551126ea532ea215ad30e9b0b3dfc0450a88a0de9781c", "6ebf9ca6499f5fbf9b46f4e918990924369359c1191fb62b9026519724ac88cc", "20dac8ad2d3873f7779e2add9d89eb19927b5db6c553563edb69a72afe593624"]), REPLACED_THEME_PACKAGES = Object.freeze(["fabfb9cfc1c6f4c9eeeb69fcc4c9bc319f17d5c964624a616bd15b863c18c5aa", "db376fc6d5b9b878a2dd9bb6642f5d7a24dd5b226c658801aeead6249bc98094", "3589cd781d192c53790071a1775924d4a8ccab648272961a991e6e3bf6034abd"]), REPLACED_BACKGROUND_PACKAGES = Object.freeze(["488b63b7fb2c1d88ddee7bc4a858a09f1a5a7f1271be6f012d612936431cbebc", "7aa96fde03bf1a9d1f5d287c63d86f1c11365bf5fb980bfd9d812b76f9543dd5", "1ebfbcaa2a4e5a2b3112f37aa0d48ce66b355d4a0934b1ff5310916427555b60", "f52fec744b48f472e3db4aa9cbf9e03864d996ba299aed70925d721477fdb2aa"]);

  // src/core/background-motion.js
  function nativeEffect(layer, spine) {
    let method = spine ? layer.SetBgLiveEffect : layer.wt;
    if (typeof method != "function") throw new Error("\u6E38\u620F\u52A8\u753B\u52A0\u8F7D\u5668\u5C1A\u672A\u5C31\u7EEA");
    let effect, init, play, host = {
      beforeStart() {
      },
      beforeLiveStart() {
      },
      layoutBgEffect() {
      },
      layoutBgLiveEffect() {
      },
      addChild(node) {
        effect = node, init = node.InitEffect, play = node.playEffect, node.InitEffect = node.playEffect = () => {
        };
      }
    };
    try {
      Reflect.apply(method, host, ["sgs-background-factory", 0, "", !1]);
    } catch (error) {
      throw effect?.destroy(), error;
    } finally {
      effect && (effect.InitEffect = init, effect.playEffect = play, effect.off?.("start", host, spine ? host.beforeLiveStart : host.beforeStart));
    }
    return effect;
  }
  function createBackgroundMotion({ window: window2, layer, spec, size, scope, ready, fail }) {
    let laya = window2.Laya, root = new laya.Sprite(), players = [], loaded = !1, failed = !1, visible = !1, playing = null;
    root.name = "sgs-background-motion", root.mouseEnabled = root.mouseChildren = !1, root.zOrder = layer.bgSprite.zOrder || 0, root.size(size.width, size.height), root.scrollRect = new laya.Rectangle(0, 0, size.width, size.height), root.visible = !1, scope.add(() => root.destroy(!0)), layer.addChildAt(root, Math.max(0, layer.getChildIndex(layer.bgSprite)) + 1);
    let error = (value) => {
      if (!(scope.closed || failed)) {
        failed = !0, root.visible = !1;
        for (let player of players) player.pause();
        fail(value?.message || String(value || "\u52A8\u6001\u8D44\u6E90\u52A0\u8F7D\u5931\u8D25"));
      }
    }, complete = () => {
      !scope.closed && !failed && (loaded = !0, ready());
    }, result = {
      get loaded() {
        return loaded && !failed;
      },
      layout(fit) {
        scope.closed || !fit || (root.pos(fit.x, fit.y), root.scale(fit.scale, fit.scale));
      },
      show(value) {
        if (!scope.closed && (visible = value && !failed, root.visible = visible && loaded, playing !== visible)) {
          playing = visible;
          for (let player of players) visible ? player.resume() : player.pause();
        }
      }
    };
    if (scope.timeout(() => {
      !loaded && !failed && error("\u52A8\u6001\u80CC\u666F\u52A0\u8F7D\u8D85\u65F6");
    }, 2e4), spec.kind === "video") {
      if (!laya.VideoTexture || !laya.Texture || !window2.document) throw new Error("\u6E38\u620F\u89C6\u9891\u7EB9\u7406\u5C1A\u672A\u5C31\u7EEA");
      let video = window2.document.createElement("video");
      video.crossOrigin = "anonymous", video.muted = !0, video.loop = !0, video.playsInline = !0, video.preload = "auto";
      let bitmap = new laya.VideoTexture();
      bitmap.video = video;
      let texture = new laya.Texture(bitmap);
      scope.add(() => {
        video.pause(), video.removeAttribute("src"), video.load(), texture.destroy(), bitmap.destroy();
        let pool = laya.VideoTexture._videoTexturePool, index = pool?.indexOf(bitmap);
        index >= 0 && pool.splice(index, 1);
      }), scope.listen(video, "error", () => error("\u89C6\u9891\u52A0\u8F7D\u5931\u8D25\uFF1A" + (video.error?.message || video.error?.code || "\u672A\u77E5\u9519\u8BEF"))), scope.listen(video, "loadeddata", () => {
        scope.closed || failed || (bitmap._width = video.videoWidth, bitmap._height = video.videoHeight, texture.setTo(bitmap, void 0, video.videoWidth, video.videoHeight), root.graphics.clear(), root.graphics.drawTexture(texture, 0, 0, size.width, size.height), complete(), result.show(visible));
      }), players.push({ pause() {
        bitmap.videoPause();
      }, resume() {
        bitmap._needUpdate = !0, video.play()?.catch(error);
      } });
      let frame = () => {
        if (!scope.closed && visible && loaded && !failed && video.readyState >= 2)
          try {
            bitmap._updateVideoData(), root.repaint();
          } catch (e) {
            error(e);
          }
      };
      laya.timer.frameLoop(1, root, frame), scope.add(() => laya.timer.clear(root, frame)), video.src = spec.url, video.load();
    } else {
      let parts = spec.kind === "bone" ? ["beijing", ...spec.parts] : spec.modern ? ["beijing", "daiji", "qianjing"] : ["beijing", "xingxiang"], count = 0;
      for (let part of parts) {
        let effect = nativeEffect(layer, spec.kind === "spine");
        scope.add(() => effect.destroy()), root.addChild(effect), effect.mouseEnabled = effect.mouseChildren = !1, spec.kind === "bone" && effect.size(size.width, size.height), effect.pos(size.width / 2, size.height / 2), effect.AutoReleaseRes = !0;
        let onStart = () => {
          ++count === parts.length && (complete(), result.show(visible));
        };
        effect.once(laya.Event?.START || "start", effect, onStart), effect.once(laya.Event?.ERROR || "error", effect, error);
        let animation = spec.modern && part !== "beijing" ? "DaiJi" : spec.modern ? 0 : "play";
        effect.InitEffect(`${spec.url}/${part}.${spec.kind === "spine" ? "json" : "sk"}`, animation, !0, !1), effect.playEffect(), players.push({ pause() {
          effect.stop();
        }, resume() {
          effect.playEffect();
        } });
      }
    }
    return result;
  }

  // src/core/backgrounds.js
  function containBackground(width, height, viewportWidth, viewportHeight) {
    if (![width, height, viewportWidth, viewportHeight].every((n) => Number.isFinite(n) && n > 0)) return null;
    let scale = Math.min(viewportWidth / width, viewportHeight / height);
    return { width, height, scale, x: (viewportWidth - width * scale) / 2, y: (viewportHeight - height * scale) / 2 };
  }
  function findBackgroundLayer(stage) {
    let queue = stage ? [stage] : [];
    for (let i = 0; i < queue.length && i < 4e3; i++) {
      let node = queue[i];
      if (!(!node || node.destroyed)) {
        if (node.bgSprite && typeof node.updateBgSize == "function" && typeof node.bgLoadComplete == "function" && typeof node.O == "function") return node;
        Array.isArray(node._children) && queue.push(...node._children);
      }
    }
    return null;
  }
  function backgroundSpec(value) {
    if (!value || typeof value.name != "string" || !value.name.trim() || value.name.length > 160) throw new Error("\u80CC\u666F\u540D\u79F0\u65E0\u6548");
    let url = String(value.url || "");
    if (url.length > 4096 || !/^(https?:\/\/|res\/)/.test(url)) throw new Error("\u80CC\u666F\u987B\u4E3A\u6E38\u620F\u8D44\u6E90\u8DEF\u5F84\u6216 HTTP(S) \u56FE\u7247");
    if (/^https?:/.test(url)) {
      let parsed = new URL(url);
      if (parsed.username || parsed.password) throw new Error("\u80CC\u666F\u5730\u5740\u4E0D\u80FD\u5305\u542B\u51ED\u636E");
    }
    let result = { name: value.name.trim(), url };
    if (value.dynamic === null && (result.dynamic = null), value.dynamic != null) {
      let d = value.dynamic;
      if (!["bone", "spine", "video"].includes(d.kind)) throw new Error("\u52A8\u6001\u80CC\u666F\u7C7B\u578B\u65E0\u6548");
      let dynamicUrl = backgroundSpec({ name: "\u52A8\u6001\u8D44\u6E90", url: d.url }).url;
      if (![d.width, d.height].every((n) => Number.isFinite(n) && n > 0 && n <= 16384)) throw new Error("\u52A8\u6001\u80CC\u666F\u5C3A\u5BF8\u65E0\u6548");
      if (d.parts != null && (!Array.isArray(d.parts) || d.parts.length > 16 || d.parts.some((p) => !/^[\w-]{1,80}$/.test(p)) || new Set(d.parts).size !== d.parts.length || d.parts.includes("beijing"))) throw new Error("\u52A8\u6001\u80CC\u666F\u5206\u5C42\u65E0\u6548");
      result.dynamic = Object.freeze({ kind: d.kind, url: dynamicUrl.replace(/\/$/, ""), width: d.width, height: d.height, modern: d.modern === !0, parts: Object.freeze([...d.parts || []]) });
    }
    return result.animated = value.animated !== !1, Object.freeze(result);
  }
  var BackgroundRegistry = class {
    constructor({ window: window2, game, settings, scope }) {
      Object.assign(this, { window: window2, game, settings, scope }), this.providers = /* @__PURE__ */ new Set(), this.listeners = /* @__PURE__ */ new Set(), this.binding = null, this.ready = null, this.loading = null, this.failed = null, this.ticket = 0, this.status = "\u8DDF\u968F\u6E38\u620F\u80CC\u666F", scope.interval(() => this.refresh(), 500), scope.add(() => {
        this.detach(!0), this.ticket++, this.listeners.clear();
      });
    }
    get current() {
      return this.settings.get("battleBackground", null);
    }
    subscribe(fn) {
      return this.listeners.add(fn), () => this.listeners.delete(fn);
    }
    emit() {
      for (let fn of this.listeners)
        try {
          fn();
        } catch {
        }
    }
    state(text2) {
      this.status !== text2 && (this.status = text2, this.emit());
    }
    register(owner) {
      if (this.providers.has(owner)) throw new Error("\u80CC\u666F\u63D0\u4F9B\u65B9\u5DF2\u6CE8\u518C");
      this.providers.add(owner), this.refresh();
      let active = !0;
      return () => {
        active && (active = !1, this.providers.delete(owner), this.retryAt = 0, this.loadAttempts = 0, this.refresh());
      };
    }
    select(owner, spec) {
      if (!this.providers.has(owner)) throw new Error("\u80CC\u666F\u63D0\u4F9B\u65B9\u672A\u542F\u7528");
      this.yieldedScene = this.binding?.yielded ? this.binding.scene : this.yieldedScene, this.settings.set("battleBackground", spec ? { ...backgroundSpec(spec), owner } : null), this.ticket++, this.ready = this.loading = this.failed = null, this.retryAt = 0, this.loadAttempts = 0, this.detach(!0), this.refresh(), this.emit();
    }
    detach(restore) {
      let b = this.binding;
      b && (this.binding = null, b.scope.dispose(), restore && b.applied && !b.yielded && !b.scene.currentWeatherWallPaper && !b.scene.destroyed && this.game.getScene() === b.scene && b.scene.onWallPaperChange());
    }
    refresh() {
      if (!this.scope.closed && !(this.retryAt && Date.now() < this.retryAt))
        try {
          this.refreshReady();
        } catch (error) {
          this.ticket++, this.loading = null;
          try {
            this.detach(!1);
          } catch {
          }
          this.retryAt = Date.now() + 2e3, this.state("\u80CC\u666F\u63A5\u5165\u6682\u672A\u5C31\u7EEA\uFF0C\u5C06\u81EA\u52A8\u91CD\u8BD5\uFF1A" + (error?.stack || error));
        }
    }
    loadFailed(url, message) {
      this.ticket++, this.loading = null, this.failed = url, this.loadAttempts = (this.loadAttempts || 0) + 1, this.retryAt = Date.now() + Math.min(3e4, 2e3 * 2 ** (this.loadAttempts - 1)), this.state(message + "\uFF1B\u7A0D\u540E\u81EA\u52A8\u91CD\u8BD5");
    }
    refreshReady() {
      let choice = this.current;
      if (!choice || !this.providers.has(choice.owner)) {
        this.ticket++, this.ready = this.loading = null, this.detach(!0), this.state(choice ? "\u80CC\u666F\u63D2\u4EF6\u5DF2\u505C\u7528\uFF0C\u8DDF\u968F\u6E38\u620F\u80CC\u666F" : "\u8DDF\u968F\u6E38\u620F\u80CC\u666F");
        return;
      }
      try {
        backgroundSpec(choice);
      } catch (error) {
        this.detach(!0), this.state("\u80CC\u666F\u914D\u7F6E\u65E0\u6548\uFF1A" + error.message);
        return;
      }
      let scene = this.game.getScene();
      if (this.binding?.scene !== scene && this.detach(!1), this.binding && (this.binding.layer.destroyed || this.binding.stage !== this.window.Laya?.stage) && this.detach(!1), !this.game.isInGame() || !["SetWallPaperById", "SetWallPaperByUrl", "OnNormalWallPaperChange", "onWallPaperChange"].every((k) => typeof scene?.[k] == "function")) {
        this.detach(!1), this.state("\u5DF2\u4FDD\u5B58\uFF0C\u7B49\u5F85\u8FDB\u5165\u724C\u5C40");
        return;
      }
      let laya = this.window.Laya;
      if (this.failed === choice.url && (this.failed = null), this.ready !== choice.url) {
        if (this.loading === choice.url) return;
        if (!laya?.loader?.load || !laya.Handler?.create) {
          this.state("\u7B49\u5F85\u6E38\u620F\u56FE\u7247\u52A0\u8F7D\u5668");
          return;
        }
        let ticket = ++this.ticket;
        this.loading = choice.url, this.state("\u6B63\u5728\u52A0\u8F7D\u80CC\u666F"), this.scope.timeout(() => {
          ticket !== this.ticket || this.loading !== choice.url || this.loadFailed(choice.url, "\u80CC\u666F\u52A0\u8F7D\u8D85\u65F6");
        }, 2e4);
        try {
          laya.loader.load(choice.url, laya.Handler.create(null, (texture) => {
            if (!(ticket !== this.ticket || this.scope.closed)) {
              if (this.loading = null, !texture) {
                this.loadFailed(choice.url, "\u80CC\u666F\u52A0\u8F7D\u5931\u8D25");
                return;
              }
              this.loadAttempts = 0, this.retryAt = 0, this.imageSize = { width: texture.sourceWidth || texture.width, height: texture.sourceHeight || texture.height }, this.imageTexture = texture, this.ready = choice.url, this.refresh();
            }
          }), null, laya.Loader?.IMAGE || "image");
        } catch (error) {
          this.loadFailed(choice.url, "\u80CC\u666F\u52A0\u8F7D\u5931\u8D25\uFF1A" + error.message);
        }
        return;
      }
      if (!this.binding) {
        let layer = findBackgroundLayer(laya?.stage), context = this.window.SystemContext;
        if (!layer || !laya.Sprite || !laya.Rectangle || !(context?.gameWidth > 0 && context?.gameHeight > 0)) {
          this.state("\u7B49\u5F85\u6E38\u620F\u80CC\u666F\u5C42\u4E0E\u5E03\u5C40\u5C31\u7EEA");
          return;
        }
        let local = new ResourceScope(), b2 = { scene, layer, stage: laya.stage, scope: local, applied: !1, yielded: this.yieldedScene === scene, writing: !1 };
        this.binding = b2;
        let registry = this, originalById = scene.SetWallPaperById, eligible = () => !scene.currentWeatherWallPaper && !b2.yielded;
        if (b2.syncMotion = () => {
          let visible = eligible() && layer.bg?.skin === choice.url;
          b2.motion?.show(visible);
        }, layer) {
          let fill = new laya.Sprite();
          local.add(() => fill.destroy(!0)), fill.name = "sgs-background-edge-fill", fill.mouseEnabled = !1, fill.mouseChildren = !1, fill.zOrder = (layer.bgSprite.zOrder || 0) - 1, layer.addChildAt(fill, Math.max(0, layer.getChildIndex(layer.bgSprite)));
          let soften = new laya.Sprite();
          soften.mouseEnabled = !1, fill.addChild(soften), laya.BlurFilter && (soften.filters = [new laya.BlurFilter(18)]), b2.hideFill = () => {
            fill.visible = !1, b2.motion?.show(!1);
          };
          let fillKey = "";
          local.patch(layer, "updateBgSize", (original) => function(...args) {
            let result = Reflect.apply(original, this, args);
            if (fill.visible = eligible() && this.bg?.skin === choice.url, b2.syncMotion(), !fill.visible) return result;
            let size = registry.imageSize, context2 = registry.window.SystemContext, fit = containBackground(size?.width, size?.height, context2?.gameWidth, context2?.gameHeight);
            if (!fit)
              return fill.visible = !1, result;
            let w = context2.gameWidth, h = context2.gameHeight, key = `${w}:${h}`;
            if (key !== fillKey) {
              fillKey = key;
              let scale = Math.max(w / fit.width, h / fit.height), dw = fit.width * scale, dh = fit.height * scale;
              fill.size(w, h), fill.scrollRect = new laya.Rectangle(0, 0, w, h), soften.graphics.clear(), soften.graphics.drawTexture(registry.imageTexture, (w - dw) / 2, (h - dh) / 2, dw, dh), soften.graphics.drawRect(0, 0, w, h, "rgba(0,0,0,0.28)");
            }
            return this.bg.size(fit.width, fit.height), typeof this.bg.scale == "function" ? this.bg.scale(fit.scale, fit.scale) : this.bg.scale = fit.scale, this.bg.posInteger(fit.x, fit.y), b2.motion && b2.motion.layout(containBackground(choice.dynamic.width, choice.dynamic.height, w, h)), result;
          });
        }
        typeof scene.OnWeatherWallPaperChange == "function" && local.patch(scene, "OnWeatherWallPaperChange", (original) => function(...args) {
          return b2.hideFill?.(), Reflect.apply(original, this, args);
        });
        let apply = () => {
          b2.writing = !0;
          try {
            scene.SetWallPaperByUrl(choice.url), b2.applied = !0, layer?.updateBgSize();
          } finally {
            b2.writing = !1;
          }
        };
        local.patch(scene, "SetWallPaperByUrl", (original) => function(...args) {
          return b2.writing || (b2.yielded = !0, registry.yieldedScene = scene, b2.hideFill?.(), registry.state("\u6280\u80FD\u80CC\u666F\u4F18\u5148")), Reflect.apply(original, this, args);
        }), local.patch(scene, "SetWallPaperById", (original) => function(...args) {
          if (args[1])
            return b2.yielded = !0, registry.yieldedScene = scene, b2.hideFill?.(), Reflect.apply(original, this, args);
          if (eligible()) {
            apply();
            return;
          }
          return Reflect.apply(original, this, args);
        }), local.patch(scene, "OnNormalWallPaperChange", (original) => function(...args) {
          if (b2.yielded = !1, registry.yieldedScene = null, eligible()) {
            apply();
            return;
          }
          return Reflect.apply(original, this, args);
        });
        let dispatcher = this.game.getDispatcher?.(), event = dispatcher?.constructor?.BACKGROUND_USEDID_GOT || "BACKGROUND_USEDID_GOT", entries = dispatcher?._events?.[event];
        for (let handler of Array.isArray(entries) ? entries : [entries])
          if (handler?.caller === scene && handler.method === originalById) {
            let redirected = scene.SetWallPaperById;
            handler.method = redirected, local.add(() => {
              handler.caller === scene && handler.method === redirected && (handler.method = originalById);
            });
          }
        if (b2.yielded || scene.onWallPaperChange(), choice.dynamic && choice.animated !== !1) {
          let motionScope = new ResourceScope();
          local.add(() => motionScope.dispose());
          let fail = (message) => {
            local.closed || (b2.motionError = message, motionScope.dispose(), b2.motion = null, this.refresh());
          };
          try {
            b2.motion = createBackgroundMotion({
              window: this.window,
              layer,
              spec: choice.dynamic,
              size: choice.dynamic,
              scope: motionScope,
              ready: () => {
                local.closed || this.refresh();
              },
              fail
            }), motionScope.closed && (b2.motion = null), layer.updateBgSize();
          } catch (error) {
            fail(error?.stack || String(error));
          }
        }
      }
      scene.currentWeatherWallPaper || this.binding.yielded ? this.binding.hideFill?.() : this.binding.syncMotion();
      let b = this.binding;
      this.state(scene.currentWeatherWallPaper || b.yielded ? "\u6280\u80FD\u80CC\u666F\u4F18\u5148" : b.motionError ? "\u52A8\u6001\u80CC\u666F\u5931\u8D25\uFF0C\u5DF2\u663E\u793A\u9759\u6001\u539F\u753B\uFF1A" + b.motionError : b.motion ? b.motion.loaded ? "\u52A8\u6001\u724C\u5C40\u80CC\u666F\u5DF2\u542F\u7528" : "\u6B63\u5728\u52A0\u8F7D\u52A8\u6001\u80CC\u666F\uFF0C\u6682\u663E\u9759\u6001\u539F\u753B" : "\u9759\u6001\u724C\u5C40\u80CC\u666F\u5DF2\u542F\u7528");
    }
  };

  // src/core/themes.js
  var BLACK_GOLD = { id: "core.black-gold", name: "\u7384\u91D1", tokens: { bg: "#201e1a", surface: "#2c2922", raised: "#383327", text: "#eee3cc", muted: "#b7aa8c", accent: "#dbba70", border: "#665b42", danger: "#f3988c", radius: "10px", font: '"Microsoft YaHei", system-ui, sans-serif', motion: "240ms", scheme: "dark" } }, allowed = Object.keys(BLACK_GOLD.tokens);
  function clean(tokens) {
    let result = {};
    for (let k of allowed) typeof tokens?.[k] == "string" && tokens[k].length < 180 && !/[;{}]|url\s*\(/i.test(tokens[k]) && (k !== "scheme" || ["light", "dark"].includes(tokens[k])) && (result[k] = tokens[k]);
    return result;
  }
  var ThemeRegistry = class {
    constructor(settings, apply = () => {
    }) {
      this.settings = settings, this.apply = apply, this.themes = /* @__PURE__ */ new Map([[BLACK_GOLD.id, BLACK_GOLD]]), this.layers = /* @__PURE__ */ new Map(), this.listeners = /* @__PURE__ */ new Set(), this.refresh();
    }
    register(theme, owner = "core") {
      if (!theme?.id || !theme.id.startsWith(owner + ".")) throw new Error("\u4E3B\u9898 ID \u5FC5\u987B\u4EE5\u63D2\u4EF6 ID \u4E3A\u524D\u7F00\u3002");
      if (this.themes.has(theme.id)) throw new Error("\u4E3B\u9898 ID \u5DF2\u6CE8\u518C\u3002");
      return this.themes.set(theme.id, { ...theme, tokens: clean(theme.tokens) }), this.refresh(), () => {
        this.themes.delete(theme.id), this.refresh();
      };
    }
    override(owner, tokens, priority2 = 0) {
      let key = Symbol(owner);
      return this.layers.set(key, { owner, priority: priority2, tokens: clean(tokens) }), this.refresh(), () => {
        this.layers.delete(key), this.refresh();
      };
    }
    select(id) {
      if (!this.themes.has(id)) throw new Error("\u4E3B\u9898\u5C1A\u672A\u542F\u7528\u6216\u5DF2\u88AB\u5378\u8F7D\u3002");
      this.settings.set("theme", id), this.refresh();
    }
    list() {
      return [...this.themes.values()];
    }
    subscribe(fn) {
      return this.listeners.add(fn), () => this.listeners.delete(fn);
    }
    refresh() {
      let selected = this.settings.get("theme", BLACK_GOLD.id), theme = this.themes.get(selected) || BLACK_GOLD, tokens = { ...BLACK_GOLD.tokens, ...theme.tokens };
      for (let layer of [...this.layers.values()].sort((a, b) => a.priority - b.priority || a.owner.localeCompare(b.owner))) Object.assign(tokens, layer.tokens);
      this.current = { id: theme.id, tokens }, this.apply(tokens);
      for (let fn of [...this.listeners])
        try {
          fn(this.current);
        } catch (error) {
          console.warn("[\u5DE5\u5177\u7BB1\u4E3B\u9898\u8BA2\u9605]", error);
        }
    }
  };

  // src/ui/plugin-icons.js
  var icon = (...paths) => Object.freeze({ paths: Object.freeze(paths) }), PLUGIN_ICONS = Object.freeze({
    cards: icon(
      "M9 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
      "M4 5 2 6l2 14M14 7l3 5-3 5-3-5Z"
    ),
    shanhetu: icon(
      "M3 5 9 3l6 2 6-2v16l-6 2-6-2-6 2Z",
      "M6 12 10 7l4 5 3-3 2 3",
      "M6 16c3-3 7 3 12-1"
    ),
    "daily-rewards": icon(
      "M3 8h18v4H3ZM5 12v9h14v-9M12 8v13",
      "M12 8H8a3 3 0 1 1 3-3ZM12 8h4a3 3 0 1 0-3-3Z"
    ),
    seckill: icon(
      "M5 7h14l2 14H3ZM8 7V5a4 4 0 0 1 8 0v2",
      "M13 10 9 15h3l-1 4 5-6h-4Z"
    ),
    gaizhu: icon(
      "M5 21V3M5 4c5-4 9 4 14 0v10c-5 4-9-4-14 0",
      "M9 9a3 3 0 0 1 5-2l1 2M15 6v3h-3",
      "M2 21h6"
    ),
    effects: icon(
      "M9 5 11 2l2.5 7.5L21 12l-4 1.5M14.5 16 12 22l-2.5-7.5L2 12l5-2",
      "M3 3 21 21M19 3v4M17 5h4"
    ),
    skins: icon(
      "M8 3 12 5l4-2 6 5-4 4-2-2v11H8V10l-2 2-4-4Z",
      "M8 3l8 9M16 3l-6 7M8 16h8"
    ),
    "wish-progress": icon(
      "M12 17 4.5 10a4.3 4.3 0 0 1 6-6L12 5.5 13.5 4a4.3 4.3 0 0 1 6 6Z",
      "M4 21h9M16 21h4"
    ),
    themes: icon(
      "M12 21 2 8a16 16 0 0 1 20 0Z",
      "M12 21 7 5.3M12 21V4.5M12 21 17 5.3",
      "M10 19a3 3 0 0 1 4 0"
    ),
    baisheng: icon(
      "M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v2a4 4 0 0 0 4 4M17 5h4v2a4 4 0 0 1-4 4",
      "M12 14v4M8 21v-3h8v3ZM12 6l2 2-2 2-2-2Z"
    ),
    appearances: icon(
      "M9 21H3V3h18v9",
      "M9 6a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM5.5 16v-1a3.5 3.5 0 0 1 7-1",
      "M12 21 16 17l3 2 3-5M19 14h3v3"
    ),
    ledger: icon(
      "M6 3h13a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 3v18",
      "M2 7h4M2 12h4M2 17h4M12 8h5M12 12h5M12 16h3"
    )
  }), TOOLBOX_ICON = icon(
    "M3 7h18v13H3ZM8 7V4h8v3M3 12h6M15 12h6",
    "M12 9l3 3-3 3-3-3Z"
  );

  // src/ui/icons.js
  var markup = Object.freeze({
    cards: PLUGIN_ICONS.cards,
    gift: PLUGIN_ICONS["daily-rewards"],
    effects: PLUGIN_ICONS.effects,
    skins: PLUGIN_ICONS.skins,
    palette: PLUGIN_ICONS.themes,
    toolbox: TOOLBOX_ICON,
    map: PLUGIN_ICONS.shanhetu,
    tools: '<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V4h8v3M3 12h18M10 11v3h4v-3"/>',
    settings: '<path d="M12 3l2 3 4-1 1 4 3 3-3 3-1 4-4-1-2 3-2-3-4 1-1-4-3-3 3-3 1-4 4 1z"/><circle cx="12" cy="12" r="3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 6v1"/>',
    package: '<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M7 5l10 5v4"/>',
    automation: '<path d="M13 2L4 14h7l-1 8 10-13h-7z"/>',
    refresh: '<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>',
    reset: '<path d="M8 4 3 9l5 5M3 9h10a6 6 0 0 1 0 12"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    camera: '<path d="M8 6.5 9.5 4h5L16 6.5h3.5a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-15a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="3.5"/><path d="M18 10h.01"/>',
    expand: '<path d="M14 4h6v6m0-6-6.5 6.5M10 20H4v-6m0 6 6.5-6.5"/>',
    collapse: '<path d="M5 12h14"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    save: '<path d="M5 3h12l4 4v14H3V3zM7 3v6h10V3M7 21v-8h10v8"/>',
    download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
    pointer: '<path d="m5 3 14 9-7 1-3 7z"/>',
    clipboard: '<path d="M9 5H5v16h14V5h-4M9 3h6v4H9zM8 12h8M8 16h6"/>',
    share: '<circle cx="6" cy="12" r="3"/><circle cx="18" cy="5" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10 6-4M9 14l6 4"/>',
    play: '<path d="m8 5 11 7-11 7z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
    update: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    alert: '<path d="m12 3 10 18H2zM12 9v5M12 17v1"/>'
  }), aliases2 = Object.freeze({ game: "cards", manage: "settings", reload: "refresh", rollback: "reset" }), ICON_NAMES = Object.freeze([...Object.keys(markup), ...Object.keys(aliases2)]);
  function isIconSpec(value) {
    return typeof value == "string" ? Object.hasOwn(markup, value) || Object.hasOwn(aliases2, value) : value !== null && typeof value == "object" && !Array.isArray(value) && Object.keys(value).length === 1 && Array.isArray(value.paths) && value.paths.length >= 1 && value.paths.length <= 8 && value.paths.every((path) => typeof path == "string" && path.length <= 1024 && /^[Mm][\s\d.,+\-eEMmLlHhVvCcSsQqTtAaZz]+$/.test(path) && /\d/.test(path));
  }
  function createIcon(doc, value = "package", className = "sgs-line-icon") {
    let spec = isIconSpec(value) ? value : "package", icon2 = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon2.setAttribute("viewBox", "0 0 24 24"), icon2.setAttribute("class", className), icon2.setAttribute("aria-hidden", "true"), icon2.setAttribute("focusable", "false"), icon2.setAttribute("fill", "none"), icon2.setAttribute("stroke", "currentColor"), icon2.setAttribute("stroke-width", "1.5"), icon2.setAttribute("stroke-linecap", "round"), icon2.setAttribute("stroke-linejoin", "round"), icon2.dataset.icon = typeof spec == "string" ? spec : "custom";
    let shape = typeof spec == "string" ? markup[aliases2[spec] || spec] : spec;
    if (typeof shape == "string") icon2.innerHTML = shape;
    else for (let d of shape.paths) {
      let path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d), icon2.append(path);
    }
    return icon2;
  }

  // src/ui/controls.js
  var CONTROL_STYLES = `
input.sgs-switch[type=checkbox]{appearance:none;-webkit-appearance:none;position:relative;display:inline-block;flex:0 0 30px;width:30px;height:18px;min-width:30px;margin:0;padding:0;border:1px solid color-mix(in srgb,var(--sgs-border,#665b42) 65%,transparent);border-radius:12px;background:linear-gradient(color-mix(in srgb,var(--sgs-bg,#201e1a) 80%,#000),var(--sgs-surface,#2c2922));box-shadow:inset 0 1px 3px #0006;vertical-align:middle;cursor:pointer;transition:background .16s,border-color .16s}
input.sgs-switch[type=checkbox]::before{content:'';position:absolute;top:3px;left:3px;width:10px;height:10px;border-radius:50%;background:linear-gradient(color-mix(in srgb,var(--sgs-muted,#b7aa8c) 85%,var(--sgs-text,#eee3cc)),color-mix(in srgb,var(--sgs-muted,#b7aa8c) 65%,var(--sgs-bg,#201e1a)));box-shadow:0 1px 2px #0008;transition:transform .16s,background .16s}
input.sgs-switch[type=checkbox]:checked{background:linear-gradient(color-mix(in srgb,var(--sgs-accent,#dbba70) 35%,var(--sgs-surface,#2c2922)),color-mix(in srgb,var(--sgs-accent,#dbba70) 17%,var(--sgs-surface,#2c2922)));border-color:color-mix(in srgb,var(--sgs-accent,#dbba70) 65%,transparent)}
input.sgs-switch[type=checkbox]:checked::before{transform:translateX(12px);background:linear-gradient(color-mix(in srgb,var(--sgs-accent,#dbba70) 45%,var(--sgs-text,#eee3cc)),var(--sgs-accent,#dbba70))}
input.sgs-switch[type=checkbox]:focus-visible{outline:1px solid var(--sgs-accent,#dbba70);outline-offset:2px}input.sgs-switch:disabled{opacity:.4;cursor:not-allowed}
select.sgs-select,input.sgs-input{box-sizing:border-box;min-width:0;max-width:100%;height:32px;border:1px solid color-mix(in srgb,var(--sgs-border,#665b42) 65%,transparent);border-radius:7px;background-color:var(--sgs-bg,#201e1a);box-shadow:inset 0 1px 3px #0003;color:var(--sgs-text,#eee3cc);font:12px/1.4 var(--sgs-font,sans-serif)}
select.sgs-select{appearance:none;-webkit-appearance:none;padding:5px 27px 5px 9px;background-image:linear-gradient(45deg,transparent 50%,var(--sgs-muted,#b7aa8c) 50%),linear-gradient(135deg,var(--sgs-muted,#b7aa8c) 50%,transparent 50%);background-repeat:no-repeat;background-size:4px 4px;background-position:right 13px center,right 9px center;cursor:pointer;text-overflow:ellipsis}
select.sgs-select option{background:var(--sgs-bg,#201e1a);color:var(--sgs-text,#eee3cc)}input.sgs-input{padding:5px 9px}
select.sgs-select:focus-visible,input.sgs-input:focus-visible{outline:1px solid var(--sgs-accent,#dbba70);outline-offset:1px;border-color:var(--sgs-accent,#dbba70)}
.sgs-fold>summary{display:flex;align-items:center;gap:8px;list-style:none;cursor:pointer;user-select:none;padding:10px 0;color:var(--sgs-muted,#b7aa8c);font-size:12px}.sgs-fold>summary::-webkit-details-marker{display:none}.sgs-fold>summary::after{content:'';width:5px;height:5px;margin-left:auto;margin-right:3px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);transition:transform .16s}.sgs-fold[open]>summary{color:var(--sgs-accent,#dbba70)}.sgs-fold[open]>summary::after{transform:rotate(225deg)}.sgs-fold>summary:focus-visible{outline:1px solid var(--sgs-accent,#dbba70);outline-offset:2px}
.sgs-segments{display:flex;gap:2px;padding:3px;border-radius:8px;background:#0002;box-shadow:inset 0 1px 3px #0003}.sgs-segments>button{flex:1;min-width:0;border:0;border-radius:5px;background:transparent;box-shadow:none;color:var(--sgs-muted,#b7aa8c);padding:4px 6px;font-size:11px}.sgs-segments>button.is-active,.sgs-segments>button[aria-pressed=true]{color:var(--sgs-accent,#dbba70);background:linear-gradient(color-mix(in srgb,var(--sgs-accent,#dbba70) 18%,transparent),color-mix(in srgb,var(--sgs-accent,#dbba70) 7%,transparent));box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-accent,#dbba70) 14%,transparent),0 1px 3px #0003}
.sgs-line-icon{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;flex:none}
@media(prefers-reduced-motion:reduce){input.sgs-switch[type=checkbox],input.sgs-switch[type=checkbox]::before,.sgs-fold>summary::after{transition:none}}
`;
  function controlIcon(doc, name) {
    return createIcon(doc, name);
  }
  function styleSwitch(input) {
    return input.classList.add("sgs-switch"), input.setAttribute("role", "switch"), input;
  }
  function helpTip(doc, text2, label = "\u8BF4\u660E") {
    let wrap = doc.createElement("span"), button = doc.createElement("button"), tip = doc.createElement("span");
    wrap.style.cssText = "display:inline-flex;vertical-align:middle;margin:2px 0", button.dataset.helpTip = "", button.type = "button", button.setAttribute("aria-label", label), button.title = text2, button.style.cssText = "display:inline-grid;place-items:center;width:24px;height:24px;min-width:24px;padding:3px;border:0;background:transparent;box-shadow:none;color:var(--sgs-muted);cursor:help;border-radius:50%", button.append(controlIcon(doc, "info")), tip.textContent = text2, tip.setAttribute("popover", "manual"), tip.setAttribute("role", "tooltip"), tip.style.cssText = "position:fixed;inset:auto;margin:0;padding:10px 12px;max-width:min(300px,calc(100vw - 24px));width:max-content;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 var(--sgs-font,sans-serif);color:var(--sgs-text);background:var(--sgs-raised);border:1px solid var(--sgs-border);border-radius:8px;box-shadow:0 6px 24px #0004";
    let hide = () => {
      tip.matches(":popover-open") && tip.hidePopover();
    }, show = () => {
      if (!tip.showPopover) return;
      tip.showPopover();
      let box = button.getBoundingClientRect(), bounds = tip.getBoundingClientRect(), win = doc.defaultView;
      tip.style.left = Math.max(12, Math.min(box.left, win.innerWidth - bounds.width - 12)) + "px", tip.style.top = Math.max(12, box.bottom + bounds.height + 8 < win.innerHeight ? box.bottom + 6 : box.top - bounds.height - 6) + "px";
    };
    return button.addEventListener("mouseenter", show), wrap.addEventListener("mouseleave", hide), button.addEventListener("focus", show), button.addEventListener("blur", hide), button.addEventListener("click", show), button.addEventListener("keydown", (event) => {
      event.key === "Escape" && (hide(), event.stopPropagation());
    }), wrap.append(button, tip), wrap;
  }

  // src/shared/info-ui.js
  var INFO_STYLES = `
.sgs-info{min-width:0;color:var(--sgs-text);font:12px/1.65 var(--sgs-font,sans-serif)}
.sgs-info *{box-sizing:border-box}.sgs-info [hidden]{display:none!important}
.sgs-info p{margin:0 0 10px;overflow-wrap:anywhere}.sgs-info .muted{color:var(--sgs-muted);font-size:11px}
.sgs-info .bar{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:9px 0}.sgs-info .bar>*{min-width:0}
.sgs-info button{min-height:30px;border:1px solid color-mix(in srgb,var(--sgs-border) 65%,transparent);border-radius:7px;background:linear-gradient(var(--sgs-raised),var(--sgs-surface));color:var(--sgs-text);padding:4px 9px;font:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px}
.sgs-info button:hover{color:var(--sgs-accent);border-color:var(--sgs-accent)}.sgs-info button:focus-visible,.sgs-info summary:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}
.sgs-info button:disabled{opacity:.45;cursor:not-allowed}.sgs-info .primary{color:var(--sgs-accent)}.sgs-info .danger{color:var(--sgs-danger)}
.sgs-info .sgs-segments{margin:8px 0}.sgs-info .sgs-segments>button{border:0;background:transparent;padding:4px;font-size:11px}.sgs-info .sgs-segments>button[aria-pressed=true]{background:color-mix(in srgb,var(--sgs-accent) 12%,transparent)}
.sgs-info input.sgs-input{width:100%}.sgs-info .filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.sgs-info .filters label{color:var(--sgs-muted);font-size:11px;min-width:0}
.sgs-info .filters label:has(input[type=datetime-local]){grid-column:1/-1}
.sgs-info .stat{display:flex;align-items:baseline;gap:6px;margin:10px 0;font-variant-numeric:tabular-nums}.sgs-info .stat strong{font-size:25px;font-weight:600;color:var(--sgs-accent)}
.sgs-info .list{max-height:430px;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}.sgs-info .row{padding:10px 0;border-top:1px solid color-mix(in srgb,var(--sgs-border) 60%,transparent)}
.sgs-info .row-head{display:flex;justify-content:space-between;align-items:baseline;gap:6px}.sgs-info .name{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sgs-info .number{font-variant-numeric:tabular-nums;flex:none;font-size:11px}
.sgs-info progress.progress{appearance:none;display:block;width:100%;height:3px;border:0;border-radius:2px;background:var(--sgs-raised);margin:7px 0;overflow:hidden}.sgs-info progress::-webkit-progress-bar{background:var(--sgs-raised)}.sgs-info progress::-webkit-progress-value{background:var(--sgs-accent)}.sgs-info progress::-moz-progress-bar{background:var(--sgs-accent)}
.sgs-info details{font-size:11px;color:var(--sgs-muted)}.sgs-info summary{cursor:pointer}.sgs-info details p{white-space:pre-wrap;margin:6px 0;overflow-wrap:anywhere}
.sgs-info .error{color:var(--sgs-danger);white-space:pre-wrap;overflow-wrap:anywhere}.sgs-info .empty{padding:20px 4px;text-align:center;color:var(--sgs-muted)}
.sgs-info .metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;margin-top:6px;color:var(--sgs-muted);font-size:10px}.sgs-info .metrics b{display:block;font-size:14px;color:var(--sgs-text);font-variant-numeric:tabular-nums;font-weight:500}
`;
  function panelUI(ctx, container) {
    let doc = ctx.document, cleanups = [], root = doc.createElement("section");
    root.className = "sgs-info";
    let el = (tag, cls, text2) => {
      let n = doc.createElement(tag);
      return cls && (n.className = cls), text2 !== void 0 && (n.textContent = text2), n;
    };
    container.append(root);
    let scheme = (current) => {
      let hex2 = current?.tokens?.bg || "", match = /^#([\da-f]{6})$/i.exec(hex2);
      if (match) {
        let rgb = [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16));
        root.style.colorScheme = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 140 ? "light" : "dark";
      }
    };
    scheme(ctx.themes?.current), ctx.themes?.subscribe && cleanups.push(ctx.themes.subscribe(scheme));
    let listen = (node, type, fn) => {
      cleanups.push(ctx.scope.listen(node, type, fn));
    }, button = (text2, icon2, fn) => {
      let n = el("button", "", text2);
      return n.type = "button", icon2 && n.prepend(controlIcon(doc, icon2)), listen(n, "click", fn), n;
    };
    return { root, el, listen, button, segments: (items, selected, change) => {
      let group = el("div", "sgs-segments");
      for (let [value, label] of items) {
        let n = button(label, null, () => {
          for (let b of group.children) b.setAttribute("aria-pressed", String(b === n));
          change(value);
        });
        n.setAttribute("aria-pressed", String(value === selected)), group.append(n);
      }
      return group;
    }, input: (label, type = "search") => {
      let n = el("input", "sgs-input");
      return n.type = type, n.setAttribute("aria-label", label), n.placeholder = label, n;
    }, dispose: ctx.scope.add(() => {
      for (let off of cleanups) off();
      root.remove();
    }) };
  }

  // src/ui/plugin-ui.js
  var sheets = /* @__PURE__ */ new WeakMap();
  function acquirePluginStyles(root, doc) {
    let entry = sheets.get(root);
    if (!entry) {
      let style2 = doc.createElement("style");
      style2.dataset.sgsPluginControls = "", style2.textContent = CONTROL_STYLES + INFO_STYLES, root.append(style2), sheets.set(root, entry = { style: style2, users: 0 });
    }
    entry.users++;
    let released = !1;
    return () => {
      released || (released = !0, --entry.users === 0 && (entry.style.remove(), sheets.delete(root)));
    };
  }
  function mountPluginUI(context, getContext) {
    let { document: doc, scope } = context;
    return doc?.createElement && scope.add(acquirePluginStyles(doc.head || doc.documentElement, doc)), {
      icon: (spec) => createIcon(doc, spec),
      styleSwitch,
      helpTip: (text2, label) => helpTip(doc, text2, label),
      panel: (container) => panelUI(getContext(), container),
      mountStyles: (root) => scope.add(acquirePluginStyles(root, doc))
    };
  }

  // src/shared/plugin-release-notes.js
  var validReleaseNotes = (value) => value === void 0 || typeof value == "string" && value.trim().length > 0 && value.length <= 2e3 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);

  // src/core/plugin-contract.js
  var DEFAULT_PLUGIN_PRIORITY = 32768, PANEL_CATEGORIES = Object.freeze(["game", "automation", "tools", "manage", "info", "appearance"]), localId = /^[a-z][a-z0-9.-]{0,63}$/, stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, validPriority = (value) => Number.isInteger(value) && value >= 0 && value <= 65535;
  function requirePriority(value) {
    if (!validPriority(value)) throw new Error("\u6392\u5E8F\u4F18\u5148\u7EA7\u5FC5\u987B\u662F 0\u201365535 \u7684\u6574\u6570\u3002");
  }
  var text = (value, max) => typeof value == "string" && value.trim().length > 0 && value.length <= max && !/[\r\n\u0000-\u001f]/.test(value);
  function compareVersions(left, right) {
    let a = left.split(".").map(BigInt), b = right.split(".").map(BigInt);
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
    return 0;
  }
  function validatePluginPresentation(manifest, { requireContract = !1, checkCompatibility = !0 } = {}) {
    let m = manifest;
    if (!m || typeof m != "object" || Array.isArray(m)) throw new Error("\u63D2\u4EF6\u6E05\u5355\u65E0\u6548\u3002");
    if (requireContract && m.contractVersion !== 1) throw new Error("\u65B0\u63D2\u4EF6\u5FC5\u987B\u58F0\u660E contractVersion: 1 \u5E76\u9075\u5B88\u63D2\u4EF6\u5F00\u53D1\u89C4\u8303\u3002");
    if (m.contractVersion !== void 0 && m.contractVersion !== 1) throw new Error("\u4E0D\u652F\u6301\u6B64\u63D2\u4EF6\u5F00\u53D1\u7EA6\u5B9A\u7248\u672C\u3002");
    if (!Array.isArray(m.categories) || m.categories.some((c) => !PANEL_CATEGORIES.includes(c)) || new Set(m.categories).size !== m.categories.length) throw new Error("\u63D2\u4EF6\u5206\u7C7B\u65E0\u6548\u6216\u91CD\u590D\u3002");
    if (m.dependencies !== void 0 && (!Array.isArray(m.dependencies) || m.dependencies.length > 64 || m.dependencies.some((id) => typeof id != "string" || !localId.test(id) || id === m.id) || new Set(m.dependencies).size !== m.dependencies.length)) throw new Error("\u524D\u7F6E\u63D2\u4EF6\u5FC5\u987B\u662F\u4E0D\u91CD\u590D\u7684\u63D2\u4EF6 ID \u6570\u7EC4\uFF0C\u4E14\u4E0D\u80FD\u4F9D\u8D56\u81EA\u8EAB\u3002");
    if (m.dependencies?.length && (!stableVersion.test(m.minCoreVersion || "") || compareVersions(m.minCoreVersion, "0.5.62") < 0)) throw new Error("\u524D\u7F6E\u63D2\u4EF6\u529F\u80FD\u8981\u6C42 minCoreVersion \u81F3\u5C11\u4E3A 0.5.62\u3002");
    let strict = m.contractVersion === 1;
    if (strict && !text(m.name, 48)) throw new Error("\u63D2\u4EF6\u540D\u79F0\u5FC5\u987B\u662F 1\u201348 \u5B57\u7684\u5355\u884C\u6587\u5B57\u3002");
    if ((strict || m.description !== void 0) && !text(m.description, 160)) throw new Error("\u63D2\u4EF6\u7B80\u4ECB\u5FC5\u987B\u662F 1\u2013160 \u5B57\u7684\u5355\u884C\u6587\u5B57\u3002");
    if (!validReleaseNotes(m.releaseNotes)) throw new Error("\u63D2\u4EF6\u66F4\u65B0\u5185\u5BB9\u987B\u4E3A 1\u20132000 \u5B57\u7684\u975E\u7A7A\u7EAF\u6587\u672C\uFF0C\u53EF\u5206\u884C\u3002");
    if ((strict || m.icon !== void 0) && !isIconSpec(m.icon)) throw new Error("\u63D2\u4EF6\u56FE\u6807\u5FC5\u987B\u662F\u516C\u5171\u56FE\u6807\u540D\u6216\u5408\u6CD5\u7684 24\xD724 \u5355\u8272\u8DEF\u5F84\u3002");
    if ((strict || m.priority !== void 0) && requirePriority(m.priority), strict || m.minCoreVersion !== void 0) {
      if (typeof m.minCoreVersion != "string" || m.minCoreVersion.length > 48 || !stableVersion.test(m.minCoreVersion)) throw new Error("minCoreVersion \u5FC5\u987B\u662F x.y.z \u683C\u5F0F\u7684\u7A33\u5B9A\u6838\u5FC3\u7248\u672C\u3002");
      if (strict && compareVersions(m.minCoreVersion, "0.5.0") < 0) throw new Error("\u63D2\u4EF6\u5F00\u53D1\u7EA6\u5B9A v1 \u8981\u6C42 minCoreVersion \u81F3\u5C11\u4E3A 0.5.0\u3002");
      if (checkCompatibility && compareVersions(m.minCoreVersion, CORE_VERSION) > 0) throw new Error(`\u63D2\u4EF6\u9700\u8981\u6838\u5FC3 ${m.minCoreVersion} \u6216\u66F4\u65B0\u7248\u672C\uFF0C\u5F53\u524D\u4E3A ${CORE_VERSION}\u3002`);
    }
    return m;
  }
  function normalizePanel(spec, manifest) {
    if (!spec || typeof spec != "object" || typeof spec.id != "string" || !localId.test(spec.id)) throw new Error("\u9762\u677F ID \u5FC5\u987B\u662F\u7A33\u5B9A\u7684\u5C0F\u5199\u5C40\u90E8\u6807\u8BC6\u3002");
    if (typeof spec.render != "function") throw new Error("\u9762\u677F\u5FC5\u987B\u63D0\u4F9B render \u51FD\u6570\u3002");
    if (spec.title !== void 0 && !text(spec.title, 80)) throw new Error("\u9762\u677F\u6807\u9898\u5FC5\u987B\u662F 1\u201380 \u5B57\u7684\u5355\u884C\u6587\u5B57\u3002");
    let declared = manifest.categories, category = spec.category ?? (declared.length === 1 ? declared[0] : void 0);
    if (!PANEL_CATEGORIES.includes(category) || !declared.includes(category)) throw new Error("\u9762\u677F\u5206\u7C7B\u5FC5\u987B\u5728\u63D2\u4EF6 categories \u4E2D\u58F0\u660E\uFF1B\u591A\u5206\u7C7B\u63D2\u4EF6\u987B\u6307\u5B9A category\u3002");
    if (spec.priority !== void 0 && requirePriority(spec.priority), spec.gameView !== void 0 && (category !== "game" || !["battle", "shanhe"].includes(spec.gameView))) throw new Error("gameView \u4EC5\u7528\u4E8E game \u9762\u677F\uFF0C\u503C\u4E3A battle \u6216 shanhe\u3002");
    return {
      ...spec,
      id: manifest.id + ":" + spec.id,
      category,
      priority: spec.priority ?? DEFAULT_PLUGIN_PRIORITY,
      pluginId: manifest.id,
      pluginName: manifest.name,
      pluginIcon: manifest.icon ?? "package",
      pluginPriority: manifest.priority ?? DEFAULT_PLUGIN_PRIORITY
    };
  }
  var ascii = (a, b) => a < b ? -1 : a > b ? 1 : 0, priority = (value) => validPriority(value) ? value : DEFAULT_PLUGIN_PRIORITY;
  function comparePluginOrder(a, b) {
    return priority(a.priority) - priority(b.priority) || ascii(String(a.id), String(b.id)) || ascii(String(a.version || ""), String(b.version || ""));
  }
  function comparePanelOrder(a, b) {
    return priority(a.pluginPriority) - priority(b.pluginPriority) || ascii(String(a.pluginId || a.id), String(b.pluginId || b.id)) || priority(a.priority) - priority(b.priority) || ascii(String(a.id), String(b.id));
  }

  // src/core/packages.js
  var PACKAGE_FORMAT = "sgs-toolbox-plugin-v1";
  function canonical(value) {
    return Array.isArray(value) ? "[" + value.map(canonical).join(",") + "]" : value && typeof value == "object" ? "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}" : JSON.stringify(value);
  }
  async function packageDigest(manifest, code, cryptoImpl = globalThis.crypto) {
    let bytes = new TextEncoder().encode(canonical(manifest) + `
` + code);
    return Array.from(new Uint8Array(await cryptoImpl.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  function validateManifest(m, options) {
    if (!m || !/^[a-z][a-z0-9.-]{0,63}$/.test(m.id) || typeof m.name != "string" || !m.name.trim() || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(m.version)) throw new Error("\u63D2\u4EF6\u540D\u79F0\u3001ID \u6216\u7248\u672C\u65E0\u6548\u3002");
    if (m.apiVersion !== 1) throw new Error("\u63D2\u4EF6\u9700\u8981\u4E0D\u517C\u5BB9\u7684\u6838\u5FC3 API\u3002");
    validatePluginPresentation(m, options);
  }
  async function verifyPackage(pkg) {
    if (pkg?.format !== PACKAGE_FORMAT || typeof pkg.code != "string" || pkg.code.length > 10 * 1024 * 1024) throw new Error("\u63D2\u4EF6\u5305\u683C\u5F0F\u4E0D\u6B63\u786E\u6216\u8D85\u8FC7 10 MB\u3002");
    if (validateManifest(pkg.manifest), await packageDigest(pkg.manifest, pkg.code) !== String(pkg.sha256).toLowerCase()) throw new Error("\u63D2\u4EF6\u5305\u6821\u9A8C\u5931\u8D25\uFF0C\u6587\u4EF6\u53EF\u80FD\u635F\u574F\u3002");
    return pkg;
  }
  function compilePackage(pkg) {
    let module;
    try {
      module = new Function(`"use strict";
` + pkg.code)();
    } catch (e) {
      throw new Error("\u63D2\u4EF6\u4EE3\u7801\u52A0\u8F7D\u5931\u8D25\uFF08\u53EF\u80FD\u53D7\u9875\u9762 CSP \u9650\u5236\uFF09\uFF1A" + e.message);
    }
    if (!module || canonical(module.manifest) !== canonical(pkg.manifest) || typeof module.activate != "function") throw new Error("\u63D2\u4EF6\u4EE3\u7801\u4E0E\u6E05\u5355\u4E0D\u5339\u914D\u3002");
    return module;
  }

  // src/ui/native-theme.js
  var colorKeys = ["bg", "surface", "raised", "text", "muted", "accent", "border", "danger"], contexts = /* @__PURE__ */ new WeakMap(), textureCaches = /* @__PURE__ */ new WeakMap(), destruction = /* @__PURE__ */ new WeakMap(), channel = (n) => Math.max(0, Math.min(255, Math.round(n))), hex = (values) => "#" + values.map((n) => channel(n).toString(16).padStart(2, "0")).join("");
  function parseHex(value) {
    if (!/^#[\da-f]{3}(?:[\da-f]|[\da-f]{3}|[\da-f]{5})?$/i.test(value)) return null;
    let raw = value.slice(1);
    return raw.length <= 4 && (raw = [...raw].map((n) => n + n).join("")), [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16)).concat(raw.length === 8 ? parseInt(raw.slice(6), 16) / 255 : 1);
  }
  function color(value, fallback, document2, background = "#000000") {
    let rgba = typeof value == "string" && parseHex(value.trim());
    if (!rgba && typeof value == "string" && document2) {
      let ctx = contexts.get(document2);
      if (ctx === void 0) {
        try {
          let canvas = document2.createElement("canvas");
          canvas.width = canvas.height = 1, ctx = canvas.getContext("2d", { willReadFrequently: !0 });
        } catch {
          ctx = null;
        }
        contexts.set(document2, ctx || null);
      }
      if (ctx) try {
        ctx.clearRect(0, 0, 1, 1), ctx.fillStyle = fallback, ctx.fillStyle = value, ctx.fillRect(0, 0, 1, 1);
        let bytes = ctx.getImageData(0, 0, 1, 1).data;
        rgba = [bytes[0], bytes[1], bytes[2], bytes[3] / 255];
      } catch {
      }
    }
    rgba ||= parseHex(fallback);
    let base = parseHex(background);
    return hex(rgba.slice(0, 3).map((v, i) => v * rgba[3] + base[i] * (1 - rgba[3])));
  }
  function mixNativeColors(a, b, amount = 0.5) {
    if (!Number.isFinite(amount)) throw new Error("\u539F\u751F\u4E3B\u9898\u6DF7\u8272\u6BD4\u4F8B\u5FC5\u987B\u662F\u6709\u9650\u6570\u503C");
    let left = parseHex(a), right = parseHex(b), ratio = Math.max(0, Math.min(1, amount));
    if (!left || !right) throw new Error("\u539F\u751F\u4E3B\u9898\u6DF7\u8272\u9700\u8981\u5341\u516D\u8FDB\u5236\u989C\u8272");
    return hex(left.slice(0, 3).map((v, i) => v * (1 - ratio) + right[i] * ratio));
  }
  function resolveNativePalette(tokens = {}, document2) {
    let p = {};
    for (let key of colorKeys) p[key] = color(tokens[key] ?? BLACK_GOLD.tokens[key], BLACK_GOLD.tokens[key], document2, p.bg);
    return Object.freeze({
      ...p,
      borderSoft: mixNativeColors(p.bg, p.border, 0.65),
      highlight: mixNativeColors(p.accent, p.text, 0.36),
      shadow: mixNativeColors(p.bg, "#000000", tokens.scheme === "light" ? 0.04 : 0.35),
      selected: mixNativeColors(p.surface, p.accent, 0.23),
      hover: mixNativeColors(p.surface, p.accent, 0.11),
      accentSoft: mixNativeColors(p.bg, p.accent, 0.35)
    });
  }
  var DEFAULT_NATIVE_PALETTE = resolveNativePalette();
  function onDestroy(target, callback) {
    if (!target || typeof target.destroy != "function") return () => {
    };
    let entry = destruction.get(target);
    if (!entry || target.destroy !== entry.wrapper) {
      let original = target.destroy, own3 = Object.getOwnPropertyDescriptor(target, "destroy");
      entry = { callbacks: /* @__PURE__ */ new Set(), own: own3, original }, entry.wrapper = function(...args) {
        try {
          return original.apply(this, args);
        } finally {
          for (let fn of [...entry.callbacks]) fn();
        }
      };
      try {
        target.destroy = entry.wrapper;
      } catch {
        return () => {
        };
      }
      if (target.destroy !== entry.wrapper) return () => {
      };
      destruction.set(target, entry);
    }
    return entry.callbacks.add(callback), () => {
      entry.callbacks.delete(callback), entry.callbacks.size || (target.destroy === entry.wrapper && (entry.own ? Object.defineProperty(target, "destroy", entry.own) : delete target.destroy), destruction.get(target) === entry && destruction.delete(target));
    };
  }
  function cacheFor(laya) {
    let cache2 = textureCaches.get(laya);
    return cache2 || textureCaches.set(laya, cache2 = /* @__PURE__ */ new Map()), cache2;
  }
  function prune(cache2, laya) {
    for (let [key, entry] of cache2) {
      if (cache2.size <= 128) break;
      entry.pending || entry.refs || (cache2.delete(key), laya.loader.clearRes?.(entry.uri));
    }
  }
  function surfaceSVG(p, width, height, { kind, selected, hover, disabled }) {
    let panel = kind === "panel", option = kind === "option", tab = kind === "tab" || kind === "segment", active = selected && !disabled, over = hover && !disabled, radius = panel ? 6 : option ? 3 : 5, accent = disabled ? p.muted : p.accent, body;
    return option || tab ? body = `<defs><linearGradient id="wash"><stop stop-color="${accent}" stop-opacity="${active ? ".23" : ".09"}"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></linearGradient></defs>` + (active || over ? `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${radius}" fill="url(#wash)"/>` : "") + (active ? `<rect x="1" y="${option ? 7 : height - 2}" width="${option ? 2 : width - 2}" height="${option ? Math.max(1, height - 14) : 1}" rx="1" fill="${accent}"/>` : "") : body = `<defs><linearGradient id="base" x2="0" y2="1"><stop stop-color="${active ? p.selected : over ? p.hover : p.raised}"/><stop offset=".46" stop-color="${active ? mixNativeColors(p.surface, p.accent, 0.16) : p.surface}"/><stop offset="1" stop-color="${panel ? p.shadow : p.bg}"/></linearGradient><linearGradient id="rim" x2="0" y2="1"><stop stop-color="${active ? accent : p.border}"/><stop offset=".5" stop-color="${p.borderSoft}"/><stop offset="1" stop-color="${p.shadow}"/></linearGradient></defs><rect x="1" y="2" width="${width - 2}" height="${height - 3}" rx="${radius}" fill="#000" fill-opacity=".3"/><rect x=".5" y=".5" width="${width - 1}" height="${height - 2}" rx="${radius}" fill="url(#base)" stroke="url(#rim)"/><path d="M${radius + 1} 2H${width - radius - 1}" stroke="${p.highlight}" stroke-opacity="${panel ? ".16" : ".21"}"/>` + (active ? `<path d="M8 ${height - 3}H${width - 8}" stroke="${accent}" stroke-opacity=".6"/>` : ""), "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`);
  }
  function createNativeTheme({ themes, scope, window: window2 = {}, document: document2 = window2.document } = {}) {
    let states = /* @__PURE__ */ new WeakMap(), lastSignature, palette = DEFAULT_NATIVE_PALETTE;
    function current() {
      let tokens = themes?.current?.tokens || {}, signature = JSON.stringify([...colorKeys, "scheme"].map((key) => tokens[key]));
      return lastSignature !== signature && (lastSignature = signature, palette = resolveNativePalette(tokens, document2)), palette;
    }
    function watch(fn, { target } = {}) {
      if (scope.closed || target?.destroyed) return () => {
      };
      let off = () => {
      }, offDestroy = () => {
      }, active = !0, release = scope.add(() => {
        active = !1, off(), offDestroy();
      }), update = () => {
        if (!(!active || scope.closed)) {
          if (target?.destroyed) {
            release();
            return;
          }
          fn(current());
        }
      };
      try {
        off = themes?.subscribe?.(update) || (() => {
        }), offDestroy = onDestroy(target, release), update();
      } catch (error) {
        throw release(), error;
      }
      return release;
    }
    function bind(target, properties) {
      if (!target || scope.closed || target.destroyed) return () => {
      };
      let saved = /* @__PURE__ */ new Map(), applied = /* @__PURE__ */ new Map(), disposed = !1;
      for (let key of Object.keys(properties)) {
        let own3 = Object.getOwnPropertyDescriptor(target, key), inherited;
        for (let parent = Object.getPrototypeOf(target); parent && !inherited; parent = Object.getPrototypeOf(parent)) inherited = Object.getOwnPropertyDescriptor(parent, key);
        saved.set(key, { own: own3, setter: !!(own3 || inherited)?.set, value: target[key] });
      }
      let restoreFields = () => {
        if (!target.destroyed)
          for (let [key, old] of saved) applied.has(key) && target[key] === applied.get(key) && (applied.delete(key), old.setter ? target[key] = old.value : old.own ? Object.defineProperty(target, key, old.own) : delete target[key]);
      }, restore = scope.add(() => {
        disposed = !0, restoreFields();
      }), unwatch;
      try {
        unwatch = watch((p) => {
          for (let [key, value] of Object.entries(properties)) {
            if (typeof value != "function" && !Object.hasOwn(p, value)) throw new Error(`\u672A\u77E5\u539F\u751F\u4E3B\u9898\u989C\u8272\uFF1A${value}`);
            let next = typeof value == "function" ? value(p) : p[value];
            if (disposed || scope.closed || target.destroyed || (applied.set(key, next), target[key] = next, target.destroyed)) return;
            if (applied.set(key, target[key]), disposed || scope.closed) {
              restoreFields();
              return;
            }
          }
        }, { target });
      } catch (error) {
        throw restore(), error;
      }
      if (scope.closed || target.destroyed)
        return unwatch(), restore(), () => {
        };
      let offDestroy = () => {
      }, release = scope.add(() => {
        unwatch(), restore(), offDestroy();
      });
      return !scope.closed && !target.destroyed && (offDestroy = onDestroy(target, release)), release;
    }
    function surface(node, options = {}) {
      if (scope.closed || node?.destroyed || !node?.graphics) return;
      let p = current(), width = Number(options.width ?? node.width), height = Number(options.height ?? node.height);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 4 || height < 4 || width > 4096 || height > 4096) return;
      let config = { kind: options.kind || "button", selected: !!options.selected, hover: !!options.hover, disabled: !!options.disabled }, uri = surfaceSVG(p, width, height, config), laya = window2.Laya ?? window2.laya, state = states.get(node);
      if (state?.key === uri && state.entry && (state.entry.texture || state.entry.pending)) return;
      if (!state) {
        state = { key: "", entry: null, cancel: () => {
        }, active: !0 }, states.set(node, state);
        let offDestroy = () => {
        }, release = scope.add(() => {
          state.active = !1, state.cancel(), state.entry && (state.entry.refs--, !node.destroyed && node._sgsNativeSurfaceKey === state.key && node.graphics.clear(), laya && prune(cacheFor(laya), laya)), offDestroy(), states.delete(node);
        });
        offDestroy = onDestroy(node, release);
      }
      if (state.cancel(), node.graphics.clear(), state.entry && state.entry.refs--, state.entry = null, state.key = uri, node._sgsNativeSurfaceKey = uri, node._sgsNativeSurfaceAppliedKey = "", ["option", "tab", "segment"].includes(config.kind) || node.graphics.drawRect(1, 1, width - 2, height - 2, p.surface), !laya?.loader?.load || !laya?.Handler?.create) return;
      let cache2 = cacheFor(laya), entry = cache2.get(uri);
      entry ? (cache2.delete(uri), cache2.set(uri, entry)) : (entry = { uri, refs: 0, pending: !0, texture: null, waiters: /* @__PURE__ */ new Set() }, cache2.set(uri, entry)), state.entry = entry, entry.refs++;
      let draw = (texture) => {
        !texture || scope.closed || !state.active || node.destroyed || state.key !== uri || node._sgsNativeSurfaceKey !== uri || (state.cancel(), node.graphics.clear(), node.graphics.drawTexture(texture, 0, 0, width, height), node._sgsNativeSurfaceAppliedKey = uri);
      };
      if (entry.texture) {
        draw(entry.texture), prune(cache2, laya);
        return;
      }
      if (entry.waiters.add(draw), state.cancel = () => entry.waiters.delete(draw), !entry.started) {
        entry.started = !0;
        try {
          laya.loader.load(uri, laya.Handler.create(null, (texture) => {
            entry.pending = !1, entry.texture = texture;
            for (let waiter of [...entry.waiters]) waiter(texture);
            entry.waiters.clear(), texture || cache2.delete(uri), prune(cache2, laya);
          }), null, laya.Loader?.IMAGE);
        } catch (error) {
          throw entry.pending = !1, cache2.delete(uri), entry.waiters.clear(), error;
        }
      }
    }
    return Object.freeze({
      get palette() {
        return current();
      },
      watch,
      bind,
      surface,
      chevron(node, x, y, open, ink = current().accent) {
        scope.closed || node?.destroyed || (node.graphics.clear(), node.graphics.drawLines(x, y, open ? [0, 3, 3, 0, 6, 3] : [0, 0, 3, 3, 6, 0], ink, 1.2));
      },
      get cacheStats() {
        let laya = window2.Laya ?? window2.laya, entries = laya ? [...cacheFor(laya).values()] : [];
        return { entries: entries.length, pending: entries.filter((e) => e.pending).length, live: entries.reduce((n, e) => n + e.refs, 0) };
      }
    });
  }

  // src/core/plugins.js
  var PluginManager = class {
    constructor({ journal, store, settings, context, onChange = () => {
    } }) {
      Object.assign(this, { journal, store, settings, context, onChange }), this.builtins = /* @__PURE__ */ new Map(), this.slots = /* @__PURE__ */ new Map(), this.tail = Promise.resolve(), this.errors = [], this.closed = !1, this.unsubscribe = journal.subscribe((event) => {
        let changed = !1;
        for (let slot of this.slots.values())
          try {
            this.reduce(slot, event);
            for (let fn of slot.listeners) fn(slot.state, event);
          } catch (e) {
            this.runtimeError(slot, e);
          }
        changed && this.onChange();
      });
    }
    serial(fn) {
      let work = this.tail.catch(() => {
      }).then(() => {
        if (this.closed) throw new Error("\u63D2\u4EF6\u7BA1\u7406\u5668\u5DF2\u505C\u6B62");
        return fn();
      });
      return this.tail = work, work;
    }
    registerBuiltin(module) {
      validateManifest(module.manifest), this.builtins.set(module.manifest.id, module);
    }
    async registerBundled(pkg, replacesPackageDigests = []) {
      await verifyPackage(pkg), this.registerBuiltin({ ...compilePackage(pkg), bundledPackage: pkg, replacesPackageDigests });
    }
    makeSlot(module, record) {
      let slot = { module, record, state: module.initialState?.() ?? {}, listeners: /* @__PURE__ */ new Set(), scope: null, active: !1, sessionId: null, cursor: 0, error: "" };
      for (let event of this.journal.events) this.reduce(slot, event);
      return slot;
    }
    reduce(slot, event) {
      event.seq <= slot.cursor || (slot.sessionId !== event.sessionId && (slot.state = slot.module.initialState?.() ?? {}, slot.sessionId = event.sessionId), slot.module.reduce && (slot.state = slot.module.reduce(slot.state, event)), slot.cursor = event.seq);
    }
    dependencyError(message) {
      return Object.assign(new Error(message), { dependency: !0 });
    }
    assertGraph(module, path = []) {
      let id = module.manifest.id;
      if (path.includes(id)) throw this.dependencyError("\u524D\u7F6E\u63D2\u4EF6\u5FAA\u73AF\u4F9D\u8D56\uFF1A" + [...path, id].join(" \u2192 "));
      for (let dep of module.manifest.dependencies || []) {
        let target = this.slots.get(dep)?.module;
        target && this.assertGraph(target, [...path, id]);
      }
    }
    assertUnused(id) {
      let users = [...this.slots.values()].filter((s) => s.record.enabled && s.module.manifest.dependencies?.includes(id));
      if (users.length) throw this.dependencyError("\u8BF7\u5148\u505C\u7528\u4F9D\u8D56\u6B64\u63D2\u4EF6\u7684\uFF1A" + users.map((s) => s.module.manifest.name).join("\u3001"));
    }
    enabledDependents(id) {
      let seen = /* @__PURE__ */ new Set([id]), stoppedFirst = [], visit = (target) => {
        for (let slot of this.slots.values()) {
          let next = slot.module.manifest.id;
          seen.has(next) || !slot.module.manifest.dependencies?.includes(target) || (seen.add(next), visit(next), slot.record.enabled && stoppedFirst.push(slot));
        }
      };
      return visit(id), stoppedFirst.reverse();
    }
    runtimeError(slot, error) {
      if (this.closed || slot.recovering) return;
      let message = String(error?.stack || error);
      if (!slot.record.enabled || slot.restartUsed) {
        slot.error !== message && (slot.error = message, this.onChange());
        return;
      }
      slot.restartUsed = !0, slot.recovering = !0;
      let scope = slot.scope;
      this.serial(async () => {
        if (this.slots.get(slot.module.manifest.id) !== slot || slot.scope !== scope || !slot.record.enabled) {
          slot.recovering = !1;
          return;
        }
        this.deactivate(slot), slot.error = "";
        try {
          for (let event of this.journal.events) this.reduce(slot, event);
          await this.activate(slot), slot.error = slot.reportedError || "";
        } catch (e) {
          slot.error = `\u81EA\u52A8\u91CD\u542F\u5931\u8D25\uFF1A${String(e?.stack || e)}
\u9996\u6B21\u9519\u8BEF\uFF1A${message}`;
        }
        slot.recovering = !1, slot.error && this.context.notify?.(`\u63D2\u4EF6 ${slot.module.manifest.name} \u81EA\u52A8\u91CD\u542F\u540E\u4ECD\u6709\u9519\u8BEF\uFF0C\u8BF7\u67E5\u770B\u8BE6\u60C5\u3002`), this.onChange();
      }).catch(() => {
      }).finally(() => {
        slot.recovering = !1;
      });
    }
    async activate(slot, path = []) {
      try {
        return await this.activateOnce(slot, path);
      } catch (error) {
        if (error.dependency || this.closed || slot.restartUsed) throw error;
        return slot.restartUsed = !0, this.deactivate(slot), this.activateOnce(slot, path);
      }
    }
    async activateOnce(slot, path = []) {
      if (this.closed) throw new Error("\u63D2\u4EF6\u7BA1\u7406\u5668\u5DF2\u505C\u6B62");
      if (slot.active) return;
      let pluginId = slot.module.manifest.id;
      if (path.includes(pluginId)) throw this.dependencyError("\u524D\u7F6E\u63D2\u4EF6\u5FAA\u73AF\u4F9D\u8D56\uFF1A" + [...path, pluginId].join(" \u2192 "));
      for (let id2 of slot.module.manifest.dependencies || []) {
        let dep = this.slots.get(id2), name = dep?.module.manifest.name || this.builtins.get(id2)?.manifest.name || id2;
        if (!dep) throw this.dependencyError("\u524D\u7F6E\u63D2\u4EF6\u300C" + name + "\u300D\u672A\u5B89\u88C5\uFF0C\u8BF7\u5148\u5B89\u88C5\u5E76\u542F\u7528\u3002");
        if (!dep.record.enabled) throw this.dependencyError("\u524D\u7F6E\u63D2\u4EF6\u300C" + name + "\u300D\u5DF2\u505C\u7528\uFF0C\u8BF7\u5148\u542F\u7528\u3002");
        try {
          await this.activate(dep, [...path, pluginId]);
        } catch (error) {
          throw this.dependencyError("\u524D\u7F6E\u63D2\u4EF6\u300C" + name + "\u300D\u65E0\u6CD5\u8FD0\u884C\uFF1A" + error.message);
        }
      }
      if (this.closed) throw new Error("\u63D2\u4EF6\u7BA1\u7406\u5668\u5DF2\u505C\u6B62");
      let scope = new ResourceScope();
      slot.scope = scope, slot.reportedError = "";
      let id = slot.module.manifest.id, ctx = {
        ...this.context,
        scope,
        settings: this.settings.namespace(id),
        storage: this.settings.namespace(id),
        getState: () => slot.state,
        subscribe: (fn) => {
          slot.listeners.add(fn);
          let off = () => slot.listeners.delete(fn);
          return scope.add(off), off;
        },
        reportError: (value) => {
          if (scope.closed) return;
          let message = value == null ? "" : String(value?.stack || value);
          if (slot.reportedError = message, message) {
            slot.active && this.runtimeError(slot, value);
            return;
          }
          slot.error && (slot.error = "", this.onChange());
        },
        ui: {
          ...mountPluginUI({ ...this.context, scope }, () => ctx),
          nativeTheme: createNativeTheme({ ...this.context, scope }),
          registerCompactSummary: () => {
            let id2 = slot.module.manifest.id;
            return scope.add(() => this.context.ui.setCompactSummary?.(id2, [])), (items) => {
              scope.closed || this.context.ui.setCompactSummary?.(id2, items);
            };
          },
          registerPanel: (spec) => {
            if (scope.closed) return () => {
            };
            let panel = normalizePanel(spec, slot.module.manifest), render = panel.render;
            return panel.render = (container) => {
              let root = container.getRootNode?.(), release = root?.host ? acquirePluginStyles(root, this.context.document) : () => {
              };
              try {
                let cleanup = render(container);
                return () => {
                  try {
                    cleanup?.();
                  } finally {
                    release();
                  }
                };
              } catch (error) {
                throw release(), error;
              }
            }, scope.add(this.context.ui.registerPanel(panel));
          }
        },
        backgrounds: {
          isInstalled: () => !scope.closed && this.slots.has("backgrounds"),
          register: () => scope.closed ? () => {
          } : scope.add(this.context.backgrounds.register(id)),
          select: (spec) => {
            scope.closed || this.context.backgrounds.select(id, spec);
          },
          subscribe: (fn) => scope.closed ? () => {
          } : scope.add(this.context.backgrounds.subscribe(fn)),
          get current() {
            return thisContext.backgrounds.current;
          },
          get status() {
            return thisContext.backgrounds.status;
          }
        },
        cardStyles: {
          register: (style2) => scope.closed ? () => {
          } : scope.add(this.context.cardStyles.register(style2, id)),
          list: () => this.context.cardStyles.list(),
          select: (styleId) => {
            scope.closed || this.context.cardStyles.select(styleId);
          },
          subscribe: (fn) => scope.closed ? () => {
          } : scope.add(this.context.cardStyles.subscribe(fn)),
          selectSide: (side, styleId) => {
            scope.closed || this.context.cardStyles.selectSide(side, styleId);
          },
          selectScope: (value) => {
            scope.closed || this.context.cardStyles.selectScope(value);
          },
          get selection() {
            return thisContext.cardStyles.selection;
          },
          get current() {
            return thisContext.cardStyles.current;
          }
        },
        themes: {
          register: (theme) => scope.add(this.context.themes.register(theme, id)),
          override: (tokens, priority2) => scope.add(this.context.themes.override(id, tokens, priority2)),
          select: (themeId) => {
            scope.closed || this.context.themes.select(themeId);
          },
          list: () => this.context.themes.list(),
          subscribe: (fn) => scope.add(this.context.themes.subscribe((current) => {
            scope.closed || fn(current);
          })),
          get current() {
            return thisContext.themes.current;
          }
        }
      }, thisContext = this.context;
      try {
        let result = await slot.module.activate(ctx);
        if (typeof result == "function" ? scope.add(result) : result?.dispose && scope.add(() => result.dispose()), this.closed || scope.closed) throw new Error("\u63D2\u4EF6\u6FC0\u6D3B\u5DF2\u53D6\u6D88");
        slot.active = !0, slot.error = "", slot.reportedError && this.runtimeError(slot, slot.reportedError);
      } catch (e) {
        throw scope.dispose(), slot.scope = null, e;
      }
    }
    deactivate(slot) {
      slot.scope?.dispose(), slot.scope = null, slot.active = !1, slot.listeners.clear();
    }
    async init() {
      let stored = [];
      try {
        stored = await this.store.list();
      } catch (e) {
        this.errors.push(e.message);
      }
      if (this.closed) return;
      let records = new Map(stored.map((r) => [r.id, r]));
      for (let id of /* @__PURE__ */ new Set([...this.builtins.keys(), ...records.keys()])) {
        let record = records.get(id) || { id, active: null, previous: null, enabled: !0, uninstalled: !1 };
        if (record.uninstalled) continue;
        let module = this.builtins.get(id);
        if (record.active)
          try {
            await verifyPackage(record.active), module = compilePackage(record.active);
          } catch (e) {
            if (this.errors.push(`${id}: ${e.message}`), record.active = null, record.previous && !record.previous.builtin)
              try {
                await verifyPackage(record.previous), module = compilePackage(record.previous), record.active = record.previous;
              } catch {
              }
            record.previous = null;
            try {
              await this.store.put(record);
            } catch (persistError) {
              this.errors.push(`${id}: ${persistError.message}`);
            }
          }
        let builtin = this.builtins.get(id);
        if (record.active && builtin?.replacesPackageDigests?.includes(record.active.sha256) && !record.appliedBuiltinMigrations?.includes(record.active.sha256)) {
          let upgraded = { ...record, active: null, previous: record.active, appliedBuiltinMigrations: [...record.appliedBuiltinMigrations || [], record.active.sha256] };
          try {
            await this.store.put(upgraded), record = upgraded, module = builtin, this.context.notify?.(`${builtin.manifest.name}\u5DF2\u66F4\u65B0\u81F3\u968F\u6838\u5FC3\u63D0\u4F9B\u7684 ${builtin.manifest.version}`);
          } catch (error) {
            this.errors.push(`${id}: \u5185\u7F6E\u4FEE\u590D\u66F4\u65B0\u672A\u4FDD\u5B58\uFF1A${error.message}`);
          }
        }
        if (this.closed) return;
        if (!module) continue;
        if (builtin?.bundledPackage && (!record.active || record.previous?.builtin)) {
          let portable = {
            ...record,
            active: record.active || builtin.bundledPackage,
            previous: record.previous?.builtin ? builtin.bundledPackage : record.previous
          };
          try {
            await this.store.put(portable), record = portable;
          } catch (error) {
            this.errors.push(`${id}: \u63D2\u4EF6\u72EC\u7ACB\u4FDD\u5B58\u5931\u8D25\uFF0C\u5207\u6362\u8F7B\u91CF\u7248\u524D\u8BF7\u4FEE\u590D\u5B58\u50A8\uFF1A${error.message}`);
          }
        }
        if (this.closed) return;
        let slot = this.makeSlot(module, record);
        this.slots.set(id, slot);
      }
      for (let [id, slot] of this.slots) {
        let { record } = slot;
        if (record.enabled)
          try {
            await this.activate(slot);
          } catch (e) {
            this.errors.push(`${id}: ${e.message}`), this.deactivate(slot);
            let alternatives = e.dependency ? [] : [record.previous, this.builtins.has(id) ? { builtin: !0 } : null].filter(Boolean), recovered = !1;
            for (let alt of alternatives)
              try {
                let fallback = alt.builtin ? this.builtins.get(id) : (await verifyPackage(alt), compilePackage(alt));
                if (!fallback) continue;
                let fallbackRecord = { ...record, active: alt.builtin ? fallback.bundledPackage || null : alt, previous: null }, fallbackSlot = this.makeSlot(fallback, fallbackRecord);
                this.slots.set(id, fallbackSlot), await this.activate(fallbackSlot), await this.store.put(fallbackRecord), recovered = !0;
                break;
              } catch {
                this.deactivate(this.slots.get(id));
              }
            recovered || (this.slots.set(id, slot), slot.error = e.message);
          }
      }
      this.onChange();
    }
    list() {
      return [...this.slots.values()].map((s) => ({ ...s.module.manifest, enabled: s.record.enabled, active: s.active, error: s.error, ...s.maintenance ? { maintenance: s.maintenance } : {}, hasPrevious: !!s.record.previous, source: s.record.active ? "\u63D2\u4EF6\u5E02\u573A / \u6587\u4EF6" : "\u5185\u7F6E" })).sort(comparePluginOrder);
    }
    install(pkg) {
      return this.serial(async () => (await verifyPackage(pkg), this.swap(pkg.manifest.id, compilePackage(pkg), pkg, void 0, { restartDependents: !0 })));
    }
    async swap(id, module, pkg, previousOverride, { restartDependents = !1 } = {}) {
      let old = this.slots.get(id);
      old && !restartDependents && this.assertUnused(id), this.slots.set(id, { module });
      try {
        this.assertGraph(module);
      } finally {
        old ? this.slots.set(id, old) : this.slots.delete(id);
      }
      let record = { id, enabled: old?.record.enabled ?? !0, uninstalled: !1, active: pkg, previous: previousOverride ?? (old ? old.record.active || { builtin: !0 } : null), appliedBuiltinMigrations: old?.record.appliedBuiltinMigrations || [] }, candidate = this.makeSlot(module, record), dependents = old && restartDependents ? this.enabledDependents(id) : [];
      for (let slot of [...dependents].reverse())
        slot.maintenance = "waiting", this.deactivate(slot);
      let updateError, recoveryErrors = [];
      try {
        old && this.deactivate(old), restartDependents && (candidate.maintenance = "updating"), this.slots.set(id, candidate);
        try {
          if (this.onChange(), record.enabled && await this.activate(candidate), this.closed) throw new Error("\u63D2\u4EF6\u5B89\u88C5\u5DF2\u53D6\u6D88");
          await this.store.put(record);
        } catch (error) {
          if (this.deactivate(candidate), this.slots.delete(id), old && !this.closed) {
            let restored = this.makeSlot(old.module, old.record);
            if (restored.maintenance = candidate.maintenance, this.slots.set(id, restored), old.record.enabled)
              try {
                await this.activate(restored);
              } catch (e) {
                restored.error = e.message;
              }
          }
          throw error;
        }
      } catch (error) {
        updateError = error;
      } finally {
        let failed = /* @__PURE__ */ new Set();
        this.slots.get(id)?.active || failed.add(id);
        for (let slot of dependents) {
          let dependentId = slot.module.manifest.id;
          if (this.closed) break;
          if (!(this.slots.get(dependentId) !== slot || !slot.record.enabled)) {
            slot.maintenance = "restarting";
            try {
              let blocked = slot.module.manifest.dependencies?.find((dep) => failed.has(dep));
              if (blocked) throw this.dependencyError("\u524D\u7F6E\u63D2\u4EF6\u300C" + (this.slots.get(blocked)?.module.manifest.name || blocked) + "\u300D\u672A\u80FD\u6062\u590D\u8FD0\u884C");
              slot.restartUsed = !1, this.onChange(), await this.activate(slot);
            } catch (error) {
              this.deactivate(slot), failed.add(dependentId), slot.error = "\u66F4\u65B0\u540E\u91CD\u542F\u5931\u8D25\uFF1A" + String(error?.stack || error), recoveryErrors.push(new Error(slot.module.manifest.name + "\uFF1A" + (error?.message || String(error)), { cause: error }));
            } finally {
              delete slot.maintenance;
            }
          }
        }
        delete candidate.maintenance;
        let current = this.slots.get(id);
        current && delete current.maintenance;
        for (let slot of dependents) delete slot.maintenance;
        this.closed || this.onChange();
      }
      if (recoveryErrors.length && !this.closed) {
        let message = (updateError ? updateError.message + `
` : module.manifest.name + " \u5DF2\u66F4\u65B0\uFF0C\u4F46") + "\u4F9D\u8D56\u63D2\u4EF6\u91CD\u542F\u5931\u8D25\uFF1A" + recoveryErrors.map((error) => error.message).join("\uFF1B");
        throw new AggregateError(updateError ? [updateError, ...recoveryErrors] : recoveryErrors, message);
      }
      if (updateError) throw updateError;
      if (this.closed) throw new Error("\u63D2\u4EF6\u5B89\u88C5\u5DF2\u53D6\u6D88");
      return module.manifest;
    }
    enable(id, enabled = !0) {
      return this.serial(async () => {
        let slot = this.slots.get(id);
        if (!slot) throw new Error("\u63D2\u4EF6\u672A\u5B89\u88C5");
        if (enabled || this.assertUnused(id), enabled && !slot.active) {
          slot.restartUsed = !1;
          try {
            await this.activate(slot);
          } catch (e) {
            throw slot.error = e?.message || String(e), this.onChange(), e;
          }
        }
        try {
          await this.store.put({ ...slot.record, enabled });
        } catch (e) {
          throw enabled && !slot.record.enabled && this.deactivate(slot), e;
        }
        slot.record.enabled = enabled, enabled || this.deactivate(slot), this.onChange();
      });
    }
    disable(id) {
      return this.enable(id, !1);
    }
    reload(id) {
      return this.serial(async () => {
        let slot = this.slots.get(id);
        if (!slot) throw new Error("\u63D2\u4EF6\u672A\u5B89\u88C5");
        return this.swap(id, slot.module, slot.record.active, slot.record.previous);
      });
    }
    rollback(id) {
      return this.serial(async () => {
        let slot = this.slots.get(id), previous = slot?.record.previous;
        if (!previous) throw new Error("\u6CA1\u6709\u53EF\u56DE\u9000\u7248\u672C");
        let module = previous.builtin ? this.builtins.get(id) : (await verifyPackage(previous), compilePackage(previous));
        if (!module) throw new Error("\u5185\u7F6E\u7248\u672C\u4E0D\u5B58\u5728");
        return this.swap(id, module, previous.builtin ? module.bundledPackage || null : previous);
      });
    }
    uninstall(id) {
      return this.serial(async () => {
        this.assertUnused(id), await this.store.put({ id, uninstalled: !0, enabled: !1, active: null, previous: null });
        let slot = this.slots.get(id);
        slot && this.deactivate(slot), this.slots.delete(id), this.onChange();
      });
    }
    restoreBuiltin(id) {
      return this.serial(async () => {
        let module = this.builtins.get(id);
        if (!module) throw new Error("\u6CA1\u6709\u6B64\u5185\u7F6E\u63D2\u4EF6");
        return this.swap(id, module, module.bundledPackage || null);
      });
    }
    dispose() {
      this.closed = !0, this.unsubscribe();
      for (let slot of [...this.slots.values()].reverse()) this.deactivate(slot);
    }
  };

  // src/core/config-data.js
  var ALLOWED = /* @__PURE__ */ new Set(["gn_zonghe", "cha_gs_dbs_fs_skininfo", "ff_jubaopen", "ff_dbs_pay_gift", "sys_gs_dbs_fs_goodsbaseinfo", "cha_dbs_general_series", "ff_task_daily", "mod_new_ttrank_config", "ff_general_chest_info_config", "gn_dbs_giftbag", "hd_roguelike", "cha_spell", "sys_playcard", "character", "gn_gs_ahievement", "ff_qifu_new", "ff_tiangong", "h5_officer"]);
  ALLOWED.add("sys_h5_shop");
  ALLOWED.add("gn_dbs_coupon_cfg");
  ALLOWED.add("hd_fight_lord_config");
  var ARCHIVE_LIMIT = 64 * 1024 * 1024, ENTRY_LIMIT = 16 * 1024 * 1024, read = (fn) => {
    try {
      return fn();
    } catch {
      return;
    }
  }, normalize = (name) => String(name).replace(/\.sgs$/, ""), cancelled = () => new Error("\u914D\u7F6E\u8BFB\u53D6\u5DF2\u53D6\u6D88");
  async function boundedStream(stream, limit2) {
    let reader = stream.getReader(), chunks = [], length = 0;
    try {
      for (; ; ) {
        let { done, value } = await reader.read();
        if (done) break;
        if (length += value.byteLength, length > limit2) throw new Error("\u914D\u7F6E\u6587\u4EF6\u8D85\u8FC7\u8BFB\u53D6\u4E0A\u9650");
        chunks.push(value);
      }
    } catch (error) {
      throw await reader.cancel().catch(() => {
      }), error;
    } finally {
      reader.releaseLock();
    }
    let bytes = new Uint8Array(length), offset = 0;
    for (let chunk of chunks)
      bytes.set(chunk, offset), offset += chunk.length;
    return bytes;
  }
  async function inflate(bytes, format, win) {
    let Decompressor = win.DecompressionStream || globalThis.DecompressionStream;
    if (!Decompressor) throw new Error("\u6D4F\u89C8\u5668\u7F3A\u5C11\u914D\u7F6E\u89E3\u538B\u652F\u6301");
    let BlobType = win.Blob || globalThis.Blob;
    return boundedStream(new BlobType([bytes]).stream().pipeThrough(new Decompressor(format)), ENTRY_LIMIT);
  }
  async function readZipEntry(bytes, filename, win = globalThis) {
    let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), end = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
      if (view.getUint32(i, !0) === 101010256 && i + 22 + view.getUint16(i + 20, !0) === bytes.length) {
        end = i;
        break;
      }
    if (end < 0 || view.getUint16(end + 4, !0) || view.getUint16(end + 6, !0)) throw new Error("\u5B98\u65B9\u914D\u7F6E\u5305 ZIP \u683C\u5F0F\u4E0D\u652F\u6301");
    let count = view.getUint16(end + 10, !0), directorySize = view.getUint32(end + 12, !0), cursor = view.getUint32(end + 16, !0), directoryEnd = cursor + directorySize;
    if (count > 4096 || directoryEnd > end) throw new Error("\u5B98\u65B9\u914D\u7F6E\u5305\u76EE\u5F55\u65E0\u6548");
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > directoryEnd || view.getUint32(cursor, !0) !== 33639248) throw new Error("\u5B98\u65B9\u914D\u7F6E\u5305\u76EE\u5F55\u635F\u574F");
      let flags = view.getUint16(cursor + 8, !0), method = view.getUint16(cursor + 10, !0), packed = view.getUint32(cursor + 20, !0), unpacked = view.getUint32(cursor + 24, !0), nameSize = view.getUint16(cursor + 28, !0), extraSize = view.getUint16(cursor + 30, !0), commentSize = view.getUint16(cursor + 32, !0), next = cursor + 46 + nameSize + extraSize + commentSize;
      if (next > directoryEnd) throw new Error("\u5B98\u65B9\u914D\u7F6E\u5305\u76EE\u5F55\u8D8A\u754C");
      if (new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameSize)) === filename) {
        let offset = view.getUint32(cursor + 42, !0);
        if (flags & 1 || packed > ENTRY_LIMIT || unpacked > ENTRY_LIMIT || offset + 30 > bytes.length || view.getUint32(offset, !0) !== 67324752) throw new Error("\u914D\u7F6E\u6761\u76EE\u683C\u5F0F\u6216\u5927\u5C0F\u4E0D\u652F\u6301");
        let start = offset + 30 + view.getUint16(offset + 26, !0) + view.getUint16(offset + 28, !0);
        if (start + packed > bytes.length) throw new Error("\u914D\u7F6E\u6761\u76EE\u8D8A\u754C");
        let compressed = bytes.subarray(start, start + packed), output = method === 0 ? compressed.slice() : method === 8 ? await inflate(compressed, "deflate-raw", win) : null;
        if (!output || output.length !== unpacked) throw new Error("\u914D\u7F6E\u6761\u76EE\u89E3\u538B\u5931\u8D25");
        return output;
      }
      cursor = next;
    }
    throw new Error(`\u5B98\u65B9\u914D\u7F6E\u5305\u7F3A\u5C11 ${filename}`);
  }
  function createConfigData(win, scope) {
    let cache2 = /* @__PURE__ */ new Map(), pending = /* @__PURE__ */ new Map(), archivePromise;
    function validate(name) {
      if (name = normalize(name), !ALLOWED.has(name)) throw new Error(`\u5C1A\u672A\u58F0\u660E\u7684\u914D\u7F6E\u8868\uFF1A${name}`);
      return name;
    }
    function getConfigData(name) {
      name = validate(name);
      for (let container of [
        read(() => win.CtrUtil.AllDatas),
        read(() => win.SystemContext.AllDatas),
        read(() => win.__SGS_TOOLBOX_DEMO__.configs)
      ]) {
        let data = read(() => container[`${name}.sgs`]) || read(() => container[name]);
        if (data && typeof data == "object") return data;
      }
      return cache2.get(name) || null;
    }
    function archiveUrl() {
      let origin = read(() => win.location.origin);
      if (origin !== "https://web.sanguosha.com" && origin !== "http://web.sanguosha.com") throw new Error("\u7B49\u5F85\u6E38\u620F\u914D\u7F6E\u6570\u636E\u5C31\u7EEA");
      let entries = read(() => win.performance.getEntriesByType("resource")) || [];
      for (let entry of entries.slice(-2048).reverse())
        try {
          let url = new URL(entry.name);
          if (url.protocol === "https:" && url.hostname === "web.sanguosha.com" && /\/Config_w\.sgs$/.test(url.pathname) && !url.username && !url.password) return url.href;
        } catch {
        }
      let version = read(() => win.resourceVersion);
      if (!["string", "number"].includes(typeof version) || !String(version).trim()) throw new Error("\u7B49\u5F85\u5BA2\u6237\u7AEF\u8D44\u6E90\u7248\u672C\u5C31\u7EEA\uFF0C\u8BF7\u7A0D\u540E\u5237\u65B0");
      return `https://web.sanguosha.com/220/h5_2/res/config/Config_w.sgs?v=${encodeURIComponent(String(version))}`;
    }
    async function archive() {
      return archivePromise || (archivePromise = (async () => {
        let controller = new AbortController(), cleanup = scope.add(() => controller.abort()), timer = setTimeout(() => controller.abort(), 3e4);
        try {
          let response = await win.fetch(archiveUrl(), { signal: controller.signal, credentials: "omit", redirect: "error" });
          if (!response.ok) throw new Error(`\u5B98\u65B9\u914D\u7F6E\u8BFB\u53D6\u5931\u8D25\uFF08${response.status}\uFF09`);
          if (Number(response.headers.get("content-length")) > ARCHIVE_LIMIT) throw new Error("\u5B98\u65B9\u914D\u7F6E\u5305\u8D85\u8FC7\u8BFB\u53D6\u4E0A\u9650");
          if (!response.body) throw new Error("\u5B98\u65B9\u914D\u7F6E\u5305\u54CD\u5E94\u4E3A\u7A7A");
          return await boundedStream(response.body, ARCHIVE_LIMIT);
        } finally {
          clearTimeout(timer), cleanup();
        }
      })().catch((error) => {
        throw archivePromise = null, error;
      })), archivePromise;
    }
    async function loadConfigData(name) {
      if (name = validate(name), scope.closed) throw cancelled();
      let existing = getConfigData(name);
      return existing || (pending.has(name) || pending.set(name, (async () => {
        let ctrClass = read(() => win.CtrUtil) || read(() => typeof CtrUtil < "u" ? CtrUtil : null), decryptor = read(() => ctrClass.Ctr);
        if (typeof read(() => decryptor.Ofb_Dec) != "function") throw new Error("\u7B49\u5F85\u6E38\u620F\u914D\u7F6E\u89E3\u7801\u5668\u5C31\u7EEA");
        let packed = await archive();
        if (scope.closed) throw cancelled();
        let encrypted = await readZipEntry(packed, `${name}.sgs`, win);
        if (scope.closed) throw cancelled();
        let decrypted = decryptor.Ofb_Dec(encrypted.buffer.slice(encrypted.byteOffset, encrypted.byteOffset + encrypted.byteLength)), bytes = decrypted instanceof ArrayBuffer ? new Uint8Array(decrypted) : ArrayBuffer.isView(decrypted) ? new Uint8Array(decrypted.buffer, decrypted.byteOffset, decrypted.byteLength) : Array.isArray(decrypted) && decrypted.length <= ENTRY_LIMIT && decrypted.every((value) => Number.isInteger(value) && value >= 0 && value <= 255) ? Uint8Array.from(decrypted) : null;
        if (!bytes || bytes.byteLength > ENTRY_LIMIT) throw new Error("\u6E38\u620F\u914D\u7F6E\u89E3\u7801\u7ED3\u679C\u65E0\u6548");
        let plain = await inflate(bytes, "gzip", win);
        if (scope.closed) throw cancelled();
        let data = JSON.parse(new TextDecoder("utf-8", { fatal: !0 }).decode(plain));
        if (!data || typeof data != "object" || Array.isArray(data)) throw new Error("\u6E38\u620F\u914D\u7F6E\u5185\u5BB9\u65E0\u6548");
        return cache2.set(name, data), data;
      })().finally(() => pending.delete(name))), pending.get(name));
    }
    return scope.add(() => {
      cache2.clear(), pending.clear(), archivePromise = null;
    }), { getConfigData, loadConfigData };
  }

  // src/core/seat.js
  var read2 = (fn) => {
    try {
      return fn();
    } catch {
      return;
    }
  };
  function nativeSeatOccupied(ui) {
    let seat = nativeSeat(ui);
    return read2(() => seat.IsFull) !== !1;
  }
  function nativeSeatPosition(ui) {
    let seat = nativeSeat(ui), value = read2(() => seat.FixedViewId) ?? read2(() => seat.fixedViewId);
    return Number.isInteger(value) && value >= 1 && value <= 255 ? value : void 0;
  }
  function nativeSeat(ui) {
    return read2(() => ui.Seat) ?? read2(() => ui.seat) ?? read2(() => ui.cardContainer.Seat) ?? read2(() => ui.cardContainer.seat) ?? null;
  }
  function nativeSeatId(ui) {
    let seat = nativeSeat(ui);
    for (let value of [
      read2(() => seat.index),
      read2(() => seat.Index),
      read2(() => seat.SeatID),
      read2(() => seat.ID),
      read2(() => ui.seatID),
      read2(() => ui.seatId)
    ]) {
      if (value == null || value === "" || typeof value == "boolean") continue;
      let id = Number(value);
      if (Number.isInteger(id) && id >= 0 && id < 255) return id;
    }
  }

  // src/core/game.js
  var GAME_SCENE = /(?:^|\.)(?:GameScene|TableScene|HallScene)$/, read3 = (fn) => {
    try {
      return fn();
    } catch {
      return;
    }
  }, object = (value) => value && (typeof value == "object" || typeof value == "function") ? value : null, alive = (value) => !!(object(value) && read3(() => value.destroyed) !== !0), children = (node) => Array.isArray(read3(() => node._children)) ? node._children : [];
  function list(value) {
    return Array.isArray(value) ? value : object(value) ? typeof value.values == "function" ? read3(() => [...value.values()]) || [] : read3(() => Object.values(value)) || [] : [];
  }
  function number(...values) {
    for (let value of values) {
      if (value == null || value === "") continue;
      let result = Number(value);
      if (Number.isFinite(result)) return result;
    }
  }
  function cardId(card) {
    return typeof card == "number" || typeof card == "string" ? number(card) : number(read3(() => card.CardId), read3(() => card.CardID), read3(() => card.ID), read3(() => card.Id), read3(() => card.id), read3(() => card.cardId), read3(() => card.cardID));
  }
  function cardIds(cards) {
    return [...new Set(list(cards).map(cardId).filter((id) => Number.isInteger(id) && id > 0))];
  }
  function publicHandIds(seat, ui) {
    let shown = [], cached = [], hidden = /* @__PURE__ */ new Set();
    for (let owner of [seat, ui]) for (let key of ["HandShowCards", "handShowCards", "HandShowCardIDs", "handShowCardIDs"]) {
      let values = read3(() => owner[key]);
      if (!Array.isArray(values)) continue;
      let length = read3(() => values.length);
      if (!Number.isInteger(length) || length < 0) continue;
      let target = key.endsWith("IDs") ? cached : shown;
      for (let i = 0; i < length && i < 2048; i++) {
        let value = read3(() => values[i]), card = object(read3(() => value.Card)) || object(read3(() => value.card)) || object(read3(() => value.cardInfo)) || value, id = cardId(card);
        !Number.isInteger(id) || id <= 0 || (read3(() => value.IsHide) === !0 || read3(() => value.isHide) === !0 || read3(() => card.IsHide) === !0 || read3(() => card.isHide) === !0 ? hidden.add(id) : target.push(id));
      }
    }
    return [...new Set((shown.length ? shown : cached).filter((id) => !hidden.has(id)))];
  }
  function sceneName(scene) {
    return String(read3(() => scene.SceneName) || read3(() => scene.sceneName) || read3(() => scene.name) || (read3(() => scene.constructor.name) !== "Object" ? read3(() => scene.constructor.name) : "") || "");
  }
  function isGameScene(scene) {
    return alive(scene) && !!(read3(() => scene.SelfSeatUi) || read3(() => scene.selfSeatUI) || read3(() => scene.seatContainer.seatUIs) || sceneName(scene) === "GameScene");
  }
  function createGameAdapter(win, scope) {
    let configs = scope ? createConfigData(win, scope) : null, selfClass = null, selfSearchAt = -1 / 0, current = null, stage = null, dispatcher = null, dispatcherOwner = null, providers = /* @__PURE__ */ new Set(), definitionTables = /* @__PURE__ */ new WeakMap(), listeners = /* @__PURE__ */ new Set();
    function walk(predicate, root = read3(() => win.Laya.stage)) {
      let queue = root ? [root] : [], seen = /* @__PURE__ */ new Set();
      for (let i = 0; i < queue.length && i < 4e3; i++) {
        let item = queue[i];
        if (!(!alive(item) || seen.has(item))) {
          if (seen.add(item), read3(() => predicate(item))) return item;
          queue.push(...children(item));
        }
      }
      return null;
    }
    function getDispatcher() {
      return alive(dispatcher) && alive(dispatcherOwner) || (dispatcher = dispatcherOwner = null, walk((node) => {
        let candidate = read3(() => node.ged);
        return alive(candidate) && object(read3(() => candidate._events)) ? (dispatcher = candidate, dispatcherOwner = node, !0) : read3(() => node._events.SWITCH_SCENE) || read3(() => node._events.HIDE_WINDOW) ? (dispatcher = dispatcherOwner = node, !0) : !1;
      })), dispatcher;
    }
    function eventCallerFrom(target, event, predicate) {
      let handlers = read3(() => target._events[event]);
      for (let entry of Array.isArray(handlers) ? handlers : [handlers]) {
        let candidate = read3(() => entry.caller);
        if (alive(candidate) && read3(() => predicate(candidate))) return candidate;
      }
      return null;
    }
    function eventCaller(event, predicate) {
      return eventCallerFrom(getDispatcher(), event, predicate);
    }
    function stageScene() {
      let layer = walk((node) => node.name === "SceneLayer" || node.layerOrder === 2);
      return layer && children(layer).filter((node) => node !== layer && alive(node) && read3(() => node.visible) !== !1).at(-1) || null;
    }
    function getScene() {
      let nextStage = read3(() => win.Laya.stage) || null;
      stage !== nextStage && (stage = nextStage, dispatcher = dispatcherOwner = null, providers = /* @__PURE__ */ new Set());
      let demo = read3(() => win.__SGS_TOOLBOX_DEMO__.scene), manager = demo ? null : eventCaller("SWITCH_SCENE", (value) => "CurrentScene" in value), managerScene = read3(() => manager.CurrentScene), rendered = demo ? null : stageScene(), next = alive(demo) ? demo : rendered || (alive(managerScene) && read3(() => managerScene.visible) !== !1 ? managerScene : null) || walk((node) => read3(() => node.visible) !== !1 && (GAME_SCENE.test(sceneName(node)) || isGameScene(node)));
      if (next !== current) {
        current = next || null, providers = /* @__PURE__ */ new Set(), dispatcher = dispatcherOwner = null;
        for (let fn of [...listeners])
          try {
            fn(current);
          } catch {
          }
      }
      return current;
    }
    let selfUI = (scene) => read3(() => scene.SelfSeatUi) || read3(() => scene.selfSeatUI) || null, seats = (scene) => list(read3(() => scene.seatContainer.seatUIs) || read3(() => scene.seatUIs)).filter((ui) => alive(ui) && nativeSeatOccupied(ui)), handUIs = (ui) => list(read3(() => ui.cardContainer.cardUis) || read3(() => ui.cardUis) || children(read3(() => ui.cardContainer))).filter(alive), model = (ui) => read3(() => ui.Card) || read3(() => ui.card) || read3(() => ui.cardInfo) || read3(() => ui.dataSource), seatData = nativeSeat, seatId = nativeSeatId;
    function getClass(name) {
      return typeof name != "string" || !name ? null : object(read3(() => win.Laya.ClassUtils.getClass(name))) || object(read3(() => win[name]));
    }
    function getSelf() {
      let demo = read3(() => win.__SGS_TOOLBOX_DEMO__.self);
      if (demo) return demo;
      let nativeClass = selfClass || getClass("UserData"), stored = nativeClass && read3(() => Object.getOwnPropertyDescriptor(nativeClass, "self"));
      if (stored && "value" in stored) return object(stored.value);
      if (Date.now() - selfSearchAt < 1e3) return null;
      selfSearchAt = Date.now();
      let inspectUserNode = (node) => {
        for (let key of ["userData", "data"]) {
          let descriptor = read3(() => Object.getOwnPropertyDescriptor(node, key)), value = descriptor && "value" in descriptor ? descriptor.value : null;
          if (!object(value) || !number(read3(() => value.ClientId))) continue;
          let ctor = read3(() => value.constructor), own3 = read3(() => Object.getOwnPropertyDescriptor(ctor, "self"));
          if (own3 && "value" in own3 && object(own3.value) && number(read3(() => own3.value.ClientId)))
            return selfClass = ctor, !0;
        }
        return !1;
      };
      return inspectUserNode(read3(() => getScene().topMenu.moneyMenuUI)) || walk(inspectUserNode), selfClass ? object(read3(() => Object.getOwnPropertyDescriptor(selfClass, "self").value)) : null;
    }
    function getServerProxy() {
      let scene = getScene(), direct = read3(() => scene.proxy) || read3(() => scene.serverProxy);
      if (alive(direct)) return direct;
      let manager = eventCaller("HIDE_WINDOW", (value) => object(value.proxy));
      return object(read3(() => manager.proxy)) || existingSingleton("ServerProxy");
    }
    function existingSingleton(name) {
      let registered = getClass(name);
      if (!alive(registered)) return null;
      if (typeof registered != "function" && typeof read3(() => registered.event) == "function") return registered;
      for (let key of ["instance", "Instance", "I", "_instance", "s_instance"]) {
        let descriptor = read3(() => Object.getOwnPropertyDescriptor(registered, key)), candidate = descriptor && "value" in descriptor ? descriptor.value : null;
        if (alive(candidate) && typeof read3(() => candidate.event) == "function") return candidate;
      }
      return null;
    }
    function getActivityManager(proxy = getServerProxy()) {
      return eventCallerFrom(proxy, "ClientJDInfoNtf", (value) => typeof value.event == "function") || existingSingleton("ActivityManager");
    }
    function getMessageTargets() {
      let targets = [], seen = /* @__PURE__ */ new Set(), proxy = getServerProxy();
      for (let [name, target] of [["ServerProxy", proxy], ["ActivityManager", getActivityManager(proxy)]])
        !alive(target) || typeof read3(() => target.event) != "function" || seen.has(target) || (seen.add(target), targets.push({ name, target }));
      return targets;
    }
    function registerProviders(card) {
      let proto = object(card), seen = /* @__PURE__ */ new Set();
      for (let i = 0; proto && i < 8 && !seen.has(proto); i++) {
        seen.add(proto);
        let ctor = read3(() => proto.constructor);
        typeof ctor == "function" && typeof read3(() => ctor.GetInstance) == "function" && providers.add(ctor), proto = read3(() => Object.getPrototypeOf(proto));
      }
    }
    function getCardDefinition(id) {
      for (let data of [
        read3(() => win.CtrUtil.AllDatas),
        read3(() => win.CtrUtil.allDatas),
        read3(() => win.SystemContext.AllDatas),
        read3(() => win.SystemContext.allDatas)
      ]) {
        let config = read3(() => data["sys_playcard.sgs"]), rows = read3(() => config.GamePlayCards.card);
        if (!Array.isArray(rows)) continue;
        let index = definitionTables.get(rows);
        if (!index || index.length !== rows.length) {
          let abbreviations = new Map(list(read3(() => config.abbreviation)).map((item) => [read3(() => item.Short), read3(() => item.Long)])), records = /* @__PURE__ */ new Map();
          for (let row of rows) {
            if (!object(row)) continue;
            let record = {};
            for (let [key, value] of Object.entries(row)) record[abbreviations.get(key) || key] = value;
            let rowId = cardId(record);
            Number.isInteger(rowId) && rowId > 0 && records.set(rowId, record);
          }
          index = { length: rows.length, records }, definitionTables.set(rows, index);
        }
        let card = index.records.get(id);
        if (card) return card;
      }
      return null;
    }
    function getCardMeta(id) {
      if (id = number(id), !Number.isInteger(id) || id <= 0) return { id, name: "\u672A\u77E5\u724C", unknown: !0 };
      let scene = getScene(), demo = read3(() => win.__SGS_TOOLBOX_DEMO__.cards[id]);
      if (demo) return { ...demo, id };
      let card;
      for (let item of handUIs(selfUI(scene))) {
        let observed = model(item);
        observed && (registerProviders(observed), cardId(observed) === id && (card = observed));
      }
      if (!card) for (let provider of providers) {
        let candidate = read3(() => provider.GetInstance(id));
        if (object(candidate) && (cardId(candidate) === void 0 || cardId(candidate) === id)) {
          card = candidate;
          break;
        }
      }
      let definition = getCardDefinition(id);
      if (!card && !definition) return { id, name: `\u724C #${id}`, unknown: !0 };
      let name = read3(() => card.CardName) || read3(() => card.cardName) || read3(() => card.Name) || read3(() => card.name) || read3(() => definition.CardName) || read3(() => definition.Name) || read3(() => definition.name), cardClass = read3(() => definition.cardClass) || read3(() => card.cardInfo.cardClass) || read3(() => card.cardClass) || read3(() => card.cardInfo.Class) || read3(() => card.className) || read3(() => card.ClassName) || read3(() => definition.Class) || read3(() => definition.class) || read3(() => definition.className);
      return {
        id,
        name: typeof name == "string" && name ? name : `\u724C #${id}`,
        suit: number(
          read3(() => card.FlowerOnSeat),
          read3(() => card.CardFlower),
          read3(() => card.Flower),
          read3(() => card.suit),
          read3(() => definition.color),
          read3(() => definition.CardSuit),
          read3(() => definition.suit)
        ),
        number: number(
          read3(() => card.CardNumber),
          read3(() => card.Number),
          read3(() => card.number),
          read3(() => definition.number),
          read3(() => definition.CardNumber),
          read3(() => definition.Number)
        ),
        type: number(
          read3(() => card.CardType),
          read3(() => card.Type),
          read3(() => card.type),
          read3(() => definition.type),
          read3(() => definition.CardType),
          read3(() => definition.Type)
        ),
        unknown: !(typeof name == "string" && name),
        ...typeof cardClass == "string" && cardClass ? { cardClass } : {}
      };
    }
    function getCountdown() {
      let scene = getScene(), ui = selfUI(scene), timer = read3(() => ui.countdownTimer) || read3(() => scene.countdownTimer), value = alive(timer) ? number(read3(() => timer.RemainValue)) : void 0;
      return value === void 0 ? null : Math.max(0, value);
    }
    function getRemainingSlash() {
      let scene = getScene();
      if (!isGameScene(scene)) return null;
      let seat = seatData(selfUI(scene));
      if (!seat || read3(() => seat.IsDead) === !0) return null;
      let targets = read3(() => seat.GetSeatState(1).Targets), info = read3(() => seat.shaInfo);
      if (read3(() => info.Disabled) === !0) return 0;
      if (read3(() => info.NoLimit) === !0 || read3(() => targets[4]) === 9999) return 1 / 0;
      if (targets && typeof targets.length == "number") {
        let used = Number(targets[0] || 0), limit2 = Number(targets[1] || 1);
        return Number.isFinite(used) && Number.isFinite(limit2) ? Math.max(0, limit2 - used) : null;
      }
      if (read3(() => seat.ShaNoLimit) === !0) return 1 / 0;
      let count = number(read3(() => info.Count), read3(() => seat.ShaCount));
      return count === void 0 ? null : Math.max(0, count);
    }
    function getSnapshot() {
      let scene = getScene(), self = selfUI(scene), selfSeatId = seatId(self), selfSeat = read3(() => self.cardContainer.seat) || seatData(self), ownModels = read3(() => selfSeat.HandCards) ?? read3(() => selfSeat.handCards), handCardIds = Array.isArray(ownModels) ? cardIds(ownModels) : cardIds(handUIs(self).map(model)), mode = read3(() => getClass("GameContext").GetModeVO()), countdown = read3(() => self.countdownTimer) || read3(() => scene.countdownTimer), remaining = alive(countdown) ? number(read3(() => countdown.RemainValue)) : void 0;
      return {
        sceneName: sceneName(scene),
        inGame: isGameScene(scene),
        modeId: number(read3(() => scene.ModeID), read3(() => scene.modeId), read3(() => mode.ModeID), read3(() => mode.Id), read3(() => mode.id)),
        selfSeatId,
        handCardIds,
        emptySeatIds: list(read3(() => scene.seatContainer.seatUIs) || read3(() => scene.seatUIs)).filter((ui) => alive(ui) && !nativeSeatOccupied(ui)).map(seatId).filter((id) => id !== void 0),
        // Resume means reconnect, not replay. Require explicit replay evidence.
        isReplay: !!(read3(() => scene.IsReplay) || read3(() => scene.isReplay) || alive(read3(() => scene.replayBar))),
        countdownRemaining: remaining === void 0 ? null : Math.max(0, remaining),
        seats: seats(scene).map((ui) => {
          let seat = seatData(ui), id = seatId(ui), result = {
            seatId: id,
            position: nativeSeatPosition(ui) ?? null,
            viewId: number(read3(() => seat.fixedViewId), read3(() => seat.FixedViewId), read3(() => ui.fixedViewId), read3(() => ui.viewId), read3(() => ui.actualSeatID)),
            handCount: number(read3(() => seat.HandCardCount), read3(() => seat.HandCount), id === selfSeatId ? read3(() => ownModels.length) : void 0),
            dead: read3(() => seat.IsDead) ?? read3(() => seat.isDead),
            knownHandCardIds: publicHandIds(seat, ui)
          };
          return id !== void 0 && id === selfSeatId && (result.handCardIds = handCardIds.slice()), result;
        }).filter((item) => item.seatId !== void 0)
      };
    }
    return scope?.interval(() => {
      getScene();
    }, 500), scope?.add(() => {
      listeners.clear(), providers.clear(), definitionTables = /* @__PURE__ */ new WeakMap(), dispatcher = dispatcherOwner = current = stage = null;
    }), {
      getScene,
      getDispatcher,
      getSelfSeatUI: () => selfUI(getScene()),
      getSeatUIs: () => seats(getScene()),
      getCardMeta,
      getSnapshot,
      getClass,
      getServerProxy,
      getActivityManager,
      getMessageTargets,
      getCountdown,
      getSelf,
      getRemainingSlash,
      isInGame: () => isGameScene(getScene()),
      getConfigData: (name) => configs?.getConfigData(name) || null,
      loadConfigData: (name) => configs ? configs.loadConfigData(name) : Promise.reject(new Error("\u914D\u7F6E\u8BFB\u53D6\u4E0D\u53EF\u7528")),
      onSceneChange(fn) {
        if (typeof fn != "function") throw new TypeError("Scene subscriber must be a function");
        return listeners.add(fn), () => listeners.delete(fn);
      }
    };
  }

  // src/compat/profiles.js
  var OFFICIAL_ROOTS = Object.freeze([
    "#UVq89fEx20.wJoQac",
    "#fEZRuMF.LdZA6hJU",
    "#n3sLfVQse.pZ4fQufaff1g",
    "#EcyQUv1q.hGTMmkc8uVNU",
    "#Bbbi3Gz5.l39GxA",
    "#JiXfaf41Y.x7NIsLLG",
    "#ccGoxzAk8.z54FNOflZ8P",
    "#K99Umtv.ULaV6rnS29a",
    "#xNp6kWCguhN.NWKtWJt3Ax",
    "#vn30udbMfza9.DBpIuENA3Wq",
    "#Ky4VPPcGLqBX.Gtbe3Rwd7",
    "#L74jXNu.nhgNSx38Vs",
    "#KlUc6uX.T1xFwub0R77n",
    "#qVRsCBvCr.CDdibyZQ3X9"
  ]), FORK_ROOTS = Object.freeze([
    "#xiaochao-app",
    "#xiaochao-dialog-host",
    "#xiaochao-toast-host",
    "#xiaochao-vue-seat-overlay",
    ".xiaochao-tooltip"
  ]), EXTENSION_ROOTS = Object.freeze([
    "#xc95Panel",
    "#xc95Zoom",
    "#xcExtDiagBadge",
    "#xcExtEmbedModal",
    "#xcExtBaiShengPanel",
    "#xcGz2Section",
    "#xcExtGzSection",
    "#xcExtSeckillAutoBuy"
  ]), SOURCE_NAMES = Object.freeze({
    official: "\u539F\u7248\u5C0F\u6284",
    fork95: "95chong \u5C0F\u6284",
    extension: "\u5C0F\u6284\u7684\u62D3\u5C55",
    structural: "\u5176\u4ED6\u5C0F\u6284\u754C\u9762",
    manual: "\u624B\u52A8\u9009\u5B9A\u754C\u9762"
  });

  // src/compat/index.js
  var TOOLBOX = "[data-sgs-toolbox]", GAME = "#bgDiv,#layaContainer,#laya_container,#GameDiv,canvas,iframe", FORBIDDEN_TAGS = /* @__PURE__ */ new Set(["HTML", "BODY", "HEAD", "SCRIPT", "STYLE", "LINK", "META"]), FEATURE_LABELS = ["\u5361\u724C", "\u8BB0\u724C", "\u660E\u724C", "\u5C71\u6CB3\u56FE", "\u914D\u7F6E", "\u5DE5\u5177", "\u767E\u80DC\u6218\u529F", "\u76AE\u80A4\u6536\u96C6", "\u6218\u7EE9\u51FA\u6846", "\u804A\u5929\u8868\u60C5", "\u81EA\u52A9\u89C2\u661F", "\u6740\u6279\u8D26\u672C", "95\u6298\u5145\u503C"];
  function createCompatibility({ window: window2, document: document2 = window2?.document, onStatus = () => {
  }, takeover = "hide" } = {}) {
    if (!window2 || !document2) throw new TypeError("Compatibility requires window and document");
    let running = !1, enabled = !1, policy = takeover === "exit-known" ? "exit-known" : "hide", observer = null, interval = null, queued = !1, scanning = !1, lastStatus = "", hidden = /* @__PURE__ */ new Map(), ignored = /* @__PURE__ */ new WeakSet(), called = /* @__PURE__ */ new WeakSet(), sources = /* @__PURE__ */ new Set(), exitCalls = [];
    function protectedElement(el) {
      return !el || el.nodeType !== 1 || el.ownerDocument !== document2 || !el.style || FORBIDDEN_TAGS.has(el.tagName) ? !0 : !!(el.matches(TOOLBOX) || el.closest(TOOLBOX) || el.querySelector(TOOLBOX) || el.matches(GAME) || el.closest(GAME) || el.querySelector(GAME));
    }
    function ownHidden(el) {
      return el.style.getPropertyValue("display") === "none" && el.style.getPropertyPriority("display") === "important";
    }
    function hide(el, source) {
      if (!enabled || protectedElement(el) || ignored.has(el)) return !1;
      let record = hidden.get(el);
      return record ? ownHidden(el) || (record.value = el.style.getPropertyValue("display"), record.priority = el.style.getPropertyPriority("display")) : (record = { value: el.style.getPropertyValue("display"), priority: el.style.getPropertyPriority("display"), source }, hidden.set(el, record)), sources.add(source), ownHidden(el) || el.style.setProperty("display", "none", "important"), !0;
    }
    function restore(el, ignore = !1) {
      let record = hidden.get(el);
      return record ? (ownHidden(el) && (record.value ? el.style.setProperty("display", record.value, record.priority) : el.style.removeProperty("display")), hidden.delete(el), ignore && ignored.add(el), !0) : !1;
    }
    function structuralMatch(el) {
      if (protectedElement(el)) return !1;
      let text2 = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (text2.length < 12 || text2.length > 2e4 || !/(?:小抄|桌游助手)/.test(text2)) return !1;
      let buttons = [...el.querySelectorAll('button,[role="tab"]')];
      if (buttons.length < 4) return !1;
      let labels = buttons.map((b) => (b.textContent || "").replace(/\s+/g, ""));
      if (FEATURE_LABELS.filter((label) => labels.some((t) => t === label || t.startsWith(label + "\uFF08"))).length < 4 || ![...el.querySelectorAll("a[href]")].some((a) => {
        try {
          let host = new URL(a.href, window2.location.href).hostname;
          return host === "xiaochao.org" || host.endsWith(".xiaochao.org") || host === "xc.95chong.cn";
        } catch {
          return !1;
        }
      }) && !el.querySelector("input#seatUISwitch") && !/(?:小抄|桌游助手)\s*v?\d+\.\d+(?:\.\d+)?/i.test(text2)) return !1;
      let style2 = window2.getComputedStyle(el);
      return style2.position === "fixed" && Number(style2.zIndex) >= 1e3;
    }
    function recordExit(source, method, callbacks, receiver, argument) {
      let pending = callbacks.filter((fn) => typeof fn == "function" && !called.has(fn));
      if (!pending.length) return;
      let entry = { source, method, calls: pending.length, succeeded: 0, failed: 0, error: "" };
      for (let fn of pending) {
        called.add(fn);
        try {
          Reflect.apply(fn, receiver, argument), entry.succeeded++;
        } catch (error) {
          entry.failed++, entry.error = String(error?.message || error).slice(0, 180);
        }
      }
      sources.add(source), exitCalls.push(entry), exitCalls.length > 32 && exitCalls.shift();
    }
    function exitKnown() {
      if (policy === "exit-known") {
        for (let key of ["SGSMODULE", "VIiR0YfvE4s"])
          try {
            let value = window2[key];
            Array.isArray(value) && recordExit("official", `${key}:EXIT`, value.slice(), void 0, ["EXIT"]);
          } catch {
          }
        try {
          let lifecycle = window2.__XIAOCHAO_ENGINEERING__?.lifecycle, startup = window2.__XIAOCHAO_STARTUP__;
          lifecycle && typeof lifecycle.register == "function" && typeof lifecycle.listen == "function" && typeof lifecycle.dispose == "function" && typeof lifecycle.disposed == "boolean" && (startup?.entry === "preboot-v2" || document2.querySelector("#xiaochao-app")) && !lifecycle.disposed && recordExit("fork95", "__XIAOCHAO_ENGINEERING__.lifecycle.dispose", [lifecycle.dispose], lifecycle, []);
        } catch {
        }
      }
    }
    function getStatus() {
      let hiddenCount = [...hidden.keys()].filter((el) => el.isConnected && ownHidden(el)).length, exits = exitCalls.map((item) => ({ ...item })), detected = [...sources].map((id) => ({ id, name: SOURCE_NAMES[id] })), backgroundMayContinue = sources.size > 0;
      return {
        running,
        enabled,
        takeover: policy,
        sources: detected,
        hiddenCount,
        hiddenUi: hiddenCount > 0,
        exitCalls: exits,
        exitCalled: exits.length > 0,
        backgroundMayContinue,
        restartRequired: exits.length > 0,
        message: sources.size ? `${hiddenCount ? `\u5DF2\u9690\u85CF ${hiddenCount} \u4E2A\u65E7\u754C\u9762` : "\u5DF2\u68C0\u6D4B\u5230\u65E7\u811A\u672C"}${exits.length ? "\uFF1B\u5DF2\u8C03\u7528\u5DF2\u77E5\u9000\u51FA\u63A5\u53E3" : ""}\uFF1B\u5176\u4ED6\u540E\u53F0\u52A8\u4F5C\u4ECD\u53EF\u80FD\u7EE7\u7EED` : "\u5C1A\u672A\u68C0\u6D4B\u5230\u65E7\u5C0F\u6284\u754C\u9762"
      };
    }
    function emit() {
      let status = getStatus(), serialized = JSON.stringify(status);
      if (serialized !== lastStatus) {
        lastStatus = serialized;
        try {
          onStatus(status);
        } catch {
        }
      }
    }
    function scan() {
      if (!running || scanning) return getStatus();
      scanning = !0;
      try {
        for (let [selectors, source] of [[OFFICIAL_ROOTS, "official"], [FORK_ROOTS, "fork95"], [EXTENSION_ROOTS, "extension"]])
          for (let el of document2.querySelectorAll(selectors.join(",")))
            protectedElement(el) || sources.add(source), enabled && hide(el, source);
        for (let el of [...document2.querySelectorAll("div,aside,section")].slice(0, 4e3))
          !hidden.has(el) && structuralMatch(el) && (sources.add("structural"), enabled && hide(el, "structural"));
        (Array.isArray(window2.SGSMODULE) || Array.isArray(window2.VIiR0YfvE4s)) && sources.add("official"), window2.__XIAOCHAO_STARTUP__?.entry === "preboot-v2" && sources.add("fork95"), enabled && exitKnown();
        for (let [el, record] of hidden) {
          if (!el.isConnected) {
            restore(el);
            continue;
          }
          protectedElement(el) ? restore(el) : hide(el, record.source);
        }
      } finally {
        scanning = !1;
      }
      return emit(), getStatus();
    }
    function schedule() {
      queued || !running || (queued = !0, window2.queueMicrotask(() => {
        queued = !1, running && scan();
      }));
    }
    function start() {
      return running || (running = !0, typeof window2.MutationObserver == "function" && (observer = new window2.MutationObserver((records) => {
        records.some((r) => {
          let target = r.target.nodeType === 1 ? r.target : r.target.parentElement;
          return !(target?.closest(TOOLBOX) || r.type === "attributes" && r.attributeName === "style" && hidden.has(target) && ownHidden(target));
        }) && schedule();
      }), observer.observe(document2, { childList: !0, subtree: !0, attributes: !0, attributeFilter: ["id", "class", "style"] })), interval = window2.setInterval(scan, 1e3), scan(), emit()), getStatus();
    }
    function stop() {
      running = !1, observer?.disconnect(), observer = null, interval !== null && window2.clearInterval(interval), interval = null;
      for (let el of [...hidden.keys()]) restore(el);
      return emit(), getStatus();
    }
    function setEnabled(value) {
      if (enabled = !!value, !enabled) for (let el of [...hidden.keys()]) restore(el);
      return scan(), emit(), getStatus();
    }
    function setTakeoverPolicy(value) {
      if (!["hide", "exit-known"].includes(value)) throw new TypeError("Unknown compatibility policy");
      return policy = value, scan(), emit(), getStatus();
    }
    return {
      start,
      stop,
      scan,
      getStatus,
      setEnabled,
      setTakeoverPolicy,
      hideElement(el) {
        ignored.delete(el);
        let result = hide(el, "manual");
        return emit(), result;
      },
      restoreElement(el) {
        let result = restore(el, !0);
        return emit(), result;
      }
    };
  }

  // src/market/client.js
  var PACKAGE_FORMAT2 = "sgs-toolbox-plugin-v1", ID = /^[a-z][a-z0-9._-]{0,95}$/, VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/, DIGEST = /^[0-9a-f]{64}$/i, DEFAULT_MAX_BYTES = 8 * 1024 * 1024, MarketError = class extends Error {
    constructor(code, message, details = {}) {
      super(message, details.cause ? { cause: details.cause } : void 0), this.name = "MarketError", this.code = code, details.status !== void 0 && (this.status = details.status);
    }
  };
  function isObject(value) {
    return value !== null && typeof value == "object" && !Array.isArray(value);
  }
  function validIdentity(value) {
    return isObject(value) && typeof value.id == "string" && ID.test(value.id) && typeof value.version == "string" && value.version.length <= 80 && VERSION.test(value.version);
  }
  function validEntry(entry) {
    return validIdentity(entry) && typeof entry.name == "string" && entry.name.trim().length > 0 && typeof entry.description == "string" && typeof entry.packageUrl == "string" && validReleaseNotes(entry.releaseNotes) && typeof entry.sha256 == "string" && DIGEST.test(entry.sha256);
  }
  var MarketClient = class {
    constructor({
      baseUrl = "http://127.0.0.1:17321",
      fetchImpl = globalThis.fetch,
      timeoutMs = 1e4,
      maxBytes = DEFAULT_MAX_BYTES
    } = {}) {
      let parsed;
      try {
        parsed = new URL(baseUrl);
      } catch {
        throw new MarketError("INVALID_URL", "\u63D2\u4EF6\u5E02\u573A\u5730\u5740\u65E0\u6548\u3002");
      }
      if (!(parsed.protocol === "https:" || parsed.protocol === "http:" && parsed.hostname === "127.0.0.1") || parsed.username || parsed.password || parsed.search || parsed.hash || /%|\\/.test(parsed.pathname))
        throw new MarketError("INVALID_URL", "\u5E02\u573A\u5730\u5740\u987B\u4E3A HTTPS \u9759\u6001\u76EE\u5F55\uFF0C\u6216 HTTP \u672C\u673A\u56DE\u73AF\u76EE\u5F55\u3002");
      if (typeof fetchImpl != "function") throw new MarketError("FETCH_UNAVAILABLE", "\u5F53\u524D\u73AF\u5883\u6CA1\u6709\u53EF\u7528\u7684\u7F51\u7EDC\u8BF7\u6C42\u63A5\u53E3\u3002");
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(maxBytes) || maxBytes <= 0)
        throw new MarketError("INVALID_OPTIONS", "\u5E02\u573A\u8D85\u65F6\u548C\u54CD\u5E94\u5927\u5C0F\u9650\u5236\u5FC5\u987B\u4E3A\u6B63\u6570\u3002");
      this.baseUrl = parsed.href.replace(/\/+$/, ""), this.origin = parsed.origin, this.packagePath = new URL(`${this.baseUrl}/packages/`).pathname, this.fetchImpl = fetchImpl, this.timeoutMs = timeoutMs, this.maxBytes = maxBytes;
    }
    resolvePackageUrl(value) {
      let url;
      try {
        url = new URL(value, `${this.baseUrl}/`);
      } catch {
        throw new MarketError("INVALID_URL", "\u63D2\u4EF6\u5305\u4E0B\u8F7D\u5730\u5740\u65E0\u6548\u3002");
      }
      if (url.origin !== this.origin || url.username || url.password || url.hash || url.search || !url.pathname.startsWith(this.packagePath) || !/^[a-z][a-z0-9._-]{0,95}\/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?\.json$/.test(url.pathname.slice(this.packagePath.length)))
        throw new MarketError("ORIGIN_MISMATCH", "\u63D2\u4EF6\u5305\u5FC5\u987B\u6765\u81EA\u5F53\u524D\u9759\u6001\u5E02\u573A\u7684 packages \u76EE\u5F55\u3002");
      return url.href;
    }
    async requestJson(url) {
      let controller = new AbortController(), timeout, timedOut = new Promise((_, reject) => {
        timeout = setTimeout(() => {
          let error = new MarketError("TIMEOUT", "\u8BFB\u53D6\u63D2\u4EF6\u5E02\u573A\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u548C\u6258\u7BA1\u5730\u5740\u3002");
          reject(error), controller.abort(error);
        }, this.timeoutMs);
      }), request = (async () => {
        let response;
        try {
          response = await this.fetchImpl(url, {
            method: "GET",
            credentials: "omit",
            cache: "no-store",
            redirect: "error",
            mode: "cors",
            ...new URL(this.baseUrl).protocol === "http:" ? { targetAddressSpace: "loopback" } : {},
            signal: controller.signal
          });
        } catch (error) {
          throw controller.signal.aborted ? controller.signal.reason : new MarketError("NETWORK_ERROR", "\u65E0\u6CD5\u8BFB\u53D6\u63D2\u4EF6\u5E02\u573A\uFF0C\u8BF7\u68C0\u67E5\u76EE\u5F55\u5730\u5740\u3001\u7F51\u7EDC\u53CA\u6258\u7BA1\u7684\u8DE8\u57DF\u914D\u7F6E\u3002", { cause: error });
        }
        if (!response || typeof response.text != "function")
          throw new MarketError("INVALID_RESPONSE", "\u63D2\u4EF6\u5E02\u573A\u8FD4\u56DE\u4E86\u65E0\u6548\u54CD\u5E94\u3002");
        if (!response.ok) throw new MarketError("HTTP_ERROR", `\u63D2\u4EF6\u5E02\u573A\u8BF7\u6C42\u5931\u8D25\uFF08HTTP ${response.status}\uFF09\u3002`, { status: response.status });
        if (response.url && response.url !== url)
          throw new MarketError("ORIGIN_MISMATCH", "\u63D2\u4EF6\u5E02\u573A\u54CD\u5E94\u6765\u81EA\u5176\u4ED6\u5730\u5740\uFF0C\u5DF2\u505C\u6B62\u8BFB\u53D6\u3002");
        if (Number(response.headers?.get("content-length")) > this.maxBytes) throw new MarketError("RESPONSE_TOO_LARGE", "\u63D2\u4EF6\u5E02\u573A\u54CD\u5E94\u8D85\u8FC7\u5927\u5C0F\u9650\u5236\u3002");
        let raw;
        try {
          raw = await response.text();
        } catch (error) {
          throw controller.signal.aborted ? controller.signal.reason : new MarketError("NETWORK_ERROR", "\u8BFB\u53D6\u63D2\u4EF6\u5E02\u573A\u54CD\u5E94\u5931\u8D25\u3002", { cause: error });
        }
        if (new TextEncoder().encode(raw).byteLength > this.maxBytes)
          throw new MarketError("RESPONSE_TOO_LARGE", "\u63D2\u4EF6\u5E02\u573A\u54CD\u5E94\u8D85\u8FC7\u5927\u5C0F\u9650\u5236\u3002");
        try {
          return JSON.parse(raw);
        } catch (error) {
          throw new MarketError("BAD_JSON", "\u63D2\u4EF6\u5E02\u573A\u54CD\u5E94\u4E0D\u662F\u6709\u6548\u7684 JSON\u3002", { cause: error });
        }
      })();
      try {
        return await Promise.race([request, timedOut]);
      } finally {
        clearTimeout(timeout);
      }
    }
    async health() {
      return await this.getCatalog(), { ok: !0, service: "sgs-toolbox-market", schemaVersion: 1 };
    }
    async getCatalog() {
      let catalog = await this.requestJson(`${this.baseUrl}/catalog.json`);
      if (!isObject(catalog) || catalog.schemaVersion !== 1 || !Array.isArray(catalog.plugins))
        throw new MarketError("BAD_SCHEMA", "\u63D2\u4EF6\u76EE\u5F55\u683C\u5F0F\u4E0D\u517C\u5BB9\u3002");
      let seen = /* @__PURE__ */ new Set();
      for (let entry of catalog.plugins) {
        if (!validEntry(entry)) throw new MarketError("BAD_SCHEMA", "\u63D2\u4EF6\u76EE\u5F55\u5305\u542B\u65E0\u6548\u6761\u76EE\u3002");
        let identity = `${entry.id}@${entry.version}`;
        if (seen.has(identity)) throw new MarketError("BAD_SCHEMA", "\u63D2\u4EF6\u76EE\u5F55\u5305\u542B\u91CD\u590D\u7248\u672C\u3002");
        seen.add(identity), this.resolvePackageUrl(entry.packageUrl);
      }
      return catalog;
    }
    async getPackage(entry) {
      if (!validEntry(entry)) throw new MarketError("BAD_SCHEMA", "\u63D2\u4EF6\u76EE\u5F55\u6761\u76EE\u65E0\u6548\u3002");
      let pkg = await this.requestJson(this.resolvePackageUrl(entry.packageUrl));
      if (!isObject(pkg) || pkg.format !== PACKAGE_FORMAT2 || !validIdentity(pkg.manifest) || typeof pkg.manifest.name != "string" || !pkg.manifest.name.trim() || !validReleaseNotes(pkg.manifest.releaseNotes) || !Number.isInteger(pkg.manifest.apiVersion) || pkg.manifest.apiVersion < 1 || !Array.isArray(pkg.manifest.categories) || pkg.manifest.categories.some((v) => typeof v != "string") || typeof pkg.code != "string" || !pkg.code.trim() || typeof pkg.sha256 != "string" || !DIGEST.test(pkg.sha256))
        throw new MarketError("BAD_SCHEMA", "\u63D2\u4EF6\u5305\u683C\u5F0F\u65E0\u6548\u3002");
      if (pkg.manifest.id !== entry.id || pkg.manifest.version !== entry.version)
        throw new MarketError("PACKAGE_ID_MISMATCH", "\u63D2\u4EF6\u5305\u8EAB\u4EFD\u6216\u7248\u672C\u4E0E\u76EE\u5F55\u4E0D\u4E00\u81F4\u3002");
      if (pkg.sha256.toLowerCase() !== entry.sha256.toLowerCase())
        throw new MarketError("CATALOG_DIGEST_MISMATCH", "\u63D2\u4EF6\u5305\u6458\u8981\u4E0E\u76EE\u5F55\u4E0D\u4E00\u81F4\uFF0C\u8BF7\u5237\u65B0\u5E02\u573A\u76EE\u5F55\u540E\u91CD\u8BD5\u3002");
      if (entry.releaseNotes !== void 0 && entry.releaseNotes !== pkg.manifest.releaseNotes)
        throw new MarketError("RELEASE_NOTES_MISMATCH", "\u63D2\u4EF6\u66F4\u65B0\u5185\u5BB9\u4E0E\u76EE\u5F55\u4E0D\u4E00\u81F4\uFF0C\u8BF7\u5237\u65B0\u5E02\u573A\u76EE\u5F55\u540E\u91CD\u8BD5\u3002");
      return pkg;
    }
  };

  // src/core/market-connection.js
  var LOCAL_MARKET_URL = "http://127.0.0.1:17321", PublicMarketClient = class {
    constructor(fetchImpl, { sources = [GITHUB_MARKET_URL, OSS_MARKET_URL], ...options } = {}) {
      this.clients = sources.map((baseUrl) => new MarketClient({ ...options, baseUrl, fetchImpl })), this.active = this.clients[0];
    }
    get baseUrl() {
      return this.active.baseUrl;
    }
    async attempt(clients, action) {
      let failures = [];
      for (let client of clients)
        try {
          let result = await action(client);
          return this.active = client, result;
        } catch (error) {
          failures.push(`${client.baseUrl === GITHUB_MARKET_URL ? "GitHub" : client.baseUrl === OSS_MARKET_URL ? "OSS" : "\u672C\u5730"}\uFF1A${error.message}`);
        }
      throw new Error(`\u63D2\u4EF6\u5E02\u573A\u6682\u65F6\u65E0\u6CD5\u8FDE\u63A5\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002
` + failures.join(`
`));
    }
    getCatalog() {
      return this.attempt(this.clients, (client) => client.getCatalog());
    }
    async health() {
      return await this.getCatalog(), { ok: !0, service: "sgs-toolbox-market", schemaVersion: 1 };
    }
    getPackage(entry) {
      let source = this.clients.find((client) => {
        try {
          return client.resolvePackageUrl(entry.packageUrl), !0;
        } catch {
          return !1;
        }
      });
      if (!source) return Promise.reject(new Error("\u63D2\u4EF6\u5305\u5FC5\u987B\u6765\u81EA\u53D1\u5E03\u76EE\u5F55\u7684 packages \u76EE\u5F55\u3002"));
      let path = source.resolvePackageUrl(entry.packageUrl).slice(source.baseUrl.length + 1), order = [this.active, ...this.clients.filter((client) => client !== this.active)];
      return this.attempt(order, async (client) => verifyPackage(await client.getPackage({ ...entry, packageUrl: path })));
    }
  };
  function createMarketConnection(settings, fetchImpl, onError = () => {
  }, { development = !1 } = {}) {
    if (!development) {
      let client2 = new PublicMarketClient(fetchImpl);
      return { get: () => client2, set() {
        throw new Error("\u516C\u5F00\u7248\u81EA\u52A8\u8FDE\u63A5\u63D2\u4EF6\u5E02\u573A\u3002");
      } };
    }
    let create = (baseUrl) => baseUrl === "" ? null : baseUrl.replace(/\/+$/, "") === LOCAL_MARKET_URL ? new PublicMarketClient(fetchImpl, { sources: [LOCAL_MARKET_URL, GITHUB_MARKET_URL, OSS_MARKET_URL] }) : new MarketClient({ baseUrl, fetchImpl }), client;
    try {
      client = create(settings.get("marketUrl", LOCAL_MARKET_URL));
    } catch {
      client = create(LOCAL_MARKET_URL), settings.set("marketUrl", client.baseUrl), onError("\u4FDD\u5B58\u7684\u5E02\u573A\u5730\u5740\u65E0\u6548\uFF0C\u5DF2\u6062\u590D\u672C\u673A\u9ED8\u8BA4\u5730\u5740\u3002");
    }
    return { get: () => client, set(value) {
      let next = create(String(value).trim()), url = next?.baseUrl || "";
      return settings.set("marketUrl", url), client = next, url;
    } };
  }

  // src/core/snapshots.js
  var RESYNC = /* @__PURE__ */ new Set(["MsgGamePlayCardNtf", "MsgReconnectGame", "MsgReconnectGameHand", "SmsgGameSetCharacter", "GsCGuoZhanSetCharacter"]);
  function attachSessionSnapshots({ journal, game, scope, settled = () => Promise.resolve() }) {
    let generation = 0, lastSignature = "", pending = !1, timers = /* @__PURE__ */ new Set();
    function cancel() {
      for (let timer of timers) clearTimeout(timer);
      timers.clear();
    }
    function request() {
      scope.closed || (generation++, cancel(), !pending && (pending = !0, queueMicrotask(async () => {
        try {
          await settled();
        } catch {
          return;
        }
        if (pending = !1, scope.closed) return;
        let current = generation, collect = async (attempt) => {
          if (attempt)
            try {
              await settled();
            } catch {
              return;
            }
          if (scope.closed || current !== generation) return;
          let data;
          try {
            data = game.getSnapshot();
          } catch {
            data = {};
          }
          let signature = JSON.stringify([journal.sessionId, data]);
          signature !== lastSignature && (lastSignature = signature, journal.push("toolbox:snapshot", data));
          let ready = Number.isInteger(data.selfSeatId) && Array.isArray(data.seats) && data.seats.length > 0, delays = [50, 250, 1e3, 2e3];
          if (data.inGame !== !1 && !ready && attempt < delays.length) {
            let timer = setTimeout(() => {
              timers.delete(timer), collect(attempt + 1);
            }, delays[attempt]);
            timers.add(timer);
          }
        };
        collect(0);
      })));
    }
    return scope.add(journal.subscribe((event) => {
      RESYNC.has(event.type) && request();
    })), scope.add(game.onSceneChange(request)), scope.add(() => {
      generation++, cancel();
    }), request(), { request };
  }

  // src/core/diagnostics.js
  var EVENT_NAME = /^(?:Msg|PubGs|Smsg|GsC|CGs|decode|Client)[A-Za-z0-9_]{0,90}$/, SOURCES = /* @__PURE__ */ new Set(["console", "native:ServerProxy", "native:ActivityManager"]), SKIP = /* @__PURE__ */ new Set(["ClientLoginRep"]), FIELDS = [
    "CardList",
    "CardIDs",
    "CardID",
    "CardCount",
    "SeatID",
    "SeatIndex",
    "FromID",
    "ToID",
    "FromZone",
    "ToZone",
    "FromPosition",
    "ToPosition",
    "FromZoneParam",
    "ToZoneParam",
    "MoveType",
    "SpellID",
    "SrcSeatID",
    "TargetSeatID",
    "TargetID",
    "TargetID1",
    "TargetID2",
    "DestSeatIDs",
    "EffectIndex",
    "Type",
    "Param",
    "Params",
    "Option",
    "Opt",
    "Count",
    "TurnCnt",
    "Round",
    "useType",
    "isPassed",
    "isSend",
    "IsResume",
    "list_card_id",
    "error_id",
    "Infos",
    "GeneralData"
  ], ARRAYS = /* @__PURE__ */ new Set(["CardList", "CardIDs", "DestSeatIDs", "list_card_id", "Params", "Infos", "GeneralData"]), REQUIRED = {
    MsgGamePlayCardNtf: [["CardList"]],
    PubGsCMoveCard: [["FromID"], ["ToID"], ["FromZone"], ["ToZone"], ["CardCount"], ["CardIDs"]],
    PubGsCUseCard: [["SeatID"], ["CardID", "CardIDs"]],
    PubGsCUseSpell: [["SeatID"], ["SpellID"]],
    decodeClientGetCardInfoResp: [["SeatID"], ["CardIDs", "CardList"]],
    ClientHappyGetFriendHandcardRep: [["SeatID"], ["CardIDs", "CardList"]],
    GsCRoleOptTargetNtf: [["SpellID"], ["Type"]]
  }, BRIDGE_NUMBERS = ["received", "console", "native", "lastAt", "dropped", "rejected", "pending"], own2 = (value, key) => {
    if (!(!value || typeof value != "object"))
      try {
        let descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor && "value" in descriptor ? descriptor.value : void 0;
      } catch {
        return;
      }
  }, number2 = (value) => typeof value == "number" && Number.isFinite(value) ? value : void 0, atom = (value) => typeof value == "boolean" ? value : number2(value) ?? (typeof value == "string" && /^-?\d{1,16}$/.test(value) ? value : void 0), validType = (type) => typeof type == "string" && type.length <= 96 && EVENT_NAME.test(type), limit = (value, fallback, max) => Number.isInteger(value) ? Math.min(max, Math.max(1, value)) : fallback;
  function array(value, key, truncated) {
    if (!Array.isArray(value)) return;
    let length = own2(value, "length");
    if (!Number.isInteger(length) || length < 0) return;
    let cap = key === "Infos" || key === "GeneralData" ? 32 : 256;
    length > cap && (truncated[key] = { originalLength: length, retainedLength: cap });
    let result = [];
    for (let i = 0; i < Math.min(length, cap); i++) {
      let item = own2(value, String(i)), scalar2 = atom(item);
      if (scalar2 !== void 0) {
        result.push(scalar2);
        continue;
      }
      if (!item || typeof item != "object") {
        result.push(null);
        continue;
      }
      let names = key === "Infos" ? ["SeatID", "CharacterID"] : key === "GeneralData" ? ["index", "cardID"] : ["CardId", "CardID", "cardId", "cardID", "id"], record = {};
      for (let name of names) {
        let field = atom(own2(item, name));
        field !== void 0 && (record[name] = field);
      }
      result.push(record);
    }
    return result;
  }
  function packet(payload) {
    let result = {}, truncated = {};
    for (let key of FIELDS) {
      let value = own2(payload, key), field = ARRAYS.has(key) ? array(value, key, truncated) : atom(value);
      field !== void 0 && (result[key] = field);
    }
    return { payload: result, truncated };
  }
  function createCardDiagnostics({ journal, scope, version = "", maxEvents = 160, maxTypes = 96, now = Date.now } = {}) {
    let eventLimit = limit(maxEvents, 160, 160), typeLimit = limit(maxTypes, 96, 96), events = [], observedTypes = /* @__PURE__ */ new Map(), recordedTypes = /* @__PURE__ */ new Map(), sessionId = null, firstAt = null, omittedEvents = 0, omittedTypes = 0, disposed = !1, seatSnapshot = null, coreVersion = typeof version == "string" && /^[A-Za-z0-9._-]{1,32}$/.test(version) ? version : "";
    function resetSession(next) {
      events.length = 0, recordedTypes.clear(), omittedEvents = 0, firstAt = null, sessionId = next, seatSnapshot = null;
    }
    function record(event) {
      if (disposed) return;
      let nextSession = number2(own2(event, "sessionId"));
      nextSession !== void 0 && nextSession !== sessionId && resetSession(nextSession);
      let type = own2(event, "type");
      if (type === "toolbox:snapshot") {
        let payload = own2(event, "payload"), seats = own2(payload, "seats"), projected = {};
        for (let key of ["inGame", "selfSeatId"]) {
          let value = atom(own2(payload, key));
          value !== void 0 && (projected[key] = value);
        }
        if (projected.seats = [], Array.isArray(seats)) for (let i = 0; i < Math.min(32, seats.length); i++) {
          let seat = own2(seats, String(i)), result = {};
          for (let key of ["seatId", "position", "viewId", "handCount", "dead"]) {
            let value = atom(own2(seat, key));
            value !== void 0 && (result[key] = value);
          }
          projected.seats.push(result);
        }
        let empty = own2(payload, "emptySeatIds");
        Array.isArray(empty) && (projected.emptySeatIds = Array.from({ length: Math.min(32, empty.length) }, (_, i) => number2(own2(empty, String(i)))).filter((value) => value !== void 0)), seatSnapshot = projected;
        return;
      }
      if (SKIP.has(type) || !(validType(type) || type === "toolbox:gap")) return;
      let record2 = { type }, seq = number2(own2(event, "seq")), at = number2(own2(event, "at"));
      if (seq !== void 0 && (record2.seq = seq), at !== void 0 && (record2.at = at, firstAt === null && (firstAt = at)), type === "toolbox:gap") record2.gap = !0;
      else {
        let projected = packet(own2(event, "payload"));
        record2.payload = projected.payload, Object.keys(projected.truncated).length && (record2.truncated = projected.truncated);
        let missing = (REQUIRED[type] || []).filter((group) => !group.some((key) => Object.hasOwn(record2.payload, key))).map((group) => group.join("|"));
        missing.length && (record2.missingFields = missing);
      }
      (recordedTypes.has(type) || recordedTypes.size < typeLimit) && recordedTypes.set(type, (recordedTypes.get(type) || 0) + 1), events.length >= eventLimit && (events.shift(), omittedEvents++), events.push(record2);
    }
    function observeType(type, source, supported = !1) {
      if (disposed || !validType(type) || SKIP.has(type)) return;
      let sourceName = SOURCES.has(source) ? source : "unknown", entry = observedTypes.get(type);
      if (!entry) {
        if (observedTypes.size >= typeLimit) {
          omittedTypes++;
          return;
        }
        observedTypes.set(type, entry = { type, supported: supported === !0, count: 0, sources: {} });
      }
      entry.supported ||= supported === !0, entry.count++, entry.sources[sourceName] = (entry.sources[sourceName] || 0) + 1;
    }
    function snapshot({ bridge } = {}) {
      let status = {};
      for (let key of BRIDGE_NUMBERS) {
        let value = number2(own2(bridge, key));
        value !== void 0 && (status[key] = value);
      }
      let lastType = own2(bridge, "lastType");
      validType(lastType) && !SKIP.has(lastType) && (status.lastType = lastType);
      let targets = own2(bridge, "targets");
      return Array.isArray(targets) && (status.targets = [0, 1, 2, 3].map((index) => own2(targets, String(index))).filter((value) => value === "ServerProxy" || value === "ActivityManager")), JSON.parse(JSON.stringify({
        format: "sgs-toolbox-card-diagnostics-v1",
        coreVersion,
        generatedAt: number2(now()) ?? null,
        sessionId,
        firstAt,
        limits: { events: eventLimit, types: typeLimit, cardArray: 256 },
        omittedEvents,
        omittedTypeObservations: omittedTypes,
        bridge: status,
        observedTypes: [...observedTypes.values()],
        recordedTypes: Object.fromEntries(recordedTypes),
        events,
        seatSnapshot,
        scope: "\u5DF2\u6295\u5F71\u5361\u724C\u4E8B\u4EF6\u4E0E\u6D88\u606F\u7C7B\u578B\uFF1B\u4E0D\u542B\u8D26\u53F7\u3001\u6635\u79F0\u3001\u5B8C\u6574\u767B\u5F55\u6570\u636E\u6216\u539F\u59CB\u534F\u8BAE\u5BF9\u8C61\uFF1B\u672A\u4E0A\u4F20"
      }));
    }
    let off = typeof journal?.subscribe == "function" ? journal.subscribe(record) : () => {
    };
    function dispose() {
      disposed || (disposed = !0, off());
    }
    return scope?.add(dispose), {
      observeType,
      record,
      snapshot,
      serialize: (options) => JSON.stringify(snapshot(options), null, 2),
      clear() {
        resetSession(null), observedTypes.clear(), omittedTypes = 0;
      },
      dispose
    };
  }

  // src/ui/game-viewport.js
  function createGameViewport({ window: win, document: doc, scope }) {
    let reserved = 0, stage, original, wrapper, descriptor, appliedWidth = 0, appliedHeight = 0, browser, widthDescriptor, widthGetter, styles = /* @__PURE__ */ new Map();
    function releaseBrowser() {
      browser && Object.getOwnPropertyDescriptor(browser, "clientWidth")?.get === widthGetter && (widthDescriptor ? Object.defineProperty(browser, "clientWidth", widthDescriptor) : delete browser.clientWidth), browser = widthDescriptor = widthGetter = void 0;
    }
    function syncBrowser() {
      let next = reserved ? win.Laya?.Browser : void 0;
      if (browser === next || (releaseBrowser(), !next)) return;
      let own3 = Object.getOwnPropertyDescriptor(next, "clientWidth");
      if (own3 && !own3.configurable) return;
      browser = next, widthDescriptor = own3;
      let readWidth = own3?.get ? () => Reflect.apply(own3.get, next, []) : () => win.innerWidth;
      widthGetter = () => Math.max(1, readWidth() - reserved), Object.defineProperty(browser, "clientWidth", { configurable: !0, enumerable: own3?.enumerable ?? !0, get: widthGetter }), appliedWidth = -1;
    }
    function restoreStyles() {
      for (let [node, previous] of styles)
        node.style.getPropertyValue("width") === previous.applied && (previous.value ? node.style.setProperty("width", previous.value, previous.priority) : node.style.removeProperty("width"));
      styles.clear();
    }
    function resize(target) {
      if (typeof target?.setScreenSize != "function") return;
      let ratio = Number(win.Laya?.Browser?.pixelRatio) || win.devicePixelRatio || 1;
      target.setScreenSize(win.innerWidth * ratio, win.innerHeight * ratio);
    }
    function releaseStage() {
      stage && stage.setScreenSize === wrapper && (descriptor ? Object.defineProperty(stage, "setScreenSize", descriptor) : delete stage.setScreenSize), resize(stage), stage = original = wrapper = void 0;
    }
    function sync() {
      let next = reserved ? win.Laya?.stage : void 0, width = reserved ? Math.max(1, win.innerWidth - reserved) : 0;
      if (syncBrowser(), reserved || restoreStyles(), stage !== next && (releaseStage(), typeof next?.setScreenSize == "function")) {
        stage = next, original = stage.setScreenSize, descriptor = Object.getOwnPropertyDescriptor(stage, "setScreenSize");
        let nativeResize = original;
        wrapper = function(screenWidth, screenHeight, ...args) {
          let ratio = Number(win.Laya?.Browser?.pixelRatio) || win.devicePixelRatio || 1, limit2 = Math.max(1, win.innerWidth - reserved) * ratio;
          return Reflect.apply(nativeResize, this, [Math.min(screenWidth, limit2), screenHeight, ...args]);
        }, stage.setScreenSize = wrapper, appliedWidth = -1;
      }
      if (!reserved) {
        restoreStyles(), appliedWidth = 0;
        return;
      }
      for (let node of doc.querySelectorAll("#bgDiv,#layaContainer,#laya_container,#GameDiv"))
        styles.has(node) || styles.set(node, { value: node.style.getPropertyValue("width"), priority: node.style.getPropertyPriority("width") }), node.style.setProperty("width", width + "px", "important"), styles.get(node).applied = width + "px";
      (width !== appliedWidth || win.innerHeight !== appliedHeight) && (resize(stage), typeof win.SystemContext?.UpdateGameSize == "function" && win.SystemContext.UpdateGameSize(width, win.Laya?.Browser?.clientHeight || win.innerHeight), appliedWidth = width, appliedHeight = win.innerHeight);
    }
    return scope.listen(win, "resize", sync), scope.interval(sync, 500), scope.add(() => {
      reserved = 0, restoreStyles(), releaseBrowser(), releaseStage();
    }), { reserve(width) {
      reserved = Math.max(0, Number(width) || 0), sync();
    } };
  }

  // src/ui/card-style-workshop.js
  function mountCardStyleWorkshop(container, { document: doc, cardStyles, settings }) {
    let details = doc.createElement("section");
    details.className = "card-style-workshop plugin-group";
    let heading = doc.createElement("h3");
    heading.className = "plugin-heading";
    let toggle = doc.createElement("button");
    toggle.type = "button", toggle.className = "plugin-toggle";
    let title = doc.createElement("span");
    title.className = "plugin-title", title.textContent = "\u5361\u724C\u5916\u89C2", toggle.append(createIcon(doc, "cards"), title, createIcon(doc, "chevron", "plugin-chevron"));
    let body = doc.createElement("div");
    body.className = "plugin-body", body.id = "core-card-style-workshop", toggle.setAttribute("aria-controls", body.id);
    let apply = (expanded) => {
      body.hidden = !expanded, toggle.setAttribute("aria-expanded", String(expanded)), toggle.title = (expanded ? "\u6536\u8D77" : "\u5C55\u5F00") + "\u5361\u724C\u5916\u89C2", toggle.setAttribute("aria-label", toggle.title);
    };
    apply(settings.get("cardStyleExpanded", !1)), toggle.onclick = () => {
      let expanded = body.hidden;
      settings.set("cardStyleExpanded", expanded), apply(expanded);
    }, heading.append(toggle), details.append(heading, body), container.append(details);
    let render = () => {
      body.replaceChildren(), body.append(helpTip(doc, "\u5361\u9762\u4E0E\u5361\u80CC\u72EC\u7ACB\u9009\u62E9\u3002\u5B8C\u6574\u5361\u9762\u6309\u724C\u540D\u5339\u914D\uFF0C\u7F3A\u5931\u5361\u56FE\u4FDD\u7559\u6E38\u620F\u539F\u751F\u663E\u793A\uFF1B\u82B1\u8272\u70B9\u6570\u6CBF\u7528\u6E38\u620F\u3002"));
      let scopeLabel = doc.createElement("p");
      scopeLabel.textContent = "\u5E94\u7528\u8303\u56F4", body.append(scopeLabel);
      let scopes = doc.createElement("div");
      scopes.className = "sgs-segments", body.append(scopes);
      for (let [value, name] of [["self", "\u4EC5\u81EA\u5DF1\u7684\u624B\u724C"], ["all", "\u6240\u6709\u4EBA"]]) {
        let button = doc.createElement("button");
        button.type = "button", button.textContent = name, button.setAttribute("aria-pressed", String(cardStyles?.selection?.scope === value || !cardStyles?.selection && value === "all")), button.onclick = () => cardStyles?.selectScope(value), scopes.append(button);
      }
      let help = doc.createElement("p");
      help.className = "muted", help.textContent = "\u4EC5\u81EA\u5DF1\uFF1A\u81EA\u5DF1\u7684\u624B\u724C\u53CA\u5176\u4F7F\u7528\u3001\u6253\u51FA\u3001\u88AB\u987A\u8D70\u65F6\u6CBF\u7528\u6240\u9009\u5916\u89C2\uFF1B\u4ED6\u4EBA\u7684\u724C\u4FDD\u6301\u6E38\u620F\u5916\u89C2\u3002", body.append(help);
      for (let side of ["face", "back"]) {
        let label = doc.createElement("p");
        label.textContent = side === "face" ? "\u5361\u9762" : "\u5361\u80CC", body.append(label);
        let choices = doc.createElement("div");
        choices.className = "card-style-choices", body.append(choices);
        let option = (id, name, style2) => {
          let b = doc.createElement("button");
          if (b.type = "button", b.dataset.cardStyle = id, b.dataset.cardSide = side, b.setAttribute("aria-pressed", String((cardStyles?.list().some((item) => item.id === (cardStyles.selection?.[side] ?? cardStyles.current)) ? cardStyles.selection?.[side] ?? cardStyles.current : "") === id)), style2) {
            let previews = doc.createElement("span");
            previews.className = "card-style-preview";
            for (let back of [side === "back"]) {
              let canvas = cardStyles?.preview ? cardStyles.preview(style2, back) : style2.native ? null : drawCardStyle(doc, back ? style2.back : style2.face, back);
              if (canvas)
                canvas.setAttribute("aria-hidden", "true"), previews.append(canvas);
              else {
                let placeholder = doc.createElement("span");
                placeholder.className = "muted", placeholder.textContent = style2.atlas ? "\u9009\u7528\u540E\u52A0\u8F7D\u9884\u89C8" : back ? "\u539F\u751F\u5361\u80CC" : "\u539F\u751F\u5361\u9762", previews.append(placeholder);
              }
            }
            b.append(previews);
          }
          let text2 = doc.createElement("span");
          text2.textContent = side === "back" && style2?.backName || name, b.append(text2), b.onclick = () => cardStyles?.selectSide(side, id), choices.append(b);
        };
        option("", "\u8DDF\u968F\u6E38\u620F");
        for (let style2 of cardStyles?.list() || []) (side !== "back" || !style2.atlas || style2.atlas.backImage) && option(style2.id, style2.name, style2);
        if (side === "face") {
          let selected = cardStyles?.list().find((style2) => style2.id === cardStyles.selection?.face);
          if (selected?.atlas) {
            let source = doc.createElement("p");
            source.className = "muted", source.textContent = selected.atlas.source, body.append(source);
            let link = doc.createElement("a");
            link.href = selected.atlas.index.url, link.target = "_blank", link.rel = "noopener noreferrer", link.textContent = "\u67E5\u770B\u56FE\u96C6\u6765\u6E90", body.append(link);
            let note = doc.createElement("p");
            if (note.className = "muted", note.textContent = "\u9996\u6B21\u9009\u62E9\u8054\u7F51\u52A0\u8F7D\u6574\u5957\u8D44\u6E90\u3002\u56FD\u6218\u3001\u9650\u65F6\u53CA\u6D3B\u52A8\u724C\u4EC5\u7CBE\u786E\u5339\u914D\u540C\u540D\u5361\u56FE\uFF1B\u7F3A\u5931\u3001\u7279\u6B8A\u6E32\u67D3\u6216\u4E0B\u8F7D\u5931\u8D25\u5747\u56DE\u9000\u6E38\u620F\u5916\u89C2\u3002", body.append(note), cardStyles.status?.includes("\u52A0\u8F7D\u5931\u8D25")) {
              let retry = doc.createElement("button");
              retry.type = "button", retry.textContent = "\u91CD\u65B0\u52A0\u8F7D\u5361\u9762", retry.onclick = () => cardStyles.retry(), body.append(retry);
            }
          }
        }
      }
      let status = doc.createElement("p");
      status.className = "muted", status.style.overflowWrap = "anywhere", status.setAttribute("role", "status"), status.textContent = cardStyles?.status || "\u5361\u724C\u63A5\u53E3\u7B49\u5F85\u542F\u52A8", /失败|未应用/.test(status.textContent) && (status.style.color = "var(--sgs-danger)"), body.append(status);
    };
    render();
    let off = cardStyles?.subscribe(render);
    return () => {
      off?.(), details.remove();
    };
  }

  // src/ui/theme-workshop.js
  var STYLES = `
.sgs-themes{font:12px/1.5 var(--sgs-font,sans-serif);color:var(--sgs-text);min-width:0}
.sgs-themes .theme-heading{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:5px}
.sgs-themes h4{margin:0;font-size:13px;color:var(--sgs-accent)}
.sgs-themes .theme-count{font-size:10px;color:var(--sgs-muted);white-space:nowrap}
.sgs-themes .theme-intro{margin:0 0 13px;font-size:11px;color:var(--sgs-muted);line-height:1.65}
.sgs-themes .theme-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.sgs-themes button.theme-card{position:relative;display:block;min-width:0;width:100%;padding:0;overflow:hidden;text-align:left;border:1px solid color-mix(in srgb,var(--sgs-border) 55%,transparent);border-radius:8px;background:var(--sgs-surface);box-shadow:0 2px 7px #0002;color:var(--sgs-text);cursor:pointer;transition:border-color .16s,background .16s}
.sgs-themes button.theme-card:hover{border-color:var(--sgs-accent);background:var(--sgs-raised)}
.sgs-themes button.theme-card[aria-pressed=true]{border-color:var(--sgs-accent);box-shadow:inset 0 -2px var(--sgs-accent),0 2px 7px #0002}
.sgs-themes button.theme-card:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}
.sgs-themes button.theme-card:disabled{cursor:default;opacity:1}
.sgs-themes .theme-preview{display:flex;align-items:center;justify-content:center;height:56px;padding:10px 7px;background:linear-gradient(145deg,var(--preview-surface),var(--preview-bg));border-bottom:1px solid color-mix(in srgb,var(--preview-border) 50%,transparent);color:var(--preview-text)}
.sgs-themes .theme-mini{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;max-width:126px;height:30px;padding:0 7px;border:1px solid color-mix(in srgb,var(--preview-border) 65%,transparent);border-radius:7px;background:linear-gradient(155deg,var(--preview-raised),var(--preview-bg));box-shadow:0 2px 5px #0004,inset 0 1px color-mix(in srgb,var(--preview-accent) 12%,transparent)}
.sgs-themes .theme-mini-seal{font:17px/1 'KaiTi','STKaiti',serif;color:var(--preview-accent)}
.sgs-themes .theme-mini-number{font:600 18px/1 Georgia,serif;color:var(--preview-text)}
.sgs-themes .theme-mini-separator{width:1px;height:13px;background:var(--preview-border);margin-left:auto}
.sgs-themes .theme-mini .sgs-line-icon{width:13px;height:13px;color:var(--preview-muted)}
.sgs-themes .theme-meta{display:block;padding:8px 8px 9px;min-width:0}
.sgs-themes .theme-title-row{display:flex;align-items:center;justify-content:space-between;gap:3px;min-width:0}
.sgs-themes .theme-name{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sgs-themes .theme-card-state{font-size:9px;color:var(--sgs-muted);white-space:nowrap;flex:none}
.sgs-themes [aria-pressed=true] .theme-card-state{color:var(--sgs-accent)}
.sgs-themes .theme-description{display:block;margin-top:3px;font-size:10px;color:var(--sgs-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sgs-themes .theme-status{display:flex;align-items:center;gap:5px;margin:11px 0 0;font-size:11px;color:var(--sgs-accent);overflow-wrap:anywhere}
.sgs-themes .theme-footnote{margin:5px 0 0;font-size:10px;line-height:1.7;color:var(--sgs-muted)}
@media(prefers-reduced-motion:reduce){.sgs-themes button.theme-card{transition:none}}
`;
  function mountThemeWorkshop(container, { document: doc, themes, notify }) {
    let scope = new ResourceScope(), root = doc.createElement("section");
    root.className = "sgs-themes", root.dataset.themeWorkshop = "";
    let el = (tag, cls, text2) => {
      let node = doc.createElement(tag);
      return cls && (node.className = cls), text2 !== void 0 && (node.textContent = text2), node;
    }, style2 = el("style");
    style2.textContent = STYLES;
    let heading = el("div", "theme-heading"), count = el("span", "theme-count");
    heading.append(el("h4", "", "\u9009\u62E9\u914D\u8272"), count);
    let intro = helpTip(doc, "\u9009\u62E9\u4E00\u5957\u914D\u8272\uFF0C\u5373\u523B\u6362\u88C5\u3002"), grid = el("div", "theme-grid");
    grid.setAttribute("role", "group"), grid.setAttribute("aria-label", "\u5DE5\u5177\u7BB1\u4E3B\u9898");
    let status = el("p", "theme-status");
    status.dataset.themeStatus = "", status.setAttribute("role", "status"), status.setAttribute("aria-live", "polite");
    let footnote = helpTip(doc, "\u914D\u8272\u81EA\u52A8\u4FDD\u5B58\u3002\u4E3B\u9898\u5305\u505C\u7528\u540E\u6682\u56DE\u7384\u91D1\uFF0C\u91CD\u65B0\u542F\u7528\u540E\u6062\u590D\u9009\u62E9\u3002");
    root.append(style2, heading, intro, grid, status, footnote), container.append(root);
    let signature, cards = /* @__PURE__ */ new Map(), cardScope, update = () => {
      if (scope.closed) return;
      let palette = themes?.list() || [BLACK_GOLD], current = themes?.current, next = JSON.stringify(palette);
      if (signature !== next) {
        signature = next, cardScope?.dispose(), cardScope = new ResourceScope(), cards = /* @__PURE__ */ new Map(), grid.replaceChildren(), count.textContent = `${palette.length} \u5957\u914D\u8272`;
        for (let theme of palette) {
          let description = theme.description || (theme.id === BLACK_GOLD.id ? "\u6C89\u9759\u7384\u8272\uFF0C\u7ECF\u5178\u938F\u91D1" : "\u6269\u5C55\u4E3B\u9898"), button = el("button", "theme-card");
          button.type = "button", button.dataset.themeId = theme.id, button.setAttribute("aria-label", `\u4F7F\u7528${theme.name}\u4E3B\u9898`), button.title = `${theme.name} \xB7 ${description}`, button.setAttribute("aria-pressed", "false"), button.disabled = !themes;
          let preview = el("span", "theme-preview");
          preview.setAttribute("aria-hidden", "true");
          for (let [key, value] of Object.entries({ ...BLACK_GOLD.tokens, ...theme.tokens })) preview.style.setProperty("--preview-" + key, value);
          let mini = el("span", "theme-mini");
          mini.append(el("span", "theme-mini-seal", "\u6740"), el("span", "theme-mini-number", "3"), el("span", "theme-mini-separator"), controlIcon(doc, "camera")), preview.append(mini);
          let meta = el("span", "theme-meta"), title = el("span", "theme-title-row"), state = el("span", "theme-card-state");
          title.append(el("span", "theme-name", theme.name), state), meta.append(title, el("span", "theme-description", description)), button.append(preview, meta), cardScope.listen(button, "click", () => {
            try {
              themes.select(theme.id);
            } catch (error) {
              notify(`\u4E3B\u9898\u5207\u6362\u5931\u8D25\uFF1A${error?.message || String(error)}`);
            }
          }), cards.set(theme.id, { button, state }), grid.append(button);
        }
      }
      for (let [id, { button, state }] of cards) {
        let active = current?.id === id;
        button.setAttribute("aria-pressed", String(active)), state.textContent = active ? "\u4F7F\u7528\u4E2D" : "\u5207\u6362";
      }
      let selected = palette.find((theme) => theme.id === current?.id);
      status.textContent = `\u5F53\u524D \xB7 ${selected?.name || BLACK_GOLD.name}`;
    };
    return update(), themes && scope.add(themes.subscribe(update)), scope.add(() => {
      cardScope?.dispose(), root.remove();
    }), () => scope.dispose();
  }

  // node_modules/html-to-image/es/util.js
  function resolveUrl(url, baseUrl) {
    if (url.match(/^[a-z]+:\/\//i))
      return url;
    if (url.match(/^\/\//))
      return window.location.protocol + url;
    if (url.match(/^[a-z]+:/i))
      return url;
    let doc = document.implementation.createHTMLDocument(), base = doc.createElement("base"), a = doc.createElement("a");
    return doc.head.appendChild(base), doc.body.appendChild(a), baseUrl && (base.href = baseUrl), a.href = url, a.href;
  }
  var uuid = /* @__PURE__ */ (() => {
    let counter = 0, random = () => (
      // eslint-disable-next-line no-bitwise
      `0000${(Math.random() * 36 ** 4 << 0).toString(36)}`.slice(-4)
    );
    return () => (counter += 1, `u${random()}${counter}`);
  })();
  function toArray(arrayLike) {
    let arr = [];
    for (let i = 0, l = arrayLike.length; i < l; i++)
      arr.push(arrayLike[i]);
    return arr;
  }
  var styleProps = null;
  function getStyleProperties(options = {}) {
    return styleProps || (options.includeStyleProperties ? (styleProps = options.includeStyleProperties, styleProps) : (styleProps = toArray(window.getComputedStyle(document.documentElement)), styleProps));
  }
  function px(node, styleProperty) {
    let val = (node.ownerDocument.defaultView || window).getComputedStyle(node).getPropertyValue(styleProperty);
    return val ? parseFloat(val.replace("px", "")) : 0;
  }
  function getNodeWidth(node) {
    let leftBorder = px(node, "border-left-width"), rightBorder = px(node, "border-right-width");
    return node.clientWidth + leftBorder + rightBorder;
  }
  function getNodeHeight(node) {
    let topBorder = px(node, "border-top-width"), bottomBorder = px(node, "border-bottom-width");
    return node.clientHeight + topBorder + bottomBorder;
  }
  function getImageSize(targetNode, options = {}) {
    let width = options.width || getNodeWidth(targetNode), height = options.height || getNodeHeight(targetNode);
    return { width, height };
  }
  function getPixelRatio() {
    let ratio, FINAL_PROCESS;
    try {
      FINAL_PROCESS = process;
    } catch {
    }
    let val = FINAL_PROCESS && FINAL_PROCESS.env ? FINAL_PROCESS.env.devicePixelRatio : null;
    return val && (ratio = parseInt(val, 10), Number.isNaN(ratio) && (ratio = 1)), ratio || window.devicePixelRatio || 1;
  }
  var canvasDimensionLimit = 16384;
  function checkCanvasDimensions(canvas) {
    (canvas.width > canvasDimensionLimit || canvas.height > canvasDimensionLimit) && (canvas.width > canvasDimensionLimit && canvas.height > canvasDimensionLimit ? canvas.width > canvas.height ? (canvas.height *= canvasDimensionLimit / canvas.width, canvas.width = canvasDimensionLimit) : (canvas.width *= canvasDimensionLimit / canvas.height, canvas.height = canvasDimensionLimit) : canvas.width > canvasDimensionLimit ? (canvas.height *= canvasDimensionLimit / canvas.width, canvas.width = canvasDimensionLimit) : (canvas.width *= canvasDimensionLimit / canvas.height, canvas.height = canvasDimensionLimit));
  }
  function createImage(url) {
    return new Promise((resolve, reject) => {
      let img = new Image();
      img.onload = () => {
        img.decode().then(() => {
          requestAnimationFrame(() => resolve(img));
        });
      }, img.onerror = reject, img.crossOrigin = "anonymous", img.decoding = "async", img.src = url;
    });
  }
  async function svgToDataURL(svg) {
    return Promise.resolve().then(() => new XMLSerializer().serializeToString(svg)).then(encodeURIComponent).then((html) => `data:image/svg+xml;charset=utf-8,${html}`);
  }
  async function nodeToDataURL(node, width, height) {
    let xmlns = "http://www.w3.org/2000/svg", svg = document.createElementNS(xmlns, "svg"), foreignObject = document.createElementNS(xmlns, "foreignObject");
    return svg.setAttribute("width", `${width}`), svg.setAttribute("height", `${height}`), svg.setAttribute("viewBox", `0 0 ${width} ${height}`), foreignObject.setAttribute("width", "100%"), foreignObject.setAttribute("height", "100%"), foreignObject.setAttribute("x", "0"), foreignObject.setAttribute("y", "0"), foreignObject.setAttribute("externalResourcesRequired", "true"), svg.appendChild(foreignObject), foreignObject.appendChild(node), svgToDataURL(svg);
  }
  var isInstanceOfElement = (node, instance) => {
    if (node instanceof instance)
      return !0;
    let nodePrototype = Object.getPrototypeOf(node);
    return nodePrototype === null ? !1 : nodePrototype.constructor.name === instance.name || isInstanceOfElement(nodePrototype, instance);
  };

  // node_modules/html-to-image/es/clone-pseudos.js
  function formatCSSText(style2) {
    let content = style2.getPropertyValue("content");
    return `${style2.cssText} content: '${content.replace(/'|"/g, "")}';`;
  }
  function formatCSSProperties(style2, options) {
    return getStyleProperties(options).map((name) => {
      let value = style2.getPropertyValue(name), priority2 = style2.getPropertyPriority(name);
      return `${name}: ${value}${priority2 ? " !important" : ""};`;
    }).join(" ");
  }
  function getPseudoElementStyle(className, pseudo, style2, options) {
    let selector = `.${className}:${pseudo}`, cssText = style2.cssText ? formatCSSText(style2) : formatCSSProperties(style2, options);
    return document.createTextNode(`${selector}{${cssText}}`);
  }
  function clonePseudoElement(nativeNode, clonedNode, pseudo, options) {
    let style2 = window.getComputedStyle(nativeNode, pseudo), content = style2.getPropertyValue("content");
    if (content === "" || content === "none")
      return;
    let className = uuid();
    try {
      clonedNode.className = `${clonedNode.className} ${className}`;
    } catch {
      return;
    }
    let styleElement = document.createElement("style");
    styleElement.appendChild(getPseudoElementStyle(className, pseudo, style2, options)), clonedNode.appendChild(styleElement);
  }
  function clonePseudoElements(nativeNode, clonedNode, options) {
    clonePseudoElement(nativeNode, clonedNode, ":before", options), clonePseudoElement(nativeNode, clonedNode, ":after", options);
  }

  // node_modules/html-to-image/es/mimes.js
  var WOFF = "application/font-woff", JPEG = "image/jpeg", mimes = {
    woff: WOFF,
    woff2: WOFF,
    ttf: "application/font-truetype",
    eot: "application/vnd.ms-fontobject",
    png: "image/png",
    jpg: JPEG,
    jpeg: JPEG,
    gif: "image/gif",
    tiff: "image/tiff",
    svg: "image/svg+xml",
    webp: "image/webp"
  };
  function getExtension(url) {
    let match = /\.([^./]*?)$/g.exec(url);
    return match ? match[1] : "";
  }
  function getMimeType(url) {
    let extension = getExtension(url).toLowerCase();
    return mimes[extension] || "";
  }

  // node_modules/html-to-image/es/dataurl.js
  function getContentFromDataUrl(dataURL) {
    return dataURL.split(/,/)[1];
  }
  function isDataUrl(url) {
    return url.search(/^(data:)/) !== -1;
  }
  function makeDataUrl(content, mimeType) {
    return `data:${mimeType};base64,${content}`;
  }
  async function fetchAsDataURL(url, init, process2) {
    let res = await fetch(url, init);
    if (res.status === 404)
      throw new Error(`Resource "${res.url}" not found`);
    let blob = await res.blob();
    return new Promise((resolve, reject) => {
      let reader = new FileReader();
      reader.onerror = reject, reader.onloadend = () => {
        try {
          resolve(process2({ res, result: reader.result }));
        } catch (error) {
          reject(error);
        }
      }, reader.readAsDataURL(blob);
    });
  }
  var cache = {};
  function getCacheKey(url, contentType, includeQueryParams) {
    let key = url.replace(/\?.*/, "");
    return includeQueryParams && (key = url), /ttf|otf|eot|woff2?/i.test(key) && (key = key.replace(/.*\//, "")), contentType ? `[${contentType}]${key}` : key;
  }
  async function resourceToDataURL(resourceUrl, contentType, options) {
    let cacheKey = getCacheKey(resourceUrl, contentType, options.includeQueryParams);
    if (cache[cacheKey] != null)
      return cache[cacheKey];
    options.cacheBust && (resourceUrl += (/\?/.test(resourceUrl) ? "&" : "?") + (/* @__PURE__ */ new Date()).getTime());
    let dataURL;
    try {
      let content = await fetchAsDataURL(resourceUrl, options.fetchRequestInit, ({ res, result }) => (contentType || (contentType = res.headers.get("Content-Type") || ""), getContentFromDataUrl(result)));
      dataURL = makeDataUrl(content, contentType);
    } catch (error) {
      dataURL = options.imagePlaceholder || "";
      let msg = `Failed to fetch resource: ${resourceUrl}`;
      error && (msg = typeof error == "string" ? error : error.message), msg && console.warn(msg);
    }
    return cache[cacheKey] = dataURL, dataURL;
  }

  // node_modules/html-to-image/es/clone-node.js
  async function cloneCanvasElement(canvas) {
    let dataURL = canvas.toDataURL();
    return dataURL === "data:," ? canvas.cloneNode(!1) : createImage(dataURL);
  }
  async function cloneVideoElement(video, options) {
    if (video.currentSrc) {
      let canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
      canvas.width = video.clientWidth, canvas.height = video.clientHeight, ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      let dataURL2 = canvas.toDataURL();
      return createImage(dataURL2);
    }
    let poster = video.poster, contentType = getMimeType(poster), dataURL = await resourceToDataURL(poster, contentType, options);
    return createImage(dataURL);
  }
  async function cloneIFrameElement(iframe, options) {
    var _a;
    try {
      if (!((_a = iframe?.contentDocument) === null || _a === void 0) && _a.body)
        return await cloneNode(iframe.contentDocument.body, options, !0);
    } catch {
    }
    return iframe.cloneNode(!1);
  }
  async function cloneSingleNode(node, options) {
    return isInstanceOfElement(node, HTMLCanvasElement) ? cloneCanvasElement(node) : isInstanceOfElement(node, HTMLVideoElement) ? cloneVideoElement(node, options) : isInstanceOfElement(node, HTMLIFrameElement) ? cloneIFrameElement(node, options) : node.cloneNode(isSVGElement(node));
  }
  var isSlotElement = (node) => node.tagName != null && node.tagName.toUpperCase() === "SLOT", isSVGElement = (node) => node.tagName != null && node.tagName.toUpperCase() === "SVG";
  async function cloneChildren(nativeNode, clonedNode, options) {
    var _a, _b;
    if (isSVGElement(clonedNode))
      return clonedNode;
    let children2 = [];
    return isSlotElement(nativeNode) && nativeNode.assignedNodes ? children2 = toArray(nativeNode.assignedNodes()) : isInstanceOfElement(nativeNode, HTMLIFrameElement) && (!((_a = nativeNode.contentDocument) === null || _a === void 0) && _a.body) ? children2 = toArray(nativeNode.contentDocument.body.childNodes) : children2 = toArray(((_b = nativeNode.shadowRoot) !== null && _b !== void 0 ? _b : nativeNode).childNodes), children2.length === 0 || isInstanceOfElement(nativeNode, HTMLVideoElement) || await children2.reduce((deferred, child) => deferred.then(() => cloneNode(child, options)).then((clonedChild) => {
      clonedChild && clonedNode.appendChild(clonedChild);
    }), Promise.resolve()), clonedNode;
  }
  function cloneCSSStyle(nativeNode, clonedNode, options) {
    let targetStyle = clonedNode.style;
    if (!targetStyle)
      return;
    let sourceStyle = window.getComputedStyle(nativeNode);
    sourceStyle.cssText ? (targetStyle.cssText = sourceStyle.cssText, targetStyle.transformOrigin = sourceStyle.transformOrigin) : getStyleProperties(options).forEach((name) => {
      let value = sourceStyle.getPropertyValue(name);
      name === "font-size" && value.endsWith("px") && (value = `${Math.floor(parseFloat(value.substring(0, value.length - 2))) - 0.1}px`), isInstanceOfElement(nativeNode, HTMLIFrameElement) && name === "display" && value === "inline" && (value = "block"), name === "d" && clonedNode.getAttribute("d") && (value = `path(${clonedNode.getAttribute("d")})`), targetStyle.setProperty(name, value, sourceStyle.getPropertyPriority(name));
    });
  }
  function cloneInputValue(nativeNode, clonedNode) {
    isInstanceOfElement(nativeNode, HTMLTextAreaElement) && (clonedNode.innerHTML = nativeNode.value), isInstanceOfElement(nativeNode, HTMLInputElement) && clonedNode.setAttribute("value", nativeNode.value);
  }
  function cloneSelectValue(nativeNode, clonedNode) {
    if (isInstanceOfElement(nativeNode, HTMLSelectElement)) {
      let selectedOption = Array.from(clonedNode.children).find((child) => nativeNode.value === child.getAttribute("value"));
      selectedOption && selectedOption.setAttribute("selected", "");
    }
  }
  function decorate(nativeNode, clonedNode, options) {
    return isInstanceOfElement(clonedNode, Element) && (cloneCSSStyle(nativeNode, clonedNode, options), clonePseudoElements(nativeNode, clonedNode, options), cloneInputValue(nativeNode, clonedNode), cloneSelectValue(nativeNode, clonedNode)), clonedNode;
  }
  async function ensureSVGSymbols(clone, options) {
    let uses = clone.querySelectorAll ? clone.querySelectorAll("use") : [];
    if (uses.length === 0)
      return clone;
    let processedDefs = {};
    for (let i = 0; i < uses.length; i++) {
      let id = uses[i].getAttribute("xlink:href");
      if (id) {
        let exist = clone.querySelector(id), definition = document.querySelector(id);
        !exist && definition && !processedDefs[id] && (processedDefs[id] = await cloneNode(definition, options, !0));
      }
    }
    let nodes = Object.values(processedDefs);
    if (nodes.length) {
      let ns = "http://www.w3.org/1999/xhtml", svg = document.createElementNS(ns, "svg");
      svg.setAttribute("xmlns", ns), svg.style.position = "absolute", svg.style.width = "0", svg.style.height = "0", svg.style.overflow = "hidden", svg.style.display = "none";
      let defs = document.createElementNS(ns, "defs");
      svg.appendChild(defs);
      for (let i = 0; i < nodes.length; i++)
        defs.appendChild(nodes[i]);
      clone.appendChild(svg);
    }
    return clone;
  }
  async function cloneNode(node, options, isRoot) {
    return !isRoot && options.filter && !options.filter(node) ? null : Promise.resolve(node).then((clonedNode) => cloneSingleNode(clonedNode, options)).then((clonedNode) => cloneChildren(node, clonedNode, options)).then((clonedNode) => decorate(node, clonedNode, options)).then((clonedNode) => ensureSVGSymbols(clonedNode, options));
  }

  // node_modules/html-to-image/es/embed-resources.js
  var URL_REGEX = /url\((['"]?)([^'"]+?)\1\)/g, URL_WITH_FORMAT_REGEX = /url\([^)]+\)\s*format\((["']?)([^"']+)\1\)/g, FONT_SRC_REGEX = /src:\s*(?:url\([^)]+\)\s*format\([^)]+\)[,;]\s*)+/g;
  function toRegex(url) {
    let escaped = url.replace(/([.*+?^${}()|\[\]\/\\])/g, "\\$1");
    return new RegExp(`(url\\(['"]?)(${escaped})(['"]?\\))`, "g");
  }
  function parseURLs(cssText) {
    let urls = [];
    return cssText.replace(URL_REGEX, (raw, quotation, url) => (urls.push(url), raw)), urls.filter((url) => !isDataUrl(url));
  }
  async function embed(cssText, resourceURL, baseURL, options, getContentFromUrl) {
    try {
      let resolvedURL = baseURL ? resolveUrl(resourceURL, baseURL) : resourceURL, contentType = getMimeType(resourceURL), dataURL;
      if (getContentFromUrl) {
        let content = await getContentFromUrl(resolvedURL);
        dataURL = makeDataUrl(content, contentType);
      } else
        dataURL = await resourceToDataURL(resolvedURL, contentType, options);
      return cssText.replace(toRegex(resourceURL), `$1${dataURL}$3`);
    } catch {
    }
    return cssText;
  }
  function filterPreferredFontFormat(str, { preferredFontFormat }) {
    return preferredFontFormat ? str.replace(FONT_SRC_REGEX, (match) => {
      for (; ; ) {
        let [src, , format] = URL_WITH_FORMAT_REGEX.exec(match) || [];
        if (!format)
          return "";
        if (format === preferredFontFormat)
          return `src: ${src};`;
      }
    }) : str;
  }
  function shouldEmbed(url) {
    return url.search(URL_REGEX) !== -1;
  }
  async function embedResources(cssText, baseUrl, options) {
    if (!shouldEmbed(cssText))
      return cssText;
    let filteredCSSText = filterPreferredFontFormat(cssText, options);
    return parseURLs(filteredCSSText).reduce((deferred, url) => deferred.then((css) => embed(css, url, baseUrl, options)), Promise.resolve(filteredCSSText));
  }

  // node_modules/html-to-image/es/embed-images.js
  async function embedProp(propName, node, options) {
    var _a;
    let propValue = (_a = node.style) === null || _a === void 0 ? void 0 : _a.getPropertyValue(propName);
    if (propValue) {
      let cssString = await embedResources(propValue, null, options);
      return node.style.setProperty(propName, cssString, node.style.getPropertyPriority(propName)), !0;
    }
    return !1;
  }
  async function embedBackground(clonedNode, options) {
    await embedProp("background", clonedNode, options) || await embedProp("background-image", clonedNode, options), await embedProp("mask", clonedNode, options) || await embedProp("-webkit-mask", clonedNode, options) || await embedProp("mask-image", clonedNode, options) || await embedProp("-webkit-mask-image", clonedNode, options);
  }
  async function embedImageNode(clonedNode, options) {
    let isImageElement = isInstanceOfElement(clonedNode, HTMLImageElement);
    if (!(isImageElement && !isDataUrl(clonedNode.src)) && !(isInstanceOfElement(clonedNode, SVGImageElement) && !isDataUrl(clonedNode.href.baseVal)))
      return;
    let url = isImageElement ? clonedNode.src : clonedNode.href.baseVal, dataURL = await resourceToDataURL(url, getMimeType(url), options);
    await new Promise((resolve, reject) => {
      clonedNode.onload = resolve, clonedNode.onerror = options.onImageErrorHandler ? (...attributes) => {
        try {
          resolve(options.onImageErrorHandler(...attributes));
        } catch (error) {
          reject(error);
        }
      } : reject;
      let image = clonedNode;
      image.decode && (image.decode = resolve), image.loading === "lazy" && (image.loading = "eager"), isImageElement ? (clonedNode.srcset = "", clonedNode.src = dataURL) : clonedNode.href.baseVal = dataURL;
    });
  }
  async function embedChildren(clonedNode, options) {
    let deferreds = toArray(clonedNode.childNodes).map((child) => embedImages(child, options));
    await Promise.all(deferreds).then(() => clonedNode);
  }
  async function embedImages(clonedNode, options) {
    isInstanceOfElement(clonedNode, Element) && (await embedBackground(clonedNode, options), await embedImageNode(clonedNode, options), await embedChildren(clonedNode, options));
  }

  // node_modules/html-to-image/es/apply-style.js
  function applyStyle(node, options) {
    let { style: style2 } = node;
    options.backgroundColor && (style2.backgroundColor = options.backgroundColor), options.width && (style2.width = `${options.width}px`), options.height && (style2.height = `${options.height}px`);
    let manual = options.style;
    return manual != null && Object.keys(manual).forEach((key) => {
      style2[key] = manual[key];
    }), node;
  }

  // node_modules/html-to-image/es/embed-webfonts.js
  var cssFetchCache = {};
  async function fetchCSS(url) {
    let cache2 = cssFetchCache[url];
    if (cache2 != null)
      return cache2;
    let cssText = await (await fetch(url)).text();
    return cache2 = { url, cssText }, cssFetchCache[url] = cache2, cache2;
  }
  async function embedFonts(data, options) {
    let cssText = data.cssText, regexUrl = /url\(["']?([^"')]+)["']?\)/g, loadFonts = (cssText.match(/url\([^)]+\)/g) || []).map(async (loc) => {
      let url = loc.replace(regexUrl, "$1");
      return url.startsWith("https://") || (url = new URL(url, data.url).href), fetchAsDataURL(url, options.fetchRequestInit, ({ result }) => (cssText = cssText.replace(loc, `url(${result})`), [loc, result]));
    });
    return Promise.all(loadFonts).then(() => cssText);
  }
  function parseCSS(source) {
    if (source == null)
      return [];
    let result = [], commentsRegex = /(\/\*[\s\S]*?\*\/)/gi, cssText = source.replace(commentsRegex, ""), keyframesRegex = new RegExp("((@.*?keyframes [\\s\\S]*?){([\\s\\S]*?}\\s*?)})", "gi");
    for (; ; ) {
      let matches = keyframesRegex.exec(cssText);
      if (matches === null)
        break;
      result.push(matches[0]);
    }
    cssText = cssText.replace(keyframesRegex, "");
    let importRegex = /@import[\s\S]*?url\([^)]*\)[\s\S]*?;/gi, combinedCSSRegex = "((\\s*?(?:\\/\\*[\\s\\S]*?\\*\\/)?\\s*?@media[\\s\\S]*?){([\\s\\S]*?)}\\s*?})|(([\\s\\S]*?){([\\s\\S]*?)})", unifiedRegex = new RegExp(combinedCSSRegex, "gi");
    for (; ; ) {
      let matches = importRegex.exec(cssText);
      if (matches === null) {
        if (matches = unifiedRegex.exec(cssText), matches === null)
          break;
        importRegex.lastIndex = unifiedRegex.lastIndex;
      } else
        unifiedRegex.lastIndex = importRegex.lastIndex;
      result.push(matches[0]);
    }
    return result;
  }
  async function getCSSRules(styleSheets, options) {
    let ret = [], deferreds = [];
    return styleSheets.forEach((sheet) => {
      if ("cssRules" in sheet)
        try {
          toArray(sheet.cssRules || []).forEach((item, index) => {
            if (item.type === CSSRule.IMPORT_RULE) {
              let importIndex = index + 1, url = item.href, deferred = fetchCSS(url).then((metadata) => embedFonts(metadata, options)).then((cssText) => parseCSS(cssText).forEach((rule) => {
                try {
                  sheet.insertRule(rule, rule.startsWith("@import") ? importIndex += 1 : sheet.cssRules.length);
                } catch (error) {
                  console.error("Error inserting rule from remote css", {
                    rule,
                    error
                  });
                }
              })).catch((e) => {
                console.error("Error loading remote css", e.toString());
              });
              deferreds.push(deferred);
            }
          });
        } catch (e) {
          let inline = styleSheets.find((a) => a.href == null) || document.styleSheets[0];
          sheet.href != null && deferreds.push(fetchCSS(sheet.href).then((metadata) => embedFonts(metadata, options)).then((cssText) => parseCSS(cssText).forEach((rule) => {
            inline.insertRule(rule, inline.cssRules.length);
          })).catch((err) => {
            console.error("Error loading remote stylesheet", err);
          })), console.error("Error inlining remote css file", e);
        }
    }), Promise.all(deferreds).then(() => (styleSheets.forEach((sheet) => {
      if ("cssRules" in sheet)
        try {
          toArray(sheet.cssRules || []).forEach((item) => {
            ret.push(item);
          });
        } catch (e) {
          console.error(`Error while reading CSS rules from ${sheet.href}`, e);
        }
    }), ret));
  }
  function getWebFontRules(cssRules) {
    return cssRules.filter((rule) => rule.type === CSSRule.FONT_FACE_RULE).filter((rule) => shouldEmbed(rule.style.getPropertyValue("src")));
  }
  async function parseWebFontRules(node, options) {
    if (node.ownerDocument == null)
      throw new Error("Provided element is not within a Document");
    let styleSheets = toArray(node.ownerDocument.styleSheets), cssRules = await getCSSRules(styleSheets, options);
    return getWebFontRules(cssRules);
  }
  function normalizeFontFamily(font) {
    return font.trim().replace(/["']/g, "");
  }
  function getUsedFonts(node) {
    let fonts = /* @__PURE__ */ new Set();
    function traverse(node2) {
      (node2.style.fontFamily || getComputedStyle(node2).fontFamily).split(",").forEach((font) => {
        fonts.add(normalizeFontFamily(font));
      }), Array.from(node2.children).forEach((child) => {
        child instanceof HTMLElement && traverse(child);
      });
    }
    return traverse(node), fonts;
  }
  async function getWebFontCSS(node, options) {
    let rules = await parseWebFontRules(node, options), usedFonts = getUsedFonts(node);
    return (await Promise.all(rules.filter((rule) => usedFonts.has(normalizeFontFamily(rule.style.fontFamily))).map((rule) => {
      let baseUrl = rule.parentStyleSheet ? rule.parentStyleSheet.href : null;
      return embedResources(rule.cssText, baseUrl, options);
    }))).join(`
`);
  }
  async function embedWebFonts(clonedNode, options) {
    let cssText = options.fontEmbedCSS != null ? options.fontEmbedCSS : options.skipFonts ? null : await getWebFontCSS(clonedNode, options);
    if (cssText) {
      let styleNode = document.createElement("style"), sytleContent = document.createTextNode(cssText);
      styleNode.appendChild(sytleContent), clonedNode.firstChild ? clonedNode.insertBefore(styleNode, clonedNode.firstChild) : clonedNode.appendChild(styleNode);
    }
  }

  // node_modules/html-to-image/es/index.js
  async function toSvg(node, options = {}) {
    let { width, height } = getImageSize(node, options), clonedNode = await cloneNode(node, options, !0);
    return await embedWebFonts(clonedNode, options), await embedImages(clonedNode, options), applyStyle(clonedNode, options), await nodeToDataURL(clonedNode, width, height);
  }
  async function toCanvas(node, options = {}) {
    let { width, height } = getImageSize(node, options), svg = await toSvg(node, options), img = await createImage(svg), canvas = document.createElement("canvas"), context = canvas.getContext("2d"), ratio = options.pixelRatio || getPixelRatio(), canvasWidth = options.canvasWidth || width, canvasHeight = options.canvasHeight || height;
    return canvas.width = canvasWidth * ratio, canvas.height = canvasHeight * ratio, options.skipAutoScale || checkCanvasDimensions(canvas), canvas.style.width = `${canvasWidth}`, canvas.style.height = `${canvasHeight}`, options.backgroundColor && (context.fillStyle = options.backgroundColor, context.fillRect(0, 0, canvas.width, canvas.height)), context.drawImage(img, 0, 0, canvas.width, canvas.height), canvas;
  }

  // src/core/screenshot.js
  var DEFAULT_SCREENSHOT_SHORTCUT = { code: "KeyS", ctrl: !0, shift: !0, alt: !1, meta: !1 };
  function shortcutFromEvent(event) {
    return !event.code || ["Control", "Shift", "Alt", "Meta"].some((key) => event.code.startsWith(key)) ? null : { code: event.code, ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey, meta: event.metaKey };
  }
  function shortcutLabel(shortcut) {
    return shortcut?.code ? [shortcut.ctrl && "Ctrl", shortcut.shift && "Shift", shortcut.alt && "Alt", shortcut.meta && "Meta", shortcut.code.replace(/^(Key|Digit)/, "")].filter(Boolean).join(" + ") : "\u672A\u7ED1\u5B9A";
  }
  function matchesShortcut(event, shortcut) {
    return !!shortcut?.code && event.code === shortcut.code && ["ctrl", "shift", "alt", "meta"].every((key) => !!event[key + "Key"] == !!shortcut[key]);
  }
  function isTyping(event) {
    return event.composedPath().some((node) => node?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node?.tagName));
  }
  function gameCanvas(win) {
    let rendered = win.Laya?.Render?.canvas, source = rendered?.source ?? rendered, canvas = source?.getBoundingClientRect ? source : win.document.getElementById("layaCanvas");
    if (!canvas || !canvas.width || !canvas.height) throw new Error("\u5C1A\u672A\u627E\u5230\u6E38\u620F\u6709\u6548\u753B\u9762");
    let rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) throw new Error("\u6E38\u620F\u753B\u9762\u5C1A\u672A\u663E\u793A");
    return { canvas, rect };
  }
  function hideNativeOverlays(stage) {
    let saved = [], queue = stage ? [stage] : [], seen = /* @__PURE__ */ new Set();
    for (let i = 0; i < queue.length; i++) {
      let node = queue[i];
      !node || node.destroyed || seen.has(node) || (seen.add(node), ["sgs-toolbox-hand-sort", "sgs-toolbox-countdown"].includes(node.name) ? (saved.push([node, node.visible]), node.visible = !1) : Array.isArray(node._children) && queue.push(...node._children));
    }
    return () => {
      for (let [node, visible] of saved) node.destroyed || (node.visible = visible);
    };
  }
  function captureNative(win, canvas, hide) {
    let doc = win.document, stage = win.Laya?.stage, restore = hide ? hideNativeOverlays(stage) : () => {
    }, rendered;
    try {
      let output = doc.createElement("canvas"), width = Math.round(stage?.width || canvas.width), height = Math.round(stage?.height || canvas.height);
      if (!(width > 0 && height > 0 && width * height <= 33554432)) throw new Error("\u6E38\u620F\u753B\u9762\u5C3A\u5BF8\u65E0\u6548\u6216\u8FC7\u5927");
      output.width = width, output.height = height;
      let context = output.getContext("2d");
      if (typeof stage?.drawToCanvas != "function") {
        if (!canvas.getContext("2d")) throw new Error("\u5F53\u524D\u6E38\u620F\u5F15\u64CE\u4E0D\u652F\u6301\u622A\u56FE\uFF0C\u8BF7\u5237\u65B0\u6E38\u620F\u540E\u91CD\u8BD5");
        return context.drawImage(canvas, 0, 0, width, height), output;
      }
      rendered = stage.drawToCanvas(width, height, 0, 0);
      let target = rendered?._ctx?._targets;
      if (target?.getData) {
        let pixels = target.getData(0, 0, width, height);
        if (!pixels || pixels.length < width * height * 4) throw new Error("\u6E38\u620F\u753B\u9762\u8BFB\u53D6\u5931\u8D25");
        let data = context.createImageData(width, height), stride = width * 4;
        for (let y = 0; y < height; y++) data.data.set(pixels.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride);
        context.putImageData(data, 0, 0);
      } else {
        let source = rendered?.source ?? rendered?._source;
        if (!source) throw new Error("\u6E38\u620F\u753B\u9762\u8BFB\u53D6\u5931\u8D25");
        context.drawImage(source, 0, 0, width, height);
      }
      return stage.bgColor && (context.globalCompositeOperation = "destination-over", context.fillStyle = stage.bgColor, context.fillRect(0, 0, width, height), context.globalCompositeOperation = "source-over"), output;
    } finally {
      try {
        rendered?.destroy?.();
      } finally {
        restore();
      }
    }
  }
  async function captureGameImage(win, game, { hideUI = !0 } = {}) {
    let { canvas, rect } = gameCanvas(win), inGame = game.isInGame(), output = captureNative(win, canvas, hideUI && inGame), ctx = output.getContext("2d"), layerOrder = (host) => Math.max(
      Number(win.getComputedStyle(host).zIndex) || 0,
      ...[...host.shadowRoot?.children || []].filter((child) => !child.classList.contains("toast")).map((child) => Number(win.getComputedStyle(child).zIndex) || 0)
    ), hosts = [...win.document.querySelectorAll("[data-sgs-toolbox]")].filter((host) => !(hideUI && (host.dataset.sgsToolbox === "core" || inGame))).sort((a, b) => layerOrder(a) - layerOrder(b));
    for (let host of hosts) {
      let css = win.getComputedStyle(host);
      if (css.display === "none" || css.visibility === "hidden") continue;
      let box = host.getBoundingClientRect(), fullViewport = !box.width || !box.height, width = fullViewport ? win.innerWidth : box.width, height = fullViewport ? win.innerHeight : box.height, x = fullViewport ? 0 : box.left, y = fullViewport ? 0 : box.top;
      if (x >= rect.right || y >= rect.bottom || x + width <= rect.left || y + height <= rect.top) continue;
      let layer = await toCanvas(host, {
        width,
        height,
        pixelRatio: 1,
        skipFonts: !0,
        filter: (node) => !["STYLE", "SCRIPT"].includes(node.tagName) && !node.classList?.contains("toast"),
        style: { position: "relative", left: "0", top: "0", right: "auto", bottom: "auto", margin: "0", transform: "none" }
      });
      ctx.drawImage(
        layer,
        (x - rect.left) * output.width / rect.width,
        (y - rect.top) * output.height / rect.height,
        width * output.width / rect.width,
        height * output.height / rect.height
      );
    }
    return new Promise((resolve, reject) => output.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG \u622A\u56FE\u751F\u6210\u5931\u8D25")), "image/png"));
  }
  function createScreenshotController({ window: win, game, settings, scope, notify }) {
    let busy = !1;
    async function capture() {
      if (!(busy || scope.closed)) {
        busy = !0;
        try {
          if (!win.ClipboardItem || !win.navigator.clipboard?.write) throw new Error("\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u56FE\u7247\u526A\u8D34\u677F\uFF0C\u8BF7\u4F7F\u7528 HTTPS \u9875\u9762\u548C\u65B0\u7248 Chrome / Edge");
          let image = captureGameImage(win, game, { hideUI: settings.get("screenshotHideUI", !0) });
          image.catch(() => {
          }), await win.navigator.clipboard.write([new win.ClipboardItem({ "image/png": image })]), scope.closed || notify("\u6E38\u620F\u622A\u56FE\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F");
        } catch (error) {
          scope.closed || notify(error?.name === "NotAllowedError" ? "\u65E0\u6CD5\u590D\u5236\u622A\u56FE\uFF1A\u8BF7\u5141\u8BB8\u6B64\u9875\u9762\u8BBF\u95EE\u526A\u8D34\u677F\uFF0C\u518D\u70B9\u51FB\u622A\u56FE\u91CD\u8BD5" : `\u622A\u56FE\u5931\u8D25\uFF1A${error?.message || error}`);
        } finally {
          busy = !1;
        }
      }
    }
    return scope.listen(win.document, "keydown", (event) => {
      event.defaultPrevented || event.repeat || event.isComposing || isTyping(event) || matchesShortcut(event, settings.get("screenshotShortcut", DEFAULT_SCREENSHOT_SHORTCUT)) && (event.preventDefault(), event.stopPropagation(), capture());
    }), { capture };
  }

  // src/market/updates.js
  var numeric = (a, b) => (a = a.replace(/^0+(?=\d)/, ""), b = b.replace(/^0+(?=\d)/, ""), Math.sign(a.length - b.length) || (a === b ? 0 : a > b ? 1 : -1));
  function parse(version) {
    let match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
    return match && { core: match.slice(1, 4), pre: match[4]?.split(".") || [] };
  }
  function compareVersions2(a, b) {
    let left = parse(a), right = parse(b);
    if (!left || !right) throw new Error("\u63D2\u4EF6\u7248\u672C\u683C\u5F0F\u65E0\u6548\u3002");
    for (let i = 0; i < 3; i++) {
      let order = numeric(left.core[i], right.core[i]);
      if (order) return order;
    }
    if (!left.pre.length || !right.pre.length) return Math.sign(right.pre.length) - Math.sign(left.pre.length);
    for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
      let x = left.pre[i], y = right.pre[i];
      if (x === void 0 || y === void 0) return x === void 0 ? -1 : 1;
      if (x === y) continue;
      let xn = /^\d+$/.test(x), yn = /^\d+$/.test(y), order = xn && yn ? numeric(x, y) : xn !== yn ? xn ? -1 : 1 : x > y ? 1 : -1;
      if (order) return order;
    }
    return 0;
  }
  function findPluginUpdates(installed, entries) {
    let latest = /* @__PURE__ */ new Map();
    for (let entry of entries) {
      if (!/^\d+\.\d+\.\d+$/.test(entry.version)) continue;
      let previous = latest.get(entry.id);
      (!previous || compareVersions2(entry.version, previous.version) > 0) && latest.set(entry.id, entry);
    }
    return installed.map((plugin) => {
      let entry = latest.get(plugin.id), order = entry ? compareVersions2(entry.version, plugin.version) : null;
      return { id: plugin.id, entry, status: order === null ? "unavailable" : order > 0 ? "update" : order < 0 ? "newer" : "current" };
    });
  }

  // src/market/dependencies.js
  function planDependencies(target, installed, catalog) {
    let existing = new Map(installed.map((item) => [item.id, item])), latest = /* @__PURE__ */ new Map();
    for (let item of catalog)
      /^\d+\.\d+\.\d+$/.test(item.version) && (!latest.has(item.id) || compareVersions2(item.version, latest.get(item.id).version) > 0) && latest.set(item.id, item);
    let done = /* @__PURE__ */ new Set(), visiting = /* @__PURE__ */ new Set(), result = [];
    function visit(item) {
      if (visiting.has(item.id)) throw new Error("\u524D\u7F6E\u63D2\u4EF6\u5FAA\u73AF\u4F9D\u8D56\uFF1A" + item.id);
      if (!done.has(item.id)) {
        visiting.add(item.id);
        for (let id of item.dependencies || []) {
          let current = existing.get(id);
          if (current) {
            if (!current.enabled || !current.active || current.error) throw new Error("\u524D\u7F6E\u63D2\u4EF6\u300C" + current.name + "\u300D\u5DF2\u5B89\u88C5\u4F46\u672A\u6B63\u5E38\u8FD0\u884C\uFF0C\u8BF7\u5148\u5728\u5DF2\u5B89\u88C5\u63D2\u4EF6\u4E2D\u542F\u7528\u6216\u4FEE\u590D\u3002");
            continue;
          }
          let dependency = latest.get(id);
          if (!dependency) throw new Error("\u5E02\u573A\u6682\u65E0\u524D\u7F6E\u63D2\u4EF6\u300C" + id + "\u300D\u7684\u6B63\u5F0F\u7248\uFF0C\u8BF7\u5237\u65B0\u76EE\u5F55\u6216\u624B\u52A8\u5BFC\u5165\u3002");
          visit(dependency);
        }
        visiting.delete(item.id), done.add(item.id), item !== target && result.push(item);
      }
    }
    return visit(target), result;
  }

  // src/core/game-view.js
  var SHANHE_MAP_SCENES = /* @__PURE__ */ new Set(["RogueLikeBigMapScene", "RogueSmallMapScene"]);
  function gameViewForScene(scene) {
    return SHANHE_MAP_SCENES.has(scene?.SceneName || scene?.sceneName || scene?.name) ? "shanhe" : "battle";
  }
  function selectGamePanels(panels, view) {
    let selected = view === "shanhe" && panels.some((panel) => panel.gameView === "shanhe") ? "shanhe" : "battle";
    return panels.filter((panel) => !panel.gameView || panel.gameView === selected);
  }

  // src/ui/shell.js
  var categories = [["game", "\u724C\u5C40"], ["automation", "\u81EA\u52A8"], ["tools", "\u5DE5\u5177"], ["manage", "\u7BA1\u7406"], ["info", "\u4FE1\u606F"]], style = `
/* A moving perimeter marker keeps the folded HUD easy to locate without covering controls. */
.hud-locator{display:none;position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2;overflow:visible;color:var(--sgs-accent)}
.hud-locator rect{fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;x:1px;y:1px;width:calc(100% - 2px);height:calc(100% - 2px);rx:10px;stroke-dasharray:18 8 3 71;animation:hud-locator-flow 3.6s linear infinite,hud-locator-breathe 2.4s ease-in-out infinite}
:host([data-collapsed]:not([data-edge-hidden])) .hud-locator{display:block}
:host([data-edge-hidden])::after{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;pointer-events:none;background:linear-gradient(180deg,transparent,var(--sgs-accent),var(--sgs-text),var(--sgs-accent),transparent);background-size:100% 220%;animation:hud-edge-flow 3.6s linear infinite}
@keyframes hud-locator-flow{to{stroke-dashoffset:-100}}
@keyframes hud-locator-breathe{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes hud-edge-flow{from{background-position:0 220%}to{background-position:0 -220%}}
@media(prefers-reduced-motion:reduce){.hud-locator rect{animation:none;stroke-dasharray:none;opacity:.8}:host([data-edge-hidden])::after{animation:none;background:var(--sgs-accent)}}

.plugin-release-notes{margin:8px 0 0;min-width:0;color:var(--sgs-muted);font-size:11px}.plugin-release-notes summary{cursor:pointer;min-height:30px;padding:6px 2px;color:var(--sgs-text);overflow-wrap:anywhere}.plugin-release-notes summary:focus-visible,.plugin-release-notes-text:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px;border-radius:4px}.plugin-release-notes-text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;padding:2px 6px 4px 8px;border-left:2px solid var(--sgs-border);max-height:160px;overflow:auto;scrollbar-width:thin}.plugin-update .plugin-release-notes summary{color:var(--sgs-accent)}
.appearance-page .plugin-heading{margin:0}
.management-tabs{position:sticky;top:-12px;z-index:8;background:var(--sgs-bg)!important;box-shadow:0 5px 8px var(--sgs-bg)!important}
.card-style-workshop summary{cursor:pointer;color:var(--sgs-accent);padding:8px 0;font-size:12px;min-height:34px}.card-style-workshop summary:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}.card-style-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.card-style-choices button{min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;font-size:11px}.card-style-choices button[aria-pressed=true]{border-color:var(--sgs-accent);box-shadow:inset 3px 0 var(--sgs-accent);background:color-mix(in srgb,var(--sgs-accent) 12%,var(--sgs-surface))}.card-style-preview{display:flex;gap:4px;width:100%;justify-content:center}.card-style-preview canvas,.card-style-preview img{width:43%;max-width:64px;height:auto;aspect-ratio:93/130;border-radius:3px}.card-style-workshop p{margin:8px 0}

.core-upgrade-actions{display:flex;align-items:center;justify-content:space-between;gap:4px;flex-wrap:wrap}.core-upgrade-actions a{font-size:10px}.core-upgrade-refresh{display:inline-flex;align-items:center;gap:5px;flex:none;padding:5px;font-size:10px;color:var(--sgs-accent);border-color:color-mix(in srgb,var(--sgs-accent) 40%,var(--sgs-border));background:color-mix(in srgb,var(--sgs-accent) 8%,var(--sgs-surface))}.core-upgrade-reminder{margin-top:6px;padding-left:8px;border-left:2px solid var(--sgs-accent);font-size:11px;color:var(--sgs-muted);overflow-wrap:anywhere}

.plugin-body .skin-entry{margin:0;padding:0;border:0;background:none}.plugin-body .skin-entry>h3{display:none}.plugin-body .reward-heading h3 .sgs-line-icon{display:none}.plugin-body .reward-heading h3,.plugin-body .sgs-effects h3{font-size:11px;font-weight:400;color:var(--sgs-muted)}
:host{all:initial;position:fixed;top:72px;right:24px;width:280px;min-width:248px;max-width:420px;z-index:2147483000;color:var(--sgs-text);font:13px/1.55 var(--sgs-font);color-scheme:var(--sgs-scheme,dark)}
*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}button:disabled{cursor:wait;opacity:.5}button,input,select{color:var(--sgs-text);background:var(--sgs-surface);border:1px solid var(--sgs-border);border-radius:7px;padding:6px 9px}button:hover{background:var(--sgs-raised);border-color:var(--sgs-accent)}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}a{color:var(--sgs-accent)}
.shell{background:var(--sgs-bg);border:1px solid var(--sgs-border);border-radius:var(--sgs-radius);box-shadow:0 16px 48px #0006;overflow:hidden;resize:horizontal;min-width:248px;max-width:420px;width:100%}
.content.has-plugin-panels{min-height:0}.plugin-group{min-width:0}.plugin-group+.plugin-group{border-top:1px solid var(--sgs-border);margin-top:10px;padding-top:10px}.plugin-heading{margin:0;font-size:13px}.plugin-heading .plugin-toggle{display:flex;align-items:center;gap:9px;width:100%;min-height:36px;padding:6px 3px;border:0;border-radius:6px;background:transparent;box-shadow:none;text-align:left;color:var(--sgs-accent)}.plugin-heading .plugin-toggle:hover{background:color-mix(in srgb,var(--sgs-accent) 7%,transparent)}.plugin-toggle svg{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.plugin-toggle .plugin-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;letter-spacing:.5px}.plugin-toggle .plugin-chevron{width:15px;height:15px;color:var(--sgs-muted);transition:transform .16s}.plugin-toggle[aria-expanded=false] .plugin-chevron{transform:rotate(-90deg)}.plugin-body{padding:9px 2px 2px}.plugin-body[hidden]{display:none!important}:host([data-edge-docked]){left:auto!important;right:0!important;transition:transform 180ms ease;transform:translateX(0)}:host([data-edge-docked][data-edge-hidden]){transform:translateX(calc(100% - 5px));background:var(--sgs-bg);border-left:1px solid var(--sgs-accent);border-radius:5px 0 0 5px}:host([data-edge-hidden]) .shell{visibility:hidden}:host([data-edge-fixed]){transition:none;top:0!important;bottom:0!important;height:100vh;height:100dvh}:host([data-edge-fixed]) .shell{display:flex;flex-direction:column;height:100%;border-radius:0}:host([data-edge-fixed]) .shell>.brand,:host([data-edge-fixed]) .shell>.status,:host([data-edge-fixed]) .shell>.nav,:host([data-edge-fixed]) .shell>.footer,:host([data-edge-fixed]) .shell>.compact{flex-shrink:0}:host([data-edge-fixed]) .content{flex:1;min-height:0;max-height:none}.edge-resizer{display:none;position:absolute;left:0;bottom:0;width:22px;height:22px;z-index:12;color:var(--sgs-muted);cursor:ew-resize;touch-action:none;user-select:none;align-items:center;justify-content:center}.edge-resizer svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round}.edge-resizer:hover{color:var(--sgs-accent)}.edge-resizer:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:-3px}:host([data-edge-docked]) .shell{resize:none}:host([data-edge-docked]:not([data-collapsed]):not([data-edge-hidden])) .edge-resizer{display:flex}:host([data-edge-docked]) .footer{padding-left:25px}:host([data-edge-docked]:focus-visible){outline:2px solid var(--sgs-accent);outline-offset:-2px}
@media(prefers-reduced-motion:reduce){.plugin-toggle .plugin-chevron{transition:none}}
.brand{user-select:none;-webkit-user-select:none;display:flex;align-items:center;gap:8px;padding:12px 12px 8px;cursor:move;touch-action:none}.mark svg{width:21px;height:21px}.mark{display:grid;place-items:center;width:27px;height:27px;border:1px solid var(--sgs-accent);color:var(--sgs-accent);border-radius:7px;font-weight:bold}.brand strong{letter-spacing:1px;font-size:13px}.brand small{display:block;font-size:9px;letter-spacing:2px;color:var(--sgs-muted)}.brand button svg{width:16px;height:24px}.footer [data-open-market]{display:flex;align-items:center;gap:4px}.footer [data-open-market] svg{width:12px;height:12px}.brand button{display:grid;place-items:center;margin-left:auto;font-size:16px;padding:0 7px;line-height:24px}.status{color:var(--sgs-muted);font-size:11px;padding:0 12px 9px;display:flex;align-items:center;gap:6px}.status[hidden]{display:none}.dot{width:5px;height:5px;background:var(--sgs-accent);border-radius:100%}
.nav{display:flex;gap:4px;padding:7px 9px;border-block:1px solid var(--sgs-border);background:var(--sgs-surface)}.nav button{flex:1 1 0;min-width:0;display:flex;align-items:center;justify-content:center;gap:0;height:42px;padding:0;border-color:transparent;background:transparent;overflow:hidden;transition:flex-grow var(--sgs-motion) cubic-bezier(.2,.8,.2,1),background var(--sgs-motion),gap var(--sgs-motion)}.nav button svg{width:22px;height:22px;flex:none;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;transition:transform var(--sgs-motion)}.nav button span{max-width:0;opacity:0;white-space:nowrap;overflow:hidden;transition:max-width var(--sgs-motion),opacity var(--sgs-motion)}.nav button[aria-selected=true]{color:var(--sgs-accent);background:var(--sgs-raised)}.nav:has(button:hover) button:not(:hover):not(:focus-visible) svg,.nav:has(button:focus-visible) button:not(:hover):not(:focus-visible) svg{transform:scale(.92)}.nav button:hover,.nav button:focus-visible{flex-grow:2.2;gap:5px;color:var(--sgs-accent);background:var(--sgs-raised)}.nav button:hover svg,.nav button:focus-visible svg{transform:scale(1.15)}.nav button:hover span,.nav button:focus-visible span{max-width:32px;opacity:1}
.content{padding:12px;max-height:65vh;min-height:200px;overflow:auto;scrollbar-width:thin}.footer{display:flex;justify-content:space-between;border-top:1px solid var(--sgs-border);padding:7px 12px;color:var(--sgs-muted);font-size:10px}.footer button{padding:0;border:0;background:none;font-size:10px;color:var(--sgs-muted)}.empty{text-align:center;padding:35px 12px;color:var(--sgs-muted)}.empty svg{width:32px;height:32px;fill:none;stroke:var(--sgs-accent);stroke-width:1.2;margin-bottom:12px}.empty strong{display:block;color:var(--sgs-text);font-size:14px;margin-bottom:7px}.tabs{display:flex;gap:4px;margin-bottom:13px}.tabs button{flex:1;padding:5px 2px;font-size:12px}.tabs button.active{border-color:var(--sgs-accent);color:var(--sgs-accent)}h3{font-size:13px;margin:15px 0 7px}h3:first-child{margin-top:0}.card{padding:10px;border:1px solid var(--sgs-border);border-radius:8px;margin-bottom:8px;background:var(--sgs-surface)}.card .title{display:flex;justify-content:space-between;gap:5px}.muted{color:var(--sgs-muted);font-size:11px}.actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.actions button{font-size:11px;padding:4px 7px}.notice{color:var(--sgs-muted);font-size:11px;overflow-wrap:anywhere;padding:7px 0}.error{color:var(--sgs-danger)}label.row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:10px 0}input[type=checkbox]{accent-color:var(--sgs-accent)}input.address{width:100%;font-size:11px}select{max-width:145px}.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);max-width:80vw;background:var(--sgs-raised);color:var(--sgs-text);padding:10px 16px;border:1px solid var(--sgs-border);border-radius:8px;box-shadow:0 4px 20px #0008;z-index:2147483647}
:host([data-collapsed]) .nav,:host([data-collapsed]) .content,:host([data-collapsed]) .status,:host([data-collapsed]) .footer{display:none}:host([data-collapsed]) .brand{display:none}
.compact{display:none;align-items:center;height:38px;padding:0 7px 0 10px;cursor:grab;touch-action:none;white-space:nowrap;user-select:none;-webkit-user-select:none}.compact:active{cursor:grabbing}.compact .slash{display:flex;align-items:center;gap:9px;flex:1;min-width:0;height:100%;color:var(--sgs-accent)}.slash-seal{display:grid;place-items:center;flex:none;width:25px;height:27px;font:20px/1 "KaiTi","STKaiti","FangSong",serif;color:var(--sgs-accent);text-shadow:0 1px 1px #0009;background:radial-gradient(ellipse,color-mix(in srgb,var(--sgs-accent) 9%,transparent),transparent 72%)}.slash-reading{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;min-width:32px;height:34px}.slash-label{font:9px/10px var(--sgs-font);letter-spacing:1px;color:var(--sgs-muted)}.compact [data-slash]{font:600 21px/23px "Cambria","Georgia",serif;font-variant-numeric:tabular-nums;color:color-mix(in srgb,var(--sgs-accent) 42%,var(--sgs-text));text-shadow:0 1px 2px #0008;letter-spacing:.3px}.compact[data-count-state="empty"] [data-slash]{color:var(--sgs-muted)}.compact[data-count-state="unknown"] [data-slash]{color:var(--sgs-muted);font-size:19px}.compact[data-count-state="unlimited"] [data-slash]{font-size:24px}.compact[data-count-size="long"] [data-slash]{font-size:15px;letter-spacing:0}.compact-actions{display:flex;align-items:center;gap:1px;padding-left:6px;margin-left:6px;position:relative}.compact-actions::before{content:'';position:absolute;left:0;top:6px;bottom:6px;width:1px;background:linear-gradient(transparent,color-mix(in srgb,var(--sgs-accent) 30%,transparent),transparent)}.compact button{display:grid;place-items:center;flex:none;width:28px;height:30px;padding:5px;border:0;border-radius:7px;background:transparent;color:var(--sgs-muted);box-shadow:none;transition:background 140ms,color 140ms,transform 140ms}.compact button:hover{color:var(--sgs-text);background:linear-gradient(180deg,color-mix(in srgb,var(--sgs-accent) 13%,transparent),color-mix(in srgb,var(--sgs-accent) 4%,transparent))}.compact button:active{transform:translateY(1px);background:color-mix(in srgb,var(--sgs-accent) 15%,transparent)}.compact button:focus-visible{outline:1px solid var(--sgs-accent);outline-offset:-2px;background:color-mix(in srgb,var(--sgs-accent) 9%,transparent)}.compact svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.compact [data-expand] svg{width:16px;height:16px}
:host([data-collapsed]){width:156px!important;min-width:156px;max-width:156px}:host([data-collapsed]) .shell{position:relative;width:100%!important;max-width:100%;min-width:0;resize:none;border:1px solid color-mix(in srgb,var(--sgs-border) 65%,transparent);border-radius:11px;background:linear-gradient(165deg,var(--sgs-raised) 0%,var(--sgs-bg) 40%,color-mix(in srgb,var(--sgs-bg) 82%,#000) 100%);box-shadow:0 3px 8px #0004,0 12px 28px #0002,inset 0 1px color-mix(in srgb,var(--sgs-text) 9%,transparent),inset 0 -1px #0005}:host([data-collapsed]) .shell::before{content:'';position:absolute;pointer-events:none;top:0;left:15px;right:15px;height:1px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--sgs-accent) 40%,transparent),transparent)}:host([data-collapsed]) .compact{display:flex}

.compact-summary{display:none}:host([data-collapsed]) .compact-summary:not(:empty){display:grid;gap:3px;padding:6px 9px 8px;border-top:1px solid var(--sgs-border);max-height:35vh;overflow:auto}.compact-summary-row{display:flex;align-items:baseline;gap:6px;min-width:0;font-size:11px}.compact-summary-row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.compact-summary-row b{flex:none;color:var(--sgs-accent);font-variant-numeric:tabular-nums;font-weight:500}
.ui-icon{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.plugin-card{padding:11px 10px 9px;border-color:color-mix(in srgb,var(--sgs-border) 65%,transparent);position:relative}.plugin-heading{display:flex;align-items:center;gap:8px;min-width:0}.plugin-symbol{display:grid;place-items:center;flex:none;width:29px;height:29px;border-radius:8px;background:var(--sgs-raised);color:var(--sgs-accent)}.plugin-symbol svg{width:18px;height:18px;stroke-width:1.5}.plugin-name{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}.plugin-version{flex:none;font-size:10px;color:var(--sgs-muted);font-variant-numeric:tabular-nums}.plugin-description{margin:7px 0 9px;color:var(--sgs-muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.plugin-prerequisites{margin:-3px 0 9px;color:var(--sgs-muted);font-size:11px;line-height:1.5;overflow-wrap:anywhere}.plugin-bottom{display:flex;align-items:center;gap:6px;min-width:0}.plugin-status{display:flex;align-items:center;gap:4px;color:var(--sgs-muted);font-size:10px;white-space:nowrap}.plugin-status::before{content:'';width:5px;height:5px;border-radius:50%;background:currentColor}.plugin-status.is-running{color:var(--sgs-success,#a9cfac)}.plugin-status.is-error{color:var(--sgs-danger)}.plugin-tools{display:flex;align-items:center;gap:3px;margin-left:auto}.plugin-tools button{display:grid;place-items:center;width:27px;height:27px;padding:4px;border-color:transparent;background:transparent;color:var(--sgs-muted);border-radius:6px}.plugin-tools button:hover,.plugin-tools button:focus-visible{border-color:var(--sgs-border);background:var(--sgs-raised);color:var(--sgs-text)}.plugin-tools button.is-destructive:hover{color:var(--sgs-danger);border-color:var(--sgs-danger)}.plugin-tools button.is-enable{color:var(--sgs-success,#a9cfac)}.plugin-current{display:flex;align-items:center;color:var(--sgs-success,#a9cfac);margin-left:2px}.plugin-current svg{width:13px;height:13px}.plugin-card.has-update{border-color:var(--sgs-accent);box-shadow:inset 3px 0 var(--sgs-accent)}.plugin-card.has-error{border-color:var(--sgs-danger);box-shadow:inset 3px 0 var(--sgs-danger)}.plugin-update{margin-top:9px;padding:8px;background:color-mix(in srgb,var(--sgs-accent) 12%,transparent);border-radius:6px;color:var(--sgs-accent)}.plugin-update-info{display:flex;align-items:center;gap:5px;font-size:10px;overflow-wrap:anywhere}.plugin-update button{display:flex;align-items:center;justify-content:center;gap:5px;width:100%;margin-top:6px;padding:4px 6px;border-color:var(--sgs-accent);background:var(--sgs-accent);color:var(--sgs-bg);font-size:11px;font-weight:600}.plugin-error{margin-top:8px;padding:7px 8px;border-radius:6px;background:color-mix(in srgb,var(--sgs-danger) 12%,transparent);color:var(--sgs-danger);font-size:11px}.plugin-error summary{cursor:pointer;display:flex;align-items:center;gap:5px}.plugin-error summary span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.plugin-error summary::after{content:'\u8BE6\u60C5';margin-left:auto;flex:none;font-size:10px}.plugin-error[open] summary::after{content:'\u6536\u8D77'}.plugin-error pre{font:11px/1.6 var(--sgs-font);white-space:pre-wrap;overflow-wrap:anywhere;margin:7px 0 0}.nav button{position:relative}.nav .nav-alert{position:absolute;top:2px;right:3px;min-width:13px;height:13px;padding:0 3px;border-radius:7px;background:var(--sgs-accent);color:var(--sgs-bg);font:700 9px/13px system-ui;font-style:normal}.nav .nav-alert.is-error{background:var(--sgs-danger)}.plugin-search{display:block;width:100%;min-width:0;margin-top:9px;padding:8px 10px;background:var(--sgs-surface)}.plugin-search::placeholder{color:var(--sgs-muted);font-size:11px}.plugin-card[hidden],.plugin-search-empty[hidden]{display:none!important}.update-summary.has-update{color:var(--sgs-accent);font-weight:600}
/* Light palettes use crisp ink and softer depth rather than dark-theme shadows. */
:host([data-theme-scheme=light]){--sgs-success:#32613e}
:host([data-theme-scheme=light]) .slash-seal,:host([data-theme-scheme=light]) .compact [data-slash]{text-shadow:none}
:host([data-theme-scheme=light][data-collapsed]) .shell{background:linear-gradient(165deg,var(--sgs-surface),var(--sgs-bg) 65%);box-shadow:0 3px 8px #0002,0 8px 20px #0001,inset 0 1px #fff8}
${CONTROL_STYLES}
button{background:linear-gradient(180deg,color-mix(in srgb,var(--sgs-raised) 60%,var(--sgs-surface)),var(--sgs-surface));border-color:color-mix(in srgb,var(--sgs-border) 60%,transparent);box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-text) 4%,transparent);transition:background 140ms,border-color 140ms,color 140ms}button:active:not(:disabled){background:var(--sgs-bg)}button:disabled{cursor:not-allowed}.nav button,.footer button{box-shadow:none}.tabs{gap:2px;padding:3px;border-radius:8px;background:var(--sgs-surface);box-shadow:inset 0 1px 3px #0004}.tabs button{border:0;background:transparent;box-shadow:none;color:var(--sgs-muted);padding:6px 2px}.tabs button.active{background:linear-gradient(color-mix(in srgb,var(--sgs-accent) 17%,transparent),color-mix(in srgb,var(--sgs-accent) 7%,transparent));box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-accent) 14%,transparent);color:var(--sgs-accent)}
.settings-group{padding:11px 0 13px;border-bottom:1px solid color-mix(in srgb,var(--sgs-border) 35%,transparent)}.settings-group:last-child{border:0;padding-bottom:0}.settings-group h3{display:flex;align-items:center;gap:7px;margin:0 0 8px;color:var(--sgs-accent);font-size:12px;letter-spacing:.06em}.settings-group h3::before{content:'';width:3px;height:11px;border-radius:2px;background:linear-gradient(var(--sgs-accent),color-mix(in srgb,var(--sgs-accent) 30%,transparent))}.settings-group label.row{margin:0;padding:9px 0;min-height:36px;font-size:12px}.settings-group label.row>span{flex:1;min-width:0}.settings-group .muted{font-size:10px;line-height:1.7;color:var(--sgs-muted)}.settings-group .row input.sgs-input{flex:0 1 142px;width:142px!important;min-width:90px}.settings-group .address{margin:5px 0 8px}.settings-group .actions{gap:6px}.settings-group .actions button{min-height:29px}.settings-group .actions .icon-action{display:grid;place-items:center;width:30px;padding:5px;color:var(--sgs-muted);background:transparent;border-color:transparent;box-shadow:none}.settings-group .actions .icon-action:hover{color:var(--sgs-accent);background:var(--sgs-raised)}.settings-group .row select{max-width:145px}.settings-group>select{width:100%;max-width:none}.settings-group .notice{font-size:10px;line-height:1.7}.settings-group button .sgs-line-icon{vertical-align:-3px;margin-right:5px}.settings-group button:has(.sgs-line-icon){font-size:11px}.settings-group [data-setting=screenshotHideUI]{flex:none}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}@media(max-height:500px){.content{max-height:50vh}}
`;
  function createShell({ window: win, document: doc, settings, scope }) {
    let microUpdate = null, microUpdateBusy = !1, microUpdateError = "";
    async function runMicroUpdate(action) {
      microUpdateBusy = !0, microUpdateError = "", render();
      try {
        if (typeof win.__SGS_TOOLBOX_SCRIPT_UPDATE__ != "function") throw new Error("\u5F53\u524D\u5FAE\u7AEF\u63A5\u5165\u5C42\u5C1A\u4E0D\u652F\u6301\u811A\u672C\u66F4\u65B0\uFF0C\u8BF7\u5148\u5347\u7EA7\u63A5\u5165\u5C42\u4E00\u6B21\u3002");
        microUpdate = await win.__SGS_TOOLBOX_SCRIPT_UPDATE__(action), action === "check" && microUpdate.current && compareVersions2(microUpdate.current, CORE_VERSION) > 0 && (microUpdate = { ...microUpdate, version: microUpdate.current, pending: !0 }), microUpdate.pending && notify("\u811A\u672C\u5DF2\u4FDD\u5B58\uFF0C\u4E0B\u6B21\u6253\u5F00\u6E38\u620F\u65F6\u751F\u6548\uFF1B\u5F53\u524D\u724C\u5C40\u4E0D\u53D7\u5F71\u54CD\u3002");
      } catch (error) {
        microUpdateError = error.message;
      } finally {
        microUpdateBusy = !1, render();
      }
    }
    let pendingCoreUpgrade = settings.get("pendingCoreUpgrade", "");
    pendingCoreUpgrade && compareVersions2(CORE_VERSION, pendingCoreUpgrade) >= 0 && (pendingCoreUpgrade = "", settings.set("pendingCoreUpgrade", ""));
    let gameView = "battle", renderedKey = "", viewScroll = /* @__PURE__ */ new Map(), host = doc.createElement("div");
    host.dataset.sgsToolbox = "core";
    let shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${style}</style><section class="shell"><svg class="hud-locator" aria-hidden="true" focusable="false"><rect pathLength="100"/></svg><div class="compact" data-count-state="unknown"><span class="slash" title="\u5269\u4F59\u51FA\u6740\u6B21\u6570\u6682\u4E0D\u53EF\u7528\uFF1B\u53CC\u51FB\u5C55\u5F00\uFF0C\u6309\u4F4F\u62D6\u52A8"><span class="slash-seal" aria-hidden="true">\u6740</span><span class="slash-reading"><span class="slash-label">\u5269\u4F59</span><b data-slash aria-label="\u5269\u4F59\u51FA\u6740\u6B21\u6570\u6682\u4E0D\u53EF\u7528">\u2014</b></span></span><div class="compact-actions"><button data-screenshot title="\u622A\u56FE\u5E76\u590D\u5236" aria-label="\u622A\u56FE\u5E76\u590D\u5236"></button><button data-expand title="\u653E\u5927\u9762\u677F" aria-label="\u653E\u5927\u9762\u677F"></button></div></div><div class="compact-summary" aria-label="\u5173\u6CE8\u5361\u724C\u672A\u89C1\u5F20\u6570"></div><header class="brand"><div class="mark" aria-hidden="true"></div><div><strong>\u4E09\u56FD\u6740 OL \u5DE5\u5177\u7BB1</strong><small>${EDITION.toUpperCase()} \xB7 ${CORE_VERSION}</small></div><button title="\u6298\u53E0\u9762\u677F" aria-label="\u6298\u53E0\u9762\u677F"></button></header><div class="status"><i class="dot"></i><span>\u7B49\u5F85\u6E38\u620F\u8FD0\u884C\u65F6</span></div><nav class="nav" role="tablist">${categories.map(([id, title]) => `<button data-category="${id}" role="tab" aria-label="${title}" aria-selected="false"><span>${title}</span></button>`).join("")}</nav><main class="content" role="tabpanel"></main><footer class="footer"><span>${EDITION === "dev" ? "\u5F00\u53D1\u7248" : EDITION === "lite" ? "\u8F7B\u91CF\u7248" : "\u5B8C\u6574\u7248"} ${CORE_VERSION}</span><button data-open-market title="\u6253\u5F00\u63D2\u4EF6\u5E02\u573A" aria-label="\u6253\u5F00\u63D2\u4EF6\u5E02\u573A">\u63D2\u4EF6\u5E02\u573A</button></footer></section>`;
    for (let [selector, name] of [[".mark", "toolbox"], ["[data-screenshot]", "camera"], ["[data-expand]", "expand"], [".brand button", "collapse"], ["[data-open-market]", "package"]])
      shadow.querySelector(selector).append(createIcon(doc, name));
    for (let [id] of categories) shadow.querySelector('[data-category="' + id + '"]').prepend(createIcon(doc, id));
    let content = shadow.querySelector(".content"), active = settings.get("category", "game"), management = "market", renderedCleanup, handlers = {}, panels = /* @__PURE__ */ new Map(), toastTimer, pluginSearch = "", onlyUninstalled = settings.get("marketOnlyUninstalled", !0) === !0, marketState = {}, marketRequest = 0, installing = /* @__PURE__ */ new Set(), dependencyPrompts = /* @__PURE__ */ new Map();
    function currentMarketState() {
      let client = handlers.market?.();
      return marketState.client !== client && (marketRequest++, marketState = { client }), marketState;
    }
    let el = (tag, text2, cls) => {
      let n = doc.createElement(tag);
      return text2 !== void 0 && (n.textContent = text2), cls && (n.className = cls), n;
    }, button = (text2, fn) => {
      let n = el("button", text2);
      return n.addEventListener("click", async () => {
        n.disabled = !0;
        try {
          await fn();
        } catch (e) {
          notify(e.message);
        } finally {
          n.disabled = !1;
        }
      }), n;
    };
    function notify(message) {
      shadow.querySelector(".toast")?.remove(), clearTimeout(toastTimer);
      let n = el("div", message, "toast");
      n.setAttribute("role", "status"), shadow.append(n), toastTimer = setTimeout(() => n.remove(), 6e3);
    }
    function empty(title, text2, icon2 = active) {
      let n = el("div", void 0, "empty");
      n.append(createIcon(doc, icon2)), n.append(el("strong", title), el("div", text2)), content.append(n);
    }
    async function exportDiagnostics() {
      if (typeof handlers.exportDiagnostics != "function") throw new Error("\u8BB0\u724C\u8BCA\u65AD\u5C1A\u672A\u51C6\u5907\u597D");
      let json = await handlers.exportDiagnostics();
      if (scope.closed) return;
      if (typeof json != "string") throw new Error("\u8BCA\u65AD\u6570\u636E\u683C\u5F0F\u65E0\u6548");
      if (typeof win.URL?.createObjectURL != "function") throw new Error("\u5F53\u524D\u6D4F\u89C8\u5668\u6682\u4E0D\u652F\u6301\u8BCA\u65AD\u6587\u4EF6\u4E0B\u8F7D");
      let blob = new win.Blob([json], { type: "application/json;charset=utf-8" }), url = win.URL.createObjectURL(blob), link = doc.createElement("a"), release = scope.add(() => win.URL.revokeObjectURL(url));
      link.href = url, link.download = `\u4E09\u56FD\u6740OL\u5DE5\u5177\u7BB1-\u8BB0\u724C\u8BCA\u65AD-${CORE_VERSION}-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.json`, link.hidden = !0, doc.documentElement.append(link);
      try {
        link.click(), notify("\u8BB0\u724C\u8BCA\u65AD\u5DF2\u5BFC\u51FA\u4E3AJSON \u6587\u4EF6\uFF0C\u672A\u4E0A\u4F20\u3002");
      } finally {
        link.remove(), scope.timeout(release, 1e3);
      }
    }
    function showLegacyWarning() {
      if (!1) return;
      shadow.querySelector("[data-legacy-warning]")?.remove();
      let panel = el("section", void 0, "card");
      panel.dataset.legacyWarning = "", panel.setAttribute("role", "status"), panel.style.cssText = "position:fixed;top:16px;right:0;width:min(320px,90vw);max-height:80vh;overflow:auto;z-index:10;box-shadow:0 8px 28px #0005", panel.append(el("strong", "\u65E7\u5C0F\u6284\u505C\u7528\u63D0\u9192"), el("p", "\u5EFA\u8BAE\u5728\u7BE1\u6539\u7334\u7BA1\u7406\u9762\u677F\u4E2D\u5173\u95ED\u65E7\u5C0F\u6284\uFF0C\u518D\u5237\u65B0\u6E38\u620F\u3002\u5DE5\u5177\u7BB1\u9ED8\u8BA4\u4E0D\u9000\u51FA\u6216\u9690\u85CF\u65E7\u811A\u672C\uFF0C\u53EF\u5173\u95ED\u63D0\u9192\u7EE7\u7EED\u4F7F\u7528\u3002"));
      let steps = el("ol");
      for (let text2 of ["\u70B9\u51FB\u6D4F\u89C8\u5668\u53F3\u4E0A\u89D2\u7684\u6269\u5C55\u56FE\u6807\uFF0C\u627E\u5230\u7BE1\u6539\u7334\uFF08Tampermonkey\uFF09\u3002", "\u70B9\u51FB\u7BE1\u6539\u7334\u56FE\u6807\uFF0C\u9009\u62E9\u201C\u7BA1\u7406\u9762\u677F / Dashboard\u201D\u3002", "\u5173\u95ED\u65E7\u5C0F\u6284\u811A\u672C\u7684\u5F00\u5173\uFF0C\u518D\u8FD4\u56DE\u6E38\u620F\u5237\u65B0\u9875\u9762\u3002"]) steps.append(el("li", text2));
      steps.style.paddingLeft = "20px", panel.append(steps), panel.append(helpTip(doc, "\u65E0\u9700\u67E5\u627E\u6269\u5C55 ID\u3002\u82E5\u5DE5\u5177\u680F\u672A\u663E\u793A\u7BE1\u6539\u7334\uFF0C\u53EF\u5148\u5728\u6269\u5C55\u83DC\u5355\u4E2D\u5C06\u5176\u56FA\u5B9A\u3002"));
      let details = el("details");
      details.append(el("summary", "\u4FDD\u5B58\u672C\u673A\u7BA1\u7406\u5730\u5740\uFF08\u53EF\u9009\uFF09")), details.append(helpTip(doc, "\u6253\u5F00\u7BA1\u7406\u9762\u677F\u540E\uFF0C\u590D\u5236\u5176\u5730\u5740\u7C98\u8D34\u5230\u8FD9\u91CC\u3002\u4EE5\u540E\u53EF\u4E00\u952E\u590D\u5236\uFF0C\u5728\u5730\u5740\u680F\u6253\u5F00\uFF1B\u7F51\u9875\u4E0D\u80FD\u76F4\u63A5\u8DF3\u8F6C\u5230\u6269\u5C55\u5185\u90E8\u9875\u9762\u3002"));
      let input = el("input", void 0, "sgs-input");
      input.value = settings.get("userscriptDashboardAddress", ""), input.placeholder = "\u7C98\u8D34\u672C\u673A\u7BE1\u6539\u7334\u7BA1\u7406\u9762\u677F\u5730\u5740", input.setAttribute("aria-label", "\u672C\u673A\u7BE1\u6539\u7334\u7BA1\u7406\u9762\u677F\u5730\u5740"), input.style.width = "100%";
      let hint = el("p", "", "muted");
      hint.setAttribute("role", "status");
      let normalize2 = (value) => {
        let url = new URL(value.trim());
        if (!["chrome-extension:", "moz-extension:", "safari-web-extension:"].includes(url.protocol) || !url.hostname || url.pathname !== "/options.html" || url.username || url.password || url.port) throw new Error("\u8BF7\u7C98\u8D34\u7BE1\u6539\u7334\u7BA1\u7406\u9762\u677F\u7684\u5B8C\u6574\u6269\u5C55\u5730\u5740\uFF08options.html\uFF09\u3002");
        return url.protocol + "//" + url.hostname + "/options.html#nav=dashboard";
      }, actions = el("div", void 0, "actions");
      actions.append(button("\u4FDD\u5B58\u5730\u5740", () => {
        try {
          let address = normalize2(input.value);
          settings.set("userscriptDashboardAddress", address), input.value = address, hint.textContent = "\u5DF2\u4FDD\u5B58\u5230\u5F53\u524D\u6D4F\u89C8\u5668\uFF0C\u5DF2\u79FB\u9664\u6E38\u620F\u94FE\u63A5\u7B49\u53C2\u6570\u3002";
        } catch (error) {
          hint.textContent = error.message;
        }
      }), button("\u590D\u5236\u5730\u5740", async () => {
        try {
          input.value = normalize2(input.value);
        } catch (error) {
          hint.textContent = error.message;
          return;
        }
        try {
          await win.navigator.clipboard.writeText(input.value), hint.textContent = "\u5DF2\u590D\u5236\uFF0C\u8BF7\u7C98\u8D34\u5230\u6D4F\u89C8\u5668\u5730\u5740\u680F\u6253\u5F00\u7BA1\u7406\u9762\u677F\u3002";
        } catch {
          input.focus(), input.select(), hint.textContent = "\u5730\u5740\u5DF2\u9009\u4E2D\uFF0C\u8BF7\u6309 Ctrl+C \u590D\u5236\u3002";
        }
      }), button("\u6E05\u9664\u5730\u5740", () => {
        settings.set("userscriptDashboardAddress", ""), input.value = "", hint.textContent = "\u5DF2\u6E05\u9664\u672C\u673A\u5730\u5740\u3002";
      })), details.append(input, actions, hint), panel.append(details), panel.append(button("\u7EE7\u7EED\u4F7F\u7528", () => panel.remove())), shadow.append(panel);
    }
    function renderAppearance(cleanups) {
      content.classList.add("appearance-page");
      let themeHeading = el("h3", void 0, "plugin-heading"), themeToggle = el("button", void 0, "plugin-toggle");
      themeToggle.type = "button", themeToggle.append(createIcon(doc, "palette"), el("span", "\u4E3B\u9898\u5DE5\u574A", "plugin-title"), createIcon(doc, "chevron", "plugin-chevron"));
      let workshop = el("div", void 0, "plugin-body");
      workshop.id = "core-theme-workshop", themeToggle.setAttribute("aria-controls", workshop.id);
      let applyThemeFold = (collapsed) => {
        workshop.hidden = collapsed, themeToggle.setAttribute("aria-expanded", String(!collapsed)), themeToggle.title = `${collapsed ? "\u5C55\u5F00" : "\u6536\u8D77"}\u4E3B\u9898\u5DE5\u574A`, themeToggle.setAttribute("aria-label", themeToggle.title);
      };
      applyThemeFold(settings.get("themeWorkshopCollapsed", !1)), themeToggle.onclick = () => {
        let collapsed = !workshop.hidden;
        settings.set("themeWorkshopCollapsed", collapsed), applyThemeFold(collapsed);
      };
      let themeGroup = el("section", void 0, "plugin-group appearance-section");
      themeHeading.append(themeToggle), themeGroup.append(themeHeading, workshop), content.append(themeGroup), cleanups.push(mountThemeWorkshop(workshop, { document: doc, themes: handlers.themes, notify }));
      let cardWorkshop = el("div", void 0, "plugin-group appearance-section");
      content.append(cardWorkshop), cleanups.push(mountCardStyleWorkshop(cardWorkshop, { document: doc, cardStyles: handlers.cardStyles, settings }));
    }
    function renderSettings(cleanups) {
      let first = content.children.length;
      if (!mobileDevice()) {
        content.append(el("h3", "HUD \u9760\u8FB9\u884C\u4E3A"));
        let choices = el("div", void 0, "sgs-segments");
        choices.setAttribute("role", "group"), choices.setAttribute("aria-label", "HUD \u9760\u8FB9\u884C\u4E3A");
        for (let [value, label] of [["none", "\u65E0\u64CD\u4F5C"], ["hide", "\u6536\u8D77"], ["fixed", "\u56FA\u5B9A"]]) {
          let choice = button(label, () => {
            settings.set("hudEdgeBehavior", value);
            let atEdge = host.hasAttribute("data-edge-docked") || host.getBoundingClientRect().right >= win.innerWidth - 12;
            setEdgeDocked(atEdge), render();
          });
          choice.dataset.edgeBehavior = value, choice.setAttribute("aria-pressed", String(edgeBehavior() === value)), choices.append(choice);
        }
        content.append(choices, helpTip(doc, "\u62D6\u5230\u53F3\u8FB9\u7F18\u65F6\uFF1A\u65E0\u64CD\u4F5C\u4FDD\u6301\u60AC\u6D6E\uFF1B\u6536\u8D77\u5728\u9F20\u6807\u79FB\u5F00\u540E\u9690\u85CF\uFF1B\u56FA\u5B9A\u4E3A\u4FA7\u680F\u5E76\u4E3A\u6E38\u620F\u753B\u5E03\u7559\u51FA\u7A7A\u95F4\u3002"));
      }
      content.append(el("h3", "\u622A\u56FE"));
      let cleanRow = el("label", void 0, "row");
      cleanRow.append(el("span", "\u622A\u56FE\u65F6\u9690\u85CF\u5DE5\u5177\u7BB1 UI"));
      let clean2 = el("input");
      clean2.type = "checkbox", styleSwitch(clean2), clean2.checked = settings.get("screenshotHideUI", !0), clean2.dataset.setting = "screenshotHideUI", clean2.onchange = () => settings.set("screenshotHideUI", clean2.checked), cleanRow.append(clean2), content.append(cleanRow), content.append(helpTip(doc, "\u5BF9\u5C40\u5185\u9690\u85CF HUD\u3001\u660E\u724C\u4E0E\u7406\u724C\u7B49\u53E0\u52A0\uFF1B\u5927\u5385\u4EC5\u9690\u85CF HUD\u3002"));
      let shortcutRow = el("label", void 0, "row");
      shortcutRow.append(el("span", "\u622A\u56FE\u5FEB\u6377\u952E"));
      let shortcut = el("input", void 0, "sgs-input");
      shortcut.readOnly = !0, shortcut.style.width = "150px", shortcut.setAttribute("aria-label", "\u622A\u56FE\u5FEB\u6377\u952E");
      let showShortcut = () => {
        shortcut.value = shortcutLabel(settings.get("screenshotShortcut", DEFAULT_SCREENSHOT_SHORTCUT));
      };
      showShortcut(), shortcut.onfocus = () => {
        shortcut.value = "\u8BF7\u6309\u5FEB\u6377\u952E\u2026";
      }, shortcut.onblur = showShortcut, shortcut.onkeydown = (event) => {
        if (event.preventDefault(), event.stopPropagation(), event.isComposing || event.repeat) return;
        if (event.key === "Escape") {
          shortcut.blur();
          return;
        }
        let binding = shortcutFromEvent(event);
        binding && (settings.set("screenshotShortcut", binding), showShortcut(), shortcut.blur());
      }, shortcutRow.append(shortcut), content.append(shortcutRow);
      let shotActions = el("div", void 0, "actions");
      if (shotActions.append(iconButton("\u6E05\u9664\u5FEB\u6377\u952E", "trash", () => {
        settings.set("screenshotShortcut", null), showShortcut();
      }, "icon-action"), iconButton("\u6062\u590D\u9ED8\u8BA4\u5FEB\u6377\u952E", "rollback", () => {
        settings.set("screenshotShortcut", DEFAULT_SCREENSHOT_SHORTCUT), showShortcut();
      }, "icon-action"), button("\u622A\u56FE\u5E76\u590D\u5236", () => handlers.screenshot?.())), content.append(shotActions), content.append(helpTip(doc, "\u70B9\u51FB\u5F55\u5165\u5FEB\u6377\u952E\uFF0CEsc \u53D6\u6D88\u3002\u622A\u56FE\u81EA\u52A8\u590D\u5236\u5230\u526A\u8D34\u677F\u3002")), !!1) {
        content.append(el("h3", "\u65E7\u811A\u672C\u517C\u5BB9")), content.append(button("\u524D\u5F80\u7BE1\u6539\u7334\u7BA1\u7406", showLegacyWarning));
        let enabled = el("label", void 0, "row");
        enabled.append(el("span", "\u63A5\u7BA1\u65E7\u5C0F\u6284\u754C\u9762"));
        let check = doc.createElement("input");
        check.type = "checkbox", styleSwitch(check), check.checked = settings.get("compatEnabled", !1), check.onchange = () => {
          settings.set("compatEnabled", check.checked), handlers.compat?.setEnabled(check.checked);
        }, enabled.append(check), content.append(enabled);
        let policy = el("select", void 0, "sgs-select");
        policy.setAttribute("aria-label", "\u65E7\u811A\u672C\u63A5\u7BA1\u65B9\u5F0F");
        for (let [value, label] of [["exit-known", "\u9000\u51FA\u5DF2\u77E5\u7248\u672C\u5E76\u9690\u85CF"], ["hide", "\u4EC5\u9690\u85CF\u754C\u9762"]]) {
          let option = el("option", label);
          option.value = value, policy.append(option);
        }
        policy.value = settings.get("compatPolicy", "hide"), policy.onchange = () => {
          settings.set("compatPolicy", policy.value), handlers.compat?.setTakeoverPolicy?.(policy.value), handlers.compat?.scan(), render();
        }, content.append(policy);
        let compatStatus = handlers.compat?.getStatus();
        content.append(el("div", formatCompat(compatStatus), "notice"));
        let actions = el("div", void 0, "actions");
        actions.append(iconButton("\u91CD\u65B0\u68C0\u6D4B", "reload", () => {
          handlers.compat?.scan(), render();
        }, "icon-action"), button("\u70B9\u9009\u9690\u85CF\u65E7\u9762\u677F", () => startPicker())), content.append(actions), content.append(helpTip(doc, "\u9690\u85CF UI \u4E0D\u4EE3\u8868\u540E\u53F0\u903B\u8F91\u5DF2\u505C\u6B62\u3002\u65E0\u6CD5\u9000\u51FA\u7684\u811A\u672C\u4ECD\u9700\u5728 Tampermonkey \u4E2D\u505C\u7528\uFF1B\u5DF2\u9000\u51FA\u811A\u672C\u9700\u5237\u65B0\u9875\u9762\u624D\u80FD\u6062\u590D\u3002"));
      }
      if (!1) {
        content.append(el("h3", "\u63D2\u4EF6\u5E02\u573A\u76EE\u5F55\u5730\u5740"));
        let input = el("input", void 0, "address sgs-input");
        input.value = settings.get("marketUrl", LOCAL_MARKET_URL), input.setAttribute("aria-label", "\u5E02\u573A\u5730\u5740");
        let sources = el("div", void 0, "sgs-segments");
        sources.setAttribute("role", "group"), sources.setAttribute("aria-label", "\u5E02\u573A\u8FDE\u63A5\u65B9\u5F0F");
        let selected = input.value === "" ? "\u79BB\u7EBF" : input.value === LOCAL_MARKET_URL ? "\u672C\u673A" : input.value === GITHUB_MARKET_URL ? "GitHub" : input.value === OSS_MARKET_URL ? "OSS" : "\u81EA\u5B9A\u4E49";
        for (let [label, url] of [["\u79BB\u7EBF", ""], ["\u672C\u673A", LOCAL_MARKET_URL], ["GitHub", GITHUB_MARKET_URL], ["OSS", OSS_MARKET_URL], ["\u81EA\u5B9A\u4E49", null]]) {
          let choice = button(label, () => {
            if (url === null) {
              input.disabled = !1, input.focus(), input.select();
              return;
            }
            handlers.setMarketUrl(url), render(), notify(url ? "\u5E02\u573A\u5730\u5740\u5DF2\u9009\u62E9\uFF0C\u624B\u52A8\u8FDE\u63A5\u540E\u8BFB\u53D6\u76EE\u5F55" : "\u5DF2\u5207\u6362\u4E3A\u79BB\u7EBF\uFF0C\u53EF\u7EE7\u7EED\u5BFC\u5165\u63D2\u4EF6\u5305");
          });
          choice.style.cssText = "white-space:nowrap;padding:4px 3px;font-size:10px;line-height:18px", choice.setAttribute("aria-pressed", String(label === selected)), sources.append(choice);
        }
        input.disabled = selected === "\u79BB\u7EBF", content.append(sources, input, button("\u4FDD\u5B58\u5730\u5740", () => {
          handlers.setMarketUrl(input.value), render(), notify("\u5E02\u573A\u5730\u5740\u5DF2\u4FDD\u5B58");
        }), helpTip(doc, "\u5E02\u573A\u8FDE\u63A5\u53EF\u9009\uFF1B\u4EC5\u624B\u52A8\u8FDE\u63A5\u6216\u68C0\u6D4B\u66F4\u65B0\u65F6\u8054\u7F51\uFF0C\u79BB\u7EBF\u4ECD\u53EF\u5BFC\u5165\u63D2\u4EF6\u5305\u3002"));
      }
      content.append(el("h3", "\u8BB0\u724C\u8BCA\u65AD"), helpTip(doc, "\u5BFC\u51FA\u672C\u5C40\u6700\u8FD1\u7684\u5361\u724C\u8BB0\u5F55\u4E0E\u6D88\u606F\u7C7B\u578B\uFF0C\u7528\u4E8E\u6392\u67E5\u660E\u724C\u9057\u6F0F\u3002\u6587\u4EF6\u4E0D\u542B\u8D26\u53F7\u3001\u6635\u79F0\u6216\u5B8C\u6574\u767B\u5F55\u6570\u636E\uFF0C\u53EA\u4FDD\u5B58\u5230\u672C\u673A\u3002"), button("\u5BFC\u51FA\u8BB0\u724C\u8BCA\u65AD", exportDiagnostics));
      let group;
      for (let node of [...content.children].slice(first))
        node.tagName === "H3" && (group = el("section", void 0, "settings-group"), content.append(group)), group.append(node);
      for (let b of content.querySelectorAll(".settings-group button")) {
        let icon2 = { \u622A\u56FE\u5E76\u590D\u5236: "camera", \u4FDD\u5B58\u5730\u5740: "save", \u5BFC\u51FA\u8BB0\u724C\u8BCA\u65AD: "download", \u70B9\u9009\u9690\u85CF\u65E7\u9762\u677F: "pointer" }[b.textContent];
        icon2 && b.prepend(controlIcon(doc, icon2));
      }
    }
    function formatCompat(status) {
      if (!status) return "\u517C\u5BB9\u63A7\u5236\u5668\u7B49\u5F85\u542F\u52A8\u3002";
      if (typeof status == "string") return status;
      let hidden = status.hiddenCount ?? status.hidden?.length ?? status.hiddenElements?.length ?? 0, exits = status.exitCalls?.length ?? status.exitCalled?.length ?? status.exits?.length ?? 0;
      return `\u5DF2\u9690\u85CF ${hidden} \u4E2A\u65E7\u754C\u9762\uFF1B\u9000\u51FA\u8C03\u7528 ${exits} \u6B21\u3002`;
    }
    function startPicker() {
      notify("\u70B9\u51FB\u9700\u8981\u9690\u85CF\u7684\u65E7\u811A\u672C\u9762\u677F\uFF1BEsc \u53D6\u6D88\u3002");
      let finish = () => {
        doc.removeEventListener("click", pick, !0), doc.removeEventListener("keydown", cancel, !0);
      }, cancel = (e) => {
        e.key === "Escape" && finish();
      }, pick = (e) => {
        if (e.composedPath().includes(host)) return;
        let target = e.target;
        if (!target || ["HTML", "BODY", "CANVAS"].includes(target.tagName) || target.id === "bgDiv") {
          notify("\u8BF7\u70B9\u9009\u65E7\u9762\u677F\u672C\u8EAB\uFF0C\u4E0D\u8981\u9009\u62E9\u6E38\u620F\u753B\u5E03\u3002");
          return;
        }
        e.preventDefault(), e.stopImmediatePropagation(), finish(), handlers.compat?.hideElement(target), notify("\u6240\u9009\u5143\u7D20\u5DF2\u9690\u85CF\uFF0C\u53EF\u5173\u95ED\u517C\u5BB9\u6A21\u5F0F\u6062\u590D\u3002");
      };
      setTimeout(() => {
        doc.addEventListener("click", pick, !0), doc.addEventListener("keydown", cancel, !0);
      }, 0), scope.add(finish);
    }
    let svgIcon = (name) => createIcon(doc, name, "ui-icon"), iconButton = (label, icon2, fn, cls = "") => {
      let n = button("", fn);
      return n.title = label, n.setAttribute("aria-label", label), n.className = cls, n.append(svgIcon(icon2), el("span", label, "sr-only")), n;
    };
    function releaseNotesBlock(item, expanded = !1) {
      if (!1) return [];
      let details = el("details", void 0, "plugin-release-notes");
      details.open = expanded;
      let text2 = el("div", item.releaseNotes || "\u4F5C\u8005\u672A\u63D0\u4F9B\u6B64\u7248\u672C\u7684\u66F4\u65B0\u5185\u5BB9\u3002", "plugin-release-notes-text");
      return text2.tabIndex = 0, text2.setAttribute("role", "region"), text2.setAttribute("aria-label", `${item.version} \u66F4\u65B0\u5185\u5BB9`), details.append(el("summary", `\u6700\u8FD1\u66F4\u65B0 \xB7 ${item.version}`), text2), [details];
    }
    function pluginIdentity(card, item, fallbackDescription) {
      let heading = el("div", void 0, "plugin-heading"), symbol = el("div", void 0, "plugin-symbol");
      symbol.append(svgIcon(item.icon || "package"));
      let name = el("strong", item.name, "plugin-name");
      name.title = item.name, heading.append(symbol, name, el("span", item.version, "plugin-version"));
      let description = el("div", item.description || fallbackDescription || "\u6B64\u63D2\u4EF6\u6682\u672A\u63D0\u4F9B\u7B80\u4ECB", "plugin-description");
      if (description.title = description.textContent, heading.append(helpTip(doc, description.textContent, `${item.name}\u7B80\u4ECB`)), card.append(heading, description), item.dependencies?.length) {
        let installed = handlers.manager?.list() || [], label = "\u524D\u7F6E\uFF1A" + item.dependencies.map((id) => installed.find((p) => p.id === id)?.name || currentMarketState().catalog?.plugins.find((p) => p.id === id)?.name || id).join("\u3001"), dependency = el("div", label, "plugin-prerequisites");
        dependency.title = label, card.append(dependency);
      }
    }
    function pluginCards() {
      let list2 = [...handlers.manager?.list() || []].sort(comparePluginOrder), state = currentMarketState(), updates = new Map((state.catalog ? findPluginUpdates(list2, state.catalog.plugins) : []).map((item) => [item.id, item]));
      list2.sort((a, b) => +(updates.get(b.id)?.status === "update") - +(updates.get(a.id)?.status === "update") || comparePluginOrder(a, b)), content.append(el("h3", "\u5DF2\u5B89\u88C5\u63D2\u4EF6")), list2.length || content.append(el("p", "\u6682\u65E0\u5DF2\u5B89\u88C5\u63D2\u4EF6\u3002\u4ECE\u4E0B\u65B9\u5E02\u573A\u5B89\u88C5\uFF0C\u6216\u5BFC\u5165\u63D2\u4EF6\u5305\u6587\u4EF6\u3002", "muted"));
      for (let item of list2) {
        let update = updates.get(item.id), maintenance = { updating: "\u6B63\u5728\u66F4\u65B0", waiting: "\u7B49\u5F85\u524D\u7F6E\u66F4\u65B0", restarting: "\u6B63\u5728\u6062\u590D" }[item.maintenance], failed = !maintenance && (!!item.error || item.enabled && !item.active), card = el("section", void 0, `card plugin-card${update?.status === "update" ? " has-update" : ""}${failed ? " has-error" : ""}`);
        card.dataset.pluginId = item.id, maintenance && card.setAttribute("aria-busy", "true"), pluginIdentity(card, item, update?.entry?.description);
        let bottom = el("div", void 0, "plugin-bottom"), status = el("span", maintenance || (failed ? "\u8FD0\u884C\u5F02\u5E38" : item.active ? "\u8FD0\u884C\u4E2D" : "\u5DF2\u505C\u7528"), `plugin-status ${maintenance ? "" : failed ? "is-error" : item.active ? "is-running" : ""}`);
        if (status.title = `${status.textContent} \xB7 ${item.source}`, bottom.append(status), update && update.status !== "update" && !failed) {
          let label = update.status === "current" ? "\u5DF2\u662F\u5E02\u573A\u6700\u65B0\u6B63\u5F0F\u7248" : update.status === "newer" ? `\u5F53\u524D\u7248\u672C\u9AD8\u4E8E\u5E02\u573A\u6B63\u5F0F\u7248 ${update.entry.version}` : "\u5E02\u573A\u6682\u65E0\u6B64\u63D2\u4EF6\u7684\u6B63\u5F0F\u7248", marker = el("span", void 0, "plugin-current");
          marker.title = label, marker.setAttribute("aria-label", label), marker.append(svgIcon(update.status === "current" ? "check" : "info"), el("span", label, "sr-only")), bottom.append(marker);
        }
        let actions = el("div", void 0, "plugin-tools");
        if (actions.append(iconButton(item.enabled ? "\u505C\u7528" : "\u542F\u7528", item.enabled ? "pause" : "play", () => handlers.manager.enable(item.id, !item.enabled), item.enabled ? "" : "is-enable"), iconButton("\u91CD\u8F7D", "reload", () => handlers.manager.reload(item.id))), item.hasPrevious && actions.append(iconButton("\u56DE\u9000", "rollback", () => handlers.manager.rollback(item.id))), actions.append(iconButton("\u5378\u8F7D", "trash", () => handlers.manager.uninstall(item.id), "is-destructive")), maintenance) for (let action of actions.children) action.disabled = !0;
        if (bottom.append(actions), card.append(bottom), failed) {
          let details = el("details", void 0, "plugin-error"), summary = el("summary");
          summary.append(svgIcon("alert"), el("span", "\u63D2\u4EF6\u8FD0\u884C\u5F02\u5E38")), details.append(summary, el("pre", item.error || "\u63D2\u4EF6\u672A\u80FD\u6FC0\u6D3B\uFF0C\u8BF7\u5C1D\u8BD5\u91CD\u8F7D\u3002")), card.append(details);
        }
        if (update?.status === "update") {
          let notice = el("div", void 0, "plugin-update"), info = el("div", void 0, "plugin-update-info");
          info.append(svgIcon("update"), el("span", `\u53D1\u73B0\u66F4\u65B0\uFF1A${item.version} \u2192 ${update.entry.version}`));
          let upgrade = button(`\u66F4\u65B0\u81F3 ${update.entry.version}`, () => installEntry(update.entry, !0));
          upgrade.prepend(svgIcon("update")), upgrade.disabled = installing.has(item.id) || !!maintenance, notice.append(info, ...releaseNotesBlock(update.entry, !0), upgrade), card.append(notice);
        } else card.append(...releaseNotesBlock(item));
        renderDependencyPrompt(card, update?.entry || item), markSearchable(card, item), content.append(card);
      }
    }
    async function installEntry(entry, updateOnly = !1, confirmed = !1) {
      let client = handlers.market();
      if (installing.has(entry.id)) return;
      let dependencies;
      try {
        dependencies = planDependencies(entry, handlers.manager.list(), currentMarketState().catalog?.plugins || []);
      } catch (error) {
        dependencyPrompts.set(entry.id, { entry, error: error.message, updateOnly }), render();
        return;
      }
      let previous = dependencyPrompts.get(entry.id), signature = JSON.stringify(dependencies.map((item) => [item.id, item.version, item.sha256]));
      if (dependencies.length && (!confirmed || previous?.signature !== signature || previous?.client !== client)) {
        dependencyPrompts.set(entry.id, { entry, dependencies, signature, client, updateOnly }), render();
        return;
      }
      dependencyPrompts.delete(entry.id);
      let locked = [entry.id, ...dependencies.map((item) => item.id)];
      if (locked.some((id) => installing.has(id))) throw new Error("\u524D\u7F6E\u63D2\u4EF6\u6B63\u5728\u5B89\u88C5\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002");
      for (let id of locked) installing.add(id);
      render();
      try {
        for (let dependency of dependencies) {
          if (scope.closed) return;
          if (handlers.market() !== client) throw new Error("\u5E02\u573A\u5730\u5740\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u68C0\u6D4B\u66F4\u65B0\u3002");
          if (handlers.manager.list().some((item) => item.id === dependency.id)) continue;
          let dependencyPackage = await client.getPackage(dependency);
          if (scope.closed) return;
          if (handlers.market() !== client) throw new Error("\u5E02\u573A\u5730\u5740\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u68C0\u6D4B\u66F4\u65B0\u3002");
          await handlers.manager.install(dependencyPackage);
        }
        planDependencies(entry, handlers.manager.list(), currentMarketState().catalog?.plugins || []);
        let pkg = await client.getPackage(entry);
        if (scope.closed) return;
        if (handlers.market() !== client) throw new Error("\u5E02\u573A\u5730\u5740\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u68C0\u6D4B\u66F4\u65B0\u3002");
        if (updateOnly) {
          let installed = handlers.manager.list().find((item) => item.id === entry.id);
          if (!installed || compareVersions2(entry.version, installed.version) <= 0) throw new Error("\u63D2\u4EF6\u5B89\u88C5\u72B6\u6001\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u68C0\u6D4B\u66F4\u65B0\u3002");
        }
        await handlers.manager.install(pkg), notify(`${entry.name} ${entry.version} \u5DF2\u5B89\u88C5`);
      } catch (error) {
        throw scope.closed || dependencyPrompts.set(entry.id, { entry, error: error.message, updateOnly }), error;
      } finally {
        for (let id of locked) installing.delete(id);
        scope.closed || render();
      }
    }
    function renderDependencyPrompt(card, entry) {
      let prompt = dependencyPrompts.get(entry.id);
      if (!prompt || prompt.entry.version !== entry.version) return;
      let box = el("div", void 0, "plugin-update");
      box.dataset.dependencyPrompt = entry.id, box.setAttribute("role", "status");
      let message = el("div", prompt.error || "\u9700\u8981\u5148\u5B89\u88C5\u5E76\u542F\u7528\uFF1A" + prompt.dependencies.map((item) => `${item.name} ${item.version}`).join("\u3001") + "\u3002\u662F\u5426\u7EE7\u7EED\uFF1F");
      message.style.overflowWrap = "anywhere", box.append(message), prompt.error || box.append(button("\u5B89\u88C5\u524D\u7F6E\u5E76\u7EE7\u7EED", () => installEntry(entry, prompt.updateOnly, !0))), box.append(button(prompt.error ? "\u5173\u95ED\u63D0\u793A" : "\u53D6\u6D88", () => {
        dependencyPrompts.delete(entry.id), render();
      })), card.append(box);
    }
    async function fetchCatalog() {
      let state = currentMarketState();
      if (!state.client || state.loading) return;
      let request = ++marketRequest;
      state.loading = !0, state.error = "", render();
      try {
        let catalog = await state.client.getCatalog();
        if (scope.closed || request !== marketRequest || handlers.market() !== state.client) return;
        state.catalog = catalog, state.checkedAt = /* @__PURE__ */ new Date();
      } catch (e) {
        if (scope.closed || request !== marketRequest || handlers.market() !== state.client) return;
        state.catalog = null, state.checkedAt = null, state.error = e.message;
      } finally {
        state.loading = !1, !scope.closed && request === marketRequest && render();
      }
    }
    function markSearchable(card, item) {
      card.dataset.searchText = [item.name, item.id, item.description].filter(Boolean).join(" ").toLocaleLowerCase();
    }
    function filterPlugins() {
      let terms = pluginSearch.trim().toLocaleLowerCase().split(/\s+/), cards = [...content.querySelectorAll("[data-search-text]")];
      for (let card of cards) card.hidden = onlyUninstalled && card.dataset.catalogInstalled === "true" || !terms.every((term) => card.dataset.searchText.includes(term));
      let empty2 = content.querySelector(".plugin-search-empty");
      empty2 && (empty2.hidden = !pluginSearch.trim() || cards.some((card) => !card.hidden));
    }
    function updateControls() {
      let state = currentMarketState(), check = button(state.loading ? "\u6B63\u5728\u68C0\u6D4B\u66F4\u65B0\u2026" : "\u68C0\u6D4B\u63D2\u4EF6\u66F4\u65B0", fetchCatalog);
      check.disabled = !state.client || !!state.loading, content.append(check);
      let search = el("input", void 0, "plugin-search");
      search.type = "search", search.placeholder = "\u641C\u7D22\u63D2\u4EF6\u540D\u79F0\u3001\u7B80\u4ECB\u6216 ID", search.setAttribute("aria-label", "\u641C\u7D22\u63D2\u4EF6"), search.value = pluginSearch, search.addEventListener("input", () => {
        pluginSearch = search.value, filterPlugins();
      }), content.append(search);
      let empty2 = el("div", "\u6CA1\u6709\u5339\u914D\u7684\u63D2\u4EF6", "notice plugin-search-empty");
      if (empty2.setAttribute("role", "status"), empty2.hidden = !0, content.append(empty2), !state.client) content.append(el("div", "\u5E02\u573A\u8FDE\u63A5\u5DF2\u5173\u95ED\uFF0C\u53EF\u5728\u8BBE\u7F6E\u4E2D\u9009\u62E9\u672C\u673A\u3001OSS \u6216\u81EA\u5B9A\u4E49\u5730\u5740\u3002", "notice"));
      else if (state.error) content.append(el("div", `\u68C0\u6D4B\u5931\u8D25\uFF1A${state.error}`, "notice error"));
      else if (state.catalog) {
        let results = findPluginUpdates(handlers.manager.list(), state.catalog.plugins), count = results.filter((item) => item.status === "update").length;
        content.append(el("div", `\u4E0A\u6B21\u68C0\u6D4B ${state.checkedAt.toLocaleTimeString()} \xB7 ${count ? `${count} \u4E2A\u63D2\u4EF6\u53EF\u66F4\u65B0` : "\u672A\u53D1\u73B0\u53EF\u66F4\u65B0\u7684\u6B63\u5F0F\u7248"}${results.some((item) => item.status === "unavailable") ? "\uFF08\u90E8\u5206\u63D2\u4EF6\u6682\u65E0\u6B63\u5F0F\u7248\uFF09" : ""}`, `notice update-summary${count ? " has-update" : ""}`));
      } else content.append(el("div", "\u70B9\u51FB\u68C0\u6D4B\uFF0C\u6BD4\u8F83\u5DF2\u5B89\u88C5\u63D2\u4EF6\u4E0E\u5E02\u573A\u6700\u65B0\u7248\u672C\u3002", "notice"));
    }
    function catalogCards(container) {
      let state = currentMarketState();
      if (!state.client) {
        container.append(el("div", "\u79BB\u7EBF\u6A21\u5F0F\uFF1A\u53EF\u5BFC\u5165\u63D2\u4EF6\u5305\u6587\u4EF6\uFF0C\u5DF2\u5B89\u88C5\u63D2\u4EF6\u7167\u5E38\u8FD0\u884C\u3002", "notice"));
        return;
      }
      if (state.loading) {
        container.append(el("div", "\u6B63\u5728\u8BFB\u53D6\u63D2\u4EF6\u76EE\u5F55\u2026", "notice"));
        return;
      }
      if (state.error) {
        container.append(el("div", "\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5\uFF0C\u5DF2\u5B89\u88C5\u63D2\u4EF6\u53EF\u7EE7\u7EED\u4F7F\u7528\u3002", "muted"));
        return;
      }
      if (!state.catalog) {
        container.append(el("div", "\u70B9\u51FB\u8FDE\u63A5\u540E\u8BFB\u53D6\u9759\u6001\u76EE\u5F55\u3002\u76EE\u5F55\u79BB\u7EBF\u4E0D\u4F1A\u505C\u6B62\u5DF2\u5B89\u88C5\u63D2\u4EF6\u3002", "notice"));
        return;
      }
      let installed = new Map((handlers.manager?.list() || []).map((item) => [item.id, item])), filter = el("label", void 0, "row"), toggle = styleSwitch(el("input"));
      toggle.type = "checkbox", toggle.checked = onlyUninstalled, toggle.addEventListener("change", () => {
        onlyUninstalled = toggle.checked, settings.set("marketOnlyUninstalled", onlyUninstalled), render();
      }), filter.append(el("span", "\u53EA\u663E\u793A\u672A\u5B89\u88C5"), toggle), container.append(filter);
      let count = state.catalog.plugins.filter((entry) => !onlyUninstalled || !installed.has(entry.id)).length;
      container.append(el("div", `${count} \u4E2A${onlyUninstalled ? "\u672A\u5B89\u88C5" : "\u53EF\u7528"}\u53D1\u5E03\u5305`, "muted")), count || container.append(el("div", "\u76EE\u5F55\u4E2D\u7684\u63D2\u4EF6\u5747\u5DF2\u5B89\u88C5", "notice"));
      for (let entry of [...state.catalog.plugins].sort(comparePluginOrder)) {
        let card = el("section", void 0, "card plugin-card");
        pluginIdentity(card, entry), card.dataset.catalogKey = JSON.stringify([entry.id, entry.version]);
        let current = installed.get(entry.id), same = current?.version === entry.version;
        card.dataset.catalogInstalled = String(!!current);
        let bottom = el("div", void 0, "plugin-bottom"), status = el("span", current ? `\u5DF2\u5B89\u88C5${same ? "\u6B64\u7248\u672C" : " " + current.version}` : "\u672A\u5B89\u88C5", "plugin-status");
        status.title = status.textContent, status.style.whiteSpace = "normal", bottom.append(status);
        let busy = installing.has(entry.id), install2 = button(busy ? "\u6B63\u5728\u5B89\u88C5\u2026" : same ? "\u5DF2\u5B89\u88C5" : current ? "\u66FF\u6362\u6B64\u7248\u672C" : "\u5B89\u88C5\u6B64\u7248\u672C", () => installEntry(entry));
        install2.disabled = busy || same, install2.style.marginLeft = "auto", install2.style.flexShrink = "0", busy && card.setAttribute("aria-busy", "true"), bottom.append(install2), card.append(bottom, ...releaseNotesBlock(entry)), renderDependencyPrompt(card, entry), markSearchable(card, entry), container.append(card);
      }
    }
    function coreUpdateStatus() {
      let version = currentMarketState().catalog?.core?.version;
      return typeof version == "string" && /^\d+\.\d+\.\d+$/.test(version) ? { version, order: compareVersions2(version, CORE_VERSION) } : null;
    }
    function renderCoreUpgrade() {
      if (!1) {
        let card2 = el("section", void 0, "card plugin-card" + (microUpdate?.newer ? " has-update" : ""));
        card2.dataset.coreUpgrade = "", pluginIdentity(card2, { name: "\u5DE5\u5177\u7BB1\u6838\u5FC3", version: CORE_VERSION, icon: "toolbox", description: "\u76F4\u63A5\u66F4\u65B0\u5DE5\u5177\u7BB1\u811A\u672C\uFF0C\u4FDD\u7559\u63D2\u4EF6\u4E0E\u8BBE\u7F6E\uFF0C\u4E0B\u6B21\u6253\u5F00\u6E38\u620F\u751F\u6548\u3002" });
        let message = microUpdateBusy ? "\u6B63\u5728\u8FDE\u63A5\u811A\u672C\u66F4\u65B0\u670D\u52A1\u2026" : microUpdateError || (microUpdate?.pending ? "\u5DF2\u4FDD\u5B58\u811A\u672C " + microUpdate.version + "\uFF0C\u4E0B\u6B21\u6253\u5F00\u6E38\u620F\u751F\u6548\u3002" : microUpdate?.newer ? "\u53D1\u73B0\u811A\u672C\u66F4\u65B0\uFF1A" + CORE_VERSION + " \u2192 " + microUpdate.version : microUpdate ? "\u811A\u672C\u5DF2\u662F\u6700\u65B0\u7248\u672C" : "\u70B9\u51FB\u68C0\u67E5\u811A\u672C\u66F4\u65B0"), status2 = el("div", message, microUpdateError ? "error" : "notice");
        status2.setAttribute("role", microUpdateError ? "alert" : "status"), card2.append(status2);
        let actions2 = el("div", void 0, "core-upgrade-actions"), check = button("\u68C0\u67E5\u811A\u672C\u66F4\u65B0", () => runMicroUpdate("check"));
        if (check.disabled = microUpdateBusy, actions2.append(check), microUpdate?.newer && !microUpdate.pending) {
          let install2 = button("\u66F4\u65B0\u811A\u672C", () => runMicroUpdate("install"));
          install2.disabled = microUpdateBusy, install2.prepend(svgIcon("update")), actions2.append(install2);
        }
        if (microUpdate?.rollback) {
          let rollback = button("\u56DE\u9000\u811A\u672C", () => runMicroUpdate("rollback"));
          rollback.disabled = microUpdateBusy, actions2.append(rollback);
        }
        card2.append(actions2), content.append(card2);
        return;
      }
      let state = currentMarketState(), latest = coreUpdateStatus(), card = el("section", void 0, "card plugin-card" + (latest?.order > 0 ? " has-update" : ""));
      card.dataset.coreUpgrade = "", pluginIdentity(card, { name: "\u5DE5\u5177\u7BB1\u6838\u5FC3", version: CORE_VERSION, icon: "toolbox", description: "\u901A\u8FC7\u7528\u6237\u811A\u672C\u5B89\u88C5\u9875\u5347\u7EA7\uFF0C\u5B89\u88C5\u5B8C\u6210\u540E\u5237\u65B0\u6E38\u620F\u3002" });
      let status = state.client ? state.loading ? "\u6B63\u5728\u68C0\u6D4B\u6838\u5FC3\u7248\u672C\u2026" : state.error ? "\u6838\u5FC3\u7248\u672C\u68C0\u6D4B\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5" : latest ? latest.order > 0 ? "\u53D1\u73B0\u6838\u5FC3\u66F4\u65B0\uFF1A" + CORE_VERSION + " \u2192 " + latest.version : latest.order < 0 ? "\u5F53\u524D\u6838\u5FC3\u9AD8\u4E8E\u5E02\u573A\u6B63\u5F0F\u7248 " + latest.version : "\u6838\u5FC3\u5DF2\u662F\u5E02\u573A\u6700\u65B0\u6B63\u5F0F\u7248" : "\u5C1A\u672A\u83B7\u53D6\u6838\u5FC3\u6B63\u5F0F\u7248\u4FE1\u606F" : "\u79BB\u7EBF \xB7 \u672A\u68C0\u6D4B\u6838\u5FC3\u7248\u672C";
      card.append(el("div", status, "notice"));
      let link = el("a", latest?.order > 0 ? "\u8DF3\u8F6C\u5347\u7EA7\u81F3 " + latest.version : "\u67E5\u770B\u6838\u5FC3\u5B89\u88C5\u9875");
      link.href = new URL("../lite/toolbox.user.js", (state.client?.baseUrl || OSS_MARKET_URL) + "/").href, link.target = "_blank", link.rel = "noopener noreferrer", link.style.cssText = "display:inline-flex;align-items:center;gap:6px;color:var(--sgs-accent);padding:6px 0;";
      let actions = el("div", void 0, "core-upgrade-actions");
      if (link.addEventListener("click", () => {
        pendingCoreUpgrade = latest?.order > 0 ? latest.version : CORE_VERSION, settings.set("pendingCoreUpgrade", pendingCoreUpgrade), render(), notify("\u5DF2\u6253\u5F00\u6838\u5FC3\u5B89\u88C5\u9875\uFF1B\u5B8C\u6210\u5B89\u88C5\u540E\uFF0C\u8BF7\u8FD4\u56DE\u6B64\u9875\u70B9\u51FB\u201C\u5237\u65B0\u751F\u6548\u201D\u3002");
      }), link.prepend(svgIcon("update")), actions.append(link), pendingCoreUpgrade) {
        let refresh = button("\u5237\u65B0\u751F\u6548", () => win.location.reload());
        refresh.prepend(svgIcon("refresh")), refresh.title = "\u5B8C\u6210\u811A\u672C\u5B89\u88C5\u540E\uFF0C\u5237\u65B0\u5F53\u524D\u6E38\u620F\u9875\u9762\u4F7F\u65B0\u7248\u6838\u5FC3\u751F\u6548", refresh.className = "core-upgrade-refresh", actions.append(refresh);
      }
      if (card.append(actions), pendingCoreUpgrade) {
        let reminder = el("div", "\u5B8C\u6210\u5B89\u88C5\u540E\uFF0C\u8BF7\u5237\u65B0\u6E38\u620F\u4F7F\u65B0\u7248\u6838\u5FC3\u751F\u6548\u3002\u5F53\u524D\u9875\u9762\u4ECD\u8FD0\u884C v" + CORE_VERSION + "\u3002", "core-upgrade-reminder");
        reminder.setAttribute("role", "status"), card.append(reminder);
      }
      content.append(card);
    }
    function renderMarket() {
      renderCoreUpgrade(), updateControls(), pluginCards(), content.append(el("h3", "\u63D2\u4EF6\u76EE\u5F55"));
      let catalog = el("div"), actions = el("div", void 0, "actions"), refresh = button("\u8FDE\u63A5 / \u5237\u65B0\u5E02\u573A", fetchCatalog);
      refresh.disabled = !currentMarketState().client || !!currentMarketState().loading, actions.append(refresh, button("\u5BFC\u5165\u63D2\u4EF6\u5305", () => {
        let file = doc.createElement("input");
        file.type = "file", file.accept = ".json", file.onchange = async () => {
          try {
            if (!file.files[0]) return;
            await handlers.manager.install(JSON.parse(await file.files[0].text())), notify("\u63D2\u4EF6\u5305\u5DF2\u5B89\u88C5");
          } catch (e) {
            notify(e.message);
          }
        }, file.click();
      })), handlers.manager?.builtins?.has("cards") && !handlers.manager.list().some((p) => p.id === "cards") && actions.append(button("\u6062\u590D\u5185\u7F6E\u5361\u724C", () => handlers.manager.restoreBuiltin("cards"))), !1, content.append(actions, catalog), catalogCards(catalog);
    }
    function renderManagement(cleanups) {
      let tabs = el("div", void 0, "tabs management-tabs");
      for (let [id, title] of [["settings", "\u8BBE\u7F6E"], ["market", "\u63D2\u4EF6\u5E02\u573A"], ["appearance", "\u5916\u89C2"]]) {
        let b = button(title, () => {
          management = id, render();
        });
        management === id && (b.className = "active"), tabs.append(b);
      }
      content.append(tabs), management === "settings" ? renderSettings(cleanups) : management === "market" ? renderMarket() : management === "appearance" && renderAppearance(cleanups);
    }
    function render() {
      let previousKey = renderedKey, anchors = renderedKey === "manage:market" ? [...content.querySelectorAll("[data-catalog-key]")].filter((card) => !card.hidden && card.getBoundingClientRect().bottom > content.getBoundingClientRect().top).map((card) => ({ key: card.dataset.catalogKey, top: card.getBoundingClientRect().top })) : [], restoreScroll = () => {
        if (content.scrollTop = viewScroll.get(renderedKey) || 0, previousKey === renderedKey)
          for (let anchor of anchors) {
            let card = [...content.querySelectorAll("[data-catalog-key]")].find((card2) => !card2.hidden && card2.dataset.catalogKey === anchor.key);
            if (card) {
              content.scrollTop += card.getBoundingClientRect().top - anchor.top;
              break;
            }
          }
      };
      renderedKey && viewScroll.set(renderedKey, content.scrollTop);
      try {
        renderedCleanup?.();
      } catch {
      }
      renderedCleanup = null, content.replaceChildren(), content.classList.remove("has-plugin-panels", "appearance-page");
      let cleanups = [];
      renderedCleanup = () => {
        for (let clean2 of cleanups.splice(0))
          try {
            clean2();
          } catch {
          }
      };
      let installed = handlers.manager?.list() || [], market = currentMarketState(), failures = installed.filter((item) => !item.maintenance && (item.error || item.enabled && !item.active)).length, upgrades = market.catalog ? findPluginUpdates(installed, market.catalog.plugins).filter((item) => item.status === "update").length : 0, manage = shadow.querySelector('[data-category="manage"]');
      manage.querySelector(".nav-alert")?.remove();
      let coreUpgrade = coreUpdateStatus()?.order > 0, alerts = [coreUpgrade && "\u6838\u5FC3\u53EF\u5347\u7EA7", failures && `${failures} \u4E2A\u63D2\u4EF6\u5F02\u5E38`, upgrades && `${upgrades} \u4E2A\u63D2\u4EF6\u53EF\u66F4\u65B0`].filter(Boolean).join(" \xB7 ");
      if (manage.title = alerts || "\u7BA1\u7406", alerts) {
        let badge = el("i", String(failures || upgrades + Number(coreUpgrade)), `nav-alert${failures ? " is-error" : ""}`);
        badge.setAttribute("aria-label", alerts), manage.append(badge);
      }
      for (let b of shadow.querySelectorAll("[data-category]")) b.setAttribute("aria-selected", String(b.dataset.category === active));
      renderedKey = active + ":" + (active === "game" ? gameView : active === "manage" ? management : ""), active === "manage" && (renderManagement(cleanups), filterPlugins());
      let categoryPanels = [...panels.values()].filter((p) => p.category === (active === "manage" && management === "appearance" ? "appearance" : active)).sort(comparePanelOrder), available = active === "game" ? selectGamePanels(categoryPanels, gameView) : categoryPanels;
      if (!available.length) {
        active !== "manage" && empty("\u5C1A\u672A\u5B89\u88C5\u6B64\u7C7B\u63D2\u4EF6", active === "game" ? "\u524D\u5F80\u7BA1\u7406 \u2192 \u63D2\u4EF6\u5E02\u573A\u5B89\u88C5\u5361\u724C\u63D2\u4EF6\u3002" : "\u6B64\u5206\u7C7B\u4E3A\u540E\u7EED\u63D2\u4EF6\u4FDD\u7559\u3002"), restoreScroll();
        return;
      }
      content.classList.add("has-plugin-panels");
      let groups = /* @__PURE__ */ new Map();
      for (let panel of available) {
        let id = panel.pluginId || panel.id, body = groups.get(id);
        if (!body) {
          let title = panel.pluginName || panel.title || id, group = el("section", void 0, "plugin-group");
          group.dataset.pluginGroup = id;
          let heading = el("h2", void 0, "plugin-heading"), toggle = el("button", void 0, "plugin-toggle");
          toggle.type = "button";
          let icon2 = el("span");
          icon2.setAttribute("aria-hidden", "true"), icon2.append(svgIcon(panel.pluginIcon || "package")), toggle.append(icon2, el("span", title, "plugin-title")), toggle.append(createIcon(doc, "chevron", "plugin-chevron")), body = el("div", void 0, "plugin-body"), body.id = `plugin-body-${groups.size}`, toggle.setAttribute("aria-controls", body.id);
          let apply = (collapsed) => {
            body.hidden = collapsed, toggle.setAttribute("aria-expanded", String(!collapsed)), toggle.setAttribute("aria-label", `${collapsed ? "\u5C55\u5F00" : "\u6536\u8D77"}${title}`), toggle.title = `${collapsed ? "\u5C55\u5F00" : "\u6536\u8D77"}${title}`;
          };
          apply(settings.get(`pluginCollapsed:${id}`, !1) === !0), toggle.onclick = (event) => {
            if (event.detail > 1) return;
            let collapsed = !body.hidden;
            settings.set(`pluginCollapsed:${id}`, collapsed), apply(collapsed);
          }, toggle.ondblclick = () => {
            settings.set(`pluginCollapsed:${id}`, !1), apply(!1);
          }, heading.append(toggle), group.append(heading, body), content.append(group), groups.set(id, body);
        }
        let section = el("section");
        section.dataset.panelId = panel.id, body.append(section);
        try {
          let clean2 = panel.render(section);
          typeof clean2 == "function" && cleanups.push(clean2);
        } catch (e) {
          section.append(el("div", "\u9762\u677F\u52A0\u8F7D\u5931\u8D25\uFF1A" + e.message, "error"));
        }
      }
      restoreScroll();
    }
    for (let b of shadow.querySelectorAll("[data-category]")) scope.listen(b, "click", () => {
      active = b.dataset.category, settings.set("category", active), render();
    });
    scope.listen(shadow.querySelector(".nav"), "keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      let buttons = [...shadow.querySelectorAll("[data-category]")], i = buttons.indexOf(shadow.activeElement);
      buttons[(i + (e.key === "ArrowLeft" ? 4 : 1)) % 5].focus(), e.preventDefault();
    }), scope.listen(shadow.querySelector("[data-open-market]"), "click", () => {
      active = "manage", management = "market", render();
    });
    let setCollapsed = (value) => {
      if (value && host.hasAttribute("data-edge-docked")) {
        setEdgeDocked(!1);
        let width = parseFloat(host.style.width) || 280, free = settings.get("hudFloatingPosition", { x: Math.max(0, win.innerWidth - width - 24), y: 72 });
        host.style.left = Math.max(0, Math.min(win.innerWidth - 156, Number(free?.x) || 0)) + "px", host.style.top = Math.max(0, Math.min(win.innerHeight - 45, Number(free?.y) || 0)) + "px", host.style.right = "auto", settings.set("position", { x: parseFloat(host.style.left), y: parseFloat(host.style.top) });
      }
      host.toggleAttribute("data-collapsed", value), settings.set("collapsed", value), typeof syncGameViewport == "function" && syncGameViewport();
    };
    host.toggleAttribute("data-collapsed", settings.get("collapsed", !1)), scope.listen(shadow.querySelector(".brand button"), "click", () => setCollapsed(!0));
    let expandHUD = () => {
      setCollapsed(!1), host.style.left && (host.style.left = Math.max(0, Math.min(win.innerWidth - (parseFloat(host.style.width) || 280), parseFloat(host.style.left))) + "px");
    };
    scope.listen(shadow.querySelector("[data-expand]"), "click", expandHUD), scope.listen(shadow.querySelector(".compact"), "dblclick", (event) => {
      event.target.closest("button") || (event.preventDefault(), expandHUD());
    }), scope.listen(shadow.querySelector("[data-screenshot]"), "click", () => handlers.screenshot?.());
    let mobileDevice = () => !!win.navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(win.navigator.userAgent || "") || win.navigator.platform === "MacIntel" && win.navigator.maxTouchPoints > 1 || !!win.matchMedia?.("(pointer: coarse)").matches, edgeBehavior = () => {
      let value = settings.get("hudEdgeBehavior", "fixed");
      return mobileDevice() ? "none" : ["none", "hide", "fixed"].includes(value) ? value : "fixed";
    }, gameViewport = createGameViewport({ window: win, document: doc, scope }), syncGameViewport = () => gameViewport.reserve(host.hasAttribute("data-edge-fixed") ? host.hasAttribute("data-collapsed") ? 156 : parseFloat(host.style.width) || 280 : 0), edgeHideTimer, draggingHUD = !1, revealEdge = () => {
      clearTimeout(edgeHideTimer), host.removeAttribute("data-edge-hidden");
    }, hasKeyboardFocus = () => host.matches(":focus-visible") || !!shadow.activeElement?.matches(":focus-visible"), hideEdge = () => {
      clearTimeout(edgeHideTimer), !(!host.hasAttribute("data-edge-docked") || host.hasAttribute("data-edge-fixed") || draggingHUD || hasKeyboardFocus()) && (edgeHideTimer = setTimeout(() => {
        !scope.closed && !draggingHUD && !hasKeyboardFocus() && host.setAttribute("data-edge-hidden", "");
      }, 180));
    }, setEdgeDocked = (value, hidden = !1) => {
      let behavior = edgeBehavior(), docked = !!value && behavior !== "none";
      revealEdge(), host.toggleAttribute("data-edge-docked", docked), host.toggleAttribute("data-edge-fixed", docked && behavior === "fixed"), host.toggleAttribute("data-edge-hidden", docked && behavior === "hide" && hidden), docked ? (setCollapsed(!1), host.tabIndex = 0, host.setAttribute("aria-label", behavior === "fixed" ? "\u5DE5\u5177\u7BB1\u56FA\u5B9A\u4FA7\u680F" : "\u5DE5\u5177\u7BB1\u81EA\u52A8\u9690\u85CF\u4FA7\u680F")) : (host.removeAttribute("tabindex"), host.removeAttribute("aria-label")), settings.set("edgeDocked", docked), syncGameViewport();
    }, edgeResizer = doc.createElement("div");
    edgeResizer.className = "edge-resizer", edgeResizer.tabIndex = 0, edgeResizer.setAttribute("role", "separator"), edgeResizer.setAttribute("aria-orientation", "vertical"), edgeResizer.setAttribute("aria-label", "\u8C03\u6574\u4FA7\u680F\u5BBD\u5EA6"), edgeResizer.title = "\u5411\u5DE6\u62D6\u52A8\u52A0\u5BBD\uFF0C\u5411\u53F3\u62D6\u52A8\u53D8\u7A84\uFF1B\u65B9\u5411\u952E\u8C03\u6574", edgeResizer.setAttribute("aria-valuemin", "248"), edgeResizer.setAttribute("aria-valuemax", "420");
    let grip = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    grip.setAttribute("viewBox", "0 0 24 24"), grip.setAttribute("aria-hidden", "true");
    let gripPath = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    gripPath.setAttribute("d", "M5 11l8 8M5 16l3 3"), grip.append(gripPath), edgeResizer.append(grip), shadow.append(edgeResizer);
    let applyEdgeWidth = (value) => {
      let width = Math.max(248, Math.min(420, Math.round(value)));
      return host.style.width = width + "px", shadow.querySelector(".shell").style.width = width + "px", edgeResizer.setAttribute("aria-valuenow", String(width)), syncGameViewport(), width;
    }, edgeResize, finishEdgeResize = () => {
      edgeResize && (edgeResize = void 0, draggingHUD = !1, settings.set("width", parseFloat(host.style.width)), host.matches(":hover") || hideEdge());
    };
    scope.listen(edgeResizer, "pointerdown", (event) => {
      event.button === 0 && (event.preventDefault(), event.stopPropagation(), revealEdge(), draggingHUD = !0, edgeResize = { x: event.clientX, width: host.getBoundingClientRect().width });
    }), scope.listen(win, "pointermove", (event) => {
      edgeResize && (event.preventDefault(), applyEdgeWidth(edgeResize.width + edgeResize.x - event.clientX));
    }), scope.listen(win, "pointerup", finishEdgeResize), scope.listen(win, "pointercancel", finishEdgeResize), scope.listen(edgeResizer, "keydown", (event) => {
      let current = parseFloat(host.style.width) || 280, next = { ArrowLeft: current + 8, ArrowRight: current - 8, Home: 248, End: 420 }[event.key];
      next !== void 0 && (event.preventDefault(), settings.set("width", applyEdgeWidth(next)));
    }), scope.listen(host, "pointerenter", revealEdge), scope.listen(host, "pointerleave", hideEdge), scope.listen(host, "focusin", revealEdge), scope.listen(host, "focusout", () => {
      host.matches(":hover") || hideEdge();
    }), scope.listen(win, "resize", () => {
      mobileDevice() && (setEdgeDocked(!1), active === "manage" && render()), host.style.left && (host.style.left = Math.max(0, Math.min(win.innerWidth - (host.hasAttribute("data-collapsed") ? 156 : parseFloat(host.style.width) || 280), parseFloat(host.style.left))) + "px");
    }), scope.add(() => clearTimeout(edgeHideTimer)), setEdgeDocked(settings.get("edgeDocked", !1), !0);
    let position = settings.get("position", null);
    if (position && (host.style.left = Math.max(0, Math.min(win.innerWidth - 248, position.x)) + "px", host.style.top = Math.max(0, Math.min(win.innerHeight - 50, position.y)) + "px", host.style.right = "auto"), host.style.width = Math.max(248, Math.min(420, settings.get("width", 280))) + "px", edgeResizer.setAttribute("aria-valuenow", String(parseFloat(host.style.width))), syncGameViewport(), win.ResizeObserver) {
      let saveWidth, observer = new win.ResizeObserver((entries) => {
        if (host.hasAttribute("data-collapsed")) return;
        let width = Math.round(entries[0].borderBoxSize?.[0]?.inlineSize || shadow.querySelector(".shell").getBoundingClientRect().width);
        width < 248 || (host.style.width = width + "px", edgeResizer.setAttribute("aria-valuenow", String(width)), syncGameViewport(), clearTimeout(saveWidth), saveWidth = setTimeout(() => settings.set("width", width), 200));
      });
      observer.observe(shadow.querySelector(".shell")), scope.add(() => {
        observer.disconnect(), clearTimeout(saveWidth);
      });
    }
    for (let handle of shadow.querySelectorAll(".brand,.compact")) scope.listen(handle, "pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button")) return;
      let moved = !1, rect = host.getBoundingClientRect();
      !host.hasAttribute("data-edge-docked") && rect.right < win.innerWidth - 12 && settings.set("hudFloatingPosition", { x: rect.left, y: rect.top }), draggingHUD = !0, setEdgeDocked(!1), host.style.left = rect.left + "px", host.style.right = "auto";
      let dx = e.clientX - rect.left, dy = e.clientY - rect.top, move = (event) => {
        moved ||= Math.abs(event.clientX - e.clientX) > 3 || Math.abs(event.clientY - e.clientY) > 3, host.style.left = Math.max(0, Math.min(win.innerWidth - rect.width, event.clientX - dx)) + "px", host.style.top = Math.max(0, Math.min(win.innerHeight - 45, event.clientY - dy)) + "px", host.style.right = "auto";
      }, up = () => {
        win.removeEventListener("pointermove", move), win.removeEventListener("pointerup", up), draggingHUD = !1, settings.set("position", { x: host.offsetLeft, y: host.offsetTop }), moved && !mobileDevice() && host.getBoundingClientRect().right >= win.innerWidth - 12 && (setEdgeDocked(!0), host.matches(":hover") || hideEdge());
      };
      win.addEventListener("pointermove", move), win.addEventListener("pointerup", up), scope.add(() => {
        win.removeEventListener("pointermove", move), win.removeEventListener("pointerup", up);
      });
    });
    let mount = () => {
      !host.isConnected && doc.documentElement && doc.documentElement.append(host);
    };
    mount(), scope.interval(mount, 1e3), scope.add(() => {
      try {
        renderedCleanup?.();
      } finally {
        renderedCleanup = null, clearTimeout(toastTimer), host.remove();
      }
    });
    let compactSummaries = /* @__PURE__ */ new Map();
    function setCompactSummary(id, items) {
      items.length ? compactSummaries.set(id, items) : compactSummaries.delete(id);
      let summary = shadow.querySelector(".compact-summary");
      summary.replaceChildren();
      for (let rows of compactSummaries.values()) for (let item of rows) {
        let row = el("div", void 0, "compact-summary-row");
        row.title = item.detail || "", row.append(el("span", item.label), el("b", item.value)), summary.append(row);
      }
    }
    return render(), { host, shadow, setCompactSummary, notify, showLegacyWarning, render, setGameView(value) {
      let next = value === "shanhe" ? "shanhe" : "battle";
      next !== gameView && (gameView = next, active === "game" && render());
    }, setRemainingSlash(value) {
      let known = Number.isFinite(value), text2 = value === 1 / 0 ? "\u221E" : known ? String(value) : "\u2014", compact = shadow.querySelector(".compact"), count = shadow.querySelector("[data-slash]");
      count.textContent = text2, compact.dataset.countState = value === 1 / 0 ? "unlimited" : known ? value === 0 ? "empty" : "ready" : "unknown", compact.dataset.countSize = text2.length > 2 ? "long" : "normal";
      let label = value === 1 / 0 ? "\u51FA\u6740\u6B21\u6570\u4E0D\u9650" : known ? `\u5269\u4F59\u51FA\u6740\u6B21\u6570\uFF1A${text2}` : "\u5269\u4F59\u51FA\u6740\u6B21\u6570\u6682\u4E0D\u53EF\u7528";
      count.setAttribute("aria-label", label), shadow.querySelector(".slash").title = label + "\uFF1B\u53CC\u51FB\u5C55\u5F00\uFF0C\u6309\u4F4F\u62D6\u52A8";
    }, setHandlers(value) {
      handlers = value, render();
    }, setStatusVisible(visible) {
      shadow.querySelector(".status").hidden = !visible;
    }, setStatus(text2) {
      shadow.querySelector(".status span").textContent = text2;
    }, applyTheme(tokens) {
      host.dataset.themeScheme = tokens.scheme === "light" ? "light" : "dark";
      for (let [key, value] of Object.entries(tokens)) host.style.setProperty("--sgs-" + key, value);
    }, registerPanel(spec) {
      if (panels.has(spec.id)) throw new Error("\u9762\u677F\u91CD\u590D\u6CE8\u518C\uFF1A" + spec.id);
      return panels.set(spec.id, spec), render(), () => {
        panels.delete(spec.id), render();
      };
    } };
  }

  // src/core/main.js
  function boot(win = window) {
    return startOwnedRuntime(win, EDITION, (api) => initialize(win, api));
  }
  async function initialize(win, api) {
    if (!!1 && installRefreshReentry(win)) return api;
    let scope = api.scope;
    !1;
    let onlyPlugin = null, settings = new Settings(win.localStorage, onlyPlugin ? `sgstoolbox:demo:${onlyPlugin}:` : "sgstoolbox:"), journal = new SessionJournal(), diagnostics = createCardDiagnostics({ journal, scope, version: CORE_VERSION });
    Object.assign(api, { version: CORE_VERSION, journal, diagnostics });
    let shell = createShell({ window: win, document: win.document, settings, scope }), themes = new ThemeRegistry(settings, (tokens) => shell.applyTheme(tokens)), game = createGameAdapter(win, scope), cardStyles = new CardStyleRegistry({ window: win, document: win.document, game, settings, scope }), backgrounds = new BackgroundRegistry({ window: win, game, settings, scope });
    scope.add(game.onSceneChange((scene) => shell.setGameView(gameViewForScene(scene)))), shell.setGameView(gameViewForScene(game.getScene()));
    let screenshot = createScreenshotController({ window: win, game, settings, scope, notify: shell.notify }), bridge = installMessageBridge(win, journal, scope, (message) => shell.setStatus(message), {
      getTargets: game.getMessageTargets,
      observeType: diagnostics.observeType
    }), compat, mounted = !1, legacyWarned = !1;
    compat = createCompatibility({ window: win, document: win.document, takeover: settings.get("compatPolicy", "hide"), onStatus: () => {
      bridge.check();
    } }), settings.get("compatPassiveDefaultV1", !1) || (settings.set("compatEnabled", !1), settings.set("compatPassiveDefaultV1", !0)), compat.setEnabled(settings.get("compatEnabled", !1)), compat.start(), scope.add(() => compat.stop());
    let marketConnection = createMarketConnection(settings, win.fetch.bind(win), shell.notify), manager = new PluginManager({
      journal,
      store: new PackageStore(win.indexedDB, onlyPlugin ? `sgs-ol-toolbox-demo-${onlyPlugin}` : "sgs-ol-toolbox"),
      settings,
      context: { core: Object.freeze({ version: CORE_VERSION, distribution: EDITION, platform: "browser" }), window: win, document: win.document, game, ui: shell, themes, cardStyles, backgrounds, notify: shell.notify },
      onChange: () => shell.render()
    });
    scope.add(() => manager.dispose());
    let replacements = {
      cards: REPLACED_CARD_PACKAGES,
      backgrounds: REPLACED_BACKGROUND_PACKAGES,
      "daily-rewards": REPLACED_REWARD_PACKAGES,
      effects: REPLACED_EFFECT_PACKAGES,
      skins: REPLACED_SKIN_PACKAGES,
      shanhetu: REPLACED_SHANHETU_PACKAGES,
      themes: REPLACED_THEME_PACKAGES,
      baisheng: REPLACED_BAISHENG_PACKAGES,
      appearances: REPLACED_APPEARANCE_PACKAGES
    };
    for (let pkg of bundledPackages) if ((!onlyPlugin || pkg.manifest.id === onlyPlugin || onlyPlugin === "gaizhu" && pkg.manifest.id === "baisheng") && (await manager.registerBundled(pkg, replacements[pkg.manifest.id] || []), scope.closed))
      return null;
    shell.setHandlers({
      manager,
      themes,
      cardStyles,
      compat,
      market: marketConnection.get,
      setMarketUrl: marketConnection.set,
      screenshot: screenshot.capture,
      exportDiagnostics: async () => (await bridge.flush(), diagnostics.serialize({ bridge: bridge.getStatus() }))
    }), shell.setStatusVisible(!1), scope.add(journal.subscribe((event) => {
      event.type === "toolbox:snapshot" && typeof event.payload?.inGame == "boolean" ? shell.setStatusVisible(event.payload.inGame) : event.type === "MsgGamePlayCardNtf" ? shell.setStatusVisible(!0) : ["MsgGameOver", "ClientLeavetableRep"].includes(event.type) && shell.setStatusVisible(!1);
    }));
    let snapshots = attachSessionSnapshots({ journal, game, scope, settled: bridge.flush });
    return scope.interval(() => {
      shell.setRemainingSlash(game.getRemainingSlash());
      let ready = !!(game.getScene() || win.Laya?.stage || win.__SGS_TOOLBOX_DEMO__);
      shell.host.style.display = ready ? "" : "none", !!1 && ready && !legacyWarned && compat.getStatus().sources.length && (legacyWarned = !0, shell.showLegacyWarning()), ready && !mounted && (mounted = !0, snapshots.request());
      let capture = bridge.getStatus();
      shell.setStatus(bridge.error || (ready ? capture.received ? `\u5DF2\u6536 ${capture.received} \u6761\u6D88\u606F \xB7 ${journal.incomplete ? "\u7F3A\u5C11\u5F00\u5C40\u8BB0\u5F55" : "\u672C\u5C40\u8BB0\u5F55\u4E2D"}` : capture.targets.length ? "\u6D88\u606F\u5165\u53E3\u5DF2\u8FDE\u63A5 \xB7 \u7B49\u5F85\u6536\u5305" : "\u672A\u63A5\u5165\u6E38\u620F\u6D88\u606F \xB7 \u4EC5\u539F\u751F\u663E\u793A\u53EF\u7528" : "\u7B49\u5F85\u6E38\u620F\u8FD0\u884C\u65F6"));
    }, 500), !win.__SGS_TOOLBOX_DEMO__ && !win.Laya?.stage && (shell.host.style.display = "none"), await manager.init(), scope.closed ? null : (Object.assign(api, { manager, game, themes, cardStyles, backgrounds, compat, shell, settings, bridge, market: marketConnection.get }), win.__SGS_TOOLBOX_DEMO__ && snapshots.request(), manager.errors.length && shell.notify(manager.errors.join("\uFF1B")), api);
  }
  boot().catch((error) => {
    console.error("[\u4E09\u56FD\u6740OL\u5DE5\u5177\u7BB1]", error);
  });
})();
