# 实现规则

## 架构边界

- `src/core/` 保存平台无关的游戏逻辑和画师；平台能力由 `src/core/platform.ts` 的 `PlatformAdapter` 定义，`src/adapters/web.ts` 实现 Web/Capacitor 能力。
- 翻盖状态在 `src/core/wallet/flap-state.ts`，投影几何在 `src/core/render/flap-projection.ts`，画布绘制在 `src/core/render/wallet-painter.ts`，接线在 `src/core/game.ts`。改变其中任一处要检查其消费者和相应测试。
- 会话抽钞金额与张数不持久化；图鉴、皮肤、成就和设置通过 `src/core/meta/game-state.ts` 管理持久化。
- 音频为运行时合成；调音参数集中在 `src/core/audio/parameters.ts`，改参数时同步音频回归断言。

## 证据与验证

- 以当前源码、规格和实际测试结果为证据。截图或模拟器画面用于确认视觉缺陷；无法在当前环境观察真机时明确记录这个限制。
- 先跑与修改相关的聚焦测试，收尾运行 `npm run verify`。`npm run verify:specs` 检查主规格；单个变更用 `openspec validate <change> --strict --no-interactive`。
- 不编辑 `dist/`、`node_modules/`、`ios/DerivedData/` 等生成物。不要把秘密、签名材料或本机绝对路径写进项目配置。
