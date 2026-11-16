import { findSkinDetail, watchSkinDetail } from '../../shared/skin-detail.js';

export const manifest = {
  id: 'backgrounds', name: '自定义背景', version: '0.2.5', apiVersion: 1, contractVersion: 1,
  releaseNotes: "精简背景设置说明，统一开关与帮助提示的外观，保留已有背景和动态播放选择。", minCoreVersion: '0.6.37', dependencies: ['skins'], categories: ['appearance'], priority: 31000,
  icon: { paths: ['M3 4h18v16H3Z', 'M3 16 9 10l4 4 3-3 5 5', 'M16 7h1'] },
  description: '将皮肤原画或动态用作牌局背景，保留天气与武将技能背景',
};
const STYLES = `
[data-sgs-backgrounds]{color:var(--sgs-text);font:12px/1.6 "Microsoft YaHei",sans-serif}
[data-sgs-backgrounds] button{appearance:none;border:1px solid var(--sgs-border);border-radius:7px;background:var(--sgs-surface);color:var(--sgs-text);padding:6px 12px;cursor:pointer;font:inherit}
[data-sgs-backgrounds] button:hover{color:var(--sgs-accent);border-color:var(--sgs-accent)}
[data-sgs-backgrounds] button:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:3px}
[data-sgs-backgrounds] button:disabled{opacity:.45;cursor:default}
[data-sgs-backgrounds] p{margin:5px 0 12px;overflow-wrap:anywhere}
[data-sgs-backgrounds] .bg-note{color:var(--sgs-muted)}
[data-sgs-backgrounds] .bg-name{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
[data-sgs-backgrounds] .bg-mode{display:flex;align-items:center;gap:12px;margin:10px 0 8px}
[data-sgs-backgrounds] .bg-mode>span{color:var(--sgs-muted);flex:none}
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

export function skinBackgroundSpec(owner, animated = true) {
  const vo = owner.skinData.skinBaseVo, state = owner.juexingState || 1;
  const result = { name: vo.skinname || `皮肤 ${vo.skinID}`, url: vo.SkinBigUrl(state), animated };
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
    if (url) result.dynamic = { kind: 'spine', url, modern };
  }
  if (result.dynamic) Object.assign(result.dynamic, { width: owner.skinImg.width, height: owner.skinImg.height });
  return result;
}

export function activate(ctx) {
  ctx.backgrounds.register();
  const doc = ctx.document;
  const animated = () => ctx.settings.get('animated', ctx.backgrounds.current?.animated !== false) !== false;
  const element = (tag, text, cls) => { const node = doc.createElement(tag); if (text) node.textContent = text; if (cls) node.className = cls; return node; };
  const style = element('style'); style.textContent = STYLES; (doc.head || doc.documentElement).append(style); ctx.scope.add(() => style.remove());
  const floating = element('div', '', 'bg-skin-action'); floating.dataset.sgsBackgrounds = '';
  const use = element('button', '作为牌局背景'); use.type = 'button'; floating.append(use); floating.hidden = true;
  (doc.body || doc.documentElement).append(floating); ctx.scope.add(() => floating.remove());
  ctx.ui.nativeTheme.watch(p => {
    for (const key of ['text', 'muted', 'accent', 'border', 'surface']) floating.style.setProperty('--sgs-' + key, p[key]);
  });
  let owner = null, observed = null;
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
    const laya = ctx.window.Laya;
    const next = findSkinDetails(laya?.stage);
    if (next !== owner) { observed?.dispose(); owner = next; observed = owner ? watchSkinDetail(ctx.scope, owner, () => { floating.hidden = true; }) : null; }
    if (observed?.closing) { floating.hidden = true; return; }
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
    const spec = skinBackgroundSpec(owner, animated());
    use.setAttribute('aria-pressed', String(selected)); use.title = `${vo.skinname || '当前皮肤'} · ${spec.dynamic && spec.animated ? '动态背景' : '静态原画'}`;
    // Enrich a legacy static choice when its exact detail is visited, keeping
    // the user's explicitly saved playback preference.
    if (selected && !ctx.backgrounds.current.dynamic && spec.dynamic) ctx.backgrounds.select(spec);
  }
  ctx.scope.listen(use, 'click', () => {
    refreshButton(); if (floating.hidden) return;
    try {
      const vo = owner.skinData.skinBaseVo;
      ctx.backgrounds.select(skinBackgroundSpec(owner, animated()));
      ctx.notify('已保存牌局背景；技能背景保持优先。'); refreshButton();
    } catch (error) { ctx.notify(error.message); }
  });
  ctx.scope.interval(refreshButton, 200); refreshButton();
  ctx.ui.registerPanel({ id: 'main', category: 'appearance', render(container) {
    const root = element('div'); root.dataset.sgsBackgrounds = '';
    const panelStyle = element('style'); panelStyle.textContent = STYLES; root.append(panelStyle);
    const name = element('div', '', 'bg-name'), status = element('p', '', 'bg-note'); status.setAttribute('role', 'status');
    const mode = element('div', '', 'bg-mode'); mode.append(element('span', '背景播放'));
    const segments = element('div', '', 'sgs-segments'); segments.setAttribute('role', 'group'); segments.setAttribute('aria-label', '背景播放');
    const dynamic = element('button', '动态'), still = element('button', '静态');
    dynamic.type = still.type = 'button'; segments.append(dynamic, still); mode.append(segments);
    const hint = ctx.ui.helpTip('默认播放皮肤动态，无需拥有皮肤或解锁动态；没有动态时显示原画。仅横版或 16:9 原画可选，技能背景保持优先。');
    const capability = element('p', '', 'bg-note');
    const reset = element('button', '恢复游戏背景'); reset.type = 'button';
    const update = () => {
      const current = ctx.backgrounds.current;
      name.textContent = current?.name || '尚未选择背景'; name.title = name.textContent;
      status.textContent = ctx.backgrounds.status; reset.disabled = !current;
      dynamic.setAttribute('aria-pressed', String(animated())); still.setAttribute('aria-pressed', String(!animated()));
      capability.textContent = !current ? '在游戏皮肤详情中选择「作为牌局背景」。' : current.dynamic ? '此皮肤支持动态背景。' : current.dynamic === null ? '此皮肤没有动态，使用静态原画。' : '尚未识别此背景的动态；请在皮肤详情重新选择。';
    };
    const change = value => {
      ctx.settings.set('animated', value);
      if (ctx.backgrounds.current) ctx.backgrounds.select({ ...ctx.backgrounds.current, animated: value });
      update(); refreshButton();
    };
    const chooseDynamic = () => change(true), chooseStill = () => change(false);
    const click = () => { ctx.backgrounds.select(null); refreshButton(); };
    reset.addEventListener('click', click);
    dynamic.addEventListener('click', chooseDynamic); still.addEventListener('click', chooseStill);
    const release = ctx.backgrounds.subscribe(update); update(); root.append(name, status, mode, capability, hint, reset); container.append(root);
    return () => { release(); reset.removeEventListener('click', click); dynamic.removeEventListener('click', chooseDynamic); still.removeEventListener('click', chooseStill); root.remove(); };
  } });
}
export default { manifest, activate };
