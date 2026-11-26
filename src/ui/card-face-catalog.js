import { createIcon } from './icons.js';

export function mountCardFaceCatalog(container, doc, cardStyles) {
  const option = (text, value) => {
    const node = doc.createElement('option');
    node.textContent = text;
    node.value = value;
    return node;
  };
  const details = doc.createElement('details');
  details.className = 'card-face-catalog sgs-fold';
  const title = doc.createElement('summary');
  title.textContent = '卡牌图鉴';
  const suites = doc.createElement('select');
  suites.className = 'sgs-select';
  suites.setAttribute('aria-label', '预览卡面套装');
  const search = doc.createElement('input');
  search.type = 'search';
  search.className = 'sgs-input';
  search.placeholder = '搜索牌名';
  search.setAttribute('aria-label', '搜索图鉴牌名');
  const choices = doc.createElement('select');
  choices.className = 'sgs-select';
  choices.setAttribute('aria-label', '预览卡牌');
  const preview = doc.createElement('div');
  preview.className = 'card-face-catalog-preview';
  const status = doc.createElement('p');
  status.className = 'muted';
  status.setAttribute('role', 'status');
  const retry = doc.createElement('button');
  retry.type = 'button';
  retry.title = '重新加载卡面';
  retry.setAttribute('aria-label', retry.title);
  retry.append(createIcon(doc, 'refresh'), doc.createTextNode(retry.title));
  retry.hidden = true;
  details.append(title, suites, search, choices, preview, status, retry);
  container.append(details);

  let available = [], styleId = '', res = '', renderedEntry, renderedRes, renderedLabel;
  let results = [], lastData, lastStyle, lastCatalog, lastQuery;
  function showCard(style, data, label) {
    if (renderedEntry === data && renderedRes === res && renderedLabel === label) return;
    renderedEntry = data;
    renderedRes = res;
    renderedLabel = label;
    preview.replaceChildren();
    if (!style || !data || !res) return;
    const canvas = cardStyles.atlasCanvas(style, res);
    if (canvas) {
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', label + ' · ' + style.name);
      preview.append(canvas);
    }
  }

  function render({ retry: shouldRetry = false } = {}) {
    if (!details.open) return;
    const styles = cardStyles.list().filter(style => style.atlas);
    if (styles.length !== available.length || styles.some((style, index) => style !== available[index])) {
      available = styles;
      if (!styles.some(style => style.id === styleId)) {
        styleId = styles.find(style => style.id === cardStyles.selection.face)?.id || styles[0]?.id || '';
      }
      suites.replaceChildren(...styles.map(style => option(style.name, style.id)));
      suites.value = styleId;
    }
    const style = styles.find(item => item.id === styleId);
    const entry = cardStyles.previewCardAtlas(styleId, { retry: shouldRetry });
    const query = search.value.trim().toLowerCase();
    const catalog = cardStyles.localFaceCatalog;
    if (lastData !== entry?.data || lastStyle !== style || lastCatalog !== catalog || lastQuery !== query) {
      lastData = entry?.data;
      lastStyle = style;
      lastCatalog = catalog;
      lastQuery = query;
      const names = new Map((catalog || []).map(card => [card.res, card.label]));
      const allowed = style?.atlas.replaceCards ? new Set(style.atlas.replaceCards) : null;
      results = [];
      for (const [key, frame] of lastData?.frames || []) {
        const name = key.slice(0, -'_png.png'.length);
        if (allowed && !allowed.has(name)) continue;
        const nativeLabel = names.get(name);
        const label = frame.label || nativeLabel || name;
        if ([label, nativeLabel, name].some(value => value?.toLowerCase().includes(query))) results.push({ name, label });
      }
      const duplicates = new Map();
      for (const { label } of results) duplicates.set(label, (duplicates.get(label) || 0) + 1);
      choices.replaceChildren(...results.map(({ name, label }) => option(duplicates.get(label) > 1 ? `${label}（${name}）` : label, name)));
    }
    const next = results.find(card => card.name === res) || results[0];
    res = next?.name || '';
    choices.value = res;
    choices.title = next?.label || '';
    suites.hidden = !style;
    search.hidden = choices.hidden = !entry?.data;
    choices.disabled = !next;
    preview.hidden = !next;
    showCard(style, entry?.data, next?.label);
    retry.hidden = !entry?.error;
    status.classList.toggle('card-face-catalog-error', Boolean(entry?.error));
    status.textContent = entry?.error ? '卡面预览加载失败：' + entry.error
      : entry?.loading ? '正在加载卡面预览…'
      : !style ? '安装卡面套装后可逐张查看。'
      : !next ? '没有匹配的卡牌。' : '';
    status.hidden = !status.textContent;
  }

  function close() {
    details.open = false;
    cardStyles.previewCardAtlas('');
    showCard(null, null, '');
    lastData = null;
  }
  details.ontoggle = () => {
    if (details.open) {
      cardStyles.loadLocalFaceCatalog();
      render();
    } else close();
  };
  suites.onchange = () => { styleId = suites.value; render(); };
  search.oninput = () => render();
  choices.onchange = () => { res = choices.value; render(); };
  retry.onclick = () => render({ retry: true });
  const off = cardStyles.subscribe(() => render());
  return { close, dispose() { off(); close(); details.remove(); } };
}
