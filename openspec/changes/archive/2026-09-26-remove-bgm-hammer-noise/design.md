# design：移除 BGM 琴槌瞬态噪声

## 现状定位

- `src/core/audio/bgm-player.ts:125-147`：`scheduleGenerativePianoNote` 的第 ④ 琴槌瞬态块——共享白噪 bufferSource → 带通（melody 1800Hz / chord 1400Hz，Q 0.9）→ 增益（峰值 0.07/0.045 × velocity，3ms 起坡、0.05s 衰减至 0.01 残留至 0.12s 硬结束）。
- `src/core/audio/engine.ts:269-277`：`updateBgm` 取 `getSharedNoiseBuffer` 并作为尾参传入每个 BGM 音符。

## 方案决策

1. **整块删除而非置零保留**：琴槌路径连同 `sharedNoiseBuffer` 参数一并从 `scheduleGenerativePianoNote` 签名移除——不留死路径、不留「以后可能调回来」的开关（最小闭环）。用户已裁决完全移除。
2. **`getSharedNoiseBuffer` 保留**：开合音（wallet-clack）与抽钞摩擦音（paper-slide）仍消费同一白噪 buffer；仅 BGM 调度点停止取用。
3. **起音听感兜底**：旋律 5ms / 伴奏 14ms 线性起坡本身已具备击弦快攻特征，分音独立衰减 + 刚性失谐 + 双弦拍频（①②③）承担钢琴质感识别，不引入替代瞬态（换非噪声起音方案已被否决）。
4. **参数落库不动**：琴槌参数是 bgm-player 内联常量，从未进入 `AUDIO_SYNTHESIS_PARAMETERS`，参数快照与镜像测试零改动。

## 测试策略（先红后绿）

在 `tests/audio/bgm.test.ts` 新增用例「琴槌噪声路径已移除」：

- 离线渲染单个低音伴奏音（MIDI 36 根音 C2≈65.4Hz，时长 0.5s，干声直连 destination、无混响）——该音分音最高 4×65.4≈262Hz，与测带完全分离，排除谐音泄漏误报。
- 对渲染结果测 1.4~1.8kHz 带能量（Goertzel 单点 ×3 频点），断言带内 RMS < 1e-4。
- 当前实现下琴槌带通中心 1400Hz 落在测带内 → 必红；删除路径后 → 绿。
- 既有「淡入起播：有声、峰值 ≤0.9、无 NaN」用例继续兜住有声性与防爆回归。

## 回归验证入口

- `npm test`（全量 vitest，含 BGM 离线渲染与音频回归）
- `npx tsc --noEmit`（vitest 不做类型检查，签名变更由 tsc 兜住 engine.ts 调用点）
