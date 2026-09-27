# 提案：翻盖投影缓冲复用（GC 减压，渲染输出零变化）

## Why

用户实测拖拽抽钞偶发卡顿；上一轮位图缓存方案因改变渲染画质被否决回退（教训已记档：性能优化必须像素级一致）。本轮选定零输出变化的 GC 减压方向：对抗式调查确认 `projectRoundedFlapShape` 每帧（条带绘制路径）分配 ~165 个边界对象 + 2-3 个数组 + 2 个闭包（快照式返回 + `Array.from` 映射 + `[...spread]` 拷贝 + 排序闭包），60fps 下 ~1 万对象/秒直喂年轻代——「偶发」卡顿与 minor GC 暂停的特征吻合。

## What Changes

- 新增**缓冲复用 API**：`createProjectedFlapShapeBuffers` + `projectRoundedFlapShapeInto`（写入跨帧复用的预分配槽位，仅覆写字段；模块级比较器消除闭包）。
- **快照 API 保持原契约**：`projectRoundedFlapShape` 改为缓冲版的一次性包装（私有缓冲 + 数组浅拷贝）——测试与低频路径零影响，双结果并存语义不变。
- 条带绘制热路径（`paintFlapWithStrips`）接线模块级共享缓冲。
- **别名污染修复**（实现中实测发现）：outline 槽位不得持有条带对象引用——排序重排引用后，额外采样写入会透过别名改写条带对象；改为 outline 全自有槽位 + 字段拷贝（仍零分配）。
- 数学逐式照搬，无任何渲染输出变化。

## Capabilities

### New Capabilities
（无——纯内部内存管理优化，`skip_specs: true`）

### Modified Capabilities
（无）

## Impact

- 代码：`src/core/render/flap-rounded-outline.ts`（缓冲 API + 别名修复）、`src/core/render/wallet-painter.ts`（热路径接线，2 行）。
- 测试：新增等价性锁——`Into 路径与快照路径在角度×圆角×矩形网格上逐字段一致`（25 角度 × 5 圆角 × 3 矩形深比较）+ `缓冲跨次复用无脏数据`；flap-seams/render-foundations/smoke 全绿。
- 视觉验证（真机荣耀）：平坦区（皮革内部/背景）改前后**逐像素 0 差**；纹理区（翻盖/票面）差异分布与呼吸微动效噪声底同分布——渲染输出一致。
- 收益：每帧 ~165 对象 + 数组/闭包分配 → 稳态 0（容量稳定后）。
