export const manifest = {
  id: 'gold-cards', name: '金色卡牌', version: '0.1.0', apiVersion: 1, contractVersion: 1,
  minCoreVersion: '0.5.90', categories: [], icon: 'cards', priority: 50100,
  description: '金色卡面底纹与玄金卡背，在设置的卡面与卡背中成套选用',
};
export function activate(ctx) {
  ctx.cardStyles.register({ id: 'gold-cards.classic', name: '金色卡牌',
    face: { base: '#d5b16b', light: '#fff0c9', edge: '#8b652c', ink: '#30251a' },
    back: { base: '#cda65b', light: '#ffe5a4', edge: '#8b652c', ink: '#29241d' },
  });
}
export default { manifest, activate };
