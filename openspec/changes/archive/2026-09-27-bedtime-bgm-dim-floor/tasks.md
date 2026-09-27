# Tasks: bedtime-bgm-dim-floor

## 1. 测试先行（红）

- [x] 1.1 `tests/audio/audio-regression.test.ts` 快照镜像 `bedtimeArrangement` 增加 `bgmDimFloorGain: 0.05`
- [x] 1.2 `tests/audio/bedtime-arrangement.test.ts` 熄灭用例改写：尾段 RMS 可闻且低于早期；BGM 总线终值 ≈ `bgmDimFloorGain`；SFX 总线终值为 0
- [x] 1.3 跑上述测试确认红（缺参数 / 断言失败）

## 2. 实现（绿）

- [x] 2.1 `src/core/audio/parameters.ts`：`bedtimeArrangement` 增加 `bgmDimFloorGain`（含字段注释与接口注释）
- [x] 2.2 `src/core/audio/engine.ts`：`beginSleepDimFadeOut` 拆分两总线——SFX ramp 到 0、BGM ramp 到 `bgmDimFloorGain`（渐进熄灭仅存在于晚安会话，无日间调用路径）
- [x] 2.3 `npm test` 全量绿 + `npx tsc --noEmit`

## 3. 收尾

- [x] 3.1 主规格同步（sleep-mode 两处 MODIFIED）+ `openspec validate --strict`
- [x] 3.2 归档变更目录、提交并推送
- [ ] 3.3 iOS 模拟器部署，静置听感验收（BGM 压低后整夜持续、触摸恢复）
