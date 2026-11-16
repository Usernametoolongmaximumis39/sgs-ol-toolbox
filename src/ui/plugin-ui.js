import { createIcon } from './icons.js';
import { CONTROL_STYLES, styleSwitch, helpTip } from './controls.js';
import { INFO_STYLES, panelUI } from '../shared/info-ui.js';

// One stylesheet per document, shared by all active plugins and their panels.
const sheets = new WeakMap();
export function acquirePluginStyles(root, doc) {
  let entry = sheets.get(root);
  if (!entry) {
    const style = doc.createElement('style');
    style.dataset.sgsPluginControls = '';
    style.textContent = CONTROL_STYLES + INFO_STYLES;
    root.append(style);
    sheets.set(root, entry = { style, users: 0 });
  }
  entry.users++;
  let released = false;
  return () => { if (released) return; released = true; if (--entry.users === 0) { entry.style.remove(); sheets.delete(root); } };
}
export function mountPluginUI(context, getContext) {
  const { document: doc, scope } = context;
  if (doc?.createElement) scope.add(acquirePluginStyles(doc.head || doc.documentElement, doc));
  return {
    icon: spec => createIcon(doc, spec),
    styleSwitch,
    helpTip: (text, label) => helpTip(doc, text, label),
    panel: container => panelUI(getContext(), container),
    mountStyles: root => scope.add(acquirePluginStyles(root, doc)),
  };
}
