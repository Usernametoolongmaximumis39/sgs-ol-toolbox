import { officialEntryPage } from './official-entry-page.js';

// Refreshing the game reuses its single-use entry URL. Return through the
// official SSO page instead; only that page may issue a fresh entry credential.
const KEY = 'sgstoolbox:refresh-reentry:v1';
const MAX_AGE = 60_000;
const INSTALLED = Symbol.for('sgs.ol.toolbox.refresh-reentry');

export function installRefreshReentry(win, trace) {
  if (win[INSTALLED] !== undefined) return win[INSTALLED];
  const handled = install(win, trace);
  win[INSTALLED] = handled;
  return handled;
}

function install(win, trace) {
  const page = officialEntryPage(win);
  if (!page) return false;
  const record = step => { try { trace?.(step); } catch {} };
  const clear = () => { try { win.sessionStorage.removeItem(KEY); } catch {} };
  let pending;
  try { pending = JSON.parse(win.sessionStorage.getItem(KEY) || 'null'); } catch {}
  const valid = pending?.version === 1 && Number.isFinite(pending.at)
    && Date.now() >= pending.at && Date.now() - pending.at < MAX_AGE;
  if (page === 'portal') {
    // The rest of the toolbox must not start plugins on the login portal.
    if (!valid) { clear(); return true; }
    record('P10');
    let timer;
    const cancel = () => { stop(); record('P13'); };
    const stop = () => {
      win.clearInterval(timer); clear();
      win.removeEventListener('pagehide', stop);
      win.document.removeEventListener('pointerdown', cancel, true);
      win.document.removeEventListener('keydown', cancel, true);
    };
    const visible = el => el && el.getClientRects().length > 0
      && win.getComputedStyle(el).visibility !== 'hidden';
    const tick = () => {
      if (Date.now() - pending.at >= MAX_AGE) { stop(); record('P12'); return; }
      const doc = win.document;
      const button = doc.querySelector('#goInGameBtn');
      const item = doc.querySelector('.game-item[gid="1100"]');
      // Never select a game, dismiss real-name/consent dialogs, or retry login.
      // Wait for the portal's existing SSO flow and normal OL selection.
      if (!button || button.getAttribute('gid') !== '1100' || button.disabled
        || typeof button.onclick !== 'function' || !visible(button) || !visible(item)
        || !['0', '1'].includes(item.getAttribute('status'))
        || !win.$$sgsPassApp || typeof win.$$sgsPassApp.makeTicket !== 'function') { record('P10'); return; }
      if (['#realNameAuth', '.under18', '#accInvalidStr'].some(s => visible(doc.querySelector(s)))) { record('P11'); return; }
      stop(); // Consume before clicking, even if the official request fails.
      record('P20');
      button.click();
    };
    timer = win.setInterval(tick, 250);
    win.addEventListener('pagehide', stop, { once: true });
    win.document.addEventListener('pointerdown', cancel, true);
    win.document.addEventListener('keydown', cancel, true);
    return true;
  }
  if (win.performance?.getEntriesByType?.('navigation')?.[0]?.type !== 'reload') {
    clear(); return false;
  }
  try {
    if (win.localStorage.getItem('sgstoolbox:refreshReentryEnabled') === 'false') return false;
    // Do not carry unknown embedded/partner channels through the official site.
    const params = new URLSearchParams(win.location.search);
    if (params.has('logout_url') || params.has('cmFlag')) return false;
    const client = params.get('client');
    if (client && !['1100', '110074', '210000'].includes(client)) return false;
    // A real new reload is a new user request, even if an earlier attempt left
    // a short-lived marker. Fresh game navigations above already break loops.
    win.sessionStorage.setItem(KEY, JSON.stringify({ version: 1, at: Date.now() }));
    record('R10');
    win.location.replace('https://web.sanguosha.com/login/index.html');
    return true;
  } catch { clear(); record('R11'); return false; }
}
