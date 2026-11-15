# 品质徽章美术资源（历史记录）

当前普通银白角标及提示词见 [ordinary-badge.md](ordinary-badge.md)。下面记录的是已停用的旧圆章。

0.3.2起改用原生品质角标和卷纹标题，下面的圆章不再用于界面或发布包；保留原图和提示词便于追溯。

制作日期：2026-11-14。使用 **内置 image_gen / imagegen** 生成一张无文字、透明背景的中性银白浮雕圆章。中文、品质色泽、布局与交互由原生界面绘制，不将模型生成的文字用于产品。

## 保存文件

- `quality-seal-source.png`：完整生成原图，保留透明通道。
- `quality-seal.webp`：320×320 的交付尺寸，保留图案和透明度。
- `quality-seal.js`：同一 WebP 的内嵌 data URI，随独立插件包发布，不依赖外部图片服务器。
- `../../../../tools/prepare-skin-assets.mjs`：交付尺寸转换脚本；运行 `node tools/prepare-skin-assets.mjs`。

运行时以颜色滤镜呈现银白、紫晶、鎏金、琥珀、绯红五种品质。此配色不改写保存的中性原图。背景、选中条和菜单为小型嵌入 SVG 材质，由代码维护。

## 最终生成提示词（原文）

Create ONE production-ready transparent PNG game UI asset: an exquisite circular Chinese fantasy quality-rank seal / medallion frame, front orthographic view, fully centered, square image, medallion occupies 86% of canvas, transparent outside. No text, no letters, no symbols in the central open field. It will be rendered small (60-100 pixels) with Chinese quality text placed separately on top by code. Style: premium Three Kingdoms PC card game, detailed but restrained raised polished SILVER and ivory metal, carved concentric rings, smooth embossed cloud-scroll ornament etched around rim, a few delicate filigree breaks in the rim, fine beaded inset, dark smoky translucent glass central field clear of decoration in middle 60% diameter. A thin luminous white inner ring, softly diffused pearly halo outside, top-left specular highlights and darker bottom-right metal relief give physical depth. Grayscale silver-white neutral palette only (the engine will apply quality colors), no gold or colored gems. Elegant sculpted relief, excellent material craftsmanship, no angular wireframe, no spikes, no flat polygon shapes, no childish toy appearance, no photoreal background, no cast shadow on a ground plane, no text and no watermark. Preserve genuine alpha transparency including soft glow. Single asset, not a sprite sheet.
