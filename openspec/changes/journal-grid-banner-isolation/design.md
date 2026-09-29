## Context

手帐页结构（`src/core/render/app-overlay-painter.ts`）：`paintPaperBackground` 先铺全页纸面背景（含四角水彩装饰，即用户所称顶部 banner 的视觉来源），`title` 画「手帐」标题与左上「返回」，随后 `paintJournal` 直接循环绘制网格缩略图——无任何裁剪边界。`computeJournalLayout`（`src/core/journal/journal-layout.ts`）已提供 `headerRect`（`safeArea.top` 起 72px 高的页眉带），且 `maximumJournalScroll` 已按该带占位计算滚动上限，但绘制与命中都没有用它隔离网格。

工作区在途状态：用户正在调整 `paintJournal` 的展开详情层（详情卡样式）。本次改动只包网格循环与 `hitJournalCell`，以实现时的当前工作区文件为基线，不碰详情层。

## Goals / Non-Goals

**Goals:**

- 网格滚动全程，缩略图与日期只在页眉带之下绘制，从带下缘滑出。
- 页眉带内点按不命中格块（返回按钮命中在其之前的独立分支，顺序不变）。
- 改动收敛在绘制层与命中函数，不动布局契约、滚动数学与存储。

**Non-Goals:**

- 不给页眉带加渐隐/羽化过渡或分隔线（标准"列表在标题下滑动"观感已达标）。
- 不改展开详情层、页脚元素与菜单导航。
- 不处理网格与底部页脚的滚动交叠（页脚文字本就后绘于网格之上，现状无遮挡投诉）。

## Decisions

**D1 绘制期裁剪，而非改布局或滚动范围。**
在 `paintJournal` 网格循环外包 `context.save(); beginPath(); rect(0, headerRect.bottom, width, height - headerRect.bottom); clip(); … restore()`。
备选否决：收窄滚动范围会让长列表滚不到底，中间态必有行进入页眉带；在 `journal-layout` 截断 cell rect 会让日期标签错位、阴影无法裁剪，且 rect 被命中测试复用会误伤可见区命中；重绘一层不透明 banner 会与连续纸纹背景产生接缝。clip 是改动面最小、不污染几何契约的方案。

**D2 裁剪边界复用 `headerRect`，不引入新常量。**
口径与 `maximumJournalScroll` 的页眉占位完全一致，两处天然对齐。

**D3 `hitJournalCell` 对页眉带内坐标短路返回 `null`。**
视口坐标 `y < headerRect.bottom` 直接不命中。被 clip 隐藏的格块"看不见即点不到"，避免从 banner 空白处凭空展开记录。`game.ts` 的 `pageBackRect` 判定在格块命中之前，返回按钮行为不受影响。

**D4 测试锚定裁剪盒与命中语义，不锚定绘制细节。**
Proxy 画布桩记录 `rect`+`clip` 调用序列，断言滚动态下存在 `rect(0, 134, 402, 740)`（402×874、safeTop 62 的确定性算例）紧邻 `clip`；`hitJournalCell` 纯函数断言：滚动后某格块部分进入页眉带时，带内坐标返回 `null`、带下可见坐标照常命中同一格块。不遍历断言详情层绘制（用户在途改动区域）。

## Risks / Trade-offs

- [缩略图跨越页眉带下缘呈硬切割，纸面连续无分隔线] → 属"列表在标题下滑动"的标准观感；若日后要柔化，可在 clip 之上叠加渐隐带，独立小改。
- [页眉带内（返回按钮之外）点按完全落空] → 视觉上带内无格块，"看不见点不到"符合直觉；规格已明确该语义。
- [与用户在途的 `paintJournal` 编辑冲突] → 实现前先重读当前文件，改动仅限网格循环包裹与命中函数，不动详情层代码。

## Migration Plan

无存储、契约与数据变更。部署即生效；回滚还原两处小改动即可，无迁移。
