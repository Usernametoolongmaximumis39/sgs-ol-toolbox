// Official Windows 1.1.6 embeds Chromium 85. Keep published plugin bytes intact.
// These standard API shims are intentionally retained for the life of the page.
export function installMicroAPIs(win) {
  for (const proto of [win.Element.prototype, win.DocumentFragment.prototype, win.Document.prototype]) if (!proto.replaceChildren) Object.defineProperty(proto, 'replaceChildren', { configurable: true, writable: true, value(...nodes) { while (this.firstChild) this.removeChild(this.firstChild); this.append(...nodes); } });
  if (!win.Object.hasOwn) Object.defineProperty(win.Object, 'hasOwn', { value: (o, k) => win.Object.prototype.hasOwnProperty.call(o, k), configurable: true, writable: true });
  if (!win.Array.prototype.at) Object.defineProperty(win.Array.prototype, 'at', { value(index) {
    const n = Math.trunc(Number(index) || 0), i = n < 0 ? this.length + n : n;
    return i < 0 || i >= this.length ? undefined : this[i];
  }, configurable: true, writable: true });
  if (!win.structuredClone) win.structuredClone = value => {
    const seen = new win.Map();
    const clone = v => {
      if (typeof v === 'function' || typeof v === 'symbol' || v instanceof win.Node) throw new win.DOMException('Value cannot be cloned', 'DataCloneError');
      if (v === null || typeof v !== 'object') return v;
      if (seen.has(v)) return seen.get(v);
      let out;
      if (v instanceof win.Date) out = new win.Date(v);
      else if (v instanceof win.RegExp) out = new win.RegExp(v.source, v.flags);
      else if (v instanceof win.ArrayBuffer) out = v.slice(0);
      else if (win.ArrayBuffer.isView(v)) out = v instanceof win.DataView ? new win.DataView(clone(v.buffer), v.byteOffset, v.byteLength) : new v.constructor(clone(v.buffer), v.byteOffset, v.length);
      else out = Array.isArray(v) ? [] : v instanceof win.Map ? new win.Map() : v instanceof win.Set ? new win.Set() : {};
      seen.set(v, out);
      if (v instanceof win.Map) for (const [k, item] of v) out.set(clone(k), clone(item));
      else if (v instanceof win.Set) for (const item of v) out.add(clone(item));
      else if (Array.isArray(v) || Object.getPrototypeOf(v) === win.Object.prototype || Object.getPrototypeOf(v) === null) for (const k of Object.keys(v)) Object.defineProperty(out, k, { value: clone(v[k]), enumerable: true, configurable: true, writable: true });
      return out;
    };
    return clone(value);
  };
  if (!win.HTMLElement.prototype.showPopover) {
    const matches = win.Element.prototype.matches;
    win.Element.prototype.matches = function(selector) { return selector === ':popover-open' ? this.hasAttribute('data-micro-popover-open') : matches.call(this, selector); };
    win.HTMLElement.prototype.showPopover = function() { this.setAttribute('data-micro-popover-open', ''); };
    win.HTMLElement.prototype.hidePopover = function() { this.removeAttribute('data-micro-popover-open'); };
  }
}

function splitArguments(text) {
  const parts = []; let depth = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    else if (text[i] === ',' && !depth) { parts.push(text.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(text.slice(start).trim()); return parts;
}
function replaceFunction(text, name, replace) {
  let start = text.indexOf(name + '(');
  while (start >= 0) {
    let end = start + name.length + 1, depth = 1;
    for (; end < text.length && depth; end++) { if (text[end] === '(') depth++; else if (text[end] === ')') depth--; }
    if (depth) break;
    const result = replace(text.slice(start + name.length + 1, end - 1));
    text = text.slice(0, start) + result + text.slice(end);
    start = text.indexOf(name + '(', start + result.length);
  }
  return text;
}
export function legacyMicroCSS(css, variable, pixel) {
  const color = text => pixel(replaceFunction(text, 'var', body => { const [name, fallback] = splitArguments(body); return variable(name) || fallback || '#000'; }));
  css = replaceFunction(css, 'color-mix', body => {
    const [space, a, b] = splitArguments(body);
    if (space !== 'in srgb' || !a || !b) return 'transparent';
    const parse = text => { const match = text.match(/\s+([\d.]+)%$/); return { rgba: color(match ? text.slice(0, match.index) : text), weight: match ? Number(match[1]) / 100 : null }; };
    const x = parse(a), y = parse(b), p = x.weight ?? (y.weight === null ? .5 : 1 - y.weight), q = y.weight ?? 1 - p;
    const alpha = x.rgba[3] / 255 * p + y.rgba[3] / 255 * q;
    const rgb = [0, 1, 2].map(i => alpha ? Math.round((x.rgba[i] * x.rgba[3] / 255 * p + y.rgba[i] * y.rgba[3] / 255 * q) / alpha) : 0);
    return `rgba(${rgb.join(',')},${alpha})`;
  });
  return css.replace(/:focus-visible/g, ':focus').replace(/overflow:\s*clip/g, 'overflow:hidden')
    .replace(/\b(padding|margin)-inline:\s*([^;}]+)/g, (_, prop, value) => { const v = value.trim().split(/\s+/); return `${prop}-left:${v[0]};${prop}-right:${v[1] || v[0]}`; })
    .replace(/\b(padding|margin)-block:\s*([^;}]+)/g, (_, prop, value) => { const v = value.trim().split(/\s+/); return `${prop}-top:${v[0]};${prop}-bottom:${v[1] || v[0]}`; })
    .replace(/\bborder-block:\s*([^;}]+)/g, (_, value) => `border-top:${value.trim()};border-bottom:${value.trim()}`)
    .replace(/\bborder-inline:\s*([^;}]+)/g, (_, value) => `border-left:${value.trim()};border-right:${value.trim()}`)
    .replace(/\binset:\s*([^;}]+)/g, (_, value) => { const v = value.trim().split(/\s+/); return `top:${v[0]};right:${v[1] || v[0]};bottom:${v[2] || v[0]};left:${v[3] || v[1] || v[0]}`; });
}

export function installMicroCompatibility(win, scope) {
  installMicroAPIs(win);
  if (win.CSS?.supports('color', 'color-mix(in srgb,black,white)')) return;
  const doc = win.document, watched = new Map(), canvas = doc.createElement('canvas'); canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d');
  const colors = new Map();
  const pixel = value => {
    if (colors.has(value)) return colors.get(value);
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = 'transparent';
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    const rgba = context.getImageData(0, 0, 1, 1).data;
    if (colors.size >= 256) colors.clear();
    colors.set(value, rgba);
    return rgba;
  };
  const update = (host, record, sourcesChanged) => {
    const { root, style } = record;
    if (scope.closed || !host.isConnected) return;
    const css = sourcesChanged
      ? [...root.querySelectorAll('style')].filter(el => el !== style).map(el => el.textContent).join('\n')
      : record.css;
    let computed, previousSheet;
    const variables = new Map();
    const variable = name => {
      if (!variables.has(name)) {
        if (!computed) {
          // A replaced source may have defined a :host variable in the old fallback.
          const sheet = css !== record.css ? style.sheet : null;
          if (sheet && !sheet.disabled) {
            previousSheet = sheet;
            sheet.disabled = true;
          }
          computed = win.getComputedStyle(host);
        }
        variables.set(name, computed.getPropertyValue(name).trim());
      }
      return variables.get(name);
    };
    if (css !== record.css || [...record.variables].some(([name, value]) => variable(name) !== value)) {
      let translated;
      try {
        translated = legacyMicroCSS(css, variable, pixel);
      } finally {
        if (previousSheet) previousSheet.disabled = false;
      }
      const output = translated + '\n[popover]:not([data-micro-popover-open]){display:none!important}[popover][data-micro-popover-open]{display:block;z-index:2147483647}'
        // Chromium 85 ignores scrollbar-width and does not theme native scrollbars.
        + '\n*::-webkit-scrollbar{width:7px;height:7px}*::-webkit-scrollbar-track{background:var(--sgs-bg)}*::-webkit-scrollbar-thumb{background:var(--sgs-border);border:2px solid var(--sgs-bg);border-radius:6px}*::-webkit-scrollbar-thumb:hover{background:var(--sgs-muted)}*::-webkit-scrollbar-corner{background:var(--sgs-bg)}';
      if (style.textContent !== output) style.textContent = output;
      record.css = css;
      record.variables = variables;
    }
    // A late stylesheet can reset a property through an unsupported color-mix()
    // inside var(). Keep the translated declaration after the source.
    if (sourcesChanged && root.lastChild !== style) root.append(style);
  };
  const stylesheet = 'style,link[rel~="stylesheet" i]';
  const changesSources = ({ type, target, addedNodes, removedNodes }, style) => {
    if (target === style || target.parentNode === style) return false;
    // Also match links whose rel just changed away from "stylesheet".
    if (type === 'attributes') return target.matches('style,link');
    if (type === 'characterData') return target.parentNode?.localName === 'style';
    if (target.localName === 'style') return true;
    const includesSource = nodes => [...nodes].some(node => node !== style && node.nodeType === 1
      && (node.matches(stylesheet) || (node.firstElementChild && node.querySelector(stylesheet))));
    return includesSource(addedNodes) || includesSource(removedNodes);
  };
  const unwatch = (host, { root, style, observer, linkLoaded }) => {
    observer.disconnect();
    root.removeEventListener('load', linkLoaded, true);
    style.remove();
    watched.delete(host);
  };
  const discover = () => {
    for (const [host, record] of watched) if (!host.isConnected) unwatch(host, record);
    for (const host of doc.querySelectorAll('[data-sgs-toolbox]')) {
      const root = host.shadowRoot;
      if (!root || watched.has(host)) continue;
      const style = doc.createElement('style');
      style.dataset.microFallback = '';
      root.append(style);
      const observer = new win.MutationObserver(mutations => {
        const sourcesChanged = style.parentNode !== root || mutations.some(mutation => changesSources(mutation, style));
        if (sourcesChanged || mutations.some(mutation => mutation.target === host)) update(host, record, sourcesChanged);
      });
      const linkLoaded = event => { if (event.target.matches?.(stylesheet)) update(host, record, false); };
      const record = { root, style, observer, linkLoaded, css: null, variables: new Map() };
      observer.observe(host, { attributes: true, attributeFilter: ['style', 'data-theme-scheme'] });
      observer.observe(root, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['rel', 'href', 'media', 'disabled'] });
      root.addEventListener('load', linkLoaded, true);
      watched.set(host, record);
      update(host, record, true);
    }
  };
  discover(); scope.interval(discover, 250);
  scope.add(() => { for (const [host, record] of watched) unwatch(host, record); });
}
