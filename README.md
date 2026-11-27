# 三国杀 OL 工具箱

工具箱为三国杀 OL 提供牌局信息、自动领奖、本地换肤、战绩和账本等功能。插件可以独立安装、停用、更新、回退和卸载。下载入口及游戏链接见[项目主页](https://tools.3gs.xyz/)。

## 安装与更新

浏览器使用篡改猴安装一个版本后刷新游戏。请允许扩展访问游戏网站，并在扩展详情打开「允许用户脚本」。找不到开关时可查看[篡改猴权限说明](https://www.tampermonkey.net/faq.php?locale=zh&q=Q209)。

| 版本 | 内容 | 浏览器安装 |
| --- | --- | --- |
| Full | 完整核心，随附下表中的全部 19 个官方插件 | [安装 Full](https://raw.githubusercontent.com/Usernametoolongmaximumis39/sgs-ol-toolbox/main/full/toolbox.user.js) |
| Lite | 完整核心，可从市场按需安装插件 | [安装 Lite](https://raw.githubusercontent.com/Usernametoolongmaximumis39/sgs-ol-toolbox/main/lite/toolbox.user.js) |

两版相互替换，保留已安装插件和配置。首次安装时，Full 随附插件通常已启用。插件里的自动操作按各自开关生效。扩展自动更新保持当前发行版，工具箱里的浏览器核心更新使用 Lite。插件可在「管理 → 插件市场」单独更新。Windows 微端使用独立安装包。详见[发行版说明](docs/distributions.md)和[微端安装与恢复](docs/microclient.md)。

## 插件功能导航

Lite 可从市场按需安装下表插件。Full 的浏览器与微端随附名单一致。

| 插件 | 能做什么 | 安装方式 | 使用说明 |
| --- | --- | --- | --- |
| 好友与聊天 | 从公屏进房、关注好友变化、设置本地气泡和表情 | Full 随附 | [好友与聊天](docs/social.md) |
| 资料与将池 | 查看玩家和将灯资料，保存、查找或载入禁将方案 | Full 随附 | [资料与将池](docs/player-info.md) |
| 卡面卡背拓展 | 分别挑选牌的正面和背面 | Full 随附 | [卡面与卡背](docs/card-styles.md) |
| 自定义背景 | 用皮肤、游戏壁纸或本地图片换背景 | Full 随附 | [自定义背景](docs/backgrounds.md) |
| 山河图 | 查地图、商店、战法、流派和结局进度 | Full 随附 | [山河图](docs/shanhetu-placement-v2.md) |
| 卡牌 | 查牌堆和已知明牌，排序手牌并显示读秒 | Full 随附 | [卡牌](src/plugins/cards/覆盖说明.md) |
| 出牌辅助 | 为支持的技能提供长按辅助、局内提示和自动确定 | Full 随附 | [出牌辅助](docs/play-assist.md) |
| 日常领奖 | 领取符合条件的奖励，按需处理商店兑换和兑换码 | Full 随附 | [日常领奖](docs/daily-rewards.md) |
| 自动秒杀 | 按所选商品和关键词自动排队购买 | Full 随附 | [自动秒杀](docs/seckill.md) |
| 盖主速刷 | 双账号盖主速刷，或按所选模式挂机 | Full 随附 | [盖主速刷](docs/gaizhu.md) |
| 特效屏蔽 | 按需隐藏对局动画、广告、红点等提示 | Full 随附 | [特效屏蔽](docs/effects.md) |
| 皮肤管理 | 找皮肤、下载静态原画和本地试换外观 | Full 随附 | [皮肤管理](docs/skins.md) |
| 自助观星 | 浏览和搜索第三方观星报告 | Full 随附 | [自助观星](docs/stargazing.md) |
| 百胜战功 | 查询、筛选和导出武将战功进度 | Full 随附 | [百胜战功](docs/info-plugins.md#百胜战功) |
| 出框与胜率统计 | 按模式查看候选武将、选取、胜率和战绩 | Full 随附 | [出框与胜率统计](docs/info-plugins.md#出框与胜率统计) |
| 账本 | 查收支、背包物品变化和心愿进度 | Full 随附 | [账本](docs/ledger.md) |
| 旧周月卡 | 查询旧卡、设置到期提醒或打开游戏直购 | Full 随附 | [旧周月卡](docs/recharge.md) |
| 三国斗地主 | 从经典版进入斗地主大厅、牌桌和录像 | Full 随附 | [三国斗地主](docs/poker-lobby.md) |
| 流彩主题包 | 为主题工坊添加八套渐变暗纹配色 | Full 随附 | [主题工坊](docs/themes.md#流彩主题包) |

## 插件、云同步与风险

- 「管理 → 插件市场」可安装插件或一键更新已安装插件。「启动时自动更新插件」默认打开，可以关闭。需要联网的操作和素材加载会受网络影响。
- 数据通常保存在当前浏览器或微端。使用「管理 → 云同步」可绑定自己信任的私有服务器，或选择支持加密存储的公共服务器。绑定后，支持的设置、好友资料、账本和经核实的战绩会按各功能说明同步到所绑定的服务器。插件安装状态和本机素材由各设备保存。请保管恢复凭据。
- 国都护及以上且尚未绑定云同步的账号可报名灰测。备份在本地加密后上传至测试服务器，测试结束后该服务器将停用。
- 自动领奖、购买、兑换、点将等操作可能消耗元宝、欢乐豆、其他货币或道具，也可能影响账号。启用前请查看对应说明。
- 当前插件运行环境没有真正的安全沙箱。机器初审、人工审核和官方身份均无法保证绝对安全。社区分级市场的客户端入口尚待接入。详见[市场规则](docs/static-market.md)与[社区插件风险说明](docs/community-plugin-policy.md)。

## 参与开发

从[贡献指南](CONTRIBUTING.md)、[插件开发规范](docs/plugin-development.md)、[插件 API](docs/plugin-api.md)和[插件模板](examples/plugin-template/index.js)开始。投稿身份、审核流程及第三方处理同意见[投稿说明](docs/review-server.md)。

源码按 MIT 许可发布，第三方代码与素材适用各自的许可。详见 [LICENSE](LICENSE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
