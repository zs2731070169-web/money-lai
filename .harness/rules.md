# 实现规则

## 架构边界

- `src/core/` 保存平台无关的燃信逻辑和 Canvas 画师，不直接引用 DOM、Capacitor、`window`、`document` 或网络 API。
- 平台能力只通过 `src/core/platform.ts`；Web/Capacitor 实现在 `src/adapters/`。
- 主循环状态机位于 `src/core/letter/burning-state.ts`，手帐状态位于 `src/core/journal/`，匿名统计纯逻辑位于 `src/core/count/`，副作用由 `src/core/game.ts` 消费。
- 本机状态只使用 `letter-burning/state/v1`；旧 `money-lai/state/v1` 不读取、不改写、不迁移。
- 音频全部运行时合成；调音参数集中在 `src/core/audio/parameters.ts`。钢琴声部禁止重新加入白噪起音或卷积白噪混响。
- 用户文字只能进入当前明信片和本机手帐，任何网络接口的类型和调用参数均不得包含文字、图案或本机元进程。

## 产品边界

- 主界面只显示暖纸背景、信封、露出的明信片边缘和菜单，不显示常驻数字。
- 元进程只使用明信片里程、独立图鉴、信封材质、明信片纸纹和燃信成就；结算无弹窗、红点、庆祝音或催促。
- 长图只走临时 PNG 与系统分享，不申请或调用照片图库写入。
- 静态文案集中在 `src/core/content/copy.ts`，用户输入不参加静态禁词审计。
- 燃烧使用固定采样连续火线，禁止粒子、屏幕震动、全屏火焰、末段加速和具象残留物。

## 证据与验证

- 行为变更先更新 OpenSpec；核心纯函数先跑聚焦测试。
- 收尾运行 `npm run verify`、`npm run verify:specs`、当前变更严格校验和 `git diff --check`。
- 视觉与声音按 `docs/device-qa-checklist.md` 验收。模拟器记录不能替代静音拨片、Home 指示条、系统分享与中断恢复的真机结果。
- 不编辑 `dist/`、`node_modules/`、`ios/DerivedData/`、`android/**/build/` 等生成物，不写入秘密或生产凭据。
