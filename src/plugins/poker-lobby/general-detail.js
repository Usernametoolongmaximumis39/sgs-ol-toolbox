import { withPokerGeneralCard } from './poker-skills.js';

const WINDOW = 'SGSToolboxPokerGeneralInfoWindow';
const SKILL_VIEW = 'SGSToolboxPokerGeneralSkillView';
const VOICE_WINDOW = 'SGSToolboxPokerGeneralVoiceWindow';

export function installPokerGeneralDetails(ctx, scope, skillsFor) {
  const Laya = ctx.window.Laya;
  const click = Laya?.Event?.CLICK;
  const account = ctx.native.account().id;
  let detail, voices, registered = false;

  function register() {
    if (registered) return true;
    const classes = Laya?.ClassUtils;
    const registry = classes?._classMap;
    const NativeInfo = ctx.game.getClass('GeneralInfoWindow');
    const NativeSkills = ctx.game.getClass('GeneralInfoSkillView');
    const NativeVoice = ctx.game.getClass('GeneralVoiceWindow');
    const GeneralCard = ctx.game.getClass('GeneralCard');
    const Skill = ctx.game.getClass('Skill');
    if (!registry || !click || typeof classes.regClass !== 'function'
      || typeof NativeInfo?.prototype?.createViewStack !== 'function'
      || typeof NativeSkills?.prototype?.initSkillPanel !== 'function'
      || typeof GeneralCard?.GetInstance !== 'function' || typeof Skill?.GetInstance !== 'function'
      || registry[WINDOW] || registry[SKILL_VIEW] || registry[VOICE_WINDOW]) return false;

    function withSkillLookup(skills, render) {
      const byId = new Map(skills.map(skill => [Number(skill.ID), skill]));
      const restore = scope.patch(Skill, 'GetInstance', original => function (...args) {
        const skill = args.length === 1 && byId.get(Number(args[0]));
        if (skill) return skill;
        return Reflect.apply(original, this, args);
      });
      try { return render(); }
      finally { restore(); }
    }

    function withGeneralSkills(info, render) {
      const skills = skillsFor(info);
      return withPokerGeneralCard(scope, GeneralCard, Number(info?.ItemID) || 0, skills,
        () => withSkillLookup(skills, render));
    }

    const PokerVoiceWindow = typeof NativeVoice?.prototype?.enterWindow === 'function'
      ? class extends NativeVoice {
        constructor(...args) { super(...args); voices = this; }
        enterWindow(id, ...args) {
          const info = detail?.generalInfo;
          if (Number(info?.Id) !== Number(id)) return this.Close(true);
          return withGeneralSkills(info, () => super.enterWindow(id, ...args));
        }
        destroy(...args) {
          if (voices === this) voices = null;
          try { return super.destroy(...args); }
          finally { detail?.viewStack?.selectedChild?.skillInfoPanel?.refreshVoiceBtnNewTag?.(); }
        }
      } : null;

    class PokerSkillView extends NativeSkills {
      initSkillPanel() {
        // The native panel enumerates GeneralCard.Skills, then each stock row
        // resolves its ID again for the official label, markup and type badge.
        withGeneralSkills(this.generalInfo, () => super.initSkillPanel());
        const panel = this.skillInfoPanel;
        const button = panel?.voiceBtn;
        if (!PokerVoiceWindow || !button) return;
        button.off(click, panel, panel.onClickVoiceBtn);
        button.on(click, this, () => {
          ctx.game.getDispatcher()?.ShowWindowAfterCloseOther?.(VOICE_WINDOW, null,
            this.generalInfo.Id, this.gameMode, detail?.CurrentPreviewSkinId);
        });
      }
    }

    class PokerGeneralWindow extends NativeInfo {
      constructor(...args) { super(...args); detail = this; }
      createViewStack() {
        super.createViewStack();
        this.viewStack.childList = this.viewStack.childList.map(name => name === 'GeneralInfoSkillView' ? SKILL_VIEW : name);
      }
      playRandomSound() {}
      playSkillSound(id, ...args) {
        const skill = skillsFor(this.generalInfo).find(skill => Number(skill.ID) === Number(id));
        if (skill) return withSkillLookup([skill], () => super.playSkillSound(id, ...args));
      }
      destroy(...args) {
        if (detail === this) detail = null;
        return super.destroy(...args);
      }
    }

    classes.regClass(SKILL_VIEW, PokerSkillView);
    classes.regClass(WINDOW, PokerGeneralWindow);
    if (PokerVoiceWindow) classes.regClass(VOICE_WINDOW, PokerVoiceWindow);
    scope.add(() => {
      if (registry[WINDOW] === PokerGeneralWindow) delete registry[WINDOW];
      if (registry[SKILL_VIEW] === PokerSkillView) delete registry[SKILL_VIEW];
      if (registry[VOICE_WINDOW] === PokerVoiceWindow) delete registry[VOICE_WINDOW];
    });
    scope.add(() => { if (detail && !detail.destroyed) detail.Close(true); });
    scope.add(() => { if (voices && !voices.destroyed) voices.Remove(true); });
    registered = registry[WINDOW] === PokerGeneralWindow && registry[SKILL_VIEW] === PokerSkillView
      && (!PokerVoiceWindow || registry[VOICE_WINDOW] === PokerVoiceWindow);
    return registered;
  }

  function open(item) {
    const info = item.generalInfo;
    const id = Number(info?.ItemID ?? info?.Id);
    if (scope.closed || !account || account !== ctx.native.account().id || !Number.isSafeInteger(id) || id <= 0) return;
    try {
      if (!register()) throw new Error('缺少原生武将详情');
      const mode = info.GameModeExType || 1;
      if (detail && !detail.destroyed) detail.UpdateWindow(id, false, mode, null, 0, 0);
      else {
        const dispatcher = ctx.game.getDispatcher();
        if (typeof dispatcher?.ShowWindowAfterCloseOther !== 'function') throw new Error('缺少原生窗口入口');
        dispatcher.ShowWindowAfterCloseOther(WINDOW, null, id, false, mode, null, item.nickname);
      }
    } catch {
      ctx.notify('三国斗地主武将详情暂不可用，请稍后重试。');
    }
  }

  return item => {
    const stock = item?.onItemClick;
    if (!click || typeof stock !== 'function') return;
    const release = scope.patch(item, 'onItemClick', () => function () {
      if (item.CanClickItem !== false) open(item);
    });
    const handler = item.onItemClick;
    // Off-screen portraits bind onItemClick later, during their first draw.
    const button = item.topSp;
    if (button) {
      button.off(click, item, stock);
      button.on(click, item, handler);
    }
    return scope.add(() => {
      release();
      const control = item.topSp;
      if (item.destroyed || !control || control.destroyed) return;
      control.off(click, item, handler);
      control.on(click, item, item.onItemClick);
    });
  };
}
