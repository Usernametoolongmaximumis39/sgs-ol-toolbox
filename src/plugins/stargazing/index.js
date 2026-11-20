import { CONTROL_STYLES } from '../../ui/controls.js';
import { STARGAZING_SITE } from '../../shared/stargazing-source.js';
import { findEntries, normalizeReport } from './report.js';
import { STYLES } from './styles.js';

export const manifest = {
  id: 'stargazing',
  name: '自助观星',
  version: '0.1.0',
  apiVersion: 1,
  contractVersion: 1,
  minCoreVersion: '0.6.180',
  description: '在游戏内按栏目查看和搜索第三方观星报告。',
  releaseNotes: '首次提供自助观星，可按栏目和关键词查看活动预测。',
  icon: { paths: ['M12 2l2.6 6.6L22 12l-7.4 3.4L12 22l-2.6-6.6L2 12l7.4-3.4L12 2Z', 'M19 3v4m-2-2h4'] },
  priority: 32768,
  categories: ['tools'],
};

function node(doc, tag, text) {
  const element = doc.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}

function externalLink(doc, text, url) {
  const link = node(doc, 'a', text);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function drawTable(doc, section, { columns, rows }) {
  const table = node(doc, 'table');
  table.setAttribute('role', 'table');
  table.setAttribute('aria-label', section.firstChild.textContent);
  const head = table.createTHead().insertRow();
  for (const column of columns) {
    const cell = node(doc, 'th', column);
    cell.scope = 'col';
    cell.dataset.field = column;
    head.append(cell);
  }
  const body = table.createTBody();
  for (const row of rows) {
    const line = body.insertRow();
    row.forEach((value, index) => {
      const label = node(doc, 'span', columns[index]);
      label.className = 'field-name';
      label.setAttribute('aria-hidden', 'true');
      line.insertCell().append(label, node(doc, 'span', value));
    });
  }
  section.append(table);
}

function drawSkins(doc, section, { items }) {
  const list = node(doc, 'ul');
  for (const { name, url } of items) {
    const item = node(doc, 'li');
    item.append(url ? externalLink(doc, name, url) : doc.createTextNode(name));
    list.append(item);
  }
  section.append(list);
}

function openReport(ctx, overlayRoot, onClose) {
  const doc = ctx.document;
  const host = node(doc, 'div');
  host.dataset.stargazing = '';
  const shadow = host.attachShadow({ mode: 'open' });
  const dialog = node(doc, 'dialog');
  dialog.setAttribute('aria-label', manifest.name);
  const header = node(doc, 'header');
  const heading = node(doc, 'div');
  heading.className = 'heading';
  const title = node(doc, 'h1', manifest.name);
  title.tabIndex = -1;
  title.prepend(ctx.ui.icon(manifest.icon));
  const iconButton = (icon, label) => {
    const button = node(doc, 'button');
    button.type = 'button';
    button.className = 'icon';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.append(ctx.ui.icon(icon));
    return button;
  };
  const refresh = iconButton('refresh', '刷新观星报告');
  const close = iconButton('close', '关闭自助观星');
  heading.append(title, refresh, close);
  const search = node(doc, 'input');
  search.type = 'search';
  search.className = 'sgs-input';
  search.placeholder = '搜索关键词';
  search.setAttribute('aria-label', search.placeholder);
  const category = node(doc, 'select');
  category.className = 'sgs-select';
  category.setAttribute('aria-label', '选择栏目');
  const filters = node(doc, 'div');
  filters.className = 'filters';
  filters.append(search, category);
  const status = node(doc, 'div');
  status.className = 'meta';
  status.setAttribute('role', 'status');
  header.append(heading, filters, status);
  const content = node(doc, 'div');
  content.className = 'content';
  const error = node(doc, 'p');
  error.className = 'error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const results = node(doc, 'div');
  content.append(error, results);
  const footer = node(doc, 'footer');
  footer.append('数据来源 ', externalLink(doc, 'gx.95chong.cn', STARGAZING_SITE), '。结果由代码自动推演，可能会被调整，仅供参考，请以官方公告为准。');
  dialog.append(header, content, footer);
  shadow.append(node(doc, 'style', CONTROL_STYLES + STYLES), dialog);
  overlayRoot.append(host);

  let report, pending, alive = true;
  const setOptions = selectedTitle => {
    const all = node(doc, 'option', '全部栏目');
    all.value = '-1';
    category.replaceChildren(all);
    report?.sections.forEach(({ title }, index) => {
      const option = node(doc, 'option', title);
      option.value = String(index);
      category.append(option);
    });
    const selectedIndex = report?.sections.findIndex(section => section.title === selectedTitle) ?? -1;
    category.value = String(selectedIndex);
    category.disabled = !report?.sections.length;
  };
  function draw() {
    if (!report) return;
    const sections = findEntries(report.sections, Number(category.value), search.value);
    results.replaceChildren();
    for (const section of sections) {
      const region = node(doc, 'section');
      region.append(node(doc, 'h2', section.title));
      if (section.kind === 'table' && section.rows.length) drawTable(doc, region, section);
      else if (section.kind === 'skins' && section.items.length) drawSkins(doc, region, section);
      else region.append(node(doc, 'p', '本栏目暂无条目'));
      results.append(region);
    }
    if (!sections.length) {
      const empty = node(doc, 'p', search.value.trim() ? '没有符合关键词的条目' : '观星站暂无可展示的栏目');
      empty.className = 'message';
      results.append(empty);
    }
    content.scrollTop = 0;
  }
  async function load() {
    if (!alive || pending) return;
    const request = new AbortController();
    pending = request;
    error.hidden = true;
    refresh.disabled = true;
    content.setAttribute('aria-busy', 'true');
    status.textContent = report ? '正在刷新观星报告…' : '正在读取观星报告…';
    try {
      const data = await ctx.game.readStargazingReport({ signal: request.signal });
      if (request.signal.aborted || ctx.scope.signal.aborted) return;
      const selectedTitle = report?.sections[Number(category.value)]?.title;
      report = normalizeReport(data);
      setOptions(selectedTitle);
      draw();
      status.textContent = report.updatedAt ? `更新于 ${report.updatedAt}` : '来源未提供更新时间';
    } catch (failure) {
      if (request.signal.aborted || ctx.scope.signal.aborted) return;
      status.textContent = report ? '刷新失败，显示上次读取的报告' : '观星报告暂不可用';
      error.textContent = `${failure?.message || '读取失败'}。可重试或打开底部来源链接查看。`;
      error.hidden = false;
    } finally {
      if (alive && !ctx.scope.signal.aborted) {
        pending = undefined;
        refresh.disabled = false;
        content.removeAttribute('aria-busy');
      }
    }
  }

  const scope = ctx.scope;
  const stop = [
    scope.listen(refresh, 'click', load),
    scope.listen(search, 'input', draw),
    scope.listen(category, 'change', draw),
    scope.listen(close, 'click', () => release()),
    scope.listen(dialog, 'cancel', event => { event.preventDefault(); release(); }),
  ];
  const release = scope.add(() => {
    alive = false;
    pending?.abort();
    for (const off of stop) off();
    dialog.close();
    host.remove();
    onClose();
  });
  setOptions();
  dialog.showModal();
  title.focus();
  void load();
  return release;
}

export function activate(ctx) {
  // A live report belongs to the plugin. Market checks can rebuild the HUD
  // panel while the dialog is open, so its host sits outside that panel.
  let closeReport, currentTrigger;
  ctx.ui.registerPanel({
    id: 'main',
    category: 'tools',
    render(container) {
      const trigger = node(ctx.document, 'button', '打开观星');
      trigger.type = 'button';
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.prepend(ctx.ui.icon(manifest.icon));
      container.append(trigger);
      currentTrigger = trigger;
      const off = ctx.scope.listen(trigger, 'click', () => {
        const root = container.getRootNode();
        closeReport ??= openReport(ctx, root.host ? root : ctx.document.body, () => {
          closeReport = undefined;
          if (currentTrigger?.isConnected) currentTrigger.focus();
        });
      });
      return ctx.scope.add(() => {
        off();
        if (currentTrigger === trigger) currentTrigger = undefined;
        trigger.remove();
      });
    },
  });
}

export default { manifest, activate };
