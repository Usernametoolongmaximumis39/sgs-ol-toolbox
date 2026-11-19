import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { bundleCore } from './distribution-build.mjs';
import { validateRepositoryPlugins } from './plugin-validation.mjs';
import { pluginReleases, makePluginPackage } from './plugin-packages.mjs';
import { CORE_VERSION } from '../src/core/version.js';
import { zipFiles } from './microclient-zip.mjs';

export async function buildMicroclient({ root = resolve(import.meta.dirname, '..'), out = resolve(root, 'release/microclient'), editions = ['full', 'lite'] } = {}) {
  if (!editions.length || editions.some(edition => !['full', 'lite'].includes(edition))) throw new Error('Microclient builds support full/lite only');
  const { bundles } = await validateRepositoryPlugins({ root });
  const selected = JSON.parse(await readFile(resolve(root, 'microclient/bundled-plugins.json'), 'utf8'));
  if (!Array.isArray(selected) || new Set(selected).size !== selected.length || selected.some(id => !pluginReleases.some(spec => spec.id === id))) throw new Error('Invalid microclient Full whitelist');
  for (const id of selected) for (const dep of bundles.find(b => b.manifest.id === id).manifest.dependencies || []) if (!selected.includes(dep)) throw new Error('Microclient Full dependency must be explicitly selected: ' + dep);
  const packages = await Promise.all(selected.map(id => makePluginPackage(bundles.find(b => b.manifest.id === id))));
  const host = await readFile(resolve(root, 'microclient/host.cjs')), preload = await readFile(resolve(root, 'microclient/preload.cjs'));
  const readme = await readFile(resolve(root, 'public-docs/microclient/README.txt'), 'utf8').catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return readFile(resolve(root, 'microclient/README.txt'), 'utf8');
  });
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const built = {};
  const approved = JSON.parse(await readFile(resolve(root, 'microclient/approved-payloads.json'), 'utf8'));
  for (const edition of ['full', 'lite']) {
    built[edition] = await bundleCore({ root, edition, packages, microclient: true });
    built[edition].source = '// 三国杀OL工具箱 · 微端 ' + edition.toUpperCase() + ' · ' + CORE_VERSION + '\n' + built[edition].code;
    approved.push({ version: CORE_VERSION, edition, toolboxSha256: hash(built[edition].source), hostSha256: hash(host), preloadSha256: hash(preload) });
  }
  const results = {};
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'toolbox.js'), built.lite.source);
  await writeFile(resolve(out, 'update.json'), JSON.stringify({ format: 'sgs-toolbox-script-v1', hostApi: 1, version: CORE_VERSION, bytes: Buffer.byteLength(built.lite.source), sha256: hash(built.lite.source) }, null, 2) + '\n');
  for (const edition of editions) {
    const dir = resolve(out, edition), { source, inputs } = built[edition];
    if (inputs.some(file => /compat\/(?:profiles|index)\.js/.test(file) && !file.endsWith('compat/index.js'))) throw new Error('Microclient includes browser compatibility runtime');
    const files = [];
    const put = async (path, data) => { data = Buffer.isBuffer(data) ? data : Buffer.from(data); files.push({ path, data }); await mkdir(resolve(dir, path, '..'), { recursive: true }); await writeFile(resolve(dir, path), data); };
    await put('payload/toolbox.js', source);
    await put('approved-payloads.json', JSON.stringify(approved, null, 2) + '\n');
    for (const name of ['host.cjs', 'preload.cjs']) await put('payload/' + name, await readFile(resolve(root, 'microclient', name)));
    for (const name of ['install.bat', 'uninstall.bat', 'restore.bat', 'installer.ps1', 'official-windows.json', 'switch-channel.bat', 'switch-channel.ps1']) {
      let text = await readFile(resolve(root, 'microclient', name), 'utf8');
      if (name.endsWith('.ps1')) text = '\ufeff' + text.replace(/^\ufeff/, '');
      if (name.endsWith('.bat') || name.endsWith('.ps1')) text = text.replace(/\r?\n/g, '\r\n');
      await put(name, text);
    }
    await put('安装说明.txt', `三国杀OL工具箱 微端 ${edition.toUpperCase()} ${CORE_VERSION}\r\n\r\n` + readme);
    await put('LICENSE', await readFile(resolve(root, 'LICENSE')));
    const manifest = { format: 'sgs-toolbox-microclient-v1', version: CORE_VERSION, edition, plugins: edition === 'lite' ? 0 : packages.length,
      files: files.filter(f => f.path.startsWith('payload/')).map(f => ({ path: f.path.slice(8), sha256: createHash('sha256').update(f.data).digest('hex') })) };
    await put('payload.json', JSON.stringify(manifest, null, 2) + '\n');
    // No stale dev files or unlisted payloads may enter a rebuilt installer.
    const expected = new Set(files.map(f => f.path));
    const zipName = `sgs-toolbox-microclient-${edition}.zip`;
    async function check(dirPath) { for (const entry of await readdir(dirPath, { withFileTypes: true })) {
      const file = resolve(dirPath, entry.name), rel = relative(dir, file).replaceAll('\\', '/');
      if (entry.isDirectory()) await check(file); else if (!expected.has(rel) && rel !== zipName) throw new Error('Unexpected installer file: ' + rel);
    } }
    await check(dir);
    const zip = zipFiles(files.sort((a, b) => a.path.localeCompare(b.path)));
    await writeFile(resolve(dir, zipName), zip);
    results[edition] = { version: CORE_VERSION, plugins: manifest.plugins, scriptBytes: Buffer.byteLength(source), zipBytes: zip.length, zipSha256: createHash('sha256').update(zip).digest('hex'), inputs };
  }
  await writeFile(resolve(out, 'distributions.json'), JSON.stringify(results, null, 2) + '\n');
  return results;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  console.log(JSON.stringify(await buildMicroclient({ editions: process.argv[2] ? [process.argv[2]] : ['full', 'lite'] }), null, 2));
}
