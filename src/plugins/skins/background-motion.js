import { skinVoiceFormKey } from './cross-voice.js';
import { loadMobileMotion } from './mobile-effects.js';
import { loadYjcmBackgroundMotion } from './yjcm-motion.js';

export function registerSkinBackgroundMotion(ctx, local) {
  ctx.backgrounds?.registerSkinMotion?.(async (key, signal) => {
    const [kind, general, id, form] = JSON.parse(key);
    if (kind !== 'cross' && kind !== 'mobile') return;
    if (signal.aborted || ctx.window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const source = kind === 'mobile' ? local.mobile : local.yjcm;
    const catalogue = source.current ?? await source.load();
    if (signal.aborted) return;
    const skin = catalogue.findSkin(id, general);
    if (!skin) return;
    const entry = catalogue.skinForms(skin).find((entry, index) => skinVoiceFormKey(entry, index + 1) === form);
    if (entry?.mobileMotion) {
      const motion = await loadMobileMotion(ctx.window, entry, signal);
      if (motion) return { ...motion, fit: motion.fitBackground };
    } else if (entry?.motion) {
      return loadYjcmBackgroundMotion(ctx.window, entry.motion, signal);
    }
  });
}
