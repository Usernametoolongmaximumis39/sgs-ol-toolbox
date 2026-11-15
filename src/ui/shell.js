import { createGameViewport } from './game-viewport.js';
import { LOCAL_MARKET_URL, OSS_MARKET_URL, GITHUB_MARKET_URL } from '../core/market-connection.js';
import { DEVELOPMENT, EDITION } from '../core/distribution.js';
import { mountCardStyleWorkshop } from './card-style-workshop.js';
import { mountThemeWorkshop } from './theme-workshop.js';
import { CONTROL_STYLES, controlIcon, styleSwitch } from './controls.js';
import { CORE_VERSION } from '../core/version.js';
import { DEFAULT_SCREENSHOT_SHORTCUT, shortcutFromEvent, shortcutLabel } from '../core/screenshot.js';
import { findPluginUpdates, compareVersions } from '../market/updates.js';
import { selectGamePanels } from '../core/game-view.js';
import { comparePanelOrder, comparePluginOrder } from '../core/plugin-contract.js';
import { createIcon } from './icons.js';
const categories = [['game', '牌局'], ['automation', '自动'], ['tools', '工具'], ['manage', '管理'], ['info', '信息']];
const style = `
.appearance-page .plugin-heading{margin:0}
.management-tabs{position:sticky;top:-12px;z-index:8;background:var(--sgs-bg)!important;box-shadow:0 5px 8px var(--sgs-bg)!important}
.card-style-workshop summary{cursor:pointer;color:var(--sgs-accent);padding:8px 0;font-size:12px;min-height:34px}.card-style-workshop summary:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}.card-style-choices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.card-style-choices button{min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px;font-size:11px}.card-style-choices button[aria-pressed=true]{border-color:var(--sgs-accent);box-shadow:inset 3px 0 var(--sgs-accent);background:color-mix(in srgb,var(--sgs-accent) 12%,var(--sgs-surface))}.card-style-preview{display:flex;gap:4px;width:100%;justify-content:center}.card-style-preview canvas,.card-style-preview img{width:43%;max-width:64px;height:auto;aspect-ratio:93/130;border-radius:3px}.card-style-workshop p{margin:8px 0}

.core-upgrade-actions{display:flex;align-items:center;justify-content:space-between;gap:4px;flex-wrap:wrap}.core-upgrade-actions a{font-size:10px}.core-upgrade-refresh{display:inline-flex;align-items:center;gap:5px;flex:none;padding:5px;font-size:10px;color:var(--sgs-accent);border-color:color-mix(in srgb,var(--sgs-accent) 40%,var(--sgs-border));background:color-mix(in srgb,var(--sgs-accent) 8%,var(--sgs-surface))}.core-upgrade-reminder{margin-top:6px;padding-left:8px;border-left:2px solid var(--sgs-accent);font-size:11px;color:var(--sgs-muted);overflow-wrap:anywhere}

.plugin-body .skin-entry{margin:0;padding:0;border:0;background:none}.plugin-body .skin-entry>h3{display:none}.plugin-body .reward-heading h3 .sgs-line-icon{display:none}.plugin-body .reward-heading h3,.plugin-body .sgs-effects h3{font-size:11px;font-weight:400;color:var(--sgs-muted)}
:host{all:initial;position:fixed;top:72px;right:24px;width:280px;min-width:248px;max-width:420px;z-index:2147483000;color:var(--sgs-text);font:13px/1.55 var(--sgs-font);color-scheme:var(--sgs-scheme,dark)}
*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}button:disabled{cursor:wait;opacity:.5}button,input,select{color:var(--sgs-text);background:var(--sgs-surface);border:1px solid var(--sgs-border);border-radius:7px;padding:6px 9px}button:hover{background:var(--sgs-raised);border-color:var(--sgs-accent)}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:2px}a{color:var(--sgs-accent)}
.shell{background:var(--sgs-bg);border:1px solid var(--sgs-border);border-radius:var(--sgs-radius);box-shadow:0 16px 48px #0006;overflow:hidden;resize:horizontal;min-width:248px;max-width:420px;width:100%}
.content.has-plugin-panels{min-height:0}.plugin-group{min-width:0}.plugin-group+.plugin-group{border-top:1px solid var(--sgs-border);margin-top:10px;padding-top:10px}.plugin-heading{margin:0;font-size:13px}.plugin-heading .plugin-toggle{display:flex;align-items:center;gap:9px;width:100%;min-height:36px;padding:6px 3px;border:0;border-radius:6px;background:transparent;box-shadow:none;text-align:left;color:var(--sgs-accent)}.plugin-heading .plugin-toggle:hover{background:color-mix(in srgb,var(--sgs-accent) 7%,transparent)}.plugin-toggle svg{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.plugin-toggle .plugin-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;letter-spacing:.5px}.plugin-toggle .plugin-chevron{width:15px;height:15px;color:var(--sgs-muted);transition:transform .16s}.plugin-toggle[aria-expanded=false] .plugin-chevron{transform:rotate(-90deg)}.plugin-body{padding:9px 2px 2px}.plugin-body[hidden]{display:none!important}:host([data-edge-docked]){left:auto!important;right:0!important;transition:transform 180ms ease;transform:translateX(0)}:host([data-edge-docked][data-edge-hidden]){transform:translateX(calc(100% - 5px));background:var(--sgs-bg);border-left:1px solid var(--sgs-accent);border-radius:5px 0 0 5px}:host([data-edge-hidden]) .shell{visibility:hidden}:host([data-edge-fixed]){transition:none;top:0!important;bottom:0!important;height:100vh;height:100dvh}:host([data-edge-fixed]) .shell{display:flex;flex-direction:column;height:100%;border-radius:0}:host([data-edge-fixed]) .shell>.brand,:host([data-edge-fixed]) .shell>.status,:host([data-edge-fixed]) .shell>.nav,:host([data-edge-fixed]) .shell>.footer,:host([data-edge-fixed]) .shell>.compact{flex-shrink:0}:host([data-edge-fixed]) .content{flex:1;min-height:0;max-height:none}.edge-resizer{display:none;position:absolute;left:0;bottom:0;width:22px;height:22px;z-index:12;color:var(--sgs-muted);cursor:ew-resize;touch-action:none;user-select:none;align-items:center;justify-content:center}.edge-resizer svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round}.edge-resizer:hover{color:var(--sgs-accent)}.edge-resizer:focus-visible{outline:2px solid var(--sgs-accent);outline-offset:-3px}:host([data-edge-docked]) .shell{resize:none}:host([data-edge-docked]:not([data-collapsed]):not([data-edge-hidden])) .edge-resizer{display:flex}:host([data-edge-docked]) .footer{padding-left:25px}:host([data-edge-docked]:focus-visible){outline:2px solid var(--sgs-accent);outline-offset:-2px}
@media(prefers-reduced-motion:reduce){.plugin-toggle .plugin-chevron{transition:none}}
.brand{user-select:none;-webkit-user-select:none;display:flex;align-items:center;gap:8px;padding:12px 12px 8px;cursor:move;touch-action:none}.mark svg{width:21px;height:21px}.mark{display:grid;place-items:center;width:27px;height:27px;border:1px solid var(--sgs-accent);color:var(--sgs-accent);border-radius:7px;font-weight:bold}.brand strong{letter-spacing:1px;font-size:13px}.brand small{display:block;font-size:9px;letter-spacing:2px;color:var(--sgs-muted)}.brand button svg{width:16px;height:24px}.footer [data-open-market]{display:flex;align-items:center;gap:4px}.footer [data-open-market] svg{width:12px;height:12px}.brand button{display:grid;place-items:center;margin-left:auto;font-size:16px;padding:0 7px;line-height:24px}.status{color:var(--sgs-muted);font-size:11px;padding:0 12px 9px;display:flex;align-items:center;gap:6px}.status[hidden]{display:none}.dot{width:5px;height:5px;background:var(--sgs-accent);border-radius:100%}
.nav{display:flex;gap:4px;padding:7px 9px;border-block:1px solid var(--sgs-border);background:var(--sgs-surface)}.nav button{flex:1 1 0;min-width:0;display:flex;align-items:center;justify-content:center;gap:0;height:42px;padding:0;border-color:transparent;background:transparent;overflow:hidden;transition:flex-grow var(--sgs-motion) cubic-bezier(.2,.8,.2,1),background var(--sgs-motion),gap var(--sgs-motion)}.nav button svg{width:22px;height:22px;flex:none;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;transition:transform var(--sgs-motion)}.nav button span{max-width:0;opacity:0;white-space:nowrap;overflow:hidden;transition:max-width var(--sgs-motion),opacity var(--sgs-motion)}.nav button[aria-selected=true]{color:var(--sgs-accent);background:var(--sgs-raised)}.nav:has(button:hover) button:not(:hover):not(:focus-visible) svg,.nav:has(button:focus-visible) button:not(:hover):not(:focus-visible) svg{transform:scale(.92)}.nav button:hover,.nav button:focus-visible{flex-grow:2.2;gap:5px;color:var(--sgs-accent);background:var(--sgs-raised)}.nav button:hover svg,.nav button:focus-visible svg{transform:scale(1.15)}.nav button:hover span,.nav button:focus-visible span{max-width:32px;opacity:1}
.content{padding:12px;max-height:65vh;min-height:200px;overflow:auto;scrollbar-width:thin}.footer{display:flex;justify-content:space-between;border-top:1px solid var(--sgs-border);padding:7px 12px;color:var(--sgs-muted);font-size:10px}.footer button{padding:0;border:0;background:none;font-size:10px;color:var(--sgs-muted)}.empty{text-align:center;padding:35px 12px;color:var(--sgs-muted)}.empty svg{width:32px;height:32px;fill:none;stroke:var(--sgs-accent);stroke-width:1.2;margin-bottom:12px}.empty strong{display:block;color:var(--sgs-text);font-size:14px;margin-bottom:7px}.tabs{display:flex;gap:4px;margin-bottom:13px}.tabs button{flex:1;padding:5px 2px;font-size:12px}.tabs button.active{border-color:var(--sgs-accent);color:var(--sgs-accent)}h3{font-size:13px;margin:15px 0 7px}h3:first-child{margin-top:0}.card{padding:10px;border:1px solid var(--sgs-border);border-radius:8px;margin-bottom:8px;background:var(--sgs-surface)}.card .title{display:flex;justify-content:space-between;gap:5px}.muted{color:var(--sgs-muted);font-size:11px}.actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.actions button{font-size:11px;padding:4px 7px}.notice{color:var(--sgs-muted);font-size:11px;overflow-wrap:anywhere;padding:7px 0}.error{color:var(--sgs-danger)}label.row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:10px 0}input[type=checkbox]{accent-color:var(--sgs-accent)}input.address{width:100%;font-size:11px}select{max-width:145px}.toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);max-width:80vw;background:var(--sgs-raised);color:var(--sgs-text);padding:10px 16px;border:1px solid var(--sgs-border);border-radius:8px;box-shadow:0 4px 20px #0008;z-index:2147483647}
:host([data-collapsed]) .nav,:host([data-collapsed]) .content,:host([data-collapsed]) .status,:host([data-collapsed]) .footer{display:none}:host([data-collapsed]) .brand{display:none}
.compact{display:none;align-items:center;height:38px;padding:0 7px 0 10px;cursor:grab;touch-action:none;white-space:nowrap;user-select:none;-webkit-user-select:none}.compact:active{cursor:grabbing}.compact .slash{display:flex;align-items:center;gap:9px;flex:1;min-width:0;height:100%;color:var(--sgs-accent)}.slash-seal{display:grid;place-items:center;flex:none;width:25px;height:27px;font:20px/1 "KaiTi","STKaiti","FangSong",serif;color:var(--sgs-accent);text-shadow:0 1px 1px #0009;background:radial-gradient(ellipse,color-mix(in srgb,var(--sgs-accent) 9%,transparent),transparent 72%)}.slash-reading{display:flex;flex-direction:column;align-items:flex-start;justify-content:center;min-width:32px;height:34px}.slash-label{font:9px/10px var(--sgs-font);letter-spacing:1px;color:var(--sgs-muted)}.compact [data-slash]{font:600 21px/23px "Cambria","Georgia",serif;font-variant-numeric:tabular-nums;color:color-mix(in srgb,var(--sgs-accent) 42%,var(--sgs-text));text-shadow:0 1px 2px #0008;letter-spacing:.3px}.compact[data-count-state="empty"] [data-slash]{color:var(--sgs-muted)}.compact[data-count-state="unknown"] [data-slash]{color:var(--sgs-muted);font-size:19px}.compact[data-count-state="unlimited"] [data-slash]{font-size:24px}.compact[data-count-size="long"] [data-slash]{font-size:15px;letter-spacing:0}.compact-actions{display:flex;align-items:center;gap:1px;padding-left:6px;margin-left:6px;position:relative}.compact-actions::before{content:'';position:absolute;left:0;top:6px;bottom:6px;width:1px;background:linear-gradient(transparent,color-mix(in srgb,var(--sgs-accent) 30%,transparent),transparent)}.compact button{display:grid;place-items:center;flex:none;width:28px;height:30px;padding:5px;border:0;border-radius:7px;background:transparent;color:var(--sgs-muted);box-shadow:none;transition:background 140ms,color 140ms,transform 140ms}.compact button:hover{color:var(--sgs-text);background:linear-gradient(180deg,color-mix(in srgb,var(--sgs-accent) 13%,transparent),color-mix(in srgb,var(--sgs-accent) 4%,transparent))}.compact button:active{transform:translateY(1px);background:color-mix(in srgb,var(--sgs-accent) 15%,transparent)}.compact button:focus-visible{outline:1px solid var(--sgs-accent);outline-offset:-2px;background:color-mix(in srgb,var(--sgs-accent) 9%,transparent)}.compact svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}.compact [data-expand] svg{width:16px;height:16px}
:host([data-collapsed]){width:156px!important;min-width:156px;max-width:156px}:host([data-collapsed]) .shell{position:relative;width:100%!important;max-width:100%;min-width:0;resize:none;border:1px solid color-mix(in srgb,var(--sgs-border) 65%,transparent);border-radius:11px;background:linear-gradient(165deg,var(--sgs-raised) 0%,var(--sgs-bg) 40%,color-mix(in srgb,var(--sgs-bg) 82%,#000) 100%);box-shadow:0 3px 8px #0004,0 12px 28px #0002,inset 0 1px color-mix(in srgb,var(--sgs-text) 9%,transparent),inset 0 -1px #0005}:host([data-collapsed]) .shell::before{content:'';position:absolute;pointer-events:none;top:0;left:15px;right:15px;height:1px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--sgs-accent) 40%,transparent),transparent)}:host([data-collapsed]) .compact{display:flex}

.compact-summary{display:none}:host([data-collapsed]) .compact-summary:not(:empty){display:grid;gap:3px;padding:6px 9px 8px;border-top:1px solid var(--sgs-border);max-height:35vh;overflow:auto}.compact-summary-row{display:flex;align-items:baseline;gap:6px;min-width:0;font-size:11px}.compact-summary-row span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.compact-summary-row b{flex:none;color:var(--sgs-accent);font-variant-numeric:tabular-nums;font-weight:500}
.ui-icon{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.plugin-card{padding:11px 10px 9px;border-color:color-mix(in srgb,var(--sgs-border) 65%,transparent);position:relative}.plugin-heading{display:flex;align-items:center;gap:8px;min-width:0}.plugin-symbol{display:grid;place-items:center;flex:none;width:29px;height:29px;border-radius:8px;background:var(--sgs-raised);color:var(--sgs-accent)}.plugin-symbol svg{width:18px;height:18px;stroke-width:1.5}.plugin-name{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}.plugin-version{flex:none;font-size:10px;color:var(--sgs-muted);font-variant-numeric:tabular-nums}.plugin-description{margin:7px 0 9px;color:var(--sgs-muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.plugin-prerequisites{margin:-3px 0 9px;color:var(--sgs-muted);font-size:11px;line-height:1.5;overflow-wrap:anywhere}.plugin-bottom{display:flex;align-items:center;gap:6px;min-width:0}.plugin-status{display:flex;align-items:center;gap:4px;color:var(--sgs-muted);font-size:10px;white-space:nowrap}.plugin-status::before{content:'';width:5px;height:5px;border-radius:50%;background:currentColor}.plugin-status.is-running{color:var(--sgs-success,#a9cfac)}.plugin-status.is-error{color:var(--sgs-danger)}.plugin-tools{display:flex;align-items:center;gap:3px;margin-left:auto}.plugin-tools button{display:grid;place-items:center;width:27px;height:27px;padding:4px;border-color:transparent;background:transparent;color:var(--sgs-muted);border-radius:6px}.plugin-tools button:hover,.plugin-tools button:focus-visible{border-color:var(--sgs-border);background:var(--sgs-raised);color:var(--sgs-text)}.plugin-tools button.is-destructive:hover{color:var(--sgs-danger);border-color:var(--sgs-danger)}.plugin-tools button.is-enable{color:var(--sgs-success,#a9cfac)}.plugin-current{display:flex;align-items:center;color:var(--sgs-success,#a9cfac);margin-left:2px}.plugin-current svg{width:13px;height:13px}.plugin-card.has-update{border-color:var(--sgs-accent);box-shadow:inset 3px 0 var(--sgs-accent)}.plugin-card.has-error{border-color:var(--sgs-danger);box-shadow:inset 3px 0 var(--sgs-danger)}.plugin-update{margin-top:9px;padding:8px;background:color-mix(in srgb,var(--sgs-accent) 12%,transparent);border-radius:6px;color:var(--sgs-accent)}.plugin-update-info{display:flex;align-items:center;gap:5px;font-size:10px;overflow-wrap:anywhere}.plugin-update button{display:flex;align-items:center;justify-content:center;gap:5px;width:100%;margin-top:6px;padding:4px 6px;border-color:var(--sgs-accent);background:var(--sgs-accent);color:var(--sgs-bg);font-size:11px;font-weight:600}.plugin-error{margin-top:8px;padding:7px 8px;border-radius:6px;background:color-mix(in srgb,var(--sgs-danger) 12%,transparent);color:var(--sgs-danger);font-size:11px}.plugin-error summary{cursor:pointer;display:flex;align-items:center;gap:5px}.plugin-error summary span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.plugin-error summary::after{content:'详情';margin-left:auto;flex:none;font-size:10px}.plugin-error[open] summary::after{content:'收起'}.plugin-error pre{font:11px/1.6 var(--sgs-font);white-space:pre-wrap;overflow-wrap:anywhere;margin:7px 0 0}.nav button{position:relative}.nav .nav-alert{position:absolute;top:2px;right:3px;min-width:13px;height:13px;padding:0 3px;border-radius:7px;background:var(--sgs-accent);color:var(--sgs-bg);font:700 9px/13px system-ui;font-style:normal}.nav .nav-alert.is-error{background:var(--sgs-danger)}.plugin-search{display:block;width:100%;min-width:0;margin-top:9px;padding:8px 10px;background:var(--sgs-surface)}.plugin-search::placeholder{color:var(--sgs-muted);font-size:11px}.plugin-card[hidden],.plugin-search-empty[hidden]{display:none!important}.update-summary.has-update{color:var(--sgs-accent);font-weight:600}
/* Light palettes use crisp ink and softer depth rather than dark-theme shadows. */
:host([data-theme-scheme=light]){--sgs-success:#32613e}
:host([data-theme-scheme=light]) .slash-seal,:host([data-theme-scheme=light]) .compact [data-slash]{text-shadow:none}
:host([data-theme-scheme=light][data-collapsed]) .shell{background:linear-gradient(165deg,var(--sgs-surface),var(--sgs-bg) 65%);box-shadow:0 3px 8px #0002,0 8px 20px #0001,inset 0 1px #fff8}
${CONTROL_STYLES}
button{background:linear-gradient(180deg,color-mix(in srgb,var(--sgs-raised) 60%,var(--sgs-surface)),var(--sgs-surface));border-color:color-mix(in srgb,var(--sgs-border) 60%,transparent);box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-text) 4%,transparent);transition:background 140ms,border-color 140ms,color 140ms}button:active:not(:disabled){background:var(--sgs-bg)}button:disabled{cursor:not-allowed}.nav button,.footer button{box-shadow:none}.tabs{gap:2px;padding:3px;border-radius:8px;background:var(--sgs-surface);box-shadow:inset 0 1px 3px #0004}.tabs button{border:0;background:transparent;box-shadow:none;color:var(--sgs-muted);padding:6px 2px}.tabs button.active{background:linear-gradient(color-mix(in srgb,var(--sgs-accent) 17%,transparent),color-mix(in srgb,var(--sgs-accent) 7%,transparent));box-shadow:inset 0 1px color-mix(in srgb,var(--sgs-accent) 14%,transparent);color:var(--sgs-accent)}
.settings-group{padding:11px 0 13px;border-bottom:1px solid color-mix(in srgb,var(--sgs-border) 35%,transparent)}.settings-group:last-child{border:0;padding-bottom:0}.settings-group h3{display:flex;align-items:center;gap:7px;margin:0 0 8px;color:var(--sgs-accent);font-size:12px;letter-spacing:.06em}.settings-group h3::before{content:'';width:3px;height:11px;border-radius:2px;background:linear-gradient(var(--sgs-accent),color-mix(in srgb,var(--sgs-accent) 30%,transparent))}.settings-group label.row{margin:0;padding:9px 0;min-height:36px;font-size:12px}.settings-group label.row>span{flex:1;min-width:0}.settings-group .muted{font-size:10px;line-height:1.7;color:var(--sgs-muted)}.settings-group .row input.sgs-input{flex:0 1 142px;width:142px!important;min-width:90px}.settings-group .address{margin:5px 0 8px}.settings-group .actions{gap:6px}.settings-group .actions button{min-height:29px}.settings-group .actions .icon-action{display:grid;place-items:center;width:30px;padding:5px;color:var(--sgs-muted);background:transparent;border-color:transparent;box-shadow:none}.settings-group .actions .icon-action:hover{color:var(--sgs-accent);background:var(--sgs-raised)}.settings-group .row select{max-width:145px}.settings-group>select{width:100%;max-width:none}.settings-group .notice{font-size:10px;line-height:1.7}.settings-group button .sgs-line-icon{vertical-align:-3px;margin-right:5px}.settings-group button:has(.sgs-line-icon){font-size:11px}.settings-group [data-setting=screenshotHideUI]{flex:none}
@media(prefers-reduced-motion:reduce){*{transition:none!important}}@media(max-height:500px){.content{max-height:50vh}}
`;
export function createShell({ window: win, document: doc, settings, scope }) {
  let pendingCoreUpgrade = settings.get('pendingCoreUpgrade', '');
  if (pendingCoreUpgrade && compareVersions(CORE_VERSION, pendingCoreUpgrade) >= 0) { pendingCoreUpgrade = ''; settings.set('pendingCoreUpgrade', ''); }
  let gameView = 'battle', renderedKey = '', viewScroll = new Map();
  const host = doc.createElement('div'); host.dataset.sgsToolbox = 'core';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${style}</style><section class="shell"><div class="compact" data-count-state="unknown"><span class="slash" title="剩余出杀次数暂不可用；双击展开，按住拖动"><span class="slash-seal" aria-hidden="true">杀</span><span class="slash-reading"><span class="slash-label">剩余</span><b data-slash aria-label="剩余出杀次数暂不可用">—</b></span></span><div class="compact-actions"><button data-screenshot title="截图并复制" aria-label="截图并复制"></button><button data-expand title="放大面板" aria-label="放大面板"></button></div></div><div class="compact-summary" aria-label="关注卡牌未见张数"></div><header class="brand"><div class="mark" aria-hidden="true"></div><div><strong>三国杀 OL 工具箱</strong><small>${EDITION.toUpperCase()} · ${CORE_VERSION}</small></div><button title="折叠面板" aria-label="折叠面板"></button></header><div class="status"><i class="dot"></i><span>等待游戏运行时</span></div><nav class="nav" role="tablist">${categories.map(([id, title]) => `<button data-category="${id}" role="tab" aria-label="${title}" aria-selected="false"><span>${title}</span></button>`).join('')}</nav><main class="content" role="tabpanel"></main><footer class="footer"><span>${EDITION === 'dev' ? '开发版' : EDITION === 'lite' ? '轻量版' : '完整版'} ${CORE_VERSION}</span><button data-open-market title="打开插件市场" aria-label="打开插件市场">插件市场</button></footer></section>`;
  for (const [selector, name] of [['.mark', 'toolbox'], ['[data-screenshot]', 'camera'], ['[data-expand]', 'expand'], ['.brand button', 'collapse'], ['[data-open-market]', 'package']]) {
    shadow.querySelector(selector).append(createIcon(doc, name));
  }
  for (const [id] of categories) shadow.querySelector('[data-category="' + id + '"]').prepend(createIcon(doc, id));
  const content = shadow.querySelector('.content'); let active = settings.get('category', 'game'); let management = 'market'; let renderedCleanup; let handlers = {}; const panels = new Map(); let toastTimer;
  let pluginSearch = '';
  let onlyUninstalled = settings.get('marketOnlyUninstalled', false) === true;
  let marketState = {}; let marketRequest = 0; const installing = new Set();
  function currentMarketState() {
    const client = handlers.market?.();
    if (marketState.client !== client) { marketRequest++; marketState = { client }; }
    return marketState;
  }
  const el = (tag, text, cls) => { const n = doc.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  const button = (text, fn) => { const n = el('button', text); n.addEventListener('click', async () => { n.disabled = true; try { await fn(); } catch (e) { notify(e.message); } finally { n.disabled = false; } }); return n; };
  function notify(message) { shadow.querySelector('.toast')?.remove(); clearTimeout(toastTimer); const n = el('div', message, 'toast'); n.setAttribute('role', 'status'); shadow.append(n); toastTimer = setTimeout(() => n.remove(), 6000); }
  function empty(title, text, icon = active) { const n = el('div', undefined, 'empty'); n.append(createIcon(doc, icon)); n.append(el('strong', title), el('div', text)); content.append(n); }
  async function exportDiagnostics() {
    if (typeof handlers.exportDiagnostics !== 'function') throw new Error('记牌诊断尚未准备好');
    const json = await handlers.exportDiagnostics();
    if (scope.closed) return;
    if (typeof json !== 'string') throw new Error('诊断数据格式无效');
    if (typeof win.URL?.createObjectURL !== 'function') throw new Error('当前浏览器暂不支持诊断文件下载');
    const blob = new win.Blob([json], { type: 'application/json;charset=utf-8' });
    const url = win.URL.createObjectURL(blob), link = doc.createElement('a');
    const release = scope.add(() => win.URL.revokeObjectURL(url));
    link.href = url; link.download = `三国杀OL工具箱-记牌诊断-${CORE_VERSION}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`; link.hidden = true;
    doc.documentElement.append(link);
    try { link.click(); notify('记牌诊断已导出为JSON 文件，未上传。'); }
    finally { link.remove(); scope.timeout(release, 1000); }
  }
  function showLegacyWarning() {
    shadow.querySelector('[data-legacy-warning]')?.remove();
    const panel = el('section', undefined, 'card'); panel.dataset.legacyWarning = ''; panel.setAttribute('role', 'status');
    panel.style.cssText = 'position:fixed;top:16px;right:0;width:min(320px,90vw);max-height:80vh;overflow:auto;z-index:10;box-shadow:0 8px 28px #0005';
    panel.append(el('strong', '旧小抄停用提醒'), el('p', '建议在篡改猴管理面板中关闭旧小抄，再刷新游戏。工具箱默认不退出或隐藏旧脚本，可关闭提醒继续使用。'));
    const steps = el('ol');
    for (const text of ['点击浏览器右上角的扩展图标，找到篡改猴（Tampermonkey）。', '点击篡改猴图标，选择“管理面板 / Dashboard”。', '关闭旧小抄脚本的开关，再返回游戏刷新页面。']) steps.append(el('li', text));
    steps.style.paddingLeft = '20px'; panel.append(steps);
    panel.append(el('p', '无需查找扩展 ID。若工具栏未显示篡改猴，可先在扩展菜单中将其固定。', 'muted'));
    const details = el('details'); details.append(el('summary', '保存本机管理地址（可选）'));
    details.append(el('p', '打开管理面板后，复制其地址粘贴到这里。以后可一键复制，在地址栏打开；网页不能直接跳转到扩展内部页面。', 'muted'));
    const input = el('input', undefined, 'sgs-input'); input.value = settings.get('userscriptDashboardAddress', ''); input.placeholder = '粘贴本机篡改猴管理面板地址'; input.setAttribute('aria-label', '本机篡改猴管理面板地址'); input.style.width = '100%';
    const hint = el('p', '', 'muted'); hint.setAttribute('role', 'status');
    const normalize = value => {
      const url = new URL(value.trim());
      if (!['chrome-extension:', 'moz-extension:', 'safari-web-extension:'].includes(url.protocol) || !url.hostname || url.pathname !== '/options.html' || url.username || url.password || url.port) throw new Error('请粘贴篡改猴管理面板的完整扩展地址（options.html）。');
      return url.protocol + '//' + url.hostname + '/options.html#nav=dashboard';
    };
    const actions = el('div', undefined, 'actions');
    actions.append(button('保存地址', () => { try { const address = normalize(input.value); settings.set('userscriptDashboardAddress', address); input.value = address; hint.textContent = '已保存到当前浏览器，已移除游戏链接等参数。'; } catch (error) { hint.textContent = error.message; } }), button('复制地址', async () => {
      try { input.value = normalize(input.value); } catch (error) { hint.textContent = error.message; return; }
      try { await win.navigator.clipboard.writeText(input.value); hint.textContent = '已复制，请粘贴到浏览器地址栏打开管理面板。'; } catch { input.focus(); input.select(); hint.textContent = '地址已选中，请按 Ctrl+C 复制。'; }
    }), button('清除地址', () => { settings.set('userscriptDashboardAddress', ''); input.value = ''; hint.textContent = '已清除本机地址。'; }));
    details.append(input, actions, hint); panel.append(details);
    panel.append(button('继续使用', () => panel.remove())); shadow.append(panel);
  }
  function renderAppearance(cleanups) {
    content.classList.add('appearance-page');
    const themeHeading = el('h3', undefined, 'plugin-heading');
    const themeToggle = el('button', undefined, 'plugin-toggle'); themeToggle.type = 'button';
    themeToggle.append(createIcon(doc, 'palette'), el('span', '主题工坊', 'plugin-title'), createIcon(doc, 'chevron', 'plugin-chevron'));
    const workshop = el('div', undefined, 'plugin-body'); workshop.id = 'core-theme-workshop';
    themeToggle.setAttribute('aria-controls', workshop.id);
    const applyThemeFold = collapsed => {
      workshop.hidden = collapsed;
      themeToggle.setAttribute('aria-expanded', String(!collapsed));
      themeToggle.title = `${collapsed ? '展开' : '收起'}主题工坊`;
      themeToggle.setAttribute('aria-label', themeToggle.title);
    };
    applyThemeFold(settings.get('themeWorkshopCollapsed', false));
    themeToggle.onclick = () => {
      const collapsed = !workshop.hidden;
      settings.set('themeWorkshopCollapsed', collapsed); applyThemeFold(collapsed);
    };
    const themeGroup = el('section', undefined, 'plugin-group appearance-section');
    themeHeading.append(themeToggle); themeGroup.append(themeHeading, workshop); content.append(themeGroup);
    cleanups.push(mountThemeWorkshop(workshop, { document: doc, themes: handlers.themes, notify }));
    const cardWorkshop = el('div', undefined, 'plugin-group appearance-section'); content.append(cardWorkshop);
    cleanups.push(mountCardStyleWorkshop(cardWorkshop, { document: doc, cardStyles: handlers.cardStyles, settings }));
  }
  function renderSettings(cleanups) {
    const first = content.children.length;
    if (!mobileDevice()) {
      content.append(el('h3', 'HUD 靠边行为'));
      const choices = el('div', undefined, 'sgs-segments'); choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', 'HUD 靠边行为');
      for (const [value, label] of [['none', '无操作'], ['hide', '收起'], ['fixed', '固定']]) {
        const choice = button(label, () => {
          settings.set('hudEdgeBehavior', value);
          const atEdge = host.hasAttribute('data-edge-docked') || host.getBoundingClientRect().right >= win.innerWidth - 12;
          setEdgeDocked(atEdge); render();
        });
        choice.dataset.edgeBehavior = value; choice.setAttribute('aria-pressed', String(edgeBehavior() === value)); choices.append(choice);
      }
      content.append(choices, el('div', '拖到右边缘时：无操作保持悬浮；收起在鼠标移开后隐藏；固定为侧栏并为游戏画布留出空间。', 'muted'));
    }
    content.append(el('h3', '截图'));
    const cleanRow = el('label', undefined, 'row'); cleanRow.append(el('span', '截图时隐藏工具箱 UI'));
    const clean = el('input'); clean.type = 'checkbox'; styleSwitch(clean); clean.checked = settings.get('screenshotHideUI', true); clean.dataset.setting = 'screenshotHideUI';
    clean.onchange = () => settings.set('screenshotHideUI', clean.checked); cleanRow.append(clean); content.append(cleanRow);
    content.append(el('div', '对局内隐藏 HUD、明牌与理牌等叠加；大厅仅隐藏 HUD。', 'muted'));
    const shortcutRow = el('label', undefined, 'row'); shortcutRow.append(el('span', '截图快捷键'));
    const shortcut = el('input', undefined, 'sgs-input'); shortcut.readOnly = true; shortcut.style.width = '150px'; shortcut.setAttribute('aria-label', '截图快捷键');
    const showShortcut = () => { shortcut.value = shortcutLabel(settings.get('screenshotShortcut', DEFAULT_SCREENSHOT_SHORTCUT)); };
    showShortcut(); shortcut.onfocus = () => { shortcut.value = '请按快捷键…'; }; shortcut.onblur = showShortcut;
    shortcut.onkeydown = event => {
      event.preventDefault(); event.stopPropagation();
      if (event.isComposing || event.repeat) return;
      if (event.key === 'Escape') { shortcut.blur(); return; }
      const binding = shortcutFromEvent(event); if (!binding) return;
      settings.set('screenshotShortcut', binding); showShortcut(); shortcut.blur();
    };
    shortcutRow.append(shortcut); content.append(shortcutRow);
    const shotActions = el('div', undefined, 'actions');
    shotActions.append(iconButton('清除快捷键', 'trash', () => { settings.set('screenshotShortcut', null); showShortcut(); }, 'icon-action'), iconButton('恢复默认快捷键', 'rollback', () => { settings.set('screenshotShortcut', DEFAULT_SCREENSHOT_SHORTCUT); showShortcut(); }, 'icon-action'), button('截图并复制', () => handlers.screenshot?.())); content.append(shotActions);
    content.append(el('div', '点击录入快捷键，Esc 取消。截图自动复制到剪贴板。', 'muted'));
    content.append(el('h3', '旧脚本兼容'));
    content.append(button('前往篡改猴管理', showLegacyWarning));
    const enabled = el('label', undefined, 'row'); enabled.append(el('span', '接管旧小抄界面')); const check = doc.createElement('input'); check.type = 'checkbox'; styleSwitch(check); check.checked = settings.get('compatEnabled', false); check.onchange = () => { settings.set('compatEnabled', check.checked); handlers.compat?.setEnabled(check.checked); }; enabled.append(check); content.append(enabled);
    const policy = el('select', undefined, 'sgs-select'); policy.setAttribute('aria-label', '旧脚本接管方式'); for (const [value, label] of [['exit-known', '退出已知版本并隐藏'], ['hide', '仅隐藏界面']]) { const option = el('option', label); option.value = value; policy.append(option); } policy.value = settings.get('compatPolicy', 'hide'); policy.onchange = () => { settings.set('compatPolicy', policy.value); handlers.compat?.setTakeoverPolicy?.(policy.value); handlers.compat?.scan(); render(); }; content.append(policy);
    const compatStatus = handlers.compat?.getStatus(); content.append(el('div', formatCompat(compatStatus), 'notice'));
    const actions = el('div', undefined, 'actions'); actions.append(iconButton('重新检测', 'reload', () => { handlers.compat?.scan(); render(); }, 'icon-action'), button('点选隐藏旧面板', () => startPicker())); content.append(actions);
    content.append(el('div', '隐藏 UI 不代表后台逻辑已停止。无法退出的脚本仍需在 Tampermonkey 中停用；已退出脚本需刷新页面才能恢复。', 'muted'));
    if (DEVELOPMENT) {
    content.append(el('h3', '插件市场目录地址'));
    const input = el('input', undefined, 'address sgs-input'); input.value = settings.get('marketUrl', LOCAL_MARKET_URL); input.setAttribute('aria-label', '市场地址');
    const sources = el('div', undefined, 'sgs-segments'); sources.setAttribute('role', 'group'); sources.setAttribute('aria-label', '市场连接方式');
    const selected = input.value === '' ? '离线' : input.value === LOCAL_MARKET_URL ? '本机' : input.value === GITHUB_MARKET_URL ? 'GitHub' : input.value === OSS_MARKET_URL ? 'OSS' : '自定义';
    for (const [label, url] of [['离线', ''], ['本机', LOCAL_MARKET_URL], ['GitHub', GITHUB_MARKET_URL], ['OSS', OSS_MARKET_URL], ['自定义', null]]) {
      const choice = button(label, () => {
        if (url === null) { input.disabled = false; input.focus(); input.select(); return; }
        handlers.setMarketUrl(url); render(); notify(url ? '市场地址已选择，手动连接后读取目录' : '已切换为离线，可继续导入插件包');
      });
      choice.style.cssText = 'white-space:nowrap;padding:4px 3px;font-size:10px;line-height:18px';
      choice.setAttribute('aria-pressed', String(label === selected)); sources.append(choice);
    }
    input.disabled = selected === '离线';
    content.append(sources, input, button('保存地址', () => { handlers.setMarketUrl(input.value); render(); notify('市场地址已保存'); }), el('div', '市场连接可选；仅手动连接或检测更新时联网，离线仍可导入插件包。', 'muted'));
    }
    content.append(el('h3', '记牌诊断'), el('div', '导出本局最近的卡牌记录与消息类型，用于排查明牌遗漏。文件不含账号、昵称或完整登录数据，只保存到本机。', 'muted'), button('导出记牌诊断', exportDiagnostics));
    let group;
    for (const node of [...content.children].slice(first)) {
      if (node.tagName === 'H3') { group = el('section', undefined, 'settings-group'); content.append(group); }
      group.append(node);
    }
    for (const b of content.querySelectorAll('.settings-group button')) {
      const icon = { '截图并复制': 'camera', '保存地址': 'save', '导出记牌诊断': 'download', '点选隐藏旧面板': 'pointer' }[b.textContent];
      if (icon) b.prepend(controlIcon(doc, icon));
    }

  }
  function formatCompat(status) {
    if (!status) return '兼容控制器等待启动。';
    if (typeof status === 'string') return status;
    const hidden = status.hiddenCount ?? status.hidden?.length ?? status.hiddenElements?.length ?? 0;
    const exits = status.exitCalls?.length ?? status.exitCalled?.length ?? status.exits?.length ?? 0;
    return `已隐藏 ${hidden} 个旧界面；退出调用 ${exits} 次。`;
  }
  function startPicker() {
    notify('点击需要隐藏的旧脚本面板；Esc 取消。');
    const finish = () => { doc.removeEventListener('click', pick, true); doc.removeEventListener('keydown', cancel, true); };
    const cancel = e => { if (e.key === 'Escape') finish(); };
    const pick = e => {
      if (e.composedPath().includes(host)) return;
      const target = e.target;
      if (!target || ['HTML', 'BODY', 'CANVAS'].includes(target.tagName) || target.id === 'bgDiv') { notify('请点选旧面板本身，不要选择游戏画布。'); return; }
      e.preventDefault(); e.stopImmediatePropagation(); finish(); handlers.compat?.hideElement(target); notify('所选元素已隐藏，可关闭兼容模式恢复。');
    };
    setTimeout(() => { doc.addEventListener('click', pick, true); doc.addEventListener('keydown', cancel, true); }, 0); scope.add(finish);
  }
  const svgIcon = name => createIcon(doc, name, 'ui-icon');
  const iconButton = (label, icon, fn, cls = '') => { const n = button('', fn); n.title = label; n.setAttribute('aria-label', label); n.className = cls; n.append(svgIcon(icon), el('span', label, 'sr-only')); return n; };
  function pluginIdentity(card, item, fallbackDescription) {
    const heading = el('div', undefined, 'plugin-heading'), symbol = el('div', undefined, 'plugin-symbol');
    symbol.append(svgIcon(item.icon || 'package'));
    const name = el('strong', item.name, 'plugin-name'); name.title = item.name;
    heading.append(symbol, name, el('span', item.version, 'plugin-version'));
    const description = el('div', item.description || fallbackDescription || '此插件暂未提供简介', 'plugin-description'); description.title = description.textContent;
    card.append(heading, description);
    if (item.dependencies?.length) {
      const installed = handlers.manager?.list() || [];
      const label = '前置：' + item.dependencies.map(id => installed.find(p => p.id === id)?.name || currentMarketState().catalog?.plugins.find(p => p.id === id)?.name || id).join('、');
      const dependency = el('div', label, 'plugin-prerequisites'); dependency.title = label; card.append(dependency);
    }
  }
  function pluginCards() {
    const list = [...(handlers.manager?.list() || [])].sort(comparePluginOrder);
    const state = currentMarketState();
    const updates = new Map((state.catalog ? findPluginUpdates(list, state.catalog.plugins) : []).map(item => [item.id, item]));
    list.sort((a, b) => Number(updates.get(b.id)?.status === 'update') - Number(updates.get(a.id)?.status === 'update') || comparePluginOrder(a, b));
    content.append(el('h3', '已安装插件'));
    if (!list.length) content.append(el('p', '暂无已安装插件。从下方市场安装，或导入插件包文件。', 'muted'));
    for (const item of list) {
      const update = updates.get(item.id);
      const maintenance = { updating: '正在更新', waiting: '等待前置更新', restarting: '正在恢复' }[item.maintenance];
      const failed = !maintenance && (!!item.error || (item.enabled && !item.active));
      const card = el('section', undefined, `card plugin-card${update?.status === 'update' ? ' has-update' : ''}${failed ? ' has-error' : ''}`); card.dataset.pluginId = item.id;
      if (maintenance) card.setAttribute('aria-busy', 'true');
      pluginIdentity(card, item, update?.entry?.description);
      const bottom = el('div', undefined, 'plugin-bottom');
      const status = el('span', maintenance || (failed ? '运行异常' : item.active ? '运行中' : '已停用'), `plugin-status ${maintenance ? '' : failed ? 'is-error' : item.active ? 'is-running' : ''}`);
      status.title = `${status.textContent} · ${item.source}`; bottom.append(status);
      if (update && update.status !== 'update' && !failed) {
        const label = update.status === 'current' ? '已是市场最新正式版' : update.status === 'newer' ? `当前版本高于市场正式版 ${update.entry.version}` : '市场暂无此插件的正式版';
        const marker = el('span', undefined, 'plugin-current'); marker.title = label; marker.setAttribute('aria-label', label);
        marker.append(svgIcon(update.status === 'current' ? 'check' : 'info'), el('span', label, 'sr-only')); bottom.append(marker);
      }
      const actions = el('div', undefined, 'plugin-tools');
      actions.append(iconButton(item.enabled ? '停用' : '启用', item.enabled ? 'pause' : 'play', () => handlers.manager.enable(item.id, !item.enabled), item.enabled ? '' : 'is-enable'), iconButton('重载', 'reload', () => handlers.manager.reload(item.id)));
      if (item.hasPrevious) actions.append(iconButton('回退', 'rollback', () => handlers.manager.rollback(item.id)));
      actions.append(iconButton('卸载', 'trash', () => handlers.manager.uninstall(item.id), 'is-destructive'));
      if (maintenance) for (const action of actions.children) action.disabled = true;
      bottom.append(actions); card.append(bottom);
      if (failed) {
        const details = el('details', undefined, 'plugin-error'), summary = el('summary');
        summary.append(svgIcon('alert'), el('span', '插件运行异常')); details.append(summary, el('pre', item.error || '插件未能激活，请尝试重载。')); card.append(details);
      }
      if (update?.status === 'update') {
        const notice = el('div', undefined, 'plugin-update'), info = el('div', undefined, 'plugin-update-info');
        info.append(svgIcon('update'), el('span', `发现更新：${item.version} → ${update.entry.version}`));
        const upgrade = button(`更新至 ${update.entry.version}`, () => installEntry(update.entry, true)); upgrade.prepend(svgIcon('update')); upgrade.disabled = installing.has(item.id) || !!maintenance;
        notice.append(info, upgrade); card.append(notice);
      }
      markSearchable(card, item); content.append(card);
    }
  }
  async function installEntry(entry, updateOnly = false) {
    const client = handlers.market();
    if (installing.has(entry.id)) return;
    installing.add(entry.id); render();
    try {
      const pkg = await client.getPackage(entry);
      if (scope.closed) return;
      if (handlers.market() !== client) throw new Error('市场地址已改变，请重新检测更新。');
      if (updateOnly) {
        const installed = handlers.manager.list().find(item => item.id === entry.id);
        if (!installed || compareVersions(entry.version, installed.version) <= 0) throw new Error('插件安装状态已改变，请重新检测更新。');
      }
      await handlers.manager.install(pkg); notify(`${entry.name} ${entry.version} 已安装`);
    } finally { installing.delete(entry.id); if (!scope.closed) render(); }
  }
  async function fetchCatalog() {
    const state = currentMarketState(); if (!state.client || state.loading) return;
    const request = ++marketRequest;
    state.loading = true; state.error = ''; render();
    try {
      const catalog = await state.client.getCatalog();
      if (scope.closed || request !== marketRequest || handlers.market() !== state.client) return;
      state.catalog = catalog; state.checkedAt = new Date();
    } catch (e) {
      if (scope.closed || request !== marketRequest || handlers.market() !== state.client) return;
      state.catalog = null; state.checkedAt = null; state.error = e.message;
    } finally {
      state.loading = false;
      if (!scope.closed && request === marketRequest) render();
    }
  }
  function markSearchable(card, item) {
    card.dataset.searchText = [item.name, item.id, item.description].filter(Boolean).join(' ').toLocaleLowerCase();
  }
  function filterPlugins() {
    const terms = pluginSearch.trim().toLocaleLowerCase().split(/\s+/);
    const cards = [...content.querySelectorAll('[data-search-text]')];
    for (const card of cards) card.hidden = (onlyUninstalled && card.dataset.catalogInstalled === 'true') || !terms.every(term => card.dataset.searchText.includes(term));
    const empty = content.querySelector('.plugin-search-empty');
    if (empty) empty.hidden = !pluginSearch.trim() || cards.some(card => !card.hidden);
  }
  function updateControls() {
    const state = currentMarketState();
    const check = button(state.loading ? '正在检测更新…' : '检测插件更新', fetchCatalog); check.disabled = !state.client || !!state.loading; content.append(check);
    const search = el('input', undefined, 'plugin-search'); search.type = 'search'; search.placeholder = '搜索插件名称、简介或 ID'; search.setAttribute('aria-label', '搜索插件'); search.value = pluginSearch;
    search.addEventListener('input', () => { pluginSearch = search.value; filterPlugins(); }); content.append(search);
    const empty = el('div', '没有匹配的插件', 'notice plugin-search-empty'); empty.setAttribute('role', 'status'); empty.hidden = true; content.append(empty);
    if (!state.client) content.append(el('div', '市场连接已关闭，可在设置中选择本机、OSS 或自定义地址。', 'notice'));
    else if (state.error) content.append(el('div', `检测失败：${state.error}`, 'notice error'));
    else if (state.catalog) {
      const results = findPluginUpdates(handlers.manager.list(), state.catalog.plugins);
      const count = results.filter(item => item.status === 'update').length;
      content.append(el('div', `上次检测 ${state.checkedAt.toLocaleTimeString()} · ${count ? `${count} 个插件可更新` : '未发现可更新的正式版'}${results.some(item => item.status === 'unavailable') ? '（部分插件暂无正式版）' : ''}`, `notice update-summary${count ? ' has-update' : ''}`));
    } else content.append(el('div', '点击检测，比较已安装插件与市场最新版本。', 'notice'));
  }
  function catalogCards(container) {
    const state = currentMarketState();
    if (!state.client) { container.append(el('div', '离线模式：可导入插件包文件，已安装插件照常运行。', 'notice')); return; }
    if (state.loading) { container.append(el('div', '正在读取插件目录…', 'notice')); return; }
    if (state.error) { container.append(el('div', DEVELOPMENT ? '请检查目录地址、网络与跨域权限。' : '请检查网络后重试，已安装插件可继续使用。', 'muted')); return; }
    if (!state.catalog) { container.append(el('div', '点击连接后读取静态目录。目录离线不会停止已安装插件。', 'notice')); return; }
    const installed = new Map((handlers.manager?.list() || []).map(item => [item.id, item]));
    const filter = el('label', undefined, 'row');
    const toggle = styleSwitch(el('input')); toggle.type = 'checkbox'; toggle.checked = onlyUninstalled;
    toggle.addEventListener('change', () => { onlyUninstalled = toggle.checked; settings.set('marketOnlyUninstalled', onlyUninstalled); render(); });
    filter.append(el('span', '只显示未安装'), toggle); container.append(filter);
    const count = state.catalog.plugins.filter(entry => !onlyUninstalled || !installed.has(entry.id)).length;
    container.append(el('div', `${count} 个${onlyUninstalled ? '未安装' : '可用'}发布包`, 'muted'));
    if (!count) container.append(el('div', '目录中的插件均已安装', 'notice'));

    for (const entry of [...state.catalog.plugins].sort(comparePluginOrder)) {
      const card = el('section', undefined, 'card plugin-card'); pluginIdentity(card, entry);
      card.dataset.catalogKey = JSON.stringify([entry.id, entry.version]);
      const current = installed.get(entry.id), same = current?.version === entry.version;
      card.dataset.catalogInstalled = String(!!current);
      const bottom = el('div', undefined, 'plugin-bottom');
      const status = el('span', current ? `已安装${same ? '此版本' : ' ' + current.version}` : '未安装', 'plugin-status');
      status.title = status.textContent; status.style.whiteSpace = 'normal'; bottom.append(status);
      const busy = installing.has(entry.id);
      const install = button(busy ? '正在安装…' : same ? '已安装' : current ? '替换此版本' : '安装此版本', () => installEntry(entry));
      install.disabled = busy || same; install.style.marginLeft = 'auto'; install.style.flexShrink = '0';
      if (busy) card.setAttribute('aria-busy', 'true');
      bottom.append(install); card.append(bottom); markSearchable(card, entry); container.append(card);
    }
  }
  function coreUpdateStatus() {
    const version = currentMarketState().catalog?.core?.version;
    return typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version) ? { version, order: compareVersions(version, CORE_VERSION) } : null;
  }
  function renderCoreUpgrade() {
    const state = currentMarketState(), latest = coreUpdateStatus();
    const card = el('section', undefined, 'card plugin-card' + (latest?.order > 0 ? ' has-update' : ''));
    card.dataset.coreUpgrade = '';
    pluginIdentity(card, { name: '工具箱核心', version: CORE_VERSION, icon: 'toolbox', description: DEVELOPMENT ? '开发版：仅通过本机开发版安装页升级，安装完成后刷新游戏。' : '通过用户脚本安装页升级，安装完成后刷新游戏。' });
    const status = !state.client ? '离线 · 未检测核心版本' : state.loading ? '正在检测核心版本…' : state.error ? '核心版本检测失败，请重试' : !latest ? '尚未获取核心正式版信息' : latest.order > 0 ? '发现核心更新：' + CORE_VERSION + ' → ' + latest.version : latest.order < 0 ? '当前核心高于市场正式版 ' + latest.version : '核心已是市场最新正式版';
    card.append(el('div', DEVELOPMENT ? '开发版仅从本机 dev 构建升级；请先运行 npm run dev。' : status, 'notice'));
    const link = el('a', latest?.order > 0 ? '跳转升级至 ' + latest.version : '查看核心安装页');
    link.href = DEVELOPMENT ? 'http://127.0.0.1:17321/dev/toolbox.user.js' : new URL('../lite/toolbox.user.js', (state.client?.baseUrl || OSS_MARKET_URL) + '/').href;
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.style.cssText = 'display:inline-flex;align-items:center;gap:6px;color:var(--sgs-accent);padding:6px 0;';
    const actions = el('div', undefined, 'core-upgrade-actions');
    link.addEventListener('click', () => {
      pendingCoreUpgrade = latest?.order > 0 ? latest.version : CORE_VERSION;
      settings.set('pendingCoreUpgrade', pendingCoreUpgrade);
      render();
      notify('已打开核心安装页；完成安装后，请返回此页点击“刷新生效”。');
    });
    link.prepend(svgIcon('update')); actions.append(link);
    if (pendingCoreUpgrade) {
      const refresh = button('刷新生效', () => win.location.reload());
      refresh.prepend(svgIcon('refresh')); refresh.title = '完成脚本安装后，刷新当前游戏页面使新版核心生效';
      refresh.className = 'core-upgrade-refresh'; actions.append(refresh);
    }
    card.append(actions);
    if (pendingCoreUpgrade) {
      const reminder = el('div', '完成安装后，请刷新游戏使新版核心生效。当前页面仍运行 v' + CORE_VERSION + '。', 'core-upgrade-reminder');
      reminder.setAttribute('role', 'status'); card.append(reminder);
    }
    content.append(card);
  }
  function renderMarket() {
    renderCoreUpgrade();
    updateControls();
    pluginCards(); content.append(el('h3', '插件目录'));
    const catalog = el('div'); const actions = el('div', undefined, 'actions');
    const refresh = button('连接 / 刷新市场', fetchCatalog); refresh.disabled = !currentMarketState().client || !!currentMarketState().loading;
    actions.append(refresh, button('导入插件包', () => { const file = doc.createElement('input'); file.type = 'file'; file.accept = '.json'; file.onchange = async () => { try { if (!file.files[0]) return; await handlers.manager.install(JSON.parse(await file.files[0].text())); notify('插件包已安装'); } catch (e) { notify(e.message); } }; file.click(); }));
    if (handlers.manager?.builtins?.has('cards') && !handlers.manager.list().some(p => p.id === 'cards')) actions.append(button('恢复内置卡牌', () => handlers.manager.restoreBuiltin('cards')));
    if (DEVELOPMENT) content.append(el('div', handlers.market?.()?.baseUrl || '离线 · 未连接市场', 'muted'));
    content.append(actions, catalog);
    catalogCards(catalog);
  }
  function renderManagement(cleanups) {
    const tabs = el('div', undefined, 'tabs management-tabs'); for (const [id, title] of [['settings', '设置'], ['market', '插件市场'], ['appearance', '外观']]) { const b = button(title, () => { management = id; render(); }); if (management === id) b.className = 'active'; tabs.append(b); } content.append(tabs);
    if (management === 'settings') renderSettings(cleanups);
    else if (management === 'market') renderMarket();
    else if (management === 'appearance') renderAppearance(cleanups);
  }
  function render() {
    const previousKey = renderedKey;
    const anchors = renderedKey === 'manage:market' ? [...content.querySelectorAll('[data-catalog-key]')]
      .filter(card => !card.hidden && card.getBoundingClientRect().bottom > content.getBoundingClientRect().top)
      .map(card => ({ key: card.dataset.catalogKey, top: card.getBoundingClientRect().top })) : [];
    const restoreScroll = () => {
      content.scrollTop = viewScroll.get(renderedKey) || 0;
      if (previousKey !== renderedKey) return;
      for (const anchor of anchors) {
        const card = [...content.querySelectorAll('[data-catalog-key]')].find(card => !card.hidden && card.dataset.catalogKey === anchor.key);
        if (card) { content.scrollTop += card.getBoundingClientRect().top - anchor.top; break; }
      }
    };
    if (renderedKey) viewScroll.set(renderedKey, content.scrollTop);
    try { renderedCleanup?.(); } catch {} renderedCleanup = null; content.replaceChildren(); content.classList.remove('has-plugin-panels', 'appearance-page');
    const cleanups = [];
    renderedCleanup = () => { for (const clean of cleanups.splice(0)) { try { clean(); } catch {} } };
    const installed = handlers.manager?.list() || [], market = currentMarketState();
    const failures = installed.filter(item => !item.maintenance && (item.error || (item.enabled && !item.active))).length;
    const upgrades = market.catalog ? findPluginUpdates(installed, market.catalog.plugins).filter(item => item.status === 'update').length : 0;
    const manage = shadow.querySelector('[data-category="manage"]'); manage.querySelector('.nav-alert')?.remove();
    const coreUpgrade = coreUpdateStatus()?.order > 0;
    const alerts = [coreUpgrade && '核心可升级', failures && `${failures} 个插件异常`, upgrades && `${upgrades} 个插件可更新`].filter(Boolean).join(' · ');
    manage.title = alerts || '管理';
    if (alerts) { const badge = el('i', String(failures || (upgrades + Number(coreUpgrade))), `nav-alert${failures ? ' is-error' : ''}`); badge.setAttribute('aria-label', alerts); manage.append(badge); }
    for (const b of shadow.querySelectorAll('[data-category]')) b.setAttribute('aria-selected', String(b.dataset.category === active));
    renderedKey = active + ':' + (active === 'game' ? gameView : active === 'manage' ? management : '');
    if (active === 'manage') { renderManagement(cleanups); filterPlugins(); }
    const categoryPanels = [...panels.values()].filter(p => p.category === (active === 'manage' && management === 'appearance' ? 'appearance' : active)).sort(comparePanelOrder);
    const available = active === 'game' ? selectGamePanels(categoryPanels, gameView) : categoryPanels;
    if (!available.length) { if (active !== 'manage') empty('尚未安装此类插件', active === 'game' ? '前往管理 → 插件市场安装卡牌插件。' : '此分类为后续插件保留。'); restoreScroll(); return; }
    content.classList.add('has-plugin-panels');
    const groups = new Map();
    for (const panel of available) {
      const id = panel.pluginId || panel.id;
      let body = groups.get(id);
      if (!body) {
        const title = panel.pluginName || panel.title || id;
        const group = el('section', undefined, 'plugin-group'); group.dataset.pluginGroup = id;
        const heading = el('h2', undefined, 'plugin-heading');
        const toggle = el('button', undefined, 'plugin-toggle'); toggle.type = 'button';
        const icon = el('span'); icon.setAttribute('aria-hidden', 'true');
        icon.append(svgIcon(panel.pluginIcon || 'package'));
        toggle.append(icon, el('span', title, 'plugin-title'));
        toggle.append(createIcon(doc, 'chevron', 'plugin-chevron'));
        body = el('div', undefined, 'plugin-body'); body.id = `plugin-body-${groups.size}`;
        toggle.setAttribute('aria-controls', body.id);
        const apply = collapsed => {
          body.hidden = collapsed; toggle.setAttribute('aria-expanded', String(!collapsed));
          toggle.setAttribute('aria-label', `${collapsed ? '展开' : '收起'}${title}`); toggle.title = `${collapsed ? '展开' : '收起'}${title}`;
        };
        apply(settings.get(`pluginCollapsed:${id}`, false) === true);
        toggle.onclick = event => { if (event.detail > 1) return; const collapsed = !body.hidden; settings.set(`pluginCollapsed:${id}`, collapsed); apply(collapsed); };
        toggle.ondblclick = () => { settings.set(`pluginCollapsed:${id}`, false); apply(false); };
        heading.append(toggle); group.append(heading, body); content.append(group); groups.set(id, body);
      }
      const section = el('section'); section.dataset.panelId = panel.id; body.append(section);
      try { const clean = panel.render(section); if (typeof clean === 'function') cleanups.push(clean); }
      catch (e) { section.append(el('div', '面板加载失败：' + e.message, 'error')); }
    }
    restoreScroll();
  }
  for (const b of shadow.querySelectorAll('[data-category]')) scope.listen(b, 'click', () => { active = b.dataset.category; settings.set('category', active); render(); });
  scope.listen(shadow.querySelector('.nav'), 'keydown', e => { if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return; const buttons = [...shadow.querySelectorAll('[data-category]')]; const i = buttons.indexOf(shadow.activeElement); buttons[(i + (e.key === 'ArrowLeft' ? 4 : 1)) % 5].focus(); e.preventDefault(); });
  scope.listen(shadow.querySelector('[data-open-market]'), 'click', () => { active = 'manage'; management = 'market'; render(); });
  const setCollapsed = value => {
    if (value && host.hasAttribute('data-edge-docked')) {
      setEdgeDocked(false);
      const width = parseFloat(host.style.width) || 280;
      const free = settings.get('hudFloatingPosition', { x: Math.max(0, win.innerWidth - width - 24), y: 72 });
      host.style.left = Math.max(0, Math.min(win.innerWidth - 156, Number(free?.x) || 0)) + 'px';
      host.style.top = Math.max(0, Math.min(win.innerHeight - 45, Number(free?.y) || 0)) + 'px'; host.style.right = 'auto';
      settings.set('position', { x: parseFloat(host.style.left), y: parseFloat(host.style.top) });
    }
    host.toggleAttribute('data-collapsed', value); settings.set('collapsed', value); if (typeof syncGameViewport === 'function') syncGameViewport(); };
  host.toggleAttribute('data-collapsed', settings.get('collapsed', false));
  scope.listen(shadow.querySelector('.brand button'), 'click', () => setCollapsed(true));
  const expandHUD = () => {
    setCollapsed(false);
    if (host.style.left) host.style.left = Math.max(0, Math.min(win.innerWidth - (parseFloat(host.style.width) || 280), parseFloat(host.style.left))) + 'px';
  };
  scope.listen(shadow.querySelector('[data-expand]'), 'click', expandHUD);
  scope.listen(shadow.querySelector('.compact'), 'dblclick', event => {
    if (event.target.closest('button')) return;
    event.preventDefault(); expandHUD();
  });
  scope.listen(shadow.querySelector('[data-screenshot]'), 'click', () => handlers.screenshot?.());
  const mobileDevice = () => !!win.navigator.userAgentData?.mobile || /Android|iPhone|iPad|iPod|Mobile/i.test(win.navigator.userAgent || '') || (win.navigator.platform === 'MacIntel' && win.navigator.maxTouchPoints > 1) || !!win.matchMedia?.('(pointer: coarse)').matches;
  const edgeBehavior = () => { const value = settings.get('hudEdgeBehavior', 'fixed'); return mobileDevice() ? 'none' : ['none', 'hide', 'fixed'].includes(value) ? value : 'fixed'; };
  const gameViewport = createGameViewport({ window: win, document: doc, scope });
  const syncGameViewport = () => gameViewport.reserve(host.hasAttribute('data-edge-fixed') ? (host.hasAttribute('data-collapsed') ? 156 : parseFloat(host.style.width) || 280) : 0);
  let edgeHideTimer, draggingHUD = false;
  const revealEdge = () => { clearTimeout(edgeHideTimer); host.removeAttribute('data-edge-hidden'); };
  const hasKeyboardFocus = () => host.matches(':focus-visible') || !!shadow.activeElement?.matches(':focus-visible');
  const hideEdge = () => {
    clearTimeout(edgeHideTimer);
    if (!host.hasAttribute('data-edge-docked') || host.hasAttribute('data-edge-fixed') || draggingHUD || hasKeyboardFocus()) return;
    edgeHideTimer = setTimeout(() => { if (!scope.closed && !draggingHUD && !hasKeyboardFocus()) host.setAttribute('data-edge-hidden', ''); }, 180);
  };
  const setEdgeDocked = (value, hidden = false) => {
    const behavior = edgeBehavior(), docked = !!value && behavior !== 'none'; revealEdge();
    host.toggleAttribute('data-edge-docked', docked); host.toggleAttribute('data-edge-fixed', docked && behavior === 'fixed'); host.toggleAttribute('data-edge-hidden', docked && behavior === 'hide' && hidden);
    if (docked) { setCollapsed(false); host.tabIndex = 0; host.setAttribute('aria-label', behavior === 'fixed' ? '工具箱固定侧栏' : '工具箱自动隐藏侧栏'); }
    else { host.removeAttribute('tabindex'); host.removeAttribute('aria-label'); }
    settings.set('edgeDocked', docked); syncGameViewport();
  };
  const edgeResizer = doc.createElement('div'); edgeResizer.className = 'edge-resizer'; edgeResizer.tabIndex = 0;
  edgeResizer.setAttribute('role', 'separator'); edgeResizer.setAttribute('aria-orientation', 'vertical'); edgeResizer.setAttribute('aria-label', '调整侧栏宽度'); edgeResizer.title = '向左拖动加宽，向右拖动变窄；方向键调整';
  edgeResizer.setAttribute('aria-valuemin', '248'); edgeResizer.setAttribute('aria-valuemax', '420');
  const grip = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); grip.setAttribute('viewBox', '0 0 24 24'); grip.setAttribute('aria-hidden', 'true');
  const gripPath = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); gripPath.setAttribute('d', 'M5 11l8 8M5 16l3 3'); grip.append(gripPath); edgeResizer.append(grip); shadow.append(edgeResizer);
  const applyEdgeWidth = value => {
    const width = Math.max(248, Math.min(420, Math.round(value))); host.style.width = width + 'px'; shadow.querySelector('.shell').style.width = width + 'px';
    edgeResizer.setAttribute('aria-valuenow', String(width)); syncGameViewport(); return width;
  };
  let edgeResize;
  const finishEdgeResize = () => { if (!edgeResize) return; edgeResize = undefined; draggingHUD = false; settings.set('width', parseFloat(host.style.width)); if (!host.matches(':hover')) hideEdge(); };
  scope.listen(edgeResizer, 'pointerdown', event => {
    if (event.button !== 0) return; event.preventDefault(); event.stopPropagation(); revealEdge(); draggingHUD = true;
    edgeResize = { x: event.clientX, width: host.getBoundingClientRect().width };
  });
  scope.listen(win, 'pointermove', event => { if (edgeResize) { event.preventDefault(); applyEdgeWidth(edgeResize.width + edgeResize.x - event.clientX); } });
  scope.listen(win, 'pointerup', finishEdgeResize); scope.listen(win, 'pointercancel', finishEdgeResize);
  scope.listen(edgeResizer, 'keydown', event => {
    const current = parseFloat(host.style.width) || 280;
    const next = { ArrowLeft: current + 8, ArrowRight: current - 8, Home: 248, End: 420 }[event.key];
    if (next === undefined) return; event.preventDefault(); settings.set('width', applyEdgeWidth(next));
  });
  scope.listen(host, 'pointerenter', revealEdge);
  scope.listen(host, 'pointerleave', hideEdge);
  scope.listen(host, 'focusin', revealEdge);
  scope.listen(host, 'focusout', () => { if (!host.matches(':hover')) hideEdge(); });
  scope.listen(win, 'resize', () => { if (mobileDevice()) { setEdgeDocked(false); if (active === 'manage') render(); } if (host.style.left) host.style.left = Math.max(0, Math.min(win.innerWidth - (host.hasAttribute('data-collapsed') ? 156 : parseFloat(host.style.width) || 280), parseFloat(host.style.left))) + 'px'; });
  scope.add(() => clearTimeout(edgeHideTimer));
  setEdgeDocked(settings.get('edgeDocked', false), true);
  const position = settings.get('position', null); if (position) { host.style.left = Math.max(0, Math.min(win.innerWidth - 248, position.x)) + 'px'; host.style.top = Math.max(0, Math.min(win.innerHeight - 50, position.y)) + 'px'; host.style.right = 'auto'; }
  host.style.width = Math.max(248, Math.min(420, settings.get('width', 280))) + 'px'; edgeResizer.setAttribute('aria-valuenow', String(parseFloat(host.style.width))); syncGameViewport();
  if (win.ResizeObserver) {
    let saveWidth;
    const observer = new win.ResizeObserver(entries => { if (host.hasAttribute('data-collapsed')) return; const width = Math.round(entries[0].borderBoxSize?.[0]?.inlineSize || shadow.querySelector('.shell').getBoundingClientRect().width); if (width < 248) return; host.style.width = width + 'px'; edgeResizer.setAttribute('aria-valuenow', String(width)); syncGameViewport(); clearTimeout(saveWidth); saveWidth = setTimeout(() => settings.set('width', width), 200); });
    observer.observe(shadow.querySelector('.shell')); scope.add(() => { observer.disconnect(); clearTimeout(saveWidth); });
  }
  for (const handle of shadow.querySelectorAll('.brand,.compact')) scope.listen(handle, 'pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button')) return; let moved = false; const rect = host.getBoundingClientRect(); if (!host.hasAttribute('data-edge-docked') && rect.right < win.innerWidth - 12) settings.set('hudFloatingPosition', { x: rect.left, y: rect.top }); draggingHUD = true; setEdgeDocked(false); host.style.left = rect.left + 'px'; host.style.right = 'auto'; const dx = e.clientX - rect.left, dy = e.clientY - rect.top;
    const move = event => { moved ||= Math.abs(event.clientX - e.clientX) > 3 || Math.abs(event.clientY - e.clientY) > 3; host.style.left = Math.max(0, Math.min(win.innerWidth - rect.width, event.clientX - dx)) + 'px'; host.style.top = Math.max(0, Math.min(win.innerHeight - 45, event.clientY - dy)) + 'px'; host.style.right = 'auto'; };
    const up = () => { win.removeEventListener('pointermove', move); win.removeEventListener('pointerup', up); draggingHUD = false; settings.set('position', { x: host.offsetLeft, y: host.offsetTop }); if (moved && !mobileDevice() && host.getBoundingClientRect().right >= win.innerWidth - 12) { setEdgeDocked(true); if (!host.matches(':hover')) hideEdge(); } };
    win.addEventListener('pointermove', move); win.addEventListener('pointerup', up); scope.add(() => { win.removeEventListener('pointermove', move); win.removeEventListener('pointerup', up); });
  });
  const mount = () => { if (!host.isConnected && doc.documentElement) doc.documentElement.append(host); }; mount(); scope.interval(mount, 1000);
  scope.add(() => {
    try { renderedCleanup?.(); }
    finally { renderedCleanup = null; clearTimeout(toastTimer); host.remove(); }
  });
  const compactSummaries = new Map();
  function setCompactSummary(id, items) {
    if (items.length) compactSummaries.set(id, items); else compactSummaries.delete(id);
    const summary = shadow.querySelector('.compact-summary'); summary.replaceChildren();
    for (const rows of compactSummaries.values()) for (const item of rows) {
      const row = el('div', undefined, 'compact-summary-row');
      row.title = item.detail || ''; row.append(el('span', item.label), el('b', item.value)); summary.append(row);
    }
  }
  render();
  return { host, shadow, setCompactSummary, notify, showLegacyWarning, render, setGameView(value) {
    const next = value === 'shanhe' ? 'shanhe' : 'battle';
    if (next === gameView) return;
    gameView = next; if (active === 'game') render();
  }, setRemainingSlash(value) {
    const known = Number.isFinite(value), text = value === Infinity ? '∞' : known ? String(value) : '—';
    const compact = shadow.querySelector('.compact'), count = shadow.querySelector('[data-slash]');
    count.textContent = text; compact.dataset.countState = value === Infinity ? 'unlimited' : !known ? 'unknown' : value === 0 ? 'empty' : 'ready';
    compact.dataset.countSize = text.length > 2 ? 'long' : 'normal';
    const label = value === Infinity ? '出杀次数不限' : known ? `剩余出杀次数：${text}` : '剩余出杀次数暂不可用';
    count.setAttribute('aria-label', label); shadow.querySelector('.slash').title = label + '；双击展开，按住拖动';
  }, setHandlers(value) { handlers = value; render(); }, setStatusVisible(visible) { shadow.querySelector('.status').hidden = !visible; }, setStatus(text) { shadow.querySelector('.status span').textContent = text; }, applyTheme(tokens) { host.dataset.themeScheme = tokens.scheme === 'light' ? 'light' : 'dark'; for (const [key, value] of Object.entries(tokens)) host.style.setProperty('--sgs-' + key, value); }, registerPanel(spec) { if (panels.has(spec.id)) throw new Error('面板重复注册：' + spec.id); panels.set(spec.id, spec); render(); return () => { panels.delete(spec.id); render(); }; } };
}
