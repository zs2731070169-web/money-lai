## Why

手帐页网格滚动时，缩略图会一路滑进顶部页眉带（「手帐」标题 + 左上「返回」按钮 + 顶部水彩装饰所在的 banner 区域），既遮挡返回按钮、又让内容"穿透"进 banner，观感像页面被撕开了口子。点按命中也未排除该带：被裁剪隐藏在 banner 下的格块仍会被点中，从"空白处"凭空展开一封信。

## What Changes

- 手帐网格绘制增加裁剪边界：缩略图只画在页眉带（自安全区顶部起约 72px，与现有 `headerRect` 一致）之下，滚动时从 banner 下缘滑出，不遮挡标题、装饰与左上返回按钮。
- 网格点按命中同步排除页眉带：落在页眉带内的触点不命中任何格块（返回按钮命中在其之前已有独立处理，不受影响）。
- 页脚「仅存本机」说明与「烧掉整本手帐」入口、展开详情层维持现状，不在本次范围。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `journal`: 「真实明信片网格与按需展开」需求补充网格与页眉带的空间边界——滚动内容不进入页眉带，页眉带内点按不命中格块。

## Impact

- `src/core/render/app-overlay-painter.ts`：`paintJournal` 网格循环外包一层 `clip`（页眉带底缘以下）；`hitJournalCell` 对页眉带内坐标直接返回 `null`。
- `src/core/journal/journal-layout.ts`：不改动（`headerRect` 已存在且 `maximumJournalScroll` 已按页眉带占位计算）。
- `tests/journal/`：新增回归测试（裁剪边界 + 页眉带命中排除），现有 Proxy 画布桩天然兼容新增的 `save/beginPath/rect/clip` 调用。
- 无数据结构、存储格式、平台契约与音频改动；帧循环仅多一次 `save/clip/restore`，无性能预算影响。
