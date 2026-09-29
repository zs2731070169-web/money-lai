## 1. 回归测试先行（红）

- [ ] 1.1 `tests/letter/letter-flow.test.ts`：改写空白收好链路用例——空白确认收好后手帐记录数不变、里程不变、`collectedPatternIds` 不变、`achievementIds` 不变、匿名计数适配器未被调用、无统计句，收好动画照常完成并复位；先跑 `npx vitest run tests/letter` 确认失败
- [ ] 1.2 成就目录用例：`LETTER_ACHIEVEMENTS` 不含 `first-blank`、成就页绘制文案不含「留白」；先跑确认失败

## 2. 最小实现（绿）

- [ ] 2.1 重读工作区当前 `src/core/game.ts` 与 letter-state 现行版本（并行在途变更为基线）后：drag 释放收好分支空白时 `wantsStat` 置 false；`consumeEffects` 的 `'save'` 分支空白时保留 `settleLongNote`、跳过 `completePostcard()` 直接执行换张复位；跑 `npx vitest run tests/letter tests/journal` 转绿（含 1.1）
- [ ] 2.2 `settleCompletedPostcard` 删除 `completedBlank` 传参；`postcard-progress.ts` 删 `first-blank` 目录项与 `evaluateAchievementIds` 的 `completedBlank` 选项；`copy.ts` 删 `ACHIEVEMENT_COPY['first-blank']`；受影响调用点与既有测试（menu-navigation、journal-state、page-isolation 成就断言）同步；跑 `npm test` 除在途红外全绿（含 1.2）

## 3. 回归与验收

- [ ] 3.1 跑 `npm run verify`（失败集与基线一致：仅 `clear-write-guards` 在途红）、`npm run verify:specs`、`openspec validate blank-tuck-no-trace --strict --no-interactive` 全部通过（构建链因测试步中止时显式补跑 `npm run build` 与 `npm run audit:release`）
- [ ] 3.2 `npm run launch` 模拟器实测：写一句话收好 → 手帐 +1、里程 +1、统计句按奇数节奏出现；空白收好 → 动画与收好音照常、无统计句、手帐/里程/图鉴/成就全不变、成就页无「留白」；随后实现后审查（改动面无死代码、未接线引用、命名注释缺口）并复跑 `npx vitest run tests/letter tests/journal`
