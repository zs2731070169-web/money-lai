# design：渲染 DPR 上限 2→3

## 根因链

```
web.ts syncCanvasSize: min(devicePixelRatio, 2)
  → iPhone 17（3x 屏）backing store = 逻辑 402×874 × 2 = 804×1748
  → 合成器放大到物理 1206×2622（×1.5）
  → 所有圆角/斜边（钞票、钱包、覆盖层）抗锯齿灰阶被拉伸成 1~3 级台阶 ← 用户截图所见
```

锁 2 的动机是 MVP 期填充率保守；但：① 帧预算冒烟在无头适配器（固定逻辑分辨率）上运行，从未约束过该值；② 绘制调用预算 <160/帧与像素数正交；③ 注释引用的「设计令牌 D 区纪律」无定义（失效引用）。

## 方案

1. `resolveRenderScale(devicePixelRatio: number): number`——`clamp(1, devicePixelRatio, 3)`：
   - 3x 设备原生分辨率（本变更目的）；
   - 上限 3 防 4K/外接屏无限填充（保守护栏）；
   - 下限 1 防异常 0/负值。
2. `syncCanvasSize` 接入该函数，注释改为如实描述来源（实测锯齿反馈 + 上限护栏动机）。
3. 不动 `setTransform` 与逻辑坐标系（对外仍是逻辑像素，渲染层无感知）。

## 风险与回退

- 填充成本 ×2.25（3x 设备）：模拟器实跑目视帧率 + 用户实看；若真机压测不过，回退 = 常量 3→2，一处改动。
- 内存 +~7MB（backing store），量级可接受。

## 测试策略（先红后绿）

- 红：`tests/adapters/render-scale.test.ts` 断言 `resolveRenderScale(3) === 3` 等 5 例——现无此函数，导入即红。
- 绿：实现后全过；`npm test` 全量回归 + `npx tsc --noEmit`。
- 视觉验收：`npm run launch` 后 `simctl io screenshot`，放大圆角对比改前截图（台阶应消失）。
