# Proposal: bedtime-bgm-dim-floor — 熄灭期 BGM 低音量持续

## Why（用户实测反馈）

用户实测晚安模式后的直接反馈：「优化一下，音乐不要停，只是说声音很低」。

当前行为（sleep-mode 规格「音频淡出与恢复」）：渐进熄灭开始时 BGM 与操作音效**双双淡出至完全无声**（`beginSleepDimFadeOut` 将两总线都 ramp 到 0）。用户躺下入睡的场景里，约 90s 停止交互 + 60s 渐暗后音乐彻底消失——用户要的是**音乐整夜低音量陪伴**，不是关掉。

## What Changes

- 渐进熄灭开始时：**操作音效照旧淡出至无声**（熄灭后无交互，SFX 静默语义不变）；**BGM 不再淡至 0**，而是平滑压低到新的「熄灭底板增益」`bgmDimFloorGain` 并**持续播放**（计划器照常前瞻调度，不停止、不重建）。
- 熄灭后触摸恢复：BGM/音效照旧温和淡回夜间基准音量（既有 `recoverFromSleepDimFade` 行为，不变）。
- 新参数：`AUDIO_SYNTHESIS_PARAMETERS.bedtimeArrangement.bgmDimFloorGain = 0.05`（约为夜间 BGM 基准 0.095 的一半，再压约 -6dB；可闻但明显更低）。
- 主规格 `sleep-mode`：「音频淡出与恢复」需求改写（SFX 淡出无声 / BGM 压低持续），「会话封存」中「近黑无声」措辞同步为「近黑、BGM 低音量持续」。

## Impact

- 代码：`src/core/audio/parameters.ts`（+1 参数）、`src/core/audio/engine.ts`（`beginSleepDimFadeOut` 拆分两总线目标值）。
- 测试：`tests/audio/audio-regression.test.ts`（快照镜像 +1 字段）、`tests/audio/bedtime-arrangement.test.ts`（熄灭淡出断言由「尾段无声」改为「尾段低音量且低于早期」「BGM 计划器不停止」）。
- 规格：`openspec/specs/sleep-mode/spec.md` 两处需求 MODIFIED。
- 不动：日间 BGM、熄灭阈值/渐暗时间线、会话封存/早安卡数据面、恢复行为。
