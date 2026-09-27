# Tasks: daytime-comfort-baseline

## 1. 测试先行（红）

- [x] 1.1 `audio-regression.test.ts` 快照镜像：bgm {14, 2, 7, melodyCeilingMidi: 60, 0.095} + 新增 sfxBus {busGain: 0.6}
- [x] 1.2 BGM 计划器级顶棚断言：旋律发声音高 ≤ C4
- [x] 1.3 `draw-judgment.test.ts` 比例断言按 0.75 增益修正
- [x] 1.4 `tap-routing.test.ts` 开盖等待帧 75→120
- [x] 1.5 跑测确认红

## 2. 实现（绿）

- [x] 2.1 `parameters.ts`：bgm 四参 + melodyCeilingMidi + sfxBus 段（接口注释齐备）
- [x] 2.2 `engine.ts`：SFX 增益总线节点（0.6）串入总线链；`startBgm` 传 C4 顶棚给计划器
- [x] 2.3 `flap-state.ts`：WALLET_FLAP_FOLD_OPEN/CLOSE_DURATION_MS → 1680/1520
- [x] 2.4 `draw-judgment.ts`：CASH_DRAW_DRAG_GAIN = 0.75 乘入拖拽增量
- [x] 2.5 `npm test` 全量绿 + `npx tsc --noEmit`

## 3. 收尾

- [x] 3.1 主规格同步（procedural-audio BGM 需求）+ validate + 归档 + 推送 main
- [x] 3.2 模拟器部署：听感（低八度慢速稀疏）+ 手感（慢开合、粘抽钞）验收
- [x] 3.3 同步特性分支（日间剖面参数对齐，夜间本就同值）并推送
