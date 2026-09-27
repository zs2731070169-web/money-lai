# design：皮肤分组与双槽位

## Context

现行 `activeSkin` 单字符串槽位：钱包皮与纸纹皮互斥，皮肤页两类混排（`SKIN_COLLECTION` 交错顺序直出网格），用户无法从界面分辨「这个皮肤染什么」。取色侧 `resolveWalletLeatherPalette` / `resolveBillSkinTint` 已按 id 前缀分流，天然支持双槽。

## 决策

### D1 数据模型与迁移（game-state.ts）
`PersistedGameStateV1` 拆 `activeWalletSkin: string`（默认 `wallet-classic`，恒有启用）+ `activeBillSkin: string | null`（null=面额原色）。解析兼容两形态：新形态直收；旧形态（仅 `activeSkin`）按前缀迁移（`wallet-*`→钱包槽+纸币槽 null；`bill-*`→钱包槽 classic+纸币槽该 id）。序列化只写新形态；损坏兜底不变。

### D2 切换语义（skins.ts）
`switchActiveSkin(state, skinId)` 解锁守卫不变；按 `SKIN_COLLECTION` 查 kind：wallet → 覆盖钱包槽；bill → 纸币槽 === 该 id 时置 null（再选取消、恢复原色），否则置该 id。返回新状态对象。

### D3 分组几何（overlay-layout.ts）
皮肤页按钮按 kind 重排：钱包组在前、纸币组在后，各组前置节标题（`skinSectionAnchors: {title, topY}[]` 随布局下发，单一事实源）。卡高沿用按可用高自适应，行数计入两组总行数与两节标题占位。

### D4 绘制配对按 skinId（overlay-painter.ts）
画师改为 `Map(skinId → button)` 配对（分组后按钮顺序与 SKIN_COLLECTION 交错序不再对齐，按下标配对会错位）；节标题按锚点绘制；启用描金框沿用 `pageData.skins[].active`（编排层按槽位算）。

### D5 取色点（game.ts）
钱包皮革 → `resolveWalletLeatherPalette(activeWalletSkin)`；纸币染色（抽出/飘落/堆叠跟随张）→ `activeBillSkin`；皮肤页 active 判定按各自槽位比对。

## 约束
- 存储键 `money-lai/state/v1` 不动，schemaVersion 仍 1（解析端兼容即无损迁移）。
- `DEFAULT_SKIN_ID` 语义锚定为钱包默认款。
