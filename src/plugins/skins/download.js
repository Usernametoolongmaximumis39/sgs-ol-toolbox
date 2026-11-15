import { findSkinDetail, watchSkinDetail } from '../../shared/skin-detail.js';
import { CONTROL_STYLES } from '../../ui/controls.js';

export function createSkinDownload(ctx) {
  const doc = ctx.document, win = ctx.window;
  const root = doc.createElement('div'); root.dataset.sgsSkinDownload = ''; root.hidden = true;
  const style = doc.createElement('style');
  style.textContent = CONTROL_STYLES + '[data-sgs-skin-download]{position:fixed;z-index:2147483000;filter:drop-shadow(0 3px 8px #0008)}[data-sgs-skin-download] button{appearance:none;box-sizing:border-box;min-height:52px;padding:12px 20px;border:1px solid var(--sgs-border);border-radius:10px;background:var(--sgs-surface);color:var(--sgs-text);font:600 18px/1.4 "Microsoft YaHei",sans-serif;cursor:pointer;white-space:nowrap}[data-sgs-skin-download] button:hover{color:var(--sgs-accent);border-color:var(--sgs-accent)}[data-sgs-skin-download] button:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:3px}[data-sgs-skin-download] button:disabled{opacity:.5;cursor:wait}';
  const button = doc.createElement('button'); button.type = 'button'; button.textContent = '下载皮肤原图'; button.title = '保存当前皮肤的官方原画文件';
  root.append(button); (doc.head || doc.documentElement).append(style); (doc.body || doc.documentElement).append(root);
  ctx.scope.add(() => { root.remove(); style.remove(); });
  ctx.ui.nativeTheme.watch(p => { for (const key of ['text','surface','border','accent']) root.style.setProperty('--sgs-' + key, p[key]); });
  let owner = null, observed = null, busy = false;
  ctx.scope.add(() => observed?.dispose());
  function refresh() {
    try {
      const laya = win.Laya ?? win.laya, next = findSkinDetail(laya?.stage);
      if (next !== owner) { observed?.dispose(); owner = next; observed = owner ? watchSkinDetail(ctx.scope, owner, () => { root.hidden = true; }) : null; }
      const img = owner?.skinImg, canvas = laya?.Render?.canvas || doc.querySelector('#layaCanvas') || doc.querySelector('canvas');
      if (!owner || observed?.closing || !owner.skinData?.skinBaseVo?.SkinBigUrl || !img?.localToGlobal || !canvas || !laya.Point) { root.hidden = true; return; }
      const rect = canvas.getBoundingClientRect(), point = img.localToGlobal(new laya.Point(12,12), true);
      if (!rect.width || !laya.stage.width) { root.hidden = true; return; }
      // Shared visual anchor only; download never reads another plugin's settings.
      const background = doc.querySelector('[data-sgs-backgrounds].bg-skin-action:not([hidden])');
      const offset = background ? background.getBoundingClientRect().width + 10 : 0;
      root.style.left = rect.left + point.x * rect.width / laya.stage.width + offset + 'px';
      root.style.top = rect.top + point.y * rect.height / laya.stage.height + 'px'; root.hidden = false;
    } catch { root.hidden = true; }
  }
  ctx.scope.listen(button, 'click', async () => {
    refresh(); if (root.hidden || busy) return;
    const vo = owner.skinData.skinBaseVo, state = owner.juexingState || 1;
    busy = true; button.disabled = true;
    try {
      const laya = win.Laya ?? win.laya;
      const raw = vo.SkinBigUrl(state);
      const url = new URL(laya.URL?.formatURL ? laya.URL.formatURL(raw) : raw, doc.baseURI);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error('官方原画地址无效');
      const response = await win.fetch(url.href, { signal: ctx.scope.signal, credentials: 'omit' });
      if (!response.ok) throw Error('原画下载失败：HTTP ' + response.status);
      const blob = await response.blob();
      if (ctx.scope.signal.aborted) return;
      if (!blob.size || (blob.type && !blob.type.startsWith('image/'))) throw Error('官方路径未返回图片文件');
      const ext = /\.(png|jpe?g|webp|gif|avif)$/i.exec(url.pathname)?.[1] || ({'image/png':'png','image/webp':'webp','image/jpeg':'jpg'}[blob.type]) || 'jpg';
      const objectURL = win.URL.createObjectURL(blob), a = doc.createElement('a');
      const release = ctx.scope.add(() => win.URL.revokeObjectURL(objectURL));
      a.href = objectURL; a.download = ((vo.skinname || '皮肤') + '_' + vo.skinID + '_' + state).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') + '.' + ext;
      doc.body.append(a); a.click(); a.remove(); ctx.scope.timeout(release, 30000);
      ctx.notify('已发起皮肤原图保存');
    } catch (error) { if (!ctx.scope.signal.aborted) { button.title = String(error?.stack || error); ctx.notify('皮肤原图下载失败：' + error.message); } }
    finally { busy = false; button.disabled = false; }
  });
  ctx.scope.interval(refresh, 100); refresh();
}
