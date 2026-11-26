export const BLACK_GOLD = { id: 'core.black-gold', name: '玄金', tokens: { bg: '#201e1a', surface: '#2c2922', raised: '#383327', text: '#eee3cc', muted: '#b7aa8c', accent: '#dbba70', border: '#665b42', danger: '#f3988c', radius: '10px', font: '"Microsoft YaHei", system-ui, sans-serif', motion: '240ms', scheme: 'dark' } };
export const DECORATIVE_COLOR_TOKENS = Object.freeze(['bg2', 'accent2']);
export const GRADIENT_TOKENS = Object.freeze(['backdrop', 'card', 'compact']);
export const OPTIONAL_THEME_TOKENS = Object.freeze([...DECORATIVE_COLOR_TOKENS, ...GRADIENT_TOKENS]);
const allowed = Object.keys(BLACK_GOLD.tokens);
const safeScalar = value => typeof value === 'string' && value.length > 0 && value.length < 180 && !/[;{}]|url\s*\(/i.test(value);
const gradientHead = /^(?:repeating-)?(?:linear|radial|conic)-gradient\(/i;
export function isSafeGradient(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 1200) return false;
  if (trimmed === 'none') return true;
  if (/[;{}<>\\]|\/\*|\*\/|url\s*\(|image-set\s*\(|expression\s*\(|@import/i.test(trimmed)) return false;
  const layers = [];
  let depth = 0, start = 0;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '(') depth++;
    else if (ch === ')') { if (--depth < 0) return false; }
    else if (ch === ',' && depth === 0) { layers.push(trimmed.slice(start, i).trim()); start = i + 1; }
  }
  if (depth !== 0) return false;
  layers.push(trimmed.slice(start).trim());
  return layers.length > 0 && layers.length <= 8 && layers.every(layer => gradientHead.test(layer) && layer.endsWith(')'));
}
function clean(tokens) {
  const result = {};
  for (const k of allowed) if (safeScalar(tokens?.[k]) && (k !== 'scheme' || ['light', 'dark'].includes(tokens[k]))) result[k] = tokens[k];
  for (const k of DECORATIVE_COLOR_TOKENS) if (safeScalar(tokens?.[k])) result[k] = tokens[k];
  for (const k of GRADIENT_TOKENS) if (isSafeGradient(tokens?.[k])) result[k] = tokens[k].trim();
  return result;
}
export class ThemeRegistry {
  constructor(settings, apply = () => {}, palettes = []) {
    this.settings = settings; this.apply = apply;
    this.themes = new Map([[BLACK_GOLD.id, BLACK_GOLD]]);
    for (const palette of palettes) this.themes.set(palette.id, { ...palette, tokens: clean(palette.tokens) });
    this.layers = new Map(); this.listeners = new Set(); this.refresh();
  }
  register(theme, owner = 'core') { if (!theme?.id || !theme.id.startsWith(owner + '.')) throw new Error('主题 ID 必须以插件 ID 为前缀。'); if (this.themes.has(theme.id)) throw new Error('主题 ID 已注册。'); this.themes.set(theme.id, { ...theme, tokens: clean(theme.tokens) }); this.refresh(); return () => { this.themes.delete(theme.id); this.refresh(); }; }
  override(owner, tokens, priority = 0) { const key = Symbol(owner); this.layers.set(key, { owner, priority, tokens: clean(tokens) }); this.refresh(); return () => { this.layers.delete(key); this.refresh(); }; }
  select(id) { if (!this.themes.has(id)) throw new Error('主题尚未启用或已被卸载。'); this.settings.set('theme', id); this.refresh(); }
  list() { return [...this.themes.values()]; }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  refresh() {
    const selected = this.settings.get('theme', BLACK_GOLD.id), theme = this.themes.get(selected) || BLACK_GOLD;
    const tokens = { ...BLACK_GOLD.tokens, ...theme.tokens };
    for (const layer of [...this.layers.values()].sort((a, b) => a.priority - b.priority || a.owner.localeCompare(b.owner))) Object.assign(tokens, layer.tokens);
    for (const k of GRADIENT_TOKENS) if (tokens[k] === 'none') delete tokens[k];
    this.current = { id: theme.id, tokens }; this.apply(tokens);
    // A failing observer must not interrupt registration or resource disposal.
    for (const fn of [...this.listeners]) { try { fn(this.current); } catch (error) { console.warn('[工具箱主题订阅]', error); } }
  }
}
