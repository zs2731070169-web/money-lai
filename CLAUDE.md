# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 强制工程约定（最高优先级）

**在执行任何代码修改之前，必须先创建 OpenSpec 变更文档**——没有例外，包括参数调优级返工：

1. `openspec new change <kebab-name>` 新建变更（主规格已存在于 `openspec/specs/`，需求改动用 `## MODIFIED/ADDED Requirements` 增量表达；纯重构/调优可设 `skip_specs: true`）
2. 依次写 proposal → specs 增量 → design → tasks（`openspec instructions <artifact> --change <name> --json` 取模板）
3. `openspec validate <name> --strict` 通过后才动代码
4. TDD 实现（先红后绿），`npm test` 为统一回归入口
5. 完成后把 MODIFIED/ADDED 同步进 `openspec/specs/` 主规格，`mv` 变更目录到 `openspec/changes/archive/YYYY-MM-DD-<name>/`

MODIFIED 要求**全量携带**被改需求的所有场景（校验器会拒绝丢失场景）。用户反馈驱动的调优也走此流程，从实测反馈到参数逐项落档。

## 常用命令

```bash
npm test                 # 全量回归（vitest，含单元/音频离线渲染/无头集成冒烟）
npx tsc --noEmit         # 类型检查（与 vitest 分开跑，vitest 不做类型检查）
node scripts/import-audit.mjs   # 内核平台依赖静态审计
npm run build            # tsc + vite 构建出 dist/
npm run smoke            # 性能冒烟（帧预算/绘制调用/堆增长 + 主链路集成）

# iOS 模拟器部署验证（iPhone 17）
npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath ios/DerivedData build
xcrun simctl terminate "iPhone 17" com.hariku.moneylai; xcrun simctl install "iPhone 17" ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app && xcrun simctl launch "iPhone 17" com.hariku.moneylai
xcrun simctl io "iPhone 17" screenshot /tmp/frame.png   # 视觉验证（Read 读图）

# OpenSpec
openspec list / status --change <name> --json / validate <name> --strict
```

## 架构

**平台无关内核 + 适配层**：`src/core/` 禁止任何平台 API（`wx`、`@capacitor`、`window`/`document` 直用、直接 `new AudioContext`），唯一出口是 `src/core/platform.ts` 的 `PlatformAdapter` 接口（画布/帧调度/归一化触摸/音频工厂/触觉三档/存储/安全区/前后台/离屏画布/单调时钟）。`src/adapters/web.ts` 是 Web/Capacitor 实现；迁移微信小游戏时只加 adapter。`scripts/import-audit.mjs` 静态强制此纪律（在 `npm test` 内回归）。

**状态机全部是纯函数 reducer**（`state + event → { state, effects }`）：翻盖（`wallet/flap-state.ts`，手势触发语义 + 物理折叠时间线剖面）、抽钞判定（`cash/draw-judgment.ts`）。副作用（音效/触觉/计数）经 effects 由编排层消费。改行为先改 reducer + 单测。

**状态边界（容易踩错）**：抽取进度（金额/张数）是**会话内存态，MUST NOT 落盘**（冷启动清零）；只有元进程（`meta/`：图鉴/皮肤/成就/设置 + `lifetimeDrawCount` 内部计数器）经 `serialize/parsePersistedGameState` 持久化到 `money-lai/state/v1`（损坏 JSON 静默重置）。

**音频全程序化合成（零音频文件，规格硬约束）**：`audio/engine.ts` 为门面（总线防爆/并发抢占/解锁/中断恢复/BGM 编排）。所有合成参数集中在 `audio/parameters.ts` 的 `AUDIO_SYNTHESIS_PARAMETERS` 常量快照——**调音必改快照测试**（`tests/audio/audio-regression.test.ts` 内联镜像对象）。回归用 `node-web-audio-api` 的 `OfflineAudioContext` 离线渲染断言（峰值 ≤0.9/无 NaN/时长）。注意：离线上下文有 `startRendering`，`resumeAudioContextIfNeeded` 必须先判它，否则离线测试挂死。

**渲染**：设计令牌唯一落点 `render/design-tokens.ts`（快照测试锁定）；翻盖条带透视投影公式在 `render/flap-projection.ts`（纯函数、单测覆盖端点/弧线/不成线）；正/背面纹理经 `PlatformAdapter.createOffscreenCanvas` 离屏缓存（无头环境返回 null → 画师平面降级，冒烟测试覆盖降级路径）；`render/overlay-layout.ts` 是元进程覆盖层的布局与命中共用纯函数（「看到的=可点的」）。

**`game.ts` 编排器**是所有接线的汇聚点：阶段（title/playing）、覆盖层路由、轻提示队列、触点→手势路由（多指防护 pointerId）、折叠/抽钞/里程表/元进程/音频触觉的效果消费。加功能多数情况是：改对应 reducer + 在 game.ts 消费新 effect。

## 用户实测反馈史（改行为前先读对应主规格）

主规格 `openspec/specs/`（6 能力）是唯一行为真值，带版本标记的需求承载了实测反馈的结论：翻盖=顶边铰链+真实物理剖面（快起/竖直最慢/重力荡过/过冲回落；关闭垫着陆；全程不成线；180° 直立完整矩形）；开合音=纯噪声三层皮革配方（禁振荡器音高滑落）；BGM=生成式分解和弦+顶棚折下的五声旋律（daytime-comfort 基线：C4 顶棚、14s 和弦、2-7s 旋律间隔，越顶按八度折下）；抽钞摩擦音=**一抓一声**（拖拽全程安静，禁持续声床/断续）。动这些行为前先读 `wallet-interaction`/`procedural-audio`/`game-visuals` 主规格，勿凭记忆。
