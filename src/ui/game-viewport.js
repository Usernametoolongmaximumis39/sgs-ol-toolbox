// Let Laya resize its own canvas and input transform together. A CSS-only
// canvas scale would leave native pointer coordinates out of sync.
export function createGameViewport({ window: win, document: doc, scope, canReserve = () => true, sceneWatch }) {
  let requested = 0, reserved = 0, stage, original, wrapper, descriptor, appliedWidth = 0, appliedHeight = 0;
  let browser, widthDescriptor, widthGetter;
  const styles = new Map();
  function releaseBrowser() {
    if (browser && Object.getOwnPropertyDescriptor(browser, 'clientWidth')?.get === widthGetter) {
      if (widthDescriptor) Object.defineProperty(browser, 'clientWidth', widthDescriptor);
      else delete browser.clientWidth;
    }
    browser = widthDescriptor = widthGetter = undefined;
  }
  function syncBrowser() {
    const next = reserved ? win.Laya?.Browser : undefined;
    if (browser === next) return;
    releaseBrowser();
    if (!next) return;
    const own = Object.getOwnPropertyDescriptor(next, 'clientWidth');
    if (own && !own.configurable) return;
    browser = next; widthDescriptor = own;
    const readWidth = own?.get ? () => Reflect.apply(own.get, next, []) : () => win.innerWidth;
    widthGetter = () => Math.max(1, readWidth() - reserved);
    Object.defineProperty(browser, 'clientWidth', { configurable: true, enumerable: own?.enumerable ?? true, get: widthGetter });
    appliedWidth = -1;
  }
  function restoreStyles() {
    for (const [node, previous] of styles) {
      if (node.style.getPropertyValue('width') !== previous.applied) continue;
      if (previous.value) node.style.setProperty('width', previous.value, previous.priority);
      else node.style.removeProperty('width');
    }
    styles.clear();
  }
  function resize(target) {
    if (typeof target?.setScreenSize !== 'function') return;
    const ratio = Number(win.Laya?.Browser?.pixelRatio) || win.devicePixelRatio || 1;
    target.setScreenSize(win.innerWidth * ratio, win.innerHeight * ratio);
  }
  function releaseStage() {
    if (stage && stage.setScreenSize === wrapper) {
      if (descriptor) Object.defineProperty(stage, 'setScreenSize', descriptor);
      else delete stage.setScreenSize;
    }
    // A later owner may wrap our wrapper. Keep that owner, but still request
    // the full viewport; the captured wrapper now observes reserved === 0.
    resize(stage);
    stage = original = wrapper = undefined;
  }
  function sync() {
    reserved = requested && canReserve() ? requested : 0;
    const next = reserved ? win.Laya?.stage : undefined;
    const width = reserved ? Math.max(1, win.innerWidth - reserved) : 0;
    // Official stageResize recalculates SystemContext from Browser.clientWidth.
    // Updating only setScreenSize leaves the scene using the full window width.
    syncBrowser();
    if (!reserved) restoreStyles();
    if (stage !== next) {
      releaseStage();
      if (typeof next?.setScreenSize === 'function') {
        stage = next; original = stage.setScreenSize;
        descriptor = Object.getOwnPropertyDescriptor(stage, 'setScreenSize');
        const nativeResize = original;
        wrapper = function (screenWidth, screenHeight, ...args) {
          const ratio = Number(win.Laya?.Browser?.pixelRatio) || win.devicePixelRatio || 1;
          const limit = Math.max(1, win.innerWidth - reserved) * ratio;
          return Reflect.apply(nativeResize, this, [Math.min(screenWidth, limit), screenHeight, ...args]);
        };
        stage.setScreenSize = wrapper;
        appliedWidth = -1;
      }
    }
    if (!reserved) { restoreStyles(); appliedWidth = 0; return; }
    for (const node of doc.querySelectorAll('#bgDiv,#layaContainer,#laya_container,#GameDiv')) {
      if (!styles.has(node)) styles.set(node, { value: node.style.getPropertyValue('width'), priority: node.style.getPropertyPriority('width') });
      const value = width + 'px';
      if (node.style.getPropertyValue('width') !== value || node.style.getPropertyPriority('width') !== 'important') {
        node.style.setProperty('width', value, 'important');
      }
      styles.get(node).applied = value;
    }
    if (width !== appliedWidth || win.innerHeight !== appliedHeight) {
      resize(stage);
      if (typeof win.SystemContext?.UpdateGameSize === 'function') {
        win.SystemContext.UpdateGameSize(width, win.Laya?.Browser?.clientHeight || win.innerHeight);
      }
      appliedWidth = width; appliedHeight = win.innerHeight;
    }
  }
  scope.listen(win, 'resize', sync);
  if (sceneWatch) scope.add(sceneWatch.watch(sync, 500, true));
  else scope.interval(sync, 500); // The game runtime may arrive after the HUD.
  scope.add(() => { reserved = 0; restoreStyles(); releaseBrowser(); releaseStage(); });
  return { reserve(width) { requested = Math.max(0, Number(width) || 0); sync(); } };
}
