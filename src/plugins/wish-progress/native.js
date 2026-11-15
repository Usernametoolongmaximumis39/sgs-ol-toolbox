import { getNativeTheme } from '../../ui/native-theme.js';
// Ported from the local 2.6.8 implementation; never sends draw requests.
export function createWishProgress(ctx) {
const labels = new Map(), theme = getNativeTheme(ctx); let lastAccount = null;
var views = new Map();
var wrappers = new WeakMap();
var managers = {};
var lastScan = 0;
var watched = new WeakSet();
var specs = {
    general: { view: 'GeneralWishWindow', read: 'GetCurUpGeneralDataByRound',
        send: 'OnSendDrawUpGeneralReq', data: 'onServerGeneralWishPoolDataResp',
        result: 'onServerDrawGeneralWishResp', change: 'OnSendClientChangeGeneralWishReq',
        update: 'updateGeneralItem' },
    skin: { view: 'SkinUPMainWindow', read: 'GetCurUpSkinDataByRound',
        send: 'OnSendDrawUpSkinReq', data: 'onServerSkinWishPoolDataResp',
        result: 'onServerDrawSkinWishResp', change: 'OnSendClientChangeSkinWishReq',
        update: 'updateSkinItem' }
};

function visible(v) {
    if (!v || v.destroyed || !v.parent) return false;
    for (var n = v; n; n = n.parent) if (n.visible === false || n.destroyed) return false;
    return true;
}
function observe(fn) { try { fn(); } catch (e) { ctx.reportError?.(e); } }
function hook(o, name, before, after) {
 if (!o || typeof o[name] !== 'function' || wrappers.has(o[name])) return;
 const original = o[name];
 ctx.scope.patch(o, name, old => function (...args) {
   if (before) observe(() => before(this, args));
   const result = old.apply(this, args);
   if (after) observe(() => after(this, args));
   return result;
 });
 const wrapped = o[name]; wrappers.set(wrapped, true);
 const events = ctx.game.getServerProxy()?._events;
 if (events) for (const raw of Object.values(events)) for (const h of (Array.isArray(raw) ? raw : [raw])) {
   if (h?.caller === o && h.method === original) ctx.scope.patch(h, 'method', () => wrapped);
 }
}
function snapshot(kind, v) {
    var m = managers[kind], sp = specs[kind];
    if (!m || !v.vo) return null;
    var d = m[sp.read](v.vo.RoundID);
    if (!d || typeof d.ratio !== 'number' || !Number.isFinite(d.ratio) || d.ratio < 0 || d.ratio > 10000) return null;
    var selected = m.GetSelectVoByRound(v.vo.RoundID, d.wish_item);
    var count = selected && Number(selected.SplitNum);
    if (!d.wish_item || !Number.isInteger(count) || count < 1) return null;
    return { key: String(v.vo.RoundID) + ':' + d.wish_item + ':' + count,
        round: v.vo.RoundID, ratio: d.ratio, count: count };
}
function reset(v) { views.delete(v); }
function render(kind, v) {
    if (!visible(v)) { reset(v); return; }
    if (!watched.has(v) && typeof v.on === 'function' && ctx.window.Laya && ctx.window.Laya.Event) {
        watched.add(v);
        const event = ctx.window.Laya.Event.UNDISPLAY || 'undisplay';
        const clear = () => reset(v); v.on(event, v, clear);
        ctx.scope.add(() => v.off?.(event, v, clear));
    }
    var d = snapshot(kind, v), label = v.proBar && v.proBar.label;
    if (!label) return;
    if (!d) { reset(v); label.text = ''; return; }
    var state = views.get(v);
    if (!state || state.key !== d.key) {
        state = { kind: kind, key: d.key, current: d, delta: null, pending: null };
        views.set(v, state);
    }
    state.current = d;
    var p = state.pending;
    if (p && p.ok && p.after) {
        state.delta = p.after.ratio - p.before.ratio;
        state.pending = null;
    }
    var scale = kind === 'general' ? d.count / 10000 : 1 / 100;
    var text = kind === 'general' ? (d.ratio * scale).toFixed(3) + '/' + d.count
        : (d.ratio / 100).toFixed(2) + '%';
    if (state.delta !== null) {
        var delta = state.delta * scale;
        text += '（' + (delta >= 0 ? '+' : '-') + Math.abs(delta).toFixed(3)
            + (kind === 'skin' ? '%' : '') + '）';
    }
    if (!labels.has(label)) {
        labels.set(label, Object.fromEntries(['text','color','stroke','strokeColor','width','height','align','x','y'].map(k => [k,label[k]])));
        theme.bind(label, { color:'text', strokeColor:'surface' });
    }
    label.text = text; label.stroke = 1;
    label.width = 270; label.height = 24; label.align = 'left';
    label.pos(18, v.proBar.height / 2 + 4);
}
function each(kind, fn) {
    views.forEach(function (state, v) {
        if (!visible(v)) { reset(v); return; }
        if (state.kind === kind) fn(state, v);
    });
}
function attachManager(kind, m) {
    var sp = specs[kind];
    if (!m || typeof m[sp.read] !== 'function' || typeof m.GetSelectVoByRound !== 'function') return;
    managers[kind] = m;
    hook(m, sp.send, function (_, args) {
        each(kind, function (s, v) {
            render(kind, v);
            s = views.get(v);
            if (s && String(s.current.round) === String(args[0]) && (args[1] === 1 || args[1] === 5)) {
                s.pending = { before: s.current, ok: false, after: null };
            }
        });
    });
    hook(m, sp.data, null, function (_, args) {
        var data = args[0] && args[0].Protocol && args[0].Protocol.Data;
        var body = data && data.ProtoObj;
        if (!body || body.result || !Array.isArray(body.list)) return;
        each(kind, function (s, v) {
            var d = snapshot(kind, v);
            if (s.pending && d && d.key === s.key && body.list.some(function (row) {
                return String(row.round) === String(d.round);
            })) s.pending.after = d;
            render(kind, v);
        });
    });
    hook(m, sp.result, null, function (_, args) {
        var data = args[0] && args[0].Protocol && args[0].Protocol.Data;
        var body = data && data.ProtoObj;
        each(kind, function (s, v) {
            if (!s.pending) return;
            if (!body || body.result) s.pending = null;
            else s.pending.ok = true;
            render(kind, v);
        });
    });
    hook(m, sp.change, function () {
        each(kind, function (s) { s.pending = null; s.delta = null; });
    });
}
function attachView(kind, proto) {
    if (!proto) return;
    hook(proto, specs[kind].update, null, function (v) { render(kind, v); });
    hook(proto, 'updateProgress', null, function (v) { render(kind, v); });
    ['Reset', 'Remove', 'Clear'].forEach(function (name) {
        hook(proto, name, function (v) { reset(v); });
    });
}
function tick() {
    if (ctx.scope.signal.aborted) return;
    const self = ctx.game.getSelf?.(), id = self?.ClientId ?? self?.clientId ?? null;
    if (id !== lastAccount) { views.clear(); lastAccount = id; }
    if (Date.now() - lastScan < 1000) return;
    lastScan = Date.now();
    var L = ctx.window.Laya;
    if (!L || !L.stage) return;
    // Only wrap confirmed window instances; no global prototype changes.
    var proxy = ctx.game.getServerProxy(), events = proxy && proxy._events;
    if (events) Object.keys(events).forEach(function (key) {
        var handlers = Array.isArray(events[key]) ? events[key] : [events[key]];
        handlers.forEach(function (h) {
            var m = h && h.caller;
            if (!m) return;
            Object.keys(specs).forEach(function (kind) { attachManager(kind, m); });
        });
    });
    var queue = [L.stage], seen = new Set(), guard = 0;
    while (queue.length && guard++ < 5000) {
        var v = queue.shift();
        if (!v || seen.has(v) || v.visible === false || v.destroyed) continue;
        seen.add(v);
        if (v.proBar && v.vo && typeof v.updateProgress === 'function') {
            var kind = typeof v.updateGeneralItem === 'function' ? 'general'
                : typeof v.updateSkinItem === 'function' ? 'skin' : null;
            if (kind) { attachView(kind, v); render(kind, v); }
        }
        if (v._children) queue.push.apply(queue, v._children);
    }
    views.forEach(function (_, v) { if (!seen.has(v) || !visible(v)) reset(v); });
}
ctx.scope.add(() => { views.clear(); for (const [label,saved] of labels) if (!label.destroyed) Object.assign(label,saved); labels.clear(); });
ctx.scope.interval(() => observe(tick),1000); observe(tick);
return { tick };
}
