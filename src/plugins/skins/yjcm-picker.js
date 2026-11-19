import { CONTROL_STYLES, controlIcon } from '../../ui/controls.js';
import { account } from '../../shared/info-runtime.js';
import { bindVoicesInOrder, DEATH_VOICE, loadCardSkills, NATIVE_VOICE, remapVoiceBindings, resolveVoiceBindings } from './cross-voice.js';
import { loadYjcmHead, loadYjcmPreview, loadYjcmWindow, yjcmVoiceReference } from './yjcm.js';
import { previewYjcmMotion } from './yjcm-motion.js';

const pageSize = 36;
const sourceId = button => button.dataset.skill === NATIVE_VOICE ? NATIVE_VOICE : Number(button.dataset.skill);
const skinLabel = entry => `${entry.general} · ${entry.name} #${entry.id}`;
const styles = `
:host{color-scheme:var(--sgs-scheme,dark)}
dialog{box-sizing:border-box;width:min(486px,calc(100% - 24px));max-width:none;max-height:calc(100% - 24px);margin:auto;padding:0;overflow:hidden;border:1px solid var(--sgs-border,#665b42);border-radius:14px;background:var(--sgs-bg,#201e1a);color:var(--sgs-text,#eee3cc);box-shadow:0 18px 54px #0008;font:calc(14px + var(--sgs-font-offset,0px))/1.45 var(--sgs-font,"Microsoft YaHei",sans-serif)}
dialog[open]{display:flex;flex-direction:column}
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
.rules{grid-column:1/-1;justify-self:start;min-height:32px;white-space:nowrap}
.art{position:relative;display:grid;place-items:center;aspect-ratio:3/4;overflow:hidden;border-radius:7px;background:var(--sgs-surface,#2c2922)}
.art img{width:100%;height:100%;object-fit:contain;min-height:0}
.art canvas{position:absolute;inset:0;width:100%;height:100%;background:var(--sgs-surface,#2c2922)}
.art-status{padding:.25em;text-align:center;font-size:.82em}
.voice{display:grid;align-self:start;min-width:0;gap:.35em}
.voice-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.35em .55em}
.voice-head strong,.voice-head button{white-space:nowrap}
.voice-head button,.voice-group button{min-height:34px}
.voice-group{display:flex;flex-wrap:wrap;gap:.3em;min-width:0}
.voice-group button{max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.voice-group button[aria-pressed=true]{border-color:var(--sgs-accent,#dbba70);background:var(--sgs-raised,#332d23);box-shadow:inset 2px 0 var(--sgs-accent,#dbba70)}
.voice-own{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr);gap:2px}
.voice-own button{display:grid;grid-template-columns:minmax(4.4em,24%) minmax(0,1fr);align-items:baseline;gap:.5em;text-align:left;white-space:normal;overflow-wrap:anywhere;background:transparent;border-color:transparent;box-shadow:inset 0 -1px var(--sgs-border,#665b42)}
.voice-own button:disabled{opacity:1;color:var(--sgs-muted,#b7aa8c)}
.voice-own small{min-width:0;color:var(--sgs-muted,#b7aa8c)}
.voice-own small span{display:block}
.voice-hint,.voice-playback{font-size:.88em}
.voice-playback[data-playing]{color:var(--sgs-accent,#dbba70)}
.voice-playback[data-error]{color:var(--sgs-danger,#e68780)}
.footer{border-top:1px solid var(--sgs-border,#665b42)}
.footer button{flex:none;white-space:nowrap;color:var(--sgs-accent,#dbba70)}
@media(max-width:320px){.footer{display:grid;grid-template-columns:1fr}.footer button{justify-self:end}}
p{margin:0;overflow-wrap:anywhere}
details{min-width:0;color:var(--sgs-danger,#e68780)}
details p{white-space:pre-wrap;overflow-wrap:anywhere;font-size:.9em}
[hidden]{display:none!important}
`;

export function createYjcmPicker(ctx, local, openForms) {
  let closeCurrent;
  return function open({ target, general, trigger, onApply, initialQuery } = {}) {
    if (ctx.scope.signal.aborted) return;
    closeCurrent?.();
    const { document: doc, window: win, scope } = ctx;
    const accountId = account(ctx).id;
    const matchScene = target && ctx.game.getScene?.();
    const recipient = target ?? general;
    const canApply = Boolean(target || (general && accountId));
    const host = doc.createElement('div');
    host.dataset.sgsYjcmSkins = '';
    const toolbox = doc.querySelector('[data-sgs-toolbox="core"]');
    if (toolbox) host.style.setProperty('--sgs-font-offset', win.getComputedStyle(toolbox).getPropertyValue('--sgs-font-offset'));
    const shadow = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = CONTROL_STYLES + styles;
    const dialog = doc.createElement('dialog');
    dialog.setAttribute('aria-labelledby', 'yjcm-title');
    dialog.toggleAttribute('data-seat-preview', Boolean(target));
    dialog.innerHTML = `
      <header class="head"><h2 id="yjcm-title">一将成名皮肤</h2><button class="close" type="button" aria-label="关闭" title="关闭"></button></header>
      <div class="body">
        <input class="sgs-input" type="search" aria-label="搜索所属武将" placeholder="搜索所属武将" maxlength="80" autofocus>
        <div class="categories sgs-segments" role="group" aria-label="按所属武将筛选" hidden></div>
        <div class="purpose sgs-segments" role="group" aria-label="皮肤选择用途" hidden>
          <button type="button" aria-pressed="true">选立绘</button><button type="button" aria-pressed="false" disabled>选配音</button>
        </div>
        <p class="count" role="status"></p>
        <button class="index-retry" type="button" hidden>重试加载</button>
        <div class="results" aria-label="皮肤搜索结果"></div>
        <section class="selection" aria-label="所选皮肤" hidden>
          <button type="button" class="rules" hidden>形态规则</button>
          <div class="voice">
            <div class="voice-head"><strong>配音</strong><button class="bind-all" type="button" hidden>一键绑定</button></div>
            <p class="voice-hint" role="status"></p>
            <div class="voice-group voice-source" role="group" aria-label="外服技能"></div>
            <p class="voice-playback" role="status" hidden></p>
            <audio crossorigin="anonymous" preload="none" hidden></audio>
          </div>
          <div class="art"><p class="art-status" role="status"></p></div>
          <div class="voice-group voice-own" role="group" aria-label="武将技能"></div>
        </section>
        <details hidden><summary>加载失败详情</summary><p></p></details>
      </div>
      <footer class="footer"><p role="status"></p><button type="button" disabled>使用皮肤</button></footer>`;
    shadow.append(style, dialog);
    const input = dialog.querySelector('input'), results = dialog.querySelector('.results'), count = dialog.querySelector('.count');
    const retryIndex = dialog.querySelector('.index-retry');
    const categories = dialog.querySelector('.categories');
    const purpose = dialog.querySelector('.purpose');
    const [pickArt, pickVoice] = purpose.querySelectorAll('button');
    purpose.hidden = !canApply;
    const details = dialog.querySelector('details'), error = details.querySelector('p'), errorTitle = details.querySelector('summary');
    const note = dialog.querySelector('.footer p'), apply = dialog.querySelector('.footer button'), close = dialog.querySelector('.close');
    const selection = dialog.querySelector('.selection'), art = dialog.querySelector('.art'), artStatus = dialog.querySelector('.art-status');
    const bindAll = dialog.querySelector('.bind-all'), hint = dialog.querySelector('.voice-hint');
    const sourceSkills = dialog.querySelector('.voice-source'), ownSkills = dialog.querySelector('.voice-own');
    const audio = dialog.querySelector('audio'), playbackStatus = dialog.querySelector('.voice-playback');
    const formButton = dialog.querySelector('.rules');
    close.append(controlIcon(doc, 'close'));
    const idleNote = target ? target.label + ' · 仅自己可见' :
      general ? (accountId ? general.name + ' · 局内仅自己可见' : '登录后可保存到下次对局。') : '';
    note.textContent = idleNote;
    apply.hidden = !recipient;
    if (general) apply.textContent = '下次使用';
    let request, previewRequest, seatPreviewError, matches = [], selected, searchResult, chosenCategory;
    let catalogue = local.yjcm.current;
    let voices = [], artVoices = [], skills, source, bindings = {};
    let artwork, shownEntry, voiceOnly = false, closeRules;
    const drafts = new Map(), voicePositions = new Map(), formDrafts = new Map();
    const formConfig = entry => formDrafts.has(entry) ? formDrafts.get(entry) : local.formRule?.(recipient?.id, 'cross', entry.id);
    let skinKey, playback;
    const skillRequest = recipient ? loadCardSkills(ctx, recipient.id, { includeDerived: true }).catch(() => null) : Promise.resolve([]);
    let headRequests = new win.AbortController();
    const headUrls = new Set();
    const heads = new win.IntersectionObserver(entries => {
      for (const { isIntersecting, target: frame } of entries) {
        if (!isIntersecting || !results.contains(frame)) continue;
        heads.unobserve(frame);
        const thumb = frame.firstElementChild;
        const { signal } = headRequests;
        loadYjcmHead(win, thumb.dataset.head, signal).then(blob => {
          if (signal.aborted || !results.contains(thumb)) return;
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
      pickVoice.disabled = !artwork;
      apply.disabled = !canApply || !artwork;
      formButton.hidden = !openForms || !canApply || !artwork || voiceOnly || catalogue.yjcmSkinForms(artwork).length !== 2;
      clearStatus();
    }
    function stopVoice() {
      playback = null;
      if (audio.hasAttribute('src')) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      playbackStatus.hidden = true;
      delete playbackStatus.dataset.playing;
      delete playbackStatus.dataset.error;
      playbackStatus.removeAttribute('title');
    }
    function voiceFailed(current, error) {
      if (playback !== current) return;
      delete playbackStatus.dataset.playing;
      playbackStatus.dataset.error = '';
      playbackStatus.textContent = current.label + ' · 试听失败';
      if (error?.message) playbackStatus.title = error.message;
    }
    function playVoice(voice) {
      stopVoice();
      const key = skinKey + ':' + voice.id;
      const index = voicePositions.get(key) ?? 0;
      voicePositions.set(key, (index + 1) % voice.urls.length);
      const current = playback = { label: voice.name + ' · 第 ' + (index + 1) + '/' + voice.urls.length + ' 句' };
      playbackStatus.hidden = false;
      playbackStatus.textContent = current.label + ' · 载入中';
      audio.src = voice.urls[index];
      try {
        Promise.resolve(audio.play()).then(() => {
          if (playback !== current || playbackStatus.hasAttribute('data-error')) return;
          playbackStatus.dataset.playing = '';
          playbackStatus.textContent = current.label + ' · 试听中';
        }, error => voiceFailed(current, error));
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
    const release = scope.add(() => {
      closeCurrent = null;
      request?.abort();
      closeRules?.();
      previewRequest?.abort();
      stopVoice();
      request = null;
      clearHeads();
      offTheme?.();
      for (const off of listeners) off();
      if (dialog.open) dialog.close();
      host.remove();
      if (trigger?.isConnected) trigger.focus();
    });
    closeCurrent = release;
    listen(formButton, 'click', () => {
      const entry = artwork;
      if (formButton.hidden || request) return;
      closeRules = openForms({ generalId: recipient.id, name: skinLabel(entry), value: formConfig(entry), trigger: formButton,
        onApply(config) { formDrafts.set(entry, config); } });
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
        info.textContent = `${entry.general} · #${entry.id}${entry.motion ? ' · 动态' : ''}`;
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
          thumb.dataset.head = entry.head;
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
    function showMatches() {
      clearHeads();
      headRequests = new win.AbortController();
      selected = null;
      showSelection(null);
      updateApply();
      matches = searchResult.categories.get(chosenCategory) ?? searchResult.all;
      count.textContent = !input.value.trim() ? '输入武将名搜索' : matches.length ? `${matches.length} 款皮肤` : '未找到匹配的皮肤';
      results.replaceChildren();
      results.scrollTop = 0;
      appendResults(0);
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
    const sourceReference = id => shownEntry === artwork ? id : yjcmVoiceReference(shownEntry, id);
    function bindingLabels(bound, id) {
      if (bound === NATIVE_VOICE) return ['保留原配音'];
      const names = bound.map(reference => {
        const foreign = typeof reference === 'string';
        const voice = foreign ? catalogue.findYjcmVoice(reference) : artVoices.find(item => item.id === reference);
        if (!voice) return;
        const entry = foreign ? voice.entry : artwork;
        return skinLabel(entry) + ' · ' + voice.name;
      }).filter(Boolean);
      if (names.length) return names;
      const hasRandom = artVoices.some(voice => (voice.id === DEATH_VOICE) === (id === DEATH_VOICE));
      return hasRandom ? ['随机配音 · ' + skinLabel(artwork)] : ['原配音'];
    }
    function updateBindings() {
      const effective = resolveVoiceBindings(skills, artVoices, bindings);
      const sourceReferenceId = Number.isInteger(source) && source !== 0 ? sourceReference(source) : undefined;
      bindAll.disabled = voiceTargets().every(({ id }) => effective[id] === NATIVE_VOICE);
      for (const button of sourceSkills.children) button.setAttribute('aria-pressed', String(sourceId(button) === source));
      for (const button of ownSkills.children) {
        const bound = effective[button.dataset.skill] ?? [];
        const targetId = Number(button.dataset.skill);
        const keepNative = bound === NATIVE_VOICE;
        const labels = bindingLabels(bound, targetId);
        const selected = keepNative ? source === NATIVE_VOICE :
          source === 0 ? !bound.length : sourceReferenceId !== undefined && bound.includes(sourceReferenceId);
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
        voices.length ? '点配音试听，再选要绑定的技能。' : '这款皮肤暂无可用配音。';
      else if (source === NATIVE_VOICE) hint.textContent = '选择要保留 OL 原配音的项目。';
      else if (source === 0) hint.textContent = '选择要使用随机配音的项目。';
      else hint.textContent = source === DEATH_VOICE ? '点「阵亡」绑定，再点取消。' : '点武将技能绑定，再点取消。';
    }
    function showSkills() {
      sourceSkills.replaceChildren();
      ownSkills.replaceChildren();
      const targets = voiceTargets();
      bindAll.hidden = !targets.length || !voices.length || !artwork;
      hint.textContent = !voices.length ? '这款皮肤暂无可用配音。' : recipient && skills === undefined ?
        '点外服技能试听，正在读取武将技能。' : '重复点同一技能，按顺序试听各句。';
      for (const voice of voices) {
        const button = voiceButton(voice.name, voice.id);
        button.title = voice.name + ' · 点击依次试听';
        sourceSkills.append(button);
      }
      if (!targets.length || !artwork) return;
      sourceSkills.append(voiceButton('随机', 0), voiceButton('保留原配音', NATIVE_VOICE));
      for (const { id, name } of targets) {
        const button = voiceButton(name, id);
        const label = doc.createElement('span');
        label.textContent = name;
        button.replaceChildren(label, doc.createElement('small'));
        ownSkills.append(button);
      }
      updateBindings();
    }
    function chooseArtwork(entry) {
      if (artwork !== entry || seatPreviewError || artStatus.textContent === '预览暂不可用') loadArtworkPreview(entry);
      artwork = entry;
      artVoices = catalogue.yjcmSkinVoices(entry);
      const key = entry.general + ':' + entry.id;
      bindings = drafts.get(key) ?? remapVoiceBindings(local.bindings?.(recipient, entry), artVoices);
      drafts.set(key, bindings);
    }
    function showSelection(entry) {
      stopVoice();
      shownEntry = entry;
      skinKey = entry ? entry.general + ':' + entry.id : '';
      voices = entry ? catalogue.yjcmSkinVoices(entry) : [];
      source = undefined;
      selection.hidden = !artwork;
      if (!artwork) return;
      showSkills();
    }
    function loadArtworkPreview(entry) {
      previewRequest?.abort();
      const pending = previewRequest = new win.AbortController();
      seatPreviewError = null;
      artStatus.textContent = '载入预览…';
      art.replaceChildren(artStatus);
      const imageRequest = target ? loadMatchPreview() : loadYjcmPreview(win, entry, pending.signal);
      const canvas = !target && entry.motion ? doc.createElement('canvas') : null;
      if (canvas) {
        canvas.width = 192;
        canvas.height = 256;
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', entry.name + '动态预览');
        void previewYjcmMotion(win, entry, canvas, pending.signal).then(playing => {
          if (playing && !pending.signal.aborted) art.append(canvas);
        }).catch(() => {});
      }
      async function loadMatchPreview() {
        if (matchScene !== ctx.game.getScene?.() || account(ctx).id !== accountId) return;
        const seatImage = local.previewYjcm(target, entry, pending.signal).catch(failure => {
          if (pending.signal.aborted) return;
          seatPreviewError = failure.message;
          if (!request) clearStatus();
        });
        return await loadYjcmWindow(win, entry, pending.signal).catch(() => undefined) ?? seatImage;
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
      if (host.isConnected && !selection.hidden) showSkills();
    });
    listen(sourceSkills, 'click', event => {
      const button = event.target.closest('button');
      if (!button || request) return;
      const id = sourceId(button);
      const voice = voices.find(item => item.id === id);
      if (voice) playVoice(voice);
      else stopVoice();
      if (voiceTargets().length && artwork) {
        source = id;
        updateBindings();
      }
    });
    listen(ownSkills, 'click', event => {
      const button = event.target.closest('button');
      if (!button || request) return;
      if (source === undefined) { hint.textContent = '请先选择外服技能。'; return; }
      const key = button.dataset.skill;
      const current = resolveVoiceBindings(skills, artVoices, bindings)[key];
      const bound = Array.isArray(current) ? current : [];
      if (source === NATIVE_VOICE) bindings[key] = NATIVE_VOICE;
      else if (source === 0) bindings[key] = [];
      else {
        const reference = sourceReference(source);
        const fromShownSkin = bound.filter(id => typeof id === 'number' ? shownEntry === artwork :
          catalogue.findYjcmVoice(id)?.entry === shownEntry);
        bindings[key] = fromShownSkin.includes(reference) ? fromShownSkin.filter(id => id !== reference) : [...fromShownSkin, reference];
      }
      updateBindings();
    });
    listen(bindAll, 'click', () => {
      if (request || !voiceTargets().length || !voices.length || !artwork) return;
      for (const [id, refs] of Object.entries(bindVoicesInOrder(skills ?? [], voices, bindings))) bindings[id] = refs.map(sourceReference);
      source = undefined;
      updateBindings();
      hint.textContent = '已按技能顺序循环绑定。';
    });
    function search() {
      if (!catalogue) return;
      searchResult = catalogue.searchYjcmSkins(input.value);
      chosenCategory = '';
      categories.hidden = searchResult.categories.size < 2;
      categories.replaceChildren();
      if (!categories.hidden) {
        for (const name of ['', ...searchResult.categories.keys()]) {
          const button = doc.createElement('button');
          button.type = 'button';
          button.textContent = name || '全部';
          button.dataset.general = name;
          button.setAttribute('aria-pressed', String(!name));
          categories.append(button);
        }
        categories.scrollLeft = 0;
      }
      showMatches();
    }
    async function loadCatalogue() {
      retryIndex.hidden = true;
      details.hidden = true;
      details.open = false;
      count.textContent = '正在建立皮肤和语音索引…';
      try {
        catalogue = await local.yjcm.load();
        if (host.isConnected) search();
      } catch (failure) {
        if (!host.isConnected) return;
        count.textContent = '皮肤索引加载失败';
        errorTitle.textContent = '索引加载失败详情';
        error.textContent = failure?.message || String(failure);
        details.hidden = false;
        retryIndex.hidden = false;
      }
    }
    listen(retryIndex, 'click', () => { input.focus(); void loadCatalogue(); });
    listen(input, 'input', search);
    listen(pickVoice, 'click', () => {
      if (request || voiceOnly || !artwork) return;
      voiceOnly = true;
      pickVoice.setAttribute('aria-pressed', 'true');
      pickArt.setAttribute('aria-pressed', 'false');
      updateApply();
    });
    listen(pickArt, 'click', () => {
      if (request || !voiceOnly) return;
      voiceOnly = false;
      pickVoice.setAttribute('aria-pressed', 'false');
      pickArt.setAttribute('aria-pressed', 'true');
      selected?.setAttribute('aria-pressed', 'false');
      selected = results.querySelector('[data-result="' + matches.indexOf(artwork) + '"]');
      selected?.setAttribute('aria-pressed', 'true');
      showSelection(artwork);
      updateApply();
    });
    listen(categories, 'click', event => {
      const button = event.target.closest('button');
      if (!button || request || chosenCategory === button.dataset.general) return;
      chosenCategory = button.dataset.general;
      categories.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-pressed', 'true');
      showMatches();
    });
    listen(results, 'click', event => {
      const row = event.target.closest('button');
      if (!row || request) return;
      if (row.dataset.more !== undefined) {
        const start = Number(row.dataset.more);
        row.remove();
        appendResults(start);
        results.querySelector(`[data-result="${start}"]`)?.focus();
        return;
      }
      selected?.setAttribute('aria-pressed', 'false');
      selected = row;
      row.setAttribute('aria-pressed', 'true');
      const entry = matches[Number(row.dataset.result)];
      if (!voiceOnly) chooseArtwork(entry);
      showSelection(entry);
      updateApply();
    });
    listen(apply, 'click', async () => {
      if (!canApply || !artwork || request) return;
      const entry = artwork;
      const pending = request = new win.AbortController();
      clearStatus();
      stopVoice();
      input.disabled = apply.disabled = true;
      try {
        if (account(ctx).id !== accountId) throw new Error('游戏账号已切换，请重新打开皮肤选择。');
        if (general) {
          local.rememberYjcm(general.id, entry, { ...bindings }, formConfig(entry));
          release();
          ctx.notify?.(ctx.settings.get('crossServer', false) ?
            '已保存，下次使用此武将时生效。' : '已保存，启用外服换肤后使用此武将时生效。');
          return;
        }
        if (matchScene !== ctx.game.getScene?.()) throw new Error('牌局已变化，请重新打开皮肤选择。');
        note.textContent = '正在读取官方立绘…';
        const applied = await local.applyYjcm(target, entry, { ...bindings }, pending.signal, formConfig(entry));
        if (request !== pending) return;
        if (!applied) throw new Error('当前座位已变化或外服换肤已关闭。');
        release();
        onApply?.();
        ctx.notify?.('已应用一将成名皮肤，仅自己可见。');
      } catch (failure) {
        if (request !== pending) return;
        note.textContent = failure.message.split('\n', 1)[0];
        error.textContent = failure.message;
        details.hidden = !failure.message.includes('\n');
      } finally {
        if (request === pending) {
          request = null;
          input.disabled = apply.disabled = false;
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
    doc.body.append(host);
    dialog.showModal();
    if (catalogue) search();
    else void loadCatalogue();
    return release;
  };
}
