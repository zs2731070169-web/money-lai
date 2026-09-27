# 回退 fix-flap-corner-aliasing（离屏遮罩三段式）

## Why

用户实测反馈（2026-09-27）：修复部署后模拟器实机明显卡顿（「改了以后怎么这么卡」），
要求退回去。三段式在每帧翻盖绘制上叠加了清屏（约 100 万物理像素暂存面）、
100 条遮罩条带（第二次全纹理采样）与整面合成，模拟器（CPU 回退渲染）帧预算超支。

## What Changes

- 完整回退 `wallet-painter.ts` / `game.ts` / 相关测试到 fix-flap-corner-aliasing 之前的实现
  （恢复轮廓 clip + 单段条带直绘主画布；移除暂存面与 destination-in 遮罩段）。
- 删除 tests/render/flap-mask-pipeline.test.ts；flap-seams / diagnose-flap 恢复原断言。
- 仅保留与运行时无关的注释勘误（切边阈值 8%→30% 与常量一致）。
- 锯齿问题本身仍未解决，回退后如需重做须以「渲染质量 + 帧预算」双约束重新设计
  （如：稳态角缓存复用、遮罩段降采样、真机与模拟器分开评估）。

## Capabilities

（无——回退实现层，行为契约不变，`skip_specs: true`）
