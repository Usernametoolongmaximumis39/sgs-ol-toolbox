import { findSkinDetail, supportsSkinBackgroundAttack, watchSkinDetail } from '../../shared/skin-detail.js';

export const manifest = {
  id: 'backgrounds', name: '自定义背景', version: '0.2.8', apiVersion: 1, contractVersion: 1,
  releaseNotes: "适配皮肤管理中的背景快捷设置。背景图片和动态资源按需联网加载。", minCoreVersion: '0.6.105', dependencies: ['skins'], categories: ['appearance'], priority: 31000,
  icon: { paths: ['M3 4h18v16H3Z', 'M3 16 9 10l4 4 3-3 5 5', 'M16 7h1'] },
  description: '将本地图片或游戏皮肤用作牌局背景，保留天气与武将技能背景',
};
const STYLES = `
[data-sgs-backgrounds]{color:var(--sgs-text);font:12px/1.6 "Microsoft YaHei",sans-serif}
[data-sgs-backgrounds] button{appearance:none;border:1px solid var(--sgs-border);border-radius:7px;background:var(--sgs-surface);color:var(--sgs-text);padding:6px 12px;cursor:pointer;font:inherit}
[data-sgs-backgrounds] button:hover{color:var(--sgs-accent);border-color:var(--sgs-accent)}
[data-sgs-backgrounds] button:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:3px}
[data-sgs-backgrounds] button:disabled{opacity:.45;cursor:default}
[data-sgs-backgrounds] p{margin:5px 0 12px;overflow-wrap:anywhere}
[data-sgs-backgrounds] .bg-note{color:var(--sgs-muted)}
[data-sgs-backgrounds] .bg-error{color:var(--sgs-danger,var(--sgs-text))}
[data-sgs-backgrounds] .bg-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-sgs-backgrounds] .bg-mode{display:flex;align-items:center;gap:6px;margin:10px 0 8px}
[data-sgs-backgrounds] .bg-mode>span{color:var(--sgs-muted);flex:none}
[data-sgs-backgrounds] .bg-attack{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 10px;min-height:30px;color:var(--sgs-muted);font-size:calc(12px + var(--sgs-font-offset,0px));cursor:pointer}
[data-sgs-backgrounds] [hidden]{display:none}
[data-sgs-backgrounds] .bg-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
[data-sgs-backgrounds] .bg-actions button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:32px;padding:5px 8px;white-space:nowrap}
[data-sgs-backgrounds] .bg-actions .bg-picker{color:var(--sgs-accent);border-color:var(--sgs-accent)}
[data-sgs-backgrounds] .bg-local-note{margin:6px 0 0}
[data-sgs-backgrounds] .sgs-segments{flex:1;min-width:0}
[data-sgs-backgrounds] .sgs-segments>button{border:0;border-radius:5px;background:transparent;padding:6px;color:var(--sgs-muted)}
[data-sgs-backgrounds] .sgs-segments>button[aria-pressed=true]{color:var(--sgs-accent);background:linear-gradient(color-mix(in srgb,var(--sgs-accent) 18%,transparent),color-mix(in srgb,var(--sgs-accent) 7%,transparent));box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-accent) 14%,transparent),0 1px 3px #0003}
[data-sgs-backgrounds].bg-skin-action{position:fixed;z-index:2147483000;filter:drop-shadow(0 3px 8px #0008)}
[data-sgs-backgrounds].bg-skin-action button{box-sizing:border-box;min-width:178px;min-height:52px;padding:12px 20px;font-size:18px;font-weight:600;line-height:1.4;white-space:nowrap;border-radius:10px}
`;

export const findSkinDetails = findSkinDetail;

export function canUseSkinBackground(owner, laya) {
  if (!owner || !(owner.is169 || owner.isHor)) return false;
  const vo = owner.skinData?.skinBaseVo;
  if (typeof vo?.SkinBigUrl !== 'function') return false;
  const url = vo.SkinBigUrl(owner.juexingState || 1);
  const image = owner.skinImg;
  // Do not reuse the previous skin's dimensions during a detail-page switch.
  const texture = laya?.loader?.getRes?.(url)
    || (image?.skin === url ? image.texture : null);
  const width = texture?.sourceWidth || texture?.width;
  const height = texture?.sourceHeight || texture?.height;
  return Number.isFinite(width) && Number.isFinite(height) && width > height && height > 0;
}

export function skinBackgroundSpec(owner, animated = true, attackEffects = true) {
  const vo = owner.skinData.skinBaseVo, state = owner.juexingState || 1;
  const result = { name: vo.skinname || `皮肤 ${vo.skinID}`, url: vo.SkinBigUrl(state), animated, attackEffects };
  // Capability belongs to the public skin model, independently of inventory,
  // unlocked dynamic status, trial status, or the current preview mode.
  if (!(vo.canUpdateDynamic?.() || vo.IsManyStateDyskin)) {
    if (typeof vo.canUpdateDynamic === 'function') result.dynamic = null;
    return result;
  }
  if (vo.ResType === 1 && vo.DynamicSkinBigUrl) result.dynamic = { kind: 'video', url: vo.DynamicSkinBigUrl + '.mp4' };
  else if (vo.ResType === 2 && vo.DynamicSkinBigSkeletonUrl) result.dynamic = { kind: 'bone', url: vo.DynamicSkinBigSkeletonUrl, parts: vo.ManyPeopleResourceList || [] };
  else if (vo.ResType === 3 || vo.ResType === 4) {
    const modern = vo.ResType === 3 && Boolean(vo.NewSkinJudge);
    const url = modern ? vo.DynamicSkinBigSkeletonUrlNew?.(state) : vo.DynamicSkinBigSkeletonUrl;
    if (url) {
      result.dynamic = { kind: 'spine', url, modern };
      if (modern) result.dynamic.attack = vo.IsNewSkinSystem !== false && vo.HasGongJi !== false && !vo.IsChuChangOnlyDySkin;
    }
  }
  if (result.dynamic) Object.assign(result.dynamic, { width: owner.skinImg.width, height: owner.skinImg.height });
  return result;
}

export function activate(ctx) {
  ctx.backgrounds.register();
  const doc = ctx.document;
  const animated = () => {
    const current = ctx.backgrounds.current;
    return ctx.settings.get('animated', current?.localImageId ? true : current?.animated !== false) !== false;
  };
  const attackEffects = () => ctx.settings.get('attackEffects', ctx.backgrounds.current?.attackEffects !== false) !== false;
  const element = (tag, text, cls) => { const node = doc.createElement(tag); if (text) node.textContent = text; if (cls) node.className = cls; return node; };
  const style = element('style'); style.textContent = STYLES; (doc.head || doc.documentElement).append(style); ctx.scope.add(() => style.remove());
  const floating = element('div', '', 'bg-skin-action'); floating.dataset.sgsBackgrounds = '';
  const use = element('button', '作为牌局背景'); use.type = 'button'; floating.append(use); floating.hidden = true;
  (doc.body || doc.documentElement).append(floating); ctx.scope.add(() => floating.remove());
  ctx.ui.nativeTheme.watch(p => {
    for (const key of ['text', 'muted', 'accent', 'border', 'surface']) floating.style.setProperty('--sgs-' + key, p[key]);
  });
  let owner = null, observed = null;
  let importing = false, importError = '', updatePanel;
  ctx.scope.add(() => observed?.dispose());
  function refreshButton() {
    try { refreshReadyButton(); }
    catch (error) {
      floating.hidden = true;
      // Skin models and canvas may disappear while the client changes scene.
      // Keep the plugin active; the scoped discovery timer retries next tick.
      floating.title = String(error?.stack || error);
    }
  }
  function refreshReadyButton() {
    const laya = ctx.window.Laya ?? ctx.window.laya;
    const next = findSkinDetails(laya?.stage);
    if (next !== owner) { observed?.dispose(); owner = next; observed = owner ? watchSkinDetail(ctx.scope, owner, () => { floating.hidden = true; }) : null; }
    if (observed?.closing || ctx.backgrounds.skinShortcutEnabled?.() === false) { floating.hidden = true; return; }
    const vo = owner?.skinData?.skinBaseVo, img = owner?.skinImg;
    const canvas = laya?.Render?.canvas || doc.querySelector('#layaCanvas') || doc.querySelector('canvas');
    if (!canUseSkinBackground(owner, laya) || !img?.localToGlobal || !canvas || !laya.Point) { floating.hidden = true; return; }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !laya.stage.width) { floating.hidden = true; return; }
    // Same stage coordinates as the native image, mapped into CSS pixels.
    const point = img.localToGlobal(new laya.Point(12, 12), true);
    floating.style.left = `${rect.left + point.x * rect.width / laya.stage.width}px`;
    floating.style.top = `${rect.top + point.y * rect.height / laya.stage.height}px`;
    floating.hidden = false;
    const selected = ctx.backgrounds.current?.url === vo.SkinBigUrl(owner.juexingState || 1);
    use.textContent = selected ? '已设为牌局背景' : '作为牌局背景';
    const spec = skinBackgroundSpec(owner, animated(), attackEffects());
    use.setAttribute('aria-pressed', String(selected)); use.title = `${vo.skinname || '当前皮肤'} · ${spec.dynamic && spec.animated ? '动态背景' : '静态原画'}`;
    // Refresh capability only for the exact saved skin resource.
    if (selected && spec.dynamic) {
      const saved = ctx.backgrounds.current.dynamic;
      const sameResource = saved?.kind === spec.dynamic.kind && saved.url === spec.dynamic.url.replace(/\/$/, '');
      if (!saved || (sameResource && spec.dynamic.attack !== undefined && saved.attack !== spec.dynamic.attack)) ctx.backgrounds.select(spec);
    }
  }
  ctx.scope.listen(use, 'click', () => {
    refreshButton(); if (floating.hidden) return;
    try {
      ctx.backgrounds.select(skinBackgroundSpec(owner, animated(), attackEffects()));
      importError = ''; updatePanel?.();
      ctx.notify('已保存牌局背景；技能背景保持优先。'); refreshButton();
    } catch (error) { ctx.notify(error.message); }
  });
  ctx.scope.interval(refreshButton, 200); refreshButton();
  ctx.ui.registerPanel({ id: 'main', category: 'appearance', render(container) {
    const root = element('div'); root.dataset.sgsBackgrounds = '';
    const panelStyle = element('style'); panelStyle.textContent = STYLES; root.append(panelStyle);
    const name = element('div', '', 'bg-name'), status = element('p', '', 'bg-note'); status.setAttribute('role', 'status');
    const mode = element('div', '', 'bg-mode');
    const segments = element('div', '', 'sgs-segments'); segments.setAttribute('role', 'group'); segments.setAttribute('aria-label', '背景播放');
    const dynamic = element('button', '动态'), still = element('button', '静态');
    dynamic.type = still.type = 'button'; segments.append(dynamic, still);
    const hint = ctx.ui.helpTip('默认播放皮肤动态，无需拥有皮肤或解锁动态；没有动态时显示原画。仅横版或 16:9 原画可选，技能背景保持优先。', '背景播放说明');
    mode.append(element('span', '背景播放'), hint, segments);
    const attack = ctx.ui.styleSwitch(element('input'));
    attack.type = 'checkbox';
    const attackRow = element('label', '', 'bg-attack');
    attackRow.append(element('span', '攻击特效'), attack);
    const capability = element('p', '', 'bg-note');
    const reset = element('button', '恢复游戏背景'); reset.type = 'button';
    const picker = element('button', '', 'bg-picker'); picker.type = 'button';
    picker.title = '支持 PNG、JPG、WebP 和 BMP 静态图片，最大 20 MB';
    const pickerLabel = element('span', '选择本地图片');
    picker.append(ctx.ui.icon(manifest.icon), pickerLabel);
    const input = element('input'); input.type = 'file'; input.hidden = true;
    input.accept = '.png,.jpg,.jpeg,.webp,.bmp,image/png,image/jpeg,image/webp,image/bmp';
    const actions = element('div', '', 'bg-actions'); actions.append(picker, reset, input);
    const localNote = element('p', '图片仅保存在此设备', 'bg-note bg-local-note');
    const error = element('p', '', 'bg-error'); error.setAttribute('role', 'alert');
    const update = () => {
      const current = ctx.backgrounds.current;
      const local = Boolean(current?.localImageId);
      name.textContent = current?.name || '尚未选择背景'; name.title = name.textContent;
      status.textContent = ctx.backgrounds.status; reset.disabled = !current || importing;
      picker.disabled = importing; pickerLabel.textContent = importing ? '正在读取图片…' : '选择本地图片';
      error.textContent = importError; error.hidden = !importError;
      mode.hidden = capability.hidden = local;
      dynamic.setAttribute('aria-pressed', String(animated())); still.setAttribute('aria-pressed', String(!animated()));
      attackRow.hidden = local || !supportsSkinBackgroundAttack(current?.dynamic);
      attack.disabled = !animated(); attack.checked = attackEffects();
      capability.textContent = !current ? '也可在皮肤详情中选择「作为牌局背景」。' : current.dynamic ? '此皮肤支持动态背景。' : current.dynamic === null ? '此皮肤没有动态，使用静态原画。' : '尚未识别此背景的动态；请在皮肤详情重新选择。';
    };
    const change = value => {
      ctx.settings.set('animated', value);
      if (ctx.backgrounds.current) ctx.backgrounds.select({ ...ctx.backgrounds.current, animated: value });
      update(); refreshButton();
    };
    const chooseDynamic = () => change(true), chooseStill = () => change(false);
    const changeAttack = () => {
      ctx.settings.set('attackEffects', attack.checked);
      ctx.backgrounds.setAttackEffects(attack.checked);
    };
    const click = () => { importError = ''; ctx.backgrounds.select(null); refreshButton(); };
    const openFile = () => input.click();
    const importFile = async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file || importing) return;
      importing = true; importError = ''; update();
      try {
        await ctx.backgrounds.selectLocal(file);
        if (!ctx.scope.closed) refreshButton();
      } catch (failure) {
        importError = failure?.message || String(failure);
      } finally {
        importing = false; updatePanel?.();
      }
    };
    reset.addEventListener('click', click);
    picker.addEventListener('click', openFile); input.addEventListener('change', importFile);
    dynamic.addEventListener('click', chooseDynamic); still.addEventListener('click', chooseStill);
    attack.addEventListener('change', changeAttack);
    updatePanel = update;
    const release = ctx.backgrounds.subscribe(update); update();
    root.append(name, status, mode, attackRow, capability, actions, localNote, error); container.append(root);
    return () => {
      if (updatePanel === update) updatePanel = null;
      release(); reset.removeEventListener('click', click);
      picker.removeEventListener('click', openFile); input.removeEventListener('change', importFile);
      dynamic.removeEventListener('click', chooseDynamic); still.removeEventListener('click', chooseStill);
      attack.removeEventListener('change', changeAttack); root.remove();
    };
  } });
}
export default { manifest, activate };
