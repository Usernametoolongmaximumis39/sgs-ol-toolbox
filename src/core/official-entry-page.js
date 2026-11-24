// The portal issues fresh entry credentials for these classic OL routes.
const GAME_PATH = /^\/220\/h5_2\/index(?:_\d+)?\.php$/;

export function officialEntryPage(win) {
  if (win.location.hostname !== 'web.sanguosha.com' || win.top !== win.self) return null;
  if (win.location.pathname === '/login/index.html') return 'portal';
  return GAME_PATH.test(win.location.pathname) ? 'game' : null;
}
