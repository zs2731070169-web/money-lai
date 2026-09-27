## Why

钱包口的宽容抓取热区延伸到钱包皮面，当前轻点会被抽钞状态机当作点击替代，导致用户点钱包或露出的纸币时自动抽出现金。

## What Changes

- 移除点击纸币自动抽钞；只有明确向上拖拽并超过完成阈值才抽出现金。
- 保留纸币及其周围余量区域的向上拖拽抓取；轻点钱包或纸币均不触发翻盖或抽钞。
- 钱包翻盖开合仅由定向滑动触发，移除原先的翻盖轻点开合。
- 回归覆盖纸币点击、钱包皮面点击、翻盖滑动、纸币及余量区拖拽，以及动画期间的连抽。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `cash-drawing`: 移除点击抽钞路径；纸币和宽容抓取余量区均需上拖，移除“纯点击可完成游戏”的旧承诺。
- `wallet-interaction`: 翻盖只响应滑动，轻点不再触发开合。

## Impact

- `src/core/game.ts` 的触摸路由、`src/core/wallet/flap-state.ts` 的松手判定、`src/core/render/bill-geometry.ts` 的可见纸币边界。
- 触摸集成测试及命中几何测试；不改变平台适配器或持久化格式。
