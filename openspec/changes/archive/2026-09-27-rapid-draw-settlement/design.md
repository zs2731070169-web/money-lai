# design：连续快速抽钞的完成结算

## Context

计数结算的唯一入口是 `animation-finished`（completing 相位 480ms 到时）→ `handleBillDrawCompleted`（金额/张数/里程表/图鉴/皮肤/成就/飘落/streak 全在其中）。`grab` 事件在任意相位都重置会话且不发效果——completing 中再抓取即吞掉在途张的结算。见 proposal.md Why。

## 方案

### D1 状态机：grab 的 completing 分支发结算效果
`advanceCashDrawSession` 的 `grab` 事件：`state.phase === 'completing'` 时返回 `{ state: 拖拽新会话, effects: [{ type: 'bill-draw-completed' }] }`——在途张已过阈值，立即视为完成。`recycling` 相位保持纯重置（未过阈值本就不计数）。`idle`/`dragging` 相位行为不变。纯函数改动，效果仍由编排层消费。

### D2 编排：先结算、再分配新面额
`beginBillGrab` 顺序修正：派发 `grab` 事件 → 若效果含 `bill-draw-completed` 先调 `handleBillDrawCompleted(now)`（此时 `activeDenominationId` 仍是在途张的面额，飘落/图鉴记对张）→ 再按结算后的 `lifetimeDrawCount` 为新张 `allocateDenominationForDrawIndex` → 提交新会话状态。若先分配面额再结算，图鉴与飘落会记成新张面额（顺序即正确性）。

### D3 已排队的到时结算不重复计数
结算后 `cashSession.phase` 已变为 `dragging`，stepFixed 中「completing 到时」分支自然不命中，无双结算路径，无需额外去重。

### D4 备选与否决
- 视觉层并行多张在途（多 paper 实例）：渲染与命中复杂度大增，否决——飘落 `flyingBills` 已承担离场视觉，单活跃张模型保持。
- 把完成动画时长缩短为「防误吞」：治标且伤害 follow-through 手感，否决。

## 约束

- streak/里程碑（`STREAK_WINDOW_MS`）在快连抽下由 `handleBillDrawCompleted` 内既有逻辑自然生效，无需改。
- 回收动画中再抓取的既有语义（放弃本张）保持，规格条款已明示。
