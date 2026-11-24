export const pluginQuality = {
  "social": {
    "docs": [
      "docs/social.md"
    ],
    "tests": [
      "tests/social-friends.test.js",
      "tests/social-chat.test.js",
      "tests/social-panel.test.js",
      "tests/social-lamps.test.js"
    ],
    "browser": [
      "tools/browser-social-check.mjs",
      "tools/browser-social-menu-check.mjs",
      "tools/browser-social-lamps-check.mjs",
      "tools/browser-social-missing-check.mjs"
    ]
  },
  "player-info": {
    "docs": [
      "docs/player-info.md"
    ],
    "tests": [
      "tests/player-info.test.js",
      "tests/player-stats.test.js",
      "tests/player-lamps.test.js",
      "tests/player-manual-lamps.test.js"
    ],
    "browser": [
      "tools/browser-player-info-check.mjs",
      "tools/browser-player-info-native-check.mjs",
      "tools/browser-player-stats-check.mjs",
      "tools/browser-player-lamps-check.mjs",
      "tools/browser-player-settings-check.mjs"
    ]
  },
  "native-cards": {
    "docs": [
      "docs/card-styles.md"
    ],
    "tests": [
      "tests/card-styles.test.js"
    ],
    "browser": [
      "tools/browser-card-styles-check.mjs"
    ]
  },
  "gold-cards": {
    "docs": [
      "docs/card-styles.md"
    ],
    "tests": [
      "tests/card-styles.test.js"
    ],
    "browser": [
      "tools/browser-card-styles-check.mjs"
    ]
  },
  "yjcm-cards": {
    "docs": [
      "docs/yjcm-cards.md"
    ],
    "tests": [
      "tests/card-atlas.test.js"
    ],
    "browser": [
      "tools/browser-yjcm-cards-check.mjs"
    ]
  },
  "dafeiyu-cards": {
    "docs": [
      "docs/dafeiyu-cards.md"
    ],
    "tests": [
      "tests/dafeiyu-cards.test.js"
    ],
    "browser": [
      "tools/browser-card-dafeiyu-check.mjs"
    ]
  },
  "backgrounds": {
    "docs": [
      "docs/backgrounds.md"
    ],
    "tests": [
      "tests/backgrounds.test.js",
      "tests/backgrounds-ui.test.js"
    ],
    "browser": [
      "tools/browser-backgrounds-check.mjs",
      "tools/browser-background-history-check.mjs"
    ]
  },
  "cards": {
    "docs": [
      "src/plugins/cards/覆盖说明.md"
    ],
    "tests": [
      "tests/cards-model.test.js",
      "tests/cards-ui.test.js",
      "tests/card-skill-counts.test.js",
      "tests/cards-skill-pile.test.js",
      "tests/hand-groups.test.js",
      "tests/cards-legacy-core.test.js",
      "tests/cards-legacy-reveals.test.js",
      "tests/cards-legacy-moves.test.js",
      "tests/cards-legacy-moves-integration.test.js",
      "tests/cards-skill-hints.test.js"
    ],
    "browser": [
      "tools/browser-card-native-check.mjs",
      "tools/browser-card-seat-check.mjs",
      "tools/browser-hand-sort-order-check.mjs",
      "tools/browser-card-skill-pile-check.mjs",
      "tools/browser-hand-groups-check.mjs",
      "tools/browser-card-legacy-check.mjs"
    ]
  },
  "play-assist": {
    "docs": [
      "docs/play-assist.md"
    ],
    "tests": [
      "tests/play-assist-runtime.test.js"
    ],
    "browser": [
      "tools/browser-play-assist-check.mjs",
      "tools/browser-play-assist-native-check.mjs",
      "tools/browser-play-assist-expansion-check.mjs"
    ]
  },
  "daily-rewards": {
    "docs": [
      "docs/daily-rewards.md",
      "docs/兑换码服务.md",
      "docs/redeem-server.md"
    ],
    "tests": [
      "tests/daily-exchange.test.js",
      "tests/daily-rewards.test.js",
      "tests/daily-free-welfare.test.js",
      "tests/daily-code-sources.test.js",
      "tests/daily-codes.test.js",
      "tests/redeem-direct.test.js"
    ],
    "browser": [
      "tools/browser-daily-exchange-check.mjs",
      "tools/browser-reward-issues-check.mjs",
      "tools/browser-free-gift-check.mjs",
      "tools/browser-reward-clipboard-check.mjs",
      "tools/browser-redeem-direct-check.mjs"
    ]
  },
  "seckill": {
    "docs": [
      "docs/seckill.md"
    ],
    "tests": [
      "tests/seckill.test.js",
      "tests/seckill-native.test.js"
    ],
    "browser": [
      "tools/browser-seckill-check.mjs"
    ]
  },
  "gaizhu": {
    "docs": [
      "docs/gaizhu.md"
    ],
    "tests": [
      "tests/gaizhu.test.js",
      "tests/gaizhu-assistant.test.js",
      "tests/gaizhu-guards.test.js",
      "tests/gaizhu-client-flow.test.js"
    ],
    "browser": [
      "tools/browser-gaizhu-check.mjs"
    ]
  },
  "effects": {
    "docs": [
      "docs/effects.md"
    ],
    "tests": [
      "tests/effects.test.js"
    ],
    "browser": [
      "tools/effects-render-check.mjs"
    ]
  },
  "skins": {
    "docs": [
      "docs/skins.md"
    ],
    "tests": [
      "tests/skins.test.js",
      "tests/skins-native-model.test.js",
      "tests/mobile-cloud.test.js",
      "tests/mobile-skin-names.test.js",
      "tests/mobile-config-bootstrap.test.js",
      "tests/mobile-config-data.test.js",
      "tests/mobile-config-rebuild.test.js"
    ],
    "browser": [
      "tools/browser-skins-native-check.mjs",
      "tools/browser-yjcm-skin-effects-check.mjs",
      "tools/browser-mobile-skin-bridge-check.mjs",
      "tools/browser-mobile-motion-check.mjs",
      "tools/browser-mobile-seat-layout-check.mjs",
      "tools/browser-skin-picker-viewport-check.mjs"
    ]
  },
  "poker-lobby": {
    "docs": [
      "docs/poker-lobby.md"
    ],
    "tests": [
      "tests/poker-lobby.test.js",
      "tests/poker-lobby-native.test.js",
      "tests/poker-lobby-activity.test.js",
      "tests/poker-lobby-streak.test.js",
      "tests/poker-replay.test.js",
      "tests/poker-interactions.test.js",
      "tests/poker-play-audio.test.js",
      "tests/poker-live-table.test.js",
      "tests/poker-live-transport.test.js",
      "tests/poker-live-skill-actions.test.js"
    ],
    "browser": []
  },
  "stargazing": {
    "docs": [
      "docs/stargazing.md"
    ],
    "tests": [
      "tests/stargazing.test.js",
      "tests/mobile-skin-bridge.test.js"
    ],
    "browser": [
      "tools/browser-stargazing-check.mjs",
      "tools/browser-mobile-skin-bridge-check.mjs"
    ]
  },
  "wish-progress": {
    "docs": [
      "docs/wish-progress.md"
    ],
    "tests": [
      "tests/info-plugins.test.js"
    ],
    "browser": [
      "tools/browser-wish-progress-check.mjs"
    ]
  },
  "shanhetu": {
    "docs": [
      "docs/shanhetu-placement-v2.md"
    ],
    "tests": [
      "tests/shanhetu.test.js",
      "tests/shanhetu-placement-v2.test.js",
      "tests/shanhetu-extra.test.js"
    ],
    "browser": [
      "tools/browser-shanhetu-placement-v2-check.mjs",
      "tools/browser-shanhetu-extra-check.mjs"
    ]
  },
  "shanhetu-beta": {
    "docs": [
      "docs/shanhetu-placement-v2.md"
    ],
    "tests": [
      "tests/shanhetu-extra.test.js"
    ],
    "browser": [
      "tools/browser-shanhetu-extra-check.mjs"
    ]
  },
  "themes": {
    "docs": [
      "docs/themes.md"
    ],
    "tests": [
      "tests/themes.test.js"
    ],
    "browser": [
      "tools/browser-themes-check.mjs"
    ]
  },
  "baisheng": {
    "docs": [
      "docs/info-plugins.md"
    ],
    "tests": [
      "tests/info-plugins.test.js",
      "tests/baisheng-export.test.js"
    ],
    "browser": [
      "tools/browser-info-check.mjs"
    ]
  },
  "appearances": {
    "docs": [
      "docs/info-plugins.md"
    ],
    "tests": [
      "tests/info-plugins.test.js",
      "tests/appearance-mode-evidence.test.js",
      "tests/appearance-history.test.js",
      "tests/appearance-sync.test.js"
    ],
    "browser": [
      "tools/browser-info-check.mjs"
    ]
  },
  "ledger": {
    "docs": [
      "docs/ledger.md"
    ],
    "tests": [
      "tests/ledger.test.js",
      "tests/ledger-bag.test.js",
      "tests/ledger-sync.test.js"
    ],
    "browser": [
      "tools/browser-ledger-check.mjs",
      "tools/browser-ledger-bag-check.mjs",
      "tools/browser-ledger-sync-check.mjs",
      "tools/microclient-ledger-alert-check.mjs"
    ]
  },
  "recharge": {
    "docs": [
      "docs/recharge.md"
    ],
    "tests": [
      "tests/recharge.test.js"
    ],
    "browser": [
      "tools/browser-recharge-check.mjs"
    ]
  }
};
