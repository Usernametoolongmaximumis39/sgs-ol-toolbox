import { withClassicPokerContext } from '../live/classic-context.js';
import { label } from './board.js';
import { playType } from './model.js';
import { escapeNativeText } from './native-opening.js';
import { HAND_MARKS, SEAT_MARKS } from './skill-states.js';

const BADGE_HEIGHT = 19;
const BADGE_GAP = 3;
const MAX_PENDING_VOICES = 4;
const MAX_VOICE_WAIT_MS = 6500;

export function handSkillMarks(states, name) {
  const marks = new Map();
  for (const mark of states) {
    const id = HAND_MARKS.get(mark.id);
    if (!id) continue;
    for (const cardId of mark.cards || []) {
      const labels = marks.get(cardId) || new Set();
      labels.add(name(id));
      marks.set(cardId, labels);
    }
  }
  return marks;
}

export function markHandCard(Laya, card, size, effects) {
  if (!effects?.size) return;
  const text = [...effects].join('·');
  const width = Math.min(size.width - 10, Math.max(32, text.length * 11 + 8));
  card.graphics.drawRect(5, size.height - 23, width, 17, '#382928');
  const tip = label(Laya, card, text, 5, size.height - 23, width, 17, { size: 11, color: '#ffd0ae', align: 'center' });
  tip.name = 'poker-forced-card';
}

function attachGeneralTip(win, scope, scene, seatUi, nativeSkill, live) {
  const manager = seatUi.otherTopManager;
  const mask = manager?.overMask;
  if (typeof mask?.toolTip !== 'function' || typeof manager.getTipGeneral !== 'function') return () => {};
  let key;
  let skillIds = [];
  let hasGeneral;
  const patchTip = original => function (...args) {
    const skills = skillIds.map(nativeSkill).filter(Boolean);
    if (!skills.length && !(live && hasGeneral)) return Reflect.apply(original, this, args);
    // Supply poker data during native rendering. Otherwise the classic seat's
    // ordinary skills (including derived skills with the same IDs) can leak in.
    const restore = scope.patch(manager, 'getTipGeneral', getGeneral => function (...args) {
      const general = Reflect.apply(getGeneral, this, args);
      return general && Object.create(general, { Skills: { value: skills } });
    });
    const seat = seatUi.Seat;
    const restoreDerived = live && typeof seat?.GetAllDerviceSkill === 'function'
      ? scope.patch(seat, 'GetAllDerviceSkill', () => () => []) : null;
    try {
      const render = () => Reflect.apply(original, this, args);
      const tip = live ? withClassicPokerContext(win, scene, render) : render();
      for (const row of tip?.skillItems || []) {
        if (!skills.includes(row.Skill)) continue;
        // The ordinary replay seat has no poker skill list for the native extra-skill badge.
        row.PlayerSeat = null;
        if (row.exSpell) row.exSpell.visible = false;
      }
      return tip;
    } finally { restoreDerived?.(); restore(); }
  };
  if (live && typeof manager.showGeneralTipHandler === 'function') {
    // Native interaction controls can rebind ToolTip to the portrait handler.
    // Patch the handler too, so leaving target selection doesn't undo poker tips.
    scope.patch(manager, 'showGeneralTipHandler', patchTip);
    scope.patch(mask, 'toolTip', () => (...args) => manager.showGeneralTipHandler(...args));
  } else scope.patch(mask, 'toolTip', patchTip);
  scope.add(() => mask.ClearToolTip?.());
  return seat => {
    const next = `${seat.id}/${seat.general}/${seat.skin}/${seat.skills.join(',')}`;
    if (next === key) return;
    key = next;
    skillIds = seat.skills;
    hasGeneral = Boolean(seat.general);
    mask.ClearToolTip?.();
  };
}

function voiceVolume(Laya, settings) {
  if (Laya.SoundManager.muted || Laya.SoundManager.soundMuted) return 0;
  const mobile = Laya.Browser?.onMobile;
  if (settings) {
    if (settings.MainClose || (mobile ? settings.OtherClose : settings.GeneralClose)) return 0;
    return Math.max(0, Math.min(100, settings.MainVol, mobile ? settings.OtherVol : settings.GeneralVol)) / 100;
  }
  const read = key => Laya.LocalStorage?.getItem?.(key);
  if (read('mainClose') === '1' || read('generalClose') === '1' || mobile && read('mobileOtherClose') === '1') return 0;
  const main = Number((mobile ? read('mobileMainVol') : read('mainVol')) ?? 100);
  const general = Number((mobile ? read('mobileOtherVol') : read('generalVol')) ?? 60);
  return Math.max(0, Math.min(100, main, general)) / 100;
}

export function attachNativeSkills(win, scope, scene, seats, names, soundSettings, pileWindow, live) {
  const { Laya } = win;
  const layer = new Laya.Sprite();
  layer.name = 'sgs-toolbox-poker-skill-states';
  layer.mouseThrough = true;
  layer.mouseEnabled = true;
  scene.addChild(layer);
  const badges = seats.map((_, index) => {
    const node = new Laya.Sprite();
    node.name = `sgs-poker-skill-seat-${index}`;
    node.mouseThrough = true;
    node.mouseEnabled = true;
    layer.addChild(node);
    return { root: node, nodes: new Map() };
  });
  const instances = new Map();
  const self = scene.SelfSeatUi;
  const slots = new Map();
  let previousSkillVisibility;
  const portraitTips = seats.map(seat => attachGeneralTip(win, scope, scene, seat, nativeSkill, live));
  const badgeFactory = seats.find(seat => !seat.Seat.IsSelf && typeof seat.updateSeatState === 'function'
    && typeof seat.seatStateDict?.get === 'function' && typeof seat.seatStateDict?.del === 'function');
  let keyboardButtons;
  let channel;
  const voiceQueue = [];
  const now = () => win.performance?.now?.() ?? Date.now();

  function nativeSkill(id) {
    if (instances.has(id)) return instances.get(id);
    const info = names.skillInfo(id);
    if (!info) return null;
    const base = Laya.ClassUtils.getClass('PokerSkill');
    const Skill = typeof info.className === 'function' ? info.className : Laya.ClassUtils.getClass(info.className) || base;
    if (!base || !(Skill === base || Skill.prototype instanceof base)) return null;
    try {
      const skill = new Skill();
      skill.ID = id;
      instances.set(id, skill);
      return skill;
    } catch { return null; }
  }

  function skillBadge(id, used) {
    const skill = nativeSkill(id);
    let limit;
    try { limit = skill?.TimeLimitGame; } catch {}
    if (Number.isSafeInteger(limit) && limit > 0) {
      const remaining = Math.max(0, limit - used);
      return { key: `skill-${id}`, id, skill, text: `${names.skill(id)}[${remaining}]`, exhausted: remaining === 0 };
    }
    return null;
  }

  function removeSelfSkill(id, { item, mouseEnabled, release }) {
    slots.delete(id);
    release?.();
    if (!self.skillItems.includes(item)) return;
    item.mouseEnabled = mouseEnabled;
    for (const list of [self.skillItems, self.selfSkillItems, self.extraSKillItems]) {
      const index = list.indexOf(item);
      if (index >= 0) list.splice(index, 1);
    }
    self.clearSkillItem(item);
  }

  function drawSelfSkills(state, seat) {
    if (typeof self.addSkillItem !== 'function' || typeof self.layoutSkillItems !== 'function'
        || typeof self.clearSkillItem !== 'function') return new Map();
    const skills = state.ended ? [] : seat.skills.map(nativeSkill).filter(Boolean);
    const ids = new Set(skills.map(skill => skill.ID));
    const hadSlots = slots.size > 0;
    const prior = [...slots.values()].filter(({ item }) => self.selfSkillItems.includes(item)).length;
    const originalCount = Math.max(0, self.zSkillCount - prior);
    if (skills.length && !hadSlots) previousSkillVisibility = self.skillVisible;
    if (skills.length) self.skillVisible = true;
    for (const [id, slot] of slots) {
      if (!ids.has(id) || !self.skillItems.includes(slot.item)) removeSelfSkill(id, slot);
    }
    let mounted = 0;
    const buttons = new Map();
    const actions = live ? new Map(state.skillActions.map(skill => [skill.id, skill])) : null;
    for (const skill of skills) {
      let item = slots.get(skill.ID)?.item;
      if (!item) {
        const count = self.skillItems.length;
        self.addSkillItem(skill);
        if (self.skillItems.length === count) continue;
        item = self.skillItems.at(-1);
        const slot = { item, mouseEnabled: item.mouseEnabled };
        slots.set(skill.ID, slot);
        if (live) {
          const name = item.name;
          const click = Laya.Event.CLICK;
          const stock = item.j;
          const invoke = () => { if (item.visible && item.Activated) live(skill.ID); };
          if (typeof stock === 'function') item.off(click, item, stock);
          item.name = `poker-live-skill-${skill.ID}`;
          item.on(click, slot, invoke);
          slot.release = () => {
            item.off(click, slot, invoke);
            if (typeof stock === 'function') item.on(click, item, stock);
            item.name = name;
          };
        }
      }
      if (self.selfSkillItems.includes(item)) mounted++;
      const choosing = state.skillChoice?.skill === skill.ID;
      const action = actions?.get(skill.ID);
      item.visible = true;
      item.Activated = live ? action?.enabled === true
        : choosing || Boolean(state.playPrompt && skill.IsActive && (seat.skillUses[skill.ID] || 0) < skill.TimeLimitGame);
      item.$(Boolean(!live && choosing && state.skillChoice.selected.length), true);
      item.mouseEnabled = Boolean(live);
      if (live && (self.selfSkillItems.includes(item) || self.extraSKillItems.includes(item))) buttons.set(skill.ID, item);
    }
    self.zSkillCount = originalCount + mounted;
    if (!slots.size && hadSlots) self.skillVisible = previousSkillVisibility;
    if (hadSlots || slots.size) self.layoutSkillItems();
    return buttons;
  }

  function statusBadge(mark) {
    const spec = SEAT_MARKS.get(mark.id);
    if (!spec) return null;
    const values = mark.parameters || [];
    if (spec.parameters && (!values.length || !values[0])) return null;
    const name = names.skill(spec.skill);
    const item = { key: `status-${mark.id}`, id: mark.id, skill: nativeSkill(spec.skill), text: name + (spec.suffix || '') };
    if (spec.parameters === 'count') item.text = `${name}[${values[0]}]`;
    if (spec.parameters === 'progress') item.text = `${name} ${values[0]}/2`;
    if (spec.parameters === 'types') {
      const types = [...new Set(values.map(value => playType(value, 1)))];
      item.text = `${name} · ${types.length}种`;
      item.detail = `已记录牌型 ${types.join('、')}`;
    }
    return item;
  }

  function badgeTip(item) {
    const description = item.skill?.GetSkillSimplaDescribeInSkillItem?.() || '';
    return [
      `<font color="#ffdf8b">${escapeNativeText(item.text)}</font>`,
      description,
      item.detail && escapeNativeText(item.detail),
    ].filter(Boolean).join('<br/>');
  }

  function pileBadge(seat, pile) {
    const name = pile.skill === 47 ? '权' : pile.skill ? names.skill(pile.skill) : '技能区';
    const mark = seat.skillStates.find(entry => SEAT_MARKS.get(entry.id)?.skill === pile.skill);
    return {
      key: `pile-${seat.id}-${pile.skill}`, id: pile.skill, skill: nativeSkill(pile.skill),
      owner: seat.id, text: `${name}[${pile.cards.length}]`, detail: mark ? statusBadge(mark)?.detail : undefined,
    };
  }

  function createBadge(root, item) {
    const data = { ID: item.id, NeedLayout: true, Opened: true, ShowText: escapeNativeText(item.text) };
    const interactive = typeof item.owner === 'number' && pileWindow.available;
    if (interactive) data.NeedOperate = true;
    // Borrow the native seat status control without retaining an entry in the seat's state list.
    badgeFactory?.updateSeatState(data);
    const native = badgeFactory?.seatStateDict.get(data);
    if (native) {
      badgeFactory.seatStateDict.del(data);
      if (!interactive) native.offAll(Laya.Event.CLICK);
      root.addChild(native);
    }
    const node = native || label(Laya, root, item.text, 0, 0, 42, BADGE_HEIGHT, { size: 12, color: '#ffefad', align: 'center' });
    let button, focusRing;
    node.name = interactive ? 'sgs-poker-skill-pile-button' : 'sgs-poker-readonly-skill-state';
    if (interactive) {
      data.ClickCallback = () => {
        const hint = node.ToolTip;
        if (hint) {
          node.ToolTip = null;
          node.ToolTip = hint;
        }
        pileWindow.open(item.owner, item.id);
      };
      node.pokerPileSkill = item.id;
      node.pokerPileSeat = item.owner;
      if (!native) {
        node.mouseEnabled = true;
        node.on(Laya.Event.CLICK, node, data.ClickCallback);
      }
      if (!keyboardButtons) {
        keyboardButtons = win.document.createElement('div');
        keyboardButtons.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);pointer-events:none';
        win.document.body.append(keyboardButtons);
        scope.add(() => keyboardButtons.remove());
      }
      button = win.document.createElement('button');
      button.type = 'button';
      button.dataset.sgsPokerSkillPile = `${item.owner}/${item.id}`;
      focusRing = new Laya.Sprite();
      focusRing.mouseEnabled = false;
      node.addChild(focusRing);
      button.addEventListener('click', data.ClickCallback);
      button.addEventListener('focus', () => focusRing.graphics.drawRect(-1, -1, node.width + 2, node.height + 2, null, '#f9dc9b', 2));
      button.addEventListener('blur', () => focusRing.graphics.clear());
      keyboardButtons.append(button);
    }
    return { node, data, button, native: Boolean(native) };
  }

  function removeBadge(badge) {
    badge.button?.remove();
    if (badge.native) badge.node.ToolTip = null;
    badge.node.destroy(true);
  }

  function draw(state, seatOrder) {
    const buttons = drawSelfSkills(state, state.seats.find(item => item.id === seatOrder[0]));
    badges.forEach(({ root, nodes }, index) => {
      const seat = state.seats.find(item => item.id === seatOrder[index]);
      const seatUi = seats[index];
      const avatar = seatUi.seatAvatar;
      portraitTips[index](seat);
      root.graphics.clear();
      const showBadges = avatar && seat.general && !state.ended;
      const pileSkills = new Set(seat.skillPiles.map(pile => pile.skill));
      const items = showBadges ? [
        ...seat.skillPiles.map(pile => pileBadge(seat, pile)),
        ...seat.skillStates.filter(mark => !pileSkills.has(SEAT_MARKS.get(mark.id)?.skill)).map(statusBadge),
        ...seat.skills.map(id => skillBadge(id, seat.skillUses[id] || 0)),
      ].filter(Boolean) : [];
      const visible = new Set(items.map(item => item.key));
      for (const [id, badge] of nodes) {
        if (visible.has(id)) continue;
        removeBadge(badge);
        nodes.delete(id);
      }
      if (!items.length) return;
      const position = layer.globalToLocal(avatar.localToGlobal(new Laya.Point(0, 0)));
      const zoom = seatUi.seatScale || avatar.scaleX || 1;
      const insetX = Math.round(20 * zoom), insetY = Math.round(25 * zoom);
      const width = Math.max(1, seatUi.ScaledWidth - insetX - 8);
      const fromBottom = index === 0;
      const bottomInset = fromBottom ? Math.round(7 * zoom) : 10;
      const heightLimit = seatUi.ScaledHeight - insetY - bottomInset;
      root.pos(position.x + insetX, position.y + (fromBottom ? seatUi.ScaledHeight - bottomInset : insetY));
      let offset = 0;
      for (const item of items) {
        let badge = nodes.get(item.key);
        if (!badge) {
          badge = createBadge(root, item);
          nodes.set(item.key, badge);
        }
        const { node, data } = badge;
        if (badge.text !== item.text || badge.skill !== item.skill || badge.detail !== item.detail) {
          badge.text = item.text;
          badge.skill = item.skill;
          badge.detail = item.detail;
          data.ShowText = escapeNativeText(item.text);
          if (badge.native) {
            node.SetSeatState(seatUi.Seat, data);
            node.ToolTip = badgeTip(item);
          } else node.text = item.text;
        }
        if (!badge.native) node.width = Math.max(42, node.textWidth + 12);
        const scale = Math.min(1, width / node.width);
        node.scale(scale, scale);
        node.alpha = item.exhausted ? .65 : 1;
        const height = node.height * scale;
        node.visible = offset + height <= heightLimit;
        if (badge.button) {
          badge.button.hidden = !node.visible;
          const text = `查看${seatUi.Seat.General?.CardName || names.general(seat.general)}的${item.text}`;
          if (badge.button.textContent !== text) badge.button.textContent = text;
        }
        if (!node.visible) continue;
        const y = fromBottom ? -offset - height : offset;
        node.pos(0, y);
        if (!badge.native) root.graphics.drawRect(0, y, node.width * scale, height, '#211b17df');
        offset += height + BADGE_GAP;
      }
    });
    return buttons;
  }

  function clearVoice() {
    const current = channel;
    channel = null;
    if (!current) return;
    current.pause();
    current.removeAttribute('src');
    current.load();
  }

  function stopVoice() {
    voiceQueue.length = 0;
    clearVoice();
  }

  function playNextVoice() {
    if (channel) return;
    while (voiceQueue.length) {
      const { url, expires } = voiceQueue.shift();
      if (expires < now()) continue;
      const volume = voiceVolume(Laya, soundSettings);
      if (!(volume > 0)) { stopVoice(); return; }
      try {
        const audio = new win.Audio(url);
        audio.dataset.sgsPokerVoice = '';
        audio.volume = volume;
        channel = audio;
        const advance = () => {
          if (channel !== audio) return;
          clearVoice();
          playNextVoice();
        };
        audio.addEventListener('ended', advance, { once: true });
        audio.addEventListener('error', advance, { once: true });
        try { void audio.play()?.catch(advance); }
        catch { advance(); }
        return;
      } catch { clearVoice(); }
    }
  }

  function playVoice(action, slots) {
    if (typeof win.Audio !== 'function' || !(voiceVolume(Laya, soundSettings) > 0)) return;
    const actor = seats[slots.indexOf(action.seat)]?.Seat;
    const skill = nativeSkill(action.skill);
    if (!actor || !skill) return;
    try {
      const general = action.general || actor.GeneralId;
      const url = skill.getSkillSoundUrl?.(general, action.skin, action.effect) || skill.GetSoundUrl?.(actor, 0, action.effect);
      if (!url) return;
      if (!live) stopVoice();
      if (voiceQueue.length === MAX_PENDING_VOICES) voiceQueue.shift();
      voiceQueue.push({ url, expires: now() + MAX_VOICE_WAIT_MS });
      playNextVoice();
    } catch { /* The skill may have no sound for this general or skin. */ }
  }

  function previewGeneral(seat, general, ids, slots) {
    const skills = ids.filter(id => nativeSkill(id));
    if (skills.length) {
      stopVoice();
      playVoice({ seat, general, skin: 0, skill: skills[Math.floor(Math.random() * skills.length)] }, slots);
    }
  }

  scope.interval(() => {
    if (!channel) return;
    const volume = voiceVolume(Laya, soundSettings);
    if (volume > 0) channel.volume = volume;
    else stopVoice();
  }, 100);
  scope.add(() => {
    stopVoice();
    if (slots.size && !self.destroyed) {
      const count = [...slots.values()].filter(({ item }) => self.selfSkillItems.includes(item)).length;
      for (const [id, slot] of slots) removeSelfSkill(id, slot);
      self.zSkillCount = Math.max(0, self.zSkillCount - count);
      self.skillVisible = previousSkillVisibility;
      self.layoutSkillItems();
    }
    if (layer.destroyed) return;
    for (const { nodes } of badges) for (const badge of nodes.values()) removeBadge(badge);
    layer.destroy(true);
  });
  return { draw, playVoice, previewGeneral, stopVoice };
}
