export const manifest = {
  id: 'native-cards', name: '官方卡牌', version: '0.1.0', apiVersion: 1, contractVersion: 1,
  minCoreVersion: '0.5.95', categories: [], icon: 'cards', priority: 50090,
  description: '复用官方经典与大将军两套卡面卡背，在设置中成套选用',
};
export function activate(ctx) {
  ctx.cardStyles.register({ id: 'native-cards.classic', name: '官方经典',
    native: { face: 'cardFace_0', back: 'cardBack_0' } });
  ctx.cardStyles.register({ id: 'native-cards.general', name: '官方大将军',
    native: { face: 'cardFace_10', back: 'cardBack_5' } });
}
export default { manifest, activate };
