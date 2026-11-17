import { build, transform } from 'esbuild';
import { resolve } from 'node:path';

export async function bundleCore({ root, edition, packages, microclient = false }) {
  if (!['dev', 'full', 'lite'].includes(edition)) throw new Error('Unknown edition');
  if (microclient && edition === 'dev') throw new Error('Microclient builds support full/lite only');
  const injected = edition === 'lite' ? [] : packages;
  const result = await build({ absWorkingDir: root, entryPoints: [resolve(root, 'src/core/main.js')], bundle: true,
    format: 'iife', target: microclient ? 'chrome85' : 'es2022', write: false, metafile: true, legalComments: 'inline', minifySyntax: true,
    define: { __SGS_TOOLBOX_DEVELOPMENT__: String(edition === 'dev'), __SGS_TOOLBOX_EDITION__: JSON.stringify(edition), __SGS_TOOLBOX_MICROCLIENT__: String(microclient) },
    plugins: [{ name: 'bundled-plugin-packages', setup(api) {
      if (microclient) api.onLoad({ filter: /[\\/]compat[\\/]index\.js$/ }, () => ({ contents: 'export function createCompatibility() { throw new Error("Browser compatibility is unavailable in microclient"); }', loader: 'js' }));
      if (microclient) api.onLoad({ filter: /[\\/]core[\\/]refresh-reentry\.js$/ }, () => ({ contents: 'export function installRefreshReentry() { return false; }', loader: 'js' }));
      api.onLoad({ filter: /[\\/]core[\\/]bundled-plugins\.js$/ }, () => ({ contents: `export const bundledPackages = ${JSON.stringify(injected)};`, loader: 'js' }));
    } }] });
  const inputs = Object.keys(result.metafile.inputs);
  if (edition === 'lite' && inputs.some(file => /(?:^|\/)src\/plugins\//.test(file))) throw new Error('Lite imports a plugin implementation');
  // A second syntax pass removes platform branches after Chrome 85 lowering.
  // Do not retain unreachable browser-only settings/help in the microclient.
  const code = microclient ? (await transform(result.outputFiles[0].text, { target: 'chrome85', minifySyntax: true, legalComments: 'inline' })).code : result.outputFiles[0].text;
  return { code, inputs };
}

export function userscriptHeader({ edition, version, toolboxSvg }) {
  const dev = edition === 'dev', label = { dev: '开发版', full: '完整版', lite: '轻量版' }[edition];
  const update = dev ? '// @updateURL    http://127.0.0.1:17321/dev/toolbox.meta.js\n// @downloadURL  http://127.0.0.1:17321/dev/toolbox.user.js\n' : `// @updateURL    https://raw.githubusercontent.com/Usernametoolongmaximumis39/sgs-ol-toolbox/main/${edition}/toolbox.meta.js\n// @downloadURL  https://raw.githubusercontent.com/Usernametoolongmaximumis39/sgs-ol-toolbox/main/${edition}/toolbox.user.js\n`;
  // Full and lite intentionally share script identity. An update replaces the
  // existing script instead of installing a second copy next to it.
  return `// ==UserScript==
// @name         三国杀OL工具箱${dev ? ' 开发版' : ''}
// @namespace    sgs-ol-toolbox${dev ? '-development' : ''}
// @version      ${version}${dev ? '-dev' : ''}
// @license      MIT
// @icon         data:image/svg+xml,${encodeURIComponent(toolboxSvg)}
// @description  ${label}：${edition === 'lite' ? '独立核心，按需安装插件并沿用已保存的插件' : '工具箱核心与全部插件'}
// @match        https://web.sanguosha.com/*
// @match        http://web.sanguosha.com/*
// @match        https://openapi.alipay.com/gateway.do*
// @match        https://excashier.alipay.com/standard/auth.htm*
${dev ? '// @match        http://127.0.0.1:17321/dev/*\n' : ''}${update}// @exclude      *://web.sanguosha.com/10/*
// @exclude      *://web.sanguosha.com/10th/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      openapi.alipay.com
// @connect      excashier.alipay.com
// ==/UserScript==

`;
}
