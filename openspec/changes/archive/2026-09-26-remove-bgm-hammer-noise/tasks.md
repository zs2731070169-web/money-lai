# tasks：移除 BGM 琴槌瞬态噪声

- [x] 1 tests/audio/bgm.test.ts 新增「琴槌噪声路径已移除」用例（低音单音 + 1.4~1.8kHz 带能量断言），运行确认先红
- [x] 2 bgm-player.ts 删琴槌噪声整块与 `sharedNoiseBuffer` 参数、头注释更新，engine.ts updateBgm 调用点去参
- [x] 3 npm test 全绿 + npx tsc --noEmit 通过（红用例转绿）
- [ ] 4 构建部署到模拟器，用户实听确认「莎莎」声消失且钢琴感仍在后勾选
- [x] 5 MODIFIED 同步进 openspec/specs/procedural-audio 主规格，变更目录归档
