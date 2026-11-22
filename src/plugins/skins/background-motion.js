import { skinVoiceFormKey } from './cross-voice.js';
import { frameSkinBackground } from './background-framing.js';
import { loadMobileMotion } from './mobile-effects.js';
import { loadMobileArtwork } from './mobile-skins.js';
import { loadYjcmArtwork } from './yjcm.js';
import { loadYjcmBackgroundMotion } from './yjcm-motion.js';

async function backgroundReference(win, entry, signal, imageUrl) {
  let temporary;
  try {
    if (!imageUrl) {
      // Older cores do not pass the saved local image to the loader.
      const artwork = entry.mobileMotion ? loadMobileArtwork : loadYjcmArtwork;
      const blob = await artwork(win, entry, signal);
      if (!blob || signal.aborted) return;
      temporary = win.URL.createObjectURL(blob);
    }
    const image = new win.Image();
    image.src = imageUrl || temporary;
    await image.decode();
    return image;
  } finally {
    if (temporary) win.URL.revokeObjectURL(temporary);
  }
}

export function registerSkinBackgroundMotion(ctx, local) {
  ctx.backgrounds?.registerSkinMotion?.(async (key, signal, { imageUrl, quality } = {}) => {
    const [kind, general, id, form] = JSON.parse(key);
    if (kind !== 'cross' && kind !== 'mobile') return;
    if (signal.aborted || ctx.window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const source = kind === 'mobile' ? local.mobile : local.yjcm;
    const catalogue = source.current ?? await source.load();
    if (signal.aborted) return;
    const skin = catalogue.findSkin(id, general);
    if (!skin) return;
    const entry = catalogue.skinForms(skin).find((entry, index) => skinVoiceFormKey(entry, index + 1) === form);
    if (!(entry?.mobileMotion || entry?.motion)) return;
    const win = ctx.window;
    // Older cores keep the prior resolution behavior and expose no control.
    const backgroundQuality = quality ?? (entry.mobileMotion ? 'low' : 'high');
    const [loaded, reference] = await Promise.allSettled([
      entry.mobileMotion ? loadMobileMotion(win, entry, signal, backgroundQuality) : loadYjcmBackgroundMotion(win, entry.motion, signal, backgroundQuality),
      backgroundReference(win, entry, signal, imageUrl),
    ]);
    if (loaded.status === 'rejected') throw loaded.reason;
    const motion = loaded.value;
    if (!motion) return;
    try {
      if (signal.aborted) { motion.dispose(); return; }
      if (reference.status !== 'fulfilled' || !reference.value) throw new Error('横版构图参考不可用');
      const fit = frameSkinBackground(win, motion, reference.value, Boolean(imageUrl));
      if (!fit) throw new Error('此形态的动态画面无法可靠铺满');
      return { ...motion, fit };
    } catch (error) {
      motion.dispose();
      throw error;
    }
  }, { quality: true });
}
