// Inert native-shaped red-dot fixtures, checked against fJ/S0t/jZi in the
// official local client. They keep tree state separate from button rendering.
import { NativeDraw } from './effects-native-fixtures.js';

export class NativeRedNode {
  static RED_UPDATE = 'RED_UPDATE';
  constructor(id, state = 1) { this.id = id; this.state = state; this.enable = true; this.children = []; this.listeners = []; this.taskIds = [9001]; }
  event(name, value) { for (const fn of this.listeners) fn(value); return name === NativeRedNode.RED_UPDATE; }
}
export class NativeRedTree {
  constructor(root) { this.root = root; }
  get Root() { return this.root; }
  SetNodeState(node, value) { if (node.state !== value) { node.state = value; this.notifyNodeEvent(node); } }
  notifyNodeEvent(node) { return node && node.event(NativeRedNode.RED_UPDATE, node.state === 1 && node.enable); }
}
export class NativeRedButton extends NativeDraw {
  constructor(paint = () => {}) { super(paint); this.childs = []; this._children = []; this.latestNumber = 0; }
  get Childs() { return this.childs; }
  addDrawChild(node) { this.childs.push(node); return node; }
  ShowRedPoint() {
    if (!this.redPointTex) { this.redPointTex = new NativeDraw(this.paint); this.addDrawChild(this.redPointTex); }
    this.redPointTex.visible = true; return 'point';
  }
  RemoveRedPoint() { if (this.redPointTex) this.redPointTex.visible = false; }
  SetNumber(value) {
    this.latestNumber = value;
    if (!this.numDotNode) { this.numDotNode = new NativeDraw(this.paint); this.addDrawChild(this.numDotNode); }
    this.numDotNode.visible = value > 0; return value;
  }
}
export function nativeRedFixture(paint = () => {}) {
  const node = new NativeRedNode(1), tree = new NativeRedTree(node);
  const manager = { tree, GetNodeIsShowByPath() { return node.state === 1 && node.enable; } };
  const button = new NativeRedButton(paint);
  // Hall task binding: initial display reads the state, later notifications
  // call a previously bound function. Native custom draw lists are separate.
  const update = value => value ? button.ShowRedPoint() : button.RemoveRedPoint();
  node.listeners.push(update); update(manager.GetNodeIsShowByPath());
  const handler = { manager }, proxy = { _events: { EXCHANGE_RED_VIEW_FIRST_UPDATE: { caller: handler } } };
  const drawRoot = { Childs: [button], _children: [] };
  return { node, tree, manager, button, update, proxy, handler, drawRoot };
}
