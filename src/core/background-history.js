import { backgroundThumbnail, localBackgroundImage, storedBackgroundThumbnail } from './background-local.js';

const provider = 'backgrounds';
// String keys keep the data readable alongside the version 1 numeric image keys.
// Older clients can still manage the active image without touching these entries.
const entryKey = id => 'history:' + id;
const imageKey = id => 'archive:' + id;

export function backgroundHistoryId(choice) {
  if (choice?.owner !== provider) return null;
  if (choice.skinKey) return `skin:${choice.skinKey}`;
  if (choice.localImageId) return choice.historyId || `local:${choice.localImageId}`;
  return choice.url ? `native:${choice.url}` : null;
}

export class BackgroundHistory {
  pending = Promise.resolve();
  error = '';
  lastUsed = 0;

  constructor(window, changed) {
    this.window = window;
    this.changed = changed;
  }

  remember(choice, image, { seed = false, archived = false } = {}) {
    const id = backgroundHistoryId(choice);
    if (!id) return;
    const { localImageId, historyId, owner, ...spec } = choice;
    const usedAt = this.lastUsed = Math.max(Date.now(), this.lastUsed + 1);
    const win = this.window;
    this.pending = this.pending.then(async () => {
      if (localImageId && !image && !archived) {
        if (await this.read(entryKey(id))) return;
        image = await this.read(localImageId);
        if (!image) throw new Error('此前保存的背景图片已丢失');
      }
      let preview = image?.preview;
      if (image && !preview) preview = await storedBackgroundThumbnail(win, image).catch(() => '');
      await localBackgroundImage(win, 'readwrite', store => {
        const request = store.get(entryKey(id));
        request.addEventListener('success', () => {
          const previous = request.result;
          if (previous && (seed || previous.usedAt > usedAt)) return;
          if (image) store.put(image, imageKey(id));
          store.put({ id, spec, local: Boolean(localImageId), usedAt, preview: preview || previous?.preview || '' }, entryKey(id));
        });
        return request;
      });
    }).then(() => {
      this.error = '';
      this.changed();
    }, error => {
      this.error = `保存背景历史失败：${error?.message || error}`;
      this.changed();
    });
  }

  read(key) {
    return localBackgroundImage(this.window, 'readonly', store => store.get(key));
  }

  async list() {
    await this.pending;
    const keys = this.window.IDBKeyRange?.bound('history:', 'history;', false, true);
    if (!keys) throw new Error('当前环境无法读取背景历史');
    const entries = await localBackgroundImage(this.window, 'readonly', store => store.getAll(keys));
    return entries.sort((a, b) => b.usedAt - a.usedAt).map(({ id, spec, preview }) => ({
      id, name: spec.name, url: spec.url, preview,
      source: spec.officialWallpaper ? '官方背景' : id.startsWith('native:') ? '本服皮肤'
        : id.startsWith('skin:["mobile",') ? '移动版皮肤' : id.startsWith('skin:') ? '一将成名' : '本地图片',
    }));
  }

  async restore(id) {
    await this.pending;
    const entry = await this.read(entryKey(id));
    if (!entry) throw new Error('找不到这条背景记录');
    const image = entry.local ? await this.read(imageKey(id)) : null;
    if (entry.local && !image) throw new Error('这条记录的图片已丢失，请重新选择');
    return { spec: entry.spec, image };
  }

  async cachePreview(id, image) {
    try {
      const preview = backgroundThumbnail(this.window, image);
      if (!preview) return;
      await localBackgroundImage(this.window, 'readwrite', store => {
        const request = store.get(entryKey(id));
        request.addEventListener('success', () => {
          if (request.result && !request.result.preview) store.put({ ...request.result, preview }, entryKey(id));
        });
        return request;
      });
    } catch { /* Official artwork can still be displayed if it cannot be copied to a canvas. */ }
  }
}
