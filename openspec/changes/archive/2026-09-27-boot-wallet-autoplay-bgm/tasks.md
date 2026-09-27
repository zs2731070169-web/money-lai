# tasks：冷启动直入钱包 + BGM 自动起播

- [x] 1 新增 tests/boot/launch-behavior.test.ts（冷启动直入/自动起播/手势降级三组断言），运行确认先红
- [x] 2 game.ts：删 gamePhase 与标题分支、paintTitleScreen 引用；start() 增冷启动 tryUnlockAudio；快照增 audioUnlocked/bgmPlaying
- [x] 3 overlay-painter.ts 删 paintTitleScreen 死代码（仅动该函数，不碰在途 meta-side-drawer 改动）
- [x] 4 MainActivity 关闭 mediaPlaybackRequiresUserGesture
- [x] 5 frame-smoke / tap-routing 热身触摸注释更新
- [x] 6 npm test + tsc（零新增错误）+ 构建部署安卓真机验证
- [x] 7 规格增量同步主规格，变更归档
