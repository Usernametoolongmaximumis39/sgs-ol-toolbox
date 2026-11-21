import { acquirePluginStyles, mountPluginUI } from '../ui/plugin-ui.js';
import { ResourceScope } from './resources.js';
import { advancedSkinOption } from '../shared/skin-options.js';
import { compilePackage, verifyPackage, validateManifest } from './packages.js';
import { createNativeTheme } from '../ui/native-theme.js';
import { normalizePanel, comparePluginOrder } from './plugin-contract.js';
import { createPluginNative } from './plugin-native.js';

export class PluginManager {
  constructor({ journal, store, settings, context, onChange = () => {} }) {
    Object.assign(this, { journal, store, settings, context, onChange });
    this.builtins = new Map(); this.slots = new Map(); this.tail = Promise.resolve(); this.errors = []; this.closed = false;
    this.initializing = true; this.storageError = ''; this.loadIssues = new Map();
    this.priorityPlayActions = new Set();
    this.unsubscribe = journal.subscribe(event => {
      let changed = false;
      for (const slot of this.slots.values()) {
        try { this.reduce(slot, event); for (const fn of slot.listeners) fn(slot.state, event); }
        catch (e) { this.runtimeError(slot, e); }
      }
      if (changed) this.onChange();
    });
  }
  serial(fn) { const work = this.tail.catch(() => {}).then(() => { if (this.closed) throw new Error('插件管理器已停止'); if (this.storageError) throw new Error(this.storageError); return fn(); }); this.tail = work; return work; }
  registerBuiltin(module) { validateManifest(module.manifest); this.builtins.set(module.manifest.id, module); }
  async registerBundled(pkg, replacesPackageDigests = []) {
    await verifyPackage(pkg);
    this.registerBuiltin({ ...compilePackage(pkg), bundledPackage: pkg, replacesPackageDigests });
  }
  makeSlot(module, record) { const slot = { module, record, state: module.initialState?.() ?? {}, listeners: new Set(), scope: null, active: false, sessionId: null, cursor: 0, error: '' }; for (const event of this.journal.events) this.reduce(slot, event); return slot; }
  reduce(slot, event) { if (event.seq <= slot.cursor) return; if (slot.sessionId !== event.sessionId) { slot.state = slot.module.initialState?.() ?? {}; slot.sessionId = event.sessionId; } if (slot.module.reduce) slot.state = slot.module.reduce(slot.state, event); slot.cursor = event.seq; }
  dependencyError(message) { return Object.assign(new Error(message), { dependency: true }); }
  assertGraph(module, path = []) {
    const id = module.manifest.id;
    if (path.includes(id)) throw this.dependencyError('前置插件循环依赖：' + [...path, id].join(' → '));
    for (const dep of module.manifest.dependencies || []) {
      const target = this.slots.get(dep)?.module;
      if (target) this.assertGraph(target, [...path, id]);
    }
  }
  assertUnused(id) {
    const users = [...this.slots.values()].filter(s => s.record.enabled && s.module.manifest.dependencies?.includes(id));
    if (users.length) throw this.dependencyError('请先停用依赖此插件的：' + users.map(s => s.module.manifest.name).join('、'));
  }
  enabledDependents(id) {
    const seen = new Set([id]), stoppedFirst = [];
    const visit = target => {
      for (const slot of this.slots.values()) {
        const next = slot.module.manifest.id;
        if (seen.has(next) || !slot.module.manifest.dependencies?.includes(target)) continue;
        seen.add(next); visit(next);
        if (slot.record.enabled) stoppedFirst.push(slot);
      }
    };
    visit(id);
    return stoppedFirst.reverse();
  }
  runtimeError(slot, error) {
    if (this.closed || slot.recovering) return;
    const message = String(error?.stack || error);
    if (!slot.record.enabled || slot.restartUsed) {
      if (slot.error !== message) { slot.error = message; this.onChange(); }
      return;
    }
    slot.restartUsed = true; slot.recovering = true;
    const scope = slot.scope;
    void this.serial(async () => {
      if (this.slots.get(slot.module.manifest.id) !== slot || slot.scope !== scope || !slot.record.enabled) { slot.recovering = false; return; }
      this.deactivate(slot); slot.error = '';
      try { for (const event of this.journal.events) this.reduce(slot, event); await this.activate(slot); slot.error = slot.reportedError || ''; }
      catch (e) { slot.error = `自动重启失败：${String(e?.stack || e)}\n首次错误：${message}`; }
      slot.recovering = false;
      if (slot.error) this.context.notify?.(`插件 ${slot.module.manifest.name} 自动重启后仍有错误，请查看详情。`);
      this.onChange();
    }).catch(() => {}).finally(() => { slot.recovering = false; });
  }
  async activate(slot, path = []) {
    try { return await this.activateOnce(slot, path); }
    catch (error) {
      if (error.dependency || this.closed || slot.restartUsed) throw error;
      slot.restartUsed = true; this.deactivate(slot);
      return this.activateOnce(slot, path);
    }
  }
  async activateOnce(slot, path = []) {
    if (this.closed) throw new Error('插件管理器已停止');
    if (slot.active) return;
    const pluginId = slot.module.manifest.id;
    if (path.includes(pluginId)) throw this.dependencyError('前置插件循环依赖：' + [...path, pluginId].join(' → '));
    for (const id of slot.module.manifest.dependencies || []) {
      const dep = this.slots.get(id), name = dep?.module.manifest.name || this.builtins.get(id)?.manifest.name || id;
      if (!dep) throw this.dependencyError('前置插件「' + name + '」未安装，请先安装并启用。');
      if (!dep.record.enabled) throw this.dependencyError('前置插件「' + name + '」已停用，请先启用。');
      try { await this.activate(dep, [...path, pluginId]); }
      catch (error) { throw this.dependencyError('前置插件「' + name + '」无法运行：' + error.message); }
    }
    if (this.closed) throw new Error('插件管理器已停止');
    const scope = new ResourceScope(); slot.scope = scope; slot.reportedError = '';
    const id = slot.module.manifest.id;
    const { devAppearanceSync, devLedgerSync, ...context } = this.context;
    const skinShortcutEnabled = () => !scope.closed && advancedSkinOption(this.settings.namespace('skins'), 'backgroundShortcut');
    const canSelectSkinImage = () => id === 'skins' && skinShortcutEnabled() && context.backgrounds?.isActive?.('backgrounds') === true;
    const ctx = { ...context, ...(id === 'appearances' && devAppearanceSync ? { devAppearanceSync } : {}),
      ...(id === 'ledger' && devLedgerSync ? { devLedgerSync } : {}),
      scope, settings: this.settings.namespace(id), storage: this.settings.namespace(id), getState: () => slot.state,
      subscribe: fn => { slot.listeners.add(fn); const off = () => slot.listeners.delete(fn); scope.add(off); return off; },
      playActions: {
        registerPriority: fn => {
          const action = (scene, self) => {
            if (scope.closed) return false;
            try { return fn(scene, self) === true; }
            catch (error) { ctx.reportError(error); return true; }
          };
          this.priorityPlayActions.add(action);
          return scope.add(() => this.priorityPlayActions.delete(action));
        },
        runPriority: (scene, self) => {
          if (scope.closed) return false;
          for (const action of this.priorityPlayActions) if (action(scene, self)) return true;
          return false;
        },
      },
      reportError: value => { if (scope.closed) return; const message = value == null ? '' : String(value?.stack || value); slot.reportedError = message;
        if (message) { if (slot.active) this.runtimeError(slot, value); return; }
        if (slot.error) { slot.error = ''; this.onChange(); } },
      ui: { ...mountPluginUI({ ...this.context, scope }, () => ctx), nativeTheme: createNativeTheme({ ...this.context, scope }),
        registerCompactSummary: () => {
          const id = slot.module.manifest.id;
          scope.add(() => this.context.ui.setCompactSummary?.(id, []));
          return items => { if (!scope.closed) this.context.ui.setCompactSummary?.(id, items); };
        },
        registerPanel: spec => { if (scope.closed) return () => {}; const panel = normalizePanel(spec, slot.module.manifest), render = panel.render;
          panel.render = (container, options) => {
            const root = container.getRootNode?.(), release = root?.host ? acquirePluginStyles(root, this.context.document) : () => {};
            try { const cleanup = render(container, options); return () => { try { cleanup?.(); } finally { release(); } }; }
            catch (error) { release(); throw error; }
          };
          return scope.add(this.context.ui.registerPanel(panel)); } },
      skinWindows: {
        register: open => {
          if (id !== 'skins' || scope.closed) return;
          this.openSkinWindow = open;
          return scope.add(() => { if (this.openSkinWindow === open) this.openSkinWindow = null; });
        },
        open: (source, trigger) => {
          if (id !== 'backgrounds' || scope.closed) return;
          if (!this.openSkinWindow) throw new Error('请先更新并启用皮肤管理插件。');
          return this.openSkinWindow(source, trigger);
        },
      },
      backgrounds: {
        isInstalled: () => !scope.closed && this.slots.has('backgrounds'),
        skinShortcutEnabled,
        canSelectSkinImage,
        selectSkinImage: (file, skinKey, skinMotion, signal) => {
          const isCurrent = () => !signal.aborted && canSelectSkinImage();
          if (!isCurrent()) return false;
          const animated = this.settings.namespace('backgrounds').get('animated', true) !== false;
          return context.backgrounds.selectLocal('backgrounds', file, { skinKey, skinMotion, animated, isCurrent });
        },
        registerSkinMotion: load => {
          if (id === 'skins' && !scope.closed) return scope.add(context.backgrounds?.registerSkinMotion?.(load));
        },
        register: () => scope.closed ? () => {} : scope.add(this.context.backgrounds.register(id)),
        select: spec => { if (!scope.closed) this.context.backgrounds.select(id, spec); },
        setAttackEffects: enabled => { if (!scope.closed) this.context.backgrounds.setAttackEffects(id, enabled); },
        setAnimated: enabled => { if (!scope.closed) this.context.backgrounds.setAnimated(id, enabled); },
        selectLocal: file => { if (!scope.closed) return this.context.backgrounds.selectLocal(id, file); },
        subscribe: fn => scope.closed ? () => {} : scope.add(this.context.backgrounds.subscribe(fn)),
        get current() { return thisContext.backgrounds.current; },
        get status() { return thisContext.backgrounds.status; },
      },
      cardStyles: {
        register: style => scope.closed ? () => {} : scope.add(this.context.cardStyles.register(style, id)),
        list: () => this.context.cardStyles.list(),
        select: styleId => { if (!scope.closed) this.context.cardStyles.select(styleId); },
        subscribe: fn => scope.closed ? () => {} : scope.add(this.context.cardStyles.subscribe(fn)),
        selectSide: (side, styleId) => { if (!scope.closed) this.context.cardStyles.selectSide(side, styleId); },
        selectScope: value => { if (!scope.closed) this.context.cardStyles.selectScope(value); },
        get selection() { return thisContext.cardStyles.selection; },
        get current() { return thisContext.cardStyles.current; },
      },
      themes: {
        register: theme => scope.add(this.context.themes.register(theme, id)),
        override: (tokens, priority) => scope.add(this.context.themes.override(id, tokens, priority)),
        select: themeId => { if (!scope.closed) this.context.themes.select(themeId); },
        list: () => this.context.themes.list(),
        subscribe: fn => scope.add(this.context.themes.subscribe(current => { if (!scope.closed) fn(current); })),
        get current() { return thisContext.themes.current; }
      }
    };
    ctx.native = createPluginNative(ctx);
    const thisContext = this.context;
    try { const result = await slot.module.activate(ctx); if (typeof result === 'function') scope.add(result); else if (result?.dispose) scope.add(() => result.dispose()); if (this.closed || scope.closed) throw new Error('插件激活已取消'); slot.active = true; slot.error = ''; if (slot.reportedError) this.runtimeError(slot, slot.reportedError); }
    catch (e) { scope.dispose(); slot.scope = null; throw e; }
  }
  deactivate(slot) { slot.scope?.dispose(); slot.scope = null; slot.active = false; slot.listeners.clear(); }
  init() {
    return this.serial(async () => {
      try { await this.loadInstalled(); }
      finally {
        this.initializing = false;
        if (!this.closed) this.onChange();
      }
    });
  }
  async loadInstalled() {
    let stored;
    try { stored = await this.store.list(); }
    catch (error) {
      this.storageError = '无法读取插件存储，请刷新游戏重试。' + (error?.message || String(error));
      this.errors.push(this.storageError);
      return;
    }
    if (this.closed) return;
    const records = new Map(stored.map(r => [r.id, r]));
    for (const id of new Set([...this.builtins.keys(), ...records.keys()])) {
      let record = records.get(id) || { id, active: null, previous: null, enabled: true, uninstalled: false };
      if (record.uninstalled) continue;
      const builtin = this.builtins.get(id);
      let module = builtin;
      // Older cores could be closed after saving the migration marker but
      // before saving the bundled code. Lite can still load the saved package.
      const saved = record.active || (!builtin && !record.previous?.builtin ? record.previous : null);
      if (saved) {
        try { await verifyPackage(saved); module = compilePackage(saved); }
        catch (error) {
          const message = error?.message || String(error);
          this.errors.push(`${id}: ${message}`);
          this.loadIssues.set(id, { record, message });
          // A temporary verification or compilation failure must leave both
          // saved packages in place so the next startup can try them again.
          if (record.active && record.previous && !record.previous.builtin) {
            try { await verifyPackage(record.previous); module = compilePackage(record.previous); } catch {}
          }
        }
      }
      if (this.closed) return;
      const loadFailed = this.loadIssues.has(id);
      if (saved && !record.active && !loadFailed) {
        record = { ...record, active: saved, previous: null };
        try { await this.store.put(record); } catch (error) { this.errors.push(`${id}: 插件恢复未保存：${error.message}`); }
      }
      if (!loadFailed && record.active && builtin?.replacesPackageDigests?.includes(record.active.sha256) && !record.appliedBuiltinMigrations?.includes(record.active.sha256)) {
        const upgraded = { ...record, active: builtin.bundledPackage || null, previous: record.active, appliedBuiltinMigrations: [...(record.appliedBuiltinMigrations || []), record.active.sha256] };
        try {
          await this.store.put(upgraded); record = upgraded; module = builtin;
          this.context.notify?.(`${builtin.manifest.name}已更新至随核心提供的 ${builtin.manifest.version}`);
        } catch (error) { this.errors.push(`${id}: 内置修复更新未保存：${error.message}`); }
      }
      if (this.closed) return;
      if (!module) continue;
      // Full materializes its bundled code before activation. Lite can then load
      // the same installation and rollback records without bundling any plugins.
      if (!loadFailed && builtin?.bundledPackage && (!record.active || record.previous?.builtin)) {
        const portable = { ...record, active: record.active || builtin.bundledPackage,
          previous: record.previous?.builtin ? builtin.bundledPackage : record.previous };
        try { await this.store.put(portable); record = portable; }
        catch (error) { this.errors.push(`${id}: 插件独立保存失败，切换轻量版前请修复存储：${error.message}`); }
      }
      if (this.closed) return;
      const slot = this.makeSlot(module, record); this.slots.set(id, slot);
    }
    // Resolve dependencies only after all installed modules have been registered.
    for (const [id, slot] of this.slots) {
      const { record } = slot;
      if (record.enabled) { try { await this.activate(slot); } catch (e) {
        this.errors.push(`${id}: ${e.message}`); this.deactivate(slot);
        const alternatives = e.dependency || this.loadIssues.has(id) ? [] : [record.previous, this.builtins.has(id) ? { builtin: true } : null].filter(Boolean);
        let recovered = false;
        for (const alt of alternatives) {
          try {
            const fallback = alt.builtin ? this.builtins.get(id) : (await verifyPackage(alt), compilePackage(alt));
            if (!fallback) continue;
            const fallbackRecord = { ...record, active: alt.builtin ? fallback.bundledPackage || null : alt, previous: null };
            const fallbackSlot = this.makeSlot(fallback, fallbackRecord); this.slots.set(id, fallbackSlot);
            await this.activate(fallbackSlot); await this.store.put(fallbackRecord); recovered = true; break;
          } catch { this.deactivate(this.slots.get(id)); }
        }
        if (!recovered) { this.slots.set(id, slot); slot.error = e.message; }
      } }
    }
  }
  list() { return [...this.slots.values()].map(s => {
    const builtinFallback = this.loadIssues.has(s.record.id) && s.module === this.builtins.get(s.record.id);
    return { ...s.module.manifest, enabled: s.record.enabled, active: s.active, error: s.error, ...(s.maintenance ? { maintenance: s.maintenance } : {}), hasPrevious: !!s.record.previous, source: s.record.active && !builtinFallback ? '插件市场 / 文件' : '内置' };
  }).sort(comparePluginOrder); }
  install(pkg) { return this.serial(async () => { await verifyPackage(pkg); return this.swap(pkg.manifest.id, compilePackage(pkg), pkg, undefined, { restartDependents: true }); }); }
  async swap(id, module, pkg, previousOverride, { restartDependents = false } = {}) {
    const old = this.slots.get(id);
    const saved = old?.record || this.loadIssues.get(id)?.record;
    if (old && !restartDependents) this.assertUnused(id);
    this.slots.set(id, { module });
    try { this.assertGraph(module); } finally { if (old) this.slots.set(id, old); else this.slots.delete(id); }
    const previous = old ? old.record.active || { builtin: true } : saved?.active || saved?.previous || null;
    const record = { id, enabled: saved?.enabled ?? true, uninstalled: false, active: pkg, previous: previousOverride ?? previous, appliedBuiltinMigrations: saved?.appliedBuiltinMigrations || [] };
    const candidate = this.makeSlot(module, record);
    // Download, verification, compilation, graph checks and state construction
    // have already succeeded. Pause only runtime resources, never saved choices.
    const dependents = old && restartDependents ? this.enabledDependents(id) : [];
    for (const slot of [...dependents].reverse()) { slot.maintenance = 'waiting'; this.deactivate(slot); }
    let updateError;
    const recoveryErrors = [];
    try {
      if (old) this.deactivate(old);
      if (restartDependents) candidate.maintenance = 'updating';
      this.slots.set(id, candidate);
      try { this.onChange(); if (record.enabled) await this.activate(candidate); if (this.closed) throw new Error('插件安装已取消'); await this.store.put(record); this.loadIssues.delete(id); }
      catch (error) {
        this.deactivate(candidate); this.slots.delete(id);
        if (old && !this.closed) {
          const restored = this.makeSlot(old.module, old.record); restored.maintenance = candidate.maintenance;
          this.slots.set(id, restored);
          if (old.record.enabled) { try { await this.activate(restored); } catch (e) { restored.error = e.message; } }
        }
        throw error;
      }
    } catch (error) { updateError = error; }
    finally {
      const failed = new Set();
      if (!this.slots.get(id)?.active) failed.add(id);
      for (const slot of dependents) {
        const dependentId = slot.module.manifest.id;
        if (this.closed) break;
        if (this.slots.get(dependentId) !== slot || !slot.record.enabled) continue;
        slot.maintenance = 'restarting';
        try {
          const blocked = slot.module.manifest.dependencies?.find(dep => failed.has(dep));
          if (blocked) throw this.dependencyError('前置插件「' + (this.slots.get(blocked)?.module.manifest.name || blocked) + '」未能恢复运行');
          // A previous activation error must not consume this restart's retry.
          slot.restartUsed = false;
          this.onChange(); await this.activate(slot);
        } catch (error) {
          this.deactivate(slot); failed.add(dependentId);
          slot.error = '更新后重启失败：' + String(error?.stack || error);
          recoveryErrors.push(new Error(slot.module.manifest.name + '：' + (error?.message || String(error)), { cause: error }));
        } finally { delete slot.maintenance; }
      }
      delete candidate.maintenance;
      const current = this.slots.get(id); if (current) delete current.maintenance;
      for (const slot of dependents) delete slot.maintenance;
      if (!this.closed) this.onChange();
    }
    if (recoveryErrors.length && !this.closed) {
      const message = (updateError ? updateError.message + '\n' : module.manifest.name + ' 已更新，但')
        + '依赖插件重启失败：' + recoveryErrors.map(error => error.message).join('；');
      throw new AggregateError(updateError ? [updateError, ...recoveryErrors] : recoveryErrors, message);
    }
    if (updateError) throw updateError;
    if (this.closed) throw new Error('插件安装已取消');
    return module.manifest;
  }
  enable(id, enabled = true) { return this.serial(async () => {
    const slot = this.slots.get(id); if (!slot) throw new Error('插件未安装');
    if (!enabled) this.assertUnused(id);
    if (enabled && !slot.active) {
      slot.restartUsed = false;
      try { await this.activate(slot); }
      catch (e) { slot.error = e?.message || String(e); this.onChange(); throw e; }
    }
    try { await this.store.put({ ...slot.record, enabled }); } catch (e) { if (enabled && !slot.record.enabled) this.deactivate(slot); throw e; }
    slot.record.enabled = enabled; if (!enabled) this.deactivate(slot); this.onChange();
  }); }
  disable(id) { return this.enable(id, false); }
  reload(id) { return this.serial(async () => {
    const slot = this.slots.get(id);
    if (!slot) throw new Error('插件未安装');
    if (this.loadIssues.has(id)) throw new Error('插件包加载异常，请刷新游戏重试。');
    return this.swap(id, slot.module, slot.record.active, slot.record.previous);
  }); }
  rollback(id) { return this.serial(async () => { const slot = this.slots.get(id), previous = slot?.record.previous; if (!previous) throw new Error('没有可回退版本'); const module = previous.builtin ? this.builtins.get(id) : (await verifyPackage(previous), compilePackage(previous)); if (!module) throw new Error('内置版本不存在'); return this.swap(id, module, previous.builtin ? module.bundledPackage || null : previous); }); }
  uninstall(id) { return this.serial(async () => { this.assertUnused(id); await this.store.put({ id, uninstalled: true, enabled: false, active: null, previous: null }); const slot = this.slots.get(id); if (slot) this.deactivate(slot); this.slots.delete(id); this.loadIssues.delete(id); this.onChange(); }); }
  restoreBuiltin(id) { return this.serial(async () => { const module = this.builtins.get(id); if (!module) throw new Error('没有此内置插件'); return this.swap(id, module, module.bundledPackage || null); }); }
  dispose() { this.closed = true; this.unsubscribe(); for (const slot of [...this.slots.values()].reverse()) this.deactivate(slot); }
}
