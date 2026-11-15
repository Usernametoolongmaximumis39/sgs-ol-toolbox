import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { bundleCore, userscriptHeader } from './distribution-build.mjs';
import { CORE_VERSION } from '../src/core/version.js';
import { pluginReleases, bundlePlugin, makePluginPackage } from './plugin-packages.mjs';
import { TOOLBOX_ICON } from '../src/ui/plugin-icons.js';

const root = resolve(import.meta.dirname, '..');
const edition = process.argv[2];
if (edition && !['full', 'lite'].includes(edition)) throw new Error('Public builds support full/lite only');
const packages = [];
if (edition !== 'lite') for (const spec of pluginReleases) {
  const pkg = await makePluginPackage(await bundlePlugin(spec.id, { root })); packages.push(pkg);
  const dir = resolve(root, 'dist/plugins/packages', spec.id); await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, pkg.manifest.version + '.json'), JSON.stringify(pkg));
}
const toolboxSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="24" height="24" rx="5" fill="#171b1d"/><g fill="none" stroke="#c8ab6a" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${TOOLBOX_ICON.paths.map(d => `<path d="${d}"/>`).join('')}</g></svg>`;
for (const target of edition ? [edition] : ['full', 'lite']) {
  const { code } = await bundleCore({ root, edition: target, packages });
  const header = userscriptHeader({ edition: target, version: CORE_VERSION, toolboxSvg });
  const dir = resolve(root, 'dist', target); await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'toolbox.user.js'), header + code);
  await writeFile(resolve(dir, 'toolbox.meta.js'), header);
  console.log(`Built ${target} ${CORE_VERSION}`);
}
