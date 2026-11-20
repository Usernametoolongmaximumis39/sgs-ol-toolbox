import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import { createMobileCatalogue } from '../src/plugins/skins/mobile-skins.js';

test('mobile cloud skins are searchable by verified title or number, with numbered fallback for unverified titles', async t => {
  const root = 'https://mres.sanguosha.cn/update_cloud/public/';
  const jiangwei = {
    5201: '斩将拔城', 5202: '烽火乱世', 5203: '挥师北伐', 5204: '继志定军',
    5205: '遗恨渭水', 13901: '上邽之决', 87001: '经典形象', 87002: '剑引天霖',
  };
  const ids = [...Object.keys(jiangwei), '30011', '30011#1', '15902', '14002', '53502', '17304', '99901'];
  const paths = ids.map(id => `ui/bface/skin/${id}_1.jpg`);
  const artworkHash = 'a'.repeat(32);
  const entries = paths.map(path => `["${path}"] = {file="ui/bface/skin/${artworkHash}.jpg",code="${artworkHash}",size=1},`);
  const archive = zipSync({ cloud: new TextEncoder().encode(`return { version = "461009", dic = {\n${entries.join('\n')}\n} }`) });
  const md5 = createHash('md5').update(archive).digest('hex');
  const metadata = new TextEncoder().encode(JSON.stringify({ cloud: { version: '461009', md5, url: root } }));
  const scope = { signal: new AbortController().signal, add: callback => t.after(callback) };
  const catalogue = createMobileCatalogue({ window: globalThis, scope, game: {
    async downloadMobileSkinAsset(url) {
      if (url === 'https://waym.sanguosha.cn/update/cloud.php') return metadata.buffer;
      assert.equal(url, `${root}cloud_461009.zip`);
      return archive.buffer;
    },
  } });

  const index = await catalogue.load();
  for (const [id, name] of Object.entries(jiangwei)) {
    assert.equal(index.searchSkins(id).all[0]?.name, name);
    assert.equal(index.searchSkins(name).all[0]?.id, `cloud-${id}`);
  }
  const [guanYu] = index.searchSkins('圣垂千古').all;
  assert.equal(index.searchSkins('圣垂千古').all.length, 1);
  assert.equal(index.searchSkins('30011#1').all[0], guanYu);
  const second = index.findSkin('cloud-30011#1');
  assert.deepEqual(index.skinForms(guanYu), [guanYu, second]);
  assert.deepEqual(index.skinForms(second), [guanYu, second]);
  assert.equal(second.name, '圣垂千古 · 第二形态');
  assert.equal(index.searchSkins('徐庶').all[0]?.name, '迟迟吾行');
  assert.equal(index.searchSkins('鼠年春节').all[0]?.general, '兀突骨');
  assert.equal(index.searchSkins('剑戟森森').all[0]?.id, 'cloud-53502');
  assert.equal(index.searchSkins('偷酒不拜').all[0]?.id, 'cloud-17304');
  assert.equal(index.findSkin('cloud-99901')?.name, '皮肤 99901');
});
