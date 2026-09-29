## 1. 回归测试先行（红）

- [x] 1.1 在 `tests/journal/` 新增 `journalClearRect` 几何测试：402×874、safeTop 62 下断言矩形位于页眉带内（`top < 134`）、右缘贴安全区（`left + width ≈ 402`）；先跑 `npx vitest run tests/journal` 确认失败
- [x] 1.2 新增绘制位置测试：记录坐标的 `fillText` 桩断言「清空整本手帐」绘制在页眉带纵带（y < 134）内，且页脚带（y > 874 - 34 - 70）不再出现该文案、「这些东西只在这台设备上。」仍在页脚；先跑确认失败

## 2. 最小实现（绿）

- [ ] 2.1 重读当前 `src/core/render/app-overlay-painter.ts` 与 `game.ts`（工作区在途版本为基线）：`journalClearRect` 改签名 `(width, safe)` 并返回右上角矩形（128×48，`top = safe.top + 10`，右缘贴安全区）；跑 1.1 转绿
- [ ] 2.2 `paintJournal` 删除页脚入口绘制、在页眉带右上以右对齐 16px 补画（alpha 沿用有无记录语义），`game.ts` 命中调用点同步新签名；跑 `npx vitest run tests/journal` 全绿（含 1.2 与 page-isolation 既有断言）

## 3. 回归与验收

- [ ] 3.1 跑 `npm run verify`（import 审计 + 全量测试 + 构建 + 发行审计）全绿
- [ ] 3.2 `npm run launch` 后模拟器验收：手帐页右上角可见「清空整本手帐」且与标题/返回同层；滚动全程不被遮挡；点按弹出系统确认框、取消后记录不变；截图核对
- [ ] 3.3 实现后审查：改动面内无死代码、未接线函数、命名与注释缺口，当场清理后复跑 `npx vitest run tests/journal`
