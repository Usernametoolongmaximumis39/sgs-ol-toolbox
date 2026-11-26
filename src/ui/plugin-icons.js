// Plugin identities travel with the manifest as contract-v1 path specs, so older
// cores can draw the same artwork without knowing any new public icon names.
const icon = (...paths) => Object.freeze({ paths: Object.freeze(paths) });

// Export each icon independently so a plugin package only carries its own paths.
export const CARDS_ICON = /* @__PURE__ */ icon(
  'M9 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z',
  'M4 5 2 6l2 14M14 7l3 5-3 5-3-5Z',
);

export const POKER_LOBBY_ICON = /* @__PURE__ */ icon(
  'M12 3C9.3 6.8 4 10.1 4 14.1a4.2 4.2 0 0 0 7.1 3c.4-.3.7-.8.9-1.2.2.4.5.9.9 1.2a4.2 4.2 0 0 0 7.1-3C20 10.1 14.7 6.8 12 3Z',
  'M12 16.5V21M8.5 21h7',
);

export const SHANHETU_ICON = /* @__PURE__ */ icon(
  'M3 5 9 3l6 2 6-2v16l-6 2-6-2-6 2Z',
  'M6 12 10 7l4 5 3-3 2 3',
  'M6 16c3-3 7 3 12-1',
);

export const SHANHETU_BETA_ICON = /* @__PURE__ */ icon(
  'M3 5 9 3l6 2 6-2v16l-6 2-6-2-6 2Z',
  'M12 7v8m-4-4h8',
);

export const PLAY_ASSIST_ICON = /* @__PURE__ */ icon(
  'M6.8 9.4a4.8 4.8 0 1 1 8.2 0',
  'M9.5 15V6.8a1.4 1.4 0 0 1 2.8 0V12',
  'M12.3 11.4a1.4 1.4 0 0 1 2.8 0V13m0-.8a1.4 1.4 0 0 1 2.8 0V15a5.8 5.8 0 0 1-5.8 5.8h-1.6a5.4 5.4 0 0 1-4.6-2.6l-1.9-3.2a1.4 1.4 0 0 1 2.3-1.6L9.5 15',
);

export const PLAYER_INFO_ICON = /* @__PURE__ */ icon(
  'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
  'M8.5 11.2a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8ZM5.5 16a3.1 3.1 0 0 1 6 0',
  'M14.5 9.5h4.5M14.5 12.8h4.5M14.5 16h3',
);

export const DAILY_REWARDS_ICON = /* @__PURE__ */ icon(
  'M3 8h18v4H3ZM5 12v9h14v-9M12 8v13',
  'M12 8H8a3 3 0 1 1 3-3ZM12 8h4a3 3 0 1 0-3-3Z',
);

export const SECKILL_ICON = /* @__PURE__ */ icon(
  'M5 7h14l2 14H3ZM8 7V5a4 4 0 0 1 8 0v2',
  'M13 10 9 15h3l-1 4 5-6h-4Z',
);

export const GAIZHU_ICON = /* @__PURE__ */ icon(
  'M4.5 11.5a7.5 7.5 0 0 1 13-5.1L19.5 8.5M19.5 4.2v4.3h-4.3',
  'M19.5 12.5a7.5 7.5 0 0 1-13 5.1L4.5 15.5M4.5 19.8v-4.3h4.3',
  'M10.4 9.6 14.8 12l-4.4 2.4Z',
);

export const EFFECTS_ICON = /* @__PURE__ */ icon(
  'M9 5 11 2l2.5 7.5L21 12l-4 1.5M14.5 16 12 22l-2.5-7.5L2 12l5-2',
  'M3 3 21 21M19 3v4M17 5h4',
);

export const SKINS_ICON = /* @__PURE__ */ icon(
  'M8 3 12 5l4-2 6 5-4 4-2-2v11H8V10l-2 2-4-4Z',
  'M8 3l8 9M16 3l-6 7M8 16h8',
);

export const SOCIAL_ICON = /* @__PURE__ */ icon(
  'M4 4h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-3.5 3v-3H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  'M16 9h4a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-.5v3L16 18h-5a2 2 0 0 1-2-2v-2',
  'M6 8.2h6M6 11h4',
);

export const STARGAZING_ICON = /* @__PURE__ */ icon(
  'M3.5 13.5 15.2 6l3 4.8-13 5.2Z',
  'M12 8.1l2.7 4.4',
  'M10.5 14 6.8 21M10.5 14 14.8 21M10.5 14v7',
  'M19.8 3v3M18.3 4.5h3',
);

export const RECHARGE_ICON = /* @__PURE__ */ icon(
  'M4 5h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
  'M8 3v4M16 3v4M2 10h20',
  'M7 14h2.5M14.5 14h2.5M7 17.5h2.5M14.5 17.5h2.5',
);

export const BACKGROUNDS_ICON = /* @__PURE__ */ icon(
  'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  'M2.5 16.5 8 11l4 4 3.2-3.2L21.5 17.5',
  'M15.5 8.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0',
);

export const CARD_STYLES_EXTRA_ICON = /* @__PURE__ */ icon(
  'M10.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4',
  'M6 6.5h8v3.5M6 6.5v11h4',
  'M20.5 10.5a1.6 1.6 0 0 1 0 2.3l-4.7 4.7-2.3-2.3 4.7-4.7a1.6 1.6 0 0 1 2.3 0Z',
  'M13.5 15.2c-1.5.5-2.1 1.7-2.5 3.3 1.8 0 3.3-.6 4.8-1',
);

export const WISH_PROGRESS_ICON = /* @__PURE__ */ icon(
  'M12 17 4.5 10a4.3 4.3 0 0 1 6-6L12 5.5 13.5 4a4.3 4.3 0 0 1 6 6Z',
  'M4 21h9M16 21h4',
);

export const THEMES_ICON = /* @__PURE__ */ icon(
  'M12 21 2 8a16 16 0 0 1 20 0Z',
  'M12 21 7 5.3M12 21V4.5M12 21 17 5.3',
  'M10 19a3 3 0 0 1 4 0',
);

export const THEMES_FLOW_ICON = /* @__PURE__ */ icon(
  'M12 3a9 9 0 1 0 0 18 2.2 2.2 0 0 0 2.2-2.2c0-.6-.2-1.1-.6-1.5a2.1 2.1 0 0 1 1.5-3.6h2.1A3.8 3.8 0 0 0 21 10c0-3.9-4-7-9-7Z',
  'M7.5 11.5a.9.9 0 1 0 0 .01M10 7.8a.9.9 0 1 0 0 .01M14.5 7.8a.9.9 0 1 0 0 .01',
);

export const BAISHENG_ICON = /* @__PURE__ */ icon(
  'M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v2a4 4 0 0 0 4 4M17 5h4v2a4 4 0 0 1-4 4',
  'M12 14v4M8 21v-3h8v3ZM12 6l2 2-2 2-2-2Z',
);

export const APPEARANCES_ICON = /* @__PURE__ */ icon(
  'M3 20h18',
  'M5 20v-4.5h3V20M10.5 20v-7.5h3V20M16 20v-10.5h3V20',
  'M5 10.5 10.5 6.5l3 2 5-4.5M15.5 4h3v3',
);

export const LEDGER_ICON = /* @__PURE__ */ icon(
  'M6 3h13a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM8 3v18',
  'M2 7h4M2 12h4M2 17h4M12 8h5M12 12h5M12 16h3',
);

export const PLUGIN_ICONS = /* @__PURE__ */ Object.freeze({
  cards: CARDS_ICON,
  'poker-lobby': POKER_LOBBY_ICON,
  shanhetu: SHANHETU_ICON,
  'shanhetu-beta': SHANHETU_BETA_ICON,
  'play-assist': PLAY_ASSIST_ICON,
  'player-info': PLAYER_INFO_ICON,
  'daily-rewards': DAILY_REWARDS_ICON,
  seckill: SECKILL_ICON,
  gaizhu: GAIZHU_ICON,
  effects: EFFECTS_ICON,
  skins: SKINS_ICON,
  social: SOCIAL_ICON,
  stargazing: STARGAZING_ICON,
  recharge: RECHARGE_ICON,
  backgrounds: BACKGROUNDS_ICON,
  'card-styles-extra': CARD_STYLES_EXTRA_ICON,
  'wish-progress': WISH_PROGRESS_ICON,
  themes: THEMES_ICON,
  'themes-flow': THEMES_FLOW_ICON,
  baisheng: BAISHENG_ICON,
  appearances: APPEARANCES_ICON,
  ledger: LEDGER_ICON,
});

// Toolbox identity is separate from the remaining-Slash counter's “杀” label.
export const TOOLBOX_ICON = /* @__PURE__ */ icon(
  'M3 7h18v13H3ZM8 7V4h8v3M3 12h6M15 12h6',
  'M12 9l3 3-3 3-3-3Z',
);
