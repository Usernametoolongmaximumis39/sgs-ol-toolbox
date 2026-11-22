import { bindVoicesInOrder, DEATH_VOICE, isAutomaticSkillVoice, isBindableVoice, loadCardSkills, NATIVE_VOICE,
  normalizeMobileVoiceOptions, remapVoiceBindings, resolveVoiceBindings, skinVoiceFormKey, updateVoiceBindingsForForms,
  unmatchedSkillClips, voiceBindingsForForm, voiceClipKey } from './cross-voice.js';
import { loadYjcmArtwork, loadYjcmHead, loadYjcmPreview, loadYjcmWindow, yjcmVoiceReference } from './yjcm.js';
import { previewSeatMotion, previewYjcmMotion } from './yjcm-motion.js';
import { createYjcmEffectPicker, EFFECT_PICKER_STYLES } from './yjcm-effect-picker.js';
import { loadMobileArtwork, loadMobileAudio, loadMobileHead, loadMobileMotion, loadMobilePreview } from './mobile-skins.js';
import { formLabel } from './form-label.js';

const pageSize = 36;
const sourceId = button => button.dataset.skill === NATIVE_VOICE ? NATIVE_VOICE : Number(button.dataset.skill);
const skinLabel = entry => `${entry.general} · ${entry.name} #${entry.number ?? entry.id}`;
const skinReference = ({ id, general }) => ({ id, general });
const skinKeyForDraft = entry => JSON.stringify(skinReference(entry));
const styles = `
:host{color-scheme:var(--sgs-scheme,dark)}
dialog{box-sizing:border-box;width:min(486px,calc(100% - 24px));max-width:none;max-height:calc(100% - 24px);margin:auto;padding:0;overflow:hidden;border:1px solid var(--sgs-border,#665b42);border-radius:14px;background:var(--sgs-bg,#201e1a);color:var(--sgs-text,#eee3cc);box-shadow:0 18px 54px #0008;font:calc(14px + var(--sgs-font-offset,0px))/1.45 var(--sgs-font,"Microsoft YaHei",sans-serif)}
/* Chromium 85 leaves the automatic modal position at its initial value when content grows. */
dialog[open]{position:fixed;top:0;right:0;bottom:0;left:0;height:fit-content;display:flex;flex-direction:column}
dialog::backdrop{background:#0a0806a8}
dialog[data-seat-preview]::backdrop{background:#0a080630}
.head,.footer{display:flex;align-items:center;justify-content:space-between;gap:.65em;padding:.65em 1em;flex:none}
.head{border-bottom:1px solid var(--sgs-border,#665b42)}
h2{margin:0;font-size:1.18em}
button{box-sizing:border-box;appearance:none;min-height:36px;padding:.3em .65em;border:1px solid var(--sgs-border,#665b42);border-radius:7px;background:var(--sgs-surface,#2c2922);color:inherit;font:inherit;cursor:pointer}
button:hover:not(:disabled){color:var(--sgs-accent,#dbba70);border-color:var(--sgs-accent,#dbba70)}
button:focus-visible{outline:2px solid var(--sgs-accent,#dbba70);outline-offset:-2px}
button:disabled{opacity:.5;cursor:default}
.close{display:grid;place-items:center;width:36px;flex:none;padding:0;background:transparent;border-color:transparent}
.body{display:grid;align-content:start;gap:.5em;padding:.85em;min-height:0;overflow:auto;overscroll-behavior:contain}
input.sgs-input{width:100%;height:38px;font:inherit;border-color:var(--sgs-border,#665b42)}
input::-webkit-search-cancel-button{filter:grayscale(1);cursor:pointer}
.categories{min-width:0;overflow-x:auto;scrollbar-width:thin;overscroll-behavior-x:contain}
.categories>button{flex:0 0 auto;min-height:33px;padding:4px .65em;white-space:nowrap;font-size:.92em}
.purpose{justify-self:start}
.purpose>button{flex:0 0 auto;min-height:33px;padding:4px .65em;white-space:nowrap;font:inherit}
.results{display:grid;align-content:start;gap:2px;min-height:0;max-height:min(42vh,325px);overflow:auto;overscroll-behavior:contain}
.index-retry{justify-self:start}
.result{display:flex;align-items:center;gap:.55em;width:100%;min-width:0;min-height:44px;padding:3px .55em;border-color:transparent;background:transparent;text-align:left}
.result .name{min-width:0;flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.result small{margin-inline-start:.45em;font-size:.88em}
.result small,p{color:var(--sgs-muted,#b7aa8c)}
.result[aria-pressed=true]{border-color:var(--sgs-border,#665b42);background:var(--sgs-raised,#332d23);box-shadow:inset 2px 0 var(--sgs-accent,#dbba70)}
.thumb{display:block;flex:0 0 36px;width:36px;height:36px;overflow:hidden;border-radius:5px;background:var(--sgs-surface,#2c2922);box-shadow:inset 0 0 0 1px var(--sgs-border,#665b42)}
.thumb img{display:block;width:100%;height:100%;object-fit:cover}
.selection{display:grid;grid-template-columns:minmax(0,1fr) min(24%,6em);align-items:start;gap:.65em;padding-top:.6em;border-top:1px solid var(--sgs-border,#665b42)}
.selection-head{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.35em .65em;min-width:0}
.selection-head h3{margin:0;min-width:0;overflow-wrap:anywhere;font-size:1.05em}
.selection-head button{min-height:32px;white-space:nowrap}
.skin-forms{grid-column:1/-1;min-width:0;overflow-x:auto;overscroll-behavior-x:contain}
.skin-forms>button{flex:1 0 auto;min-height:33px;font-size:.88em;white-space:nowrap}
.rules{grid-column:1/-1;justify-self:start;min-height:32px;white-space:nowrap}
.skin-background{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:.35em .65em;min-width:0}
.skin-background button{flex:none;white-space:nowrap}
.skin-background button[aria-pressed=true]{color:var(--sgs-accent,#dbba70);border-color:var(--sgs-accent,#dbba70);background:var(--sgs-raised,#332d23)}
.skin-background p{flex:1 1 12em;min-width:0;color:var(--sgs-danger,#e68780);font-size:.88em}
.art{position:relative;display:grid;place-items:center;aspect-ratio:3/4;overflow:hidden;border-radius:7px;background:var(--sgs-surface,#2c2922)}
.art img{width:100%;height:100%;object-fit:contain;min-height:0}
.art canvas{position:absolute;inset:0;width:100%;height:100%;background:var(--sgs-surface,#2c2922)}
.demo{grid-column:1/-1;max-width:100%;max-height:220px;justify-self:center;border-radius:7px}
.demo-toggle{grid-column:1/-1;justify-self:start}
.art-status{padding:.25em;text-align:center;font-size:.82em}
.voice{display:grid;align-self:start;min-width:0;gap:.35em}
.voice-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.35em .55em}
.voice-head strong,.voice-head button{white-space:nowrap}
.voice-head button,.voice-group button{min-height:34px}
.voice-extras{grid-column:1/-1;display:grid;gap:.2em;min-width:0;padding:.35em 0;border-top:1px solid var(--sgs-border,#665b42)}
.voice-option{display:flex;align-items:center;justify-content:space-between;gap:.5em;min-height:36px;cursor:pointer}
.voice-option span{white-space:nowrap}
.voice-extras small{color:var(--sgs-muted,#b7aa8c);overflow-wrap:anywhere}
.voice-victory button{display:inline-flex;align-items:center;gap:.45em;color:var(--sgs-accent,#dbba70)}
.voice-victory button span{min-width:0;overflow:hidden;text-overflow:ellipsis}
.voice-group{display:flex;flex-wrap:wrap;gap:.3em;min-width:0}
.voice-group button{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.voice-group button[aria-pressed=true]{border-color:var(--sgs-accent,#dbba70);background:var(--sgs-raised,#332d23);box-shadow:inset 2px 0 var(--sgs-accent,#dbba70)}
.voice-own{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr);gap:2px}
.voice-own button{display:grid;grid-template-columns:minmax(4.4em,24%) minmax(0,1fr);align-items:baseline;gap:.5em;text-align:left;white-space:normal;overflow-wrap:anywhere;background:transparent;border-color:transparent;box-shadow:inset 0 -1px var(--sgs-border,#665b42)}
.voice-own button:disabled{opacity:1;color:var(--sgs-muted,#b7aa8c)}
.voice-own small{min-width:0;color:var(--sgs-muted,#b7aa8c)}
.voice-own small span{display:block}
.voice-hint,.voice-playback{font-size:.88em}
.voice-playback{grid-column:1/-1}
.voice-playback[data-playing]{color:var(--sgs-accent,#dbba70)}
.voice-playback[data-error]{color:var(--sgs-danger,#e68780)}
.footer{border-top:1px solid var(--sgs-border,#665b42)}
.footer button{flex:none;white-space:nowrap;color:var(--sgs-accent,#dbba70)}
@media(max-width:320px){.footer{display:grid;grid-template-columns:1fr}.footer button{justify-self:end}}
p{margin:0;overflow-wrap:anywhere}
details{min-width:0;color:var(--sgs-danger,#e68780)}
details p{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.9em}
.voice-extra{color:var(--sgs-muted,#b7aa8c);font-size:.92em}
.voice-extra summary{box-sizing:border-box;width:fit-content;max-width:100%;min-height:32px;padding:.35em 0;cursor:pointer}
.voice-extra summary:hover{color:var(--sgs-accent,#dbba70)}
.voice-extra summary:focus-visible{outline:2px solid var(--sgs-accent,#dbba70);outline-offset:-2px}
.voice-extra .voice-group{margin-top:.2em;color:var(--sgs-text,#eee3cc)}
[hidden]{display:none!important}
`;

export function createYjcmPicker(ctx, local, openForms) {
  let closeCurrent;
  return function open({ target, general, trigger, onApply, initialQuery } = {}, kind = 'cross') {
    if (ctx.scope.signal.aborted) return;
    closeCurrent?.();
    const { document: doc, window: win, scope } = ctx;
    const accountId = ctx.native.account().id;
    const matchScene = target && ctx.game.getScene?.();
    const recipient = target ?? general;
    const canApply = Boolean(target || (general && accountId));
    const sameContext = () => ctx.native.account().id === accountId && (!target || matchScene === ctx.game.getScene?.());
    const binding = local.portraitBinding(recipient, kind);
    const draftPrefix = accountId && Number.isSafeInteger(recipient?.id) && recipient.id > 0
      ? `skinPickerDraft.${accountId}.${recipient.isSelf === false ? 'other' : 'self'}.${recipient.id}.${kind}` : null;
    const resumeKey = draftPrefix && draftPrefix + '.last';
    const resume = resumeKey ? ctx.settings.get(resumeKey, null) : null;
    const host = doc.createElement('div');
    host.dataset.sgsToolbox = 'skin-picker';
    const mobile = kind === 'mobile';
    const title = mobile ? '移动版皮肤' : '一将成名皮肤';
    const sourceCatalogue = mobile ? local.mobile : local.yjcm;
    const loadWindow = mobile ? loadMobilePreview : loadYjcmWindow;
    const loadPreview = mobile ? loadMobilePreview : loadYjcmPreview;
    host.toggleAttribute(mobile ? 'data-sgs-mobile-skins' : 'data-sgs-yjcm-skins', true);
    const toolbox = doc.querySelector('[data-sgs-toolbox="core"]');
    if (toolbox) host.style.setProperty('--sgs-font-offset', win.getComputedStyle(toolbox).getPropertyValue('--sgs-font-offset'));
    const shadow = host.attachShadow({ mode: 'open' });
    const offStyles = ctx.ui.mountStyles(shadow);
    const style = doc.createElement('style');
    style.textContent = styles + EFFECT_PICKER_STYLES;
    const dialog = doc.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'yjcm-title');
    dialog.toggleAttribute('data-seat-preview', Boolean(target));
    dialog.innerHTML = `
      <header class="head"><h2 id="yjcm-title">${title}</h2><button class="close" type="button" aria-label="关闭" title="关闭"></button></header>
      <div class="body">
        <input class="sgs-input" type="search" aria-label="搜索所属武将" placeholder="搜索所属武将" maxlength="80">
        <div class="categories sgs-segments" role="group" aria-label="按所属武将筛选" hidden></div>
        <div class="purpose sgs-segments" role="group" aria-label="皮肤选择用途" hidden>
          <button type="button" aria-pressed="true">选立绘</button><button type="button" aria-pressed="false" disabled>选配音</button>
        </div>
        <p class="count" role="status"></p>
        <button class="index-retry" type="button" hidden>重试加载</button>
        <div class="results" aria-label="皮肤搜索结果"></div>
        <section class="selection" aria-labelledby="yjcm-selection-title" tabindex="-1" hidden>
          <div class="selection-head">
            <h3 id="yjcm-selection-title"></h3><button type="button" class="resume-draft" hidden>继续未完成配置</button>
          </div>
          <div class="skin-forms sgs-segments" role="group" aria-label="皮肤形态" hidden></div>
          <button type="button" class="rules" hidden>形态规则</button>
          <div class="skin-background" hidden>
            <button type="button" title="使用当前形态的横版皮肤，仅自己可见">设为牌局背景</button>
            <p role="status" hidden></p>
          </div>
          <div class="voice">
            <div class="voice-head"><strong>配音</strong><button class="bind-all" type="button" hidden>一键绑定</button></div>
            <p class="voice-hint" role="status"></p>
            <div class="voice-group voice-source" role="group" aria-label="外服技能"></div>
            <details class="voice-extra voice-unidentified" hidden>
              <summary>未识别配音</summary>
              <div class="voice-group" role="group" aria-label="未识别配音"></div>
            </details>
            <audio crossorigin="anonymous" preload="none" hidden></audio>
          </div>
          <div class="art"><p class="art-status" role="status"></p></div>
          <div class="voice-extras" hidden>
            <details class="voice-extra voice-card" hidden>
              <summary>卡牌配音</summary>
              <div class="voice-group" role="group" aria-label="试听卡牌配音"></div>
            </details>
            <label class="voice-option" title="缺少同名配音时使用 OL 原配音" hidden><span>替换同名卡牌配音</span><input type="checkbox" name="card-voice"></label>
            <div class="voice-group voice-victory" role="group" aria-label="胜利配音" hidden></div>
            <label class="voice-option" hidden><span>替换 MVP 语音</span><input type="checkbox" name="victory-voice"></label>
            <small hidden>无胜利配音时静音。</small>
          </div>
          <p class="voice-playback" role="status" hidden></p>
          <div class="voice-group voice-own" role="group" aria-label="武将技能"></div>
        </section>
        <details class="load-error" hidden><summary>加载失败详情</summary><p></p></details>
      </div>
      <footer class="footer"><p role="status"></p><button type="button" disabled>使用皮肤</button></footer>`;
    shadow.append(style, dialog);
    const body = dialog.querySelector('.body');
    const input = dialog.querySelector('input'), results = dialog.querySelector('.results'), count = dialog.querySelector('.count');
    const retryIndex = dialog.querySelector('.index-retry');
    const categories = dialog.querySelector('.categories');
    const purpose = dialog.querySelector('.purpose');
    const [pickArt, pickVoice] = purpose.querySelectorAll('button');
    purpose.hidden = !canApply;
    const details = dialog.querySelector('.load-error'), error = details.querySelector('p'), errorTitle = details.querySelector('summary');
    const note = dialog.querySelector('.footer p'), apply = dialog.querySelector('.footer button'), close = dialog.querySelector('.close');
    const selection = dialog.querySelector('.selection'), art = dialog.querySelector('.art'), artStatus = dialog.querySelector('.art-status');
    const background = selection.querySelector('.skin-background'), backgroundButton = background.querySelector('button');
    const backgroundStatus = background.querySelector('p');
    const selectionTitle = selection.querySelector('h3'), resumeDraft = selection.querySelector('.resume-draft');
    const bindAll = dialog.querySelector('.bind-all'), hint = dialog.querySelector('.voice-hint');
    const sourceSkills = dialog.querySelector('.voice-source'), ownSkills = dialog.querySelector('.voice-own');
    const cardVoices = dialog.querySelector('.voice-card'), unidentifiedVoices = dialog.querySelector('.voice-unidentified');
    const sourceCards = cardVoices.querySelector('.voice-group'), sourceUnidentified = unidentifiedVoices.querySelector('.voice-group');
    const sourceVictory = dialog.querySelector('.voice-victory');
    const audio = dialog.querySelector('audio'), playbackStatus = dialog.querySelector('.voice-playback');
    const formButton = dialog.querySelector('.rules'), formList = dialog.querySelector('.skin-forms');
    const audioOptions = dialog.querySelector('.voice-extras'), victoryHint = audioOptions.querySelector('small');
    const [cardVoice, victoryVoice] = [...audioOptions.querySelectorAll('input')].map(ctx.ui.styleSwitch);
    const [cardOption, victoryOption] = audioOptions.querySelectorAll('.voice-option');
    close.append(ctx.ui.icon('close'));
    const idleNote = target ? target.label + ' · 仅自己可见' :
      general ? (accountId ? general.name + ' · 局内仅自己可见' : '登录后可保存到下次对局。') : '';
    note.textContent = idleNote;
    apply.hidden = !recipient;
    if (general) apply.textContent = '下次使用';
    let request, previewRequest, seatPreviewError, matches = [], selected, searchResult, chosenCategory;
    let backgroundRequest, backgroundProbe, backgroundBlob, backgroundKey;
    let remainingDraft, autoLocate = true;
    let catalogue = mobile ? undefined : sourceCatalogue.current;
    let voices = [], artVoices = [], skills, source, voiceConfig = {}, bindings = {};
    let artwork, activeArtwork, shownEntry, shownGroup, artForm = 0, shownForm = 0, voiceOnly = false, closeRules;
    const drafts = new Map(), voicePositions = new Map();
    const draftStorageKey = entry => draftPrefix + '.skin.' + skinKeyForDraft(entry);
    const formConfig = entry => {
      const draft = skinDraft(entry);
      const saved = mobile ? null : bindingFor(entry);
      const forms = catalogue.skinForms(entry);
      return draft.rule !== undefined ? draft.rule :
        local.formRule?.(recipient?.id, kind, saved?.id ?? forms[0].id, forms.length, catalogue.skinTransitions?.(entry));
    };
    let draftError = false;
    function setDraftSetting(key, value) {
      try { ctx.settings.set(key, value); }
      catch {
        if (draftError) return;
        draftError = true;
        ctx.notify?.('当前浏览器无法保存皮肤配置草稿。');
      }
    }
    function skinDraft(entry) {
      const key = skinKeyForDraft(entry);
      if (!drafts.has(key)) drafts.set(key, draftPrefix ? ctx.settings.get(draftStorageKey(entry), null) ?? {} : {});
      return drafts.get(key);
    }
    function rememberView() {
      if (!resumeKey || !artwork || ctx.native.account().id !== accountId || !Object.keys(skinDraft(artwork)).length) return;
      setDraftSetting(resumeKey, {
        skin: skinReference(artwork), query: input.value, category: chosenCategory,
        voice: voiceOnly && shownGroup && { ...skinReference(shownGroup), form: skinVoiceFormKey(shownEntry, shownForm + 1) },
        effectOpen: effectPicker.root.open,
      });
    }
    function editDraft(changes) {
      if (!artwork) return;
      const draft = { ...skinDraft(artwork), ...changes };
      drafts.set(skinKeyForDraft(artwork), draft);
      if (draftPrefix && ctx.native.account().id === accountId) {
        setDraftSetting(draftStorageKey(artwork), draft);
        rememberView();
      }
    }
    function discardDraft(entry) {
      const { ruleEdit, form } = skinDraft(entry);
      if (ruleEdit) {
        const draft = { ruleEdit, form };
        drafts.set(skinKeyForDraft(entry), draft);
        if (draftPrefix && ctx.native.account().id === accountId) setDraftSetting(draftStorageKey(entry), draft);
        return;
      }
      drafts.set(skinKeyForDraft(entry), {});
      if (!resumeKey || ctx.native.account().id !== accountId) return;
      setDraftSetting(draftStorageKey(entry), null);
      const last = ctx.settings.get(resumeKey, null)?.skin;
      if (last && skinKeyForDraft(last) === skinKeyForDraft(entry)) setDraftSetting(resumeKey, null);
    }
    let picked, demo, demoToggle, inheritedEffects;
    let skinKey, playback, lastAudition;
    const skillRequest = recipient ? loadCardSkills(ctx, recipient.id, { includeDerived: true }).catch(() => null) : Promise.resolve([]);
    let headRequests = new win.AbortController();
    const headUrls = new Set();
    const heads = new win.IntersectionObserver(entries => {
      for (const { isIntersecting, target: frame } of entries) {
        if (!isIntersecting || !results.contains(frame)) continue;
        heads.unobserve(frame);
        const thumb = frame.firstElementChild;
        const { signal } = headRequests;
        const entry = matches[Number(frame.parentElement.dataset.result)];
        const loading = mobile ? loadMobileHead(win, entry, signal) : loadYjcmHead(win, entry.head, signal);
        loading.then(blob => {
          if (!blob || signal.aborted || !results.contains(thumb)) return;
          const url = win.URL.createObjectURL(blob);
          headUrls.add(url);
          thumb.onerror = () => { thumb.hidden = true; win.URL.revokeObjectURL(url); headUrls.delete(url); };
          thumb.src = url;
          thumb.hidden = false;
        }).catch(() => {});
      }
    }, { root: results, rootMargin: '36px 0px' });
    const listeners = [];
    const listen = (...args) => listeners.push(scope.listen(...args));
    const effectPicker = createYjcmEffectPicker({ document: doc, window: win, icon: ctx.ui.icon, listen, canBind: canApply,
      onChange(config) { editDraft({ effects: config }); },
      beforePreview() { stopVoice(); clearDemo(); },
    });
    if (effectPicker) formButton.after(effectPicker.root);
    function clearHeads() {
      headRequests.abort();
      heads.disconnect();
      for (const url of headUrls) win.URL.revokeObjectURL(url);
      headUrls.clear();
    }
    function clearStatus() {
      const previewFailed = seatPreviewError && !request;
      details.hidden = !previewFailed;
      details.open = false;
      errorTitle.textContent = previewFailed ? '局内预览加载失败' : '加载失败详情';
      error.textContent = previewFailed ? seatPreviewError : '';
      note.textContent = artwork && (voiceOnly || !shownEntry) ? '立绘 · ' + skinLabel(artwork) : idleNote;
    }
    function updateApply() {
      pickVoice.disabled = !artwork || picked?.loading === true;
      apply.disabled = !canApply || !artwork || picked?.loading === true;
      resumeDraft.hidden = !remainingDraft || !artwork || skinKeyForDraft(artwork) === skinKeyForDraft(remainingDraft);
      const hasForms = artwork && !voiceOnly && catalogue.skinForms(artwork).length > 1;
      formButton.hidden = !openForms || !canApply || !hasForms;
      updateAudioOptions();
      effectPicker?.setVisible(!voiceOnly);
      updateBackground();
      clearStatus();
    }
    function updateBackground() {
      const entry = !voiceOnly && !picked?.loading && activeArtwork;
      const hasArt = mobile ? entry?.art : entry?.assets?.length;
      const key = hasArt && ctx.backgrounds?.canSelectSkinImage?.()
        ? JSON.stringify([kind, artwork.general, artwork.id, skinVoiceFormKey(entry, artForm + 1)]) : null;
      if (key !== backgroundKey) {
        backgroundRequest?.abort();
        backgroundProbe?.abort();
        backgroundRequest = null;
        backgroundBlob = null;
        backgroundStatus.hidden = true;
        backgroundStatus.textContent = '';
        backgroundKey = key;
        if (key) {
          const { signal } = backgroundProbe = new win.AbortController();
          const loadArtwork = mobile ? loadMobileArtwork : loadYjcmArtwork;
          void loadArtwork(win, entry, signal).then(blob => {
            if (signal.aborted) return;
            backgroundBlob = blob;
            updateBackground();
          }).catch(() => {});
        }
      }
      background.hidden = !backgroundBlob;
      const saved = Boolean(key && ctx.backgrounds.current?.skinKey === key);
      backgroundButton.disabled = Boolean(backgroundRequest);
      backgroundButton.setAttribute('aria-pressed', String(saved));
      backgroundButton.textContent = backgroundRequest ? '正在保存背景…' : saved ? '已设为牌局背景' : '设为牌局背景';
    }
    function stopVoice() {
      playback?.controller?.abort();
      const objectUrl = playback?.objectUrl;
      playback = null;
      if (audio.hasAttribute('src')) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      if (objectUrl) win.URL.revokeObjectURL(objectUrl);
      playbackStatus.hidden = true;
      delete playbackStatus.dataset.playing;
      delete playbackStatus.dataset.error;
      playbackStatus.removeAttribute('title');
    }
    function voiceFailed(current, error) {
      if (playback !== current) return;
      delete playbackStatus.dataset.playing;
      if (current.objectUrl && error?.name === 'NotAllowedError') {
        current.tryAgain = true;
        playbackStatus.textContent = current.label + ' · 再点一次试听';
        return;
      }
      playbackStatus.dataset.error = '';
      playbackStatus.textContent = current.label + ' · 试听失败';
      if (error?.message) playbackStatus.title = error.message;
    }
    async function playVoice(voice) {
      if (playback?.voice === voice && playback.tryAgain) {
        await startVoice(playback);
        return;
      }
      stopVoice();
      effectPicker?.stop();
      clearDemo();
      const key = skinKey + ':' + voice.id;
      const count = voice.urls.length;
      if (!count) return;
      const first = (voicePositions.get(key) ?? 0) % count;
      const offset = voice.urls.findIndex((_, i) => voiceClipKey(voice, voice.urls[(first + i) % count]) !== lastAudition);
      const index = (first + Math.max(0, offset)) % count;
      const clip = voiceClipKey(voice, voice.urls[index]);
      voicePositions.set(key, (index + 1) % count);
      const current = playback = { voice, clip, label: voice.name + ' · 第 ' + (index + 1) + '/' + count + ' 句' };
      playbackStatus.hidden = false;
      playbackStatus.textContent = current.label + ' · 载入中';
      try {
        let url = voice.urls[index];
        if (voice.load) {
          current.controller = new win.AbortController();
          url = await loadMobileAudio(win, voice, url, current.controller.signal);
          if (!url || playback !== current) {
            if (url) win.URL.revokeObjectURL(url);
            return;
          }
          current.objectUrl = url;
        }
        audio.src = url;
        await startVoice(current);
      } catch (error) { voiceFailed(current, error); }
    }
    async function startVoice(current) {
      current.tryAgain = false;
      try {
        await audio.play();
        if (playback !== current || playbackStatus.hasAttribute('data-error')) return;
        lastAudition = current.clip;
        playbackStatus.dataset.playing = '';
        playbackStatus.textContent = current.label + ' · 试听中';
      } catch (error) { voiceFailed(current, error); }
    }
    listen(audio, 'error', () => { if (playback && audio.error) voiceFailed(playback, audio.error); });
    listen(audio, 'ended', () => {
      if (!playback || !audio.ended) return;
      delete playbackStatus.dataset.playing;
      playbackStatus.textContent = playback.label;
    });
    const syncTheme = theme => {
      for (const [key, value] of Object.entries(theme?.tokens ?? {})) host.style.setProperty('--sgs-' + key, value);
    };
    syncTheme(ctx.themes?.current);
    const offTheme = ctx.themes?.subscribe(syncTheme);
    const offBackground = ctx.backgrounds?.subscribe?.(updateBackground);
    const release = scope.add(() => {
      rememberView();
      closeCurrent = null;
      request?.abort();
      backgroundRequest?.abort();
      backgroundProbe?.abort();
      closeRules?.();
      previewRequest?.abort();
      effectPicker?.stop();
      stopVoice();
      request = null;
      clearHeads();
      offTheme?.();
      offBackground?.();
      for (const off of listeners) off();
      if (dialog.open) dialog.close();
      offStyles();
      host.remove();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
    closeCurrent = release;
    listen(backgroundButton, 'click', async () => {
      updateBackground();
      if (!backgroundBlob || backgroundRequest) return;
      const key = backgroundKey, entry = activeArtwork;
      const name = !mobile && catalogue.skinForms(artwork).length > 1
        ? `${skinLabel(entry)} · ${formLabel(artForm + 1)}` : skinLabel(entry);
      const pending = backgroundRequest = new win.AbortController();
      const { signal } = pending;
      backgroundStatus.hidden = true;
      updateBackground();
      try {
        const blob = backgroundBlob;
        const file = new win.File([blob], name, { type: blob.type });
        await ctx.backgrounds.selectSkinImage(file, key, Boolean(entry.mobileMotion || entry.motion), signal);
      } catch (failure) {
        if (signal.aborted) return;
        backgroundStatus.textContent = failure.message;
        backgroundStatus.hidden = false;
      } finally {
        if (backgroundRequest === pending && !signal.aborted) {
          backgroundRequest = null;
          updateBackground();
        }
      }
    });
    listen(formButton, 'click', () => {
      const entry = artwork;
      if (formButton.hidden || request) return;
      effectPicker?.stop();
      const count = catalogue.skinForms(entry).length;
      closeRules = openForms({ generalId: recipient.id, name: skinLabel(entry), value: formConfig(entry), draft: skinDraft(entry).ruleEdit,
        count, allowDefault: count === 2, transitions: catalogue.skinTransitions?.(entry), customTransitions: mobile, trigger: formButton,
        onDraft(config) { editDraft({ ruleEdit: config }); },
        onApply(config) { editDraft({ rule: config, ruleEdit: null }); } });
    });
    function appendResults(start) {
      const end = Math.min(start + pageSize, matches.length);
      for (let index = start; index < end; index++) {
        const entry = matches[index], row = doc.createElement('button');
        row.type = 'button';
        row.dataset.result = index;
        row.className = 'result';
        row.setAttribute('aria-pressed', 'false');
        const label = doc.createElement('span'), info = doc.createElement('small');
        label.className = 'name';
        label.textContent = entry.name;
        const listedMotion = entry.motion || (entry.mobileMotion && !entry.mobileForm) || entry.isDynamic;
        info.textContent = `${entry.general} · #${entry.number ?? entry.id}${listedMotion ? ' · 动态' : ''}`;
        row.title = label.textContent + ' · ' + info.textContent;
        label.append(' ', info);
        const frame = doc.createElement('span');
        frame.className = 'thumb';
        frame.setAttribute('aria-hidden', 'true');
        row.append(label, frame);
        results.append(row);
        if (entry.head) {
          const thumb = doc.createElement('img');
          thumb.alt = '';
          thumb.hidden = true;
          frame.append(thumb);
          heads.observe(frame);
        }
      }
      if (end < matches.length) {
        const more = doc.createElement('button');
        more.type = 'button';
        more.dataset.more = end;
        more.textContent = '显示更多';
        results.append(more);
      }
    }
    function showMatches(preferredEntry) {
      clearHeads();
      headRequests = new win.AbortController();
      selected = null;
      picked = null;
      showSelection(null);
      updateApply();
      matches = searchResult.categories.get(chosenCategory) ?? searchResult.all;
      if (preferredEntry) {
        const key = skinKeyForDraft(preferredEntry);
        matches = [preferredEntry, ...matches.filter(entry => skinKeyForDraft(entry) !== key)];
      }
      count.textContent = !mobile && !input.value.trim() ? '输入武将名搜索' :
        matches.length ? `${matches.length} 款皮肤` : '未找到匹配的皮肤';
      if (catalogue.configStatus === 'cached') count.textContent += ' · 使用缓存';
      if (catalogue.configStatus === 'fallback') count.textContent += ' · 官方名称暂未更新';
      results.replaceChildren();
      results.scrollTop = 0;
      appendResults(0);
    }
    function markResult(row) {
      selected?.setAttribute('aria-pressed', 'false');
      selected = row;
      selected?.setAttribute('aria-pressed', 'true');
    }
    function voiceButton(label, id) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.dataset.skill = id;
      button.textContent = label;
      button.title = label;
      return button;
    }
    const voiceTargets = () => recipient && skills !== undefined ? [...(skills ?? []), { id: DEATH_VOICE, name: '阵亡' }] : [];
    function formIndex(entry, key) {
      return Math.max(0, catalogue.skinForms(entry).findIndex((variant, index) => skinVoiceFormKey(variant, index + 1) === key));
    }
    function voicesAt(entry, index) {
      if (!entry) return [];
      const count = catalogue.skinForms(entry).length;
      return catalogue.skinVoices(entry, count > 1 ? index + 1 : undefined);
    }
    function sourceReference(id, entry = shownGroup, index = shownForm, destination = artForm) {
      if (entry.id === artwork.id && entry.general === artwork.general && index === destination) return id;
      const variants = catalogue.skinForms(entry);
      return yjcmVoiceReference(variants[index], id, !mobile && variants.length > 1 ? index + 1 : undefined);
    }
    function bindAllForms() {
      const changes = new Map();
      if (!artwork || !shownGroup || !voiceTargets().length) return changes;
      const sourceForms = catalogue.skinForms(shownGroup), targetForms = catalogue.skinForms(artwork);
      targetForms.forEach((variant, index) => {
        const sourceIndex = targetForms.length > 1 && sourceForms.length > 1 ? index : shownForm;
        if (!sourceForms[sourceIndex]) return;
        const current = voiceBindingsForForm(voiceConfig, variant, index + 1);
        const automatic = Object.entries(bindVoicesInOrder(skills ?? [], voicesAt(shownGroup, sourceIndex), current));
        if (!automatic.length) return;
        changes.set(index, { ...current, ...Object.fromEntries(automatic.map(([id, refs]) =>
          [id, refs.map(ref => sourceReference(ref, shownGroup, sourceIndex, index))])) });
      });
      return changes;
    }
    function bindSkillVoice(skill) {
      const changes = new Map(), variants = catalogue.skinForms(artwork);
      const chosenVoice = voices.find(voice => voice.id === source);
      const chosenRef = chosenVoice && sourceReference(chosenVoice.id);
      const selected = resolveVoiceBindings(skills, artVoices, bindings)[skill];
      const remove = chosenRef !== undefined && Array.isArray(selected) && selected.includes(chosenRef);
      const sourceForms = shownGroup ? catalogue.skinForms(shownGroup) : [];
      variants.forEach((variant, index) => {
        const current = voiceBindingsForForm(voiceConfig, variant, index + 1);
        if (source === NATIVE_VOICE || source === 0) {
          changes.set(index, { ...current, [skill]: source === NATIVE_VOICE ? NATIVE_VOICE : [] });
          return;
        }
        const sourceIndex = index !== artForm && sourceForms[index] ? index : shownForm;
        const available = voicesAt(shownGroup, sourceIndex);
        const voice = available.find(item => item.id === chosenVoice?.id) ??
          available.find(item => item.name === chosenVoice?.name && isBindableVoice(item));
        if (!voice) return;
        const reference = sourceReference(voice.id, shownGroup, sourceIndex, index);
        const refs = new Set(available.filter(isBindableVoice).map(item => sourceReference(item.id, shownGroup, sourceIndex, index)));
        const bound = resolveVoiceBindings(skills, voicesAt(artwork, index), current)[skill];
        const chosen = Array.isArray(bound) ? bound.filter(ref => refs.has(ref)) : [];
        changes.set(index, { ...current, [skill]: remove ? chosen.filter(ref => ref !== reference) : [...new Set([...chosen, reference])] });
      });
      return changes;
    }
    function loadBindings() {
      bindings = remapVoiceBindings(voiceBindingsForForm(voiceConfig, activeArtwork, artForm + 1), artVoices);
    }
    function saveBindings(changes) {
      voiceConfig = updateVoiceBindingsForForms(voiceConfig, catalogue.skinForms(artwork), changes);
      loadBindings();
      editDraft({ bindings: voiceConfig });
      updateBindings();
    }
    function bindingLabels(bound, id, hasUnmatchedClips) {
      if (bound === NATIVE_VOICE) return ['保留原配音'];
      const names = (bound ?? []).map(reference => {
        const foreign = typeof reference === 'string';
        const voice = foreign ? catalogue.findVoice(reference, catalogue.skinForms(artwork).length > 1 ? artForm + 1 : undefined) :
          artVoices.find(item => item.id === reference);
        if (!voice || !isBindableVoice(voice)) return;
        const entry = foreign ? voice.entry : activeArtwork;
        return skinLabel(entry) + ' · ' + voice.name;
      }).filter(Boolean);
      if (names.length) return names;
      const hasRandom = id === DEATH_VOICE ? artVoices.some(voice => voice.id === DEATH_VOICE) :
        bound?.length === 0 ? artVoices.some(isAutomaticSkillVoice) : hasUnmatchedClips;
      return hasRandom ? ['随机配音 · ' + skinLabel(activeArtwork)] : ['原配音'];
    }
    function updateBindings() {
      const effective = resolveVoiceBindings(skills, artVoices, bindings);
      const hasUnmatchedClips = unmatchedSkillClips(skills, artVoices).size > 0;
      const sourceReferenceId = Number.isInteger(source) && source !== 0 ? sourceReference(source) : undefined;
      bindAll.disabled = !bindAllForms().size;
      for (const group of [sourceSkills, sourceUnidentified]) {
        for (const button of group.children) button.setAttribute('aria-pressed', String(sourceId(button) === source));
      }
      for (const button of ownSkills.children) {
        const bound = effective[button.dataset.skill];
        const targetId = Number(button.dataset.skill);
        const keepNative = bound === NATIVE_VOICE;
        const labels = bindingLabels(bound, targetId, hasUnmatchedClips);
        const selected = keepNative ? source === NATIVE_VOICE :
          source === 0 ? !bound?.length :
            sourceReferenceId !== undefined && Boolean(bound?.includes(sourceReferenceId));
        button.disabled = Number.isInteger(source) && source !== 0 &&
          (targetId === DEATH_VOICE) !== (source === DEATH_VOICE);
        button.lastElementChild.replaceChildren(...labels.map(label => {
          const line = doc.createElement('span');
          line.textContent = label;
          return line;
        }));
        button.title = [button.firstChild.textContent, ...labels].join('\n');
        button.setAttribute('aria-pressed', String(selected));
      }
      if (source === undefined) hint.textContent = !shownEntry ? '从列表选择配音来源。' :
        voices.some(isBindableVoice) ? '点配音试听，再选要绑定的技能。' :
          voices.length ? '选一条配音试听。' : '这款皮肤暂无可用配音。';
      else if (source === NATIVE_VOICE) hint.textContent = '选择要保留 OL 原配音的项目。';
      else if (source === 0) hint.textContent = '选择要使用随机配音的项目。';
      else hint.textContent = source === DEATH_VOICE ? '点阵亡绑定或取消。' : '点技能绑定或取消。';
    }
    function updateAudioOptions() {
      const canReplace = mobile && canApply && artwork && !voiceOnly;
      cardOption.hidden = !canReplace || !catalogue.skinForms(artwork).some((_form, index) =>
        voicesAt(artwork, index).some(voice => voice.kind === 'card' && voice.urls.length));
      victoryOption.hidden = !canReplace;
      victoryHint.hidden = !canReplace || !victoryVoice.checked || !sourceVictory.hidden;
      audioOptions.hidden = cardVoices.hidden && sourceVictory.hidden && victoryOption.hidden && cardOption.hidden;
    }
    function showSkills() {
      sourceSkills.replaceChildren();
      sourceCards.replaceChildren();
      sourceUnidentified.replaceChildren();
      sourceVictory.replaceChildren();
      ownSkills.replaceChildren();
      const targets = voiceTargets();
      bindAll.hidden = !targets.length || !artwork || !shownGroup || !catalogue.skinForms(shownGroup).some((_variant, index) =>
        voicesAt(shownGroup, index).some(voice => voice.id === DEATH_VOICE || isAutomaticSkillVoice(voice)));
      bindAll.title = '优先匹配同名技能，其余配音按顺序循环绑定';
      hint.textContent = !voices.length ? '这款皮肤暂无可用配音。' : recipient && skills === undefined ?
        '点外服技能试听，正在读取武将技能。' : '重复点同一技能，按顺序试听各句。';
      const victories = voices.filter(voice => voice.kind === 'victory');
      for (const voice of voices) {
        const button = voiceButton(voice.name, voice.id);
        button.title = voice.name + (isBindableVoice(voice) ? ' · 点击依次试听' : ' · 仅供试听');
        if (voice.kind === 'victory') {
          const label = doc.createElement('span');
          label.textContent = victories.length === 1 ? '胜利配音' : voice.name;
          button.setAttribute('aria-label', '试听' + label.textContent);
          button.replaceChildren(ctx.ui.icon('play'), label);
        }
        const group = voice.kind === 'card' ? sourceCards : voice.kind === 'victory' ? sourceVictory :
          voice.kind === 'unidentified' ? sourceUnidentified : sourceSkills;
        group.append(button);
      }
      cardVoices.hidden = !sourceCards.childElementCount;
      sourceVictory.hidden = !sourceVictory.childElementCount;
      unidentifiedVoices.hidden = !sourceUnidentified.childElementCount;
      updateAudioOptions();
      if (!targets.length || !artwork) return;
      sourceSkills.append(voiceButton('随机', 0));
      sourceSkills.append(voiceButton('保留原配音', NATIVE_VOICE));
      for (const { id, name } of targets) {
        const button = voiceButton(name, id);
        const label = doc.createElement('span');
        label.textContent = name;
        button.replaceChildren(label, doc.createElement('small'));
        ownSkills.append(button);
      }
      updateBindings();
    }
    function bindingFor(entry) {
      if (sameContext()) return local.portraitBinding(recipient, kind, entry);
    }
    function chooseArtwork(entry) {
      const changing = artwork !== entry, variants = catalogue.skinForms(entry), draft = skinDraft(entry);
      const saved = bindingFor(entry);
      artwork = entry;
      if (changing) {
        const savedEntry = mobile && saved ? resolveReference(saved) : undefined;
        const savedForm = mobile && saved ? String(saved.form ?? savedEntry?.number ?? saved.id) : undefined;
        artForm = formIndex(entry, draft.form ?? savedForm);
        voiceConfig = draft.bindings ?? saved?.bindings ?? {};
        const savedEffects = entry.mobileFamily && savedEntry && savedEntry !== entry
          ? local.effectBindings?.(recipient, savedEntry) : undefined;
        const currentEffects = local.effectBindings?.(recipient, entry);
        inheritedEffects = savedEffects && Object.keys(savedEffects).length ? { ...savedEffects, ...currentEffects } : undefined;
        effectPicker.show(variants, draft.effects ?? inheritedEffects ?? currentEffects);
      }
      selectionTitle.textContent = entry.name;
      effectPicker.setForm(artForm + 1);
      if (mobile) {
        const audio = normalizeMobileVoiceOptions(draft.audio ?? saved?.voiceOptions);
        cardVoice.checked = audio.card;
        victoryVoice.checked = audio.victory;
      }
      const variant = variants[artForm];
      if (activeArtwork !== variant || seatPreviewError || artStatus.textContent === '预览暂不可用') loadArtworkPreview(variant);
      activeArtwork = variant;
      artVoices = voicesAt(entry, artForm);
      loadBindings();
      void catalogue.prepare?.(entry, bindings)?.then(() => {
        if (artwork !== entry || !host.isConnected || !sameContext()) return;
        artVoices = voicesAt(entry, artForm);
        loadBindings();
        if (shownGroup === entry) {
          voices = voicesAt(shownGroup, shownForm);
          showSkills();
        } else updateBindings();
      });
    }
    function showSelection(entry, index = voiceOnly ? 0 : artForm) {
      const variants = entry ? catalogue.skinForms(entry) : [];
      shownGroup = entry;
      formList.hidden = variants.length < 2;
      formList.replaceChildren(...(formList.hidden ? [] : variants.map((form, i) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.dataset.form = i;
        button.textContent = form.formButtonLabel ?? formLabel(i + 1);
        if (form.formName && form.formName !== button.textContent) button.title = form.formName;
        return button;
      })));
      showForm(index);
    }
    function showForm(index) {
      stopVoice();
      const entry = shownGroup;
      shownForm = index;
      shownEntry = entry ? catalogue.skinForms(entry)[index] : undefined;
      skinKey = shownEntry ? shownEntry.general + ':' + skinVoiceFormKey(shownEntry, index + 1) + ':' + entry.id : '';
      voices = voicesAt(entry, index);
      for (const button of formList.children) button.setAttribute('aria-pressed', String(Number(button.dataset.form) === index));
      source = undefined;
      cardVoices.open = false;
      unidentifiedVoices.open = false;
      selection.hidden = !artwork;
      if (!artwork) return;
      const button = formList.children[index];
      if (button && shownEntry?.mobileFamily) {
        const list = formList.getBoundingClientRect(), item = button.getBoundingClientRect();
        formList.scrollLeft += Math.min(0, item.left - list.left) + Math.max(0, item.right - list.right);
      }
      showSkills();
    }
    listen(formList, 'click', event => {
      const button = event.target.closest('button');
      if (!button || request || button.getAttribute('aria-pressed') === 'true') return;
      const index = Number(button.dataset.form);
      if (!voiceOnly) {
        artForm = index;
        chooseArtwork(artwork);
      }
      showForm(index);
      if (!voiceOnly) editDraft({ form: skinVoiceFormKey(activeArtwork, artForm + 1) });
      updateApply();
    });
    function clearDemo() {
      demoToggle?.remove();
      demoToggle = null;
      if (!demo) return;
      demo.pause();
      demo.removeAttribute('src');
      demo.load();
      demo.remove();
      demo = null;
    }
    function loadArtworkPreview(entry) {
      previewRequest?.abort();
      clearDemo();
      const pending = previewRequest = new win.AbortController();
      seatPreviewError = null;
      artStatus.textContent = '载入预览…';
      art.replaceChildren(artStatus);
      const imageRequest = target ? loadMatchPreview() : loadPreview(win, entry, pending.signal);
      const canvas = !target && (entry.motion || entry.mobileMotion) ? doc.createElement('canvas') : null;
      if (canvas) {
        canvas.width = 192;
        canvas.height = 256;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', entry.name + '动态预览');
        const motion = entry.mobileMotion ? previewSeatMotion(win, canvas, pending.signal, () => loadMobileMotion(win, entry, pending.signal))
          : previewYjcmMotion(win, entry, canvas, pending.signal);
        void motion.then(playing => {
          if (playing && !pending.signal.aborted) art.append(canvas);
        }).catch(() => {});
      }
      if (entry.details?.video && !entry.motion) {
        demoToggle = doc.createElement('button');
        demoToggle.type = 'button';
        demoToggle.className = 'demo-toggle';
        demoToggle.textContent = '播放官方演示';
        demoToggle.addEventListener('click', () => {
          demo = doc.createElement('video');
          demo.className = 'demo';
          demo.controls = true;
          demo.muted = true;
          demo.playsInline = true;
          demo.src = entry.details.video;
          demoToggle.replaceWith(demo);
          demoToggle = null;
          void demo.play().catch(() => {});
        }, { once: true });
        selection.append(demoToggle);
      }
      async function loadMatchPreview() {
        if (matchScene !== ctx.game.getScene?.() || ctx.native.account().id !== accountId) return;
        const seatImage = local.previewYjcm(target, entry, pending.signal).catch(failure => {
          if (pending.signal.aborted) return;
          seatPreviewError = failure.message;
          if (!request) clearStatus();
        });
        return await loadWindow(win, entry, pending.signal).catch(() => undefined) ?? seatImage;
      }
      void imageRequest.then(image => {
        if (pending.signal.aborted) return;
        if (!image) { artStatus.textContent = '预览暂不可用'; return; }
        image.alt = entry.name + '预览';
        artStatus.replaceWith(image);
      }).catch(() => { if (!pending.signal.aborted) artStatus.textContent = '预览暂不可用'; });
    }
    void skillRequest.then(result => {
      skills = result;
      if (!host.isConnected) return;
      effectPicker?.setSkills(result);
      if (!selection.hidden) showSkills();
    });
    function chooseVoice(event) {
      const button = event.target.closest('button');
      if (!button || request) return;
      const id = sourceId(button);
      const voice = voices.find(item => item.id === id);
      if (voice) void playVoice(voice);
      else stopVoice();
      if (voiceTargets().length && artwork) {
        source = id;
        updateBindings();
      }
    }
    listen(sourceSkills, 'click', chooseVoice);
    listen(sourceUnidentified, 'click', chooseVoice);
    const auditionVoice = event => {
      const button = event.target.closest('button');
      if (button && !request) {
        const voice = voices.find(item => item.id === sourceId(button) && !isBindableVoice(item));
        if (voice) void playVoice(voice);
      }
    };
    listen(sourceCards, 'click', auditionVoice);
    listen(sourceVictory, 'click', auditionVoice);
    listen(ownSkills, 'click', event => {
      const button = event.target.closest('button');
      if (!button || request) return;
      if (source === undefined) { hint.textContent = '请先选择外服技能。'; return; }
      saveBindings(bindSkillVoice(button.dataset.skill));
    });
    listen(bindAll, 'click', () => {
      if (request) return;
      const changes = bindAllForms();
      if (!changes.size) return;
      source = undefined;
      saveBindings(changes);
      hint.textContent = catalogue.skinForms(artwork).length > 1
        ? `已为 ${changes.size} 个形态绑定配音。` : '已绑定配音。';
    });
    for (const option of [cardVoice, victoryVoice]) listen(option, 'change', () => {
      if (!artwork || request) return;
      editDraft({ audio: { card: cardVoice.checked, victory: victoryVoice.checked } });
      updateAudioOptions();
    });
    function search(category, preferredEntry) {
      if (!catalogue) return;
      searchResult = catalogue.searchSkins(input.value);
      chosenCategory = searchResult.categories.has(category) ? category : '';
      categories.hidden = searchResult.categories.size < 2;
      categories.replaceChildren();
      if (!categories.hidden) {
        for (const name of ['', ...searchResult.categories.keys()]) {
          const button = doc.createElement('button');
          button.type = 'button';
          button.textContent = name || '全部';
          button.dataset.general = name;
          button.setAttribute('aria-pressed', String(name === chosenCategory));
          categories.append(button);
        }
        categories.scrollLeft = 0;
      }
      showMatches(preferredEntry);
    }
    function setVoiceMode(value) {
      voiceOnly = value;
      pickVoice.setAttribute('aria-pressed', String(value));
      pickArt.setAttribute('aria-pressed', String(!value));
    }
    const resolveReference = reference => reference ? catalogue.findSkin(reference.id, reference.general) : undefined;
    function openSkin(entry, view) {
      const voice = resolveReference(view?.voice);
      input.value = typeof view?.query === 'string' ? view.query.slice(0, 80) : entry.general;
      setVoiceMode(Boolean(voice));
      search(view?.category ?? entry.general, voice ?? entry);
      markResult(results.firstElementChild);
      chooseArtwork(entry);
      showSelection(voice ?? entry, voice ? formIndex(voice, view.voice.form) : artForm);
      effectPicker.root.open = view ? view.effectOpen === true : !effectPicker.root.hidden;
      updateApply();
      selection.focus({ preventScroll: true });
      // Scroll only the picker when restoring a saved skin or draft.
      body.scrollTop += selection.getBoundingClientRect().top - body.getBoundingClientRect().top;
    }
    function showCatalogue() {
      if (!sameContext() || !autoLocate) { search(); return; }
      const boundEntry = resolveReference(binding);
      const previous = resolveReference(resume?.skin);
      const draft = previous && Object.keys(skinDraft(previous)).length ? previous : undefined;
      const bound = boundEntry && catalogue.skinForms(boundEntry)[0];
      const resumeDraftNow = draft && (!bound || skinKeyForDraft(draft) === skinKeyForDraft(bound));
      remainingDraft = resumeDraftNow ? undefined : draft;
      if (bound || draft) openSkin(bound ?? draft, resumeDraftNow ? resume : undefined);
      else search();
    }
    async function loadCatalogue() {
      retryIndex.hidden = true;
      details.hidden = true;
      details.open = false;
      count.textContent = '正在建立皮肤和语音索引…';
      try {
        catalogue = await sourceCatalogue.load();
        if (host.isConnected && sameContext() && mobile && typeof binding?.id === 'number' && !resolveReference(binding)) {
          await sourceCatalogue.resolveSkin(binding.id, binding.general).catch(() => {});
        }
        if (!host.isConnected) return;
        retryIndex.hidden = !['cached', 'fallback'].includes(catalogue.configStatus);
        showCatalogue();
      } catch (failure) {
        if (!host.isConnected) return;
        count.textContent = '皮肤索引加载失败';
        errorTitle.textContent = '索引加载失败详情';
        error.textContent = failure?.message || String(failure);
        details.hidden = false;
        retryIndex.hidden = false;
      }
    }
    listen(retryIndex, 'click', () => {
      if (!autoLocate || input.autofocus) input.focus();
      void loadCatalogue();
    });
    listen(input, 'focus', () => { if (!input.autofocus) autoLocate = false; });
    listen(input, 'input', () => { autoLocate = false; search(); });
    listen(resumeDraft, 'click', () => {
      if (request || !remainingDraft || !sameContext()) return;
      autoLocate = false;
      openSkin(remainingDraft, resume);
    });
    listen(pickVoice, 'click', () => {
      if (request || voiceOnly || !artwork) return;
      setVoiceMode(true);
      updateApply();
    });
    listen(pickArt, 'click', () => {
      if (request || !voiceOnly) return;
      setVoiceMode(false);
      markResult(results.querySelector('[data-result="' + matches.indexOf(artwork) + '"]'));
      showSelection(artwork);
      updateApply();
    });
    listen(categories, 'click', event => {
      const button = event.target.closest('button');
      if (!button || request || chosenCategory === button.dataset.general) return;
      autoLocate = false;
      chosenCategory = button.dataset.general;
      categories.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-pressed', 'true');
      showMatches();
    });
    listen(results, 'click', async event => {
      const row = event.target.closest('button');
      if (!row || request) return;
      if (row.dataset.more !== undefined) {
        const start = Number(row.dataset.more);
        row.remove();
        appendResults(start);
        results.querySelector(`[data-result="${start}"]`)?.focus();
        return;
      }
      autoLocate = false;
      markResult(row);
      const entry = matches[Number(row.dataset.result)];
      const choice = picked = { loading: false };
      let detailError;
      if (catalogue.detail && !entry.details) {
        choice.loading = true;
        stopVoice();
        updateApply();
        note.textContent = '正在读取皮肤详情…';
        await catalogue.detail(entry).catch(error => { detailError = error; });
        if (picked !== choice || !host.isConnected || request) return;
        choice.loading = false;
      }
      if (!voiceOnly) chooseArtwork(entry);
      showSelection(entry);
      updateApply();
      if (detailError) {
        errorTitle.textContent = '皮肤详情加载失败';
        error.textContent = detailError.message;
        details.hidden = false;
      }
    });
    listen(apply, 'click', async () => {
      if (!canApply || !artwork || request || picked?.loading) return;
      const entry = artwork;
      const effects = skinDraft(entry).effects ?? inheritedEffects;
      const startingForm = mobile && artForm > 0 ? activeArtwork.number ?? activeArtwork.id : undefined;
      const audio = mobile ? { card: cardVoice.checked, victory: victoryVoice.checked } : undefined;
      const pending = request = new win.AbortController();
      clearStatus();
      stopVoice();
      effectPicker?.setBusy(true);
      input.disabled = apply.disabled = true;
      try {
        if (ctx.native.account().id !== accountId) throw new Error('游戏账号已切换，请重新打开皮肤选择。');
        if (general) {
          local.rememberYjcm(general.id, entry, voiceConfig, formConfig(entry), effects, startingForm, audio);
          discardDraft(entry);
          release();
          ctx.notify?.(ctx.settings.get('crossServer', false) ?
            '已保存，下次使用此武将时生效。' : '已保存，启用外服换肤后使用此武将时生效。');
          return;
        }
        if (matchScene !== ctx.game.getScene?.()) throw new Error('牌局已变化，请重新打开皮肤选择。');
        note.textContent = '正在读取官方立绘…';
        const applied = await local.applyYjcm(target, entry, voiceConfig, pending.signal, formConfig(entry),
          undefined, undefined, effects, startingForm, audio);
        if (request !== pending) return;
        if (!applied) throw new Error('当前座位已变化或外服换肤已关闭。');
        discardDraft(entry);
        release();
        onApply?.();
        ctx.notify?.(`已应用${title}，仅自己可见。`);
      } catch (failure) {
        if (request !== pending) return;
        note.textContent = failure.message.split('\n', 1)[0];
        error.textContent = failure.message;
        details.hidden = !failure.message.includes('\n');
      } finally {
        if (request === pending) {
          request = null;
          input.disabled = apply.disabled = false;
          effectPicker?.setBusy(false);
        }
      }
    });
    listen(close, 'click', release);
    listen(dialog, 'close', release);
    listen(dialog, 'cancel', event => { event.preventDefault(); release(); });
    listen(dialog, 'keydown', event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); release(); }
    });
    input.value = initialQuery ?? recipient?.name ?? '';
    input.autofocus = !binding && !resume?.skin;
    if (mobile) {
      input.placeholder = '武将名、皮肤名或编号';
      input.setAttribute('aria-label', '搜索移动版武将名、皮肤名或编号');
    }
    doc.body.append(host);
    dialog.showModal();
    if (catalogue && !mobile) showCatalogue();
    else void loadCatalogue();
    return release;
  };
}
