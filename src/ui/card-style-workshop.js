import { helpTip } from './controls.js';
import { createIcon } from './icons.js';
import { mountCardFaceCatalog } from './card-face-catalog.js';
import { drawCardStyle, LOCAL_FACE_STYLE, LOCAL_FACE_BACKGROUND_STYLE } from '../core/card-styles.js';
import { LOCAL_IMAGE_ACCEPT } from '../core/local-images.js';

const LOCAL_BACK_HELP = '支持 JPG、PNG、WebP、BMP 静态图片，最大 20 MB。建议选主体居中的竖图，系统会自动居中裁剪，图片仅保存在本机。';

function mountLocalFaces(section, doc, cardStyles) {
  section.className = 'custom-card-faces';
  const modes = doc.createElement('div'); modes.className = 'sgs-segments';
  modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', '自定义卡面模式');
  const loadCatalog = () => {
    if (cardStyles.selection.face === LOCAL_FACE_STYLE.id) cardStyles.loadLocalFaceCatalog();
  };
  for (const [id, label] of [[LOCAL_FACE_BACKGROUND_STYLE.id, '统一底图'], [LOCAL_FACE_STYLE.id, '逐牌换图']]) {
    const button = doc.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.faceMode = id;
    button.onclick = () => { message = ''; cardStyles.selectSide('face', id); loadCatalog(); };
    modes.append(button);
  }
  const guidance = doc.createElement('p'); guidance.className = 'muted';
  const search = doc.createElement('input');
  search.type = 'search'; search.className = 'sgs-input'; search.placeholder = '搜索牌名';
  search.setAttribute('aria-label', '搜索牌名');
  const choices = doc.createElement('select'); choices.className = 'sgs-select';
  choices.setAttribute('aria-label', '选择牌名');
  const upload = doc.createElement('button'); upload.type = 'button';
  const picker = doc.createElement('input'); picker.type = 'file'; picker.accept = LOCAL_IMAGE_ACCEPT; picker.hidden = true;
  const preview = doc.createElement('div'); preview.className = 'custom-card-face-preview'; preview.hidden = true;
  const image = doc.createElement('img'); image.alt = '';
  const filename = doc.createElement('span'); filename.className = 'custom-card-face-name';
  const remove = doc.createElement('button'); remove.type = 'button'; remove.title = '删除这张卡图';
  remove.setAttribute('aria-label', remove.title); remove.append(createIcon(doc, 'trash'));
  preview.append(image, filename, remove);
  const feedback = doc.createElement('p'); feedback.className = 'muted'; feedback.setAttribute('role', 'status'); feedback.hidden = true;
  const retry = doc.createElement('button'); retry.type = 'button'; retry.textContent = '重试读取牌表'; retry.hidden = true;
  retry.onclick = () => { message = ''; failed = false; loadCatalog(); };
  const fields = doc.createElement('div'); fields.className = 'custom-card-face-fields'; fields.append(search, choices, upload);
  section.append(modes, guidance, fields, picker, preview, feedback, retry);

  let active = true, busy = false, message = '', failed = false, saved = [], catalog;
  let card = '', background = false;
  function updateChoices() {
    const records = new Map((catalog || []).map(option => [option.res, option.label]));
    for (const row of saved) if (!records.has(row.card)) records.set(row.card, row.label);
    const counts = new Map();
    for (const label of records.values()) counts.set(label, (counts.get(label) || 0) + 1);
    const query = search.value.trim().toLowerCase();
    const matches = [...records].filter(([res, label]) => label.toLowerCase().includes(query) || res.toLowerCase().includes(query));
    choices.replaceChildren();
    const placeholder = doc.createElement('option'); placeholder.value = '';
    placeholder.textContent = matches.length ? '选择牌名' : '没有匹配的牌';
    choices.append(placeholder);
    const savedGroup = doc.createElement('optgroup'); savedGroup.label = '已换图';
    const otherGroup = doc.createElement('optgroup'); otherGroup.label = '可换图';
    const savedNames = new Set(saved.map(row => row.card));
    for (const [res, label] of matches) {
      const option = doc.createElement('option'); option.value = res;
      option.textContent = counts.get(label) > 1 ? `${label}（${res}）` : label;
      (savedNames.has(res) ? savedGroup : otherGroup).append(option);
    }
    for (const group of [savedGroup, otherGroup]) if (group.childElementCount) choices.append(group);
    choices.value = matches.some(([res]) => res === card) ? card : '';
    card = choices.value;
  }
  function render() {
    const face = cardStyles.selection.face;
    background = face === LOCAL_FACE_BACKGROUND_STYLE.id;
    section.hidden = !background && face !== LOCAL_FACE_STYLE.id;
    if (section.hidden) return;
    for (const button of modes.children) {
      button.disabled = busy;
      button.setAttribute('aria-pressed', String(button.dataset.faceMode === face));
    }
    if (!background) {
      const rows = cardStyles.listLocalFaces();
      if (catalog !== cardStyles.localFaceCatalog || saved.length !== rows.length || rows.some((row, i) => row !== saved[i])) {
        saved = rows; catalog = cardStyles.localFaceCatalog;
        updateChoices();
      }
    }
    search.hidden = choices.hidden = background;
    fields.classList.toggle('is-background', background);
    guidance.textContent = background
      ? '一张图换所有适用卡面的底纹。牌图、牌名、花色和点数照常显示。'
      : '选带牌名的完整卡图。图片会居中裁剪，仅保存在本机。';
    const row = background ? cardStyles.localFaceBackground : saved.find(item => item.card === card);
    const noCards = !background && !catalog?.length && !saved.length;
    if (noCards) choices.options[0].textContent = cardStyles.localFaceCatalogPending ? '正在读取牌表…' : '未读取到牌表';
    search.disabled = choices.disabled = busy || noCards;
    upload.disabled = busy || (!background && !card);
    upload.textContent = row ? '更换图片' : '选择图片';
    remove.disabled = busy;
    remove.title = background ? '删除底图' : '删除这张卡图';
    remove.setAttribute('aria-label', remove.title);
    preview.hidden = !row;
    if (row) {
      if (image.getAttribute('src') !== row.url) image.src = row.url;
      filename.textContent = filename.title = row.name;
    } else image.removeAttribute('src');
    const catalogError = !background && cardStyles.localFaceCatalogError;
    retry.hidden = !catalogError;
    retry.disabled = busy;
    const error = catalogError || cardStyles.localFaceError;
    feedback.textContent = message || error || '';
    feedback.hidden = !feedback.textContent;
    feedback.classList.toggle('custom-card-face-error', failed || Boolean(!message && error));
  }
  async function edit(pending, done, failure, operation) {
    if (busy || (!background && !card)) return;
    busy = true; message = pending; failed = false; render();
    try { await operation(); message = done; }
    catch (error) { message = `${failure}：${error.message}`; failed = true; }
    finally {
      busy = false;
      if (active) {
        render();
        if (!section.hidden && !section.getRootNode().activeElement) upload.focus();
      }
    }
  }
  search.oninput = () => { message = ''; updateChoices(); render(); };
  choices.onchange = () => { card = choices.value; message = ''; render(); };
  upload.onclick = () => picker.click();
  picker.onchange = () => {
    const file = picker.files?.[0]; picker.value = '';
    if (!file) return;
    const importImage = background ? () => cardStyles.importLocalFaceBackground(file) : () => cardStyles.importLocalFace(card, file);
    void edit('正在处理图片…', background ? '已保存底图' : '已保存卡图', '导入失败', importImage);
  };
  remove.onclick = () => {
    const deleteImage = background ? () => cardStyles.deleteLocalFaceBackground() : () => cardStyles.deleteLocalFace(card);
    void edit('正在删除…', background ? '已恢复游戏底图' : '已恢复这张牌的游戏卡面', '删除失败', deleteImage);
  };
  render();
  const off = cardStyles.subscribe(render);
  return { loadCatalog, dispose() { active = false; off(); } };
}

function mountLocalBacks(container, doc, cardStyles) {
  const section = doc.createElement('section'); section.className = 'custom-card-backs';
  const heading = doc.createElement('div'); heading.className = 'custom-card-backs-heading';
  const title = doc.createElement('h4'); title.textContent = '自定义卡背';
  const upload = doc.createElement('button'); upload.type = 'button'; upload.textContent = '选择图片';
  const help = doc.createElement('p'); help.className = 'muted'; help.textContent = LOCAL_BACK_HELP;
  help.id = 'core-custom-card-back-help'; upload.setAttribute('aria-describedby', help.id);
  const picker = doc.createElement('input'); picker.type = 'file'; picker.accept = LOCAL_IMAGE_ACCEPT; picker.hidden = true;
  const list = doc.createElement('fieldset'); list.className = 'custom-card-back-list';
  list.setAttribute('aria-label', '已保存的卡背');
  const feedback = doc.createElement('p'); feedback.className = 'muted'; feedback.setAttribute('role', 'status'); feedback.hidden = true;
  heading.append(title, upload); section.append(heading, help, picker, list, feedback); container.append(section);

  let active = true, busy = false, error = '', rows = [], selected;
  const showFeedback = (message, failed = false) => {
    feedback.textContent = message;
    feedback.hidden = !message;
    feedback.classList.toggle('custom-card-back-error', failed);
  };
  const render = () => {
    if (!busy && (error || cardStyles.localBackError)) showFeedback(error || cardStyles.localBackError, true);
    upload.disabled = busy;
    const saved = cardStyles.listLocalBacks();
    const current = cardStyles.selection.back;
    if (current === selected && saved.length === rows.length && saved.every((item, index) => item === rows[index])) return;
    rows = saved; selected = current;
    list.replaceChildren();
    for (const style of rows) {
      const row = doc.createElement('div'); row.className = 'custom-card-back-row';
      const select = doc.createElement('button'); select.type = 'button'; select.className = 'custom-card-back-option';
      const isSelected = current === style.id;
      select.setAttribute('aria-pressed', String(isSelected)); select.title = style.name;
      const preview = cardStyles.preview(style, true); preview.setAttribute('aria-hidden', 'true');
      const label = doc.createElement('span'); label.className = 'custom-card-back-name'; label.textContent = style.name;
      select.append(preview, label);
      if (isSelected) {
        const check = createIcon(doc, 'check'); check.classList.add('custom-card-back-selected'); select.append(check);
      }
      select.onclick = () => {
        if (busy) return;
        error = '';
        showFeedback('');
        try { cardStyles.selectSide('back', style.id); }
        catch (cause) { error = '选用失败：' + cause.message; showFeedback(error, true); }
        list.children[rows.indexOf(style)]?.firstElementChild?.focus();
      };
      const remove = doc.createElement('button'); remove.type = 'button'; remove.className = 'custom-card-back-remove';
      remove.title = '删除 ' + style.name; remove.setAttribute('aria-label', remove.title);
      remove.append(createIcon(doc, 'trash'));
      remove.onclick = () => run('正在删除…', '已删除卡背', '删除失败', () => cardStyles.deleteLocalBack(style.id));
      row.append(select, remove); list.append(row);
    }
  };
  async function run(pending, done, failure, operation) {
    if (busy) return;
    busy = true; error = '';
    showFeedback(pending);
    upload.disabled = true;
    list.disabled = true;
    try {
      await operation();
      if (active) showFeedback(done);
    } catch (cause) {
      error = failure + '：' + cause.message;
      if (active) showFeedback(error, true);
    } finally {
      busy = false;
      if (active) {
        list.disabled = false;
        render();
        if (!section.getRootNode().activeElement || section.getRootNode().activeElement === doc.body) upload.focus();
      }
    }
  }
  upload.onclick = () => picker.click();
  picker.onchange = () => {
    const file = picker.files?.[0]; picker.value = '';
    if (file) void run('正在处理图片…', '已保存并选用卡背', '导入失败', () => cardStyles.importLocalBack(file));
  };
  render();
  const off = cardStyles.subscribe(render);
  return () => { active = false; off(); };
}

export function mountCardStyleWorkshop(container, { document: doc, cardStyles, settings, bindFold }) {
  const details = doc.createElement('section'); details.className = 'card-style-workshop plugin-group appearance-section';
  const heading = doc.createElement('h3'); heading.className = 'plugin-heading';
  const toggle = doc.createElement('button'); toggle.type = 'button'; toggle.className = 'plugin-toggle';
  const title = doc.createElement('span'); title.className = 'plugin-title'; title.textContent = '卡牌外观';
  toggle.append(createIcon(doc, 'cards'), title, createIcon(doc, 'chevron', 'plugin-chevron'));
  const body = doc.createElement('div'); body.className = 'plugin-body'; body.id = 'core-card-style-workshop';
  toggle.setAttribute('aria-controls', body.id);
  const apply = expanded => {
    body.hidden = !expanded; toggle.setAttribute('aria-expanded', String(expanded));
    toggle.title = (expanded ? '收起' : '展开') + '卡牌外观'; toggle.setAttribute('aria-label', toggle.title);
  };
  heading.append(toggle); details.append(heading, body); container.append(details);
  const options = doc.createElement('div'); body.append(options);
  const faceOptions = doc.createElement('div'); body.append(faceOptions);
  const catalog = cardStyles?.previewCardAtlas ? mountCardFaceCatalog(body, doc, cardStyles) : null;
  const faceEditor = doc.createElement('section'); body.append(faceEditor);
  const localFaces = cardStyles?.listLocalFaces ? mountLocalFaces(faceEditor, doc, cardStyles) : null;
  if (!localFaces) faceEditor.hidden = true;
  const onChange = expanded => expanded ? localFaces?.loadCatalog() : catalog?.close();
  const defaultExpanded = settings.get('cardStyleExpanded', false);
  if (bindFold) bindFold(':card-style-workshop', toggle, body, '卡牌外观', !defaultExpanded, { onChange });
  else {
    apply(defaultExpanded);
    toggle.onclick = () => {
      const expanded = body.hidden;
      settings.set('cardStyleExpanded', expanded);
      apply(expanded); onChange(expanded);
    };
  }
  if (!body.hidden) localFaces?.loadCatalog();
  const backOptions = doc.createElement('div'); body.append(backOptions);
  const unmountLocal = cardStyles?.listLocalBacks ? mountLocalBacks(body, doc, cardStyles) : null;
  const status = doc.createElement('p'); status.className = 'muted'; status.style.overflowWrap = 'anywhere'; status.setAttribute('role','status');
  body.append(status);
  const render = () => {
    options.replaceChildren();
    const scopeLabel = doc.createElement('p'); scopeLabel.textContent = '应用范围'; scopeLabel.style.cssText = 'display:flex;align-items:center;gap:5px';
    scopeLabel.append(helpTip(doc, '卡面与卡背独立选择。完整卡面按牌名匹配，缺失卡图保留游戏原生显示；花色点数沿用游戏。')); options.append(scopeLabel);
    const scopes = doc.createElement('div'); scopes.className = 'sgs-segments'; options.append(scopes);
    for (const [value, name] of [['self','仅自己的手牌'],['all','所有人']]) {
      const button = doc.createElement('button'); button.type = 'button'; button.textContent = name;
      button.setAttribute('aria-pressed', String(cardStyles?.selection?.scope === value || (!cardStyles?.selection && value === 'all')));
      button.onclick = () => cardStyles?.selectScope(value); scopes.append(button);
    }
    const help = doc.createElement('p'); help.className = 'muted'; help.textContent = '仅自己：自己的手牌及其使用、打出、被顺走时沿用所选外观；他人的牌保持游戏外观。'; options.append(help);
    for (const side of ['face','back']) {
    const options = side === 'face' ? faceOptions : backOptions;
    const active = options.getRootNode().activeElement;
    const focused = options.contains(active) ? active.dataset.cardStyle : undefined;
    options.replaceChildren();
    const label = doc.createElement('p'); label.textContent = side === 'face' ? '卡面' : '卡背'; options.append(label);
    const choices = doc.createElement('div'); choices.className = 'card-style-choices'; options.append(choices);
    const selectedId = cardStyles?.selection?.[side] ?? cardStyles?.current;
    const selectedStyle = cardStyles?.styleFor?.(side) || cardStyles?.list().find(item => item.id === selectedId);
    const option = (id,name,style) => {
      const customActive = style?.localFace && selectedStyle?.localFaceBackground;
      const pressed = customActive || (selectedStyle?.id || '') === id;
      const target = style?.localFace && !pressed ? LOCAL_FACE_BACKGROUND_STYLE.id : customActive ? selectedId : id;
      const b = doc.createElement('button'); b.type = 'button'; b.dataset.cardStyle = id; b.dataset.cardSide = side; b.setAttribute('aria-pressed',String(pressed));
      if (style && !style.localFace) { const previews = doc.createElement('span'); previews.className = 'card-style-preview';
        for (const back of [side === 'back']) {
          const canvas = cardStyles?.preview ? cardStyles.preview(style, back) : !style.native ? drawCardStyle(doc,back ? style.back : style.face,back) : null;
          if (canvas) { canvas.setAttribute('aria-hidden','true'); previews.append(canvas); }
          else { const placeholder = doc.createElement('span'); placeholder.className = 'muted'; placeholder.textContent = style.atlas ? '选用后加载预览' : back ? '原生卡背' : '原生卡面'; previews.append(placeholder); }
        } b.append(previews); }
      const text = doc.createElement('span'); text.textContent = side === 'back' ? style?.backName || name : name; b.append(text); b.onclick = () => cardStyles?.selectSide(side, target); choices.append(b);
      if (focused === id) b.focus({ preventScroll: true });
    };
    option('','跟随游戏');
    if (side === 'face' && localFaces) option(LOCAL_FACE_STYLE.id, LOCAL_FACE_STYLE.name, LOCAL_FACE_STYLE);
    for (const style of cardStyles?.list() || []) if (side !== 'back' || !style.atlas || style.atlas.backImage) option(style.id,style.name,style);
    if (side === 'face') {
      const selected = cardStyles?.list().find(style => style.id === cardStyles.selection?.face);
      if (selected?.atlas) {
        const source = doc.createElement('p'); source.className = 'muted'; source.textContent = selected.atlas.source; options.append(source);
        const link = doc.createElement('a'); link.href = selected.atlas.index.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = '查看图集来源'; options.append(link);
        const note = doc.createElement('p'); note.className = 'muted'; note.textContent = '首次选择联网加载整套资源。国战、限时及活动牌仅精确匹配同名卡图；缺失、特殊渲染或下载失败均回退游戏外观。'; options.append(note);
        if (cardStyles.status?.startsWith('完整卡面加载失败')) { const retry = doc.createElement('button'); retry.type = 'button'; retry.textContent = '重新加载卡面'; retry.onclick = () => cardStyles.retry(); options.append(retry); }
      }
    }
    }
    status.textContent = cardStyles?.status || '卡牌接口等待启动';
    status.style.color = /失败|未应用/.test(status.textContent) ? 'var(--sgs-danger)' : '';
  };
  render(); const off = cardStyles?.subscribe(render);
  return () => { off?.(); catalog?.dispose(); localFaces?.dispose(); unmountLocal?.(); details.remove(); };
}
