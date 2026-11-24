import { findNativeListenerOwner } from '../../../shared/native-manager.js';
import { read } from '../../../shared/safe-read.js';
import { pokerSkill } from '../poker-skills.js';
import { escapeNativeText } from '../replay/native-opening.js';
import { withClassicPokerContext } from './classic-context.js';
import { pokerQuickVoiceConfig } from './quick-voice-config.js';

const QUICK_CHAT = 'CHAT_QUICK_CHAT';
const QUICK_CHAT_SENT = 'CHAT_LATEST_QUICK_MSG_CHANGED';
const TABLE_CHANNEL = 2;
const OWN_ECHO_TIMEOUT = 8000;
const QUICK_CHAT_NOTICES = [20691, 160061];
const QUICK_CHAT_EVENTS = [...QUICK_CHAT_NOTICES, 'decodeSSCQuickChatmsgNtf', 'SSCQuickChatmsgNtf'];
const VOICE_CONFIG = 'sys_h5_music';
const VOICE_RETRY_DELAY = 3000;
const SKILL_CHAT_KEY = /^\d+_\d+_\d+_\d+;[0-5](?:;2)?$/;
// The rush preset has no dedicated entry in the browser sound table.
const PRESET_SOUND_TEXT = new Map([
  [405, '能不能快一点儿呀，兵贵神速啊'],
  [423, '注意我的手牌'],
]);

export function attachPokerQuickChat(ctx, scope, scene, input, soundSettings) {
  const { window: win } = ctx;
  const { Laya } = win;
  const chat = scene.chatViewUI;
  const button = chat?.superFaceBtn;
  if (!button || !chat.bottomButtonBar
      || typeof chat.showBigFaceUI !== 'function' || typeof chat.sendQuickChat !== 'function') {
    return { draw: () => [], buttons: () => null };
  }
  const router = findNativeListenerOwner(scene.ged, ['SWITCH_SCENE'], caller =>
    typeof caller?.SwitchScene === 'function' && 'lastScene' in caller);
  const hasChatAudio = manager => typeof manager?.checkPlayChatFast === 'function'
    && typeof manager.on === 'function' && typeof manager.off === 'function';
  const chatManager = ctx.native.manager?.('ChatManager', 'SSCQuickChatmsgNtf', hasChatAudio)
    || findNativeListenerOwner(scene.proxy, QUICK_CHAT_EVENTS, hasChatAudio);
  const playChat = chatManager?.checkPlayChatFast;
  const QuickChat = chatManager?.constructor;
  const click = Laya.Event.CLICK;
  const send = chat.sendQuickChat;
  const receive = chat.onChatMsg;
  const composeAndOtherChannels = [chat.chatInput, chat.sendBtn, chat.faceBtn, chat.rescriptBtn, chat.tipView,
    chat.allChatBtn, chat.sysChatBtn, chat.guidChatBtn, chat.privateChatBtn, chat.roomCampChatBtn];
  const rows = new Map();
  const skillRows = new Map();
  const admitted = new WeakSet();
  const localVoices = new Map();
  const selfName = () => scene.SelfSeatUi?.Seat?.PlayerInfo?.Nickname;
  const now = () => win.performance.now();
  let panel, sending, available = false, receivingSkill;
  let voiceConfig, voicePending = false, retryVoicesAt = 0, self, voiceKey;
  function hideCompose() {
    for (const node of composeAndOtherChannels) if (node) node.visible = node.mouseEnabled = false;
  }

  function native(run) {
    if (!router) return withClassicPokerContext(win, scene, run);
    const previous = router.lastScene;
    try {
      router.lastScene = scene;
      return withClassicPokerContext(win, scene, run);
    } finally { if (router.lastScene === scene) router.lastScene = previous; }
  }

  function select(id, kind = 1, skillId = '') {
    if (!available || !panel?.visible || sending || !input.canUseTableActions()) return;
    if (kind === 2 && skillRows.has(skillId)) {
      native(() => send.call(chat, 0, 2, skillId));
      return;
    }
    if (kind !== 1 || skillId || !rows.has(Number(id))) return;
    const request = sending = { id: Number(id), sent: false, echoed: false };
    try { native(() => send.call(chat, request.id, 1, '')); }
    finally { sending = undefined; }
    if (request.sent && !request.echoed && playPreset(rows.get(request.id), selfName())) {
      const previous = localVoices.get(request.id);
      const count = previous?.expires > now() ? previous.count + 1 : 1;
      localVoices.set(request.id, { count, expires: now() + OWN_ECHO_TIMEOUT });
    }
  }

  const audioEnabled = () => !Laya.SoundManager?.muted && !Laya.SoundManager?.soundMuted
    && !soundSettings?.MainClose && !soundSettings?.CloseFast && !(soundSettings?.MainVol <= 0);

  function playPreset(row, name) {
    if (scope.closed || !name || !playChat || !input.isCurrentTable() || !audioEnabled()) return false;
    const text = PRESET_SOUND_TEXT.get(Number(row.Data.id)) ?? row.Data.text;
    const data = { Channel: TABLE_CHANNEL, SpokerMan: name, chatMsg: text };
    const play = () => read(() => { playChat.call(chatManager, data); return true; }) === true;
    const useDefault = soundSettings?.ChatFastType === 0 && soundSettings.CloseFast === false;
    if (!useDefault) return play();
    // Classic reads an unset voice pack as zero. Use its standard recording
    // for this call without writing or changing the player's preference.
    const property = Object.getOwnPropertyDescriptor(soundSettings, 'ChatFastType');
    if (property?.configurable === false || !property && !Object.isExtensible(soundSettings)) return false;
    Object.defineProperty(soundSettings, 'ChatFastType', { configurable: true, value: 1 });
    try { return play(); }
    finally {
      if (property) Object.defineProperty(soundSettings, 'ChatFastType', property);
      else delete soundSettings.ChatFastType;
    }
  }

  function preset(data) {
    if (!available || !input.isCurrentTable() || !data?.IsQuickChatMsg || data.QuickChatKind !== 1
        || data.Channel !== TABLE_CHANNEL || data.IsResume || !input.isTableSpeaker(data.SpokerMan) || !prepare()) return null;
    return rows.get(data.QuickChatId);
  }

  function playIncoming(data) {
    const row = preset(data);
    if (!row) return;
    if (data.SpokerMan === selfName()) {
      const id = data.QuickChatId;
      const echo = localVoices.get(id);
      if (echo && echo.expires > now()) {
        if (--echo.count === 0) localVoices.delete(id);
        return;
      }
      localVoices.delete(id);
      if (sending?.id === id) sending.echoed = true;
    }
    playPreset(row, data.SpokerMan);
  }

  function prepare() {
    if (panel) return rows.size > 0 || skillRows.size > 0;
    native(() => chat.showBigFaceUI());
    panel = chat.fastViewUI;
    if (!panel) return false;
    chat.hideBigFace();
    Laya.timer.clear(chat, chat.addStageClick);
    panel.off(QUICK_CHAT, chat, send);
    panel.on(QUICK_CHAT, scope, select);
    panel.name = 'poker-live-quick-chat';
    refreshSkillRows();
    return rows.size > 0 || skillRows.size > 0;
  }

  function refreshSkillRows() {
    if (!panel) return;
    const model = scene.SelfSeatUi?.Seat;
    const general = self?.generalId;
    const skillIds = self?.skillIds || [];
    const skin = model?.SkinID || self?.skin || 0;
    const style = model?.DySkinType || 0;
    const defaultSkin = soundSettings?.SoundFileName === 'Sound' ? -2 : -1;
    const key = `${general}/${skin}/${style}/${defaultSkin}/${skillIds.join(',')}/${Boolean(voiceConfig)}`;
    if (key === voiceKey) return;
    voiceKey = key;
    if (voiceConfig && typeof panel.UpdateUIInGameData === 'function' && typeof QuickChat?.GetFastPhrases === 'function') {
      const lines = skillIds.flatMap(id => {
        const skill = pokerSkill(ctx, id);
        if (!skill || skill.IsHideOnSeat) return [];
        return voiceConfig.skillLines(general, id, skin, style, defaultSkin).map(line =>
          ({ id: line.id, word: escapeNativeText(`[${skill.Name}]${line.word}`) }));
      });
      const restore = scope.patch(QuickChat, 'GetFastPhrases', original => function (...args) {
        const stock = Reflect.apply(original, this, args) || [];
        const seen = new Set(lines.map(line => line.id));
        return [...lines, ...stock.filter(row => !seen.has(row?.id))];
      });
      try { native(() => panel.UpdateUIInGameData()); }
      finally { restore(); }
    }
    rows.clear();
    skillRows.clear();
    const list = panel.panel;
    for (let i = 0; i < list.numChildren; i++) {
      const row = list.getChildAt(i);
      if (row?.IsSkill && SKILL_CHAT_KEY.test(row.SKillItemID) && row.Data?.text
          && row.SKillItemID.startsWith(general + '_')
          && skillIds.includes(Number(row.SKillItemID.split('_')[2]?.split(';')[0]))) {
        row.name = `poker-live-skill-phrase-${row.SKillItemID.replace(';', '-')}`;
        row.y = (rows.size + skillRows.size) * 21;
        skillRows.set(row.SKillItemID, row);
        continue;
      }
      const id = Number(row?.Data?.id);
      if (row?.IsSkill || !Number.isSafeInteger(id) || id <= 0 || !row.Data.text) {
        if (row) row.visible = false;
        continue;
      }
      row.name = `poker-live-phrase-${id}`;
      row.y = (rows.size + skillRows.size) * 21;
      rows.set(id, row);
    }
    list.UpdateDrawContent();
  }

  function requestVoices() {
    if (voiceConfig || voicePending || !self?.skillIds?.length || now() < retryVoicesAt) return;
    const apply = config => {
      if (scope.closed || !config) return;
      voiceConfig = config;
      refreshSkillRows();
    };
    const cached = pokerQuickVoiceConfig(read(() => ctx.game.getConfigData?.(VOICE_CONFIG)));
    if (cached) { apply(cached); return; }
    voicePending = true;
    void Promise.resolve(read(() => ctx.game.loadConfigData?.(VOICE_CONFIG, { signal: scope.signal })))
      .then(config => apply(pokerQuickVoiceConfig(config)))
      .catch(() => {})
      .finally(() => {
        voicePending = false;
        retryVoicesAt = now() + VOICE_RETRY_DELAY;
      });
  }

  function phraseTarget(node, invoke) {
    return { node, key: node.name, title: node.Data.text, invoke, reveal() {
      const list = panel?.panel;
      const bar = list?.vScrollBar;
      if (!bar) return;
      if (node.y < bar.value || node.y + node.height > bar.value + list.height) {
        bar.value = Math.min(bar.max, node.y);
      }
    } };
  }

  function toggle() {
    if (!available || !input.canUseTableActions() || !prepare()) return;
    requestVoices();
    panel.pos(Math.max(0, chat.width - panel.width - 2), Math.min(-4, chat.height - panel.height - 24));
    panel.visible = !panel.visible;
  }

  function outside(event) {
    if (!panel?.visible) return;
    for (let node = event.target; node; node = node.parent) {
      if (node === chat) return;
    }
    panel.visible = false;
  }

  chat.RemoveEventListener?.();
  const resume = scope.patch(chat, 'onChatMsg', () => function (channel, data) {
    const skill = data?.IsQuickChatMsg && data.QuickChatKind === 2 && data.Channel === TABLE_CHANNEL
      && receivingSkill && data.SpokerMan === receivingSkill;
    if (!skill && !preset(data)) return;
    // The stock ticker normally handles quick-chat notices outside the log.
    const entry = Object.create(data, { IsQuickChatMsg: { value: false } });
    admitted.add(entry);
    receive.call(this, channel, entry);
  });
  if (chatManager) {
    const sent = () => {
      if (sending && chatManager.LatestQuickMsgIds?.at(-1) === sending.id) sending.sent = true;
    };
    chatManager.on(QUICK_CHAT_SENT, scope, sent);
    scope.add(() => chatManager.off(QUICK_CHAT_SENT, scope, sent));
    scope.patch(chatManager, 'checkPlayChatFast', original => function (data) {
      if (this !== chatManager || !input.isCurrentTable()) return original.call(this, data);
      playIncoming(data);
    });
    const stock = chatManager.quickChatMsgNtf;
    const proxy = chatManager.proxy;
    if (typeof stock === 'function' && proxy?.AddEventListener && proxy.RemoveEventListener) {
      scope.patch(chatManager, 'quickChatMsgNtf', original => function (event) {
        const protocol = event?.Protocol;
        const data = protocol?.Data?.ProtoObj ?? protocol;
        if (this !== chatManager || !input.isCurrentTable() || data?.id_kind !== 2) return original.call(this, event);
        if (!available || data.IsResume || protocol.IsResume || !SKILL_CHAT_KEY.test(data.id_str)
            || !input.isTableSpeaker(data.spokesman)) return;
        receivingSkill = data.spokesman;
        const mute = !audioEnabled() && typeof Laya.SoundManager?.playSound === 'function'
          ? scope.patch(Laya.SoundManager, 'playSound', () => () => null) : null;
        try { return original.call(this, event); }
        finally { mute?.(); receivingSkill = undefined; }
      });
      const handler = chatManager.quickChatMsgNtf;
      for (const id of QUICK_CHAT_NOTICES) {
        proxy.RemoveEventListener(id, chatManager, stock);
        proxy.AddEventListener(id, chatManager, handler);
        scope.add(() => {
          proxy.RemoveEventListener(id, chatManager, handler);
          proxy.AddEventListener(id, chatManager, stock);
        });
      }
    }
  }
  scope.patch(chat, 'onChatUpdateMsg', () => () => {});
  scope.patch(chat, 'getHtmlBase', original => function (data) {
    return admitted.has(data) ? original.call(this, data) : null;
  });
  scope.patch(chat, 'showSuperZhaoLing', () => () => {});
  if (chat.superZhaolingUI) {
    Laya.timer.clear(chat, chat.hideSuperZhaoLing);
    chat.hideSuperZhaoLing();
  }
  if (typeof chat.sendHandler === 'function') scope.patch(chat, 'sendHandler', () => () => {});
  chat.ClearChatItem?.();
  hideCompose();
  chat.visible = true;
  chat.AddEventListener?.();
  button.off(click, chat, chat.showBigFaceUI);
  button.name = 'poker-live-chat';
  button.ToolTip = '快捷聊天';
  button.on(click, scope, toggle);
  Laya.stage.on(click, scope, outside);
  scope.add(() => {
    Laya.stage.off(click, scope, outside);
    chat.RemoveEventListener?.();
    resume();
    if (panel) {
      panel.off(QUICK_CHAT, scope, select);
      panel.visible = false;
    }
  });
  return {
    draw(state) {
      hideCompose();
      self = state.seats.find(seat => seat.id === state.selfSeat);
      requestVoices();
      refreshSkillRows();
      available = !state.ended && input.canUseTableActions();
      button.visible = available;
      if (panel && !available) panel.visible = false;
      return available ? [{ node: button, parent: chat.bottomButtonBar, key: button.name, title: '快捷聊天', invoke: toggle }] : [];
    },
    buttons() {
      if (!panel?.visible) return null;
      const items = [...skillRows].map(([id, node]) => phraseTarget(node, () => select(0, 2, id)));
      items.push(...[...rows].map(([id, node]) => phraseTarget(node, () => select(id))));
      return [...items, { node: button, parent: chat.bottomButtonBar, key: button.name, title: '关闭快捷聊天', invoke: toggle }];
    },
  };
}
