import { installPoolControls } from './search.js';
import { attachSchemeHud } from './hud.js';

export function createGeneralPoolControls(ctx) {
  const pending = new Map();
  installPoolControls(ctx, (laya, view) => attachSchemeHud(ctx, laya, view, pending));
}
