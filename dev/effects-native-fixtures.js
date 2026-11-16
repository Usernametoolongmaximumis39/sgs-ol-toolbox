// Small, inert fixtures for client structures missed by the original demo.
// Visibility comparison follows fO.visible; dictionary namespaces follow SNt
// in the local official sgsGame_a.sgs (SHA-256 in docs/effects.md).
export class NativeDraw {
  constructor(paint = () => {}) {
    this._visible = true; this._alpha = 0.8; this.paint = paint;
    this.renderedVisible = true; this.renderedAlpha = 0.8; this.redraws = 0;
  }
  get visible() { return this._visible; }
  set visible(value) {
    if (this.visible !== value) { this._visible = value; this.invalidateUpdate(); }
  }
  get alpha() { return this._alpha; }
  set alpha(value) {
    if (this._alpha !== value) { this._alpha = value; this.invalidateUpdate(); }
  }
  invalidateUpdate() {
    this.renderedVisible = this._visible; this.renderedAlpha = this._alpha;
    this.redraws++; this.paint();
  }
}

export class NativeDictionary {
  constructor() { this._maps = {}; this._objKeys = []; this._objDatum = []; }
  add(key, value) {
    if (typeof key === 'object') { this._objKeys.push(key); this._objDatum.push(value); }
    else this._maps[key] = value;
  }
  get datum() { return Object.values(this._maps).concat(this._objDatum); }
}

export function nativeToolbar(charge, shop) {
  charge.width = shop.width = 100; charge.name = '0'; shop.name = '1';
  return {
    x: 400, width: 210, hideList: [],
    iconNameArr: [{ res: 'charge' }, { res: 'shop' }], btnList: [charge, shop],
    layout() {
      let width = 0;
      for (const button of this.btnList) {
        if (this.hideList) button.visible = !this.hideList.includes(Number(button.name));
        if (button.visible) { button.x = width; width += button.width + 5; }
      }
      this.width = width; return 'layout';
    },
    onUserLevelChanged() { for (const button of this.btnList) button.visible = true; this.layout(); },
  };
}
