# 插件 API v1

核心 `0.6.3` 起提供只读 `ctx.core = {version, distribution}`，其中 distribution 为 `full/lite`。需要核心发行版本信息的插件使用该公共接口，不访问核心私有全局；使用时声明最低核心 0.6.3。该信息用于客户端行为和报告，不是远程身份认证。

核心 `0.6.35` 起另提供只读 `ctx.core.platform`，取值为 `browser` 或 `microclient`。微端提供 full／lite；两个平台沿用同一插件包和生命周期。使用该字段时声明最低核心 0.6.35，或为旧核心缺失字段提供明确回退。微端发行与安装规则见 [微端说明](microclient.md)。

## 自定义牌局背景（核心 0.5.91）

`ctx.backgrounds.register()` 注册当前插件为背景提供方，返回可重复调用的释放函数，核心也随插件停用自动释放。每个插件只注册一次；前置插件由清单声明，当前自定义背景插件要求先安装并启用皮肤收集（`skins`）。

`ctx.backgrounds.select({name, url})` 选择并持久化背景；`select(null)` 恢复游戏背景。须先注册；名称 1–160 字符，URL 为 HTTP(S) 或 `res/` 游戏资源路径，最多 4096 字符，不含 URL 凭据。图片由原生加载器预加载，失败或超时通过状态反馈；重新选择可重试。停用提供方时恢复原生，保留选择。

核心 **0.5.130** 起可传入 `animated`（默认 `true`）及 `dynamic: {kind, url, width, height, modern?, parts?}`。`kind` 为 `bone/spine/video`，URL 与静态图采用相同校验；视频为完整文件地址，骨骼与 Spine 为原生资源目录。`width/height` 是原生皮肤预览的动画设计尺寸（不是原画纹理尺寸），均为大于 0、不超过 16384 的有限数。普通 Spine 使用 `beijing/xingxiang.json` 的 `play`；`modern:true` 使用 `beijing/daiji/qianjing.json`，人物与前景循环 `DaiJi`；骨骼使用 `beijing.sk` 及 `parts` 指定的角色名。`parts` 最多 16 个不重复的 1–80 字符 ASCII 字母、数字、下划线或短横线名称，不含后缀、路径或 `beijing`。`dynamic:null` 表示已确认没有动态；省略表示未识别（包括旧背景）。使用扩展字段的插件须声明最低核心 0.5.130。

核心在自有、不可交互的 Laya 背景子层播放动画与静音循环视频，静态原画保留作加载占位和错误回退。动态超时或失败保留完整错误，重新选择或切换动静可重试。天气/技能背景期间隐藏并暂停，恢复普通背景后继续；停用、重载、切场景清理动画、视频纹理、计时器与节点。

`ctx.backgrounds.current` 返回 `{owner, name, url, animated, dynamic?}` 或 `null`（旧记录可能没有扩展字段）；`ctx.backgrounds.status` 返回当前完整状态或错误；`subscribe(fn)` 订阅选择及状态变化，返回释放函数且随插件清理。面板挂载时读取当前状态，再订阅，面板销毁时释放。

核心只接管普通背景，保留天气/技能入口及特殊背景子层。插件不得另行锁定全局背景方法或覆盖技能控件。实现边界与验证见 [自定义背景](backgrounds.md)。

核心与插件分开构建，发布包中的内置卡牌插件和本地市场包使用同一接口。所有开发者先阅读 [插件开发规范](plugin-development.md)，它是清单、界面、排序和生命周期约定的唯一规范入口；本文作为 API 参考。当前完整契约要求核心 `0.5.0`，可复制的本地模板见 [examples/plugin-template/index.js](../examples/plugin-template/index.js)。

```js
export const manifest = {
  id: 'example.api-demo', name: '接口示例', version: '0.1.0',
  apiVersion: 1, contractVersion: 1, minCoreVersion: '0.5.0',
  description: '展示一个跟随主题的只读信息面板。',
  icon: 'info', priority: 32768, categories: ['info'],
};

export default {
  manifest,
  activate(ctx) {
    ctx.ui.registerPanel({
      id: 'main', category: 'info', priority: 32768,
      render(container) {
        const text = ctx.document.createElement('p');
        text.textContent = '插件已启用，界面配色跟随工具箱主题。';
        text.style.color = 'var(--sgs-text)';
        container.append(text);
        return ctx.scope.add(() => text.remove());
      },
    });
  },
};
```

## 清单与面板契约（核心 0.5.0）

新源码必须声明 `contractVersion: 1`，并填写完整 `id/name/version/apiVersion/minCoreVersion/description/icon/priority/categories`。名称限 1–48 字符，简介限 1–160 字符，均为非空单行；`priority` 必须为 `0`–`65535` 整数，`categories` 不重复，后台插件可用 `[]`。清单与字段细则见 [开发规范](plugin-development.md#1-清单身份与兼容性)。构建严格校验新源码；兼容未声明契约的旧包时，缺失图标使用 `package`、缺失排序值使用 `32768`，不改写旧包及其哈希。

`ui.registerPanel({id, category?, priority?, title?, gameView?, render})` 的 ID 在插件内唯一且稳定；分类必须在 manifest 中声明。单分类可省略 `category`，多分类必须显式选择，无分类不能注册面板。面板 ID 使用与插件 ID 相同的 1–64 字符规则；可选 `title` 是 1–80 字符的非空单行文字，不替代核心插件组标题。`render` 必须是函数，开发者须返回本次挂载的清理函数。

`manifest.priority` 决定同分类插件组及管理／市场插件列表顺序；较小值靠前，同值按插件 ID 的 ASCII 顺序。`panel.priority` 只控制组内面板，省略为 `32768`，同值按 panel ID 排序。`manage` 插件区显示于核心管理内容之后。排序没有保留数值区间，也不决定插件执行次序；市场同插件多版本最后按版本字符串稳定排列，此顺序不代表新版推荐。

`ctx.ui.icon(nameOrSpec)` 返回统一的 24×24 单色 SVG 节点，适用于插件内部按钮。参数与 `manifest.icon` 相同：公共图标名称或 `{paths: ['M...']}`；路径最多 8 条，每条最多 1024 字符，不接受任意 SVG、图片 URL 或额外颜色／viewBox 字段。完整名称及图标要求见 [图标规范](plugin-development.md#4-图标)。

## 状态与上下文

`initialState`、`reduce` 只能执行纯状态计算。事件结构为 `{seq,sessionId,type,payload,at}`，原生消息名保留在 `type`；核心补充 `toolbox:snapshot`、`toolbox:gap`。不要依赖 `Uc1cryZVg`、`VIiR0YfvE4s` 或旧脚本的 DOM。

核心 `0.5.69` 的座位快照将 `seats[].seatId`（协议身份）与 `seats[].position`（原生座位模型 FixedViewId 的一基号位，未知为 null）分开；`viewId` 仅保留布局信息，不能当作协议 ID 或实际号位。`emptySeatIds` 只列出客户端明确 `IsFull === false` 的空席 ID，不根据 UI 数组顺序、可见性或房间人数推测。部分座位快照不表示完整名单，缺少某个 ID 不构成清除依据。记牌诊断额外保留最近一次去除昵称、账号及手牌身份的 `seatSnapshot`，随 session 清除。

从核心 0.1.4 起，原生事件只保留明确支持的卡牌字段，包装字段被规范化为平坦数据；不会复制整份原生协议或登录对象。分批异步消费，`reduce` 和订阅者不在游戏的原生分发调用栈执行。突发超限通过 `toolbox:gap` 标记记录缺口，插件必须撤销无法保持的确定性。增加协议需在 `src/core/protocol.js` 声明最小字段和数组上限，禁止遍历任意原生 getter。

`activate` 可以返回清理函数，也可以返回 `{dispose()}`。上下文提供：

- `window/document`：当前游戏页面。
- `game`：当前场景、座位、卡牌元数据、快照和场景变更订阅；无法解析时返回空值。
- 核心 `0.2.0` 增加 `game.getSelf()`，只从现有用户 UI 恢复当前账号数据类并读取它的静态 `self`，不创建窗口。未就绪或退出账号时返回空值。
- `game.getConfigData(name)` 同步读取已取得的公共配置；`game.loadConfigData(name)` 按需异步读取官方配置包中的已声明表。当前允许 `gn_zonghe`、`cha_gs_dbs_fs_skininfo`、`ff_jubaopen`、`ff_dbs_pay_gift`、`sys_gs_dbs_fs_goodsbaseinfo`、`cha_dbs_general_series`、`ff_task_daily`、`mod_new_ttrank_config`（可带 `.sgs`）。优先已有数据；缺失时读取官服 `Config_w.sgs`，使用游戏已初始化的解码器，按表解压及缓存。安装插件本身不触发下载，配置请求不发送账号凭据，不上传数据。
- `getState/subscribe`：读取最新状态及订阅改变。停用后不再更新 UI，但已安装插件继续处理本局事件，重新开启不丢记录。
- `settings/storage`：插件独立命名空间，`get(key, fallback)`、`set(key, value)`。
- `ui.registerPanel`：按上面的清单与面板契约向 game/automation/tools/manage/info 分类注册面板，返回注销函数并随插件 scope 清理。`render` 返回面板级清理函数。
- `ui.icon`：通过公共图标名称或路径对象创建图标，不必导入另一个插件或维护自己的 SVG 注册表。
- 牌局面板可声明 `gameView: 'battle' | 'shanhe'`。核心在 `RogueLikeBigMapScene`／`RogueSmallMapScene` 选取山河视图，其余场景选取战斗视图；没有山河面板时回退战斗视图。未声明该字段的旧面板仍可显示。切换仅重绘当前牌局分类，不抢占工具／管理页，不停用插件，不重置卡牌 journal；两视图分别保存滚动位置。
- 山河图额外使用公共配置表 `hd_roguelike`、`cha_spell`、`sys_playcard`、`character`，按需加载。自己的山河轮次状态由 `shanhetu` 读取原生管理器的限定字段，独立于单场卡牌 session；不得把整个山河原生消息加入卡牌 journal。
- 核心 0.2.27 起，HUD 按插件 manifest 的 ID/name 自动整合为标题与折叠栏，同分类的多个面板归为一组；0.5.0 起由 manifest.icon 和 manifest.priority 统一决定图标与排序。折叠只隐藏内容，不调用面板清理、不停止插件；状态按插件保存并跨分类共享。插件不得重复实现同名外层折叠。
- 核心 `0.4.0` 增加 `ui.nativeTheme`：原生 Laya 界面通过 `bind(node, properties)` 绑定文本等颜色属性，通过 `watch(fn, {target})` 立即绘制并订阅主题；`palette` 提供实体色，`surface`、`chevron` 提供公共表面和箭头。返回的释放函数随插件 scope 清理，目标销毁也会释放。`surface` 本身只绘制一次，需放在 `watch` 或自己的渲染函数内；面板关闭但未销毁时应手动释放。用法、旧核心兼容和资源边界见[原生主题接口](native-themes.md)。
- `scope`：`listen/interval/timeout/patch/add` 与 `signal`。所有监听器、计时器、DOM 和方法包装必须登记，异步回调检查 `signal.aborted`。
- `themes.register({id,name,description?,tokens})`：ID 必须以插件 ID 加点号开头。`themes.override(tokens,priority)` 添加可撤销覆盖层。
- 核心 `0.3.0` 增加 `themes.list()`、`themes.select(id)`、`themes.subscribe(fn)` 与 `themes.current`：选择自动保存，仅接受已注册主题；订阅在注册、选择、覆盖和撤销时接收当前 `{id,tokens}`，返回释放函数并随插件 scope 清理。订阅不会立即调用，首次渲染读取 `current`。停用所选主题时暂回玄金并保留原选择；重新启用后恢复，期间用户新选择优先。
- `notify(text)`：短提示。
- 核心 `0.5.13` 增加 `reportError(errorOrText)`：将插件自身可恢复的查询/存储异常同步到管理卡片与管理入口提醒；完整文本可以展开查看。传入空字符串或 `null` 清除当前提醒。停用后的调用无效；恢复成功后由插件明确清除，不应把正常等待状态报告为错误。
- 百胜战功使用 `0.5.13` 起允许的公共配置 `gn_gs_ahievement`；战功和出框账号数据由插件直接订阅现有 ServerProxy 的限定消息，逐字段投影并异步消费，不写入卡牌 journal，也不复制完整账号模型。
- 自动秒杀独立读取现有 `NewSecKillManager` 的活动/商品VO及物品名称配置，只订阅秒杀信息/库存与 `DbsCBuyShopogoodsRep` 的限定事件；只投影购买结果与基础物品ID，异步处理，不写入卡牌 journal。接口来源、扣款与未知结果边界见[自动秒杀说明](seckill.md)。

核心 `0.5.14` 起，主题工坊是「管理 → 设置」中的自带功能，自动展示 `themes.register` 注册的所有主题，并随注册／撤销实时更新。`description` 是可选的一行配色说明。纯主题包声明 `categories: []`、不注册面板；只调用核心主题接口即可接入，不依赖 `themes` 或其他加载器插件。示例见[主题开发说明](themes.md#开发者接入)。

核心 `0.5.15` 新增 `tokens.scheme: 'light' | 'dark'`（默认 `dark`），用于浅色表单和原生表面阴影。浅色主题包应要求核心 `0.5.15`。颜色 token 仍需是可用的颜色，不能用 `bg` 承载渐变、人物图或动画；非纯色装饰方案见[主题评估](themes.md#非纯色主题评估方案尚未实现)，该装饰接口尚未实现。

主题 tokens：`bg/surface/raised/text/muted/accent/border/danger/radius/font/motion/scheme`，对应 CSS 变量前缀 `--sgs-`。支持任意数量主题；覆盖层按 priority、插件 ID 排序。主题 API 仅接收声明式值，插件自有样式在资源作用域中清理。

本地包为 `{format:'sgs-toolbox-plugin-v1',manifest,code,sha256}`；code 是返回插件模块的 JavaScript 函数体。SHA-256 覆盖按键排序的 manifest JSON、换行及 code 的精确 UTF-8 字节。包必须自包含。摘要用于检查损坏，不证明发布者身份；同页插件也不构成隔离沙箱。

核心 0.6.33 起，`manifest.releaseNotes` 表示该版本最近一次更新内容：可选，存在时须为 1–2000 字符非空纯文本，可换行，不解析 HTML／Markdown。构建同步到市场条目的同名字段；条目提供说明时必须与下载包一致。更新提示展开显示目标版本说明；市场目录与已安装卡片提供可键盘展开的“最近更新 · 版本”，旧包显示“作者未提供此版本的更新内容”。仅展示单一版本，不将跨版本差异伪装为完整更新历史。字段参与包摘要，不得为补说明覆写同版本包；变更需递增插件版本。更新内容属于作者声明，不替代风险提示或安全审核。

安装时验证、编译、回放，再激活并持久化。失败清理候选并恢复旧版本。核心版本与插件版本独立；核心更新需刷新游戏，插件更新不要求刷新。

## 插件独立性

当前插件按完整契约声明最低核心 `0.5.0`；使用更新 API 时同步提高 `minCoreVersion`。不得导入其他插件目录、调用其他插件状态或依赖旧小抄随机全局。构建时分别打包并检查输入，跨插件导入及外部模块导入会构建失败；输入清单保存在 `release/plugin-dependencies.json`。公共控件可各自随包构建；公共配置读取属于核心能力，卸载任一插件不会移除另一个插件的数据接口。

核心 `0.5.38` 增加账本所需的公共配置表 `ff_qifu_new`、`ff_tiangong`，通过既有配置接口按需读取。账本直接投影 ServerProxy 的背包、元宝和祈愿台最小字段，不进入卡牌 journal；详细存储和关联边界见[账本说明](ledger.md)。

核心 `0.5.62` 增加可选清单字段 `dependencies: ['baisheng']`，表示必须安装并启用的前置插件 ID。声明此字段的非空依赖需要 `minCoreVersion: '0.5.62'` 或更高版本。核心按依赖顺序激活，拒绝缺失、停用、失败及循环依赖。核心 `0.5.74` 起更新/导入替换前置插件会自动暂停已启用的直接与间接依赖，并在成功或失败恢复旧版后按顺序重启；原停用选择和本局状态保留，恢复失败单独显示详情。停用、卸载、手动重载与回退前置仍需先停用依赖插件。该字段不提供跨插件状态或代码访问，详见开发规范。

## 自动恢复（核心 0.5.65）

每次启用或手动重载后，插件最多获得一次自动重启机会。启动异常、消息处理异常及 reportError 的非空错误会先尝试清理资源并重新激活，恢复成功不展示错误；重启失败或随后再次出错时保留完整错误详情。前置缺失或停用不触发自动启用。停用、卸载及核心关闭会取消待执行恢复。此机制只处理核心捕获或插件主动上报的异常。

## 核心 0.5.70：收起栏摘要

`ctx.ui.registerCompactSummary()` 返回 `update(items)`，用于更新本插件在收起 HUD 下方的只读摘要。每项为 `{label, value, detail?}`；文本安全渲染，detail 作为悬停全文，长名称省略。传入空数组清空；停用、卸载或重载由资源作用域自动清空，旧 updater 不再生效。界面展开时隐藏摘要；不读取其他插件状态。插件使用此接口须声明最低核心 0.5.70。

核心 `0.5.82` 扩充公共观察消息用于山河图插件的跨模式战法计数：`PubGsCUseCard.SpellID`、`MsgNtfUseCardType` 的 `CastSeatID/SpellID/useType`，以及 `decodeRogueLikeItemEffectNtf` 的 `ItemID/ItemParams/error_id`。不复制整包或账号信息；计数仍在插件纯 reducer 中处理。详见 [战法计数](shanhetu-tactic-counts.md)。

## 核心 0.5.90：卡面与卡背

核心 **0.5.138**：`atlas.pixelRatio` 可选，须为整数 `1`、`2` 或 `3`，省略为 `1`。完整帧的物理宽高和 `sourceSize` 必须恰好为 `135×pixelRatio`、`190×pixelRatio`，偏移为零且不旋转、不裁切；其他尺寸不作为完整卡面。核心原尺寸裁出纹理并上传 GPU，`texture.width/height/sourceWidth/sourceHeight` 继续使用当前原生控件的逻辑宽高。单页仍限 4096px / 8MiB，最多四页，资源 URL 与 SHA-256 校验保持原契约。使用倍率字段的插件须声明最低核心 0.5.138；现有喵喵杯、猪猪侠不声明倍率，仍保留 135×190 像素。

核心 **0.5.117** 新增仅卡面的逐牌图集形式：`ctx.cardStyles.register({id,name,atlas:{index:{url,sha256},pages:[{url,sha256}],source,preview:'Sha'}})`，与色板、native 互斥。HTTPS 资源声明和来源由插件提供，核心负责选择后加载、哈希校验、精确牌名匹配、原生回退及生命周期；插件无需包装游戏方法。此类样式只出现在卡面选项中。完整格式、尺寸边界、特殊卡牌回退和证据见 [一将成名卡面包](yjcm-cards.md)。新插件使用此形式须声明最低核心 0.5.117。

核心 0.5.95 新增原生资源形式 `ctx.cardStyles.register({id,name,native:{face:'cardFace_0',back:'cardBack_0'}})`，与色板形式互斥。核心借用已加载官方纹理；缺任一面时等待并保留游戏外观，不修改或销毁共享纹理。独立官方卡牌包提供经典与大将军，完整对应编号和验证边界见 [卡面与卡背](card-styles.md)。

`ctx.cardStyles.register({id,name,face,back})` 注册成套卡牌外观，全部前置由核心提供，插件只提供色板。另有 `list/select/subscribe/current`，资源随插件作用域释放。最低核心须为 0.5.90，纯套装声明 `categories: []`，入口由核心放在主题工坊下方。完整数据约束、原生范围、停用恢复和验证见 [卡面与卡背](card-styles.md)。

### 背景插件安装状态（核心 0.5.101）

`ctx.backgrounds.isInstalled()` 返回自定义背景插件是否已安装，停用仍返回 true，卸载返回 false；不暴露其他插件内部状态。皮肤列表据此控制可选的背景筛选入口。

核心 0.5.119 为 atlas 增加可选 `previewImage`：最大 160 KiB 的 `data:image/png;base64,...` 内嵌图片，在未选择或下载整套卡图前展示。该预览随独立插件打包，不触发额外网络请求。

核心 0.5.125：atlas 可选 replaceCards 为去重的原生 ResName 字符串数组（最多2048项），声明只替换这些差异卡图。省略保持原有精确匹配所有卡图的语义，空数组表示不替换任何卡图；不匹配时完整保留原生图层。开发时可比较默认图集像素后生成清单，运行时不需要加载默认图集。

核心 0.5.128：逐牌 atlas 的 index/pages 资源除 HTTPS 外，允许 HTTP 的本机 IPv4 回环地址 127.0.0.1（可带端口）。仍须声明并校验 SHA-256，不接受普通远程 HTTP、凭据或 URL 片段。本地卡面需保持素材服务运行；浏览器可能要求授予本地网络访问权限。大肥鱼本地包使用 127.0.0.1:17321，详见 docs/dafeiyu-cards.md。

核心0.5.142增加 `gn_dbs_coupon_cfg` 公共配置表，用于账本背包抵价券的 `GRmb` 门槛／金额查询。仍按需读取官方配置包，不构造原生单例，不包含账号或购买数据。

核心 0.6.8：完整卡图 atlas 可选 backImage，为不超过 1 MiB 的内嵌 PNG data URL；原生上传要求解码尺寸为 405×570。提供后可独立选择卡背，不触发卡面图集下载；仅选用时解码，切换或释放时撤销自有纹理与回调。省略仍为仅卡面套装。

核心 0.6.9：cardStyles.register 可选 backName，指定卡背显示名称（非空单行、最多48字符），卡面仍使用 name；省略保留原套装名称。使用此字段的插件须提高最低核心版本。

## 核心 0.6.37：共享插件 UI

使用以下接口的插件声明 `minCoreVersion: '0.6.37'`：

- `ctx.ui.styleSwitch(input)`：将原生 checkbox 重绘为统一滑轨，返回同一节点；业务值与事件仍由插件管理。
- `ctx.ui.helpTip(text, label?)`：创建支持悬停、焦点、Escape 的说明气泡，使用浏览器 Popover API；只承载帮助文字，错误和状态应直接可见。
- `ctx.ui.panel(container)`：创建通用信息面板，返回 `root/el/listen/button/segments/input/dispose`。`el(tag, className?, text?)` 创建文本安全节点；`button(text, icon?, onClick)`、`segments([[value,label]], selected, onChange)`、`input(label, type?)` 提供通用操作。面板 render 清理时调用 `dispose()`。
- `ctx.ui.mountStyles(shadowRoot)`：为插件自己的 Shadow DOM 挂载共享控件样式，返回可重复调用的释放函数；插件停用时自动释放。普通注册面板由核心自动处理。

公共控件和信息面板样式按 Document／ShadowRoot 共享并计数释放；插件只保留业务专属样式。图标继续调用 `ctx.ui.icon(spec)`。无需把 `controls.js`、`info-ui.js` 导入独立包；旧发布包仍可保留原有自包含实现。
