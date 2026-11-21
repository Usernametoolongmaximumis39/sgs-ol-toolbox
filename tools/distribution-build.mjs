import { build, transform } from 'esbuild';
import { resolve } from 'node:path';
import { fullBundledPackages } from './plugin-packages.mjs';
import { GITHUB_MARKET_URL } from '../src/core/distribution.js';

export function configuredUpdateMirror(value = process.env.SGS_TOOLBOX_UPDATE_ORIGIN) {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('SGS_TOOLBOX_UPDATE_ORIGIN 必须是完整 HTTPS 源地址，无需填写路径');
  }
  return url.origin + '/updates';
}

export async function bundleCore({ root, edition, packages, microclient = false, localAppearanceSyncPackage = null }) {
  if (!['dev', 'full', 'lite'].includes(edition)) throw new Error('Unknown edition');
  if (microclient && edition === 'dev') throw new Error('Microclient builds support full/lite only');
  if (localAppearanceSyncPackage && (!microclient || edition !== 'lite' || localAppearanceSyncPackage.manifest?.id !== 'appearances'))
    throw new Error('Local appearance sync requires a microclient Lite build and the appearances package');
  const injected = edition === 'lite' ? [] : edition === 'full' ? fullBundledPackages(packages) : packages;
  const result = await build({ absWorkingDir: root, entryPoints: [resolve(root, 'src/core/main.js')], bundle: true,
    format: 'iife', target: microclient ? 'chrome85' : 'es2022', write: false, metafile: true, legalComments: 'inline', minifySyntax: true,
    define: { __SGS_TOOLBOX_DEVELOPMENT__: String(edition === 'dev'), __SGS_TOOLBOX_EDITION__: JSON.stringify(edition),
      __SGS_TOOLBOX_MICROCLIENT__: String(microclient), __SGS_TOOLBOX_LOCAL_APPEARANCE_SYNC__: String(Boolean(localAppearanceSyncPackage)),
      __SGS_TOOLBOX_UPDATE_MIRROR__: JSON.stringify(edition === 'dev' ? '' : configuredUpdateMirror()) },
    plugins: [{ name: 'bundled-plugin-packages', setup(api) {
      if (microclient) api.onLoad({ filter: /[\\/]compat[\\/]index\.js$/ }, () => ({ contents: 'export function createCompatibility() { throw new Error("Browser compatibility is unavailable in microclient"); }', loader: 'js' }));
      if (microclient) api.onLoad({ filter: /[\\/]core[\\/]refresh-reentry\.js$/ }, () => ({ contents: 'export function installRefreshReentry() { return false; }', loader: 'js' }));
      api.onLoad({ filter: /[\\/]core[\\/]bundled-plugins\.js$/ }, () => ({
        contents: `export const bundledPackages = ${JSON.stringify(injected)};\nexport const localAppearanceSyncPackage = ${JSON.stringify(localAppearanceSyncPackage)};`, loader: 'js',
      }));
    } }] });
  const inputs = Object.keys(result.metafile.inputs);
  if (edition === 'lite' && inputs.some(file => /(?:^|\/)src\/plugins\//.test(file))) throw new Error('Lite imports a plugin implementation');
  // A second syntax pass removes platform branches after Chrome 85 lowering.
  // Do not retain unreachable browser-only settings/help in the microclient.
  const pageCode = result.outputFiles[0].text;
  let code;
  if (microclient) {
    code = (await transform(pageCode, { target: 'chrome85', minifySyntax: true, legalComments: 'inline' })).code;
  } else {
    const loader = await build({ absWorkingDir: root, entryPoints: [resolve(root, 'src/core/userscript.js')], bundle: true,
      format: 'iife', target: 'es2022', globalName: 'Userscript', write: false, minifySyntax: true });
    code = `(() => {\n${loader.outputFiles[0].text}\nUserscript.runUserscript(function (sgsToolboxMobileSkinPort) {\n${pageCode}\n});\n})();\n`;
  }
  return { code, inputs };
}

export function userscriptHeader({ edition, version, toolboxSvg }) {
  const dev = edition === 'dev', label = { dev: '开发版', full: '完整版', lite: '轻量版' }[edition];
  const mirror = dev ? '' : configuredUpdateMirror();
  const root = dev ? 'http://127.0.0.1:17321' : mirror || GITHUB_MARKET_URL.slice(0, -'/plugins'.length);
  const channel = mirror ? 'lite' : edition;
  const update = `// @updateURL    ${root}/${channel}/toolbox.meta.js\n// @downloadURL  ${root}/${channel}/toolbox.user.js\n`;
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
${dev ? '// @match        http://127.0.0.1:17321/dev/*\n' : ''}${update}// @exclude      *://web.sanguosha.com/10/*
// @exclude      *://web.sanguosha.com/10th/*
// @run-at       document-start
// @inject-into  content
// @sandbox      DOM
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      waym.sanguosha.cn
// @connect      mres.sanguosha.cn
// @connect      download.sanguosha.cn
// @connect      gx.95chong.cn
// ==/UserScript==

`;
}
