## 1. 回归测试先行（红）

- [ ] 1.1 在 `tests/journal/` 新增 `hitJournalCell` 页眉带命中测试：402×874、safeTop 62、10 条记录、滚动 200（第二行格块部分进入页眉带 62–134），断言带内坐标返回 `null`、带下可见坐标照常命中同一格块；先跑 `npx vitest run tests/journal` 确认新测试失败
- [ ] 1.2 新增 `paintAppOverlay` 网格裁剪测试：Proxy 画布桩记录 `rect`/`clip` 调用序列，滚动 200 时断言存在 `rect(0, 134, 402, 740)` 且紧随 `clip`；先跑 `npx vitest run tests/journal` 确认失败

## 2. 最小实现（绿）

- [ ] 2.1 重读当前 `src/core/render/app-overlay-painter.ts`（以工作区在途版本为基线，不碰展开详情层），在 `paintJournal` 网格循环外包 `save/beginPath/rect/clip`，裁剪盒为 `headerRect` 底缘以下；跑 `npx vitest run tests/journal` 确认 1.2 通过
- [ ] 2.2 `hitJournalCell` 对 `y < headerRect.top + headerRect.height` 直接返回 `null`；跑 `npx vitest run tests/journal` 确认 1.1 通过且既有手帐测试全绿

## 3. 回归与验收

- [ ] 3.1 跑 `npm run verify`（import 审计 + 全量测试 + 构建 + 发行审计）全绿
- [ ] 3.2 `npm run launch` 后在模拟器滚动手帐网格：缩略图从页眉带下缘滑出，标题/顶部装饰/左上返回全程不被遮挡，banner 内点按不展开记录；截图核对
- [ ] 3.3 实现后审查：检查改动面内无死代码、未接线函数、命名与注释缺口，当场清理后复跑 `npx vitest run tests/journal`
