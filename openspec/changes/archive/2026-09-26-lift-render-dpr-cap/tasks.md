# tasks：渲染 DPR 上限 2→3 + 圆角与纹理分辨率

- [x] 1 tests/adapters/render-scale.test.ts 新增 resolveRenderScale 纯函数用例，运行确认先红
- [x] 2 web.ts 实现 resolveRenderScale 并接入 syncCanvasSize，清理失效注释
- [x] 3 票面圆角 2→6pt；翻盖纹理按渲染尺度建缓存；条带源重叠补偿
- [x] 4 npm test + npx tsc --noEmit 通过
- [x] 5 部署模拟器截图对比圆角（台阶消失，物理分辨率验证：半径 18px 连续抗锯齿）
- [x] 6 变更目录归档
