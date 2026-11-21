# 山河图奖励图标

2026-11-14获取，来自官方游戏静态资源。仅提取原图集中的完整帧，未重新绘制或改色。

- 兵书： https://web.sanguosha.com/220/h5_2/res/assets/roguelike/roguelikesmallmap.atlas 及同目录roguelikesmallmap.png，rogue_event_zhanfa0.png帧，x514/y1214/w86/h76，scale2。提取的tactic-book.png SHA-256：85f43116aa25ed3318eb4962184976374902c161d41a7bff5c9cc438676e909c。
- 铜钱： https://web.sanguosha.com/220/h5_2/res/runtime/pc/pattern/roguelike/itempic/reward_money.png 原PNG字节，SHA-256：e779a6e3e0f4685727e5b640201498c7df27415428576276eead79652b89284c。
- 随包副本使用 WebP（质量 0.90），保留原始尺寸和透明通道。本文摘录的 SHA-256 对应原始 PNG 或裁取后的 PNG。无缓存时使用内嵌图片，无需先打开游戏奖励窗口。优先复用已有原生纹理，仅释放插件创建的纹理。Laya 上传启用预乘透明度。
- 兵书仅表示战法类别，随机、自选、N选1由旁边文字说明，不把图标后缀解释成稀有度。手牌保留原生扇形卡牌图标。
- Choose_ZhanFa.png为旧版保留的原始素材，本版不再使用；其旧SHA-256为d143ad9e5e0345853de5ee2031ac6c4318bbbfbcdf3afbc750e5357f0c11161b。

## 0.1.17 装备类别

同一官方roguelikesmallmap.atlas/png中rogue_event_equip0.png完整帧，x232/y1100/w86/h76、scale2。提取equipment.png并内嵌equipment-icon.js，未改色或重绘。SHA-256：495ea7b09a1a29b84dd0e3670e60d28d8cfd197438198dd4a65b5743cd0fbea8。使用无角标胸甲表示装备类别，文字承担随机、自选和N选1语义。

## 统一信息图标（2026-11-14）

`info-icon-data.js` 只嵌入以下完整小帧/独立图片，不嵌入整张图集。公开官方资源请求不带账号参数或 cookie；Chrome Canvas 按原始像素裁取完整帧，未缩放、改色或重绘。图标名称只表示类别，品质、随机、自选、N选1、换币数量仍由正文表达。

- 体力勾玉 `blood_green_b.png`：官方 `https://web.sanguosha.com/220/h5_2/res/assets/game/seat.atlas` 和同目录 `seat.png`，帧 x3408/y726/w46/h52、scale2。atlas SHA-256 `9df9a7f7299346ef9b898a645e7d4b7540828dfcfeac2e54140ed7825572c337`；原图 SHA-256 `2ba7a9b23a28bf6265b2dd07290be79cb8727968e9c29f8623f6eaa64c0b7374`；提取 PNG SHA-256 `511b718fac7d727381e9371a9c7089a194a8f62c01cc371566fc3714598b2cf0`。
- 护甲 `seat_shield_bg.png`：同一 seat 图集，帧 x2764/y846/w58/h66、scale2。提取 PNG SHA-256 `852d5a03394fd7294d0e4796305b06ec745e3a7805ccaed3750b1b3c4d190b02`。这是数值护甲标记；实际防具名称使用现有胸甲类别图标。
- 手牌 `rogue_event_card0.png`：上述 roguelikesmallmap 图集，帧 x672/y986/w86/h76、scale2。atlas SHA-256 `c9ed58d9bbbd8dda78d2d750bb5d4478f92f191b840f5fbab573d11b86ee8478`；原图 SHA-256 `a4e4627a1fd18bc71b8b41c7270a21d51f0e229fb8a0e222aaedcd1fbea52072`；提取 PNG SHA-256 `2bf6f61e3b4ee8b4be5c7ffc26f14103c2fb02c95bddee08d6bcef109ec28f65`。
- 技能 `reward_jineng.png`：官方 `https://web.sanguosha.com/220/h5_2/res/runtime/pc/pattern/roguelike/itempic/reward_jineng.png` 独立 100×100 PNG 原字节，SHA-256 `382fc6a43dd0633120273f8a098bb5c59ab95bbc5d5f62c2eefb71b6d9cda992`。使用可辨认的折叠技能牌，未使用只有空金框的 smallmap skill0 帧。
- 摸牌、出杀次数和注意使用 `info-icons.js` 中的 24×24 SVG，以入牌箭头、刀刃和警示三角表达。铜钱、兵书和装备复用上列内嵌图像。

本地提取记录与原始公开资源存于 `test-results/shanhetu-icon-research/`。这些是静态素材证据，不代表当前账号实局验收。
