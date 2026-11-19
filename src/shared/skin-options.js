export function advancedSkinOption(settings, key) {
  return settings.get('advanced', true) === true && settings.get(key, true) === true;
}
