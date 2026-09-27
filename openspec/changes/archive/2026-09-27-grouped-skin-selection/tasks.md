# tasks：皮肤分组与双槽位

- [x] 1 状态层 TDD（先红后绿）：`skins.test.ts` 双槽切换语义（钱包覆盖/纸币换槽/再选取消/未解锁拒绝）+ `game-state.test.ts` 旧档 activeSkin 迁移与新形态校验，实现 `game-state.ts` 拆槽 + `skins.ts` 切换语义至全绿
- [x] 2 布局与画师：`overlay-layout.ts` 皮肤页分组几何（节锚点 + 卡高自适应计入标题占位）+ `drawer-layout.test.ts` 分组断言；`overlay-painter.ts` skinId 配对 + 节标题绘制
- [x] 3 编排取色点：`game.ts` 六处取色/判定按槽位（钱包皮革×2/翻盖缓存键/纸币染色×2/皮肤页 active），`npm test` 本变更文件全绿
- [x] 4 部署走查：安卓真机 + iOS 模拟器，用户确认「钱包焦糖棕 + 纸币藕荷同时生效、再点藕荷恢复原色」后勾选
