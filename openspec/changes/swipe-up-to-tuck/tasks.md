## 1. 状态机（测试先行）

- [x] 1.1 `tests/letter/burning-state.test.ts`：新增「确认只回展示位不收好」「beginTuck/endTuck 达位移/速度阈值进入 settle」「未达阈值 300ms 弹回展示位文字不丢」「tuck 拖拽跟手阻尼 0.85」断言；全绿
- [x] 1.2 `src/core/letter/burning-state.ts`：`finishEditing` 撤销 settle 参数；恢复 drag/rebound 相位与 `beginTuck/endTuck`（沿用旧甩出阈值与回弹曲线，出口从燃烧改为 settle）

## 2. 编排与端到端

- [x] 2.1 `src/core/game.ts`：展示位触点双路径（点按再编辑 / 上拖收好）；wantsStat 计算移到 endTuck 成功时
- [x] 2.2 `tests/letter/letter-flow.test.ts`：确认→展示位→上滑→settle→保存→统计→复位全链路；确认不落库断言；`tests/menu/menu-navigation.test.ts` 收好打断用例改上滑入口

## 3. 验收与收口

- [x] 3.1 `npm run verify` + `openspec validate swipe-up-to-tuck --strict` 全绿；`npm run launch` 模拟器实测确认停留/取消停留/上滑收好/未达阈值弹回，记录 QA 清单
- [ ] 3.2 用户手感验收通过后归档本变更并推送
