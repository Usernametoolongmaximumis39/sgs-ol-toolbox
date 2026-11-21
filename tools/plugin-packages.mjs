import { build } from 'esbuild';
import { resolve, relative, sep } from 'node:path';
import { realpath } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { packageDigest, PACKAGE_FORMAT, validateManifest } from '../src/core/packages.js';
import { pluginReleases } from './plugin-releases.mjs';

export { pluginReleases };

export function fullBundledPackages(packages) {
  return packages.filter(pkg => !pluginReleases.some(spec => spec.id === pkg.manifest.id && (spec.localOnly || spec.excludeFromFull)));
}

/** Each package is bundled from its own entry. Cross-plugin imports are a build error. */
export async function bundlePlugin(id, { root = resolve(import.meta.dirname, '..') } = {}) {
  if (typeof id !== 'string' || !/^[a-z][a-z0-9.-]{0,63}$/.test(id)) throw new Error('插件目录 ID 无效');
  const entry = resolve(root, 'src/plugins', id, 'index.js');
  return bundlePluginEntry(entry, { root, id });
}

// Resolve the entire graph before evaluating any module. In particular, never
// import an unchecked source entry in the Node process that runs the build.
export async function bundlePluginEntry(entry, { root = resolve(import.meta.dirname, '..'), id } = {}) {
  root = await realpath(root);
  entry = await realpath(entry);
  id ??= relative(root, entry).split(sep).join('/').match(/^src\/plugins\/([^/]+)\/index\.js$/)?.[1];
  const ownDir = resolve(entry, '..');
  const within = (file, dir) => file === dir || file.startsWith(dir + sep);
  const allowed = file => within(file, ownDir) || within(file, resolve(root, 'src/ui'))
    || within(file, resolve(root, 'src/shared'))
    || ['resources.js', 'themes.js', 'seat.js'].some(name => file === resolve(root, 'src/core', name));
  const globalName = id === 'cards' ? 'SGSCards' : 'SGSPlugin';
  const compact = pluginReleases.some(spec => spec.id === id && spec.compact);
  const bundled = await build({ absWorkingDir: root, entryPoints: [entry], bundle: true,
    format: 'iife', globalName, target: 'es2022', write: false, metafile: true,
    minifySyntax: compact, minifyWhitespace: compact,
    logLevel: 'silent', logOverride: { 'unsupported-dynamic-import': 'error', 'unsupported-require-call': 'error' },
    plugins: [{ name: 'plugin-boundaries', setup(api) {
      api.onResolve({ filter: /.*/ }, async args => {
        if (args.kind === 'entry-point') return { path: entry };
        if (args.kind !== 'import-statement' || !['./', '../'].some(prefix => args.path.startsWith(prefix))) throw new Error('插件只允许可静态打包的相对 ESM 导入：' + args.path);
        const file = await realpath(resolve(args.resolveDir, args.path));
        if (!allowed(file)) throw new Error('插件导入越界（仅自身、ui、shared 及公开纯辅助模块 resources/themes/seat）：' + args.path);
        return { path: file };
      });
    } }] });
  const inputs = Object.keys(bundled.metafile.inputs).map(path => relative(root, resolve(root, path)).split(sep).join('/'));
  for (const input of inputs) {
    if (id && input.startsWith('src/plugins/') && !input.startsWith(`src/plugins/${id}/`)) {
      throw new Error(`${id} 引用了其他插件：${input}`);
    }
  }
  const externals = Object.values(bundled.metafile.outputs).flatMap(output => output.imports).filter(item => item.external);
  if (externals.length) throw new Error(`${id} 发布包包含外部模块依赖`);
  const body = bundled.outputFiles[0].text;
  // This is an import-time smoke check, not a security sandbox or a proof of purity.
  const environment = { console: undefined };
  const plugin = runInNewContext(`${body}\n${globalName}.default`,
    environment, { timeout: 1500, contextCodeGeneration: { strings: false, wasm: false } });
  if (environment.console !== undefined || Reflect.ownKeys(environment).some(key => key !== 'console' && key !== globalName)) throw new Error(`${id || entry} 模块顶层不能写入全局状态`);
  const manifest = structuredClone(plugin?.manifest);
  validateManifest(manifest, { requireContract: true });
  if (id && manifest.id !== id) throw new Error(`插件目录与 ID 不符：${id}`);
  if (manifest.requires !== undefined) throw new Error(`${manifest.id} 请使用 dependencies 声明前置插件`);
  for (const key of ['activate', 'initialState', 'reduce']) {
    if ((key === 'activate' || plugin[key] !== undefined) && typeof plugin[key] !== 'function') throw new Error(`${manifest.id} ${key} 必须是函数`);
  }
  return { manifest, inputs, body, globalName };
}

export async function makePluginPackage(bundle, version = bundle.manifest.version) {
  const manifest = { ...bundle.manifest, version };
  validateManifest(manifest, { requireContract: true });
  const code = bundle.body + '\nreturn {...' + bundle.globalName + '.default, manifest:' + JSON.stringify(manifest) + '};\n';
  return { format: PACKAGE_FORMAT, manifest, code, sha256: await packageDigest(manifest, code) };
}
