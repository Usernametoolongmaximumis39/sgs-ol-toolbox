import { EDITION } from '../core/distribution.js';
import { CORE_VERSION } from '../core/version.js';

const FEEDBACK_URL = 'https://redeem.3gs.xyz/feedback';

export const FEEDBACK_STYLES = `
.feedback-form{display:grid;gap:7px;min-width:0}
.feedback-form textarea{box-sizing:border-box;width:100%;min-height:76px;resize:vertical;padding:8px 9px;border:1px solid var(--sgs-border);border-radius:7px;background:var(--sgs-surface);color:var(--sgs-text);font:13px/1.5 var(--sgs-font,sans-serif)}
.feedback-form textarea::placeholder{color:var(--sgs-muted)}
.feedback-form textarea:focus{outline:1px solid var(--sgs-accent);outline-offset:1px;border-color:var(--sgs-accent)}
.feedback-form .actions{align-items:center;margin-top:0}
.feedback-form .actions button{padding-inline:10px;white-space:nowrap}
.feedback-form .actions button:enabled{color:var(--sgs-accent);border-color:var(--sgs-accent)}
.feedback-form .actions button:disabled{opacity:.55}
.feedback-status:empty{display:none}
.feedback-form .feedback-status.error{color:var(--sgs-danger)}
`;

export function createFeedbackForm(win, doc, scope, getAccount = () => ({})) {
  const form = doc.createElement('form');
  form.className = 'feedback-form';
  form.innerHTML = `
    <textarea name="message" aria-label="反馈内容" aria-describedby="feedback-disclosure" maxlength="2000" rows="3" placeholder="描述遇到的问题或想要的功能" required></textarea>
    <span id="feedback-disclosure" class="muted">提交时发送反馈内容、工具箱版本及可读取的游戏 ID 和昵称。服务器会记录连接 IP。请勿填写密码。</span>
    <div class="actions"><button type="submit" disabled>提交反馈</button></div>
    <span class="feedback-status muted" role="status"></span>`;
  const input = form.elements.message;
  const submit = form.querySelector('button');
  const status = form.querySelector('[role=status]');
  let attempt;

  const showStatus = (message, error = false) => {
    status.classList.toggle('error', error);
    status.textContent = message;
  };
  input.addEventListener('input', () => {
    if (input.readOnly) return;
    submit.disabled = !input.value.trim();
    showStatus('');
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const message = input.value.trim();
    if (!message || input.readOnly || scope.closed) return;

    const account = getAccount();
    const userId = /^[1-9][0-9]{0,31}$/.test(account.id) ? account.id : null;
    const nickname = userId ? Array.from(account.nickname?.trim() || '').slice(0, 128).join('') || null : null;
    if (attempt?.message !== message || attempt.userId !== userId || attempt.nickname !== nickname) {
      const id = Array.from(win.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
      attempt = { id, message, version: `${CORE_VERSION}-${EDITION}`, userId, nickname };
    }
    const controller = new win.AbortController();
    const timeout = win.setTimeout(() => controller.abort(), 10000);
    const release = scope.add(() => { win.clearTimeout(timeout); controller.abort(); });
    input.readOnly = true;
    submit.disabled = true;
    showStatus('正在提交…');
    try {
      const response = await win.fetch(FEEDBACK_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt),
        credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
      });
      if (response.status === 429) {
        showStatus('提交过于频繁，请稍后重试。', true);
      } else if (response.ok && (await response.json())?.ok === true) {
        input.value = '';
        attempt = undefined;
        showStatus('反馈已收到，感谢提供意见。');
      } else {
        showStatus('提交失败，内容已保留。请稍后重试。', true);
      }
    } catch {
      if (!scope.closed) showStatus('暂时无法确认送达，内容已保留。请稍后重试。', true);
    } finally {
      release();
      input.readOnly = false;
      submit.disabled = !input.value.trim();
    }
  });
  return form;
}
