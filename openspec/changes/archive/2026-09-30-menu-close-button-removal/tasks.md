## 1. 移除菜单 × 关闭按钮（保留右滑与遮罩点按关闭）

- [x] 1.1 `menu-layout` 删 `closeRect`，`paintMenu` 删 × 绘制，`game.ts` 删 closeRect 命中分支；测试的「点 × 关闭」helper 改为遮罩点按关闭、菜单文案断言去掉 ×；`npm run verify` 全绿
- [x] 1.2 模拟器复核：菜单面板右上无 ×、遮罩点按/右滑照常关闭；审查改动面
