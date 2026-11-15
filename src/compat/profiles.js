// Verified from local upstream releases 1.6.00–1.6.75 and fetched 1.6.76,
// 2026-11-13. See docs/compatibility.md for upstream artifact identity.
// Match the real fixed HUD root's id AND class. GMHCcZ6JV is an account field,
// not a root. Do not broaden these selectors to random ids or game containers.
export const OFFICIAL_ROOTS = Object.freeze([
  '#UVq89fEx20.wJoQac', '#fEZRuMF.LdZA6hJU', '#n3sLfVQse.pZ4fQufaff1g',
  '#EcyQUv1q.hGTMmkc8uVNU', '#Bbbi3Gz5.l39GxA', '#JiXfaf41Y.x7NIsLLG',
  '#ccGoxzAk8.z54FNOflZ8P', '#K99Umtv.ULaV6rnS29a', '#xNp6kWCguhN.NWKtWJt3Ax',
  '#vn30udbMfza9.DBpIuENA3Wq', '#Ky4VPPcGLqBX.Gtbe3Rwd7',
  '#L74jXNu.nhgNSx38Vs', '#KlUc6uX.T1xFwub0R77n',
  '#qVRsCBvCr.CDdibyZQ3X9',
]);

// https://xc.95chong.cn/downloads -> /downloads/sgs-xc.user.js, v1.0.51.
// Only extension-owned roots; #createIframe is deliberately NOT matched alone.
export const FORK_ROOTS = Object.freeze([
  '#xiaochao-app', '#xiaochao-dialog-host', '#xiaochao-toast-host',
  '#xiaochao-vue-seat-overlay', '.xiaochao-tooltip',
]);

// Own extension v2.6.8: these are UI roots, not its timers or automation state.
export const EXTENSION_ROOTS = Object.freeze([
  '#xc95Panel', '#xc95Zoom', '#xcExtDiagBadge', '#xcExtEmbedModal',
  '#xcExtBaiShengPanel', '#xcGz2Section', '#xcExtGzSection',
  '#xcExtSeckillAutoBuy',
]);

export const SOURCE_NAMES = Object.freeze({
  official: '原版小抄', fork95: '95chong 小抄', extension: '小抄的拓展',
  structural: '其他小抄界面', manual: '手动选定界面',
});
