# tasks：回退 fix-flap-corner-aliasing

- [x] 1 wallet-painter.ts 恢复轮廓 clip + 单段条带实现，移除暂存面入参与 computeFlapScratchLogicalSize
- [x] 2 game.ts 移除暂存面缓存/接线
- [x] 3 删除 flap-mask-pipeline.test.ts，恢复 flap-seams / diagnose-flap 原断言
- [x] 4 npm test 回到回退前基线（196/197，唯一失败为在途 meta-side-drawer 既有）
- [x] 5 重新构建部署模拟器，确认翻盖渲染与手感恢复
- [x] 6 变更归档
