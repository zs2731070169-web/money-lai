# tasks：翻盖四角锯齿修复（离屏遮罩三段式）

- [x] 1 新增 tests/render/flap-mask-pipeline.test.ts：三段式调用序列断言（destination-in 遮罩段存在、内容段无 clip、合成 drawImage 一次），运行确认先红
- [x] 2 wallet-painter.ts 重构 paintFlapWithStrips 为离屏三段式（内容段/遮罩段/合成段），移除轮廓 clip；WalletPaintOptions 增暂存面入参
- [x] 3 game.ts 持有并按尺寸复用翻盖暂存面，传入渲染调用；降级路径不动
- [x] 4 npm test + npx tsc --noEmit（本变更文件零新增错误）
- [x] 5 部署模拟器：开盖/闭合两态原生分辨率截图，四角放大验证无台阶、过渡像素连续；对照钱包体角
- [x] 6 变更目录归档
