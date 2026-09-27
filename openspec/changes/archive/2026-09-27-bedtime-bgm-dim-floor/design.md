# design：熄灭期 BGM 低音量持续

## 关键决策

1. **只改 `beginSleepDimFadeOut` 的目标值，不动播放状态**：现状 BGM 在熄灭淡出期间
   本就持续调度（`bgmPlaying` 保持 true、计划器照常前瞻），仅总线增益被 ramp 到 0——
   所以「持续播放」无需新机制，把 BGM 总线的 ramp 终点从 0 改为底板增益即可。
   SFX 总线维持 ramp 到 0（熄灭后无交互，静默语义不变）。
2. **底板增益取 `bgmDimFloorGain = 0.05`**：夜间 BGM 基准 0.095 的约一半（再压约
   -6dB）——回应「只是说声音很低」：比夜间基准明显更低，但钢琴分解和弦仍清晰可闻。
   放入 `bedtimeArrangement`（熄灭底板是晚安编排专属概念，不污染日间 `bgm` 段）。
3. **恢复路径零改动**：`recoverFromSleepDimFade` 已把 BGM ramp 回
   `resolveBgmArrangement().bgmBusGain`（夜间基准），触摸恢复语义自动成立。
4. **时长复用 `dimFadeOutSeconds`（60s）**：底板压低与画面渐暗同一条时间线，不新增
   淡入淡出时长参数。

## 测试策略（先红后绿）

- `tests/audio/audio-regression.test.ts`：参数快照镜像 `bedtimeArrangement` 增加
  `bgmDimFloorGain: 0.05`（调参必改快照的项目纪律）。
- `tests/audio/bedtime-arrangement.test.ts` 熄灭用例改写：
  - 尾段 RMS 断言由「< 0.0005（无声）」改为「> 0.0005（可闻）且 < 早期 RMS（明显更低）」；
  - 断言底板目标与参数一致：熄灭后 `bgmBusGainNode` 增益终值 ≈ `bgmDimFloorGain`；
  - SFX 总线仍 ramp 到 0（音效淡出无声语义保持）。
- 真机验收：模拟器进晚安模式 → 静置约 2.5 分钟听 BGM 压低后持续不消失 → 触摸恢复音量。

## 风险与边界

- 长时间前台播放：iOS 前台音频会话整夜持续属预期用途（睡眠陪伴）；进后台仍走既有
  `handleAppVisibilityChange → stopBgm` 淡出暂停，回前台恢复，不受本改动影响。
- 会话封存时点（熄灭完成）与音频无耦合：封存仅读熄灭时间线，不依赖音频静默，零回归面。
