# Tasks：晚安模式默认开启 + 开关缓存修复

## 1. 修复与默认值

- [x] 1.1 `overlayPageDataCacheKey` 增加 bedtimeModeEnabled 位；验证：缓存键单测——切换该位前后键不同（修复「界面仍显示关闭」）
- [x] 1.2 默认开启：`createInitialPersistedGameState` 与解析缺省（无字段旧档）改 true；验证：设置默认值/round-trip 单测更新 + 旧档缺省归 true 断言
- [x] 1.3 无头集成冒烟更新：全新冷启动默认夜间剖面、关闭后持久化关闭；验证：`tests/boot/bedtime-session.test.ts` 全绿（日间路径测试经 `tests/support/daytime-boot-state.ts` 种子显式关闭）
- [x] 1.4 全量回归 `npm test` + `npx tsc --noEmit` 通过（284 测全绿）

## 2. 收尾

- [x] 2.1 实现后必审（死代码/命名注释）并提交推送
- [x] 2.2 同步主规格、归档变更目录
