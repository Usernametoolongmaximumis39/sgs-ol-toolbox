import { ResourceScope } from '../../core/resources.js';
import { LOCAL_IMAGE_ACCEPT, localImageTransaction, withLocalImage } from '../../shared/local-images.js';
import { installNativeBubbles, openBubbleGallery } from './bubbles-native.js';

const database = 'sgs-toolbox-social-bubbles';
const setting = 'localChatBubbles';

function normalizeImage(win, file) {
  return withLocalImage(win, file, async image => {
    const canvas = win.document.createElement('canvas');
    const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => {
      if (value) resolve(value);
      else reject(new Error('无法生成气泡图片'));
    }, 'image/webp', .92));
    return { name: file.name?.trim().slice(0, 160) || '自定义图片', blob };
  });
}

async function readImage(win, blob) {
  const url = win.URL.createObjectURL(blob);
  try {
    const image = new win.Image();
    image.src = url;
    await image.decode();
    return image;
  } finally { win.URL.revokeObjectURL(url); }
}

export function createChatBubbles(ctx) {
  const { window: win, scope } = ctx;
  const listeners = new Set();
  const account = () => ctx.native.account();
  const enabled = () => ctx.settings.get(setting, true) !== false;
  let session;

  const isCurrent = target => !scope.closed && target === session && target?.id === account().id;
  const active = () => enabled() && session?.id && isCurrent(session) ? session : null;
  const native = installNativeBubbles(ctx, active, enabled, choice => change(state => ({
    ...state.record, choice,
  })));
  const notify = () => { for (const listener of listeners) listener(); };
  const errorMessage = error => String(error?.message || error);

  async function load(state) {
    try {
      const record = await localImageTransaction(win, database, 'readonly', store => store.get(state.id));
      if (!isCurrent(state)) return;
      state.record = record;
      state.ready = true;
      if (record?.choice?.custom) {
        const image = await readImage(win, record.custom?.blob);
        if (isCurrent(state)) state.image = image;
      }
    } catch (error) {
      if (isCurrent(state)) state.error = errorMessage(error);
    } finally {
      if (isCurrent(state)) {
        state.busy = false;
        native.refreshViews();
        notify();
      }
    }
  }

  function tick() {
    const { id, nickname } = account();
    if (id !== session?.id) {
      session = { id, nickname, ready: false, busy: Boolean(id) };
      native.refresh();
      if (id) void load(session);
      notify();
    } else if (session) session.nickname = nickname;
    native.tick();
  }

  async function change(makeRecord) {
    tick();
    const state = active();
    if (!state?.ready || state.busy) return;
    state.busy = true;
    native.refreshViews();
    notify();
    try {
      const record = await makeRecord(state);
      if (!isCurrent(state) || !enabled()) return;
      const image = record.choice?.custom
        ? state.record?.custom === record.custom && state.image || await readImage(win, record.custom.blob)
        : null;
      if (!isCurrent(state) || !enabled()) return;
      await localImageTransaction(win, database, 'readwrite', store => {
        if (!isCurrent(state) || !enabled()) throw new Error('气泡设置已切换');
        return store.put(record, state.id);
      });
      if (!isCurrent(state)) return;
      Object.assign(state, { record, image, error: '' });
      native.refresh();
    } catch (error) {
      if (isCurrent(state)) {
        state.error = errorMessage(error);
        ctx.notify(state.error);
      }
    } finally {
      if (isCurrent(state)) {
        state.busy = false;
        native.refreshViews();
        notify();
      }
    }
  }

  scope.interval(tick, 500);
  tick();
  return {
    state: () => ({ ...session, enabled: enabled() }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    toggle(value) {
      try {
        ctx.settings.set(setting, value);
        native.refresh();
      } catch (error) { ctx.notify(errorMessage(error)); }
      notify();
    },
    open() {
      try {
        if (!account().id) throw new Error('登录后可打开对话气泡。');
        openBubbleGallery(ctx);
      } catch (error) { ctx.notify(errorMessage(error)); }
    },
    importImage(file) {
      return change(async () => ({
        choice: { custom: true },
        custom: await normalizeImage(win, file),
      }));
    },
    useImage() {
      return change(state => ({ ...state.record, choice: { custom: true } }));
    },
    restore() {
      return change(state => ({ ...state.record, choice: null }));
    },
  };
}

const styles = `
.sgs-chat-bubbles{min-width:0;color:var(--sgs-text);font:calc(12px + var(--sgs-font-offset,0px))/1.55 var(--sgs-font,sans-serif)}
.sgs-chat-bubbles [hidden]{display:none}
.sgs-chat-bubbles label{display:flex;justify-content:space-between;align-items:center;min-height:32px;gap:8px;white-space:nowrap;cursor:pointer}
.sgs-chat-bubbles label input{flex:none}
.sgs-chat-bubbles p{color:var(--sgs-muted);margin:5px 0 9px;overflow-wrap:anywhere}
.sgs-chat-bubbles .bubble-actions{display:flex;gap:5px;flex-wrap:wrap}
.sgs-chat-bubbles button{appearance:none;min-height:32px;padding:4px 7px;border:1px solid var(--sgs-border);
  border-radius:6px;background:linear-gradient(var(--sgs-raised),var(--sgs-surface));color:var(--sgs-text);font:inherit;white-space:nowrap;cursor:pointer}
.sgs-chat-bubbles button:first-child{color:var(--sgs-accent)}
.sgs-chat-bubbles button:not(:disabled):hover{border-color:var(--sgs-accent);color:var(--sgs-accent)}
.sgs-chat-bubbles button:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:1px}
.sgs-chat-bubbles button:disabled{opacity:.48;cursor:default}
.sgs-chat-bubbles img{display:block;max-width:100%;max-height:64px;margin:6px auto;object-fit:contain;border-radius:5px}
.sgs-chat-bubbles .bubble-error{color:var(--sgs-danger);margin-bottom:0}
`;

export function renderBubblePanel(ctx, container, runtime) {
  const { document: doc, window: win } = ctx;
  const scope = new ResourceScope();
  const el = (tag, text) => {
    const node = doc.createElement(tag);
    if (text) node.textContent = text;
    return node;
  };
  const root = el('div');
  root.className = 'sgs-chat-bubbles';
  const label = el('label', '本地聊天泡泡');
  const toggle = ctx.ui.styleSwitch(el('input'));
  toggle.type = 'checkbox';
  label.append(toggle);
  const note = el('p', '在游戏「个性化 → 对话气泡」选款式。图片仅保存在本机，牌局里只有自己看得到。');
  const status = el('p');
  status.setAttribute('role', 'status');
  const error = el('p');
  error.className = 'bubble-error';
  error.setAttribute('role', 'alert');
  const actions = el('div');
  actions.className = 'bubble-actions';
  const button = (text, click) => {
    const node = el('button', text);
    node.type = 'button';
    scope.listen(node, 'click', click);
    actions.append(node);
    return node;
  };
  const file = el('input');
  file.type = 'file';
  file.accept = LOCAL_IMAGE_ACCEPT;
  file.hidden = true;
  const open = button('打开个性化', () => runtime.open());
  const upload = button('导入图片', () => file.click());
  upload.title = 'PNG、JPG、WebP 或 BMP 静态图片，最大 20 MB。';
  const use = button('用自定义', () => { void runtime.useImage(); });
  const restore = button('恢复游戏气泡', () => { void runtime.restore(); });
  const preview = el('img');
  preview.alt = '自定义气泡';
  let previewBlob, previewUrl;

  function render() {
    const { id, enabled, ready, busy, record, image, error: issue } = runtime.state();
    toggle.checked = enabled;
    open.disabled = !id;
    upload.disabled = !id || !enabled || !ready || busy;
    use.hidden = !record?.custom || !!record.choice?.custom;
    use.disabled = restore.disabled = upload.disabled;
    restore.hidden = !record?.choice;
    error.hidden = !issue;
    error.textContent = issue || '';
    const choice = record?.choice;
    status.textContent = !id ? '登录后可设置气泡' : busy ? '正在读取或保存气泡…'
      : !ready ? '读取气泡设置失败'
      : !enabled || !choice ? '当前使用游戏气泡'
      : choice.custom && issue && !image ? '自定义气泡未加载'
      : '当前使用 · ' + (choice.custom ? record.custom.name : choice.name);
    const blob = record?.custom?.blob;
    if (blob === previewBlob) return;
    if (previewUrl) win.URL.revokeObjectURL(previewUrl);
    previewUrl = blob && win.URL.createObjectURL(blob);
    previewBlob = blob;
    if (previewUrl) preview.src = previewUrl;
    else preview.removeAttribute('src');
    preview.hidden = !previewUrl;
  }
  preview.hidden = true;
  scope.listen(toggle, 'change', () => runtime.toggle(toggle.checked));
  scope.listen(file, 'change', () => {
    const selected = file.files?.[0];
    file.value = '';
    if (selected) void runtime.importImage(selected);
  });
  scope.add(runtime.subscribe(render));
  scope.add(() => { if (previewUrl) win.URL.revokeObjectURL(previewUrl); });
  root.append(el('style', styles), label, note, actions, preview, status, error, file);
  container.append(root);
  render();
  return ctx.scope.add(() => { scope.dispose(); root.remove(); });
}
