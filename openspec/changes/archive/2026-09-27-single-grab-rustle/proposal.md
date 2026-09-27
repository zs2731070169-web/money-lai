# 提案：抽钞摩擦音改为一抓一声（实测反馈：不要持续、也不要断续）

## Why

实测反馈：拖动纸币时的沙沙声不应一直持续，也不应断断续续重复——手指按住拖动的整个过程只出现「一次」短暂的沙响。现实现（PaperSlideVoice 持续声床 + 逐帧速度调制）与目标不符；持续声床是合成器思维，真实纸币被捏住滑动的一瞬才有一声沙响。

## What Changes

- 抓取纸币后的首次移动瞬间，播放唯一一次 ~80ms 带通噪声沙响（亮度/峰值随该时刻速度微调）；拖拽全程 MUST NOT 再出现任何摩擦声（无持续、无反复）。
- 松手收尾轻响（~100ms）保留。
- PaperSlideVoice 持续 voice 与 start/update/stop 三个引擎 API 退役，替换为 playPaperGrabRustle(速度)。

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
- `procedural-audio`: 「速度敏感的抽钞摩擦音」改写——拖拽期间 SHALL 仅在开始时出现一次短暂沙响，MUST NOT 持续或反复。

## Impact

- 代码：src/core/audio/paper-slide.ts（重写为一次性瞬态）、engine.ts（API 更新）、parameters.ts（paperSlide 段替换为 paperGrabRustle）、game.ts（首次移动触发）、测试与参数快照重写。
