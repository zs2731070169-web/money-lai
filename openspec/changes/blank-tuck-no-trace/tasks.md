## 1. 回归测试先行（红）

- [x] 1.1 `tests/letter/letter-flow.test.ts`：改写空白收好链路用例——空白确认收好后手帐记录数不变、里程不变、`collectedPatternIds` 不变、`achievementIds` 不变、匿名计数适配器未被调用、无统计句，收好动画照常完成并复位；先跑 `npx vitest run tests/letter` 确认失败（另：偶数节奏用例的种子与收好文本改非空，保持节奏覆盖不依赖空白收好）
- [x] 1.2 成就目录用例：`LETTER_ACHIEVEMENTS` 不含 `first-blank`、成就页绘制文案不含「留白」；先跑确认失败（红于目录用例；`evaluateAchievementIds` 去 `completedBlank` 断言在实现前即绿属预期——判定分支按入参走）

## 2. 最小实现（绿）

- [x] 2.1 重读工作区当前 `src/core/game.ts` 与 letter-state 现行版本（并行在途变更为基线）后：drag 释放收好分支空白时 `wantsStat` 置 false；`consumeEffects` 的 `'save'` 分支空白时保留 `settleLongNote`、跳过 `completePostcard()`，复位 effect 照常换张（不重复 increment cycleId）；跑 `npx vitest run tests/letter tests/journal` 转绿（含 1.1；无痕用例首启落库断言修正为校验存量内容无记录——`game.ts:194` 首启会写入初始空状态）
- [x] 2.2 `settleCompletedPostcard` 删除 `completedBlank` 传参；`postcard-progress.ts` 删 `first-blank` 目录项与 `evaluateAchievementIds` 的 `completedBlank` 选项；`copy.ts` 删 `ACHIEVEMENT_COPY['first-blank']`；src 无 first-blank/completedBlank 残留（letter-painter 注释中的「留白」为纸面语义，无关）；`npm test` 除在途红外全绿（含 1.2；现基线仅剩 `clear-fade` 2 例为并行在途 journal-clear-top-right 第 5 节红测试，其断言与现状渲染出入属该变更范围）

## 3. 回归与验收

- [x] 3.1 跑 `npm run verify`（import 审计 + 182/182 测试 + 构建 + 发行审计全绿；等待并行 5.1 落地后一次性通过）、`npm run verify:specs`（8/8）、`openspec validate blank-tuck-no-trace --strict --no-interactive` 通过
- [x] 3.2 `npm run launch` 模拟器实测（CGEvent 驱动全流程，基线 手帐2条/里程2）：空白收好（Escape 取消→上滑）→ 动画照常、安静复位、无统计句，手帐仍 2 条、里程仍 2、成就页仅 3 行无「留白」；文字收好（硬件键键入 hi→确认→上滑）→ 手帐 +1（3 条含 hi）、里程 3、第 3 次收好按奇数节奏显示「此刻 / 1 张信纸已被收好」（计数端点对文字信正常响应）。实现后审查通过（src 无 first-blank/completedBlank 残留；letter-painter「留白」注释为纸面语义无关；tsc noUnused 门禁下无死代码）；复跑 `tests/letter tests/journal tests/meta` 54/54 全绿
