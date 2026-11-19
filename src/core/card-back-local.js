import { isLocalCardImageUrl, localImageTransaction, readLocalCardImage } from './local-images.js';

export const LOCAL_BACK_PREFIX = 'local-card-back.';
// Four pixels per game unit, with the exact 93:130 card-back ratio.
export const LOCAL_BACK_WIDTH = 372;
export const LOCAL_BACK_HEIGHT = 520;

export function readLocalCardBack(win, file) {
  return readLocalCardImage(win, file, LOCAL_BACK_WIDTH, LOCAL_BACK_HEIGHT);
}

export function localCardBackTransaction(win, mode, operation) {
  return localImageTransaction(win, 'sgs-toolbox-card-backs', mode, operation, 'id');
}

export function localCardBack({ id, name, url }) {
  if (!Number.isSafeInteger(id) || id <= 0 || typeof name !== 'string' || !isLocalCardImageUrl(url)) return null;
  return Object.freeze({ id: LOCAL_BACK_PREFIX + id, name, localBackImage: url });
}
