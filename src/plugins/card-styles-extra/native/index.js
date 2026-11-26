export function registerNativeCardStyles(ctx) {
  ctx.cardStyles.register({ id: 'card-styles-extra.native-classic', name: '官方经典',
    native: { face: 'cardFace_0', back: 'cardBack_0' } });
  ctx.cardStyles.register({ id: 'card-styles-extra.native-general', name: '官方大将军',
    native: { face: 'cardFace_10', back: 'cardBack_5' } });
}
