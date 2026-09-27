# 提案：皮肤分组与双槽位选择（实测反馈：选纸纹皮却盼着换钱包色）

## Why

用户实测选中「藕荷纸纹」后疑惑「怎么变的是纸币颜色，不是钱包」——皮肤页把钱包皮质与纸币纹样两类混排，仅靠名字区分，类型不可见。且现行 `activeSkin` 单槽位意味着选了纸纹皮就无法同时保留钱包皮色，两类皮肤互斥体验割裂。

## What Changes

- **双槽位模型**：`activeSkin` 拆为 `activeWalletSkin`（钱包皮质，恒有一个启用，默认经典原色）+ `activeBillSkin`（纸币纹样，`null`=纸币面额原色）——**两类皮肤同时生效**。
- **切换语义**：点选钱包皮换钱包槽；点选纸纹皮换纸币槽；**再次点选已启用的纸纹皮恢复纸币原色**（取消染色）。未解锁仍静默拒绝。
- **分组展示**：皮肤页按「钱包皮质」「纸币纹样」两节分列（节标题 + 各自网格），启用描金框按各自槽位判定。
- **旧档迁移**：v1 存档解析兼容旧 `activeSkin` 字段——按前缀归入对应槽位（wallet-\* → 钱包槽、bill-\* → 纸币槽），序列化只写新形态。
- 渲染链路取色点改为按槽位解析（钱包皮革用钱包槽、纸币染色用纸币槽）。

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
- `meta-progression`：「皮肤解锁」需求更新为分组双槽语义（原场景全量保留 + 新增「分组双槽」场景）。

## Impact

- 代码：`meta/game-state.ts`（字段拆分 + 迁移解析）、`meta/skins.ts`（switchActiveSkin 双槽语义）、`meta/overlay-layout.ts`（皮肤页分组几何）、`render/overlay-painter.ts`（节标题绘制）、`game.ts`（取色点按槽位）。
- 测试：`tests/meta/skins.test.ts`（切换语义重写）、`tests/meta/game-state.test.ts`（迁移）、`tests/meta/drawer-layout.test.ts`（分组几何）。
- 存档：v1 键位不变，旧档无损迁移；损坏兜底语义不变。
