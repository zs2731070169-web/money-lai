## 1. 回归测试先行（红）

- [x] 1.1 `tests/journal/page-isolation.test.ts`：将「这些东西只在这台设备上。」断言翻转为 `not.toContain`；跑 `npx vitest run tests/journal` 确认该用例失败（当前仍绘制）

## 2. 最小实现（绿）

- [x] 2.1 重读工作区当前版本 `src/core/render/app-overlay-painter.ts`、`src/core/journal/journal-layout.ts`、`src/core/content/copy.ts` 与三个手帐测试文件（其他在途变更并行编辑，以此为基线）后：`paintJournal` 删除页脚说明绘制行、`journal-layout` 删除 `noteY` 声明与计算、`copy.ts` 删除 `localOnly` 条目、`journal-layout.test.ts` 删除两处 `noteY` 断言、`clear-entry.test.ts` 删除 `noteDraws` 断言块；跑 `npx vitest run tests/journal` 全绿（含 1.1 与 page-isolation 既有隔离断言）

## 3. 回归与验收

- [x] 3.1 跑 `npm run verify`：失败集与本变更前基线完全一致（燃信在途 10 例红为既有状态）、手帐相关测试全绿、import 审计与构建通过（实际执行时在途燃信 10 例已被并行提交修复，现行基线仅剩 `clear-write-guards` 2 例用户红测试；import 审计、tsc 构建、发行审计因 `&&` 链在测试步中止而显式补跑，全部通过）
- [x] 3.2 跑 `npm run verify:specs` 与 `openspec validate journal-remove-local-note --strict --no-interactive` 通过（主规格 8/8、变更 strict 校验通过）
- [ ] 3.3 `npm run launch` 模拟器验收：手帐页页脚无任何常驻文案，返回按钮、标题、右上「清空整本手帐」与网格滚动不受影响；随后实现后审查（改动面无死代码、未接线引用、命名与注释缺口）并复跑 `npx vitest run tests/journal`
