import test from 'node:test';
import assert from 'node:assert/strict';
import { ResourceScope } from '../src/core/resources.js';
import { createShopButtonReveal } from '../src/plugins/shanhetu/shop-button.js';

function fixture() {
  const scope = new ResourceScope(), controller = createShopButtonReveal({ scope });
  const leftView = { shopBtn: { visible: false }, UpdateShopData(show = false) { this.shopBtn.visible = show; return 'updated'; } };
  return { scope, controller, leftView, scene: { SceneName: 'RogueSmallMapScene', leftView } };
}
test('late map button is revealed and native refresh cannot hide it again', () => {
  const f = fixture(), original = f.leftView.UpdateShopData;
  f.controller.refresh({ SceneName: f.scene.SceneName });
  f.controller.refresh(f.scene); assert.equal(f.leftView.shopBtn.visible, true);
  assert.equal(f.leftView.UpdateShopData(false), 'updated'); assert.equal(f.leftView.shopBtn.visible, true);
  f.scope.dispose(); assert.equal(f.leftView.shopBtn.visible, false); assert.equal(f.leftView.UpdateShopData, original);
});
test('native opening remains visible after disabling; hidden state is restored on battle and replacement', () => {
  const f = fixture(); f.controller.refresh(f.scene); f.leftView.UpdateShopData(true);
  f.controller.clear(); assert.equal(f.leftView.shopBtn.visible, true);
  f.leftView.shopBtn.visible = false; f.controller.refresh(f.scene);
  const old = f.leftView.shopBtn; f.leftView.shopBtn = { visible: false };
  f.controller.refresh(f.scene); assert.equal(old.visible, false); assert.equal(f.leftView.shopBtn.visible, true);
  f.controller.refresh({ ...f.scene, SceneName: 'RogueLikeGameScene' }); assert.equal(f.leftView.shopBtn.visible, false);
  f.controller.refresh(f.scene); assert.equal(f.leftView.shopBtn.visible, true);
  f.scope.dispose(); assert.equal(f.leftView.shopBtn.visible, false);
});
