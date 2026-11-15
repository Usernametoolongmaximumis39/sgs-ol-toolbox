# 普通品质银白角标

0.3.5起隐藏了品质页中间标题，此素材仅作历史记录保留，不再参与发布。

日期：2026-11-14，皮肤收集0.3.3。

使用内置 **image_gen / imagegen** 编辑用户提供的原生稀有角标参考，保留紧凑银色卷纹轮廓，将文字替换为普通、发光改为银白。不是原宽底框或圆章。

## 文件

- 原始生成图：`ordinary-badge-source.png`。
- 带透明通道的交付尺寸：`ordinary-badge.webp`。
- 发布包内嵌图片：`ordinary-badge.js`。
- 转换：`node tools/prepare-skin-assets.mjs --ordinary`，只裁去外围透明留白并等比缩放，原图不改写。
- 参照：用户本轮附件 `codex-clipboard-f39cc134-c065-414a-b89b-c2ea9ca9b78b.png`。用户截图不打入发布包。
- 原生引擎对照：`test-results/skins/badge-comparison.png`，后两项明确标为用户原生参考。

## 最终提示词（原文）

Edit this reference screenshot into ONE isolated game UI quality badge on true transparent background. The badge is the small '稀有' crest at the center of the screenshot. Preserve its exact compact, nearly square silhouette and its delicate dark-silver intertwining filigree vines, tiny upper prongs and ornamental scrollwork. Replace ONLY the central Chinese text 稀有 with 普通, rendered in the SAME bold engraved Chinese brush lettering style, size and arrangement, but WHITE / pale silver instead of purple. Change the faint purple glow to a restrained cool white/silver glow. Keep the underlying dark charcoal oval/shield center and detailed thin silver ornament. Do not invent a new frame or a wide rectangular plaque; do not add large bulbous scroll ends, ribbons, gold, spikes or extra motifs. Remove ALL screenshot background, horizontal divider lines, stone, borders and unrelated pixels completely. Alpha transparency outside the complete crest and its subtle edge glow. Center this single compact badge, show the whole ornament, have the ornament occupy about 85% of a square canvas, preserve its original native game's understated material style. Exact only visible text: 普通. Final asset should look like the ordinary silver-white member of the SAME icon family as this rare badge, not a redesign.
