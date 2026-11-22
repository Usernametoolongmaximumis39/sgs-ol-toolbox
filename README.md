# 三国杀 OL 工具箱

项目主页：[tools.3gs.xyz](https://tools.3gs.xyz/)。工具箱提供独立插件、统一主题、卡牌信息及常用工具；插件可分别安装、停用、更新、回退和卸载，配置保存在当前浏览器。

## 安装与更新

使用篡改猴安装一个版本，安装后刷新游戏。请在扩展详情中开启“允许用户脚本”并允许访问游戏网站；缺少该开关时按[篡改猴权限说明](https://www.tampermonkey.net/faq.php?locale=zh&q=Q209)操作。

| 版本 | 内容 | 安装 |
| --- | --- | --- |
| Full | 完整核心及随附官方插件，具体清单以实际发行包为准 | [安装](https://raw.githubusercontent.com/Usernametoolongmaximumis39/sgs-ol-toolbox/main/full/toolbox.user.js) · [备用](https://tools.3gs.xyz/sgs-toolbox/full/toolbox.user.js) |
| Lite | 完整核心，不随附插件；继续使用已安装插件和用户设置 | [安装](https://raw.githubusercontent.com/Usernametoolongmaximumis39/sgs-ol-toolbox/main/lite/toolbox.user.js) · [备用](https://tools.3gs.xyz/sgs-toolbox/lite/toolbox.user.js) |

两版共用脚本身份，切换时替换原脚本。扩展自动更新保持当前发行版；工具箱内核心更新使用 Lite。插件在市场单独更新，不因核心更新重新启用已停用插件。详见[发行版说明](docs/distributions.md)。

自 0.6.223 起，浏览器和微端 Full 使用同一份随附名单，含 22 个官方插件。山河图拓展（Beta）可在市场按需安装。新增官方插件不会自动加入随附名单。微端安装请参阅[微端说明](docs/microclient.md)。

## 插件与数据

游戏内“管理 → 插件市场”提供安装和更新。可一键更新已安装的插件，也可关闭默认开启的启动时自动更新。素材按需加载；网络不可用时，已安装插件仍可按其功能运行。未绑定云同步时，数据保存在当前浏览器站点或微端，清除本地数据会影响配置和插件记录。

需要跨设备恢复时，可在“管理 → 云同步”绑定自己信任的私有服务器，或连接支持加密存储的公共服务器。绑定后，受支持的设置、好友资料、账本和已核实战绩会与所绑定的服务器同步。插件安装状态和本机素材仍由每台设备保存。恢复凭据可用于访问或恢复记录，请妥善保管。

国都护及以上且尚未绑定云同步的账号可报名灰测。备份会在本地加密后上传至测试服务器，测试结束后服务器会停用。

自动操作可能影响游戏账号、道具或货币，请阅读插件说明。当前插件运行环境没有真正的安全沙箱；机器初审、人工审核及官方身份均不保证绝对安全。社区分级市场的客户端入口尚待接入，不能把现有插件误认为已经通过新增审核流程。

## 参与开发

从[贡献指南](CONTRIBUTING.md)、[插件开发规范](docs/plugin-development.md)、[插件 API](docs/plugin-api.md)和[插件模板](examples/plugin-template/index.js)开始。投稿流程与身份、风险规则见[社区插件政策](docs/community-plugin-policy.md)及[投稿说明](docs/review-server.md)。

源码以 MIT 发布，第三方代码与素材保留各自许可，见 LICENSE 与 THIRD_PARTY_NOTICES.md。使用 Node.js 22，按当前源码提供的脚本执行安装依赖、测试与构建；Full／Lite 输出目录为 dist/full/、dist/lite/。文档中较新接口须满足其标注的最低核心版本。
