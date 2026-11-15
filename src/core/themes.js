export const BLACK_GOLD = { id: 'core.black-gold', name: '玄金', tokens: { bg: '#201e1a', surface: '#2c2922', raised: '#383327', text: '#eee3cc', muted: '#b7aa8c', accent: '#dbba70', border: '#665b42', danger: '#f3988c', radius: '10px', font: '"Microsoft YaHei", system-ui, sans-serif', motion: '240ms', scheme: 'dark' } };
const allowed = Object.keys(BLACK_GOLD.tokens);
function clean(tokens) { const result = {}; for (const k of allowed) if (typeof tokens?.[k] === 'string' && tokens[k].length < 180 && !/[;{}]|url\s*\(/i.test(tokens[k]) && (k !== 'scheme' || ['light', 'dark'].includes(tokens[k]))) result[k] = tokens[k]; return result; }
export class ThemeRegistry {
  constructor(settings, apply = () => {}) { this.settings = settings; this.apply = apply; this.themes = new Map([[BLACK_GOLD.id, BLACK_GOLD]]); this.layers = new Map(); this.listeners = new Set(); this.refresh(); }
  register(theme, owner = 'core') { if (!theme?.id || !theme.id.startsWith(owner + '.')) throw new Error('主题 ID 必须以插件 ID 为前缀。'); if (this.themes.has(theme.id)) throw new Error('主题 ID 已注册。'); this.themes.set(theme.id, { ...theme, tokens: clean(theme.tokens) }); this.refresh(); return () => { this.themes.delete(theme.id); this.refresh(); }; }
  override(owner, tokens, priority = 0) { const key = Symbol(owner); this.layers.set(key, { owner, priority, tokens: clean(tokens) }); this.refresh(); return () => { this.layers.delete(key); this.refresh(); }; }
  select(id) { if (!this.themes.has(id)) throw new Error('主题尚未启用或已被卸载。'); this.settings.set('theme', id); this.refresh(); }
  list() { return [...this.themes.values()]; }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  refresh() {
    const selected = this.settings.get('theme', BLACK_GOLD.id), theme = this.themes.get(selected) || BLACK_GOLD;
    const tokens = { ...BLACK_GOLD.tokens, ...theme.tokens };
    for (const layer of [...this.layers.values()].sort((a, b) => a.priority - b.priority || a.owner.localeCompare(b.owner))) Object.assign(tokens, layer.tokens);
    this.current = { id: theme.id, tokens }; this.apply(tokens);
    // A failing observer must not interrupt registration or resource disposal.
    for (const fn of [...this.listeners]) { try { fn(this.current); } catch (error) { console.warn('[工具箱主题订阅]', error); } }
  }
}
