# 提案：合盖触面时遮住现金并稳定翻盖长度

## Why

用户录屏 `录屏2026-09-27 02.10.51.mov` 显示：合盖末段先从翻盖自由边下露出一条现金，随后翻盖突然向下变长才盖住。当前触面软压扁把翻盖沿铰链向上缩短最多 2%，但进入关闭稳态立即取消缩短，正好造成这两段异常。

## What Changes

- 翻盖临近闭合时，自由边始终覆盖到钱包口，禁止末段露出现金或突然伸长。
- 保留现有关闭的减速垫着陆和触面反馈；移除造成外轮廓缩短的 2% 几何压扁。

## Capabilities

### Modified Capabilities

- `wallet-interaction`：关闭垫着陆不再改变翻盖外轮廓长度。
- `game-visuals`：合盖末段现金与翻盖的遮挡保持连续。

## Impact

- `src/core/game.ts` 的触面变形参数、`src/core/render/flap-rounded-outline.ts` 的投影、`src/core/render/wallet-painter.ts` 的调用及相关回归测试。
