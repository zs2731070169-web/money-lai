## 1. 红灯回归测试

- [x] 1.1 在 `tests/render/render-foundations.test.ts` 新增 `paintAmountOdometer` 货币符号用例：录制型 mock 上下文（记录每次 `fillText` 时的 `fillStyle`），预置脏色 `#E8C37E`（纸币底色，模拟上游画师残留）后调用绘制，断言 `$` 与数字调用时刻的 `fillStyle` 均为 `INK_TEXT_COLOR_HEX`；另断言闪色比例 >0 时符号与数字同为混合色。验证：修复前该用例失败（符号为脏色），`npx vitest run tests/render` 红
- [x] 1.2 补充进程内一致性别名断言：同一轮绘制中所有 `fillText` 的颜色一致（无「符号一种色、数字另一种色」分叉）。验证：随 1.1 同用例红/绿

## 2. 修复实现

- [x] 2.1 `src/core/render/odometer-painter.ts`：把 `fillStyle` 赋值（墨青/蜜金混合，含 flashRatio 钳制）整体移至货币符号 `fillText` 之前，颜色声明收敛一处。验证：1.1/1.2 用例转绿，`npx tsc --noEmit` 对本变更文件无错

## 3. 回归与收尾

- [x] 3.1 全量回归：`npm test` 本变更范围全绿（render 12/12、其余 19 文件不 regress）；套件存在 4 个**先前在途**失败与本变更无关（audio 快照 `swellAttackMilliseconds` 50→70、`flap-state.test` 缺失导出 `walletFlapOpenPhysicalProfile`，属未完成的调音/翻盖物理变更，本变更文件与其无导入路径交集）
- [x] 3.2 实现后审查：odometer-painter 无死代码/冗余/命名问题（`flashRatio` 单一用途、颜色声明单点）；变更目录归档至 `openspec/changes/archive/2026-09-26-fix-odometer-currency-symbol/`
