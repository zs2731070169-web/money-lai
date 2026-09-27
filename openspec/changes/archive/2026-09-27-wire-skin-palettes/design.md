# design：皮肤色板接线

## 分层

- 色板与解析器放 render 层新模块 `skin-palettes.ts`（依赖 design-tokens + color-utilities，
  单向无环）；meta/skins.ts 不动（SkinDefinition 仍无颜色，解锁逻辑与外观解耦）。
- 皮肤 id 是贯穿键：game 每帧 `resolve*(activeSkinId)`，画师收 palette/tint 对象或 id。

## 关键决策

1. **钱包色板 = 6 色整组**（body/shadow/deep/stitching/lining/edge）：
   classic 与现状逐字节一致（含切边 #5C4633），保证零视觉回归；
   其余四款（焦糖棕/苔绿/暮蓝/莓粉）内衬取对比色系（苔绿配草黄、暮蓝配暖麻）。
2. **纸纹皮肤 = 染色而非替换**：对 DENOMINATION_COLOR_MAP 每档 base/ink 向皮肤色
   线性混合（base 满比例、ink ×0.75 保印墨可读），保留「每档面额专属色相」的
   令牌守卫语义；映射本身不动，快照测试不受影响。
3. **翻盖纹理缓存键 + skinId**：不重建则切换后翻盖残留旧色（面部纹理离屏缓存的
   编排层陷阱，规格场景「即时生效」的直接责任点）。
4. 掠射明度/体积渐变的暖深棕叠加（#3D2C20 族）对所有皮色共用，属通用光影，不入色板。

## 测试策略（先红后绿）

- tests/render/skin-palettes.test.ts：classic 黄金值；各钱包款互异且含全字段；
  bill 皮肤不影响钱包色板、wallet 皮肤不产生纸纹染色；染色 ≠ 原色且 null = 原色。
- tests/render/skin-wiring.test.ts：paintWalletScene 按入参色板落笔（记录型 ctx 断言
  fillStyle）；paintLaiBanknote 带 bill 皮肤出混合色；drawFlapFrontFaceArt 用入色板。
- 真机验收：抽屉 → 皮肤 → 切换焦糖棕/暮蓝，主画面钱包与翻盖即时换色（截图比对）。
