# 接线皮肤色板（切换外观即时生效）

## Why

用户实测反馈：皮肤页切换后主画面颜色不变。根因：皮肤系统只有元进程半边
（解锁/选择/持久化/页内高亮），SkinDefinition 无颜色数据，渲染层（钱包/票面画师）
全部从静态设计令牌取色，`activeSkin` 从未被消费——meta-progression 规格
「皮肤切换 → 外观即时生效」是已立约但未实现的契约。

## What Changes

- 新增 `src/core/render/skin-palettes.ts`：4+1 款钱包色板（classic=现值原样）、
  4 款纸纹染色（对现有面额色做线性混合，保留每档专属色相的可分辨性），
  以及 `resolveWalletLeatherPalette` / `resolveBillSkinTint` / `resolveBillColors` 纯函数。
- `wallet-painter`：`WalletPaintOptions` 增色板入参，皮革五色 + 皮革切边色全部改读入参；
  正/背面纹理画师与平面降级路径同步；钱包内纸币堆按 activeSkin 染色。
- `bill-painter`：`paintLaiBanknote`/Ornaments 增可选 skinId，经 resolveBillColors 取色。
- `game.ts`：每帧解析当前皮肤传入画师；翻盖面部纹理缓存键增皮肤 id（切换强制重建，
  否则翻盖停留旧色——编排层细节）。
- 皮肤页色卡改由真色板派生（删除手写 swatchMap 重复）。图鉴页保持面额原色（收集真值）。
- 规格零增量（契约已存在于 meta-progression「皮肤解锁/皮肤切换」，本变更补齐实现）。

## Impact

- 色板首版由 Claude 拟定（与现有奶油底+皮革质感协调），真机实测后再调属正常调优回路。
- 设计令牌与面额色映射不动（快照测试不变）；混合仅在 resolve 时发生。
- 性能：每帧一次对象查表 + 切皮肤时重建两张翻盖纹理，量级可忽略。
