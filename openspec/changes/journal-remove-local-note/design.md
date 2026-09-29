## Context

手帐页页脚说明「这些东西只在这台设备上。」由 `paintJournal` 绘制在 `layout.noteY`（`height - safeArea.bottom - 18`）；`noteY` 是 `journal-layout` 输出字段中唯一只为该说明服务的几何值。「清空整本手帐」入口已在 `journal-clear-top-right` 变更中移至页眉带右上，页脚现仅剩该说明。首次同意门（`privacySummary`）与 `safety-privacy` 规格承载全部隐私承诺，本变更不触碰。

工作区另有在途变更（`journal-grid-banner-isolation`、`journal-clear-top-right` 第 5 节）同时编辑 `app-overlay-painter.ts` / `game.ts`；实现前必须重读工作区当前版本为基线。

## Goals / Non-Goals

**Goals:**

- 手帐页页脚不再出现任何常驻文案；页脚区域回归纯背景。
- 相关代码与测试同步收敛：`COPY.localOnly`、`noteY`、三处测试断言全部移除，无死代码残留。

**Non-Goals:**

- 不改首次同意门文案、`safety-privacy` 规格与任何隐私行为。
- 不调整网格、页眉带、清空入口的几何与交互。
- 不为「未来页脚内容」预留任何占位字段。

## Decisions

1. **整删 `noteY` 字段，而非保留占位**：其唯一消费点是说明绘制行；保留即死代码（违反实现后必审纪律）。替代方案「留字段备未来页脚」被拒——非必要不预留。
2. **`page-isolation.test.ts` 断言改为 `not.toContain`，另两处直接删除**：
   - `page-isolation.test.ts:11` 已有 `not.toContain(里程)` 的隔离断言风格，把说明文案翻转为 `not.toContain` 是零成本的移除回归锁，与文件风格一致。
   - `clear-entry.test.ts:25` 的 `noteDraws` 块断言说明位于页脚带（`journal-clear-top-right` 1.2 的遗留验证），说明消失后整块失去意义，删除。
   - `journal-layout.test.ts:10-11` 的 `noteY` 几何断言随字段一并删除。
3. **文案入口 `COPY.localOnly` 直接删除**：已核对 `FLOATING_COPY` 与全仓无其他引用，无悬挂风险。
4. **与在途变更的归档兼容**：本变更 delta（REMOVED「本机说明」）与 `journal-clear-top-right` delta（MODIFIED「清空整本手帐」）作用于 `journal` 规格的不同需求，归档顺序无关；但 `journal-clear-top-right` 的 design.md 中「页脚仅保留说明」表述会过时，属叙事性陈旧，不构成归档冲突，不代改他人变更文档。

## Risks / Trade-offs

- [并行编辑冲突] `app-overlay-painter.ts` / `game.ts` 正被其他在途工作编辑 → 实现前重读工作区版本，Edit 前逐文件刷新；只动本变更涉及行。
- [用户感知隐私提示减少] 页脚不再重复「仅本机」陈述 → 首次同意门仍完整呈现承诺，属有意的产品取舍（见 proposal Why）。
- [归档前规格与代码短暂不一致] 主 specs 仍含「本机说明」需求直到归档 → 变更完成即提示归档，缩短窗口。

## Migration Plan

纯 UI 删除，无数据/存储/网络影响，无迁移与回滚策略需要；回滚即还原本变更的代码与规格删除。
