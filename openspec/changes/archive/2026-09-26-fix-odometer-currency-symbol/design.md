## Context

`paintAmountOdometer`（`src/core/render/odometer-painter.ts`）在 `save()` 后设置字体/对齐/变换，随后第 54 行 `fillText(currencySymbol, …)` 绘制货币符号，但墨青 `fillStyle`（含里程碑蜜金混合）在第 59-61 行才赋值。绘制顺序上里程表（`game.ts:784`）紧跟纸币画师（`paintActiveBill`/`paintFlyingBill`），后者残留 `fillStyle` 为纸币浅色底色（`bill-painter.ts` `baseColorHex`）→ 符号浅色画在浅色背景渐变上，不可见。Canvas 2D 的 `fillStyle` 是全上下文可变状态，`save()/restore()` 只快照不重置。

## Goals / Non-Goals

**Goals:**

- 里程表自持绘制色：所有 `fillText`（符号/分隔符/数字）使用同一次赋值的颜色，不依赖任何上游画师的残留状态
- 缺陷可被离线测试捕获（现有套件无 `paintAmountOdometer` 直接覆盖，本次补上）

**Non-Goals:**

- 不改货币符号字符、字距系数（`*1.3`）与排版逻辑
- 不改里程碑闪色的时序语义（符号随数字同色闪动属自然结果，单独排除反而引入分支）

## Decisions

**D1：把 `fillStyle` 赋值整体前移到货币符号绘制之前（而非给符号单独补一次赋值）。**
理由：颜色声明收敛为一处，符号/分隔符/数字天然同色，消除「两类文本两种取色路径」的分叉。备选「符号处再赋一次色」被否：两条赋值路径在里程碑闪色逻辑变更时容易只改一处。

**D2：回归测试以「预置脏 fillStyle + 录制型 mock 上下文」落坑。**
理由：缺陷入于跨画师状态残留，须把上下文预染为纸币底色（如 `#E8C37E`）再绘制才能复现；断言方式沿用本仓画师测试惯例（`flap-seams.test.ts` 的录制 mock）：mock 上下文记录每次 `fillText` 调用时刻的 `fillStyle`，断言 `$` 调用发生时颜色已是 `INK_TEXT_COLOR_HEX`（及闪色混合色）。无新依赖、确定性、不依赖字体度量。

## Risks / Trade-offs

- [符号颜色随里程碑闪色联动] → 符号与数字同步蜜金闪动，与「整块里程表闪色」直觉一致，接受为设计结果并在测试中锁定
