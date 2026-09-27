# 已确认的项目约定

- OpenSpec 主规格位于 `openspec/specs/`；变更文档位于 `openspec/changes/`。产品要求以主规格为准，实施中的差异以对应变更为准。
- 业务内核不直接依赖平台 API；`src/core/platform.ts` 是平台能力契约，`src/adapters/web.ts` 是当前实现。
- 交互状态机尽量保持纯函数。副作用由 `src/core/game.ts` 接收状态机效果后触发。
- Canvas 的逻辑坐标与设备像素比由 Web 适配层处理；离屏翻盖纹理按逻辑尺寸缓存。
- `npm run verify` 是代码收尾入口，`npm run verify:specs` 是主规格校验入口。视觉和声音的真机结果需要单独记录。
