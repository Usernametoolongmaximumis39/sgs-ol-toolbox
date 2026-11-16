# 原生主题接口

核心 `0.4.0` 提供 `ctx.ui.nativeTheme`，用于 Laya 原生文本、插件自有按钮、菜单和浮层。HTML 面板继续使用 `--sgs-*` CSS 变量；原生绘图使用这里已经解析成实体颜色的 palette。

核心 `0.5.15` 起支持浅色主题的 `tokens.scheme: 'light'`：面板底部采用较浅的阴影，避免深色文字落在过暗的渐变上。直接叠在游戏背景上的文字仍需要自己的底层或合适描边，不能只替换文字颜色；当前皮肤统计底层已适配。

公共实现在 `src/ui/native-theme.js`。插件通过核心接口复用实现，不需要导入另一个插件、轮询主题或维护自己的表面纹理缓存。

已有的原生文本节点可以直接绑定：

```js
const theme = ctx.ui.nativeTheme;
const offText = theme.bind(label, {
  color: 'text',
  strokeColor: 'shadow',
});

// 面板关闭但节点未销毁时主动释放；插件停用也会自动释放。
offText();
```

映射值可以是 palette 键，也可以是 `palette => value` 函数。绑定立即应用，之后随主题变化更新；动态函数只在这两个时机求值，业务状态变化仍由插件自己的渲染处理。

释放会恢复绑定前的属性值及原有属性结构。若其他代码后来改写了某个属性，则保留该属性的新值，不覆盖后继拥有者。目标已销毁时不会再写回属性；动态函数或 setter 在执行期间关闭作用域，也不会继续回写主题色。

下面的函数可放进插件，在原生容器已就绪后调用。示例只维护自己的选择状态，不修改游戏状态。

```js
function mountThemeButton(ctx, parent) {
  const L = ctx.window.Laya ?? ctx.window.laya;
  const theme = ctx.ui.nativeTheme;
  const root = new L.Sprite();
  root.size(180, 32);
  root.mouseEnabled = true;
  parent.addChild(root);

  const label = new L.Text();
  Object.assign(label, {
    width: 150, height: 32, fontSize: 12,
    align: 'center', valign: 'middle', mouseEnabled: false,
  });
  root.addChild(label);
  const arrow = new L.Sprite();
  arrow.mouseEnabled = false;
  root.addChild(arrow);

  const offText = theme.bind(label, { color: 'text' });
  let selected = false;
  const paint = () => {
    theme.surface(root, {
      width: 180, height: 32, kind: 'button', selected,
    });
    theme.chevron(arrow, 162, 14, selected);
    label.text = selected ? '使用中' : '选择';
  };
  const offTheme = theme.watch(paint, { target: root });
  root.on('click', root, () => { selected = !selected; paint(); });

  return ctx.scope.add(() => {
    offTheme();
    offText();
    root.destroy(true);
  });
}
```

`watch(fn, { target })` 立即调用 `fn(palette)`，并在主题选择、覆盖或撤销后再次调用。返回的释放函数可重复调用。插件 scope 关闭会自动释放；指定 Laya 目标调用 `destroy()` 时也会释放。仅隐藏或移除面板而没有销毁节点时，应调用释放函数，防止继续接收主题更新。

`surface(node, options)` 是一次绘制，不自行订阅主题。因此需要在 `watch` 的回调和控件状态改变后的渲染函数中调用。支持 `kind: 'panel' | 'button' | 'option' | 'tab' | 'segment'`，以及 `selected`、`hover`、`disabled`；宽高可省略以读取节点尺寸。`disabled` 仅控制外观，点击禁用和业务权限由插件处理。

`surface` 会清理目标自身的 graphics，应只用于插件拥有的绘图节点；子节点不会被清理。`chevron(node, x, y, open, color?)` 同样绘制到指定节点，默认使用当前强调色。自定义造型可读取 `theme.palette` 或使用 `watch` 传入的 palette，再调用 Laya Graphics。

| 类型 | 名称 | 用途 |
|---|---|---|
| 基色 | `bg`、`surface`、`raised` | 背景、表面、凸起层 |
| 基色 | `text`、`muted` | 正文、辅助文字 |
| 基色 | `accent`、`border`、`danger` | 强调、边线、错误或危险 |
| 派生色 | `borderSoft`、`highlight`、`shadow` | 柔和边线、细高光、阴影 |
| 派生色 | `selected`、`hover`、`accentSoft` | 选中表面、悬停表面、弱强调 |

palette 是只读对象，所有颜色均为不透明的 `#rrggbb`。支持直接解析 `#rgb`、`#rgba`、`#rrggbb`、`#rrggbbaa`；带透明度的色值先与背景合成。在浏览器中，其他可由 Canvas 解析的 CSS 颜色也会转换为实体色，无效值使用玄金的对应基色。CSS 变量和页面继承样式不作为原生绘图的依赖。

共享源码还导出 `resolveNativePalette(tokens, document)`、`DEFAULT_NATIVE_PALETTE` 和 `mixNativeColors(a, b, amount)`，供独立绘图辅助函数使用。通常直接读取 `ctx.ui.nativeTheme.palette` 即可。

表面使用本地生成的 SVG，按颜色、尺寸和交互状态复用纹理，无外部图片请求。缓存以 128 项为回收目标，优先淘汰无引用的冷纹理；正在绘制或解码的条目不驱逐，所以活跃组合很多时可以超过 128 项。目标销毁或插件停用后释放引用，后续回收不影响其他正在使用同纹理的节点。

异步解码完成时会核对作用域、目标存活状态与当前绘制键。旧主题的迟到纹理不会覆盖新主题；解码失败、加载器抛错或尚未就绪后，后续绘制可以重试。

独立插件需要兼容旧核心时，可以内联公共辅助模块：

```js
import { getNativeTheme } from '../../ui/native-theme.js';

const theme = getNativeTheme(ctx);
// 有核心接口时直接复用；否则创建当前插件作用域内的兼容实例。
```

兼容实例使用旧核心的 `themes.current` 和可用的 `themes.subscribe`。旧核心没有 `subscribe` 时，`watch` 与 `bind` 仅首次更新；主动重新绘制并读取 palette 能取得当时的主题值，但不能承诺自动即时跟随。完整行为建议使用核心 `0.4.0`。

接口只作用于显式传入的节点，不扫描游戏引擎、不替换整棵游戏节点的样式、不修改引擎原型，也不改变插件业务状态。关闭窗口后的手动释放与插件现有的节点销毁流程仍需接好。

皮肤收集 `0.4.0` 已适配原生导航、静态/动态筛选、弹出菜单、搜索、统计及插件自有标题；卡牌 `0.1.43` 的理牌和读秒、山河图 `0.1.1` 的原生地图标签也使用同一接口。主题切换保留筛选结果、滚动和菜单展开状态。卡面、品质徽标和新品红点继续保留其语义颜色。
