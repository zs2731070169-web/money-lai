# 渲染 DPR 上限 2→3（修全图圆角锯齿）

## Why

用户模拟器截图实测反馈：钞票/钱包等全部圆角元素普遍存在 1~3 级锯齿台阶。根因：`web.ts` 主画布 DPR 锁 2（`min(devicePixelRatio, 2)`，MVP 期「保填充率」决策）——iPhone 17 为 3x 屏，backing store 只有物理分辨率的 2/3，被合成器 ×1.5 拉伸，所有抗锯齿边缘退化为台阶。原注释引用的「设计令牌 D 区纪律」在仓库中并无定义（失效引用），且帧预算冒烟跑在无头适配器上（逻辑分辨率固定），从不依赖该锁。

## What Changes

- 主画布渲染缩放放开：`min(devicePixelRatio, 2)` → `min(devicePixelRatio, 3)`，3x 设备获得原生分辨率 backing store，圆角/斜线恢复硬件抗锯齿。
- 缩放解析提取为纯函数 `resolveRenderScale(devicePixelRatio)` 并单测锁定（1x→1、2x→2、3x→3、4x→3 封顶、异常值下限 1）。
- 票面圆角半径 2pt → 6pt（实测反馈「不够圆滑」：2pt 圆弧在高倍屏上仅约 6 物理像素，抗锯齿灰阶呈台阶感）。
- 翻盖面部纹理缓存按主画布渲染尺度（ctx 变换 a 分量，防御式取值）建高分辨率表面，消除全仓唯一 `drawImage` 放大路径的「模糊+台阶」（无头环境回退 1，降级语义不变）；条带源侧重叠量随尺度补偿。
- 清理失效注释引用（「设计令牌 D 区纪律」→ 如实注明实测反馈来源）。

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
（无——渲染分辨率不在主规格行为契约内，属性能/质量调优，`skip_specs: true`）

## Impact

- `src/adapters/web.ts`：`syncCanvasSize` 改用 `resolveRenderScale`；新增导出纯函数与一行渲染尺度诊断日志。
- `src/core/render/bill-painter.ts`：票面外圆角 2→6pt。
- `src/core/game.ts`：`ensureFlapFaceSurfaces` 按渲染尺度建缓存（防御式 `getTransform`，无头回退 1）。
- `src/core/render/wallet-painter.ts`：条带源重叠随纹理尺度补偿。
- `tests/adapters/render-scale.test.ts`：新增（红→绿）。
- 3x 设备填充成本 ×2.25（1206×2622 ≈ 3.2M 像素/帧）；绘制调用数不变（<160/帧），Canvas 2D GPU 填充在 A 系芯片量级内；无头帧预算冒烟与本变更无关（不经过 web 适配器），真机手感以模拟器实跑 + 用户实看为准，回退仅需改一个常量。
- 画布内存 12.6MB（1206×2622×4B）+ 翻盖纹理 ×9 像素（约 3.4MB），可接受。
