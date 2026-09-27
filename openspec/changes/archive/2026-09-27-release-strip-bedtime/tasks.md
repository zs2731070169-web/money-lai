# Tasks: release-strip-bedtime

- [x] 1. 变更文档（skip_specs：撤销后无规格增量）+ validate --strict
- [x] 2. `git revert --no-commit 90938ef..HEAD` 区间撤销全部睡眠提交（单提交落盘）
- [x] 3. 补落隐私文案并段（overlay-painter 常量 + 变更文档复原）
- [x] 4. 移除复原出的 bedtime-money-counting 规划文档目录
- [x] 5. `npm test` 全量 + `npx tsc --noEmit` + 推送 main
- [ ] 6. 模拟器部署验收（无晚安开关、无自动暗屏、抽屉四条目、纯日间）
