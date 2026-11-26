import { SECKILL_ICON } from '../../ui/plugin-icons.js';
import { createNativeAdapter } from './native.js';
import { createController } from './controller.js';
import { ITEMS, normalize, rowLabel } from './model.js';

export default {
  manifest: { id: 'seckill', name: '自动秒杀', version: '0.1.6', apiVersion: 1, contractVersion: 1, releaseNotes: "调整自动购买界面的标题和图标。自动购买默认关闭，启用后可能消耗游戏货币。", minCoreVersion: '0.6.37',
    description: '按物品与关键词自动排队抢购秒杀', icon: SECKILL_ICON, priority: 21000, categories: ['automation'] },
  activate(ctx) {
    const controller = createController({ adapter: createNativeAdapter(ctx), settings: ctx.settings, scope: ctx.scope, reportError: e => ctx.reportError?.(e), notify: ctx.notify });
    ctx.ui.registerPanel({ id: 'main', category: 'automation', render(container) {
      const doc = ctx.document, cleanups = [];
      const el = (tag, text, cls) => { const node = doc.createElement(tag); if (text !== undefined) node.textContent = text; if (cls) node.className = cls; return node; };
      const root = el('section'); root.dataset.seckill = '';
      const style = el('style'); style.textContent = `
        [data-seckill]{color:var(--sgs-text);font:12px/1.6 var(--sgs-font);min-width:0}
        [data-seckill] *{box-sizing:border-box}[data-seckill] button{font:inherit;cursor:pointer}
        [data-seckill] button:disabled{opacity:.45;cursor:not-allowed}[data-seckill] button:focus-visible{outline:1px solid var(--sgs-accent);outline-offset:2px}
        [data-seckill] .sk-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:8px;border-bottom:1px solid var(--sgs-border)}
        [data-seckill] h3{font-size:13px;margin:0;display:flex;gap:6px;align-items:center}[data-seckill] .sk-power{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--sgs-muted)}
        [data-seckill] .sk-note{color:var(--sgs-muted);font-size:10px;margin:8px 0;overflow-wrap:anywhere}
        [data-seckill] .sk-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
        [data-seckill] .sk-option{position:relative;text-align:left;min-width:0;padding:5px 8px 5px 10px;line-height:1.45;border:0;border-radius:6px;color:var(--sgs-muted);background:color-mix(in srgb,var(--sgs-surface) 55%,transparent);box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-text) 3%,transparent)}
        [data-seckill] .sk-option:before{content:'';position:absolute;left:0;top:9px;bottom:9px;width:2px;background:var(--sgs-border);border-radius:2px}
        [data-seckill] .sk-option[aria-pressed=true]{color:var(--sgs-text);background:linear-gradient(110deg,color-mix(in srgb,var(--sgs-accent) 13%,transparent),color-mix(in srgb,var(--sgs-surface) 50%,transparent))}
        [data-seckill] .sk-option[aria-pressed=true]:before{background:var(--sgs-accent)}[data-seckill] .sk-option span{display:block;font-size:10px;color:var(--sgs-muted)}[data-seckill] .sk-option[aria-pressed=true] span{color:var(--sgs-accent)}
        [data-seckill] .sk-custom{display:flex;gap:5px;margin-top:9px}[data-seckill] .sk-custom input{flex:1;width:0}[data-seckill] .sk-icon{display:inline-flex;align-items:center;justify-content:center;flex:none;width:30px;min-height:30px;padding:5px;border:0;border-radius:6px;background:transparent;color:var(--sgs-muted)}[data-seckill] .sk-icon:hover{color:var(--sgs-accent);background:var(--sgs-surface)}
        [data-seckill] .sk-tags{display:flex;flex-wrap:wrap;gap:5px;margin:6px 0}[data-seckill] .sk-tag{display:flex;align-items:center;gap:3px;max-width:100%;border-radius:6px;background:var(--sgs-surface);padding-left:7px}[data-seckill] .sk-tag>span{overflow-wrap:anywhere;min-width:0}[data-seckill] .sk-tag button{width:26px;min-height:28px}
        [data-seckill] .sk-status{display:flex;align-items:flex-start;gap:5px;margin-top:8px;padding-left:8px;border-left:2px solid var(--sgs-border);color:var(--sgs-muted);font-size:11px;overflow-wrap:anywhere}[data-seckill] .sk-status p{flex:1;min-width:0;margin:3px 0}[data-seckill] .sk-status.is-error{color:var(--sgs-danger);border-color:var(--sgs-danger)}
        [data-seckill] .sk-goods{max-height:260px;overflow:auto;margin-top:4px}[data-seckill] .sk-row{display:flex;align-items:center;gap:7px;padding:8px 0;border-top:1px solid color-mix(in srgb,var(--sgs-border) 45%,transparent)}[data-seckill] .sk-row>div{flex:1;min-width:0;overflow-wrap:anywhere}[data-seckill] .sk-row small{display:block;color:var(--sgs-muted);font-size:10px;font-variant-numeric:tabular-nums}[data-seckill] .sk-row[data-selected=true]{border-left:2px solid var(--sgs-accent);padding-left:6px}[data-seckill] details{margin-top:7px}[data-seckill] summary{cursor:pointer;color:var(--sgs-muted)}[data-seckill] pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:180px;overflow:auto;color:var(--sgs-danger);font:11px/1.5 var(--sgs-font)}
      `;
      const listen = (target, type, fn) => cleanups.push(ctx.scope.listen(target, type, fn));
      const iconButton = (icon, name, fn) => { const b = el('button', undefined, 'sk-icon'); b.type = 'button'; b.title = name; b.setAttribute('aria-label', name); b.append(ctx.ui.icon(icon)); listen(b, 'click', fn); return b; };
      const heading = el('div', undefined, 'sk-heading'), title = el('h3', '自动购买'); title.prepend(ctx.ui.icon(SECKILL_ICON));
      const power = el('label', undefined, 'sk-power'), powerText = el('span'), toggle = ctx.ui.styleSwitch(el('input')); toggle.type = 'checkbox'; toggle.setAttribute('aria-label', '自动购买所选秒杀物品');
      power.append(powerText, toggle); heading.append(title, power);
      listen(toggle, 'change', () => controller.options({ enabled: toggle.checked }));
      const note = el('p', '开启后会自动购买并扣除对应游戏货币。预置物品与自定义关键词共同生效。', 'sk-note');
      const options = el('div', undefined, 'sk-options'), buttons = new Map(); options.setAttribute('role', 'group'); options.setAttribute('aria-label', '自动购买目标');
      for (const [id, name, , tip] of ITEMS) {
        const b = el('button', name, 'sk-option'); b.type = 'button'; b.title = tip; b.setAttribute('aria-label', `${name}：${tip}`); const state = el('span'); b.append(state);
        listen(b, 'click', () => controller.options({ items: { ...controller.snapshot().config.items, [id]: !controller.snapshot().config.items[id] } }));
        buttons.set(id, { b, state }); options.append(b);
      }
      const custom = el('form', undefined, 'sk-custom'), input = el('input'); input.type = 'text'; input.className = 'sgs-input'; input.maxLength = 24; input.placeholder = '添加关键词，如锦鲤龙珠'; input.setAttribute('aria-label', '自定义秒杀关键词');
      const add = iconButton('play', '添加关键词', () => addKeyword()); custom.append(input, add);
      function addKeyword() {
        const value = input.value.trim(), c = controller.snapshot().config;
        if (!value) return;
        if (c.custom.length >= 20) { ctx.notify('最多添加 20 个关键词'); return; }
        if (c.custom.some(s => normalize(s) === normalize(value))) { ctx.notify('此关键词已存在'); return; }
        controller.options({ custom: [...c.custom, value] }); input.value = '';
      }
      listen(custom, 'submit', e => { e.preventDefault(); addKeyword(); });
      const tags = el('div', undefined, 'sk-tags'), statusRow = el('div', undefined, 'sk-status'), status = el('p'), refresh = iconButton('refresh', '刷新秒杀列表', () => controller.refresh()); status.setAttribute('role', 'status'); statusRow.append(status, refresh);
      listen(tags, 'click', e => { const kw = e.target.closest('button')?.dataset.keyword; if (kw) controller.options({ custom: controller.snapshot().config.custom.filter(s => s !== kw) }); });
      const goodsDetails = el('details', undefined, 'sgs-fold'), summary = el('summary'), goods = el('div', undefined, 'sk-goods'); goodsDetails.append(summary, goods);
      const errors = el('details'), errorSummary = el('summary', '查看完整错误'), errorText = el('pre'); errors.append(errorSummary, errorText);
      root.append(style, heading, note, options, custom, tags, statusRow, goodsDetails, errors); container.append(root);
      let rowSignature = '', tagSignature = '', dynamicCleanups = [];
      const redraw = () => {
        const s = controller.snapshot(); toggle.checked = s.config.enabled; toggle.disabled = !s.account; powerText.textContent = s.config.enabled ? '已开启' : '已关闭';
        input.disabled = add.disabled = refresh.disabled = !s.account;
        for (const [id, { b, state }] of buttons) { b.disabled = !s.account; b.setAttribute('aria-pressed', String(s.config.items[id])); state.textContent = s.config.items[id] ? '已选 · 自动购买' : '未选择'; }
        status.textContent = s.status; statusRow.classList.toggle('is-error', Boolean(s.error)); errors.hidden = !s.error; errorText.textContent = s.error;
        if (JSON.stringify(s.config.custom) !== tagSignature) {
          tagSignature = JSON.stringify(s.config.custom); tags.replaceChildren();
          for (const kw of s.config.custom) { const tag = el('span', undefined, 'sk-tag'), remove = el('button', undefined, 'sk-icon'); remove.type = 'button'; remove.title = `删除关键词 ${kw}`; remove.setAttribute('aria-label', remove.title); remove.append(ctx.ui.icon('close'));
            // These nodes are replaced as a group; no global subscription is retained.
            remove.dataset.keyword = kw; tag.append(el('span', kw), remove); tags.append(tag); }
        }
        summary.textContent = !s.listKnown ? '秒杀商品 · 等待同步' : `秒杀商品 · ${s.rows.length} 项${s.rows.filter(r => r.selected).length ? ` · 已选 ${s.rows.filter(r => r.selected).length} 项` : ''}`;
        const sig = JSON.stringify([s.account, s.config.enabled, s.manual, s.rows]);
        if (sig === rowSignature) return; rowSignature = sig; dynamicCleanups.splice(0).forEach(f => f()); goods.replaceChildren();
        if (!s.rows.length) goods.append(el('p', s.listKnown ? '暂无商品，可刷新列表。' : '商品列表未同步，可刷新查询。', 'sk-note'));
        for (const row of s.rows) {
          const item = el('div', undefined, 'sk-row'); item.dataset.selected = String(row.selected);
          const text = el('div', rowLabel(row)); text.append(el('small', `${row.state}${row.stockTotal === 0 ? ' · 库存不限' : Number.isFinite(row.stock) ? ` · 库存 ${row.stock}` : ' · 库存未知'}${row.limit === 0 ? ' · 限购不限' : Number.isFinite(row.limit) ? ` · 已购 ${row.bought}/${row.limit}` : ' · 限购未知'}`));
          const pick = el('button', s.manual === row.key ? '取消' : '优先', 'sk-icon'); pick.style.width = 'auto'; pick.type = 'button'; pick.title = s.manual === row.key ? '取消本场优先，暂停自动购买 10 分钟' : `优先购买 ${row.name}，仍需开启总开关`; pick.setAttribute('aria-label', pick.title); pick.setAttribute('aria-pressed', String(s.manual === row.key));
          pick.disabled = !row.valid || ['已结束', '限购已满', '本场已抢到'].includes(row.state);
          dynamicCleanups.push(ctx.scope.listen(pick, 'click', () => controller.manual(row.key))); item.append(text, pick); goods.append(item);
        }
      };
      cleanups.push(controller.subscribe(redraw)); redraw();
      return ctx.scope.add(() => { dynamicCleanups.splice(0).forEach(f => f()); cleanups.splice(0).forEach(f => f()); root.remove(); });
    } });
  },
};
