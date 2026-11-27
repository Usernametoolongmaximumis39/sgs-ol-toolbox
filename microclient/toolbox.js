// 三国杀OL工具箱 · 微端 LITE · 0.6.306
(() => {
  var __create = Object.create, __defProp = Object.defineProperty, __getOwnPropDesc = Object.getOwnPropertyDescriptor, __getOwnPropNames = Object.getOwnPropertyNames, __getProtoOf = Object.getPrototypeOf, __hasOwnProp = Object.prototype.hasOwnProperty, __commonJS = (cb, mod) => function() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  }, __copyProps = (to, from, except, desc) => {
    if (from && typeof from == "object" || typeof from == "function")
      for (let key of __getOwnPropNames(from))
        !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    return to;
  }, __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: !0 }) : target,
    mod
  )), require_crypto = __commonJS({
    "(disabled):crypto"() {
    }
  });
  function installRefreshReentry() {
    return !1;
  }
  var read = (fn) => {
    try {
      return fn();
    } catch {
      return;
    }
  };
  function installTouchPreview(win, scope) {
    let nav = win.navigator;
    if (!(/Android|iPhone|iPad|iPod/i.test((nav == null ? void 0 : nav.userAgent) || "") || /Mac/i.test((nav == null ? void 0 : nav.platform) || "") && (nav == null ? void 0 : nav.maxTouchPoints) > 1)) return;
    let stage, unbind = () => {
    }, down, pending, active, hold, expanded, patched = /* @__PURE__ */ new WeakSet(), close = () => {
      active && read(() => active.hide.call(active.node)), active = null, expanded && read(() => expanded.outHandler({ stopPropagation() {
      } })), expanded = null;
    }, cancel = () => {
      down = null, clearTimeout(hold), clearTimeout(pending), close();
    }, point = (e) => {
      var _a2, _b2;
      let native = ((_b2 = (_a2 = e.nativeEvent) == null ? void 0 : _a2.changedTouches) == null ? void 0 : _b2[0]) || e.nativeEvent;
      return { x: (native == null ? void 0 : native.clientX) ?? e.stageX, y: (native == null ? void 0 : native.clientY) ?? e.stageY };
    }, parentOf = (node) => node.parentContainer || node.parent || node.render, friendRow = (target) => {
      var _a2;
      for (let node = target, i2 = 0; node && i2 < 24; node = parentOf(node), i2++)
        if ((_a2 = node.data) != null && _a2.FriendNickname && typeof node.itemCliCk == "function" && typeof node.overHandler == "function" && typeof node.SetOutState == "function") return node;
    }, guardFriend = (row) => {
      for (let node of [row, row.bg, row.overBg])
        !(node != null && node.event) || patched.has(node) || (patched.add(node), scope.patch(node, "event", (original) => function(type, e, ...args) {
          if (!(type === "click" && (isTouch(e || {}) || (down == null ? void 0 : down.row) === row)) && !(type === "mouseout" && expanded === row))
            return original.call(this, type, e, ...args);
        }));
    }, tooltip = (target, e) => {
      let texture = read(() => target.getTextureByPosition(e.stageX, e.stageY));
      for (let node = texture || target, i2 = 0; node && i2 < 24; node = parentOf(node), i2++) {
        if (node.destroyed || node.visible === !1 || node.renderVisible === !1) return null;
        if (read(() => node.ToolTip)) {
          for (let [show, hide] of [["onRollOver", "tipsRollOut"], ["rollOverHandler", "rollOutHandler"]])
            if (typeof node[show] == "function" && typeof node[hide] == "function") return { node, show: node[show], hide: node[hide] };
        }
      }
      return null;
    }, isTouch = (e) => {
      var _a2, _b2;
      let native = e.nativeEvent;
      return native != null && native.pointerType ? native.pointerType === "touch" : !!((_a2 = native == null ? void 0 : native.changedTouches) != null && _a2.length || (_b2 = native == null ? void 0 : native.touches) != null && _b2.length);
    }, bind = () => {
      var _a2;
      let next = (_a2 = win.Laya) == null ? void 0 : _a2.stage;
      if (next === stage || (unbind(), cancel(), stage = next, !(stage != null && stage.on) || !(stage != null && stage.off))) return;
      let owner = {}, bound = stage, events = [], listen = (type, fn) => {
        bound.on(type, owner, fn), events.push([type, fn]);
      };
      listen("mousedown", (e) => {
        var _a3, _b2;
        let hitRow = friendRow(e.target), action = hitRow && ![hitRow, hitRow.bg, hitRow.overBg].includes(e.target);
        if (isTouch(e) && action && expanded === hitRow) {
          down = null, clearTimeout(hold), clearTimeout(pending);
          return;
        }
        if (cancel(), isTouch(e) && !(((_b2 = (_a3 = e.nativeEvent) == null ? void 0 : _a3.touches) == null ? void 0 : _b2.length) > 1)) {
          let row = friendRow(e.target), surface = row && [row, row.bg, row.overBg].includes(e.target);
          if (down = { ...point(e), target: tooltip(e.target, e), row: surface ? row : null, moved: !1 }, surface) {
            guardFriend(row);
            let start = down;
            hold = setTimeout(() => {
              down !== start || start.moved || row.destroyed || !parentOf(row) || row.data !== start.data || (start.held = !0, close(), read(() => row.itemCliCk(e)));
            }, 500), start.data = row.data;
          }
        }
      }), listen("mousemove", (e) => {
        if (down) {
          let p = point(e);
          Math.hypot(p.x - down.x, p.y - down.y) > 12 && (down.moved = !0, clearTimeout(hold));
        }
      }), listen("mouseup", (e) => {
        let start = down;
        if (down = null, clearTimeout(hold), start != null && start.held || !start || start.moved || !start.target) return;
        let end = point(e), target = tooltip(e.target, e);
        if (Math.hypot(end.x - start.x, end.y - start.y) > 12 || (target == null ? void 0 : target.node) !== start.target.node) return;
        let event = { stageX: e.stageX ?? bound.mouseX, stageY: e.stageY ?? bound.mouseY };
        pending = setTimeout(() => {
          if (scope.closed || target.node.destroyed || target.node.visible === !1 || !parentOf(target.node)) return;
          let parent = target.node;
          for (let i2 = 0; parent && parent !== bound && i2 < 64; i2++, parent = parentOf(parent))
            if (parent.destroyed || parent.visible === !1 || parent.renderVisible === !1) return;
          if (parent === bound) {
            if (start.row) {
              if (start.row.data !== start.data) return;
              expanded = start.row, read(() => expanded.overHandler({ stopPropagation() {
              } }));
            }
            active = target, read(() => target.show.call(target.node, event));
          }
        }, 0);
      }), unbind = () => {
        for (let [type, fn] of events) bound.off(type, owner, fn);
      };
    };
    scope.listen(win.document, "touchcancel", cancel, !0), scope.listen(win.document, "pointerdown", (e) => {
      e.pointerType !== "touch" && cancel();
    }, !0), scope.listen(win, "blur", cancel), scope.interval(bind, 400), bind(), scope.add(() => {
      unbind(), cancel();
    });
  }
  var EDITION = "lite", GITHUB_UPDATE_URL = "https://raw.githubusercontent.com/Usernametoolongmaximumis39/sgs-ol-toolbox/main", DOWNLOAD_UPDATE_URL = "https://dl.3gs.xyz", GITHUB_MARKET_URL = GITHUB_UPDATE_URL + "/plugins", DOWNLOAD_MARKET_URL = DOWNLOAD_UPDATE_URL + "/plugins", OSS_MARKET_URL = "https://tools.3gs.xyz/sgs-toolbox/market", HANGZHOU_MARKET_URL = "https://chk-sgstools-hangzhou.oss-cn-hangzhou.aliyuncs.com/sgs-toolbox/market";
  function installMicroAPIs(win) {
    for (let proto of [win.Element.prototype, win.DocumentFragment.prototype, win.Document.prototype]) proto.replaceChildren || Object.defineProperty(proto, "replaceChildren", { configurable: !0, writable: !0, value(...nodes) {
      for (; this.firstChild; ) this.removeChild(this.firstChild);
      this.append(...nodes);
    } });
    if (win.Object.hasOwn || Object.defineProperty(win.Object, "hasOwn", { value: (o, k) => win.Object.prototype.hasOwnProperty.call(o, k), configurable: !0, writable: !0 }), win.Array.prototype.at || Object.defineProperty(win.Array.prototype, "at", { value(index) {
      let n = Math.trunc(Number(index) || 0), i2 = n < 0 ? this.length + n : n;
      return i2 < 0 || i2 >= this.length ? void 0 : this[i2];
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
  function splitArguments(text3) {
    let parts = [], depth = 0, start = 0;
    for (let i2 = 0; i2 < text3.length; i2++)
      text3[i2] === "(" ? depth++ : text3[i2] === ")" ? depth-- : text3[i2] === "," && !depth && (parts.push(text3.slice(start, i2).trim()), start = i2 + 1);
    return parts.push(text3.slice(start).trim()), parts;
  }
  function replaceFunction(text3, name, replace) {
    let start = text3.indexOf(name + "(");
    for (; start >= 0; ) {
      let end = start + name.length + 1, depth = 1;
      for (; end < text3.length && depth; end++)
        text3[end] === "(" ? depth++ : text3[end] === ")" && depth--;
      if (depth) break;
      let result = replace(text3.slice(start + name.length + 1, end - 1));
      text3 = text3.slice(0, start) + result + text3.slice(end), start = text3.indexOf(name + "(", start + result.length);
    }
    return text3;
  }
  function legacyMicroCSS(css, variable, pixel) {
    let color2 = (text3) => pixel(replaceFunction(text3, "var", (body) => {
      let [name, fallback] = splitArguments(body);
      return variable(name) || fallback || "#000";
    }));
    return css = replaceFunction(css, "color-mix", (body) => {
      let [space, a, b] = splitArguments(body);
      if (space !== "in srgb" || !a || !b) return "transparent";
      let parse2 = (text3) => {
        let match = text3.match(/\s+([\d.]+)%$/);
        return { rgba: color2(match ? text3.slice(0, match.index) : text3), weight: match ? Number(match[1]) / 100 : null };
      }, x2 = parse2(a), y = parse2(b), p = x2.weight ?? (y.weight === null ? 0.5 : 1 - y.weight), q = y.weight ?? 1 - p, alpha = x2.rgba[3] / 255 * p + y.rgba[3] / 255 * q;
      return `rgba(${[0, 1, 2].map((i2) => alpha ? Math.round((x2.rgba[i2] * x2.rgba[3] / 255 * p + y.rgba[i2] * y.rgba[3] / 255 * q) / alpha) : 0).join(",")},${alpha})`;
    }), css.replace(/:focus-visible/g, ":focus").replace(/overflow:\s*clip/g, "overflow:hidden").replace(/\b(padding|margin)-inline:\s*([^;}]+)/g, (_, prop, value) => {
      let v = value.trim().split(/\s+/);
      return `${prop}-left:${v[0]};${prop}-right:${v[1] || v[0]}`;
    }).replace(/\b(padding|margin)-block:\s*([^;}]+)/g, (_, prop, value) => {
      let v = value.trim().split(/\s+/);
      return `${prop}-top:${v[0]};${prop}-bottom:${v[1] || v[0]}`;
    }).replace(/\bborder-block:\s*([^;}]+)/g, (_, value) => `border-top:${value.trim()};border-bottom:${value.trim()}`).replace(/\bborder-inline:\s*([^;}]+)/g, (_, value) => `border-left:${value.trim()};border-right:${value.trim()}`).replace(/\binset:\s*([^;}]+)/g, (_, value) => {
      let v = value.trim().split(/\s+/);
      return `top:${v[0]};right:${v[1] || v[0]};bottom:${v[2] || v[0]};left:${v[3] || v[1] || v[0]}`;
    });
  }
  function installMicroCompatibility(win, scope) {
    var _a2;
    if (installMicroAPIs(win), (_a2 = win.CSS) != null && _a2.supports("color", "color-mix(in srgb,black,white)")) return;
    let doc = win.document, watched = /* @__PURE__ */ new Map(), canvas = doc.createElement("canvas");
    canvas.width = canvas.height = 1;
    let context2 = canvas.getContext("2d"), colors = /* @__PURE__ */ new Map(), pixel = (value) => {
      if (colors.has(value)) return colors.get(value);
      context2.clearRect(0, 0, 1, 1), context2.fillStyle = "transparent", context2.fillStyle = value, context2.fillRect(0, 0, 1, 1);
      let rgba = context2.getImageData(0, 0, 1, 1).data;
      return colors.size >= 256 && colors.clear(), colors.set(value, rgba), rgba;
    }, update = (host, record, sourcesChanged) => {
      let { root, style: style2 } = record;
      if (scope.closed || !host.isConnected) return;
      let css = sourcesChanged ? [...root.querySelectorAll("style")].filter((el) => el !== style2).map((el) => el.textContent).join(`
`) : record.css, computed, previousSheet, variables = /* @__PURE__ */ new Map(), variable = (name) => {
        if (!variables.has(name)) {
          if (!computed) {
            let sheet = css !== record.css ? style2.sheet : null;
            sheet && !sheet.disabled && (previousSheet = sheet, sheet.disabled = !0), computed = win.getComputedStyle(host);
          }
          variables.set(name, computed.getPropertyValue(name).trim());
        }
        return variables.get(name);
      };
      if (css !== record.css || [...record.variables].some(([name, value]) => variable(name) !== value)) {
        let translated;
        try {
          translated = legacyMicroCSS(css, variable, pixel);
        } finally {
          previousSheet && (previousSheet.disabled = !1);
        }
        let output = translated + `
[popover]:not([data-micro-popover-open]){display:none!important}[popover][data-micro-popover-open]{display:block;z-index:2147483647}
*::-webkit-scrollbar{width:7px;height:7px}*::-webkit-scrollbar-track{background:var(--sgs-bg)}*::-webkit-scrollbar-thumb{background:var(--sgs-border);border:2px solid var(--sgs-bg);border-radius:6px}*::-webkit-scrollbar-thumb:hover{background:var(--sgs-muted)}*::-webkit-scrollbar-corner{background:var(--sgs-bg)}`;
        style2.textContent !== output && (style2.textContent = output), record.css = css, record.variables = variables;
      }
      sourcesChanged && root.lastChild !== style2 && root.append(style2);
    }, stylesheet = 'style,link[rel~="stylesheet" i]', changesSources = ({ type, target, addedNodes, removedNodes }, style2) => {
      var _a3;
      if (target === style2 || target.parentNode === style2) return !1;
      if (type === "attributes") return target.matches("style,link");
      if (type === "characterData") return ((_a3 = target.parentNode) == null ? void 0 : _a3.localName) === "style";
      if (target.localName === "style") return !0;
      let includesSource = (nodes) => [...nodes].some((node) => node !== style2 && node.nodeType === 1 && (node.matches(stylesheet) || node.firstElementChild && node.querySelector(stylesheet)));
      return includesSource(addedNodes) || includesSource(removedNodes);
    }, unwatch = (host, { root, style: style2, observer, linkLoaded }) => {
      observer.disconnect(), root.removeEventListener("load", linkLoaded, !0), style2.remove(), watched.delete(host);
    }, discover = () => {
      for (let [host, record] of watched) host.isConnected || unwatch(host, record);
      for (let host of doc.querySelectorAll("[data-sgs-toolbox]")) {
        let root = host.shadowRoot;
        if (!root || watched.has(host)) continue;
        let style2 = doc.createElement("style");
        style2.dataset.microFallback = "", root.append(style2);
        let observer = new win.MutationObserver((mutations) => {
          let sourcesChanged = style2.parentNode !== root || mutations.some((mutation) => changesSources(mutation, style2));
          (sourcesChanged || mutations.some((mutation) => mutation.target === host)) && update(host, record, sourcesChanged);
        }), linkLoaded = (event) => {
          var _a3, _b2;
          (_b2 = (_a3 = event.target).matches) != null && _b2.call(_a3, stylesheet) && update(host, record, !1);
        }, record = { root, style: style2, observer, linkLoaded, css: null, variables: /* @__PURE__ */ new Map() };
        observer.observe(host, { attributes: !0, attributeFilter: ["style", "data-theme-scheme"] }), observer.observe(root, { childList: !0, characterData: !0, subtree: !0, attributes: !0, attributeFilter: ["rel", "href", "media", "disabled"] }), root.addEventListener("load", linkLoaded, !0), watched.set(host, record), update(host, record, !0);
      }
    };
    discover(), scope.interval(discover, 250), scope.add(() => {
      for (let [host, record] of watched) unwatch(host, record);
    });
  }
  var bundledPackages = [], fullPluginPanels = [{ id: "social:market-placeholder", category: "tools", pluginId: "social", pluginName: "\u597D\u53CB\u4E0E\u804A\u5929", pluginIcon: { paths: ["M4 4h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-3.5 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z", "M16 9h4a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-.5v3L16 18h-5a2 2 0 0 1-2-2v-2", "M6 8.2h6M6 11h4"] }, pluginPriority: 30300 }, { id: "player-info:market-placeholder", category: "game", pluginId: "player-info", pluginName: "\u8D44\u6599\u4E0E\u5C06\u6C60", pluginIcon: { paths: ["M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z", "M8.5 11.2a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8ZM5.5 16a3.1 3.1 0 0 1 6 0", "M14.5 9.5h4.5M14.5 12.8h4.5M14.5 16h3"] }, pluginPriority: 30200 }, { id: "backgrounds:market-placeholder", category: "appearance", pluginId: "backgrounds", pluginName: "\u81EA\u5B9A\u4E49\u80CC\u666F", pluginIcon: { paths: ["M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z", "M2.5 16.5 8 11l4 4 3.2-3.2L21.5 17.5", "M15.5 8.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0"] }, pluginPriority: 31e3 }, { id: "shanhetu:market-placeholder", category: "game", pluginId: "shanhetu", pluginName: "\u5C71\u6CB3\u56FE", pluginIcon: { paths: ["M3 5 9 3l6 2 6-2v16l-6 2-6-2-6 2Z", "M6 12 10 7l4 5 3-3 2 3", "M6 16c3-3 7 3 12-1"] }, pluginPriority: 11e3, gameView: "shanhe" }, { id: "cards:market-placeholder", category: "game", pluginId: "cards", pluginName: "\u5361\u724C", pluginIcon: { paths: ["M9 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z", "M4 5 2 6l2 14M14 7l3 5-3 5-3-5Z"] }, pluginPriority: 1e4 }, { id: "play-assist:market-placeholder", category: "game", pluginId: "play-assist", pluginName: "\u51FA\u724C\u8F85\u52A9", pluginIcon: { paths: ["M6.8 9.4a4.8 4.8 0 1 1 8.2 0", "M9.5 15V6.8a1.4 1.4 0 0 1 2.8 0V12", "M12.3 11.4a1.4 1.4 0 0 1 2.8 0V13m0-.8a1.4 1.4 0 0 1 2.8 0V15a5.8 5.8 0 0 1-5.8 5.8h-1.6a5.4 5.4 0 0 1-4.6-2.6l-1.9-3.2a1.4 1.4 0 0 1 2.3-1.6L9.5 15"] }, pluginPriority: 12e3, gameView: "battle" }, { id: "daily-rewards:market-placeholder", category: "automation", pluginId: "daily-rewards", pluginName: "\u65E5\u5E38\u9886\u5956", pluginIcon: { paths: ["M3 8h18v4H3ZM5 12v9h14v-9M12 8v13", "M12 8H8a3 3 0 1 1 3-3ZM12 8h4a3 3 0 1 0-3-3Z"] }, pluginPriority: 2e4 }, { id: "seckill:market-placeholder", category: "automation", pluginId: "seckill", pluginName: "\u81EA\u52A8\u79D2\u6740", pluginIcon: { paths: ["M5 7h14l2 14H3ZM8 7V5a4 4 0 0 1 8 0v2", "M13 10 9 15h3l-1 4 5-6h-4Z"] }, pluginPriority: 21e3 }, { id: "gaizhu:market-placeholder", category: "automation", pluginId: "gaizhu", pluginName: "\u76D6\u4E3B\u901F\u5237", pluginIcon: { paths: ["M4.5 11.5a7.5 7.5 0 0 1 13-5.1L19.5 8.5M19.5 4.2v4.3h-4.3", "M19.5 12.5a7.5 7.5 0 0 1-13 5.1L4.5 15.5M4.5 19.8v-4.3h4.3", "M10.4 9.6 14.8 12l-4.4 2.4Z"] }, pluginPriority: 21e3 }, { id: "effects:market-placeholder", category: "tools", pluginId: "effects", pluginName: "\u7279\u6548\u5C4F\u853D", pluginIcon: { paths: ["M9 5 11 2l2.5 7.5L21 12l-4 1.5M14.5 16 12 22l-2.5-7.5L2 12l5-2", "M3 3 21 21M19 3v4M17 5h4"] }, pluginPriority: 2e4 }, { id: "skins:market-placeholder", category: "tools", pluginId: "skins", pluginName: "\u76AE\u80A4\u7BA1\u7406", pluginIcon: { paths: ["M8 3 12 5l4-2 6 5-4 4-2-2v11H8V10l-2 2-4-4Z", "M8 3l8 9M16 3l-6 7M8 16h8"] }, pluginPriority: 3e4 }, { id: "stargazing:market-placeholder", category: "tools", pluginId: "stargazing", pluginName: "\u81EA\u52A9\u89C2\u661F", pluginIcon: { paths: ["M3.5 13.5 15.2 6l3 4.8-13 5.2Z", "M12 8.1l2.7 4.4", "M10.5 14 6.8 21M10.5 14 14.8 21M10.5 14v7", "M19.8 3v3M18.3 4.5h3"] }, pluginPriority: 32768 }, { id: "baisheng:market-placeholder", category: "info", pluginId: "baisheng", pluginName: "\u767E\u80DC\u6218\u529F", pluginIcon: { paths: ["M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v2a4 4 0 0 0 4 4M17 5h4v2a4 4 0 0 1-4 4", "M12 14v4M8 21v-3h8v3ZM12 6l2 2-2 2-2-2Z"] }, pluginPriority: 31e3 }, { id: "appearances:market-placeholder", category: "info", pluginId: "appearances", pluginName: "\u51FA\u6846\u4E0E\u80DC\u7387\u7EDF\u8BA1", pluginIcon: { paths: ["M3 20h18", "M5 20v-4.5h3V20M10.5 20v-7.5h3V20M16 20v-10.5h3V20", "M5 10.5 10.5 6.5l3 2 5-4.5M15.5 4h3v3"] }, pluginPriority: 32e3 }, { id: "ledger:market-placeholder", category: "info", pluginId: "ledger", pluginName: "\u8D26\u672C", pluginIcon: { paths: ["M6 3h13a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 3v18", "M2 7h4M2 12h4M2 17h4M12 8h5M12 12h5M12 16h3"] }, pluginPriority: 3e4 }, { id: "recharge:market-placeholder", category: "tools", pluginId: "recharge", pluginName: "\u65E7\u5468\u6708\u5361", pluginIcon: { paths: ["M4 5h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z", "M8 3v4M16 3v4M2 10h20", "M7 14h2.5M14.5 14h2.5M7 17.5h2.5M14.5 17.5h2.5"] }, pluginPriority: 45e3 }], localAppearanceSyncPackage = null, consolidationDigests = { "player-info": "f32ab05227d46447017ee7ba214812edc0d00ae7114ef0ac9cac1843d216a599", "card-styles-extra": "25b3592d5c69230031813394696c9f6c9c8668d32d9d6244aeac47497bcd7734", shanhetu: "2b48ec3b1fe0bc092318b4c0bcdc2665bf5c9ff6ca8c4c1361f766e2d9ed72df", ledger: "0ee82d5e59a24cd188969bdc37f294655cd9cd456fe661b8d38a87e8f03d136d" }, ResourceScope = class {
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
  }, KEY = Symbol.for("sgs.ol.toolbox.core");
  function startOwnedRuntime(win, edition, start) {
    var _a2;
    let previous = win[KEY];
    if (previous && (previous.distribution === "dev" || edition !== "dev")) return previous.ready || Promise.resolve(previous);
    (_a2 = previous == null ? void 0 : previous.dispose) == null || _a2.call(previous);
    let scope = new ResourceScope(), api = { distribution: edition, scope, dispose() {
      scope.dispose(), win[KEY] === api && delete win[KEY];
    } };
    return win[KEY] = api, api.ready = (async () => {
      try {
        await (previous == null ? void 0 : previous.ready);
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
  var Settings = class _Settings {
    constructor(storage, prefix3 = "sgstoolbox:", listeners = /* @__PURE__ */ new Set()) {
      this.storage = storage, this.prefix = prefix3, this.listeners = listeners;
    }
    get(key, fallback) {
      var _a2;
      try {
        let raw = (_a2 = this.storage) == null ? void 0 : _a2.getItem(this.prefix + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    }
    set(key, value) {
      var _a2;
      let fullKey = this.prefix + key;
      (_a2 = this.storage) == null || _a2.setItem(fullKey, JSON.stringify(value));
      for (let listener of this.listeners)
        try {
          listener(fullKey);
        } catch {
        }
      return value;
    }
    subscribe(listener) {
      return this.listeners.add(listener), () => this.listeners.delete(listener);
    }
    namespace(id) {
      return new _Settings(this.storage, this.prefix + id + ":", this.listeners);
    }
  }, PackageStore = class {
    constructor(indexedDB, databaseName2 = "sgs-ol-toolbox") {
      this.indexedDB = indexedDB, this.databaseName = databaseName2, this.dbPromise = null;
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
    put(record) {
      return this.putMany([record]);
    }
    async putMany(records) {
      let db = await this.open();
      return new Promise((resolve, reject) => {
        let tx = db.transaction("plugins", "readwrite"), store = tx.objectStore("plugins");
        tx.oncomplete = () => resolve(), tx.onerror = () => reject(tx.error), tx.onabort = () => reject(tx.error || new Error("\u63D2\u4EF6\u5B58\u50A8\u4E8B\u52A1\u5DF2\u4E2D\u6B62"));
        try {
          for (let record of records) store.put(record);
        } catch (error) {
          tx.abort(), reject(error);
        }
      });
    }
    async delete(id) {
      let db = await this.open();
      return new Promise((resolve, reject) => {
        let tx = db.transaction("plugins", "readwrite");
        tx.objectStore("plugins").delete(id), tx.oncomplete = resolve, tx.onerror = () => reject(tx.error), tx.onabort = () => reject(tx.error);
      });
    }
  }, cardPacketWrappers = ["Protocol", "protocol", "ProtoObj", "protoObj", "Data", "data", "msg", "Msg"], aliases = {
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
    Datas: ["datas"],
    useType: ["UseType"],
    TurnCnt: ["turnCnt", "TurnCount", "turnCount"],
    Round: ["round"],
    isSend: ["IsSend"],
    IsResume: ["isResume"],
    Count: ["count", "hand_count"],
    DestSeatIDs: ["DestSeatIds", "destSeatIds", "Targets"],
    EffectIndex: ["effectIndex"],
    IsSpell: ["isSpell", "is_spell"],
    DataID: ["DataId", "dataId", "data_id"],
    MurSeatID: ["MurSeatId", "murSeatId", "MurderSeatID"],
    MData: ["mData"],
    MsgID: ["MsgId", "msgId", "msg_id"],
    list_card_id: ["listCardId"],
    error_id: ["ErrorID", "errorId"]
  };
  for (let key of ["FromZone", "ToZone", "FromPosition", "ToPosition", "FromZoneParam", "ToZoneParam", "MoveType"])
    aliases[key] = [key[0].toLowerCase() + key.slice(1), key.replace(/[A-Z]/g, (char, index) => (index ? "_" : "") + char.toLowerCase())];
  var cardFieldNames = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, [key, ...names]])), observationFieldNames = {
    Datas: [...cardFieldNames.Datas, "data"],
    error_id: [...cardFieldNames.error_id, "errCode"],
    CastSeatID: ["CastSeatID", "castSeatId"],
    ItemID: ["ItemID", "itemId"],
    ItemParams: ["ItemParams", "param"]
  }, schemas = {
    MsgGamePlayCardNtf: ["CardList", "IsResume", "SeatID"],
    PubGsCMoveCard: ["FromID", "FromZone", "FromPosition", "FromZoneParam", "ToID", "ToZone", "ToPosition", "ToZoneParam", "MoveType", "CardIDs", "CardCount", "SpellID", "SrcSeatID"],
    PubGsCUseCard: ["SeatID", "CardID", "CardIDs", "SpellID", "useType"],
    MsgNtfUseCardType: ["CastSeatID", "SpellID", "useType"],
    decodeRogueLikeItemEffectNtf: ["ItemID", "ItemParams", "error_id"],
    PubGsCUseSpell: ["SeatID", "SrcSeatID", "SpellID", "CardIDs", "CardCount", "EffectIndex", "DestSeatIDs"],
    MsgGameTurnNtf: ["SeatID", "TurnCnt", "IsResume"],
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
    SmsgGamePlayerDead: ["SeatID", "MurSeatID"],
    GsCUpdateRoleDataExNtf: ["SeatID", "IsSpell", "DataID", "Datas"],
    MsgClientOperateInGameNtf: ["SeatID", "Type", "MsgID", "MData"],
    MsgGameOver: [],
    ClientLeavetableRep: [],
    ClientLoginRep: ["userID"]
  }, lists = /* @__PURE__ */ new Set(["CardList", "CardIDs", "DestSeatIDs", "list_card_id", "Infos", "GeneralData", "Params", "Datas", "ItemParams", "MData"]), isObservedMessage = (type) => typeof type == "string" && Object.hasOwn(schemas, type), get = (object2, key) => {
    try {
      return object2 == null ? void 0 : object2[key];
    } catch {
      return;
    }
  }, scalar = (value) => value === null || ["string", "number", "boolean"].includes(typeof value) ? typeof value == "string" ? value.slice(0, 256) : value : void 0, loginUserId = (packet2) => get(packet2, "userID") ?? get(packet2, "UserID") ?? get(packet2, "userId");
  function smallList(value, key) {
    let length = get(value, "length"), cap = key === "Infos" || key === "GeneralData" || key === "DestSeatIDs" ? 32 : 2048;
    if (!Number.isInteger(length) || length < 0 || length > cap) throw new Error(`${key} \u957F\u5EA6\u8D85\u9650\u6216\u65E0\u6548`);
    let result = [];
    for (let i2 = 0; i2 < length; i2++) {
      let item = get(value, i2);
      if (item && typeof item == "object") {
        let fields2 = key === "Infos" ? ["SeatID", "CharacterID"] : key === "GeneralData" ? ["index", "cardID"] : ["CardId", "CardID", "cardId", "cardID", "id"], record = {};
        for (let field2 of fields2) {
          let val = scalar(get(item, field2));
          val !== void 0 && (record[field2] = val);
        }
        result.push(record);
      } else result.push(scalar(item));
    }
    return result;
  }
  function projectMessage(type, payload) {
    if (!isObservedMessage(type)) return null;
    if (type === "ClientLoginRep") {
      let userID = scalar(loginUserId(payload) ?? loginUserId(get(payload, "Protocol")));
      return userID === void 0 ? {} : { userID };
    }
    let fields2 = schemas[type];
    if (!fields2.length) return {};
    let result = {}, sources = [], queue = [payload], seen = /* @__PURE__ */ new Set();
    for (let i2 = 0; i2 < queue.length && i2 < 12; i2++) {
      let source = queue[i2];
      if (!(!source || typeof source != "object" || seen.has(source))) {
        seen.add(source), sources.push(source);
        for (let key of cardPacketWrappers) {
          let value = get(source, key);
          value && typeof value == "object" && queue.length < 12 && queue.push(value);
        }
      }
    }
    for (let key of [...fields2, "isSend"]) {
      let names = observationFieldNames[key] || cardFieldNames[key] || [key], empty;
      outer: for (let source of sources) for (let name of names) {
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
  var WRAPPERS = new Set(cardPacketWrappers), HISTORY_LIMIT = 2048;
  function packetBody(payload) {
    let queue = [payload], seen = /* @__PURE__ */ new Set(), body = {};
    for (let i2 = 0; i2 < queue.length && i2 < 32; i2++) {
      let source = queue[i2];
      if (!(!source || typeof source != "object" || seen.has(source))) {
        seen.add(source);
        for (let [key, value] of Object.entries(source))
          WRAPPERS.has(key) && value && typeof value == "object" ? queue.push(value) : (!(key in body) || body[key] == null || Array.isArray(body[key]) && !body[key].length) && (body[key] = value);
      }
    }
    return body;
  }
  function packetSignature(type, payload) {
    return type + ":" + JSON.stringify(payload);
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
    #history = [];
    #head = 0;
    #omitted = 0;
    #limit;
    constructor({ historyLimit = HISTORY_LIMIT } = {}) {
      this.#limit = Number.isInteger(historyLimit) && historyLimit > 0 ? Math.min(historyLimit, HISTORY_LIMIT) : HISTORY_LIMIT, this.sessionId = 1, this.seq = 0, this.listeners = /* @__PURE__ */ new Set(), this.incomplete = !0;
    }
    get events() {
      return this.#head ? this.#history.slice(this.#head).concat(this.#history.slice(0, this.#head)) : this.#history.slice();
    }
    *replayAfter(cursor) {
      let history = this.#history, head = this.#head, length = history.length, first = history[head];
      if (!first || cursor >= this.seq) return;
      this.#omitted && cursor < first.seq - 1 && (yield {
        seq: first.seq - 1,
        sessionId: first.sessionId,
        at: first.at,
        type: "toolbox:gap",
        payload: { reason: "\u672C\u5C40\u8F83\u65E9\u4E8B\u4EF6\u5DF2\u8D85\u51FA\u91CD\u653E\u4E0A\u9650\uFF0C\u65E0\u6CD5\u5B8C\u6574\u91CD\u5EFA", replayOnly: !0 }
      });
      let start = Math.max(0, cursor - first.seq + 1);
      for (let i2 = start; i2 < length; i2++) yield history[(head + i2) % length];
    }
    push(type, payload, at = Date.now()) {
      if (payload = copy(payload), type === "MsgGamePlayCardNtf") {
        let body = packetBody(payload), lists2 = [body.CardList, body.cardList, body.card_list], deck = lists2.find((value) => (value == null ? void 0 : value.length) > 0) ?? lists2.find((value) => value != null);
        deck && typeof deck == "object" && Number.isInteger(deck.length) && deck.length >= 0 && deck.length <= 1e4 && (this.sessionId++, this.#history = [], this.#head = this.#omitted = 0, this.incomplete = !deck.length || !!(body.IsResume ?? body.isResume));
      }
      (/Reconnect/.test(type) || type === "toolbox:gap") && (this.incomplete = !0);
      let event = { seq: ++this.seq, sessionId: this.sessionId, type, payload, at };
      this.#history.length < this.#limit ? this.#history.push(event) : (this.#history[this.#head] = event, this.#head = (this.#head + 1) % this.#limit, this.#omitted++);
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
      return { sessionId: this.sessionId, seq: this.seq, incomplete: this.incomplete, omittedEvents: this.#omitted, events: this.events };
    }
  };
  function installMessageBridge(win, journal, scope, onStatus = () => {
  }, {
    getTargets = () => [],
    observeType = () => {
    },
    observeStartupDispatch,
    sceneWatch
  } = {}) {
    let activeWrapper, restoreCurrent, depth = 0, consoleError = "", nativeErrors = [], loginIdentity, loginEpoch = 0, native = /* @__PURE__ */ new Map(), restores = [], stats = { received: 0, console: 0, native: 0, lastType: "", lastAt: null }, duplicates = /* @__PURE__ */ new Map(), expiryTimer, pending = [], waiters = [], drainTimer, draining = !1;
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
      let observed = isObservedMessage(type);
      try {
        observeType(type, source, observed);
      } catch {
      }
      if (!observed) return;
      let payload;
      try {
        payload = projectMessage(type, data);
      } catch {
        stats.rejected++, queue("toolbox:gap", { reason: "\u5361\u724C\u6D88\u606F\u5B57\u6BB5\u8D85\u51FA\u652F\u6301\u8303\u56F4\uFF0C\u5DF2\u8DF3\u8FC7\u8BE5\u6761\u8BB0\u5F55" });
        return;
      }
      if (payload != null && payload.isSend) return;
      let signature = packetSignature(type, payload), entry = duplicates.get(signature);
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
              let prefix3 = args.filter((x2) => typeof x2 == "string").join(" ");
              if (!/\bsend\b|发送/i.test(prefix3)) for (let i2 = args.length - 1; i2 >= 0; i2--) {
                let data = args[i2], type = (data == null ? void 0 : data.ClassName) || (data == null ? void 0 : data.className);
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
        if (!descriptor || descriptor.configurable ? Object.defineProperty(win.console, "log", { value: wrapper, writable: !0, configurable: !0, enumerable: (descriptor == null ? void 0 : descriptor.enumerable) ?? !0 }) : "value" in descriptor && descriptor.writable && (win.console.log = wrapper), win.console.log !== wrapper) throw new Error("\u65E5\u5FD7\u5165\u53E3\u88AB\u4E0D\u53EF\u914D\u7F6E\u7684\u65E7\u811A\u672C\u9501\u5B9A");
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
    function readLoginReply(proxy, packet2) {
      try {
        let data = packet2 == null ? void 0 : packet2.Protocol;
        if ((data == null ? void 0 : data.Id) !== 20202 || data.FromSocket2) return;
        let id = data.UserID, connection = proxy.ConnId;
        if (data.Result !== 1 && data.Result !== 2 || !Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(connection)) return null;
        let name = data.Nickname, nickname = typeof name == "string" && name.length <= 128 && name.trim() ? name : "";
        return { proxy, connection, account: Object.freeze({ id: String(id), nickname }) };
      } catch {
      }
    }
    function loginConnectionMatches(identity, proxy) {
      try {
        return !scope.closed && identity && identity.proxy === proxy && proxy.ConnectedSucess1 === !0 && proxy.ConnId === identity.connection;
      } catch {
        return !1;
      }
    }
    let getLoginAccount = (proxy) => loginConnectionMatches(loginIdentity, proxy) ? loginIdentity.account : null;
    function installNative() {
      var _a2, _b2;
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
        if (!(!target || typeof target.event != "function" || live.has(target)) && (live.add(target), ((_a2 = native.get(target)) == null ? void 0 : _a2.wrapper) !== target.event))
          try {
            let descriptor = Object.getOwnPropertyDescriptor(target, "event"), original = target.event, entry = { name, wrapper: null, active: !0 }, wrapper = function(...args) {
              if (scope.closed || !entry.active) return Reflect.apply(original, this, args);
              let [eventName, data] = args, packet2;
              try {
                packet2 = Array.isArray(data) && data.length === 1 && typeof data[0] == "object" ? data[0] : data;
                let type = isObservedMessage(eventName) || /^(?:Msg|PubGs|Smsg|GsC|CGs|decode|Client)/.test(eventName) ? eventName : (packet2 == null ? void 0 : packet2.ClassName) || (packet2 == null ? void 0 : packet2.className);
                receive(type, packet2, `native:${name}`);
              } catch {
              }
              if (name !== "ServerProxy") return Reflect.apply(original, this, args);
              let login = this === target && eventName === "ClientLoginRep" ? readLoginReply(target, packet2) : void 0;
              this === target && (login !== void 0 || eventName === "ClientLogoutRep" || eventName === "close") && (loginEpoch++, loginIdentity = void 0);
              let epoch = loginEpoch, startup = observeStartupDispatch && (eventName === "ClientLoginRep" || eventName === "ClientUserbaseinfoRep");
              if (!login && !startup) return Reflect.apply(original, this, args);
              let result;
              try {
                result = Reflect.apply(original, this, args);
              } catch (error) {
                if (startup) try {
                  observeStartupDispatch(eventName, "threw", error);
                } catch {
                }
                throw error;
              }
              if (login && epoch === loginEpoch && loginConnectionMatches(login, target) && (loginIdentity = login), startup) try {
                observeStartupDispatch(eventName, "returned", packet2);
              } catch {
              }
              return result;
            };
            if (!descriptor || descriptor.configurable ? Object.defineProperty(target, "event", { value: wrapper, writable: !0, configurable: !0, enumerable: (descriptor == null ? void 0 : descriptor.enumerable) ?? !0 }) : "value" in descriptor && descriptor.writable && (target.event = wrapper), target.event !== wrapper) throw new Error("\u4E8B\u4EF6\u5165\u53E3\u4E0D\u53EF\u5199");
            entry.wrapper = wrapper, (_b2 = native.get(target)) == null || _b2.release();
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
    return check(), sceneWatch ? scope.add(sceneWatch.watch(check, 500, !0)) : scope.interval(check, 500), scope.add(() => {
      clearTimeout(expiryTimer), clearTimeout(drainTimer), loginIdentity = void 0, pending.length = 0;
      for (let resolve of waiters.splice(0)) resolve();
      duplicates.clear();
      for (let release of restores.reverse()) release();
      restoreCurrent == null || restoreCurrent(), native.clear();
    }), {
      check,
      getLoginAccount,
      get error() {
        return native.size ? "" : [consoleError, ...nativeErrors].filter(Boolean).join("\uFF1B");
      },
      flush: () => scope.closed || !pending.length && !draining ? Promise.resolve() : new Promise((resolve) => {
        waiters.push(resolve), schedule();
      }),
      getStatus: () => ({ ...stats, pending: pending.length, targets: [...native.values()].map((entry) => entry.name), errors: [consoleError, ...nativeErrors].filter(Boolean) })
    };
  }
  var LEGACY_CARD_STYLES = /* @__PURE__ */ new Map([
    ["native-cards.classic", "card-styles-extra.native-classic"],
    ["native-cards.general", "card-styles-extra.native-general"],
    ["gold-cards.classic", "card-styles-extra.gold"],
    ["yjcm-cards.miao", "card-styles-extra.miao"],
    ["yjcm-cards.zhuzhuxia", "card-styles-extra.zhuzhuxia"],
    ["dafeiyu-cards.beta", "card-styles-extra.dafeiyu"]
  ]), HASH = /^[a-f0-9]{64}$/, INLINE_IMAGE = /^data:image\/(?:png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
  function validInlineImage(value, limit2) {
    return typeof value == "string" && value.length <= limit2 && INLINE_IMAGE.test(value);
  }
  function resource(value) {
    if ((value == null ? void 0 : value.fallbackUrls) !== void 0 && (!Array.isArray(value.fallbackUrls) || value.fallbackUrls.length > 3)) throw new Error("\u5361\u56FE\u5907\u7528\u5730\u5740\u6700\u591A 3 \u4E2A");
    let urls = [value == null ? void 0 : value.url, ...(value == null ? void 0 : value.fallbackUrls) || []].map((address) => {
      let url = new URL(address);
      if (!(url.protocol === "http:" && url.hostname === "127.0.0.1") && url.protocol !== "https:" || url.username || url.password || url.hash || !HASH.test(value == null ? void 0 : value.sha256)) throw new Error("\u5361\u56FE\u8D44\u6E90\u987B\u4E3A HTTPS \u6216\u672C\u673A 127.0.0.1 \u5730\u5740\u5E76\u58F0\u660E SHA-256");
      return url.href;
    });
    if (new Set(urls).size !== urls.length) throw new Error("\u5361\u56FE\u5907\u7528\u5730\u5740\u4E0D\u80FD\u91CD\u590D");
    return Object.freeze({ url: urls[0], sha256: value.sha256, fallbackUrls: Object.freeze(urls.slice(1)) });
  }
  function validateCardAtlas(value) {
    if (!value || !Array.isArray(value.pages) || !value.pages.length || value.pages.length > 4 || typeof value.source != "string" || !value.source.trim() || value.source.length > 500) throw new Error("\u5361\u56FE\u6765\u6E90\u6216\u56FE\u7247\u6E05\u5355\u65E0\u6548");
    if (value.backImage !== void 0 && !validInlineImage(value.backImage, 1024 * 1024)) throw new Error("\u5361\u80CC\u987B\u4E3A\u4E0D\u8D85\u8FC7 1 MiB \u7684\u5185\u5D4C PNG \u6216 WebP");
    let pixelRatio = value.pixelRatio ?? 1;
    if (!Number.isInteger(pixelRatio) || pixelRatio < 1 || pixelRatio > 3) throw new Error("\u5361\u56FE\u50CF\u7D20\u500D\u7387\u987B\u4E3A 1\u30012 \u6216 3");
    if (value.previewImage !== void 0 && !validInlineImage(value.previewImage, 160 * 1024)) throw new Error("\u5361\u9762\u9884\u89C8\u987B\u4E3A\u5185\u5D4C PNG \u6216 WebP\uFF0C\u4E14\u4E0D\u8D85\u8FC7 160 KiB");
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
    var _a2, _b2;
    if (!(index != null && index.frames) || typeof index.frames != "object" || Object.keys(index.frames).length > 2048) throw new Error("\u5361\u56FE\u7D22\u5F15\u65E0\u6548\u6216\u8D85\u9650");
    let names = (_b2 = (_a2 = index.meta) == null ? void 0 : _a2.image) == null ? void 0 : _b2.split(",");
    if (!names || names.length !== pages.length || names.some((name, i2) => name !== new URL(descriptor.pages[i2].url).pathname.split("/").at(-1))) throw new Error("\u5361\u56FE\u56FE\u7247\u6E05\u5355\u4E0D\u5339\u914D");
    let result = /* @__PURE__ */ new Map(), ratio = descriptor.pixelRatio ?? 1, width = 135 * ratio, height = 190 * ratio;
    for (let [key, item] of Object.entries(index.frames)) {
      if (!/^[A-Za-z][A-Za-z0-9_]{0,95}_png\.png$/.test(key) || item.rotated || item.trimmed) continue;
      let f = item.frame, size = item.sourceSize, offset = item.spriteSourceSize, page = pages[(f == null ? void 0 : f.idx) ?? 0];
      if (!f || !page || ![f.x, f.y, f.w, f.h, f.idx ?? 0].every(Number.isInteger) || f.x < 0 || f.y < 0 || f.w !== width || f.h !== height || (size == null ? void 0 : size.w) !== width || (size == null ? void 0 : size.h) !== height || (offset == null ? void 0 : offset.x) !== 0 || (offset == null ? void 0 : offset.y) !== 0 || f.x + f.w > page.width || f.y + f.h > page.height) continue;
      let { x: x2, y, w, h } = f, idx = f.idx ?? 0, label = typeof item.label == "string" && item.label.length <= 48 && !/[\u0000-\u001f\u007f]/.test(item.label) ? item.label.trim() : "";
      result.set(key, Object.freeze({ x: x2, y, w, h, idx, ...label ? { label } : {} }));
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
    let bytes2 = new Uint8Array(length), at = 0;
    for (let chunk of chunks)
      bytes2.set(chunk, at), at += chunk.length;
    if ([...new Uint8Array(await win.crypto.subtle.digest("SHA-256", bytes2))].map((n) => n.toString(16).padStart(2, "0")).join("") !== spec.sha256) throw new Error("\u5361\u56FE\u8D44\u6E90 SHA-256 \u4E0D\u5339\u914D\uFF1A" + spec.url);
    return bytes2;
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
        let bytes2 = await verifiedBytes(win, spec, signal, 8388608, timeoutMs);
        if (bytes2[0] !== 137 || String.fromCharCode(...bytes2.slice(1, 4)) !== "PNG") throw new Error("\u5361\u56FE\u4E0D\u662F PNG \u56FE\u7247");
        let dimensions = new DataView(bytes2.buffer, bytes2.byteOffset, bytes2.byteLength);
        if (bytes2.length < 24 || dimensions.getUint32(16) > 4096 || dimensions.getUint32(20) > 4096) throw new Error("\u5361\u56FE\u5C3A\u5BF8\u8D85\u9650");
        let bitmap = await win.createImageBitmap(new win.Blob([bytes2], { type: "image/png" }));
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
  var LOCAL_IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/bmp,.png,.jpg,.jpeg,.webp,.bmp";
  function imageType(bytes2) {
    let data = new DataView(bytes2), tag = (offset) => data.getUint32(offset);
    if (bytes2.byteLength >= 8 && tag(0) === 2303741511 && tag(4) === 218765834) {
      for (let offset = 8; offset + 12 <= bytes2.byteLength; ) {
        let chunk = tag(offset + 4);
        if (chunk === 1633899596) throw new Error("\u8BF7\u9009\u62E9\u9759\u6001\u56FE\u7247\uFF0C\u6682\u4E0D\u652F\u6301 APNG");
        if (chunk === 1229209940) return "image/png";
        offset += 12 + tag(offset);
      }
      throw new Error("PNG \u56FE\u7247\u5185\u5BB9\u4E0D\u5B8C\u6574");
    }
    if (bytes2.byteLength >= 21 && tag(0) === 1380533830 && tag(8) === 1464156752) {
      if (tag(12) === 1448097880 && data.getUint8(20) & 2) throw new Error("\u8BF7\u9009\u62E9\u9759\u6001\u56FE\u7247\uFF0C\u6682\u4E0D\u652F\u6301\u52A8\u6001 WebP");
      return "image/webp";
    }
    if (bytes2.byteLength >= 3 && data.getUint16(0) === 65496 && data.getUint8(2) === 255) return "image/jpeg";
    if (bytes2.byteLength >= 14 && data.getUint16(0) === 16973) return "image/bmp";
    throw new Error("\u8BF7\u9009\u62E9 PNG\u3001JPG\u3001WebP \u6216 BMP \u9759\u6001\u56FE\u7247");
  }
  async function withLocalImage(win, file, process2) {
    var _a2;
    if (!(file != null && file.size) || file.size > 20971520) throw new Error("\u8BF7\u9009\u62E9\u4E0D\u8D85\u8FC7 20 MB \u7684\u56FE\u7247\u6587\u4EF6");
    if (typeof file.arrayBuffer != "function" || !((_a2 = win.URL) != null && _a2.createObjectURL) || !win.Image) throw new Error("\u5F53\u524D\u73AF\u5883\u65E0\u6CD5\u8BFB\u53D6\u672C\u5730\u56FE\u7247");
    let bytes2 = await file.arrayBuffer(), type = imageType(bytes2), url = win.URL.createObjectURL(new win.Blob([bytes2], { type }));
    try {
      let image = new win.Image();
      if (await new Promise((resolve, reject) => {
        image.onload = resolve, image.onerror = () => reject(new Error("\u65E0\u6CD5\u6253\u5F00\u56FE\u7247\uFF0C\u6587\u4EF6\u53EF\u80FD\u5DF2\u635F\u574F")), image.src = url;
      }), !(image.naturalWidth > 0 && image.naturalHeight > 0)) throw new Error("\u56FE\u7247\u5C3A\u5BF8\u65E0\u6548");
      return await process2(image, { bytes: bytes2, type });
    } finally {
      win.URL.revokeObjectURL(url);
    }
  }
  async function localImageTransaction(win, database, mode, operation, keyPath) {
    if (!win.indexedDB) throw new Error("\u5F53\u524D\u73AF\u5883\u65E0\u6CD5\u4FDD\u5B58\u672C\u5730\u56FE\u7247");
    let db = await new Promise((resolve, reject) => {
      let request = win.indexedDB.open(database, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("images", { autoIncrement: !0, keyPath }), request.onsuccess = () => resolve(request.result), request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise((resolve, reject) => {
        let tx = db.transaction("images", mode), request = operation(tx.objectStore("images"));
        tx.oncomplete = () => resolve(request.result), tx.onabort = () => reject(tx.error || new Error("\u672C\u5730\u56FE\u7247\u5B58\u50A8\u64CD\u4F5C\u5DF2\u4E2D\u6B62"));
      });
    } finally {
      db.close();
    }
  }
  function readLocalCardImage(win, file, width, height) {
    return withLocalImage(win, file, (image) => {
      var _a2;
      let ratio = width / height, cropWidth = Math.min(image.naturalWidth, image.naturalHeight * ratio), cropHeight = Math.min(image.naturalHeight, image.naturalWidth / ratio), canvas = win.document.createElement("canvas");
      canvas.width = width, canvas.height = height;
      let context2 = canvas.getContext("2d");
      context2.imageSmoothingQuality = "high", context2.drawImage(
        image,
        (image.naturalWidth - cropWidth) / 2,
        (image.naturalHeight - cropHeight) / 2,
        cropWidth,
        cropHeight,
        0,
        0,
        width,
        height
      );
      let url = canvas.toDataURL("image/webp", 0.92);
      if (!isLocalCardImageUrl(url)) throw new Error("\u65E0\u6CD5\u751F\u6210\u5361\u724C\u56FE\u7247");
      return { name: ((_a2 = file.name) == null ? void 0 : _a2.trim().slice(0, 160)) || "\u81EA\u5B9A\u4E49\u56FE\u7247", url };
    });
  }
  function isLocalCardImageUrl(url) {
    return typeof url == "string" && /^data:image\/(?:png|webp);base64,/.test(url);
  }
  var LOCAL_BACK_PREFIX = "local-card-back.", LOCAL_BACK_WIDTH = 372, LOCAL_BACK_HEIGHT = 520;
  function readLocalCardBack(win, file) {
    return readLocalCardImage(win, file, LOCAL_BACK_WIDTH, LOCAL_BACK_HEIGHT);
  }
  function localCardBackTransaction(win, mode, operation) {
    return localImageTransaction(win, "sgs-toolbox-card-backs", mode, operation, "id");
  }
  function localCardBack({ id, name, url }) {
    return !Number.isSafeInteger(id) || id <= 0 || typeof name != "string" || !isLocalCardImageUrl(url) ? null : Object.freeze({ id: LOCAL_BACK_PREFIX + id, name, localBackImage: url });
  }
  var LOCAL_FACE_STYLE = Object.freeze({ id: "local-card-face", name: "\u81EA\u5B9A\u4E49\u5361\u9762", localFace: !0 }), LOCAL_FACE_BACKGROUND_STYLE = Object.freeze({ id: "local-card-face-background", localFaceBackground: !0 }), LOCAL_FACE_WIDTH = 405, LOCAL_FACE_HEIGHT = 570, FACE_BACKGROUND_RECORD = "$background", localFaceKey = (card) => `${LOCAL_FACE_STYLE.id}.${card}`, COLOR = /^#[0-9a-f]{6}$/i, hasOwn = Object.prototype.hasOwnProperty, own = (node, key) => {
    var _a2;
    return node && (hasOwn.call(node, key) ? (_a2 = Object.getOwnPropertyDescriptor(node, key)) == null ? void 0 : _a2.value : void 0);
  }, CARD_LISTS = ["_children", "cardUis", "cardUIs", "cardUiList", "cardUIList", "virtualCardUis", "tempHandCardUis", "additionalCardUis", "muniuCardUis", "stateCardUis", "pileCardUis", "regionCardUIs", "seatUIs"], CARD_NODES = ["cardContainer", "seatContainer", "SelfSeatUi", "selfSeatUI", "desktopCardContainer", "discardCardContainer", "cardUi", "cardUI"], isCardUI = (node) => node && !node.destroyed && node.bmpFace && typeof node.SetCardFace == "function" && typeof node.getCardFaceBaseTexture == "function" && typeof node.updateNewCardFace == "function", NO_BOOK_FACES = Object.freeze([]);
  function flatCardForBitmap(bitmap, event) {
    var _a2;
    let handlers = (_a2 = own(bitmap, "_events")) == null ? void 0 : _a2[event];
    for (let handler of Array.isArray(handlers) ? handlers : [handlers]) {
      let ui = handler == null ? void 0 : handler.caller;
      if ((ui == null ? void 0 : ui.bmpFace) === bitmap && isCardUI(ui)) return ui;
    }
    return null;
  }
  function nativeCardResourceName(path) {
    var _a2;
    return typeof path == "string" ? (_a2 = /(?:^|\/)(card(?:Face|Back)_\d{1,5})(?:\.png)?(?:\?[^#]*)?$/.exec(path)) == null ? void 0 : _a2[1] : void 0;
  }
  function cardBookFaces(node, listType, detailType) {
    if (typeof detailType == "function" && node instanceof detailType) {
      let ui = own(own(node, "cardFace"), "cardUi");
      return isCardUI(ui) ? [ui] : NO_BOOK_FACES;
    }
    if (typeof listType != "function" || !(node instanceof listType)) return NO_BOOK_FACES;
    let panel = own(node, "panel"), count = panel == null ? void 0 : panel.numChildren;
    if (!Number.isInteger(count) || count < 1 || typeof panel.getChildAt != "function") return NO_BOOK_FACES;
    let result = [];
    for (let i2 = 0; i2 < Math.min(count, 2048); i2++) {
      let ui = own(own(panel.getChildAt(i2), "cardFace"), "cardUi");
      isCardUI(ui) && result.push(ui);
    }
    return result;
  }
  function findNativeCardTexture(L, name) {
    var _a2, _b2, _c, _d, _e, _f, _g;
    if (!/^card(?:Face|Back)_\d{1,5}$/.test(name)) return null;
    let valid = (t) => (t == null ? void 0 : t.bitmap) && !t.destroyed && !t.bitmap.destroyed && t.width > 0 && t.height > 0, direct = (_b2 = (_a2 = L == null ? void 0 : L.loader) == null ? void 0 : _a2.getRes) == null ? void 0 : _b2.call(_a2, name);
    if (valid(direct)) return direct;
    for (let cache2 of [(_c = L == null ? void 0 : L.Loader) == null ? void 0 : _c.textureMap, (_d = L == null ? void 0 : L.Loader) == null ? void 0 : _d.loadedMap, (_e = L == null ? void 0 : L.Loader) == null ? void 0 : _e._loadedMap]) {
      if (!cache2) continue;
      let keys = Object.keys(cache2), count = Math.min(keys.length, 6e4);
      for (let i2 = 0; i2 < count; i2++) {
        let key = keys[i2];
        if (!key.includes(name) || nativeCardResourceName(key) !== name) continue;
        let entry = cache2[key], texture = entry != null && entry.bitmap ? entry : (_g = (_f = L == null ? void 0 : L.loader) == null ? void 0 : _f.getRes) == null ? void 0 : _g.call(_f, key);
        if (valid(texture)) return texture;
      }
    }
    return null;
  }
  function drawCardStyle(doc, palette, back = !1) {
    let canvas = doc.createElement("canvas");
    canvas.width = 186, canvas.height = 260;
    let c = canvas.getContext("2d"), gradient = c.createLinearGradient(0, 0, 186, 260);
    if (gradient.addColorStop(0, palette.light), gradient.addColorStop(0.48, palette.base), gradient.addColorStop(1, palette.light), c.fillStyle = gradient, c.fillRect(0, 0, 186, 260), c.strokeStyle = palette.edge, c.lineWidth = 3, c.strokeRect(3, 3, 180, 254), c.lineWidth = 1, c.strokeRect(9, 9, 168, 242), back) {
      c.fillStyle = palette.ink, c.fillRect(15, 15, 156, 230), c.strokeStyle = palette.base, c.globalAlpha = 0.25;
      for (let x2 = -230; x2 < 190; x2 += 16)
        c.beginPath(), c.moveTo(Math.max(16, x2), Math.max(16, 16 - x2)), c.lineTo(Math.min(170, x2 + 230), Math.min(244, 244 + x2)), c.stroke();
      c.globalAlpha = 1, c.lineWidth = 2, c.beginPath(), c.moveTo(93, 60), c.lineTo(145, 130), c.lineTo(93, 200), c.lineTo(41, 130), c.closePath(), c.fill(), c.stroke(), c.beginPath(), c.arc(93, 130, 32, 0, Math.PI * 2), c.stroke(), c.fillStyle = palette.light, c.font = "bold 35px serif", c.textAlign = "center", c.textBaseline = "middle", c.fillText("\u6740", 93, 131);
    } else {
      c.fillStyle = palette.light, c.globalAlpha = 0.65, c.fillRect(13, 13, 160, 234), c.globalAlpha = 1;
      for (let [x2, y, dx, dy] of [[15, 15, 1, 1], [171, 15, -1, 1], [15, 245, 1, -1], [171, 245, -1, -1]])
        c.beginPath(), c.moveTo(x2, y + dy * 16), c.lineTo(x2, y), c.lineTo(x2 + dx * 16, y), c.stroke();
    }
    return canvas;
  }
  var CardStyleRegistry = class {
    constructor({ window: win, document: doc, game, settings, scope, sceneWatch }) {
      Object.assign(this, { win, doc, game, settings, scope }), this.styles = /* @__PURE__ */ new Map(), this.listeners = /* @__PURE__ */ new Set(), this.textures = /* @__PURE__ */ new Map(), this.bindings = /* @__PURE__ */ new Map(), this.nativeResources = /* @__PURE__ */ new Map(), this.nativeAttempts = /* @__PURE__ */ new Map(), this.previews = /* @__PURE__ */ new WeakMap(), this.factories = /* @__PURE__ */ new Map(), this.pools = /* @__PURE__ */ new Map(), this.insertions = /* @__PURE__ */ new Map(), this.selfModels = /* @__PURE__ */ new WeakSet(), this.selfIds = /* @__PURE__ */ new Set(), this.selfHand = null, this.bookFaces = /* @__PURE__ */ new WeakSet(), this.scene = null, this.atlases = /* @__PURE__ */ new Map(), this.images = /* @__PURE__ */ new Map(), this.previewAtlasId = "", this.localBacks = /* @__PURE__ */ new Map(), this.localFaces = /* @__PURE__ */ new Map(), this.localFaceCatalog = null, this.localFaceCatalogPending = null, this.localFaceCatalogError = "", this.localFaceBackground = null, this.status = "\u8DDF\u968F\u6E38\u620F\u539F\u59CB\u5916\u89C2", this.closed = !1;
      let refreshNative = () => this.refreshNative();
      sceneWatch ? scope.add(sceneWatch.watch(refreshNative, 400)) : scope.interval(refreshNative, 400), game.onSceneChange && scope.add(game.onSceneChange(() => this.queueRefresh())), scope.add(() => {
        this.closed = !0, this.restore(), this.clearTextures(), this.nativeResources.clear(), this.nativeAttempts.clear(), this.localBacks.clear(), this.localFaces.clear(), this.localFaceBackground = null, this.listeners.clear();
      }), this.localBacksReady = win.indexedDB ? this.loadLocalBacks() : Promise.resolve(), this.localFacesReady = win.indexedDB ? this.loadLocalFaces() : Promise.resolve();
    }
    register(style2, owner) {
      var _a2, _b2;
      if (this.closed) return () => {
      };
      if (!((_a2 = style2 == null ? void 0 : style2.id) != null && _a2.startsWith(owner + ".")) || !/^[a-z][a-z0-9.-]{0,63}$/.test(style2.id) || this.styles.has(style2.id)) throw new Error("\u5361\u724C\u6837\u5F0F ID \u65E0\u6548\u6216\u5DF2\u6CE8\u518C");
      if (style2.id.startsWith(LOCAL_BACK_PREFIX) || style2.id.startsWith(LOCAL_FACE_STYLE.id + ".")) throw new Error("\u6B64 ID \u4FDD\u7559\u7ED9\u672C\u5730\u5361\u724C\u5916\u89C2");
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
          if (!COLOR.test((_b2 = style2[side]) == null ? void 0 : _b2[key])) throw new Error("\u5361\u724C\u6837\u5F0F\u989C\u8272\u987B\u4E3A\u516D\u4F4D\u5341\u516D\u8FDB\u5236\u503C");
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
    listLocalBacks() {
      return [...this.localBacks.values()];
    }
    async loadLocalBacks() {
      try {
        let rows = await localCardBackTransaction(this.win, "readonly", (store) => store.getAll());
        if (this.closed) return;
        for (let row of rows) {
          let style2 = localCardBack(row);
          style2 && this.localBacks.set(style2.id, style2);
        }
      } catch (error) {
        this.closed || (this.localBackError = "\u8BFB\u53D6\u672C\u5730\u5361\u80CC\u5931\u8D25\uFF1A" + error.message);
      }
      this.closed || (this.refreshNative(), this.emit());
    }
    async importLocalBack(file) {
      let image = await readLocalCardBack(this.win, file);
      if (await this.localBacksReady, this.closed) return;
      let id = await localCardBackTransaction(this.win, "readwrite", (store) => store.add(image));
      if (this.closed) return;
      let style2 = localCardBack({ id, ...image });
      this.localBacks.set(style2.id, style2);
      try {
        this.selectSide("back", style2.id);
      } catch (error) {
        throw this.emit(), new Error("\u56FE\u7247\u5DF2\u4FDD\u5B58\uFF0C\u9009\u7528\u5931\u8D25\uFF1A" + error.message);
      }
    }
    async deleteLocalBack(id) {
      if (this.closed || !this.localBacks.has(id)) return;
      let key = Number(id.slice(LOCAL_BACK_PREFIX.length));
      if (await localCardBackTransaction(this.win, "readwrite", (store) => store.delete(key)), !this.closed) {
        this.localBacks.delete(id);
        try {
          this.selection.back === id && this.settings.set("cardBackStyle", "");
        } finally {
          this.restore(), this.clearTextures(id), this.refreshNative(), this.emit();
        }
      }
    }
    localFaceTransaction(mode, operation) {
      return localImageTransaction(this.win, "sgs-toolbox-card-faces", mode, operation, "card");
    }
    async loadLocalFaces() {
      try {
        let rows = await this.localFaceTransaction("readonly", (store) => store.getAll());
        if (this.closed) return;
        for (let row of rows)
          typeof row.name != "string" || !isLocalCardImageUrl(row.url) || (row.card === FACE_BACKGROUND_RECORD ? this.localFaceBackground = Object.freeze(row) : cardFrameName(row.card) && typeof row.label == "string" && this.localFaces.set(row.card, Object.freeze(row)));
      } catch (error) {
        this.closed || (this.localFaceError = "\u8BFB\u53D6\u672C\u5730\u5361\u9762\u5931\u8D25\uFF1A" + error.message);
      }
      this.closed || (this.refreshNative(), this.emit());
    }
    listLocalFaces() {
      return [...this.localFaces.values()];
    }
    loadLocalFaceCatalog() {
      var _a2, _b2;
      if (this.closed || this.localFaceCatalog || this.localFaceCatalogPending) return;
      let existing = (_b2 = (_a2 = this.game).getCardFaceCatalog) == null ? void 0 : _b2.call(_a2);
      if (existing) {
        this.localFaceCatalog = existing, this.localFaceCatalogError = "", this.emit();
        return;
      }
      this.game.loadCardFaceCatalog && (this.localFaceCatalogError = "", this.localFaceCatalogPending = this.game.loadCardFaceCatalog().then((catalog) => {
        !this.closed && !this.localFaceCatalog && (this.localFaceCatalog = catalog);
      }, (error) => {
        !this.closed && !this.localFaceCatalog && (this.localFaceCatalogError = "\u8BFB\u53D6\u6E38\u620F\u724C\u8868\u5931\u8D25\uFF1A" + error.message);
      }).finally(() => {
        this.localFaceCatalogPending = null, this.closed || this.emit();
      }), this.emit());
    }
    async importLocalFace(card, file) {
      var _a2, _b2, _c;
      let label = ((_b2 = (_a2 = this.localFaceCatalog) == null ? void 0 : _a2.find((item) => item.res === card)) == null ? void 0 : _b2.label) || ((_c = this.localFaces.get(card)) == null ? void 0 : _c.label);
      if (!label) throw new Error("\u8BF7\u9009\u62E9\u724C\u540D");
      let image = await readLocalCardImage(this.win, file, LOCAL_FACE_WIDTH, LOCAL_FACE_HEIGHT);
      if (await this.localFacesReady, this.closed) return;
      let row = Object.freeze({ card, label, ...image });
      await this.localFaceTransaction("readwrite", (store) => store.put(row)), !this.closed && (this.localFaces.set(card, row), this.refreshLocalImage(localFaceKey(card)));
    }
    async deleteLocalFace(card) {
      this.closed || !this.localFaces.has(card) || (await this.localFaceTransaction("readwrite", (store) => store.delete(card)), !this.closed && (this.localFaces.delete(card), this.refreshLocalImage(localFaceKey(card))));
    }
    async importLocalFaceBackground(file) {
      let image = await readLocalCardImage(this.win, file, LOCAL_FACE_WIDTH, LOCAL_FACE_HEIGHT);
      if (await this.localFacesReady, this.closed) return;
      let row = Object.freeze({ card: FACE_BACKGROUND_RECORD, ...image });
      await this.localFaceTransaction("readwrite", (store) => store.put(row)), !this.closed && (this.localFaceBackground = row, this.refreshLocalImage(LOCAL_FACE_BACKGROUND_STYLE.id));
    }
    async deleteLocalFaceBackground() {
      this.closed || !this.localFaceBackground || (await this.localFaceTransaction("readwrite", (store) => store.delete(FACE_BACKGROUND_RECORD)), !this.closed && (this.localFaceBackground = null, this.refreshLocalImage(LOCAL_FACE_BACKGROUND_STYLE.id)));
    }
    refreshLocalImage(key) {
      let previous = [];
      for (let [textureKey, texture] of this.textures)
        textureKey.startsWith(key + ":") && (this.textures.delete(textureKey), previous.push(texture));
      this.clearTextures(key), this.refreshNative();
      for (let texture of previous) texture.destroy(!0);
      this.emit();
    }
    resolveStyleId(id) {
      let mergedId = LEGACY_CARD_STYLES.get(id);
      if (!mergedId || this.styles.has(id) || !this.styles.has(mergedId)) return id;
      let inactive = this.settings.get("inactiveLegacyCardPacks", []);
      return Array.isArray(inactive) && inactive.includes(id.split(".")[0]) ? id : mergedId;
    }
    get current() {
      return this.resolveStyleId(this.settings.get("cardStyle", ""));
    }
    get selection() {
      return {
        face: this.resolveStyleId(this.settings.get("cardFaceStyle", this.current)),
        back: this.resolveStyleId(this.settings.get("cardBackStyle", this.current)),
        scope: this.settings.get("cardStyleScope", "all")
      };
    }
    styleFor(side, id = this.selection[side]) {
      return side === "face" && id === LOCAL_FACE_STYLE.id ? LOCAL_FACE_STYLE : side === "face" && id === LOCAL_FACE_BACKGROUND_STYLE.id ? LOCAL_FACE_BACKGROUND_STYLE : (side === "back" ? this.localBacks.get(id) : null) || this.styles.get(this.resolveStyleId(id));
    }
    selectSide(side, id) {
      if (!["face", "back"].includes(side)) throw new Error("\u65E0\u6548\u5361\u724C\u9762");
      let style2 = this.styleFor(side, id);
      if (id && !style2) throw new Error("\u5361\u724C\u6837\u5F0F\u5C1A\u672A\u542F\u7528");
      if (side === "back" && style2 != null && style2.atlas && !style2.atlas.backImage) throw new Error("\u6B64\u5957\u88C5\u4EC5\u63D0\u4F9B\u5361\u9762");
      this.settings.set(side === "face" ? "cardFaceStyle" : "cardBackStyle", id), this.restore(), this.refreshNative(), this.emit();
    }
    selectScope(value) {
      if (!["self", "all"].includes(value)) throw new Error("\u65E0\u6548\u5E94\u7528\u8303\u56F4");
      this.settings.set("cardStyleScope", value), this.restore(), this.refreshNative(), this.emit();
    }
    cardId(card) {
      return (card == null ? void 0 : card.CardId) ?? (card == null ? void 0 : card.CardID) ?? (card == null ? void 0 : card.id);
    }
    rememberSelf(card) {
      if (!card || typeof card != "object") return;
      this.selfModels.add(card);
      let id = this.cardId(card);
      Number.isInteger(id) && id > 0 && this.selfIds.add(id);
    }
    isSelfCard(ui) {
      var _a2, _b2, _c, _d, _e, _f;
      let card = ui.theCard;
      return ((_b2 = (_a2 = this.selfHand) == null ? void 0 : _a2.cardUis) != null && _b2.includes(ui) || (_d = (_c = this.selfHand) == null ? void 0 : _c.cardUIs) != null && _d.includes(ui) || (_f = (_e = this.selfHand) == null ? void 0 : _e.cardUiList) != null && _f.includes(ui)) && this.rememberSelf(card), this.selfModels.has(card) || this.selfIds.has(this.cardId(card));
    }
    select(id) {
      var _a2;
      if (id = this.resolveStyleId(id), id && !this.styles.has(id)) throw new Error("\u5361\u724C\u6837\u5F0F\u5C1A\u672A\u542F\u7528");
      this.settings.set("cardStyle", id), this.settings.set("cardFaceStyle", id), (!((_a2 = this.styles.get(id)) != null && _a2.atlas) || this.styles.get(id).atlas.backImage) && this.settings.set("cardBackStyle", id), this.restore(), this.refreshNative(), this.emit();
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
    queueRefresh(emit = !1) {
      this.closed || (this.refreshNeedsEmit ||= emit, !this.refreshQueued && (this.refreshQueued = !0, queueMicrotask(() => {
        let notify = this.refreshNeedsEmit;
        this.refreshQueued = !1, this.refreshNeedsEmit = !1, !this.closed && (this.refreshNative(), notify && !this.closed && this.emit());
      })));
    }
    clearTextures(id) {
      var _a2;
      for (let [key, image] of this.images) (!id || key === id) && (image.onload = image.onerror = null, image.src = "", this.images.delete(key));
      for (let [key, entry] of this.atlases) (!id || key === id) && (entry.controller.abort(), (_a2 = entry.data) == null || _a2.dispose(), this.atlases.delete(key));
      for (let [key, texture] of this.textures) (!id || key === id || key.startsWith(id + ":")) && (texture.destroy(!0), this.textures.delete(key));
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
      var _a2;
      let id = this.selection.face;
      (_a2 = this.atlases.get(id)) != null && _a2.error && (this.clearTextures(id), this.refreshNative(), this.emit());
    }
    previewCardAtlas(id, { retry = !1 } = {}) {
      if (this.closed) return null;
      let style2 = this.styles.get(id), next = style2 != null && style2.atlas ? id : "", previous = this.previewAtlasId;
      if (this.previewAtlasId = next, previous && previous !== next && previous !== this.selection.face && previous !== this.selection.back && this.clearTextures(previous), !next) return null;
      let entry = this.atlases.get(next);
      return retry && entry != null && entry.error && this.clearTextures(next), this.ensureAtlas(style2);
    }
    atlasCanvas(style2, name) {
      var _a2;
      let data = (_a2 = this.atlases.get(style2.id)) == null ? void 0 : _a2.data, frame = data == null ? void 0 : data.frames.get(cardFrameName(name));
      if (!frame) return null;
      let canvas = this.doc.createElement("canvas");
      return canvas.width = frame.w, canvas.height = frame.h, canvas.getContext("2d").drawImage(data.pages[frame.idx], frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h), canvas;
    }
    atlasTexture(style2, ui, size) {
      var _a2, _b2;
      if (ui.isNewCardUI !== !0 && ui.IsYiCard) return null;
      let name = (_a2 = ui.theCard) == null ? void 0 : _a2.ResName, frame = cardFrameName(name);
      if (!frame || style2.atlas.replaceCards && !style2.atlas.replaceCards.includes(name)) return null;
      let width = (size == null ? void 0 : size.width) || 93, height = (size == null ? void 0 : size.height) || 130, key = style2.id + ":card:" + frame + ":" + width + "x" + height;
      if (!this.textures.has(key)) {
        let canvas = this.atlasCanvas(style2, name);
        if (!canvas) return null;
        let bitmap = new this.win.Laya.Texture2D(canvas.width, canvas.height, ((_b2 = this.win.Laya.TextureFormat) == null ? void 0 : _b2.R8G8B8A8) ?? 1, !1);
        bitmap.loadImageSource(canvas, !0);
        let texture = new this.win.Laya.Texture(bitmap);
        texture.width = texture.sourceWidth = width, texture.height = texture.sourceHeight = height, this.textures.set(key, texture);
      }
      return this.textures.get(key);
    }
    nativeTexture(name, immediate = !1) {
      var _a2;
      let cached = this.nativeResources.get(name);
      if (cached && !cached.destroyed && !((_a2 = cached.bitmap) != null && _a2.destroyed)) return cached;
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
      if (style2.localFace || style2.localFaceBackground) return null;
      if (style2.localBackImage || style2.atlas) {
        if (back) {
          let src = style2.localBackImage || style2.atlas.backImage;
          if (!src) return null;
          let image = this.doc.createElement("img");
          return image.src = src, image.alt = "", image.width = 135, image.height = 190, image;
        }
        if (style2.localBackImage) return null;
        if (style2.atlas.previewImage) {
          let image = this.doc.createElement("img");
          return image.src = style2.atlas.previewImage, image.alt = "", image.width = 135, image.height = 190, image;
        }
        return this.atlasCanvas(style2, style2.atlas.preview);
      }
      if (!style2.native) return drawCardStyle(this.doc, back ? style2.back : style2.face, back);
      let texture = this.nativeTexture(style2.native[back ? "back" : "face"]);
      if (!(texture != null && texture.getTexturePixels)) return null;
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
    imageFor(id, url) {
      let image = this.images.get(id);
      if (!image) {
        image = new this.win.Image(), this.images.set(id, image);
        let update = () => {
          !this.closed && this.images.get(id) === image && this.queueRefresh(!0);
        };
        image.onload = image.onerror = update, image.src = url;
      }
      return image;
    }
    imageTexture(key, image, width, height, size) {
      var _a2;
      if (!image.complete || image.naturalWidth !== width || image.naturalHeight !== height) return null;
      if (!this.textures.has(key)) {
        let bitmap = new this.win.Laya.Texture2D(width, height, ((_a2 = this.win.Laya.TextureFormat) == null ? void 0 : _a2.R8G8B8A8) ?? 1, !1);
        bitmap.loadImageSource(image, !0);
        let texture = new this.win.Laya.Texture(bitmap);
        texture.width = texture.sourceWidth = size.width || 93, texture.height = texture.sourceHeight = size.height || 130, this.textures.set(key, texture);
      }
      return this.textures.get(key);
    }
    localFaceTexture(ui, size) {
      var _a2;
      if (ui.isNewCardUI !== !0 && ui.IsYiCard) return null;
      let card = (_a2 = ui.theCard) == null ? void 0 : _a2.ResName, local = this.localFaces.get(card);
      return local ? this.localFaceImageTexture(localFaceKey(card), local.url, size) : null;
    }
    localFaceImageTexture(id, url, size) {
      let image = this.imageFor(id, url);
      return this.imageTexture(`${id}:${size.width || 93}x${size.height || 130}`, image, LOCAL_FACE_WIDTH, LOCAL_FACE_HEIGHT, size);
    }
    texture(style2, back, immediate = !1) {
      var _a2;
      if (style2.localBackImage || style2.atlas) {
        if (!back || !style2.localBackImage && !style2.atlas.backImage) return null;
        let image = this.imageFor(style2.id, style2.localBackImage || style2.atlas.backImage), width = style2.localBackImage ? LOCAL_BACK_WIDTH : 405, height = style2.localBackImage ? LOCAL_BACK_HEIGHT : 570;
        return this.imageTexture(style2.id + ":back", image, width, height, {});
      }
      if (style2.native) return this.nativeTexture(style2.native[back ? "back" : "face"], immediate);
      let key = style2.id + ":" + back;
      if (!this.textures.has(key)) {
        let canvas = drawCardStyle(this.doc, back ? style2.back : style2.face, back), bitmap = new this.win.Laya.Texture2D(canvas.width, canvas.height, ((_a2 = this.win.Laya.TextureFormat) == null ? void 0 : _a2.R8G8B8A8) ?? 1, !1);
        bitmap.loadImageSource(canvas, !0);
        let texture = new this.win.Laya.Texture(bitmap);
        texture.width = 93, texture.height = 130, this.textures.set(key, texture);
      }
      return this.textures.get(key);
    }
    restore() {
      var _a2;
      for (let local of [...this.factories.values(), ...this.pools.values(), ...this.insertions.values()]) local.dispose();
      this.factories.clear(), this.pools.clear(), this.insertions.clear(), (_a2 = this.nativeLoaderScope) == null || _a2.dispose(), this.nativeLoaderScope = null, this.nativeLoader = null;
      for (let b of this.bindings.values()) b.release();
      this.bindings.clear(), this.bookFaces = /* @__PURE__ */ new WeakSet();
    }
    bindCard(ui, immediate = !1) {
      if (!(this.closed || !["face", "back"].some((side) => this.styleFor(side)) || !isCardUI(ui))) {
        if (!this.bindings.has(ui)) {
          let local = new ResourceScope(), binding = { original: ui.bmpFace.texture, applied: null, layers: /* @__PURE__ */ new Map() }, flush = (node) => {
            node != null && node.render && typeof node.update == "function" && node.update();
          };
          binding.restoreLayers = () => {
            for (let [node, visible] of binding.layers) !node.destroyed && node.visible === !1 && (node.visible = visible, flush(node));
            binding.layers.clear();
          }, binding.apply = (force) => {
            var _a2, _b2, _c, _d, _e;
            let card = ui.theCard, style2 = this.styleFor(card != null && card.IsEmpty ? "back" : "face"), bookPreview = (style2 == null ? void 0 : style2.atlas) && !(card != null && card.IsEmpty) && this.bookFaces.has(ui), eligible = style2 && card && (this.selection.scope === "all" || this.isSelfCard(ui) || bookPreview) && !ui.isPokerCardFace && !ui.dontUpdateCard && (card.IsEmpty || ui.isNewCardUI === !0 || style2.atlas || style2.localFace);
            ui.bmpFace.texture !== binding.applied && (binding.original = ui.bmpFace.texture);
            let dimension = (...values) => values.find((value) => Number.isFinite(value) && value > 0 && value <= 4096), size = {
              width: dimension(ui.width, (_a2 = binding.original) == null ? void 0 : _a2.width, ui.bmpFace.width),
              height: dimension(ui.height, (_b2 = binding.original) == null ? void 0 : _b2.height, ui.bmpFace.height)
            }, texture = null;
            if (eligible && !binding.special)
              if (style2.localFace) texture = this.localFaceTexture(ui, size);
              else if (style2.localFaceBackground) {
                let image = this.localFaceBackground;
                image && (texture = this.localFaceImageTexture(style2.id, image.url, size));
              } else style2.atlas && !card.IsEmpty ? texture = this.atlasTexture(style2, ui, size) : texture = this.texture(style2, !!card.IsEmpty, force);
            if (binding.reason = style2 ? eligible ? binding.special ? "\u539F\u751F\u6307\u5B9A\u7279\u6B8A\u5361\u56FE" : texture ? "" : ui.isNewCardUI !== !0 && ui.IsYiCard ? "\u5F02\u724C\u4E13\u7528\u5361\u56FE" : (_c = style2.atlas) != null && _c.replaceCards && !style2.atlas.replaceCards.includes(card == null ? void 0 : card.ResName) && (_e = (_d = this.atlases.get(style2.id)) == null ? void 0 : _d.data) != null && _e.frames.has(cardFrameName(card == null ? void 0 : card.ResName)) ? "\u4E0E\u9ED8\u8BA4\u5361\u9762\u76F8\u540C\uFF0C\u4FDD\u7559\u539F\u751F" : style2.atlas ? `\u65E0\u540C\u540D\u5361\u56FE\uFF1A${String((card == null ? void 0 : card.ResName) || "\u7A7A\u8D44\u6E90\u540D").slice(0, 96)}` : "\u8D44\u6E90\u672A\u5C31\u7EEA" : "\u8303\u56F4\u6216\u539F\u751F\u663E\u793A\u9650\u5236" : "\u8DDF\u968F\u6E38\u620F", !texture) {
              ui.bmpFace.texture === binding.applied && (ui.bmpFace.texture = binding.original), binding.applied = null, binding.restoreLayers();
              return;
            }
            if (style2.atlas || style2.localFace) for (let key of ["bmpFace2", "bmpName", "bmpNameBg", "bmpNormalName", "bmpCardType", "bmpSmallDesc"]) {
              let node = ui[key];
              node && (binding.layers.has(node) || binding.layers.set(node, node.visible), node.visible !== !1 && (node.visible = !1, flush(node)));
            }
            binding.applied = texture;
            let dirty = ui.bmpFace.texture !== texture || ui.bmpFace.invalidateUpdateFlag === !0;
            ui.bmpFace.texture = texture, dirty && flush(ui.bmpFace);
          };
          let registry = this, bitmap = ui.bmpFace, ownTexture = Object.getOwnPropertyDescriptor(bitmap, "texture"), textureOwner = bitmap, descriptor = ownTexture;
          for (; !descriptor && (textureOwner = Object.getPrototypeOf(textureOwner)); ) descriptor = Object.getOwnPropertyDescriptor(textureOwner, "texture");
          if (descriptor != null && descriptor.get && descriptor != null && descriptor.set && (ownTexture == null ? void 0 : ownTexture.configurable) !== !1) {
            let get2 = function() {
              return descriptor.get.call(this);
            }, set = function(value) {
              var _a2;
              let ordinary = value === binding.original || value === binding.applied;
              if (!ordinary && !binding.inNative && !binding.inApply && !binding.special && !registry.closed)
                try {
                  ordinary = value === ui.getCardFaceBaseTexture(((_a2 = ui.theCard) == null ? void 0 : _a2.Seat) || null);
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
              var _a2;
              ((_a2 = Object.getOwnPropertyDescriptor(bitmap, "texture")) == null ? void 0 : _a2.set) === set && (ownTexture ? Object.defineProperty(bitmap, "texture", ownTexture) : delete bitmap.texture);
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
            var _a2;
            local.dispose(), binding.restoreLayers(), !ui.destroyed && ((_a2 = ui.bmpFace) == null ? void 0 : _a2.texture) === binding.applied && (ui.bmpFace.texture = binding.original);
          }, this.bindings.set(ui, binding);
          let type = ui.constructor;
          for (let key of ["pool", "flatPool"]) {
            let pool = own(type, key);
            (pool == null ? void 0 : pool.T) === type && typeof pool.BorrowObject == "function" && this.hookPool(pool);
          }
        }
        this.applySafely(this.bindings.get(ui), immediate);
      }
    }
    applySafely(binding, immediate) {
      if (!(binding.inNative || binding.inApply)) {
        binding.inApply = !0;
        try {
          binding.apply(immediate), binding.error = "";
        } catch (error) {
          binding.error = error.message, binding.reason = "\u7EB9\u7406\u5E94\u7528\u5931\u8D25\uFF1A" + error.message, this.setStatus("\u5361\u724C\u5916\u89C2\u672A\u5E94\u7528\uFF1A" + error.message);
        } finally {
          binding.inApply = !1;
        }
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
        var _a2;
        return (_a2 = registry.bindings.get(card)) == null || _a2.release(), registry.bindings.delete(card), registry.bookFaces.delete(card), original.call(this, card, ...args);
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
      this.scanCards([root], (ui) => this.captureCard(ui));
    }
    watchInsertions(node) {
      var _a2;
      if (this.insertions.has(node) || !Object.isExtensible(node)) return;
      let children2 = ["addChild", "addChildAt"].filter((key) => typeof node[key] == "function"), draws = ["addDrawChild", "addDrawChildAt"].filter((key) => typeof node[key] == "function");
      if (!children2.length && !draws.length) return;
      let local = new ResourceScope(), registry = this;
      this.insertions.set(node, local);
      let patch = (key, wrap) => {
        try {
          local.patch(node, key, wrap);
        } catch {
        }
      };
      for (let key of children2) patch(key, (original) => function(child, ...args) {
        let result = original.call(this, child, ...args);
        if (!child || child === this || child.destroyed) return result;
        try {
          (this === registry.win.Laya.stage || this.name === "SceneLayer" || this.layerOrder === 2 || this === registry.scene) && (registry.syncScene(), registry.queueRefresh()), registry.captureBranch(child);
        } catch (error) {
          registry.setStatus("\u5361\u724C\u5916\u89C2\u672A\u5E94\u7528\uFF1A" + error.message);
        }
        return result;
      });
      let mouseDown = ((_a2 = this.win.Laya.Event) == null ? void 0 : _a2.MOUSE_DOWN) || "mousedown";
      for (let key of draws) patch(key, (original) => function(child, ...args) {
        let ui = flatCardForBitmap(child, mouseDown);
        return ui && (this === registry.selfHand && registry.rememberSelf(ui.theCard), registry.captureCard(ui)), original.call(this, child, ...args);
      });
    }
    scanCards(queue, onCard) {
      var _a2, _b2, _c, _d;
      let seen = /* @__PURE__ */ new Set(), listType = (_b2 = (_a2 = this.game).getClass) == null ? void 0 : _b2.call(_a2, "CardsBookWindow"), detailType = (_d = (_c = this.game).getClass) == null ? void 0 : _d.call(_c, "CardBookDetailWindow");
      for (let i2 = 0; i2 < queue.length && i2 < 6e3; i2++) {
        let node = queue[i2];
        if (!(!node || typeof node != "object" || seen.has(node) || node.destroyed)) {
          if (seen.add(node), isCardUI(node)) {
            onCard(node);
            continue;
          }
          this.watchInsertions(node), this.hookFactory(node);
          for (let ui of cardBookFaces(node, listType, detailType))
            this.bookFaces.add(ui), queue.push(ui);
          for (let key of CARD_LISTS) {
            let cards = own(node, key);
            if (Array.isArray(cards))
              for (let j = 0, count = Math.min(cards.length, 2048); j < count; j++) queue.push(cards[j]);
          }
          for (let key of CARD_NODES) {
            let value = own(node, key);
            value && queue.push(value);
          }
        }
      }
      return seen;
    }
    syncScene() {
      var _a2, _b2, _c, _d, _e, _f, _g;
      let scene = (_b2 = (_a2 = this.game).getScene) == null ? void 0 : _b2.call(_a2);
      scene !== this.scene && (this.scene = scene, this.selfModels = /* @__PURE__ */ new WeakSet(), this.selfIds.clear(), this.bookFaces = /* @__PURE__ */ new WeakSet());
      let seat = (_d = (_c = this.game).getSelfSeatUI) == null ? void 0 : _d.call(_c);
      this.selfHand = seat == null ? void 0 : seat.cardContainer;
      for (let ui of ((_e = this.selfHand) == null ? void 0 : _e.cardUis) || ((_f = this.selfHand) == null ? void 0 : _f.cardUIs) || ((_g = this.selfHand) == null ? void 0 : _g.cardUiList) || []) this.rememberSelf(ui.theCard);
      return seat;
    }
    discover(seat) {
      var _a2;
      let found = /* @__PURE__ */ new Set();
      this.bookFaces = /* @__PURE__ */ new WeakSet();
      let seen = this.scanCards([(_a2 = this.win.Laya) == null ? void 0 : _a2.stage, this.scene, seat], (ui) => found.add(ui));
      for (let ui of this.bindings.keys()) {
        let parent = own(ui, "drawParent");
        !ui.destroyed && seen.has(parent) && own(ui.bmpFace, "render") === parent && found.add(ui);
      }
      for (let hooks of [this.factories, this.insertions]) for (let [owner, local] of hooks)
        seen.has(owner) || (local.dispose(), hooks.delete(owner));
      return found;
    }
    watchNativeResources(face, back) {
      var _a2, _b2;
      let loader = face || back ? (_a2 = this.win.Laya) == null ? void 0 : _a2.Loader : null;
      if (this.nativeLoader === loader || ((_b2 = this.nativeLoaderScope) == null || _b2.dispose(), this.nativeLoader = loader, !loader)) return;
      let local = this.nativeLoaderScope = new ResourceScope(), registry = this;
      for (let key of ["cacheTexture", "cacheRes"])
        typeof loader[key] == "function" && local.patch(loader, key, (original) => function(path, ...args) {
          var _a3, _b3, _c, _d;
          let result = original.call(this, path, ...args), name = nativeCardResourceName(path);
          return name && (name === ((_b3 = (_a3 = registry.styleFor("face")) == null ? void 0 : _a3.native) == null ? void 0 : _b3.face) || name === ((_d = (_c = registry.styleFor("back")) == null ? void 0 : _c.native) == null ? void 0 : _d.back)) && (registry.nativeAttempts.delete(name), registry.queueRefresh()), result;
        });
    }
    refreshNative() {
      var _a2, _b2, _c, _d, _e, _f, _g, _h, _i;
      if (this.closed) return;
      let { face, back: backId } = this.selection, customFaceSelected = face === LOCAL_FACE_STYLE.id, backgroundId = LOCAL_FACE_BACKGROUND_STYLE.id, background = face === backgroundId ? this.localFaceBackground : null;
      for (let id of this.images.keys())
        id === backId || background && id === backgroundId || customFaceSelected && id.startsWith(LOCAL_FACE_STYLE.id + ".") || this.clearTextures(id);
      if (customFaceSelected && this.listeners.size) {
        let catalog = (_b2 = (_a2 = this.game).getCardFaceCatalog) == null ? void 0 : _b2.call(_a2);
        catalog && catalog !== this.localFaceCatalog && (this.localFaceCatalog = catalog, this.localFaceCatalogError = "", this.emit());
      }
      let selectedAtlas = this.styles.get(face);
      for (let id of this.atlases.keys())
        id !== (selectedAtlas == null ? void 0 : selectedAtlas.id) && id !== backId && id !== this.previewAtlasId && this.clearTextures(id);
      if (selectedAtlas != null && selectedAtlas.atlas && this.ensureAtlas(selectedAtlas), this.listeners.size) {
        let before = [...this.nativeResources.values()];
        for (let item of this.styles.values()) if (item.native) for (let name of Object.values(item.native)) this.nativeTexture(name);
        let after = [...this.nativeResources.values()];
        (before.length !== after.length || after.some((t, i2) => t !== before[i2])) && this.emit();
      }
      let back = this.styleFor("back"), backSource = (back == null ? void 0 : back.localBackImage) || ((_c = back == null ? void 0 : back.atlas) == null ? void 0 : _c.backImage), backImage = backSource ? this.imageFor(back.id, backSource) : null, faceImage = background ? this.imageFor(backgroundId, background.url) : null;
      if (customFaceSelected) for (let [card, row] of this.localFaces) this.imageFor(localFaceKey(card), row.url);
      if (!(back || selectedAtlas || faceImage || customFaceSelected && this.localFaces.size)) {
        this.restore(), this.setStatus(this.current ? "\u6240\u9009\u5957\u88C5\u5DF2\u505C\u7528\uFF0C\u5F53\u524D\u8DDF\u968F\u6E38\u620F" : "\u8DDF\u968F\u6E38\u620F\u539F\u59CB\u5916\u89C2");
        return;
      }
      if (!((_d = this.win.Laya) != null && _d.Texture2D) || !((_e = this.win.Laya) != null && _e.Texture)) {
        this.setStatus("\u7B49\u5F85\u6E38\u620F\u539F\u751F\u6E32\u67D3\u5668");
        return;
      }
      try {
        this.watchNativeResources((_f = selectedAtlas == null ? void 0 : selectedAtlas.native) == null ? void 0 : _f.face, (_g = back == null ? void 0 : back.native) == null ? void 0 : _g.back);
        let found = this.discover(this.syncScene());
        for (let [ui, binding] of this.bindings) found.has(ui) || (binding.release(), this.bindings.delete(ui));
        for (let ui of found)
          this.bindCard(ui);
        let waiting = [(_h = selectedAtlas == null ? void 0 : selectedAtlas.native) == null ? void 0 : _h.face, (_i = back == null ? void 0 : back.native) == null ? void 0 : _i.back].some((name) => name && !this.nativeTexture(name)), localStatus = backImage && (backImage.complete ? backImage.naturalWidth !== (back.localBackImage ? LOCAL_BACK_WIDTH : LOCAL_FACE_WIDTH) || backImage.naturalHeight !== (back.localBackImage ? LOCAL_BACK_HEIGHT : LOCAL_FACE_HEIGHT) ? "\u81EA\u5B9A\u4E49\u5361\u80CC\u52A0\u8F7D\u5931\u8D25\uFF0C\u5F53\u524D\u8DDF\u968F\u6E38\u620F\u5361\u80CC" : "" : "\u6B63\u5728\u52A0\u8F7D\u81EA\u5B9A\u4E49\u5361\u80CC"), backgroundStatus = faceImage && (faceImage.complete ? faceImage.naturalWidth !== LOCAL_FACE_WIDTH || faceImage.naturalHeight !== LOCAL_FACE_HEIGHT ? "\u5361\u9762\u5E95\u56FE\u52A0\u8F7D\u5931\u8D25\uFF0C\u5F53\u524D\u8DDF\u968F\u6E38\u620F\u5361\u9762" : "" : "\u6B63\u5728\u52A0\u8F7D\u5361\u9762\u5E95\u56FE"), atlas = this.atlases.get(selectedAtlas == null ? void 0 : selectedAtlas.id), prefix3 = atlas != null && atlas.error ? "\u5B8C\u6574\u5361\u9762\u52A0\u8F7D\u5931\u8D25\uFF0C\u5DF2\u4FDD\u7559\u6E38\u620F\u5916\u89C2\uFF1A" + atlas.error : atlas != null && atlas.loading ? "\u6B63\u5728\u52A0\u8F7D\u5B8C\u6574\u5361\u9762\uFF0C\u5F53\u524D\u4FDD\u7559\u6E38\u620F\u5916\u89C2" : null, faces = atlas != null && atlas.data ? [...this.bindings].filter(([ui]) => {
          var _a3;
          return !((_a3 = ui.theCard) != null && _a3.IsEmpty);
        }) : [], applied = faces.filter(([ui, b]) => b.applied && !b.reason && !b.error && ui.bmpFace.texture === b.applied).length, fallback = [...new Set(faces.filter(([, b]) => b.reason).map(([, b]) => b.reason))], detail = atlas != null && atlas.data ? ` \xB7 \u5B8C\u6574\u5361\u9762 R3 \u5DF2\u66FF\u6362 ${applied}/${faces.length}${fallback.length ? " \xB7 \u56DE\u9000\uFF1A" + fallback.join("\uFF1B") : ""}` : "";
        this.setStatus(prefix3 || backgroundStatus || localStatus || (waiting ? "\u7B49\u5F85\u5B98\u65B9\u5361\u9762\uFF0F\u5361\u80CC\u8D44\u6E90\u52A0\u8F7D\uFF0C\u5DF2\u5C31\u7EEA\u7684\u9762\u72EC\u7ACB\u5E94\u7528" : found.size ? `\u5DF2\u63A5\u5165 ${found.size} \u5F20\u539F\u751F\u5361\u724C \xB7 \u4EC5\u672C\u673A\u663E\u793A${detail}` : "\u5957\u88C5\u5DF2\u5C31\u7EEA\uFF0C\u7B49\u5F85\u539F\u751F\u5361\u724C\u51FA\u73B0"));
      } catch (error) {
        this.restore(), this.setStatus("\u5361\u724C\u5916\u89C2\u672A\u5E94\u7528\uFF1A" + error.message);
      }
    }
  }, CORE_VERSION = "0.6.306", REPLACED_APPEARANCE_PACKAGES = Object.freeze(["e2c8e04c364afd9ffaa53e56156c0590377d55151ff0b2e86248ab2032be824b", "7ef5c15f358262e51a2329f759097dfb987c5334b8a7fd3051d4a92db25f9815", "4ca6f3e6c66a2ab1395cc5112f61a3d6f034ad3efc9b3c86f00de3b739f86b58", "7bec5a6b883a24f2c1a2d0a13ed72acec8d6eb8e833ceb63f1c7658ea3f2e030", "53f94a22c97502e972edffd5b5124537e7ac1db802a7894199429eef2cf29335", "87df68acc195b8129a2491c70a8e267072588afe4abeeea2f9c6b95770b5faea"]), REPLACED_BAISHENG_PACKAGES = Object.freeze(["0a16a51e7d259d0eeabf566a3dd249a0c59e9258dde6691079fcfc8248a3b3f9", "1921ab510f12f1733711b40eaa7dacc0fa0aff8f28155e0b41dcc2415d0d628a"]), REPLACED_EFFECT_PACKAGES = Object.freeze(["03eb9e28e9ec775d3ceacfeb22d0ab8a3e19a0a8f707a7c07c1ca216e5c3afc5", "fce15684f99e3323fa3eefaa60df9b4c90bd85650248a3bac28875d32f8b93d7", "88d3c1037f3a54138f0cfa1134a3f125617ed18bf09a89b40b8824cee5561890", "539f036598d1e330a7131c912dc61ea09467153dfa2afc151494316eb700e717", "083214a3c8649667d30580a128b11e0992b6d7cd17debd125b30789f70271523", "a37337cd1ffac142bdda9a32a4836eb201fc6df8fdf9e684e713ab7681f7ada6"]), REPLACED_REWARD_PACKAGES = Object.freeze(["527539a0735f246222503c007436ced375c41b4d947baec94e9ed37b44ee8716", "1eaac52669cd397aa4c99807367bc313b4a79d17c0f97b773a297e6ebd13c3bb", "b5f2d99e5ba0f0a2560de36763deea20e4566c69057a6ed7de1a10452fb3fecc", "4263c63d08130fab8e1503600732eef86dc271ef31487471f25cf922aa2d3288", "9fd45a179f960d091e7eb2809c1f5d07083ece95de712ab555a63648134a7a45", "7e3632ff06f32fdffc4dcb8361df8d588b9bcd1ffd72517bd32f8a69cbc165c3", "e620754ebe4ccdf7548347f690fdb308050251ded636b9a69a729e0e367294ae", "0ac4bf9d6684cf1acdfc532bc0dbd3c98b89740fbd0e2139da217648ca3f4cf0", "60bdd051a1bf5768561ba2b8c5d8b812fb13c58785d4116d2fdaf68bc5b83b9d", "62c6b1d542d010db621f56903a1337ef26bfc786f765bb0109e52c08be42fb0e", "583f57d57f1bbb511c7a65e7d84c2a2aa8473d423397787d38c9c89f670046ad", "72ff62b4ba885edffb9feddb000944de79bdbda2a324faa858ab0fe2b5dfa2f3", "388c6ac86b1cb7e8c39fdb74df849628f7f009d3bf7b50eec0dda19f0b66544c", "73ef27a716f2b73718be28ab30d9651dcb10fb3cabe02e15415aecd31c40e6bd"]), REPLACED_CARD_PACKAGES = Object.freeze([
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
  ]), REPLACED_SKIN_PACKAGES = Object.freeze([
    "b990b29b6a9eafbe50ea3f820c2dd9753187de6a95aed91191786532cafd1b27",
    "d8065ccacfd2da8c39e1cf1eded8f743a85de717d6589833f679153ada9d89fa",
    "36a6458a5cc9c58ece0cedad1df6315e82aafb21ebe4a057e10db17c703a5827",
    "a9890597c627c6c703bcef0a79339fc6b8472d71f37e05b522117dcf6ac2481d",
    "d268def49f6f9fbd4b989545594e336886d1a86053d63b1bbdf3f638d1acf002",
    "5edda81bdbd06ad5ab60b8e564f554e10b1f9d13fa13d983f60ae734867d343c",
    "a257743d4091e677520f307b6df5a7f2938af7261183b2d57609dc4df41cdd8a",
    "bfcff0007de23af7439cfc60adbc0cf660bc84a094df360c6bf6f0a5fc812672",
    "b1b4516b854575ccb02219bd8cdf89332845263e8cced8f9c8738b6e7259eb1b",
    "9a5c003190086fa55d0b99d9f36d8831377c1f1b174f4dfe4b487ee5648c9410",
    "5f99dc882131e076134e4890fc536dfba0825e09dda844b76fe33e26c84266dd",
    "26604ac76a2ca04bbac4ffd27ebfc674f94bcb9d5e1d0af7ecf9faac9927f194",
    "994ca7d5088cc57d17e9a54114ec459a1cd2c8188a4460a678c121d0ffe49b17"
  ]), REPLACED_SHANHETU_PACKAGES = Object.freeze(["4f23523f68fb5e27f319a4312a728ffdf648b0049955dfeffead1651ec07e984", "e8f263b989b6cc8361d35240ac6f23dda39ab4d05ee209bdd1f41aff877e82c2", "6975e211a97b612ff61f8456eabe869547921f79c6c83e8885e398cd6be4460c", "03d3564fde594df3feb199cd5d7e323c3730dc1494546ad26cd375427a8accc2", "95c06e8921132548973e9c55b20c16ba06043218bbb090eaedd840191cbb08ff", "27d9af46ff339493cbb5bcc0b9e49e648661d9ed7becaf5704a75d0a3b83beae", "437a1ffb64a930e87264e69bcf91a856a1e82c066d732408c884182b4ce6e450", "523473559db6aa12043bb0bd0b22e0a232045d9defede4a2a6a9f3d562ad2133", "5577c02f3922100a434db7c45af19dc3db115866a1a841fc7218083f396b0acf", "ea751303a3e7ecd030d2c5a12a13dd125612f6b64ab41c641116fb763579b421", "55340baa7b51c8d97bdfbedc17209be719c2f05105501390b4028c47554cceeb", "980c908196ff62ac529ab2bfbdade42bef76930f43f534b1b075ead306c10fe2", "9017d32206a5b0e4e2eeede12e390767620579836ed7037e1e223f7ab0c52483", "dfc56a7a02dc4ab17e2f34e3e76862f615f5bf344c534921e8424498fd27b11b", "4d8aaf1df389a0420dfc65c4d5762757c2fe454cc0fbb127fe269b88c5a19af5", "e9f7b5ee0383a29799057f19f16e68e34d57fb7310066dc5d3af45456c7f0445", "997bcf58c5567e0e99829798b855c411d5e51ccad7b5f80e81c9ae84add2656d", "f304bd28030950096503a45d96013c3d7a9e2297ca6143b639b83dcb2d3e197a", "f2739ea490ecf8bee75b1dd6ae0050cc0ad0bc558515c30dbb3c6260e80eaa2f", "332272cc92d11796d8dd7d304560129277acd353726feed7cd1e5a5b6578937a", "bf4207ca6d84501c75f6ec24d094aca952224ce60367196482d6bd6815ca3423", "23d6e6f7bae844ee58a9239bb739fb0ab8d2e64b7766629bca492421bd07f400", "f226d8a8d247ce48c0664ba057ad9f961e7c953291ab7f805714979b7ea35825", "56d82efb93d6eaa0b24c0d5deb8693030f49a0b2fb5af0da49ef6f008943ee65", "674efd3ed6e5719ef9cdabea702b4d6d4394560b18aa5f1ad189486f7467910e", "8de4a53accd1548f58266d9854642462b4fdb089a9a0afcc0561ca725930966d", "95c5bf19558e19c3ef192f2f2022aff19908350e882885cf7855cfe9051801c0", "71fc7d79a3b8014d5f80edda50ea7f7dbba80589ec9c7a8f77bd080056d45175", "151c6e9a3651f5a2c6b7b52321a09c294220400a40385e248d47cb6bb46976c2", "6907320aa5d5e23403c5324926cabf8f48ad23df23afd9925ff5b63e96e87cc6", "4f23cce4d4372a13895716d47d9141acd4c9f13c2be199afff5599148e8349ae", "67362c2dee033a700472210cafc14cc1df351e9a5413273d04e3ff2ce566ce66", "fa6474a1c5170c9ba285f9487031e4b205245d527c97b5ba5f26d68f9bf889ff", "a1f400ad8c8d60f2e4c0b0f981acc8c2be2ab61d1fd6a45ef10b7a3621b05918", "a7595aeaee8cd16ad03b5871310fd7375ea73be7b3d6a1466e8770f9d052fc24", "b6be2108829186604d4a11fb00d63d08e081a1f13f950a715441146c07d26a47", "23077a7742fabceb968d15a85b20c292c37e7a4d6099cf5b9f40a43e59c5fb8a", "2f7654ffde27bed353412a69eb9c5f449270a5e94ff492531e61189825ec560d", "e58c1543240d60a88d2fa92a58ff06ffd30bb4f0d2e75a4a18ba5efad4316d20", "742b76de181ca851dfd0df036a282a3bdee634c61012e687574b7e50216e62e6", "16d2e6a72fbb2258cb1dd69359c34b6753eca73c061b1610d7764ec00068c571", "a78a544feab74eb6d9ddbe6af6662d012a43cd85b698698f4cbadec9dada824d", "d5ad4b8005751bfdfe8301c060e8ab460a2ebd3eb2196112c534e8c44647ba6f", "31ad175296a119402b4a4e90bec5a16cad8a85e9eca2f79e3ee3edf745f27fba", "15366eddcf79bd76dd0f11fa2fb1f393faec512502f0ca01bb9ab13d54238490", "438b0292399649be12f2c42723242d73915a381f8a9c42713b25815c29e57e8b", "44ba81e10e40db62f039946b7e0e18ae162d98e95a350b6ed7eedc2cf8df37ba", "2ff778bd021f4d83971551126ea532ea215ad30e9b0b3dfc0450a88a0de9781c", "6ebf9ca6499f5fbf9b46f4e918990924369359c1191fb62b9026519724ac88cc", "20dac8ad2d3873f7779e2add9d89eb19927b5db6c553563edb69a72afe593624", "cbff0d7705f6f847b39473baeae6c126a34850685d95956ca07bf09e0ea6ce40"]), REPLACED_THEME_PACKAGES = Object.freeze(["fabfb9cfc1c6f4c9eeeb69fcc4c9bc319f17d5c964624a616bd15b863c18c5aa", "db376fc6d5b9b878a2dd9bb6642f5d7a24dd5b226c658801aeead6249bc98094", "3589cd781d192c53790071a1775924d4a8ccab648272961a991e6e3bf6034abd"]), REPLACED_BACKGROUND_PACKAGES = Object.freeze(["488b63b7fb2c1d88ddee7bc4a858a09f1a5a7f1271be6f012d612936431cbebc", "7aa96fde03bf1a9d1f5d287c63d86f1c11365bf5fb980bfd9d812b76f9543dd5", "1ebfbcaa2a4e5a2b3112f37aa0d48ce66b355d4a0934b1ff5310916427555b60", "f52fec744b48f472e3db4aa9cbf9e03864d996ba299aed70925d721477fdb2aa"]), MERGED_SHANHETU_PACKAGES = Object.freeze([
    "39d706d0992ceb1094b2919d4aed0e45d8de6f399ddae918a70d51347fa48bfd"
  ]), REPLACED_SHANHETU_BETA_PACKAGES = Object.freeze([
    "d386dd79b9e8035c78ad5485594dec1c1cba8bef0cc64187e377c2993198ab47",
    "7773e829307fb13763ff32f8c492d7f9c85a8dea8ac150faef994f375f5ff6b0",
    "b89e0c4f7155749e1ec287815e7a7c7ce4d743fef76ed5fedfff3dffc2f30429",
    "e829b3fab31272efa82321480df08da52cea24e0982465f23ef8131381b05a05",
    "afe9638d54d21777163b139b060abe9f2b9016596a162c591c2d9bb446f26575",
    "3e9e6d941c7dce854ddf56c7e4fb1491cf7cc504c2eeff68085ff11ab3c88ce0",
    "79ef88fb2c89bef189de46fd2f2bad461a01d1a210371a2d73b1ccd2afc06be6",
    "b478b3de512a37bf06243461777833a1377eff25e22cb8f78fcb055a84893835",
    "d2b7402dedf7a6f7689b62cd6dca325a99027603a1e51fb01f2d588775461529",
    "6a97b76dcc50c01a4497fd7c5d8c7ea154a76aabc391db78197b3212f232d4e6",
    "1995c1abe7cebb66fc9d1d3b889eddf41f418bd54725d7f9cd38e34859662008",
    "e993311d150680de8cabcb2d2e294612fbe030475138a47aedf36a55ac4ad790"
  ]), matteColor = "#242635";
  async function skinMatte(window2, url, scope) {
    let { document: document2, Image: Image2, Laya: { Texture, Texture2D, TextureFormat } } = window2;
    if (!url || !document2 || !Image2 || !Texture2D || !Texture) return;
    let image = new Image2();
    if (image.src = url, await image.decode(), scope.closed) return;
    let colors = document2.createElement("canvas");
    colors.width = 6, colors.height = 4;
    let source = colors.getContext("2d");
    source.fillStyle = matteColor, source.fillRect(0, 0, colors.width, colors.height), source.drawImage(image, 0, 0, colors.width, colors.height);
    let canvas = document2.createElement("canvas");
    canvas.width = canvas.height = 64;
    let context2 = canvas.getContext("2d");
    context2.imageSmoothingQuality = "high", context2.drawImage(colors, 0, 0, canvas.width, canvas.height);
    let bitmap = new Texture2D(canvas.width, canvas.height, (TextureFormat == null ? void 0 : TextureFormat.R8G8B8A8) ?? 1, !1), texture;
    return scope.add(() => {
      texture == null || texture.destroy(), bitmap.destroyed || bitmap.destroy();
    }), bitmap.loadImageSource(canvas, !0), texture = new Texture(bitmap), texture;
  }
  function createSkinBackgroundMotion({ window: window2, layer, scope, load, ready, fail: fail2, imageUrl }) {
    let { Sprite, Rectangle } = window2.Laya, root = new Sprite();
    root.name = "sgs-background-motion", root.mouseEnabled = root.mouseChildren = root.visible = !1, root.zOrder = layer.bgSprite.zOrder || 0;
    let motion2, matte, visible = !1, canFit = !1, playing = !1, width, height;
    scope.add(() => {
      try {
        motion2 == null || motion2.dispose();
      } finally {
        root.destroy(!0);
      }
    }), layer.addChildAt(root, Math.max(0, layer.getChildIndex(layer.bgSprite)) + 1);
    function syncPlaying() {
      let play = !!(visible && motion2 && canFit);
      root.visible = play, play !== playing && (playing = play, motion2 == null || motion2.setPlaying(play));
    }
    function positionMotion() {
      width > 0 && height > 0 && (root.graphics.clear(), root.graphics.drawRect(0, 0, width, height, matteColor), matte && root.graphics.drawTexture(matte, 0, 0, width, height), motion2 && (canFit = motion2.fit(0, 0, width, height) !== !1), syncPlaying());
    }
    skinMatte(window2, imageUrl, scope).then((texture) => {
      !texture || scope.closed || (matte = texture, positionMotion());
    }).catch(() => {
    });
    let timer = setTimeout(() => fail2("\u5F85\u673A\u52A8\u753B\u52A0\u8F7D\u8D85\u65F6"), 2e4), cancelTimeout = scope.add(() => clearTimeout(timer));
    return Promise.resolve().then(() => load(scope.signal)).then((loaded) => {
      if (cancelTimeout(), scope.closed) {
        loaded == null || loaded.dispose();
        return;
      }
      if (!loaded) throw new Error("\u8FD9\u6B3E\u76AE\u80A4\u7684\u5F85\u673A\u52A8\u753B\u6682\u4E0D\u53EF\u7528");
      motion2 = loaded, motion2.setPlaying(!1), root.addChild(motion2.actor), positionMotion(), ready();
    }).catch((error) => {
      scope.closed || fail2((error == null ? void 0 : error.message) || String(error));
    }), {
      get loaded() {
        return !!(motion2 && canFit);
      },
      get unsuitableSize() {
        return !!(motion2 && width && height && !canFit);
      },
      layout(w, h) {
        scope.closed || !(w > 0 && h > 0) || width === w && height === h || (width = w, height = h, root.size(w, h), root.scrollRect = new Rectangle(0, 0, w, h), positionMotion());
      },
      show(value) {
        scope.closed || visible === value || (visible = value, syncPlaying());
      }
    };
  }
  function nativeEffect(layer, spine) {
    var _a2;
    let method = spine ? layer.SetBgLiveEffect : layer.Ci ?? layer.wt;
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
      throw effect == null || effect.destroy(), error;
    } finally {
      effect && (effect.InitEffect = init, effect.playEffect = play, (_a2 = effect.off) == null || _a2.call(effect, "start", host, spine ? host.beforeLiveStart : host.beforeStart));
    }
    return effect;
  }
  function createWallpaperMotion({ window: window2, layer, spec, scope, ready, fail: fail2 }) {
    var _a2, _b2;
    let spine = spec.kind === "spine", effect = nativeEffect(layer, spine);
    if (!effect) throw new Error("\u6E38\u620F\u52A8\u753B\u52A0\u8F7D\u5668\u5C1A\u672A\u5C31\u7EEA");
    scope.add(() => effect.destroy());
    let layoutMethod = spine ? layer.layoutBgLiveEffect : layer.layoutBgEffect, host = { [spine ? "bgLiveEffect" : "bgEffect"]: effect }, layout = () => Reflect.apply(layoutMethod, host, []), root = new window2.Laya.Sprite(), loaded = !1, visible = !1;
    return root.name = "sgs-background-motion", root.visible = root.mouseEnabled = root.mouseChildren = !1, root.zOrder = layer.bgSprite.zOrder || 0, scope.add(() => root.destroy(!1)), layer.addChildAt(root, layer.getChildIndex(layer.bgSprite) + 1), root.addChild(effect), effect.AutoReleaseRes = !0, layout(), effect.once(((_a2 = window2.Laya.Event) == null ? void 0 : _a2.START) || "start", effect, () => {
      scope.closed || (loaded = !0, root.visible = visible, visible || effect.stop(), ready());
    }), effect.once(((_b2 = window2.Laya.Event) == null ? void 0 : _b2.ERROR) || "error", effect, (error) => fail2((error == null ? void 0 : error.message) || "\u5B98\u65B9\u52A8\u6001\u8D44\u6E90\u52A0\u8F7D\u5931\u8D25")), scope.timeout(() => {
      loaded || fail2("\u5B98\u65B9\u52A8\u6001\u80CC\u666F\u52A0\u8F7D\u8D85\u65F6");
    }, 2e4), effect.InitEffect(spec.url, spine ? 0 : "play", !0, !1), effect.playEffect(), {
      get loaded() {
        return loaded;
      },
      layout,
      show(value) {
        visible !== value && (visible = value, root.visible = loaded && value, loaded && (value ? effect.playEffect() : effect.stop()));
      }
    };
  }
  function stableBackgroundClip(animations) {
    let names = (animations == null ? void 0 : animations.map((animation) => animation.name).filter(Boolean)) ?? [], idle = names.find((name) => name.toLowerCase() === "daiji") ?? names.find((name) => name.toLowerCase() === "play");
    if (idle) return idle;
    let remaining = names.filter((name) => !/^(ChuChang|GongJi|HuDong|JiNeng)$/i.test(name));
    return remaining.length === 1 ? remaining[0] : void 0;
  }
  function createBackgroundMotion({ window: window2, layer, spec, size, scope, ready, fail: fail2 }) {
    var _a2, _b2;
    let laya = window2.Laya, root = new laya.Sprite(), players = [], loaded = !1, failed = !1, visible = !1, playing = null, stopAttack;
    root.name = "sgs-background-motion", root.mouseEnabled = root.mouseChildren = !1, root.zOrder = layer.bgSprite.zOrder || 0, root.size(size.width, size.height), root.scrollRect = new laya.Rectangle(0, 0, size.width, size.height), root.visible = !1, scope.add(() => root.destroy(!0)), layer.addChildAt(root, Math.max(0, layer.getChildIndex(layer.bgSprite)) + 1);
    let error = (value) => {
      if (!(scope.closed || failed)) {
        failed = !0, root.visible = !1;
        for (let player of players) player.pause();
        fail2((value == null ? void 0 : value.message) || String(value || "\u52A8\u6001\u8D44\u6E90\u52A0\u8F7D\u5931\u8D25"));
      }
    }, complete = () => {
      !scope.closed && !failed && (loaded = !0, ready());
    }, result = {
      get loaded() {
        return loaded && !failed;
      },
      stopAttack() {
        stopAttack == null || stopAttack();
      },
      layout(fit) {
        scope.closed || !fit || (root.pos(fit.x, fit.y), root.scale(fit.scale, fit.scale));
      },
      show(value) {
        if (!scope.closed && (visible = value && !failed, root.visible = visible && loaded, visible || stopAttack == null || stopAttack(), playing !== visible)) {
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
        let pool = laya.VideoTexture._videoTexturePool, index = pool == null ? void 0 : pool.indexOf(bitmap);
        index >= 0 && pool.splice(index, 1);
      }), scope.listen(video, "error", () => {
        var _a3, _b3;
        return error("\u89C6\u9891\u52A0\u8F7D\u5931\u8D25\uFF1A" + (((_a3 = video.error) == null ? void 0 : _a3.message) || ((_b3 = video.error) == null ? void 0 : _b3.code) || "\u672A\u77E5\u9519\u8BEF"));
      }), scope.listen(video, "loadeddata", () => {
        scope.closed || failed || (bitmap._width = video.videoWidth, bitmap._height = video.videoHeight, texture.setTo(bitmap, void 0, video.videoWidth, video.videoHeight), root.graphics.clear(), root.graphics.drawTexture(texture, 0, 0, size.width, size.height), complete(), result.show(visible));
      }), players.push({ pause() {
        bitmap.videoPause();
      }, resume() {
        bitmap._needUpdate = !0;
        let attempt = video.play();
        attempt == null || attempt.catch(error);
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
      let parts = spec.kind === "bone" ? ["beijing", ...spec.parts] : spec.modern ? ["beijing", "daiji", "qianjing"] : ["beijing", "xingxiang"], idle = /* @__PURE__ */ new Map(), count = 0;
      for (let part of parts) {
        let effect = nativeEffect(layer, spec.kind === "spine");
        scope.add(() => effect.destroy()), root.addChild(effect), effect.mouseEnabled = effect.mouseChildren = !1, spec.kind === "bone" && effect.size(size.width, size.height), effect.pos(size.width / 2, size.height / 2), effect.AutoReleaseRes = !0, idle.set(part, effect);
        let started = !1, partReady = () => {
          ++count === parts.length && (complete(), result.show(visible));
        }, onStart = () => {
          scope.closed || failed || (started = !0, visible || effect.stop(), partReady());
        };
        effect.once(((_a2 = laya.Event) == null ? void 0 : _a2.START) || "start", effect, onStart), effect.once(((_b2 = laya.Event) == null ? void 0 : _b2.ERROR) || "error", effect, error), players.push({ pause() {
          started && effect.stop();
        }, resume() {
          started && effect.playEffect();
        } });
        let url = `${spec.url}/${part}.${spec.kind === "spine" ? "json" : "sk"}`, modernSpine = spec.kind === "spine" && spec.modern, loadEvent = effect.constructor.SPINE_EFFECT_LOAD_COMPLETE;
        modernSpine && part === "beijing" && loadEvent && (effect.AutoStart = !1, effect.once(loadEvent, effect, () => {
          var _a3, _b3;
          if (scope.closed || failed) return;
          let animation = stableBackgroundClip((_b3 = (_a3 = effect.templet) == null ? void 0 : _a3.skeletonData) == null ? void 0 : _b3.animations);
          if (!animation) {
            effect.visible = !1, partReady();
            return;
          }
          effect.InitEffect(url, animation, !0, !1), effect.playEffect();
        })), effect.InitEffect(url, modernSpine ? "DaiJi" : "play", !0, !1), effect.playEffect();
      }
      if (spec.kind === "spine" && spec.modern) {
        let missing = /* @__PURE__ */ new Set();
        result.playAttack = () => {
          var _a3, _b3, _c;
          if (scope.closed || !result.loaded || !visible || stopAttack || missing.has("xingxiang")) return;
          let action = new ResourceScope(), stop = scope.add(() => {
            stopAttack = null, action.dispose();
          });
          stopAttack = stop, action.timeout(stop, 2e4);
          try {
            for (let [part, idlePart] of [["xingxiang", "daiji"], ["qianjing", "qianjing"]]) {
              if (missing.has(part)) continue;
              let underneath = idle.get(idlePart), effect = nativeEffect(layer, !0), active = !0, ended = !1, release = action.add(() => {
                active = !1, underneath.visible = !0, effect.destroy();
              });
              effect.visible = effect.mouseEnabled = effect.mouseChildren = !1, effect.AutoReleaseRes = !0, root.addChildAt(effect, root.getChildIndex(underneath) + 1), effect.pos(size.width / 2, size.height / 2);
              let finish = () => {
                ended = !0, Promise.resolve().then(part === "xingxiang" ? stop : release).catch(stop);
              };
              if (effect.once(((_a3 = laya.Event) == null ? void 0 : _a3.START) || "start", effect, () => {
                !active || ended || (underneath.visible = !1, effect.visible = !0);
              }), effect.once(((_b3 = laya.Event) == null ? void 0 : _b3.STOPPED) || "stopped", effect, finish), effect.once(((_c = laya.Event) == null ? void 0 : _c.ERROR) || "error", effect, finish), effect.once(effect.constructor.PLAY_NAME_LOSE || "PLAY_NAME_LOSE", effect, () => {
                missing.add(part), finish();
              }), effect.InitEffect(`${spec.url}/${part}.json`, "GongJi", !1, !1), effect.playEffect(), part === "xingxiang" && ended) break;
            }
          } catch {
            stop();
          }
        };
      }
    }
    return result;
  }
  var MAX_TEXTURE_EDGE = 4096;
  function backgroundThumbnail(win, image) {
    let { naturalWidth, naturalHeight } = image;
    if (!(naturalWidth > 0 && naturalHeight > 0)) return "";
    let canvas = win.document.createElement("canvas");
    canvas.width = 288, canvas.height = 162;
    let scale = Math.max(canvas.width / naturalWidth, canvas.height / naturalHeight), width = naturalWidth * scale, height = naturalHeight * scale;
    return canvas.getContext("2d").drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height), canvas.toDataURL("image/webp", 0.82);
  }
  function backgroundImageBlob(win, image) {
    return image instanceof win.Blob ? image : new win.Blob([image.bytes], { type: image.type });
  }
  async function storedBackgroundThumbnail(win, asset) {
    let url = win.URL.createObjectURL(backgroundImageBlob(win, asset));
    try {
      let image = new win.Image();
      return image.src = url, await image.decode(), backgroundThumbnail(win, image);
    } finally {
      win.URL.revokeObjectURL(url);
    }
  }
  function readLocalBackground(win, file, landscape = !1) {
    return withLocalImage(win, file, async (image, original) => {
      let { naturalWidth: width, naturalHeight: height } = image;
      if (landscape && width <= height) throw new Error("\u53EA\u6709\u6A2A\u7248\u76AE\u80A4\u53EF\u4EE5\u8BBE\u4E3A\u724C\u5C40\u80CC\u666F");
      let preview = backgroundThumbnail(win, image), scale = MAX_TEXTURE_EDGE / Math.max(width, height);
      if (scale >= 1) return { ...original, preview };
      let canvas = win.document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale)), canvas.height = Math.max(1, Math.round(height * scale)), canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      let resized = await new Promise((resolve, reject) => canvas.toBlob(
        (resized2) => resized2 ? resolve(resized2) : reject(new Error("\u65E0\u6CD5\u7F29\u5C0F\u8FD9\u5F20\u56FE\u7247")),
        original.type === "image/jpeg" ? "image/jpeg" : "image/png"
      ));
      return { bytes: await resized.arrayBuffer(), type: resized.type, preview };
    });
  }
  function localBackgroundImage(win, mode, operation) {
    return localImageTransaction(win, "sgs-toolbox-backgrounds", mode, operation);
  }
  var provider = "backgrounds", entryKey = (id) => "history:" + id, imageKey = (id) => "archive:" + id;
  function backgroundHistoryId(choice) {
    return (choice == null ? void 0 : choice.owner) !== provider ? null : choice.skinKey ? `skin:${choice.skinKey}` : choice.localImageId ? choice.historyId || `local:${choice.localImageId}` : choice.url ? `native:${choice.url}` : null;
  }
  var BackgroundHistory = class {
    pending = Promise.resolve();
    error = "";
    lastUsed = 0;
    constructor(window2, changed) {
      this.window = window2, this.changed = changed;
    }
    remember(choice, image, { seed = !1, archived = !1 } = {}) {
      let id = backgroundHistoryId(choice);
      if (!id) return;
      let { localImageId, historyId, owner, ...spec } = choice, usedAt = this.lastUsed = Math.max(Date.now(), this.lastUsed + 1), win = this.window;
      this.pending = this.pending.then(async () => {
        if (localImageId && !image && !archived) {
          if (await this.read(entryKey(id))) return;
          if (image = await this.read(localImageId), !image) throw new Error("\u6B64\u524D\u4FDD\u5B58\u7684\u80CC\u666F\u56FE\u7247\u5DF2\u4E22\u5931");
        }
        let preview = image == null ? void 0 : image.preview;
        image && !preview && (preview = await storedBackgroundThumbnail(win, image).catch(() => "")), await localBackgroundImage(win, "readwrite", (store) => {
          let request = store.get(entryKey(id));
          return request.addEventListener("success", () => {
            let previous = request.result;
            previous && (seed || previous.usedAt > usedAt) || (image && store.put(image, imageKey(id)), store.put({ id, spec, local: !!localImageId, usedAt, preview: preview || (previous == null ? void 0 : previous.preview) || "" }, entryKey(id)));
          }), request;
        });
      }).then(() => {
        this.error = "", this.changed();
      }, (error) => {
        this.error = `\u4FDD\u5B58\u80CC\u666F\u5386\u53F2\u5931\u8D25\uFF1A${(error == null ? void 0 : error.message) || error}`, this.changed();
      });
    }
    read(key) {
      return localBackgroundImage(this.window, "readonly", (store) => store.get(key));
    }
    async list() {
      var _a2;
      await this.pending;
      let keys = (_a2 = this.window.IDBKeyRange) == null ? void 0 : _a2.bound("history:", "history;", !1, !0);
      if (!keys) throw new Error("\u5F53\u524D\u73AF\u5883\u65E0\u6CD5\u8BFB\u53D6\u80CC\u666F\u5386\u53F2");
      return (await localBackgroundImage(this.window, "readonly", (store) => store.getAll(keys))).sort((a, b) => b.usedAt - a.usedAt).map(({ id, spec, preview }) => ({
        id,
        name: spec.name,
        url: spec.url,
        preview,
        source: spec.officialWallpaper ? "\u5B98\u65B9\u80CC\u666F" : id.startsWith("native:") ? "\u672C\u670D\u76AE\u80A4" : id.startsWith('skin:["mobile",') ? "\u79FB\u52A8\u7248\u76AE\u80A4" : id.startsWith("skin:") ? "\u4E00\u5C06\u6210\u540D" : "\u672C\u5730\u56FE\u7247"
      }));
    }
    async restore(id) {
      await this.pending;
      let entry = await this.read(entryKey(id));
      if (!entry) throw new Error("\u627E\u4E0D\u5230\u8FD9\u6761\u80CC\u666F\u8BB0\u5F55");
      let image = entry.local ? await this.read(imageKey(id)) : null;
      if (entry.local && !image) throw new Error("\u8FD9\u6761\u8BB0\u5F55\u7684\u56FE\u7247\u5DF2\u4E22\u5931\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9");
      return { spec: entry.spec, image };
    }
    async cachePreview(id, image) {
      try {
        let preview = backgroundThumbnail(this.window, image);
        if (!preview) return;
        await localBackgroundImage(this.window, "readwrite", (store) => {
          let request = store.get(entryKey(id));
          return request.addEventListener("success", () => {
            request.result && !request.result.preview && store.put({ ...request.result, preview }, entryKey(id));
          }), request;
        });
      } catch {
      }
    }
  }, read2 = (fn) => {
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
  function supportsSkinBackgroundAttack(dynamic) {
    return (dynamic == null ? void 0 : dynamic.kind) === "spine" && dynamic.modern === !0 && dynamic.attack !== !1;
  }
  var skinQualitySetting = "backgrounds:skinQuality";
  function fitBackground(width, height, viewportWidth, viewportHeight, scaleFor) {
    if (![width, height, viewportWidth, viewportHeight].every((n) => Number.isFinite(n) && n > 0)) return null;
    let scale = scaleFor(viewportWidth / width, viewportHeight / height);
    return { width, height, scale, x: (viewportWidth - width * scale) / 2, y: (viewportHeight - height * scale) / 2 };
  }
  function containBackground(width, height, viewportWidth, viewportHeight) {
    return fitBackground(width, height, viewportWidth, viewportHeight, Math.min);
  }
  function findBackgroundLayer(stage) {
    let queue = stage ? [stage] : [];
    for (let i2 = 0; i2 < queue.length && i2 < 4e3; i2++) {
      let node = queue[i2];
      if (!(!node || node.destroyed)) {
        if (node.bgSprite && typeof node.updateBgSize == "function" && typeof node.bgLoadComplete == "function" && typeof node.SetBgLiveEffect == "function") return node;
        Array.isArray(node._children) && queue.push(...node._children);
      }
    }
    return null;
  }
  function backgroundViewport(layer, win) {
    let viewport = layer.scrollRect;
    if ((viewport == null ? void 0 : viewport.width) > 0 && viewport.height > 0) return viewport;
    let { gameWidth: width, gameHeight: height } = win.SystemContext || {};
    return { width, height };
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
    if (value.officialWallpaper === !0 && (result.officialWallpaper = !0, value.wallpaperMotion)) {
      let { kind, url: url2 } = value.wallpaperMotion;
      if (kind !== "spine" && kind !== "bone") throw new Error("\u5B98\u65B9\u52A8\u6001\u80CC\u666F\u7C7B\u578B\u65E0\u6548");
      result.wallpaperMotion = Object.freeze({ kind, url: backgroundSpec({ name: "\u52A8\u6001\u8D44\u6E90", url: url2 }).url });
    }
    if (value.dynamic === null && (result.dynamic = null), value.dynamic != null) {
      let d = value.dynamic;
      if (!["bone", "spine", "video"].includes(d.kind)) throw new Error("\u52A8\u6001\u80CC\u666F\u7C7B\u578B\u65E0\u6548");
      let dynamicUrl = backgroundSpec({ name: "\u52A8\u6001\u8D44\u6E90", url: d.url }).url;
      if (![d.width, d.height].every((n) => Number.isFinite(n) && n > 0 && n <= 16384)) throw new Error("\u52A8\u6001\u80CC\u666F\u5C3A\u5BF8\u65E0\u6548");
      if (d.parts != null && (!Array.isArray(d.parts) || d.parts.length > 16 || d.parts.some((p) => !/^[\w-]{1,80}$/.test(p)) || new Set(d.parts).size !== d.parts.length || d.parts.includes("beijing"))) throw new Error("\u52A8\u6001\u80CC\u666F\u5206\u5C42\u65E0\u6548");
      result.dynamic = Object.freeze({
        kind: d.kind,
        url: dynamicUrl.replace(/\/$/, ""),
        width: d.width,
        height: d.height,
        modern: d.modern === !0,
        parts: Object.freeze([...d.parts || []]),
        ...typeof d.attack == "boolean" ? { attack: d.attack } : {}
      });
    }
    return result.animated = value.animated !== !1, result.attackEffects = value.attackEffects !== !1, Object.freeze(result);
  }
  var ATTACK_SKILL = /* @__PURE__ */ new Map([[1, "slash"], [11111, "slash"], [11112, "slash"], [11114, "slash"], [8, "attack"], [9, "attack"], [10, "attack"]]), ATTACK_CARDS = /* @__PURE__ */ new Map([
    ["\u6740", "slash"],
    ["\u706B\u6740", "slash"],
    ["\u96F7\u6740", "slash"],
    ["\u51B0\u6740", "slash"],
    ["\u706B\u7130\u6740", "slash"],
    ["\u96F7\u7535\u6740", "slash"],
    ["\u51B0\u971C\u6740", "slash"],
    ["\u51B3\u6597", "attack"],
    ["\u5357\u86EE\u5165\u4FB5", "attack"],
    ["\u4E07\u7BAD\u9F50\u53D1", "attack"]
  ]);
  function watchBackgroundAttack(game, scene, scope, play) {
    let currentSeat = () => {
      var _a2;
      let seat2 = nativeSeat((_a2 = game.getSelfSeatUI) == null ? void 0 : _a2.call(game));
      return (seat2 == null ? void 0 : seat2.IsSelf) === !1 ? null : seat2;
    }, seat, release, trigger = (kind, useType) => {
      (kind === "attack" || kind === "slash" && Number(useType) === 1) && play();
    };
    return (enabled) => {
      let next = enabled ? currentSeat() : null;
      if (next === seat || (release == null || release(), seat = next, typeof (seat == null ? void 0 : seat.on) != "function" || typeof seat.off != "function")) return;
      let bound = seat, isCurrent = () => !scope.closed && game.getScene() === scene && game.isInGame() && currentSeat() === bound, card = (id, useType) => {
        var _a2;
        if (!isCurrent()) return;
        let meta = (_a2 = game.getCardMeta) == null ? void 0 : _a2.call(game, id);
        trigger((meta == null ? void 0 : meta.firstSkillId) > 0 ? ATTACK_SKILL.get(meta.firstSkillId) : ATTACK_CARDS.get(meta == null ? void 0 : meta.name), useType);
      }, skillCard = (id, useType) => {
        isCurrent() && trigger(ATTACK_SKILL.get(Number(id)), useType);
      };
      release = scope.add(() => {
        bound.off("USE_CARD", scope, card), bound.off("USE_SKILL_CARD", scope, skillCard);
      }), bound.on("USE_CARD", scope, card), bound.on("USE_SKILL_CARD", scope, skillCard);
    };
  }
  var BackgroundRegistry = class {
    constructor({ window: window2, game, settings, scope, sceneWatch }) {
      Object.assign(this, { window: window2, game, settings, scope }), this.providers = /* @__PURE__ */ new Set(), this.listeners = /* @__PURE__ */ new Set(), this.binding = null, this.ready = null, this.loading = null, this.failed = null, this.ticket = 0, this.status = "\u8DDF\u968F\u6E38\u620F\u80CC\u666F", this.history = new BackgroundHistory(window2, () => {
        scope.closed || this.emit();
      });
      let refresh = () => this.refresh();
      sceneWatch ? scope.add(sceneWatch.watch(refresh, 500, !0)) : scope.interval(refresh, 500), scope.add(() => {
        this.importing = null, this.ticket++, this.listeners.clear();
        try {
          this.detach(!0);
        } finally {
          this.dropLocalImage();
        }
      }), window2.addEventListener && settings.prefix && scope.listen(window2, "storage", (event) => {
        event.storageArea === settings.storage && ((event.key === settings.prefix + "battleBackground" || event.key === null) && this.selectionChanged(), event.key === settings.prefix + skinQualitySetting && (this.refresh(), this.emit()));
      });
    }
    get current() {
      return this.settings.get("battleBackground", null);
    }
    get currentHistoryId() {
      return backgroundHistoryId(this.current);
    }
    isActive(owner) {
      return this.providers.has(owner);
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
    state(text3) {
      this.status !== text3 && (this.status = text3, this.emit());
    }
    register(owner) {
      if (this.providers.has(owner)) throw new Error("\u80CC\u666F\u63D0\u4F9B\u65B9\u5DF2\u6CE8\u518C");
      let current = this.current;
      (current == null ? void 0 : current.owner) === owner && this.history.remember(current, null, { seed: !0 }), this.providers.add(owner), this.refresh(), this.emit();
      let active = !0;
      return () => {
        var _a2;
        active && (active = !1, this.providers.delete(owner), ((_a2 = this.importing) == null ? void 0 : _a2.owner) === owner && (this.importing = null), this.retryAt = 0, this.loadAttempts = 0, this.refresh(), this.emit());
      };
    }
    select(owner, spec) {
      if (!this.providers.has(owner)) throw new Error("\u80CC\u666F\u63D0\u4F9B\u65B9\u672A\u542F\u7528");
      this.saveSelection(spec ? { ...backgroundSpec(spec), owner } : null);
    }
    registerSkinMotion(load, { quality = !1 } = {}) {
      return this.skinMotion = load, this.skinQualityAvailable = quality, this.emit(), () => {
        this.skinMotion === load && (this.skinMotion = null, this.skinQualityAvailable = !1, this.emit());
      };
    }
    setSkinQuality(owner, quality) {
      owner !== "backgrounds" || !this.providers.has(owner) || !this.skinQualityAvailable || !["high", "low"].includes(quality) || this.settings.get(skinQualitySetting, "high") !== quality && (this.settings.set(skinQualitySetting, quality), this.refresh(), this.emit());
    }
    setAnimated(owner, enabled) {
      let choice = this.current;
      if (!((choice == null ? void 0 : choice.owner) !== owner || !this.providers.has(owner))) {
        if (choice.skinMotion !== !0) {
          choice.localImageId || this.select(owner, { ...choice, animated: enabled });
          return;
        }
        this.settings.set("battleBackground", { ...choice, animated: enabled }), this.selectionChanged();
      }
    }
    setAttackEffects(owner, enabled) {
      var _a2, _b2;
      let choice = this.current;
      (choice == null ? void 0 : choice.owner) !== owner || !this.providers.has(owner) || !supportsSkinBackgroundAttack(choice.dynamic) || (this.settings.set("battleBackground", { ...choice, attackEffects: enabled === !0 }), enabled || (_b2 = (_a2 = this.binding) == null ? void 0 : _a2.motion) == null || _b2.stopAttack(), this.refresh(), this.emit());
    }
    selectLocal(owner, file, { skinKey, skinMotion, animated, isCurrent = () => !0 } = {}) {
      return this.selectPrepared(owner, isCurrent, async () => {
        var _a2;
        return {
          image: await readLocalBackground(this.window, file, !!skinKey),
          spec: {
            name: ((_a2 = file.name) == null ? void 0 : _a2.trim().slice(0, 160)) || "\u672C\u5730\u56FE\u7247",
            animated: !!(skinMotion && animated),
            dynamic: null,
            ...skinKey && { skinKey, skinMotion: !!skinMotion }
          }
        };
      });
    }
    restoreHistory(owner, historyId, { animated, attackEffects, isCurrent = () => !0 } = {}) {
      return this.selectPrepared(owner, isCurrent, async () => {
        if (owner !== "backgrounds" || typeof historyId != "string") throw new Error("\u80CC\u666F\u8BB0\u5F55\u65E0\u6548");
        let { spec, image } = await this.history.restore(historyId), playback = animated ?? spec.animated;
        return { image, archived: !0, spec: {
          ...spec,
          attackEffects: attackEffects ?? spec.attackEffects,
          animated: image ? spec.skinMotion === !0 && playback : playback,
          ...image && { historyId }
        } };
      });
    }
    async selectPrepared(owner, isCurrent, prepare) {
      if (this.scope.closed || !this.providers.has(owner)) throw new Error("\u80CC\u666F\u63D0\u4F9B\u65B9\u672A\u542F\u7528");
      let pending = this.importing = { owner }, canSave = () => this.importing === pending && isCurrent(), id;
      try {
        let { spec, image, archived } = await prepare();
        return canSave() ? image ? (id = await localBackgroundImage(this.window, "readwrite", (store) => store.add(image)), canSave() ? (this.saveSelection({ ...spec, localImageId: id, owner }, image, archived), id = void 0, !0) : !1) : (this.select(owner, spec), !0) : !1;
      } catch (error) {
        if (canSave()) throw error;
        return !1;
      } finally {
        this.importing === pending && (this.importing = null), this.removeLocalImage(id);
      }
    }
    removeLocalImage(id) {
      Number.isSafeInteger(id) && id > 0 && localBackgroundImage(this.window, "readwrite", (store) => store.delete(id)).catch(() => {
      });
    }
    saveSelection(choice, image, archived) {
      var _a2;
      let previousId = (_a2 = this.current) == null ? void 0 : _a2.localImageId;
      this.settings.set("battleBackground", choice), this.history.remember(choice, archived ? null : image, { archived }), this.selectionChanged(), previousId && previousId !== (choice == null ? void 0 : choice.localImageId) && this.history.pending.then(() => this.removeLocalImage(previousId));
    }
    selectionChanged() {
      var _a2;
      this.importing = null, this.yieldedScene = (_a2 = this.binding) != null && _a2.yielded ? this.binding.scene : this.yieldedScene, this.ticket++, this.ready = this.loading = this.failed = null, this.retryAt = 0, this.loadAttempts = 0;
      try {
        this.detach(!0);
      } catch {
      }
      this.dropLocalImage(), this.refresh(), this.emit();
    }
    dropLocalImage() {
      var _a2, _b2;
      let asset = this.localImage;
      if (this.localImage = null, !!(asset != null && asset.url)) {
        this.imageTexture = this.imageSize = null;
        try {
          (_b2 = (_a2 = asset.loader) == null ? void 0 : _a2.clearRes) == null || _b2.call(_a2, asset.url);
        } catch {
        } finally {
          this.window.URL.revokeObjectURL(asset.objectUrl);
        }
      }
    }
    localUrl(id) {
      var _a2;
      if (((_a2 = this.localImage) == null ? void 0 : _a2.id) !== id) {
        this.dropLocalImage();
        let asset = this.localImage = { id };
        localBackgroundImage(this.window, "readonly", (store) => store.get(id)).then((image) => {
          if (this.localImage !== asset) return;
          if (!image) throw new Error("\u672C\u5730\u56FE\u7247\u5DF2\u4E22\u5931\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9");
          let blob = backgroundImageBlob(this.window, image);
          asset.objectUrl = this.window.URL.createObjectURL(blob), asset.url = asset.objectUrl.includes("://") ? asset.objectUrl : asset.objectUrl + "#://", this.refresh();
        }).catch((error) => {
          this.localImage === asset && (asset.error = (error == null ? void 0 : error.message) || String(error), this.refresh());
        });
      }
      return this.localImage.url || this.state(this.localImage.error || "\u6B63\u5728\u8BFB\u53D6\u672C\u5730\u56FE\u7247"), this.localImage.url;
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
          this.retryAt = Date.now() + 2e3, this.state("\u80CC\u666F\u63A5\u5165\u6682\u672A\u5C31\u7EEA\uFF0C\u5C06\u81EA\u52A8\u91CD\u8BD5\uFF1A" + ((error == null ? void 0 : error.stack) || error));
        }
    }
    loadFailed(url, message) {
      this.ticket++, this.loading = null, this.failed = url, this.loadAttempts = (this.loadAttempts || 0) + 1, this.retryAt = Date.now() + Math.min(3e4, 2e3 * 2 ** (this.loadAttempts - 1)), this.state(message + "\uFF1B\u7A0D\u540E\u81EA\u52A8\u91CD\u8BD5");
    }
    refreshReady() {
      var _a2, _b2, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t;
      let choice = this.current;
      if (!choice || !this.providers.has(choice.owner)) {
        this.ticket++, this.ready = this.loading = null;
        try {
          this.detach(!0);
        } finally {
          this.dropLocalImage();
        }
        this.state(choice ? "\u80CC\u666F\u63D2\u4EF6\u5DF2\u505C\u7528\uFF0C\u8DDF\u968F\u6E38\u620F\u80CC\u666F" : "\u8DDF\u968F\u6E38\u620F\u80CC\u666F");
        return;
      }
      let localId2 = choice.localImageId;
      try {
        if (localId2 === void 0) backgroundSpec(choice);
        else if (!Number.isSafeInteger(localId2) || localId2 < 1) throw new Error("\u672C\u5730\u56FE\u7247\u7F16\u53F7\u65E0\u6548");
      } catch (error) {
        this.detach(!0), this.state("\u80CC\u666F\u914D\u7F6E\u65E0\u6548\uFF1A" + error.message);
        return;
      }
      let scene = this.game.getScene();
      if (((_a2 = this.binding) == null ? void 0 : _a2.scene) !== scene && this.detach(!1), this.binding && (this.binding.layer.destroyed || this.binding.stage !== ((_b2 = this.window.Laya) == null ? void 0 : _b2.stage)) && this.detach(!1), !this.game.isInGame() || !["SetWallPaperById", "SetWallPaperByUrl", "OnNormalWallPaperChange", "onWallPaperChange"].every((k) => typeof (scene == null ? void 0 : scene[k]) == "function")) {
        this.detach(!1), this.state("\u5DF2\u4FDD\u5B58\uFF0C\u7B49\u5F85\u8FDB\u5165\u724C\u5C40");
        return;
      }
      let laya = this.window.Laya;
      if (localId2 !== void 0) {
        let url = this.localUrl(localId2);
        if (!url) return;
        choice = { ...choice, url };
      }
      if (this.failed === choice.url && (this.failed = null), this.ready !== choice.url) {
        if (this.loading === choice.url) return;
        if (!((_c = laya == null ? void 0 : laya.loader) != null && _c.load) || !((_d = laya.Handler) != null && _d.create)) {
          this.state("\u7B49\u5F85\u6E38\u620F\u56FE\u7247\u52A0\u8F7D\u5668");
          return;
        }
        let ticket = ++this.ticket;
        this.loading = choice.url, this.state("\u6B63\u5728\u52A0\u8F7D\u80CC\u666F"), this.scope.timeout(() => {
          ticket !== this.ticket || this.loading !== choice.url || this.loadFailed(choice.url, "\u80CC\u666F\u52A0\u8F7D\u8D85\u65F6");
        }, 2e4);
        try {
          let asset = localId2 === void 0 ? null : this.localImage;
          asset && (asset.loader = laya.loader), laya.loader.load(choice.url, laya.Handler.create(null, (texture) => {
            var _a3, _b3;
            if (ticket !== this.ticket || this.scope.closed) {
              asset && this.localImage !== asset && ((_b3 = (_a3 = asset.loader).clearRes) == null || _b3.call(_a3, choice.url));
              return;
            }
            if (this.loading = null, !texture) {
              this.loadFailed(choice.url, "\u80CC\u666F\u52A0\u8F7D\u5931\u8D25");
              return;
            }
            this.loadAttempts = 0, this.retryAt = 0, this.imageSize = { width: texture.sourceWidth || texture.width, height: texture.sourceHeight || texture.height }, this.imageTexture = texture, this.ready = choice.url, this.refresh();
          }), null, ((_e = laya.Loader) == null ? void 0 : _e.IMAGE) || "image");
        } catch (error) {
          this.loadFailed(choice.url, "\u80CC\u666F\u52A0\u8F7D\u5931\u8D25\uFF1A" + error.message);
        }
        return;
      }
      if (choice.skinKey && !(((_f = this.imageSize) == null ? void 0 : _f.width) > ((_g = this.imageSize) == null ? void 0 : _g.height))) {
        this.detach(!0), this.state("\u6B64\u76AE\u80A4\u6CA1\u6709\u53EF\u7528\u7684\u6A2A\u7248\u539F\u753B");
        return;
      }
      let skinQuality = this.settings.get(skinQualitySetting) === "low" ? "low" : "high";
      if (choice.skinMotion && choice.animated !== !1 && this.binding && this.binding.skinQuality !== skinQuality && this.detach(!1), !this.binding) {
        let coverStill = function(next) {
          (covered == null ? void 0 : covered.node) !== next && (covered && !covered.node.destroyed && (covered.node.visible = covered.visible), covered = next && { node: next, visible: next.visible }), next && (next.visible = !1);
        }, layer = findBackgroundLayer(laya == null ? void 0 : laya.stage), viewport = layer && backgroundViewport(layer, this.window);
        if (!(laya != null && laya.Sprite) || !laya.Rectangle || !((viewport == null ? void 0 : viewport.width) > 0 && viewport.height > 0)) {
          this.state("\u7B49\u5F85\u6E38\u620F\u80CC\u666F\u5C42\u4E0E\u5E03\u5C40\u5C31\u7EEA");
          return;
        }
        let local = new ResourceScope(), b2 = {
          scene,
          layer,
          stage: laya.stage,
          scope: local,
          skinQuality,
          applied: !1,
          yielded: this.yieldedScene === scene,
          writing: !1
        };
        this.binding = b2;
        let registry = this, originalById = scene.SetWallPaperById, eligible = () => !scene.currentWeatherWallPaper && !b2.yielded, covered;
        local.add(() => coverStill());
        let showMotion = (visible) => {
          var _a3, _b3;
          (_a3 = b2.motion) == null || _a3.show(visible), coverStill(visible && (choice.skinMotion || choice.wallpaperMotion) && (_b3 = b2.motion) != null && _b3.loaded ? layer.bg : void 0);
        };
        if (layer) {
          let fill = new laya.Sprite();
          local.add(() => fill.destroy(!0)), fill.name = "sgs-background-edge-fill", fill.mouseEnabled = !1, fill.mouseChildren = !1, fill.zOrder = (layer.bgSprite.zOrder || 0) - 1, layer.addChildAt(fill, Math.max(0, layer.getChildIndex(layer.bgSprite)));
          let soften = new laya.Sprite();
          soften.mouseEnabled = !1, fill.addChild(soften), laya.BlurFilter && !choice.skinKey && (soften.filters = [new laya.BlurFilter(18)]), b2.syncMotion = () => {
            var _a3, _b3;
            let visible = eligible() && ((_a3 = layer.bg) == null ? void 0 : _a3.skin) === choice.url;
            showMotion(visible), choice.wallpaperMotion && (fill.visible = visible && !((_b3 = b2.motion) != null && _b3.loaded));
          }, b2.hideFill = () => {
            fill.visible = !1, showMotion(!1);
          };
          let fillKey = "";
          local.patch(layer, "updateBgSize", (original) => function(...args) {
            var _a3, _b3, _c2;
            let result = Reflect.apply(original, this, args), customBackground = eligible() && ((_a3 = this.bg) == null ? void 0 : _a3.skin) === choice.url;
            if (fill.visible = customBackground && !choice.skinKey, !customBackground)
              return b2.syncMotion(), result;
            let size = registry.imageSize, { width: w, height: h } = backgroundViewport(this, registry.window), fit = fitBackground(size == null ? void 0 : size.width, size == null ? void 0 : size.height, w, h, choice.skinKey ? Math.max : Math.min);
            if (!fit)
              return fill.visible = !1, result;
            let key = `${w}:${h}`;
            if (fill.visible && key !== fillKey) {
              fillKey = key;
              let scale = Math.max(w / fit.width, h / fit.height), dw = fit.width * scale, dh = fit.height * scale;
              fill.size(w, h), fill.scrollRect = new laya.Rectangle(0, 0, w, h), soften.graphics.clear(), soften.graphics.drawTexture(registry.imageTexture, (w - dw) / 2, (h - dh) / 2, dw, dh), soften.graphics.drawRect(0, 0, w, h, "rgba(0,0,0,0.28)");
            }
            return this.bg.size(fit.width, fit.height), typeof this.bg.scale == "function" ? this.bg.scale(fit.scale, fit.scale) : this.bg.scale = fit.scale, this.bg.posInteger(fit.x, fit.y), choice.wallpaperMotion ? (_b3 = b2.motion) == null || _b3.layout() : choice.skinMotion ? (_c2 = b2.motion) == null || _c2.layout(w, h) : b2.motion && b2.motion.layout(containBackground(choice.dynamic.width, choice.dynamic.height, w, h)), b2.syncMotion(), result;
          });
        }
        typeof scene.OnWeatherWallPaperChange == "function" && local.patch(scene, "OnWeatherWallPaperChange", (original) => function(...args) {
          var _a3;
          return (_a3 = b2.hideFill) == null || _a3.call(b2), Reflect.apply(original, this, args);
        });
        let apply = () => {
          if (localId2 !== void 0 && laya.loader.getRes && !laya.loader.getRes(choice.url)) {
            this.detach(!1), this.ready = null, this.refresh();
            return;
          }
          b2.writing = !0;
          try {
            scene.SetWallPaperByUrl(choice.url), b2.applied = !0, layer == null || layer.updateBgSize();
          } finally {
            b2.writing = !1;
          }
        };
        local.patch(scene, "SetWallPaperByUrl", (original) => function(...args) {
          var _a3;
          return b2.writing || (b2.yielded = !0, registry.yieldedScene = scene, (_a3 = b2.hideFill) == null || _a3.call(b2), registry.state("\u6280\u80FD\u80CC\u666F\u4F18\u5148")), Reflect.apply(original, this, args);
        }), local.patch(scene, "SetWallPaperById", (original) => function(...args) {
          var _a3;
          if (args[1])
            return b2.yielded = !0, registry.yieldedScene = scene, (_a3 = b2.hideFill) == null || _a3.call(b2), Reflect.apply(original, this, args);
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
        let dispatcher = (_i = (_h = this.game).getDispatcher) == null ? void 0 : _i.call(_h), event = ((_j = dispatcher == null ? void 0 : dispatcher.constructor) == null ? void 0 : _j.BACKGROUND_USEDID_GOT) || "BACKGROUND_USEDID_GOT", entries = (_k = dispatcher == null ? void 0 : dispatcher._events) == null ? void 0 : _k[event];
        for (let handler of Array.isArray(entries) ? entries : [entries])
          if ((handler == null ? void 0 : handler.caller) === scene && handler.method === originalById) {
            let redirected = scene.SetWallPaperById;
            handler.method = redirected, local.add(() => {
              handler.caller === scene && handler.method === redirected && (handler.method = originalById);
            });
          }
        b2.yielded || scene.onWallPaperChange();
        let playSkinMotion = choice.skinMotion && !((_m = (_l = this.window).matchMedia) != null && _m.call(_l, "(prefers-reduced-motion: reduce)").matches), playWallpaperMotion = choice.wallpaperMotion && !((_o = (_n = this.window).matchMedia) != null && _o.call(_n, "(prefers-reduced-motion: reduce)").matches);
        if ((choice.dynamic || playSkinMotion || playWallpaperMotion) && choice.animated !== !1) {
          let motionScope = new ResourceScope();
          local.add(() => motionScope.dispose());
          let fail2 = (message) => {
            local.closed || (b2.motionError = message, motionScope.dispose(), b2.motion = null, this.refresh());
          };
          try {
            let options = {
              window: this.window,
              layer,
              scope: motionScope,
              ready: () => {
                local.closed || this.refresh();
              },
              fail: fail2
            };
            b2.motion = playWallpaperMotion ? createWallpaperMotion({ ...options, spec: choice.wallpaperMotion }) : choice.skinMotion ? createSkinBackgroundMotion({
              ...options,
              load: (signal) => {
                var _a3, _b3;
                return (_b3 = this.skinMotion) == null ? void 0 : _b3.call(this, choice.skinKey, signal, { imageUrl: (_a3 = this.localImage) == null ? void 0 : _a3.objectUrl, quality: skinQuality });
              },
              imageUrl: (_p = this.localImage) == null ? void 0 : _p.objectUrl
            }) : createBackgroundMotion({ ...options, spec: choice.dynamic, size: choice.dynamic }), motionScope.closed && (b2.motion = null), b2.motion && supportsSkinBackgroundAttack(choice.dynamic) && (b2.syncAttackSeat = watchBackgroundAttack(this.game, scene, motionScope, () => {
              var _a3, _b3, _c2;
              eligible() && ((_a3 = layer.bg) == null ? void 0 : _a3.skin) === choice.url && ((_c2 = (_b3 = b2.motion) == null ? void 0 : _b3.playAttack) == null || _c2.call(_b3));
            })), layer.updateBgSize();
          } catch (error) {
            fail2((error == null ? void 0 : error.stack) || String(error));
          }
        }
      }
      scene.currentWeatherWallPaper || this.binding.yielded ? (_r = (_q = this.binding).hideFill) == null || _r.call(_q) : this.binding.syncMotion();
      let b = this.binding;
      b.motion && ((_s = b.syncAttackSeat) == null || _s.call(b, choice.attackEffects !== !1)), this.state(scene.currentWeatherWallPaper || b.yielded ? "\u6280\u80FD\u80CC\u666F\u4F18\u5148" : b.motionError ? "\u52A8\u6001\u80CC\u666F\u5931\u8D25\uFF0C\u5DF2\u663E\u793A\u9759\u6001\u539F\u753B\uFF1A" + b.motionError : (_t = b.motion) != null && _t.unsuitableSize ? "\u5F53\u524D\u7A97\u53E3\u6BD4\u4F8B\u4E0D\u9002\u5408\u52A8\u6001\u6784\u56FE\uFF0C\u5DF2\u663E\u793A\u9759\u6001\u539F\u753B" : b.motion ? b.motion.loaded ? "\u52A8\u6001\u724C\u5C40\u80CC\u666F\u5DF2\u542F\u7528" : "\u6B63\u5728\u52A0\u8F7D\u52A8\u6001\u80CC\u666F\uFF0C\u6682\u663E\u9759\u6001\u539F\u753B" : "\u9759\u6001\u724C\u5C40\u80CC\u666F\u5DF2\u542F\u7528");
    }
  }, BLACK_GOLD = { id: "core.black-gold", name: "\u7384\u91D1", tokens: { bg: "#201e1a", surface: "#2c2922", raised: "#383327", text: "#eee3cc", muted: "#b7aa8c", accent: "#dbba70", border: "#665b42", danger: "#f3988c", radius: "10px", font: '"Microsoft YaHei", system-ui, sans-serif', motion: "240ms", scheme: "dark" } }, DECORATIVE_COLOR_TOKENS = Object.freeze(["bg2", "accent2"]), GRADIENT_TOKENS = Object.freeze(["backdrop", "card", "compact"]), OPTIONAL_THEME_TOKENS = Object.freeze([...DECORATIVE_COLOR_TOKENS, ...GRADIENT_TOKENS]), allowed = Object.keys(BLACK_GOLD.tokens), safeScalar = (value) => typeof value == "string" && value.length > 0 && value.length < 180 && !/[;{}]|url\s*\(/i.test(value), gradientHead = /^(?:repeating-)?(?:linear|radial|conic)-gradient\(/i;
  function isSafeGradient(value) {
    if (typeof value != "string") return !1;
    let trimmed = value.trim();
    if (!trimmed || trimmed.length > 1200) return !1;
    if (trimmed === "none") return !0;
    if (/[;{}<>\\]|\/\*|\*\/|url\s*\(|image-set\s*\(|expression\s*\(|@import/i.test(trimmed)) return !1;
    let layers = [], depth = 0, start = 0;
    for (let i2 = 0; i2 < trimmed.length; i2++) {
      let ch = trimmed[i2];
      if (ch === "(") depth++;
      else if (ch === ")") {
        if (--depth < 0) return !1;
      } else ch === "," && depth === 0 && (layers.push(trimmed.slice(start, i2).trim()), start = i2 + 1);
    }
    return depth !== 0 ? !1 : (layers.push(trimmed.slice(start).trim()), layers.length > 0 && layers.length <= 8 && layers.every((layer) => gradientHead.test(layer) && layer.endsWith(")")));
  }
  function clean(tokens) {
    let result = {};
    for (let k of allowed) safeScalar(tokens == null ? void 0 : tokens[k]) && (k !== "scheme" || ["light", "dark"].includes(tokens[k])) && (result[k] = tokens[k]);
    for (let k of DECORATIVE_COLOR_TOKENS) safeScalar(tokens == null ? void 0 : tokens[k]) && (result[k] = tokens[k]);
    for (let k of GRADIENT_TOKENS) isSafeGradient(tokens == null ? void 0 : tokens[k]) && (result[k] = tokens[k].trim());
    return result;
  }
  var ThemeRegistry = class {
    constructor(settings, apply = () => {
    }, palettes = []) {
      this.settings = settings, this.apply = apply, this.themes = /* @__PURE__ */ new Map([[BLACK_GOLD.id, BLACK_GOLD]]);
      for (let palette of palettes) this.themes.set(palette.id, { ...palette, tokens: clean(palette.tokens) });
      this.layers = /* @__PURE__ */ new Map(), this.listeners = /* @__PURE__ */ new Set(), this.refresh();
    }
    register(theme, owner = "core") {
      if (!(theme != null && theme.id) || !theme.id.startsWith(owner + ".")) throw new Error("\u4E3B\u9898 ID \u5FC5\u987B\u4EE5\u63D2\u4EF6 ID \u4E3A\u524D\u7F00\u3002");
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
      for (let k of GRADIENT_TOKENS) tokens[k] === "none" && delete tokens[k];
      this.current = { id: theme.id, tokens }, this.apply(tokens);
      for (let fn of [...this.listeners])
        try {
          fn(this.current);
        } catch (error) {
          console.warn("[\u5DE5\u5177\u7BB1\u4E3B\u9898\u8BA2\u9605]", error);
        }
    }
  }, THEMES = [
    { id: "themes.jade", name: "\u9752\u74F7", description: "\u58A8\u7EFF\u5E95\u8272\uFF0C\u6E29\u6DA6\u9752\u7389", tokens: {
      bg: "#15211f",
      surface: "#1d2d28",
      raised: "#2c4037",
      text: "#e1ede6",
      muted: "#a7bfb1",
      accent: "#a2cbaa",
      border: "#486556",
      danger: "#f0a29a"
    } },
    { id: "themes.blue", name: "\u9701\u84DD", description: "\u6DF1\u6D77\u9759\u591C\uFF0C\u6E05\u900F\u5929\u9752", tokens: {
      bg: "#161f2c",
      surface: "#202d3f",
      raised: "#2d3d52",
      text: "#e1eaf4",
      muted: "#a7bbd3",
      accent: "#91bcee",
      border: "#4b6382",
      danger: "#efaaa6"
    } },
    { id: "themes.violet", name: "\u7D2B\u5BB8", description: "\u70DF\u7D2B\u5C42\u6B21\uFF0C\u6DE1\u85E4\u5FAE\u5149", tokens: {
      bg: "#221d2a",
      surface: "#302737",
      raised: "#403348",
      text: "#eee6f2",
      muted: "#c1aecb",
      accent: "#c9a6df",
      border: "#6d577c",
      danger: "#f0a29a"
    } },
    { id: "themes.cinnabar", name: "\u6731\u7802", description: "\u6697\u7EA2\u6F06\u8272\uFF0C\u67D4\u548C\u7EEF\u971E", tokens: {
      bg: "#281b1c",
      surface: "#372527",
      raised: "#493236",
      text: "#f3e3de",
      muted: "#cfb0a7",
      accent: "#e9a590",
      border: "#79554f",
      danger: "#ff9caa"
    } },
    { id: "themes.silver", name: "\u971C\u94F6", description: "\u51B7\u7070\u7559\u767D\uFF0C\u7D20\u51C0\u94F6\u8F89", tokens: {
      bg: "#1c2229",
      surface: "#272f39",
      raised: "#36404d",
      text: "#e8edf2",
      muted: "#b3bfcc",
      accent: "#c5d3e3",
      border: "#5b6a7d",
      danger: "#f0a29a"
    } },
    { id: "themes.ricepaper", name: "\u5BA3\u7EB8", description: "\u6696\u767D\u7EB8\u8272\uFF0C\u58A8\u5B57\u8336\u91D1", tokens: {
      bg: "#faf7ef",
      surface: "#f3eee2",
      raised: "#e9e1d1",
      text: "#342e25",
      muted: "#62594b",
      accent: "#77521d",
      border: "#b7a78c",
      danger: "#a12c35",
      scheme: "light"
    } },
    { id: "themes.daybreak", name: "\u6674\u5C9A", description: "\u6E05\u6D45\u5929\u5149\uFF0C\u8FDC\u5C71\u9752\u84DD", tokens: {
      bg: "#f4f8fb",
      surface: "#eaf1f6",
      raised: "#dce7ef",
      text: "#243849",
      muted: "#4b6071",
      accent: "#23597c",
      border: "#9cb3c4",
      danger: "#a12c40",
      scheme: "light"
    } },
    { id: "themes.blossom", name: "\u6843\u592D", description: "\u67D4\u767D\u80ED\u8102\uFF0C\u6DE1\u96C5\u6625\u6843", tokens: {
      bg: "#fcf6f5",
      surface: "#f6ebe9",
      raised: "#edddda",
      text: "#442e32",
      muted: "#6e545a",
      accent: "#853b50",
      border: "#c3a2a6",
      danger: "#a12b36",
      scheme: "light"
    } }
  ], icon = (...paths) => Object.freeze({ paths: Object.freeze(paths) }), CARDS_ICON = /* @__PURE__ */ icon(
    "M9 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
    "M4 5 2 6l2 14M14 7l3 5-3 5-3-5Z"
  ), SHANHETU_ICON = /* @__PURE__ */ icon(
    "M3 5 9 3l6 2 6-2v16l-6 2-6-2-6 2Z",
    "M6 12 10 7l4 5 3-3 2 3",
    "M6 16c3-3 7 3 12-1"
  ), DAILY_REWARDS_ICON = /* @__PURE__ */ icon(
    "M3 8h18v4H3ZM5 12v9h14v-9M12 8v13",
    "M12 8H8a3 3 0 1 1 3-3ZM12 8h4a3 3 0 1 0-3-3Z"
  ), EFFECTS_ICON = /* @__PURE__ */ icon(
    "M9 5 11 2l2.5 7.5L21 12l-4 1.5M14.5 16 12 22l-2.5-7.5L2 12l5-2",
    "M3 3 21 21M19 3v4M17 5h4"
  ), SKINS_ICON = /* @__PURE__ */ icon(
    "M8 3 12 5l4-2 6 5-4 4-2-2v11H8V10l-2 2-4-4Z",
    "M8 3l8 9M16 3l-6 7M8 16h8"
  ), THEMES_ICON = /* @__PURE__ */ icon(
    "M12 21 2 8a16 16 0 0 1 20 0Z",
    "M12 21 7 5.3M12 21V4.5M12 21 17 5.3",
    "M10 19a3 3 0 0 1 4 0"
  ), TOOLBOX_ICON = /* @__PURE__ */ icon(
    "M3 7h18v13H3ZM8 7V4h8v3M3 12h6M15 12h6",
    "M12 9l3 3-3 3-3-3Z"
  ), markup = Object.freeze({
    cards: CARDS_ICON,
    gift: DAILY_REWARDS_ICON,
    effects: EFFECTS_ICON,
    skins: SKINS_ICON,
    palette: THEMES_ICON,
    typography: '<path d="M3 19 9 5l6 14M5 14h8M16 9h6M19 9v10M16 19h6"/>',
    toolbox: TOOLBOX_ICON,
    map: SHANHETU_ICON,
    tools: '<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V4h8v3M3 12h18M10 11v3h4v-3"/>',
    settings: '<path d="M12 3l2 3 4-1 1 4 3 3-3 3-1 4-4-1-2 3-2-3-4 1-1-4-3-3 3-3 1-4 4 1z"/><circle cx="12" cy="12" r="3"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 6v1"/>',
    search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4.5 4.5"/>',
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
    arrowUp: '<path d="M12 20V4m-6 6 6-6 6 6"/>',
    arrowDown: '<path d="M12 4v16m-6-6 6 6 6-6"/>',
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
  var validReleaseNotes = (value) => value === void 0 || typeof value == "string" && value.trim().length > 0 && value.length <= 2e3 && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), DEFAULT_PLUGIN_PRIORITY = 32768, PANEL_CATEGORIES = Object.freeze(["game", "automation", "tools", "manage", "info", "appearance"]), localId = /^[a-z][a-z0-9.-]{0,63}$/, stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/, validPriority = (value) => Number.isInteger(value) && value >= 0 && value <= 65535;
  function requirePriority(value) {
    if (!validPriority(value)) throw new Error("\u6392\u5E8F\u4F18\u5148\u7EA7\u5FC5\u987B\u662F 0\u201365535 \u7684\u6574\u6570\u3002");
  }
  var text = (value, max2) => typeof value == "string" && value.trim().length > 0 && value.length <= max2 && !/[\r\n\u0000-\u001f]/.test(value);
  function compareVersions(left, right) {
    let a = left.split(".").map(BigInt), b = right.split(".").map(BigInt);
    for (let i2 = 0; i2 < 3; i2++) if (a[i2] !== b[i2]) return a[i2] > b[i2] ? 1 : -1;
    return 0;
  }
  function validatePluginPresentation(manifest, { requireContract = !1, checkCompatibility = !0 } = {}) {
    var _a2;
    let m = manifest;
    if (!m || typeof m != "object" || Array.isArray(m)) throw new Error("\u63D2\u4EF6\u6E05\u5355\u65E0\u6548\u3002");
    if (requireContract && m.contractVersion !== 1) throw new Error("\u65B0\u63D2\u4EF6\u5FC5\u987B\u58F0\u660E contractVersion: 1 \u5E76\u9075\u5B88\u63D2\u4EF6\u5F00\u53D1\u89C4\u8303\u3002");
    if (m.contractVersion !== void 0 && m.contractVersion !== 1) throw new Error("\u4E0D\u652F\u6301\u6B64\u63D2\u4EF6\u5F00\u53D1\u7EA6\u5B9A\u7248\u672C\u3002");
    if (!Array.isArray(m.categories) || m.categories.some((c) => !PANEL_CATEGORIES.includes(c)) || new Set(m.categories).size !== m.categories.length) throw new Error("\u63D2\u4EF6\u5206\u7C7B\u65E0\u6548\u6216\u91CD\u590D\u3002");
    if (m.journalEvents !== void 0 && (!Array.isArray(m.journalEvents) || m.journalEvents.length > 128 || [...m.journalEvents].some((type) => typeof type != "string" || !/^[a-z][a-z0-9_:-]{0,63}$/i.test(type)) || new Set(m.journalEvents).size !== m.journalEvents.length)) throw new Error("\u724C\u5C40\u4E8B\u4EF6\u8BA2\u9605\u5FC5\u987B\u662F\u4E0D\u91CD\u590D\u7684\u4E8B\u4EF6\u540D\u79F0\u6570\u7EC4\u3002");
    if (m.dependencies !== void 0 && (!Array.isArray(m.dependencies) || m.dependencies.length > 64 || m.dependencies.some((id) => typeof id != "string" || !localId.test(id) || id === m.id) || new Set(m.dependencies).size !== m.dependencies.length)) throw new Error("\u524D\u7F6E\u63D2\u4EF6\u5FC5\u987B\u662F\u4E0D\u91CD\u590D\u7684\u63D2\u4EF6 ID \u6570\u7EC4\uFF0C\u4E14\u4E0D\u80FD\u4F9D\u8D56\u81EA\u8EAB\u3002");
    if ((_a2 = m.dependencies) != null && _a2.length && (!stableVersion.test(m.minCoreVersion || "") || compareVersions(m.minCoreVersion, "0.5.62") < 0)) throw new Error("\u524D\u7F6E\u63D2\u4EF6\u529F\u80FD\u8981\u6C42 minCoreVersion \u81F3\u5C11\u4E3A 0.5.62\u3002");
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
    var _a2;
    if (!spec || typeof spec != "object" || typeof spec.id != "string" || !localId.test(spec.id)) throw new Error("\u9762\u677F ID \u5FC5\u987B\u662F\u7A33\u5B9A\u7684\u5C0F\u5199\u5C40\u90E8\u6807\u8BC6\u3002");
    if (typeof spec.render != "function") throw new Error("\u9762\u677F\u5FC5\u987B\u63D0\u4F9B render \u51FD\u6570\u3002");
    if (spec.title !== void 0 && !text(spec.title, 80)) throw new Error("\u9762\u677F\u6807\u9898\u5FC5\u987B\u662F 1\u201380 \u5B57\u7684\u5355\u884C\u6587\u5B57\u3002");
    let declared = manifest.categories, category = spec.category ?? (declared.length === 1 ? declared[0] : void 0);
    if (!PANEL_CATEGORIES.includes(category) || !declared.includes(category)) throw new Error("\u9762\u677F\u5206\u7C7B\u5FC5\u987B\u5728\u63D2\u4EF6 categories \u4E2D\u58F0\u660E\uFF1B\u591A\u5206\u7C7B\u63D2\u4EF6\u987B\u6307\u5B9A category\u3002");
    if (spec.priority !== void 0 && requirePriority(spec.priority), spec.gameView !== void 0 && (category !== "game" || !["battle", "shanhe"].includes(spec.gameView))) throw new Error("gameView \u4EC5\u7528\u4E8E game \u9762\u677F\uFF0C\u503C\u4E3A battle \u6216 shanhe\u3002");
    if (spec.groupWith !== void 0 && !((_a2 = manifest.dependencies) != null && _a2.includes(spec.groupWith))) throw new Error("\u9762\u677F\u53EA\u80FD\u5E76\u5165\u5DF2\u58F0\u660E\u7684\u524D\u7F6E\u63D2\u4EF6\u7EC4\u3002");
    if (spec.groupTab !== void 0 && (spec.groupTab !== !0 || !spec.groupWith || spec.title === void 0)) throw new Error("\u7EC4\u5185\u9875\u7B7E\u5FC5\u987B\u58F0\u660E\u524D\u7F6E\u63D2\u4EF6\u7EC4\u548C\u9875\u7B7E\u6807\u9898\u3002");
    if (spec.groupTabs !== void 0 && (spec.groupTabs !== !0 || spec.groupWith)) throw new Error("\u53EA\u6709\u72EC\u7ACB\u63D2\u4EF6\u7EC4\u7684\u9762\u677F\u53EF\u4EE5\u627F\u8F7D\u7EC4\u5185\u9875\u7B7E\u3002");
    if ((spec.groupTab || spec.groupTabs) && (!stableVersion.test(manifest.minCoreVersion || "") || compareVersions(manifest.minCoreVersion, "0.6.121") < 0))
      throw new Error("\u7EC4\u5185\u9875\u7B7E\u8981\u6C42 minCoreVersion \u81F3\u5C11\u4E3A 0.6.121\u3002");
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
  var PACKAGE_FORMAT = "sgs-toolbox-plugin-v1";
  function canonical(value) {
    return Array.isArray(value) ? "[" + value.map(canonical).join(",") + "]" : value && typeof value == "object" ? "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonical(value[k])).join(",") + "}" : JSON.stringify(value);
  }
  async function packageDigest(manifest, code, cryptoImpl = globalThis.crypto) {
    let bytes2 = new TextEncoder().encode(canonical(manifest) + `
` + code);
    return Array.from(new Uint8Array(await cryptoImpl.subtle.digest("SHA-256", bytes2)), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  function validateManifest(m, options) {
    if (!m || !/^[a-z][a-z0-9.-]{0,63}$/.test(m.id) || typeof m.name != "string" || !m.name.trim() || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(m.version)) throw new Error("\u63D2\u4EF6\u540D\u79F0\u3001ID \u6216\u7248\u672C\u65E0\u6548\u3002");
    if (m.apiVersion !== 1) throw new Error("\u63D2\u4EF6\u9700\u8981\u4E0D\u517C\u5BB9\u7684\u6838\u5FC3 API\u3002");
    validatePluginPresentation(m, options);
  }
  async function verifyPackage(pkg) {
    if ((pkg == null ? void 0 : pkg.format) !== PACKAGE_FORMAT || typeof pkg.code != "string" || pkg.code.length > 10 * 1024 * 1024) throw new Error("\u63D2\u4EF6\u5305\u683C\u5F0F\u4E0D\u6B63\u786E\u6216\u8D85\u8FC7 10 MB\u3002");
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
  var CONSOLIDATED_PACKAGE_DIGESTS = {
    shanhetu: [
      "082236c181b0482dd6bcbcbd7c7e2c9adbe3fbf00a01c4575c14e22aa53a6cad",
      "164df50f777eee9c554ee324ce99da8e569bbe4ad21aa10ed99a672690d9397d",
      "ca03e331f1dd6f1bb0f9a952d4ef4edf2630d8c9dae2e1d0af1e7b935a5cc4ab",
      "57a4cfd8c4c49dfd5353456041be215dfbbe2ed6ea09d790c626edb2ccf3d663",
      "d21d5f6ba506a50f0d9e466e49e5b8cc2f21f0821d2ba65898b6bfba1dadf58e",
      "fbad88e6ad917a085d2833231db6f7fed8467b0d71d32e9bb330fcf56bc70069",
      "54a8da77c89f5c6ba3d6128261c33db069f32052ff9db5736d134f24586f975e"
    ],
    "player-info": [
      "0fbb7a1bf9f3447cd2c07ee21a84285c588c58a07fd8bf08b589f6e71b3bba68",
      "58f268e5b1e60da4b1177cf84c7b02f76331c99669e0dc74b614a22e4f8c80f9",
      "43a162e8d94e64e2d82472c1e6a9470d14e9523b043218cbcbc857de9681d4d3",
      "49a4f41653aabb6f1a7fe8e50d15c6fe6140d0eb5357b500ee946e134d58d9c9",
      "137de51e07acf360074aba07283559f9c8e91b6a7559daa95a74a6e62217ec5c",
      "bf8c5cb8458948f3f7b6858a046b34feba9bae5cd0351b7399ae68df4ae90e9d",
      "fb45a55aacc3c8c924bafb7e33ca84286b7eaf8fec07c868fa89d0c5db4f31ca",
      "780cd1f804a0f9df57e02cbfad8f1f453d34349b29b79136e8ece6430f06e9e5",
      "742c458b983a8888ceb338087e8c147f47546f04c929d88bbc695fd123f01e41"
    ],
    ledger: [
      "2fec527eb8eb0662749aa1610371715c7b24d5e4c21f7be968b885dbd9b61312",
      "463721eeed62ae69025bb0b0b53fb95fd15225d2423da5e74ff14307cb7c6edc",
      "f1b3bea02d69b4bf14b1a253a46351067c60cd9af05cc2e0d5a163ee37ff8cc4",
      "07f3f27091cf54c8c7227faf56bb8604c9ab72d3e543c00fdf00aefd4e89abb6",
      "43ea981f26eb499464401fb79aacf98f66fdb93ebd86b99ab247e0dff670e48c",
      "f05df4a84dfc8c991e389b7d0be26ca229453bea1be7fd511ac8d2c558783e1a",
      "91b2b39bbedebf1ff5939ca5fd31d5d4f5d7debf5c67a67aaf07105d66f210de",
      "10c7edaf11b31208d51f9148dc4662510c93eb67914fdc1b92996b8f02b54a25",
      "4150b1bad5420ab0cc4d17603676aa0501d02ba9670e2105cf8c81c3b48cd5ac"
    ],
    "shanhetu-beta": [
      "d9aa77f6bb90d372a29fe1d98c20ceda3c46de311bbce805ead175f10c239715",
      "8f2665cb90c7bf757617dfa605bafa463275bca7f7d074d1ccee0a9becd64b5b"
    ],
    "general-pools": [
      "e73a800ca0330d6c583455449e54a2241a1693d9f47467cdca4169130dbdaaea"
    ],
    "wish-progress": [
      "704171a5ca3c1c2d3f51373af8efdb56af17586619978e030a1010870cc9b0b3",
      "bd7b8ea40bce5789378875f648fca9d0a40ba7977517f2f4879f70a7cab4522e",
      "9f74c88707a3887f9ec62bc4ff7bfc808bd7fb69a8f6005323cc8ad114ca2fe4"
    ],
    "native-cards": [
      "22950fcd5b71918f6f7c35166726c51aaa016581bff5047e29f0b19454732592"
    ],
    "gold-cards": [
      "223cb665ae968062d24d4cf2f4757f8508e47f20c7e162da08eabf9e3dc5ecba"
    ],
    "yjcm-cards": [
      "91fc886373bd9991a8582ac805dc20548b1c2d549f4e969016d551469cd63382",
      "63ec4317e93a6b215790b9865bd8d8b887676a5c00d118eff2ff7d4f79765ac4"
    ],
    "dafeiyu-cards": [
      "8ad857e49ca44304963b9e8918f60e9c0569b1793da05e90073d360b22a1ab9f",
      "54eac14b53d86450fcf8901dab2a391e3492a5c1b20d2d8b55c8151172be5629",
      "c3ee772bf9bf1e17754145f93999eed01ca4cc042a25a846605b50164e0e7752",
      "3792c5fd8f9aac3abd4351db6a77ca95ae22ee9510f293a78a853b8e269ee6e8",
      "00cef6e26828ae31ffdf5f12d3bc3843d1a55441cb692486363f8c28c44fab0b",
      "93745de01d1020b1cb7f6e412dab86c6b0d05129d70f36ceb0b2091445ddcae2"
    ],
    themes: [
      "554a80c4d9b62ed718941613867d51da524dcb191b823a7a79ea2ec72b39e666",
      "eae835ca2fca5e48d607b4186e011992bb4eab88456b6543d1768d8891b0d8d2",
      "ed1049987473a1ba477470f143d9bada0b2223cfa78227d29a6e67e0d53f0615"
    ]
  }, CARD_STYLES = "card-styles-extra", groups = [
    { target: "shanhetu", sources: ["shanhetu-beta"], preference: "showExtra", mergedDigests: MERGED_SHANHETU_PACKAGES },
    { target: "player-info", sources: ["general-pools"], preference: "generalPools" },
    { target: "ledger", sources: ["wish-progress"] },
    { target: CARD_STYLES, sources: ["native-cards", "gold-cards", "yjcm-cards", "dafeiyu-cards"] },
    { target: "core", sources: ["themes"] }
  ], knownDigests = {
    ...CONSOLIDATED_PACKAGE_DIGESTS,
    shanhetu: [...CONSOLIDATED_PACKAGE_DIGESTS.shanhetu, ...REPLACED_SHANHETU_PACKAGES],
    "shanhetu-beta": [...CONSOLIDATED_PACKAGE_DIGESTS["shanhetu-beta"], ...REPLACED_SHANHETU_BETA_PACKAGES],
    themes: [...CONSOLIDATED_PACKAGE_DIGESTS.themes, ...REPLACED_THEME_PACKAGES]
  };
  function savedPackage(record) {
    var _a2;
    return (record == null ? void 0 : record.active) || ((_a2 = record == null ? void 0 : record.previous) != null && _a2.builtin ? null : record == null ? void 0 : record.previous);
  }
  async function verifiedPackage(id, pkg, digests) {
    var _a2;
    return ((_a2 = pkg == null ? void 0 : pkg.manifest) == null ? void 0 : _a2.id) !== id || !digests.includes(pkg.sha256) ? !1 : !!await verifyPackage(pkg).catch(() => null);
  }
  async function reconcileConsolidatedPlugins(records, builtins, store, settings, targetDigests) {
    var _a2;
    let changes = [];
    for (let { target, sources, preference, mergedDigests = [] } of groups) {
      let bundled = (_a2 = builtins.get(target)) == null ? void 0 : _a2.bundledPackage, installed = records.get(target), active = savedPackage(installed), applied = (installed == null ? void 0 : installed.appliedBuiltinMigrations) || [], knownPrevious = active && await verifiedPackage(target, active, knownDigests[target] || []), previousMerged = active && await verifiedPackage(target, active, mergedDigests), mergedInstalled = previousMerged || active && await verifiedPackage(target, active, [targetDigests[target]]), legacy = [];
      for (let id of sources) {
        let row = records.get(id);
        await verifiedPackage(id, savedPackage(row), knownDigests[id]) && legacy.push(row);
      }
      let upgrade = bundled && (knownPrevious || previousMerged) && active.sha256 !== bundled.sha256 && !installed.uninstalled && !applied.includes(active.sha256);
      if (!(target === "core" || mergedInstalled || upgrade || bundled && !active)) {
        if (knownPrevious && !installed.uninstalled) for (let row of legacy) {
          if (row.mergedInto !== target) continue;
          let restored = { ...row, uninstalled: !1 };
          delete restored.mergedInto, changes.push(restored);
        }
        continue;
      }
      upgrade && changes.push({
        ...installed,
        active: bundled,
        previous: active,
        appliedBuiltinMigrations: [...applied, active.sha256]
      });
      let retiring = legacy.filter((row) => !row.uninstalled), explicitlyOff = sources.map((id) => records.get(id)).filter((row) => row && (row.uninstalled ? !row.mergedInto : retiring.includes(row) && row.enabled === !1));
      if (preference && explicitlyOff.length) {
        let options = settings.namespace(target);
        options.get(preference) === void 0 && options.set(preference, !1);
      }
      if (target === CARD_STYLES && explicitlyOff.length) {
        let value = settings.get("inactiveLegacyCardPacks", []), inactive = new Set(Array.isArray(value) ? value : []);
        for (let row of explicitlyOff) inactive.add(row.id);
        (!Array.isArray(value) || inactive.size !== value.length) && settings.set("inactiveLegacyCardPacks", [...inactive]), !installed && bundled && !legacy.some((row) => !row.uninstalled && row.enabled !== !1) && changes.push({ id: target, enabled: !1, uninstalled: !1, active: bundled, previous: null });
      }
      for (let row of retiring) changes.push({ ...row, uninstalled: !0, mergedInto: target });
    }
    if (changes.length) {
      await store.putMany(changes);
      for (let row of changes) records.set(row.id, row);
    }
  }
  var CONTROL_STYLES = `
/* Keep both states visible before the microclient's theme compatibility pass. */
input.sgs-switch[type=checkbox]{appearance:none;-webkit-appearance:none;position:relative;display:inline-block;flex:0 0 30px;width:30px;height:18px;min-width:30px;margin:0;padding:0;border:1px solid var(--sgs-border,#665b42);border-radius:12px;background-color:var(--sgs-bg,#201e1a);background-image:linear-gradient(transparent,var(--sgs-surface,#2c2922));box-shadow:inset 0 1px 3px #0004;vertical-align:middle;cursor:pointer;transition:background-color .16s,border-color .16s}
input.sgs-switch[type=checkbox]::before{content:'';position:absolute;top:3px;left:3px;width:10px;height:10px;border-radius:50%;background-color:var(--sgs-muted,#b7aa8c);background-image:linear-gradient(#fff2,transparent);box-shadow:0 1px 2px #0005;transition:transform .16s,background-color .16s}
input.sgs-switch[type=checkbox]:checked{background-color:var(--sgs-accent,#dbba70);background-image:linear-gradient(#fff1,var(--sgs-accent,#dbba70));border-color:var(--sgs-accent,#dbba70)}
input.sgs-switch[type=checkbox]:checked::before{transform:translateX(12px);background-color:var(--sgs-bg,#201e1a)}
input.sgs-switch[type=checkbox]:focus-visible{outline:1px solid var(--sgs-accent,#dbba70);outline-offset:2px}input.sgs-switch:disabled{opacity:.4;cursor:not-allowed}
select.sgs-select,input.sgs-input{box-sizing:border-box;min-width:0;max-width:100%;height:32px;border:1px solid color-mix(in srgb,var(--sgs-border,#665b42) 65%,transparent);border-radius:7px;background-color:var(--sgs-bg,#201e1a);box-shadow:inset 0 1px 3px #0003;color:var(--sgs-text,#eee3cc);font:12px/1.4 var(--sgs-font,sans-serif)}
select.sgs-select{appearance:none;-webkit-appearance:none;padding:5px 27px 5px 9px;background-image:linear-gradient(45deg,transparent 50%,var(--sgs-muted,#b7aa8c) 50%),linear-gradient(135deg,var(--sgs-muted,#b7aa8c) 50%,transparent 50%);background-repeat:no-repeat;background-size:4px 4px;background-position:right 13px center,right 9px center;cursor:pointer;text-overflow:ellipsis}
select.sgs-select option{background:var(--sgs-bg,#201e1a);color:var(--sgs-text,#eee3cc)}input.sgs-input{padding:5px 9px}
select.sgs-select:focus-visible,input.sgs-input:focus-visible{outline:1px solid var(--sgs-accent,#dbba70);outline-offset:1px;border-color:var(--sgs-accent,#dbba70)}
.sgs-fold>summary{display:flex;align-items:center;gap:8px;list-style:none;cursor:pointer;user-select:none;padding:10px 0;color:var(--sgs-muted,#b7aa8c);font-size:12px}.sgs-fold>summary::-webkit-details-marker{display:none}.sgs-fold>summary::after{content:'';width:5px;height:5px;margin-left:auto;margin-right:3px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);transition:transform .16s}.sgs-fold[open]>summary{color:var(--sgs-accent,#dbba70)}.sgs-fold[open]>summary::after{transform:rotate(225deg)}.sgs-fold>summary:focus-visible{outline:1px solid var(--sgs-accent,#dbba70);outline-offset:2px}
.sgs-segments{display:flex;gap:2px;padding:3px;border-radius:8px;background:#0002;background:color-mix(in srgb,var(--sgs-border,#665b42) 16%,var(--sgs-surface,#2c2922));box-shadow:inset 0 1px 3px #0002}.sgs-segments>button{flex:1;min-width:0;min-height:26px;border:0;border-radius:5px;background:transparent;box-shadow:none;color:var(--sgs-muted,#b7aa8c);padding:4px 6px;font-size:11px;line-height:1.35}.sgs-segments>button.is-active,.sgs-segments>button[aria-pressed=true]{color:var(--sgs-accent,#dbba70);background:linear-gradient(color-mix(in srgb,var(--sgs-accent,#dbba70) 18%,transparent),color-mix(in srgb,var(--sgs-accent,#dbba70) 7%,transparent));box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-accent,#dbba70) 14%,transparent),0 1px 3px #0003}
.sgs-line-icon{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;flex:none}
@media(prefers-reduced-motion:reduce){input.sgs-switch[type=checkbox],input.sgs-switch[type=checkbox]::before,.sgs-fold>summary::after{transition:none}}
`;
  function controlIcon(doc, name) {
    return createIcon(doc, name);
  }
  function styleSwitch(input) {
    return input.classList.add("sgs-switch"), input.setAttribute("role", "switch"), input;
  }
  function helpTip(doc, text3, label = "\u8BF4\u660E") {
    let wrap = doc.createElement("span"), button = doc.createElement("button"), tip = doc.createElement("span");
    wrap.className = "sgs-help-tip", wrap.style.cssText = "display:inline-flex;align-items:center;flex:0 0 auto;vertical-align:middle;margin:0;line-height:1", button.dataset.helpTip = "", button.type = "button", button.setAttribute("aria-label", label), button.title = text3, button.style.cssText = "box-sizing:border-box;display:inline-grid;place-items:center;flex:none;width:24px;height:24px;min-width:24px;min-height:24px;margin:0;padding:3px;border:0;background:transparent;box-shadow:none;color:var(--sgs-muted);cursor:help;border-radius:50%";
    let icon2 = controlIcon(doc, "info");
    icon2.style.margin = "0", button.append(icon2), tip.textContent = text3, tip.setAttribute("popover", "manual"), tip.setAttribute("role", "tooltip"), tip.style.cssText = "position:fixed;inset:auto;margin:0;padding:10px 12px;max-width:min(300px,calc(100vw - 24px));width:max-content;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.7 var(--sgs-font,sans-serif);color:var(--sgs-text);background:var(--sgs-raised);border:1px solid var(--sgs-border);border-radius:8px;box-shadow:0 6px 24px #0004";
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
  var INFO_STYLES = `
.sgs-info{min-width:0;color:var(--sgs-text);font:12px/1.65 var(--sgs-font,sans-serif)}
.sgs-info *{box-sizing:border-box}.sgs-info [hidden]{display:none!important}
.sgs-info p{margin:0 0 10px;overflow-wrap:anywhere}.sgs-info .muted{color:var(--sgs-muted);font-size:11px}
.sgs-info .bar{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin:9px 0}.sgs-info .bar>*{min-width:0}
.sgs-info button{min-height:30px;border:1px solid color-mix(in srgb,var(--sgs-border) 65%,transparent);border-radius:7px;background:linear-gradient(var(--sgs-raised),var(--sgs-surface));color:var(--sgs-text);padding:4px 9px;font:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:5px}
.sgs-info button:hover{color:var(--sgs-accent);border-color:var(--sgs-accent)}.sgs-info button:focus-visible,.sgs-info summary:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}
.sgs-info button:disabled{opacity:.45;cursor:not-allowed}.sgs-info .primary{color:var(--sgs-accent)}.sgs-info .danger{color:var(--sgs-danger)}
.sgs-info .sgs-segments{margin:8px 0}.sgs-info .sgs-segments>button{border:0;background:transparent;padding:4px;font-size:11px}.sgs-info .sgs-segments>button[aria-pressed=true]{background:color-mix(in srgb,var(--sgs-accent) 12%,transparent)}
.sgs-info input.sgs-input{width:100%}.sgs-info input[type=number]{appearance:textfield;-moz-appearance:textfield}.sgs-info input[type=number]::-webkit-inner-spin-button,.sgs-info input[type=number]::-webkit-outer-spin-button{appearance:none;margin:0}.sgs-info .filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.sgs-info .filters label{color:var(--sgs-muted);font-size:11px;min-width:0}
.sgs-info .filters label.filter-full{grid-column:1/-1}.sgs-info .filters label:has(input[type=datetime-local]){grid-column:1/-1}
.sgs-info .stat{display:flex;align-items:baseline;gap:6px;margin:10px 0;font-variant-numeric:tabular-nums}.sgs-info .stat strong{font-size:25px;font-weight:600;color:var(--sgs-accent)}
.sgs-info .list{max-height:430px;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}.sgs-info .row{padding:10px 0;border-top:1px solid color-mix(in srgb,var(--sgs-border) 60%,transparent)}
.sgs-info .row-head{display:flex;justify-content:space-between;align-items:baseline;gap:6px}.sgs-info .name{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sgs-info .number{font-variant-numeric:tabular-nums;flex:none;font-size:11px}
.sgs-info progress.progress{appearance:none;display:block;width:100%;height:3px;border:0;border-radius:2px;background:var(--sgs-raised);margin:7px 0;overflow:hidden}.sgs-info progress::-webkit-progress-bar{background:var(--sgs-raised)}.sgs-info progress::-webkit-progress-value{background:var(--sgs-accent)}.sgs-info progress::-moz-progress-bar{background:var(--sgs-accent)}
.sgs-info details{font-size:11px;color:var(--sgs-muted)}.sgs-info summary{cursor:pointer}.sgs-info details p{white-space:pre-wrap;margin:6px 0;overflow-wrap:anywhere}
.sgs-info .error{color:var(--sgs-danger);white-space:pre-wrap;overflow-wrap:anywhere}.sgs-info .empty{padding:20px 4px;text-align:center;color:var(--sgs-muted)}
.sgs-info .metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3px;margin-top:6px;color:var(--sgs-muted);font-size:10px}.sgs-info .metrics b{display:block;font-size:14px;color:var(--sgs-text);font-variant-numeric:tabular-nums;font-weight:500}
`;
  function panelUI(ctx, container) {
    var _a2, _b2;
    let doc = ctx.document, cleanups = [], root = doc.createElement("section");
    root.className = "sgs-info";
    let el = (tag, cls, text3) => {
      let n = doc.createElement(tag);
      return cls && (n.className = cls), text3 !== void 0 && (n.textContent = text3), n;
    };
    container.append(root);
    let scheme = (current) => {
      var _a3;
      let hex2 = ((_a3 = current == null ? void 0 : current.tokens) == null ? void 0 : _a3.bg) || "", match = /^#([\da-f]{6})$/i.exec(hex2);
      if (match) {
        let rgb = [0, 2, 4].map((i2) => parseInt(match[1].slice(i2, i2 + 2), 16));
        root.style.colorScheme = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 140 ? "light" : "dark";
      }
    };
    scheme((_a2 = ctx.themes) == null ? void 0 : _a2.current), (_b2 = ctx.themes) != null && _b2.subscribe && cleanups.push(ctx.themes.subscribe(scheme));
    let listen = (node, type, fn) => {
      cleanups.push(ctx.scope.listen(node, type, fn));
    }, button = (text3, icon2, fn) => {
      let n = el("button", "", text3);
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
  function mountPluginUI(context2, getContext) {
    let { document: doc, scope } = context2;
    return doc != null && doc.createElement && scope.add(acquirePluginStyles(doc.head || doc.documentElement, doc)), {
      icon: (spec) => createIcon(doc, spec),
      styleSwitch,
      helpTip: (text3, label) => helpTip(doc, text3, label),
      panel: (container) => panelUI(getContext(), container),
      mountStyles: (root) => scope.add(acquirePluginStyles(root, doc))
    };
  }
  function advancedSkinOption(settings, key) {
    return settings.get("advanced", !0) === !0 && settings.get(key, !0) === !0;
  }
  var colorKeys = ["bg", "surface", "raised", "text", "muted", "accent", "border", "danger"], contexts = /* @__PURE__ */ new WeakMap(), textureCaches = /* @__PURE__ */ new WeakMap(), destruction = /* @__PURE__ */ new WeakMap(), channel = (n) => Math.max(0, Math.min(255, Math.round(n))), hex = (values) => "#" + values.map((n) => channel(n).toString(16).padStart(2, "0")).join("");
  function parseHex(value) {
    if (!/^#[\da-f]{3}(?:[\da-f]|[\da-f]{3}|[\da-f]{5})?$/i.test(value)) return null;
    let raw = value.slice(1);
    return raw.length <= 4 && (raw = [...raw].map((n) => n + n).join("")), [0, 2, 4].map((i2) => parseInt(raw.slice(i2, i2 + 2), 16)).concat(raw.length === 8 ? parseInt(raw.slice(6), 16) / 255 : 1);
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
        let bytes2 = ctx.getImageData(0, 0, 1, 1).data;
        rgba = [bytes2[0], bytes2[1], bytes2[2], bytes2[3] / 255];
      } catch {
      }
    }
    rgba ||= parseHex(fallback);
    let base = parseHex(background);
    return hex(rgba.slice(0, 3).map((v, i2) => v * rgba[3] + base[i2] * (1 - rgba[3])));
  }
  function mixNativeColors(a, b, amount = 0.5) {
    if (!Number.isFinite(amount)) throw new Error("\u539F\u751F\u4E3B\u9898\u6DF7\u8272\u6BD4\u4F8B\u5FC5\u987B\u662F\u6709\u9650\u6570\u503C");
    let left = parseHex(a), right = parseHex(b), ratio = Math.max(0, Math.min(1, amount));
    if (!left || !right) throw new Error("\u539F\u751F\u4E3B\u9898\u6DF7\u8272\u9700\u8981\u5341\u516D\u8FDB\u5236\u989C\u8272");
    return hex(left.slice(0, 3).map((v, i2) => v * (1 - ratio) + right[i2] * ratio));
  }
  function resolveNativePalette(tokens = {}, document2) {
    let p = {};
    for (let key of colorKeys) p[key] = color(tokens[key] ?? BLACK_GOLD.tokens[key], BLACK_GOLD.tokens[key], document2, p.bg);
    return p.bg2 = color(tokens.bg2 ?? p.bg, p.bg, document2, p.bg), p.accent2 = color(tokens.accent2 ?? p.accent, p.accent, document2, p.bg), Object.freeze({
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
    var _a2, _b2;
    for (let [key, entry] of cache2) {
      if (cache2.size <= 128) break;
      entry.pending || entry.refs || (cache2.delete(key), (_b2 = (_a2 = laya.loader).clearRes) == null || _b2.call(_a2, entry.uri));
    }
  }
  function surfaceSVG(p, width, height, { kind, selected, hover, disabled }) {
    let panel = kind === "panel", option = kind === "option", tab = kind === "tab" || kind === "segment", active = selected && !disabled, over = hover && !disabled, radius = panel ? 6 : option ? 3 : 5, accent = disabled ? p.muted : p.accent, accent2 = disabled ? p.muted : p.accent2 || p.accent, dualTone = p.bg2 && p.bg2 !== p.bg || accent2 !== accent, body;
    if (option || tab)
      body = `<defs><linearGradient id="wash"><stop stop-color="${accent}" stop-opacity="${active ? ".23" : ".09"}"/><stop offset="1" stop-color="${accent2}" stop-opacity="0"/></linearGradient></defs>` + (active || over ? `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="${radius}" fill="url(#wash)"/>` : "") + (active ? `<rect x="1" y="${option ? 7 : height - 2}" width="${option ? 2 : width - 2}" height="${option ? Math.max(1, height - 14) : 1}" rx="1" fill="${accent}"/>` : "");
    else {
      let endBg = panel ? p.shadow : dualTone ? p.bg2 : p.bg;
      body = `<defs><linearGradient id="base" ${dualTone ? 'x1="0" y1="0" x2="1" y2="1"' : 'x2="0" y2="1"'}><stop stop-color="${active ? p.selected : over ? p.hover : p.raised}"/><stop offset=".46" stop-color="${active ? mixNativeColors(p.surface, p.accent, 0.16) : p.surface}"/><stop offset="1" stop-color="${endBg}"/></linearGradient><linearGradient id="rim" ${dualTone ? 'x1="0" y1="0" x2="1" y2="1"' : 'x2="0" y2="1"'}><stop stop-color="${active ? accent : p.border}"/><stop offset=".5" stop-color="${dualTone && active ? accent2 : p.borderSoft}"/><stop offset="1" stop-color="${p.shadow}"/></linearGradient></defs><rect x="1" y="2" width="${width - 2}" height="${height - 3}" rx="${radius}" fill="#000" fill-opacity=".3"/><rect x=".5" y=".5" width="${width - 1}" height="${height - 2}" rx="${radius}" fill="url(#base)" stroke="url(#rim)"/><path d="M${radius + 1} 2H${width - radius - 1}" stroke="${p.highlight}" stroke-opacity="${panel ? ".16" : ".21"}"/>` + (active ? `<path d="M8 ${height - 3}H${width - 8}" stroke="${accent2}" stroke-opacity=".6"/>` : "");
    }
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`);
  }
  function createNativeTheme({ themes, scope, window: window2 = {}, document: document2 = window2.document } = {}) {
    let states = /* @__PURE__ */ new WeakMap(), lastSignature, palette = DEFAULT_NATIVE_PALETTE;
    function current() {
      var _a2;
      let tokens = ((_a2 = themes == null ? void 0 : themes.current) == null ? void 0 : _a2.tokens) || {}, signature = JSON.stringify([...colorKeys, "bg2", "accent2", "scheme"].map((key) => tokens[key]));
      return lastSignature !== signature && (lastSignature = signature, palette = resolveNativePalette(tokens, document2)), palette;
    }
    function watch(fn, { target } = {}) {
      var _a2;
      if (scope.closed || target != null && target.destroyed) return () => {
      };
      let off = () => {
      }, offDestroy = () => {
      }, active = !0, release = scope.add(() => {
        active = !1, off(), offDestroy();
      }), update = () => {
        if (!(!active || scope.closed)) {
          if (target != null && target.destroyed) {
            release();
            return;
          }
          fn(current());
        }
      };
      try {
        off = ((_a2 = themes == null ? void 0 : themes.subscribe) == null ? void 0 : _a2.call(themes, update)) || (() => {
        }), offDestroy = onDestroy(target, release), update();
      } catch (error) {
        throw release(), error;
      }
      return release;
    }
    function bind(target, properties) {
      var _a2;
      if (!target || scope.closed || target.destroyed) return () => {
      };
      let saved = /* @__PURE__ */ new Map(), applied = /* @__PURE__ */ new Map(), disposed = !1;
      for (let key of Object.keys(properties)) {
        let own3 = Object.getOwnPropertyDescriptor(target, key), inherited;
        for (let parent = Object.getPrototypeOf(target); parent && !inherited; parent = Object.getPrototypeOf(parent)) inherited = Object.getOwnPropertyDescriptor(parent, key);
        saved.set(key, { own: own3, setter: !!((_a2 = own3 || inherited) != null && _a2.set), value: target[key] });
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
      var _a2, _b2, _c;
      if (scope.closed || node != null && node.destroyed || !(node != null && node.graphics)) return;
      let p = current(), width = Number(options.width ?? node.width), height = Number(options.height ?? node.height);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width < 4 || height < 4 || width > 4096 || height > 4096) return;
      let config = { kind: options.kind || "button", selected: !!options.selected, hover: !!options.hover, disabled: !!options.disabled }, uri = surfaceSVG(p, width, height, config), laya = window2.Laya ?? window2.laya, state = states.get(node);
      if ((state == null ? void 0 : state.key) === uri && state.entry && (state.entry.texture || state.entry.pending)) return;
      if (!state) {
        state = { key: "", entry: null, cancel: () => {
        }, active: !0 }, states.set(node, state);
        let offDestroy = () => {
        }, release = scope.add(() => {
          state.active = !1, state.cancel(), state.entry && (state.entry.refs--, !node.destroyed && node._sgsNativeSurfaceKey === state.key && node.graphics.clear(), laya && prune(cacheFor(laya), laya)), offDestroy(), states.delete(node);
        });
        offDestroy = onDestroy(node, release);
      }
      if (state.cancel(), node.graphics.clear(), state.entry && state.entry.refs--, state.entry = null, state.key = uri, node._sgsNativeSurfaceKey = uri, node._sgsNativeSurfaceAppliedKey = "", ["option", "tab", "segment"].includes(config.kind) || node.graphics.drawRect(1, 1, width - 2, height - 2, p.surface), !((_a2 = laya == null ? void 0 : laya.loader) != null && _a2.load) || !((_b2 = laya == null ? void 0 : laya.Handler) != null && _b2.create)) return;
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
          }), null, (_c = laya.Loader) == null ? void 0 : _c.IMAGE);
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
      chevron(node, x2, y, open, ink = current().accent) {
        scope.closed || node != null && node.destroyed || (node.graphics.clear(), node.graphics.drawLines(x2, y, open ? [0, 3, 3, 0, 6, 3] : [0, 0, 3, 3, 6, 0], ink, 1.2));
      },
      get cacheStats() {
        let laya = window2.Laya ?? window2.laya, entries = laya ? [...cacheFor(laya).values()] : [];
        return { entries: entries.length, pending: entries.filter((e) => e.pending).length, live: entries.reduce((n, e) => n + e.refs, 0) };
      }
    });
  }
  var read3 = (fn) => {
    try {
      return fn();
    } catch {
      return;
    }
  };
  function findNativeListenerOwner(proxy, events, accepts) {
    for (let event of events) {
      let handlers = read3(() => proxy._events[event]);
      for (let handler of Array.isArray(handlers) ? handlers.slice(0, 32) : [handlers]) {
        let caller = read3(() => handler.caller);
        if (accepts(caller)) return caller;
      }
    }
    return null;
  }
  function field(packet2, key) {
    for (let node of [
      packet2,
      read3(() => packet2.Protocol),
      read3(() => packet2.ProtoObj),
      read3(() => packet2.protoObj),
      read3(() => packet2.data.protoObj),
      read3(() => packet2.data.ProtoObj)
    ]) {
      let value = read3(() => node[key]);
      if (value != null) return value;
    }
  }
  var reply = "ClientDbsGetuserachinfoRep", number = (value) => value == null || value === "" ? NaN : Number(value), isNumber = (value) => typeof value == "number" || typeof value == "string" && !!value.trim();
  function projectAchievementReply(packet2) {
    let rows = field(packet2, "Achs"), nickname = field(packet2, "NickName"), type = field(packet2, "requestType");
    if (number(type) !== 0 || typeof nickname != "string" || !Array.isArray(rows) || rows.length > 2e4) return null;
    let finish = {}, progress = {}, automationError = "";
    for (let raw of rows) {
      let row = (raw == null ? void 0 : raw.ProtoObj) || (raw == null ? void 0 : raw.protoObj) || raw, rawId = (row == null ? void 0 : row.id) ?? (row == null ? void 0 : row.ID), rawType = (row == null ? void 0 : row.type) ?? (row == null ? void 0 : row.Type), rawValue = (row == null ? void 0 : row.detailInfo) ?? (row == null ? void 0 : row.DetailInfo), id = number(rawId), flags = number(rawType);
      if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(flags)) throw new Error("\u6218\u529F\u6761\u76EE\u683C\u5F0F\u65E0\u6548");
      if ((!isNumber(rawId) || !isNumber(rawType) || flags < 0) && (automationError ||= "\u6218\u529F\u6761\u76EE\u683C\u5F0F\u65E0\u6548"), !(flags & 3)) continue;
      let value = number(rawValue);
      if (!Number.isFinite(value) || value < 0) throw new Error("\u6218\u529F\u8FDB\u5EA6\u6216\u5B8C\u6210\u65F6\u95F4\u65E0\u6548");
      isNumber(rawValue) || (automationError ||= "\u6218\u529F\u8FDB\u5EA6\u6216\u5B8C\u6210\u65F6\u95F4\u65E0\u6548"), flags & 1 && value > 0 ? finish[id] = Math.max(finish[id] || 0, value) : flags & 2 && (progress[id] = Math.max(progress[id] || 0, value));
    }
    return {
      snapshot: Object.freeze({ nickname, finish: Object.freeze(finish), progress: Object.freeze(progress), at: Date.now() }),
      forAutomation: isNumber(type),
      automationError
    };
  }
  var sameAccount = (a, b) => (a == null ? void 0 : a.id) === b.id && a.nickname === b.nickname, sameConnection = (a, b) => !!(a && b && a.proxy === b.proxy && a.id === b.id), queryLifetime = 8e3;
  function reportGap(gap, detail) {
    try {
      gap(detail);
    } catch {
    }
  }
  function createAchievementQueries(native, now) {
    let subscribers = /* @__PURE__ */ new Set(), pending = null, serial = 0, stop, bound = null, manager2 = () => native.manager("AchievementManager", reply, (m) => typeof m.sendGetAchInfo == "function"), connection = (proxy = read3(native.getServerProxy)) => read3(() => proxy && proxy === bound && proxy.ConnectedSucess1 !== !1 && { proxy, id: proxy.ConnId }), queryConnection = () => {
      let link = connection();
      return link && read3(() => link.proxy.IsOffline !== !0) ? link : null;
    };
    function observe() {
      let linkOf = (_packet, proxy) => connection(proxy);
      return native.observe({ [reply]: (packet2, proxy) => {
        let link = connection(proxy);
        if (!link) return null;
        let projected = projectAchievementReply(packet2);
        if (!projected) return null;
        let account = native.account();
        return { ...projected, link, request: pending && sameConnection(pending.link, link) && sameAccount(pending.account, account) && projected.snapshot.nickname === account.nickname ? pending.id : null };
      }, close: linkOf, error: linkOf }, (type, data, sender) => {
        if (type !== reply) {
          sameConnection(pending == null ? void 0 : pending.link, data) && (pending = null);
          return;
        }
        if (!sameConnection(data.link, connection())) return;
        let account = native.account();
        if (!(!sameAccount(sender, account) || data.snapshot.nickname !== account.nickname)) {
          pending && pending.id === data.request && (pending = null);
          for (let { receive, strict, gap } of [...subscribers])
            if (!(strict && !data.forAutomation))
              try {
                strict && data.automationError ? reportGap(gap, { reason: "projection", type: reply, message: data.automationError }) : receive(data.snapshot, data.request);
              } catch (error) {
                reportGap(gap, { reason: "consume", type: reply, message: String((error == null ? void 0 : error.message) || error) });
              }
        }
      }, (detail) => {
        pending = null;
        for (let { gap } of [...subscribers]) reportGap(gap, detail);
      }, (proxy) => {
        bound = proxy;
      });
    }
    return {
      ready: () => !!(queryConnection() && manager2()),
      query() {
        let account = native.account(), link = queryConnection();
        if (!subscribers.size || !account.id || !account.nickname || !link) return null;
        let at = now();
        if (pending && sameConnection(pending.link, link) && sameAccount(pending.account, account) && at - pending.at < queryLifetime) return pending.id;
        let target = manager2();
        if (!target) return null;
        let request = { id: ++serial, account, at, link };
        pending = request;
        try {
          target.sendGetAchInfo(account.nickname, 0);
        } catch (error) {
          throw pending === request && (pending = null), error;
        }
        return request.id;
      },
      subscribe(scope, receive, gap, strict) {
        if (scope.closed) return () => {
        };
        let listener = { receive, gap, strict };
        return subscribers.size || (stop = observe()), subscribers.add(listener), scope.add(() => {
          subscribers.delete(listener), !subscribers.size && (stop(), stop = bound = pending = null);
        });
      }
    };
  }
  var achievementsByGame = /* @__PURE__ */ new WeakMap();
  function readNativeAccount(ctx) {
    let login = manager(ctx, "LoginManager", "error", (m) => "IsOnLine" in m || "IsAccountLoggingOut" in m), online = read3(() => login.IsOnLine);
    if (read3(() => login.IsAccountLoggingOut) === !0 || online === !1) return { id: "", nickname: "" };
    let self = read3(() => ctx.game.getSelf()), id = read3(() => self.ClientId) ?? read3(() => self.clientId), selfId = /^(?:[1-9]\d*)$/.test(String(id)) ? String(id) : "", nickname = selfId ? String(read3(() => self.NickName) || read3(() => self.Nickname) || read3(() => self.nickname) || "") : "";
    if (selfId && nickname) return { id: selfId, nickname };
    let account = online === !0 && read3(() => {
      var _a2, _b2;
      return (_b2 = (_a2 = ctx.game).getLoginAccount) == null ? void 0 : _b2.call(_a2);
    });
    return account != null && account.id && (!selfId || selfId === account.id) ? { ...account } : { id: selfId, nickname: "" };
  }
  function manager(ctx, name, event, guard) {
    let type = read3(() => ctx.game.getClass(name)), valid = (value) => value && read3(() => value.destroyed) !== !0 && read3(() => guard(value));
    if (valid(type)) return type;
    for (let key of ["instance", "_instance", "Instance", "s_instance"]) {
      let descriptor = read3(() => Object.getOwnPropertyDescriptor(type, key));
      if (descriptor && "value" in descriptor && valid(descriptor.value)) return descriptor.value;
    }
    return findNativeListenerOwner(read3(() => ctx.game.getServerProxy()), [event], valid);
  }
  function observeNative(ctx, project, consume, gap = () => {
  }, { scope = ctx.scope } = {}, onBound) {
    if (ctx.scope.signal.aborted || scope.signal.aborted) return () => {
    };
    let observation = new ResourceScope(), stop = ctx.scope.add(() => observation.dispose());
    scope !== ctx.scope && observation.add(scope.add(stop));
    let bound = null, releases = [], queue = [], scheduled = !1, overflow = !1, gapDetail = null, caller = {}, flush = () => {
      if (scheduled = !1, observation.signal.aborted) return;
      let batch = queue;
      if (queue = [], overflow) {
        overflow = !1;
        let detail = gapDetail;
        gapDetail = null, gap(detail);
        return;
      }
      for (let item of batch) {
        if (observation.closed) break;
        if (item.account.id && item.account.id === readNativeAccount(ctx).id)
          try {
            consume(item.type, item.data, item.account);
          } catch (e) {
            gap({ reason: "consume", type: item.type, message: String((e == null ? void 0 : e.message) || e) });
          }
      }
    }, enqueue = (type, packet2, proxy) => {
      if (!observation.closed) {
        try {
          let projectPacket = project[type], data = onBound ? projectPacket(packet2, proxy) : projectPacket(packet2);
          if (data == null) return;
          queue.length >= 256 && (overflow = !0, gapDetail = { reason: "overflow", type }, queue = []), overflow || queue.push({ type, data, account: readNativeAccount(ctx) });
        } catch (e) {
          overflow = !0, gapDetail = { reason: "projection", type, message: String((e == null ? void 0 : e.message) || e) }, queue = [];
        }
        scheduled || (scheduled = !0, observation.timeout(flush, 0));
      }
    };
    function bind() {
      let proxy = read3(() => ctx.game.getServerProxy());
      if (proxy !== bound) {
        for (let release of releases) release();
        if (releases = [], onBound == null || onBound(null), bound && (queue = [], gap({ reason: "rebind" })), !observation.closed && (bound = proxy, !(typeof read3(() => proxy.on) != "function" || typeof read3(() => proxy.off) != "function"))) {
          for (let type of Object.keys(project)) {
            let handler = (packet2) => enqueue(type, packet2, proxy);
            proxy.on(type, caller, handler), releases.push(observation.add(() => proxy.off(type, caller, handler)));
          }
          onBound == null || onBound(proxy);
        }
      }
    }
    observation.add(() => {
      queue = [];
      for (let release of releases) release();
      releases = [], bound = null;
    });
    try {
      bind(), observation.interval(bind, 500);
    } catch (error) {
      throw stop(), error;
    }
    return stop;
  }
  function createPluginNative(ctx) {
    return {
      account: () => readNativeAccount(ctx),
      manager: (name, event, guard) => manager(ctx, name, event, guard),
      observe: (project, consume, gap, options) => observeNative(ctx, project, consume, gap, options),
      get achievements() {
        let service = achievementsByGame.get(ctx.game);
        if (!service) {
          let root = { game: ctx.game, scope: new ResourceScope() }, native = createPluginNative(root);
          service = createAchievementQueries({
            account: native.account,
            manager: native.manager,
            getServerProxy: () => root.game.getServerProxy(),
            observe: (project, consume, gap, onBound) => observeNative(root, project, consume, gap, void 0, onBound)
          }, ctx.now ?? Date.now), achievementsByGame.set(ctx.game, service);
        }
        return {
          ready: service.ready,
          query: () => ctx.scope.closed ? null : service.query(),
          subscribe: (receive, gap = () => {
          }, { strict = !1 } = {}) => service.subscribe(ctx.scope, receive, gap, strict)
        };
      }
    };
  }
  var POKER_TABLE_SCENE = "PokerTableGameScene";
  function isNativePokerTable(scene) {
    return !!(scene && !scene.destroyed && (scene.SceneName || scene.sceneName || scene.name) === POKER_TABLE_SCENE);
  }
  var TABLE_CARD_SETTINGS = /* @__PURE__ */ new Set(["reveals", "countdown", "fourColors", "labels", "revealColumns", "revealOpacity"]);
  function createPokerTableCards(settings) {
    let tables = /* @__PURE__ */ new WeakMap();
    return {
      getSetting(key, fallback) {
        return TABLE_CARD_SETTINGS.has(key) ? settings.get(key, fallback) : fallback;
      },
      open(scene) {
        if (!isNativePokerTable(scene)) return null;
        let table = { hands: Object.freeze([]) };
        return tables.set(scene, table), {
          update(hands) {
            tables.get(scene) === table && (table.hands = Object.freeze(hands.map(({ seat, cards }) => Object.freeze({
              seat,
              cards: Object.freeze(cards.map(({ id, suit, face, source }) => Object.freeze({ id, suit, face, source })))
            }))));
          },
          close() {
            tables.get(scene) === table && tables.delete(scene);
          }
        };
      },
      read(scene) {
        var _a2;
        return isNativePokerTable(scene) ? ((_a2 = tables.get(scene)) == null ? void 0 : _a2.hands) ?? null : null;
      }
    };
  }
  var numeric = (a, b) => (a = a.replace(/^0+(?=\d)/, ""), b = b.replace(/^0+(?=\d)/, ""), Math.sign(a.length - b.length) || (a === b ? 0 : a > b ? 1 : -1));
  function parse(version) {
    var _a2;
    let match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
    return match && { core: match.slice(1, 4), pre: ((_a2 = match[4]) == null ? void 0 : _a2.split(".")) || [] };
  }
  function compareVersions2(a, b) {
    let left = parse(a), right = parse(b);
    if (!left || !right) throw new Error("\u63D2\u4EF6\u7248\u672C\u683C\u5F0F\u65E0\u6548\u3002");
    for (let i2 = 0; i2 < 3; i2++) {
      let order = numeric(left.core[i2], right.core[i2]);
      if (order) return order;
    }
    if (!left.pre.length || !right.pre.length) return Math.sign(right.pre.length) - Math.sign(left.pre.length);
    for (let i2 = 0; i2 < Math.max(left.pre.length, right.pre.length); i2++) {
      let x2 = left.pre[i2], y = right.pre[i2];
      if (x2 === void 0 || y === void 0) return x2 === void 0 ? -1 : 1;
      if (x2 === y) continue;
      let xn = /^\d+$/.test(x2), yn = /^\d+$/.test(y), order = xn && yn ? numeric(x2, y) : xn !== yn ? xn ? -1 : 1 : x2 > y ? 1 : -1;
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
  var replayYield = () => new Promise((resolve) => setTimeout(resolve, 0)), receivesEvent = (slot, type) => !slot.journalEvents || slot.journalEvents.has(type) || type === "MsgGamePlayCardNtf" || type === "toolbox:gap", PluginManager = class {
    constructor({ journal, store, settings, context: context2, onChange = () => {
    }, onReplayGap = () => {
    } }) {
      Object.assign(this, { journal, store, settings, context: context2, onChange, onReplayGap }), this.builtins = /* @__PURE__ */ new Map(), this.slots = /* @__PURE__ */ new Map(), this.tail = Promise.resolve(), this.errors = [], this.closed = !1, this.initializing = !0, this.storageError = "", this.loadIssues = /* @__PURE__ */ new Map(), this.bundledInstallIssues = /* @__PURE__ */ new Map(), this.priorityPlayActions = /* @__PURE__ */ new Set(), this.pokerTableCards = createPokerTableCards(settings.namespace("cards")), this.eventRoutes = /* @__PURE__ */ new Map(), this.eventSession = null, this.unsubscribe = journal.subscribe((event) => this.dispatch(event));
    }
    serial(fn) {
      let work = this.tail.catch(() => {
      }).then(() => {
        if (this.closed) throw new Error("\u63D2\u4EF6\u7BA1\u7406\u5668\u5DF2\u505C\u6B62");
        if (this.storageError) throw new Error(this.storageError);
        return fn();
      });
      return this.tail = work, work;
    }
    registerBuiltin(module) {
      validateManifest(module.manifest), this.builtins.set(module.manifest.id, module);
    }
    async registerBundled(pkg, replacesPackageDigests = []) {
      try {
        await verifyPackage(pkg), this.registerBuiltin({ ...compilePackage(pkg), bundledPackage: pkg, replacesPackageDigests });
      } catch (error) {
        let id = pkg.manifest.id;
        throw this.bundledInstallIssues.set(id, error.message), this.errors.push(`${id}: ${error.message}`), error;
      }
    }
    dispatch(event) {
      let newSession = this.eventSession !== event.sessionId;
      this.eventSession = event.sessionId;
      let slots = this.eventRoutes.get(event.type);
      newSession ? slots = this.slots.values() : slots || (slots = [...this.slots.values()].filter((slot) => (slot.module.reduce || slot.listeners.size) && receivesEvent(slot, event.type)), this.eventRoutes.size >= 64 && this.eventRoutes.clear(), this.eventRoutes.set(event.type, slots));
      for (let slot of slots)
        if (!slot.replaying)
          try {
            let deliver = !newSession || receivesEvent(slot, event.type);
            if (this.reduce(slot, event, deliver), deliver) for (let fn of slot.listeners) fn(slot.state, event);
          } catch (error) {
            this.runtimeError(slot, error);
          }
    }
    makeSlot(module, record, previous) {
      var _a2;
      return {
        module,
        record,
        state: previous ? previous.state : ((_a2 = module.initialState) == null ? void 0 : _a2.call(module)) ?? {},
        listeners: /* @__PURE__ */ new Set(),
        scope: null,
        active: !1,
        sessionId: (previous == null ? void 0 : previous.sessionId) ?? null,
        cursor: (previous == null ? void 0 : previous.cursor) ?? 0,
        error: "",
        journalEvents: module.manifest.journalEvents ? new Set(module.manifest.journalEvents) : null
      };
    }
    reduce(slot, event, deliver = receivesEvent(slot, event.type)) {
      var _a2, _b2;
      event.seq <= slot.cursor || (slot.reduceFailed = !0, slot.sessionId !== event.sessionId && (slot.state = ((_b2 = (_a2 = slot.module).initialState) == null ? void 0 : _b2.call(_a2)) ?? {}, slot.sessionId = event.sessionId), deliver && slot.module.reduce && (slot.state = slot.module.reduce(slot.state, event)), slot.cursor = event.seq, slot.reduceFailed = !1);
    }
    markLiveCoverage(slot) {
      slot && !slot.reduceFailed && slot.sessionId === this.eventSession && Number.isInteger(this.journal.seq) && (slot.cursor = this.journal.seq);
    }
    replay(slot, bounded = !1) {
      var _a2, _b2, _c;
      let { journal } = this;
      if (slot.cursor >= journal.seq) return !1;
      if (!slot.module.reduce && Number.isInteger(journal.seq))
        return slot.sessionId !== journal.sessionId && (slot.state = ((_b2 = (_a2 = slot.module).initialState) == null ? void 0 : _b2.call(_a2)) ?? {}), slot.sessionId = journal.sessionId, slot.cursor = journal.seq, !1;
      let events = journal.replayAfter ? journal.replayAfter(slot.cursor) : journal.events, started = bounded ? performance.now() : 0, count = 0;
      for (let event of events)
        if (event.type === "toolbox:gap" && ((_c = event.payload) == null ? void 0 : _c.replayOnly) === !0 && (slot.replayGap = !0), this.reduce(slot, event), bounded && (++count >= 64 || performance.now() - started >= 4)) return slot.cursor < journal.seq;
      return !1;
    }
    async catchUp(slot) {
      for (; !this.closed && this.replay(slot, !0); ) await replayYield();
    }
    requestReplaySnapshot(slot) {
      slot.replayGap && (slot.replayGap = !1, receivesEvent(slot, "toolbox:snapshot") && this.onReplayGap());
    }
    attachSlot(id, slot) {
      this.replay(slot), this.slots.set(id, slot), this.eventRoutes.clear(), this.requestReplaySnapshot(slot);
    }
    dependencyError(message) {
      return Object.assign(new Error(message), { dependency: !0 });
    }
    assertGraph(module, path = []) {
      var _a2;
      let id = module.manifest.id;
      if (path.includes(id)) throw this.dependencyError("\u524D\u7F6E\u63D2\u4EF6\u5FAA\u73AF\u4F9D\u8D56\uFF1A" + [...path, id].join(" \u2192 "));
      for (let dep of module.manifest.dependencies || []) {
        let target = (_a2 = this.slots.get(dep)) == null ? void 0 : _a2.module;
        target && this.assertGraph(target, [...path, id]);
      }
    }
    assertUnused(id) {
      let users = [...this.slots.values()].filter((s) => {
        var _a2;
        return s.record.enabled && ((_a2 = s.module.manifest.dependencies) == null ? void 0 : _a2.includes(id));
      });
      if (users.length) throw this.dependencyError("\u8BF7\u5148\u505C\u7528\u4F9D\u8D56\u6B64\u63D2\u4EF6\u7684\uFF1A" + users.map((s) => s.module.manifest.name).join("\u3001"));
    }
    enabledDependents(id) {
      let seen = /* @__PURE__ */ new Set([id]), stoppedFirst = [], visit = (target) => {
        var _a2;
        for (let slot of this.slots.values()) {
          let next = slot.module.manifest.id;
          seen.has(next) || !((_a2 = slot.module.manifest.dependencies) != null && _a2.includes(target)) || (seen.add(next), visit(next), slot.record.enabled && stoppedFirst.push(slot));
        }
      };
      return visit(id), stoppedFirst.reverse();
    }
    runtimeError(slot, error) {
      if (this.closed || slot.recovering) return;
      let message = String((error == null ? void 0 : error.stack) || error);
      if (!slot.record.enabled || slot.restartUsed) {
        slot.error !== message && (slot.error = message, this.onChange());
        return;
      }
      slot.restartUsed = !0, slot.recovering = !0;
      let scope = slot.scope;
      this.serial(async () => {
        var _a2, _b2;
        if (this.slots.get(slot.module.manifest.id) !== slot || slot.scope !== scope || !slot.record.enabled) {
          slot.recovering = !1;
          return;
        }
        this.deactivate(slot), slot.error = "";
        try {
          this.markLiveCoverage(slot), slot.replaying = !0;
          try {
            await this.catchUp(slot), this.closed || this.replay(slot);
          } finally {
            slot.replaying = !1;
          }
          this.requestReplaySnapshot(slot), await this.activate(slot), slot.error = slot.reportedError || "";
        } catch (e) {
          slot.error = `\u81EA\u52A8\u91CD\u542F\u5931\u8D25\uFF1A${String((e == null ? void 0 : e.stack) || e)}
\u9996\u6B21\u9519\u8BEF\uFF1A${message}`;
        }
        slot.recovering = !1, slot.error && ((_b2 = (_a2 = this.context).notify) == null || _b2.call(_a2, `\u63D2\u4EF6 ${slot.module.manifest.name} \u81EA\u52A8\u91CD\u542F\u540E\u4ECD\u6709\u9519\u8BEF\uFF0C\u8BF7\u67E5\u770B\u8BE6\u60C5\u3002`)), this.onChange();
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
      var _a2;
      if (this.closed) throw new Error("\u63D2\u4EF6\u7BA1\u7406\u5668\u5DF2\u505C\u6B62");
      if (slot.active) return;
      let pluginId = slot.module.manifest.id;
      if (path.includes(pluginId)) throw this.dependencyError("\u524D\u7F6E\u63D2\u4EF6\u5FAA\u73AF\u4F9D\u8D56\uFF1A" + [...path, pluginId].join(" \u2192 "));
      for (let id2 of slot.module.manifest.dependencies || []) {
        let dep = this.slots.get(id2), name = (dep == null ? void 0 : dep.module.manifest.name) || ((_a2 = this.builtins.get(id2)) == null ? void 0 : _a2.manifest.name) || id2;
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
      let id = slot.module.manifest.id, { devAppearanceSync, devLedgerSync, ...context2 } = this.context, skinShortcutEnabled = () => !scope.closed && advancedSkinOption(this.settings.namespace("skins"), "backgroundShortcut"), canSelectSkinImage = () => {
        var _a3, _b2;
        return id === "skins" && skinShortcutEnabled() && ((_b2 = (_a3 = context2.backgrounds) == null ? void 0 : _a3.isActive) == null ? void 0 : _b2.call(_a3, "backgrounds")) === !0;
      }, ctx = {
        ...context2,
        ...id === "appearances" && devAppearanceSync ? { devAppearanceSync } : {},
        ...id === "ledger" && devLedgerSync ? { devLedgerSync } : {},
        ...id === "poker-lobby" && { pokerTableCards: {
          getSetting: (key, fallback) => scope.closed ? fallback : this.pokerTableCards.getSetting(key, fallback),
          open: (scene) => {
            if (scope.closed) return null;
            let table = this.pokerTableCards.open(scene);
            return table && { update: table.update, close: scope.add(table.close) };
          }
        } },
        ...id === "cards" && { pokerTableCards: { read: (scene) => scope.closed ? null : this.pokerTableCards.read(scene) } },
        scope,
        settings: this.settings.namespace(id),
        storage: this.settings.namespace(id),
        getState: () => slot.state,
        // Keep the account scheme data on the same key used by preference sync.
        ...id === "player-info" && { generalPoolStorage: this.settings.namespace("general-pools") },
        subscribe: (fn) => {
          slot.listeners.size || this.eventRoutes.clear(), slot.listeners.add(fn);
          let off = () => {
            slot.listeners.delete(fn) && !slot.listeners.size && this.eventRoutes.clear();
          };
          return scope.add(off), off;
        },
        playActions: {
          registerPriority: (fn) => {
            let action = (scene, self) => {
              if (scope.closed) return !1;
              try {
                return fn(scene, self) === !0;
              } catch (error) {
                return ctx.reportError(error), !0;
              }
            };
            return this.priorityPlayActions.add(action), scope.add(() => this.priorityPlayActions.delete(action));
          },
          runPriority: (scene, self) => {
            if (scope.closed) return !1;
            for (let action of this.priorityPlayActions) if (action(scene, self)) return !0;
            return !1;
          }
        },
        reportError: (value) => {
          if (scope.closed) return;
          let message = value == null ? "" : String((value == null ? void 0 : value.stack) || value);
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
            return scope.add(() => {
              var _a3, _b2;
              return (_b2 = (_a3 = this.context.ui).setCompactSummary) == null ? void 0 : _b2.call(_a3, id2, []);
            }), (items) => {
              var _a3, _b2;
              scope.closed || (_b2 = (_a3 = this.context.ui).setCompactSummary) == null || _b2.call(_a3, id2, items);
            };
          },
          registerPanel: (spec) => {
            if (scope.closed) return () => {
            };
            let panel = normalizePanel(spec, slot.module.manifest), render = panel.render;
            return panel.render = (container, options) => {
              var _a3;
              let root = (_a3 = container.getRootNode) == null ? void 0 : _a3.call(container), release = root != null && root.host ? acquirePluginStyles(root, this.context.document) : () => {
              };
              try {
                let cleanup = render(container, options);
                return () => {
                  try {
                    cleanup == null || cleanup();
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
        skinWindows: {
          register: (open) => {
            if (!(id !== "skins" || scope.closed))
              return this.openSkinWindow = open, scope.add(() => {
                this.openSkinWindow === open && (this.openSkinWindow = null);
              });
          },
          open: (source, trigger) => {
            if (!(id !== "backgrounds" || scope.closed)) {
              if (!this.openSkinWindow) throw new Error("\u8BF7\u5148\u66F4\u65B0\u5E76\u542F\u7528\u76AE\u80A4\u7BA1\u7406\u63D2\u4EF6\u3002");
              return this.openSkinWindow(source, trigger);
            }
          }
        },
        backgrounds: {
          isInstalled: () => !scope.closed && this.slots.has("backgrounds"),
          skinShortcutEnabled,
          canSelectSkinImage,
          selectSkinImage: (file, skinKey, skinMotion, signal) => {
            let isCurrent = () => !signal.aborted && canSelectSkinImage();
            if (!isCurrent()) return !1;
            let animated = this.settings.namespace("backgrounds").get("animated", !0) !== !1;
            return context2.backgrounds.selectLocal("backgrounds", file, { skinKey, skinMotion, animated, isCurrent });
          },
          registerSkinMotion: (load, options) => {
            var _a3, _b2;
            if (id === "skins" && !scope.closed) return scope.add((_b2 = (_a3 = context2.backgrounds) == null ? void 0 : _a3.registerSkinMotion) == null ? void 0 : _b2.call(_a3, load, options));
          },
          register: () => scope.closed ? () => {
          } : scope.add(this.context.backgrounds.register(id)),
          select: (spec) => {
            scope.closed || this.context.backgrounds.select(id, spec);
          },
          setAttackEffects: (enabled) => {
            scope.closed || this.context.backgrounds.setAttackEffects(id, enabled);
          },
          setAnimated: (enabled) => {
            scope.closed || this.context.backgrounds.setAnimated(id, enabled);
          },
          setSkinQuality: (quality) => {
            scope.closed || this.context.backgrounds.setSkinQuality(id, quality);
          },
          get skinQualityAvailable() {
            return !scope.closed && thisContext.backgrounds.skinQualityAvailable === !0;
          },
          selectLocal: (file, isCurrent) => {
            if (!scope.closed) return this.context.backgrounds.selectLocal(id, file, { isCurrent });
          },
          listHistory: () => id === "backgrounds" && !scope.closed ? context2.backgrounds.history.list() : Promise.resolve([]),
          restoreHistory: (key, options) => {
            if (id === "backgrounds" && !scope.closed) return context2.backgrounds.restoreHistory(id, key, options);
          },
          cacheHistoryPreview: (key, image) => {
            if (id === "backgrounds" && !scope.closed) return context2.backgrounds.history.cachePreview(key, image);
          },
          get historyError() {
            return id === "backgrounds" && !scope.closed ? context2.backgrounds.history.error : "";
          },
          get currentHistoryId() {
            return id === "backgrounds" && !scope.closed ? context2.backgrounds.currentHistoryId : null;
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
      };
      ctx.native = createPluginNative(ctx);
      let thisContext = this.context;
      try {
        let result = await slot.module.activate(ctx);
        if (typeof result == "function" ? scope.add(result) : result != null && result.dispose && scope.add(() => result.dispose()), this.closed || scope.closed) throw new Error("\u63D2\u4EF6\u6FC0\u6D3B\u5DF2\u53D6\u6D88");
        slot.active = !0, slot.error = "", slot.reportedError && this.runtimeError(slot, slot.reportedError);
      } catch (e) {
        throw scope.dispose(), slot.scope = null, e;
      }
    }
    deactivate(slot) {
      var _a2;
      (_a2 = slot.scope) == null || _a2.dispose(), slot.scope = null, slot.active = !1, slot.listeners.clear();
    }
    init(reconcileInstalled) {
      return this.serial(async () => {
        try {
          await this.loadInstalled(reconcileInstalled);
        } finally {
          this.initializing = !1, this.closed || this.onChange();
        }
      });
    }
    async loadInstalled(reconcileInstalled) {
      var _a2, _b2, _c, _d, _e, _f, _g;
      let stored;
      try {
        stored = await this.store.list();
      } catch (error) {
        this.storageError = "\u65E0\u6CD5\u8BFB\u53D6\u63D2\u4EF6\u5B58\u50A8\uFF0C\u8BF7\u5237\u65B0\u6E38\u620F\u91CD\u8BD5\u3002" + ((error == null ? void 0 : error.message) || String(error)), this.errors.push(this.storageError);
        return;
      }
      if (this.closed) return;
      let records = new Map(stored.map((r) => [r.id, r]));
      if (reconcileInstalled) {
        try {
          await reconcileInstalled(records, this.builtins, this.store);
        } catch (error) {
          this.errors.push(error.message);
        }
        if (this.closed) return;
      }
      for (let id of /* @__PURE__ */ new Set([...this.builtins.keys(), ...records.keys()])) {
        let record = records.get(id) || { id, active: null, previous: null, enabled: !0, uninstalled: !1 };
        if (record.uninstalled) continue;
        let builtin = this.builtins.get(id), module = builtin, saved = record.active || (!builtin && !((_a2 = record.previous) != null && _a2.builtin) ? record.previous : null);
        if (saved)
          try {
            await verifyPackage(saved), module = compilePackage(saved);
          } catch (error) {
            let message = (error == null ? void 0 : error.message) || String(error);
            if (this.errors.push(`${id}: ${message}`), this.loadIssues.set(id, { record, message }), record.active && record.previous && !record.previous.builtin)
              try {
                await verifyPackage(record.previous), module = compilePackage(record.previous);
              } catch {
              }
          }
        if (this.closed) return;
        let loadFailed = this.loadIssues.has(id);
        if (saved && !record.active && !loadFailed) {
          record = { ...record, active: saved, previous: null };
          try {
            await this.store.put(record);
          } catch (error) {
            this.errors.push(`${id}: \u63D2\u4EF6\u6062\u590D\u672A\u4FDD\u5B58\uFF1A${error.message}`);
          }
        }
        if (!loadFailed && record.active && (_b2 = builtin == null ? void 0 : builtin.replacesPackageDigests) != null && _b2.includes(record.active.sha256) && !((_c = record.appliedBuiltinMigrations) != null && _c.includes(record.active.sha256))) {
          let upgraded = { ...record, active: builtin.bundledPackage || null, previous: record.active, appliedBuiltinMigrations: [...record.appliedBuiltinMigrations || [], record.active.sha256] };
          try {
            await this.store.put(upgraded), record = upgraded, module = builtin, (_e = (_d = this.context).notify) == null || _e.call(_d, `${builtin.manifest.name}\u5DF2\u66F4\u65B0\u81F3\u968F\u6838\u5FC3\u63D0\u4F9B\u7684 ${builtin.manifest.version}`);
          } catch (error) {
            this.errors.push(`${id}: \u5185\u7F6E\u4FEE\u590D\u66F4\u65B0\u672A\u4FDD\u5B58\uFF1A${error.message}`);
          }
        }
        if (this.closed) return;
        if (!module) continue;
        if (!loadFailed && builtin != null && builtin.bundledPackage && (!record.active || (_f = record.previous) != null && _f.builtin)) {
          let portable = {
            ...record,
            active: record.active || builtin.bundledPackage,
            previous: (_g = record.previous) != null && _g.builtin ? builtin.bundledPackage : record.previous
          };
          try {
            await this.store.put(portable), record = portable;
          } catch (error) {
            this.bundledInstallIssues.set(id, error.message), this.errors.push(`${id}: \u63D2\u4EF6\u72EC\u7ACB\u4FDD\u5B58\u5931\u8D25\uFF0C\u5207\u6362\u8F7B\u91CF\u7248\u524D\u8BF7\u4FEE\u590D\u5B58\u50A8\uFF1A${error.message}`);
          }
        }
        if (this.closed) return;
        let slot = this.makeSlot(module, record);
        if (await this.catchUp(slot), this.closed) return;
        this.attachSlot(id, slot);
      }
      for (let [id, slot] of this.slots) {
        let { record } = slot;
        if (record.enabled)
          try {
            await this.activate(slot);
          } catch (e) {
            this.errors.push(`${id}: ${e.message}`), this.deactivate(slot);
            let alternatives = e.dependency || this.loadIssues.has(id) ? [] : [record.previous, this.builtins.has(id) ? { builtin: !0 } : null].filter(Boolean), recovered = !1;
            for (let alt of alternatives)
              try {
                let fallback = alt.builtin ? this.builtins.get(id) : (await verifyPackage(alt), compilePackage(alt));
                if (!fallback) continue;
                let fallbackRecord = { ...record, active: alt.builtin ? fallback.bundledPackage || null : alt, previous: null }, fallbackSlot = this.makeSlot(fallback, fallbackRecord);
                if (await this.catchUp(fallbackSlot), this.closed) return;
                this.attachSlot(id, fallbackSlot), await this.activate(fallbackSlot), await this.store.put(fallbackRecord), recovered = !0;
                break;
              } catch {
                this.deactivate(this.slots.get(id));
              }
            recovered || (this.attachSlot(id, slot), slot.error = e.message);
          }
      }
    }
    list() {
      return [...this.slots.values()].map((s) => {
        let builtinFallback = this.loadIssues.has(s.record.id) && s.module === this.builtins.get(s.record.id);
        return { ...s.module.manifest, enabled: s.record.enabled, active: s.active, error: s.error, ...s.maintenance ? { maintenance: s.maintenance } : {}, hasPrevious: !!s.record.previous, source: s.record.active && !builtinFallback ? "\u63D2\u4EF6\u5E02\u573A / \u6587\u4EF6" : "\u5185\u7F6E" };
      }).sort(comparePluginOrder);
    }
    install(pkg, { updateOnly = !1 } = {}) {
      return this.serial(async () => {
        var _a2;
        await verifyPackage(pkg);
        let { id, version } = pkg.manifest;
        if (updateOnly) {
          let current = (_a2 = this.slots.get(id)) == null ? void 0 : _a2.module.manifest.version;
          if (!current || compareVersions2(version, current) <= 0) throw new Error("\u63D2\u4EF6\u5B89\u88C5\u72B6\u6001\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u68C0\u6D4B\u66F4\u65B0\u3002");
        }
        return this.swap(id, compilePackage(pkg), pkg, void 0, { restartDependents: !0 });
      });
    }
    async swap(id, module, pkg, previousOverride, { restartDependents = !1 } = {}) {
      var _a2, _b2, _c, _d;
      let old = this.slots.get(id), saved = (old == null ? void 0 : old.record) || ((_a2 = this.loadIssues.get(id)) == null ? void 0 : _a2.record);
      old && !restartDependents && this.assertUnused(id), this.slots.set(id, { module });
      try {
        this.assertGraph(module);
      } finally {
        old ? this.slots.set(id, old) : this.slots.delete(id);
      }
      let previous = old ? old.record.active || { builtin: !0 } : (saved == null ? void 0 : saved.active) || (saved == null ? void 0 : saved.previous) || null, record = { id, enabled: (saved == null ? void 0 : saved.enabled) ?? !0, uninstalled: !1, active: pkg, previous: previousOverride ?? previous, appliedBuiltinMigrations: (saved == null ? void 0 : saved.appliedBuiltinMigrations) || [] };
      this.markLiveCoverage(old);
      let candidate = this.makeSlot(module, record, (old == null ? void 0 : old.module) === module ? old : void 0);
      if ((old == null ? void 0 : old.module) !== module && await this.catchUp(candidate), this.closed) throw new Error("\u63D2\u4EF6\u5B89\u88C5\u5DF2\u53D6\u6D88");
      this.replay(candidate);
      let dependents = old && restartDependents ? this.enabledDependents(id) : [];
      for (let slot of [...dependents].reverse())
        slot.maintenance = "waiting", this.deactivate(slot);
      let updateError, recoveryErrors = [];
      try {
        old && (this.markLiveCoverage(old), this.deactivate(old)), restartDependents && (candidate.maintenance = "updating");
        try {
          if (this.attachSlot(id, candidate), this.onChange(), record.enabled && await this.activate(candidate), this.closed) throw new Error("\u63D2\u4EF6\u5B89\u88C5\u5DF2\u53D6\u6D88");
          await this.store.put(record), this.loadIssues.delete(id), this.bundledInstallIssues.delete(id);
        } catch (error) {
          if (this.deactivate(candidate), this.slots.delete(id), this.eventRoutes.clear(), old && !this.closed && (old.maintenance = candidate.maintenance, old.restartUsed = !1, old.error = "", await this.catchUp(old), !this.closed && (this.attachSlot(id, old), old.record.enabled)))
            try {
              await this.activate(old);
            } catch (e) {
              old.error = e.message;
            }
          throw error;
        }
      } catch (error) {
        updateError = error;
      } finally {
        let failed = /* @__PURE__ */ new Set();
        (_b2 = this.slots.get(id)) != null && _b2.active || failed.add(id);
        for (let slot of dependents) {
          let dependentId = slot.module.manifest.id;
          if (this.closed) break;
          if (!(this.slots.get(dependentId) !== slot || !slot.record.enabled)) {
            slot.maintenance = "restarting";
            try {
              let blocked = (_c = slot.module.manifest.dependencies) == null ? void 0 : _c.find((dep) => failed.has(dep));
              if (blocked) throw this.dependencyError("\u524D\u7F6E\u63D2\u4EF6\u300C" + (((_d = this.slots.get(blocked)) == null ? void 0 : _d.module.manifest.name) || blocked) + "\u300D\u672A\u80FD\u6062\u590D\u8FD0\u884C");
              slot.restartUsed = !1, this.onChange(), await this.activate(slot);
            } catch (error) {
              this.deactivate(slot), failed.add(dependentId), slot.error = "\u66F4\u65B0\u540E\u91CD\u542F\u5931\u8D25\uFF1A" + String((error == null ? void 0 : error.stack) || error), recoveryErrors.push(new Error(slot.module.manifest.name + "\uFF1A" + ((error == null ? void 0 : error.message) || String(error)), { cause: error }));
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
            throw slot.error = (e == null ? void 0 : e.message) || String(e), this.onChange(), e;
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
        if (this.loadIssues.has(id)) throw new Error("\u63D2\u4EF6\u5305\u52A0\u8F7D\u5F02\u5E38\uFF0C\u8BF7\u5237\u65B0\u6E38\u620F\u91CD\u8BD5\u3002");
        return this.swap(id, slot.module, slot.record.active, slot.record.previous);
      });
    }
    rollback(id) {
      return this.serial(async () => {
        let slot = this.slots.get(id), previous = slot == null ? void 0 : slot.record.previous;
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
        slot && this.deactivate(slot), this.slots.delete(id), this.eventRoutes.clear(), this.loadIssues.delete(id), this.onChange();
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
      this.eventRoutes.clear();
    }
  }, u8 = Uint8Array, u16 = Uint16Array, i32 = Int32Array, fleb = new u8([
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    1,
    1,
    1,
    1,
    2,
    2,
    2,
    2,
    3,
    3,
    3,
    3,
    4,
    4,
    4,
    4,
    5,
    5,
    5,
    5,
    0,
    /* unused */
    0,
    0,
    /* impossible */
    0
  ]), fdeb = new u8([
    0,
    0,
    0,
    0,
    1,
    1,
    2,
    2,
    3,
    3,
    4,
    4,
    5,
    5,
    6,
    6,
    7,
    7,
    8,
    8,
    9,
    9,
    10,
    10,
    11,
    11,
    12,
    12,
    13,
    13,
    /* unused */
    0,
    0
  ]), clim = new u8([16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]), freb = function(eb, start) {
    for (var b = new u16(31), i2 = 0; i2 < 31; ++i2)
      b[i2] = start += 1 << eb[i2 - 1];
    for (var r = new i32(b[30]), i2 = 1; i2 < 30; ++i2)
      for (var j = b[i2]; j < b[i2 + 1]; ++j)
        r[j] = j - b[i2] << 5 | i2;
    return { b, r };
  }, _a = freb(fleb, 2), fl = _a.b, revfl = _a.r;
  fl[28] = 258, revfl[258] = 28;
  var _b = freb(fdeb, 0), fd = _b.b, revfd = _b.r, rev = new u16(32768);
  for (i = 0; i < 32768; ++i)
    x = (i & 43690) >> 1 | (i & 21845) << 1, x = (x & 52428) >> 2 | (x & 13107) << 2, x = (x & 61680) >> 4 | (x & 3855) << 4, rev[i] = ((x & 65280) >> 8 | (x & 255) << 8) >> 1;
  var x, i, hMap = (function(cd, mb, r) {
    for (var s = cd.length, i2 = 0, l = new u16(mb); i2 < s; ++i2)
      cd[i2] && ++l[cd[i2] - 1];
    var le = new u16(mb);
    for (i2 = 1; i2 < mb; ++i2)
      le[i2] = le[i2 - 1] + l[i2 - 1] << 1;
    var co;
    if (r) {
      co = new u16(1 << mb);
      var rvb = 15 - mb;
      for (i2 = 0; i2 < s; ++i2)
        if (cd[i2])
          for (var sv = i2 << 4 | cd[i2], r_1 = mb - cd[i2], v = le[cd[i2] - 1]++ << r_1, m = v | (1 << r_1) - 1; v <= m; ++v)
            co[rev[v] >> rvb] = sv;
    } else
      for (co = new u16(s), i2 = 0; i2 < s; ++i2)
        cd[i2] && (co[i2] = rev[le[cd[i2] - 1]++] >> 15 - cd[i2]);
    return co;
  }), flt = new u8(288);
  for (i = 0; i < 144; ++i)
    flt[i] = 8;
  var i;
  for (i = 144; i < 256; ++i)
    flt[i] = 9;
  var i;
  for (i = 256; i < 280; ++i)
    flt[i] = 7;
  var i;
  for (i = 280; i < 288; ++i)
    flt[i] = 8;
  var i, fdt = new u8(32);
  for (i = 0; i < 32; ++i)
    fdt[i] = 5;
  var i, flrm = /* @__PURE__ */ hMap(flt, 9, 1), fdrm = /* @__PURE__ */ hMap(fdt, 5, 1), max = function(a) {
    for (var m = a[0], i2 = 1; i2 < a.length; ++i2)
      a[i2] > m && (m = a[i2]);
    return m;
  }, bits = function(d, p, m) {
    var o = p / 8 | 0;
    return (d[o] | d[o + 1] << 8) >> (p & 7) & m;
  }, bits16 = function(d, p) {
    var o = p / 8 | 0;
    return (d[o] | d[o + 1] << 8 | d[o + 2] << 16) >> (p & 7);
  }, shft = function(p) {
    return (p + 7) / 8 | 0;
  }, slc = function(v, s, e) {
    return (s == null || s < 0) && (s = 0), (e == null || e > v.length) && (e = v.length), new u8(v.subarray(s, e));
  }, ec = [
    "unexpected EOF",
    "invalid block type",
    "invalid length/literal",
    "invalid distance",
    "stream finished",
    "no stream handler",
    ,
    "no callback",
    "invalid UTF-8 data",
    "extra field too long",
    "date not in range 1980-2099",
    "filename too long",
    "stream finishing",
    "invalid zip data"
    // determined by unknown compression method
  ], err = function(ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    if (e.code = ind, Error.captureStackTrace && Error.captureStackTrace(e, err), !nt)
      throw e;
    return e;
  }, inflt = function(dat, st, buf, dict) {
    var sl = dat.length, dl = dict ? dict.length : 0;
    if (!sl || st.f && !st.l)
      return buf || new u8(0);
    var noBuf = !buf, resize = noBuf || st.i != 2, noSt = st.i;
    noBuf && (buf = new u8(sl * 3));
    var cbuf = function(l2) {
      var bl = buf.length;
      if (l2 > bl) {
        var nbuf = new u8(Math.max(bl * 2, l2));
        nbuf.set(buf), buf = nbuf;
      }
    }, final = st.f || 0, pos = st.p || 0, bt = st.b || 0, lm = st.l, dm = st.d, lbt = st.m, dbt = st.n, tbts = sl * 8;
    do {
      if (!lm) {
        final = bits(dat, pos, 1);
        var type = bits(dat, pos + 1, 3);
        if (pos += 3, type)
          if (type == 1)
            lm = flrm, dm = fdrm, lbt = 9, dbt = 5;
          else if (type == 2) {
            var hLit = bits(dat, pos, 31) + 257, hcLen = bits(dat, pos + 10, 15) + 4, tl = hLit + bits(dat, pos + 5, 31) + 1;
            pos += 14;
            for (var ldt = new u8(tl), clt = new u8(19), i2 = 0; i2 < hcLen; ++i2)
              clt[clim[i2]] = bits(dat, pos + i2 * 3, 7);
            pos += hcLen * 3;
            for (var clb = max(clt), clbmsk = (1 << clb) - 1, clm = hMap(clt, clb, 1), i2 = 0; i2 < tl; ) {
              var r = clm[bits(dat, pos, clbmsk)];
              pos += r & 15;
              var s = r >> 4;
              if (s < 16)
                ldt[i2++] = s;
              else {
                var c = 0, n = 0;
                for (s == 16 ? (n = 3 + bits(dat, pos, 3), pos += 2, c = ldt[i2 - 1]) : s == 17 ? (n = 3 + bits(dat, pos, 7), pos += 3) : s == 18 && (n = 11 + bits(dat, pos, 127), pos += 7); n--; )
                  ldt[i2++] = c;
              }
            }
            var lt = ldt.subarray(0, hLit), dt = ldt.subarray(hLit);
            lbt = max(lt), dbt = max(dt), lm = hMap(lt, lbt, 1), dm = hMap(dt, dbt, 1);
          } else
            err(1);
        else {
          var s = shft(pos) + 4, l = dat[s - 4] | dat[s - 3] << 8, t = s + l;
          if (t > sl) {
            noSt && err(0);
            break;
          }
          resize && cbuf(bt + l), buf.set(dat.subarray(s, t), bt), st.b = bt += l, st.p = pos = t * 8, st.f = final;
          continue;
        }
        if (pos > tbts) {
          noSt && err(0);
          break;
        }
      }
      resize && cbuf(bt + 131072);
      for (var lms = (1 << lbt) - 1, dms = (1 << dbt) - 1, lpos = pos; ; lpos = pos) {
        var c = lm[bits16(dat, pos) & lms], sym = c >> 4;
        if (pos += c & 15, pos > tbts) {
          noSt && err(0);
          break;
        }
        if (c || err(2), sym < 256)
          buf[bt++] = sym;
        else if (sym == 256) {
          lpos = pos, lm = null;
          break;
        } else {
          var add = sym - 254;
          if (sym > 264) {
            var i2 = sym - 257, b = fleb[i2];
            add = bits(dat, pos, (1 << b) - 1) + fl[i2], pos += b;
          }
          var d = dm[bits16(dat, pos) & dms], dsym = d >> 4;
          d || err(3), pos += d & 15;
          var dt = fd[dsym];
          if (dsym > 3) {
            var b = fdeb[dsym];
            dt += bits16(dat, pos) & (1 << b) - 1, pos += b;
          }
          if (pos > tbts) {
            noSt && err(0);
            break;
          }
          resize && cbuf(bt + 131072);
          var end = bt + add;
          if (bt < dt) {
            var shift = dl - dt, dend = Math.min(dt, end);
            for (shift + bt < 0 && err(3); bt < dend; ++bt)
              buf[bt] = dict[shift + bt];
          }
          for (; bt < end; ++bt)
            buf[bt] = buf[bt - dt];
        }
      }
      st.l = lm, st.p = lpos, st.b = bt, st.f = final, lm && (final = 1, st.m = lbt, st.d = dm, st.n = dbt);
    } while (!final);
    return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
  }, et = /* @__PURE__ */ new u8(0), gzs = function(d) {
    (d[0] != 31 || d[1] != 139 || d[2] != 8) && err(6, "invalid gzip data");
    var flg = d[3], st = 10;
    flg & 4 && (st += (d[10] | d[11] << 8) + 2);
    for (var zs = (flg >> 3 & 1) + (flg >> 4 & 1); zs > 0; zs -= !d[st++])
      ;
    return st + (flg & 2);
  }, Inflate = /* @__PURE__ */ (function() {
    function Inflate2(opts, cb) {
      typeof opts == "function" && (cb = opts, opts = {}), this.ondata = cb;
      var dict = opts && opts.dictionary && opts.dictionary.subarray(-32768);
      this.s = { i: 0, b: dict ? dict.length : 0 }, this.o = new u8(32768), this.p = new u8(0), dict && this.o.set(dict);
    }
    return Inflate2.prototype.e = function(c) {
      if (this.ondata || err(5), this.d && err(4), !this.p.length)
        this.p = c;
      else if (c.length) {
        var n = new u8(this.p.length + c.length);
        n.set(this.p), n.set(c, this.p.length), this.p = n;
      }
    }, Inflate2.prototype.c = function(final) {
      this.s.i = +(this.d = final || !1);
      var bts = this.s.b, dt = inflt(this.p, this.s, this.o);
      this.ondata(slc(dt, bts, this.s.b), this.d), this.o = slc(dt, this.s.b - 32768), this.s.b = this.o.length, this.p = slc(this.p, this.s.p / 8 | 0), this.s.p &= 7;
    }, Inflate2.prototype.push = function(chunk, final) {
      this.e(chunk), this.c(final);
    }, Inflate2;
  })(), Gunzip = /* @__PURE__ */ (function() {
    function Gunzip2(opts, cb) {
      this.v = 1, this.r = 0, Inflate.call(this, opts, cb);
    }
    return Gunzip2.prototype.push = function(chunk, final) {
      if (Inflate.prototype.e.call(this, chunk), this.r += chunk.length, this.v) {
        var p = this.p.subarray(this.v - 1), s = p.length > 3 ? gzs(p) : 4;
        if (s > p.length) {
          if (!final)
            return;
        } else this.v > 1 && this.onmember && this.onmember(this.r - p.length);
        this.p = p.subarray(s), this.v = 0;
      }
      Inflate.prototype.c.call(this, final), this.s.f && !this.s.l && !final && (this.v = shft(this.s.p) + 9, this.s = { i: 0 }, this.o = new u8(0), this.push(new u8(0), final));
    }, Gunzip2;
  })(), td = typeof TextDecoder < "u" && /* @__PURE__ */ new TextDecoder(), tds = 0;
  try {
    td.decode(et, { stream: !0 }), tds = 1;
  } catch {
  }
  /*! fflate 0.8.2, Copyright (c) 2023 Arjun Barrett. MIT License.
  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:
  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE. */
  var ALLOWED = /* @__PURE__ */ new Set(["gn_zonghe", "cha_gs_dbs_fs_skininfo", "ff_jubaopen", "ff_dbs_pay_gift", "sys_gs_dbs_fs_goodsbaseinfo", "cha_dbs_general_series", "ff_task_daily", "mod_new_ttrank_config", "ff_general_chest_info_config", "gn_dbs_giftbag", "hd_roguelike", "cha_spell", "sys_playcard", "character", "gn_gs_ahievement", "ff_qifu_new", "ff_tiangong", "h5_officer"]);
  ALLOWED.add("sys_h5_shop"), ALLOWED.add("gn_dbs_coupon_cfg"), ALLOWED.add("hd_fight_lord_config"), ALLOWED.add("sys_ss_gamelabel_config"), ALLOWED.add("sys_h5_music"), ALLOWED.add("gn_WallPaper");
  var YJCM_SKINS = "yjcm-skins";
  ALLOWED.add(YJCM_SKINS);
  var ARCHIVE_LIMIT = 64 * 1024 * 1024, ENTRY_LIMIT = 16 * 1024 * 1024, read4 = (fn) => {
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
    let bytes2 = new Uint8Array(length), offset = 0;
    for (let chunk of chunks)
      bytes2.set(chunk, offset), offset += chunk.length;
    return bytes2;
  }
  async function inflate(bytes2, format, win) {
    let Decompressor = "DecompressionStream" in win ? win.DecompressionStream : globalThis.DecompressionStream, stream;
    try {
      Decompressor && (stream = new Decompressor(format));
    } catch {
    }
    if (!stream) {
      let chunks = [], length = 0, decoder = new (format === "gzip" ? Gunzip : Inflate)((chunk) => {
        if (length += chunk.length, length > ENTRY_LIMIT) throw new Error("\u914D\u7F6E\u6587\u4EF6\u8D85\u8FC7\u8BFB\u53D6\u4E0A\u9650");
        chunks.push(chunk.slice());
      });
      for (let offset2 = 0; offset2 < bytes2.length; offset2 += 1024) decoder.push(bytes2.subarray(offset2, offset2 + 1024), offset2 + 1024 >= bytes2.length);
      bytes2.length || decoder.push(bytes2, !0);
      let output = new Uint8Array(length), offset = 0;
      for (let chunk of chunks)
        output.set(chunk, offset), offset += chunk.length;
      return output;
    }
    let BlobType = win.Blob || globalThis.Blob;
    return boundedStream(new BlobType([bytes2]).stream().pipeThrough(stream), ENTRY_LIMIT);
  }
  async function readZipEntry(bytes2, filename, win = globalThis) {
    let view = new DataView(bytes2.buffer, bytes2.byteOffset, bytes2.byteLength), end = -1;
    for (let i2 = bytes2.length - 22; i2 >= Math.max(0, bytes2.length - 65557); i2--)
      if (view.getUint32(i2, !0) === 101010256 && i2 + 22 + view.getUint16(i2 + 20, !0) === bytes2.length) {
        end = i2;
        break;
      }
    if (end < 0 || view.getUint16(end + 4, !0) || view.getUint16(end + 6, !0)) throw new Error("\u5B98\u65B9\u914D\u7F6E\u5305 ZIP \u683C\u5F0F\u4E0D\u652F\u6301");
    let count = view.getUint16(end + 10, !0), directorySize = view.getUint32(end + 12, !0), cursor = view.getUint32(end + 16, !0), directoryEnd = cursor + directorySize;
    if (count > 4096 || directoryEnd > end) throw new Error("\u5B98\u65B9\u914D\u7F6E\u5305\u76EE\u5F55\u65E0\u6548");
    for (let i2 = 0; i2 < count; i2++) {
      if (cursor + 46 > directoryEnd || view.getUint32(cursor, !0) !== 33639248) throw new Error("\u5B98\u65B9\u914D\u7F6E\u5305\u76EE\u5F55\u635F\u574F");
      let flags = view.getUint16(cursor + 8, !0), method = view.getUint16(cursor + 10, !0), packed = view.getUint32(cursor + 20, !0), unpacked = view.getUint32(cursor + 24, !0), nameSize = view.getUint16(cursor + 28, !0), extraSize = view.getUint16(cursor + 30, !0), commentSize = view.getUint16(cursor + 32, !0), next = cursor + 46 + nameSize + extraSize + commentSize;
      if (next > directoryEnd) throw new Error("\u5B98\u65B9\u914D\u7F6E\u5305\u76EE\u5F55\u8D8A\u754C");
      if (new TextDecoder().decode(bytes2.subarray(cursor + 46, cursor + 46 + nameSize)) === filename) {
        let offset = view.getUint32(cursor + 42, !0);
        if (flags & 1 || packed > ENTRY_LIMIT || unpacked > ENTRY_LIMIT || offset + 30 > bytes2.length || view.getUint32(offset, !0) !== 67324752) throw new Error("\u914D\u7F6E\u6761\u76EE\u683C\u5F0F\u6216\u5927\u5C0F\u4E0D\u652F\u6301");
        let start = offset + 30 + view.getUint16(offset + 26, !0) + view.getUint16(offset + 28, !0);
        if (start + packed > bytes2.length) throw new Error("\u914D\u7F6E\u6761\u76EE\u8D8A\u754C");
        let compressed = bytes2.subarray(start, start + packed), output = method === 0 ? compressed.slice() : method === 8 ? await inflate(compressed, "deflate-raw", win) : null;
        if (!output || output.length !== unpacked) throw new Error("\u914D\u7F6E\u6761\u76EE\u89E3\u538B\u5931\u8D25");
        return output;
      }
      cursor = next;
    }
    throw new Error(`\u5B98\u65B9\u914D\u7F6E\u5305\u7F3A\u5C11 ${filename}`);
  }
  async function loadYjcmSkinData(win, signal, knownVersion) {
    var _a2, _b2;
    let root = "https://web.sanguosha.com/x/pc/", controller = new AbortController(), abort = () => controller.abort();
    if (signal.aborted) throw cancelled();
    signal.addEventListener("abort", abort, { once: !0 });
    let timer = setTimeout(abort, 3e4), text3 = (bytes2) => new TextDecoder("utf-8", { fatal: !0 }).decode(bytes2), json = (bytes2) => JSON.parse(text3(bytes2));
    async function fetchData(path, limit2, cache2 = "default") {
      let response = await win.fetch(root + path, { signal: controller.signal, credentials: "omit", redirect: "error", cache: cache2 });
      if (!response.ok) throw new Error(`\u4E00\u5C06\u6210\u540D\u914D\u7F6E\u8BFB\u53D6\u5931\u8D25\uFF08HTTP ${response.status}\uFF0C${path.split("?")[0]}\uFF09`);
      if (!response.body || Number(response.headers.get("content-length")) > limit2) throw new Error("\u4E00\u5C06\u6210\u540D\u914D\u7F6E\u54CD\u5E94\u65E0\u6548");
      return boundedStream(response.body, limit2);
    }
    try {
      let versionsText = text3(await fetchData("versionConf.js", 16384, "no-cache")), configVersion = (_a2 = versionsText.match(/"res\/config\/Config\.sgs"\s*:\s*"([\da-f]{1,32})"/i)) == null ? void 0 : _a2[1], resourceVersion = (_b2 = versionsText.match(/\bresourceVersion\s*=\s*"([\da-f]{1,32})"/i)) == null ? void 0 : _b2[1];
      if (!configVersion || !resourceVersion) throw new Error("\u4E00\u5C06\u6210\u540D\u7248\u672C\u6E05\u5355\u683C\u5F0F\u5DF2\u53D8\u5316");
      let version = configVersion + ":" + resourceVersion;
      if (version === knownVersion) return { version, unchanged: !0 };
      let [archive, wasmBytes, versions, resources, textures] = await Promise.all([
        fetchData("res/config/Config.sgs?v=" + configVersion, ARCHIVE_LIMIT),
        fetchData("libs/min/resc?v=2020032001", 64 * 1024),
        fetchData("version.json?v=" + resourceVersion, ENTRY_LIMIT).then(json),
        fetchData("res/assets/default.res.json", ENTRY_LIMIT).then(json),
        fetchData("res/assets/spinePngHash.json", ENTRY_LIMIT).then(json)
      ]), memory = new WebAssembly.Memory({ initial: 256, maximum: 256 }), { instance } = await WebAssembly.instantiate(wasmBytes, { env: { memory } }), decoder = instance.exports;
      decoder.e(0, 0, 256), decoder.f(0, 0, 256), decoder.d(0, 0, 128);
      let tables = {};
      for (let name of ["GameGeneralConfig", "GeneralSkinInfoConfig", "GameItemConfig", "GeneralCards", "Skills"]) {
        if (controller.signal.aborted) throw cancelled();
        let packed = await readZipEntry(archive, name + ".sgs", win), length = packed.length + (16 - packed.length % 16);
        if (length > memory.buffer.byteLength - 16384) throw new Error("\u4E00\u5C06\u6210\u540D\u914D\u7F6E\u6761\u76EE\u8D85\u8FC7\u89E3\u7801\u4E0A\u9650");
        let buffer = new Uint8Array(memory.buffer, 16384, length);
        buffer.fill(0), buffer.set(packed), decoder.a(buffer.byteOffset, length), decoder.d(0, 0, 128), tables[name] = json(await inflate(buffer.subarray(0, packed.length), "gzip", win));
      }
      if (controller.signal.aborted) throw cancelled();
      return { ...tables, version, versions, resources, textures };
    } catch (error) {
      throw signal.aborted ? cancelled() : controller.signal.aborted ? new Error("\u8BFB\u53D6\u4E00\u5C06\u6210\u540D\u914D\u7F6E\u8D85\u65F6") : error;
    } finally {
      clearTimeout(timer), signal.removeEventListener("abort", abort), abort();
    }
  }
  function createConfigData(win, scope) {
    let cache2 = /* @__PURE__ */ new Map(), pending = /* @__PURE__ */ new Map(), archivePromise;
    function validate(name) {
      if (name = normalize(name), !ALLOWED.has(name)) throw new Error(`\u5C1A\u672A\u58F0\u660E\u7684\u914D\u7F6E\u8868\uFF1A${name}`);
      return name;
    }
    function getConfigData(name) {
      var _a2;
      name = validate(name);
      for (let container of [
        read4(() => win.CtrUtil.AllDatas),
        read4(() => win.SystemContext.AllDatas),
        read4(() => win.__SGS_TOOLBOX_DEMO__.configs)
      ]) {
        let data = read4(() => container[`${name}.sgs`]) || read4(() => container[name]);
        if (!(!data || typeof data != "object") && !(name === "sys_h5_music" && !((_a2 = (data.root ?? data).heromusic) != null && _a2.length)))
          return data;
      }
      return cache2.get(name) || null;
    }
    function archiveUrl() {
      let origin = read4(() => win.location.origin);
      if (origin !== "https://web.sanguosha.com" && origin !== "http://web.sanguosha.com") throw new Error("\u7B49\u5F85\u6E38\u620F\u914D\u7F6E\u6570\u636E\u5C31\u7EEA");
      let entries = read4(() => win.performance.getEntriesByType("resource")) || [];
      for (let entry of entries.slice(-2048).reverse())
        try {
          let url = new URL(entry.name);
          if (url.protocol === "https:" && url.hostname === "web.sanguosha.com" && /\/Config_w\.sgs$/.test(url.pathname) && !url.username && !url.password) return url.href;
        } catch {
        }
      let version = read4(() => win.resourceVersion);
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
    async function loadConfigData(name, { signal = scope.signal, knownVersion } = {}) {
      if (name = validate(name), scope.closed || signal.aborted) throw cancelled();
      return getConfigData(name) || (name === YJCM_SKINS ? loadYjcmSkinData(win, signal, knownVersion) : (pending.has(name) || pending.set(name, (async () => {
        let ctrClass = read4(() => win.CtrUtil) || read4(() => typeof CtrUtil < "u" ? CtrUtil : null), decryptor = read4(() => ctrClass.Ctr);
        if (typeof read4(() => decryptor.Ofb_Dec) != "function") throw new Error("\u7B49\u5F85\u6E38\u620F\u914D\u7F6E\u89E3\u7801\u5668\u5C31\u7EEA");
        let packed = await archive();
        if (scope.closed) throw cancelled();
        let encrypted = await readZipEntry(packed, `${name}.sgs`, win);
        if (scope.closed) throw cancelled();
        let decrypted = decryptor.Ofb_Dec(encrypted.buffer.slice(encrypted.byteOffset, encrypted.byteOffset + encrypted.byteLength)), bytes2 = decrypted instanceof ArrayBuffer ? new Uint8Array(decrypted) : ArrayBuffer.isView(decrypted) ? new Uint8Array(decrypted.buffer, decrypted.byteOffset, decrypted.byteLength) : Array.isArray(decrypted) && decrypted.length <= ENTRY_LIMIT && decrypted.every((value) => Number.isInteger(value) && value >= 0 && value <= 255) ? Uint8Array.from(decrypted) : null;
        if (!bytes2 || bytes2.byteLength > ENTRY_LIMIT) throw new Error("\u6E38\u620F\u914D\u7F6E\u89E3\u7801\u7ED3\u679C\u65E0\u6548");
        let plain = await inflate(bytes2, "gzip", win);
        if (scope.closed) throw cancelled();
        let data = JSON.parse(new TextDecoder("utf-8", { fatal: !0 }).decode(plain));
        if (!data || typeof data != "object" || Array.isArray(data)) throw new Error("\u6E38\u620F\u914D\u7F6E\u5185\u5BB9\u65E0\u6548");
        return cache2.set(name, data), data;
      })().finally(() => pending.delete(name))), pending.get(name)));
    }
    return scope.add(() => {
      cache2.clear(), pending.clear(), archivePromise = null;
    }), { getConfigData, loadConfigData };
  }
  var STARGAZING_SITE = "https://gx.95chong.cn/", STARGAZING_REPORT = STARGAZING_SITE + "api/report", STARGAZING_SYNC_PATH = "/v1/stargazing/report", STARGAZING_REPORT_LIMIT = 1024 * 1024;
  async function readStargazingJson(response) {
    var _a2;
    let reader = (_a2 = response.body) == null ? void 0 : _a2.getReader();
    if (!reader) throw new Error("\u89C2\u661F\u62A5\u8868\u4E3A\u7A7A");
    let decoder = new TextDecoder("utf-8", { fatal: !0 }), chunks = [], bytes2 = 0;
    try {
      if (Number(response.headers.get("content-length")) > STARGAZING_REPORT_LIMIT) throw new Error("\u89C2\u661F\u62A5\u8868\u8FC7\u5927");
      for (; ; ) {
        let { value, done } = await reader.read();
        if (done) return JSON.parse(chunks.join("") + decoder.decode());
        if (bytes2 += value.byteLength, bytes2 > STARGAZING_REPORT_LIMIT) throw new Error("\u89C2\u661F\u62A5\u8868\u8FC7\u5927");
        chunks.push(decoder.decode(value, { stream: !0 }));
      }
    } finally {
      reader.cancel().catch(() => {
      }), reader.releaseLock();
    }
  }
  var MiB = 1024 * 1024, cloudRoot = "https://mres.sanguosha.cn", cloudPrefix = "/update_cloud/public/", pictures = /^ui\/(?:face|sface|bface|icon)\/(?:skin|char)(?:\/(?:horSkin|horChar))?\/[a-f0-9]{32}\.(?:png|jpe?g)$/i, sounds = /^audio\/(?:skill|dead|effect|victory)\/[a-f0-9]{32}\.mp3$/i, motion = /^ui\/face\/skin\/dynamicSkin\/[a-f0-9]{32}\.zip$/i, configZips = /^\/\/config\/clients_[1-9]\d?\.\d{1,2}\.\d{1,2}_formal_\d{12}_[a-z0-9]{4,16}\/config(_list|[1-9]\d{0,2})\.zip$/, pcDownload = /^\/pcgame\/81002\/[1-9]\d?\.\d{1,2}\.\d{1,2}\/(gameInfo\.json|game_\d{8,16}_\d{6,12}\.zip)$/, configParams = {
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
  }, installerArchiveLimit = 4294967295, installerRangeLimit = 24 * MiB, installerSuffixLimit = 65557;
  function validConfigQuery(params) {
    let keys = Array.from(params.keys()), selectors = ["c", "v", "key_v"];
    return new Set(keys).size !== keys.length || keys.length !== Object.keys(configParams).length + selectors.length || Object.entries(configParams).some(([name, value]) => params.get(name) !== value) ? !1 : /^(?:[A-Za-z0-9+/]{16}|[A-Za-z0-9+/]{22}==)$/.test(params.get("c") ?? "") && /^(?:[A-Za-z0-9+/]{22}==|[A-Za-z0-9+/]{27}=|[A-Za-z0-9+/]{32})$/.test(params.get("v") ?? "") && /^\d{11}$/.test(params.get("key_v") ?? "");
  }
  function installerRange(range, limit2) {
    if (range && typeof range == "object") {
      let { suffix, start, end } = range, fields2 = Object.keys(range);
      if (fields2.length === 1 && fields2[0] === "suffix" && Number.isSafeInteger(suffix) && suffix >= 1 && suffix <= Math.min(limit2, installerSuffixLimit))
        return { range: { suffix }, headers: { Range: `bytes=-${suffix}` }, limit: suffix };
      if (fields2.length === 2 && fields2.includes("start") && fields2.includes("end") && Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end >= start && end < installerArchiveLimit && end - start + 1 <= limit2)
        return { range: { start, end }, headers: { Range: `bytes=${start}-${end}` }, limit: end - start + 1 };
    }
    throw new Error("\u79FB\u52A8\u7248\u5B89\u88C5\u5305\u4EC5\u5141\u8BB8\u8BFB\u53D6\u6307\u5B9A\u7684\u6709\u9650\u533A\u95F4");
  }
  function mobileSkinRequest(value, requestedLimit, range) {
    var _a2;
    let url;
    try {
      typeof value == "string" && value.length <= 512 && (url = new URL(value));
    } catch {
    }
    if (!url || url.username || url.password || value.includes("#")) throw new Error("\u79FB\u52A8\u7248\u76AE\u80A4\u8D44\u6E90\u5730\u5740\u65E0\u6548");
    let versionHost = url.origin === "https://waym.sanguosha.cn", configMetadata = versionHost && url.pathname === "/config/";
    if (configMetadata ? !validConfigQuery(url.searchParams) : url.search) throw new Error("\u79FB\u52A8\u7248\u76AE\u80A4\u8D44\u6E90\u5730\u5740\u65E0\u6548");
    let max2, installer = !1;
    if (configMetadata ? max2 = 128 * 1024 : versionHost && url.pathname === "/update/cloud.php" && (max2 = 16 * 1024), url.origin === cloudRoot && url.pathname.startsWith(cloudPrefix)) {
      let asset = url.pathname.slice(cloudPrefix.length);
      /^cloud_[1-9]\d{4,11}\.zip$/.test(asset) ? max2 = 16 * MiB : motion.test(asset) ? max2 = 64 * MiB : pictures.test(asset) ? max2 = 12 * MiB : sounds.test(asset) && (max2 = 4 * MiB);
    } else if (url.origin === cloudRoot) {
      let config = configZips.exec(url.pathname);
      config && (max2 = config[1] === "_list" ? 256 * 1024 : 4 * MiB);
    } else if (url.origin === "https://download.sanguosha.cn") {
      let file = (_a2 = pcDownload.exec(url.pathname)) == null ? void 0 : _a2[1];
      file && (installer = file !== "gameInfo.json", max2 = installer ? installerRangeLimit : 16 * 1024);
    }
    if (!max2) throw new Error("\u79FB\u52A8\u7248\u76AE\u80A4\u8D44\u6E90\u5730\u5740\u4E0D\u5728\u6E38\u5361\u5141\u8BB8\u8303\u56F4\u5185");
    if (requestedLimit !== void 0 && (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1))
      throw new Error("\u79FB\u52A8\u7248\u76AE\u80A4\u8D44\u6E90\u4E0B\u8F7D\u4E0A\u9650\u65E0\u6548");
    if (!installer && range !== void 0) throw new Error("\u79FB\u52A8\u7248\u76AE\u80A4\u8D44\u6E90\u7C7B\u578B\u4E0D\u652F\u6301\u5206\u6BB5\u8BFB\u53D6");
    let limit2 = Math.min(requestedLimit ?? max2, max2);
    return {
      url: url.href,
      limit: limit2,
      timeout: max2 >= 16 * MiB ? 9e4 : 25e3,
      ...installer ? installerRange(range, limit2) : {}
    };
  }
  var stargazingRequest = Object.freeze({ url: STARGAZING_REPORT, limit: MiB, timeout: 25e3, label: "\u89C2\u661F\u6570\u636E" });
  function mobileSkinResponseBytes(bytes2, limit2, expectedLength, label = "\u79FB\u52A8\u7248\u76AE\u80A4\u8D44\u6E90") {
    if (Object.prototype.toString.call(bytes2) !== "[object ArrayBuffer]" || !bytes2.byteLength)
      throw new Error(`${label}\u54CD\u5E94\u65E0\u6548`);
    if (bytes2.byteLength > limit2) throw new Error(`${label}\u8D85\u8FC7\u4E0B\u8F7D\u4E0A\u9650`);
    if (expectedLength !== void 0 && bytes2.byteLength !== expectedLength) throw new Error("\u79FB\u52A8\u7248\u5B89\u88C5\u5305\u5206\u6BB5\u54CD\u5E94\u957F\u5EA6\u4E0D\u7B26");
    return bytes2;
  }
  function mobileSkinPartialLength(request, status, contentRange, contentLength, contentEncoding) {
    if (status !== 206) throw new Error(`\u79FB\u52A8\u7248\u5B89\u88C5\u5305\u672A\u8FD4\u56DE\u6307\u5B9A\u5206\u6BB5\uFF08HTTP ${status}\uFF09`);
    let fields2 = /^bytes (0|[1-9]\d{0,9})-(0|[1-9]\d{0,9})\/([1-9]\d{0,9})$/i.exec(contentRange ?? ""), [start, end, total] = ((fields2 == null ? void 0 : fields2.slice(1)) ?? []).map(Number), { range, limit: limit2 } = request, length = end - start + 1;
    if (!fields2 || end >= total || total > installerArchiveLimit || length < 1 || length > limit2 || (range.suffix === void 0 ? start !== range.start || end !== range.end : end !== total - 1 || length !== Math.min(total, range.suffix)) || contentLength != null && (!/^\d+$/.test(contentLength) || Number(contentLength) !== length) || contentEncoding != null && !/^identity$/i.test(contentEncoding))
      throw new Error("\u79FB\u52A8\u7248\u5B89\u88C5\u5305\u5206\u6BB5\u54CD\u5E94\u8303\u56F4\u6216\u957F\u5EA6\u65E0\u6548");
    return length;
  }
  async function fetchResource(win, request, signal) {
    var _a2, _b2;
    let { url, limit: limit2, headers, label = "\u79FB\u52A8\u7248\u76AE\u80A4\u8D44\u6E90" } = request, overLimit = () => new Error(`${label}\u8D85\u8FC7\u4E0B\u8F7D\u4E0A\u9650`), response = await win.fetch(url, {
      credentials: "omit",
      redirect: "error",
      signal,
      headers,
      ...request.label ? { cache: "no-store", referrerPolicy: "no-referrer" } : {}
    }), expectedLength;
    try {
      if (request.range)
        expectedLength = mobileSkinPartialLength(
          request,
          response.status,
          response.headers.get("content-range"),
          response.headers.get("content-length"),
          response.headers.get("content-encoding")
        );
      else {
        if (!response.ok) throw new Error(`${label}\u4E0D\u53EF\u7528\uFF08HTTP ${response.status}\uFF09`);
        if (Number(response.headers.get("content-length")) > limit2) throw overLimit();
      }
    } catch (error) {
      throw (_a2 = response.body) == null || _a2.cancel().catch(() => {
      }), error;
    }
    let reader = (_b2 = response.body) == null ? void 0 : _b2.getReader();
    if (!reader) return mobileSkinResponseBytes(await response.arrayBuffer(), limit2, expectedLength, label);
    let chunks = [], size = 0;
    try {
      for (; ; ) {
        let { value, done } = await reader.read();
        if (done) break;
        if (size += value.byteLength, size > (expectedLength ?? limit2)) throw overLimit();
        chunks.push(value);
      }
    } catch (error) {
      throw reader.cancel().catch(() => {
      }), error;
    } finally {
      reader.releaseLock();
    }
    let bytes2 = new Uint8Array(size), offset = 0;
    for (let chunk of chunks)
      bytes2.set(chunk, offset), offset += chunk.byteLength;
    return mobileSkinResponseBytes(bytes2.buffer, limit2, expectedLength, label);
  }
  function createGameAssetDownloads(win, scope, port) {
    let pending = /* @__PURE__ */ new Map(), nextId = 0;
    port && (port.onmessage = ({ data }) => {
      let accept = pending.get(data == null ? void 0 : data.id);
      accept && accept(data);
    });
    async function download2(request, signal) {
      var _a2;
      let label = request.label || "\u79FB\u52A8\u7248\u76AE\u80A4\u8D44\u6E90", cancelError = () => new Error(`${label}\u4E0B\u8F7D\u5DF2\u53D6\u6D88`), timeoutError = () => new Error(`${label}\u4E0B\u8F7D\u8D85\u65F6`), validate = (bytes2) => mobileSkinResponseBytes(bytes2, request.limit, void 0, label), owner = scope == null ? void 0 : scope.signal;
      if (signal != null && signal.aborted || owner != null && owner.aborted) throw cancelError();
      if (port) return new Promise((resolve, reject) => {
        let id = ++nextId, finish = (done, value) => {
          pending.delete(id) && (win.clearTimeout(timer2), signal == null || signal.removeEventListener("abort", cancel2), owner == null || owner.removeEventListener("abort", cancel2), done(value));
        }, abort = (error) => {
          try {
            port.postMessage({ id, cancel: !0 });
          } finally {
            finish(reject, error);
          }
        }, cancel2 = () => abort(cancelError()), timer2 = win.setTimeout(() => abort(timeoutError()), request.timeout + 2e3);
        pending.set(id, (data) => {
          if (typeof data.error == "string") {
            finish(reject, new Error(data.error));
            return;
          }
          try {
            finish(resolve, validate(data.bytes));
          } catch (error) {
            finish(reject, error);
          }
        }), signal == null || signal.addEventListener("abort", cancel2, { once: !0 }), owner == null || owner.addEventListener("abort", cancel2, { once: !0 });
        try {
          port.postMessage({ id, url: request.url, limit: request.limit, range: request.range });
        } catch (error) {
          finish(reject, error);
        }
      });
      let controller = new AbortController(), cancel = () => controller.abort(), timer = win.setTimeout(cancel, request.timeout);
      signal == null || signal.addEventListener("abort", cancel, { once: !0 }), owner == null || owner.addEventListener("abort", cancel, { once: !0 });
      let nativeDownload = typeof win.__SGS_TOOLBOX_MOBILE_SKIN_REQUEST__ == "function";
      try {
        return nativeDownload ? validate(await win.__SGS_TOOLBOX_MOBILE_SKIN_REQUEST__(request, controller.signal)) : await fetchResource(win, request, controller.signal);
      } catch (error) {
        if (signal != null && signal.aborted || owner != null && owner.aborted) throw cancelError();
        if (controller.signal.aborted) throw timeoutError();
        if (request.label)
          throw nativeDownload && (_a2 = error == null ? void 0 : error.message) != null && _a2.includes("\u4E0D\u5728\u6E38\u5361\u5141\u8BB8\u8303\u56F4\u5185") ? new Error("\u5F53\u524D\u5FAE\u7AEF\u63A5\u5165\u5C42\u5C1A\u672A\u652F\u6301\u8BFB\u53D6\u89C2\u661F\u7AD9") : !nativeDownload && (error == null ? void 0 : error.name) === "TypeError" ? new Error("\u65E0\u6CD5\u8FDE\u63A5\u89C2\u661F\u7AD9\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u548C\u7528\u6237\u811A\u672C\u7684\u7AD9\u70B9\u8BBF\u95EE\u6743\u9650") : error;
        if (!nativeDownload && (error == null ? void 0 : error.name) === "TypeError") {
          let stage = request.url.endsWith("/cloud.php") ? "\u8BFB\u53D6\u7248\u672C" : /\/cloud_\d+\.zip$/.test(request.url) ? "\u4E0B\u8F7D\u7D22\u5F15" : "\u4E0B\u8F7D\u7D20\u6750", detail = "\u5F53\u524D\u5FAE\u7AEF\u63A5\u5165\u5C42\u7F3A\u5C11\u8DE8\u57DF\u4E0B\u8F7D\u901A\u9053\uFF0C\u8BF7\u7528\u65B0\u7248\u5FAE\u7AEF\u5B89\u88C5\u5305\u5347\u7EA7\u63A5\u5165\u5C42\u3002";
          throw new Error(`\u79FB\u52A8\u7248\u76AE\u80A4${stage}\u5931\u8D25\u3002${detail}`, { cause: error });
        }
        throw error;
      } finally {
        win.clearTimeout(timer), signal == null || signal.removeEventListener("abort", cancel), owner == null || owner.removeEventListener("abort", cancel);
      }
    }
    return {
      async downloadMobileSkinAsset(value, { signal, limit: limit2, range } = {}) {
        return download2(mobileSkinRequest(value, limit2, range), signal);
      },
      async readStargazingReport({ signal } = {}) {
        let bytes2 = await download2(stargazingRequest, signal);
        try {
          return JSON.parse(new TextDecoder("utf-8", { fatal: !0 }).decode(bytes2));
        } catch {
          throw new Error("\u89C2\u661F\u7AD9\u8FD4\u56DE\u4E86\u65E0\u6CD5\u8BFB\u53D6\u7684\u62A5\u8868");
        }
      }
    };
  }
  var POKER_REPLAY_ATTRIBUTE = "data-sgs-poker-replay-active";
  function isPokerReplayActive(document2) {
    var _a2;
    return !!((_a2 = document2 == null ? void 0 : document2.documentElement) != null && _a2.hasAttribute(POKER_REPLAY_ATTRIBUTE));
  }
  var GAME_SCENE = /(?:^|\.)(?:GameScene|TableScene|HallScene)$/, STARTUP_SCENE = /(?:^|\.)(?:LoginScene|CreateUserScene|CreateRoleScene|MainNullScene|LoadingScene)$/, read5 = (fn) => {
    try {
      return fn();
    } catch {
      return;
    }
  }, object = (value) => value && (typeof value == "object" || typeof value == "function") ? value : null, alive = (value) => !!(object(value) && read5(() => value.destroyed) !== !0), children = (node) => Array.isArray(read5(() => node._children)) ? node._children : [];
  function list(value) {
    return Array.isArray(value) ? value : object(value) ? typeof value.values == "function" ? read5(() => [...value.values()]) || [] : read5(() => Object.values(value)) || [] : [];
  }
  function number2(...values) {
    for (let value of values) {
      if (value == null || value === "") continue;
      let result = Number(value);
      if (Number.isFinite(result)) return result;
    }
  }
  function cardId(card) {
    return typeof card == "number" || typeof card == "string" ? number2(card) : number2(read5(() => card.CardId), read5(() => card.CardID), read5(() => card.ID), read5(() => card.Id), read5(() => card.id), read5(() => card.cardId), read5(() => card.cardID));
  }
  function cardIds(cards) {
    return [...new Set(list(cards).map(cardId).filter((id) => Number.isInteger(id) && id > 0))];
  }
  function projectDeckCardMeta(value) {
    if (!value || value.unknown) return null;
    let suit = Number(value.suit), number4 = Number(value.number), type = Number(value.type);
    return suit >= 1 && suit <= 4 && number4 >= 1 && number4 <= 13 ? { suit, number: number4, type: Number.isInteger(type) ? type : 0 } : null;
  }
  function publicHandIds(seat, ui) {
    let shown = [], cached = [], hidden = /* @__PURE__ */ new Set();
    for (let owner of [seat, ui]) for (let key of ["HandShowCards", "handShowCards", "HandShowCardIDs", "handShowCardIDs"]) {
      let values = read5(() => owner[key]);
      if (!Array.isArray(values)) continue;
      let length = read5(() => values.length);
      if (!Number.isInteger(length) || length < 0) continue;
      let target = key.endsWith("IDs") ? cached : shown;
      for (let i2 = 0; i2 < length && i2 < 2048; i2++) {
        let value = read5(() => values[i2]), card = object(read5(() => value.Card)) || object(read5(() => value.card)) || object(read5(() => value.cardInfo)) || value, id = cardId(card);
        !Number.isInteger(id) || id <= 0 || (read5(() => value.IsHide) === !0 || read5(() => value.isHide) === !0 || read5(() => card.IsHide) === !0 || read5(() => card.isHide) === !0 ? hidden.add(id) : target.push(id));
      }
    }
    return [...new Set((shown.length ? shown : cached).filter((id) => !hidden.has(id)))];
  }
  function sceneName(scene) {
    return String(read5(() => scene.SceneName) || read5(() => scene.sceneName) || read5(() => scene.name) || (read5(() => scene.constructor.name) !== "Object" ? read5(() => scene.constructor.name) : "") || "");
  }
  function isGameScene(scene) {
    return alive(scene) && !!(isNativePokerTable(scene) || read5(() => scene.SelfSeatUi) || read5(() => scene.selfSeatUI) || read5(() => scene.seatContainer.seatUIs) || sceneName(scene) === "GameScene");
  }
  function isReplayScene(scene) {
    return !!(read5(() => scene == null ? void 0 : scene.IsReplay) || read5(() => scene == null ? void 0 : scene.isReplay) || alive(read5(() => scene == null ? void 0 : scene.replayBar)));
  }
  function createGameAdapter(win, scope, mobileSkinPort, { watchScene = !0, readLoginAccount } = {}) {
    let configs = scope ? createConfigData(win, scope) : null, selfClass = null, selfSearchAt = -1 / 0, current = null, stage = null, dispatcher = null, dispatcherOwner = null, providers = /* @__PURE__ */ new Set(), definitionTables = /* @__PURE__ */ new WeakMap(), deckDefinitions = null, sceneCycle = null, listeners = /* @__PURE__ */ new Set();
    function walk(predicate, root = read5(() => win.Laya.stage)) {
      let queue = root ? [root] : [], seen = /* @__PURE__ */ new Set();
      for (let i2 = 0; i2 < queue.length; i2++) {
        let item = queue[i2];
        if (!alive(item) || seen.has(item)) continue;
        if (seen.add(item), read5(() => predicate(item))) return item;
        let nodes = children(item);
        for (let j = 0; j < nodes.length && queue.length < 4e3; j++) queue.push(nodes[j]);
      }
      return null;
    }
    function getDispatcher() {
      return sceneCycle && "dispatcher" in sceneCycle ? sceneCycle.dispatcher : ((!alive(dispatcher) || !alive(dispatcherOwner)) && (dispatcher = dispatcherOwner = null, walk((node) => {
        let candidate = read5(() => node.ged);
        return alive(candidate) && object(read5(() => candidate._events)) ? (dispatcher = candidate, dispatcherOwner = node, !0) : read5(() => node._events.SWITCH_SCENE) || read5(() => node._events.HIDE_WINDOW) ? (dispatcher = dispatcherOwner = node, !0) : !1;
      })), sceneCycle && (sceneCycle.dispatcher = dispatcher), dispatcher);
    }
    function eventCallerFrom(target, event, predicate) {
      let handlers = read5(() => target._events[event]);
      for (let entry of Array.isArray(handlers) ? handlers : [handlers]) {
        let candidate = read5(() => entry.caller);
        if (alive(candidate) && read5(() => predicate(candidate))) return candidate;
      }
      return null;
    }
    function eventCaller(event, predicate) {
      return eventCallerFrom(getDispatcher(), event, predicate);
    }
    function stageScene() {
      if (sceneCycle && "rendered" in sceneCycle) return sceneCycle.rendered;
      let layer = walk((node) => node.name === "SceneLayer" || node.layerOrder === 2), scene = layer && (children(layer).filter((node) => node !== layer && alive(node) && read5(() => node.visible) !== !1).at(-1) || null);
      return sceneCycle && (sceneCycle.rendered = scene), scene;
    }
    function canReserveViewport() {
      let scene = stageScene(), name = read5(() => scene.SceneName) || read5(() => scene.sceneName);
      return typeof name == "string" && name.length > 0 && !STARTUP_SCENE.test(name) && read5(() => scene.initialized) !== !1;
    }
    function getScene() {
      if (sceneCycle && "scene" in sceneCycle) return sceneCycle.scene;
      let nextStage = read5(() => win.Laya.stage) || null;
      stage !== nextStage && (stage = nextStage, dispatcher = dispatcherOwner = null, providers = /* @__PURE__ */ new Set(), deckDefinitions = null);
      let demo = read5(() => win.__SGS_TOOLBOX_DEMO__.scene), manager2 = demo ? null : eventCaller("SWITCH_SCENE", (value) => "CurrentScene" in value), managerScene = read5(() => manager2.CurrentScene), rendered = demo ? null : stageScene(), next = alive(demo) ? demo : rendered || (alive(managerScene) && read5(() => managerScene.visible) !== !1 ? managerScene : null) || walk((node) => read5(() => node.visible) !== !1 && (GAME_SCENE.test(sceneName(node)) || isGameScene(node)));
      if (sceneCycle && (sceneCycle.scene = next || null), next !== current) {
        current = next || null, providers = /* @__PURE__ */ new Set(), dispatcher = dispatcherOwner = null, deckDefinitions = null, sceneCycle && delete sceneCycle.dispatcher;
        for (let fn of [...listeners])
          try {
            fn(current);
          } catch {
          }
      }
      return current;
    }
    function withSceneCycle(run) {
      if (sceneCycle) return run();
      sceneCycle = {};
      try {
        return run();
      } finally {
        sceneCycle = null;
      }
    }
    let selfUI = (scene) => read5(() => scene.SelfSeatUi) || read5(() => scene.selfSeatUI) || null, seats = (scene) => list(read5(() => scene.seatContainer.seatUIs) || read5(() => scene.seatUIs)).filter((ui) => alive(ui) && nativeSeatOccupied(ui)), handUIs = (ui) => list(read5(() => ui.cardContainer.cardUis) || read5(() => ui.cardUis) || children(read5(() => ui.cardContainer))).filter(alive), model = (ui) => read5(() => ui.Card) || read5(() => ui.card) || read5(() => ui.cardInfo) || read5(() => ui.dataSource), seatData = nativeSeat, seatId = nativeSeatId;
    function getClass(name) {
      return typeof name != "string" || !name ? null : object(read5(() => win.Laya.ClassUtils.getClass(name))) || object(read5(() => win[name]));
    }
    function getSelf() {
      let demo = read5(() => win.__SGS_TOOLBOX_DEMO__.self);
      if (demo) return demo;
      let nativeClass = selfClass || getClass("UserData"), stored = nativeClass && read5(() => Object.getOwnPropertyDescriptor(nativeClass, "self"));
      if (stored && "value" in stored) return object(stored.value);
      let context2 = getClass("GameContext");
      if (read5(() => context2.IsViewerOrReplay()) === !1 && !isReplayScene(getScene())) {
        let self = object(read5(() => context2.CurrentPlayer));
        if (number2(read5(() => self.ClientId))) return self;
      }
      if (Date.now() - selfSearchAt < 1e3) return null;
      selfSearchAt = Date.now();
      let inspectUserNode = (node) => {
        for (let key of ["userData", "data"]) {
          let descriptor = read5(() => Object.getOwnPropertyDescriptor(node, key)), value = descriptor && "value" in descriptor ? descriptor.value : null;
          if (!object(value) || !number2(read5(() => value.ClientId))) continue;
          let ctor = read5(() => value.constructor), own3 = read5(() => Object.getOwnPropertyDescriptor(ctor, "self"));
          if (own3 && "value" in own3 && object(own3.value) && number2(read5(() => own3.value.ClientId)))
            return selfClass = ctor, !0;
        }
        return !1;
      };
      return inspectUserNode(read5(() => getScene().topMenu.moneyMenuUI)) || walk(inspectUserNode), selfClass ? object(read5(() => Object.getOwnPropertyDescriptor(selfClass, "self").value)) : null;
    }
    function getServerProxy() {
      let scene = getScene(), direct = read5(() => scene.proxy) || read5(() => scene.serverProxy);
      if (alive(direct)) return direct;
      let manager2 = eventCaller("HIDE_WINDOW", (value) => object(value.proxy));
      return object(read5(() => manager2.proxy)) || existingSingleton("ServerProxy");
    }
    function existingSingleton(name) {
      let registered = getClass(name);
      if (!alive(registered)) return null;
      if (typeof registered != "function" && typeof read5(() => registered.event) == "function") return registered;
      for (let key of ["instance", "Instance", "I", "_instance", "s_instance"]) {
        let descriptor = read5(() => Object.getOwnPropertyDescriptor(registered, key)), candidate = descriptor && "value" in descriptor ? descriptor.value : null;
        if (alive(candidate) && typeof read5(() => candidate.event) == "function") return candidate;
      }
      return null;
    }
    function getActivityManager(proxy = getServerProxy()) {
      return eventCallerFrom(proxy, "ClientJDInfoNtf", (value) => typeof value.event == "function") || existingSingleton("ActivityManager");
    }
    function getMessageTargets() {
      let targets = [], seen = /* @__PURE__ */ new Set(), proxy = getServerProxy();
      for (let [name, target] of [["ServerProxy", proxy], ["ActivityManager", getActivityManager(proxy)]])
        !alive(target) || typeof read5(() => target.event) != "function" || seen.has(target) || (seen.add(target), targets.push({ name, target }));
      return targets;
    }
    function registerProviders(card) {
      let proto = object(card), seen = /* @__PURE__ */ new Set();
      for (let i2 = 0; proto && i2 < 8 && !seen.has(proto); i2++) {
        seen.add(proto);
        let ctor = read5(() => proto.constructor);
        typeof ctor == "function" && typeof read5(() => ctor.GetInstance) == "function" && providers.add(ctor), proto = read5(() => Object.getPrototypeOf(proto));
      }
    }
    function* cardDefinitions() {
      let tables = [
        read5(() => win.CtrUtil.AllDatas),
        read5(() => win.CtrUtil.allDatas),
        read5(() => win.SystemContext.AllDatas),
        read5(() => win.SystemContext.allDatas),
        read5(() => win.__SGS_TOOLBOX_DEMO__.configs)
      ].map((data) => read5(() => data["sys_playcard.sgs"]) || read5(() => data.sys_playcard));
      tables.push(configs == null ? void 0 : configs.getConfigData("sys_playcard"));
      for (let config of tables) {
        let rows = read5(() => config.GamePlayCards.card);
        if (!Array.isArray(rows)) continue;
        let index = definitionTables.get(rows);
        if (!index || index.length !== rows.length) {
          let abbreviations = new Map(list(read5(() => config.abbreviation)).map((item) => [read5(() => item.Short), read5(() => item.Long)])), records = /* @__PURE__ */ new Map();
          for (let row of rows) {
            if (!object(row)) continue;
            let record = {};
            for (let [key, value] of Object.entries(row)) record[abbreviations.get(key) || key] = value;
            let rowId = cardId(record);
            Number.isInteger(rowId) && rowId > 0 && records.set(rowId, record);
          }
          index = { length: rows.length, records }, definitionTables.set(rows, index);
        }
        yield index;
      }
    }
    function getCardDefinition(id, definitions = cardDefinitions()) {
      for (let { records } of definitions) {
        let card = records.get(id);
        if (card) return card;
      }
      return null;
    }
    function getCardFaceCatalog() {
      for (let index of cardDefinitions()) {
        if (!index.faces) {
          let faces = /* @__PURE__ */ new Map();
          for (let { res, name } of index.records.values()) {
            if (!cardFrameName(res) || typeof name != "string" || !name.trim() || faces.has(res)) continue;
            let label = name === "\u6740" && { HuoSha: "\u706B\u6740", LeiSha: "\u96F7\u6740", BingSha: "\u51B0\u6740" }[res] || name;
            faces.set(res, Object.freeze({ res, label }));
          }
          index.faces = Object.freeze([...faces.values()].sort((a, b) => a.label.localeCompare(b.label, "zh-CN")));
        }
        if (index.faces.length) return index.faces;
      }
      return null;
    }
    async function loadCardFaceCatalog() {
      let existing = getCardFaceCatalog();
      if (existing) return existing;
      if (!configs) throw new Error("\u914D\u7F6E\u8BFB\u53D6\u4E0D\u53EF\u7528");
      await configs.loadConfigData("sys_playcard");
      let catalog = getCardFaceCatalog();
      if (!catalog) throw new Error("\u6E38\u620F\u724C\u8868\u4E2D\u6CA1\u6709\u53EF\u6362\u56FE\u7684\u724C");
      return catalog;
    }
    function* ownCardModels(scene) {
      for (let item of handUIs(selfUI(scene))) {
        let observed = model(item);
        observed && (registerProviders(observed), yield observed);
      }
    }
    function getProviderCard(id) {
      for (let provider2 of providers) {
        let candidate = read5(() => provider2.GetInstance(id));
        if (!object(candidate)) continue;
        let candidateId = cardId(candidate);
        if (candidateId === void 0 || candidateId === id) return candidate;
      }
      return null;
    }
    function getCardName(card, definition) {
      return read5(() => card == null ? void 0 : card.CardName) || read5(() => card == null ? void 0 : card.cardName) || read5(() => card == null ? void 0 : card.Name) || read5(() => card == null ? void 0 : card.name) || read5(() => definition == null ? void 0 : definition.CardName) || read5(() => definition == null ? void 0 : definition.Name) || read5(() => definition == null ? void 0 : definition.name);
    }
    function getCardProperties(card, definition) {
      return {
        suit: number2(
          read5(() => card == null ? void 0 : card.FlowerOnSeat),
          read5(() => card == null ? void 0 : card.CardFlower),
          read5(() => card == null ? void 0 : card.Flower),
          read5(() => card == null ? void 0 : card.suit),
          read5(() => definition == null ? void 0 : definition.color),
          read5(() => definition == null ? void 0 : definition.CardSuit),
          read5(() => definition == null ? void 0 : definition.suit)
        ),
        number: number2(
          read5(() => card == null ? void 0 : card.CardNumber),
          read5(() => card == null ? void 0 : card.Number),
          read5(() => card == null ? void 0 : card.number),
          read5(() => definition == null ? void 0 : definition.number),
          read5(() => definition == null ? void 0 : definition.CardNumber),
          read5(() => definition == null ? void 0 : definition.Number)
        ),
        type: number2(
          read5(() => card == null ? void 0 : card.CardType),
          read5(() => card == null ? void 0 : card.Type),
          read5(() => card == null ? void 0 : card.type),
          read5(() => definition == null ? void 0 : definition.type),
          read5(() => definition == null ? void 0 : definition.CardType),
          read5(() => definition == null ? void 0 : definition.Type)
        )
      };
    }
    function getCardMeta(id) {
      if (id = number2(id), !Number.isInteger(id) || id <= 0) return { id, name: "\u672A\u77E5\u724C", unknown: !0 };
      let scene = getScene(), demo = read5(() => {
        var _a2, _b2;
        return (_b2 = (_a2 = win.__SGS_TOOLBOX_DEMO__) == null ? void 0 : _a2.cards) == null ? void 0 : _b2[id];
      });
      if (demo) return { ...demo, id };
      let card;
      for (let observed of ownCardModels(scene)) cardId(observed) === id && (card = observed);
      card ||= getProviderCard(id);
      let definition = getCardDefinition(id);
      if (!card && !definition) return { id, name: `\u724C #${id}`, unknown: !0 };
      let name = getCardName(card, definition), cardClass = read5(() => definition == null ? void 0 : definition.cardClass) || read5(() => {
        var _a2;
        return (_a2 = card == null ? void 0 : card.cardInfo) == null ? void 0 : _a2.cardClass;
      }) || read5(() => card == null ? void 0 : card.cardClass) || read5(() => {
        var _a2;
        return (_a2 = card == null ? void 0 : card.cardInfo) == null ? void 0 : _a2.Class;
      }) || read5(() => card == null ? void 0 : card.className) || read5(() => card == null ? void 0 : card.ClassName) || read5(() => definition == null ? void 0 : definition.Class) || read5(() => definition == null ? void 0 : definition.class) || read5(() => definition == null ? void 0 : definition.className), firstSkillId = number2(read5(() => card == null ? void 0 : card.FirstSkillId));
      return {
        id,
        name: typeof name == "string" && name ? name : `\u724C #${id}`,
        ...getCardProperties(card, definition),
        unknown: !(typeof name == "string" && name),
        ...typeof cardClass == "string" && cardClass ? { cardClass } : {},
        ...firstSkillId > 0 ? { firstSkillId } : {}
      };
    }
    function getDeckCardMeta(ids, scene) {
      let demo = read5(() => {
        var _a2;
        return (_a2 = win.__SGS_TOOLBOX_DEMO__) == null ? void 0 : _a2.cards;
      }), ownCards = /* @__PURE__ */ new Map();
      for (let card of ownCardModels(scene)) ownCards.set(cardId(card), card);
      let definitions = [...new Set(cardDefinitions())], stable = !demo && !providers.size && !ownCards.size && Object.isFrozen(ids);
      if (stable && (deckDefinitions == null ? void 0 : deckDefinitions.ids) === ids && deckDefinitions.definitions.length === definitions.length && definitions.every((index, i2) => index === deckDefinitions.definitions[i2])) return deckDefinitions.metadata;
      let metadata = {};
      for (let id of ids) {
        let value = read5(() => {
          let fixture = read5(() => demo == null ? void 0 : demo[id]);
          if (fixture) return projectDeckCardMeta(fixture);
          let card = ownCards.get(id) || getProviderCard(id), definition = getCardDefinition(id, definitions), name = getCardName(card, definition);
          return typeof name == "string" && name ? projectDeckCardMeta(getCardProperties(card, definition)) : null;
        });
        value && (metadata[id] = stable ? Object.freeze(value) : value);
      }
      return deckDefinitions = stable ? { ids, definitions, metadata: Object.freeze(metadata) } : null, metadata;
    }
    function getCountdown() {
      let scene = getScene(), ui = selfUI(scene), timer = read5(() => ui.countdownTimer) || read5(() => scene.countdownTimer), value = alive(timer) ? number2(read5(() => timer.RemainValue)) : void 0;
      return value === void 0 ? null : Math.max(0, value);
    }
    function getRemainingSlash() {
      let scene = getScene();
      if (!isGameScene(scene) || isNativePokerTable(scene)) return null;
      let seat = seatData(selfUI(scene));
      if (!seat || read5(() => seat.IsDead) === !0) return null;
      let targets = read5(() => seat.GetSeatState(1).Targets), info = read5(() => seat.shaInfo);
      if (read5(() => info.Disabled) === !0) return 0;
      if (read5(() => info.NoLimit) === !0 || read5(() => targets[4]) === 9999) return 1 / 0;
      if (targets && typeof targets.length == "number") {
        let used = Number(targets[0] || 0), limit2 = Number(targets[1] || 1);
        return Number.isFinite(used) && Number.isFinite(limit2) ? Math.max(0, limit2 - used) : null;
      }
      if (read5(() => seat.ShaNoLimit) === !0) return 1 / 0;
      let count = number2(read5(() => info.Count), read5(() => seat.ShaCount));
      return count === void 0 ? null : Math.max(0, count);
    }
    function getSnapshot(deckIds) {
      let scene = getScene(), self = selfUI(scene), selfSeatId = seatId(self), selfSeat = read5(() => self.cardContainer.seat) || seatData(self), ownModels = read5(() => selfSeat.HandCards) ?? read5(() => selfSeat.handCards), handCardIds = Array.isArray(ownModels) ? cardIds(ownModels) : cardIds(handUIs(self).map(model)), mode = read5(() => getClass("GameContext").GetModeVO()), countdown = read5(() => self.countdownTimer) || read5(() => scene.countdownTimer), remaining = alive(countdown) ? number2(read5(() => countdown.RemainValue)) : void 0, snapshot = {
        sceneName: sceneName(scene),
        inGame: isGameScene(scene),
        modeId: number2(read5(() => scene.ModeID), read5(() => scene.modeId), read5(() => mode.ModeID), read5(() => mode.Id), read5(() => mode.id)),
        selfSeatId,
        handCardIds,
        emptySeatIds: list(read5(() => scene.seatContainer.seatUIs) || read5(() => scene.seatUIs)).filter((ui) => alive(ui) && !nativeSeatOccupied(ui)).map(seatId).filter((id) => id !== void 0),
        isReplay: isReplayScene(scene),
        ...isNativePokerTable(scene) && { pokerTable: !0 },
        ...isPokerReplayActive(win.document) && { pokerReplay: !0 },
        countdownRemaining: remaining === void 0 ? null : Math.max(0, remaining),
        seats: seats(scene).map((ui) => {
          let seat = seatData(ui), id = seatId(ui), result = {
            seatId: id,
            position: nativeSeatPosition(ui) ?? null,
            viewId: number2(read5(() => seat.fixedViewId), read5(() => seat.FixedViewId), read5(() => ui.fixedViewId), read5(() => ui.viewId), read5(() => ui.actualSeatID)),
            handCount: number2(read5(() => seat.HandCardCount), read5(() => seat.HandCount), id === selfSeatId ? read5(() => ownModels.length) : void 0),
            dead: read5(() => seat.IsDead) ?? read5(() => seat.isDead),
            knownHandCardIds: publicHandIds(seat, ui)
          };
          return id !== void 0 && id === selfSeatId && (result.handCardIds = handCardIds.slice()), result;
        }).filter((item) => item.seatId !== void 0)
      };
      return Array.isArray(deckIds) && deckIds.length && (snapshot.cardMeta = getDeckCardMeta(deckIds, scene)), snapshot;
    }
    return watchScene && (scope == null || scope.interval(() => {
      getScene();
    }, 500)), scope == null || scope.add(() => {
      listeners.clear(), providers.clear(), definitionTables = /* @__PURE__ */ new WeakMap(), deckDefinitions = null, dispatcher = dispatcherOwner = current = stage = null;
    }), {
      getScene,
      getRenderedScene: stageScene,
      withSceneCycle,
      getDispatcher,
      getSelfSeatUI: () => selfUI(getScene()),
      getSeatUIs: () => seats(getScene()),
      getCardMeta,
      getCardFaceCatalog,
      loadCardFaceCatalog,
      getSnapshot,
      getClass,
      getServerProxy,
      getActivityManager,
      getMessageTargets,
      getCountdown,
      getSelf,
      getLoginAccount: () => readLoginAccount == null ? void 0 : readLoginAccount(getServerProxy()),
      getRemainingSlash,
      isInGame: () => isGameScene(getScene()),
      isReplay: (scene = getScene()) => isReplayScene(scene),
      canReserveViewport,
      getConfigData: (name) => (configs == null ? void 0 : configs.getConfigData(name)) || null,
      loadConfigData: (name, options) => configs ? configs.loadConfigData(name, options) : Promise.reject(new Error("\u914D\u7F6E\u8BFB\u53D6\u4E0D\u53EF\u7528")),
      ...createGameAssetDownloads(win, scope, mobileSkinPort),
      supportsMobileSkinConfig: !0,
      onSceneChange(fn) {
        if (typeof fn != "function") throw new TypeError("Scene subscriber must be a function");
        return listeners.add(fn), () => listeners.delete(fn);
      }
    };
  }
  var SCENE_EVENTS = ["SWITCH_SCENE", "HIDE_WINDOW"];
  function createSceneWatch({ game, scope }) {
    let started = performance.now(), watchers = /* @__PURE__ */ new Set(), dispatcher = null, releaseDispatcher, signalPending = !1, timer, scheduledAt;
    function schedule() {
      if (scope.closed) return;
      let next = 1 / 0;
      for (let watcher of watchers) next = Math.min(next, watcher.due);
      next !== scheduledAt && (clearTimeout(timer), scheduledAt = next, Number.isFinite(next) && (timer = setTimeout(() => {
        scheduledAt = void 0, run(), schedule();
      }, Math.max(1, Math.ceil(started + next - performance.now())))));
    }
    function watch(callback, interval, onSignal = !1) {
      let elapsed = performance.now() - started, watcher = { callback, interval, onSignal, due: (Math.floor(elapsed / interval) + 1) * interval };
      return watchers.add(watcher), schedule(), () => {
        watchers.delete(watcher), schedule();
      };
    }
    function run(signaled = !1) {
      if (scope.closed) return;
      let elapsed = performance.now() - started, due = [...watchers].filter((watcher) => elapsed >= watcher.due || signaled && watcher.onSignal);
      due.length && game.withSceneCycle(() => {
        for (let watcher of due)
          if (!(scope.closed || !watchers.has(watcher))) {
            elapsed >= watcher.due && (watcher.due = (Math.floor(elapsed / watcher.interval) + 1) * watcher.interval);
            try {
              watcher.callback();
            } catch {
            }
          }
      });
    }
    function syncDispatcher() {
      game.getScene();
      let next = game.getDispatcher();
      if (dispatcher === next || (releaseDispatcher == null || releaseDispatcher(), dispatcher = next, releaseDispatcher = null, typeof (next == null ? void 0 : next.on) != "function" || typeof next.off != "function")) return;
      let caller = {}, signal = () => {
        scope.closed || next !== dispatcher || signalPending || (signalPending = !0, queueMicrotask(() => {
          signalPending = !1, run(!0), schedule();
        }));
      }, subscribed = [];
      for (let event of SCENE_EVENTS)
        try {
          next.on(event, caller, signal), subscribed.push(event);
        } catch {
        }
      releaseDispatcher = () => {
        for (let event of subscribed)
          try {
            next.off(event, caller, signal);
          } catch {
          }
      };
    }
    return watch(syncDispatcher, 500, !0), scope.add(() => {
      clearTimeout(timer), watchers.clear(), dispatcher = null, releaseDispatcher == null || releaseDispatcher();
    }), { watch };
  }
  function createCompatibility() {
    throw new Error("Browser compatibility is unavailable in microclient");
  }
  var servers = [GITHUB_MARKET_URL, HANGZHOU_MARKET_URL, OSS_MARKET_URL], download = new URL(DOWNLOAD_MARKET_URL).hostname;
  function marketServerLabel(baseUrl) {
    if (String(baseUrl).replace(/\/+$/, "") === DOWNLOAD_MARKET_URL) return "\u4E0B\u8F7D\u670D\u52A1\u5668";
    let index = servers.indexOf(String(baseUrl).replace(/\/+$/, ""));
    return index < 0 ? "\u81EA\u5B9A\u4E49\u670D\u52A1\u5668" : `\u670D\u52A1\u5668 ${index + 1}`;
  }
  function userErrorMessage(error) {
    let message = String((error == null ? void 0 : error.message) ?? error ?? "\u64CD\u4F5C\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002");
    message = message.replace(/(?:https?|wss?):\/\/[^\s<>"'，。；）)]+/gi, (value) => {
      try {
        let host = new URL(value).hostname;
        if (host === download) return "\u4E0B\u8F7D\u670D\u52A1\u5668";
        let index = servers.findIndex((url) => new URL(url).hostname === host);
        return index < 0 ? "\u7F51\u7EDC\u5730\u5740" : `\u670D\u52A1\u5668 ${index + 1}`;
      } catch {
        return "\u7F51\u7EDC\u5730\u5740";
      }
    });
    for (let [index, url] of servers.entries()) {
      let host = new URL(url).hostname;
      message = message.split(url).join(`\u670D\u52A1\u5668 ${index + 1}`).split(host).join(`\u670D\u52A1\u5668 ${index + 1}`);
    }
    return message.split(download).join("\u4E0B\u8F7D\u670D\u52A1\u5668").replace(/(?:https?|wss?):\/\/[^\s<>"'，。；）)]+/gi, "\u7F51\u7EDC\u5730\u5740").replace(/\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*(?::\d+)?\b/gi, "\u7F51\u7EDC\u5730\u5740").replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?\b/g, "\u7F51\u7EDC\u5730\u5740").replace(/\[?[a-f0-9]*:(?:[a-f0-9]*:)+[a-f0-9:.]+\]?(?::\d+)?/gi, "\u7F51\u7EDC\u5730\u5740");
  }
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
        var _a2;
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
        if (Number((_a2 = response.headers) == null ? void 0 : _a2.get("content-length")) > this.maxBytes) throw new MarketError("RESPONSE_TOO_LARGE", "\u63D2\u4EF6\u5E02\u573A\u54CD\u5E94\u8D85\u8FC7\u5927\u5C0F\u9650\u5236\u3002");
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
  }, LOCAL_MARKET_URL = "http://127.0.0.1:17321", PublicMarketClient = class {
    constructor(fetchImpl, { sources = [GITHUB_MARKET_URL, DOWNLOAD_MARKET_URL], mirror = "", session = {}, probeTimeoutMs = 2500, ...options } = {}) {
      mirror && (sources = [mirror, ...sources]), this.clients = sources.map((baseUrl) => new MarketClient({ ...options, baseUrl, fetchImpl })), this.active = this.clients[0], this.session = session, this.mirror = mirror, this.probeTimeoutMs = probeTimeoutMs, this.fetchImpl = fetchImpl, this.options = options;
    }
    get baseUrl() {
      return this.active.baseUrl;
    }
    start() {
      return this.session.probe ||= (async () => {
        for (let client of this.clients.filter((client2) => [this.mirror, GITHUB_MARKET_URL].includes(client2.baseUrl)))
          try {
            await new MarketClient({
              ...this.options,
              baseUrl: client.baseUrl,
              fetchImpl: this.fetchImpl,
              timeoutMs: Math.min(this.probeTimeoutMs, this.options.timeoutMs || this.probeTimeoutMs)
            }).getCatalog();
            return;
          } catch {
            this.markUnavailable(client);
          }
      })();
    }
    markUnavailable(client) {
      client.baseUrl === GITHUB_MARKET_URL && (this.session.githubPoor = !0), client.baseUrl === this.mirror && (this.session.mirrorPoor = !0);
    }
    eligible() {
      return this.clients.filter((client) => !(this.session.githubPoor && client.baseUrl === GITHUB_MARKET_URL) && !(this.session.mirrorPoor && client.baseUrl === this.mirror));
    }
    async attempt(clients, action) {
      let failures = [];
      for (let client of clients)
        try {
          let result = await action(client);
          return this.active = client, result;
        } catch (error) {
          this.markUnavailable(client), failures.push(`${marketServerLabel(client.baseUrl)}\uFF1A${userErrorMessage(error)}`);
        }
      throw new Error(`\u63D2\u4EF6\u5E02\u573A\u6682\u65F6\u65E0\u6CD5\u8FDE\u63A5\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002
` + failures.join(`
`));
    }
    async getCatalog() {
      return await this.session.probe, this.attempt(this.eligible(), (client) => client.getCatalog());
    }
    async health() {
      return await this.getCatalog(), { ok: !0, service: "sgs-toolbox-market", schemaVersion: 1 };
    }
    async getPackage(entry) {
      await this.session.probe;
      let source = this.clients.find((client) => {
        try {
          return client.resolvePackageUrl(entry.packageUrl), !0;
        } catch {
          return !1;
        }
      });
      if (!source) return Promise.reject(new Error("\u63D2\u4EF6\u5305\u5FC5\u987B\u6765\u81EA\u53D1\u5E03\u76EE\u5F55\u7684 packages \u76EE\u5F55\u3002"));
      let path = source.resolvePackageUrl(entry.packageUrl).slice(source.baseUrl.length + 1), order = this.eligible();
      return this.attempt(order, async (client) => verifyPackage(await client.getPackage({ ...entry, packageUrl: path })));
    }
  };
  function createMarketConnection(settings, fetchImpl, onError = () => {
  }, { development = !1 } = {}) {
    let session = {};
    if (!development) {
      let client2 = new PublicMarketClient(fetchImpl, { session, mirror: "" });
      return { get: () => client2, start: () => client2.start(), set() {
        throw new Error("\u516C\u5F00\u7248\u81EA\u52A8\u8FDE\u63A5\u63D2\u4EF6\u5E02\u573A\u3002");
      } };
    }
    let create = (baseUrl) => baseUrl === "" ? null : new MarketClient({ baseUrl, fetchImpl }), client;
    try {
      let saved = settings.get("marketUrl", LOCAL_MARKET_URL);
      [GITHUB_MARKET_URL, DOWNLOAD_MARKET_URL, HANGZHOU_MARKET_URL, OSS_MARKET_URL].includes(String(saved).replace(/\/+$/, "")) && settings.get("marketCustomUrl", "") !== saved && (saved = LOCAL_MARKET_URL, settings.set("marketUrl", saved)), client = create(saved);
    } catch {
      client = create(LOCAL_MARKET_URL), settings.set("marketUrl", client.baseUrl), onError("\u4FDD\u5B58\u7684\u5E02\u573A\u5730\u5740\u65E0\u6548\uFF0C\u5DF2\u6062\u590D\u672C\u673A\u9ED8\u8BA4\u5730\u5740\u3002");
    }
    return { get: () => client, start: () => Promise.resolve(), set(value) {
      let next = create(String(value).trim()), url = (next == null ? void 0 : next.baseUrl) || "";
      return settings.set("marketUrl", url), settings.set("marketCustomUrl", url), client = next, url;
    } };
  }
  var RESYNC = /* @__PURE__ */ new Set(["MsgGamePlayCardNtf", "MsgReconnectGame", "MsgReconnectGameHand", "SmsgGameSetCharacter", "GsCGuoZhanSetCharacter"]);
  function attachSessionSnapshots({ journal, game, scope, settled = () => Promise.resolve() }) {
    let generation = 0, lastSignature = "", pending = !1, deckIds = [], timers = /* @__PURE__ */ new Set();
    function cancel() {
      for (let timer of timers) clearTimeout(timer);
      timers.clear();
    }
    function request() {
      scope.closed || (generation++, cancel(), !pending && (pending = !0, queueMicrotask(async () => {
        let waitingFor = generation;
        try {
          await settled();
        } catch {
          !scope.closed && waitingFor !== generation && queueMicrotask(request);
          return;
        } finally {
          pending = !1;
        }
        if (scope.closed) return;
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
            data = deckIds.length ? game.getSnapshot(deckIds) : game.getSnapshot();
          } catch {
            try {
              data = deckIds.length ? game.getSnapshot() : {};
            } catch {
              data = {};
            }
          }
          if (!data.cardMeta && game.getCardMeta && deckIds.length) {
            data.cardMeta = {};
            for (let id of deckIds) {
              let value;
              try {
                value = projectDeckCardMeta(game.getCardMeta(id));
              } catch {
                continue;
              }
              value && (data.cardMeta[id] = value);
            }
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
      var _a2;
      event.type === "MsgGamePlayCardNtf" && (deckIds = Object.freeze((((_a2 = event.payload) == null ? void 0 : _a2.CardList) || []).map(Number).filter((id) => Number.isInteger(id) && id > 0).slice(0, 2048))), (event.type === "ClientLeavetableRep" || event.type === "ClientLoginRep") && (deckIds = []), RESYNC.has(event.type) && request();
    })), scope.add(game.onSceneChange(request)), scope.add(() => {
      generation++, cancel();
    }), request(), { request, refreshForReplay() {
      lastSignature = "", request();
    } };
  }
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
    "GeneralData",
    "Datas",
    "IsSpell",
    "DataID",
    "MsgID",
    "MData",
    "MurSeatID"
  ], ARRAYS = /* @__PURE__ */ new Set(["CardList", "CardIDs", "DestSeatIDs", "list_card_id", "Params", "Infos", "GeneralData", "Datas", "MData"]), REQUIRED = {
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
  }, number3 = (value) => typeof value == "number" && Number.isFinite(value) ? value : void 0, atom = (value) => typeof value == "boolean" ? value : number3(value) ?? (typeof value == "string" && /^-?\d{1,16}$/.test(value) ? value : void 0), validType = (type) => typeof type == "string" && type.length <= 96 && EVENT_NAME.test(type), limit = (value, fallback, max2) => Number.isInteger(value) ? Math.min(max2, Math.max(1, value)) : fallback;
  function array(value, key, truncated) {
    if (!Array.isArray(value)) return;
    let length = own2(value, "length");
    if (!Number.isInteger(length) || length < 0) return;
    let cap = key === "Infos" || key === "GeneralData" ? 32 : 256;
    length > cap && (truncated[key] = { originalLength: length, retainedLength: cap });
    let result = [];
    for (let i2 = 0; i2 < Math.min(length, cap); i2++) {
      let item = own2(value, String(i2)), scalar2 = atom(item);
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
        let field2 = atom(own2(item, name));
        field2 !== void 0 && (record[name] = field2);
      }
      result.push(record);
    }
    return result;
  }
  function packet(payload) {
    let result = {}, truncated = {};
    for (let key of FIELDS) {
      let value = own2(payload, key), field2 = ARRAYS.has(key) ? array(value, key, truncated) : atom(value);
      field2 !== void 0 && (result[key] = field2);
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
      let nextSession = number3(own2(event, "sessionId"));
      nextSession !== void 0 && nextSession !== sessionId && resetSession(nextSession);
      let type = own2(event, "type");
      if (type === "toolbox:snapshot") {
        let payload = own2(event, "payload"), seats = own2(payload, "seats"), projected = {};
        for (let key of ["inGame", "selfSeatId"]) {
          let value = atom(own2(payload, key));
          value !== void 0 && (projected[key] = value);
        }
        if (projected.seats = [], Array.isArray(seats)) for (let i2 = 0; i2 < Math.min(32, seats.length); i2++) {
          let seat = own2(seats, String(i2)), result = {};
          for (let key of ["seatId", "position", "viewId", "handCount", "dead"]) {
            let value = atom(own2(seat, key));
            value !== void 0 && (result[key] = value);
          }
          projected.seats.push(result);
        }
        let empty = own2(payload, "emptySeatIds");
        Array.isArray(empty) && (projected.emptySeatIds = Array.from({ length: Math.min(32, empty.length) }, (_, i2) => number3(own2(empty, String(i2)))).filter((value) => value !== void 0)), seatSnapshot = projected;
        return;
      }
      if (SKIP.has(type) || !(validType(type) || type === "toolbox:gap")) return;
      let record2 = { type }, seq = number3(own2(event, "seq")), at = number3(own2(event, "at"));
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
        let value = number3(own2(bridge, key));
        value !== void 0 && (status[key] = value);
      }
      let lastType = own2(bridge, "lastType");
      validType(lastType) && !SKIP.has(lastType) && (status.lastType = lastType);
      let targets = own2(bridge, "targets");
      return Array.isArray(targets) && (status.targets = [0, 1, 2, 3].map((index) => own2(targets, String(index))).filter((value) => value === "ServerProxy" || value === "ActivityManager")), JSON.parse(JSON.stringify({
        format: "sgs-toolbox-card-diagnostics-v1",
        coreVersion,
        generatedAt: number3(now()) ?? null,
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
    let off = typeof (journal == null ? void 0 : journal.subscribe) == "function" ? journal.subscribe(record) : () => {
    };
    function dispose() {
      disposed || (disposed = !0, off());
    }
    return scope == null || scope.add(dispose), {
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
  function createStartupDiagnostics() {
    return null;
  }
  var LOBBY = "poker-lobby", REPLAY = "poker-replay", OLD_LOBBY = "fd260286f73e30df493dec35a29838537279357098f9b7a45c57024020bde08e", PREVIOUS_MERGES = /* @__PURE__ */ new Set([
    "a14110f60ba61179004a19410ac4286c25e48d0280b55782653c67cb503a811c",
    "a09e573a4c933361c773b69e3d0f5db27552f1dd2086c50d2dcd4ffec18e6f8f",
    "94d727101023e975861d6fc68a68d5924524371d3f20cc4526f1c846eb357906",
    "ad853e64c9efe9e9e86c705971e98000292d7f5957de7db739a5ff6a99b29c44",
    "185bc07523788e3c1974e371f01d97384c176822c97c632ba34121768c31496c",
    "e028c1e6cbee2e7574f1caa31ef798577550a810a7ebe4288ee0d55c4d12bb08",
    "4430ca0faad81c9b2259b994497b9e74fa7cc6bf7a76a4209bb0752c5c7b17a5",
    "b545517fe283cdb895a68cce12f1220a1bc8714201d05383e7a87b03f152644c",
    "68897ae6b46faddf38af11b3bd99c2374812b7873944c9965d58e99b8b02dbdc",
    "8764d6c880466a33459f47bf4412e82038853d4e143c0a0d1fa4ffa31f847731",
    "0e95a86b014fff9c3916b947099b63805abf7a1077efb46db438bc76d775d6dc",
    "157b0bb91f03dbdb65ef15b17f65d643dfcdf515f0064c966703e50bc3a334bc",
    "a1d99e167070775cb5cfe06c7dbb2109c03fb3a92f9efede17b54a69b4183ebe",
    "67e02fe936b28aed3f553726ae6a13a09ad8acb25222893100f1c7c092ab8f9f",
    "e43d812058d263c6dafec8364e280d50fb326b7ef4462476ccbcf4ed03be27b7",
    "72fa1379c509e57ce9ba46501ef355bdf17d8f89dc8fb14a3749905e09b984b9",
    "e25de527852d43ad5e0dc21ba44953b434e8516915b648c087c40e1d8df2cacc",
    "02dac33955c548e7e0b2d498ef80ef18b380ebb0578f2a7c5d5113b6101b1182",
    "80b51787cc3dd0c3d2b6143ab4022bf47b30d9861ddce38fd2f0f410d44965f2",
    "0c41a6ca07cf66482f4b01a78040cf3d8d840b1abb3d50d1864a05edf3f3366c",
    "9cbff6f7d62d17046f47bf3f1c4aba78c94f54d0d1e9092aca71188c4264c51f",
    "d83f2e9de69b0213a56df6097783b9003d71acb53896f672a0cf902b4bf217f3",
    "c7ec703b674ed3ea4aaac5356316b544b78e6b1c2be70ec451691b024fc9e030",
    "96b6a0ee9622cd1c27e6bbf0dacdc8895bba2b738b6c44c9c56b1d501173cf8a",
    "67ad0b7e24ef35154be6896d3730f6414ab91e83743de9cd1674a3228949bc61",
    "be07ccf8535c8dfaab62f9e47cc1363d4755d88eb5f5652b7570fc18f2462a16",
    "464c280d6fcbdc07b171dfe26904d950c6988cbe34aacfd811df725f4ea59f33",
    "b1193623cc263ef850807c3e706d3f9559bf01bcb6184c9fef205242a0234317",
    "5965be8c7775c3001289a1041a2586df4eb3b7a17114bedadd625bd29ca71523",
    "4bcb83b84619ec83e688d8126c64bef50fb0ee52338a8e0606005dc70aad987a",
    "7505328a9228d31c14c717f39558c26f0ac6a1cfa1986ccd861a6306113f72a3",
    "f9e6205aedbd763c3f92f4a249a268115fb28238c33f67ab07e432d093b72975",
    "283edcfa9c488ae4b01bc57d402d2df3be9130b506ca6940c957f002e3f9346f",
    "76be196abdec5678a171fd85b7e92f7b3bca0c03a05fa853990842bf8b53e5bd",
    "3b8a9c7febbc7abb599ec17ed34a7444b31b58d5ca840b9907d91e3b42614ff6",
    "6298f877a3fb02a44c3230fff40bee5166b09dbb812a86f58b1922d064b5513e",
    "9bee2a65754e93c3e114d8deb344f32713387fe087b90c3fe15c4dcbcfcad7c0",
    "526058a02914191c16a777d5ee67fd33dea3bc8e959b7010cde34f656b010ca4",
    "5908bc34415592289440fbad07d496f81f044b50c8e88e32d4e101bcacd3af33",
    "c62c82ec01223561f8bde536f9a2fe3a15d99a69aff0ca31227ad8d67bc0fd89",
    "c5fce0ce84779c09966789b741a9bcaa3c54de75fcdb4ab5dfc8543be0ef09c0",
    "99b1b0b5580e60b5ee511e47be4c88638fd287fc0e13ee51b95e1e8d89cb9a20"
  ]), OLD_REPLAYS = /* @__PURE__ */ new Set([
    "fdfc23b82604669259dbb0ef5b1e8eaea97a53b05c9c9ac7337a4e24b81d6a2a",
    "b7cd62d56c686f8331280cafec63f2bc476d444b874628b3a6595ac591b4bc35",
    "dd453c9e1e0e64dfc9f48dda3806d890921c610a42bd5d64873abc2948656287",
    "24fc47965a358d9a054ff9b6789e1b1789a3e62212a73369c9f3bde0b845f841",
    "baace9085c3a6b65ac40638d9f90411916aee8c4af09bfe5052565586a81c3a6",
    "824a876db93954c4ff3d71a11fa71db04a951cb426a4c286ae1992e619ed5637",
    "defa38ce3ccf6097dbd2280ca1119d8c31ce333d668e5dd7e9c684bf0066c60a",
    "ea899505cbddfc3be45123588882077ce263170b8ea2fdb7aa00c6906dccd875",
    "76ad0732ccbc1b665f0cec8fb4dad358e2e1e2c76d28d4d542171694972e0338",
    "16a62c6d03402833b22cb4f76aa2432f165fd718d9ff899d6e75922e6a992269"
  ]);
  async function reconcilePokerPackages(records, builtins, store) {
    var _a2, _b2, _c, _d;
    let merged = (_a2 = builtins.get(LOBBY)) == null ? void 0 : _a2.bundledPackage;
    if (!merged) return;
    let lobby = records.get(LOBBY), legacy = records.get(REPLAY), playback = (legacy == null ? void 0 : legacy.active) || ((_b2 = legacy == null ? void 0 : legacy.previous) != null && _b2.builtin ? null : legacy == null ? void 0 : legacy.previous), lobbyPackage = (lobby == null ? void 0 : lobby.active) || ((_c = lobby == null ? void 0 : lobby.previous) != null && _c.builtin ? null : lobby == null ? void 0 : lobby.previous), previousHash = lobbyPackage == null ? void 0 : lobbyPackage.sha256, previouslyMerged = PREVIOUS_MERGES.has(previousHash), previousLobby = previousHash === OLD_LOBBY || previouslyMerged, migrations = (lobby == null ? void 0 : lobby.appliedBuiltinMigrations) || [], knownReplay = ((_d = playback == null ? void 0 : playback.manifest) == null ? void 0 : _d.id) === REPLAY && OLD_REPLAYS.has(playback.sha256), archived = (legacy == null ? void 0 : legacy.mergedInto) === LOBBY;
    if (playback && !knownReplay) {
      lobbyPackage || builtins.delete(LOBBY);
      return;
    }
    if (knownReplay && await verifyPackage(playback), lobby != null && lobby.uninstalled) return;
    if (previousLobby && migrations.includes(previousHash)) {
      if (previousHash === OLD_LOBBY && knownReplay && archived) {
        let restored = { ...legacy, uninstalled: !1 };
        delete restored.mergedInto, await store.put(restored), records.set(REPLAY, restored);
      }
      return;
    }
    let archive = knownReplay && !legacy.uninstalled ? { ...legacy, uninstalled: !0, mergedInto: LOBBY } : null;
    if ((lobbyPackage == null ? void 0 : lobbyPackage.sha256) === merged.sha256) {
      archive && (await store.put(archive), records.set(REPLAY, archive));
      return;
    }
    if (lobbyPackage && !previousLobby || !lobby && !legacy) return;
    previousLobby && await verifyPackage(lobbyPackage);
    let appliedBuiltinMigrations = [...migrations];
    previousLobby && appliedBuiltinMigrations.push(previousHash);
    let next = {
      id: LOBBY,
      uninstalled: !1,
      active: merged,
      previous: previousLobby ? lobbyPackage : null,
      enabled: (lobby == null ? void 0 : lobby.enabled) !== !1 && (previouslyMerged || (legacy == null ? void 0 : legacy.enabled) !== !1),
      appliedBuiltinMigrations
    };
    await store.putMany(archive ? [next, archive] : [next]), records.set(LOBBY, next), archive && records.set(REPLAY, archive);
  }
  var ASSIST = "play-assist", LEGACY = "peixiu", OLD_ASSIST = /* @__PURE__ */ new Set([
    "b55e22854e2b43a042ad2c85978fa4eff8b069be2215225cb77938e728e7f96e",
    "c9e216221b36a84a00cd14464cff7bf6399376d61c8aac786b0baa61b1e020fd"
  ]), OLD_PEIXIU = /* @__PURE__ */ new Set([
    "ba71733110a58afe068a1dc1bf47a5120f1e84ceafef37b896bb78f060e2ab18",
    "a5e09f8b60e70919eadada26ce94a6bc528d795df5f35b5a53803ba950a672d4"
  ]);
  async function reconcilePeixiuPackage(records, builtins, store, settings) {
    var _a2, _b2, _c, _d;
    let bundled = (_a2 = builtins.get(ASSIST)) == null ? void 0 : _a2.bundledPackage;
    if (!bundled || compareVersions2(bundled.manifest.version, "0.2.31") < 0) return;
    let assist = records.get(ASSIST), standalone = records.get(LEGACY), applied = (assist == null ? void 0 : assist.appliedBuiltinMigrations) || [], active = assist == null ? void 0 : assist.active, upgrade = ((_b2 = active == null ? void 0 : active.manifest) == null ? void 0 : _b2.id) === ASSIST && OLD_ASSIST.has(active.sha256) && !applied.includes(active.sha256) && compareVersions2(bundled.manifest.version, active.manifest.version) > 0;
    if (assist != null && assist.uninstalled || active && !upgrade && active.sha256 !== bundled.sha256) return;
    let legacy = (standalone == null ? void 0 : standalone.active) || ((_c = standalone == null ? void 0 : standalone.previous) != null && _c.builtin ? null : standalone == null ? void 0 : standalone.previous), archive = !(standalone != null && standalone.uninstalled) && ((_d = legacy == null ? void 0 : legacy.manifest) == null ? void 0 : _d.id) === LEGACY && OLD_PEIXIU.has(legacy.sha256), updates = [];
    if (upgrade && (await verifyPackage(active), updates.push({ ...assist, active: bundled, previous: active, appliedBuiltinMigrations: [...applied, active.sha256] })), archive && (await verifyPackage(legacy), standalone.enabled === !1 && settings.get("peixiuAssist") === void 0 && settings.set("peixiuAssist", !1), updates.push({ ...standalone, uninstalled: !0, mergedInto: ASSIST })), !!updates.length) {
      await store.putMany(updates);
      for (let record of updates) records.set(record.id, record);
    }
  }
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
  var officialPluginIds = Object.freeze(["social", "player-info", "card-styles-extra", "backgrounds", "shanhetu", "cards", "play-assist", "daily-rewards", "seckill", "gaizhu", "effects", "skins", "poker-lobby", "themes-flow", "stargazing", "baisheng", "appearances", "ledger", "recharge"]);
  function planOfficialPlugins(installed, catalog) {
    let latest = /* @__PURE__ */ new Map();
    for (let entry of catalog)
      !officialPluginIds.includes(entry.id) || !/^\d+\.\d+\.\d+$/.test(entry.version) || (!latest.has(entry.id) || compareVersions2(entry.version, latest.get(entry.id).version) > 0) && latest.set(entry.id, entry);
    let result = /* @__PURE__ */ new Map(), existing = new Set(installed.map((item) => item.id));
    for (let id of officialPluginIds) {
      if (existing.has(id)) continue;
      let entry = latest.get(id);
      if (!entry) throw new Error("\u5E02\u573A\u7F3A\u5C11\u5B98\u65B9\u63D2\u4EF6\uFF1A" + id);
      for (let item of [...planDependencies(entry, installed, [...latest.values()]), entry]) result.set(item.id, item);
    }
    return [...result.values()];
  }
  function createGameViewport({ window: win, document: doc, scope, canReserve = () => !0, sceneWatch }) {
    let requested = 0, reserved = 0, stage, original, wrapper, descriptor, appliedWidth = 0, appliedHeight = 0, browser, widthDescriptor, widthGetter, styles = /* @__PURE__ */ new Map();
    function releaseBrowser() {
      var _a2;
      browser && ((_a2 = Object.getOwnPropertyDescriptor(browser, "clientWidth")) == null ? void 0 : _a2.get) === widthGetter && (widthDescriptor ? Object.defineProperty(browser, "clientWidth", widthDescriptor) : delete browser.clientWidth), browser = widthDescriptor = widthGetter = void 0;
    }
    function syncBrowser() {
      var _a2;
      let next = reserved ? (_a2 = win.Laya) == null ? void 0 : _a2.Browser : void 0;
      if (browser === next || (releaseBrowser(), !next)) return;
      let own3 = Object.getOwnPropertyDescriptor(next, "clientWidth");
      if (own3 && !own3.configurable) return;
      browser = next, widthDescriptor = own3;
      let readWidth = own3 != null && own3.get ? () => Reflect.apply(own3.get, next, []) : () => win.innerWidth;
      widthGetter = () => Math.max(1, readWidth() - reserved), Object.defineProperty(browser, "clientWidth", { configurable: !0, enumerable: (own3 == null ? void 0 : own3.enumerable) ?? !0, get: widthGetter }), appliedWidth = -1;
    }
    function restoreStyles() {
      for (let [node, previous] of styles)
        node.style.getPropertyValue("width") === previous.applied && (previous.value ? node.style.setProperty("width", previous.value, previous.priority) : node.style.removeProperty("width"));
      styles.clear();
    }
    function resize(target) {
      var _a2, _b2;
      if (typeof (target == null ? void 0 : target.setScreenSize) != "function") return;
      let ratio = Number((_b2 = (_a2 = win.Laya) == null ? void 0 : _a2.Browser) == null ? void 0 : _b2.pixelRatio) || win.devicePixelRatio || 1;
      target.setScreenSize(win.innerWidth * ratio, win.innerHeight * ratio);
    }
    function releaseStage() {
      stage && stage.setScreenSize === wrapper && (descriptor ? Object.defineProperty(stage, "setScreenSize", descriptor) : delete stage.setScreenSize), resize(stage), stage = original = wrapper = void 0;
    }
    function sync() {
      var _a2, _b2, _c, _d;
      reserved = requested && canReserve() ? requested : 0;
      let next = reserved ? (_a2 = win.Laya) == null ? void 0 : _a2.stage : void 0, width = reserved ? Math.max(1, win.innerWidth - reserved) : 0;
      if (syncBrowser(), reserved || restoreStyles(), stage !== next && (releaseStage(), typeof (next == null ? void 0 : next.setScreenSize) == "function")) {
        stage = next, original = stage.setScreenSize, descriptor = Object.getOwnPropertyDescriptor(stage, "setScreenSize");
        let nativeResize = original;
        wrapper = function(screenWidth, screenHeight, ...args) {
          var _a3, _b3;
          let ratio = Number((_b3 = (_a3 = win.Laya) == null ? void 0 : _a3.Browser) == null ? void 0 : _b3.pixelRatio) || win.devicePixelRatio || 1, limit2 = Math.max(1, win.innerWidth - reserved) * ratio;
          return Reflect.apply(nativeResize, this, [Math.min(screenWidth, limit2), screenHeight, ...args]);
        }, stage.setScreenSize = wrapper, appliedWidth = -1;
      }
      if (!reserved) {
        restoreStyles(), appliedWidth = 0;
        return;
      }
      for (let node of doc.querySelectorAll("#bgDiv,#layaContainer,#laya_container,#GameDiv")) {
        styles.has(node) || styles.set(node, { value: node.style.getPropertyValue("width"), priority: node.style.getPropertyPriority("width") });
        let value = width + "px";
        (node.style.getPropertyValue("width") !== value || node.style.getPropertyPriority("width") !== "important") && node.style.setProperty("width", value, "important"), styles.get(node).applied = value;
      }
      (width !== appliedWidth || win.innerHeight !== appliedHeight) && (resize(stage), typeof ((_b2 = win.SystemContext) == null ? void 0 : _b2.UpdateGameSize) == "function" && win.SystemContext.UpdateGameSize(width, ((_d = (_c = win.Laya) == null ? void 0 : _c.Browser) == null ? void 0 : _d.clientHeight) || win.innerHeight), appliedWidth = width, appliedHeight = win.innerHeight);
    }
    return scope.listen(win, "resize", sync), sceneWatch ? scope.add(sceneWatch.watch(sync, 500, !0)) : scope.interval(sync, 500), scope.add(() => {
      reserved = 0, restoreStyles(), releaseBrowser(), releaseStage();
    }), { reserve(width) {
      requested = Math.max(0, Number(width) || 0), sync();
    } };
  }
  function installEdgeSwipe({ win, host, scope, mobile, reveal, hide }) {
    let gesture, suppressClickUntil = 0;
    scope.listen(host, "click", (event) => {
      Date.now() >= suppressClickUntil || (event.preventDefault(), event.stopImmediatePropagation());
    }, !0), scope.listen(host, "pointerdown", (event) => {
      suppressClickUntil = 0, !(!mobile() || !host.hasAttribute("data-edge-docked") || event.pointerType !== "touch" || !event.isPrimary) && (gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, hidden: host.hasAttribute("data-edge-hidden") });
    }), scope.listen(win, "pointermove", (event) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      let dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (Math.abs(dy) > 18 && Math.abs(dy) > Math.abs(dx)) {
        gesture = null;
        return;
      }
      Math.abs(dx) < 28 || Math.abs(dx) < Math.abs(dy) * 1.4 || (gesture.hidden && dx < 0 ? (reveal(), suppressClickUntil = Date.now() + 600) : !gesture.hidden && dx > 0 && (hide(), suppressClickUntil = Date.now() + 600), gesture = null);
    });
    let cancel = () => {
      gesture = null;
    };
    scope.listen(win, "pointerup", (event) => {
      (gesture == null ? void 0 : gesture.id) === event.pointerId && gesture.hidden && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) <= 12 && reveal(), cancel();
    }), scope.listen(win, "pointercancel", cancel), scope.listen(win, "blur", cancel);
  }
  function mountCardFaceCatalog(container, doc, cardStyles) {
    let option = (text3, value) => {
      let node = doc.createElement("option");
      return node.textContent = text3, node.value = value, node;
    }, details = doc.createElement("details");
    details.className = "card-face-catalog sgs-fold";
    let title = doc.createElement("summary");
    title.textContent = "\u5361\u724C\u56FE\u9274";
    let suites = doc.createElement("select");
    suites.className = "sgs-select", suites.setAttribute("aria-label", "\u9884\u89C8\u5361\u9762\u5957\u88C5");
    let search = doc.createElement("input");
    search.type = "search", search.className = "sgs-input", search.placeholder = "\u641C\u7D22\u724C\u540D", search.setAttribute("aria-label", "\u641C\u7D22\u56FE\u9274\u724C\u540D");
    let choices = doc.createElement("select");
    choices.className = "sgs-select", choices.setAttribute("aria-label", "\u9884\u89C8\u5361\u724C");
    let preview = doc.createElement("div");
    preview.className = "card-face-catalog-preview";
    let status = doc.createElement("p");
    status.className = "muted", status.setAttribute("role", "status");
    let retry = doc.createElement("button");
    retry.type = "button", retry.title = "\u91CD\u65B0\u52A0\u8F7D\u5361\u9762", retry.setAttribute("aria-label", retry.title), retry.append(createIcon(doc, "refresh"), doc.createTextNode(retry.title)), retry.hidden = !0, details.append(title, suites, search, choices, preview, status, retry), container.append(details);
    let available = [], styleId = "", res = "", renderedEntry, renderedRes, renderedLabel, results = [], lastData, lastStyle, lastCatalog, lastQuery;
    function showCard(style2, data, label) {
      if (renderedEntry === data && renderedRes === res && renderedLabel === label || (renderedEntry = data, renderedRes = res, renderedLabel = label, preview.replaceChildren(), !style2 || !data || !res)) return;
      let canvas = cardStyles.atlasCanvas(style2, res);
      canvas && (canvas.setAttribute("role", "img"), canvas.setAttribute("aria-label", label + " \xB7 " + style2.name), preview.append(canvas));
    }
    function render({ retry: shouldRetry = !1 } = {}) {
      var _a2, _b2;
      if (!details.open) return;
      let styles = cardStyles.list().filter((style3) => style3.atlas);
      (styles.length !== available.length || styles.some((style3, index) => style3 !== available[index])) && (available = styles, styles.some((style3) => style3.id === styleId) || (styleId = ((_a2 = styles.find((style3) => style3.id === cardStyles.selection.face)) == null ? void 0 : _a2.id) || ((_b2 = styles[0]) == null ? void 0 : _b2.id) || ""), suites.replaceChildren(...styles.map((style3) => option(style3.name, style3.id))), suites.value = styleId);
      let style2 = styles.find((item) => item.id === styleId), entry = cardStyles.previewCardAtlas(styleId, { retry: shouldRetry }), query = search.value.trim().toLowerCase(), catalog = cardStyles.localFaceCatalog;
      if (lastData !== (entry == null ? void 0 : entry.data) || lastStyle !== style2 || lastCatalog !== catalog || lastQuery !== query) {
        lastData = entry == null ? void 0 : entry.data, lastStyle = style2, lastCatalog = catalog, lastQuery = query;
        let names = new Map((catalog || []).map((card) => [card.res, card.label])), allowed2 = style2 != null && style2.atlas.replaceCards ? new Set(style2.atlas.replaceCards) : null;
        results = [];
        for (let [key, frame] of (lastData == null ? void 0 : lastData.frames) || []) {
          let name = key.slice(0, -8);
          if (allowed2 && !allowed2.has(name)) continue;
          let nativeLabel = names.get(name), label = frame.label || nativeLabel || name;
          [label, nativeLabel, name].some((value) => value == null ? void 0 : value.toLowerCase().includes(query)) && results.push({ name, label });
        }
        let duplicates = /* @__PURE__ */ new Map();
        for (let { label } of results) duplicates.set(label, (duplicates.get(label) || 0) + 1);
        choices.replaceChildren(...results.map(({ name, label }) => option(duplicates.get(label) > 1 ? `${label}\uFF08${name}\uFF09` : label, name)));
      }
      let next = results.find((card) => card.name === res) || results[0];
      res = (next == null ? void 0 : next.name) || "", choices.value = res, choices.title = (next == null ? void 0 : next.label) || "", suites.hidden = !style2, search.hidden = choices.hidden = !(entry != null && entry.data), choices.disabled = !next, preview.hidden = !next, showCard(style2, entry == null ? void 0 : entry.data, next == null ? void 0 : next.label), retry.hidden = !(entry != null && entry.error), status.classList.toggle("card-face-catalog-error", !!(entry != null && entry.error)), status.textContent = entry != null && entry.error ? "\u5361\u9762\u9884\u89C8\u52A0\u8F7D\u5931\u8D25\uFF1A" + entry.error : entry != null && entry.loading ? "\u6B63\u5728\u52A0\u8F7D\u5361\u9762\u9884\u89C8\u2026" : style2 ? next ? "" : "\u6CA1\u6709\u5339\u914D\u7684\u5361\u724C\u3002" : "\u5B89\u88C5\u5361\u9762\u5957\u88C5\u540E\u53EF\u9010\u5F20\u67E5\u770B\u3002", status.hidden = !status.textContent;
    }
    function close() {
      details.open = !1, cardStyles.previewCardAtlas(""), showCard(null, null, ""), lastData = null;
    }
    details.ontoggle = () => {
      details.open ? (cardStyles.loadLocalFaceCatalog(), render()) : close();
    }, suites.onchange = () => {
      styleId = suites.value, render();
    }, search.oninput = () => render(), choices.onchange = () => {
      res = choices.value, render();
    }, retry.onclick = () => render({ retry: !0 });
    let off = cardStyles.subscribe(() => render());
    return { close, dispose() {
      off(), close(), details.remove();
    } };
  }
  var LOCAL_BACK_HELP = "\u652F\u6301 JPG\u3001PNG\u3001WebP\u3001BMP \u9759\u6001\u56FE\u7247\uFF0C\u6700\u5927 20 MB\u3002\u5EFA\u8BAE\u9009\u4E3B\u4F53\u5C45\u4E2D\u7684\u7AD6\u56FE\uFF0C\u7CFB\u7EDF\u4F1A\u81EA\u52A8\u5C45\u4E2D\u88C1\u526A\uFF0C\u56FE\u7247\u4EC5\u4FDD\u5B58\u5728\u672C\u673A\u3002";
  function mountLocalFaces(section, doc, cardStyles) {
    section.className = "custom-card-faces";
    let modes = doc.createElement("div");
    modes.className = "sgs-segments", modes.setAttribute("role", "group"), modes.setAttribute("aria-label", "\u81EA\u5B9A\u4E49\u5361\u9762\u6A21\u5F0F");
    let loadCatalog = () => {
      cardStyles.selection.face === LOCAL_FACE_STYLE.id && cardStyles.loadLocalFaceCatalog();
    };
    for (let [id, label] of [[LOCAL_FACE_BACKGROUND_STYLE.id, "\u7EDF\u4E00\u5E95\u56FE"], [LOCAL_FACE_STYLE.id, "\u9010\u724C\u6362\u56FE"]]) {
      let button = doc.createElement("button");
      button.type = "button", button.textContent = label, button.dataset.faceMode = id, button.onclick = () => {
        message = "", cardStyles.selectSide("face", id), loadCatalog();
      }, modes.append(button);
    }
    let guidance = doc.createElement("p");
    guidance.className = "muted";
    let search = doc.createElement("input");
    search.type = "search", search.className = "sgs-input", search.placeholder = "\u641C\u7D22\u724C\u540D", search.setAttribute("aria-label", "\u641C\u7D22\u724C\u540D");
    let choices = doc.createElement("select");
    choices.className = "sgs-select", choices.setAttribute("aria-label", "\u9009\u62E9\u724C\u540D");
    let upload = doc.createElement("button");
    upload.type = "button";
    let picker = doc.createElement("input");
    picker.type = "file", picker.accept = LOCAL_IMAGE_ACCEPT, picker.hidden = !0;
    let preview = doc.createElement("div");
    preview.className = "custom-card-face-preview", preview.hidden = !0;
    let image = doc.createElement("img");
    image.alt = "";
    let filename = doc.createElement("span");
    filename.className = "custom-card-face-name";
    let remove = doc.createElement("button");
    remove.type = "button", remove.title = "\u5220\u9664\u8FD9\u5F20\u5361\u56FE", remove.setAttribute("aria-label", remove.title), remove.append(createIcon(doc, "trash")), preview.append(image, filename, remove);
    let feedback = doc.createElement("p");
    feedback.className = "muted", feedback.setAttribute("role", "status"), feedback.hidden = !0;
    let retry = doc.createElement("button");
    retry.type = "button", retry.textContent = "\u91CD\u8BD5\u8BFB\u53D6\u724C\u8868", retry.hidden = !0, retry.onclick = () => {
      message = "", failed = !1, loadCatalog();
    };
    let fields2 = doc.createElement("div");
    fields2.className = "custom-card-face-fields", fields2.append(search, choices, upload), section.append(modes, guidance, fields2, picker, preview, feedback, retry);
    let active = !0, busy = !1, message = "", failed = !1, saved = [], catalog, card = "", background = !1;
    function updateChoices() {
      let records = new Map((catalog || []).map((option) => [option.res, option.label]));
      for (let row of saved) records.has(row.card) || records.set(row.card, row.label);
      let counts = /* @__PURE__ */ new Map();
      for (let label of records.values()) counts.set(label, (counts.get(label) || 0) + 1);
      let query = search.value.trim().toLowerCase(), matches = [...records].filter(([res, label]) => label.toLowerCase().includes(query) || res.toLowerCase().includes(query));
      choices.replaceChildren();
      let placeholder = doc.createElement("option");
      placeholder.value = "", placeholder.textContent = matches.length ? "\u9009\u62E9\u724C\u540D" : "\u6CA1\u6709\u5339\u914D\u7684\u724C", choices.append(placeholder);
      let savedGroup = doc.createElement("optgroup");
      savedGroup.label = "\u5DF2\u6362\u56FE";
      let otherGroup = doc.createElement("optgroup");
      otherGroup.label = "\u53EF\u6362\u56FE";
      let savedNames = new Set(saved.map((row) => row.card));
      for (let [res, label] of matches) {
        let option = doc.createElement("option");
        option.value = res, option.textContent = counts.get(label) > 1 ? `${label}\uFF08${res}\uFF09` : label, (savedNames.has(res) ? savedGroup : otherGroup).append(option);
      }
      for (let group of [savedGroup, otherGroup]) group.childElementCount && choices.append(group);
      choices.value = matches.some(([res]) => res === card) ? card : "", card = choices.value;
    }
    function render() {
      let face = cardStyles.selection.face;
      if (background = face === LOCAL_FACE_BACKGROUND_STYLE.id, section.hidden = !background && face !== LOCAL_FACE_STYLE.id, section.hidden) return;
      for (let button of modes.children)
        button.disabled = busy, button.setAttribute("aria-pressed", String(button.dataset.faceMode === face));
      if (!background) {
        let rows = cardStyles.listLocalFaces();
        (catalog !== cardStyles.localFaceCatalog || saved.length !== rows.length || rows.some((row2, i2) => row2 !== saved[i2])) && (saved = rows, catalog = cardStyles.localFaceCatalog, updateChoices());
      }
      search.hidden = choices.hidden = background, fields2.classList.toggle("is-background", background), guidance.textContent = background ? "\u4E00\u5F20\u56FE\u6362\u6240\u6709\u9002\u7528\u5361\u9762\u7684\u5E95\u7EB9\u3002\u724C\u56FE\u3001\u724C\u540D\u3001\u82B1\u8272\u548C\u70B9\u6570\u7167\u5E38\u663E\u793A\u3002" : "\u9009\u5E26\u724C\u540D\u7684\u5B8C\u6574\u5361\u56FE\u3002\u56FE\u7247\u4F1A\u5C45\u4E2D\u88C1\u526A\uFF0C\u4EC5\u4FDD\u5B58\u5728\u672C\u673A\u3002";
      let row = background ? cardStyles.localFaceBackground : saved.find((item) => item.card === card), noCards = !background && !(catalog != null && catalog.length) && !saved.length;
      noCards && (choices.options[0].textContent = cardStyles.localFaceCatalogPending ? "\u6B63\u5728\u8BFB\u53D6\u724C\u8868\u2026" : "\u672A\u8BFB\u53D6\u5230\u724C\u8868"), search.disabled = choices.disabled = busy || noCards, upload.disabled = busy || !background && !card, upload.textContent = row ? "\u66F4\u6362\u56FE\u7247" : "\u9009\u62E9\u56FE\u7247", remove.disabled = busy, remove.title = background ? "\u5220\u9664\u5E95\u56FE" : "\u5220\u9664\u8FD9\u5F20\u5361\u56FE", remove.setAttribute("aria-label", remove.title), preview.hidden = !row, row ? (image.getAttribute("src") !== row.url && (image.src = row.url), filename.textContent = filename.title = row.name) : image.removeAttribute("src");
      let catalogError = !background && cardStyles.localFaceCatalogError;
      retry.hidden = !catalogError, retry.disabled = busy;
      let error = catalogError || cardStyles.localFaceError;
      feedback.textContent = message || error || "", feedback.hidden = !feedback.textContent, feedback.classList.toggle("custom-card-face-error", failed || !!(!message && error));
    }
    async function edit(pending, done, failure, operation) {
      if (!(busy || !background && !card)) {
        busy = !0, message = pending, failed = !1, render();
        try {
          await operation(), message = done;
        } catch (error) {
          message = `${failure}\uFF1A${error.message}`, failed = !0;
        } finally {
          busy = !1, active && (render(), !section.hidden && !section.getRootNode().activeElement && upload.focus());
        }
      }
    }
    search.oninput = () => {
      message = "", updateChoices(), render();
    }, choices.onchange = () => {
      card = choices.value, message = "", render();
    }, upload.onclick = () => picker.click(), picker.onchange = () => {
      var _a2;
      let file = (_a2 = picker.files) == null ? void 0 : _a2[0];
      picker.value = "", file && edit("\u6B63\u5728\u5904\u7406\u56FE\u7247\u2026", background ? "\u5DF2\u4FDD\u5B58\u5E95\u56FE" : "\u5DF2\u4FDD\u5B58\u5361\u56FE", "\u5BFC\u5165\u5931\u8D25", background ? () => cardStyles.importLocalFaceBackground(file) : () => cardStyles.importLocalFace(card, file));
    }, remove.onclick = () => {
      edit("\u6B63\u5728\u5220\u9664\u2026", background ? "\u5DF2\u6062\u590D\u6E38\u620F\u5E95\u56FE" : "\u5DF2\u6062\u590D\u8FD9\u5F20\u724C\u7684\u6E38\u620F\u5361\u9762", "\u5220\u9664\u5931\u8D25", background ? () => cardStyles.deleteLocalFaceBackground() : () => cardStyles.deleteLocalFace(card));
    }, render();
    let off = cardStyles.subscribe(render);
    return { loadCatalog, dispose() {
      active = !1, off();
    } };
  }
  function mountLocalBacks(container, doc, cardStyles) {
    let section = doc.createElement("section");
    section.className = "custom-card-backs";
    let heading = doc.createElement("div");
    heading.className = "custom-card-backs-heading";
    let title = doc.createElement("h4");
    title.textContent = "\u81EA\u5B9A\u4E49\u5361\u80CC";
    let upload = doc.createElement("button");
    upload.type = "button", upload.textContent = "\u9009\u62E9\u56FE\u7247";
    let help = doc.createElement("p");
    help.className = "muted", help.textContent = LOCAL_BACK_HELP, help.id = "core-custom-card-back-help", upload.setAttribute("aria-describedby", help.id);
    let picker = doc.createElement("input");
    picker.type = "file", picker.accept = LOCAL_IMAGE_ACCEPT, picker.hidden = !0;
    let list2 = doc.createElement("fieldset");
    list2.className = "custom-card-back-list", list2.setAttribute("aria-label", "\u5DF2\u4FDD\u5B58\u7684\u5361\u80CC");
    let feedback = doc.createElement("p");
    feedback.className = "muted", feedback.setAttribute("role", "status"), feedback.hidden = !0, heading.append(title, upload), section.append(heading, help, picker, list2, feedback), container.append(section);
    let active = !0, busy = !1, error = "", rows = [], selected, showFeedback = (message, failed = !1) => {
      feedback.textContent = message, feedback.hidden = !message, feedback.classList.toggle("custom-card-back-error", failed);
    }, render = () => {
      !busy && (error || cardStyles.localBackError) && showFeedback(error || cardStyles.localBackError, !0), upload.disabled = busy;
      let saved = cardStyles.listLocalBacks(), current = cardStyles.selection.back;
      if (!(current === selected && saved.length === rows.length && saved.every((item, index) => item === rows[index]))) {
        rows = saved, selected = current, list2.replaceChildren();
        for (let style2 of rows) {
          let row = doc.createElement("div");
          row.className = "custom-card-back-row";
          let select = doc.createElement("button");
          select.type = "button", select.className = "custom-card-back-option";
          let isSelected = current === style2.id;
          select.setAttribute("aria-pressed", String(isSelected)), select.title = style2.name;
          let preview = cardStyles.preview(style2, !0);
          preview.setAttribute("aria-hidden", "true");
          let label = doc.createElement("span");
          if (label.className = "custom-card-back-name", label.textContent = style2.name, select.append(preview, label), isSelected) {
            let check = createIcon(doc, "check");
            check.classList.add("custom-card-back-selected"), select.append(check);
          }
          select.onclick = () => {
            var _a2, _b2;
            if (!busy) {
              error = "", showFeedback("");
              try {
                cardStyles.selectSide("back", style2.id);
              } catch (cause) {
                error = "\u9009\u7528\u5931\u8D25\uFF1A" + cause.message, showFeedback(error, !0);
              }
              (_b2 = (_a2 = list2.children[rows.indexOf(style2)]) == null ? void 0 : _a2.firstElementChild) == null || _b2.focus();
            }
          };
          let remove = doc.createElement("button");
          remove.type = "button", remove.className = "custom-card-back-remove", remove.title = "\u5220\u9664 " + style2.name, remove.setAttribute("aria-label", remove.title), remove.append(createIcon(doc, "trash")), remove.onclick = () => run("\u6B63\u5728\u5220\u9664\u2026", "\u5DF2\u5220\u9664\u5361\u80CC", "\u5220\u9664\u5931\u8D25", () => cardStyles.deleteLocalBack(style2.id)), row.append(select, remove), list2.append(row);
        }
      }
    };
    async function run(pending, done, failure, operation) {
      if (!busy) {
        busy = !0, error = "", showFeedback(pending), upload.disabled = !0, list2.disabled = !0;
        try {
          await operation(), active && showFeedback(done);
        } catch (cause) {
          error = failure + "\uFF1A" + cause.message, active && showFeedback(error, !0);
        } finally {
          busy = !1, active && (list2.disabled = !1, render(), (!section.getRootNode().activeElement || section.getRootNode().activeElement === doc.body) && upload.focus());
        }
      }
    }
    upload.onclick = () => picker.click(), picker.onchange = () => {
      var _a2;
      let file = (_a2 = picker.files) == null ? void 0 : _a2[0];
      picker.value = "", file && run("\u6B63\u5728\u5904\u7406\u56FE\u7247\u2026", "\u5DF2\u4FDD\u5B58\u5E76\u9009\u7528\u5361\u80CC", "\u5BFC\u5165\u5931\u8D25", () => cardStyles.importLocalBack(file));
    }, render();
    let off = cardStyles.subscribe(render);
    return () => {
      active = !1, off();
    };
  }
  function mountCardStyleWorkshop(container, { document: doc, cardStyles, settings, bindFold }) {
    let details = doc.createElement("section");
    details.className = "card-style-workshop plugin-group appearance-section";
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
    heading.append(toggle), details.append(heading, body), container.append(details);
    let options = doc.createElement("div");
    body.append(options);
    let faceOptions = doc.createElement("div");
    body.append(faceOptions);
    let catalog = cardStyles != null && cardStyles.previewCardAtlas ? mountCardFaceCatalog(body, doc, cardStyles) : null, faceEditor = doc.createElement("section");
    body.append(faceEditor);
    let localFaces = cardStyles != null && cardStyles.listLocalFaces ? mountLocalFaces(faceEditor, doc, cardStyles) : null;
    localFaces || (faceEditor.hidden = !0);
    let onChange = (expanded) => expanded ? localFaces == null ? void 0 : localFaces.loadCatalog() : catalog == null ? void 0 : catalog.close(), defaultExpanded = settings.get("cardStyleExpanded", !1);
    bindFold ? bindFold(":card-style-workshop", toggle, body, "\u5361\u724C\u5916\u89C2", !defaultExpanded, { onChange }) : (apply(defaultExpanded), toggle.onclick = () => {
      let expanded = body.hidden;
      settings.set("cardStyleExpanded", expanded), apply(expanded), onChange(expanded);
    }), body.hidden || localFaces == null || localFaces.loadCatalog();
    let backOptions = doc.createElement("div");
    body.append(backOptions);
    let unmountLocal = cardStyles != null && cardStyles.listLocalBacks ? mountLocalBacks(body, doc, cardStyles) : null, status = doc.createElement("p");
    status.className = "muted", status.style.overflowWrap = "anywhere", status.setAttribute("role", "status"), body.append(status);
    let render = () => {
      var _a2, _b2, _c, _d;
      options.replaceChildren();
      let scopeLabel = doc.createElement("p");
      scopeLabel.textContent = "\u5E94\u7528\u8303\u56F4", scopeLabel.style.cssText = "display:flex;align-items:center;gap:5px", scopeLabel.append(helpTip(doc, "\u5361\u9762\u4E0E\u5361\u80CC\u72EC\u7ACB\u9009\u62E9\u3002\u5B8C\u6574\u5361\u9762\u6309\u724C\u540D\u5339\u914D\uFF0C\u7F3A\u5931\u5361\u56FE\u4FDD\u7559\u6E38\u620F\u539F\u751F\u663E\u793A\uFF1B\u82B1\u8272\u70B9\u6570\u6CBF\u7528\u6E38\u620F\u3002")), options.append(scopeLabel);
      let scopes = doc.createElement("div");
      scopes.className = "sgs-segments", options.append(scopes);
      for (let [value, name] of [["self", "\u4EC5\u81EA\u5DF1\u7684\u624B\u724C"], ["all", "\u6240\u6709\u4EBA"]]) {
        let button = doc.createElement("button");
        button.type = "button", button.textContent = name, button.setAttribute("aria-pressed", String(((_a2 = cardStyles == null ? void 0 : cardStyles.selection) == null ? void 0 : _a2.scope) === value || !(cardStyles != null && cardStyles.selection) && value === "all")), button.onclick = () => cardStyles == null ? void 0 : cardStyles.selectScope(value), scopes.append(button);
      }
      let help = doc.createElement("p");
      help.className = "muted", help.textContent = "\u4EC5\u81EA\u5DF1\uFF1A\u81EA\u5DF1\u7684\u624B\u724C\u53CA\u5176\u4F7F\u7528\u3001\u6253\u51FA\u3001\u88AB\u987A\u8D70\u65F6\u6CBF\u7528\u6240\u9009\u5916\u89C2\uFF1B\u4ED6\u4EBA\u7684\u724C\u4FDD\u6301\u6E38\u620F\u5916\u89C2\u3002", options.append(help);
      for (let side of ["face", "back"]) {
        let options2 = side === "face" ? faceOptions : backOptions, active = options2.getRootNode().activeElement, focused = options2.contains(active) ? active.dataset.cardStyle : void 0;
        options2.replaceChildren();
        let label = doc.createElement("p");
        label.textContent = side === "face" ? "\u5361\u9762" : "\u5361\u80CC", options2.append(label);
        let choices = doc.createElement("div");
        choices.className = "card-style-choices", options2.append(choices);
        let selectedId = ((_b2 = cardStyles == null ? void 0 : cardStyles.selection) == null ? void 0 : _b2[side]) ?? (cardStyles == null ? void 0 : cardStyles.current), selectedStyle = ((_c = cardStyles == null ? void 0 : cardStyles.styleFor) == null ? void 0 : _c.call(cardStyles, side)) || (cardStyles == null ? void 0 : cardStyles.list().find((item) => item.id === selectedId)), option = (id, name, style2) => {
          let customActive = (style2 == null ? void 0 : style2.localFace) && (selectedStyle == null ? void 0 : selectedStyle.localFaceBackground), pressed = customActive || ((selectedStyle == null ? void 0 : selectedStyle.id) || "") === id, target = style2 != null && style2.localFace && !pressed ? LOCAL_FACE_BACKGROUND_STYLE.id : customActive ? selectedId : id, b = doc.createElement("button");
          if (b.type = "button", b.dataset.cardStyle = id, b.dataset.cardSide = side, b.setAttribute("aria-pressed", String(pressed)), style2 && !style2.localFace) {
            let previews = doc.createElement("span");
            previews.className = "card-style-preview";
            for (let back of [side === "back"]) {
              let canvas = cardStyles != null && cardStyles.preview ? cardStyles.preview(style2, back) : style2.native ? null : drawCardStyle(doc, back ? style2.back : style2.face, back);
              if (canvas)
                canvas.setAttribute("aria-hidden", "true"), previews.append(canvas);
              else {
                let placeholder = doc.createElement("span");
                placeholder.className = "muted", placeholder.textContent = style2.atlas ? "\u9009\u7528\u540E\u52A0\u8F7D\u9884\u89C8" : back ? "\u539F\u751F\u5361\u80CC" : "\u539F\u751F\u5361\u9762", previews.append(placeholder);
              }
            }
            b.append(previews);
          }
          let text3 = doc.createElement("span");
          text3.textContent = side === "back" && (style2 == null ? void 0 : style2.backName) || name, b.append(text3), b.onclick = () => cardStyles == null ? void 0 : cardStyles.selectSide(side, target), choices.append(b), focused === id && b.focus({ preventScroll: !0 });
        };
        option("", "\u8DDF\u968F\u6E38\u620F"), side === "face" && localFaces && option(LOCAL_FACE_STYLE.id, LOCAL_FACE_STYLE.name, LOCAL_FACE_STYLE);
        for (let style2 of (cardStyles == null ? void 0 : cardStyles.list()) || []) (side !== "back" || !style2.atlas || style2.atlas.backImage) && option(style2.id, style2.name, style2);
        if (side === "face") {
          let selected = cardStyles == null ? void 0 : cardStyles.list().find((style2) => {
            var _a3;
            return style2.id === ((_a3 = cardStyles.selection) == null ? void 0 : _a3.face);
          });
          if (selected != null && selected.atlas) {
            let source = doc.createElement("p");
            source.className = "muted", source.textContent = selected.atlas.source, options2.append(source);
            let link = doc.createElement("a");
            link.href = selected.atlas.index.url, link.target = "_blank", link.rel = "noopener noreferrer", link.textContent = "\u67E5\u770B\u56FE\u96C6\u6765\u6E90", options2.append(link);
            let note = doc.createElement("p");
            if (note.className = "muted", note.textContent = "\u9996\u6B21\u9009\u62E9\u8054\u7F51\u52A0\u8F7D\u6574\u5957\u8D44\u6E90\u3002\u56FD\u6218\u3001\u9650\u65F6\u53CA\u6D3B\u52A8\u724C\u4EC5\u7CBE\u786E\u5339\u914D\u540C\u540D\u5361\u56FE\uFF1B\u7F3A\u5931\u3001\u7279\u6B8A\u6E32\u67D3\u6216\u4E0B\u8F7D\u5931\u8D25\u5747\u56DE\u9000\u6E38\u620F\u5916\u89C2\u3002", options2.append(note), (_d = cardStyles.status) != null && _d.startsWith("\u5B8C\u6574\u5361\u9762\u52A0\u8F7D\u5931\u8D25")) {
              let retry = doc.createElement("button");
              retry.type = "button", retry.textContent = "\u91CD\u65B0\u52A0\u8F7D\u5361\u9762", retry.onclick = () => cardStyles.retry(), options2.append(retry);
            }
          }
        }
      }
      status.textContent = (cardStyles == null ? void 0 : cardStyles.status) || "\u5361\u724C\u63A5\u53E3\u7B49\u5F85\u542F\u52A8", status.style.color = /失败|未应用/.test(status.textContent) ? "var(--sgs-danger)" : "";
    };
    render();
    let off = cardStyles == null ? void 0 : cardStyles.subscribe(render);
    return () => {
      off == null || off(), catalog == null || catalog.dispose(), localFaces == null || localFaces.dispose(), unmountLocal == null || unmountLocal(), details.remove();
    };
  }
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
.sgs-themes .theme-preview{display:flex;align-items:center;justify-content:center;height:56px;padding:10px 7px;background-color:var(--preview-bg);background-image:var(--preview-backdrop,linear-gradient(145deg,var(--preview-surface),var(--preview-bg)));border-bottom:1px solid color-mix(in srgb,var(--preview-border) 50%,transparent);color:var(--preview-text)}
.sgs-themes .theme-mini{position:relative;display:flex;align-items:center;justify-content:center;gap:7px;width:100%;max-width:126px;height:30px;padding:0 7px;border:1px solid color-mix(in srgb,var(--preview-border) 65%,transparent);border-radius:7px;background-color:var(--preview-bg);background-image:var(--preview-compact,linear-gradient(155deg,var(--preview-raised),var(--preview-bg)));box-shadow:0 2px 5px #0004,inset 0 1px color-mix(in srgb,var(--preview-accent2,var(--preview-accent)) 22%,transparent)}
.sgs-themes .theme-mini-seal{font:17px/1 'KaiTi','STKaiti',serif;color:var(--preview-accent)}
.sgs-themes .theme-mini-number{font:600 18px/1 Georgia,serif;color:var(--preview-text)}
.sgs-themes .theme-mini-separator{width:1px;height:13px;background:var(--preview-border);margin-left:auto}
.sgs-themes .theme-mini .sgs-line-icon{width:13px;height:13px;color:var(--preview-muted)}
.sgs-themes .theme-meta{display:block;padding:8px 8px 9px;min-width:0}
.sgs-themes .theme-title-row{display:flex;align-items:center;justify-content:space-between;gap:3px;min-width:0}
.sgs-themes .theme-name{font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sgs-themes .theme-card-state{font-size:10px;color:var(--sgs-muted);white-space:nowrap;flex:none}
.sgs-themes [aria-pressed=true] .theme-card-state{color:var(--sgs-accent)}
.sgs-themes .theme-description{display:block;margin-top:3px;font-size:10px;color:var(--sgs-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sgs-themes .theme-status{display:flex;align-items:center;gap:5px;margin:11px 0 0;font-size:11px;color:var(--sgs-accent);overflow-wrap:anywhere}
.sgs-themes .theme-status-row{display:flex;align-items:center;gap:5px;margin-top:11px}.sgs-themes .theme-status-row .theme-status{margin:0;min-width:0}
.sgs-themes .theme-footnote{margin:5px 0 0;font-size:10px;line-height:1.7;color:var(--sgs-muted)}
@media(prefers-reduced-motion:reduce){.sgs-themes button.theme-card{transition:none}}
`;
  function mountThemeWorkshop(container, { document: doc, themes, notify }) {
    let scope = new ResourceScope(), root = doc.createElement("section");
    root.className = "sgs-themes", root.dataset.themeWorkshop = "";
    let el = (tag, cls, text3) => {
      let node = doc.createElement(tag);
      return cls && (node.className = cls), text3 !== void 0 && (node.textContent = text3), node;
    }, style2 = el("style");
    style2.textContent = STYLES;
    let heading = el("div", "theme-heading"), count = el("span", "theme-count"), title = el("div", "theme-heading");
    title.style.marginBottom = "0", title.append(el("h4", "", "\u9009\u62E9\u914D\u8272")), heading.append(title, count);
    let intro = helpTip(doc, "\u9009\u62E9\u4E00\u5957\u914D\u8272\uFF0C\u5373\u523B\u6362\u88C5\u3002"), grid = el("div", "theme-grid");
    grid.setAttribute("role", "group"), grid.setAttribute("aria-label", "\u5DE5\u5177\u7BB1\u4E3B\u9898");
    let status = el("p", "theme-status");
    status.dataset.themeStatus = "", status.setAttribute("role", "status"), status.setAttribute("aria-live", "polite");
    let footnote = helpTip(doc, "\u914D\u8272\u81EA\u52A8\u4FDD\u5B58\u3002\u4E3B\u9898\u5305\u505C\u7528\u540E\u6682\u56DE\u7384\u91D1\uFF0C\u91CD\u65B0\u542F\u7528\u540E\u6062\u590D\u9009\u62E9\u3002");
    title.append(intro);
    let statusRow = el("div", "theme-status-row");
    statusRow.append(status, footnote), root.append(style2, heading, grid, statusRow), container.append(root);
    let signature, cards = /* @__PURE__ */ new Map(), cardScope, update = () => {
      var _a2, _b2, _c;
      if (scope.closed) return;
      let palette = (themes == null ? void 0 : themes.list()) || [BLACK_GOLD], current = themes == null ? void 0 : themes.current, next = JSON.stringify(palette);
      if (signature !== next) {
        signature = next, cardScope == null || cardScope.dispose(), cardScope = new ResourceScope(), cards = /* @__PURE__ */ new Map(), grid.replaceChildren(), count.textContent = `${palette.length} \u5957\u914D\u8272`;
        for (let theme of palette) {
          let description = theme.description || (theme.id === BLACK_GOLD.id ? "\u6C89\u9759\u7384\u8272\uFF0C\u7ECF\u5178\u938F\u91D1" : "\u6269\u5C55\u4E3B\u9898"), button = el("button", "theme-card");
          button.type = "button", button.dataset.themeId = theme.id, ((_a2 = theme.tokens) != null && _a2.backdrop || (_b2 = theme.tokens) != null && _b2.card || (_c = theme.tokens) != null && _c.compact) && (button.dataset.themeTextured = ""), button.setAttribute("aria-label", `\u4F7F\u7528${theme.name}\u4E3B\u9898`), button.title = `${theme.name} \xB7 ${description}`, button.setAttribute("aria-pressed", "false"), button.disabled = !themes;
          let preview = el("span", "theme-preview");
          preview.setAttribute("aria-hidden", "true");
          for (let [key, value] of Object.entries({ ...BLACK_GOLD.tokens, ...theme.tokens })) preview.style.setProperty("--preview-" + key, value);
          let mini = el("span", "theme-mini");
          mini.append(el("span", "theme-mini-seal", "\u6740"), el("span", "theme-mini-number", "3"), el("span", "theme-mini-separator"), controlIcon(doc, "camera")), preview.append(mini);
          let meta = el("span", "theme-meta"), title2 = el("span", "theme-title-row"), state = el("span", "theme-card-state");
          title2.append(el("span", "theme-name", theme.name), state), meta.append(title2, el("span", "theme-description", description)), button.append(preview, meta), cardScope.listen(button, "click", () => {
            try {
              themes.select(theme.id);
            } catch (error) {
              notify(`\u4E3B\u9898\u5207\u6362\u5931\u8D25\uFF1A${(error == null ? void 0 : error.message) || String(error)}`);
            }
          }), cards.set(theme.id, { button, state }), grid.append(button);
        }
      }
      for (let [id, { button, state }] of cards) {
        let active = (current == null ? void 0 : current.id) === id;
        button.setAttribute("aria-pressed", String(active)), state.textContent = active ? "\u4F7F\u7528\u4E2D" : "\u5207\u6362";
      }
      let selected = palette.find((theme) => theme.id === (current == null ? void 0 : current.id));
      status.textContent = `\u5F53\u524D \xB7 ${(selected == null ? void 0 : selected.name) || BLACK_GOLD.name}`;
    };
    return update(), themes && scope.add(themes.subscribe(update)), scope.add(() => {
      cardScope == null || cardScope.dispose(), root.remove();
    }), () => scope.dispose();
  }
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
    for (let i2 = 0, l = arrayLike.length; i2 < l; i2++)
      arr.push(arrayLike[i2]);
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
  async function cloneCanvasElement(canvas) {
    let dataURL = canvas.toDataURL();
    return dataURL === "data:," ? canvas.cloneNode(!1) : createImage(dataURL);
  }
  async function cloneVideoElement(video, options) {
    if (video.currentSrc) {
      let canvas = document.createElement("canvas"), ctx = canvas.getContext("2d");
      canvas.width = video.clientWidth, canvas.height = video.clientHeight, ctx == null || ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      let dataURL2 = canvas.toDataURL();
      return createImage(dataURL2);
    }
    let poster = video.poster, contentType = getMimeType(poster), dataURL = await resourceToDataURL(poster, contentType, options);
    return createImage(dataURL);
  }
  async function cloneIFrameElement(iframe, options) {
    var _a2;
    try {
      if (!((_a2 = iframe == null ? void 0 : iframe.contentDocument) === null || _a2 === void 0) && _a2.body)
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
    var _a2, _b2;
    if (isSVGElement(clonedNode))
      return clonedNode;
    let children2 = [];
    return isSlotElement(nativeNode) && nativeNode.assignedNodes ? children2 = toArray(nativeNode.assignedNodes()) : isInstanceOfElement(nativeNode, HTMLIFrameElement) && !((_a2 = nativeNode.contentDocument) === null || _a2 === void 0) && _a2.body ? children2 = toArray(nativeNode.contentDocument.body.childNodes) : children2 = toArray(((_b2 = nativeNode.shadowRoot) !== null && _b2 !== void 0 ? _b2 : nativeNode).childNodes), children2.length === 0 || isInstanceOfElement(nativeNode, HTMLVideoElement) || await children2.reduce((deferred, child) => deferred.then(() => cloneNode(child, options)).then((clonedChild) => {
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
    for (let i2 = 0; i2 < uses.length; i2++) {
      let id = uses[i2].getAttribute("xlink:href");
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
      for (let i2 = 0; i2 < nodes.length; i2++)
        defs.appendChild(nodes[i2]);
      clone.appendChild(svg);
    }
    return clone;
  }
  async function cloneNode(node, options, isRoot) {
    return !isRoot && options.filter && !options.filter(node) ? null : Promise.resolve(node).then((clonedNode) => cloneSingleNode(clonedNode, options)).then((clonedNode) => cloneChildren(node, clonedNode, options)).then((clonedNode) => decorate(node, clonedNode, options)).then((clonedNode) => ensureSVGSymbols(clonedNode, options));
  }
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
  async function embedProp(propName, node, options) {
    var _a2;
    let propValue = (_a2 = node.style) === null || _a2 === void 0 ? void 0 : _a2.getPropertyValue(propName);
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
  function applyStyle(node, options) {
    let { style: style2 } = node;
    options.backgroundColor && (style2.backgroundColor = options.backgroundColor), options.width && (style2.width = `${options.width}px`), options.height && (style2.height = `${options.height}px`);
    let manual = options.style;
    return manual != null && Object.keys(manual).forEach((key) => {
      style2[key] = manual[key];
    }), node;
  }
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
          })).catch((err2) => {
            console.error("Error loading remote stylesheet", err2);
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
  async function toSvg(node, options = {}) {
    let { width, height } = getImageSize(node, options), clonedNode = await cloneNode(node, options, !0);
    return await embedWebFonts(clonedNode, options), await embedImages(clonedNode, options), applyStyle(clonedNode, options), await nodeToDataURL(clonedNode, width, height);
  }
  async function toCanvas(node, options = {}) {
    let { width, height } = getImageSize(node, options), svg = await toSvg(node, options), img = await createImage(svg), canvas = document.createElement("canvas"), context2 = canvas.getContext("2d"), ratio = options.pixelRatio || getPixelRatio(), canvasWidth = options.canvasWidth || width, canvasHeight = options.canvasHeight || height;
    return canvas.width = canvasWidth * ratio, canvas.height = canvasHeight * ratio, options.skipAutoScale || checkCanvasDimensions(canvas), canvas.style.width = `${canvasWidth}`, canvas.style.height = `${canvasHeight}`, options.backgroundColor && (context2.fillStyle = options.backgroundColor, context2.fillRect(0, 0, canvas.width, canvas.height)), context2.drawImage(img, 0, 0, canvas.width, canvas.height), canvas;
  }
  function shortcutFromEvent(event) {
    return !event.code || ["Control", "Shift", "Alt", "Meta"].some((key) => event.code.startsWith(key)) ? null : { code: event.code, ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey, meta: event.metaKey };
  }
  function shortcutLabel(shortcut) {
    return shortcut != null && shortcut.code ? [shortcut.ctrl && "Ctrl", shortcut.shift && "Shift", shortcut.alt && "Alt", shortcut.meta && "Meta", shortcut.code.replace(/^(Key|Digit)/, "")].filter(Boolean).join(" + ") : "\u672A\u7ED1\u5B9A";
  }
  function matchesShortcut(event, shortcut) {
    return !!(shortcut != null && shortcut.code) && event.code === shortcut.code && ["ctrl", "shift", "alt", "meta"].every((key) => !!event[key + "Key"] == !!shortcut[key]);
  }
  function isTyping(event) {
    return event.composedPath().some((node) => (node == null ? void 0 : node.isContentEditable) || /^(INPUT|TEXTAREA|SELECT)$/.test(node == null ? void 0 : node.tagName));
  }
  var DEFAULT_SCREENSHOT_SHORTCUT = { code: "KeyS", ctrl: !0, shift: !0, alt: !1, meta: !1 };
  function gameCanvas(win) {
    var _a2, _b2;
    let rendered = (_b2 = (_a2 = win.Laya) == null ? void 0 : _a2.Render) == null ? void 0 : _b2.canvas, source = (rendered == null ? void 0 : rendered.source) ?? rendered, canvas = source != null && source.getBoundingClientRect ? source : win.document.getElementById("layaCanvas");
    if (!canvas || !canvas.width || !canvas.height) throw new Error("\u5C1A\u672A\u627E\u5230\u6E38\u620F\u6709\u6548\u753B\u9762");
    let rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) throw new Error("\u6E38\u620F\u753B\u9762\u5C1A\u672A\u663E\u793A");
    return { canvas, rect };
  }
  function hideNativeOverlays(stage) {
    let saved = [], queue = stage ? [stage] : [], seen = /* @__PURE__ */ new Set();
    for (let i2 = 0; i2 < queue.length; i2++) {
      let node = queue[i2];
      !node || node.destroyed || seen.has(node) || (seen.add(node), ["sgs-toolbox-hand-sort", "sgs-toolbox-countdown"].includes(node.name) ? (saved.push([node, node.visible]), node.visible = !1) : Array.isArray(node._children) && queue.push(...node._children));
    }
    return () => {
      for (let [node, visible] of saved) node.destroyed || (node.visible = visible);
    };
  }
  function captureNative(win, canvas, hide) {
    var _a2, _b2, _c;
    let doc = win.document, stage = (_a2 = win.Laya) == null ? void 0 : _a2.stage, restore = hide ? hideNativeOverlays(stage) : () => {
    }, rendered;
    try {
      let output = doc.createElement("canvas"), width = Math.round((stage == null ? void 0 : stage.width) || canvas.width), height = Math.round((stage == null ? void 0 : stage.height) || canvas.height);
      if (!(width > 0 && height > 0 && width * height <= 33554432)) throw new Error("\u6E38\u620F\u753B\u9762\u5C3A\u5BF8\u65E0\u6548\u6216\u8FC7\u5927");
      output.width = width, output.height = height;
      let context2 = output.getContext("2d");
      if (typeof (stage == null ? void 0 : stage.drawToCanvas) != "function") {
        if (!canvas.getContext("2d")) throw new Error("\u5F53\u524D\u6E38\u620F\u5F15\u64CE\u4E0D\u652F\u6301\u622A\u56FE\uFF0C\u8BF7\u5237\u65B0\u6E38\u620F\u540E\u91CD\u8BD5");
        return context2.drawImage(canvas, 0, 0, width, height), output;
      }
      rendered = stage.drawToCanvas(width, height, 0, 0);
      let target = (_b2 = rendered == null ? void 0 : rendered._ctx) == null ? void 0 : _b2._targets;
      if (target != null && target.getData) {
        let pixels = target.getData(0, 0, width, height);
        if (!pixels || pixels.length < width * height * 4) throw new Error("\u6E38\u620F\u753B\u9762\u8BFB\u53D6\u5931\u8D25");
        let data = context2.createImageData(width, height), stride = width * 4;
        for (let y = 0; y < height; y++) data.data.set(pixels.subarray((height - 1 - y) * stride, (height - y) * stride), y * stride);
        context2.putImageData(data, 0, 0);
      } else {
        let source = (rendered == null ? void 0 : rendered.source) ?? (rendered == null ? void 0 : rendered._source);
        if (!source) throw new Error("\u6E38\u620F\u753B\u9762\u8BFB\u53D6\u5931\u8D25");
        context2.drawImage(source, 0, 0, width, height);
      }
      return stage.bgColor && (context2.globalCompositeOperation = "destination-over", context2.fillStyle = stage.bgColor, context2.fillRect(0, 0, width, height), context2.globalCompositeOperation = "source-over"), output;
    } finally {
      try {
        (_c = rendered == null ? void 0 : rendered.destroy) == null || _c.call(rendered);
      } finally {
        restore();
      }
    }
  }
  async function captureGameImage(win, game, { hideUI = !0 } = {}) {
    let { canvas, rect } = gameCanvas(win), inGame = game.isInGame(), output = captureNative(win, canvas, hideUI && inGame), ctx = output.getContext("2d"), layerOrder = (host) => {
      var _a2;
      return Math.max(
        Number(win.getComputedStyle(host).zIndex) || 0,
        ...[...((_a2 = host.shadowRoot) == null ? void 0 : _a2.children) || []].filter((child) => !child.classList.contains("toast")).map((child) => Number(win.getComputedStyle(child).zIndex) || 0)
      );
    }, hosts = [...win.document.querySelectorAll("[data-sgs-toolbox]")].filter((host) => !(hideUI && (host.dataset.sgsToolbox === "core" || inGame))).sort((a, b) => layerOrder(a) - layerOrder(b));
    for (let host of hosts) {
      let css = win.getComputedStyle(host);
      if (css.display === "none" || css.visibility === "hidden") continue;
      let box = host.getBoundingClientRect(), fullViewport = !box.width || !box.height, width = fullViewport ? win.innerWidth : box.width, height = fullViewport ? win.innerHeight : box.height, x2 = fullViewport ? 0 : box.left, y = fullViewport ? 0 : box.top;
      if (x2 >= rect.right || y >= rect.bottom || x2 + width <= rect.left || y + height <= rect.top) continue;
      let layer = await toCanvas(host, {
        width,
        height,
        pixelRatio: 1,
        skipFonts: !0,
        filter: (node) => {
          var _a2;
          return !["STYLE", "SCRIPT"].includes(node.tagName) && !((_a2 = node.classList) != null && _a2.contains("toast"));
        },
        style: { position: "relative", left: "0", top: "0", right: "auto", bottom: "auto", margin: "0", transform: "none" }
      });
      ctx.drawImage(
        layer,
        (x2 - rect.left) * output.width / rect.width,
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
      var _a2;
      if (!(busy || scope.closed)) {
        busy = !0;
        try {
          if (!win.ClipboardItem || !((_a2 = win.navigator.clipboard) != null && _a2.write)) throw new Error("\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u56FE\u7247\u526A\u8D34\u677F\uFF0C\u8BF7\u4F7F\u7528 HTTPS \u9875\u9762\u548C\u65B0\u7248 Chrome / Edge");
          let image = captureGameImage(win, game, { hideUI: settings.get("screenshotHideUI", !0) });
          image.catch(() => {
          });
          let png = await image;
          await win.navigator.clipboard.write([new win.ClipboardItem({ "image/png": png })]), scope.closed || notify("\u6E38\u620F\u622A\u56FE\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F");
        } catch (error) {
          scope.closed || notify((error == null ? void 0 : error.name) === "NotAllowedError" ? "\u65E0\u6CD5\u590D\u5236\u622A\u56FE\uFF1A\u8BF7\u5141\u8BB8\u6B64\u9875\u9762\u8BBF\u95EE\u526A\u8D34\u677F\uFF0C\u518D\u70B9\u51FB\u622A\u56FE\u91CD\u8BD5" : `\u622A\u56FE\u5931\u8D25\uFF1A${(error == null ? void 0 : error.message) || error}`);
        } finally {
          busy = !1;
        }
      }
    }
    return scope.listen(win.document, "keydown", (event) => {
      event.defaultPrevented || event.repeat || event.isComposing || isTyping(event) || matchesShortcut(event, settings.get("screenshotShortcut", DEFAULT_SCREENSHOT_SHORTCUT)) && (event.preventDefault(), event.stopPropagation(), capture());
    }), { capture };
  }
  async function updateInstalledPlugins({ manager: manager2, client, catalog, checkCurrent, onProgress }) {
    let installed = new Map(manager2.list().map((item) => [item.id, item])), entries = new Map(findPluginUpdates([...installed.values()], catalog).filter((item) => item.status === "update").map((item) => [item.id, item.entry])), finished = /* @__PURE__ */ new Map(), visiting = /* @__PURE__ */ new Set(), updated = 0, processed = 0;
    async function visit(id) {
      var _a2, _b2;
      if (visiting.has(id)) throw new Error("\u524D\u7F6E\u63D2\u4EF6\u5FAA\u73AF\u4F9D\u8D56\uFF1A" + id);
      if (finished.has(id)) return finished.get(id);
      let entry = entries.get(id);
      visiting.add(id);
      let error;
      try {
        for (let dependency of (entry == null ? void 0 : entry.dependencies) ?? ((_a2 = installed.get(id)) == null ? void 0 : _a2.dependencies) ?? [])
          if (await visit(dependency)) throw new Error("\u8BF7\u5148\u4FEE\u590D\u524D\u7F6E\u63D2\u4EF6\u300C" + (((_b2 = installed.get(dependency)) == null ? void 0 : _b2.name) || dependency) + "\u300D\u7684\u66F4\u65B0\u3002");
        if (entry) {
          checkCurrent(), onProgress(++processed, entries.size, entry.name);
          let checkInstall = () => {
            let list2 = manager2.list(), current = list2.find((item) => item.id === id);
            if (!current || compareVersions2(entry.version, current.version) <= 0) return !1;
            if (current.enabled) {
              let missing = planDependencies(entry, list2, catalog);
              if (missing.length) throw new Error("\u8BF7\u5728\u6B64\u63D2\u4EF6\u7684\u66F4\u65B0\u5361\u7247\u4E2D\u5B89\u88C5\u65B0\u589E\u524D\u7F6E\uFF1A" + missing.map((item) => item.name).join("\u3001"));
            }
            return !0;
          };
          if (checkInstall()) {
            let pkg = await client.getPackage(entry);
            checkCurrent(), checkInstall() && (await manager2.install(pkg, { updateOnly: !0 }), updated++);
          }
        }
      } catch (failure) {
        error = failure;
      } finally {
        visiting.delete(id);
      }
      return finished.set(id, error), error;
    }
    for (let id of entries.keys())
      checkCurrent(), await visit(id);
    return checkCurrent(), { updated, failures: [...entries].filter(([id]) => finished.get(id)).map(([id, entry]) => ({ entry, error: finished.get(id) })) };
  }
  var SHANHE_MAP_SCENES = /* @__PURE__ */ new Set(["RogueLikeBigMapScene", "RogueSmallMapScene"]), SHANHE_BATTLE_SCENE = "RogueLikeGameScene";
  function gameViewForScene(scene) {
    let name = (scene == null ? void 0 : scene.SceneName) || (scene == null ? void 0 : scene.sceneName) || (scene == null ? void 0 : scene.name);
    return name === SHANHE_BATTLE_SCENE ? "shanhe-battle" : SHANHE_MAP_SCENES.has(name) ? "shanhe" : "battle";
  }
  function selectGamePanels(panels, view) {
    if (view === "shanhe-battle") return panels;
    let selected = view === "shanhe" && panels.some((panel) => panel.gameView === "shanhe") ? "shanhe" : "battle";
    return panels.filter((panel) => !panel.gameView || panel.gameView === selected);
  }
  var FEEDBACK_URL = "https://redeem.3gs.xyz/feedback", FEEDBACK_STYLES = `
.feedback-form{display:grid;gap:7px;min-width:0}
.feedback-form textarea{box-sizing:border-box;width:100%;min-height:76px;resize:vertical;padding:8px 9px;border:1px solid var(--sgs-border);border-radius:7px;background:var(--sgs-surface);color:var(--sgs-text);font:13px/1.5 var(--sgs-font,sans-serif)}
.feedback-form textarea::placeholder{color:var(--sgs-muted)}
.feedback-form textarea:focus{outline:1px solid var(--sgs-accent);outline-offset:1px;border-color:var(--sgs-accent)}
.feedback-form .actions{align-items:center;margin-top:0}
.feedback-form .actions button{padding-left:10px;padding-right:10px;white-space:nowrap}
.feedback-form .actions button:enabled{color:var(--sgs-accent);border-color:var(--sgs-accent)}
.feedback-form .actions button:disabled{opacity:.55}
.feedback-status:empty{display:none}
.feedback-form .feedback-status.error{color:var(--sgs-danger)}
`;
  function createFeedbackForm(win, doc, scope, getAccount = () => ({})) {
    let form = doc.createElement("form");
    form.className = "feedback-form", form.innerHTML = `
    <textarea name="message" aria-label="\u53CD\u9988\u5185\u5BB9" aria-describedby="feedback-disclosure" maxlength="2000" rows="3" placeholder="\u63CF\u8FF0\u9047\u5230\u7684\u95EE\u9898\u6216\u60F3\u8981\u7684\u529F\u80FD" required></textarea>
    <span id="feedback-disclosure" class="muted">\u63D0\u4EA4\u65F6\u53D1\u9001\u53CD\u9988\u5185\u5BB9\u3001\u5DE5\u5177\u7BB1\u7248\u672C\u53CA\u53EF\u8BFB\u53D6\u7684\u6E38\u620F ID \u548C\u6635\u79F0\u3002\u670D\u52A1\u5668\u4F1A\u8BB0\u5F55\u8FDE\u63A5 IP\u3002\u8BF7\u52FF\u586B\u5199\u5BC6\u7801\u3002</span>
    <div class="actions"><button type="submit" disabled>\u63D0\u4EA4\u53CD\u9988</button></div>
    <span class="feedback-status muted" role="status"></span>`;
    let input = form.elements.message, submit = form.querySelector("button"), status = form.querySelector("[role=status]"), attempt, showStatus = (message, error = !1) => {
      status.classList.toggle("error", error), status.textContent = message;
    };
    return input.addEventListener("input", () => {
      input.readOnly || (submit.disabled = !input.value.trim(), showStatus(""));
    }), form.addEventListener("submit", async (event) => {
      var _a2, _b2;
      event.preventDefault();
      let message = input.value.trim();
      if (!message || input.readOnly || scope.closed) return;
      let account = getAccount(), userId2 = /^[1-9][0-9]{0,31}$/.test(account.id) ? account.id : null, nickname = userId2 && Array.from(((_a2 = account.nickname) == null ? void 0 : _a2.trim()) || "").slice(0, 128).join("") || null;
      ((attempt == null ? void 0 : attempt.message) !== message || attempt.userId !== userId2 || attempt.nickname !== nickname) && (attempt = { id: Array.from(win.crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join(""), message, version: `${CORE_VERSION}-${EDITION}`, userId: userId2, nickname });
      let controller = new win.AbortController(), timeout = win.setTimeout(() => controller.abort(), 1e4), release = scope.add(() => {
        win.clearTimeout(timeout), controller.abort();
      });
      input.readOnly = !0, submit.disabled = !0, showStatus("\u6B63\u5728\u63D0\u4EA4\u2026");
      try {
        let response = await win.fetch(FEEDBACK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(attempt),
          credentials: "omit",
          redirect: "error",
          referrerPolicy: "no-referrer",
          signal: controller.signal
        });
        response.status === 429 ? showStatus("\u63D0\u4EA4\u8FC7\u4E8E\u9891\u7E41\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", !0) : response.ok && ((_b2 = await response.json()) == null ? void 0 : _b2.ok) === !0 ? (input.value = "", attempt = void 0, showStatus("\u53CD\u9988\u5DF2\u6536\u5230\uFF0C\u611F\u8C22\u63D0\u4F9B\u610F\u89C1\u3002")) : showStatus("\u63D0\u4EA4\u5931\u8D25\uFF0C\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", !0);
      } catch {
        scope.closed || showStatus("\u6682\u65F6\u65E0\u6CD5\u786E\u8BA4\u9001\u8FBE\uFF0C\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002\u8BF7\u7A0D\u540E\u91CD\u8BD5\u3002", !0);
      } finally {
        release(), input.readOnly = !1, submit.disabled = !input.value.trim();
      }
    }), form;
  }
  function base64url(bytes2) {
    let binary = "";
    for (let byte of bytes2) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  }
  function fromBase64url(value, length) {
    if (typeof value != "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("invalid_code");
    let bytes2 = Uint8Array.from(atob(value.replaceAll("-", "+").replaceAll("_", "/")), (char) => char.charCodeAt(0));
    if (base64url(bytes2) !== value || length !== void 0 && bytes2.length !== length) throw new Error("invalid_code");
    return bytes2;
  }
  var MODES = { 26: "\u6392\u4F4D\u8D5B", 35: "\u6597\u5730\u4E3B", 44: "\u5355\u9A91\u65E0\u53CC" }, MATCH_SYNC_LIMIT = 1e4, sameGenerals = (left, right) => left.length === right.length && right.every((id) => left.includes(id));
  function sameSyncMatch(left, right) {
    return left.mode === right.mode && left.endedAt === right.endedAt && left.result === right.result && left.duration === right.duration && sameGenerals(left.general, right.general);
  }
  var encode = new TextEncoder(), decode = new TextDecoder("utf-8", { fatal: !0 }), publicSharePath = "/ledger/share/", publicViewPath = "/v2/vault/view", passFormat = /^[2-9A-HJ-NP-Z]{6}$/, tokenFormat = /^[A-Za-z0-9_-]{43}$/, invalidPublicCode = () => new Error("\u516C\u5171\u540C\u6B65\u51ED\u636E\u683C\u5F0F\u65E0\u6548");
  function publicOrigin(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("\u8BF7\u8F93\u5165\u5B8C\u6574\u7684 HTTPS \u5730\u5740");
    }
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
      throw new Error("\u8BF7\u8F93\u5165 HTTPS \u670D\u52A1\u5668\u5730\u5740\uFF0C\u5730\u5740\u4E2D\u65E0\u9700\u586B\u5199\u8DEF\u5F84");
    return url.origin;
  }
  var packPublicCode = (prefix3, values) => prefix3 + "." + base64url(encode.encode(JSON.stringify(values)));
  function unpackPublicCode(prefix3, value, count) {
    try {
      if (!value.startsWith(prefix3 + ".") || value.length > 1600) throw invalidPublicCode();
      let data = JSON.parse(decode.decode(fromBase64url(value.slice(prefix3.length + 1))));
      if (!Array.isArray(data) || data.length !== count || data.some((item) => typeof item != "string")) throw invalidPublicCode();
      return data;
    } catch {
      throw invalidPublicCode();
    }
  }
  var publicViewCode = ({ origin, vault, seed }) => packPublicCode("SGSV1", [origin, vault, seed]), publicViewLink = (entry) => publicOrigin(entry.origin) + publicSharePath + "#" + publicViewCode(entry);
  function readPublicView(value) {
    let code = value.trim(), link;
    if (code.length > 2048) throw invalidPublicCode();
    if (code.startsWith("https://")) {
      try {
        link = new URL(code);
      } catch {
        throw invalidPublicCode();
      }
      if (link.pathname !== publicSharePath || link.username || link.password || link.search) throw invalidPublicCode();
      code = link.hash.slice(1);
    }
    let [address, vault, seed] = unpackPublicCode("SGSV1", code, 3), origin = publicOrigin(address);
    if (!tokenFormat.test(vault) || !tokenFormat.test(seed) || link && link.origin !== origin) throw invalidPublicCode();
    return { origin, vault, seed };
  }
  async function createVaultCipher(crypto, { vault, seed, password }) {
    let material = await crypto.subtle.importKey("raw", encode.encode(seed + ":" + password), "PBKDF2", !1, ["deriveBits"]), bits2 = new Uint8Array(await crypto.subtle.deriveBits({
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encode.encode("sgs-public-vault-v1:" + vault),
      iterations: 6e5
    }, material, 512)), key = await crypto.subtle.importKey("raw", bits2.slice(0, 32), "AES-GCM", !1, ["encrypt", "decrypt"]), params = (iv, kind, id) => ({ name: "AES-GCM", iv, additionalData: encode.encode(JSON.stringify([vault, kind, id])) });
    return {
      verifier: base64url(bits2.slice(32)),
      async seal([kind, id, details]) {
        let iv = crypto.getRandomValues(new Uint8Array(12)), data = new Uint8Array(await crypto.subtle.encrypt(params(iv, kind, id), key, encode.encode(JSON.stringify(details)))), envelope = new Uint8Array(iv.length + data.length);
        return envelope.set(iv), envelope.set(data, iv.length), [kind, id, base64url(envelope)];
      },
      async open([kind, id, envelope]) {
        let bytes2 = fromBase64url(envelope), data = await crypto.subtle.decrypt(params(bytes2.subarray(0, 12), kind, id), key, bytes2.subarray(12));
        return [kind, id, JSON.parse(decode.decode(data))];
      }
    };
  }
  async function readPublicRecords(crypto, post, share, pass) {
    let { origin, vault, seed } = share, password = pass.trim().toUpperCase();
    if (!passFormat.test(password)) throw new Error("\u8BF7\u8F93\u5165\u6709\u6548\u7684\u516D\u4F4D\u67E5\u770B\u7801");
    let cipher = await createVaultCipher(crypto, { vault, seed, password }), { records } = await post(origin, publicViewPath, { vault, verifier: cipher.verifier });
    return Promise.all(records.filter(([kind]) => kind === "event" || kind === "match").map(cipher.open));
  }
  function publicRecordText(stream, row) {
    return stream === "events" ? row.prayer ? `${row.prayer.name} \xD7 ${row.prayer.times}` : Array.isArray(row.items) && row.items.filter((item) => typeof (item == null ? void 0 : item.name) == "string" && Number.isFinite(item.delta)).map((item) => `${item.name} ${item.delta > 0 ? "+" : ""}${item.delta}`).join("\u3001") || "\u7269\u54C1\u6D41\u6C34" : [
      MODES[row.mode] || "\u5BF9\u5C40",
      { 0: "\u80DC", 1: "\u8D1F", 255: "\u5E73" }[row.result],
      Array.isArray(row.general) && row.general.filter(Number.isFinite).join(" / ")
    ].filter(Boolean).join(" \xB7 ");
  }
  var DEEPSEEK_HARNESS_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAVCAMAAABi3H5uAAAAbFBMVEVNa/0AAABRcf9Ma/1Mav1Maf5Mav1Mav4AAP9Mav1Mav1TVf1/f/9Ldv00Zv8/f/8Af/9paf8A//88Wv8/P/9Ibdp/AP9Scf////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA5PzKcAAAAJHRSTlP6AP6uTxLMLwFskgQCDQUFAgYBEQQHAn4BAAAAAAAAAAAAAAAPe0/TAAABIElEQVR42lWSi5LDIAhFuQKiRpO2+/z/L11Q29kyk4xy9PKSAJQDy1TV/0POo6D0AgJu7jUTs8rE5YKQoVwP9xI6voQppUSJSHFHpSwhUCv1Mlq4l7XxXapva2WmRv1qL+TGCpsLdxpB/jNKTttefdLBbzDo0baG3yXObzibeHDznEioAmfkuzKKg/4JvHiqqR6jAJLXLVsyNqEkxr30AeVNI3DW/jth1tJdedOKKI1971BDP1YXxlKOn8R50GBPvnh/PYjs6ikfwTCbUHEWxEDarsY7v6Dm5MLlrD+KM6cVdzJQ914GdQU2WNA89nzJxylOm8xh6Ed0k2vf0N+B5LQbnJmjmXx7LAgftz4zSVl0mOlTdhZRVJpfavZ8TtP+AAg4CCzveQRoAAAAAElFTkSuQmCC", ALIYUN_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAASCAMAAAB/2U7WAAAAbFBMVEX/agAAAAD/fgD/cgD/VwD/aAD/aQD/AAD/awD/aQD/aAD//wD/agD/qgD/aQD/PwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADDHyQ6AAAAJHRSTlP7AAX/BIsTAS+qawHRA1AEAAAAAAAAAAAAAAAAAAAAAAAAAAB5qJ0tAAAAmUlEQVR42n2RSRbEIAhEKVRwTO5/26YN2p2NfyNSj5kgiSahDDVGCc8/CUi6az1rBKLm7moXmnGBeskYMAZy6TR1T5kuARom9sjl/i/VfMxwplVpdSIxMjg60xTvK1TsqB2N6mJSVqtTHatvjrREcIOU1UERNMZL5J/IL1Gt5p03t9XcaY8NPaNoc/R/lOMSDus7Lv54stOxP6ViBpkjWWghAAAAAElFTkSuQmCC", DOUBAO_WORK_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABoAAAAcCAMAAABIzV/hAAABamlDQ1BJQ0MgUHJvZmlsZQAAeJx1kL1Lw1AUxU+rUtA6iA4dHDKJQ9TSCnZxaCsURTBUBatTmn4JbXwkKVJxE1cp+B9YwVlwsIhUcHFwEEQHEd2cOim4aHjel1TaIt7H5f04nHO5XMAbUBkr9gIo6ZaRTMSktdS65HuDh55TqmayqKIsCv79u+vz0fXeT4hZTbt2ENlPXJfOLpd2ngJTf/1d1Z/Jmhr939RBjRkW4JGJlW2LCd4lHjFoKeKq4LzLx4LTLp87npVknPiWWNIKaoa4SSynO/R8B5eKZa21g9jen9VXl8Uc6lHMYRMmGIpQUYEEBeF//NOOP44tcldgUC6PAizKREkRE7LE89ChYRIycQhB6pC4c+t+D637yW1t7xWYbXDOL9raQgM4naGT1dvaeAQYGgBu6kw1VEfqofbmcsD7CTCYAobvKLNh5sIhd3t/DOh74fxjDPAdAnaV868jzu0ahZ+BK/0HFylqvLiAv9gAAADAUExUReHh6S8fG5FpXWVYWdTm+6Sdo0srIdqomcqPeNPm/dXj9ltWXaKy1xsUFbjD4AAA/7CEdaSkpLDg/6S03TYeFptuXikdH3d4h7jF6eKtn2pqAKO03Y1RPFo3NfvRv8Grtr/g/6qqVYdYRZFISP//f3///36BjX+/v2dUT1JAPHhKOFEyLEElHAAAACwXENfo+xcVGOn2/gwICa674vrIt25FN1U3Lv7XyrjG6O+6qql4Zv///6q22MLN78+bh6qq/3J83NsAAABAdFJOU/vy/v6g/vz+/mYYDShY5gH/AxVpqq4w/XI2AtT/LMl0mANxBwIC/wRn/0iEWQD+/P7+/v7+/f7+/v7+Av3+/wMGEVRiAAABv0lEQVR42k3SiXKkIBAG4AYEde7MzuTOXtl7F1AGULzm/d8qDWY2+a3S0s9uURvknHv5/O9ADn+f5P/AfPgin4hSyjuxXsrle7qSf4SK5JUi168WaftN3rkoxPm4X8r77Uz9d1nax1Ql0h2slH0fadvLz5B3KpFXhhC1yeR5i3SWGfCC+WRuN3XK3NRoEs6yhJY6GhuKzgLAzjCtS7mHfqGBC58e0kETI5D0ogdsp6lIK+uKbmpskbsfWJtJWOAdTKX33XVTsKGYaKtjGZSJYgquvLU7T0MUXUJWz2ScDZQ3DSW5jVJnkWqG/Qi1tgHcgoVXAiROYlWwmNAkuFRp/dtUylC0PIS8fiMsBGYU64rcQi54DXVMBmWkugaq2FR0HLjW4zi2LdzCAq9r2HAuDGGK4Vl7Op2GYVjBAnAVpDLqsaqM8YxDG+30sAdZDqaKoQ6PvjJ8jFXtB/wpPUlSEYo7V5EBi4bTwwo/r7yeyVBviDNsTP1W8gw4I+vZBDXCmRtAwHZX80StjcElVJR2Lj6qRfl5GbY1IZ7mDX4nOozjBru9jejy18cmTFORh3ZzO8uFMHdfD8fj8dM+TWzMC3SQaG1K8VniAAAAAElFTkSuQmCC", WORKBUDDY_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y+mAAAAwFBMVEUAAAAAAADm5ub6+vra2tqYmJgWFhYAAAAAAABKSkq4uLipqaloaGiCgoIAAAA7OztUVFQnJyd/f38AAAD////JyckAAAB5eXkAAAAcHBw5OTlVVVVjY2MXFxevr6+srKyqqqqLi4uDg4Nzc3N9fX2srKxoaGhhYWFra2ujo6NmZmZSUlJVVVWzs7NCQkLCwsIVFRXDw8PR0dEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAC2Gk4uAAAAQHRSTlP9Av7+/vv9NVP/+f/+/sj//v8CswH+kP9rKwwDLxR6IgPLrY1oiN+DYbAFjiSKF61gyroAAAAAAAAAAAAAAAAANphvowAAAUZJREFUeNpdk9eSgzAMRWXJxoBpoYQkm2y29/7/H7fCBXDuCzM6oytZEiCC9LYCVrfTByFaGwKPUkuctkcfdFB3sFJtHg/iKsB0jSDJUb7OmTGDQkqJd6K3UMcsMchweGfKsIthMyVKUj+ihUtTUCiRRU+TbRWbNhYxlPdvEFXcFAaDCM+wXWWNA7m40zUsrk2OthzJsmkKQ5QveaV0CMeNm5NEKJRRZZHVyhcym7kBCYN0cmjI1i+GPJCp2Hjx5lv0jFAFx7q2nwpeQpqZHWukxu4VTr6TlWNGJBP+ahDPlql1qZyoZFee7V4R10uiUyAaEkgF9OIBwzBGLPxAUEHHW2n707d1YUki3zAb6WllN/3x10O1mmfqbqgVH38ulnDxbGH2wFrx9ekaKogsrPRyt3yje7fXzLJddNTT9eudu7Qunf+Qf4IsDZSJTVD2AAAAAElFTkSuQmCC", CODEX_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAcCAMAAABF0y+mAAAAwFBMVEWWrPHU7e1tm/VvjvhidPqrzuKKnva8xPnU3/Vyi/NyjPzP1faCfv/R2v7//7RrfPj//wCjt/2VsPk/P/9IkW1QY/1mZv9mf5l/f38A//8A/wCq1KoAAAB0lv6Slf5tiP6upP40Of87RP/9//1IV/5bdf5sef5SZ/6Kif/r9P6lm/5CTP4AAP+ut/1/f/+LqPzJ1f2cuP3IyvhVVf9obP1PWfzHxvu4yPxodvjb5v5pePt0k/tWZfdSXfTBvP1gbPqNRrZsAAAAQHRSTlMWHh2YlhlmnV1h6IX9/wNQAcCPBAfVBQoCAQEGAP7+/f79/gL+/v3+/v/+/QH/Av///60D8tPP/3H/w6+spPCiNF86AgAAAY9JREFUeNpdktlimzAQRQcMju1sXZO2GYlFSCCxuTjeYif5/7/KSGBKel4QOlcz8zCADoHoLbruevHHHgUIdwuDu7t+i42J6503pgcphNfV3Fjit2636xahE056eBXzeIItIJwUgPDZGc7jkCy4Wa4MN1NpioKHws4lqCZhRmMML4pijg0I7ytXBf9MUdyoF5L4jUfR/4rc8/MPBGBRxBi/3Y+CUIrkI8KSkWOt1i1zMrJYacvOmGOv1/3hInM1Rzj1d+2trtk/rZTMV3B5SU+PKzbVUi3Bj+xAjNX62DI20UoG8OXkurCjriPGplq9QAUrKZWs9dpWaP9a2t7OYIPnPM+V1lxSAd3TDhLFz4yo41wS9dqy77v6UOG2LLMszbLcYSPSTTFD+I6vKVHaxBDo/enJp573ZZKkaZ/IhoSM5nd2Cxo8J45pIAgRK9qEpoJtMtInMh/9fsFoV97LdOKTMqB6w/b9os/h/BpcCpTvYlONe/vbHTEMStt0e8Cqmmw8Ns1m80B/94fDUlwcfgABqGMlGtELwgAAAABJRU5ErkJggg==", TENCENT_CLOUD_ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABwAAAAUCAMAAACpgK3LAAAAwFBMVEUAAAAAp/4Aff8Acv8A//8Aov8ApPsAbf8AyNsAzeEAmP8Aov8A1eoAqf8Abf8Aav8AAP8Ax9sAxtwAVv8ApP8AxdoA1dUAx9wAof8Ax9sAo/8Abf8Abf8AyNsAbP8AydoAv78AcP8At9YAnf8AiPUAa/8AcP8Av/8AnNUAqtQAseMAsv8Af38AzeEAzeEAqqoAmZkAb/8Ay+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAtI5oBAAAAQHRSTlMA+wT+Aa3L8PL8C5P+B60LAa2NBTAyB8tNTXKUz3AvEwVDCCkPTTYEBgbG/wJOmQMFe8oAAAAAAAAAAAAAAAAAyV+ZsAAAATpJREFUeNplj4d2wyAMRWXMtgHjPbNX9/j/j6uwmyY9ecdgSRd4EsAiAsXWjkKM9ugw+acCVjb+lT1heqcMtiKOhR0GG/5bLNxEnUC0CuEJsVjdQQI2FoODwrkC3CBie7P9gBXmhDg8nzlCRjFem6K4vmJxBEJne+ybHMgC8KumZ87zao6xuu8ZZ30Z2nytJ5kGyakGSojpoyh6wdUbAjRPlWx8I5XMazA6wTpnHPeEQiVV061hPUml/C5j8x0wLeISvJLd4vyd5hdkHN0MQBtFDGTq6ROldAPV2yGwPWiSGUMwRpjDLsxwAbcwEzINyQw93eCrZ9CB6WV6quebXqkK6noHmge/MzEaZaAMnp3CbvFsyUP2p9BtCxuPc/o8D5Ox5KowEUOD9btSqYwelOjwwmfnmwfEWg3ZDzwKEsFIDr3QAAAAAElFTkSuQmCC", PRIVATE_SERVER_REPOSITORY = "https://github.com/Usernametoolongmaximumis39/sgs-ol-toolbox-sync-server", TEST_NOTICE = "\u8FD9\u662F\u4E91\u540C\u6B65\u6D4B\u8BD5\u670D\u52A1\u5668\uFF0C\u6D4B\u8BD5\u7ED3\u675F\u540E\u4F1A\u505C\u7528\u3002\u5907\u4EFD\u7531\u5DE5\u5177\u7BB1\u52A0\u5BC6\u540E\u4E0A\u4F20\u3002\u6CA1\u6709\u516D\u4F4D\u8BBF\u95EE\u7801\uFF0C\u5176\u4ED6\u4EBA\u65E0\u6CD5\u901A\u8FC7\u5206\u4EAB\u94FE\u63A5\u89E3\u5BC6\u4F60\u7684\u6570\u636E\u3002";
  function downloadSyncBackup(window2, preferences) {
    return preferences.restore(() => window2.confirm("\u5C06\u6062\u590D\u5F53\u524D\u8D26\u53F7\u7684\u4E91\u7AEF\u8BBE\u7F6E\u548C\u6C34\u8868\uFF0C\u5E76\u5408\u5E76\u8D26\u672C\u53CA\u6218\u7EE9\u3002\u7EE7\u7EED\u4E0B\u8F7D\uFF1F"));
  }
  function mountSyncSettings(document2, window2, sync, preferences, { initialMode = "private", onModeChange } = {}) {
    let node = (tag, label, className) => {
      let element = document2.createElement(tag);
      return label && (element.textContent = label), className && (element.className = className), element;
    }, root = node("div", "", "sync-settings"), style2 = node("style", `
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
  `), state = node("p", "", "notice"), notice = node("p", "", "notice");
    notice.setAttribute("role", "status");
    let pairing = node("div", "", "sync-stack"), connected = node("div", "", "sync-stack"), preferencePanel = node("section", "", "sync-stack sync-preferences");
    function input(label, tag = "input") {
      let wrapper = node("label", label), control = node(tag);
      return control.autocomplete = "off", control.spellcheck = !1, tag === "textarea" && (control.rows = 2), wrapper.append(control), { wrapper, control };
    }
    function short(control, size) {
      control.maxLength = size, control.className = "sync-short";
    }
    function serverAddress(label, placeholder) {
      let result2 = input(label, "textarea"), { control } = result2;
      return control.className = "sync-address", control.rows = 1, control.wrap = "off", control.placeholder = placeholder, control.setAttribute("autocapitalize", "off"), control.addEventListener("keydown", (event) => {
        event.key === "Enter" && !event.isComposing && event.preventDefault();
      }), result2;
    }
    function details(title, ...children2) {
      let block = node("details", "", "sgs-fold"), body = node("div", "", "sync-stack");
      return body.append(...children2), block.append(node("summary", title), body), block;
    }
    function say(text3, error = !1) {
      notice.textContent = text3, notice.classList.toggle("error", error), notice.hidden = !text3;
    }
    function act(title, work, primary = !1) {
      let button = node("button", title, primary ? "sync-primary" : "");
      return button.type = "button", button.addEventListener("click", async () => {
        button.disabled = !0;
        try {
          await work();
        } catch (error) {
          say(error.message, !0);
        } finally {
          button.disabled = !1, refresh();
        }
      }), button;
    }
    preferencePanel.append(
      node("h3", "\u4E91\u7AEF\u5907\u4EFD"),
      node("p", "\u9996\u6B21\u7ED1\u5B9A\u4E0B\u8F7D\u5907\u4EFD\uFF0C\u65E5\u5E38\u53EA\u62C9\u53D6\u53D8\u66F4\u3002\u5168\u91CF\u5907\u4EFD\u9650\u6BCF\u8BBE\u5907\u6BCF\u8D26\u53F7\u6BCF\u5C0F\u65F6\u4E00\u6B21\u3002", "muted"),
      node("p", "\u76F8\u5173\u64CD\u4F5C\u5B8C\u6210\u540E\u81EA\u52A8\u4E0A\u4F20\uFF0C\u6BCF\u5206\u949F\u68C0\u67E5\u5F85\u4E0A\u4F20\u5185\u5BB9\u3002", "muted")
    );
    let restorePreferences = act("\u4E0B\u8F7D\u5168\u90E8\u5907\u4EFD", async () => {
      say(await downloadSyncBackup(window2, preferences));
    }, !0);
    restorePreferences.classList.add("sync-download"), restorePreferences.prepend(createIcon(document2, "arrowDown"));
    let preferenceNotice = node("p", "", "muted"), backupError = node("p", "", "notice error");
    backupError.setAttribute("role", "status"), preferencePanel.append(preferenceNotice, restorePreferences, backupError);
    async function copy2(value, output, report = say) {
      try {
        await window2.navigator.clipboard.writeText(value), report("\u5DF2\u590D\u5236");
      } catch {
        output.control.value = value, output.wrapper.hidden = !1, output.control.focus(), output.control.select(), report("\u5DF2\u9009\u4E2D\u6587\u672C\uFF0C\u8BF7\u624B\u52A8\u590D\u5236");
      }
    }
    function readout(name, tag) {
      let result2 = input(name, tag);
      return result2.wrapper.hidden = !0, result2.control.readOnly = !0, result2;
    }
    let privatePanel = node("div", "", "sync-stack"), publicPanel = node("div", "", "sync-stack"), chooser = node("div", "", "sync-chooser"), privateButton = act("\u79C1\u6709\u670D\u52A1\u5668", () => select("private")), publicButton = act("\u516C\u5171\u670D\u52A1\u5668", () => select("public")), selectedMode = "private";
    function select(mode) {
      selectedMode = mode, onModeChange == null || onModeChange(mode), privateButton.setAttribute("aria-pressed", String(mode === "private")), publicButton.setAttribute("aria-pressed", String(mode === "public")), say("");
    }
    chooser.append(privateButton, publicButton);
    function resourceLinks(title, entries) {
      let group = node("div", "", "sync-setup-resources"), links = node("div", "", "sync-setup-links");
      for (let [label, href, icon2] of entries) {
        let link = node("a", label);
        link.href = href, link.target = "_blank", link.rel = "noopener noreferrer";
        let image = node("img");
        image.alt = "", image.src = icon2, link.prepend(image), links.append(link);
      }
      return group.append(node("h4", title), links), group;
    }
    let privateSetup = node("section", "", "sync-stack sync-private-setup"), repository = readout("\u79C1\u6709\u540C\u6B65\u670D\u52A1\u7AEF\u94FE\u63A5"), copyStatus = node("span", "", "muted");
    copyStatus.setAttribute("role", "status");
    let copyRepository = act("\u590D\u5236\u670D\u52A1\u7AEF\u94FE\u63A5", () => copy2(PRIVATE_SERVER_REPOSITORY, repository, (message) => {
      copyStatus.textContent = message;
    }), !0);
    copyRepository.classList.add("sync-copy-link"), copyRepository.prepend(createIcon(document2, "clipboard"));
    let copyRow = node("div", "", "sync-actions");
    copyRow.append(copyRepository, copyStatus), privateSetup.append(
      node("h3", "\u81EA\u5EFA\u79C1\u6709\u540C\u6B65"),
      node("p", "\u628A\u670D\u52A1\u7AEF\u94FE\u63A5\u53D1\u7ED9 AI Agent\uFF0C\u8BF7\u5B83\u534F\u52A9\u90E8\u7F72\u3002", "muted"),
      copyRow,
      repository.wrapper,
      resourceLinks("AI Agent \u4E0B\u8F7D", [
        ["DeepSeek Harness", "https://www.deepseek.com/download/", DEEPSEEK_HARNESS_ICON],
        ["\u8C46\u5305\u5DE5\u4F5C", "https://www.doubao.com/download/desktop", DOUBAO_WORK_ICON],
        ["WorkBuddy", "https://www.workbuddy.cn/#download-section", WORKBUDDY_ICON],
        ["Codex", "https://chatgpt.com/zh-Hans-CN/features/codex-get-started/", CODEX_ICON]
      ]),
      resourceLinks("\u4E91\u670D\u52A1\u5668", [
        ["\u963F\u91CC\u4E91\u514D\u8D39\u8BD5\u7528", "https://www.aliyun.com/activity/ecs/ecs/freetrial", ALIYUN_ICON],
        ["\u817E\u8BAF\u4E91", "https://cloud.tencent.com/product/lighthouse", TENCENT_CLOUD_ICON]
      ])
    );
    let request = readout("\u63D0\u4EA4\u7ED9\u7BA1\u7406\u5458\u7684\u56DB\u4F4D\u7801"), credential = input("\u540E\u53F0\u751F\u6210\u7684\u52A0\u5BC6\u51ED\u636E", "textarea");
    short(request.control, 4), credential.control.maxLength = 660;
    let address = serverAddress("\u79C1\u6709\u670D\u52A1\u5668\u5730\u5740", "http://127.0.0.1:17429"), privateConsent = "\u79C1\u6709\u670D\u52A1\u5668\u652F\u6301 HTTP \u548C HTTPS\uFF0C\u53EF\u8BFB\u53D6\u4E0A\u4F20\u7684\u6570\u636E\u3002HTTP \u4F20\u8F93\u672A\u7ECF\u52A0\u5BC6\u3002\u7ED1\u5B9A\u540E\u5207\u53F7\u53EF\u81EA\u52A8\u63A5\u5165\u540C\u4E00\u670D\u52A1\u5668\uFF0C\u5171 1 \u4E2A\u4E3B\u8D26\u53F7\u548C 4 \u4E2A\u9644\u5C5E\u8D26\u53F7\u3002", privateFields = node("div", "", "sync-stack"), joining = node("p", "", "muted"), ways = node("div", "", "sync-chooser"), fourDigit = node("div", "", "sync-stack");
    function credentialForm(action) {
      let secret = input("\u4E3B\u8D26\u53F7\u7ED1\u5B9A\u51ED\u636E", "textarea"), form = node("div", "", "sync-stack"), inputAccount;
      return secret.control.maxLength = 700, secret.control.addEventListener("input", () => {
        inputAccount = sync.status().accountId;
      }), form.append(
        node("p", "\u8BF7\u5148\u767B\u5F55\u4E3B\u8D26\u53F7\uFF0C\u518D\u7C98\u8D34\u670D\u52A1\u5668\u7BA1\u7406\u9875\u751F\u6210\u7684\u51ED\u636E\u3002\u66F4\u6362\u670D\u52A1\u5668\u540E\u53EF\u7528\u5B83\u63A5\u7EED\u5DF2\u8FC1\u79FB\u7684\u5386\u53F2\u3002", "muted"),
        secret.wrapper,
        act(action, async () => {
          await sync.bindPrivateCredential(secret.control.value), secret.control.value = "", say("\u79C1\u6709\u670D\u52A1\u5668\u7ED1\u5B9A\u6210\u529F");
        }, !0)
      ), { form, clearFor(account) {
        inputAccount !== account && (secret.control.value = "");
      } };
    }
    let credentialBinding = credentialForm("\u540C\u610F\u5E76\u4F7F\u7528\u51ED\u636E\u7ED1\u5B9A"), fourDigitButton = act("\u56DB\u4F4D\u7801", () => selectPrivate("pin")), credentialButton = act("\u4E3B\u8D26\u53F7\u51ED\u636E", () => selectPrivate("credential"));
    function selectPrivate(mode) {
      fourDigit.hidden = mode !== "pin", credentialBinding.form.hidden = mode !== "credential", fourDigitButton.setAttribute("aria-pressed", String(mode === "pin")), credentialButton.setAttribute("aria-pressed", String(mode === "credential")), say("");
    }
    ways.append(fourDigitButton, credentialButton), fourDigit.append(act("\u751F\u6210\u56DB\u4F4D\u914D\u5BF9\u7801", async () => {
      request.control.value = await sync.generate(address.control.value.trim() || address.control.placeholder), request.wrapper.hidden = !1, say("\u5728\u7BA1\u7406\u9875\u8F93\u5165\u6B64\u7801\uFF0C5 \u5206\u949F\u5185\u6709\u6548");
    }), request.wrapper, credential.wrapper, act("\u540C\u610F\u5E76\u7ED1\u5B9A\u79C1\u6709\u670D\u52A1\u5668", async () => {
      await sync.bind(credential.control.value.trim()), credential.control.value = request.control.value = "", request.wrapper.hidden = !0, say("\u79C1\u6709\u670D\u52A1\u5668\u7ED1\u5B9A\u6210\u529F");
    }, !0), details("\u66F4\u6539\u79C1\u6709\u670D\u52A1\u5668\u5730\u5740", address.wrapper)), privateFields.append(node("p", privateConsent, "muted"), ways, fourDigit, credentialBinding.form), privatePanel.append(privateSetup, privateFields, joining);
    let server = serverAddress("\u516C\u5171\u670D\u52A1\u5668\u5730\u5740\u6216\u9080\u8BF7\u7801", "https://sync.example.com:8888"), restore = input("\u516C\u5171\u6062\u590D\u51ED\u636E", "textarea"), publicBinding = node("div", "", "sync-stack"), publicConsent = "\u670D\u52A1\u5668\u7BA1\u7406\u5458\u53EF\u89C1\u7528\u6237\u7801\u3001\u6635\u79F0\u548C\u8BB0\u5F55\u7F16\u53F7\u3002\u8D26\u672C\u3001\u6218\u7EE9\u548C\u5907\u4EFD\u5185\u5BB9\u5728\u5DE5\u5177\u7BB1\u52A0\u5BC6\u3002", testPanel = node("section", "", "sync-stack sync-test"), testButton = act("\u53C2\u52A0\u4E91\u540C\u6B65\u7070\u6D4B", async () => {
      await sync.bindTest(), say("\u5DF2\u7ED1\u5B9A\u4E91\u540C\u6B65\u6D4B\u8BD5\u670D\u52A1\u5668");
    }, !0);
    testButton.dataset.syncBindTest = "", testPanel.append(node("h3", "\u4E91\u540C\u6B65\u7070\u6D4B"), node("p", TEST_NOTICE, "muted"), testButton), publicBinding.append(
      node("p", publicConsent, "muted"),
      server.wrapper,
      node("p", "\u9996\u6B21\u7ED1\u5B9A\u8BF7\u586B\u5199\u7BA1\u7406\u5458\u63D0\u4F9B\u7684\u5730\u5740\u6216\u4E00\u6B21\u6027\u9080\u8BF7\u7801\u3002\u5DF2\u767B\u8BB0\u8D26\u53F7\u53EF\u76F4\u63A5\u586B\u5199\u5730\u5740\u7ED1\u5B9A\u65B0\u8BBE\u5907\u3002", "muted"),
      act("\u540C\u610F\u5E76\u7ED1\u5B9A\u516C\u5171\u670D\u52A1\u5668", async () => {
        await sync.bindPublic(server.control.value.trim()), server.control.value = "", say("\u516C\u5171\u670D\u52A1\u5668\u7ED1\u5B9A\u6210\u529F");
      }, !0),
      details(
        "\u5728\u65B0\u8BBE\u5907\u6062\u590D\u516C\u5171\u8D26\u53F7",
        node("p", "\u4F7F\u7528\u539F\u8BBE\u5907\u7684\u6062\u590D\u51ED\u636E\u63A5\u7EED\u4E91\u7AEF\u5386\u53F2\u3002\u76F4\u63A5\u7528\u5730\u5740\u7ED1\u5B9A\u4F1A\u521B\u5EFA\u72EC\u7ACB\u5B58\u50A8\u3002", "muted"),
        restore.wrapper,
        act("\u6062\u590D\u516C\u5171\u7ED1\u5B9A", async () => {
          await sync.bindPublic(server.control.value.trim(), restore.control.value), server.control.value = "", restore.control.value = "", say("\u516C\u5171\u7ED1\u5B9A\u5DF2\u6062\u590D");
        })
      )
    ), publicPanel.append(testPanel, publicBinding), pairing.append(chooser, privatePanel, publicPanel);
    let privateActions = node("div", "", "sync-stack"), publicActions = node("div", "", "sync-stack"), share = readout("\u8D26\u672C\u4E0E\u6218\u7EE9\u67E5\u770B\u94FE\u63A5"), prepared = readout("\u8F6C\u6362\u7528\u7684\u516C\u5171\u6062\u590D\u51ED\u636E", "textarea"), addressUpdate = input("\u5730\u5740\u66F4\u65B0\u7801", "textarea"), recovery = readout("\u516C\u5171\u6062\u590D\u51ED\u636E", "textarea"), publicShare = readout("\u516C\u5171\u5206\u4EAB\u51ED\u636E", "textarea"), password = readout("\u6211\u7684\u516D\u4F4D\u67E5\u770B\u7801"), publicLink = readout("\u516C\u5171 HTTPS \u5206\u4EAB\u94FE\u63A5", "textarea"), testBoundNotice = node("p", TEST_NOTICE, "notice");
    short(password.control, 6);
    let publicMigration = details(
      "\u51C6\u5907\u8F6C\u4E3A\u516C\u5171\u6A21\u5F0F",
      node("p", "\u7BA1\u7406\u5458\u914D\u7F6E HTTPS \u540E\uFF0C\u5728\u8FD9\u91CC\u751F\u6210\u5386\u53F2\u7684\u52A0\u5BC6\u526F\u672C\u3002\u7BA1\u7406\u9875\u786E\u8BA4\u8F6C\u6362\u540E\uFF0C\u518D\u542F\u7528\u516C\u5171\u8FDE\u63A5\u3002\u8BF7\u5907\u4EFD\u751F\u6210\u7684\u6062\u590D\u51ED\u636E\u3002", "muted"),
      node("p", publicConsent, "muted"),
      act("\u51C6\u5907\u5F53\u524D\u8D26\u53F7\u7684\u52A0\u5BC6\u5386\u53F2", async () => {
        prepared.control.value = await sync.preparePublic(), prepared.wrapper.hidden = !1, say("\u52A0\u5BC6\u526F\u672C\u5DF2\u4E0A\u4F20\uFF0C\u8BF7\u5907\u4EFD\u6062\u590D\u51ED\u636E");
      }),
      prepared.wrapper,
      act("\u542F\u7528\u5DF2\u51C6\u5907\u7684\u516C\u5171\u8FDE\u63A5", async () => {
        await sync.usePrepared(), say("\u5DF2\u542F\u7528\u516C\u5171\u52A0\u5BC6\u540C\u6B65");
      })
    );
    async function removeInstallation() {
      window2.confirm("\u89E3\u9664\u540E\uFF0C\u6B64\u8BBE\u5907\u5C06\u505C\u6B62\u540C\u6B65\uFF0C\u670D\u52A1\u5668\u4E0A\u7684\u5386\u53F2\u548C\u5176\u4ED6\u8BBE\u5907\u7EE7\u7EED\u53EF\u7528\u3002\u7EE7\u7EED\uFF1F") && (await sync.detachPrivate(), say("\u5DF2\u89E3\u9664\u5B89\u88C5\u7ED1\u5B9A"));
    }
    let detach = act("\u89E3\u9664\u6B64\u6D4F\u89C8\u5668\u6216\u5FAE\u7AEF", removeInstallation), detachInactive = act("\u89E3\u9664\u6B64\u6D4F\u89C8\u5668\u6216\u5FAE\u7AEF", removeInstallation);
    privatePanel.append(detachInactive);
    let rebind = credentialForm("\u540C\u610F\u5E76\u91CD\u65B0\u7ED1\u5B9A");
    privateActions.append(
      node("p", "\u62FF\u5230\u79C1\u6709\u67E5\u770B\u94FE\u63A5\u7684\u4EBA\u53EF\u4EE5\u76F4\u63A5\u67E5\u770B\u8BE5\u8D26\u53F7\u7684\u8BB0\u5F55\u3002", "muted"),
      act("\u590D\u5236\u5F53\u524D\u8D26\u53F7\u67E5\u770B\u94FE\u63A5", async () => copy2(await sync.previewLink(), share)),
      share.wrapper,
      details("\u670D\u52A1\u5668\u5730\u5740\u53D8\u66F4", addressUpdate.wrapper, act("\u9A8C\u8BC1\u5E76\u66F4\u65B0\u5730\u5740", async () => {
        await sync.update(addressUpdate.control.value), addressUpdate.control.value = "", say("\u540C\u6B65\u5730\u5740\u5DF2\u66F4\u65B0");
      })),
      details("\u4F7F\u7528\u4E3B\u8D26\u53F7\u51ED\u636E\u91CD\u65B0\u7ED1\u5B9A", rebind.form),
      publicMigration,
      detach
    ), publicActions.append(
      testBoundNotice,
      node("p", "\u7BA1\u7406\u5458\u5141\u8BB8\u5206\u4EAB\u65F6\uFF0C\u63A5\u6536\u4EBA\u53EF\u5728\u6D4F\u89C8\u5668\u6253\u5F00 HTTPS \u94FE\u63A5\u5E76\u8F93\u5165\u516D\u4F4D\u67E5\u770B\u7801\u3002\u8BF7\u5206\u5F00\u53D1\u9001\u3002", "muted"),
      act("\u590D\u5236\u516C\u5171\u5206\u4EAB\u94FE\u63A5", async () => copy2(await sync.viewLink(), publicLink), !0),
      publicLink.wrapper,
      act("\u663E\u793A\u516D\u4F4D\u67E5\u770B\u7801", () => {
        password.wrapper.hidden = !password.wrapper.hidden;
      }),
      password.wrapper,
      details(
        "\u5176\u4ED6\u516C\u5171\u51ED\u636E",
        act("\u590D\u5236\u516C\u5171\u5206\u4EAB\u51ED\u636E", () => copy2(sync.viewCode(), publicShare)),
        publicShare.wrapper,
        act("\u590D\u5236\u516C\u5171\u6062\u590D\u51ED\u636E", () => copy2(sync.recoveryCode(), recovery)),
        recovery.wrapper
      ),
      details(
        "\u8865\u767B\u6216\u66F4\u65B0\u540E\u53F0\u8D26\u53F7\u8D44\u6599",
        node("p", "\u5DF2\u7ED1\u5B9A\u7684\u8D26\u53F7\u53EF\u4EE5\u628A\u5F53\u524D\u7528\u6237\u7801\u548C\u6635\u79F0\u8865\u767B\u5230\u670D\u52A1\u5668\u540E\u53F0\uFF0C\u4F9B\u7BA1\u7406\u5458\u8BC6\u522B\u3002", "muted"),
        act("\u540C\u610F\u5E76\u66F4\u65B0\u8D26\u53F7\u8D44\u6599", async () => {
          await sync.updatePublicProfile(), say("\u540E\u53F0\u8D26\u53F7\u8D44\u6599\u5DF2\u66F4\u65B0");
        })
      ),
      act("\u65AD\u5F00\u5F53\u524D\u8D26\u53F7", async () => {
        window2.confirm("\u8BF7\u5148\u4FDD\u5B58\u516C\u5171\u6062\u590D\u51ED\u636E\u3002\u65AD\u5F00\u5F53\u524D\u8D26\u53F7\uFF1F") && (await sync.disconnect(), say("\u5F53\u524D\u8D26\u53F7\u5DF2\u65AD\u5F00"));
      })
    ), connected.append(privateActions, publicActions);
    let readCode = input("\u63A5\u6536\u7684\u516C\u5171\u5206\u4EAB\u51ED\u636E", "textarea"), readPass = input("\u516D\u4F4D\u67E5\u770B\u7801");
    short(readPass.control, 6), readPass.control.type = "password", readPass.control.name = "sgs-sync-view-code";
    let rows = node("ul", "", "sync-preview-rows"), result = node("div", "", "sync-stack"), count = node("p", "", "muted"), filters = node("div", "", "sync-actions"), pager = node("div", "", "sync-actions"), snapshot, page = 0, stream = "events", streamButton = (kind) => act(kind === "events" ? "\u8D26\u672C\u6D41\u6C34" : "\u5BF9\u5C40\u6218\u7EE9", () => {
      stream = kind, page = 0, draw();
    }), events = streamButton("events"), matches = streamButton("matches"), prev = act("\u4E0A\u4E00\u9875", () => {
      page--, draw();
    }), next = act("\u4E0B\u4E00\u9875", () => {
      page++, draw();
    });
    filters.append(events, matches), pager.append(prev, next), result.append(filters, count, rows, pager), result.hidden = !0;
    function draw() {
      if (!snapshot) return;
      let records = (stream === "events" ? [...snapshot.ledger.events] : [...snapshot.matches]).sort((a, b) => (b.at ?? b.endedAt) - (a.at ?? a.endedAt));
      events.setAttribute("aria-pressed", String(stream === "events")), matches.setAttribute("aria-pressed", String(stream === "matches"));
      let perPage = 20, pages = Math.max(1, Math.ceil(records.length / perPage));
      page = Math.max(0, Math.min(page, pages - 1)), prev.hidden = !page, next.hidden = page + 1 >= pages, count.textContent = records.length ? `${records.length} \u6761 \xB7 \u7B2C ${page + 1} / ${pages} \u9875` : "\u6682\u65E0\u8BB0\u5F55", rows.replaceChildren(...records.slice(page * perPage, (page + 1) * perPage).map((row) => {
        let element = node("li");
        return element.append(node("p", publicRecordText(stream, row)), node("p", new Date(row.at ?? row.endedAt).toLocaleString() + " \xB7 " + (row.id ?? row.gameId), "muted")), element;
      }));
    }
    let readNotice = node("p", "", "notice error");
    readNotice.setAttribute("role", "status"), readNotice.hidden = !0;
    let viewForm = node("form", "", "sync-stack");
    viewForm.autocomplete = "off", viewForm.addEventListener("submit", (event) => event.preventDefault()), viewForm.append(
      readCode.wrapper,
      readPass.wrapper,
      act("\u89E3\u5BC6\u5E76\u67E5\u770B", async () => {
        result.hidden = !0, readNotice.hidden = !0;
        try {
          snapshot = await sync.previewPublic(readCode.control.value, readPass.control.value);
        } catch (error) {
          readNotice.textContent = error.message, readNotice.hidden = !1;
          return;
        }
        readPass.control.value = "", page = 0, draw(), result.hidden = !1;
      }, !0),
      readNotice,
      result
    );
    let viewer = details("\u67E5\u770B\u4ED6\u4EBA\u5206\u4EAB\u7684\u8BB0\u5F55", viewForm), bindingIdentity, checkedTestAccount, disposed = !1;
    function refresh() {
      if (disposed) return;
      let status = sync.status(), text3 = status.connected ? status.testing ? "\u5F53\u524D\u8D26\u53F7\u5DF2\u7ED1\u5B9A\u4E91\u540C\u6B65\u6D4B\u8BD5\u670D\u52A1\u5668" : status.public ? "\u5F53\u524D\u8D26\u53F7\u5DF2\u7ED1\u5B9A\u516C\u5171\u670D\u52A1\u5668" : "\u5F53\u524D\u8D26\u53F7\u5DF2\u7ED1\u5B9A\u79C1\u6709\u670D\u52A1\u5668" : status.signedIn ? "\u5F53\u524D\u8D26\u53F7\u5C1A\u672A\u7ED1\u5B9A" : "\u767B\u5F55\u6E38\u620F\u540E\u53EF\u7ED1\u5B9A\u540C\u6B65\u670D\u52A1";
      state.textContent !== text3 && (state.textContent = text3), pairing.hidden = status.connected, privatePanel.hidden = selectedMode !== "private", privateFields.hidden = !status.signedIn, publicPanel.hidden = selectedMode !== "public", publicBinding.hidden = !status.signedIn, testPanel.hidden = !status.testAvailable, testBoundNotice.hidden = !status.testing, selectedMode === "public" && status.signedIn && !status.connected && !status.testAvailable && checkedTestAccount !== status.accountId && sync.loadTestEligibility && (checkedTestAccount = status.accountId, sync.loadTestEligibility().then(refresh, () => {
      }));
      let publicSection = status.connected ? publicActions : publicPanel;
      if (viewer.parentElement !== publicSection && publicSection.append(viewer), preferencePanel.hidden = !preferences || !status.connected, preferences) {
        restorePreferences.disabled = preferences.busy, backupError.hidden = !preferences.error, backupError.textContent !== preferences.error && (backupError.textContent = preferences.error);
        let hint = status.public ? "\u5907\u4EFD\u5728\u5DE5\u5177\u7BB1\u52A0\u5BC6\u540E\u4E0A\u4F20\u3002" : "\u79C1\u6709\u670D\u52A1\u5668\u53EF\u8BFB\u53D6\u5907\u4EFD\u3002HTTP \u4F20\u8F93\u672A\u7ECF\u52A0\u5BC6\u3002";
        preferenceNotice.textContent !== hint && (preferenceNotice.textContent = hint);
      }
      connected.hidden = !status.connected, joining.hidden = !status.signedIn || !status.privatePair;
      let info = status.joinError || "\u6B64\u8BBE\u5907\u4F1A\u81EA\u52A8\u68C0\u67E5\u5F53\u524D\u8D26\u53F7\u7684\u79C1\u6709\u7ED1\u5B9A\u3002";
      if (joining.textContent !== info && (joining.textContent = info), privateActions.hidden = status.public, publicActions.hidden = !status.public, detach.hidden = !status.privatePair, detachInactive.hidden = !status.signedIn || !status.privatePair || !status.joinError, credentialBinding.clearFor(status.accountId), rebind.clearFor(status.accountId), bindingIdentity !== status.bindingIdentity) {
        bindingIdentity = status.bindingIdentity;
        for (let output of [share, prepared, recovery, publicShare, publicLink, password])
          output.wrapper.hidden = !0, output.control.value = "";
      }
      password.control.value !== status.password && (password.control.value = status.password);
    }
    root.append(style2, state, pairing, preferencePanel, notice, connected), select(initialMode), selectPrivate("pin"), refresh(), sync.ready.then(refresh, (error) => say(error.message, !0));
    let timer = window2.setInterval(refresh, 1e3);
    return { root, dispose() {
      disposed = !0, window2.clearInterval(timer);
    } };
  }
  var feedbackIcon = { paths: ["M20 16h-8l-5 4v-4H4V4h16z", "M8 8h8M8 12h6"] }, cloudOffIcon = { paths: ["M8.5 6.5A5.5 5.5 0 0 1 18 10a4 4 0 0 1 2.6 6.9M16 18H6a4 4 0 0 1-1.2-7.8", "M3 3l18 18"] }, categories = [["game", "\u724C\u5C40"], ["automation", "\u81EA\u52A8"], ["tools", "\u5DE5\u5177"], ["manage", "\u7BA1\u7406"], ["info", "\u4FE1\u606F"]], FONT_SIZES = [["tiny", "\u7279\u5C0F", -2], ["small", "\u5C0F", -1], ["standard", "\u6807\u51C6", 0], ["large", "\u5927", 2]], COMPACT_OPACITIES = [60, 80, 100], DEFAULT_COMPACT_OPACITY = 80, scaleFonts = (css) => css.replace(/(font:\s*(?:\d+\s+)?)(\d+)px/g, (_, prefix3, size) => `${prefix3}calc(${size}px + var(--sgs-font-offset, 0px))`).replace(/font-size:\s*(\d+)px/g, (_, size) => `font-size:calc(${size}px + var(--sgs-font-offset, 0px))`), style = `

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
.tabs.management-tabs button{flex:1 0 auto;min-width:0;padding-left:4px;padding-right:4px;white-space:nowrap}
.market-update-actions{margin-bottom:8px}.market-update-actions button{display:inline-flex;align-items:center;gap:4px;min-height:29px}
.market-update-actions button:first-child{color:var(--sgs-accent);border-color:color-mix(in srgb,var(--sgs-accent) 45%,var(--sgs-border))}
.market-update-actions svg{width:14px;height:14px;flex:none}.market-auto-update>span{font-size:12px}
label.row[data-market-list-filter][hidden]{display:none}
.plugin-toggle .plugin-placeholder-state{flex:none;color:var(--sgs-muted);font-size:10px}.plugin-toggle .plugin-placeholder-state.error{color:var(--sgs-danger)}
.plugin-toggle[data-market-placeholder] .plugin-chevron{transform:rotate(-90deg)}
.custom-card-backs{margin:14px 0 0;padding-top:12px;border-top:1px solid var(--sgs-border)}
.custom-card-backs-heading{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:6px 10px}
.custom-card-backs-heading h4{margin:0;font-size:13px}
.custom-card-backs-heading button{min-width:68px;min-height:34px;color:var(--sgs-accent)}
.custom-card-back-list{display:grid;gap:6px;margin:0;padding:0;border:0;min-inline-size:0}
.custom-card-back-row{display:grid;grid-template-columns:minmax(0,1fr) 34px;gap:6px;align-items:center}
.custom-card-back-row .custom-card-back-option{display:flex;align-items:center;gap:8px;padding:4px 8px;min-width:0;text-align:left}
.custom-card-back-option img{width:30px;height:auto;aspect-ratio:93/130;flex:none;border-radius:3px}
.custom-card-back-name{min-width:0;overflow:hidden;text-overflow:ellipsis}
.custom-card-back-row .custom-card-back-option[aria-pressed=true]{border-color:var(--sgs-accent);box-shadow:inset 2px 0 var(--sgs-accent);background:var(--sgs-raised)}
.custom-card-back-selected{margin-left:auto;color:var(--sgs-accent)}
.custom-card-back-row .custom-card-back-remove{display:grid;place-items:center;width:34px;height:36px;padding:0;color:var(--sgs-muted)}
.custom-card-back-row .custom-card-back-remove:hover:not(:disabled){color:var(--sgs-danger);border-color:var(--sgs-danger)}
.custom-card-backs .custom-card-back-error{color:var(--sgs-danger);overflow-wrap:anywhere}
.custom-card-faces{margin-top:9px;padding:9px 0;border-bottom:1px solid var(--sgs-border)}
.custom-card-face-fields{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px}
.custom-card-face-fields input[type=search]{grid-column:1/-1;width:100%}
.custom-card-face-fields.is-background{grid-template-columns:minmax(0,1fr)}
.custom-card-face-fields.is-background button{grid-column:1;justify-self:start}
.custom-card-face-fields .sgs-select,.custom-card-face-fields button{height:34px}
.custom-card-face-fields button{color:var(--sgs-accent)}
.card-face-catalog{margin:10px 0;padding:0 9px 4px;border:1px solid var(--sgs-border);border-radius:8px;background:var(--sgs-surface)}
.card-face-catalog[open]{padding-bottom:9px}
.card-face-catalog .sgs-select,.card-face-catalog .sgs-input{width:100%;min-width:0;margin:0 0 6px}
.card-face-catalog-preview{text-align:center}
.card-face-catalog-preview canvas{display:block;width:min(135px,100%);height:auto;margin:4px auto;border-radius:8px;box-shadow:0 3px 12px #0005}
.card-face-catalog .card-face-catalog-error{color:var(--sgs-danger);white-space:pre-wrap;overflow-wrap:anywhere}
.custom-card-face-preview:not([hidden]){display:grid;grid-template-columns:34px minmax(0,1fr) 36px;gap:8px;align-items:center;margin-top:8px;color:var(--sgs-muted);font-size:11px}
.custom-card-face-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.custom-card-face-preview img{width:34px;aspect-ratio:135/190;border-radius:3px}
.custom-card-face-preview button{display:grid;place-items:center;padding:0;height:36px;color:var(--sgs-muted)}
.custom-card-face-preview button:hover:not(:disabled){color:var(--sgs-danger);border-color:var(--sgs-danger)}
.custom-card-faces .custom-card-face-error{color:var(--sgs-danger);overflow-wrap:anywhere}
.card-style-workshop summary{cursor:pointer;color:var(--sgs-accent);padding:8px 0;font-size:12px;min-height:34px}.card-style-workshop summary:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}.card-style-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.card-style-choices button{min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;padding:7px 6px;font-size:11px;line-height:1.35;white-space:normal;text-align:center;overflow-wrap:anywhere}.card-style-choices button>span:last-child{max-width:100%;overflow-wrap:anywhere}.card-style-choices button[aria-pressed=true]{border-color:var(--sgs-accent);box-shadow:inset 3px 0 var(--sgs-accent);background:color-mix(in srgb,var(--sgs-accent) 12%,var(--sgs-surface))}.card-style-preview{display:flex;gap:4px;width:100%;justify-content:center}.card-style-preview canvas,.card-style-preview img{width:43%;max-width:64px;height:auto;aspect-ratio:93/130;border-radius:3px}.card-style-workshop p{margin:8px 0}

.core-upgrade-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.core-upgrade-actions a{font-size:10px}.core-upgrade-actions button{display:inline-flex;align-items:center;gap:4px;min-height:29px;padding:4px 8px;font-size:11px}.core-upgrade-actions button svg{width:14px;height:14px;flex:none}.core-upgrade-refresh{display:inline-flex;align-items:center;gap:5px;flex:none;margin-left:auto;padding:5px;font-size:10px;color:var(--sgs-accent);border-color:color-mix(in srgb,var(--sgs-accent) 40%,var(--sgs-border));background:color-mix(in srgb,var(--sgs-accent) 8%,var(--sgs-surface))}.core-upgrade-reminder{margin-top:6px;padding-left:8px;border-left:2px solid var(--sgs-accent);font-size:11px;color:var(--sgs-muted);overflow-wrap:anywhere}

.plugin-body .skin-entry{margin:0;padding:0;border:0;background:none}.plugin-body .skin-entry>h3{display:none}.plugin-body .reward-heading h3 .sgs-line-icon{display:none}.plugin-body .reward-heading h3,.plugin-body .sgs-effects h3{font-size:11px;font-weight:400;color:var(--sgs-muted)}
:host{all:initial;position:fixed;top:72px;right:24px;width:280px;min-width:248px;max-width:420px;z-index:2147483000;color:var(--sgs-text);font:13px/1.55 var(--sgs-font);color-scheme:var(--sgs-scheme,dark)}
*{box-sizing:border-box}button,input,select{font:inherit}button{white-space:nowrap} :host{-webkit-text-size-adjust:100%;text-size-adjust:100%}.settings-group .actions{align-items:center}.settings-group .actions>span{display:inline-flex;flex:none}.settings-group label.row>span{flex-shrink:1}button{cursor:pointer}button:disabled{cursor:wait;opacity:.5}button,input,select{color:var(--sgs-text);background:var(--sgs-surface);border:1px solid var(--sgs-border);border-radius:7px;padding:6px 9px}button:hover{background:var(--sgs-raised);border-color:var(--sgs-accent)}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}a{color:var(--sgs-accent)}
:host([data-mobile][data-edge-docked]) .shell,:host([data-mobile][data-edge-docked]) .content{touch-action:pan-y}:host([data-mobile][data-edge-hidden]) .shell{visibility:hidden}.edge-tab{display:none}:host([data-mobile][data-edge-docked][data-edge-hidden]){transform:translateX(calc(100% - 48px))}:host([data-mobile][data-edge-hidden]) .edge-tab{display:block;position:absolute;left:0;top:0;z-index:20;width:48px;height:100%;min-height:160px;padding:0;border-radius:7px 0 0 7px;background:var(--sgs-bg);color:var(--sgs-accent);font-size:26px;touch-action:pan-y}.shell{position:relative;background-color:var(--sgs-bg);background-image:var(--sgs-backdrop,none);border:1px solid var(--sgs-border);border-radius:var(--sgs-radius);box-shadow:0 16px 48px #0006;overflow:hidden;resize:horizontal;min-width:248px;max-width:420px;width:100%}
:host([data-theme-textured]:not([data-collapsed])) .shell::before{content:'';position:absolute;pointer-events:none;top:0;left:16px;right:16px;height:1px;z-index:1;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--sgs-accent) 48%,transparent),color-mix(in srgb,var(--sgs-accent2,var(--sgs-accent)) 52%,transparent),transparent)}
:host([data-theme-textured]) .nav{background-color:color-mix(in srgb,var(--sgs-surface) 78%,transparent);background-image:var(--sgs-card,none)}
:host([data-theme-textured]) .card{background-color:color-mix(in srgb,var(--sgs-surface) 84%,transparent);background-image:var(--sgs-card,none)}
:host([data-theme-textured]) .management-tabs{background-color:var(--sgs-bg)!important;background-image:var(--sgs-card,none)!important;box-shadow:0 5px 8px color-mix(in srgb,var(--sgs-bg) 88%,transparent)!important}
:host([data-theme-textured]) .nav button[aria-selected=true],:host([data-theme-textured]) .tabs button.active{background-image:linear-gradient(135deg,color-mix(in srgb,var(--sgs-accent) 20%,transparent),color-mix(in srgb,var(--sgs-accent2,var(--sgs-accent)) 10%,transparent))}
:host([data-theme-textured]) .settings-group h3::before{background:linear-gradient(var(--sgs-accent),var(--sgs-accent2,color-mix(in srgb,var(--sgs-accent) 30%,transparent)))}
.content.has-plugin-panels{min-height:0}.plugin-group{min-width:0}.plugin-group+.plugin-group{border-top:1px solid var(--sgs-border);margin-top:10px;padding-top:10px}.plugin-heading{margin:0;font-size:13px}.plugin-heading .plugin-toggle{display:flex;align-items:center;gap:9px;width:100%;min-height:36px;padding:6px 3px;border:0;border-radius:6px;background:transparent;box-shadow:none;text-align:left;color:var(--sgs-accent)}.plugin-heading .plugin-toggle:hover{background:color-mix(in srgb,var(--sgs-accent) 7%,transparent)}.plugin-toggle svg{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.plugin-toggle .plugin-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;letter-spacing:.5px}.plugin-toggle .plugin-chevron{width:15px;height:15px;color:var(--sgs-muted);transition:transform .16s}.plugin-toggle[aria-expanded=false] .plugin-chevron{transform:rotate(-90deg)}.plugin-body{padding:9px 2px 2px}.plugin-body[hidden]{display:none!important}:host([data-edge-docked]){left:auto!important;right:0!important;transition:transform 180ms ease;transform:translateX(0)}:host([data-edge-docked][data-edge-hidden]){transform:translateX(calc(100% - 5px));background:var(--sgs-bg);border-left:1px solid var(--sgs-accent);border-radius:5px 0 0 5px}:host([data-edge-hidden]) .shell{visibility:hidden}:host([data-edge-fixed]){transition:none;top:0!important;bottom:0!important;height:100vh;height:100dvh}:host([data-edge-fixed]) .shell{display:flex;flex-direction:column;height:100%;border-radius:0}:host([data-edge-fixed]) .shell>.brand,:host([data-edge-fixed]) .shell>.status,:host([data-edge-fixed]) .shell>.nav,:host([data-edge-fixed]) .shell>.footer,:host([data-edge-fixed]) .shell>.compact{flex-shrink:0}:host([data-edge-fixed]) .content{flex:1;min-height:0;max-height:none}.edge-resizer{display:none;position:absolute;left:0;bottom:0;width:22px;height:22px;z-index:12;color:var(--sgs-muted);cursor:ew-resize;touch-action:none;user-select:none;align-items:center;justify-content:center}.edge-resizer svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round}.edge-resizer:hover{color:var(--sgs-accent)}.edge-resizer:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:-3px}:host([data-edge-docked]) .shell{resize:none}:host([data-edge-docked]:not([data-collapsed]):not([data-edge-hidden])) .edge-resizer{display:flex}:host([data-edge-docked]) .footer{padding-left:25px}:host([data-edge-docked]:focus-visible){outline:2px solid var(--sgs-accent);outline-offset:-2px}
@media(prefers-reduced-motion:reduce){.plugin-toggle .plugin-chevron{transition:none}}
.brand{user-select:none;-webkit-user-select:none;display:flex;align-items:center;gap:8px;padding:12px 12px 8px;cursor:move;touch-action:none}.mark svg{width:21px;height:21px}.mark{display:grid;place-items:center;width:27px;height:27px;border:1px solid var(--sgs-accent);color:var(--sgs-accent);border-radius:7px;font-weight:bold}.brand small{display:block;font-size:9px;letter-spacing:2px;color:var(--sgs-muted)}.brand button svg{width:16px;height:24px}.footer [data-open-market]{display:flex;align-items:center;gap:4px}.footer [data-open-market] svg{width:12px;height:12px}.brand button{display:grid;place-items:center;margin-left:auto;font-size:16px;padding:0 7px;line-height:24px}.status{color:var(--sgs-muted);font-size:11px;padding:0 12px 9px;display:flex;align-items:center;gap:6px}.status[hidden]{display:none}.dot{width:5px;height:5px;background:var(--sgs-accent);border-radius:100%}
.nav{display:flex;gap:4px;padding:7px 9px;border-top:1px solid var(--sgs-border);border-bottom:1px solid var(--sgs-border);background:var(--sgs-surface)}.nav button{flex:1 1 0;min-width:0;display:flex;align-items:center;justify-content:center;gap:0;height:42px;padding:0;border-color:transparent;background:transparent;overflow:hidden;transition:flex-grow var(--sgs-motion) cubic-bezier(.2,.8,.2,1),background var(--sgs-motion),gap var(--sgs-motion)}.nav button svg{width:22px;height:22px;flex:none;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;transition:transform var(--sgs-motion)}.nav button span{max-width:0;opacity:0;white-space:nowrap;overflow:hidden;transition:max-width var(--sgs-motion),opacity var(--sgs-motion)}.nav button[aria-selected=true]{color:var(--sgs-accent);background:var(--sgs-raised)}.nav:has(button:focus-visible) button:not(:focus-visible) svg{transform:scale(.92)}.nav button:focus-visible{flex-grow:2.2;gap:5px;color:var(--sgs-accent);background:var(--sgs-raised)}.nav button:focus-visible svg{transform:scale(1.15)}.nav button:focus-visible span{max-width:32px;opacity:1}@media(hover:hover){.nav:has(button:hover) button:not(:hover):not(:focus-visible) svg{transform:scale(.92)}.nav button:hover{flex-grow:2.2;gap:5px;color:var(--sgs-accent);background:var(--sgs-raised)}.nav button:hover svg{transform:scale(1.15)}.nav button:hover span{max-width:32px;opacity:1}}
.content{padding:12px;max-height:65vh;min-height:200px;overflow:auto;scrollbar-width:thin}.footer{display:flex;justify-content:space-between;border-top:1px solid var(--sgs-border);padding:7px 12px;color:var(--sgs-muted);font-size:10px}.footer button{padding:0;border:0;background:none;font-size:10px;color:var(--sgs-muted)}.empty{text-align:center;padding:35px 12px;color:var(--sgs-muted)}.empty svg{width:32px;height:32px;fill:none;stroke:var(--sgs-accent);stroke-width:1.2;margin-bottom:12px}.empty strong{display:block;color:var(--sgs-text);font-size:14px;margin-bottom:7px}.tabs{display:flex;gap:4px;margin-bottom:13px}.tabs button{flex:1;padding:5px 2px;font-size:12px}.tabs button.active{border-color:var(--sgs-accent);color:var(--sgs-accent)}h3{font-size:13px;margin:15px 0 7px}h3:first-child{margin-top:0}.card{padding:10px;border:1px solid var(--sgs-border);border-radius:8px;margin-bottom:8px;background:var(--sgs-surface)}.card .title{display:flex;justify-content:space-between;gap:5px}.muted{color:var(--sgs-muted);font-size:11px}.actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.actions button{font-size:11px;padding:4px 7px}.notice{color:var(--sgs-muted);font-size:11px;overflow-wrap:anywhere;padding:7px 0}.error{color:var(--sgs-danger)}label.row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:10px 0}input[type=checkbox]{accent-color:var(--sgs-accent)}input.address{width:100%;font-size:11px}select{max-width:145px}.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);max-width:80vw;background:var(--sgs-raised);color:var(--sgs-text);padding:10px 16px;border:1px solid var(--sgs-border);border-radius:8px;box-shadow:0 4px 20px #0008;z-index:2147483647}
.toast[data-position=top]{top:22px;top:calc(22px + env(safe-area-inset-top, 0px));bottom:auto;box-sizing:border-box;max-width:min(36em,calc(100vw - 32px));text-align:center;overflow-wrap:anywhere;pointer-events:none}
:host([data-collapsed]) .nav,:host([data-collapsed]) .content,:host([data-collapsed]) .status,:host([data-collapsed]) .footer{display:none}:host([data-collapsed]) .brand{display:none}
.compact{display:none;align-items:center;height:38px;padding:0 7px 0 10px;cursor:grab;touch-action:none;white-space:nowrap;user-select:none;-webkit-user-select:none}.compact:active{cursor:grabbing}.compact .slash{display:flex;align-items:center;gap:9px;flex:1;min-width:0;height:100%;color:var(--sgs-accent)}.slash-seal{display:grid;place-items:center;flex:none;width:25px;height:27px;font:20px/1 "KaiTi","STKaiti","FangSong",serif;color:var(--sgs-accent);text-shadow:0 1px 1px #0009;background:radial-gradient(ellipse,color-mix(in srgb,var(--sgs-accent) 9%,transparent),transparent 72%)}.slash-reading{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;min-width:32px;height:34px}.slash-label{font:9px/10px var(--sgs-font);letter-spacing:1px;color:var(--sgs-muted)}.compact [data-slash]{font:600 21px/23px "Cambria","Georgia",serif;font-variant-numeric:tabular-nums;color:color-mix(in srgb,var(--sgs-accent) 42%,var(--sgs-text));text-shadow:0 1px 2px #0008;letter-spacing:.3px}.compact[data-count-state="empty"] [data-slash]{color:var(--sgs-muted)}.compact[data-count-state="unknown"] [data-slash]{color:var(--sgs-muted);font-size:19px}.compact[data-count-state="unlimited"] [data-slash]{font-size:24px}.compact[data-count-size="long"] [data-slash]{font-size:15px;letter-spacing:0}.compact-actions{display:flex;align-items:center;gap:1px;padding-left:6px;margin-left:6px;position:relative}.compact-actions::before{content:'';position:absolute;left:0;top:6px;bottom:6px;width:1px;background:linear-gradient(transparent,color-mix(in srgb,var(--sgs-accent) 30%,transparent),transparent)}.compact button{display:grid;place-items:center;flex:none;width:28px;height:30px;padding:5px;border:0;border-radius:7px;background:transparent;color:var(--sgs-muted);box-shadow:none;transition:background 140ms,color 140ms,transform 140ms}.compact button:hover{color:var(--sgs-text);background:linear-gradient(180deg,color-mix(in srgb,var(--sgs-accent) 13%,transparent),color-mix(in srgb,var(--sgs-accent) 4%,transparent))}.compact button:active{transform:translateY(1px);background:color-mix(in srgb,var(--sgs-accent) 15%,transparent)}.compact button:focus-visible{outline:1px solid var(--sgs-accent);outline-offset:-2px;background:color-mix(in srgb,var(--sgs-accent) 9%,transparent)}.compact svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.compact [data-expand] svg{width:16px;height:16px}
:host([data-collapsed]){width:156px!important;min-width:156px;max-width:156px}
:host([data-collapsed]) .shell{position:relative;isolation:isolate;width:100%!important;max-width:100%;min-width:0;resize:none;border:1px solid color-mix(in srgb,var(--sgs-border) 65%,transparent);border-radius:11px;background:transparent;box-shadow:0 3px 8px #0004,0 12px 28px #0002,inset 0 1px color-mix(in srgb,var(--sgs-text) 9%,transparent),inset 0 -1px #0005}
:host([data-collapsed]) .shell::after{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;opacity:var(--sgs-compact-opacity);background-color:var(--sgs-bg);background-image:var(--sgs-compact,linear-gradient(165deg,var(--sgs-raised) 0%,var(--sgs-bg) 40%,color-mix(in srgb,var(--sgs-bg) 82%,#000) 100%))}
:host([data-collapsed]) .shell::before{content:'';position:absolute;pointer-events:none;top:0;left:15px;right:15px;height:1px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--sgs-accent) 40%,transparent),color-mix(in srgb,var(--sgs-accent2,var(--sgs-accent)) 45%,transparent),transparent)}
:host([data-collapsed]) .compact{display:flex}

.compact-summary{display:none}:host([data-collapsed]) .compact-summary:not(:empty){display:grid;gap:3px;padding:6px 9px 8px;border-top:1px solid var(--sgs-border);max-height:35vh;overflow:auto}.compact-summary-row{display:flex;align-items:baseline;gap:6px;min-width:0;font-size:11px}.compact-summary-row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.compact-summary-row b{flex:none;color:var(--sgs-accent);font-variant-numeric:tabular-nums;font-weight:500}
.ui-icon{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.plugin-card{padding:11px 10px 9px;border-color:color-mix(in srgb,var(--sgs-border) 65%,transparent);position:relative}.plugin-heading{display:flex;align-items:center;gap:8px;min-width:0}.plugin-symbol{display:grid;place-items:center;flex:none;width:29px;height:29px;border-radius:8px;background:var(--sgs-raised);color:var(--sgs-accent)}.plugin-symbol svg{width:18px;height:18px;stroke-width:1.5}.plugin-name{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}.plugin-version{flex:none;font-size:10px;color:var(--sgs-muted);font-variant-numeric:tabular-nums}.plugin-description{margin:7px 0 9px;color:var(--sgs-muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.plugin-prerequisites{margin:-3px 0 9px;color:var(--sgs-muted);font-size:11px;line-height:1.5;overflow-wrap:anywhere}.plugin-bottom{display:flex;align-items:center;gap:6px;min-width:0}.plugin-status{display:flex;align-items:center;gap:4px;color:var(--sgs-muted);font-size:10px;white-space:nowrap}.plugin-status::before{content:'';width:5px;height:5px;border-radius:50%;background:currentColor}.plugin-status.is-running{color:var(--sgs-success,#a9cfac)}.plugin-status.is-error{color:var(--sgs-danger)}.plugin-tools{display:flex;align-items:center;gap:3px;margin-left:auto}.plugin-tools button{display:grid;place-items:center;width:27px;height:27px;padding:4px;border-color:transparent;background:transparent;color:var(--sgs-muted);border-radius:6px}.plugin-tools button:hover,.plugin-tools button:focus-visible{border-color:var(--sgs-border);background:var(--sgs-raised);color:var(--sgs-text)}.plugin-tools button.is-destructive:hover{color:var(--sgs-danger);border-color:var(--sgs-danger)}.plugin-tools button.is-enable{color:var(--sgs-success,#a9cfac)}.plugin-current{display:flex;align-items:center;color:var(--sgs-success,#a9cfac);margin-left:2px}.plugin-current svg{width:13px;height:13px}.plugin-card.has-update{border-color:var(--sgs-accent);box-shadow:inset 3px 0 var(--sgs-accent)}.plugin-card.has-error{border-color:var(--sgs-danger);box-shadow:inset 3px 0 var(--sgs-danger)}.plugin-update{margin-top:9px;padding:8px;background:color-mix(in srgb,var(--sgs-accent) 12%,transparent);border-radius:6px;color:var(--sgs-accent)}.plugin-update-info{display:flex;align-items:center;gap:5px;font-size:10px;overflow-wrap:anywhere}.plugin-update button{display:flex;align-items:center;justify-content:center;gap:5px;width:100%;margin-top:6px;padding:4px 6px;border-color:var(--sgs-accent);background:var(--sgs-accent);color:var(--sgs-bg);font-size:11px;font-weight:600}.plugin-error{margin-top:8px;padding:7px 8px;border-radius:6px;background:color-mix(in srgb,var(--sgs-danger) 12%,transparent);color:var(--sgs-danger);font-size:11px}.plugin-error summary{cursor:pointer;display:flex;align-items:center;gap:5px}.plugin-error summary span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.plugin-error summary::after{content:'\u8BE6\u60C5';margin-left:auto;flex:none;font-size:10px}.plugin-error[open] summary::after{content:'\u6536\u8D77'}.plugin-error pre{font:11px/1.6 var(--sgs-font);white-space:pre-wrap;overflow-wrap:anywhere;margin:7px 0 0}.nav button{position:relative}.nav .nav-alert{position:absolute;top:2px;right:3px;min-width:13px;height:13px;padding:0 3px;border-radius:7px;background:var(--sgs-accent);color:var(--sgs-bg);font:700 9px/13px system-ui;font-style:normal}.nav .nav-alert.is-error{background:var(--sgs-danger)}.plugin-search{display:block;width:100%;min-width:0;margin-top:9px;padding:8px 10px;background:var(--sgs-surface)}.plugin-search::placeholder{color:var(--sgs-muted);font-size:11px}.plugin-card[hidden],.plugin-search-empty[hidden]{display:none!important}.update-summary.has-update{color:var(--sgs-accent);font-weight:600}
/* Light palettes use crisp ink and softer depth rather than dark-theme shadows. */
:host([data-theme-scheme=light]){--sgs-success:#32613e}
:host([data-theme-scheme=light]) .slash-seal,:host([data-theme-scheme=light]) .compact [data-slash]{text-shadow:none}
:host([data-theme-scheme=light][data-collapsed]) .shell{box-shadow:0 3px 8px #0002,0 8px 20px #0001,inset 0 1px #fff8}
:host([data-theme-scheme=light][data-collapsed]) .shell::after{background-image:var(--sgs-compact,linear-gradient(165deg,var(--sgs-surface),var(--sgs-bg) 65%))}
${CONTROL_STYLES}
button{background:linear-gradient(180deg,color-mix(in srgb,var(--sgs-raised) 60%,var(--sgs-surface)),var(--sgs-surface));border-color:color-mix(in srgb,var(--sgs-border) 60%,transparent);box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-text) 4%,transparent);transition:background 140ms,border-color 140ms,color 140ms}button:active:not(:disabled){background:var(--sgs-bg)}button:disabled{cursor:not-allowed}.nav button,.footer button{box-shadow:none}.tabs{gap:2px;padding:3px;border-radius:8px;background:var(--sgs-surface);box-shadow:inset 0 1px 3px #0004}.tabs button{border:0;background:transparent;box-shadow:none;color:var(--sgs-muted);padding:6px 2px}.tabs button.active{background:linear-gradient(color-mix(in srgb,var(--sgs-accent) 17%,transparent),color-mix(in srgb,var(--sgs-accent) 7%,transparent));box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-accent) 14%,transparent);color:var(--sgs-accent)}
.settings-group{padding:11px 0 13px;border-bottom:1px solid color-mix(in srgb,var(--sgs-border) 35%,transparent)}.settings-group:last-child{border:0;padding-bottom:0}.settings-group h3{display:flex;align-items:center;gap:7px;margin:0 0 8px;color:var(--sgs-accent);font-size:12px;letter-spacing:.06em}.settings-group h3::before{content:'';width:3px;height:11px;border-radius:2px;background:linear-gradient(var(--sgs-accent),color-mix(in srgb,var(--sgs-accent) 30%,transparent))}.settings-group label.row{margin:0;padding:9px 0;min-height:36px;font-size:12px}.settings-group label.row>span{display:flex;align-items:center;flex:0 1 auto;min-width:0;white-space:nowrap}.settings-group .muted{font-size:10px;line-height:1.7;color:var(--sgs-muted)}.settings-group .row input.sgs-input{flex:1 1 96px;width:0!important;min-width:72px;max-width:142px}.settings-group .address{margin:5px 0 8px}.settings-group .actions{gap:6px}.settings-group .actions button,.settings-group>button{min-height:29px;font-size:11px;padding:4px 8px}.settings-group .actions .icon-action{display:grid;place-items:center;width:30px;padding:5px;color:var(--sgs-muted);background:transparent;border-color:transparent;box-shadow:none}.settings-group .actions .icon-action:hover{color:var(--sgs-accent);background:var(--sgs-raised)}.settings-group .row select{max-width:145px}.settings-group>select{width:100%;max-width:none}.settings-group .notice{font-size:10px;line-height:1.7}.settings-group button .sgs-line-icon{vertical-align:-3px;margin-right:5px}.settings-group button:has(.sgs-line-icon){font-size:11px}.settings-group [data-setting=screenshotHideUI]{flex:none}
.font-preview{margin-top:12px;padding:12px 0 12px 10px;border-left:2px solid var(--sgs-accent);line-height:1.6}.font-preview strong{font-size:13px}.font-preview p{font-size:12px;margin:5px 0}.font-settings .sgs-segments button{min-width:0;flex:1;padding:6px 2px}.brand-name{min-width:0;flex:1}.brand small{font-size:9px}.brand .mark{flex:none}.brand [data-collapse]{flex:none;margin-left:0}.brand [data-update-hint]{display:inline-flex;align-items:center;justify-content:center;gap:4px;flex:none;min-height:28px;margin:0;padding:4px 7px;border:1px solid color-mix(in srgb,var(--sgs-accent) 48%,var(--sgs-border));border-radius:7px;background:linear-gradient(180deg,color-mix(in srgb,var(--sgs-accent) 20%,var(--sgs-surface)),color-mix(in srgb,var(--sgs-accent) 10%,var(--sgs-bg)));box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-accent) 20%,transparent),0 2px 4px #0002;color:var(--sgs-accent);font-size:11px;font-weight:600;line-height:18px;cursor:pointer;white-space:nowrap;transition:background 140ms,border-color 140ms,box-shadow 140ms,transform 140ms}.brand [data-update-hint] svg{width:13px;height:13px;flex:none;stroke-width:1.8}.brand [data-update-hint][hidden]{display:none}.brand [data-update-hint]:hover{border-color:var(--sgs-accent);background:linear-gradient(180deg,color-mix(in srgb,var(--sgs-accent) 30%,var(--sgs-surface)),color-mix(in srgb,var(--sgs-accent) 17%,var(--sgs-bg)));box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-accent) 28%,transparent),0 3px 7px #0003;transform:translateY(-1px)}.brand [data-update-hint]:active{transform:translateY(0);box-shadow:inset 0 1px 3px #0003}.brand [data-update-hint]:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:3px}

.brand [data-feedback]{display:flex;align-items:center;justify-content:center;gap:4px;flex:none;min-height:28px;margin:0;padding:4px 6px;background:transparent;box-shadow:none;color:var(--sgs-muted);font-size:11px;line-height:18px;white-space:nowrap}
.brand [data-feedback] svg{width:14px;height:14px}
.brand [data-feedback]:hover,.brand [data-feedback]:focus-visible{color:var(--sgs-accent);border-color:var(--sgs-accent);background:var(--sgs-surface)}
.brand small{white-space:nowrap;letter-spacing:.6px}
.brand{gap:5px;padding-left:10px;padding-right:10px}.brand-name small{overflow:hidden;text-overflow:ellipsis}
.brand [data-sync-action]{flex:none;min-width:28px;height:28px;margin:0;padding:0 5px;color:var(--sgs-muted);box-shadow:none}
.brand [data-sync-action][hidden]{display:none}.brand [data-sync-action] svg{width:16px;height:16px}
.brand [data-sync-action]:hover:not(:disabled){color:var(--sgs-accent);border-color:var(--sgs-accent)}
.brand [data-sync-action]:disabled{opacity:.5}
:host([data-tight-brand]) .brand{gap:4px}
:host([data-tight-brand]) .brand [data-update-hint] span,:host([data-tight-brand]) .brand[data-sync-controls] [data-feedback] span{display:none}
:host([data-tight-brand]) .brand [data-update-hint],:host([data-tight-brand]) .brand [data-collapse],:host([data-tight-brand]) .brand[data-sync-controls] [data-feedback]{width:28px;padding-left:0;padding-right:0}
:host([data-tight-brand][data-sync-bound]) .brand.has-update .brand-name small{display:none}
${FEEDBACK_STYLES}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}@media(max-height:500px){.content{max-height:50vh}}
`;
  function createShell({ window: win, document: doc, settings, scope, getFeedbackAccount, canReserveGameViewport, sceneWatch, managedSync, preferenceSync, getStartupDiagnostics }) {
    let microUpdate = null, microUpdateBusy = !1, microUpdateError = "";
    async function runMicroUpdate(action) {
      microUpdateBusy = !0, microUpdateError = "", render();
      try {
        if (typeof win.__SGS_TOOLBOX_SCRIPT_UPDATE__ != "function") throw new Error("\u5F53\u524D\u5FAE\u7AEF\u63A5\u5165\u5C42\u5C1A\u4E0D\u652F\u6301\u811A\u672C\u66F4\u65B0\uFF0C\u8BF7\u5148\u5347\u7EA7\u63A5\u5165\u5C42\u4E00\u6B21\u3002");
        microUpdate = await win.__SGS_TOOLBOX_SCRIPT_UPDATE__(action), action === "check" && microUpdate.current && compareVersions2(microUpdate.current, CORE_VERSION) > 0 && (microUpdate = { ...microUpdate, version: microUpdate.current, pending: !0 }), microUpdate.pending && notify("\u811A\u672C\u5DF2\u4FDD\u5B58\uFF0C\u4E0B\u6B21\u6253\u5F00\u6E38\u620F\u65F6\u751F\u6548\uFF1B\u5F53\u524D\u724C\u5C40\u4E0D\u53D7\u5F71\u54CD\u3002");
      } catch (error) {
        microUpdateError = userErrorMessage(error);
      } finally {
        microUpdateBusy = !1, render();
      }
    }
    let pendingCoreUpgrade = settings.get("pendingCoreUpgrade", "");
    pendingCoreUpgrade && compareVersions2(CORE_VERSION, pendingCoreUpgrade) >= 0 && (pendingCoreUpgrade = "", settings.set("pendingCoreUpgrade", ""));
    let gameView = "battle", renderedKey = "", viewScroll = /* @__PURE__ */ new Map(), host = doc.createElement("div");
    host.dataset.sgsToolbox = "core";
    let shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<style>${scaleFonts(style)} .brand,.compact{--sgs-font-offset:0px}</style><section class="shell"><svg class="hud-locator" aria-hidden="true" focusable="false"><rect pathLength="100"/></svg><div class="compact" data-count-state="unknown"><span class="slash" title="\u5269\u4F59\u51FA\u6740\u6B21\u6570\u6682\u4E0D\u53EF\u7528\uFF1B\u53CC\u51FB\u5C55\u5F00\uFF0C\u6309\u4F4F\u62D6\u52A8"><span class="slash-seal" aria-hidden="true">\u6740</span><span class="slash-reading"><span class="slash-label">\u5269\u4F59</span><b data-slash aria-label="\u5269\u4F59\u51FA\u6740\u6B21\u6570\u6682\u4E0D\u53EF\u7528">\u2014</b></span></span><div class="compact-actions"><button data-screenshot title="\u622A\u56FE\u5E76\u590D\u5236" aria-label="\u622A\u56FE\u5E76\u590D\u5236"></button><button data-expand title="\u653E\u5927\u9762\u677F" aria-label="\u653E\u5927\u9762\u677F"></button></div></div><div class="compact-summary" aria-label="\u5173\u6CE8\u5361\u724C\u672A\u89C1\u5F20\u6570"></div><header class="brand"><div class="mark" aria-hidden="true"></div><div class="brand-name"><small>${EDITION.toUpperCase()} \xB7 ${CORE_VERSION}</small></div><button data-update-hint hidden title="\u6709\u66F4\u65B0\u53EF\u7528\uFF0C\u70B9\u51FB\u524D\u5F80\u66F4\u65B0" aria-label="\u6709\u66F4\u65B0\u53EF\u7528\uFF0C\u70B9\u51FB\u524D\u5F80\u66F4\u65B0"><span>\u66F4\u65B0</span></button><button data-collapse title="\u6298\u53E0\u9762\u677F" aria-label="\u6298\u53E0\u9762\u677F"></button></header><div class="status"><i class="dot"></i><span>\u7B49\u5F85\u6E38\u620F\u8FD0\u884C\u65F6</span></div><nav class="nav" role="tablist">${categories.map(([id, title]) => `<button data-category="${id}" role="tab" aria-label="${title}" aria-selected="false"><span>${title}</span></button>`).join("")}</nav><main class="content" role="tabpanel"></main><footer class="footer"><span>${EDITION === "dev" ? "\u5F00\u53D1\u7248" : EDITION === "lite" ? "\u8F7B\u91CF\u7248" : "\u5B8C\u6574\u7248"} ${CORE_VERSION}</span><button data-open-market title="\u6253\u5F00\u63D2\u4EF6\u5E02\u573A" aria-label="\u6253\u5F00\u63D2\u4EF6\u5E02\u573A">\u63D2\u4EF6\u5E02\u573A</button></footer></section>`;
    for (let [selector, name] of [[".mark", "toolbox"], ["[data-screenshot]", "camera"], ["[data-expand]", "expand"], ["[data-collapse]", "collapse"], ["[data-update-hint]", "refresh"], ["[data-open-market]", "package"]])
      shadow.querySelector(selector).prepend(createIcon(doc, name));
    for (let [id] of categories) shadow.querySelector('[data-category="' + id + '"]').prepend(createIcon(doc, id));
    let content = shadow.querySelector(".content"), active = settings.get("category", "game"), management = "market", renderedCleanup, handlers = {}, panels = /* @__PURE__ */ new Map(), toastTimer, pageFolds = /* @__PURE__ */ new Map();
    function bindPageFold(id, toggle, body, title, legacyCollapsed, { doubleClick = !1, onChange } = {}) {
      let pageKey = `openPluginGroup:${renderedKey}`, collapsedKey = `pluginCollapsed:${renderedKey}:${id}`, apply = (collapsed) => {
        let changed = body.hidden !== collapsed;
        body.hidden = collapsed, toggle.setAttribute("aria-expanded", String(!collapsed)), toggle.title = `${collapsed ? "\u5C55\u5F00" : "\u6536\u8D77"}${title}`, toggle.setAttribute("aria-label", toggle.title), changed && (onChange == null || onChange(!collapsed));
      };
      toggle.setAttribute("aria-controls", body.id);
      let selected = settings.get(pageKey);
      apply(selected === void 0 ? settings.get(collapsedKey, legacyCollapsed) === !0 : selected !== id), pageFolds.set(id, apply);
      let open = () => {
        settings.set(pageKey, id);
        for (let [peer, fold] of pageFolds) fold(peer !== id);
      };
      toggle.onclick = (event) => {
        doubleClick && event.detail > 1 || (body.hidden ? open() : (settings.get(pageKey) === void 0 ? settings.set(collapsedKey, !0) : settings.set(pageKey, null), apply(!0)));
      }, doubleClick && (toggle.ondblclick = open);
    }
    let feedbackForm = createFeedbackForm(win, doc, scope, getFeedbackAccount), feedbackButton = doc.createElement("button");
    feedbackButton.type = "button", feedbackButton.dataset.feedback = "", feedbackButton.title = "\u524D\u5F80\u53CD\u9988", feedbackButton.setAttribute("aria-label", "\u53CD\u9988");
    let feedbackLabel = doc.createElement("span");
    feedbackLabel.textContent = "\u53CD\u9988", feedbackButton.append(createIcon(doc, feedbackIcon), feedbackLabel), shadow.querySelector("[data-update-hint]").before(feedbackButton), scope.listen(feedbackButton, "click", () => {
      (active !== "manage" || management !== "settings") && (active = "manage", management = "settings", settings.set("category", active), render()), content.scrollTop = 0, feedbackForm.elements.message.focus({ preventScroll: !0 });
    });
    let syncMode = "private";
    function openSyncSettings() {
      syncMode = "public", active = "manage", management = "sync", settings.set("category", active), render(), content.scrollTop = 0;
    }
    if (managedSync && preferenceSync) {
      let refreshSyncButtons = function() {
        let { connected } = managedSync.status();
        upload.hidden = !connected, host.toggleAttribute("data-sync-bound", connected), upload.disabled = download2.disabled = preferenceSync.busy;
        let label = connected ? "\u4E0B\u8F7D\u5168\u90E8\u5907\u4EFD" : "\u4E91\u540C\u6B65\u672A\u542F\u7528\uFF0C\u6253\u5F00\u540C\u6B65\u8BBE\u7F6E";
        download2.title !== label && (download2.toggleAttribute("data-sync-download", connected), download2.toggleAttribute("data-sync-settings", !connected), download2.title = label, download2.setAttribute("aria-label", label), download2.replaceChildren(createIcon(doc, connected ? "arrowDown" : cloudOffIcon)));
      };
      feedbackButton.parentElement.dataset.syncControls = "";
      let upload = doc.createElement("button"), download2 = doc.createElement("button");
      upload.type = download2.type = "button", upload.dataset.syncAction = download2.dataset.syncAction = "", upload.dataset.syncUpload = "", upload.title = "\u4E0A\u4F20\u5230\u4E91\u7AEF", upload.setAttribute("aria-label", upload.title), upload.append(createIcon(doc, "arrowUp")), feedbackButton.before(upload, download2);
      async function transferFromHeader(transfer) {
        try {
          let pending = transfer();
          refreshSyncButtons();
          let message = await pending;
          message && notify(message);
        } catch (error) {
          notify(error.message);
        } finally {
          refreshSyncButtons();
        }
      }
      scope.listen(upload, "click", () => transferFromHeader(preferenceSync.upload)), scope.listen(download2, "click", () => managedSync.status().connected ? transferFromHeader(() => downloadSyncBackup(win, preferenceSync)) : openSyncSettings()), refreshSyncButtons(), managedSync.ready.then(refreshSyncButtons, () => {
      }), scope.interval(refreshSyncButtons, 500);
    }
    let applyFontSize = () => {
      let choice = FONT_SIZES.find(([id]) => id === settings.get("fontSize", "standard")) || FONT_SIZES[2];
      host.style.setProperty("--sgs-font-offset", `${choice[2]}px`);
    };
    applyFontSize();
    let getCompactOpacity = () => {
      let saved = settings.get("compactOpacity", DEFAULT_COMPACT_OPACITY);
      return COMPACT_OPACITIES.includes(saved) ? saved : DEFAULT_COMPACT_OPACITY;
    }, applyCompactOpacity = () => host.style.setProperty("--sgs-compact-opacity", String(getCompactOpacity() / 100));
    applyCompactOpacity();
    let scaleSheet = (node) => {
      if (node.nodeType === 1)
        for (let sheet of [...node.matches("style") ? [node] : [], ...node.querySelectorAll("style")]) {
          let scaled = scaleFonts(sheet.textContent);
          scaled !== sheet.textContent && (sheet.textContent = scaled);
        }
    };
    if (win.MutationObserver) {
      let observer = new win.MutationObserver((records) => {
        for (let record of records) {
          record.target.nodeType === 1 && record.target.matches("style") && scaleSheet(record.target);
          for (let node of record.addedNodes) scaleSheet(node);
        }
      });
      observer.observe(shadow, { childList: !0, subtree: !0 }), scope.add(() => observer.disconnect());
    }
    scope.listen(shadow.querySelector("[data-update-hint]"), "click", () => {
      active = "manage", management = "market", settings.set("category", active), render(), content.scrollTop = 0;
      let target = content.querySelector("[data-core-upgrade].has-update, .plugin-card.has-update");
      target == null || target.scrollIntoView({ block: "nearest" }), target == null || target.setAttribute("tabindex", "-1"), target == null || target.focus({ preventScroll: !0 });
    });
    let pluginSearch = "", marketPluginId = "", officialBusy = !1, officialStatus = "", bulkBusy = !1, bulkStatus = "", bulkFailures = [], autoUpdateKey = "marketAutoUpdate", onlyUninstalled = settings.get("marketOnlyUninstalled", !0) === !0, marketState = {}, marketRequest = 0, installing = /* @__PURE__ */ new Set(), dependencyPrompts = /* @__PURE__ */ new Map();
    function currentMarketState() {
      var _a2;
      let client = (_a2 = handlers.market) == null ? void 0 : _a2.call(handlers);
      return marketState.client !== client && (marketRequest++, marketState = { client }), marketState;
    }
    function openMarketForPlugin(id) {
      active = "manage", management = "market", settings.set("category", active), marketPluginId = pluginSearch = id, render(), fetchCatalog({ reuse: !0 }).then(() => {
        var _a2, _b2, _c;
        if (scope.closed || active !== "manage" || management !== "market" || marketPluginId !== id) return;
        let target = [...content.querySelectorAll("[data-catalog-key]")].find((card) => !card.hidden);
        target ? ((_a2 = target.querySelector("button:not(:disabled)")) == null || _a2.focus({ preventScroll: !0 }), (_b2 = target.scrollIntoView) == null || _b2.call(target, { block: "center" })) : (_c = content.querySelector(".plugin-search")) == null || _c.focus();
      });
    }
    let el = (tag, text3, cls) => {
      let n = doc.createElement(tag);
      return text3 !== void 0 && (n.textContent = text3), cls && (n.className = cls), n;
    }, button = (text3, fn) => {
      let n = el("button", text3);
      return n.addEventListener("click", async () => {
        n.disabled = !0;
        try {
          await fn();
        } catch (e) {
          notify(userErrorMessage(e));
        } finally {
          n.disabled = !1;
        }
      }), n;
    };
    function notify(message, options) {
      var _a2;
      (_a2 = shadow.querySelector(".toast")) == null || _a2.remove(), clearTimeout(toastTimer);
      let n = el("div", message, "toast");
      return (options == null ? void 0 : options.position) === "top" && (n.dataset.position = "top"), n.setAttribute("role", "status"), shadow.append(n), toastTimer = setTimeout(() => n.remove(), 6e3), () => {
        n.parentNode && (clearTimeout(toastTimer), n.remove());
      };
    }
    function empty(title, text3, icon2 = active) {
      let n = el("div", void 0, "empty");
      n.append(createIcon(doc, icon2)), n.append(el("strong", title), el("div", text3)), content.append(n);
    }
    async function exportDiagnostics() {
      var _a2;
      if (typeof handlers.exportDiagnostics != "function") throw new Error("\u8BB0\u724C\u8BCA\u65AD\u5C1A\u672A\u51C6\u5907\u597D");
      let json = await handlers.exportDiagnostics();
      if (scope.closed) return;
      if (typeof json != "string") throw new Error("\u8BCA\u65AD\u6570\u636E\u683C\u5F0F\u65E0\u6548");
      if (typeof ((_a2 = win.URL) == null ? void 0 : _a2.createObjectURL) != "function") throw new Error("\u5F53\u524D\u6D4F\u89C8\u5668\u6682\u4E0D\u652F\u6301\u8BCA\u65AD\u6587\u4EF6\u4E0B\u8F7D");
      let blob = new win.Blob([json], { type: "application/json;charset=utf-8" }), url = win.URL.createObjectURL(blob), link = doc.createElement("a"), release = scope.add(() => win.URL.revokeObjectURL(url));
      link.href = url, link.download = `\u4E09\u56FD\u6740OL\u5DE5\u5177\u7BB1-\u8BB0\u724C\u8BCA\u65AD-${CORE_VERSION}-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}.json`, link.hidden = !0, doc.documentElement.append(link);
      try {
        link.click(), notify("\u8BB0\u724C\u8BCA\u65AD\u5DF2\u5BFC\u51FA\u4E3AJSON \u6587\u4EF6\uFF0C\u672A\u4E0A\u4F20\u3002");
      } finally {
        link.remove(), scope.timeout(release, 1e3);
      }
    }
    function showLegacyWarning() {
      var _a2;
    }
    function renderAppearance(cleanups) {
      content.classList.add("appearance-page");
      let sizeGroup = el("section", void 0, "plugin-group appearance-section font-settings"), sizeHeading = el("h3", void 0, "plugin-heading"), sizeToggle = el("button", void 0, "plugin-toggle");
      sizeToggle.type = "button", sizeToggle.append(createIcon(doc, "typography"), el("span", "\u754C\u9762\u5B57\u53F7", "plugin-title"), createIcon(doc, "chevron", "plugin-chevron"));
      let sizeBody = el("div", void 0, "plugin-body");
      sizeBody.id = "core-font-settings", bindPageFold(":font-settings", sizeToggle, sizeBody, "\u754C\u9762\u5B57\u53F7", settings.get("fontSettingsCollapsed", !1)), sizeHeading.append(sizeToggle), sizeGroup.append(sizeHeading, sizeBody);
      let sizes = el("div", void 0, "sgs-segments");
      sizes.setAttribute("role", "group"), sizes.setAttribute("aria-label", "\u754C\u9762\u5B57\u53F7");
      let selected = FONT_SIZES.some(([id]) => id === settings.get("fontSize", "standard")) ? settings.get("fontSize", "standard") : "standard";
      for (let [id, label] of FONT_SIZES) {
        let option = button(label, () => {
          let previous = FONT_SIZES.find(([key]) => key === settings.get("fontSize", "standard")) || FONT_SIZES[2], next = FONT_SIZES.find(([key]) => key === id), width = parseFloat(host.style.width) || 280;
          if (settings.set("fontSize", id), applyFontSize(), !host.hasAttribute("data-collapsed")) {
            let adjusted = applyEdgeWidth(width + (next[2] - previous[2]) * 10);
            settings.set("width", adjusted), host.style.left && (host.style.left = Math.max(0, Math.min(win.innerWidth - adjusted, parseFloat(host.style.left))) + "px");
          }
          for (let node of sizes.children) node.setAttribute("aria-pressed", String(node.dataset.fontSize === id));
        });
        option.dataset.fontSize = id, option.setAttribute("aria-pressed", String(selected === id)), sizes.append(option);
      }
      let preview = el("div", void 0, "font-preview");
      preview.setAttribute("aria-label", "\u5B57\u53F7\u9884\u89C8"), preview.append(el("strong", "\u5B57\u53F7\u9884\u89C8 \xB7 \u4E09\u56FD\u6740 OL"), el("p", "\u9009\u62E9\u9002\u5408\u4F60\u7684\u9605\u8BFB\u5927\u5C0F"), el("span", "\u5269\u4F59\u6B21\u6570 12 \xB7 \u5DF2\u542F\u7528", "muted")), sizeBody.append(sizes, preview, el("p", "\u5373\u65F6\u751F\u6548\u5E76\u4FDD\u5B58\uFF1B\u4EC5\u8C03\u6574\u5DE5\u5177\u7BB1\u754C\u9762\uFF0C\u4E0D\u6539\u53D8\u6E38\u620F\u5185\u6587\u5B57\u3002", "muted")), content.append(sizeGroup);
      let themeHeading = el("h3", void 0, "plugin-heading"), themeToggle = el("button", void 0, "plugin-toggle");
      themeToggle.type = "button", themeToggle.append(createIcon(doc, "palette"), el("span", "\u4E3B\u9898\u5DE5\u574A", "plugin-title"), createIcon(doc, "chevron", "plugin-chevron"));
      let workshop = el("div", void 0, "plugin-body");
      workshop.id = "core-theme-workshop", bindPageFold(":theme-workshop", themeToggle, workshop, "\u4E3B\u9898\u5DE5\u574A", settings.get("themeWorkshopCollapsed", !1));
      let themeGroup = el("section", void 0, "plugin-group appearance-section");
      themeHeading.append(themeToggle), themeGroup.append(themeHeading, workshop), content.append(themeGroup), cleanups.push(mountThemeWorkshop(workshop, { document: doc, themes: handlers.themes, notify })), cleanups.push(mountCardStyleWorkshop(content, { document: doc, cardStyles: handlers.cardStyles, settings, bindFold: bindPageFold }));
    }
    function renderSettings(cleanups) {
      var _a2;
      let first = content.children.length;
      content.append(el("h3", "\u53CD\u9988"), feedbackForm);
      {
        let edgeHeading = el("h3", "HUD \u9760\u8FB9\u884C\u4E3A");
        content.append(edgeHeading);
        let choices = el("div", void 0, "sgs-segments");
        choices.setAttribute("role", "group"), choices.setAttribute("aria-label", "HUD \u9760\u8FB9\u884C\u4E3A");
        for (let [value, label] of [["none", "\u65E0\u64CD\u4F5C"], ["hide", "\u6536\u8D77"], ["fixed", "\u56FA\u5B9A"]]) {
          let choice = button(label, () => {
            settings.set("hudEdgeBehavior", value);
            let atEdge = host.hasAttribute("data-edge-docked") || host.getBoundingClientRect().right >= win.innerWidth - 12;
            setEdgeDocked(atEdge), render();
          });
          choice.dataset.edgeBehavior = value, choice.setAttribute("aria-pressed", String(edgeBehavior() === value)), choices.append(choice), mobileDevice() && value === "fixed" && (choice.disabled = !0, choice.title = "\u79FB\u52A8\u7AEF\u6682\u4E0D\u652F\u6301\u56FA\u5B9A\u4FA7\u680F"), value === "hide" && (choice.disabled = !0, choice.title = "\u5FAE\u7AEF\u6682\u4E0D\u652F\u6301\u9760\u8FB9\u6536\u8D77", choice.style.cursor = "not-allowed");
        }
        content.append(choices), edgeHeading.append(helpTip(doc, mobileDevice() ? "\u62D6\u5230\u53F3\u8FB9\u7F18\u540E\u6536\u8D77\u81F3\u53F3\u4FA7\uFF1B\u70B9\u51FB\u8FB9\u6761\u6216\u5411\u5DE6\u5212\u5C55\u5F00\uFF0C\u5411\u53F3\u5212\u6216\u70B9\u51FB\u9762\u677F\u5916\u6536\u8D77\u3002\u79FB\u52A8\u7AEF\u6682\u4E0D\u652F\u6301\u56FA\u5B9A\u4FA7\u680F\u3002" : "\u62D6\u5230\u53F3\u8FB9\u7F18\u65F6\uFF1A\u65E0\u64CD\u4F5C\u4FDD\u6301\u60AC\u6D6E\uFF1B\u56FA\u5B9A\u4E3A\u4FA7\u680F\u5E76\u4E3A\u6E38\u620F\u753B\u5E03\u7559\u51FA\u7A7A\u95F4\u3002\u5FAE\u7AEF\u6682\u4E0D\u652F\u6301\u9760\u8FB9\u6536\u8D77\u3002"));
      }
      let opacityHeading = el("h3", "\u6536\u8D77\u680F\u4E0D\u900F\u660E\u5EA6");
      opacityHeading.id = "compact-opacity-heading";
      let opacityChoices = el("div", void 0, "sgs-segments");
      opacityChoices.setAttribute("role", "group"), opacityChoices.setAttribute("aria-labelledby", opacityHeading.id);
      let selectedOpacity = getCompactOpacity();
      for (let value of COMPACT_OPACITIES) {
        let choice = button(`${value}%`, () => {
          settings.set("compactOpacity", value), applyCompactOpacity();
          for (let option of opacityChoices.children) option.setAttribute("aria-pressed", String(option === choice));
        });
        choice.setAttribute("aria-pressed", String(value === selectedOpacity)), opacityChoices.append(choice);
      }
      content.append(opacityHeading, opacityChoices, el("h3", "\u622A\u56FE"));
      let cleanRow = el("label", void 0, "row");
      cleanRow.append(el("span", "\u622A\u56FE\u65F6\u9690\u85CF\u5DE5\u5177\u7BB1 UI"));
      let clean2 = el("input");
      clean2.type = "checkbox", styleSwitch(clean2), clean2.checked = settings.get("screenshotHideUI", !0), clean2.dataset.setting = "screenshotHideUI", clean2.onchange = () => settings.set("screenshotHideUI", clean2.checked), cleanRow.append(clean2), content.append(cleanRow), cleanRow.firstChild.append(helpTip(doc, "\u5BF9\u5C40\u5185\u9690\u85CF HUD\u3001\u660E\u724C\u4E0E\u7406\u724C\u7B49\u53E0\u52A0\uFF1B\u5927\u5385\u4EC5\u9690\u85CF HUD\u3002"));
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
      shotActions.append(iconButton("\u6E05\u9664\u5FEB\u6377\u952E", "trash", () => {
        settings.set("screenshotShortcut", null), showShortcut();
      }, "icon-action"), iconButton("\u6062\u590D\u9ED8\u8BA4\u5FEB\u6377\u952E", "rollback", () => {
        settings.set("screenshotShortcut", DEFAULT_SCREENSHOT_SHORTCUT), showShortcut();
      }, "icon-action"), button("\u622A\u56FE\u5E76\u590D\u5236", () => {
        var _a3;
        return (_a3 = handlers.screenshot) == null ? void 0 : _a3.call(handlers);
      })), content.append(shotActions), shortcutRow.firstChild.append(helpTip(doc, "\u70B9\u51FB\u5F55\u5165\u5FEB\u6377\u952E\uFF0CEsc \u53D6\u6D88\u3002\u622A\u56FE\u81EA\u52A8\u590D\u5236\u5230\u526A\u8D34\u677F\u3002"));
      let diagnosticHeading = el("h3", "\u8BB0\u724C\u8BCA\u65AD");
      diagnosticHeading.append(helpTip(doc, "\u5BFC\u51FA\u672C\u5C40\u6700\u8FD1\u7684\u5361\u724C\u8BB0\u5F55\u4E0E\u6D88\u606F\u7C7B\u578B\uFF0C\u7528\u4E8E\u6392\u67E5\u660E\u724C\u9057\u6F0F\u3002\u6587\u4EF6\u4E0D\u542B\u8D26\u53F7\u3001\u6635\u79F0\u6216\u5B8C\u6574\u767B\u5F55\u6570\u636E\uFF0C\u53EA\u4FDD\u5B58\u5230\u672C\u673A\u3002")), content.append(diagnosticHeading, button("\u5BFC\u51FA\u8BB0\u724C\u8BCA\u65AD", exportDiagnostics));
      let group;
      for (let node of [...content.children].slice(first))
        node.tagName === "H3" && (group = el("section", void 0, "settings-group"), content.append(group)), group.append(node);
      for (let b of content.querySelectorAll(".settings-group button")) {
        let icon2 = { \u622A\u56FE\u5E76\u590D\u5236: "camera", \u4FDD\u5B58\u5730\u5740: "save", \u5BFC\u51FA\u8BB0\u724C\u8BCA\u65AD: "download", \u70B9\u9009\u9690\u85CF\u65E7\u9762\u677F: "pointer" }[b.textContent];
        icon2 && b.prepend(controlIcon(doc, icon2));
      }
    }
    function formatCompat(status) {
      var _a2, _b2, _c, _d, _e;
      if (!status) return "\u517C\u5BB9\u63A7\u5236\u5668\u7B49\u5F85\u542F\u52A8\u3002";
      if (typeof status == "string") return status;
      let hidden = status.hiddenCount ?? ((_a2 = status.hidden) == null ? void 0 : _a2.length) ?? ((_b2 = status.hiddenElements) == null ? void 0 : _b2.length) ?? 0, exits = ((_c = status.exitCalls) == null ? void 0 : _c.length) ?? ((_d = status.exitCalled) == null ? void 0 : _d.length) ?? ((_e = status.exits) == null ? void 0 : _e.length) ?? 0;
      return `\u5DF2\u9690\u85CF ${hidden} \u4E2A\u65E7\u754C\u9762\uFF1B\u9000\u51FA\u8C03\u7528 ${exits} \u6B21\u3002`;
    }
    function startPicker() {
      notify("\u70B9\u51FB\u9700\u8981\u9690\u85CF\u7684\u65E7\u811A\u672C\u9762\u677F\uFF1BEsc \u53D6\u6D88\u3002");
      let finish = () => {
        doc.removeEventListener("click", pick, !0), doc.removeEventListener("keydown", cancel, !0);
      }, cancel = (e) => {
        e.key === "Escape" && finish();
      }, pick = (e) => {
        var _a2;
        if (e.composedPath().includes(host)) return;
        let target = e.target;
        if (!target || ["HTML", "BODY", "CANVAS"].includes(target.tagName) || target.id === "bgDiv") {
          notify("\u8BF7\u70B9\u9009\u65E7\u9762\u677F\u672C\u8EAB\uFF0C\u4E0D\u8981\u9009\u62E9\u6E38\u620F\u753B\u5E03\u3002");
          return;
        }
        e.preventDefault(), e.stopImmediatePropagation(), finish(), (_a2 = handlers.compat) == null || _a2.hideElement(target), notify("\u6240\u9009\u5143\u7D20\u5DF2\u9690\u85CF\uFF0C\u53EF\u5173\u95ED\u517C\u5BB9\u6A21\u5F0F\u6062\u590D\u3002");
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
      let details = el("details", void 0, "plugin-release-notes");
      details.open = expanded;
      let text3 = el("div", item.releaseNotes || "\u4F5C\u8005\u672A\u63D0\u4F9B\u6B64\u7248\u672C\u7684\u66F4\u65B0\u5185\u5BB9\u3002", "plugin-release-notes-text");
      return text3.tabIndex = 0, text3.setAttribute("role", "region"), text3.setAttribute("aria-label", `${item.version} \u66F4\u65B0\u5185\u5BB9`), details.append(el("summary", `\u6700\u8FD1\u66F4\u65B0 \xB7 ${item.version}`), text3), [details];
    }
    function pluginIdentity(card, item, fallbackDescription) {
      var _a2, _b2;
      let heading = el("div", void 0, "plugin-heading"), symbol = el("div", void 0, "plugin-symbol");
      symbol.append(svgIcon(item.icon || "package"));
      let name = el("strong", item.name, "plugin-name");
      name.title = item.name, heading.append(symbol, name, el("span", item.version, "plugin-version"));
      let description = el("div", item.description || fallbackDescription || "\u6B64\u63D2\u4EF6\u6682\u672A\u63D0\u4F9B\u7B80\u4ECB", "plugin-description");
      if (description.title = description.textContent, heading.append(helpTip(doc, description.textContent, `${item.name}\u7B80\u4ECB`)), card.append(heading, description), (_a2 = item.dependencies) != null && _a2.length) {
        let installed = ((_b2 = handlers.manager) == null ? void 0 : _b2.list()) || [], label = "\u524D\u7F6E\uFF1A" + item.dependencies.map((id) => {
          var _a3, _b3, _c;
          return ((_a3 = installed.find((p) => p.id === id)) == null ? void 0 : _a3.name) || ((_c = (_b3 = currentMarketState().catalog) == null ? void 0 : _b3.plugins.find((p) => p.id === id)) == null ? void 0 : _c.name) || id;
        }).join("\u3001"), dependency = el("div", label, "plugin-prerequisites");
        dependency.title = label, card.append(dependency);
      }
    }
    function pluginCards() {
      var _a2, _b2;
      let manager2 = handlers.manager, list2 = [...(manager2 == null ? void 0 : manager2.list()) || []].sort(comparePluginOrder), state = currentMarketState(), updates = new Map((state.catalog ? findPluginUpdates(list2, state.catalog.plugins) : []).map((item) => [item.id, item]));
      if (list2.sort((a, b) => {
        var _a3, _b3;
        return +(((_a3 = updates.get(b.id)) == null ? void 0 : _a3.status) === "update") - +(((_b3 = updates.get(a.id)) == null ? void 0 : _b3.status) === "update") || comparePluginOrder(a, b);
      }), content.append(el("h3", "\u5DF2\u5B89\u88C5\u63D2\u4EF6")), manager2 != null && manager2.initializing) {
        content.append(el("p", "\u6B63\u5728\u8BFB\u53D6\u5DF2\u5B89\u88C5\u63D2\u4EF6\u2026", "notice"));
        return;
      }
      if (manager2 != null && manager2.storageError) {
        let error = el("p", userErrorMessage(manager2.storageError), "notice error");
        error.setAttribute("role", "alert"), content.append(error);
        return;
      }
      if ((_a2 = manager2 == null ? void 0 : manager2.loadIssues) != null && _a2.size) {
        let details = el("details", void 0, "plugin-error"), summary = el("summary");
        summary.append(svgIcon("alert"), el("span", `${manager2.loadIssues.size} \u4E2A\u63D2\u4EF6\u52A0\u8F7D\u5F02\u5E38`));
        let errors = [...manager2.loadIssues].map(([id, issue]) => `${id}\uFF1A${userErrorMessage(issue.message)}`);
        details.append(summary, el("pre", errors.join(`
`))), content.append(details, el("p", "\u5DF2\u4FDD\u7559\u5B89\u88C5\u8BB0\u5F55\u3002\u8BF7\u5237\u65B0\u6E38\u620F\u91CD\u8BD5\u3002", "notice"));
      } else list2.length || content.append(el("p", "\u6682\u65E0\u5DF2\u5B89\u88C5\u63D2\u4EF6\u3002\u4ECE\u4E0B\u65B9\u5E02\u573A\u5B89\u88C5\uFF0C\u6216\u5BFC\u5165\u63D2\u4EF6\u5305\u6587\u4EF6\u3002", "muted"));
      for (let item of list2) {
        let update = updates.get(item.id), maintenance = { updating: "\u6B63\u5728\u66F4\u65B0", waiting: "\u7B49\u5F85\u524D\u7F6E\u66F4\u65B0", restarting: "\u6B63\u5728\u6062\u590D" }[item.maintenance], failed = !maintenance && (!!item.error || item.enabled && !item.active), card = el("section", void 0, `card plugin-card${(update == null ? void 0 : update.status) === "update" ? " has-update" : ""}${failed ? " has-error" : ""}`);
        card.dataset.pluginId = item.id, maintenance && card.setAttribute("aria-busy", "true"), pluginIdentity(card, item, (_b2 = update == null ? void 0 : update.entry) == null ? void 0 : _b2.description);
        let bottom = el("div", void 0, "plugin-bottom"), status = el("span", maintenance || (failed ? "\u8FD0\u884C\u5F02\u5E38" : item.active ? "\u8FD0\u884C\u4E2D" : "\u5DF2\u505C\u7528"), `plugin-status ${maintenance ? "" : failed ? "is-error" : item.active ? "is-running" : ""}`);
        if (status.title = `${status.textContent} \xB7 ${item.source}`, bottom.append(status), update && update.status !== "update" && !failed) {
          let label = update.status === "current" ? "\u5DF2\u662F\u5E02\u573A\u6700\u65B0\u6B63\u5F0F\u7248" : update.status === "newer" ? `\u5F53\u524D\u7248\u672C\u9AD8\u4E8E\u5E02\u573A\u6B63\u5F0F\u7248 ${update.entry.version}` : "\u5E02\u573A\u6682\u65E0\u6B64\u63D2\u4EF6\u7684\u6B63\u5F0F\u7248", marker = el("span", void 0, "plugin-current");
          marker.title = label, marker.setAttribute("aria-label", label), marker.append(svgIcon(update.status === "current" ? "check" : "info"), el("span", label, "sr-only")), bottom.append(marker);
        }
        let actions = el("div", void 0, "plugin-tools");
        if (actions.append(iconButton(item.enabled ? "\u505C\u7528" : "\u542F\u7528", item.enabled ? "pause" : "play", () => handlers.manager.enable(item.id, !item.enabled), item.enabled ? "" : "is-enable"), iconButton("\u91CD\u8F7D", "reload", () => handlers.manager.reload(item.id))), item.hasPrevious && actions.append(iconButton("\u56DE\u9000", "rollback", () => handlers.manager.rollback(item.id))), actions.append(iconButton("\u5378\u8F7D", "trash", () => handlers.manager.uninstall(item.id), "is-destructive")), maintenance || bulkBusy) for (let action of actions.children) action.disabled = !0;
        if (bottom.append(actions), card.append(bottom), failed) {
          let details = el("details", void 0, "plugin-error"), summary = el("summary");
          summary.append(svgIcon("alert"), el("span", "\u63D2\u4EF6\u8FD0\u884C\u5F02\u5E38")), details.append(summary, el("pre", userErrorMessage(item.error || "\u63D2\u4EF6\u672A\u80FD\u6FC0\u6D3B\uFF0C\u8BF7\u5C1D\u8BD5\u91CD\u8F7D\u3002"))), card.append(details);
        }
        if ((update == null ? void 0 : update.status) === "update") {
          let notice = el("div", void 0, "plugin-update"), info = el("div", void 0, "plugin-update-info");
          info.append(svgIcon("update"), el("span", `\u53D1\u73B0\u66F4\u65B0\uFF1A${item.version} \u2192 ${update.entry.version}`));
          let upgrade = button(`\u66F4\u65B0\u81F3 ${update.entry.version}`, () => installEntry(update.entry, !0));
          upgrade.prepend(svgIcon("update")), upgrade.disabled = bulkBusy || installing.has(item.id) || !!maintenance, notice.append(info, ...releaseNotesBlock(update.entry, !0), upgrade), card.append(notice);
        } else card.append(...releaseNotesBlock(item));
        renderDependencyPrompt(card, (update == null ? void 0 : update.entry) || item), markSearchable(card, item), content.append(card);
      }
    }
    async function installEntry(entry, updateOnly = !1, confirmed = !1) {
      var _a2, _b2;
      let client = handlers.market();
      if (bulkBusy || officialBusy || installing.has(entry.id)) return;
      let dependencies;
      try {
        dependencies = planDependencies(entry, handlers.manager.list(), ((_a2 = currentMarketState().catalog) == null ? void 0 : _a2.plugins) || []);
      } catch (error) {
        dependencyPrompts.set(entry.id, { entry, error: userErrorMessage(error), updateOnly }), render();
        return;
      }
      let previous = dependencyPrompts.get(entry.id), signature = JSON.stringify(dependencies.map((item) => [item.id, item.version, item.sha256]));
      if (dependencies.length && (!confirmed || (previous == null ? void 0 : previous.signature) !== signature || (previous == null ? void 0 : previous.client) !== client)) {
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
        planDependencies(entry, handlers.manager.list(), ((_b2 = currentMarketState().catalog) == null ? void 0 : _b2.plugins) || []);
        let pkg = await client.getPackage(entry);
        if (scope.closed) return;
        if (handlers.market() !== client) throw new Error("\u5E02\u573A\u5730\u5740\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u68C0\u6D4B\u66F4\u65B0\u3002");
        if (updateOnly) {
          let installed = handlers.manager.list().find((item) => item.id === entry.id);
          if (!installed || compareVersions2(entry.version, installed.version) <= 0) throw new Error("\u63D2\u4EF6\u5B89\u88C5\u72B6\u6001\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u68C0\u6D4B\u66F4\u65B0\u3002");
        }
        await handlers.manager.install(pkg, { updateOnly }), notify(`${entry.name} ${entry.version} \u5DF2\u5B89\u88C5`);
      } catch (error) {
        throw scope.closed || dependencyPrompts.set(entry.id, { entry, error: userErrorMessage(error), updateOnly }), error;
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
      let message = el("div", (prompt.error ? userErrorMessage(prompt.error) : "") || "\u9700\u8981\u5148\u5B89\u88C5\u5E76\u542F\u7528\uFF1A" + prompt.dependencies.map((item) => `${item.name} ${item.version}`).join("\u3001") + "\u3002\u662F\u5426\u7EE7\u7EED\uFF1F");
      message.style.overflowWrap = "anywhere", box.append(message), prompt.error || box.append(button("\u5B89\u88C5\u524D\u7F6E\u5E76\u7EE7\u7EED", () => installEntry(entry, prompt.updateOnly, !0))), box.append(button(prompt.error ? "\u5173\u95ED\u63D0\u793A" : "\u53D6\u6D88", () => {
        dependencyPrompts.delete(entry.id), render();
      })), card.append(box);
    }
    async function fetchCatalog({ reuse = !1 } = {}) {
      let state = currentMarketState();
      if (!state.client) return;
      if (state.loading) return state.loading;
      if (reuse && state.catalog) return state.catalog;
      let request = ++marketRequest;
      return state.error = "", state.loading = (async () => {
        try {
          let catalog = await Promise.resolve().then(() => state.client.getCatalog());
          return scope.closed || request !== marketRequest || handlers.market() !== state.client ? void 0 : (state.catalog = catalog, state.checkedAt = /* @__PURE__ */ new Date(), catalog);
        } catch (e) {
          if (scope.closed || request !== marketRequest || handlers.market() !== state.client) return;
          state.catalog = null, state.checkedAt = null, state.error = userErrorMessage(e);
        } finally {
          state.loading = null, !scope.closed && request === marketRequest && render();
        }
      })(), render(), state.loading;
    }
    async function updateAllPlugins(startup = !1) {
      let manager2 = handlers.manager, state = currentMarketState();
      if (!state.client || manager2.initializing || manager2.storageError || bulkBusy || officialBusy || installing.size) return;
      bulkBusy = !0, bulkStatus = "\u6B63\u5728\u68C0\u6D4B\u63D2\u4EF6\u66F4\u65B0\u2026", bulkFailures = [], render();
      let checkCurrent = () => {
        if (scope.closed) throw new Error("\u63D2\u4EF6\u66F4\u65B0\u5DF2\u53D6\u6D88\u3002");
        if (handlers.market() !== state.client) throw new Error("\u5E02\u573A\u5730\u5740\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u68C0\u6D4B\u66F4\u65B0\u3002");
      };
      try {
        let catalog = await fetchCatalog({ reuse: startup });
        if (checkCurrent(), !catalog) throw new Error(state.error || "\u672A\u80FD\u8BFB\u53D6\u63D2\u4EF6\u5E02\u573A\u76EE\u5F55\u3002");
        if (startup && settings.get(autoUpdateKey, !0) !== !0) {
          bulkStatus = "";
          return;
        }
        let result = await updateInstalledPlugins({
          manager: manager2,
          client: state.client,
          catalog: catalog.plugins,
          checkCurrent,
          onProgress(index, total, name) {
            bulkStatus = `\u6B63\u5728\u66F4\u65B0 ${index}/${total} \xB7 ${name}`, render();
          }
        });
        bulkFailures = result.failures, bulkStatus = result.updated || bulkFailures.length ? `\u5DF2\u66F4\u65B0 ${result.updated} \u4E2A\u63D2\u4EF6${bulkFailures.length ? `\uFF0C${bulkFailures.length} \u4E2A\u5F85\u5904\u7406` : ""}` : startup ? "" : "\u6CA1\u6709\u53EF\u66F4\u65B0\u7684\u63D2\u4EF6";
      } catch (error) {
        bulkStatus = startup && state.error ? "" : userErrorMessage(error);
      } finally {
        bulkBusy = !1, scope.closed || render();
      }
    }
    function markSearchable(card, item) {
      card.dataset.searchId = item.id, card.dataset.searchText = [item.name, item.id, item.description].filter(Boolean).join(" ").toLocaleLowerCase();
    }
    function filterPlugins() {
      let terms = pluginSearch.trim().toLocaleLowerCase().split(/\s+/), cards = [...content.querySelectorAll("[data-search-text]")];
      for (let card of cards) card.hidden = marketPluginId ? card.dataset.searchId !== marketPluginId : onlyUninstalled && card.dataset.catalogInstalled === "true" || !terms.every((term) => card.dataset.searchText.includes(term));
      let empty2 = content.querySelector(".plugin-search-empty");
      empty2 && (empty2.hidden = !pluginSearch.trim() || cards.some((card) => !card.hidden));
      let filter = content.querySelector("[data-market-list-filter]");
      filter && (filter.hidden = !!marketPluginId);
      let missing = content.querySelector("[data-market-target-missing]");
      missing && (missing.hidden = !marketPluginId);
    }
    function updateControls() {
      let state = currentMarketState(), actions = el("div", void 0, "actions market-update-actions"), update = button(bulkBusy ? "\u6B63\u5728\u66F4\u65B0\u63D2\u4EF6\u2026" : "\u4E00\u952E\u66F4\u65B0\u63D2\u4EF6", () => updateAllPlugins());
      update.prepend(svgIcon("update")), update.disabled = !state.client || bulkBusy || officialBusy || !!installing.size;
      let check = button(state.loading ? "\u6B63\u5728\u68C0\u6D4B\u66F4\u65B0\u2026" : "\u68C0\u6D4B\u63D2\u4EF6\u66F4\u65B0", () => fetchCatalog());
      check.disabled = !state.client || !!state.loading || bulkBusy, actions.append(update, check), content.append(actions);
      let autoRow = el("label", void 0, "row market-auto-update"), auto = styleSwitch(el("input"));
      if (auto.type = "checkbox", auto.checked = settings.get(autoUpdateKey, !0) === !0, auto.addEventListener("change", () => settings.set(autoUpdateKey, auto.checked)), autoRow.append(el("span", "\u542F\u52A8\u65F6\u81EA\u52A8\u66F4\u65B0\u63D2\u4EF6"), auto), content.append(autoRow), bulkStatus) {
        let status = el("div", bulkStatus, "notice");
        status.setAttribute("role", "status"), content.append(status);
      }
      if (bulkFailures.length) {
        let details = el("details", void 0, "plugin-error");
        details.append(el("summary", "\u67E5\u770B\u672A\u66F4\u65B0\u7684\u63D2\u4EF6"), el("pre", bulkFailures.map(({ entry, error }) => `${entry.name} \xB7 ${userErrorMessage(error)}`).join(`
`))), content.append(details);
      }
      let search = el("input", void 0, "plugin-search");
      search.type = "search", search.placeholder = "\u641C\u7D22\u63D2\u4EF6\u540D\u79F0\u3001\u7B80\u4ECB\u6216 ID", search.setAttribute("aria-label", "\u641C\u7D22\u63D2\u4EF6"), search.value = pluginSearch, search.addEventListener("input", () => {
        marketPluginId = "", pluginSearch = search.value, filterPlugins();
      }), content.append(search);
      let empty2 = el("div", "\u6CA1\u6709\u5339\u914D\u7684\u63D2\u4EF6", "notice plugin-search-empty");
      if (empty2.setAttribute("role", "status"), empty2.hidden = !0, content.append(empty2), !state.client) content.append(el("div", "\u5E02\u573A\u8FDE\u63A5\u5DF2\u5173\u95ED\uFF0C\u53EF\u5728\u8BBE\u7F6E\u4E2D\u9009\u62E9\u672C\u673A\u6216\u81EA\u5B9A\u4E49\u5730\u5740\u3002", "notice"));
      else if (state.error) content.append(el("div", `\u68C0\u6D4B\u5931\u8D25\uFF1A${state.error}`, "notice error"));
      else if (state.catalog) {
        let results = findPluginUpdates(handlers.manager.list(), state.catalog.plugins), count = results.filter((item) => item.status === "update").length;
        content.append(el("div", `\u4E0A\u6B21\u68C0\u6D4B ${state.checkedAt.toLocaleTimeString()} \xB7 ${count ? `${count} \u4E2A\u63D2\u4EF6\u53EF\u66F4\u65B0` : "\u672A\u53D1\u73B0\u53EF\u66F4\u65B0\u7684\u6B63\u5F0F\u7248"}${results.some((item) => item.status === "unavailable") ? "\uFF08\u90E8\u5206\u63D2\u4EF6\u6682\u65E0\u6B63\u5F0F\u7248\uFF09" : ""}`, `notice update-summary${count ? " has-update" : ""}`));
      } else content.append(el("div", "\u70B9\u51FB\u68C0\u6D4B\uFF0C\u6BD4\u8F83\u5DF2\u5B89\u88C5\u63D2\u4EF6\u4E0E\u5E02\u573A\u6700\u65B0\u7248\u672C\u3002", "notice"));
    }
    function catalogCards(container) {
      var _a2, _b2, _c;
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
      let installed = new Map((((_a2 = handlers.manager) == null ? void 0 : _a2.list()) || []).map((item) => [item.id, item])), loadIssues = (_b2 = handlers.manager) == null ? void 0 : _b2.loadIssues, bundleIssues = (_c = handlers.manager) == null ? void 0 : _c.bundledInstallIssues, filter = el("label", void 0, "row");
      filter.dataset.marketListFilter = "";
      let toggle = styleSwitch(el("input"));
      toggle.type = "checkbox", toggle.checked = onlyUninstalled, toggle.addEventListener("change", () => {
        onlyUninstalled = toggle.checked, settings.set("marketOnlyUninstalled", onlyUninstalled), render();
      }), filter.append(el("span", "\u53EA\u663E\u793A\u672A\u5B89\u88C5"), toggle), container.append(filter);
      let count = state.catalog.plugins.filter((entry) => !onlyUninstalled || !installed.has(entry.id) && !(loadIssues != null && loadIssues.has(entry.id))).length;
      if (container.append(el("div", `${count} \u4E2A${onlyUninstalled ? "\u672A\u5B89\u88C5" : "\u53EF\u7528"}\u53D1\u5E03\u5305`, "muted")), !count && !marketPluginId && container.append(el("div", "\u76EE\u5F55\u4E2D\u7684\u63D2\u4EF6\u5747\u5DF2\u5B89\u88C5", "notice")), marketPluginId && !state.catalog.plugins.some((entry) => entry.id === marketPluginId)) {
        let missing = el("div", "\u5F53\u524D\u5E02\u573A\u6682\u65E0\u6B64\u63D2\u4EF6\u3002", "notice");
        missing.dataset.marketTargetMissing = "", container.append(missing);
      }
      for (let entry of [...state.catalog.plugins].sort(comparePluginOrder)) {
        let card = el("section", void 0, "card plugin-card");
        pluginIdentity(card, entry), card.dataset.catalogKey = JSON.stringify([entry.id, entry.version]);
        let current = installed.get(entry.id), same = (current == null ? void 0 : current.version) === entry.version, unavailable = (loadIssues == null ? void 0 : loadIssues.has(entry.id)) || (bundleIssues == null ? void 0 : bundleIssues.has(entry.id)) || !!(current != null && current.error) && !current.maintenance;
        card.dataset.catalogInstalled = String(!!current || !!unavailable);
        let bottom = el("div", void 0, "plugin-bottom"), status = el("span", unavailable ? "\u5B89\u88C5\u6216\u52A0\u8F7D\u5F02\u5E38" : current ? `\u5DF2\u5B89\u88C5${same ? "\u6B64\u7248\u672C" : " " + current.version}` : "\u672A\u5B89\u88C5", "plugin-status");
        status.title = status.textContent, status.style.whiteSpace = "normal", bottom.append(status);
        let busy = installing.has(entry.id), install = button(busy ? "\u6B63\u5728\u5B89\u88C5\u2026" : same && !unavailable ? "\u5DF2\u5B89\u88C5" : current || unavailable ? "\u91CD\u65B0\u5B89\u88C5" : "\u5B89\u88C5\u6B64\u7248\u672C", () => installEntry(entry));
        install.disabled = bulkBusy || officialBusy || busy || same && !unavailable, install.style.marginLeft = "auto", install.style.flexShrink = "0", busy && card.setAttribute("aria-busy", "true"), bottom.append(install), card.append(bottom, ...releaseNotesBlock(entry)), renderDependencyPrompt(card, entry), markSearchable(card, entry), container.append(card);
      }
    }
    function coreUpdateStatus() {
      var _a2, _b2;
      let version = (_b2 = (_a2 = currentMarketState().catalog) == null ? void 0 : _a2.core) == null ? void 0 : _b2.version;
      return typeof version == "string" && /^\d+\.\d+\.\d+$/.test(version) ? { version, order: compareVersions2(version, CORE_VERSION) } : null;
    }
    function renderCoreUpgrade() {
      var _a2;
      {
        let card2 = el("section", void 0, "card plugin-card" + (microUpdate != null && microUpdate.newer ? " has-update" : ""));
        card2.dataset.coreUpgrade = "", pluginIdentity(card2, { name: "\u5DE5\u5177\u7BB1\u6838\u5FC3", version: CORE_VERSION, icon: "toolbox", description: "\u76F4\u63A5\u66F4\u65B0\u5DE5\u5177\u7BB1\u811A\u672C\uFF0C\u4FDD\u7559\u63D2\u4EF6\u4E0E\u8BBE\u7F6E\uFF0C\u4E0B\u6B21\u6253\u5F00\u6E38\u620F\u751F\u6548\u3002" });
        let message = microUpdateBusy ? "\u6B63\u5728\u8FDE\u63A5\u811A\u672C\u66F4\u65B0\u670D\u52A1\u2026" : microUpdateError || (microUpdate != null && microUpdate.pending ? "\u5DF2\u4FDD\u5B58\u811A\u672C " + microUpdate.version + "\uFF0C\u4E0B\u6B21\u6253\u5F00\u6E38\u620F\u751F\u6548\u3002" : microUpdate != null && microUpdate.newer ? "\u53D1\u73B0\u811A\u672C\u66F4\u65B0\uFF1A" + CORE_VERSION + " \u2192 " + microUpdate.version : microUpdate ? "\u811A\u672C\u5DF2\u662F\u6700\u65B0\u7248\u672C" : "\u70B9\u51FB\u68C0\u67E5\u811A\u672C\u66F4\u65B0"), status2 = el("div", message, microUpdateError ? "error" : "notice");
        status2.setAttribute("role", microUpdateError ? "alert" : "status"), card2.append(status2);
        let actions2 = el("div", void 0, "core-upgrade-actions"), check = button("\u68C0\u67E5\u811A\u672C\u66F4\u65B0", () => runMicroUpdate("check"));
        if (check.disabled = microUpdateBusy, actions2.append(check), microUpdate != null && microUpdate.newer && !microUpdate.pending) {
          let install = button("\u66F4\u65B0\u811A\u672C", () => runMicroUpdate("install"));
          install.disabled = microUpdateBusy, install.prepend(svgIcon("update")), actions2.append(install);
        }
        if (microUpdate != null && microUpdate.rollback) {
          let rollback = button("\u56DE\u9000\u811A\u672C", () => runMicroUpdate("rollback"));
          rollback.disabled = microUpdateBusy, actions2.append(rollback);
        }
        card2.append(actions2), content.append(card2);
        return;
      }
      let state = currentMarketState(), latest = coreUpdateStatus(), card = el("section", void 0, "card plugin-card" + ((latest == null ? void 0 : latest.order) > 0 ? " has-update" : ""));
      card.dataset.coreUpgrade = "", pluginIdentity(card, { name: "\u5DE5\u5177\u7BB1\u6838\u5FC3", version: CORE_VERSION, icon: "toolbox", description: "\u901A\u8FC7\u7528\u6237\u811A\u672C\u5B89\u88C5\u9875\u5347\u7EA7\uFF0C\u5B89\u88C5\u5B8C\u6210\u540E\u5237\u65B0\u6E38\u620F\u3002" });
      let status = state.client ? state.loading ? "\u6B63\u5728\u68C0\u6D4B\u6838\u5FC3\u7248\u672C\u2026" : state.error ? "\u6838\u5FC3\u7248\u672C\u68C0\u6D4B\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5" : latest ? latest.order > 0 ? "\u53D1\u73B0\u6838\u5FC3\u66F4\u65B0\uFF1A" + CORE_VERSION + " \u2192 " + latest.version : latest.order < 0 ? "\u5F53\u524D\u6838\u5FC3\u9AD8\u4E8E\u5E02\u573A\u6B63\u5F0F\u7248 " + latest.version : "\u6838\u5FC3\u5DF2\u662F\u5E02\u573A\u6700\u65B0\u6B63\u5F0F\u7248" : "\u5C1A\u672A\u83B7\u53D6\u6838\u5FC3\u6B63\u5F0F\u7248\u4FE1\u606F" : "\u79BB\u7EBF \xB7 \u672A\u68C0\u6D4B\u6838\u5FC3\u7248\u672C";
      card.append(el("div", status, "notice"));
      let link = el("a", (latest == null ? void 0 : latest.order) > 0 ? "\u8DF3\u8F6C\u5347\u7EA7\u81F3 " + latest.version : "\u67E5\u770B\u6838\u5FC3\u5B89\u88C5\u9875"), marketUrl = (_a2 = state.client) == null ? void 0 : _a2.baseUrl, installMarketUrl = !marketUrl || marketUrl === DOWNLOAD_MARKET_URL ? GITHUB_MARKET_URL : marketUrl;
      link.href = new URL("../lite/toolbox.user.js", installMarketUrl + "/").href, link.target = "_blank", link.rel = "noopener noreferrer", link.style.cssText = "display:inline-flex;align-items:center;gap:6px;color:var(--sgs-accent);padding:6px 0;";
      let actions = el("div", void 0, "core-upgrade-actions");
      if (link.addEventListener("click", () => {
        pendingCoreUpgrade = (latest == null ? void 0 : latest.order) > 0 ? latest.version : CORE_VERSION, settings.set("pendingCoreUpgrade", pendingCoreUpgrade), render(), notify("\u5DF2\u6253\u5F00\u6838\u5FC3\u5B89\u88C5\u9875\uFF1B\u5B8C\u6210\u5B89\u88C5\u540E\uFF0C\u8BF7\u8FD4\u56DE\u6B64\u9875\u70B9\u51FB\u201C\u5237\u65B0\u751F\u6548\u201D\u3002");
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
    async function completeOfficialPlugins() {
      var _a2;
      if (bulkBusy || officialBusy || installing.size) return;
      let client = handlers.market();
      officialBusy = !0, officialStatus = "\u6B63\u5728\u51C6\u5907\u5B98\u65B9\u63D2\u4EF6\u5957\u88C5\u2026", render();
      let completed = 0;
      try {
        let catalog = await client.getCatalog(), manager2 = handlers.manager, installed = manager2.list(), saved = [...((_a2 = manager2.loadIssues) == null ? void 0 : _a2.keys()) || []].filter((id) => !installed.some((item) => item.id === id)), plan = planOfficialPlugins([...installed, ...saved.map((id) => ({ id, name: id, enabled: !1, active: !1 }))], catalog.plugins);
        for (let entry of plan) {
          if (scope.closed) return;
          if (handlers.market() !== client) throw new Error("\u5E02\u573A\u5730\u5740\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5\u540E\u91CD\u8BD5\u3002");
          if (handlers.manager.list().some((item) => item.id === entry.id)) continue;
          officialStatus = `\u6B63\u5728\u5B89\u88C5 ${completed + 1}/${plan.length}\uFF1A${entry.name}`, render(), planDependencies(entry, handlers.manager.list(), catalog.plugins);
          let pkg = await client.getPackage(entry);
          if (scope.closed) return;
          if (handlers.market() !== client) throw new Error("\u5E02\u573A\u5730\u5740\u5DF2\u6539\u53D8\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5\u540E\u91CD\u8BD5\u3002");
          handlers.manager.list().some((item) => item.id === entry.id) || (planDependencies(entry, handlers.manager.list(), catalog.plugins), await handlers.manager.install(pkg), completed++);
        }
        officialStatus = completed ? `\u5DF2\u8865\u9F50 ${completed} \u4E2A\u5B98\u65B9\u63D2\u4EF6` : "\u5B98\u65B9\u63D2\u4EF6\u5DF2\u9F50\u5168";
      } catch (error) {
        officialStatus = `\u5DF2\u5B89\u88C5 ${completed} \u4E2A\uFF0C\u8865\u9F50\u672A\u5B8C\u6210\uFF1A${userErrorMessage(error)}`;
      } finally {
        officialBusy = !1, scope.closed || render();
      }
    }
    function renderMarket() {
      var _a2, _b2, _c, _d, _e;
      renderCoreUpgrade();
      let manager2 = handlers.manager;
      if (manager2 != null && manager2.initializing || manager2 != null && manager2.storageError) {
        pluginCards();
        return;
      }
      let pack = el("section", void 0, "card");
      pack.append(el("strong", "\u5B98\u65B9\u63D2\u4EF6\u5957\u88C5"), el("div", `\u4E00\u952E\u8865\u9F50 ${officialPluginIds.length} \u4E2A\u5B98\u65B9\u63D2\u4EF6\uFF1B\u4FDD\u7559\u5DF2\u6709\u7248\u672C\u3001\u8BBE\u7F6E\u548C\u505C\u7528\u72B6\u6001\u3002`, "notice"));
      let packActions = el("div", void 0, "actions"), complete = button(officialBusy ? "\u6B63\u5728\u8865\u9F50\u2026" : "\u4E00\u952E\u8865\u9F50\u5B98\u65B9\u63D2\u4EF6", completeOfficialPlugins);
      if (complete.disabled = bulkBusy || officialBusy || !!installing.size || !currentMarketState().client, packActions.append(complete), pack.append(packActions), officialStatus) {
        let status = el("div", officialStatus, "notice");
        status.setAttribute("role", "status"), pack.append(status);
      }
      content.append(pack), updateControls(), pluginCards(), content.append(el("h3", "\u63D2\u4EF6\u76EE\u5F55"));
      let catalog = el("div"), actions = el("div", void 0, "actions"), refresh = button("\u8FDE\u63A5 / \u5237\u65B0\u5E02\u573A", () => fetchCatalog());
      refresh.disabled = bulkBusy || !currentMarketState().client || !!currentMarketState().loading;
      let importPackage = button("\u5BFC\u5165\u63D2\u4EF6\u5305", () => {
        let file = doc.createElement("input");
        file.type = "file", file.accept = ".json", file.onchange = async () => {
          try {
            if (!file.files[0]) return;
            if (bulkBusy) throw new Error("\u8BF7\u7B49\u5F85\u63D2\u4EF6\u66F4\u65B0\u5B8C\u6210\u3002");
            await handlers.manager.install(JSON.parse(await file.files[0].text())), notify("\u63D2\u4EF6\u5305\u5DF2\u5B89\u88C5");
          } catch (e) {
            notify(userErrorMessage(e));
          }
        }, file.click();
      });
      if (importPackage.disabled = bulkBusy, actions.append(refresh, importPackage), (_b2 = (_a2 = handlers.manager) == null ? void 0 : _a2.builtins) != null && _b2.has("cards") && !handlers.manager.list().some((p) => p.id === "cards")) {
        let restore = button("\u6062\u590D\u5185\u7F6E\u5361\u724C", () => handlers.manager.restoreBuiltin("cards"));
        restore.disabled = bulkBusy, actions.append(restore);
      }
      (_e = handlers.market) != null && _e.call(handlers) && content.append(el("div", "\u4E0B\u8F7D\u6765\u6E90\uFF1A" + marketServerLabel(handlers.market().baseUrl), "muted")), content.append(actions, catalog), catalogCards(catalog);
    }
    function renderManagement(cleanups) {
      let tabs = el("div", void 0, "tabs management-tabs"), sections = [["settings", "\u8BBE\u7F6E"], ["market", "\u63D2\u4EF6\u5E02\u573A"], ["appearance", "\u5916\u89C2"]];
      managedSync && sections.push(["sync", "\u4E91\u540C\u6B65"]);
      for (let [id, title] of sections) {
        let b = button(title, () => {
          management = id, render();
        });
        management === id && (b.className = "active"), b.setAttribute("aria-pressed", String(management === id)), tabs.append(b);
      }
      if (content.append(tabs), management === "settings") renderSettings(cleanups);
      else if (management === "market") renderMarket();
      else if (management === "appearance") renderAppearance(cleanups);
      else if (management === "sync") {
        let syncSettings = mountSyncSettings(doc, win, managedSync, preferenceSync, {
          initialMode: syncMode,
          onModeChange: (mode) => {
            syncMode = mode;
          }
        });
        content.append(syncSettings.root), cleanups.push(syncSettings.dispose);
      }
    }
    function render() {
      var _a2, _b2, _c, _d, _e, _f, _g, _h;
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
        renderedCleanup == null || renderedCleanup();
      } catch {
      }
      renderedCleanup = null, content.replaceChildren(), pageFolds.clear(), content.classList.remove("has-plugin-panels", "appearance-page");
      let cleanups = [];
      renderedCleanup = () => {
        for (let clean2 of cleanups.splice(0))
          try {
            clean2();
          } catch {
          }
      };
      let installed = ((_a2 = handlers.manager) == null ? void 0 : _a2.list()) || [], market = currentMarketState(), failedPlugins = new Set((_c = (_b2 = handlers.manager) == null ? void 0 : _b2.loadIssues) == null ? void 0 : _c.keys());
      for (let id of ((_e = (_d = handlers.manager) == null ? void 0 : _d.bundledInstallIssues) == null ? void 0 : _e.keys()) || []) failedPlugins.add(id);
      for (let item of installed) !item.maintenance && (item.error || item.enabled && !item.active) && failedPlugins.add(item.id);
      let failures = failedPlugins.size, storageError = !!((_f = handlers.manager) != null && _f.storageError), upgrades = market.catalog ? findPluginUpdates(installed, market.catalog.plugins).filter((item) => item.status === "update").length : 0, manage = shadow.querySelector('[data-category="manage"]');
      (_g = manage.querySelector(".nav-alert")) == null || _g.remove();
      let coreUpgrade = !!(microUpdate != null && microUpdate.newer) && !(microUpdate != null && microUpdate.pending), updateHint = shadow.querySelector("[data-update-hint]");
      updateHint.hidden = !coreUpgrade && !upgrades, updateHint.parentElement.classList.toggle("has-update", !updateHint.hidden), updateHint.title = [coreUpgrade && "\u6838\u5FC3\u53EF\u5347\u7EA7", upgrades && `${upgrades} \u4E2A\u63D2\u4EF6\u53EF\u66F4\u65B0`, "\u70B9\u51FB\u524D\u5F80\u66F4\u65B0"].filter(Boolean).join(" \xB7 ");
      let alerts = [coreUpgrade && "\u6838\u5FC3\u53EF\u5347\u7EA7", storageError && "\u63D2\u4EF6\u5B58\u50A8\u8BFB\u53D6\u5931\u8D25", failures && `${failures} \u4E2A\u63D2\u4EF6\u5F02\u5E38`, upgrades && `${upgrades} \u4E2A\u63D2\u4EF6\u53EF\u66F4\u65B0`].filter(Boolean).join(" \xB7 ");
      if (manage.title = alerts || "\u7BA1\u7406", alerts) {
        let badge = el("i", storageError ? "!" : String(failures || upgrades + Number(coreUpgrade)), `nav-alert${failures || storageError ? " is-error" : ""}`);
        badge.setAttribute("aria-label", alerts), manage.append(badge);
      }
      for (let b of shadow.querySelectorAll("[data-category]")) b.setAttribute("aria-selected", String(b.dataset.category === active));
      renderedKey = active + ":" + (active === "game" ? gameView : active === "manage" ? management : ""), active === "manage" && (renderManagement(cleanups), filterPlugins());
      let category = active === "manage" && management === "appearance" ? "appearance" : active, manager2 = handlers.manager, registered = [...panels.values()].filter((p) => p.category === category), placeholders = [];
      if (manager2 && !manager2.initializing) {
        let byId = new Map(installed.map((item) => [item.id, item])), issues = manager2.bundledInstallIssues;
        for (let spec of handlers.fullPluginPanels || []) {
          if (spec.category !== category) continue;
          let id = spec.pluginId, state = byId.get(id);
          if (state != null && state.maintenance || state && !state.enabled || registered.some((panel) => panel.pluginId === id) && !(issues != null && issues.has(id)) || state != null && state.active && !(issues != null && issues.has(id))) continue;
          let failed = failedPlugins.has(id) || !!state || !!storageError;
          placeholders.push({ ...spec, placeholder: failed ? "\u5B89\u88C5\u5F02\u5E38" : "\u672A\u5B89\u88C5" });
        }
      }
      let unavailable = new Set(placeholders.map((spec) => spec.pluginId)), categoryPanels = [...registered.filter((panel) => !unavailable.has(panel.pluginId)), ...placeholders].sort(comparePanelOrder), available = active === "game" ? selectGamePanels(categoryPanels, gameView) : categoryPanels;
      if (!available.length) {
        active !== "manage" && empty("\u5C1A\u672A\u5B89\u88C5\u6B64\u7C7B\u63D2\u4EF6", active === "game" ? "\u524D\u5F80\u7BA1\u7406 \u2192 \u63D2\u4EF6\u5E02\u573A\u5B89\u88C5\u5361\u724C\u63D2\u4EF6\u3002" : "\u6B64\u5206\u7C7B\u4E3A\u540E\u7EED\u63D2\u4EF6\u4FDD\u7559\u3002"), restoreScroll();
        return;
      }
      content.classList.add("has-plugin-panels");
      let groups2 = /* @__PURE__ */ new Map(), tabHosts = /* @__PURE__ */ new Map();
      for (let panel of available)
        panel.groupTabs && !tabHosts.has(panel.pluginId) && tabHosts.set(panel.pluginId, panel);
      let appendPanel = (panel, body) => {
        let section = el("section");
        section.dataset.panelId = panel.id, body.append(section);
        let groupTabs = (tabHosts.get(panel.pluginId) === panel ? available.filter((child) => child.groupTab && child.groupWith === panel.pluginId) : []).map((child) => {
          let mounted;
          return { id: child.id, title: child.title, mount(target) {
            if (!content.contains(section) || !section.contains(target) || target === section)
              throw new Error("\u7EC4\u5185\u9875\u7B7E\u5FC5\u987B\u6302\u8F7D\u5728\u672C\u9762\u677F\u7684\u5185\u5BB9\u5BB9\u5668\u4E2D\u3002");
            return mounted ??= appendPanel(child, target);
          } };
        });
        try {
          let clean2 = panel.render(section, { groupTabs });
          typeof clean2 == "function" && cleanups.push(clean2);
        } catch (e) {
          section.append(el("div", "\u9762\u677F\u52A0\u8F7D\u5931\u8D25\uFF1A" + userErrorMessage(e), "error"));
        }
        return section;
      };
      for (let panel of available) {
        if (panel.groupWith) continue;
        let id = panel.pluginId || panel.id, body = groups2.get(id);
        if (!body) {
          let title = panel.pluginName || panel.title || id, group = el("section", void 0, "plugin-group");
          group.dataset.pluginGroup = id;
          let heading = el("h2", void 0, "plugin-heading"), toggle = el("button", void 0, "plugin-toggle");
          toggle.type = "button";
          let icon2 = el("span");
          if (icon2.setAttribute("aria-hidden", "true"), icon2.append(svgIcon(panel.pluginIcon || "package")), toggle.append(icon2, el("span", title, "plugin-title")), panel.placeholder) {
            let state = panel.placeholder;
            toggle.dataset.marketPlaceholder = "", toggle.append(el("span", `\uFF08${state}\uFF09`, `plugin-placeholder-state${state === "\u672A\u5B89\u88C5" ? "" : " error"}`), createIcon(doc, "chevron", "plugin-chevron")), toggle.setAttribute("aria-label", `${title}\uFF08${state}\uFF09\uFF0C\u524D\u5F80\u63D2\u4EF6\u5E02\u573A`), toggle.title = "\u524D\u5F80\u63D2\u4EF6\u5E02\u573A", toggle.onclick = () => openMarketForPlugin(id), heading.append(toggle), group.append(heading), content.append(group);
            continue;
          }
          toggle.append(createIcon(doc, "chevron", "plugin-chevron")), body = el("div", void 0, "plugin-body"), body.id = `plugin-body-${groups2.size}`, bindPageFold(id, toggle, body, title, settings.get(`pluginCollapsed:${id}`, !1), { doubleClick: !0 }), heading.append(toggle), group.append(heading, body), content.append(group), groups2.set(id, body);
        }
        appendPanel(panel, body);
      }
      for (let panel of available) {
        if (panel.groupTab && tabHosts.has(panel.groupWith)) continue;
        let body = panel.groupWith && groups2.get(panel.groupWith);
        body && appendPanel(panel, body);
      }
      restoreScroll();
    }
    for (let b of shadow.querySelectorAll("[data-category]")) scope.listen(b, "click", () => {
      active = b.dataset.category, settings.set("category", active), render();
    });
    scope.listen(shadow.querySelector(".nav"), "keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      let buttons = [...shadow.querySelectorAll("[data-category]")], i2 = buttons.indexOf(shadow.activeElement);
      buttons[(i2 + (e.key === "ArrowLeft" ? 4 : 1)) % 5].focus(), e.preventDefault();
    }), scope.listen(shadow.querySelector("[data-open-market]"), "click", () => {
      active = "manage", management = "market", render();
    });
    let setCollapsed = (value) => {
      if (value && host.hasAttribute("data-edge-docked")) {
        setEdgeDocked(!1);
        let width = parseFloat(host.style.width) || 280, free = settings.get("hudFloatingPosition", { x: Math.max(0, win.innerWidth - width - 24), y: 72 });
        host.style.left = Math.max(0, Math.min(win.innerWidth - 156, Number(free == null ? void 0 : free.x) || 0)) + "px", host.style.top = Math.max(0, Math.min(win.innerHeight - 45, Number(free == null ? void 0 : free.y) || 0)) + "px", host.style.right = "auto", settings.set("position", { x: parseFloat(host.style.left), y: parseFloat(host.style.top) });
      }
      host.toggleAttribute("data-collapsed", value), settings.set("collapsed", value), typeof syncGameViewport == "function" && syncGameViewport();
    };
    host.toggleAttribute("data-collapsed", settings.get("collapsed", !1)), scope.listen(shadow.querySelector("[data-collapse]"), "click", () => setCollapsed(!0));
    let expandHUD = () => {
      setCollapsed(!1), host.style.left && (host.style.left = Math.max(0, Math.min(win.innerWidth - (parseFloat(host.style.width) || 280), parseFloat(host.style.left))) + "px");
    };
    scope.listen(shadow.querySelector("[data-expand]"), "click", expandHUD), scope.listen(shadow.querySelector(".compact"), "dblclick", (event) => {
      event.target.closest("button") || (event.preventDefault(), expandHUD());
    }), scope.listen(shadow.querySelector("[data-screenshot]"), "click", () => {
      var _a2;
      return (_a2 = handlers.screenshot) == null ? void 0 : _a2.call(handlers);
    });
    let mobileDevice = () => {
      var _a2, _b2;
      return !1;
    };
    settings.get("hudEdgeBehavior", "fixed") === "hide" && settings.set("hudEdgeBehavior", "fixed"), host.toggleAttribute("data-mobile", mobileDevice());
    let edgeTab = doc.createElement("button");
    edgeTab.className = "edge-tab", edgeTab.textContent = "\u2039", edgeTab.setAttribute("aria-label", "\u5C55\u5F00\u5DE5\u5177\u7BB1\u4FA7\u680F"), shadow.append(edgeTab), scope.listen(edgeTab, "click", () => revealEdge());
    let touchTip = doc.createElement("div");
    touchTip.setAttribute("popover", "manual"), touchTip.setAttribute("role", "tooltip"), touchTip.style.cssText = "position:fixed;inset:auto;margin:0;max-width:min(300px,calc(100vw - 24px));padding:9px 12px;border:1px solid var(--sgs-border);border-radius:8px;background:var(--sgs-raised);color:var(--sgs-text);font:12px/1.7 var(--sgs-font);overflow-wrap:anywhere;pointer-events:none;box-shadow:0 6px 24px #0004", shadow.append(touchTip);
    let touchTipTimer, closeTouchTip = () => {
      clearTimeout(touchTipTimer), touchTip.matches(":popover-open") && touchTip.hidePopover();
    };
    scope.listen(shadow, "click", (event) => {
      var _a2, _b2;
      if (!mobileDevice()) return;
      closeTouchTip();
      let target = (_b2 = (_a2 = event.target).closest) == null ? void 0 : _b2.call(_a2, "[title]");
      if (!(target != null && target.title) || target.hasAttribute("data-help-tip") || !touchTip.showPopover) return;
      touchTip.textContent = target.title, touchTip.showPopover();
      let box = target.getBoundingClientRect(), bounds = touchTip.getBoundingClientRect();
      touchTip.style.left = Math.max(12, Math.min(box.left, win.innerWidth - bounds.width - 12)) + "px", touchTip.style.top = Math.max(12, box.bottom + bounds.height + 8 < win.innerHeight ? box.bottom + 6 : box.top - bounds.height - 6) + "px", touchTipTimer = setTimeout(closeTouchTip, 3500);
    }), scope.listen(doc, "pointerdown", closeTouchTip), scope.listen(content, "scroll", closeTouchTip), scope.add(closeTouchTip);
    let edgeBehavior = () => {
      let value = settings.get("hudEdgeBehavior", "fixed");
      return mobileDevice() ? value === "none" ? "none" : "hide" : value === "hide" ? "fixed" : ["none", "hide", "fixed"].includes(value) ? value : "fixed";
    }, gameViewport = createGameViewport({ window: win, document: doc, scope, canReserve: canReserveGameViewport, sceneWatch }), syncGameViewport = () => gameViewport.reserve(host.hasAttribute("data-edge-fixed") ? host.hasAttribute("data-collapsed") ? 156 : parseFloat(host.style.width) || 280 : 0), edgeHideTimer, draggingHUD = !1, revealEdge = () => {
      clearTimeout(edgeHideTimer), host.removeAttribute("data-edge-hidden");
    }, hasKeyboardFocus = () => {
      var _a2;
      return host.matches(":focus-visible") || !!((_a2 = shadow.activeElement) != null && _a2.matches(":focus-visible"));
    }, hideEdge = () => {
      clearTimeout(edgeHideTimer), !(!host.hasAttribute("data-edge-docked") || host.hasAttribute("data-edge-fixed") || draggingHUD || hasKeyboardFocus()) && (edgeHideTimer = setTimeout(() => {
        !scope.closed && !draggingHUD && !hasKeyboardFocus() && host.setAttribute("data-edge-hidden", "");
      }, 180));
    }, setEdgeDocked = (value, hidden = !1) => {
      let behavior = edgeBehavior(), docked = !!value && behavior !== "none";
      revealEdge(), host.toggleAttribute("data-edge-docked", docked), host.toggleAttribute("data-edge-fixed", docked && behavior === "fixed"), host.toggleAttribute("data-edge-hidden", docked && behavior === "hide" && hidden), docked ? (setCollapsed(!1), host.tabIndex = 0, host.setAttribute("aria-label", behavior === "fixed" ? "\u5DE5\u5177\u7BB1\u56FA\u5B9A\u4FA7\u680F" : "\u5DE5\u5177\u7BB1\u81EA\u52A8\u9690\u85CF\u4FA7\u680F")) : (host.removeAttribute("tabindex"), host.removeAttribute("aria-label")), settings.set("edgeDocked", docked), syncGameViewport();
    }, edgeResizer = doc.createElement("div");
    edgeResizer.className = "edge-resizer", edgeResizer.tabIndex = 0;
    let snapHint = doc.createElement("div");
    snapHint.textContent = "\u677E\u5F00\u5438\u9644", snapHint.hidden = !0, snapHint.setAttribute("aria-hidden", "true"), snapHint.style.cssText = "position:fixed;right:8px;top:45%;padding:8px 12px;border:1px solid var(--sgs-accent);border-radius:7px;background:var(--sgs-bg);color:var(--sgs-accent);box-shadow:0 4px 16px #0005;pointer-events:none;z-index:20;font-size:12px", shadow.append(snapHint), edgeResizer.setAttribute("role", "separator"), edgeResizer.setAttribute("aria-orientation", "vertical"), edgeResizer.setAttribute("aria-label", "\u8C03\u6574\u4FA7\u680F\u5BBD\u5EA6"), edgeResizer.title = "\u5411\u5DE6\u62D6\u52A8\u52A0\u5BBD\uFF0C\u5411\u53F3\u62D6\u52A8\u53D8\u7A84\uFF1B\u65B9\u5411\u952E\u8C03\u6574", edgeResizer.setAttribute("aria-valuemin", "248"), edgeResizer.setAttribute("aria-valuemax", "420");
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
    }), scope.listen(host, "pointerdown", (event) => {
      (event.pointerType !== "touch" || !host.hasAttribute("data-edge-hidden")) && revealEdge();
    }), installEdgeSwipe({ win, host, scope, mobile: mobileDevice, reveal: revealEdge, hide: () => {
      var _a2;
      (_a2 = shadow.activeElement) == null || _a2.blur(), host.blur(), hideEdge();
    } }), scope.listen(doc, "pointerdown", (event) => {
      mobileDevice() && !event.composedPath().includes(host) && hideEdge();
    }), scope.listen(host, "pointerenter", (event) => {
      event.pointerType !== "touch" && !mobileDevice() && revealEdge();
    }), scope.listen(host, "pointerleave", (event) => {
      event.pointerType !== "touch" && !mobileDevice() && hideEdge();
    }), scope.listen(host, "focusin", () => {
      (!mobileDevice() || shadow.activeElement !== edgeTab) && revealEdge();
    }), scope.listen(host, "focusout", () => {
      host.matches(":hover") || hideEdge();
    }), scope.listen(win, "resize", () => {
      host.toggleAttribute("data-mobile", mobileDevice()), mobileDevice() && (setEdgeDocked(host.hasAttribute("data-edge-docked"), host.hasAttribute("data-edge-hidden")), active === "manage" && render()), host.style.left && (host.style.left = Math.max(0, Math.min(win.innerWidth - (host.hasAttribute("data-collapsed") ? 156 : parseFloat(host.style.width) || 280), parseFloat(host.style.left))) + "px");
    }), scope.add(() => clearTimeout(edgeHideTimer)), setEdgeDocked(settings.get("edgeDocked", !1), !0);
    let position = settings.get("position", null);
    if (position && (host.style.left = Math.max(0, Math.min(win.innerWidth - 248, position.x)) + "px", host.style.top = Math.max(0, Math.min(win.innerHeight - 50, position.y)) + "px", host.style.right = "auto"), host.style.width = Math.max(248, Math.min(420, settings.get("width", 280))) + "px", edgeResizer.setAttribute("aria-valuenow", String(parseFloat(host.style.width))), syncGameViewport(), win.ResizeObserver) {
      let saveWidth, observer = new win.ResizeObserver((entries) => {
        var _a2, _b2;
        if (host.hasAttribute("data-collapsed")) return;
        let width = Math.round(((_b2 = (_a2 = entries[0].borderBoxSize) == null ? void 0 : _a2[0]) == null ? void 0 : _b2.inlineSize) || shadow.querySelector(".shell").getBoundingClientRect().width);
        host.toggleAttribute("data-tight-brand", width < 300), !(width < 248) && (host.style.width = width + "px", edgeResizer.setAttribute("aria-valuenow", String(width)), syncGameViewport(), clearTimeout(saveWidth), saveWidth = setTimeout(() => settings.set("width", width), 200));
      });
      observer.observe(shadow.querySelector(".shell")), scope.add(() => {
        observer.disconnect(), clearTimeout(saveWidth);
      });
    }
    for (let handle of shadow.querySelectorAll(".brand,.compact")) scope.listen(handle, "pointerdown", (e) => {
      if (mobileDevice() && e.pointerType === "touch" && host.hasAttribute("data-edge-docked") || e.button !== 0 || e.target.closest("button") || draggingHUD) return;
      e.preventDefault(), e.stopPropagation();
      let moved = !1, finished = !1, snapReady = !1, rect = host.getBoundingClientRect();
      !host.hasAttribute("data-edge-docked") && rect.right < win.innerWidth - 12 && settings.set("hudFloatingPosition", { x: rect.left, y: rect.top }), draggingHUD = !0, setEdgeDocked(!1), host.style.left = rect.left + "px", host.style.right = "auto";
      let dx = e.clientX - rect.left, dy = e.clientY - rect.top, cleanup = () => {
        var _a2;
        snapHint.hidden = !0, win.removeEventListener("pointermove", move, !0), win.removeEventListener("pointerup", up, !0), win.removeEventListener("pointercancel", up, !0), win.removeEventListener("blur", up), handle.removeEventListener("lostpointercapture", up), (_a2 = handle.hasPointerCapture) != null && _a2.call(handle, e.pointerId) && handle.releasePointerCapture(e.pointerId);
      }, up = (event) => {
        finished || (event == null ? void 0 : event.pointerId) !== void 0 && event.pointerId !== e.pointerId || ((event == null ? void 0 : event.type) === "pointerup" && updatePosition(event), finished = !0, cleanup(), draggingHUD = !1, !scope.closed && (settings.set("position", { x: host.offsetLeft, y: host.offsetTop }), moved && (event == null ? void 0 : event.type) !== "pointercancel" && edgeBehavior() !== "none" && snapReady && (setEdgeDocked(!0), (mobileDevice() || !host.matches(":hover")) && hideEdge())));
      }, updatePosition = (event) => {
        moved ||= Math.abs(event.clientX - e.clientX) > 3 || Math.abs(event.clientY - e.clientY) > 3, host.style.left = Math.max(0, Math.min(win.innerWidth - rect.width, event.clientX - dx)) + "px", host.style.top = Math.max(0, Math.min(win.innerHeight - 45, event.clientY - dy)) + "px", host.style.right = "auto";
        let gap = win.innerWidth - Math.max(event.clientX, event.clientX - dx + rect.width);
        snapReady = moved && edgeBehavior() !== "none" && gap <= (snapReady ? 72 : 48), snapHint.hidden = !snapReady;
      }, move = (event) => {
        if (event.pointerId === e.pointerId) {
          if (event.buttons === 0) {
            up(event);
            return;
          }
          event.preventDefault(), updatePosition(event);
        }
      };
      win.addEventListener("pointermove", move, !0), win.addEventListener("pointerup", up, !0), win.addEventListener("pointercancel", up, !0), win.addEventListener("blur", up), handle.addEventListener("lostpointercapture", up);
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
      }
      scope.add(() => {
        finished = !0, cleanup(), draggingHUD = !1;
      });
    });
    let mount = () => {
      !host.isConnected && doc.documentElement && doc.documentElement.append(host);
    };
    mount(), scope.interval(mount, 1e3), scope.add(() => {
      try {
        renderedCleanup == null || renderedCleanup();
      } finally {
        renderedCleanup = null, clearTimeout(toastTimer), host.remove();
      }
    });
    let compactSummaries = /* @__PURE__ */ new Map(), statusLine = shadow.querySelector(".status"), statusText = statusLine.querySelector("span"), compact = shadow.querySelector(".compact"), slashCount = compact.querySelector("[data-slash]"), slash = compact.querySelector(".slash");
    function setCompactSummary(id, items) {
      items.length ? compactSummaries.set(id, items) : compactSummaries.delete(id);
      let summary = shadow.querySelector(".compact-summary");
      summary.replaceChildren();
      for (let rows of compactSummaries.values()) for (let item of rows) {
        let row = el("div", void 0, "compact-summary-row");
        row.title = item.detail || "", row.append(el("span", item.label), el("b", item.value)), summary.append(row);
      }
    }
    return render(), {
      host,
      shadow,
      setCompactSummary,
      notify,
      showLegacyWarning,
      render,
      setGameView(value) {
        let next = value === "shanhe" || value === "shanhe-battle" ? value : "battle";
        next !== gameView && (gameView = next, active === "game" && render());
      },
      setRemainingSlash(value) {
        let known = Number.isFinite(value), text3 = value === 1 / 0 ? "\u221E" : known ? String(value) : "\u2014";
        slashCount.textContent !== text3 && (slashCount.textContent = text3);
        let state = value === 1 / 0 ? "unlimited" : known ? value === 0 ? "empty" : "ready" : "unknown", size = text3.length > 2 ? "long" : "normal";
        compact.dataset.countState !== state && (compact.dataset.countState = state), compact.dataset.countSize !== size && (compact.dataset.countSize = size);
        let label = value === 1 / 0 ? "\u51FA\u6740\u6B21\u6570\u4E0D\u9650" : known ? `\u5269\u4F59\u51FA\u6740\u6B21\u6570\uFF1A${text3}` : "\u5269\u4F59\u51FA\u6740\u6B21\u6570\u6682\u4E0D\u53EF\u7528";
        slashCount.getAttribute("aria-label") !== label && slashCount.setAttribute("aria-label", label);
        let title = label + "\uFF1B\u53CC\u51FB\u5C55\u5F00\uFF0C\u6309\u4F4F\u62D6\u52A8";
        slash.title !== title && (slash.title = title);
      },
      setHandlers(value, { deferStartupMarket = !1 } = {}) {
        var _a2;
        let first = !handlers.manager;
        handlers = value, render(), first && (_a2 = handlers.market) != null && _a2.call(handlers) && !deferStartupMarket && scope.timeout(() => fetchCatalog({ reuse: !0 }), 1500), first && typeof win.__SGS_TOOLBOX_SCRIPT_UPDATE__ == "function" && scope.timeout(() => runMicroUpdate("check"), 1500);
      },
      startMarketUpdates() {
        return settings.get(autoUpdateKey, !0) === !0 && handlers.manager.list().length && !handlers.manager.storageError ? updateAllPlugins(!0) : fetchCatalog({ reuse: !0 });
      },
      setStatusVisible(visible) {
        statusLine.hidden !== !visible && (statusLine.hidden = !visible);
      },
      setStatus(text3) {
        statusText.textContent !== text3 && (statusText.textContent = text3);
      },
      applyTheme(tokens) {
        host.dataset.themeScheme = tokens.scheme === "light" ? "light" : "dark", host.toggleAttribute("data-theme-textured", OPTIONAL_THEME_TOKENS.some((key) => !!tokens[key]));
        for (let key of OPTIONAL_THEME_TOKENS) tokens[key] || host.style.removeProperty("--sgs-" + key);
        for (let [key, value] of Object.entries(tokens)) typeof value == "string" && host.style.setProperty("--sgs-" + key, value);
      },
      registerPanel(spec) {
        if (panels.has(spec.id)) throw new Error("\u9762\u677F\u91CD\u590D\u6CE8\u518C\uFF1A" + spec.id);
        return panels.set(spec.id, spec), render(), () => {
          panels.delete(spec.id), render();
        };
      }
    };
  }
  var MATCH_SYNC_PATH = "/appearances/sync", LEDGER_SYNC_PATH = "/ledger/sync", PREFERENCES_SYNC_PATH = "/v1/preferences/sync", PREFERENCES_RESTORED = "sgs-toolbox:preferences-restored", BACKUP_READ_PATH = "/v1/backup/read", BACKUP_RESTORED = "sgs-toolbox:backup-restored", SYNC_CHANGES_PATH = "/v1/sync/changes", PUBLIC_CHANGES_PATH = "/v2/vault/changes", SYNC_HISTORY_UPDATED = "sgs-toolbox:sync-history-updated";
  function validSyncCursor(cursor) {
    return /^[A-Za-z0-9_-]{43}$/.test((cursor == null ? void 0 : cursor.epoch) ?? "") && Number.isSafeInteger(cursor == null ? void 0 : cursor.seq) && cursor.seq >= 0;
  }
  var INSTANCE_SOURCES = /* @__PURE__ */ new Set(["DbsCcUpdategoodsAttribNtf", "DbsCcUserDelgoodsNtf"]), itemKey = (item) => `${item.id}:${Math.sign(item.delta)}`, amounts = (row) => JSON.stringify(row.items.map(({ id, delta }) => [id, delta]));
  function mergeLedgerEvent(previous, next) {
    if (!previous) return next;
    if (previous.session !== next.session || previous.at !== next.at || previous.kind !== next.kind || previous.source !== next.source) return null;
    if (next.kind === "prayer") return previous.prayer.secId === next.prayer.secId && previous.prayer.times === next.prayer.times ? previous : null;
    if (previous.type !== next.type) return null;
    if (amounts(previous) === amounts(next)) return next.reconciled && !previous.reconciled ? next : previous;
    let isCorrection = (before, after) => {
      if (!after.reconciled) return !1;
      let prior = new Map(before.items.map((item) => [itemKey(item), Math.abs(item.delta)]));
      return after.items.every((item) => Math.abs(item.delta) <= prior.get(itemKey(item)));
    };
    return isCorrection(previous, next) ? next : isCorrection(next, previous) ? previous : null;
  }
  function markNearby(group, range, opposite) {
    if (!(group.length < 2)) {
      group.sort((a, b) => a.at - b.at);
      for (let pass = 0; pass < 2; pass++, group.reverse()) {
        let nearestByStream = /* @__PURE__ */ new Map();
        for (let row of group) {
          let stream = opposite ? Number(INSTANCE_SOURCES.has(row.source)) : 0, [nearest, other] = nearestByStream.get(opposite ? 1 - stream : stream) ?? [], candidate = (nearest == null ? void 0 : nearest.session) === row.session ? other : nearest;
          candidate && Math.abs(candidate.at - row.at) <= range && (row.review = !0);
          let [prior, second] = nearestByStream.get(stream) ?? [];
          nearestByStream.set(stream, [row, (prior == null ? void 0 : prior.session) === row.session ? second : prior]);
        }
      }
    }
  }
  function observedLedgerEvents(events) {
    let groups2 = /* @__PURE__ */ new Map(), overlaps = /* @__PURE__ */ new Map(), rows = [];
    for (let event of events) {
      if (event.kind === "goods" && !event.items.length) continue;
      let key = event.kind === "goods" ? amounts(event) : `prayer:${event.prayer.secId}:${event.prayer.times}`, row = { ...event, review: event.review === !0 };
      if (groups2.has(key) || groups2.set(key, []), groups2.get(key).push(row), event.source === "DbsCcUserGoodshintNtf" || INSTANCE_SOURCES.has(event.source)) for (let item of event.items) {
        let key2 = itemKey(item);
        overlaps.has(key2) || overlaps.set(key2, []), overlaps.get(key2).push(row);
      }
      rows.push(row);
    }
    for (let group of groups2.values()) markNearby(group, 2e3, !1);
    for (let group of overlaps.values()) markNearby(group, 8e3, !0);
    return rows.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  }
  var FUTURE_LIMIT = 12e4, bytes = new TextEncoder(), byteLength = (value) => bytes.encode(value).length, EMPTY_LEDGER = { updatedAt: null, balances: [], events: [], names: {}, eventVersion: null }, confirmedLedgerEvents = (events) => observedLedgerEvents(events).filter((row) => !row.review), visibleBalances = (entry, now = Date.now()) => entry.balances.filter((row) => row.name !== "\u5982\u610F\u7ED3" || row.expiresAt > now && (!entry.knotWindow || row.at > entry.knotWindow.at || entry.knotWindow.active.includes(row.id)));
  function ledgerDownload(entry, pull, confirmed = confirmedLedgerEvents(entry.events)) {
    let version = entry.eventVersion, { offset } = pull, balances = visibleBalances(entry);
    if (offset && pull.version !== version) return { version, offset: 0, next: null, events: null, balances };
    if (!offset && pull.version === version) return { version, offset, next: null, events: null, balances };
    let page = [], bytes2 = byteLength(JSON.stringify(balances)) + 512;
    for (let i2 = offset; i2 < confirmed.length && page.length < 200; i2++) {
      let row = confirmed[i2], size = byteLength(JSON.stringify(row)) + 1;
      if (bytes2 + size > 8388608 && page.length) break;
      page.push(row), bytes2 += size;
    }
    let next = offset + page.length;
    return { version, offset, next: next < confirmed.length ? next : null, events: page, balances };
  }
  function mergeLedgerUpload(previous, { balances, events, profile, knotWindow }, now, version) {
    var _a2, _b2, _c;
    let latest = balances.length ? new Map(previous.balances.map((row) => [row.id, row])) : null, history = events.length ? new Map(previous.events.map((row) => [row.id, row])) : null, conflicts = 0, balanceChanged = !1, eventChanged = !1;
    for (let row of balances) {
      if (row.name === "\u5982\u610F\u7ED3" && !row.expiresAt) continue;
      let old = latest.get(row.id);
      if (row.at > now + FUTURE_LIMIT) {
        conflicts++;
        continue;
      }
      (old == null ? void 0 : old.at) === row.at && old.count !== row.count ? (conflicts++, old.review || (latest.set(row.id, { ...old, review: !0 }), balanceChanged = !0)) : (!old || row.at > old.at) && (latest.set(row.id, row), balanceChanged = !0);
    }
    for (let row of events) {
      if (row.at > now + FUTURE_LIMIT) {
        conflicts++;
        continue;
      }
      let old = history.get(row.id), merged = mergeLedgerEvent(old, row);
      merged ? merged !== old && (history.set(row.id, old != null && old.review ? { ...merged, review: !0 } : merged), eventChanged = !0) : (conflicts++, old.review || (history.set(row.id, { ...old, review: !0 }), eventChanged = !0));
    }
    let entry = previous, nextProfile = profile && profile.session.at <= now + FUTURE_LIMIT && profile.session.at >= (((_a2 = previous.profile) == null ? void 0 : _a2.session.at) || 0) ? { ...profile, name: profile.name || ((_b2 = previous.profile) == null ? void 0 : _b2.name) || "" } : previous.profile, window2 = (knotWindow == null ? void 0 : knotWindow.at) > (((_c = previous.knotWindow) == null ? void 0 : _c.at) || 0) && knotWindow.at <= now + FUTURE_LIMIT ? knotWindow : previous.knotWindow, profileChanged = JSON.stringify(nextProfile) !== JSON.stringify(previous.profile);
    return (balanceChanged || eventChanged || profileChanged || window2 !== previous.knotWindow) && (entry = {
      ...previous,
      updatedAt: now,
      balances: balanceChanged ? [...latest.values()] : previous.balances,
      events: eventChanged ? [...history.values()] : previous.events,
      eventVersion: eventChanged ? version() : previous.eventVersion,
      profile: nextProfile,
      knotWindow: window2
    }), { entry, conflicts };
  }
  var syncAccountSeed = (account) => `sgstoolbox-appearances-test:${account}`;
  async function installLocalAppearanceSyncPackage(manager2, settings, pkg) {
    let key = "localAppearanceSyncPackage";
    if (settings.get(key, "") === pkg.sha256) return;
    let installed = manager2.list().find((plugin) => plugin.id === pkg.manifest.id);
    (!installed || compareVersions2(installed.version, pkg.manifest.version) < 0) && await manager2.install(pkg), settings.set(key, pkg.sha256);
  }
  async function syncGameAccountKey(win, account) {
    let bytes2 = new TextEncoder().encode(syncAccountSeed(account)), hash = new Uint8Array(await win.crypto.subtle.digest("SHA-256", bytes2));
    return Array.from(hash, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  function createExchange(win, path, managed) {
    return async (account, data, signal) => {
      if (!managed.available(account)) throw new Error("\u8BF7\u5148\u5728\u300C\u7BA1\u7406 \u2192 \u4E91\u540C\u6B65\u300D\u7ED1\u5B9A\u5F53\u524D\u8D26\u53F7");
      let accountKey = await syncGameAccountKey(win, account), payload = await managed.exchange(account, path, data, accountKey, signal);
      if ((payload == null ? void 0 : payload.account) !== accountKey) throw new Error("\u540C\u6B65\u56DE\u590D\u8D26\u53F7\u4E0D\u7B26");
      return payload;
    };
  }
  function createDevAppearanceSync(win, managed, backup) {
    let exchange = createExchange(win, MATCH_SYNC_PATH, managed);
    if (!backup) return Object.assign(
      async (account, matches, signal, names) => (await exchange(account, { matches, names }, signal)).matches,
      { available: managed.available, cacheKey: managed.cacheKey }
    );
    let binding, acknowledged = /* @__PURE__ */ new Map(), oldNames;
    return Object.assign(async (account, matches, signal, names) => {
      var _a2;
      let key = managed.cacheKey(account);
      key !== binding && (binding = key, acknowledged = /* @__PURE__ */ new Map(), oldNames = void 0);
      let queued = acknowledged, current = await backup.history(account), cloud = new Map(current == null ? void 0 : current.matches.map((row) => [row.gameId, JSON.stringify(row)])), changed = matches.filter((row) => {
        let encoded = JSON.stringify(row);
        return queued.get(row.gameId) !== encoded && cloud.get(row.gameId) !== encoded;
      }), nextNames = names && JSON.stringify(names);
      if (changed.length || nextNames && nextNames !== oldNames) {
        if ((await exchange(account, { matches: changed, names: nextNames !== oldNames ? names : void 0, uploadOnly: !0 }, signal)).ok !== !0) throw new Error("\u6218\u7EE9\u4E0A\u4F20\u56DE\u6267\u65E0\u6548\uFF0C\u8BF7\u66F4\u65B0\u540C\u6B65\u670D\u52A1");
        for (let row of changed) queued.set(row.gameId, JSON.stringify(row));
        queued === acknowledged && nextNames && (oldNames = nextNames);
      }
      return ((_a2 = await backup.history(account)) == null ? void 0 : _a2.matches) ?? [];
    }, { localBackup: !0, available: backup.canUpload, cacheKey: managed.cacheKey });
  }
  function createDevLedgerSync(win, managed, backup) {
    let exchange = createExchange(win, LEDGER_SYNC_PATH, managed), pages = /* @__PURE__ */ new WeakMap(), confirmed = (ledger) => (pages.has(ledger) || pages.set(ledger, confirmedLedgerEvents(ledger.events)), pages.get(ledger));
    return Object.freeze({
      available: (backup == null ? void 0 : backup.canUpload) ?? managed.available,
      cacheKey: (id) => !backup || backup.canUpload(id) ? managed.cacheKey(id) : void 0,
      localBackup: !!backup,
      ...backup && { async readHistory(account) {
        var _a2;
        let ledger = ((_a2 = await backup.history(account)) == null ? void 0 : _a2.ledger) ?? EMPTY_LEDGER;
        return { version: ledger.eventVersion, events: confirmed(ledger), balances: visibleBalances(ledger) };
      } },
      async exchange(account, data, signal) {
        var _a2;
        let { pull, ...upload } = data, reply2 = backup && pull != null && pull.offset ? { conflicts: 0 } : await exchange(account, backup ? { ...upload, uploadOnly: !0 } : data, signal);
        if (!Number.isSafeInteger(reply2.conflicts) || reply2.conflicts < 0) throw new Error("\u8D26\u672C\u540C\u6B65\u56DE\u6267\u65E0\u6548");
        if (backup && pull) {
          let ledger = ((_a2 = await backup.history(account)) == null ? void 0 : _a2.ledger) ?? EMPTY_LEDGER;
          return { ...reply2, download: ledgerDownload(ledger, pull, confirmed(ledger)) };
        }
        return reply2;
      }
    });
  }
  var HpkeError = class extends Error {
    constructor(e) {
      let message;
      e instanceof Error ? message = e.message : typeof e == "string" ? message = e : message = "", super(message), this.name = this.constructor.name;
    }
  }, InvalidParamError = class extends HpkeError {
  }, SerializeError = class extends HpkeError {
  }, DeserializeError = class extends HpkeError {
  }, EncapError = class extends HpkeError {
  }, DecapError = class extends HpkeError {
  }, ExportError = class extends HpkeError {
  }, SealError = class extends HpkeError {
  }, OpenError = class extends HpkeError {
  }, MessageLimitReachedError = class extends HpkeError {
  }, DeriveKeyPairError = class extends HpkeError {
  }, NotSupportedError = class extends HpkeError {
  }, dntGlobals = {}, dntGlobalThis = createMergeProxy(globalThis, dntGlobals);
  function createMergeProxy(baseObj, extObj) {
    return new Proxy(baseObj, {
      get(_target, prop, _receiver) {
        return prop in extObj ? extObj[prop] : baseObj[prop];
      },
      set(_target, prop, value) {
        return prop in extObj && delete extObj[prop], baseObj[prop] = value, !0;
      },
      deleteProperty(_target, prop) {
        let success = !1;
        return prop in extObj && (delete extObj[prop], success = !0), prop in baseObj && (delete baseObj[prop], success = !0), success;
      },
      ownKeys(_target) {
        let baseKeys = Reflect.ownKeys(baseObj), extKeys = Reflect.ownKeys(extObj), extKeysSet = new Set(extKeys);
        return [...baseKeys.filter((k) => !extKeysSet.has(k)), ...extKeys];
      },
      defineProperty(_target, prop, desc) {
        return prop in extObj && delete extObj[prop], Reflect.defineProperty(baseObj, prop, desc), !0;
      },
      getOwnPropertyDescriptor(_target, prop) {
        return prop in extObj ? Reflect.getOwnPropertyDescriptor(extObj, prop) : Reflect.getOwnPropertyDescriptor(baseObj, prop);
      },
      has(_target, prop) {
        return prop in extObj || prop in baseObj;
      }
    });
  }
  async function loadSubtleCrypto() {
    if (dntGlobalThis !== void 0 && globalThis.crypto !== void 0)
      return globalThis.crypto.subtle;
    try {
      let { webcrypto } = await Promise.resolve().then(() => __toESM(require_crypto(), 1));
      return webcrypto.subtle;
    } catch (e) {
      throw new NotSupportedError(e);
    }
  }
  var NativeAlgorithm = class {
    constructor() {
      Object.defineProperty(this, "_api", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      });
    }
    async _setup() {
      this._api === void 0 && (this._api = await loadSubtleCrypto());
    }
  }, EMPTY = /* @__PURE__ */ new Uint8Array(0), SUITE_ID_HEADER_KEM = /* @__PURE__ */ new Uint8Array([
    75,
    69,
    77,
    0,
    0
  ]), isCryptoKeyPair = (x2) => typeof x2 == "object" && x2 !== null && typeof x2.privateKey == "object" && typeof x2.publicKey == "object";
  function i2Osp(n, w) {
    if (w <= 0)
      throw new Error("i2Osp: too small size");
    if (n >= 256 ** w)
      throw new Error("i2Osp: too large integer");
    let ret = new Uint8Array(w);
    for (let i2 = 0; i2 < w && n; i2++)
      ret[w - (i2 + 1)] = n % 256, n = Math.floor(n / 256);
    return ret;
  }
  function concat(...parts) {
    let len = 0;
    for (let p of parts)
      len += p.length;
    let ret = new Uint8Array(len), offset = 0;
    for (let p of parts)
      ret.set(p, offset), offset += p.length;
    return ret;
  }
  function base64UrlToBytes(v) {
    let base64 = v.replace(/-/g, "+").replace(/_/g, "/"), byteString = atob(base64), ret = new Uint8Array(byteString.length);
    for (let i2 = 0; i2 < byteString.length; i2++)
      ret[i2] = byteString.charCodeAt(i2);
    return ret;
  }
  function xor(a, b) {
    if (a.byteLength !== b.byteLength)
      throw new Error("xor: different length inputs");
    let buf = new Uint8Array(a.byteLength);
    for (let i2 = 0; i2 < a.byteLength; i2++)
      buf[i2] = a[i2] ^ b[i2];
    return buf;
  }
  var HPKE_VERSION = /* @__PURE__ */ new Uint8Array([
    72,
    80,
    75,
    69,
    45,
    118,
    49
  ]);
  function toUint8Array(input) {
    return new Uint8Array(toArrayBuffer(input));
  }
  function toArrayBuffer(input) {
    return input instanceof ArrayBuffer ? input : ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength).slice().buffer : new Uint8Array(input).slice().buffer;
  }
  var HkdfNative = class extends NativeAlgorithm {
    /**
     * Uses WebCrypto HMAC for salts of any length when no callback is supplied.
     * Prefer omitting the callback and its JavaScript HMAC/SHA-2 imports to reduce
     * bundle size. Empty salts are normalized to hashSize zero bytes.
     *
     * @param fallbackExtract Optional legacy callback, taking precedence over
     * WebCrypto for nonempty salts whose length differs from hashSize.
     * Empty and hash-sized salts always use WebCrypto.
     */
    constructor(fallbackExtract) {
      super(), Object.defineProperty(this, "id", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: 1
      }), Object.defineProperty(this, "hashSize", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: 0
      }), Object.defineProperty(this, "_suiteId", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: EMPTY
      }), Object.defineProperty(this, "algHash", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: {
          name: "HMAC",
          hash: "SHA-256",
          length: 256
        }
      }), Object.defineProperty(this, "_fallbackExtract", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), this._fallbackExtract = fallbackExtract;
    }
    init(suiteId) {
      this._suiteId = suiteId;
    }
    buildLabeledIkm(label, ikm) {
      return this._checkInit(), concat(HPKE_VERSION, this._suiteId, label, ikm);
    }
    buildLabeledInfo(label, info, len) {
      return this._checkInit(), concat(
        // I2OSP(len, 2)
        new Uint8Array([len >> 8, len]),
        HPKE_VERSION,
        this._suiteId,
        label,
        info
      );
    }
    async extract(salt, ikm) {
      await this._setup();
      let saltBuf = salt.byteLength === 0 ? new ArrayBuffer(this.hashSize) : toArrayBuffer(salt), ikmBuf = toArrayBuffer(ikm);
      if (saltBuf.byteLength !== this.hashSize && this._fallbackExtract !== void 0)
        return this._fallbackExtract(new Uint8Array(saltBuf), new Uint8Array(ikmBuf)).buffer;
      let key = await this._api.importKey("raw", saltBuf, { name: this.algHash.name, hash: this.algHash.hash }, !1, [
        "sign"
      ]);
      return await this._api.sign("HMAC", key, ikmBuf);
    }
    async expand(prk, info, len) {
      if (await this._setup(), len > 255 * this.hashSize)
        throw new Error("Entropy limit reached");
      let prkBuf = toArrayBuffer(prk), key = await this._api.importKey("raw", prkBuf, this.algHash, !1, [
        "sign"
      ]), okm = new Uint8Array(len), prev = EMPTY, mid = toUint8Array(info);
      for (let counter = 1, offset = 0; offset < okm.length; counter++) {
        let input = new Uint8Array(prev.length + mid.length + 1);
        input.set(prev), input.set(mid, prev.length), input[input.length - 1] = counter, prev = new Uint8Array(await this._api.sign("HMAC", key, input));
        let block = prev.subarray(0, Math.min(prev.length, okm.length - offset));
        okm.set(block, offset), offset += block.length;
      }
      return okm.buffer;
    }
    async extractAndExpand(salt, ikm, info, len) {
      await this._setup();
      let ikmBuf = toArrayBuffer(ikm), baseKey = await this._api.importKey("raw", ikmBuf, "HKDF", !1, ["deriveBits"]);
      return await this._api.deriveBits({
        name: "HKDF",
        hash: this.algHash.hash,
        salt: toArrayBuffer(salt),
        info: toArrayBuffer(info)
      }, baseKey, len * 8);
    }
    async labeledExtract(salt, label, ikm) {
      return await this.extract(salt, this.buildLabeledIkm(label, ikm));
    }
    async labeledExpand(prk, label, info, len) {
      return await this.expand(prk, this.buildLabeledInfo(label, info, len), len);
    }
    _checkInit() {
      if (this._suiteId === EMPTY)
        throw new Error("Not initialized. Call init()");
    }
  }, HkdfSha256Native = class extends HkdfNative {
    constructor() {
      super(...arguments), Object.defineProperty(this, "id", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: 1
      }), Object.defineProperty(this, "hashSize", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: 32
      }), Object.defineProperty(this, "algHash", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: {
          name: "HMAC",
          hash: "SHA-256",
          length: 256
        }
      });
    }
  }, LABEL_EAE_PRK = /* @__PURE__ */ new Uint8Array([
    101,
    97,
    101,
    95,
    112,
    114,
    107
  ]), LABEL_SHARED_SECRET = /* @__PURE__ */ new Uint8Array([
    115,
    104,
    97,
    114,
    101,
    100,
    95,
    115,
    101,
    99,
    114,
    101,
    116
  ]), Dhkem = class {
    constructor(id, prim, kdf) {
      Object.defineProperty(this, "id", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), Object.defineProperty(this, "secretSize", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: 0
      }), Object.defineProperty(this, "encSize", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: 0
      }), Object.defineProperty(this, "publicKeySize", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: 0
      }), Object.defineProperty(this, "privateKeySize", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: 0
      }), Object.defineProperty(this, "_prim", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), Object.defineProperty(this, "_kdf", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), this.id = id, this._prim = prim, this._kdf = kdf;
      let suiteId = new Uint8Array(SUITE_ID_HEADER_KEM);
      suiteId.set(i2Osp(this.id, 2), 3), this._kdf.init(suiteId);
    }
    async serializePublicKey(key) {
      return await this._prim.serializePublicKey(key);
    }
    async deserializePublicKey(key) {
      return await this._prim.deserializePublicKey(toArrayBuffer(key));
    }
    async serializePrivateKey(key) {
      return await this._prim.serializePrivateKey(key);
    }
    async deserializePrivateKey(key) {
      return await this._prim.deserializePrivateKey(toArrayBuffer(key));
    }
    async importKey(format, key, isPublic = !0) {
      return await this._prim.importKey(format, key, isPublic);
    }
    async generateKeyPair() {
      return await this._prim.generateKeyPair();
    }
    async deriveKeyPair(ikm) {
      let rawIkm = toArrayBuffer(ikm);
      if (rawIkm.byteLength > 8192)
        throw new InvalidParamError("Too long ikm");
      return await this._prim.deriveKeyPair(rawIkm);
    }
    async encap(params) {
      let ke;
      params.ekm === void 0 ? ke = await this.generateKeyPair() : isCryptoKeyPair(params.ekm) ? ke = params.ekm : ke = await this.deriveKeyPair(params.ekm);
      let enc = await this._prim.serializePublicKey(ke.publicKey), pkrm = await this._prim.serializePublicKey(params.recipientPublicKey), dh = EMPTY, dh1 = EMPTY, dh2 = EMPTY;
      try {
        dh1 = new Uint8Array(await this._prim.dh(ke.privateKey, params.recipientPublicKey)), dh = dh1;
        let pksm = EMPTY;
        if (params.senderKey !== void 0) {
          let sks = isCryptoKeyPair(params.senderKey) ? params.senderKey.privateKey : params.senderKey;
          dh2 = new Uint8Array(await this._prim.dh(sks, params.recipientPublicKey)), dh = concat(dh1, dh2), dh1.fill(0), dh2.fill(0);
          let pks = isCryptoKeyPair(params.senderKey) ? params.senderKey.publicKey : await this._prim.derivePublicKey(params.senderKey);
          pksm = new Uint8Array(await this._prim.serializePublicKey(pks));
        }
        let kemContext = concat(new Uint8Array(enc), new Uint8Array(pkrm), pksm), sharedSecret = await this._generateSharedSecret(dh, kemContext);
        return {
          enc,
          sharedSecret
        };
      } catch (e) {
        throw new EncapError(e);
      } finally {
        dh.fill(0), dh1.fill(0), dh2.fill(0);
      }
    }
    async decap(params) {
      let enc = toArrayBuffer(params.enc), pke = await this._prim.deserializePublicKey(enc), skr = isCryptoKeyPair(params.recipientKey) ? params.recipientKey.privateKey : params.recipientKey, pkr = isCryptoKeyPair(params.recipientKey) ? params.recipientKey.publicKey : await this._prim.derivePublicKey(params.recipientKey), pkrm = await this._prim.serializePublicKey(pkr), dh = EMPTY, dh1 = EMPTY, dh2 = EMPTY;
      try {
        dh1 = new Uint8Array(await this._prim.dh(skr, pke)), dh = dh1;
        let pksm = EMPTY;
        params.senderPublicKey !== void 0 && (dh2 = new Uint8Array(await this._prim.dh(skr, params.senderPublicKey)), dh = concat(dh1, dh2), dh1.fill(0), dh2.fill(0), pksm = new Uint8Array(await this._prim.serializePublicKey(params.senderPublicKey)));
        let kemContext = concat(new Uint8Array(enc), new Uint8Array(pkrm), pksm);
        return await this._generateSharedSecret(dh, kemContext);
      } catch (e) {
        throw new DecapError(e);
      } finally {
        dh.fill(0), dh1.fill(0), dh2.fill(0);
      }
    }
    async _generateSharedSecret(dh, kemContext) {
      let labeledIkm = this._kdf.buildLabeledIkm(LABEL_EAE_PRK, dh);
      try {
        let labeledInfo = this._kdf.buildLabeledInfo(LABEL_SHARED_SECRET, kemContext, this.secretSize);
        return await this._kdf.extractAndExpand(EMPTY, labeledIkm, labeledInfo, this.secretSize);
      } finally {
        labeledIkm.fill(0);
      }
    }
  }, KEM_USAGES = ["deriveBits"], LABEL_DKP_PRK = /* @__PURE__ */ new Uint8Array([
    100,
    107,
    112,
    95,
    112,
    114,
    107
  ]), LABEL_CANDIDATE = /* @__PURE__ */ new Uint8Array([
    99,
    97,
    110,
    100,
    105,
    100,
    97,
    116,
    101
  ]), EC_P_256 = {
    namedCurve: "P-256",
    size: 32,
    bitmask: 255,
    // deno-fmt-ignore
    pkcs8AlgId: /* @__PURE__ */ new Uint8Array([
      48,
      65,
      2,
      1,
      0,
      48,
      19,
      6,
      7,
      42,
      134,
      72,
      206,
      61,
      2,
      1,
      6,
      8,
      42,
      134,
      72,
      206,
      61,
      3,
      1,
      7,
      4,
      39,
      48,
      37,
      2,
      1,
      1,
      4,
      32
    ]),
    n: 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n
  };
  function bigIntToBytes(v, len) {
    let out = new Uint8Array(len), n = v;
    for (let i2 = len - 1; i2 >= 0; i2--)
      out[i2] = Number(n & 0xffn), n >>= 8n;
    if (n !== 0n)
      throw new Error("Invalid coordinate length");
    return out;
  }
  function lessThan(a, b) {
    for (let i2 = 0; i2 < a.length; i2++)
      if (a[i2] !== b[i2])
        return a[i2] < b[i2];
    return !1;
  }
  function isZero(a) {
    let acc = 0;
    for (let i2 = 0; i2 < a.length; i2++)
      acc |= a[i2];
    return acc === 0;
  }
  var EcDhkemPrimitives = class extends NativeAlgorithm {
    /**
     * @param curve The curve parameters ({@link EC_P_256}, {@link EC_P_384} or {@link EC_P_521}).
     * @param hkdf The KDF used for DeriveKeyPair.
     */
    constructor(curve, hkdf) {
      super(), Object.defineProperty(this, "_hkdf", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), Object.defineProperty(this, "_curve", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), Object.defineProperty(this, "_alg", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), Object.defineProperty(this, "_nPk", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), Object.defineProperty(this, "_nSk", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), this._hkdf = hkdf, this._curve = curve, this._alg = { name: "ECDH", namedCurve: curve.namedCurve }, this._nPk = 1 + curve.size * 2, this._nSk = curve.size;
    }
    async serializePublicKey(key) {
      await this._setup();
      try {
        return await this._api.exportKey("raw", key);
      } catch (e) {
        throw new SerializeError(e);
      }
    }
    async deserializePublicKey(key) {
      await this._setup();
      try {
        return await this._importRawKey(toArrayBuffer(key), !0);
      } catch (e) {
        throw new DeserializeError(e);
      }
    }
    async serializePrivateKey(key) {
      await this._setup();
      try {
        let jwk = await this._api.exportKey("jwk", key);
        if (!("d" in jwk))
          throw new Error("Not private key");
        return base64UrlToBytes(jwk.d).buffer;
      } catch (e) {
        throw new SerializeError(e);
      }
    }
    async deserializePrivateKey(key) {
      await this._setup();
      try {
        return await this._importRawKey(toArrayBuffer(key), !1);
      } catch (e) {
        throw new DeserializeError(e);
      }
    }
    async importKey(format, key, isPublic) {
      await this._setup();
      try {
        if (format === "raw")
          return await this._importRawKey(key, isPublic);
        if (key instanceof ArrayBuffer)
          throw new Error("Invalid jwk key format");
        return await this._importJWK(key, isPublic);
      } catch (e) {
        throw new DeserializeError(e);
      }
    }
    async generateKeyPair() {
      await this._setup();
      try {
        return await this._api.generateKey(this._alg, !0, KEM_USAGES);
      } catch (e) {
        throw new NotSupportedError(e);
      }
    }
    async deriveKeyPair(ikm) {
      await this._setup();
      try {
        let rawIkm = toArrayBuffer(ikm), dkpPrk = await this._hkdf.labeledExtract(EMPTY, LABEL_DKP_PRK, new Uint8Array(rawIkm)), order = bigIntToBytes(this._curve.n, this._nSk), sk;
        for (let counter = 0; sk === void 0; counter++) {
          if (counter > 255)
            throw new Error("Faild to derive a key pair");
          let bytes2 = new Uint8Array(await this._hkdf.labeledExpand(dkpPrk, LABEL_CANDIDATE, i2Osp(counter, 1), this._nSk));
          bytes2[0] = bytes2[0] & this._curve.bitmask, !isZero(bytes2) && lessThan(bytes2, order) && (sk = await this._deserializePkcs8Key(bytes2)), bytes2.fill(0);
        }
        return {
          privateKey: sk,
          publicKey: await this.derivePublicKey(sk)
        };
      } catch (e) {
        throw new DeriveKeyPairError(e);
      }
    }
    async derivePublicKey(key) {
      await this._setup();
      let api = this._api;
      try {
        let jwk;
        try {
          jwk = await api.exportKey("jwk", key);
        } catch {
          jwk = await api.exportKey("jwk", await api.importKey("pkcs8", await api.exportKey("pkcs8", key), this._alg, !0, KEM_USAGES));
        }
        return delete jwk.d, delete jwk.key_ops, await api.importKey("jwk", jwk, this._alg, !0, []);
      } catch (e) {
        throw new DeserializeError(e);
      }
    }
    async dh(sk, pk) {
      try {
        return await this._setup(), await this._api.deriveBits({
          name: "ECDH",
          public: pk
        }, sk, this._nSk * 8);
      } catch (e) {
        throw new SerializeError(e);
      }
    }
    async _importRawKey(key, isPublic) {
      if (isPublic && key.byteLength !== this._nPk)
        throw new Error("Invalid public key for the ciphersuite");
      if (!isPublic && key.byteLength !== this._nSk)
        throw new Error("Invalid private key for the ciphersuite");
      return isPublic ? await this._api.importKey("raw", key, this._alg, !0, []) : await this._deserializePkcs8Key(new Uint8Array(key));
    }
    async _importJWK(key, isPublic) {
      if (typeof key.crv > "u" || key.crv !== this._alg.namedCurve)
        throw new Error(`Invalid crv: ${key.crv}`);
      if (isPublic) {
        if (typeof key.d < "u")
          throw new Error("Invalid key: `d` should not be set");
        return await this._api.importKey("jwk", key, this._alg, !0, []);
      }
      if (typeof key.d > "u")
        throw new Error("Invalid key: `d` not found");
      return await this._api.importKey("jwk", key, this._alg, !0, KEM_USAGES);
    }
    async _deserializePkcs8Key(k) {
      let algId = this._curve.pkcs8AlgId, pkcs8Key = new Uint8Array(algId.length + k.length);
      pkcs8Key.set(algId, 0), pkcs8Key.set(k, algId.length);
      try {
        return await this._api.importKey("pkcs8", pkcs8Key, this._alg, !0, KEM_USAGES);
      } finally {
        pkcs8Key.fill(0);
      }
    }
  }, AEAD_USAGES = ["encrypt", "decrypt"], AesGcmContext = class extends NativeAlgorithm {
    constructor(key) {
      super(), Object.defineProperty(this, "_rawKey", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), Object.defineProperty(this, "_key", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), this._rawKey = toArrayBuffer(key);
    }
    async seal(iv, data, aad) {
      await this._setupKey();
      let alg = {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(aad)
      };
      return await this._api.encrypt(alg, this._key, toArrayBuffer(data));
    }
    async open(iv, data, aad) {
      await this._setupKey();
      let alg = {
        name: "AES-GCM",
        iv: toArrayBuffer(iv),
        additionalData: toArrayBuffer(aad)
      };
      return await this._api.decrypt(alg, this._key, toArrayBuffer(data));
    }
    async _setupKey() {
      if (this._key !== void 0)
        return;
      await this._setup();
      let key = await this._importKey(this._rawKey);
      new Uint8Array(this._rawKey).fill(0), this._key = key;
    }
    async _importKey(key) {
      return await this._api.importKey("raw", key, { name: "AES-GCM" }, !0, AEAD_USAGES);
    }
  }, Aes128Gcm = class {
    constructor() {
      Object.defineProperty(this, "id", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: 1
      }), Object.defineProperty(this, "keySize", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: 16
      }), Object.defineProperty(this, "nonceSize", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: 12
      }), Object.defineProperty(this, "tagSize", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: 16
      });
    }
    createEncryptionContext(key) {
      return new AesGcmContext(key);
    }
  }, LABEL_SEC = new Uint8Array([115, 101, 99]), ExporterContextImpl = class {
    constructor(kdf, exporterSecret) {
      Object.defineProperty(this, "exporterSecret", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), Object.defineProperty(this, "_kdf", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), this._kdf = kdf, this.exporterSecret = exporterSecret;
    }
    seal(_data, _aad) {
      return Promise.reject(new NotSupportedError("Not supported"));
    }
    open(_data, _aad) {
      return Promise.reject(new NotSupportedError("Not supported"));
    }
    async export(exporterContext, len) {
      let rawExporterContext = toArrayBuffer(exporterContext);
      if (rawExporterContext.byteLength > 8192)
        throw new InvalidParamError("Too long exporter context");
      try {
        return await this._kdf.labeledExpand(this.exporterSecret, LABEL_SEC, new Uint8Array(rawExporterContext), len);
      } catch (e) {
        throw new ExportError(e);
      }
    }
  }, RecipientExporterContextImpl = class extends ExporterContextImpl {
  }, SenderExporterContextImpl = class extends ExporterContextImpl {
    constructor(kdf, exporterSecret, enc) {
      super(kdf, exporterSecret), Object.defineProperty(this, "enc", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), this.enc = enc;
    }
  }, EncryptionContextImpl = class extends ExporterContextImpl {
    constructor(kdf, params) {
      super(kdf, params.exporterSecret), Object.defineProperty(this, "_ctx", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), this._ctx = {
        key: params.aead.createEncryptionContext(params.key),
        baseNonce: params.baseNonce,
        seq: params.seq
      };
    }
    computeNonce(k) {
      let seqBytes = i2Osp(k.seq, k.baseNonce.byteLength);
      return xor(k.baseNonce, seqBytes).buffer;
    }
    incrementSeq(k) {
      if (k.seq > Number.MAX_SAFE_INTEGER)
        throw new MessageLimitReachedError("Message limit reached");
      k.seq += 1;
    }
  }, __classPrivateFieldGet = function(receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state == "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
  }, __classPrivateFieldSet = function(receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state == "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
  }, _Mutex_locked, Mutex = class {
    constructor() {
      _Mutex_locked.set(this, Promise.resolve());
    }
    async lock() {
      let releaseLock, nextLock = new Promise((resolve) => {
        releaseLock = resolve;
      }), previousLock = __classPrivateFieldGet(this, _Mutex_locked, "f");
      return __classPrivateFieldSet(this, _Mutex_locked, nextLock, "f"), await previousLock, releaseLock;
    }
  };
  _Mutex_locked = /* @__PURE__ */ new WeakMap();
  var __classPrivateFieldGet2 = function(receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state == "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
  }, __classPrivateFieldSet2 = function(receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state == "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
  }, _RecipientContextImpl_mutex, RecipientContextImpl = class extends EncryptionContextImpl {
    constructor() {
      super(...arguments), _RecipientContextImpl_mutex.set(this, void 0);
    }
    async open(data, aad = EMPTY.buffer) {
      __classPrivateFieldSet2(this, _RecipientContextImpl_mutex, __classPrivateFieldGet2(this, _RecipientContextImpl_mutex, "f") ?? new Mutex(), "f");
      let release = await __classPrivateFieldGet2(this, _RecipientContextImpl_mutex, "f").lock(), pt;
      try {
        pt = await this._ctx.key.open(this.computeNonce(this._ctx), toArrayBuffer(data), toArrayBuffer(aad));
      } catch (e) {
        throw new OpenError(e);
      } finally {
        release();
      }
      return this.incrementSeq(this._ctx), pt;
    }
  };
  _RecipientContextImpl_mutex = /* @__PURE__ */ new WeakMap();
  var __classPrivateFieldGet3 = function(receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state == "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
  }, __classPrivateFieldSet3 = function(receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state == "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
  }, _SenderContextImpl_mutex, SenderContextImpl = class extends EncryptionContextImpl {
    constructor(kdf, params, enc) {
      super(kdf, params), Object.defineProperty(this, "enc", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), _SenderContextImpl_mutex.set(this, void 0), this.enc = enc;
    }
    async seal(data, aad = EMPTY.buffer) {
      __classPrivateFieldSet3(this, _SenderContextImpl_mutex, __classPrivateFieldGet3(this, _SenderContextImpl_mutex, "f") ?? new Mutex(), "f");
      let release = await __classPrivateFieldGet3(this, _SenderContextImpl_mutex, "f").lock(), ct;
      try {
        ct = await this._ctx.key.seal(this.computeNonce(this._ctx), toArrayBuffer(data), toArrayBuffer(aad));
      } catch (e) {
        throw new SealError(e);
      } finally {
        release();
      }
      return this.incrementSeq(this._ctx), ct;
    }
  };
  _SenderContextImpl_mutex = /* @__PURE__ */ new WeakMap();
  function checkAuthSupport(kem) {
    if ("auth" in kem && kem.auth === !1)
      throw new NotSupportedError("Auth and AuthPSK modes are not supported by this KEM");
  }
  var LABEL_BASE_NONCE = new Uint8Array([
    98,
    97,
    115,
    101,
    95,
    110,
    111,
    110,
    99,
    101
  ]), LABEL_EXP = new Uint8Array([101, 120, 112]), LABEL_INFO_HASH = new Uint8Array([
    105,
    110,
    102,
    111,
    95,
    104,
    97,
    115,
    104
  ]), LABEL_KEY = new Uint8Array([107, 101, 121]), LABEL_PSK_ID_HASH = new Uint8Array([
    112,
    115,
    107,
    95,
    105,
    100,
    95,
    104,
    97,
    115,
    104
  ]), LABEL_SECRET = new Uint8Array([115, 101, 99, 114, 101, 116]), SUITE_ID_HEADER_HPKE = new Uint8Array([
    72,
    80,
    75,
    69,
    0,
    0,
    0,
    0,
    0,
    0
  ]), CipherSuiteNative = class extends NativeAlgorithm {
    /**
     * @param params A set of parameters for building a cipher suite.
     *
     * If the error occurred, throws {@link InvalidParamError}.
     *
     * @throws {@link InvalidParamError}
     */
    constructor(params) {
      if (super(), Object.defineProperty(this, "_kem", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), Object.defineProperty(this, "_kdf", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), Object.defineProperty(this, "_aead", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), Object.defineProperty(this, "_suiteId", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: void 0
      }), typeof params.kem == "number")
        throw new InvalidParamError("KemId cannot be used");
      if (this._kem = params.kem, typeof params.kdf == "number")
        throw new InvalidParamError("KdfId cannot be used");
      if (this._kdf = params.kdf, typeof params.aead == "number")
        throw new InvalidParamError("AeadId cannot be used");
      this._aead = params.aead, this._suiteId = new Uint8Array(SUITE_ID_HEADER_HPKE), this._suiteId.set(i2Osp(this._kem.id, 2), 4), this._suiteId.set(i2Osp(this._kdf.id, 2), 6), this._suiteId.set(i2Osp(this._aead.id, 2), 8), this._kdf.init(this._suiteId);
    }
    /**
     * Gets the KEM context of the ciphersuite.
     */
    get kem() {
      return this._kem;
    }
    /**
     * Gets the KDF context of the ciphersuite.
     */
    get kdf() {
      return this._kdf;
    }
    /**
     * Gets the AEAD context of the ciphersuite.
     */
    get aead() {
      return this._aead;
    }
    /**
     * Creates an encryption context for a sender.
     *
     * If the error occurred, throws {@link DecapError} | {@link ValidationError}.
     *
     * @param params A set of parameters for the sender encryption context.
     * @returns A sender encryption context.
     * @throws {@link NotSupportedError} if the KEM does not support authentication.
     * @throws {@link EncapError}, {@link ValidationError}
     */
    async createSenderContext(params) {
      params.senderKey !== void 0 && checkAuthSupport(this._kem), this._validateInputLength(params), await this._setup();
      let dh = await this._kem.encap(params), mode = (params.psk !== void 0 ? 1 : 0) | (params.senderKey !== void 0 ? 2 : 0);
      return await this._keyScheduleS(mode, dh.sharedSecret, dh.enc, params);
    }
    /**
     * Creates an encryption context for a recipient.
     *
     * If the error occurred, throws {@link DecapError}
     * | {@link DeserializeError} | {@link ValidationError}.
     *
     * @param params A set of parameters for the recipient encryption context.
     * @returns A recipient encryption context.
     * @throws {@link NotSupportedError} if the KEM does not support authentication.
     * @throws {@link DecapError}, {@link DeserializeError}, {@link ValidationError}
     */
    async createRecipientContext(params) {
      params.senderPublicKey !== void 0 && checkAuthSupport(this._kem), this._validateInputLength(params), await this._setup();
      let sharedSecret = await this._kem.decap(params), mode = (params.psk !== void 0 ? 1 : 0) | (params.senderPublicKey !== void 0 ? 2 : 0);
      return await this._keyScheduleR(mode, sharedSecret, params);
    }
    /**
     * Encrypts a message to a recipient.
     *
     * If the error occurred, throws `EncapError` | `MessageLimitReachedError` | `SealError` | `ValidationError`.
     *
     * @param params A set of parameters for building a sender encryption context.
     * @param pt A plain text as bytes to be encrypted.
     * @param aad Additional authenticated data as bytes fed by an application.
     * @returns A cipher text and an encapsulated key as bytes.
     * @throws {@link EncapError}, {@link MessageLimitReachedError}, {@link SealError}, {@link ValidationError}
     */
    async seal(params, pt, aad = EMPTY.buffer) {
      let ctx = await this.createSenderContext(params);
      return {
        ct: await ctx.seal(pt, aad),
        enc: ctx.enc
      };
    }
    /**
     * Decrypts a message from a sender.
     *
     * If the error occurred, throws `DecapError` | `DeserializeError` | `OpenError` | `ValidationError`.
     *
     * @param params A set of parameters for building a recipient encryption context.
     * @param ct An encrypted text as bytes to be decrypted.
     * @param aad Additional authenticated data as bytes fed by an application.
     * @returns A decrypted plain text as bytes.
     * @throws {@link DecapError}, {@link DeserializeError}, {@link OpenError}, {@link ValidationError}
     */
    async open(params, ct, aad = EMPTY.buffer) {
      return await (await this.createRecipientContext(params)).open(ct, aad);
    }
    // private verifyPskInputs(mode: Mode, params: KeyScheduleParams) {
    //   const gotPsk = (params.psk !== undefined);
    //   const gotPskId = (params.psk !== undefined && params.psk.id.byteLength > 0);
    //   if (gotPsk !== gotPskId) {
    //     throw new Error('Inconsistent PSK inputs');
    //   }
    //   if (gotPsk && (mode === Mode.Base || mode === Mode.Auth)) {
    //     throw new Error('PSK input provided when not needed');
    //   }
    //   if (!gotPsk && (mode === Mode.Psk || mode === Mode.AuthPsk)) {
    //     throw new Error('Missing required PSK input');
    //   }
    //   return;
    // }
    async _keySchedule(mode, sharedSecret, params) {
      let pskId = params.psk === void 0 ? EMPTY : toUint8Array(params.psk.id), pskIdHash = await this._kdf.labeledExtract(EMPTY, LABEL_PSK_ID_HASH, pskId), info = params.info === void 0 ? EMPTY : toUint8Array(params.info), infoHash = await this._kdf.labeledExtract(EMPTY, LABEL_INFO_HASH, info), keyScheduleContext = concat(new Uint8Array([mode]), new Uint8Array(pskIdHash), new Uint8Array(infoHash)), psk = params.psk === void 0 ? EMPTY : toUint8Array(params.psk.key), ikm = this._kdf.buildLabeledIkm(LABEL_SECRET, psk), exporterSecretInfo = this._kdf.buildLabeledInfo(LABEL_EXP, keyScheduleContext, this._kdf.hashSize), exporterSecret = await this._kdf.extractAndExpand(sharedSecret, ikm, exporterSecretInfo, this._kdf.hashSize);
      if (this._aead.id === 65535)
        return { aead: this._aead, exporterSecret };
      let keyInfo = this._kdf.buildLabeledInfo(LABEL_KEY, keyScheduleContext, this._aead.keySize), key = await this._kdf.extractAndExpand(sharedSecret, ikm, keyInfo, this._aead.keySize), baseNonceInfo = this._kdf.buildLabeledInfo(LABEL_BASE_NONCE, keyScheduleContext, this._aead.nonceSize), baseNonce = await this._kdf.extractAndExpand(sharedSecret, ikm, baseNonceInfo, this._aead.nonceSize);
      return {
        aead: this._aead,
        exporterSecret,
        key,
        baseNonce: new Uint8Array(baseNonce),
        seq: 0
      };
    }
    async _keyScheduleS(mode, sharedSecret, enc, params) {
      let res = await this._keySchedule(mode, sharedSecret, params);
      return res.key === void 0 ? new SenderExporterContextImpl(this._kdf, res.exporterSecret, enc) : new SenderContextImpl(this._kdf, res, enc);
    }
    async _keyScheduleR(mode, sharedSecret, params) {
      let res = await this._keySchedule(mode, sharedSecret, params);
      return res.key === void 0 ? new RecipientExporterContextImpl(this._kdf, res.exporterSecret) : new RecipientContextImpl(this._kdf, res);
    }
    _validateInputLength(params) {
      if (params.info !== void 0 && params.info.byteLength > 268435456)
        throw new InvalidParamError("Too long info");
      if (params.psk !== void 0) {
        if (params.psk.key.byteLength < 32)
          throw new InvalidParamError("PSK must have at least 32 bytes");
        if (params.psk.key.byteLength > 8192)
          throw new InvalidParamError("Too long psk.key");
        if (params.psk.id.byteLength > 8192)
          throw new InvalidParamError("Too long psk.id");
      }
    }
  }, DhkemP256HkdfSha256Native = class extends Dhkem {
    constructor() {
      let kdf = new HkdfSha256Native(), prim = new EcDhkemPrimitives(EC_P_256, kdf);
      super(16, prim, kdf), Object.defineProperty(this, "id", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: 16
      }), Object.defineProperty(this, "secretSize", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: 32
      }), Object.defineProperty(this, "encSize", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: 65
      }), Object.defineProperty(this, "publicKeySize", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: 65
      }), Object.defineProperty(this, "privateKeySize", {
        enumerable: !0,
        configurable: !0,
        writable: !0,
        value: 32
      });
    }
  }, CipherSuite = class extends CipherSuiteNative {
  }, DhkemP256HkdfSha256 = class extends DhkemP256HkdfSha256Native {
  }, HkdfSha256 = class extends HkdfSha256Native {
  }, suite = new CipherSuite({ kem: new DhkemP256HkdfSha256(), kdf: new HkdfSha256(), aead: new Aes128Gcm() }), utf8 = new TextEncoder(), decodeAscii = new TextDecoder("utf-8", { fatal: !0 }), PAIR_REQUEST = "SGSP1", PAIR_INVITE = "SGSI2", PAIR_UPDATE = "SGSU2", PIN_FORMAT = /^[0-9]{4}$/, domainFormat = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
  function joinBytes(...parts) {
    let bytes2 = new Uint8Array(parts.reduce((size, part) => size + part.length, 0)), offset = 0;
    for (let part of parts)
      bytes2.set(part, offset), offset += part.length;
    return bytes2;
  }
  function unpack(code, prefix3, limit2) {
    let value = typeof code == "string" ? code.trim() : "";
    if (value.length > limit2 || !value.startsWith(prefix3 + ".")) throw new Error("invalid_code");
    return fromBase64url(value.slice(prefix3.length + 1));
  }
  async function createPairingRequest(crypto) {
    let id = crypto.getRandomValues(new Uint8Array(16)), keys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, !1, ["deriveBits"]), publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
    return { id: base64url(id), code: PAIR_REQUEST + "." + base64url(joinBytes(id, publicKey)), keys };
  }
  function parseEndpoint(bytes2, invite) {
    let flags = bytes2[0], hasIpv4 = flags & 4, hasIpv6 = flags & 8, hasDomain = flags & 16, min = 72 + (invite ? 32 : 0) + (hasIpv4 ? 4 : 0) + (hasIpv6 ? 16 : 0);
    if (flags & 224 || !hasIpv4 && !hasIpv6 || bytes2.length < min) throw new Error("invalid_endpoint");
    let view = new DataView(bytes2.buffer, bytes2.byteOffset, bytes2.byteLength), port = view.getUint16(1), expiry = view.getUint32(3);
    if (!port || !expiry) throw new Error("invalid_endpoint");
    let offset = 7, take = (length) => {
      let value = bytes2.slice(offset, offset + length);
      return offset += length, value;
    }, token = invite ? base64url(take(32)) : "", signer = base64url(take(65)), ipv4 = hasIpv4 ? [...take(4)].join(".") : "", ipv6 = hasIpv6 ? take(16).reduce((groups2, byte, index, ip) => index % 2 ? [...groups2, (ip[index - 1] << 8 | byte).toString(16)] : groups2, []).join(":") : "", domain = hasDomain ? decodeAscii.decode(take(take(1)[0])) : "";
    if (offset !== bytes2.length || hasDomain && !domainFormat.test(domain)) throw new Error("invalid_endpoint");
    return { tls: !!(flags & 1), local: !!(flags & 2), port, expiry, token, signer, ipv4, ipv6, domain };
  }
  async function openPairing(code, prefix3, findRecipientKeys) {
    let bytes2 = unpack(code, prefix3, 640);
    if (bytes2.length < 173) throw new Error("invalid_code");
    let id = bytes2.slice(0, 16), requestId = base64url(id), recipientKey = await findRecipientKeys(requestId);
    if (!recipientKey) throw new Error("pairing_device_mismatch");
    let plaintext = await (await suite.createRecipientContext({ recipientKey, enc: bytes2.slice(16, 81), info: utf8.encode(prefix3) })).open(bytes2.slice(81), id);
    return { ...parseEndpoint(new Uint8Array(plaintext), prefix3 === PAIR_INVITE), requestId };
  }
  function syncProofBytes({ nonce, origin, next, revision, challenge, stargazing }) {
    let fields2 = [nonce, origin, next, revision, challenge];
    return typeof stargazing == "boolean" && fields2.push(stargazing), utf8.encode(JSON.stringify(fields2));
  }
  var prefix = "SGPI1", PUBLIC_INVITE_PATH = "/v2/vault/redeem-invitation";
  function publicBindingTarget(value) {
    let target = value.trim();
    if (!target.startsWith(prefix + ".")) return { origin: publicOrigin(target) };
    try {
      let [address, invitation] = unpackPublicCode(prefix, target, 2);
      if (!tokenFormat.test(invitation)) throw new Error();
      return { origin: publicOrigin(address), invitation };
    } catch {
      throw new Error("\u4E00\u6B21\u6027\u9080\u8BF7\u7801\u683C\u5F0F\u65E0\u6548\uFF0C\u8BF7\u91CD\u65B0\u590D\u5236");
    }
  }
  var generalPoolKey = (account) => "schemes:" + account, PREFERENCES_LIMIT = 4 * 1024 * 1024, PREFERENCE_GROUPS = Object.freeze(["toolbox", "generalPools", "friends", "friendLamps", "pluginSettings"]), isObject2 = (value) => value !== null && typeof value == "object" && !Array.isArray(value), has = (object2, key) => Object.prototype.hasOwnProperty.call(object2, key), oneOf = (...values) => (value) => values.includes(value), boolean = (value) => typeof value == "boolean", text2 = (limit2) => (value) => typeof value == "string" && value.length <= limit2, positiveId = (value) => Number.isSafeInteger(value) && value > 0, userId = (value) => typeof value == "string" && /^\d{10}$/.test(value) && Number(value) > 0 && Number(value) <= 4294967295, timestamp = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 864e13, listOf = (test, max2) => (value) => Array.isArray(value) && value.length <= max2 && value.every(test), boolFields = (keys) => Object.fromEntries(keys.split(" ").map((key) => [key, boolean])), fields = Object.freeze({
    fontSize: oneOf("tiny", "small", "standard", "large"),
    fontSettingsCollapsed: boolean,
    theme: (value) => typeof value == "string" && /^[a-z0-9][a-z0-9._-]{0,95}$/i.test(value),
    themeWorkshopCollapsed: boolean,
    hudEdgeBehavior: oneOf("none", "hide", "fixed"),
    compactOpacity: oneOf(60, 80, 100),
    screenshotHideUI: boolean,
    screenshotShortcut: (value) => value === null || isObject2(value) && typeof value.code == "string" && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(value.code) && ["ctrl", "shift", "alt", "meta"].every((key) => boolean(value[key])),
    compatEnabled: boolean,
    compatPolicy: oneOf("hide", "exit-known"),
    marketOnlyUninstalled: boolean,
    refreshReentryEnabled: boolean,
    cardStyle: text2(96),
    cardFaceStyle: text2(96),
    cardBackStyle: text2(96),
    cardStyleScope: oneOf("self", "all"),
    cardStyleExpanded: boolean
  }), TOOLBOX_SYNC_KEYS = Object.freeze(Object.keys(fields)), watchFields = {
    watchVersion: oneOf(2),
    cards: boolean,
    lamps: boolean,
    scheme: oneOf("default", "custom"),
    landlord: listOf(text2(48), 10),
    farmer: listOf(text2(48), 10),
    ...Object.fromEntries(["landlordIds", "farmerIds", "defaultLandlordIds", "defaultFarmerIds"].map((key) => [key, listOf((value) => value === null || positiveId(value), 10)]))
  }, pluginFields = {
    backgrounds: boolFields("animated attackEffects"),
    cards: {
      ...boolFields("recent deck discard reveals labels fourColors handSort countdown skillCounts skillHints handGroupSpacing queryExpanded"),
      revealOpacity: oneOf(60, 80, 100),
      revealColumns: oneOf(4, 5, 6, 7, 8),
      discardMode: oneOf("time", "suit", "type", "number"),
      recentMode: oneOf("player", "current"),
      deckGroup: oneOf("name", "suit", "number"),
      lockedSort: (value) => value === null || Number.isSafeInteger(value)
    },
    effects: boolFields("selection sha shan trick equip shake heal kill skill selfSkin otherSkin tianshu ad version banner notice redDot slogan emotion rogue entrance result package prob download"),
    "play-assist": {
      ...boolFields("skillLock autoConfirm fireAttack skipWuxie skipTao skipAssist quandaoCount rapid"),
      rememberedSkillIds: listOf(positiveId, 1e4)
    },
    "player-info": { settings: isObject2 },
    shanhetu: boolFields("labels enemies events optionImpact keepBattleBackground"),
    skins: {
      ...boolFields("advanced quickDownload backgroundShortcut unlockSkin unlockDynamic otherPlayers crossServer yjcmDynamicOptimization"),
      nativeGroup: oneOf("country", "quality")
    },
    social: boolFields("onlyPasswordFreeRooms")
  }, pluginSettingFields = Object.fromEntries(Object.entries(pluginFields).flatMap(([id, config]) => Object.entries(config).map(([key, test]) => [id + ":" + key, test]))), PLUGIN_SYNC_KEYS = Object.freeze(Object.keys(pluginSettingFields)), accountFields = {
    "gaizhu:account:@:options-v1": {
      pick: oneOf("off", "random", "order"),
      wait: boolean,
      autoMode: oneOf("identity", "nation", "training"),
      stopMode: oneOf("manual", "tavern", "timed"),
      stopHours: (value) => Number.isFinite(value) && value > 0 && Number.isSafeInteger(Math.ceil(value * 36e5))
    },
    "daily-rewards:account:@:options": {
      schemaVersion: oneOf(2),
      ...boolFields("sign mail tasks welfare activities autoFlip codes serverCodes clipboardCodes shareCodes excludeRecruit excludeCoupon excludeTrial excludeBeans")
    }
  }, accountListFields = { "shanhetu:followedSchools:@": listOf(positiveId, 512) }, ACCOUNT_SYNC_KEYS = Object.freeze([...Object.keys(accountFields), ...Object.keys(accountListFields)]), syncPluginStorageKey = (key, account) => key.replace(":@", ":" + account), LEDGER_THRESHOLD_PREFIX = "ledger:threshold:", ledgerThresholdKey = /^ledger:threshold:@:[1-9]\d{0,15}$/, cleanFields = (value, validators) => Object.fromEntries(Object.entries(validators).filter(([key, test]) => has(value, key) && test(value[key])).map(([key]) => [key, value[key]]));
  function cleanPluginSettings(value) {
    if (!isObject2(value)) throw new Error("\u63D2\u4EF6\u8BBE\u7F6E\u683C\u5F0F\u65E0\u6548");
    let result = cleanFields(value, { ...pluginSettingFields, ...accountListFields });
    for (let [key, validators] of Object.entries({ "player-info:settings": watchFields, ...accountFields }))
      has(value, key) && isObject2(value[key]) && (result[key] = cleanFields(value[key], validators));
    for (let [key, threshold] of Object.entries(value))
      ledgerThresholdKey.test(key) && Number.isFinite(threshold) && threshold >= 0 && (result[key] = threshold);
    return result;
  }
  function cleanToolbox(value) {
    if (!isObject2(value)) throw new Error("\u5DE5\u5177\u7BB1\u8BBE\u7F6E\u683C\u5F0F\u65E0\u6548");
    return Object.fromEntries(TOOLBOX_SYNC_KEYS.filter((key) => has(value, key) && fields[key](value[key])).map((key) => {
      let setting = value[key];
      if (key !== "screenshotShortcut" || setting === null) return [key, setting];
      let { code, ctrl, shift, alt, meta } = setting;
      return [key, { code, ctrl, shift, alt, meta }];
    }));
  }
  function cleanGeneralPools(value) {
    if (!Array.isArray(value) || value.length > 20) throw new Error("\u62D3\u5C55\u5C06\u6C60\u65B9\u6848\u683C\u5F0F\u65E0\u6548");
    let seen = /* @__PURE__ */ new Set();
    return value.map((row) => {
      if (!isObject2(row) || typeof row.id != "string" || !/^[a-z0-9-]{1,80}$/i.test(row.id) || seen.has(row.id) || typeof row.name != "string" || !row.name.trim() || row.name.length > 32 || !Array.isArray(row.ids) || row.ids.some((id) => !Number.isSafeInteger(id) || id < 1)) throw new Error("\u62D3\u5C55\u5C06\u6C60\u65B9\u6848\u683C\u5F0F\u65E0\u6548");
      return seen.add(row.id), { id: row.id, name: row.name, ids: [...new Set(row.ids)].sort((a, b) => a - b) };
    });
  }
  function cleanFriends(value) {
    if ((value == null ? void 0 : value.version) !== 1 || !isObject2(value.friends) || !listOf(userId, 2e3)(value.pins) || !Array.isArray(value.changes) || value.changes.length > 200) throw new Error("\u597D\u53CB\u8BB0\u5F55\u683C\u5F0F\u65E0\u6548");
    let entries = Object.entries(value.friends);
    if (entries.length > 2e3 || !entries.every(([id, row]) => userId(id) && text2(128)(row == null ? void 0 : row.name) && timestamp(row.seenAt) && (row.missingAt === void 0 || timestamp(row.missingAt)))) throw new Error("\u597D\u53CB\u5217\u8868\u683C\u5F0F\u65E0\u6548");
    let changes = value.changes.map((row) => {
      if (!userId(row == null ? void 0 : row.id) || !text2(128)(row.from) || !text2(128)(row.to) || !timestamp(row.at)) throw new Error("\u597D\u53CB\u6539\u540D\u8BB0\u5F55\u683C\u5F0F\u65E0\u6548");
      return { id: row.id, from: row.from, to: row.to, at: row.at };
    });
    return { version: 1, pins: [...new Set(value.pins)], friends: Object.fromEntries(entries.map(([id, row]) => [id, { name: row.name, seenAt: row.seenAt, ...row.missingAt && { missingAt: row.missingAt } }])), changes };
  }
  function cleanFriendLamps(value) {
    if ((value == null ? void 0 : value.version) !== 1 || !isObject2(value.friends)) throw new Error("\u597D\u53CB\u6C34\u8868\u683C\u5F0F\u65E0\u6548");
    let entries = Object.entries(value.friends);
    if (entries.length > 2e3) throw new Error("\u597D\u53CB\u6C34\u8868\u6570\u91CF\u8D85\u51FA\u4E0A\u9650");
    return { version: 1, friends: Object.fromEntries(entries.map(([id, row]) => {
      if (!userId(id) || !text2(128)(row == null ? void 0 : row.name) || !timestamp(row.at) || !listOf(positiveId, 1e4)(row.ids) || row.names !== void 0 && !isObject2(row.names)) throw new Error("\u597D\u53CB\u6C34\u8868\u683C\u5F0F\u65E0\u6548");
      let ids = [...new Set(row.ids)].sort((a, b) => a - b), names = Object.fromEntries(ids.filter((key) => row.names && has(row.names, key) && text2(128)(row.names[key])).map((key) => [key, row.names[key]]));
      return [id, { name: row.name, ids, names, at: row.at }];
    })) };
  }
  function cleanPreferences(value) {
    if (!isObject2(value)) throw new Error("\u540C\u6B65\u8BBE\u7F6E\u683C\u5F0F\u65E0\u6548");
    let result = {};
    if (has(value, "toolbox") && (result.toolbox = cleanToolbox(value.toolbox)), has(value, "generalPools") && (result.generalPools = cleanGeneralPools(value.generalPools)), has(value, "friends") && (result.friends = cleanFriends(value.friends)), has(value, "friendLamps") && (result.friendLamps = cleanFriendLamps(value.friendLamps)), has(value, "pluginSettings") && (result.pluginSettings = cleanPluginSettings(value.pluginSettings)), new TextEncoder().encode(JSON.stringify(result)).length > PREFERENCES_LIMIT) throw new Error("\u540C\u6B65\u5907\u4EFD\u8D85\u8FC7 4 MB");
    return result;
  }
  function mergePreferenceUpload(previous, values, { patch, preservePins } = {}) {
    let next = { ...previous, ...values };
    if (!patch) return next;
    for (let group of ["toolbox", "pluginSettings"])
      values[group] && (next[group] = { ...previous[group], ...values[group] });
    return preservePins && values.friends && previous.friends && (next.friends = { ...values.friends, pins: previous.friends.pins }), cleanPreferences(next);
  }
  function vaultRecords({ matches, ledger, preferences }) {
    let { events, ...ledgerDetails } = ledger;
    return [
      ["ledger", "details", ledgerDetails],
      ...events.map(({ id, ...details }) => ["event", id, details]),
      ...matches.map(({ gameId, ...details }) => ["match", gameId, details]),
      ...Object.entries(preferences ?? {}).map(([group, value]) => ["preferences", group, value])
    ];
  }
  function vaultSnapshot(records) {
    let matches = [], events = [], preferences = {}, ledger = EMPTY_LEDGER;
    for (let [kind, id, details] of records)
      kind === "match" ? matches.push({ gameId: id, ...details }) : kind === "event" ? events.push({ id, ...details }) : kind === "ledger" ? ledger = details : kind === "preferences" && PREFERENCE_GROUPS.includes(id) && (preferences[id] = details);
    return { matches, ledger: { ...ledger, events }, ...Object.keys(preferences).length && { preferences } };
  }
  var alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  function ledgerVersion(crypto) {
    let bytes2 = crypto.getRandomValues(new Uint8Array(16));
    bytes2[6] = bytes2[6] & 15 | 64, bytes2[8] = bytes2[8] & 63 | 128;
    let hex2 = Array.from(bytes2, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return [hex2.slice(0, 8), hex2.slice(8, 12), hex2.slice(12, 16), hex2.slice(16, 20), hex2.slice(20)].join("-");
  }
  function randomPass(crypto) {
    let value;
    do
      value = Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => alphabet[byte & 31]).join("");
    while (!/[2-9]/.test(value) || !/[A-Z]/.test(value));
    return value;
  }
  var publicRecovery = ({ origin, signer, vault, credential, seed, password, gameKey }) => packPublicCode("SGSC1", [origin, signer, vault, credential, seed, password, gameKey]);
  function readPublicRecovery(value) {
    let [origin, signer, vault, credential, seed, password, gameKey] = unpackPublicCode("SGSC1", value.trim(), 7);
    if (![vault, credential, seed].every((item) => tokenFormat.test(item)) || !passFormat.test(password) || !/^[a-f0-9]{64}$/.test(gameKey)) throw invalidPublicCode();
    return fromBase64url(signer, 65), { origin: publicOrigin(origin), signer, vault, credential, seed, password, gameKey };
  }
  function createPublicTransport(crypto, post) {
    let states = /* @__PURE__ */ new WeakMap(), authorize = ({ vault, credential }) => ({ vault, credential });
    async function stateFor(entry) {
      return states.has(entry) || states.set(entry, createVaultCipher(crypto, entry).then((cipher) => ({
        cipher,
        revision: -1,
        snapshot: { ledger: EMPTY_LEDGER, matches: [] },
        pending: Promise.resolve()
      }))), states.get(entry);
    }
    async function exchange(entry, origin, path, data, signal) {
      if (path === BACKUP_READ_PATH) {
        let { cipher } = await stateFor(entry), reply2 = await post(origin, "/v2/vault/backup", { ...authorize(entry), device: entry.device }, { signal });
        return reply2.retryAfter ? reply2 : { snapshot: vaultSnapshot(await Promise.all(reply2.snapshot.map(cipher.open))), cursor: reply2.cursor };
      }
      if (path === SYNC_CHANGES_PATH) {
        let { cipher } = await stateFor(entry), reply2 = await post(origin, PUBLIC_CHANGES_PATH, { ...authorize(entry), after: data.after }, { signal });
        if (reply2.reset) return reply2;
        let records = await Promise.all(reply2.records.map((row) => row[2] === null ? row : cipher.open(row)));
        return { ...reply2, records };
      }
      let state = await stateFor(entry), auth = authorize(entry), keys;
      data.uploadOnly && (path === PREFERENCES_SYNC_PATH ? keys = data.groups.map((group) => ["preferences", group]) : path === LEDGER_SYNC_PATH ? keys = [["ledger", "details"], ...data.events.map((row) => ["event", row.id])] : keys = [...data.names ? [["ledger", "details"]] : [], ...data.matches.map((row) => ["match", row.gameId])]);
      let run = state.pending.then(async () => {
        let revision = keys ? -1 : state.revision, before = state.snapshot;
        for (let attempt = 0; attempt < 5; attempt++) {
          let parameters = keys ? { ...auth, keys } : auth, reply2 = await post(origin, "/v2/vault/exchange", { ...parameters, revision, records: [] }, { signal });
          reply2.records !== null && (before = vaultSnapshot(await Promise.all(reply2.records.map(state.cipher.open)))), revision = reply2.revision, keys || (state.snapshot = before, state.revision = revision);
          let next = before, result;
          if (path === PREFERENCES_SYNC_PATH) {
            let known = before.preferences ?? {};
            data.values && (next = { ...before, preferences: mergePreferenceUpload(known, cleanPreferences(data.values), data) }), result = { values: Object.fromEntries(data.groups.filter((group) => known[group] !== void 0).map((group) => [group, known[group]])) };
          } else if (path === LEDGER_SYNC_PATH) {
            let { entry: ledger, conflicts } = mergeLedgerUpload(before.ledger, data, Date.now(), () => ledgerVersion(crypto));
            ledger !== before.ledger && (next = { ...before, ledger }), result = { conflicts, ...data.pull && { download: ledgerDownload(ledger, data.pull) } };
          } else {
            let matches = new Map(before.matches.map((row) => [row.gameId, row]));
            for (let row of data.matches) {
              let old = matches.get(row.gameId);
              (!old || !old.frame && row.frame && sameSyncMatch(old, row)) && matches.set(row.gameId, row);
            }
            if (matches.size > MATCH_SYNC_LIMIT) throw new Error("\u4E91\u7AEF\u6218\u7EE9\u8FBE\u5230\u5BB9\u91CF\u4E0A\u9650");
            let names = data.names ? { ...before.ledger.names, ...data.names } : before.ledger.names;
            next = { matches: [...matches.values()], ledger: { ...before.ledger, names } }, result = data.uploadOnly ? { ok: !0 } : { matches: next.matches };
          }
          if (next === before) return result;
          let originals = new Map(vaultRecords(before).map(([kind, id, details]) => [kind + ":" + id, JSON.stringify(details)])), changed = vaultRecords(next).filter(([kind, id, details]) => originals.get(kind + ":" + id) !== JSON.stringify(details));
          if (!changed.length) return result;
          let records = await Promise.all(changed.map(state.cipher.seal)), commit = await post(origin, "/v2/vault/exchange", { ...parameters, revision, records }, { signal });
          if (commit.records === null)
            return keys || (state.revision = commit.revision, state.snapshot = next), result;
        }
        throw new Error("\u4E91\u7AEF\u8BB0\u5F55\u6B63\u5728\u88AB\u5176\u4ED6\u8BBE\u5907\u4FEE\u6539\uFF0C\u8BF7\u91CD\u8BD5");
      });
      return state.pending = run.catch(() => {
      }), run;
    }
    return {
      exchange,
      async register(entry, profile, invitation) {
        let { cipher } = await stateFor(entry);
        return post(
          entry.origin,
          invitation ? PUBLIC_INVITE_PATH : "/v2/vault/register",
          { ...authorize(entry), verifier: cipher.verifier, profile, ...invitation && { invitation } }
        );
      },
      async stage(entry, device, profile) {
        let { cipher } = await stateFor(entry), { snapshot, fingerprint } = await post(entry.origin, "/v2/migrate/read", {}, { device }), records = await Promise.all(vaultRecords(snapshot).map(cipher.seal));
        await post(entry.origin, "/v2/migrate/stage", { ...authorize(entry), verifier: cipher.verifier, fingerprint, records, profile }, { device });
      },
      check: (entry, profile) => post(entry.origin, "/v2/vault/exchange", { ...authorize(entry), revision: -1, keys: [], records: [], profile }),
      async preview(code, pass) {
        return vaultSnapshot(await readPublicRecords(crypto, post, readPublicView(code), pass));
      }
    };
  }
  function publicUserCode(id) {
    return typeof id == "string" && /^\d{1,10}$/.test(id) && Number(id) > 0 && Number(id) <= 4294967295 ? id.padStart(10, "0") : "";
  }
  function publicUserName(name) {
    return name.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, "").trim().slice(0, 100);
  }
  var prefix2 = "SGSD1.", utf82 = new TextEncoder(), context = utf82.encode(prefix2);
  async function credentialKey(crypto, gameKey, salt) {
    let material = await crypto.subtle.importKey("raw", utf82.encode(gameKey), "PBKDF2", !1, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", iterations: 6e5, salt },
      material,
      { name: "AES-GCM", length: 256 },
      !1,
      ["encrypt", "decrypt"]
    );
  }
  async function openPrivateCredential(crypto, gameKey, value) {
    let code = value.trim();
    if (code.length > 700 || !code.startsWith(prefix2)) throw new Error("invalid_private_credential");
    let bytes2 = fromBase64url(code.slice(prefix2.length)), iv = bytes2.slice(16, 28), key = await credentialKey(crypto, gameKey, bytes2.slice(0, 16)), decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: context }, key, bytes2.slice(28)), [origin, signer, grant] = JSON.parse(new TextDecoder("utf-8", { fatal: !0 }).decode(decrypted));
    if (fromBase64url(signer, 65), fromBase64url(grant, 32), typeof origin != "string") throw new Error("invalid_private_credential");
    return { origin, signer, grant };
  }
  var PRIVATE_HTTP_TIMEOUT = 3e4, PRIVATE_HTTP_LIMIT = 24 * 1024 * 1024;
  function privateSyncOrigin(value) {
    let url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.pathname !== "/" || url.href !== url.origin + "/") throw new Error("\u8BF7\u8F93\u5165\u5B8C\u6574\u7684 HTTP \u6216 HTTPS \u5730\u5740\uFF0C\u65E0\u9700\u586B\u5199\u8DEF\u5F84");
    return url.origin;
  }
  var TEST_SYNC_ORIGIN = "https://test-sync.3gs.xyz:8888", knownTestRank = (level) => level >= 31 && level <= 38 || level === 255;
  function canUseSyncTest(game, accountId) {
    var _a2;
    if (!accountId) return !1;
    let self = read3(() => game.getSelf());
    if (String(read3(() => self.ClientId ?? self.clientId)) !== accountId) return !1;
    let level = Number(read3(() => self.OfficerLevel));
    if (!Number.isSafeInteger(level) || level < 1) return !1;
    let config = read3(() => game.getConfigData("h5_officer")), rows = ((_a2 = config == null ? void 0 : config.root) == null ? void 0 : _a2.officer) || (config == null ? void 0 : config.officer);
    if (!Array.isArray(rows)) return knownTestRank(level);
    let rowId = (row) => Number((row == null ? void 0 : row.id) ?? (row == null ? void 0 : row.ID)), minimum = rows.find((row) => String((row == null ? void 0 : row.bigName) || "").trim() === "\u56FD\u90FD\u62A4"), current = rows.find((row) => rowId(row) === level), groupId = (row) => Number((row == null ? void 0 : row.officerid) ?? (row == null ? void 0 : row.Officerid));
    return groupId(minimum) > 0 && groupId(current) > 0 ? groupId(current) >= groupId(minimum) : current && rowId(minimum) > 0 ? level >= rowId(minimum) : knownTestRank(level);
  }
  var databaseName = "sgs-toolbox-managed-sync", recoveryPrefix = "SGSR1.", messages = {
    account_limit: "\u540C\u6B65\u8D26\u53F7\u540D\u989D\u5DF2\u6EE1",
    account_mismatch: "\u7ED1\u5B9A\u8D26\u53F7\u548C\u5F53\u524D\u6E38\u620F\u8D26\u53F7\u4E0D\u4E00\u81F4",
    account_revoked: "\u7BA1\u7406\u5458\u5DF2\u89E3\u9664\u6B64\u8D26\u53F7\u7684\u7ED1\u5B9A",
    account_already_bound: "\u6B64\u8D26\u53F7\u5DF2\u6709\u540C\u6B65\u7ED1\u5B9A",
    installation_already_bound: "\u670D\u52A1\u5668\u5DF2\u6709\u4E00\u4E2A\u7ED1\u5B9A\u7684\u6D4F\u89C8\u5668\u6216\u5FAE\u7AEF",
    private_request_expired: "\u56DB\u4F4D\u914D\u5BF9\u7801\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u751F\u6210",
    binding_required: "\u7ED1\u5B9A\u5DF2\u5931\u6548\uFF0C\u8BF7\u91CD\u65B0\u8FDE\u63A5",
    stargazing_unavailable: "\u540C\u6B65\u670D\u52A1\u5668\u6682\u65F6\u65E0\u6CD5\u63D0\u4F9B\u89C2\u661F\u62A5\u8868",
    device_revoked: "\u7BA1\u7406\u5458\u5DF2\u64A4\u9500\u6B64\u8BBE\u5907",
    invalid_recovery: "\u6062\u590D\u5BC6\u94A5\u6216\u5F53\u524D\u6E38\u620F\u8D26\u53F7\u4E0D\u5339\u914D",
    invalid_private_credential: "\u4E3B\u8D26\u53F7\u51ED\u636E\u65E0\u6548\u3001\u5DF2\u8FC7\u671F\u6216\u5DF2\u4F7F\u7528\uFF0C\u8BF7\u7528\u5F53\u524D\u4E3B\u8D26\u53F7\u767B\u5F55\u5E76\u68C0\u67E5\u51ED\u636E",
    invitation_unavailable: "\u9080\u8BF7\u5DF2\u8FC7\u671F\u3001\u7528\u5B8C\u6216\u64A4\u9500",
    pairing_device_mismatch: "\u8BF7\u5728\u751F\u6210\u8FD9\u4EFD\u914D\u5BF9\u8BF7\u6C42\u7684\u6D4F\u89C8\u5668\u4F7F\u7528\u9080\u8BF7\u7801",
    rate_limited: "\u8BF7\u6C42\u8FC7\u591A\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5",
    wrong_pin: "\u786E\u8BA4\u7801\u9519\u8BEF",
    public_mode_required: "\u6B64\u670D\u52A1\u5668\u5DF2\u8F6C\u4E3A\u516C\u5171\u6A21\u5F0F",
    not_public: "\u8BE5\u7F51\u5740\u8FD8\u672A\u542F\u7528\u516C\u5171\u6A21\u5F0F",
    invalid_view: "\u67E5\u770B\u7801\u9519\u8BEF\u6216\u5206\u4EAB\u51ED\u636E\u65E0\u6548",
    view_locked: "\u6B64 IP \u8F93\u9519 50 \u6B21\uFF0C\u67E5\u770B\u5DF2\u9501\u5B9A 30 \u5206\u949F",
    public_preview_disabled: "\u670D\u52A1\u5668\u7BA1\u7406\u5458\u5173\u95ED\u4E86\u516C\u5171\u9884\u89C8",
    public_recovery_required: "\u6B64\u7528\u6237\u7801\u5DF2\u5728\u8BE5\u670D\u52A1\u5668\u7ED1\u5B9A\uFF0C\u8BF7\u7528\u539F\u8BBE\u5907\u7684\u516C\u5171\u6062\u590D\u51ED\u636E\u63A5\u7EED\u540C\u6B65",
    public_invite_required: "\u9996\u6B21\u7ED1\u5B9A\u6B64\u670D\u52A1\u5668\u9700\u8981\u4E00\u6B21\u6027\u9080\u8BF7\u7801\uFF0C\u8BF7\u5411\u7BA1\u7406\u5458\u83B7\u53D6",
    public_invite_unavailable: "\u4E00\u6B21\u6027\u9080\u8BF7\u7801\u65E0\u6548\u6216\u5DF2\u4F7F\u7528\uFF0C\u8BF7\u5411\u7BA1\u7406\u5458\u83B7\u53D6\u65B0\u7801",
    public_invite_disabled: "\u670D\u52A1\u5668\u5DF2\u505C\u7528\u4E00\u6B21\u6027\u9080\u8BF7\u7801\uFF0C\u8BF7\u5411\u7BA1\u7406\u5458\u786E\u8BA4\u7ED1\u5B9A\u65B9\u5F0F",
    migration_records_changed: "\u5386\u53F2\u8BB0\u5F55\u6709\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u51C6\u5907\u8F6C\u6362",
    migration_already_staged: "\u6B64\u8D26\u53F7\u5DF2\u6709\u53E6\u4E00\u4EFD\u52A0\u5BC6\u5386\u53F2\uFF0C\u8BF7\u5148\u5728\u540E\u53F0\u91CD\u7F6E\u51C6\u5907\u72B6\u6001",
    migration_staged: "\u5386\u53F2\u52A0\u5BC6\u526F\u672C\u5DF2\u5C31\u7EEA\uFF0C\u7B49\u5F85\u7BA1\u7406\u5458\u5B8C\u6210\u8F6C\u6362",
    vault_limit: "\u516C\u5171\u540C\u6B65\u5B58\u50A8\u8D85\u51FA\u5BB9\u91CF\u4E0A\u9650",
    invalid_preferences: "\u540C\u6B65\u8BBE\u7F6E\u683C\u5F0F\u65E0\u6548\u6216\u8D85\u51FA\u5BB9\u91CF\u4E0A\u9650",
    backup_upgrade_required: "\u540C\u6B65\u670D\u52A1\u5668\u9700\u66F4\u65B0\u540E\u624D\u80FD\u4E0B\u8F7D\u5B8C\u6574\u5907\u4EFD",
    backup_page_expired: "\u672C\u6B21\u4E0B\u8F7D\u7EED\u4F20\u5DF2\u5931\u6548\uFF0C\u8BF7\u5728\u4E0B\u4E00\u4E2A\u53EF\u4E0B\u8F7D\u65F6\u6BB5\u91CD\u8BD5"
  }, fail = (code, message = messages[code]) => Object.assign(new Error(message ?? "\u540C\u6B65\u670D\u52A1\u54CD\u5E94\u5F02\u5E38"), { code });
  function openStore(win, scope) {
    let database, ready = new Promise((resolve, reject) => {
      if (!win.indexedDB) return reject(fail("storage", "\u5F53\u524D\u6D4F\u89C8\u5668\u65E0\u6CD5\u4FDD\u5B58\u8BBE\u5907\u914D\u5BF9"));
      let request = win.indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("requests", { keyPath: "id" }), request.result.createObjectStore("bindings", { keyPath: "id" });
      }, request.onsuccess = () => {
        database = request.result, scope.signal.aborted && database.close(), resolve(database);
      }, request.onerror = () => reject(fail("storage", "\u914D\u5BF9\u8BB0\u5F55\u65E0\u6CD5\u6253\u5F00"));
    });
    return scope.add(() => database == null ? void 0 : database.close()), async (name, mode, command) => {
      let db = await ready;
      return new Promise((resolve, reject) => {
        let tx = db.transaction(name, mode), request = command(Array.isArray(name) ? tx : tx.objectStore(name));
        tx.oncomplete = () => resolve(request == null ? void 0 : request.result), tx.onabort = tx.onerror = () => reject(fail("storage", "\u914D\u5BF9\u8BB0\u5F55\u65E0\u6CD5\u4FDD\u5B58"));
      });
    };
  }
  function safeOrigin(value) {
    try {
      return privateSyncOrigin(value);
    } catch {
      throw fail("invalid_endpoint", "\u8BF7\u8F93\u5165\u5B8C\u6574\u7684 HTTP \u6216 HTTPS \u5730\u5740\uFF0C\u65E0\u9700\u586B\u5199\u8DEF\u5F84");
    }
  }
  function describeOrigin(data) {
    return safeOrigin(`${data.tls ? "https" : "http"}://${data.domain || data.ipv4 || "[" + data.ipv6 + "]"}:${data.port}`);
  }
  function createManagedSync(win, scope, getAccount, gameAccountKey, privateHttp, { testEligible, loadOfficerConfig } = {}) {
    let currentAccount = () => getAccount().id, exchangeStore = openStore(win, scope), navigator = win.navigator, clientInfo = { microclient: !0 }, clientHints = navigator == null ? void 0 : navigator.userAgentData;
    (clientHints == null ? void 0 : clientHints.platform) === "Windows" && typeof clientHints.getHighEntropyValues == "function" && clientHints.getHighEntropyValues(["platformVersion"]).then(({ platformVersion }) => {
      let version = Number(platformVersion == null ? void 0 : platformVersion.split(".")[0]);
      version >= 13 ? clientInfo.windows = 11 : version > 0 && version <= 10 && (clientInfo.windows = 10);
    }).catch(() => {
    });
    let get2 = (name, id) => exchangeStore(name, "readonly", (store) => store.get(id)), put = (name, value) => exchangeStore(name, "readwrite", (store) => store.put(value)), del = (name, id) => exchangeStore(name, "readwrite", (store) => store.delete(id)), bindingIndex = /* @__PURE__ */ new Map(), installation, joinError = "", checkedAccount, retryAt = 0, changingInstallation = !1, bindingsReady = Promise.all([
      exchangeStore("bindings", "readonly", (store) => store.getAll()),
      get2("requests", "private-installation")
    ]).then(([entries, saved]) => {
      installation = saved;
      for (let entry of entries) bindingIndex.set(entry.id, entry);
    });
    bindingsReady.catch(() => {
    });
    let random = (length = 32) => base64url(win.crypto.getRandomValues(new Uint8Array(length))), active = /* @__PURE__ */ new Map(), probes = /* @__PURE__ */ new Map(), writes = /* @__PURE__ */ new Map(), enrolling = /* @__PURE__ */ new Set();
    function obtainAccount() {
      let id = currentAccount();
      if (!id) throw fail("login_required", "\u5148\u767B\u5F55\u6E38\u620F\u8D26\u53F7");
      return id;
    }
    let ensureAccount = (id) => {
      if (currentAccount() !== id || scope.signal.aborted) throw fail("account_mismatch");
    };
    function publicProfile(id) {
      let account = getAccount();
      if (account.id !== id || scope.signal.aborted) throw fail("account_mismatch");
      let userCode = publicUserCode(id);
      if (!userCode) throw fail("invalid_public_profile", "\u65E0\u6CD5\u8BFB\u53D6\u5F53\u524D\u8D26\u53F7\u7684\u7528\u6237\u7801");
      return { userCode, name: publicUserName(account.nickname) };
    }
    async function post(origin, path, body, { device, signal } = {}) {
      safeOrigin(origin);
      let insecure = new URL(origin), useBridge = privateHttp && insecure.protocol === "http:" && !/^(?:127\.0\.0\.1|\[::1\]|(?:[a-z0-9-]+\.)*localhost)$/.test(insecure.hostname), timeout = new AbortController(), timer = win.setTimeout(() => timeout.abort(), useBridge ? PRIVATE_HTTP_TIMEOUT : path === BACKUP_READ_PATH || path === "/v2/vault/backup" ? 6e4 : 9500), cancel = () => timeout.abort();
      scope.signal.addEventListener("abort", cancel, { once: !0 }), signal == null || signal.addEventListener("abort", cancel, { once: !0 }), (signal != null && signal.aborted || scope.signal.aborted) && cancel();
      try {
        let url = origin + (useBridge && path === SYNC_CHANGES_PATH ? BACKUP_READ_PATH : path), data = JSON.stringify(body);
        if (useBridge) {
          let { status, text: text3 } = await privateHttp({ url, body: data, device }, timeout.signal);
          if (path === STARGAZING_SYNC_PATH && new TextEncoder().encode(text3).byteLength > STARGAZING_REPORT_LIMIT)
            throw fail("stargazing_unavailable");
          let payload2 = JSON.parse(text3);
          if (status < 200 || status >= 300) throw fail(payload2 == null ? void 0 : payload2.error);
          return payload2;
        }
        let response = await win.fetch(url, {
          method: "POST",
          redirect: "error",
          credentials: "omit",
          cache: "no-store",
          headers: { "Content-Type": "application/json", ...device ? { Authorization: "Bearer " + device } : {} },
          body: data,
          signal: timeout.signal
        }), payload = path === STARGAZING_SYNC_PATH ? await readStargazingJson(response) : await response.json();
        if (response.status === 404 && (path === BACKUP_READ_PATH || path === "/v2/vault/backup")) throw fail("backup_upgrade_required");
        if (!response.ok) throw fail(payload == null ? void 0 : payload.error);
        return payload;
      } catch (error) {
        throw error.code ? error : fail("connection_error", insecure.protocol === "http:" ? "\u65E0\u6CD5\u8FDE\u63A5\u79C1\u6709\u540C\u6B65\u670D\u52A1\uFF0C\u8BF7\u68C0\u67E5 HTTP \u5730\u5740\u3001\u7AEF\u53E3\u548C\u5BA2\u6237\u7AEF\u8BBF\u95EE\u6743\u9650" : "\u65E0\u6CD5\u8FDE\u63A5\u540C\u6B65\u670D\u52A1\uFF0C\u8BF7\u68C0\u67E5\u5730\u5740\u3001\u7AEF\u53E3\u548C\u8BC1\u4E66");
      } finally {
        win.clearTimeout(timer), scope.signal.removeEventListener("abort", cancel), signal == null || signal.removeEventListener("abort", cancel);
      }
    }
    let publicTransport = createPublicTransport(win.crypto, post);
    async function readPrivateBackup(origin, body, options) {
      let reply2 = await post(origin, BACKUP_READ_PATH, body, options);
      if (reply2.retryAfter || reply2.snapshot) return reply2;
      let { downloadId, cursor } = reply2, decoder = new TextDecoder("utf-8", { fatal: !0 }), chunks = [];
      for (let offset = 0; ; ) {
        let bytes2 = Uint8Array.from(win.atob(reply2.chunk), (c) => c.charCodeAt(0));
        if (chunks.push(decoder.decode(bytes2, { stream: reply2.next !== null })), reply2.next === null) break;
        if (!downloadId || !bytes2.length || reply2.next !== offset + bytes2.length) throw new Error("\u4E91\u7AEF\u5907\u4EFD\u5206\u9875\u65E0\u6548");
        offset = reply2.next, reply2 = await post(origin, BACKUP_READ_PATH, { ...body, downloadId, offset }, options);
      }
      return { snapshot: JSON.parse(chunks.join("")), cursor };
    }
    let preparedId = (id) => "public-prepared:" + id;
    async function prove(origin, signer, signal) {
      let nonce = random(16), proof = await post(origin, "/v1/proof", { nonce, stargazing: !0 }, { signal });
      try {
        if (proof.nonce !== nonce || proof.origin !== origin || !Number.isSafeInteger(proof.revision)) throw new Error();
        let key = await win.crypto.subtle.importKey("raw", fromBase64url(signer, 65), { name: "ECDSA", namedCurve: "P-256" }, !1, ["verify"]);
        if (!await win.crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, fromBase64url(proof.signature, 64), syncProofBytes(proof))) throw new Error();
        if (fromBase64url(proof.challenge, 16), proof.next !== null && safeOrigin(proof.next) !== proof.next) throw new Error();
        return proof;
      } catch {
        throw fail("invalid_proof", "\u670D\u52A1\u5668\u8EAB\u4EFD\u9A8C\u8BC1\u5931\u8D25");
      }
    }
    let confirm = (proof, device, signal) => post(proof.origin, "/v1/confirm", { challenge: proof.challenge, clientInfo }, { device, signal });
    function writeBinding(id, action) {
      let result = (writes.get(id) ?? Promise.resolve()).then(action), pending = result.catch(() => {
      });
      return writes.set(id, pending), result.finally(() => {
        writes.get(id) === pending && writes.delete(id);
      });
    }
    let save = (entry, expected = null) => writeBinding(entry.id, async () => {
      let before = bindingIndex.get(entry.id);
      if (((before == null ? void 0 : before.device) ?? null) !== expected || (before == null ? void 0 : before.revision) > entry.revision) throw fail("binding_required");
      return await put("bindings", entry), bindingIndex.set(entry.id, entry), entry;
    }), enroll = async (action) => {
      let id = obtainAccount();
      if (enrolling.has(id)) throw fail("enrollment_busy", "\u5DF2\u6709\u7ED1\u5B9A\u64CD\u4F5C\u6B63\u5728\u8FDB\u884C");
      enrolling.add(id);
      try {
        return await action();
      } finally {
        enrolling.delete(id);
      }
    };
    function enrollPrivate(action) {
      return enroll(async () => {
        if (changingInstallation) throw fail("enrollment_busy", "\u5DF2\u6709\u7ED1\u5B9A\u64CD\u4F5C\u6B63\u5728\u8FDB\u884C");
        changingInstallation = !0;
        try {
          return await action();
        } finally {
          changingInstallation = !1;
        }
      });
    }
    function savePrivate(entry, request, expected = null, pendingId = null) {
      return writeBinding(entry.id, async () => {
        var _a2;
        if (ensureAccount(entry.id), (((_a2 = bindingIndex.get(entry.id)) == null ? void 0 : _a2.device) ?? null) !== expected) throw fail("binding_required");
        let previous = installation, replaced = [...bindingIndex.values()].filter((item) => item.privatePair && item.id !== entry.id && (previous == null ? void 0 : previous.requestId) === item.requestId), next = { id: "private-installation", requestId: request.id, origin: entry.origin, signer: entry.signer, secret: request.installation };
        await exchangeStore(["requests", "bindings"], "readwrite", (tx) => {
          let requests = tx.objectStore("requests"), bindings = tx.objectStore("bindings");
          requests.put(next), requests.put({ id: request.id, keys: request.keys, expires: Number.MAX_SAFE_INTEGER }), pendingId && requests.delete(pendingId);
          for (let item of replaced) bindings.delete(item.id);
          bindings.put(entry);
        }), installation = next;
        for (let item of replaced) bindingIndex.delete(item.id);
        bindingIndex.set(entry.id, entry), (previous == null ? void 0 : previous.signer) === next.signer && previous.origin === next.origin && previous.secret !== next.secret && await post(next.origin, "/v1/private/release", { installation: previous.secret }).catch(() => {
        });
      });
    }
    async function generate(address) {
      var _a2;
      if (!((_a2 = win.crypto) != null && _a2.subtle)) throw fail("crypto_unavailable", "\u8BF7\u901A\u8FC7 HTTPS \u6253\u5F00\u6E38\u620F\u540E\u518D\u751F\u6210\u914D\u5BF9\u8BF7\u6C42");
      let request = await createPairingRequest(win.crypto);
      if (await put("requests", { ...request, device: random(), recovery: random(), installation: random(), expires: Date.now() + 14 * 864e5 }), !address) return request.code;
      let { pin } = await post(safeOrigin(address), "/v1/private/request", { request: request.code });
      if (!PIN_FORMAT.test(pin)) throw fail("invalid_code", "\u670D\u52A1\u7AEF\u8FD4\u56DE\u7684\u914D\u5BF9\u7801\u65E0\u6548");
      return pin;
    }
    async function readInvite(code, prefix3) {
      let invitation;
      try {
        invitation = await openPairing(code, prefix3, async (id) => {
          let request = await get2("requests", id);
          return request && request.expires > Date.now() ? request.keys : null;
        });
      } catch (error) {
        throw error.message === "pairing_device_mismatch" ? fail(error.message) : fail("invalid_code", prefix3 === PAIR_INVITE ? "\u9080\u8BF7\u7801\u683C\u5F0F\u9519\u8BEF\u6216\u5DF2\u635F\u574F" : "\u5730\u5740\u66F4\u65B0\u7801\u683C\u5F0F\u9519\u8BEF\u6216\u5DF2\u635F\u574F");
      }
      if (invitation.expiry <= Math.floor(Date.now() / 1e3)) throw fail("invitation_unavailable");
      return invitation;
    }
    async function bind(code, pin) {
      let id = obtainAccount();
      if (await bindingsReady, bindingIndex.has(id)) throw fail("already_bound", "\u5F53\u524D\u8D26\u53F7\u5DF2\u6709\u7ED1\u5B9A");
      if (pin && !PIN_FORMAT.test(pin)) throw fail("invalid_pin", "\u8BF7\u8F93\u5165 4 \u4F4D\u6570\u5B57\u786E\u8BA4\u7801");
      let invitation = await readInvite(code, PAIR_INVITE), origin = describeOrigin(invitation), request = await get2("requests", invitation.requestId), proof = await prove(origin, invitation.signer), gameKey = await gameAccountKey(id);
      ensureAccount(id);
      let { account, privatePair } = await post(origin, "/v1/bind", {
        device: request.device,
        requestId: request.id,
        gameKey,
        invite: invitation.token,
        pin,
        recovery: request.recovery,
        installation: request.installation,
        userCode: id
      });
      ensureAccount(id);
      let entry = {
        id,
        account,
        origin,
        signer: invitation.signer,
        requestId: request.id,
        device: request.device,
        recovery: request.recovery,
        revision: proof.revision
      };
      privatePair ? await savePrivate({ ...entry, privatePair: !0 }, request) : (await save(entry), await put("requests", { id: request.id, keys: request.keys, expires: Number.MAX_SAFE_INTEGER })), await confirm(proof, request.device).catch(() => {
      });
    }
    async function bindPrivateCredential(code) {
      var _a2;
      let id = obtainAccount();
      await bindingsReady;
      let previous = bindingIndex.get(id);
      if (previous != null && previous.public) throw fail("already_bound", "\u8BF7\u5148\u89E3\u9664\u5F53\u524D\u8D26\u53F7\u7684\u516C\u5171\u540C\u6B65\u7ED1\u5B9A");
      let gameKey = await gameAccountKey(id), credential, origin;
      try {
        credential = await openPrivateCredential(win.crypto, gameKey, code), origin = safeOrigin(credential.origin);
      } catch {
        throw fail("invalid_private_credential");
      }
      ensureAccount(id);
      let { signer, grant } = credential, proof = await prove(origin, signer), pendingId = "private-credential:" + grant, request = (_a2 = await get2("requests", pendingId)) == null ? void 0 : _a2.request;
      request || (request = { ...await createPairingRequest(win.crypto), device: random(), installation: random() }, await put("requests", { id: pendingId, request })), ensureAccount(id);
      let { account } = await post(origin, "/v1/private/bind-credential", {
        grant,
        gameKey,
        userCode: id,
        device: request.device,
        installation: request.installation,
        requestId: request.id,
        request: request.code
      });
      await confirm(proof, request.device), await savePrivate({
        id,
        account,
        origin,
        signer,
        requestId: request.id,
        device: request.device,
        revision: proof.revision,
        privatePair: !0
      }, request, (previous == null ? void 0 : previous.device) ?? null, pendingId);
    }
    async function joinCurrent() {
      await bindingsReady;
      let id = currentAccount(), owner = installation;
      if (!id || !owner || scope.signal.aborted || changingInstallation || enrolling.has(id)) return;
      let bound = bindingIndex.get(id);
      if (!(bound && !bound.privatePair) && !(id === checkedAccount && Date.now() < retryAt)) {
        if (checkedAccount = id, joinError = "", retryAt = Date.now() + (bound ? 6e4 : 15e3), bound) {
          await resolveOnce(bound).catch(async (error) => {
            error.code === "binding_required" && (await forgetBinding(id, bound.device), retryAt = 0);
          });
          return;
        }
        await enroll(async () => {
          let pendingId = "private-join:" + owner.secret + ":" + id, proposed = await get2("requests", pendingId);
          proposed || (proposed = { id: pendingId, device: random(), recovery: random() }, await put("requests", proposed));
          let proof = await prove(owner.origin, owner.signer), chosen = proof.next ? await prove(proof.next, owner.signer).catch(() => proof) : proof, gameKey = await gameAccountKey(id);
          ensureAccount(id);
          let { device, recovery } = proposed, { account } = await post(chosen.origin, "/v1/private/join", { installation: owner.secret, device, recovery, gameKey, userCode: id });
          if (ensureAccount(id), changingInstallation || (installation == null ? void 0 : installation.secret) !== owner.secret) throw fail("binding_required");
          await save({
            id,
            account,
            origin: chosen.origin,
            signer: owner.signer,
            requestId: owner.requestId,
            previous: chosen.origin === owner.origin ? void 0 : owner.origin,
            device,
            recovery,
            revision: chosen.revision,
            privatePair: !0
          }), await del("requests", pendingId), await confirm(chosen, device).catch(() => {
          });
        }).catch((error) => {
          currentAccount() === id && (joinError = error.message);
        });
      }
    }
    let joinTimer = win.setInterval(() => {
      joinCurrent().catch(() => {
      });
    }, 1e3);
    scope.add(() => win.clearInterval(joinTimer));
    async function recover(value, address) {
      let id = obtainAccount();
      if (await bindingsReady, bindingIndex.has(id)) throw fail("already_bound", "\u5F53\u524D\u8D26\u53F7\u5DF2\u6709\u7ED1\u5B9A");
      let secret = value.trim(), payload;
      try {
        if (!secret.startsWith(recoveryPrefix) || secret.length !== 136) throw new Error();
        payload = fromBase64url(secret.slice(recoveryPrefix.length), 97);
      } catch {
        throw fail("invalid_recovery");
      }
      let origin = safeOrigin(address), signer = base64url(payload.slice(0, 65)), recovery = base64url(payload.slice(65)), proof = await prove(origin, signer), request = await createPairingRequest(win.crypto), device = random(), gameKey = await gameAccountKey(id);
      ensureAccount(id);
      let { account } = await post(origin, "/v1/recover", { device, requestId: request.id, request: request.code, recovery, gameKey });
      ensureAccount(id), await put("requests", { id: request.id, keys: request.keys, expires: Number.MAX_SAFE_INTEGER }), await save({ id, account, origin, signer, requestId: request.id, device, recovery, revision: proof.revision }), await confirm(proof, device).catch(() => {
      });
    }
    async function resolve(entry, signal) {
      var _a2;
      let proof;
      try {
        proof = await prove(entry.origin, entry.signer, signal);
      } catch (error) {
        if (!entry.previous || signal != null && signal.aborted) throw error;
        proof = await prove(entry.previous, entry.signer, signal);
      }
      if (proof.revision < entry.revision) throw fail("invalid_proof", "\u670D\u52A1\u5668\u5730\u5740\u7248\u672C\u5DF2\u56DE\u9000");
      if (proof.next && (!entry.public || proof.next.startsWith("https:")))
        try {
          proof = await prove(proof.next, entry.signer, signal);
        } catch (error) {
          if (signal != null && signal.aborted) throw error;
        }
      if (entry.public || await confirm(proof, entry.device, signal), ensureAccount(entry.id), ((_a2 = bindingIndex.get(entry.id)) == null ? void 0 : _a2.device) !== entry.device) throw fail("binding_required");
      let stargazing = proof.stargazing === !0;
      if (entry.privatePair && changingInstallation) return { ...entry, origin: proof.origin, stargazing };
      if (entry.privatePair && (installation == null ? void 0 : installation.requestId) === entry.requestId && proof.origin !== installation.origin) {
        let owner = { ...installation, origin: proof.origin };
        await put("requests", owner), (installation == null ? void 0 : installation.secret) === owner.secret && (installation = owner);
      }
      return proof.origin !== entry.origin || proof.revision > entry.revision ? { ...await save({ ...entry, origin: proof.origin, previous: proof.origin === entry.origin ? entry.previous : entry.origin, revision: proof.revision }, entry.device), stargazing } : { ...entry, stargazing };
    }
    function resolveOnce(entry, signal) {
      var _a2;
      let saved = probes.get(entry.id);
      if ((saved == null ? void 0 : saved.device) === entry.device && !((_a2 = saved.signal) != null && _a2.aborted)) return saved.promise;
      let probe = { device: entry.device, signal, promise: null };
      return probe.promise = resolve(entry, signal).finally(() => {
        probes.get(entry.id) === probe && probes.delete(entry.id);
      }), probes.set(entry.id, probe), probe.promise;
    }
    async function exchange(account, path, data, gameKey, signal) {
      var _a2;
      await bindingsReady;
      let entry = bindingIndex.get(account);
      if (!entry) throw fail("binding_required", "\u8BF7\u5148\u5728\u300C\u7BA1\u7406 \u2192 \u4E91\u540C\u6B65\u300D\u7ED1\u5B9A\u5F53\u524D\u8D26\u53F7");
      ensureAccount(account);
      let controller = new AbortController(), cancel = () => controller.abort(), requests = active.get(account) ?? /* @__PURE__ */ new Set();
      active.set(account, requests), requests.add(controller), signal == null || signal.addEventListener("abort", cancel, { once: !0 }), signal != null && signal.aborted && cancel();
      try {
        let resolved = await resolveOnce(entry, controller.signal);
        if (ensureAccount(account), ((_a2 = bindingIndex.get(account)) == null ? void 0 : _a2.device) !== entry.device) throw fail("binding_required");
        let options = { device: entry.device, signal: controller.signal };
        if (path === STARGAZING_SYNC_PATH) {
          if (controller.signal.throwIfAborted(), !resolved.stargazing) return null;
          let reply3 = resolved.public ? await post(resolved.origin, path, { vault: resolved.vault, credential: resolved.credential }, { signal: controller.signal }) : await post(resolved.origin, path, {}, options);
          if (ensureAccount(account), controller.signal.throwIfAborted(), !Array.isArray(reply3 == null ? void 0 : reply3.sections)) throw fail("stargazing_unavailable");
          return reply3;
        }
        let reply2 = resolved.public ? { account: gameKey, ...await publicTransport.exchange(resolved, resolved.origin, path, data, controller.signal) } : path === BACKUP_READ_PATH ? await readPrivateBackup(resolved.origin, { account: gameKey }, options) : await post(resolved.origin, path, { ...data, account: gameKey }, options);
        return ensureAccount(account), reply2;
      } catch (error) {
        throw entry.privatePair && error.code === "binding_required" && (await forgetBinding(account, entry.device), retryAt = 0), error;
      } finally {
        signal == null || signal.removeEventListener("abort", cancel), requests.delete(controller), requests.size || active.delete(account);
      }
    }
    function forgetBinding(id, expected) {
      return writeBinding(id, async () => {
        let current = bindingIndex.get(id);
        if (!current || expected && current.device !== expected) return null;
        for (let request of active.get(id) ?? []) request.abort();
        return await del("bindings", id), bindingIndex.delete(id), current;
      });
    }
    async function disconnect() {
      let id = obtainAccount();
      await bindingsReady;
      let entry = await forgetBinding(id);
      if (!entry || entry.public) return !0;
      for (let origin of new Set([entry.origin, entry.previous].filter(Boolean)))
        try {
          return await prove(origin, entry.signer), await post(origin, "/v1/unbind", {}, { device: entry.device }), !0;
        } catch (error) {
          if (error.code === "binding_required") return !0;
        }
      return !1;
    }
    async function detachPrivate() {
      await bindingsReady;
      let owner = installation;
      if (!owner) return;
      let bound = bindingIndex.get(obtainAccount()), proof = await prove(owner.origin, owner.signer).catch((error) => {
        if (!(bound != null && bound.previous)) throw error;
        return prove(bound.previous, owner.signer);
      });
      try {
        await post(proof.origin, "/v1/private/release", { installation: owner.secret });
      } catch (error) {
        if (error.code !== "binding_required") throw error;
      }
      let attached = [...bindingIndex.values()].filter((entry) => entry.privatePair && entry.requestId === owner.requestId);
      await exchangeStore(["requests", "bindings"], "readwrite", (tx) => {
        tx.objectStore("requests").delete(owner.id);
        for (let entry of attached) tx.objectStore("bindings").delete(entry.id);
      }), installation = null;
      for (let entry of attached) {
        for (let request of active.get(entry.id) ?? []) request.abort();
        bindingIndex.delete(entry.id);
      }
    }
    async function previewLink() {
      let id = obtainAccount(), entry = bindingIndex.get(id);
      if (!entry) throw fail("binding_required");
      let resolved = await resolveOnce(entry), { view } = await post(resolved.origin, "/v1/private/view", {}, { device: resolved.device });
      if (!view) throw fail("binding_required");
      return resolved.origin + "/ledger/?view=" + encodeURIComponent(view);
    }
    async function uniquePassword(gameKey) {
      for (let attempt = 0; attempt < 12; attempt++) {
        let password = randomPass(win.crypto);
        try {
          return await exchangeStore("requests", "readwrite", (store) => store.add({ id: "public-password:" + password, gameKey })), password;
        } catch {
          if (!await get2("requests", "public-password:" + password)) throw fail("storage", "\u65E0\u6CD5\u4FDD\u5B58\u67E5\u770B\u7801");
        }
      }
      throw fail("storage", "\u65E0\u6CD5\u751F\u6210\u67E5\u770B\u7801\uFF0C\u8BF7\u91CD\u8BD5");
    }
    async function newVault(id, origin, signer) {
      let gameKey = await gameAccountKey(id);
      return {
        id,
        origin,
        signer,
        public: !0,
        device: random(),
        vault: random(),
        credential: random(),
        seed: random(),
        password: await uniquePassword(gameKey),
        gameKey
      };
    }
    async function bindPublic(target, recovery) {
      var _a2;
      let id = obtainAccount();
      if (await bindingsReady, bindingIndex.has(id)) throw fail("already_bound", "\u8BF7\u5148\u89E3\u9664\u5F53\u524D\u8D26\u53F7\u7684\u540C\u6B65\u7ED1\u5B9A");
      function checkTarget(origin) {
        if (ensureAccount(id), origin === TEST_SYNC_ORIGIN && !(testEligible != null && testEligible(id))) throw fail("test_unavailable", "\u5F53\u524D\u8D26\u53F7\u6682\u65E0\u6CD5\u4F7F\u7528\u4E91\u540C\u6B65\u7070\u6D4B\u3002");
      }
      let entry;
      if (recovery) {
        let saved = readPublicRecovery(recovery);
        if (saved.gameKey !== await gameAccountKey(id)) throw fail("account_mismatch");
        entry = { ...saved, id, origin: target ? publicBindingTarget(target).origin : saved.origin, public: !0, device: random() }, checkTarget(entry.origin), await prove(entry.origin, entry.signer), await publicTransport.check(entry, publicProfile(id));
      } else {
        let { origin: address, invitation } = publicBindingTarget(target);
        checkTarget(address);
        let pendingId = "public-registration:" + id + ":" + address;
        entry = ((_a2 = await get2("requests", pendingId)) == null ? void 0 : _a2.entry) ?? await newVault(id, address, ""), await put("requests", { id: pendingId, entry }), checkTarget(address);
        let { signer } = await publicTransport.register(entry, publicProfile(id), invitation);
        entry.signer = signer;
      }
      let proof = await prove(entry.origin, entry.signer);
      checkTarget(entry.origin), await save({ ...entry, account: entry.vault, revision: proof.revision }), recovery || await del("requests", "public-registration:" + id + ":" + entry.origin);
    }
    async function preparePublic() {
      var _a2;
      let id = obtainAccount();
      await bindingsReady;
      let current = bindingIndex.get(id);
      if (!current || current.public) throw fail("binding_required");
      let proof = await prove(current.origin, current.signer), target = publicOrigin(proof.next || proof.origin), verified = await prove(target, current.signer);
      ensureAccount(id), await confirm(verified, current.device);
      let pending = (_a2 = await get2("requests", preparedId(id))) == null ? void 0 : _a2.entry, entry = (pending == null ? void 0 : pending.signer) === current.signer ? { ...pending, origin: verified.origin } : await newVault(id, verified.origin, current.signer);
      return await put("requests", { id: preparedId(id), entry }), await publicTransport.stage(entry, current.device, publicProfile(id)), ensureAccount(id), publicRecovery(entry);
    }
    async function usePrepared() {
      var _a2;
      let id = obtainAccount();
      await bindingsReady;
      let current = bindingIndex.get(id), entry = (_a2 = await get2("requests", preparedId(id))) == null ? void 0 : _a2.entry;
      if (!current || current.public || !entry) throw fail("binding_required");
      let proof = await prove(entry.origin, entry.signer);
      await publicTransport.check(entry, publicProfile(id)), ensureAccount(id), await save({ ...entry, account: entry.vault, revision: proof.revision }, current.device), await del("requests", preparedId(id));
    }
    async function updatePublicProfile() {
      let id = obtainAccount();
      await bindingsReady;
      let entry = bindingIndex.get(id);
      if (!(entry != null && entry.public)) throw fail("binding_required");
      let resolved = await resolveOnce(entry), { profileRegistered } = await publicTransport.check(resolved, publicProfile(id));
      if (ensureAccount(id), !profileRegistered) throw fail("profile_upgrade_required", "\u540C\u6B65\u670D\u52A1\u5668\u66F4\u65B0\u540E\u624D\u80FD\u767B\u8BB0\u8D26\u53F7\u8D44\u6599");
    }
    async function update(code) {
      let id = obtainAccount();
      await bindingsReady;
      let entry = bindingIndex.get(id);
      if (!entry) throw fail("binding_required");
      let invitation = await readInvite(code, PAIR_UPDATE);
      if (entry.signer !== invitation.signer || entry.requestId !== invitation.requestId) throw fail("invalid_proof", "\u5730\u5740\u66F4\u65B0\u7801\u7684\u670D\u52A1\u5668\u8EAB\u4EFD\u4E0D\u5339\u914D");
      let origin = describeOrigin(invitation), proof = await prove(origin, entry.signer);
      if (proof.revision < entry.revision) throw fail("invalid_proof", "\u5730\u5740\u66F4\u65B0\u7801\u5DF2\u5931\u6548");
      await confirm(proof, entry.device), ensureAccount(id), await save({ ...entry, origin, previous: entry.origin, revision: proof.revision }, entry.device);
    }
    return {
      ready: bindingsReady,
      async readStargazingReport({ signal } = {}) {
        await bindingsReady, signal == null || signal.throwIfAborted();
        let id = currentAccount();
        if (!bindingIndex.has(id)) return null;
        try {
          return await exchange(id, STARGAZING_SYNC_PATH, void 0, void 0, signal);
        } catch (error) {
          if (error.code === "stargazing_disabled") return null;
          throw error;
        }
      },
      status() {
        let id = currentAccount(), entry = bindingIndex.get(id);
        return {
          signedIn: !!id,
          accountId: id,
          connected: !!entry,
          origin: entry == null ? void 0 : entry.origin,
          privatePair: !!installation,
          public: !!(entry != null && entry.public),
          password: entry != null && entry.public ? entry.password : "",
          bindingIdentity: entry == null ? void 0 : entry.device,
          testAvailable: !entry && !!(testEligible != null && testEligible(id)),
          testing: (entry == null ? void 0 : entry.public) && entry.origin === TEST_SYNC_ORIGIN,
          joinError: id === checkedAccount ? joinError : ""
        };
      },
      available: (account) => bindingIndex.has(account),
      cacheKey: (account) => {
        var _a2;
        return (_a2 = bindingIndex.get(account)) == null ? void 0 : _a2.account;
      },
      generate,
      bind: (code, pin) => enrollPrivate(() => bind(code, pin)),
      bindPrivateCredential: (code) => enrollPrivate(() => bindPrivateCredential(code)),
      recover: (code, address) => enroll(() => recover(code, address)),
      disconnect,
      detachPrivate: () => enrollPrivate(detachPrivate),
      update,
      exchange,
      previewLink,
      bindPublic: (target, recovery) => enroll(() => bindPublic(target, recovery)),
      loadTestEligibility: loadOfficerConfig,
      bindTest: () => enroll(() => bindPublic(TEST_SYNC_ORIGIN)),
      updatePublicProfile: () => enroll(updatePublicProfile),
      preparePublic: () => enroll(preparePublic),
      usePrepared: () => enroll(usePrepared),
      viewCode() {
        let entry = bindingIndex.get(obtainAccount());
        if (!(entry != null && entry.public)) throw fail("binding_required");
        return publicViewCode(entry);
      },
      async viewLink() {
        let entry = bindingIndex.get(obtainAccount());
        if (!(entry != null && entry.public)) throw fail("binding_required");
        return publicViewLink(await resolveOnce(entry));
      },
      previewPublic: publicTransport.preview,
      recoveryCode() {
        let entry = bindingIndex.get(obtainAccount());
        if (!entry) throw fail("binding_required");
        if (entry.public) return publicRecovery(entry);
        if (entry.privatePair) throw fail("binding_required", "\u8BF7\u5728\u670D\u52A1\u5668\u7BA1\u7406\u9875\u751F\u6210\u4E3B\u8D26\u53F7\u51ED\u636E");
        return recoveryPrefix + base64url(Uint8Array.of(...fromBase64url(entry.signer, 65), ...fromBase64url(entry.recovery, 32)));
      }
    };
  }
  function applySyncChangePage(history, after, { cursor, records, more }) {
    if (!validSyncCursor(cursor) || cursor.epoch !== after.epoch || cursor.seq < after.seq || !Array.isArray(records) || typeof more != "boolean" || (records.length ? cursor.seq - after.seq < records.length : more || cursor.seq !== after.seq))
      throw new Error("\u4E91\u7AEF\u589E\u91CF\u540C\u6B65\u5206\u9875\u65E0\u6548");
    let ledger = history.ledger, events, matches, preferences = {}, seen = /* @__PURE__ */ new Set();
    for (let row of records) {
      if (!Array.isArray(row) || row.length !== 3 || typeof row[1] != "string" || row[2] !== null && (!row[2] || typeof row[2] != "object" || row[0] !== "preferences" && Array.isArray(row[2])))
        throw new Error("\u4E91\u7AEF\u589E\u91CF\u8BB0\u5F55\u683C\u5F0F\u65E0\u6548");
      let [kind, id, value] = row, key = kind + ":" + id;
      if (seen.has(key)) throw new Error("\u4E91\u7AEF\u589E\u91CF\u8BB0\u5F55\u91CD\u590D");
      if (seen.add(key), kind === "match")
        matches ??= new Map(history.matches.map((match) => [match.gameId, match])), value === null ? matches.delete(id) : matches.set(id, { ...value, gameId: id });
      else if (kind === "event")
        events ??= new Map(history.ledger.events.map((event) => [event.id, event])), value === null ? events.delete(id) : events.set(id, { ...value, id });
      else if (kind === "ledger" && id === "details" && (value === null || Array.isArray(value.balances)))
        ledger = { ...value ?? EMPTY_LEDGER, events: history.ledger.events, eventVersion: history.ledger.eventVersion };
      else if (kind === "preferences" && PREFERENCE_GROUPS.includes(id) && value !== null) preferences[id] = value;
      else throw new Error("\u4E91\u7AEF\u589E\u91CF\u8BB0\u5F55\u7C7B\u578B\u65E0\u6548");
    }
    return events && (ledger = { ...ledger, events: [...events.values()], eventVersion: globalThis.crypto.randomUUID() }), {
      history: { matches: matches ? [...matches.values()] : history.matches, ledger },
      preferences: cleanPreferences(preferences),
      updated: [...matches ? ["matches"] : [], ...ledger !== history.ledger ? ["ledger"] : []]
    };
  }
  var INTERVAL = 6e4, pagesPerRun = 8, defaults = {
    fontSize: "standard",
    fontSettingsCollapsed: !1,
    theme: BLACK_GOLD.id,
    themeWorkshopCollapsed: !1,
    hudEdgeBehavior: "fixed",
    compactOpacity: 80,
    screenshotHideUI: !0,
    screenshotShortcut: DEFAULT_SCREENSHOT_SHORTCUT,
    compatEnabled: !1,
    compatPolicy: "hide",
    marketOnlyUninstalled: !0,
    refreshReentryEnabled: !0
  };
  function preferenceStorage(settings, account) {
    let owner = account.padStart(10, "0"), groups2 = {
      generalPools: "general-pools:" + generalPoolKey(account),
      friends: "social:friends:" + owner,
      friendLamps: "social:lamps:" + owner
    }, pluginKeys = [...PLUGIN_SYNC_KEYS, ...ACCOUNT_SYNC_KEYS], localKey = (key) => syncPluginStorageKey(key, account), keys = [...TOOLBOX_SYNC_KEYS, ...Object.values(groups2), ...pluginKeys.map(localKey)], watched = new Set(keys.map((key) => settings.prefix + key)), thresholdPrefix = settings.prefix + LEDGER_THRESHOLD_PREFIX + account + ":";
    function thresholds() {
      let all = [];
      for (let index = 0; index < settings.storage.length; index++) {
        let key = settings.storage.key(index);
        key != null && key.startsWith(thresholdPrefix) && all.push(key.slice(thresholdPrefix.length));
      }
      return all.sort();
    }
    let read6 = (key) => settings.storage.getItem(settings.prefix + key);
    function collect(tolerant = !1) {
      var _a2, _b2;
      let toolbox = Object.fromEntries(TOOLBOX_SYNC_KEYS.map((key) => [key, settings.get(key, defaults[key])]));
      for (let key of ["cardStyle", "cardFaceStyle", "cardBackStyle"])
        (_b2 = (_a2 = toolbox[key]) == null ? void 0 : _a2.startsWith) != null && _b2.call(_a2, "local-") && delete toolbox[key];
      let values = { toolbox };
      for (let [group, key] of Object.entries(groups2)) {
        let value = settings.get(key);
        value !== void 0 && (values[group] = value);
      }
      let selected = [...pluginKeys, ...thresholds().map((id) => LEDGER_THRESHOLD_PREFIX + "@:" + id)], plugins = Object.fromEntries(selected.map((key) => [key, settings.get(localKey(key))]).filter(([, value]) => value !== void 0));
      Object.keys(plugins).length && (values.pluginSettings = plugins);
      try {
        return cleanPreferences(values);
      } catch (error) {
        if (!tolerant) throw error;
        return values;
      }
    }
    function restore(values, baseline) {
      let writes = Object.entries(values.toolbox ?? {});
      for (let [group, key] of Object.entries(groups2))
        values[group] !== void 0 && writes.push([key, values[group]]);
      for (let [key, value] of Object.entries(values.pluginSettings ?? {})) {
        let storedKey = localKey(key);
        writes.push([storedKey, key === "daily-rewards:account:@:options" ? { ...settings.get(storedKey), ...value } : value]);
      }
      let changed = writes.filter(([key, value]) => read6(key) === (baseline.get(key) ?? null) && read6(key) !== JSON.stringify(value)), done = 0;
      try {
        for (let [key, value] of changed)
          settings.set(key, value), done++;
      } catch (error) {
        for (let [key] of changed.slice(0, done).reverse()) {
          let raw = baseline.get(key) ?? null, fullKey = settings.prefix + key;
          raw === null ? settings.storage.removeItem(fullKey) : settings.storage.setItem(fullKey, raw);
        }
        throw error;
      }
      let changedKeys = new Set(changed.map(([key]) => key));
      return [
        ...Object.entries(groups2).filter(([, key]) => changedKeys.has(key)).map(([name]) => name),
        ...TOOLBOX_SYNC_KEYS.some((key) => changedKeys.has(key)) ? ["toolbox"] : [],
        ...Object.keys(values.pluginSettings ?? {}).some((key) => changedKeys.has(localKey(key))) ? ["pluginSettings"] : []
      ];
    }
    return {
      watches: (key) => watched.has(key) || key.startsWith(thresholdPrefix),
      collect,
      restore,
      baseline: () => new Map([...keys, ...thresholds().map((id) => LEDGER_THRESHOLD_PREFIX + account + ":" + id)].map((key) => [key, read6(key)]))
    };
  }
  function preservePending(remote, local, acknowledged) {
    let safe = {};
    for (let [group, value] of Object.entries(remote))
      group === "toolbox" || group === "pluginSettings" ? safe[group] = Object.fromEntries(Object.entries(value).filter(([key]) => {
        var _a2, _b2;
        let previous = ((_a2 = acknowledged[group]) == null ? void 0 : _a2[key]) ?? (group === "toolbox" ? defaults[key] : void 0);
        return JSON.stringify((_b2 = local[group]) == null ? void 0 : _b2[key]) === JSON.stringify(previous);
      })) : JSON.stringify(local[group]) === JSON.stringify(acknowledged[group]) && (safe[group] = value);
    return safe;
  }
  function createPreferenceSync({ settings, sync, gameAccountKey, scope, cache: cache2, onRestored, onDownloaded, onUpdated = () => {
  } }) {
    let session, applying = !1, scheduled = !1, now = Date.now;
    function refresh() {
      var _a2;
      let { accountId, bindingIdentity, connected } = sync.status();
      return connected && (session == null ? void 0 : session.account) === accountId && session.binding === bindingIdentity || ((_a2 = session == null ? void 0 : session.job) == null || _a2.abort(), session = connected ? {
        account: accountId,
        binding: bindingIdentity,
        cacheKey: sync.cacheKey(accountId),
        storage: preferenceStorage(settings, accountId),
        nextDownload: 0,
        nextUpload: 0,
        acknowledged: {},
        error: "",
        ready: !1
      } : null), session;
    }
    function ensureCurrent(state) {
      if (scope.closed || refresh() !== state) throw new Error("\u540C\u6B65\u8D26\u53F7\u6216\u7ED1\u5B9A\u5DF2\u53D8\u66F4\uFF0C\u8BF7\u91CD\u8BD5");
    }
    async function run(state, work) {
      if (!state) throw new Error("\u8BF7\u5148\u7ED1\u5B9A\u540C\u6B65\u670D\u52A1\u5668");
      if (state.job) throw new Error("\u540C\u6B65\u6B63\u5728\u8FDB\u884C\uFF0C\u8BF7\u7A0D\u7B49");
      let controller = state.job = new AbortController();
      try {
        let key = await gameAccountKey(state.account);
        return ensureCurrent(state), await work(key, controller.signal);
      } finally {
        state.job === controller && (state.job = null, state.pullRequested && state.cursor && (state.nextDownload = 0), state.pullRequested = !1);
      }
    }
    let validHistory = (snapshot) => {
      var _a2, _b2;
      return Array.isArray(snapshot == null ? void 0 : snapshot.matches) && Array.isArray((_a2 = snapshot.ledger) == null ? void 0 : _a2.events) && Array.isArray((_b2 = snapshot.ledger) == null ? void 0 : _b2.balances);
    };
    async function hydrate(state) {
      if (state.hydrated) return;
      let saved = await cache2.get(state.cacheKey);
      ensureCurrent(state), validHistory(saved) && (state.history = { matches: saved.matches, ledger: saved.ledger }, validSyncCursor(saved.cursor) ? (state.acknowledged = cleanPreferences(saved.acknowledged ?? {}), state.cursor = saved.cursor, state.ready = !0) : state.cursor = void 0), state.hydrated = !0;
    }
    function applyPreferences(state, values, baseline) {
      applying = !0;
      try {
        return state.storage.restore(values, baseline);
      } finally {
        applying = !1;
      }
    }
    async function save(state, history, cursor, acknowledged) {
      let accepted = await cache2.put(state.cacheKey, cursor ? { ...history, cursor, acknowledged } : history, state.cursor);
      return ensureCurrent(state), accepted === !1 ? (state.hydrated = !1, await hydrate(state), onUpdated(["matches", "ledger"]), !1) : (Object.assign(state, { history, cursor, acknowledged, ready: !0, error: "" }), !0);
    }
    async function fullBackup(state, key, signal, manual) {
      let baseline = state.storage.baseline(), local = state.storage.collect(!0), reply2 = await sync.exchange(state.account, BACKUP_READ_PATH, {}, key, signal);
      if (ensureCurrent(state), Number.isSafeInteger(reply2.retryAfter) && reply2.retryAfter > 0)
        return state.ready || (state.acknowledged = local), state.ready = !0, state.error = "", (!manual || !state.cursor) && (state.nextDownload = now() + reply2.retryAfter), manual ? "\u6BCF\u5C0F\u65F6\u6700\u591A\u4E0B\u8F7D\u4E00\u6B21\uFF0C\u7EA6 " + Math.ceil(reply2.retryAfter / 6e4) + " \u5206\u949F\u540E\u53EF\u518D\u6B21\u4E0B\u8F7D" : "";
      let { snapshot, cursor } = reply2;
      if (!validHistory(snapshot) || cursor !== void 0 && !validSyncCursor(cursor)) throw new Error("\u4E91\u7AEF\u5907\u4EFD\u683C\u5F0F\u65E0\u6548");
      let values = cleanPreferences(snapshot.preferences ?? {}), allowed2 = !manual && state.cursor ? preservePending(values, local, state.acknowledged) : values, history = { matches: snapshot.matches, ledger: snapshot.ledger }, changed = applyPreferences(state, allowed2, baseline);
      return onRestored(changed), await save(state, history, cursor, values), state.nextDownload = cursor ? now() + INTERVAL : null, onDownloaded(), changed.includes("toolbox") || changed.includes("pluginSettings") ? "\u5DF2\u4E0B\u8F7D\u8BBE\u7F6E\u3001\u6C34\u8868\u3001\u8D26\u672C\u548C\u6218\u7EE9\uFF0C\u5237\u65B0\u6E38\u620F\u540E\u5E94\u7528\u8BBE\u7F6E" : "\u5DF2\u4E0B\u8F7D\u8BBE\u7F6E\u3001\u6C34\u8868\u3001\u8D26\u672C\u548C\u6218\u7EE9";
    }
    async function pull(state, key, signal) {
      for (let page = 0; page < pagesPerRun; page++) {
        let baseline = state.storage.baseline(), local = state.storage.collect(!0), after = state.cursor, reply2 = await sync.exchange(state.account, SYNC_CHANGES_PATH, { after }, key, signal);
        if (ensureCurrent(state), reply2.reset === !0) return fullBackup(state, key, signal, !1);
        let { history, preferences, updated } = applySyncChangePage(state.history, after, reply2);
        if (reply2.records.length) {
          let values = preservePending(preferences, local, state.acknowledged), acknowledged = { ...state.acknowledged, ...preferences }, changed = applyPreferences(state, values, baseline);
          changed.length && onRestored(changed);
          let accepted = await save(state, history, reply2.cursor, acknowledged);
          if (accepted && updated.length && onUpdated(updated), !accepted)
            return state.nextDownload = now() + 1e3, "";
        }
        if (!reply2.more)
          return state.nextDownload = now() + INTERVAL, state.error = "", "";
      }
      return state.nextDownload = now() + 1e3, "";
    }
    async function download2(state, confirm) {
      if (!state) throw new Error("\u8BF7\u5148\u7ED1\u5B9A\u540C\u6B65\u670D\u52A1\u5668");
      if (state.job) throw new Error("\u540C\u6B65\u6B63\u5728\u8FDB\u884C\uFF0C\u8BF7\u7A0D\u7B49");
      return confirm && !confirm() ? "" : run(state, async (key, signal) => {
        try {
          return await hydrate(state), await (confirm || !state.cursor ? fullBackup(state, key, signal, !!confirm) : pull(state, key, signal));
        } catch (error) {
          throw refresh() === state && (state.error = error.code === "origin_not_allowed" || error.code === "not_found" ? "\u540C\u6B65\u670D\u52A1\u5668\u9700\u66F4\u65B0\u540E\u624D\u80FD\u4E0B\u8F7D\u4E91\u7AEF\u6570\u636E" : error.message, confirm || (state.nextDownload = now() + INTERVAL)), error;
        }
      });
    }
    async function upload(state, force) {
      if (!(state != null && state.ready)) throw new Error("\u8BF7\u7B49\u5F85\u9996\u6B21\u4E91\u7AEF\u4E0B\u8F7D\u5B8C\u6210");
      return run(state, async (key, signal) => {
        var _a2, _b2;
        state.nextUpload = now() + INTERVAL;
        let local = state.storage.collect(), groups2 = Object.keys(local).filter((group) => force || JSON.stringify(local[group]) !== JSON.stringify(state.acknowledged[group]));
        if (!groups2.length) return "";
        let values = Object.fromEntries(groups2.map((group) => [group, local[group]]));
        for (let group of ["toolbox", "pluginSettings"]) !force && values[group] && (values[group] = Object.fromEntries(Object.entries(values[group]).filter(([key2, value]) => {
          var _a3;
          return JSON.stringify(value) !== JSON.stringify((_a3 = state.acknowledged[group]) == null ? void 0 : _a3[key2]);
        })));
        let preservePins = !force && JSON.stringify((_a2 = local.friends) == null ? void 0 : _a2.pins) === JSON.stringify((_b2 = state.acknowledged.friends) == null ? void 0 : _b2.pins);
        try {
          await sync.exchange(state.account, PREFERENCES_SYNC_PATH, { groups: groups2, values, uploadOnly: !0, patch: !force, preservePins }, key, signal), ensureCurrent(state);
          let acknowledged = { ...state.acknowledged, ...Object.fromEntries(groups2.map((group) => [group, local[group]])) };
          return state.cursor ? await save(state, state.history, state.cursor, acknowledged) : state.acknowledged = acknowledged, state.error = "", "\u5DF2\u4E0A\u4F20\u5230\u4E91\u7AEF";
        } catch (error) {
          throw refresh() === state && (state.error = error.message), error;
        }
      });
    }
    function tick() {
      let state = refresh();
      !state || state.job || (state.nextDownload !== null && state.nextDownload <= now() ? download2(state).catch(() => {
      }) : state.ready && state.nextUpload <= now() && upload(state, !1).catch(() => {
      }));
    }
    scope.add(settings.subscribe((key) => {
      let state = session;
      applying || !(state != null && state.storage.watches(key)) || (state.nextUpload = 0, !scheduled && (scheduled = !0, scope.timeout(() => {
        scheduled = !1, tick();
      }, 100)));
    })), scope.add(() => {
      var _a2;
      return (_a2 = session == null ? void 0 : session.job) == null ? void 0 : _a2.abort();
    }), scope.interval(tick, 500);
    function requestPull(state) {
      state.job ? state.pullRequested = !0 : state.nextDownload = 0;
    }
    return {
      login(account) {
        let state = refresh();
        state && state.account === account && (state.lastLogin === void 0 || now() - state.lastLogin >= 1e3) && (state.lastLogin = now(), requestPull(state)), tick();
      },
      reconnect() {
        let state = refresh();
        state && (state.cursor || state.job || !state.hydrated) && requestPull(state), tick();
      },
      upload: () => upload(refresh(), !0),
      restore: (confirm) => download2(refresh(), confirm),
      canUpload(id) {
        let state = refresh();
        return !!(state != null && state.ready && state.account === id);
      },
      async history(id) {
        let state = refresh();
        if (!state || state.account !== id) return;
        if (state.history) return state.history;
        let saved = await cache2.get(state.cacheKey);
        return validHistory(saved) && (state.history ??= { matches: saved.matches, ledger: saved.ledger }), state.history;
      },
      get busy() {
        return !!(session != null && session.job);
      },
      get error() {
        return (session == null ? void 0 : session.error) ?? "";
      }
    };
  }
  function openSyncBackupCache(win, scope) {
    let database, ready = new Promise((resolve, reject) => {
      if (!win.indexedDB) return reject(new Error("\u6D4F\u89C8\u5668\u65E0\u6CD5\u4FDD\u5B58\u4E91\u7AEF\u8D26\u672C\u548C\u6218\u7EE9"));
      let request = win.indexedDB.open("sgs-toolbox-cloud-backups", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("backups"), request.onsuccess = () => {
        database = request.result, scope.closed && database.close(), database.onversionchange = () => database.close(), resolve(database);
      }, request.onerror = () => reject(request.error);
    });
    ready.catch(() => {
    }), scope.add(() => database == null ? void 0 : database.close());
    async function transaction(mode, command) {
      let db = await ready;
      if (scope.closed) throw new Error("\u4E91\u540C\u6B65\u5DF2\u5173\u95ED");
      return new Promise((resolve, reject) => {
        let tx = db.transaction("backups", mode), request = command(tx.objectStore("backups"));
        tx.oncomplete = () => resolve(request.result), tx.onabort = tx.onerror = () => reject(tx.error ?? request.error ?? new Error("\u4E91\u7AEF\u5907\u4EFD\u7F13\u5B58\u5199\u5165\u5931\u8D25"));
      });
    }
    return {
      get: (key) => transaction("readonly", (store) => store.get(key)),
      async put(key, snapshot, expected) {
        let accepted = !1;
        return await transaction("readwrite", (store) => {
          let request = store.get(key);
          return request.onsuccess = () => {
            var _a2;
            let previous = (_a2 = request.result) == null ? void 0 : _a2.cursor;
            (previous == null ? void 0 : previous.epoch) !== (expected == null ? void 0 : expected.epoch) || (previous == null ? void 0 : previous.seq) !== (expected == null ? void 0 : expected.seq) || (accepted = !0, store.put(snapshot, key));
          }, request;
        }), accepted;
      }
    };
  }
  function createPrivateHttpTransport(win, port) {
    let source = port || win, origin = win.location.origin, send = port ? (data) => port.postMessage(data) : (data) => win.postMessage({ type: "sgs-toolbox-private-sync-http", ...data }, origin), nextId = 0;
    return (request, signal) => new Promise((resolve, reject) => {
      let id = port ? "sync:" + ++nextId : Array.from(win.crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16).padStart(8, "0")).join("");
      function finish() {
        source.removeEventListener("message", receive), signal.removeEventListener("abort", abort);
      }
      function receive(event) {
        let { data } = event;
        (data == null ? void 0 : data.id) === id && (!port && (event.source !== win || event.origin !== origin || data.type !== "sgs-toolbox-private-sync-http-result") || (finish(), data.error ? reject(new Error(data.error)) : resolve(data.reply)));
      }
      function abort() {
        finish();
        try {
          send({ id, cancel: !0 });
        } catch {
        }
        reject(new Error("\u79C1\u6709\u540C\u6B65\u8BF7\u6C42\u5DF2\u53D6\u6D88"));
      }
      if (signal.aborted) return reject(new Error("\u79C1\u6709\u540C\u6B65\u8BF7\u6C42\u5DF2\u53D6\u6D88"));
      source.addEventListener("message", receive), signal.addEventListener("abort", abort, { once: !0 });
      try {
        send({ id, ...request });
      } catch (error) {
        finish(), reject(error);
      }
    });
  }
  function boot(win = window, mobileSkinPort) {
    let ownsPort = !1, ready = startOwnedRuntime(win, EDITION, (api) => (ownsPort = !0, mobileSkinPort && api.scope.add(() => {
      mobileSkinPort.postMessage({ close: !0 }), mobileSkinPort.close();
    }), initialize(win, api, mobileSkinPort)));
    return mobileSkinPort ? ready.finally(() => {
      ownsPort || (mobileSkinPort.postMessage({ close: !0 }), mobileSkinPort.close());
    }) : ready;
  }
  async function initialize(win, api, mobileSkinPort) {
    var _a2, _b2, _c;
    let scope = api.scope, startup = null;
    installMicroCompatibility(win, scope);
    let onlyPlugin = null, settings = new Settings(win.localStorage, onlyPlugin ? `sgstoolbox:demo:${onlyPlugin}:` : "sgstoolbox:"), journal = new SessionJournal(), diagnostics = createCardDiagnostics({ journal, scope, version: CORE_VERSION });
    Object.assign(api, { version: CORE_VERSION, journal, diagnostics });
    let bridge, game = createGameAdapter(win, scope, mobileSkinPort, {
      watchScene: !1,
      readLoginAccount: (proxy) => bridge == null ? void 0 : bridge.getLoginAccount(proxy)
    }), sceneWatch = createSceneWatch({ game, scope }), getAccount = () => readNativeAccount({ game }), syncKey = (id) => syncGameAccountKey(win, id), managedSync = !win.__SGS_TOOLBOX_DEMO__ || win.__SGS_TOOLBOX_DEMO__.managedSync === !0 ? createManagedSync(win, scope, getAccount, syncKey, createPrivateHttpTransport(win, mobileSkinPort), {
      testEligible: (id) => canUseSyncTest(game, id),
      loadOfficerConfig: () => game.loadConfigData("h5_officer")
    }) : null;
    if (managedSync) {
      let readDirectReport = game.readStargazingReport;
      game.readStargazingReport = async (options) => await managedSync.readStargazingReport(options) ?? readDirectReport(options);
    }
    let preferenceSync = managedSync && createPreferenceSync({
      settings,
      sync: managedSync,
      gameAccountKey: syncKey,
      scope,
      cache: openSyncBackupCache(win, scope),
      onRestored: (groups2) => win.dispatchEvent(new win.CustomEvent(PREFERENCES_RESTORED, { detail: groups2 })),
      onDownloaded: () => win.dispatchEvent(new win.CustomEvent(BACKUP_RESTORED)),
      onUpdated: (kinds) => win.dispatchEvent(new win.CustomEvent(SYNC_HISTORY_UPDATED, { detail: kinds }))
    });
    preferenceSync && (scope.listen(win, "online", preferenceSync.reconnect), scope.add(journal.subscribe(({ type, payload }) => {
      if (type !== "ClientLoginRep") return;
      let id = Number(payload == null ? void 0 : payload.userID);
      Number.isSafeInteger(id) && id > 0 && preferenceSync.login(String(id));
    })));
    let shell = createShell({
      window: win,
      document: win.document,
      settings,
      scope,
      sceneWatch,
      getFeedbackAccount: getAccount,
      managedSync,
      preferenceSync,
      getStartupDiagnostics: startup == null ? void 0 : startup.snapshot,
      canReserveGameViewport: () => !0
    }), themes = new ThemeRegistry(settings, (tokens) => shell.applyTheme(tokens), THEMES), cardStyles = new CardStyleRegistry({ window: win, document: win.document, game, settings, scope, sceneWatch }), backgrounds = new BackgroundRegistry({ window: win, game, settings, scope, sceneWatch });
    scope.add(game.onSceneChange((scene) => shell.setGameView(gameViewForScene(scene)))), shell.setGameView(gameViewForScene(game.getScene()));
    let screenshot = createScreenshotController({ window: win, game, settings, scope, notify: shell.notify });
    if (bridge = installMessageBridge(win, journal, scope, (message) => shell.setStatus(message), {
      getTargets: game.getMessageTargets,
      sceneWatch,
      observeStartupDispatch: startup == null ? void 0 : startup.observeDispatch,
      observeType: startup ? (type, source, observed) => {
        startup.observeMessage(type, source), diagnostics.observeType(type, source, observed);
      } : diagnostics.observeType
    }), startup) {
      let stop = scope.add(sceneWatch.watch(() => {
        var _a3;
        startup.observeGame(!!((_a3 = win.Laya) != null && _a3.stage), game.getRenderedScene(), bridge.getStatus().targets.includes("ServerProxy")) && stop();
      }, 500, !0));
    }
    let compat, mounted = !1, legacyWarned = !1, marketConnection = createMarketConnection(settings, win.fetch.bind(win), shell.notify);
    marketConnection.start();
    let snapshots, manager2 = new PluginManager({
      journal,
      store: new PackageStore(win.indexedDB, onlyPlugin ? `sgs-ol-toolbox-demo-${onlyPlugin}` : "sgs-ol-toolbox"),
      settings,
      context: {
        core: Object.freeze({ version: CORE_VERSION, distribution: EDITION, platform: "microclient" }),
        window: win,
        document: win.document,
        game,
        ui: shell,
        themes,
        cardStyles,
        backgrounds,
        ...managedSync && {
          devAppearanceSync: createDevAppearanceSync(win, managedSync, preferenceSync),
          devLedgerSync: createDevLedgerSync(win, managedSync, preferenceSync)
        },
        notify: shell.notify
      },
      onChange: () => shell.render(),
      onReplayGap: () => snapshots == null ? void 0 : snapshots.refreshForReplay()
    });
    scope.add(() => manager2.dispose());
    let replacements = {
      cards: REPLACED_CARD_PACKAGES,
      backgrounds: REPLACED_BACKGROUND_PACKAGES,
      "daily-rewards": REPLACED_REWARD_PACKAGES,
      effects: REPLACED_EFFECT_PACKAGES,
      skins: REPLACED_SKIN_PACKAGES,
      shanhetu: REPLACED_SHANHETU_PACKAGES,
      baisheng: REPLACED_BAISHENG_PACKAGES,
      appearances: REPLACED_APPEARANCE_PACKAGES
    };
    for (let pkg of bundledPackages) if ((!onlyPlugin || pkg.manifest.id === onlyPlugin || onlyPlugin === "gaizhu" && pkg.manifest.id === "baisheng") && (await manager2.registerBundled(pkg, replacements[pkg.manifest.id] || []).catch(() => {
    }), scope.closed))
      return null;
    return shell.setHandlers({
      manager: manager2,
      themes,
      cardStyles,
      compat,
      market: marketConnection.get,
      setMarketUrl: marketConnection.set,
      fullPluginPanels: onlyPlugin ? [] : fullPluginPanels,
      screenshot: screenshot.capture,
      exportDiagnostics: async () => (await bridge.flush(), diagnostics.serialize({ bridge: bridge.getStatus() }))
    }, { deferStartupMarket: !0 }), shell.setStatusVisible(!1), scope.add(journal.subscribe((event) => {
      var _a3;
      event.type === "toolbox:snapshot" && typeof ((_a3 = event.payload) == null ? void 0 : _a3.inGame) == "boolean" ? shell.setStatusVisible(event.payload.inGame) : event.type === "MsgGamePlayCardNtf" ? shell.setStatusVisible(!0) : ["MsgGameOver", "ClientLeavetableRep"].includes(event.type) && shell.setStatusVisible(!1);
    })), snapshots = attachSessionSnapshots({ journal, game, scope, settled: bridge.flush }), scope.add(sceneWatch.watch(() => {
      var _a3;
      shell.setRemainingSlash(game.getRemainingSlash());
      let ready = !!(game.getScene() || (_a3 = win.Laya) != null && _a3.stage || win.__SGS_TOOLBOX_DEMO__), display = ready ? "" : "none";
      shell.host.style.display !== display && (shell.host.style.display = display), ready && !mounted && (mounted = !0, snapshots.request());
      let capture = bridge.getStatus();
      shell.setStatus(bridge.error || (ready ? capture.received ? `\u5DF2\u6536 ${capture.received} \u6761\u6D88\u606F \xB7 ${journal.incomplete ? "\u7F3A\u5C11\u5F00\u5C40\u8BB0\u5F55" : "\u672C\u5C40\u8BB0\u5F55\u4E2D"}` : capture.targets.length ? "\u6D88\u606F\u5165\u53E3\u5DF2\u8FDE\u63A5 \xB7 \u7B49\u5F85\u6536\u5305" : "\u672A\u63A5\u5165\u6E38\u620F\u6D88\u606F \xB7 \u4EC5\u539F\u751F\u663E\u793A\u53EF\u7528" : "\u7B49\u5F85\u6E38\u620F\u8FD0\u884C\u65F6"));
    }, 500)), !win.__SGS_TOOLBOX_DEMO__ && !((_c = win.Laya) != null && _c.stage) && (shell.host.style.display = "none"), await manager2.init(async (records, builtins, store) => {
      let migrations = [reconcileConsolidatedPlugins(records, builtins, store, settings, consolidationDigests)], errors = (await Promise.allSettled(migrations)).filter((result) => result.status === "rejected").map((result) => {
        var _a3;
        return ((_a3 = result.reason) == null ? void 0 : _a3.message) || String(result.reason);
      });
      if (errors.length) throw new Error(errors.join("\uFF1B"));
    }), scope.closed ? null : (scope.timeout(shell.startMarketUpdates, 1500), Object.assign(api, { manager: manager2, game, themes, cardStyles, backgrounds, compat, shell, settings, bridge, market: marketConnection.get }), win.__SGS_TOOLBOX_DEMO__ && snapshots.request(), manager2.storageError ? shell.notify("\u65E0\u6CD5\u8BFB\u53D6\u63D2\u4EF6\u5B58\u50A8\uFF0C\u8BF7\u5237\u65B0\u6E38\u620F\u91CD\u8BD5\u3002") : manager2.loadIssues.size ? shell.notify(`${manager2.loadIssues.size} \u4E2A\u63D2\u4EF6\u52A0\u8F7D\u5F02\u5E38\uFF0C\u5DF2\u4FDD\u7559\u5B89\u88C5\u8BB0\u5F55\u3002`) : manager2.errors.length && shell.notify(manager2.errors.join("\uFF1B")), api);
  }
  boot(window, typeof sgsToolboxMobileSkinPort > "u" ? void 0 : sgsToolboxMobileSkinPort).catch((error) => {
    console.error("[\u4E09\u56FD\u6740OL\u5DE5\u5177\u7BB1]", error);
  });
})();
