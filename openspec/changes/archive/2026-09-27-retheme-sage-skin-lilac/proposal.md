# 提案：浅豆绿纸纹换色为藕荷纸纹（实测反馈：原色与 1 元本色同色不可辨）

## Why

「浅豆绿纸纹」的染色目标色 `#A8C6A6` 与 1 元面额本色 `#A9C4AE` 几乎同色（差 <3/255），切换后视觉不可辨——用户实测确认后在三个候选色中选定**藕荷**（淡雅紫粉，全色板唯一紫色系，与现有皮肤/面额均不撞色）。强度教训：保持 0.45 克制混合，不提饱和。

## What Changes

- `BILL_SKIN_TINTS['bill-sage']`：tint `#A8C6A6 → #BCA7C9`（藕荷），inkTint `#5F8266 → #82688F`（灰紫印墨），blendRatio 0.45 不变。
- 皮肤显示名：`浅豆绿纸纹 → 藕荷纸纹`（`skins.ts` displayName；id `bill-sage` 不动，不影响已解锁/已选中进度与持久化）。
- 皮肤页色卡动态取 tintHex，自动跟随。

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
（无——皮肤数量/解锁阈值/切换契约均不变，纯色值与显示名调整，`skip_specs: true`）

## Impact

- 代码：`src/core/render/skin-palettes.ts`（一行色值）、`src/core/meta/skins.ts`（displayName）。
- 测试：无色值/名称断言（已核对），跑 skin 相关测试确认。
- 用户体验：已解锁该皮肤的用户下次抽钞即见藕荷染色，无迁移成本。
