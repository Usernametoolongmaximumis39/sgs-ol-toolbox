export function registerGoldCardStyles(ctx) {
  ctx.cardStyles.register({ id: 'card-styles-extra.gold', name: '金色卡牌',
    face: { base: '#d5b16b', light: '#fff0c9', edge: '#8b652c', ink: '#30251a' },
    back: { base: '#cda65b', light: '#ffe5a4', edge: '#8b652c', ink: '#29241d' },
  });
}
