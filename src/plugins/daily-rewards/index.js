import { PLUGIN_ICONS } from '../../ui/plugin-icons.js';
import { createNativeAdapter } from './native.js';
import { createRewardsController } from './controller.js';
import { createCodeSources } from './code-sources.js';
import { rewardExclusions } from './exclusions.js';
import { createExchangeController } from './exchange.js';
import { createExchangeAdapter } from './exchange-native.js';
import { createExchangeUI } from './exchange-ui.js';


export default {
  manifest: { id: 'daily-rewards', name: '日常领奖', version: '0.7.34', apiVersion: 1, contractVersion: 1,
    releaseNotes: "调整活动奖励领取，避免发送多余的领取请求。自动领取仍默认关闭，兑换可能消耗欢乐豆；共享兑换码需单独开启，只上传游戏明确成功的码及账号摘要。", minCoreVersion: '0.6.38', categories: ['automation'], icon: PLUGIN_ICONS['daily-rewards'], priority: 20000,
    description: '自动领取签到、任务、邮件与活动奖励，按账号记录' },
  activate(ctx) {
    const native = createNativeAdapter(ctx);
    const controller = createRewardsController({ adapter: native, settings: ctx.settings, scope: ctx.scope, sources: createCodeSources(ctx.window, { core: ctx.core }) });
    const exchangeAdapter = createExchangeAdapter(ctx, native);
    const exchange = createExchangeController({ adapter: exchangeAdapter, settings: ctx.settings, enabled: () => controller.snapshot().config.automatic });
    const exchangeUI = createExchangeUI(ctx, exchange, exchangeAdapter);
    const exchangeTick = () => {
      exchangeAdapter.bind(reply => { if (reply) exchange.reply(reply.id, reply.result); else exchange.tick(); });
      exchange.tick();
      // Request only after the account/day transition has invalidated the snapshot.
      if (exchangeAdapter.account() && ctx.settings.get(`account:${exchangeAdapter.account()}:shop-exchange`, {}).selected?.length) exchangeAdapter.refresh();
      exchangeUI.refresh();
    };
    ctx.scope.interval(exchangeTick, 250); ctx.scope.add(() => exchange.stop());
    ctx.ui.registerPanel({ id: 'main', title: '日常领奖', category: 'automation', priority: 32768, render(container) {
      const doc = ctx.document;
      const el = (tag, text, className) => { const node = doc.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
      const root = el('section'); root.dataset.dailyRewards = 'main';
      const style = el('style');
      style.textContent = `
        [data-daily-rewards] .reward-heading{display:flex;align-items:center;justify-content:space-between;gap:10px}
        [data-daily-rewards] .reward-heading h3{margin:0;font-size:14px}
        [data-daily-rewards] button{touch-action:manipulation}
        [data-daily-rewards] button:disabled{cursor:default}
        [data-daily-rewards] .reward-toggle{display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:4px 7px;font-size:11px;line-height:16px;white-space:nowrap;border-radius:6px;color:var(--sgs-muted);background:transparent}
        [data-daily-rewards] .reward-toggle[aria-checked=true]{color:var(--sgs-accent);border-color:var(--sgs-accent);background:color-mix(in srgb,var(--sgs-accent) 9%,transparent)}
        [data-daily-rewards] .reward-switch{border:0;padding:0;background:transparent;box-shadow:none}
        [data-daily-rewards] .reward-switch[aria-checked=true]{background:transparent}
        [data-daily-rewards] .reward-rail{position:relative;width:25px;height:14px;flex:none;border:1px solid var(--sgs-border);border-radius:8px;background:var(--sgs-surface)}
        [data-daily-rewards] .reward-rail:after{content:'';position:absolute;top:2px;left:2px;width:8px;height:8px;border-radius:50%;background:var(--sgs-muted);transition:transform .15s,background .15s}
        [data-daily-rewards] [aria-checked=true] .reward-rail{border-color:var(--sgs-accent);background:color-mix(in srgb,var(--sgs-accent) 20%,transparent)}
        [data-daily-rewards] [aria-checked=true] .reward-rail:after{transform:translateX(11px);background:var(--sgs-accent)}
        [data-daily-rewards] [data-reward-exclusions]{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:10px 0}
        [data-daily-rewards] .reward-card{display:flex;align-items:center;justify-content:space-between;gap:4px;min-width:0;min-height:33px;padding:6px 9px;text-align:left;font-size:12px;line-height:18px;border-radius:7px;border-color:color-mix(in srgb,var(--sgs-accent) 34%,var(--sgs-border));color:var(--sgs-text);background:color-mix(in srgb,var(--sgs-accent) 6%,var(--sgs-surface));transition:background .15s,border-color .15s,color .15s}
        [data-daily-rewards] .reward-card .reward-mark{font-size:13px;color:var(--sgs-accent);line-height:1}
        [data-daily-rewards] .reward-card.is-excluded{filter:grayscale(1);color:var(--sgs-muted);border-color:color-mix(in srgb,var(--sgs-border) 60%,transparent);background:color-mix(in srgb,#000 28%,var(--sgs-surface))}
        [data-daily-rewards] .reward-card.is-excluded .reward-name{text-decoration:line-through;text-decoration-thickness:1px;opacity:.6}
        [data-daily-rewards] .reward-card.is-excluded .reward-mark{color:var(--sgs-muted);opacity:.6}
        [data-daily-rewards] .reward-card:hover{border-color:var(--sgs-accent)}
        [data-daily-rewards] [data-reward-code-options]{display:flex;align-items:center;gap:7px;margin:10px 0;font-size:12px}
        [data-daily-rewards] .reward-code-toggles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;flex:1;min-width:0}
        [data-daily-rewards] .reward-code-toggles .reward-toggle{gap:4px;padding:4px 3px}
        [data-daily-rewards] .reward-code-toggles .reward-toggle:before{content:'';width:4px;height:4px;flex:none;border-radius:50%;background:currentColor;opacity:.4}
        [data-daily-rewards] .reward-code-toggles [aria-checked=true]:before{opacity:1}
        [data-daily-rewards] .reward-status{font-size:11px;line-height:1.5;margin:7px 0 0;overflow-wrap:anywhere}
        [data-daily-rewards] details{font-size:12px;margin-top:8px}
        [data-daily-rewards] [data-rewards-log]{max-height:120px;overflow:auto}
        
        [data-daily-rewards] .reward-heading{padding-bottom:6px;border-bottom:1px solid color-mix(in srgb,var(--sgs-border) 45%,transparent);margin-bottom:6px}[data-daily-rewards] .reward-heading h3{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--sgs-accent)}
        [data-daily-rewards] .reward-rail{width:30px;height:18px;background:linear-gradient(color-mix(in srgb,var(--sgs-bg) 80%,#000),var(--sgs-surface));box-shadow:inset 0 1px 3px #0006;border-color:color-mix(in srgb,var(--sgs-border) 65%,transparent)}[data-daily-rewards] .reward-rail:after{top:3px;left:3px;width:10px;height:10px;background:linear-gradient(color-mix(in srgb,var(--sgs-muted) 85%,var(--sgs-text)),color-mix(in srgb,var(--sgs-muted) 65%,var(--sgs-bg)));box-shadow:0 1px 2px #0008}[data-daily-rewards] [aria-checked=true] .reward-rail{background:linear-gradient(color-mix(in srgb,var(--sgs-accent) 35%,var(--sgs-surface)),color-mix(in srgb,var(--sgs-accent) 17%,var(--sgs-surface)));border-color:color-mix(in srgb,var(--sgs-accent) 65%,transparent)}[data-daily-rewards] [aria-checked=true] .reward-rail:after{transform:translateX(12px);background:linear-gradient(color-mix(in srgb,var(--sgs-accent) 45%,var(--sgs-text)),var(--sgs-accent))}
        [data-daily-rewards] .reward-card{position:relative;border:1px solid color-mix(in srgb,var(--sgs-border) 40%,transparent);border-radius:8px;padding:6px 8px;min-height:34px;background:linear-gradient(140deg,color-mix(in srgb,var(--sgs-accent) 7%,transparent),color-mix(in srgb,var(--sgs-surface) 20%,transparent));box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-text) 4%,transparent)}[data-daily-rewards] .reward-card:before{content:'';position:absolute;left:0;top:10px;bottom:10px;width:2px;border-radius:2px;background:var(--sgs-accent);opacity:.7}[data-daily-rewards] .reward-card .reward-name{font-size:11px;white-space:nowrap}[data-daily-rewards] .reward-card .reward-mark{font-size:9px;font-weight:400;white-space:nowrap}[data-daily-rewards] .reward-card.is-excluded{filter:none;background:#0002;border-color:color-mix(in srgb,var(--sgs-border) 25%,transparent)}[data-daily-rewards] .reward-card.is-excluded:before{background:var(--sgs-muted);opacity:.25}[data-daily-rewards] .reward-card.is-excluded .reward-name{opacity:.65}
        [data-daily-rewards] [data-reward-code-options]{display:flex;margin:9px 0;padding-top:0;border:0}[data-daily-rewards] [data-reward-code-options]>.muted{display:block;font-size:10px;margin:0}[data-daily-rewards] .reward-code-toggles{gap:2px;padding:3px;border-radius:8px;background:#0002;box-shadow:inset 0 1px 3px #0003}[data-daily-rewards] .reward-code-toggles .reward-toggle{border:0;border-radius:5px;min-height:27px;background:transparent;box-shadow:none;position:relative}[data-daily-rewards] .reward-code-toggles .reward-toggle:before{display:none}[data-daily-rewards] .reward-code-toggles [aria-checked=true]{color:var(--sgs-accent);background:linear-gradient(color-mix(in srgb,var(--sgs-accent) 18%,transparent),color-mix(in srgb,var(--sgs-accent) 7%,transparent));box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-accent) 14%,transparent)}[data-daily-rewards] .reward-code-toggles .sgs-line-icon{width:13px;height:13px}[data-daily-rewards] .reward-status{border-left:2px solid color-mix(in srgb,var(--sgs-border) 60%,transparent);padding:2px 8px;margin-top:8px;font-size:10px;line-height:1.5}[data-daily-rewards] .reward-status.is-error{color:var(--sgs-danger);border-color:var(--sgs-danger)}
        @media(prefers-reduced-motion:reduce){[data-daily-rewards] .reward-card,[data-daily-rewards] .reward-rail:after{transition:none}}
      `;
      const inputs = {};
      const option = (key, label, { exclusion = false, inverted = false, switchRail = false, accessibleLabel = label } = {}) => {
        const button = el('button', undefined, exclusion ? 'reward-card' : `reward-toggle${switchRail ? ' reward-switch' : ''}`);
        button.type = 'button'; button.dataset.rewardOption = key;
        if (inverted) button.dataset.rewardInverted = '';
        button.setAttribute('aria-label', accessibleLabel);
        if (!exclusion) button.setAttribute('role', 'switch');
        if (switchRail) { const rail = el('span', undefined, 'reward-rail'); rail.setAttribute('aria-hidden', 'true'); button.append(rail); }
        if (['codes', 'clipboardCodes', 'shareCodes'].includes(key)) button.append(ctx.ui.icon(({ codes: 'gift', clipboardCodes: 'clipboard', shareCodes: 'share' })[key]));
        const name = el('span', label, 'reward-name'); button.append(name);
        if (exclusion) { const mark = el('span', '领取', 'reward-mark'); mark.setAttribute('aria-hidden', 'true'); button.append(mark); }
        button.addEventListener('click', () => controller.options({ [key]: !controller.snapshot().config[key] })); inputs[key] = button;
        return button;
      };
      const heading = el('div', undefined, 'reward-heading'); heading.append(el('h3', '自动领取'), option('automatic', '已关闭', { switchRail: true, accessibleLabel: '自动领取' }));
      heading.querySelector('h3').prepend(ctx.ui.icon(PLUGIN_ICONS['daily-rewards']));
      const excluded = el('div'); excluded.dataset.rewardExclusions = ''; excluded.setAttribute('role', 'group'); excluded.setAttribute('aria-label', '点按排除不领取的奖励');
      excluded.append(...rewardExclusions.map(([key, name]) => option(key, name, { exclusion: true, accessibleLabel: `不领取${name}` })));
      excluded.append(option('mail', '邮件', { exclusion: true, inverted: true, accessibleLabel: '不领取邮件' }), option('autoFlip', '免费翻翻', { exclusion: true, inverted: true, accessibleLabel: '不自动免费翻翻' }));
      excluded.title = '点击划掉不领取的奖励，再点一次恢复领取。';
      const codes = el('div'); codes.dataset.rewardCodeOptions = '';
      const codeToggles = el('div', undefined, 'reward-code-toggles');
      codeToggles.append(option('codes', '领取', { accessibleLabel: '领取兑换码' }), option('clipboardCodes', '剪贴板', { accessibleLabel: '读取剪贴板' }), option('shareCodes', '共享', { accessibleLabel: '共享兑换码' }));
      codes.append(el('span', '兑换码', 'muted'), codeToggles);
      codes.title = '自动检查完整序列号及4–8字中文短口令，可夹带少量英文数字；中文口令每行一个，无法识别的行会跳过并继续处理其他行。特殊口令可标注“兑换码：口令”。只兑换未尝试的新码；共享默认关闭，开启后仅上报游戏确认成功的单个码。';
      const status = el('p', undefined, 'muted reward-status'); status.setAttribute('role', 'status'); status.dataset.rewardsStatus = '';
      const pending = el('div', undefined, 'reward-pending'); pending.dataset.rewardsUnconfirmed = ''; pending.hidden = true;
      pending.setAttribute('aria-label', '未确认领取的项目');
      const pendingStyle = el('style'); pendingStyle.textContent = '.reward-pending{margin:4px 0 10px;padding-left:9px;border-left:2px solid var(--sgs-border);font-size:11px;line-height:1.7;color:var(--sgs-muted)}.reward-pending p{margin:3px 0;white-space:pre-wrap;overflow-wrap:anywhere}.reward-pending[hidden]{display:none}';
      root.append(style, pendingStyle, heading, excluded, codes, status, pending);
      container.append(root);
      const render = state => {
        for (const [key, input] of Object.entries(inputs)) {
          const checked = !!state.config[key], exclusion = input.classList.contains('reward-card');
          const excluded = input.hasAttribute('data-reward-inverted') ? !checked : checked;
          input.setAttribute(exclusion ? 'aria-pressed' : 'aria-checked', String(exclusion ? excluded : checked)); input.disabled = !state.accountReady;
          if (exclusion) {
            input.classList.toggle('is-excluded', excluded);
            input.querySelector('.reward-mark').textContent = excluded ? '跳过' : '领取';
            input.title = key === 'autoFlip' ? `${checked ? '已开启' : '默认关闭'}：只续翻用户已开始轮次中的免费一张，五张全未翻时不操作` : `${excluded ? '已排除，点击恢复领取' : '将会领取，点击排除'}${input.querySelector('.reward-name').textContent}`;
          }
        }
        inputs.automatic.querySelector('.reward-name').textContent = state.config.automatic ? '已开启' : '已关闭';
        status.classList.toggle('is-error', !!state.sourceError);
        status.textContent = state.sourceError ? `${state.status}；${state.sourceError}` : state.status; status.title = state.sourceError || state.sourceStatus;
        const uncertainTasks = state.issues.filter(item => ['pending','unconfirmed','interrupted'].includes(item.status));
        pending.hidden = !uncertainTasks.length;
        pending.replaceChildren(...uncertainTasks.map(item => {
          const id = /^(?:task|quest):(\d+)/.exec(item.key)?.[1];
          return el('p', `未确认：${item.label === item.key ? '未命名领奖项目' : item.label}${id && !item.label.includes(`任务 ${id}`) ? `（任务 ${id}）` : ''}`);
        }));
      };
      controller.refresh(); render(controller.snapshot());
      const off = controller.subscribe(render);
      const exchangeStatus = el('p', '', 'muted reward-status'); root.append(exchangeStatus);
      const updateExchange = () => { exchangeStatus.textContent = exchange.view().status; };
      updateExchange(); const timer = ctx.window.setInterval(updateExchange, 250);
      return () => { ctx.window.clearInterval(timer); off(); root.remove(); };
    } });
  },
};
