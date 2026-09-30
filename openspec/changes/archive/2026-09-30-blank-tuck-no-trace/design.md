## Context

收好链路现状：拖拽释放处按 `statCadenceCount + 1` 预算 `wantsStat` 并调 `endTuck`；letter-state 依次发出 `'save'`（→ `settleLongNote` 音 + `completePostcard()`）与 `'reset'`（→ 换下一张）effect。`completePostcard()`（game.ts:402）构建 entry 后一次性完成 `settleCompletedPostcard`（入手帐、里程+1、图鉴收集、成就判定、`statCadenceCount`+1）、落库、`incrementAnonymousBurnCount()` 与统计句 resolve。空白成就 `first-blank` 由 `journal-state.ts:105` 的 `completedBlank: text.length === 0` 触发。工作区正被 swipe-up-to-tuck、clear-write-guards 等在途工作高频编辑，实现前必须重读基线。

## Goals / Non-Goals

**Goals:**

- 空白信收好 = 零结算副作用：无手帐记录、无里程、无图鉴收集、无成就、无匿名计数、无统计句；动画与音频反馈照常，随后安静复位。
- 「留白」成就从目录、判定与文案三处退役；存量解锁 id 不清理、不再展示。
- 历史空白手帐记录原样保留可回看。

**Non-Goals:**

- 不改空白判定口径（维持 `text.length === 0`，纯空格仍视为有文字——现状语义不在本变更重定义）。
- 不改 worker 聚合端点与统计句文案/节奏公式（奇数节奏基数自然只计有效倾诉）。
- 不做任何存量状态迁移或清理。

## Decisions

1. **拦截点在 game.ts 编排层，不动 settle 纯函数**：`settleCompletedPostcard` 若在内部吞掉空白，外层仍会执行落库、匿名计数与统计 resolve，拦不干净；在 `'save'` effect 处理处置空分流一处收口——空白时保留 `settleLongNote`（规格要求音频反馈照常）、跳过 `completePostcard()`、直接执行与 `'reset'` 相同的换张逻辑。同时 drag 释放处 `wantsStat` 对空白强制 false，让 letter-state 走既有「跳过统计」时序，无需状态机改动。
2. **`first-blank` 三处同删**：`LETTER_ACHIEVEMENTS` 目录、`evaluateAchievementIds` 的 `completedBlank` 选项、`ACHIEVEMENT_COPY['first-blank']` 文案。`settleCompletedPostcard` 随之删去 `completedBlank` 传参。存量 `achievementIds` 中的 `first-blank` 保留（成就页按目录渲染，自然不展示；清用户状态违反最小改动）。
3. **图鉴收集随整段结算跳过**：空白信没有"收好这张资产"的事实，跳过是正确语义；选择器「优先未收集」逻辑天然兼容——空白收过的资产下次仍会被优先抽出，等于没抽过。
4. **`statCadenceCount` 不需要单独处理**：它只在 settle 内 +1，空白不再 settle 即自动只计有效倾诉。
5. **规格表述与既有「收好保存与唯一落点反馈」不冲突**：空白无保存即无落点反馈，菜单 0.8s 微光只随真实保存出现。

## Risks / Trade-offs

- [既有测试重写面较大] letter-flow/menu-navigation/journal-state 的空白分支断言（写入、解锁、计数降级）需成组改写 → 任务 1 先改红、任务 2 逐项转绿，防止半改状态。
- [并行在途冲突] letter-state 与 game.ts 正被多个变更编辑 → 实现前重读工作区版本，Edit 失败即刷新重试，只动本变更行。
- [用户习惯落差] 过去空白收好也弹统计句与微光，现在安静复位 → 产品有意取舍（proposal Why），模拟器验收确认复位动画顺滑不显突兀。

## Migration Plan

纯行为收紧，无数据迁移：存量空白手帐记录继续展示；存量 `first-blank` 解锁 id 留在状态文件。回滚即还原代码与规格（无状态回滚需求）。
