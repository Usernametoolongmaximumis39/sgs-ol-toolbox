// Shared window lifecycle matches the client's Bqi/Wjt inheritance pattern:
// showHandler creates the modal, then enterWindow registers listeners. Ads
// finish their own initialization after super.enterWindow returns.
export function windowFixture(paint = () => {}) {
  const opened = new Set(), trace = [];
  class BaseWindow {
    constructor(name) {
      this.name = name; this.visible = false; this.alpha = 1; this.parent = null;
      this.modalBg = { visible: false, parent: null }; this.closed = 0; this.clicks = 0;
    }
    showHandler() {
      this.parent = opened; this.modalBg.parent = opened; this.modalBg.visible = true;
      this.visible = true; opened.add(this); trace.push(`${this.name}:show`); paint();
    }
    enterWindow(...args) {
      this.showHandler(); this.eventsAdded = true;
      this.UpdateWindow(...args); trace.push(`${this.name}:ready`); return this.name;
    }
    UpdateWindow(...args) { this.args = args; return 'updated'; }
    Close() {
      this.closed++; this.eventsAdded = false; this.visible = false; this.parent = null;
      this.modalBg.visible = false; this.modalBg.parent = null; opened.delete(this);
      trace.push(`${this.name}:close`); paint();
    }
    click() { if (this.parent && this.visible && this.eventsAdded) this.clicks++; return this.clicks; }
    laterClose() { return this.Close(); }
  }
  class AdWindow extends BaseWindow {
    constructor() { super('AdPushWindow'); }
    enterWindow(...args) { super.enterWindow(...args); this.adInitialized = true; return 'ad-ready'; }
    Close() { this.closedAfterInit = this.adInitialized === true && this.eventsAdded === true; super.Close(); }
  }
  class VersionWindow extends BaseWindow { constructor() { super('VersionNoticeWindow'); } }
  class ResultWindow extends BaseWindow { constructor() { super('GameMvpWindow'); } }
  class PackageWindow extends BaseWindow { constructor() { super('GeneralOpenResultWindow'); } }
  class StoryWindow extends BaseWindow { constructor() { super('RogueChapterStoryWindow'); } }
  class ProbWindow extends BaseWindow { constructor() { super('GetNewGeneralWindow'); } }
  class ShopWindow extends BaseWindow { constructor() { super('ShopWindow'); } }
  class BagWindow extends BaseWindow { constructor() { super('BagWindow'); } }
  class MailWindow extends BaseWindow { constructor() { super('MailWindow'); } }
  const classes = { AdPushWindow: AdWindow, VersionNoticeWindow: VersionWindow, GameMvpWindow: ResultWindow,
    GeneralOpenResultWindow: PackageWindow, RogueChapterStoryWindow: StoryWindow, GetNewGeneralWindow: ProbWindow,
    ShopWindow, BagWindow, MailWindow };
  return { classes, BaseWindow, opened, trace };
}

export function recruitViewFixture(onResult = () => {}) {
  class RecruitView {
    showOpenEffect(...args) {
      const effect = {
        alpha: 1, EffectUrl: 'res/assets/animate/hall/generalopen/zhaomuchaibao02.sk',
        reveal: () => onResult(...args),
        stop: () => { effect.destroyed = true; this.zhaoMuEffect = null; },
      };
      this.zhaoMuEffect = effect;
      return effect;
    }
  }
  return { GeneralOpenWindow: class extends RecruitView {}, GeneralOpenNewbieView: class extends RecruitView {}, RecruitView };
}
