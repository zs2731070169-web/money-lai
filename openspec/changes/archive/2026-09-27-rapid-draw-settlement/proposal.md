# 提案：连续快速抽钞的完成结算（实测反馈：快连抽丢计数）

## Why

用户实测反馈：连续快速拖拽抽出纸币时，**只有部分被计入金额**。根因：计数结算只挂在完成动画到时（`animation-finished`，约 480ms）上，而完成动画期间的再次抓取会直接重置会话——在途那张纸币已过完成阈值、本应计数，却被吞掉（金额/张数/图鉴/皮肤/成就/飘落全不发生）。

## What Changes

- **完成动画中再次抓取 = 在途张立即结算**：`draw-judgment` 状态机的 `grab` 事件在 `completing` 相位时先发出 `bill-draw-completed` 效果（在途纸币已过阈值，视为完成：计金额/张数、里程表、元进程结算、飘走），随后照常开新一张拖拽会话。
- **回收动画中再次抓取不变**：未过阈值的纸币本就不计数，重置语义保持。
- 编排层 `beginBillGrab` 先结算在途张、再为新张分配面额（顺序修正：面额分配依赖结算后的 `lifetimeDrawCount`）。
- 回归语义更新：既有「完成动画期间再次上拖接管」用例的期望从「总计 1 张」改为「总计 2 张」（旧期望编码了丢计数行为）。

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
- `cash-drawing`：「抽出完成与回收判定」增加条款——完成动画期间的再次抓取 SHALL 立即结算在途张并开始新会话；新增「连抽结算」场景（原两场景全量保留）。

## Impact

- 代码：`src/core/cash/draw-judgment.ts`（grab 事件 completing 分支）、`src/core/game.ts`（`beginBillGrab` 结算顺序）。
- 测试：`tests/cash/draw-judgment.test.ts`（grab 分支三态：completing 结算/recycling 不结算/idle·dragging 原样）、`tests/wallet/tap-routing.test.ts`（接管用例期望更新 + 连抽两连发计数 2）。
- 连带收益：连抽 streak/里程碑判定（STREAK_WINDOW_MS）自然作用于快连抽。
