import { ResourceScope } from '../../../core/resources.js';

const CHOOSE_WINDOW = 'SelectGeneralDdz2023Win';
const TEXT_TIP = 2;

export function escapeNativeText(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function replayPopupManager(scene) {
  return Object.values(scene.ged?._events || {}).flat().map(listener => listener?.caller)
    .find(caller => typeof caller?.GetWindowData === 'function' && typeof caller?.GetWindowByName === 'function');
}

export function attachOpening(win, scope, scene, live) {
  const click = win.Laya.Event.CLICK;
  const manager = replayPopupManager(scene);
  const nativeClass = name => manager && win.Laya.ClassUtils.getClass(name);
  let command;
  let rendered;
  let panel;
  let windowScope;
  let since = 0;
  const pokerCards = new WeakSet();
  const swaps = new WeakSet();
  const skinButtons = new WeakMap();
  let unavailableKey;

  function close() {
    try { if (panel && !panel.destroyed) panel.Close(); }
    finally {
      windowScope?.dispose();
      command = rendered = undefined;
      panel = undefined;
      windowScope = undefined;
    }
  }

  function makeCardsReadOnly() {
    for (const card of panel?.generalUis || []) {
      card.mouseEnabled = false;
      card.CanSwap = false;
      card.FreeSwap = false;
      if (card.sureBtn) {
        card.sureBtn.visible = false;
        card.sureBtn.mouseEnabled = false;
      }
      if (card.confirmSelectionImg) card.confirmSelectionImg.visible = false;
      if (card.seatContainer?.hpContainer) card.seatContainer.hpContainer.visible = false;
    }
  }

  function choose(card) {
    if (!live || !command || command.pending || !card || !command.candidates.includes(card.CardID)) return;
    if (command.chosen === card.CardID) {
      if (command.canConfirm) live.confirm();
    } else if (live.choose(card.CardID)) {
      live.preview(card.CardID, candidateSkills(card));
    }
  }

  function candidateSkills(card) {
    const offered = command?.skills.get(card.CardID);
    return offered?.length ? offered : card.Card?.cardInfo?.Skills ?? [];
  }

  function bindPokerCard(card) {
    if (pokerCards.has(card)) return;
    pokerCards.add(card);
    card.neeShowSp = false;
    windowScope.patch(card, 'showGeneralTipHandler', original => function (...args) {
      const general = this.theCard;
      if (!general) return;
      const skills = live.skillsFor(candidateSkills(this));
      this.theCard = Object.create(general, { Skills: { value: skills } });
      try { return Reflect.apply(original, this, args); }
      finally { this.theCard = general; }
    });
    if (card.Card) card.ToolTip = card.showGeneralTipHandler.bind(card);
  }

  function canSwap(card) {
    return live && command && !command.pending && command.replaceable.has(card.CardID) && live.canSwap(card.CardID);
  }

  function bindSwap(card) {
    const button = card.changeGeneralBtn;
    if (!button || swaps.has(button)) return;
    swaps.add(button);
    const stock = card.changeGeneralEvent;
    let lastUse = -Infinity;
    button.off(click, card, stock);
    button.name = `poker-live-swap-${card.SelectIndex}`;
    const invoke = event => {
      event?.stopPropagation?.();
      const now = win.performance.now();
      if (!canSwap(card) || now - lastUse < 1000) return;
      lastUse = now;
      live.withContext(() => {
        card.FreeSwap = false;
        stock.call(card, event);
      });
    };
    button.on(click, windowScope, invoke);
    windowScope.add(() => button.off(click, windowScope, invoke));
    windowScope.patch(card, 'buyHjcard', original => function (...args) {
      if (canSwap(card) && typeof original === 'function') live.withContext(() => original.apply(this, args));
    });
    return invoke;
  }

  function bindSkin(card) {
    const hasSkin = live.hasSkin(card.CardID);
    if (hasSkin != null) card.HasGeneralSkin = hasSkin;
    const button = card.hasGeneralSkinSign;
    if (!button?.visible) return;
    button.name = `poker-live-draft-skin-${card.CardID}`;
    button.mouseEnabled = true;
    button.ToolTip = '换肤';
    if (skinButtons.has(button)) return;
    const invoke = event => {
      event?.stopPropagation?.();
      if (button.visible && !command?.pending && command?.candidates.includes(card.CardID)) live.openSkin(card.CardID);
    };
    skinButtons.set(button, invoke);
    button.on(click, windowScope, invoke);
    windowScope.add(() => button.off(click, windowScope, invoke));
  }

  function refreshCandidates(candidates) {
    if (!panel?.generalUis?.length || candidates.length !== command.candidates.length) return false;
    const changes = [];
    for (const [index, id] of candidates.entries()) {
      const card = panel.generalUis[index];
      if (!card?.Card) return false;
      if (card.CardID === id) continue;
      const replacement = card.Card.constructor.GetInstance?.(id);
      if (replacement?.CardId !== id) return false;
      changes.push([card, replacement]);
    }
    panel.generalIdlist = candidates;
    for (const [card, replacement] of changes) {
      card.Card = replacement;
      card.ServerCanUse = card.CanSelect = true;
      card.filters = null;
    }
    return true;
  }

  function openSelection(candidates, seconds) {
    const Message = nativeClass('MsgGameDealCharacter');
    if (typeof Message?.prototype?.pbToOldProtocol !== 'function') return;
    if (typeof manager.GetWindow !== 'function' || manager.GetWindowData(CHOOSE_WINDOW)?.parent) return;
    panel = manager.GetWindow(CHOOSE_WINDOW, false);
    if (typeof panel?.ShowGenerals !== 'function') {
      panel = undefined;
      return;
    }
    windowScope = new ResourceScope();
    let clearCountdown;
    for (const name of ['onCheckSkin', 'onCountdownEnd', 'ShowSelectGeneralEffect',
      'refreshGeneralUIs', 'showGeneralRecommed', 'onRefreshShareGeneral', 'RespChangeGeneral']) {
      windowScope.patch(panel, name, () => () => {});
    }
    windowScope.patch(panel, 'onClickGeneralCard', () => event => {
      if (!live) return;
      const cards = panel?.generalUis || [];
      if (cards.includes(event)) { choose(event); return; }
      for (let target = event?.target; target && target !== panel; target = target.parent) {
        if (skinButtons.has(target)) return;
        if (cards.includes(target)) { choose(target); return; }
      }
    });
    windowScope.patch(panel, 'getMaxRateSpGeneral', () => () => 0);
    if (live && typeof panel.layout === 'function') {
      windowScope.patch(panel, 'layout', original => function (...args) {
        return live.withContext(() => Reflect.apply(original, this, args));
      });
    }
    if (live && typeof panel.layoutDdz2023BeforAdapter === 'function') {
      windowScope.patch(panel, 'layoutBeforAdapter', () => function () { this.layoutDdz2023BeforAdapter(); });
    }
    if (live) windowScope.patch(panel, 'mouseGeneralCardAction', () => () => {});
    windowScope.patch(panel, 'ShowGenerals', original => function (...args) {
      if (live) {
        const manager = this.manager;
        try {
          // The classic selector reads this field after laying out its cards.
          // Poker candidates and replacements already come from this table's offers.
          this.manager = { SPReplaceData: null };
          live.withContext(() => Reflect.apply(original, this, args));
          const timer = this.countdownTimer;
          if (timer) {
            timer.Stop();
            clearCountdown?.();
            clearCountdown = live.startCountdown(timer, command.countdown, windowScope);
            timer.visible = Boolean(clearCountdown);
          }
          drawPanel();
        } catch (error) {
          win.console?.warn('三国斗地主原生选将窗口', error);
          unavailableKey = command?.key;
          close();
          live.repaint();
        } finally {
          if (!this.destroyed) this.manager = manager;
        }
      } else {
        Reflect.apply(original, this, args);
        makeCardsReadOnly();
        this.countdownTimer?.Stop?.();
        if (this.countdownTimer) this.countdownTimer.visible = false;
      }
    });
    windowScope.patch(panel, 'aniEnd', original => function (...args) {
      Reflect.apply(original, this, args);
      if (live) { rendered = undefined; drawPanel(); }
      else makeCardsReadOnly();
    });
    const data = new Message();
    data.pbToOldProtocol({
      type: Message.TYPE_SEL,
      timeOut: Math.max(8, (seconds || 0) + (live ? 5 : 0)),
      // Keep the candidates sent for this table, including their swap limits.
      dealCharacter: candidates.map(id => ({ uCharacterId: id,
        mark: 1 << Message.ALLOW_MARK | (!live || !command.replaceable.has(id) ? 1 << Message.FIX_MARK : 0) })),
    });
    const show = () => scene.ged.A(CHOOSE_WINDOW, [data.Datas, data.Timeout, data]);
    if (live) live.withContext(show);
    else show();
  }

  function drawPanel() {
    if (!command || command === rendered || !panel?.parent || !panel.txtOptMsg || !panel.generalUis?.length) return;
    if (!live) {
      panel.mouseEnabled = false;
      panel.mouseThrough = true;
    }
    if (panel.windowTitleTxt) panel.windowTitleTxt.zOrder = 1;
    panel.selectGeneralID = command.chosen || 0;
    for (const card of panel.generalUis) {
      const selected = card.CardID === panel.selectGeneralID;
      card.SelectStatus?.(selected);
      if (!live) continue;
      bindPokerCard(card);
      bindSkin(card);
      card.name = `poker-live-general-${card.CardID}`;
      card.CanSwap = command.replaceable.has(card.CardID);
      card.FreeSwap = false;
      const swap = card.changeGeneralBtn;
      if (swap) {
        const invoke = bindSwap(card);
        if (invoke) swap.pokerLiveSwap = invoke;
        swap.enabled = canSwap(card);
      }
      if (card.seatContainer?.hpContainer) card.seatContainer.hpContainer.visible = false;
      if (card.sureBtn) {
        card.sureBtn.visible = false;
        card.sureBtn.mouseEnabled = false;
      }
      if (card.confirmSelectionImg) card.confirmSelectionImg.visible = selected && command.canConfirm && !command.pending;
    }
    if (!live) makeCardsReadOnly();
    panel.OperateMessage = command.chosen ? escapeNativeText(command.text) : '';
    rendered = command;
  }

  function show(next) {
    if (!next) { if (command) close(); return false; }
    if (!nativeClass(CHOOSE_WINDOW)) { close(); return false; }
    if (live && unavailableKey != null && unavailableKey === next.key) return false;
    const changed = live && command && command.key === next.key
      && (command.candidates.length !== next.candidates.length || command.candidates.some((id, index) => id !== next.candidates[index]));
    const recreate = changed && !live.withContext(() => refreshCandidates(next.candidates));
    if (panel?.destroyed || !panel || recreate || (command?.key ?? command?.candidates) !== (next.key ?? next.candidates)) {
      close();
      command = next;
      since = win.performance.now();
      openSelection(next.candidates, next.seconds);
    }
    if (live && unavailableKey != null && unavailableKey === next.key) return false;
    command = next;
    drawPanel();
    return Boolean(panel);
  }

  scope.add(close);
  return { show, countdownTimer: () => panel?.countdownTimer ?? null, buttons() {
    if (!live || command?.pending || !panel?.parent || panel.destroyed) return [];
    return panel.generalUis.flatMap(card => {
      if (!card.visible || !card.mouseEnabled || !command.candidates.includes(card.CardID)) return [];
      const name = card.Card?.CardName || String(card.CardID);
      const title = card.CardID === command.chosen ? `确定选择${name}` : name;
      const targets = [{ node: card, key: card.name, title, invoke: () => choose(card) }];
      const swap = card.changeGeneralBtn;
      if (swap?.visible && swap.enabled && swap.pokerLiveSwap) {
        targets.push({ node: swap, key: swap.name, title: `更换${card.Card?.CardName || '武将'}`, invoke: swap.pokerLiveSwap });
      }
      const skin = card.hasGeneralSkinSign;
      if (skin?.visible && skinButtons.has(skin)) {
        targets.push({ node: skin, key: skin.name, title: `${name}换肤`, invoke: skinButtons.get(skin) });
      }
      return targets;
    });
  }, ready() {
    drawPanel();
    return !panel || Boolean(rendered) || win.performance.now() - since >= 2500;
  } };
}

export function attachSkillTips(Laya, scope, scene, names) {
  const manager = scene.messageTipManager;
  const owned = new WeakSet();
  function clear() {
    const queue = manager?.actionMessageList;
    for (let i = (queue?.length ?? 0) - 1; i >= 0; i--) {
      if (owned.has(queue[i].messageData)) queue.splice(i, 1)[0].OnDestroy();
    }
    for (const entry of [...(manager?.actionMessageUis || [])]) {
      if (!owned.has(entry.messageData)) continue;
      Laya.timer.clear(entry, entry.remove);
      manager.removeGameActionMessage(entry);
    }
  }
  scope.add(clear);
  function show(action, state, slots, nativeSeats) {
    if (!manager?.AddGameActionMessage) return;
    const player = id => {
      const seat = state.seats.find(item => item.id === id);
      const live = nativeSeats[slots.indexOf(id)]?.Seat;
      const general = live?.General?.CardName || (seat?.general ? names.general(seat.general) : names.seat(id));
      return escapeNativeText(general + (id === slots[0] ? '（您）' : ''));
    };
    const targets = action.targets.length ? `对${action.targets.map(player).join('、')}` : '';
    const data = { str: `${player(action.seat)}${targets}发动了技能 <span style="color:#fff000">“${escapeNativeText(names.skill(action.skill))}”</span>` };
    owned.add(data);
    manager.AddGameActionMessage(TEXT_TIP, data, 2000);
  }
  return { clear, show };
}
