# 移除 BGM 琴槌瞬态噪声

## Why

设备实测反馈：生成式钢琴 BGM 中一直存在「莎莎莎」的噪声，用户定位并裁决根因为琴槌瞬态本身——每个音符起音时的带通白噪敲击（melody 中心 1800Hz / chord 1400Hz，峰值 0.07/0.045），正处手机扬声器最敏感的中高频带，叠加 ~1-2 音/秒的音符密度形成连续沙沙层。方向经用户确认：完全移除，不做减弱保留。

## What Changes

- 删除 BGM 钢琴声部的琴槌噪声起音路径（`scheduleGenerativePianoNote` 内白噪 bufferSource + 带通 + 增益整块），并从其签名移除 `sharedNoiseBuffer` 参数。
- 钢琴质感保留其余三声学特征：分音独立衰减、刚性失谐、同音双弦微失谐拍频；旋律 5ms / 伴奏 14ms 快起音不变。
- `engine.ts` 的 BGM 调度点不再取用共享白噪 buffer（该 buffer 仍供开合音、抽钞摩擦音等操作音效使用，不受影响）。
- 主规格「生成式钢琴 BGM」音色约束由「高次分音与琴槌瞬态的高频能量克制」改为「音符起音 MUST NOT 含噪声成分」，并新增无噪声起音审查场景。

## Capabilities

### Modified Capabilities
- `procedural-audio`: 「生成式钢琴 BGM」需求移除琴槌瞬态表述、新增起音无噪声场景。

## Impact

- `src/core/audio/bgm-player.ts`：删琴槌块、签名去参、头注释更新。
- `src/core/audio/engine.ts`：`updateBgm` 调用点去参。
- `tests/audio/bgm.test.ts`：新增红→绿用例——单音离线渲染断言 1.4~1.8kHz 噪声带能量≈0。
- 既有 BGM 离线渲染回归（有声/防爆/无 NaN）与操作音效路径不受影响；琴槌参数本是 bgm-player 内联常量，不在 `AUDIO_SYNTHESIS_PARAMETERS`，参数快照测试无需改动。
