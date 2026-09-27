# 提案：抽钞抓取沙响柔化（实测反馈：太大、太刺耳）

## Why

v2.6.2「一抓一声」上机实测后，用户反馈抓取瞬间的沙沙声**音量太大、听感刺耳**。这是 `single-grab-rustle` 变更任务 2（用户实听确认）回路的结论：机制（一抓一声、拖拽安静）成立，但响度与音色需要压下来。

## What Changes

只动 `paperGrabRustle` 三参数（其余抽钞链路音色不动）：

| 参数 | 旧值 | 新值 | 依据 |
|---|---|---|---|
| `peakGainMin` | 0.12 | 0.07 | 「太大」：慢抓下限增益约 -4.7dB |
| `peakGainMax` | 0.2 | 0.12 | 「太大」：快抓上限增益约 -4.4dB，快/慢梯度保留 |
| `lowpassHertz` | 5000 | 3400 | 「刺耳」：削掉 3.4k~5k 顶频毛刺，回归「纸贴皮革偏闷」音色定位 |

同步项：

- `tests/audio/audio-regression.test.ts` 参数快照镜像同步（调音必改快照）。
- `src/core/audio/paper-slide.ts` 头注释频带描述更正为实际值（原注释 HP900+LP5k 与实参 HP600+LP5k 本就不符，趁改频带一并修正为 HP600+LP3.4k）。

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
（无——「一抓一声、速度敏感、无瞬态边沿」行为契约不变，属纯参数调优，`skip_specs: true`）

## Impact

- 代码：`src/core/audio/parameters.ts`（仅 `paperGrabRustle` 段）、`src/core/audio/paper-slide.ts`（仅注释）。
- 测试：`tests/audio/audio-regression.test.ts` 快照镜像；既有离线渲染断言（峰值 >0.02 可闻、≤0.9 防爆、快抓响于慢抓、时长 60~350ms）继续约束新值。
- 不动：触发端速度归一化（`game.ts` `/1400`）、`milestoneTok`、`paperReleasePuff`、母带总线。
