# tasks：抽钞抓取沙响柔化

- [x] 1 参数落档（先红后绿）：`parameters.ts` 的 `paperGrabRustle` 改为 peakGainMin 0.07 / peakGainMax 0.12 / lowpassHertz 3400，快照镜像同步为红→绿，`paper-slide.ts` 频带注释更正，`npm test` 全绿即验证
- [x] 2 构建部署 iPhone 17 模拟器，用户复听确认「不吵不刺」后勾选
