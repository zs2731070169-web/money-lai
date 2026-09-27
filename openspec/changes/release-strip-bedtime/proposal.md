# Proposal: release-strip-bedtime — 发布线整体移除睡眠特性

## Why

用户决策（2026-09-27，第三次收窄）：main 作为发布线，晚安模式**不是默认关闭、而是
整个去掉**，自动暗屏（渐进熄灭）同样不要。睡眠特性（晚安会话/夜间剖面/熄灭弧线/
睡眠音频编排/时间窗建议/睡眠账本/早安卡）仅保留在特性分支 `feature/bedtime-money-counting`
继续演进，发布线回到睡眠特性之前的行为。

此前「全量合并 + main 裁剪（默认关、隐藏账本）」方案作废。

## What Changes

- `git revert 90938ef..HEAD`（单提交）：整体撤销 bedtime-money-counting、
  bedtime-default-on、bedtime-bgm-dim-floor 及隐私文案并段的 11 个提交，
  main 回到「现金阈值修复（90938ef）」的代码与规格状态。
- 补落隐私文案并段（原 578dbaf 提交时源码编辑意外丢失，此次随撤销重新落盘）。
- 移除 revert 复原出的 bedtime-money-counting 规划文档目录（特性不在发布线，
  main 的 openspec 目录保持自洽：6 能力主规格、无睡眠变更在途）。

## Impact

- 代码/测试/规格：回到 90938ef 基线 + 隐私文案微调；`src/core/sleep/`、
  `openspec/specs/sleep-mode/` 等在 main 上不存在。
- skip_specs 理由：撤销后 main 的规格与行为即为既有 6 能力主规格的既有状态，
  无规格级增量；本变更文档记录发布线决策与撤销范围备查。
- 特性分支不受影响，继续承载完整睡眠特性与 sleep-mode 主规格。
