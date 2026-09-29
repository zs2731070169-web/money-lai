## Context

手帐页头部结构（`paintJournal`）：`title()` 在 `safe.top + 38` 线上画居中标题与左上「返回」（20px，返回命中盒 `pageBackRect` 68×48）；页眉带为 `safe.top` 起 72px 高。`journal-grid-banner-isolation`（已完成）把网格裁剪在页眉带之下并排除带内格块命中，页眉带右上因此全程空净可用。「清空整本手帐」现由 `journalClearRect(width, height, safe)` 定位页脚，`paintJournal` 页脚绘制、`game.ts` 命中路由各一处调用；空手帐淡显（alpha 0.3）语义已在。展开详情层遮罩自 `safe.top + 72` 起铺，页眉带不受其压暗。

## Goals / Non-Goals

**Goals:**

- 清空入口常驻页眉带右上角，滚动全程可见，与左上返回同层对称。
- 命中、确认流程、清空行为（含空手帐淡显）语义不变。

**Non-Goals:**

- 不改确认弹窗与清空动画本身（用户在途的纸面渐隐语义另行落地）。
- 不动页脚「这些东西只在这台设备上。」说明与网格/页眉带裁剪逻辑。

## Decisions

**D1 入口矩形：`journalClearRect` 改为 `(width, safe)`，右上角锚定。**
矩形取右缘内缩、垂直与返回同带的安静文字入口：`left = width - safe.right - 128`、`top = safe.top + 10`、`128 × 48`，与 `pageBackRect`（68×48、`top = safe.top + 10`）同高同层镜像。文字右对齐 `width - safe.right - 19`（与返回左对齐 `safe.left + 19` 对称），16px、INK、alpha 沿用「有记录 0.62 / 空手帐 0.3」。签名去掉不再需要的 `height` 参数，调用点同步（`paintJournal` 绘制、`game.ts` 命中）。

**D2 触点路由顺序不变。**
`game.ts` 现序：返回 → 详情关闭 → 清空 → 格块命中。清空判定先于 `hitJournalCell`，页眉带格块短路（上一变更引入）不影响右上入口命中；详情打开时点按仍先关详情（行为不变）。

**D3 页脚只留说明文字。**
`paintJournal` 删除页脚入口绘制块，「这些东西只在这台设备上。」保留原位原样。

**D4 测试锚定几何与文案位置，不锚定样式细节。**
`journalClearRect` 断言矩形落在页眉带内（`top < safe.top + 72`）且右缘贴安全区；绘制测试用记录坐标的 `fillText` 桩断言「清空整本手帐」绘制在页眉带纵带内、页脚带内不再出现该文案；既有 `page-isolation` 文案断言天然继续成立。

## Risks / Trade-offs

- [右上角背景叶饰与文字叠印] → 装饰为羽化淡水彩，16px INK 文字可读性预期良好；模拟器验收目检确认，必要时仅下调 alpha。
- [128px 宽命中盒在窄机型（3 列阈值 390px 以下）逼近标题] → 402px 视口下左 82 / 右 274 起，居中标题带宽约 72px（24px×3 字）不重叠；更窄机型由 2 列布局的 20px 内边距兜底，验收覆盖 402px 主流宽度。
- [与用户在途的清空渐隐改动同文件] → 实现前重读工作区版本，改动仅限入口矩形/绘制/路由三处，不碰清空流程代码。

## Migration Plan

无存储与契约变更，部署即生效；回滚还原三处小改动即可。
