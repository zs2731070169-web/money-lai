## Why

手帐页页脚常驻的淡字「这些东西只在这台设备上。」在页眉带改版（返回按钮、清空入口上移）后成为页面上唯一的冗余说明行：隐私承诺已在首次同意门（`privacySummary`）一次性讲清，页脚重复陈述反而增加视觉噪音。用户实测反馈要求去掉该文本。

## What Changes

- 删除手帐页页脚常驻的本机说明绘制，「清空整本手帐」入口已在此前变更中移至页眉带右上，页脚不再承载任何内容。
- 删除 `COPY.localOnly` 文案条目；隐私「本机存储」承诺不减弱——仍由首次同意门与 `safety-privacy` 规格承载。
- 删除 `journal-layout` 中仅为该说明服务的 `noteY` 布局字段（含测试断言）。
- 主规格 `journal` 的「本机说明」需求整体移除（含「不暗示可从云端恢复」条款；该约束的实质由产品无账号、无云端、无跨设备同步的离线架构天然保证，且首次同意门文案不变）。
- 同步去掉在途变更 `journal-clear-top-right` 任务 1.2 遗留的「说明仍在页脚」测试断言。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `journal`: 移除「本机说明」需求（页脚淡字常驻显示及其场景）。

## Impact

- `src/core/content/copy.ts`：删除 `localOnly` 条目。
- `src/core/render/app-overlay-painter.ts`：`paintJournal` 删除页脚说明绘制行（`layout.noteY` 唯一消费点）。
- `src/core/journal/journal-layout.ts`：删除 `noteY` 字段声明与计算。
- `tests/journal/journal-layout.test.ts`：删除 `noteY` 断言（两处）。
- `tests/journal/page-isolation.test.ts`：删除文案 `toContain` 断言。
- `tests/journal/clear-entry.test.ts`：删除「这些东西只在这台设备上。」仍在页脚的断言块（`journal-clear-top-right` 1.2 遗留）。
- 不影响 `safety-privacy` 规格与首次同意门；不涉及任何数据、存储或网络行为。
