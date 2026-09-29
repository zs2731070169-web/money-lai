## Why

没写字就收好的信纸目前会写入手帐、累加心里话里程、解锁「留白」成就并调用匿名计数——一条空白记录既没有倾诉内容也没有回看价值，还稀释了里程与统计的可信度。用户实测反馈：空白信保存到手帐里没有意义，已确认取舍为**完全无痕**（并非只停手帐记录）：空白信收好等于什么都没发生，信纸安静收掉即复位。

## What Changes

- 空白信（确认收好时文字为空）MUST NOT 产生任何结算副作用：不写入手帐、不收集图鉴资产、不累加心里话里程、MUST NOT 解锁任何成就、MUST NOT 调用匿名计数端点、不显示统计句；收好动画与音频反馈照常完成后直接安静复位。
- 退役「留白」成就（首次空白心里话）：从成就目录与成就判定中移除；已解锁的存量成就 id 保留在本机状态中不清除、不再在成就页展示。
- 历史数据兼容：已落库的空白手帐记录不清除，网格中仍可正常展开查看（仅展示纸面与日期）。
- 收好节奏统计基数 `statCadenceCount` 只随有文字的收好递增，奇数节奏公式的分母口径随之只计有效倾诉。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `journal`：「确认收好自动入帐」需求改为仅文字非空的信纸入帐；「空白记录」场景替换为「空白收好不入帐」。
- `letter-burning`：书写主循环的「空白明信片」场景改为空白可正常收好但不留任何痕迹；「确认收好主路径」明确空白确认完成同样动画但 MUST NOT 触发保存、计数或统计句。
- `anonymous-burn-count`：「匿名增量计数」需求改为仅写有文字的信纸发送增量；新增空白不计数场景。
- `meta-progression`：「倾诉成就」例举移除「首次空白心里话」，并明确退役成就的存量记录保留不展示。

## Impact

- `src/core/game.ts`：拖拽释放收好分支——空白时 `wantsStat` 强制为 false；`'save'` effect 空白时不进入 `completePostcard` 结算/落库/计数，直接走复位路径。
- `src/core/journal/journal-state.ts`：`settleCompletedPostcard` 移除 `completedBlank` 传参（结算不再产生留白成就判定）。
- `src/core/meta/postcard-progress.ts`：`LETTER_ACHIEVEMENTS` 移除 `first-blank`；`evaluateAchievementIds` 移除 `completedBlank` 选项。
- `src/core/content/copy.ts`：移除 `ACHIEVEMENT_COPY['first-blank']`（留白）文案。
- 测试：letter-flow（空白链路、节奏与离线计数降级）、journal-state、menu-navigation、page-isolation、成就/里程相关用例同步改写；新增空白无痕红测试。
- worker 聚合端点无改动（纯整数聚合，天然兼容）。
- 已解锁 `first-blank` 的存量状态文件无迁移必要（多余 id 无害，成就页按目录渲染）。
