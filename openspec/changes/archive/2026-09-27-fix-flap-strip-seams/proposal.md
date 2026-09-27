## Why

用户截图 `截屏2026-09-26 15.45.28` 显示直立翻盖上出现多条浅色横缝，并反馈翻动时闪烁。横缝与 Canvas 纹理条带的边界重合，破坏了翻盖作为连续皮革表面的视觉效果。

## What Changes

- 翻盖在闭合、翻动及直立状态保持连续表面，不露出条带之间的背景色。
- 侧对视线时稳定呈现皮革厚度，避免极窄纹理在动画帧之间跳闪。
- 增加针对条带连续性和侧面临界角度的回归检查，并在 iOS 画面上复核。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `game-visuals`：补充翻盖纹理连续性与动态稳定性的可观察要求。

## Impact

涉及 `src/core/render/wallet-painter.ts`、相关渲染测试与真机视觉验收；不更改交互状态机、音频或平台接口。
