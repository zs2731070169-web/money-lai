# 提案：晚安模式默认开启 + 设置开关状态缓存修复（bedtime-default-on）

## Why

实测反馈两件事：① 设置页打开「晚安模式」开关后，界面上开关仍显示关闭——逻辑层已进入夜间会话，但抽屉页面数据缓存键（`overlayPageDataCacheKey`）漏列 `bedtimeModeEnabled`，切换后缓存命中、设置页用旧 settings 渲染，违反 meta-progression「设置变更即时生效」既有要求；② 产品定位已落到「睡前数钱」，晚安模式应默认开启（新装与无该字段的旧档冷启动即夜间剖面），让首次打开就是安睡体验。

## What Changes

- **修复**：`overlayPageDataCacheKey` 增加 `bedtimeModeEnabled` 位，切换即时反映到设置页胶囊（无规格变更，恢复既有规格的行为）
- **默认开启**：晚安模式初始默认为开启——`createInitialPersistedGameState` 与旧档解析的缺省值由 false 改为 true；用户显式关闭后按用户选择持久化（规格变更：sleep-mode「晚安模式入口」补默认开启契约）

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `sleep-mode`: 「晚安模式入口」增加默认开启契约（新装/无字段旧档冷启动处于夜间剖面；用户关闭选择持久化）

## Impact

- `src/core/meta/overlay-layout.ts`：缓存键补 bedtimeModeEnabled 位
- `src/core/meta/game-state.ts`：settings 默认值与解析缺省改 true
- 测试：设置默认值断言、round-trip 缺省断言、无头集成冒烟（默认夜间剖面 + 开关双向）更新；缓存键单测新增开关位覆盖
