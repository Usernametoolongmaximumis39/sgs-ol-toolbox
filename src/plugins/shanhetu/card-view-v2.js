import { infoIcon } from './info-icons.js';
import { infoLineTokens } from './info-content.js';

const FONT = 'Microsoft YaHei';
const ICON = 14, GAP = 3;
export function cardLines(lines) {
  const result = [];
  for (const line of lines) {
    const prior = result.at(-1);
    if (line.kind === 'armor' && prior?.kind === 'stats') {
      const full = line.text.replace(/^防具\s*[·：:]?\s*/, '');
      const short = full.split('、').map(name => Array.from(name.trim()).slice(0, 2).join('')).join('、');
      result[result.length - 1] = { ...prior, text: prior.text + '\n' + line.text,
        tokens: [...(prior.tokens || []), { text: short, fallback: short, full }], armorInline: true };
    } else result.push(line);
  }
  return result;
}
// Map cards use semantic runs: punctuation and compensation never become
// separate wrapping units. Full wording remains in the accessible summary.
export function cardTokens(line) {
  if (line.kind === 'name' && line.warnings?.length) return [
    { text: line.text }, ...line.warnings.map(name => ({ icon: 'warning', text: name, full: '注意 · ' + name, warning: true }))
  ];
  const compact = value => typeof value === 'string' ? value.replace(/\s*[（(](?:待揭示|入点揭示)[）)]/g, '') : value;
  const source = infoLineTokens(line).map((token, index, tokens) => {
    const text = compact(token.text), fallback = compact(token.fallback);
    // Only a complete generic reward becomes a category icon. Named rewards
    // and unknown descriptions retain their text; no acquisition mode is guessed.
    const match = !token.icon && tokens[index - 1]?.text !== ' → ' &&
      /^(?:([一二三四五六七八九十\d]+)[件张个])?(普通|稀有|史诗|传说)(战法|技能|手牌|卡牌|装备)$/.exec(text?.trim() || '');
    if (match) {
      const counts = {一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10};
      const count = match[1] ? counts[match[1]] || match[1] : null;
      const category = {战法:'zhanfa',技能:'skill',手牌:'card',卡牌:'card',装备:'equip'}[match[3]];
      return {...token, icon:`rogue_event_${category}0`, text:match[2] + (count && Number(count) !== 1 ? `×${count}` : ''),
        fallback, full:token.full || token.text};
    }
    return { ...token, text, fallback };
  }), result = [];
  for (let i = 0; i < source.length; i++) {
    const token = source[i];
    if (token.text === '（可弃换' && source[i + 1]?.icon === 'rogue_money_icon' && source[i + 2]?.text === '）') {
      const coin = source[++i]; i++;
      result.push({ ...coin, text: `弃换${coin.text}` });
    } else if (token.text === '无法选择（无合适扣除对象）') {
      result.push({ ...token, text: '不可选：无可扣对象', fallback: '不可选：无可扣对象' });
    } else if (/^[①②③]\s*$/.test(token.text) && source[i + 1]?.icon && source[i + 2]?.text === ' → ' && !source[i + 3]?.icon) {
      const cost = source[i + 1], gain = source[i + 3];
      result.push({ ...cost, prefix: token.text.trim(), text: cost.text.replace(/\s*×\s*/g, '×') + '→' + gain.text.replace('·', '') }); i += 3;
    } else result.push(/^[①②③]\s*$/.test(token.text) ? { ...token, text: token.text.trim(), fallback: token.text.trim() } : token);
  }
  return result;
}
const finite = Number.isFinite;
const remember = (cache, key, value, limit) => {
  if (cache.size >= limit) cache.delete(cache.keys().next().value);
  cache.set(key, value); return value;
};

// Measure with one scoped native Text; only the selected layout creates a
// display tree. Alternate widths are immutable descriptions, not hidden cards.
export function createInfoCardView(ctx, theme) {
  const sizes = new Map(), layouts = new Map(), icons = new Map();
  let probe = null, disposed = false;
  const Laya = () => ctx.window.Laya || ctx.window.laya;
  const own = (parent, child) => {
    try { parent.addChild(child); return child; }
    catch (error) { child.destroy(true); throw error; }
  };
  function metrics(text, kind, width = null) {
    const fontSize = kind === 'heading' || kind === 'name' ? 15 : 12;
    const bold = ['heading', 'name', 'warning'].includes(kind);
    const key = JSON.stringify([String(text), fontSize, bold, width]);
    if (sizes.has(key)) return sizes.get(key);
    try {
      const L = Laya();
      if (!probe || probe.destroyed) { probe = new L.Text(); probe.mouseEnabled = false; }
      Object.assign(probe, { font: FONT, fontSize, bold, leading: 4, wordWrap: width !== null,
        width: width ?? 0, text: String(text), height: 0 });
      probe.typeset();
      const w = Math.ceil(Number(probe.textWidth)), h = Math.ceil(Number(probe.textHeight));
      if (!finite(w) || !finite(h) || h <= 0) throw new Error('完整文字尺寸尚未就绪');
      return remember(sizes, key, { w, h, fontSize, bold }, 2048);
    } catch (error) {
      if (probe && !probe.destroyed) probe.destroy(true); probe = null; throw error;
    }
  }
  function measure(node, lines, width) {
    lines = cardLines(lines);
    // Keep the five values and armor together; report the true minimum width
    // to the placement solver instead of spilling the armor onto its own row.
    for (const line of lines.filter(line => line.armorInline)) {
      const tokens = cardTokens(line).filter(t => t.icon || t.text?.trim());
      const needed = tokens.reduce((sum, t) => sum + (t.icon ? ICON + 1 : 0) + metrics(t.text || '', 'stats').w, 0) + (tokens.length - 1) * 2;
      width = Math.max(width, needed + 24);
    }
    const id = String(node.id), name = node.name || '节点', location = node.city || '地点待同步';
    const cacheKey = JSON.stringify([id, name, location, lines, width]);
    if (layouts.has(cacheKey)) return layouts.get(cacheKey);
    const texts = [], images = [], rules = [], semantics = lines.flatMap(line => [line.text,
      ...(line.warnings?.length ? ['注意 · ' + line.warnings.join('、')] : [])]);
    const text = (value, kind, x, y, w, align = 'left') => {
      const m = metrics(value, kind, w);
      texts.push({ text: String(value), kind, x, y, w, h: m.h, fontSize: m.fontSize, bold: m.bold, align });
      return m.h;
    };
    const idWidth = metrics(location, 'id').w;
    const inlineId = width - 24 - idWidth - 10 >= 60;
    let y = 10;
    const titleHeight = text(name, 'heading', 12, y, inlineId ? width - 24 - idWidth - 10 : width - 24);
    const idY = inlineId ? y + 2 : y + titleHeight + 2;
    const idHeight = text(location, 'id', inlineId ? width - 12 - idWidth : 12, idY,
      inlineId ? idWidth : width - 24, inlineId ? 'right' : 'left');
    y = inlineId ? y + Math.max(titleHeight, idHeight + 2) : idY + idHeight;
    rules.push({ y: y + 5, accent: true }); y += 11;
    let priorKind = '';
    for (const line of lines) {
      if (line.kind === 'reward') { y += 3; rules.push({ y }); y += 6; }
      else if (line.kind === 'name' && priorKind) y += 4;
      const tokens = cardTokens(line);
      if (!tokens.some(token => token.icon && infoIcon(token.icon))) {
        y += text(tokens.map(token => token.fallback ?? token.text ?? '').join(''), line.kind, 12, y, width - 24) + 2;
      } else {
        let x = 0, rowHeight = 0;
        const available = width - 24;
        const newline = () => { if (rowHeight) y += rowHeight + 3; x = 0; rowHeight = 0; };
        for (const token of tokens) {
          if (token.breakBefore) newline();
          const icon = token.icon && infoIcon(token.icon);
          const value = String(icon ? token.text ?? '' : token.fallback ?? token.text ?? '');
          if (!icon && (!value.trim() || value.trim() === '·')) continue;
          const iconWidth = icon ? ICON + (value ? 1 : 0) : 0;
          const kind = token.warning ? 'warning' : line.kind;
          const prefixWidth = token.prefix ? metrics(token.prefix, kind).w + GAP : 0;
          const natural = value ? metrics(value, kind) : { w: 0, h: ICON };
          const w = Math.min(available, prefixWidth + iconWidth + natural.w);
          if (x && x + w > available) newline();
          if (token.prefix) text(token.prefix, kind, 12 + x, y, prefixWidth);
          const textWidth = Math.max(1, w - prefixWidth - iconWidth);
          const height = value ? text(value, kind, 12 + x + prefixWidth + iconWidth, y, textWidth) : ICON;
          if (icon) images.push({ name: token.icon, label: token.full || token.fallback || icon.label,
            x: 12 + x + prefixWidth, y: y + Math.max(0, (Math.min(height, 20) - ICON) / 2), w: ICON, h: ICON });
          rowHeight = Math.max(rowHeight, height, icon ? ICON : 0); x += w + (line.kind === 'stats' ? 2 : GAP);
        }
        y += rowHeight + 2;
      }
      priorKind = line.kind;
    }
    return remember(layouts, cacheKey, { id: node.id, name, w: width, h: Math.ceil(y + 8), texts, images, rules,
      accessibleText: [name + ' · ' + location, ...semantics].join('\n') }, 256);
  }
  function paintIcon(target, item, releases) {
    const L = Laya(), spec = infoIcon(item.name);
    // A short semantic fallback occupies the same fixed icon box until local
    // artwork is decoded. Loading never triggers another layout search.
    let fallback = null;
    let entry = icons.get(spec.data);
    const draw = texture => {
      if (disposed || target.destroyed || !texture) return;
      const scale = Math.min(item.w / texture.width, item.h / texture.height);
      const w = texture.width * scale, h = texture.height * scale;
      target.graphics.drawTexture(texture, item.x + (item.w - w) / 2, item.y + (item.h - h) / 2, w, h);
      if (fallback && !fallback.destroyed) fallback.destroy(true);
    };
    if (entry?.texture) { draw(entry.texture); return; }
    fallback = own(target, new L.Text());
    Object.assign(fallback, { text: spec.label.slice(0, 1), font: FONT, fontSize: 12,
      x: item.x, y: item.y, width: item.w, height: item.h, color: theme.palette.accent, mouseEnabled: false });
    if (!entry) {
      entry = { listeners: new Set(), texture: null, image: null, failed: false }; icons.set(spec.data, entry);
      if (L.Texture2D && L.Texture && ctx.window.Image) {
        try {
        const img = entry.image = new ctx.window.Image();
        img.onload = () => {
          img.onload = img.onerror = null; entry.image = null;
          if (disposed) return;
          let bitmap;
          try {
            bitmap = new L.Texture2D(img.naturalWidth, img.naturalHeight);
            bitmap.loadImageSource(img, true); entry.texture = new L.Texture(bitmap);
          } catch { bitmap?.destroy(); entry.failed = true; entry.listeners.clear(); return; }
          const listeners = [...entry.listeners]; entry.listeners.clear();
          for (const listener of listeners) {
            try { listener(entry.texture); } catch { /* The semantic fallback remains visible. */ }
          }
        };
        img.onerror = () => { img.onload = img.onerror = null; entry.image = null; entry.failed = true; entry.listeners.clear(); };
        img.src = spec.data;
        } catch {
          if (entry.image) entry.image.onload = entry.image.onerror = null;
          entry.image = null; entry.failed = true; entry.listeners.clear();
        }
      } else entry.failed = true;
    }
    if (entry.texture) { draw(entry.texture); return; }
    if (!entry.failed) { entry.listeners.add(draw); releases.push(() => entry.listeners.delete(draw)); }
  }
  function build(layout) {
    const L = Laya(), card = new L.Sprite();
    try {
      const releases = [], destroy = card.destroy;
      card.destroy = function (...args) { for (const release of releases.splice(0)) release(); return destroy.apply(this, args); };
      card.name = 'shanhe-card-' + String(layout.id); card.mouseEnabled = false;
      card._shanheAccessibleText = layout.accessibleText;
      card._shanheIconLabels = layout.images.map(image => image.label);
      const background = own(card, new L.Sprite());
      background.name = 'shanhe-card-surface'; background.mouseEnabled = false; background.alpha = .88;
      const ink = own(card, new L.Sprite()); ink.mouseEnabled = false;
      for (const rule of layout.rules) {
        ink.graphics.drawLine(12, rule.y, layout.w - 12, rule.y, theme.palette.borderSoft, .65);
        if (rule.accent) ink.graphics.drawLine(12, rule.y, 30, rule.y, theme.palette.accent, 1);
      }
      for (const item of layout.texts) {
        const label = own(card, new L.Text());
        Object.assign(label, { x: item.x, y: item.y, width: item.w, height: item.h, text: item.text,
          wordWrap: true, font: FONT, fontSize: item.fontSize, bold: item.bold, align: item.align,
          leading: 4, mouseEnabled: false,
          color: item.kind === 'warning' ? theme.palette.danger : item.kind === 'heading' ? theme.palette.accent
            : ['stats', 'hint', 'id'].includes(item.kind) ? theme.palette.muted : theme.palette.text });
        label.typeset();
        if (Math.ceil(Number(label.textHeight)) > item.h) throw new Error('卡片文字实测高度发生变化');
      }
      for (const item of layout.images) paintIcon(ink, item, releases);
      card.size(layout.w, layout.h); background.size(layout.w, layout.h);
      theme.surface(background, { width: layout.w, height: layout.h, kind: 'panel' });
      return card;
    } catch (error) { card.destroy(true); throw error; }
  }
  ctx.scope.add(() => {
    disposed = true; if (probe && !probe.destroyed) probe.destroy(true); probe = null;
    sizes.clear(); layouts.clear();
    for (const entry of icons.values()) {
      if (entry.image) entry.image.onload = entry.image.onerror = null;
      entry.listeners.clear(); entry.texture?.destroy(true);
    }
    icons.clear();
  });
  return { measure, build, inspect: () => ({ textMeasurements: sizes.size, cardMeasurements: layouts.size,
    iconTextures: [...icons.values()].filter(entry => entry.texture).length,
    pendingIconListeners: [...icons.values()].reduce((sum, entry) => sum + entry.listeners.size, 0),
    failedIcons: [...icons.values()].filter(entry => entry.failed).length }) };
}



