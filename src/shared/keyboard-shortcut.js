export function shortcutFromEvent(event) {
  if (!event.code || ['Control', 'Shift', 'Alt', 'Meta'].some(key => event.code.startsWith(key))) return null;
  return { code: event.code, ctrl: event.ctrlKey, shift: event.shiftKey, alt: event.altKey, meta: event.metaKey };
}

export function shortcutLabel(shortcut) {
  if (!shortcut?.code) return '未绑定';
  return [shortcut.ctrl && 'Ctrl', shortcut.shift && 'Shift', shortcut.alt && 'Alt', shortcut.meta && 'Meta', shortcut.code.replace(/^(Key|Digit)/, '')].filter(Boolean).join(' + ');
}

export function matchesShortcut(event, shortcut) {
  return !!shortcut?.code && event.code === shortcut.code && ['ctrl', 'shift', 'alt', 'meta'].every(key => !!event[key + 'Key'] === !!shortcut[key]);
}

export function isTyping(event) {
  return event.composedPath().some(node => node?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(node?.tagName));
}
